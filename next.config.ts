import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deployed as a self-contained server bundle to the DigitalOcean droplet.
  // Note: `public/` and `.next/static/` are NOT traced into this — the deploy
  // script copies them in explicitly. See deploy/deploy.sh.
  output: "standalone",

  images: {
    // We generate every derivative ourselves in pipeline/ and serve them
    // straight from GCS. Next's optimizer would be redundant CPU on a small
    // droplet, would need sharp at runtime, refuses to touch animated GIFs
    // anyway, and exposes an unauthenticated resize endpoint. Off.
    unoptimized: true,
  },

  poweredByHeader: false,
  // No custom Cache-Control here: Next already serves /_next/static as
  // immutable, and Caddy owns edge caching in production (see deploy/Caddyfile).
};

export default nextConfig;
