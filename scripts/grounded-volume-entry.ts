import {
  WebGLRenderer,
  BatchedMesh,
  Matrix4,
  NoToneMapping,
  LinearSRGBColorSpace,
  Scene,
  AmbientLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  OrthographicCamera,
  Vector3,
  SphericalHarmonics3,
  REVISION,
} from "three";
import {
  createGroundedSH9Volume,
  type GroundedSH9VolumeOptions,
  type GroundedSH9Upload,
} from "../src/index";
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
(globalThis as any).verifyGroundedVolumes = () => {
  const renderer = new WebGLRenderer({
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(9, 9);
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = LinearSRGBColorSpace;
  const gl = renderer.getContext() as WebGL2RenderingContext,
    ext = gl.getExtension("WEBGL_debug_renderer_info"),
    identity = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, Math.PI));
  const geometry = new PlaneGeometry(2, 2),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 20),
    rows: any[] = [];
  const options: GroundedSH9VolumeOptions[] = [
    {
      resolution: [2, 4],
      elevations: [0, 4],
      size: [12, 20],
      lowerFade: [-1, -0.5],
      upperFade: [3.9, 4],
      edgeFadeStart: 0.999,
    },
    {
      resolution: [3, 3],
      elevations: [0.15, 2, 8],
      size: [16, 16],
      lowerFade: [-0.5, 0],
      upperFade: [7, 8],
    },
    {
      resolution: [4, 2],
      elevations: [0, 0.2, 1, 2, 3, 5, 8, 9],
      size: [12, 20],
      lowerFade: [-1, -0.5],
      upperFade: [8.9, 9],
      edgeFadeStart: 0.999,
    },
  ];
  try {
    for (const [layout, o] of options.entries()) {
      const owner = createGroundedSH9Volume(o),
        material = new MeshStandardMaterial({
          color: 0xffffff,
          roughness: 1,
          metalness: 0,
        }),
        mesh = new Mesh(geometry, material),
        original = material.clone();
      const reference = () => {
        mesh.material = original;
        renderer.render(scene, camera);
        const data = new Uint8Array(4);
        gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
        mesh.material = material;
        return data;
      };
      scene.add(mesh);
      owner.bind(material, "indirect-diffuse");
      const [w, d] = o.resolution,
        l = o.elevations.length,
        ground = new Float32Array(w * d * 4),
        coefficients = Array.from(
          { length: 7 },
          () => new Float32Array(w * d * l * 4),
        ),
        open = Array(27).fill(0);
      open[0] = open[1] = open[2] = 1 / 0.886227;
      for (let z = 0; z < d; z++)
        for (let x = 0; x < w; x++) {
          ground[(x + w * z) * 4] = x * 0.25 + z * 0.4;
          for (let h = 0; h < l; h++) {
            const index = x + w * z + w * d * h,
              a =
                0.2 +
                (0.2 * x) / (w - 1) +
                (0.1 * z) / (d - 1) +
                (0.3 * h) / (l - 1);
            const values = Array(27).fill(0);
            for (let c = 0; c < 3; c++) {
              values[c] = (a * (1 - c * 0.2)) / 0.886227;
              values[3 + c] = 0.02 * (1 + h / l);
              values[9 + c] = 0.04 * (1 + x / (w - 1));
              values[18 + c] = 0.01;
            }
            values.forEach(
              (v, c) =>
                (coefficients[Math.floor(c / 4)]![index * 4 + (c % 4)] = v),
            );
          }
        }
      const p: GroundedSH9Upload = {
        revision: "scene-" + layout,
        lightingRevision: "sky",
        center: [100, -50],
        coefficients,
        ground,
        open,
      };
      owner.upload(p, p);
      const bilinear = (
        data: Float32Array,
        x: number,
        z: number,
        stride: number,
        offset: number,
      ) => {
        const px = clamp(x) * (w - 1),
          pz = clamp(z) * (d - 1),
          x0 = Math.floor(px),
          z0 = Math.floor(pz),
          x1 = Math.min(w - 1, x0 + 1),
          z1 = Math.min(d - 1, z0 + 1),
          tx = px - x0,
          tz = pz - z0;
        return (
          data[(x0 + w * z0) * stride + offset]! * (1 - tx) * (1 - tz) +
          data[(x1 + w * z0) * stride + offset]! * tx * (1 - tz) +
          data[(x0 + w * z1) * stride + offset]! * (1 - tx) * tz +
          data[(x1 + w * z1) * stride + offset]! * tx * tz
        );
      };
      const heights = [
        o.elevations[0]! - 0.25,
        ...o.elevations
          .slice(0, -1)
          .flatMap((v, i) => [v, (v + o.elevations[i + 1]!) / 2]),
        o.elevations.at(-1)! - 0.15,
        o.elevations.at(-1)!,
        o.elevations.at(-1)! + 1,
      ];
      for (const [query, h] of heights.entries())
        for (const [nx, nz] of [
          [0.1, 0.9],
          [0.35, 0.65],
          [0.5, 0.5],
          [0.8, 0.2],
          [1.1, 0.5],
        ]) {
          const n = new Vector3(
              ...([
                [0, 0, 1],
                [1, 0, 0],
                [0, 1, 0],
                [1, 0, 1],
              ][query % 4] as [number, number, number]),
            ).normalize(),
            y = bilinear(ground, nx!, nz!, 4, 0) + h;
          mesh.position.set(
            p.center[0] + (nx! - 0.5) * o.size[0],
            y,
            p.center[1] + (nz! - 0.5) * o.size[1],
          );
          const normal = geometry.attributes.normal!;
          for (let i = 0; i < normal.count; i++)
            normal.setXYZ(i, n.x, n.y, n.z);
          normal.needsUpdate = true;
          camera.position
            .copy(mesh.position)
            .add(new Vector3(query % 2 ? 1 : 0, query % 2 ? 2 : 0, 4));
          camera.lookAt(mesh.position);
          camera.updateMatrixWorld();
          const baseline = reference();
          renderer.render(scene, camera);
          const pixel = new Uint8Array(4);
          gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          let hi = o.elevations.findIndex((v) => v >= h);
          if (hi < 0) hi = l - 1;
          const lo = Math.max(0, hi - 1),
            fraction =
              hi === lo
                ? 0
                : clamp(
                    (h - o.elevations[lo]!) /
                      (o.elevations[hi]! - o.elevations[lo]!),
                  );
          const c = Array.from({ length: 27 }, (_, j) => {
            const group = coefficients[Math.floor(j / 4)]!,
              a = bilinear(group, nx!, nz!, 4, lo * w * d * 4 + (j % 4)),
              b = bilinear(group, nx!, nz!, 4, hi * w * d * 4 + (j % 4));
            return a + (b - a) * fraction;
          });
          const irr = new SphericalHarmonics3()
              .fromArray(c)
              .getIrradianceAt(n, new Vector3()),
            den = new SphericalHarmonics3()
              .fromArray(open)
              .getIrradianceAt(n, new Vector3()),
            weight =
              (1 -
                smooth(
                  (o.edgeFadeStart ?? 0.8) * 0.5,
                  0.5,
                  Math.max(Math.abs(nx! - 0.5), Math.abs(nz! - 0.5)),
                )) *
              (1 - smooth(o.upperFade[0], o.upperFade[1], h)) *
              smooth(o.lowerFade[0], o.lowerFade[1], h);
          const expected = irr
            .toArray()
            .map((v, i) =>
              Math.round(
                (1 + (clamp(v / den.getComponent(i)) - 1) * weight) *
                  baseline[i]!,
              ),
            );
          rows.push({
            layout,
            query,
            x: nx,
            z: nz,
            height: h,
            pixel: Array.from(pixel),
            expected,
            glError: gl.getError(),
          });
        }

      const height = (o.elevations[0]! + o.elevations[1]!) / 2;
      mesh.position.set(100, bilinear(ground, 0.5, 0.5, 4, 0) + height, -50);
      const normal = geometry.attributes.normal!;
      for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 0, 1);
      normal.needsUpdate = true;
      camera.position.copy(mesh.position).add(new Vector3(0, 0, 4));
      camera.lookAt(mesh.position);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
      const regular = new Uint8Array(4);
      gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, regular);
      const batch = new BatchedMesh(
        1,
        geometry.attributes.position!.count,
        geometry.index!.count,
        material,
      );
      const geometryId = batch.addGeometry(geometry),
        instanceId = batch.addInstance(geometryId);
      batch.setMatrixAt(
        instanceId,
        new Matrix4().makeTranslation(
          mesh.position.x,
          mesh.position.y,
          mesh.position.z,
        ),
      );
      batch.perObjectFrustumCulled = false;
      batch.frustumCulled = false;
      scene.remove(mesh);
      scene.add(batch);
      renderer.render(scene, camera);
      const batched = new Uint8Array(4);
      gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, batched);
      rows.push({
        layout,
        batched: true,
        pixel: Array.from(batched),
        expected: Array.from(regular).slice(0, 3),
        glError: gl.getError(),
      });
      scene.remove(batch);
      batch.dispose();
      scene.add(mesh);
      // A dark/undefined reference channel falls back to baseline, not black/NaN.
      const dark = { ...p, open: Array(27).fill(0) };
      owner.upload(dark, dark);
      mesh.position.set(100, 2, -50);
      camera.position.set(100, 2, -46);
      camera.lookAt(mesh.position);
      camera.updateMatrixWorld();
      const baseline = reference();
      renderer.render(scene, camera);
      const darkPixel = new Uint8Array(4);
      gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, darkPixel);
      rows.push({
        layout,
        dark: true,
        pixel: Array.from(darkPixel),
        expected: Array.from(baseline).slice(0, 3),
        glError: gl.getError(),
      });
      owner.invalidate();
      renderer.render(scene, camera);
      const invalidated = new Uint8Array(4);
      gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, invalidated);
      rows.push({
        layout,
        invalidated: true,
        pixel: Array.from(invalidated),
        expected: Array.from(baseline).slice(0, 3),
        glError: gl.getError(),
      });
      owner.dispose();
      material.dispose();
      original.dispose();
      scene.remove(mesh);
    }
    geometry.dispose();
    return {
      three: REVISION,
      identity,
      rows,
      resources: { ...renderer.info.memory },
      programs: renderer.info.programs?.length,
    };
  } finally {
    geometry.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
};
