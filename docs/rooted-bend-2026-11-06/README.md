# Root-anchored visual bending — unpublished candidate

`createRootedBend` defines a local positive-Y shear with smoothstep height weight,
fixed roots and bounded lateral displacement. The angular variation follows the
same smoothstep, so the slope is continuous both at the root and at the full-height
boundary. A numerical derivative test caught a kink in the initial linear angular
ramp; that candidate was corrected before qualification.

`withRootedBend(vertexShader, normals)` installs identical displacement on color
and depth shaders. It transforms normals with the exact inverse-transpose shear
Jacobian and optional tangents with the forward Jacobian. This contract applies
to rigid, unskinned source geometry; it does not compose an arbitrary earlier
morph/skinning/deformation Jacobian. It is a visual warp, not physical dynamics.

Bind `absRootedBendShape`, `absRootedBendPhase` and `absRootedBendRotation` to the
returned `shape`, `phase` and `rotation` uniforms, call
`setPhase` from an existing clock, and use the same state on every associated
color/depth material. Treat the shape uniform as immutable. The caller must
provide a program-cache identity and compose existing shader hooks. The helper
does not start a timer, create a material, mutate geometry or refresh shadows.

`expandBounds` returns conservative all-phase local bounds without modifying its
input; derive a sphere from that box before frustum culling. Always pass the
original bounds, not a previously expanded result. Root plane is local Y=0.
Heights must be positive and at most 10 km, per-axis amplitudes at most one quarter
of the height, and vertical phase within ±4π. These are explicit implementation
limits, not biome or species calibration. Phase is wrapped to [0,2π).

## Qualification

- 86 package tests / 176,965 assertions pass, including finite-difference derivatives, root anchoring,
  transformed normal/tangent orthogonality, bounds, invalid inputs and shader hooks.
- Node ESM consumer and package build pass.
- `browser.json` and `browser-three187.json`: bounded sequential SwiftShader checks
  on Three 0.186.1 and 0.187.0. Four horizontal rotations × five phases × 64 float-render-target samples compare
  GPU displacement and derivative values with the CPU reference. Maximum component
  error is 0.00006615, below the declared 0.0001 tolerance. This is a component
  accuracy check, not a hardware timing or visual quality metric.
- Three color/depth silhouette controls agree exactly. Changing phase at rotation .7 moves 188
  pixels in the 64² fixture; restoring phase reproduces the original silhouette.
- No browser/GL errors. All owned geometry and programs release. Texture count
  returns to the measured baseline of one: Three's shared DFG lookup allocated by
  an unmodified physical material (WebGLRenderer's `getDFGLUT` binding), not an
  owned deformation texture. No screenshots or duplicate archives are retained.

Reproduce with `bun run check:package` and `bun scripts/verify-rooted-bend.cjs`.
`ROOTED_THREE` selects another supported Three module; `ROOTED_REPORT` chooses the
compact output path. This extends the current unpublished 0.13 candidate. The
separately qualified 0.12 archive remains unchanged. No production game adoption,
shadow-refresh scheduler or real-plant visual qualification is claimed here.


## World-oriented horizontal sway

The optional `rotation` constructor parameter and `setRotation(radians)` rotate
both displacement and its height derivative in local X/Z. CPU samples, shader
positions/normals and projected motion bounds use the same rotation. The rotation
uniform encodes `(cos(angle)-1, sin(angle))`; callers must always bind it, including
at zero, because WebGL programs may be shared with other materials. Do not mutate
that uniform directly. Rotation inputs are finite and wrapped before trigonometry.

For an upright unit-scale plant with Three Y-axis rotation θ, setting bend rotation
θ cancels the plant's yaw and aligns its sway ellipse with world +X/+Z. Tests cover
five plant yaws, multiple phases and heights, inverse-transform agreement,
finite-difference derivatives, rotated projection bounds and arbitrary-angle
bounds. General tilt, nonuniform scale or joint deformation is outside this
convenience mapping and requires the caller's own transform model.

`expandBounds(source)` contains all phases at the current rotation.
`expandBounds(source, true)` also contains every horizontal rotation, useful for
shared geometry or changing wind direction. Always derive it from original bounds.
`motionBound` assumes rotation, shape, projection and object transform stay fixed
between its two phase samples; it does not bound a changing wind direction.
This extends an unpublished candidate, and game qualification wrappers bind the
new uniform explicitly. It is not a released dependency upgrade.
