# Thin-leaf material candidate

Motivation: the game's grass uses opaque broad upward normals, with no direct
light transmission. Density increases cannot reproduce backlit leaf behavior.

Conceptual references: SimonDev's MIT Quick_Grass shader at revision
6b56164272f213e353a4045d1439d071d5a968cd and AMD's Procedural Grass Rendering
article. This implementation is original, retains Three 0.186's physical shader
and apportions a bounded fraction of direct diffuse to approximate transmission.
It does not copy SimonDev's Phong shader or require native mesh shaders.

Qualification: zero strength must exactly match standard-material center pixels;
clones must match their source; unlit and fully shadowed leaf pixels must remain
black; backlight must become visible. A 64-square sequential SwiftShader fixture
checks real shader compilation and these controls. No GPU performance claim.

Release candidate 0.5.0: 20 package tests pass; all 16 browser lighting/clone controls pass against built ESM. Two clean TypeScript outputs match all 10 distribution files. Exact archive distribution bytes match those outputs. Published as 0.5.0; registry archive matches the tested release exactly (registry.json). Completed local archives removed. Hello World adoption is undergoing composed-shader checks. Game adoption must compose its wind
hook and LOD clones, then verify representative landscape views and performance.
