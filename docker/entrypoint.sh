#!/usr/bin/env bash
set -Eeuo pipefail

# Do NOT pre-create "$XDG_DATA_HOME/boxteam": the app migrates the legacy
# "$XDG_DATA_HOME/oscata-tauri" folder on first boot only when the new one
# does not exist yet.
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" /downloads

# Tauri/WebKit requires a display even in headless mode.
# We start a minimal 1×1 virtual display; the actual window is hidden by BOXTEAM_HEADLESS=1.
# Remove stale lock file left by previous container run (e.g. after host reboot).
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 1x1x8 -ac -nolisten tcp &

exec /opt/boxteam/boxteam
