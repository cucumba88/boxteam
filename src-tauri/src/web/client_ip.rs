//! Real client-IP extraction, behind a reverse proxy.
//!
//! Direct `peer_addr` is `127.0.0.1` (or the proxy's IP) whenever there's an
//! nginx/Caddy/Traefik in front. For audit logging and IP-based rate limiting
//! we need the actual originating client.
//!
//! Trust model: `X-Forwarded-For` / `X-Real-IP` are only honoured when the
//! immediate peer is listed in `BOXTEAM_TRUSTED_PROXIES` (comma-separated env
//! var, defaults to `127.0.0.1,::1`). Otherwise we trust the peer address.
//! This prevents a directly-connecting attacker from spoofing their IP by
//! injecting `X-Forwarded-For` into their own request.

use std::collections::HashSet;
use std::net::IpAddr;

use axum::http::HeaderMap;

fn trusted_proxies() -> HashSet<IpAddr> {
    let raw = crate::env_compat::var("TRUSTED_PROXIES")
        .unwrap_or_else(|_| "127.0.0.1,::1".to_string());
    raw.split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect()
}

/// Returns the originating client IP, trusting `X-Forwarded-For` /
/// `X-Real-IP` only when the immediate peer is a configured trusted proxy.
pub fn client_ip(headers: &HeaderMap, peer: IpAddr) -> IpAddr {
    let trusted = trusted_proxies();
    if !trusted.contains(&peer) {
        return peer;
    }

    // X-Forwarded-For: "<client>, <proxy1>, <proxy2>" — leftmost is the
    // originating client (assuming each hop in the chain is trusted).
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            if let Ok(ip) = first.trim().parse::<IpAddr>() {
                return ip;
            }
        }
    }

    if let Some(real) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        if let Ok(ip) = real.trim().parse::<IpAddr>() {
            return ip;
        }
    }

    peer
}
