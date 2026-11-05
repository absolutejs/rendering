import { DynamicDrawUsage, InstancedBufferAttribute } from "three";

export type InstanceAttributeStream = {
  /** Owned storage. Attach to one owner's geometry; do not mutate the array,
   * update ranges, usage, upload callback or version outside this stream. */
  readonly attribute: InstancedBufferAttribute;
  readonly count: number;
  /** Copy a validated Float32 prefix. Returns changed scalar components.
   * Logical count can change without a GPU upload; caller updates draw count. */
  update(source: Float32Array, count: number): number;
};
/** Fixed-capacity instanced data with bounded dirty-range accumulation. Unchanged
 * prefixes do not increment the attribute version or request GPU uploads.
 * Geometry/mesh disposal owns GPU lifetime; dropping the stream releases CPU
 * ownership. This installs no frame callback, global state or renderer patch. */
export function createInstanceAttributeStream(
  capacity: number,
  itemSize: number,
  maximumBytes = 4 * 1024 * 1024,
): InstanceAttributeStream {
  if (
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    !Number.isSafeInteger(itemSize) ||
    itemSize < 1 ||
    itemSize > 16 ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 4 ||
    maximumBytes > 64 * 1024 * 1024 ||
    capacity * itemSize * 4 > maximumBytes
  )
    throw Error("Invalid bounded instance attribute capacity");
  const data = new Float32Array(capacity * itemSize);
  const attribute = new InstancedBufferAttribute(data, itemSize).setUsage(
    DynamicDrawUsage,
  );
  let count = 0,
    pendingStart = Infinity,
    pendingEnd = 0;
  const range = { start: 0, count: 0 };
  attribute.onUpload(() => {
    pendingStart = Infinity;
    pendingEnd = 0;
    attribute.clearUpdateRanges();
  });
  return {
    attribute,
    get count() {
      return count;
    },
    update(source, nextCount) {
      if (
        !(source instanceof Float32Array) ||
        !(source.buffer instanceof ArrayBuffer) ||
        source.buffer === data.buffer ||
        !Number.isSafeInteger(nextCount) ||
        nextCount < 0 ||
        nextCount > capacity ||
        source.length < nextCount * itemSize
      )
        throw Error("Invalid instance attribute prefix");
      const end = nextCount * itemSize;
      // Validate the complete consumed prefix before changing storage/count.
      for (let i = 0; i < end; i++)
        if (!Number.isFinite(source[i]))
          throw Error("Nonfinite instance attribute component");
      let changed = 0,
        first = end,
        last = 0;
      for (let i = 0; i < end; i++) {
        if (Object.is(data[i], source[i])) continue;
        data[i] = source[i]!;
        changed++;
        first = Math.min(first, i);
        last = i + 1;
      }
      count = nextCount;
      if (changed) {
        pendingStart = Math.min(pendingStart, first);
        pendingEnd = Math.max(pendingEnd, last);
        range.start = pendingStart;
        range.count = pendingEnd - pendingStart;
        attribute.updateRanges.length = 0;
        attribute.updateRanges.push(range);
        attribute.needsUpdate = true;
      }
      return changed;
    },
  };
}
