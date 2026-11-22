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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_hides_any_secret_and_keeps_empty_empty() {
        assert_eq!(mask("hunter2"), REDACTED);
        assert_eq!(mask(" "), REDACTED);
        assert_eq!(mask(""), "");
    }

    #[test]
    fn preserve_keeps_current_only_for_the_sentinel() {
        assert_eq!(preserve(REDACTED, "old"), "old");
        assert_eq!(preserve("new", "old"), "new");
        // Empty string clears the secret.
        assert_eq!(preserve("", "old"), "");
        // Something that merely looks like the sentinel is a new value.
        assert_eq!(preserve("***REDACTED*** ", "old"), "***REDACTED*** ");
    }

    #[test]
    fn get_then_put_round_trip_never_changes_the_secret() {
        for secret in ["", "abc", "tok-123"] {
            assert_eq!(preserve(&mask(secret), secret), secret);
        }
    }
}
