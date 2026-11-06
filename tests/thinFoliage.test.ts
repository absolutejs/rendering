import { expect, test } from "bun:test";
import { DoubleSide, ShaderLib } from "three";
import { createThinFoliageMaterial, cloneRenderMaterial } from "../src/index";
test("thin foliage validates transmission and preserves clone shader ownership", () => {
  for (const value of [-1, 1.1, NaN, Infinity])
    expect(() =>
      createThinFoliageMaterial({ leafTransmission: value }),
    ).toThrow();
  const original = createThinFoliageMaterial();
  const clone = cloneRenderMaterial(original);
  expect(original.side).toBe(DoubleSide);
  expect(clone.onBeforeCompile).toBe(original.onBeforeCompile);
  expect(clone.customProgramCacheKey()).toBe(original.customProgramCacheKey());
  original.dispose();
  clone.dispose();
});
test("thin foliage retains standard lighting and requires a supported shader", () => {
  const material = createThinFoliageMaterial({ leafTransmission: 0 });
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as any);
  expect(shader.uniforms.absLeafTransmission.value).toBe(0);
  expect(shader.fragmentShader).toContain("RE_Direct_Physical");
  expect(shader.fragmentShader).toContain("#include <tonemapping_fragment>");
  expect(() =>
    material.onBeforeCompile({ ...shader, fragmentShader: "" }, {} as any),
  ).toThrow();
  material.dispose();
});

import { withLeafLighting, withLeafTransmissionField } from "../src/index";
test("leaf hooks reject unsupported shader shapes and untrusted field expressions", () => {
  for (const name of ["", "a + b", "gl_FrontFacing", "x;discard"])
    expect(() =>
      withLeafTransmissionField(ShaderLib.standard.fragmentShader, name),
    ).toThrow();
  for (const n of [-1, 2, Infinity, NaN])
    expect(() =>
      withLeafLighting(ShaderLib.standard.fragmentShader, n),
    ).toThrow();
  const source = withLeafLighting(ShaderLib.standard.fragmentShader, 0.32);
  expect(source).toContain("getIBLIrradiance(-geometryNormal)");
  expect(source).toContain("getLeafHemisphereLightIrradiance");
});

import { withLeafEnvironmentVisibility } from "../src/index";
test("directional leaf environment hook requires a leaf hook and a safe function", () => {
  const leaf = withLeafLighting(ShaderLib.standard.fragmentShader, 0.28);
  for (const name of ["", "a+b", "gl_Position", "sample();"])
    expect(() => withLeafEnvironmentVisibility(leaf, name)).toThrow();
  expect(() =>
    withLeafEnvironmentVisibility(
      ShaderLib.standard.fragmentShader,
      "sampleVisibility",
    ),
  ).toThrow();
  const patched = withLeafEnvironmentVisibility(leaf, "sampleVisibility");
  expect(patched).toContain("clamp(sampleVisibility(geometryNormal), 0., 1.)");
  expect(patched).toContain("clamp(sampleVisibility(-geometryNormal), 0., 1.)");
  expect(() =>
    withLeafEnvironmentVisibility(patched, "sampleVisibility"),
  ).toThrow();
  expect(() =>
    withLeafEnvironmentVisibility(leaf + leaf, "sampleVisibility"),
  ).toThrow();
});
