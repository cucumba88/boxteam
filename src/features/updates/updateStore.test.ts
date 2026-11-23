import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn(async () => {}) }));

import {
  __resetUpdateStore,
  downloadPercent,
  getUpdateState,
  installUpdate,
  isMissingPlatformError,
} from "./updateStore";

describe("downloadPercent", () => {
  it("is null until the size is known", () => {
    expect(downloadPercent({ downloaded: 10, total: null })).toBeNull();
    expect(downloadPercent({ downloaded: 10, total: 0 })).toBeNull();
  });

  it("rounds and caps at 100", () => {
    expect(downloadPercent({ downloaded: 1, total: 3 })).toBe(33);
    expect(downloadPercent({ downloaded: 5, total: 4 })).toBe(100);
  });
});

describe("installUpdate", () => {
  it("tracks download progress and restarts when done", async () => {
    const seen: Array<number | null> = [];
    __resetUpdateStore({
      update: {
        version: "9.9.9",
        downloadAndInstall: async (onEvent) => {
          onEvent?.({ event: "Started", data: { contentLength: 200 } });
          onEvent?.({ event: "Progress", data: { chunkLength: 50 } });
          seen.push(downloadPercent(getUpdateState()));
          onEvent?.({ event: "Progress", data: { chunkLength: 150 } });
          seen.push(downloadPercent(getUpdateState()));
          onEvent?.({ event: "Finished" });
        },
      },
    });
    await installUpdate();
    expect(seen).toEqual([25, 100]);
    expect(getUpdateState().status).toBe("restarting");
  });

  it("keeps the version on offer when the install fails", async () => {
    __resetUpdateStore({
      update: {
        version: "9.9.9",
        downloadAndInstall: async () => {
          throw new Error("signature mismatch");
        },
      },
    });
    await installUpdate();
    expect(getUpdateState()).toMatchObject({
      status: "error",
      version: "9.9.9",
      error: "signature mismatch",
    });
  });
});

describe("isMissingPlatformError", () => {
  it("recognises a release that has no package for this platform yet", () => {
    expect(
      isMissingPlatformError(
        'None of the fallback platforms `["darwin-aarch64-app", "darwin-aarch64"]` were found in the response `platforms` object',
      ),
    ).toBe(true);
  });

  it("leaves real failures alone", () => {
    expect(isMissingPlatformError(new Error("error sending request for url"))).toBe(false);
    expect(isMissingPlatformError("signature verification failed")).toBe(false);
  });
});
