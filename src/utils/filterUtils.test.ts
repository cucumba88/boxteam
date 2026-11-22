import { describe, expect, it } from "vitest";
import {
  normalizeCodec,
  normalizeHdr,
  normalizeReleaseType,
  normalizeResolution,
} from "./filterUtils";
import { foldForSearch } from "./textSearch";
import { firstCharBucket, titleSortKey } from "./alphaJump";

describe("normalizeResolution", () => {
  it.each([
    ["2160p", "2160P"],
    ["4K", "2160P"],
    ["1080p", "1080P"],
    [" 1080i ", "1080P"],
    ["720p", "720P"],
    ["480p", "480P"],
    ["576p", "576P"],
    ["", ""],
    [undefined, ""],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeResolution(raw)).toBe(expected);
  });
});

describe("normalizeReleaseType", () => {
  it.each([
    ["BDRemux", "BDREMUX"],
    ["BDRip", "BDRIP"],
    ["BluRay", "BLURAY"],
    ["Blu-Ray", "BLURAY"],
    ["WEB-DL", "WEB-DL"],
    ["webdl", "WEB-DL"],
    ["WEB DL", "WEB-DL"],
    ["WEBRip", "WEBRIP"],
    ["WEB-Rip", "WEBRIP"],
    ["HDTV", "HDTV"],
    ["DVDRip", "DVDRIP"],
    ["CAM", "CAM"],
    ["", ""],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeReleaseType(raw)).toBe(expected);
  });
});

describe("normalizeCodec", () => {
  it.each([
    ["x265", "HEVC"],
    ["H.265", "HEVC"],
    ["hevc", "HEVC"],
    ["x264", "AVC"],
    ["H264", "AVC"],
    ["AVC", "AVC"],
    ["AV1", "AV1"],
    ["vp9", "VP9"],
    ["", ""],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeCodec(raw)).toBe(expected);
  });
});

describe("normalizeHdr", () => {
  it("puts Dolby Vision first", () => {
    expect(normalizeHdr("DV+HDR10")).toBe("DV");
    expect(normalizeHdr("HDR10+")).toBe("HDR10+");
    expect(normalizeHdr("SDR")).toBe("");
    expect(normalizeHdr(undefined)).toBe("");
  });
});

describe("search and A–Z rail", () => {
  it("search folds accents and case", () => {
    expect(foldForSearch("Pequeña CANCIÓN")).toBe("pequena cancion");
  });

  it("sort key and bucket ignore accents, not articles", () => {
    expect(titleSortKey("  Ámbar ")).toBe("ambar");
    expect(firstCharBucket("Ámbar")).toBe("A");
    expect(firstCharBucket("La mujer")).toBe("L");
    expect(firstCharBucket("Ñu")).toBe("N");
    expect(firstCharBucket("1917")).toBe("#");
    expect(firstCharBucket("")).toBe("#");
  });
});
