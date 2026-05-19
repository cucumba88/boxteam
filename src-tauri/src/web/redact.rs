//! Secret-redaction helpers for the public API.
//!
//! `GET /api/settings` (and friends) used to return `ftp_pass`, `tmdb_api_key`,
//! `plex_token`, `emby_api_key`, `smtp_pass`, `telegram_bot_token` etc. in
//! plaintext — meaning any authenticated user (or anyone holding a stolen
//! token) could read every third-party credential the app stores.
//!
//! The fix is a small "preserve sentinel" protocol:
//! - On GET, secrets are replaced with [`REDACTED`].
//! - On PUT, if the client echoes [`REDACTED`] back verbatim, the existing
//!   value is preserved. Empty string means "clear the secret". Any other
//!   value is the new secret.
//!
//! Frontend Settings UI: the password / token fields are bound to API state.
//! When the user opens Settings, those fields show the sentinel (14 dots in
//! a password input). If they leave it alone, the round-trip preserves the
//! stored value. If they type over it, the new value lands.

/// Sentinel returned in GET responses where a secret is set. Distinctive
/// enough that it won't collide with any real-world credential.
pub const REDACTED: &str = "***REDACTED***";

/// Returns [`REDACTED`] when the secret is non-empty, otherwise an empty
/// string. Use for GET-response masking.
pub fn mask(secret: &str) -> String {
    if secret.is_empty() {
        String::new()
    } else {
        REDACTED.to_string()
    }
}

/// On PUT: if the client returned [`REDACTED`] verbatim, fall back to the
/// existing value (meaning "leave unchanged"). Otherwise use what they sent
/// (including empty string, which clears the secret).
pub fn preserve(provided: &str, current: &str) -> String {
    if provided == REDACTED {
        current.to_string()
    } else {
        provided.to_string()
    }
}
