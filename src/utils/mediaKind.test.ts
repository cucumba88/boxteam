import { describe, expect, it } from "vitest";
import { isShowItem } from "./mediaKind";

describe("isShowItem", () => {
  it("treats TV as a show, matched or not", () => {
    expect(isShowItem({ media_type: "tv", tmdb_type: undefined, season: undefined })).toBe(true);
    expect(isShowItem({ media_type: "movie", tmdb_type: "tv", season: undefined })).toBe(true);
  });

  it("treats movies as films", () => {
    expect(isShowItem({ media_type: "movie", tmdb_type: "movie", season: undefined })).toBe(false);
    expect(isShowItem({ media_type: undefined, tmdb_type: undefined, season: undefined })).toBe(false);
  });

  it("opens an unmatched documentary film as a film, not a show without season", () => {
    // "Mínimo contacto (2026.WEB-DL.1080P...).mkv" in the documentaries folder.
    expect(isShowItem({ media_type: "documentary", tmdb_type: undefined, season: undefined })).toBe(false);
  });

  it("keeps a documentary film matched by hand as a film", () => {
    expect(isShowItem({ media_type: "documentary", tmdb_type: "documentary", season: undefined })).toBe(false);
    expect(isShowItem({ media_type: "documentary", tmdb_type: "movie", season: undefined })).toBe(false);
  });

  it("treats docuseries as shows", () => {
    expect(isShowItem({ media_type: "documentary", tmdb_type: undefined, season: 1 })).toBe(true);
    expect(isShowItem({ media_type: "documentary", tmdb_type: "tv", season: undefined })).toBe(true);
  });
});
