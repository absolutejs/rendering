import { createInstanceAttributeStream } from "../src/index";
import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  PlaneGeometry,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
} from "three";
(window as any).verifyInstanceStreams = () => {
  const renderer = new WebGLRenderer({
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(64, 64);
  renderer.setClearColor(0, 0);
  const gl = renderer.getContext(),
    debug = gl.getExtension("WEBGL_debug_renderer_info"),
    identity = gl.getParameter(
      debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
    );
  if (!/SwiftShader/.test(identity)) throw Error("Software renderer required");
  const uploads: any[] = [],
    original = gl.bufferSubData.bind(gl);
  gl.bufferSubData = ((...args: any[]) => {
    uploads.push({
      offset: args[1],
      bytes:
        args.length >= 5
          ? args[4] * args[2].BYTES_PER_ELEMENT
          : args[2].byteLength,
    });
    return (original as any)(...args);
  }) as any;
  const stream = createInstanceAttributeStream(3, 1),
    base = new PlaneGeometry(0.25, 0.5),
    geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.attributes = base.attributes;
  geometry.setAttribute("instanceX", stream.attribute);
  const material = new ShaderMaterial({
      vertexShader:
        "attribute float instanceX;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+vec3(instanceX,0.,0.),1.);}",
      fragmentShader: "void main(){gl_FragColor=vec4(0.,1.,0.,1.);}",
    }),
    scene = new Scene(),
    mesh = new Mesh(geometry, material),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const data = new Float32Array([-0.6, 0, 0.6]),
    rows: any[] = [];
  const draw = (label: string) => {
    const prior = uploads.length;
    geometry.instanceCount = stream.count;
    renderer.render(scene, camera);
    const pixels = Array.from(data, (x, i) => {
      const p = new Uint8Array(4);
      gl.readPixels(
        Math.floor((x + 1) * 32),
        32,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p,
      );
      return { pixel: [...p], visible: i < stream.count };
    });
    rows.push({
      label,
      uploads: uploads.slice(prior),
      pixels,
      version: stream.attribute.version,
      pendingRanges: stream.attribute.updateRanges.map((x) => ({ ...x })),
      glError: gl.getError(),
    });
  };
  try {
    stream.update(data, 3);
    draw("initial");
    stream.update(data, 3);
    draw("unchanged");
    data[0] = -0.5;
    stream.update(data, 3);
    data[2] = 0.5;
    stream.update(data, 3);
    draw("coalesced");
    data[1] = 0.15;
    stream.update(data, 3);
    draw("partial");
    stream.update(data, 1);
    draw("shrink");
    stream.update(data, 3);
    draw("restore");
  } finally {
    gl.bufferSubData = original;
    geometry.dispose();
    base.dispose();
    material.dispose();
  }
  const report = {
    identity,
    rows,
    resources: { ...renderer.info.memory },
    programs: renderer.info.programs?.length,
  };
  renderer.dispose();
  renderer.forceContextLoss();
  return report;
};
