import assert from "node:assert/strict";
import { MeshBasicMaterial } from "three";
import {
  bindAlphaToCoverageDestination,
  cloneRenderMaterial,
  destinationIsMultisampled,
} from "../dist/index.js";
const source = new MeshBasicMaterial();
source.alphaToCoverage = true;
bindAlphaToCoverageDestination(source);
const copy = cloneRenderMaterial(source),
  renderer = {
    getRenderTarget: () => ({ samples: 0 }),
    capabilities: { maxSamples: 4 },
  };
copy.onBeforeRender(renderer);
assert.equal(copy.alphaToCoverage, false);
assert.equal(source.alphaToCoverage, true);
assert.equal(destinationIsMultisampled(renderer), false);
copy.dispose();
source.dispose();
console.log("Built ESM consumer passed");
const scoped = await import("../dist/index.js");
for (const name of [
  "renderTargetScope",
  "readTargetPixelsScoped",
  "readFloatTargetScoped",
])
  assert.equal(typeof scoped[name], "function");
console.log("Scoped capture exports passed");

const visibility = await import("../dist/visibility.js");
for (const name of [
  "PreparedAlphaVisibility",
  "HemisphereVisibilityProbe",
  "hemisphereVisibilityDirection",
])
  assert.equal(typeof visibility[name], "function");
const direction = visibility.hemisphereVisibilityDirection(0, 1, {
  set(x, y, z) {
    return [x, y, z];
  },
});
assert(direction.every(Number.isFinite));
assert(Math.abs(Math.hypot(...direction) - 1) < 1e-12);
console.log(
  "Visibility Node ESM exports and structural direction target passed",
);
