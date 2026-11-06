# Rendering 0.12.0 release qualification

The qualified candidate remains **unpublished**. It supersedes the queued 0.11.0
archive; the game still depends on published 0.6.0. User-dependent npm confirmation
is deferred. Do not publish a different archive under this qualification record.

The candidate adds the bounded cutout-visibility subpath, incremental hemisphere
probes with owned transferable sample masks, and indirect/leaf environment visibility
hooks. Sampling, field generation, invalidation and lifetime remain caller concerns;
these APIs do not automatically give a game dynamic global illumination.

Exact archive qualification found an extensionless `visibilityProbe` re-export:
bundled browser and Bun source checks accepted it, while Node ESM threw
ERR_MODULE_NOT_FOUND. Canonical source now uses `.js` specifiers for emitted module
and declaration references. `check:package` includes a real Node consumer that imports
both the base and visibility entries and exercises the structural direction target.
The rejected archive identity is retained in `rejected-archive.json`; its bytes were
removed. Source fix and verification tools are committed at 297a25e.

Two independent TypeScript builds, the normal dist tree and extracted archive have
identical hashes for all 32 emitted files. The source suite and unchanged test bodies
redirected to exact archive modules each pass 68 tests / 1,292 assertions. The archive
suite runner removes its generated test copies in a finally block. An initial nested
pipe capture hit an EPERM while Bun wrote a peer warning; inheriting stdio avoids
that harness failure. Node still reports three-mesh-bvh 0.8.3's Three CJS deprecation
warning; imports and tests succeed.

The exact corrected archive passes sequential software-browser checks on Three
0.186.1 and 0.187.0: module-worker cutout, budget, ownership and transferable-mask
controls, plus 32 scalar and four colored leaf environment controls per peer. Direct/
emissive and specular controls remain exact. Maximum scalar diffuse error is
5.588e-8 / 8.375e-8 respectively. These are API/shader controls, not native GPU timing.

Compared with the prior queued 0.11.0 archive, 22 emitted files are byte-identical.
Existing changes are confined to index and leafLighting JS/declarations; six new files
provide indirect visibility and the visibility/probe subpath. Prior unrelated WebGL
feature qualifications remain recorded in their original reports.

Reproduce before publishing:

```sh
bun run check:package
bun scripts/verify-archive-tests.cjs .qualification/visibility-0.12.0/consumer/package
VISIBILITY_MODULE="$PWD/.qualification/visibility-0.12.0/consumer/package/dist/visibility.js" \
VISIBILITY_REPORT=docs/visibility-0.12.0/archive-worker-three186.json \
bun scripts/verify-visibility.cjs
FOLIAGE_MODULE="$PWD/.qualification/visibility-0.12.0/consumer/package/dist/index.js" \
FOLIAGE_ENV_REPORT=docs/visibility-0.12.0/archive-foliage-three186.json \
bun scripts/verify-foliage-environment.cjs
```

Extract the retained archive again before these commands if cleanup has removed the
consumer tree. For the second peer set VISIBILITY_THREE or FOLIAGE_THREE to the game's
Three module. `archive.json` records the exact archive hashes, source and file manifest.
No screenshots, native GPU benchmarks or npm authentication were needed in this pass.
