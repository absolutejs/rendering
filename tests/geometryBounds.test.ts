import { test, expect } from "bun:test";
import { Box3, BoxGeometry, Vector3, Sphere } from "three";
import { leaseGeometryBounds } from "../src/geometryBounds";
test("shared padding merges without compounding and restores original object identities", () => {
  const g = new BoxGeometry(2, 2, 2);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const originalBox = g.boundingBox,
    originalSphere = g.boundingSphere;
  const a = leaseGeometryBounds(g, { x: 0.2, y: 0, z: 0.1 }),
    b = leaseGeometryBounds(g, { x: 0.1, y: 0.3, z: 0.4 });
  expect(g.boundingBox!.max.toArray()).toEqual([1.2, 1.3, 1.4]);
  expect(g.boundingSphere!.containsPoint(g.boundingBox!.max)).toBe(true);
  a.update({ x: 0.8, y: 0, z: 0 });
  expect(g.boundingBox!.max.toArray()).toEqual([1.8, 1.3, 1.4]);
  a.release();
  a.release();
  expect(g.boundingBox!.max.toArray()).toEqual([1.1, 1.3, 1.4]);
  b.release();
  expect(g.boundingBox).toBe(originalBox);
  expect(g.boundingSphere).toBe(originalSphere);
  expect(a.active).toBe(false);
  expect(() => a.update({ x: 0, y: 0, z: 0 })).toThrow();
  g.dispose();
});
test("disposal ends all leases and null original bounds return without disposing geometry twice", () => {
  const g = new BoxGeometry();
  let events = 0;
  g.addEventListener("dispose", () => events++);
  const a = leaseGeometryBounds(g, { x: 1, y: 0, z: 0 }),
    b = leaseGeometryBounds(g, { x: 0, y: 1, z: 0 });
  g.dispose();
  expect(a.active).toBe(false);
  expect(b.active).toBe(false);
  expect(g.boundingBox).toBeNull();
  expect(g.boundingSphere).toBeNull();
  a.release();
  b.release();
  expect(events).toBe(1);
});
test("invalid changes are atomic, leases bounded, foreign replacement is preserved", () => {
  const g = new BoxGeometry();
  expect(() => leaseGeometryBounds(g, { x: Infinity, y: 0, z: 0 })).toThrow();
  expect(g.boundingBox).toBeNull();
  const a = leaseGeometryBounds(g, { x: 1, y: 0, z: 0 }),
    before = g.boundingBox!.clone();
  expect(() => a.update({ x: -1, y: 0, z: 0 })).toThrow();
  expect(g.boundingBox).toEqual(before);
  const other = Array.from({ length: 63 }, () =>
    leaseGeometryBounds(g, { x: 0, y: 0, z: 0 }),
  );
  expect(() => leaseGeometryBounds(g, { x: 0, y: 0, z: 0 })).toThrow();
  const foreign = new Box3(new Vector3(-9, -9, -9), new Vector3(9, 9, 9));
  g.boundingBox = foreign;
  expect(() => a.update({ x: 0, y: 0, z: 0 })).toThrow();
  expect(g.boundingBox).toBe(foreign);
  expect(other.every((x) => !x.active)).toBe(true);
  other.forEach((x) => x.release());
  g.dispose();
});

test("invalid source bounds fail without changing the original bound objects", () => {
  const g = new BoxGeometry();
  const box = new Box3(
      new Vector3(-1e308, -1e308, -1e308),
      new Vector3(1e308, 1e308, 1e308),
    ),
    sphere = new Sphere(new Vector3(), 1);
  g.boundingBox = box;
  g.boundingSphere = sphere;
  expect(() => leaseGeometryBounds(g, { x: 1, y: 0, z: 0 })).toThrow();
  expect(g.boundingBox).toBe(box);
  expect(g.boundingSphere).toBe(sphere);
  g.dispose();
});
