# Rigid-object triplanar mapping investigation

Game observation: forestStoneGeometry deforms an icosahedron but retains its
original spherical UVs. Close-up workshop screenshots show strong stretching.
The game terrain already has surface-gradient triplanar code; its biome,
height-blending and parallax policy does not belong in the generic package.

Primary references inspected 2026-11-03:
- https://jcgt.org/published/0009/03/04/paper-lowres.pdf — Mikkelsen 2020,
  surface gradients and volume/triplanar bump composition. Blend height slopes,
  project onto the local tangent plane, then transform the perturbed normal.
- https://threejs.org/docs/pages/Material.html — WebGL onBeforeCompile and
  customProgramCacheKey integration.
- https://threejs.org/docs/pages/MeshStandardMaterial.html — PBR channel/color
  conventions; preserve lighting and shadow machinery.
- Pinned Three 0.186.1 shader chunks: normal_fragment_maps, normal_vertex,
  defaultnormal_vertex, map_fragment and roughnessmap_fragment. Instance normals
  support nonuniform scale but exclude sheared instance transforms.

Candidate uses geometry-local projections so moving/rotating a rigid body cannot
swim through a world-aligned texture. Color, tangent-normal slope and roughness
share three coordinates and normalized axis weights. Nine reads when all three
maps are present, versus three UV reads; no extra draw, pass, texture allocation,
geometry displacement or collision change. No hardware FPS claim. Normal-map
slopes clamp near-zero Z to remain bounded. Explicit textureGrad footprints are
computed before sampling. Texture UV matrices are replaced by projection controls;
other StandardMaterial map channels retain their usual Three behavior.

This is a candidate, not adopted by the game. Qualification must cover wrong UVs,
translation/rotation anchoring, negative projection faces, normal/roughness data,
nonuniform mesh/instance agreement, neutral normals, flat shading, ownership and
invalid inputs. Native GPU use is forbidden; run bounded sequential SwiftShader.

Candidate qualification: 17 package tests pass. Fifteen software-rendered controls
pass, including zero UV dependence, zero rigid-motion anchoring difference,
neutral smooth/flat normals matching unchanged lighting, six signed axis normals,
nonuniform mesh/instance normal agreement (maximum 1/255), packed RG normals with
negative Y scale, roughness green-channel sampling and sRGB decoding. The UV-based
control detects the deliberately damaged UVs (mean difference 19.63/255), so the
invariance test is not merely comparing blank images. One draw is retained.

Opaque coverage is required: cutout/alpha-hashed coverage needs matching shadow
material mapping, which this candidate does not claim to provide. Source texture
objects are borrowed and unchanged; dispose the material separately from textures.
Real game imagery and package archive qualification remain pending.
