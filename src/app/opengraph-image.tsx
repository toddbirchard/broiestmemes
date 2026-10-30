import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { assetUrl } from "@/lib/assets";
import { getHome } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { SITE_NAME } from "@/lib/metadata";
import type { MemeEntry } from "@/types/manifest";

/**
 * The site-wide share card: the home page and anything without its own image
 * (404s, mostly). Category and image pages override it with their `og`
 * derivative from the pipeline.
 *
 * Rebuilt from the index on the same 300s cadence as the page, so the counts and
 * the four newest memes on the card stay current without a deploy.
 */

export const alt = `${SITE_NAME} — a browsable archive of memes, sorted by category`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori can't read woff2, which is all next/font hands out, so static TTF
// instances of the two site faces live beside this file. Traced into the
// standalone build via outputFileTracingIncludes in next.config.ts.
const OG_DIR = join(process.cwd(), "src/app/_og");
const [display, mono, mascot] = await Promise.all([
  readFile(join(OG_DIR, "BricolageGrotesque-ExtraBold.ttf")),
  readFile(join(OG_DIR, "JetBrainsMono-Regular.ttf")),
  readFile(join(OG_DIR, "mascot.png"), "base64"),
]);

// Mirrors the tokens in globals.css; the image can't read CSS variables.
const INK = "#14110f";
const INK_SUNKEN = "#0d0b0a";
const HAIRLINE = "#2e2823";
const BONE = "#ece4d8";
const DIM = "#8f8375";
const FAINT = "#5d554d";
const AMBER = "#e8a33d";

const TILE = 224;
const GAP = 14;

export default async function Image() {
  const { stats, recent } = await getHome();
  // `og` rather than `grid`: it's JPEG, and Satori can't decode WebP. A square
  // crop of its 1200x630 letterbox is only filled by memes at least 630px tall
  // and roughly square or wider; anything smaller shows up as a speck in a dark
  // box. Prefer those, topping up with whatever's newest if there aren't four.
  const fills = (e: MemeEntry) => e.kind !== "audio" && e.height >= 630 && e.aspect >= 0.8;
  const picks = [...recent.filter(fills), ...recent.filter((e) => !fills(e))].slice(0, 4);
  const tiles = picks.map((e) => assetUrl(e.derived.og.path));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "space-between",
        padding: 64,
        background: INK,
        color: BONE,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={`data:image/png;base64,${mascot}`} width={88} height={88} alt="" />
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 26, color: AMBER }}>
            gs://broiestbot/
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Bricolage Grotesque",
            fontSize: 124,
            lineHeight: 0.95,
            letterSpacing: -4,
          }}
        >
          <span>Broiest</span>
          <span>Memes</span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            fontFamily: "JetBrains Mono",
            fontSize: 20,
            color: DIM,
          }}
        >
          <span style={{ color: BONE }}>{formatCount(stats.items)} memes</span>
          <span style={{ color: FAINT }}>·</span>
          <span>{formatCount(stats.categories)} categories</span>
          <span style={{ color: FAINT }}>·</span>
          <span>{formatCount(stats.animated)} animated</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          gap: GAP,
          width: TILE * 2 + GAP,
        }}
      >
        {tiles.map((src) => (
          <img
            key={src}
            src={src}
            width={TILE}
            height={TILE}
            alt=""
            style={{
              objectFit: "cover",
              borderRadius: 4,
              border: `1px solid ${HAIRLINE}`,
              background: INK_SUNKEN,
            }}
          />
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Bricolage Grotesque", data: display, weight: 800, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 400, style: "normal" },
      ],
    }
  );
}
