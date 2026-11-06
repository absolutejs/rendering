# Rendering 0.13.0 archive qualification

The unpublished candidate combines the previously qualified visibility work with
compact float attributes, rooted visual deformation, conservative bounds leases,
and bounded invalidation with explicit discontinuity refresh. It does not enable
an animation loop, world wind, or the internal cascade experiment by itself.

Source `46a3fb2` produces 42 identical emitted files in two independent output
directories. The exact archive passes the unchanged maintained suite redirected
to emitted modules: 92 tests, 177,008 assertions, 19 files. Node ESM consumers
exercise index/visibility exports, bound ownership and immediate invalidation.
The archive's emitted files match the independent-build manifest exactly.

Bounded sequential SwiftShader controls pass against the archive on Three
0.186.1 and 0.187.0: 20 deformation controls and four compact-attribute controls
per version. Bounds controls restore visibility for displaced geometry, preserve
shared ownership, restore original culling on release, and end with no owned GPU
geometry or textures. The initial r187 fixture build rejected a relative module
path before browser launch; the runner now normalizes that input. No shader or
browser failure was observed in the corrected checks.

Hello World's actual Spring/OceanClock fixture also passes all eight playback
controls against this archive on Three 0.187.0. It samples 37 color frames with
65 requests and 15 refresh emissions; cross-timeline stale shadows are rejected,
and pending work is canceled on full React unmount. The game retains its published
rendering dependency. These are integration checks, not hardware FPS or approval
of ordinary 100 ms cached-shadow image quality.

`qualification.json` records the exact archive identity, file hashes, compact
results and hashes of removed temporary builds/logs. Only the 44,881-byte pending
0.13.0 archive is retained for publication. The superseded 0.12.0 archive was
removed after preserving its identity; its source and qualification remain in Git.
No npm authentication prompt was opened while the user was away.

Reproduction: build with BVM Bun 1.4.4+absolute.1; pack with scripts disabled;
extract locally; run `verify-archive-tests.cjs` against that package directory.
Use `ROOTED_MODULE`, `COMPACT_MODULE` or `BOUNDS_MODULE` to select its
`dist/index.js`, and the corresponding `*_REPORT` variable for a new report.
`ROOTED_THREE`/`COMPACT_THREE` select another Three module;
`CASCADE_THREE_ROOT` selects the Three package root for the bounds check.
The game runner accepts `NATIVE_RENDERING_MODULE` and `NATIVE_LIVE_REVIEW_DIR`.
After publication, verify registry integrity and remove the remaining archive.
