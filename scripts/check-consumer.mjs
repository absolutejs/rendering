import assert from "node:assert/strict";
import { MeshBasicMaterial, BoxGeometry, Box3, Ray, Vector3 } from "three";
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

const boundedGeometry = new BoxGeometry();
const boundsLease = scoped.leaseGeometryBounds(boundedGeometry, {
  x: 0.1,
  y: 0,
  z: 0.2,
});
assert(boundsLease.active);
assert.equal(boundedGeometry.boundingBox.max.x, 0.6);
boundsLease.release();
assert.equal(boundedGeometry.boundingBox, null);
boundedGeometry.dispose();
console.log("Geometry bounds Node ESM export and lifetime passed");

let invalidations = 0;
const refresh = scoped.createCoalescedInvalidation({
  minimumIntervalMs: 100,
  invalidate: () => invalidations++,
  clock: { now: () => 0, schedule: () => 0, cancel: () => {} },
});
refresh.request();
refresh.request();
assert.equal(refresh.snapshot().pending, true);
refresh.requestImmediate();
assert.equal(invalidations, 2);
assert.equal(refresh.snapshot().immediateRequests, 1);
assert.equal(refresh.snapshot().pending, false);
refresh.dispose();
assert.equal(refresh.requestImmediate(), false);
console.log("Built immediate invalidation API passed");

const boundsIndex = new visibility.PreparedBoundsIndex(
  [{ id: 4, bounds: new Box3(new Vector3(-1, -1, 2), new Vector3(1, 1, 3)) }],
  { revision: "esm-bounds" },
);
assert.deepEqual(
  boundsIndex.query(new Ray(new Vector3(), new Vector3(0, 0, 1))).candidates,
  [{ id: 4, near: 2, far: 3 }],
);
boundsIndex.dispose();
assert.equal(boundsIndex.size, 0);
console.log("Built bounds index ESM consumer passed");

const volume = scoped.createGroundedSH9Volume({
  resolution: [2, 2],
  elevations: [0, 1],
  size: [4, 4],
  lowerFade: [-1, 0],
  upperFade: [0.5, 1],
});
const volumeUpload = {
  revision: "scene",
  lightingRevision: "sky",
  center: [0, 0],
  coefficients: Array.from({ length: 7 }, () => new Float32Array(32)),
  ground: new Float32Array(16),
  open: new Float32Array(27),
};
volume.upload(volumeUpload, volumeUpload);
assert.equal(volume.snapshot().textureBytes, 960);
assert.equal(
  scoped.supportsGroundedSH9Volume({ extensions: { has: () => false } }),
  false,
);
volume.dispose();
assert.equal(volume.snapshot().textureBytes, 0);
console.log("Built grounded SH9 volume ESM consumer passed");
