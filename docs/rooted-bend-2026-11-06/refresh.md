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

## Explicit discontinuities

`requestImmediate()` handles an explicit seek, source reset or projection change.
It cancels any trailing request, invalidates synchronously and restarts the ordinary
interval from that emission. It deliberately bypasses the animation rate limit;
callers must identify discontinuities rather than using it on every motion tick.
`immediateRequests` reports these requests separately. Reentrant requests from
inside `invalidate` are deferred to the ordinary trailing path to prevent
synchronous recursion. Disposal rejects both request methods and cancels stale
callbacks; thrown invalidations remain visible in the failure counter.

The actual game Spring-clock study exposed the need: a seek could display a new
plant pose with the prior shadow phase until the ordinary timer fired. The game
now exposes a monotonic timeline identity for reset, seek, return-to-live and its
existing long-gap catch-up branch. This is an integration example, not a game-clock
dependency of the package. The API does not itself render or guarantee pixel
quality, frame scheduling, or a maximum shadow age. Source remains the unpublished
0.13 candidate; no previously qualified 0.12 archive is replaced.
