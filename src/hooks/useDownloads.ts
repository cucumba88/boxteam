import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  addUnique,
  createSpeedTracker,
} from "../features/transfers/speedTracker";
import { call, isTauri } from "../lib/transport";

export interface DownloadItem {
  id: number;
  ftp_path: string;
  filename: string;
  local_path: string;
  media_title?: string;
  status: "queued" | "downloading" | "done" | "error" | "cancelled";
  bytes_total: number;
  bytes_done: number;
  error?: string;
  added_at_ms?: number;
  started_at_ms?: number;
  completed_at_ms?: number;
  speed_bps?: number; // computed in hook
}

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const tracker = useRef(createSpeedTracker()).current;
  const isActive = (item: DownloadItem) => item.status === "downloading";
  const mergeSnapshot = (fresh: DownloadItem[]) =>
    setDownloads((current) => tracker.onSnapshot(fresh, current, isActive, isTauri()));

  useEffect(() => {
    call<DownloadItem[]>("get_downloads")
      .then(mergeSnapshot)
      .catch(console.error);

    // Keep desktop and web views converged even when actions are triggered
    // from a different client (e.g., browser updates while desktop is open).
    const syncTimer = window.setInterval(() => {
      call<DownloadItem[]>("get_downloads")
        .then(mergeSnapshot)
        .catch(() => {});
    }, 1200);

    if (!isTauri()) {
      return () => window.clearInterval(syncTimer);
    }

    const unAdded = listen<DownloadItem>("download:added", ({ payload }) => {
      setDownloads((prev) => addUnique(prev, payload));
    });

    const unUpdate = listen<Partial<DownloadItem> & { id: number }>(
      "download:update",
      ({ payload }) => {
        setDownloads((prev) =>
          prev.map((d) => (d.id === payload.id ? { ...d, ...payload } : d)),
        );
        // Clear speed when no longer downloading
        if (payload.status && payload.status !== "downloading") {
          tracker.reset(payload.id);
        }
      },
    );

    const unProgress = listen<{
      id: number;
      bytes_done: number;
      bytes_total: number;
      timestamp_ms: number;
    }>("download:progress", ({ payload }) => {
      const speed_bps = tracker.onEvent(
        payload.id,
        payload.bytes_done,
        payload.timestamp_ms,
      );
      setDownloads((prev) =>
        prev.map((d) =>
          d.id === payload.id
            ? {
                ...d,
                bytes_done: payload.bytes_done,
                bytes_total: payload.bytes_total,
                ...(speed_bps != null ? { speed_bps } : {}),
              }
            : d,
        ),
      );
    });

    return () => {
      window.clearInterval(syncTimer);
      unAdded.then((f) => f());
      unUpdate.then((f) => f());
      unProgress.then((f) => f());
    };
  }, []);

  const cancelDownload = (id: number) => call("cancel_download", { id });
  const retryDownload = (id: number) => call("retry_download", { id });
  const openDownloadFolder = (localPath: string) => {
    if (!isTauri()) {
      return Promise.reject(new Error("Open folder is only available in desktop app"));
    }
    return call("open_download_folder", { localPath });
  };
  const deleteDownload = (id: number) =>
    call("delete_download", { id }).then(() =>
      setDownloads((prev) => prev.filter((d) => d.id !== id)),
    );
  const clearCompleted = () =>
    call("clear_completed").then(() =>
      setDownloads((prev) =>
        prev.filter((d) => !["done", "error", "cancelled"].includes(d.status)),
      ),
    );

  return {
    downloads,
    cancelDownload,
    clearCompleted,
    retryDownload,
    openDownloadFolder,
    deleteDownload,
  };
}
