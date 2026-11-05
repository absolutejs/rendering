import { expect, test } from "bun:test";
import {
  DataTexture,
  DataArrayTexture,
  SRGBColorSpace,
  RepeatWrapping,
  Texture,
} from "three";
import { createPreparedMipTexture } from "../src/preparedMipTexture";
const chain = () => [
  { width: 2, height: 2, data: new Uint8Array(16) },
  { width: 1, height: 1, data: new Uint8Array(4) },
];
test("owned mip texture preserves sampler/UV state and borrows immutable bytes without altering source", () => {
  const source = new DataTexture(new Uint8Array(16), 2, 2);
  source.colorSpace = SRGBColorSpace;
  source.wrapS = RepeatWrapping;
  source.offset.set(0.2, 0.3);
  source.flipY = false;
  const levels = chain(),
    before = source.source,
    t = createPreparedMipTexture(source, levels);
  expect(source.source).toBe(before);
  expect(source.mipmaps.length).toBe(0);
  expect(t.source).not.toBe(before);
  expect(t.mipmaps[0]).not.toBe(levels[0]);
  expect(t.mipmaps[0]!.data).toBe(levels[0]!.data);
  expect(t.colorSpace).toBe(source.colorSpace);
  expect(t.wrapS).toBe(source.wrapS);
  expect(t.offset.toArray()).toEqual([0.2, 0.3]);
  expect(t.generateMipmaps).toBe(false);
  t.offset.set(0, 0);
  expect(source.offset.toArray()).toEqual([0.2, 0.3]);
  t.dispose();
  expect(source.image.data.byteLength).toBe(16);
  source.dispose();
});
test("rejects incomplete, malformed, oversized and non-2D mip inputs before allocation", () => {
  const s = new DataTexture(new Uint8Array(16), 2, 2);
  for (const levels of [
    [],
    chain().slice(0, 1),
    chain().slice(1),
    [...chain(), chain()[1]!],
    [{ width: 2, height: 2, data: new Uint8Array(15) }, chain()[1]!],
    [{ width: NaN, height: 2, data: new Uint8Array(16) }, chain()[1]!],
  ])
    expect(() => createPreparedMipTexture(s, levels)).toThrow();
  for (const limit of [0, 19, NaN, 1.5, 64 * 1024 * 1024 + 1])
    expect(() => createPreparedMipTexture(s, chain(), limit)).toThrow();
  const array = new DataArrayTexture(new Uint8Array(16), 2, 2, 1);
  expect(() => createPreparedMipTexture(array, chain())).toThrow();
  expect(() => createPreparedMipTexture(new Texture(), chain())).toThrow();
  s.dispose();
  array.dispose();
});
test("odd dimensions halve with flooring and borrowed backing allocations obey the budget", () => {
  const s = new DataTexture(new Uint8Array(3 * 5 * 4), 3, 5),
    levels = [
      { width: 3, height: 5, data: new Uint8Array(60) },
      { width: 1, height: 2, data: new Uint8Array(8) },
      { width: 1, height: 1, data: new Uint8Array(4) },
    ];
  const t = createPreparedMipTexture(s, levels, 72);
  expect(t.mipmaps.length).toBe(3);
  t.dispose();
  levels[0]!.data = new Uint8Array(new ArrayBuffer(1024), 0, 60);
  expect(() => createPreparedMipTexture(s, levels, 72)).toThrow();
  s.dispose();
});

test("shared backing buffers are counted once and separate oversized allocations cannot evade the budget", () => {
  const s = new DataTexture(new Uint8Array(16), 2, 2),
    shared = new ArrayBuffer(20);
  const t = createPreparedMipTexture(
    s,
    [
      { width: 2, height: 2, data: new Uint8Array(shared, 0, 16) },
      { width: 1, height: 1, data: new Uint8Array(shared, 16, 4) },
    ],
    20,
  );
  t.dispose();
  expect(() =>
    createPreparedMipTexture(
      s,
      [
        {
          width: 2,
          height: 2,
          data: new Uint8Array(new ArrayBuffer(20), 0, 16),
        },
        {
          width: 1,
          height: 1,
          data: new Uint8Array(new ArrayBuffer(20), 0, 4),
        },
      ],
      20,
    ),
  ).toThrow();
  s.dispose();
});
