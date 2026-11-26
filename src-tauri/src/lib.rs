mod analysis;
mod commands;
mod db;
mod downloads;
mod env_compat;
mod ftp;
mod omdb;
mod parser;
#[cfg(test)]
mod perf_bench;
mod telegram;
mod upload_notify;
mod tmdb;
mod tvdb;
mod uploads;
mod watchlist_quality;
mod web;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

struct TrayState(Mutex<Option<TrayIcon>>);

#[derive(Default)]
pub(crate) struct WatchdogWindowState {
    awaiting_nonce: Option<u64>,
    recovered_once: bool,
}

pub(crate) struct WatchdogState(pub(crate) Mutex<HashMap<String, WatchdogWindowState>>);

/// Global flag that tracks whether an FTP index pass is currently running.
/// Set/cleared by `start_indexing_internal`; read by the WEBGUI status endpoint.
pub static INDEXING_RUNNING: std::sync::LazyLock<Arc<std::sync::atomic::AtomicBool>> =
    std::sync::LazyLock::new(|| Arc::new(std::sync::atomic::AtomicBool::new(false)));

/// Broadcast channel for WebSocket push events (web-GUI mode).
/// Sender is cloned into each spawned task / handler. Receivers are created
/// per connected WebSocket client. Messages are JSON strings shaped as
/// `{"event": "index:complete", "payload": {...}}`.
pub static WS_TX: std::sync::LazyLock<tokio::sync::broadcast::Sender<String>> =
    std::sync::LazyLock::new(|| tokio::sync::broadcast::channel::<String>(256).0);

/// Push a named event to all connected WebSocket clients.
/// No-op when no clients are connected (send error is silently ignored).
pub fn ws_broadcast(event: &str, payload: serde_json::Value) {
    let msg = serde_json::json!({"event": event, "payload": payload}).to_string();
    crate::WS_TX.send(msg).ok();
}

static WATCHDOG_NONCE: AtomicU64 = AtomicU64::new(1);

fn schedule_window_watchdog(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let nonce = WATCHDOG_NONCE.fetch_add(1, Ordering::SeqCst);
    let label = window.label().to_string();

    {
        let watchdog = app.state::<WatchdogState>();
        let mut guard = watchdog.0.lock().unwrap();
        let state = guard.entry(label.clone()).or_default();
        state.awaiting_nonce = Some(nonce);
    }

    window
        .emit("watchdog:ping", serde_json::json!({ "nonce": nonce }))
        .ok();

    let app_handle = app.clone();
    let window_clone = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(5000)).await;

        let should_recover = {
            let watchdog = app_handle.state::<WatchdogState>();
            let mut guard = watchdog.0.lock().unwrap();
            let state = guard.entry(label.clone()).or_default();
            if state.awaiting_nonce == Some(nonce) {
                state.awaiting_nonce = None;
                if state.recovered_once {
                    false
                } else {
                    state.recovered_once = true;
                    true
                }
            } else {
                false
            }
        };

        if should_recover {
            window_clone.eval("window.location.reload();").ok();
        }
    });
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.unminimize().ok();
        window.show().ok();
        window.set_focus().ok();
        schedule_window_watchdog(app, &window);
    }
}

fn visible_main_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    let window = app.get_webview_window("main")?;
    if window.is_visible().ok()? {
        Some(window)
    } else {
        None
    }
}

/// Background jobs only stream their per-item events (`index:progress`,
/// `index:update`, `index:complete`…) to a *visible* main window. When the app
/// sits in the tray or is minimised, the library rows change in SQLite but the
/// already-loaded frontend never hears about it and keeps showing the old list
/// until a restart. After a run that had no window to talk to, send this one
/// cheap event to the (hidden) main window so it reloads the list from the DB.
fn notify_library_refreshed(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.emit("library:refreshed", serde_json::json!({})).ok();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(db::Db::new().expect("Failed to init SQLite"))
        .manage(Arc::new(Mutex::new(downloads::DownloadQueue::new(2))) as downloads::SharedQueue)
        .manage(Arc::new(Mutex::new(uploads::UploadQueue::new(2))) as uploads::SharedUploadQueue)
        .manage(TrayState(Mutex::new(None)))
        .manage(WatchdogState(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::ftp_list_raw,
            commands::test_ftp_connection,
            commands::test_tmdb_key,
            commands::test_omdb_key,
            commands::test_tvdb_key,
            commands::refresh_all_ratings,
            commands::test_emby_connection,
            commands::test_plex_connection,
            commands::save_config,
            commands::get_webgui_config,
            commands::save_webgui_config,
            commands::init_webgui_now,
            commands::has_config,
            commands::get_applied_migrations,
            commands::export_library_backup,
            commands::import_library_backup,
            commands::get_db_path,
            commands::init_db_path,
            commands::set_db_path,
            commands::is_portable_mode,
            commands::app_update_supported,
            commands::reset_db_path,
            commands::get_all_media,
            commands::get_media_overview,
            commands::start_indexing,
            commands::get_indexing_status,
            commands::rematch_all,
            commands::queue_download,
            commands::get_downloads,
            commands::cancel_download,
            commands::clear_completed,
            commands::delete_download,
            commands::set_max_concurrent,
            commands::retry_download,
            commands::open_download_folder,
            commands::search_tmdb,
            commands::apply_tmdb_match,
            commands::clear_item_metadata,
            commands::clear_show_metadata,
            commands::clear_all_metadata,
            commands::reset_library,
            commands::factory_reset,
            commands::refresh_all_metadata,
            commands::refresh_watch_providers,
            commands::check_media_badges,
            commands::ftp_list_root_dirs,
            commands::ftp_list_root_dirs_preview,
            commands::watchdog_pong,
            commands::quit_app,
            commands::get_watchlist,
            commands::add_to_watchlist,
            commands::remove_from_watchlist,
            commands::update_watchlist_item,
            commands::check_watchlist_item,
            commands::get_watchlist_coverage,
            commands::get_tv_seasons,
            commands::get_quality_profiles,
            commands::create_quality_profile,
            commands::update_quality_profile,
            commands::delete_quality_profile,
            commands::check_ffprobe,
            commands::install_ffprobe,
            commands::analyze_local_file,
            commands::list_local_video_files,
            commands::check_ftp_write_permission,
            commands::get_ftp_permissions,
            commands::suggest_upload_destination,
            commands::ftp_list_dir,
            commands::generate_upload_filename,
            commands::queue_upload,
            commands::get_uploads,
            commands::cancel_upload,
            commands::retry_upload,
            commands::retry_group_uploads,
            commands::retry_all_failed_uploads,
            commands::delete_upload,
            commands::clear_completed_uploads,
            commands::stat_local_files,
            commands::test_smtp,
            commands::test_telegram,
            commands::test_telegram_upload_sample,
            commands::detect_telegram_chat,
            commands::check_telegram_setup,
            commands::get_telegram_sub,
            commands::link_telegram_bot,
            commands::update_telegram_sub,
            commands::revoke_telegram_sub,
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                let window_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    let db = app.state::<db::Db>().inner().clone();
                    let close_to_tray = db.load_config()
                        .map(|c| c.close_to_tray)
                        .unwrap_or(true);
                    if close_to_tray {
                        window_clone.hide().ok();
                        return;
                    }
                    // close_to_tray is off: check for active downloads before quitting
                    let active_count = {
                        let shared = app.state::<downloads::SharedQueue>();
                        let queue = shared.lock().unwrap();
                        queue.items.iter().filter(|i| matches!(
                            i.status,
                            downloads::DownloadStatus::Queued | downloads::DownloadStatus::Downloading
                        )).count()
                    };
                    if active_count > 0 {
                        // Show the window so the dialog is visible, then emit
                        window_clone.show().ok();
                        window_clone.set_focus().ok();
                        window_clone.emit(
                            "app:quit-requested",
                            serde_json::json!({ "active": active_count }),
                        ).ok();
                    } else {
                        app.exit(0);
                    }
                });
            }
        })
        .setup(|app| {
            let show = MenuItem::with_id(app, "tray_show", "Open BoxTeam", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show, &quit])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app_handle: &tauri::AppHandle, event| match event.id.as_ref() {
                    "tray_show" => {
                        show_main_window(app_handle);
                    }
                    "tray_quit" => {
                        let active_count = {
                            let shared = app_handle.state::<downloads::SharedQueue>();
                            let queue = shared.lock().unwrap();
                            queue.items.iter().filter(|i| matches!(
                                i.status,
                                downloads::DownloadStatus::Queued | downloads::DownloadStatus::Downloading
                            )).count()
                        };
                        if active_count > 0 {
                            show_main_window(app_handle);
                            if let Some(w) = app_handle.get_webview_window("main") {
                                w.emit(
                                    "app:quit-requested",
                                    serde_json::json!({ "active": active_count }),
                                ).ok();
                            }
                        } else {
                            app_handle.exit(0);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray_icon: &TrayIcon, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray_icon.app_handle().get_webview_window("main") {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                window.hide().ok();
                            } else {
                                show_main_window(tray_icon.app_handle());
                            }
                        }
                    }
                })
                ;

            // Explicitly set tray icon to avoid an invisible tray entry on Windows.
            let tray_icon = app.default_window_icon().cloned().or_else(|| {
                Some(tauri::include_image!("icons/32x32.png"))
            });
            if let Some(icon) = tray_icon {
                tray_builder = tray_builder.icon(icon);
            }

            let tray = tray_builder.build(app)?;
            *app.state::<TrayState>().0.lock().unwrap() = Some(tray);

            let db = app.state::<db::Db>().inner().clone();
            let queue = app.state::<downloads::SharedQueue>().inner().clone();
            // Apply the DB-stored max_concurrent_downloads to the runtime semaphore.
            // Without this, the queue is stuck at the hardcoded default (2) until the
            // user explicitly opens Settings and clicks Save — which means wizard-set
            // values and any prior preference are silently ignored across restarts.
            if let Ok(cfg) = db.load_config() {
                queue.lock().unwrap().update_concurrent(cfg.max_concurrent_downloads as usize);
            }
            // Spawn WEBGUI HTTP server if enabled in config
            web::spawn_if_enabled(db.clone(), queue.clone(), app.handle().clone());
            let current_version = app.package_info().version.to_string();

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let interval_secs = std::time::Duration::from_secs(15 * 60);
                let db = handle.state::<db::Db>().inner().clone();
                let queue = handle.state::<downloads::SharedQueue>().inner().clone();

                // Load ftp_root for path normalization. Falls back to "/" if config unavailable.
                let ftp_root = db.load_config()
                    .map(|c| c.ftp_root)
                    .unwrap_or_else(|_| "/".to_string());

                // Backfill ftp_relative_path for existing rows whose path starts with current root.
                if let Err(e) = db.populate_ftp_relative_paths(&ftp_root) {
                    eprintln!("ftp_relative_path backfill failed: {e}");
                }

                // Re-parse codec/resolution/audio_codec/hdr/release_type from the
                // stored ftp_path so that items indexed before the parent-folder
                // fallback was added get their tech tags populated.
                match db.reparse_tech_tags() {
                    Ok(n) if n > 0 => println!("Reparsed tech tags for {n} library items"),
                    Ok(_) => {}
                    Err(e) => eprintln!("reparse_tech_tags failed: {e}"),
                }

                // One-shot repair: rows that hit the old "leading 4-digit number
                // parsed as the year" bug got an empty title and a garbage TMDB
                // match (sometimes manual-locked). Re-parse + drop the bad match
                // so they re-match cleanly. Runs once per install.
                match db.clear_leading_year_mismatches() {
                    Ok(n) if n > 0 => {
                        println!("Cleared {n} mis-parsed leading-year TMDB match(es)")
                    }
                    Ok(_) => {}
                    Err(e) => eprintln!("clear_leading_year_mismatches failed: {e}"),
                }

                if let Ok(Some(backup_path)) = db.prepare_for_app_version(&current_version) {
                    println!(
                        "App updated to v{}; preserved existing library cache backup at {}",
                        current_version, backup_path
                    );
                }
                // One-shot repair: titles that fell back to a category folder
                // ("Peliculas") or were cut at a word-like tag ("¿Por Qué…").
                // The metadata refresh below re-matches the rows it unmatched.
                match db.repair_misparsed_titles() {
                    Ok(n) if n > 0 => println!("Repaired {n} mis-parsed title(s)"),
                    Ok(_) => {}
                    Err(e) => eprintln!("repair_misparsed_titles failed: {e}"),
                }
                // One-shot: files with "{tmdb-…}" / "{imdb-tt…}" in the name
                // indexed before matching read those tags skip the one-day
                // no-match wait (or drop a wrong match); the metadata refresh
                // below fetches the tagged entry.
                match db.rematch_tagged_files() {
                    Ok(n) if n > 0 => println!("Queued {n} id-tagged file(s) for re-match"),
                    Ok(_) => {}
                    Err(e) => eprintln!("rematch_tagged_files failed: {e}"),
                }
                commands::restore_download_queue(db.clone(), queue.clone());
                commands::restore_upload_queue(db.clone(), handle.state::<uploads::SharedUploadQueue>().inner().clone());

                // Resume downloads and refresh metadata regardless of window visibility
                // so the app works correctly in background (tray) and headless mode.
                commands::resume_pending_downloads(db.clone(), queue.clone(), visible_main_window(&handle)).await.ok();
                commands::resume_pending_uploads(db.clone(), handle.state::<uploads::SharedUploadQueue>().inner().clone(), handle.clone()).await.ok();
                commands::refresh_all_metadata_internal(db.clone(), visible_main_window(&handle), commands::MetadataRefreshMode::Auto).await.ok();
                // Auto-enrich ratings (IMDb via OMDb + TVDB) for any rows that
                // are missing them. The job is sequential, throttled per
                // service, and skips items that already have both — so it's a
                // cheap no-op when everything's up to date. Errors are
                // silently swallowed (e.g. neither key is configured).
                {
                    let db_clone = db.clone();
                    let window = visible_main_window(&handle);
                    let handle_clone = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let silent = window.is_none();
                        commands::refresh_all_ratings_internal(db_clone, window, commands::RatingsRefreshMode::Auto).await.ok();
                        if silent { notify_library_refreshed(&handle_clone); }
                    });
                }
                // Auto-backfill streaming-platform availability for any
                // TMDB-matched rows still missing it. Grouped by tmdb_id so a
                // whole series is one HTTP call; no-ops when fully populated.
                // Errors are swallowed (TMDB key missing, network blip, etc.).
                {
                    let db_clone = db.clone();
                    let window = visible_main_window(&handle);
                    let handle_clone = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let silent = window.is_none();
                        commands::refresh_watch_providers_internal(db_clone, window).await.ok();
                        if silent { notify_library_refreshed(&handle_clone); }
                    });
                }
                let last_indexed_at = db.load_last_indexed_at().ok().flatten();
                let should_run_now = last_indexed_at
                    .as_deref()
                    .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                    .and_then(|value| (chrono::Utc::now() - value.with_timezone(&chrono::Utc)).to_std().ok())
                    .map(|elapsed| elapsed >= interval_secs)
                    .unwrap_or(true);

                if should_run_now {
                    let window = visible_main_window(&handle);
                    // Skip if a manual index (desktop or web) already runs.
                    if let Some(guard) = commands::IndexingGuard::try_acquire() {
                        let silent = window.is_none();
                        commands::start_indexing_internal(db.clone(), window.clone(), Some(queue.clone())).await.ok();
                        drop(guard);
                        commands::refresh_all_metadata_internal(db.clone(), window, commands::MetadataRefreshMode::Auto).await.ok();
                        if silent { notify_library_refreshed(&handle); }
                    }
                } else if let Some(value) = last_indexed_at
                    .as_deref()
                    .and_then(|raw| chrono::DateTime::parse_from_rfc3339(raw).ok())
                    .and_then(|raw| (chrono::Utc::now() - raw.with_timezone(&chrono::Utc)).to_std().ok())
                {
                    tokio::time::sleep(interval_secs.saturating_sub(value)).await;
                }

                loop {
                    // Compute how long until 15 minutes after the last index run
                    // (whether that was manual or automatic).
                    let sleep_duration = db.load_last_indexed_at()
                        .ok()
                        .flatten()
                        .and_then(|raw| chrono::DateTime::parse_from_rfc3339(&raw).ok())
                        .and_then(|last| {
                            let elapsed = (chrono::Utc::now() - last.with_timezone(&chrono::Utc))
                                .to_std()
                                .ok()?;
                            interval_secs.checked_sub(elapsed)
                        })
                        .unwrap_or(interval_secs);

                    tokio::time::sleep(sleep_duration).await;

                    // Re-check after waking: a manual index that ran while we slept would
                    // have updated last_indexed_at, so the 15 min window resets from there.
                    let elapsed_since_last = db.load_last_indexed_at()
                        .ok()
                        .flatten()
                        .and_then(|raw| chrono::DateTime::parse_from_rfc3339(&raw).ok())
                        .and_then(|last| {
                            (chrono::Utc::now() - last.with_timezone(&chrono::Utc))
                                .to_std()
                                .ok()
                        });
                    if elapsed_since_last.map(|e| e < interval_secs).unwrap_or(false) {
                        // A recent index (likely manual) happened — skip this tick.
                        continue;
                    }

                    let window = visible_main_window(&handle);
                    // A manual index is running right now: it updates
                    // last_indexed_at when done, so just wait for the next tick.
                    let Some(guard) = commands::IndexingGuard::try_acquire() else {
                        continue;
                    };
                    let silent = window.is_none();
                    commands::start_indexing_internal(db.clone(), window.clone(), Some(queue.clone())).await.ok();
                    drop(guard);
                    commands::refresh_all_metadata_internal(db.clone(), window.clone(), commands::MetadataRefreshMode::Auto).await.ok();
                    if silent { notify_library_refreshed(&handle); }
                    // Top up missing IMDb / TVDB ratings on every cycle.
                    // The internal guard prevents this from stacking if a
                    // previous tick is still running.
                    {
                        let db_clone = db.clone();
                        let win_clone = window.clone();
                        let handle_clone = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let silent = win_clone.is_none();
                            commands::refresh_all_ratings_internal(db_clone, win_clone, commands::RatingsRefreshMode::Auto).await.ok();
                            if silent { notify_library_refreshed(&handle_clone); }
                        });
                    }
                    // Top up missing watch-providers on every cycle too.
                    {
                        let db_clone = db.clone();
                        let win_clone = window;
                        let handle_clone = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let silent = win_clone.is_none();
                            commands::refresh_watch_providers_internal(db_clone, win_clone).await.ok();
                            if silent { notify_library_refreshed(&handle_clone); }
                        });
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
