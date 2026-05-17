// Shared release-quality enums and helpers used by FilenameBuilder, AnalysisRow
// and UploadPrepareModal. Keep this the single source of truth for what
// resolutions / sources / codecs / audio / HDR variants the upload form
// supports — and how to normalise raw ffprobe / filename-parser strings into
// the canonical dropdown values.

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

export const AUDIO_CODECS = [
  "",
  "TrueHD Atmos",
  "TrueHD",
  "DTS-HD MA",
  "DTS:X",
  "DTS-HD HRA",
  "DTS",
  "EAC3 + Atmos",
  "EAC3",
  "AC3",
  "AAC",
  "FLAC",
  "MP3",
];

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
  { value: "HDR+DV", label: "HDR + Dolby Vision" },
  { value: "HDR10+DV", label: "HDR10 + Dolby Vision" },
];

/** Normalise a raw HDR token (from ffprobe or filename parser) into a
 *  canonical HDR_OPTIONS value. Returns "" when nothing matches. */
export function normalizeHdr(raw: string | null | undefined): string {
  if (!raw) return "";
  const u = raw.trim().toUpperCase().replace(/[._\s-]+/g, "");
  if (u === "DV" || u === "DOLBYVISION") return "DV";
  if (u === "HDR10DV" || u === "HDR10PLUSDV") return "HDR10+DV";
  if (u === "HDRDV") return "HDR+DV";
  if (u === "HDR10PLUS" || u === "HDR10+") return "HDR10+";
  if (u === "HDR10") return "HDR10";
  if (u === "HLG") return "HLG";
  if (u === "HDR") return "HDR";
  if (u === "SDR") return "SDR";
  // Allow already-combined tokens with a "+" preserved
  if (raw === "HDR10+DV" || raw === "HDR+DV") return raw;
  return "";
}

/** Combine two HDR sources (e.g. ffprobe + filename parser) into one
 *  canonical token. DV from either side is preserved; the strongest base
 *  signal (HDR10+ > HDR10 > HLG > HDR > SDR) wins. */
export function mergeHdr(
  a: string | null | undefined,
  b: string | null | undefined,
): string {
  const tokens = new Set<string>();
  for (const raw of [a, b]) {
    const n = normalizeHdr(raw);
    if (!n) continue;
    if (n.includes("DV")) tokens.add("DV");
    const base = n.replace("+DV", "").replace(/^DV$/, "");
    if (base) tokens.add(base);
  }
  const hasDV = tokens.has("DV");
  let base = "";
  if (tokens.has("HDR10+")) base = "HDR10+";
  else if (tokens.has("HDR10")) base = "HDR10";
  else if (tokens.has("HLG")) base = "HLG";
  else if (tokens.has("HDR")) base = "HDR";
  else if (tokens.has("SDR")) base = "SDR";

  if (hasDV) {
    if (base === "HDR10" || base === "HDR10+") return "HDR10+DV";
    if (base === "HDR") return "HDR+DV";
    return "DV";
  }
  return base;
}

/** The HDR label to embed in the metadata tag list (empty when DV-only). */
export function hdrFilenameToken(h: string): string {
  if (!h || h === "DV") return "";
  if (h === "HDR+DV") return "HDR";
  if (h === "HDR10+DV") return "HDR10";
  return h;
}

/** Whether the HDR value should add a "[Dolby Vision]" bracket / "DV" token. */
export function isDV(h: string): boolean {
  return h === "DV" || h === "HDR+DV" || h === "HDR10+DV";
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
export function formatChannels(n: number | null | undefined): string {
  if (!n) return "";
  if (n <= 2) return `${n}.0`;
  if (n === 6) return "5.1";
  if (n === 8) return "7.1";
  return `${n}.0`;
}

export interface ParsedQuality {
  source: string;
  resolution: string;
  codec: string;
  hdr: string;
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
  const hdrRe = /\b(DOLBY[\s._-]?VISION|DV|HDR10\+|HDR10|HLG|HDR|SDR)\b/g;
  const hdrTokens: string[] = [];
  for (const m of u.matchAll(hdrRe)) hdrTokens.push(m[1]);
  let hdr = "";
  for (const t of hdrTokens) hdr = mergeHdr(hdr, t);

  return { source, resolution, codec, hdr };
}
