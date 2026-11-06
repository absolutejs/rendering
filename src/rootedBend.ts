import { Box3, Vector2, Vector3, Vector4 } from "three";

const wrappedPhase = (value: number) => {
  const phase = value % (2 * Math.PI);
  return phase < 0 ? phase + 2 * Math.PI : phase;
};

export type RootedBendOptions = {
  /** Local positive-Y height at which the full bend envelope is reached. */
  height: number;
  amplitudeX: number;
  amplitudeZ: number;
  /** Phase change from root to crown, in radians. */
  verticalPhase?: number;
  /** Rotation of the horizontal sway ellipse in local X/Z, radians. */
  rotation?: number;
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
  let cosine = 1,
    sine = 0;
  // Encode identity as zero. Always bind this uniform: programs can be shared.
  const rotation = { value: new Vector2(0, 0) };
  function setRotation(value: number) {
    if (!Number.isFinite(value)) throw Error("Invalid rooted bend rotation");
    const angle = wrappedPhase(value);
    cosine = Math.cos(angle);
    sine = Math.sin(angle);
    rotation.value.set(cosine - 1, sine);
  }
  setRotation(options.rotation ?? 0);
  const phase = { value: 0 };
  return {
    shape,
    phase,
    rotation,
    /** Rotation changes require recomputing bounds from the original box. */
    setRotation,
    /** Set a bounded absolute phase. Call from an existing animation clock. */
    setPhase(value: number) {
      if (!Number.isFinite(value)) throw Error("Invalid rooted bend phase");
      phase.value = wrappedPhase(value);
    },
    /** Conservative pointwise motion under a fixed linear projection of local
     * X/Z displacement. Identity gives local metres; shadow-camera rows can give
     * texels. This does not bound changes to rotation, projection, geometry or transforms. */
    motionBound(
      fromPhase: number,
      toPhase: number,
      projection: readonly [number, number, number, number] = [1, 0, 0, 1],
    ) {
      if (
        ![fromPhase, toPhase].every(Number.isFinite) ||
        projection.length !== 4 ||
        !projection.every(Number.isFinite)
      )
        throw Error("Invalid rooted bend motion query");
      const [xx, xz, yx, yz] = projection;
      const a = (xx * cosine + xz * sine) * amplitudeX,
        b = (-xx * sine + xz * cosine) * amplitudeZ,
        c = (yx * cosine + yz * sine) * amplitudeX,
        d = (-yx * sine + yz * cosine) * amplitudeZ;
      const scale = Math.max(
        Math.abs(a),
        Math.abs(b),
        Math.abs(c),
        Math.abs(d),
      );
      if (!Number.isFinite(scale))
        throw Error("Unbounded rooted bend projection");
      if (scale === 0) return 0;
      const aa = a / scale,
        bb = b / scale,
        cc = c / scale,
        dd = d / scale;
      const sum = aa * aa + bb * bb + cc * cc + dd * dd,
        determinant = aa * dd - bb * cc;
      const norm =
        scale *
        Math.sqrt(
          (sum +
            Math.sqrt(Math.max(0, sum * sum - 4 * determinant * determinant))) /
            2,
        );
      const delta = wrappedPhase(toPhase) - wrappedPhase(fromPhase);
      const bound = 2 * norm * Math.abs(Math.sin(delta / 2));
      if (!Number.isFinite(bound))
        throw Error("Unbounded rooted bend projection");
      return bound;
    },
    /** Conservative all-phase bounds, without mutating the source box. Apply
     * before world/instance transforms. Recompute from the original box. Set
     * allRotations for bounds that also contain arbitrary horizontal rotations. */
    expandBounds(source: Box3, allRotations = false): Box3 {
      if (typeof allRotations !== "boolean")
        throw Error("Invalid rooted bend bounds mode");
      if (source.isEmpty()) return source.clone();
      if (![...source.min, ...source.max].every(Number.isFinite))
        throw Error("Invalid rooted bend bounds");
      return source
        .clone()
        .expandByVector(
          new Vector3(
            allRotations
              ? Math.max(Math.abs(amplitudeX), Math.abs(amplitudeZ))
              : Math.hypot(cosine * amplitudeX, sine * amplitudeZ),
            0,
            allRotations
              ? Math.max(Math.abs(amplitudeX), Math.abs(amplitudeZ))
              : Math.hypot(sine * amplitudeX, cosine * amplitudeZ),
          ),
        );
    },
    sample(y: number, angle = phase.value) {
      if (!Number.isFinite(y) || !Number.isFinite(angle))
        throw Error("Invalid rooted bend sample");
      const h = Math.min(1, Math.max(0, y / height));
      const dh = y > 0 && y < height ? 1 / height : 0;
      const envelope = h * h * (3 - 2 * h);
      const slope = 6 * h * (1 - h) * dh;
      const a = wrappedPhase(angle) + verticalPhase * envelope;
      const raw = {
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
      return {
        x: cosine * raw.x - sine * raw.z,
        z: sine * raw.x + cosine * raw.z,
        dxdy: cosine * raw.dxdy - sine * raw.dzdy,
        dzdy: sine * raw.dxdy + cosine * raw.dzdy,
      };
    },
  };
}

export const rootedBendGLSL = /* glsl */ `
uniform vec4 absRootedBendShape;
uniform float absRootedBendPhase;
uniform vec2 absRootedBendRotation;
vec4 absRootedBend(float y) {
 float h=clamp(y/absRootedBendShape.x,0.,1.);
 float dh=(y>0. && y<absRootedBendShape.x)?1./absRootedBendShape.x:0.;
 float b=h*h*(3.-2.*h), db=6.*h*(1.-h)*dh;
 float a=absRootedBendPhase+absRootedBendShape.w*b;
 float s=sin(a), c=cos(a), k=absRootedBendShape.w*db;
 vec4 displacement=vec4(absRootedBendShape.y*b*s,absRootedBendShape.z*b*c,
   absRootedBendShape.y*(db*s+b*c*k),absRootedBendShape.z*(db*c-b*s*k));
 vec2 r=vec2(1.+absRootedBendRotation.x,absRootedBendRotation.y);
 mat2 basis=mat2(r.x,r.y,-r.y,r.x);
 return vec4(basis*displacement.xy,basis*displacement.zw);
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
