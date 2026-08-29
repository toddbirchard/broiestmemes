import { assetUrl } from "@/lib/assets";
import type { MemeEntry, Variant } from "@/types/manifest";

/**
 * A single still image inside an aspect-reserved frame.
 *
 * Two things matter here. The frame carries `aspect-ratio` from manifest data,
 * so space is reserved before the image loads and CLS stays at zero. And the
 * frame's background is the entry's dominant colour, so a slow tile reads as a
 * deliberate colour block rather than a hole in the grid.
 *
 * Plain <img> on purpose: next/image is disabled project-wide (see next.config.ts)
 * because the pipeline already produced exactly the sizes we want.
 */
export function Thumb({
  entry,
  variant,
  srcSet,
  sizes,
  className = "",
  priority = false,
  fit = "cover",
  alt,
}: {
  entry: MemeEntry;
  variant: Variant;
  srcSet?: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  /**
   * `contain` wherever the frame's aspect is fixed rather than derived from the
   * image — home cards and the recent rail. Most memes here are text-bearing
   * screenshots, and cropping them to fill a frame slices the joke in half.
   * Gallery tiles use the entry's own aspect, so nothing is cropped either way.
   */
  fit?: "cover" | "contain";
  alt?: string;
}) {
  // Audio entries have no frame to show — their derivative is a flat placard,
  // which is invisible against a dark page. Label them instead.
  if (entry.kind === "audio") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-ink-raised px-2">
        <span aria-hidden className="text-lg leading-none text-amber">
          ♪
        </span>
        <span className="meta-sm text-center leading-tight">audio</span>
      </div>
    );
  }

  return (
    <img
      src={assetUrl(variant.path)}
      srcSet={srcSet}
      sizes={sizes}
      width={variant.w}
      height={variant.h}
      alt={alt ?? entry.title}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      // fetchPriority only matters for the handful of above-the-fold tiles.
      fetchPriority={priority ? "high" : "auto"}
      className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${className}`}
      // The dominant colour is a loading placeholder, and only works as one under
      // `cover`, where the image eventually covers it. Under `contain` it would
      // persist as letterboxing — turning every white-background screenshot into
      // a glaring slab against a dark page. There, the dark frame shows instead.
      style={fit === "cover" ? { backgroundColor: entry.color } : undefined}
    />
  );
}
