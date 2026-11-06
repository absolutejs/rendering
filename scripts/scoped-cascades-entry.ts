import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Vector3,
  Mesh,
  PlaneGeometry,
  BoxGeometry,
  MeshStandardMaterial,
  WebGLRenderTarget,
  PCFShadowMap,
  ShaderChunk,
  REVISION,
} from "three";
import { createScopedCascades } from "../src/scopedCascades";
import { createThinFoliageMaterial } from "../src/thinFoliage";
(window as any).verifyCascades = () => {
  const renderer = new WebGLRenderer();
  renderer.setSize(128, 128);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene(),
    camera = new PerspectiveCamera(62, 1, 0.4, 24000);
  camera.position.set(0, 4, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const ground = new MeshStandardMaterial({ color: 0x999999 }),
    leaf = createThinFoliageMaterial({ color: 0x70ad25 });
  const plane = new PlaneGeometry(30, 30),
    box = new BoxGeometry(1, 2, 1),
    floor = new Mesh(plane, ground),
    plant = new Mesh(box, leaf);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  plant.position.y = 1;
  plant.castShadow = true;
  plant.receiveShadow = true;
  scene.add(floor, plant);
  const target = new WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  const originals = [
    ShaderChunk.lights_fragment_begin,
    ShaderChunk.lights_pars_begin,
  ];
  const owner = createScopedCascades({
    camera,
    parent: scene,
    splits: [16, 96],
    resolution: 128,
    direction: new Vector3(-1, -2, -1),
  });
  owner.bind(ground);
  owner.bind(leaf);
  owner.update(true);
  const capture = () => {
    renderer.render(scene, camera);
    const bytes = new Uint8Array(128 * 128 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, bytes);
    return bytes;
  };
  const first = capture();
  const opaque = new MeshStandardMaterial({
    color: 0x70ad25,
    side: leaf.side,
    roughness: leaf.roughness,
  });
  owner.bind(opaque);
  plant.material = opaque;
  const withoutTransmission = capture();
  plant.material = leaf;
  let transmissionComponents = 0;
  first.forEach((v, i) => {
    if (v !== withoutTransmission[i]) transmissionComponents++;
  });
  plant.position.x = 2;
  const moved = capture();
  plant.position.x = 0;
  const restored = capture();
  let changed = 0,
    restoration = 0;
  first.forEach((v, i) => {
    if (v !== moved[i]) changed++;
    if (v !== restored[i]) restoration++;
  });
  const spans = owner.lights.map((l) => l.shadow.camera.right * 2),
    memoryBefore = { ...renderer.info.memory };
  owner.dispose();
  opaque.dispose();
  ground.dispose();
  leaf.dispose();
  plane.dispose();
  box.dispose();
  target.dispose();
  const result = {
    revision: REVISION,
    transmissionComponents,
    changed,
    restoration,
    spans,
    memoryBefore,
    memoryAfter: { ...renderer.info.memory },
    globalChunksUnchanged:
      originals[0] === ShaderChunk.lights_fragment_begin &&
      originals[1] === ShaderChunk.lights_pars_begin,
    glError: renderer.getContext().getError(),
  };
  renderer.dispose();
  return result;
};
