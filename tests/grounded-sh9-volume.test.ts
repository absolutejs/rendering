import { expect, test } from "bun:test";
import { MeshStandardMaterial, ShaderLib, type WebGLRenderer } from "three";
import { withLeafLighting } from "../src/leafLighting";
import {
  createGroundedSH9Volume,
  supportsGroundedSH9Volume,
  type GroundedSH9VolumeOptions,
  type GroundedSH9Upload,
} from "../src/groundedSH9Volume";
const layout = (): GroundedSH9VolumeOptions => ({
  resolution: [3, 3],
  elevations: [0.15, 2, 8],
  size: [16, 16],
  lowerFade: [-0.5, 0],
  upperFade: [7, 8],
});
const payload = (o = layout()): GroundedSH9Upload => ({
  revision: "scene",
  lightingRevision: "sky",
  center: [12, -8],
  coefficients: Array.from({ length: 7 }, (_, i) =>
    new Float32Array(
      o.resolution[0] * o.resolution[1] * o.elevations.length * 4,
    ).fill(i / 10),
  ),
  ground: new Float32Array(o.resolution[0] * o.resolution[1] * 4).fill(2),
  open: Array(27).fill(1),
});
const renderer = (supported = true) =>
  ({ extensions: { has: () => supported } }) as unknown as WebGLRenderer;
const shader = () =>
  ({
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
  }) as Parameters<MeshStandardMaterial["onBeforeCompile"]>[0];
test("bounded layout validates before allocation and copies configuration", () => {
  for (const options of [
    { ...layout(), resolution: [1, 3] },
    { ...layout(), resolution: [65, 3] },
    { ...layout(), elevations: [2, 2] },
    { ...layout(), elevations: Array(9).fill(1) },
    { ...layout(), size: [0, 16] },
    { ...layout(), edgeFadeStart: 0.999999999 },
    { ...layout(), lowerFade: [0, 1e-30] },
    { ...layout(), upperFade: [7, 9] },
  ])
    expect(() =>
      createGroundedSH9Volume(options as GroundedSH9VolumeOptions),
    ).toThrow();
  const options = layout(),
    owner = createGroundedSH9Volume(options),
    p = payload();
  (options.elevations as number[])[1] = 7;
  (options.resolution as number[])[0] = 64;
  owner.upload(p, p);
  expect(owner.snapshot().textureBytes).toBe(3168);
  owner.dispose();
});
test("uploads copy data, reuse uniforms and storage, reject stale/malformed input atomically", () => {
  const owner = createGroundedSH9Volume(layout()),
    m = new MeshStandardMaterial();
  owner.bind(m, "indirect-diffuse");
  const s = shader();
  m.onBeforeCompile(s, renderer());
  const volume = s.uniforms.absShVolume!.value,
    ground = s.uniforms.absShGround!.value,
    storage = volume.image.data,
    strength = s.uniforms.absShStrength,
    center = s.uniforms.absShCenter;
  const p = payload();
  owner.upload(p, p);
  expect(volume.image.width).toBe(3);
  expect(volume.image.height).toBe(3);
  expect(volume.image.depth).toBe(21);
  expect(storage[108]).toBeCloseTo(0.1);
  p.coefficients[1]![0] = 99;
  p.ground[0] = 99;
  expect(storage[108]).toBeCloseTo(0.1);
  expect(ground.image.data[0]).toBe(2);
  for (const bad of [
    { ...payload(), revision: "" },
    { ...payload(), center: [NaN, 0] },
    { ...payload(), coefficients: [new Float32Array(2)] },
    { ...payload(), open: Array(27).fill(Infinity) },
    { ...payload(), lightingRevision: "old" },
  ]) {
    const before = owner.snapshot(),
      version = volume.version;
    expect(() => owner.upload(bad as GroundedSH9Upload, p)).toThrow();
    expect(owner.snapshot()).toEqual(before);
    expect(volume.version).toBe(version);
  }
  const next = payload();
  next.revision = "new";
  owner.upload(next, next);
  expect(volume.image.data).toBe(storage);
  expect(s.uniforms.absShStrength).toBe(strength);
  expect(s.uniforms.absShCenter).toBe(center);
  expect(strength!.value).toBe(1);
  expect(center!.value.toArray()).toEqual([12, 0, -8]);
  owner.invalidate();
  expect(strength!.value).toBe(0);
  expect(owner.snapshot().revision).toBeNull();
  owner.dispose();
  expect(volume.image.data.length).toBe(0);
  expect(ground.image.data.length).toBe(0);
  m.dispose();
});
test("material ownership composes prior hooks and never clobbers later owners", () => {
  const a = createGroundedSH9Volume(layout()),
    b = createGroundedSH9Volume(layout()),
    m = new MeshStandardMaterial();
  let calls = 0;
  const prior = (m.onBeforeCompile = function (s) {
    expect(this).toBe(m);
    calls++;
    s.fragmentShader = withLeafLighting(s.fragmentShader, 0.28);
  });
  const key = m.customProgramCacheKey;
  const release = a.bind(m, "leaf-environment");
  expect(() => a.bind(m, "leaf-environment")).toThrow("already");
  expect(() => b.bind(m, "indirect-diffuse")).toThrow("already");
  const s = shader();
  m.onBeforeCompile(s, renderer());
  expect(calls).toBe(1);
  expect(s.fragmentShader).toContain("ABS_LEAF_ENV_VISIBILITY");
  release();
  release();
  expect(m.onBeforeCompile).toBe(prior);
  expect(m.customProgramCacheKey).toBe(key);
  b.bind(m, "leaf-environment");
  const later = () => {};
  m.onBeforeCompile = later;
  b.dispose();
  expect(m.onBeforeCompile).toBe(later);
  expect(() => b.bind(m, "leaf-environment")).toThrow("disposed");
  a.dispose();
  m.dispose();
});
test("layout and mode enter cache identity, capability and shader hooks fail explicitly", () => {
  const a = createGroundedSH9Volume(layout()),
    b = createGroundedSH9Volume({
      ...layout(),
      resolution: [2, 4],
      elevations: [0, 1, 3, 9],
      lowerFade: [-1, 0],
      upperFade: [8, 9],
    }),
    materials = Array.from({ length: 3 }, () => new MeshStandardMaterial());
  a.bind(materials[0]!, "indirect-diffuse");
  a.bind(materials[1]!, "leaf-environment");
  b.bind(materials[2]!, "indirect-diffuse");
  expect(new Set(materials.map((m) => m.customProgramCacheKey())).size).toBe(3);
  expect(supportsGroundedSH9Volume(renderer())).toBe(true);
  expect(supportsGroundedSH9Volume(renderer(false))).toBe(false);
  expect(() =>
    materials[0]!.onBeforeCompile(shader(), renderer(false)),
  ).toThrow("filtering");
  const broken = shader();
  broken.vertexShader = broken.vertexShader.replace(
    "#include <project_vertex>",
    "",
  );
  expect(() => materials[0]!.onBeforeCompile(broken, renderer())).toThrow(
    "hook",
  );
  expect(() => materials[1]!.onBeforeCompile(shader(), renderer())).toThrow(
    "leaf lighting",
  );
  a.dispose();
  b.dispose();
  for (const m of materials) m.dispose();
});
test("small and maximum capacities stay bounded and disposal rejects future mutation", () => {
  for (const resolution of [
    [2, 2],
    [64, 64],
  ] as const) {
    const o = {
        ...layout(),
        resolution,
        elevations: [0, 1, 2, 3, 4, 5, 6, 8],
        lowerFade: [-1, 0] as const,
      },
      owner = createGroundedSH9Volume(o),
      p = payload(o);
    owner.upload(p, p);
    expect(owner.snapshot().textureBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    owner.dispose();
    owner.dispose();
    expect(owner.snapshot().textureBytes).toBe(0);
    expect(() => owner.upload(p, p)).toThrow("disposed");
    expect(() => owner.invalidate()).toThrow("disposed");
  }
});

test("shared mutable payload buffers reject before upload", () => {
  const owner = createGroundedSH9Volume(layout()),
    p = payload();
  owner.upload(p, p);
  const before = owner.snapshot();
  const shared = (n: number) => new Float32Array(new SharedArrayBuffer(n * 4));
  for (const bad of [
    { ...p, coefficients: [shared(108), ...p.coefficients.slice(1)] },
    { ...p, ground: shared(36) },
    { ...p, open: shared(27) },
  ]) {
    expect(() => owner.upload(bad, p)).toThrow();
    expect(owner.snapshot()).toEqual(before);
  }
  owner.dispose();
});
