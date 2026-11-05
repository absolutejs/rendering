/** Bounded offline/setup-time coverage measurement, including clamp-to-edge texels.
 * Four samples per axis approximate bilinear-filtered alpha testing. */
export function alphaCoverage(
  alpha: Uint8Array,
  width: number,
  height: number,
  cutoff: number,
) {
  if (
    !(alpha instanceof Uint8Array) ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 262144 ||
    alpha.length !== width * height ||
    !Number.isFinite(cutoff) ||
    cutoff <= 0 ||
    cutoff >= 1
  )
    throw Error("Invalid alpha coverage input");
  let covered = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4 - 0.5,
            py = y + (sy + 0.5) / 4 - 0.5,
            ix = Math.floor(px),
            iy = Math.floor(py),
            fx = px - ix,
            fy = py - iy;
          const x0 = Math.max(0, ix),
            x1 = Math.min(width - 1, ix + 1),
            y0 = Math.max(0, iy),
            y1 = Math.min(height - 1, iy + 1);
          const a =
            alpha[y0 * width + x0]! * (1 - fx) * (1 - fy) +
            alpha[y0 * width + x1]! * fx * (1 - fy) +
            alpha[y1 * width + x0]! * (1 - fx) * fy +
            alpha[y1 * width + x1]! * fx * fy;
          if (a > cutoff * 255) covered++;
        }
  return covered / (width * height * 16);
}
/** Quantized bounded bisection. Keeps the original if no candidate improves it.
 * Does not promise exact coverage, especially for one-pixel/constant mip tails. */
export function scaleAlphaCoverage(
  alpha: Uint8Array,
  width: number,
  height: number,
  cutoff: number,
  target: number,
) {
  if (!Number.isFinite(target) || target < 0 || target > 1)
    throw Error("Invalid coverage target");
  const original = alphaCoverage(alpha, width, height, cutoff);
  let bestScale = 1,
    bestCoverage = original,
    best = alpha.slice(),
    lo = 0,
    hi = 4,
    scale = 1;
  for (let step = 0; step < 12; step++) {
    const candidate = Uint8Array.from(alpha, (a) =>
      Math.min(255, Math.round(a * scale)),
    );
    const coverage = alphaCoverage(candidate, width, height, cutoff);
    if (Math.abs(coverage - target) < Math.abs(bestCoverage - target)) {
      best = candidate;
      bestCoverage = coverage;
      bestScale = scale;
    }
    if (coverage < target) lo = scale;
    else if (coverage > target) hi = scale;
    else break;
    scale = (lo + hi) / 2;
  }
  return {
    alpha: best,
    scale: bestScale,
    coverage: bestCoverage,
    originalCoverage: original,
    target,
  };
}
