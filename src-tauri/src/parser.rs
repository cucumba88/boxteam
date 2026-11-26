use std::sync::LazyLock;
use regex::Regex;

// ── Static regexes (compiled once at startup) ──────────────────────────────
// Compiling regexes is expensive. All patterns are hoisted to `LazyLock<Regex>`
// statics so they are built exactly once on first use instead of on every call
// to `parse_media_path`.

static WHITESPACE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\s+").expect("valid whitespace regex")
});

static YEAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(19|20)\d{2}\b").expect("valid year regex")
});

/// A 4-digit year immediately after an opening parenthesis — the conventional
/// "Title (Year)" release marker. Capture group 1 is the year. Matches both
/// "(2025)" and "(2025." (the closing paren is often eaten when dots become
/// spaces), so it only requires the opening paren.
static PAREN_YEAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\(((?:19|20)\d{2})").expect("valid paren-year regex")
});

/// Tags that mark the end of the human-readable title portion of a filename.
static TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?ix)\b(2160p|4K|UHD|1080p|1080i|720p|720i|480p|576p|x265|x264|HEVC|AVC|AV1|VP9|
          DTS[-.]?HD|TrueHD|Atmos|DTS|AC3|EAC3|DD\+?|AAC|FLAC|MP3|
          HDR10\+?|HDR|DV|Dolby\.?Vision|SDR|
          BluRay|BDRip|BRRip|BDMV|REMUX|BDREMUX|
          WEB-DL|WEBRip|WEBDL|WEB|
          HDTV|PDTV|DSR|DVDRip|DVDScr|DVD|CAM|SCREENER|SCR|
          AMZN|NF|DSNP|ATVP|HMAX|PCOK|STAN|HBO|SHO|PMTP|
          PROPER|REPACK|REAL|EXTENDED|THEATRICAL|DC|DIRECTORS\.?CUT|
          DUAL|DUBBED|SUBBED|MULTI|
          ENG|SPA|FRE|GER|ITA|POR|JPN|CHI|KOR|RUS|ARA|LAT|CAT|
          [\[(])\b",
    )
    .expect("valid tag regex")
});

/// Supports S01E01, S01 E01, S01-E01, S01E01-E03, S01E01E02, and the Spanish
/// "T2E05" / "T01E03" (Temporada) spelling.
/// Also handles S100E01 convention (S[season*100]E[ep]) used by some release groups.
static SE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?ix)\b[ST](\d{1,3})[\s._-]*E(\d{1,3})(?:\s*[-~]\s*E?(\d{1,3})|[\s._-]*E(\d{1,3}))?\b",
    )
    .expect("valid SE regex")
});

/// Supports 1x01 and 1x01-03 forms.
static X_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(\d{1,2})x(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\b").expect("valid Xx regex")
});

/// Season-only: S01 / Season 01 / Temporada 01 (no episode).
static S_ONLY_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:S|SEASON[\s._-]*|TEMPORADA[\s._-]*)(\d{1,3})\b")
        .expect("valid season-only regex")
});

/// Episode-only: E01 / EP01 / Episode 01 / Episodio 01 without season prefix.
/// ("Cap"/"Capitulo" are handled by `CAP_RE`, which understands the Spanish
/// "Cap.101" = season 1 episode 1 convention.)
static E_ONLY_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?ix)(?:^|\s)(?:E|EP|EPISODE|EPISODIO)[\s._-]?(\d{1,3})(?:\s*[-~]\s*(?:E|EP|EPISODE|EPISODIO)?[\s._-]?(\d{1,3}))?\b",
    )
    .expect("valid episode-only regex")
});

/// Spanish tracker episode marker: "Cap.101" / "[Cap.2201]" / "Capitulo 42" /
/// "Capítulo 7" / "Cap.101_103" (range). Group 1 is the "cap" vs "capitulo"
/// spelling (the short form is the one that packs season*100+episode), group 2
/// the number, group 3 the optional range end.
static CAP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?ix)\b(cap(?:[ií]tulo)?)[\s._-]*(\d{1,4})(?:\s*[-_~\s]\s*(\d{3,4}))?\b",
    )
    .expect("valid cap regex")
});

/// Files named as "01 - Title" or just "01" (used when season is in parent folder).
static LEADING_EP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?ix)^\s*0*(\d{1,3})\b(?:\s*[-._]\s*|\s+|\s*$)").expect("valid leading episode regex")
});

/// Trailing episode number "Show 01" / "Breaking Bad 101" — only trusted when
/// the season is already known from a season folder.
static TRAILING_EP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?ix)\s(\d{1,3})\s*$").expect("valid trailing episode regex")
});

/// Leading fansub/scene group in brackets: "[SubsPlease] Title - 01 (1080p)".
static LEADING_BRACKET_GROUP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?ix)^\s*\[([^\]]+)\]\s*").expect("valid leading bracket group regex")
});

/// Anime absolute episode numbering after a dash: "Title - 87" / "Title - 01v2".
static ANIME_ABS_EP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?ix)\s-\s(\d{1,3})(?:v\d)?(?:\s|$)").expect("valid anime episode regex")
});

/// Trailing parenthesised non-year qualifier, e.g. "The Office (US)".
static TRAILING_QUALIFIER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?ix)\s*\((?:US|UK|AU|CA|NZ|ES|MX)\)?\s*$").expect("valid qualifier regex")
});

/// Folder names that carry no show/movie title (season or extras folders).
static NON_TITLE_FOLDER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:
            (?:season|temporada|series|serie|staffel|saison)[\s._-]*\d{1,4}
          | s\d{1,4}
          | t\d{1,3}
          | specials? | especiales | extras? | featurettes?
        )\s*$",
    )
    .expect("valid non-title folder regex")
});

static RESOLUTION_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(2160p|4K|UHD|1080p|1080i|720p|480p)\b").expect("valid resolution regex")
});

static CODEC_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(x265|h\.?265|x264|h\.?264|HEVC|AVC|AV1|VP9)\b")
        .expect("valid codec regex")
});

// ── Audio detection ─────────────────────────────────────────────────────────
// Every audio regex runs on the "clean" stem (dots/underscores → spaces), so
// "DDP5.1" arrives as "DDP5 1" and "DTS-HD.MA.7.1" as "DTS-HD MA 7 1". None of
// them may end in a bare `\b` after a non-word char ("DD+", "HDR10+"): `\b`
// after "+" only holds when a letter/digit follows, which silently dropped
// "DD+ 5 1" and "HDR10+ DV".

static AUDIO_TRUEHD_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bTrue[\s-]?HD(?:\d|\b)").expect("valid truehd regex")
});
static AUDIO_ATMOS_RE: LazyLock<Regex> = LazyLock::new(|| {
    // "Atmos", plus the "DDPA5.1" / "DDPA" shorthand some groups use for
    // E-AC-3 JOC (Atmos).
    Regex::new(r"(?i)\b(?:Atmos|DDPA(?:\d|\b))").expect("valid atmos regex")
});
static AUDIO_DTSX_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bDTS[\s:-]?X(?:\d|\b)").expect("valid dts:x regex")
});
static AUDIO_DTSHD_MA_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bDTS[\s-]?(?:HD[\s-]?)?MA(?:\d|\b)").expect("valid dts-hd ma regex")
});
static AUDIO_DTSHD_HRA_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bDTS[\s-]?HD[\s-]?(?:HRA?|High[\s-]?Res(?:olution)?)(?:\d|\b)")
        .expect("valid dts-hd hra regex")
});
static AUDIO_DTSHD_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bDTS[\s-]?HD(?:\d|\b)").expect("valid dts-hd regex")
});
static AUDIO_DTS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bDTS(?:\d|\b)").expect("valid dts regex")
});
static AUDIO_EAC3_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\b(?:E-?AC-?3(?:\d|\b)|DDPA?(?:\d|\b)|DD\+|DD[\s-]?Plus\b|Dolby[\s-]?Digital[\s-]?Plus\b)",
    )
    .expect("valid eac3 regex")
});
static AUDIO_AC3_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:AC-?3(?:\d|\b)|DD(?:\d|\b)|Dolby[\s-]?Digital\b)").expect("valid ac3 regex")
});
static AUDIO_AAC_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:HE-?)?AAC(?:\d|\b|-?LC)").expect("valid aac regex")
});
static AUDIO_FLAC_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bFLAC(?:\d|\b)").expect("valid flac regex")
});
static AUDIO_PCM_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bL?PCM(?:\d|\b)").expect("valid pcm regex")
});
static AUDIO_MP3_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bMP3\b").expect("valid mp3 regex")
});
/// "Opus" is also an English word ("Magnum Opus"), so it only counts after the
/// first technical tag — see `detect_audio`.
static AUDIO_OPUS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bOpus(?:\d|\b)").expect("valid opus regex")
});

/// Channel layout written right after an audio codec: "DDP5 1", "DTS-HD MA 7 1",
/// "TrueHD Atmos 7 1", "AAC2 0", "AC3 5 1". Requiring the codec in front keeps
/// stray numbers in titles ("Ocean's 8 1080p") from being read as channels.
static AUDIO_CHANNELS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?ix)\b(?:True[\s-]?HD|DTS(?:[\s:-]?(?:HD|X|ES))?|DDPA?|DD\+|DD|E-?AC-?3|AC-?3|(?:HE-?)?AAC(?:-?LC)?|FLAC|Opus|L?PCM|Atmos)
           (?:[\s-]?(?:MA|HRA|Atmos))*
           [\s-]?([1-9])[\s.]([01])\b",
    )
    .expect("valid audio channels regex")
});

/// Detect the main audio format from a cleaned filename/folder name and return
/// it as one of the canonical labels shared with ffprobe analysis and the
/// upload form: "TrueHD Atmos", "TrueHD", "DTS:X", "DTS-HD MA", "DTS-HD HRA",
/// "DTS-HD", "EAC3 Atmos", "EAC3", "DTS", "FLAC", "PCM", "AC3", "AAC",
/// "Opus", "MP3" or bare "Atmos" (Atmos with no recognisable base codec).
///
/// When a name lists several tracks ("TrueHD 7 1 Atmos AC3 5 1") the best one
/// wins, which is what people mean by "the audio" of a release.
pub fn detect_audio(text: &str) -> Option<String> {
    let atmos = AUDIO_ATMOS_RE.is_match(text);
    if AUDIO_TRUEHD_RE.is_match(text) {
        return Some(if atmos { "TrueHD Atmos" } else { "TrueHD" }.to_string());
    }
    if AUDIO_DTSX_RE.is_match(text) {
        return Some("DTS:X".to_string());
    }
    if AUDIO_DTSHD_MA_RE.is_match(text) {
        return Some("DTS-HD MA".to_string());
    }
    let eac3 = AUDIO_EAC3_RE.is_match(text);
    if eac3 && atmos {
        return Some("EAC3 Atmos".to_string());
    }
    if AUDIO_DTSHD_HRA_RE.is_match(text) {
        return Some("DTS-HD HRA".to_string());
    }
    if AUDIO_DTSHD_RE.is_match(text) {
        return Some("DTS-HD".to_string());
    }
    if eac3 {
        return Some("EAC3".to_string());
    }
    if AUDIO_DTS_RE.is_match(text) {
        return Some("DTS".to_string());
    }
    if AUDIO_FLAC_RE.is_match(text) {
        return Some("FLAC".to_string());
    }
    if AUDIO_PCM_RE.is_match(text) {
        return Some("PCM".to_string());
    }
    if AUDIO_AC3_RE.is_match(text) {
        return Some("AC3".to_string());
    }
    if AUDIO_AAC_RE.is_match(text) {
        return Some("AAC".to_string());
    }
    let tech_start = TAG_RE.find(text).map(|m| m.start()).unwrap_or(text.len());
    if AUDIO_OPUS_RE.find_iter(text).any(|m| m.start() >= tech_start && m.start() > 0) {
        return Some("Opus".to_string());
    }
    if AUDIO_MP3_RE.is_match(text) {
        return Some("MP3".to_string());
    }
    if atmos {
        return Some("Atmos".to_string());
    }
    None
}

/// Channel layout ("7.1", "5.1", "2.0") written next to an audio codec.
pub fn detect_audio_channels(text: &str) -> Option<String> {
    AUDIO_CHANNELS_RE
        .captures(text)
        .map(|c| format!("{}.{}", &c[1], &c[2]))
}

// ── HDR detection ───────────────────────────────────────────────────────────

/// HDR / Dolby Vision tokens. "HDR10+" is matched without a trailing `\b`
/// (see the audio note above); the other alternatives need one so "HDRip"
/// or "DVDRip" never count.
static HDR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\b(?:(HDR10\+|HDR10[\s-]?Plus\b|HDR10P\b)|(DV|DoVi|Dolby[\s._-]?Vision|HDR10|HLG|HDR|SDR)\b)",
    )
    .expect("valid HDR regex")
});

/// Normalise a single matched HDR token (case-insensitive raw match) to one of
/// the canonical labels: DV, HDR10+, HDR10, HLG, HDR, SDR.
fn canonicalize_hdr_token(raw: &str) -> Option<&'static str> {
    let up = raw.to_uppercase();
    let stripped: String = up.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '+').collect();
    match stripped.as_str() {
        "DV" | "DOVI" | "DOLBYVISION" => Some("DV"),
        "HDR10+" | "HDR10PLUS" | "HDR10P" => Some("HDR10+"),
        "HDR10" => Some("HDR10"),
        "HLG" => Some("HLG"),
        "HDR" => Some("HDR"),
        "SDR" => Some("SDR"),
        _ => None,
    }
}

/// Build the canonical stored HDR label from a Dolby Vision flag and the
/// strongest base layer. With Dolby Vision the label is "DV+<base>" — e.g.
/// "DV+HDR10", "DV+HDR10+", "DV+HLG" — so HDR10 and HDR10+ stay distinct.
/// (Before v0.16 it was "HDR10+DV" for both, which read as "HDR10+ with DV"
/// even for plain HDR10; the frontend still understands the old spelling.)
pub fn hdr_label(dv: bool, base: Option<&str>) -> Option<String> {
    match (dv, base) {
        (true, Some(b @ ("HDR10+" | "HDR10" | "HLG" | "HDR"))) => Some(format!("DV+{b}")),
        (true, _) => Some("DV".to_string()),
        (false, Some(b)) => Some(b.to_string()),
        (false, None) => None,
    }
}

/// Specificity ranking for HDR base layers: HDR10+ > HDR10 > HLG > HDR > SDR.
pub fn hdr_rank(t: &str) -> i8 {
    match t {
        "HDR10+" => 4,
        "HDR10" => 3,
        "HLG" => 2,
        "HDR" => 1,
        "SDR" => 0,
        _ => -1,
    }
}

/// Scan a string for every HDR token and combine them into one canonical
/// label, preserving Dolby Vision when seen alongside HDR/HDR10/HDR10+/HLG.
fn combine_hdr_from(text: &str) -> Option<String> {
    let mut has_dv = false;
    let mut base: Option<&'static str> = None;
    for m in HDR_RE.find_iter(text) {
        if let Some(tok) = canonicalize_hdr_token(m.as_str()) {
            if tok == "DV" {
                has_dv = true;
                continue;
            }
            base = match base {
                Some(prev) if hdr_rank(prev) >= hdr_rank(tok) => Some(prev),
                _ => Some(tok),
            };
        }
    }
    hdr_label(has_dv, base)
}

/// Season inference patterns for path-based season detection (checked in order).
static SEASON_PATH_RES: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)(?:^|[/\s-])season[\s._-]*(\d{1,2})(?:[/\s-]|$)",
        r"(?i)(?:^|[/\s-])temporada[\s._-]*(\d{1,2})(?:[/\s-]|$)",
        r"(?i)(?:^|[/\s-])s(\d{1,2})(?:[/\s-]|$)",
        r"(?i)\b[ST](\d{1,3})[\s._-]*E\d{1,3}\b",
        r"(?i)\b(\d{1,2})x\d{1,3}\b",
    ]
    .iter()
    .map(|pat| Regex::new(pat).expect("valid season path regex"))
    .collect()
});

/// Episode inference patterns for path-based episode detection (checked in order).
static EPISODE_PATH_RES: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)\b[ST]\d{1,3}[\s._-]*E(\d{1,3})(?:\s*[-~]\s*E?(\d{1,3})|[\s._-]*E(\d{1,3}))?\b",
        r"(?i)\b\d{1,2}x(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\b",
        r"(?i)(?:^|[/\s-])(?:E|EP|EPISODE|CAP(?:ITULO)?)[\s._-]?(\d{1,3})(?:\s*[-~]\s*(?:E|EP|EPISODE|CAP(?:ITULO)?)?[\s._-]?(\d{1,3}))?(?:[/\s-]|$)",
    ]
    .iter()
    .map(|pat| Regex::new(pat).expect("valid episode path regex"))
    .collect()
});

/// Release-type patterns paired with their canonical label (checked in order;
/// more specific patterns come first).
static RELEASE_TYPE_PATTERNS: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    let specs: &[(&str, &str)] = &[
        (r"(?i)\bBD[-. ]?REMUX\b", "BDREMUX"),
        (r"(?i)\bREMUX\b", "BDREMUX"),
        (r"(?i)\bBDMV\b", "BDMV"),
        (r"(?i)\bBDRip\b", "BDRip"),
        (r"(?i)\bBRRip\b", "BRRip"),
        (r"(?i)\bBluRay\b", "BluRay"),
        (r"(?i)\bWEB[-. ]?DL\b", "WEB-DL"),
        (r"(?i)\bWEBDL\b", "WEB-DL"),
        (r"(?i)\bWEBRip\b", "WEBRip"),
        (r"(?i)\bHDTV\b", "HDTV"),
        (r"(?i)\bPDTV\b", "PDTV"),
        (r"(?i)\bDSR\b", "DSR"),
        (r"(?i)\bDVDRip\b", "DVDRip"),
        (r"(?i)\bDVDScr\b", "DVDScr"),
        (r"(?i)\bDVD\b", "DVD"),
        (r"(?i)\bSCREENER\b", "SCREENER"),
        (r"(?i)\bCAM\b", "CAM"),
    ];
    specs
        .iter()
        .map(|(pat, label)| {
            (
                Regex::new(pat).expect("valid release type regex"),
                *label,
            )
        })
        .collect()
});

// Language-detection statics
static DUAL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bDUAL\b").expect("valid DUAL regex"));
static MULTI_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bMULTI\b").expect("valid MULTI regex"));
static DUBBED_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bDUBBED\b").expect("valid DUBBED regex"));
static SUBBED_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bSUBBED\b").expect("valid SUBBED regex"));

/// ISO 639-2 language code patterns paired with their canonical tag.
static ISO_LANG_RES: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    let specs: &[(&str, &str)] = &[
        (r"(?i)\bENG\b", "ENG"),
        (r"(?i)\bSPA\b", "SPA"),
        (r"(?i)\bLAT\b", "LAT"),
        (r"(?i)\bFRE\b", "FRE"),
        (r"(?i)\bGER\b", "GER"),
        (r"(?i)\bITA\b", "ITA"),
        (r"(?i)\bPOR\b", "POR"),
        (r"(?i)\bJPN\b", "JPN"),
        (r"(?i)\bCHI\b", "CHI"),
        (r"(?i)\bKOR\b", "KOR"),
        (r"(?i)\bRUS\b", "RUS"),
        (r"(?i)\bARA\b", "ARA"),
        (r"(?i)\bCAT\b", "CAT"),
    ];
    specs
        .iter()
        .map(|(pat, code)| (Regex::new(pat).expect("valid ISO lang regex"), *code))
        .collect()
});

// ── Public types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct ParsedMedia {
    pub title: String,
    pub year: Option<u16>,
    pub season: Option<u8>,
    pub episode: Option<u8>,
    pub episode_end: Option<u8>, // for multi-episode files like S01E01-E03
    pub resolution: Option<String>,
    pub codec: Option<String>,
    pub audio_codec: Option<String>,
    /// Channel layout next to the audio codec ("7.1", "5.1", "2.0"). Not
    /// stored in the library — only used to pre-fill the upload form.
    pub audio_channels: Option<String>,
    pub hdr: Option<String>,
    pub languages: Vec<String>,
    pub release_type: Option<String>,  // WEB-DL, BluRay, BDREMUX, etc.
    pub release_group: Option<String>, // scene group name
}

// ── Public API ──────────────────────────────────────────────────────────────

pub fn parse_media_path(ftp_path: &str, filename: &str) -> ParsedMedia {
    parse_with_context((!ftp_path.is_empty()).then_some(ftp_path), filename)
}

// ── Core parsing ────────────────────────────────────────────────────────────

fn parse_with_context(ftp_path: Option<&str>, filename: &str) -> ParsedMedia {
    let without_ext = std::path::Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    parse_stem(ftp_path, without_ext)
}

fn parse_stem(ftp_path: Option<&str>, without_ext: &str) -> ParsedMedia {
    // A leading "[Group]" (fansub / scene convention: "[SubsPlease] Title - 01")
    // is never part of the title. Strip it up front and keep it as a
    // release-group fallback.
    let (leading_group, body) = match LEADING_BRACKET_GROUP_RE.captures(without_ext) {
        Some(caps) => {
            let end = caps.get(0).map(|m| m.end()).unwrap_or(0);
            let rest = &without_ext[end..];
            if rest.trim().is_empty() {
                (None, without_ext)
            } else {
                let group = caps
                    .get(1)
                    .map(|m| m.as_str().trim().to_uppercase())
                    .filter(|g| {
                        !g.is_empty()
                            && g.len() <= 24
                            && g.chars().all(|c| c.is_alphanumeric() || c == '-' || c == ' ')
                            && !YEAR_RE.is_match(g)
                    });
                (group, rest)
            }
        }
        None => (None, without_ext),
    };

    // Replace dots, underscores and multiple spaces with single space
    let clean = body.replace(['.', '_'], " ");
    let clean = WHITESPACE_RE.replace_all(&clean, " ").trim().to_string();

    let path_season = ftp_path.and_then(infer_season_from_path);

    // ── Season / episode markers in the filename ──────────────────────────
    let mut filename_season: Option<u8> = None;
    let mut episode: Option<u8> = None;
    let mut episode_end: Option<u8> = None;
    let mut se_start = clean.len();

    if let Some(caps) = SE_RE.captures(&clean) {
        let raw_s: u16 = caps[1].parse().unwrap_or(0);
        filename_season = Some(normalize_season(raw_s));
        episode = caps[2].parse().ok();
        episode_end = caps
            .get(3)
            .or_else(|| caps.get(4))
            .and_then(|m| m.as_str().parse().ok());
        se_start = caps.get(0).map(|m| m.start()).unwrap_or(se_start);
    } else if let Some(caps) = X_RE.captures(&clean) {
        filename_season = caps[1].parse().ok();
        episode = caps[2].parse().ok();
        episode_end = caps.get(3).and_then(|m| m.as_str().parse().ok());
        se_start = caps.get(0).map(|m| m.start()).unwrap_or(se_start);
    } else {
        // Season and episode may be spelled separately:
        // "Narcos Temporada 1 Capitulo 3", "La Casa de Papel - Temporada 2 [Cap.205]".
        if let Some(caps) = S_ONLY_RE.captures(&clean) {
            let raw_s: u16 = caps[1].parse().unwrap_or(0);
            filename_season = Some(normalize_season(raw_s));
            se_start = caps.get(0).map(|m| m.start()).unwrap_or(se_start);
        }
        let known_season = filename_season.or(path_season);

        if let Some(caps) = CAP_RE.captures(&clean) {
            let short_form = caps
                .get(1)
                .map(|m| m.as_str().len() <= 3)
                .unwrap_or(false);
            let n: u16 = caps[2].parse().unwrap_or(0);
            let n_end: Option<u16> = caps.get(3).and_then(|m| m.as_str().parse().ok());
            let (cap_season, ep, ep_end) = split_cap_number(n, n_end, short_form, known_season);
            if filename_season.is_none() {
                filename_season = cap_season;
            }
            episode = ep;
            episode_end = ep_end;
            if let Some(m) = caps.get(0) {
                se_start = se_start.min(m.start());
            }
        } else if let Some(caps) = E_ONLY_RE.captures(&clean) {
            episode = caps[1].parse().ok();
            episode_end = caps.get(2).and_then(|m| m.as_str().parse().ok());
            if let Some(m) = caps.get(0) {
                se_start = se_start.min(m.start());
            }
        } else if leading_group.is_some() && known_season.is_none() {
            // Anime absolute numbering: "[Group] Title - 87 (1080p)".
            if let Some(caps) = ANIME_ABS_EP_RE.captures(&clean) {
                episode = caps[1].parse().ok();
                if let Some(m) = caps.get(0) {
                    se_start = se_start.min(m.start());
                }
            }
        }
    }

    let season = filename_season.or(path_season);

    let tag_pos = first_tag_pos(&clean);
    // A "[...]" block after the title ("Cars 2 [BluRay 1080p][Castellano]") ends it.
    let bracket_pos = clean
        .char_indices()
        .find(|&(i, c)| i > 0 && c == '[')
        .map(|(i, _)| i)
        .unwrap_or(clean.len());

    // Pick the release year and the position where the title ends. Priority:
    //  1. A parenthesised year "(2025)" — the conventional release marker, which
    //     lets a title legitimately contain a 4-digit number ("1975 El fin de
    //     una era (2025)", "Blade Runner 2049 (2017)").
    //  2. Otherwise a bare 4-digit year, but NEVER one at position 0 — a
    //     filename never opens with its release year, so a leading number is part
    //     of the title. When several bare years appear before the first tech tag
    //     ("Blade.Runner.2049.2017.2160p") the LAST one is the release year.
    //  3. Years in the future (beyond next year) are never release years.
    // Both the `year` value and the title boundary derive from this single hit so
    // they can't disagree (which previously emptied the title).
    let max_year = current_year().saturating_add(1);
    let plausible = |y: u16| (1900..=max_year).contains(&y);
    let title_boundary = se_start.min(tag_pos).min(bracket_pos);
    let year_hit: Option<(usize, u16)> = PAREN_YEAR_RE
        .captures_iter(&clean)
        .filter_map(|caps| {
            let whole = caps.get(0)?;
            let year: u16 = caps.get(1)?.as_str().parse().ok()?;
            plausible(year).then_some((whole.start(), year))
        })
        .next()
        .or_else(|| {
            let candidates: Vec<(usize, u16)> = YEAR_RE
                .find_iter(&clean)
                .filter(|m| m.start() != 0)
                .filter_map(|m| m.as_str().parse().ok().map(|y| (m.start(), y)))
                .filter(|&(_, y)| plausible(y))
                .collect();
            candidates
                .iter()
                .filter(|&&(pos, _)| pos < title_boundary)
                .last()
                .or_else(|| candidates.first())
                .copied()
        });
    let year: Option<u16> = year_hit.map(|(_, y)| y);

    // Title ends at: year, S##E## marker, first tech tag or "[" — whichever comes first
    let year_pos = year_hit.map(|(pos, _)| pos).unwrap_or(clean.len());
    let title_end = year_pos.min(title_boundary);
    let mut title_part: &str = &clean[..title_end];

    // Episode inferred from the path or from a bare number, only once nothing
    // in the filename spelled it out.
    let mut used_leading_ep = false;
    if episode.is_none() {
        if let Some(path) = ftp_path {
            if let Some((ep, ep_end)) = infer_episode_from_path(path) {
                episode = Some(ep);
                episode_end = ep_end;
            }
        }

        if episode.is_none() && season.is_some() {
            if let Some(caps) = LEADING_EP_RE.captures(&clean) {
                episode = caps.get(1).and_then(|m| m.as_str().parse::<u8>().ok());
                used_leading_ep = episode.is_some();
            }
        }

        // "Show 01.mkv" / "Breaking Bad 101.mkv" inside a season folder.
        if episode.is_none() && filename_season.is_none() {
            if let Some(s) = path_season {
                if let Some(caps) = TRAILING_EP_RE.captures(title_part) {
                    let n: u16 = caps[1].parse().unwrap_or(0);
                    let ep = if n >= 100 && n / 100 == u16::from(s) && n % 100 > 0 {
                        Some((n % 100) as u8)
                    } else if n > 0 && n < 100 {
                        Some(n as u8)
                    } else {
                        None
                    };
                    if let (Some(ep), Some(m)) = (ep, caps.get(0)) {
                        episode = Some(ep);
                        title_part = &title_part[..m.start()];
                    }
                }
            }
        }
    }

    let mut title = tidy_title(title_part);

    // Fall back to the show / movie folder when the filename carries no usable
    // title: "Season 1/01.mkv", "S1/E01.mkv", "Season 02/01 - Episode Name.mkv",
    // "Dune (2021)/movie.mkv".
    let generic = matches!(
        normalize_generic(&title).as_str(),
        "movie" | "film" | "pelicula" | "video" | "episode" | "episodio" | "capitulo"
    );
    let needs_folder_title = title.is_empty()
        || used_leading_ep
        || generic
        || ((season.is_some() || episode.is_some()) && !title.chars().any(char::is_alphabetic));
    if needs_folder_title {
        if let Some(folder_title) = ftp_path.and_then(title_from_folders) {
            title = folder_title;
        }
    }
    // Still nothing: the marker we cut at was really part of the title
    // ("Episode.50.2011.1080p" is a movie) — keep the text up to the year/tag.
    if title.is_empty() {
        title = tidy_title(&clean[..year_pos.min(tag_pos).min(bracket_pos)]);
    }

    let release_type_from_filename = parse_release_type(&clean);
    let release_group = parse_release_group(without_ext).or(leading_group);
    // Language codes only count after the title: "¿Por Qué Me Casé…" must not
    // yield POR (Portuguese) from the word "Por".
    let languages = parse_languages(clean.get(title_end..).unwrap_or(&clean));

    // Build a list of ancestor folder names (immediate parent first, then
    // grandparent, etc.) so that tech tags found in a category folder like
    // "Peliculas BDrip 1080p X265" are picked up even when the movie lives
    // inside its own subfolder.
    let ancestor_cleans: Vec<String> = ftp_path
        .map(|p| {
            let mut dir = std::path::Path::new(p).parent();
            let mut results = Vec::new();
            while let Some(d) = dir {
                if let Some(name) = d.file_name().and_then(|n| n.to_str()) {
                    let s = name.replace(['.', '_'], " ");
                    results.push(WHITESPACE_RE.replace_all(&s, " ").to_string());
                }
                dir = d.parent();
            }
            results
        })
        .unwrap_or_default();

    // Helper: find the first ancestor that has a match for `f`.
    macro_rules! ancestor_find {
        ($f:expr) => {
            ancestor_cleans.iter().find_map(|a| $f(a.as_str()))
        };
    }

    let release_type = release_type_from_filename
        .or_else(|| ancestor_find!(|a| parse_release_type(a)));

    ParsedMedia {
        title,
        year,
        season,
        episode,
        episode_end,
        resolution: RESOLUTION_RE
            .find(&clean)
            .map(|m| m.as_str().to_uppercase())
            .or_else(|| ancestor_find!(|a| RESOLUTION_RE.find(a).map(|m| m.as_str().to_uppercase()))),
        codec: CODEC_RE
            .find(&clean)
            .map(|m| m.as_str().to_uppercase())
            .or_else(|| ancestor_find!(|a| CODEC_RE.find(a).map(|m| m.as_str().to_uppercase()))),
        audio_codec: detect_audio(&clean).or_else(|| ancestor_find!(|a| detect_audio(a))),
        audio_channels: detect_audio_channels(&clean)
            .or_else(|| ancestor_find!(|a| detect_audio_channels(a))),
        hdr: combine_hdr_from(&clean)
            .or_else(|| ancestor_find!(|a| combine_hdr_from(a))),
        languages,
        release_type,
        release_group,
    }
}

/// Normalize the S100→1, S200→2 convention used by some release groups.
fn normalize_season(raw: u16) -> u8 {
    if raw > 0 && raw % 100 == 0 {
        u8::try_from(raw / 100).unwrap_or(0)
    } else {
        u8::try_from(raw).unwrap_or(0)
    }
}

/// Interpret a Spanish "Cap" number. The tracker convention packs
/// season*100+episode into it ("Cap.101" = S01E01, "Cap.2201" = S22E01).
/// We only unpack it when it is safe:
///  - the season it encodes equals the season we already know, or
///  - no season is known and the short "Cap." spelling was used.
/// Otherwise ("Capitulo 150" of a telenovela) the number is the episode.
/// Returns (season, episode, episode_end).
fn split_cap_number(
    n: u16,
    n_end: Option<u16>,
    short_form: bool,
    known_season: Option<u8>,
) -> (Option<u8>, Option<u8>, Option<u8>) {
    if n >= 100 && n % 100 > 0 {
        let s = n / 100;
        let season_matches = known_season.map(u16::from) == Some(s);
        if season_matches || (known_season.is_none() && short_form) {
            let season = u8::try_from(s).ok();
            let ep = u8::try_from(n % 100).ok();
            let ep_end = n_end
                .filter(|e| e / 100 == s && e % 100 > n % 100)
                .and_then(|e| u8::try_from(e % 100).ok());
            return (season, ep, ep_end);
        }
    }
    let ep = u8::try_from(n).ok().filter(|&e| e > 0);
    let ep_end = n_end
        .and_then(|e| u8::try_from(e).ok())
        .filter(|&e| ep.is_some_and(|start| e > start));
    (None, ep, ep_end)
}

fn current_year() -> u16 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 31_556_952 s = average Gregorian year; precision is irrelevant here.
    u16::try_from(1970 + secs / 31_556_952).unwrap_or(u16::MAX)
}

/// Trim separators and dangling punctuation off a raw title slice, drop
/// unbalanced "(" fragments and country qualifiers like "(US)".
fn tidy_title(raw: &str) -> String {
    let mut t = raw.trim().to_string();
    loop {
        let before = t.clone();
        t = t
            .trim()
            // Spanish opening "¿" / "¡" (their closing pair is already gone with
            // the trailing punctuation) and stray leading separators / quotes.
            .trim_start_matches(|c: char| {
                matches!(c, '¿' | '¡' | '-' | '–' | '—' | '"' | '\'' | '«' | '»' | '“' | '”')
                    || c.is_whitespace()
            })
            .trim_end_matches(|c: char| !c.is_alphanumeric() && c != ')')
            .trim()
            .to_string();
        t = TRAILING_QUALIFIER_RE.replace(&t, "").to_string();
        let open = t.matches('(').count();
        let close = t.matches(')').count();
        if open > close {
            if let Some(idx) = t.rfind('(') {
                t.truncate(idx);
            }
        } else if close > open && t.ends_with(')') {
            t.pop();
        }
        if t == before {
            break;
        }
    }
    t
}

fn normalize_generic(title: &str) -> String {
    fold_accents(&title.to_lowercase())
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Lower-case ASCII folding of the Spanish accented vowels / ñ / ü.
fn fold_accents(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ñ' => 'n',
            'Á' | 'À' | 'Â' | 'Ä' => 'A',
            'É' | 'È' | 'Ê' | 'Ë' => 'E',
            'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
            'Ó' | 'Ò' | 'Ô' | 'Ö' => 'O',
            'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
            'Ñ' => 'N',
            other => other,
        })
        .collect()
}

/// Tech-tag tokens that are also ordinary words in titles ("¿Por Qué…",
/// "Real Steel", "Cat People", "Stan & Ollie"). They only end a title when
/// written in upper case, which is how release names spell the tag.
const WORDLIKE_TAGS: &[&str] = &[
    "POR", "REAL", "CAT", "CAM", "STAN", "SHO", "ITA", "LAT", "ARA", "CHI", "GER", "FRE",
    "SPA", "ENG", "KOR", "RUS", "JPN", "DC", "DV", "NF", "SCR", "DSR", "SDR", "DD", "PROPER",
];

/// True when `word` is one of the word-like tags ("Por", "Real", "Cat", …).
pub fn is_wordlike_tag(word: &str) -> bool {
    WORDLIKE_TAGS.contains(&word.to_uppercase().as_str())
}

/// Byte offset of the first tech tag in `clean`, skipping word-like tags that
/// are not upper case.
fn first_tag_pos(clean: &str) -> usize {
    TAG_RE
        .find_iter(clean)
        .find(|m| {
            let text = m.as_str();
            let upper = text.to_uppercase();
            !(WORDLIKE_TAGS.contains(&upper.as_str()) && text != upper)
        })
        .map(|m| m.start())
        .unwrap_or(clean.len())
}

/// Words that make up library *category* folder names ("Peliculas WEB DL
/// Micro 1080p", "Series 4K", "Documentales Castellano"). Such a folder never
/// names a movie or show, so it must not be used as a title fallback.
const CATEGORY_WORDS: &[&str] = &[
    "peliculas", "pelicula", "pelis", "movies", "films", "cine", "series", "serie", "tv",
    "shows", "tvshows", "documentales", "documental", "documentaries", "documentary", "docus",
    "anime", "animacion", "infantil", "infantiles", "kids", "conciertos", "musica", "music",
    "videos", "estrenos", "colecciones", "coleccion", "sagas", "biblioteca", "library", "media",
    "multimedia", "descargas", "downloads", "compartida",
];

/// Qualifier words that may follow a category word in a category folder name.
const CATEGORY_QUALIFIERS: &[&str] = &[
    "web", "dl", "webdl", "webrip", "micro", "microhd", "hd", "fullhd", "uhd", "4k", "1080p",
    "720p", "2160p", "bdrip", "bluray", "remux", "x264", "x265", "hevc", "castellano",
    "espanol", "latino", "vose", "vos", "dual", "multi", "y", "de", "and", "&", "hdr", "dv",
    "nuevas", "nuevos", "antiguas", "clasicas", "clasicos", "animadas", "es", "en",
];

/// True when `title` is just a library category name ("Peliculas",
/// "Series 4K", "Películas Castellano") rather than a real movie/show title.
pub fn is_generic_category_title(title: &str) -> bool {
    let folded = fold_accents(&title.to_lowercase());
    let tokens: Vec<&str> = folded
        .split(|c: char| c.is_whitespace() || c == '-' || c == '_' || c == '.')
        .filter(|t| !t.is_empty())
        .collect();
    !tokens.is_empty()
        && tokens.iter().any(|t| CATEGORY_WORDS.contains(t))
        && tokens
            .iter()
            .all(|t| CATEGORY_WORDS.contains(t) || CATEGORY_QUALIFIERS.contains(t))
}

/// Walk up from the file's parent folder and return the first folder name that
/// carries a real title, skipping season / specials / extras folders.
fn title_from_folders(ftp_path: &str) -> Option<String> {
    let mut dir = std::path::Path::new(ftp_path).parent();
    while let Some(d) = dir {
        if let Some(name) = d.file_name().and_then(|n| n.to_str()) {
            let spaced = WHITESPACE_RE
                .replace_all(&name.replace(['.', '_'], " "), " ")
                .to_string();
            if !NON_TITLE_FOLDER_RE.is_match(&spaced) {
                let parsed = parse_stem(None, name);
                if parsed.title.chars().any(char::is_alphanumeric)
                    && !is_generic_category_title(&parsed.title)
                    && !is_generic_category_title(&spaced)
                {
                    return Some(parsed.title);
                }
            }
        }
        dir = d.parent();
    }
    None
}

fn infer_season_from_path(ftp_path: &str) -> Option<u8> {
    let path = ftp_path.replace(['.', '_'], " ");
    for re in SEASON_PATH_RES.iter() {
        if let Some(caps) = re.captures(&path) {
            if let Some(raw) = caps.get(1).and_then(|m| m.as_str().parse::<u16>().ok()) {
                let season = if raw > 0 && raw % 100 == 0 {
                    (raw / 100) as u8
                } else {
                    raw as u8
                };
                return Some(season);
            }
        }
    }
    None
}

fn infer_episode_from_path(ftp_path: &str) -> Option<(u8, Option<u8>)> {
    let path = ftp_path.replace(['.', '_'], " ");
    for re in EPISODE_PATH_RES.iter() {
        if let Some(caps) = re.captures(&path) {
            if let Some(ep) = caps.get(1).and_then(|m| m.as_str().parse::<u8>().ok()) {
                let ep_end = caps
                    .get(2)
                    .or_else(|| caps.get(3))
                    .and_then(|m| m.as_str().parse::<u8>().ok());
                return Some((ep, ep_end));
            }
        }
    }
    None
}

fn parse_release_type(clean: &str) -> Option<String> {
    for (re, label) in RELEASE_TYPE_PATTERNS.iter() {
        if re.is_match(clean) {
            return Some(label.to_string());
        }
    }
    None
}

fn parse_release_group(without_ext: &str) -> Option<String> {
    // Scene releases end with -GROUPNAME. Extract the last hyphen-delimited token.
    // Filter out known non-group tokens.
    let non_group: &[&str] = &[
        "mkv", "mp4", "avi", "mov", "DL", "DTS", "AAC", "MA", "HD", "H264", "H265", "x264",
        "x265", "HEVC", "AVC", "WEB", "DL",
    ];
    // No hyphen → no "-GROUP" suffix ("Dune.mkv" must not yield group "DUNE").
    // Scene groups are glued to the hyphen ("-FLUX"); " - Rose" / " - S01E03" are
    // episode titles or markers, and fail the alphanumeric check below.
    let (_, last) = without_ext.rsplit_once('-')?;
    // A trailing episode range ("S01E01-E02", "S01E16-17") is not a group.
    let looks_episode = last.chars().all(|c| c.is_ascii_digit())
        || ((last.starts_with('E') || last.starts_with('e'))
            && last.len() > 1
            && last[1..].chars().all(|c| c.is_ascii_digit()));
    // Must be 2–12 chars, alphanumeric only
    if !looks_episode
        && last.len() >= 2
        && last.len() <= 12
        && last.chars().all(|c| c.is_alphanumeric())
    {
        if !non_group.iter().any(|&n| n.eq_ignore_ascii_case(last)) {
            return Some(last.to_uppercase());
        }
    }
    None
}

fn parse_languages(clean: &str) -> Vec<String> {
    let mut langs: Vec<String> = Vec::new();

    if DUAL_RE.is_match(clean) {
        langs.push("DUAL".into());
    }
    if MULTI_RE.is_match(clean) {
        langs.push("MULTI".into());
    }
    if DUBBED_RE.is_match(clean) {
        langs.push("DUBBED".into());
    }
    if SUBBED_RE.is_match(clean) {
        langs.push("SUBBED".into());
    }

    for (re, code) in ISO_LANG_RES.iter() {
        if re.is_match(clean) {
            langs.push(code.to_string());
        }
    }

    langs
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Original tests (preserved) ─────────────────────────────────────────

    #[test]
    fn parses_standard_release() {
        let p = parse_media_path("", "The.Batman.2022.2160p.UHD.BluRay.x265.DTS-HD.MA-GROUP.mkv");
        assert_eq!(p.title, "The Batman");
        assert_eq!(p.year, Some(2022));
        assert_eq!(p.resolution.as_deref(), Some("2160P"));
        assert_eq!(p.codec.as_deref(), Some("X265"));
    }

    #[test]
    fn parses_no_year() {
        let p = parse_media_path("", "Interstellar.1080p.x264.mkv");
        assert_eq!(p.title, "Interstellar");
        assert_eq!(p.year, None);
        assert_eq!(p.resolution.as_deref(), Some("1080P"));
        assert_eq!(p.codec.as_deref(), Some("X264"));
    }

    #[test]
    fn parses_h264_codec() {
        let p = parse_media_path("", "Sinners.2025.1080p.H264.mkv");
        assert_eq!(p.codec.as_deref(), Some("H264"));
    }

    #[test]
    fn parses_audio_codec() {
        let p = parse_media_path("", "Dune.2021.2160p.x265.DTS-HD.mkv");
        assert_eq!(p.audio_codec.as_deref(), Some("DTS-HD"));
    }

    #[test]
    fn parses_hdr() {
        let p = parse_media_path("", "Avatar.2009.2160p.HDR10.x265.mkv");
        assert_eq!(p.hdr.as_deref(), Some("HDR10"));
    }

    #[test]
    fn parses_hdtv_no_year() {
        let p = parse_media_path("", "Watson.HDTV.mkv");
        assert_eq!(p.title, "Watson");
        assert_eq!(p.year, None);
    }

    #[test]
    fn parses_tv_show_with_episode() {
        let p = parse_media_path("", "Watson.S01E01.2160p.WEB.DL.mkv");
        assert_eq!(p.title, "Watson");
        assert_eq!(p.season, Some(1));
        assert_eq!(p.episode, Some(1));
    }

    #[test]
    fn parses_tv_show_with_spaced_season_episode_tokens() {
        let p = parse_media_path(
            "",
            "Daredevil Born Again (2025) S02 E01 WEB DL 2160p HDR10 DV.mkv",
        );
        assert_eq!(p.season, Some(2));
        assert_eq!(p.episode, Some(1));
    }

    #[test]
    fn parses_episode_keyword_without_season_in_filename() {
        let p = parse_media_path(
            "/TV/Daredevil Born Again/Season 02/Daredevil Born Again Episode 01 WEB DL 2160p.mkv",
            "Daredevil Born Again Episode 01 WEB DL 2160p.mkv",
        );
        assert_eq!(p.season, Some(2));
        assert_eq!(p.episode, Some(1));
    }

    #[test]
    fn parses_leading_episode_when_season_is_in_folder() {
        let p = parse_media_path(
            "/TV/Daredevil Born Again/Season 02/01 - Heaven's Half Hour.mkv",
            "01 - Heaven's Half Hour.mkv",
        );
        assert_eq!(p.season, Some(2));
        assert_eq!(p.episode, Some(1));
    }

    #[test]
    fn infers_season_from_folder_when_filename_lacks_it() {
        let p = parse_media_path(
            "/TV/Watson/Season 02/Watson.2160p.WEB-DL.x265-GROUP.mkv",
            "Watson.2160p.WEB-DL.x265-GROUP.mkv",
        );
        assert_eq!(p.season, Some(2));
    }

    #[test]
    fn infers_season_from_s_folder_name() {
        let p = parse_media_path(
            "/TV/Daredevil Born Again (2025) S02 WEB DL 2160p HDR DV/Daredevil Born Again (2025) WEB DL 2160p HDR DV.mkv",
            "Daredevil Born Again (2025) WEB DL 2160p HDR DV.mkv",
        );
        assert_eq!(p.season, Some(2));
        assert_eq!(p.episode, None);
    }

    #[test]
    fn parses_streaming_source() {
        let p = parse_media_path("", "Como.cabras.2026.WEB.DL.2160p.HDR10.DV.mkv");
        assert_eq!(p.title, "Como cabras");
        assert_eq!(p.year, Some(2026));
    }

    #[test]
    fn leading_four_digit_number_is_part_of_title_not_year() {
        // Regression: "1975 ..." opens with a 4-digit number that is part of the
        // title; the real year is the parenthesised "(2025)". Previously the
        // parser took "1975" as the year and left the title empty, which then
        // mis-matched against an unrelated TMDB id.
        let p = parse_media_path("", "1975 El fin de una era (2025) WEB DL 1080p.mkv");
        assert_eq!(p.title, "1975 El fin de una era");
        assert_eq!(p.year, Some(2025));
    }

    #[test]
    fn embedded_four_digit_number_in_title_prefers_parenthesised_year() {
        // The number lives mid-title; the parenthesised year wins over it.
        let p = parse_media_path("", "Blade Runner 2049 (2017) 2160p BluRay x265.mkv");
        assert_eq!(p.title, "Blade Runner 2049");
        assert_eq!(p.year, Some(2017));
    }

    #[test]
    fn parenthesised_year_without_closing_paren_still_parses() {
        // Dots-to-spaces often eats the closing paren: "(2026.WEB-DL...".
        let p = parse_media_path("", "Je m'appelle Agneta (2026.WEB-DL.2160P.HEVC.mkv");
        assert_eq!(p.title, "Je m'appelle Agneta");
        assert_eq!(p.year, Some(2026));
    }

    #[test]
    fn year_and_tags_inside_one_paren_block_parse_as_a_film() {
        // Tags and channel layouts ("EAC3 5.1") inside the year's parens must not
        // read as an episode marker: the file is a film, with no season.
        let file = "Mínimo contacto (2026.WEB-DL.1080P.AVC.SPA.ENG.EAC3 5.1.EAC3 5.1.SUBS).mkv";
        let p = parse_media_path(&format!("/Documentales 4K 2160p - HD 1080p/{file}"), file);
        assert_eq!(p.title, "Mínimo contacto");
        assert_eq!(p.year, Some(2026));
        assert_eq!((p.season, p.episode), (None, None));
        assert_eq!(p.resolution.as_deref(), Some("1080P"));
        assert_eq!(p.release_type.as_deref(), Some("WEB-DL"));
    }

    #[test]
    fn parses_s100_convention_as_season_1_episode_1() {
        // Some release groups use S[season*100]E[ep]: S100E01 = Season 1, Episode 1
        let p = parse_media_path("", "Helluva Boss_S100E01_La familia asesina.mkv");
        assert_eq!(p.season, Some(1));
        assert_eq!(p.episode, Some(1));
    }

    #[test]
    fn parses_s200_convention_as_season_2_episode_8() {
        let p = parse_media_path("", "ShowName_S200E08_Title.mkv");
        assert_eq!(p.season, Some(2));
        assert_eq!(p.episode, Some(8));
    }

    #[test]
    fn does_not_normalize_normal_two_digit_season() {
        // S10E05 must NOT be treated as season 0 (10 % 100 != 0)
        let p = parse_media_path("", "Doctor.Who.S10E05.1080p.mkv");
        assert_eq!(p.season, Some(10));
        assert_eq!(p.episode, Some(5));
    }

    // ── Fix 1: LazyLock regex static tests ────────────────────────────────
    // These confirm that hoisting regex compilation to statics does not change
    // parse results for key patterns.

    #[test]
    fn static_regex_movie_with_year_and_1080p() {
        // Verifies YEAR_RE, TAG_RE, RESOLUTION_RE statics all fire correctly.
        let p = parse_media_path(
            "",
            "The.Dark.Knight.2008.1080p.BluRay.x264-GROUP.mkv",
        );
        assert_eq!(p.title, "The Dark Knight");
        assert_eq!(p.year, Some(2008));
        assert_eq!(p.resolution.as_deref(), Some("1080P"));
        assert_eq!(p.codec.as_deref(), Some("X264"));
        assert_eq!(p.release_type.as_deref(), Some("BluRay"));
        assert_eq!(p.release_group.as_deref(), Some("GROUP"));
    }

    #[test]
    fn static_regex_tv_s03e07_720p() {
        // Verifies SE_RE and RESOLUTION_RE statics.
        let p = parse_media_path("", "Breaking.Bad.S03E07.720p.WEB-DL.mkv");
        assert_eq!(p.title, "Breaking Bad");
        assert_eq!(p.season, Some(3));
        assert_eq!(p.episode, Some(7));
        assert_eq!(p.resolution.as_deref(), Some("720P"));
        assert_eq!(p.release_type.as_deref(), Some("WEB-DL"));
    }

    #[test]
    fn static_regex_4k_uhd_hdr_dolby_vision() {
        // Verifies TAG_RE, RESOLUTION_RE, HDR_RE statics with UHD/DV content.
        let p = parse_media_path(
            "",
            "Inception.2010.2160p.UHD.BluRay.DV.HDR10.DTS-HD.MA-REMUX.mkv",
        );
        assert_eq!(p.title, "Inception");
        assert_eq!(p.year, Some(2010));
        assert_eq!(p.resolution.as_deref(), Some("2160P"));
        // Both DV and HDR10 are present — combine_hdr_from merges them.
        assert_eq!(p.hdr.as_deref(), Some("DV+HDR10"));
        assert_eq!(p.audio_codec.as_deref(), Some("DTS-HD MA"));
    }

    #[test]
    fn parses_dv_only() {
        let p = parse_media_path("", "Movie.2023.2160p.WEB-DL.DV.mkv");
        assert_eq!(p.hdr.as_deref(), Some("DV"));
    }

    #[test]
    fn parses_dolby_vision_long_form() {
        let p = parse_media_path("", "Movie.2023.2160p.Dolby.Vision.x265.mkv");
        assert_eq!(p.hdr.as_deref(), Some("DV"));
    }

    #[test]
    fn parses_hdr10_plus_dv_combined() {
        let p = parse_media_path("", "Movie.2023.2160p.WEB-DL.HDR10+.DV.x265.mkv");
        assert_eq!(p.hdr.as_deref(), Some("DV+HDR10+"));
    }

    #[test]
    fn static_regex_dual_language_and_iso_codes() {
        // Verifies DUAL_RE and ISO_LANG_RES statics.
        let p = parse_media_path(
            "",
            "Spider-Man.2002.1080p.BluRay.DUAL.ENG.SPA.x264.mkv",
        );
        assert!(p.languages.contains(&"DUAL".to_string()));
        assert!(p.languages.contains(&"ENG".to_string()));
        assert!(p.languages.contains(&"SPA".to_string()));
    }

    #[test]
    fn static_regex_multi_episode_range() {
        // Verifies SE_RE episode_end capture group.
        let p = parse_media_path("", "Show.S02E01-E03.1080p.mkv");
        assert_eq!(p.season, Some(2));
        assert_eq!(p.episode, Some(1));
        assert_eq!(p.episode_end, Some(3));
    }

    #[test]
    fn static_regex_release_type_webdl_vs_webrip() {
        let webdl = parse_media_path("", "Movie.2023.1080p.WEB-DL.x265.mkv");
        assert_eq!(webdl.release_type.as_deref(), Some("WEB-DL"));

        let webrip = parse_media_path("", "Movie.2023.1080p.WEBRip.x265.mkv");
        assert_eq!(webrip.release_type.as_deref(), Some("WEBRip"));
    }

    #[test]
    fn static_regex_bdremux_takes_priority_over_remux() {
        // "BD REMUX" must be classified as BDREMUX, not the generic REMUX→BDREMUX fallback.
        let p = parse_media_path("", "Film.2020.2160p.BD.REMUX.x265.mkv");
        assert_eq!(p.release_type.as_deref(), Some("BDREMUX"));
    }

    #[test]
    fn static_regex_atmos_audio_codec() {
        let p = parse_media_path("", "Movie.2022.2160p.TrueHD.Atmos.x265.mkv");
        assert_eq!(p.audio_codec.as_deref(), Some("TrueHD Atmos"));
    }

    #[test]
    fn codec_falls_back_to_parent_folder() {
        // Episode filename has no codec tag — should inherit from the folder name.
        let p = parse_media_path(
            "/TV/Show.S01.2160p.WEB-DL.x265-GROUP/S01E01.mkv",
            "S01E01.mkv",
        );
        assert_eq!(p.codec.as_deref(), Some("X265"));
        assert_eq!(p.resolution.as_deref(), Some("2160P"));
        assert_eq!(p.release_type.as_deref(), Some("WEB-DL"));
    }

    #[test]
    fn codec_falls_back_to_grandparent_category_folder() {
        // Movie in its own subfolder; codec/resolution come from the grandparent
        // category folder (e.g. "Peliculas BDrip 1080p X265").
        let p = parse_media_path(
            "/Peliculas BDrip 1080p X265/The Batman (2022)/The Batman.mkv",
            "The Batman.mkv",
        );
        assert_eq!(p.codec.as_deref(), Some("X265"));
        assert_eq!(p.resolution.as_deref(), Some("1080P"));
        assert_eq!(p.release_type.as_deref(), Some("BDRip"));
    }

    #[test]
    fn codec_from_filename_wins_over_parent_folder() {
        // Filename explicitly says x264; folder says x265 — filename takes precedence.
        let p = parse_media_path(
            "/TV/Show.S01.2160p.x265-GROUP/S01E01.2160p.x264.mkv",
            "S01E01.2160p.x264.mkv",
        );
        assert_eq!(p.codec.as_deref(), Some("X264"));
    }

    // ── QA corpus: real-world release names ───────────────────────────────
    // Each row: (ftp_path, filename, title, year, season, episode, episode_end).
    // ftp_path "" means "parsed without folder context".

    type Row = (
        &'static str,
        &'static str,
        &'static str,
        Option<u16>,
        Option<u8>,
        Option<u8>,
        Option<u8>,
    );

    fn check_rows(rows: &[Row]) {
        let mut failures = Vec::new();
        for &(path, file, title, year, season, episode, episode_end) in rows {
            let p = parse_media_path(path, file);
            let got = (p.title.as_str(), p.year, p.season, p.episode, p.episode_end);
            let want = (title, year, season, episode, episode_end);
            if got != want {
                failures.push(format!("{file}\n    got  {got:?}\n    want {want:?}"));
            }
        }
        assert!(failures.is_empty(), "{} mismatches:\n{}", failures.len(), failures.join("\n"));
    }

    #[test]
    fn corpus_movies() {
        check_rows(&[
            ("", "The.Matrix.1999.1080p.BluRay.x264-SPARKS.mkv", "The Matrix", Some(1999), None, None, None),
            ("", "2001.A.Space.Odyssey.1968.1080p.BluRay.x264.mkv", "2001 A Space Odyssey", Some(1968), None, None, None),
            ("", "1917.2019.1080p.BluRay.x264-SPARKS.mkv", "1917", Some(2019), None, None, None),
            ("", "2012.2009.1080p.BluRay.x264.mkv", "2012", Some(2009), None, None, None),
            ("", "Blade.Runner.2049.2017.2160p.UHD.BluRay.x265.mkv", "Blade Runner 2049", Some(2017), None, None, None),
            ("", "Blade.Runner.2049.2160p.UHD.BluRay.x265.mkv", "Blade Runner 2049", None, None, None, None),
            ("", "Toy.Story.3.2010.1080p.BluRay.x264.mkv", "Toy Story 3", Some(2010), None, None, None),
            ("", "Rocky.IV.1985.1080p.BluRay.x264.mkv", "Rocky IV", Some(1985), None, None, None),
            ("", "300.2006.1080p.BluRay.x264.mkv", "300", Some(2006), None, None, None),
            ("", "Se7en.1995.1080p.BluRay.x264.mkv", "Se7en", Some(1995), None, None, None),
            ("", "Oppenheimer (2023) [1080p] [BluRay] [5.1] [YTS.MX].mp4", "Oppenheimer", Some(2023), None, None, None),
            ("", "Oppenheimer [2023] 1080p.mkv", "Oppenheimer", Some(2023), None, None, None),
            ("", "La Sociedad de la Nieve (2023) [BDRip 1080p][Castellano AC3 5.1].mkv", "La Sociedad de la Nieve", Some(2023), None, None, None),
            ("", "El Hoyo 2 (2024) WEB-DL 1080p Castellano.mkv", "El Hoyo 2", Some(2024), None, None, None),
            ("", "Cars 2 [BluRay 1080p][Castellano].mkv", "Cars 2", None, None, None, None),
            ("", "Star Wars Episode IV - A New Hope (1977).mkv", "Star Wars Episode IV - A New Hope", Some(1977), None, None, None),
            ("", "Season.of.the.Witch.2011.1080p.BluRay.mkv", "Season of the Witch", Some(2011), None, None, None),
            ("", "Deadpool & Wolverine (2024) 2160p.mkv", "Deadpool & Wolverine", Some(2024), None, None, None),
            ("", "Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX.mkv", "Dune Part Two", Some(2024), None, None, None),
            ("", "Episode.50.2011.1080p.mkv", "Episode 50", Some(2011), None, Some(50), None),
            ("/Peliculas/Dune (2021)/movie.mkv", "movie.mkv", "Dune", None, None, None, None),
        ]);
    }

    #[test]
    fn corpus_series_scene_names() {
        check_rows(&[
            ("", "Breaking.Bad.S01E01.Pilot.1080p.BluRay.x264.mkv", "Breaking Bad", None, Some(1), Some(1), None),
            ("", "Doctor.Who.2005.S01E01.Rose.1080p.mkv", "Doctor Who", Some(2005), Some(1), Some(1), None),
            ("", "Doctor Who (2005) - S01E01 - Rose.mkv", "Doctor Who", Some(2005), Some(1), Some(1), None),
            ("", "House.of.the.Dragon.S02E01E02.1080p.mkv", "House of the Dragon", None, Some(2), Some(1), Some(2)),
            ("", "Friends.S01E01-E02.mkv", "Friends", None, Some(1), Some(1), Some(2)),
            ("", "Friends.S01E16-17.mkv", "Friends", None, Some(1), Some(16), Some(17)),
            ("", "Friends - 1x01 - The One Where Monica Gets a Roommate.mkv", "Friends", None, Some(1), Some(1), None),
            ("", "the.simpsons.s35e01.720p.hdtv.x264.mkv", "the simpsons", None, Some(35), Some(1), None),
            ("", "Shogun.2024.S01E01.Anjin.1080p.DSNP.WEB-DL.mkv", "Shogun", Some(2024), Some(1), Some(1), None),
            ("", "9-1-1.S07E01.1080p.mkv", "9-1-1", None, Some(7), Some(1), None),
            ("", "24.S01E01.mkv", "24", None, Some(1), Some(1), None),
            ("", "The.100.S01E01.720p.mkv", "The 100", None, Some(1), Some(1), None),
            ("", "1923.S01E01.1080p.mkv", "1923", None, Some(1), Some(1), None),
            ("", "Sherlock.S00E01.The.Abominable.Bride.mkv", "Sherlock", None, Some(0), Some(1), None),
            ("", "Show.Name.S01.COMPLETE.1080p.WEB-DL.mkv", "Show Name", None, Some(1), None, None),
            ("", "The Office (US) - S02E01.mkv", "The Office", None, Some(2), Some(1), None),
        ]);
    }

    #[test]
    fn corpus_series_spanish_conventions() {
        check_rows(&[
            ("", "La Casa de Papel - Temporada 1 [HDTV 720p][Cap.101][AC3 5.1 Castellano].mkv", "La Casa de Papel", None, Some(1), Some(1), None),
            ("", "La Casa de Papel - Temporada 2 [HDTV][Cap.205][Español Castellano].avi", "La Casa de Papel", None, Some(2), Some(5), None),
            ("", "Merli [HDTV][Cap.312].avi", "Merli", None, Some(3), Some(12), None),
            ("", "Aqui no hay quien viva [Cap.508].avi", "Aqui no hay quien viva", None, Some(5), Some(8), None),
            ("", "Cuentame como paso - Temporada 22 [HDTV 720p][Cap.2201].mkv", "Cuentame como paso", None, Some(22), Some(1), None),
            ("", "Serie [HDTV][Cap.101_103].avi", "Serie", None, Some(1), Some(1), Some(3)),
            ("", "Los Serrano Capitulo 42.avi", "Los Serrano", None, None, Some(42), None),
            ("", "La.Revuelta.Cap.12.mkv", "La Revuelta", None, None, Some(12), None),
            ("", "Elite 3x05.mkv", "Elite", None, Some(3), Some(5), None),
            ("", "El Ministerio del Tiempo T2E05.mkv", "El Ministerio del Tiempo", None, Some(2), Some(5), None),
            ("", "Vis a vis T01E03.mkv", "Vis a vis", None, Some(1), Some(3), None),
            ("", "Narcos Temporada 1 Capitulo 3.mkv", "Narcos", None, Some(1), Some(3), None),
            ("", "Narcos Temporada 1 Episodio 3.mkv", "Narcos", None, Some(1), Some(3), None),
            ("/Series/Merlí/Temporada 2/Merlí - Episodio 05.mkv", "Merlí - Episodio 05.mkv", "Merlí", None, Some(2), Some(5), None),
        ]);
    }

    #[test]
    fn corpus_series_folder_layouts() {
        check_rows(&[
            ("/Series/Breaking Bad/Season 1/01.mkv", "01.mkv", "Breaking Bad", None, Some(1), Some(1), None),
            ("/Series/Breaking Bad/Season 1/Breaking Bad 101.mkv", "Breaking Bad 101.mkv", "Breaking Bad", None, Some(1), Some(1), None),
            ("/Series/Show/Season 10/Show 01.mkv", "Show 01.mkv", "Show", None, Some(10), Some(1), None),
            ("/Series/Show/S1/E01.mkv", "E01.mkv", "Show", None, Some(1), Some(1), None),
            ("/Series/Friends/Temporada 03/Friends - 3x05.mkv", "Friends - 3x05.mkv", "Friends", None, Some(3), Some(5), None),
            ("/TV/Daredevil Born Again/Season 02/01 - Heaven's Half Hour.mkv", "01 - Heaven's Half Hour.mkv", "Daredevil Born Again", None, Some(2), Some(1), None),
        ]);
    }

    #[test]
    fn corpus_anime_absolute_numbering() {
        check_rows(&[
            ("", "[SubsPlease] Shingeki no Kyojin - 87 (1080p) [ABCD1234].mkv", "Shingeki no Kyojin", None, None, Some(87), None),
            ("", "[Erai-raws] Spy x Family - 01 [1080p].mkv", "Spy x Family", None, None, Some(1), None),
        ]);
        let p = parse_media_path("", "[SubsPlease] Shingeki no Kyojin - 87 (1080p) [ABCD1234].mkv");
        assert_eq!(p.release_group.as_deref(), Some("SUBSPLEASE"));
    }

    #[test]
    fn release_group_ignores_titles_without_hyphen_and_episode_ranges() {
        for file in [
            "Dune.mkv",
            "Friends.S01E01-E02.mkv",
            "Friends.S01E16-17.mkv",
            "Doctor Who (2005) - S01E01 - Rose.mkv",
            "The Last of Us - S01E03.mkv",
        ] {
            assert_eq!(parse_media_path("", file).release_group, None, "{file}");
        }
        assert_eq!(
            parse_media_path("", "Severance.S02E10.2160p.ATVP.WEB-DL.H.265-FLUX.mkv").release_group.as_deref(),
            Some("FLUX")
        );
    }

    #[test]
    fn remux_wins_over_bluray_release_type() {
        let p = parse_media_path("", "Avengers.Endgame.2019.2160p.UHD.BluRay.REMUX.HDR.HEVC.Atmos-EPSiLON.mkv");
        assert_eq!(p.release_type.as_deref(), Some("BDREMUX"));
    }

    #[test]
    fn folder_title_skips_extras_and_season_folders() {
        assert_eq!(title_from_folders("/Series/Lost/Specials/x.mkv").as_deref(), Some("Lost"));
        assert_eq!(title_from_folders("/Series/Lost/Temporada 1/x.mkv").as_deref(), Some("Lost"));
        assert_eq!(title_from_folders("/Mr. Robot/Season 1/x.mkv").as_deref(), Some("Mr Robot"));
    }

    #[test]
    fn cap_number_split_rules() {
        // Short "Cap." with 3 digits and no season known → season*100+episode.
        assert_eq!(split_cap_number(101, None, true, None), (Some(1), Some(1), None));
        // Long "Capitulo" without season context is a plain episode number.
        assert_eq!(split_cap_number(150, None, false, None), (None, Some(150), None));
        // Known season that matches the prefix → split even for the long form.
        assert_eq!(split_cap_number(205, None, false, Some(2)), (Some(2), Some(5), None));
        // Known season that does NOT match → plain episode number.
        assert_eq!(split_cap_number(205, None, true, Some(1)), (None, Some(205), None));
    }

    // ── HDR / Dolby Vision / audio corpus ──────────────────────────────────
    // Real-world scene, P2P and Spanish-tracker names. Columns: filename,
    // expected hdr, expected audio codec, expected channels.

    fn check_tech(rows: &[(&str, Option<&str>, Option<&str>, Option<&str>)]) {
        let mut failures = Vec::new();
        for (file, hdr, audio, ch) in rows {
            let p = parse_media_path("", file);
            if p.hdr.as_deref() != *hdr
                || p.audio_codec.as_deref() != *audio
                || p.audio_channels.as_deref() != *ch
            {
                failures.push(format!(
                    "{file}\n    got hdr={:?} audio={:?} ch={:?}\n    want hdr={hdr:?} audio={audio:?} ch={ch:?}",
                    p.hdr, p.audio_codec, p.audio_channels
                ));
            }
        }
        assert!(failures.is_empty(), "{} mismatches:\n{}", failures.len(), failures.join("\n"));
    }

    #[test]
    fn corpus_hdr_and_dolby_vision() {
        check_tech(&[
            // Dolby Vision + HDR10 base layer (most UHD remuxes / WEB-DLs)
            ("Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX.mkv", Some("DV+HDR"), Some("EAC3 Atmos"), Some("5.1")),
            ("Oppenheimer.2023.2160p.UHD.BluRay.REMUX.DV.HDR10.HEVC.TrueHD.7.1.Atmos-FGT.mkv", Some("DV+HDR10"), Some("TrueHD Atmos"), Some("7.1")),
            ("The.Last.of.Us.S01E01.2160p.MAX.WEB-DL.DDP5.1.DoVi.HDR10.H.265-NTb.mkv", Some("DV+HDR10"), Some("EAC3"), Some("5.1")),
            ("Severance.S02E01.2160p.ATVP.WEB-DL.DDP5.1.Atmos.DV.HDR10+.H.265-FLUX.mkv", Some("DV+HDR10+"), Some("EAC3 Atmos"), Some("5.1")),
            ("Movie.2023.2160p.WEB-DL.HDR10Plus.DV.x265.mkv", Some("DV+HDR10+"), None, None),
            ("Movie.2023.2160p.HDR10+.mkv", Some("HDR10+"), None, None),
            ("Movie_2023_2160p_HDR10+_DV_x265.mkv", Some("DV+HDR10+"), None, None),
            ("Movie.2023.2160p.HDR10.HDR10+.x265.mkv", Some("HDR10+"), None, None),
            ("Como.cabras.2026.WEB.DL.2160p.HDR10.DV.mkv", Some("DV+HDR10"), None, None),
            ("Daredevil Born Again (2025) S02 E01 WEB DL 2160p HDR10 DV.mkv", Some("DV+HDR10"), None, None),
            ("Gladiator II (2024) [4K UHD BDRemux HDR10 Dolby Vision][Castellano TrueHD Atmos 7.1].mkv", Some("DV+HDR10"), Some("TrueHD Atmos"), Some("7.1")),
            ("Wicked (2024.BDREMUX.2160P.HEVC.HDR10.SPA.ENG.TrueHD Atmos 7.1.SUBS)[Dolby Vision].mkv", Some("DV+HDR10"), Some("TrueHD Atmos"), Some("7.1")),
            // Dolby Vision only (profile 5 WEB releases)
            ("Movie.2023.2160p.WEB-DL.DV.mkv", Some("DV"), None, None),
            ("Movie.2023.2160p.Dolby.Vision.x265.mkv", Some("DV"), None, None),
            ("Movie.2023.2160p.NF.WEB-DL.DDP5.1.Atmos.DoVi.H.265-GROUP.mkv", Some("DV"), Some("EAC3 Atmos"), Some("5.1")),
            ("Movie.2023.2160p.DolbyVision.mkv", Some("DV"), None, None),
            // DV with HLG base (profile 8.4)
            ("Concert.2023.2160p.DV.HLG.mkv", Some("DV+HLG"), None, None),
            // Plain HDR / HLG / SDR
            ("Avatar.2009.2160p.HDR10.x265.mkv", Some("HDR10"), None, None),
            ("Avengers.Endgame.2019.2160p.UHD.BluRay.REMUX.HDR.HEVC.Atmos-EPSiLON.mkv", Some("HDR"), Some("Atmos"), None),
            ("Planet.Earth.III.S01E01.2160p.iP.WEB-DL.AAC2.0.HLG.H.265-GROUP.mkv", Some("HLG"), Some("AAC"), Some("2.0")),
            ("Movie.2023.2160p.SDR.WEB-DL.x265.mkv", Some("SDR"), None, None),
            // Nothing HDR — and words that only look like it
            ("Movie.2023.1080p.HDRip.x264.mkv", None, None, None),
            ("Movie.2005.DVDRip.XviD.AC3.mkv", None, Some("AC3"), None),
            ("Movie.2023.1080p.BluRay.x264.mkv", None, None, None),
        ]);
    }

    #[test]
    fn corpus_audio_codecs_and_channels() {
        check_tech(&[
            // Lossless
            ("Inception.2010.2160p.UHD.BluRay.REMUX.HDR10.HEVC.DTS-HD.MA.5.1-FGT.mkv", Some("HDR10"), Some("DTS-HD MA"), Some("5.1")),
            ("Movie.2019.1080p.BluRay.REMUX.AVC.DTS-HD.MA.7.1-EPSiLON.mkv", None, Some("DTS-HD MA"), Some("7.1")),
            ("Movie.2019.1080p.BluRay.DTS-HD.HRA.7.1.x264.mkv", None, Some("DTS-HD HRA"), Some("7.1")),
            ("Movie.2020.2160p.UHD.BluRay.x265.DTS-X.7.1-GROUP.mkv", None, Some("DTS:X"), Some("7.1")),
            ("Movie.2020.2160p.BluRay.REMUX.HEVC.DTS-HD.MA.TrueHD.7.1.Atmos-FGT.mkv", None, Some("TrueHD Atmos"), Some("7.1")),
            ("Movie (2021) [2160p DTS-X 7.1].mkv", None, Some("DTS:X"), Some("7.1")),
            ("Movie.2021.2160p.BluRay.DTS.X.7.1.x265.mkv", None, Some("DTS:X"), Some("7.1")),
            ("Movie.2018.1080p.BluRay.TrueHD.7.1.x264.mkv", None, Some("TrueHD"), Some("7.1")),
            ("Movie.2018.1080p.BluRay.FLAC.2.0.x264.mkv", None, Some("FLAC"), Some("2.0")),
            ("Anime.S01E01.1080p.BluRay.FLAC2.0.x264-GROUP.mkv", None, Some("FLAC"), Some("2.0")),
            ("Movie.1960.1080p.BluRay.REMUX.AVC.LPCM.1.0-GROUP.mkv", None, Some("PCM"), Some("1.0")),
            // Lossy / streaming
            ("The.Bear.S03E01.1080p.HULU.WEB-DL.DDP5.1.H.264-NTb.mkv", None, Some("EAC3"), Some("5.1")),
            ("Show.S01E01.1080p.WEB-DL.DD+5.1.H.264-GROUP.mkv", None, Some("EAC3"), Some("5.1")),
            ("Show.S01E01.1080p.WEB-DL.DD+.5.1.H.264-GROUP.mkv", None, Some("EAC3"), Some("5.1")),
            ("Show.S01E01.2160p.WEB-DL.DDPA5.1.H.265-GROUP.mkv", None, Some("EAC3 Atmos"), Some("5.1")),
            ("Show.S01E01.1080p.WEB-DL.EAC3.5.1.x264.mkv", None, Some("EAC3"), Some("5.1")),
            ("Show.S01E01.1080p.WEB-DL.E-AC-3.5.1.x264.mkv", None, Some("EAC3"), Some("5.1")),
            ("Show.S01E01.720p.HDTV.DD5.1.x264.mkv", None, Some("AC3"), Some("5.1")),
            ("Movie.2010.720p.BluRay.AC3.5.1.x264.mkv", None, Some("AC3"), Some("5.1")),
            ("Movie.2010.720p.BluRay.DTS.5.1.x264.mkv", None, Some("DTS"), Some("5.1")),
            ("Movie.2023.1080p.WEBRip.AAC2.0.x264.mkv", None, Some("AAC"), Some("2.0")),
            ("Movie.2023.1080p.WEB-DL.AAC.5.1.x265.mkv", None, Some("AAC"), Some("5.1")),
            ("Anime.S01E01.1080p.WEB.Opus.2.0.x265.mkv", None, Some("Opus"), Some("2.0")),
            ("Movie.2001.DVDRip.MP3.XviD.avi", None, Some("MP3"), None),
            // Spanish trackers
            ("La Sociedad de la Nieve (2023) [BDRip 1080p][Castellano AC3 5.1].mkv", None, Some("AC3"), Some("5.1")),
            ("Oppenheimer (2023) [1080p] [BluRay] [5.1] [YTS.MX].mp4", None, None, None),
            ("Padre no hay más que uno 4 (2024) [WEB-DL 1080p][Castellano DD+ 5.1].mkv", None, Some("EAC3"), Some("5.1")),
            // Titles with words that look like codecs
            ("Magnum.Opus.2019.1080p.WEB-DL.x264.mkv", None, None, None),
            ("Ocean's.8.2018.1080p.BluRay.x264.mkv", None, None, None),
        ]);
    }

    #[test]
    fn tech_tags_inherited_from_season_folder() {
        let p = parse_media_path(
            "/Series/Andor.S02.2160p.DSNP.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX/Andor.S02E01.mkv",
            "Andor.S02E01.mkv",
        );
        assert_eq!(p.hdr.as_deref(), Some("DV+HDR"));
        assert_eq!(p.audio_codec.as_deref(), Some("EAC3 Atmos"));
        assert_eq!(p.audio_channels.as_deref(), Some("5.1"));
    }

    #[test]
    fn titles_unchanged_by_audio_tokens() {
        assert_eq!(parse_media_path("", "Magnum.Opus.2019.1080p.WEB-DL.x264.mkv").title, "Magnum Opus");
        assert_eq!(parse_media_path("", "The.Bear.S03E01.1080p.HULU.WEB-DL.DDP5.1.H.264-NTb.mkv").title, "The Bear");
    }

    // ── Spanish punctuation / word-like tags / category folders ───────────

    #[test]
    fn leading_inverted_question_mark_and_por_keep_the_real_title() {
        let f = "¿Por Qué Me Casé Otra Vez (2026) WEB-DL MicroHD 1080p (2026.WEB-DL.1080P.AVC.SPA.ENG.EAC3 5.1.EAC3 5.1.SUBS).mkv";
        let p = parse_media_path(&format!("/Peliculas WEB DL Micro 1080p/{f}"), f);
        assert_eq!(p.title, "Por Qué Me Casé Otra Vez");
        assert_eq!(p.year, Some(2026));
        assert!(!p.languages.contains(&"POR".to_string()), "{:?}", p.languages);
        assert!(p.languages.contains(&"SPA".to_string()));
    }

    #[test]
    fn leading_inverted_exclamation_is_stripped() {
        let f = "¡Que Viva México! (2023) 1080p WEB-DL.mkv";
        let p = parse_media_path(&format!("/Peliculas 1080p/{f}"), f);
        assert_eq!(p.title, "Que Viva México");
        assert_eq!(p.year, Some(2023));
    }

    #[test]
    fn title_case_wordlike_tags_do_not_cut_the_title() {
        let p = parse_media_path("/Peliculas/Real Steel (2011) 1080p.mkv", "Real Steel (2011) 1080p.mkv");
        assert_eq!(p.title, "Real Steel");
        let p = parse_media_path("/Peliculas/Cat People (1942) 1080p.mkv", "Cat People (1942) 1080p.mkv");
        assert_eq!(p.title, "Cat People");
        let p = parse_media_path("", "Stan & Ollie (2018) 1080p.mkv");
        assert_eq!(p.title, "Stan & Ollie");
        let p = parse_media_path("", "Lo Que Por Amor (2020).mkv");
        assert_eq!(p.title, "Lo Que Por Amor");
    }

    #[test]
    fn upper_case_wordlike_tags_still_end_the_title() {
        let p = parse_media_path("", "Some.Movie.SPA.ENG.1080p.mkv");
        assert_eq!(p.title, "Some Movie");
        assert!(p.languages.contains(&"SPA".to_string()));
        let p = parse_media_path("", "Another.Film.REAL.PROPER.720p.mkv");
        assert_eq!(p.title, "Another Film");
    }

    #[test]
    fn category_folder_is_never_used_as_title() {
        // Filename with no usable title inside a category folder: never
        // "Peliculas"; keep whatever the filename itself says.
        let p = parse_media_path("/Peliculas WEB DL Micro 1080p/1080p.mkv", "1080p.mkv");
        assert_ne!(p.title, "Peliculas");
        let p = parse_media_path("/Series 4K/Season 1/01.mkv", "01.mkv");
        assert_ne!(p.title, "Series");
        // A real show folder below a category folder still wins.
        let p = parse_media_path("/Series 4K/Breaking Bad/Season 1/01.mkv", "01.mkv");
        assert_eq!(p.title, "Breaking Bad");
        let p = parse_media_path("/Películas Castellano/Dune (2021)/movie.mkv", "movie.mkv");
        assert_eq!(p.title, "Dune");
    }

    #[test]
    fn generic_category_title_detection() {
        assert!(is_generic_category_title("Peliculas"));
        assert!(is_generic_category_title("Películas"));
        assert!(is_generic_category_title("Peliculas WEB DL Micro 1080p"));
        assert!(is_generic_category_title("Series 4K"));
        assert!(is_generic_category_title("Documentales Castellano"));
        assert!(!is_generic_category_title("Por Qué Me Casé Otra Vez"));
        assert!(!is_generic_category_title("Series of Unfortunate Events"));
        assert!(!is_generic_category_title("Cinema Paradiso"));
        assert!(!is_generic_category_title(""));
    }

}
