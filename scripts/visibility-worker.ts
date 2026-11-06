import { BufferGeometry, BufferAttribute, Ray, Vector3 } from "three";
import { PreparedAlphaVisibility } from "../src/visibility";
self.onmessage = () => {
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
    const bytes = q.ownedBytes;
    q.dispose();
    self.postMessage({
      rows,
      bytes,
      releasedBytes: q.ownedBytes,
      originalIndex: g.index,
      realm: typeof document,
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
