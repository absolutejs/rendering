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

Full-world comparison and exact-archive replacement are in progress. The existing
pending 0.15.0 archive predates this optimization and is not evidence for this
source change. Keep its identity until the replacement is independently qualified;
do not publish from an arbitrary current build directory. No new npm prompt is
needed while the user is away.
