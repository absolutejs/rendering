# Rendering 0.3.0 qualification

Adds the optional `@absolutejs/rendering/spring` subpath: explicit Fiber animated hosts driven by React Spring's normal scheduler, with mesh/group defaults and a typed factory for other Fiber primitives. DOM-only springs do not render a demand-driven scene and still complete without a Canvas. Three property updates use Fiber's applyProps invalidation. This entry does not install or reset a global scheduler; a separate runtime import of @react-spring/three can still change that global state and must be avoided.

The game incident motivating this API is backed up in hello-world-absolutejs commit c61b7d70. An eagerly imported inactive cut lab installed the Three scheduler and froze the settings panel logically closed but visually at opacity 0.35827. Switching to the existing host adapter resolved the actual application-import regression and the full-world capture. This package extracts that behavior for other AbsoluteJS tools without patching installed dependencies.

Qualification:
- 12 package tests pass (69 assertions), including unchanged material ownership/coverage tests and host/scheduler checks.
- Host factory type checks pass, including rejected unsupported primitives and non-selected hosts.
- Built-package browser tests pass: the coupled library control reproduces extra scene renders and no-canvas DOM failure; the package case performs zero DOM-only scene renders, completes without Canvas and preserves Three animation and callback-clock pause/resume.
- Existing material browser checks pass across 192 draws, stable programs and zero released geometry/texture counts.
- A separate frozen-lockfile build produces identical hashes for all six dist files.
- All four existing material files match published 0.2.0 byte-for-byte.
- The exact packed archive passes a separate installed consumer's unit, type and browser checks. The archive checksum and npm pack manifest are retained alongside it.

All browser work is bounded, sequential SwiftShader. No native GPU or hardware FPS claim. React/Fiber/Spring peers are optional for root material utilities and required for the spring subpath at the declared ranges; tested versions are pinned in bun.lock. WithAnimated comes from a type-only import, never a runtime Three-spring import.

Initial qualification failures are retained: the first generic host assertion needed the renderer-specific type bridge, an early type probe used a dashed prop through React.createElement that upstream types do not expose, and the copied browser harness initially lacked its event writer. These were corrected before the final checks. No scene behavior was changed to make the coupled control pass.

Generated independent/consumer installations are ignored and reproducible from committed sources/lockfile plus the committed exact archive. Source, evidence and the release archive are durable; no source-only copy is kept in /tmp.
