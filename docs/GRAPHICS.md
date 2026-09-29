# Terrain graphics

The map offers **2D / Low power**, **3D / Balanced**, and **3D / High** on web and
native. Choices persist without changing the campaign. 2D remains the conservative
default. High is an explicit option for capable devices, not an automatic hardware
claim. Political and Terrain are separate map layers within each graphics mode.

## What is rendered

Both 3D modes use real Mapzen Terrarium elevation, raised geometry, per-pixel
terrain normals, Natural Earth land-cover color blended with biome materials, latitude/altitude snow and moving ocean lighting.
Crossed swells, reflected sky, specular highlights and broken coastal surf continue
while the simulation is paused. Reduced Motion deliberately freezes water, and
background scenes stop rendering. 2D is static by design.

High uses a 4096-square elevation/material/normal atlas and 254 x 254 terrain
cells (129,032 triangles). Balanced uses 2048-square fields and 128 x 128 cells
(32,768 triangles). The normal texture preserves terrain ridges finer than the
geometry grid. Heights are exaggerated 12 times at strategy-map scale. This is
geographic terrain with artistic materials, not a surveyed depiction of 1830
land use or measured water-depth data. Coast coverage is supersampled from the same authored polygons
as the selectable province mask, avoiding nearest-neighbor staircase edges.

High also draws bounded batches of geometric trees and roofed settlements at
regional zoom. These are geographic illustration anchored to province terrain and
population weights. They do not claim to represent simulation buildings, enemy
units or historically surveyed city footprints. Decoration is clipped to its
province, seeded independently from simulation RNG, and absent in Balanced/2D.

Web and native share the same WebGL / OpenGL ES renderer. Expo GL supplies the
native context; MapLibre remains the interactive 2D map. Province selection,
political coloring and camera continuity remain independent of quality. Pointer
wheel and pinch zoom preserve the geographic point beneath the gesture.

## Cost controls

- Terrain is one indexed draw; High scenery adds at most one batch and 90,000
  vertices. Both meshes fit unsigned-short indices without an extension.
- A padded, snapped mesh avoids rebuilds per drag pixel. Normals are baked rather
  than recomputed per mesh vertex. Ownership updates change only a small palette.
- Animated water is capped at 30 fps. Reduced Motion renders on demand; background
  scenes stop the frame loop. Unmount and quality changes free GPU resources.
- Balanced caps render scale at 1.5; High at 2.5. MSAA is disabled. Neither quality
  changes simulation speed or tick scheduling.
- Province IDs and octahedral normals upload as two-channel LUMINANCE_ALPHA,
  avoiding an expanded RGBA province copy. Decoded atlas payloads total about
  64 MiB in Balanced and 160 MiB in High. Texture upload payloads total about
  56 MiB and 128 MiB respectively. Filtered material/normal mipmaps add about
  8 MiB and 32 MiB to avoid distant shimmer and improve texture locality, plus
  mesh/framebuffers. Drivers can choose
  different internal storage; these are payload budgets, not measured VRAM.
  Parsing/decompression has a higher temporary peak.
- Only the chosen 3D atlas is decoded. Native bundles both for offline use; web
  lazily downloads each and runtime-caches it after first use. Allocation/context
  failure returns to 2D. Native 2D keeps its 2048-pixel relief and 30 fps map cap.

## Coverage and verification

Native ships the 1830 campaign. Web 3D supports 1830 real geography in Political
and Terrain. Other eras, generated geography and analytical overlays retain the
interactive 2D atlas with an explanation. The 1830 mask must never be reused for
a different historical scenario.

Unit checks cover geographic projection, source provenance, land/ocean picking,
quality budgets, preference persistence and frame scheduling. Browser acceptance
covers actual shader execution, high-byte province IDs, camera anchoring, scenery,
visibly different water frames, the live animation loop while paused, quality
switches, small viewports and context-loss recovery.

Run `npx playwright test --config playwright.graphics.config.ts`. Software WebGL
verifies behavior and images, not iPhone GPU frame times, thermals or battery life.
Physical-device profiling is still required; no 60 fps claim is made.

## Rebuilding assets

`python3 scripts/build-terrain-atlas.py --cache <download-cache>` generates Balanced.
Add `--quality high` for High. Pillow/numpy are required. Tile SHA-256 provenance
and the game geometry hash are checked in separately for each tier. Elevations derive
from public Mapzen Terrarium data; surface color also uses public-domain Natural
Earth I (NE1_LR_LC). The rebuild downloads its source once into the supplied cache;
`--landcover <zip>` can reuse an existing copy. All source hashes are recorded; provider notices are exposed in native Terrain
data credits and web Credits. No tile service is contacted during gameplay.
