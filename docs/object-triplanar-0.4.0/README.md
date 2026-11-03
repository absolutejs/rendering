# Rendering 0.4.0 release qualification

This release adds `createObjectTriplanarMaterial` for opaque rigid static meshes
and Three-compatible, non-sheared instances. The material keeps Standard lighting
and projects albedo, normal and roughness maps in geometry-local coordinates.
It rejects unsupported deformation and cutout modes instead of silently producing
incorrect normals or shadow coverage. See the package README for ownership and
mapping scope.

Qualification uses Bun 1.4.4+absolute.1 and Three 0.186.1. All 18 package tests,
the strict Spring consumer type check and built ESM consumer pass. A clean detached
checkout produces identical bytes for all eight distribution files. The four
Spring/capture files are unchanged from published 0.3.0.

The exact archive passes 15 bounded SwiftShader pixel controls, including corrupted
UV independence, rigid-motion anchoring, nonuniform instance normals, neutral
normal preservation, six signed-axis gradients, packed normals, roughness channel
selection and color-space conversion. Existing coverage checks pass 192 draws,
stable program counts and complete tracked geometry/texture disposal. The exact
archive Spring entry preserves the isolated scheduling behavior in the browser.
See archive-audit.json for checksums and the remaining logs/results for evidence.

The actual game candidate comparison is backed up in hello-world at f9713094,
under docs/stone-triplanar-2026-11-03. It exercises the generated pair workshop,
cancellation, atomic persistence, replay, inspection and reload, and positively
checks both stones use the candidate shader. Production adoption remains gated on
registry verification; the game currently uses published rendering 0.3.0.

Tradeoff: with all three maps this adds three projections per map (nine fetches
instead of three), but no geometry, assets, render passes or draw calls. These
software-rendered checks do not establish hardware frame rate. This upgrade fixes
UV stretching; it does not improve silhouettes, source scans or biome selection.
