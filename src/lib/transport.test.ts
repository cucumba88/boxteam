import { describe, expect, it } from "vitest";
import { WEB_ROUTES } from "./transport";
// The Axum router, read as text: every web route the frontend calls must exist
// there with the same method, or the call fails in web mode only.
import routerSource from "../../src-tauri/src/web/mod.rs?raw";

// Every frontend source file, to find the commands it calls.
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Commands called with `call()` that only exist in the desktop app. Each one
 *  must be gated with `isTauri()` where it is called. Adding a command here
 *  instead of to WEB_ROUTES is a decision: the feature won't work in web mode. */
const DESKTOP_ONLY = new Set([
  // uploads (useUploads returns early in web mode)
  "get_uploads",
  "cancel_upload",
  "delete_upload",
  "retry_upload",
  "retry_group_uploads",
  "retry_all_failed_uploads",
  "clear_completed_uploads",
  // native folder / settings checks gated in Settings and the wizard
  "open_download_folder",
  "ftp_list_root_dirs_preview",
  "test_plex_connection",
  "test_emby_connection",
  "test_telegram",
  "test_telegram_upload_sample",
  "detect_telegram_chat",
  "check_telegram_setup",
]);

type AxumRoute = { method: string; pattern: RegExp; path: string };

function axumRoutes(source: string): AxumRoute[] {
  const routes: AxumRoute[] = [];
  const re = /\.route\(\s*"([^"]+)"\s*,\s*([^\n]+)\)/g;
  for (const m of source.matchAll(re)) {
    const path = m[1];
    const pattern = new RegExp(
      "^" + path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{[^}]+\\?\}/g, "[^/]+") + "$",
    );
    for (const mm of m[2].matchAll(/\b(get|post|put|delete|patch)\(/g)) {
      routes.push({ method: mm[1].toUpperCase(), pattern, path });
    }
  }
  return routes;
}

// Any argument a route function reads comes back as "7".
const anyArgs = new Proxy({}, { get: () => "7" }) as Record<string, unknown>;

function resolve(command: string): [string, string] {
  const route = WEB_ROUTES[command];
  const [method, path] = typeof route === "function" ? route(anyArgs) : route;
  return [method, path.split("?")[0]];
}

function calledCommands(): Set<string> {
  const called = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(/\bcall(?:<[^>]*>)?\(\s*["']([a-z0-9_]+)["']/g)) {
      called.add(m[1]);
    }
  }
  return called;
}

describe("web routes", () => {
  const routes = axumRoutes(routerSource);

  it("reads the Axum router", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it.each(Object.keys(WEB_ROUTES))("%s exists in the Axum router", (command) => {
    const [method, path] = resolve(command);
    const match = routes.find((r) => r.method === method && r.pattern.test(path));
    expect(match, `${method} /api${path} no está en src-tauri/src/web/mod.rs`).toBeDefined();
  });

  it("every command called from the frontend has a web route or is desktop-only", () => {
    const missing = [...calledCommands()].filter((c) => !(c in WEB_ROUTES) && !DESKTOP_ONLY.has(c));
    expect(missing, "añade la ruta a WEB_ROUTES (transport.ts) o, si es solo de escritorio, a DESKTOP_ONLY").toEqual([]);
  });

  it("DESKTOP_ONLY has no stale entries", () => {
    const called = calledCommands();
    const stale = [...DESKTOP_ONLY].filter((c) => !called.has(c) || c in WEB_ROUTES);
    expect(stale).toEqual([]);
  });
});
