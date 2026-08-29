# broiestmemes.com

A browsable front-end for `gs://broiestbot` — 1,902 memes across 112 categories.
Adding a meme to the bucket is the only step needed to publish it.

## How it works

The bucket is public and anonymously listable, so **the website needs no credentials
at all**. A separate pipeline reads the originals, generates derivatives, and publishes
small JSON artifacts that the site reads at runtime.

```
gs://broiestbot/<category>/<file>     source memes (untouched, canonical)
gs://broiestbot/_derived/             everything the pipeline writes
  ├── manifest.v1.json                pipeline state — diffed for incrementality
  ├── index.v1.json                   site: stats, 112 summaries, cover + recent entries
  ├── lite.v1.json                    site: id tuples for sitemap / random / downloads
  ├── c/<category>.v1.json            site: one category's items
  ├── {micro,thumb,grid,full}/…webp   200w / 400w / 800w / 1600w
  ├── og/…jpg                         1200x630 social cards
  └── video/…mp4                      H.264 transcodes of animated sources
```

Why derivatives are non-negotiable: rendering originals means a **126 MB** page for
`infinitepizza` and **103 MB** for `ynwa`. With the pipeline those are **0.46 MB** and
**0.30 MB** — 165x and 346x smaller. The GIF→MP4 transcode does most of that work
(`redpanda2.gif` goes 54 MB → 0.84 MB).

The site never fetches `manifest.v1.json`: at ~2.5 MB it exceeds Next's 2 MB fetch-cache
ceiling and would be re-downloaded uncached on every render. The split artifacts all sit
comfortably under it.

## Develop

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

## Pipeline

Reads originals over anonymous public HTTPS; **writes** need a GCS key
(`GOOGLE_APPLICATION_CREDENTIALS`, or `gcloud.json` in the repo root — gitignored, never
commit it, and never put it in `public/`).

```bash
pnpm pipeline                    # incremental: usually 0 processed, ~2s
pnpm pipeline --only gerald      # one category (does NOT publish the manifest)
pnpm pipeline --dry-run          # derive, upload nothing
pnpm pipeline --force            # ignore previous state, rebuild everything
pnpm pipeline --no-video         # skip H.264 transcodes (much faster)
```

Incrementality keys on the GCS object `generation`, which changes on every overwrite.
Nothing else is reprocessed. Bumping `PIPELINE_VERSION` in `src/types/manifest.ts` forces
a full regeneration — the escape hatch when encoder settings change.

A full backfill takes ~4 minutes and ~360 MB of derivatives.

## Deploy

Self-hosted on a DigitalOcean droplet. CI builds, rsyncs a release, and flips an atomic
symlink; see `deploy/` for the systemd unit, Caddyfile, and env template, and
`.github/workflows/` for the two workflows.

Never build on the droplet — `next build` peaks well over 1 GB.

### One-time setup

Paths must agree in three places or the unit starts against a directory the deploy
never created: `WorkingDirectory` and `ReadWritePaths` in the service file, and the
rsync/symlink target in `deploy.yml`. All three currently use `/var/www/broiestmemes`.

1. Create the tree and the service user:
   ```bash
   sudo useradd --system --shell /usr/sbin/nologin broiest
   sudo mkdir -p /var/www/broiestmemes/releases
   sudo chown -R broiest:broiest /var/www/broiestmemes
   ```
2. `deploy/env.example` → `/var/www/broiestmemes/.env` (the path the unit's
   `EnvironmentFile` expects), owned `root:broiest`, `chmod 640`. Keep it **outside**
   `current/` — never inside the release tree.
3. `deploy/broiestmemes.service` → `/etc/systemd/system/`, then `systemctl enable --now`.
   It will start before the first deploy because `ReadWritePaths` is `-`-prefixed, but
   it won't serve anything until `current` exists.
4. `deploy/Caddyfile` → `/etc/caddy/`. Bring it up **grey-clouded** so the ACME challenge
   reaches the origin, confirm HTTPS, *then* orange-cloud Cloudflare and set SSL to
   Full (strict).
5. Give the deploy user a narrowly-scoped sudoers entry so CI can restart the service:
   ```
   deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart broiestmemes
   ```
6. Repo secrets: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `GCP_SA_KEY`,
   `REVALIDATE_SECRET`. Repo vars: `NEXT_PUBLIC_ASSET_BASE`, `NEXT_PUBLIC_SITE_URL`.

### When a deploy fails

```bash
systemctl status broiestmemes           # unit state
journalctl -u broiestmemes -n 50        # what Node actually said
ls -l /var/www/broiestmemes/current     # is the symlink pointing at a real release?
sudo -u broiest test -w /var/www/broiestmemes/current/.next/cache && echo writable
```

`Failed to set up mount namespacing` means a `ReadWritePaths` entry doesn't resolve.
`EROFS` at runtime means `ProtectSystem=strict` is blocking an ISR write that
`ReadWritePaths` doesn't cover.

## Notable constraints

- **The bucket has no CORS config.** Manifest reads must be server-side, and downloads
  must go through `/api/download` — a cross-origin `<a download>` is ignored by browsers,
  and the fetch-to-blob fallback is CORS-blocked. That route validates every path against
  the manifest so it can't be used as an open proxy.
- **`next/image` is off** (`images.unoptimized`). The pipeline pre-generates every size,
  the optimizer refuses animated sources anyway, and `/_next/image` would be an
  unauthenticated CPU-burning endpoint on a small box.
- **GCS `contentType` is not trustworthy** — three objects are labelled
  `application/octet-stream` but are JPEGs. Everything is sniffed with sharp.
- **Slugs are stored, not derived.** Seven filename pairs collide within their category
  (`bigHugeD_bestOf.jpg` / `.png`); the manifest records the resolved slug so URLs never
  move.
- **ISR cache is not persisted across deploys** on purpose. A cold cache costs one
  manifest fetch; sharing a mutable cache between builds risks serving payloads generated
  by different code.
- **Upload→live is bounded by ~60s, not instant.** `/api/revalidate` purges Next's cache
  immediately, but the refetch can still hit GCS's own `max-age=60` on the artifacts, so a
  change published seconds earlier may serve stale once. It self-corrects on the next
  fetch. The pipeline works around this for its *own* state read with a cache-buster
  (`pipeline/index.ts`); the site deliberately does not, because that cache is the point.
