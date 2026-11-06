import { test, expect } from "bun:test";
import { createCoalescedInvalidation } from "../src/coalescedInvalidation";
function harness() {
  let now = 0,
    next = 0;
  const queue = new Map<number, { at: number; fn: () => void }>();
  const clock = {
    now: () => now,
    schedule: (fn: () => void, delay: number) => {
      const id = next++;
      queue.set(id, { at: now + delay, fn });
      return id;
    },
    cancel: (id: unknown) => {
      queue.delete(id as number);
    },
  };
  return {
    clock,
    queue,
    set: (t: number) => {
      now = t;
    },
    advance: (t: number) => {
      for (;;) {
        const found = [...queue.entries()]
          .filter(([, e]) => e.at <= t)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!found) break;
        queue.delete(found[0]);
        now = found[1].at;
        found[1].fn();
      }
      now = t;
    },
  };
}
test("dense motion requests share one trailing refresh, retain newest state, and leave no idle timer", () => {
  const h = harness(),
    events: { time: number; phase: number }[] = [];
  let phase = 0;
  const owner = createCoalescedInvalidation({
    minimumIntervalMs: 100,
    clock: h.clock,
    invalidate: () => events.push({ time: h.clock.now(), phase }),
  });
  for (let i = 0; i < 1000; i++) {
    h.advance(i * 10);
    phase = i;
    owner.request();
    expect(h.queue.size).toBeLessThanOrEqual(1);
  }
  h.advance(10000);
  expect(events.length).toBe(101);
  expect(events.at(-1)?.phase).toBe(999);
  for (let i = 1; i < events.length; i++)
    expect(events[i]!.time - events[i - 1]!.time).toBeGreaterThanOrEqual(100);
  expect(owner.snapshot().pending).toBe(false);
  expect(h.queue.size).toBe(0);
  h.advance(50000);
  expect(events.length).toBe(101);
});
test("late callback emits once without replaying missed intervals; teardown rejects stale callbacks", () => {
  const h = harness();
  let calls = 0;
  const o = createCoalescedInvalidation({
    minimumIntervalMs: 100,
    clock: h.clock,
    invalidate: () => calls++,
  });
  o.request();
  h.set(1);
  o.request();
  const callback = [...h.queue.values()][0]!.fn;
  h.queue.clear();
  h.set(10000);
  callback();
  expect(calls).toBe(2);
  expect(h.queue.size).toBe(0);
  h.set(10001);
  o.request();
  const stale = [...h.queue.values()][0]!.fn;
  o.dispose();
  stale();
  expect(calls).toBe(2);
  expect(o.request()).toBe(false);
  expect(h.queue.size).toBe(0);
  o.dispose();
});
test("early callbacks rearm without violating the rate; callback failure is visible and recoverable", () => {
  const h = harness();
  let fail = true,
    calls = 0;
  const o = createCoalescedInvalidation({
    minimumIntervalMs: 100,
    clock: h.clock,
    invalidate: () => {
      calls++;
      if (fail) throw Error("fixture failure");
    },
  });
  expect(() => o.request()).toThrow("fixture failure");
  expect(o.snapshot().failures).toBe(1);
  fail = false;
  h.set(1);
  o.request();
  const early = [...h.queue.values()][0]!.fn;
  h.queue.clear();
  early();
  expect(calls).toBe(1);
  expect(h.queue.size).toBe(1);
  h.advance(100);
  expect(calls).toBe(2);
  expect(o.snapshot().emitted).toBe(2);
  h.set(99);
  expect(() => o.request()).toThrow("clock");
  o.dispose();
});
test("invalid construction and nonfinite clocks fail before invalidation", () => {
  for (const minimumIntervalMs of [0, -1, Infinity, NaN, 60001])
    expect(() =>
      createCoalescedInvalidation({ minimumIntervalMs, invalidate: () => {} }),
    ).toThrow();
  const h = harness();
  h.set(NaN);
  let calls = 0;
  const o = createCoalescedInvalidation({
    minimumIntervalMs: 100,
    clock: h.clock,
    invalidate: () => calls++,
  });
  expect(() => o.request()).toThrow();
  expect(calls).toBe(0);
  expect(o.snapshot().requested).toBe(0);
});
