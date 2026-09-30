# Homepage atlas plate

`menu-atlas.svg` is an original code-drawn engraving built from the game's
bundled Natural Earth physical coastline. It is decorative and includes no
political boundaries. Coastline source and license provenance are retained in
`content/terrain/coast-source.json`.

Run `node scripts/build-menu-atlas.mjs` with the project's Playwright Chromium
installed. It rebuilds this vector plate and `src/assets/home/menu-atlas.png`.
Web and native share the prerendered PNG to avoid repeatedly evaluating the
paper-grain SVG filter on low-end graphics. The plate needs no network access.

Copy is shared through `src/ui/homeContent.ts`. Web retains its campaign roster
and advanced options; native retains its campaign wizard, persistent save
library, multiplayer and account entry points.
