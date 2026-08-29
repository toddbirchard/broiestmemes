import type { CategorySummary, MemeEntry, SiteIndex } from "@/types/manifest";
import { getCategoryFile, getIndex, getLite } from "./manifest";

/**
 * The single read layer over the published artifacts. Every route reads from
 * here rather than fetching JSON directly, so ordering, lookups and neighbour
 * computation stay consistent across the home page, category pages, the
 * lightbox, /random and the sitemap.
 */

/**
 * ONE canonical order, newest first, used everywhere.
 *
 * Deliberate: the lightbox traverses the client's current sort while a directly
 * visited image page has no such context. Rather than thread the active sort
 * through every link, both use this order — so prev/next means the same thing
 * whichever way you arrived.
 */
export function canonicalOrder(a: MemeEntry, b: MemeEntry): number {
  return b.source.timeCreated.localeCompare(a.source.timeCreated) || a.id.localeCompare(b.id);
}

export async function getHome(): Promise<SiteIndex> {
  return getIndex();
}

/** Cover entries for one category, tolerating ids that no longer resolve. */
export function resolveCovers(index: SiteIndex, summary: CategorySummary): MemeEntry[] {
  const byId = new Map(index.covers.map((e) => [e.id, e]));
  return summary.coverIds.map((id) => byId.get(id)).filter((e): e is MemeEntry => e !== undefined);
}

export async function getCategory(
  name: string
): Promise<{ summary: CategorySummary; items: MemeEntry[] } | null> {
  // The index is the authoritative list of what exists. Checking it first means
  // a stale or orphaned `c/<name>.json` left in the bucket can never resurrect a
  // deleted category — the pipeline prunes those too, but the site should not
  // depend on that having happened. Both fetches are cached and deduped per
  // render, so this costs nothing.
  const [index, file] = await Promise.all([getIndex(), getCategoryFile(name)]);
  if (!index.categories.some((c) => c.name === name)) return null;
  if (!file || file.items.length === 0) return null;
  return { summary: file.summary, items: [...file.items].sort(canonicalOrder) };
}

export async function getEntry(category: string, slug: string): Promise<MemeEntry | null> {
  const file = await getCategoryFile(category);
  return file?.items.find((i) => i.slug === slug) ?? null;
}

/** Prev/next within a category, in canonical order. Ends are hard stops, not wrapped. */
export async function getNeighbours(
  entry: MemeEntry
): Promise<{ prev: MemeEntry | null; next: MemeEntry | null; index: number; total: number }> {
  const found = await getCategory(entry.category);
  const items = found?.items ?? [];
  const index = items.findIndex((i) => i.id === entry.id);
  return {
    prev: index > 0 ? (items[index - 1] ?? null) : null,
    next: index >= 0 && index < items.length - 1 ? (items[index + 1] ?? null) : null,
    index,
    total: items.length,
  };
}

/** Alphabetical category neighbours, for the footer pager. */
export async function getCategoryNeighbours(
  name: string
): Promise<{ prev: CategorySummary | null; next: CategorySummary | null }> {
  const index = await getIndex();
  const i = index.categories.findIndex((c) => c.name === name);
  if (i === -1) return { prev: null, next: null };
  return { prev: index.categories[i - 1] ?? null, next: index.categories[i + 1] ?? null };
}

/** Every entry as a compact tuple — sitemap, /random, download validation. */
export async function getAllRefs() {
  const lite = await getLite();
  return lite.items;
}
