import type { MediaItem } from "../hooks/useIndexing";
import { getLocalizedTitle, type AppLanguage } from "./mediaLanguage";

export const ALPHA_LETTERS: string[] = [
  "#",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
];

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Sort-friendly key derived from a title: trimmed, diacritic-folded,
 * lowercased. We intentionally do NOT strip leading articles — sorting
 * literally by first letter matches the rail buckets and the user's mental
 * model ("La mujer" lives under L, not under M).
 */
export function titleSortKey(title: string): string {
  if (!title) return "";
  return stripDiacritics(title.trim()).toLowerCase();
}

export function firstCharBucket(title: string): string {
  const folded = titleSortKey(title).toUpperCase();
  const first = folded.charAt(0);
  if (first >= "A" && first <= "Z") return first;
  return "#";
}

/**
 * Returns the first index in `items` for each letter A-Z (and "#").
 * `null` when no item buckets to that letter — used to dim the rail button.
 *
 * Assumes `items` is already sorted alphabetically by the same title we
 * bucket on. When the list is sorted differently we still produce an index
 * (it just won't be monotonic, which is fine — we only need "first match
 * anywhere in the list"). The caller should hide the rail unless sort is
 * `title-asc` / `title-desc`.
 */
export function buildAlphaIndex(
  items: Pick<MediaItem, "tmdb_title" | "tmdb_title_en" | "title" | "filename">[],
  language: AppLanguage,
): Record<string, number | null> {
  const index: Record<string, number | null> = {};
  for (const letter of ALPHA_LETTERS) index[letter] = null;
  items.forEach((item, idx) => {
    const bucket = firstCharBucket(getLocalizedTitle(item, language));
    if (index[bucket] == null) index[bucket] = idx;
  });
  return index;
}
