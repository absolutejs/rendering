import { test, expect } from "bun:test";
import { SRGBColorSpace, RGBAFormat } from "three";
import { createPreparedMipArrayTexture } from "../src/preparedMipArrayTexture";
const chain = (offset = 0) =>
  [4, 2, 1].map((width, level) => ({
    width,
    height: width,
    data: new Uint8Array(width * width * 4).fill(offset + level),
  }));
test("owned array preserves all mip layers and isolates copied source bytes", () => {
  const layers = [chain(10), chain(20), chain(30)],
    t = createPreparedMipArrayTexture(layers, { colorSpace: SRGBColorSpace });
  expect(t.image.depth).toBe(3);
  expect(t.format).toBe(RGBAFormat);
  expect(t.colorSpace).toBe(SRGBColorSpace);
  expect(t.generateMipmaps).toBe(false);
  for (let level = 0; level < 3; level++) {
    const mip = t.mipmaps[level]!,
      bytes = layers[0]![level]!.data.byteLength;
    expect(mip.data.byteLength).toBe(bytes * 3);
    for (let layer = 0; layer < 3; layer++)
      expect(
        Array.from(mip.data.subarray(layer * bytes, (layer + 1) * bytes)),
      ).toEqual(Array.from(layers[layer]![level]!.data));
  }
  layers[0]![0]!.data[0] = 200;
  expect(t.mipmaps[0]!.data[0]).toBe(10);
  (t.mipmaps[0]!.data as Uint8Array)[1] = 100;
  expect(layers[0]![0]!.data[1]).toBe(10);
  t.dispose();
  expect(layers[1]![0]!.data.byteLength).toBe(64);
});
test("rejects invalid layers, layouts, color spaces and aggregate budgets", () => {
  for (const layers of [
    [],
    [[]],
    [chain().slice(0, 2)],
    [chain(), chain().slice(1)],
    [...Array(257)].map(() => chain()),
    [[{ width: NaN, height: 1, data: new Uint8Array(4) }]],
    [
      [
        { width: 2, height: 2, data: new Uint8Array(15) },
        { width: 1, height: 1, data: new Uint8Array(4) },
      ],
    ],
    [[...chain(), chain()[2]!]],
  ])
    expect(() => createPreparedMipArrayTexture(layers)).toThrow();
  for (const maximumBytes of [0, 1.5, NaN, 64 * 1024 * 1024 + 1, 167])
    expect(() =>
      createPreparedMipArrayTexture([chain(), chain()], { maximumBytes }),
    ).toThrow();
  expect(() =>
    createPreparedMipArrayTexture([chain()], {
      colorSpace: "unsupported" as any,
    }),
  ).toThrow();
  const texture = createPreparedMipArrayTexture([chain(), chain()], {
    maximumBytes: 168,
  });
  texture.dispose();
});
test("odd and rectangular chains retain ordered layers with a one-pixel tail", () => {
  const layer = [
    { width: 3, height: 5, data: new Uint8Array(60).fill(42) },
    { width: 1, height: 2, data: new Uint8Array(8).fill(43) },
    { width: 1, height: 1, data: new Uint8Array(4).fill(44) },
  ];
  const t = createPreparedMipArrayTexture([layer, layer], {
    maximumBytes: 144,
  });
  expect(t.mipmaps.map((m) => [m.width, m.height, m.data.length])).toEqual([
    [3, 5, 120],
    [1, 2, 16],
    [1, 1, 8],
  ]);
  t.dispose();
});
