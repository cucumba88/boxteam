import { describe, expect, it, vi } from "vitest";
import {
  fetchIndexingRunning,
  joinedRunningPass,
  watchUntilIdle,
  type StatusCall,
  type Timers,
} from "./indexingStatus";

/** Timers that run only when the test says so. */
function manualTimers() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  const timers: Timers = {
    setTimeout: (fn) => {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    clearTimeout: (id) => {
      pending.delete(id);
    },
  };
  const runAll = async () => {
    const due = [...pending.entries()];
    pending.clear();
    for (const [, fn] of due) fn();
    // let the awaited isRunning() promise settle
    await Promise.resolve();
    await Promise.resolve();
  };
  return { timers, runAll, pendingCount: () => pending.size };
}

describe("joinedRunningPass", () => {
  it("is true only when the backend says no new pass started", () => {
    expect(joinedRunningPass({ started: false })).toBe(true);
    expect(joinedRunningPass({ running: true, started: false })).toBe(true);
    expect(joinedRunningPass({ started: true })).toBe(false);
    // Older backends answered with nothing (desktop) or no `started` (web).
    expect(joinedRunningPass(undefined)).toBe(false);
    expect(joinedRunningPass(null)).toBe(false);
    expect(joinedRunningPass({ running: true })).toBe(false);
  });
});

describe("fetchIndexingRunning", () => {
  it("reports a pass the scheduler started before the window listened", async () => {
    const call = vi.fn(async () => ({ running: true })) as unknown as StatusCall;
    await expect(fetchIndexingRunning(call)).resolves.toBe(true);
    expect(call).toHaveBeenCalledWith("get_indexing_status");
  });

  it("is false when idle or when the backend can't answer", async () => {
    const idle = (async () => ({ running: false })) as unknown as StatusCall;
    const broken = (async () => {
      throw new Error("unknown command");
    }) as unknown as StatusCall;
    await expect(fetchIndexingRunning(idle)).resolves.toBe(false);
    await expect(fetchIndexingRunning(broken)).resolves.toBe(false);
  });
});

describe("watchUntilIdle", () => {
  it("keeps asking while the pass runs and calls onIdle once it ends", async () => {
    const { timers, runAll, pendingCount } = manualTimers();
    const answers = [true, true, false];
    const isRunning = vi.fn(async () => answers.shift() ?? false);
    const onIdle = vi.fn();

    watchUntilIdle(isRunning, onIdle, 3000, timers);
    await runAll();
    await runAll();
    expect(onIdle).not.toHaveBeenCalled();
    await runAll();
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(isRunning).toHaveBeenCalledTimes(3);
    expect(pendingCount()).toBe(0);
  });

  it("stops without calling onIdle when cancelled", async () => {
    const { timers, runAll, pendingCount } = manualTimers();
    const onIdle = vi.fn();
    const stop = watchUntilIdle(async () => false, onIdle, 3000, timers);
    stop();
    expect(pendingCount()).toBe(0);
    await runAll();
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("ignores an answer that arrives after it was cancelled", async () => {
    const { timers, runAll } = manualTimers();
    let resolve: (running: boolean) => void = () => {};
    const onIdle = vi.fn();
    const stop = watchUntilIdle(
      () => new Promise<boolean>((r) => (resolve = r)),
      onIdle,
      3000,
      timers,
    );
    await runAll(); // tick started, waiting on isRunning
    stop();
    resolve(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(onIdle).not.toHaveBeenCalled();
  });
});
