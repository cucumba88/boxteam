import { describe, expect, it } from "vitest";
import { needsOverviewFetch, overviewCacheKey } from "./useOverview";

describe("useOverview helpers", () => {
  it("fetches only matched items that have no synopsis in memory", () => {
    expect(needsOverviewFetch({ id: 1, tmdb_id: 10 })).toBe(true);
    expect(needsOverviewFetch({ id: 1 })).toBe(false);
    expect(needsOverviewFetch({ id: 1, tmdb_id: 10, tmdb_overview: "x" })).toBe(false);
    expect(needsOverviewFetch({ id: 1, tmdb_id: 10, tmdb_overview_en: "y" })).toBe(false);
  });

  it("keys the cache by item and metadata version", () => {
    const a = overviewCacheKey({ id: 1, metadata_at: "2026-11-01" });
    expect(a).toBe(overviewCacheKey({ id: 1, metadata_at: "2026-11-01" }));
    expect(a).not.toBe(overviewCacheKey({ id: 1, metadata_at: "2026-11-22" }));
    expect(a).not.toBe(overviewCacheKey({ id: 2, metadata_at: "2026-11-01" }));
  });
});
