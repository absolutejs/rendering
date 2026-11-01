import {
  WebGLRenderer,
  ShaderChunk,
  Scene,
  OrthographicCamera,
  PlaneGeometry,
  Mesh,
  MeshBasicMaterial,
  DataTexture,
  WebGLRenderTarget,
  WebGLCubeRenderTarget,
  FloatType,
  Vector4,
} from "three";
import {
  bindAlphaToCoverageDestination,
  cloneRenderMaterial,
  readTargetPixelsScoped,
  readFloatTargetScoped,
  renderTargetScope,
} from "../dist/index.js";
const fixed = (globalThis as any).__destinationFix === true;
const canvas = document.createElement("canvas");
const context = canvas.getContext("webgl2", { alpha: false, antialias: true });
if (!context) throw Error("WebGL 2 required");
const renderer = new WebGLRenderer({ canvas, context });
function configureBakedVisibilityCoverage(
  material: MeshBasicMaterial,
  enabled: boolean,
) {
  material.alphaToCoverage = enabled;
  if (!enabled) return;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      ShaderChunk.alphatest_fragment.replace(
        "smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a )",
        "clamp(diffuseColor.a, 0., 1.)",
      ),
    );
  };
  material.customProgramCacheKey = () => "visibility-control";
}
renderer.setSize(16, 16);
const ctx = renderer.getContext(),
  debug = ctx.getExtension("WEBGL_debug_renderer_info");
const identity = ctx.getParameter(
  debug ? debug.UNMASKED_RENDERER_WEBGL : ctx.RENDERER,
);
if (!/SwiftShader/.test(identity)) throw Error("Software renderer required");
const scene = new Scene(),
  camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 2;
const geometry = new PlaneGeometry(2, 2),
  target = new WebGLRenderTarget(16, 16, { samples: 0 }),
  sampled = new WebGLRenderTarget(16, 16, { samples: 4 });
const rows = [],
  programs = [];
for (const alpha of [0.25, 0.5, 0.75]) {
  const texture = new DataTexture(
    new Uint8Array([255, 255, 255, Math.round(alpha * 255)]),
    1,
    1,
  );
  texture.needsUpdate = true;
  for (const configured of [true, false])
    for (const cloned of [false, true]) {
      const source = new MeshBasicMaterial({
        map: texture,
        alphaTest: 0.35,
      });
      configureBakedVisibilityCoverage(source, configured);
      if (fixed && configured) bindAlphaToCoverageDestination(source);
      const material = cloned ? cloneRenderMaterial(source) : source;
      const mesh = new Mesh(geometry, material);
      scene.add(mesh);
      let warmPrograms = 0;
      for (let cycle = 0; cycle < 4; cycle++) {
        for (const destination of [
          "canvas",
          "offscreen",
          "sampled-target",
          "canvas-return",
        ]) {
          const output =
            destination === "offscreen"
              ? target
              : destination === "sampled-target"
                ? sampled
                : null;
          renderer.setRenderTarget(output);
          const drawSamples = ctx.getParameter(ctx.SAMPLES);
          renderer.render(scene, camera);
          const pixels = new Uint8Array(16 * 16 * 4);
          if (output) readTargetPixelsScoped(renderer, output, 16, 16, pixels);
          else
            ctx.readPixels(0, 0, 16, 16, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels);
          let coverage = 0;
          for (let i = 0; i < pixels.length; i += 4)
            coverage += pixels[i]! / (255 * 256);
          const expected =
            configured && drawSamples > 0 ? alpha : alpha > 0.35 ? 1 : 0;
          rows.push({
            alpha,
            configured,
            cloned,
            cycle,
            destination,
            drawSamples,
            coverage,
            expected,
            alphaToCoverage: material.alphaToCoverage,
          });
        }
        const count = renderer.info.programs?.length ?? 0;
        if (cycle === 0) warmPrograms = count;
        programs.push({
          alpha,
          configured,
          cloned,
          cycle,
          count,
          warmPrograms,
        });
      }
      scene.remove(mesh);
      material.dispose();
      if (cloned) source.dispose();
    }
  texture.dispose();
}
async function finish() {
  const readbacks: unknown[] = [];
  const drawMaterial = new MeshBasicMaterial({
    color: 0xff0000,
    toneMapped: false,
  });
  const drawMesh = new Mesh(geometry, drawMaterial);
  scene.add(drawMesh);
  for (const destination of [target, sampled]) {
    renderer.setRenderTarget(destination);
    drawMaterial.color.setHex(0xff0000);
    renderer.render(scene, camera);
    const red = new Uint8Array(16 * 16 * 4);
    readTargetPixelsScoped(renderer, destination, 16, 16, red);
    // Deliberately no setRenderTarget here: readback must restore the draw attachment.
    drawMaterial.color.setHex(0x00ff00);
    renderer.render(scene, camera);
    const green = new Uint8Array(16 * 16 * 4);
    readTargetPixelsScoped(renderer, destination, 16, 16, green);
    if (red[0] !== 255 || red[1] !== 0 || green[0] !== 0 || green[1] !== 255)
      throw Error("Readback broke subsequent draw");
    readbacks.push({
      samples: destination.samples,
      red: Array.from(red.slice(0, 4)),
      green: Array.from(green.slice(0, 4)),
    });
  }
  if (!ctx.getExtension("EXT_color_buffer_float"))
    throw Error("Float test capability missing");
  const float = new WebGLRenderTarget(16, 16, { type: FloatType });
  const cube = new WebGLCubeRenderTarget(16);
  renderer.setRenderTarget(float);
  drawMaterial.color.setHex(0x0000ff);
  renderer.render(scene, camera);
  for (const output of [sampled, cube]) {
    const face = output === cube ? 4 : 0;
    renderer.setRenderTarget(output, face, 0);
    renderer.render(scene, camera);
    const viewport = renderer.getViewport(new Vector4()).clone();
    const pixels = new Float32Array(16 * 16 * 4);
    const pending = readFloatTargetScoped(renderer, float, 16, 16, pixels);
    if (
      renderer.getRenderTarget() !== output ||
      renderer.getActiveCubeFace() !== face ||
      !renderer.getViewport(new Vector4()).equals(viewport)
    )
      throw Error("Async read leaked renderer state");
    drawMaterial.color.setHex(0x00ff00);
    renderer.render(scene, camera);
    const result = await pending;
    if (
      result !== pixels ||
      pixels[0] !== 0 ||
      pixels[1] !== 0 ||
      pixels[2] !== 1
    )
      throw Error("Float read result mismatch");
    if (
      renderer.getRenderTarget() !== output ||
      renderer.getActiveCubeFace() !== face
    )
      throw Error("Async completion overwrote caller state");
    readbacks.push({
      async: true,
      cube: output === cube,
      face,
      pixel: Array.from(pixels.slice(0, 4)),
    });
  }
  renderer.setViewport(1, 2, 10, 11);
  renderer.setScissor(2, 3, 8, 9);
  renderer.setScissorTest(true);
  try {
    renderTargetScope(renderer, () => {
      renderer.setRenderTarget(null);
      renderer.setViewport(0, 0, 1, 1);
      throw Error("injected");
    });
  } catch (e) {
    if ((e as Error).message !== "injected") throw e;
  }
  if (
    renderer.getRenderTarget() !== cube ||
    renderer.getActiveCubeFace() !== 4 ||
    !renderer.getViewport(new Vector4()).equals(new Vector4(1, 2, 10, 11)) ||
    !renderer.getScissorTest()
  )
    throw Error("Scope exception leaked state");
  renderer.setRenderTarget(null);
  renderer.setScissorTest(false);
  float.dispose();
  cube.dispose();
  drawMaterial.dispose();
  scene.remove(drawMesh);
  if (ctx.getError() !== ctx.NO_ERROR) throw Error("Readback GL error");
  geometry.dispose();
  target.dispose();
  sampled.dispose();
  const disposed = { ...renderer.info.memory };
  renderer.dispose();
  const coveragePass = rows.every(
    (r) => Math.abs(r.coverage - r.expected) <= 1 / 255 + 1e-6,
  );
  const stablePrograms = programs.every((r) => r.count === r.warmPrograms);
  (globalThis as any).destinationComparison = {
    identity,
    fixed,
    passed: (fixed ? coveragePass : !coveragePass) && stablePrograms,
    coveragePass,
    stablePrograms,
    readbacks,
    rows,
    programs,
    disposed,
  };
}
void finish().catch((error) => {
  setTimeout(() => {
    throw error;
  }, 0);
});
