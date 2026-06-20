#!/usr/bin/env bash
# Build Sessions for this Mac (host architecture) and install it to /Applications.
# Safe to run on Apple Silicon or Intel — electron-builder targets the host arch.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "› Building Sessions.app…"
npm run pack:mac

APP="$(find dist -maxdepth 2 -name 'Sessions.app' -type d 2>/dev/null | head -1)"
if [ -z "${APP:-}" ]; then
  echo "✗ Build did not produce Sessions.app (looked under dist/)." >&2
  exit 1
fi

echo "› Installing $APP → /Applications/Sessions.app"
rm -rf "/Applications/Sessions.app"
cp -R "$APP" "/Applications/"
# Built locally, so it's unsigned/ad-hoc; clear any quarantine so it opens cleanly.
xattr -dr com.apple.quarantine "/Applications/Sessions.app" 2>/dev/null || true

echo "✓ Installed. Launch 'Sessions' from /Applications or Spotlight."
