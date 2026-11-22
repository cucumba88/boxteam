# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required reading before touching code

- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** — exhaustive conventions: vertical-slice frontend layout, design tokens (`--color-*`), `Toggle` for booleans, `formInput*` vs `formSelect*` from `src/lib/formStyles.ts`, no `any` in TS, no `unwrap()` in Rust, `(?ix)` regex mode in parser, etc. All of those rules apply to Claude too. Don't restate them here.
- **[docs/SECURITY.md](docs/SECURITY.md)** — 13-point checklist born from a real audit. **Mandatory** before changing anything under `src-tauri/src/web/`, anything that stores or returns credentials, or anything touching auth/sessions/CORS/CSP. The PR checklist at the bottom is the gate.
- **[README.md](README.md)** — product overview, top-level commands, signing/notarization secrets.

## Web vs Desktop — the most important gotcha

The same React frontend runs in **two surfaces**:

- **Desktop** (Tauri 2.x): native window, IPC via `invoke()`, file pickers, dialogs.
- **Web** (`BOXTEAM_WEBGUI=1`): Axum HTTP server on port 47860 (see `src-tauri/src/web/`), token-auth (`Authorization: Bearer …` from `localStorage`).

Gate desktop-only features with `isTauri()` from `src/lib/transport.ts`. The web router lives in `src/router.tsx` as `WebRouter`; only the desktop router knows about the Wizard. Every UI feature should work in both unless it explicitly requires native OS access — and even then, gate cleanly rather than break web mode.

When you add a route to the Axum API, add the corresponding mapping in `src/lib/transport.ts`'s `WEB_ROUTES` table or the call will throw `No web route for command "<name>"` in web mode only — easy to miss when you tested in `tauri dev`.

## Environment

- **Node 22 is mandatory.** Vite 7 + TypeScript 5.8 don't run on Node 20. The user's system has `nvm`; commands that touch npm/Vite/tsc should be prefixed:
  ```bash
  source ~/.nvm/nvm.sh && nvm use 22 --silent && <command>
  ```
- **`tsc` not in PATH** without `node_modules`. After `npm install` use `./node_modules/.bin/tsc` directly or `npm run build` (which does `tsc && vite build`).
- **`npm install` rewrites `package-lock.json` extensively** if it was generated with a different npm version. If you only ran `npm install` to typecheck, revert the lockfile (`git checkout -- package-lock.json`) before committing — the churn obscures real release diffs.
- **`cargo check` works without `dist/`** in dev profile. `cargo build` in release profile fails the Tauri build script with `resource path '../dist' doesn't exist`. If you need release-cargo before the frontend exists, `mkdir -p dist && touch dist/index.html` as a stub.

## Validation commands

Run these after a batch of changes — they're what `npm run release:patch` runs internally, so they're the canonical gates:

```bash
source ~/.nvm/nvm.sh && nvm use 22 --silent && npm run build   # tsc + vite + chunk warnings
cargo check --manifest-path src-tauri/Cargo.toml               # rust check (no clippy by convention)
cd src-tauri && cargo test                                     # parser unit tests
```

## Release & deploy workflow

This repo uses a per-fix branch + `--no-ff` merge-into-main + tag-on-merge pattern. **Always follow it** — Build Linux, Build Windows and Build Docker only fire on `v*` tag push (or a manual workflow_dispatch), not on pushes to `main`; Docker `latest` moves with each release tag, and the GitHub Release is auto-created with assets by Build Linux (softprops/action-gh-release).

### Standard release sequence

```bash
# 1. Branch
git checkout -b v0.X.Y

# 2. Make code changes (one logical bundle per release — read docs/SECURITY.md if web/auth)

# 3. Commit the actual changes. Multi-fix bundles → one commit per scope:
#    "perf(library): …", "fix(detail): …", "sec: …", etc.
git add <files> && git commit -m "<conventional commit>"

# 4. Version bump + verify (this script runs the full build + cargo check):
source ~/.nvm/nvm.sh && nvm use 22 --silent && npm run release:patch  # or :minor / :major

# 5. Commit the version bump
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release v0.X.Y"

# 6. Merge into main with --no-ff (preserves the branch's history graph)
git checkout main
git merge --no-ff v0.X.Y -m "Merge v0.X.Y — <short summary>"

# 7. Tag the merge commit, push main, push tag, delete branch
git tag v0.X.Y
git push origin main
git push origin refs/tags/v0.X.Y      # explicit refspec — the local branch and tag share a name
git branch -d v0.X.Y

# 8. MANDATORY: write the GitHub release notes (see next section).
#    A release is NOT done until the GH release page has a title + body.
```

[scripts/publish.mjs](scripts/publish.mjs) only bumps versions + verifies builds; it does NOT commit, tag, push, or build the docker image. Those steps are manual (or via CI on tag push).

### Writing release notes — MANDATORY, never skip

**Every `v*` tag MUST get release notes** written via `gh release edit` before the release task is considered complete. The auto-created release ships with just the tag name as title and an empty body — that is **not acceptable as a finished release**. If you forget this step, the release is incomplete.

GitHub releases are auto-created by Build Linux (`softprops/action-gh-release`) with installer assets attached. After the release exists, edit it:

```bash
until gh release view v0.X.Y >/dev/null 2>&1; do sleep 20; done
gh release edit v0.X.Y \
  --title "v0.X.Y — <Spanish title, mirroring the prior releases' style>" \
  --notes "$(cat <<'EOF'
## Versión 0.X.Y — DD de MMMM de YYYY

<body in Spain Spanish — see copilot-instructions Language rules>
EOF
)"
```

Release notes language is **Spain Spanish, informal "tú"**. Existing v0.10.x / v0.11.x releases set the tone and emoji conventions (🐛 fix, ⚡ perf, 🔴 critical security, 🟠 high, 🟡 medium).

Watching docker build (the gating job for unraid deploy):

```bash
gh run list --workflow=build-docker.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch <id> --interval 30 --exit-status
```

### Deploying to the user's unraid

The user's media server runs on Unraid at SSH alias `unraid`. Standard deploy after CI completes:

```bash
ssh unraid 'docker pull ghcr.io/cucumba88/boxteam:0.X.Y \
  && docker stop boxteam && docker rm boxteam \
  && docker run -d --name=boxteam --restart=unless-stopped --network=bridge \
       -p 47860:47860 \
       -v /mnt/user/media:/downloads \
       -v /mnt/cache/appdata/boxteam:/config \
       -e BOXTEAM_WEBGUI_PORT=47860 \
       -e BOXTEAM_WEBGUI_EXPOSED_PORT=47860 \
       -e BOXTEAM_WEBGUI_ALLOWED_ORIGINS=https://boxteam.example.com \
       ghcr.io/cucumba88/boxteam:0.X.Y \
  && sleep 4 && docker ps --filter name=boxteam --format "{{.Names}} {{.Image}} {{.Status}}" \
  && docker logs --tail 8 boxteam'
```

The container creates an automatic `library-<old>-to-<new>-<timestamp>.sqlite3` backup under `/config/share/boxteam/backups/` on every version transition.

## Browser-based QA after deploy

The site is at `https://boxteam.example.com`. The user's login is in their own browser. Use the `Claude_in_Chrome` MCP to drive it for regression checks (auth me, /api/settings redaction, /api/media wire size + compression, CSP headers, CORS lockdown from a known-bad origin via SSH `curl` — not browser `fetch`, which the browser rewrites the Origin header on).

**Mobile QA limitation:** Chrome on macOS won't shrink below ~1471 px via `resize_window`. The `frame-ancestors 'none'` CSP (correctly) blocks iframe-based tricks. For mobile verification: code review + ask the user to test on their actual phone with a focused checklist.

## SQLite data-dir resolution

`Db::new()` resolves the data dir via:
1. **Portable**: `.boxteam-portable` marker file next to the executable → uses `boxteam-data/` adjacent to it.
2. **Custom**: `bootstrap.json` in the default location → uses the path inside it.
3. **Default**: `dirs_next::data_dir().join("boxteam")` (macOS `~/Library/Application Support/boxteam`, Linux `$XDG_DATA_HOME/boxteam` or `~/.local/share/boxteam`).

In docker the entrypoint forces `XDG_DATA_HOME=/config/share`, so the path becomes `/config/share/boxteam/library.db`. All paths now propagate `create_dir_all` errors with the offending path + OS error code (was silently `.ok()`'d before v0.11.3).

## Common gotchas

- **TypeScript compatibility** — `tmdb_genres` was string-of-JSON before v0.11.1; the type is still typed as `number[] | string` in `src/hooks/useIndexing.ts`. Don't tighten it to `number[]` until all consumers stop checking `typeof gs === "string"`.
- **`MediaItem` field order in `get_all_media`** — must match the SELECT column order in `src-tauri/src/db.rs:get_all_media`. Adding a column requires updating both the SQL and the row mapping at the same index (see the column-order table in `.github/copilot-instructions.md`).
- **Auth handlers reorder extractors** — Axum body-consuming extractors (`Json`) must come last. `State`, `ConnectInfo<SocketAddr>`, `HeaderMap` before `Json`.
- **Secret round-tripping** — GETs return `"***REDACTED***"` (constant in `src-tauri/src/web/redact.rs`) for any credential field; PUTs use `redact::preserve(&provided, &current)`. If you add a new secret field, add it to `mask`/`preserve` calls in both `get_settings`/`put_settings` and the equivalent webgui-config / telegram-sub handlers — see docs/SECURITY.md §1.
- **Session cache TTL** — auth middleware caches `(token → user)` for 60 s. After any state-change to the user (password rotated, role changed, disabled), call `crate::web::auth::invalidate_session_cache(token)` AND `Db::revoke_*` — see docs/SECURITY.md §7.
- **Mobile sidebar UserMenu used to mount twice** — the `UserMenu` portal is mounted inside `headerSlot` on mobile and inside `footerSlot` on desktop. `AppSidebar` is passed `footerSlot={isMobile ? undefined : sidebarFooter}` to prevent double-mount (was a real bug fixed in v0.10.12).
- **Browser `fetch` rewrites the `Origin` header.** Testing CORS from a "bad" origin in browser devtools won't actually send a bad origin — the browser overrides it. Use `curl` from a server-side context (e.g. `ssh unraid curl …`) to test CORS lockdown.

## Spanish-language requirement

All user-facing text (UI strings, error messages, release notes, tooltips) is **Spain Spanish, informal "tú"**. Internal logs, commit messages, code comments, and CLAUDE-facing docs (like this file) remain English. The line is whether a human end-user will read it.
