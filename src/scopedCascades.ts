import { Material, Object3D, PerspectiveCamera, Vector3 } from "three";
import { CSM } from "three/addons/csm/CSM.js";
import * as shaderModule from "three/addons/csm/CSMShader.js";

const chunks = (
  shaderModule as unknown as {
    CSMShader: { lights_fragment_begin: string; lights_pars_begin: string };
  }
).CSMShader;
class LocalCSM extends CSM {
  // The installed addon calls the underscored method; older typings expose the
  // public spelling. Neither may mutate process-wide Three shader chunks.
  _injectInclude() {}
  injectInclude() {}
}
const owners = new WeakMap<Material, object>();
type DefinedMaterial = Material & { defines?: Record<string, unknown> };
export interface ScopedCascadeOptions {
  camera: PerspectiveCamera;
  parent: Object3D;
  /** Increasing absolute view depths, including the final shadow distance. */
  splits: readonly number[];
  resolution?: number;
  direction: Vector3;
  intensity?: number;
}

/** Experimental scoped adapter around Three's CSM fitting algorithm.
 * All lit receivers must be bound and no other directional lights may share
 * their render. Caller owns update scheduling and camera/reflection policy.
 * This does not register an animation loop or adopt a shadow refresh policy. */
export function createScopedCascades(options: ScopedCascadeOptions) {
  const { camera, parent } = options;
  const splits = [...options.splits];
  const resolution = options.resolution ?? 1024;
  const intensity = options.intensity ?? 1;
  function validateCamera() {
    if (
      !camera.isPerspectiveCamera ||
      !Number.isFinite(camera.near) ||
      !Number.isFinite(camera.far) ||
      camera.near <= 0 ||
      splits.length < 1 ||
      splits.length > 4 ||
      splits.some(
        (v, i) =>
          !Number.isFinite(v) ||
          v <= (splits[i - 1] ?? camera.near) ||
          v > camera.far,
      )
    )
      throw Error("Invalid cascade camera or split depths");
  }
  validateCamera();
  if (
    !Number.isInteger(resolution) ||
    resolution < 128 ||
    resolution > 2048 ||
    (resolution & (resolution - 1)) !== 0 ||
    !Number.isFinite(intensity) ||
    intensity < 0 ||
    !options.direction.toArray().every(Number.isFinite) ||
    !Number.isFinite(options.direction.length()) ||
    options.direction.length() === 0
  )
    throw Error("Invalid cascade resolution, intensity or direction");
  const csm = new LocalCSM({
    camera,
    parent,
    cascades: splits.length,
    maxFar: splits[splits.length - 1]!,
    mode: "custom",
    shadowMapSize: resolution,
    lightDirection: options.direction.clone().normalize(),
    lightIntensity: intensity,
    customSplitsCallback: (_count, _near, far, breaks) => {
      for (const depth of splits) breaks.push(depth / far);
    },
  });
  // CSM uses a truthy fallback for intensity, so preserve an explicit zero.
  for (const light of csm.lights) light.intensity = intensity;
  let disposed = false;
  const releases = new Map<Material, () => void>();
  function assertLive() {
    if (disposed) throw Error("Cascade owner is disposed");
  }
  return {
    lights: Object.freeze([...csm.lights]),
    bind(material: DefinedMaterial): () => void {
      assertLive();
      const existing = releases.get(material);
      if (existing) return existing;
      if (
        owners.has(material) ||
        ["USE_CSM", "CSM_CASCADES", "CSM_FADE"].some(
          (key) => key in (material.defines ?? {}),
        )
      )
        throw Error("Material already has a cascade owner");
      const previous = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey;
      // Evaluate before replacing onBeforeCompile: Three's default key reads it.
      const key = previousKey.call(material);
      csm.setupMaterial(material);
      const injectUniforms = material.onBeforeCompile;
      let active = true;
      const callback: Material["onBeforeCompile"] = function (
        this: Material,
        shader,
        renderer,
      ) {
        previous.call(this, shader, renderer);
        if (!active) return;
        for (const name of [
          "lights_pars_begin",
          "lights_fragment_begin",
        ] as const) {
          const marker = `#include <${name}>`;
          if (!shader.fragmentShader.includes(marker))
            throw Error(`Missing cascade shader include: ${name}`);
          shader.fragmentShader = shader.fragmentShader.replace(
            marker,
            chunks[name],
          );
        }
        injectUniforms.call(this, shader, renderer);
      };
      const cacheKey = () => `${key}|absolute-scoped-csm-1:${splits.length}`;
      material.onBeforeCompile = callback;
      material.customProgramCacheKey = cacheKey;
      material.needsUpdate = true;
      owners.set(material, csm);
      const release = () => {
        if (!active) return;
        active = false;
        if (material.onBeforeCompile === callback)
          material.onBeforeCompile = previous;
        if (material.customProgramCacheKey === cacheKey)
          material.customProgramCacheKey = previousKey;
        delete material.defines?.USE_CSM;
        delete material.defines?.CSM_CASCADES;
        delete material.defines?.CSM_FADE;
        csm.shaders.delete(material);
        owners.delete(material);
        releases.delete(material);
        material.needsUpdate = true;
      };
      releases.set(material, release);
      return release;
    },
    update(projectionChanged = false) {
      assertLive();
      validateCamera();
      camera.updateWorldMatrix(true, false);
      if (projectionChanged) csm.updateFrustums();
      csm.update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const release of releases.values()) release();
      csm.shaders.clear();
      csm.dispose();
      csm.remove();
      for (const light of csm.lights) light.shadow.dispose();
    },
  };
}
