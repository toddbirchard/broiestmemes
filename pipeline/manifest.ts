import { categoryTitle } from "../src/lib/naming.ts";
import type {
  CategoryFile,
  CategorySummary,
  LiteIndex,
  Manifest,
  MemeEntry,
  SiteIndex,
} from "../src/types/manifest.ts";

/**
 * Frame ratio of the collage card's primary tile. Covers are chosen to sit close
 * to this so the mosaic reads as deliberate rather than as arbitrary crops.
 */
const COVER_TARGET_ASPECT = 4 / 3;

/**
 * Pick up to 4 cover ids for a category: [primary, secondary, secondary, hover].
 *
 * Deterministic by construction — the comparator fully orders entries and breaks
 * ties on `id`, so covers never flicker between pipeline runs. Stills are
 * preferred over animated entries because the card renders a static poster
 * anyway and a still's first frame is a more honest thumbnail.
 */
function pickCovers(entries: MemeEntry[]): string[] {
  // Audio has no frame worth showing, so it's skipped — unless that would leave
  // the category with no cover at all, which is exactly the case for `audio/`
  // itself. An all-audio category falls back to its own entries and renders the
  // labelled placard instead of an empty card.
  const visual = entries.filter((e) => e.kind !== "audio");
  const pool = visual.length > 0 ? visual : entries;

  const scored = pool
    .map((e) => ({
      id: e.id,
      // Log-ratio distance so 2:1 and 1:2 are penalised equally.
      distance: Math.abs(Math.log(e.aspect / COVER_TARGET_ASPECT)),
      animatedPenalty: e.kind === "animated" ? 1 : 0,
    }))
    .sort(
      (a, b) =>
        a.animatedPenalty - b.animatedPenalty || a.distance - b.distance || a.id.localeCompare(b.id)
    );
  return scored.slice(0, 4).map((s) => s.id);
}

export function buildCategories(entries: MemeEntry[]): CategorySummary[] {
  const byCategory = new Map<string, MemeEntry[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category);
    if (list) list.push(entry);
    else byCategory.set(entry.category, [entry]);
  }

  const summaries: CategorySummary[] = [];
  for (const [name, items] of byCategory) {
    // Categories exist only if they contain files — the two empty placeholder
    // directories in the bucket (brasil2022, coldone) simply never appear.
    if (items.length === 0) continue;
    const times = items.map((i) => i.source.timeCreated).sort();
    summaries.push({
      name,
      title: categoryTitle(name),
      count: items.length,
      animatedCount: items.filter((i) => i.kind === "animated").length,
      bytes: items.reduce((sum, i) => sum + i.source.size, 0),
      newestAt: times[times.length - 1] ?? new Date(0).toISOString(),
      oldestAt: times[0] ?? new Date(0).toISOString(),
      coverIds: pickCovers(items),
    });
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildStats(entries: MemeEntry[], categories: CategorySummary[]) {
  const newest = entries.reduce(
    (max, e) => (e.source.timeCreated > max ? e.source.timeCreated : max),
    new Date(0).toISOString()
  );
  return {
    items: entries.length,
    categories: categories.length,
    animated: entries.filter((e) => e.kind === "animated").length,
    bytes: entries.reduce((sum, e) => sum + e.source.size, 0),
    newestAt: newest,
  };
}

/**
 * Split the full manifest into the artifacts the site actually reads.
 *
 * The full manifest stays the pipeline's own state store; at ~2.5MB it exceeds
 * Next's 2MB fetch-cache ceiling, so serving the site from it would mean an
 * uncached multi-megabyte download on every render.
 */
export function buildSiteArtifacts(manifest: Manifest, recentCount = 24) {
  const byId = new Map(manifest.items.map((e) => [e.id, e]));

  const coverIds = new Set<string>();
  for (const category of manifest.categories) {
    for (const id of category.coverIds) coverIds.add(id);
  }

  const recent = [...manifest.items]
    .sort(
      (a, b) => b.source.timeCreated.localeCompare(a.source.timeCreated) || a.id.localeCompare(b.id)
    )
    .slice(0, recentCount);

  const index: SiteIndex = {
    version: 1,
    generatedAt: manifest.generatedAt,
    stats: manifest.stats,
    categories: manifest.categories,
    covers: [...coverIds].map((id) => byId.get(id)).filter((e): e is MemeEntry => !!e),
    recent,
  };

  const byCategory = new Map<string, MemeEntry[]>();
  for (const entry of manifest.items) {
    const list = byCategory.get(entry.category);
    if (list) list.push(entry);
    else byCategory.set(entry.category, [entry]);
  }

  const categoryFiles: CategoryFile[] = manifest.categories.map((summary) => ({
    version: 1 as const,
    summary,
    items: (byCategory.get(summary.name) ?? []).sort(
      (a, b) => b.source.timeCreated.localeCompare(a.source.timeCreated) || a.id.localeCompare(b.id)
    ),
  }));

  const lite: LiteIndex = {
    version: 1,
    generatedAt: manifest.generatedAt,
    items: manifest.items.map((e) => ({
      c: e.category,
      s: e.slug,
      t: e.source.timeCreated,
      n: e.source.name,
    })),
  };

  return { index, categoryFiles, lite };
}

/** Every derivative path an entry owns — used when pruning a deleted source. */
export function derivativePaths(entry: MemeEntry): string[] {
  const d = entry.derived;
  const paths = [d.micro.path, d.thumb.path, d.grid.path, d.full.path, d.og.path];
  if (d.video) paths.push(d.video.path);
  return paths;
}
