import { expect, test } from "bun:test";
import { alphaCoverage, scaleAlphaCoverage } from "../src/alphaCoverage";
test("bilinear coverage includes edge clamps and handles one-dimensional images", () => {
  expect(alphaCoverage(new Uint8Array([0, 255]), 2, 1, 0.5)).toBe(0.5);
  expect(alphaCoverage(new Uint8Array([0, 255]), 1, 2, 0.5)).toBe(0.5);
  expect(alphaCoverage(new Uint8Array([255]), 1, 1, 0.4)).toBe(1);
  expect(alphaCoverage(new Uint8Array([0]), 1, 1, 0.4)).toBe(0);
});
test("bounded quantized rescaling improves a faded mip without changing its input", () => {
  const a = new Uint8Array([0, 0, 40, 80, 0, 0, 40, 80]),
    copy = a.slice();
  const result = scaleAlphaCoverage(a, 4, 2, 0.4, 0.25);
  expect(result.originalCoverage).toBe(0);
  expect(Math.abs(result.coverage - 0.25)).toBeLessThan(0.1);
  expect(result.scale).toBeGreaterThan(1);
  expect(a).toEqual(copy);
});
test("unrepresentable tails remain explicit instead of flooding the last mip", () => {
  const r = scaleAlphaCoverage(new Uint8Array([41]), 1, 1, 0.4, 0.166);
  expect(r.coverage).toBe(0);
  expect(r.scale).toBe(1);
  for (const [w, h, c] of [
    [0, 1, 0.4],
    [1, 1, 0],
    [1, 1, 1],
    [1, 1, NaN],
    [513, 512, 0.4],
  ])
    expect(() => alphaCoverage(new Uint8Array([0]), w!, h!, c!)).toThrow();
  expect(() =>
    scaleAlphaCoverage(new Uint8Array([0]), 1, 1, 0.4, NaN),
  ).toThrow();
});

test("rejects non-byte input and invalid coverage targets", () => {
  for (const value of [null, [0], new Float32Array([0])])
    expect(() =>
      alphaCoverage(value as unknown as Uint8Array, 1, 1, 0.5),
    ).toThrow();
  for (const target of [-0.1, 1.1, Infinity])
    expect(() =>
      scaleAlphaCoverage(new Uint8Array([0]), 1, 1, 0.5, target),
    ).toThrow();
});
