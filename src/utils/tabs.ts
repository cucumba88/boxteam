import {
  Bookmark,
  Clapperboard,
  Download,
  FileText,
  LayoutGrid,
  Tv2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { isTauri } from "../lib/transport";

export type TabId =
  | "all"
  | "movie"
  | "tv"
  | "documentary"
  | "downloads"
  | "watchlist"
  | "uploads";

export type SortableTab = "all" | "movie" | "tv" | "documentary" | "watchlist";

export const SORTABLE_TABS: SortableTab[] = [
  "all",
  "movie",
  "tv",
  "documentary",
  "watchlist",
];

export interface TabDef {
  id: TabId;
  labelKey: string;
  icon: LucideIcon;
}

export const TABS: TabDef[] = [
  { id: "all", labelKey: "nav.all", icon: LayoutGrid },
  { id: "movie", labelKey: "nav.movies", icon: Clapperboard },
  { id: "tv", labelKey: "nav.tv", icon: Tv2 },
  { id: "documentary", labelKey: "nav.docs", icon: FileText },
  { id: "watchlist", labelKey: "nav.watchlist", icon: Bookmark },
  { id: "downloads", labelKey: "nav.downloads", icon: Download },
  ...(isTauri()
    ? [{ id: "uploads" as const, labelKey: "nav.uploads", icon: Upload }]
    : []),
];

export const TAB_SLUGS: Record<TabId, string> = {
  all: "/",
  movie: "/peliculas",
  tv: "/series",
  documentary: "/documentales",
  downloads: "/descargas",
  watchlist: "/watchlist",
  uploads: "/subidas",
};

export const SLUG_TO_TAB: Record<string, TabId> = Object.fromEntries(
  Object.entries(TAB_SLUGS).map(([k, v]) => [v, k as TabId]),
) as Record<string, TabId>;
