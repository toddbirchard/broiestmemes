"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CategorySummary, MemeEntry } from "@/types/manifest";
import { CategoryCard } from "./CategoryCard";

export type SortKey = "name" | "count" | "recent";

/**
 * Recency is the default: the archive is 1,900 items deep and mostly static, so
 * the useful question on arrival is what moved lately, not what starts with "a".
 * Kept out of the URL when active (see the sync effect) so a bare `/` is canonical.
 */
const DEFAULT_SORT: SortKey = "recent";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "A–Z" },
  { key: "count", label: "Most items" },
  { key: "recent", label: "Recently updated" },
];

/**
 * Search + sort over 112 categories.
 *
 * At this size no virtualization or debounce is warranted — useDeferredValue
 * keeps typing responsive while the grid re-filters. State is mirrored into the
 * URL so a filtered view is shareable.
 */
export function CatalogGrid({
  categories,
  coversById,
}: {
  categories: CategorySummary[];
  coversById: Record<string, MemeEntry[]>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>(() => {
    const s = params.get("sort");
    return s === "count" || s === "recent" || s === "name" ? s : DEFAULT_SORT;
  });
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere, the way every archive worth using does.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Replace rather than push: sorting shouldn't fill the back button with noise.
  useEffect(() => {
    const next = new URLSearchParams();
    if (deferredQuery) next.set("q", deferredQuery);
    if (sort !== DEFAULT_SORT) next.set("sort", sort);
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }, [deferredQuery, sort, router]);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const filtered = q
      ? categories.filter(
          (c) => c.name.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
        )
      : categories;

    const sorted = [...filtered];
    if (sort === "count") sorted.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    else if (sort === "recent")
      sorted.sort((a, b) => b.newestAt.localeCompare(a.newestAt) || a.name.localeCompare(b.name));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [categories, deferredQuery, sort]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <div className="flex items-center gap-1" role="group" aria-label="Sort categories">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={`meta-sm rounded-[3px] border px-2.5 py-1.5 transition-colors ${
                sort === s.key
                  ? "border-signal-dim bg-signal/10 text-signal"
                  : "border-hairline text-dim hover:border-hairline-lit hover:text-bone"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Filter categories"
            aria-label="Filter categories"
            className="meta w-full rounded-[3px] border border-hairline bg-ink-raised px-2.5 py-1.5 pr-8 text-bone placeholder:text-faint focus:border-signal focus:outline-none"
          />
          <kbd className="meta-sm pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint">
            /
          </kbd>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="meta py-16 text-center">
          Nothing matches “{deferredQuery}”. Try a shorter search.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((c, i) => (
            <CategoryCard
              key={c.name}
              summary={c}
              covers={coversById[c.name] ?? []}
              priority={i < 5}
            />
          ))}
        </div>
      )}

      <p className="meta-sm mt-6 text-center">
        {visible.length === categories.length
          ? `${categories.length} categories`
          : `${visible.length} of ${categories.length} categories`}
      </p>
    </>
  );
}
