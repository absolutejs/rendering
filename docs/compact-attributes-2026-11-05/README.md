# Explicit compact float attributes — 0.13.0 candidate

This is an unpublished canonical package addition. The separately qualified 0.12.0
archive remains queued and unchanged; do not substitute a current-worktree pack for
that archive. No game dependency or runtime assets have adopted this candidate.

`createCompactFloatAttribute(source, itemSize, { encoding, maximumAbsoluteError })`
returns an owned Three attribute and measured scalar-error/byte audit. It accepts
finite Float32 data, one to four components per item, and at most 4,194,304 scalar
components. Shared or detached storage is rejected. Float32 subviews are copied
without retaining or transferring their backing allocation. Neither input bytes nor
any geometry or renderer are modified.

`snorm16` accepts [-1,1] and returns normalized Int16 storage. `float16` accepts the
finite half-float range and returns Float16BufferAttribute with encoded Uint16 bits.
The caller supplies an explicit absolute component-error limit; out-of-range values
and errors over that limit reject without clamping. This is a component bound, not
an angular, texture-sampling or final-image bound. The caller decides which attributes
are suitable. In the sapling study, positions, indices and leaf ownership stay exact;
normal, UV and color storage is compacted. Colors above one remain representable.

Use this offline or during bounded preparation before geometry upload. Attaching or
replacing attributes on already-uploaded geometry has separate Three ownership and
GPU disposal implications that this function does not manage. Output lifetime
belongs to its eventual geometry owner. No frame callback, renderer patch, automatic
LOD, buffer transfer or asset serialization format is installed.

CPU readers must use getX/Y/Z/W on half-float attributes or explicitly decode raw
bits. The installed Three classes store encoded Uint16 data; their generic inherited
getComponent/raw-array behavior must not be assumed equivalent to those typed
accessors. General geometry serializers and algorithms are not qualified here.

Evidence: 72 package tests / 1,341 assertions, package build and Node ESM consumer
pass. Four 32×32 float-target controls per Three version compare normalized normals,
half-float UVs, HDR colors and their combination against Float32. Both 0.186.1 and
0.187.0 report maximum linear-channel error 0.000597835, identical coverage, exact
source restoration, zero GL/page errors and zero resident geometry/texture/program
owners after disposal. These are format/interpolation checks, not forest-material
acceptance or hardware timing. An initial harness used the async read helper with
the wrong signature; focused TypeScript and the corrected synchronous scoped
readback now pass. No failing result was accepted as qualification.

The game's exact four sapling shapes save 1,556,172 bytes (at least 32.656%) across
geometry attribute/index storage. No positions, triangles, roots or owner IDs change.
Full material and scene comparisons, release-archive checks and adoption remain.

Primary references, checked against installed Three 0.187 source:

- [Three Float16BufferAttribute](https://threejs.org/docs/pages/Float16BufferAttribute.html)
- [Three BufferAttribute normalization](https://threejs.org/docs/pages/BufferAttribute.html)
- [Khronos WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/)

The implementation uses public Three attribute types and DataUtils rather than
modifying renderer internals. The sample conversion is reusable builder machinery;
species, placement, error policies and visual acceptance remain game decisions.
