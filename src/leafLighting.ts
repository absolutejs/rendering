import { ShaderChunk } from "three";
/** Bounded thin-sheet diffuse approximation. Thickness values are art calibration,
 * not measured transmittance; direct-light color already includes Three's shadows. */
export const leafLightingGLSL = /* glsl */ `
vec2 leafDiffuseWeights(float cosine, float transmission) {
 float t=clamp(transmission,0.,1.);
 return vec2(max(0.,cosine)*(1.-t),max(0.,-cosine)*t);
}
void RE_Direct_Leaf(const in IncidentLight light, const in vec3 position,
 const in vec3 normal, const in vec3 viewDirection, const in vec3 clearcoatNormal,
 const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
 vec3 previous=reflectedLight.directDiffuse;
 RE_Direct_Physical(light,position,normal,viewDirection,clearcoatNormal,material,reflectedLight);
 vec2 weights=leafDiffuseWeights(dot(normal,light.direction),LEAF_TRANSMISSION);
 reflectedLight.directDiffuse=previous+(reflectedLight.directDiffuse-previous)*(1.-LEAF_TRANSMISSION)
  +light.color*material.diffuseColor*(RECIPROCAL_PI*weights.y);
}
#if NUM_HEMI_LIGHTS > 0
vec3 getLeafHemisphereLightIrradiance(const in HemisphereLight light, const in vec3 normal) {
 return mix(getHemisphereLightIrradiance(light,normal),getHemisphereLightIrradiance(light,-normal),LEAF_TRANSMISSION);
}
#define getHemisphereLightIrradiance getLeafHemisphereLightIrradiance
#endif
#undef RE_Direct
#define RE_Direct RE_Direct_Leaf
`;
export function withLeafLighting(shader: string, transmission: number) {
  if (!Number.isFinite(transmission) || transmission < 0 || transmission > 1)
    throw Error("Leaf transmission must be in [0,1]");
  return withLeafExpression(shader, transmission.toFixed(4));
}
/** Per-fragment transmission must already be clamped to [0,1] by its material.
 * Accept a single declared identifier, never arbitrary injected shader text. */
export function withLeafTransmissionField(shader: string, identifier: string) {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier) ||
    identifier.startsWith("gl_")
  )
    throw Error("Invalid leaf transmission field identifier");
  return withLeafExpression(shader, identifier);
}
function withLeafExpression(shader: string, expression: string) {
  const marker = "#include <lights_physical_pars_fragment>";
  if (shader.split(marker).length !== 2)
    throw Error("Three physical lighting hook missing");
  // Three r186 shares irradiance with multiple-scattering specular compensation.
  // Patch only its diffuse accumulation; changing getIBLIrradiance globally
  // would also transmit a portion of the specular response through the leaf.
  const diffuse = "vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;";
  const physical = ShaderChunk.lights_physical_pars_fragment;
  if (physical.split(diffuse).length !== 2)
    throw Error("Three indirect diffuse hook missing");
  return shader.replace(
    marker,
    "\n#define LEAF_TRANSMISSION " +
      expression +
      "\n" +
      physical.replace(
        diffuse,
        `
#ifdef USE_ENVMAP
vec3 leafIrradiance = mix(irradiance, getIBLIrradiance(-geometryNormal), LEAF_TRANSMISSION);
vec3 indirectDiffuse = diffuse * leafIrradiance * RECIPROCAL_PI;
#else
${diffuse}
#endif
`,
      ) +
      "\n" +
      leafLightingGLSL,
  );
}

/** Compose AFTER a leaf lighting hook. The caller declares a GLSL function
 * `float name(vec3 viewSpaceNormal)` (or vec3 for per-channel attenuation)
 * before the physical lighting chunk. It owns
 * world-normal transforms, position/height sampling, revisions and the material
 * cache key. Evaluates front/back visibility BEFORE their transmitted diffuse
 * mixture; leaves direct lighting, emissive and specular compensation untouched.
 * This affects environment diffuse only, not ambient/hemi lights or full GI. */
export function withLeafEnvironmentVisibility(
  shader: string,
  identifier: string,
) {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier) ||
    identifier.startsWith("gl_")
  )
    throw Error("Invalid leaf environment visibility function");
  const marker =
    "vec3 leafIrradiance = mix(irradiance, getIBLIrradiance(-geometryNormal), LEAF_TRANSMISSION);";
  if (
    shader.split(marker).length !== 2 ||
    shader.includes("ABS_LEAF_ENV_VISIBILITY")
  )
    throw Error(
      "Leaf environment visibility requires one unmodified leaf lighting hook",
    );
  return shader.replace(
    marker,
    `// ABS_LEAF_ENV_VISIBILITY
vec3 leafIrradiance = mix(
 irradiance * clamp(${identifier}(geometryNormal), 0., 1.),
 getIBLIrradiance(-geometryNormal) * clamp(${identifier}(-geometryNormal), 0., 1.),
 LEAF_TRANSMISSION);`,
  );
}
