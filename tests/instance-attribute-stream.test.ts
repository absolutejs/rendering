import { test, expect } from "bun:test";
import { DynamicDrawUsage } from "three";
import { createInstanceAttributeStream } from "../src/instanceAttributeStream";
test("fixed storage copies prefixes and avoids unchanged uploads", () => {
  const stream = createInstanceAttributeStream(4, 3),
    a = stream.attribute,
    data = a.array;
  const source = new Float32Array([1, 2, 3, 4, 5, 6]);
  expect(a.usage).toBe(DynamicDrawUsage);
  expect(stream.update(source, 2)).toBe(6);
  expect(stream.count).toBe(2);
  expect(a.updateRanges).toEqual([{ start: 0, count: 6 }]);
  const version = a.version;
  source[0] = 90;
  expect(data[0]).toBe(1);
  source[0] = 1;
  expect(stream.update(source, 2)).toBe(0);
  expect(a.version).toBe(version);
  expect(a.array).toBe(data);
  expect(() => stream.update(data as Float32Array, 2)).toThrow("Invalid");
});
test("pending writes merge before upload, and upload acknowledgment resets only the pending range", () => {
  const s = createInstanceAttributeStream(4, 2),
    data = new Float32Array(8);
  data[1] = 1;
  s.update(data, 4);
  data[6] = 2;
  s.update(data, 4);
  expect(s.attribute.updateRanges).toEqual([{ start: 1, count: 6 }]);
  s.attribute.onUploadCallback();
  expect(s.attribute.updateRanges).toEqual([]);
  data[4] = 3;
  s.update(data, 4);
  expect(s.attribute.updateRanges).toEqual([{ start: 4, count: 1 }]);
  s.attribute.onUploadCallback();
  expect(Array.from(s.attribute.array)).toEqual(Array.from(data));
});
test("shrinking and restoring identical prefixes change draw count without losing pending data or uploading tails", () => {
  const s = createInstanceAttributeStream(3, 1),
    data = new Float32Array([1, 2, 3]);
  s.update(data, 3);
  const version = s.attribute.version;
  expect(s.update(data, 0)).toBe(0);
  expect(s.count).toBe(0);
  expect(s.attribute.version).toBe(version);
  expect(s.attribute.updateRanges).toEqual([{ start: 0, count: 3 }]);
  s.attribute.onUploadCallback();
  expect(s.update(data, 3)).toBe(0);
  expect(s.count).toBe(3);
  expect(s.attribute.version).toBe(version);
  const suffix = new Float32Array([1, NaN]);
  expect(s.update(suffix, 1)).toBe(0);
});
test("invalid updates are atomic, including a late nonfinite value", () => {
  const s = createInstanceAttributeStream(4, 1);
  s.update(new Float32Array([1, 2]), 2);
  const before = Array.from(s.attribute.array),
    version = s.attribute.version,
    ranges = s.attribute.updateRanges.map((x) => ({ ...x }));
  for (const [data, count] of [
    [new Float32Array([9, Infinity]), 2],
    [new Float32Array(2), 3],
    [new Float32Array(5), 5],
    [new Float32Array(2), -1],
  ] as const) {
    expect(() => s.update(data, count)).toThrow();
    expect(Array.from(s.attribute.array)).toEqual(before);
    expect(s.count).toBe(2);
    expect(s.attribute.version).toBe(version);
    expect(s.attribute.updateRanges).toEqual(ranges);
  }
});
test("bounds reject excessive allocation and unsupported layout", () => {
  for (const args of [
    [0, 1],
    [-1, 1],
    [1, 0],
    [1, 17],
    [1.5, 1],
    [2 ** 53, 16],
    [2, 2, 4],
    [1, 1, 2 ** 30],
  ] as const)
    expect(() =>
      createInstanceAttributeStream(...(args as [number, number, number?])),
    ).toThrow();
});
test("signed zero is preserved and nonconcurrent input is required", () => {
  const s = createInstanceAttributeStream(1, 1);
  expect(s.update(new Float32Array([-0]), 1)).toBe(1);
  expect(Object.is(s.attribute.array[0], -0)).toBe(true);
  expect(() => s.update(new Float32Array(new SharedArrayBuffer(4)), 1)).toThrow(
    "Invalid",
  );
});
