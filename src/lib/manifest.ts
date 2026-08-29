import { cache } from "react";
import {
  type CategoryFile,
  CategoryFileSchema,
  categoryPath,
  INDEX_PATH,
  IndexSchema,
  LITE_PATH,
  type LiteIndex,
  LiteSchema,
  type SiteIndex,
} from "@/types/manifest";
import { ASSET_BASE } from "./assets";

/**
 * Site-side reads of the pipeline's published artifacts.
 *
 * Server-side only — the bucket has no CORS configuration, so a browser fetch
 * of these URLs would fail outright.
 *
 * Deliberately NOT the full manifest: at ~2.5MB it exceeds Next's 2MB fetch
 * cache limit, so it would be re-downloaded uncached on every single render.
 * Each artifact here stays well under that ceiling and caches properly.
 */

const REVALIDATE = 300;

async function fetchJson(path: string, tag: string): Promise<unknown> {
  const res = await fetch(`${ASSET_BASE}/${path}`, {
    // The `manifest` tag lets the pipeline purge everything at once via
    // /api/revalidate the moment new content is published.
    next: { revalidate: REVALIDATE, tags: ["manifest", tag] },
  });
  if (!res.ok) {
    throw new Error(`fetch ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Stats, all 112 category summaries, cover entries, and the recent rail. */
export const getIndex = cache(async (): Promise<SiteIndex> => {
  // Validated at the boundary: the pipeline is a separate process on a separate
  // schedule and will eventually drift from these types.
  return IndexSchema.parse(await fetchJson(INDEX_PATH, "index"));
});

/** One category's items. Returns null for an unknown category (a 404, not an error). */
export const getCategoryFile = cache(async (name: string): Promise<CategoryFile | null> => {
  try {
    return CategoryFileSchema.parse(await fetchJson(categoryPath(name), `category:${name}`));
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
});

/** Compact tuples for sitemap, /random, and download validation. */
export const getLite = cache(async (): Promise<LiteIndex> => {
  return LiteSchema.parse(await fetchJson(LITE_PATH, "lite"));
});
