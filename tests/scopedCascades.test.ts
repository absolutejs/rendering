import { expect, test } from "bun:test";
import {
  Scene,
  PerspectiveCamera,
  Vector3,
  ShaderChunk,
  MeshStandardMaterial,
} from "three";
import { createScopedCascades } from "../src/scopedCascades";
const options = () => ({
  camera: new PerspectiveCamera(62, 1.6, 0.4, 24000),
  parent: new Scene(),
  splits: [16, 96],
  direction: new Vector3(-80, -110, -40),
});
test("scoped cascades preserve global chunks and material hooks through teardown", () => {
  const original = { ...ShaderChunk },
    opts = options(),
    owner = createScopedCascades(opts);
  expect(ShaderChunk).toEqual(original);
  expect(opts.parent.children.length).toBe(4);
  const material = new MeshStandardMaterial();
  let calls = 0;
  material.onBeforeCompile = (shader) => {
    calls++;
    shader.uniforms.custom = { value: 42 };
  };
  const hook = material.onBeforeCompile,
    key = material.customProgramCacheKey;
  const release = owner.bind(material);
  const shader: any = {
    uniforms: {},
    fragmentShader:
      "#include <lights_pars_begin>\n#include <lights_fragment_begin>",
  };
  material.onBeforeCompile(shader, {} as any);
  expect(calls).toBe(1);
  expect(shader.uniforms.custom.value).toBe(42);
  expect(shader.uniforms.CSM_cascades.value[0].y).toBe(16 / 96);
  expect(shader.fragmentShader).not.toContain(
    "#include <lights_fragment_begin>",
  );
  owner.update(true);
  expect(owner.lights[0]!.shadow.camera.right).toBeLessThan(
    owner.lights[1]!.shadow.camera.right,
  );
  let mapsDisposed = 0;
  for (const light of owner.lights)
    light.shadow.map = {
      dispose() {
        mapsDisposed++;
      },
    } as any;
  release();
  release();
  expect(material.onBeforeCompile).toBe(hook);
  expect(material.customProgramCacheKey).toBe(key);
  owner.dispose();
  owner.dispose();
  expect(mapsDisposed).toBe(2);
  expect(opts.parent.children.length).toBe(0);
  expect(ShaderChunk).toEqual(original);
  expect(() => owner.update()).toThrow();
});
test("invalid options allocate no lights; split input is copied", () => {
  for (const splits of [[], [0], [20, 10], [100000], [NaN], [1, 2, 3, 4, 5]]) {
    const opts = options();
    opts.splits = splits;
    expect(() => createScopedCascades(opts)).toThrow();
    expect(opts.parent.children.length).toBe(0);
  }
  const opts = options(),
    owner = createScopedCascades({ ...opts, intensity: 0 });
  opts.splits[0] = 90;
  owner.update(true);
  expect(owner.lights[0]!.intensity).toBe(0);
  owner.dispose();
});
test("conflicting ownership rejected and foreign wrappers survive disposal", () => {
  const a = createScopedCascades(options()),
    b = createScopedCascades(options()),
    material = new MeshStandardMaterial();
  a.bind(material);
  expect(() => b.bind(material)).toThrow();
  const owned = material.onBeforeCompile;
  const foreign: typeof owned = function (shader, renderer) {
    owned.call(material, shader, renderer);
  };
  material.onBeforeCompile = foreign;
  a.dispose();
  expect(material.onBeforeCompile).toBe(foreign);
  const shader: any = { uniforms: {}, fragmentShader: "unmodified" };
  foreign(shader, {} as any);
  expect(shader.fragmentShader).toBe("unmodified");
  b.bind(material);
  b.dispose();
});
