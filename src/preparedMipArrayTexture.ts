import {
  CompressedArrayTexture,
  RGBAFormat,
  UnsignedByteType,
  NoColorSpace,
  SRGBColorSpace,
  LinearFilter,
  LinearMipmapLinearFilter,
  type CompressedPixelFormat,
} from "three";
import type { PreparedMipLevel } from "./preparedMipTexture.js";
export type PreparedMipArrayOptions = {
  /** Linear data by default; sRGB only for color fields. */
  colorSpace?: typeof NoColorSpace | typeof SRGBColorSpace;
  /** Combined copied mip bytes. Default 16 MiB; hard maximum 64 MiB. */
  maximumBytes?: number;
};
/** Copy complete matching RGBA8 mip chains into an owned texture array.
 * Layers are independent: filtering never crosses a layer boundary. Does not
 * regenerate mips or retain the input buffers. Caller checks device dimensions/
 * layer limits before upload and disposes the returned texture. Despite Three's
 * class name, RGBAFormat uses uncompressed texSubImage3D uploads in supported
 * releases. No renderer internals or installed dependency sources are patched.
 */
export function createPreparedMipArrayTexture(
  layers: readonly (readonly PreparedMipLevel[])[],
  options: PreparedMipArrayOptions = {},
): CompressedArrayTexture {
  const maximumBytes = options.maximumBytes ?? 16 * 1024 * 1024,
    colorSpace = options.colorSpace ?? NoColorSpace;
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 4 ||
    maximumBytes > 64 * 1024 * 1024
  )
    throw Error("Invalid array mip byte budget");
  if (colorSpace !== NoColorSpace && colorSpace !== SRGBColorSpace)
    throw Error("Unsupported array color space");
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > 256)
    throw Error("Invalid array layer count");
  let bytes = 0;
  for (const chain of layers) {
    if (
      !Array.isArray(chain) ||
      chain.length < 1 ||
      chain.length > 15 ||
      chain.length !== layers[0]!.length
    )
      throw Error("Invalid array mip count");
    for (let i = 0; i < chain.length; i++) {
      const level = chain[i],
        reference = layers[0]![i],
        previous = chain[i - 1];
      if (
        !level ||
        !reference ||
        !Number.isSafeInteger(level.width) ||
        !Number.isSafeInteger(level.height) ||
        level.width < 1 ||
        level.height < 1 ||
        level.width > 16384 ||
        level.height > 16384 ||
        !(level.data instanceof Uint8Array) ||
        level.data.byteLength !== level.width * level.height * 4 ||
        level.width !== reference.width ||
        level.height !== reference.height ||
        (previous &&
          ((previous.width === 1 && previous.height === 1) ||
            level.width !== Math.max(1, Math.floor(previous.width / 2)) ||
            level.height !== Math.max(1, Math.floor(previous.height / 2))))
      )
        throw Error("Invalid array mip layout");
      bytes += level.data.byteLength;
      if (bytes > maximumBytes)
        throw Error("Array mip chains exceed byte budget");
    }
    const last = chain.at(-1)!;
    if (last.width !== 1 || last.height !== 1)
      throw Error("Incomplete array mip chain");
  }
  const firstChain: readonly PreparedMipLevel[] = layers[0]!;
  const first = firstChain[0]!;
  const packed = firstChain.map((level, index) => {
    const layerBytes = level.data.byteLength,
      data = new Uint8Array(layerBytes * layers.length);
    for (let layer = 0; layer < layers.length; layer++)
      data.set(layers[layer]![index]!.data, layer * layerBytes);
    return { width: level.width, height: level.height, data };
  });
  // The runtime uploader explicitly accepts RGBAFormat here; Three's declaration
  // currently narrows this constructor to compressed formats. Browser tests cover
  // every explicit mip on both supported releases, including sRGB decoding.
  const texture = new CompressedArrayTexture(
    packed,
    first.width,
    first.height,
    layers.length,
    RGBAFormat as unknown as CompressedPixelFormat,
    UnsignedByteType,
  );
  texture.colorSpace = colorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
