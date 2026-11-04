import { withLeafTransmissionField } from "./leafLighting.js";
import {
  DoubleSide,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
} from "three";

export type ThinFoliageMaterialParameters = MeshStandardMaterialParameters & {
  /** Fraction of diffuse illumination allocated to approximate leaf transmission, 0..1. */
  leafTransmission?: number;
};
/** Approximate thin-leaf backlighting using Three's shadowed direct and directional sky light.
 * Not volumetric transmission. No extra render pass, texture, or animation loop.
 * Sky diffuse is transmitted; specular and area lights retain standard shading. Use
 * cloneRenderMaterial to preserve shader hooks when cloning.
 */
export function createThinFoliageMaterial(
  options: ThinFoliageMaterialParameters = {},
): MeshStandardMaterial {
  const { leafTransmission = 0.35, ...parameters } = options;
  if (
    !Number.isFinite(leafTransmission) ||
    leafTransmission < 0 ||
    leafTransmission > 1
  )
    throw Error("Invalid leaf transmission");
  const material = new MeshStandardMaterial({
    side: DoubleSide,
    roughness: 0.85,
    ...parameters,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.absLeafTransmission = { value: leafTransmission };
    shader.fragmentShader =
      "uniform float absLeafTransmission;\n" +
      withLeafTransmissionField(shader.fragmentShader, "absLeafTransmission");
  };
  material.customProgramCacheKey = () =>
    `absolute-thin-foliage-2:${leafTransmission}`;
  return material;
}
