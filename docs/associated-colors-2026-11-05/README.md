# Associated foliage color candidate

Unpublished rendering 0.8.0 development candidate. Includes the pending 0.7.0 APIs;
no game runtime adoption or npm publication yet. Keep the qualified 0.7.0 archive
until this successor completes archive, compatibility and independent-build checks.

The actual pine investigation in Hello World found invisible dark RGB entering
ordinary needle mip reduction. These APIs reduce straight RGB with original alpha
weights in linear light, then associate stored RGB with the stored alpha. A composed
Three map hook unassociates the filtered color before ordinary lighting. Alpha,
alpha test, blend policy and vertex color are not changed by that hook.

CPU controls cover hidden-color invariance, linear-light averaging, fractional
alpha, odd-size edge participation, ownership and hard bounds. Material controls
cover prior-hook composition, idempotency, shader-shape rejection and program
invalidation. The initial test caught missing needsUpdate; the implementation now
invalidates previously compiled materials. All 35 package tests subsequently pass.

The bounded 4px SwiftShader fixture filters a red opaque pixel against four
transparent colors through an actual MeshBasicMaterial. All readbacks are red,
alpha 128; disposal returns texture and geometry counts to zero, with no GL/page
errors. The first fixture incorrectly expected raw alpha from an opaque material:
Three forces opaque output alpha to one. The corrected fixture explicitly uses
transparent=true with NoBlending to observe raw alpha, without framebuffer mixing.
This is a fixture correction, not a runtime transparency-policy change.

Pending: more filtering/coverage/precision controls, actual asset byte comparisons,
Three peer-version compatibility, exact-archive consumer and reproducible builds.
No hardware FPS or complete forest-quality acceptance is claimed.

## Follow-up qualification

36 tests now pass on both Three 0.186.1 and 0.187.0. Exhaustive 65,536
one-dimensional byte-alpha pairs protect half-tie rounding. The real 256x512 pine
texture initially exposed normalized-alpha floating-point rounding drift; summing
alpha in byte units fixes it. Both complete 699,052-byte control and corrected
chains now match the prior game candidate exactly, including all alpha bytes.

Eight GPU reads per Three version cover four hidden colors with bilinear sampling
and an explicitly selected prepared mip. Shader-sample replacement is counted to
prevent accidentally testing the base level twice. No GL/page errors occur;
textures and geometries return to zero. The exact archive passes Node ESM loading,
these eight color reads, nine existing prepared-mip reads and three disposal cycles.
Independent builds match all 20 shipped JS/declaration files. Local npm pack first
hit a read-only default cache; using the repository cache succeeded without auth.
The exact archive identity is in archive.json. No release was published.
