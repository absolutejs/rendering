import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  WebGLRenderTarget,
  REVISION,
} from "three";
import { leaseGeometryBounds } from "../src/geometryBounds";
(window as any).verifyGeometryBounds = () => {
  const renderer = new WebGLRenderer();
  renderer.setSize(64, 64);
  renderer.setClearColor(0);
  const scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 3;
  const geometry = new PlaneGeometry(0.2, 0.2),
    material = new MeshBasicMaterial({ color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ntransformed.x-=.5;",
    );
  };
  const mesh = new Mesh(geometry, material);
  mesh.position.x = 1.15;
  scene.add(mesh);
  const target = new WebGLRenderTarget(64, 64);
  renderer.setRenderTarget(target);
  function capture() {
    renderer.render(scene, camera);
    const bytes = new Uint8Array(64 * 64 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 64, 64, bytes);
    let pixels = 0;
    for (let i = 0; i < bytes.length; i += 4) if (bytes[i]! > 0) pixels++;
    return { pixels, calls: renderer.info.render.calls };
  }
  const baseline = capture(),
    originalBox = geometry.boundingBox,
    originalSphere = geometry.boundingSphere;
  const first = leaseGeometryBounds(geometry, { x: 0.5, y: 0, z: 0 });
  const padded = capture();
  const second = leaseGeometryBounds(geometry, { x: 0.7, y: 0, z: 0 });
  const shared = capture();
  first.release();
  const retained = capture();
  second.release();
  const restored = capture();
  const identitiesRestored =
    geometry.boundingBox === originalBox &&
    geometry.boundingSphere === originalSphere;
  const disposed = leaseGeometryBounds(geometry, { x: 0.5, y: 0, z: 0 });
  capture();
  geometry.dispose();
  const endedOnDispose = !disposed.active;
  disposed.release();
  material.dispose();
  target.dispose();
  const result = {
    revision: REVISION,
    baseline,
    padded,
    shared,
    retained,
    restored,
    identitiesRestored,
    endedOnDispose,
    memory: { ...renderer.info.memory },
    glError: renderer.getContext().getError(),
  };
  renderer.dispose();
  return result;
};
