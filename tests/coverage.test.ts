import { test, expect } from "bun:test";
import { MeshBasicMaterial, Texture, type WebGLRenderer } from "three";
import {
  bindAlphaToCoverageDestination,
  cloneRenderMaterial,
  destinationIsMultisampled,
} from "../src";
function device(antialias = true, maxSamples = 4) {
  let target: { samples: number } | null = null,
    reads = 0;
  const renderer = {
    getRenderTarget: () => target,
    getContextAttributes: () => {
      reads++;
      return { antialias };
    },
    capabilities: { maxSamples },
  } as unknown as WebGLRenderer;
  return {
    renderer,
    target: (samples: number | null) => {
      target = samples === null ? null : { samples };
    },
    reads: () => reads,
  };
}
function draw(m: MeshBasicMaterial, renderer: WebGLRenderer) {
  m.onBeforeRender(
    renderer,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}
test("destination selection distinguishes canvas, multisampled targets and reflection targets without repeated context queries", () => {
  const d = device();
  expect(destinationIsMultisampled(d.renderer)).toBe(true);
  expect(destinationIsMultisampled(d.renderer)).toBe(true);
  expect(d.reads()).toBe(1);
  d.target(0);
  expect(destinationIsMultisampled(d.renderer)).toBe(false);
  d.target(4);
  expect(destinationIsMultisampled(d.renderer)).toBe(true);
  const unsupported = device(false, 0);
  unsupported.target(4);
  expect(destinationIsMultisampled(unsupported.renderer)).toBe(false);
  const noAA = device(false);
  expect(destinationIsMultisampled(noAA.renderer)).toBe(false);
  noAA.target(4);
  expect(destinationIsMultisampled(noAA.renderer)).toBe(true);
});
test("coverage switches before draw, preserves prior callback context and invalidates only changed program variants", () => {
  const m = new MeshBasicMaterial(),
    d = device();
  m.alphaToCoverage = true;
  const observed: unknown[] = [];
  m.onBeforeRender = function () {
    observed.push(this);
  };
  const prior = m.onBeforeRender,
    dispose = bindAlphaToCoverageDestination(m),
    v = m.version;
  draw(m, d.renderer);
  expect(m.version).toBe(v);
  d.target(0);
  draw(m, d.renderer);
  expect(m.alphaToCoverage).toBe(false);
  const switched = m.version;
  expect(switched).toBeGreaterThan(v);
  draw(m, d.renderer);
  expect(m.version).toBe(switched);
  d.target(null);
  draw(m, d.renderer);
  expect(m.alphaToCoverage).toBe(true);
  expect(observed).toEqual([m, m, m, m]);
  dispose();
  expect(m.onBeforeRender).toBe(prior);
  expect(m.alphaToCoverage).toBe(true);
  dispose();
  m.dispose();
});
test("rebind updates preference without callback chains and disposal respects subsequent owners", () => {
  const m = new MeshBasicMaterial(),
    d = device();
  m.alphaToCoverage = true;
  const dispose = bindAlphaToCoverageDestination(m),
    callback = m.onBeforeRender;
  expect(bindAlphaToCoverageDestination(m, false)).toBe(dispose);
  expect(m.onBeforeRender).toBe(callback);
  draw(m, d.renderer);
  expect(m.alphaToCoverage).toBe(false);
  const replacement = () => {};
  m.onBeforeRender = replacement;
  dispose();
  expect(m.onBeforeRender).toBe(replacement);
  expect(m.alphaToCoverage).toBe(false);
  expect(() => bindAlphaToCoverageDestination(m, 1 as any)).toThrow();
  m.dispose();
});
test("clones retain shader hooks, borrow textures and own destination policy independently even after offscreen draws", () => {
  const map = new Texture(),
    source = new MeshBasicMaterial({ map }),
    d = device();
  source.alphaToCoverage = true;
  source.onBeforeCompile = function (shader) {
    shader.fragmentShader += "\n// authored";
  };
  source.customProgramCacheKey = () => "authored";
  const calls: unknown[] = [];
  source.onBeforeRender = function () {
    calls.push(this);
  };
  bindAlphaToCoverageDestination(source);
  d.target(0);
  draw(source, d.renderer);
  const copy = cloneRenderMaterial(source);
  expect(copy.map).toBe(map);
  expect(copy.customProgramCacheKey()).toBe("authored");
  const shader = { fragmentShader: "base" };
  copy.onBeforeCompile(shader as any, d.renderer);
  expect(shader.fragmentShader).toContain("authored");
  d.target(null);
  draw(copy, d.renderer);
  expect(copy.alphaToCoverage).toBe(true);
  expect(source.alphaToCoverage).toBe(false);
  bindAlphaToCoverageDestination(copy, false);
  draw(source, d.renderer);
  draw(copy, d.renderer);
  expect(source.alphaToCoverage).toBe(true);
  expect(copy.alphaToCoverage).toBe(false);
  expect(calls).toEqual([source, copy, source, copy]);
  source.dispose();
  copy.dispose();
  map.dispose();
});
test("unbound clone preserves authored render callback without installing a sampling policy", () => {
  const source = new MeshBasicMaterial(),
    d = device();
  let owner: unknown;
  source.onBeforeRender = function () {
    owner = this;
  };
  const copy = cloneRenderMaterial(source);
  draw(copy, d.renderer);
  expect(owner).toBe(copy);
  expect(copy.alphaToCoverage).toBe(false);
  source.dispose();
  copy.dispose();
});
test("context loss is not cached as permanent lack of sampling", () => {
  let lost = true,
    reads = 0;
  const renderer = {
    getRenderTarget: () => null,
    getContextAttributes: () => {
      reads++;
      return lost ? null : { antialias: true };
    },
    capabilities: { maxSamples: 4 },
  } as unknown as WebGLRenderer;
  expect(destinationIsMultisampled(renderer)).toBe(false);
  lost = false;
  expect(destinationIsMultisampled(renderer)).toBe(true);
  expect(destinationIsMultisampled(renderer)).toBe(true);
  expect(reads).toBe(2);
});
