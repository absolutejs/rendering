import {
  Data3DTexture,
  DataTexture,
  FloatType,
  RGBAFormat,
  LinearFilter,
  Vector3,
  type MeshStandardMaterial,
  type WebGLRenderer,
} from "three";
import { withLeafEnvironmentVisibility } from "./leafLighting.js";
import { withIndirectDiffuseVisibility } from "./indirectVisibility.js";

export type GroundedSH9VolumeOptions = {
  /** X/Z sample counts, each 2..64. */
  resolution: readonly [number, number];
  /** Two to eight increasing elevations relative to the sampled ground. */
  elevations: readonly number[];
  /** World-space X/Z footprint centered at each upload's center. */
  size: readonly [number, number];
  /** Fraction of the center-to-edge distance before fading. Default .8. */
  edgeFadeStart?: number;
  lowerFade: readonly [number, number];
  upperFade: readonly [number, number];
};
export type GroundedSH9Upload = {
  revision: string;
  lightingRevision: string;
  center: readonly [number, number];
  /** Seven RGBA groups of RGB SH9 coefficients, X then Z then elevation. */
  coefficients: readonly Float32Array[];
  /** RGBA ground grid, same X/Z order; R is world-space ground elevation. */
  ground: Float32Array;
  /** Unoccluded RGB SH9 radiance, nine consecutive RGB coefficients. */
  open: readonly number[] | Float32Array;
};
export type GroundedSH9Mode = "leaf-environment" | "indirect-diffuse";
const bindings = new WeakMap<MeshStandardMaterial, object>();
const label = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 256;
const finite = (v: number) => Number.isFinite(v) && Math.abs(v) <= 1e12;
const pair = (v: readonly number[] | undefined) =>
  Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
const glsl = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
/** Call before binding when a baseline-lighting fallback is preferred to an error.
 * This material path needs WebGL2 and linear filtering of Float32 textures. */
export function supportsGroundedSH9Volume(
  renderer: Pick<WebGLRenderer, "extensions">,
) {
  return !!renderer?.extensions?.has("OES_texture_float_linear");
}

/** Fixed-capacity, Y-up, ground-relative SH9 attenuation. Owns two CPU/GPU textures;
 * never generates probes, schedules frames, reads a scene or changes direct/specular
 * light. Input arrays are copied; material uniforms/storage remain stable on upload.
 * This is a finite local approximation, not full GI or a general lightmap baker. */
export function createGroundedSH9Volume(options: GroundedSH9VolumeOptions) {
  if (
    !options ||
    !pair(options.resolution) ||
    !options.resolution.every(
      (v) => Number.isInteger(v) && v >= 2 && v <= 64,
    ) ||
    !pair(options.size) ||
    !options.size.every((v) => v >= 0.001 && v <= 1e6) ||
    !Array.isArray(options.elevations) ||
    options.elevations.length < 2 ||
    options.elevations.length > 8 ||
    !options.elevations.every(
      (v, i, a) =>
        Number.isFinite(v) &&
        Math.abs(v) <= 1e4 &&
        (!i || v - a[i - 1]! >= 0.001),
    ) ||
    !pair(options.lowerFade) ||
    !pair(options.upperFade) ||
    ![...options.lowerFade, ...options.upperFade].every(
      (v) => Math.abs(v) <= 1e4,
    ) ||
    options.lowerFade[1] - options.lowerFade[0] < 0.001 ||
    options.lowerFade[1] > options.elevations[0]! ||
    options.upperFade[1] - options.upperFade[0] < 0.001 ||
    options.upperFade[0] < options.elevations[0]! ||
    options.upperFade[1] > options.elevations.at(-1)!
  )
    throw Error("Invalid grounded SH9 volume layout");
  const edge = options.edgeFadeStart ?? 0.8;
  if (!Number.isFinite(edge) || edge < 0 || edge > 0.999)
    throw Error("Invalid grounded SH9 edge fade");
  const width = options.resolution[0],
    depth = options.resolution[1],
    elevations = [...options.elevations],
    layers = elevations.length,
    size = [...options.size],
    lower = [...options.lowerFade],
    upper = [...options.upperFade],
    pixels = width * depth * layers,
    groupLength = pixels * 4;
  const bytes = (7 * groupLength + width * depth * 4) * 4;
  const keyLayout = JSON.stringify({
    width,
    depth,
    elevations,
    size,
    lower,
    upper,
    edge,
  });
  const volume = new Data3DTexture(
    new Float32Array(7 * groupLength),
    width,
    depth,
    7 * layers,
  );
  volume.type = FloatType;
  volume.format = RGBAFormat;
  volume.minFilter = volume.magFilter = LinearFilter;
  volume.generateMipmaps = false;
  volume.needsUpdate = true;
  const ground = new DataTexture(
    new Float32Array(width * depth * 4),
    width,
    depth,
    RGBAFormat,
    FloatType,
  );
  ground.minFilter = ground.magFilter = LinearFilter;
  ground.generateMipmaps = false;
  ground.needsUpdate = true;
  const strength = { value: 0 },
    center = { value: new Vector3() },
    open = { value: Array.from({ length: 9 }, () => new Vector3()) };
  const owners = new Map<MeshStandardMaterial, () => void>(),
    token = {};
  let disposed = false,
    revision: string | null = null,
    lightingRevision: string | null = null,
    updates = 0;
  const check = () => {
    if (disposed) throw Error("Grounded SH9 volume disposed");
  };
  const declarations = /*glsl*/ `
 varying vec3 absShLocal;
 uniform float absShStrength;
 uniform highp sampler2D absShGround;
 uniform highp sampler3D absShVolume;
 uniform vec3 absShOpen[9];
 vec3 absShCoefficients[9];
 float absShWeight;
 vec3 absShIrradiance(vec3 n,vec3 c[9]){
  return .886227*c[0]+1.023328*(c[1]*n.y+c[2]*n.z+c[3]*n.x)
  +.858086*(c[4]*n.x*n.y+c[5]*n.y*n.z+c[7]*n.x*n.z)
  +c[6]*(.743125*n.z*n.z-.247708)+.429043*c[8]*(n.x*n.x-n.y*n.y);
 }
 vec3 absShVisibility(vec3 viewNormal){
  vec3 n=inverseTransformDirection(viewNormal,viewMatrix);
  vec3 numerator=absShIrradiance(n,absShCoefficients),denominator=absShIrradiance(n,absShOpen);
  vec3 ratio=clamp(numerator/max(denominator,vec3(.000001)),0.,1.);
  ratio=mix(vec3(1.),ratio,step(vec3(.000001),denominator));
  return mix(vec3(1.),ratio,absShWeight);
 }
 `;
  const layerExpression = elevations
    .slice(0, -1)
    .map(
      (v, i) =>
        `${i ? glsl(i) + "+" : ""}clamp((absShHeight-(${glsl(v)}))/${glsl(elevations[i + 1]! - v)},0.,1.)`,
    )
    .reduceRight(
      (tail, expression, i) =>
        i === layers - 2
          ? expression
          : `absShHeight<${glsl(elevations[i + 1]!)}?${expression}:(${tail})`,
      "",
    );
  const assignments = Array.from(
    { length: 9 },
    (_, c) =>
      `absShCoefficients[${c}]=vec3(${Array.from(
        { length: 3 },
        (_, channel) => {
          const i = c * 3 + channel;
          return `absShPack${Math.floor(i / 4)}.${"xyzw"[i % 4]}`;
        },
      ).join(",")});`,
  ).join("\n");
  const sample = /*glsl*/ `
 vec2 absShPoint=absShLocal.xz/vec2(${glsl(size[0]!)},${glsl(size[1]!)})+vec2(.5);
 vec2 absShUV=(clamp(absShPoint,0.,1.)*vec2(${glsl(width - 1)},${glsl(depth - 1)})+vec2(.5))/vec2(${glsl(width)},${glsl(depth)});
 float absShHeight=absShLocal.y-texture2D(absShGround,absShUV).r;
 float absShLayer=${layerExpression};
 ${Array.from({ length: 7 }, (_, i) => `vec4 absShPack${i}=texture(absShVolume,vec3(absShUV,(absShLayer+${glsl(i * layers)}+.5)/${glsl(7 * layers)}));`).join("\n")}
 ${assignments}
 absShWeight=absShStrength*(1.-smoothstep(${glsl(edge * 0.5)},.5,max(abs(absShPoint.x-.5),abs(absShPoint.y-.5))))*(1.-smoothstep(${glsl(upper[0]!)},${glsl(upper[1]!)},absShHeight))*smoothstep(${glsl(lower[0]!)},${glsl(lower[1]!)},absShHeight);
 `;
  return {
    upload(
      p: GroundedSH9Upload,
      expected: { revision: string; lightingRevision: string },
    ) {
      check();
      if (
        !p ||
        !expected ||
        !label(p.revision) ||
        !label(p.lightingRevision) ||
        p.revision !== expected.revision ||
        p.lightingRevision !== expected.lightingRevision ||
        !pair(p.center) ||
        !p.center.every((v) => Math.abs(v) <= 1e6) ||
        !Array.isArray(p.coefficients) ||
        p.coefficients.length !== 7 ||
        p.coefficients.some(
          (a) =>
            !(a instanceof Float32Array) ||
            !(a.buffer instanceof ArrayBuffer) ||
            a.length !== groupLength ||
            !a.every(finite),
        ) ||
        !(p.ground instanceof Float32Array) ||
        !(p.ground.buffer instanceof ArrayBuffer) ||
        p.ground.length !== width * depth * 4 ||
        !p.ground.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6) ||
        !(Array.isArray(p.open) || p.open instanceof Float32Array) ||
        (p.open instanceof Float32Array &&
          !(p.open.buffer instanceof ArrayBuffer)) ||
        p.open.length !== 27 ||
        !p.open.every(finite)
      )
        throw Error("Invalid or stale grounded SH9 upload");
      p.coefficients.forEach((data, i) =>
        (volume.image.data as Float32Array).set(data, i * groupLength),
      );
      (ground.image.data as Float32Array).set(p.ground);
      volume.needsUpdate = true;
      ground.needsUpdate = true;
      open.value.forEach((v, i) => v.fromArray(p.open, i * 3));
      center.value.set(p.center[0], 0, p.center[1]);
      revision = p.revision;
      lightingRevision = p.lightingRevision;
      strength.value = 1;
      updates++;
    },
    invalidate() {
      check();
      strength.value = 0;
      revision = null;
      lightingRevision = null;
    },
    snapshot() {
      return {
        revision,
        lightingRevision,
        updates,
        enabled: strength.value === 1,
        owners: owners.size,
        textureBytes: disposed ? 0 : bytes,
        disposed,
      };
    },
    bind(material: MeshStandardMaterial, mode: GroundedSH9Mode) {
      check();
      if (
        !material?.isMeshStandardMaterial ||
        !["leaf-environment", "indirect-diffuse"].includes(mode)
      )
        throw Error("Invalid grounded SH9 material binding");
      if (bindings.has(material))
        throw Error("Material already has a grounded SH9 owner");
      const prior = material.onBeforeCompile,
        key = material.customProgramCacheKey,
        cacheKey = key.call(material);
      const compile: MeshStandardMaterial["onBeforeCompile"] = function (
        this: MeshStandardMaterial,
        shader,
        renderer,
      ) {
        if (disposed) throw Error("Grounded SH9 volume disposed");
        if (!supportsGroundedSH9Volume(renderer))
          throw Error("Grounded SH9 requires float texture linear filtering");
        prior.call(this, shader, renderer);
        for (const [source, marker] of [
          [shader.vertexShader, "#include <project_vertex>"],
          [shader.fragmentShader, "#include <common>"],
          [shader.fragmentShader, "#include <lights_fragment_begin>"],
        ] as const)
          if (source.split(marker).length !== 2)
            throw Error("Grounded SH9 shader hook missing or repeated");
        if (
          shader.vertexShader.includes("absShLocal") ||
          shader.fragmentShader.includes("absShVisibility")
        )
          throw Error("Grounded SH9 shader already bound");
        shader.uniforms.absShStrength = strength;
        shader.uniforms.absShCenter = center;
        shader.uniforms.absShGround = { value: ground };
        shader.uniforms.absShOpen = open;
        shader.uniforms.absShVolume = { value: volume };
        shader.vertexShader =
          "varying vec3 absShLocal;uniform vec3 absShCenter;\n" +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `#include <project_vertex>
 vec4 absShWorld=vec4(transformed,1.);
 #ifdef USE_BATCHING
 absShWorld=batchingMatrix*absShWorld;
 #endif
 #ifdef USE_INSTANCING
 absShWorld=instanceMatrix*absShWorld;
 #endif
 absShWorld=modelMatrix*absShWorld;absShLocal=absShWorld.xyz-absShCenter;`,
        );
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\n" + declarations)
          .replace(
            "#include <lights_fragment_begin>",
            sample + "\n#include <lights_fragment_begin>",
          );
        if (mode === "leaf-environment")
          shader.fragmentShader = withLeafEnvironmentVisibility(
            shader.fragmentShader,
            "absShVisibility",
          );
        else {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <aomap_fragment>",
            "vec3 absShDiffuseVisibility=absShVisibility(normal);\n#include <aomap_fragment>",
          );
          shader.fragmentShader = withIndirectDiffuseVisibility(
            shader.fragmentShader,
            "absShDiffuseVisibility",
          );
        }
      };
      const programKey = () =>
        cacheKey + ":grounded-sh9-1:" + mode + ":" + keyLayout;
      material.onBeforeCompile = compile;
      material.customProgramCacheKey = programKey;
      material.needsUpdate = true;
      const release = () => {
        if (!owners.delete(material)) return;
        material.removeEventListener("dispose", release);
        if (material.onBeforeCompile === compile)
          material.onBeforeCompile = prior;
        if (material.customProgramCacheKey === programKey)
          material.customProgramCacheKey = key;
        if (bindings.get(material) === token) bindings.delete(material);
        material.needsUpdate = true;
      };
      bindings.set(material, token);
      owners.set(material, release);
      material.addEventListener("dispose", release);
      return release;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      strength.value = 0;
      revision = null;
      lightingRevision = null;
      for (const release of [...owners.values()]) release();
      volume.dispose();
      ground.dispose();
      volume.image.data = new Float32Array(0);
      ground.image.data = new Float32Array(0);
    },
  };
}
export type GroundedSH9Volume = ReturnType<typeof createGroundedSH9Volume>;
