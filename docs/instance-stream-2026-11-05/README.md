# Persistent instance stream: 0.11.0 candidate

The canonical package now owns the reusable fixed-capacity Float32 attribute
stream. It validates consumed input before mutation, copies caller data, preserves
signed zero, coalesces pending writes and suppresses unchanged uploads. Shrinking
or expanding a draw prefix can change logical count without changing GPU bytes.
The caller owns draw count and geometry lifetime; attribute mutation outside this
owner is explicitly unsupported. Default storage budget 4 MiB; hard maximum 64 MiB.

48 package tests / 319 assertions pass on the installed Three 0.186.1 peer.
Six real WebGL controls verify initial data, unchanged uploads, two writes merged
into one 12-byte upload, a four-byte partial upload, and shrink/restore without
uploads. Pixel readbacks establish visible state, including hidden/restored
instances. Pending ranges clear on actual upload callbacks; resources/programs
return to zero. Runs use bounded sequential SwiftShader, not native WSL graphics.

This is source qualification, not a release-ready claim. Remaining work: second
supported peer, independent builds, exact-archive consumer checks, then isolated
game adoption. The existing qualified 0.10.0 archive is still used by the game's
baseline prototype. Hold publication while 0.11.0 is being qualified; once qualified
it will supersede that unpublished candidate. No npm authentication is requested
while the user is away. No tarball or capture was produced in this source pass.

## Completed release qualification

Both supported peer pairs pass all 48 tests / 319 assertions. Independent builds
match all 26 shipped files; the 22 pre-existing non-index outputs are byte-identical
to 0.10.0. Source and exact-archive stream checks pass six real GPU controls on each
peer. The archive also passes 100 array readbacks, four disposal cycles and a Node
ESM stream/array consumer. No installed library is patched.

The isolated game scene adopts this exact archive: all 60 images and 20 pre-existing
scene rows remain identical. Repeated selection changes zero attribute components
and zero image channels. Resource counts return to baseline. This verifies data
ownership and upload suppression, not hardware FPS or final foliage appearance.

The disposable peer checkout and superseded 0.10.0 archive/consumer are removed.
Only the active 0.11.0 archive and consumer remain, with checksum and source commit
in `release-candidate.json`. Publication is queued for the user's return; no npm
login or publish command was attempted. The earlier source-pass paragraph records
the state before these qualification steps and is superseded by this section.
