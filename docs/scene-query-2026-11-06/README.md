# Immutable scene-bound index and upstream query upgrade

The new visibility owner reuses `three-mesh-bvh@0.9.18` ObjectBVH. The previous
0.8.3 peer did not provide that scene-level query. Existing 92 package tests pass
before adding the owner. The MeshBVH constructor now uses the supported
`targetLeafSize` option instead of its deprecated alias.

The owner's exact source bounds remain double precision. Its private CPU proxy
bounds are rounded outward to representable Float32 values before constructing
an immutable hierarchy. Identity transforms preserve those values. This repairs
the captured grazing-ray exclusion without a per-query geometric tolerance and
without accepting false final candidates. No mutable refit is exposed; changed
geometry requires a replacement revision/owner. Local origins keep large-world
coordinates out of the compact hierarchy. Work budgets include node and exact
leaf tests; callback bookkeeping is measured separately.

The package passes 100 tests / 177,565 assertions, built Node ESM consumers and
real module-worker controls on Three 0.186.1 and 0.187.0. Tests cover the captured
inward-rounded grazing face, exact finite/zero-length segments, tiny coordinates,
scaled/subnormal directions, far-world origins, copied input, unique IDs,
invalid inputs, exhaustion, idempotent disposal and 512 independent ray-box cases.
The browser worker checks both scene candidates and actual alpha/deformed queries,
probe cancellation and transferable masks. No WebGL context or native GPU is used.

Hello World's canonical fixture matches 8,646 independent scalar-oracle rays,
624 finite-range controls and five bounded query controls across changed,
removed, reordered and translated forests. Package owners are replaced on those
changes; the upstream-only study's mutable refit is not the public API contract.

The actual 429-tree generated alpha-field comparison exercises 51,520 queries.
The new linear and indexed paths have identical status-sequence hashes, triangle
and alpha tests, lighting samples, reference/holdout comparisons and tree-removal
results. Indexed bounds tests are 7,723,138 versus 26,645,485 for linear checking;
broad-phase tests are 3,179,669 versus 22,102,016. Lighting/removal values also
match the saved 0.8.3 study. One-run elapsed observations (8.16s / 7.92s) do not
support a substantial runtime or FPS speedup claim; triangle/alpha work remains.

Game evidence lives in `hello-world/docs/forest-instance-index-2026-11-06/`.
The game remains on its published rendering package. This candidate does not
publish a live lighting field, provide worker residency/streaming, or establish
hardware performance. Production adoption must resolve the new optional peer
explicitly; Drei's own 0.8.x dependency must remain independently satisfied.

The qualified 0.13 archive is a distinct immutable artifact until the new release
has its own exact-archive qualification. No authentication prompt should be opened
while the user is away. Do not patch installed dependencies or relabel old archives.
