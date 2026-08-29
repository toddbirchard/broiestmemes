import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { Metadata, Sharp } from "sharp";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import type { MemeKind } from "../src/types/manifest.ts";
import { OG_SIZE, VARIANT_SPECS, VIDEO_MAX_WIDTH } from "./config.ts";

export interface RenderedFile {
  /** Object path within the bucket, e.g. `_derived/thumb/gerald/birthday.a1b2c3d4.webp` */
  path: string;
  body: Buffer;
  contentType: string;
  w: number;
  h: number;
}

export interface DerivedResult {
  kind: MemeKind;
  format: string;
  width: number;
  height: number;
  aspect: number;
  frames?: number;
  durationMs?: number;
  color: string;
  thumbhash: string;
  files: {
    micro: RenderedFile;
    thumb: RenderedFile;
    grid: RenderedFile;
    full: RenderedFile;
    og: RenderedFile;
    video?: RenderedFile;
  };
}

function hash8(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * ThumbHash needs a small RGBA raster (<=100px per side). We render at most
 * 64px wide, which is plenty for a blur-up placeholder.
 */
async function computeThumbHash(still: Sharp): Promise<string> {
  const { data, info } = await still
    .clone()
    .resize(64, 64, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bytes = rgbaToThumbHash(info.width, info.height, data);
  return Buffer.from(bytes).toString("base64");
}

/**
 * Transcode an animated source to H.264. This is the single biggest payload win
 * in the project — GIF to MP4 routinely drops 10-20x (the 56.6MB redpanda2.gif
 * lands around 2-4MB), which is what makes the 100%-animated categories
 * (ynwa 25/25, tink 28/28) loadable at all.
 */
async function transcodeToMp4(source: Buffer): Promise<{ body: Buffer; w: number; h: number }> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");
  const dir = await mkdtemp(join(tmpdir(), "broiest-"));
  const inPath = join(dir, "in");
  const outPath = join(dir, "out.mp4");
  try {
    await writeFile(inPath, source);
    const args = [
      "-y",
      "-i",
      inPath,
      // H.264 rejects odd dimensions on BOTH axes. `-2` handles the height, but
      // the width must be rounded down to even explicitly — plenty of these GIFs
      // are odd-width (299px, 373px), and without the floor ffmpeg fails with
      // "width not divisible by 2".
      "-vf",
      `scale='2*floor(min(${VIDEO_MAX_WIDTH},iw)/2)':-2:flags=lanczos`,
      "-movflags",
      "+faststart", // moov atom first, so it streams
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "26",
      "-preset",
      "slow",
      "-an", // meme GIFs have no audio track
      outPath,
    ];
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath as string, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-4000);
      });
      proc.on("error", reject);
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`))
      );
    });
    const body = await readFile(outPath);
    const meta = await sharp(source, { animated: false }).metadata();
    const srcW = meta.width ?? VIDEO_MAX_WIDTH;
    const srcH = meta.height ?? VIDEO_MAX_WIDTH;
    // Must mirror the scale filter above exactly, or the manifest reports
    // dimensions the MP4 doesn't actually have.
    const w = 2 * Math.floor(Math.min(VIDEO_MAX_WIDTH, srcW) / 2);
    const h = 2 * Math.round(((srcH / srcW) * w) / 2);
    return { body, w, h };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Produce every derivative for one source object.
 *
 * `contentType` from GCS is deliberately ignored — 3 objects in the bucket are
 * labelled application/octet-stream but are actually JPEGs with EXIF, and
 * animated-ness cannot be inferred from a `image/gif` label either (single-frame
 * GIFs exist and PNGs may be APNG). Everything comes from sniffing the bytes.
 */
export async function derive(
  source: Buffer,
  category: string,
  slug: string,
  opts: { withVideo?: boolean; contentType?: string; filename?: string } = {}
): Promise<DerivedResult> {
  const withVideo = opts.withVideo ?? true;

  if (isAudio(opts.contentType, opts.filename)) {
    return deriveAudio(source, category, slug, opts.filename ?? slug);
  }

  const probe = sharp(source, { animated: true });
  const meta = await probe.metadata();

  const format = meta.format ?? "unknown";
  const pages = meta.pages ?? 1;
  const animated = pages > 1;

  // For animated input, `metadata().height` is the height of the whole filmstrip
  // (frame height * pages). `pageHeight` is the real per-frame height.
  const width = meta.width ?? 0;
  const height = animated
    ? (meta.pageHeight ?? Math.round((meta.height ?? 0) / pages))
    : (meta.height ?? 0);
  if (!width || !height) throw new Error(`could not determine dimensions (format=${format})`);

  // Every still derivative is rendered from the first frame. Passing animated:false
  // makes sharp decode only page 0 rather than the entire filmstrip.
  const still = sharp(source, { animated: false }).rotate();

  const stats = await still.clone().stats();
  const { r, g, b } = stats.dominant;
  const color = toHex(r, g, b);
  const thumbhash = await computeThumbHash(still);

  const aspect = Number((width / height).toFixed(4));

  async function renderWebp(name: keyof typeof VARIANT_SPECS): Promise<RenderedFile> {
    const spec = VARIANT_SPECS[name];
    const { data, info } = await still
      .clone()
      .resize({ width: spec.width, withoutEnlargement: true })
      .webp({ quality: spec.quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      path: `_derived/${name}/${category}/${slug}.${hash8(data)}.webp`,
      body: data,
      contentType: "image/webp",
      w: info.width,
      h: info.height,
    };
  }

  const [micro, thumb, grid, full] = await Promise.all([
    renderWebp("micro"),
    renderWebp("thumb"),
    renderWebp("grid"),
    renderWebp("full"),
  ]);

  // JPEG, not WebP: WebP unfurls inconsistently outside Discord, and this is one
  // small file per meme.
  //
  // Letterboxed onto a 1200x630 canvas rather than `fit: cover`. Memes are mostly
  // square-ish (the median aspect here is near 1.0) and cover-cropping to 1.9:1
  // slices the top and bottom off the joke. Scaling down only — never up — keeps
  // small sources crisp and stops a 370px GIF from producing an OG card several
  // times larger than its own `full` derivative.
  const inner = await still
    .clone()
    .resize({
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer({ resolveWithObject: true });

  const padX = OG_SIZE.width - inner.info.width;
  const padY = OG_SIZE.height - inner.info.height;
  const ogBuf = await sharp(inner.data)
    .extend({
      top: Math.floor(padY / 2),
      bottom: Math.ceil(padY / 2),
      left: Math.floor(padX / 2),
      right: Math.ceil(padX / 2),
      background: "#12100f",
    })
    .flatten({ background: "#12100f" })
    .jpeg({ quality: OG_SIZE.quality, mozjpeg: true })
    .toBuffer();
  const og: RenderedFile = {
    path: `_derived/og/${category}/${slug}.${hash8(ogBuf)}.jpg`,
    body: ogBuf,
    contentType: "image/jpeg",
    w: OG_SIZE.width,
    h: OG_SIZE.height,
  };

  let video: RenderedFile | undefined;
  if (animated && withVideo) {
    const { body, w, h } = await transcodeToMp4(source);
    video = {
      path: `_derived/video/${category}/${slug}.${hash8(body)}.mp4`,
      body,
      contentType: "video/mp4",
      w,
      h,
    };
  }

  return {
    kind: animated ? "animated" : "still",
    format,
    width,
    height,
    aspect,
    frames: animated ? pages : undefined,
    durationMs: animated ? sumDelays(meta) : undefined,
    color,
    thumbhash,
    files: { micro, thumb, grid, full, og, video },
  };
}

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|flac|aac)$/i;

function isAudio(contentType?: string, filename?: string): boolean {
  if (contentType?.startsWith("audio/")) return true;
  return filename !== undefined && AUDIO_EXT.test(filename);
}

/**
 * Audio entries (the 3 mp3s in `audio/`) get a generated placard rather than a
 * decoded frame, so every manifest entry carries the same variant shape and the
 * site never has to special-case a missing derivative. The page renders an
 * <audio controls> over the top of it.
 */
async function deriveAudio(
  source: Buffer,
  category: string,
  slug: string,
  filename: string
): Promise<DerivedResult> {
  const color = "#1c1815";
  const W = 800;
  const H = 450;

  const placard = (w: number, h: number) =>
    sharp({
      create: { width: w, height: h, channels: 3, background: color },
    });

  async function render(
    name: "micro" | "thumb" | "grid" | "full",
    width: number
  ): Promise<RenderedFile> {
    const h = Math.round((H / W) * width);
    const data = await placard(width, h).webp({ quality: 80 }).toBuffer();
    return {
      path: `_derived/${name}/${category}/${slug}.${hash8(data)}.webp`,
      body: data,
      contentType: "image/webp",
      w: width,
      h,
    };
  }

  const [micro, thumb, grid, full] = await Promise.all([
    render("micro", VARIANT_SPECS.micro.width),
    render("thumb", VARIANT_SPECS.thumb.width),
    render("grid", VARIANT_SPECS.grid.width),
    render("full", W),
  ]);

  const ogBuf = await sharp({
    create: { width: OG_SIZE.width, height: OG_SIZE.height, channels: 3, background: "#12100f" },
  })
    .jpeg({ quality: OG_SIZE.quality })
    .toBuffer();

  void filename;
  void source;

  return {
    kind: "audio",
    format: "audio",
    width: W,
    height: H,
    aspect: Number((W / H).toFixed(4)),
    color,
    // Flat placeholder — a blur-up hash of a solid rectangle is just the rectangle.
    thumbhash: "",
    files: {
      micro,
      thumb,
      grid,
      full,
      og: {
        path: `_derived/og/${category}/${slug}.${hash8(ogBuf)}.jpg`,
        body: ogBuf,
        contentType: "image/jpeg",
        w: OG_SIZE.width,
        h: OG_SIZE.height,
      },
    },
  };
}

function sumDelays(meta: Metadata): number | undefined {
  const delay = meta.delay;
  if (!delay || delay.length === 0) return undefined;
  return delay.reduce((a: number, b: number) => a + b, 0);
}
