use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UploadStatus {
    Queued,
    Uploading,
    Done,
    Error,
    Cancelled,
}

fn default_max_attempts() -> u8 { 3 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadItem {
    pub id: u64,
    pub local_path: String,
    pub ftp_dest_path: String,
    pub filename: String,
    pub media_title: Option<String>,
    pub tmdb_id: Option<i64>,
    pub status: UploadStatus,
    pub bytes_total: u64,
    pub bytes_done: u64,
    pub error: Option<String>,
    pub added_at_ms: u64,
    pub started_at_ms: Option<u64>,
    pub completed_at_ms: Option<u64>,
    pub resolution: Option<String>,
    pub hdr: Option<String>,
    pub languages: Vec<String>,
    pub codec: Option<String>,
    pub video_bitrate_kbps: Option<u32>,
    pub audio_codec: Option<String>,
    /// Subtitle language codes detected by ffprobe (e.g. ["spa", "eng"]).
    #[serde(default)]
    pub subtitle_langs: Vec<String>,
    /// Full audio track info from ffprobe.
    #[serde(default)]
    pub audio_tracks: Vec<crate::analysis::AudioTrack>,
    /// Full subtitle track info from ffprobe.
    #[serde(default)]
    pub subtitle_tracks: Vec<crate::analysis::SubtitleTrack>,
    /// Optional group id linking all episodes from the same season batch upload.
    pub group_id: Option<String>,
    /// 0-based index of the current/most-recent upload attempt for this item.
    /// Reset to 0 by `retry(...)` and incremented by `mark_attempt(...)` when
    /// the spawned job decides to retry after a transient FTP error.
    #[serde(default)]
    pub attempt: u8,
    /// Maximum number of attempts the job will make before giving up.
    #[serde(default = "default_max_attempts")]
    pub max_attempts: u8,
    /// TMDB namespace of `tmdb_id` ("movie" | "tv"). Ids are only unique per
    /// namespace, so the Telegram card needs it to fetch the right title and
    /// poster. `None` for items queued before it was stored.
    #[serde(default)]
    pub media_type: Option<String>,
}

pub struct UploadQueue {
    pub items: Vec<UploadItem>,
    pub next_id: u64,
    pub semaphore: Arc<tokio::sync::Semaphore>,
    pub cancel_flags: std::collections::HashMap<u64, Arc<std::sync::atomic::AtomicBool>>,
    /// In-memory set of `group_id`s that have already received their
    /// season-complete Telegram notification. Prevents double-fires when
    /// multiple tasks race to observe `all_finished == true`. Not persisted —
    /// after a process restart, at-most-once becomes at-most-twice in the
    /// pathological crash-during-notify case, which is acceptable.
    pub notified_groups: std::collections::HashSet<String>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

impl UploadQueue {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            items: Vec::new(),
            next_id: 1,
            semaphore: Arc::new(tokio::sync::Semaphore::new(max_concurrent)),
            cancel_flags: std::collections::HashMap::new(),
            notified_groups: std::collections::HashSet::new(),
        }
    }

    pub fn add(
        &mut self,
        local_path: String,
        ftp_dest_path: String,
        filename: String,
        media_title: Option<String>,
        tmdb_id: Option<i64>,
        size_bytes: u64,
        resolution: Option<String>,
        hdr: Option<String>,
        languages: Vec<String>,
        codec: Option<String>,
        video_bitrate_kbps: Option<u32>,
        audio_codec: Option<String>,
        subtitle_langs: Vec<String>,
        audio_tracks: Vec<crate::analysis::AudioTrack>,
        subtitle_tracks: Vec<crate::analysis::SubtitleTrack>,
        group_id: Option<String>,
    ) -> (u64, Arc<tokio::sync::Semaphore>, Arc<std::sync::atomic::AtomicBool>) {
        let id = self.next_id;
        self.next_id += 1;
        let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        self.cancel_flags.insert(id, cancel_flag.clone());
        self.items.push(UploadItem {
            id,
            local_path,
            ftp_dest_path,
            filename,
            media_title,
            tmdb_id,
            status: UploadStatus::Queued,
            bytes_total: size_bytes,
            bytes_done: 0,
            error: None,
            added_at_ms: now_ms(),
            started_at_ms: None,
            completed_at_ms: None,
            resolution,
            hdr,
            languages,
            codec,
            video_bitrate_kbps,
            audio_codec,
            subtitle_langs,
            audio_tracks,
            subtitle_tracks,
            group_id,
            attempt: 0,
            max_attempts: default_max_attempts(),
            media_type: None,
        });
        (id, self.semaphore.clone(), cancel_flag)
    }

    pub fn retry(
        &mut self,
        id: u64,
    ) -> Result<(UploadItem, Arc<tokio::sync::Semaphore>, Arc<std::sync::atomic::AtomicBool>), String> {
        let item = self.items.iter_mut().find(|i| i.id == id).ok_or("Upload not found")?;
        // Keep the byte count of a failed upload: the job resumes from what the
        // server already has (see `ftp::upload_file`). A cancelled upload had
        // its remote file removed, so it starts over.
        if item.status != UploadStatus::Error {
            item.bytes_done = 0;
        }
        item.status = UploadStatus::Queued;
        item.error = None;
        item.started_at_ms = None;
        item.completed_at_ms = None;
        item.attempt = 0;
        if item.max_attempts == 0 {
            item.max_attempts = default_max_attempts();
        }
        let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        self.cancel_flags.insert(id, cancel_flag.clone());
        Ok((item.clone(), self.semaphore.clone(), cancel_flag))
    }

    pub fn mark_started(&mut self, id: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.status = UploadStatus::Uploading;
            item.started_at_ms = Some(now_ms());
        }
    }

    /// Record that the job for `id` is now on its `attempt`-th try (0-based).
    pub fn mark_attempt(&mut self, id: u64, attempt: u8) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.attempt = attempt;
        }
    }

    /// Record bytes sent so far (in memory; persisted with the next state change).
    pub fn set_progress(&mut self, id: u64, bytes_done: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            if item.status == UploadStatus::Uploading {
                item.bytes_done = bytes_done;
            }
        }
    }

    pub fn mark_done(&mut self, id: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.status = UploadStatus::Done;
            item.bytes_done = item.bytes_total;
            item.completed_at_ms = Some(now_ms());
        }
    }

    pub fn mark_error(&mut self, id: u64, error: String) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.status = UploadStatus::Error;
            item.error = Some(error);
            item.completed_at_ms = Some(now_ms());
        }
    }

    pub fn mark_cancelled(&mut self, id: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.status = UploadStatus::Cancelled;
            item.completed_at_ms = Some(now_ms());
        }
    }

    pub fn cancel(&mut self, id: u64) {
        if let Some(flag) = self.cancel_flags.get(&id) {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            if matches!(item.status, UploadStatus::Queued | UploadStatus::Uploading) {
                item.status = UploadStatus::Cancelled;
                item.error = None;
                item.completed_at_ms = Some(now_ms());
            }
        }
    }

    pub fn clear_completed(&mut self) {
        self.items.retain(|i| {
            !matches!(i.status, UploadStatus::Done | UploadStatus::Error | UploadStatus::Cancelled)
        });
        self.cancel_flags.retain(|id, _| self.items.iter().any(|item| item.id == *id));
    }

    pub fn delete(&mut self, id: u64) {
        self.items.retain(|i| i.id != id);
        self.cancel_flags.remove(&id);
    }

    /// Restore persisted items from a previous session.
    /// Items that were mid-upload are reset to Queued so they restart.
    /// Done / Error / Cancelled items are restored as-is for history.
    pub fn restore(&mut self, mut items: Vec<UploadItem>) {
        for item in &mut items {
            if item.status == UploadStatus::Uploading {
                item.status = UploadStatus::Queued;
                item.bytes_done = 0;
                item.started_at_ms = None;
            }
            // Ensure cancel flags exist for items that may be retried
            let flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
            self.cancel_flags.insert(item.id, flag);
            if item.id >= self.next_id {
                self.next_id = item.id + 1;
            }
        }
        self.items = items;
    }

    /// Sum of `bytes_total` for all items in a group.
    pub fn group_total_bytes(&self, group_id: &str) -> u64 {
        self.items.iter()
            .filter(|i| i.group_id.as_deref() == Some(group_id))
            .map(|i| i.bytes_total)
            .sum()
    }

    /// Check whether all uploads in a group are done (or errored/cancelled).
    /// Returns `(done_count, total_count, all_finished)`.
    pub fn group_status(&self, group_id: &str) -> (usize, usize, bool) {
        let group: Vec<&UploadItem> = self.items.iter()
            .filter(|i| i.group_id.as_deref() == Some(group_id))
            .collect();
        let total = group.len();
        let finished = group.iter().filter(|i| {
            matches!(i.status, UploadStatus::Done | UploadStatus::Error | UploadStatus::Cancelled)
        }).count();
        let done = group.iter().filter(|i| matches!(i.status, UploadStatus::Done)).count();
        (done, total, finished == total)
    }
}

pub type SharedUploadQueue = Arc<Mutex<UploadQueue>>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    fn add(q: &mut UploadQueue, name: &str, size: u64, group: Option<&str>) -> u64 {
        q.add(
            format!("/local/{name}"),
            format!("/ftp/{name}"),
            name.to_string(),
            None,
            None,
            size,
            None,
            None,
            vec![],
            None,
            None,
            None,
            vec![],
            vec![],
            vec![],
            group.map(String::from),
        )
        .0
    }

    fn item(q: &UploadQueue, id: u64) -> &UploadItem {
        q.items.iter().find(|i| i.id == id).expect("item")
    }

    #[test]
    fn new_items_are_queued_with_three_attempts() {
        let mut q = UploadQueue::new(1);
        let id = add(&mut q, "a.mkv", 100, None);
        let it = item(&q, id);
        assert_eq!(it.status, UploadStatus::Queued);
        assert_eq!((it.attempt, it.max_attempts), (0, 3));
        assert_eq!(it.bytes_total, 100);
    }

    #[test]
    fn progress_only_counts_while_uploading_and_done_fills_the_bar() {
        let mut q = UploadQueue::new(1);
        let id = add(&mut q, "a.mkv", 100, None);
        q.set_progress(id, 50);
        assert_eq!(item(&q, id).bytes_done, 0, "queued items don't move");
        q.mark_started(id);
        q.set_progress(id, 50);
        assert_eq!(item(&q, id).bytes_done, 50);
        q.mark_done(id);
        assert_eq!(item(&q, id).bytes_done, 100);
        assert_eq!(item(&q, id).status, UploadStatus::Done);
    }

    #[test]
    fn retry_after_error_resumes_but_after_cancel_starts_over() {
        let mut q = UploadQueue::new(1);
        let failed = add(&mut q, "a.mkv", 100, None);
        let cancelled = add(&mut q, "b.mkv", 100, None);
        for id in [failed, cancelled] {
            q.mark_started(id);
            q.set_progress(id, 40);
            q.mark_attempt(id, 2);
        }
        q.mark_error(failed, "timeout".into());
        q.cancel(cancelled);

        let (a, _, flag) = q.retry(failed).expect("retry");
        assert_eq!(a.bytes_done, 40, "resume from what the server has");
        assert_eq!(a.status, UploadStatus::Queued);
        assert_eq!(a.attempt, 0);
        assert!(a.error.is_none());
        assert!(!flag.load(Ordering::SeqCst));

        let (b, _, _) = q.retry(cancelled).expect("retry");
        assert_eq!(b.bytes_done, 0, "the remote file was removed on cancel");
        assert!(q.retry(99).is_err());
    }

    #[test]
    fn cancel_sets_the_flag_and_leaves_finished_items_alone() {
        let mut q = UploadQueue::new(1);
        let a = add(&mut q, "a.mkv", 1, None);
        let b = add(&mut q, "b.mkv", 1, None);
        let flag = q.cancel_flags.get(&a).cloned().expect("flag");
        q.cancel(a);
        assert!(flag.load(Ordering::SeqCst));
        assert_eq!(item(&q, a).status, UploadStatus::Cancelled);
        q.mark_done(b);
        q.cancel(b);
        assert_eq!(item(&q, b).status, UploadStatus::Done);
    }

    #[test]
    fn group_status_and_bytes() {
        let mut q = UploadQueue::new(2);
        let e1 = add(&mut q, "S01E01.mkv", 100, Some("g1"));
        let e2 = add(&mut q, "S01E02.mkv", 200, Some("g1"));
        let e3 = add(&mut q, "S01E03.mkv", 300, Some("g1"));
        add(&mut q, "movie.mkv", 999, None);

        assert_eq!(q.group_total_bytes("g1"), 600);
        assert_eq!(q.group_status("g1"), (0, 3, false));
        q.mark_done(e1);
        q.mark_error(e2, "x".into());
        assert_eq!(q.group_status("g1"), (1, 3, false));
        q.mark_done(e3);
        // Errors count as finished, not as done.
        assert_eq!(q.group_status("g1"), (2, 3, true));
    }

    #[test]
    fn restore_requeues_interrupted_uploads_from_zero() {
        let mut old = UploadQueue::new(1);
        let a = add(&mut old, "a.mkv", 100, None);
        let b = add(&mut old, "b.mkv", 100, None);
        old.mark_started(a);
        old.set_progress(a, 70);
        old.mark_done(b);
        let saved = old.items.clone();

        let mut q = UploadQueue::new(1);
        q.restore(saved);
        assert_eq!(item(&q, a).status, UploadStatus::Queued);
        assert_eq!(item(&q, a).bytes_done, 0);
        assert!(item(&q, a).started_at_ms.is_none());
        assert_eq!(item(&q, b).status, UploadStatus::Done);
        assert_eq!(q.next_id, 3);
        assert_eq!(q.cancel_flags.len(), 2);
    }

    #[test]
    fn clear_completed_and_delete() {
        let mut q = UploadQueue::new(1);
        let a = add(&mut q, "a.mkv", 1, None);
        let b = add(&mut q, "b.mkv", 1, None);
        let c = add(&mut q, "c.mkv", 1, None);
        q.mark_done(a);
        q.clear_completed();
        assert_eq!(q.items.iter().map(|i| i.id).collect::<Vec<_>>(), vec![b, c]);
        assert!(!q.cancel_flags.contains_key(&a));
        q.delete(b);
        assert_eq!(q.items.iter().map(|i| i.id).collect::<Vec<_>>(), vec![c]);
    }

    #[test]
    fn items_saved_by_older_versions_still_load() {
        let json = r#"{"id":3,"local_path":"/l/a.mkv","ftp_dest_path":"/f/a.mkv","filename":"a.mkv",
            "media_title":null,"tmdb_id":null,"status":"error","bytes_total":5,"bytes_done":2,
            "error":"x","added_at_ms":1,"started_at_ms":null,"completed_at_ms":null,
            "resolution":null,"hdr":null,"languages":[],"codec":null,"video_bitrate_kbps":null,
            "audio_codec":null,"group_id":null}"#;
        let it: UploadItem = serde_json::from_str(json).expect("legacy item");
        assert_eq!(it.max_attempts, 3);
        assert_eq!(it.attempt, 0);
        assert!(it.subtitle_langs.is_empty() && it.media_type.is_none());
    }
}
