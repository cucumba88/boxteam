import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  addUnique,
  createSpeedTracker,
} from "../transfers/speedTracker";
import { call, isTauri } from "../../lib/transport";
import type { UploadItem } from "./types";

export function useUploads() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const tracker = useRef(createSpeedTracker()).current;
  const isActive = (item: UploadItem) => item.status === "uploading";
  const mergeSnapshot = (fresh: UploadItem[]) =>
    setUploads((current) => tracker.onSnapshot(fresh, current, isActive, isTauri()));

  useEffect(() => {
    if (!isTauri()) return;

    call<UploadItem[]>("get_uploads")
      .then(mergeSnapshot)
      .catch(console.error);

    const syncTimer = window.setInterval(() => {
      call<UploadItem[]>("get_uploads")
        // Rust doesn't track bytes_done while uploading; the tracker keeps
        // the event-driven value so the bar never resets mid-upload.
        .then(mergeSnapshot)
        .catch(() => {});
    }, 1200);

    // Tauri-only push events
    const unAdded = listen<UploadItem>("upload:added", ({ payload }) => {
      setUploads((prev) => addUnique(prev, payload));
    });

    const unUpdate = listen<Partial<UploadItem> & { id: number }>(
      "upload:update",
      ({ payload }) => {
        setUploads((prev) =>
          prev.map((u) => (u.id === payload.id ? { ...u, ...payload } : u)),
        );
        if (payload.status && payload.status !== "uploading") {
          tracker.reset(payload.id);
        }
      },
    );

    const unProgress = listen<{
      id: number;
      bytes_done: number;
      bytes_total: number;
      timestamp_ms: number;
    }>("upload:progress", ({ payload }) => {
      const speed_bps = tracker.onEvent(
        payload.id,
        payload.bytes_done,
        payload.timestamp_ms,
      );
      setUploads((prev) =>
        prev.map((u) =>
          u.id === payload.id
            ? {
                ...u,
                bytes_done: payload.bytes_done,
                bytes_total: payload.bytes_total,
                ...(speed_bps != null ? { speed_bps } : {}),
              }
            : u,
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

  const cancelUpload = (id: number) => call("cancel_upload", { id });
  const retryUpload = (id: number) => call("retry_upload", { id });
  const retryGroup = (groupId: string) =>
    call<number>("retry_group_uploads", { groupId });
  const retryAllFailed = () => call<number>("retry_all_failed_uploads");
  /** `deleteRemote` (default true) also removes a finished upload from the
   *  FTP server; false only drops it from the list. */
  const deleteUpload = (id: number, deleteRemote = true) =>
    call("delete_upload", { id, deleteRemote }).then(() =>
      setUploads((prev) => prev.filter((u) => u.id !== id)),
    );
  const clearCompleted = () =>
    call("clear_completed_uploads").then(() =>
      setUploads((prev) =>
        prev.filter((u) => !["done", "error", "cancelled"].includes(u.status)),
      ),
    );

  return {
    uploads,
    cancelUpload,
    retryUpload,
    retryGroup,
    retryAllFailed,
    deleteUpload,
    clearCompleted,
  };
}
