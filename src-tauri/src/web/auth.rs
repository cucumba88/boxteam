use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
};
use axum::{
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use once_cell::sync::Lazy;
use rand::Rng;

use crate::web::AppState;

// ── Session cache ─────────────────────────────────────────────────────────────

/// In-memory cache of `(token → (user, cached_at))`. Each entry is valid for
/// `SESSION_CACHE_TTL`, after which we re-validate against the DB. Logout
/// invalidates the entry directly via [`invalidate_session_cache`].
///
/// Cuts the DB hit from every authenticated request — useful both for
/// throughput under load and for unblocking the WS upgrade path which used
/// to queue behind DB writes during indexing.
const SESSION_CACHE_TTL: Duration = Duration::from_secs(60);
static SESSION_CACHE: Lazy<RwLock<HashMap<String, (crate::db::WebUser, Instant)>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

fn lookup_session_cache(token: &str) -> Option<crate::db::WebUser> {
    let now = Instant::now();
    if let Ok(map) = SESSION_CACHE.read() {
        if let Some((user, cached_at)) = map.get(token) {
            if now.duration_since(*cached_at) < SESSION_CACHE_TTL {
                return Some(user.clone());
            }
        }
    }
    None
}

fn store_session_cache(token: &str, user: &crate::db::WebUser) {
    if let Ok(mut map) = SESSION_CACHE.write() {
        let now = Instant::now();
        // Opportunistic eviction of any expired entries so the map can't grow
        // unbounded with abandoned sessions.
        map.retain(|_, (_, t)| now.duration_since(*t) < SESSION_CACHE_TTL);
        map.insert(token.to_string(), (user.clone(), now));
    }
}

/// Drop a single token from the cache. Call from `/auth/logout` so a
/// revoked session can't survive its TTL.
pub fn invalidate_session_cache(token: &str) {
    if let Ok(mut map) = SESSION_CACHE.write() {
        map.remove(token);
    }
}

// ── Extractors ───────────────────────────────────────────────────────────────

/// Injected into request extensions by `auth_middleware`.
/// Handlers that require auth use this extractor — returns 401 if absent.
#[derive(Debug, Clone)]
pub struct AuthUser(pub crate::db::WebUser);

impl<S: Send + Sync> FromRequestParts<S> for AuthUser {
    type Rejection = (StatusCode, Json<serde_json::Value>);

    fn from_request_parts(parts: &mut Parts, _: &S) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let result = parts
            .extensions
            .get::<crate::db::WebUser>()
            .cloned()
            .map(AuthUser)
            .ok_or_else(|| {
                (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "Unauthorized"})))
            });
        std::future::ready(result)
    }
}

/// Like AuthUser but also rejects non-admin users with 403.
pub struct AdminUser(pub crate::db::WebUser);

impl<S: Send + Sync> FromRequestParts<S> for AdminUser {
    type Rejection = (StatusCode, Json<serde_json::Value>);

    fn from_request_parts(parts: &mut Parts, _: &S) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let result = match parts.extensions.get::<crate::db::WebUser>().cloned() {
            None => Err((StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "Unauthorized"})))),
            Some(user) if user.role != "admin" => Err((StatusCode::FORBIDDEN, Json(serde_json::json!({"error": "Admin required"})))),
            Some(user) => Ok(AdminUser(user)),
        };
        std::future::ready(result)
    }
}

// ── Middleware ────────────────────────────────────────────────────────────────

/// Reads the Bearer token and, if valid, inserts the `WebUser` into request
/// extensions. Requests without a token pass through — individual handlers
/// enforce auth via the `AuthUser` / `AdminUser` extractors.
pub async fn auth_middleware(
    axum::extract::State(state): axum::extract::State<AppState>,
    mut req: axum::http::Request<axum::body::Body>,
    next: Next,
) -> Response {
    let token = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.trim().to_string());

    if let Some(tok) = token {
        // Hit the in-memory cache first; fall back to a DB query, which we
        // then memoize for the TTL.
        if let Some(user) = lookup_session_cache(&tok) {
            req.extensions_mut().insert(user);
        } else if let Ok(Some(user)) = state.db.validate_web_session(&tok) {
            store_session_cache(&tok, &user);
            req.extensions_mut().insert(user);
        }
    }

    next.run(req).await
}

// ── API error helper ──────────────────────────────────────────────────────────

pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(serde_json::json!({"error": self.message}))).into_response()
    }
}

impl ApiError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::BAD_REQUEST, message: msg.into() }
    }
    pub fn unauthorized() -> Self {
        Self { status: StatusCode::UNAUTHORIZED, message: "Unauthorized".into() }
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::NOT_FOUND, message: msg.into() }
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::INTERNAL_SERVER_ERROR, message: msg.into() }
    }
}

impl From<String> for ApiError {
    fn from(s: String) -> Self {
        Self::internal(s)
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

// ── Password / token utilities ───────────────────────────────────────────────

/// Bcrypt work factor. Pinned explicitly so a future `bcrypt` minor release
/// can't silently lower the default. Verify reads the cost from the stored
/// hash, so existing accounts continue to work after a bump.
const BCRYPT_COST: u32 = 13;

pub fn hash_password(password: &str) -> Result<String, String> {
    bcrypt::hash(password, BCRYPT_COST).map_err(|e| e.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    bcrypt::verify(password, hash).map_err(|e| e.to_string())
}

/// 256-bit cryptographically-random token, hex-encoded. Replaces the previous
/// UUID v4 (which is 122 effective bits and is debatably appropriate for
/// session identifiers — best practice is raw OsRng bytes).
pub fn new_session_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn generate_otp() -> String {
    let mut rng = rand::thread_rng();
    format!("{:06}", rng.gen_range(0..1_000_000u32))
}
