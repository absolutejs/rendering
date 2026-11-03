import * as T from "three";
import { createObjectTriplanarMaterial } from "../src";
const renderer = new T.WebGLRenderer({ antialias: false });
renderer.setSize(96, 96);
renderer.setPixelRatio(1);
renderer.toneMapping = T.NoToneMapping;
renderer.outputColorSpace = T.LinearSRGBColorSpace;
const target = new T.WebGLRenderTarget(96, 96, { depthBuffer: true });
const context = renderer.getContext(),
  extension = context.getExtension("WEBGL_debug_renderer_info");
const rendererName = extension
  ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
  : "";
const cases: unknown[] = [];
const owned: T.Texture[] = [];
function check(value: unknown, message: string) {
  if (!value) throw Error(message);
}
function texture(data: Uint8Array | Float32Array, w = 1, h = 1) {
  const t = new T.DataTexture(
    data,
    w,
    h,
    T.RGBAFormat,
    data instanceof Float32Array ? T.FloatType : T.UnsignedByteType,
  );
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.minFilter = t.magFilter = T.NearestFilter;
  t.needsUpdate = true;
  owned.push(t);
  return t;
}
const pixels = new Uint8Array(16 * 16 * 4);
for (let y = 0; y < 16; y++)
  for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    pixels.set(
      [x % 4 < 2 ? 220 : 25, y % 4 < 2 ? 180 : 40, (x + y) % 3 ? 60 : 210, 255],
      i,
    );
  }
const map = texture(pixels, 16, 16),
  normalMap = texture(new Uint8Array([153, 166, 245, 255])),
  neutral = texture(new Float32Array([0.5, 0.5, 1, 1])),
  roughness = texture(new Uint8Array([13, 102, 240, 255]));
function diagnostic(
  material: T.MeshStandardMaterial,
  channel: "color" | "normal" | "roughness",
) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, device) {
    previous.call(this, shader, device);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `outgoingLight=${channel === "color" ? "diffuseColor.rgb" : channel === "normal" ? "normal*.5+.5" : "vec3(roughnessFactor)"};\n#include <opaque_fragment>`,
    );
  };
  const key = material.customProgramCacheKey;
  material.customProgramCacheKey = function () {
    return key.call(this) + ":diagnostic-" + channel;
  };
  return material;
}
function capture(
  geometry: T.BufferGeometry,
  material: T.MeshStandardMaterial,
  matrix = new T.Matrix4(),
  instance = false,
  cameraTransform = new T.Matrix4(),
  normal?: T.Vector3,
) {
  const scene = new T.Scene();
  scene.background = new T.Color(0);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.copy(
    normal ? normal.clone().multiplyScalar(4) : new T.Vector3(0, 0, 4),
  );
  if (normal && Math.abs(normal.y) > 0.9) camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.applyMatrix4(cameraTransform);
  camera.updateMatrixWorld();
  const object = instance
    ? new T.InstancedMesh(geometry, material, 1)
    : new T.Mesh(geometry, material);
  if (object instanceof T.InstancedMesh) {
    object.setMatrixAt(0, matrix);
    object.instanceMatrix.needsUpdate = true;
  } else {
    object.matrixAutoUpdate = false;
    object.matrix.copy(matrix);
  }
  scene.add(object);
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  const data = new Uint8Array(96 * 96 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 96, 96, data);
  const calls = renderer.info.render.calls;
  const normalMatrix = new T.Matrix3().getNormalMatrix(
    new T.Matrix4().multiplyMatrices(camera.matrixWorldInverse, matrix),
  );
  scene.remove(object);
  if (object instanceof T.InstancedMesh) object.dispose();
  return { data, calls, normalMatrix };
}
function difference(a: Uint8Array, b: Uint8Array) {
  let sum = 0,
    max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i]! - b[i]!);
    sum += d;
    max = Math.max(max, d);
  }
  return { mean: sum / a.length, max };
}
function center(data: Uint8Array) {
  return Array.from(data.slice((48 * 96 + 48) * 4, (48 * 96 + 48) * 4 + 3));
}
try {
  check(
    String(rendererName).includes("SwiftShader"),
    "Expected software renderer",
  );
  const geometry = new T.IcosahedronGeometry(1, 2),
    scrambled = geometry.clone();
  const uv = scrambled.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0, 0);
  const material = diagnostic(
    createObjectTriplanarMaterial({
      map,
      projection: { scale: 1.37, offset: [0.13, 0.27, 0.39] },
    }),
    "color",
  );
  const original = capture(geometry, material),
    changed = capture(scrambled, material);
  const uvDifference = difference(original.data, changed.data);
  check(uvDifference.max === 0, "Triplanar output depends on UVs");
  check(original.calls === 1, "Extra draw added");
  cases.push({
    name: "UV independence",
    ...uvDifference,
    calls: original.calls,
  });
  const legacy = diagnostic(new T.MeshStandardMaterial({ map }), "color"),
    legacyDifference = difference(
      capture(geometry, legacy).data,
      capture(scrambled, legacy).data,
    );
  check(
    legacyDifference.mean > 5,
    "UV control did not detect damaged coordinates",
  );
  cases.push({ name: "UV control", ...legacyDifference });
  legacy.dispose();
  const rigid = new T.Matrix4().compose(
    new T.Vector3(83, -27, 59),
    new T.Quaternion().setFromEuler(new T.Euler(0.3, 0.7, -0.2)),
    new T.Vector3(1, 1, 1),
  );
  const anchored = difference(
    original.data,
    capture(geometry, material, rigid, false, rigid).data,
  );
  check(anchored.mean < 0.5, "Rigid mapping swims");
  cases.push({ name: "rigid anchoring", ...anchored });
  const transform = new T.Matrix4().compose(
    new T.Vector3(0, 0, 0),
    new T.Quaternion().setFromEuler(new T.Euler(0.2, 0.4, 0.1)),
    new T.Vector3(1.1, 0.65, 0.9),
  );
  const norm = diagnostic(
    createObjectTriplanarMaterial({
      normalMap,
      normalScale: new T.Vector2(0.7, 0.7),
    }),
    "normal",
  );
  const instanceDifference = difference(
    capture(geometry, norm, transform).data,
    capture(geometry, norm, transform, true).data,
  );
  check(instanceDifference.mean < 0.5, "Instance normals differ from mesh");
  cases.push({ name: "nonuniform instance normals", ...instanceDifference });
  norm.dispose();
  const flat = diagnostic(
    createObjectTriplanarMaterial({ normalMap: neutral, flatShading: true }),
    "normal",
  );
  const flatReference = diagnostic(
    new T.MeshStandardMaterial({ flatShading: true }),
    "normal",
  );
  const flatDifference = difference(
    capture(geometry, flat, transform).data,
    capture(geometry, flatReference, transform).data,
  );
  check(flatDifference.max === 0, "Neutral flat normal changed lighting");
  cases.push({ name: "neutral flat shading", ...flatDifference });
  flat.dispose();
  flatReference.dispose();
  const smooth = diagnostic(
      createObjectTriplanarMaterial({ normalMap: neutral }),
      "normal",
    ),
    smoothReference = diagnostic(new T.MeshStandardMaterial(), "normal");
  const neutralDifference = difference(
    capture(geometry, smooth, transform).data,
    capture(geometry, smoothReference, transform).data,
  );
  check(neutralDifference.max === 0, "Neutral smooth normal changed lighting");
  cases.push({ name: "neutral smooth shading", ...neutralDifference });
  smooth.dispose();
  smoothReference.dispose();
  const su = -((153 / 255) * 2 - 1) / ((245 / 255) * 2 - 1),
    sv = -((166 / 255) * 2 - 1) / ((245 / 255) * 2 - 1);
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const n = new T.Vector3().setComponent(axis, sign),
        g =
          axis === 0
            ? new T.Vector3(0, su, sv)
            : axis === 1
              ? new T.Vector3(su, 0, sv)
              : new T.Vector3(su, sv, 0);
      const plane = new T.PlaneGeometry(2, 2);
      plane.applyQuaternion(
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), n),
      );
      const m = diagnostic(
        createObjectTriplanarMaterial({ normalMap }),
        "normal",
      );
      const rendered = capture(plane, m, undefined, false, undefined, n);
      const expected = n
        .clone()
        .sub(g)
        .applyMatrix3(rendered.normalMatrix)
        .normalize()
        .multiplyScalar(0.5)
        .addScalar(0.5)
        .multiplyScalar(255)
        .toArray();
      const observed = center(rendered.data);
      const error = Math.max(
        ...observed.map((v, i) => Math.abs(v - expected[i]!)),
      );
      check(
        error < 2,
        `Axis normal failed ${axis}/${sign}: ${observed} vs ${expected}`,
      );
      cases.push({
        name: "axis normal",
        axis,
        sign,
        error,
        observed,
        expected,
      });
      plane.dispose();
      m.dispose();
    }
  const packed = new T.DataTexture(
    new Uint8Array([153, 166]),
    1,
    1,
    T.RGFormat,
    T.UnsignedByteType,
  );
  packed.needsUpdate = true;
  owned.push(packed);
  const packedPlane = new T.PlaneGeometry(2, 2),
    packedMaterial = diagnostic(
      createObjectTriplanarMaterial({
        normalMap: packed,
        normalScale: new T.Vector2(1, -1),
      }),
      "normal",
    );
  const packedX = (153 / 255) * 2 - 1,
    packedY = (166 / 255) * 2 - 1;
  const packedExpected = new T.Vector3(
    packedX,
    -packedY,
    Math.sqrt(1 - packedX ** 2 - packedY ** 2),
  )
    .multiplyScalar(0.5)
    .addScalar(0.5)
    .multiplyScalar(255)
    .toArray();
  const packedObserved = center(capture(packedPlane, packedMaterial).data);
  check(
    packedObserved.every((v, i) => Math.abs(v - packedExpected[i]!) < 2),
    "Packed normal or negative Y failed",
  );
  cases.push({
    name: "packed RG normal and negative Y scale",
    observed: packedObserved,
    expected: packedExpected,
  });
  packedPlane.dispose();
  packedMaterial.dispose();
  const plane = new T.PlaneGeometry(2, 2),
    rm = diagnostic(
      createObjectTriplanarMaterial({
        roughnessMap: roughness,
        roughness: 0.8,
      }),
      "roughness",
    );
  const roughPixel = center(capture(plane, rm).data);
  check(
    roughPixel.every((v) => Math.abs(v - 81.6) < 2),
    "Wrong roughness channel",
  );
  cases.push({ name: "roughness green channel", pixel: roughPixel });
  rm.dispose();
  const srgb = texture(new Uint8Array([128, 128, 128, 255]));
  srgb.colorSpace = T.SRGBColorSpace;
  const cm = diagnostic(createObjectTriplanarMaterial({ map: srgb }), "color");
  const colorPixel = center(capture(plane, cm).data);
  check(
    colorPixel.every((v) => Math.abs(v - 55) < 2),
    "Wrong color decoding",
  );
  cases.push({ name: "sRGB decoding", pixel: colorPixel });
  cm.dispose();
  plane.dispose();
  geometry.dispose();
  scrambled.dispose();
  material.dispose();
  const output = document.createElement("canvas");
  output.width = output.height = 96;
  const ctx = output.getContext("2d")!;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(original.data), 96, 96),
    0,
    0,
  );
  document.body.append(output);
  target.dispose();
  owned.forEach((t) => t.dispose());
  renderer.dispose();
  (globalThis as any).triplanarResult = {
    passed: true,
    renderer: rendererName,
    cases,
    scope: "Bounded software-rendered shader controls; no hardware FPS claim",
  };
} catch (error) {
  (globalThis as any).triplanarResult = {
    passed: false,
    error: String(error),
    renderer: rendererName,
    cases,
  };
} finally {
  renderer.setRenderTarget(null);
}
