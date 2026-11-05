import { expect, test } from "bun:test";
import { associateAlphaColor, downsampleAlphaColor } from "../src/alphaColor";
import { configureAssociatedColorMap } from "../src/associatedColorMap";
import { MeshBasicMaterial, MeshStandardMaterial, Texture } from "three";
const reduce = (
  data: number[],
  width: number,
  height = 1,
  colorSpace: "linear" | "srgb" = "linear",
) =>
  downsampleAlphaColor(
    { width, height, data: new Uint8Array(data) },
    { colorSpace },
  );
test("association preserves alpha and source ownership and ignores transparent RGB", () => {
  const input = new Uint8Array([
    255, 100, 50, 0, 255, 100, 50, 255, 255, 0, 0, 128,
  ]);
  const before = input.slice(),
    out = associateAlphaColor(input);
  expect(input).toEqual(before);
  expect(out).not.toBe(input);
  expect([...out]).toEqual([0, 0, 0, 0, 255, 100, 50, 255, 188, 0, 0, 128]);
});
test("hidden RGB cannot contaminate downsampled visible color", () => {
  const a = reduce(
    [255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 0, 255, 255, 255, 0],
    2,
    2,
  );
  const b = reduce([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2, 2);
  expect(a.data).toEqual(b.data);
  expect([...a.data]).toEqual([255, 0, 0, 64]);
});
test("sRGB reduction averages linear light and fractional alpha weights color", () => {
  expect([
    ...reduce([255, 255, 255, 255, 0, 0, 0, 255], 2, 1, "srgb").data,
  ]).toEqual([188, 188, 188, 255]);
  expect([...reduce([255, 0, 0, 255, 0, 0, 255, 85], 2).data]).toEqual([
    191, 0, 64, 170,
  ]);
});
test("odd edge footprints participate and conserve area-weighted alpha", () => {
  expect([...reduce([0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 255], 3).data]).toEqual(
    [0, 255, 0, 85],
  );
  const data = Array.from({ length: 15 }, (_, i) => [
    200,
    100,
    50,
    i * 17,
  ]).flat();
  const out = reduce(data, 3, 5);
  expect([out.width, out.height]).toEqual([1, 2]);
  expect(Math.abs((out.data[3]! + out.data[7]!) / 2 - 119)).toBeLessThanOrEqual(
    0.5,
  );
  expect([...out.data.slice(0, 3)]).toEqual([200, 100, 50]);
});
test("terminal mip is owned and bounded contracts reject malformed input", () => {
  const data = new Uint8Array([1, 2, 3, 4]),
    out = downsampleAlphaColor({ width: 1, height: 1, data });
  expect(out.data).toEqual(data);
  expect(out.data).not.toBe(data);
  for (const maximumPixels of [0, NaN, 1.5, 1048577])
    expect(() => associateAlphaColor(data, { maximumPixels })).toThrow();
  for (const bytes of [new Uint8Array(), new Uint8Array(5), new Uint8Array(8)])
    expect(() => associateAlphaColor(bytes, { maximumPixels: 1 })).toThrow();
  for (const width of [0, -1, NaN, 2])
    expect(() => downsampleAlphaColor({ width, height: 1, data })).toThrow();
});
test("material hook composes once without changing coverage or blend state", () => {
  for (const material of [
    new MeshBasicMaterial({ map: new Texture(), alphaTest: 0.4 }),
    new MeshStandardMaterial({ map: new Texture(), alphaTest: 0.4 }),
  ]) {
    let priorCalls = 0;
    material.onBeforeCompile = (shader) => {
      priorCalls++;
      shader.fragmentShader += "\n// prior";
    };
    material.customProgramCacheKey = () => "prior-key";
    const version = material.version;
    configureAssociatedColorMap(material);
    configureAssociatedColorMap(material);
    const shader = { fragmentShader: "#include <map_fragment>" } as any;
    material.onBeforeCompile(shader, {} as any);
    expect(priorCalls).toBe(1);
    expect(
      shader.fragmentShader.match(/sampledDiffuseColor.rgb \/=/g)?.length,
    ).toBe(1);
    expect(shader.fragmentShader).toContain("// prior");
    expect(material.customProgramCacheKey()).toBe(
      "prior-key:associated-color-map-1",
    );
    expect(material.alphaTest).toBe(0.4);
    expect(material.transparent).toBe(false);
    expect(material.version).toBeGreaterThan(version);
    expect(() =>
      material.onBeforeCompile({ fragmentShader: "no map" } as any, {} as any),
    ).toThrow();
    material.map!.dispose();
    material.dispose();
  }
  expect(() => configureAssociatedColorMap(new MeshBasicMaterial())).toThrow();
});
test("byte alpha half-ties round identically to exact box averages", () => {
  for (let a = 0; a < 256; a++)
    for (let b = 0; b < 256; b++) {
      const out = reduce([100, 100, 100, a, 100, 100, 100, b], 2);
      if (out.data[3] !== Math.round((a + b) / 2))
        throw Error(`Alpha half-tie drift ${a}/${b}`);
    }
});
