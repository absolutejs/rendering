import { test, expect } from "bun:test";
import { Box3, Vector3, ShaderLib } from "three";
import { createRootedBend, withRootedBend } from "../src/rootedBend";

test("rooted shear fixes roots, stays bounded and preserves tangent-normal orthogonality", () => {
  const bend = createRootedBend({
    height: 2,
    amplitudeX: 0.12,
    amplitudeZ: -0.07,
  });
  const source = new Box3(new Vector3(-1, -0.2, -1), new Vector3(1, 3, 1));
  const original = source.clone(),
    bound = bend.expandBounds(source);
  for (const phase of [0, 0.7, 2.2, 4.5, 6.28])
    for (const y of [-0.1, 0, 0.01, 0.3, 1, 1.99, 2, 2.5]) {
      const a = bend.sample(y, phase),
        eps = 1e-6;
      const lo = bend.sample(y - eps, phase),
        hi = bend.sample(y + eps, phase);
      expect(a.dxdy).toBeCloseTo((hi.x - lo.x) / (2 * eps), 5);
      expect(a.dzdy).toBeCloseTo((hi.z - lo.z) / (2 * eps), 5);
      const tangent = new Vector3(0.3, 1, -0.4),
        normal = new Vector3(1, -0.3, 0);
      tangent.x += a.dxdy * tangent.y;
      tangent.z += a.dzdy * tangent.y;
      normal.y -= a.dxdy * normal.x + a.dzdy * normal.z;
      expect(normal.dot(tangent)).toBeCloseTo(0, 12);
      if (y <= 0)
        expect([a.x, a.z, a.dxdy, a.dzdy].map(Math.abs)).toEqual([0, 0, 0, 0]);
      for (const x of [-1, 1])
        for (const z of [-1, 1])
          expect(bound.containsPoint(new Vector3(x + a.x, y, z + a.z))).toBe(
            true,
          );
    }
  expect(source).toEqual(original);
  expect(bend.expandBounds(source)).toEqual(bound);
  bend.setPhase(1e9);
  expect(bend.phase.value).toBeGreaterThanOrEqual(0);
  expect(bend.phase.value).toBeLessThan(2 * Math.PI);
  bend.setPhase(-0.5);
  expect(bend.sample(1)).toEqual(bend.sample(1, 2 * Math.PI - 0.5));
});
test("color and depth hooks share displacement and reject missing or repeated installation", () => {
  const color = withRootedBend(ShaderLib.standard.vertexShader),
    depth = withRootedBend(ShaderLib.depth.vertexShader, false);
  expect(color).toContain("objectNormal.y-=");
  expect(depth).not.toContain("objectNormal.y-=");
  expect(color).toContain("transformed.xz+=absBendPosition.xy;");
  expect(depth).toContain("transformed.xz+=absBendPosition.xy;");
  expect(() => withRootedBend(color)).toThrow();
  expect(() => withRootedBend("void main(){}")).toThrow();
});
test("invalid parameters, samples and bounds fail explicitly", () => {
  for (const height of [0, -1, NaN, Infinity, 10001])
    expect(() =>
      createRootedBend({ height, amplitudeX: 0, amplitudeZ: 0 }),
    ).toThrow();
  expect(() =>
    createRootedBend({ height: 1, amplitudeX: 0.3, amplitudeZ: 0 }),
  ).toThrow();
  const bend = createRootedBend({ height: 1, amplitudeX: 0, amplitudeZ: 0 });
  expect(() => bend.setPhase(NaN)).toThrow();
  expect(() => bend.sample(Infinity)).toThrow();
  expect(() =>
    bend.expandBounds(
      new Box3(new Vector3(-Infinity, 0, 0), new Vector3(1, 1, 1)),
    ),
  ).toThrow();
  expect(bend.expandBounds(new Box3()).isEmpty()).toBe(true);
});

test("projected motion bounds contain every sampled displacement under rotated, singular and stretched projections", () => {
  const bend = createRootedBend({
    height: 2,
    amplitudeX: 0.09,
    amplitudeZ: 0.045,
    verticalPhase: 1.2,
  });
  const projections: [number, number, number, number][] = [
    [1, 0, 0, 1],
    [14.22, 0, 0, 14.22],
    [1, 2, -3, 4],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, -2, 2, 0],
    [1e100, 0, 0, 1e100],
  ];
  for (const projection of projections)
    for (let i = 0; i < 24; i++)
      for (let j = 0; j < 24; j++) {
        const from = (i * Math.PI) / 12,
          to = (j * Math.PI) / 12,
          bound = bend.motionBound(from, to, projection);
        for (let k = 0; k <= 40; k++) {
          const p = bend.sample(k / 20, from),
            q = bend.sample(k / 20, to),
            x = q.x - p.x,
            z = q.z - p.z;
          const actual = Math.hypot(
            projection[0] * x + projection[1] * z,
            projection[2] * x + projection[3] * z,
          );
          expect(actual).toBeLessThanOrEqual(bound * (1 + 1e-12) + 1e-12);
        }
      }
  expect(bend.motionBound(0, 2 * Math.PI)).toBeLessThan(1e-15);
  expect(bend.motionBound(0, Math.PI)).toBeCloseTo(0.18, 12);
  expect(() => bend.motionBound(NaN, 0)).toThrow();
  expect(() => bend.motionBound(0, 1, [Infinity, 0, 0, 1])).toThrow();
});

test("motion query and CPU samples share shader phase wrapping even for extreme finite inputs", () => {
  const bend = createRootedBend({
    height: 2,
    amplitudeX: 0.09,
    amplitudeZ: 0.045,
  });
  for (const from of [-1e300, 1e300, -100, 0, 2 * Math.PI])
    for (const to of [-1e299, 1e299, 100, 0]) {
      const a = bend.sample(1.7, from),
        b = bend.sample(1.7, to);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(
        bend.motionBound(from, to) + 1e-12,
      );
      bend.setPhase(from);
      expect(bend.sample(1.7)).toEqual(a);
    }
});
