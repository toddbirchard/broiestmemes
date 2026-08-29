"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { MemeEntry } from "@/types/manifest";

/**
 * Prev/next within the category, in the canonical (newest-first) order used
 * everywhere. Arrow keys are bound here so they work identically on the
 * standalone page and inside the lightbox.
 *
 * Navigation REPLACES rather than pushes. Stepping through 20 memes in the
 * lightbox would otherwise leave 20 history entries, so Esc (and the browser
 * back button) would walk back through the images one at a time instead of
 * returning to the grid. With replace, the lightbox stays exactly one entry
 * deep and closing always lands back on the category page.
 */
export function ImagePager({
  prev,
  next,
  index,
  total,
}: {
  prev: MemeEntry | null;
  next: MemeEntry | null;
  index: number;
  total: number;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        router.replace(`/${prev.category}/${prev.slug}`, { scroll: false });
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        router.replace(`/${next.category}/${next.slug}`, { scroll: false });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-hairline pt-3">
      {prev ? (
        <Link
          href={`/${prev.category}/${prev.slug}`}
          replace
          scroll={false}
          className="meta-sm min-w-0 flex-1 truncate text-dim transition-colors hover:text-signal"
        >
          ← {prev.title}
        </Link>
      ) : (
        <span className="flex-1" />
      )}

      <span className="meta-sm shrink-0 tabular-nums">
        {index + 1} / {total}
      </span>

      {next ? (
        <Link
          href={`/${next.category}/${next.slug}`}
          replace
          scroll={false}
          className="meta-sm min-w-0 flex-1 truncate text-right text-dim transition-colors hover:text-signal"
        >
          {next.title} →
        </Link>
      ) : (
        <span className="flex-1" />
      )}
    </div>
  );
}
