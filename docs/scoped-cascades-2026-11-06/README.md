# Scoped CSM candidate

This internal candidate wraps installed Three's CSM fitting, split and shader
algorithm. It is not exported from the package entrypoint or adopted by the game.
The constructor's global shader injection is disabled by subclassing its actual
method. Only explicitly bound materials receive inline CSM chunks and uniforms;
existing compilation hooks and cache keys are composed, and teardown restores
owned hooks, removes lights/targets and disposes allocated shadow maps. No frame
loop is installed. Splits are copied, bounded to four, and checked against the
camera; resolution is restricted to powers of two from 128 through 2048.

Caller requirements: bind all lit receiver materials, use no competing directional
lights in that render, and explicitly schedule camera fitting and map refreshes.
This is a single-main-camera candidate. Reflections, moving-camera refresh,
transparent/custom shader receivers, and real-world cost remain qualification
requirements. It must not be adopted simply because this fixture passes.

`bun run check:package`: 84 tests, 168162 assertions, build and existing Node ESM
consumer checks pass. Three global shader chunks remain unchanged, foreign hooks
survive teardown, duplicate owners reject, invalid splits allocate no lights, and
both shadow maps are disposed exactly once.

`bun scripts/verify-scoped-cascades.cjs` exercises actual WebGL shaders, standard
and thin-foliage materials, object motion, exact restoration and teardown. Repeat
with `CASCADE_THREE_ROOT=/path/to/three` for the game version. Sequential bounded
SwiftShader at 128² is used; no screenshot files are retained. Reports for r186
and r187 record no console/page/GL errors, exact restoration, a visible foliage
transmission difference, zero remaining geometries and at most the renderer's
one retained physical-material LUT texture. This is shader/lifetime evidence,
not a hardware performance or artistic-quality measurement.

For splits 16/96 m at aspect 1, the fitted widths are 27.192/163.151 m. Full-world
aspect ratio and visibility affect these values and caster submissions. The
scoped adapter does not change or copy Three's cascade fitting algorithm.
