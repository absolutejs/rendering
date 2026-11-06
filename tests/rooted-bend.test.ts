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
