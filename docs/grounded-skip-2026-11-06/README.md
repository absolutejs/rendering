# Skip inactive local-volume sampling

The full application qualification showed that most fragments lie outside the
finite 16m canopy field, but the initial shader still performed all seven volume
samples plus the ground sample before multiplying by zero attenuation weight.

The canonical shader now computes the enabled/horizontal weight first. Zero
weight skips all field texture reads. Inside the footprint, one ground lookup
establishes relative height; zero vertical weight skips all seven coefficient
reads. The visibility helper returns baseline light before touching uninitialized
coefficients on those paths. Existing weight multiplication order is retained,
and the material program key advances to `grounded-sh9-2`.

Both supported Three versions pass 169 software GPU controls. Every pixel in
those controls is identical to the preceding shader, including disabled, outside,
vertical-boundary, batched, dark-reference and rectangular-grid cases. This shows
unchanged output, not an actual count of executed GPU instructions or a hardware
FPS improvement. Driver compilation and divergent fragment groups affect cost.

The full application off/on/off images are byte-identical to the preceding
shader. The exact replacement archive repeats that result, including packaged
worker queries and material ownership. Both runs leave zero owned field bytes,
material bindings and live workers after addon disposal. See the game's
`docs/forest-live-world-skip-2026-11-06/` and
`docs/forest-live-world-archive-2026-11-06/`.

The consolidated 0.15.0 archive passes 106 tests / 177,633 assertions, Node ESM
consumers and both 169-case browser matrices. Two independent builds and archive
contents match all 46 emitted files. `archive.json` records its exact identity.
The superseded, never-published 0.15.0 archive and temporary build/extracted copies
are removed; `cleanup.json` retains their identities. Only the new pending archive
remains. Publication still waits for the user's return; no npm prompt was opened.
