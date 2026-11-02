import { createElement } from "react";
import { animated, createFiberSpringHost } from "../src/spring";
createElement(animated.group, { position: [1, 0, 0] });
const lights = createFiberSpringHost(["spotLight", "instancedMesh"]);
createElement(lights.spotLight, { intensity: 1, position: [0, 1, 2] });
// @ts-expect-error Only actual Fiber primitives can be registered.
createFiberSpringHost(["notAThreePrimitive"]);
// @ts-expect-error Default hosts are intentionally limited to mesh and group.
animated.instancedMesh;
// @ts-expect-error The selected host does not expose unrelated primitives.
lights.group;
