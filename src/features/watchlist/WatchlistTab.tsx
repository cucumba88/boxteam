import { useEffect, useMemo, useState } from "react";
import { Bookmark, Plus, Search, X } from "lucide-react";
import Button from "../../components/ui/Button";
import type { UseWatchlistReturn } from "./useWatchlist";
import type { WatchlistItem } from "./types";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { useIsMobile } from "../../hooks/useIsMobile";
import { isTauri } from "../../lib/transport";
import WatchlistCard from "./WatchlistCard";
import WatchlistDetailPanel from "./WatchlistDetailPanel";
import { foldForSearch } from "../../utils/textSearch";
import { t } from "../../utils/i18n";

/** Reads a watchlist detail tmdb_id from "/watchlist/<id>". Returns null on
 *  bad input or when running inside Tauri (no URL bar there). */
function detailTmdbIdFromPath(): number | null {
  if (isTauri()) return null;
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "watchlist" || !parts[1]) return null;
  const id = Number(parts[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

interface WatchlistTabProps {
  watchlist: UseWatchlistReturn;
  language: AppLanguage;
  onNavigateToItem?: (tmdbId: number, mediaType: string) => void;
  /** Multi-select state is lifted into Library so the page toolbar can
   *  render the controls in the same place as Movies/TV. */
  selecting?: boolean;
  checkedIds?: Set<number>;
  onToggleCheck?: (id: number) => void;
  /** Opens the Add dialog. Lifted to Library so the Add button can live in
   *  the outer toolbar (same row as the Select / bulk controls). The empty
   *  state's "Add a title" CTA invokes this too. */
  onOpenAdd?: () => void;
}

type TypeFilter = "all" | "movie" | "tv";
type StatusFilter = "all" | "pending" | "available";

export default function WatchlistTab({
  watchlist,
  language,
  onNavigateToItem,
  selecting = false,
  checkedIds,
  onToggleCheck,
  onOpenAdd,
}: WatchlistTabProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<WatchlistItem | null>(null);
  const isMobile = useIsMobile();

  const effectiveCheckedIds = checkedIds ?? new Set<number>();

  /** Resolve selected from the URL whenever items load or the path changes
   *  (browser back/forward, deep links). Web-only — Tauri has no URL bar. */
  useEffect(() => {
    if (isTauri()) return;
    const sync = () => {
      const tmdbId = detailTmdbIdFromPath();
      if (tmdbId == null) {
        setSelected(null);
        return;
      }
      const match = watchlist.items.find((item) => item.tmdb_id === tmdbId);
      // If items haven't loaded yet, leave selected alone; this effect will
      // fire again once items arrive.
      if (match) setSelected(match);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [watchlist.items]);

  /** Open detail: pushes /watchlist/<tmdbId> so the URL is shareable and
   *  back/forward navigation works. */
  const openDetail = (item: WatchlistItem) => {
    setSelected(item);
    if (!isTauri() && item.tmdb_id) {
      const target = `/watchlist/${item.tmdb_id}`;
      if (window.location.pathname !== target) {
        window.history.pushState({}, "", target);
      }
    }
  };

  const closeDetail = () => {
    setSelected(null);
    if (!isTauri() && window.location.pathname.startsWith("/watchlist/")) {
      window.history.pushState({}, "", "/watchlist");
    }
  };

  const filtered = useMemo(() => {
    return watchlist.items.filter((item) => {
      const title =
        language === "es" ? item.title : (item.title_en ?? item.title);
      if (search && !foldForSearch(title).includes(foldForSearch(search)))
        return false;
      if (typeFilter !== "all" && item.tmdb_type !== typeFilter) return false;
      if (statusFilter !== "all" && item.library_status !== statusFilter)
        return false;
      return true;
    });
  }, [watchlist.items, search, typeFilter, statusFilter, language]);

  const handleRemove = (id: number) => {
    void watchlist.remove(id);
    if (selected?.id === id) setSelected(null);
  };

  const handleUpdate = async (
    id: number,
    scope: "all" | "latest",
    autoDownload: boolean,
    profileId: number,
  ) => {
    await watchlist.update(id, scope, autoDownload, profileId);
    // Refresh the selected item from updated list
    setSelected((prev) =>
      prev?.id === id
        ? {
            ...prev,
            scope,
            auto_download: autoDownload ? 1 : 0,
            profile_id: profileId,
          }
        : prev,
    );
  };

  // Detail takeover: when a watchlist item is selected, the whole tab area
  // becomes the detail page (same pattern as DetailPage / TVShowPage). The
  // sidebar + status bar remain visible because we're still inside MAIN
  // CONTENT in Library.
  if (selected) {
    return (
      <WatchlistDetailPanel
        item={selected}
        language={language}
        onClose={closeDetail}
        onRemove={handleRemove}
        onUpdate={handleUpdate}
        getCoverage={watchlist.getCoverage}
        getSeasons={watchlist.getSeasons}
        onNavigateToItem={(tmdbId, mediaType) => {
          closeDetail();
          onNavigateToItem?.(tmdbId, mediaType);
        }}
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        // Outer wrapper does NOT scroll — the inner grid div below has its
        // own overflowY:auto. Having both was a literal double-scrollbar
        // bug on mobile.
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      {/* Library's outer toolbar already renders "Seguimiento N titles", so
          no bespoke header here — we just show the chip row, same layout as
          the movies/tv pages. */}
      <div
        style={{
          padding: "10px 1.5rem",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? 8 : 14,
          flexShrink: 0,
          // Matches the desktop FilterChipRow separator used on Movies/TV.
          borderBottom:
            "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
        }}
      >
        {/* Toolbar — desktop fits everything on one row; on mobile the
            search input takes its own row (full width) and the chips +
            actions sit below in a horizontally-scrollable strip so nothing
            wraps into a broken multi-line stack. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          {/* Search input — matches FilterChipRow */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 34,
              padding: "0 10px",
              width: isMobile ? "100%" : 280,
              maxWidth: "100%",
              borderRadius: "var(--radius)",
              border:
                "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
              background:
                "color-mix(in srgb, var(--color-surface) 90%, transparent)",
              flex: isMobile ? "1 1 100%" : "none",
            }}
          >
            <Search
              size={13}
              strokeWidth={2.2}
              aria-hidden="true"
              style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`${t(language, "common.search")}…`}
              aria-label={t(language, "common.search")}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--color-text)",
                // 16px minimum prevents iOS Safari from auto-zooming on focus.
                fontSize: 16,
                fontFamily: "inherit",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear"
                style={{
                  flexShrink: 0,
                  background: "none",
                  border: "none",
                  padding: 2,
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  lineHeight: 0,
                }}
              >
                <X size={12} strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Type filter chips */}
          {(["all", "movie", "tv"] as TypeFilter[]).map((tf) => (
            <FilterChip
              key={`type-${tf}`}
              label={t(
                language,
                tf === "all"
                  ? "watchlist.allTypes"
                  : tf === "movie"
                    ? "watchlist.movies"
                    : "watchlist.tv",
              )}
              active={typeFilter === tf}
              onClick={() => setTypeFilter(tf)}
            />
          ))}

          {/* Divider */}
          <div
            style={{
              width: 1,
              alignSelf: "stretch",
              background:
                "color-mix(in srgb, var(--color-border) 70%, transparent)",
              margin: "0 2px",
            }}
          />

          {/* Status filter chips */}
          {(["all", "pending", "available"] as StatusFilter[]).map((s) => (
            <FilterChip
              key={`status-${s}`}
              label={t(
                language,
                s === "all"
                  ? "watchlist.statusAll"
                  : s === "pending"
                    ? "watchlist.statusPending"
                    : "watchlist.statusAvailable",
              )}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            />
          ))}

          {/* The right-side actions (Add, Select / bulk controls) live in
              Library's outer toolbar — same place as Movies/TV. */}
        </div>
      </div>

      {/* Grid — matches VirtualMediaGrid spacing/padding so the watchlist
          tab feels like the library tabs. `mobile-content-area` adds the
          safe-area padding for the bottom tab bar. */}
      <div
        className={isMobile ? "mobile-content-area" : undefined}
        style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: isMobile ? "16px 1.5rem 6.5rem" : "1.5rem",
        }}
      >
        {watchlist.loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 200,
              color: "var(--color-text-muted)",
            }}
          >
            {t(language, "common.loading")}
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 260,
              gap: 14,
              textAlign: "center",
              color: "var(--color-text-muted)",
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
              <Bookmark size={26} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <span
              style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)" }}
            >
              {watchlist.items.length === 0
                ? t(language, "watchlist.empty")
                : t(language, "watchlist.noResults")}
            </span>
            {watchlist.items.length === 0 && onOpenAdd && (
              <Button variant="primary" icon={Plus} onClick={onOpenAdd}>
                {t(language, "watchlist.addTitleCta")}
              </Button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              // Same min-width grid as VirtualMediaGrid so cards stay
              // legible across the breakpoint instead of being crammed
              // into 3 narrow columns on phones.
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 14,
            }}
          >
            {filtered.map((item) => (
              <WatchlistCard
                key={item.id}
                item={item}
                language={language}
                onOpen={openDetail}
                onRemove={handleRemove}
                selecting={selecting}
                checked={effectiveCheckedIds.has(item.id)}
                onToggleCheck={onToggleCheck}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add modal is rendered by Library now — see the watchlist toolbar
          actions there. */}

      {/* Detail page is rendered as a takeover at the top of the function
          when `selected` is set — no overlay here. */}
    </div>
  );
}

/**
 * Same visual chip used by the Library filter row — shared style so the
 * watchlist toolbar and the media filters feel like the same system.
 */
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        border: active
          ? "1px solid color-mix(in srgb, var(--color-primary) 50%, transparent)"
          : "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
        background: active
          ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
          : "color-mix(in srgb, var(--color-surface) 70%, transparent)",
        color: active ? "var(--color-primary)" : "var(--color-text)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
