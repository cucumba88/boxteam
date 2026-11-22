import { describe, expect, it } from "vitest";
import {
  folderPath,
  formatBytes,
  formatDuration,
  formatLanguage,
  formatLanguages,
  formatQuality,
  formatReleaseType,
  formatResolution,
} from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [5 * 1024 ** 2, "5.0 MB"],
    [1.5 * 1024 ** 3, "1.50 GB"],
  ])("%d → %s", (n, expected) => {
    expect(formatBytes(n)).toBe(expected);
  });
});

describe("folderPath", () => {
  it("drops the last segment and normalises slashes", () => {
    expect(folderPath("/media/Pelis/Peli.2020.1080p/peli.mkv")).toBe("/media/Pelis/Peli.2020.1080p");
    expect(folderPath("\\media\\Series\\ep.mkv")).toBe("/media/Series");
    expect(folderPath("/media/Pelis/")).toBe("/media");
    expect(folderPath("peli.mkv")).toBe("peli.mkv");
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [59, "59s"],
    [61, "1m 1s"],
    [3600, "1h 0m"],
    [7325, "2h 2m"],
  ])("%d → %s", (secs, expected) => {
    expect(formatDuration(secs)).toBe(expected);
  });
});

describe("languages", () => {
  it("maps ISO 639-1 and 639-2 codes, any case", () => {
    expect(formatLanguage("spa")).toBe("Español");
    expect(formatLanguage("ES")).toBe("Español");
    expect(formatLanguage("ger")).toBe("Alemán");
    expect(formatLanguage("DEU")).toBe("Alemán");
    expect(formatLanguage("xyz")).toBe("XYZ");
    expect(formatLanguages(["spa", "eng"])).toBe("Español · Inglés");
  });
});

describe("quality labels", () => {
  it("one spelling for release types and resolutions", () => {
    expect(formatReleaseType("WEBRIP")).toBe("WEBRip");
    expect(formatReleaseType("web dl")).toBe("WEB-DL");
    expect(formatReleaseType("WEBDL")).toBe("WEB-DL");
    expect(formatReleaseType("bdremux")).toBe("BDRemux");
    expect(formatReleaseType("Other")).toBe("Other");
    expect(formatReleaseType(null)).toBe("");
    expect(formatResolution("2160P")).toBe("4K");
    expect(formatResolution("UHD")).toBe("4K");
    expect(formatResolution("1080P")).toBe("1080p");
    expect(formatResolution("SD")).toBe("SD");
  });

  it("joins what is known", () => {
    expect(formatQuality("WEB-DL", "1080P")).toBe("WEB-DL · 1080p");
    expect(formatQuality(null, "2160p")).toBe("4K");
    expect(formatQuality(undefined, undefined)).toBe("");
  });
});
