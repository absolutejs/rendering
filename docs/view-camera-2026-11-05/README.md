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
