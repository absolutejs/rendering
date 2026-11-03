import {
  MeshStandardMaterial,
  TangentSpaceNormalMap,
  Vector3,
  type MeshStandardMaterialParameters,
} from "three";

export type ObjectTriplanarProjection = {
  /** Repeats per geometry-local unit; does not swim when an object moves. */
  scale?: number;
  /** Stable geometry-local phase, shared by color, normal and roughness. */
  offset?: readonly [number, number, number];
  /** Axis blending exponent. One is broad; larger values favor the dominant axis. */
  sharpness?: number;
};
export type ObjectTriplanarMaterialParameters =
  MeshStandardMaterialParameters & {
    projection?: ObjectTriplanarProjection;
  };
const revision = "absolute-object-triplanar-1";
function replaceOnce(source: string, anchor: string, replacement: string) {
  if (source.split(anchor).length !== 2)
    throw Error(`Unsupported Three shader anchor: ${anchor}`);
  return source.replace(anchor, replacement);
}
const varying = `
varying vec3 absTriPosition;
varying vec3 absTriObjectNormal;
varying mat3 absTriNormalToView;
`;
const functions = `
${varying}
uniform float absTriScale;
uniform vec3 absTriOffset;
uniform float absTriSharpness;
vec4 absTriSample(sampler2D tex, vec3 p, vec3 dx, vec3 dy, vec3 w) {
 return textureGrad(tex,p.yz,dx.yz,dy.yz)*w.x
      +textureGrad(tex,p.xz,dx.xz,dy.xz)*w.y
      +textureGrad(tex,p.xy,dx.xy,dy.xy)*w.z;
}
#ifdef USE_NORMALMAP_TANGENTSPACE
vec2 absTriSlope(vec3 encoded) {
 vec3 n=encoded*2.-1.;
 #ifdef USE_PACKED_NORMALMAP
 n.z=sqrt(max(0.,1.-dot(n.xy,n.xy)));
 #endif
 return -n.xy*normalScale/max(n.z,.1);
}
vec3 absTriGradient(vec3 p,vec3 dx,vec3 dy,vec3 w) {
 vec2 x=absTriSlope(textureGrad(normalMap,p.yz,dx.yz,dy.yz).xyz);
 vec2 y=absTriSlope(textureGrad(normalMap,p.xz,dx.xz,dy.xz).xyz);
 vec2 z=absTriSlope(textureGrad(normalMap,p.xy,dx.xy,dy.xy).xyz);
 return vec3(0.,x.x,x.y)*w.x+vec3(y.x,0.,y.y)*w.y+vec3(z.x,z.y,0.)*w.z;
}
#endif
`;
const prepare = `
vec3 absTriN=normalize(absTriObjectNormal);
#ifdef FLAT_SHADED
vec3 absTriArea=cross(dFdx(absTriPosition),dFdy(absTriPosition));
if(dot(absTriArea,absTriArea)>1e-20) {
 absTriArea=normalize(absTriArea);
 absTriN=dot(absTriArea,absTriN)<0.?-absTriArea:absTriArea;
}
#endif
vec3 absTriW=pow(abs(absTriN),vec3(absTriSharpness));
absTriW/=max(dot(absTriW,vec3(1.)),1e-20);
vec3 absTriP=absTriPosition*absTriScale+absTriOffset;
vec3 absTriDx=dFdx(absTriP),absTriDy=dFdy(absTriP);
`;

/** UV-independent color, tangent-normal and roughness projection for rigid meshes.
 * Borrows textures. Uses MeshStandardMaterial lighting/shadows and one draw.
 * Instancing follows Three's non-sheared instance normal transform. Skinning,
 * active morphs and displacement are outside this material's rigid-object scope.
 * Use cloneRenderMaterial when cloning so the authored shader hooks are retained. */
export function createObjectTriplanarMaterial(
  options: ObjectTriplanarMaterialParameters = {},
): MeshStandardMaterial {
  const { projection = {}, ...parameters } = options;
  const scale = projection.scale ?? 1;
  const sharpness = projection.sharpness ?? 4;
  const offset = [...(projection.offset ?? [0, 0, 0])];
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10000)
    throw Error("Invalid triplanar scale");
  if (!Number.isFinite(sharpness) || sharpness < 1 || sharpness > 16)
    throw Error("Invalid triplanar sharpness");
  if (
    offset.length !== 3 ||
    offset.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6)
  )
    throw Error("Invalid triplanar offset");
  if (
    parameters.bumpMap ||
    parameters.displacementMap ||
    (parameters.normalMapType !== undefined &&
      parameters.normalMapType !== TangentSpaceNormalMap) ||
    (parameters.map as { isVideoTexture?: boolean } | undefined)?.isVideoTexture
  )
    throw Error("Unsupported object-triplanar map type");
  if (
    parameters.transparent ||
    parameters.alphaHash ||
    parameters.alphaToCoverage ||
    (parameters.alphaTest ?? 0) > 0
  )
    throw Error("Object triplanar mapping requires opaque coverage");
  const material = new MeshStandardMaterial(parameters);
  material.customProgramCacheKey = () => revision;
  material.onBeforeRender = function (
    _renderer,
    _scene,
    _camera,
    _geometry,
    object,
  ) {
    if (
      this.transparent ||
      this.alphaHash ||
      this.alphaToCoverage ||
      this.alphaTest > 0
    )
      throw Error("Object triplanar mapping requires opaque coverage");
    const mesh = object as typeof object & {
      isSkinnedMesh?: boolean;
      morphTargetInfluences?: number[];
    };
    if (
      mesh.isSkinnedMesh ||
      mesh.morphTargetInfluences?.some((value) => value !== 0)
    )
      throw Error("Object triplanar mapping requires rigid geometry");
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.absTriScale = { value: scale };
    shader.uniforms.absTriSharpness = { value: sharpness };
    shader.uniforms.absTriOffset = {
      value: new Vector3(offset[0], offset[1], offset[2]),
    };
    shader.vertexShader = replaceOnce(
      shader.vertexShader,
      "#include <common>",
      `#include <common>\n${varying}`,
    );
    shader.vertexShader = replaceOnce(
      shader.vertexShader,
      "#include <defaultnormal_vertex>",
      `#include <defaultnormal_vertex>
mat3 absTriFrame=mat3(1.);
#ifdef USE_BATCHING
absTriFrame=mat3(bm[0]/dot(bm[0],bm[0]),bm[1]/dot(bm[1],bm[1]),bm[2]/dot(bm[2],bm[2]))*absTriFrame;
#endif
#ifdef USE_INSTANCING
absTriFrame=mat3(im[0]/dot(im[0],im[0]),im[1]/dot(im[1],im[1]),im[2]/dot(im[2],im[2]))*absTriFrame;
#endif
absTriNormalToView=normalMatrix*absTriFrame;
absTriObjectNormal=objectNormal;
`,
    );
    shader.vertexShader = replaceOnce(
      shader.vertexShader,
      "#include <begin_vertex>",
      "#include <begin_vertex>\nabsTriPosition=transformed;",
    );
    // Normal-map declarations precede helper functions that use their uniforms.
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      "#include <normalmap_pars_fragment>",
      `#include <normalmap_pars_fragment>\n${functions}`,
    );
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      "#include <map_fragment>",
      `${prepare}
#ifdef USE_MAP
diffuseColor*=absTriSample(map,absTriP,absTriDx,absTriDy,absTriW);
#endif
`,
    );
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      "#include <roughnessmap_fragment>",
      `
float roughnessFactor=roughness;
#ifdef USE_ROUGHNESSMAP
roughnessFactor*=absTriSample(roughnessMap,absTriP,absTriDx,absTriDy,absTriW).g;
#endif
`,
    );
    shader.fragmentShader = replaceOnce(
      shader.fragmentShader,
      "#include <normal_fragment_maps>",
      `
#ifdef USE_NORMALMAP_TANGENTSPACE
vec3 absTriG=absTriGradient(absTriP,absTriDx,absTriDy,absTriW);
vec3 absTriSurfaceG=absTriG-absTriN*dot(absTriG,absTriN);
if(dot(absTriSurfaceG,absTriSurfaceG)>1e-20) {
 vec3 absTriBumped=normalize(absTriNormalToView*(absTriN-absTriSurfaceG));
 #ifdef FLIP_SIDED
 absTriBumped=-absTriBumped;
 #endif
 #ifdef DOUBLE_SIDED
 absTriBumped*=faceDirection;
 #endif
 normal=absTriBumped;
}
#endif
`,
    );
  };
  return material;
}
