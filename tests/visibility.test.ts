import { expect, test } from "bun:test";
import {
  BufferGeometry,
  BufferAttribute,
  Ray,
  Vector3,
  BoxGeometry,
} from "three";
import { PreparedAlphaVisibility } from "../src/visibility";
const ray = (x = 0, y = 0) =>
  new Ray(new Vector3(x, y, 0), new Vector3(0, 0, 1));
function planes(rows: { z: number; u: number; x?: number }[]) {
  const g = new BufferGeometry(),
    p: number[] = [],
    uv: number[] = [];
  for (const row of rows) {
    const x = row.x ?? 0;
    p.push(x - 1, -1, row.z, x + 1, -1, row.z, x, 1, row.z);
    uv.push(row.u, 0.5, row.u, 0.5, row.u, 0.5);
  }
  g.setAttribute("position", new BufferAttribute(new Float64Array(p), 3));
  g.setAttribute("uv", new BufferAttribute(new Float64Array(uv), 2));
  return g;
}
const alpha = () => ({ data: new Uint8Array([0, 255]), width: 2, height: 1 });
test("transparent cards do not hide an opaque leaf behind them", () => {
  const q = new PreparedAlphaVisibility(
    planes([
      { z: 1, u: 0.25 },
      { z: 2, u: 0.75 },
    ]),
    alpha(),
  );
  const r = q.query(ray());
  expect(r.status).toBe("occluded");
  expect(r.hitDistance).toBe(2);
  expect(r.alphaTests).toBe(2);
  expect(q.query(ray(), { far: 1.5 }).status).toBe("clear");
  expect(q.query(ray(), { near: 2.1, far: 3 }).status).toBe("clear");
  expect(q.query(ray(4)).status).toBe("clear");
  q.dispose();
});
test("bilinear cutoff, repeat wrapping and two-sided rays have explicit semantics", () => {
  for (const [u, wrap, expected] of [
    [0.5, "clamp", "occluded"],
    [0.49, "clamp", "clear"],
    [1.25, "repeat", "clear"],
    [1.25, "clamp", "occluded"],
    [-0.25, "repeat", "occluded"],
  ] as const) {
    const q = new PreparedAlphaVisibility(planes([{ z: 1, u }]), {
      ...alpha(),
      wrapS: wrap,
    });
    expect(q.query(ray()).status).toBe(expected);
    expect(
      q.query(new Ray(new Vector3(0, 0, 2), new Vector3(0, 0, -2))).status,
    ).toBe(expected);
    q.dispose();
  }
});
test("budgets never report clear sky when transparent traversal is incomplete", () => {
  const g = planes(
    Array.from({ length: 32 }, (_, i) => ({ z: i + 1, u: 0.25 })),
  );
  const q = new PreparedAlphaVisibility(g, alpha());
  const triangleLimited = q.query(ray(), { maxTriangleTests: 1 });
  expect(triangleLimited.status).toBe("budget-exhausted");
  expect(triangleLimited.triangleTests).toBe(1);
  const boundsLimited = q.query(ray(), { maxBoundsTests: 1 });
  expect(boundsLimited.status).toBe("budget-exhausted");
  expect(boundsLimited.boundsTests).toBe(1);
  expect(q.query(ray()).status).toBe("clear");
  q.dispose();
});
test("owned snapshots survive caller mutation and release idempotently", () => {
  const g = planes([{ z: 1, u: 0.75 }]),
    a = alpha();
  const before = Array.from(g.getAttribute("position").array);
  const q = new PreparedAlphaVisibility(g, a);
  expect(Array.from(g.getAttribute("position").array)).toEqual(before);
  expect(g.index).toBeNull();
  g.getAttribute("position").array.fill(100);
  a.data.fill(0);
  expect(q.query(ray()).status).toBe("occluded");
  expect(q.ownedBytes).toBeGreaterThan(0);
  q.dispose();
  q.dispose();
  expect(q.ownedBytes).toBe(0);
  expect(() => q.query(ray())).toThrow("disposed");
});
test("a segment starting inside bounds is not rejected when its exit is beyond far", () => {
  const outer = new BoxGeometry(4, 4, 4, 2, 2, 2);
  outer.clearGroups();
  const positions = Array.from(
    outer.getAttribute("position").array as ArrayLike<number>,
  );
  const indices = Array.from(outer.index!.array as ArrayLike<number>);
  const offset = positions.length / 3;
  positions.push(-1, -1, 0.25, 1, -1, 0.25, 0, 1, 0.25);
  indices.push(offset, offset + 1, offset + 2);
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(new Float64Array(positions), 3),
  );
  g.setIndex(indices);
  const q = new PreparedAlphaVisibility(g);
  const r = q.query(ray(), { far: 0.5 });
  expect(r.status).toBe("occluded");
  expect(r.hitDistance).toBe(0.25);
  q.dispose();
  outer.dispose();
});
test("BVH reordering preserves per-triangle UV ownership across separated patches", () => {
  const rows = Array.from({ length: 48 }, (_, i) => ({
    x: (i % 8) * 4,
    z: 1 + Math.floor(i / 8) * 3,
    u: i % 3 === 0 ? 0.75 : 0.25,
  })).reverse();
  const q = new PreparedAlphaVisibility(planes(rows), alpha());
  for (let x = 0; x < 8; x++)
    for (let near = 0; near < 19; near += 0.7) {
      const expected = rows.some(
        (r) => r.x === x * 4 && r.z >= near && r.u === 0.75,
      );
      const result = q.query(ray(x * 4), { near, far: 20 });
      expect(result.status).toBe(expected ? "occluded" : "clear");
      if (result.hitDistance !== null)
        expect(
          rows.some(
            (r) => r.x === x * 4 && r.u === 0.75 && r.z === result.hitDistance,
          ),
        ).toBe(true);
    }
  q.dispose();
});
test("malformed geometry, alpha, budgets and rays reject before misleading visibility", () => {
  const g = planes([{ z: 1, u: 0.5 }]);
  expect(
    () => new PreparedAlphaVisibility(g, { ...alpha(), cutoff: 0 }),
  ).toThrow();
  expect(
    () => new PreparedAlphaVisibility(g, { ...alpha(), width: 4097 }),
  ).toThrow();
  expect(
    () =>
      new PreparedAlphaVisibility(g, { ...alpha(), data: new Uint8Array(3) }),
  ).toThrow();
  const q = new PreparedAlphaVisibility(g);
  for (const budget of [
    { near: -1 },
    { far: 0 },
    { maxBoundsTests: 0 },
    { maxTriangleTests: NaN },
  ])
    expect(() => q.query(ray(), budget)).toThrow();
  expect(() => q.query(new Ray(new Vector3(), new Vector3()))).toThrow();
  expect(() =>
    q.query(new Ray(new Vector3(NaN, 0, 0), new Vector3(0, 0, 1))),
  ).toThrow();
  q.dispose();
  g.setDrawRange(1, 2);
  expect(() => new PreparedAlphaVisibility(g)).toThrow();
});
test("floating indices and nonlocal extreme ray coordinates reject explicitly", () => {
  const g = planes([{ z: 1, u: 0.5 }]);
  g.setIndex(new BufferAttribute(new Float32Array([0, 1, 2]), 1));
  expect(() => new PreparedAlphaVisibility(g)).toThrow("integer");
  g.setIndex(null);
  const q = new PreparedAlphaVisibility(g);
  expect(() =>
    q.query(new Ray(new Vector3(1e100, 0, 0), new Vector3(0, 0, 1))),
  ).toThrow();
  q.dispose();
});

test("deformed queries share storage and match explicitly rebuilt geometry", () => {
  const g = planes(
    Array.from({ length: 48 }, (_, i) => ({
      x: (i % 8) * 4,
      z: 1 + Math.floor(i / 8) * 3,
      u: i % 3 === 0 ? 0.75 : 0.25,
    })),
  );
  const baked = g.clone(),
    position = baked.getAttribute("position");
  for (let i = 0; i < position.count; i++)
    position.setXYZ(
      i,
      position.getX(i) + 10,
      position.getY(i) * 2,
      position.getZ(i) + position.getX(i) ** 2 * 0.05,
    );
  const shared = new PreparedAlphaVisibility(g, alpha()),
    reference = new PreparedAlphaVisibility(baked, alpha()),
    bytes = shared.ownedBytes;
  const deformation = {
    point(source: Readonly<Vector3>, target: Vector3) {
      target.set(source.x + 10, source.y * 2, source.z + source.x ** 2 * 0.05);
    },
    bounds(
      source: Readonly<import("three").Box3>,
      target: import("three").Box3,
    ) {
      const squareMin =
        source.min.x <= 0 && source.max.x >= 0
          ? 0
          : Math.min(source.min.x ** 2, source.max.x ** 2);
      const squareMax = Math.max(source.min.x ** 2, source.max.x ** 2);
      target.min.set(
        source.min.x + 10,
        source.min.y * 2,
        source.min.z + squareMin * 0.05,
      );
      target.max.set(
        source.max.x + 10,
        source.max.y * 2,
        source.max.z + squareMax * 0.05,
      );
    },
  };
  for (let x = 9; x <= 40; x += 0.2)
    for (const y of [-0.5, 0.5]) {
      const r = ray(x, y),
        a = shared.query(r, { far: 100 }, deformation),
        b = reference.query(r, { far: 100 });
      expect(a.status).toBe(b.status);
    }
  expect(shared.ownedBytes).toBe(bytes);
  expect(shared.query(ray()).status).toBe("occluded");
  shared.dispose();
  reference.dispose();
});

test("deformation failures unwind BVH scratch and do not poison later owners or permit reentrancy", () => {
  const source = planes(
      Array.from({ length: 32 }, (_, i) => ({ z: i + 1, u: 0.75 })),
    ),
    q = new PreparedAlphaVisibility(source, alpha()),
    other = new PreparedAlphaVisibility(source, alpha());
  const normal = {
    bounds: (s: Readonly<import("three").Box3>, t: import("three").Box3) => {
      t.copy(s);
    },
    point: (s: Readonly<Vector3>, t: Vector3) => {
      t.copy(s);
    },
  };
  for (const deformation of [
    {
      ...normal,
      bounds: () => {
        throw Error("bounds failure");
      },
    },
    {
      ...normal,
      point: () => {
        throw Error("point failure");
      },
    },
    { ...normal, bounds: () => {} },
    { ...normal, point: () => {} },
    {
      ...normal,
      point: () => {
        q.query(ray());
      },
    },
    {
      ...normal,
      point: () => {
        q.dispose();
      },
    },
  ]) {
    expect(() => q.query(ray(), {}, deformation)).toThrow();
    expect(q.query(ray()).status).toBe("occluded");
    expect(other.query(ray()).status).toBe("occluded");
  }
  q.dispose();
  other.dispose();
});
