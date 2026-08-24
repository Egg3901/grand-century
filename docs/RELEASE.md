# Releasing Grand Century

Every step here exists because skipping it has cost us something. Read the
notes, not just the commands.

## Branches

`master` **is production.** `/root/bin/auto-deploy.sh` polls it on a 2-minute
timer, builds, rsyncs to `/var/www/grand-century/` and restarts the multiplayer
server. There is no staging environment and no promotion step.

`development` is the integration branch. Merge finished work there first. Nothing
deploys from it, so it is the right home for work that is complete but not yet
release-ready — a red balance band, an unfinished rebalance, anything you would
not want players to see this minute. Release means merging `development` into
`master`, at which point the gate below is not optional.

## Before you touch anything

**Merging to `master` deploys to production.** `/root/bin/auto-deploy.sh` polls
this repo on a 2-minute timer, builds `master` with the production base path,
rsyncs it to `/var/www/grand-century/`, and restarts `grand-century-server`.
There is no separate promotion step and no staging environment. A merge is a
deploy. Keep work on branches until the gate below is green.

**History is not linear.** Cursor agents push to this repo independently. Start
every release by fetching and by looking at what is open:

```sh
git fetch --all --prune
gh pr list --state open
git log --oneline origin/master..master   # must be empty before you start
```

**Use a worktree, not the shared checkout.**

```sh
git worktree add worktrees/release-X.Y.Z -b release/X.Y.Z master
```

Note that a fresh worktree has no `node_modules` of its own; module resolution
walks up to the parent checkout, which is fine for `vitest`/`vite`/`tsc` but is
worth remembering if a tool behaves oddly.

## The gate

All five must be green on the release commit. No exceptions, no "known reds".

| # | Command | Notes |
|---|---|---|
| 1 | `npm run lint` | oxlint. Warnings are tolerated; errors are not. |
| 2 | `npx tsc -b` | Must exit 0. |
| 3 | `npm run test` | Unit project, 31 files. ~105 s. |
| 4 | `npm run test:balance` | 5 long-run sims, 7 tests, **~6 minutes**. Excluded from `npm run test`; it is *not* optional at release time. |
| 5 | `npm run test:e2e:smoke` | The 3 specs that prove the game boots, plays and survives a reload. ~4 min. **Every release.** |
| 6 | `npm run test:e2e` | All 30 tests across 20 specs, serial, ~25 min. **Minor and major releases only**, or when a change touches the map, the HUD, panel chrome, or multiplayer. |

Step 6 is deliberately not on the patch-release path. Most of those 20 specs are
visual regression tests pinned to milestones that already shipped (`v1`–`v6`,
`ui-a`/`ui-b`, `mobile-ui-0.8`); running them against a one-line fix buys
nothing and costs 25 minutes. Judgement applies — if you touched
`GrandMap.tsx`, run the full suite regardless of what the version number says.

Do not run the test steps concurrently. This box has 12 cores and a resting
load average around 28 — it hosts the ops stack as well — so anything that
assumes a free machine will fail on timing rather than on correctness. Run them
one after another. If a test fails, re-run it standalone before believing it:

```sh
npx vitest run --project unit tests/<file>.test.ts
npx playwright test tests/e2e/<file>.spec.ts --reporter=line
```

A test that passes standalone and fails in the suite is a resourcing problem,
not a regression. Fix the timeout or the worker count — do not "fix" the code.

### Why e2e is serial

Every e2e spec boots a full 620-province world and runs the simulation in the
browser. Twenty of those in parallel starve each other; the suite failed 18 of
30 that way while every spec passed standalone. `playwright.config.ts` pins
`workers: 1`. Override with `PW_WORKERS=N` on a machine with headroom.

Two things to know about the e2e webServer setup:

- It reuses an existing server on **:3412**, which is the *live production*
  multiplayer server. The MP specs will create ephemeral lobby sessions on it.
  Check `journalctl -u grand-century-server.service --since "2 hours ago"` for
  activity first; do not run the MP specs while real players are in a lobby.
- The `prod-e6` project previews `dist/`. Build **without** `VITE_BASE` for the
  e2e run, or the preview serves from the wrong root and `e6-platform` fails.

## Cutting the release

1. Bump `version` in `package.json`. Nothing else carries the version — the
   build stamp, the GlitchTip release tag, and the main-menu label all derive
   from it via `define` in `vite.config.ts` (`src/buildInfo.ts`). This is
   deliberate: 1.0.0 shipped to production tagged `release: 'dev'` because the
   deploy command was expected to pass `VITE_RELEASE` and never did.
2. Move `## [Unreleased]` content into `## [X.Y.Z] — YYYY-MM-DD` in
   `CHANGELOG.md`, add the release link at the bottom of the section, and leave
   a fresh empty `## [Unreleased]` behind.
3. Open a PR against `master`. **Before merging, confirm the PR head is the
   commit you think it is:**

```sh
git rev-parse HEAD
gh pr view <N> --json headRefOid --jq .headRefOid   # must be identical
```

   This is not paranoia. 1.4.0 was merged with its version bump, changelog and
   lockfile missing, because the release commit was created but never reached
   the remote, and the PR had been opened against the previous tip. The code
   shipped fine; the release metadata did not. A published release sat with
   empty notes and the live build stamped the previous version number.

   Green gate, then merge.
4. Tag and publish:

```sh
git tag -a vX.Y.Z -m "Grand Century X.Y.Z — <name>"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "Grand Century X.Y.Z — <name>" --notes-file <notes>
```

Tagging without `gh release create` leaves the release invisible: 0.9.0 and
1.0.0 were both tagged and never published, so for five days the newest release
GitHub showed was 0.8.0.

## Verifying the deploy

Auto-deploy picks the merge up within ~2 minutes. Confirm rather than assume:

```sh
/root/bin/auto-deploy.sh --status | grep grand-century   # want "ok", SHAs equal
```

Then check the live bundle actually changed — the MCP does this in one call:

- `gc_status` (grand-century MCP) returns the repo SHA, the latest release tag,
  and the `index-*.js` chunk hash currently served at
  lakesidegames.net/games/grand-century. The chunk hash must differ from the
  previous release's.

And confirm the build stamp is real:

```sh
grep -ho '[0-9]\+\.[0-9]\+\.[0-9]\++[a-f0-9]\{8,\}' /var/www/grand-century/assets/*.js | sort -u
```

**The version half of that stamp matters as much as the SHA.** Both times this
has gone wrong, the SHA was correct and the version was not: 1.0.0 shipped
tagged `dev` because nothing set `VITE_RELEASE`, and 1.4.0 shipped stamped
`1.3.0` because the version bump never reached the remote. A correct SHA next to
a stale version means the build is real but `package.json` was not what you
thought when it ran.

Finally, check error reporting is alive. The `grand-century` GlitchTip project
sat at `firstEvent: null` for five days after error tracking "shipped" because
the DSN pointed at a host that 308-redirects to another origin. After a release,
confirm events carry the new `release` tag rather than assuming the pipe works.

## A dirty tree blocks the next deploy

`auto-deploy.sh` uses fast-forward-only pulls. Uncommitted changes in the
checkout make it abort, silently, forever. After releasing:

```sh
git status --short          # must be clean
/root/bin/auto-deploy.sh --status | grep grand-century
```

## Save compatibility

Saves are whole-`World` gzipped JSON gated on `SAVE_VERSION` in
`src/sim/persistence.ts`, which currently hard-rejects on mismatch. There is no
world fingerprint yet, so a save from a different world seed loads without error
and paints garbage. Until that lands: **do not change province ids, state ids,
or the world seed in a patch or minor release.** New fields must be optional and
self-healing, following the `Nation.stockpile` precedent.
