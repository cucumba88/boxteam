import { describe, expect, it } from "vitest";
import {
  audioFilenameToken,
  audioLabel,
  canonicalAudio,
  canonicalHdr,
  formatChannels,
  hdrFilterKeys,
  hdrLabel,
  hdrShortLabel,
  isNotableHdr,
  isPremiumAudio,
  isPremiumHdr,
  matchesHdrFilter,
  mergeHdrValues,
  parseHdr,
} from "./techTags";

describe("parseHdr / canonicalHdr", () => {
  it.each([
    // stored canonical values round-trip
    ["DV", "DV"],
    ["DV+HDR10", "DV+HDR10"],
    ["DV+HDR10+", "DV+HDR10+"],
    ["DV+HLG", "DV+HLG"],
    ["HDR10+", "HDR10+"],
    ["HDR10", "HDR10"],
    ["HLG", "HLG"],
    ["HDR", "HDR"],
    ["SDR", "SDR"],
    // pre-v0.16 spellings
    ["HDR10+DV", "DV+HDR10"],
    ["HDR+DV", "DV+HDR"],
    // raw / user-typed spellings
    ["Dolby Vision", "DV"],
    ["DoVi HDR10", "DV+HDR10"],
    ["hdr10plus", "HDR10+"],
    ["HDR10 Plus", "HDR10+"],
    ["dv hdr10+", "DV+HDR10+"],
    // DV over SDR is just DV
    ["DV SDR", "DV"],
    // unknown / empty
    ["", ""],
    [null, ""],
    [undefined, ""],
    ["foo", ""],
  ])("%s → %s", (raw, expected) => {
    expect(canonicalHdr(raw)).toBe(expected);
  });

  it("keeps the strongest base layer when several are named", () => {
    expect(parseHdr("HDR HDR10 HLG")).toEqual({ dv: false, base: "HDR10" });
  });

  it("does not read DV inside other words", () => {
    expect(parseHdr("DVDRIP").dv).toBe(false);
  });
});

describe("mergeHdrValues", () => {
  it("keeps DV from either side and the strongest base", () => {
    expect(mergeHdrValues("DV", "HDR10")).toBe("DV+HDR10");
    expect(mergeHdrValues("HDR10+", "DV+HDR10")).toBe("DV+HDR10+");
    expect(mergeHdrValues("", "HLG")).toBe("HLG");
    expect(mergeHdrValues(null, undefined)).toBe("");
  });
});

describe("HDR labels", () => {
  it("long and short labels", () => {
    expect(hdrLabel("DV+HDR10+")).toBe("Dolby Vision · HDR10+");
    expect(hdrLabel("DV")).toBe("Dolby Vision");
    expect(hdrLabel("HDR10")).toBe("HDR10");
    expect(hdrShortLabel("DV+HDR10")).toBe("DV · HDR10");
    expect(hdrShortLabel("HDR10+DV")).toBe("DV · HDR10");
  });

  it("falls back to the raw value when unknown", () => {
    expect(hdrLabel("Weird")).toBe("Weird");
    expect(hdrShortLabel(null)).toBe("");
  });

  it("premium and notable", () => {
    expect(isPremiumHdr("DV")).toBe(true);
    expect(isPremiumHdr("HDR10+")).toBe(true);
    expect(isPremiumHdr("HDR10")).toBe(false);
    expect(isNotableHdr("HLG")).toBe(true);
    expect(isNotableHdr("HDR")).toBe(false);
    expect(isNotableHdr("SDR")).toBe(false);
  });
});

describe("HDR filters", () => {
  it("DV+HDR10 counts for DV, HDR10 and the generic HDR filter", () => {
    expect(hdrFilterKeys("DV+HDR10").sort()).toEqual(["DV", "HDR", "HDR10"]);
  });

  it("SDR and empty count for nothing", () => {
    expect(hdrFilterKeys("SDR")).toEqual([]);
    expect(hdrFilterKeys("")).toEqual([]);
  });

  it("legacy HDR10+DV matches the HDR10 filter, not HDR10+", () => {
    expect(matchesHdrFilter("HDR10+DV", "HDR10")).toBe(true);
    expect(matchesHdrFilter("HDR10+DV", "HDR10+")).toBe(false);
    expect(matchesHdrFilter("HDR10+DV", "DV")).toBe(true);
  });

  it("an empty filter matches everything", () => {
    expect(matchesHdrFilter(null, "")).toBe(true);
  });
});

describe("canonicalAudio", () => {
  it.each([
    ["TrueHD Atmos", "TrueHD Atmos"],
    ["TRUEHD", "TrueHD"],
    ["True-HD 7.1 Atmos", "TrueHD Atmos"],
    ["DTS-X", "DTS:X"],
    ["DTS:X", "DTS:X"],
    ["DTS-HD MA", "DTS-HD MA"],
    ["DTS HD MA 5.1", "DTS-HD MA"],
    ["DTS-HD HRA", "DTS-HD HRA"],
    ["DTS-HD", "DTS-HD"],
    ["DTS", "DTS"],
    ["EAC3 + Atmos", "EAC3 Atmos"],
    ["DDP5.1 Atmos", "EAC3 Atmos"],
    ["DD+", "EAC3"],
    ["E-AC-3", "EAC3"],
    ["Dolby Digital Plus", "EAC3"],
    ["AC3", "AC3"],
    ["DD 5.1", "AC3"],
    ["Dolby Digital", "AC3"],
    ["AAC 2.0", "AAC"],
    ["FLAC", "FLAC"],
    ["LPCM", "PCM"],
    ["opus", "Opus"],
    ["MP3", "MP3"],
    ["Atmos", "Atmos"],
    ["", ""],
    [null, ""],
    ["Vorbis", "Vorbis"],
  ])("%s → %s", (raw, expected) => {
    expect(canonicalAudio(raw)).toBe(expected);
  });
});

describe("audio labels and filename tokens", () => {
  it("shows EAC3 as DD+ and AC3 as Dolby Digital", () => {
    expect(audioLabel("EAC3")).toBe("DD+");
    expect(audioLabel("EAC3 Atmos")).toBe("DD+ Atmos");
    expect(audioLabel("AC3")).toBe("Dolby Digital");
    expect(audioLabel("TrueHD Atmos")).toBe("TrueHD Atmos");
  });

  it("premium audio", () => {
    expect(isPremiumAudio("TrueHD Atmos")).toBe(true);
    expect(isPremiumAudio("DTS:X")).toBe(true);
    expect(isPremiumAudio("DTS-HD MA")).toBe(true);
    expect(isPremiumAudio("FLAC")).toBe(true);
    expect(isPremiumAudio("AAC")).toBe(false);
    expect(isPremiumAudio("EAC3")).toBe(false);
  });

  it("filename tokens never contain a colon and use the separator", () => {
    expect(audioFilenameToken("DTS:X")).toBe("DTS-X");
    expect(audioFilenameToken("TrueHD Atmos")).toBe("TrueHD.Atmos");
    expect(audioFilenameToken("TrueHD Atmos", " ")).toBe("TrueHD Atmos");
    expect(audioFilenameToken("")).toBe("");
    for (const raw of ["DTS:X", "DTS-X", "TrueHD Atmos", "EAC3 Atmos", "DTS-HD MA"]) {
      expect(audioFilenameToken(raw)).not.toMatch(/[:\s]/);
    }
  });

  it.each([
    [null, ""],
    [0, ""],
    [1, "1.0"],
    [2, "2.0"],
    [3, "2.1"],
    [6, "5.1"],
    [7, "6.1"],
    [8, "7.1"],
    [10, "10.0"],
  ])("formatChannels(%s) → %s", (n, expected) => {
    expect(formatChannels(n)).toBe(expected);
  });
});
