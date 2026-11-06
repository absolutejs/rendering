import { test, expect } from "bun:test";
import { Box3, Ray, Vector3 } from "three";
import { PreparedBoundsIndex } from "../src/visibility";
const box = (min: number[], max: number[]) =>
  new Box3(
    new Vector3(...(min as [number, number, number])),
    new Vector3(...(max as [number, number, number])),
  );
const ray = (origin = [0, 0, 0], direction = [0, 0, 1]) =>
  new Ray(
    new Vector3(...(origin as [number, number, number])),
    new Vector3(...(direction as [number, number, number])),
  );
test("immutable exact candidates have stable distance/id order and world-unit segments", () => {
  const a = box([-1, -1, 2], [1, 1, 3]),
    b = box([-1, -1, 2], [1, 1, 5]);
  const origin = new Vector3();
  const owner = new PreparedBoundsIndex(
    [
      { id: 9, bounds: b },
      { id: 2, bounds: a },
    ],
    { revision: "world-a", origin },
  );
  a.translate(new Vector3(100, 0, 0));
  b.makeEmpty();
  origin.set(100, 0, 0);
  expect(owner.query(ray([0, 0, 0], [0, 0, 4]))).toMatchObject({
    revision: "world-a",
    status: "complete",
    candidates: [
      { id: 2, near: 2, far: 3 },
      { id: 9, near: 2, far: 5 },
    ],
  });
  expect(owner.query(ray(), { near: 3, far: 3 }).candidates).toEqual([
    { id: 2, near: 3, far: 3 },
    { id: 9, near: 3, far: 3 },
  ]);
  expect(owner.query(ray(), { far: 1 }).candidates).toEqual([]);
  expect(owner.query(ray([0, 0, 0], [0, 0, 1e-300])).candidates).toEqual(
    owner.query(ray()).candidates,
  );
  expect(owner.size).toBe(2);
  owner.dispose();
  owner.dispose();
  expect(owner.size).toBe(0);
  expect(() => owner.query(ray())).toThrow("disposed");
});
test("captured Float32 grazing rejection is repaired at construction without query dilation", () => {
  const bounds = box(
    [621.166823888134, 16.870145068535884, 359.2432070770047],
    [629.9889458309318, 23.678413633937225, 368.07061235587753],
  );
  const owner = new PreparedBoundsIndex(
    [
      { id: 68, bounds },
      { id: 0, bounds: box([800, 50, 500], [801, 51, 501]) },
    ],
    { revision: "grazing" },
  );
  const result = owner.query(
    ray([620.166823888134, 16.870145068535884, 359.2432070770047], [1, 0, 0]),
  );
  expect(result.candidates?.map((x) => x.id)).toEqual([68]);
  expect(result.candidates![0]!.near).toBe(1);
  expect(
    owner.query(
      ray([620, 16.870145068535884 - 1e-7, 359.2432070770047], [1, 0, 0]),
    ).candidates,
  ).toEqual([]);
  owner.dispose();
});
test("zero-sized/subnormal boxes and boundary-only segments retain exact semantics", () => {
  for (const value of [-1e-100, 0, 1e-100]) {
    const owner = new PreparedBoundsIndex(
      [{ id: 0, bounds: box([value, 0, 1], [value, 0, 1]) }],
      { revision: "point" },
    );
    expect(
      owner.query(ray([value, 0, 0]), { near: 1, far: 1 }).candidates,
    ).toEqual([{ id: 0, near: 1, far: 1 }]);
    owner.dispose();
  }
});
test("budgets bound geometry tests and never expose an incomplete candidate list", () => {
  const entries = Array.from({ length: 64 }, (_, id) => ({
    id,
    bounds: box([-1, -1, id + 1], [1, 1, id + 1.5]),
  }));
  const owner = new PreparedBoundsIndex(entries, { revision: "budget" });
  for (const limit of [0, 1, 2, 5, 32]) {
    const r = owner.query(ray(), { far: 100, maxBoundsTests: limit });
    expect(r.boundsTests).toBeLessThanOrEqual(limit);
    expect(r.status).toBe("budget-exhausted");
    expect(r.candidates).toBeNull();
  }
  expect(owner.query(ray(), { far: 100 }).candidates?.length).toBe(64);
  owner.dispose();
});
test("empty immutable owner is complete without spending a budget", () => {
  const owner = new PreparedBoundsIndex([], { revision: "empty" });
  expect(owner.query(ray(), { maxBoundsTests: 0 })).toEqual({
    revision: "empty",
    status: "complete",
    candidates: [],
    boundsTests: 0,
    callbacks: 0,
  });
  owner.dispose();
});
test("explicit local frame supports distant worlds and copied input", () => {
  const offset = new Vector3(1e10, 2e9, -1e10);
  const bounds = box([-2, -2, 3], [2, 2, 5]).translate(offset);
  const owner = new PreparedBoundsIndex([{ id: 4, bounds }], {
    revision: "distant",
    origin: offset,
  });
  expect(
    owner.query(new Ray(offset.clone(), new Vector3(0, 0, 1))).candidates,
  ).toEqual([{ id: 4, near: 3, far: 5 }]);
  expect(
    () =>
      new PreparedBoundsIndex([{ id: 4, bounds }], { revision: "no-origin" }),
  ).toThrow();
  owner.dispose();
});
test("invalid entries, revisions and query budgets fail before traversal", () => {
  const bounds = box([0, 0, 0], [1, 1, 1]);
  for (const entries of [
    [{ id: -1, bounds }],
    [
      { id: 1, bounds },
      { id: 1, bounds },
    ],
    [{ id: 0, bounds: box([2, 0, 0], [1, 1, 1]) }],
    [{ id: 0, bounds: box([NaN, 0, 0], [1, 1, 1]) }],
    Array.from({ length: 4097 }, (_, id) => ({ id, bounds })),
  ])
    expect(
      () => new PreparedBoundsIndex(entries, { revision: "bad" }),
    ).toThrow();
  expect(() => new PreparedBoundsIndex([], { revision: "" })).toThrow();
  const owner = new PreparedBoundsIndex([{ id: 1, bounds }], {
    revision: "valid",
  });
  for (const options of [
    { near: -1 },
    { far: Infinity },
    { near: 2, far: 1 },
    { maxBoundsTests: -1 },
    { maxBoundsTests: 1.5 },
  ])
    expect(() => owner.query(ray(), options)).toThrow();
  expect(() => owner.query(ray([0, 0, 0], [0, 0, 0]))).toThrow();
  expect(() => owner.query(ray([NaN, 0, 0]))).toThrow();
  owner.dispose();
});
test("deterministic heterogeneous bounds match independent Three ray-box checks", () => {
  let seed = 501;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const entries = Array.from({ length: 128 }, (_, id) => {
    const min = [random() * 50 - 25, random() * 20 - 10, random() * 50 - 25];
    return {
      id,
      bounds: box(
        min,
        min.map((v) => v + 0.01 + random() * 5),
      ),
    };
  });
  const owner = new PreparedBoundsIndex(entries, { revision: "oracle" });
  const hit = new Vector3();
  for (let i = 0; i < 512; i++) {
    const r = ray(
      [random() * 60 - 30, random() * 20 - 10, random() * 60 - 30],
      [random() - 0.5, random() - 0.5, random() - 0.5],
    );
    r.direction.normalize();
    const expected = entries
      .filter(
        ({ bounds }) =>
          bounds.containsPoint(r.origin) ||
          (r.intersectBox(bounds, hit) && hit.distanceTo(r.origin) <= 64),
      )
      .map((x) => x.id)
      .sort((a, b) => a - b);
    expect(
      owner
        .query(r)
        .candidates!.map((x) => x.id)
        .sort((a, b) => a - b),
    ).toEqual(expected);
  }
  owner.dispose();
});
