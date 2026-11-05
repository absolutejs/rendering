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
