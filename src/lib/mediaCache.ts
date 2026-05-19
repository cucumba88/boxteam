/**
 * Eager library pre-fetcher.
 *
 * `get_all_media` blocks the Library grid from rendering real cards (the
 * empty-state UI flashes for 3–5 seconds on slow remote connections while the
 * fetch is in flight, because `items` starts as `[]`).
 *
 * Mirrors `configCache.ts`: starts the fetch as soon as the router mounts, so
 * by the time Library hydrates and `useIndexing` runs, the promise is often
 * already resolved.
 */

import { call } from "./transport";

let _promise: Promise<unknown> | null = null;

/** Fire the get_all_media fetch now (idempotent — safe to call multiple times). */
export function prefetchMedia(): void {
  if (!_promise) {
    _promise = call("get_all_media").catch(() => {
      // Reset on error so the next real call retries.
      _promise = null;
    });
  }
}

/** Return the library, re-using the in-flight / resolved promise if available. */
export function getMedia<T>(): Promise<T> {
  if (!_promise) {
    _promise = call("get_all_media");
  }
  return _promise as Promise<T>;
}

/**
 * Invalidate after a refresh / re-index / index:complete event so the next
 * call to getMedia() re-fetches.
 */
export function invalidateMedia(): void {
  _promise = null;
}
