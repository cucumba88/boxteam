// Single place that understands the HDR and audio labels produced by the Rust
// side (filename parser in parser.rs and ffprobe analysis in analysis.rs) and
// turns them into what the UI shows, filters on and writes into filenames.
//
// Stored HDR values:
//   "DV", "DV+HDR10", "DV+HDR10+", "DV+HLG", "DV+HDR", "HDR10+", "HDR10",
//   "HLG", "HDR", "SDR"
// plus the pre-v0.16 spellings "HDR10+DV" (DV + HDR10 *or* HDR10+, the
// ambiguity that motivated the change) and "HDR+DV", which stay readable
// until the startup re-parse rewrites them.

export type HdrBase = "" | "SDR" | "HDR" | "HLG" | "HDR10" | "HDR10+";

export interface HdrInfo {
  dv: boolean;
  base: HdrBase;
}

const BASE_RANK: Record<HdrBase, number> = {
  "": -1,
  SDR: 0,
  HDR: 1,
  HLG: 2,
  HDR10: 3,
  "HDR10+": 4,
};

function baseFromToken(token: string): HdrBase {
  const u = token.toUpperCase().replace(/[\s._-]+/g, "");
  if (u === "HDR10+" || u === "HDR10PLUS" || u === "HDR10P") return "HDR10+";
  if (u === "HDR10") return "HDR10";
  if (u === "HLG") return "HLG";
  if (u === "HDR") return "HDR";
  if (u === "SDR") return "SDR";
  return "";
}

/** Parse any stored or user-typed HDR string into { dv, base }. */
export function parseHdr(raw: string | null | undefined): HdrInfo {
  const value = (raw ?? "").trim();
  if (!value) return { dv: false, base: "" };
  const up = value.toUpperCase();

  // Legacy combined spellings.
  if (/^HDR10\+DV$/.test(up)) return { dv: true, base: "HDR10" };
  if (/^HDR\+DV$/.test(up)) return { dv: true, base: "HDR" };

  let dv = false;
  let base: HdrBase = "";
  const re =
    /(?:^|[^A-Z0-9])(DOLBY[\s._-]?VISION|DOVI|DV|HDR10\+|HDR10[\s._-]?PLUS|HDR10|HLG|HDR|SDR)(?=$|[^A-Z0-9]|\+)/g;
  // "DV+HDR10+" — split on "+" between tokens but keep the HDR10+ suffix.
  for (const m of up.matchAll(re)) {
    const tok = m[1];
    if (tok === "DV" || tok === "DOVI" || tok.startsWith("DOLBY")) {
      dv = true;
      continue;
    }
    const b = baseFromToken(tok);
    if (BASE_RANK[b] > BASE_RANK[base]) base = b;
  }
  return { dv, base };
}

/** Canonical stored value for { dv, base } (same rules as `hdr_label` in Rust). */
export function formatHdrValue(info: HdrInfo): string {
  if (info.dv) {
    if (info.base && info.base !== "SDR") return `DV+${info.base}`;
    return "DV";
  }
  return info.base;
}

/** Normalise any HDR string to its canonical stored value ("" when unknown). */
export function canonicalHdr(raw: string | null | undefined): string {
  return formatHdrValue(parseHdr(raw));
}

/** Combine two HDR sources (e.g. ffprobe + filename): DV from either side is
 *  kept and the strongest base layer wins. */
export function mergeHdrValues(
  a: string | null | undefined,
  b: string | null | undefined,
): string {
  const x = parseHdr(a);
  const y = parseHdr(b);
  return formatHdrValue({
    dv: x.dv || y.dv,
    base: BASE_RANK[x.base] >= BASE_RANK[y.base] ? x.base : y.base,
  });
}

/** Long label: "Dolby Vision · HDR10+", "HDR10", "Dolby Vision". */
export function hdrLabel(raw: string | null | undefined): string {
  const { dv, base } = parseHdr(raw);
  if (dv && base && base !== "SDR") return `Dolby Vision · ${base}`;
  if (dv) return "Dolby Vision";
  return base || (raw ?? "");
}

/** Compact label for small badges: "DV · HDR10+", "DV", "HDR10+". */
export function hdrShortLabel(raw: string | null | undefined): string {
  const { dv, base } = parseHdr(raw);
  if (dv && base && base !== "SDR") return `DV · ${base}`;
  if (dv) return "DV";
  return base || (raw ?? "");
}

/** Dolby Vision or HDR10+ — the formats worth a badge on a poster. */
export function isPremiumHdr(raw: string | null | undefined): boolean {
  const { dv, base } = parseHdr(raw);
  return dv || base === "HDR10+";
}

/** Plain HDR/SDR adds nothing to a summary line; everything else does. */
export function isNotableHdr(raw: string | null | undefined): boolean {
  const { dv, base } = parseHdr(raw);
  return dv || base === "HDR10" || base === "HDR10+" || base === "HLG";
}

/** Library filter keys an item belongs to. "DV+HDR10" counts for the Dolby
 *  Vision and the HDR10 filters, and every HDR format counts for the generic
 *  "HDR" filter. */
export function hdrFilterKeys(raw: string | null | undefined): string[] {
  const { dv, base } = parseHdr(raw);
  const keys = new Set<string>();
  if (dv) keys.add("DV");
  if (base && base !== "SDR") keys.add(base);
  if (dv || (base && base !== "SDR")) keys.add("HDR");
  return [...keys];
}

export function matchesHdrFilter(
  raw: string | null | undefined,
  filter: string,
): boolean {
  return !filter || hdrFilterKeys(raw).includes(filter);
}

// ── Audio ────────────────────────────────────────────────────────────────────

/** Canonical audio labels, best first. Matches parser.rs `detect_audio` and
 *  analysis.rs track labels. */
export const AUDIO_LABELS = [
  "TrueHD Atmos",
  "TrueHD",
  "DTS:X",
  "DTS-HD MA",
  "EAC3 Atmos",
  "DTS-HD HRA",
  "DTS-HD",
  "EAC3",
  "DTS",
  "FLAC",
  "PCM",
  "AC3",
  "AAC",
  "Opus",
  "MP3",
  "Atmos",
] as const;

/** Normalise legacy / raw audio strings ("TRUEHD", "EAC3 + Atmos", "DD+",
 *  "DTS-X", "DDP") to a canonical label. Unknown values are returned as-is. */
export function canonicalAudio(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const u = value.toUpperCase().replace(/\s+/g, " ");
  const atmos = /ATMOS|JOC|DDPA/.test(u);
  if (/TRUE[\s-]?HD/.test(u)) return atmos ? "TrueHD Atmos" : "TrueHD";
  if (/DTS[\s:-]?X\b/.test(u)) return "DTS:X";
  if (/DTS[\s-]?(HD[\s-]?)?MA\b/.test(u)) return "DTS-HD MA";
  const eac3 = /E-?AC-?3|DDP|DD\+|DOLBY DIGITAL PLUS/.test(u);
  if (eac3) return atmos ? "EAC3 Atmos" : "EAC3";
  if (/DTS[\s-]?HD[\s-]?HRA?\b/.test(u)) return "DTS-HD HRA";
  if (/DTS[\s-]?HD/.test(u)) return "DTS-HD";
  if (/^DTS\b/.test(u)) return "DTS";
  if (/^FLAC/.test(u)) return "FLAC";
  if (/^L?PCM/.test(u)) return "PCM";
  if (/^(AC-?3|DD\b|DOLBY DIGITAL)/.test(u)) return "AC3";
  if (/AAC/.test(u)) return "AAC";
  if (/^OPUS/.test(u)) return "Opus";
  if (/^MP3/.test(u)) return "MP3";
  if (atmos) return "Atmos";
  return value;
}

/** What the UI shows. EAC3 is better known as Dolby Digital Plus / DD+. */
export function audioLabel(raw: string | null | undefined): string {
  const c = canonicalAudio(raw);
  if (c === "EAC3") return "DD+";
  if (c === "EAC3 Atmos") return "DD+ Atmos";
  if (c === "AC3") return "Dolby Digital";
  return c;
}

/** Atmos, DTS:X or lossless — the audio worth calling out next to HDR. */
export function isPremiumAudio(raw: string | null | undefined): boolean {
  const c = canonicalAudio(raw);
  return (
    c.includes("Atmos") ||
    c === "DTS:X" ||
    c === "DTS-HD MA" ||
    c === "TrueHD" ||
    c === "FLAC" ||
    c === "PCM"
  );
}

/** Filename-safe audio token: "DTS:X" has a colon (illegal on Windows/SMB
 *  shares) and the Atmos labels have spaces. `sep` joins words: "." for the
 *  dotted TV style, " " for the movie style. */
export function audioFilenameToken(raw: string, sep: "." | " " = "."): string {
  const c = canonicalAudio(raw);
  if (!c) return "";
  if (c === "DTS:X") return "DTS-X";
  return c.split(" ").join(sep);
}

/** Channel count → layout ("5.1", "7.1", "2.0"). */
export function formatChannels(n: number | null | undefined): string {
  if (!n) return "";
  if (n <= 2) return `${n}.0`;
  if (n === 3) return "2.1";
  if (n === 6) return "5.1";
  if (n === 7) return "6.1";
  if (n === 8) return "7.1";
  return `${n}.0`;
}
