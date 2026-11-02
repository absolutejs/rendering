import { applyProps, type ThreeElements } from "@react-three/fiber";
import { createHost } from "@react-spring/animated";
import type { WithAnimated } from "@react-spring/three";

/** Explicit Three hosts driven by React Spring's normal scheduler. Updating a
 * Three prop invalidates its Fiber root; DOM-only springs do not render a scene.
 * Does not install a global clock, call useFrame, or repair another module's
 * scheduler changes. Avoid runtime imports of @react-spring/three alongside it. */
export function createFiberSpringHost<T extends keyof ThreeElements>(
  primitives: readonly T[],
): Pick<WithAnimated, T> {
  return createHost([...primitives], { applyAnimatedValues: applyProps })
    .animated as unknown as Pick<WithAnimated, T>;
}

/** Small default host; opt into other Fiber primitives with createFiberSpringHost. */
export const animated = createFiberSpringHost(["mesh", "group"]);
export { useSpring, easings } from "@react-spring/web";
