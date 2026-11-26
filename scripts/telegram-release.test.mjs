import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_LIMIT,
  buildReleaseMessage,
  extractTelegramOverride,
  inlineMarkdownToHtml,
  missingAssets,
  alternateChatId,
  downloadLinks,
  normalizeChatId,
  notesToBlocks,
  skipsAnnouncement,
  skippedReleases,
  visibleLength,
} from "./telegram-release.mjs";

const NOTES = `## Versión 0.18.0 — 22 de noviembre de 2026

Esta versión trae **BoxTeam** & más.

### 🎬 Detección

- 🐛 **Nombres** como \`Cap.101\` y *Blade Runner 2049*.
- Series con <remake>.

> Nota: tus ajustes se conservan.
`;

test("inline markdown becomes escaped Telegram HTML", () => {
  assert.equal(
    inlineMarkdownToHtml("**a** *b* `c<d>` [x](https://e.com/?a=1&b=2) 1 < 2"),
    '<b>a</b> <i>b</i> <code>c&lt;d&gt;</code> <a href="https://e.com/?a=1&amp;b=2">x</a> 1 &lt; 2',
  );
  // Formatting characters inside code stay literal.
  assert.equal(inlineMarkdownToHtml("`**x**`"), "<code>**x**</code>");
  // snake_case is not italic.
  assert.equal(inlineMarkdownToHtml("library_db_path"), "library_db_path");
});

test("notes become headings, items and paragraphs; version title is dropped", () => {
  const blocks = notesToBlocks(NOTES);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["text", "heading", "item", "item", "text"],
  );
  assert.equal(blocks[1].html, "<b>🎬 Detección</b>");
  assert.match(blocks[3].html, /^• Series con &lt;remake&gt;\.$/);
});

const REPO_RELEASES = "https://github.com/owner/boxteam/releases";
const ASSETS = [
  "BoxTeam_0.18.0_x64-setup.exe",
  "BoxTeam_0.18.0_x64-setup.exe.sig",
  "boxteam-windows-portable-0.18.0.zip",
  "BoxTeam_0.18.0_amd64.AppImage",
  "BoxTeam_0.18.0_amd64.AppImage.sig",
  "BoxTeam_0.18.0_amd64.deb",
  "BoxTeam-0.18.0-1.x86_64.rpm",
  "boxteam_0.18.0_linux_amd64.tar.gz",
  "latest.json",
].map((name) => ({ name, browser_download_url: `${REPO_RELEASES}/download/v0.18.0/${name}` }));

test("download links: installers only, in a fixed order", () => {
  assert.deepEqual(
    downloadLinks(ASSETS).map((d) => d.label),
    ["Windows (instalador)", "Windows (portable)", "Linux (AppImage)", "Linux (.deb)", "Linux (.rpm)"],
  );
  const withMac = [...ASSETS, { name: "BoxTeam_0.18.0_aarch64.dmg", browser_download_url: `${REPO_RELEASES}/download/v0.18.0/BoxTeam_0.18.0_aarch64.dmg` }];
  assert.equal(downloadLinks(withMac)[2].label, "macOS (Apple Silicon)");
});

test("message has header, notes, download links and the release page", () => {
  const msg = buildReleaseMessage({
    appName: "BoxTeam",
    tag: "v0.18.0",
    notes: NOTES,
    downloads: downloadLinks(ASSETS),
    releaseUrl: `${REPO_RELEASES}/tag/v0.18.0`,
  });
  assert.ok(msg.startsWith("🚀 <b>BoxTeam 0.18.0 ya disponible</b>\n\n"));
  assert.ok(msg.includes("<b>🎬 Detección</b>\n• 🐛 <b>Nombres</b>"));
  assert.ok(
    msg.includes(`📥 <b>Descargas</b>\n• <a href="${REPO_RELEASES}/download/v0.18.0/BoxTeam_0.18.0_x64-setup.exe">Windows (instalador)</a>`),
  );
  assert.ok(msg.trimEnd().endsWith(`🔗 <a href="${REPO_RELEASES}/tag/v0.18.0">Notas completas en GitHub</a>`));
  // Every link goes to this repo's own release; no other account, no Docker image.
  const hrefs = [...msg.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 6);
  assert.ok(hrefs.every((h) => h.startsWith(`${REPO_RELEASES}/`)));
  assert.ok(!/ghcr\.io|docker/i.test(msg));
  assert.ok(!msg.includes("Versión 0.18.0"));
});

test("long notes are cut at whole blocks and stay under the limit", () => {
  const long = Array.from({ length: 30 }, (_, s) =>
    `### Sección ${s}\n\n` + Array.from({ length: 10 }, (_, i) => `- Cambio ${s}.${i} ${"x".repeat(40)}`).join("\n"),
  ).join("\n\n");
  const msg = buildReleaseMessage({
    appName: "BoxTeam",
    tag: "v1.0.0",
    notes: long,
    downloads: downloadLinks(ASSETS),
    releaseUrl: `${REPO_RELEASES}/tag/v1.0.0`,
  });
  assert.ok(visibleLength(msg) <= MESSAGE_LIMIT);
  assert.ok(msg.includes("…y más cambios."));
  assert.ok(msg.trimEnd().endsWith("Notas completas en GitHub</a>"));
  // Never ends a section on a bare heading.
  assert.ok(!/<b>Sección \d+<\/b>\n\n<i>…y más/.test(msg));
});

test("a <!-- telegram --> block in the notes replaces the summary", () => {
  const body = `${NOTES}\n<!-- telegram\n🎬 Mejor detección\n\nY <más> cosas\n-->`;
  assert.equal(extractTelegramOverride(body), "🎬 Mejor detección\n\nY <más> cosas");
  const msg = buildReleaseMessage({ appName: "BoxTeam", tag: "v0.18.0", notes: body });
  assert.ok(msg.includes("🎬 Mejor detección\n\nY &lt;más&gt; cosas"));
  assert.ok(!msg.includes("Detección</b>"));
  assert.equal(extractTelegramOverride("<!-- telegram: publicado -->"), null);
});

test("release is complete only with Windows and Linux files", () => {
  assert.deepEqual(missingAssets([{ name: "BoxTeam_0.18.0_amd64.deb" }]), ["Windows (.exe)"]);
  assert.deepEqual(
    missingAssets([{ name: "BoxTeam_0.18.0_x64-setup.exe" }, { name: "BoxTeam_0.18.0_amd64.AppImage" }]),
    [],
  );
});


test("chat id pasted with extras is cleaned up", () => {
  assert.equal(normalizeChatId(" -4490499603 "), "-4490499603");
  assert.equal(normalizeChatId('"-4490499603"'), "-4490499603");
  assert.equal(normalizeChatId("#-4490499603"), "-4490499603");
  assert.equal(normalizeChatId("https://web.telegram.org/k/#-4490499603"), "-4490499603");
  assert.equal(normalizeChatId("@boxteam_canal"), "@boxteam_canal");
});

test("<!-- no-telegram --> in the notes skips the announcement", () => {
  assert.equal(skipsAnnouncement(NOTES), false);
  assert.equal(skipsAnnouncement(null), false);
  assert.equal(skipsAnnouncement(`${NOTES}\n<!-- no-telegram -->`), true);
  assert.equal(skipsAnnouncement("<!--no telegram-->"), true);
  // The "already posted" marker is not an opt-out.
  assert.equal(skipsAnnouncement("<!-- telegram: publicado -->"), false);
});

test("on chat not found, the other form of the group id is tried", () => {
  assert.equal(alternateChatId("-4490499603"), "-1004490499603");
  assert.equal(alternateChatId("-1004490499603"), "-4490499603");
  assert.equal(alternateChatId("@canal"), null);
});

const rel = (tag, body, extra = {}) => ({ tag_name: tag, body, draft: false, prerelease: false, ...extra });

test("skipped releases since the last announcement are carried, newest first", () => {
  const releases = [
    rel("v0.22.5", "## Versión 0.22.5\n\n- C"),
    rel("v0.22.4", "## Versión 0.22.4\n\n- B\n\n<!-- no-telegram -->"),
    // Cancelled release: never shipped, its changes are in the next notes.
    rel("v0.22.3", "## Versión 0.22.3\n\n- A\n\n<!-- no-telegram -->", { draft: true }),
    rel("v0.22.2", "## Versión 0.22.2\n\n- Z\n\n<!-- telegram: publicado -->"),
    rel("v0.22.1", "## Versión 0.22.1\n\n- Y\n\n<!-- no-telegram -->"),
    rel("v0.22.0-beta.1", "- beta", { prerelease: true }),
  ];
  assert.deepEqual(
    skippedReleases(releases, "v0.22.5").map((r) => r.tag),
    ["v0.22.4"],
  );
  // Several skipped in a row, compared as versions (0.10 > 0.9).
  const many = [
    rel("v0.10.1", "x"),
    rel("v0.10.0", "- b\n<!-- no-telegram -->"),
    rel("v0.9.9", "- a\n<!-- no-telegram -->"),
    rel("v0.9.8", "- old\n<!-- telegram: publicado -->"),
  ];
  assert.deepEqual(skippedReleases(many, "v0.10.1").map((r) => r.tag), ["v0.10.0", "v0.9.9"]);
  // Nothing skipped since the last announcement.
  assert.deepEqual(skippedReleases([rel("v1.0.1", "x"), rel("v1.0.0", "y <!-- telegram: publicado -->")], "v1.0.1"), []);
  // Never announced before: don't dump the whole history.
  assert.deepEqual(skippedReleases([rel("v1.0.1", "x"), rel("v1.0.0", "- y")], "v1.0.1"), []);
});

test("a message with skipped releases has one section per version", () => {
  const message = buildReleaseMessage({
    appName: "BoxTeam",
    tag: "v0.22.5",
    notes: "## Versión 0.22.5\n\n### 🐛 Correcciones\n\n- **Uno**",
    earlier: [{ tag: "v0.22.4", notes: "## Versión 0.22.4\n\n- Dos\n\n<!-- no-telegram -->" }],
  });
  assert.match(message, /Incluye también los cambios de la 0\.22\.4, que no se anunciaron\./);
  const newer = message.indexOf("Versión 0.22.5");
  const older = message.indexOf("Versión 0.22.4");
  assert.ok(newer > 0 && older > newer, "newest version first");
  assert.match(message, /• <b>Uno<\/b>/);
  assert.match(message, /• Dos/);
  assert.doesNotMatch(message, /no-telegram/);
});

test("trimming a combined message drops the oldest version first", () => {
  const long = (n) => Array.from({ length: n }, (_, i) => `- Cambio largo número ${i} ${"x".repeat(60)}`).join("\n");
  const message = buildReleaseMessage({
    appName: "BoxTeam",
    tag: "v0.22.5",
    notes: `- Lo nuevo\n${long(10)}`,
    earlier: [{ tag: "v0.22.4", notes: long(80) }],
  });
  assert.ok(visibleLength(message) <= MESSAGE_LIMIT);
  assert.match(message, /Lo nuevo/);
  assert.match(message, /…y más cambios\./);
});
