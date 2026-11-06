declare const __REFLECTION_SPLIT__: number;
declare const __REFLECTION_STEEP__: boolean;
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Vector3,
  Matrix4,
  Ray,
  Box3,
  Plane,
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
  main.position.set(
    0,
    __REFLECTION_STEEP__ ? 12 : 8,
    __REFLECTION_STEEP__ ? 8 : 16,
  );
  main.lookAt(0, 0, 0);
  main.updateMatrixWorld();
  const reflected = main.clone();
  reflected.position.y = -main.position.y;
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
  const wallZ = __REFLECTION_STEEP__ ? -4 : -10;
  const wallTop = __REFLECTION_STEEP__ ? 36 : 20;
  const plane = new PlaneGeometry(24, wallTop + 4),
    box = new BoxGeometry(1.5, 1.5, 1.5);
  const wall = new Mesh(plane, wallMaterial);
  wall.position.set(0, (wallTop - 4) / 2, wallZ);
  wall.receiveShadow = true;
  scene.add(wall);
  const casters: Mesh[] = [];
  for (let y = 0; y < wallTop - 4; y += 2) {
    const caster = new Mesh(box, boxMaterial);
    caster.position.set((y % 4) - 1, y, wallZ + 3);
    caster.castShadow = true;
    caster.receiveShadow = true;
    scene.add(caster);
    casters.push(caster);
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
  // Independently fit the same cascade algorithm to the reflected camera.
  // This is a reference render, not an assumption that its filtered edges are exact.
  const originalMain = main.clone();
  main.copy(reflected);
  main.updateMatrixWorld();
  owner.update(true);
  for (const light of owner.lights) light.shadow.needsUpdate = true;
  renderer.shadowMap.needsUpdate = true;
  const refitted = capture(0);
  for (const light of owner.lights) light.shadow.intensity = 0;
  const unshadowed = capture(0);
  const boxes = casters.map((mesh) => new Box3().setFromObject(mesh));
  const wallPlane = new Plane(new Vector3(0, 0, 1), -wallZ);
  const sunDirection = new Vector3(0.5, 0.5, 1).normalize();
  const ray = new Ray(),
    hit = new Vector3(),
    boxHit = new Vector3();
  function exactWallShadow(
    x: number,
    y: number,
  ): { shadow: boolean; outsideMain: boolean } | null {
    const direction = new Vector3((x / 192) * 2 - 1, (y / 192) * 2 - 1, 0.5)
      .unproject(reflected)
      .sub(reflected.position)
      .normalize();
    ray.set(reflected.position, direction);
    if (
      !ray.intersectPlane(wallPlane, hit) ||
      Math.abs(hit.x) >= 12 ||
      hit.y <= -4 ||
      hit.y >= wallTop
    )
      return null;
    const distance = hit.distanceTo(reflected.position);
    for (const bounds of boxes)
      if (
        ray.intersectBox(bounds, boxHit) &&
        boxHit.distanceTo(reflected.position) < distance - 1e-5
      )
        return null;
    const point = hit.clone();
    const projected = point.clone().project(originalMain);
    const outsideMain =
      Math.abs(projected.x) > 1 ||
      Math.abs(projected.y) > 1 ||
      projected.z > 1 ||
      projected.z < -1;
    ray.set(point.addScaledVector(sunDirection, 1e-5), sunDirection);
    const shadow = boxes.some(
      (bounds) => ray.intersectBox(bounds, boxHit) !== null,
    );
    return { shadow, outsideMain };
  }
  const methods = {
    renderView: actual,
    atlasView: anchored,
    refittedView: refitted,
  };
  const coverage = Object.fromEntries(
    Object.keys(methods).map((name) => [
      name,
      {
        tested: 0,
        shadowed: 0,
        lit: 0,
        missing: 0,
        falseShadow: 0,
        outsideMainFalseShadow: 0,
        absoluteError: 0,
        outsideMainTested: 0,
        outsideMainMissing: 0,
      },
    ]),
  );
  let rejectedBoundary = 0;
  for (let y = 2; y < 190; y += 2)
    for (let x = 2; x < 190; x += 2) {
      const exact = exactWallShadow(x + 0.5, y + 0.5);
      if (!exact) continue;
      let stable = true;
      for (const dx of [-2, 0, 2])
        for (const dy of [-2, 0, 2]) {
          const sample = exactWallShadow(x + 0.5 + dx, y + 0.5 + dy);
          if (!sample || sample.shadow !== exact.shadow) stable = false;
        }
      if (!stable) {
        rejectedBoundary++;
        continue;
      }
      const i = (y * 192 + x) * 4,
        base = unshadowed[i]!;
      if (base < 16) throw Error("Reference receiver is not illuminated");
      for (const [name, bytes] of Object.entries(methods)) {
        const stats = coverage[name]!;
        const fraction = 1 - bytes[i]! / base;
        stats.tested++;
        if (exact.shadow) stats.shadowed++;
        else stats.lit++;
        stats.absoluteError += Math.abs((exact.shadow ? 1 : 0) - fraction);
        if (exact.shadow && fraction < 0.5) {
          stats.missing++;
          if (exact.outsideMain) stats.outsideMainMissing++;
        }
        if (!exact.shadow && fraction > 0.5) {
          stats.falseShadow++;
          if (exact.outsideMain) stats.outsideMainFalseShadow++;
        }
        if (exact.outsideMain) stats.outsideMainTested++;
      }
    }
  const result = {
    revision: REVISION,
    firstSplit: __REFLECTION_SPLIT__,
    scenario: __REFLECTION_STEEP__ ? "steep" : "standard",
    coverage,
    rejectedBoundary,
    changedPixels,
    maxDifference,
    restorationDifferences,
    width: 192,
    height: 192,
    glError: renderer.getContext().getError(),
    scope:
      "Same cached main-view CSM maps and reflected render camera; compare render-view versus atlas-view depth selection only. Ray-box ground truth tests visible wall interiors with a 2-pixel stable neighborhood; refitted-view map is an additional reference, not ground truth.",
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
