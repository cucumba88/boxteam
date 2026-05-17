import { useEffect, useState } from "react";
import type { SortableTab, TabId } from "./tabs";

export type SortKey =
  | "release-desc"
  | "added-desc"
  | "rating-desc"
  | "title-asc"
  | "year-desc";

export interface UserPrefs {
  defaultTab: TabId;
  defaultSort: Record<SortableTab, SortKey>;
  defaultMovieView: "grouped" | "files";
  defaultTvView: "shows" | "episodes";
}

export const DEFAULT_PREFS: UserPrefs = {
  defaultTab: "all",
  defaultSort: {
    all: "added-desc",
    movie: "added-desc",
    tv: "added-desc",
    documentary: "added-desc",
    watchlist: "added-desc",
  },
  defaultMovieView: "grouped",
  defaultTvView: "shows",
};

const STORAGE_KEY = "oscata.prefs.v1";

const VALID_TABS: TabId[] = [
  "all",
  "movie",
  "tv",
  "documentary",
  "downloads",
  "watchlist",
  "uploads",
];

const VALID_SORTS: SortKey[] = [
  "release-desc",
  "added-desc",
  "rating-desc",
  "title-asc",
  "year-desc",
];

function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && VALID_SORTS.includes(value as SortKey);
}

function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && VALID_TABS.includes(value as TabId);
}

export function readPrefs(): UserPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UserPrefs> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;
    const storedSort = (parsed.defaultSort ?? {}) as Partial<
      Record<SortableTab, SortKey>
    >;
    const mergedSort: Record<SortableTab, SortKey> = {
      all: isSortKey(storedSort.all)
        ? storedSort.all
        : DEFAULT_PREFS.defaultSort.all,
      movie: isSortKey(storedSort.movie)
        ? storedSort.movie
        : DEFAULT_PREFS.defaultSort.movie,
      tv: isSortKey(storedSort.tv)
        ? storedSort.tv
        : DEFAULT_PREFS.defaultSort.tv,
      documentary: isSortKey(storedSort.documentary)
        ? storedSort.documentary
        : DEFAULT_PREFS.defaultSort.documentary,
      watchlist: isSortKey(storedSort.watchlist)
        ? storedSort.watchlist
        : DEFAULT_PREFS.defaultSort.watchlist,
    };
    return {
      defaultTab: isTabId(parsed.defaultTab)
        ? parsed.defaultTab
        : DEFAULT_PREFS.defaultTab,
      defaultSort: mergedSort,
      defaultMovieView:
        parsed.defaultMovieView === "files" ||
        parsed.defaultMovieView === "grouped"
          ? parsed.defaultMovieView
          : DEFAULT_PREFS.defaultMovieView,
      defaultTvView:
        parsed.defaultTvView === "episodes" ||
        parsed.defaultTvView === "shows"
          ? parsed.defaultTvView
          : DEFAULT_PREFS.defaultTvView,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(patch: Partial<UserPrefs>): UserPrefs {
  const current = readPrefs();
  const next: UserPrefs = {
    ...current,
    ...patch,
    defaultSort: {
      ...current.defaultSort,
      ...(patch.defaultSort ?? {}),
    },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Notify same-tab listeners — the `storage` event only fires cross-tab.
    window.dispatchEvent(new Event("oscata-prefs-changed"));
  } catch {
    // ignore quota / unavailable storage
  }
  return next;
}

export function resetPrefs(): UserPrefs {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("oscata-prefs-changed"));
  } catch {
    // ignore
  }
  return DEFAULT_PREFS;
}

export function usePrefs(): UserPrefs {
  const [prefs, setPrefs] = useState<UserPrefs>(() => readPrefs());
  useEffect(() => {
    const onChange = () => setPrefs(readPrefs());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setPrefs(readPrefs());
    };
    window.addEventListener("oscata-prefs-changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("oscata-prefs-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return prefs;
}
