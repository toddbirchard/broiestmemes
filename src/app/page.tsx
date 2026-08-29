import Link from "next/link";
import { Suspense } from "react";
import { CatalogGrid } from "@/components/home/CatalogGrid";
import { RecentRail } from "@/components/home/RecentRail";
import { getHome, resolveCovers } from "@/lib/catalog";
import { formatAge, formatBytes, formatCount } from "@/lib/format";
import type { MemeEntry } from "@/types/manifest";

export default async function HomePage() {
  const index = await getHome();

  // Covers resolved server-side so the client component receives entries for
  // 112 cards, not the whole 1,900-item catalogue.
  const coversById: Record<string, MemeEntry[]> = {};
  for (const summary of index.categories) {
    coversById[summary.name] = resolveCovers(index, summary);
  }

  const { stats, recent } = index;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        {/* Grounding the site in the actual object store it mirrors. The path is
            real, and it's the most honest description of what this place is. */}
        <p className="meta-sm mb-2 text-amber">gs://broiestbot/</p>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.03em] text-bone sm:text-5xl">
            Broiest Memes
          </h1>

          <Link
            href="/random"
            prefetch={false}
            className="meta-sm rounded-[3px] border border-amber-dim px-3 py-2 text-amber transition-colors hover:border-amber hover:bg-amber/10"
          >
            Surprise me →
          </Link>
        </div>

        <p className="meta mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-bone/70">{formatCount(stats.items)} memes</span>
          <span className="text-faint">·</span>
          <span>{formatCount(stats.categories)} categories</span>
          <span className="text-faint">·</span>
          <span>{formatCount(stats.animated)} animated</span>
          <span className="text-faint">·</span>
          <span>{formatBytes(stats.bytes)}</span>
          <span className="text-faint">·</span>
          <time dateTime={stats.newestAt} title={stats.newestAt}>
            newest {formatAge(stats.newestAt)}
          </time>
        </p>
      </header>

      <RecentRail items={recent} />

      {/* CatalogGrid reads searchParams, so it needs a Suspense boundary. */}
      <Suspense fallback={<div className="min-h-dvh" />}>
        <CatalogGrid categories={index.categories} coversById={coversById} />
      </Suspense>
    </main>
  );
}
