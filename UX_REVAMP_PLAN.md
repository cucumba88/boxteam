# Oscata — UX/UI Revamp Plan

Author: independent UX audit, 2026-05-17
Scope: every screen the user touches today. Not a one-shot rewrite — a sequenced plan with clear "ship in one PR" units.

---

## Audit — what's broken today

Findings are concrete and tied to file:line so each one is verifiable.

### 1. Shell & navigation

| # | Issue | Evidence |
|---|---|---|
| S1 | **Two left rails compete.** The new 240px sidebar lives next to a 320px FilterBar column on every Library tab → **560px of chrome** before any content. On a 1280-wide window only 720px is left for posters. | [src/pages/Library.tsx:2726–2761](src/pages/Library.tsx:2726) |
| S2 | **No keyboard shortcuts beyond `⌘K`.** No `[` / `]` for prev/next tab, no `/` to focus search, no arrow-keys in the poster grid, no `Esc` to close detail panels from anywhere. | grep for `keydown` returns ~3 hits only |
| S3 | **Status bar is information-thin.** Shows host + counts but never surfaces *why* indexing is paused, last-sync time, or storage destination free space. | [src/shell/AppStatusBar.tsx](src/shell/AppStatusBar.tsx) |
| S4 | **No drag-and-drop targets.** Upload flow requires modal-driven file picking even though the app is desktop-first. Files dropped on the window do nothing. | grep `ondrop\|dragover` → none |
| S5 | **No window state restore.** Sidebar collapse persists, but tab + filter + scroll position don't survive a restart. | [src/pages/Library.tsx:368](src/pages/Library.tsx:368) |

### 2. Library / poster grid

| # | Issue | Evidence |
|---|---|---|
| L1 | **MediaCard badge soup.** Up to 6 simultaneous badges (release type, resolution, HDR, codec, downloaded, in-Emby, in-Plex) overlay the poster; impossible to scan at a glance. | [src/components/MediaCard.tsx:35–80](src/components/MediaCard.tsx:35) |
| L2 | **No hover quick-actions.** Cards have no inline "download", "add to watchlist", or "fix match" — every interaction routes through the detail panel. | [src/components/MediaCard.tsx](src/components/MediaCard.tsx) |
| L3 | **No keyboard grid nav.** Tab order skips between cards via raw DOM order; arrow keys do nothing. | [src/components/VirtualMediaGrid.tsx](src/components/VirtualMediaGrid.tsx) |
| L4 | **Empty state is text-only.** When a tab has zero items, the user sees a single muted sentence at center — no CTA to start indexing or open settings. | [src/pages/Library.tsx:2754–2776](src/pages/Library.tsx:2754) |
| L5 | **Sort + view-mode controls scattered.** Sort lives in FilterBar; movie/TV view-mode toggles live in the toolbar; selection mode lives in the burger menu. Three different surfaces. | [src/pages/Library.tsx:2160-2240](src/pages/Library.tsx:2160), [src/components/FilterBar.tsx:32](src/components/FilterBar.tsx:32) |
| L6 | **Filter bar is permanently visible.** Always takes 320px even when no filters are active or applicable — should collapse to a pill row by default. | [src/pages/Library.tsx:2726-2761](src/pages/Library.tsx:2726) |

### 3. Detail / TV-show panels

| # | Issue | Evidence |
|---|---|---|
| D1 | **`DetailPanel` is 1,103 lines of inline JSX.** Hard to maintain, harder to redesign. | [src/components/DetailPanel.tsx](src/components/DetailPanel.tsx) |
| D2 | **`TVShowPanel` is 2,082 lines** including its own season picker, episode list, parsing helpers, FixMatch modal trigger. Highest-density component in the app. | [src/components/TVShowPanel.tsx](src/components/TVShowPanel.tsx) |
| D3 | **Slide-in panels block the underlying view.** They're not a true secondary surface — backdrop dimmed, can't see context, no way to compare two items. | [src/components/DetailPanel.tsx:163-180](src/components/DetailPanel.tsx:163) |
| D4 | **Close only via × button or backdrop click.** No `Esc` handler registered globally for the panel; no swipe-down on mobile. | grep `Escape\|onKeyDown` in DetailPanel → only inside child modals |
| D5 | **Action bar buried below the fold.** Download / Watchlist / Fix-Match buttons sit after the synopsis on long entries; on a 13" screen they require scroll. | TVShowPanel render structure |

### 4. Settings

| # | Issue | Evidence |
|---|---|---|
| C1 | **4,022 lines in a single modal.** No sectioned navigation: FTP, TMDB, downloads, destinations, Emby, Plex, Telegram, web GUI, users — all stacked vertically. | [src/pages/Settings.tsx](src/pages/Settings.tsx) |
| C2 | **Save is at the absolute bottom.** Change anything at the top → scroll past ~3500 lines of DOM to save. | [src/pages/Settings.tsx:3995](src/pages/Settings.tsx:3995) |
| C3 | **Three save buttons** (Cancel · Save · Save & Re-index) with no clear hierarchy of when to pick which. | [src/pages/Settings.tsx:3990–4017](src/pages/Settings.tsx:3990) |
| C4 | **No dirty-state guard.** Clicking the modal backdrop or `Esc` discards changes silently. | grep `beforeunload\|isDirty` → none |
| C5 | **Validation is post-save.** Bad host/port surfaces only after clicking "Test connection"; no inline format checks. | [src/pages/Settings.tsx:565–611](src/pages/Settings.tsx:565) |
| C6 | **Hardcoded Spanish copy** in the notifications subsection bypasses the i18n system. | [src/pages/Settings.tsx:3829–3897](src/pages/Settings.tsx:3829) |

### 5. Downloads / Uploads (Transfers)

| # | Issue | Evidence |
|---|---|---|
| T1 | **Two tabs, one mental model.** Downloads and Uploads are separate tabs in the sidebar with near-identical row UI (filename, progress, retry, cancel). Should be one "Transfers" surface with a filter chip. | [src/components/DownloadsTab.tsx](src/components/DownloadsTab.tsx), [src/features/uploads/UploadsTab.tsx](src/features/uploads/UploadsTab.tsx) |
| T2 | **No global "pause all"** or per-bandwidth cap UI — common expectation for a desktop transfer app. | grep `pause\|bandwidth` → none |
| T3 | **No history filter.** Completed transfers stay forever or are bulk-cleared; can't filter to "failed in last 24h". | DownloadsTab structure |
| T4 | **Toast-driven feedback** ([DownloadFeedbackToast.tsx](src/components/DownloadFeedbackToast.tsx)) is good, but disappears too fast and isn't reachable from history. |

### 6. Visual & system design

| # | Issue | Evidence |
|---|---|---|
| V1 | **All inline styles.** ~22k lines of inline `style={{}}` objects across components. No shared token spec beyond CSS variables; restyling means hand-editing every component. | wc -l of src/components |
| V2 | **No reusable form primitives.** [`Toggle.tsx`](src/components/Toggle.tsx) exists; everything else (inputs, selects, buttons) is open-coded with `formInputStandard` style objects + ad-hoc local styles. | [src/lib/formStyles.ts](src/lib/formStyles.ts) |
| V3 | **No icon button primitive.** `iconButton`, `ghostBtn`, `primaryBtn` style objects are redeclared in many components. | grep `iconButton\|ghostBtn\|primaryBtn` |
| V4 | **Heavy glassmorphism + radial gradients** ([src/index.css:158-205](src/index.css:158)) hurt low-contrast scenarios (e.g. light theme text on `bg-mix(primary)`). |
| V5 | **No focus-visible styling beyond a global outline.** Buttons that *look* primary lose visual focus rings on dark backgrounds. | [src/index.css:99](src/index.css:99) |
| V6 | **No motion-reduce respect.** Spinners, shimmer, slide-ins, ring pulses all play regardless of `prefers-reduced-motion`. | grep `prefers-reduced-motion` → none |
| V7 | **Light theme is an afterthought.** Defined ([src/index.css:35-49](src/index.css:35)) but the `app-shell-bg` gradient was tuned for dark; light still uses `#12131a` blend. |

### 7. Accessibility

| # | Issue | Evidence |
|---|---|---|
| A1 | **Many buttons lack `aria-label`** — e.g. close `×`, expand chevrons, copy-to-clipboard icons. |  grep `aria-label` shows ~20 hits across 22k LOC |
| A2 | **Custom selects and toggles** aren't keyboard-operable in the way native `<select>` is. |
| A3 | **Color-only signaling** in badges (green = success, red = error) without text or icon. |
| A4 | **No skip-to-content link**; sidebar focus traps users on first load. |

---

## Biggest themes (1-paragraph synthesis)

The codebase is the result of "rapid feature growth in inline-styled monoliths" — three files (`Settings`, `TVShowPanel`, `Library`) total **9,000+ lines**, with no shared component primitives, no token-based theming layer, and no separation between layout, state, and presentation. The user-visible cost: visual noise (badge soup, two left rails, glass-on-glass surfaces), poor discoverability (actions buried below the fold, save button thousands of lines away from edits, no global shortcuts), and inconsistent platform feel (every interaction feels web-like in a Tauri shell). Fix order is: (1) make the shell native and quiet, (2) extract a real component library, (3) revamp content surfaces one tab at a time.

---

## Revamp plan — sequenced

Each phase is a self-contained PR. Earlier phases unlock later ones; nothing later breaks if a phase is paused.

### Phase 0 — Already shipped *(this iteration)*

✅ Native window chrome per platform, collapsible sidebar, slim status bar, `⌘K`/`Ctrl+K` command palette, sidebar collapse/expand toggle fix.

### Phase 1 — Foundation: design tokens & primitives  *[~1 week, no UX change]*

Create the layer the rest of the revamp leans on.

- New `src/design/` with:
  - `tokens.ts` — TypeScript-typed spacing, radius, font, shadow, color (re-exports from CSS vars).
  - `Button.tsx` — variants: `primary`, `ghost`, `danger`, `icon` (replaces 4+ inline style objects).
  - `Input.tsx`, `Select.tsx`, `Field.tsx` — replace `formInputStandard` usage.
  - `Card.tsx`, `Sheet.tsx`, `Modal.tsx` — replace ad-hoc `.modal-overlay` + bespoke panels.
- One sweep across `src/` replaces obvious primitives (no behavioral change).
- Add `prefers-reduced-motion` guards to animation keyframes in [src/index.css](src/index.css).
- Add `focus-visible` ring styling on every interactive primitive.

**Acceptance**: zero visual diff except focus rings; bundle size drops 5-10% from removed style-object duplication.

### Phase 2 — Library shell polish  *[~3 days]*

Solves issues S1, L4, L5, L6.

- **Collapsible filter rail**: default to a single sticky filter chip row above the grid (`Filter ▾  Active: 1080p · WEB-DL  ⨯`). Full rail opens on demand in a 320px right-side sheet (not stealing left-side real estate).
- **Empty states get CTAs**: "No items in Watchlist yet — [Browse Movies] [Open Settings]".
- **Sort + view-mode in toolbar**, consistent: a single segmented control on the right of the page title.
- **Hover quick-actions on `MediaCard`**: download / watchlist / open-detail buttons appear on hover, badges fade to 60% opacity.
- **Reduce badge density**: collapse release-type + resolution into one chip ("WEB-DL 1080p"), drop HDR badge unless it's HDR10+/DV.

### Phase 3 — Detail & TV panels redesign  *[~1 week]*

Solves D1–D5.

- Extract `TVShowPanel` into `TVShowHeader`, `TVShowSeasons`, `TVShowEpisodeList`, `TVShowActions` — splits the 2,082-line file into ~5 files of <400 lines.
- Same extraction for `DetailPanel` (Header, Synopsis, Versions, Actions).
- **Sticky action bar** at the top of the panel, always in view: Download / Add to Watchlist / Fix Match / Open Folder.
- Global `Esc` key closes the topmost open panel (currently only X / backdrop click work).
- Optional: side-by-side compare mode (open second panel without closing the first) for movie versions.

### Phase 4 — Settings: from one modal to a Preferences window  *[~1 week]*

Solves C1–C6.

- Replace the 4,022-line modal with a sectioned Preferences window (Mac convention): left-rail navigation (Connection · Library · Downloads · Destinations · Integrations · Notifications · Web GUI · Users · Advanced).
- **Per-section save with dirty state** ("3 unsaved changes — Save / Discard"); no more giant bottom save bar.
- **Inline validation**: host:port format, TMDB key prefix check, folder-path exists check.
- **Auto-save toggles** (theme, language) — no need for a save button at all.
- "Save & Re-index" becomes a contextual button on the Library section only.
- All hardcoded strings ([src/pages/Settings.tsx:3829-3897](src/pages/Settings.tsx:3829)) go through `t()`.

### Phase 5 — Unified Transfers surface  *[~3 days]*

Solves T1–T4.

- Merge Downloads + Uploads tabs into a single **Transfers** tab with filter chips (`All · Downloads · Uploads · Active · Failed · Completed · Last 24h`).
- Add **pause-all / resume-all** in the status bar, plus a per-transfer pause.
- Optional bandwidth cap slider (already supported by `max_concurrent_downloads` — surface it here too).
- Search input above the list for finding a past transfer by filename.

### Phase 6 — Power features  *[~1 week]*

Solves S2, S4.

- Global shortcuts: `[` / `]` switch tabs, `/` focuses search, `g d` / `g w` / `g s` (Vim-style) jump to Downloads / Watchlist / Settings, `?` shows shortcut sheet.
- Arrow-key navigation in the poster grid + Enter to open, Space to multi-select.
- **Drag files onto the window** → opens the upload prepare modal pre-populated.
- "Recently viewed" section in the Command Palette.

### Phase 7 — Visual & a11y pass  *[~3 days]*

Solves V1–V7, A1–A4.

- Audit and fix `aria-label`, `role`, `aria-expanded`, `aria-current` across all interactive primitives.
- Add icon + text to color-coded badges (e.g. green ✓ "In Library", red ⚠ "Failed").
- Skip-to-content link.
- Re-tune light theme: remove dark-tuned gradient, raise contrast on muted text from 5.2:1 to 7:1.
- Reduce backdrop-blur frequency (perf win on Win/Linux integrated GPUs).

### Phase 8 — Onboarding & first-run  *(stretch)*

Today the Wizard ([src/pages/Wizard.tsx](src/pages/Wizard.tsx)) is a 766-line linear stepper. Audit pending — likely benefits from progress indication, step-skipping for power users, and embedded validation feedback.

---

## Sequencing summary

```
Phase 0  ✅ shipped
Phase 1  ━━━━━━━  foundation (no UX change, unblocks all others)
Phase 2     ━━━   library polish
Phase 3        ━━━━━━━  detail panels
Phase 4              ━━━━━━━  settings rewrite
Phase 5                    ━━━  transfers merge
Phase 6                       ━━━━━━━  power features
Phase 7                              ━━━  a11y + visual pass
```

Total: ~5 calendar weeks of focused work, shippable PR by PR.

---

## What to do *right now* (smallest next step)

If you only want to land one more thing this session: **collapse the FilterBar by default** (Phase 2, the first item). It reclaims 320px on every Library view immediately, only one component to edit ([src/pages/Library.tsx:2726-2761](src/pages/Library.tsx:2726)), and validates the "two-rail problem" fix before committing to a bigger Phase 2.

Otherwise the highest leverage next phase is **Phase 1 (design tokens & primitives)** because every later phase becomes 2-3× faster once it lands.
