// Shared release-quality enums and helpers used by FilenameBuilder, AnalysisRow
// and UploadPrepareModal. Keep this the single source of truth for what
// resolutions / sources / codecs / audio / HDR variants the upload form
// supports — and how to normalise raw ffprobe / filename-parser strings into
// the canonical dropdown values.

import {
  AUDIO_LABELS,
  canonicalAudio,
  canonicalHdr,
  formatChannels as formatChannelsShared,
  mergeHdrValues,
  parseHdr,
} from "../../utils/techTags";

export const SOURCE_OPTIONS = [
  "",
  "WEB-DL",
  "WEB-DL Micro",
  "WEBRip",
  "BDREMUX",
  "BDRip",
  "BluRay",
  "HDTV",
  "REMUX",
];

export const RESOLUTIONS = ["", "2160p", "1080p", "720p", "480p"];

export const CODECS = ["", "HEVC", "AVC", "AV1", "VP9", "MPEG2"];

// Canonical audio labels (shared with the Rust parser and ffprobe analysis).
export const AUDIO_CODECS: string[] = ["", ...AUDIO_LABELS.filter((a) => a !== "Atmos")];

export interface HdrOption {
  value: string;
  label: string;
}

// Canonical HDR dropdown values. `value` is what we store on the upload item
// and feed back into the filename builder; `label` is the human-friendly text.
export const HDR_OPTIONS: HdrOption[] = [
  { value: "", label: "—" },
  { value: "SDR", label: "SDR" },
  { value: "HDR", label: "HDR" },
  { value: "HDR10", label: "HDR10" },
  { value: "HDR10+", label: "HDR10+" },
  { value: "HLG", label: "HLG" },
  { value: "DV", label: "Dolby Vision" },
  { value: "DV+HDR", label: "Dolby Vision + HDR" },
  { value: "DV+HDR10", label: "Dolby Vision + HDR10" },
  { value: "DV+HDR10+", label: "Dolby Vision + HDR10+" },
  { value: "DV+HLG", label: "Dolby Vision + HLG" },
];

/** Normalise a raw HDR token (from ffprobe or filename parser, including the
 *  legacy "HDR10+DV" spelling) into a canonical HDR_OPTIONS value. */
export function normalizeHdr(raw: string | null | undefined): string {
  return canonicalHdr(raw);
}

/** Combine two HDR sources (e.g. ffprobe + filename parser) into one
 *  canonical token. DV from either side is preserved; the strongest base
 *  signal (HDR10+ > HDR10 > HLG > HDR > SDR) wins. */
export function mergeHdr(
  a: string | null | undefined,
  b: string | null | undefined,
): string {
  return mergeHdrValues(a, b);
}

/** The HDR label to embed in the metadata tag list (empty when DV-only). */
export function hdrFilenameToken(h: string): string {
  const { dv, base } = parseHdr(h);
  if (dv && base === "SDR") return "";
  return base;
}

/** Whether the HDR value should add a "[Dolby Vision]" bracket / "DV" token. */
export function isDV(h: string): boolean {
  return parseHdr(h).dv;
}

/** Map any release-type string (BDREMUX, BD REMUX, REMUX, WEBDL, BRRIP…) to
 *  a canonical SOURCE_OPTIONS value. Returns "" when unknown. */
export function mapReleaseType(rt: string | null | undefined): string {
  if (!rt) return "";
  const r = rt.toUpperCase();
  if (r === "BDREMUX" || r === "BD REMUX" || r === "REMUX") return "BDREMUX";
  if (r === "BDRIP" || r === "BRRIP") return "BDRip";
  if (r === "BLURAY") return "BluRay";
  if (r === "WEB-DL" || r === "WEBDL") return "WEB-DL";
  if (r === "WEBRIP") return "WEBRip";
  if (r === "HDTV") return "HDTV";
  return "";
}

/** Normalise any resolution string ("4K", "uhd", "2160P", "1080i"…) to one of
 *  the canonical RESOLUTIONS values. Returns "" when unknown. */
export function normalizeResolution(raw: string | null | undefined): string {
  if (!raw) return "";
  const u = raw.trim().toUpperCase();
  if (u === "2160P" || u === "4K" || u === "UHD") return "2160p";
  if (u === "1080P" || u === "1080I") return "1080p";
  if (u === "720P" || u === "720I") return "720p";
  if (u === "480P") return "480p";
  const lower = raw.toLowerCase();
  if (RESOLUTIONS.includes(lower)) return lower;
  return "";
}

/** Channel count → display string (6 → "5.1", 8 → "7.1", 2 → "2.0"). */
export const formatChannels = formatChannelsShared;

export interface ParsedQuality {
  source: string;
  resolution: string;
  codec: string;
  hdr: string;
  audio: string;
  channels: string;
}

/** Parse source / resolution / codec / HDR from a media filename or folder
 *  path. Used both as a fallback when ffprobe is unavailable and to fill in
 *  values that ffprobe cannot detect (e.g. release source). */
export function parseQualityFromFilename(name: string): ParsedQuality {
  const u = name.toUpperCase();

  let resolution = "";
  if (/\b(2160P|4K|UHD)\b/.test(u)) resolution = "2160p";
  else if (/\b(1080P|1080I)\b/.test(u)) resolution = "1080p";
  else if (/\b720P\b/.test(u)) resolution = "720p";
  else if (/\b480P\b/.test(u)) resolution = "480p";

  let codec = "";
  if (/\bHEVC\b|\bX265\b|\bH\.?265\b/.test(u)) codec = "HEVC";
  else if (/\bAVC\b|\bX264\b|\bH\.?264\b/.test(u)) codec = "AVC";
  else codec = CODECS.find((c) => c && u.includes(c.toUpperCase())) ?? "";

  let source = "";
  if (/BDREMUX|BD[\s._-]?REMUX/.test(u)) source = "BDREMUX";
  else if (/BDRIP|BRRIP/.test(u)) source = "BDRip";
  else if (/BLURAY|BLU-RAY/.test(u)) source = "BluRay";
  else if (/WEB[\s._-]?DL/.test(u)) source = "WEB-DL";
  else if (/WEBRIP/.test(u)) source = "WEBRip";
  else if (/HDTV/.test(u)) source = "HDTV";
  else if (/REMUX/.test(u)) source = "REMUX";

  // HDR — scan every match so combined HDR10 + DV files are detected.
  // No trailing \b after "HDR10+": a word boundary after "+" only exists
  // when a letter follows, so "HDR10+.DV" used to read as plain HDR10.
  const hdrRe =
    /\b(HDR10\+|HDR10[\s._-]?PLUS\b|(?:DOLBY[\s._-]?VISION|DOVI|DV|HDR10|HLG|HDR|SDR)\b)/g;
  let hdr = "";
  for (const m of u.matchAll(hdrRe)) hdr = mergeHdr(hdr, m[1]);

  // Audio — best track wins (TrueHD Atmos > DTS:X > DTS-HD MA > DD+ Atmos …).
  const atmos = /\bATMOS\b|\bDDPA\d/.test(u);
  let audio = "";
  if (/\bTRUE[\s.-]?HD/.test(u)) audio = atmos ? "TrueHD Atmos" : "TrueHD";
  else if (/\bDTS[\s.:-]?X\b/.test(u)) audio = "DTS:X";
  else if (/\bDTS[\s.-]?(HD[\s.-]?)?MA\b/.test(u)) audio = "DTS-HD MA";
  else if (/\b(E-?AC-?3|DDPA?\d|DDPA?\b|DD\+)/.test(u))
    audio = atmos ? "EAC3 Atmos" : "EAC3";
  else if (/\bDTS[\s.-]?HD[\s.-]?HRA?\b/.test(u)) audio = "DTS-HD HRA";
  else if (/\bDTS[\s.-]?HD\b/.test(u)) audio = "DTS-HD";
  else if (/\bDTS(\d|\b)/.test(u)) audio = "DTS";
  else if (/\bFLAC(\d|\b)/.test(u)) audio = "FLAC";
  else if (/\bL?PCM(\d|\b)/.test(u)) audio = "PCM";
  else if (/\b(AC-?3|DD)(\d|\b)/.test(u)) audio = "AC3";
  else if (/\bAAC(\d|\b)/.test(u)) audio = "AAC";
  else if (atmos) audio = "Atmos";
  audio = canonicalAudio(audio);

  const ch = u.match(
    /\b(?:TRUE[\s.-]?HD|DTS(?:[\s.:-]?(?:HD|X))?|DDPA?|DD\+|DD|E-?AC-?3|AC-?3|AAC|FLAC|OPUS|L?PCM|ATMOS)(?:[\s.-]?(?:MA|HRA|ATMOS))*[\s.-]?([1-9])[\s.]([01])\b/,
  );
  const channels = ch ? `${ch[1]}.${ch[2]}` : "";

  return { source, resolution, codec, hdr, audio, channels };
}

/** Quality values the user picked in the upload form dropdowns. "" means the
 *  user left (or set) that field empty. */
export interface QualityChoice {
  resolution: string;
  codec: string;
  hdr: string;
  audioCodec: string;
}

/** Metadata sent with `queue_upload` (shown in the upload list and the
 *  Telegram card). */
export interface QueuedQuality {
  resolution: string | null;
  codec: string | null;
  hdr: string | null;
  audioCodec: string | null;
}

/** What the form picked wins over what ffprobe / the filename parser
 *  detected: the dropdowns are seeded from detection, so a different value
 *  there is a deliberate correction. Without a form choice (the row never
 *  rendered) the detected values are used as before. */
export function resolveQueuedQuality(
  choice: QualityChoice | null | undefined,
  detected: QueuedQuality,
): QueuedQuality {
  if (!choice) return detected;
  const pick = (v: string) => v.trim() || null;
  return {
    resolution: pick(choice.resolution),
    codec: pick(choice.codec),
    hdr: pick(choice.hdr),
    audioCodec: pick(canonicalAudio(choice.audioCodec)),
  };
}

/**
 * "{tmdb-12345}" — the Plex-style id tag BoxTeam writes into uploaded names
 * so indexing fetches that exact TMDB entry instead of searching by title
 * (src-tauri/src/parser.rs reads it back). Empty when there is no valid id.
 */
export function tmdbIdTag(tmdbId: number | null | undefined): string {
  return tmdbId != null && Number.isInteger(tmdbId) && tmdbId > 0
    ? `{tmdb-${tmdbId}}`
    : "";
}

/** `name` followed by its TMDB id tag, space-separated; unchanged without an id. */
export function withTmdbIdTag(
  name: string,
  tmdbId: number | null | undefined,
): string {
  const tag = tmdbIdTag(tmdbId);
  return tag && name ? `${name} ${tag}` : name;
}
