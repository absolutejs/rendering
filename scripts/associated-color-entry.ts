import * as T from "three";
import {
  associateAlphaColor,
  configureAssociatedColorMap,
  downsampleAlphaColor,
  createPreparedMipTexture,
} from "../src/index";
(window as any).verifyAssociatedColor = () => {
  const renderer = new T.WebGLRenderer({ antialias: false });
  renderer.setSize(4, 4);
  const target = new T.WebGLRenderTarget(4, 4),
    scene = new T.Scene(),
    camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const geometry = new T.PlaneGeometry(2, 2);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.5);
  const rows = [];
  for (const mode of ["bilinear", "mip"] as const)
    for (const hidden of [
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
      [0, 0, 0],
    ]) {
      const source = new Uint8Array([255, 0, 0, 255, ...hidden, 0]);
      const original = new T.DataTexture(associateAlphaColor(source), 2, 1);
      original.colorSpace = T.SRGBColorSpace;
      original.minFilter = T.LinearFilter;
      original.magFilter = T.LinearFilter;
      const reduced = downsampleAlphaColor({
        width: 2,
        height: 1,
        data: source,
      });
      const texture =
        mode === "mip"
          ? createPreparedMipTexture(original, [
              { width: 2, height: 1, data: associateAlphaColor(source) },
              { ...reduced, data: associateAlphaColor(reduced.data) },
            ])
          : original;
      texture.needsUpdate = true;
      const material = new T.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
        transparent: true,
        blending: T.NoBlending,
      });
      configureAssociatedColorMap(material);
      if (mode === "mip") {
        const prior = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
          prior(shader, renderer);
          const marker = "texture2D( map, vMapUv )";
          if (shader.fragmentShader.split(marker).length !== 2)
            throw Error("Expected one map sample");
          shader.fragmentShader = shader.fragmentShader.replace(
            marker,
            "textureLod( map, vMapUv, 1.0 )",
          );
        };
      }
      const mesh = new T.Mesh(geometry, material);
      scene.add(mesh);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const pixel = new Uint8Array(4);
      renderer.readRenderTargetPixels(target, 2, 2, 1, 1, pixel);
      rows.push({ mode, hidden, pixel: [...pixel] });
      scene.remove(mesh);
      material.dispose();
      texture.dispose();
      if (texture !== original) original.dispose();
    }
  geometry.dispose();
  target.dispose();
  const textures = renderer.info.memory.textures,
    geometries = renderer.info.memory.geometries,
    glError = renderer.getContext().getError();
  renderer.dispose();
  return { rows, textures, geometries, glError };
};
