import { Box3, BufferGeometry, Sphere, Vector3 } from "three";

type Padding = Readonly<{ x: number; y: number; z: number }>;
type State = {
  geometry: BufferGeometry;
  originalBox: Box3 | null;
  originalSphere: Sphere | null;
  source: Box3;
  box: Box3;
  sphere: Sphere;
  owners: Map<object, Vector3>;
  ended: boolean;
  onDispose: () => void;
};
const states = new WeakMap<BufferGeometry, State>();
function paddingCopy(value: Padding) {
  if (
    ![value.x, value.y, value.z].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 1e6,
    )
  )
    throw Error("Invalid geometry bounds padding");
  return new Vector3(value.x, value.y, value.z);
}
function owns(state: State) {
  return (
    state.geometry.boundingBox === state.box &&
    state.geometry.boundingSphere === state.sphere
  );
}
function finish(state: State) {
  if (state.ended) return;
  state.ended = true;
  if (owns(state)) {
    state.geometry.boundingBox = state.originalBox;
    state.geometry.boundingSphere = state.originalSphere;
  }
  state.owners.clear();
  state.geometry.removeEventListener("dispose", state.onDispose);
  if (states.get(state.geometry) === state) states.delete(state.geometry);
}
function merged(state: State, token: object, padding: Vector3 | null) {
  const maximum = new Vector3();
  for (const [owner, value] of state.owners)
    if (owner !== token) maximum.max(value);
  if (padding) maximum.max(padding);
  const box = state.source.clone().expandByVector(maximum);
  const sphere = box.getBoundingSphere(new Sphere());
  if (
    ![...box.min, ...box.max, ...sphere.center, sphere.radius].every(
      Number.isFinite,
    )
  )
    throw Error("Unbounded geometry bounds");
  return { box, sphere };
}
function apply(state: State, value: { box: Box3; sphere: Sphere }) {
  state.box.copy(value.box);
  state.sphere.copy(value.sphere);
}

/** Lease symmetric local-space culling padding for immutable source positions.
 * Shared leases combine componentwise maxima, never cumulative expansions.
 * At most 64 leases per geometry. Does not own/dispose GPU geometry or schedule
 * rendering. Last release/dispose restores original bounds while still owned.
 * External replacement of either bounds object ends ownership without clobbering
 * that replacement. External in-place bounds edits are outside this contract. */
export function leaseGeometryBounds(
  geometry: BufferGeometry,
  padding: Padding,
) {
  const copy = paddingCopy(padding),
    token = {};
  let state = states.get(geometry);
  if (state && !owns(state)) {
    finish(state);
    throw Error("Geometry bounds ownership lost");
  }
  if (!state) {
    const originalBox = geometry.boundingBox,
      originalSphere = geometry.boundingSphere;
    let source: Box3;
    try {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      source = geometry.boundingBox!.clone();
    } finally {
      geometry.boundingBox = originalBox;
    }
    if (
      source.isEmpty() ||
      ![...source.min, ...source.max].every(Number.isFinite)
    )
      throw Error("Invalid source geometry bounds");
    state = {
      geometry,
      originalBox,
      originalSphere,
      source,
      box: new Box3(),
      sphere: new Sphere(),
      owners: new Map(),
      ended: false,
      onDispose: () => {},
    };
    const initial = merged(state, token, copy);
    apply(state, initial);
    geometry.boundingBox = state.box;
    geometry.boundingSphere = state.sphere;
    const captured = state;
    state.onDispose = () => finish(captured);
    geometry.addEventListener("dispose", state.onDispose);
    states.set(geometry, state);
  }
  if (state.owners.size >= 64)
    throw Error("Geometry bounds lease budget exceeded");
  const initial = merged(state, token, copy); // validate before adding a new owner
  state.owners.set(token, copy);
  apply(state, initial);
  const owned = state;
  return {
    get active() {
      return !owned.ended && owned.owners.has(token);
    },
    update(value: Padding) {
      if (owned.ended || !owned.owners.has(token))
        throw Error("Geometry bounds lease is released");
      if (!owns(owned)) {
        finish(owned);
        throw Error("Geometry bounds ownership lost");
      }
      const next = paddingCopy(value),
        bounds = merged(owned, token, next);
      owned.owners.set(token, next);
      apply(owned, bounds);
    },
    release() {
      if (owned.ended || !owned.owners.has(token)) return;
      if (!owns(owned)) {
        finish(owned);
        return;
      }
      owned.owners.delete(token);
      if (!owned.owners.size) {
        finish(owned);
        return;
      }
      apply(owned, merged(owned, token, null));
    },
  };
}
