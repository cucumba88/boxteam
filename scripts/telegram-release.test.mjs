import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_LIMIT,
  buildReleaseMessage,
  extractTelegramOverride,
  inlineMarkdownToHtml,
  missingAssets,
  normalizeChatId,
  notesToBlocks,
  uploadCaption,
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

test("message has header, notes and upload hint, and no links or Docker image", () => {
  const msg = buildReleaseMessage({
    appName: "BoxTeam",
    tag: "v0.18.0",
    notes: NOTES,
    uploads: [{ label: "el instalador de Windows" }],
  });
  assert.ok(msg.startsWith("🚀 <b>BoxTeam 0.18.0 ya disponible</b>\n\n"));
  assert.ok(msg.includes("<b>🎬 Detección</b>\n• 🐛 <b>Nombres</b>"));
  assert.ok(msg.includes("📥 <b>El instalador de Windows</b>: aquí abajo 👇"));
  // Nothing that reveals the owner's account: no GitHub links, no Docker image.
  assert.ok(!/github\.com|ghcr\.io|cucumba88|docker/i.test(msg));
  assert.ok(!msg.includes("Versión 0.18.0"));
});

test("long notes are cut at whole blocks and stay under the limit", () => {
  const long = Array.from({ length: 30 }, (_, s) =>
    `### Sección ${s}\n\n` + Array.from({ length: 10 }, (_, i) => `- Cambio ${s}.${i} ${"x".repeat(40)}`).join("\n"),
  ).join("\n\n");
  const msg = buildReleaseMessage({ appName: "BoxTeam", tag: "v1.0.0", notes: long, uploads: [{ label: "el instalador de Windows" }] });
  assert.ok(visibleLength(msg) <= MESSAGE_LIMIT);
  assert.ok(msg.includes("…y más cambios."));
  assert.ok(msg.trimEnd().endsWith("aquí abajo 👇"));
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


test("exe caption", () => {
  assert.equal(
    uploadCaption({ appName: "BoxTeam", tag: "v0.18.0", name: "BoxTeam_0.18.0_x64-setup.exe" }),
    "🪟 BoxTeam 0.18.0 para Windows (instalador)",
  );
});

test("chat id pasted with extras is cleaned up", () => {
  assert.equal(normalizeChatId(" -4490499603 "), "-4490499603");
  assert.equal(normalizeChatId('"-4490499603"'), "-4490499603");
  assert.equal(normalizeChatId("#-4490499603"), "-4490499603");
  assert.equal(normalizeChatId("https://web.telegram.org/k/#-4490499603"), "-4490499603");
  assert.equal(normalizeChatId("@boxteam_canal"), "@boxteam_canal");
});
