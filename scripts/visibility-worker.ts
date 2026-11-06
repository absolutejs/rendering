import { BufferGeometry, BufferAttribute, Ray, Vector3, Box3 } from "three";
import {
  PreparedAlphaVisibility,
  HemisphereVisibilityProbe,
} from "../src/visibility";
self.onmessage = async () => {
  try {
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new BufferAttribute(
        new Float64Array([
          -1, -1, 1, 1, -1, 1, 0, 1, 1, -1, -1, 2, 1, -1, 2, 0, 1, 2,
        ]),
        3,
      ),
    );
    g.setAttribute(
      "uv",
      new BufferAttribute(
        new Float64Array([
          0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5,
        ]),
        2,
      ),
    );
    const q = new PreparedAlphaVisibility(g, {
      data: new Uint8Array([0, 255]),
      width: 2,
      height: 1,
    });
    const ray = new Ray(new Vector3(), new Vector3(0, 0, 1));
    const rows = [
      q.query(ray),
      q.query(ray, { far: 1.5 }),
      q.query(ray, { maxTriangleTests: 1 }),
    ];
    const offset = new Vector3(3, 4, 5);
    const deformed = q.query(
      new Ray(offset.clone(), new Vector3(0, 0, 1)),
      {},
      {
        point(source: Readonly<Vector3>, target: Vector3) {
          target.copy(source).add(offset);
        },
        bounds(source: Readonly<Box3>, target: Box3) {
          target.copy(source).translate(offset);
        },
      },
    );
    let recoveredError = false;
    try {
      q.query(
        ray,
        {},
        {
          point() {
            throw Error("expected point failure");
          },
          bounds(source, target) {
            target.copy(source);
          },
        },
      );
    } catch (error) {
      recoveredError = String(error).includes("expected point failure");
    }
    const recovered = q.query(ray);
    const makeProbe = () =>
      new HemisphereVisibilityProbe(
        { revision: "worker-scene:1", origin: new Vector3(), samples: 32 },
        (ray, budget) => q.query(ray, budget),
      );
    const probe = makeProbe();
    for (let i = 0; i < 8; i++) {
      probe.step(4);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const single = makeProbe().step(32);
    const cancelled = makeProbe();
    cancelled.step(1);
    cancelled.cancel();
    const bytes = q.ownedBytes;
    q.dispose();
    self.postMessage({
      rows,
      probe: probe.snapshot(),
      single,
      cancelled: cancelled.snapshot(),
      deformed,
      recoveredError,
      recovered,
      bytes,
      releasedBytes: q.ownedBytes,
      originalIndex: g.index,
      realm: typeof document,
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
