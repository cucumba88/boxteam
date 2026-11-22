import { useSyncExternalStore } from "react";
import type { MediaItem } from "../hooks/useIndexing";

/**
 * Identifiers for the rating sources BoxTeam surfaces in the UI. TVDB is
 * intentionally not part of this union — its `score` field is popularity-
 * weighted (not a 0-10 user rating) so we don't display it as a rating,
 * but the backend still fetches `tvdb_id` for use as a metadata source.
 *
 * Storage columns:
 *   - imdb: `imdb_rating`  (provided by OMDb's `imdbRating` field)
 *   - tmdb: `tmdb_rating`  (TMDB's `vote_average`)
 */
export type RatingSource = "imdb" | "tmdb";

export interface ResolvedRating {
  value: number;
  source: RatingSource;
}

export const CANONICAL_ORDER: RatingSource[] = ["tmdb", "imdb"];

/** Human-facing labels — proper-noun trademarks stay English. */
export const ratingLabel: Record<RatingSource, string> = {
  imdb: "IMDb",
  tmdb: "TMDB",
};

const ALL_SOURCES: ReadonlySet<RatingSource> = new Set(CANONICAL_ORDER);

function isRatingSource(value: string): value is RatingSource {
  return (ALL_SOURCES as Set<string>).has(value);
}

/**
 * Parse the CSV preference order stored on `AppConfig.rating_source_order`.
 * Sanitises unknown tokens, deduplicates, and appends any missing sources at
 * the end so callers never have to handle a partial list.
 */
export function parseRatingOrder(raw: string | undefined | null): RatingSource[] {
  const parsed: RatingSource[] = [];
  const seen = new Set<RatingSource>();
  for (const token of (raw ?? "").split(",")) {
    const t = token.trim().toLowerCase();
    if (isRatingSource(t) && !seen.has(t)) {
      parsed.push(t);
      seen.add(t);
    }
  }
  for (const fallback of CANONICAL_ORDER) {
    if (!seen.has(fallback)) {
      parsed.push(fallback);
      seen.add(fallback);
    }
  }
  return parsed;
}

export function ratingOrderToCsv(order: RatingSource[]): string {
  return order.join(",");
}

function ratingOf(item: MediaItem, source: RatingSource): number | null {
  const raw = source === "imdb" ? item.imdb_rating : item.tmdb_rating;
  if (raw == null || !Number.isFinite(raw)) return null;
  return raw;
}

/** Returns the first non-null rating for the configured priority order. */
export function resolveRating(
  item: MediaItem,
  order: RatingSource[],
): ResolvedRating | null {
  for (const source of order) {
    const value = ratingOf(item, source);
    if (value != null) return { value, source };
  }
  return null;
}

/**
 * Every rating present on the item, in the configured order. The caller will
 * typically render the first one large and the rest as a "secondaries" row.
 */
export function allAvailableRatings(
  item: MediaItem,
  order: RatingSource[],
): ResolvedRating[] {
  const out: ResolvedRating[] = [];
  for (const source of order) {
    const value = ratingOf(item, source);
    if (value != null) out.push({ value, source });
  }
  return out;
}

/** Format a rating to one decimal place. */
export function formatRating(value: number): string {
  return value.toFixed(1);
}

// ── Live preference store ──────────────────────────────────────────────────
// The rating order is set once from AppConfig when Library mounts and updated
// from Settings on save. Display components read it via `useRatingOrder()`
// rather than threading the value through every prop chain — same approach
// as `mediaCache.ts` for the prefetched library snapshot.

const STORAGE_KEY = "boxteam_rating_source_order";
const listeners = new Set<() => void>();
let current: RatingSource[] = parseRatingOrder(
  typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
);

function emit() {
  for (const fn of listeners) fn();
}

export function setRatingOrder(order: RatingSource[] | string): void {
  const next =
    typeof order === "string" ? parseRatingOrder(order) : parseRatingOrder(order.join(","));
  const same =
    next.length === current.length && next.every((s, i) => s === current[i]);
  if (same) return;
  current = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, ratingOrderToCsv(next));
    } catch {
      // Quota or private-mode storage error — the live store is still updated.
    }
  }
  emit();
}

export function getRatingOrder(): RatingSource[] {
  return current;
}

/** React hook: re-renders the caller whenever the rating order changes. */
export function useRatingOrder(): RatingSource[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}
