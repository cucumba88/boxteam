#!/usr/bin/env node
// Manages the GitHub release of a tag for .github/workflows/release.yml, so a
// release only becomes visible once every check and build has passed:
//
//   node scripts/release-assets.mjs check-version <tag>
//       Fails unless the tag matches package.json and src-tauri/Cargo.toml.
//   node scripts/release-assets.mjs ensure-draft <tag>
//       Creates the release as a draft (or reuses the one that exists).
//   node scripts/release-assets.mjs upload <tag> <file>...
//       Attaches the files, replacing assets with the same name.
//   node scripts/release-assets.mjs publish <tag>
//       Turns the draft into a published release marked as latest.
//   node scripts/release-assets.mjs updater-manifest <tag>
//       Builds latest.json for the in-app updater from the release's
//       installers + their .sig files and attaches it to the release.
//
// Uses the REST API with fetch (no gh CLI needed on the runner). Drafts are
// invisible to GET /releases/tags/{tag}, so the release is found by listing.
//
// Environment: GITHUB_TOKEN, GITHUB_REPOSITORY (set by GitHub Actions).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.github.com";
const UPLOADS = "https://uploads.github.com";

// ---------------------------------------------------------------------------
// Pure helpers (tested in release-assets.test.mjs)
// ---------------------------------------------------------------------------

/** "v0.19.0" → "0.19.0"; null when it isn't a release tag. */
export function versionFromTag(tag) {
  const m = /^v(\d+\.\d+\.\d+)$/.exec(tag ?? "");
  return m ? m[1] : null;
}

/** The `version = "…"` of the [package] section of a Cargo.toml. */
export function cargoPackageVersion(toml) {
  const pkg = /^\[package\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(toml);
  const m = pkg && /^version\s*=\s*"([^"]+)"/m.exec(pkg[1]);
  return m ? m[1] : null;
}

/** List of problems ([] = OK) between the tag and the app's versions. */
export function versionMismatches(tag, { packageJson, cargoToml }) {
  const version = versionFromTag(tag);
  if (!version) return [`«${tag}» no es un tag de release (vX.Y.Z)`];
  const problems = [];
  const npm = packageJson?.version;
  const cargo = cargoPackageVersion(cargoToml ?? "");
  if (npm !== version) problems.push(`package.json tiene ${npm}, el tag es ${tag}`);
  if (cargo !== version) problems.push(`src-tauri/Cargo.toml tiene ${cargo}, el tag es ${tag}`);
  return problems;
}

/** The release of a tag among a page of releases (drafts included). */
export function findRelease(releases, tag) {
  return releases.find((r) => r.tag_name === tag) ?? null;
}


/**
 * Updater platform of a release asset (Tauri `latest.json` keys), or null
 * when the asset isn't something the in-app updater installs.
 */
export function updaterPlatform(assetName) {
  if (/-setup\.exe$/i.test(assetName)) return "windows-x86_64";
  if (/\.AppImage$/.test(assetName)) return "linux-x86_64";
  if (/_aarch64\.app\.tar\.gz$/.test(assetName)) return "darwin-aarch64";
  if (/_x64\.app\.tar\.gz$/.test(assetName)) return "darwin-x86_64";
  return null;
}

/**
 * The `latest.json` the Tauri updater reads. `signatures` maps an asset name
 * to the contents of its `<name>.sig`; installers without a signature are
 * left out (the updater would reject them anyway).
 */
export function buildUpdaterManifest({ repo, tag, notes, pubDate, assetNames, signatures }) {
  const version = versionFromTag(tag);
  if (!version) throw new Error(`«${tag}» no es un tag de release (vX.Y.Z)`);
  const platforms = {};
  for (const name of assetNames) {
    const platform = updaterPlatform(name);
    const signature = signatures[name];
    if (!platform || !signature) continue;
    platforms[platform] = {
      signature: signature.trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
    };
  }
  return { version, notes: notes ?? "", pub_date: pubDate, platforms };
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`falta la variable de entorno ${name}`);
  return value;
}

async function gh(method, url, body, headers = {}) {
  const res = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function getRelease(repo, tag) {
  for (let page = 1; page <= 5; page += 1) {
    const releases = await gh("GET", `/repos/${repo}/releases?per_page=100&page=${page}`);
    const found = findRelease(releases, tag);
    if (found || releases.length < 100) return found;
  }
  return null;
}

async function requireRelease(repo, tag) {
  const release = await getRelease(repo, tag);
  if (!release) throw new Error(`no existe la release ${tag}`);
  return release;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function checkVersion(tag) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const problems = versionMismatches(tag, {
    packageJson: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")),
    cargoToml: fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8"),
  });
  if (problems.length) throw new Error(`versión incoherente:\n  - ${problems.join("\n  - ")}`);
  console.log(`[release] ${tag} coincide con package.json y Cargo.toml`);
}

async function ensureDraft(repo, tag) {
  const existing = await getRelease(repo, tag);
  if (existing) {
    console.log(`[release] ${tag} ya existe (${existing.draft ? "borrador" : "publicada"})`);
    return;
  }
  await gh("POST", `/repos/${repo}/releases`, { tag_name: tag, name: tag, body: "", draft: true });
  console.log(`[release] creado el borrador de ${tag}`);
}

async function upload(repo, tag, files) {
  if (!files.length) throw new Error("no hay archivos que subir (¿falló el build?)");
  const release = await requireRelease(repo, tag);
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`no existe ${file}`);
    const name = path.basename(file);
    const old = release.assets.find((a) => a.name === name);
    if (old) await gh("DELETE", `/repos/${repo}/releases/assets/${old.id}`);
    const data = fs.readFileSync(file);
    await gh(
      "POST",
      `${UPLOADS}/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
      new Uint8Array(data),
      { "Content-Type": "application/octet-stream" },
    );
    console.log(`[release] ${tag}: subido ${name} (${(data.length / 1048576).toFixed(1)} MB)`);
  }
}

async function publish(repo, tag) {
  const release = await requireRelease(repo, tag);
  if (!release.draft) {
    console.log(`[release] ${tag} ya estaba publicada`);
    return;
  }
  await gh("PATCH", `/repos/${repo}/releases/${release.id}`, { draft: false, make_latest: "true" });
  console.log(`[release] ${tag} publicada`);
}


async function downloadAsset(repo, asset) {
  const res = await fetch(`${API}/repos/${repo}/releases/assets/${asset.id}`, {
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: "application/octet-stream",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`descarga de ${asset.name} → ${res.status}`);
  return res.text();
}

async function updaterManifest(repo, tag) {
  const release = await requireRelease(repo, tag);
  const names = release.assets.map((a) => a.name);
  const signatures = {};
  for (const asset of release.assets) {
    if (!asset.name.endsWith(".sig")) continue;
    const target = asset.name.slice(0, -".sig".length);
    if (updaterPlatform(target)) signatures[target] = await downloadAsset(repo, asset);
  }
  const manifest = buildUpdaterManifest({
    repo,
    tag,
    notes: release.body,
    pubDate: new Date().toISOString(),
    assetNames: names,
    signatures,
  });
  const platforms = Object.keys(manifest.platforms);
  if (!platforms.length) throw new Error(`${tag} no tiene instaladores firmados (.sig) para el actualizador`);
  const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || process.env.TMPDIR || "/tmp", "updater-"));
  const file = path.join(dir, "latest.json");
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  await upload(repo, tag, [file]);
  console.log(`[release] ${tag}: latest.json con ${platforms.join(", ")}`);
}

export async function main(argv = process.argv.slice(2)) {
  const [command, tag, ...files] = argv;
  if (!tag) throw new Error("uso: release-assets.mjs <check-version|ensure-draft|upload|publish|updater-manifest> <tag> [archivos…]");
  if (command === "check-version") return checkVersion(tag);
  const repo = env("GITHUB_REPOSITORY");
  if (command === "ensure-draft") return ensureDraft(repo, tag);
  if (command === "upload") return upload(repo, tag, files);
  if (command === "publish") return publish(repo, tag);
  if (command === "updater-manifest") return updaterManifest(repo, tag);
  throw new Error(`comando desconocido: ${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
