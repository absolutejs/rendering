import {
  BufferAttribute,
  BufferGeometry,
  Ray,
  Vector3,
  Box3,
  Triangle,
} from "three";
import { MeshBVH } from "three-mesh-bvh";

export type VisibilityAlpha = {
  data: Uint8Array;
  width: number;
  height: number;
  /** Base-level bilinear cutout coverage. Not mipmapped/A2C or transmissive shading. */
  cutoff?: number;
  wrapS?: "clamp" | "repeat";
  wrapT?: "clamp" | "repeat";
};
/** Synchronous callbacks in the ray's coordinate frame. Bounds MUST enclose the
 * entire transformed source box, including interior extrema. Inputs are scratch
 * copies; write targets without retaining references. No reentrant owner use. */
export type VisibilityDeformation = {
  bounds(source: Readonly<Box3>, target: Box3): void;
  point(source: Readonly<Vector3>, target: Vector3): void;
};
export type VisibilityBudget = {
  near?: number;
  far?: number;
  maxBoundsTests?: number;
  maxTriangleTests?: number;
};
export type VisibilityResult = {
  status: "occluded" | "clear" | "budget-exhausted";
  boundsTests: number;
  triangleTests: number;
  alphaTests: number;
  /** Any confirmed opaque intersection, not necessarily the nearest one. */
  hitDistance: number | null;
};
const boundedInteger = (v: number, min: number, max: number, name: string) => {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    throw Error(`Invalid ${name}`);
  return v;
};

/** Immutable local-space geometry snapshot, with no global Mesh prototype patch.
 * One opaque primitive or one cutout texture per owner. UV transforms/flipY must
 * already be applied to UVs by the caller. Build off the render loop (e.g. worker).
 * The BVH may reorder this owner's index; the caller's geometry is never changed.
 */
export class PreparedAlphaVisibility {
  private geometry: BufferGeometry | null = null;
  private bvh: MeshBVH | null = null;
  private alpha: VisibilityAlpha | null = null;
  private bytes = 0;
  private readonly ray = new Ray();
  private readonly nearPoint = new Vector3();
  private readonly hit = new Vector3();
  private readonly bary = new Vector3();
  private readonly sourceBounds = new Box3();
  private readonly deformedBounds = new Box3();
  private readonly sourcePoint = new Vector3();
  private readonly deformedTriangle = new Triangle();
  private querying = false;

  constructor(source: BufferGeometry, alpha?: VisibilityAlpha) {
    const position = source?.getAttribute("position");
    const uv = source?.getAttribute("uv");
    if (!position || position.itemSize !== 3 || position.normalized)
      throw Error("Visibility needs unnormalized XYZ positions");
    const vertices = boundedInteger(position.count, 3, 300000, "vertex count");
    const sourceIndex = source.getIndex();
    if (
      sourceIndex &&
      (sourceIndex.itemSize !== 1 ||
        sourceIndex.normalized ||
        !(
          sourceIndex.array instanceof Uint8Array ||
          sourceIndex.array instanceof Uint16Array ||
          sourceIndex.array instanceof Uint32Array
        ))
    )
      throw Error("Visibility needs integer triangle indices");
    const count = boundedInteger(
      sourceIndex?.count ?? vertices,
      3,
      600000,
      "index count",
    );
    if (
      count % 3 ||
      source.drawRange.start !== 0 ||
      (source.drawRange.count !== Infinity &&
        source.drawRange.count !== count) ||
      source.groups.length > 1 ||
      (source.groups.length === 1 &&
        (source.groups[0]!.start !== 0 || source.groups[0]!.count !== count))
    )
      throw Error("Visibility needs one complete triangle primitive");
    if (
      alpha &&
      (!uv || uv.itemSize !== 2 || uv.count !== vertices || uv.normalized)
    )
      throw Error("Cutout visibility needs matching UVs");
    if (alpha) {
      boundedInteger(alpha.width, 1, 4096, "alpha width");
      boundedInteger(alpha.height, 1, 4096, "alpha height");
      const cutoff = alpha.cutoff ?? 0.5;
      if (
        !(alpha.data instanceof Uint8Array) ||
        alpha.data.length !== alpha.width * alpha.height ||
        !Number.isFinite(cutoff) ||
        cutoff <= 0 ||
        cutoff > 1 ||
        ![undefined, "clamp", "repeat"].includes(alpha.wrapS) ||
        ![undefined, "clamp", "repeat"].includes(alpha.wrapT)
      )
        throw Error("Invalid visibility alpha");
    }
    // Preserve source precision; BVH bounds are conservative float32 boxes.
    const positions = new Float64Array(vertices * 3);
    const uvs = alpha ? new Float64Array(vertices * 2) : null;
    for (let i = 0; i < vertices; i++) {
      const values = [position.getX(i), position.getY(i), position.getZ(i)];
      if (!values.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6))
        throw Error("Invalid local visibility positions");
      positions.set(values, i * 3);
      if (uvs) {
        const u = uv!.getX(i),
          v = uv!.getY(i);
        if (![u, v].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6))
          throw Error("Invalid visibility UVs");
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
      }
    }
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++)
      indices[i] = boundedInteger(
        sourceIndex ? sourceIndex.getX(i) : i,
        0,
        vertices - 1,
        "triangle index",
      );
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    if (uvs) geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
    geometry.setIndex(new BufferAttribute(indices, 1));
    try {
      this.bvh = new MeshBVH(geometry, {
        maxDepth: 40,
        maxLeafTris: 8,
        verbose: false,
      });
      this.geometry = geometry;
      if (alpha) this.alpha = { ...alpha, data: alpha.data.slice() };
      const roots = MeshBVH.serialize(this.bvh, { cloneBuffers: false }).roots;
      this.bytes =
        positions.byteLength +
        (uvs?.byteLength ?? 0) +
        indices.byteLength +
        (this.alpha?.data.byteLength ?? 0) +
        roots.reduce((sum, r) => sum + r.byteLength, 0);
    } catch (error) {
      geometry.dispose();
      throw error;
    }
  }

  get ownedBytes() {
    return this.bytes;
  }

  query(
    input: Ray,
    budget: VisibilityBudget = {},
    deformation?: VisibilityDeformation,
  ): VisibilityResult {
    if (this.querying) throw Error("Reentrant visibility query");
    if (
      deformation !== undefined &&
      (!deformation ||
        typeof deformation.bounds !== "function" ||
        typeof deformation.point !== "function")
    )
      throw Error("Invalid visibility deformation");
    this.querying = true;
    try {
      return this.runQuery(input, budget, deformation);
    } finally {
      this.querying = false;
    }
  }

  private runQuery(
    input: Ray,
    budget: VisibilityBudget,
    deformation?: VisibilityDeformation,
  ): VisibilityResult {
    if (!this.bvh || !this.geometry) throw Error("Visibility query disposed");
    const near = budget.near ?? 0,
      far = budget.far ?? 256;
    const maxBounds = boundedInteger(
      budget.maxBoundsTests ?? 8192,
      1,
      1000000,
      "bounds budget",
    );
    const maxTriangles = boundedInteger(
      budget.maxTriangleTests ?? 4096,
      1,
      200000,
      "triangle budget",
    );
    if (
      !input?.origin ||
      !input.direction ||
      ![
        ...input.origin.toArray(),
        ...input.direction.toArray(),
        near,
        far,
      ].every(Number.isFinite) ||
      input.origin.toArray().some((v) => Math.abs(v) > 1e6) ||
      input.direction.lengthSq() < 1e-24 ||
      input.direction.lengthSq() > 1e24 ||
      near < 0 ||
      far <= near ||
      far > 1e6
    )
      throw Error("Invalid visibility ray range");
    this.ray.copy(input);
    this.ray.direction.normalize();
    this.ray.at(near, this.nearPoint);
    let exhausted = false;
    let failure: { error: unknown } | undefined;
    const result: VisibilityResult = {
      status: "clear",
      boundsTests: 0,
      triangleTests: 0,
      alphaTests: 0,
      hitDistance: null,
    };
    const index = this.geometry.index!,
      uv = this.geometry.getAttribute("uv");
    this.bvh.shapecast({
      intersectsBounds: (box) => {
        if (failure || exhausted || result.boundsTests >= maxBounds) {
          exhausted = true;
          return false;
        }
        result.boundsTests++;
        let activeBox = box;
        if (deformation) {
          try {
            this.sourceBounds.copy(box);
            this.deformedBounds.makeEmpty();
            deformation.bounds(this.sourceBounds, this.deformedBounds);
            const b = this.deformedBounds;
            if (
              b.isEmpty() ||
              ![...b.min.toArray(), ...b.max.toArray()].every(
                (v) => Number.isFinite(v) && Math.abs(v) <= 1e6,
              )
            )
              throw Error("Invalid deformed visibility bounds");
            activeBox = b;
          } catch (error) {
            failure = { error };
            return false;
          }
        }
        if (activeBox.containsPoint(this.nearPoint)) return true;
        const p = this.ray.intersectBox(activeBox, this.hit);
        if (!p) return false;
        const distance = p.distanceTo(this.ray.origin);
        return distance >= near && distance <= far;
      },
      intersectsTriangle: (triangle, triangleIndex) => {
        if (failure || exhausted || result.triangleTests >= maxTriangles) {
          exhausted = true;
          return true;
        }
        result.triangleTests++;
        let activeTriangle: Triangle = triangle;
        if (deformation) {
          try {
            const out = this.deformedTriangle;
            for (const [source, target] of [
              [triangle.a, out.a],
              [triangle.b, out.b],
              [triangle.c, out.c],
            ] as const) {
              this.sourcePoint.copy(source);
              target.set(NaN, NaN, NaN);
              deformation.point(this.sourcePoint, target);
              if (
                !target
                  .toArray()
                  .every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6)
              )
                throw Error("Invalid deformed visibility vertex");
            }
            activeTriangle = out;
          } catch (error) {
            failure = { error };
            return true;
          }
        }
        const p = this.ray.intersectTriangle(
          activeTriangle.a,
          activeTriangle.b,
          activeTriangle.c,
          false,
          this.hit,
        );
        if (!p) return false;
        const distance = p.distanceTo(this.ray.origin);
        if (distance < near || distance > far) return false;
        if (this.alpha) {
          result.alphaTests++;
          activeTriangle.getBarycoord(p, this.bary);
          let u = 0,
            v = 0;
          for (let k = 0; k < 3; k++) {
            const vertex = index.getX(triangleIndex * 3 + k),
              weight = this.bary.getComponent(k);
            u += uv.getX(vertex) * weight;
            v += uv.getY(vertex) * weight;
          }
          if (this.sampleAlpha(u, v) < (this.alpha.cutoff ?? 0.5)) return false;
        }
        result.hitDistance = distance;
        result.status = "occluded";
        return true;
      },
    });
    // Do not throw from BVH callbacks: let its shared scratch stack unwind first.
    if (failure) throw failure.error;
    if (result.status !== "occluded" && exhausted)
      result.status = "budget-exhausted";
    return result;
  }

  private sampleAlpha(u: number, v: number) {
    const a = this.alpha!;
    const axis = (x: number, n: number, wrap: string | undefined) =>
      wrap === "repeat" ? ((x % n) + n) % n : Math.max(0, Math.min(n - 1, x));
    const x = u * a.width - 0.5,
      y = v * a.height - 0.5;
    const ix = Math.floor(x),
      iy = Math.floor(y),
      tx = x - ix,
      ty = y - iy;
    const pixel = (dx: number, dy: number) =>
      a.data[
        axis(iy + dy, a.height, a.wrapT) * a.width +
          axis(ix + dx, a.width, a.wrapS)
      ]! / 255;
    return (
      (pixel(0, 0) * (1 - tx) + pixel(1, 0) * tx) * (1 - ty) +
      (pixel(0, 1) * (1 - tx) + pixel(1, 1) * tx) * ty
    );
  }

  dispose() {
    if (this.querying) throw Error("Cannot dispose an active visibility query");
    this.geometry?.dispose();
    this.geometry = null;
    this.bvh = null;
    this.alpha = null;
    this.bytes = 0;
  }
}

export { HemisphereVisibilityProbe } from "./visibilityProbe";
export type { VisibilityTrace, VisibilityProbeInput } from "./visibilityProbe";
