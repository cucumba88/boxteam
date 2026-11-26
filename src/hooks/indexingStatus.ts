/**
 * Keeps the library's "indexing" state honest when the window missed the
 * start of a pass.
 *
 * Right after launch the 15-minute scheduler often starts an index pass
 * before the webview has registered its event listeners, so `index:start`
 * is lost and the library header shows "Refresh" as idle. Pressing it then
 * hit the backend's one-pass-at-a-time guard and came back at once: the
 * button flashed and nothing seemed to happen. These helpers let the UI
 * ask the backend instead of relying on having heard every event.
 */

export type StatusCall = <T>(cmd: string) => Promise<T>;

/** True when `start_indexing` answered that a pass was already running
 *  (`{ started: false }`), so the press joined that pass. */
export function joinedRunningPass(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { started?: unknown }).started === false
  );
}

/** Whether the backend is running an index pass. False when it can't say. */
export async function fetchIndexingRunning(call: StatusCall): Promise<boolean> {
  try {
    const status = await call<{ running?: unknown } | null>(
      "get_indexing_status",
    );
    return status?.running === true;
  } catch {
    return false;
  }
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

/**
 * Asks `isRunning` every `intervalMs` until it reports false, then calls
 * `onIdle` once. Needed for a pass whose start the window missed: if the
 * window was hidden when it began, it never gets `index:complete` either.
 * Returns a function that stops watching.
 */
export function watchUntilIdle(
  isRunning: () => Promise<boolean>,
  onIdle: () => void,
  intervalMs: number,
  timers: Timers = defaultTimers,
): () => void {
  let stopped = false;
  let timer: number | null = null;

  const tick = async () => {
    timer = null;
    const running = await isRunning();
    if (stopped) return;
    if (running) {
      timer = timers.setTimeout(tick, intervalMs);
    } else {
      stopped = true;
      onIdle();
    }
  };

  timer = timers.setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
}
