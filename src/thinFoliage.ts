import { DoubleSide, MeshStandardMaterial, type MeshStandardMaterialParameters } from 'three';

export type ThinFoliageMaterialParameters = MeshStandardMaterialParameters & {
  /** Fraction of direct diffuse allocated to approximate leaf transmission, 0..1. */
  leafTransmission?: number;
};
/** Approximate thin-leaf backlighting using Three's already shadowed direct light.
 * Not volumetric transmission. No extra render pass, texture, or animation loop.
 * Area-light and environment paths retain standard shading. Use
 * cloneRenderMaterial to preserve shader hooks when cloning.
 */
export function createThinFoliageMaterial(options: ThinFoliageMaterialParameters = {}): MeshStandardMaterial {
  const {leafTransmission = 0.35, ...parameters} = options;
  if (!Number.isFinite(leafTransmission) || leafTransmission < 0 || leafTransmission > 1)
    throw Error('Invalid leaf transmission');
  const material = new MeshStandardMaterial({side: DoubleSide, roughness: 0.85, ...parameters});
  material.onBeforeCompile = shader => {
    const anchor = '#include <lights_physical_pars_fragment>';
    if (shader.fragmentShader.split(anchor).length !== 2) throw Error('Unsupported thin-foliage shader');
    shader.uniforms.absLeafTransmission = {value: leafTransmission};
    shader.fragmentShader = shader.fragmentShader.replace(anchor, `${anchor}
uniform float absLeafTransmission;
void absLeafDirect(const in IncidentLight light, const in vec3 p, const in vec3 n,
 const in vec3 v, const in vec3 coatN, const in PhysicalMaterial m, inout ReflectedLight result) {
 vec3 previousDiffuse=result.directDiffuse;
 RE_Direct_Physical(light,p,n,v,coatN,m,result);
 float through=max(0.,dot(-n,light.direction));
 float forward=max(0.,dot(v,-light.direction));
 vec3 transmitted=light.color*BRDF_Lambert(m.diffuseColor)*through*(.5+.5*forward*forward);
 result.directDiffuse=previousDiffuse+mix(result.directDiffuse-previousDiffuse,transmitted,absLeafTransmission);
}
#undef RE_Direct
#define RE_Direct absLeafDirect
`);
  };
  material.customProgramCacheKey = () => `absolute-thin-foliage-1:${leafTransmission}`;
  return material;
}
