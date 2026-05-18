import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  Download,
  ExternalLink,
  Film,
  Folder,
  Pencil,
  RefreshCw,
  Star,
} from "lucide-react";
import { isTauri } from "../lib/transport";
import { useIsMobile } from "../hooks/useIsMobile";
import { PlexIcon, EmbyIcon } from "./ServerIcons";
import type { DownloadItem } from "../hooks/useDownloads";
import type { MediaItem } from "../hooks/useIndexing";
import FixMatchModal from "./FixMatchModal";
import {
  AppLanguage,
  getLocalizedOverview,
  getLocalizedPosterPath,
  getLocalizedTitle,
} from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import { GENRE_MAP } from "../utils/genres";
import { formatBytes } from "../lib/format";
import WatchlistButton from "../features/watchlist/WatchlistButton";
import type { AddWatchlistParams } from "../features/watchlist/types";

const TMDB_POSTER_W500 = "https://image.tmdb.org/t/p/w500";
const TMDB_POSTER_W342 = "https://image.tmdb.org/t/p/w342";

interface Props {
  item: MediaItem;
  language: AppLanguage;
  relatedItems?: MediaItem[];
  groupedView?: boolean;
  onClose: () => void;
  onOpenItem?: (item: MediaItem) => void;
  onUpdated?: (id: number, patch: Partial<MediaItem>) => void;
  downloadItem?: DownloadItem;
  downloadMap: Map<string, DownloadItem>;
  downloadedBadgeMap: Record<
    number,
    {
      downloaded?: boolean;
      inEmby?: boolean;
      plexInLibrary?: boolean;
      embyInLibrary?: boolean;
      cache?: string;
      debug?: string;
    }
  >;
  isDownloaded?: boolean;
  onDownload: (item: MediaItem) => Promise<number>;
  isDownloadPending: (ftpPath: string) => boolean;
  onRetry?: (id: number) => void;
  watchlistedTmdbIds?: Set<number>;
  onAddToWatchlist?: (params: AddWatchlistParams) => Promise<void>;
  onOpenWatchlist?: () => void;
  /** Section name shown in the breadcrumb ("Movies", "Documentaries", etc). */
  sectionLabel?: string;
}

/**
 * Full-content-area detail page for a movie / single file entry.
 *
 * Replaces the older 1,103-line `DetailPanel` slide-in. Designed as a
 * "destination view" — sidebar stays visible, library context preserved via a
 * Back button, hero image as the visual anchor, primary actions always above
 * the fold.
 */
export default function DetailPage({
  item,
  language,
  relatedItems = [],
  groupedView = false,
  onClose,
  onOpenItem,
  onUpdated,
  downloadItem,
  downloadMap,
  downloadedBadgeMap,
  isDownloaded = false,
  onDownload,
  isDownloadPending,
  onRetry,
  watchlistedTmdbIds,
  onAddToWatchlist,
  onOpenWatchlist,
  sectionLabel,
}: Props) {
  const [showFix, setShowFix] = useState(false);
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const title = getLocalizedTitle(item, language);
  const overview = getLocalizedOverview(item, language);
  const posterPath = getLocalizedPosterPath(item, language);
  const rating = item.tmdb_rating ? item.tmdb_rating.toFixed(1) : null;
  const poster = posterPath ? `${TMDB_POSTER_W500}${posterPath}` : null;
  const posterSmall = posterPath ? `${TMDB_POSTER_W342}${posterPath}` : null;

  const relatedVersions = useMemo(
    () =>
      groupedView
        ? relatedItems
        : relatedItems.filter((v) => v.id !== item.id),
    [groupedView, relatedItems, item.id],
  );

  const genres = useMemo(() => {
    const raw = item.tmdb_genres;
    if (!raw) return [];
    const ids: number[] = typeof raw === "string" ? JSON.parse(raw) : raw;
    return ids
      .map((id) => GENRE_MAP[id])
      .filter((key): key is string => Boolean(key))
      .map((key) => t(language, key as never));
  }, [item.tmdb_genres, language]);

  const langs =
    item.languages
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const releaseYear = item.year ?? null;
  const releaseDate = item.tmdb_release_date ?? null;

  const tmdbUrl = item.tmdb_id
    ? `https://www.themoviedb.org/${item.tmdb_type === "tv" ? "tv" : "movie"}/${item.tmdb_id}`
    : null;
  const imdbUrl = item.imdb_id
    ? `https://www.imdb.com/title/${item.imdb_id}/`
    : null;

  const handleOpenUrl = (url: string) => {
    setOpeningUrl(url);
    if (isTauri()) {
      import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(url))
        .catch((e) => console.error("[openUrl] failed", url, e))
        .finally(() => setTimeout(() => setOpeningUrl(null), 1600));
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => setOpeningUrl(null), 1600);
    }
  };

  // ─── Download button state for the primary CTA ───────────────────────
  const itemIsPending = isDownloadPending(item.ftp_path);
  const itemIsActive =
    itemIsPending ||
    downloadItem?.status === "queued" ||
    downloadItem?.status === "downloading";
  const itemIsDone =
    isDownloaded || downloadItem?.status === "done";
  const downloadError = downloadItem?.status === "error";

  const downloadLabel = itemIsDone
    ? t(language, "detail.alreadyDownloaded")
    : downloadError
      ? t(language, "downloads.retry" as never) || "Retry"
      : downloadItem?.status === "downloading"
        ? t(language, "downloads.downloading")
        : itemIsActive
          ? t(language, "downloads.queued")
          : t(language, "detail.download");

  const downloadButtonDisabled =
    (itemIsActive && !downloadError) || itemIsDone;

  const handlePrimaryDownload = () => {
    if (downloadError && downloadItem && onRetry) {
      onRetry(downloadItem.id);
      return;
    }
    void onDownload(item);
  };

  // ─── Library presence indicators ─────────────────────────────────────
  const badges = downloadedBadgeMap[item.id];
  const inPlex = badges?.plexInLibrary === true;
  const inEmby = badges?.embyInLibrary === true;
  const inLibraryFallback =
    badges?.inEmby === true && !inPlex && !inEmby;

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        overscrollBehavior: "contain",
        background: "var(--color-bg)",
        animation: "detail-page-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Atmospheric blurred poster background — uses a real <img> so we
          can hook into onLoad and fade in instead of popping in once the
          browser finishes fetching the CSS background. */}
      {poster && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 460,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <img
            src={poster}
            alt=""
            decoding="async"
            loading="eager"
            onLoad={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.35";
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center top",
              filter: "blur(40px) saturate(140%)",
              transform: "scale(1.15)",
              opacity: 0,
              transition: "opacity 0.45s ease-out",
            }}
          />
        </div>
      )}
      {/* Gradient fade so content remains readable */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 460,
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 30%, transparent) 0%, color-mix(in srgb, var(--color-bg) 80%, transparent) 60%, var(--color-bg) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Sticky top action bar — opaque bg, no backdrop-filter. A sticky
          blur over a scrolling page is one of the most expensive things
          you can do on iOS Safari (recomputes blur per paint frame). */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 24px",
          background: "var(--color-bg)",
          borderBottom:
            "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t(language, "common.cancel")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px 6px 10px",
            borderRadius: 999,
            border:
              "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
            background:
              "color-mix(in srgb, var(--color-surface) 85%, transparent)",
            color: "var(--color-text)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>{language === "es" ? "Atrás" : "Back"}</span>
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "var(--color-text-muted)",
            fontSize: 12.5,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {sectionLabel && (
            <>
              <span style={{ whiteSpace: "nowrap" }}>{sectionLabel}</span>
              <span style={{ opacity: 0.5 }}>/</span>
            </>
          )}
          <span
            title={title}
            style={{
              color: "var(--color-text)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {title}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => setShowFix(true)}
          title={t(language, "detail.fixMatch")}
          style={iconChip}
        >
          <Pencil size={13} strokeWidth={2.2} aria-hidden="true" />
          <span>{t(language, "detail.fixMatch")}</span>
        </button>
      </div>

      {/* Hero */}
      <div
        style={{
          position: "relative",
          padding: isMobile ? "20px 18px 18px" : "32px 40px 28px",
          display: "grid",
          // Single column on mobile — the side-by-side layout squeezes the
          // title to 2-3 narrow lines and forces meta items into a vertical
          // sliver on phones.
          gridTemplateColumns: isMobile
            ? "1fr"
            : "minmax(180px, 240px) minmax(0, 1fr)",
          gap: isMobile ? 18 : 32,
          alignItems: isMobile ? "stretch" : "flex-end",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        {/* Poster */}
        <div
          style={{
            aspectRatio: "2 / 3",
            borderRadius: 14,
            overflow: "hidden",
            background: "var(--color-surface-2)",
            border:
              "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
            boxShadow: "0 24px 48px color-mix(in srgb, black 50%, transparent)",
            // On mobile keep the poster around 180px wide and centered so it
            // doesn't take the full viewport width when the hero collapses
            // to a single column.
            width: isMobile ? 180 : undefined,
            maxWidth: "100%",
            margin: isMobile ? "0 auto" : undefined,
          }}
        >
          {posterSmall ? (
            <img
              src={posterSmall}
              alt={title}
              loading="eager"
              decoding="async"
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
                color: "var(--color-text-muted)",
              }}
            >
              <Film size={48} strokeWidth={1.6} aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Hero text + primary actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(28px, 3.6vw, 44px)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                color: "var(--color-text)",
              }}
            >
              {title}
            </h1>
            {item.tmdb_title && item.tmdb_title !== title && (
              <div
                style={{
                  marginTop: 4,
                  color: "var(--color-text-muted)",
                  fontSize: 14,
                  fontStyle: "italic",
                }}
              >
                {item.tmdb_title}
              </div>
            )}
          </div>

          {/* Meta row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              color: "var(--color-text-muted)",
              fontSize: 13.5,
            }}
          >
            {releaseYear && (
              <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
                {releaseYear}
              </span>
            )}
            {releaseDate && releaseDate !== `${releaseYear}-01-01` && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span title={releaseDate}>
                  <Clock
                    size={12}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    style={{ marginRight: 4, verticalAlign: "-1px" }}
                  />
                  {releaseDate}
                </span>
              </>
            )}
            {rating && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "var(--color-warning)",
                    fontWeight: 700,
                  }}
                >
                  <Star
                    size={13}
                    strokeWidth={2.2}
                    fill="currentColor"
                    aria-hidden="true"
                  />
                  {rating}
                </span>
              </>
            )}
            {item.resolution && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{item.resolution}</span>
              </>
            )}
            {item.release_type && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{item.release_type}</span>
              </>
            )}
            {item.hdr && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: "#a78bfa", fontWeight: 700 }}>
                  {item.hdr === "DV" ? "Dolby Vision" : item.hdr}
                </span>
              </>
            )}
            {item.size_bytes != null && item.size_bytes > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{formatBytes(item.size_bytes)}</span>
              </>
            )}
          </div>

          {/* Genres */}
          {genres.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {genres.map((g) => (
                <span
                  key={g}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    borderRadius: 999,
                    background:
                      "color-mix(in srgb, var(--color-surface-2) 80%, transparent)",
                    border:
                      "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
                    color: "var(--color-text-muted)",
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Primary action bar */}
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: 4,
              color: "var(--color-text-muted)",
              fontSize: 13,
            }}
          >
            {/* Hero download CTA only renders when this is a single-file
                view. In grouped mode (multiple versions exist) it's
                ambiguous which version to download — the user picks one
                from "Versiones disponibles" below. Matches the TV show
                detail behavior. */}
            {!groupedView && (
              <button
                type="button"
                onClick={handlePrimaryDownload}
                disabled={downloadButtonDisabled}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "11px 22px",
                  borderRadius: 999,
                  border: "none",
                  background: itemIsDone
                    ? "color-mix(in srgb, var(--color-success) 22%, var(--color-surface) 78%)"
                    : downloadError
                      ? "var(--color-warning)"
                      : "var(--color-primary)",
                  color: itemIsDone
                    ? "var(--color-success)"
                    : downloadError
                      ? "#fff"
                      : "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: downloadButtonDisabled ? "default" : "pointer",
                  opacity: downloadButtonDisabled ? 0.85 : 1,
                  boxShadow: itemIsDone
                    ? "none"
                    : "0 6px 18px color-mix(in srgb, var(--color-primary) 40%, transparent)",
                }}
              >
                {itemIsDone ? (
                  <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                ) : downloadError ? (
                  <RefreshCw size={16} strokeWidth={2.4} aria-hidden="true" />
                ) : (
                  <Download size={16} strokeWidth={2.4} aria-hidden="true" />
                )}
                <span>{downloadLabel}</span>
              </button>
            )}

            {item.tmdb_id != null && watchlistedTmdbIds && onAddToWatchlist && (
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
            )}

            {/* Library presence chips */}
            {(inPlex || inEmby || inLibraryFallback) && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background:
                    "color-mix(in srgb, var(--color-info) 14%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--color-info) 32%, transparent)",
                  color: "var(--color-info)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
                title={
                  inPlex
                    ? "Available in Plex"
                    : inEmby
                      ? "Available in Emby"
                      : "Available in library"
                }
              >
                {inPlex && <PlexIcon size={13} />}
                {inEmby && <EmbyIcon size={13} />}
                {inLibraryFallback && (
                  <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                )}
                <span>{language === "es" ? "En biblioteca" : "In library"}</span>
              </div>
            )}

            {groupedView && (
              <span style={{ opacity: 0.75 }}>
                {language === "es"
                  ? "Elige una versión más abajo para descargar."
                  : "Pick a version below to download."}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content body — single column on mobile (drops the side rail of
          quality specs below the main content so nothing gets squeezed). */}
      <div
        style={{
          // Bottom padding includes safe-area + space for the mobile bottom
          // tab bar (~64px) so the last content block isn't hidden under it.
          padding: isMobile
            ? "12px 18px calc(80px + env(safe-area-inset-bottom, 0px))"
            : "12px 40px 60px",
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "minmax(0, 2fr) minmax(280px, 1fr)",
          gap: isMobile ? 22 : 32,
          alignItems: "flex-start",
        }}
      >
        {/* Main column — `minWidth: 0` is critical: grid items default to
            `min-width: auto` which expands to fit the widest *unbreakable*
            child (e.g. a `whiteSpace: nowrap` filename in a version row),
            which would otherwise stretch the column past the viewport on
            mobile and cut the synopsis text mid-word. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            minWidth: 0,
          }}
        >
          {overview ? (
            <Section title={t(language, "detail.details")}>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: "var(--color-text)",
                  maxWidth: "70ch",
                }}
              >
                {overview}
              </p>
            </Section>
          ) : null}

          {/* Versions (movies with multiple file qualities) */}
          {relatedVersions.length > 0 && (
            <Section
              title={t(language, "detail.availableVersions")}
              subtitle={
                language === "es"
                  ? `${relatedVersions.length + 1} versiones disponibles`
                  : `${relatedVersions.length + 1} versions available`
              }
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <VersionRow
                  version={item}
                  language={language}
                  isCurrent
                  downloadMap={downloadMap}
                  downloadedBadgeMap={downloadedBadgeMap}
                  isDownloadPending={isDownloadPending}
                  onDownload={onDownload}
                  onOpenItem={onOpenItem}
                  groupedView={groupedView}
                />
                {relatedVersions.map((version) => (
                  <VersionRow
                    key={version.id}
                    version={version}
                    language={language}
                    downloadMap={downloadMap}
                    downloadedBadgeMap={downloadedBadgeMap}
                    isDownloadPending={isDownloadPending}
                    onDownload={onDownload}
                    onOpenItem={onOpenItem}
                    groupedView={groupedView}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* File details */}
          <Section title={t(language, "detail.fileInfo")}>
            <div
              style={{
                display: "grid",
                // Stack label-over-value on mobile so long monospace paths
                // get the full row width instead of a 200-ish px column.
                gridTemplateColumns: isMobile ? "1fr" : "120px minmax(0, 1fr)",
                rowGap: isMobile ? 14 : 10,
                columnGap: 14,
                fontSize: 13,
              }}
            >
              <FileRow label={t(language, "detail.filename")}>
                <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                  {item.filename}
                </span>
              </FileRow>
              <FileRow label="Path">
                <span
                  style={{
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {item.ftp_path}
                </span>
              </FileRow>
              {item.release_group && (
                <FileRow label="Group">{item.release_group}</FileRow>
              )}
            </div>
          </Section>
        </div>

        {/* Side column — same minWidth: 0 reasoning as the main column. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            minWidth: 0,
          }}
        >
          <Section title={language === "es" ? "Calidad" : "Quality"}>
            <SpecGrid>
              <Spec label={t(language, "detail.resolution")}>
                {item.resolution || "—"}
              </Spec>
              <Spec label={t(language, "detail.videoCodec")}>
                {item.codec || "—"}
              </Spec>
              <Spec label="HDR">
                {item.hdr ? (item.hdr === "DV" ? "Dolby Vision" : item.hdr) : "—"}
              </Spec>
              <Spec label="Source">{item.release_type || "—"}</Spec>
              <Spec label={t(language, "detail.size")}>
                {item.size_bytes != null && item.size_bytes > 0
                  ? formatBytes(item.size_bytes)
                  : "—"}
              </Spec>
              {langs.length > 0 && (
                <Spec label={language === "es" ? "Idiomas" : "Languages"}>
                  {langs.map((l) => l.toUpperCase()).join(", ")}
                </Spec>
              )}
            </SpecGrid>
          </Section>

          {(tmdbUrl || imdbUrl) && (
            <Section title={t(language, "detail.links")}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tmdbUrl && (
                  <ExternalLinkButton
                    onClick={() => handleOpenUrl(tmdbUrl)}
                    pending={openingUrl === tmdbUrl}
                    label={t(language, "detail.openTmdb")}
                  />
                )}
                {imdbUrl && (
                  <ExternalLinkButton
                    onClick={() => handleOpenUrl(imdbUrl)}
                    pending={openingUrl === imdbUrl}
                    label={t(language, "detail.openImdb")}
                  />
                )}
              </div>
            </Section>
          )}
        </div>
      </div>

      {showFix && (
        <FixMatchModal
          itemIds={[item.id]}
          initialQuery={title}
          initialMediaType={
            item.media_type === "documentary" ? "documentary" : "movie"
          }
          language={language}
          onApply={(_, movie) => {
            onUpdated?.(item.id, {
              tmdb_id: movie.id,
              tmdb_title: movie.title,
              tmdb_title_en: movie.title_en,
              tmdb_poster: movie.poster_path,
              tmdb_poster_en: movie.poster_path_en,
              tmdb_rating: movie.vote_average,
              tmdb_overview: movie.overview,
              tmdb_overview_en: movie.overview_en,
            });
          }}
          onClose={() => setShowFix(false)}
        />
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {subtitle}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function SpecGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function Spec({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "10px 12px",
        borderRadius: 10,
        background:
          "color-mix(in srgb, var(--color-surface) 80%, transparent)",
        border:
          "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text)",
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FileRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          paddingTop: 2,
        }}
      >
        {label}
      </div>
      <div style={{ color: "var(--color-text)" }}>{children}</div>
    </>
  );
}

function ExternalLinkButton({
  onClick,
  pending,
  label,
}: {
  onClick: () => void;
  pending: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 999,
        border:
          "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
        background:
          "color-mix(in srgb, var(--color-surface) 85%, transparent)",
        color: "var(--color-text)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <ExternalLink size={12} strokeWidth={2.2} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function VersionRow({
  version,
  language,
  isCurrent = false,
  downloadMap,
  downloadedBadgeMap,
  isDownloadPending,
  onDownload,
  onOpenItem,
  groupedView,
}: {
  version: MediaItem;
  language: AppLanguage;
  isCurrent?: boolean;
  downloadMap: Map<string, DownloadItem>;
  downloadedBadgeMap: Props["downloadedBadgeMap"];
  isDownloadPending: (ftpPath: string) => boolean;
  onDownload: (item: MediaItem) => Promise<number>;
  onOpenItem?: (item: MediaItem) => void;
  groupedView?: boolean;
}) {
  const dl = downloadMap.get(version.ftp_path);
  const isPending = isDownloadPending(version.ftp_path);
  const isActive =
    isPending || dl?.status === "queued" || dl?.status === "downloading";
  const isDone =
    dl?.status === "done" ||
    downloadedBadgeMap[version.id]?.downloaded === true;

  const qualityPills: string[] = [];
  if (version.resolution) qualityPills.push(version.resolution);
  if (version.hdr) qualityPills.push(version.hdr === "DV" ? "Dolby Vision" : version.hdr);
  if (version.release_type) qualityPills.push(version.release_type);
  if (version.codec) qualityPills.push(version.codec);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px",
        borderRadius: 12,
        border: isCurrent
          ? "1px solid color-mix(in srgb, var(--color-primary) 38%, transparent)"
          : "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
        background: isCurrent
          ? "color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))"
          : "color-mix(in srgb, var(--color-surface) 88%, transparent)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {qualityPills.length > 0 ? (
            qualityPills.map((p) => (
              <span
                key={p}
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "var(--color-text)",
                  background:
                    "color-mix(in srgb, var(--color-surface-2) 80%, transparent)",
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
              >
                {p}
              </span>
            ))
          ) : (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {language === "es" ? "Sin metadatos" : "No metadata"}
            </span>
          )}
          {isCurrent && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--color-primary)",
              }}
            >
              {language === "es" ? "Actual" : "Current"}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--color-text-muted)",
            display: "flex",
            gap: 10,
            // `minWidth: 0` lets the inner span actually truncate. Without
            // it, the flex container expands to fit the filename's natural
            // width and pushes the whole grid column past the viewport.
            minWidth: 0,
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "monospace",
              minWidth: 0,
              flex: "1 1 auto",
            }}
            title={version.filename}
          >
            {version.filename}
          </span>
          {version.size_bytes != null && version.size_bytes > 0 && (
            <span style={{ flexShrink: 0 }}>{formatBytes(version.size_bytes)}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {!isCurrent && groupedView && onOpenItem && (
          <button
            type="button"
            onClick={() => onOpenItem(version)}
            style={chipBtnGhost}
          >
            <Folder size={12} strokeWidth={2.2} aria-hidden="true" />
            {t(language, "detail.viewFileDetails")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void onDownload(version)}
          disabled={isActive || isDone}
          style={{
            ...chipBtnGhost,
            background: isDone
              ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
              : isActive
                ? "color-mix(in srgb, var(--color-warning) 22%, transparent)"
                : "color-mix(in srgb, var(--color-primary) 18%, transparent)",
            color: isDone
              ? "var(--color-success)"
              : isActive
                ? "var(--color-warning)"
                : "var(--color-primary)",
            border: "none",
            cursor: isActive || isDone ? "default" : "pointer",
          }}
        >
          {isDone ? (
            <Check size={12} strokeWidth={2.4} aria-hidden="true" />
          ) : (
            <Download size={12} strokeWidth={2.2} aria-hidden="true" />
          )}
          {isDone
            ? t(language, "detail.alreadyDownloaded")
            : isActive
              ? t(language, "downloads.queued")
              : t(language, "detail.download")}
        </button>
      </div>
    </div>
  );
}

const iconChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  border:
    "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
  background: "color-mix(in srgb, var(--color-surface) 85%, transparent)",
  color: "var(--color-text-muted)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const chipBtnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 999,
  border:
    "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
  background: "color-mix(in srgb, var(--color-surface) 90%, transparent)",
  color: "var(--color-text)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
