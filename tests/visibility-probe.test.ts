import { expect, test } from "bun:test";
import { Vector3 } from "three";
import {
  HemisphereVisibilityProbe,
  hemisphereVisibilityDirection,
  type VisibilityResult,
} from "../src/visibility";
const result = (status: VisibilityResult["status"]): VisibilityResult => ({
  status,
  boundsTests: 1,
  triangleTests: 1,
  alphaTests: 1,
  hitDistance: status === "occluded" ? 1 : null,
});

test("bounded steps match a single batch and exact constant visibility integrals", () => {
  for (const status of ["clear", "occluded"] as const) {
    let calls = 0;
    const p = new HemisphereVisibilityProbe(
      { revision: "trees:1", origin: new Vector3(), samples: 128 },
      () => {
        calls++;
        return result(status);
      },
    );
    expect(p.snapshot().accessibility).toBeNull();
    expect(p.snapshot().accessibilityUpper).toBe(1);
    for (let i = 0; i < 32; i++) {
      const s = p.step(4);
      expect(s.processed).toBe((i + 1) * 4);
      expect(calls).toBe((i + 1) * 4);
    }
    expect(p.snapshot().accessibility).toBe(status === "clear" ? 1 : 0);
    p.step(4);
    expect(calls).toBe(128);
  }
  const trace = (ray: any) =>
    result(ray.direction.y > 0.5 ? "clear" : "occluded");
  const a = new HemisphereVisibilityProbe(
    { revision: "a", origin: new Vector3(), samples: 128 },
    trace,
  );
  const b = new HemisphereVisibilityProbe(
    { revision: "a", origin: new Vector3(), samples: 128 },
    trace,
  );
  a.step(128);
  for (let i = 0; i < 128; i++) b.step(1);
  expect(a.snapshot()).toEqual(b.snapshot());
  expect(a.snapshot().accessibility).toBe(0.75);
});

test("exhausted and pending rays contribute uncertainty rather than clear sky", () => {
  let n = 0;
  const p = new HemisphereVisibilityProbe(
    { revision: "x", origin: new Vector3(), samples: 4 },
    () =>
      result(["clear", "occluded", "budget-exhausted", "clear"][n++] as any),
  );
  const partial = p.step(2);
  expect(partial.accessibility).toBeNull();
  expect(partial.accessibilityLower).toBe(0.0625);
  expect(partial.accessibilityUpper).toBe(0.8125);
  const done = p.step(2);
  expect(done.state).toBe("complete");
  expect(done.unresolved).toBe(1);
  expect(done.accessibility).toBeNull();
  expect(done.accessibilityLower).toBe(0.5);
  expect(done.accessibilityUpper).toBe(0.8125);
});

test("cancellation releases pending work and preserves revision for stale-result rejection", () => {
  let calls = 0;
  const p = new HemisphereVisibilityProbe(
    { revision: "tree-cut:2", origin: new Vector3() },
    () => {
      calls++;
      return result("clear");
    },
  );
  p.step(2);
  p.cancel();
  p.cancel();
  expect(p.snapshot().state).toBe("cancelled");
  expect(p.snapshot().revision).toBe("tree-cut:2");
  expect(p.snapshot().accessibility).toBeNull();
  expect(() => p.step(1)).toThrow("cancelled");
  expect(calls).toBe(2);
});

test("failed callbacks retry the same sample without corrupting origin or accumulating work", () => {
  const origin = new Vector3(1, 2, 3);
  let fail = true;
  const directions: number[][] = [];
  const p = new HemisphereVisibilityProbe(
    { revision: "a", origin, samples: 2 },
    (ray) => {
      expect(ray.origin.toArray()).toEqual([1, 2, 3]);
      directions.push(ray.direction.toArray());
      ray.origin.set(99, 99, 99);
      if (fail) {
        fail = false;
        throw Error("retry");
      }
      return result("clear");
    },
  );
  origin.set(9, 9, 9);
  expect(() => p.step(1)).toThrow("retry");
  expect(p.snapshot().processed).toBe(0);
  p.step(2);
  expect(directions[0]).toEqual(directions[1]);
  expect(p.snapshot().boundsTests).toBe(2);
  expect(p.snapshot().accessibility).toBe(1);
});

test("malformed and over-budget traces reject without accepting a sample", () => {
  for (const patch of [
    { boundsTests: 3 },
    { triangleTests: 3 },
    { alphaTests: 2 },
    { boundsTests: NaN },
    { status: "maybe" },
  ]) {
    const p = new HemisphereVisibilityProbe(
      {
        revision: "a",
        origin: new Vector3(),
        budget: { maxBoundsTests: 2, maxTriangleTests: 2 },
      },
      () => ({ ...result("clear"), ...patch }) as any,
    );
    expect(() => p.step(1)).toThrow();
    expect(p.snapshot().processed).toBe(0);
  }
  for (const patch of [
    { revision: "" },
    { samples: 0 },
    { samples: 4097 },
    { origin: new Vector3(NaN, 0, 0) },
    { budget: { near: 2, far: 1 } },
  ])
    expect(
      () =>
        new HemisphereVisibilityProbe(
          { revision: "a", origin: new Vector3(), ...patch },
          () => result("clear"),
        ),
    ).toThrow();
  const p = new HemisphereVisibilityProbe(
    { revision: "a", origin: new Vector3() },
    () => {
      expect(() => p.step(1)).toThrow("Reentrant");
      expect(() => p.cancel()).toThrow("running");
      return result("clear");
    },
  );
  expect(() => p.step(0)).toThrow();
  p.step(1);
  expect(p.snapshot().processed).toBe(1);
});

test("exported two-bit samples preserve pending, unresolved and cancellation without aliasing", () => {
  let n = 0;
  const probe = new HemisphereVisibilityProbe(
    { revision: "scene:2", origin: new Vector3(), samples: 5 },
    () =>
      result(
        (
          [
            "clear",
            "occluded",
            "budget-exhausted",
            "clear",
            "occluded",
          ] as const
        )[n++]!,
      ),
  );
  expect([...probe.exportSamples().packed]).toEqual([0, 0]);
  probe.step(3);
  const partial = probe.exportSamples();
  expect([...partial.packed]).toEqual([57, 0]);
  expect(partial.processed).toBe(3);
  partial.packed.fill(255);
  expect([...probe.exportSamples().packed]).toEqual([57, 0]);
  probe.step(2);
  const complete = probe.exportSamples();
  expect(complete.state).toBe("complete");
  expect([...complete.packed]).toEqual([121, 2]);
  probe.cancel();
  expect(probe.exportSamples().state).toBe("cancelled");
  expect([...probe.exportSamples().packed]).toEqual([121, 2]);
  expect(n).toBe(5);
});
test("exported direction addresses reproduce traced rays and failed callbacks remain pending", () => {
  let n = 0,
    fail = true;
  const probe = new HemisphereVisibilityProbe(
    { revision: "a", origin: new Vector3(), samples: 13 },
    (ray) => {
      expect(ray.direction.toArray()).toEqual(
        hemisphereVisibilityDirection(n, 13, new Vector3()).toArray(),
      );
      if (fail) {
        fail = false;
        throw Error("retry");
      }
      n++;
      return result("clear");
    },
  );
  expect(() => probe.step(1)).toThrow("retry");
  expect([...probe.exportSamples().packed]).toEqual([0, 0, 0, 0]);
  probe.step(13);
  expect([...probe.exportSamples().packed]).toEqual([85, 85, 85, 1]);
  expect(n).toBe(13);
  for (const args of [
    [-1, 1],
    [1, 1],
    [0, 0],
    [0, 4097],
    [0.5, 2],
    [0, NaN],
  ])
    expect(() =>
      hemisphereVisibilityDirection(args[0]!, args[1]!, new Vector3()),
    ).toThrow();
});
