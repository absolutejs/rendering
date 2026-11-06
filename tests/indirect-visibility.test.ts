import { expect, test } from "bun:test";
import { ShaderLib } from "three";
import { withIndirectDiffuseVisibility } from "../src/indirectVisibility";
test("indirect visibility composes after AO without replacing other lighting terms", () => {
  const original = ShaderLib.standard.fragmentShader;
  const next = withIndirectDiffuseVisibility(original, "localSkyAccess");
  expect(next).toContain(
    "reflectedLight.indirectDiffuse *= clamp(localSkyAccess, 0., 1.);",
  );
  expect(
    next.replace(
      "\n// ABS_INDIRECT_VISIBILITY\nreflectedLight.indirectDiffuse *= clamp(localSkyAccess, 0., 1.);",
      "",
    ),
  ).toBe(original);
  expect(() => withIndirectDiffuseVisibility(next, "localSkyAccess")).toThrow();
});
test("malformed field expressions and missing shader markers reject", () => {
  for (const identifier of ["", "a.b", "x;discard", "gl_Position", "field()"])
    expect(() =>
      withIndirectDiffuseVisibility(
        ShaderLib.standard.fragmentShader,
        identifier,
      ),
    ).toThrow();
  expect(() =>
    withIndirectDiffuseVisibility("void main(){}", "field"),
  ).toThrow();
  expect(() =>
    withIndirectDiffuseVisibility(
      "#include <aomap_fragment>\n#include <aomap_fragment>",
      "field",
    ),
  ).toThrow();
});
