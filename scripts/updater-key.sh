#!/bin/bash
# Sourced by the local macOS build scripts. Exports the updater signing key
# (see "Actualizaciones automáticas" in the README) so `tauri build` can sign
# the update package. Without it, sets TAURI_BUILD_FLAGS so the build skips
# the updater artifacts instead of failing.
#
#   key:      $TAURI_SIGNING_PRIVATE_KEY_PATH (default ~/.tauri/boxteam-updater.key)
#   password: $TAURI_SIGNING_PRIVATE_KEY_PASSWORD, or the macOS Keychain item
#             "BoxTeam updater signing key password"

TAURI_BUILD_FLAGS=()
_key="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/boxteam-updater.key}"
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -f "$_key" ]; then
  TAURI_SIGNING_PRIVATE_KEY="$(cat "$_key")"
  export TAURI_SIGNING_PRIVATE_KEY
fi
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(security find-generic-password -s "BoxTeam updater signing key password" -w 2>/dev/null || true)"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
fi
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "[updater] no signing key: building without the in-app update package"
  TAURI_BUILD_FLAGS=(--config '{"bundle":{"createUpdaterArtifacts":false}}')
fi
unset _key
