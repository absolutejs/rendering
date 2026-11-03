import { expect, test } from "bun:test";
import {
  Texture,
  Vector2,
  ShaderLib,
  UniformsUtils,
  ObjectSpaceNormalMap,
  Mesh,
} from "three";
import { createObjectTriplanarMaterial, cloneRenderMaterial } from "../src";
const shader = () => ({
  vertexShader: ShaderLib.standard.vertexShader,
  fragmentShader: ShaderLib.standard.fragmentShader,
  uniforms: UniformsUtils.clone(ShaderLib.standard.uniforms),
});
test("projection validates bounded finite inputs before creating a material", () => {
  for (const scale of [0, -1, NaN, Infinity, 10001])
    expect(() =>
      createObjectTriplanarMaterial({ projection: { scale } }),
    ).toThrow();
  for (const sharpness of [0, 17, NaN])
    expect(() =>
      createObjectTriplanarMaterial({ projection: { sharpness } }),
    ).toThrow();
  expect(() =>
    createObjectTriplanarMaterial({ projection: { offset: [0, NaN, 0] } }),
  ).toThrow();
  expect(() =>
    createObjectTriplanarMaterial({ normalMapType: ObjectSpaceNormalMap }),
  ).toThrow();
  expect(() =>
    createObjectTriplanarMaterial({ displacementMap: new Texture() }),
  ).toThrow();
});
test("mapping borrows textures and isolates projection inputs and cloned uniforms", () => {
  const map = new Texture(),
    normalMap = new Texture(),
    roughnessMap = new Texture();
  let disposed = 0;
  map.addEventListener("dispose", () => disposed++);
  const offset: [number, number, number] = [1, 2, 3];
  const normalScale = new Vector2(0.7, -0.7);
  const material = createObjectTriplanarMaterial({
    map,
    normalMap,
    roughnessMap,
    normalScale,
    projection: { scale: 2, offset },
  });
  offset[0] = 999;
  const a = shader();
  material.onBeforeCompile(a as any, {} as any);
  expect(a.uniforms.absTriOffset!.value.toArray()).toEqual([1, 2, 3]);
  const clone = cloneRenderMaterial(material),
    b = shader();
  clone.onBeforeCompile(b as any, {} as any);
  a.uniforms.absTriOffset!.value.x = 888;
  expect(b.uniforms.absTriOffset!.value.x).toBe(1);
  expect(clone.map).toBe(map);
  expect(clone.normalScale.toArray()).toEqual([0.7, -0.7]);
  expect(map.wrapS).toBe(new Texture().wrapS);
  material.dispose();
  clone.dispose();
  expect(disposed).toBe(0);
  map.dispose();
  normalMap.dispose();
  roughnessMap.dispose();
});
test("shader integration rejects drift instead of silently leaving a UV channel active", () => {
  const material = createObjectTriplanarMaterial(),
    s = shader();
  s.fragmentShader = s.fragmentShader.replace("#include <map_fragment>", "");
  expect(() => material.onBeforeCompile(s as any, {} as any)).toThrow(
    "shader anchor",
  );
  material.dispose();
});
test("rigid scope rejects skinning and active morphs while permitting static meshes", () => {
  const material = createObjectTriplanarMaterial(),
    mesh = new Mesh();
  const draw = (object: any) =>
    material.onBeforeRender(
      {} as any,
      {} as any,
      {} as any,
      mesh.geometry,
      object,
      {} as any,
    );
  expect(() => draw(mesh)).not.toThrow();
  expect(() => draw({ isSkinnedMesh: true })).toThrow("rigid geometry");
  expect(() => draw({ morphTargetInfluences: [0, 1] })).toThrow(
    "rigid geometry",
  );
  expect(() => draw({ morphTargetInfluences: [0, 0] })).not.toThrow();
  mesh.geometry.dispose();
  material.dispose();
});

test("opaque scope rejects coverage that would require matching custom shadow shaders", () => {
  for (const options of [
    { transparent: true },
    { alphaHash: true },
    { alphaToCoverage: true },
    { alphaTest: 0.5 },
  ])
    expect(() => createObjectTriplanarMaterial(options)).toThrow(
      "opaque coverage",
    );
  const material = createObjectTriplanarMaterial();
  material.transparent = true;
  expect(() =>
    material.onBeforeRender(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      new Mesh(),
      {} as any,
    ),
  ).toThrow("opaque coverage");
  material.dispose();
});
