# Coalesced cached-render invalidation

`createCoalescedInvalidation({ minimumIntervalMs, invalidate, clock? })` owns
one immediate-or-trailing refresh request stream. Use one instance per cached
render product, such as the shared sun shadow map. It does not draw, traverse a
scene or install an animation loop. Read current state in the callback rather
than capturing a pose from the first request.

The first request emits immediately. Further requests within the configured
interval coalesce behind one timer, which emits the latest state even when the
animation clock subsequently pauses. Idle owners have no timer. Late timers emit
once rather than replaying missed intervals. Early timers rearm. `dispose()`
cancels pending work and invalidates stale callbacks; subsequent requests return
false. Emission failures are counted and propagated, without an automatic retry
loop. A subsequent request may recover at the normal rate.

The clock must be monotonic, finite and asynchronous when scheduling. The default
uses `performance.now`, `setTimeout` and `clearTimeout`. Injectable clocks support
deterministic tests and platform integration. Intervals are explicitly limited to
1–60,000 ms. A snapshot reports requests, coalesced requests, emitted callbacks,
failures, pending/scheduled work and disposal. Emitted callbacks are invalidation
requests, not proof that the renderer submitted a shadow pass.

Four tests cover 1,000 dense requests, latest-state trailing flush, idle silence,
late and early callbacks, stale callback rejection, callback failure/recovery,
invalid parameters and clock regression. The whole package passes 79 tests and
2,777 assertions plus the built Node ESM consumer checks.

The game fixture additionally subscribes one owner to the existing `waterRuntime`.
At a 100 ms interval, 121 requests (initial plus 120 explicit advances) produce
three invalidation callbacks: initial, first eligible burst request and trailing
refresh. Paused advances produce no new frames; a long absolute seek wraps phase;
restoration and detach controls pass. These tests use explicit advances in place
of spring ticks and do not establish full application animation scheduling or
whole-world shadow cost. The owner is reusable; the 100 ms policy is an isolated
game experiment, not a universally recommended refresh interval.

All additions remain part of the unpublished candidate. Do not replace the
separately qualified 0.12 release archive with a current-tree build.
