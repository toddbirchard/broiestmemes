import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/assets";
import { getAllRefs, getHome } from "@/lib/catalog";

// <loc> entries must be absolute URLs; Next does not apply metadataBase here.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [index, refs] = await Promise.all([getHome(), getAllRefs()]);

  return [
    { url: absoluteUrl("/"), lastModified: new Date(index.stats.newestAt), priority: 1 },
    ...index.categories.map((c) => ({
      url: absoluteUrl(`/${c.name}`),
      lastModified: new Date(c.newestAt),
      priority: 0.8,
    })),
    ...refs.map((r) => ({
      url: absoluteUrl(`/${r.c}/${r.s}`),
      lastModified: new Date(r.t),
      priority: 0.5,
    })),
  ];
}
