"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { assetUrl, entryPath, tileSrcSet } from "@/lib/assets";
import type { MemeEntry } from "@/types/manifest";

/**
 * One tile in the justified gallery.
 *
 * Interaction model — the tile has two distinct affordances and they must not
 * fight each other:
 *   - clicking the tile navigates to /[category]/[slug] (intercepted into the
 *     lightbox when you arrive from the grid)
 *   - clicking the GIF badge plays the video inline without navigating
 *
 * Animated entries render a static WebP poster until asked. The <video> carries
 * preload="none", so a 100%-animated category like `ynwa` (25/25) costs a few
 * hundred KB of posters instead of 107MB of GIFs.
 */
export function MemeTile({ entry, index }: { entry: MemeEntry; index: number }) {
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const animated = entry.kind === "animated" && entry.derived.video !== undefined;

  // Pause anything scrolled out of view. Without this, playing through a long
  // category leaves every video decoding at once.
  useEffect(() => {
    if (!playing || !containerRef.current) return;
    const node = containerRef.current;
    const observer = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) {
          videoRef.current?.pause();
          setPlaying(false);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [playing]);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPlaying((p) => !p);
  }, []);

  const copyLink = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${entryPath(entry)}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      } catch {
        // Clipboard can be blocked (insecure context, permissions). The link is
        // still reachable by opening the tile, so fail quietly.
      }
    },
    [entry]
  );

  return (
    <div style={{ "--ar": entry.aspect } as React.CSSProperties}>
      {/*
        The navigation Link is an absolutely-positioned overlay rather than a
        wrapper. Nesting the download <a> and the play/copy buttons inside an <a>
        is invalid HTML and breaks hydration outright — so the link sits in the
        stack below the controls, which are its siblings.
      */}
      <div
        ref={containerRef}
        className="group relative overflow-hidden rounded-sm border border-hairline bg-ink-sunken transition-colors hover:border-hairline-lit"
        style={{ aspectRatio: entry.aspect, backgroundColor: entry.color }}
      >
        {playing && entry.derived.video ? (
          <video
            ref={videoRef}
            src={assetUrl(entry.derived.video.path)}
            poster={assetUrl(entry.derived.full.path)}
            width={entry.derived.video.w}
            height={entry.derived.video.h}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={assetUrl(entry.derived.thumb.path)}
            srcSet={tileSrcSet(entry)}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            width={entry.derived.thumb.w}
            height={entry.derived.thumb.h}
            alt={entry.title}
            loading={index < 12 ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}

        <Link
          href={entryPath(entry)}
          scroll={false}
          aria-label={entry.title}
          className="absolute inset-0 z-10"
        />

        <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-full bg-gradient-to-t from-ink/95 to-transparent px-2 pb-1.5 pt-6 transition-transform duration-200 group-hover:translate-y-0">
          <span className="meta block truncate text-bone/90">{entry.title}</span>
        </span>

        {animated ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? `Pause ${entry.title}` : `Play ${entry.title}`}
            className="meta-sm absolute top-1.5 left-1.5 z-30 rounded-[2px] bg-ink/85 px-1.5 py-0.5 leading-none text-amber backdrop-blur-sm transition-colors hover:bg-ink hover:text-bone"
          >
            {playing ? "❚❚" : "▶ GIF"}
          </button>
        ) : null}

        {/* Actions stay visible on touch (no hover to reveal them there). */}
        <div className="absolute right-1.5 top-1.5 z-30 flex gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            type="button"
            onClick={copyLink}
            aria-label={`Copy link to ${entry.title}`}
            className="meta-sm rounded-[2px] bg-ink/85 px-1.5 py-0.5 leading-none text-bone backdrop-blur-sm transition-colors hover:bg-signal hover:text-ink"
          >
            {copied ? "copied" : "link"}
          </button>
          <a
            href={`/api/download/${entry.source.name}`}
            aria-label={`Download ${entry.title}`}
            className="meta-sm rounded-[2px] bg-ink/85 px-1.5 py-0.5 leading-none text-bone backdrop-blur-sm transition-colors hover:bg-signal hover:text-ink"
          >
            ↓
          </a>
        </div>
      </div>
    </div>
  );
}
