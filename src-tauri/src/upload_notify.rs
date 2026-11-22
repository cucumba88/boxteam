//! Text of the Telegram messages sent when an upload finishes.
//!
//! Everything here is pure (no I/O) so the exact HTML that reaches Telegram
//! can be unit-tested: escaping, Spanish plurals, labels for HDR / audio /
//! subtitles and the 1024-char caption budget of `sendPhoto`.

use crate::analysis::{AudioTrack, SubtitleTrack};

/// Telegram's caption limit for `sendPhoto`, counted on the *visible* text
/// (after HTML entities are parsed) in UTF-16 code units.
pub const CAPTION_LIMIT: usize = 1024;

/// Synopsis length before we even look at the budget. Long enough to read
/// like a blurb, short enough that the tech block stays above the fold.
const OVERVIEW_MAX_CHARS: usize = 350;

/// Audio tracks listed one per line before collapsing into "+N pistas más".
const AUDIO_MAX_LINES: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaKind {
    Movie,
    Tv,
}

impl MediaKind {
    /// `"tv"` → Tv, anything else → Movie (TMDB only has the two namespaces;
    /// documentaries are searched as movies).
    pub fn from_str_loose(s: &str) -> Self {
        if s.eq_ignore_ascii_case("tv") {
            MediaKind::Tv
        } else {
            MediaKind::Movie
        }
    }

    pub fn tmdb_path(self) -> &'static str {
        match self {
            MediaKind::Movie => "movie",
            MediaKind::Tv => "tv",
        }
    }
}

/// What part of a show (or the whole film) this upload covers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scope {
    /// A film, or a TV file whose name has no season/episode marker.
    Whole,
    /// A single TV file: season, first episode and optional last episode
    /// (multi-episode files like `S01E01-E03`).
    Episode {
        season: Option<u8>,
        episode: Option<u8>,
        episode_end: Option<u8>,
    },
    /// A batch (season folder): distinct seasons seen in the file names and
    /// the number of files.
    Batch { seasons: Vec<u8>, files: usize },
}

/// TMDB extras shown on the card. All optional: TMDB may be unreachable,
/// the API key may be missing, or the upload may not be matched at all.
#[derive(Debug, Clone, Default)]
pub struct TmdbInfo {
    pub rating: Option<f64>,
    pub runtime_mins: Option<u32>,
    pub release_date: Option<String>,
    pub country: Option<String>,
    pub genres: Vec<String>,
    pub overview: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UploadNotice {
    pub kind: MediaKind,
    pub title: String,
    pub year: Option<String>,
    pub scope: Scope,
    pub release_type: Option<String>,
    pub resolution: Option<String>,
    pub codec: Option<String>,
    pub hdr: Option<String>,
    pub video_bitrate_kbps: Option<u32>,
    pub audio_tracks: Vec<AudioTrack>,
    /// Fallbacks when ffprobe didn't run (languages/codec from the file name).
    pub languages: Vec<String>,
    pub audio_codec: Option<String>,
    pub subtitle_tracks: Vec<SubtitleTrack>,
    pub subtitle_langs: Vec<String>,
    pub size_bytes: u64,
    /// Uploaded file name (single files only).
    pub filename: Option<String>,
    pub tmdb: Option<TmdbInfo>,
    pub tmdb_id: Option<i64>,
    /// Destination folder as shown to people (already shortened).
    pub dest: String,
}

/// Minimal HTML escape for Telegram HTML-mode text. Telegram does NOT know
/// `&apos;`, and quotes only matter inside attributes, which we build
/// ourselves from numeric ids.
pub fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Length Telegram measures for a caption: tags stripped, entities decoded,
/// counted in UTF-16 code units (so most emoji count as 2).
pub fn visible_len(html: &str) -> usize {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let decoded = out
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&amp;", "&");
    decoded.encode_utf16().count()
}

/// Spanish plural: `plural(1, "episodio", "episodios")` → "1 episodio".
pub fn plural(n: usize, one: &str, many: &str) -> String {
    if n == 1 {
        format!("{n} {one}")
    } else {
        format!("{n} {many}")
    }
}

/// Destination as people know it: everything from the "Compartida" segment
/// onwards (case-insensitive), or the whole path when there is no such
/// segment. Trailing slashes are dropped.
pub fn display_dest(ftp_dest_path: &str) -> String {
    let path = ftp_dest_path.trim_end_matches('/');
    let segments: Vec<&str> = path.split('/').collect();
    match segments.iter().position(|s| s.eq_ignore_ascii_case("compartida")) {
        Some(idx) => segments[idx..].join("/"),
        None if path.is_empty() => "/".to_string(),
        None => path.to_string(),
    }
}

pub fn format_bitrate(kbps: u32) -> String {
    if kbps >= 1000 {
        format!("{:.1} Mbps", kbps as f64 / 1000.0)
    } else {
        format!("{kbps} kbps")
    }
}

/// Human HDR label for a stored HDR value ("DV+HDR10" → "Dolby Vision + HDR10").
/// Accepts the pre-v0.16 spellings ("HDR10+DV", "HDR+DV"). SDR/empty → None.
pub fn hdr_display(raw: &str) -> Option<String> {
    let up = raw.trim().to_uppercase();
    if up.is_empty() || up == "SDR" {
        return None;
    }
    let (dv, base) = match up.as_str() {
        "HDR10+DV" => (true, Some("HDR10")),
        "HDR+DV" => (true, Some("HDR")),
        _ => {
            let dv = up.split('+').any(|t| t == "DV" || t == "DOVI") || up.contains("DOLBY");
            let base = if up.contains("HDR10+") || up.contains("HDR10PLUS") {
                Some("HDR10+")
            } else if up.contains("HDR10") {
                Some("HDR10")
            } else if up.contains("HLG") {
                Some("HLG")
            } else if up.contains("HDR") {
                Some("HDR")
            } else {
                None
            };
            (dv, base)
        }
    };
    match (dv, base) {
        (true, Some(b)) => Some(format!("Dolby Vision + {b}")),
        (true, None) => Some("Dolby Vision".to_string()),
        (false, Some(b)) => Some(b.to_string()),
        (false, None) => Some(raw.trim().to_string()),
    }
}

fn year_suffix(year: &Option<String>) -> String {
    year.as_deref()
        .filter(|y| !y.is_empty())
        .map(|y| format!(" ({})", html_escape(y)))
        .unwrap_or_default()
}

fn scope_line(scope: &Scope) -> Option<String> {
    match scope {
        Scope::Whole => None,
        Scope::Episode { season, episode, episode_end } => {
            let ep = match (episode, episode_end) {
                (Some(a), Some(b)) if b > a => Some(format!("Episodios {a}–{b}")),
                (Some(a), _) => Some(format!("Episodio {a}")),
                _ => None,
            };
            match (season, ep) {
                (Some(s), Some(e)) => Some(format!("🗂 Temporada {s} · {e}")),
                (Some(s), None) => Some(format!("🗂 Temporada {s}")),
                (None, Some(e)) => Some(format!("🗂 {e}")),
                (None, None) => None,
            }
        }
        Scope::Batch { seasons, files } => {
            let mut s = seasons.clone();
            s.sort_unstable();
            s.dedup();
            let seasons_str = match s.as_slice() {
                [] => None,
                [one] => Some(format!("Temporada {one}")),
                [first, .., last] if (*last as usize - *first as usize + 1) == s.len() => {
                    Some(format!("Temporadas {first}–{last}"))
                }
                many => Some(format!(
                    "Temporadas {}",
                    many.iter().map(|n| n.to_string()).collect::<Vec<_>>().join(", ")
                )),
            };
            let files_str = plural(*files, "episodio", "episodios");
            Some(match seasons_str {
                Some(ss) => format!("🗂 {ss} · {files_str}"),
                None => format!("🗂 {files_str}"),
            })
        }
    }
}

fn audio_lines(n: &UploadNotice) -> Vec<String> {
    if !n.audio_tracks.is_empty() {
        let mut seen = std::collections::HashSet::new();
        let lines: Vec<String> = n
            .audio_tracks
            .iter()
            .filter_map(|t| {
                let mut parts: Vec<String> = vec![lang_name(t.language.as_deref().unwrap_or(""))];
                let mut fmt = String::new();
                if !t.codec.is_empty() {
                    fmt.push_str(&t.codec);
                }
                if let Some(ch) = t.channels {
                    if !fmt.is_empty() {
                        fmt.push(' ');
                    }
                    fmt.push_str(&channels_label(ch));
                }
                if !fmt.is_empty() {
                    parts.push(fmt);
                }
                if let Some(k) = t.bitrate_kbps {
                    parts.push(format_bitrate(k));
                }
                let entry = html_escape(&parts.join(" · "));
                seen.insert(entry.clone()).then(|| format!("🔊 {entry}"))
            })
            .collect();
        lines
    } else if !n.languages.is_empty() {
        let mut names: Vec<String> = n.languages.iter().map(|l| lang_name(l)).collect();
        names.dedup();
        let mut line = format!("🔊 {}", html_escape(&names.join(" · ")));
        if let Some(ac) = n.audio_codec.as_deref().filter(|s| !s.is_empty()) {
            line.push_str(&format!(" · {}", html_escape(ac)));
        }
        vec![line]
    } else if let Some(ac) = n.audio_codec.as_deref().filter(|s| !s.is_empty()) {
        vec![format!("🔊 {}", html_escape(ac))]
    } else {
        Vec::new()
    }
}

fn subtitles_line(n: &UploadNotice) -> Option<String> {
    let names: Vec<String> = if !n.subtitle_tracks.is_empty() {
        let mut seen = std::collections::HashSet::new();
        n.subtitle_tracks
            .iter()
            .filter_map(|t| {
                let name = lang_name(t.language.as_deref().unwrap_or(""));
                let label = if t.is_forced { format!("{name} (forzados)") } else { name };
                seen.insert(label.clone()).then_some(label)
            })
            .collect()
    } else {
        let mut v: Vec<String> = n.subtitle_langs.iter().map(|l| lang_name(l)).collect();
        v.dedup();
        v
    };
    (!names.is_empty()).then(|| format!("💬 {}", html_escape(&names.join(" · "))))
}

fn specs_line(n: &UploadNotice) -> Option<String> {
    let parts: Vec<String> = [
        n.release_type.clone(),
        n.resolution.clone(),
        n.codec.clone(),
        n.hdr.as_deref().and_then(hdr_display),
        n.video_bitrate_kbps.map(format_bitrate),
    ]
    .into_iter()
    .flatten()
    .filter(|s| !s.trim().is_empty())
    .collect();
    (!parts.is_empty()).then(|| format!("🎞️ {}", html_escape(&parts.join(" · "))))
}

fn shorten(s: &str, max_chars: usize) -> String {
    let flat = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= max_chars {
        return flat;
    }
    let cut: String = flat.chars().take(max_chars).collect();
    // Prefer ending on a word boundary.
    let trimmed = match cut.rfind(' ') {
        Some(i) if i > max_chars / 2 => &cut[..i],
        _ => cut.as_str(),
    };
    format!("{}…", trimmed.trim_end_matches(|c: char| c == ',' || c == '.' || c == ';' || c == ':'))
}

/// Knobs the budget loop turns, cheapest information first.
#[derive(Clone, Copy)]
struct Budget {
    overview_chars: usize,
    audio_lines: usize,
    filename: bool,
    genres: bool,
}

fn render(n: &UploadNotice, b: Budget) -> String {
    let header = match (n.kind, &n.scope) {
        (MediaKind::Movie, _) => "🎬",
        (MediaKind::Tv, Scope::Batch { .. }) => "📦",
        (MediaKind::Tv, _) => "📺",
    };
    let mut head: Vec<String> = vec![format!(
        "{header} <b>{}</b>{}",
        html_escape(&n.title),
        year_suffix(&n.year)
    )];
    if let Some(l) = scope_line(&n.scope) {
        head.push(l);
    }

    if let Some(t) = &n.tmdb {
        // Line 1: what people decide on (rating, length). Line 2: when and
        // where. Two short lines read better on a phone than one that wraps.
        let mut facts: Vec<String> = Vec::new();
        if let Some(r) = t.rating.filter(|r| *r > 0.0) {
            facts.push(format!("⭐ {r:.1}"));
        }
        if let Some(m) = t.runtime_mins.filter(|m| *m > 0) {
            // TMDB gives shows a per-episode runtime.
            let per = if n.kind == MediaKind::Tv { " por episodio" } else { "" };
            facts.push(format!("⏱️ {}{per}", format_runtime(m)));
        }
        let mut origin: Vec<String> = Vec::new();
        // A show's first-air date says nothing about the episode just
        // uploaded, so the full date is only shown for films.
        if n.kind == MediaKind::Movie {
            if let Some(d) = t.release_date.as_deref().filter(|d| !d.is_empty()) {
                origin.push(format!("📅 {}", html_escape(&format_date_es(d))));
            }
        }
        if let Some(c) = t.country.as_deref().filter(|c| !c.is_empty()) {
            origin.push(format!("🌍 {}", html_escape(c)));
        }
        for line in [facts, origin] {
            if !line.is_empty() {
                head.push(line.join(" · "));
            }
        }
        if b.genres && !t.genres.is_empty() {
            head.push(format!("🎭 {}", html_escape(&t.genres.join(" · "))));
        }
    }

    let mut tech: Vec<String> = Vec::new();
    if let Some(l) = specs_line(n) {
        tech.push(l);
    }
    let audio = audio_lines(n);
    if audio.len() > b.audio_lines {
        let extra = audio.len() - b.audio_lines.saturating_sub(1);
        tech.extend(audio.into_iter().take(b.audio_lines.saturating_sub(1)));
        tech.push(format!("🔊 +{}", plural(extra, "pista más", "pistas más")));
    } else {
        tech.extend(audio);
    }
    if let Some(l) = subtitles_line(n) {
        tech.push(l);
    }
    if n.size_bytes > 0 {
        tech.push(format!("💾 {}", format_bytes_human(n.size_bytes)));
    }

    let overview = n
        .tmdb
        .as_ref()
        .and_then(|t| t.overview.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty() && b.overview_chars > 0)
        .map(|s| format!("<blockquote expandable>{}</blockquote>", html_escape(&shorten(s, b.overview_chars))));

    let mut foot: Vec<String> = Vec::new();
    if let Some(id) = n.tmdb_id {
        foot.push(format!(
            "🔗 <a href=\"https://www.themoviedb.org/{}/{id}\">Ver en TMDB</a>",
            n.kind.tmdb_path()
        ));
    }
    foot.push(format!("📂 <code>{}</code>", html_escape(&n.dest)));
    if b.filename {
        if let Some(f) = n.filename.as_deref().filter(|f| !f.is_empty()) {
            foot.push(format!("📄 <code>{}</code>", html_escape(f)));
        }
    }

    let mut blocks: Vec<String> = vec![head.join("\n")];
    if !tech.is_empty() {
        blocks.push(tech.join("\n"));
    }
    if let Some(o) = overview {
        blocks.push(o);
    }
    blocks.push(foot.join("\n"));
    blocks.join("\n\n")
}

/// Caption for the upload card. Always fits `limit` visible chars: the
/// synopsis shrinks first, then the file name, the audio list and genres go.
/// Title, tech line, TMDB link and destination are never dropped.
pub fn build_upload_caption(n: &UploadNotice, limit: usize) -> String {
    let mut b = Budget {
        overview_chars: OVERVIEW_MAX_CHARS,
        audio_lines: AUDIO_MAX_LINES,
        filename: true,
        genres: true,
    };
    loop {
        let text = render(n, b);
        if visible_len(&text) <= limit {
            return text;
        }
        if b.overview_chars > 120 {
            b.overview_chars -= 60;
        } else if b.overview_chars > 0 {
            b.overview_chars = 0;
        } else if b.filename {
            b.filename = false;
        } else if b.audio_lines > 2 {
            b.audio_lines -= 1;
        } else if b.genres {
            b.genres = false;
        } else {
            // Pathological input (e.g. a 900-char title): hand it to the
            // transport layer's hard cut rather than loop forever.
            return text;
        }
    }
}

/// Card for a season batch where some files failed.
pub fn build_partial_failure(
    title: &str,
    scope: &Scope,
    done: usize,
    total: usize,
    failed: &[String],
    dest: &str,
) -> String {
    let shown: Vec<String> = failed
        .iter()
        .take(10)
        .map(|n| format!("• <code>{}</code>", html_escape(n)))
        .collect();
    let more = if failed.len() > 10 {
        format!("\n…y {} más", failed.len() - 10)
    } else {
        String::new()
    };
    let scope_str = scope_line(scope).map(|l| format!("\n{l}")).unwrap_or_default();
    let failed_str = if failed.len() == 1 {
        "Ha fallado 1 episodio:".to_string()
    } else {
        format!("Han fallado {} episodios:", failed.len())
    };
    format!(
        "⚠️ <b>Subida incompleta</b>\n\n<b>{}</b>{scope_str}\n✅ {done} de {} subidos\n❌ {failed_str}\n{}{more}\n\n📂 <code>{}</code>",
        html_escape(title),
        plural(total, "episodio", "episodios"),
        shown.join("\n"),
        html_escape(dest),
    )
}

/// One-liner for personal subscribers ("Mis avisos → nuevo contenido").
pub fn build_new_content_line(n: &UploadNotice) -> String {
    let mut extra: Vec<String> = Vec::new();
    if let Some(l) = scope_line(&n.scope) {
        extra.push(l.trim_start_matches("🗂 ").to_string());
    }
    if let Some(r) = n.resolution.as_deref().filter(|s| !s.is_empty()) {
        extra.push(html_escape(r));
    }
    if let Some(h) = n.hdr.as_deref().and_then(hdr_display) {
        extra.push(html_escape(&h));
    }
    let extra_str = if extra.is_empty() {
        String::new()
    } else {
        format!("\n{}", extra.join(" · "))
    };
    format!(
        "🆕 Nuevo en la biblioteca: <b>{}</b>{}{extra_str}",
        html_escape(&n.title),
        year_suffix(&n.year)
    )
}

/// Personal notice when one of *your* downloads finishes.
pub fn build_download_done(media_title: Option<&str>, filename: &str, bytes: u64) -> String {
    let title = media_title.map(str::trim).filter(|t| !t.is_empty());
    let size = if bytes > 0 { format!(" · {}", format_bytes_human(bytes)) } else { String::new() };
    match title {
        Some(t) => format!(
            "✅ Descarga completada: <b>{}</b>\n📄 <code>{}</code>{size}",
            html_escape(t),
            html_escape(filename)
        ),
        None => format!("✅ Descarga completada: <code>{}</code>{size}", html_escape(filename)),
    }
}

/// Realistic card used by Settings → "Enviar ejemplo" so admins can see the
/// format without uploading anything.
pub fn sample_notice() -> UploadNotice {
    UploadNotice {
        kind: MediaKind::Movie,
        title: "Dune: Parte dos".into(),
        year: Some("2024".into()),
        scope: Scope::Whole,
        release_type: Some("BDREMUX".into()),
        resolution: Some("2160p".into()),
        codec: Some("HEVC".into()),
        hdr: Some("DV+HDR10".into()),
        video_bitrate_kbps: Some(58_300),
        audio_tracks: vec![
            AudioTrack {
                codec: "EAC3 Atmos".into(),
                language: Some("spa".into()),
                channels: Some(6),
                is_default: true,
                bitrate_kbps: Some(768),
            },
            AudioTrack {
                codec: "TrueHD Atmos".into(),
                language: Some("eng".into()),
                channels: Some(8),
                is_default: false,
                bitrate_kbps: Some(4_512),
            },
        ],
        languages: vec!["spa".into(), "eng".into()],
        audio_codec: Some("EAC3 Atmos".into()),
        subtitle_tracks: vec![
            SubtitleTrack { codec: "subrip".into(), language: Some("spa".into()), is_default: true, is_forced: true },
            SubtitleTrack { codec: "subrip".into(), language: Some("spa".into()), is_default: false, is_forced: false },
            SubtitleTrack { codec: "hdmv_pgs_subtitle".into(), language: Some("eng".into()), is_default: false, is_forced: false },
        ],
        subtitle_langs: vec!["spa".into(), "eng".into()],
        size_bytes: 67_012_345_678,
        filename: Some("Dune Parte dos (2024) [BDREMUX 2160p HEVC DV HDR10 SPA EAC3 Atmos ENG TrueHD Atmos].mkv".into()),
        tmdb: Some(TmdbInfo {
            rating: Some(8.2),
            runtime_mins: Some(167),
            release_date: Some("2024-03-01".into()),
            country: Some("Estados Unidos".into()),
            genres: vec!["Ciencia ficción".into(), "Aventura".into()],
            overview: Some("Paul Atreides se une a Chani y a los Fremen mientras busca venganza contra los conspiradores que destruyeron a su familia. Enfrentándose a una elección entre el amor de su vida y el destino del universo conocido, Paul se esfuerza por evitar un futuro terrible que solo él puede prever.".into()),
        }),
        tmdb_id: Some(693_134),
        dest: "Compartida/Películas/4K/Dune Parte dos (2024)".into(),
    }
}

// ─── Labels ──────────────────────────────────────────────────────────────────

pub fn format_bytes_human(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.2} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.0} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    }
}

/// Formats a runtime in minutes as "1h 42min" or "45min".
pub fn format_runtime(mins: u32) -> String {
    if mins >= 60 {
        let h = mins / 60;
        let m = mins % 60;
        if m == 0 {
            format!("{h}h")
        } else {
            format!("{h}h {m}min")
        }
    } else {
        format!("{mins}min")
    }
}

/// Maps a channel count to a layout label (Estéreo, 5.1, 7.1…).
pub fn channels_label(ch: u32) -> String {
    match ch {
        1 => "Mono".to_string(),
        2 => "Estéreo".to_string(),
        3 => "2.1".to_string(),
        5 => "5.0".to_string(),
        6 => "5.1".to_string(),
        7 => "6.1".to_string(),
        8 => "7.1".to_string(),
        n => format!("{n} canales"),
    }
}

/// Converts a TMDB ISO date ("2025-12-05") to a compact Spanish string ("5 dic 2025").
pub fn format_date_es(date: &str) -> String {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() < 3 {
        return date.to_string();
    }
    let month_name = match parts[1] {
        "01" => "ene", "02" => "feb", "03" => "mar", "04" => "abr",
        "05" => "may", "06" => "jun", "07" => "jul", "08" => "ago",
        "09" => "sep", "10" => "oct", "11" => "nov", "12" => "dic",
        _ => parts[1],
    };
    let day = parts[2].trim_start_matches('0');
    format!("{} {} {}", if day.is_empty() { "1" } else { day }, month_name, parts[0])
}

/// Maps an ISO 3166-1 alpha-2 country code to a Spanish country name.
pub fn country_name(code: &str) -> &'static str {
    match code.to_uppercase().as_str() {
        "AD" => "Andorra",        "AE" => "Emiratos Árabes",  "AF" => "Afganistán",
        "AL" => "Albania",        "AM" => "Armenia",           "AO" => "Angola",
        "AR" => "Argentina",      "AT" => "Austria",           "AU" => "Australia",
        "AZ" => "Azerbaiyán",     "BA" => "Bosnia-Herzegovina","BD" => "Bangladesh",
        "BE" => "Bélgica",        "BF" => "Burkina Faso",      "BG" => "Bulgaria",
        "BH" => "Baréin",         "BO" => "Bolivia",           "BR" => "Brasil",
        "BY" => "Bielorrusia",    "CA" => "Canadá",            "CD" => "Congo (RD)",
        "CH" => "Suiza",          "CI" => "Costa de Marfil",   "CL" => "Chile",
        "CM" => "Camerún",        "CN" => "China",             "CO" => "Colombia",
        "CR" => "Costa Rica",     "CU" => "Cuba",              "CY" => "Chipre",
        "CZ" => "Chequia",        "DE" => "Alemania",          "DK" => "Dinamarca",
        "DO" => "Rep. Dominicana","DZ" => "Argelia",           "EC" => "Ecuador",
        "EE" => "Estonia",        "EG" => "Egipto",            "ES" => "España",
        "ET" => "Etiopía",        "FI" => "Finlandia",         "FJ" => "Fiyi",
        "FR" => "Francia",        "GA" => "Gabón",             "GB" => "Reino Unido",
        "GE" => "Georgia",        "GH" => "Ghana",             "GR" => "Grecia",
        "GT" => "Guatemala",      "HK" => "Hong Kong",         "HN" => "Honduras",
        "HR" => "Croacia",        "HU" => "Hungría",           "ID" => "Indonesia",
        "IE" => "Irlanda",        "IL" => "Israel",            "IN" => "India",
        "IQ" => "Irak",           "IR" => "Irán",              "IS" => "Islandia",
        "IT" => "Italia",         "JM" => "Jamaica",           "JO" => "Jordania",
        "JP" => "Japón",          "KE" => "Kenia",             "KG" => "Kirguistán",
        "KH" => "Camboya",        "KR" => "Corea del Sur",     "KW" => "Kuwait",
        "KZ" => "Kazajistán",     "LB" => "Líbano",            "LK" => "Sri Lanka",
        "LT" => "Lituania",       "LU" => "Luxemburgo",        "LV" => "Letonia",
        "LY" => "Libia",          "MA" => "Marruecos",         "MD" => "Moldavia",
        "MK" => "Macedonia del Norte", "ML" => "Malí",         "MM" => "Birmania",
        "MN" => "Mongolia",       "MX" => "México",            "MY" => "Malasia",
        "MZ" => "Mozambique",     "NA" => "Namibia",           "NG" => "Nigeria",
        "NI" => "Nicaragua",      "NL" => "Países Bajos",      "NO" => "Noruega",
        "NP" => "Nepal",          "NZ" => "Nueva Zelanda",     "OM" => "Omán",
        "PA" => "Panamá",         "PE" => "Perú",              "PH" => "Filipinas",
        "PK" => "Pakistán",       "PL" => "Polonia",           "PT" => "Portugal",
        "PY" => "Paraguay",       "QA" => "Catar",             "RO" => "Rumanía",
        "RS" => "Serbia",         "RU" => "Rusia",             "RW" => "Ruanda",
        "SA" => "Arabia Saudí",   "SD" => "Sudán",             "SE" => "Suecia",
        "SG" => "Singapur",       "SI" => "Eslovenia",         "SK" => "Eslovaquia",
        "SN" => "Senegal",        "SO" => "Somalia",           "SS" => "Sudán del Sur",
        "SV" => "El Salvador",    "SY" => "Siria",             "TH" => "Tailandia",
        "TJ" => "Tayikistán",     "TN" => "Túnez",             "TR" => "Turquía",
        "TW" => "Taiwán",         "TZ" => "Tanzania",          "UA" => "Ucrania",
        "UG" => "Uganda",         "US" => "Estados Unidos",    "UY" => "Uruguay",
        "UZ" => "Uzbekistán",     "VE" => "Venezuela",         "VN" => "Vietnam",
        "YE" => "Yemen",          "ZA" => "Sudáfrica",         "ZM" => "Zambia",
        "ZW" => "Zimbabue",
        _ => "",
    }
}

/// Maps an ISO 639-2 (or ISO 639-1) language code to its Spanish display name.
pub fn lang_name(code: &str) -> String {
    match code.to_uppercase().as_str() {
        "ES" | "SPA" | "ESP"           => "Español",
        "EN" | "ENG"                   => "Inglés",
        "FR" | "FRE" | "FRA"           => "Francés",
        "DE" | "GER" | "DEU"           => "Alemán",
        "IT" | "ITA"                   => "Italiano",
        "PT" | "POR"                   => "Portugués",
        "JA" | "JPN"                   => "Japonés",
        "KO" | "KOR"                   => "Coreano",
        "ZH" | "CHI" | "ZHO"           => "Chino",
        "AR" | "ARA"                   => "Árabe",
        "RU" | "RUS"                   => "Ruso",
        "TR" | "TUR"                   => "Turco",
        "PL" | "POL"                   => "Polaco",
        "NL" | "DUT" | "NLD"           => "Neerlandés",
        "SV" | "SWE"                   => "Sueco",
        "NO" | "NOR" | "NOB" | "NNO"   => "Noruego",
        "DA" | "DAN"                   => "Danés",
        "FI" | "FIN"                   => "Finlandés",
        "HE" | "HEB"                   => "Hebreo",
        "HU" | "HUN"                   => "Húngaro",
        "CS" | "CZE" | "CES"           => "Checo",
        "SK" | "SLO" | "SLK"           => "Eslovaco",
        "RO" | "ROM" | "RUM" | "RON"   => "Rumano",
        "EL" | "GRE" | "ELL"           => "Griego",
        "TH" | "THA"                   => "Tailandés",
        "VI" | "VIE"                   => "Vietnamita",
        "ID" | "IND"                   => "Indonesio",
        "MS" | "MAY" | "MSA"           => "Malayo",
        "HI" | "HIN"                   => "Hindi",
        "CA" | "CAT"                   => "Catalán",
        "LA"                           => "Latín",
        // Scene tag for Latin-American Spanish ("Película.LAT.1080p"); real
        // Latin-language audio is vanishingly rare.
        "LAT" | "ES-419"               => "Español latino",
        "DUAL"                         => "Dual",
        "MULTI"                        => "Multi",
        "MUL"                          => "Varios idiomas",
        "UND" | "ZXX" | "MIS" | ""     => "Desconocido",
        "EU" | "EUS" | "BAQ"           => "Euskera",
        "GL" | "GLG"                   => "Gallego",
        "UK" | "UKR"                   => "Ucraniano",
        "HR" | "HRV"                   => "Croata",
        "SR" | "SRP"                   => "Serbio",
        "BG" | "BUL"                   => "Búlgaro",
        "SL" | "SLV"                   => "Esloveno",
        "LT" | "LIT"                   => "Lituano",
        "LV" | "LAV"                   => "Letón",
        "ET" | "EST"                   => "Estonio",
        "SQ" | "ALB" | "SQI"           => "Albanés",
        other                           => return other.to_uppercase(),
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn movie() -> UploadNotice {
        sample_notice()
    }

    fn bare(kind: MediaKind, title: &str) -> UploadNotice {
        UploadNotice {
            kind,
            title: title.into(),
            year: None,
            scope: Scope::Whole,
            release_type: None,
            resolution: None,
            codec: None,
            hdr: None,
            video_bitrate_kbps: None,
            audio_tracks: vec![],
            languages: vec![],
            audio_codec: None,
            subtitle_tracks: vec![],
            subtitle_langs: vec![],
            size_bytes: 0,
            filename: None,
            tmdb: None,
            tmdb_id: None,
            dest: "Compartida/Películas".into(),
        }
    }

    #[test]
    fn sample_card_has_every_section_and_fits() {
        let c = build_upload_caption(&movie(), CAPTION_LIMIT);
        assert!(c.starts_with("🎬 <b>Dune: Parte dos</b> (2024)\n"), "{c}");
        assert!(c.contains("⭐ 8.2 · ⏱️ 2h 47min\n📅 1 mar 2024 · 🌍 Estados Unidos\n🎭 Ciencia ficción · Aventura"), "{c}");
        assert!(c.contains("🎞️ BDREMUX · 2160p · HEVC · Dolby Vision + HDR10 · 58.3 Mbps"), "{c}");
        assert!(c.contains("🔊 Español · EAC3 Atmos 5.1 · 768 kbps\n🔊 Inglés · TrueHD Atmos 7.1 · 4.5 Mbps"), "{c}");
        assert!(c.contains("💬 Español (forzados) · Español · Inglés"), "{c}");
        assert!(c.contains("💾 62.41 GB"), "{c}");
        assert!(c.contains("<blockquote expandable>Paul Atreides"), "{c}");
        assert!(c.contains("<a href=\"https://www.themoviedb.org/movie/693134\">Ver en TMDB</a>"), "{c}");
        assert!(c.ends_with("📄 <code>Dune Parte dos (2024) [BDREMUX 2160p HEVC DV HDR10 SPA EAC3 Atmos ENG TrueHD Atmos].mkv</code>"), "{c}");
        assert!(visible_len(&c) <= CAPTION_LIMIT);
    }

    #[test]
    fn titles_and_paths_are_html_escaped() {
        let mut n = bare(MediaKind::Movie, "Tom & Jerry <Remastered>");
        n.dest = "Compartida/Pelis & Docs".into();
        n.filename = Some("Tom & Jerry.mkv".into());
        n.tmdb = Some(TmdbInfo { overview: Some("A < B & C".into()), ..Default::default() });
        let c = build_upload_caption(&n, CAPTION_LIMIT);
        assert!(c.contains("<b>Tom &amp; Jerry &lt;Remastered&gt;</b>"), "{c}");
        assert!(c.contains("<code>Compartida/Pelis &amp; Docs</code>"), "{c}");
        assert!(c.contains("<code>Tom &amp; Jerry.mkv</code>"), "{c}");
        assert!(c.contains("A &lt; B &amp; C"), "{c}");
        assert!(!c.contains(" & "), "{c}");
    }

    #[test]
    fn tv_link_uses_tv_namespace() {
        let mut n = bare(MediaKind::Tv, "The Bear");
        n.tmdb_id = Some(136315);
        let c = build_upload_caption(&n, CAPTION_LIMIT);
        assert!(c.contains("themoviedb.org/tv/136315"), "{c}");
    }

    #[test]
    fn episode_lines() {
        let line = |season, episode, episode_end| {
            scope_line(&Scope::Episode { season, episode, episode_end })
        };
        assert_eq!(line(Some(1), Some(5), None).as_deref(), Some("🗂 Temporada 1 · Episodio 5"));
        assert_eq!(line(Some(2), Some(1), Some(3)).as_deref(), Some("🗂 Temporada 2 · Episodios 1–3"));
        assert_eq!(line(Some(2), None, None).as_deref(), Some("🗂 Temporada 2"));
        assert_eq!(line(None, None, None), None);
    }

    #[test]
    fn batch_lines_pluralise_and_list_seasons() {
        let l = |seasons: Vec<u8>, files| scope_line(&Scope::Batch { seasons, files });
        assert_eq!(l(vec![1], 1).as_deref(), Some("🗂 Temporada 1 · 1 episodio"));
        assert_eq!(l(vec![1, 1, 1], 10).as_deref(), Some("🗂 Temporada 1 · 10 episodios"));
        assert_eq!(l(vec![3, 1, 2], 24).as_deref(), Some("🗂 Temporadas 1–3 · 24 episodios"));
        assert_eq!(l(vec![1, 4], 20).as_deref(), Some("🗂 Temporadas 1, 4 · 20 episodios"));
        assert_eq!(l(vec![], 6).as_deref(), Some("🗂 6 episodios"));
    }

    #[test]
    fn show_first_air_date_is_not_presented_as_release_date() {
        let mut n = bare(MediaKind::Tv, "The Bear");
        n.tmdb = Some(TmdbInfo { release_date: Some("2022-06-23".into()), ..Default::default() });
        assert!(!build_upload_caption(&n, CAPTION_LIMIT).contains("📅"));
    }

    #[test]
    fn hdr_labels() {
        assert_eq!(hdr_display("DV+HDR10").as_deref(), Some("Dolby Vision + HDR10"));
        assert_eq!(hdr_display("DV+HDR10+").as_deref(), Some("Dolby Vision + HDR10+"));
        assert_eq!(hdr_display("HDR10+").as_deref(), Some("HDR10+"));
        assert_eq!(hdr_display("DV").as_deref(), Some("Dolby Vision"));
        assert_eq!(hdr_display("HDR10+DV").as_deref(), Some("Dolby Vision + HDR10"));
        assert_eq!(hdr_display("HLG").as_deref(), Some("HLG"));
        assert_eq!(hdr_display("SDR"), None);
        assert_eq!(hdr_display(""), None);
    }

    #[test]
    fn languages_unknown_and_scene_tags() {
        assert_eq!(lang_name(""), "Desconocido");
        assert_eq!(lang_name("und"), "Desconocido");
        assert_eq!(lang_name("LAT"), "Español latino");
        assert_eq!(lang_name("spa"), "Español");
        assert_eq!(lang_name("xyz"), "XYZ");
    }

    #[test]
    fn subtitles_without_language_and_forced_dedup() {
        let mut n = bare(MediaKind::Movie, "X");
        n.subtitle_tracks = vec![
            SubtitleTrack { codec: "subrip".into(), language: None, is_default: false, is_forced: false },
            SubtitleTrack { codec: "subrip".into(), language: Some("spa".into()), is_default: false, is_forced: true },
            SubtitleTrack { codec: "ass".into(), language: Some("spa".into()), is_default: false, is_forced: true },
        ];
        assert_eq!(subtitles_line(&n).as_deref(), Some("💬 Desconocido · Español (forzados)"));
    }

    #[test]
    fn audio_falls_back_to_file_name_languages() {
        let mut n = bare(MediaKind::Movie, "X");
        n.languages = vec!["SPA".into(), "ENG".into()];
        n.audio_codec = Some("DTS-HD MA".into());
        assert_eq!(audio_lines(&n), vec!["🔊 Español · Inglés · DTS-HD MA".to_string()]);
    }

    #[test]
    fn audio_list_collapses_many_tracks() {
        let mut n = movie();
        n.audio_tracks = ["spa", "eng", "fre", "ger", "ita", "jpn", "por", "rus"]
            .iter()
            .map(|l| AudioTrack {
                codec: "AC3".into(),
                language: Some((*l).into()),
                channels: Some(6),
                is_default: false,
                bitrate_kbps: Some(640),
            })
            .collect();
        let c = build_upload_caption(&n, CAPTION_LIMIT);
        assert_eq!(c.matches("🔊 ").count(), AUDIO_MAX_LINES, "{c}");
        assert!(c.contains("🔊 +4 pistas más"), "{c}");
    }

    #[test]
    fn budget_shrinks_synopsis_before_dropping_link_and_folder() {
        let mut n = movie();
        n.tmdb.as_mut().unwrap().overview = Some("palabra ".repeat(400));
        n.subtitle_tracks = ["spa", "eng", "fre", "ger", "ita", "jpn", "por", "rus", "ara", "kor", "chi", "pol"]
            .iter()
            .map(|l| SubtitleTrack { codec: "subrip".into(), language: Some((*l).into()), is_default: false, is_forced: false })
            .collect();
        let c = build_upload_caption(&n, CAPTION_LIMIT);
        assert!(visible_len(&c) <= CAPTION_LIMIT, "{}", visible_len(&c));
        assert!(c.contains("Ver en TMDB"), "{c}");
        assert!(c.contains("📂 <code>Compartida/Películas/4K/Dune Parte dos (2024)</code>"), "{c}");
        assert!(c.contains("🎞️ BDREMUX"), "{c}");

        // A tiny budget drops the synopsis entirely but keeps the essentials.
        let tight = build_upload_caption(&n, 400);
        assert!(!tight.contains("blockquote"), "{tight}");
        assert!(tight.contains("📂"), "{tight}");
    }

    #[test]
    fn visible_len_counts_like_telegram() {
        assert_eq!(visible_len("<b>a &amp; b</b>"), 5);
        // 🎬 is outside the BMP → 2 UTF-16 code units.
        assert_eq!(visible_len("🎬"), 2);
        assert_eq!(visible_len("<a href=\"x\">TMDB</a>"), 4);
    }

    #[test]
    fn overview_is_flattened_and_cut_on_a_word() {
        let s = shorten("Una frase\n\ncon saltos   de línea y bastante texto más", 20);
        assert!(!s.contains('\n'));
        assert!(s.ends_with('…'));
        assert!(s.chars().count() <= 21, "{s}");
    }

    #[test]
    fn partial_failure_card() {
        let failed = vec!["S01E03 & co.mkv".to_string()];
        let c = build_partial_failure("Fargo", &Scope::Batch { seasons: vec![1], files: 10 }, 9, 10, &failed, "Compartida/Series/Fargo");
        assert!(c.contains("✅ 9 de 10 episodios subidos"), "{c}");
        assert!(c.contains("❌ Ha fallado 1 episodio:"), "{c}");
        assert!(c.contains("S01E03 &amp; co.mkv"), "{c}");
        assert!(c.contains("🗂 Temporada 1 · 10 episodios"), "{c}");
    }

    #[test]
    fn display_dest_anchors_on_compartida() {
        assert_eq!(display_dest("/mnt/ftp/Compartida/Series/Fargo/"), "Compartida/Series/Fargo");
        assert_eq!(display_dest("/media/Pelis/"), "/media/Pelis");
        assert_eq!(display_dest("/"), "/");
    }

    #[test]
    fn personal_new_content_line() {
        let mut n = bare(MediaKind::Tv, "Fargo & Co");
        n.year = Some("2014".into());
        n.scope = Scope::Batch { seasons: vec![5], files: 10 };
        n.resolution = Some("1080p".into());
        assert_eq!(
            build_new_content_line(&n),
            "🆕 Nuevo en la biblioteca: <b>Fargo &amp; Co</b> (2014)\nTemporada 5 · 10 episodios · 1080p"
        );
    }

    #[test]
    fn download_done_line() {
        assert_eq!(
            build_download_done(Some("Alien"), "Alien (1979).mkv", 0),
            "✅ Descarga completada: <b>Alien</b>\n📄 <code>Alien (1979).mkv</code>"
        );
        assert_eq!(
            build_download_done(None, "a<b>.mkv", 2_147_483_648),
            "✅ Descarga completada: <code>a&lt;b&gt;.mkv</code> · 2.00 GB"
        );
    }

    #[test]
    fn misc_labels() {
        assert_eq!(format_date_es("2024-03-01"), "1 mar 2024");
        assert_eq!(format_date_es("2024-12-25"), "25 dic 2024");
        assert_eq!(channels_label(6), "5.1");
        assert_eq!(channels_label(3), "2.1");
        assert_eq!(channels_label(12), "12 canales");
        assert_eq!(format_bitrate(768), "768 kbps");
        assert_eq!(format_bitrate(24_500), "24.5 Mbps");
        assert_eq!(format_runtime(120), "2h");
    }
}
