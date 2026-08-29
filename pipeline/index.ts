import { parseArgs } from "node:util";
import pLimit from "p-limit";
import { assignSlugs, prettifyTitle } from "../src/lib/naming.ts";
import {
  categoryPath,
  INDEX_PATH,
  LITE_PATH,
  MANIFEST_PATH,
  type Manifest,
  ManifestSchema,
  type MemeEntry,
  PIPELINE_VERSION,
} from "../src/types/manifest.ts";
import { PUBLIC_BASE, SITE_URL } from "./config.ts";
import { derive } from "./derive.ts";
import { fetchObject, type ListedObject, listBucket, sourceObjects, splitName } from "./list.ts";
import { buildCategories, buildSiteArtifacts, buildStats, derivativePaths } from "./manifest.ts";
import { deleteObject, fetchExistingManifest, uploadDerivative, uploadManifest } from "./upload.ts";

const { values } = parseArgs({
  options: {
    force: { type: "boolean", default: false },
    only: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    concurrency: { type: "string", default: "6" },
    "no-video": { type: "boolean", default: false },
    limit: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`
broiestmemes pipeline

  --force            reprocess everything, ignoring the previous manifest
  --only <category>  restrict to one category (never publishes or prunes)
  --limit <n>        stop after n items (smoke tests; never publishes or prunes)
  --dry-run          derive but upload nothing
  --concurrency <n>  parallel workers (default 6)
  --no-video         skip H.264 transcodes (much faster; posters only)
`);
  process.exit(0);
}

const DRY = values["dry-run"] === true;
const WITH_VIDEO = values["no-video"] !== true;
const CONCURRENCY = Math.max(1, Number(values.concurrency) || 6);

/**
 * True when this run deliberately looked at only part of the bucket. Such a run
 * must never prune and must never publish: both operations treat "absent from
 * this run" as "deleted upstream", which is false by construction here.
 */
const PARTIAL = values.only !== undefined || values.limit !== undefined;

/**
 * Sources above this size are transcoded one at a time. A single 54MB GIF peaks
 * around 620MB RSS during decode, so running a dozen of them in parallel is how
 * you OOM a small box.
 */
const LARGE_FILE_BYTES = 12 * 1024 * 1024;

const mb = (n: number) => `${(n / 1048576).toFixed(1)}MB`;
const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;

interface Plan {
  object: ListedObject;
  category: string;
  filename: string;
  slug: string;
  reason: "new" | "changed" | "version";
}

async function loadPreviousManifest(): Promise<Manifest | null> {
  if (values.force) return null;
  try {
    // Cache-buster is load-bearing. The manifest is published with
    // `max-age=60` (deliberately, so the site picks up changes fast), which
    // means a pipeline run started within a minute of the previous one would
    // read its own stale state and reprocess everything it just did.
    const raw = await fetchExistingManifest(`${PUBLIC_BASE}/${MANIFEST_PATH}?cb=${Date.now()}`);
    if (!raw) return null;
    const parsed = ManifestSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("! previous manifest failed validation; treating as a full rebuild");
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn(`! could not read previous manifest (${(err as Error).message}); full rebuild`);
    return null;
  }
}

async function main() {
  const started = Date.now();

  console.log("→ listing bucket…");
  const all = await listBucket();
  let sources = sourceObjects(all);
  if (values.only) sources = sources.filter((o) => o.name.startsWith(`${values.only}/`));
  console.log(`  ${all.length} objects, ${sources.length} source memes`);

  const previous = await loadPreviousManifest();
  const priorById = new Map<string, MemeEntry>();
  for (const entry of previous?.items ?? []) priorById.set(entry.source.name, entry);

  // Slugs are assigned per category over the CURRENT filename set, then locked to
  // whatever the previous manifest recorded. Without that pinning, adding a file
  // that collides with an existing slug could re-slug the incumbent and silently
  // break a live URL.
  const byCategory = new Map<string, ListedObject[]>();
  for (const object of sources) {
    const { category } = splitName(object.name);
    const list = byCategory.get(category);
    if (list) list.push(object);
    else byCategory.set(category, [object]);
  }

  const slugByName = new Map<string, string>();
  for (const [category, objects] of byCategory) {
    const filenames = objects.map((o) => splitName(o.name).filename);
    const assigned = assignSlugs(filenames, category);
    const taken = new Set<string>();
    // Existing entries keep their recorded slug.
    for (const object of objects) {
      const prior = priorById.get(object.name);
      if (prior) {
        slugByName.set(object.name, prior.slug);
        taken.add(prior.slug);
      }
    }
    for (const object of objects) {
      if (slugByName.has(object.name)) continue;
      const { filename } = splitName(object.name);
      let slug = assigned.get(filename) ?? filename;
      let n = 2;
      while (taken.has(slug)) slug = `${assigned.get(filename)}-${n++}`;
      taken.add(slug);
      slugByName.set(object.name, slug);
    }
  }

  // ---- diff -------------------------------------------------------------
  const plans: Plan[] = [];
  const reused: MemeEntry[] = [];
  for (const object of sources) {
    const { category, filename } = splitName(object.name);
    const slug = slugByName.get(object.name) as string;
    const prior = priorById.get(object.name);

    let reason: Plan["reason"] | null = null;
    if (!prior) reason = "new";
    else if (prior.source.generation !== object.generation) reason = "changed";
    else if (prior.pipelineVersion < PIPELINE_VERSION) reason = "version";

    if (reason) plans.push({ object, category, filename, slug, reason });
    else if (prior) reused.push(prior);
  }

  const capped = values.limit ? plans.slice(0, Number(values.limit)) : plans;

  const counts = capped.reduce<Record<string, number>>((acc, p) => {
    acc[p.reason] = (acc[p.reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `→ ${capped.length} to process (${
      Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ") || "none"
    }), ${reused.length} unchanged`
  );

  if (capped.length === 0 && !previous) {
    console.log("nothing to do and no previous manifest — exiting");
    return;
  }

  // ---- derive + upload --------------------------------------------------
  const limit = pLimit(CONCURRENCY);
  const largeLimit = pLimit(1);
  const produced: MemeEntry[] = [];
  const errors: { name: string; error: string }[] = [];
  let done = 0;
  let uploadedBytes = 0;

  await Promise.all(
    capped.map((plan) =>
      limit(async () => {
        const isLarge = plan.object.size >= LARGE_FILE_BYTES;
        const gate = <T>(fn: () => Promise<T>): Promise<T> => (isLarge ? largeLimit(fn) : fn());
        try {
          const entry = await gate(async () => {
            const buf = await fetchObject(plan.object.name);
            const result = await derive(buf, plan.category, plan.slug, {
              withVideo: WITH_VIDEO,
              contentType: plan.object.contentType,
              filename: plan.filename,
            });

            const files = Object.values(result.files).filter(Boolean);
            if (!DRY) {
              await Promise.all(files.map((f) => uploadDerivative(f)));
            }
            for (const f of files) uploadedBytes += f.body.length;

            const variant = (f: { path: string; w: number; h: number; body: Buffer }) => ({
              path: f.path,
              w: f.w,
              h: f.h,
              bytes: f.body.length,
            });

            return {
              id: `${plan.category}/${plan.slug}`,
              category: plan.category,
              slug: plan.slug,
              title: prettifyTitle(plan.category, plan.filename),
              source: {
                name: plan.object.name,
                size: plan.object.size,
                contentType: plan.object.contentType,
                generation: plan.object.generation,
                md5: plan.object.md5Hash,
                timeCreated: plan.object.timeCreated,
              },
              format: result.format,
              kind: result.kind,
              width: result.width,
              height: result.height,
              aspect: result.aspect,
              frames: result.frames,
              durationMs: result.durationMs,
              color: result.color,
              thumbhash: result.thumbhash,
              derived: {
                micro: variant(result.files.micro),
                thumb: variant(result.files.thumb),
                grid: variant(result.files.grid),
                full: variant(result.files.full),
                og: variant(result.files.og),
                video: result.files.video ? variant(result.files.video) : undefined,
              },
              pipelineVersion: PIPELINE_VERSION,
            } satisfies MemeEntry;
          });
          produced.push(entry);
        } catch (err) {
          // One unreadable object must never fail the whole run.
          errors.push({ name: plan.object.name, error: (err as Error).message });
          process.stdout.write(`\n  ! ${plan.object.name}: ${(err as Error).message}\n`);
        }
        done++;
        if (done % 10 === 0 || done === capped.length) {
          process.stdout.write(`\r  processed ${done}/${capped.length}   `);
        }
      })
    )
  );
  process.stdout.write("\n");

  // ---- assemble ---------------------------------------------------------
  const liveNames = new Set(sources.map((s) => s.name));
  const entries = [...reused.filter((e) => liveNames.has(e.source.name)), ...produced].sort(
    (a, b) => a.id.localeCompare(b.id)
  );

  const categories = buildCategories(entries);
  const manifest: Manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    assetBase: PUBLIC_BASE,
    stats: buildStats(entries, categories),
    categories,
    items: entries,
    errors,
  };

  // Validate what we're about to publish against the same schema the site reads.
  ManifestSchema.parse(manifest);

  // ---- prune ------------------------------------------------------------
  //
  // DESTRUCTIVE, and only ever correct for a run that saw the WHOLE bucket.
  //
  // Pruning infers "this was deleted upstream" from absence: anything in the
  // previous manifest but not in `sources` gets its derivatives removed. Under
  // `--only` or `--limit`, `sources` is a deliberate subset — so that inference
  // is catastrophically wrong. `--only gerald` would conclude the other 1,897
  // entries and 111 category files had been deleted and wipe every one of them.
  //
  // Same guard as the publish step below, and for the same reason.
  if (PARTIAL) {
    console.log("→ partial run (--only/--limit): pruning SKIPPED");
  } else {
    const prune = pLimit(12);

    const removed = (previous?.items ?? []).filter((e) => !liveNames.has(e.source.name));
    if (removed.length > 0) {
      console.log(`→ pruning ${removed.length} deleted source(s)`);
      if (!DRY) {
        await Promise.all(
          removed.flatMap((e) => derivativePaths(e).map((p) => prune(() => deleteObject(p))))
        );
      }
    }

    // Emptying a category leaves its `_derived/c/<name>.v1.json` behind, and the
    // site fetches those by path — so an orphan keeps a deleted category serving
    // 200 with its old contents. Delete any category file with no live category.
    const liveCategoryPaths = new Set(categories.map((c) => categoryPath(c.name)));
    const orphanCategoryFiles = all
      .map((o) => o.name)
      .filter((n) => n.startsWith("_derived/c/") && !liveCategoryPaths.has(n));
    if (orphanCategoryFiles.length > 0) {
      console.log(`→ pruning ${orphanCategoryFiles.length} orphaned category file(s)`);
      if (!DRY) {
        await Promise.all(orphanCategoryFiles.map((p) => prune(() => deleteObject(p))));
      }
    }
  }

  // ---- publish ----------------------------------------------------------
  const json = JSON.stringify(manifest);
  if (DRY) {
    console.log(`→ dry run: would upload manifest (${(json.length / 1024).toFixed(0)}KB)`);
  } else if (PARTIAL) {
    // A partial run's entry list is not the whole bucket; publishing it would
    // delete every other category from the site.
    console.log("→ partial run (--only/--limit): manifest NOT published");
  } else {
    const { index, categoryFiles, lite } = buildSiteArtifacts(manifest);
    const indexJson = JSON.stringify(index);
    const liteJson = JSON.stringify(lite);

    // State manifest first, then the artifacts the site reads.
    await uploadManifest(MANIFEST_PATH, json);
    await Promise.all([
      uploadManifest(INDEX_PATH, indexJson),
      uploadManifest(LITE_PATH, liteJson),
      ...categoryFiles.map((f) => uploadManifest(categoryPath(f.summary.name), JSON.stringify(f))),
    ]);

    const biggest = categoryFiles.reduce((max, f) => Math.max(max, JSON.stringify(f).length), 0);
    console.log(
      `→ published: manifest ${kb(json.length)} · index ${kb(indexJson.length)} · lite ${kb(liteJson.length)} · ${categoryFiles.length} category files (largest ${kb(biggest)})`
    );
    await revalidate();
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n✓ ${entries.length} entries · ${categories.length} categories · ${manifest.stats.animated} animated`
  );
  console.log(`  processed ${produced.length}, reused ${reused.length}, errors ${errors.length}`);
  if (produced.length > 0) console.log(`  uploaded ~${mb(uploadedBytes)} of derivatives`);
  console.log(`  ${elapsed}s`);

  if (errors.length > 0) {
    console.log("\nerrors:");
    for (const e of errors) console.log(`  ${e.name}: ${e.error}`);
  }
}

/** Tell the site to drop its cached manifest immediately. Best-effort. */
async function revalidate(): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return;
  try {
    const res = await fetch(`${SITE_URL}/api/revalidate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    console.log(`→ revalidate: ${res.status}`);
  } catch (err) {
    console.warn(`! revalidate failed: ${(err as Error).message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
