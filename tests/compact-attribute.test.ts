import { expect, test } from "bun:test";
import { DataUtils, Float16BufferAttribute } from "three";
import { createCompactFloatAttribute } from "../src/compactFloatAttribute";
test("signed normalized attributes retain endpoints with a measured error bound", () => {
  const source = new Float32Array([-1, -0.123456, 0, 0.123456, 0.5, 1]);
  const result = createCompactFloatAttribute(source, 3, {
    encoding: "snorm16",
    maximumAbsoluteError: 1 / 32767,
  });
  expect(result.attribute.normalized).toBe(true);
  expect(result.attribute.array).toBeInstanceOf(Int16Array);
  expect(result.attribute.getX(0)).toBe(-1);
  expect(result.attribute.getZ(1)).toBe(1);
  expect(result.audit.outputBytes).toBe(source.byteLength / 2);
  for (let i = 0; i < source.length; i++)
    expect(
      Math.abs(
        result.attribute.getComponent(Math.floor(i / 3), i % 3) - source[i]!,
      ),
    ).toBeLessThanOrEqual(result.audit.errorLimit);
});
test("half attributes preserve HDR color and signed UVs without clamping", () => {
  const source = new Float32Array([1.25, -2.5, 0, 65504, 0.3333, 1.145]);
  const result = createCompactFloatAttribute(source, 3, {
    encoding: "float16",
    maximumAbsoluteError: 0.001,
  });
  expect(result.attribute).toBeInstanceOf(Float16BufferAttribute);
  expect(result.attribute.normalized).toBe(false);
  expect(result.attribute.getX(0)).toBe(1.25);
  expect(result.attribute.getY(0)).toBe(-2.5);
  expect(result.attribute.getX(1)).toBe(65504);
  expect(result.audit.maximumAbsoluteError).toBeLessThan(0.001);
  expect(result.audit.outputBytes).toBe(source.byteLength / 2);
  for (let i = 0; i < source.length; i++)
    expect(DataUtils.fromHalfFloat(result.attribute.array[i]!)).toBe(
      DataUtils.fromHalfFloat(DataUtils.toHalfFloat(source[i]!)),
    );
});
test("source and output ownership stay independent, including subviews", () => {
  const backing = new Float32Array([4, 0.25, 0.5, 8]),
    source = backing.subarray(1, 3),
    before = [...backing];
  const { attribute } = createCompactFloatAttribute(source, 1, {
    encoding: "float16",
    maximumAbsoluteError: 0,
  });
  expect([...backing]).toEqual(before);
  source[0] = 0.75;
  expect(attribute.getX(0)).toBe(0.25);
  attribute.setX(1, 0.125);
  expect(source[1]).toBe(0.5);
});
test("invalid ranges and accuracy demands fail without altering source", () => {
  for (const [encoding, values, error] of [
    ["snorm16", [1.01], 1],
    ["float16", [65505], 1],
    ["float16", [NaN], 1],
    ["snorm16", [Infinity], 1],
    ["float16", [0.3333], 0],
  ] as const) {
    const source = new Float32Array(values),
      before = [...source];
    expect(() =>
      createCompactFloatAttribute(source, 1, {
        encoding,
        maximumAbsoluteError: error,
      }),
    ).toThrow();
    expect([...source]).toEqual(before);
  }
  for (const size of [0, 5, 1.5])
    expect(() =>
      createCompactFloatAttribute(new Float32Array(3), size, {
        encoding: "float16",
        maximumAbsoluteError: 1,
      }),
    ).toThrow();
  for (const error of [-1, NaN, Infinity, 2])
    expect(() =>
      createCompactFloatAttribute(new Float32Array(3), 3, {
        encoding: "float16",
        maximumAbsoluteError: error,
      }),
    ).toThrow();
  expect(() =>
    createCompactFloatAttribute(new Float32Array(0), 1, {
      encoding: "snorm16",
      maximumAbsoluteError: 0,
    }),
  ).toThrow();
  expect(() =>
    createCompactFloatAttribute(new Float32Array(3), 2, {
      encoding: "float16",
      maximumAbsoluteError: 1,
    }),
  ).toThrow();
  expect(() =>
    createCompactFloatAttribute(new Float32Array(3), 3, {
      encoding: "bad" as any,
      maximumAbsoluteError: 1,
    }),
  ).toThrow();
  expect(() =>
    createCompactFloatAttribute(
      new Float32Array(new SharedArrayBuffer(12)),
      3,
      { encoding: "float16", maximumAbsoluteError: 1 },
    ),
  ).toThrow();
  const detached = new Float32Array(3);
  structuredClone(detached, { transfer: [detached.buffer] });
  expect(() =>
    createCompactFloatAttribute(detached, 3, {
      encoding: "float16",
      maximumAbsoluteError: 1,
    }),
  ).toThrow();
});
