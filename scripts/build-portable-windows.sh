#!/usr/bin/env bash
# Packs the Windows portable zip from a cross-compiled build (Linux host).
# Bash equivalent of build-portable-windows.ps1, used by CI on the Unraid
# runner. Expects `tauri build --target x86_64-pc-windows-msvc` to have run.
#
# Usage: scripts/build-portable-windows.sh [--target <triple>] [--out <dir>]
set -euo pipefail

TARGET="x86_64-pc-windows-msvc"
OUT_DIR="portable-dist"
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    *) echo "Argumento desconocido: $1" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
ZIP="oscata-windows-portable-${VERSION}.zip"
REL="src-tauri/target/${TARGET}/release"

[ -f "$REL/oscata-tauri.exe" ] || { echo "No se ha encontrado $REL/oscata-tauri.exe" >&2; exit 1; }

# Tauri copies bundle resources next to the exe; fall back to the sources.
DIST_SRC="$REL/dist";           [ -d "$DIST_SRC" ] || DIST_SRC="dist"
RES_SRC="$REL/resources";       [ -d "$RES_SRC" ]  || RES_SRC="src-tauri/resources"

rm -rf "$OUT_DIR" "$ZIP"
mkdir -p "$OUT_DIR"
cp "$REL/oscata-tauri.exe" "$OUT_DIR/Oscata.exe"
: > "$OUT_DIR/.oscata-portable"
cp -r "$DIST_SRC" "$OUT_DIR/dist"
cp -r "$RES_SRC" "$OUT_DIR/resources"
# WebView2Loader is statically linked by tauri; nothing else to ship.

(cd "$OUT_DIR" && zip -qr "../$ZIP" .)
echo "Portable generado en: $ZIP"
