import { hdrLabel, isPremiumHdr, parseHdr } from "../utils/techTags";
import { memo, useState } from "react";
import { Check, Clapperboard, Download, Tv2 } from "lucide-react";
import { MediaItem } from "../hooks/useIndexing";
import type { DownloadItem } from "../hooks/useDownloads";
import DownloadRing from "./DownloadRing";
import { PlexIcon, EmbyIcon } from "./ServerIcons";
import {
  AppLanguage,
  getLocalizedPosterPath,
  getLocalizedTitle,
} from "../utils/mediaLanguage";
import { formatBytes, formatQuality } from "../lib/format";
import {
  formatRating,
  ratingLabel,
  resolveRating,
  useRatingOrder,
} from "../lib/ratingSource";
import RatingSourceLogo from "./RatingSourceLogo";
import WatchlistButton from "../features/watchlist/WatchlistButton";
import type { AddWatchlistParams } from "../features/watchlist/types";

interface Props {
  item: MediaItem;
  language: AppLanguage;
  badges?: {
    downloaded?: boolean;
    inEmby?: boolean;
    plexInLibrary?: boolean;
    embyInLibrary?: boolean;
  };
  downloadItem?: DownloadItem;
  hideEpisodeBadge?: boolean;
  showFileSize?: boolean;
  onDownload: (item: MediaItem) => void;
  onSelect?: (item: MediaItem) => void;
  watchlistedTmdbIds?: Set<number>;
  onAddToWatchlist?: (params: AddWatchlistParams) => Promise<void>;
  onOpenWatchlist?: () => void;
  /**
   * When true, suppress the hover "Download" overlay. The card represents a
   * grouped title (multiple file versions); downloading from the poster is
   * ambiguous — versions are selected in the detail page instead.
   */
  disableQuickAction?: boolean;
  /**
   * True while the grid is in multi-select mode. Hides the hover download
   * button (a click must toggle the selection, never queue a download) and
   * shifts the S/E badge right so the selection checkbox doesn't cover it.
   */
  selectionMode?: boolean;
}

const RELEASE_TYPE_COLORS: Record<string, string> = {
  BDREMUX: "#065f46",
  BluRay: "#064e3b",
  "WEB-DL": "#1e3a5f",
  WEBRip: "#1e3a5f",
  HDTV: "#3b1f6e",
  BDRip: "#3b3b00",
  DVDRip: "#4b1515",
  CAM: "#7f1d1d",
};

type BadgeTone = "neutral" | "success" | "info" | "violet" | "release";

function badgeSurface(
  tone: BadgeTone,
  releaseColor?: string,
  options?: { compact?: boolean; shadow?: boolean; iconOnly?: boolean },
): React.CSSProperties {
  const background = {
    neutral: "color-mix(in srgb, black 78%, transparent)",
    success: "color-mix(in srgb, var(--color-success) 72%, black 12%)",
    info: "color-mix(in srgb, var(--color-info) 72%, black 12%)",
    violet: "color-mix(in srgb, #7c3aed 74%, black 10%)",
    release: releaseColor ?? "color-mix(in srgb, #1e293b 80%, black 10%)",
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: options?.compact ? 18 : 22,
    minWidth: options?.iconOnly ? (options?.compact ? 18 : 22) : undefined,
    padding: options?.iconOnly
      ? 0
      : options?.compact
        ? "0.12rem 0.38rem"
        : "0.16rem 0.48rem",
    borderRadius: 999,
    border: "1px solid color-mix(in srgb, white 16%, transparent)",
    background,
    color: "#fff",
    boxShadow:
      options?.shadow === false
        ? "none"
        : "0 2px 8px color-mix(in srgb, black 40%, transparent)",
    fontSize: options?.compact ? "0.56rem" : "0.62rem",
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: "0.07em",
    // No forced uppercase: quality labels keep their canonical spelling
    // ("WEB-DL · 1080p", "WEBRip"), same as filters and detail pages.
    textTransform: "none",
    whiteSpace: "nowrap",
  };
}

function OverlayBadge({
  children,
  tone = "neutral",
  releaseColor,
  iconOnly = false,
  style,
  title,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  releaseColor?: string;
  iconOnly?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        ...badgeSurface(tone, releaseColor, { iconOnly }),
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function MediaCard({
  item,
  language,
  badges,
  downloadItem,
  hideEpisodeBadge = false,
  selectionMode = false,
  showFileSize = false,
  onDownload,
  onSelect,
  watchlistedTmdbIds,
  onAddToWatchlist,
  onOpenWatchlist,
  disableQuickAction = false,
}: Props) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const ratingOrder = useRatingOrder();
  const isTV =
    item.tmdb_type === "tv" ||
    item.media_type === "tv" ||
    item.media_type === "documentary";
  const posterPath = getLocalizedPosterPath(item, language);
  const episodeCode =
    item.season != null
      ? `${language === "es" ? "T" : "S"}${String(item.season).padStart(2, "0")}${item.episode != null ? `E${String(item.episode).padStart(2, "0")}` : ""}${item.episode_end != null && item.episode_end !== item.episode ? `-E${String(item.episode_end).padStart(2, "0")}` : ""}`
      : "";
  const poster = posterPath
    ? `https://image.tmdb.org/t/p/w185${posterPath}`
    : null;
  const title = getLocalizedTitle(item, language);
  const year = item.year;
  const hasMetadata = !!item.tmdb_id;
  const inPlex = badges?.plexInLibrary === true;
  const inEmby = badges?.embyInLibrary === true;
  const hasCombinedLibraryFlag = badges?.inEmby === true;
  const showLibraryFallback = hasCombinedLibraryFlag && !inPlex && !inEmby;

  const langs =
    item.languages
      ?.split(",")
      .map((l) => l.trim())
      .filter(Boolean) ?? [];

  return (
    <div
      className="media-card"
      onClick={() => onSelect?.(item)}
      style={{
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        opacity: hasMetadata ? 1 : 0.7,
      }}
    >
      {/* Poster */}
      <div
        className="media-card-poster"
        style={{
          position: "relative",
          aspectRatio: "2 / 3",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          background: "var(--color-surface-2)",
          border:
            "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
          transition: "border-color 0.18s ease, box-shadow 0.18s ease",
        }}
      >
        {/* Shimmer while loading */}
        {!imgLoaded && (
          <div
            className="poster-shimmer"
            style={{ position: "absolute", inset: 0 }}
          />
        )}

        {poster ? (
          <img
            className={`media-card-img ${imgLoaded ? "loaded" : ""}`}
            src={poster}
            alt={title}
            decoding="async"
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: imgLoaded ? 1 : 0,
              transition: "opacity 0.3s ease, transform 0.2s ease",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
              color: "var(--color-text-muted)",
            }}
          >
            {isTV ? (
              <Tv2
                size={36}
                strokeWidth={1.9}
                aria-hidden="true"
                style={{ display: "block" }}
              />
            ) : (
              <Clapperboard
                size={36}
                strokeWidth={1.9}
                aria-hidden="true"
                style={{ display: "block" }}
              />
            )}
          </div>
        )}

        {/* Bottom gradient for badges */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "50%",
            background:
              "linear-gradient(to top, color-mix(in srgb, black 72%, transparent), transparent)",
            pointerEvents: "none",
          }}
        />

        {/* S/E badge top-left — "T01E05" in Spanish, same as the show page */}
        {!hideEpisodeBadge && item.season != null && (
          <div
            style={{
              position: "absolute",
              top: selectionMode ? "0.55rem" : "0.4rem",
              left: selectionMode ? "calc(0.4rem + 36px)" : "0.4rem",
              zIndex: 4,
              maxWidth: selectionMode
                ? "calc(100% - 3.4rem - 36px)"
                : "calc(100% - 3.4rem)",
            }}
          >
            <OverlayBadge
              title={episodeCode}
            >
              {episodeCode}
            </OverlayBadge>
          </div>
        )}

        {(badges?.downloaded || inPlex || inEmby || showLibraryFallback) && (
          <div
            style={{
              position: "absolute",
              top: "0.4rem",
              right: "0.4rem",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "flex-end",
              zIndex: 4,
              maxWidth: "calc(40% - 0.4rem)",
            }}
          >
            {badges.downloaded && (
              <OverlayBadge tone="success" iconOnly>
                <Check
                  size={12}
                  strokeWidth={2.8}
                  aria-hidden="true"
                  style={{ display: "block" }}
                />
              </OverlayBadge>
            )}
            {inPlex && (
              <OverlayBadge
                tone="info"
                title={language === "es" ? "En Plex" : "In Plex"}
                iconOnly
                style={{ background: "#282a2d", borderColor: "#282a2d" }}
              >
                <PlexIcon size={13} />
              </OverlayBadge>
            )}
            {inEmby && (
              <OverlayBadge tone="neutral" title={language === "es" ? "En Emby" : "In Emby"} iconOnly>
                <EmbyIcon size={13} />
              </OverlayBadge>
            )}
            {showLibraryFallback && (
              <OverlayBadge tone="info" title={language === "es" ? "En la biblioteca" : "In Library"} iconOnly>
                <Check
                  size={11}
                  strokeWidth={2.8}
                  aria-hidden="true"
                  style={{ display: "block" }}
                />
              </OverlayBadge>
            )}
          </div>
        )}

        {/* Watchlist button — top-right when no other badges */}
        {item.tmdb_id != null &&
          watchlistedTmdbIds !== undefined &&
          onAddToWatchlist !== undefined && (
            <div
              style={{
                position: "absolute",
                top: "0.4rem",
                right: "0.4rem",
                zIndex: 5,
              }}
            >
              <WatchlistButton
                tmdbId={item.tmdb_id}
                tmdbType={
                  item.tmdb_type === "tv" || item.media_type === "tv"
                    ? "tv"
                    : "movie"
                }
                title={item.tmdb_title ?? item.title ?? item.filename}
                titleEn={item.tmdb_title ?? undefined}
                poster={item.tmdb_poster ?? undefined}
                year={item.year ?? undefined}
                language={language}
                watchlistedTmdbIds={watchlistedTmdbIds}
                onAdd={onAddToWatchlist}
                onNavigateToWatchlist={onOpenWatchlist}
              />
            </div>
          )}

        {/* Bottom row: quality chip on the left ("WEB-DL · 1080p", halves
            badge count on most cards; language drops into the info row) and
            the premium HDR badge on the right. They share one flex row so a
            long chip ellipsises instead of sliding under "HDR10+".
            Only HDR10+ and Dolby Vision get a badge — plain HDR/HDR10 is the
            default for modern releases. DV releases almost always carry an
            HDR10 layer too ("DV+HDR10"); those used to get no badge at all
            because only the bare "DV" value matched. */}
        {(item.release_type ||
          item.resolution ||
          (item.hdr && isPremiumHdr(item.hdr))) && (
          <div
            style={{
              position: "absolute",
              bottom: "0.4rem",
              left: "0.4rem",
              right: "0.4rem",
              zIndex: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 4,
            }}
          >
            <div style={{ minWidth: 0, display: "flex" }}>
              {(item.release_type || item.resolution) && (
                <OverlayBadge
                  tone={item.release_type ? "release" : "neutral"}
                  releaseColor={
                    item.release_type
                      ? RELEASE_TYPE_COLORS[item.release_type] || "#1e293b"
                      : undefined
                  }
                  title={formatQuality(item.release_type, item.resolution)}
                >
                  {formatQuality(item.release_type, item.resolution)}
                </OverlayBadge>
              )}
            </div>
            {item.hdr && isPremiumHdr(item.hdr) && (
              <div style={{ flexShrink: 0, display: "flex" }}>
                <OverlayBadge tone="violet" title={hdrLabel(item.hdr)}>
                  {parseHdr(item.hdr).dv ? "DV" : "HDR10+"}
                </OverlayBadge>
              </div>
            )}
          </div>
        )}

        {/* Hover quick-action: download button. Suppressed in grouped views
            (movies grouped, TV grouped) where the poster represents multiple
            file versions and a single-click download is ambiguous. */}
        {!disableQuickAction &&
          !selectionMode &&
          onDownload &&
          !badges?.downloaded &&
          (!downloadItem ||
            downloadItem.status === "error" ||
            downloadItem.status === "cancelled") && (
            <button
              type="button"
              className="media-card-quick-action"
              aria-label={language === "es" ? "Descargar" : "Download"}
              title={language === "es" ? "Descargar" : "Download"}
              onClick={(e) => {
                e.stopPropagation();
                onDownload(item);
              }}
            >
              <Download size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}

        {/* Download ring overlay */}
        <DownloadRing downloadItem={downloadItem} />
      </div>

      {/* Card info */}
      <div
        style={{
          padding: "0 0.1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.15rem",
        }}
      >
        <div
          style={{
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "var(--color-text)",
            lineHeight: 1.3,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
          title={title}
        >
          {title}
        </div>
        {/* Meta row — fixed-height single line that truncates with an
            ellipsis instead of wrapping awkwardly mid-value. Show the most
            important facts first (year, rating, size), then language. Each
            value is nowrap so individual chunks like "17.88 GB" never break
            across lines. Hover title gives the full content. */}
        {(() => {
          const resolved = resolveRating(item, ratingOrder);
          const ratingChip =
            resolved && resolved.value > 0
              ? {
                  text: `${ratingLabel[resolved.source]} ${formatRating(resolved.value)}`,
                  node: (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        verticalAlign: "-1px",
                      }}
                    >
                      <RatingSourceLogo
                        source={resolved.source}
                        height={12}
                        title={ratingLabel[resolved.source]}
                      />
                      <span style={{ fontWeight: 600 }}>
                        {formatRating(resolved.value)}
                      </span>
                    </span>
                  ),
                }
              : null;

          const parts: Array<{ text: string; node: React.ReactNode }> = [];
          if (year) parts.push({ text: String(year), node: String(year) });
          if (ratingChip) parts.push(ratingChip);
          if (showFileSize && item.size_bytes != null && item.size_bytes > 0) {
            const text = formatBytes(item.size_bytes);
            parts.push({ text, node: text });
          }
          if (langs.length > 0) {
            const text = langs.map((l) => l.toUpperCase()).join("/");
            parts.push({ text, node: text });
          }
          if (parts.length === 0) return null;
          return (
            <div
              title={parts.map((p) => p.text).join(" · ")}
              style={{
                fontSize: "0.7rem",
                color: "var(--color-text-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.4,
                minHeight: "1em",
              }}
            >
              {parts.map((p, i) => (
                <span key={i}>
                  {i > 0 && (
                    <span style={{ opacity: 0.4, margin: "0 0.35rem" }}>·</span>
                  )}
                  {p.node}
                </span>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default memo(MediaCard);
