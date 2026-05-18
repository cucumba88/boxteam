import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  CheckSquare,
  ChevronRight,
  Clapperboard,
  FileText,
  Filter,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  RefreshCw,
  Settings as SettingsIcon,
  Tv2,
} from "lucide-react";
import { call, isTauri } from "../lib/transport";
import { getConfig, prefetchConfig } from "../lib/configCache";
import AppShell from "../shell/AppShell";
import AppSidebar, {
  type SidebarSection,
} from "../shell/AppSidebar";
import AppStatusBar from "../shell/AppStatusBar";
import CommandPalette, {
  type CommandItem,
} from "../shell/CommandPalette";
import { useCommandKey } from "../shell/usePlatform";
import { invoke } from "@tauri-apps/api/core";
import { useIsMobile } from "../hooks/useIsMobile";
import { useIndexing, MediaItem } from "../hooks/useIndexing";
import { useDownload } from "../hooks/useDownload";
import { useDownloads } from "../hooks/useDownloads";
import FilterBar, { type Filters } from "../components/FilterBar";
import FilterChipRow from "../components/FilterChipRow";
import FilterSheet from "../components/FilterSheet";
import {
  normalizeHdr,
  normalizeReleaseType,
  normalizeResolution,
  normalizeCodec,
} from "../utils/filterUtils";
import { foldForSearch } from "../utils/textSearch";
import IndexStatus from "../components/IndexStatus";
import Settings from "./Settings";
import WebUsers from "./WebUsers";
import ActivityLog from "../components/ActivityLog";
import DetailPage from "../components/DetailPage";
import TVShowPage from "../components/TVShowPage";
import FixMatchModal from "../components/FixMatchModal";
import DownloadsTab from "../components/DownloadsTab";
import WatchlistTab from "../features/watchlist/WatchlistTab";
import WatchlistAddModal from "../features/watchlist/WatchlistAddModal";
import { useWatchlist } from "../features/watchlist/useWatchlist";
import UploadsTab from "../features/uploads/UploadsTab";
import { useUploads } from "../features/uploads/useUploads";
import DownloadFeedbackToast from "../components/DownloadFeedbackToast";
import IndexErrorToast from "../components/IndexErrorToast";
import { useQuitHandler } from "../hooks/useQuitHandler";
import VirtualMediaGrid, {
  type JumpRequest,
} from "../components/VirtualMediaGrid";
import AlphaJumpRail from "../components/AlphaJumpRail";
import { buildAlphaIndex, titleSortKey } from "../utils/alphaJump";
import ThemeToggle from "../components/ThemeToggle";
import { AppLanguage, getLocalizedTitle } from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import { formatBytes } from "../lib/format";
import {
  SLUG_TO_TAB,
  TAB_SLUGS,
  TABS,
  type SortableTab,
  type TabId,
} from "../utils/tabs";
import { usePrefs, type UserPrefs } from "../utils/userPrefs";

function isSortableTab(tab: TabId): tab is SortableTab {
  return (
    tab === "all" ||
    tab === "movie" ||
    tab === "tv" ||
    tab === "documentary" ||
    tab === "watchlist"
  );
}

function tabFromPathname(prefs: UserPrefs): TabId {
  if (isTauri()) return prefs.defaultTab;
  const path = window.location.pathname || "/";
  // Exact match first (covers "/"). Then fall back to the first path segment
  // so nested URLs like "/watchlist/12345" still map to the watchlist tab.
  // For "/" with no slug match we honour the user's default-tab preference.
  if (SLUG_TO_TAB[path]) {
    return path === "/" ? prefs.defaultTab : SLUG_TO_TAB[path];
  }
  const first = "/" + (path.split("/").filter(Boolean)[0] ?? "");
  return SLUG_TO_TAB[first] ?? prefs.defaultTab;
}

/** Parses a `/peliculas/<id>`, `/series/<id>` or `/documentales/<id>` URL
 *  and returns the numeric id (tmdb_id). Returns null for list-only URLs
 *  or when running inside Tauri (no URL bar there). */
function detailIdFromPath(): number | null {
  if (isTauri()) return null;
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/").filter(Boolean);
  const tabSlug = "/" + (parts[0] ?? "");
  if (!["/peliculas", "/series", "/documentales"].includes(tabSlug)) return null;
  if (!parts[1]) return null;
  const id = Number(parts[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const defaultFilters = (tab: TabId, prefs: UserPrefs): Filters => ({
  search: "",
  releaseType: "",
  resolution: "",
  hdr: "",
  codec: "",
  genre: "",
  sort: isSortableTab(tab) ? prefs.defaultSort[tab] : "added-desc",
});

// ─── URL ↔ filter helpers (web mode only) ─────────────────────────────────────
function filtersFromSearchParams(fallbackSort: string): Filters {
  const p = new URLSearchParams(window.location.search);
  return {
    search: p.get("q") ?? "",
    releaseType: p.get("type") ?? "",
    resolution: p.get("res") ?? "",
    hdr: p.get("hdr") ?? "",
    codec: p.get("codec") ?? "",
    genre: p.get("genre") ?? "",
    sort: p.get("sort") ?? fallbackSort,
  };
}
function filtersToSearchParams(filters: Filters, defaultSort: string): string {
  const p = new URLSearchParams();
  if (filters.search) p.set("q", filters.search);
  if (filters.releaseType) p.set("type", filters.releaseType);
  if (filters.resolution) p.set("res", filters.resolution);
  if (filters.hdr) p.set("hdr", filters.hdr);
  if (filters.codec) p.set("codec", filters.codec);
  if (filters.genre) p.set("genre", filters.genre);
  if (filters.sort && filters.sort !== defaultSort) p.set("sort", filters.sort);
  const qs = p.toString();
  return qs ? "?" + qs : "";
}

function tabFilter(item: MediaItem, tab: TabId): boolean {
  if (tab === "all") return true;
  return item.media_type === tab;
}

function EpisodeListView({
  items,
  onSelect,
  resetKey,
  language,
}: {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  resetKey: string;
  language: AppLanguage;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [resetKey]);

  return (
    <div
      ref={scrollRef}
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "1.5rem 1.5rem 6.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {items.map((item) => {
          const title = getLocalizedTitle(item, language);
          const episodeLabel =
            item.season != null || item.episode != null
              ? `S${String(item.season ?? 0).padStart(2, "0")}E${String(item.episode ?? 0).padStart(2, "0")}${item.episode_end != null && item.episode_end !== item.episode ? `-E${String(item.episode_end).padStart(2, "0")}` : ""}`
              : t(language, "tv.episode");

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              style={{
                display: "grid",
                gridTemplateColumns: "110px minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 14,
                width: "100%",
                padding: "14px 16px",
                borderRadius: "var(--radius-lg)",
                border:
                  "1px solid color-mix(in srgb, var(--color-border) 78%, transparent)",
                background:
                  "color-mix(in srgb, var(--color-surface) 92%, transparent)",
                color: "var(--color-text)",
                textAlign: "left",
                cursor: "pointer",
                boxShadow:
                  "0 10px 24px color-mix(in srgb, black 16%, transparent)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    color: "var(--color-primary)",
                  }}
                >
                  {episodeLabel}
                </span>
                <span
                  style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                >
                  {item.year ?? "—"}
                </span>
              </div>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--color-text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.filename}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--color-text-muted)",
                  fontSize: 12,
                }}
              >
                {item.release_type && <span>{item.release_type}</span>}
                {item.resolution && <span>{item.resolution}</span>}
                {item.size_bytes != null && item.size_bytes > 0 && (
                  <span style={{ fontWeight: 600 }}>
                    {formatBytes(item.size_bytes)}
                  </span>
                )}
                <ChevronRight
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  style={{ display: "block", flexShrink: 0 }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Module-level pure helpers (stable references — safe in useMemo dep arrays) ─
function getAddedTimestamp(item: MediaItem): number {
  const indexed = item.indexed_at ? Date.parse(item.indexed_at) : NaN;
  if (!Number.isNaN(indexed)) {
    // Guard against bad future timestamps in imported or external metadata.
    return Math.min(indexed, Date.now());
  }
  return item.id;
}

function deduplicateByTitle(entries: MediaItem[]): MediaItem[] {
  const seen = new Map<string, MediaItem>();
  for (const entry of entries) {
    const key =
      entry.tmdb_id != null
        ? `tmdb:${entry.tmdb_id}`
        : `title:${entry.title ?? entry.filename}`;
    const current = seen.get(key);
    if (!current) {
      seen.set(key, entry);
      continue;
    }
    const entryAddedAt = getAddedTimestamp(entry);
    const currentAddedAt = getAddedTimestamp(current);
    if (entryAddedAt > currentAddedAt) {
      seen.set(key, entry);
      continue;
    }
    if (
      entryAddedAt === currentAddedAt &&
      entry.tmdb_poster &&
      !current.tmdb_poster
    ) {
      seen.set(key, entry);
    }
  }
  return [...seen.values()];
}

export default function Library({
  startIndexingOnMount = false,
  headerSlot,
  showUsers = false,
  onCloseUsers,
  onLeaveUsers,
}: {
  startIndexingOnMount?: boolean;
  headerSlot?: React.ReactNode;
  /** Web mode only — render the user-management page as a content-area
   *  takeover instead of swapping out the whole shell. Keeps the sidebar
   *  + status bar around the users page. */
  showUsers?: boolean;
  /** WebUsers "Volver" button — pushes URL back to "/". */
  onCloseUsers?: () => void;
  /** State-only close for when the user is navigating elsewhere (sidebar
   *  click, command palette) — the new destination will push its own URL,
   *  so we must NOT push "/" first or history gets duplicate entries. */
  onLeaveUsers?: () => void;
}) {
  const showDevLog = import.meta.env.DEV;
  const {
    items,
    isIndexing,
    progress,
    tmdbProgress,
    metaRefreshProgress,
    completionSummary,
    dismissCompletion,
    forceClearIndexing,
    indexError,
    clearIndexError,
    retryIndexing,
    log,
    appendLog,
    clearLog,
  } = useIndexing();
  const { quitDialogVisible, activeCount, confirmQuit, cancelQuit } =
    useQuitHandler();
  const { startDownload, isDownloadPending } = useDownload();
  const {
    downloads,
    cancelDownload,
    clearCompleted,
    retryDownload,
    openDownloadFolder,
    deleteDownload,
  } = useDownloads();
  const watchlist = useWatchlist();
  const {
    uploads,
    cancelUpload,
    retryUpload,
    deleteUpload,
    clearCompleted: clearCompletedUploads,
  } = useUploads();
  const [ftpWriteOk, setFtpWriteOk] = useState<boolean>(false);
  const downloadMap = useMemo(
    () => new Map(downloads.map((d) => [d.ftp_path, d])),
    [downloads],
  );
  const prefs = usePrefs();
  // Capture a stable snapshot of prefs at mount so the initial state lookups
  // below match the values we'll read in switchTab / popstate. `usePrefs`
  // keeps the live ref updated; we only need a one-shot read at mount.
  const initialPrefsRef = useRef<UserPrefs>(prefs);
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    tabFromPathname(initialPrefsRef.current),
  );
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<Filters>(() => {
    const initialPrefs = initialPrefsRef.current;
    const initialTab = tabFromPathname(initialPrefs);
    const tabDefaultSort = isSortableTab(initialTab)
      ? initialPrefs.defaultSort[initialTab]
      : "added-desc";
    return isTauri()
      ? defaultFilters(initialTab, initialPrefs)
      : filtersFromSearchParams(tabDefaultSort);
  });
  const [showSettings, setShowSettings] = useState<boolean>(
    () => !isTauri() && typeof window !== "undefined" && window.location.pathname === "/ajustes",
  );
  const [showLog, setShowLog] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [selectedGroupedView, setSelectedGroupedView] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  // Watchlist has its own selecting state — IDs reference watchlist rows
  // (not media items) and the bulk action is "remove from watchlist", not
  // "fix match". Lifted here so the Library toolbar can render the
  // controls in the same place as the Movies/TV tabs.
  const [watchlistSelecting, setWatchlistSelecting] = useState(false);
  const [watchlistShowAdd, setWatchlistShowAdd] = useState(false);
  const [watchlistCheckedIds, setWatchlistCheckedIds] = useState<Set<number>>(
    new Set(),
  );
  const exitWatchlistSelect = () => {
    setWatchlistSelecting(false);
    setWatchlistCheckedIds(new Set());
  };
  const toggleWatchlistCheck = (id: number) =>
    setWatchlistCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [showBulkFix, setShowBulkFix] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [refreshingLibrary, setRefreshingLibrary] = useState(false);
  const [refreshingMetadata, setRefreshingMetadata] = useState(false);
  const [tvShow, setTvShow] = useState<MediaItem | null>(null);
  const [fixMatchRequest, setFixMatchRequest] = useState<{
    itemIds: number[];
    initialQuery: string;
    initialMediaType: "movie" | "tv" | "documentary";
  } | null>(null);
  const [movieView, setMovieView] = useState<"grouped" | "files">(
    () => initialPrefsRef.current.defaultMovieView,
  );
  const [tvView, setTvView] = useState<"shows" | "episodes">(
    () => initialPrefsRef.current.defaultTvView,
  );
  const [jumpRequest, setJumpRequest] = useState<JumpRequest | undefined>(
    undefined,
  );
  const [visibleRange, setVisibleRange] = useState<{
    start: number;
    end: number;
  }>({ start: 0, end: 0 });
  // Ref, not state — updated by the grid on every scroll tick. Keeping
  // this out of React state avoids re-rendering the entire Library tree
  // every time the user moves the scroll by one row (kills perf on iOS).
  const firstVisibleIndexRef = useRef(0);
  // Active rail letter — updated by the grid only when the bucket actually
  // changes (~once per row of scroll), so this state change fires a few
  // times per second of scrolling instead of every frame.
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  // Saved grid scroll position so that closing a detail / TV-show takeover
  // returns the user to roughly the same row instead of snapping to the top.
  // Set by handleCardSelect, cleared by switchTab and after the grid consumes
  // it via onInitialScrollConsumed.
  const [restoreGridIndex, setRestoreGridIndex] = useState(0);
  // After a rail click we lock the highlight to the clicked letter so the
  // user always sees their click confirmed. Auto-clears after 1.5s — long
  // enough to cover the smooth-scroll animation, short enough that genuine
  // user scrolling takes over quickly.
  const [pinnedLetter, setPinnedLetter] = useState<string | null>(null);
  const pinTimerRef = useRef<number | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showMobileNavMenu, setShowMobileNavMenu] = useState(false);
  const mobileNavMenuRef = useRef<HTMLDivElement>(null);
  const [language, setLanguage] = useState<AppLanguage>("es");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [ftpHost, setFtpHost] = useState<string | null>(null);
  const [badgeMap, setBadgeMap] = useState<
    Record<
      number,
      {
        downloaded?: boolean;
        inEmby?: boolean;
        plexInLibrary?: boolean;
        embyInLibrary?: boolean;
        cache?: string;
        debug?: string;
      }
    >
  >({});
  const [badgeRefreshTick, setBadgeRefreshTick] = useState(0);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hasStartedInitialIndexRef = useRef(false);
  const badgeRequestIdRef = useRef(0);

  // Pre-fetch config so Settings opens instantly when the user clicks the button.
  useEffect(() => {
    prefetchConfig();
  }, []);

  // Fetch FTP host once to populate the status bar.
  useEffect(() => {
    let cancelled = false;
    getConfig<{ ftp?: { host?: string } | null } | null>()
      .then((cfg) => {
        if (cancelled) return;
        const host = cfg?.ftp?.host;
        if (typeof host === "string" && host.trim()) {
          setFtpHost(host.trim());
        }
      })
      .catch(() => {
        // No config or unauthenticated — leave host null.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cmd/Ctrl+K opens the command palette globally.
  useCommandKey(() => setCommandPaletteOpen((open) => !open));

  // Global Esc handler: close the topmost open panel in z-order so users can
  // always back out without hunting for an × button. Order matches stacking:
  // bulk fix > fix match > settings > tv show > detail > filter sheet > command
  // palette. Skip when typing in an input so it doesn't steal expected behavior.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (showBulkFix) {
        setShowBulkFix(false);
      } else if (fixMatchRequest) {
        setFixMatchRequest(null);
      } else if (showSettings) {
        setShowSettings(false);
      } else if (tvShow) {
        setTvShow(null);
      } else if (selected) {
        setSelected(null);
      } else if (filterSheetOpen) {
        setFilterSheetOpen(false);
      } else if (commandPaletteOpen) {
        setCommandPaletteOpen(false);
      } else if (showLog) {
        setShowLog(false);
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    showBulkFix,
    fixMatchRequest,
    showSettings,
    tvShow,
    selected,
    filterSheetOpen,
    commandPaletteOpen,
    showLog,
  ]);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<boolean>("check_ftp_write_permission")
      .then((ok) => setFtpWriteOk(ok))
      .catch(() => setFtpWriteOk(false));
  }, []);

  useEffect(() => {
    if (activeTab === "uploads" && !ftpWriteOk) {
      switchTab("all");
    }
  }, [ftpWriteOk, activeTab]);

  // Sync activeTab with browser back/forward in web mode.
  useEffect(() => {
    if (isTauri()) return;
    const handlePop = () => {
      // /ajustes deep-link → show settings overlay. Any other path closes it.
      const onSettingsUrl = window.location.pathname === "/ajustes";
      setShowSettings(onSettingsUrl);
      if (onSettingsUrl) return;
      // /usuarios is handled by the outer WebRouter; don't reset library
      // state (tab/filters/selection) while the users takeover is active.
      if (window.location.pathname === "/usuarios") return;
      const tab = tabFromPathname(prefs);
      setActiveTab(tab);
      // Resolve any detail segment in the URL to the matching item — leaves
      // selected/tvShow null when the URL is a list view.
      const detailId = detailIdFromPath();
      if (detailId != null) {
        const match = items.find((i) => i.tmdb_id === detailId);
        if (match) {
          const isTV =
            match.tmdb_type === "tv" ||
            match.media_type === "tv" ||
            match.media_type === "documentary";
          if (isTV) {
            setTvShow(match);
            setSelected(null);
          } else {
            setSelected(match);
            setTvShow(null);
            setSelectedGroupedView(false);
          }
        } else {
          setSelected(null);
          setTvShow(null);
        }
      } else {
        setSelected(null);
        setSelectedGroupedView(false);
        setTvShow(null);
      }
      setSelecting(false);
      setCheckedIds(new Set());
      const fallbackSort = isSortableTab(tab)
        ? prefs.defaultSort[tab]
        : "added-desc";
      setFilters(filtersFromSearchParams(fallbackSort));
      setMovieView(prefs.defaultMovieView);
      setTvView(prefs.defaultTvView);
      setFilterDrawerOpen(false);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [items, prefs]);

  // Initial deep link — when the URL contains a detail id but items haven't
  // resolved yet, this effect fires once they do and opens the right page.
  useEffect(() => {
    if (isTauri()) return;
    if (selected || tvShow) return;
    const detailId = detailIdFromPath();
    if (detailId == null) return;
    const match = items.find((i) => i.tmdb_id === detailId);
    if (!match) return;
    const isTV =
      match.tmdb_type === "tv" ||
      match.media_type === "tv" ||
      match.media_type === "documentary";
    if (isTV) {
      setTvShow(match);
    } else {
      setSelected(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Sync filters + page into URL query string (web mode only, replaceState so
  // the tab pushState history is not polluted with every filter keystroke).
  useEffect(() => {
    if (isTauri()) return;
    // Don't pollute /ajustes or /usuarios with filter query strings —
    // neither page has filter state of its own.
    if (window.location.pathname === "/ajustes") return;
    if (window.location.pathname === "/usuarios") return;
    const tabDefaultSort = isSortableTab(activeTab)
      ? prefs.defaultSort[activeTab]
      : "added-desc";
    const qs = filtersToSearchParams(filters, tabDefaultSort);
    window.history.replaceState({}, "", window.location.pathname + qs);
  }, [filters, activeTab, prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync showSettings state → URL (web mode). Opening pushes /ajustes;
  // closing pops back to the previous entry so the browser back button
  // returns to wherever the user came from.
  useEffect(() => {
    if (isTauri()) return;
    const onSettingsUrl = window.location.pathname === "/ajustes";
    if (showSettings && !onSettingsUrl) {
      window.history.pushState({}, "", "/ajustes");
    } else if (!showSettings && onSettingsUrl) {
      // We were on /ajustes and someone closed Settings without using the
      // back button — restore the active tab in the URL.
      const tabDefaultSort = isSortableTab(activeTab)
        ? prefs.defaultSort[activeTab]
        : "added-desc";
      const target =
        TAB_SLUGS[activeTab] +
        filtersToSearchParams(filters, tabDefaultSort);
      window.history.pushState({}, "", target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings]);

  useEffect(() => {
    if (!startIndexingOnMount || hasStartedInitialIndexRef.current) {
      return;
    }

    hasStartedInitialIndexRef.current = true;
    const timer = window.setTimeout(() => {
      call("start_indexing").catch(console.error);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [startIndexingOnMount]);

  const getTvEpisodes = (show: MediaItem): MediaItem[] => {
    return items.filter((ep) =>
      ep.tmdb_type === "tv" ||
      ep.media_type === "tv" ||
      ep.media_type === "documentary"
        ? show.tmdb_id
          ? ep.tmdb_id === show.tmdb_id
          : (ep.title ?? ep.filename) === (show.title ?? show.filename)
        : false,
    );
  };

  const runRematchAll = async () => {
    setRematching(true);
    if (showDevLog) setShowLog(true);
    setShowActionsMenu(false);
    try {
      await call("rematch_all");
    } catch (error) {
      console.error("Failed to re-match metadata:", error);
    } finally {
      setRematching(false);
    }
  };

  const runRematchAllPlex = async () => {
    setRematching(true);
    if (showDevLog) setShowLog(true);
    setShowActionsMenu(false);
    try {
      // Uses the backend rematch flow, which now tries Plex->IMDb->TMDB fallback.
      await call("rematch_all");
    } catch (error) {
      console.error("Failed to run Plex-assisted rematch:", error);
    } finally {
      setRematching(false);
    }
  };

  const refreshLibrary = async () => {
    setRefreshingLibrary(true);
    setShowActionsMenu(false);
    try {
      await call("start_indexing");
    } catch (error) {
      console.error("Failed to refresh library:", error);
    } finally {
      setRefreshingLibrary(false);
    }
  };

  const clearAllMetadata = async () => {
    if (
      !confirm(
        "Clear ALL TMDB metadata for every item in your library? Metadata will be re-fetched on next rematch.",
      )
    )
      return;
    setClearingAll(true);
    if (showDevLog) setShowLog(true);
    setShowActionsMenu(false);
    try {
      await call("clear_all_metadata");
      await call("rematch_all");
    } catch (error) {
      console.error("Failed to clear/rematch metadata:", error);
    } finally {
      setClearingAll(false);
    }
  };

  const refreshAllMetadata = async () => {
    setRefreshingMetadata(true);
    if (showDevLog) setShowLog(true);
    setShowActionsMenu(false);
    try {
      await call("refresh_all_metadata");
    } catch (error) {
      console.error("Failed to refresh missing metadata:", error);
    } finally {
      setRefreshingMetadata(false);
    }
  };

  const switchTab = (tab: TabId) => {
    // Close any takeovers first — Settings / user-management paint on top
    // of the library content, so without this the new tab would render
    // underneath and the click would look like a no-op.
    if (showSettings) setShowSettings(false);
    if (showUsers && onLeaveUsers) onLeaveUsers();
    setActiveTab(tab);
    if (!isTauri()) {
      window.history.pushState({}, "", TAB_SLUGS[tab]);
    }
    setSelected(null);
    setSelectedGroupedView(false);
    setTvShow(null);
    setSelecting(false);
    setCheckedIds(new Set());
    exitWatchlistSelect();
    setFilters(defaultFilters(tab, prefs));
    setMovieView(prefs.defaultMovieView);
    setTvView(prefs.defaultTvView);
    setFilterDrawerOpen(false);
    // Reset jump + active-letter state so the next grid mounts at the top
    // instead of re-running a stale scrollToIndex from the previous tab.
    setJumpRequest(undefined);
    setPinnedLetter(null);
    if (pinTimerRef.current) {
      window.clearTimeout(pinTimerRef.current);
      pinTimerRef.current = null;
    }
    setActiveLetter(null);
    firstVisibleIndexRef.current = 0;
    setVisibleRange({ start: 0, end: 0 });
    setRestoreGridIndex(0);
  };

  const handleCardSelect = useCallback(
    (item: MediaItem) => {
      // Remember the grid's current scroll position so we can return to the
      // same row when the user closes the detail / TV-show takeover. Captured
      // before any state mutation that triggers re-render.
      setRestoreGridIndex(firstVisibleIndexRef.current);
      const isTV =
        item.tmdb_type === "tv" ||
        item.media_type === "tv" ||
        item.media_type === "documentary";
      if (isTV) {
        setTvShow(item);
      } else {
        setSelectedGroupedView(activeTab === "movie" && movieView === "grouped");
        setSelected(item);
      }
      // Push a deep-linkable URL when we have a tmdb_id (web mode only —
      // Tauri has no URL bar so it's a no-op). Falls back to the file's db
      // id under `/file/<n>` when there's no tmdb match.
      if (!isTauri() && item.tmdb_id) {
        const slug = isTV
          ? item.media_type === "documentary"
            ? "/documentales"
            : "/series"
          : "/peliculas";
        const target = `${slug}/${item.tmdb_id}`;
        if (window.location.pathname !== target) {
          window.history.pushState({}, "", target);
        }
      }
    },
    [activeTab, movieView],
  );

  /** Pop the detail segment off the URL back to the tab list (web mode). */
  const popDetailFromUrl = () => {
    if (isTauri()) return;
    const tabSlug = TAB_SLUGS[activeTab];
    if (window.location.pathname !== tabSlug) {
      window.history.pushState({}, "", tabSlug);
    }
  };

  const handleNavigateFromWatchlist = (tmdbId: number, mediaType: string) => {
    const targetTab = mediaType === "movie" ? "movie" : "tv";
    setActiveTab(targetTab);
    const found = items.find((i) => i.tmdb_id === tmdbId);
    if (found) handleCardSelect(found);
  };

  const handleDownloadSeason = async (episodes: MediaItem[]) => {
    for (const ep of episodes) {
      const existingDownload = downloadMap.get(ep.ftp_path);
      const isActive =
        isDownloadPending(ep.ftp_path) ||
        existingDownload?.status === "queued" ||
        existingDownload?.status === "downloading";
      const isAlreadyDownloaded =
        existingDownload?.status === "done" ||
        badgeMap[ep.id]?.downloaded === true;

      if (isActive || isAlreadyDownloaded) {
        continue;
      }

      await startDownload(ep);
    }
  };

  const toggleCheck = useCallback((id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const exitSelect = () => {
    setSelecting(false);
    setCheckedIds(new Set());
  };

  const isSeriesTab = activeTab === "tv" || activeTab === "documentary";
  const useGroupedMovies = activeTab === "movie" && movieView === "grouped";
  const useEpisodeList = activeTab === "tv" && tvView === "episodes";

  // Pre-parse tmdb_genres once per items change so filter() never calls JSON.parse.
  const parsedGenreMap = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const item of items) {
      const gs = item.tmdb_genres;
      map.set(
        item.id,
        gs
          ? typeof gs === "string"
            ? (JSON.parse(gs) as number[])
            : gs
          : [],
      );
    }
    return map;
  }, [items]);

  const getMovieVersions = (movie: MediaItem): MediaItem[] =>
    items.filter(
      (entry) =>
        entry.media_type === "movie" &&
        (movie.tmdb_id
          ? entry.tmdb_id === movie.tmdb_id
          : (entry.title ?? entry.filename) ===
            (movie.title ?? movie.filename)),
    );

  const visibleTabs = TABS.filter((tab) => tab.id !== "uploads" || ftpWriteOk);
  const mobileBottomTabs = visibleTabs.filter((tab) =>
    (["all", "movie", "tv", "downloads"] as TabId[]).includes(tab.id),
  );

  const tabCounts = useMemo(
    () =>
      visibleTabs.reduce(
        (acc, t) => {
          switch (t.id) {
            case "all":
              acc[t.id] = items.length;
              break;
            case "downloads":
              acc[t.id] = downloads.filter(
                (d) => d.status === "queued" || d.status === "downloading",
              ).length;
              break;
            case "uploads":
              acc[t.id] = uploads.filter(
                (u) => u.status === "queued" || u.status === "uploading",
              ).length;
              break;
            case "movie":
            case "tv":
            case "documentary":
              acc[t.id] = deduplicateByTitle(
                items.filter((i) => tabFilter(i, t.id)),
              ).length;
              break;
          }
          return acc;
        },
        {} as Record<TabId, number>,
      ),
    [downloads, items],
  );

  const tabItems = useMemo(
    () => items.filter((item) => tabFilter(item, activeTab)),
    [activeTab, items],
  );

  const tabItemsForDisplay = useMemo(() => {
    if (isSeriesTab && !useEpisodeList) return deduplicateByTitle(tabItems);
    if (useGroupedMovies) return deduplicateByTitle(tabItems);
    return tabItems;
  }, [isSeriesTab, tabItems, useEpisodeList, useGroupedMovies]);

  const filterableItems = useMemo(
    () => (useGroupedMovies ? tabItems : tabItemsForDisplay),
    [tabItems, tabItemsForDisplay, useGroupedMovies],
  );

  const filtered = useMemo(() => {
    const matchingItems = filterableItems
      .filter((item) => {
        const q = foldForSearch(filters.search);
        const matchesSearch =
          !q ||
          foldForSearch(item.tmdb_title ?? "").includes(q) ||
          foldForSearch(item.tmdb_title_en ?? "").includes(q) ||
          foldForSearch(item.title ?? "").includes(q) ||
          foldForSearch(item.release_group ?? "").includes(q) ||
          foldForSearch(item.filename).includes(q);
        const matchesGenre =
          !filters.genre ||
          (parsedGenreMap.get(item.id) ?? []).includes(Number(filters.genre));
        return (
          matchesSearch &&
          (!filters.releaseType ||
            normalizeReleaseType(item.release_type) === filters.releaseType) &&
          (!filters.resolution ||
            normalizeResolution(item.resolution) === filters.resolution) &&
          (!filters.hdr || normalizeHdr(item.hdr) === filters.hdr) &&
          (!filters.codec || normalizeCodec(item.codec) === filters.codec) &&
          matchesGenre
        );
      });

    // Schwartzian transform: compute sort keys once per item instead of O(N log N) times.
    const sort = filters.sort;
    const needsTitleKey =
      sort === "title-desc" ||
      sort === "added-desc" ||
      sort === "title-asc" ||
      !sort;
    const keyed = matchingItems.map((item) => ({
      item,
      titleKey: needsTitleKey
        ? titleSortKey(getLocalizedTitle(item, language))
        : "",
    }));
    keyed.sort((a, b) => {
      switch (sort) {
        case "title-desc":
          return b.titleKey.localeCompare(a.titleKey);
        case "release-desc": {
          const ra = a.item.tmdb_release_date ?? `${a.item.year ?? "0000"}-01-01`;
          const rb = b.item.tmdb_release_date ?? `${b.item.year ?? "0000"}-01-01`;
          return rb.localeCompare(ra);
        }
        case "release-asc": {
          const ra = a.item.tmdb_release_date ?? `${a.item.year ?? "0000"}-01-01`;
          const rb = b.item.tmdb_release_date ?? `${b.item.year ?? "0000"}-01-01`;
          return ra.localeCompare(rb);
        }
        case "year-desc":
          return (b.item.year ?? 0) - (a.item.year ?? 0);
        case "year-asc":
          return (a.item.year ?? 0) - (b.item.year ?? 0);
        case "rating-desc":
          return (b.item.tmdb_rating ?? 0) - (a.item.tmdb_rating ?? 0);
        case "added-desc": {
          const ta = getAddedTimestamp(a.item);
          const tb = getAddedTimestamp(b.item);
          return tb - ta || a.titleKey.localeCompare(b.titleKey);
        }
        default:
          return a.titleKey.localeCompare(b.titleKey);
      }
    });
    const sortedItems = keyed.map(({ item }) => item);

    return useGroupedMovies ? deduplicateByTitle(sortedItems) : sortedItems;
  }, [filterableItems, filters, language, parsedGenreMap, useGroupedMovies]);

  const viewResetKey = `${activeTab}:${filters.search}:${filters.releaseType}:${filters.resolution}:${filters.hdr}:${filters.codec}:${filters.genre}:${filters.sort}:${tvView}:${movieView}`;

  const isAlphaSort =
    filters.sort === "title-asc" || filters.sort === "title-desc";
  const showAlphaRail =
    isAlphaSort &&
    filtered.length > 0 &&
    activeTab !== "downloads" &&
    activeTab !== "uploads" &&
    activeTab !== "watchlist";
  const alphaIndex = useMemo(
    () => (showAlphaRail ? buildAlphaIndex(filtered, language) : null),
    [filtered, language, showAlphaRail],
  );
  const alphaIndexRef = useRef(alphaIndex);
  useEffect(() => {
    alphaIndexRef.current = alphaIndex;
  }, [alphaIndex]);
  const handleAlphaJump = useCallback((letter: string) => {
    const current = alphaIndexRef.current;
    if (!current) return;
    const idx = current[letter];
    if (idx == null) return;
    setJumpRequest({ index: idx, tick: Date.now() });
    setPinnedLetter(letter);
    // Auto-clear after the smooth-scroll settles. After this the rail
    // highlight follows the scroll-driven activeLetter signal again.
    if (pinTimerRef.current) window.clearTimeout(pinTimerRef.current);
    pinTimerRef.current = window.setTimeout(() => {
      setPinnedLetter(null);
      pinTimerRef.current = null;
    }, 1500);
  }, []);

  // Cancel any pending pin timer on unmount.
  useEffect(() => {
    return () => {
      if (pinTimerRef.current) window.clearTimeout(pinTimerRef.current);
    };
  }, []);

  // Stable callbacks for the grid so its memo holds across Library re-renders
  // (which happen ~6-7×/sec during scroll due to visibleRange + activeLetter
  // state updates). Without these, every Library render re-creates inline
  // arrows and the grid's memo bails out, costing a full virtual-row remap
  // per render.
  const handleVisibleRangeChange = useCallback((start: number, end: number) => {
    setVisibleRange({ start, end });
  }, []);
  const handleFirstVisibleIndexChange = useCallback((idx: number) => {
    firstVisibleIndexRef.current = idx;
  }, []);
  // Only setState the active letter when the alpha rail is actually shown.
  // Otherwise every row crossed during scroll triggers a useless re-render
  // (especially bad on the All tab with sort = "Recently added" where every
  // row tends to start with a different letter).
  const showAlphaRailRef = useRef(showAlphaRail);
  useEffect(() => {
    showAlphaRailRef.current = showAlphaRail;
    if (!showAlphaRail) setActiveLetter(null);
  }, [showAlphaRail]);
  const handleActiveLetterChange = useCallback((letter: string) => {
    if (showAlphaRailRef.current) setActiveLetter(letter);
  }, []);
  const handleInitialScrollConsumed = useCallback(() => {
    setRestoreGridIndex(0);
  }, []);

  // Visible-window items drive badge fetching — only request badges for what
  // the user can see (or recently scrolled past). `badgeMap` caches results
  // by id, so previously-seen cards keep their badges while we refetch the
  // current window.
  const visibleItems = useMemo(
    () => filtered.slice(visibleRange.start, visibleRange.end),
    [filtered, visibleRange],
  );
  const badgePayload = useMemo(
    () =>
      visibleItems.map((item) => ({
        id: item.id,
        ftpPath: item.ftp_path,
        filename: item.filename,
        title: item.tmdb_title ?? item.title ?? null,
        titleEn: item.tmdb_title_en ?? null,
        year: item.year ?? null,
        imdbId: item.imdb_id ?? null,
        tmdbId: item.tmdb_id ?? null,
        mediaType: item.media_type ?? item.tmdb_type ?? null,
      })),
    [visibleItems],
  );
  const badgeWindowKey = useMemo(
    () => visibleItems.map((item) => item.id).join(","),
    [visibleItems],
  );

  const ghostBtn: React.CSSProperties = {
    padding: isMobile ? "9px 14px" : "7px 14px",
    minHeight: isMobile ? 40 : undefined,
    borderRadius: "var(--radius-full)",
    border:
      "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
    background: "color-mix(in srgb, var(--color-surface) 84%, transparent)",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "color 0.18s ease, background 0.18s ease",
  };

  const primaryBtn: React.CSSProperties = {
    padding: isMobile ? "9px 14px" : "7px 14px",
    minHeight: isMobile ? 40 : undefined,
    borderRadius: "var(--radius-full)",
    border: "none",
    background: "var(--color-primary)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  const iconButton: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 999,
    border:
      "1px solid color-mix(in srgb, var(--color-border) 84%, transparent)",
    background: "color-mix(in srgb, var(--color-surface) 94%, transparent)",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 1px 0 color-mix(in srgb, white 4%, transparent)",
  };

  const sectionTitle: Record<TabId, string> = {
    all: t(language, "nav.all"),
    movie: t(language, "nav.movies"),
    tv: t(language, "nav.tv"),
    documentary: t(language, "nav.docs"),
    downloads: t(language, "nav.downloads"),
    watchlist: t(language, "nav.watchlist"),
    uploads: t(language, "nav.uploads" as never),
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [viewResetKey]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setShowActionsMenu(false);
      }
      if (!mobileNavMenuRef.current?.contains(event.target as Node)) {
        setShowMobileNavMenu(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    call<{ default_language?: AppLanguage }>("get_config")
      .then((config) => {
        if (
          !cancelled &&
          (config.default_language === "es" || config.default_language === "en")
        ) {
          setLanguage(config.default_language);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName;
      return (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const editableTarget = isEditableTarget(event.target);
      const hasOverlayOpen = !!(
        showSettings ||
        showLog ||
        selected ||
        tvShow ||
        fixMatchRequest
      );

      if (hasOverlayOpen && event.key !== "Escape") return;

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        const tab = (
          {
            "1": "all",
            "2": "movie",
            "3": "tv",
            "4": "documentary",
            "5": "downloads",
          } as const
        )[event.key as "1" | "2" | "3" | "4" | "5"];
        if (tab) {
          event.preventDefault();
          switchTab(tab);
          return;
        }
      }

      if (event.key === "Escape") {
        if (fixMatchRequest) {
          event.preventDefault();
          setFixMatchRequest(null);
          return;
        }
        if (showSettings) {
          event.preventDefault();
          setShowSettings(false);
          return;
        }
        if (showLog) {
          event.preventDefault();
          setShowLog(false);
          return;
        }
        if (selected) {
          event.preventDefault();
          setSelected(null);
          return;
        }
        if (tvShow) {
          event.preventDefault();
          setTvShow(null);
          return;
        }
        if (showActionsMenu) {
          event.preventDefault();
          setShowActionsMenu(false);
          return;
        }
        if (selecting) {
          event.preventDefault();
          exitSelect();
          return;
        }
        if (editableTarget) {
          (event.target as HTMLElement).blur();
        }
        return;
      }

      if (editableTarget || hasOverlayOpen) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTab,
    fixMatchRequest,
    selected,
    selecting,
    showActionsMenu,
    showLog,
    showSettings,
    tvShow,
  ]);

  useEffect(() => {
    if (activeTab === "downloads" || activeTab === "watchlist") return;

    const triggerRefresh = () => setBadgeRefreshTick((prev) => prev + 1);
    const intervalId = window.setInterval(triggerRefresh, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    const onFocus = () => {
      triggerRefresh();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeTab]);

  useEffect(() => {
    if (
      activeTab === "downloads" ||
      activeTab === "watchlist" ||
      badgePayload.length === 0
    )
      return;
    const startedAt = Date.now();
    const requestId = ++badgeRequestIdRef.current;
    const run = async () => {
      const mergedResults: Array<{
        id: number;
        downloaded: boolean;
        in_emby: boolean;
        plex_in_library?: boolean;
        emby_in_library?: boolean;
        cache?: string;
        debug?: string;
      }> = [];

      let cursor = 0;
      const workers = Math.min(6, badgePayload.length);

      const worker = async () => {
        while (true) {
          if (requestId !== badgeRequestIdRef.current) return;
          const index = cursor;
          cursor += 1;
          if (index >= badgePayload.length) return;

          try {
            const single = await call<
              Array<{
                id: number;
                downloaded: boolean;
                in_emby: boolean;
                plex_in_library?: boolean;
                emby_in_library?: boolean;
                cache?: string;
                debug?: string;
              }>
            >("check_media_badges", {
              items: [badgePayload[index]],
            });
            if (single[0]) {
              const result = single[0];
              mergedResults.push(result);

              if (requestId !== badgeRequestIdRef.current) return;
              // Progressive UI update: paint badge as soon as each item resolves.
              setBadgeMap((prev) => ({
                ...prev,
                [result.id]: {
                  downloaded: result.downloaded,
                  inEmby: result.in_emby,
                  plexInLibrary: result.plex_in_library,
                  embyInLibrary: result.emby_in_library,
                  cache: result.cache,
                  debug: result.debug,
                },
              }));
            }
          } catch {
            // Keep worker alive; failures are reported in aggregate below.
          }
        }
      };

      await Promise.all(Array.from({ length: workers }, () => worker()));
      if (requestId !== badgeRequestIdRef.current) return;

      const downloadedCount = mergedResults.filter(
        (result) => result.downloaded,
      ).length;
      const inServerCount = mergedResults.filter(
        (result) => result.in_emby,
      ).length;
      const inPlexCount = mergedResults.filter(
        (result) => result.plex_in_library,
      ).length;
      const inEmbyCount = mergedResults.filter(
        (result) => result.emby_in_library,
      ).length;
      const withImdb = visibleItems.filter(
        (item) => (item.imdb_id ?? "").trim().length > 0,
      ).length;
      const withTmdb = visibleItems.filter(
        (item) => item.tmdb_id != null,
      ).length;
      const elapsedMs = Date.now() - startedAt;
      appendLog(
        `🏷 Badge auto-check (${activeTab}) — items ${visibleRange.start}–${visibleRange.end}: ${mergedResults.length} items | local ${downloadedCount} | in_library ${inServerCount} | plex ${inPlexCount} | emby ${inEmbyCount} | imdb ${withImdb} | tmdb ${withTmdb} | ${elapsedMs}ms`,
      );
    };

    run().catch((error: unknown) => {
      if (requestId !== badgeRequestIdRef.current) return;
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? "unknown error");
      appendLog(
        `⚠ Badge check failed (${activeTab}) — items ${visibleRange.start}–${visibleRange.end}: ${message}`,
      );
    });
  }, [activeTab, appendLog, badgeWindowKey, badgeRefreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // When TVShowPanel is open, check badges for ALL its episodes (not just the
  // deduplicated show card that appears in the visible window).
  const tvShowEpisodesKey = useMemo(() => {
    if (!tvShow) return "";
    return getTvEpisodes(tvShow)
      .map((ep) => ep.id)
      .sort((a, b) => a - b)
      .join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvShow, items]);

  useEffect(() => {
    if (!tvShow || !tvShowEpisodesKey) return;
    const episodes = getTvEpisodes(tvShow);
    if (episodes.length === 0) return;

    const requestId = ++badgeRequestIdRef.current;

    const payload = episodes.map((ep) => ({
      id: ep.id,
      ftpPath: ep.ftp_path,
      filename: ep.filename,
      title: ep.tmdb_title ?? ep.title ?? null,
      titleEn: ep.tmdb_title_en ?? null,
      year: ep.year ?? null,
      imdbId: ep.imdb_id ?? null,
      tmdbId: ep.tmdb_id ?? null,
      mediaType: ep.media_type ?? ep.tmdb_type ?? null,
    }));

    const run = async () => {
      let cursor = 0;
      const workers = Math.min(6, payload.length);

      const worker = async () => {
        while (true) {
          if (requestId !== badgeRequestIdRef.current) return;
          const index = cursor;
          cursor += 1;
          if (index >= payload.length) return;

          try {
            const single = await call<
              Array<{
                id: number;
                downloaded: boolean;
                in_emby: boolean;
                plex_in_library?: boolean;
                emby_in_library?: boolean;
                cache?: string;
                debug?: string;
              }>
            >("check_media_badges", { items: [payload[index]] });

            if (single[0] && requestId === badgeRequestIdRef.current) {
              const result = single[0];
              setBadgeMap((prev) => ({
                ...prev,
                [result.id]: {
                  downloaded: result.downloaded,
                  inEmby: result.in_emby,
                  plexInLibrary: result.plex_in_library,
                  embyInLibrary: result.emby_in_library,
                  cache: result.cache,
                  debug: result.debug,
                },
              }));
            }
          } catch {
            // keep worker alive
          }
        }
      };

      await Promise.all(Array.from({ length: workers }, () => worker()));
    };

    run().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvShowEpisodesKey, badgeRefreshTick]);

  // ─── Sidebar sections ─────────────────────────────────────────────────
  // Grouped nav for the desktop sidebar — Library tabs above Transfers.
  const shellLabels =
    language === "es"
      ? {
          library: "Librería",
          transfers: "Transferencias",
          navigation: "Navegación",
          actions: "Acciones",
        }
      : {
          library: "Library",
          transfers: "Transfers",
          navigation: "Navigation",
          actions: "Actions",
        };
  const sidebarSections: SidebarSection<TabId>[] = useMemo(() => {
    const libraryIds: TabId[] = ["all", "movie", "tv", "documentary", "watchlist"];
    const transferIds: TabId[] = ["downloads", "uploads"];
    const toItem = (tab: (typeof TABS)[number]) => ({
      id: tab.id,
      label: t(language, tab.labelKey as never),
      icon: tab.icon,
      count: tabCounts[tab.id] ?? 0,
    });
    return [
      {
        label: shellLabels.library,
        items: visibleTabs.filter((tab) => libraryIds.includes(tab.id)).map(toItem),
      },
      {
        label: shellLabels.transfers,
        items: visibleTabs.filter((tab) => transferIds.includes(tab.id)).map(toItem),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, tabCounts, visibleTabs]);

  // ─── Command palette items ────────────────────────────────────────────
  const commandItems: CommandItem[] = useMemo(() => {
    const navLabel = shellLabels.navigation;
    const actionsLabel = shellLabels.actions;
    const libraryLabel = shellLabels.library;

    const navItems: CommandItem[] = visibleTabs.map((tab) => {
      const label = t(language, tab.labelKey as never);
      return {
        id: `nav:${tab.id}`,
        title: `${language === "es" ? "Ir a" : "Go to"} ${label}`,
        icon: tab.icon,
        section: navLabel,
        searchKey: foldForSearch(`${label} go to ir a`),
        onSelect: () => switchTab(tab.id),
      };
    });

    const actionItems: CommandItem[] = [
      {
        id: "action:settings",
        title: t(language, "settings.title"),
        icon: SettingsIcon,
        section: actionsLabel,
        searchKey: foldForSearch(
          `${t(language, "settings.title")} ajustes settings preferences`,
        ),
        onSelect: () => setShowSettings(true),
      },
      {
        id: "action:refresh",
        title: t(language, "library.refresh"),
        icon: RefreshCw,
        section: actionsLabel,
        searchKey: foldForSearch(
          `${t(language, "library.refresh")} indexar index scan refresh`,
        ),
        onSelect: () => {
          refreshLibrary();
        },
      },
      {
        id: "action:lang",
        title: language === "es" ? "Switch to English" : "Cambiar a Español",
        section: actionsLabel,
        searchKey: foldForSearch("language idioma english español es en"),
        onSelect: () => setLanguage(language === "es" ? "en" : "es"),
      },
    ];

    // Library item search: cap to a sensible number to keep the palette snappy.
    const searchItems: CommandItem[] = items.slice(0, 4000).map((item) => {
      const title = getLocalizedTitle(item, language);
      const year = item.year ?? "";
      const tag =
        item.media_type === "movie"
          ? language === "es"
            ? "Película"
            : "Movie"
          : item.media_type === "tv"
            ? language === "es"
              ? "Serie"
              : "TV Show"
            : item.media_type === "documentary"
              ? language === "es"
                ? "Documental"
                : "Documentary"
              : "";
      return {
        id: `lib:${item.id}`,
        title,
        subtitle: [tag, year].filter(Boolean).join(" · "),
        icon:
          item.media_type === "movie"
            ? Clapperboard
            : item.media_type === "documentary"
              ? FileText
              : Tv2,
        section: libraryLabel,
        searchKey: foldForSearch(
          `${title} ${item.tmdb_title_en ?? ""} ${item.title ?? ""} ${item.release_group ?? ""} ${item.filename}`,
        ),
        onSelect: () => handleCardSelect(item),
      };
    });

    return [...navItems, ...actionItems, ...searchItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, language, visibleTabs, tabCounts]);

  const mediaContent = useEpisodeList ? (
    <EpisodeListView
      key={viewResetKey}
      items={filtered}
      onSelect={handleCardSelect}
      resetKey={viewResetKey}
      language={language}
    />
  ) : (
    <>
      <VirtualMediaGrid
        key={viewResetKey}
        items={filtered}
        selecting={selecting}
        checkedIds={checkedIds}
        onToggleCheck={toggleCheck}
        onCardSelect={handleCardSelect}
        onDownload={startDownload}
        resetKey={viewResetKey}
        language={language}
        badgeMap={badgeMap}
        downloadMap={downloadMap}
        hideEpisodeBadge={isSeriesTab && !useEpisodeList}
        showFileSize={
          activeTab === "all" ||
          (activeTab === "movie" && movieView === "files")
        }
        disableQuickAction={
          useGroupedMovies || (isSeriesTab && !useEpisodeList)
        }
        jumpRequest={jumpRequest}
        onVisibleRangeChange={handleVisibleRangeChange}
        onFirstVisibleIndexChange={handleFirstVisibleIndexChange}
        onActiveLetterChange={handleActiveLetterChange}
        initialScrollIndex={restoreGridIndex}
        onInitialScrollConsumed={handleInitialScrollConsumed}
      />
      {showAlphaRail && alphaIndex && (
        <AlphaJumpRail
          alphaIndex={alphaIndex}
          onJump={handleAlphaJump}
          language={language}
          activeLetter={pinnedLetter ?? activeLetter}
        />
      )}
    </>
  );

  // Sidebar footer slot: language + theme + (web) avatar menu
  const sidebarFooter = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0.18rem",
          borderRadius: "var(--radius-full)",
          border:
            "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
          background:
            "color-mix(in srgb, var(--color-surface) 90%, transparent)",
        }}
      >
        {(["es", "en"] as const).map((value) => {
          const active = language === value;
          return (
            <button
              key={value}
              onClick={() => setLanguage(value)}
              style={{
                padding: "4px 8px",
                borderRadius: "var(--radius-full)",
                border: "none",
                background: active
                  ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                  : "transparent",
                color: active
                  ? "var(--color-primary)"
                  : "var(--color-text-muted)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {value.toUpperCase()}
            </button>
          );
        })}
      </div>
      {isTauri() && <ThemeToggle />}
      {headerSlot}
    </>
  );

  const sidebarNode = (
    <AppSidebar<TabId>
      sections={sidebarSections}
      activeTab={activeTab}
      onTabChange={(tab) => {
        // switchTab already closes Settings + the user-management takeover
        // (state-only, no extra history entry).
        switchTab(tab);
      }}
      onOpenSettings={() => setShowSettings(true)}
      settingsLabel={t(language, "settings.title")}
      settingsActive={showSettings}
      footerSlot={sidebarFooter}
      collapsedFooterSlot={headerSlot}
    />
  );

  const statusBarNode = (
    <AppStatusBar
      connection={
        ftpHost
          ? {
              state: ftpWriteOk ? "ok" : "warn",
              label: `FTP · ${ftpHost}`,
            }
          : { state: "unknown", label: "FTP" }
      }
      indexing={{
        isActive: isIndexing,
        progress,
        label: isIndexing
          ? progress
            ? t(language, "toast.enriching", {
                current: progress.current,
                total: progress.total,
              })
            : tmdbProgress
              ? t(language, "toast.tmdbOf", {
                  done: tmdbProgress.done,
                  total: tmdbProgress.total,
                })
              : t(language, "toast.scanning")
          : `${items.length} ${language === "es" ? "elementos" : "items"}`,
      }}
      transfers={{
        downloads: tabCounts.downloads ?? 0,
        uploads: tabCounts.uploads ?? 0,
      }}
      onJumpToDownloads={() => switchTab("downloads")}
      onJumpToUploads={ftpWriteOk ? () => switchTab("uploads") : undefined}
      onShowActivity={showDevLog ? () => setShowLog((v) => !v) : undefined}
      activityCount={log.length}
    />
  );

  return (
    <AppShell
      sidebar={sidebarNode}
      statusBar={statusBarNode}
      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
    >
      {/* Grid overlay (no-op since the background was simplified) */}
      <div className="grid-overlay" />

      {/* Command palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        items={commandItems}
        placeholder={
          language === "es"
            ? "Buscar en la librería y acciones…"
            : "Search library and actions…"
        }
        emptyMessage={language === "es" ? "Sin resultados" : "No matches"}
      />

      {/* Filter sheet (desktop) */}
      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filters={filters}
        items={filterableItems}
        language={language}
        onChange={setFilters}
      />

      {/* MOBILE TOP NAVBAR — only rendered on small screens; desktop uses the sidebar. */}
      {isMobile && (<nav
        style={{
          display: "flex",
          position: "sticky",
          top: 0,
          zIndex: 50,
          height: 68,
          // Opaque gradient — no backdrop-filter. On iOS Safari a fixed
          // backdrop-filter atop a scrolling list forces the browser to
          // recompute the blur on every paint frame, which destroys 120Hz
          // scroll perf. The background is already ~98% opaque so visually
          // the blur was barely doing anything anyway.
          background:
            "linear-gradient(180deg, var(--color-bg), color-mix(in srgb, var(--color-bg) 96%, black))",
          borderBottom: "1px solid color-mix(in srgb, white 10%, transparent)",
          boxShadow: "0 1px 24px color-mix(in srgb, black 28%, transparent)",
          alignItems: "center",
          padding: "0 1.5rem",
          gap: "1rem",
          flexShrink: 0,
          isolation: "isolate",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginRight: 8,
          }}
        >
          <span
            style={{
              color: "var(--color-text)",
              fontWeight: 700,
              fontSize: 17,
              letterSpacing: "0.06em",
            }}
          >
            OSCATA
          </span>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--color-primary)",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
        </div>

        {/* Nav pills — hidden on mobile (tabs move to bottom bar) */}
        {!isMobile && (
          <div
            style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}
          >
            {visibleTabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: "none",
                    background: active
                      ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                      : "transparent",
                    color: active
                      ? "var(--color-primary)"
                      : "var(--color-text-muted)",
                    minHeight: 36,
                    transition: "color 0.18s ease, background 0.18s ease",
                  }}
                >
                  <tab.icon
                    size={16}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    style={{ display: "block", flexShrink: 0 }}
                  />
                  <span>{t(language, tab.labelKey as never)}</span>
                  {tabCounts[tab.id] > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        background: active
                          ? "color-mix(in srgb, var(--color-primary) 25%, transparent)"
                          : "var(--color-surface-2)",
                        color: active
                          ? "var(--color-primary)"
                          : "var(--color-text-muted)",
                        borderRadius: 999,
                        padding: "1px 7px",
                      }}
                    >
                      {tabCounts[tab.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {isMobile && <div style={{ flex: 1 }} />}

        {/* Right actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginLeft: "auto",
          }}
        >
          {/* Lang switcher — hidden on mobile */}
          {!isMobile && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "0.18rem",
                borderRadius: "var(--radius-full)",
                border:
                  "1px solid color-mix(in srgb, var(--color-border) 82%, transparent)",
                background:
                  "color-mix(in srgb, var(--color-surface) 94%, transparent)",
              }}
            >
              {(["es", "en"] as const).map((value) => {
                const active = language === value;
                return (
                  <button
                    key={value}
                    onClick={() => setLanguage(value)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "var(--radius-full)",
                      border: "none",
                      background: active
                        ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                        : "transparent",
                      color: active
                        ? "var(--color-primary)"
                        : "var(--color-text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {value.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}

          {showDevLog && (
            <button
              onClick={() => setShowLog((v) => !v)}
              title="Activity Log"
              style={{
                ...iconButton,
                background: showLog
                  ? "color-mix(in srgb, var(--color-surface-2) 96%, transparent)"
                  : iconButton.background,
                color: showLog
                  ? "var(--color-text)"
                  : "var(--color-text-muted)",
              }}
            >
              {log.length > 0 && !showLog ? (
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {log.length}
                </span>
              ) : (
                <Activity
                  size={15}
                  strokeWidth={2.3}
                  aria-hidden="true"
                  style={{ display: "block", flexShrink: 0 }}
                />
              )}
            </button>
          )}
          {isTauri() && <ThemeToggle />}
          {headerSlot}
          {/* Mobile burger — shows hidden tabs (Docu, Watchlist, Uploads) */}
          {isMobile && (
            <div ref={mobileNavMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowMobileNavMenu((v) => !v)}
                title="Más secciones"
                style={{
                  ...iconButton,
                  background: showMobileNavMenu
                    ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                    : iconButton.background,
                  color: showMobileNavMenu
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
                  border: showMobileNavMenu
                    ? "1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)"
                    : "1px solid transparent",
                }}
              >
                <Menu
                  size={18}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  style={{ display: "block" }}
                />
              </button>

              {showMobileNavMenu && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow:
                      "0 12px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)",
                    minWidth: 200,
                    overflow: "hidden",
                    zIndex: 80,
                    padding: "4px",
                  }}
                >
                  {visibleTabs
                    .filter(
                      (tab) =>
                        !(
                          ["all", "movie", "tv", "downloads"] as TabId[]
                        ).includes(tab.id),
                    )
                    .map((tab) => {
                      const active = activeTab === tab.id;
                      const count = tabCounts[tab.id];
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            switchTab(tab.id);
                            setShowMobileNavMenu(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            background: active
                              ? "color-mix(in srgb, var(--color-primary) 14%, transparent)"
                              : "none",
                            border: "none",
                            borderRadius: "6px",
                            color: active
                              ? "var(--color-primary)"
                              : "var(--color-text)",
                            fontSize: 14,
                            fontWeight: active ? 700 : 500,
                            cursor: "pointer",
                            transition: "background 0.12s ease",
                          }}
                        >
                          <tab.icon
                            size={16}
                            strokeWidth={active ? 2.4 : 2.0}
                          />
                          <span style={{ flex: 1 }}>
                            {t(language, tab.labelKey as never)}
                          </span>
                          {count > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                background: active
                                  ? "color-mix(in srgb, var(--color-primary) 25%, transparent)"
                                  : "var(--color-surface-2)",
                                color: active
                                  ? "var(--color-primary)"
                                  : "var(--color-text-muted)",
                                borderRadius: 999,
                                padding: "1px 7px",
                                minWidth: 20,
                                textAlign: "center",
                              }}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}
          {/* Settings button */}
          <button
            onClick={() => setShowSettings(true)}
            title={t(language, "settings.title")}
            style={iconButton}
          >
            <SettingsIcon
              size={16}
              strokeWidth={2.1}
              aria-hidden="true"
              style={{ display: "block", flexShrink: 0 }}
            />
          </button>
        </div>
      </nav>)}

      {/* BOTTOM TAB BAR — mobile only */}
      {isMobile && (
        <nav
          className="bottom-tabs"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: "var(--z-bottom-tabs)" as never,
            display: "flex",
            // Opaque background — no backdrop-filter. Fixed-position blur
            // over a scrolling list is the #1 iOS Safari scroll-perf
            // killer; we trade an imperceptible glass look for smooth
            // 120Hz scrolling.
            background: "var(--color-bg)",
            borderTop:
              "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {mobileBottomTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 4px 10px",
                  gap: 3,
                  border: "none",
                  background: "transparent",
                  color: active
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
                  cursor: "pointer",
                  position: "relative",
                  transition: "color 0.15s ease",
                }}
              >
                <tab.icon
                  size={22}
                  strokeWidth={active ? 2.4 : 2.0}
                  aria-hidden="true"
                  style={{ display: "block", flexShrink: 0 }}
                />
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>
                  {t(language, tab.labelKey as never)}
                </span>
                {tabCounts[tab.id] > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      right: "calc(50% - 16px)",
                      fontSize: 9,
                      fontWeight: 700,
                      background: active
                        ? "var(--color-primary)"
                        : "var(--color-surface-2)",
                      color: active ? "#fff" : "var(--color-text-muted)",
                      borderRadius: 999,
                      padding: "1px 5px",
                      minWidth: 16,
                      textAlign: "center",
                    }}
                  >
                    {tabCounts[tab.id]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* FILTER DRAWER — mobile only */}
      {isMobile && filterDrawerOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setFilterDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "color-mix(in srgb, black 55%, transparent)",
              zIndex: "var(--z-filter-drawer-backdrop)" as never,
              backdropFilter: "blur(4px)",
            }}
          />
          {/* Drawer */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "min(320px, 90vw)",
              background: "var(--color-bg)",
              zIndex: "var(--z-filter-drawer)" as never,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              borderRight:
                "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
              boxShadow:
                "4px 0 32px color-mix(in srgb, black 40%, transparent)",
            }}
          >
            {/* Drawer header */}
            <div
              style={{
                padding: "1rem 1.25rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom:
                  "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: "var(--color-text)",
                }}
              >
                {t(language, "filter.filters" as never)}
              </span>
              <button
                onClick={() => setFilterDrawerOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                }}
              >
                ×
              </button>
            </div>
            {/* Drawer content */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "1.25rem 1rem 1.25rem 1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <FilterBar
                filters={filters}
                items={filterableItems}
                language={language}
                searchInputRef={searchInputRef}
                onChange={setFilters}
                hideHeader
              />
            </div>
          </div>
        </>
      )}

      {/* MAIN CONTENT */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Settings takes precedence over media views — opening it always
            replaces the current content area. */}
        {showSettings && (
          <Settings
            language={language}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* User management — content-area takeover so the sidebar + status
            bar stay visible (web mode only; triggered from the avatar menu).
            Settings still wins precedence if both are somehow open. */}
        {!showSettings && showUsers && (
          <WebUsers onBack={onCloseUsers} />
        )}

        {/* Detail / TV show page takes over the content area when an item or
            show is selected. Sidebar + status bar stay visible; back button
            returns to the library. tvShow takes priority over selected — they
            shouldn't both be set, but if they were we'd want the show view. */}
        {!showSettings && !showUsers && tvShow && (
          <TVShowPage
            key={tvShow.id}
            show={tvShow}
            allEpisodes={getTvEpisodes(tvShow)}
            language={language}
            onClose={() => {
              setTvShow(null);
              popDetailFromUrl();
            }}
            onDownload={startDownload}
            onDownloadSeason={handleDownloadSeason}
            downloadMap={downloadMap}
            isDownloadPending={isDownloadPending}
            downloadedBadgeMap={badgeMap}
            watchlistedTmdbIds={watchlist.watchlistedTmdbIds}
            onAddToWatchlist={watchlist.add}
            onOpenWatchlist={() => setActiveTab("watchlist")}
            onFixMatch={(episodes) => {
              const [first] = episodes;
              setFixMatchRequest({
                itemIds: episodes.map((episode) => episode.id),
                initialQuery: getLocalizedTitle(first ?? tvShow, language),
                initialMediaType:
                  tvShow.media_type === "documentary" ? "documentary" : "tv",
              });
            }}
            sectionLabel={sectionTitle[activeTab]}
          />
        )}

        {!showSettings && !showUsers && !tvShow && selected && (
          <DetailPage
            key={selected.id}
            item={selected}
            language={language}
            relatedItems={
              selected.media_type === "movie" ? getMovieVersions(selected) : []
            }
            groupedView={selectedGroupedView}
            onClose={() => {
              setSelected(null);
              popDetailFromUrl();
            }}
            onOpenItem={(item) => {
              setSelectedGroupedView(false);
              setSelected(item);
            }}
            onUpdated={(id, patch) =>
              setSelected((s) => (s && s.id === id ? { ...s, ...patch } : s))
            }
            downloadItem={downloadMap.get(selected.ftp_path)}
            downloadMap={downloadMap}
            downloadedBadgeMap={badgeMap}
            isDownloaded={!!badgeMap[selected.id]?.downloaded}
            onDownload={startDownload}
            isDownloadPending={isDownloadPending}
            onRetry={retryDownload}
            watchlistedTmdbIds={watchlist.watchlistedTmdbIds}
            onAddToWatchlist={watchlist.add}
            onOpenWatchlist={() => setActiveTab("watchlist")}
            sectionLabel={sectionTitle[activeTab]}
          />
        )}

        {!showSettings && !showUsers && !selected && !tvShow && (
          <>
        {/* Toolbar row */}
        <div
          style={{
            padding: isMobile ? "10px 1.5rem" : "12px 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap:
              isMobile && (activeTab === "tv" || activeTab === "movie") ? 8 : 0,
            borderBottom:
              "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
            flexShrink: 0,
          }}
        >
          {/* Main row: title + action buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--color-text)",
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {isMobile && (selecting || watchlistSelecting)
                  ? t(language, "library.selectedCount", {
                      count: selecting
                        ? checkedIds.size
                        : watchlistCheckedIds.size,
                    })
                  : (
                    <>
                      {sectionTitle[activeTab]}
                      {activeTab !== "downloads" && (
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 400,
                            color: "var(--color-text-muted)",
                            marginLeft: 10,
                          }}
                        >
                          {t(language, "library.titlesCount", {
                            count:
                              activeTab === "watchlist"
                                ? watchlist.items.length
                                : filtered.length,
                          })}
                        </span>
                      )}
                    </>
                  )}
              </h1>

              {/* Desktop-only view toggles — mobile renders them in the sub-row below */}
              {!isMobile && activeTab === "tv" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "0.2rem",
                    borderRadius: "var(--radius-full)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
                    background:
                      "color-mix(in srgb, var(--color-surface) 94%, transparent)",
                  }}
                >
                  {(["shows", "episodes"] as const).map((mode) => {
                    const active = tvView === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => setTvView(mode)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "var(--radius-full)",
                          border: "none",
                          background: active
                            ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                            : "transparent",
                          color: active
                            ? "var(--color-primary)"
                            : "var(--color-text-muted)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {mode === "shows"
                          ? t(language, "library.shows")
                          : t(language, "library.episodes")}
                      </button>
                    );
                  })}
                </div>
              )}

              {!isMobile && activeTab === "movie" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "0.2rem",
                    borderRadius: "var(--radius-full)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
                    background:
                      "color-mix(in srgb, var(--color-surface) 94%, transparent)",
                  }}
                >
                  {(["grouped", "files"] as const).map((mode) => {
                    const active = movieView === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => setMovieView(mode)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "var(--radius-full)",
                          border: "none",
                          background: active
                            ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                            : "transparent",
                          color: active
                            ? "var(--color-primary)"
                            : "var(--color-text-muted)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {t(
                          language,
                          mode === "grouped"
                            ? "library.grouped"
                            : "library.files",
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Filter button — mobile only, opens the filter drawer */}
              {isMobile &&
                activeTab !== "downloads" &&
                activeTab !== "watchlist" && (
                  <button
                    onClick={() => setFilterDrawerOpen(true)}
                    title={t(language, "filter.filters" as never)}
                    style={ghostBtn}
                  >
                    <Filter
                      size={14}
                      strokeWidth={2.2}
                      aria-hidden="true"
                      style={{ display: "block", flexShrink: 0 }}
                    />
                  </button>
                )}
              {/* Watchlist multi-select: same toolbar position + visual
                  language as the Library tabs. Bulk action is Remove (not
                  Fix Match) since each watchlist row is a tracked title. */}
              {activeTab === "watchlist" ? (
                watchlistSelecting ? (
                  <>
                    {!isMobile && (
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          fontSize: 13,
                        }}
                      >
                        {t(language, "library.selectedCount", {
                          count: watchlistCheckedIds.size,
                        })}
                      </span>
                    )}
                    <button
                      onClick={() =>
                        setWatchlistCheckedIds(
                          new Set(watchlist.items.map((item) => item.id)),
                        )
                      }
                      disabled={watchlist.items.length === 0}
                      title={t(language, "library.selectAll")}
                      aria-label={t(language, "library.selectAll")}
                      style={{
                        ...ghostBtn,
                        opacity: watchlist.items.length === 0 ? 0.5 : 1,
                        cursor:
                          watchlist.items.length === 0 ? "default" : "pointer",
                      }}
                    >
                      <CheckSquare
                        size={14}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        style={{ display: "block", flexShrink: 0 }}
                      />
                      {!isMobile && t(language, "library.selectAll")}
                    </button>
                    <button
                      onClick={() => {
                        const count = watchlistCheckedIds.size;
                        if (count === 0) return;
                        const msg =
                          language === "es"
                            ? `¿Quitar ${count} título${count === 1 ? "" : "s"} del seguimiento?`
                            : `Remove ${count} title${count === 1 ? "" : "s"} from the watchlist?`;
                        if (!confirm(msg)) return;
                        for (const id of watchlistCheckedIds) {
                          void watchlist.remove(id);
                        }
                        exitWatchlistSelect();
                      }}
                      disabled={watchlistCheckedIds.size === 0}
                      title={language === "es" ? "Quitar" : "Remove"}
                      aria-label={language === "es" ? "Quitar" : "Remove"}
                      style={{
                        ...primaryBtn,
                        background:
                          watchlistCheckedIds.size === 0
                            ? "color-mix(in srgb, var(--color-danger) 22%, transparent)"
                            : "var(--color-danger)",
                        opacity: watchlistCheckedIds.size === 0 ? 0.6 : 1,
                        cursor:
                          watchlistCheckedIds.size === 0 ? "default" : "pointer",
                      }}
                    >
                      <Trash2
                        size={14}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        style={{ display: "block", flexShrink: 0 }}
                      />
                      {isMobile
                        ? `(${watchlistCheckedIds.size})`
                        : `${language === "es" ? "Quitar" : "Remove"} (${watchlistCheckedIds.size})`}
                    </button>
                    <button
                      onClick={exitWatchlistSelect}
                      title={t(language, "library.cancel")}
                      aria-label={t(language, "library.cancel")}
                      style={ghostBtn}
                    >
                      {isMobile ? (
                        <Plus
                          size={14}
                          strokeWidth={2.2}
                          aria-hidden="true"
                          style={{
                            display: "block",
                            flexShrink: 0,
                            transform: "rotate(45deg)",
                          }}
                        />
                      ) : (
                        t(language, "library.cancel")
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Add lives to the left of Select so the primary
                        action sits first in the action cluster, matching
                        the user's expectation for tap order. */}
                    <button
                      onClick={() => setWatchlistShowAdd(true)}
                      title={language === "es" ? "Agregar título" : "Add title"}
                      style={{
                        ...primaryBtn,
                      }}
                    >
                      <Plus
                        size={14}
                        strokeWidth={2.4}
                        aria-hidden="true"
                        style={{ display: "block", flexShrink: 0 }}
                      />
                      {!isMobile && (language === "es" ? "Agregar" : "Add")}
                    </button>
                    <button
                      onClick={() => setWatchlistSelecting(true)}
                      title={t(language, "library.selectMultiple")}
                      style={ghostBtn}
                      disabled={watchlist.items.length === 0}
                    >
                      <CheckSquare
                        size={14}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        style={{ display: "block", flexShrink: 0 }}
                      />
                      {!isMobile && t(language, "library.select")}
                    </button>
                  </>
                )
              ) : activeTab === "downloads" ||
                activeTab === "uploads" ? null : selecting ? (
                <>
                  {!isMobile && (
                    <span
                      style={{
                        color: "var(--color-text-muted)",
                        fontSize: 13,
                      }}
                    >
                      {t(language, "library.selectedCount", {
                        count: checkedIds.size,
                      })}
                    </span>
                  )}
                  <button
                    onClick={() =>
                      setCheckedIds(new Set(filtered.map((item) => item.id)))
                    }
                    disabled={filtered.length === 0}
                    title={t(language, "library.selectAll")}
                    aria-label={t(language, "library.selectAll")}
                    style={{
                      ...ghostBtn,
                      opacity: filtered.length === 0 ? 0.5 : 1,
                      cursor: filtered.length === 0 ? "default" : "pointer",
                    }}
                  >
                    <CheckSquare
                      size={14}
                      strokeWidth={2.2}
                      aria-hidden="true"
                      style={{ display: "block", flexShrink: 0 }}
                    />
                    {!isMobile && t(language, "library.selectAll")}
                  </button>
                  <button
                    onClick={() => setShowBulkFix(true)}
                    disabled={checkedIds.size === 0}
                    title={t(language, "library.fixMatch")}
                    aria-label={t(language, "library.fixMatch")}
                    style={{
                      ...primaryBtn,
                      opacity: checkedIds.size === 0 ? 0.5 : 1,
                      cursor: checkedIds.size === 0 ? "default" : "pointer",
                    }}
                  >
                    <Pencil
                      size={14}
                      strokeWidth={2.2}
                      aria-hidden="true"
                      style={{ display: "block", flexShrink: 0 }}
                    />
                    {isMobile
                      ? `(${checkedIds.size})`
                      : `${t(language, "library.fixMatch")} (${checkedIds.size})`}
                  </button>
                  <button
                    onClick={exitSelect}
                    title={t(language, "library.cancel")}
                    aria-label={t(language, "library.cancel")}
                    style={ghostBtn}
                  >
                    {isMobile ? (
                      <Plus
                        size={14}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        style={{
                          display: "block",
                          flexShrink: 0,
                          transform: "rotate(45deg)",
                        }}
                      />
                    ) : (
                      t(language, "library.cancel")
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSelecting(true)}
                    title={t(language, "library.selectMultiple")}
                    style={ghostBtn}
                  >
                    <CheckSquare
                      size={14}
                      strokeWidth={2.2}
                      aria-hidden="true"
                      style={{ display: "block", flexShrink: 0 }}
                    />
                    {!isMobile && t(language, "library.select")}
                  </button>
                  <div ref={actionsMenuRef} style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowActionsMenu((open) => !open)}
                      title={t(language, "library.actions")}
                      style={{ ...ghostBtn, padding: "7px 11px" }}
                    >
                      <MoreHorizontal
                        size={16}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        style={{ display: "block", flexShrink: 0 }}
                      />
                    </button>

                    {showActionsMenu && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 8px)",
                          right: 0,
                          minWidth: 220,
                          padding: 6,
                          borderRadius: "var(--radius-lg)",
                          border:
                            "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
                          background:
                            "color-mix(in srgb, var(--color-surface) 96%, transparent)",
                          boxShadow:
                            "0 16px 34px color-mix(in srgb, black 26%, transparent)",
                          zIndex: 30,
                        }}
                      >
                        <button
                          onClick={refreshLibrary}
                          disabled={
                            isIndexing ||
                            refreshingLibrary ||
                            rematching ||
                            clearingAll ||
                            refreshingMetadata
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            background: "transparent",
                            color: "var(--color-text)",
                            textAlign: "left",
                            cursor:
                              isIndexing ||
                              refreshingLibrary ||
                              rematching ||
                              clearingAll ||
                              refreshingMetadata
                                ? "default"
                                : "pointer",
                            opacity:
                              isIndexing ||
                              refreshingLibrary ||
                              rematching ||
                              clearingAll ||
                              refreshingMetadata
                                ? 0.5
                                : 1,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {isIndexing || refreshingLibrary
                            ? t(language, "library.refreshing")
                            : t(language, "library.refresh")}
                        </button>
                        <button
                          onClick={refreshAllMetadata}
                          disabled={
                            refreshingMetadata ||
                            rematching ||
                            clearingAll ||
                            refreshingLibrary ||
                            isIndexing
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            background: "transparent",
                            color: "var(--color-text)",
                            textAlign: "left",
                            cursor:
                              refreshingMetadata ||
                              rematching ||
                              clearingAll ||
                              refreshingLibrary ||
                              isIndexing
                                ? "default"
                                : "pointer",
                            opacity:
                              refreshingMetadata ||
                              rematching ||
                              clearingAll ||
                              refreshingLibrary ||
                              isIndexing
                                ? 0.5
                                : 1,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {refreshingMetadata
                            ? t(language, "library.refreshingMetadata")
                            : t(language, "library.refreshAllMetadata")}
                        </button>
                        <button
                          onClick={runRematchAll}
                          disabled={
                            rematching ||
                            clearingAll ||
                            refreshingLibrary ||
                            refreshingMetadata
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            background: "transparent",
                            color: "var(--color-text)",
                            textAlign: "left",
                            cursor:
                              rematching ||
                              clearingAll ||
                              refreshingLibrary ||
                              refreshingMetadata
                                ? "default"
                                : "pointer",
                            opacity:
                              rematching ||
                              clearingAll ||
                              refreshingLibrary ||
                              refreshingMetadata
                                ? 0.5
                                : 1,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {rematching
                            ? t(language, "library.matching")
                            : t(language, "library.rematchAll")}
                        </button>
                        <button
                          onClick={runRematchAllPlex}
                          disabled={
                            rematching ||
                            clearingAll ||
                            refreshingLibrary ||
                            refreshingMetadata
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            background: "transparent",
                            color: "var(--color-text)",
                            textAlign: "left",
                            cursor:
                              rematching ||
                              clearingAll ||
                              refreshingLibrary ||
                              refreshingMetadata
                                ? "default"
                                : "pointer",
                            opacity:
                              rematching ||
                              clearingAll ||
                              refreshingLibrary ||
                              refreshingMetadata
                                ? 0.5
                                : 1,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {rematching
                            ? t(language, "library.matching")
                            : t(language, "library.rematchAllPlex")}
                        </button>
                        <button
                          onClick={clearAllMetadata}
                          disabled={
                            clearingAll ||
                            rematching ||
                            refreshingLibrary ||
                            refreshingMetadata
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "var(--radius)",
                            border: "none",
                            background: "transparent",
                            color: "var(--color-danger)",
                            textAlign: "left",
                            cursor:
                              clearingAll ||
                              rematching ||
                              refreshingLibrary ||
                              refreshingMetadata
                                ? "default"
                                : "pointer",
                            opacity:
                              clearingAll ||
                              rematching ||
                              refreshingLibrary ||
                              refreshingMetadata
                                ? 0.5
                                : 1,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {clearingAll
                            ? t(language, "library.clearing")
                            : t(language, "library.clearAllMetadata")}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {/* closes main row */}

          {/* Mobile-only view toggle sub-row */}
          {isMobile && activeTab === "tv" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "0.2rem",
                borderRadius: "var(--radius-full)",
                border:
                  "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
                background:
                  "color-mix(in srgb, var(--color-surface) 94%, transparent)",
                alignSelf: "flex-start",
              }}
            >
              {(["shows", "episodes"] as const).map((mode) => {
                const active = tvView === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setTvView(mode)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-full)",
                      border: "none",
                      background: active
                        ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                        : "transparent",
                      color: active
                        ? "var(--color-primary)"
                        : "var(--color-text-muted)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {mode === "shows"
                      ? t(language, "library.shows")
                      : t(language, "library.episodes")}
                  </button>
                );
              })}
            </div>
          )}
          {isMobile && activeTab === "movie" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "0.2rem",
                borderRadius: "var(--radius-full)",
                border:
                  "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
                background:
                  "color-mix(in srgb, var(--color-surface) 94%, transparent)",
                alignSelf: "flex-start",
              }}
            >
              {(["grouped", "files"] as const).map((mode) => {
                const active = movieView === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setMovieView(mode)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-full)",
                      border: "none",
                      background: active
                        ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                        : "transparent",
                      color: active
                        ? "var(--color-primary)"
                        : "var(--color-text-muted)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {t(
                      language,
                      mode === "grouped" ? "library.grouped" : "library.files",
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop filter chip row — slim, lives above the grid. Hidden on
            downloads/uploads/watchlist where filters don't apply. */}
        {!isMobile &&
          activeTab !== "downloads" &&
          activeTab !== "uploads" &&
          activeTab !== "watchlist" && (
            <div
              style={{
                padding: "10px 1.5rem",
                borderBottom:
                  "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
                flexShrink: 0,
              }}
            >
              <FilterChipRow
                filters={filters}
                items={filterableItems}
                language={language}
                onChange={setFilters}
                onOpenFilters={() => setFilterSheetOpen(true)}
                searchInputRef={searchInputRef}
              />
            </div>
          )}

        <div
          className={isMobile ? "mobile-content-area" : undefined}
          style={{ flex: 1, display: "flex", minHeight: 0 }}
        >
          {/* Scrollable content grid */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {activeTab === "uploads" ? (
              <UploadsTab
                uploads={uploads}
                language={language}
                onCancel={cancelUpload}
                onRetry={retryUpload}
                onDelete={deleteUpload}
                onClearCompleted={clearCompletedUploads}
              />
            ) : activeTab === "downloads" ? (
              <DownloadsTab
                language={language}
                downloads={downloads}
                cancelDownload={cancelDownload}
                clearCompleted={clearCompleted}
                retryDownload={retryDownload}
                openDownloadFolder={openDownloadFolder}
                deleteDownload={deleteDownload}
              />
            ) : activeTab === "watchlist" ? (
              <WatchlistTab
                watchlist={watchlist}
                language={language}
                onNavigateToItem={handleNavigateFromWatchlist}
                selecting={watchlistSelecting}
                checkedIds={watchlistCheckedIds}
                onToggleCheck={toggleWatchlistCheck}
                onOpenAdd={() => setWatchlistShowAdd(true)}
              />
            ) : (
              <>
                {mediaContent}

                {filtered.length === 0 && !progress && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 16,
                      padding: "40px 24px",
                      color: "var(--color-text-muted)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background:
                          "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                        color: "var(--color-primary)",
                      }}
                    >
                      <LayoutGrid
                        size={26}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--color-text)",
                        maxWidth: 420,
                      }}
                    >
                      {items.length === 0
                        ? t(language, "library.noMediaStarting")
                        : activeTab !== "all"
                          ? t(language, "library.noCategory", {
                              category: t(
                                language,
                                (TABS.find((tab) => tab.id === activeTab)
                                  ?.labelKey ?? "nav.all") as never,
                              ).toLowerCase(),
                            })
                          : t(language, "library.noResultsFilters")}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                      {items.length === 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={refreshLibrary}
                            style={{
                              padding: "8px 16px",
                              borderRadius: 999,
                              border: "none",
                              background: "var(--color-primary)",
                              color: "#fff",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
                            {t(language, "library.refresh")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSettings(true)}
                            style={{
                              padding: "8px 16px",
                              borderRadius: 999,
                              border:
                                "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
                              background: "transparent",
                              color: "var(--color-text)",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <SettingsIcon size={14} strokeWidth={2.0} aria-hidden="true" />
                            {t(language, "settings.title")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setFilters(defaultFilters(activeTab, prefs))
                          }
                          style={{
                            padding: "8px 16px",
                            borderRadius: 999,
                            border:
                              "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
                            background: "transparent",
                            color: "var(--color-text)",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {t(language, "filter.clear")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      <IndexStatus
        progress={progress}
        isIndexing={isIndexing}
        completionSummary={completionSummary}
        onDismissCompletion={dismissCompletion}
        onCancelIndex={forceClearIndexing}
        activityLogOpen={showLog}
        language={language}
        tmdbProgress={tmdbProgress}
        isMobile={isMobile}
      />
      {metaRefreshProgress !== null && !isIndexing && (
        <div
          style={{
            position: "fixed",
            left: 18,
            bottom: isMobile
              ? "calc(64px + env(safe-area-inset-bottom, 0px) + 22px)"
              : 22,
            zIndex: 52,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0.6rem 0.85rem",
            borderRadius: 999,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            fontSize: 12,
            color: "var(--color-text-muted)",
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 80,
              height: 4,
              borderRadius: 999,
              overflow: "hidden",
              background: "var(--color-surface-2)",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.round((metaRefreshProgress.done / metaRefreshProgress.total) * 100))}%`,
                height: "100%",
                background: "var(--color-primary)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span>
            {t(language, "metaRefresh.banner", {
              done: metaRefreshProgress.done,
              total: metaRefreshProgress.total,
            })}
          </span>
        </div>
      )}
      <DownloadFeedbackToast
        language={language}
        onGoToDownloads={() => switchTab("downloads")}
      />
      {indexError && (
        <IndexErrorToast
          message={indexError}
          language={language}
          onRetry={retryIndexing}
          onOpenSettings={() => setShowSettings(true)}
          onDismiss={clearIndexError}
        />
      )}

      {/* DetailPanel + TVShowPanel renders moved inline into MAIN CONTENT
          as DetailPage + TVShowPage. */}

      {fixMatchRequest && (
        <FixMatchModal
          itemIds={fixMatchRequest.itemIds}
          initialQuery={fixMatchRequest.initialQuery}
          initialMediaType={fixMatchRequest.initialMediaType}
          language={language}
          onApply={() => {}}
          onClose={() => setFixMatchRequest(null)}
        />
      )}

      {showBulkFix && (
        <FixMatchModal
          itemIds={Array.from(checkedIds)}
          initialQuery=""
          language={language}
          onApply={() => {}}
          onClose={() => {
            setShowBulkFix(false);
            exitSelect();
          }}
        />
      )}

      {watchlistShowAdd && (
        <WatchlistAddModal
          language={language}
          watchlistedTmdbIds={watchlist.watchlistedTmdbIds}
          onAdd={watchlist.add}
          onClose={() => setWatchlistShowAdd(false)}
        />
      )}

      {showDevLog && showLog && (
        <ActivityLog
          language={language}
          entries={log}
          onClear={clearLog}
          onClose={() => setShowLog(false)}
        />
      )}

      {quitDialogVisible &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 420,
                background: "var(--color-surface)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-border)",
                padding: "1.75rem",
                boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--color-text)",
                  marginBottom: 8,
                }}
              >
                {t(language, "quit.title")}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--color-text-muted)",
                  marginBottom: 24,
                }}
              >
                {t(language, "quit.body", { count: activeCount })}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={cancelQuit}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface-2)",
                    color: "var(--color-text)",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {t(language, "quit.keep")}
                </button>
                <button
                  onClick={confirmQuit}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "var(--radius)",
                    border: "none",
                    background: "var(--color-danger)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t(language, "quit.confirm")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </AppShell>
  );
}
