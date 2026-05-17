import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ExternalLink,
  Server,
} from "lucide-react";
import type { TmdbSeason, WatchlistCoverageItem, WatchlistItem } from "./types";
import type { AppLanguage } from "../../utils/mediaLanguage";
import { t } from "../../utils/i18n";
import { useQualityProfiles } from "./useQualityProfiles";
import { useIsMobile } from "../../hooks/useIsMobile";
import Toggle from "../../components/Toggle";
import { formSelectStandard } from "../../lib/formStyles";

const selectStyle = formSelectStandard;

interface WatchlistDetailPanelProps {
  item: WatchlistItem;
  language: AppLanguage;
  onClose: () => void;
  onRemove: (id: number) => void;
  onUpdate: (
    id: number,
    scope: "all" | "latest",
    autoDownload: boolean,
    profileId: number,
  ) => Promise<void>;
  getCoverage: (tmdbId: number) => Promise<WatchlistCoverageItem[]>;
  getSeasons: (tmdbId: number) => Promise<TmdbSeason[]>;
  onNavigateToItem?: (tmdbId: number, mediaType: string) => void;
}

const TMDB_IMG_W = "https://image.tmdb.org/t/p/w300";

/** Numeric rank for sorting: lower number = lower resolution. */
function resolutionRank(res: string | null | undefined): number {
  const s = (res ?? "").toUpperCase();
  if (s.includes("2160") || s === "4K" || s === "UHD") return 4;
  if (s.includes("1080")) return 3;
  if (s.includes("720")) return 2;
  if (s.includes("480") || s.includes("576")) return 1;
  return 0; // SD / unknown
}

function sortByResolution(
  items: WatchlistCoverageItem[],
): WatchlistCoverageItem[] {
  return [...items].sort(
    (a, b) => resolutionRank(a.resolution) - resolutionRank(b.resolution),
  );
}

export default function WatchlistDetailPanel({
  item,
  language,
  onClose,
  onRemove,
  onUpdate,
  getCoverage,
  getSeasons,
  onNavigateToItem,
}: WatchlistDetailPanelProps) {
  const [scope, setScope] = useState<"all" | "latest">(
    (item.scope as "all" | "latest") ?? "all",
  );
  const [autoDownload, setAutoDownload] = useState(item.auto_download === 1);
  const [profileId, setProfileId] = useState<number>(item.profile_id ?? 1);
  const [saving, setSaving] = useState(false);
  const { profiles } = useQualityProfiles();
  const isMobile = useIsMobile();
  const [coverage, setCoverage] = useState<WatchlistCoverageItem[]>([]);
  const [seasons, setSeasons] = useState<TmdbSeason[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  // Build a map of "season,episode" → coverage items (all versions, downloaded or FTP-only)
  const coverageByEp = useMemo(() => {
    const map = new Map<string, WatchlistCoverageItem[]>();
    for (const c of coverage) {
      if (c.season != null && c.episode != null) {
        const key = `${c.season},${c.episode}`;
        const arr = map.get(key) ?? [];
        arr.push(c);
        map.set(key, arr);
      }
    }
    return map;
  }, [coverage]);

  const poster = item.poster
    ? item.poster.startsWith("http")
      ? item.poster
      : `${TMDB_IMG_W}${item.poster}`
    : null;

  const displayTitle =
    language === "es" ? item.title : (item.title_en ?? item.title);
  const displayOverview =
    language === "es" ? item.overview : (item.overview_en ?? item.overview);

  const isDirty =
    scope !== item.scope ||
    autoDownload !== (item.auto_download === 1) ||
    profileId !== (item.profile_id ?? 1);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(item.id, scope, autoDownload, profileId);
    } finally {
      setSaving(false);
    }
  };

  // Auto-load coverage + TMDB seasons when panel opens
  useEffect(() => {
    // Always fetch coverage (in-library items)
    getCoverage(item.tmdb_id)
      .then(setCoverage)
      .catch(() => {});
    // For TV shows, also fetch full TMDB season/episode data
    if (item.tmdb_type === "tv") {
      setLoadingSeasons(true);
      getSeasons(item.tmdb_id)
        .then(setSeasons)
        .catch(() => {})
        .finally(() => setLoadingSeasons(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        background: "var(--color-bg)",
        overflowY: "auto",
        overflowX: "hidden",
        animation: "detail-page-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Atmospheric blurred poster — same visual language as DetailPage so
          the page reads as part of the same family. */}
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

      {/* Sticky back bar — matches DetailPage / Settings pattern. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 24px",
          background: "color-mix(in srgb, var(--color-bg) 92%, transparent)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          borderBottom:
            "1px solid color-mix(in srgb, var(--color-border) 50%, transparent)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={language === "es" ? "Volver" : "Back"}
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
            fontFamily: "inherit",
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>{language === "es" ? "Atrás" : "Back"}</span>
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--color-text-muted)",
            fontSize: 12.5,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <span>{language === "es" ? "Seguimiento" : "Watchlist"}</span>
          <span style={{ opacity: 0.5 }}>/</span>
          <span
            title={displayTitle}
            style={{
              color: "var(--color-text)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {displayTitle}
          </span>
        </div>
      </div>

      {/* Content container — the outer wrapper handles scrolling now, so the
          backdrop + gradient scroll out of view naturally instead of staying
          painted on top of the rest of the page. */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            // Mobile bottom padding clears the fixed bottom tab bar (~64px).
            padding: isMobile
              ? "16px 16px calc(80px + env(safe-area-inset-bottom, 0px))"
              : "24px 32px 40px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Hero — DetailPage-style: big poster + large title + meta row +
              status / library-presence chips. Replaces the old 90px sidebar
              proportions so the page actually looks like a page. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "1fr"
                : "minmax(180px, 220px) minmax(0, 1fr)",
              gap: isMobile ? 16 : 28,
              alignItems: "flex-end",
              padding: "12px 0 4px",
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
                boxShadow:
                  "0 24px 48px color-mix(in srgb, black 50%, transparent)",
                maxWidth: isMobile ? 180 : "none",
              }}
            >
              {poster ? (
                <img
                  src={poster}
                  alt={displayTitle}
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
                    fontSize: 36,
                  }}
                  aria-hidden="true"
                >
                  ★
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                minWidth: 0,
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(24px, 3vw, 38px)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  color: "var(--color-text)",
                }}
              >
                {displayTitle}
              </h1>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  color: "var(--color-text-muted)",
                  fontSize: 13.5,
                }}
              >
                {item.year && (
                  <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
                    {item.year}
                  </span>
                )}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    background:
                      item.tmdb_type === "tv"
                        ? "color-mix(in srgb, var(--color-teal) 18%, transparent)"
                        : "color-mix(in srgb, var(--color-primary) 18%, transparent)",
                    color:
                      item.tmdb_type === "tv"
                        ? "var(--color-teal)"
                        : "var(--color-primary)",
                    border: `1px solid color-mix(in srgb, ${
                      item.tmdb_type === "tv"
                        ? "var(--color-teal)"
                        : "var(--color-primary)"
                    } 36%, transparent)`,
                  }}
                >
                  {item.tmdb_type === "tv" ? "TV" : "Película"}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background:
                      item.library_status === "available"
                        ? "color-mix(in srgb, var(--color-success) 18%, transparent)"
                        : "color-mix(in srgb, var(--color-surface-2) 80%, transparent)",
                    color:
                      item.library_status === "available"
                        ? "var(--color-success)"
                        : "var(--color-text-muted)",
                    border: `1px solid color-mix(in srgb, ${
                      item.library_status === "available"
                        ? "var(--color-success)"
                        : "var(--color-border)"
                    } 40%, transparent)`,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background:
                        item.library_status === "available"
                          ? "var(--color-success)"
                          : "var(--color-text-muted)",
                    }}
                  />
                  {item.library_status === "available"
                    ? t(language, "watchlist.available")
                    : t(language, "watchlist.pending")}
                </span>
                {item.library_count > 0 && (
                  <span>
                    · {item.library_count}{" "}
                    {t(language, "watchlist.filesInLibrary")}
                  </span>
                )}
              </div>

              {displayOverview && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "var(--color-text)",
                    lineHeight: 1.6,
                    maxWidth: "70ch",
                  }}
                >
                  {displayOverview}
                </p>
              )}
            </div>
          </div>

          {/* Movie: list of available versions with download actions */}
          {item.tmdb_type === "movie" && coverage.length > 0 && (
            <Section
              title={
                language === "es" ? "Archivos disponibles" : "Available files"
              }
              subtitle={`${coverage.length} ${coverage.length === 1 ? "file" : "files"}`}
            >
              <div
                style={{
                  borderRadius: 12,
                  border:
                    "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
                  background:
                    "color-mix(in srgb, var(--color-surface) 90%, transparent)",
                  overflow: "hidden",
                }}
              >
                {sortByResolution(coverage).map((c, i) => {
                  return (
                    <div
                      key={c.ftp_path}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderBottom:
                          i < coverage.length - 1
                            ? "1px solid var(--color-border)"
                            : "none",
                        background: c.downloaded
                          ? "color-mix(in srgb, var(--color-success) 6%, transparent)"
                          : "transparent",
                      }}
                    >
                      {/* Status icon */}
                      {c.downloaded ? (
                        <Check
                          size={13}
                          strokeWidth={2.5}
                          style={{
                            color: "var(--color-success)",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <Server
                          size={13}
                          strokeWidth={2}
                          style={{ color: "var(--color-teal)", flexShrink: 0 }}
                        />
                      )}
                      {/* Resolution badge */}
                      {c.resolution && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            background: "var(--color-surface-2)",
                            color: c.downloaded
                              ? "var(--color-success)"
                              : "var(--color-text-muted)",
                            borderRadius: "var(--radius-full)",
                            padding: "2px 6px",
                            flexShrink: 0,
                          }}
                        >
                          {c.resolution}
                        </span>
                      )}
                      {/* Filename */}
                      <span
                        style={{
                          fontSize: 11,
                          color: c.downloaded
                            ? "var(--color-text)"
                            : "var(--color-text-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                          minWidth: 0,
                        }}
                        title={c.filename}
                      >
                        {c.filename}
                      </span>
                      {/* Navigate button (only for FTP-available, not yet downloaded) */}
                      {!c.downloaded && (
                        <button
                          onClick={() =>
                            onNavigateToItem?.(
                              item.tmdb_id,
                              item.tmdb_type ?? "movie",
                            )
                          }
                          title={
                            language === "es"
                              ? "Ver en biblioteca"
                              : "View in library"
                          }
                          style={{
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 26,
                            height: 26,
                            border:
                              "1px solid color-mix(in srgb, var(--color-primary) 60%, transparent)",
                            borderRadius: "var(--radius-full)",
                            background:
                              "color-mix(in srgb, var(--color-primary) 15%, transparent)",
                            color: "var(--color-primary)",
                            cursor: "pointer",
                            transition: "background 0.15s ease",
                            padding: 0,
                          }}
                        >
                          <ExternalLink size={12} strokeWidth={2.2} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Unified configuration card — TV scope (TV only), auto-download
              toggle, quality profile picker, and the contextual save button.
              Replaces the old loose stack of inputs. */}
          <Section
            title={language === "es" ? "Configuración" : "Configuration"}
            subtitle={
              isDirty
                ? language === "es"
                  ? "Cambios sin guardar"
                  : "Unsaved changes"
                : undefined
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 12,
                border:
                  "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
                background:
                  "color-mix(in srgb, var(--color-surface) 90%, transparent)",
              }}
            >
              {item.tmdb_type === "tv" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--color-text)",
                      fontWeight: 600,
                    }}
                  >
                    {t(language, "watchlist.coverage")}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["all", "latest"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setScope(s)}
                        style={{
                          border:
                            scope === s
                              ? "1px solid color-mix(in srgb, var(--color-primary) 50%, transparent)"
                              : "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
                          borderRadius: 999,
                          padding: "5px 12px",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                          background:
                            scope === s
                              ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                              : "color-mix(in srgb, var(--color-surface-2) 70%, transparent)",
                          color:
                            scope === s
                              ? "var(--color-primary)"
                              : "var(--color-text-muted)",
                          fontFamily: "inherit",
                        }}
                      >
                        {s === "all"
                          ? t(language, "watchlist.allSeasons")
                          : t(language, "watchlist.latestSeason")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--color-text)",
                    fontWeight: 600,
                  }}
                >
                  {t(language, "watchlist.autoDownload")}
                </span>
                <Toggle checked={autoDownload} onChange={setAutoDownload} />
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {t(language, "watchlist.qualityProfile")}
                </label>
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(Number(e.target.value))}
                  style={selectStyle}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {isDirty && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    style={{
                      background: "var(--color-primary)",
                      border: "none",
                      color: "#fff",
                      borderRadius: 999,
                      padding: "8px 18px",
                      cursor: saving ? "default" : "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                      opacity: saving ? 0.7 : 1,
                      boxShadow:
                        "0 4px 14px color-mix(in srgb, var(--color-primary) 36%, transparent)",
                      fontFamily: "inherit",
                    }}
                  >
                    {saving
                      ? t(language, "watchlist.saving")
                      : t(language, "watchlist.saveChanges")}
                  </button>
                </div>
              )}
            </div>
          </Section>

          {/* Episode coverage — TMDB season grid */}
          {item.tmdb_type === "tv" && (
            <Section
              title={language === "es" ? "Cobertura por temporada" : "Season coverage"}
              subtitle={
                seasons.length > 0
                  ? `${seasons.length} ${seasons.length === 1 ? (language === "es" ? "temporada" : "season") : language === "es" ? "temporadas" : "seasons"}`
                  : undefined
              }
            >
              {loadingSeasons ? (
                <div
                  style={{
                    padding: "24px 0",
                    color: "var(--color-text-muted)",
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  {language === "es"
                    ? "Cargando episodios…"
                    : "Loading episodes…"}
                </div>
              ) : seasons.length === 0 ? (
                <div
                  style={{
                    padding: "24px 0",
                    color: "var(--color-text-muted)",
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  {language === "es"
                    ? "Sin datos de episodios"
                    : "No episode data"}
                </div>
              ) : (
                <div
                  style={{
                    borderRadius: 12,
                    border:
                      "1px solid color-mix(in srgb, var(--color-border) 55%, transparent)",
                    background:
                      "color-mix(in srgb, var(--color-surface) 90%, transparent)",
                    overflow: "hidden",
                  }}
                >
                  {seasons.map((season) => (
                    <SeasonSection
                      key={season.season_number}
                      season={season}
                      coverageByEp={coverageByEp}
                      onNavigateToItem={onNavigateToItem}
                      tmdbId={item.tmdb_id}
                      mediaType={item.tmdb_type ?? "tv"}
                      language={language}
                    />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Movie in-library indicator — bottom fallback removed (shown above) */}

          {/* Danger zone — wrapped in its own labeled section. */}
          <Section title={language === "es" ? "Zona de riesgo" : "Danger zone"}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 18px",
                borderRadius: 12,
                border:
                  "1px solid color-mix(in srgb, var(--color-danger) 28%, transparent)",
                background:
                  "color-mix(in srgb, var(--color-danger) 6%, transparent)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--color-text)",
                  }}
                >
                  {t(language, "watchlist.removeFromWatchlist")}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    marginTop: 2,
                  }}
                >
                  {language === "es"
                    ? "Deja de seguir este título y elimina su configuración."
                    : "Stop tracking this title and remove its configuration."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                style={{
                  background: "var(--color-danger)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "9px 18px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                {language === "es" ? "Eliminar" : "Remove"}
              </button>
            </div>
          </Section>
        </div>{/* /container */}
      </div>{/* /scrollable */}
    </div>
  );
}

// ── Page section helper (mirrors the DetailPage / TVShowPage style) ────────

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
          flexWrap: "wrap",
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

// ── SeasonSection helper ─────────────────────────────────────────────────────

interface SeasonSectionProps {
  season: TmdbSeason;
  coverageByEp: Map<string, WatchlistCoverageItem[]>;
  onNavigateToItem?: (tmdbId: number, mediaType: string) => void;
  tmdbId: number;
  mediaType: string;
  language: AppLanguage;
}

function SeasonSection({
  season,
  coverageByEp,
  onNavigateToItem,
  tmdbId,
  mediaType,
  language,
}: SeasonSectionProps) {
  const [open, setOpen] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  const downloadedCount = season.episodes.filter((ep) => {
    const files =
      coverageByEp.get(`${season.season_number},${ep.episode_number}`) ?? [];
    return files.some((c) => c.downloaded);
  }).length;

  return (
    <div>
      {/* Season header */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "7px 12px",
          background: "var(--color-surface-2)",
          border: "none",
          borderBottom: open ? "1px solid var(--color-border)" : "none",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <span>
          {language === "es" ? "Temporada" : "Season"} {season.season_number}
          {season.name && season.name !== `Season ${season.season_number}` && (
            <span
              style={{
                fontWeight: 400,
                marginLeft: 6,
                color: "var(--color-text-muted)",
              }}
            >
              — {season.name}
            </span>
          )}
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {downloadedCount > 0 && (
            <span style={{ color: "var(--color-success)", fontSize: 11 }}>
              {downloadedCount}/{season.episodes.length}
            </span>
          )}
          <span style={{ fontSize: 10 }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {/* Episodes */}
      {open && (
        <div>
          {season.episodes.map((ep, i) => {
            const key = `${season.season_number},${ep.episode_number}`;
            const epFiles = coverageByEp.get(key) ?? [];
            const downloadedFiles = sortByResolution(
              epFiles.filter((c) => c.downloaded),
            );
            const ftpFiles = sortByResolution(
              epFiles.filter((c) => !c.downloaded),
            );
            const inLibrary = downloadedFiles.length > 0;
            const hasOnServer = ftpFiles.length > 0 && !inLibrary;
            const isFuture = ep.air_date != null && ep.air_date > today;

            return (
              <div
                key={ep.episode_number}
                style={{
                  padding: "5px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom:
                    i < season.episodes.length - 1
                      ? "1px solid var(--color-border)"
                      : "none",
                  background: inLibrary
                    ? "color-mix(in srgb, var(--color-success) 6%, transparent)"
                    : hasOnServer
                      ? "color-mix(in srgb, var(--color-teal) 4%, transparent)"
                      : "transparent",
                }}
              >
                {/* Left: status icon + episode label */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  {inLibrary ? (
                    <Check
                      size={13}
                      strokeWidth={2.5}
                      style={{ color: "var(--color-success)", flexShrink: 0 }}
                      aria-hidden="true"
                    />
                  ) : hasOnServer ? (
                    <Server
                      size={13}
                      strokeWidth={2}
                      style={{ color: "var(--color-teal)", flexShrink: 0 }}
                      aria-hidden="true"
                    />
                  ) : isFuture ? (
                    <CalendarClock
                      size={13}
                      strokeWidth={2}
                      style={{ color: "var(--color-warning)", flexShrink: 0 }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: "50%",
                        border: "1.5px solid var(--color-border)",
                        flexShrink: 0,
                        display: "inline-block",
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      color: inLibrary
                        ? "var(--color-text)"
                        : hasOnServer
                          ? "var(--color-text)"
                          : isFuture
                            ? "var(--color-warning)"
                            : "var(--color-text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ fontWeight: 600, marginRight: 4 }}>
                      E{String(ep.episode_number).padStart(2, "0")}
                    </span>
                    {ep.name}
                  </span>
                </span>

                {/* Right: per-version resolution pills (downloaded = green, FTP = clickable download) */}
                <span
                  style={{
                    flexShrink: 0,
                    marginLeft: 8,
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 3,
                    justifyContent: "flex-end",
                    maxWidth: 160,
                  }}
                >
                  {!inLibrary && !hasOnServer && ep.air_date && (
                    <span
                      style={{
                        fontSize: 10,
                        color: isFuture
                          ? "var(--color-warning)"
                          : "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(ep.air_date + "T12:00:00").toLocaleDateString(
                        language === "es" ? "es-ES" : "en-US",
                        { day: "numeric", month: "short", year: "numeric" },
                      )}
                    </span>
                  )}
                  {/* Downloaded version badges (non-interactive) */}
                  {downloadedFiles.map((c) => (
                    <span
                      key={c.ftp_path}
                      title={c.filename}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        background:
                          "color-mix(in srgb, var(--color-success) 18%, transparent)",
                        color: "var(--color-success)",
                        borderRadius: "var(--radius-full)",
                        padding: "2px 7px",
                        whiteSpace: "nowrap",
                        border:
                          "1px solid color-mix(in srgb, var(--color-success) 35%, transparent)",
                      }}
                    >
                      ✓ {c.resolution ?? "SD"}
                    </span>
                  ))}
                  {/* FTP-available version pills — each navigates to library detail */}
                  {ftpFiles.map((c) => (
                    <button
                      key={c.ftp_path}
                      onClick={() => onNavigateToItem?.(tmdbId, mediaType)}
                      title={
                        language === "es"
                          ? "Ver en biblioteca"
                          : "View in library"
                      }
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        background:
                          "color-mix(in srgb, var(--color-primary) 15%, transparent)",
                        color: "var(--color-primary)",
                        border:
                          "1px solid color-mix(in srgb, var(--color-primary) 55%, transparent)",
                        borderRadius: "var(--radius-full)",
                        padding: "2px 7px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "background 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <ExternalLink size={9} strokeWidth={2.5} />
                      {c.resolution ?? "SD"}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
