# Primary view ownership candidate

Experimental additive rendering-package API on work/view-camera. The previously
qualified 0.8.0 archive remains unchanged; this work is not published or installed
in the game. Do not infer a release from package.json while this branch develops.

createViewCameraState owns stable position, direction and orthographic uniform
objects. It reads camera world transforms, including parents, and rejects array,
unsupported and non-finite camera inputs. bindViewCamera composes an owned render
object's render/shadow callbacks and reads the primary-camera argument in both.
Three's light shadow camera is deliberately not used as the viewing camera.
Disposal restores only callbacks still owned; overlapping/partially replaced
bindings reject instead of building ambiguous callback chains. No frame callback,
renderer patch, texture allocation or global scene traversal is introduced.

39 package tests pass. Three CPU cases cover parented transforms, uniform identity,
primary versus light cameras, callback receivers, idempotency and disposal. A
32px SwiftShader fixture performs three actual directional-shadow draws and reads
GPU output carrying the primary-camera uniforms, including perspective movement
and an orthographic camera. All readbacks match within RGBA8 rounding; prior hooks
run exactly three times; GL/browser errors are empty; geometry/textures dispose to
zero. The first standard-material fixture retained one renderer texture; the
unlit main material isolates callback ownership while still executing actual
shadow passes, and returns both counters to zero. This does not certify tree
silhouettes, material appearance or hardware FPS.

The game is now testing this helper with its packed pine alpha/depth shaders.
The shared package release/archive qualification will follow actual-tree evidence.

## Consolidated 0.9.0 release candidate

39 tests pass on Three 0.186 and 0.187; source compilation also passes with matching
0.187 types. Three actual shadow GPU readbacks pass on both versions. Independent
builds match all 22 shipped JS/declaration files. The exact 0.9.0 archive passes
Node ESM exports, the shadow-camera test, eight associated-color reads, nine mip
reads and three full disposal cycles. Its identity is in release-candidate.json.

The actual game checks both pines across eight elevations: all 16 directional
shadow draws carry the primary view; all prior aligned/diagonal/wind rows remain
exact after fixing a temporary-light-target restoration issue in the fixture.
Each species additionally passes an exact pixel comparison of one three-instance
GPU-angle draw against three independently computed CPU-angle reference draws.
Three distinct view mixes (0.0042, 0.5, 0.9626) coexist in one draw, with the same
102 triangles and zero mismatching bytes. These are rendering contracts, not a
whole-world artistic or hardware FPS claim.

Registry inspection confirms published latest is still 0.6.0. An initial Python
lookup stalled in network resolution and was explicitly terminated; a hard-bounded
curl lookup completed. No npm login or publish attempt occurred. 0.9.0 supersedes
the unpublished 0.7/0.8 candidates so only one release needs confirmation. Old
archives and independent/peer build copies are removed. One active 0.9.0 archive
and its consumer remain for ongoing isolated game qualification.
