/**
 * Shared speed bookkeeping for downloads and uploads.
 *
 * Two sources feed a transfer's progress:
 *   • desktop: `*:progress` events (accurate backend timestamps), plus a
 *     1.2 s `get_*` poll that keeps several clients in sync;
 *   • web: only the poll.
 *
 * Mixing both into one smoothing state made the desktop speed jump around
 * (a poll sample right after an event reads as "0 bytes in N ms", the next
 * event then reads as a burst), so on desktop the poll no longer touches
 * speed or bytes of an item that events are driving.
 *
 * A transfer with no new bytes for STALL_MS reports speed 0 so the UI can say
 * "waiting for the server" instead of freezing the last speed forever.
 */

export const STALL_MS = 6000;
const UI_PATCH_MS = 900;

interface Sample {
  ts: number;
  bytes: number;
  /** Last time bytes actually moved. */
  movedAt: number;
  uiTs?: number;
  smoothedBps?: number;
}

export interface SpeedFields {
  id: number;
  bytes_done: number;
  bytes_total: number;
  speed_bps?: number;
}

export function createSpeedTracker() {
  const samples: Record<number, Sample> = {};

  const blend = (prev: number | undefined, instant: number) =>
    prev == null ? instant : prev * 0.65 + instant * 0.35;

  /** Progress event. Returns a speed to patch into state, or undefined to skip (throttled). */
  function onEvent(id: number, bytes: number, ts: number): number | undefined {
    const prev = samples[id];
    if (!prev) {
      samples[id] = { ts, bytes, movedAt: ts };
      return undefined;
    }
    const dt = ts - prev.ts;
    const dBytes = bytes - prev.bytes;
    if (dt <= 0) return undefined;
    const smoothed = dBytes >= 0 ? blend(prev.smoothedBps, (dBytes / dt) * 1000) : prev.smoothedBps;
    const patch = prev.uiTs == null || ts - prev.uiTs >= UI_PATCH_MS;
    samples[id] = {
      ts,
      bytes,
      movedAt: dBytes > 0 ? ts : prev.movedAt,
      uiTs: patch ? ts : prev.uiTs,
      smoothedBps: smoothed,
    };
    return patch ? smoothed : undefined;
  }

  /** Forget an item that is no longer transferring. */
  function reset(id: number) {
    delete samples[id];
  }

  /**
   * Merge a polled snapshot into current state.
   * @param isActive   status predicate ("downloading" / "uploading")
   * @param eventsDriven true on desktop, where progress events own bytes/speed
   */
  function onSnapshot<T extends SpeedFields>(
    fresh: T[],
    current: T[],
    isActive: (item: T) => boolean,
    eventsDriven: boolean,
  ): T[] {
    const now = Date.now();
    const byId = new Map(current.map((item) => [item.id, item]));
    return fresh.map((item) => {
      if (!isActive(item)) {
        reset(item.id);
        return { ...item, speed_bps: undefined };
      }
      const existing = byId.get(item.id);
      const sample = samples[item.id];
      const stalled = !!sample && now - sample.movedAt > STALL_MS;

      if (eventsDriven) {
        if (!existing || !isActive(existing)) return { ...item, speed_bps: undefined };
        // Never let a (slightly older) poll move the bar backwards.
        return {
          ...item,
          bytes_done: Math.max(item.bytes_done, existing.bytes_done),
          bytes_total: item.bytes_total || existing.bytes_total,
          speed_bps: stalled ? 0 : existing.speed_bps,
        };
      }

      // Web: the poll is the only source.
      if (!sample) {
        samples[item.id] = { ts: now, bytes: item.bytes_done, movedAt: now };
        return { ...item, speed_bps: undefined };
      }
      const dt = now - sample.ts;
      const dBytes = item.bytes_done - sample.bytes;
      const smoothed =
        dt > 0 && dBytes >= 0 ? blend(sample.smoothedBps, (dBytes / dt) * 1000) : sample.smoothedBps;
      const movedAt = dBytes > 0 ? now : sample.movedAt;
      samples[item.id] = { ts: now, bytes: item.bytes_done, movedAt, smoothedBps: smoothed };
      return { ...item, speed_bps: now - movedAt > STALL_MS ? 0 : smoothed };
    });
  }

  return { onEvent, onSnapshot, reset };
}

/** Prepend `item` unless a row with the same id is already there (poll got it first). */
export function addUnique<T extends { id: number }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list : [item, ...list];
}
