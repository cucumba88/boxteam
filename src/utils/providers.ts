// Curated streaming-platform catalogue keyed by TMDB watch-provider id.
// IDs come from TMDB's /watch/providers/movie?watch_region=ES — the only IDs
// listed here are the ones we want to expose as filter chips. Add more by
// looking up the id in TMDB's response and picking a matching `iconSlug`
// from simple-icons (https://simpleicons.org). When no icon exists, leave
// `iconSlug` undefined and PlatformLogo will fall back to a 2-letter glyph.

export interface ProviderEntry {
  /** TMDB provider_id */
  id: number;
  name: string;
  /** simple-icons slug, e.g. "netflix". `undefined` → text-glyph fallback. */
  iconSlug?: string;
  /** Optional 2-letter fallback glyph (defaults to derived initials). */
  fallback?: string;
}

export const PROVIDER_LIST: ProviderEntry[] = [
  { id: 8,    name: "Netflix",        iconSlug: "netflix" },
  { id: 337,  name: "Disney+",        fallback: "D+" },
  { id: 9,    name: "Prime Video",    fallback: "PV" },
  { id: 119,  name: "Amazon Prime",   fallback: "PV" },
  { id: 1899, name: "Max",            iconSlug: "max" },
  { id: 384,  name: "HBO Max",        iconSlug: "hbomax" },
  { id: 2,    name: "Apple TV",       iconSlug: "appletv" },
  { id: 350,  name: "Apple TV+",      iconSlug: "appletv" },
  { id: 531,  name: "Paramount+",     iconSlug: "paramountplus" },
  { id: 283,  name: "Crunchyroll",    iconSlug: "crunchyroll" },
  { id: 1773, name: "SkyShowtime",    fallback: "SK" },
  { id: 149,  name: "Movistar Plus+", iconSlug: "movistar" },
  { id: 63,   name: "Filmin",         fallback: "Fi" },
  { id: 446,  name: "Pluto TV",       fallback: "Pl" },
  { id: 567,  name: "atresplayer",    fallback: "AP" },
  { id: 37,   name: "Showtime",       iconSlug: "showtime" },
  { id: 188,  name: "YouTube Premium", iconSlug: "youtube" },
  { id: 35,   name: "Rakuten TV",     iconSlug: "rakuten" },
];

export const PROVIDER_BY_ID: Map<number, ProviderEntry> = new Map(
  PROVIDER_LIST.map((p) => [p.id, p]),
);

/** Parse the wire format (number[] from Rust, or JSON string from older rows). */
export function parseProviders(raw: number[] | string | undefined | null): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as number[]) : [];
  } catch {
    return [];
  }
}
