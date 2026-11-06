# Retained visibility samples for sky reweighting

`HemisphereVisibilityProbe.exportSamples()` returns an owned, transferable copy
of the probe's per-ray states. Codes are packed low-to-high, two bits per sample:
0 pending, 1 clear, 2 occluded, 3 budget exhausted. Unused tail bits remain zero.
The descriptor includes revision, state, processed count, sample count and the
versioned `upper-fibonacci-1` distribution. Never treat pending/exhausted codes as
clear, or accept cancelled/stale data as a completed lighting field.

`hemisphereVisibilityDirection(index, samples, target)` regenerates the exact
query direction; each sample covers 2*pi/samples solid angle. The snapshot enables
new sky radiance to be integrated without querying unchanged geometry again. It
is still an upper-world-hemisphere finite ray set, not full-sphere GI or a proof
of continuous quadrature accuracy. RGB sky and leaf orientation are caller-owned.

Masks require ceil(samples/4) bytes: 128 at 512 samples, at most 1,024 at the
4,096-sample limit. Export copies are explicit caller-owned allocations. Existing
scalar snapshots and query budgets remain unchanged. Failed callbacks write no
sample code; cancellation retains already-computed states and releases the trace.

68 tests / 1,292 assertions pass, including exact traced-direction regeneration,
open/blocked/exhausted/pending state packing, tail bits, failed-callback retry,
cancellation, and exported-copy mutation isolation. TypeScript build passes after
making the validated typed-array index access explicit under noUncheckedIndexedAccess.

Both supported Three module-worker controls pass. The exported mask is transferred
to the host; the worker reports its exported buffer detached (0 bytes) while a
second export retains all 8 bytes of the original 32-ray mask. The host verifies
revision, completion and all 32 resolved codes. No native GPU/context was used.
See `browser-mask.json` and `browser-mask-three187.json`.

The game's generated forest comparison reconstructs 27×512 original query results
and integrates three colored skies with zero extra geometry queries and exact RGB
agreement with the captured rays. Retained masks total 3,456 bytes. This is source
qualification for the unpublished 0.12.0 candidate, not production field adoption.
No package archive or screenshots were created in this pass.
