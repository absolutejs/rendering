# Rendering 0.1.0 qualification

This release fixes a reproduced destination mismatch: coverage alpha .25 correctly
resolves to .251 on a four-sample canvas, but the same configured material fills
all pixels in a single-sample capture. Per-draw destination selection preserves
the canvas behavior and activates the existing shader's cutout fallback in that
capture. The helper changes no shader text and keeps per-source preferences.

Six ownership/policy tests (36 assertions), the built ESM consumer, and the packed
public-export consumer pass. Two separate source builds produce identical shipped
JavaScript and declarations; independent-build.json records their hashes.

The self-contained SwiftShader browser fixture checks 192 draws across canvas,
single-sample capture, multisampled target and return-to-canvas, with three alpha
levels, enabled/disabled preferences, source/cloned materials and four repetitions.
All coverage checks pass within one byte. Program counts remain stable after the
first cycle; final geometry and texture counts are zero. See browser-independent/.
No hardware FPS or total scene-cost claim is made.

The tarball named in archive.sha256 is the release input. Source and this exact
archive must be pushed before npm publication. Game adoption uses the published
version, not a local dependency patch. License follows the existing AbsoluteJS
BSL convention. PAAS is untouched.
