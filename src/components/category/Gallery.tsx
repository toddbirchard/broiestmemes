"use client";

import { useEffect, useMemo, useState } from "react";
import type { MemeEntry } from "@/types/manifest";
import { MemeTile } from "./MemeTile";

type Sort = "newest" | "oldest" | "name";
type Filter = "all" | "animated" | "still";
type Density = "comfortable" | "compact" | "dense";

/**
 * Density is a single CSS variable, which is the whole payoff of the
 * justified-row layout: --row-h feeds `flex-basis: calc(var(--ar) * var(--row-h))`,
 * so one number reflows the entire grid correctly at every aspect ratio. No
 * measurement, no relayout logic, no resize observer.
 */
const ROW_HEIGHT: Record<Density, string> = {
  comfortable: "280px",
  compact: "200px",
  dense: "140px",
};

const SORTS: { key: Sort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "name", label: "A–Z" },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "animated", label: "Animated" },
  { key: "still", label: "Stills" },
];

export function Gallery({ items }: { items: MemeEntry[] }) {
  const [sort, setSort] = useState<Sort>("newest");
  const [filter, setFilter] = useState<Filter>("all");
  const [density, setDensity] = useState<Density>("compact");

  // Density is a per-viewer preference, so it belongs in localStorage rather
  // than the URL. Reads are guarded: private windows can throw on access.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("broiest:density");
      if (saved === "comfortable" || saved === "compact" || saved === "dense") setDensity(saved);
    } catch {
      /* storage unavailable — the default is fine */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("broiest:density", density);
    } catch {
      /* non-fatal */
    }
  }, [density]);

  const visible = useMemo(() => {
    const filtered =
      filter === "all"
        ? items
        : items.filter((i) =>
            filter === "animated" ? i.kind === "animated" : i.kind !== "animated"
          );

    const sorted = [...filtered];
    if (sort === "oldest") {
      sorted.sort((a, b) => a.source.timeCreated.localeCompare(b.source.timeCreated));
    } else if (sort === "name") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    // "newest" is the canonical order the server already applied.
    return sorted;
  }, [items, sort, filter]);

  const animatedCount = useMemo(() => items.filter((i) => i.kind === "animated").length, [items]);

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-ink/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1" role="group" aria-label="Sort">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={pill(sort === s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {animatedCount > 0 && animatedCount < items.length ? (
          <div className="flex items-center gap-1" role="group" aria-label="Filter by type">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={pill(filter === f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Grid density">
          {(Object.keys(ROW_HEIGHT) as Density[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDensity(d)}
              aria-pressed={density === d}
              aria-label={`${d} density`}
              title={d.charAt(0).toUpperCase() + d.slice(1)}
              className={pill(density === d)}
            >
              {d === "comfortable" ? "▯" : d === "compact" ? "▯▯" : "▯▯▯"}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="meta py-16 text-center">Nothing here with that filter.</p>
      ) : (
        <div className="gallery" style={{ "--row-h": ROW_HEIGHT[density] } as React.CSSProperties}>
          {visible.map((entry, i) => (
            <MemeTile key={entry.id} entry={entry} index={i} />
          ))}
        </div>
      )}
    </>
  );
}

function pill(active: boolean): string {
  return `meta-sm rounded-[3px] border px-2 py-1.5 transition-colors ${
    active
      ? "border-signal-dim bg-signal/10 text-signal"
      : "border-hairline text-dim hover:border-hairline-lit hover:text-bone"
  }`;
}
