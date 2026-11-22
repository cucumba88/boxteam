/**
 * One-shot localStorage migration for the Oscata → BoxTeam rename.
 *
 * Imported for its side effect as the FIRST import of `main.tsx`, so it runs
 * before any module reads its key at load time. Copies each legacy key to its
 * new name when the new one is still empty, then removes the legacy key.
 * Covers the web GUI (same origin, so the session token survives) and desktop
 * builds whose WebView storage is still reachable.
 */
const LEGACY_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["oscata-theme", "boxteam-theme"],
  ["oscata.sidebar.collapsed", "boxteam.sidebar.collapsed"],
  ["oscata_web_token", "boxteam_web_token"],
  ["oscata_rating_source_order", "boxteam_rating_source_order"],
  ["oscata.prefs.v1", "boxteam.prefs.v1"],
  ["oscata-all-view", "boxteam-all-view"],
];

export function migrateLegacyStorage(storage: Storage): void {
  for (const [legacy, next] of LEGACY_KEYS) {
    const value = storage.getItem(legacy);
    if (value === null) continue;
    if (storage.getItem(next) === null) storage.setItem(next, value);
    storage.removeItem(legacy);
  }
}

try {
  migrateLegacyStorage(window.localStorage);
} catch {
  // Storage can be unavailable (private mode, blocked site data): nothing to migrate.
}
