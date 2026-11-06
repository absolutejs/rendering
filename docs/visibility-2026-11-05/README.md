# Prepared cutout visibility candidate

The canonical rendering package adds an optional `/visibility` entry point using
three-mesh-bvh 0.8.3. Eight new tests cover transparent-first/opaque-second hits,
base-level bilinear cutoff and wrapping, two-sided queries, finite segments,
inside-box traversal, BVH index reordering, immutable ownership, disposal,
malformed inputs and explicit unresolved work budgets. The whole package passes
56 tests / 732 assertions. TypeScript builds successfully.

Separate real browser module-worker checks pass against Three 0.186.1 and 0.187.0.
They verify transparent traversal, opaque hits, finite range, budget exhaustion,
source ownership and released storage. Workers are terminated after results. No
WebGL context, native GPU run or frame-rate claim is involved. The initial blob
worker failed startup with an empty error; its rejection is retained. Same-origin
HTTP delivery works, matching the application worker delivery mechanism.

The game separately qualified its original forest-v8 canopy inputs: 9,216 rays,
zero exhausted queries, and 128 independent original-index triangle scans agree.
Solid cards overestimate obstruction relative to authored alpha. Full game-side
receipts are in hello-world/docs/forest-sky-visibility-2026-11-05. These source trees
are unwarped and isolated; this is not acceptance of scene lighting or a runtime
adoption. Query storage is roughly 1.18–1.87 MB per source owner in that fixture.

Node/Bun tests show the upstream 0.8.3 CommonJS entry's Three deprecation warning.
The browser bundle resolves the module entry and passes in a worker. No installed
dependency is patched. Package 0.12.0 remains an unpublished candidate: archive
consumer checks, independent build comparison and scene/deformation qualification
are still required. Do not publish it merely because these focused tests pass.
The preceding qualified 0.11.0 archive remains intact pending release planning.
