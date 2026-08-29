import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/assets";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /random redirects somewhere different on every hit; nothing to index.
      disallow: ["/api/", "/random"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
