import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  GLSL3,
  NoColorSpace,
  SRGBColorSpace,
} from "three";
import { createPreparedMipArrayTexture } from "../src/index";
(window as any).verifyPreparedArrays = () => {
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.setSize(4, 4);
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info"),
    identity = gl.getParameter(
      debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
    );
  if (!/SwiftShader/.test(identity)) throw Error("Software renderer required");
  const scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    geometry = new PlaneGeometry(2, 2),
    rows = [];
  camera.position.z = 1;
  const colors = (layer: number, level: number) => [
    30 + layer * 40 + level * 20,
    200 - layer * 20 - level * 35,
    50 + level * 50,
    60 + layer * 40 + level * 30,
  ];
  const layers = Array.from({ length: 3 }, (_, layer) =>
    [4, 2, 1].map((width, level) => ({
      width,
      height: width,
      data: Uint8Array.from(
        { length: width * width * 4 },
        (_, i) => colors(layer, level)[i % 4]!,
      ),
    })),
  );
  const original = layers.map((chain) => chain.map((m) => m.data.slice()));
  try {
    for (const colorSpace of [NoColorSpace, SRGBColorSpace])
      for (let cycle = 0; cycle < 2; cycle++) {
        const texture = createPreparedMipArrayTexture(layers, { colorSpace }),
          material = new RawShaderMaterial({
            glslVersion: GLSL3,
            uniforms: {
              map: { value: texture },
              level: { value: 0 },
              layer: { value: 0 },
            },
            vertexShader:
              "in vec3 position;void main(){gl_Position=vec4(position,1.);}",
            fragmentShader:
              "precision highp float;precision highp sampler2DArray;uniform sampler2DArray map;uniform float level,layer;out vec4 result;void main(){result=textureLod(map,vec3(.5,.5,layer),level);}",
          }),
          mesh = new Mesh(geometry, material);
        scene.add(mesh);
        for (const layer of [0, 1, 2, 1.49, 1.51])
          for (const level of [0, 0.5, 1, 1.5, 2]) {
            material.uniforms.layer!.value = layer;
            material.uniforms.level!.value = level;
            renderer.render(scene, camera);
            const pixel = new Uint8Array(4);
            gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            const selected = Math.round(layer),
              lo = Math.floor(level),
              hi = Math.ceil(level),
              fraction = level - lo;
            const decode = (v: number, c: number) =>
              colorSpace === SRGBColorSpace && c < 3
                ? v / 255 <= 0.04045
                  ? v / 255 / 12.92
                  : ((v / 255 + 0.055) / 1.055) ** 2.4
                : v / 255;
            const expected = colors(selected, lo).map((v, c) =>
              Math.round(
                255 *
                  (decode(v, c) * (1 - fraction) +
                    decode(colors(selected, hi)[c]!, c) * fraction),
              ),
            );
            rows.push({
              colorSpace,
              cycle,
              layer,
              level,
              pixel: Array.from(pixel),
              expected,
              glError: gl.getError(),
            });
          }
        scene.remove(mesh);
        material.dispose();
        texture.dispose();
        rows.push({
          colorSpace,
          cycle,
          disposedTextures: renderer.info.memory.textures,
          programs: renderer.info.programs?.length,
        });
      }
    geometry.dispose();
    return {
      identity,
      rows,
      unchanged: layers.every((chain, l) =>
        chain.every((m, i) =>
          m.data.every((v, k) => v === original[l]![i]![k]),
        ),
      ),
      resources: { ...renderer.info.memory },
    };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
};
