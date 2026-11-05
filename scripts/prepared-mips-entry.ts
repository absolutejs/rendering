import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  GLSL3,
  DataTexture,
} from "three";
import { createPreparedMipTexture } from "../src/index";
(window as any).verifyPreparedMips = () => {
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.setSize(4, 4);
  const gl = renderer.getContext();
  const scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  const geometry = new PlaneGeometry(2, 2),
    source = new DataTexture(new Uint8Array(64), 4, 4),
    rows = [];
  const levels = [4, 2, 1].map((n, i) => ({
    width: n,
    height: n,
    data: Uint8Array.from({ length: n * n * 4 }, (_, k) =>
      k % 4 === 3 || k % 4 === i ? 255 : 0,
    ),
  }));
  const original = levels.map((l) => l.data.slice());
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const texture = createPreparedMipTexture(source, levels),
        material = new RawShaderMaterial({
          glslVersion: GLSL3,
          uniforms: { map: { value: texture }, level: { value: 0 } },
          vertexShader:
            "in vec3 position;void main(){gl_Position=vec4(position,1.);}",
          fragmentShader:
            "precision highp float;uniform sampler2D map;uniform float level;out vec4 result;void main(){result=textureLod(map,vec2(.5),level);}",
        }),
        mesh = new Mesh(geometry, material);
      scene.add(mesh);
      for (let level = 0; level < 3; level++) {
        material.uniforms.level!.value = level;
        renderer.render(scene, camera);
        const pixel = new Uint8Array(4);
        gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        rows.push({
          cycle,
          level,
          pixel: [...pixel],
          textures: renderer.info.memory.textures,
        });
      }
      scene.remove(mesh);
      texture.dispose();
      material.dispose();
      rows.push({ cycle, disposedTextures: renderer.info.memory.textures });
    }
    return {
      rows,
      unchanged: levels.every((l, i) =>
        l.data.every((v, k) => v === original[i]![k]),
      ),
      sourceUnchanged:
        source.mipmaps.length === 0 &&
        source.image.data.every((v: number) => v === 0),
      glError: gl.getError(),
    };
  } finally {
    geometry.dispose();
    source.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
};
