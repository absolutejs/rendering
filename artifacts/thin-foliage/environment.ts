import {
  WebGLRenderer,
  DirectionalLight,
  DataTexture,
  RGBAFormat,
  Scene,
  OrthographicCamera,
  PlaneGeometry,
  Mesh,
  MeshStandardMaterial,
  CubeTexture,
  PMREMGenerator,
  WebGLRenderTarget,
  FloatType,
  NoToneMapping,
  LinearSRGBColorSpace,
} from "three";
import {
  createThinFoliageMaterial,
  withLeafTransmissionField,
  withLeafEnvironmentVisibility,
} from "../../dist/index.js";
const gl = new WebGLRenderer({ antialias: false });
gl.setSize(8, 8);
gl.toneMapping = NoToneMapping;
const context = gl.getContext(),
  ext = context.getExtension("WEBGL_debug_renderer_info");
const identity = ext
  ? context.getParameter(ext.UNMASKED_RENDERER_WEBGL)
  : "unknown";
(globalThis as any).leafEnvironmentProbe = {
  identity,
  run() {
    const faces = [
      "rgb(180,80,50)",
      "rgb(30,120,200)",
      "rgb(180,200,220)",
      "rgb(35,50,20)",
      "rgb(220,60,30)",
      "rgb(20,65,240)",
    ].map((color) => {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 16, 16);
      return c;
    });
    const cube = new CubeTexture(faces);
    cube.colorSpace = LinearSRGBColorSpace;
    cube.needsUpdate = true;
    const pmrem = new PMREMGenerator(gl),
      environment = pmrem.fromCubemap(cube);
    const scene = new Scene();
    scene.environment = environment.texture;
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 3;
    const geometry = new PlaneGeometry(2, 2),
      mesh = new Mesh(geometry);
    scene.add(mesh);
    const direct = new DirectionalLight(0xffffff, 0);
    direct.position.set(1, 1, 3);
    scene.add(direct);
    const target = new WebGLRenderTarget(8, 8, {
      type: FloatType,
      depthBuffer: false,
    });
    let rendererDFGLUT: import("three").Texture | null = null;
    const render = (
      transmission: number,
      black: boolean,
      reverse: boolean,
      fieldHook = false,
      visibility?: [number, number],
      withoutEnvironment = false,
      visibilityRGB?: [number, number, number, number, number, number],
    ) => {
      const material = fieldHook
        ? new MeshStandardMaterial({
            color: black ? 0 : 0xffffff,
            roughness: 1,
            metalness: 0,
          })
        : createThinFoliageMaterial({
            leafTransmission: transmission,
            color: black ? 0 : 0xffffff,
            roughness: 1,
            metalness: 0,
          });
      if (fieldHook) {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.testLeafTransmission = { value: transmission };
          shader.fragmentShader =
            "uniform float testLeafTransmission;\n" +
            withLeafTransmissionField(
              shader.fragmentShader,
              "testLeafTransmission",
            );
        };
        material.customProgramCacheKey = () => `field:${transmission}`;
      }
      scene.environment = withoutEnvironment ? null : environment.texture;
      direct.intensity = withoutEnvironment ? 0.7 : 0;
      if (withoutEnvironment) material.emissive.setRGB(0.02, 0.03, 0.04);
      let dfg: { value: import("three").Texture } | undefined;
      const prior = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        prior(shader, renderer);
        if (visibility) {
          shader.uniforms.testVisibility = { value: visibility };
          shader.fragmentShader =
            "uniform vec2 testVisibility;\nfloat testLeafVisibility(vec3 normal) { return normal.z >= 0. ? testVisibility.x : testVisibility.y; }\n" +
            withLeafEnvironmentVisibility(
              shader.fragmentShader,
              "testLeafVisibility",
            );
        }
        if (visibilityRGB) {
          shader.uniforms.testFront = { value: visibilityRGB.slice(0, 3) };
          shader.uniforms.testBack = { value: visibilityRGB.slice(3, 6) };
          shader.fragmentShader =
            "uniform vec3 testFront;uniform vec3 testBack;\nvec3 testColorVisibility(vec3 normal) {return normal.z >= 0. ? testFront : testBack;}\n" +
            withLeafEnvironmentVisibility(
              shader.fragmentShader,
              "testColorVisibility",
            );
        }
        dfg = shader.uniforms.dfgLUT;
      };
      mesh.material = material;
      scene.environmentRotation.y = reverse ? Math.PI : 0;
      gl.setRenderTarget(target);
      gl.render(scene, camera);
      if (dfg?.value) rendererDFGLUT = dfg.value;
      const output = new Float32Array(8 * 8 * 4);
      gl.readRenderTargetPixels(target, 0, 0, 8, 8, output);
      material.dispose();
      if (!output.every(Number.isFinite))
        throw Error("Invalid leaf environment output");
      return output;
    };
    const a = render(0, false, false),
      b = render(0, false, true),
      sa = render(0, true, false),
      sb = render(0, true, true),
      rows = [];
    let contrast = 0;
    for (let i = 0; i < a.length; i++)
      if (i % 4 !== 3)
        contrast = Math.max(
          contrast,
          Math.abs(a[i]! - sa[i]! - (b[i]! - sb[i]!)),
        );
    if (contrast < 0.02) throw Error("Vacuous directional environment control");
    for (const t of [0, 0.18, 0.32, 0.6, 1]) {
      for (const fieldHook of [false, true]) {
        const value = render(t, false, false, fieldHook);
        const black = render(t, true, false, fieldHook);
        let maxSpecularError = 0;
        for (let i = 0; i < black.length; i++)
          if (i % 4 !== 3)
            maxSpecularError = Math.max(
              maxSpecularError,
              Math.abs(black[i]! - sa[i]!),
            );
        let maxError = 0;
        for (let i = 0; i < value.length; i++)
          if (i % 4 !== 3) {
            const expected =
              sa[i]! + (a[i]! - sa[i]!) * (1 - t) + (b[i]! - sb[i]!) * t;
            maxError = Math.max(maxError, Math.abs(value[i]! - expected));
          }
        rows.push({ transmission: t, fieldHook, maxError, maxSpecularError });
      }
    }
    const visibilityRows = [];
    for (const t of [0, 0.28, 0.5, 1])
      for (const visibility of [
        [1, 1],
        [0, 0],
        [0.2, 0.8],
        [-1, 2],
      ] as [number, number][])
        for (const fieldHook of [false, true]) {
          const value = render(t, false, false, fieldHook, visibility),
            black = render(t, true, false, fieldHook, visibility);
          let maxError = 0,
            maxSpecularError = 0;
          for (let i = 0; i < value.length; i++)
            if (i % 4 !== 3) {
              const expected =
                sa[i]! +
                (a[i]! - sa[i]!) *
                  (1 - t) *
                  Math.max(0, Math.min(1, visibility[0])) +
                (b[i]! - sb[i]!) * t * Math.max(0, Math.min(1, visibility[1]));
              maxError = Math.max(maxError, Math.abs(value[i]! - expected));
              maxSpecularError = Math.max(
                maxSpecularError,
                Math.abs(black[i]! - sa[i]!),
              );
            }
          visibilityRows.push({
            transmission: t,
            visibility,
            fieldHook,
            maxError,
            maxSpecularError,
          });
        }
    if (
      visibilityRows.some((r) => r.maxError > 2e-5 || r.maxSpecularError > 2e-5)
    )
      throw Error(
        "Directional visibility mismatch: " + JSON.stringify(visibilityRows),
      );
    const coloredRows = [];
    for (const t of [0, 0.28, 0.5, 1]) {
      const visibility: [number, number, number, number, number, number] = [
        0.1, 0.6, 0.9, 0.8, 0.3, 0.2,
      ];
      const value = render(
          t,
          false,
          false,
          false,
          undefined,
          false,
          visibility,
        ),
        black = render(t, true, false, false, undefined, false, visibility);
      let maxError = 0,
        maxSpecularError = 0;
      for (let i = 0; i < value.length; i++)
        if (i % 4 !== 3) {
          const c = i % 4,
            expected =
              sa[i]! +
              (a[i]! - sa[i]!) * (1 - t) * visibility[c]! +
              (b[i]! - sb[i]!) * t * visibility[c + 3]!;
          maxError = Math.max(maxError, Math.abs(value[i]! - expected));
          maxSpecularError = Math.max(
            maxSpecularError,
            Math.abs(black[i]! - sa[i]!),
          );
        }
      if (maxError > 2e-5 || maxSpecularError !== 0)
        throw Error("Colored visibility mismatch");
      coloredRows.push({
        transmission: t,
        visibility,
        maxError,
        maxSpecularError,
      });
    }
    let maxDirectEmissiveError = 0;
    for (const t of [0, 0.28, 0.5, 1]) {
      const baseline = render(t, false, false, false, undefined, true),
        attenuated = render(t, false, false, false, [0, 0], true);
      for (let i = 0; i < baseline.length; i++)
        maxDirectEmissiveError = Math.max(
          maxDirectEmissiveError,
          Math.abs(baseline[i]! - attenuated[i]!),
        );
    }
    if (maxDirectEmissiveError !== 0) throw Error("Direct/emissive changed");
    gl.setRenderTarget(null);
    target.dispose();
    geometry.dispose();
    environment.dispose();
    pmrem.dispose();
    cube.dispose();
    const final = { ...gl.info.memory };
    const retainedRendererDFGLUT =
      !!rendererDFGLUT &&
      !!(
        gl.properties.get(rendererDFGLUT) as {
          __webglTexture?: WebGLTexture;
        }
      ).__webglTexture;
    gl.dispose();
    if (
      rows.some((r) => r.maxError > 2e-5 || r.maxSpecularError > 2e-5) ||
      final.textures !== (retainedRendererDFGLUT ? 1 : 0) ||
      final.geometries !== 0
    )
      throw Error(
        "Leaf environment blend or cleanup failed: " +
          JSON.stringify({ rows, final }),
      );
    return {
      rows,
      visibilityRows,
      coloredRows,
      maxDirectEmissiveError,
      contrast,
      retainedRendererDFGLUT,
      final,
      scope:
        "Actual package factory and field-hook fragments with shared leaf hook and directional PMREM. Black-material controls isolate unchanged specular response; diffuse must be the convex front/back mixture. No native timing claim.",
    };
  },
};
