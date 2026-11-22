//! Environment-variable lookup with backwards compatibility for the
//! pre-rename `OSCATA_*` names. New deployments should use `BOXTEAM_*`;
//! existing docker-compose files / Unraid templates keep working because we
//! fall back to the legacy prefix when the new one isn't set.

/// Read `BOXTEAM_<suffix>`, falling back to the legacy `OSCATA_<suffix>`.
pub fn var(suffix: &str) -> Result<String, std::env::VarError> {
    std::env::var(format!("BOXTEAM_{suffix}"))
        .or_else(|_| std::env::var(format!("OSCATA_{suffix}")))
}

#[cfg(test)]
mod tests {
    use super::var;

    #[test]
    fn prefers_new_prefix_and_falls_back_to_legacy() {
        std::env::set_var("OSCATA_ENVCOMPAT_TEST", "legacy");
        assert_eq!(var("ENVCOMPAT_TEST").as_deref(), Ok("legacy"));
        std::env::set_var("BOXTEAM_ENVCOMPAT_TEST", "new");
        assert_eq!(var("ENVCOMPAT_TEST").as_deref(), Ok("new"));
        std::env::remove_var("BOXTEAM_ENVCOMPAT_TEST");
        std::env::remove_var("OSCATA_ENVCOMPAT_TEST");
    }
}
