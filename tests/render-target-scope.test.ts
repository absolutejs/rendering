import { test, expect } from "bun:test";
import { Vector4, type WebGLRenderer } from "three";
import { renderTargetScope } from "../src";
test("offscreen scopes restore attachment and clipping after thrown work", () => {
  const original = {
    target: { id: 1 },
    face: 4,
    mip: 2,
    viewport: new Vector4(1, 2, 3, 4),
    scissor: new Vector4(5, 6, 7, 8),
    clipping: true,
  };
  const state = {
    ...original,
    viewport: original.viewport.clone(),
    scissor: original.scissor.clone(),
  };
  const fake = {
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.face,
    getActiveMipmapLevel: () => state.mip,
    getViewport: (v: Vector4) => v.copy(state.viewport),
    getScissor: (v: Vector4) => v.copy(state.scissor),
    getScissorTest: () => state.clipping,
    setScissorTest: (v: boolean) => {
      state.clipping = v;
    },
    setRenderTarget: (target: { id: number }, face = 0, mip = 0) => {
      state.target = target;
      state.face = face;
      state.mip = mip;
    },
    setViewport: (v: Vector4) => {
      state.viewport.copy(v);
    },
    setScissor: (v: Vector4) => {
      state.scissor.copy(v);
    },
  };
  expect(() =>
    renderTargetScope(fake as unknown as WebGLRenderer, () => {
      fake.setRenderTarget({ id: 2 });
      fake.setViewport(new Vector4());
      fake.setScissor(new Vector4());
      throw new Error("injected draw failure");
    }),
  ).toThrow("injected draw failure");
  expect(state).toEqual(original);

  const payload = { measured: 42 };
  const result = renderTargetScope(fake as unknown as WebGLRenderer, () => {
    fake.setRenderTarget({ id: 3 });
    fake.setViewport(new Vector4());
    return payload;
  });
  expect(result).toBe(payload);
  expect(state).toEqual(original);
});

test("synchronous reads submit from a neutral target and rebind the multisample attachment", async () => {
  const { readTargetPixelsScoped } = await import("../src");
  const target = { id: "multisample" },
    other = { id: "read" },
    calls: any[] = [];
  let active: any = target,
    face = 2,
    mip = 1;
  const fake = {
    getRenderTarget: () => active,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => mip,
    getViewport: (v: Vector4) => v.set(1, 2, 3, 4),
    getScissor: (v: Vector4) => v.set(5, 6, 7, 8),
    getScissorTest: () => true,
    setScissorTest: () => {},
    setViewport: () => {},
    setScissor: () => {},
    setRenderTarget: (t: any, f = 0, m = 0) => {
      active = t;
      face = f;
      mip = m;
      calls.push([t, f, m]);
    },
    readRenderTargetPixels: () => {
      expect(active).toBeNull();
      throw Error("read failure");
    },
  };
  expect(() =>
    readTargetPixelsScoped(fake as any, other as any, 1, 1, new Uint8Array(4)),
  ).toThrow("read failure");
  expect(active).toBe(target);
  expect(face).toBe(2);
  expect(mip).toBe(1);
  expect(calls).toEqual([
    [null, 0, 0],
    [target, 2, 1],
  ]);
});

import { readFloatTargetScoped } from "../src";
function scopedDevice() {
  const original = {
    target: { id: "cube" },
    face: 3,
    mip: 2,
    viewport: new Vector4(1, 2, 3, 4),
    scissor: new Vector4(5, 6, 7, 8),
    clipping: true,
  };
  const state = {
    ...original,
    viewport: original.viewport.clone(),
    scissor: original.scissor.clone(),
  };
  const fake = {
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.face,
    getActiveMipmapLevel: () => state.mip,
    getViewport: (v: Vector4) => v.copy(state.viewport),
    getScissor: (v: Vector4) => v.copy(state.scissor),
    getScissorTest: () => state.clipping,
    setRenderTarget: (target: any, face = 0, mip = 0) => {
      state.target = target;
      state.face = face;
      state.mip = mip;
    },
    setViewport: (v: Vector4) => {
      state.viewport.copy(v);
    },
    setScissor: (v: Vector4) => {
      state.scissor.copy(v);
    },
    setScissorTest: (v: boolean) => {
      state.clipping = v;
    },
  };
  return { original, state, fake };
}
test("nested scopes restore their immediate owner before the outer scope unwinds", () => {
  const { original, state, fake } = scopedDevice();
  renderTargetScope(fake as any, () => {
    fake.setRenderTarget({ id: "outer" }, 1, 1);
    fake.setViewport(new Vector4(2, 4, 6, 8));
    const outer = {
      ...state,
      viewport: state.viewport.clone(),
      scissor: state.scissor.clone(),
    };
    renderTargetScope(fake as any, () => {
      fake.setRenderTarget({ id: "inner" });
      fake.setScissor(new Vector4());
    });
    expect(state).toEqual(outer);
  });
  expect(state).toEqual(original);
});
test("async read restores immediately and never overwrites intervening work on resolution", async () => {
  const { original, state, fake } = scopedDevice();
  const buffer = new Float32Array(4);
  let resolve!: (value: unknown) => void;
  const device = {
    ...fake,
    readRenderTargetPixelsAsync: (...args: any[]) => {
      expect(state.target).toBeNull();
      expect(state.clipping).toBe(false);
      expect(args[5]).toBe(buffer);
      expect(args[7]).toBe(2);
      return new Promise((r) => {
        resolve = r;
      });
    },
  };
  const pending = readFloatTargetScoped(
    device as any,
    { id: "float" } as any,
    1,
    1,
    buffer,
    2,
  );
  expect(state).toEqual(original);
  fake.setRenderTarget({ id: "next-frame" }, 0, 0);
  resolve(buffer);
  expect(await pending).toBe(buffer);
  expect(state.target.id).toBe("next-frame");
});
test("async submission failures, rejections and wrong buffers do not leak state", async () => {
  for (const failure of ["throw", "reject", "buffer"]) {
    const { original, state, fake } = scopedDevice();
    const device = {
      ...fake,
      readRenderTargetPixelsAsync: () => {
        expect(state.target).toBeNull();
        if (failure === "throw") throw Error("submission failed");
        return failure === "reject"
          ? Promise.reject(Error("read failed"))
          : Promise.resolve(new Float32Array(4));
      },
    };
    const run = () =>
      readFloatTargetScoped(
        device as any,
        {} as any,
        1,
        1,
        new Float32Array(4),
      );
    if (failure === "throw") expect(run).toThrow("submission failed");
    else
      await expect(run()).rejects.toThrow(
        failure === "reject" ? "read failed" : "did not return its buffer",
      );
    expect(state).toEqual(original);
  }
});
