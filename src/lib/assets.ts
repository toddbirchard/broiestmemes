import type { MemeEntry, Variant } from "@/types/manifest";

/**
 * Single chokepoint for every asset URL. Moving derivatives behind a
 * Cloudflare-proxied subdomain, or to R2, is a change to this one env var.
 */
export const ASSET_BASE = (
  process.env.NEXT_PUBLIC_ASSET_BASE ?? "https://storage.googleapis.com/broiestbot"
).replace(/\/$/, "");

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://broiestmemes.com").replace(
  /\/$/,
  ""
);

/** Object path within the bucket -> absolute URL. */
export function assetUrl(path: string): string {
  return `${ASSET_BASE}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The untouched original. Used for "download original" and nothing else. */
export function originalUrl(entry: MemeEntry): string {
  return assetUrl(entry.source.name);
}

/**
 * `thumb` at 1x, `grid` at 2x. Both are rendered from the same source, so the
 * browser picks by DPR and viewport without us guessing at breakpoints.
 */
export function tileSrcSet(entry: MemeEntry): string {
  const { thumb, grid } = entry.derived;
  return `${assetUrl(thumb.path)} ${thumb.w}w, ${assetUrl(grid.path)} ${grid.w}w`;
}

export function fullSrcSet(entry: MemeEntry): string {
  const { grid, full } = entry.derived;
  return `${assetUrl(grid.path)} ${grid.w}w, ${assetUrl(full.path)} ${full.w}w`;
}

export function variantUrl(v: Variant): string {
  return assetUrl(v.path);
}

/** Canonical page URL for an entry, relative to the site root. */
export function entryPath(entry: MemeEntry): string {
  return `/${entry.category}/${entry.slug}`;
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
