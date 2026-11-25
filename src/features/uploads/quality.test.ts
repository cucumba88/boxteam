import { describe, expect, it } from "vitest";
import { resolveQueuedQuality } from "./quality";

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
