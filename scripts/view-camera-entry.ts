import * as T from "three";
import { createViewCameraState, bindViewCamera } from "../src/index";
(window as any).verifyViewCamera = () => {
  const renderer = new T.WebGLRenderer({ antialias: false });
  renderer.setSize(32, 32);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.BasicShadowMap;
  const scene = new T.Scene(),
    light = new T.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(32, 32);
  scene.add(light, light.target);
  const geometry = new T.BoxGeometry(1, 1, 1),
    material = new T.MeshBasicMaterial(),
    mesh = new T.Mesh(geometry, material),
    depth = new T.MeshDepthMaterial();
  mesh.castShadow = true;
  mesh.customDepthMaterial = depth;
  scene.add(mesh);
  const state = createViewCameraState();
  let active: T.Camera,
    shadowCalls = 0,
    renderCalls = 0;
  mesh.onBeforeShadow = (_r, _o, camera, shadowCamera) => {
    if (camera !== active || shadowCamera === active)
      throw Error("Unexpected Three shadow camera arguments");
    shadowCalls++;
  };
  mesh.onBeforeRender = (_r, _s, camera) => {
    if (camera !== active) throw Error("Unexpected beauty camera");
    renderCalls++;
  };
  const stop = bindViewCamera(mesh, state);
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.proofPosition = state.position;
    shader.uniforms.proofOrtho = state.orthographic;
    shader.fragmentShader =
      "uniform vec3 proofPosition;uniform bool proofOrtho;void main(){gl_FragColor=vec4(proofPosition.xy/10.,proofOrtho?1.:0.,1.);}";
  };
  const rows = [];
  for (const [orthographic, x, y, z] of [
    [false, 2, 4, 6],
    [false, 5, 2, 7],
    [true, 3, 6, 9],
  ] as const) {
    active = orthographic
      ? new T.OrthographicCamera(-3, 3, 3, -3, 0.1, 100)
      : new T.PerspectiveCamera(50, 1, 0.1, 100);
    active.position.set(x, y, z);
    active.lookAt(0, 0, 0);
    renderer.render(scene, active);
    const pixels = new Uint8Array(4);
    renderer.readRenderTargetPixels(light.shadow.map!, 16, 16, 1, 1, pixels);
    rows.push({
      orthographic,
      expected: [
        Math.round(x * 25.5),
        Math.round(y * 25.5),
        orthographic ? 255 : 0,
        255,
      ],
      pixel: [...pixels],
      state: state.position.value.toArray(),
    });
  }
  stop();
  geometry.dispose();
  material.dispose();
  depth.dispose();
  light.shadow.dispose();
  const memory = { ...renderer.info.memory },
    glError = renderer.getContext().getError();
  renderer.dispose();
  return { rows, shadowCalls, renderCalls, memory, glError };
};
