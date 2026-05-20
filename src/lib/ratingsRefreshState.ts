import { useSyncExternalStore } from "react";
import { connectWs, isTauri } from "./transport";

/**
 * Process-wide live state for the "Refresh ratings" background job.
 *
 * The Rust side spawns the job on the global async runtime and broadcasts
 * `ratings:start` / `ratings:progress` / `ratings:complete` events. We want
 * the Settings UI to be able to mount halfway through a running job and
 * still see correct progress — so the listeners live at module scope and the
 * latest snapshot is exposed via a React hook.
 *
 * Module-level subscription model matches `ratingSource.ts`: subscribe once
 * (the first time anyone imports the module), keep listening for the whole
 * tab's lifetime, and re-render every component that called `useRatingsRefresh`
 * whenever a new event arrives.
 */

export type RatingsRefreshState = "idle" | "running" | "done" | "error";

export interface RatingsRefreshSnapshot {
  state: RatingsRefreshState;
  done: number;
  total: number;
  /** Optional human-readable message — used for terminal/error states. */
  message: string;
}

let snapshot: RatingsRefreshSnapshot = {
  state: "idle",
  done: 0,
  total: 0,
  message: "",
};

const listeners = new Set<() => void>();
function emit() {
  for (const fn of listeners) fn();
}

function setSnapshot(next: RatingsRefreshSnapshot) {
  snapshot = next;
  emit();
}

export function markRatingsRefreshError(message: string): void {
  setSnapshot({ ...snapshot, state: "error", message });
}

function onStart(total: number) {
  setSnapshot({ state: "running", done: 0, total, message: "" });
}
function onProgress(done: number, total: number) {
  setSnapshot({ state: "running", done, total, message: "" });
}
function onComplete(total: number) {
  setSnapshot({ state: "done", done: total, total, message: "" });
}

// Wire up event listeners exactly once. Idempotent — subsequent imports reuse
// the same subscription.
let wired = false;
function ensureWired(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;

  if (isTauri()) {
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        listen<{ total: number }>("ratings:start", ({ payload }) =>
          onStart(payload.total),
        );
        listen<{ done: number; total: number }>(
          "ratings:progress",
          ({ payload }) => onProgress(payload.done, payload.total),
        );
        listen<{ total: number }>("ratings:complete", ({ payload }) =>
          onComplete(payload.total),
        );
      } catch (err) {
        console.error("[ratingsRefresh] failed to attach Tauri listeners", err);
      }
    })();
  } else {
    // Web mode: subscribe to the WS broadcast. `connectWs` already auto-reconnects.
    connectWs((event, payload) => {
      const p = payload as Record<string, number>;
      if (event === "ratings:start") onStart(p.total ?? 0);
      else if (event === "ratings:progress")
        onProgress(p.done ?? 0, p.total ?? 0);
      else if (event === "ratings:complete") onComplete(p.total ?? 0);
    });
  }
}

ensureWired();

export function getRatingsRefreshSnapshot(): RatingsRefreshSnapshot {
  return snapshot;
}

/** Subscribe to live refresh progress. Survives component unmount/remount. */
export function useRatingsRefresh(): RatingsRefreshSnapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}
