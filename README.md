# @absolutejs/rendering

Small Three.js material-lifecycle utilities for AbsoluteJS applications and 3D authoring tools. These complement R3F and drei; they do not provide a scene graph, camera controls, effects composer or renderer replacement.

## Coverage follows the destination

A multisampled canvas does not make a reflection texture multisampled. An alpha-to-coverage shader used unchanged in a single-sample target can draw partially covered foliage as solid pixels.

```ts
import { bindAlphaToCoverageDestination } from '@absolutejs/rendering';
material.alphaToCoverage = true;
const unbind = bindAlphaToCoverageDestination(material);
// On every draw, the policy selects coverage from the active render destination.
// Call unbind() when removing the policy while retaining the material.
```

The policy runs after the previous material callback and before Three selects the program. It updates the material only when the effective coverage mode changes. Three can cache the corresponding program variants. It does not inject shaders, allocate textures, traverse the scene, monkey-patch a renderer, or call synchronous GPU queries per draw.

Shader customizations must retain their non-ALPHA_TO_COVERAGE fallback. The policy uses declared render-target sample counts, bounded by renderer support; callers must create targets with supported attachment formats. Canvas antialias attributes are cached per renderer, but a lost context is not cached as a permanent capability result. Disabled preferences remain disabled on all destinations. Shadow passes that call renderBufferDirect require their own depth-material policy; this callback targets normal material draws.

Rebinding updates the existing preference without stacking callbacks. The returned disposer is idempotent and restores the original flag and callback only while it still owns the callback slot; it will not overwrite a later owner.

## Clone customized materials safely

```ts
import { cloneRenderMaterial } from '@absolutejs/rendering';
const owned = cloneRenderMaterial(source);
// Textures remain borrowed. Dispose the clone, not the source's textures.
```

This retains onBeforeCompile, customProgramCacheKey and onBeforeRender. A registered destination policy is cloned independently, including when the source was last drawn into a non-MSAA target. Changing the clone's preference cannot affect the source. This does not clone arbitrary object callbacks, custom depth materials or scene state.

## Compatibility and scope

Qualified against Three r186. No React dependency and no animation loop. Runtime cost is a small callback and destination check per affected draw; switching sampling modes can select another cached shader program. Hardware frame-rate improvements are not claimed. Game-specific foliage algorithms, lighting, world generation and simulation remain outside this package.

Use `bun run check:package` to build declarations and run the ownership/policy tests. Browser evidence is retained under docs/.
