#!/bin/bash
# Builds BoxTeam for macOS on this Mac and adds it to the GitHub release of
# a tag, so the in-app updater also offers that version on Mac (CI only
# builds Windows and Linux).
#
#   scripts/release-mac.sh v0.21.0
#
# Run it while the Release workflow is still building (the release is a
# draft by then): the publish job then writes latest.json with macOS in it.
# After publishing it works too, but replacing latest.json on a published
# release lets GitHub's CDN serve the old copy (without macOS) for a while.
#
# Needs: the updater signing key (scripts/updater-key.sh), `gh` logged in to
# the account that owns the repo, and the checkout at that tag.
set -euo pipefail

TAG="${1:?uso: scripts/release-mac.sh vX.Y.Z}"
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
if [ "v$VERSION" != "$TAG" ]; then
  echo "package.json tiene $VERSION y el tag es $TAG: haz 'git checkout $TAG' primero" >&2
  exit 1
fi

source scripts/updater-key.sh
if [ "${#TAURI_BUILD_FLAGS[@]}" -ne 0 ]; then
  echo "Falta la clave de firma del actualizador; sin ella la app de Mac no aceptaría la actualización." >&2
  exit 1
fi

source ~/.nvm/nvm.sh
nvm use 22 --silent
npm ci
npm run tauri build -- --bundles app,dmg

case "$(uname -m)" in
  arm64) ARCH=aarch64 ;;
  *) ARCH=x64 ;;
esac
BUNDLE=src-tauri/target/release/bundle
OUT="$(mktemp -d)"
cp "$BUNDLE/macos/BoxTeam.app.tar.gz" "$OUT/BoxTeam_${VERSION}_${ARCH}.app.tar.gz"
cp "$BUNDLE/macos/BoxTeam.app.tar.gz.sig" "$OUT/BoxTeam_${VERSION}_${ARCH}.app.tar.gz.sig"

export GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}"
shopt -s nullglob
node scripts/release-assets.mjs upload "$TAG" "$OUT"/* "$BUNDLE"/dmg/*.dmg
node scripts/release-assets.mjs updater-manifest "$TAG"
rm -rf "$OUT"
