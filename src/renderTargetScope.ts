import { Vector4, type WebGLRenderer } from "three";
/** Synchronous offscreen work; preserve target attachment, viewport and clipping.
 * The callback must finish its renderer mutations before returning.
 */
export function renderTargetScope<T>(renderer: WebGLRenderer, run: () => T): T {
  const target = renderer.getRenderTarget(),
    face = renderer.getActiveCubeFace(),
    mip = renderer.getActiveMipmapLevel();
  const viewport = renderer.getViewport(new Vector4()),
    scissor = renderer.getScissor(new Vector4()),
    test = renderer.getScissorTest();
  try {
    renderer.setScissorTest(false);
    return run();
  } finally {
    renderer.setRenderTarget(target, face, mip);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(test);
  }
}

/** Start an async float diagnostic with a neutral current target, then immediately
 * restore the caller's attachment. Three's async reader restores a raw framebuffer
 * property before awaiting; cube/mipmap targets store arrays in that property.
 * Keeping the neutral target only for submission avoids that invalid bind without
 * holding renderer state across the asynchronous wait.
 */
export function readFloatTargetScoped(
  renderer: WebGLRenderer,
  target: import("three").WebGLRenderTarget,
  width: number,
  height: number,
  buffer: Float32Array,
  textureIndex = 0,
): Promise<Float32Array> {
  let pending: Promise<unknown> | undefined;
  renderTargetScope(renderer, () => {
    renderer.setRenderTarget(null);
    pending = renderer.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      width,
      height,
      buffer,
      undefined,
      textureIndex,
    );
  });
  return pending!.then((value) => {
    if (value !== buffer)
      throw new Error("Float target read did not return its buffer");
    return buffer;
  });
}

/** Synchronous authoring/diagnostic read. Three restores the raw resolve
 * framebuffer, not a current target's multisample attachment, after reading.
 * Submit from a neutral target and let setRenderTarget restore the actual
 * attachment; otherwise the next draw can resolve stale samples over new data.
 * This also avoids restoring cube/mip framebuffer arrays as a framebuffer. */
export function readTargetPixelsScoped(
  renderer: WebGLRenderer,
  target: import("three").WebGLRenderTarget,
  width: number,
  height: number,
  buffer: Uint8Array | Float32Array,
  textureIndex = 0,
): void {
  renderTargetScope(renderer, () => {
    renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(
      target,
      0,
      0,
      width,
      height,
      buffer,
      undefined,
      textureIndex,
    );
  });
}
