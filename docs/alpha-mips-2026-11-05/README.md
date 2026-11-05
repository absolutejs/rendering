# Bounded alpha coverage and prepared mip textures

Candidate additive APIs extracted from Hello World's existing tested setup tools:
`alphaCoverage`, `scaleAlphaCoverage`, `createPreparedMipTexture` and the
`PreparedMipLevel` type. No application or package consumer is switched to an
unpublished dependency. No publication is attempted while the user is away.

The coverage estimate has a fixed bilinear sampling grid, a 262,144-texel input
bound and at most twelve rescaling search steps. It reports unrepresentable
residuals instead of claiming exact preservation. The texture factory verifies
ordinary RGBA8 2D layout, a complete halving chain, total payload and total unique
borrowed backing-buffer storage before allocating. The owned texture has an
independent Three texture source and level descriptors; bytes remain borrowed.
The source texture and its settings remain unchanged.

29 package tests pass, including malformed layouts, odd dimensions, non-byte
inputs, shared backing buffers, allocation bounds and ownership. Browser controls
read all three explicit mip colors exactly across three create/dispose cycles;
owned GPU textures return to zero each time. Existing destination (192 draws) and Spring
checks pass and are recorded separately. The first destination invocation
was missing its required output-directory environment variable; it did not launch
a browser and is not a renderer failure.

Three 0.187.0 and its matching types pass all 29 tests, exact mip sampling,
192 destination draws, Spring scheduler checks, 15 triplanar controls, thin
foliage lighting and directional environment controls. Evidence is under
`three187/`. The candidate 0.7.0 peer range now includes the qualified 0.186 and
0.187 lines, stopping before 0.188. The source dev pin remains 0.186.1.
Independent builds match all 16 shipped JS/declaration files. The exact 0.7.0
archive passes an ESM consumer and nine GPU mip reads with three disposal cycles.
Its identity is recorded in `release-candidate.json`. One active archive remains
in `.qualification/alpha-0.7.0`; duplicate consumer/build data can be removed after
qualification evidence is preserved. Publication awaits the user's return.
The game's static leaf-mip improvement is partial and still needs shaded/temporal
qualification. API correctness does not certify its forest appearance.
