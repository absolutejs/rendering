declare const __REFLECTION_SPLIT__: number;
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Vector3,
  Matrix4,
  Mesh,
  PlaneGeometry,
  BoxGeometry,
  MeshStandardMaterial,
  DoubleSide,
  WebGLRenderTarget,
  PCFShadowMap,
  REVISION,
} from "three";
import { createScopedCascades } from "../src/scopedCascades";
(window as any).verifyReflection = () => {
  const renderer = new WebGLRenderer();
  renderer.setSize(192, 192);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene(),
    main = new PerspectiveCamera(62, 1, 0.4, 24000);
  main.position.set(0, 8, 16);
  main.lookAt(0, 0, 0);
  main.updateMatrixWorld();
  const reflected = main.clone();
  reflected.position.y = -8;
  reflected.lookAt(0, 0, 0);
  reflected.updateMatrixWorld();
  const wallMaterial = new MeshStandardMaterial({
    color: 0xaaaaaa,
    roughness: 1,
    side: DoubleSide,
  });
  const boxMaterial = new MeshStandardMaterial({
    color: 0x668844,
    roughness: 1,
  });
  const plane = new PlaneGeometry(24, 24),
    box = new BoxGeometry(1.5, 1.5, 1.5);
  const wall = new Mesh(plane, wallMaterial);
  wall.position.set(0, 8, -10);
  wall.receiveShadow = true;
  scene.add(wall);
  for (let y = 0; y < 16; y += 2) {
    const caster = new Mesh(box, boxMaterial);
    caster.position.set((y % 4) - 1, y, -7);
    caster.castShadow = true;
    caster.receiveShadow = true;
    scene.add(caster);
  }
  const owner = createScopedCascades({
    camera: main,
    parent: scene,
    splits: [__REFLECTION_SPLIT__, 96],
    resolution: 512,
    direction: new Vector3(-0.5, -0.5, -1),
    intensity: 2,
  });
  const useMain = { value: 0 },
    viewToMain = { value: new Matrix4() };
  for (const material of [wallMaterial, boxMaterial]) {
    owner.bind(material);
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, render) {
      previous.call(this, shader, render);
      const line =
        "float linearDepth = (vViewPosition.z) / (shadowFar - cameraNear);";
      if (!shader.fragmentShader.includes(line))
        throw Error("CSM selector changed");
      shader.uniforms.testUseMain = useMain;
      shader.uniforms.testViewToMain = viewToMain;
      shader.fragmentShader =
        "uniform float testUseMain;\nuniform mat4 testViewToMain;\n" +
        shader.fragmentShader.replace(
          line,
          "float testMainDepth = -(testViewToMain * vec4(-vViewPosition,1.)).z;\nfloat linearDepth = mix(vViewPosition.z,testMainDepth,testUseMain)/(shadowFar-cameraNear);",
        );
    };
    material.customProgramCacheKey = () => "reflection-selection-test";
  }
  const target = new WebGLRenderTarget(192, 192);
  renderer.setRenderTarget(target);
  owner.update(true);
  viewToMain.value.identity();
  renderer.render(scene, main);
  for (const light of owner.lights) light.shadow.autoUpdate = false;
  renderer.shadowMap.autoUpdate = false;
  viewToMain.value.multiplyMatrices(
    main.matrixWorldInverse,
    reflected.matrixWorld,
  );
  const capture = (value: number) => {
    useMain.value = value;
    renderer.render(scene, reflected);
    const bytes = new Uint8Array(192 * 192 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 192, 192, bytes);
    return bytes;
  };
  const actual = capture(0),
    anchored = capture(1),
    restored = capture(0);
  let changedPixels = 0,
    maxDifference = 0,
    restorationDifferences = 0;
  for (let i = 0; i < actual.length; i += 4) {
    let different = false;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(actual[i + c]! - anchored[i + c]!);
      maxDifference = Math.max(maxDifference, d);
      different ||= d > 0;
      if (actual[i + c] !== restored[i + c]) restorationDifferences++;
    }
    if (different) changedPixels++;
  }
  const result = {
    revision: REVISION,
    firstSplit: __REFLECTION_SPLIT__,
    changedPixels,
    maxDifference,
    restorationDifferences,
    width: 192,
    height: 192,
    glError: renderer.getContext().getError(),
    scope:
      "Same cached main-view CSM maps and reflected render camera; compare render-view versus atlas-view depth selection only. Neither image is asserted to be ground truth.",
  };
  owner.dispose();
  wallMaterial.dispose();
  boxMaterial.dispose();
  plane.dispose();
  box.dispose();
  target.dispose();
  renderer.dispose();
  return result;
};
