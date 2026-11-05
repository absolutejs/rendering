import {
  DataTexture,
  Texture,
  TextureSource,
  RGBAFormat,
  UnsignedByteType,
  LinearMipmapLinearFilter,
} from "three";
export type PreparedMipLevel = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
};
/** Own the texture and level descriptors, borrow immutable RGBA8 bytes. Source
 * pixels, texture source and sampler/UV state are never mutated. This validates
 * layout, not asset authenticity or the quality of a coverage-correction policy.
 * Callers verify content identity before entry and dispose the returned texture. */
export function createPreparedMipTexture(
  source: Texture,
  levels: readonly PreparedMipLevel[],
  maximumBytes = 16 * 1024 * 1024,
): DataTexture {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 4 ||
    maximumBytes > 64 * 1024 * 1024
  )
    throw Error("Invalid mip byte budget");
  const flags = source as unknown as Record<string, unknown>;
  if (
    !source?.isTexture ||
    source.format !== RGBAFormat ||
    source.type !== UnsignedByteType ||
    [
      "isCubeTexture",
      "isDataArrayTexture",
      "isData3DTexture",
      "isCompressedTexture",
      "isVideoTexture",
      "isRenderTargetTexture",
      "isFramebufferTexture",
    ].some((k) => flags[k])
  )
    throw Error("Prepared mips require an ordinary RGBA8 2D texture");
  const image = source.image as { width?: number; height?: number } | undefined;
  if (!Array.isArray(levels) || levels.length < 1 || levels.length > 15)
    throw Error("Invalid mip level count");
  let bytes = 0,
    retainedBytes = 0;
  const buffers = new Set<ArrayBufferLike>();
  const mips = levels.map((level, i) => {
    const previous = levels[i - 1];
    if (
      !level ||
      !Number.isSafeInteger(level.width) ||
      !Number.isSafeInteger(level.height) ||
      level.width < 1 ||
      level.height < 1 ||
      !(level.data instanceof Uint8Array) ||
      level.width * level.height * 4 !== level.data.byteLength ||
      level.data.buffer.byteLength > maximumBytes ||
      (previous &&
        ((previous.width === 1 && previous.height === 1) ||
          level.width !== Math.max(1, Math.floor(previous.width / 2)) ||
          level.height !== Math.max(1, Math.floor(previous.height / 2))))
    )
      throw Error("Invalid mip level layout");
    if (!buffers.has(level.data.buffer)) {
      buffers.add(level.data.buffer);
      retainedBytes += level.data.buffer.byteLength;
      if (retainedBytes > maximumBytes)
        throw Error("Borrowed mip buffers exceed byte budget");
    }
    bytes += level.data.byteLength;
    if (bytes > maximumBytes) throw Error("Mip chain exceeds byte budget");
    return { width: level.width, height: level.height, data: level.data };
  });
  const first = mips[0]!,
    last = mips.at(-1)!;
  if (
    first.width !== image?.width ||
    first.height !== image?.height ||
    last.width !== 1 ||
    last.height !== 1
  )
    throw Error("Incomplete or mismatched mip chain");
  const texture = new DataTexture();
  Texture.prototype.copy.call(texture, source);
  texture.source = new TextureSource(first);
  texture.mipmaps = mips;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}
