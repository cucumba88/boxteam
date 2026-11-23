#!/usr/bin/env node
// Announces a GitHub release on Telegram: one message with the highlights
// (built from the release notes), direct download links to the installers
// and a link to the release page.
//
// Run by .github/workflows/telegram-release.yml whenever a build of a v* tag
// finishes. It only posts once the release is complete (.exe and Linux
// packages attached, Docker build finished) and only once per release: after
// posting it appends a hidden marker to the release notes.
//
// Environment:
//   GITHUB_TOKEN, GITHUB_REPOSITORY        (set by GitHub Actions)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   (repo secrets)
//   RELEASE_TAG      tag to announce; empty or not v* = latest release
//   APP_NAME         app name in the message (default BoxTeam)
//   FORCE=true       post even if already posted or builds are missing
//   DRY_RUN=true     send nothing; print the message to the log and job summary
//   EDIT_MESSAGE_ID  rewrite an already posted announcement (that message id)
//                    with the current format instead of posting a new one
//   NOTES_WAIT_SECONDS   how long to wait for the release notes (default 900)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Telegram limits: 4096 chars per message, counted in UTF-16 units over the
// visible text (tags stripped).
export const MESSAGE_LIMIT = 4096;
export const SENT_MARKER = "<!-- telegram: publicado -->";

// ---------------------------------------------------------------------------
// Formatting (pure, tested in telegram-release.test.mjs)
// ---------------------------------------------------------------------------

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Length as Telegram counts it: visible text in UTF-16 units. */
export function visibleLength(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").length;
}

/** Inline Markdown (bold, italic, code, links) to Telegram HTML. */
export function inlineMarkdownToHtml(text) {
  // Pull code spans out first so nothing inside them gets formatted.
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) =>
    `<a href="${url.replace(/"/g, "&quot;")}">${label}</a>`,
  );
  out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  out = out.replace(/__(.+?)__/g, "<b>$1</b>");
  out = out.replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1<i>$2</i>");
  out = out.replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, "$1<i>$2</i>");
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  return out;
}

/** Removes HTML comments (markers, the <!-- telegram --> block) from notes. */
export function stripComments(markdown) {
  return markdown.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Hand-written Telegram text: if the notes contain a block
 *   <!-- telegram
 *   ...
 *   -->
 * that text is used verbatim instead of the automatic summary. GitHub
 * doesn't render it.
 */
export function extractTelegramOverride(body) {
  const match = /<!--\s*telegram\s*\n([\s\S]*?)-->/.exec(body ?? "");
  const text = match?.[1]?.trim();
  return text ? text : null;
}

/**
 * Converts GitHub-flavoured release notes into Telegram HTML blocks.
 * Each block is { kind: "heading" | "item" | "text", html }.
 */
export function notesToBlocks(markdown) {
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "text", html: inlineMarkdownToHtml(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (const raw of stripComments(markdown).replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    // "## Versión X — date" is already in the message header.
    if (/^#{1,2}\s+versi[oó]n\b/i.test(line)) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", html: `<b>${inlineMarkdownToHtml(heading[1].replace(/\*\*/g, ""))}</b>` });
      continue;
    }
    const item = /^[-*+]\s+(.*)$/.exec(line) ?? /^\d+[.)]\s+(.*)$/.exec(line);
    if (item) {
      flush();
      blocks.push({ kind: "item", html: `• ${inlineMarkdownToHtml(item[1])}` });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      blocks.push({ kind: "text", html: `<i>${inlineMarkdownToHtml(quote[1])}</i>` });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Joins blocks: blank line before headings and paragraphs, list items tight. */
export function joinBlocks(blocks) {
  let out = "";
  let prev = null;
  for (const block of blocks) {
    if (out) {
      const tight = block.kind === "item" && (prev === "item" || prev === "heading");
      out += tight ? "\n" : "\n\n";
    }
    out += block.html;
    prev = block.kind;
  }
  return out;
}

/** "v0.18.0" -> "0.18.0" */
export function versionFromTag(tag) {
  return tag.replace(/^v/i, "");
}

/**
 * Builds the whole message. If the notes don't fit, whole blocks are dropped
 * from the end (never mid-line) and a "more changes" line is added.
 */
export function buildReleaseMessage({
  appName,
  tag,
  notes,
  downloads = [],
  releaseUrl = null,
  limit = MESSAGE_LIMIT,
}) {
  const version = versionFromTag(tag);
  const header = `🚀 <b>${escapeHtml(appName)} ${escapeHtml(version)} ya disponible</b>`;

  const footer = [];
  if (downloads.length) {
    footer.push(
      ["📥 <b>Descargas</b>", ...downloads.map((d) => `• <a href="${escapeAttr(d.url)}">${escapeHtml(d.label)}</a>`)].join("\n"),
    );
  }
  if (releaseUrl) footer.push(`🔗 <a href="${escapeAttr(releaseUrl)}">Notas completas en GitHub</a>`);
  const footerHtml = footer.join("\n\n");

  const override = extractTelegramOverride(notes);
  let blocks = override
    ? override.split(/\n{2,}/).map((p) => ({ kind: "text", html: escapeHtml(p) }))
    : notesToBlocks(notes ?? "");

  const compose = (bs, truncated) =>
    [header, joinBlocks(bs) + (truncated ? "\n\n<i>…y más cambios.</i>" : ""), footerHtml]
      .filter((s) => s.trim())
      .join("\n\n");

  let message = compose(blocks, false);
  if (visibleLength(message) <= limit) return message;

  // Too long: drop blocks from the end, plus any heading left without items.
  while (blocks.length) {
    blocks = blocks.slice(0, -1);
    while (blocks.length && blocks[blocks.length - 1].kind === "heading") blocks = blocks.slice(0, -1);
    message = compose(blocks, true);
    if (visibleLength(message) <= limit) return message;
  }
  return compose([], true);
}

function escapeAttr(url) {
  return escapeHtml(url).replace(/"/g, "&quot;");
}

/** Installers worth linking, in the order they are listed in the message. */
const DOWNLOAD_KINDS = [
  { test: /-setup\.exe$/i, label: "Windows (instalador)" },
  { test: /portable.*\.zip$/i, label: "Windows (portable)" },
  { test: /\.dmg$/i, label: "macOS (Apple Silicon)" },
  { test: /\.AppImage$/, label: "Linux (AppImage)" },
  { test: /\.deb$/i, label: "Linux (.deb)" },
  { test: /\.rpm$/i, label: "Linux (.rpm)" },
];

/**
 * Direct download links for the release's installers: [{ label, url }].
 * Signatures, latest.json and the updater tarballs are left out.
 */
export function downloadLinks(assets) {
  const links = [];
  for (const kind of DOWNLOAD_KINDS) {
    const asset = assets.find((a) => kind.test.test(a.name));
    if (asset?.browser_download_url) links.push({ label: kind.label, url: asset.browser_download_url });
  }
  return links;
}

/** Which platform builds have not attached their files yet. */
export function missingAssets(assets) {
  const names = assets.map((a) => a.name);
  const missing = [];
  if (!names.some((n) => /\.exe$/i.test(n))) missing.push("Windows (.exe)");
  if (!names.some((n) => /\.(AppImage|deb)$/i.test(n))) missing.push("Linux (AppImage/.deb)");
  return missing;
}

/**
 * Cleans up a chat id pasted into the secret: surrounding quotes/spaces, a
 * leading "#", or a whole Telegram Web URL (https://web.telegram.org/k/#-123).
 */
export function normalizeChatId(raw) {
  let id = String(raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const hash = id.lastIndexOf("#");
  if (hash >= 0) id = id.slice(hash + 1);
  return id.trim();
}

// ---------------------------------------------------------------------------
// GitHub and Telegram
// ---------------------------------------------------------------------------

const env = (name, fallback = "") => (process.env[name] ?? "").trim() || fallback;
const truthy = (v) => /^(1|true|yes|sí|si)$/i.test(String(v ?? "").trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[telegram] ${msg}`);
const notice = (msg) => console.log(`::notice title=Telegram::${msg}`);

async function github(pathname, { method = "GET", body, accept } = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${method} ${pathname}: ${res.status} ${await res.text()}`);
  return accept === "application/octet-stream" ? Buffer.from(await res.arrayBuffer()) : res.json();
}

async function telegram(method, payload) {
  const token = env("TELEGRAM_BOT_TOKEN");
  const isForm = payload instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? payload : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(`Telegram ${method}: ${data.description ?? res.status}`);
    err.description = data.description ?? "";
    err.parameters = data.parameters ?? {};
    throw err;
  }
  return data.result;
}

async function findRelease(repo, tag) {
  if (/^v\d/.test(tag)) return github(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  return github(`/repos/${repo}/releases/latest`);
}

/** Latest Docker build of the tag: "success", "failure", "pending" or null. */
async function dockerBuildState(repo, tag) {
  const runs = await github(
    `/repos/${repo}/actions/workflows/build-docker.yml/runs?branch=${encodeURIComponent(tag)}&event=push&per_page=1`,
  );
  const run = runs?.workflow_runs?.[0];
  if (!run) return null;
  if (run.status !== "completed") return "pending";
  return run.conclusion === "success" ? "success" : "failure";
}

function writeSummary(markdown) {
  const file = env("GITHUB_STEP_SUMMARY");
  if (file) fs.appendFileSync(file, `${markdown}\n`);
}

/**
 * On "chat not found": log which bot the token belongs to and the chats it
 * has seen recently, so the right TELEGRAM_CHAT_ID is visible in the log.
 */
async function explainChatError(chatId) {
  const me = await telegram("getMe", {});
  log(`token belongs to bot @${me.username} ("${me.first_name}")`);
  log(`TELEGRAM_CHAT_ID has ${chatId.length} chars, starts with "${chatId.slice(0, 4)}"`);
  const updates = await telegram("getUpdates", { allowed_updates: ["message", "my_chat_member", "channel_post"] }).catch(() => []);
  const chats = new Map();
  for (const u of updates) {
    const chat = (u.message ?? u.my_chat_member ?? u.channel_post)?.chat;
    if (chat && chat.type !== "private") chats.set(chat.id, `${chat.id} (${chat.type}) ${chat.title ?? ""}`);
  }
  if (chats.size) {
    log(`chats this bot has seen recently:\n  ${[...chats.values()].join("\n  ")}`);
  } else {
    log("this bot has no recent group activity; if it is not in the group, add it, then write any message in the group and re-run");
  }
}

export async function main() {
  const repo = env("GITHUB_REPOSITORY");
  const appName = env("APP_NAME", "BoxTeam");
  const force = truthy(env("FORCE"));
  const dryRun = truthy(env("DRY_RUN"));
  const notesWait = Number(env("NOTES_WAIT_SECONDS", "900"));

  if (!dryRun && (!env("TELEGRAM_BOT_TOKEN") || !env("TELEGRAM_CHAT_ID"))) {
    notice("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret missing: nothing posted.");
    return;
  }

  let release = await findRelease(repo, env("RELEASE_TAG"));
  if (!release) {
    notice(`No release for "${env("RELEASE_TAG") || "latest"}" yet.`);
    return;
  }
  const tag = release.tag_name;
  log(`release ${tag} (${release.html_url})`);

  // Without an explicit tag (e.g. a manual Windows re-run from main) only a
  // recent release is announced, so an old one never gets posted by surprise.
  const explicitTag = /^v\d/.test(env("RELEASE_TAG"));
  const ageDays = (Date.now() - Date.parse(release.published_at ?? release.created_at)) / 86_400_000;
  if (!explicitTag && !force && ageDays > 3) {
    notice(`${tag} is ${Math.floor(ageDays)} days old and no tag was given: skipped.`);
    return;
  }

  if (release.draft || release.prerelease) {
    if (!force) {
      notice(`${tag} is a draft or prerelease: skipped.`);
      return;
    }
  }
  const editMessageId = Number(env("EDIT_MESSAGE_ID")) || null;
  if ((release.body ?? "").includes(SENT_MARKER) && !force && !dryRun && !editMessageId) {
    notice(`${tag} was already posted to Telegram.`);
    return;
  }

  // Complete? Windows and Linux attach files; Docker doesn't, so check its run.
  const missing = missingAssets(release.assets ?? []);
  const docker = await dockerBuildState(repo, tag).catch((e) => {
    log(`could not read Docker build: ${e.message}`);
    return null;
  });
  if (!force && (missing.length || docker === "pending")) {
    const waiting = [...missing, ...(docker === "pending" ? ["Docker"] : [])];
    notice(`${tag}: waiting for ${waiting.join(", ")}. Will post when the last build finishes.`);
    return;
  }

  // Notes are often added while builds run: give them a while.
  const deadline = Date.now() + notesWait * 1000;
  while (!stripComments(release.body ?? "").trim() && !force && Date.now() < deadline) {
    log("release has no notes yet; waiting 30 s…");
    await sleep(30_000);
    release = await findRelease(repo, tag);
  }
  if (!stripComments(release.body ?? "").trim() && !force) {
    throw new Error(
      `${tag} still has no notes after ${notesWait} s. Add them and run "Telegram release" manually with the tag.`,
    );
  }


  const message = buildReleaseMessage({
    appName,
    tag,
    notes: release.body ?? "",
    downloads: downloadLinks(release.assets ?? []),
    releaseUrl: release.html_url,
  });

  writeSummary(
    `### Telegram message for ${tag}\n\n${dryRun ? "_Dry run: not sent._\n\n" : ""}` +
      "```html\n" + message + "\n```",
  );
  log(`message (${visibleLength(message)} chars):\n${message}`);

  if (dryRun) {
    notice(`Dry run: the ${tag} message is in the job summary. Nothing was sent.`);
    return;
  }

  let chatId = normalizeChatId(env("TELEGRAM_CHAT_ID"));
  let sent;
  try {
    try {
      sent = await telegram(editMessageId ? "editMessageText" : "sendMessage", {
        chat_id: chatId,
        ...(editMessageId ? { message_id: editMessageId } : {}),
        text: message,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      // A basic group that became a supergroup gets a new -100… id; and
      // Telegram Web K shows supergroups as #-N, while the Bot API wants -100N.
      const migrated = e.parameters?.migrate_to_chat_id;
      const supergroupId = /chat not found/i.test(e.description ?? "") && /^-\d+$/.test(chatId) && !chatId.startsWith("-100")
        ? `-100${chatId.slice(1)}`
        : null;
      if (!migrated && !supergroupId) throw e;
      chatId = String(migrated ?? supergroupId);
      log(`retrying with chat id ${chatId}`);
      sent = await telegram(editMessageId ? "editMessageText" : "sendMessage", {
        chat_id: chatId,
        ...(editMessageId ? { message_id: editMessageId } : {}),
        text: message,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    }
  } catch (e) {
    if (/chat not found|bot was kicked|not a member|forbidden/i.test(e.description ?? "")) {
      await explainChatError(chatId).catch((d) => log(`diagnostics failed: ${d.message}`));
      throw e;
    }
    if (!/parse entities|can't parse/i.test(e.description ?? "")) throw e;
    // If Telegram rejects the HTML, plain text beats no post at all.
    log(`HTML rejected (${e.description}); sending plain text`);
    sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: message.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
      link_preview_options: { is_disabled: true },
    });
  }
  log(`message ${editMessageId ? "edited" : "sent"} (id ${sent.message_id})`);
  if (chatId !== normalizeChatId(env("TELEGRAM_CHAT_ID"))) {
    notice(`Posted using chat id ${chatId}: set the TELEGRAM_CHAT_ID secret to that value.`);
  }

  if (editMessageId) {
    notice(`${tag}: announcement ${editMessageId} rewritten.`);
    return;
  }

  // Hidden marker so the same release is never announced twice.
  if (!(release.body ?? "").includes(SENT_MARKER)) {
    const fresh = await findRelease(repo, tag);
    await github(`/repos/${repo}/releases/${release.id}`, {
      method: "PATCH",
      body: { body: `${(fresh?.body ?? release.body ?? "").trimEnd()}\n\n${SENT_MARKER}\n` },
    });
  }
  notice(`${tag} posted to Telegram.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`::error title=Telegram::${e.message}`);
    process.exit(1);
  });
}
