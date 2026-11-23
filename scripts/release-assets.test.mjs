import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildUpdaterManifest,
  cargoPackageVersion,
  findRelease,
  updaterPlatform,
  versionFromTag,
  versionMismatches,
} from "./release-assets.mjs";

const CARGO = `[package]
name = "boxteam"
version = "0.19.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tauri = { version = "2.12.5" }
`;

test("versionFromTag only accepts vX.Y.Z", () => {
  assert.equal(versionFromTag("v0.19.0"), "0.19.0");
  assert.equal(versionFromTag("v1.2.10"), "1.2.10");
  assert.equal(versionFromTag("0.19.0"), null);
  assert.equal(versionFromTag("v0.19"), null);
  assert.equal(versionFromTag("v0.19.0-rc1"), null);
  assert.equal(versionFromTag(undefined), null);
});

test("cargoPackageVersion reads [package], not a dependency version", () => {
  assert.equal(cargoPackageVersion(CARGO), "0.19.0");
  const depsFirst = `[dependencies]\nfoo = "1"\nversion = "9.9.9"\n\n[package]\nname = "x"\nversion = "0.2.0"\n`;
  assert.equal(cargoPackageVersion(depsFirst), "0.2.0");
  assert.equal(cargoPackageVersion("[dependencies]\n"), null);
});

test("versionMismatches is empty when everything agrees", () => {
  assert.deepEqual(versionMismatches("v0.19.0", { packageJson: { version: "0.19.0" }, cargoToml: CARGO }), []);
});

test("versionMismatches names each file that is behind the tag", () => {
  const problems = versionMismatches("v0.20.0", { packageJson: { version: "0.19.0" }, cargoToml: CARGO });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /package\.json tiene 0\.19\.0/);
  assert.match(problems[1], /Cargo\.toml tiene 0\.19\.0/);
});

test("versionMismatches rejects a tag that isn't a release", () => {
  assert.equal(versionMismatches("latest", { packageJson: { version: "0.19.0" }, cargoToml: CARGO }).length, 1);
});

test("findRelease finds drafts too", () => {
  const releases = [
    { id: 1, tag_name: "v0.18.0", draft: false },
    { id: 2, tag_name: "v0.19.0", draft: true },
  ];
  assert.equal(findRelease(releases, "v0.19.0").id, 2);
  assert.equal(findRelease(releases, "v0.20.0"), null);
});

test("the repo's own versions agree with each other", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const cargoToml = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
  assert.deepEqual(versionMismatches(`v${packageJson.version}`, { packageJson, cargoToml }), []);
});

test("updaterPlatform maps the installers the in-app updater can install", () => {
  assert.equal(updaterPlatform("BoxTeam_0.21.0_x64-setup.exe"), "windows-x86_64");
  assert.equal(updaterPlatform("BoxTeam_0.21.0_amd64.AppImage"), "linux-x86_64");
  assert.equal(updaterPlatform("BoxTeam_0.21.0_aarch64.app.tar.gz"), "darwin-aarch64");
  assert.equal(updaterPlatform("BoxTeam_0.21.0_amd64.deb"), null);
  assert.equal(updaterPlatform("boxteam-windows-portable-0.21.0.zip"), null);
  assert.equal(updaterPlatform("BoxTeam_0.21.0_x64-setup.exe.sig"), null);
});

test("buildUpdaterManifest lists only signed installers, with download URLs", () => {
  const manifest = buildUpdaterManifest({
    repo: "owner/boxteam",
    tag: "v0.21.0",
    notes: "Novedades",
    pubDate: "2026-11-23T12:00:00.000Z",
    assetNames: [
      "BoxTeam_0.21.0_x64-setup.exe",
      "BoxTeam_0.21.0_x64-setup.exe.sig",
      "BoxTeam_0.21.0_amd64.AppImage",
      "BoxTeam_0.21.0_amd64.deb",
    ],
    signatures: { "BoxTeam_0.21.0_x64-setup.exe": "c2lnbmF0dXJl\n" },
  });
  assert.deepEqual(manifest, {
    version: "0.21.0",
    notes: "Novedades",
    pub_date: "2026-11-23T12:00:00.000Z",
    platforms: {
      "windows-x86_64": {
        signature: "c2lnbmF0dXJl",
        url: "https://github.com/owner/boxteam/releases/download/v0.21.0/BoxTeam_0.21.0_x64-setup.exe",
      },
    },
  });
});
