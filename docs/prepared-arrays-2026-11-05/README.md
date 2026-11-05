# Prepared RGBA8 arrays: canonical package qualification

Rendering 0.10.0 adds `createPreparedMipArrayTexture`. It validates complete,
matching RGBA8 layer chains before allocation, copies them into independent owned
mip buffers and retains explicit mips rather than generating them on the GPU.
The API is generic; plant view selection and lighting stay outside this upload API.

The default packed-byte budget is 16 MiB, hard maximum 64 MiB. Layer count is
bounded to 256 and dimensions to 16,384. These bounds do not replace a caller's
actual device capability checks. Color space is either linear data or sRGB color.
Caller ownership ends with texture disposal; input buffers remain untouched.

The Three uploader uses its CompressedArrayTexture RGBAFormat branch for ordinary
uncompressed texSubImage3D mip uploads. The constructor type declaration narrows
formats more than the runtime implementation, so the implementation documents a
single explicit boundary cast. No installed Three files or renderer internals are
patched. DataArrayTexture's installed upload path only writes the base level and
would lose the prepared mip data needed by the game.

## Evidence

- All 42 package tests pass on Three 0.186.1/types 0.186.0 and Three 0.187.0/types
  0.187.0. Tests include existing APIs plus copied ownership, every layer/mip,
  malformed/incomplete layout rejection, aggregate bounds and odd rectangular mips.
- TypeScript builds pass for both supported peer pairs; all 24 emitted files match
  independently. Twenty pre-existing non-index outputs remain byte-identical to
  the qualified 0.9.0 archive. Only the index exports and two new API files differ.
- Source and exact-archive browser checks each perform 100 readbacks and four
  disposal cycles on each Three version. They cover all mip levels, fractional
  LOD, discrete layer selection near half-layer boundaries, linear RGBA and sRGB
  decoding. Inputs remain unchanged; geometry/texture/program counts return to zero.
- Exact-archive Node ESM import and one-pixel array creation/disposal pass.

Browser runs are sequential, bounded SwiftShader only. These are correctness
checks, not native GPU frame-time measurements. No new captures are retained.
The peer qualification checkout is disposable and removed after recording exact
build hashes. The new exact archive remains while release/adoption checks are active.
The old 0.9.0 archive remains temporarily as the game experiments' active baseline;
remove it after those consumers move to this candidate. No npm login/publish is
attempted while the user is away.

## Reproduce

- `bun run check:package`
- `bun scripts/verify-prepared-arrays.cjs`
- Set `ARRAY_MODULE` to an extracted archive's `dist/index.js` for archive testing.
- Set `ARRAY_THREE` to the alternative Three ESM file and `ARRAY_REPORT` to a
  separate evidence path for a peer-version run.

The game prototype already demonstrated four samplers replacing sixteen with
2,688 identical coverage rows and 72 identical images. Adoption of this canonical
API into that isolated prototype remains a separate check; production runtime
still uses published rendering 0.6.0.
