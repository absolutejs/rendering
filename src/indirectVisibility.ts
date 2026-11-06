/** Attenuate only accumulated indirect diffuse. The caller declares a scalar
 * field before this hook and owns its sampling/coordinate validity. Direct light,
 * emissive and indirect specular stay unchanged. This is not full directional GI. */
export function withIndirectDiffuseVisibility(
  shader: string,
  identifier: string,
) {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier) ||
    identifier.startsWith("gl_")
  )
    throw Error("Invalid indirect visibility identifier");
  const marker = "#include <aomap_fragment>";
  if (
    shader.split(marker).length !== 2 ||
    shader.includes("ABS_INDIRECT_VISIBILITY")
  )
    throw Error("Indirect visibility hook missing or already installed");
  return shader.replace(
    marker,
    `${marker}\n// ABS_INDIRECT_VISIBILITY\nreflectedLight.indirectDiffuse *= clamp(${identifier}, 0., 1.);`,
  );
}
