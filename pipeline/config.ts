export const BUCKET = process.env.BROIEST_BUCKET ?? "broiestbot";

/** Anonymous public read base. The pipeline downloads originals from here — no auth needed. */
export const PUBLIC_BASE = `https://storage.googleapis.com/${BUCKET}`;

/** GCS JSON API, also anonymous for this bucket. */
export const API_BASE = `https://storage.googleapis.com/storage/v1/b/${BUCKET}`;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://broiestmemes.com";

/** Immutable because every derivative filename embeds a content hash. */
export const DERIVATIVE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Deliberately short. GCS defaults public objects to max-age=3600, which would
 * make a freshly-written manifest invisible for an hour and stall the whole
 * "new memes appear without a deploy" loop.
 */
export const MANIFEST_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

export const VARIANT_SPECS = {
  micro: { width: 200, quality: 65 },
  thumb: { width: 400, quality: 72 },
  grid: { width: 800, quality: 75 },
  full: { width: 1600, quality: 80 },
} as const;

export const OG_SIZE = { width: 1200, height: 630, quality: 80 } as const;

/** Max width for the H.264 transcode of animated sources. */
export const VIDEO_MAX_WIDTH = 800;
