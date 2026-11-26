import type { MediaItem } from "../hooks/useIndexing";

type ShowFields = Pick<MediaItem, "media_type" | "tmdb_type" | "season">;

/**
 * Whether an item opens as a show (season / episode page) rather than a film.
 *
 * TV is always a show. A documentary folder holds both docuseries and
 * documentary films, so a documentary is a show only when TMDB matched it as
 * TV or the filename carries a season. A documentary film ("Title (2026 ...)")
 * opens as a film; before this it opened the show page with an empty
 * "Sin temporada" season.
 */
export function isShowItem(item: ShowFields): boolean {
  if (item.tmdb_type === "tv" || item.media_type === "tv") return true;
  if (item.media_type === "documentary") return item.season != null;
  return false;
}
