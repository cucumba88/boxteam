import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LogEntry } from "../components/ActivityLog";
import { call, connectWs, isTauri } from "../lib/transport";
import { getMedia, invalidateMedia } from "../lib/mediaCache";
import {
  fetchIndexingRunning,
  joinedRunningPass,
  watchUntilIdle,
} from "./indexingStatus";

export interface MediaItem {
  id: number;
  ftp_path: string;
  filename: string;
  size_bytes?: number;
  title?: string;
  year?: number;
  season?: number;
  episode?: number;
  episode_end?: number;
  resolution?: string;
  codec?: string;
  audio_codec?: string;
  hdr?: string;
  languages?: string;
  release_type?: string;
  release_group?: string;
  tmdb_id?: number;
  imdb_id?: string;
  tmdb_type?: string;
  media_type?: string;
  tmdb_release_date?: string;
  tmdb_title?: string;
  tmdb_title_en?: string;
  tmdb_poster?: string;
  tmdb_poster_en?: string;
  tmdb_rating?: number;
  tmdb_overview?: string;
  tmdb_overview_en?: string;
  tmdb_genres?: number[] | string;
  tmdb_watch_providers?: number[] | string;
  indexed_at?: string;
  metadata_at?: string;
  imdb_rating?: number;
  imdb_votes?: number;
  tvdb_id?: number;
  tvdb_rating?: number;
  ratings_fetched_at?: string;
}

const MAX_LOG = 500;
/** How often to ask whether a pass we only learned about by asking is done. */
const IDLE_WATCH_MS = 3_000;
const ENABLE_ACTIVITY_LOG = import.meta.env.DEV;

export function useIndexing() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [crawlStats, setCrawlStats] = useState<{
    scannedFolders: number;
    foundFiles: number;
  }>({ scannedFolders: 0, foundFiles: 0 });
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  // `null` counts = the run finished but we don't know the numbers (web mode
  // noticed it via polling after a missed WS event).
  const [completionSummary, setCompletionSummary] = useState<{
    newItems: number | null;
    removed: number | null;
  } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [tmdbProgress, setTmdbProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [metaRefreshProgress, setMetaRefreshProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [watchProvidersProgress, setWatchProvidersProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const itemIndexRef = useRef<Map<number, number>>(new Map());

  const rebuildIndex = (nextItems: MediaItem[]) => {
    itemIndexRef.current = new Map(
      nextItems.map((item, index) => [item.id, index]),
    );
  };

  // ── Coalesced item updates ────────────────────────────────────────────
  // A big index streams thousands of `index:progress` batches and one
  // `index:update` per TMDB match. Applying each one with its own setItems
  // copied the whole array and re-ran every Library memo (filter, sort,
  // de-dup, facet counts) per event. They are buffered here and applied
  // together at most every FLUSH_MS.
  const FLUSH_MS = 250;
  const pendingAdditionsRef = useRef<MediaItem[]>([]);
  const pendingPatchesRef = useRef<Map<number, Partial<MediaItem>>>(new Map());
  const flushTimerRef = useRef<number | null>(null);

  const flushPending = useCallback(() => {
    flushTimerRef.current = null;
    const additions = pendingAdditionsRef.current;
    const patches = pendingPatchesRef.current;
    if (additions.length === 0 && patches.size === 0) return;
    pendingAdditionsRef.current = [];
    pendingPatchesRef.current = new Map();
    setItems((prev) => {
      let next: MediaItem[] | null = null;
      for (const item of additions) {
        if (itemIndexRef.current.has(item.id)) continue;
        if (!next) next = prev.slice();
        itemIndexRef.current.set(item.id, next.length);
        next.push(item);
      }
      for (const [id, patch] of patches) {
        const index = itemIndexRef.current.get(id);
        if (index == null) continue;
        if (!next) next = prev.slice();
        next[index] = { ...next[index], ...patch };
      }
      return next ?? prev;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current == null) {
      flushTimerRef.current = window.setTimeout(flushPending, FLUSH_MS);
    }
  }, [flushPending]);

  /** Queue a partial update. Null fields are dropped so a partial event
   *  (e.g. a search-result match without watch_providers) can't wipe data we
   *  already have; the DB layer preserves those columns the same way. */
  const queuePatch = useCallback(
    (payload: Partial<MediaItem> & { id: number }) => {
      const patch: Partial<MediaItem> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v !== null) (patch as Record<string, unknown>)[k] = v;
      }
      const pending = pendingPatchesRef.current;
      pending.set(payload.id, { ...pending.get(payload.id), ...patch });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  useEffect(
    () => () => {
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
      }
    },
    [],
  );

  // ── Passes whose start we missed ──────────────────────────────────────
  // A pass the scheduler started at launch can send `index:start` before
  // the listeners below exist. When we learn about such a pass by asking
  // (on load, or because a refresh press joined it), show it as running
  // and ask again until it ends: if the window was hidden when it began,
  // `index:complete` never comes either.
  const idleWatchRef = useRef<(() => void) | null>(null);
  const markRunning = useCallback(() => {
    setIsIndexing(true);
    if (idleWatchRef.current) return;
    idleWatchRef.current = watchUntilIdle(
      () => fetchIndexingRunning(call),
      () => {
        idleWatchRef.current = null;
        setIsIndexing(false);
        setProgress(null);
        setTmdbProgress(null);
      },
      IDLE_WATCH_MS,
    );
  }, []);

  useEffect(
    () => () => {
      idleWatchRef.current?.();
      idleWatchRef.current = null;
    },
    [],
  );

  /** Start an index pass, or follow the one already running. */
  const requestIndexing = useCallback(async () => {
    const result = await call<unknown>("start_indexing");
    if (joinedRunningPass(result)) markRunning();
  }, [markRunning]);

  const addLog = useCallback((msg: string) => {
    if (!ENABLE_ACTIVITY_LOG) return;
    setLog((prev) => [...prev.slice(-MAX_LOG + 1), { ts: Date.now(), msg }]);
  }, []);

  // Hydrate from SQLite on mount. Uses the shared mediaCache so this resolves
  // instantly if router.tsx already kicked off the prefetch.
  useEffect(() => {
    getMedia<MediaItem[]>()
      .then((loaded) => {
        rebuildIndex(loaded);
        setItems(loaded);
      })
      .catch(console.error)
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    if (!isTauri()) return;

    const unProgress = listen<
      Array<MediaItem & { current: number; total: number }>
    >("index:progress", ({ payload }) => {
      // payload is now an array of up to 50 progress items (batched on Rust side).
      // Process all items in a single state update to minimise re-renders.
      if (!Array.isArray(payload) || payload.length === 0) return;

      setIndexError(null);
      setIsIndexing(true);

      // Use the last item in the batch for progress display (it has the highest current).
      const last = payload[payload.length - 1];
      setProgress({ current: last.current, total: last.total });

      // Only genuinely new items are appended (checked again at flush time).
      for (const item of payload) {
        if (!itemIndexRef.current.has(item.id)) {
          pendingAdditionsRef.current.push(item);
        }
      }
      scheduleFlush();
    });

    const unComplete = listen<{
      total: number;
      new_items: number;
      metadata_queued: number;
      removed?: number;
    }>("index:complete", ({ payload }) => {
      setProgress(null);
      setTmdbProgress(null);
      setIsIndexing(false);
      setCompletionSummary({
        newItems: payload.new_items,
        removed: payload.removed ?? 0,
      });
      addLog(
        `✓ Done — ${payload.total} files indexed, ${payload.new_items} new, ${payload.metadata_queued} sent to TMDB, ${payload.removed ?? 0} stale items removed`,
      );
      // Re-fetch the full list so items added during a background index
      // (when progress events were suppressed) are visible immediately.
      // Merge with in-memory state to preserve any TMDB patches (index:update)
      // that arrived between index:complete and when get_all_media resolves —
      // those writes may have been missed by the DB snapshot due to the race.
      invalidateMedia();
      call<MediaItem[]>("get_all_media")
        .then((loaded) => {
          setItems((prev) => {
            const prevById = new Map(prev.map((item) => [item.id, item]));
            const merged = loaded.map((dbItem) => {
              if (dbItem.tmdb_id != null) return dbItem;
              const memItem = prevById.get(dbItem.id);
              if (memItem?.tmdb_id != null) {
                // index:update arrived before get_all_media resolved — keep TMDB fields
                return {
                  ...dbItem,
                  tmdb_id: memItem.tmdb_id,
                  imdb_id: memItem.imdb_id,
                  tmdb_type: memItem.tmdb_type,
                  tmdb_title: memItem.tmdb_title,
                  tmdb_title_en: memItem.tmdb_title_en,
                  tmdb_release_date: memItem.tmdb_release_date,
                  tmdb_overview: memItem.tmdb_overview,
                  tmdb_overview_en: memItem.tmdb_overview_en,
                  tmdb_poster: memItem.tmdb_poster,
                  tmdb_poster_en: memItem.tmdb_poster_en,
                  tmdb_rating: memItem.tmdb_rating,
                  tmdb_genres: memItem.tmdb_genres,
                  metadata_at: memItem.metadata_at,
                  imdb_rating: memItem.imdb_rating,
                  imdb_votes: memItem.imdb_votes,
                  tvdb_id: memItem.tvdb_id,
                  tvdb_rating: memItem.tvdb_rating,
                  ratings_fetched_at: memItem.ratings_fetched_at,
                };
              }
              return dbItem;
            });
            rebuildIndex(merged);
            return merged;
          });
        })
        .catch(console.error);
    });

    const unUpdate = listen<Partial<MediaItem> & { id: number }>(
      "index:update",
      ({ payload }) => queuePatch(payload),
    );

    const unError = listen<{ message: string }>(
      "index:error",
      ({ payload }) => {
        setIndexError(payload.message);
        setProgress(null);
        setIsIndexing(false);
        setCrawlStats({ scannedFolders: 0, foundFiles: 0 });
        addLog(`⚠ Error: ${payload.message}`);
      },
    );

    const unStart = listen("index:start", () => {
      setIndexError(null);
      setIsIndexing(true);
      setProgress(null);
      setTmdbProgress(null);
      setCompletionSummary(null);
      setCrawlStats({ scannedFolders: 0, foundFiles: 0 });
      addLog("▶ Indexing started");
    });

    const unLog = ENABLE_ACTIVITY_LOG
      ? listen<{ msg: string }>("index:log", ({ payload }) => {
          // crawl stat tracking removed
          addLog(payload.msg);
        })
      : Promise.resolve(() => {});

    const unTmdbProgress = listen<{ done: number; total: number }>(
      "index:tmdb_progress",
      ({ payload }) => {
        setTmdbProgress({ done: payload.done, total: payload.total });
        if (payload.done >= payload.total) {
          // All TMDB tasks finished — clear after a brief delay so the 100% state is visible
          setTimeout(() => setTmdbProgress(null), 1500);
        }
      },
    );

    const unMetaRefresh = listen<{ done: number; total: number }>(
      "metadata:refresh_progress",
      ({ payload }) => {
        setMetaRefreshProgress({ done: payload.done, total: payload.total });
        if (payload.done >= payload.total) {
          setTimeout(() => setMetaRefreshProgress(null), 1500);
        }
      },
    );

    const unWatchProviders = listen<{ done: number; total: number }>(
      "watch_providers:refresh_progress",
      ({ payload }) => {
        // Skip the noisy "0/0" event the backend emits when nothing's missing
        // — otherwise users would see an empty banner flash on every app boot.
        if (payload.total === 0) return;
        setWatchProvidersProgress({ done: payload.done, total: payload.total });
        if (payload.done >= payload.total) {
          setTimeout(() => setWatchProvidersProgress(null), 1500);
        }
      },
    );

    // Background runs (tray / minimised window) don't stream per-item events;
    // the backend sends one `library:refreshed` when such a run finishes.
    // Reload the list from the DB then — or, if the window is still hidden,
    // as soon as it is shown again, so several runs collapse into one fetch.
    let staleWhileHidden = false;
    const reloadFromDb = () => {
      staleWhileHidden = false;
      invalidateMedia();
      call<MediaItem[]>("get_all_media")
        .then((loaded) => {
          rebuildIndex(loaded);
          setItems(loaded);
        })
        .catch(console.error);
    };
    const unRefreshed = listen("library:refreshed", () => {
      if (document.visibilityState === "visible") reloadFromDb();
      else staleWhileHidden = true;
    });
    const onVisible = () => {
      if (staleWhileHidden && document.visibilityState === "visible") {
        reloadFromDb();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Once the listeners are in place, ask whether a pass is already
    // running: its `index:start` may have fired before they existed.
    let disposed = false;
    Promise.all([unStart, unProgress, unComplete, unError])
      .then(() => fetchIndexingRunning(call))
      .then((running) => {
        if (running && !disposed) markRunning();
      })
      .catch(console.error);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      unRefreshed.then((f) => f());
      unProgress.then((f) => f());
      unUpdate.then((f) => f());
      unError.then((f) => f());
      unStart.then((f) => f());
      unComplete.then((f) => f());
      unLog.then((f) => f());
      unTmdbProgress.then((f) => f());
      unMetaRefresh.then((f) => f());
      unWatchProviders.then((f) => f());
    };
  }, [markRunning]);

  const dismissCompletion = useCallback(() => setCompletionSummary(null), []);

  // In web mode: connect via WebSocket for real-time events, with polling as a fallback.
  useEffect(() => {
    if (isTauri()) return;

    // ── WebSocket (real-time push) ────────────────────────────────────────
    const handleWsEvent = (event: string, payload: unknown) => {
      const p = payload as Record<string, unknown>;
      if (event === "index:start") {
        setIndexError(null);
        setIsIndexing(true);
        setProgress(null);
        setTmdbProgress(null);
        setCompletionSummary(null);
        addLog("▶ Indexing started");
      } else if (event === "index:progress") {
        // Web mode gets counts only (the desktop event carries full items).
        const current = (p.current as number) ?? 0;
        const total = (p.total as number) ?? 0;
        setIsIndexing(true);
        if (total > 0) setProgress({ current, total });
      } else if (event === "index:tmdb_progress") {
        const done = (p.done as number) ?? 0;
        const total = (p.total as number) ?? 0;
        setTmdbProgress({ done, total });
      } else if (event === "metadata:refresh_progress") {
        const done = (p.done as number) ?? 0;
        const total = (p.total as number) ?? 0;
        setMetaRefreshProgress({ done, total });
        if (done >= total) {
          setTimeout(() => setMetaRefreshProgress(null), 1500);
        }
      } else if (event === "index:complete") {
        setProgress(null);
        setTmdbProgress(null);
        setIsIndexing(false);
        setCompletionSummary({
          newItems: (p.new_items as number) ?? 0,
          removed: (p.removed as number) ?? 0,
        });
        addLog(
          `✓ Done — ${p.total} files indexed, ${p.new_items} new, ${p.removed ?? 0} stale items removed`,
        );
        invalidateMedia();
        call<MediaItem[]>("get_all_media")
          .then((loaded) => {
            rebuildIndex(loaded);
            setItems(loaded);
          })
          .catch(console.error);
      } else if (event === "index:error") {
        setIndexError((p.message as string) ?? "Unknown error");
        setProgress(null);
        setIsIndexing(false);
        addLog(`⚠ Error: ${p.message}`);
      } else if (event === "index:update") {
        queuePatch(p as Partial<MediaItem> & { id: number });
      } else if (event === "watch_providers:refresh_progress") {
        const done = (p.done as number) ?? 0;
        const total = (p.total as number) ?? 0;
        if (total === 0) return;
        setWatchProvidersProgress({ done, total });
        if (done >= total) {
          setTimeout(() => setWatchProvidersProgress(null), 1500);
        }
      } else if (event === "ratings:complete") {
        // The ratings refresh job deliberately doesn't broadcast per-item
        // updates over WS (it would flood the page with re-renders). When
        // the job wraps up we pull a fresh snapshot in one shot so the new
        // IMDb / TVDB columns appear without manual refresh.
        invalidateMedia();
        call<MediaItem[]>("get_all_media")
          .then((loaded) => {
            rebuildIndex(loaded);
            setItems(loaded);
          })
          .catch(console.error);
      }
    };

    const stopWs = connectWs(handleWsEvent);

    // ── Polling fallback (status check only) ─────────────────────────────
    // Polls fast (5 s) while indexing, slow (60 s) when idle. The fast mode
    // catches a missed `index:complete` event during a WS reconnect; the slow
    // mode is just a heartbeat so a long-lived tab doesn't drift forever
    // out of sync. Previously this polled every 5 s forever, which on a
    // remote/mobile session burned battery and network for no benefit.
    const FAST_POLL_MS = 5_000;
    const IDLE_POLL_MS = 60_000;
    let wasRunning = false;
    let timerId: number | null = null;

    const schedule = (delay: number) => {
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      try {
        const status = await call<{ running: boolean }>("get_indexing_status");
        const running = status.running;
        setIsIndexing(running);

        if (wasRunning && !running) {
          // Transition detected via poll (WS event may have been missed during reconnect).
          setProgress(null);
          setTmdbProgress(null);
          invalidateMedia();
          const loaded = await call<MediaItem[]>("get_all_media");
          rebuildIndex(loaded);
          setItems(loaded);
          setCompletionSummary({ newItems: null, removed: null });
        } else if (!wasRunning && running) {
          setIndexError(null);
          setCompletionSummary(null);
        }

        wasRunning = running;
      } catch {
        // Server unreachable — keep slow-polling so we recover when it's back.
      } finally {
        schedule(wasRunning ? FAST_POLL_MS : IDLE_POLL_MS);
      }
    };

    // Fire the first poll immediately so initial state is accurate;
    // subsequent polls reschedule themselves based on current running state.
    poll();

    return () => {
      stopWs();
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  return {
    items,
    initialLoading,
    isIndexing,
    crawlStats,
    progress,
    tmdbProgress,
    metaRefreshProgress,
    watchProvidersProgress,
    completionSummary,
    dismissCompletion,
    /** Force-clear all indexing/TMDB state. Use when tasks are stuck and never complete. */
    forceClearIndexing: () => {
      setIsIndexing(false);
      setProgress(null);
      setTmdbProgress(null);
      setCompletionSummary(null);
    },
    indexError,
    clearIndexError: () => setIndexError(null),
    retryIndexing: () => requestIndexing().catch(console.error),
    requestIndexing,
    log,
    appendLog: addLog,
    clearLog: () => setLog([]),
    /** Empty the in-memory library after a server-side library reset. */
    resetItems: () => {
      setItems([]);
      rebuildIndex([]);
      setCompletionSummary(null);
    },
  };
}
