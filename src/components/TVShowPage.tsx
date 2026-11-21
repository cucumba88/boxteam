import { audioLabel, hdrLabel, hdrShortLabel, isNotableHdr, isPremiumAudio } from "../utils/techTags";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Folder,
  Pencil,
  Tv2,
} from "lucide-react";
import { isTauri } from "../lib/transport";
import { useIsMobile } from "../hooks/useIsMobile";
import { PlexIcon, EmbyIcon } from "./ServerIcons";
import type { DownloadItem } from "../hooks/useDownloads";
import type { MediaItem } from "../hooks/useIndexing";
import {
  AppLanguage,
  getLocalizedOverview,
  getLocalizedPosterPath,
  getLocalizedTitle,
} from "../utils/mediaLanguage";
import { t } from "../utils/i18n";
import { GENRE_MAP } from "../utils/genres";
import { folderPath, formatBytes } from "../lib/format";
import WatchlistButton from "../features/watchlist/WatchlistButton";
import type { AddWatchlistParams } from "../features/watchlist/types";
import {
  allAvailableRatings,
  formatRating,
  ratingLabel,
  resolveRating,
  useRatingOrder,
} from "../lib/ratingSource";
import RatingSourceLogo from "./RatingSourceLogo";

const TMDB_POSTER_W342 = "https://image.tmdb.org/t/p/w342";

// ─── Filename / path parsing helpers ──────────────────────────────────────
// Mirror the parsers used by the legacy TVShowPanel so episode display is
// identical even when the indexer hasn't populated season/episode fields.

interface ParsedTokens {
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
}

function parseSeasonEpisodeTokens(raw: string): ParsedTokens {
  const text = raw.replace(/[._]/g, " ");
  const se = text.match(
    /\bS(\d{1,3})[\s-]*E(\d{1,3})(?:\s*[-~]\s*E?(\d{1,3})|[\s-]*E(\d{1,3}))?\b/i,
  );
  if (se) {
    let season = Number(se[1]);
    if (season > 0 && season % 100 === 0) season = season / 100;
    return {
      season,
      episode: Number(se[2]),
      episodeEnd:
        se[3] != null ? Number(se[3]) : se[4] != null ? Number(se[4]) : null,
    };
  }
  const x = text.match(/\b(\d{1,2})x(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\b/i);
  if (x) {
    return {
      season: Number(x[1]),
      episode: Number(x[2]),
      episodeEnd: x[3] != null ? Number(x[3]) : null,
    };
  }
  const sOnly = text.match(/\b(?:S|SEASON[\s-]*|TEMPORADA[\s-]*)(\d{1,3})\b/i);
  if (sOnly) {
    let s = Number(sOnly[1]);
    if (s > 0 && s % 100 === 0) s = s / 100;
    const epOnly = text.match(
      /(?:^|\s)(?:E|EP|EPISODE|CAP(?:ITULO)?)[\s-]?(\d{1,3})(?:\s*[-~]\s*(?:E|EP|EPISODE|CAP(?:ITULO)?)?[\s-]?(\d{1,3}))?\b/i,
    );
    if (epOnly) {
      return {
        season: s,
        episode: Number(epOnly[1]),
        episodeEnd: epOnly[2] != null ? Number(epOnly[2]) : null,
      };
    }
    return { season: s, episode: null, episodeEnd: null };
  }
  const epOnly = text.match(
    /(?:^|\s)(?:E|EP|EPISODE|CAP(?:ITULO)?)[\s-]?(\d{1,3})(?:\s*[-~]\s*(?:E|EP|EPISODE|CAP(?:ITULO)?)?[\s-]?(\d{1,3}))?\b/i,
  );
  if (epOnly) {
    return {
      season: null,
      episode: Number(epOnly[1]),
      episodeEnd: epOnly[2] != null ? Number(epOnly[2]) : null,
    };
  }
  return { season: null, episode: null, episodeEnd: null };
}

function resolvedSeason(item: MediaItem): number | null {
  if (item.season != null) return item.season;
  const a = parseSeasonEpisodeTokens(item.filename).season;
  if (a != null) return a;
  return parseSeasonEpisodeTokens(item.ftp_path).season;
}

function resolvedEpisode(item: MediaItem): {
  episode: number | null;
  episodeEnd: number | null;
} {
  if (item.episode != null || item.episode_end != null) {
    return {
      episode: item.episode ?? null,
      episodeEnd: item.episode_end ?? null,
    };
  }
  const a = parseSeasonEpisodeTokens(item.filename);
  if (a.episode != null) return { episode: a.episode, episodeEnd: a.episodeEnd };
  const b = parseSeasonEpisodeTokens(item.ftp_path);
  return { episode: b.episode, episodeEnd: b.episodeEnd };
}

/** Penultimate ftp_path segment — the leaf folder name a file lives in
 *  (e.g. `Season 01 WEB-DL 1080p`). Used only as a human-readable label
 *  fallback; release-group identity is the full directory path (see
 *  `groupEpisodesByRelease`) so mirrored copies don't collapse together. */
function getReleaseFolder(ftpPath: string): string {
  return ftpPath.split("/").slice(-2, -1)[0] ?? "";
}

/** Human-readable label for a release group, built from the quality fields
 *  shared by every episode in the group. Falls back to the folder name. */
function buildReleaseLabel(sample: MediaItem, folder: string): string {
  const parts = [
    sample.resolution,
    sample.release_type,
    sample.codec,
    sample.hdr && isNotableHdr(sample.hdr) ? hdrShortLabel(sample.hdr) : null,
    sample.audio_codec && isPremiumAudio(sample.audio_codec)
      ? audioLabel(sample.audio_codec)
      : null,
  ].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : folder || "Unknown";
}

interface ReleaseGroup {
  folder: string;
  folderPath: string;
  label: string;
  resolution: string | null;
  release_type: string | null;
  codec: string | null;
  hdr: string | null;
  audio: string | null;
  langs: string[];
  episodes: MediaItem[];
  totalBytes: number;
}

/** Rank used to sort release groups within a season — best quality first. */
function qualityRank(g: ReleaseGroup): number {
  const r = (g.resolution ?? "").toUpperCase();
  let res = 0;
  if (r.includes("2160") || r === "4K" || r === "UHD") res = 4;
  else if (r.includes("1080")) res = 3;
  else if (r.includes("720")) res = 2;
  else if (r.includes("480") || r.includes("576")) res = 1;
  const src = (g.release_type ?? "").toUpperCase();
  let srcRank = 0;
  if (src.includes("BDREMUX") || src.includes("REMUX")) srcRank = 4;
  else if (src.includes("BLURAY") || src.includes("BDRIP")) srcRank = 3;
  else if (src.includes("WEB-DL") || src.includes("WEBDL")) srcRank = 2;
  else if (src.includes("WEBRIP") || src.includes("HDTV")) srcRank = 1;
  return res * 10 + srcRank;
}

function groupEpisodesByRelease(episodes: MediaItem[]): ReleaseGroup[] {
  // Group by the FULL directory path, not just the leaf folder name. The same
  // release is often mirrored across several parent directories (e.g. a copy
  // under "Series HD 1080p" and another under "Series Documentales"), all
  // sharing the same leaf name. Keying on the leaf alone collapses those
  // distinct physical copies into one bloated group; keying on the full path
  // keeps each location as its own group so the user can tell them apart.
  const byFolder = new Map<string, MediaItem[]>();
  for (const ep of episodes) {
    const f = folderPath(ep.ftp_path);
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f)!.push(ep);
  }
  const groups: ReleaseGroup[] = [...byFolder.entries()].map(([dirPath, eps]) => {
    eps.sort(
      (a, b) =>
        (resolvedEpisode(a).episode ?? 0) -
        (resolvedEpisode(b).episode ?? 0),
    );
    const sample = eps[0];
    const leaf = getReleaseFolder(sample.ftp_path);
    const langs = Array.from(
      new Set(
        eps.flatMap((e) =>
          (e.languages?.split(",") ?? []).map((l) => l.trim()).filter(Boolean),
        ),
      ),
    );
    const totalBytes = eps.reduce((sum, e) => sum + (e.size_bytes ?? 0), 0);
    return {
      folder: leaf,
      folderPath: dirPath,
      label: buildReleaseLabel(sample, leaf),
      resolution: sample.resolution ?? null,
      release_type: sample.release_type ?? null,
      codec: sample.codec ?? null,
      hdr: sample.hdr ?? null,
      audio: sample.audio_codec ?? null,
      langs,
      episodes: eps,
      totalBytes,
    };
  });
  return groups.sort((a, b) => qualityRank(b) - qualityRank(a));
}

type BadgeMap = Record<
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

interface Props {
  show: MediaItem;
  allEpisodes: MediaItem[];
  language: AppLanguage;
  onClose: () => void;
  onDownload: (item: MediaItem) => void;
  onDownloadSeason: (episodes: MediaItem[]) => void;
  onFixMatch: (items: MediaItem[]) => void;
  watchlistedTmdbIds?: Set<number>;
  onAddToWatchlist?: (params: AddWatchlistParams) => Promise<void>;
  onOpenWatchlist?: () => void;
  downloadMap: Map<string, DownloadItem>;
  isDownloadPending: (ftpPath: string) => boolean;
  downloadedBadgeMap: BadgeMap;
  /** Section label shown in the breadcrumb (e.g. "Series", "Documentaries"). */
  sectionLabel?: string;
}

/**
 * Full content-area page for a TV show or documentary series.
 *
 * Replaces the 2,082-line `TVShowPanel` slide-in. Same shell pattern as
 * `DetailPage`: blurred poster atmosphere → hero with primary actions →
 * sectioned content. Seasons live in a segmented control across the top of
 * the episodes section; selecting one filters the list below.
 */
export default function TVShowPage({
  show,
  allEpisodes,
  language,
  onClose,
  onDownload,
  onDownloadSeason,
  onFixMatch,
  watchlistedTmdbIds,
  onAddToWatchlist,
  onOpenWatchlist,
  downloadMap,
  isDownloadPending,
  downloadedBadgeMap,
  sectionLabel,
}: Props) {
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const showTitle = getLocalizedTitle(show, language);
  const overview = getLocalizedOverview(show, language);
  const posterPath = getLocalizedPosterPath(show, language);
  const poster = posterPath ? `${TMDB_POSTER_W342}${posterPath}` : null;
  const ratingOrder = useRatingOrder();
  const primaryRating = resolveRating(show, ratingOrder);
  const rating = primaryRating ? formatRating(primaryRating.value) : null;
  const secondaryRatings = primaryRating
    ? allAvailableRatings(show, ratingOrder).filter(
        (r) => r.source !== primaryRating.source,
      )
    : [];
  const releaseYear = show.year ?? show.tmdb_release_date?.slice(0, 4) ?? null;

  const genres = useMemo(() => {
    const raw = show.tmdb_genres;
    if (!raw) return [];
    const ids: number[] = typeof raw === "string" ? JSON.parse(raw) : raw;
    return ids
      .map((id) => GENRE_MAP[id])
      .filter((key): key is string => Boolean(key))
      .map((key) => t(language, key as never));
  }, [show.tmdb_genres, language]);

  // Group episodes by season once. Sorted ascending; unknown seasons in -1.
  const seasonMap = useMemo(() => {
    const m = new Map<number, MediaItem[]>();
    for (const ep of allEpisodes) {
      const season = resolvedSeason(ep) ?? -1;
      if (!m.has(season)) m.set(season, []);
      m.get(season)!.push(ep);
    }
    for (const [, eps] of m) {
      eps.sort(
        (a, b) =>
          (resolvedEpisode(a).episode ?? 0) -
          (resolvedEpisode(b).episode ?? 0),
      );
    }
    return new Map(
      [...m.entries()].sort(([a], [b]) => {
        if (a === -1) return 1;
        if (b === -1) return -1;
        return a - b;
      }),
    );
  }, [allEpisodes]);

  const seasonKeys = [...seasonMap.keys()];
  const totalEpisodes = allEpisodes.length;
  const totalSeasons = seasonKeys.filter((s) => s !== -1).length;

  type ActiveSeason = "all" | number;
  const [activeSeason, setActiveSeason] = useState<ActiveSeason>(() =>
    seasonKeys.length === 1 ? seasonKeys[0] : "all",
  );

  // Recompute default if the show changes underneath us.
  useEffect(() => {
    setActiveSeason(seasonKeys.length === 1 ? seasonKeys[0] : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id]);

  /**
   * Sections to render under "Episodes". When a single season is active, one
   * section per release-group (sorted best-quality first). When "All" is
   * active, sections are stacked per season — each contains its own release
   * groups so the user can pick "S01 in 1080p WEB-DL" or "S02 in 4K BDREMUX"
   * etc. without mixing qualities into one list.
   */
  type RenderSection = {
    seasonKey: number | "ALL";
    seasonLabel: string;
    groups: ReleaseGroup[];
  };
  const renderSections: RenderSection[] = useMemo(() => {
    const seasonLabel = (s: number) =>
      s === -1
        ? language === "es"
          ? "Sin temporada"
          : "Unknown"
        : language === "es"
          ? `Temporada ${String(s).padStart(2, "0")}`
          : `Season ${String(s).padStart(2, "0")}`;

    if (activeSeason !== "all") {
      const eps = seasonMap.get(activeSeason) ?? [];
      return [
        {
          seasonKey: activeSeason,
          seasonLabel: seasonLabel(activeSeason),
          groups: groupEpisodesByRelease(eps),
        },
      ];
    }
    return [...seasonMap.entries()].map(([s, eps]) => ({
      seasonKey: s,
      seasonLabel: seasonLabel(s),
      groups: groupEpisodesByRelease(eps),
    }));
  }, [activeSeason, seasonMap, language]);

  /** Filter helper used by the per-group "Download" button to only enqueue
   *  episodes that aren't already done or in flight. */
  const filterDownloadable = (eps: MediaItem[]) =>
    eps.filter((ep) => {
      const dl = downloadMap.get(ep.ftp_path);
      const active =
        isDownloadPending(ep.ftp_path) ||
        dl?.status === "queued" ||
        dl?.status === "downloading";
      const done =
        dl?.status === "done" ||
        downloadedBadgeMap[ep.id]?.downloaded === true;
      return !active && !done;
    });

  const tmdbUrl = show.tmdb_id
    ? `https://www.themoviedb.org/${show.tmdb_type === "movie" ? "movie" : "tv"}/${show.tmdb_id}`
    : null;
  const imdbUrl = show.imdb_id
    ? `https://www.imdb.com/title/${show.imdb_id}/`
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

      {/* Sticky back bar — opaque bg, no backdrop-filter (iOS Safari
          recomputes blur on every paint frame when the filter is on a
          sticky element atop a scrolling page). */}
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
          aria-label="Back"
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
            title={showTitle}
            style={{
              color: "var(--color-text)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {showTitle}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => onFixMatch(allEpisodes)}
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
          // Single column on mobile so title + meta + genres get full width.
          gridTemplateColumns: isMobile
            ? "1fr"
            : "minmax(180px, 240px) minmax(0, 1fr)",
          gap: isMobile ? 18 : 32,
          alignItems: isMobile ? "stretch" : "flex-end",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            aspectRatio: "2 / 3",
            borderRadius: 14,
            overflow: "hidden",
            background: "var(--color-surface-2)",
            border:
              "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
            boxShadow: "0 24px 48px color-mix(in srgb, black 50%, transparent)",
            width: isMobile ? 180 : undefined,
            maxWidth: "100%",
            margin: isMobile ? "0 auto" : undefined,
          }}
        >
          {poster ? (
            <img
              src={poster}
              alt={showTitle}
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
              <Tv2 size={48} strokeWidth={1.6} aria-hidden="true" />
            </div>
          )}
        </div>

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
              {showTitle}
            </h1>
            {show.tmdb_title && show.tmdb_title !== showTitle && (
              <div
                style={{
                  marginTop: 4,
                  color: "var(--color-text-muted)",
                  fontSize: 14,
                  fontStyle: "italic",
                }}
              >
                {show.tmdb_title}
              </div>
            )}
          </div>

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
            {rating && primaryRating && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span
                  title={`${ratingLabel[primaryRating.source]} ${rating}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 700,
                  }}
                >
                  <RatingSourceLogo
                    source={primaryRating.source}
                    height={14}
                    title={ratingLabel[primaryRating.source]}
                  />
                  {rating}
                </span>
              </>
            )}
            {secondaryRatings.map((r) => (
              <span key={r.source}>
                <span style={{ opacity: 0.4 }}>·</span>{" "}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: 0.85,
                  }}
                  title={`${ratingLabel[r.source]} ${formatRating(r.value)}`}
                >
                  <RatingSourceLogo
                    source={r.source}
                    height={14}
                    title={ratingLabel[r.source]}
                  />
                  <span style={{ color: "var(--color-text)" }}>
                    {formatRating(r.value)}
                  </span>
                </span>
              </span>
            ))}
            {totalSeasons > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>
                  {totalSeasons}{" "}
                  {totalSeasons === 1
                    ? language === "es" ? "temporada" : "season"
                    : language === "es" ? "temporadas" : "seasons"}
                </span>
              </>
            )}
            {totalEpisodes > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>
                  {totalEpisodes}{" "}
                  {totalEpisodes === 1
                    ? language === "es" ? "episodio" : "episode"
                    : language === "es" ? "episodios" : "episodes"}
                </span>
              </>
            )}
          </div>

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
            {/* Downloads happen per release-group below — picking a quality is
                a deliberate choice, not a one-click "everything" action. The
                hero focuses on identity (poster + title + meta) and the
                Watchlist call-to-action. */}
            {show.tmdb_id != null && watchlistedTmdbIds && onAddToWatchlist && (
              <WatchlistButton
                tmdbId={show.tmdb_id}
                tmdbType={show.tmdb_type === "movie" ? "movie" : "tv"}
                title={show.tmdb_title ?? show.title ?? show.filename}
                titleEn={show.tmdb_title ?? undefined}
                poster={show.tmdb_poster ?? undefined}
                year={show.year ?? undefined}
                language={language}
                watchlistedTmdbIds={watchlistedTmdbIds}
                onAdd={onAddToWatchlist}
                onNavigateToWatchlist={onOpenWatchlist}
              />
            )}
            <span style={{ opacity: 0.7 }}>
              {language === "es"
                ? "Elige una versión más abajo para descargar."
                : "Pick a release below to download."}
            </span>
          </div>
        </div>
      </div>

      {/* Content body */}
      <div
        style={{
          // Mobile bottom padding clears the fixed bottom tab bar (~64px).
          padding: isMobile
            ? "12px 18px calc(80px + env(safe-area-inset-bottom, 0px))"
            : "12px 40px 60px",
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? 22 : 28,
        }}
      >
        {overview && (
          <Section title={language === "es" ? "Sinopsis" : "Overview"}>
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
        )}

        <Section title={language === "es" ? "Episodios" : "Episodes"}>
          {seasonKeys.length > 1 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 16,
              }}
            >
              <SeasonChip
                label={language === "es" ? "Todas" : "All"}
                active={activeSeason === "all"}
                count={allEpisodes.length}
                onClick={() => setActiveSeason("all")}
              />
              {seasonKeys.map((s) => (
                <SeasonChip
                  key={s}
                  label={
                    s === -1
                      ? language === "es" ? "Sin temporada" : "Unknown"
                      : language === "es"
                        ? `T${String(s).padStart(2, "0")}`
                        : `S${String(s).padStart(2, "0")}`
                  }
                  count={seasonMap.get(s)?.length ?? 0}
                  active={activeSeason === s}
                  onClick={() => setActiveSeason(s)}
                />
              ))}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {renderSections.length === 0 ||
            renderSections.every((s) => s.groups.length === 0) ? (
              <div
                style={{
                  padding: "32px 0",
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                  fontSize: 13,
                }}
              >
                {language === "es"
                  ? "Sin episodios en esta temporada"
                  : "No episodes in this season"}
              </div>
            ) : (
              renderSections.map((section) => (
                <div
                  key={String(section.seasonKey)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {activeSeason === "all" && (
                    <h3
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--color-text)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {section.seasonLabel}{" "}
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          fontWeight: 500,
                        }}
                      >
                        ·{" "}
                        {section.groups.reduce(
                          (n, g) => n + g.episodes.length,
                          0,
                        )}{" "}
                        {language === "es" ? "episodios" : "episodes"}
                      </span>
                    </h3>
                  )}
                  {section.groups.map((group, idx) => (
                    <ReleaseGroupBlock
                      key={`${section.seasonKey}:${group.folderPath}`}
                      group={group}
                      language={language}
                      seasonLabel={
                        activeSeason === "all" ? null : section.seasonLabel
                      }
                      defaultOpen={
                        section.groups.length === 1 || idx === 0
                      }
                      filterDownloadable={filterDownloadable}
                      onDownloadGroup={onDownloadSeason}
                      onDownload={onDownload}
                      downloadMap={downloadMap}
                      isDownloadPending={isDownloadPending}
                      downloadedBadgeMap={downloadedBadgeMap}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
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
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function ReleaseGroupBlock({
  group,
  language,
  seasonLabel,
  defaultOpen,
  filterDownloadable,
  onDownloadGroup,
  onDownload,
  downloadMap,
  isDownloadPending,
  downloadedBadgeMap,
}: {
  group: ReleaseGroup;
  language: AppLanguage;
  seasonLabel: string | null;
  defaultOpen: boolean;
  filterDownloadable: (eps: MediaItem[]) => MediaItem[];
  onDownloadGroup: (episodes: MediaItem[]) => void;
  onDownload: (item: MediaItem) => void;
  downloadMap: Map<string, DownloadItem>;
  isDownloadPending: (ftpPath: string) => boolean;
  downloadedBadgeMap: BadgeMap;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const downloadable = filterDownloadable(group.episodes);
  const doneCount = group.episodes.length - downloadable.length;

  return (
    <section
      style={{
        borderRadius: 14,
        border:
          "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
        background:
          "color-mix(in srgb, var(--color-surface) 90%, transparent)",
        overflow: "hidden",
      }}
    >
      <header
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 14px",
          cursor: "pointer",
          userSelect: "none",
          background: open
            ? "color-mix(in srgb, var(--color-surface-2) 60%, transparent)"
            : "transparent",
        }}
      >
        <span
          style={{
            color: "var(--color-text-muted)",
            display: "flex",
            alignItems: "center",
          }}
        >
          {open ? (
            <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
          )}
        </span>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {seasonLabel && (
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--color-text)",
                letterSpacing: "-0.005em",
                lineHeight: 1.2,
              }}
            >
              {seasonLabel}
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
            }}
          >
            {group.resolution && (
              <QualityChip
                tone="resolution"
                label={
                  group.resolution.toUpperCase() === "2160P"
                    ? "4K"
                    : group.resolution
                }
              />
            )}
            {group.release_type && (
              <QualityChip tone="source" label={group.release_type} />
            )}
            {group.codec && (
              <QualityChip tone="muted" label={group.codec} />
            )}
            {group.hdr && isNotableHdr(group.hdr) && (
              <QualityChip tone="hdr" label={hdrLabel(group.hdr)} />
            )}
            {group.audio && (
              <QualityChip
                tone={isPremiumAudio(group.audio) ? "hdr" : "muted"}
                label={audioLabel(group.audio)}
              />
            )}
            {group.langs.length > 0 && (
              <QualityChip
                tone="muted"
                label={group.langs.map((l) => l.toUpperCase()).join("/")}
              />
            )}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--color-text-muted)",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span>
              {group.episodes.length}{" "}
              {group.episodes.length === 1
                ? language === "es"
                  ? "episodio"
                  : "episode"
                : language === "es"
                  ? "episodios"
                  : "episodes"}
            </span>
            {group.totalBytes > 0 && (
              <span>
                ·{" "}
                {formatBytes(group.totalBytes)}{" "}
                {language === "es" ? "total" : "total"}
              </span>
            )}
            {doneCount > 0 && (
              <span style={{ color: "var(--color-success)" }}>
                · {doneCount}{" "}
                {language === "es" ? "descargados" : "downloaded"}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              fontSize: 11,
              fontFamily: "monospace",
              color: "var(--color-text-muted)",
            }}
            title={group.folderPath || group.folder}
          >
            <Folder
              size={12}
              strokeWidth={2.1}
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            />
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {group.folderPath || group.folder}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownloadGroup(downloadable);
          }}
          disabled={downloadable.length === 0}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 999,
            border: "none",
            background:
              downloadable.length === 0
                ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
                : "var(--color-primary)",
            color: downloadable.length === 0 ? "var(--color-success)" : "#fff",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: downloadable.length === 0 ? "default" : "pointer",
            flexShrink: 0,
            boxShadow:
              downloadable.length === 0
                ? "none"
                : "0 4px 12px color-mix(in srgb, var(--color-primary) 36%, transparent)",
          }}
        >
          {downloadable.length === 0 ? (
            <>
              <Check size={13} strokeWidth={2.4} aria-hidden="true" />
              {language === "es" ? "Completo" : "Complete"}
            </>
          ) : (
            <>
              <Download size={13} strokeWidth={2.2} aria-hidden="true" />
              {language === "es"
                ? `Descargar ${downloadable.length}`
                : `Download ${downloadable.length}`}
            </>
          )}
        </button>
      </header>

      {open && (
        <div
          style={{
            borderTop:
              "1px solid color-mix(in srgb, var(--color-border) 40%, transparent)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {group.episodes.map((ep, idx) => (
            <EpisodeRow
              key={ep.id}
              episode={ep}
              language={language}
              onDownload={onDownload}
              downloadMap={downloadMap}
              isDownloadPending={isDownloadPending}
              downloadedBadgeMap={downloadedBadgeMap}
              showDivider={idx < group.episodes.length - 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QualityChip({
  label,
  tone,
}: {
  label: string;
  tone: "resolution" | "source" | "hdr" | "muted";
}) {
  const palette = {
    resolution: {
      bg: "color-mix(in srgb, var(--color-primary) 18%, transparent)",
      fg: "var(--color-primary)",
      border:
        "1px solid color-mix(in srgb, var(--color-primary) 36%, transparent)",
    },
    source: {
      bg: "color-mix(in srgb, var(--color-info) 16%, transparent)",
      fg: "var(--color-info)",
      border:
        "1px solid color-mix(in srgb, var(--color-info) 32%, transparent)",
    },
    hdr: {
      bg: "color-mix(in srgb, #7c3aed 18%, transparent)",
      fg: "#a78bfa",
      border: "1px solid color-mix(in srgb, #7c3aed 38%, transparent)",
    },
    muted: {
      bg: "color-mix(in srgb, var(--color-surface-2) 80%, transparent)",
      fg: "var(--color-text-muted)",
      border:
        "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
    },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 6,
        background: palette.bg,
        border: palette.border,
        color: palette.fg,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </span>
  );
}

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
      <header style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
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

function SeasonChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
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
      }}
    >
      <span>{label}</span>
      <span
        style={{
          opacity: 0.7,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function EpisodeRow({
  episode,
  language,
  onDownload,
  downloadMap,
  isDownloadPending,
  downloadedBadgeMap,
  showDivider = false,
}: {
  episode: MediaItem;
  language: AppLanguage;
  onDownload: (item: MediaItem) => void;
  downloadMap: Map<string, DownloadItem>;
  isDownloadPending: (ftpPath: string) => boolean;
  downloadedBadgeMap: BadgeMap;
  showDivider?: boolean;
}) {
  const ep = resolvedEpisode(episode);
  const season = resolvedSeason(episode);
  const seasonPrefix =
    season != null
      ? `${language === "es" ? "T" : "S"}${String(season).padStart(2, "0")}`
      : "";
  const epLabel =
    ep.episode != null
      ? `${seasonPrefix}E${String(ep.episode).padStart(2, "0")}${ep.episodeEnd != null ? `-E${String(ep.episodeEnd).padStart(2, "0")}` : ""}`
      : "—";

  const dl = downloadMap.get(episode.ftp_path);
  const isActive =
    isDownloadPending(episode.ftp_path) ||
    dl?.status === "queued" ||
    dl?.status === "downloading";
  const isDone =
    dl?.status === "done" ||
    downloadedBadgeMap[episode.id]?.downloaded === true;
  const inPlex = downloadedBadgeMap[episode.id]?.plexInLibrary === true;
  const inEmby = downloadedBadgeMap[episode.id]?.embyInLibrary === true;
  const langs =
    episode.languages
      ?.split(",")
      .map((l) => l.trim())
      .filter(Boolean) ?? [];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "84px minmax(0, 1fr) auto",
        gap: 14,
        alignItems: "center",
        padding: "10px 14px",
        background: "transparent",
        borderBottom: showDivider
          ? "1px solid color-mix(in srgb, var(--color-border) 30%, transparent)"
          : "none",
      }}
    >
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 800,
          letterSpacing: "0.04em",
          color: "var(--color-primary)",
          fontFamily: "monospace",
        }}
      >
        {epLabel}
      </div>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
          {inPlex && <PlexIcon size={11} />}
          {inEmby && <EmbyIcon size={11} />}
          <span
            title={episode.filename}
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--color-text)",
              fontFamily: "monospace",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {episode.filename}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 11.5,
            color: "var(--color-text-muted)",
          }}
        >
          {episode.resolution && <span>{episode.resolution}</span>}
          {episode.release_type && <span>{episode.release_type}</span>}
          {episode.codec && <span>{episode.codec}</span>}
          {episode.hdr && (
            <span style={{ color: "#a78bfa", fontWeight: 700 }}>
              {hdrShortLabel(episode.hdr)}
            </span>
          )}
          {episode.size_bytes != null && episode.size_bytes > 0 && (
            <span>{formatBytes(episode.size_bytes)}</span>
          )}
          {langs.length > 0 && (
            <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {langs.join("/")}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDownload(episode)}
        disabled={isActive || isDone}
        title={
          isDone
            ? t(language, "detail.alreadyDownloaded")
            : isActive
              ? t(language, "downloads.downloading")
              : t(language, "tv.downloadEpisode" as never) ||
                t(language, "detail.download")
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 999,
          border: "none",
          background: isDone
            ? "color-mix(in srgb, var(--color-success) 22%, transparent)"
            : isActive
              ? "color-mix(in srgb, var(--color-warning) 22%, transparent)"
              : "color-mix(in srgb, var(--color-primary) 18%, transparent)",
          color: isDone
            ? "var(--color-success)"
            : isActive
              ? "var(--color-warning)"
              : "var(--color-primary)",
          cursor: isActive || isDone ? "default" : "pointer",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {isDone ? (
          <Check size={12} strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <Download size={12} strokeWidth={2.2} aria-hidden="true" />
        )}
        {isDone
          ? language === "es" ? "Listo" : "Done"
          : isActive
            ? language === "es" ? "En curso" : "Active"
            : language === "es" ? "Descargar" : "Download"}
      </button>
    </div>
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

