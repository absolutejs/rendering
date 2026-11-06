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

## Reflected-view selector control

`bun scripts/verify-cascade-reflection.cjs` creates main-view maps once, freezes
shadow updates, then renders the same reflected camera with either render-view
depth or depth transformed back to the atlas camera. The matrix is main view
inverse-world × reflected world; only the cascade selector changes. Materials,
lighting, map contents, camera and geometry remain fixed. This is an isolated
shader experiment, not a public adapter option or a production patch.

At the 27.2/96 m split, the selector changes 866 pixels on r186 and 878 on r187
at 192² (maximum channel differences 31/33). Restoring the selector restores every
pixel. The 16/96 m control produces zero differences on both versions for this
fixture. All four controls report zero console/page/GL errors. Run the negative
control with `CASCADE_REFLECTION_SPLIT=16`, and select another Three installation
with `CASCADE_THREE_ROOT`. No image files or per-pixel dumps are retained.

This proves that choosing a different view for cascade selection can change a
rendered reflection even with unchanged maps. It does **not** establish that the
atlas-view selector is correct, or that this fixture represents a defect in the
actual game's water. Both maps can cover some points; different filtering and
resolution also produce differences. The next correctness test must compare
coverage against an independently fitted reflected-view reference and include
points outside the main frustum. Do not adopt a selector rewrite based on these
pixel differences alone. The 16 m negative control is not proof that custom
splits avoid the issue at other viewpoints.

## Ray-validated coverage and rejected workaround

The same fixture now independently ray-tests axis-aligned occluder boxes against
visible points on the receiver wall. It rejects pixels near visibility or shadow
boundaries using a 3×3 neighborhood spanning ±2 pixels. The unshadowed image
provides each receiver's illumination baseline; a greater-than-50% reduction is
classified as shadow. This distinguishes missing/incorrect interior coverage
from PCF edge differences. It also refits separate maps to the reflected view as
an additional rendering reference; that reference is not the ray ground truth.

In the standard control, 2,722 accepted receiver samples include 49 shadowed
samples and 756 outside the main view. All three strategies classify those
interiors correctly. The earlier 866/878 changed pixels therefore do not prove
missing shadows in this fixture; resolution/filter differences remain relevant.

A steep-view control (`CASCADE_REFLECTION_SCENARIO=steep`) looks down from
(0,12,8) and reflects from (0,-12,8) onto a taller wall. Of 3,860 accepted receiver
samples, 103 are shadowed and 1,486 lie outside the main view. On both Three
versions, the normal render-view selector and separately refitted reflection
have zero missing or falsely dark samples. The proposed atlas-view selector
incorrectly darkens 289 lit samples, all outside the main view. In this region
atlas-view depth is behind the main camera and CSM's direct-light selection
excludes every cascade. The shader experiment is rejected as a remedy.

All six standard/steep controls pass their ray-based assertions and restoration
checks with zero browser/GL errors. Focused strict TypeScript checking covers both
browser fixtures. No production shader changes follow from this study. These
controls do not establish universal cached-atlas coverage for arbitrary moving
cameras, terrain, water clipping, or caster arrangements. Retain the original
selector while investigating coverage and refresh policies; do not replace it
merely because reflected and main-view depths differ.
