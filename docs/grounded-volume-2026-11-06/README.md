# Ground-relative SH9 material volume, 0.15.0

This promotes the qualified Hello World canopy material prototype into a reusable
texture/material owner. The game keeps world generation, visibility rays, sky
projection, scheduling and revision policy. The package owns bounded copied
textures, interpolation, material hooks, invalidation and disposal.

The fixed layout supports rectangular 2–64 sample grids and 2–8 nonuniform
height layers relative to a ground grid. Seven coefficient groups share one 3D
texture, plus one ground texture. The game layout needs 3,168 bytes and two
samplers. Even the largest accepted layout is bounded below 4 MiB. Material
binding preserves prior hooks and supports instancing and Three batching.

Uploads validate complete payloads and identities before mutation. Shared buffers
are rejected. Unsupported Float32 filtering can be detected before binding.
Invalidation restores baseline lighting; disposal releases hooks, textures and CPU
storage. Only indirect diffuse / leaf environment light is attenuated. This is
finite local visibility, not full GI, a shadow map or a lightmap baker.

## Verification

- 106 maintained package tests / 177,633 assertions pass against source and exact
  archive emitted modules. Built Node ESM consumers pass on both.
- Two independent TypeScript builds and the archive match all 46 emitted files.
- Both source and archive pass 169 software GPU controls on Three 0.186.1 and
  0.187.0, including three rectangular layouts, 2/3/8 height layers, directional
  SH terms, normal/view changes, edge/vertical falloff, batched transforms,
  near-zero reference light, invalidation and disposal.
- Maximum linear RGB error against the independent CPU interpolation oracle is
  one byte (allowed two). No shader/WebGL errors; cleanup leaves zero geometries
  and programs, plus the renderer's one retained lookup texture.
- The original oracle incorrectly assumed an ideal unmodified Lambert baseline.
  Its rejected result is retained. The corrected oracle separately renders an
  unmodified standard material, then applies CPU attenuation. Tolerance was not
  widened to hide the disagreement.

`archive.json` records the exact pending archive and emitted-file hashes. Browser
records are small numeric controls, not screenshots. Archive qualification uses
`VOLUME_MODULE` and `VOLUME_THREE` with `scripts/verify-grounded-volume.cjs`;
`verify-archive-tests.cjs` redirects imports without changing maintained test bodies.
No native WSL GPU was used and these results make no hardware FPS claim.

Publication and production adoption are pending. The game's separate controlled
fern/shrub view validates actual material composition, but does not establish
whole-landscape visual acceptance. Continuous sky updates, world routing and
moving/cut canopy policy remain game integration work.
