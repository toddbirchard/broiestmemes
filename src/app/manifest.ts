import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Broiest",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    // Matches --color-ink and the viewport themeColor, so the splash screen and
    // the first paint are the same colour.
    background_color: "#14110f",
    theme_color: "#14110f",
    icons: [
      { src: "/icon.png", sizes: "800x800", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
