import Link from "next/link";
import { Thumb } from "@/components/ui/Thumb";
import { formatAge, formatBytes, formatCount, isRecent } from "@/lib/format";
import type { CategorySummary, MemeEntry } from "@/types/manifest";

/**
 * The signature element: a specimen card.
 *
 * A mosaic of three real memes over a mono metadata rail that reads like a
 * directory listing — count, size, age. The joke is the seriousness: 112 piles
 * of nonsense, catalogued with the exactness of an archive.
 *
 * Cost discipline matters at 112 cards. The primary uses `thumb` (400w, ~9KB),
 * the two secondaries use `micro` (200w, ~4KB), everything lazy-loads, and
 * `content-visibility` keeps off-screen cards out of layout entirely.
 */
export function CategoryCard({
  summary,
  covers,
  priority = false,
}: {
  summary: CategorySummary;
  covers: MemeEntry[];
  priority?: boolean;
}) {
  const [primary, second, third, hover] = covers;
  const fresh = isRecent(summary.newestAt);
  const mostlyAnimated = summary.count > 0 && summary.animatedCount / summary.count > 0.5;

  return (
    <Link
      href={`/${summary.name}`}
      className="group block rounded-sm border border-hairline bg-ink-raised transition-colors duration-200 hover:border-hairline-lit focus-visible:border-signal"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 260px" }}
    >
      {/*
        Mosaic: a wide primary above a pair of wide secondaries.

        All three frames are landscape on purpose. Memes here skew wide — the
        `17` category is 200x36 chat screenshots — and a portrait frame renders
        those as an invisible sliver. Landscape frames fit the actual corpus.

        The primary is `contain` because it has to stay readable; the small
        secondaries are `cover` because at ~110px they read as texture and
        variety, not as something anyone parses.
      */}
      <div className="flex flex-col gap-px overflow-hidden rounded-t-sm bg-hairline">
        <div className="relative aspect-[16/10] overflow-hidden bg-ink-sunken">
          {primary ? (
            <>
              <Thumb
                entry={primary}
                variant={primary.derived.thumb}
                priority={priority}
                fit="contain"
                alt=""
                className="transition-opacity duration-300 group-hover:opacity-0"
              />
              {/* The fourth cover crossfades in on hover — the "there's more in
                  here" signal a static cover can't give. */}
              {hover ? (
                <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <Thumb entry={hover} variant={hover.derived.thumb} fit="contain" alt="" />
                </div>
              ) : null}
            </>
          ) : (
            <div className="h-full w-full bg-ink-sunken" />
          )}
        </div>

        {/* Secondaries collapse gracefully: 5 categories hold a single item. */}
        {second ? (
          <div className="flex gap-px">
            <div className="relative aspect-[16/7] flex-1 overflow-hidden bg-ink-sunken">
              <Thumb entry={second} variant={second.derived.micro} alt="" />
            </div>
            {third ? (
              <div className="relative aspect-[16/7] flex-1 overflow-hidden bg-ink-sunken">
                <Thumb entry={third} variant={third.derived.micro} alt="" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5">
        <h2 className="truncate font-display text-[0.9375rem] font-semibold leading-tight tracking-tight text-bone transition-colors group-hover:text-signal">
          {summary.title}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          {mostlyAnimated ? (
            <span className="meta-sm rounded-[2px] border border-amber-dim px-1 py-px leading-none text-amber">
              GIF
            </span>
          ) : null}
          {/* Conditional, not always-on: 60 of 112 categories last changed years
              ago, and "6y" on every card would drown the signal. */}
          {fresh ? (
            <span
              role="img"
              aria-label="Added in the last 30 days"
              className="size-1.5 rounded-full bg-amber"
            />
          ) : null}
        </div>
      </div>

      <div className="meta flex items-center gap-1.5 px-3 pb-2.5 pt-1">
        <span className="text-bone/70">{formatCount(summary.count)}</span>
        <span className="text-faint">·</span>
        <span>{formatBytes(summary.bytes)}</span>
        <span className="text-faint">·</span>
        <time dateTime={summary.newestAt} title={`Newest item added ${summary.newestAt}`}>
          {formatAge(summary.newestAt)}
        </time>
      </div>
    </Link>
  );
}
