import { Box3, BufferGeometry, Mesh, Ray, Vector3 } from "three";
import { ObjectBVH, INTERSECTED, NOT_INTERSECTED } from "three-mesh-bvh";

export type BoundsIndexEntry = { id: number; bounds: Readonly<Box3> };
export type BoundsIndexResult = {
  revision: string;
  status: "complete" | "budget-exhausted";
  /** Exact original AABB intersections, ordered by entry distance then id.
   * null means unfinished traversal, never an empty/clear result. */
  candidates: { id: number; near: number; far: number }[] | null;
  boundsTests: number;
  callbacks: number;
};
const axes = ["x", "y", "z"] as const;
function finite(value: number, limit: number, label: string) {
  if (!Number.isFinite(value) || Math.abs(value) > limit)
    throw Error(`Invalid ${label}`);
  return value;
}
function interval(ray: Ray, box: Box3, near: number, far: number) {
  for (const axis of axes) {
    const o = ray.origin[axis],
      d = ray.direction[axis];
    if (d === 0) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
    } else {
      const a = (box.min[axis] - o) / d,
        b = (box.max[axis] - o) / d;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return null;
    }
  }
  return { near, far };
}

/** CPU-only immutable AABB snapshot using upstream ObjectBVH. Build off the
 * render loop. Bounds must conservatively enclose the geometry queried later;
 * this returns candidates, not alpha visibility or triangle intersections.
 * Caller supplies a revision and replaces this owner after geometry changes.
 * Inputs are copied; no global prototype patch, scene traversal or GPU resource.
 * An explicit local origin keeps Float32 hierarchy coordinates bounded. */
export class PreparedBoundsIndex {
  readonly revision: string;
  private readonly origin: Vector3;
  private entries: { id: number; bounds: Box3 }[] = [];
  private proxies: Mesh[] = [];
  private index: ObjectBVH | null = null;
  private disposed = false;

  constructor(
    entries: readonly BoundsIndexEntry[],
    options: { revision: string; origin?: Readonly<Vector3> },
  ) {
    if (
      !Array.isArray(entries) ||
      entries.length > 4096 ||
      typeof options?.revision !== "string" ||
      !options.revision.length ||
      options.revision.length > 128
    )
      throw Error("Invalid bounds index inputs");
    this.revision = options.revision;
    const origin = options.origin ?? new Vector3();
    this.origin = new Vector3(
      ...(axes.map((axis) => finite(origin[axis], 1e12, "bounds origin")) as [
        number,
        number,
        number,
      ]),
    );
    const ids = new Set<number>();
    this.entries = entries.map((entry) => {
      if (
        !Number.isSafeInteger(entry.id) ||
        entry.id < 0 ||
        entry.id > 0xffffffff ||
        ids.has(entry.id)
      )
        throw Error("Invalid or duplicate bounds id");
      ids.add(entry.id);
      if (!entry.bounds?.min || !entry.bounds?.max)
        throw Error("Invalid source bounds");
      const bounds = new Box3();
      for (const axis of axes) {
        bounds.min[axis] = finite(
          finite(entry.bounds.min[axis], 1e12, "world bound") -
            this.origin[axis],
          1e6,
          "local bound",
        );
        bounds.max[axis] = finite(
          finite(entry.bounds.max[axis], 1e12, "world bound") -
            this.origin[axis],
          1e6,
          "local bound",
        );
        if (bounds.min[axis] > bounds.max[axis])
          throw Error("Inverted source bounds");
      }
      return { id: entry.id, bounds };
    });
    // Explicit outward Float32 conversion before upstream hierarchy construction.
    // Identity proxy transforms preserve these values; no mutable refit is exposed.
    const f32 = new Float32Array(1),
      bits = new Uint32Array(f32.buffer);
    const outward = (value: number, upper: boolean) => {
      f32[0] = value;
      const rounded = f32[0]!;
      if (upper ? rounded < value : rounded > value) {
        if (rounded === 0) {
          bits[0] = upper ? 1 : 0x80000001;
        } else bits[0] = bits[0]! + (upper === rounded > 0 ? 1 : -1);
      }
      return f32[0]!;
    };
    try {
      this.proxies = this.entries.map((entry, slot) => {
        const geometry = new BufferGeometry();
        geometry.boundingBox = entry.bounds.clone();
        for (const axis of axes) {
          geometry.boundingBox.min[axis] = outward(
            entry.bounds.min[axis],
            false,
          );
          geometry.boundingBox.max[axis] = outward(
            entry.bounds.max[axis],
            true,
          );
        }
        const proxy = new Mesh(geometry, []);
        proxy.userData.boundsSlot = slot;
        return proxy;
      });
      if (this.proxies.length)
        this.index = new ObjectBVH(this.proxies, {
          maxDepth: 40,
          targetLeafSize: 1,
        });
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get size() {
    return this.entries.length;
  }

  query(
    source: Readonly<Ray>,
    options: { near?: number; far?: number; maxBoundsTests?: number } = {},
  ): BoundsIndexResult {
    if (this.disposed) throw Error("Bounds index disposed");
    const near = options.near ?? 0,
      far = options.far ?? 64,
      limit = options.maxBoundsTests ?? 8192;
    if (
      !Number.isFinite(near) ||
      near < 0 ||
      !Number.isFinite(far) ||
      far < near ||
      far > 1e6 ||
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      limit > 1e6
    )
      throw Error("Invalid bounds query budget");
    if (!source?.origin || !source?.direction)
      throw Error("Invalid bounds query ray");
    const ray = new Ray();
    for (const axis of axes) {
      ray.origin[axis] = finite(
        finite(source.origin[axis], 1e12, "ray origin") - this.origin[axis],
        1e6,
        "local ray origin",
      );
      ray.direction[axis] = finite(
        source.direction[axis],
        1e6,
        "ray direction",
      );
    }
    const length = Math.hypot(
      ray.direction.x,
      ray.direction.y,
      ray.direction.z,
    );
    if (!Number.isFinite(length) || length === 0)
      throw Error("Invalid ray direction");
    for (const axis of axes) ray.direction[axis] /= length;
    let boundsTests = 0,
      callbacks = 0,
      exhausted = false;
    const candidates: NonNullable<BoundsIndexResult["candidates"]> = [];
    const take = () => {
      callbacks++;
      if (boundsTests === limit) {
        exhausted = true;
        return false;
      }
      boundsTests++;
      return true;
    };
    this.index?.shapecast({
      intersectsBounds: (box) =>
        take() && interval(ray, box, near, far) ? INTERSECTED : NOT_INTERSECTED,
      intersectsObject: (proxy) => {
        if (!take()) return true;
        const entry = this.entries[proxy.userData.boundsSlot]!;
        const hit = interval(ray, entry.bounds, near, far);
        if (hit) candidates.push({ id: entry.id, ...hit });
        return false;
      },
    });
    return {
      revision: this.revision,
      status: exhausted ? "budget-exhausted" : "complete",
      candidates: exhausted
        ? null
        : candidates.sort((a, b) => a.near - b.near || a.id - b.id),
      boundsTests,
      callbacks,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const proxy of this.proxies) proxy.geometry.dispose();
    this.index = null;
    this.proxies = [];
    this.entries = [];
  }
}
