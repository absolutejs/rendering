import type { Material, WebGLRenderer } from "three";

type Binding = {
  enabled: boolean;
  previous: Material["onBeforeRender"];
  callback: Material["onBeforeRender"];
  dispose: () => void;
};
const bindings = new WeakMap<Material, Binding>();
const canvasSampling = new WeakMap<WebGLRenderer, boolean>();
function setCoverage(material: Material, enabled: boolean) {
  if (material.alphaToCoverage === enabled) return;
  material.alphaToCoverage = enabled;
  material.needsUpdate = true;
}

/** Resolve the destination's declared sample count without a synchronous GPU
 * query per draw. Render targets must have a supported attachment configuration. */
export function destinationIsMultisampled(renderer: WebGLRenderer): boolean {
  const target = renderer.getRenderTarget();
  if (target) return target.samples > 0 && renderer.capabilities.maxSamples > 0;
  let sampled = canvasSampling.get(renderer);
  if (sampled === undefined) {
    const attributes = renderer.getContextAttributes();
    if (!attributes) return false; // Do not cache context loss as a permanent capability.
    sampled = attributes.antialias === true;
    canvasSampling.set(renderer, sampled);
  }
  return sampled;
}

/** Select coverage before program selection for each draw, including captures.
 * Shader hooks must retain their non-ALPHA_TO_COVERAGE fallback. Rebinding is
 * idempotent; disposal restores the previous callback/state while still owned.
 * No global renderer monkey patch, traversal, texture allocation or shader text. */
export function bindAlphaToCoverageDestination(
  material: Material,
  enabled = material.alphaToCoverage,
): () => void {
  if (typeof enabled !== "boolean") throw Error("Invalid coverage preference");
  const existing = bindings.get(material);
  if (existing && material.onBeforeRender === existing.callback) {
    existing.enabled = enabled;
    return existing.dispose;
  }
  const previous = material.onBeforeRender,
    originalCoverage = material.alphaToCoverage;
  let disposed = false;
  const state: Binding = {
    enabled,
    previous,
    callback: function (
      this: Material,
      ...args: Parameters<Material["onBeforeRender"]>
    ) {
      previous.apply(this, args);
      setCoverage(this, state.enabled && destinationIsMultisampled(args[0]));
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (material.onBeforeRender === state.callback) {
        material.onBeforeRender = previous;
        setCoverage(material, originalCoverage);
      }
      if (bindings.get(material) === state) bindings.delete(material);
    },
  };
  material.onBeforeRender = state.callback;
  bindings.set(material, state);
  return state.dispose;
}

/** Own the clone, borrow its textures, preserve authored shader/render hooks.
 * Destination policy is cloned independently so changing one owner's preference
 * cannot alter another. No source material is mutated. */
export function cloneRenderMaterial<T extends Material>(source: T): T {
  const copy = source.clone();
  copy.onBeforeCompile = source.onBeforeCompile;
  copy.customProgramCacheKey = source.customProgramCacheKey;
  const binding = bindings.get(source);
  if (binding && source.onBeforeRender === binding.callback) {
    copy.onBeforeRender = binding.previous;
    bindAlphaToCoverageDestination(copy, binding.enabled);
  } else copy.onBeforeRender = source.onBeforeRender;
  return copy;
}

export {
  renderTargetScope,
  readTargetPixelsScoped,
  readFloatTargetScoped,
} from "./renderTargetScope.js";

export { createObjectTriplanarMaterial } from "./objectTriplanar.js";
export type {
  ObjectTriplanarProjection,
  ObjectTriplanarMaterialParameters,
} from "./objectTriplanar.js";

export { createThinFoliageMaterial } from "./thinFoliage.js";
export type { ThinFoliageMaterialParameters } from "./thinFoliage.js";

export {
  withLeafLighting,
  withLeafTransmissionField,
  leafLightingGLSL,
} from "./leafLighting.js";

export { alphaCoverage, scaleAlphaCoverage } from "./alphaCoverage.js";
export { createPreparedMipTexture } from "./preparedMipTexture.js";
export type { PreparedMipLevel } from "./preparedMipTexture.js";

export {
  associateAlphaColor,
  downsampleAlphaColor,
  type AlphaColorOptions,
} from "./alphaColor.js";
export { configureAssociatedColorMap } from "./associatedColorMap.js";
export {
  createViewCameraState,
  bindViewCamera,
  type ViewCameraState,
} from "./viewCamera.js";
export {
  createPreparedMipArrayTexture,
  type PreparedMipArrayOptions,
} from "./preparedMipArrayTexture.js";
export {
  createInstanceAttributeStream,
  type InstanceAttributeStream,
} from "./instanceAttributeStream.js";
