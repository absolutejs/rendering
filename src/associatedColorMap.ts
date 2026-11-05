import {
  ShaderChunk,
  type Material,
  type MeshStandardMaterial,
  type MeshBasicMaterial,
} from "three";
const installed = new WeakSet<Material>();
/** Compose on an owned standard/physical/basic surface material whose map contains
 * linear-light alpha-associated RGB (encoded using the texture's colorSpace).
 * Alpha, destination coverage, vertex colors and blend state remain unchanged.
 * A clone that already preserves this shader hook must not install it a second time.
 */
export function configureAssociatedColorMap(
  material: MeshStandardMaterial | MeshBasicMaterial,
): void {
  if (
    !material ||
    (!(material as MeshStandardMaterial).isMeshStandardMaterial &&
      !(material as MeshBasicMaterial).isMeshBasicMaterial) ||
    !material.map?.isTexture
  )
    throw Error(
      "Associated color requires a mapped standard or basic material",
    );
  if (installed.has(material)) return;
  const chunk = ShaderChunk.map_fragment,
    expression = "diffuseColor *= sampledDiffuseColor;";
  if (chunk.split(expression).length !== 2)
    throw Error("Three map-color hook changed");
  const replacement = chunk.replace(
    expression,
    "sampledDiffuseColor.rgb /= max(sampledDiffuseColor.a, 1.e-6);\n" +
      expression,
  );
  const prior = material.onBeforeCompile.bind(material),
    key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prior(shader, renderer);
    const marker = "#include <map_fragment>";
    if (shader.fragmentShader.split(marker).length !== 2)
      throw Error("Associated map requires one unexpanded map fragment hook");
    shader.fragmentShader = shader.fragmentShader.replace(marker, replacement);
  };
  material.customProgramCacheKey = () => key + ":associated-color-map-1";
  material.needsUpdate = true;
  installed.add(material);
}
