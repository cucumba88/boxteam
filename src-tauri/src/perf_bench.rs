//! Large-library performance benchmark (synthetic data, no network).
//!
//! Ignored by default. Run with:
//!
//! ```bash
//! cd src-tauri
//! BENCH_N=20000 cargo test --release perf_bench -- --ignored --nocapture
//! ```
//!
//! Optional `BENCH_JSON_OUT=/path/media.json` writes the `get_all_media`
//! payload so the frontend can be profiled with the same synthetic library.

use crate::db::Db;
use std::time::Instant;

const RESOLUTIONS: [&str; 4] = ["2160p", "1080p", "720p", "1080p"];
const SOURCES: [&str; 4] = ["WEB-DL", "BluRay", "BDRemux", "WEBRip"];
const CODECS: [&str; 3] = ["x265", "x264", "HEVC"];
const GROUPS: [&str; 5] = ["NTb", "FLUX", "SPARKS", "HDO", "MiNiTHEATRE"];
const WORDS: [&str; 24] = [
    "Silent", "River", "Night", "Empire", "Echo", "Lost", "Garden", "Storm", "Iron", "Paper",
    "Moon", "Glass", "Shadow", "Last", "Winter", "Golden", "Hidden", "City", "Wild", "Northern",
    "Broken", "Crown", "Signal", "Harbor",
];

pub struct SyntheticFile {
    pub path: String,
    pub filename: String,
    pub size: u64,
}

fn title_for(seed: usize) -> String {
    let a = WORDS[seed % WORDS.len()];
    let b = WORDS[(seed / WORDS.len()) % WORDS.len()];
    let c = WORDS[(seed / (WORDS.len() * WORDS.len())) % WORDS.len()];
    format!("{a} {b} {c}")
}

/// ~35 % movies, ~65 % TV episodes (shows of 8–60 episodes), which is the
/// shape of a typical FTP media share.
pub fn synthetic_files(n: usize) -> Vec<SyntheticFile> {
    let mut out = Vec::with_capacity(n);
    let movies = n * 35 / 100;
    for i in 0..movies {
        let title = title_for(i * 7 + 3);
        let year = 1980 + (i % 45);
        let res = RESOLUTIONS[i % RESOLUTIONS.len()];
        let src = SOURCES[i % SOURCES.len()];
        let codec = CODECS[i % CODECS.len()];
        let group = GROUPS[i % GROUPS.len()];
        let dotted = title.replace(' ', ".");
        let filename = format!("{dotted}.{year}.{res}.{src}.{codec}-{group}.mkv");
        out.push(SyntheticFile {
            path: format!("/media/Peliculas/{title} ({year})/{filename}"),
            filename,
            size: 4_000_000_000 + (i as u64 * 7919) % 20_000_000_000,
        });
    }
    let mut show = 0usize;
    while out.len() < n {
        let title = title_for(show * 13 + 50_000);
        let dotted = title.replace(' ', ".");
        let episodes = 8 + (show * 17) % 53;
        let res = RESOLUTIONS[show % RESOLUTIONS.len()];
        let group = GROUPS[show % GROUPS.len()];
        for e in 0..episodes {
            if out.len() >= n {
                break;
            }
            let season = 1 + e / 10;
            let ep = 1 + e % 10;
            let filename = format!("{dotted}.S{season:02}E{ep:02}.{res}.WEB-DL.x264-{group}.mkv");
            out.push(SyntheticFile {
                path: format!("/media/Series/{title}/Season {season}/{filename}"),
                filename,
                size: 1_500_000_000 + (e as u64 * 104_729) % 2_000_000_000,
            });
        }
        show += 1;
    }
    out
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

fn rss_kb() -> Option<u64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    status
        .lines()
        .find(|l| l.starts_with("VmRSS:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse().ok())
}

#[test]
#[ignore]
fn perf_bench_large_library() {
    let n: usize = std::env::var("BENCH_N").ok().and_then(|v| v.parse().ok()).unwrap_or(20_000);
    let dir = std::env::temp_dir().join(format!("boxteam-bench-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("bench dir");
    let db = Db::open_at_for_tests(&dir.join("library.db"));
    let root = "/media";

    let files = synthetic_files(n);
    let t = Instant::now();
    let parsed: Vec<_> = files
        .iter()
        .map(|f| crate::parser::parse_media_path(&f.path, &f.filename))
        .collect();
    let parse_ms = ms(t);

    let index_pass = |label: &str| {
        let t = Instant::now();
        db.begin_batch().expect("begin");
        let mut keys = std::collections::HashSet::new();
        let mut needs = 0usize;
        for (f, p) in files.iter().zip(parsed.iter()) {
            let media_type = if p.season.is_some() { "tv" } else { "movie" };
            let r = db
                .upsert_media(&f.path, &f.filename, Some(f.size), p, Some(media_type), None, root)
                .expect("upsert");
            if r.needs_metadata {
                needs += 1;
                keys.insert(crate::commands::tmdb_lookup_key(&p.title, p.year, media_type));
            }
        }
        db.commit_batch().expect("commit");
        let elapsed = ms(t);
        println!(
            "[bench] {label}: {elapsed:.0} ms ({:.1} µs/file) · needs TMDB: {needs} files → {} distinct lookups",
            elapsed * 1000.0 / n as f64,
            keys.len()
        );
        elapsed
    };

    let first = index_pass("first index");

    // Simulate TMDB enrichment so the payload has realistic size.
    {
        let t = Instant::now();
        db.fill_synthetic_metadata_for_tests().expect("fill metadata");
        println!("[bench] synthetic metadata fill: {:.0} ms", ms(t));
    }

    let second = index_pass("re-index (no changes)");

    let paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
    let t = Instant::now();
    let removed = db.delete_media_missing_from_scan(&paths).expect("cleanup");
    let cleanup = ms(t);

    let rss_before = rss_kb().unwrap_or(0);
    let mut get_all = f64::MAX;
    let mut ser = f64::MAX;
    let mut bytes = 0usize;
    let mut payload = Vec::new();
    for _ in 0..3 {
        let t = Instant::now();
        let items = db.get_all_media().expect("get_all_media");
        get_all = get_all.min(ms(t));
        let t = Instant::now();
        payload = serde_json::to_vec(&items).expect("serialize");
        ser = ser.min(ms(t));
        bytes = payload.len();
    }
    let rss_after = rss_kb().unwrap_or(0);

    println!("[bench] N = {n}");
    println!("[bench] parse: {parse_ms:.0} ms");
    println!("[bench] first index: {first:.0} ms");
    println!("[bench] re-index: {second:.0} ms");
    println!("[bench] stale cleanup: {cleanup:.0} ms (removed {removed})");
    println!("[bench] get_all_media: {get_all:.0} ms");
    println!("[bench] JSON serialize: {ser:.0} ms, {:.1} MB", bytes as f64 / 1_048_576.0);
    println!("[bench] RSS: {} MB → {} MB", rss_before / 1024, rss_after / 1024);

    if let Ok(out) = std::env::var("BENCH_JSON_OUT") {
        std::fs::write(&out, &payload).expect("write json");
        println!("[bench] wrote {out}");
    }
    let _ = std::fs::remove_dir_all(&dir);
}
