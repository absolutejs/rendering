import { BufferAttribute, DataUtils, Float16BufferAttribute } from "three";
export type CompactAttributeEncoding = "snorm16" | "float16";
/** Offline, explicit attribute encoding with a caller-selected absolute error
 * limit. Source data stays unchanged; output owns new storage. No GPU upload,
 * geometry mutation, position quantization policy or frame callback is installed.
 * CPU consumers must use the attribute's typed accessors (getX/Y/Z/W), not raw
 * array values. Float16 raw arrays contain encoded bits, not numeric components. */
export function createCompactFloatAttribute(
  source: Float32Array,
  itemSize: number,
  options: { encoding: CompactAttributeEncoding; maximumAbsoluteError: number },
) {
  if (
    !(source instanceof Float32Array) ||
    !(source.buffer instanceof ArrayBuffer) ||
    source.length < 1 ||
    source.length > 4 * 1024 * 1024 ||
    !Number.isSafeInteger(itemSize) ||
    itemSize < 1 ||
    itemSize > 4 ||
    source.length % itemSize ||
    !options ||
    !["snorm16", "float16"].includes(options.encoding) ||
    !Number.isFinite(options.maximumAbsoluteError) ||
    options.maximumAbsoluteError < 0 ||
    options.maximumAbsoluteError > 1
  )
    throw Error("Invalid compact attribute input or error policy");
  const encoded =
    options.encoding === "snorm16"
      ? new Int16Array(source.length)
      : new Uint16Array(source.length);
  let maximumError = 0,
    squaredError = 0;
  for (let i = 0; i < source.length; i++) {
    const value = source[i]!;
    if (
      !Number.isFinite(value) ||
      Math.abs(value) > (options.encoding === "snorm16" ? 1 : 65504)
    )
      throw Error("Compact attribute value outside finite encoding range");
    const bits =
      options.encoding === "snorm16"
        ? Math.round(value * 32767)
        : DataUtils.toHalfFloat(value);
    const decoded =
      options.encoding === "snorm16"
        ? bits / 32767
        : DataUtils.fromHalfFloat(bits);
    const error = Math.abs(value - decoded);
    if (error > options.maximumAbsoluteError)
      throw Error("Compact attribute error budget exceeded");
    encoded[i] = bits;
    maximumError = Math.max(maximumError, error);
    squaredError += error * error;
  }
  const attribute =
    options.encoding === "snorm16"
      ? new BufferAttribute(encoded, itemSize, true)
      : new Float16BufferAttribute(encoded as Uint16Array, itemSize, false);
  return {
    attribute,
    audit: {
      encoding: options.encoding,
      itemSize,
      count: source.length / itemSize,
      components: source.length,
      inputBytes: source.byteLength,
      outputBytes: attribute.array.byteLength,
      maximumAbsoluteError: maximumError,
      rmsError: Math.sqrt(squaredError / source.length),
      errorLimit: options.maximumAbsoluteError,
    },
  };
}
