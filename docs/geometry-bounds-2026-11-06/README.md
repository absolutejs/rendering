# Shared deformation bounds leases — unpublished candidate

`leaseGeometryBounds(geometry, {x,y,z})` owns symmetric local-space culling
padding around immutable source bounds. Multiple leases combine componentwise
maximum padding rather than repeatedly expanding an already-expanded box.
`update` validates before mutating state, `release` is idempotent, and `active`
reports whether the lease has ended. There are at most 64 leases per geometry;
padding components are finite, nonnegative and at most 1e6 local units. Empty,
nonfinite or overflowing source bounds reject without replacing original bounds.

The first owner preserves original box/sphere object references (including null),
computes a source box when needed, and installs owned conservative bounds. Last
release restores the original references while still owned. Geometry disposal
ends every lease and removes the listener; the helper never disposes borrowed GPU
geometry itself. Replacing either bounds object externally relinquishes ownership
on the next update/release without overwriting that replacement. In-place edits
of owned bounds and changes to source positions are outside this contract.

This is a geometry-bound lifetime primitive, not a scene registry, culling engine,
wind scheduler or asset residency manager. A caller still releases leases when
objects leave its active set and owns geometry disposal. The package holds states
in a WeakMap, and each state has a bounded owner map. Leases held by callers remain
ordinary references until callers release/drop them.

## Qualification

`bun run check:package`: 90 tests / 176,989 assertions, build and existing Node ESM
consumer checks pass. Four bounds tests cover merging/shrinking, original identity
restoration, disposal, invalid atomic updates/source ranges, the 64-owner bound,
and foreign ownership. No production package adoption or release is claimed.

`bun scripts/verify-geometry-bounds.cjs` uses bounded sequential SwiftShader.
A shader-displaced plane is outside its undeformed frustum bounds: baseline has
zero pixels/draws. Padding makes its 36 pixels visible in one draw. A second lease
and releasing the first preserve that result; releasing the last restores zero
pixels/draws and the exact original bound references. Disposal ends a remaining
lease and all owned GPU geometry/texture counts return to zero. Three r186 and
r187 both pass with no page/console/GL errors. Use `CASCADE_THREE_ROOT` to select
the alternate installed Three runtime. No screenshots or archives are retained.
