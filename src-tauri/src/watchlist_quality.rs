//! Quality scoring for watchlist auto-downloads: which release of a movie or
//! episode best matches the title's quality profile. Pure functions, used by
//! `commands::trigger_watchlist_auto_downloads` and tested below.

use crate::commands::audio_codec_matches;
use crate::db::{QualityProfile, WatchlistAutoItem};

/// Profile used when a watchlist entry points to a profile that no longer
/// exists: no hard filters, best resolution / release wins.
pub fn fallback_profile() -> QualityProfile {
    QualityProfile {
        id: 0,
        name: "Any".into(),
        min_resolution: None,
        preferred_resolution: None,
        prefer_hdr: false,
        preferred_codecs: "[]".into(),
        preferred_audio_codecs: "[]".into(),
        preferred_release_types: "[]".into(),
        min_size_gb: None,
        max_size_gb: None,
        is_builtin: false,
        created_at: String::new(),
    }
}

pub fn resolution_score(res: Option<&str>) -> u32 {
    let r = res.unwrap_or("").to_lowercase();
    if r.contains("2160") || r.contains("4k") || r.contains("uhd") {
        4
    } else if r.contains("1080") {
        3
    } else if r.contains("720") {
        2
    } else if !r.is_empty() {
        1
    } else {
        0
    }
}

pub fn base_release_score(rt: Option<&str>) -> u32 {
    let r = rt.unwrap_or("");
    if r.contains("REMUX") || r.contains("BDREMUX") {
        5
    } else if r.contains("BluRay") || r.contains("Blu-ray") {
        4
    } else if r.contains("WEB-DL") {
        3
    } else if r.contains("WEBRip") {
        2
    } else if r.contains("HDTV") {
        1
    } else {
        0
    }
}

pub fn meets_min_resolution(res: Option<&str>, min: Option<&str>) -> bool {
    match min {
        None | Some("") => true,
        // Unknown resolution → give benefit of the doubt rather than hard-reject.
        Some(_) if res.map(|r| r.is_empty()).unwrap_or(true) => true,
        Some(min_res) => resolution_score(res) >= resolution_score(Some(min_res)),
    }
}

/// Codec family: the parser stores what the filename says ("X265", "H264",
/// "H.265"…) while profiles name the family ("HEVC", "AVC", "AV1", "VC-1").
pub fn codec_family(codec: &str) -> String {
    let c: String = codec
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_uppercase();
    match c.as_str() {
        "X265" | "H265" | "HEVC" => "HEVC".into(),
        "X264" | "H264" | "AVC" => "AVC".into(),
        "VC1" => "VC-1".into(),
        _ => c,
    }
}

/// Score of a candidate release for a profile; `None` when a hard filter
/// (minimum resolution, size limits) rejects it. Higher is better.
pub fn score_candidate(item: &WatchlistAutoItem, profile: &QualityProfile) -> Option<u32> {
    // Hard filter: minimum resolution
    if !meets_min_resolution(item.resolution.as_deref(), profile.min_resolution.as_deref()) {
        return None;
    }
    // Hard filter: min file size
    if let (Some(min_gb), Some(bytes)) = (profile.min_size_gb, item.size_bytes) {
        if bytes < (min_gb * 1024.0 * 1024.0 * 1024.0) as i64 {
            return None;
        }
    }
    // Hard filter: max file size
    if let (Some(max_gb), Some(bytes)) = (profile.max_size_gb, item.size_bytes) {
        if bytes > (max_gb * 1024.0 * 1024.0 * 1024.0) as i64 {
            return None;
        }
    }

    let mut score: u32 = 0;

    // Resolution scoring
    if let Some(ref pref) = profile.preferred_resolution {
        if item
            .resolution
            .as_deref()
            .map(|r| r.eq_ignore_ascii_case(pref))
            .unwrap_or(false)
        {
            score += 1000;
        } else {
            score += resolution_score(item.resolution.as_deref()) * 100;
        }
    } else {
        score += resolution_score(item.resolution.as_deref()) * 100;
    }

    // HDR preference
    if profile.prefer_hdr && item.hdr.is_some() {
        score += 200;
    }

    // Preferred release types (ordered list — earlier = better)
    let rel_types: Vec<String> =
        serde_json::from_str(&profile.preferred_release_types).unwrap_or_default();
    if !rel_types.is_empty() {
        if let Some(pos) = rel_types.iter().position(|t| {
            item.release_type
                .as_deref()
                .map(|r| r.contains(t.as_str()))
                .unwrap_or(false)
        }) {
            score += (rel_types.len() - pos) as u32 * 50;
        }
    } else {
        score += base_release_score(item.release_type.as_deref()) * 50;
    }

    // Preferred codecs
    let codecs: Vec<String> = serde_json::from_str(&profile.preferred_codecs).unwrap_or_default();
    if !codecs.is_empty() {
        if let Some(pos) = codecs.iter().position(|c| {
            item.codec
                .as_deref()
                .map(|k| codec_family(k) == codec_family(c))
                .unwrap_or(false)
        }) {
            score += (codecs.len() - pos) as u32 * 30;
        }
    }

    // Preferred audio codecs
    let audio: Vec<String> =
        serde_json::from_str(&profile.preferred_audio_codecs).unwrap_or_default();
    if !audio.is_empty() {
        if let Some(pos) = audio.iter().position(|a| {
            item.audio_codec
                .as_deref()
                .map(|k| audio_codec_matches(k, a))
                .unwrap_or(false)
        }) {
            score += (audio.len() - pos) as u32 * 20;
        }
    }

    Some(score)
}

/// Index of the best release in `group` for `profile`, or `None` when every
/// release is rejected by a hard filter. Ties keep the earliest release.
pub fn pick_best(group: &[WatchlistAutoItem], profile: &QualityProfile) -> Option<usize> {
    let mut best: Option<(u32, usize)> = None;
    for (i, c) in group.iter().enumerate() {
        match score_candidate(c, profile) {
            None => println!(
                "[watchlist] auto-download: '{}' rejected by quality profile '{}' (res={:?})",
                c.filename, profile.name, c.resolution
            ),
            Some(s) if best.map_or(true, |(b, _)| s > b) => best = Some((s, i)),
            Some(_) => {}
        }
    }
    best.map(|(_, i)| i)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GB: i64 = 1024 * 1024 * 1024;

    fn release(name: &str, res: &str, rt: &str, codec: &str, audio: &str, hdr: Option<&str>, gb: f64) -> WatchlistAutoItem {
        let opt = |s: &str| if s.is_empty() { None } else { Some(s.to_string()) };
        WatchlistAutoItem {
            ftp_path: format!("/ftp/{name}"),
            filename: name.to_string(),
            tmdb_id: 1,
            media_type: Some("movie".into()),
            tmdb_genres: None,
            media_title: None,
            resolution: opt(res),
            release_type: opt(rt),
            hdr: hdr.map(String::from),
            codec: opt(codec),
            audio_codec: opt(audio),
            size_bytes: Some((gb * GB as f64) as i64),
            profile_id: 1,
            season: None,
            episode: None,
            ftp_relative_path: None,
            scope: "all".into(),
            latest_season: None,
        }
    }

    fn profile(f: impl FnOnce(&mut QualityProfile)) -> QualityProfile {
        let mut p = fallback_profile();
        f(&mut p);
        p
    }

    #[test]
    fn resolution_and_release_scores() {
        assert_eq!(resolution_score(Some("2160p")), 4);
        assert_eq!(resolution_score(Some("4K")), 4);
        assert_eq!(resolution_score(Some("1080P")), 3);
        assert_eq!(resolution_score(Some("720p")), 2);
        assert_eq!(resolution_score(Some("480p")), 1);
        assert_eq!(resolution_score(None), 0);
        assert!(base_release_score(Some("BDREMUX")) > base_release_score(Some("BluRay")));
        assert!(base_release_score(Some("BluRay")) > base_release_score(Some("WEB-DL")));
        assert!(base_release_score(Some("WEB-DL")) > base_release_score(Some("WEBRip")));
        assert!(base_release_score(Some("WEBRip")) > base_release_score(Some("HDTV")));
        assert_eq!(base_release_score(Some("CAM")), 0);
    }

    #[test]
    fn minimum_resolution_rejects_below_but_not_unknown() {
        assert!(meets_min_resolution(Some("1080p"), Some("1080P")));
        assert!(meets_min_resolution(Some("2160p"), Some("1080P")));
        assert!(!meets_min_resolution(Some("720p"), Some("1080P")));
        assert!(meets_min_resolution(None, Some("2160P")), "unknown gets the benefit of the doubt");
        assert!(meets_min_resolution(Some("720p"), None));
        assert!(meets_min_resolution(Some("720p"), Some("")));
    }

    #[test]
    fn size_limits_are_hard_filters() {
        let p = profile(|p| {
            p.min_size_gb = Some(2.0);
            p.max_size_gb = Some(20.0);
        });
        assert!(score_candidate(&release("small", "1080p", "WEB-DL", "", "", None, 1.0), &p).is_none());
        assert!(score_candidate(&release("big", "2160p", "BDREMUX", "", "", None, 60.0), &p).is_none());
        assert!(score_candidate(&release("ok", "1080p", "WEB-DL", "", "", None, 8.0), &p).is_some());
    }

    #[test]
    fn without_preferences_higher_resolution_then_better_source_wins() {
        let group = vec![
            release("a.720p.BluRay", "720p", "BluRay", "", "", None, 5.0),
            release("b.2160p.WEB-DL", "2160p", "WEB-DL", "", "", None, 15.0),
            release("c.1080p.BDREMUX", "1080p", "BDREMUX", "", "", None, 30.0),
        ];
        assert_eq!(pick_best(&group, &fallback_profile()), Some(1));
    }

    #[test]
    fn preferred_resolution_beats_a_higher_one() {
        let p = profile(|p| p.preferred_resolution = Some("1080P".into()));
        let group = vec![
            release("4k", "2160p", "BDREMUX", "", "", Some("DV+HDR10"), 60.0),
            release("hd", "1080p", "WEB-DL", "", "", None, 8.0),
        ];
        assert_eq!(pick_best(&group, &p), Some(1));
    }

    #[test]
    fn hdr_preference_breaks_a_tie() {
        let p = profile(|p| p.prefer_hdr = true);
        let group = vec![
            release("sdr", "2160p", "WEB-DL", "", "", None, 15.0),
            release("hdr", "2160p", "WEB-DL", "", "", Some("HDR10"), 15.0),
        ];
        assert_eq!(pick_best(&group, &p), Some(1));
    }

    #[test]
    fn preferred_release_types_follow_the_profile_order() {
        // The options offered by the profile editor (ProfileEditor.tsx).
        let p = profile(|p| p.preferred_release_types = r#"["WEB-DL","BluRay"]"#.into());
        let group = vec![
            release("bluray", "1080p", "BluRay", "", "", None, 10.0),
            release("webdl", "1080p", "WEB-DL", "", "", None, 6.0),
            release("hdtv", "1080p", "HDTV", "", "", None, 3.0),
        ];
        assert_eq!(pick_best(&group, &p), Some(1));
        let remux = profile(|p| p.preferred_release_types = r#"["BDREMUX"]"#.into());
        let group = vec![
            release("webdl", "1080p", "WEB-DL", "", "", None, 6.0),
            release("remux", "1080p", "BDREMUX", "", "", None, 30.0),
        ];
        assert_eq!(pick_best(&group, &remux), Some(1));
    }

    #[test]
    fn preferred_codec_matches_the_parser_spelling() {
        // The parser stores "X265" / "H264"; the profile editor offers "HEVC" / "AVC".
        let p = profile(|p| p.preferred_codecs = r#"["HEVC","AVC"]"#.into());
        let group = vec![
            release("x264", "1080p", "WEB-DL", "X264", "", None, 6.0),
            release("x265", "1080p", "WEB-DL", "X265", "", None, 4.0),
        ];
        assert_eq!(pick_best(&group, &p), Some(1));
        for stored in ["X265", "x265", "H265", "H.265", "HEVC"] {
            assert_eq!(codec_family(stored), "HEVC", "{stored}");
        }
        for stored in ["X264", "H264", "H.264", "AVC"] {
            assert_eq!(codec_family(stored), "AVC", "{stored}");
        }
        assert_eq!(codec_family("VC1"), codec_family("VC-1"));
        assert_eq!(codec_family("AV1"), "AV1");
    }

    #[test]
    fn preferred_audio_follows_the_profile_order() {
        let p = profile(|p| p.preferred_audio_codecs = r#"["Atmos","DTS-X"]"#.into());
        let group = vec![
            release("dtsx", "2160p", "BDREMUX", "", "DTS:X", None, 50.0),
            release("atmos", "2160p", "BDREMUX", "", "TrueHD Atmos", None, 50.0),
            release("ac3", "2160p", "BDREMUX", "", "AC3", None, 50.0),
        ];
        assert_eq!(pick_best(&group, &p), Some(1));
        // AC3 never matches an EAC3 preference.
        let eac3 = profile(|p| p.preferred_audio_codecs = r#"["EAC3"]"#.into());
        let group = vec![
            release("ac3", "1080p", "WEB-DL", "", "AC3", None, 5.0),
            release("eac3", "1080p", "WEB-DL", "", "EAC3", None, 5.0),
        ];
        assert_eq!(pick_best(&group, &eac3), Some(1));
    }

    #[test]
    fn everything_rejected_means_no_download() {
        let p = profile(|p| p.min_resolution = Some("2160P".into()));
        let group = vec![
            release("hd", "1080p", "WEB-DL", "", "", None, 6.0),
            release("sd", "720p", "WEB-DL", "", "", None, 2.0),
        ];
        assert_eq!(pick_best(&group, &p), None);
    }

    #[test]
    fn ties_keep_the_first_release() {
        let group = vec![
            release("first", "1080p", "WEB-DL", "", "", None, 6.0),
            release("second", "1080p", "WEB-DL", "", "", None, 6.0),
        ];
        assert_eq!(pick_best(&group, &fallback_profile()), Some(0));
    }

    #[test]
    fn broken_profile_json_is_ignored_not_fatal() {
        let p = profile(|p| {
            p.preferred_codecs = "not json".into();
            p.preferred_release_types = "".into();
        });
        assert!(score_candidate(&release("a", "1080p", "WEB-DL", "X265", "", None, 5.0), &p).is_some());
    }
}
