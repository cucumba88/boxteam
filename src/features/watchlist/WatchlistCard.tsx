import { useState } from "react";
import { Check, Clapperboard, Download, Tv, X } from "lucide-react";
import type { WatchlistItem } from "./types";
import { AppLanguage } from "../../utils/mediaLanguage";
import { useIsMobile } from "../../hooks/useIsMobile";
import { t } from "../../utils/i18n";

interface WatchlistCardProps {
  item: WatchlistItem;
  language: AppLanguage;
  onOpen: (item: WatchlistItem) => void;
  onRemove: (id: number) => void;
  /** Multi-select mode flag — when true, clicking the card toggles its
   *  checked state instead of opening the detail page. */
  selecting?: boolean;
  checked?: boolean;
  onToggleCheck?: (id: number) => void;
}

const TMDB_IMG = "https://image.tmdb.org/t/p/w300";

export default function WatchlistCard({
  item,
  language,
  onOpen,
  onRemove,
  selecting = false,
  checked = false,
  onToggleCheck,
}: WatchlistCardProps) {
  const [hovered, setHovered] = useState(false);
  // Two-step remove: the first click on the X arms it, the second removes.
  // A single stray click used to drop the title and its settings at once.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const isMobile = useIsMobile();

  // Hide the per-card remove button while in select mode — bulk actions
  // happen via the toolbar. On touch screens there is no hover, so the X
  // was permanently drawn over every poster (and hid the auto-download /
  // next-episode markers); mobile removes from the detail page or via
  // Select instead.
  const showRemove = !selecting && !isMobile && (hovered || confirmingRemove);

  const poster = item.poster
    ? item.poster.startsWith("http")
      ? item.poster
      : `${TMDB_IMG}${item.poster}`
    : null;

  const displayTitle =
    language === "es" ? item.title : (item.title_en ?? item.title);

  // Compare calendar days: TMDB gives a bare date ("2026-12-04"), which
  // `new Date()` parses as UTC midnight, so an episode airing *today* used
  // to vanish from the card in timezones east of UTC.
  const todayIso = new Date().toLocaleDateString("sv-SE");
  const nextEpSoon =
    !!item.next_episode_date && item.next_episode_date.slice(0, 10) >= todayIso;
  const nextEpDate = item.next_episode_date
    ? new Date(`${item.next_episode_date.slice(0, 10)}T12:00:00`)
    : null;

  const activeBorder = checked
    ? "var(--color-primary)"
    : hovered
      ? "var(--color-primary)"
      : "var(--color-border)";

  const activate = () => {
    if (selecting) {
      onToggleCheck?.(item.id);
    } else {
      onOpen(item);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={displayTitle}
      aria-pressed={selecting ? checked : undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setConfirmingRemove(false);
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "pointer",
        minWidth: 0,
      }}
    >
    <div
      style={{
        position: "relative",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        background: "var(--color-surface)",
        border: `1px solid ${activeBorder}`,
        boxShadow: checked
          ? "0 0 0 2px color-mix(in srgb, var(--color-primary) 50%, transparent)"
          : "none",
        transition: "border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease",
        transform: hovered && !selecting ? "translateY(-2px)" : "none",
        aspectRatio: "2 / 3",
      }}
    >
      {/* Selection checkbox — only in multi-select mode */}
      {selecting && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: checked
              ? "1px solid var(--color-primary)"
              : "1px solid rgba(255, 255, 255, 0.7)",
            background: checked
              ? "var(--color-primary)"
              : "color-mix(in srgb, black 55%, transparent)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          {checked && (
            <Check size={14} strokeWidth={3} aria-hidden="true" />
          )}
        </div>
      )}
      {/* Poster */}
      {poster ? (
        <img
          loading="lazy"
          decoding="async"
          src={poster}
          alt={displayTitle}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-surface-2)",
            color: "var(--color-text-muted)",
          }}
        >
          {item.tmdb_type === "tv" ? (
            <Tv size={30} strokeWidth={1.6} aria-hidden="true" />
          ) : (
            <Clapperboard size={30} strokeWidth={1.6} aria-hidden="true" />
          )}
        </div>
      )}

      {/* gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: hovered
            ? "linear-gradient(to top, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.2) 100%)"
            : "linear-gradient(to top, rgba(0,0,0,0.75) 25%, transparent 60%)",
          transition: "background 0.15s ease",
        }}
      />

      {/* Bottom-left: small chips. Reduced from the previous "badge soup"
          (5 chips overflowing on narrow cards) to two essentials, both with
          `nowrap` so they never break mid-word. Auto-download and next-ep
          info now live on a top-right icon-only marker. */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          right: 8,
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        <span
          style={{
            background:
              item.library_status === "available"
                ? "var(--color-success)"
                : "rgba(0,0,0,0.7)",
            // Muted grey on a near-black pill was barely legible.
            color:
              item.library_status === "available"
                ? "#fff"
                : "rgba(255,255,255,0.85)",
            fontSize: 10,
            fontWeight: 700,
            borderRadius: "var(--radius-full)",
            padding: "2px 7px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {item.library_status === "available"
            ? language === "es"
              ? "Disponible"
              : "Available"
            : language === "es"
              ? "Pendiente"
              : "Pending"}
        </span>

        {item.library_count > 0 && (
          <span
            style={{
              background: "rgba(0,0,0,0.7)",
              color: "var(--color-teal)",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: "var(--radius-full)",
              padding: "2px 7px",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            {item.library_count}{" "}
            {item.tmdb_type === "tv" ? "ep" : t(language, "watchlist.files")}
          </span>
        )}
      </div>

      {/* Top-right markers (only when relevant) — auto-download / next-ep
          stacked tightly so they don't compete with the bottom chips. */}
      {(item.auto_download === 1 || nextEpSoon) && !selecting && !showRemove && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "flex-end",
            zIndex: 3,
          }}
        >
          {item.auto_download === 1 && (
            <span
              title={
                language === "es" ? "Descarga automática" : "Auto-download"
              }
              aria-label={
                language === "es" ? "Descarga automática" : "Auto-download"
              }
              style={{
                background: "rgba(0,0,0,0.65)",
                color: "var(--color-warning)",
                borderRadius: "var(--radius-full)",
                padding: 4,
                lineHeight: 0,
              }}
            >
              <Download size={11} strokeWidth={2.6} aria-hidden="true" />
            </span>
          )}
          {nextEpSoon && (
            <span
              title={
                (language === "es" ? "Próximo episodio: " : "Next episode: ") +
                nextEpDate!.toLocaleDateString(
                  language === "es" ? "es-ES" : "en-US",
                )
              }
              style={{
                background: "rgba(0,0,0,0.65)",
                color: "var(--color-warning)",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: "var(--radius-full)",
                padding: "2px 6px",
                whiteSpace: "nowrap",
              }}
            >
              ▷{" "}
              {nextEpDate!.toLocaleDateString(
                language === "es" ? "es-ES" : "en-US",
                { day: "numeric", month: "short" },
              )}
            </span>
          )}
        </div>
      )}

      {/* Remove button — desktop hover only; first click asks to confirm */}
      {showRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!confirmingRemove) {
              setConfirmingRemove(true);
              return;
            }
            onRemove(item.id);
          }}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            background: confirmingRemove
              ? "var(--color-danger)"
              : "rgba(0,0,0,0.75)",
            border: "none",
            borderRadius: 999,
            minWidth: 28,
            height: 28,
            padding: confirmingRemove ? "0 10px" : 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            cursor: "pointer",
            color: confirmingRemove ? "#fff" : "var(--color-danger)",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
          }}
          title={t(language, "watchlist.removeFromWatchlist")}
          aria-label={t(language, "watchlist.removeFromWatchlist")}
        >
          <X size={14} strokeWidth={2.5} aria-hidden="true" />
          {confirmingRemove && t(language, "watchlist.confirmRemove")}
        </button>
      )}
    </div>

      {/* Title + meta under the poster, same as the library cards. Posters
          alone made titles unreadable when the artwork has no text or is
          in another language. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, padding: "0 2px" }}>
        <span
          title={displayTitle}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayTitle}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {[
            item.year,
            item.tmdb_type === "tv"
              ? t(language, "watchlist.typeTv")
              : t(language, "watchlist.movie"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    </div>
  );
}
