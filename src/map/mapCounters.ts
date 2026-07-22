/**
 * mapCounters — heraldic army/fleet map tokens + wax-seal event badges (0.5.2).
 *
 * Replaces the plain "A2 / F1" pill badges with engraved, owner-colored
 * counters that sit naturally on the antique-atlas plate:
 *   - armies: a heater shield bearing the regiment count;
 *   - fleets: a round-bottomed naval cartouche riding two engraved waves;
 *   - both carry a strength ribbon beneath (wax-red for the player's units).
 *
 * Everything is a static DOM marker (inline SVG, no network assets); MapLibre
 * positions the element, CSS handles hover/selection — zero per-frame JS.
 */

import { mixHex } from './mapDecor';

const INK = '#26180c';
const PAPER = '#f6ecd4';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type UnitCounterOptions = {
  kind: 'army' | 'fleet';
  /** Regiment count (army) or ship count (fleet). */
  count: number;
  /** Average strength, 0..100. */
  strengthPct: number;
  /** Owner pigment (#rrggbb). */
  color?: string;
  friendly: boolean;
  selected: boolean;
  title?: string;
  /** Nation tag for the flag chip (validated A-Z 2-3). */
  tag?: string;
};

function safeColor(color: string | undefined, fallback: string): string {
  return color && HEX_COLOR.test(color) ? color : fallback;
}

function counterText(count: number): string {
  const clamped = Math.max(0, Math.min(999, Math.round(count)));
  return String(clamped);
}

/**
 * Heater shield (army). Field in owner pigment, lighter chief band, parchment
 * keyline inset, dark plate stroke, engraved numeral.
 */
function armySvg(count: number, field: string): string {
  const chief = mixHex(field, '#f3e7c8', 0.32);
  const rim = mixHex(field, '#1d1207', 0.42);
  const text = counterText(count);
  const fontSize = text.length >= 3 ? 12.5 : text.length === 2 ? 14.5 : 16;
  return (
    `<svg viewBox="0 0 34 40" aria-hidden="true">`
    + `<path d="M17 1.6 L31.4 5.5 V19 C31.4 28.8 25.6 35.7 17 38.7 C8.4 35.7 2.6 28.8 2.6 19 V5.5 Z" fill="${field}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
    + `<path d="M17 1.6 L31.4 5.5 V11.4 H2.6 V5.5 Z" fill="${chief}" opacity="0.85"/>`
    + `<path d="M17 4.4 L28.9 7.6 V18.7 C28.9 26.8 24.1 32.7 17 35.6 C9.9 32.7 5.1 26.8 5.1 18.7 V7.6 Z" fill="none" stroke="${PAPER}" stroke-width="0.9" stroke-linejoin="round" opacity="0.55"/>`
    + `<path d="M17 1.6 L31.4 5.5 V19 C31.4 28.8 25.6 35.7 17 38.7 C8.4 35.7 2.6 28.8 2.6 19 V5.5 Z" fill="none" stroke="${rim}" stroke-width="0.7" stroke-linejoin="round" opacity="0.5" transform="translate(0.4 0.5)"/>`
    + `<text x="17" y="24.5" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${PAPER}" stroke="#1f140d" stroke-width="0.85" paint-order="stroke" style="font-family: var(--gc-font-display), serif;">${text}</text>`
    + `</svg>`
  );
}

/**
 * Naval cartouche (fleet). Round-bottomed escutcheon riding two engraved
 * waterlines that break past its sides — reads "naval" at a glance.
 */
function fleetSvg(count: number, field: string): string {
  const chief = mixHex(field, '#f3e7c8', 0.32);
  const text = counterText(count);
  const fontSize = text.length >= 3 ? 11.5 : text.length === 2 ? 13.5 : 15;
  return (
    `<svg viewBox="0 0 40 38" aria-hidden="true">`
    + `<path d="M20 1.8 C28.2 1.8 33.6 5.2 33.6 11.6 C33.6 20.4 28.4 27.2 20 30.8 C11.6 27.2 6.4 20.4 6.4 11.6 C6.4 5.2 11.8 1.8 20 1.8 Z" fill="${field}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
    + `<path d="M20 1.8 C28.2 1.8 33.6 5.2 33.6 11.6 L33.6 12.6 L6.4 12.6 L6.4 11.6 C6.4 5.2 11.8 1.8 20 1.8 Z" fill="${chief}" opacity="0.85"/>`
    + `<path d="M20 4.4 C26.6 4.4 31.2 7.2 31.2 12 C31.2 19.2 26.8 24.9 20 28.1 C13.2 24.9 8.8 19.2 8.8 12 C8.8 7.2 13.4 4.4 20 4.4 Z" fill="none" stroke="${PAPER}" stroke-width="0.9" stroke-linejoin="round" opacity="0.55"/>`
    + `<path d="M2 30.6 Q5.4 27.8 9 30.6 T16 30.6 T23 30.6 T30 30.6 T37.8 30.6" fill="none" stroke="${INK}" stroke-width="1.25" stroke-linecap="round" opacity="0.8"/>`
    + `<path d="M5.6 34.4 Q9 31.8 12.4 34.4 T19.4 34.4 T26.4 34.4 T33.6 34.4" fill="none" stroke="${INK}" stroke-width="1.05" stroke-linecap="round" opacity="0.5"/>`
    + `<text x="20" y="20.2" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${PAPER}" stroke="#1f140d" stroke-width="0.85" paint-order="stroke" style="font-family: var(--gc-font-display), serif;">${text}</text>`
    + `</svg>`
  );
}

/** Build the heraldic counter button for an army or fleet stack. */
export function createUnitCounterElement(options: UnitCounterOptions): HTMLButtonElement {
  const field = safeColor(options.color, '#6b5844');
  const pct = Math.max(0, Math.min(100, Math.round(options.strengthPct)));
  const el = document.createElement('button');
  el.type = 'button';
  el.className = [
    'grand-map__unit',
    options.kind === 'army' ? 'is-army' : 'is-fleet',
    options.friendly ? 'is-friendly' : 'is-hostile',
    options.selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');
  if (options.title) el.title = options.title;
  if (pct <= 50) el.dataset.low = '1';
  // Static template; every interpolation is a validated hex color or number.
  el.innerHTML = (
    `<span class="grand-map__unit-body">${options.kind === 'army' ? armySvg(options.count, field) : fleetSvg(options.count, field)}</span>`
    + `<span class="grand-map__unit-ribbon">${pct}%</span>`
  );
  // U4: a tiny flag chip answers "whose army is that?" at a glance — the
  // shield pigment alone never did.
  if (options.tag && /^[A-Z]{2,3}$/.test(options.tag)) {
    const flag = document.createElement('img');
    flag.className = 'grand-map__unit-flag';
    flag.src = `${import.meta.env.BASE_URL}flags/${options.tag}.svg`;
    flag.alt = '';
    flag.draggable = false;
    flag.addEventListener('error', () => flag.remove());
    el.appendChild(flag);
  }
  return el;
}

export type SealKind = 'battle' | 'siege' | 'blockade' | 'rebel';

/** Text-presentation glyphs (never colored emoji) for the wax seals. */
const SEAL_GLYPHS: Record<SealKind, string> = {
  battle: '⚔︎',
  siege: '♜︎',
  blockade: '⚓︎',
  rebel: '☠︎',
};

/** Build a wax-seal event badge (battle / siege / blockade / rebellion). */
export function createSealElement(kind: SealKind, title: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `grand-map__seal is-${kind}`;
  el.title = title;
  const glyph = document.createElement('span');
  glyph.className = 'grand-map__seal-glyph';
  glyph.textContent = SEAL_GLYPHS[kind];
  el.appendChild(glyph);
  return el;
}
