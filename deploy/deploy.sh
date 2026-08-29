#!/usr/bin/env bash
#
# Deploy from your laptop. No CI, no deploy user, no SSH key to generate — this
# uses whatever root access you already have to the droplet.
#
#   ./deploy/deploy.sh root@203.0.113.10
#
# Builds locally (never on the droplet — `next build` peaks well over 1GB),
# ships the release, flips the symlink, restarts the service.

set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 user@host" >&2
  exit 1
fi

APP_DIR=/var/www/broiestmemes
SERVICE_USER=broiestbot
STAMP="$(date -u +%Y-%m-%dT%H%M)-$(git rev-parse --short HEAD 2>/dev/null || echo manual)"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

# The build is produced here and executed on the droplet, so the two runtimes
# should match. .nvmrc pins 22.23.2; warn loudly rather than silently shipping a
# bundle built on a different major.
WANT_MAJOR="$(cut -d. -f1 < .nvmrc)"
HAVE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$HAVE_MAJOR" != "$WANT_MAJOR" ]]; then
  echo "!! node v$HAVE_MAJOR active, but .nvmrc wants v$WANT_MAJOR — run 'nvm use'" >&2
  exit 1
fi

echo "→ building on node $(node -v)"
pnpm build

# `output: 'standalone'` traces only what the server imports — public/ and
# .next/static/ are NOT included and must be copied in by hand. Skipping this is
# the classic way to deploy a standalone build that 404s every asset.
echo "→ assembling release $STAMP"
rm -rf .deploy-release
mkdir -p .deploy-release/.next
cp -r .next/standalone/. .deploy-release/
cp -r .next/static .deploy-release/.next/static
[[ -d public ]] && cp -r public .deploy-release/public
mkdir -p .deploy-release/.next/cache

echo "→ shipping to $TARGET"
ssh "$TARGET" "mkdir -p $APP_DIR/releases/$STAMP"
rsync -az --delete .deploy-release/ "$TARGET:$APP_DIR/releases/$STAMP/"

echo "→ activating"
ssh "$TARGET" bash -euo pipefail <<EOF
  cd "$APP_DIR"
  # The service runs as $SERVICE_USER and ISR must write into .next/cache.
  chown -R $SERVICE_USER:$SERVICE_USER "releases/$STAMP"
  # 'current' is created here, on the first deploy. Two-step so the swap is a
  # single rename syscall — no window where an in-flight request finds it missing.
  ln -sfn "releases/$STAMP" current.new
  mv -Tf current.new current
  systemctl restart broiestmemes
  ls -1dt releases/*/ | tail -n +4 | xargs -r rm -rf
EOF

rm -rf .deploy-release
echo "✓ deployed $STAMP"
