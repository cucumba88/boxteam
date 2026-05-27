pub mod auth;
pub mod client_ip;
pub mod dto;
pub mod handlers;
pub mod rate_limit;
pub mod redact;

use axum::{
    extract::Request,
    middleware,
    response::Response,
    routing::{delete, get, post, put},
    Router,
};
#[cfg(debug_assertions)]
use axum::{
    body::Body,
    response::IntoResponse,
};
#[cfg(not(debug_assertions))]
use axum::response::Html;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
#[cfg(not(debug_assertions))]
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tower_http::services::{ServeDir, ServeFile};
use tower_http::compression::CompressionLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};

static WEBGUI_RUNNING: std::sync::LazyLock<std::sync::atomic::AtomicBool> =
    std::sync::LazyLock::new(|| std::sync::atomic::AtomicBool::new(false));

#[derive(Clone)]
pub struct AppState {
    pub db: crate::db::Db,
    pub queue: crate::downloads::SharedQueue,
    pub app_handle: tauri::AppHandle,
    /// Overrides the DB-stored exposed_port when OSCATA_WEBGUI_EXPOSED_PORT is set.
    pub exposed_port_override: Option<u16>,
}

pub fn spawn_if_enabled(db: crate::db::Db, queue: crate::downloads::SharedQueue, app_handle: tauri::AppHandle) {
    // OSCATA_WEBGUI=1 forces the web server on regardless of the database setting,
    // allowing headless / server installs without touching the DB first.
    let force_enabled = std::env::var("OSCATA_WEBGUI").as_deref() == Ok("1");

    let cfg = match db.load_webgui_config() {
        Ok(c) => c,
        Err(e) => { eprintln!("[webgui] config load failed: {e}"); return; }
    };
    if !cfg.enabled && !force_enabled { return; }
    if WEBGUI_RUNNING
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        println!("[webgui] already running");
        return;
    }

    // Exposed port override: used by server_info and invite links so clients
    // see the correct external port when behind a reverse proxy.
    let exposed_port_override: Option<u16> = if force_enabled {
        std::env::var("OSCATA_WEBGUI_EXPOSED_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
    } else {
        None
    };

    // Env vars override DB config when OSCATA_WEBGUI=1 is set.
    #[cfg_attr(debug_assertions, allow(unused_variables))]
    let host = if force_enabled {
        std::env::var("OSCATA_WEBGUI_HOST").unwrap_or_else(|_| cfg.host.clone())
    } else {
        cfg.host.clone()
    };
    let port = if force_enabled {
        std::env::var("OSCATA_WEBGUI_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(cfg.port)
    } else {
        cfg.port
    };

    // In debug builds always bind to localhost so dev machines don't try to
    // bind to a production IP set in webgui_host.
    #[cfg(debug_assertions)]
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    #[cfg(not(debug_assertions))]
    let addr = SocketAddr::new(parse_bind_ip(&host), port);
    let state = AppState { db, queue, app_handle, exposed_port_override };

    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                WEBGUI_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
                eprintln!("[webgui] bind {addr} failed: {e}");
                return;
            }
        };
        println!("[webgui] listening on http://{addr}");
        // ConnectInfo<SocketAddr> needs `into_make_service_with_connect_info`
        // so handlers can read the peer address (rate-limit, audit log).
        let svc = build_router(state).into_make_service_with_connect_info::<SocketAddr>();
        if let Err(e) = axum::serve(listener, svc).await {
            WEBGUI_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
            eprintln!("[webgui] stopped: {e}");
        }
    });
}

fn build_router(state: AppState) -> Router {
    let cors = build_cors_layer(&state);
    let api_state = state.clone();
    let auth_mw = middleware::from_fn_with_state(api_state.clone(), auth::auth_middleware);

    let api = Router::new()
        // public
        .route("/health",                  get(handlers::health))
        .route("/manifest.webmanifest",    get(handlers::pwa_manifest))
        .route("/server-info",             get(handlers::server_info))
        .route("/settings/has-config",     get(handlers::has_config_handler))
        .route("/ftp/test",                post(handlers::test_ftp_handler))
        .route("/auth/bootstrap",          post(handlers::auth_bootstrap))
        .route("/auth/login",              post(handlers::auth_login))
        .route("/auth/invite/accept",      post(handlers::auth_invite_accept))
        .route("/auth/otp/verify",         post(handlers::auth_otp_verify))
        // auth-gated
        .route("/auth/me",                 get(handlers::auth_me))
        .route("/auth/logout",             post(handlers::auth_logout))
        .route("/auth/password",           put(handlers::auth_change_password))
        .route("/users",                   get(handlers::list_users).post(handlers::create_user))
        .route("/users/invite",            post(handlers::invite_user))
        .route("/users/{id}",              put(handlers::update_user).delete(handlers::delete_user))
        .route("/media",                   get(handlers::get_media))
        .route("/media/badges",            post(handlers::check_media_badges_handler))
        .route("/media/{id}/match",        put(handlers::apply_tmdb_match))
        .route("/media/{id}/metadata",     delete(handlers::clear_item_metadata_handler))
        .route("/media/clear-all-metadata",post(handlers::clear_all_metadata_handler))
        .route("/downloads",               get(handlers::get_downloads).post(handlers::queue_download))
        .route("/downloads/clear-completed", post(handlers::clear_completed_handler))
        .route("/downloads/concurrency",   put(handlers::set_concurrency_handler))
        .route("/downloads/{id}",          delete(handlers::delete_download_handler))
        .route("/downloads/{id}/cancel",   post(handlers::cancel_download_handler))
        .route("/downloads/{id}/retry",    post(handlers::retry_download_handler))
        .route("/indexing/start",          post(handlers::start_indexing_handler))
        .route("/indexing/rematch",        post(handlers::rematch_all_handler))
        .route("/indexing/refresh-metadata", post(handlers::refresh_all_metadata_handler))
        .route("/indexing/refresh-watch-providers", post(handlers::refresh_watch_providers_handler))
        .route("/indexing/status",         get(handlers::indexing_status_handler))
        .route("/settings",                get(handlers::get_settings).put(handlers::put_settings))
        .route("/settings/smtp-test",      post(handlers::smtp_test_handler))
        .route("/settings/tmdb-test",      post(handlers::test_tmdb_handler))
        .route("/settings/omdb-test",      post(handlers::test_omdb_handler))
        .route("/settings/tvdb-test",      post(handlers::test_tvdb_handler))
        .route("/ratings/refresh",         post(handlers::refresh_ratings_handler))
        .route("/webgui/config",           get(handlers::get_webgui_config_handler).put(handlers::put_webgui_config_handler))
        .route("/tmdb/search",             post(handlers::search_tmdb_handler))
        .route("/watchlist",               get(handlers::get_watchlist_handler).post(handlers::add_watchlist_handler))
        .route("/watchlist/{id}",          delete(handlers::remove_watchlist_handler).put(handlers::update_watchlist_handler))
        .route("/watchlist/check/{tmdb_id}", get(handlers::check_watchlist_handler))
        .route("/watchlist/{tmdb_id}/coverage", get(handlers::watchlist_coverage_handler))
        .route("/watchlist/{tmdb_id}/seasons",  get(handlers::watchlist_seasons_handler))
        .route("/quality-profiles",             get(handlers::get_profiles_handler).post(handlers::create_profile_handler))
        .route("/quality-profiles/{id}",        put(handlers::update_profile_handler).delete(handlers::delete_profile_handler))
        .route("/notifications/subscription",         get(handlers::get_telegram_sub_handler).put(handlers::update_telegram_sub_handler).delete(handlers::revoke_telegram_sub_handler))
        .route("/notifications/subscription/link",      post(handlers::link_telegram_bot_handler))
        .route("/ws",                                   get(handlers::ws_handler))
        .layer(auth_mw)
        .with_state(api_state);

    // In debug builds, proxy all frontend requests to the Vite dev server (port 1420).
    // In release builds, serve built frontend from bundled resources or local dist/.
    let mut root = Router::new().nest("/api", api);

    #[cfg(debug_assertions)]
    {
        root = root.fallback(vite_proxy);
    }

    #[cfg(not(debug_assertions))]
    {
        let dist = find_dist_dir(&state.app_handle);
        if let Some(d) = dist {
            let index = d.join("index.html");
            root = root.fallback_service(
                ServeDir::new(&d).fallback(ServeFile::new(index))
            );
        } else {
            root = root
                .route("/", get(dev_root_page))
                .fallback(get(dev_root_page));
        }
    }

    // Layer stack (innermost first, outermost last):
    //   - static_cache_headers: tells browsers index.html is volatile so a
    //     container upgrade is picked up after a refresh, and /assets/*
    //     bundles are immutable. Release builds only — no fallback service
    //     to wrap in debug.
    //   - security_headers: CSP, X-Frame-Options, etc. on every response.
    //   - Compression: gzip/brotli — shrinks /api/media JSON 5–10x.
    //   - CORS: outermost so it sees the final response.
    #[cfg(not(debug_assertions))]
    let root = root.layer(middleware::from_fn(static_cache_headers));

    root.layer(middleware::from_fn(security_headers_middleware))
        .layer(CompressionLayer::new())
        .layer(cors)
}

/// Build the CORS layer. Allowed origins come from (in priority order):
///   1. `OSCATA_WEBGUI_ALLOWED_ORIGINS` env (comma-separated)
///   2. `webgui_app_url` from DB config (the canonical external URL)
///   3. dev fallback: `http://localhost:1420` (Vite dev server)
///
/// If no origin is configured AND no app_url is set, we fall back to
/// `CorsLayer::permissive()` and log a loud warning — this preserves the
/// out-of-the-box experience for first-run / desktop / LAN-only setups, but
/// makes the misconfiguration impossible to miss for anyone exposing publicly.
fn build_cors_layer(state: &AppState) -> CorsLayer {
    use axum::http::HeaderValue;

    let from_env: Vec<String> = std::env::var("OSCATA_WEBGUI_ALLOWED_ORIGINS")
        .ok()
        .map(|s| {
            s.split(',')
                .map(|o| o.trim().to_string())
                .filter(|o| !o.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let mut origins: Vec<String> = from_env;
    if origins.is_empty() {
        if let Ok(cfg) = state.db.load_webgui_config() {
            let url = cfg.app_url.trim().trim_end_matches('/').to_string();
            if !url.is_empty() {
                origins.push(url);
            }
        }
    }
    // Always allow the Vite dev server in debug builds.
    #[cfg(debug_assertions)]
    if !origins.iter().any(|o| o == "http://localhost:1420") {
        origins.push("http://localhost:1420".into());
    }

    if origins.is_empty() {
        eprintln!(
            "[webgui] WARNING: no allowed origins configured (set \
             OSCATA_WEBGUI_ALLOWED_ORIGINS or webgui app_url). \
             CORS is wide open — do not expose to the public internet."
        );
        return CorsLayer::permissive();
    }

    let parsed: Vec<HeaderValue> = origins
        .iter()
        .filter_map(|o| o.parse::<HeaderValue>().ok())
        .collect();
    if parsed.is_empty() {
        eprintln!("[webgui] WARNING: no origins parsed cleanly; falling back to permissive CORS");
        return CorsLayer::permissive();
    }
    println!("[webgui] CORS locked to: {:?}", origins);

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(parsed))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any)
}

/// Sets defensive response headers on every response:
/// - `Content-Security-Policy`: limits where the SPA can load script/img/connect from.
/// - `X-Content-Type-Options: nosniff`
/// - `X-Frame-Options: DENY` (no embedding in iframes)
/// - `Referrer-Policy: strict-origin-when-cross-origin`
async fn security_headers_middleware(
    req: axum::http::Request<axum::body::Body>,
    next: middleware::Next,
) -> Response {
    let mut resp = next.run(req).await;
    let h = resp.headers_mut();
    // Inline style/script are used by Vite for HMR in dev and by inline `style` attributes
    // throughout the codebase, so 'unsafe-inline' is required. The data: scheme is needed
    // for PWA icons / inline SVGs. wss: covers the live event websocket.
    h.insert(
        "content-security-policy",
        axum::http::HeaderValue::from_static(
            "default-src 'self'; \
             img-src 'self' https://image.tmdb.org data: blob:; \
             connect-src 'self' wss: ws:; \
             style-src 'self' 'unsafe-inline'; \
             script-src 'self' 'unsafe-inline'; \
             font-src 'self' data:; \
             frame-ancestors 'none'; \
             base-uri 'self'",
        ),
    );
    h.insert(
        "x-content-type-options",
        axum::http::HeaderValue::from_static("nosniff"),
    );
    h.insert(
        "x-frame-options",
        axum::http::HeaderValue::from_static("DENY"),
    );
    h.insert(
        "referrer-policy",
        axum::http::HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    resp
}

/// In debug mode, proxy all non-API requests to the Vite dev server (HMR included).
#[cfg(debug_assertions)]
async fn vite_proxy(req: Request) -> Response {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    let client = CLIENT.get_or_init(|| reqwest::Client::new());

    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let target = format!("http://localhost:1420{path_and_query}");

    let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes())
        .unwrap_or(reqwest::Method::GET);

    let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => return (axum::http::StatusCode::BAD_GATEWAY, "body read error").into_response(),
    };

    let upstream = match client.request(method, &target).body(body_bytes).send().await {
        Ok(r) => r,
        Err(_) => {
            return (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("Vite dev server not reachable at {target}"),
            )
                .into_response()
        }
    };

    let status = axum::http::StatusCode::from_u16(upstream.status().as_u16())
        .unwrap_or(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    let mut builder = Response::builder().status(status);
    for (k, v) in upstream.headers() {
        // Skip transfer-encoding to avoid chunked encoding conflicts
        if k.as_str().eq_ignore_ascii_case("transfer-encoding") { continue; }
        builder = builder.header(k, v);
    }
    let bytes = upstream.bytes().await.unwrap_or_default();
    builder.body(Body::from(bytes)).unwrap_or_else(|_| {
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "response build error").into_response()
    })
}

/// Set Cache-Control headers on static responses based on the request path.
///
/// Vite hashes everything under `/assets/<name>-<hash>.{js,css,…}` so those
/// files are content-addressed and safe to cache for a year. `index.html`
/// is *not* hashed — caching it is what causes "I upgraded but still see
/// the old UI" because the cached HTML keeps pointing at old asset URLs.
/// Mark non-asset responses as `no-cache, must-revalidate` so the browser
/// re-checks freshness on every navigation.
#[cfg(not(debug_assertions))]
async fn static_cache_headers(
    req: Request,
    next: axum::middleware::Next,
) -> Response {
    let path = req.uri().path().to_string();
    let mut res = next.run(req).await;

    // API routes have their own caching semantics; leave them alone.
    if path.starts_with("/api/") {
        return res;
    }

    let header = if path.starts_with("/assets/") {
        // Hashed bundle files — never change, cache hard.
        "public, max-age=31536000, immutable"
    } else {
        // index.html (and any other SPA fallback). Revalidate every load
        // so a new release is picked up immediately after the user refreshes.
        "no-cache, must-revalidate"
    };

    if let Ok(value) = axum::http::HeaderValue::from_str(header) {
        res.headers_mut().insert(axum::http::header::CACHE_CONTROL, value);
    }
    res
}

#[cfg(not(debug_assertions))]
async fn dev_root_page() -> Html<&'static str> {
    Html(
    r#"<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Oscata WebGUI</title>
        <style>
            :root { color-scheme: dark; }
            body {
                margin: 0;
                font-family: "Segoe UI", sans-serif;
                background: #0d0d0f;
                color: #e8e8f0;
                min-height: 100vh;
                display: grid;
                place-items: center;
            }
            .card {
                width: min(760px, calc(100% - 2rem));
                border: 1px solid #2e2e38;
                background: #18181c;
                border-radius: 12px;
                padding: 1rem 1.1rem;
            }
            h1 { margin: 0 0 0.5rem; font-size: 1.1rem; }
            p { color: #a3a3b8; line-height: 1.5; margin: 0.35rem 0; }
            code { color: #fff; }
            a { color: #9585ff; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>WebGUI API is running</h1>
            <p>The root page is unavailable because no built frontend was found in <code>dist/</code>.</p>
            <p>API health check: <a href="/api/health">/api/health</a></p>
        </div>
    </body>
</html>"#,
    )
}

#[cfg(not(debug_assertions))]
fn find_dist_dir(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // 1. Bundled resource paths (production install)
    let resource_candidates = [
        "dist/index.html",
        "index.html",
        "frontend/index.html",
        "www/index.html",
    ];
    for rel in resource_candidates {
        if let Ok(candidate) = app_handle
            .path()
            .resolve(rel, tauri::path::BaseDirectory::Resource)
        {
            if candidate.exists() {
                return candidate.parent().map(|p| p.to_path_buf());
            }
        }
    }

    // 2. Next to the binary
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("dist");
            if candidate.join("index.html").exists() { return Some(candidate); }

            // Common macOS app bundle layout: <App>.app/Contents/MacOS/<exe>
            let macos_resources = dir.join("..").join("Resources").join("dist");
            if macos_resources.join("index.html").exists() {
                return Some(macos_resources);
            }
        }
    }

    // 3. Current working directory (dev mode)
    let cwd = std::path::PathBuf::from("dist");
    if cwd.join("index.html").exists() { return Some(cwd); }
    None
}

#[cfg(not(debug_assertions))]
fn parse_bind_ip(host: &str) -> IpAddr {
    let t = host.trim();
    if t.eq_ignore_ascii_case("localhost") { return IpAddr::V4(Ipv4Addr::LOCALHOST); }
    t.parse().unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
}
