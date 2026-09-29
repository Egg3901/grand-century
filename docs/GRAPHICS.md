# Terrain graphics

Grand Century offers an explicit **2D / Low power** and **3D / Terrain** choice.
The choice persists locally and does not alter the campaign or simulation.
2D is the conservative default; a player can opt into 3D without hardware guessing.

## Rendering

Web and iOS/Android share `TerrainRenderer`, a small OpenGL ES / WebGL renderer.
MapLibre Native does not support its web counterpart's raster-DEM terrain, so the
3D mode uses Expo GL on native and a WebGL canvas on web. It renders actual
height geometry rather than pitching a flat relief image. Both retain the
existing React / React Native game interface and authoritative simulation.

The offline atlas contains 2048-pixel elevation and biome fields plus a 4096-pixel
province mask. It is generated from Mapzen Terrarium elevation tiles and the
1830 game province geometry. Biome tint, slope shade and altitude snow tint are
artistic derivatives. Heights are exaggerated 12 times for legibility at strategy
map scale. Coast and province picking use the same geographic mask; ray picking
accounts for elevated terrain. Homeland label anchors are independent of the
simulation's capital relocation.

Water uses moving surface normals, restrained directional wave variation,
specular highlights and a coastal tint. It does not run a fluid simulation or
claim physically measured water depth. All assets ship with native. Web downloads
and runtime-caches the optional atlas only when 3D is selected; after it has loaded
once, it is available offline. Failed loading or context loss returns to 2D.
Attribution is available through Terrain data credits in native and Credits on web.

## Cost controls

- One scene draw call; 128 x 128 cells, 32,768 triangles, unsigned-short indices.
- Mesh updates use a padded, snapped view region instead of rebuilding on every
  drag pixel. Simulation updates only recolor a tiny palette when owners/colors change.
- Water animation is capped at 30 fps. Reduced motion renders only changed frames.
  Background scenes stop their frame loop, and unmount frees GPU resources.
- Render scale is capped at 1.5, with MSAA disabled. Province texture resolution
  does not increase triangle count. The high-resolution masks are allocated only
  in 3D; devices without sufficient texture support fall back to 2D.
- 3D retains about 56 MiB of decoded CPU atlas data and 80 MiB of GPU textures,
  plus mesh/framebuffers. Decoding and texture upload have a higher temporary peak.
  These costs are why 2D remains the default on unprofiled devices.
- Native 2D uses a static 2048-pixel relief (16 MiB decoded rather than 64 MiB),
  no water timer, and a 30 fps native map cap.

## Coverage and verification limits

Native currently ships the 1830 campaign, which the 3D atlas supports. On web,
3D supports the 1830 real geography in Political/Terrain modes. Other historical
geometries, generated geography and analytical overlays retain the existing
interactive 2D atlas with an explicit explanation. The renderer must not paint
1830 province IDs onto a different scenario. This is not an assertion that every
web overlay has been ported to 3D.

`tests/graphics.terrain.test.ts` checks projection, independent geographic
landmarks, ocean/land picking, mesh/pixel budgets and frame scheduling.
`tests/e2e/graphics-terrain.spec.ts` exercises the production UI, province selection,
mode switches, small viewport controls and context-failure recovery.

Run `npx playwright test --config playwright.graphics.config.ts` for isolated
browser acceptance. Linux software WebGL verifies behavior and shader execution,
not phone GPU frame rate, thermal behavior or battery life. Physical iPhone and
low-end Android profiling remains necessary before raising quality defaults.

## Rebuilding assets

`python3 scripts/build-terrain-atlas.py --cache <download-cache>` requires Pillow
and numpy. The script records source-tile SHA-256 hashes in
`src/graphics/terrain-provenance.json`; data-provider notices live in
`public/terrain-attribution.txt` and the bundled native credits. It makes no runtime
requests to the tile provider. See `apps/mobile/assets/map/SOURCE.md` for the
Natural Earth 2D relief provenance.
