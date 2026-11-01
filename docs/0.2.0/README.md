# Scoped capture release 0.2.0

Extract the already-used game render-target scope and neutral-target readback
helpers into the canonical rendering package. The helpers restore target, cube
face, mip, viewport, scissor and clipping synchronously. Async float readback
restores at submission, never after await. No shader, physics, format selection,
sampling policy or capture budget changes are included.

11 tests / 64 assertions pass. Two independent source builds produce identical
JavaScript and declarations. Built and exact-archive public exports resolve.
The browser still passes all 192 coverage draws and stable program-cache checks.
Additional actual GPU checks prove a red render/read can be followed immediately
by a green draw into the same single- or four-sample target without stale red
samples returning. Async blue float readback preserves both multisample and cube
face 4 caller targets while subsequent green draws proceed. Thrown capture work
restores the selected cube face, viewport and scissor-test state. No GL errors,
browser errors, or retained geometry/texture allocations occur.

All browsers use bounded SwiftShader. Hardware timing is not claimed. These
checks are renderer-resource lifecycle evidence, not whole-world water acceptance.
Source and the exact archive must be backed up before npm publication; game
adoption must use the verified public release, not a local dependency patch.
