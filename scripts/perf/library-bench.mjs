#!/usr/bin/env node
// Frontend performance benchmark for large libraries (web mode, mocked API).
//
// Usage:
//   npm run build                                   # produces dist/
//   node scripts/perf/library-bench.mjs --media media.json [--dist dist] [--cpu 4] [--port 4417]
//
// `media.json` is the `get_all_media` payload. Generate a synthetic one with
// the Rust benchmark (see src-tauri/src/perf_bench.rs):
//   cd src-tauri && BENCH_N=20000 BENCH_JSON_OUT=/tmp/media.json \
//     cargo test --release perf_bench -- --ignored --nocapture
//
// Every /api call is answered locally and poster requests are stubbed with
// a tiny image, so nothing leaves the machine. Prints a JSON summary.

import { createRequire } from "node:module";
// Playwright is not a project dependency: use whichever is installed
// globally (resolved through NODE_PATH) or locally.
const { chromium } = createRequire(import.meta.url)("playwright");
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const mediaPath = args.media;
if (!mediaPath) {
  console.error("--media <file.json> is required");
  process.exit(1);
}
const port = Number(args.port ?? 4417);
const updates = Number(args.updates ?? 2000);
const screenshot = args.screenshot;
const dist = resolve(args.dist ?? "dist");
const mediaJson = readFileSync(mediaPath);
const media = JSON.parse(mediaJson.toString());

// 1×1 transparent PNG for every poster.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = join(dist, url.pathname);
  if (!file.startsWith(dist) || !existsSync(file) || url.pathname === "/") file = join(dist, "index.html");
  res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(port, r));

const API = {
  "/api/server-info": { bootstrap_required: false, has_config: true },
  "/api/auth/me": { id: 1, email: "bench@example.invalid", role: "admin", disabled: false },
  "/api/settings/has-config": true,
  "/api/settings": { ftp_host: "ftp.example.invalid", ftp_root: "/media", tmdb_api_key: "***REDACTED***", default_language: "es" },
  "/api/indexing/status": { running: false },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// --cpu 4 emulates a 4× slower CPU (closer to a modest laptop than this box).
const cpu = Number(args.cpu ?? 1);
if (cpu > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
}
let wsServer = null;
await page.routeWebSocket(/\/api\/ws/, (ws) => {
  wsServer = ws;
});
await page.route("**/image.tmdb.org/**", (route) => route.fulfill({ body: PNG, contentType: "image/png" }));
await page.route(/\/api\//, (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/api/media") {
    return route.fulfill({ body: mediaJson, contentType: "application/json" });
  }
  if (url.pathname === "/api/media/badges") {
    return route.fulfill({ body: "{}", contentType: "application/json" });
  }
  const body = API[url.pathname];
  return route.fulfill({ body: JSON.stringify(body ?? []), contentType: "application/json" });
});

await page.addInitScript(() => {
  localStorage.setItem("boxteam_web_token", "bench-token");
  window.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: "longtask", buffered: true });
});

const blockingSince = (t0) =>
  page.evaluate((t0) => {
    const tasks = window.__longTasks.filter((t) => t.start >= t0);
    return {
      tbt: Math.round(tasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0)),
      longest: Math.round(tasks.reduce((m, t) => Math.max(m, t.duration), 0)),
      count: tasks.length,
    };
  }, t0);
const now = () => page.evaluate(() => performance.now());

const result = { items: media.length, cpuThrottle: cpu };

// ── 1. Initial load → first poster card on screen ───────────────────────
const tNav = Date.now();
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector("[data-alpha]", { timeout: 60_000 });
result.firstCardMs = Date.now() - tNav;
await page.waitForTimeout(1000);
result.loadBlocking = await blockingSince(0);

// ── 2. Typing a search, one key at a time ───────────────────────────────
const search = page.locator('input[placeholder*="release group"]:visible').first();
await search.click();
let t0 = await now();
const tSearch = Date.now();
await search.pressSequentially("night", { delay: 60 });
await page.waitForTimeout(800);
result.searchTypingMs = Date.now() - tSearch - 800;
result.searchBlocking = await blockingSince(t0);
await search.fill("");
await page.waitForTimeout(800);

// ── 3. Tab switches (Películas → Series → Todo) ─────────────────────────
t0 = await now();
const tabTimes = [];
for (const path of ["/peliculas", "/series", "/"]) {
  const t = Date.now();
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForTimeout(50);
  await page.waitForSelector("[data-alpha]");
  tabTimes.push(Date.now() - t);
}
await page.waitForTimeout(500);
result.tabSwitchBlocking = await blockingSince(t0);

// ── 4. Scroll the grid top → bottom, frame pacing ───────────────────────
let profiler = null;
if (args.profile) {
  profiler = await page.context().newCDPSession(page);
  await profiler.send("Profiler.enable");
  await profiler.send("Profiler.start");
}
result.scroll = await page.evaluate(async () => {
  const el = [...document.querySelectorAll("div")].find(
    (d) => d.scrollHeight > d.clientHeight * 3 && getComputedStyle(d).overflowY === "auto",
  );
  if (!el) return null;
  const frames = [];
  let last = performance.now();
  const steps = 240;
  const total = Math.min(el.scrollHeight - el.clientHeight, 200_000);
  for (let i = 1; i <= steps; i++) {
    el.scrollTop = (total * i) / steps;
    await new Promise((r) => requestAnimationFrame(r));
    const t = performance.now();
    frames.push(t - last);
    last = t;
  }
  frames.sort((a, b) => a - b);
  const p = (q) => Math.round(frames[Math.floor(frames.length * q)] * 10) / 10;
  return { frames: frames.length, p50: p(0.5), p95: p(0.95), max: Math.round(frames[frames.length - 1]), over33ms: frames.filter((f) => f > 33).length };
});

if (profiler) {
  const { profile } = await profiler.send("Profiler.stop");
  (await import("node:fs")).writeFileSync(args.profile, JSON.stringify(profile));
}

// ── 5. TMDB update storm over WebSocket (what a big index looks like) ──
if (wsServer && updates > 0) {
  t0 = await now();
  const tStorm = Date.now();
  const ids = media.map((m) => m.id);
  for (let i = 0; i < updates; i++) {
    const id = ids[(i * 7919) % ids.length];
    wsServer.send(JSON.stringify({ event: "index:update", payload: { id, tmdb_rating: 5 + (i % 50) / 10 } }));
    if (i % 100 === 99) await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1500);
  result.updateStorm = { updates, wallMs: Date.now() - tStorm - 1500, ...(await blockingSince(t0)) };
}

result.heapMB = await page.evaluate(() =>
  performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
);
result.tabSwitchMs = tabTimes;

if (screenshot) {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: screenshot });
}

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
