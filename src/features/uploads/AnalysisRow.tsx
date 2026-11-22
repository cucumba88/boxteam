import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Film,
  Tv,
  Video,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  FolderSearch,
  Search,
  Star,
  CheckCircle,
} from "lucide-react";
import Toggle from "../../components/Toggle";
import FilenameBuilder from "./FilenameBuilder";
import FtpDirPicker from "./FtpDirPicker";
import { FolderOpen, FileVideo, Folder } from "lucide-react";
import type {
  AnalysisResult,
  LocalMediaInfo,
  MediaType,
  TmdbMatch,
  UploadSuggestion,
} from "./types";
import { formatBytes, formatDuration, formatLanguages } from "../../lib/format";
import { formInputCompact, formSelectCompact } from "../../lib/formStyles";
import {
  audioFilenameToken,
  audioLabel,
  canonicalAudio,
  hdrLabel,
} from "../../utils/techTags";
import { foldForSearch } from "../../utils/textSearch";
import {
  SOURCE_OPTIONS as SHARED_SOURCE_OPTIONS,
  RESOLUTIONS as SHARED_RESOLUTIONS,
  CODECS as SHARED_CODECS,
  AUDIO_CODECS as SHARED_AUDIO_CODECS,
  HDR_OPTIONS,
  hdrFilenameToken,
  isDV as isDVHdr,
  mapReleaseType,
  normalizeResolution,
  mergeHdr,
  parseQualityFromFilename,
  formatChannels,
} from "./quality";

const TMDB_IMG = "https://image.tmdb.org/t/p/w92";

// ─── Season upload helpers ─────────────────────────────────────────────────────

// Season-mode dropdowns reuse the same canonical lists as FilenameBuilder.
const SEASON_SOURCES = SHARED_SOURCE_OPTIONS;
const SEASON_RESOLUTIONS = SHARED_RESOLUTIONS;
const SEASON_CODECS = SHARED_CODECS;
const SEASON_AUDIO_CODECS = SHARED_AUDIO_CODECS;

/** Render `<option>`s for the canonical list plus an extra option for `value`
 *  when it doesn't match anything in the list — so values seeded by ffprobe
 *  or the filename parser are never silently dropped. */
function renderSeasonOptions(options: string[], value: string): React.ReactNode {
  const has = options.some((o) => o.toLowerCase() === value.toLowerCase());
  return (
    <>
      {options.map((o) => (
        <option key={o} value={o}>
          {o || "—"}
        </option>
      ))}
      {value && !has && <option value={value}>{value}</option>}
    </>
  );
}

/** Parse episode number from a filename, e.g. S01E05 → 5. */
function parseEpisodeNum(name: string): number | null {
  // SxxExx — most common: S01E05
  let m = name.match(/[Ss]\d+[Ee](\d+)/);
  if (m) return parseInt(m[1], 10);
  // Exx or EpXX standalone (e.g. E05, Ep05)
  m = name.match(/(?:^|[\s._-])(?:E|Ep)(\d{1,3})(?:[\s._-]|$)/i);
  if (m) return parseInt(m[1], 10);
  // 1x05 style (season x episode)
  m = name.match(/\d+[xX](\d{1,3})(?:[\s._-]|$)/);
  if (m) return parseInt(m[1], 10);
  // Cap. or Capitulo (Spanish convention)
  m = name.match(/(?:Cap(?:itulo|\.)?)[\s._-]*(\d{1,3})/i);
  if (m) return parseInt(m[1], 10);
  // Leading zero-padded number at start of filename: "01.mkv", "02 Title.mkv"
  m = name.match(/^(\d{1,3})(?:[\s._-]|$)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

// mapReleaseType lives in ./quality — re-exported here under the old name so
// the rest of the file (and any other callers) stays unchanged.
const mapDetectedReleaseType = mapReleaseType;

/**
 * Build a renamed episode filename.
 * e.g. → "Show.Name.S01E05.WEB-DL.1080p.HEVC.HDR10.DV.AC3.SPA.ENG.mkv"
 */
function buildEpisodeFilename(
  showName: string,
  season: number,
  epNum: number,
  source: string,
  resolution: string,
  codec: string,
  hdr: string,
  audioTracks: { codec: string; channels: string; lang: string }[],
  ext: string,
): string {
  const parts: string[] = [];
  const sn = showName.trim();
  if (sn) parts.push(sn.replace(/\s+/g, "."));
  parts.push(
    `S${String(season).padStart(2, "0")}E${String(epNum).padStart(2, "0")}`,
  );
  if (source.trim())
    parts.push(source.trim().replace(/\s+/g, ".").toUpperCase());
  if (resolution.trim()) parts.push(resolution.trim());
  if (codec.trim()) parts.push(codec.trim());
  const hdrCore = hdrFilenameToken(hdr);
  if (hdrCore) parts.push(hdrCore);
  if (isDVHdr(hdr)) parts.push("DV");
  audioTracks
    .filter((t) => t.codec.trim())
    .forEach((t) => {
      const ch = t.channels.trim();
      const token = audioFilenameToken(t.codec, ".");
      parts.push(ch ? `${token}.${ch}` : token);
    });
  // Derive langs from per-track lang field (deduplicated, order preserved)
  const seen = new Set<string>();
  for (const t of audioTracks) {
    const l = t.lang.trim().toUpperCase();
    if (l && !seen.has(l)) {
      seen.add(l);
      parts.push(l);
    }
  }
  return parts.join(".") + (ext ? `.${ext}` : "");
}

// normalizeResolution + parseQualityFromFilename now live in ./quality.

// Language options for the audio-track lang selector.
// code = short ISO-639-2/B tag used in filenames; label = display name in Spanish.
const LANG_OPTIONS: { code: string; label: string }[] = [
  { code: "SPA", label: "Español" },
  { code: "ENG", label: "Inglés" },
  { code: "FRA", label: "Francés" },
  { code: "DEU", label: "Alemán" },
  { code: "ITA", label: "Italiano" },
  { code: "POR", label: "Portugués" },
  { code: "JPN", label: "Japonés" },
  { code: "KOR", label: "Coreano" },
  { code: "ZHO", label: "Chino" },
  { code: "ARA", label: "Árabe" },
  { code: "RUS", label: "Ruso" },
  { code: "TUR", label: "Turco" },
  { code: "POL", label: "Polaco" },
  { code: "NLD", label: "Neerlandés" },
  { code: "SWE", label: "Sueco" },
  { code: "NOR", label: "Noruego" },
  { code: "DAN", label: "Danés" },
  { code: "FIN", label: "Finlandés" },
  { code: "HEB", label: "Hebreo" },
  { code: "HUN", label: "Húngaro" },
  { code: "CES", label: "Checo" },
  { code: "SLK", label: "Eslovaco" },
  { code: "RON", label: "Rumano" },
  { code: "ELL", label: "Griego" },
  { code: "THA", label: "Tailandés" },
  { code: "VIE", label: "Vietnamita" },
  { code: "IND", label: "Indonesio" },
  { code: "MSA", label: "Malayo" },
  { code: "HIN", label: "Hindi" },
  { code: "CAT", label: "Catalán" },
  { code: "LAT", label: "Latín" },
  { code: "EUS", label: "Euskera" },
  { code: "GLG", label: "Gallego" },
  { code: "UKR", label: "Ucraniano" },
  { code: "HRV", label: "Croata" },
  { code: "SRP", label: "Serbio" },
  { code: "BUL", label: "Búlgaro" },
  { code: "SLV", label: "Esloveno" },
  { code: "LIT", label: "Lituano" },
  { code: "LAV", label: "Letón" },
  { code: "EST", label: "Estonio" },
  { code: "SQI", label: "Albanés" },
];

// Quick lookup: code → LANG_OPTIONS entry (canonical + legacy aliases)
const LANG_CODE_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const o of LANG_OPTIONS) m[o.code] = o.code;
  // legacy / ffprobe aliases → canonical code stored in the dropdown
  const aliases: [string, string][] = [
    ["GER", "DEU"],
    ["FRE", "FRA"],
    ["CHI", "ZHO"],
    ["DUT", "NLD"],
    ["CZE", "CES"],
    ["SLO", "SLK"],
    ["ROM", "RON"],
    ["GRE", "ELL"],
    ["MAY", "MSA"],
    ["BAQ", "EUS"],
    ["ALB", "SQI"],
    ["ESP", "SPA"],
    ["ES", "SPA"],
    ["EN", "ENG"],
    ["FR", "FRA"],
    ["DE", "DEU"],
    ["IT", "ITA"],
    ["PT", "POR"],
    ["JA", "JPN"],
    ["KO", "KOR"],
    ["ZH", "ZHO"],
    ["AR", "ARA"],
    ["RU", "RUS"],
    ["TR", "TUR"],
    ["PL", "POL"],
    ["NL", "NLD"],
    ["SV", "SWE"],
    ["NO", "NOR"],
    ["NOB", "NOR"],
    ["NNO", "NOR"],
    ["DA", "DAN"],
    ["FI", "FIN"],
    ["HE", "HEB"],
    ["HU", "HUN"],
    ["CS", "CES"],
    ["SK", "SLK"],
    ["RO", "RON"],
    ["EL", "ELL"],
    ["TH", "THA"],
    ["VI", "VIE"],
    ["ID", "IND"],
    ["MS", "MSA"],
    ["HI", "HIN"],
    ["CA", "CAT"],
    ["LA", "LAT"],
    ["EU", "EUS"],
    ["GL", "GLG"],
    ["UK", "UKR"],
    ["HR", "HRV"],
    ["SR", "SRP"],
    ["BG", "BUL"],
    ["SL", "SLV"],
    ["LT", "LIT"],
    ["LV", "LAV"],
    ["ET", "EST"],
    ["SQ", "SQI"],
  ];
  for (const [alias, canon] of aliases) m[alias] = canon;
  return m;
})();

/** Normalise any language code/alias to the canonical code used by LANG_OPTIONS. */
function normalizeLangCode(raw: string): string {
  const up = raw.trim().toUpperCase();
  return LANG_CODE_MAP[up] ?? up;
}

// Known 3-letter ISO 639-2 language codes commonly found in media filenames
const KNOWN_LANGS = new Set([
  "SPA",
  "ENG",
  "FRA",
  "GER",
  "DEU",
  "ITA",
  "POR",
  "JPN",
  "KOR",
  "CHI",
  "ZHO",
  "ARA",
  "RUS",
  "TUR",
  "POL",
  "DUT",
  "NLD",
  "SWE",
  "NOR",
  "DAN",
  "FIN",
  "HEB",
  "HUN",
  "CZE",
  "SLO",
  "ROM",
  "GRE",
  "ELL",
  "THA",
  "VIE",
  "IND",
  "MAY",
  "HIN",
  "CAT",
  "LAT",
  "EUS",
  "GLG",
]);

/** Extract language codes (e.g. SPA, ENG, FRA) from a media filename or folder path. */
function parseLanguagesFromPath(name: string): string[] {
  // Split on common separators and look for known 3-letter lang codes
  const tokens = name
    .toUpperCase()
    .replace(/\.[^.]+$/, "")
    .split(/[.\s_\-()[\]/\\]+/);
  const found: string[] = [];
  for (const t of tokens) {
    if (KNOWN_LANGS.has(t) && !found.includes(t)) found.push(t);
  }
  return found;
}

/**
 * Build the flat season folder name.
 * e.g. → "Atrapadas en Bolivia (2025) S01 WEB-DL 1080p"
 */
function buildSeasonFolderName(
  showName: string,
  year: string | undefined,
  season: number,
  source: string,
  resolution: string,
): string {
  let name = showName.trim() || "Serie";
  if (year) name += ` (${year})`;
  name += ` S${String(season).padStart(2, "0")}`;
  if (source.trim()) name += ` ${source.trim()}`;
  if (resolution.trim()) name += ` ${resolution.trim()}`;
  return name;
}

interface AnalysisRowProps {
  result: AnalysisResult;
  suggestion: UploadSuggestion | null;
  isDirectory: boolean;
  tmdbMatch: TmdbMatch | null;
  onDestChange: (path: string, dest: string) => void;
  onFilenameChange: (path: string, filename: string) => void;
  onTmdbChange: (path: string, match: TmdbMatch | null) => void;
  onEpisodePlanChange?: (
    path: string,
    plan: { localPath: string; filename: string }[],
  ) => void;
}

const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  movie: "Película",
  tv: "Serie",
  documentary: "Documental",
};

const MEDIA_TYPE_ICONS: Record<MediaType, React.ReactNode> = {
  movie: <Film size={12} />,
  tv: <Tv size={12} />,
  documentary: <Video size={12} />,
};

export default function AnalysisRow({
  result,
  suggestion,
  isDirectory,
  tmdbMatch,
  onDestChange,
  onFilenameChange,
  onTmdbChange,
  onEpisodePlanChange,
}: AnalysisRowProps) {
  const { path, filename, info, error } = result;

  const [mediaType, setMediaType] = useState<MediaType>(
    suggestion?.media_type ?? "movie",
  );
  const [dest, setDest] = useState(suggestion?.dest ?? "");
  const [showName, setShowName] = useState(
    suggestion?.detected_title ??
      filename.replace(/\.[^.]+$/, "").replace(/[._]/g, " "),
  );
  const [season, setSeason] = useState(suggestion?.detected_season ?? 1);
  const [episode, setEpisode] = useState(suggestion?.detected_episode ?? 1);
  // For TV: is this a full-season/show folder upload or a single episode?
  const [tvUploadMode, setTvUploadMode] = useState<"season" | "episode">(
    isDirectory || suggestion?.detected_episode == null ? "season" : "episode",
  );
  const [rename, setRename] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [showBrowser, setShowBrowser] = useState(false);

  // TV season dir quality fields — used to name the folder and episode files
  const [seasonSource, setSeasonSource] = useState(() =>
    mapDetectedReleaseType(suggestion?.detected_release_type),
  );
  const [seasonResolution, setSeasonResolution] = useState(
    normalizeResolution(info?.resolution ?? suggestion?.detected_resolution),
  );
  const [seasonCodec, setSeasonCodec] = useState(
    info?.codec ?? suggestion?.detected_codec ?? "",
  );
  // HDR / Dolby Vision — combined from ffprobe + filename parser so DV files
  // detected by either source land in the dropdown. Normalised so values like
  // "DOLBYVISION" or "4K" map to canonical dropdown entries.
  const [seasonHdr, setSeasonHdr] = useState(() =>
    mergeHdr(info?.hdr, suggestion?.detected_hdr),
  );
  // TV audio tracks — one entry per physical track (codec + channels + lang)
  type SeasonAudioTrackEntry = {
    codec: string;
    channels: string;
    lang: string;
  };
  const [seasonAudioTracks, setSeasonAudioTracks] = useState<
    SeasonAudioTrackEntry[]
  >(() => {
    const detectedLangs = (
      info?.languages?.length
        ? info.languages
        : (suggestion?.detected_languages ?? [])
    ).map((l) => normalizeLangCode(l));
    if (info?.audio_tracks && info.audio_tracks.length > 0) {
      return info.audio_tracks.map((t, i) => ({
        codec: canonicalAudio(t.codec),
        channels: formatChannels(t.channels),
        lang: normalizeLangCode(t.language ?? detectedLangs[i] ?? ""),
      }));
    }
    return [
      {
        codec: canonicalAudio(suggestion?.detected_audio_codec),
        channels: suggestion?.detected_audio_channels ?? "",
        lang: detectedLangs[0] ?? "",
      },
    ];
  });
  const updateSeasonAudioTrack = (
    idx: number,
    field: keyof SeasonAudioTrackEntry,
    value: string,
  ) => {
    setSeasonAudioTracks((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
    );
  };
  const removeSeasonAudioTrack = (idx: number) => {
    setSeasonAudioTracks((prev) =>
      prev.length <= 1
        ? [{ codec: "", channels: "", lang: "" }]
        : prev.filter((_, i) => i !== idx),
    );
  };
  const addSeasonAudioTrack = () => {
    setSeasonAudioTracks((prev) => [
      ...prev,
      { codec: "", channels: "", lang: "" },
    ]);
  };
  // Tracks whether the user has manually edited the FTP destination field (typing)
  const destTouchedRef = useRef(false);
  // When the user picks a folder via FTP browser for a TV show, store it here so
  // the auto-calc can still append the season folder on top.
  const [tvBaseOverride, setTvBaseOverride] = useState<string | null>(null);
  // tmdbSelected is declared here (before the effects that reference it)
  const [tmdbSelected, setTmdbSelected] = useState<TmdbMatch | null>(tmdbMatch);

  // For TV season directories: list the video files inside for preview.
  const [episodeFiles, setEpisodeFiles] = useState<string[]>([]);
  useEffect(() => {
    if (isDirectory && mediaType === "tv") {
      invoke<string[]>("list_local_video_files", { dir: path })
        .then(setEpisodeFiles)
        .catch(() => setEpisodeFiles([]));
    }
  }, [isDirectory, mediaType, path]);

  // When ffprobe data arrives, fill in quality fields that are still empty
  useEffect(() => {
    if (mediaType !== "tv" || !info) return;
    if (info.resolution && !seasonResolution)
      setSeasonResolution(normalizeResolution(info.resolution));
    if (info.codec && !seasonCodec) setSeasonCodec(info.codec);
    // Merge ffprobe HDR with whatever's already set (parser hint or user pick).
    const merged = mergeHdr(seasonHdr, info.hdr);
    if (merged && merged !== seasonHdr) setSeasonHdr(merged);
    if (info.audio_tracks && info.audio_tracks.length > 0) {
      const detectedLangs = info.languages
        .filter(Boolean)
        .map((x) => normalizeLangCode(x));
      setSeasonAudioTracks(
        info.audio_tracks.map((t, i) => ({
          codec: canonicalAudio(t.codec),
          channels: formatChannels(t.channels),
          lang: normalizeLangCode(t.language ?? detectedLangs[i] ?? ""),
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  // When episode files load, run ffprobe on the first episode to get real metadata.
  // Falls back to filename parsing when ffprobe is unavailable (info === null from parent).
  useEffect(() => {
    if (!isDirectory || mediaType !== "tv" || episodeFiles.length === 0) return;

    const firstEp = episodeFiles[0];

    // Try ffprobe on the first actual episode file
    invoke<LocalMediaInfo>("analyze_local_file", { path: firstEp })
      .then((epInfo) => {
        if (epInfo.resolution && !seasonResolution)
          setSeasonResolution(epInfo.resolution);
        if (epInfo.codec && !seasonCodec) setSeasonCodec(epInfo.codec);
        const mergedHdr = mergeHdr(seasonHdr, epInfo.hdr);
        if (mergedHdr && mergedHdr !== seasonHdr) setSeasonHdr(mergedHdr);
        if (epInfo.audio_tracks && epInfo.audio_tracks.length > 0) {
          const detectedLangs = epInfo.languages
            .filter(Boolean)
            .map((l) => normalizeLangCode(l));
          setSeasonAudioTracks(
            epInfo.audio_tracks.map((t, i) => ({
              codec: canonicalAudio(t.codec),
              channels: formatChannels(t.channels),
              lang: normalizeLangCode(t.language ?? detectedLangs[i] ?? ""),
            })),
          );
        }
      })
      .catch(() => {
        // ffprobe not available — fall back to parsing filenames and folder name
        const folderName = path.split(/[\\/]/).pop() ?? path;
        const fromFolder = parseQualityFromFilename(folderName);
        const first = firstEp.split(/[\\/]/).pop() ?? "";
        const fromEp = parseQualityFromFilename(first);

        if (!seasonSource) setSeasonSource(fromFolder.source || fromEp.source);
        if (!seasonResolution)
          setSeasonResolution(fromFolder.resolution || fromEp.resolution);
        if (!seasonCodec) setSeasonCodec(fromFolder.codec || fromEp.codec);
        const mergedFallback = mergeHdr(
          mergeHdr(seasonHdr, fromFolder.hdr),
          fromEp.hdr,
        );
        if (mergedFallback && mergedFallback !== seasonHdr)
          setSeasonHdr(mergedFallback);
        const fbAudio = fromEp.audio || fromFolder.audio;
        const fbChannels = fromEp.channels || fromFolder.channels;
        if (fbAudio) {
          setSeasonAudioTracks((prev) =>
            prev.length === 1 && !prev[0].codec
              ? [{ ...prev[0], codec: fbAudio, channels: prev[0].channels || fbChannels }]
              : prev,
          );
        }

        let langs = parseLanguagesFromPath(first);
        if (langs.length === 0) {
          for (const fp of episodeFiles.slice(1, 4)) {
            langs = parseLanguagesFromPath(fp.split(/[\\/]/).pop() ?? "");
            if (langs.length > 0) break;
          }
        }
        if (langs.length === 0) langs = parseLanguagesFromPath(folderName);
        if (langs.length > 0) {
          setSeasonAudioTracks((prev) =>
            prev.map((t, i) => ({
              ...t,
              lang: normalizeLangCode(langs[i] ?? t.lang),
            })),
          );
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeFiles]);

  // Auto-compute the flat season destination folder whenever naming fields change
  useEffect(() => {
    if (mediaType !== "tv" || destTouchedRef.current) return;
    const year =
      tmdbSelected?.release_date?.slice(0, 4) ??
      (suggestion?.detected_year
        ? String(suggestion.detected_year)
        : undefined);
    // Prefer: user-picked base (tvBaseOverride) > tv_category_dest > tv_dest
    const tvBase = (
      tvBaseOverride ||
      suggestion?.tv_category_dest ||
      suggestion?.tv_dest ||
      ""
    ).replace(/\/$/, "");
    const folderName = buildSeasonFolderName(
      showName,
      year,
      season,
      seasonSource,
      seasonResolution,
    );
    const newDest = tvBase ? `${tvBase}/${folderName}` : folderName;
    setDest(newDest);
    onDestChange(path, newDest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDirectory,
    mediaType,
    showName,
    season,
    seasonSource,
    seasonResolution,
    tmdbSelected,
    suggestion,
    tvBaseOverride,
  ]);

  // For single TV episode files: auto-build and propagate the renamed filename.
  useEffect(() => {
    if (isDirectory || mediaType !== "tv") return;
    if (rename) {
      onFilenameChange(
        path,
        buildEpisodeFilename(
          showName,
          season,
          episode,
          seasonSource,
          seasonResolution,
          seasonCodec,
          seasonHdr,
          seasonAudioTracks,
          ext,
        ),
      );
    } else {
      onFilenameChange(path, filename);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDirectory,
    mediaType,
    showName,
    season,
    episode,
    seasonSource,
    seasonResolution,
    seasonCodec,
    seasonHdr,
    seasonAudioTracks,
    rename,
  ]);

  // Episode plan: for each video file in the folder, build its renamed filename
  const episodePlan = useMemo(() => {
    if (!isDirectory || mediaType !== "tv") return [];
    return episodeFiles.map((fp, index) => {
      const basename = fp.split(/[\\/]/).pop() ?? fp;
      if (!rename) return { localPath: fp, filename: basename };
      const epExt = basename.includes(".") ? basename.split(".").pop()! : "mkv";
      // Fall back to 1-based positional index when no episode number found in filename
      const epNum = parseEpisodeNum(basename) ?? index + 1;
      return {
        localPath: fp,
        filename: buildEpisodeFilename(
          showName,
          season,
          epNum,
          seasonSource,
          seasonResolution,
          seasonCodec,
          seasonHdr,
          seasonAudioTracks,
          epExt,
        ),
      };
    });
  }, [
    isDirectory,
    mediaType,
    episodeFiles,
    showName,
    season,
    seasonSource,
    seasonResolution,
    seasonCodec,
    seasonHdr,
    seasonAudioTracks,
    rename,
  ]);

  // Propagate episode plan to parent whenever it changes
  useEffect(() => {
    if (isDirectory && mediaType === "tv") {
      onEpisodePlanChange?.(path, episodePlan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodePlan]);

  // TMDB search state
  const [tmdbQuery, setTmdbQuery] = useState(() => {
    const raw =
      suggestion?.detected_title ??
      filename.replace(/\.[^.]+$/, "").replace(/[._]/g, " ");
    return raw
      .normalize("NFC") // macOS stores filenames as NFD; normalise to NFC for TMDB
      .replace(/\s+-\s+/g, " ") // replace " - " with space (keep full title incl. subtitle)
      .replace(/-/g, " ") // remove remaining hyphens
      .replace(/\s{2,}/g, " ") // collapse spaces
      .trim()
      .toLowerCase();
  });
  const [tmdbResults, setTmdbResults] = useState<TmdbMatch[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);
  const [tmdbSearched, setTmdbSearched] = useState(false);
  const [showFixSearch, setShowFixSearch] = useState(false);

  const ext = isDirectory ? "" : (filename.split(".").pop() ?? "mkv");

  const searchTmdb = async () => {
    if (!tmdbQuery.trim()) return;
    setTmdbSearching(true);
    setTmdbSearched(false);
    try {
      const kind: "movie" | "tv" = mediaType === "tv" ? "tv" : "movie";
      const results = await invoke<TmdbMatch[]>("search_tmdb", {
        query: tmdbQuery.trim(),
        mediaType: kind,
        year: suggestion?.detected_year ?? null,
      });
      setTmdbResults(
        results.slice(0, 6).map((r) => ({ ...r, media_type: kind })),
      );
      setTmdbSearched(true);
    } catch {
      setTmdbResults([]);
      setTmdbSearched(true);
    } finally {
      setTmdbSearching(false);
    }
  };

  const selectTmdb = (match: TmdbMatch) => {
    setTmdbSelected(match);
    setTmdbResults([]);
    setShowFixSearch(false);
    onTmdbChange(path, match);
  };

  const clearTmdb = () => {
    setTmdbSelected(null);
    setTmdbResults([]);
    setTmdbSearched(false);
    setShowFixSearch(false);
    onTmdbChange(path, null);
  };

  const handleDestChange = (val: string) => {
    destTouchedRef.current = true;
    setDest(val);
    onDestChange(path, val);
  };

  const handleMediaTypeChange = (t: MediaType) => {
    setMediaType(t);
    setTvBaseOverride(null); // clear any manual FTP pick so auto-dest recalculates
    destTouchedRef.current = false; // allow auto-dest to recalculate for new type
    const baseDest =
      t === "tv" ? (suggestion?.tv_dest ?? "") : (suggestion?.movie_dest ?? "");
    let newDest: string;
    if (t === "tv") {
      const year =
        tmdbSelected?.release_date?.slice(0, 4) ??
        (suggestion?.detected_year
          ? String(suggestion.detected_year)
          : undefined);
      const folderName = buildSeasonFolderName(
        showName,
        year,
        season,
        seasonSource,
        seasonResolution,
      );
      // Prefer tv_category_dest (includes the category subfolder like "Temporadas en emision")
      const tvBase = (suggestion?.tv_category_dest || baseDest || "").replace(
        /\/$/,
        "",
      );
      newDest = tvBase ? `${tvBase}/${folderName}` : folderName;
    } else {
      newDest = baseDest;
    }
    setDest(newDest);
    onDestChange(path, newDest);
  };

  // Called when the FTP dir browser selects a folder.
  // For TV: treat the picked folder as the new tvBase and let auto-calc append
  // the season folder on top. If the user picked a parent folder that doesn't
  // already include the category subfolder (Temporadas en emision / Temporadas
  // Completadas), we inject it automatically so it's always part of the path.
  // ensure_remote_dir in ftp.rs will create any missing segments on upload.
  // For movies/docs: set the destination directly.
  const handleFtpPickerSelect = (p: string) => {
    if (mediaType === "tv") {
      let base = p.replace(/\/$/, "");
      const segments = base.split("/");

      // Find which segment (if any) is the category folder ("Temporadas …").
      const catIdx = segments.findIndex((seg) =>
        foldForSearch(seg).includes("temporad"),
      );

      if (catIdx === -1) {
        // No category folder in path yet — inject it, then let auto-calc
        // append the show/season folder.
        const catFromSuggestion = suggestion?.tv_category_dest
          ? (suggestion.tv_category_dest
              .trim()
              .replace(/\/$/, "")
              .split("/")
              .pop() ?? "")
          : "";

        const isFullSeason = isDirectory || tvUploadMode === "season";
        const catName =
          catFromSuggestion ||
          (isFullSeason ? "Temporadas Completadas" : "Temporadas en emision");

        base = `${base}/${catName}`;
        setTvBaseOverride(base);
        destTouchedRef.current = false; // let auto-calc append show folder
      } else if (catIdx === segments.length - 1) {
        // User picked the category folder itself — use as tvBase and let
        // auto-calc append the show/season folder.
        setTvBaseOverride(base);
        destTouchedRef.current = false;
      } else {
        // User picked a folder INSIDE the category (show-level or deeper).
        // Use it directly as the final destination — don't append anything.
        handleDestChange(base);
      }
    } else {
      handleDestChange(p);
    }
    setShowBrowser(false);
  };

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        overflow: "visible",
        position: "relative",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {mediaType === "tv" ? (
          <Tv size={14} color="var(--color-teal)" />
        ) : mediaType === "documentary" ? (
          <Video size={14} color="var(--color-warning)" />
        ) : (
          <Film size={14} color="var(--color-primary)" />
        )}
        <span
          style={{
            flex: 1,
            fontSize: 12,
            color: "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={filename}
        >
          {filename}
        </span>

        {!info && !error && (
          <Loader2
            size={13}
            color="var(--color-primary)"
            style={{ animation: "spin 1s linear infinite" }}
          />
        )}
        {error && <AlertTriangle size={13} color="var(--color-danger)" />}

        {expanded ? (
          <ChevronUp size={14} color="var(--color-text-muted)" />
        ) : (
          <ChevronDown size={14} color="var(--color-text-muted)" />
        )}
      </div>

      {expanded && (
        <div
          style={{
            padding: "0 14px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Error */}
          {error && (
            <div
              style={{
                background: "rgba(224,85,85,0.1)",
                border: "1px solid rgba(224,85,85,0.3)",
                borderRadius: "var(--radius)",
                padding: "8px 12px",
                fontSize: 12,
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          )}

          {/* TMDB match */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-text-muted)",
                letterSpacing: "0.04em",
                marginBottom: 6,
              }}
            >
              ENLACE TMDB
            </div>

            {/* Auto-matched result (or cleared) */}
            {tmdbSelected ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(61,176,126,0.08)",
                  border: "1px solid rgba(61,176,126,0.35)",
                  borderRadius: "var(--radius)",
                  padding: "8px 10px",
                }}
              >
                {tmdbSelected.poster_path && (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={`${TMDB_IMG}${tmdbSelected.poster_path}`}
                    alt=""
                    style={{
                      width: 28,
                      height: 42,
                      borderRadius: 3,
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tmdbSelected.title}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--color-text-muted)" }}
                  >
                    {tmdbSelected.release_date?.slice(0, 4) ?? "—"}
                    {tmdbSelected.vote_average != null && (
                      <span
                        style={{
                          marginLeft: 8,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <Star size={10} color="var(--color-warning)" />
                        {tmdbSelected.vote_average.toFixed(1)}
                      </span>
                    )}
                    <span style={{ marginLeft: 8, opacity: 0.6 }}>
                      ID: {tmdbSelected.id}
                    </span>
                  </div>
                </div>
                <CheckCircle
                  size={15}
                  color="var(--color-success)"
                  style={{ flexShrink: 0 }}
                />
                {/* Fix match button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFixSearch((v) => !v);
                  }}
                  style={{
                    background: showFixSearch
                      ? "rgba(124,110,247,0.15)"
                      : "var(--color-surface-2)",
                    border: `1px solid ${showFixSearch ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    color: showFixSearch
                      ? "var(--color-primary)"
                      : "var(--color-text-muted)",
                    fontSize: 11,
                    padding: "3px 8px",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                  title="Buscar coincidencia diferente"
                >
                  Cambiar
                </button>
                <button
                  onClick={clearTmdb}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: "0 2px",
                    flexShrink: 0,
                  }}
                  title="Quitar enlace"
                >
                  ×
                </button>
              </div>
            ) : (
              /* No match state */
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(200,147,42,0.08)",
                  border: "1px solid rgba(200,147,42,0.3)",
                  borderRadius: "var(--radius)",
                  padding: "8px 10px",
                }}
              >
                <AlertTriangle
                  size={13}
                  color="var(--color-warning)"
                  style={{ flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-warning)",
                    flex: 1,
                  }}
                >
                  Sin coincidencia automática en TMDB
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFixSearch((v) => !v);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: showFixSearch
                      ? "rgba(124,110,247,0.15)"
                      : "var(--color-surface-2)",
                    border: `1px solid ${showFixSearch ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    color: showFixSearch
                      ? "var(--color-primary)"
                      : "var(--color-text-muted)",
                    fontSize: 11,
                    padding: "3px 8px",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                >
                  <Search size={11} />
                  Buscar manualmente
                </button>
              </div>
            )}

            {/* Fix-match search panel — shown when Cambiar / Buscar manualmente is active */}
            {showFixSearch && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={tmdbQuery}
                    onChange={(e) => setTmdbQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchTmdb()}
                    placeholder="Buscar en TMDB..."
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={searchTmdb}
                    disabled={tmdbSearching}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      background: "var(--color-primary)",
                      border: "none",
                      borderRadius: "var(--radius)",
                      color: "#fff",
                      fontSize: 12,
                      padding: "5px 12px",
                      cursor: tmdbSearching ? "not-allowed" : "pointer",
                      opacity: tmdbSearching ? 0.6 : 1,
                      flexShrink: 0,
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    {tmdbSearching ? (
                      <Loader2
                        size={12}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                    ) : (
                      <Search size={12} />
                    )}
                    Buscar
                  </button>
                </div>

                {tmdbSearched && tmdbResults.length === 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      padding: "4px 0",
                    }}
                  >
                    Sin resultados.
                  </div>
                )}

                {tmdbResults.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      maxHeight: 240,
                      overflowY: "auto",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius)",
                      background: "var(--color-surface-2)",
                    }}
                  >
                    {tmdbResults.map((r) => (
                      <TmdbResultRow
                        key={r.id}
                        match={r}
                        onSelect={selectTmdb}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Media type selector */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-text-muted)",
                letterSpacing: "0.04em",
                marginBottom: 6,
              }}
            >
              TIPO DE CONTENIDO
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["movie", "tv", "documentary"] as MediaType[]).map((t) => {
                const active = mediaType === t;
                return (
                  <button
                    key={t}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMediaTypeChange(t);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 10px",
                      borderRadius: "var(--radius-full)",
                      border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: active
                        ? "rgba(124,110,247,0.15)"
                        : "var(--color-surface-2)",
                      color: active
                        ? "var(--color-primary)"
                        : "var(--color-text-muted)",
                      fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {MEDIA_TYPE_ICONS[t]}
                    {MEDIA_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Analysis badges */}
          {info && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {info.resolution && <Badge label={info.resolution} />}
              {info.codec && <Badge label={info.codec} />}
              {info.hdr && (
                <Badge
                  label={
                    hdrLabel(info.hdr) +
                    (info.dv_profile ? ` (perfil ${info.dv_profile})` : "")
                  }
                  color="var(--color-warning)"
                />
              )}
              {info.dv_profile === 5 && (
                <Badge
                  label="Sin capa HDR10: colores incorrectos sin Dolby Vision"
                  color="var(--color-danger)"
                />
              )}
              {info.audio_tracks.length > 0 && (
                <Badge
                  label={[
                    audioLabel(info.audio_tracks[0].codec),
                    formatChannels(info.audio_tracks[0].channels),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              )}
              {info.languages.length > 0 && (
                <Badge label={formatLanguages(info.languages)} />
              )}
              {info.duration_secs != null && (
                <Badge label={formatDuration(info.duration_secs)} />
              )}
              {info.size_bytes > 0 && (
                <Badge label={formatBytes(info.size_bytes)} />
              )}
            </div>
          )}

          {/* TV-specific fields */}
          {mediaType === "tv" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.04em",
                }}
              >
                DATOS DE SERIE
              </div>

              {/* Upload mode pills — only for single-file uploads, not season dirs */}
              {!isDirectory && (
                <div style={{ display: "flex", gap: 6 }}>
                  {(["season", "episode"] as const).map((mode) => {
                    const active = tvUploadMode === mode;
                    const label =
                      mode === "season"
                        ? "Temporada completa"
                        : "Episodio individual";
                    return (
                      <button
                        key={mode}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTvUploadMode(mode);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "4px 10px",
                          borderRadius: "var(--radius-full)",
                          border: `1px solid ${active ? "var(--color-teal)" : "var(--color-border)"}`,
                          background: active
                            ? "rgba(20,184,166,0.12)"
                            : "var(--color-surface-2)",
                          color: active
                            ? "var(--color-teal)"
                            : "var(--color-text-muted)",
                          fontSize: 11,
                          fontWeight: active ? 600 : 400,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {mode === "season" ? (
                          <Tv size={11} />
                        ) : (
                          <Film size={11} />
                        )}
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Rename toggle — inside TV section, before show name */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 13, color: "var(--color-text)" }}>
                  Renombrar {isDirectory ? "archivos" : "archivo"}
                </span>
                <Toggle label={isDirectory ? "Renombrar archivos" : "Renombrar archivo"} checked={rename} onChange={setRename} />
              </div>

              {/* Show name + season */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    !isDirectory && tvUploadMode === "episode"
                      ? "1fr 70px 70px"
                      : "1fr 70px",
                  gap: "8px 10px",
                }}
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 3 }}
                >
                  <label
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-muted)",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                    }}
                  >
                    NOMBRE DE LA SERIE
                  </label>
                  <input
                    value={showName}
                    onChange={(e) => setShowName(e.target.value)}
                    placeholder="Breaking Bad"
                    style={inputStyle}
                  />
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 3 }}
                >
                  <label
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-muted)",
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                    }}
                  >
                    TEMPORADA
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={season}
                    onChange={(e) => setSeason(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
                {!isDirectory && tvUploadMode === "episode" && (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 3 }}
                  >
                    <label
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-muted)",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                      }}
                    >
                      EPISODIO
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={episode}
                      onChange={(e) => setEpisode(Number(e.target.value))}
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>

              {/* Quality selects — used to build flat folder name + renamed filenames for all TV content */}
              {mediaType === "tv" && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr",
                      gap: "8px 10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-muted)",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                        }}
                      >
                        FUENTE
                      </label>
                      <select
                        value={seasonSource}
                        onChange={(e) => setSeasonSource(e.target.value)}
                        style={formSelectCompact}
                      >
                        {renderSeasonOptions(SEASON_SOURCES, seasonSource)}
                      </select>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-muted)",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                        }}
                      >
                        RESOLUCIÓN
                      </label>
                      <select
                        value={seasonResolution}
                        onChange={(e) => setSeasonResolution(e.target.value)}
                        style={formSelectCompact}
                      >
                        {renderSeasonOptions(SEASON_RESOLUTIONS, seasonResolution)}
                      </select>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-muted)",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                        }}
                      >
                        CÓDEC
                      </label>
                      <select
                        value={seasonCodec}
                        onChange={(e) => setSeasonCodec(e.target.value)}
                        style={formSelectCompact}
                      >
                        {renderSeasonOptions(SEASON_CODECS, seasonCodec)}
                      </select>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 10,
                          color: "var(--color-text-muted)",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                        }}
                      >
                        HDR
                      </label>
                      <select
                        value={seasonHdr}
                        onChange={(e) => setSeasonHdr(e.target.value)}
                        style={formSelectCompact}
                      >
                        {HDR_OPTIONS.map((h) => (
                          <option key={h.value} value={h.value}>
                            {h.label}
                          </option>
                        ))}
                        {seasonHdr &&
                          !HDR_OPTIONS.some((h) => h.value === seasonHdr) && (
                            <option value={seasonHdr}>{seasonHdr}</option>
                          )}
                      </select>
                    </div>
                  </div>
                  {/* Audio tracks — one row per physical track (codec + channels + lang) */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-muted)",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                      }}
                    >
                      PISTAS DE AUDIO
                    </div>
                    {seasonAudioTracks.map((track, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 60px 26px",
                          gap: "0 6px",
                          alignItems: "center",
                        }}
                      >
                        <select
                          value={track.lang}
                          onChange={(e) =>
                            updateSeasonAudioTrack(idx, "lang", e.target.value)
                          }
                          style={formSelectCompact}
                        >
                          <option value="">—</option>
                          {LANG_OPTIONS.map((o) => (
                            <option key={o.code} value={o.code}>
                              {o.code} – {o.label}
                            </option>
                          ))}
                          {/* Keep unknown codes (e.g. raw ffprobe tags not in the list) */}
                          {track.lang &&
                            !LANG_OPTIONS.some(
                              (o) => o.code === track.lang,
                            ) && (
                              <option value={track.lang}>{track.lang}</option>
                            )}
                        </select>
                        <select
                          value={track.codec}
                          onChange={(e) =>
                            updateSeasonAudioTrack(idx, "codec", e.target.value)
                          }
                          style={formSelectCompact}
                        >
                          {renderSeasonOptions(SEASON_AUDIO_CODECS, track.codec)}
                        </select>
                        <input
                          value={track.channels}
                          onChange={(e) =>
                            updateSeasonAudioTrack(
                              idx,
                              "channels",
                              e.target.value,
                            )
                          }
                          placeholder="5.1"
                          style={formInputCompact}
                        />
                        <button
                          onClick={() => removeSeasonAudioTrack(idx)}
                          title="Eliminar pista"
                          style={{
                            background: "none",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius)",
                            color: "var(--color-text-muted)",
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                            padding: "0 5px",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addSeasonAudioTrack}
                      style={{
                        background: "none",
                        border: "1px dashed var(--color-border)",
                        borderRadius: "var(--radius)",
                        color: "var(--color-text-muted)",
                        cursor: "pointer",
                        fontSize: 11,
                        padding: "4px 10px",
                        textAlign: "left",
                        width: "fit-content",
                      }}
                    >
                      + Añadir pista
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* FTP destination */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-text-muted)",
                letterSpacing: "0.04em",
                marginBottom: 4,
              }}
            >
              DESTINO FTP
            </div>
            <div style={{ display: "flex", gap: 6, position: "relative" }}>
              <datalist
                id={`dest-opts-${result.path.replace(/[^a-z0-9]/gi, "_")}`}
              >
                {(suggestion?.folder_options ?? []).map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
              <input
                value={dest}
                onChange={(e) => handleDestChange(e.target.value)}
                list={`dest-opts-${result.path.replace(/[^a-z0-9]/gi, "_")}`}
                placeholder="/Compartida/Series HD 1080p"
                style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBrowser((v) => !v);
                }}
                title="Explorar carpetas FTP"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  background: showBrowser
                    ? "rgba(124,110,247,0.15)"
                    : "var(--color-surface-2)",
                  border: `1px solid ${showBrowser ? "var(--color-primary)" : "var(--color-border)"}`,
                  borderRadius: "var(--radius)",
                  color: showBrowser
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
                  fontSize: 12,
                  padding: "5px 10px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                <FolderSearch size={13} />
                Explorar
              </button>

              {showBrowser && (
                <FtpDirPicker
                  initialPath={(() => {
                    // For TV: open at the category subfolder level (e.g. Temporadas en emision)
                    // so the user can pick the correct base folder.
                    if (mediaType === "tv") {
                      const base =
                        tvBaseOverride ||
                        suggestion?.tv_category_dest ||
                        suggestion?.tv_dest ||
                        "";
                      return base || dest || "/";
                    }
                    // For movies/docs: open at the parent of the configured dest.
                    const base =
                      suggestion?.movie_dest || suggestion?.tv_dest || "";
                    if (base) {
                      const parent = base.split("/").slice(0, -1).join("/");
                      return parent || "/";
                    }
                    return dest || "/";
                  })()}
                  onSelect={handleFtpPickerSelect}
                  onClose={() => setShowBrowser(false)}
                />
              )}
            </div>
          </div>

          {/* TV season episode plan — shows the flat upload structure with renamed filenames */}
          {mediaType === "tv" && (
            <div
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius)",
                padding: "8px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "var(--color-text-muted)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                }}
              >
                {isDirectory
                  ? `PLAN DE SUBIDA — ${episodePlan.length} EPISODIO${episodePlan.length !== 1 ? "S" : ""} · CARPETA PLANA`
                  : "PLAN DE SUBIDA — 1 EPISODIO"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11 }}>
                {dest && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      color: "var(--color-text-muted)",
                      marginBottom: 4,
                      wordBreak: "break-all",
                    }}
                  >
                    <FolderOpen
                      size={12}
                      color="var(--color-warning)"
                      style={{ flexShrink: 0 }}
                    />
                    <span>{dest.endsWith("/") ? dest : dest + "/"}</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    maxHeight: 180,
                    overflowY: "auto",
                    paddingLeft: 4,
                  }}
                >
                  {isDirectory ? (
                    <>
                      {episodePlan.length === 0 &&
                        episodeFiles.length === 0 && (
                          <span style={{ color: "var(--color-text-muted)" }}>
                            Cargando archivos…
                          </span>
                        )}
                      {episodePlan.length === 0 && episodeFiles.length > 0 && (
                        <span style={{ color: "var(--color-text-muted)" }}>
                          Sin archivos de vídeo encontrados.
                        </span>
                      )}
                      {episodePlan.map((ep, idx) => (
                        <div
                          key={ep.localPath}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            color: "var(--color-text)",
                          }}
                        >
                          <span
                            style={{
                              color: "var(--color-border)",
                              flexShrink: 0,
                            }}
                          >
                            {idx === episodePlan.length - 1 ? "└──" : "├──"}
                          </span>
                          <FileVideo
                            size={11}
                            color="var(--color-primary)"
                            style={{ flexShrink: 0 }}
                          />
                          <span style={{ wordBreak: "break-all" }}>
                            {ep.filename}
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--color-text)",
                      }}
                    >
                      <span
                        style={{ color: "var(--color-border)", flexShrink: 0 }}
                      >
                        └──
                      </span>
                      <FileVideo
                        size={11}
                        color="var(--color-primary)"
                        style={{ flexShrink: 0 }}
                      />
                      <span style={{ wordBreak: "break-all" }}>
                        {rename
                          ? buildEpisodeFilename(
                              showName,
                              season,
                              episode,
                              seasonSource,
                              seasonResolution,
                              seasonCodec,
                              seasonHdr,
                              seasonAudioTracks,
                              ext,
                            )
                          : filename}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Rename toggle — for non-TV single files only; TV has it inside the TV section */}
          {!isDirectory && mediaType !== "tv" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--color-text)" }}>
                Renombrar archivo
              </span>
              <Toggle label="Renombrar archivo" checked={rename} onChange={setRename} />
            </div>
          )}

          {/* Full path preview — for non-TV content only (TV uses the plan panel above) */}
          {dest &&
            mediaType !== "tv" &&
            ((!rename && !isDirectory) || isDirectory) && (
              <div
                style={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                  padding: "8px 12px",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    color: "var(--color-text-muted)",
                  }}
                >
                  <FolderOpen size={12} color="var(--color-warning)" />
                  <span>{dest.endsWith("/") ? dest : dest + "/"}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    color: "var(--color-text)",
                    marginTop: 3,
                    paddingLeft: 4,
                  }}
                >
                  <span style={{ color: "var(--color-border)" }}>└──</span>
                  {isDirectory ? (
                    <Folder size={12} color="var(--color-teal)" />
                  ) : (
                    <FileVideo size={12} color="var(--color-primary)" />
                  )}
                  <span style={{ wordBreak: "break-all" }}>{filename}</span>
                </div>
              </div>
            )}

          {/* FilenameBuilder — always shown for non-TV files; rename toggle controls filename output only */}
          {!isDirectory && mediaType !== "tv" && (
            <FilenameBuilder
              info={info ?? null}
              mediaType={mediaType}
              defaultTitle={
                suggestion?.detected_title ??
                filename.replace(/\.[^.]+$/, "").replace(/[._]/g, " ")
              }
              defaultYear={suggestion?.detected_year ?? undefined}
              defaultReleaseType={
                suggestion?.detected_release_type ?? undefined
              }
              extension={ext}
              dest={dest || undefined}
              fallback={{
                resolution: suggestion?.detected_resolution,
                codec: suggestion?.detected_codec,
                hdr: suggestion?.detected_hdr,
                audio: suggestion?.detected_audio_codec,
                channels: suggestion?.detected_audio_channels,
              }}
              onChange={(newName) => onFilenameChange(path, newName)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-full)",
        padding: "2px 8px",
        fontSize: 11,
        color: color ?? "var(--color-text)",
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-surface-2)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius)",
  color: "var(--color-text)",
  fontSize: 12,
  padding: "6px 10px",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

// ─── TmdbResultRow ────────────────────────────────────────────────────────────
function TmdbResultRow({
  match,
  onSelect,
}: {
  match: TmdbMatch;
  onSelect: (m: TmdbMatch) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(match)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        cursor: "pointer",
        background: hovered ? "var(--color-surface)" : "transparent",
        transition: "background 0.15s ease",
      }}
    >
      {match.poster_path ? (
        <img
          src={`${TMDB_IMG}${match.poster_path}`}
          alt=""
          style={{
            width: 28,
            height: 42,
            borderRadius: 3,
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 28,
            height: 42,
            borderRadius: 3,
            background: "var(--color-border)",
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {match.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{match.release_date?.slice(0, 4) ?? "—"}</span>
          {match.vote_average != null && (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              <Star size={10} color="var(--color-warning)" />
              {match.vote_average.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
