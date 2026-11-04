# Canonical thin-sheet sky lighting

Grass factory 0.5 transmitted direct light only, while Hello World's older leaf
hooks also transmitted hemisphere and PMREM diffuse lighting. Version 0.6 moves
those tested hooks into the package and makes the factory use that same model.
The game owns its asset metadata/coverage policy; reusable shader composition
belongs here. No game-local dependency patch is required.

The factory's old view-dependent direct factor is removed in favor of the same
bounded thin-sheet weighting as the existing tree hooks. This intentionally
changes grass backlighting. Existing tree hook output is text-identical across
six constant-transmission and two field-expression controls before migration.

Checks: 21 package tests; 24 direct/dark/shadow/hemisphere browser controls;
10 directional PMREM factory/field controls. Float environment blend error is
below 4.4e-8; explicit black-material specular difference is zero for all tested
transmission values. Directional contrast is nonzero, preventing a vacuous check.
Owned GPU resources are disposed; only Three's renderer-owned DFG lookup remains
before renderer disposal. All browser work uses bounded sequential SwiftShader.

Sky transmission introduces a reverse-normal environment irradiance lookup.
No new render pass, geometry or texture allocation per material, but additional
texture sampling is real. These checks do not establish native 60/120 FPS.
Area lights keep Three's standard behaviour. Field callers must declare a scalar
in [0,1]; unsupported shader anchors and injected expressions reject early.

After publication: replace the game's generic shader functions with imports
from this package; retain its asset-specific configureLeafLighting wrapper.
Run tree environment, grass wind/LOD, actual-game and type checks. Delete the
single release archive after exact registry verification.

Published 0.6.0 registry bytes match the qualified archive exactly; see
registry.json. Both completed tarballs were removed. Game adoption now uses the
published dependency and is qualifying the asset-specific grass setting.
