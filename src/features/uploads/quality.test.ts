import { describe, expect, it } from "vitest";
import { resolveQueuedQuality, tmdbIdTag, withTmdbIdTag } from "./quality";

const detected = {
  resolution: "720p",
  codec: "AVC",
  hdr: null,
  audioCodec: "AAC",
};

describe("resolveQueuedQuality", () => {
  it("uses the resolution picked in the form over the detected one", () => {
    const q = resolveQueuedQuality(
      { resolution: "1080p", codec: "AVC", hdr: "", audioCodec: "AAC" },
      detected,
    );
    expect(q.resolution).toBe("1080p");
    expect(q.codec).toBe("AVC");
    expect(q.hdr).toBeNull();
  });

  it("treats an emptied dropdown as no value", () => {
    const q = resolveQueuedQuality(
      { resolution: "", codec: "", hdr: "", audioCodec: "" },
      detected,
    );
    expect(q).toEqual({ resolution: null, codec: null, hdr: null, audioCodec: null });
  });

  it("falls back to detection when the form never reported a choice", () => {
    expect(resolveQueuedQuality(undefined, detected)).toEqual(detected);
  });
});

describe("tmdbIdTag", () => {
  it("writes the Plex-style tag for a real id", () => {
    expect(tmdbIdTag(1234567)).toBe("{tmdb-1234567}");
  });

  it("writes nothing without a usable id, so the current matching applies", () => {
    expect(tmdbIdTag(undefined)).toBe("");
    expect(tmdbIdTag(null)).toBe("");
    expect(tmdbIdTag(0)).toBe("");
    expect(tmdbIdTag(-3)).toBe("");
    expect(tmdbIdTag(1.5)).toBe("");
  });

  it("appends the tag to a name with a space", () => {
    expect(withTmdbIdTag("Atrapadas en Bolivia (2025) S01 WEB-DL 1080p", 321)).toBe(
      "Atrapadas en Bolivia (2025) S01 WEB-DL 1080p {tmdb-321}",
    );
    expect(withTmdbIdTag("Serie S01", undefined)).toBe("Serie S01");
  });
});
