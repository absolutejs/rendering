export type InvalidationClock = {
  now(): number;
  /** Call asynchronously; early callbacks are re-armed, late ones never catch up. */
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
};
const browserClock: InvalidationClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Coalesce requests into one immediate or trailing invalidation. This owns at
 * most one timer, does not draw, and never polls when no request is pending.
 * Read current scene state inside invalidate; intermediate requests are dropped.
 * The caller should share one owner per cached render product, not per mesh. */
export function createCoalescedInvalidation(options: {
  minimumIntervalMs: number;
  invalidate: () => void;
  clock?: InvalidationClock;
}) {
  const {
    minimumIntervalMs: interval,
    invalidate,
    clock = browserClock,
  } = options;
  if (
    !Number.isFinite(interval) ||
    interval < 1 ||
    interval > 60000 ||
    typeof invalidate !== "function" ||
    !clock ||
    !["now", "schedule", "cancel"].every(
      (k) => typeof clock[k as keyof InvalidationClock] === "function",
    )
  )
    throw Error("Invalid coalesced invalidation options");
  let disposed = false,
    pending = false,
    last = -Infinity,
    observed = -Infinity;
  let scheduled: { handle: unknown; token: number } | null = null,
    token = 0;
  let requested = 0,
    coalesced = 0,
    emitted = 0,
    failures = 0;
  function time() {
    const value = clock.now();
    if (!Number.isFinite(value) || value < observed)
      throw Error("Invalid invalidation clock");
    observed = value;
    return value;
  }
  function flush(now: number) {
    pending = false;
    last = now;
    emitted++;
    try {
      invalidate();
    } catch (error) {
      failures++;
      throw error;
    }
  }
  function arm(now: number) {
    if (disposed || !pending || scheduled) return;
    const current = ++token;
    const handle = clock.schedule(
      () => {
        if (disposed || scheduled?.token !== current) return;
        scheduled = null;
        const now = time();
        if (now - last < interval) arm(now);
        else if (pending) flush(now);
      },
      Math.max(0, interval - (now - last)),
    );
    scheduled = { handle, token: current };
  }
  return {
    request() {
      if (disposed) return false;
      const now = time();
      requested++;
      if (pending) coalesced++;
      pending = true;
      if (!scheduled && now - last >= interval) flush(now);
      else arm(now);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = false;
      token++;
      if (scheduled) {
        clock.cancel(scheduled.handle);
        scheduled = null;
      }
    },
    snapshot: () => ({
      requested,
      coalesced,
      emitted,
      failures,
      pending,
      scheduled: scheduled !== null,
      disposed,
      minimumIntervalMs: interval,
    }),
  };
}
