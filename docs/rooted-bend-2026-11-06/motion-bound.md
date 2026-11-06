# Projected rooted-motion bound

`state.motionBound(fromPhase, toPhase, projection?)` bounds the Euclidean movement
of every point under this rooted shear and a fixed linear X/Z projection. Identity
returns local metres. A pair of orthographic camera projection rows, including
instance transform and viewport scale, returns shadow texels. Perspective division,
changed transforms/projection, other deformations and changed geometry are outside
this contract. It is not a bound on rasterized shadow values or GPU rounding.

For height weight b in [0,1], the difference of the sine/cosine displacement pair
has chord length `2 |sin(delta / 2)| b` before amplitude/projection. Multiplying
by the largest singular value of `projection * diag(amplitudeX, amplitudeZ)` bounds
every height without visiting vertices. The implementation evaluates the 2×2
spectral norm with scaled coefficients to avoid squaring huge inputs. Invalid and
unbounded results reject explicitly. Runtime queries allocate no geometry and
have constant arithmetic work.

Phase setters, CPU samples and motion queries now use the same wrapped phase.
This matters for extreme finite inputs: applying `sin` directly to an enormous
unwrapped number would not share the shader's modulo convention. Tests include
large positive/negative finite inputs, singular and rotated projections, stretched
projections and every sampled height across 24×24 phase combinations.

The current package passes 81 tests and 168,133 assertions plus the built ESM
consumer. The existing GPU/CPU and color/depth controls still pass on Three
0.186.1 and 0.187.0. No exact archive has been created for this unpublished addition.

## Limitation demonstrated in the game

With the world's 2048², 144 m sun map, nine real source rotations and 9-second
visual wind period, a quarter-texel positional threshold predicts roughly 3.4
updates per second at normal speed. That does not guarantee visual stability:
the real native-foliage fixture still shows substantial shadow-mask changes at
sub-texel movement. The game therefore does not adopt a motion-threshold refresh
policy from this evidence. The utility is useful for conservative position-error
measurement, not as a replacement for shadow sampling/coverage qualification.
