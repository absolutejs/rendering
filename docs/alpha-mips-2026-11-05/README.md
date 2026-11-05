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
owned GPU textures return to zero each time. Existing destination and Spring
checks are recorded separately when complete. The first destination invocation
was missing its required output-directory environment variable; it did not launch
a browser and is not a renderer failure.

Pending: qualify the current game's Three 0.187 version in addition to this
package's pinned 0.186.1, decide the supported peer range from that evidence,
independent builds and exact archive consumer checks. The existing package peer
range excludes 0.187; do not silently widen it or claim adoption is ready.
The game's static leaf-mip improvement is partial and still needs shaded/temporal
qualification. API correctness does not certify its forest appearance.
