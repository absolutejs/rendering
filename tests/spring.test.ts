import { expect, test } from "bun:test";
import { raf } from "@react-spring/shared";
import { animated, createFiberSpringHost, useSpring } from "../src/spring";

test("Three spring hosts do not install a demand scheduler", () => {
  expect(raf.frameLoop).toBe("always");
  expect(Object.keys(animated).sort()).toEqual(["group", "mesh"]);
  const host = createFiberSpringHost(["instancedMesh", "meshStandardMaterial"]);
  expect(Object.keys(host).sort()).toEqual([
    "instancedMesh",
    "meshStandardMaterial",
  ]);
  expect(raf.frameLoop).toBe("always");
  expect(typeof useSpring).toBe("function");
});
