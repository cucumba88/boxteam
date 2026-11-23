# BoxTeam

BoxTeam (formerly Oscata) is a desktop media-library browser built with Tauri, React, TypeScript, and Rust.

It connects to an FTP media source, indexes movie and TV files, enriches them with TMDB metadata, and presents everything in a polished desktop UI with downloads, badges, filters, bilingual metadata, and grouped browsing.

## What the app does

BoxTeam is designed for people who keep a remote FTP-based media library and want a desktop app that feels closer to a modern streaming/browser experience instead of a raw file listing.

Today the app can:

- index media files from an FTP server
- detect movies, TV episodes, documentaries, resolutions, HDR, codecs, and release types
- match titles against TMDB and store metadata locally
- keep both Spanish and English metadata fields
- browse movies in grouped or file-level mode
- browse TV by show or episode
- paginate large libraries for better performance
- queue, resume, retry, cancel, and delete downloads
- show download state and presence badges
- connect to Emby and Plex for library checks
- preserve indexed data and metadata in a local SQLite database between runs

## Main features

### Library indexing

The backend scans the configured FTP root, parses media filenames, and stores results in SQLite. Indexed items are cached locally so the app does not need to start from zero every time.

### Metadata enrichment

BoxTeam uses TMDB to match titles and store posters, overviews, ratings, dates, genres, and localized metadata. Manual fixes are preserved and bulk refresh actions avoid overwriting manual matches.

### Downloads

Downloads are handled from the app UI and support:

- persistent queue state
- resume from partial files when possible
- retry after failure
- cancellation and delete actions
- local destination folder mapping

### Bilingual UI and metadata

Spanish is the default language, with English available across the main UI and stored metadata.

### Desktop-focused UX

The interface uses a top-nav layout with filters, grouped browsing, detail panels, download feedback toasts, keyboard shortcuts, and app-style settings/download screens.

## Tech stack

- Tauri 2
- React 19
- TypeScript
- Vite
- Rust
- SQLite via `rusqlite`
- TMDB API
- FTP via `suppaftp`

## Project structure

- `src/` — React UI, hooks, components, filters, pages, and localization
- `src-tauri/` — Rust backend, FTP/indexing/download logic, SQLite persistence, and Tauri commands
- `scripts/` — local release automation scripts

## Requirements

- Node.js 22
- npm
- Rust toolchain
- Tauri development prerequisites for your platform

On this project, frontend commands are typically run with Node 22:

```bash
source ~/.nvm/nvm.sh
nvm use 22
```

## Local development

Install dependencies:

```bash
npm install
```

Run the desktop app in dev mode:

```bash
npm run tauri dev
```

Frontend-only dev server:

```bash
npm run dev
```

Build the frontend bundle:

```bash
npm run build
```

## Configuration

The app stores its runtime configuration in SQLite and exposes it through the in-app settings screen.

Key settings include:

- FTP host, port, user, password, and root path
- TMDB API key
- default language
- download folder
- max concurrent downloads
- folder-type mapping
- Emby and Plex connection details
- backup export / restore actions

## Data storage

BoxTeam stores its local database in the user data directory under:

```text
boxteam/library.db
```

That database includes:

- indexed media items
- TMDB metadata
- persisted downloads state
- app configuration
- timestamps such as the last successful indexing time

This means local library state survives normal app restarts and rebuilds.

You can also export the database from Settings and later import it into a fresh install.

## Self-hosting with Docker (NAS / Synology / Unraid)

Besides the desktop app, BoxTeam ships a headless Docker image that exposes the
web UI on port `47860`. The official image (`ghcr.io/cucumba88/boxteam:latest`)
is built for `linux/amd64`.

Quick start:

```bash
docker run -d --name boxteam --restart unless-stopped \
  -p 47860:47860 \
  -v boxteam-config:/config \
  -v boxteam-downloads:/downloads \
  ghcr.io/cucumba88/boxteam:latest
```

- **Full Docker guide:** [`docker/README.md`](docker/README.md) — env vars, reverse proxy, persistent volumes.
- **Synology (DS920+ and similar):** the J4125 CPU is `x86_64/amd64`, so the
  image runs natively. Full step-by-step guide (four install methods, reverse
  proxy, permissions, updates, backups, troubleshooting) in
  [`docker/SYNOLOGY.md`](docker/SYNOLOGY.md). Quick start: the Container Manager
  compose file [`docker/docker-compose.synology.yml`](docker/docker-compose.synology.yml)
  or the SSH installer [`scripts/synology-install.sh`](scripts/synology-install.sh).
- **Unraid:** community template at [`docker/unraid-template.xml`](docker/unraid-template.xml).

## Validation commands

Useful validation commands while developing:

```bash
npx tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

## Release / versioning workflow

BoxTeam now uses `package.json` as the main app version source, and the local release script keeps Rust metadata in sync.

Available commands:

```bash
npm run release -- patch
npm run release -- minor
npm run release -- major
npm run release -- 0.2.0
```

Shortcuts:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

What the release script does:

- bumps `package.json`
- updates `package-lock.json`
- syncs `src-tauri/Cargo.toml`
- runs `npm run build`
- runs `cargo check`

Optional release build:

```bash
npm run release -- patch --build
```

That will also run:

```bash
npm run tauri build
```

Optional bundled starter database:

```bash
npm run seed-db
npm run seed-db -- --from /path/to/library-backup.db
npm run release -- patch --build --seed-db /path/to/library-backup.db
```

`npm run seed-db` copies the current local app database into `src-tauri/resources/library.seed.db`.

If `src-tauri/resources/library.seed.db` is present in the build, fresh installs can auto-seed their local database from that bundled backup on first launch.

### GitHub release installers

Pushing a `v*` tag runs `.github/workflows/release.yml` on the self-hosted
Linux runner: version check → release draft → CI → Linux (deb, rpm, AppImage,
tar.gz) and Windows (NSIS installer + portable zip, cross-compiled) → Docker
image → `latest.json` for the updater → the draft is published. If a job
fails the release stays a draft; re-run the failed jobs to resume it.

CI doesn't build macOS. Build it on a Mac with `scripts/build-dmg.sh`, or
attach it to a published release with `scripts/release-mac.sh vX.Y.Z` (see
below).

## In-app updates

The desktop app checks for a new version shortly after startup and every 6
hours, and offers it in a toast (and in Settings → Sistema → Actualizaciones):
one click downloads it, installs it and restarts the app. It uses the Tauri
updater, which reads
`https://github.com/<owner>/boxteam/releases/latest/download/latest.json`
(the endpoint is in `src-tauri/tauri.conf.json`).

- **Signing.** Every update package is signed; the app only installs packages
  whose signature matches the public key in `tauri.conf.json`. The private key
  is the Actions secret `TAURI_SIGNING_PRIVATE_KEY` (+
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Keep an offline backup: if it is
  lost, installed apps can't update anymore and need a manual reinstall with a
  new key.
- **What updates itself.** The macOS app, the Windows NSIS install and the
  Linux AppImage. The Windows portable zip, the .deb/.rpm packages and Docker
  are updated by replacing them; the app says so in Settings.
- **macOS.** After the release is published, on a Mac with the key
  (`~/.tauri/boxteam-updater.key`, password in the Keychain item
  "BoxTeam updater signing key password"):

  ```bash
  git checkout vX.Y.Z && scripts/release-mac.sh vX.Y.Z
  ```

  It builds the app, uploads `BoxTeam_X.Y.Z_aarch64.app.tar.gz` (+ `.sig`) and
  the DMG, and regenerates `latest.json` with the Mac entry.

## Notes

- The app currently uses scheduled indexing and cached metadata to avoid unnecessary full refreshes.
- Downloads and library state are designed to persist locally between sessions.
- The current desktop bundle identifier is `com.boxteam.media`.

## License

This repository currently does not define a license file.
