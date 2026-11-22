import { useEffect, useState } from "react";
import { call } from "../lib/transport";
import type { MediaItem } from "./useIndexing";
import {
  getLocalizedOverview,
  type AppLanguage,
} from "../utils/mediaLanguage";

type OverviewPair = Pick<MediaItem, "tmdb_overview" | "tmdb_overview_en">;
type OverviewSource = Pick<
  MediaItem,
  "id" | "tmdb_id" | "metadata_at" | "tmdb_overview" | "tmdb_overview_en"
>;

/**
 * The library list (`get_all_media`) leaves the synopses out to keep the
 * start-up payload small; detail views load them per item with
 * `get_media_overview`. Results are cached per item and metadata version, so
 * re-opening a title is instant and a metadata refresh fetches it again.
 */
const cache = new Map<string, OverviewPair>();
const inflight = new Map<string, Promise<OverviewPair>>();

export function overviewCacheKey(item: OverviewSource): string {
  return `${item.id}:${item.metadata_at ?? ""}`;
}

/** True when the item still needs a fetch: it is matched (has a TMDB id)
 *  and carries no synopsis in memory yet. Items patched by a live TMDB match
 *  (`index:update`) or a manual fix already have it. */
export function needsOverviewFetch(item: OverviewSource): boolean {
  return (
    item.tmdb_id != null &&
    item.tmdb_overview == null &&
    item.tmdb_overview_en == null
  );
}

export function loadOverview(item: OverviewSource): Promise<OverviewPair> {
  const key = overviewCacheKey(item);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let pending = inflight.get(key);
  if (!pending) {
    pending = call<OverviewPair>("get_media_overview", { id: item.id })
      .then((pair) => {
        const value: OverviewPair = {
          tmdb_overview: pair?.tmdb_overview ?? undefined,
          tmdb_overview_en: pair?.tmdb_overview_en ?? undefined,
        };
        cache.set(key, value);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** Localised synopsis for a detail view, fetched on demand. */
export function useOverview(
  item: OverviewSource,
  language: AppLanguage,
): string | null {
  const key = overviewCacheKey(item);
  const needsFetch = needsOverviewFetch(item);
  const [loaded, setLoaded] = useState<{ key: string; pair: OverviewPair } | null>(
    () => {
      const hit = cache.get(key);
      return hit ? { key, pair: hit } : null;
    },
  );

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    loadOverview(item)
      .then((pair) => {
        if (!cancelled) setLoaded({ key, pair });
      })
      .catch(() => {
        // No synopsis is better than a broken detail page.
      });
    return () => {
      cancelled = true;
    };
    // `key` covers id + metadata version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needsFetch]);

  if (!needsFetch) return getLocalizedOverview(item, language);
  const pair = loaded?.key === key ? loaded.pair : cache.get(key);
  return pair ? getLocalizedOverview(pair, language) : null;
}
