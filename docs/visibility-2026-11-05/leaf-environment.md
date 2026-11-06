# Two-sided environment visibility composition

`withLeafEnvironmentVisibility` composes after `withLeafLighting` or
`withLeafTransmissionField`. A caller-owned GLSL function receives a view-space
normal and returns visibility. Its front/back values independently attenuate the
two environment-diffuse terms before transmission blending. Function results are
clamped to [0,1]. Ambient/hemi, direct, emission and specular terms are untouched.
The function must be declared before the physical lighting chunk; callers own
coordinate transforms, field validity, lifetime and shader cache identity.

The need is measured in the game's `4abdcc52` forest comparison: one upward ground
value loses directional leaf lighting. SH9 is a promising field representation,
but this API does not mandate SH, allocate a texture, generate probes or claim GI.
It also does not fix a stale field, coordinate error or unsuitable sky model.

66 package tests / 1,259 assertions and the TypeScript build pass. The actual
factory and transmission-field hook are compiled against directional PMREM in a
bounded sequential SwiftShader browser. Each supported Three version runs 32 new
controls (four transmission values, four front/back visibility pairs, two material
paths), alongside the ten existing transmission controls. The pairs include open,
closed, asymmetric and out-of-range inputs to verify clamp behavior.

Three 0.186 maximum diffuse-mixture error: 5.588e-8; Three 0.187: 8.375e-8.
Black-material controls isolate specular and are exactly unchanged. Four additional
no-environment controls compare direct light plus emission with the hook absent
and with both visibility values zero; all components are exactly unchanged.
Directional environment contrast is nonzero, preventing vacuous mixture acceptance.
No console/page errors. All owned targets, source cube and PMREM resources are
released; Three retains its renderer-owned DFG lookup until renderer disposal.

```sh
bun run test
bun run build
FOLIAGE_ENV_REPORT=docs/visibility-2026-11-05/leaf-environment.json bun scripts/verify-foliage-environment.cjs
FOLIAGE_THREE=/home/alexkahn/alex/hello-world/node_modules/three/build/three.module.js FOLIAGE_ENV_REPORT=docs/visibility-2026-11-05/leaf-environment-three187.json bun scripts/verify-foliage-environment.cjs
```

This is the unpublished 0.12.0 candidate. No production dependency adoption,
release archive qualification, frame-rate result or full-forest visual acceptance
is implied. No screenshots or tarballs were produced by these checks.

## Colored attenuation follow-up

The supplied visibility function may return `vec3` instead of `float` for separate
RGB attenuation. The same clamped front/back multiplication supports this without
changing the hook's shader transformation. Four additional actual-browser controls
use unequal RGB attenuation on each side at transmission 0, 0.28, 0.5 and 1. Both
Three versions pass their expected per-channel mixtures and exactly unchanged
black-material specular controls. The original 32 scalar controls and direct/emissive
checks are rerun alongside them. See `leaf-colored-environment*.json` for results.
This is necessary for colored sky fields; a grayscale visibility ratio cannot in
general preserve the spectral change caused by directional canopy openings.
