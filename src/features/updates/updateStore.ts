import { useSyncExternalStore } from "react";
import { isTauri } from "../../lib/transport";

/**
 * In-app updates (Tauri updater) for the desktop app.
 *
 * One store shared by the update toast (Library) and the Settings section,
 * so a check started in one place shows up in the other. The updater reads
 * `latest.json` from the latest GitHub release and only accepts packages
 * signed with the key whose public half is in tauri.conf.json.
 */

export type UpdateStatus =
  | "idle"
  | "unsupported"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "restarting"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  /** Version on offer, e.g. "0.21.0". */
  version: string | null;
  /** Release notes (markdown) of the version on offer. */
  notes: string | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  /** The user closed the toast for this version. */
  dismissedVersion: string | null;
  lastChecked: number | null;
}

/** The subset of the plugin's `Update` we use (keeps tests free of Tauri). */
interface PendingUpdate {
  version: string;
  body?: string;
  downloadAndInstall(
    onEvent?: (event: DownloadEvent) => void,
  ): Promise<void>;
}

type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

const INITIAL: UpdateState = {
  status: "idle",
  version: null,
  notes: null,
  downloaded: 0,
  total: null,
  error: null,
  dismissedVersion: null,
  lastChecked: null,
};

let state: UpdateState = INITIAL;
let pending: PendingUpdate | null = null;
let supported: boolean | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUpdateState(): UpdateState {
  return state;
}

export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, getUpdateState);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}

async function isSupported(): Promise<boolean> {
  if (supported !== null) return supported;
  if (!isTauri()) return (supported = false);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    supported = await invoke<boolean>("app_update_supported");
  } catch {
    supported = false;
  }
  return supported;
}

/**
 * Asks GitHub whether there is a newer version. Automatic checks keep quiet
 * on failure (no network, GitHub down); a manual check from Settings shows
 * the error.
 */
export async function checkForUpdate({ manual = false } = {}): Promise<void> {
  if (state.status === "checking" || state.status === "downloading" || state.status === "restarting") {
    return;
  }
  if (!(await isSupported())) {
    set({ status: "unsupported" });
    return;
  }
  set({ status: "checking", error: null });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    pending = update;
    set(
      update
        ? {
            status: "available",
            version: update.version,
            notes: update.body?.trim() || null,
            lastChecked: Date.now(),
          }
        : { status: "upToDate", version: null, notes: null, lastChecked: Date.now() },
    );
  } catch (error) {
    pending = null;
    if (isMissingPlatformError(error)) {
      // The release is out but this platform's package isn't attached yet
      // (macOS is added from a Mac after publishing): nothing to install yet.
      set({ status: "upToDate", version: null, notes: null, error: null, lastChecked: Date.now() });
      return;
    }
    set({
      status: manual ? "error" : "idle",
      error: manual ? errorText(error) : null,
      lastChecked: Date.now(),
    });
  }
}

/**
 * The updater's error when latest.json has no entry for this platform, e.g.
 * `None of the fallback platforms ["darwin-aarch64-app","darwin-aarch64"]
 * were found in the response platforms object`.
 */
export function isMissingPlatformError(error: unknown): boolean {
  return /fallback platforms|platform\b.*\bnot found|were found in the response platforms/i.test(errorText(error));
}

/** Downloads and installs the pending update, then restarts the app. */
export async function installUpdate(): Promise<void> {
  if (!pending || state.status === "downloading" || state.status === "restarting") return;
  set({ status: "downloading", downloaded: 0, total: null, error: null });
  try {
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") {
        set({ total: event.data.contentLength ?? null });
      } else if (event.event === "Progress") {
        set({ downloaded: state.downloaded + event.data.chunkLength });
      }
    });
    set({ status: "restarting" });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (error) {
    set({ status: "error", error: errorText(error) });
  }
}

/** Hides the toast for the version on offer (Settings still shows it). */
export function dismissUpdate(): void {
  set({ dismissedVersion: state.version });
}

/** 0–100, or null while the size is unknown. */
export function downloadPercent(s: Pick<UpdateState, "downloaded" | "total">): number | null {
  if (!s.total || s.total <= 0) return null;
  return Math.min(100, Math.round((s.downloaded / s.total) * 100));
}

/** Test hook: reset the module state. */
export function __resetUpdateStore(next: { supported?: boolean | null; update?: PendingUpdate | null } = {}): void {
  state = INITIAL;
  supported = next.supported ?? null;
  pending = next.update ?? null;
  if (pending) state = { ...INITIAL, status: "available", version: pending.version };
}
