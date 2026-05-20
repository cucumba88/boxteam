//! TheTVDB v4 client. Used to fetch a rating-like score (TVDB's `score`)
//! and the TVDB ID matched against the row's IMDb ID.
//!
//! Auth flow: `POST /v4/login {"apikey": "..."}` returns a JWT. The JWT is
//! cached process-wide for ~25 days; on 401 / network error we clear the cache
//! and try once more with a fresh token.
//!
//! Note on `score`: TVDB's v4 `score` field on extended endpoints is not a
//! traditional user-rating; it's a popularity-weighted score (typically a
//! float, not bounded to 0-10 — older entries can sit in the thousands).
//! Treat it as an alternate rating source rather than a true 0-10 user rating;
//! the UI surfaces it under a `TVDB` label so users see the source explicitly.

use serde::{Deserialize, Serialize};
use serde::de::DeserializeOwned;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

const TVDB_BASE: &str = "https://api4.thetvdb.com/v4";
const TOKEN_TTL: Duration = Duration::from_secs(25 * 24 * 60 * 60); // 25 days

// TVDB's free tier sits at ~100 req/day; subscribers get much more. We pace
// at ~600 ms between calls so steady refresh doesn't burst into 429s. The
// backoff mutex pauses every caller when TVDB signals throttling.
static TVDB_LAST_REQUEST_AT: LazyLock<tokio::sync::Mutex<Instant>> =
    LazyLock::new(|| tokio::sync::Mutex::new(Instant::now() - Duration::from_secs(1)));
const TVDB_MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(600);

static TVDB_BACKOFF_UNTIL: LazyLock<tokio::sync::Mutex<Option<Instant>>> =
    LazyLock::new(|| tokio::sync::Mutex::new(None));

/// Token cache keyed by API key — switching the configured key invalidates
/// the previous JWT automatically.
static TOKEN_CACHE: LazyLock<tokio::sync::Mutex<Option<(String, String, Instant)>>> =
    LazyLock::new(|| tokio::sync::Mutex::new(None));

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TvdbRating {
    pub tvdb_id: Option<i64>,
    pub rating: Option<f64>,
}

#[derive(Debug, Clone, Copy)]
pub enum TvdbKind {
    Movie,
    Series,
}

async fn throttle() {
    let backoff = { *TVDB_BACKOFF_UNTIL.lock().await };
    if let Some(until) = backoff {
        let now = Instant::now();
        if until > now {
            tokio::time::sleep(until - now).await;
        }
    }
    let mut last = TVDB_LAST_REQUEST_AT.lock().await;
    let elapsed = last.elapsed();
    if elapsed < TVDB_MIN_REQUEST_INTERVAL {
        tokio::time::sleep(TVDB_MIN_REQUEST_INTERVAL - elapsed).await;
    }
    *last = Instant::now();
}

async fn note_rate_limited(retry_seconds: u64) {
    let until = Instant::now() + Duration::from_secs(retry_seconds.clamp(15, 600));
    *TVDB_BACKOFF_UNTIL.lock().await = Some(until);
}

async fn clear_backoff() {
    *TVDB_BACKOFF_UNTIL.lock().await = None;
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: once_cell::sync::Lazy<reqwest::Client> =
        once_cell::sync::Lazy::new(reqwest::Client::new);
    &CLIENT
}

/// Acquire a JWT for the given API key, either from cache or via /login.
async fn get_token(api_key: &str) -> Result<String, String> {
    {
        let cache = TOKEN_CACHE.lock().await;
        if let Some((cached_key, token, issued_at)) = cache.as_ref() {
            if cached_key == api_key && issued_at.elapsed() < TOKEN_TTL {
                return Ok(token.clone());
            }
        }
    }

    throttle().await;
    let url = format!("{TVDB_BASE}/login");
    let body = serde_json::json!({ "apikey": api_key });
    let resp = http_client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("TVDB login request error: {e}"))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("TVDB login body read error: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "TVDB login failed (HTTP {}): {}",
            status.as_u16(),
            text.chars().take(200).collect::<String>()
        ));
    }

    #[derive(Deserialize)]
    struct LoginData {
        token: String,
    }
    #[derive(Deserialize)]
    struct LoginResponse {
        data: LoginData,
    }
    let parsed: LoginResponse = serde_json::from_str(&text)
        .map_err(|e| format!("TVDB login decode error: {e}"))?;
    let token = parsed.data.token;

    {
        let mut cache = TOKEN_CACHE.lock().await;
        *cache = Some((api_key.to_string(), token.clone(), Instant::now()));
    }
    Ok(token)
}

async fn invalidate_token(api_key: &str) {
    let mut cache = TOKEN_CACHE.lock().await;
    if let Some((cached_key, _, _)) = cache.as_ref() {
        if cached_key == api_key {
            *cache = None;
        }
    }
}

/// Authenticated GET. Auto-refreshes the JWT once on 401.
async fn get_json<T: DeserializeOwned>(
    api_key: &str,
    path: &str,
    context: &str,
) -> Result<T, String> {
    for attempt in 0..2u8 {
        let token = get_token(api_key).await?;
        throttle().await;
        let url = format!("{TVDB_BASE}{path}");
        let resp = http_client()
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("TVDB {context} request error: {e}"))?;
        let status = resp.status();
        let retry_after = resp
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());
        let body = resp
            .text()
            .await
            .map_err(|e| format!("TVDB {context} body read error: {e}"))?;

        if status.as_u16() == 401 && attempt == 0 {
            invalidate_token(api_key).await;
            continue;
        }
        if status.as_u16() == 429 {
            note_rate_limited(retry_after.unwrap_or(60)).await;
            return Err(format!(
                "TVDB {context} rate-limited (HTTP 429); paused for {}s",
                retry_after.unwrap_or(60)
            ));
        }
        if !status.is_success() {
            return Err(format!(
                "TVDB {context} failed (HTTP {}): {}",
                status.as_u16(),
                body.chars().take(200).collect::<String>()
            ));
        }
        clear_backoff().await;
        return serde_json::from_str::<T>(&body)
            .map_err(|e| format!("TVDB {context} decode error: {e}"));
    }
    Err(format!("TVDB {context}: unable to authenticate"))
}

/// Look up a TVDB id (and its kind) by IMDb id.
///
/// Returns `Ok(None)` when there is no remote-id match — common for very new
/// or obscure releases. The caller treats that as "no TVDB data for this row".
pub async fn match_by_imdb(api_key: &str, imdb_id: &str) -> Result<Option<(i64, TvdbKind)>, String> {
    let imdb = imdb_id.trim();
    if imdb.is_empty() {
        return Ok(None);
    }
    let path = format!("/search/remoteid/{}", urlencoding::encode(imdb));

    #[derive(Deserialize)]
    struct Inner {
        id: Option<i64>,
    }
    #[derive(Deserialize)]
    struct Entry {
        movie: Option<Inner>,
        series: Option<Inner>,
    }
    #[derive(Deserialize)]
    struct Wrap {
        data: Vec<Entry>,
    }

    let wrap: Wrap = match get_json(api_key, &path, "remoteid search").await {
        Ok(v) => v,
        // TVDB returns 404 when nothing matches — treat as "no match".
        Err(err) if err.contains("HTTP 404") => return Ok(None),
        Err(err) => return Err(err),
    };

    for entry in wrap.data {
        if let Some(movie) = entry.movie {
            if let Some(id) = movie.id {
                return Ok(Some((id, TvdbKind::Movie)));
            }
        }
        if let Some(series) = entry.series {
            if let Some(id) = series.id {
                return Ok(Some((id, TvdbKind::Series)));
            }
        }
    }
    Ok(None)
}

async fn fetch_score(api_key: &str, kind: TvdbKind, tvdb_id: i64) -> Result<Option<f64>, String> {
    let path = match kind {
        TvdbKind::Movie => format!("/movies/{tvdb_id}/extended"),
        TvdbKind::Series => format!("/series/{tvdb_id}/extended"),
    };

    #[derive(Deserialize)]
    struct Data {
        score: Option<f64>,
    }
    #[derive(Deserialize)]
    struct Wrap {
        data: Data,
    }
    let wrap: Wrap = get_json(api_key, &path, "extended fetch").await?;
    Ok(wrap.data.score.filter(|v| v.is_finite()))
}

/// Resolve an IMDb id to a TVDB id and then fetch its score in a single call.
pub async fn fetch_by_imdb(api_key: &str, imdb_id: &str) -> Result<TvdbRating, String> {
    let Some((tvdb_id, kind)) = match_by_imdb(api_key, imdb_id).await? else {
        return Ok(TvdbRating::default());
    };
    let rating = fetch_score(api_key, kind, tvdb_id).await.unwrap_or(None);
    Ok(TvdbRating {
        tvdb_id: Some(tvdb_id),
        rating,
    })
}

/// Free-form search of TVDB. Returns `(imdb_id, title)` pairs for hits
/// that expose an IMDb remote id — callers convert those into TMDB
/// matches via `tmdb::find_by_imdb_id`. Hits without an IMDb id are
/// skipped because our display layer is TMDB-anchored.
///
/// `media_type` is `"movie"`, `"tv"`, `"series"` or empty (both).
pub async fn search_by_title(
    api_key: &str,
    query: &str,
    media_type: &str,
) -> Vec<(String, String)> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }
    let type_segment = match media_type {
        "tv" | "series" => "&type=series",
        "movie" => "&type=movie",
        _ => "",
    };
    let path = format!(
        "/search?query={}{}&limit=10",
        urlencoding::encode(q),
        type_segment,
    );

    #[derive(Deserialize)]
    struct Hit {
        name: Option<String>,
        #[serde(default)]
        remote_ids: Vec<RemoteId>,
    }
    #[derive(Deserialize)]
    struct RemoteId {
        id: Option<String>,
        #[serde(rename = "sourceName", default)]
        source_name: String,
    }
    #[derive(Deserialize)]
    struct Wrap {
        #[serde(default)]
        data: Vec<Hit>,
    }

    let wrap: Wrap = match get_json(api_key, &path, "title search").await {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    wrap.data
        .into_iter()
        .filter_map(|h| {
            let title = h.name.unwrap_or_default();
            let imdb = h.remote_ids.into_iter().find_map(|r| {
                if r.source_name.eq_ignore_ascii_case("IMDB") {
                    r.id.filter(|s| !s.trim().is_empty())
                } else {
                    None
                }
            })?;
            Some((imdb, title))
        })
        .collect()
}

/// Probe the API key by attempting a login. Returns true on 200 + token.
pub async fn validate_api_key(api_key: &str) -> bool {
    match get_token(api_key).await {
        Ok(t) => !t.is_empty(),
        Err(_) => false,
    }
}
