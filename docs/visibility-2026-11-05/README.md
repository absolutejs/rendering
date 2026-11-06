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

## Shared deformation extension

The source BVH now accepts conservative transformed boxes and transformed triangle
vertices. UV interpolation uses the transformed triangle with original UV/index
ownership. Two additional regression tests cover nonlinear deformation versus
rebuilt geometry and callback failure recovery, including same-owner reentrancy
and disposal. The package passes 58 tests / 1,062 assertions and builds cleanly.
Both Three browser-worker controls now cover translated queries and recovery after
a point callback throws. Their reports replace the previous worker-only receipts.

The underlying BVH shapecast uses shared scratch stacks without exception cleanup;
callbacks therefore capture failures, finish unwinding traversal, then rethrow.
Allowing a callback exception to escape directly would corrupt later traversal.

The game qualified 32 actual-canopy/phenotype combinations: 36,864 shared queries
agree with baked geometry and 256 selected rays agree with independent triangle
scans. Includes extreme scale, width, crown and lean, arbitrary yaw and translation.
Game interval bounds include nonlinear interior extrema. Shared owners retain
13,205,184 bytes across eight sources irrespective of variant count. This is
correctness evidence, not a speed win: the deliberately allocation-heavy game
fixture totals about 2.52 seconds shared queries versus 0.245 seconds baked queries
on this CPU. Production scheduling, spatial candidates, overlap, wind, edits and
local lighting-field quality remain open. No game dependency or live shader changes.

## Incremental integration

`HemisphereVisibilityProbe` adds bounded ray batches without a scheduling framework.
The host can yield between steps, cancel jobs and compare the captured revision
before accepting results. Clear, blocked, unfinished and budget-exhausted rays are
kept distinct. Reported lower/upper values bound the chosen discrete cosine-weighted
sample set, not the continuous hemisphere's quadrature error. No result is presented
as complete accessibility when any ray remains unresolved.

Five tests cover constant fields, a known 0.75 cosine integral, batch equivalence,
uncertainty, cancellation, copied origin ownership, callback retry, reentrancy,
malformed inputs and aggregate-budget counter enforcement. Package: 63 tests /
1,240 assertions, TypeScript passes. Both supported Three worker checks run eight
four-ray steps separated by event-loop yields, compare with one batch, and verify
cancelled state. These test in-worker cancellation; host-message cancellation and
a production worker protocol remain integration work.

The actual-canopy fixture additionally checks 24 center probes (eight variants at
three heights) against independently baked scene rays. All 64-ray cosine integrals
agree. A two-bound/two-triangle whole-scene budget produces explicit uncertainty;
every such interval encloses the qualified integral. No live game adoption.

## Indirect diffuse material hook

The base entry point adds `withIndirectDiffuseVisibility`; it does not pull in the
optional BVH entry. Two tests verify exact shader composition, idempotency rejection
and invalid input/marker handling. Package build passes; 65 tests / 1,250 assertions.
The game separately exercises its actual terrain material on both supported Three
versions using an isolated source import. Direct-light output is exactly unchanged;
field sampling and ambient multiplication match their independent numerical controls.
See indirect-terrain.json and the game's forest-sky visibility records. Display and
ideal-pixel-reference failures are preserved in that game record rather than hidden.
No production adoption or package archive qualification is claimed.
