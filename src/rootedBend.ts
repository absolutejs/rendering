import { Box3, Vector3, Vector4 } from "three";

export type RootedBendOptions = {
  /** Local positive-Y height at which the full bend envelope is reached. */
  height: number;
  amplitudeX: number;
  amplitudeZ: number;
  /** Phase change from root to crown, in radians. */
  verticalPhase?: number;
};

/** Analytic visual shear for rigid, unskinned local-space geometry. The root
 * plane and points below it stay fixed. This is not a branch dynamics solver. */
export function createRootedBend(options: RootedBendOptions) {
  const { height, amplitudeX, amplitudeZ, verticalPhase = 0.7 } = options;
  if (
    ![height, amplitudeX, amplitudeZ, verticalPhase].every(Number.isFinite) ||
    height <= 0 ||
    height > 10000 ||
    Math.abs(amplitudeX) > height / 4 ||
    Math.abs(amplitudeZ) > height / 4 ||
    Math.abs(verticalPhase) > Math.PI * 4
  )
    throw Error("Invalid rooted bend parameters");
  const shape = {
    value: new Vector4(height, amplitudeX, amplitudeZ, verticalPhase),
  };
  const phase = { value: 0 };
  return {
    shape,
    phase,
    /** Set a bounded absolute phase. Call from an existing animation clock. */
    setPhase(value: number) {
      if (!Number.isFinite(value)) throw Error("Invalid rooted bend phase");
      phase.value = ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    },
    /** Conservative all-phase bounds, without mutating the source box. Apply
     * before world/instance transforms. Recompute from the original box. */
    expandBounds(source: Box3): Box3 {
      if (source.isEmpty()) return source.clone();
      if (![...source.min, ...source.max].every(Number.isFinite))
        throw Error("Invalid rooted bend bounds");
      return source
        .clone()
        .expandByVector(
          new Vector3(Math.abs(amplitudeX), 0, Math.abs(amplitudeZ)),
        );
    },
    sample(y: number, angle = phase.value) {
      if (!Number.isFinite(y) || !Number.isFinite(angle))
        throw Error("Invalid rooted bend sample");
      const h = Math.min(1, Math.max(0, y / height));
      const dh = y > 0 && y < height ? 1 / height : 0;
      const envelope = h * h * (3 - 2 * h);
      const slope = 6 * h * (1 - h) * dh;
      const a = angle + verticalPhase * envelope;
      return {
        x: amplitudeX * envelope * Math.sin(a),
        z: amplitudeZ * envelope * Math.cos(a),
        dxdy:
          amplitudeX *
          (slope * Math.sin(a) +
            envelope * Math.cos(a) * verticalPhase * slope),
        dzdy:
          amplitudeZ *
          (slope * Math.cos(a) -
            envelope * Math.sin(a) * verticalPhase * slope),
      };
    },
  };
}

export const rootedBendGLSL = /* glsl */ `
uniform vec4 absRootedBendShape;
uniform float absRootedBendPhase;
vec4 absRootedBend(float y) {
 float h=clamp(y/absRootedBendShape.x,0.,1.);
 float dh=(y>0. && y<absRootedBendShape.x)?1./absRootedBendShape.x:0.;
 float b=h*h*(3.-2.*h), db=6.*h*(1.-h)*dh;
 float a=absRootedBendPhase+absRootedBendShape.w*b;
 float s=sin(a), c=cos(a), k=absRootedBendShape.w*db;
 return vec4(absRootedBendShape.y*b*s,absRootedBendShape.z*b*c,
   absRootedBendShape.y*(db*s+b*c*k),absRootedBendShape.z*(db*c-b*s*k));
}
`;

/** Install on both color and depth shaders using the same uniforms. Normals
 * and optional tangents use the exact shear Jacobian. Caller owns cache keys,
 * uniforms, conservative bounds and shadow-map refresh scheduling. */
export function withRootedBend(shader: string, normals = true): string {
  const position = "#include <begin_vertex>",
    normal = "#include <defaultnormal_vertex>";
  if (
    shader.includes("absRootedBend") ||
    shader.split(position).length !== 2 ||
    (normals && shader.split(normal).length !== 2)
  )
    throw Error("Rooted bend hooks missing or already installed");
  let result =
    rootedBendGLSL +
    shader.replace(
      position,
      `${position}
 vec4 absBendPosition=absRootedBend(position.y);
 transformed.xz+=absBendPosition.xy;`,
    );
  if (normals)
    result = result.replace(
      normal,
      `
 vec4 absBendNormal=absRootedBend(position.y);
 objectNormal.y-=dot(absBendNormal.zw,objectNormal.xz);
 #ifdef USE_TANGENT
 objectTangent.xz+=absBendNormal.zw*objectTangent.y;
 #endif
 ${normal}`,
    );
  return result;
}
