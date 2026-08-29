import { z } from "zod";

/**
 * The manifest is the sole contract between the pipeline and the site. The two
 * run on different schedules from different machines, so they WILL drift
 * eventually — every read is validated with these schemas at the boundary.
 * Failing loudly at the fetch beats `undefined.width` inside a tile.
 */

/** Bump to force the pipeline to regenerate every derivative on its next run. */
export const PIPELINE_VERSION = 1;

/**
 * The full manifest is the PIPELINE'S state store — it holds every entry and is
 * what incrementality diffs against. The site never fetches it: at ~2.5MB it
 * blows past Next's 2MB fetch-cache ceiling, so every request would re-download
 * it uncached.
 *
 * The site reads three smaller derived artifacts instead, each comfortably
 * cacheable:
 *   index.v1.json      stats + 112 category summaries + the cover/recent entries
 *   c/<category>.json  one category's items (largest is smolzilla at 196)
 *   lite.v1.json       id/slug/path tuples for sitemap, /random and download checks
 */
export const MANIFEST_PATH = "_derived/manifest.v1.json";
export const INDEX_PATH = "_derived/index.v1.json";
export const LITE_PATH = "_derived/lite.v1.json";
export const categoryPath = (name: string) => `_derived/c/${name}.v1.json`;

/** Everything the pipeline writes lives under here and is never treated as a category. */
export const RESERVED_PREFIX = "_derived/";

/**
 * Source objects are exactly `<category>/<filename>` — the bucket is perfectly
 * flat, verified across all 1,902 real objects. This rejects, in order:
 * directory placeholder objects (zero-byte, name ends in `/`), anything in the
 * reserved `_`-prefixed namespace, and anything nested deeper than one level.
 */
export function isSourceObject(name: string): boolean {
  return !name.endsWith("/") && !name.startsWith("_") && name.split("/").length === 2;
}

export const VariantSchema = z.object({
  path: z.string(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
});
export type Variant = z.infer<typeof VariantSchema>;

/**
 * `still` and `animated` both render as images; `audio` is the 3 mp3s in
 * `audio/`. Keeping this a discriminant means adding kinds later is a UI
 * branch rather than a schema migration.
 */
export const MemeKindSchema = z.enum(["still", "animated", "audio"]);
export type MemeKind = z.infer<typeof MemeKindSchema>;

export const SourceMetaSchema = z.object({
  /** Full object name in the bucket, e.g. `aislop/aislop_lofiBeats.jpg`. */
  name: z.string(),
  size: z.number().int().nonnegative(),
  /** GCS-reported content type. Unreliable — 3 objects are mislabelled. Use `format`. */
  contentType: z.string(),
  /** Changes on every overwrite. The incrementality token; see pipeline/diff.ts. */
  generation: z.string(),
  md5: z.string(),
  timeCreated: z.string(),
});

export const MemeEntrySchema = z.object({
  /** `${category}/${slug}` — stable, and the site's canonical URL path. */
  id: z.string(),
  category: z.string(),
  /** Stored, not derived at read time, so URLs never move if slugify() changes. */
  slug: z.string(),
  title: z.string(),
  source: SourceMetaSchema,
  /** Sniffed by sharp from the actual bytes. Never trust source.contentType. */
  format: z.string(),
  kind: MemeKindSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** width / height. Drives the justified-row layout and reserves space (zero CLS). */
  aspect: z.number().positive(),
  frames: z.number().int().positive().optional(),
  durationMs: z.number().nonnegative().optional(),
  /** Dominant colour, `#rrggbb`. Flat fallback behind a tile before thumbhash paints. */
  color: z.string(),
  /** Base64 ThumbHash (~28 bytes) for blur-up placeholders. */
  thumbhash: z.string(),
  derived: z.object({
    micro: VariantSchema,
    thumb: VariantSchema,
    grid: VariantSchema,
    full: VariantSchema,
    og: VariantSchema,
    /** Animated only: H.264 transcode, typically 10-20x smaller than the GIF. */
    video: VariantSchema.optional(),
  }),
  pipelineVersion: z.number().int(),
});
export type MemeEntry = z.infer<typeof MemeEntrySchema>;

export const CategorySummarySchema = z.object({
  name: z.string(),
  title: z.string(),
  count: z.number().int().nonnegative(),
  animatedCount: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  /** Newest `timeCreated` in the category. Drives the NEW dot and recency sort. */
  newestAt: z.string(),
  oldestAt: z.string(),
  /**
   * Up to 4 entry ids for the collage card: [primary, secondary, secondary, hover].
   * Chosen deterministically in the pipeline so covers never flicker between runs.
   * Categories with fewer than 3 items degrade to 2-up or 1-up.
   */
  coverIds: z.array(z.string()).max(4),
});
export type CategorySummary = z.infer<typeof CategorySummarySchema>;

export const ManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  pipelineVersion: z.number().int(),
  /** Where derivatives were written. Informational; the site uses its own env var. */
  assetBase: z.string(),
  stats: z.object({
    items: z.number().int().nonnegative(),
    categories: z.number().int().nonnegative(),
    animated: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    newestAt: z.string(),
  }),
  categories: z.array(CategorySummarySchema),
  items: z.array(MemeEntrySchema),
  /** Objects that failed to decode. Surfaced in pipeline logs, excluded from the site. */
  errors: z.array(z.object({ name: z.string(), error: z.string() })).default([]),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const StatsSchema = z.object({
  items: z.number().int().nonnegative(),
  categories: z.number().int().nonnegative(),
  animated: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  newestAt: z.string(),
});

/** What the home page needs, and nothing more. */
export const IndexSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  stats: StatsSchema,
  categories: z.array(CategorySummarySchema),
  /** Full entries for every id referenced by a category's coverIds. */
  covers: z.array(MemeEntrySchema),
  /** Newest entries bucket-wide, for the Recently Added rail. */
  recent: z.array(MemeEntrySchema),
});
export type SiteIndex = z.infer<typeof IndexSchema>;

/** One category's full contents. */
export const CategoryFileSchema = z.object({
  version: z.literal(1),
  summary: CategorySummarySchema,
  items: z.array(MemeEntrySchema),
});
export type CategoryFile = z.infer<typeof CategoryFileSchema>;

/**
 * Minimal tuples for the routes that need to know *of* every entry without
 * needing its detail: sitemap, /random, and download path validation.
 */
export const LiteSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  items: z.array(
    z.object({
      c: z.string(), // category
      s: z.string(), // slug
      t: z.string(), // timeCreated
      n: z.string(), // source object name
    })
  ),
});
export type LiteIndex = z.infer<typeof LiteSchema>;
