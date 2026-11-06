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

### Prepared RGBA8 texture arrays

`createPreparedMipArrayTexture(layers, { colorSpace, maximumBytes })` copies
matching complete mip chains into an owned array texture. Each layer is an array
of `{ width, height, data: Uint8Array }` levels, starting at full size and ending
at 1×1. Odd dimensions halve with flooring. Inputs are validated before packed
buffers are allocated; copied bytes have no shared ownership with the inputs.

The default combined mip budget is 16 MiB, with a 64 MiB hard limit. The API accepts
1–256 layers and dimensions up to 16,384; these are validation bounds, not promises
about the device. Check renderer texture-size and array-layer capabilities before
uploading. Dispose the returned texture when its owner releases it.

Color space defaults to `NoColorSpace` for data; specify `SRGBColorSpace` for color.
The texture uses linear filtering and the supplied mip levels, with no automatic
mip generation. It does not filter across layers. The supported Three uploader
uses `CompressedArrayTexture`'s explicit RGBA branch for these uncompressed bytes;
the class name does not imply compression. Both supported Three releases are
covered by browser mip/layer/sRGB and disposal checks. This API supplies storage;
view selection, shader lighting and world streaming remain caller responsibilities.

### Persistent instance attributes (0.11.0 candidate)

`createInstanceAttributeStream(capacity, itemSize, maximumBytes?)` owns a fixed
`InstancedBufferAttribute` with dynamic usage. `update(Float32Array, count)` copies
only the consumed prefix, returns changed scalar components, and coalesces dirty
ranges until Three acknowledges an upload. Unchanged prefixes request no upload.
Use `stream.count` to update the mesh/geometry draw count, including count changes
that do not alter attribute values. Capacity cannot grow; replace the resource
explicitly when its budget changes. Default budget is 4 MiB, hard limit 64 MiB.

Attach the owned attribute to the owning geometry. Do not externally mutate its
array, upload callback, update ranges, version or usage; this would bypass dirty
tracking. Input may not alias owned storage or use concurrent shared memory.
Invalid prefixes reject atomically. Geometry/mesh disposal owns GPU lifetime;
release your stream reference with that owner. No frame callback or global
renderer modification is installed. Instance matrices use item size 16; ordinary
custom attributes use their shader component count.

### Bounded cutout visibility (separate entry point)

`@absolutejs/rendering/visibility` provides `PreparedAlphaVisibility`. Install its
optional peer `three-mesh-bvh` (qualified range 0.8.3–0.8.x) when using this entry.
The base material and spring entry points do not import the BVH library.

```ts
import { PreparedAlphaVisibility } from '@absolutejs/rendering/visibility';
const visibility = new PreparedAlphaVisibility(geometry, {
  data: alphaBytes, width, height, cutoff: 0.4,
  wrapS: 'repeat', wrapT: 'repeat',
});
const result = visibility.query(localRay, {
  near: 0.01, far: 64, maxBoundsTests: 8192, maxTriangleTests: 4096,
});
// Handle all three outcomes: occluded, clear, budget-exhausted.
visibility.dispose();
```

Build the snapshot outside the render loop, preferably in a worker. It copies
positions, UVs, indices and alpha; it never patches Three prototypes or reorders
the caller's geometry. `ownedBytes` counts owned typed-array/BVH storage, not JS
object overhead or the caller's original resources. Disposal is idempotent.

Queries normalize direction and use local-space distances. A confirmed hit is
any opaque intersection, not necessarily the nearest. Exhaustion is unresolved,
never clear sky. Bounds and triangle tests have separate limits; traversal may
finish pruning queued sibling bounds without performing further box tests.

Supply one full triangle primitive per owner, at most 300,000 vertices / 200,000
triangles, and an optional single 8-bit alpha field up to 4096×4096. The cutoff
must be in (0,1]. UV transforms and image orientation must already be reflected
in the supplied UVs/bytes. Sampling is bilinear at the base texture level with
explicit clamp or repeat wrapping. This is hard-cutout geometry visibility, not
mipmapped/A2C raster equivalence, translucent transmission or a complete ambient
occlusion system. Separate alpha maps with different UV sets, material graphs,
wind and scene overlap require caller-side treatment.
Geometry and ray origins must be finite local coordinates within ±1,000,000.

An optional third query argument supplies synchronous `point(source, target)` and
`bounds(source, target)` deformation callbacks. This shares one source BVH across
static variants without storing a rebuilt mesh per instance. Both callbacks must
write in the ray's coordinate frame. Bounds must conservatively enclose the entire
transformed source box, including interior extrema of nonlinear deformation;
transforming only box corners is not generally sufficient. Finite output checks
cannot prove this caller contract. Distances are in that output frame.

Inputs and targets are temporary scratch objects; do not retain references or
reenter/dispose the same owner from a callback. Callback errors are propagated only
after BVH traversal safely unwinds, so later queries remain valid. This is a CPU
storage/query tradeoff: transformed bounds and vertices cost work. Use bounded
worker jobs and cache accepted lighting results; do not trace every rendered frame.

`HemisphereVisibilityProbe` in the same entry point integrates a deterministic
upper-hemisphere ray set incrementally. Construct it with `{revision, origin,
samples, budget}` and a scene trace callback. Call `step(maximumRays)` in a worker,
yielding between small batches; `cancel()` releases the callback. No scheduler,
worker pool or animation callback is installed. Defaults: 128 samples, near 0.01,
far 64, 8,192 bounds and 4,096 triangles per ray. Samples and step calls cap at 4,096.
The scene callback must enforce each ray's budget across all candidate objects,
not give every tree a fresh budget. Counter violations reject before accepting
that sample. Callback failures leave the current sample retryable.

Snapshots include revision, state, processed/unresolved counts, work counters and
an accessibility interval. `accessibility` is null until all samples are processed
and resolved. Pending or exhausted rays contribute uncertainty, never clear sky.
The interval bounds this finite ray set only: it is not a sampling confidence
interval or a bound on the continuous lighting integral. The cosine weighting is
for a horizontal upward-facing receiver under uniform sky; it does not represent
arbitrary leaf normals, sky color, indirect bounce or transmission. Reject stale
scene revisions before installing results. Cancelled snapshots are not installable.

### Indirect diffuse visibility field

`withIndirectDiffuseVisibility(fragmentShader, identifier)` inserts a clamped
scalar multiplier after Three's AO stage. Declare the field in shader scope before
that point; the helper accepts a GLSL identifier, not arbitrary code. It rejects a
missing/duplicated hook or repeat installation. Compose it with the existing
material shader hook and include the modification in the program cache key.

Only accumulated indirect diffuse is attenuated. Direct lighting, emission and
indirect specular remain unchanged; this is not a full GI, specular-occlusion or
sky-direction integration model. The caller owns field coordinates, interpolation,
receiver suitability, streaming and invalidation. Do not apply an upward ground
probe indiscriminately to arbitrary leaf normals or terrain heights. No texture,
worker or animation loop is allocated by this string transform.

For directional thin-foliage environment attenuation, compose
`withLeafEnvironmentVisibility(fragment, 'sampleLeafVisibility')` after a leaf
lighting hook. Declare `float sampleLeafVisibility(vec3 viewSpaceNormal)` (or
return `vec3` for per-channel attenuation) before
the physical lighting chunk. The callback is evaluated separately for the front
and back normals before their transmitted diffuse mixture, with results clamped
to [0,1]. It affects environment diffuse only. The caller owns field coordinates,
revision checks, lifetime and material program-cache identity. See
[composition qualification](docs/visibility-2026-11-05/leaf-environment.md).

The optional `/visibility` probe also supports `exportSamples()`: a copied,
transferable two-bit mask retaining pending, clear, occluded and exhausted ray
states. Regenerate its directions with `hemisphereVisibilityDirection` to
reweight changed sky radiance without retracing unchanged geometry. Check the
revision and completion state before consuming it. See the
[sample-mask contract](docs/visibility-2026-11-05/sample-mask.md).

### Explicit compact attributes (0.13 candidate)

`createCompactFloatAttribute(float32, itemSize, { encoding, maximumAbsoluteError })`
creates owned `snorm16` or `float16` attribute storage with a measured component-error
bound. It rejects invalid ranges instead of silently clamping. Use during offline
or bounded pre-upload preparation; geometry ownership, GPU lifetime and deciding
which attributes may lose precision remain the caller's responsibility. The helper
does not automatically quantize positions or change topology. Half-float arrays hold
encoded bits: CPU users must use typed attribute accessors or decode explicitly.
See `docs/compact-attributes-2026-11-05/README.md` for limits and qualification scope.

### Rooted visual bending (unpublished candidate)

`createRootedBend` and `withRootedBend` provide a bounded local-space visual shear,
matching color/depth positions and analytic normal/tangent transforms. Root points
stay fixed. Callers own the clock, material hook composition, immutable shape
uniform, expanded culling bounds and shadow refresh policy. This applies to rigid
unskinned source geometry and is not branch physics. See
[qualification and contract](docs/rooted-bend-2026-11-06/README.md).

`createCoalescedInvalidation({ minimumIntervalMs, invalidate })` shares one bounded
immediate/trailing refresh stream for cached render products. It has no idle timer,
coalesces intermediate requests and cancels pending work on disposal. Callbacks
read the latest scene state; renderer submission and refresh-quality policy remain
the caller's responsibility. See [contract and checks](docs/rooted-bend-2026-11-06/refresh.md).

The rooted state also exposes `motionBound(fromPhase, toPhase, projection?)` for
constant-cost conservative displacement measurement under a fixed linear X/Z
projection. It can express metres or orthographic shadow texels. It does **not**
bound rasterized shadow-mask error; see the
[motion-bound contract and counterexample](docs/rooted-bend-2026-11-06/motion-bound.md).
