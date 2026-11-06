import {
  createCompactFloatAttribute,
  readTargetPixelsScoped,
} from "../src/index";
import {
  WebGLRenderer,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  Scene,
  OrthographicCamera,
  WebGLRenderTarget,
  FloatType,
  NoToneMapping,
} from "three";
(window as any).verifyCompactAttributes = () => {
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.setSize(32, 32);
  renderer.toneMapping = NoToneMapping;
  const gl = renderer.getContext(),
    debug = gl.getExtension("WEBGL_debug_renderer_info");
  const identity = gl.getParameter(
    debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
  );
  if (!/SwiftShader/.test(identity)) throw Error("Software renderer required");
  const source = new BufferGeometry();
  source.setAttribute(
    "position",
    new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
  );
  source.setIndex([0, 1, 2, 0, 2, 3]);
  source.setAttribute(
    "normal",
    new Float32BufferAttribute(
      [
        0.2, 0.3, 0.9327379, -0.3, 0.1, 0.9486833, 0.4, -0.2, 0.8944272, 0.1,
        0.2, 0.9746794,
      ],
      3,
    ),
  );
  source.setAttribute(
    "uv",
    new Float32BufferAttribute(
      [-0.1234, 0.0031, 1.2345, -0.6543, 2.1234, 1.3456, -0.3219, 2.1111],
      2,
    ),
  );
  source.setAttribute(
    "testColor",
    new Float32BufferAttribute(
      [
        1.1234, 0.5321, 0.2312, 1, 0.9876, 1.1432, 0.3987, 1, 0.7654, 0.5432,
        1.0123, 1, 0.1123, 0.4321, 0.6543, 1,
      ],
      4,
    ),
  );
  const material = new ShaderMaterial({
    vertexShader:
      "attribute vec4 testColor;varying vec4 tint;varying vec3 n;varying vec2 tex;void main(){tint=testColor;n=normal;tex=uv;gl_Position=vec4(position,1.);}",
    fragmentShader:
      "varying vec4 tint;varying vec3 n;varying vec2 tex;void main(){gl_FragColor=vec4(tint.rgb*(.5+.5*normalize(n).z)+vec3(.1*sin(tex.x),.1*sin(tex.y),0.),1.);}",
  });
  const scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    mesh = new Mesh(source, material),
    target = new WebGLRenderTarget(32, 32, { type: FloatType });
  scene.add(mesh);
  mesh.frustumCulled = false;
  const geometries = [source],
    rows = [];
  const draw = (geometry: BufferGeometry) => {
    mesh.geometry = geometry;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    const pixels = new Float32Array(32 * 32 * 4);
    readTargetPixelsScoped(renderer, target, 32, 32, pixels);
    return pixels;
  };
  const baseline = draw(source);
  for (const names of [
    ["normal"],
    ["uv"],
    ["testColor"],
    ["normal", "uv", "testColor"],
  ]) {
    const geometry = source.clone(),
      audits = [];
    geometries.push(geometry);
    for (const name of names) {
      const input = source.getAttribute(name);
      const packed = createCompactFloatAttribute(
        input.array as Float32Array,
        input.itemSize,
        {
          encoding: name === "normal" ? "snorm16" : "float16",
          maximumAbsoluteError: name === "normal" ? 1 / 32767 : 0.002,
        },
      );
      geometry.setAttribute(name, packed.attribute);
      audits.push({ name, ...packed.audit });
    }
    const pixels = draw(geometry);
    let maximumError = 0,
      squared = 0;
    for (let i = 0; i < pixels.length; i++) {
      if (!Number.isFinite(pixels[i]))
        throw Error("Nonfinite attribute rendering");
      if (i % 4 === 3 && pixels[i] !== baseline[i])
        throw Error("Coverage changed");
      const delta = Math.abs(pixels[i]! - baseline[i]!);
      maximumError = Math.max(maximumError, delta);
      squared += delta * delta;
    }
    if (maximumError > 0.002)
      throw Error("Compact attribute image error budget");
    rows.push({
      names,
      audits,
      maximumError,
      rmsError: Math.sqrt(squared / pixels.length),
      glError: gl.getError(),
    });
  }
  const restored = draw(source);
  if (restored.some((value, index) => value !== baseline[index]))
    throw Error("Source restoration failed");
  for (const geometry of geometries) geometry.dispose();
  material.dispose();
  target.dispose();
  const resources = { ...renderer.info.memory },
    programs = renderer.info.programs?.length;
  renderer.dispose();
  return {
    identity,
    rows,
    restorationExact: true,
    resources,
    programs,
    scope:
      "32x32 float-target vertex-format controls; not material/forest visual or performance acceptance.",
  };
};
