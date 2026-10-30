import type { Metadata } from "next";

export const SITE_NAME = "Broiest Memes";

export const SITE_DESCRIPTION =
  "A browsable archive of memes, sorted into categories and accumulated since 2019.";

/**
 * Next merges metadata shallowly: a page that sets `openGraph` replaces the root
 * layout's object wholesale rather than extending it. Every route that defines
 * its own `openGraph` spreads this in first, or its cards lose the site name.
 */
export const baseOpenGraph = {
  siteName: SITE_NAME,
  locale: "en_US",
} satisfies Metadata["openGraph"];
