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

## Scoped captures and readback

`renderTargetScope(renderer, run)` restores the render target, cube face, mip,
viewport, scissor and scissor-test state even if synchronous work throws. The
callback must finish renderer mutations synchronously; do not hold a scope over
an await.

`readTargetPixelsScoped(renderer, target, width, height, buffer, textureIndex?)`
submits a byte/float read from a neutral target and restores the caller through
Three's target setter. This avoids restoring a resolve framebuffer in place of
its multisample draw attachment, or treating a cube framebuffer array as a single
framebuffer.

`readFloatTargetScoped(...)` submits asynchronous float readback in the same
neutral state, restores the caller immediately, and returns the exact supplied
Float32Array on completion. It never restores stale renderer state after await.
Allocate supported targets and correctly sized buffers before calling these
helpers. The helpers do not choose formats, sample counts or capture resolution.

## React Spring with demand-rendered Fiber scenes

The optional `@absolutejs/rendering/spring` entry provides `animated.mesh`,
`animated.group`, `useSpring`, `easings`, and `createFiberSpringHost` for other
explicit Fiber primitives:

```tsx
import { animated, useSpring } from '@absolutejs/rendering/spring';

function MovingGroup({ x }: { x: number }) {
  const motion = useSpring({ x });
  return <animated.group position-x={motion.x}>{/* scene content */}</animated.group>;
}
```

It keeps React Spring's normal scheduler. Three prop updates invalidate the
owning Fiber root through `applyProps`; DOM-only animation does not render a
scene and can finish without a mounted Canvas. No `useFrame`, manual animation
clock, global scheduler replacement, or unconditional render loop is installed.

Do not also runtime-import `@react-spring/three`: that entry installs a global
Fiber-driven scheduler even when its consuming component is never mounted. This
adapter does not override or repair another module's global scheduler changes.
Type-only imports from that package are safe. Test your actual application's
eager import graph as well as isolated components.

Use `createFiberSpringHost(['instancedMesh', 'meshStandardMaterial'])` to opt into
additional hosts without registering every Three constructor. React, Fiber and
React Spring peers are optional for the core material utilities, but required
when using this subpath. `@react-spring/three` supplies host types only; it is not
runtime-imported by this entry. The tested versions are React 19.3, Fiber 9.8.2,
Three 0.186.1 and React Spring 10.1.2.

## Rigid-object triplanar materials

`createObjectTriplanarMaterial` keeps color, normal detail and roughness aligned
without depending on mesh UVs. Coordinates remain local to the geometry, so a
moving rigid object does not slide through a world-space texture field.

```ts
import { createObjectTriplanarMaterial } from '@absolutejs/rendering';
import { RepeatWrapping, SRGBColorSpace, Vector2 } from 'three';

for (const texture of [albedo, normal, roughness]) {
  texture.wrapS = texture.wrapT = RepeatWrapping;
}
albedo.colorSpace = SRGBColorSpace; // normal and roughness remain non-color data
const material = createObjectTriplanarMaterial({
  map: albedo,
  normalMap: normal,
  roughnessMap: roughness,
  normalScale: new Vector2(0.65, 0.65),
  projection: { scale: 1, offset: [0, 0, 0], sharpness: 4 },
});
```

Projection scale is repeats per geometry-local unit; UV texture matrices/repeat
values are replaced by these controls. Offset and scale are copied at creation.
Sharpness ranges from 1 to 16; scale must be finite, positive and at most 10,000.
Color uses the texture's color space; roughness uses its green channel. Tangent
normal maps, including packed RG and negative normal-Y scale, blend as surface
slopes before perturbing the local normal. Neutral maps preserve base normals.

Scope is opaque, rigid geometry. Mesh and non-sheared instanced transforms follow
Three's normal-matrix conventions. Skinning, active morphs, displacement, bump maps,
object-space normal maps and video albedo are rejected. Transparent, alpha-test,
alpha-hash and alpha-to-coverage surfaces are rejected because they need matching
shadow coverage shaders. Other StandardMaterial channels retain their normal Three
behavior. The helper is for WebGLRenderer; it is not a WebGPU/TSL implementation.

The material borrows textures and does not alter or dispose them. Use
`cloneRenderMaterial` to retain shader hooks when cloning. Dispose material and
owned textures separately. Standard lighting, shadows and geometry stay intact.
With color, normal and roughness present, the shader uses nine texture samples
instead of three UV samples, with no extra draw or render pass. Hardware cost is
scene-dependent; the qualification uses software rendering, not a hardware FPS claim.

### Thin foliage

`createThinFoliageMaterial({ leafTransmission: 0.35 })` creates a standard
material with approximate thin-leaf backlighting. Transmission is a bounded
fraction (0–1) of direct diffuse; zero retains standard lighting. The shader
uses Three's shadowed incident light, preserving PBR specular,
fog and tone mapping. Area lights retain standard lighting; hemisphere lights and PMREM diffuse illumination transmit from the reverse side. This is a lightweight
leaf approximation, not volumetric subsurface scattering or a complete grass
renderer. Distribution, blade shape, wind and terrain integration remain the
caller's responsibility. Compose custom shader hooks after the factory hook;
use `cloneRenderMaterial` to preserve them when cloning.


`withLeafLighting(fragmentShader, transmission)` and
`withLeafTransmissionField(fragmentShader, identifier)` apply the same canonical
thin-sheet model to an existing standard-material shader. The field form expects
a declared scalar clamped to [0,1]. These helpers preserve the existing Three
specular paths, including environment multiple-scattering compensation. Compose
vertex deformation independently and include transmission policy in cache keys.
An environment-lit leaf uses an additional reverse-normal irradiance lookup;
this is not a free shader operation. No extra passes or geometry are added.

Version 0.6 replaces the factory's view-dependent direct-scattering factor with
the same thin-sheet diffuse weighting used by the lower-level hooks. Existing
material colour/transmission settings remain valid, but direct backlighting can
change. This release also adds sky transmission missing from 0.5.

### Prepared alpha-coverage mipmaps

`alphaCoverage(alpha, width, height, cutoff)` estimates bilinear alpha-test
coverage with a fixed 4×4 sampling grid per texel, including clamped borders.
`scaleAlphaCoverage(alpha, width, height, cutoff, target)` returns new alpha bytes,
coverage measurements and a scale selected by at most twelve bisection steps
within [0, 4]. Inputs are limited to 262,144 texels. These are offline or worker
setup tools, not per-frame work. Quantization and constant mip tails can prevent
matching the target; the result explicitly reports the residual and retains the
original if no candidate improves it. Input bytes are unchanged.

`createPreparedMipTexture(source, levels, maximumBytes?)` creates an owned Three
RGBA8 2D texture over a complete, precomputed chain. It preserves source color
space, sampler and UV settings while giving the result its own texture source
and level descriptors. Data bytes are borrowed and must remain immutable for the
texture's lifetime; dispose the returned texture when its owner releases it.
The default bound is 16 MiB, configurable up to 64 MiB, including borrowed backing
buffers. This validates layout, not hashes, transport or ecological correctness.
Asset identity verification belongs before this call. No GPU upload or renderer
mutation occurs until the caller prepares/renders the returned texture.

The [coverage-preserving mip technique](https://www.ludicon.com/castano/blog/articles/computing-alpha-mipmaps/)
addresses alpha-test thinning. Texture-space coverage is not a guarantee of
projected plant fidelity: filtering, UV distribution, geometric simplification
and MSAA all matter. Validate actual source views with independent white-RGB
coverage readbacks; resolved alpha can be multiplied by coverage again.

### Associated foliage color

`downsampleAlphaColor({ width, height, data })` reduces straight RGBA8 in linear
light using alpha-weighted color. It includes odd edge texels and returns owned
straight-color bytes. Build each next level from this result, before any coverage
correction. `associateAlphaColor(bytes)` produces owned, linear-light-associated
RGB encoded in sRGB (or choose `{ colorSpace: 'linear' }`). Alpha is unchanged.
These offline helpers default to 262,144 input pixels and reject limits above
1,048,576 pixels.

After coverage correction, associate each stored level, upload with the matching
texture color space, and call `configureAssociatedColorMap(ownedMaterial)` on a
mapped Three basic/standard/physical material. The hook divides filtered RGB by
filtered alpha before lighting; it does not change alpha testing or blending.
Do not use `premultiplyAlpha` upload conversion on already-associated bytes. Do
not apply the hook to ordinary straight-color textures. A material cloned with
preserved shader hooks already contains the conversion and must not reinstall it.
RGBA8 quantization remains; near-zero alpha is not a lossless color encoding.

### Primary-camera uniforms across render passes

`createViewCameraState()` returns stable `position`, `direction`, and
`orthographic` uniforms plus `update(camera)`. Direction points along camera-local
+Z, toward the camera from the view; it is the opposite of Three's forward look
direction. Parented perspective and orthographic cameras are supported. Array/XR
camera roots and invalid transforms reject explicitly.

`bindViewCamera(ownedRenderObject, state)` updates that state from Three's primary
camera in both beauty and shadow callbacks, preserving existing callback receivers
and arguments. The returned cleanup restores only callbacks it still owns.
Repeated binding of the same state is idempotent; another state or a partially
replaced binding requires cleanup first. Use the shared uniforms in your own
shader hooks. This adds no frame scheduler and does not mutate the light camera.
