//! OMDb API client. Used to fetch IMDb ratings (the `imdbRating` field).
//!
//! Endpoint contract:
//!   GET https://www.omdbapi.com/?apikey={key}&i={imdb_id}&plot=short&tomatoes=false
//!
//! Returns a single JSON object. On error OMDb still answers 200 OK with
//! `{"Response":"False","Error":"..."}` — we treat that as "no rating found".
//!
//! The shape mirrors `tmdb.rs`: a process-wide reqwest::Client, a request
//! throttle, and a small retry budget for transient network failures.

use serde::{Deserialize, Serialize};
use serde::de::DeserializeOwned;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

// OMDb's free tier is 1000 req/day. There's no documented per-second cap, but
// hammering the endpoint at full speed is rude and also pointless given the
// daily quota — a typical 3000-item library needs 3 days regardless of how
// fast we go. We pace ourselves at ~1 req/s so a refresh job is steady and
// not bursty, and we have headroom to back off when OMDb returns 429.
static OMDB_LAST_REQUEST_AT: LazyLock<tokio::sync::Mutex<Instant>> =
    LazyLock::new(|| tokio::sync::Mutex::new(Instant::now() - Duration::from_secs(1)));
const OMDB_MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(1000);

/// Cooldown after a 429 / quota response. We pause every caller until this
/// instant. Reset on the next successful request.
static OMDB_BACKOFF_UNTIL: LazyLock<tokio::sync::Mutex<Option<Instant>>> =
    LazyLock::new(|| tokio::sync::Mutex::new(None));

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OmdbRating {
    pub imdb_rating: Option<f64>,
    pub imdb_votes: Option<i64>,
}

async fn throttle_omdb_request() {
    // If we've been rate-limited recently, sleep until the cooldown elapses
    // before joining the queue. Drop the lock before sleeping so other
    // callers can observe the same gate.
    let backoff = { *OMDB_BACKOFF_UNTIL.lock().await };
    if let Some(until) = backoff {
        let now = Instant::now();
        if until > now {
            tokio::time::sleep(until - now).await;
        }
    }
    let mut last_request = OMDB_LAST_REQUEST_AT.lock().await;
    let elapsed = last_request.elapsed();
    if elapsed < OMDB_MIN_REQUEST_INTERVAL {
        tokio::time::sleep(OMDB_MIN_REQUEST_INTERVAL - elapsed).await;
    }
    *last_request = Instant::now();
}

async fn note_rate_limited(retry_seconds: u64) {
    let until = Instant::now() + Duration::from_secs(retry_seconds.clamp(15, 600));
    *OMDB_BACKOFF_UNTIL.lock().await = Some(until);
}

async fn clear_backoff() {
    *OMDB_BACKOFF_UNTIL.lock().await = None;
}

async fn fetch_json_with_retry<T: DeserializeOwned>(url: &str, context: &str) -> Result<T, String> {
    const MAX_ATTEMPTS: u8 = 3;
    static CLIENT: once_cell::sync::Lazy<reqwest::Client> =
        once_cell::sync::Lazy::new(reqwest::Client::new);
    let client = &*CLIENT;
    let mut last_error = String::new();

    for attempt in 1..=MAX_ATTEMPTS {
        throttle_omdb_request().await;
        match client.get(url).send().await {
            Ok(response) => {
                let status = response.status();
                // Respect Retry-After when OMDb signals throttling.
                let retry_after = response
                    .headers()
                    .get(reqwest::header::RETRY_AFTER)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok());
                match response.text().await {
                    Ok(body) => {
                        if status.as_u16() == 429 {
                            note_rate_limited(retry_after.unwrap_or(60)).await;
                            last_error = format!(
                                "OMDb {context} rate-limited (HTTP 429); paused for {}s",
                                retry_after.unwrap_or(60)
                            );
                        } else if !status.is_success() {
                            last_error = format!(
                                "OMDb {context} failed (HTTP {}): {}",
                                status.as_u16(),
                                body.chars().take(200).collect::<String>()
                            );
                        } else {
                            clear_backoff().await;
                            match serde_json::from_str::<T>(&body) {
                                Ok(parsed) => return Ok(parsed),
                                Err(err) => {
                                    last_error = format!(
                                        "OMDb {context} decode error: {err}. Body: {}",
                                        body.chars().take(200).collect::<String>()
                                    );
                                }
                            }
                        }
                    }
                    Err(err) => {
                        last_error = format!("OMDb {context} body read error: {err}");
                    }
                }
            }
            Err(err) => {
                last_error = format!("OMDb {context} request error: {err}");
            }
        }
        if attempt < MAX_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(250 * attempt as u64)).await;
        }
    }
    Err(last_error)
}

/// OMDb "errors" that are about the account (quota, key) rather than the
/// title being looked up.
fn is_account_error(message: &str) -> bool {
    let m = message.to_ascii_lowercase();
    m.contains("limit") || m.contains("api key") || m.contains("apikey")
}

/// Parses a free-form OMDb rating string (`"8.5"`, `"N/A"`, or missing).
fn parse_imdb_rating(raw: Option<&str>) -> Option<f64> {
    let s = raw?.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("N/A") {
        return None;
    }
    s.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// Parses OMDb's vote count (`"1,234,567"` or `"N/A"`).
fn parse_imdb_votes(raw: Option<&str>) -> Option<i64> {
    let s = raw?.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("N/A") {
        return None;
    }
    s.replace(',', "").parse::<i64>().ok()
}

/// Fetch IMDb rating for a movie/series by its IMDb ID (e.g. `"tt0111161"`).
///
/// Returns `Ok(OmdbRating { None, None })` when OMDb has no rating data —
/// callers should still record the fetch attempt.
pub async fn fetch_by_imdb_id(api_key: &str, imdb_id: &str) -> Result<OmdbRating, String> {
    let imdb = imdb_id.trim();
    if imdb.is_empty() {
        return Ok(OmdbRating::default());
    }
    let url = format!(
        "https://www.omdbapi.com/?apikey={}&i={}&plot=short&tomatoes=false",
        urlencoding::encode(api_key),
        urlencoding::encode(imdb),
    );

    #[derive(Deserialize)]
    struct OmdbResponse {
        #[serde(rename = "Response")]
        response: Option<String>,
        #[serde(rename = "imdbRating")]
        imdb_rating: Option<String>,
        #[serde(rename = "imdbVotes")]
        imdb_votes: Option<String>,
        #[serde(rename = "Error")]
        error: Option<String>,
    }

    let resp: OmdbResponse = fetch_json_with_retry(&url, "by-imdb-id request").await?;

    // OMDb returns 200 OK + Response="False" when the ID is unknown — that's
    // a real "no rating" answer. A bad key or an exhausted daily quota comes
    // back the same way, though, and those must stay errors so the caller
    // retries the title later instead of recording it as checked.
    if resp.response.as_deref().unwrap_or("True").eq_ignore_ascii_case("False") {
        let error = resp.error.unwrap_or_default();
        if is_account_error(&error) {
            return Err(format!("OMDb: {error}"));
        }
        return Ok(OmdbRating::default());
    }

    Ok(OmdbRating {
        imdb_rating: parse_imdb_rating(resp.imdb_rating.as_deref()),
        imdb_votes: parse_imdb_votes(resp.imdb_votes.as_deref()),
    })
}

/// Search OMDb by title. Returns a list of `(imdb_id, title, year)` tuples,
/// up to the 10 results OMDb returns per page. `media_type` is `"movie"`,
/// `"series"` or empty (search both). Empty list on any error / "no result".
pub async fn search_by_title(
    api_key: &str,
    query: &str,
    media_type: &str,
) -> Vec<(String, String, Option<String>)> {
    let q = query.trim();
    if q.is_empty() || api_key.trim().is_empty() {
        return Vec::new();
    }
    let type_param = match media_type {
        "tv" | "series" => "&type=series",
        "movie" => "&type=movie",
        _ => "",
    };
    let url = format!(
        "https://www.omdbapi.com/?apikey={}&s={}{}",
        urlencoding::encode(api_key),
        urlencoding::encode(q),
        type_param,
    );

    #[derive(Deserialize)]
    struct Hit {
        #[serde(rename = "imdbID")]
        imdb_id: Option<String>,
        #[serde(rename = "Title")]
        title: Option<String>,
        #[serde(rename = "Year")]
        year: Option<String>,
    }
    #[derive(Deserialize)]
    struct Resp {
        #[serde(rename = "Search", default)]
        search: Vec<Hit>,
        #[serde(rename = "Response")]
        response: Option<String>,
    }

    let resp: Resp = match fetch_json_with_retry(&url, "search request").await {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    if resp.response.as_deref().unwrap_or("True").eq_ignore_ascii_case("False") {
        return Vec::new();
    }
    resp.search
        .into_iter()
        .filter_map(|h| {
            let id = h.imdb_id?.trim().to_string();
            if id.is_empty() {
                None
            } else {
                Some((id, h.title.unwrap_or_default(), h.year))
            }
        })
        .collect()
}

/// Probe the API key with a known-good IMDb ID (The Shawshank Redemption).
/// Returns true if OMDb answered with `Response="True"`.
pub async fn validate_api_key(api_key: &str) -> bool {
    let url = format!(
        "https://www.omdbapi.com/?apikey={}&i=tt0111161&plot=short&tomatoes=false",
        urlencoding::encode(api_key),
    );

    #[derive(Deserialize)]
    struct Probe {
        #[serde(rename = "Response")]
        response: Option<String>,
    }
    match fetch_json_with_retry::<Probe>(&url, "key validation").await {
        Ok(p) => p.response.as_deref().unwrap_or("False").eq_ignore_ascii_case("True"),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_errors_are_not_treated_as_missing_ratings() {
        assert!(is_account_error("Request limit reached!"));
        assert!(is_account_error("Invalid API key!"));
        assert!(!is_account_error("Incorrect IMDb ID."));
        assert!(!is_account_error(""));
    }

    #[test]
    fn parses_imdb_rating_strings() {
        assert_eq!(parse_imdb_rating(Some("8.5")), Some(8.5));
        assert_eq!(parse_imdb_rating(Some(" 9.3 ")), Some(9.3));
        assert_eq!(parse_imdb_rating(Some("N/A")), None);
        assert_eq!(parse_imdb_rating(Some("")), None);
        assert_eq!(parse_imdb_rating(None), None);
    }

    #[test]
    fn parses_imdb_votes_strings() {
        assert_eq!(parse_imdb_votes(Some("1,234")), Some(1234));
        assert_eq!(parse_imdb_votes(Some("2700000")), Some(2_700_000));
        assert_eq!(parse_imdb_votes(Some("N/A")), None);
        assert_eq!(parse_imdb_votes(Some("")), None);
        assert_eq!(parse_imdb_votes(None), None);
    }
}
