import { useState } from "react";
import { Check, X } from "lucide-react";
import type { WatchlistItem } from "./types";
import { AppLanguage } from "../../utils/mediaLanguage";
import { useIsMobile } from "../../hooks/useIsMobile";

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
  const isMobile = useIsMobile();

  // Hide the per-card remove button while in select mode — bulk actions
  // happen via the toolbar.
  const showRemove = !selecting && (isMobile || hovered);

  const poster = item.poster
    ? item.poster.startsWith("http")
      ? item.poster
      : `${TMDB_IMG}${item.poster}`
    : null;

  const displayTitle =
    language === "es" ? item.title : (item.title_en ?? item.title);

  const nextEpSoon =
    item.next_episode_date && new Date(item.next_episode_date) > new Date();

  const activeBorder = checked
    ? "var(--color-primary)"
    : hovered
      ? "var(--color-primary)"
      : "var(--color-border)";

  return (
    <div
      onClick={() => {
        if (selecting) {
          onToggleCheck?.(item.id);
        } else {
          onOpen(item);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        cursor: "pointer",
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
            fontSize: 12,
            padding: 8,
            textAlign: "center",
          }}
        >
          {displayTitle}
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
            color:
              item.library_status === "available"
                ? "#fff"
                : "var(--color-text-muted)",
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
            {item.library_count} {item.tmdb_type === "tv" ? "ep" : "files"}
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
              ↓
            </span>
          )}
          {nextEpSoon && (
            <span
              title={new Date(item.next_episode_date!).toLocaleDateString()}
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
              {new Date(item.next_episode_date!).toLocaleDateString(
                language === "es" ? "es-ES" : "en-US",
                { day: "numeric", month: "short" },
              )}
            </span>
          )}
        </div>
      )}

      {/* Remove button — always visible on mobile, hover-only on desktop */}
      {showRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            background: isMobile ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.75)",
            border: "none",
            borderRadius: "50%",
            width: isMobile ? 24 : 28,
            height: isMobile ? 24 : 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--color-danger)",
            padding: 0,
          }}
          title="Quitar del watchlist"
        >
          <X size={isMobile ? 12 : 14} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
