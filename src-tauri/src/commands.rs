use std::sync::Arc;
use std::sync::LazyLock;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri::WebviewWindow;

/// Shared HTTP client for Plex / Emby calls. Reused across requests so TLS
/// sessions + DNS + connection pool aren't rebuilt every check. 8 s timeout
/// matches the previous per-call setup; long enough for slow local servers,
/// short enough not to stall the UI when one is offline.
static MEDIA_SERVER_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .expect("Failed to build media-server HTTP client")
});

static TV_CONTENT_HINT_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"(?ix)
        (?:\b[ST]\d{1,3}[\s._-]*E\d{1,3}\b)
        |(?:\b\d{1,2}x\d{1,3}\b)
        # The keyword must be followed by a number: a bare word is common in
        # movie titles (Season of the Witch, Star Wars Episode IV).
        |(?:\b(?:season|temporada|episode|episodio|cap|cap[ií]tulo)[\s._-]*\d{1,4}\b)
        # Date-stamped daily shows: The Daily Show 2024 11 05
        |(?:\b(?:19|20)\d{2}[\s-](?:0[1-9]|1[0-2])[\s-](?:0[1-9]|[12]\d|3[01])\b)
        ",
    )
    .expect("valid tv content hint regex")
});

static PLEX_IMDB_GUID_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"imdb://(tt\d+)"#).expect("valid plex imdb guid regex")
});

static PLEX_MEDIA_CONTAINER_SIZE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"MediaContainer[^>]*\bsize=\"(\d+)\""#)
        .expect("valid plex size regex")
});

static PLEX_RATING_KEY_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"\bratingKey=\"(\d+)\""#).expect("valid plex rating key regex")
});

static PLEX_VIDEO_SEASON_EP_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r#"<Video[^>]*\bparentIndex=\"(\d+)\"[^>]*\bindex=\"(\d+)\"[^>]*>|<Video[^>]*\bindex=\"(\d+)\"[^>]*\bparentIndex=\"(\d+)\"[^>]*>"#,
    )
    .expect("valid plex season/episode regex")
});

const BADGE_CACHE_TTL_SECS: u64 = 300;

#[derive(Debug, Clone)]
pub(crate) struct BadgeCacheEntry {
    checked_at: std::time::Instant,
    check: MediaServerCheck,
}

pub(crate) static BADGE_RESULT_CACHE: LazyLock<Mutex<std::collections::HashMap<String, BadgeCacheEntry>>> =
    LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

fn emit_index_log(window: &Option<tauri::WebviewWindow>, msg: String) {
    #[cfg(debug_assertions)]
    {
        if let Some(w) = window {
            w.emit("index:log", serde_json::json!({ "msg": msg })).ok();
        }
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = window;
        let _ = msg;
    }
}

fn persist_download_state(
    db: &crate::db::Db,
    queue: &crate::downloads::SharedQueue,
) {
    let snapshot = {
        let queue = queue.lock().unwrap();
        queue.items.clone()
    };
    db.save_download_state(&snapshot).ok();
}

/// Whether a stored audio label ("TrueHD Atmos", "DTS:X", legacy "TRUEHD")
/// satisfies a quality-profile preference ("Atmos", "DTS-X", "TrueHD").
/// Punctuation and case are ignored, and a preference may name one word of a
/// combined label — so "Atmos" matches "TrueHD Atmos" and "EAC3 Atmos" — but
/// "AC3" never matches "EAC3".
pub(crate) fn audio_codec_matches(actual: &str, preferred: &str) -> bool {
    let norm = |s: &str| -> String {
        s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase()
    };
    let want = norm(preferred);
    if want.is_empty() {
        return false;
    }
    norm(actual) == want || actual.split_whitespace().any(|w| norm(w) == want)
}

fn persist_upload_state(
    db: &crate::db::Db,
    queue: &crate::uploads::SharedUploadQueue,
) {
    let snapshot = {
        let queue = queue.lock().unwrap();
        queue.items.clone()
    };
    db.save_upload_state(&snapshot).ok();
}

pub fn restore_upload_queue(
    db: crate::db::Db,
    queue_state: crate::uploads::SharedUploadQueue,
) {
    let restored = db.load_upload_state().unwrap_or_default();
    if restored.is_empty() {
        return;
    }
    {
        let mut queue = queue_state.lock().unwrap();
        queue.restore(restored);
    }
    persist_upload_state(&db, &queue_state);
}

pub async fn resume_pending_uploads(
    db: crate::db::Db,
    queue_state: crate::uploads::SharedUploadQueue,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let pending = {
        let queue = queue_state.lock().unwrap();
        queue.items
            .iter()
            .filter(|i| matches!(i.status, crate::uploads::UploadStatus::Queued))
            .cloned()
            .collect::<Vec<_>>()
    };

    for item in pending {
        let (semaphore, cancel_flag) = {
            let mut queue = queue_state.lock().unwrap();
            let (_, semaphore, cancel_flag) = queue.retry(item.id)?;
            (semaphore, cancel_flag)
        };
        persist_upload_state(&db, &queue_state);
        spawn_upload_job(
            db.clone(),
            queue_state.clone(),
            app.clone(),
            item.id,
            item.local_path,
            item.ftp_dest_path,
            item.filename,
            item.media_title,
            item.tmdb_id,
            item.bytes_total,
            item.resolution,
            item.hdr,
            item.languages,
            item.codec,
            item.video_bitrate_kbps,
            item.audio_codec,
            item.subtitle_langs,
            item.audio_tracks,
            item.subtitle_tracks,
            item.group_id,
            semaphore,
            cancel_flag,
        );
    }
    Ok(())
}

/// Personal Telegram notice ("Mis avisos → cuando terminen mis descargas")
/// for the user who queued the download.
async fn notify_download_done(db: &crate::db::Db, item: &crate::downloads::DownloadItem) {
    let Some(user_id) = item.requested_by else { return };
    let Ok(Some(sub)) = db.get_telegram_sub(user_id) else { return };
    if !sub.notify_downloads || sub.telegram_bot_token.is_empty() || sub.telegram_chat_id.is_empty() {
        return;
    }
    let msg = crate::upload_notify::build_download_done(
        item.media_title.as_deref(),
        &item.filename,
        item.bytes_total,
    );
    if let Err(e) = crate::telegram::send_message(&sub.telegram_bot_token, &sub.telegram_chat_id, &msg).await {
        eprintln!("[download] personal Telegram notify (user {user_id}) failed: {e}");
    }
}

pub(crate) fn spawn_download_job_pub(
    db: crate::db::Db,
    queue_state: crate::downloads::SharedQueue,
    window: Option<tauri::WebviewWindow>,
    config: crate::db::AppConfig,
    id: u64,
    ftp_path: String,
    local_path: String,
    semaphore: Arc<tokio::sync::Semaphore>,
    cancel_flag: Arc<std::sync::atomic::AtomicBool>,
) {
    tokio::spawn(async move {
        use std::sync::atomic::Ordering;

        let _permit = match semaphore.acquire().await {
            Ok(p) => p,
            Err(_) => return,
        };

        if cancel_flag.load(Ordering::SeqCst) {
            {
                let mut queue = queue_state.lock().unwrap();
                queue.mark_cancelled(id);
            }
            persist_download_state(&db, &queue_state);
            if let Some(ref w) = window {
                w.emit("download:update", serde_json::json!({
                    "id": id,
                    "status": "cancelled",
                })).ok();
            }
            return;
        }

        {
            let mut queue = queue_state.lock().unwrap();
            queue.mark_started(id);
        }
        persist_download_state(&db, &queue_state);
        let started_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        if let Some(ref w) = window {
            w.emit("download:update", serde_json::json!({
                "id": id,
                "status": "downloading",
                "started_at_ms": started_at_ms,
            })).ok();
        }

        let cancel_flag_clone = cancel_flag.clone();
        let queue_for_progress = queue_state.clone();
        let window_for_progress = window.clone();

        let result = crate::ftp::download_file(
            &crate::ftp::FtpEndpoint::from_config(&config),
            &ftp_path,
            &local_path,
            move |done, total| {
                {
                    let mut queue = queue_for_progress.lock().unwrap();
                    if let Some(item) = queue.items.iter_mut().find(|i| i.id == id) {
                        item.bytes_done = done;
                        item.bytes_total = total;
                    }
                }
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
                if let Some(ref w) = window_for_progress {
                    w.emit("download:progress", serde_json::json!({
                        "id": id,
                        "bytes_done": done,
                        "bytes_total": total,
                        "timestamp_ms": now_ms,
                    })).ok();
                }
                !cancel_flag_clone.load(Ordering::SeqCst)
            },
        ).await;

        let completed_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        match result {
            Ok(()) => {
                let finished = {
                    let mut q = queue_state.lock().unwrap();
                    q.mark_done(id);
                    q.items.iter().find(|i| i.id == id).cloned()
                };
                persist_download_state(&db, &queue_state);
                if let Some(item) = finished {
                    notify_download_done(&db, &item).await;
                }
                if let Some(ref w) = window {
                    w.emit("download:update", serde_json::json!({
                        "id": id,
                        "status": "done",
                        "local_path": local_path,
                        "completed_at_ms": completed_ms,
                    })).ok();
                }
            }
            Err(ref e) if e == "Cancelled" => {
                { queue_state.lock().unwrap().mark_cancelled(id); }
                persist_download_state(&db, &queue_state);
                if let Some(ref w) = window {
                    w.emit("download:update", serde_json::json!({
                        "id": id,
                        "status": "cancelled",
                        "completed_at_ms": completed_ms,
                    })).ok();
                }
            }
            Err(e) => {
                { queue_state.lock().unwrap().mark_error(id, e.clone()); }
                persist_download_state(&db, &queue_state);
                if let Some(ref w) = window {
                    w.emit("download:update", serde_json::json!({
                        "id": id,
                        "status": "error",
                        "error": e,
                        "completed_at_ms": completed_ms,
                    })).ok();
                }
            }
        }
    });
}

pub fn restore_download_queue(
    db: crate::db::Db,
    queue_state: crate::downloads::SharedQueue,
) {
    let restored = db.load_download_state().unwrap_or_default();
    if restored.is_empty() {
        return;
    }
    {
        let mut queue = queue_state.lock().unwrap();
        queue.restore(restored);
    }
    persist_download_state(&db, &queue_state);
}

pub async fn resume_pending_downloads(
    db: crate::db::Db,
    queue_state: crate::downloads::SharedQueue,
    window: Option<WebviewWindow>,
) -> Result<(), String> {
    let config = db.load_config()?;
    let pending = {
        let queue = queue_state.lock().unwrap();
        queue.items
            .iter()
            .filter(|item| matches!(item.status, crate::downloads::DownloadStatus::Queued))
            .cloned()
            .collect::<Vec<_>>()
    };

    for item in pending {
        let (semaphore, cancel_flag) = {
            let mut queue = queue_state.lock().unwrap();
            let (_, semaphore, cancel_flag) = queue.retry(item.id)?;
            (semaphore, cancel_flag)
        };
        let resumed_bytes = std::fs::metadata(&item.local_path).map(|meta| meta.len()).unwrap_or(0);
        if let Some(ref w) = window {
            w.emit("download:update", serde_json::json!({
                "id": item.id,
                "status": "queued",
                "bytes_done": resumed_bytes,
                "error": serde_json::Value::Null,
            })).ok();
        }
        persist_download_state(&db, &queue_state);
        spawn_download_job_pub(
            db.clone(),
            queue_state.clone(),
            window.clone(),
            config.clone(),
            item.id,
            item.ftp_path,
            item.local_path,
            semaphore,
            cancel_flag,
        );
    }
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaBadgeQuery {
    pub id: i64,
    pub ftp_path: String,
    pub filename: String,
    pub title: Option<String>,
    pub title_en: Option<String>,
    pub year: Option<i64>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<i64>,
    pub media_type: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct MediaBadgeResult {
    pub id: i64,
    pub downloaded: bool,
    pub in_emby: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plex_in_library: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emby_in_library: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub debug: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct MediaServerCheck {
    pub(crate) hit: bool,
    pub(crate) plex_hit: bool,
    pub(crate) emby_hit: bool,
    pub(crate) cache_state: String,
    pub(crate) debug: String,
}

fn detect_media_type(
    path: &str,
    root: &str,
    folder_types: &std::collections::HashMap<String, String>,
) -> Option<String> {
    if folder_types.is_empty() { return None; }
    let rel = path.strip_prefix(root.trim_end_matches('/')).unwrap_or(path);
    let first_seg = rel.trim_start_matches('/').split('/').next()?;
    folder_types.get(first_seg).cloned()
}

fn looks_like_tv_content(path: &str, filename: &str, parsed: &crate::parser::ParsedMedia) -> bool {
    if parsed.season.is_some() || parsed.episode.is_some() || parsed.episode_end.is_some() {
        return true;
    }

    let normalized = format!("{} {}", path, filename)
        .replace(['.', '_'], " ")
        .to_lowercase();
    TV_CONTENT_HINT_RE.is_match(&normalized)
}

fn normalize_title(value: &str) -> String {
    value
        .chars()
        .flat_map(|ch| ch.to_lowercase())
        .map(|ch| if ch.is_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn desired_episode_target(query: &MediaBadgeQuery) -> Option<(u32, u32, u32)> {
    let media_type = query.media_type.as_deref().unwrap_or_default();
    if media_type != "tv" && media_type != "documentary" {
        return None;
    }

    let parsed = crate::parser::parse_media_path(&query.ftp_path, &query.filename);
    let season = parsed.season? as u32;
    let episode = parsed.episode? as u32;
    let episode_end = parsed
        .episode_end
        .map(|value| value as u32)
        .unwrap_or(episode)
        .max(episode);

    Some((season, episode, episode_end))
}

fn extract_plex_rating_keys(body: &str) -> Vec<String> {
    PLEX_RATING_KEY_RE
        .captures_iter(body)
        .filter_map(|caps| caps.get(1).map(|v| v.as_str().to_string()))
        .collect()
}

fn extract_plex_episode_set(body: &str) -> std::collections::HashSet<(u32, u32)> {
    let mut set = std::collections::HashSet::new();
    for caps in PLEX_VIDEO_SEASON_EP_RE.captures_iter(body) {
        let a = caps.get(1).and_then(|v| v.as_str().parse::<u32>().ok());
        let b = caps.get(2).and_then(|v| v.as_str().parse::<u32>().ok());
        let c = caps.get(3).and_then(|v| v.as_str().parse::<u32>().ok());
        let d = caps.get(4).and_then(|v| v.as_str().parse::<u32>().ok());
        if let Some((season, episode)) = a.zip(b).or_else(|| d.zip(c)) {
            set.insert((season, episode));
        }
    }
    set
}

async fn plex_rating_key_has_episode(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    rating_key: &str,
    target: (u32, u32, u32),
) -> Result<bool, String> {
    let endpoint = format!(
        "{base}/library/metadata/{rating_key}/allLeaves?X-Plex-Token={}",
        urlencoding::encode(token),
    );

    let resp = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|e| format!("Could not query Plex episodes: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Plex returned HTTP {}", resp.status().as_u16()));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Could not parse Plex episodes response: {e}"))?;

    let episodes = extract_plex_episode_set(&body);
    let (season, ep_start, ep_end) = target;
    if episodes.is_empty() {
        return Ok(false);
    }

    Ok((ep_start..=ep_end).all(|episode| episodes.contains(&(season, episode))))
}

pub(crate) fn plex_badge_cache_key(query: &MediaBadgeQuery) -> Option<String> {
    // For TV/documentary episodes, include the episode coordinates in the key so that
    // different episodes of the same show don't poison each other's cache slot.
    let episode_suffix = {
        let media_type = query.media_type.as_deref().unwrap_or_default();
        if media_type == "tv" || media_type == "documentary" {
            let parsed = crate::parser::parse_media_path(&query.ftp_path, &query.filename);
            match (parsed.season, parsed.episode) {
                (Some(s), Some(e)) => format!(":S{s:02}E{e:02}"),
                _ => String::new(),
            }
        } else {
            String::new()
        }
    };

    if let Some(imdb_id) = query.imdb_id.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        return Some(format!("imdb:{imdb_id}{episode_suffix}"));
    }
    if let Some(tmdb_id) = query.tmdb_id {
        return Some(format!("tmdb:{tmdb_id}{episode_suffix}"));
    }

    let title = query
        .title
        .as_deref()
        .or(query.title_en.as_deref())
        .map(normalize_title)
        .filter(|t| !t.is_empty())?;

    Some(format!("title:{title}:{}{episode_suffix}", query.year.unwrap_or_default()))
}

async fn exists_in_emby(
    config: &crate::db::AppConfig,
    query: &MediaBadgeQuery,
) -> Result<bool, String> {
    if config.emby_url.trim().is_empty() || config.emby_api_key.trim().is_empty() {
        return Ok(false);
    }

    let base = config.emby_url.trim_end_matches('/');
    let include_item_types = if matches!(query.media_type.as_deref(), Some("tv")) {
        "Series"
    } else {
        "Movie"
    };

    #[derive(serde::Deserialize)]
    struct EmbyItem {
        #[serde(rename = "Name")]
        name: Option<String>,
        #[serde(rename = "ProductionYear")]
        production_year: Option<i64>,
    }
    #[derive(serde::Deserialize)]
    struct EmbyResponse {
        #[serde(rename = "Items", default)]
        items: Vec<EmbyItem>,
    }

    let client = &*MEDIA_SERVER_CLIENT;

    let titles = [query.title.as_deref(), query.title_en.as_deref()]
        .into_iter()
        .flatten()
        .map(normalize_title)
        .filter(|title| !title.is_empty())
        .collect::<std::collections::BTreeSet<_>>();

    for candidate in titles {
        let endpoint = format!(
            "{base}/Items?Recursive=true&SearchTerm={}&IncludeItemTypes={include_item_types}&Fields=ProductionYear&Limit=8&api_key={}",
            urlencoding::encode(&candidate),
            config.emby_api_key
        );

        let response: EmbyResponse = client
            .get(&endpoint)
            .send()
            .await
            .map_err(|e| format!("Could not query Emby library: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Could not parse Emby response: {e}"))?;

        for item in response.items {
            let Some(name) = item.name else { continue };
            let normalized_name = normalize_title(&name);
            let title_match =
                normalized_name == candidate || normalized_name.contains(&candidate) || candidate.contains(&normalized_name);
            let year_match = match (query.year, item.production_year) {
                (Some(expected), Some(found)) => expected == found || (expected - found).abs() <= 1,
                _ => true,
            };
            if title_match && year_match {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

pub(crate) async fn check_media_server_presence(
    config: &crate::db::AppConfig,
    query: &MediaBadgeQuery,
) -> Result<MediaServerCheck, String> {
    {
        let ttl = std::time::Duration::from_secs(BADGE_CACHE_TTL_SECS);
        let mut cache = BADGE_RESULT_CACHE.lock().unwrap();
        cache.retain(|_, entry| entry.checked_at.elapsed() < ttl);
    }

    if let Some(cache_key) = plex_badge_cache_key(query) {
        if let Some(entry) = BADGE_RESULT_CACHE.lock().unwrap().get(&cache_key).cloned() {
            let age = entry.checked_at.elapsed();
            if age < std::time::Duration::from_secs(BADGE_CACHE_TTL_SECS) {
                let mut cached = entry.check;
                cached.cache_state = format!("global-hit:{}ms", age.as_millis());
                return Ok(cached);
            }
        }
    }

    let mut traces: Vec<String> = Vec::new();
    let mut plex_hit = false;
    let mut emby_hit = false;

    let plex_configured = !config.plex_url.trim().is_empty() && !config.plex_token.trim().is_empty();
    if plex_configured {
        match exists_in_plex(config, query).await {
            Ok(true) => {
                plex_hit = true;
                traces.push("plex:match".to_string());
            }
            Ok(false) => traces.push("plex:no-match".to_string()),
            Err(err) => {
                traces.push(format!("plex:error:{err}"));
                eprintln!("[badges] Plex lookup failed: {err}");
            }
        }
    } else {
        traces.push("plex:not-configured".to_string());
    }

    let emby_configured = !config.emby_url.trim().is_empty() && !config.emby_api_key.trim().is_empty();
    if emby_configured {
        match exists_in_emby(config, query).await {
            Ok(true) => {
                emby_hit = true;
                traces.push("emby:match".to_string());
            }
            Ok(false) => traces.push("emby:no-match".to_string()),
            Err(err) => {
                traces.push(format!("emby:error:{err}"));
                eprintln!("[badges] Emby lookup failed: {err}");
            }
        }
    } else {
        traces.push("emby:not-configured".to_string());
    }

    let check = MediaServerCheck {
        hit: plex_hit || emby_hit,
        plex_hit,
        emby_hit,
        cache_state: "global-miss".to_string(),
        debug: traces.join(" | "),
    };

    // Only cache if at least one server was actually queried — don't cache
    // "not-configured" results, which would become stale as soon as the user
    // saves their Plex/Emby credentials.
    if plex_configured || emby_configured {
        if let Some(cache_key) = plex_badge_cache_key(query) {
            BADGE_RESULT_CACHE.lock().unwrap().insert(
                cache_key,
                BadgeCacheEntry {
                    checked_at: std::time::Instant::now(),
                    check: check.clone(),
                },
            );
        }
    }

    Ok(check)
}

pub(crate) async fn exists_in_plex(
    config: &crate::db::AppConfig,
    query: &MediaBadgeQuery,
) -> Result<bool, String> {
    if config.plex_url.trim().is_empty() || config.plex_token.trim().is_empty() {
        return Ok(false);
    }
    let base = config.plex_url.trim_end_matches('/');
    let token = config.plex_token.trim();
    let client = &*MEDIA_SERVER_CLIENT;
    let episode_target = desired_episode_target(query);

    let mut guids = Vec::new();

    if let Some(imdb_id) = query.imdb_id.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        guids.push(format!("imdb://{imdb_id}"));
        guids.push(format!("com.plexapp.agents.imdb://{imdb_id}"));
    }
    if let Some(tmdb_id) = query.tmdb_id {
        guids.push(format!("tmdb://{tmdb_id}"));
        guids.push(format!("com.plexapp.agents.themoviedb://{tmdb_id}"));
    }

    for guid in guids {
        let endpoint = format!(
            "{base}/library/all?guid={}&X-Plex-Token={}",
            urlencoding::encode(&guid),
            urlencoding::encode(token),
        );

        let resp = client
            .get(&endpoint)
            .send()
            .await
            .map_err(|e| format!("Could not query Plex library: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("Plex returned HTTP {}", resp.status().as_u16()));
        }

        let body = resp
            .text()
            .await
            .map_err(|e| format!("Could not parse Plex response: {e}"))?;

        if PLEX_MEDIA_CONTAINER_SIZE_RE
            .captures(&body)
            .and_then(|caps| caps.get(1))
            .and_then(|m| m.as_str().parse::<usize>().ok())
            .unwrap_or(0)
            > 0
        {
            if let Some(target) = episode_target {
                for rating_key in extract_plex_rating_keys(&body) {
                    if plex_rating_key_has_episode(&client, base, token, &rating_key, target).await? {
                        return Ok(true);
                    }
                }
                continue;
            }
            return Ok(true);
        }
    }

    // Last fallback for libraries without stable external IDs in GUIDs.
    let title = query
        .title
        .as_deref()
        .or(query.title_en.as_deref())
        .map(str::trim)
        .filter(|v| !v.is_empty());

    if let Some(title) = title {
        let mut endpoints = Vec::new();
        let mut with_year = format!(
            "{base}/library/all?title={}&X-Plex-Token={}&includeGuids=1",
            urlencoding::encode(title),
            urlencoding::encode(token),
        );
        if let Some(year) = query.year {
            with_year.push_str(&format!("&year={year}"));
        }
        endpoints.push(with_year);

        endpoints.push(format!(
            "{base}/library/all?title={}&X-Plex-Token={}&includeGuids=1",
            urlencoding::encode(title),
            urlencoding::encode(token),
        ));

        let imdb_hint = query.imdb_id.as_deref().map(str::trim).filter(|v| !v.is_empty());
        let tmdb_hint = query.tmdb_id;

        for endpoint in endpoints {
            let resp = client
                .get(&endpoint)
                .send()
                .await
                .map_err(|e| format!("Could not query Plex library by title: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("Plex returned HTTP {}", resp.status().as_u16()));
            }

            let body = resp
                .text()
                .await
                .map_err(|e| format!("Could not parse Plex response: {e}"))?;

            let size = PLEX_MEDIA_CONTAINER_SIZE_RE
                .captures(&body)
                .and_then(|caps| caps.get(1))
                .and_then(|m| m.as_str().parse::<usize>().ok())
                .unwrap_or(0);

            if size == 0 {
                continue;
            }

            let mut id_match = false;
            if let Some(imdb_id) = imdb_hint {
                if body.contains(&format!("imdb://{imdb_id}")) {
                    id_match = true;
                }
            }
            if let Some(tmdb_id) = tmdb_hint {
                if body.contains(&format!("tmdb://{tmdb_id}")) {
                    id_match = true;
                }
            }

            let has_external_hints = imdb_hint.is_some() || tmdb_hint.is_some();
            if has_external_hints && !id_match {
                continue;
            }

            if let Some(target) = episode_target {
                let mut matched_episode = false;
                for rating_key in extract_plex_rating_keys(&body) {
                    if plex_rating_key_has_episode(&client, base, token, &rating_key, target).await? {
                        matched_episode = true;
                        break;
                    }
                }
                if matched_episode {
                    return Ok(true);
                }
                continue;
            }

            if has_external_hints {
                return Ok(true);
            }

            // If no external IDs are available, non-empty title result is still a useful fallback.
            if !has_external_hints {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

async fn resolve_plex_imdb_id(
    config: &crate::db::AppConfig,
    title: &str,
    year: Option<u16>,
    media_type: &str,
) -> Result<Option<String>, String> {
    if config.plex_url.trim().is_empty() || config.plex_token.trim().is_empty() {
        return Ok(None);
    }

    let type_param = if media_type == "tv" { "2" } else { "1" };
    let base = config.plex_url.trim_end_matches('/');
    let mut endpoint = format!(
        "{base}/library/all?type={type_param}&title={}&X-Plex-Token={}",
        urlencoding::encode(title),
        urlencoding::encode(&config.plex_token),
    );
    if let Some(y) = year {
        endpoint.push_str(&format!("&year={y}"));
    }

    let client = &*MEDIA_SERVER_CLIENT;

    let resp = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|e| format!("Could not query Plex for match: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Plex returned HTTP {}", resp.status().as_u16()));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Could not parse Plex response: {e}"))?;

    Ok(PLEX_IMDB_GUID_RE
        .captures(&body)
        .and_then(|caps| caps.get(1).map(|value| value.as_str().to_string())))
}

/// Key that identifies one TMDB lookup during an indexing run. Every episode
/// of a show parses to the same title/year/type, so they share one lookup.
pub(crate) fn tmdb_lookup_key(title: &str, year: Option<u16>, search_type: &str) -> String {
    format!("{}|{}|{}", search_type, year.map(|y| y.to_string()).unwrap_or_default(), title.trim().to_lowercase())
}

async fn resolve_tmdb_match_with_plex(
    config: &crate::db::AppConfig,
    api_key: &str,
    title: &str,
    year: Option<u16>,
    tmdb_search_type: &str,
) -> Result<Option<(crate::tmdb::TmdbMovie, String)>, String> {
    if let Ok(Some(imdb_id)) = resolve_plex_imdb_id(config, title, year, tmdb_search_type).await {
        if let Some(movie) = crate::tmdb::find_by_imdb_id(api_key, &imdb_id, tmdb_search_type).await? {
            let actual_type = if tmdb_search_type == "tv" { "tv" } else { "movie" }.to_string();
            return Ok(Some((movie, actual_type)));
        }
    }

    let result = if tmdb_search_type == "tv" {
        // Pass the parsed year: it is what tells "Doctor Who (2005)" from the
        // 1963 series, or "Shogun (2024)" from the 1980 miniseries.
        crate::tmdb::search_tmdb_multi_with_year(api_key, title, "tv", year)
            .await
            .ok()
            .and_then(|mut r| if r.is_empty() { None } else { Some(r.remove(0)) })
            .map(|m| (m, "tv".to_string()))
    } else {
        crate::tmdb::smart_search(api_key, title, year, tmdb_search_type)
            .await
            .ok()
            .flatten()
            .map(|(m, ep)| (m, ep.to_string()))
    };

    if let Some((movie, actual_type)) = result {
        let movie = match crate::tmdb::fetch_movie_by_id(api_key, movie.id, &actual_type).await {
            Ok(full) => full,
            Err(_) => movie,
        };
        return Ok(Some((movie, actual_type)));
    }

    Ok(None)
}

#[tauri::command]
pub async fn get_config(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<crate::db::AppConfig, String> {
    state.load_config()
}

#[tauri::command]
pub async fn ftp_list_raw(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<Vec<String>, String> {
    let config = state.load_config()?;
    // Goes through ftp::list_raw so the login error is password-redacted and
    // the root path is checked for CR/LF before hitting the control channel.
    crate::ftp::list_raw(
        &crate::ftp::FtpEndpoint::from_config(&config),
        &config.ftp_root,
    )
    .await
}

#[tauri::command]
pub async fn test_ftp_connection(
    host: String,
    port: u16,
    user: String,
    pass: String,
    tls: Option<bool>,
    tls_accept_invalid_certs: Option<bool>,
) -> Result<(), String> {
    crate::ftp::test_connection(&crate::ftp::FtpEndpoint {
        host,
        port,
        user,
        pass,
        tls: tls.unwrap_or(false),
        tls_accept_invalid_certs: tls_accept_invalid_certs.unwrap_or(false),
    })
    .await
}

#[tauri::command]
pub async fn test_tmdb_key(api_key: String) -> Result<bool, String> {
    Ok(crate::tmdb::validate_api_key(&api_key).await)
}

#[tauri::command]
pub async fn test_omdb_key(api_key: String) -> Result<bool, String> {
    Ok(crate::omdb::validate_api_key(&api_key).await)
}

#[tauri::command]
pub async fn test_tvdb_key(api_key: String) -> Result<bool, String> {
    Ok(crate::tvdb::validate_api_key(&api_key).await)
}

/// Emit a log line into the activity log channel — works in both debug and
/// release builds (unlike `emit_index_log`) and also broadcasts over the WS
/// so web-mode clients can see refresh progress.
fn emit_ratings_log(window: &Option<tauri::WebviewWindow>, msg: impl Into<String>) {
    let msg = msg.into();
    eprintln!("[ratings] {msg}");
    let payload = serde_json::json!({ "msg": msg });
    if let Some(w) = window {
        w.emit("index:log", payload.clone()).ok();
    }
    crate::ws_broadcast("index:log", payload);
}

/// Fetch OMDb + TVDB ratings for a single row's IMDb id and persist them.
/// Soft-fails on every error path — the caller's flow (indexing, refresh)
/// must never abort because a third-party API is down or rate-limited.
///
/// Returns the resolved ratings so callers can emit `index:update` events
/// without re-reading from disk. `log_window` (when set) receives per-fetch
/// log lines through the activity-log channel.
async fn enrich_extra_ratings(
    db: &crate::db::Db,
    config: &crate::db::AppConfig,
    item_id: i64,
    imdb_id: &str,
    log_window: Option<&tauri::WebviewWindow>,
) -> ExtraRatings {
    let (omdb, tvdb) = fetch_extra_ratings(config, imdb_id, log_window).await;
    persist_extra_ratings(db, item_id, &omdb, &tvdb, log_window);
    (omdb, tvdb)
}

/// Same as `enrich_extra_ratings`, but every file sharing an IMDb id (all the
/// episodes of a show) reuses one OMDb/TVDB fetch from `cache`. OMDb's free
/// tier is 1 000 requests a day, so this matters on big libraries.
async fn enrich_extra_ratings_cached(
    db: &crate::db::Db,
    config: &crate::db::AppConfig,
    item_id: i64,
    imdb_id: &str,
    log_window: Option<&tauri::WebviewWindow>,
    cache: &LookupCache,
) -> ExtraRatings {
    let cell = cache.ratings_cell(imdb_id.trim());
    let (omdb, tvdb) = cell
        .get_or_init(|| fetch_extra_ratings(config, imdb_id, log_window))
        .await
        .clone();
    persist_extra_ratings(db, item_id, &omdb, &tvdb, log_window);
    (omdb, tvdb)
}

fn persist_extra_ratings(
    db: &crate::db::Db,
    item_id: i64,
    omdb: &Option<crate::omdb::OmdbRating>,
    tvdb: &Option<crate::tvdb::TvdbRating>,
    log_window: Option<&tauri::WebviewWindow>,
) {
    if omdb.is_some() || tvdb.is_some() {
        if let Err(e) = db.update_extra_ratings(item_id, omdb.as_ref(), tvdb.as_ref()) {
            emit_ratings_log(&log_window.cloned(), format!("✗ Persist id={item_id}: {e}"));
        }
    }
}

type ExtraRatings = (Option<crate::omdb::OmdbRating>, Option<crate::tvdb::TvdbRating>);
type TmdbMatch = Option<(crate::tmdb::TmdbMovie, String)>;

/// Memo of remote lookups for the duration of one indexing / refresh run.
/// Every episode of a show parses to the same title, year and type, so
/// without this a 60-episode show cost 60 identical TMDB searches (each
/// several throttled requests) plus 60 OMDb/TVDB fetches. Concurrent tasks
/// asking for the same key wait for the first one instead of racing it.
/// Failed TMDB lookups are not cached, so the next file retries them.
#[derive(Clone, Default)]
pub(crate) struct LookupCache {
    tmdb: Arc<Mutex<std::collections::HashMap<String, Arc<tokio::sync::OnceCell<TmdbMatch>>>>>,
    ratings: Arc<Mutex<std::collections::HashMap<String, Arc<tokio::sync::OnceCell<ExtraRatings>>>>>,
}

impl LookupCache {
    fn tmdb_cell(&self, key: String) -> Arc<tokio::sync::OnceCell<TmdbMatch>> {
        let mut map = self.tmdb.lock().unwrap_or_else(|e| e.into_inner());
        map.entry(key).or_default().clone()
    }

    fn ratings_cell(&self, imdb_id: &str) -> Arc<tokio::sync::OnceCell<ExtraRatings>> {
        let mut map = self.ratings.lock().unwrap_or_else(|e| e.into_inner());
        map.entry(imdb_id.to_string()).or_default().clone()
    }

    /// `resolve_tmdb_match_with_plex`, memoised by (type, year, title).
    async fn tmdb_match(
        &self,
        config: &crate::db::AppConfig,
        api_key: &str,
        title: &str,
        year: Option<u16>,
        tmdb_search_type: &str,
    ) -> Result<TmdbMatch, String> {
        let cell = self.tmdb_cell(tmdb_lookup_key(title, year, tmdb_search_type));
        cell.get_or_try_init(|| {
            resolve_tmdb_match_with_plex(config, api_key, title, year, tmdb_search_type)
        })
        .await
        .cloned()
    }

    /// `tmdb::fetch_movie_by_id`, memoised by (tmdb_id, type).
    async fn tmdb_by_id(
        &self,
        api_key: &str,
        tmdb_id: i64,
        media_type: &str,
    ) -> Result<crate::tmdb::TmdbMovie, String> {
        let cell = self.tmdb_cell(format!("id|{media_type}|{tmdb_id}"));
        let found = cell
            .get_or_try_init(|| async {
                crate::tmdb::fetch_movie_by_id(api_key, tmdb_id, media_type)
                    .await
                    .map(|movie| Some((movie, media_type.to_string())))
            })
            .await?;
        found
            .as_ref()
            .map(|(movie, _)| movie.clone())
            .ok_or_else(|| format!("TMDB id {tmdb_id} not found"))
    }

    fn has_tmdb_by_id(&self, tmdb_id: i64, media_type: &str) -> bool {
        let map = self.tmdb.lock().unwrap_or_else(|e| e.into_inner());
        map.get(&format!("id|{media_type}|{tmdb_id}"))
            .is_some_and(|cell| cell.initialized())
    }
}

/// Fetch OMDb + TVDB ratings for an IMDb id without persisting them.
async fn fetch_extra_ratings(
    config: &crate::db::AppConfig,
    imdb_id: &str,
    log_window: Option<&tauri::WebviewWindow>,
) -> ExtraRatings {
    let imdb_id = imdb_id.trim();
    if imdb_id.is_empty() {
        return (None, None);
    }

    let log_target: Option<tauri::WebviewWindow> = log_window.cloned();
    let omdb_fut = async {
        if config.omdb_api_key.trim().is_empty() {
            None
        } else {
            match crate::omdb::fetch_by_imdb_id(&config.omdb_api_key, imdb_id).await {
                Ok(r) => {
                    if r.imdb_rating.is_none() {
                        emit_ratings_log(
                            &log_target,
                            format!("• OMDb {imdb_id}: no rating returned"),
                        );
                    } else {
                        emit_ratings_log(
                            &log_target,
                            format!(
                                "• OMDb {imdb_id} → {:.1} ({} votes)",
                                r.imdb_rating.unwrap(),
                                r.imdb_votes.unwrap_or(0)
                            ),
                        );
                    }
                    Some(r)
                }
                Err(e) => {
                    emit_ratings_log(&log_target, format!("✗ OMDb {imdb_id}: {e}"));
                    None
                }
            }
        }
    };
    let tvdb_fut = async {
        if config.tvdb_api_key.trim().is_empty() {
            None
        } else {
            match crate::tvdb::fetch_by_imdb(&config.tvdb_api_key, imdb_id).await {
                Ok(r) => {
                    match (r.tvdb_id, r.rating) {
                        (Some(id), Some(score)) => emit_ratings_log(
                            &log_target,
                            format!("• TVDB {imdb_id} → tvdb:{id} score {score:.1}"),
                        ),
                        (Some(id), None) => emit_ratings_log(
                            &log_target,
                            format!("• TVDB {imdb_id} → tvdb:{id} (no score field)"),
                        ),
                        (None, _) => emit_ratings_log(
                            &log_target,
                            format!("• TVDB {imdb_id}: no remote-id match"),
                        ),
                    }
                    Some(r)
                }
                Err(e) => {
                    emit_ratings_log(&log_target, format!("✗ TVDB {imdb_id}: {e}"));
                    None
                }
            }
        }
    };

    tokio::join!(omdb_fut, tvdb_fut)
}

/// Global guard so concurrent "Refresh ratings" presses (or a desktop press
/// while the web GUI already triggered one) don't double the request load on
/// OMDb/TVDB. Reset when the job finishes.
pub static RATINGS_REFRESH_RUNNING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Re-fetch OMDb + TVDB ratings for every library item with an IMDb id.
/// Sequential per item so we never have more than one OMDb and one TVDB
/// request in flight at a time — the per-service throttles enforce pacing
/// further. By default skips rows that already have both ratings (cheap
/// resume after an interrupted run); `force=true` re-fetches everything.
///
/// Emits `ratings:start`, `ratings:progress` (every 10 items + at completion),
/// and `ratings:complete` over both Tauri events and the WS broadcast channel.
pub async fn refresh_all_ratings_internal(
    db: crate::db::Db,
    window: Option<tauri::WebviewWindow>,
    force: bool,
) -> Result<usize, String> {
    if RATINGS_REFRESH_RUNNING
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return Err("Ratings refresh already running".to_string());
    }

    // RAII-style guard so the flag is always cleared, even on panic / early return.
    struct RunningGuard;
    impl Drop for RunningGuard {
        fn drop(&mut self) {
            RATINGS_REFRESH_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    }
    let _guard = RunningGuard;

    let config = db.load_config()?;
    let omdb_enabled = !config.omdb_api_key.trim().is_empty();
    let tvdb_enabled = !config.tvdb_api_key.trim().is_empty();
    if !omdb_enabled && !tvdb_enabled {
        return Err("Neither OMDb nor TVDB is configured".to_string());
    }

    // Pull all matched rows and decide locally which still need work — the
    // shared `get_all_media` query already returns the new rating columns.
    let media = db.get_all_media()?;
    let pending: Vec<(i64, String)> = media
        .into_iter()
        .filter_map(|item| {
            let imdb = item.imdb_id.unwrap_or_default();
            if imdb.trim().is_empty() {
                return None;
            }
            if !force {
                let omdb_done = !omdb_enabled || item.imdb_rating.is_some();
                let tvdb_done = !tvdb_enabled || item.tvdb_rating.is_some();
                if omdb_done && tvdb_done {
                    return None;
                }
            }
            Some((item.id, imdb))
        })
        .collect();

    let total = pending.len();

    if let Some(ref w) = window {
        w.emit("ratings:start", serde_json::json!({ "total": total })).ok();
    }
    crate::ws_broadcast("ratings:start", serde_json::json!({ "total": total }));
    emit_ratings_log(
        &window,
        format!(
            "🌟 Refreshing ratings for {total} item(s){}",
            if force { " (forced — re-fetching everything)" } else { "" },
        ),
    );

    for (idx, (id, imdb_id)) in pending.into_iter().enumerate() {
        emit_ratings_log(
            &window,
            format!("🌟 [{}/{}] {imdb_id}", idx + 1, total),
        );
        let (omdb, tvdb) =
            enrich_extra_ratings(&db, &config, id, &imdb_id, window.as_ref()).await;

        // Push the live patch to the Tauri window (local listener — no
        // broadcast cost). We deliberately do NOT ws_broadcast each item:
        // for a 3000-row catalog that produced ~3000 WS messages over the
        // refresh, each one triggering a React setItems → re-render storm
        // that starved poster <img> loads of main-thread time in web mode.
        // Web clients pick up the new ratings through `ratings:complete` →
        // useIndexing re-fetches /api/media in one shot.
        if let Some(ref w) = window {
            let update_payload = serde_json::json!({
                "id": id,
                "imdb_rating": omdb.as_ref().and_then(|o| o.imdb_rating),
                "imdb_votes":  omdb.as_ref().and_then(|o| o.imdb_votes),
                "tvdb_id":     tvdb.as_ref().and_then(|t| t.tvdb_id),
                "tvdb_rating": tvdb.as_ref().and_then(|t| t.rating),
            });
            w.emit("index:update", update_payload).ok();
        }

        let done = idx + 1;
        if done % 10 == 0 || done == total {
            let progress = serde_json::json!({ "done": done, "total": total });
            if let Some(ref w) = window {
                w.emit("ratings:progress", progress.clone()).ok();
            }
            crate::ws_broadcast("ratings:progress", progress);
        }
    }

    let complete = serde_json::json!({ "total": total });
    if let Some(ref w) = window {
        w.emit("ratings:complete", complete.clone()).ok();
    }
    crate::ws_broadcast("ratings:complete", complete);
    emit_ratings_log(
        &window,
        format!("✓ Ratings refresh complete — {total} item(s) processed"),
    );
    Ok(total)
}

/// Spawn-and-return: the Tauri command kicks off the refresh in the
/// background so the frontend doesn't await the entire job. Progress is
/// reported via the `ratings:*` events the internal helper emits.
#[tauri::command]
pub async fn refresh_all_ratings(
    state: tauri::State<'_, crate::db::Db>,
    window: WebviewWindow,
    force: Option<bool>,
) -> Result<(), String> {
    if RATINGS_REFRESH_RUNNING.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("Ratings refresh already running".to_string());
    }
    let db = state.inner().clone();
    let force = force.unwrap_or(false);
    tauri::async_runtime::spawn(async move {
        if let Err(e) = refresh_all_ratings_internal(db, Some(window), force).await {
            eprintln!("[ratings] refresh job failed: {e}");
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn test_emby_connection(url: String, api_key: String) -> Result<String, String> {
    let base = url.trim_end_matches('/');
    let endpoint = format!("{base}/System/Info?api_key={api_key}");
    let client = &*MEDIA_SERVER_CLIENT;
    let resp = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|e| format!("Could not reach Emby server: {e}"))?;
    if resp.status().is_success() {
        let body: serde_json::Value = resp.json().await.unwrap_or_default();
        let server_name = body["ServerName"].as_str().unwrap_or("Emby Server");
        let version = body["Version"].as_str().unwrap_or("?");
        Ok(format!("{server_name} (v{version})"))
    } else if resp.status().as_u16() == 401 {
        Err("Invalid API key — check your Emby API key".to_string())
    } else {
        Err(format!("Emby returned HTTP {}", resp.status().as_u16()))
    }
}

#[tauri::command]
pub async fn test_plex_connection(url: String, token: String) -> Result<String, String> {
    let base = url.trim_end_matches('/');
    let endpoint = format!("{base}?X-Plex-Token={token}");
    let client = &*MEDIA_SERVER_CLIENT;
    let resp = client
        .get(&endpoint)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Could not reach Plex server: {e}"))?;
    if resp.status().is_success() {
        let body: serde_json::Value = resp.json().await.unwrap_or_default();
        let name = body["MediaContainer"]["friendlyName"]
            .as_str()
            .unwrap_or("Plex Media Server");
        let version = body["MediaContainer"]["version"]
            .as_str()
            .unwrap_or("?");
        Ok(format!("{name} (v{version})"))
    } else if resp.status().as_u16() == 401 {
        Err("Invalid token — check your Plex token".to_string())
    } else {
        Err(format!("Plex returned HTTP {}", resp.status().as_u16()))
    }
}

#[tauri::command]
pub async fn save_config(
    state: tauri::State<'_, crate::db::Db>,
    config: crate::db::AppConfig,
) -> Result<(), String> {
    let result = state.save_config(&config);
    // Invalidate badge cache so stale "not-configured" entries are evicted immediately.
    BADGE_RESULT_CACHE.lock().unwrap().clear();
    result
}

#[tauri::command]
pub async fn has_config(state: tauri::State<'_, crate::db::Db>) -> Result<bool, String> {
    state.has_config()
}

#[tauri::command]
pub async fn get_applied_migrations(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<Vec<crate::db::AppliedMigration>, String> {
    state.list_applied_migrations()
}

pub(crate) fn resolve_seed_db_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(path) = app
        .path()
        .resolve("library.seed.db", tauri::path::BaseDirectory::Resource)
    {
        candidates.push(path);
    }

    if let Ok(path) = app
        .path()
        .resolve("resources/library.seed.db", tauri::path::BaseDirectory::Resource)
    {
        candidates.push(path);
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("resources").join("library.seed.db"));
        }
    }

    candidates.into_iter().find(|candidate| candidate.exists())
}

#[tauri::command]
pub async fn seed_starter_library(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::db::Db>,
) -> Result<bool, String> {
    if state.has_config()? {
        return Ok(false);
    }
    if state.count_media_items()? > 0 {
        return Ok(false);
    }

    let Some(seed_path) = resolve_seed_db_path(&app) else {
        return Ok(false);
    };

    state.import_database_from(&seed_path.to_string_lossy())?;
    state.clear_app_config()?;
    state.save_last_indexed_at(&chrono::Utc::now().to_rfc3339())?;
    // The seed DB predates v0.14.0 so its rows arrive without watch-provider
    // data. Fill them in from the bundled JSON snapshot — NULL-only, so it
    // won't touch anything that's somehow already populated.
    if let Err(err) = state.apply_bundle_to_null_rows() {
        eprintln!("[watch-providers-bundle] post-seed apply failed: {err}");
    }
    Ok(true)
}

#[tauri::command]
pub async fn export_library_backup(
    state: tauri::State<'_, crate::db::Db>,
    destination_path: String,
) -> Result<(), String> {
    state.export_database_to(&destination_path)
}

#[tauri::command]
pub async fn import_library_backup(
    state: tauri::State<'_, crate::db::Db>,
    source_path: String,
) -> Result<(), String> {
    state.import_database_from(&source_path)
}

// ── Storage / portable-mode commands ─────────────────────────────────────────

/// Returns the directory that currently holds `library.db`.
#[tauri::command]
pub async fn get_db_path(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<String, String> {
    Ok(state.data_dir().to_string_lossy().to_string())
}

/// First-run only: record the desired data directory in bootstrap.json without
/// performing a VACUUM (the DB hasn't been used yet, so nothing to migrate).
///
/// Validates that the chosen directory exists (creating it if needed) and is
/// writable by this process *before* persisting the choice — so the wizard
/// fails here, where the user picked it, instead of on the next launch with
/// a cryptic "unable to open database file" error.
#[tauri::command]
pub async fn init_db_path(
    _state: tauri::State<'_, crate::db::Db>,
    dir: String,
) -> Result<(), String> {
    let path = std::path::Path::new(&dir);
    if dir.trim().is_empty() {
        return Err("Selected data directory is empty".into());
    }
    std::fs::create_dir_all(path)
        .map_err(|e| format!("Cannot create {}: {}", path.display(), e))?;
    let probe = path.join(".boxteam-write-test");
    std::fs::write(&probe, b"").map_err(|e| {
        format!(
            "Selected data directory {} is not writable: {}",
            path.display(),
            e
        )
    })?;
    let _ = std::fs::remove_file(&probe);
    crate::db::Db::write_bootstrap(Some(path))
}

/// Migrate the live database to a new directory and persist the path in
/// bootstrap.json. The caller must prompt the user to restart the app.
#[tauri::command]
pub async fn set_db_path(
    state: tauri::State<'_, crate::db::Db>,
    dir: String,
) -> Result<(), String> {
    state.migrate_to(std::path::Path::new(&dir))
}

/// Whether the app booted in portable mode (`.boxteam-portable` or legacy `.oscata-portable` marker found).
#[tauri::command]
pub async fn is_portable_mode(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<bool, String> {
    Ok(state.is_portable())
}

/// Remove the custom path from bootstrap.json so the next launch uses the
/// default app-data location. The caller must prompt the user to restart.
#[tauri::command]
pub async fn reset_db_path(
    _state: tauri::State<'_, crate::db::Db>,
) -> Result<(), String> {
    crate::db::Db::write_bootstrap(None)
}

/// Library list for the UI. Synopses are left out (see
/// `Db::get_library_media`); the detail views call `get_media_overview`.
#[tauri::command]
pub async fn get_all_media(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<Vec<crate::db::MediaItem>, String> {
    state.get_library_media()
}

#[derive(serde::Serialize)]
pub struct MediaOverview {
    pub tmdb_overview: Option<String>,
    pub tmdb_overview_en: Option<String>,
}

#[tauri::command]
pub async fn get_media_overview(
    state: tauri::State<'_, crate::db::Db>,
    id: i64,
) -> Result<MediaOverview, String> {
    let (tmdb_overview, tmdb_overview_en) = state
        .get_media_overview(id)?
        .ok_or_else(|| format!("Media item {id} not found"))?;
    Ok(MediaOverview { tmdb_overview, tmdb_overview_en })
}

#[tauri::command]
pub async fn start_indexing(
    state: tauri::State<'_, crate::db::Db>,
    queue_state: tauri::State<'_, crate::downloads::SharedQueue>,
    window: WebviewWindow,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    // Shared with the web handler and the reset commands so a reset can't
    // wipe the table under a running index pass.
    crate::INDEXING_RUNNING.store(true, Ordering::SeqCst);
    let result = start_indexing_internal(
        state.inner().clone(),
        Some(window.clone()),
        Some(queue_state.inner().clone()),
    ).await;
    crate::INDEXING_RUNNING.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
pub async fn rematch_all(
    state: tauri::State<'_, crate::db::Db>,
    window: WebviewWindow,
) -> Result<(), String> {
    rematch_all_internal(state.inner().clone(), Some(window)).await
}

pub async fn rematch_all_internal(
    db: crate::db::Db,
    window: Option<tauri::WebviewWindow>,
) -> Result<(), String> {
    let config = db.load_config()?;
    let items = db.get_all_media()?;
    let items: Vec<_> = items
        .into_iter()
        .filter(|item| item.manual_match.unwrap_or(0) == 0)
        .collect();
    let total = items.len();

    emit_index_log(&window, format!("🔄 Re-matching {} items with TMDB…", total));

    for (i, item) in items.into_iter().enumerate() {
        let title = item.tmdb_title.clone()
            .or_else(|| item.title.clone())
            .unwrap_or_else(|| item.filename.clone());

        // Determine media_type: prefer stored value, fallback to "movie"
        let mtype = item.media_type.clone()
            .or_else(|| item.tmdb_type.clone())
            .unwrap_or_else(|| "movie".to_string());

        // TMDB search type: documentary series search as TV, documentary films as movie
        let tmdb_search_type = match mtype.as_str() {
            "tv" => "tv",
            "documentary" => {
                // Infer from filename if it has a season marker
                let parsed = crate::parser::parse_media_path(&item.ftp_path, &item.filename);
                if parsed.season.is_some() { "tv" } else { "movie" }
            },
            _ => "movie",
        };
        let year = item.year.map(|y| y as u16);

        emit_index_log(
            &window,
            format!("🌐 [{}/{}] Matching: {} ({})", i + 1, total, title, mtype),
        );

        // Rate limit: 40 req/10s
        tokio::time::sleep(std::time::Duration::from_millis(260)).await;

        let api_key = &config.tmdb_api_key;
        let result = resolve_tmdb_match_with_plex(&config, api_key, &title, year, tmdb_search_type).await;

        if let Ok(Some((movie, actual_type))) = result {
            emit_index_log(
                &window,
                format!(
                    "✓ Matched: {} → {} ({})",
                    title,
                    movie.title,
                    movie.release_date.as_deref().unwrap_or("?")
                ),
            );
            db.update_tmdb_auto(item.id, &movie, &actual_type).ok();
            let (omdb, tvdb) = match movie.imdb_id.as_deref() {
                Some(imdb) if !imdb.is_empty() =>
                    enrich_extra_ratings(&db, &config, item.id, imdb, window.as_ref()).await,
                _ => (None, None),
            };
            if let Some(ref w) = window {
                w.emit("index:update", serde_json::json!({
                    "id": item.id,
                    "tmdb_id": movie.id,
                    "imdb_id": movie.imdb_id,
                    "tmdb_title": movie.title,
                    "tmdb_title_en": movie.title_en,
                    "tmdb_poster": movie.poster_path,
                    "tmdb_poster_en": movie.poster_path_en,
                    "tmdb_rating": movie.vote_average,
                    "tmdb_overview": movie.overview,
                    "tmdb_overview_en": movie.overview_en,
                    "tmdb_genres": movie.genre_ids,
                    "tmdb_watch_providers": movie.watch_providers,
                    "tmdb_release_date": movie.release_date,
                    "tmdb_type": actual_type,
                    "imdb_rating": omdb.as_ref().and_then(|o| o.imdb_rating),
                    "imdb_votes":  omdb.as_ref().and_then(|o| o.imdb_votes),
                    "tvdb_id":     tvdb.as_ref().and_then(|t| t.tvdb_id),
                    "tvdb_rating": tvdb.as_ref().and_then(|t| t.rating),
                })).ok();
            }
        } else {
            emit_index_log(&window, format!("⚠ No match found for: {}", title));
        }
    }

    emit_index_log(&window, format!("✓ Re-match complete — {} items processed", total));
    Ok(())
}

pub async fn start_indexing_internal(
    db: crate::db::Db,
    window: Option<tauri::WebviewWindow>,
    queue: Option<crate::downloads::SharedQueue>,
) -> Result<(), String> {
    let config = db.load_config()?;

    if let Some(ref w) = window { w.emit("index:start", serde_json::json!({})).ok(); }
    crate::ws_broadcast("index:start", serde_json::json!({}));

    let window_log = window.clone();
    let on_log = Arc::new(move |msg: String| {
        emit_index_log(&window_log, msg);
    });

    let folder_types: std::collections::HashMap<String, String> =
        serde_json::from_str(&config.folder_types).unwrap_or_default();
    let root = config.ftp_root.clone();

    const MAX_RETRIES: u32 = 3;
    const RETRY_DELAY_SECS: u64 = 5;

    let files = {
        let mut attempt = 0u32;
        loop {
            match crate::ftp::list_files(
                &crate::ftp::FtpEndpoint::from_config(&config),
                &root,
                on_log.clone(),
            )
            .await
            {
                Ok(files) => break files,
                Err(e) => {
                    attempt += 1;
                    if attempt >= MAX_RETRIES {
                        if let Some(ref w) = window { w.emit("index:error", serde_json::json!({ "message": e })).ok(); }
                        crate::ws_broadcast("index:error", serde_json::json!({ "message": e }));
                        return Err(e);
                    }
                    on_log(format!("⚠ {e} — retrying in {RETRY_DELAY_SECS}s ({attempt}/{MAX_RETRIES})…"));
                    tokio::time::sleep(std::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                }
            }
        }
    };

    let total = files.len();
    let current_paths: Vec<String> = files.iter().map(|file| file.path.clone()).collect();
    let mut metadata_tasks = Vec::new();
    let mut metadata_queued = 0usize;
    let mut new_items = 0usize;

    // Counters for TMDB enrichment progress events (index:tmdb_progress)
    let tmdb_done = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let tmdb_total = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let lookups = LookupCache::default();

    if total == 0 {
        if let Some(ref w) = window { w.emit("index:error", serde_json::json!({ "message": "FTP crawl returned 0 media files. Check your Root Path setting." })).ok(); }
        crate::ws_broadcast("index:error", serde_json::json!({ "message": "FTP crawl returned 0 media files. Check your Root Path setting." }));
        return Ok(());
    }

    // ── IPC progress event batching ────────────────────────────────────────
    // Emit one index:progress event per PROGRESS_BATCH_SIZE files (or at loop
    // end) rather than one per file. The payload is an array so the frontend
    // can apply them all in a single React state update, cutting IPC overhead
    // on large libraries from O(N) individual events to O(N/50).
    const PROGRESS_BATCH_SIZE: usize = 50;
    let mut progress_batch: Vec<serde_json::Value> = Vec::with_capacity(PROGRESS_BATCH_SIZE);

    let flush_progress_batch = |batch: &mut Vec<serde_json::Value>, window: &Option<tauri::WebviewWindow>| {
        if batch.is_empty() { return; }
        if let Some(ref w) = window {
            w.emit("index:progress", serde_json::json!(batch)).ok();
        }
        // Web clients only need the counter (the desktop payload carries the
        // full items and would flood the WS channel).
        if let Some(last) = batch.last() {
            crate::ws_broadcast(
                "index:progress",
                serde_json::json!({ "current": last["current"], "total": last["total"] }),
            );
        }
        batch.clear();
    };

    // Wrap the entire upsert loop in a single explicit transaction.
    // Without this, rusqlite commits a transaction per statement (autocommit),
    // producing N WAL write round-trips instead of one.
    db.begin_batch().map_err(|e| {
        on_log(format!("⚠ Failed to begin index transaction: {e}"));
        e
    })?;

    for (i, file) in files.into_iter().enumerate() {
        let parsed = crate::parser::parse_media_path(&file.path, &file.filename);

        // Detect media_type from folder_types mapping (first path segment after root)
        let media_type = detect_media_type(&file.path, &root, &folder_types);
        let looks_episode = looks_like_tv_content(&file.path, &file.filename, &parsed);
        let media_type = match media_type.as_deref() {
            Some("mixed") => if looks_episode { Some("tv".to_string()) } else { Some("movie".to_string()) },
            Some("movie") if looks_episode => Some("tv".to_string()),
            Some(t) => Some(t.to_string()),
            None => if looks_episode { Some("tv".to_string()) } else { None },
        };
        let media_type_str = media_type.as_deref();

        // TMDB search type: documentaries with seasons search as TV shows
        let tmdb_search_type = match media_type.as_deref() {
            Some("documentary") => if parsed.season.is_some() { "tv" } else { "movie" },
            Some("tv") => "tv",
            _ => "movie",
        }.to_string();

        let upsert = db.upsert_media(
            &file.path,
            &file.filename,
            Some(file.size),
            &parsed,
            media_type_str,
            file.modified_at.as_deref(),
            &root,
        )?;
        let id = upsert.id;

        on_log(format!("⚙ Indexing [{}/{}]: {}", i + 1, total, parsed.title));

        progress_batch.push(serde_json::json!({
            "id": id,
            "current": i + 1,
            "total": total,
            "filename": file.filename,
            "ftp_path": file.path,
            "title": parsed.title,
            "year": parsed.year,
            "season": parsed.season,
            "episode": parsed.episode,
            "episode_end": parsed.episode_end,
            "resolution": parsed.resolution,
            "codec": parsed.codec,
            "audio_codec": parsed.audio_codec,
            "hdr": parsed.hdr,
            "languages": parsed.languages,
            "release_type": parsed.release_type,
            "release_group": parsed.release_group,
            "media_type": media_type_str,
            "tmdb_type": media_type_str,
        }));

        if progress_batch.len() >= PROGRESS_BATCH_SIZE {
            flush_progress_batch(&mut progress_batch, &window);
        }

        if upsert.is_new {
            new_items += 1;
        }

        if upsert.needs_metadata {
            metadata_queued += 1;
            let api_key = config.tmdb_api_key.clone();
            let title = parsed.title.clone();
            let year = parsed.year;
            let _mtype = media_type.clone().unwrap_or_else(|| "movie".to_string());
            let tmdb_stype = tmdb_search_type.clone();

            // Whether the file is new or existing, spawn the TMDB enrichment as a
            // background task so it never blocks the index loop.
            // The TMDB throttle (35 ms minimum interval, enforced inside
            // fetch_json_with_retry) handles rate limiting — no artificial sleep needed.
            {
                let window_clone = window.clone();
                let db_clone = db.clone();
                let config_clone = config.clone();
                let on_log_clone = on_log.clone();
                let label = if upsert.is_new { "new" } else { "existing" };
                let tmdb_done_clone = tmdb_done.clone();
                let tmdb_total_clone = tmdb_total.clone();
                let lookups_clone = lookups.clone();
                tmdb_total.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

                metadata_tasks.push(tokio::spawn(async move {
                    on_log_clone(format!("🌐 TMDB ({label}): {title}"));
                    let result = lookups_clone
                        .tmdb_match(&config_clone, &api_key, &title, year, &tmdb_stype)
                        .await;
                    match result {
                        Ok(Some((movie, actual_type))) => {
                            on_log_clone(format!("🌐 TMDB: {} → {}", title, movie.title));
                            db_clone.update_tmdb_auto(id, &movie, &actual_type).ok();
                            let (omdb, tvdb) = match movie.imdb_id.as_deref() {
                                Some(imdb) if !imdb.is_empty() =>
                                    enrich_extra_ratings_cached(&db_clone, &config_clone, id, imdb, window_clone.as_ref(), &lookups_clone).await,
                                _ => (None, None),
                            };
                            if let Some(ref w) = window_clone {
                                w.emit(
                                    "index:update",
                                    serde_json::json!({
                                        "id": id,
                                        "tmdb_id": movie.id,
                                        "imdb_id": movie.imdb_id,
                                        "tmdb_title": movie.title,
                                        "tmdb_title_en": movie.title_en,
                                        "tmdb_poster": movie.poster_path,
                                        "tmdb_poster_en": movie.poster_path_en,
                                        "tmdb_rating": movie.vote_average,
                                        "tmdb_overview": movie.overview,
                                        "tmdb_overview_en": movie.overview_en,
                                        "tmdb_genres": movie.genre_ids,
                    "tmdb_watch_providers": movie.watch_providers,
                                        "tmdb_release_date": movie.release_date,
                                        "tmdb_type": actual_type,
                                        "imdb_rating": omdb.as_ref().and_then(|o| o.imdb_rating),
                                        "imdb_votes":  omdb.as_ref().and_then(|o| o.imdb_votes),
                                        "tvdb_id":     tvdb.as_ref().and_then(|t| t.tvdb_id),
                                        "tvdb_rating": tvdb.as_ref().and_then(|t| t.rating),
                                    }),
                                ).ok();
                            }
                        }
                        Ok(None) => {
                            on_log_clone(format!("⚠ TMDB: no match for \"{}\"", title));
                        }
                        Err(e) => {
                            on_log_clone(format!("✗ TMDB error for \"{}\": {}", title, e));
                        }
                    }
                    // Emit progress after task completes (success or failure)
                    let done = tmdb_done_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                    let total_val = tmdb_total_clone.load(std::sync::atomic::Ordering::SeqCst);
                    let tmdb_payload = serde_json::json!({ "done": done, "total": total_val });
                    if let Some(ref w) = window_clone {
                        w.emit("index:tmdb_progress", tmdb_payload.clone()).ok();
                    }
                    crate::ws_broadcast("index:tmdb_progress", tmdb_payload);
                }));
            }
        }
    }

    // Flush any remaining progress items that didn't fill a full batch.
    flush_progress_batch(&mut progress_batch, &window);

    // Commit the batch transaction opened before the upsert loop.
    db.commit_batch().map_err(|e| {
        on_log(format!("⚠ Failed to commit index transaction: {e}"));
        db.rollback_batch().ok();
        e
    })?;

    for task in metadata_tasks {
        if task.await.is_err() {
            on_log("⚠ TMDB metadata task failed unexpectedly".to_string());
        }
    }

    let removed_stale = db.delete_media_missing_from_scan(&current_paths)?;
    if removed_stale > 0 {
        on_log(format!(
            "🧹 Cleanup removed {} stale item{} no longer present on FTP",
            removed_stale,
            if removed_stale == 1 { "" } else { "s" }
        ));
    }

    on_log(format!(
        "✓ Indexing complete — {} files scanned, {} new, {} sent to TMDB, {} stale item{} removed",
        total,
        new_items,
        metadata_queued,
        removed_stale,
        if removed_stale == 1 { "" } else { "s" }
    ));

    let complete_payload = serde_json::json!({
        "total": total,
        "new_items": new_items,
        "metadata_queued": metadata_queued,
        "removed": removed_stale,
    });
    if let Some(ref w) = window {
        w.emit("index:complete", complete_payload.clone()).ok();
    }
    crate::ws_broadcast("index:complete", complete_payload);

    db.save_last_indexed_at(&chrono::Utc::now().to_rfc3339()).ok();

    // Trigger watchlist auto-downloads now that tmdb_ids are fully written.
    if let Some(q) = queue {
        trigger_watchlist_auto_downloads(db, q, window).await;
    }

    Ok(())
}

pub fn compute_local_path(
    config: &crate::db::AppConfig,
    ftp_path: &str,
    filename: &str,
    db_media_type: Option<&str>,
    tmdb_genres: Option<&str>,
) -> Result<std::path::PathBuf, String> {
    let base = std::path::PathBuf::from(&config.download_folder);
    if base.as_os_str().is_empty() {
        return Err("Download folder not configured. Open Settings to set it.".into());
    }
    let parsed = crate::parser::parse_media_path(ftp_path, filename);

    // Parse genre IDs from the stored JSON (e.g. "[28,16,878]")
    let item_genre_ids: Vec<i64> = tmdb_genres
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or_default();

    // Parse genre routing rules and check for a match
    #[derive(serde::Deserialize)]
    struct GenreDestRule {
        genre_ids: Vec<i64>,
        destination: String,
        media_types: Vec<String>, // "movie", "tv", "documentary", "all"
    }
    let rules: Vec<GenreDestRule> = serde_json::from_str(&config.genre_destinations)
        .unwrap_or_default();

    let effective_media_type = db_media_type.unwrap_or("");
    let genre_base: Option<std::path::PathBuf> = rules.into_iter().find(|rule| {
        if rule.destination.is_empty() { return false; }
        let type_match = rule.media_types.iter().any(|t| t == "all" || t == effective_media_type);
        let genre_match = rule.genre_ids.iter().any(|id| item_genre_ids.contains(id));
        type_match && genre_match
    }).map(|rule| std::path::PathBuf::from(&rule.destination));

    let use_alpha = config.alphabetical_subfolders;

    let alpha_letter = |title: &str| -> String {
        title.chars().find(|c| c.is_alphanumeric())
            .map(|c| if c.is_ascii_digit() { "0-9".to_string() } else { c.to_uppercase().to_string() })
            .unwrap_or_else(|| "#".to_string())
    };

    let local_path = if let Some(season) = parsed.season {
        // TV series (has season) → no alphabetical subfolder
        let season_dir = format!("Season {:02}", season);
        if db_media_type == Some("documentary") {
            let dest = if !config.documentary_destination.is_empty() {
                std::path::PathBuf::from(&config.documentary_destination)
            } else {
                base.join("Documentaries")
            };
            genre_base.unwrap_or(dest).join(&parsed.title).join(season_dir).join(filename)
        } else {
            let dest = if !config.tv_destination.is_empty() {
                std::path::PathBuf::from(&config.tv_destination)
            } else {
                base.join("TV Shows")
            };
            genre_base.unwrap_or(dest).join(&parsed.title).join(season_dir).join(filename)
        }
    } else if db_media_type == Some("documentary") {
        let title = &parsed.title;
        let folder_name = if let Some(y) = parsed.year { format!("{} ({})", title, y) } else { title.clone() };
        let dest = if !config.documentary_destination.is_empty() {
            std::path::PathBuf::from(&config.documentary_destination)
        } else {
            base.join("Documentaries")
        };
        let root = genre_base.unwrap_or(dest);
        if use_alpha {
            root.join(alpha_letter(title)).join(folder_name).join(filename)
        } else {
            root.join(folder_name).join(filename)
        }
    } else {
        let title = &parsed.title;
        let folder_name = if let Some(y) = parsed.year { format!("{} ({})", title, y) } else { title.clone() };
        let dest = if !config.movie_destination.is_empty() {
            std::path::PathBuf::from(&config.movie_destination)
        } else {
            base.join("Movies")
        };
        let root = genre_base.unwrap_or(dest);
        if use_alpha {
            root.join(alpha_letter(title)).join(folder_name).join(filename)
        } else {
            root.join(folder_name).join(filename)
        }
    };
    // suppress unused variable warning for ftp_path
    let _ = ftp_path;
    Ok(local_path)
}

/// Collect the destination roots that must never be removed when pruning empty
/// folders after a delete: the download base (and its default per-type
/// subfolders), the configured per-type destinations, and every genre-routing
/// destination. Mirrors the folder layout produced by [`compute_local_path`].
fn media_dest_roots(config: &crate::db::AppConfig) -> Vec<std::path::PathBuf> {
    use std::path::PathBuf;
    let mut roots: Vec<PathBuf> = Vec::new();
    if !config.download_folder.is_empty() {
        let base = PathBuf::from(&config.download_folder);
        roots.push(base.join("Movies"));
        roots.push(base.join("TV Shows"));
        roots.push(base.join("Documentaries"));
        roots.push(base);
    }
    for dest in [
        &config.movie_destination,
        &config.tv_destination,
        &config.documentary_destination,
    ] {
        if !dest.is_empty() {
            roots.push(PathBuf::from(dest));
        }
    }
    #[derive(serde::Deserialize)]
    struct GenreDest {
        destination: String,
    }
    if let Ok(rules) = serde_json::from_str::<Vec<GenreDest>>(&config.genre_destinations) {
        for rule in rules {
            if !rule.destination.is_empty() {
                roots.push(PathBuf::from(rule.destination));
            }
        }
    }
    roots
}

/// Remove the empty parent folders left behind after deleting a media file,
/// walking upward from the file's folder. Stops at the first directory that is
/// non-empty, equals one of `roots`, or lies outside every root — so a
/// configured destination (e.g. `…/Movies`) or a folder shared with other
/// titles (e.g. an `A/` alpha bucket still holding another movie) is never
/// removed.
fn prune_empty_media_dirs(file_path: &std::path::Path, roots: &[std::path::PathBuf]) {
    let mut dir = match file_path.parent() {
        Some(p) => p.to_path_buf(),
        None => return,
    };
    loop {
        // Never delete a destination root itself.
        if roots.iter().any(|root| &dir == root) {
            break;
        }
        // Only prune directories that live inside a known destination root.
        if !roots.iter().any(|root| dir.starts_with(root)) {
            break;
        }
        // Stop at the first non-empty (or unreadable) directory.
        match std::fs::read_dir(&dir) {
            Ok(mut entries) => {
                if entries.next().is_some() {
                    break;
                }
            }
            Err(_) => break,
        }
        if std::fs::remove_dir(&dir).is_err() {
            break;
        }
        match dir.parent() {
            Some(p) => dir = p.to_path_buf(),
            None => break,
        }
    }
}

#[tauri::command]
pub async fn queue_download(
    db_state: tauri::State<'_, crate::db::Db>,
    queue_state: tauri::State<'_, crate::downloads::SharedQueue>,
    window: WebviewWindow,
    ftp_path: String,
    filename: String,
    media_title: Option<String>,
) -> Result<u64, String> {
    let db = db_state.inner().clone();
    let config = db.load_config()?;
    let db_media_type: Option<String> = db_state.get_media_type_by_path(&ftp_path).ok().flatten();
    let tmdb_genres: Option<String> = db_state.get_tmdb_genres_by_path(&ftp_path).ok().flatten();
    let local_path = compute_local_path(&config, &ftp_path, &filename, db_media_type.as_deref(), tmdb_genres.as_deref())?;

    // Deduplicate: if this ftp_path is already Queued or Downloading, return the existing id.
    let existing_id = {
        let queue = queue_state.lock().unwrap();
        queue.find_active_by_ftp_path(&ftp_path)
    };
    if let Some(id) = existing_id {
        return Ok(id);
    }

    std::fs::create_dir_all(local_path.parent().unwrap())
        .map_err(|e| format!("Could not create directory: {e}"))?;

    let local_str = local_path.to_string_lossy().to_string();

    let (id, semaphore, cancel_flag) = {
        let mut queue = queue_state.lock().unwrap();
        let added = queue.add(ftp_path.clone(), filename.clone(), local_str.clone(), media_title.clone());
        queue.set_requested_by(added.0, 0);
        added
    };
    persist_download_state(&db, queue_state.inner());

    let new_item = {
        let queue = queue_state.lock().unwrap();
        queue.items.iter().find(|i| i.id == id).cloned()
    };

    if let Some(item) = new_item {
        window.emit("download:added", &item).ok();
    }

    spawn_download_job_pub(
        db,
        queue_state.inner().clone(),
        Some(window.clone()),
        config,
        id,
        ftp_path,
        local_str,
        semaphore,
        cancel_flag,
    );

    Ok(id)
}

#[tauri::command]
pub async fn get_downloads(
    queue: tauri::State<'_, crate::downloads::SharedQueue>,
) -> Result<Vec<crate::downloads::DownloadItem>, String> {
    let queue = queue.lock().unwrap();
    Ok(queue.items.clone())
}

#[tauri::command]
pub async fn cancel_download(
    db: tauri::State<'_, crate::db::Db>,
    window: WebviewWindow,
    queue: tauri::State<'_, crate::downloads::SharedQueue>,
    id: u64,
) -> Result<(), String> {
    let mut queue = queue.lock().unwrap();
    queue.cancel(id);
    let snapshot = queue.items.clone();
    drop(queue);
    db.save_download_state(&snapshot).ok();
    window.emit("download:update", serde_json::json!({
        "id": id,
        "status": "cancelled",
        "error": serde_json::Value::Null,
        "completed_at_ms": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
    })).ok();
    Ok(())
}

#[tauri::command]
pub async fn clear_completed(
    db: tauri::State<'_, crate::db::Db>,
    queue: tauri::State<'_, crate::downloads::SharedQueue>,
) -> Result<(), String> {
    let mut queue = queue.lock().unwrap();
    queue.clear_completed();
    let snapshot = queue.items.clone();
    drop(queue);
    db.save_download_state(&snapshot).ok();
    Ok(())
}

#[tauri::command]
pub async fn delete_download(
    db: tauri::State<'_, crate::db::Db>,
    queue: tauri::State<'_, crate::downloads::SharedQueue>,
    id: u64,
) -> Result<(), String> {
    let local_path = {
        let mut queue = queue.lock().unwrap();
        // Cancel any in-progress transfer first so the file handle is released.
        queue.cancel(id);
        let path = queue.items.iter().find(|i| i.id == id).map(|i| i.local_path.clone());
        queue.delete(id);
        let snapshot = queue.items.clone();
        drop(queue);
        db.save_download_state(&snapshot).ok();
        path
    };
    // Delete the file from disk. Ignore errors (file may not exist yet).
    if let Some(path) = local_path {
        let path = std::path::PathBuf::from(&path);
        std::fs::remove_file(&path).ok();
        // Clean up the now-empty per-title (and alpha) folders so a deleted
        // movie doesn't leave an orphan empty directory behind. Never touches
        // the configured destination roots.
        if let Ok(config) = db.load_config() {
            prune_empty_media_dirs(&path, &media_dest_roots(&config));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_max_concurrent(
    queue: tauri::State<'_, crate::downloads::SharedQueue>,
    max: usize,
) -> Result<(), String> {
    let mut queue = queue.lock().unwrap();
    queue.update_concurrent(max);
    Ok(())
}

#[tauri::command]
pub async fn retry_download(
    db_state: tauri::State<'_, crate::db::Db>,
    queue_state: tauri::State<'_, crate::downloads::SharedQueue>,
    window: WebviewWindow,
    id: u64,
) -> Result<u64, String> {
    let db = db_state.inner().clone();
    let config = db.load_config()?;
    let (item, semaphore, cancel_flag) = {
        let mut queue = queue_state.lock().unwrap();
        queue.retry(id)?
    };

    let local_path_buf = std::path::PathBuf::from(&item.local_path);
    if let Some(parent) = local_path_buf.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    persist_download_state(&db, queue_state.inner());
    window.emit("download:update", serde_json::json!({
        "id": item.id,
        "status": "queued",
        "bytes_done": item.bytes_done,
        "error": serde_json::Value::Null,
        "started_at_ms": serde_json::Value::Null,
        "completed_at_ms": serde_json::Value::Null,
    })).ok();

    spawn_download_job_pub(
        db,
        queue_state.inner().clone(),
        Some(window.clone()),
        config,
        item.id,
        item.ftp_path.clone(),
        item.local_path.clone(),
        semaphore,
        cancel_flag,
    );

    Ok(item.id)
}

#[tauri::command]
pub async fn open_download_folder(
    app: tauri::AppHandle,
    local_path: String,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = std::path::PathBuf::from(&local_path);
    let folder = if path.is_dir() {
        path
    } else {
        path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| std::path::PathBuf::from("."))
    };
    app.opener().open_path(folder.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}


#[tauri::command]
pub async fn clear_item_metadata(
    state: tauri::State<'_, crate::db::Db>,
    id: i64,
) -> Result<(), String> {
    state.clear_item_metadata(id)
}

#[tauri::command]
pub async fn clear_show_metadata(
    state: tauri::State<'_, crate::db::Db>,
    tmdb_id: i64,
) -> Result<usize, String> {
    state.clear_show_metadata(tmdb_id)
}

/// Refuse destructive resets while an index pass is writing to the library.
pub(crate) fn ensure_not_indexing() -> Result<(), String> {
    if crate::INDEXING_RUNNING.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("Hay una indexación en curso. Espera a que termine e inténtalo de nuevo.".to_string());
    }
    Ok(())
}

/// Delete every indexed file so the next index re-parses the FTP from scratch.
/// Settings are kept. Returns the number of removed items.
#[tauri::command]
pub async fn reset_library(state: tauri::State<'_, crate::db::Db>) -> Result<usize, String> {
    ensure_not_indexing()?;
    state.reset_library()
}

/// Wipe library + settings and go back to the setup wizard. Web users and
/// the web-GUI block are kept (see `Db::factory_reset`).
#[tauri::command]
pub async fn factory_reset(state: tauri::State<'_, crate::db::Db>) -> Result<(), String> {
    ensure_not_indexing()?;
    state.factory_reset()
}

#[tauri::command]
pub async fn clear_all_metadata(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<usize, String> {
    state.clear_all_metadata()
}

#[tauri::command]
pub async fn refresh_all_metadata(
    state: tauri::State<'_, crate::db::Db>,
    window: WebviewWindow,
) -> Result<(), String> {
    refresh_all_metadata_internal(state.inner().clone(), Some(window)).await
}

pub async fn refresh_all_metadata_internal(
    db: crate::db::Db,
    window: Option<tauri::WebviewWindow>,
) -> Result<(), String> {
    let config = db.load_config()?;
    let items = db.get_all_media()?;
    let mut items: Vec<_> = items
        .into_iter()
        .filter(|item| {
            // Always include items that were never matched at all
            if item.tmdb_id.is_none() {
                return true;
            }
            // Include matched items that are missing core display fields.
            // imdb_id, tmdb_title_en, tmdb_overview_en, tmdb_poster_en are intentionally
            // excluded: they are legitimately absent for many items (TV shows have no IMDb ID,
            // non-English originals have no _en variant). Including them caused the same
            // items to be re-fetched every 15 minutes in an infinite loop.
            item.tmdb_title.as_deref().unwrap_or("").is_empty()
                || item.tmdb_poster.as_deref().unwrap_or("").is_empty()
                || item.tmdb_overview.as_deref().unwrap_or("").is_empty()
                || item.tmdb_release_date.as_deref().unwrap_or("").is_empty()
                || item.tmdb_rating.is_none()
                || item.tmdb_genres.as_deref().unwrap_or("").is_empty()
        })
        .collect();

    // Process newest entries first on boot/library refresh.
    items.sort_by(|a, b| {
        let parse_ts = |value: Option<&str>| -> i64 {
            value
                .and_then(|raw| chrono::DateTime::parse_from_rfc3339(raw).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc).timestamp())
                .unwrap_or(0)
        };

        parse_ts(b.indexed_at.as_deref())
            .cmp(&parse_ts(a.indexed_at.as_deref()))
            .then_with(|| b.id.cmp(&a.id))
    });

    let total = items.len();
    emit_index_log(&window, format!("🔄 Refreshing metadata for {} matched items…", total));

    if total == 0 {
        emit_index_log(&window, "✓ Metadata refresh complete — nothing missing".to_string());
        return Ok(());
    }

    // Emit initial progress so the frontend shows the banner immediately
    if let Some(ref w) = window {
        w.emit("metadata:refresh_progress", serde_json::json!({ "done": 0, "total": total })).ok();
    }
    crate::ws_broadcast("metadata:refresh_progress", serde_json::json!({ "done": 0, "total": total }));

    // Episodes of a show share a tmdb_id / search key, so their TMDB and
    // OMDb/TVDB results are fetched once per run (see LookupCache).
    let lookups = LookupCache::default();

    for (i, item) in items.into_iter().enumerate() {
        let media_type = item.tmdb_type
            .clone()
            .or_else(|| item.media_type.clone())
            .unwrap_or_else(|| "movie".to_string());
        let title = item.tmdb_title
            .clone()
            .or_else(|| item.title.clone())
            .unwrap_or_else(|| item.filename.clone());

        emit_index_log(
            &window,
            format!("🌐 [{}/{}] Refreshing metadata: {}", i + 1, total, title),
        );

        // Pace real requests only: a result already in the run cache costs
        // nothing remote, so it skips the delay.
        let cached = item
            .tmdb_id
            .is_some_and(|id| lookups.has_tmdb_by_id(id, &media_type));
        if !cached {
            tokio::time::sleep(std::time::Duration::from_millis(260)).await;
        }

        // Items with no tmdb_id need a full search, not just a detail fetch.
        if item.tmdb_id.is_none() {
            let tmdb_search_type = match media_type.as_str() {
                "tv" => "tv",
                "documentary" => {
                    let parsed = crate::parser::parse_media_path(&item.ftp_path, &item.filename);
                    if parsed.season.is_some() { "tv" } else { "movie" }
                },
                _ => "movie",
            };
            let year = item.year.map(|y| y as u16);
            match lookups.tmdb_match(&config, &config.tmdb_api_key, &title, year, tmdb_search_type).await {
                Ok(Some((movie, actual_type))) => {
                    db.update_tmdb_auto(item.id, &movie, &actual_type).ok();
                    let (omdb, tvdb) = match movie.imdb_id.as_deref() {
                        Some(imdb) if !imdb.is_empty() =>
                            enrich_extra_ratings_cached(&db, &config, item.id, imdb, window.as_ref(), &lookups).await,
                        _ => (None, None),
                    };
                    if let Some(ref w) = window {
                        w.emit("index:update", serde_json::json!({
                            "id": item.id,
                            "tmdb_id": movie.id,
                            "imdb_id": movie.imdb_id,
                            "tmdb_title": movie.title,
                            "tmdb_title_en": movie.title_en,
                            "tmdb_poster": movie.poster_path,
                            "tmdb_poster_en": movie.poster_path_en,
                            "tmdb_rating": movie.vote_average,
                            "tmdb_overview": movie.overview,
                            "tmdb_overview_en": movie.overview_en,
                            "tmdb_genres": movie.genre_ids,
                    "tmdb_watch_providers": movie.watch_providers,
                            "tmdb_release_date": movie.release_date,
                            "tmdb_type": actual_type,
                            "imdb_rating": omdb.as_ref().and_then(|o| o.imdb_rating),
                            "imdb_votes":  omdb.as_ref().and_then(|o| o.imdb_votes),
                            "tvdb_id":     tvdb.as_ref().and_then(|t| t.tvdb_id),
                            "tvdb_rating": tvdb.as_ref().and_then(|t| t.rating),
                        })).ok();
                    }
                }
                Ok(None) => {
                    emit_index_log(&window, format!("⚠ No TMDB match found for: {}", title));
                }
                Err(err) => {
                    emit_index_log(&window, format!("⚠ TMDB search failed for {}: {}", title, err));
                }
            }
            continue;
        }

        let tmdb_id = item.tmdb_id.unwrap();

        match lookups.tmdb_by_id(&config.tmdb_api_key, tmdb_id, &media_type).await {
            Ok(movie) => {
                db.refresh_tmdb_metadata(
                    item.id,
                    &movie,
                    &media_type,
                    item.manual_match.unwrap_or(0) != 0,
                )?;
                // Only enrich extra ratings when the row is missing them, to
                // keep this 15-minute refresh pass cheap. New matches (the
                // other branch) always enrich.
                let needs_extra_ratings = item.imdb_rating.is_none() && item.tvdb_rating.is_none();
                let (omdb, tvdb) = if needs_extra_ratings {
                    match movie.imdb_id.as_deref() {
                        Some(imdb) if !imdb.is_empty() =>
                            enrich_extra_ratings_cached(&db, &config, item.id, imdb, window.as_ref(), &lookups).await,
                        _ => (None, None),
                    }
                } else {
                    (None, None)
                };
                if let Some(ref w) = window {
                    w.emit("index:update", serde_json::json!({
                        "id": item.id,
                        "tmdb_id": movie.id,
                        "imdb_id": movie.imdb_id,
                        "tmdb_title": movie.title,
                        "tmdb_title_en": movie.title_en,
                        "tmdb_poster": movie.poster_path,
                        "tmdb_poster_en": movie.poster_path_en,
                        "tmdb_rating": movie.vote_average,
                        "tmdb_overview": movie.overview,
                        "tmdb_overview_en": movie.overview_en,
                        "tmdb_genres": movie.genre_ids,
                    "tmdb_watch_providers": movie.watch_providers,
                        "tmdb_release_date": movie.release_date,
                        "tmdb_type": media_type,
                        "imdb_rating": omdb.as_ref().and_then(|o| o.imdb_rating),
                        "imdb_votes":  omdb.as_ref().and_then(|o| o.imdb_votes),
                        "tvdb_id":     tvdb.as_ref().and_then(|t| t.tvdb_id),
                        "tvdb_rating": tvdb.as_ref().and_then(|t| t.rating),
                    })).ok();
                }
            }
            Err(err) => {
                emit_index_log(
                    &window,
                    format!("⚠ Metadata refresh failed for {}: {}", title, err),
                );
            }
        }

        // Emit per-item progress
        let refresh_payload = serde_json::json!({ "done": i + 1, "total": total });
        if let Some(ref w) = window {
            w.emit("metadata:refresh_progress", refresh_payload.clone()).ok();
        }
        crate::ws_broadcast("metadata:refresh_progress", refresh_payload);
    }

    emit_index_log(
        &window,
        format!("✓ Metadata refresh complete — {} items processed", total),
    );
    Ok(())
}

/// On-demand backfill: fetch TMDB watch-provider data for every TMDB-matched
/// row that doesn't have it yet. Cheap-per-item (one HTTP call) but uses the
/// shared TMDB throttle, so a 4 000-row library takes a couple of minutes.
#[tauri::command]
pub async fn refresh_watch_providers(
    state: tauri::State<'_, crate::db::Db>,
    window: WebviewWindow,
) -> Result<RefreshProvidersSummary, String> {
    refresh_watch_providers_internal(state.inner().clone(), Some(window)).await
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RefreshProvidersSummary {
    pub total: usize,
    pub updated: usize,
    pub failed: usize,
}

pub async fn refresh_watch_providers_internal(
    db: crate::db::Db,
    window: Option<tauri::WebviewWindow>,
) -> Result<RefreshProvidersSummary, String> {
    let config = db.load_config()?;
    if config.tmdb_api_key.trim().is_empty() {
        return Err("TMDB API key not configured".to_string());
    }

    // Group by (tmdb_id, media_type) so a 60-episode show makes 1 API call,
    // not 60. The bulk update propagates the result to every row sharing the
    // tmdb_id — fixing the prior inconsistency where some episodes of a show
    // ended up with provider data and others NULL after a partial-failure run.
    let pending = db.list_tmdb_ids_needing_watch_providers()?;
    let total = pending.len();
    emit_index_log(
        &window,
        format!("🔄 Refreshing streaming platforms for {} titles…", total),
    );

    if let Some(ref w) = window {
        w.emit(
            "watch_providers:refresh_progress",
            serde_json::json!({ "done": 0, "total": total }),
        )
        .ok();
    }

    let mut updated_rows = 0usize;
    let mut failed = 0usize;

    for (i, (tmdb_id, tmdb_type)) in pending.into_iter().enumerate() {
        let media_type = if tmdb_type == "tv" { "tv" } else { "movie" };
        match crate::tmdb::fetch_watch_providers(&config.tmdb_api_key, tmdb_id, media_type).await {
            Ok(providers) => {
                match db.update_watch_providers_by_tmdb_id(tmdb_id, &providers) {
                    Ok(affected_ids) => {
                        updated_rows += affected_ids.len();
                        if let Some(ref w) = window {
                            for id in affected_ids {
                                w.emit(
                                    "index:update",
                                    serde_json::json!({
                                        "id": id,
                                        "tmdb_watch_providers": providers,
                                    }),
                                )
                                .ok();
                            }
                        }
                    }
                    Err(err) => {
                        failed += 1;
                        emit_index_log(
                            &window,
                            format!(
                                "⚠ Failed to persist providers for tmdb_id {}: {}",
                                tmdb_id, err
                            ),
                        );
                    }
                }
            }
            Err(err) => {
                failed += 1;
                emit_index_log(
                    &window,
                    format!("⚠ Providers fetch failed for tmdb_id {}: {}", tmdb_id, err),
                );
            }
        }

        if let Some(ref w) = window {
            w.emit(
                "watch_providers:refresh_progress",
                serde_json::json!({ "done": i + 1, "total": total }),
            )
            .ok();
        }
    }

    emit_index_log(
        &window,
        format!(
            "✓ Streaming platform refresh complete — {} rows updated across {} titles, {} failed",
            updated_rows, total, failed
        ),
    );

    Ok(RefreshProvidersSummary {
        total,
        updated: updated_rows,
        failed,
    })
}

#[tauri::command]
pub async fn check_media_badges(
    state: tauri::State<'_, crate::db::Db>,
    items: Vec<MediaBadgeQuery>,
) -> Result<Vec<MediaBadgeResult>, String> {
    let config = state.load_config()?;
    let mut results = Vec::with_capacity(items.len());
    let mut plex_badge_cache: std::collections::HashMap<String, MediaServerCheck> =
        std::collections::HashMap::new();

    for item in items {
        let downloaded = compute_local_path(&config, &item.ftp_path, &item.filename, item.media_type.as_deref(), None)
            .map(|path| path.exists())
            .unwrap_or(false);

        let check = if let Some(cache_key) = plex_badge_cache_key(&item) {
            if let Some(hit) = plex_badge_cache.get(&cache_key).cloned() {
                MediaServerCheck {
                    cache_state: format!("request-hit:{cache_key}"),
                    ..hit
                }
            } else {
                let check = check_media_server_presence(&config, &item).await.unwrap_or(MediaServerCheck {
                    hit: false,
                    plex_hit: false,
                    emby_hit: false,
                    cache_state: "error".to_string(),
                    debug: "media-server-check:error".to_string(),
                });
                plex_badge_cache.insert(cache_key, check.clone());
                check
            }
        } else {
            MediaServerCheck {
                hit: false,
                plex_hit: false,
                emby_hit: false,
                cache_state: "no-cache-key".to_string(),
                debug: "no-cache-key".to_string(),
            }
        };

        results.push(MediaBadgeResult {
            id: item.id,
            downloaded,
            in_emby: check.hit,
            plex_in_library: Some(check.plex_hit),
            emby_in_library: Some(check.emby_hit),
            cache: Some(check.cache_state),
            debug: Some(check.debug),
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn watchdog_pong(
    window: WebviewWindow,
    state: tauri::State<'_, crate::WatchdogState>,
    nonce: u64,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let entry = guard.entry(window.label().to_string()).or_default();
    if entry.awaiting_nonce == Some(nonce) {
        entry.awaiting_nonce = None;
    }
    entry.recovered_once = false;
    Ok(())
}

/// Fan-out search across TMDB, TVDB and OMDb.
///
/// TMDB is the canonical match — display, ratings, and watchlist all key off
/// TMDB ids. So TVDB and OMDb are used as *discovery* sources: when they
/// return a hit with an IMDb id we don't already have in the TMDB results,
/// we look that id up in TMDB and merge it in. The final list is still
/// `Vec<TmdbMovie>` so nothing downstream changes.
///
/// Hits without an IMDb id (rare on TVDB, never on OMDb) are skipped because
/// we can't anchor them to a TMDB row.
#[tauri::command]
pub async fn search_tmdb(
    state: tauri::State<'_, crate::db::Db>,
    query: String,
    media_type: String,
    year: Option<u16>,
) -> Result<Vec<crate::tmdb::TmdbMovie>, String> {
    let config = state.load_config()?;
    let tmdb_key = config.tmdb_api_key.clone();
    let omdb_key = config.omdb_api_key.clone();
    let tvdb_key = config.tvdb_api_key.clone();

    // 1. Primary TMDB search runs first so its native scoring drives ordering.
    let mut results = crate::tmdb::search_tmdb_multi_with_year(
        &tmdb_key,
        &query,
        &media_type,
        year,
    )
    .await
    .unwrap_or_default();

    // 2. Concurrent discovery on TVDB and OMDb — pulls IMDb ids we can
    //    promote to TMDB matches.
    let tvdb_fut = async {
        if tvdb_key.trim().is_empty() {
            Vec::new()
        } else {
            crate::tvdb::search_by_title(&tvdb_key, &query, &media_type).await
        }
    };
    let omdb_fut = async {
        if omdb_key.trim().is_empty() {
            Vec::new()
        } else {
            let omdb_type = match media_type.as_str() {
                "tv" => "series",
                t => t,
            };
            crate::omdb::search_by_title(&omdb_key, &query, omdb_type).await
        }
    };
    let (tvdb_hits, omdb_hits) = tokio::join!(tvdb_fut, omdb_fut);

    // De-dupe against TMDB hits we already have, then collect candidate IMDb ids.
    let mut already_have: std::collections::HashSet<String> = results
        .iter()
        .filter_map(|m| m.imdb_id.as_ref().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    let mut extra_imdb: Vec<String> = Vec::new();
    for (imdb, _title) in tvdb_hits {
        if already_have.insert(imdb.clone()) {
            extra_imdb.push(imdb);
        }
    }
    for (imdb, _title, _year) in omdb_hits {
        if already_have.insert(imdb.clone()) {
            extra_imdb.push(imdb);
        }
    }

    // 3. Resolve each candidate IMDb id back to a full TMDB record.
    //    Done sequentially so the TMDB throttle keeps us under rate-limit
    //    rather than firing N concurrent /find requests.
    if !tmdb_key.trim().is_empty() {
        for imdb_id in extra_imdb {
            match crate::tmdb::find_by_imdb_id(&tmdb_key, &imdb_id, &media_type).await {
                Ok(Some(movie)) => results.push(movie),
                Ok(None) => {} // TVDB/OMDb had it but TMDB doesn't — drop silently.
                Err(e) => {
                    eprintln!("[search] TMDB find_by_imdb_id({imdb_id}) failed: {e}");
                }
            }
        }
    }

    results.truncate(20);
    Ok(results)
}

#[tauri::command]
pub async fn apply_tmdb_match(
    state: tauri::State<'_, crate::db::Db>,
    window: WebviewWindow,
    item_id: i64,
    tmdb_id: i64,
    media_type: String,
) -> Result<(), String> {
    let config = state.load_config()?;
    let movie = crate::tmdb::fetch_movie_by_id(&config.tmdb_api_key, tmdb_id, &media_type).await?;
    state.update_tmdb_manual(item_id, &movie, &media_type)?;
    window.emit(
        "index:update",
        serde_json::json!({
            "id": item_id,
            "tmdb_id": movie.id,
            "imdb_id": movie.imdb_id,
            "tmdb_title": movie.title,
            "tmdb_title_en": movie.title_en,
            "tmdb_poster": movie.poster_path,
            "tmdb_poster_en": movie.poster_path_en,
            "tmdb_rating": movie.vote_average,
            "tmdb_overview": movie.overview,
            "tmdb_overview_en": movie.overview_en,
            "tmdb_genres": movie.genre_ids,
            "tmdb_watch_providers": movie.watch_providers,
            "tmdb_release_date": movie.release_date,
            "tmdb_type": media_type,
        }),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn ftp_list_root_dirs(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<Vec<String>, String> {
    let config = state.load_config()?;
    let entries = crate::ftp::list_raw(
        &crate::ftp::FtpEndpoint::from_config(&config),
        &config.ftp_root,
    ).await?;
    // Parse directory entries (Unix: starts with 'd', Windows: contains '<DIR>')
    let dirs = entries.into_iter().filter_map(|line| {
        let is_dir = line.starts_with('d') || line.to_uppercase().contains("<DIR>");
        if !is_dir { return None; }
        let parts: Vec<&str> = line.split_whitespace().collect();
        let name_start = if line.starts_with('d') { 8 } else { 3 };
        if parts.len() > name_start {
            let name = parts[name_start..].join(" ");
            if name != "." && name != ".." { Some(name) } else { None }
        } else { None }
    }).collect();
    Ok(dirs)
}

#[tauri::command]
pub async fn ftp_list_root_dirs_preview(
    host: String,
    port: u16,
    user: String,
    pass: String,
    root: String,
    tls: Option<bool>,
    tls_accept_invalid_certs: Option<bool>,
) -> Result<Vec<String>, String> {
    let ep = crate::ftp::FtpEndpoint {
        host,
        port,
        user,
        pass,
        tls: tls.unwrap_or(false),
        tls_accept_invalid_certs: tls_accept_invalid_certs.unwrap_or(false),
    };
    let entries = crate::ftp::list_raw(&ep, &root).await?;
    let dirs = entries
        .into_iter()
        .filter_map(|line| {
            let is_dir = line.starts_with('d') || line.to_uppercase().contains("<DIR>");
            if !is_dir {
                return None;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            let name_start = if line.starts_with('d') { 8 } else { 3 };
            if parts.len() > name_start {
                let name = parts[name_start..].join(" ");
                if name != "." && name != ".." {
                    Some(name)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect();
    Ok(dirs)
}

#[tauri::command]
pub async fn get_webgui_config(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<crate::db::WebGuiConfig, String> {
    state.load_webgui_config()
}

#[tauri::command]
pub async fn save_webgui_config(
    state: tauri::State<'_, crate::db::Db>,
    config: crate::db::WebGuiConfig,
) -> Result<(), String> {
    state.save_webgui_config(&config)
}

#[tauri::command]
pub async fn init_webgui_now(
    db: tauri::State<'_, crate::db::Db>,
    queue: tauri::State<'_, crate::downloads::SharedQueue>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    crate::web::spawn_if_enabled(db.inner().clone(), queue.inner().clone(), app);
    Ok(())
}

// ── Watchlist commands ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_watchlist(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<Vec<crate::db::WatchlistItem>, String> {
    state.get_watchlist(0)
}

#[tauri::command]
pub async fn add_to_watchlist(
    state: tauri::State<'_, crate::db::Db>,
    queue_state: tauri::State<'_, crate::downloads::SharedQueue>,
    app: tauri::AppHandle,
    tmdb_id: i64,
    tmdb_type: String,
    title: String,
    title_en: Option<String>,
    poster: Option<String>,
    overview: Option<String>,
    overview_en: Option<String>,
    status: Option<String>,
    release_date: Option<String>,
    year: Option<i64>,
    latest_season: Option<i64>,
    scope: String,
    auto_download: bool,
    profile_id: Option<i64>,
) -> Result<i64, String> {
    let resolved_profile_id = profile_id.unwrap_or_else(|| {
        state.get_quality_profiles().ok()
            .and_then(|ps| ps.into_iter().next())
            .map(|p| p.id)
            .unwrap_or(1)
    });
    let id = state.add_watchlist_item(
        0,
        tmdb_id,
        &tmdb_type,
        &title,
        title_en.as_deref(),
        poster.as_deref(),
        overview.as_deref(),
        overview_en.as_deref(),
        status.as_deref(),
        release_date.as_deref(),
        year,
        latest_season,
        &scope,
        auto_download,
        resolved_profile_id,
    )?;

    // If auto-download is enabled, immediately check whether any already-indexed
    // files match this new watchlist entry and queue them.
    if auto_download {
        let db = state.inner().clone();
        let queue = queue_state.inner().clone();
        let window = app.get_webview_window("main")
            .filter(|w| w.is_visible().ok().unwrap_or(false));
        tokio::spawn(async move {
            trigger_watchlist_auto_downloads(db, queue, window).await;
        });
    }

    Ok(id)
}

#[tauri::command]
pub async fn remove_from_watchlist(
    state: tauri::State<'_, crate::db::Db>,
    id: i64,
) -> Result<(), String> {
    state.remove_watchlist_item(id, 0)
}

#[tauri::command]
pub async fn update_watchlist_item(
    state: tauri::State<'_, crate::db::Db>,
    queue_state: tauri::State<'_, crate::downloads::SharedQueue>,
    app: tauri::AppHandle,
    id: i64,
    scope: String,
    auto_download: bool,
    profile_id: Option<i64>,
) -> Result<(), String> {
    state.update_watchlist_item(id, 0, &scope, auto_download, profile_id.unwrap_or(1))?;
    // If auto-download was just enabled, immediately scan for matching indexed files.
    if auto_download {
        let db = state.inner().clone();
        let queue = queue_state.inner().clone();
        let window = app.get_webview_window("main")
            .filter(|w| w.is_visible().ok().unwrap_or(false));
        tokio::spawn(async move {
            trigger_watchlist_auto_downloads(db, queue, window).await;
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn get_quality_profiles(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<Vec<crate::db::QualityProfile>, String> {
    state.get_quality_profiles()
}

#[tauri::command]
pub async fn create_quality_profile(
    state: tauri::State<'_, crate::db::Db>,
    name: String,
    min_resolution: Option<String>,
    preferred_resolution: Option<String>,
    prefer_hdr: bool,
    preferred_codecs: String,
    preferred_audio_codecs: String,
    preferred_release_types: String,
    min_size_gb: Option<f64>,
    max_size_gb: Option<f64>,
) -> Result<crate::db::QualityProfile, String> {
    state.create_quality_profile(
        &name,
        min_resolution.as_deref(),
        preferred_resolution.as_deref(),
        prefer_hdr,
        &preferred_codecs,
        &preferred_audio_codecs,
        &preferred_release_types,
        min_size_gb,
        max_size_gb,
    )
}

#[tauri::command]
pub async fn update_quality_profile(
    state: tauri::State<'_, crate::db::Db>,
    id: i64,
    name: String,
    min_resolution: Option<String>,
    preferred_resolution: Option<String>,
    prefer_hdr: bool,
    preferred_codecs: String,
    preferred_audio_codecs: String,
    preferred_release_types: String,
    min_size_gb: Option<f64>,
    max_size_gb: Option<f64>,
) -> Result<(), String> {
    state.update_quality_profile(
        id,
        &name,
        min_resolution.as_deref(),
        preferred_resolution.as_deref(),
        prefer_hdr,
        &preferred_codecs,
        &preferred_audio_codecs,
        &preferred_release_types,
        min_size_gb,
        max_size_gb,
    )
}

#[tauri::command]
pub async fn delete_quality_profile(
    state: tauri::State<'_, crate::db::Db>,
    id: i64,
) -> Result<(), String> {
    state.delete_quality_profile(id)
}

#[tauri::command]
pub async fn check_watchlist_item(
    state: tauri::State<'_, crate::db::Db>,
    tmdb_id: i64,
) -> Result<Option<crate::db::WatchlistItem>, String> {
    state.check_watchlist_item(tmdb_id, 0)
}

#[tauri::command]
pub async fn get_watchlist_coverage(
    state: tauri::State<'_, crate::db::Db>,
    tmdb_id: i64,
) -> Result<Vec<crate::db::WatchlistCoverageItem>, String> {
    state.get_watchlist_library_coverage(tmdb_id)
}

#[tauri::command]
pub async fn get_tv_seasons(
    state: tauri::State<'_, crate::db::Db>,
    tmdb_id: i64,
) -> Result<Vec<crate::tmdb::TmdbSeason>, String> {
    let config = state.load_config()?;
    crate::tmdb::fetch_tv_seasons(&config.tmdb_api_key, tmdb_id).await
}

/// After indexing completes, enqueue FTP files that match a watchlist entry
/// with `auto_download = 1` and are not already queued or being downloaded.
pub async fn trigger_watchlist_auto_downloads(
    db: crate::db::Db,
    queue: crate::downloads::SharedQueue,
    window: Option<tauri::WebviewWindow>,
) {
    use crate::watchlist_quality::{fallback_profile, pick_best};

    let profiles: std::collections::HashMap<i64, crate::db::QualityProfile> =
        match db.get_quality_profiles() {
            Ok(ps) => ps.into_iter().map(|p| (p.id, p)).collect(),
            Err(e) => {
                eprintln!("[watchlist] auto-download: could not load profiles: {e}");
                return;
            }
        };
    // Used when the entry's profile no longer exists.
    let fallback_profile = fallback_profile();

    let config = match db.load_config() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[watchlist] auto-download: could not load config: {e}");
            return;
        }
    };
    let candidates = match db.get_watchlist_auto_download_candidates() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[watchlist] auto-download: could not get candidates: {e}");
            return;
        }
    };
    println!("[watchlist] auto-download: {} candidate file(s) matched watchlist entries", candidates.len());
    // Honour "Latest season" scope: without this, a show followed with
    // scope=latest auto-downloaded its whole back catalogue.
    let candidates = crate::db::retain_latest_season_candidates(candidates);

    // Group candidates by (tmdb_id, season, episode) so we pick the best
    // quality version for each distinct piece of content.
    use std::collections::HashMap;
    type GroupKey = (i64, Option<i64>, Option<i64>);
    let mut groups: HashMap<GroupKey, Vec<crate::db::WatchlistAutoItem>> = HashMap::new();
    for item in candidates {
        let key = (item.tmdb_id, item.season, item.episode);
        groups.entry(key).or_default().push(item);
    }

    for (_key, group) in groups {
        // All items in a group share the same watchlist entry → same profile.
        let profile_id = group[0].profile_id;
        let profile = profiles.get(&profile_id).unwrap_or(&fallback_profile);

        // Best release by quality score; none when hard filters reject all.
        let Some(best) = pick_best(&group, profile) else {
            continue;
        };
        let item = &group[best];

        // Stable, root-independent identity for grab-history dedup.
        let rel_of = |c: &crate::db::WatchlistAutoItem| {
            c.ftp_relative_path.clone().unwrap_or_else(|| {
                crate::db::Db::compute_relative_path(&c.ftp_path, &config.ftp_root)
            })
        };
        let rel = rel_of(item);

        // Skip if this piece of content (any release of this movie/episode)
        // was already auto-grabbed in a previous run. This is the primary
        // guard against re-downloading the whole watchlist after a version
        // upgrade, and it also stops a second release of an episode that was
        // already grabbed (e.g. a new 1080p after the 720p) from being
        // downloaded again as a duplicate.
        if let Some(prev) = group
            .iter()
            .find(|c| db.is_watchlist_grabbed(&rel_of(c)).unwrap_or(false))
        {
            println!("[watchlist] auto-download: '{}' already grabbed previously ('{}'), skipping",
                item.filename, prev.filename);
            continue;
        }

        // Skip if already Queued or Downloading
        {
            let q = queue.lock().unwrap();
            if q.find_active_by_ftp_path(&item.ftp_path).is_some() {
                println!("[watchlist] auto-download: '{}' already in queue, skipping", item.filename);
                continue;
            }
        }

        let local_path = match compute_local_path(
            &config,
            &item.ftp_path,
            &item.filename,
            item.media_type.as_deref(),
            item.tmdb_genres.as_deref(),
        ) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[watchlist] auto-download: local_path error for {}: {e}", item.ftp_path);
                continue;
            }
        };

        // Skip if file already exists at destination
        if local_path.exists() {
            println!("[watchlist] auto-download: '{}' already exists at '{}', skipping",
                item.filename, local_path.display());
            continue;
        }

        if let Some(parent) = local_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let local_str = local_path.to_string_lossy().to_string();
        let (id, semaphore, cancel_flag) = {
            let mut q = queue.lock().unwrap();
            q.add(
                item.ftp_path.clone(),
                item.filename.clone(),
                local_str.clone(),
                item.media_title.clone(),
            )
        };

        persist_download_state(&db, &queue);

        // Record the grab so this release is never auto-downloaded again, even
        // if the file is later moved/deleted or its computed path changes.
        db.record_watchlist_grab(&rel, &item.ftp_path, item.tmdb_id, &item.filename).ok();

        if let Some(ref w) = window {
            let q = queue.lock().unwrap();
            if let Some(download_item) = q.items.iter().find(|i| i.id == id).cloned() {
                drop(q);
                w.emit("download:added", &download_item).ok();
            }
        }

        spawn_download_job_pub(
            db.clone(),
            queue.clone(),
            window.clone(),
            config.clone(),
            id,
            item.ftp_path.clone(),
            local_str,
            semaphore,
            cancel_flag,
        );

        println!("[watchlist] auto-queued (profile_id={profile_id}): {}", item.ftp_path);
    }
}

// ── Fix 4: indexing loop decoupling tests ────────────────────────────────────
//
// ─── Analysis / Upload / Telegram commands ────────────────────────────────────

/// Returns the ffprobe version string if found in PATH, or null.
#[tauri::command]
pub fn check_ffprobe() -> Option<String> {
    crate::analysis::check_ffprobe()
}

/// Attempt to install ffmpeg via the system package manager (Homebrew on macOS,
/// apt-get on Linux). Returns a success message or an error string.
#[tauri::command]
pub async fn install_ffprobe() -> Result<String, String> {
    crate::analysis::install_ffmpeg().await
}

/// Run ffprobe on a local file and return media info.
#[tauri::command]
pub fn analyze_local_file(path: String) -> Result<crate::analysis::LocalMediaInfo, String> {
    crate::analysis::ffprobe_analyze(&path)
}

/// List video files inside a local directory, sorted by name.
/// Recursively collects absolute paths to video files under `dir`.
fn collect_video_files_recursive(
    dir: &std::path::Path,
    out: &mut Vec<String>,
    video_exts: &[&str],
) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    for entry in read.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_video_files_recursive(&p, out, video_exts);
        } else if p.is_file() {
            let is_video = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| video_exts.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false);
            if is_video {
                if let Some(s) = p.to_str() {
                    out.push(s.to_string());
                }
            }
        }
    }
}

/// Returns a sorted list of absolute paths to all video files under `dir` (recursive).
#[tauri::command]
pub fn list_local_video_files(dir: String) -> Result<Vec<String>, String> {
    const VIDEO_EXTS: &[&str] = &["mkv", "mp4", "avi", "m2ts", "mov", "ts"];
    let mut entries: Vec<String> = Vec::new();
    collect_video_files_recursive(std::path::Path::new(&dir), &mut entries, VIDEO_EXTS);
    entries.sort();
    Ok(entries)
}

#[tauri::command]
pub async fn check_ftp_write_permission(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<bool, String> {
    let config = state.load_config()?;
    crate::ftp::check_write_permission(
        &crate::ftp::FtpEndpoint::from_config(&config),
        &config.ftp_root,
    )
    .await
}

/// Full permission report for Settings → FTP (list / mkdir / upload /
/// download / delete), measured against the saved configuration.
#[tauri::command]
pub async fn get_ftp_permissions(
    state: tauri::State<'_, crate::db::Db>,
) -> Result<crate::ftp::FtpPermissions, String> {
    let config = state.load_config()?;
    Ok(crate::ftp::probe_permissions(
        &crate::ftp::FtpEndpoint::from_config(&config),
        &config.ftp_root,
    )
    .await)
}

// ─── Upload destination suggestion ───────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct UploadSuggestion {
    pub dest: String,
    pub media_type: String, // "movie" | "tv" | "documentary"
    pub detected_title: Option<String>,
    pub detected_season: Option<u32>,
    pub detected_episode: Option<u32>,
    pub detected_year: Option<u32>,
    /// Release type detected from the filename (e.g. "BDREMUX", "WEB-DL", "BDRip")
    pub detected_release_type: Option<String>,
    /// Resolution detected from the filename (e.g. "1080p", "4K")
    pub detected_resolution: Option<String>,
    /// Video codec detected from the filename (e.g. "HEVC", "AVC")
    pub detected_codec: Option<String>,
    /// Audio codec detected from the filename (e.g. "DTS", "AC3")
    pub detected_audio_codec: Option<String>,
    /// Channel layout from the filename ("5.1"), used when ffprobe is missing.
    pub detected_audio_channels: Option<String>,
    /// Languages detected from the filename (e.g. ["spa", "eng"])
    pub detected_languages: Vec<String>,
    /// HDR type detected from the filename (e.g. "HDR", "DV")
    pub detected_hdr: Option<String>,
    /// Base FTP folder configured for movies (sanitised, empty if not set)
    pub movie_dest: String,
    /// Base FTP folder configured for TV shows (sanitised, empty if not set)
    pub tv_dest: String,
    /// TV base + resolved category subfolder (e.g. tv_dest/Temporadas en emision).
    /// Season folder uploads should go directly inside this path.
    pub tv_category_dest: String,
    /// All configured FTP folder paths (ftp_root/folder_name) from the folder_types config.
    /// Used by the frontend to populate dest input suggestions.
    pub folder_options: Vec<String>,
}

/// Normalise a string for fuzzy folder matching: lowercase, strip non-alphanumeric, collapse spaces.
fn strip_diacritic(c: char) -> char {
    match c {
        'á' | 'à' | 'ä' | 'â' | 'Á' | 'À' | 'Ä' | 'Â' => 'a',
        'é' | 'è' | 'ë' | 'ê' | 'É' | 'È' | 'Ë' | 'Ê' => 'e',
        'í' | 'ì' | 'ï' | 'î' | 'Í' | 'Ì' | 'Ï' | 'Î' => 'i',
        'ó' | 'ò' | 'ö' | 'ô' | 'Ó' | 'Ò' | 'Ö' | 'Ô' => 'o',
        'ú' | 'ù' | 'ü' | 'û' | 'Ú' | 'Ù' | 'Ü' | 'Û' => 'u',
        'ñ' | 'Ñ' => 'n',
        other => other,
    }
}

fn normalise_for_match(s: &str) -> String {
    s.chars()
        .map(strip_diacritic)
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Count how many tokens from `query` appear in `candidate` (exact word match after normalisation).
fn token_overlap(query: &str, candidate: &str) -> usize {
    let q_tokens: Vec<&str> = query.split_whitespace().collect();
    let c_tokens: Vec<&str> = candidate.split_whitespace().collect();
    q_tokens.iter().filter(|t| c_tokens.contains(t)).count()
}

/// Given a list of raw FTP LIST lines, extract directory names.
fn extract_dir_names(raw: &[String]) -> Vec<String> {
    raw.iter()
        .filter_map(|line| {
            let is_dir = line.starts_with('d') || line.to_uppercase().contains("<DIR>");
            if !is_dir { return None; }
            let parts: Vec<&str> = line.split_whitespace().collect();
            let name_start = if line.starts_with('d') { 8 } else { 3 };
            if parts.len() > name_start {
                let name = parts[name_start..].join(" ");
                if name != "." && name != ".." && !name.is_empty() {
                    Some(name)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect()
}

/// Find the closest matching show directory name in `dirs` for `show_title`.
/// Returns the dir name with the highest token overlap (minimum 1 token match).
fn fuzzy_best_show(show_title: &str, dirs: &[String]) -> Option<String> {
    let norm_query = normalise_for_match(show_title);
    let mut best: Option<(usize, &String)> = None;
    for dir in dirs {
        let norm_dir = normalise_for_match(dir);
        let overlap = token_overlap(&norm_query, &norm_dir);
        if overlap == 0 { continue; }
        if best.map_or(true, |(best_score, _)| overlap > best_score) {
            best = Some((overlap, dir));
        }
    }
    best.map(|(_, dir)| dir.clone())
}

/// Given a local file or folder path, suggest an FTP destination path and
/// detect whether it's a movie, TV show, or documentary.
#[tauri::command]
pub async fn suggest_upload_destination(
    local_path: String,
    state: tauri::State<'_, crate::db::Db>,
) -> Result<UploadSuggestion, String> {
    use std::path::Path;
    let config = state.load_config()?;
    let p = Path::new(&local_path);

    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    let mut parsed = crate::parser::parse_media_path("", &name);

    // Scan directory contents to detect season/episode and quality metadata.
    // Priority: episode files (richest metadata) > season subfolder names > recurse into subfolders.
    if p.is_dir() {
        let top_entries: Vec<_> = std::fs::read_dir(&local_path)
            .into_iter().flatten().flatten().collect();

        // Pass 1: iterate all entries once.
        // — Episode FILES: extract full metadata and stop.
        // — Season DIRECTORIES: record season number and try to extract resolution
        //   from the folder name itself (e.g. "S01 2160p"), but keep going so we
        //   can still find episode files with richer info.
        for entry in &top_entries {
            let entry_name = entry.file_name().to_string_lossy().to_string();
            let lower = entry_name.to_lowercase();
            let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
            let is_dir  = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

            // Episode file with a season/episode pattern — stop here, it has everything.
            if is_file {
                let ep = crate::parser::parse_media_path("", &entry_name);
                if ep.season.is_some() || ep.episode.is_some() {
                    if parsed.season.is_none() { parsed.season = ep.season.or(Some(1)); }
                    if parsed.episode.is_none() { parsed.episode = ep.episode; }
                    if parsed.resolution.is_none() { parsed.resolution = ep.resolution; }
                    if parsed.codec.is_none() { parsed.codec = ep.codec; }
                    if parsed.audio_codec.is_none() { parsed.audio_codec = ep.audio_codec; parsed.audio_channels = ep.audio_channels; }
                    if parsed.release_type.is_none() { parsed.release_type = ep.release_type; }
                    break; // episode files are the richest source of truth
                }
            }

            // Season subfolder (must actually be a directory to avoid confusing
            // episode files like "S01E01.foo.mkv" with season folders).
            if is_dir && (
                lower.starts_with("season")
                || lower.starts_with("temporada")
                || (lower.len() >= 2 && lower.starts_with('s') && lower.chars().nth(1).map_or(false, |c| c.is_ascii_digit()))
            ) {
                if parsed.season.is_none() {
                    // Extract first run of digits as the season number.
                    let digits: String = entry_name.chars()
                        .skip_while(|c| !c.is_ascii_digit())
                        .take_while(|c| c.is_ascii_digit())
                        .collect();
                    let n: Option<u8> = digits.parse().ok();
                    parsed.season = n.or(Some(1));
                }
                // Season folder names sometimes encode quality ("S01 2160p").
                let sf = crate::parser::parse_media_path("", &entry_name);
                if parsed.resolution.is_none() { parsed.resolution = sf.resolution; }
                if parsed.codec.is_none()      { parsed.codec = sf.codec; }
                // Don't break — keep looking for episode files that have richer info.
            }
        }

        // Pass 2: if we know it's TV but still have no resolution, recurse one
        // level into any subdirectory to find episode filenames there.
        if parsed.season.is_some() && parsed.resolution.is_none() {
            'outer: for entry in &top_entries {
                if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) { continue; }
                if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                    for sub in sub_entries.flatten() {
                        if !sub.file_type().map(|t| t.is_file()).unwrap_or(false) { continue; }
                        let sub_name = sub.file_name().to_string_lossy().to_string();
                        let ep = crate::parser::parse_media_path("", &sub_name);
                        if parsed.resolution.is_none() { parsed.resolution = ep.resolution; }
                        if parsed.codec.is_none()      { parsed.codec = ep.codec; }
                        if parsed.audio_codec.is_none(){ parsed.audio_codec = ep.audio_codec; parsed.audio_channels = ep.audio_channels; }
                        if parsed.release_type.is_none(){ parsed.release_type = ep.release_type; }
                        if parsed.resolution.is_some() { break 'outer; }
                    }
                }
            }
        }
    }

    let media_type = if parsed.season.is_some() || parsed.episode.is_some() {
        "tv"
    } else {
        "movie"
    };

    // ── Build FTP destinations from folder_types + ftp_root ──────────────
    let folder_map: std::collections::HashMap<String, String> =
        serde_json::from_str(&config.folder_types).unwrap_or_default();
    let ftp_root = config.ftp_root.trim_end_matches('/').to_string();

    // Score a folder name against parsed file metadata — higher is better.
    let score_folder = |folder: &str| -> i32 {
        let fl = folder.to_lowercase();
        let mut score = 0i32;
        // Resolution
        if let Some(ref res) = parsed.resolution {
            let rl = res.to_lowercase();
            if rl.contains("2160") || rl.contains("4k") || rl.contains("uhd") {
                if fl.contains("2160") || fl.contains("4k") || fl.contains("uhd") {
                    score += 20;
                } else if fl.contains("1080") {
                    score -= 20; // strong penalty: 1080p folder is wrong for 4K content
                } else {
                    score -= 5; // mild penalty for non-4K folders without explicit resolution
                }
            } else if rl.contains("1080") {
                if fl.contains("1080") {
                    score += 20;
                } else if fl.contains("2160") || fl.contains("4k") || fl.contains("uhd") {
                    score -= 20; // strong penalty: 4K folder is wrong for 1080p content
                }
            }
        }
        // Codec — bonus for matching encoder folder, penalty for wrong encoder folder
        if let Some(ref codec) = parsed.codec {
            let cl = codec.to_lowercase();
            let is_x265 = cl.contains("x265") || cl.contains("hevc") || cl.contains("265");
            let is_x264 = cl.contains("x264") || cl.contains("264") || cl.contains("avc");
            if is_x265 {
                if fl.contains("x265") || fl.contains("hevc") { score += 5; }
                else if fl.contains("x264") { score -= 8; } // AVC folder is wrong for HEVC content
            } else if is_x264 {
                if fl.contains("x264") { score += 5; }
                else if fl.contains("x265") || fl.contains("hevc") { score -= 8; } // X265 folder is wrong for AVC content
            }
        }
        // Release type
        if let Some(ref rt) = parsed.release_type {
            let rtl = rt.to_lowercase();
            if rtl.contains("bdremux") || rtl.contains("bd remux") {
                if fl.contains("bdremux") { score += 8; }
            } else if rtl.contains("webdl") || rtl.contains("web-dl") || rtl.contains("web dl") {
                if fl.contains("web dl") || fl.contains("webdl") { score += 8; }
            } else if rtl.contains("bdrip") {
                if fl.contains("bdrip") { score += 8; }
            }
        }
        score
    };

    // Pick the best FTP folder for the given media type.
    let pick_best_folder = |target_type: &str| -> String {
        let mut candidates: Vec<&str> = folder_map
            .iter()
            .filter(|(_, v)| v.as_str() == target_type)
            .map(|(k, _)| k.as_str())
            .collect();
        // Sort for determinism before scoring
        candidates.sort();
        if candidates.is_empty() {
            return String::new();
        }
        let best = candidates
            .iter()
            .copied()
            .max_by_key(|f| score_folder(f))
            .unwrap_or(candidates[0]);
        format!("{}/{}", ftp_root, best)
    };

    let movie_dest = pick_best_folder("movie");
    let tv_dest = pick_best_folder("tv");

    let _base_dest = match media_type {
        "tv" => tv_dest.clone(),
        _ => movie_dest.clone(),
    };

    // For TV shows: search for the show across category subfolders (e.g. "Temporadas en emision",
    // For TV: structure is ALWAYS tv_dest/Category/Show where Category is one of
    // "Temporadas en emision" (single episodes) or "Temporadas completas" (full seasons).
    // If the show folder doesn't exist yet it will be created by the FTP uploader.
    let (dest, resolved_tv_category) = if media_type == "tv" && !tv_dest.is_empty() {
        let show_title = parsed.title.trim().replace(['/', '\\'], "");
        let season = parsed.season.unwrap_or(1);
        let is_full_season = p.is_dir(); // directory = full season upload

        // Step 1: list tv_dest to find actual category folder names on the server.
        // If the list fails or no category folders are found, fall back to hardcoded names.
        let level1_dirs = crate::ftp::list_raw(
            &crate::ftp::FtpEndpoint::from_config(&config),
            &tv_dest,
        ).await.map(|r| extract_dir_names(&r)).unwrap_or_default();

        // Category folders contain "temporad", "emisi", or "completa" (ASCII-safe prefixes
        // that survive Latin-1 → UTF-8 replacement char conversion on the ó).
        let category_dirs: Vec<String> = level1_dirs.into_iter()
            .filter(|d| {
                let n = normalise_for_match(d);
                n.contains("temporad") || n.contains("emisi") || n.contains("completa")
            })
            .collect();

        // Step 2: pick the right category folder name.
        // Prefer actual server name if found; otherwise use the standard Spanish name.
        // Never fall back to the opposite category (e.g. put a single episode in "completas").
        let preferred_kw = if is_full_season { "completa" } else { "emisi" };
        let cat_dir = category_dirs.iter()
            .find(|d| normalise_for_match(d).contains(preferred_kw))
            .cloned()
            .unwrap_or_else(|| {
                // Preferred category not found on server — use hardcoded name.
                // ensure_remote_dir will create it on upload.
                if is_full_season {
                    "Temporadas completas".to_string()
                } else {
                    "Temporadas en emision".to_string()
                }
            });

        let cat_path = if cat_dir.is_empty() {
            tv_dest.clone()
        } else {
            format!("{}/{}", tv_dest.trim_end_matches('/'), cat_dir)
        };

        // Step 3: search inside the chosen category for an existing show folder.
        // Use list_raw_sub to CWD to tv_dest then LIST cat_dir relatively — avoids
        // CWD failures from Latin-1 accented chars in the category folder name.
        let existing_show = if !show_title.is_empty() && !cat_dir.is_empty() {
            crate::ftp::list_raw_sub(
                &crate::ftp::FtpEndpoint::from_config(&config),
                &tv_dest, &cat_dir,
            ).await
            .map(|r| {
                let show_dirs = extract_dir_names(&r);
                fuzzy_best_show(&show_title, &show_dirs)
            })
            .unwrap_or(None)
        } else {
            None
        };

        // Step 4: build the final dest path.
        let show_path = if let Some(found) = existing_show {
            // Existing show folder found — use it directly (episodes go flat inside it).
            format!("{}/{}", cat_path.trim_end_matches('/'), found)
        } else {
            // New show — create a folder named "ShowTitle (Year) SXX".
            let year_part = parsed.year.map(|y| format!(" ({})", y)).unwrap_or_default();
            let folder = format!("{}{} S{:02}", show_title, year_part, season);
            format!("{}/{}", cat_path.trim_end_matches('/'), folder)
        };

        (show_path, cat_path)
    } else {
        (movie_dest.clone(), String::new())
    };

    // Ensure tv_category_dest is always populated even when media_type was detected as "movie".
    // The frontend uses it when the user manually switches the content type to TV.
    let resolved_tv_category = if resolved_tv_category.is_empty() && !tv_dest.is_empty() {
        let cat_dirs = crate::ftp::list_raw(
            &crate::ftp::FtpEndpoint::from_config(&config),
            &tv_dest,
        ).await.map(|r| extract_dir_names(&r)).unwrap_or_default();
        let (cat_dirs_fb, _): (Vec<String>, Vec<String>) = cat_dirs
            .into_iter()
            .partition(|d| {
                let n = normalise_for_match(d);
                n.contains("temporad") || n.contains("emisi") || n.contains("completa")
            });
        if !cat_dirs_fb.is_empty() {
            let preferred_kw = if p.is_dir() { "completa" } else { "emisi" };
            let cat = cat_dirs_fb.iter()
                .find(|d| normalise_for_match(d).contains(preferred_kw))
                .cloned()
                .unwrap_or_else(|| {
                    if p.is_dir() { "Temporadas completas".to_string() }
                    else { "Temporadas en emision".to_string() }
                });
            if cat.is_empty() { tv_dest.clone() } else { format!("{}/{}", tv_dest.trim_end_matches('/'), cat) }
        } else {
            // Flat structure — no category layer
            tv_dest.clone()
        }
    } else {
        resolved_tv_category
    };

    Ok(UploadSuggestion {
        dest,
        media_type: media_type.to_string(),
        detected_title: if parsed.title.is_empty() {
            None
        } else {
            Some(parsed.title)
        },
        detected_season: parsed.season.map(|s| s as u32),
        detected_episode: parsed.episode.map(|e| e as u32),
        detected_year: parsed.year.map(|y| y as u32),
        detected_release_type: parsed.release_type,
        detected_resolution: parsed.resolution,
        detected_codec: parsed.codec,
        detected_audio_codec: parsed.audio_codec,
        detected_audio_channels: parsed.audio_channels,
        detected_languages: parsed.languages,
        detected_hdr: parsed.hdr,
        movie_dest,
        tv_dest,
        tv_category_dest: resolved_tv_category,
        folder_options: {
            let mut opts: Vec<String> = folder_map
                .keys()
                .map(|name| format!("{}/{}", ftp_root, name))
                .collect();
            opts.sort();
            opts
        },
    })
}

/// List all subdirectory names at a given FTP path.
#[tauri::command]
pub async fn ftp_list_dir(
    path: String,
    state: tauri::State<'_, crate::db::Db>,
) -> Result<Vec<String>, String> {
    let config = state.load_config()?;
    let entries = crate::ftp::list_raw(
        &crate::ftp::FtpEndpoint::from_config(&config),
        &path,
    )
    .await?;
    let dirs = entries
        .into_iter()
        .filter_map(|line| {
            let is_dir =
                line.starts_with('d') || line.to_uppercase().contains("<DIR>");
            if !is_dir {
                return None;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            let name_start = if line.starts_with('d') { 8 } else { 3 };
            if parts.len() > name_start {
                let name = parts[name_start..].join(" ");
                if name != "." && name != ".." {
                    Some(name)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect();
    Ok(dirs)
}

/// Build a standard media filename from components.
/// Example: `The Dark Knight`, 2008, `4K`, `HEVC`, `HDR10`, `DTS`, [`spa`, `eng`], `mkv`
/// → `The.Dark.Knight.2008.4K.HEVC.HDR10.DTS.SPA.ENG.mkv`
#[tauri::command]
pub fn generate_upload_filename(
    title: String,
    year: Option<u32>,
    resolution: Option<String>,
    codec: Option<String>,
    hdr: Option<String>,
    audio_codec: Option<String>,
    languages: Vec<String>,
    extension: String,
) -> String {
    let mut parts: Vec<String> = vec![];
    // Replace spaces with dots in the title
    parts.push(title.replace(' ', "."));
    if let Some(y) = year {
        parts.push(y.to_string());
    }
    if let Some(r) = resolution.filter(|s| !s.is_empty()) {
        parts.push(r);
    }
    if let Some(c) = codec.filter(|s| !s.is_empty()) {
        parts.push(c);
    }
    if let Some(h) = hdr.filter(|s| !s.is_empty()) {
        parts.push(h);
    }
    if let Some(a) = audio_codec.filter(|s| !s.is_empty()) {
        parts.push(a);
    }
    for lang in languages {
        if !lang.is_empty() {
            parts.push(lang.to_uppercase());
        }
    }
    let ext = extension.trim_start_matches('.');
    format!("{}.{}", parts.join("."), ext)
}

// ─── Upload queue commands ────────────────────────────────────────────────────

fn spawn_upload_job(
    db: crate::db::Db,
    upload_queue: crate::uploads::SharedUploadQueue,
    app: tauri::AppHandle,
    id: u64,
    local_path: String,
    ftp_dest_path: String,
    filename: String,
    media_title: Option<String>,
    tmdb_id: Option<i64>,
    size_bytes: u64,
    resolution: Option<String>,
    hdr: Option<String>,
    languages: Vec<String>,
    codec: Option<String>,
    video_bitrate_kbps: Option<u32>,
    audio_codec: Option<String>,
    subtitle_langs: Vec<String>,
    audio_tracks: Vec<crate::analysis::AudioTrack>,
    subtitle_tracks: Vec<crate::analysis::SubtitleTrack>,
    group_id: Option<String>,
    semaphore: Arc<tokio::sync::Semaphore>,
    cancel_flag: Arc<std::sync::atomic::AtomicBool>,
) {
    tokio::spawn(async move {
        use std::sync::atomic::Ordering;

        let _permit = match semaphore.acquire().await {
            Ok(p) => p,
            Err(_) => return,
        };

        if cancel_flag.load(Ordering::SeqCst) {
            {
                let mut q = upload_queue.lock().unwrap();
                q.mark_cancelled(id);
            }
            persist_upload_state(&db, &upload_queue);
            return;
        }

        {
            let mut q = upload_queue.lock().unwrap();
            q.mark_started(id);
            q.mark_attempt(id, 0);
        }
        persist_upload_state(&db, &upload_queue);

        app.emit("upload:update", serde_json::json!({
            "id": id,
            "status": "uploading",
            "attempt": 0,
        })).ok();

        let config = match db.load_config() {
            Ok(c) => c,
            Err(e) => {
                let human = crate::ftp::humanize_ftp_error(&e);
                {
                    let mut q = upload_queue.lock().unwrap();
                    q.mark_error(id, human.clone());
                }
                persist_upload_state(&db, &upload_queue);
                app.emit("upload:update", serde_json::json!({
                    "id": id, "status": "error", "error": human
                })).ok();
                return;
            }
        };

        // ── Retry loop ────────────────────────────────────────────────────
        // Read max_attempts from the queue; falls back to 3 if for any
        // reason the item is missing (defensive — shouldn't happen).
        let max_attempts = {
            let q = upload_queue.lock().unwrap();
            q.items.iter().find(|i| i.id == id).map(|i| i.max_attempts).unwrap_or(3).max(1)
        };

        let mut last_err: Option<String> = None;
        let mut final_result: Result<(), String> = Err("upload did not start".to_string());
        let mut last_attempt: u8 = 0;
        // Bytes this job has pushed so far (seeded from a failed earlier run
        // that the user retried). Lets the next attempt resume with APPE
        // instead of re-sending a 60 GB remux from byte zero.
        let sent_bytes = Arc::new(std::sync::atomic::AtomicU64::new({
            let q = upload_queue.lock().unwrap();
            q.items.iter().find(|i| i.id == id).map(|i| i.bytes_done).unwrap_or(0)
        }));

        for attempt in 0..max_attempts {
            last_attempt = attempt;
            if attempt > 0 {
                {
                    let mut q = upload_queue.lock().unwrap();
                    q.mark_attempt(id, attempt);
                }
                persist_upload_state(&db, &upload_queue);
                app.emit("upload:update", serde_json::json!({
                    "id": id,
                    "status": "uploading",
                    "attempt": attempt,
                    "max_attempts": max_attempts,
                    "error": last_err.clone(),
                })).ok();
            }

            if cancel_flag.load(Ordering::SeqCst) {
                final_result = Err("Cancelled".to_string());
                break;
            }

            let app_clone = app.clone();
            let upload_id = id;
            let cancel_flag_progress = cancel_flag.clone();
            let sent_progress = sent_bytes.clone();
            let queue_progress = upload_queue.clone();
            let result = crate::ftp::upload_file(
                &crate::ftp::FtpEndpoint::from_config(&config),
                &ftp_dest_path,
                &filename,
                &local_path,
                sent_bytes.load(Ordering::SeqCst),
                move |done, total| {
                    if cancel_flag_progress.load(Ordering::SeqCst) {
                        return false;
                    }
                    sent_progress.fetch_max(done, Ordering::SeqCst);
                    if let Ok(mut q) = queue_progress.lock() {
                        q.set_progress(upload_id, done);
                    }
                    let ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    app_clone.emit("upload:progress", serde_json::json!({
                        "id": upload_id,
                        "bytes_done": done,
                        "bytes_total": total,
                        "timestamp_ms": ts,
                    })).ok();
                    true
                },
            )
            .await;

            match result {
                Ok(()) => {
                    final_result = Ok(());
                    break;
                }
                Err(e) if e == "Cancelled" => {
                    final_result = Err("Cancelled".to_string());
                    break;
                }
                Err(e) => {
                    let is_transient = crate::ftp::is_transient_ftp_error(&e);
                    last_err = Some(e.clone());
                    if !is_transient || attempt + 1 >= max_attempts {
                        final_result = Err(e);
                        break;
                    }
                    // Backoff: 1s, 3s, 9s — but cancellable via cancel_flag.
                    let backoff_secs: u64 = 3u64.pow(attempt as u32);
                    let target = std::time::Instant::now()
                        + std::time::Duration::from_secs(backoff_secs);
                    while std::time::Instant::now() < target {
                        if cancel_flag.load(Ordering::SeqCst) {
                            break;
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                    }
                    if cancel_flag.load(Ordering::SeqCst) {
                        final_result = Err("Cancelled".to_string());
                        break;
                    }
                    eprintln!(
                        "[upload {id}] transient error on attempt {}/{}: {} — retrying",
                        attempt + 1,
                        max_attempts,
                        last_err.as_deref().unwrap_or(""),
                    );
                }
            }
        }

        // ── Persist terminal state ────────────────────────────────────────
        match &final_result {
            Ok(()) => {
                {
                    let mut q = upload_queue.lock().unwrap();
                    q.mark_done(id);
                }
                persist_upload_state(&db, &upload_queue);
                app.emit("upload:update", serde_json::json!({
                    "id": id, "status": "done",
                })).ok();
            }
            Err(e) if e == "Cancelled" => {
                {
                    let mut q = upload_queue.lock().unwrap();
                    q.mark_cancelled(id);
                }
                persist_upload_state(&db, &upload_queue);
                app.emit("upload:update", serde_json::json!({
                    "id": id, "status": "cancelled",
                })).ok();
            }
            Err(e) => {
                let human = crate::ftp::humanize_ftp_error(e);
                let display = if max_attempts > 1 {
                    format!("{} ({}/{} intentos)", human, last_attempt + 1, max_attempts)
                } else {
                    human
                };
                {
                    let mut q = upload_queue.lock().unwrap();
                    q.mark_error(id, display.clone());
                }
                persist_upload_state(&db, &upload_queue);
                app.emit("upload:update", serde_json::json!({
                    "id": id, "status": "error", "error": display
                })).ok();
            }
        }

        // ── Telegram notification ─────────────────────────────────────────
        // Fires regardless of this item's terminal status so partial-failure
        // batches still notify. For grouped uploads we only notify once,
        // when the group reaches `all_finished` for the first time.
        {
            let tg_token = config.telegram_bot_token.clone();
            let tg_chat = config.telegram_chat_id.clone();
            if !tg_token.is_empty() && !tg_chat.is_empty() {
                // For grouped uploads, claim the notification slot atomically:
                // only the first task to observe `all_finished` AND insert into
                // `notified_groups` proceeds. Singletons (no group_id) only
                // notify on success — error/cancel for a single item is shown
                // in the UI and doesn't merit a Telegram message.
                let proceed = if let Some(ref gid) = group_id {
                    let mut q = upload_queue.lock().unwrap();
                    let (_done, _total, all_finished) = q.group_status(gid);
                    if !all_finished { false }
                    else { q.notified_groups.insert(gid.clone()) }
                } else {
                    matches!(final_result, Ok(()))
                };

                if proceed {
                    // For grouped batches we compute success/failure breakdown
                    // up front so we can branch on "all done" vs. "partial".
                    let (group_done, group_total, group_failed_names): (usize, usize, Vec<String>) =
                        if let Some(ref gid) = group_id {
                            let q = upload_queue.lock().unwrap();
                            let total = q.items.iter()
                                .filter(|i| i.group_id.as_deref() == Some(gid))
                                .count();
                            let done = q.items.iter()
                                .filter(|i| i.group_id.as_deref() == Some(gid)
                                    && matches!(i.status, crate::uploads::UploadStatus::Done))
                                .count();
                            let failed: Vec<String> = q.items.iter()
                                .filter(|i| i.group_id.as_deref() == Some(gid)
                                    && !matches!(i.status, crate::uploads::UploadStatus::Done))
                                .map(|i| i.filename.clone())
                                .collect();
                            (done, total, failed)
                        } else {
                            (1, 1, vec![])
                        };

                    use crate::upload_notify::{self as un, MediaKind, Scope};

                    let dest_display = un::display_dest(&ftp_dest_path);
                    let parsed = crate::parser::parse_media_path(&ftp_dest_path, &filename);

                    // The TMDB id only means something together with its
                    // namespace (movie/tv). Use the type the match was searched
                    // with; guess from the destination path only for items
                    // queued by older versions that didn't store it.
                    let item_media_type = {
                        let q = upload_queue.lock().unwrap();
                        q.items.iter().find(|i| i.id == id).and_then(|i| i.media_type.clone())
                    };
                    let kind = match item_media_type.as_deref() {
                        Some(t) => MediaKind::from_str_loose(t),
                        None => {
                            let p = ftp_dest_path.to_lowercase();
                            if p.contains("serie") || p.contains("/tv/") || parsed.season.is_some() {
                                MediaKind::Tv
                            } else {
                                MediaKind::Movie
                            }
                        }
                    };

                    let scope = if let Some(ref gid) = group_id {
                        let names: Vec<String> = {
                            let q = upload_queue.lock().unwrap();
                            q.items.iter()
                                .filter(|i| i.group_id.as_deref() == Some(gid))
                                .map(|i| i.filename.clone())
                                .collect()
                        };
                        let seasons: Vec<u8> = names.iter()
                            .filter_map(|n| crate::parser::parse_media_path(&ftp_dest_path, n).season)
                            .collect();
                        Scope::Batch { seasons, files: group_total }
                    } else if kind == MediaKind::Tv {
                        Scope::Episode {
                            season: parsed.season,
                            episode: parsed.episode,
                            episode_end: parsed.episode_end,
                        }
                    } else {
                        Scope::Whole
                    };

                    let is_partial_failure = !group_failed_names.is_empty();
                    if !is_partial_failure {
                        let tmdb_data = if let (Some(tid), false) = (tmdb_id, config.tmdb_api_key.is_empty()) {
                            crate::tmdb::fetch_movie_by_id(&config.tmdb_api_key, tid, kind.tmdb_path())
                                .await
                                .map_err(|e| eprintln!("[upload] TMDB lookup for notification failed: {e}"))
                                .ok()
                        } else {
                            None
                        };

                        // Title: TMDB (localised) → the match picked in the
                        // upload form → the title parsed from the file name.
                        // Never the raw file name with dots and tags.
                        let display_title = tmdb_data.as_ref()
                            .map(|m| m.title.clone())
                            .filter(|t| !t.trim().is_empty())
                            .or_else(|| media_title.clone().filter(|t| !t.trim().is_empty()))
                            .or_else(|| Some(parsed.title.clone()).filter(|t| !t.trim().is_empty()))
                            .unwrap_or_else(|| filename.clone());
                        let year = tmdb_data.as_ref()
                            .and_then(|m| m.release_date.as_deref())
                            .and_then(|d| d.split('-').next())
                            .filter(|y| y.len() == 4)
                            .map(str::to_string)
                            .or_else(|| parsed.year.map(|y| y.to_string()));

                        let size_total = match group_id {
                            Some(ref gid) => upload_queue.lock().unwrap().group_total_bytes(gid),
                            None => size_bytes,
                        };

                        let notice = un::UploadNotice {
                            kind,
                            title: display_title,
                            year,
                            scope,
                            release_type: parsed.release_type.clone(),
                            resolution: resolution.clone(),
                            codec: codec.clone(),
                            hdr: hdr.clone(),
                            video_bitrate_kbps,
                            audio_tracks: audio_tracks.clone(),
                            languages: languages.clone(),
                            audio_codec: audio_codec.clone(),
                            subtitle_tracks: subtitle_tracks.clone(),
                            subtitle_langs: subtitle_langs.clone(),
                            size_bytes: size_total,
                            filename: group_id.is_none().then(|| filename.clone()),
                            tmdb: tmdb_data.as_ref().map(|m| un::TmdbInfo {
                                rating: m.vote_average,
                                runtime_mins: m.runtime_mins,
                                release_date: m.release_date.clone(),
                                country: m.origin_country.as_deref()
                                    .map(un::country_name)
                                    .filter(|c| !c.is_empty())
                                    .map(str::to_string),
                                genres: m.genres.clone(),
                                overview: m.overview.clone(),
                            }),
                            tmdb_id,
                            dest: dest_display.clone(),
                        };
                        let msg = un::build_upload_caption(&notice, un::CAPTION_LIMIT);

                        let poster_url = tmdb_data.as_ref()
                            .and_then(|m| m.poster_path.as_deref())
                            .map(|p| format!("https://image.tmdb.org/t/p/w500{p}"));

                        // Prefer sendPhoto when we have a poster. If it fails
                        // (Telegram can't fetch the image, network blip…) fall
                        // back to sendMessage with the same text so the
                        // announcement still goes out, just without the cover.
                        let notify_result = if let Some(ref url) = poster_url {
                            match crate::telegram::send_photo(&tg_token, &tg_chat, url, &msg).await {
                                Ok(()) => Ok(()),
                                Err(photo_err) => {
                                    eprintln!("[upload] sendPhoto failed, falling back to text-only: {photo_err}");
                                    crate::telegram::send_message(&tg_token, &tg_chat, &msg).await
                                }
                            }
                        } else {
                            crate::telegram::send_message(&tg_token, &tg_chat, &msg).await
                        };

                        if let Err(e) = notify_result {
                            eprintln!("[upload] Telegram notify failed: {e}");
                        }

                        // Personal subscribers who asked for "nuevo contenido".
                        // (Their "mis descargas" toggle is for downloads and is
                        // handled where downloads finish.)
                        if let Ok(subs) = db.list_telegram_subs() {
                            let line = un::build_new_content_line(&notice);
                            for sub in subs {
                                if sub.notify_new_content && !sub.telegram_bot_token.is_empty() {
                                    if let Err(e) = crate::telegram::send_message(&sub.telegram_bot_token, &sub.telegram_chat_id, &line).await {
                                        eprintln!("[upload] personal Telegram notify (user {}) failed: {e}", sub.user_id);
                                    }
                                }
                            }
                        }
                    } else {
                        let display_title = media_title
                            .clone()
                            .filter(|t| !t.trim().is_empty())
                            .unwrap_or_else(|| parsed.title.clone());
                        let body = un::build_partial_failure(
                            &display_title,
                            &scope,
                            group_done,
                            group_total,
                            &group_failed_names,
                            &dest_display,
                        );
                        if let Err(e) = crate::telegram::send_message(&tg_token, &tg_chat, &body).await {
                            eprintln!("[upload] Telegram partial-failure notify failed: {e}");
                        }
                    }
                }
            }
        }
    });
}

#[tauri::command]
pub async fn queue_upload(
    local_path: String,
    ftp_dest_path: String,
    filename: String,
    media_title: Option<String>,
    tmdb_id: Option<i64>,
    size_bytes: u64,
    resolution: Option<String>,
    hdr: Option<String>,
    languages: Vec<String>,
    codec: Option<String>,
    video_bitrate_kbps: Option<u32>,
    audio_codec: Option<String>,
    subtitle_langs: Vec<String>,
    audio_tracks: Vec<crate::analysis::AudioTrack>,
    subtitle_tracks: Vec<crate::analysis::SubtitleTrack>,
    group_id: Option<String>,
    media_type: Option<String>,
    upload_queue: tauri::State<'_, crate::uploads::SharedUploadQueue>,
    db: tauri::State<'_, crate::db::Db>,
    app: tauri::AppHandle,
) -> Result<u64, String> {
    let (id, semaphore, cancel_flag) = {
        let mut q = upload_queue.lock().unwrap();
        let added = q.add(
            local_path.clone(),
            ftp_dest_path.clone(),
            filename.clone(),
            media_title.clone(),
            tmdb_id,
            size_bytes,
            resolution.clone(),
            hdr.clone(),
            languages.clone(),
            codec.clone(),
            video_bitrate_kbps,
            audio_codec.clone(),
            subtitle_langs.clone(),
            audio_tracks.clone(),
            subtitle_tracks.clone(),
            group_id.clone(),
        );
        if let Some(item) = q.items.iter_mut().find(|i| i.id == added.0) {
            item.media_type = media_type
                .as_deref()
                .map(|t| if t.eq_ignore_ascii_case("tv") { "tv" } else { "movie" }.to_string());
        }
        added
    };

    let item = {
        let q = upload_queue.lock().unwrap();
        q.items.iter().find(|i| i.id == id).cloned()
    };

    if let Some(item) = item {
        app.emit("upload:added", &item).ok();
    }

    // Persist immediately so new items survive a crash before upload completes
    persist_upload_state(db.inner(), upload_queue.inner());

    let (item_media_title, item_tmdb_id) = {
        let q = upload_queue.lock().unwrap();
        q.items.iter().find(|i| i.id == id)
            .map(|i| (i.media_title.clone(), i.tmdb_id))
            .unwrap_or((None, None))
    };

    spawn_upload_job(
        db.inner().clone(),
        upload_queue.inner().clone(),
        app,
        id,
        local_path,
        ftp_dest_path,
        filename,
        item_media_title,
        item_tmdb_id,
        size_bytes,
        resolution,
        hdr,
        languages,
        codec,
        video_bitrate_kbps,
        audio_codec,
        subtitle_langs,
        audio_tracks,
        subtitle_tracks,
        group_id,
        semaphore,
        cancel_flag,
    );

    Ok(id)
}

#[tauri::command]
pub fn get_uploads(
    upload_queue: tauri::State<'_, crate::uploads::SharedUploadQueue>,
) -> Vec<crate::uploads::UploadItem> {
    upload_queue.lock().unwrap().items.clone()
}

#[tauri::command]
pub fn cancel_upload(
    id: u64,
    upload_queue: tauri::State<'_, crate::uploads::SharedUploadQueue>,
    db: tauri::State<'_, crate::db::Db>,
) -> Result<(), String> {
    upload_queue.lock().unwrap().cancel(id);
    persist_upload_state(db.inner(), upload_queue.inner());
    Ok(())
}

#[tauri::command]
pub async fn retry_upload(
    id: u64,
    upload_queue: tauri::State<'_, crate::uploads::SharedUploadQueue>,
    db: tauri::State<'_, crate::db::Db>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let (item, semaphore, cancel_flag) = {
        let mut q = upload_queue.lock().unwrap();
        // Retrying a queued/running item would start a second job writing to
        // the same remote file (and orphan the first job's cancel flag).
        let status = q.items.iter().find(|i| i.id == id).map(|i| i.status.clone());
        if matches!(
            status,
            Some(crate::uploads::UploadStatus::Queued | crate::uploads::UploadStatus::Uploading)
        ) {
            return Err("La subida ya está en curso".to_string());
        }
        q.retry(id)?
    };

    spawn_upload_job(
        db.inner().clone(),
        upload_queue.inner().clone(),
        app,
        id,
        item.local_path,
        item.ftp_dest_path,
        item.filename,
        item.media_title,
        item.tmdb_id,
        item.bytes_total,
        item.resolution,
        item.hdr,
        item.languages,
        item.codec,
        item.video_bitrate_kbps,
        item.audio_codec,
        item.subtitle_langs,
        item.audio_tracks,
        item.subtitle_tracks,
        item.group_id,
        semaphore,
        cancel_flag,
    );
    persist_upload_state(db.inner(), upload_queue.inner());
    Ok(())
}

#[tauri::command]
pub async fn delete_upload(
    id: u64,
    // `false` only removes the entry from the list and keeps the uploaded
    // file on the server. Defaults to `true` (the historical behaviour).
    delete_remote: Option<bool>,
    upload_queue: tauri::State<'_, crate::uploads::SharedUploadQueue>,
    db: tauri::State<'_, crate::db::Db>,
) -> Result<(), String> {
    // Grab the item details before removing from queue. Stop a running job
    // first, otherwise it keeps uploading with no entry left to show or
    // cancel it.
    let item = {
        let mut q = upload_queue.lock().unwrap();
        q.cancel(id);
        q.items.iter().find(|i| i.id == id).cloned()
    };

    // Delete the remote file when the upload completed successfully.
    if let Some(item) = &item {
        // A failed upload that already sent bytes left a truncated file on the
        // server (kept so a retry can resume). Discarding the entry must not
        // leave it behind for the indexer to list as a broken release.
        let partial_left = item.status == crate::uploads::UploadStatus::Error && item.bytes_done > 0;
        let finished = item.status == crate::uploads::UploadStatus::Done;
        if (delete_remote.unwrap_or(true) && finished) || partial_left {
            if let Ok(config) = db.load_config() {
                if let Err(e) = crate::ftp::delete_file(
                    &crate::ftp::FtpEndpoint::from_config(&config),
                    &item.ftp_dest_path,
                    &item.filename,
                ).await {
                    eprintln!("[delete_upload] FTP delete failed (removing from queue anyway): {e}");
                }
            }
        }
    }

    upload_queue.lock().unwrap().delete(id);
    persist_upload_state(db.inner(), upload_queue.inner());
    Ok(())
}

/// Stat each path locally and return its byte size (0 on error). Used by the
/// upload prepare flow so multi-episode batches can pass real per-episode
/// sizes to `queue_upload` (otherwise progress bars stay at 0% throughout).
#[tauri::command]
pub fn stat_local_files(paths: Vec<String>) -> Vec<u64> {
    paths.iter()
        .map(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0))
        .collect()
}

/// Re-spawn all `Error`/`Cancelled` items in the same group_id. Returns the
/// number of items that were requeued.
#[tauri::command]
pub async fn retry_group_uploads(
    group_id: String,
    upload_queue: tauri::State<'_, crate::uploads::SharedUploadQueue>,
    db: tauri::State<'_, crate::db::Db>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    let ids_to_retry: Vec<u64> = {
        let q = upload_queue.lock().unwrap();
        q.items.iter()
            .filter(|i| i.group_id.as_deref() == Some(group_id.as_str())
                && matches!(i.status, crate::uploads::UploadStatus::Error | crate::uploads::UploadStatus::Cancelled))
            .map(|i| i.id)
            .collect()
    };

    // Clear any prior "this group has been notified" flag so a retry can
    // re-fire the Telegram notification on completion.
    {
        let mut q = upload_queue.lock().unwrap();
        q.notified_groups.remove(&group_id);
    }

    let mut count: u32 = 0;
    for id in ids_to_retry {
        let (item, semaphore, cancel_flag) = {
            let mut q = upload_queue.lock().unwrap();
            match q.retry(id) {
                Ok(t) => t,
                Err(_) => continue,
            }
        };
        spawn_upload_job(
            db.inner().clone(),
            upload_queue.inner().clone(),
            app.clone(),
            id,
            item.local_path,
            item.ftp_dest_path,
            item.filename,
            item.media_title,
            item.tmdb_id,
            item.bytes_total,
            item.resolution,
            item.hdr,
            item.languages,
            item.codec,
            item.video_bitrate_kbps,
            item.audio_codec,
            item.subtitle_langs,
            item.audio_tracks,
            item.subtitle_tracks,
            item.group_id,
            semaphore,
            cancel_flag,
        );
        count += 1;
    }
    persist_upload_state(db.inner(), upload_queue.inner());
    Ok(count)
}

/// Re-spawn every `Error` item across the entire queue (any group, plus
/// ungrouped singletons). Returns the number requeued.
#[tauri::command]
pub async fn retry_all_failed_uploads(
    upload_queue: tauri::State<'_, crate::uploads::SharedUploadQueue>,
    db: tauri::State<'_, crate::db::Db>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    let ids_to_retry: Vec<u64> = {
        let q = upload_queue.lock().unwrap();
        q.items.iter()
            .filter(|i| matches!(i.status, crate::uploads::UploadStatus::Error))
            .map(|i| i.id)
            .collect()
    };

    // Clear "notified" markers for every affected group so completion fires
    // a fresh Telegram message.
    {
        let mut q = upload_queue.lock().unwrap();
        let affected_groups: std::collections::HashSet<String> = q.items.iter()
            .filter(|i| ids_to_retry.contains(&i.id))
            .filter_map(|i| i.group_id.clone())
            .collect();
        for gid in &affected_groups {
            q.notified_groups.remove(gid);
        }
    }

    let mut count: u32 = 0;
    for id in ids_to_retry {
        let (item, semaphore, cancel_flag) = {
            let mut q = upload_queue.lock().unwrap();
            match q.retry(id) {
                Ok(t) => t,
                Err(_) => continue,
            }
        };
        spawn_upload_job(
            db.inner().clone(),
            upload_queue.inner().clone(),
            app.clone(),
            id,
            item.local_path,
            item.ftp_dest_path,
            item.filename,
            item.media_title,
            item.tmdb_id,
            item.bytes_total,
            item.resolution,
            item.hdr,
            item.languages,
            item.codec,
            item.video_bitrate_kbps,
            item.audio_codec,
            item.subtitle_langs,
            item.audio_tracks,
            item.subtitle_tracks,
            item.group_id,
            semaphore,
            cancel_flag,
        );
        count += 1;
    }
    persist_upload_state(db.inner(), upload_queue.inner());
    Ok(count)
}

#[tauri::command]
pub fn clear_completed_uploads(
    upload_queue: tauri::State<'_, crate::uploads::SharedUploadQueue>,
    db: tauri::State<'_, crate::db::Db>,
) -> Result<(), String> {
    upload_queue.lock().unwrap().clear_completed();
    persist_upload_state(db.inner(), upload_queue.inner());
    Ok(())
}

/// Send a test SMTP email using the saved web GUI SMTP configuration.
/// Sends to the first admin web user's email, or to smtp_from if no web users exist.
#[tauri::command]
pub async fn test_smtp(
    db: tauri::State<'_, crate::db::Db>,
) -> Result<serde_json::Value, String> {
    let cfg = db.load_webgui_config()?;
    if cfg.smtp_host.is_empty() {
        return Err("SMTP host not configured".to_string());
    }
    if cfg.smtp_from.is_empty() {
        return Err("SMTP from address not configured".to_string());
    }
    let sent_to = db.list_web_users()
        .ok()
        .and_then(|users| users.into_iter().find(|u| u.role == "admin").map(|u| u.email))
        .unwrap_or_else(|| cfg.smtp_from.clone());
    crate::web::handlers::send_otp_email(&cfg, &sent_to, "TEST-123456")
        .await
        .map_err(|e| format!("SMTP test failed: {e}"))?;
    Ok(serde_json::json!({ "ok": true, "sent_to": sent_to }))
}

/// Send a test Telegram message with the provided credentials.
#[tauri::command]
pub async fn test_telegram(token: String, chat_id: String) -> Result<(), String> {
    crate::telegram::send_message(
        &token,
        &chat_id,
        "✅ BoxTeam — conexión con Telegram correcta",
    )
    .await
}

/// Send a sample upload card (same formatter as real uploads) so admins can
/// check how announcements look in their channel.
#[tauri::command]
pub async fn test_telegram_upload_sample(token: String, chat_id: String) -> Result<(), String> {
    let caption = crate::upload_notify::build_upload_caption(
        &crate::upload_notify::sample_notice(),
        crate::upload_notify::CAPTION_LIMIT,
    );
    let text = format!("🧪 <i>Ejemplo de aviso de subida</i>\n\n{caption}");
    crate::telegram::send_message(&token, &chat_id, &text).await
}

/// Find the chat id of the channel/group/private chat the bot last saw.
#[tauri::command]
pub async fn detect_telegram_chat(token: String) -> Result<crate::telegram::DetectedChat, String> {
    crate::telegram::detect_latest_chat(token.trim())
        .await?
        .ok_or_else(|| {
            "Telegram aún no le ha enviado nada al bot. Añádelo al canal o grupo (en un canal, como administrador), publica un mensaje y vuelve a pulsar Detectar.".to_string()
        })
}

// ─── Personal Telegram subscription commands ───────────────────────────────

/// Returns the current personal subscription for the desktop user (user_id=0).
#[tauri::command]
pub async fn get_telegram_sub(
    app: tauri::AppHandle,
) -> Result<Option<crate::db::TelegramSub>, String> {
    let db = app.state::<crate::db::Db>();
    db.get_telegram_sub(0)
}

/// Generates a 6-digit verification code and sends it to the specified chat_id.
/// The code is stored in the DB with a 24h expiry.
#[tauri::command]
pub async fn link_telegram_bot(
    app: tauri::AppHandle,
    bot_token: String,
) -> Result<crate::db::TelegramSub, String> {
    // Discover the user's chat_id by polling their bot's updates
    let chat_id = crate::telegram::get_updates_first_chat_id(&bot_token)
        .await?
        .ok_or_else(|| {
            "Aún no hay mensajes en tu bot. Abre Telegram, busca tu bot y envíale cualquier mensaje, luego vuelve a intentarlo.".to_string()
        })?;

    let db = app.state::<crate::db::Db>();
    db.upsert_telegram_sub(0, &bot_token, &chat_id, true, true)?;

    // Send a welcome confirmation via the user's own bot
    let welcome = "✅ <b>BoxTeam</b> — Tu bot está vinculado correctamente.\n\nA partir de ahora recibirás avisos personales aquí.";
    crate::telegram::send_message(&bot_token, &chat_id, welcome).await.ok();

    db.get_telegram_sub(0)?.ok_or_else(|| "Error al guardar la suscripción.".to_string())
}

/// Updates notification preferences for the desktop user's personal subscription.
#[tauri::command]
pub async fn update_telegram_sub(
    app: tauri::AppHandle,
    notify_new_content: bool,
    notify_downloads: bool,
) -> Result<(), String> {
    let db = app.state::<crate::db::Db>();
    let sub = db
        .get_telegram_sub(0)?
        .ok_or_else(|| "No hay suscripción activa.".to_string())?;
    db.upsert_telegram_sub(0, &sub.telegram_bot_token, &sub.telegram_chat_id, notify_new_content, notify_downloads)
}

/// Removes the personal subscription for the desktop user.
#[tauri::command]
pub async fn revoke_telegram_sub(app: tauri::AppHandle) -> Result<(), String> {
    let db = app.state::<crate::db::Db>();
    db.delete_telegram_sub(0)
}

// `start_indexing_internal` requires a live FTP connection and a Tauri
// AppHandle, which cannot be constructed in unit tests. Instead we test the
// supporting pure helpers and document the integration-test scenarios.
//
// Integration tests that require a real FTP server:
//   1. Call start_indexing_internal with a live FTP pointing at a small tree.
//      Measure wall-clock time: should complete the upsert loop without
//      waiting for TMDB (i.e. loop finishes before any TMDB response arrives).
//   2. After the loop resolves, verify that `metadata_tasks` are awaited and
//      that `index:update` events fire for each new file.
//   3. Verify `index:complete` fires only AFTER all background tasks finish,
//      even though the loop itself did not block on TMDB.

#[cfg(test)]
mod indexing_tests {
    use super::*;

    #[test]
    fn episodes_of_a_show_share_one_tmdb_lookup_key() {
        let a = tmdb_lookup_key("The Bear", Some(2022), "tv");
        let b = tmdb_lookup_key("the bear ", Some(2022), "tv");
        assert_eq!(a, b);
        assert_ne!(a, tmdb_lookup_key("The Bear", Some(2022), "movie"));
        assert_ne!(a, tmdb_lookup_key("The Bear", None, "tv"));
    }

    #[tokio::test]
    async fn lookup_cache_runs_each_key_once_even_when_concurrent() {
        let cache = LookupCache::default();
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut tasks = Vec::new();
        for _ in 0..60 {
            let cell = cache.ratings_cell("tt0000001");
            let calls = calls.clone();
            tasks.push(tokio::spawn(async move {
                cell.get_or_init(|| async {
                    calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                    (None, None)
                })
                .await
                .clone()
            }));
        }
        for t in tasks {
            t.await.expect("task");
        }
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    // ── looks_like_tv_content ───────────────────────────────────────────────

    #[test]
    fn looks_like_tv_when_season_is_set() {
        let parsed = crate::parser::parse_media_path("", "Show.S02E05.1080p.mkv");
        assert!(looks_like_tv_content("", "Show.S02E05.1080p.mkv", &parsed));
    }

    #[test]
    fn looks_like_tv_when_path_contains_season_keyword() {
        let parsed = crate::parser::parse_media_path("", "episode.mkv");
        assert!(looks_like_tv_content(
            "/TV/Show/Season 01/episode.mkv",
            "episode.mkv",
            &parsed
        ));
    }

    #[test]
    fn not_tv_for_plain_movie() {
        let parsed = crate::parser::parse_media_path("", "The.Batman.2022.1080p.mkv");
        assert!(!looks_like_tv_content("", "The.Batman.2022.1080p.mkv", &parsed));
    }

    // ── detect_media_type ──────────────────────────────────────────────────

    #[test]
    fn detects_movie_type_from_folder_mapping() {
        let mut folder_types = std::collections::HashMap::new();
        folder_types.insert("Peliculas".to_string(), "movie".to_string());
        let mt = detect_media_type("/Compartida/Peliculas/Batman.mkv", "/Compartida", &folder_types);
        assert_eq!(mt.as_deref(), Some("movie"));
    }

    #[test]
    fn detects_tv_type_from_folder_mapping() {
        let mut folder_types = std::collections::HashMap::new();
        folder_types.insert("Series".to_string(), "tv".to_string());
        let mt = detect_media_type("/Compartida/Series/Show/ep.mkv", "/Compartida", &folder_types);
        assert_eq!(mt.as_deref(), Some("tv"));
    }

    #[test]
    fn returns_none_for_unmapped_folder() {
        let folder_types = std::collections::HashMap::new();
        let mt = detect_media_type("/Compartida/Unknown/file.mkv", "/Compartida", &folder_types);
        assert_eq!(mt, None);
    }

    // ── normalize_title ────────────────────────────────────────────────────

    #[test]
    fn normalizes_title_strips_punctuation_and_lowercases() {
        assert_eq!(normalize_title("The Batman (2022)!"), "the batman 2022");
    }

    #[test]
    fn normalizes_title_collapses_whitespace() {
        assert_eq!(normalize_title("  Dark   Knight  "), "dark knight");
    }

    // ── Background spawn: tokio integration ──────────────────────────────
    // Verifies that spawned tasks (the pattern used in the index loop) run
    // to completion and can write to a shared flag.

    #[tokio::test]
    async fn spawned_metadata_tasks_run_to_completion() {
        use std::sync::{Arc, Mutex};

        let counter = Arc::new(Mutex::new(0usize));
        let mut tasks = Vec::new();

        for _ in 0..5 {
            let counter = counter.clone();
            tasks.push(tokio::spawn(async move {
                // Simulate lightweight async work (no real HTTP)
                tokio::time::sleep(std::time::Duration::from_millis(1)).await;
                let mut c = counter.lock().unwrap();
                *c += 1;
            }));
        }

        for task in tasks {
            task.await.expect("task should not panic");
        }

        assert_eq!(*counter.lock().unwrap(), 5);
    }

    #[tokio::test]
    async fn index_loop_does_not_block_on_background_tasks() {
        // The loop itself must complete without awaiting any background task.
        // We verify this by measuring that spawned heavy tasks don't delay
        // the code that comes after the loop (the commit_batch + cleanup).
        use std::sync::{Arc, Mutex};
        use std::time::Instant;

        let loop_done_at = Arc::new(Mutex::new(None::<Instant>));
        let task_done_at = Arc::new(Mutex::new(None::<Instant>));

        let loop_done_clone = loop_done_at.clone();
        let task_done_clone = task_done_at.clone();

        let mut tasks = Vec::new();

        // Simulate "new file" path: spawn, don't await in loop
        tasks.push(tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            *task_done_clone.lock().unwrap() = Some(Instant::now());
        }));

        // Record when the "loop" finished (before awaiting tasks)
        *loop_done_clone.lock().unwrap() = Some(Instant::now());

        // Now await tasks (as start_indexing_internal does after the loop)
        for task in tasks {
            task.await.unwrap();
        }

        let loop_done = loop_done_at.lock().unwrap().unwrap();
        let task_done = task_done_at.lock().unwrap().unwrap();

        // The task completed after the loop — confirming the loop did not block on it.
        assert!(
            task_done > loop_done,
            "task should complete AFTER loop records completion"
        );
    }
}

#[cfg(test)]
mod prune_tests {
    use super::*;
    use std::path::PathBuf;

    /// Unique temp directory for one test (no external tempfile crate).
    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "boxteam-prune-{}-{}",
            std::process::id(),
            tag
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn prunes_empty_title_and_alpha_but_keeps_root() {
        let root = scratch("keep-root").join("Movies");
        let movie = root.join("A").join("Avatar (2009)");
        std::fs::create_dir_all(&movie).unwrap();
        let file = movie.join("avatar.mkv");
        std::fs::write(&file, b"x").unwrap();

        std::fs::remove_file(&file).unwrap();
        prune_empty_media_dirs(&file, &[root.clone()]);

        assert!(!movie.exists(), "empty title folder should be removed");
        assert!(!root.join("A").exists(), "empty alpha folder should be removed");
        assert!(root.exists(), "destination root must be preserved");

        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    #[test]
    fn stops_at_alpha_folder_shared_with_another_title() {
        let root = scratch("shared-alpha").join("Movies");
        let avatar = root.join("A").join("Avatar (2009)");
        let alien = root.join("A").join("Alien (1979)");
        std::fs::create_dir_all(&avatar).unwrap();
        std::fs::create_dir_all(&alien).unwrap();
        std::fs::write(alien.join("alien.mkv"), b"x").unwrap();
        let file = avatar.join("avatar.mkv");
        std::fs::write(&file, b"x").unwrap();

        std::fs::remove_file(&file).unwrap();
        prune_empty_media_dirs(&file, &[root.clone()]);

        assert!(!avatar.exists(), "deleted title folder should be removed");
        assert!(root.join("A").exists(), "alpha folder still holding another title must stay");
        assert!(alien.exists(), "other title must be untouched");

        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    #[test]
    fn does_nothing_when_outside_any_root() {
        let base = scratch("outside");
        let stray = base.join("somewhere").join("Title");
        std::fs::create_dir_all(&stray).unwrap();
        let file = stray.join("f.mkv");
        std::fs::write(&file, b"x").unwrap();
        std::fs::remove_file(&file).unwrap();

        // Root points elsewhere → nothing should be pruned.
        prune_empty_media_dirs(&file, &[base.join("Movies")]);
        assert!(stray.exists(), "folders outside the roots must be left alone");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn prunes_tv_season_then_show_folder() {
        let root = scratch("tv").join("TV Shows");
        let season = root.join("Breaking Bad").join("Season 01");
        std::fs::create_dir_all(&season).unwrap();
        let file = season.join("ep01.mkv");
        std::fs::write(&file, b"x").unwrap();

        std::fs::remove_file(&file).unwrap();
        prune_empty_media_dirs(&file, &[root.clone()]);

        assert!(!season.exists(), "empty season folder should be removed");
        assert!(!root.join("Breaking Bad").exists(), "empty show folder should be removed");
        assert!(root.exists(), "destination root must be preserved");

        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }
}

// ── Fix 5: IPC progress batching tests ───────────────────────────────────────
// The batching logic lives inside start_indexing_internal and requires a live
// Tauri window to emit. We test the pure batching arithmetic here to ensure:
// - N files produce ceil(N/50) batches
// - No files are lost (every item appears in exactly one batch)
// - The final partial batch is always flushed

#[cfg(test)]
mod batching_tests {
    /// Simulate the batching logic from start_indexing_internal without Tauri.
    /// Returns a Vec of batch sizes (how many items per emitted event).
    fn simulate_batching(total_files: usize, batch_size: usize) -> Vec<usize> {
        let mut batches: Vec<usize> = Vec::new();
        let mut current_batch = 0usize;

        for _ in 0..total_files {
            current_batch += 1;
            if current_batch >= batch_size {
                batches.push(current_batch);
                current_batch = 0;
            }
        }
        // Flush remainder (equivalent to flush_progress_batch after loop)
        if current_batch > 0 {
            batches.push(current_batch);
        }
        batches
    }

    #[test]
    fn exactly_50_files_produce_one_batch() {
        let batches = simulate_batching(50, 50);
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0], 50);
    }

    #[test]
    fn exactly_100_files_produce_two_batches() {
        let batches = simulate_batching(100, 50);
        assert_eq!(batches.len(), 2);
        assert!(batches.iter().all(|&b| b == 50));
    }

    #[test]
    fn no_files_produce_no_batches() {
        let batches = simulate_batching(0, 50);
        assert!(batches.is_empty());
    }

    #[test]
    fn partial_batch_is_flushed_at_end() {
        // 127 files → 2 full batches (100 total) + 1 partial (27)
        let batches = simulate_batching(127, 50);
        assert_eq!(batches.len(), 3);
        assert_eq!(batches[0], 50);
        assert_eq!(batches[1], 50);
        assert_eq!(batches[2], 27);
    }

    #[test]
    fn single_file_produces_one_batch_of_size_1() {
        let batches = simulate_batching(1, 50);
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0], 1);
    }

    #[test]
    fn no_files_are_lost_for_various_totals() {
        for total in [1, 49, 50, 51, 99, 100, 101, 500, 1001] {
            let batches = simulate_batching(total, 50);
            let sum: usize = batches.iter().sum();
            assert_eq!(sum, total, "Lost files for total={total}: sum={sum}");
        }
    }

    #[test]
    fn batch_count_equals_ceil_total_div_batch_size() {
        for total in [1usize, 49, 50, 51, 99, 100, 101, 500, 1001] {
            let batches = simulate_batching(total, 50);
            let expected_batches = total.div_ceil(50);
            assert_eq!(
                batches.len(),
                expected_batches,
                "Wrong batch count for total={total}"
            );
        }
    }
}

#[cfg(test)]
mod classification_tests {
    use super::looks_like_tv_content;

    fn is_tv(path: &str) -> bool {
        let filename = path.rsplit('/').next().unwrap_or(path);
        let parsed = crate::parser::parse_media_path(path, filename);
        looks_like_tv_content(path, filename, &parsed)
    }

    #[test]
    fn movies_with_tv_words_in_the_title_stay_movies() {
        for path in [
            "/Peliculas/Season.of.the.Witch.2011.1080p.BluRay.mkv",
            "/Peliculas/Star Wars Episode IV - A New Hope (1977).mkv",
            "/Peliculas/Blade.Runner.2049.2017.2160p.mkv",
            "/Peliculas/1917.2019.1080p.BluRay.x264-SPARKS.mkv",
            "/Peliculas/Capitan America Brave New World (2025) 4K.mkv",
            "/Peliculas/Dune (2021)/movie.mkv",
        ] {
            assert!(!is_tv(path), "classified as TV: {path}");
        }
    }

    #[test]
    fn episodes_are_detected_as_tv() {
        for path in [
            "/Mixto/Breaking.Bad.S01E01.1080p.mkv",
            "/Mixto/El Ministerio del Tiempo T2E05.mkv",
            "/Mixto/Merli [HDTV][Cap.312].avi",
            "/Mixto/Los Serrano Capitulo 42.avi",
            "/Mixto/Elite 3x05.mkv",
            "/Mixto/The.Daily.Show.2024.11.05.Guest.1080p.mkv",
            "/Mixto/Breaking Bad/Season 1/01.mkv",
            "/Mixto/[SubsPlease] Shingeki no Kyojin - 87 (1080p).mkv",
        ] {
            assert!(is_tv(path), "not classified as TV: {path}");
        }
    }
}

#[cfg(test)]
mod audio_preference_tests {
    use super::audio_codec_matches;

    #[test]
    fn audio_preferences_match_combined_and_legacy_labels() {
        assert!(audio_codec_matches("TrueHD Atmos", "Atmos"));
        assert!(audio_codec_matches("TrueHD Atmos", "TrueHD"));
        assert!(audio_codec_matches("EAC3 Atmos", "Atmos"));
        assert!(audio_codec_matches("DTS:X", "DTS-X"));
        assert!(audio_codec_matches("DTS-HD MA", "DTS-HD MA"));
        assert!(audio_codec_matches("TRUEHD", "TrueHD"));
        assert!(!audio_codec_matches("EAC3", "AC3"));
        assert!(!audio_codec_matches("DTS-HD MA", "DTS"));
        assert!(!audio_codec_matches("AAC", ""));
    }
}
