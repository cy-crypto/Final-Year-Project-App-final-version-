#!/usr/bin/env bash
# Render static-site build: bring in the uploaded secret files, then export the web version to dist/.
set -o errexit

# Render puts secret files in /etc/secrets (and the repo root); an uploaded copy replaces the committed one.
for f in .env.local .env.development; do
  for src in "/etc/secrets/$f" "../$f"; do
    if [ -f "$src" ]; then
      cp "$src" "$f"
      echo "Using uploaded $f"
      break
    fi
  done
done

# `expo export` builds in production mode, which skips .env.development; load it as .env.production
# (.env.local still takes precedence over it).
if [ -f .env.development ]; then
  cp .env.development .env.production
fi

npm ci
npx expo export --platform web
