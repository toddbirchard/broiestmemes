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

Node is pinned to **22.23.2** (LTS "Jod") in `.nvmrc` and `engines`.

```bash
nvm use            # reads .nvmrc
pnpm install
cp .env.example .env.local
pnpm dev
```

If you switch Node majors, reinstall rather than reusing `node_modules` — `sharp` and
`ffmpeg-static` both carry platform binaries.

## Pipeline

Reads originals over anonymous public HTTPS; **writes** need a GCS key
(`GOOGLE_APPLICATION_CREDENTIALS`, or `gcloud.json` in the repo root — gitignored, never
commit it, and never put it in `public/`).

```bash
pnpm pipeline                    # incremental: usually 0 processed, ~2s
pnpm pipeline --only gerald      # one category (never publishes or prunes)
pnpm pipeline --dry-run          # derive, upload nothing
pnpm pipeline --force            # ignore previous state, rebuild everything
pnpm pipeline --no-video         # skip H.264 transcodes (much faster)
```

`--only` and `--limit` are read-mostly on purpose: a partial run sees a deliberate
subset of the bucket, and both publishing and pruning treat "absent from this run" as
"deleted upstream". Letting either happen from a partial run would wipe every category
it didn't look at.

Incrementality keys on the GCS object `generation`, which changes on every overwrite.
Nothing else is reprocessed. Bumping `PIPELINE_VERSION` in `src/types/manifest.ts` forces
a full regeneration — the escape hatch when encoder settings change.

A full backfill takes ~4 minutes and ~360 MB of derivatives.

After a run that changed something, the pipeline POSTs `/api/revalidate` to drop the
site's cached manifest immediately — set `REVALIDATE_SECRET` and `NEXT_PUBLIC_SITE_URL`
in your local env to match `/var/www/broiestmemes/.env` and it happens automatically.
It's optional: without it the site picks up changes on its own within 300s.

## Deploy

Self-hosted on a DigitalOcean droplet. You build locally and push a release up — never
build on the droplet, `next build` peaks well over 1GB.

```bash
./deploy/deploy.sh root@YOUR_DROPLET_IP
```

That builds, ships the release, flips a symlink, and restarts the service.

### Layout on the droplet

```
/var/www/broiestmemes/
├── .env                              you create this once (step 2)
├── releases/
│   ├── 2026-08-28T1904-a1b2c3d/      one per deploy, created by rsync
│   └── 2026-08-29T1130-9f8e7d6/
└── current -> releases/2026-08-29T1130-9f8e7d6
```

**`current` is a symlink, not a directory, and nothing in the setup below creates it.**
It first appears partway through the first successful deploy, at the `ln -sfn` / `mv -Tf`
step in `deploy.sh`. Every later deploy re-points it atomically — which is why rollback
is just pointing it at an older release and restarting, with no rebuild:

```bash
ssh root@HOST 'cd /var/www/broiestmemes && ln -sfn releases/<older> current.new \
  && mv -Tf current.new current && systemctl restart broiestmemes'
```

On a fresh droplet `current` legitimately does not exist and the service cannot run.
That is the expected state until you have deployed once. Don't `mkdir` it — a real
directory there gets clobbered by the first `mv -Tf`.

Paths must agree in three places: `WorkingDirectory` and `ReadWritePaths` in the service
file, and `APP_DIR` in `deploy.sh`. All three use `/var/www/broiestmemes`.

### One-time setup

0. Install Node 22 on the droplet and make sure `/usr/bin/node` is it — that path is
   hardcoded in the unit's `ExecStart`, and the standalone build now targets 22.x.
   Check with `/usr/bin/node -v`; if it's a different major, either install 22 there or
   point `ExecStart` at the right binary.
1. Create the service user and the tree:
   ```bash
   sudo useradd --system --shell /usr/sbin/nologin broiestbot
   sudo mkdir -p /var/www/broiestmemes/releases
   sudo chown -R broiestbot:broiestbot /var/www/broiestmemes
   ```
2. `deploy/env.example` → `/var/www/broiestmemes/.env` (the path the unit's
   `EnvironmentFile` expects), owned `root:broiestbot`, `chmod 640`. Keep it **outside**
   `current/` — never inside the release tree.
3. `deploy/broiestmemes.service` → `/etc/systemd/system/`, then **`systemctl enable
   broiestmemes`** — `enable`, *not* `enable --now`. The unit cannot start until `current`
   exists, because `WorkingDirectory` points at it and systemd fails with
   `status=200/CHDIR` on a missing working directory. The first deploy starts it.
4. Install the nginx site and get a certificate. **Don't run `nginx` or `caddy` by
   hand** — the distro service already owns :80/:443; a second process fails with
   `bind: address already in use`.
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/broiestmemes
   sudo ln -sfn /etc/nginx/sites-available/broiestmemes /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default     # the default site squats :80
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Then, with DNS pointed at the droplet and **grey-clouded** (Cloudflare proxy off,
   so the ACME challenge reaches the origin):
   ```bash
   sudo certbot --nginx -d broiestmemes.com -d www.broiestmemes.com
   ```
   Certbot edits `/etc/nginx/sites-available/broiestmemes` in place to add the TLS
   block and the HTTP→HTTPS redirect, and installs a renewal timer. The repo copy is
   the pre-certbot version — expect the server copy to differ after this.

   Only once HTTPS works: orange-cloud Cloudflare and set SSL mode to Full (strict).

   If :443 is already taken, find the owner with `sudo ss -tlnp 'sport = :443'`.

5. `./deploy/deploy.sh root@YOUR_DROPLET_IP`

### When a deploy fails

```bash
systemctl status broiestmemes           # unit state
journalctl -u broiestmemes -n 50        # what Node actually said
ls -l /var/www/broiestmemes/current     # is the symlink pointing at a real release?
sudo -u broiestbot test -w /var/www/broiestmemes/current/.next/cache && echo writable
```

For nginx: `sudo nginx -t` validates the config, `journalctl -u nginx -n 30 --no-pager`
shows why it refused to start. `bind: address already in use` means something else holds
the port — usually the default site, a stray manual process, or a leftover Caddy
(`systemctl disable --now caddy`).

`Failed to set up mount namespacing` means a `ReadWritePaths` entry doesn't resolve.
`EROFS` at runtime means `ProtectSystem=strict` is blocking an ISR write that
`ReadWritePaths` doesn't cover. `status=200/CHDIR` means `current` doesn't exist yet.

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
- **The release must be assembled with `rsync -a`, never `cp -r`.** Under pnpm,
  `standalone/node_modules` is a tree of symlinks into `.pnpm/`, and Node resolves a
  module from its symlink's *real* path — that is how `next` finds `@swc/helpers` as its
  sibling inside `.pnpm`. macOS `cp -r` dereferences symlinks, hoisting `next` to the top
  level and severing it from that peer directory; the server then dies at startup with
  `Cannot find module '@swc/helpers/_/_interop_require_default'` and systemd crash-loops
  it forever. `deploy.sh` uses `rsync -a` and refuses to ship if any symlink is broken.
  (If this class of problem recurs, `node-linker=hoisted` in `.npmrc` makes pnpm produce
  a flat `node_modules` and removes the symlinks entirely.)
- **ISR cache is not persisted across deploys** on purpose. A cold cache costs one
  manifest fetch; sharing a mutable cache between builds risks serving payloads generated
  by different code.
- **Upload→live is bounded by ~60s, not instant.** `/api/revalidate` purges Next's cache
  immediately, but the refetch can still hit GCS's own `max-age=60` on the artifacts, so a
  change published seconds earlier may serve stale once. It self-corrects on the next
  fetch. The pipeline works around this for its *own* state read with a cache-buster
  (`pipeline/index.ts`); the site deliberately does not, because that cache is the point.
