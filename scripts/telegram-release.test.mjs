import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_LIMIT,
  buildReleaseMessage,
  dockerImageFromWorkflow,
  extractTelegramOverride,
  inlineMarkdownToHtml,
  missingAssets,
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

test("message has header, notes, upload hint and no GitHub link when private", () => {
  const msg = buildReleaseMessage({
    appName: "BoxTeam",
    tag: "v0.18.0",
    notes: NOTES,
    uploads: [{ label: "el instalador de Windows" }],
    dockerImage: "ghcr.io/cucumba88/boxteam",
  });
  assert.ok(msg.startsWith("🚀 <b>BoxTeam 0.18.0 ya disponible</b>\n\n"));
  assert.ok(msg.includes("<b>🎬 Detección</b>\n• 🐛 <b>Nombres</b>"));
  assert.ok(msg.includes("📥 <b>El instalador de Windows</b>: aquí abajo 👇"));
  assert.ok(msg.includes("<code>ghcr.io/cucumba88/boxteam:0.18.0</code>"));
  assert.ok(!msg.includes("github.com"));
  assert.ok(!msg.includes("Versión 0.18.0"));
});

test("long notes are cut at whole blocks and stay under the limit", () => {
  const long = Array.from({ length: 30 }, (_, s) =>
    `### Sección ${s}\n\n` + Array.from({ length: 10 }, (_, i) => `- Cambio ${s}.${i} ${"x".repeat(40)}`).join("\n"),
  ).join("\n\n");
  const msg = buildReleaseMessage({ appName: "BoxTeam", tag: "v1.0.0", notes: long, releaseUrl: "https://github.com/o/r/releases/tag/v1.0.0" });
  assert.ok(visibleLength(msg) <= MESSAGE_LIMIT);
  assert.ok(msg.includes("…y más cambios en las notas completas."));
  assert.ok(msg.trimEnd().endsWith('Notas completas en GitHub</a>'));
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

test("docker image name is read from build-docker.yml", () => {
  const yaml = "env:\n  IMAGE: ghcr.io/${{ github.repository_owner }}/boxteam\n";
  assert.equal(dockerImageFromWorkflow(yaml, "cucumba88"), "ghcr.io/cucumba88/boxteam");
  assert.equal(dockerImageFromWorkflow("", "x"), null);
});

test("exe caption", () => {
  assert.equal(
    uploadCaption({ appName: "BoxTeam", tag: "v0.18.0", name: "BoxTeam_0.18.0_x64-setup.exe" }),
    "🪟 BoxTeam 0.18.0 para Windows (instalador)",
  );
});
