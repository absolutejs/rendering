import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Mesh,
  PlaneGeometry,
  BoxGeometry,
  ShaderMaterial,
  MeshStandardMaterial,
  MeshDepthMaterial,
  DirectionalLight,
  WebGLRenderTarget,
  FloatType,
  RGBAFormat,
  NoToneMapping,
} from "three";
import { createRootedBend, withRootedBend, rootedBendGLSL } from "../src/index";

declare global {
  interface Window {
    verifyRootedBend: () => unknown;
  }
}
window.verifyRootedBend = () => {
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.setSize(64, 64);
  renderer.setClearColor(0);
  renderer.toneMapping = NoToneMapping;
  const bend = createRootedBend({
    height: 2,
    amplitudeX: 0.4,
    amplitudeZ: 0.2,
    verticalPhase: 1.2,
  });
  const target = new WebGLRenderTarget(64, 1, {
    type: FloatType,
    format: RGBAFormat,
    depthBuffer: false,
  });
  const material = new ShaderMaterial({
    uniforms: {
      absRootedBendShape: bend.shape,
      absRootedBendPhase: bend.phase,
      absRootedBendRotation: bend.rotation,
    },
    vertexShader: "void main(){gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:
      rootedBendGLSL +
      "void main(){float y=(gl_FragCoord.x-.5)/63.*3.-.5;gl_FragColor=absRootedBend(y);}",
  });
  const plane = new PlaneGeometry(2, 2),
    scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  const quad = new Mesh(plane, material);
  scene.add(quad);
  camera.position.z = 3;
  const warmMaterial = new MeshStandardMaterial();
  quad.material = warmMaterial as any;
  renderer.render(scene, camera);
  warmMaterial.dispose();
  quad.material = material;
  const baselineTextures = renderer.info.memory.textures;
  let maximumError = 0;
  let worst: unknown = null;
  const rows = [];
  for (const rotation of [0, 0.7, Math.PI / 2, -2.1]) {
    bend.setRotation(rotation);
    for (const phase of [0, 0.7, 2.2, 4.5, 6.28]) {
      bend.setPhase(phase);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const values = new Float32Array(64 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 64, 1, values);
      for (let i = 0; i < 64; i++) {
        const s = bend.sample((i / 63) * 3 - 0.5);
        const expected = [s.x, s.z, s.dxdy, s.dzdy];
        expected.forEach((v, j) => {
          const error = Math.abs(v - values[i * 4 + j]!);
          if (error > maximumError) {
            maximumError = error;
            worst = { i, j, phase, expected: v, actual: values[i * 4 + j] };
          }
        });
      }
      rows.push({ phase, rotation, glError: renderer.getContext().getError() });
    }
  }
  bend.setRotation(0.7);
  renderer.setRenderTarget(null);
  scene.remove(quad);
  plane.dispose();
  material.dispose();
  target.dispose();
  const firstResources = { ...renderer.info.memory };
  const geo = new BoxGeometry(0.25, 2, 0.25, 1, 16, 1);
  geo.translate(0, 1, 0);
  const color = new MeshStandardMaterial({ color: 0xffffff }),
    depth = new MeshDepthMaterial();
  for (const [m, normals] of [
    [color, true],
    [depth, false],
  ] as const) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.absRootedBendShape = bend.shape;
      shader.uniforms.absRootedBendPhase = bend.phase;
      shader.uniforms.absRootedBendRotation = bend.rotation;
      shader.vertexShader = withRootedBend(shader.vertexShader, normals);
    };
    m.customProgramCacheKey = () => `rooted-bend-${normals}`;
  }
  const tree = new Mesh(geo, color);
  scene.add(tree);
  const light = new DirectionalLight(0xffffff, 3);
  light.position.set(2, 4, 5);
  scene.add(light);
  camera.left = -1;
  camera.right = 1;
  camera.top = 2.5;
  camera.bottom = -0.5;
  camera.updateProjectionMatrix();
  const image = new WebGLRenderTarget(64, 64);
  const masks = [];
  const counts = [];
  for (const phase of [0, 1.5, 0]) {
    bend.setPhase(phase);
    const pair = [];
    for (const m of [color, depth]) {
      tree.material = m as MeshStandardMaterial;
      renderer.setRenderTarget(image);
      renderer.render(scene, camera);
      const bytes = new Uint8Array(64 * 64 * 4);
      renderer.readRenderTargetPixels(image, 0, 0, 64, 64, bytes);
      pair.push(
        Array.from(
          { length: 4096 },
          (_, i) => bytes[i * 4]! + bytes[i * 4 + 1]! + bytes[i * 4 + 2]! > 0,
        ),
      );
    }
    if (pair[0]!.some((v, i) => v !== pair[1]![i]))
      throw Error("Color/depth silhouette differs");
    masks.push(pair[0]!);
    counts.push(pair[0]!.filter(Boolean).length);
  }
  const restorationExact = masks[0]!.every((v, i) => v === masks[2]![i]),
    changedPixels = masks[0]!.filter((v, i) => v !== masks[1]![i]).length;
  renderer.setRenderTarget(null);
  geo.dispose();
  color.dispose();
  depth.dispose();
  image.dispose();
  const resources = { ...renderer.info.memory },
    programs = renderer.info.programs!.length,
    glError = renderer.getContext().getError();
  renderer.dispose();
  renderer.forceContextLoss();
  return {
    rows,
    baselineTextures,
    firstResources,
    worst,
    maximumError,
    restorationExact,
    changedPixels,
    counts,
    resources,
    programs,
    glError,
  };
};
