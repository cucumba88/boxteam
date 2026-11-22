use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Done,
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: u64,
    pub ftp_path: String,
    pub filename: String,
    pub local_path: String,
    pub media_title: Option<String>,
    pub status: DownloadStatus,
    pub bytes_total: u64,
    pub bytes_done: u64,
    pub error: Option<String>,
    pub added_at_ms: u64,
    pub started_at_ms: Option<u64>,
    pub completed_at_ms: Option<u64>,
    /// User who asked for this download (0 = desktop user, web users by id).
    /// Used for the personal Telegram "tus descargas" notice. `None` for
    /// automatic downloads and items saved by older versions.
    #[serde(default)]
    pub requested_by: Option<i64>,
}

pub struct DownloadQueue {
    pub items: Vec<DownloadItem>,
    pub next_id: u64,
    pub max_concurrent: usize,
    pub semaphore: Arc<tokio::sync::Semaphore>,
    pub cancel_flags: std::collections::HashMap<u64, Arc<std::sync::atomic::AtomicBool>>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

impl DownloadQueue {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            items: Vec::new(),
            next_id: 1,
            max_concurrent,
            semaphore: Arc::new(tokio::sync::Semaphore::new(max_concurrent)),
            cancel_flags: std::collections::HashMap::new(),
        }
    }

    pub fn add(
        &mut self,
        ftp_path: String,
        filename: String,
        local_path: String,
        media_title: Option<String>,
    ) -> (u64, Arc<tokio::sync::Semaphore>, Arc<std::sync::atomic::AtomicBool>) {
        let id = self.next_id;
        self.next_id += 1;
        let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        self.cancel_flags.insert(id, cancel_flag.clone());
        self.items.push(DownloadItem {
            id,
            ftp_path,
            filename,
            local_path,
            media_title,
            status: DownloadStatus::Queued,
            bytes_total: 0,
            bytes_done: 0,
            error: None,
            added_at_ms: now_ms(),
            started_at_ms: None,
            completed_at_ms: None,
            requested_by: None,
        });
        (id, self.semaphore.clone(), cancel_flag)
    }

    pub fn set_requested_by(&mut self, id: u64, user_id: i64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.requested_by = Some(user_id);
        }
    }

    pub fn restore(&mut self, mut items: Vec<DownloadItem>) {
        self.cancel_flags.clear();
        let mut next_id = 1;

        for item in &mut items {
            if matches!(item.status, DownloadStatus::Queued | DownloadStatus::Downloading) {
                item.status = DownloadStatus::Queued;
                item.error = None;
                item.started_at_ms = None;
                item.completed_at_ms = None;
                item.bytes_done = std::fs::metadata(&item.local_path).map(|meta| meta.len()).unwrap_or(0);
            }
            next_id = next_id.max(item.id + 1);
            if matches!(item.status, DownloadStatus::Queued | DownloadStatus::Downloading) {
                self.cancel_flags.insert(item.id, Arc::new(std::sync::atomic::AtomicBool::new(false)));
            }
        }

        self.items = items;
        self.next_id = next_id;
    }

    pub fn retry(&mut self, id: u64) -> Result<(DownloadItem, Arc<tokio::sync::Semaphore>, Arc<std::sync::atomic::AtomicBool>), String> {
        let item = self.items.iter_mut().find(|item| item.id == id).ok_or("Download not found")?;
        item.status = DownloadStatus::Queued;
        item.error = None;
        item.started_at_ms = None;
        item.completed_at_ms = None;
        item.bytes_done = std::fs::metadata(&item.local_path).map(|meta| meta.len()).unwrap_or(0);
        let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        self.cancel_flags.insert(id, cancel_flag.clone());
        Ok((item.clone(), self.semaphore.clone(), cancel_flag))
    }

    pub fn mark_started(&mut self, id: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Downloading;
            item.started_at_ms = Some(now_ms());
        }
    }

    pub fn mark_done(&mut self, id: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Done;
            item.completed_at_ms = Some(now_ms());
        }
    }

    pub fn mark_error(&mut self, id: u64, error: String) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Error;
            item.error = Some(error);
            item.completed_at_ms = Some(now_ms());
        }
    }

    pub fn mark_cancelled(&mut self, id: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Cancelled;
            item.completed_at_ms = Some(now_ms());
        }
    }

    pub fn cancel(&mut self, id: u64) {
        if let Some(flag) = self.cancel_flags.get(&id) {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            if matches!(item.status, DownloadStatus::Queued | DownloadStatus::Downloading) {
                item.status = DownloadStatus::Cancelled;
                item.error = None;
                item.completed_at_ms = Some(now_ms());
            }
        }
    }

    pub fn clear_completed(&mut self) {
        self.items.retain(|i| {
            !matches!(i.status, DownloadStatus::Done | DownloadStatus::Error | DownloadStatus::Cancelled)
        });
        self.cancel_flags.retain(|id, _| self.items.iter().any(|item| item.id == *id));
    }

    pub fn delete(&mut self, id: u64) {
        self.items.retain(|i| i.id != id);
        self.cancel_flags.remove(&id);
    }

    pub fn update_concurrent(&mut self, max: usize) {
        self.max_concurrent = max;
        self.semaphore = Arc::new(tokio::sync::Semaphore::new(max));
    }

    /// Returns the id of an existing download for the given FTP path if it is
    /// currently `Queued` or `Downloading`. Used to prevent duplicate entries.
    pub fn find_active_by_ftp_path(&self, ftp_path: &str) -> Option<u64> {
        self.items.iter().find(|i| {
            i.ftp_path == ftp_path
                && matches!(i.status, DownloadStatus::Queued | DownloadStatus::Downloading)
        }).map(|i| i.id)
    }
}

pub type SharedQueue = Arc<Mutex<DownloadQueue>>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    fn queue_with(paths: &[&str]) -> DownloadQueue {
        let mut q = DownloadQueue::new(2);
        for p in paths {
            q.add(p.to_string(), format!("{p}.mkv"), format!("/nonexistent/boxteam-test/{p}.mkv"), None);
        }
        q
    }

    fn status(q: &DownloadQueue, id: u64) -> DownloadStatus {
        q.items.iter().find(|i| i.id == id).map(|i| i.status.clone()).expect("item")
    }

    #[test]
    fn ids_are_sequential_and_items_start_queued() {
        let q = queue_with(&["a", "b"]);
        assert_eq!(q.items.iter().map(|i| i.id).collect::<Vec<_>>(), vec![1, 2]);
        assert_eq!(q.next_id, 3);
        assert!(q.items.iter().all(|i| i.status == DownloadStatus::Queued));
        assert_eq!(q.cancel_flags.len(), 2);
    }

    #[test]
    fn lifecycle_sets_status_and_timestamps() {
        let mut q = queue_with(&["a", "b"]);
        q.mark_started(1);
        assert_eq!(status(&q, 1), DownloadStatus::Downloading);
        assert!(q.items[0].started_at_ms.is_some());
        q.mark_done(1);
        assert_eq!(status(&q, 1), DownloadStatus::Done);
        assert!(q.items[0].completed_at_ms.is_some());
        q.mark_error(2, "530 Login incorrect".into());
        assert_eq!(status(&q, 2), DownloadStatus::Error);
        assert_eq!(q.items[1].error.as_deref(), Some("530 Login incorrect"));
    }

    #[test]
    fn cancel_sets_the_flag_and_only_cancels_active_items() {
        let mut q = queue_with(&["a", "b"]);
        let flag = q.cancel_flags.get(&1).cloned().expect("flag");
        q.cancel(1);
        assert!(flag.load(Ordering::SeqCst));
        assert_eq!(status(&q, 1), DownloadStatus::Cancelled);

        q.mark_done(2);
        q.cancel(2);
        assert_eq!(status(&q, 2), DownloadStatus::Done, "a finished download stays done");
    }

    #[test]
    fn retry_resets_the_item_with_a_fresh_cancel_flag() {
        let mut q = queue_with(&["a"]);
        q.cancel(1);
        let old = q.cancel_flags.get(&1).cloned().expect("flag");
        let (item, _, flag) = q.retry(1).expect("retry");
        assert_eq!(item.status, DownloadStatus::Queued);
        assert!(item.error.is_none() && item.started_at_ms.is_none() && item.completed_at_ms.is_none());
        assert!(!flag.load(Ordering::SeqCst), "new flag is not cancelled");
        assert!(old.load(Ordering::SeqCst));
        assert!(q.retry(99).is_err());
    }

    #[test]
    fn clear_completed_keeps_active_items_and_their_flags() {
        let mut q = queue_with(&["a", "b", "c", "d"]);
        q.mark_done(1);
        q.mark_error(2, "x".into());
        q.cancel(3);
        q.clear_completed();
        assert_eq!(q.items.iter().map(|i| i.id).collect::<Vec<_>>(), vec![4]);
        assert_eq!(q.cancel_flags.keys().copied().collect::<Vec<_>>(), vec![4]);
    }

    #[test]
    fn find_active_by_ftp_path_ignores_finished_items() {
        let mut q = queue_with(&["a", "b"]);
        assert_eq!(q.find_active_by_ftp_path("a"), Some(1));
        q.mark_done(1);
        assert_eq!(q.find_active_by_ftp_path("a"), None);
        assert_eq!(q.find_active_by_ftp_path("zzz"), None);
    }

    #[test]
    fn restore_requeues_interrupted_items_and_continues_ids() {
        let mut old = queue_with(&["a", "b", "c"]);
        old.mark_started(1);
        old.mark_done(2);
        let saved = old.items.clone();

        let mut q = DownloadQueue::new(2);
        q.restore(saved);
        assert_eq!(status(&q, 1), DownloadStatus::Queued);
        assert!(q.items[0].started_at_ms.is_none());
        assert_eq!(q.items[0].bytes_done, 0, "no partial file on disk");
        assert_eq!(status(&q, 2), DownloadStatus::Done);
        assert_eq!(q.next_id, 4);
        assert!(q.cancel_flags.contains_key(&1) && q.cancel_flags.contains_key(&3));
        assert!(!q.cancel_flags.contains_key(&2));
    }

    #[test]
    fn delete_and_concurrency() {
        let mut q = queue_with(&["a", "b"]);
        q.delete(1);
        assert_eq!(q.items.len(), 1);
        assert!(!q.cancel_flags.contains_key(&1));
        q.update_concurrent(5);
        assert_eq!(q.max_concurrent, 5);
        assert_eq!(q.semaphore.available_permits(), 5);
    }

    #[test]
    fn old_saved_items_without_requested_by_still_load() {
        let json = r#"{"id":7,"ftp_path":"/a","filename":"a.mkv","local_path":"/x/a.mkv","media_title":null,
            "status":"done","bytes_total":10,"bytes_done":10,"error":null,"added_at_ms":1,
            "started_at_ms":null,"completed_at_ms":null}"#;
        let item: DownloadItem = serde_json::from_str(json).expect("legacy item");
        assert_eq!(item.status, DownloadStatus::Done);
        assert_eq!(item.requested_by, None);
    }
}
