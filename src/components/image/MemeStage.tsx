"use client";

import { useState } from "react";
import { assetUrl, fullSrcSet } from "@/lib/assets";
import { formatBytes } from "@/lib/format";
import type { MemeEntry } from "@/types/manifest";

/**
 * The image itself, at whatever size the viewport allows.
 *
 * Animated entries play the MP4 rather than the source GIF — the transcodes run
 * 10-60x smaller (redpanda2.gif: 54MB -> 0.84MB). The original stays one click
 * away, labelled with its real weight so nobody downloads 54MB by accident.
 */
export function MemeStage({ entry }: { entry: MemeEntry }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const video = entry.derived.video;

  if (entry.kind === "audio") {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-sm border border-hairline bg-ink-raised p-8">
        <p className="meta-sm text-amber">audio</p>
        <p className="text-center font-display text-lg font-semibold text-bone">{entry.title}</p>
        {/* biome-ignore lint/a11y/useMediaCaption: source audio has no captions available */}
        <audio controls preload="none" src={assetUrl(entry.source.name)} className="w-full">
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }

  if (video && !showOriginal) {
    return (
      <div className="flex flex-col items-center gap-3">
        <video
          src={assetUrl(video.path)}
          poster={assetUrl(entry.derived.full.path)}
          width={video.w}
          height={video.h}
          autoPlay
          muted
          loop
          playsInline
          controls
          className="max-h-[78dvh] w-auto rounded-sm border border-hairline object-contain"
          style={{ backgroundColor: entry.color }}
        />
        <button
          type="button"
          onClick={() => setShowOriginal(true)}
          className="meta-sm text-dim underline decoration-hairline-lit underline-offset-4 transition-colors hover:text-signal"
        >
          Load original GIF · {formatBytes(entry.source.size)}
        </button>
      </div>
    );
  }

  if (showOriginal) {
    return (
      <img
        src={assetUrl(entry.source.name)}
        width={entry.width}
        height={entry.height}
        alt={entry.title}
        className="max-h-[78dvh] w-auto rounded-sm border border-hairline object-contain"
        style={{ backgroundColor: entry.color }}
      />
    );
  }

  return (
    <img
      src={assetUrl(entry.derived.full.path)}
      srcSet={fullSrcSet(entry)}
      sizes="(max-width: 1024px) 100vw, 70vw"
      width={entry.derived.full.w}
      height={entry.derived.full.h}
      alt={entry.title}
      // The one image on the page — never lazy.
      loading="eager"
      decoding="sync"
      fetchPriority="high"
      className="max-h-[78dvh] w-auto rounded-sm border border-hairline object-contain"
      style={{ backgroundColor: entry.color }}
    />
  );
}
