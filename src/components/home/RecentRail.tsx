import Link from "next/link";
import { Thumb } from "@/components/ui/Thumb";
import { entryPath } from "@/lib/assets";
import { formatAge } from "@/lib/format";
import type { MemeEntry } from "@/types/manifest";

/**
 * Newest arrivals across the whole bucket.
 *
 * This is the only part of the page that changes between visits, which is
 * exactly what makes a 112-item index feel alive rather than static. It runs
 * purely on `timeCreated`, and the archive genuinely is still growing — 419
 * objects landed in 2026 alone.
 *
 * Posters only, never autoplay: a rail of 24 looping videos above the fold is
 * how you make a homepage unusable.
 */
export function RecentRail({ items }: { items: MemeEntry[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-hairline pb-2">
        <h2 id="recent-heading" className="meta-sm text-amber">
          Recently added
        </h2>
        <span className="meta-sm">newest first</span>
      </div>

      <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
        {items.map((entry, i) => (
          <li key={entry.id} className="w-32 shrink-0 snap-start sm:w-36">
            <Link href={entryPath(entry)} className="group block">
              <div className="relative aspect-square overflow-hidden rounded-sm border border-hairline bg-ink-sunken transition-colors group-hover:border-hairline-lit">
                <Thumb
                  entry={entry}
                  variant={entry.derived.thumb}
                  priority={i < 8}
                  fit="contain"
                  className="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                />
                {entry.kind === "animated" ? (
                  <span className="meta-sm absolute bottom-1 left-1 rounded-[2px] bg-ink/85 px-1 py-px leading-none text-amber backdrop-blur-sm">
                    GIF
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 px-0.5">
                <p className="truncate font-display text-xs font-medium leading-tight text-bone/85 transition-colors group-hover:text-signal">
                  {entry.title}
                </p>
                <p className="meta-sm mt-0.5 truncate">
                  {entry.category} · {formatAge(entry.source.timeCreated)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
