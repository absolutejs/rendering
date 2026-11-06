import { Ray, Vector3 } from "three";
import type { VisibilityBudget, VisibilityResult } from "./visibility.js";

export type VisibilityTrace = (
  ray: Ray,
  budget: Readonly<Required<VisibilityBudget>>,
) => VisibilityResult;
export type VisibilityProbeInput = {
  /** Caller-owned scene revision; reject results whose revision is no longer current. */
  revision: string;
  origin: Readonly<Vector3>;
  samples?: number;
  budget?: VisibilityBudget;
};

/** Deterministic equal-solid-angle sample direction used by exported probe masks.
 * Kept public so sky reweighting need not retain or retrace scene geometry. */
export function hemisphereVisibilityDirection<
  T extends { set(x: number, y: number, z: number): T },
>(index: number, samples: number, target: T): T {
  if (
    !Number.isSafeInteger(samples) ||
    samples < 1 ||
    samples > 4096 ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= samples
  )
    throw Error("Invalid hemisphere sample address");
  const y = (index + 0.5) / samples,
    angle = index * Math.PI * (3 - Math.sqrt(5)),
    r = Math.sqrt(1 - y * y);
  return target.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
}

/** Incremental upper-world-hemisphere visibility integration. Run bounded steps
 * in a worker, yielding between steps for cancellation. No scheduler is installed.
 * Accessibility is cosine-weighted for an upward horizontal receiver, not an
 * arbitrary leaf normal or a directional sky's irradiance. */
export class HemisphereVisibilityProbe {
  private trace: VisibilityTrace | null;
  private readonly ray: Ray;
  private readonly origin: Vector3;
  private readonly budget: Readonly<Required<VisibilityBudget>>;
  readonly revision: string;
  readonly samples: number;
  private readonly packed: Uint8Array;
  private cursor = 0;
  private clearWeight = 0;
  private unresolvedWeight = 0;
  private unresolved = 0;
  private boundsTests = 0;
  private triangleTests = 0;
  private alphaTests = 0;
  private running = false;
  private cancelled = false;

  constructor(input: VisibilityProbeInput, trace: VisibilityTrace) {
    if (
      !input ||
      typeof input.revision !== "string" ||
      !input.revision.length ||
      input.revision.length > 256 ||
      typeof trace !== "function"
    )
      throw Error("Invalid visibility probe identity");
    const origin = input.origin;
    if (
      !origin ||
      ![origin.x, origin.y, origin.z].every(
        (v) => Number.isFinite(v) && Math.abs(v) <= 1e6,
      )
    )
      throw Error("Invalid probe origin");
    this.samples = input.samples ?? 128;
    if (
      !Number.isSafeInteger(this.samples) ||
      this.samples < 1 ||
      this.samples > 4096
    )
      throw Error("Invalid probe sample count");
    const b = input.budget ?? {};
    const budget = {
      near: b.near ?? 0.01,
      far: b.far ?? 64,
      maxBoundsTests: b.maxBoundsTests ?? 8192,
      maxTriangleTests: b.maxTriangleTests ?? 4096,
    };
    if (
      !Number.isFinite(budget.near) ||
      budget.near < 0 ||
      !Number.isFinite(budget.far) ||
      budget.far <= budget.near ||
      budget.far > 1e6 ||
      !Number.isSafeInteger(budget.maxBoundsTests) ||
      budget.maxBoundsTests < 1 ||
      budget.maxBoundsTests > 1000000 ||
      !Number.isSafeInteger(budget.maxTriangleTests) ||
      budget.maxTriangleTests < 1 ||
      budget.maxTriangleTests > 200000
    )
      throw Error("Invalid probe budget");
    this.packed = new Uint8Array(Math.ceil(this.samples / 4));
    this.budget = Object.freeze(budget);
    this.revision = input.revision;
    this.origin = new Vector3().copy(origin);
    this.ray = new Ray(this.origin.clone(), new Vector3());
    this.trace = trace;
  }

  /** At most maximumRays callback calls, each with the fixed per-ray budget.
   * The callback must enforce that budget across its entire scene query. */
  step(maximumRays: number) {
    if (this.running) throw Error("Reentrant probe step");
    if (
      !Number.isSafeInteger(maximumRays) ||
      maximumRays < 1 ||
      maximumRays > 4096
    )
      throw Error("Invalid probe step size");
    if (this.cancelled) throw Error("Probe cancelled");
    this.running = true;
    try {
      const end = Math.min(this.samples, this.cursor + maximumRays);
      while (this.cursor < end) {
        const y = (this.cursor + 0.5) / this.samples;
        this.ray.origin.copy(this.origin);
        hemisphereVisibilityDirection(
          this.cursor,
          this.samples,
          this.ray.direction,
        );
        const result = this.trace!(this.ray, this.budget);
        if (
          !result ||
          !["clear", "occluded", "budget-exhausted"].includes(result.status) ||
          ![result.boundsTests, result.triangleTests, result.alphaTests].every(
            (v) => Number.isSafeInteger(v) && v >= 0,
          ) ||
          result.boundsTests > this.budget.maxBoundsTests ||
          result.triangleTests > this.budget.maxTriangleTests ||
          result.alphaTests > result.triangleTests
        )
          throw Error("Invalid or over-budget scene trace result");
        this.boundsTests += result.boundsTests;
        this.triangleTests += result.triangleTests;
        this.alphaTests += result.alphaTests;
        if (result.status === "clear") this.clearWeight += y;
        if (result.status === "budget-exhausted") {
          this.unresolvedWeight += y;
          this.unresolved++;
        }
        const code =
          result.status === "clear" ? 1 : result.status === "occluded" ? 2 : 3;
        this.packed[this.cursor >> 2] =
          this.packed[this.cursor >> 2]! | (code << ((this.cursor & 3) * 2));
        this.cursor++;
      }
      if (this.cursor === this.samples) this.trace = null;
      return this.snapshot();
    } finally {
      this.running = false;
    }
  }

  snapshot() {
    const total = this.samples / 2;
    const processedWeight = (this.cursor * this.cursor) / (2 * this.samples);
    const pendingWeight = total - processedWeight;
    const done = this.cursor === this.samples;
    return {
      revision: this.revision,
      state: this.cancelled
        ? ("cancelled" as const)
        : done
          ? ("complete" as const)
          : ("pending" as const),
      samples: this.samples,
      processed: this.cursor,
      unresolved: this.unresolved,
      accessibility:
        done && !this.cancelled && !this.unresolved
          ? this.clearWeight / total
          : null,
      accessibilityLower: this.clearWeight / total,
      accessibilityUpper: Math.min(
        1,
        (this.clearWeight + this.unresolvedWeight + pendingWeight) / total,
      ),
      boundsTests: this.boundsTests,
      triangleTests: this.triangleTests,
      alphaTests: this.alphaTests,
    };
  }

  /** Owned transferable COPY: low-to-high two-bit sample codes in each byte.
   * 0=pending, 1=clear, 2=occluded, 3=budget-exhausted. Never interpret 0/3
   * as clear. Tail bits are zero. Revision/state must be checked by consumers.
   * Directions are regenerated with hemisphereVisibilityDirection, not stored.
   * Each sample has solid angle 2*pi/samples. This retains no scene callback. */
  exportSamples() {
    return {
      distribution: "upper-fibonacci-1" as const,
      revision: this.revision,
      state: this.snapshot().state,
      samples: this.samples,
      processed: this.cursor,
      packed: this.packed.slice(),
    };
  }

  cancel() {
    if (this.running) throw Error("Cannot cancel a running probe callback");
    this.cancelled = true;
    this.trace = null;
  }
}
