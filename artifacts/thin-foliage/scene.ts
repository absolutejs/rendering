import * as T from "three";
import {
  createThinFoliageMaterial,
  cloneRenderMaterial,
} from "../../dist/index.js";
const renderer = new T.WebGLRenderer({ antialias: false });
renderer.setSize(64, 64);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.BasicShadowMap;
renderer.outputColorSpace = T.LinearSRGBColorSpace;
const gl = renderer.getContext(),
  ext = gl.getExtension("WEBGL_debug_renderer_info");
const device = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
if (!String(device).includes("SwiftShader"))
  throw Error("Software renderer required");
const scene = new T.Scene(),
  camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
camera.position.z = 5;
camera.lookAt(0, 0, 0);
const geometry = new T.PlaneGeometry(2, 2),
  leaf = new T.Mesh(geometry);
leaf.receiveShadow = true;
scene.add(leaf);
const light = new T.DirectionalLight(0xffffff, 2);
light.castShadow = true;
light.shadow.mapSize.set(256, 256);
light.shadow.camera.left = -2;
light.shadow.camera.right = 2;
light.shadow.camera.top = 2;
light.shadow.camera.bottom = -2;
light.shadow.camera.near = 0.1;
light.shadow.camera.far = 10;
scene.add(light, light.target);
const hemi = new T.HemisphereLight(0xffffff, 0x000000, 0);
scene.add(hemi);
const blocker = new T.Mesh(
  geometry,
  new T.MeshBasicMaterial({ side: T.DoubleSide }),
);
blocker.position.z = -1;
blocker.castShadow = true;
blocker.visible = false;
scene.add(blocker);
const rows = [];
for (const mode of ["standard", "zero", "leaf", "clone"])
  for (const lighting of [
    "front",
    "back",
    "dark",
    "blocked",
    "sky-front",
    "sky-back",
  ]) {
    const source = createThinFoliageMaterial({
      leafTransmission: mode === "zero" ? 0 : 0.35,
      roughness: 1,
      color: 0x80aa40,
    });
    const material =
      mode === "standard"
        ? new T.MeshStandardMaterial({
            side: T.DoubleSide,
            roughness: 1,
            color: 0x80aa40,
          })
        : mode === "clone"
          ? cloneRenderMaterial(source)
          : source;
    leaf.material = material;
    light.position.set(0, 0, lighting === "front" ? 3 : -3);
    light.intensity =
      lighting === "dark" || lighting.startsWith("sky-") ? 0 : 2;
    hemi.intensity = lighting.startsWith("sky-") ? 1 : 0;
    hemi.position.set(0, 0, lighting === "sky-back" ? -1 : 1);
    blocker.visible = lighting === "blocked";
    renderer.render(scene, camera);
    const pixel = new Uint8Array(4);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    rows.push({ mode, lighting, rgb: Array.from(pixel.slice(0, 3)) });
    material.dispose();
    if (material !== source) source.dispose();
  }
geometry.dispose();
blocker.material.dispose();
renderer.dispose();
(globalThis as any).foliageResult = { device, rows };
