# Releasing Grand Century

The source repository uses `master` for approved releases. The website is a
static Cloudflare Pages project named `grand-century`, with production branch
`main`, served through `https://lakesidegames.net/games/grand-century/`. The
multiplayer server runs on Railway. The former VPS build/rsync/systemd release
route was retired in August 2026. Do not use it or change a shared dirty
checkout to publish a release.

## Validate the candidate

Work in an isolated git worktree and open a PR against `master`. The Native
mobile workflow checks web/mobile types, the full unit suite, worker bundling,
web production build, web graphics and native presentation flows. It also
compiles Android and tests the real iOS renderer and Hermes save/restore path.
The workflow retains `web-refinement-release`, `android-parity-release` and
`ios-graphics-smoke` artifacts. Require every applicable gate to pass on the
exact candidate before merge.

Simulation or scenario changes additionally need their balance, persistence
and historical-content gates. Presentation changes need relevant portrait,
landscape, gameplay and graphics checks. Browser adapters are not evidence of
physical iOS or Android gesture, accessibility, lifecycle or performance QA.
See `docs/NATIVE-PARITY.md` for remaining device checks.

## Publish the web build

The production build must use `VITE_BASE=/games/grand-century/`. The CI web
artifact is already built with that base. A root-base build will fail when
served below the public game path. Web and native production clients connect
directly to the Railway endpoint in `src/net/productionServer.ts`; Pages does
not provide the multiplayer WebSocket route. Explicit `VITE_MP_WS_URL`
overrides still support custom deployments.

The Web release packaging workflow also checks the 25 MiB Pages per-file limit
and runs the production High renderer at the public game path, including an
offline reload. High terrain is served as four hashed compressed text fields
by `scripts/web-terrain-assets.ts`; its decoded data matches the bundled native
atlas exactly. Run `node scripts/check-web-assets.mjs dist` before any upload.

After the candidate passes and merges, verify that its git tree matches the
merged `master` tree. Download the successful candidate's web artifact and
publish it through the existing Cloudflare deployment credentials:

```sh
npx wrangler pages deploy <reviewed-dist-directory> --project-name grand-century --branch main --commit-hash <reviewed-candidate-sha>
```

Confirm the Pages production deployment succeeds and the public URL serves the
new index chunk. Check the frontend build stamp, hashed assets, service worker
and a fresh-profile campaign start. Confirm the production WebSocket endpoint
accepts connections. Existing PWA clients must accept the update to load the new
shell. Save slots remain on the player's device.

The frontend build stamp names the reviewed artifact SHA. That may differ from
the squash-merge SHA; the verified matching git trees establish the identity of
the source. For a numbered web release, update `package.json` and the changelog
before testing and publish the matching GitHub release afterward.

## Deliver the native beta

Dispatch `ios-testflight.yml` from `master` with `reviewed_sha` equal to the
full merged SHA. Require the signed workflow to succeed, then verify Apple
processing is VALID and the build is IN_BETA_TESTING with access for the existing
internal tester group. An upload alone is not an available beta.

The Android release artifact supports physical-device acceptance. Keep signed
iOS credentials and raw signing output private. See `docs/IOS-RELEASE.md`.

## Save compatibility

Saves use the shared versioned compressed serializer and world/content
fingerprint checks. Scenario identity and province IDs must remain consistent
with the saved world. Geometry or scenario-data changes need explicit
compatibility handling and restore tests. Presentation-only releases must
preserve saves and simulation rules.
