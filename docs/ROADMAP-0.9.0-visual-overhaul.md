# Grand Century — Visual / Display Overhaul Plan (v0.9.0)

**Status:** proposal, awaiting owner green light.
**Scope:** display layer only. Zero sim, zero game-logic, zero save-format changes. Every gate is a build + test + screenshot review.
**Date:** 2026-07-21

---

## Where the game actually is (honest audit)

The 0.5.x "atlas overhaul" already landed and it shows — the bones are **good**:

- Real design system: `src/ui/theme.css` tokens (paper/leather/ink/wax palette, EB Garamond + Source Serif 4 self-hosted, 4/8 spacing, shared `.atlas-panel` chrome).
- Map has genuine craft: engraved-sea tiles, waterline rings, land plate-shadow, ocean lettering, terrain hachure tints (`src/map/mapDecor.ts`), paper grain + varnish + vignette composited static (zero per-frame cost).
- Unit counters are proper heraldic shields with strength ribbons (`src/map/mapCounters.ts`) — not pills.
- 9 map modes, province tooltips, letterpress labels.

**What's weak, ranked by how much it costs the first impression:**

1. **The main menu is a form, not a title screen.** `MainMenu.tsx` is literally a centered card with a `<select>` of 21 nations, a raw seed text input, and one button. No art (the bundled `src/assets/hero.png` is **unused**), no nation flavor, no resume/autosave row, no sense of the 1836 world. It's the first thing a player sees and it reads like a settings dialog.
2. **No flags anywhere.** A grand-strategy map game with zero heraldry at nation level. HUD top-bar shows the nation as plain text; diplomacy panel is text rows; the map paints nation *colors* but there is no flag chip, shield, or cartouche tying a nation to its identity. The shield SVG machinery already exists in `mapCounters.ts` and is only used for armies.
3. **Panel typography is uniform.** Every panel is `panel-card atlas-panel` + the same `atlas-heading` + rows of body text and native-feeling range sliders. Budget, Market, Military, and Great Powers are visually indistinguishable at a glance. Numbers are not tabular (no `font-variant-numeric`), so ledgers jitter and don't read as ledgers.
4. **Information hierarchy inside panels is flat.** No sparklines, no bars, no delta arrows, no color-coded good/bad beyond text color on a few elements. Budget is sliders + a list; Market is a table of numbers; GP ranking is a numbered list. The sim has rich data (treasury history, prices, tension, warscore) and the UI renders it as paragraphs.
5. **HUD chrome is fine but generic.** Top bar: date, speeds, money, nation name-as-text, infamy pill. The left rail is 13 text buttons stacked; the mapmode bar is 9 text buttons. Nothing groups, nothing is iconified, and on a 1080p screen the chrome eats ~15% of the vertical space for what it delivers.
6. **No motion design.** Panels appear/disappear (no slide/fade), events pop instantly, mapmode switches hard-cut. The varnish transitions on zoom bands (400ms opacity fades on ocean labels) prove the engine can do cheap CSS transitions — the rest of the UI just doesn't.
7. **Empty/edge states are text.** "Awaiting treasury data..." etc. Functional, charmless.

The floor is high. This is a **polish-and-identity pass**, not a rescue.

---

## Art direction (binding)

**"The Foreign Office reading room, 1836."** Everything already points here — the overhaul finishes the job:

- The map is the printed plate; the UI is the **furniture on top of it**: leather-bound ledgers, brass instruments, wax seals, engraved plates.
- One accent discipline: wax red (`--gc-wax`) is for *the player's agency* (your units, your primary actions, your nation's edge); everything else stays ink/sepia. Today the accent is applied consistently to buttons — extend that rule to data (your row in a ranking, your front line, your selected stack).
- Real 19th-century visual artifacts only: steel-engraving hachures, letterpress, blind-embossed rules, cartographic cartouches. No glows, no gradients-that-read-as-digital, no rounded-corner "web app" energy beyond what exists.
- **Flags as heraldry, not emoji.** Every nation gets a generated shield cartouche (same SVG machinery as `mapCounters.ts`) seeded from its color + tag — historically *flavored* (Britain gets a quartered shield silhouette, etc.) without needing 21 hand-drawn assets. Optionally swap in real public-domain flags later; the system is the deliverable.

---

## Phases (each independently shippable, gated)

### V1 — Title screen & first impression (~1 session)

The single biggest ROI item.

- **Hero treatment**: use the existing `src/assets/hero.png` (or regenerate a proper 1836 map-plate hero via the content pipeline) as a full-bleed backdrop under the menu card, dimmed with the existing overlay tokens. Title gets an engraved display treatment (EB Garamond smallcaps at clamp(2.5rem), letterpress shadow, thin double rule under).
- **Nation select becomes a nation browser**: grid of shield cartouches (flag system from V2) with name + tag + a one-line flavor stat ("Britain — 14 provinces, Great Power #1, Constitutional Monarchy"). Sorted with GPs first. Search box. This kills the `<select>`.
- **Seed input demoted** behind an "Advanced" disclosure; a dice button rerolls it.
- **Resume row**: if autosaves exist (the save slot machinery already lists IndexedDB slots), show "Continue — Britain, 1847, turn 512" as the primary action, above New Game.
- Gate: Playwright screenshot of menu at 1600×950 + 390×844; `npm run build && npm run test` green; owner eyeball.

### V2 — National identity: flags & nation chrome (~1 session)

- `src/ui/nationShield.ts`: deterministic SVG shield generator — (color, tag) → heater-shield/roundel variants with engraved tag monogram + nation-color field + parchment keyline. Reuses `mixHex` from `mapDecor.ts` and the counter idiom. Zero assets, zero network.
- HUD top-bar: nation name gets its shield; player's shield gets the wax-red rim (the accent rule).
- Diplomacy panel, Great Powers ranking, war declarations, peace conference, event cards: every nation mention gets its 18px shield inline. This one change makes every list in the game scannable.
- Map: nation labels at far zoom get a small shield chip before the name (MapLibre symbol layer `icon-image` from a runtime-generated sprite sheet, or DOM markers if label count is small — measure).
- Gate: shields render for all 21 nations at 3 sizes; diplomacy panel screenshot; perf check on far zoom (marker count budget).

### V3 — Ledger-grade panels (~2 sessions, the meat)

Restyle panel *internals* without touching layout logic:

- **Tabular data discipline**: `font-variant-numeric: tabular-nums` on all numeric surfaces; right-aligned number columns; ledger rules (hairline `var(--gc-rule)` row separators) on every list that is actually a table (Budget lines, Market prices, Production queue, GP scores).
- **Micro-visualizations** (pure CSS/SVG, no chart lib):
  - Budget: treasury sparkline (last 24 months from budget history if snapshotted, else a static income/expense bar pair); tax sliders get per-bracket revenue readouts with up/down carets colored by sign.
  - Market: price cells get a 7-period inline sparkbar + ▲▼ vs last month; supply/demand as a two-tone horizontal bar (the data already feeds TraceTooltip — now it's visible without hovering).
  - Great Powers: ranking rows get score bars normalized to #1; your nation row gets the wax accent.
  - Military: regiment strength as engraved pips (the shield counters' ribbon idiom, inline).
  - Crisis/Concert: tension meter becomes a brass-gauge arc (SVG), sides shown as opposing shield rows.
- **Panel identity**: each panel gets a small engraved heading plate (icon + heading + thin rule). Icons: a tiny inline-SVG set (~14 glyphs: scales, coin, factory, crowd, globe, scroll, crown, sword, anchor, flask, map, flag, gavel, ledger) drawn in the same ink style. One file, `src/ui/icons.ts`.
- Panel entrance: 160ms slide-up + fade (transform+opacity only, `prefers-reduced-motion` respected). Mapmode buttons get a 120ms active-state transition.
- Gate: screenshot every panel before/after at 1600×950; numeric jitter check (record a 5s treasury tick); `npm run test` green.

### V4 — Map presentation pass (~1 session)

The map is the strongest surface; these are refinements, not rework:

- **Zoom-band label choreography**: province labels currently pop; give them the same 400ms crossfade the ocean labels have. Country labels gain a slight tracking-out at far zoom (letterpress feel).
- **Selected province cartouche**: the click panel stays, but the map itself gets an engraved selection ring (SVG marker) + the province name in a small cartouche at the polylabel — Vic2's "you are here" cue.
- **War visibility**: active battle sites get a crossed-swords marker with a subtle ember pulse (CSS animation, 2s, opacity-only — no repaint of the plate); occupied provinces get a diagonal hachure overlay fill (MapLibre fill-pattern from a runtime-generated hatch tile, same trick as the terrain tiles).
- **Borders at war**: front-line borders between enemies get a 2px wax-red casing (data-driven line layer, existing border machinery).
- Coastal waterline rings and terrain tints already exist — audit their zoom thresholds so mid-zoom doesn't go flat (cheap tuning pass in `mapDecor.ts` call sites).
- Gate: screenshots at 3 zoom bands × political/terrain modes + a live-war scene staged via test seed; frame-time check on marker-heavy scene.

### V5 — Events, outliner & feedback polish (~1 session)

- Event popups: wax-seal badge (the `mapCounters` seal idiom) stamped on the card, 200ms scale-in with a paper-flick shadow; severity color-coding stays within palette (war = wax red, good news = deep green `--gc-positive`, neutral = ink).
- Outliner alerts get icons + shield chips; event feed items get severity left-rules.
- Speed controls: current speed is the wax-filled button (already true) — add a subtle "press" micro-interaction + a tick sound hook through the existing AudioManager.
- Tutorial coach marks restyled to match (same heading plate as panels).
- Gate: Playwright e2e (declare war, capture popup); mobile viewport check for popup layout.

### V6 — Mobile display pass (~½–1 session, after V1–V3 settle)

- The 0.8.0 tap-latency fix landed; this is visual: sheet-style panels get the heading plate + safe-area padding audit; the mobile top bar collapses nation shield + date + treasury into one row; drawers inherit panel chrome.
- Gate: 390×844 screenshots of menu, HUD, 3 panels, war popup.

---

## Explicitly out of scope

- No sim/balance changes. No save-format changes. No new dependencies (no chart library, no icon font, no flag CDN). All art is runtime SVG/CSS — bundle stays as-is.
- No rework of MapLibre layer architecture, province geometry, or the 0.5.1 atlas plate (grain/varnish/waterlines stay).
- No dark mode (the parchment plate IS the theme; a night variant is a separate, larger discussion).
- Real historical flags: deferred. The shield system is designed to accept them later as an asset swap.

## Risks

- **Marker budget on far zoom** (V2 map shields): if the label layer gets heavy, fall back to shields only for GPs + player at far zoom, all at mid. Measured at the V2 gate.
- **Scope creep in V3**: 15 panels exist. The micro-viz set above is the ceiling; any panel not listed gets typography/rules only.
- **Determinism/QA**: visual-only diffs must keep `npm run test:all` (141 tests) green; the e2e smoke (boot → year → war) must stay green after every phase.

## Sequencing

V1 → V2 → V3 → V4 → V5 → V6, each its own commit(s) on `master` after the standard gate (build + tests + dev-serves + screenshots reviewed by owner). V1+V2 can land same day. V3 is the long pole. Total: ~4–6 sessions.
