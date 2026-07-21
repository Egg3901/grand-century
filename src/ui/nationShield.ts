/**
 * nationShield — deterministic SVG nation shields (0.9.0 V2).
 *
 * Every nation gets a heraldic cartouche generated at runtime from its
 * (color, tag) pair — zero assets, zero network, fully deterministic so the
 * same tag always renders the same shield. Reuses the engraved idiom of
 * `mapCounters.ts` (heater shield, parchment keyline, ink stroke) scaled for
 * UI use: HUD chips, list rows, the menu nation browser, event cards.
 *
 * Variants are seeded from the tag hash so nations differ in silhouette
 * (heater / roundel / banner) and field treatment (plain / chief / pale /
 * quartered) without any hand-authored data.
 */

import { mixHex } from '../map/mapDecor';

const INK = '#26180c';
const PAPER = '#f6ecd4';
const HEX_RGB = /^[0-9a-fA-F]{6}$/;

export type ShieldVariant = 'heater' | 'roundel' | 'banner';
export type FieldPattern = 'plain' | 'chief' | 'pale' | 'quartered';

function hashTag(tag: string): number {
  let h = 2166136261;
  for (let i = 0; i < tag.length; i += 1) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toHex(color: [number, number, number]): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `${c(color[0])}${c(color[1])}${c(color[2])}`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface NationShieldInput {
  tag: string;
  /** Nation pigment as [r,g,b] (snapshot shape) or '#rrggbb'. */
  color: [number, number, number] | string;
}

/**
 * Deterministic shield SVG for a nation. `size` is the px width/height of the
 * rendered viewBox square; strokes are tuned to stay crisp at 16–48px.
 */
export function nationShieldSvg(input: NationShieldInput, size = 24): string {
  const tag = (input.tag || '???').slice(0, 3).toUpperCase();
  const hash = hashTag(tag);
  const variant: ShieldVariant = (['heater', 'roundel', 'banner'] as const)[hash % 3];
  const pattern: FieldPattern = (['plain', 'chief', 'pale', 'quartered'] as const)[(hash >>> 3) % 4];

  const field = typeof input.color === 'string'
    ? (HEX_RGB.test(input.color.replace('#', '')) ? `#${input.color.replace('#', '')}` : '#5a4330')
    : `#${toHex(input.color)}`;
  const light = mixHex(field, '#f3e7c8', 0.42);
  const rim = mixHex(field, '#1d1207', 0.42);

  const monogram = escapeXml(tag);
  const fontSize = tag.length >= 3 ? 8.5 : 9.5;

  let body = '';
  if (variant === 'heater') {
    body += `<path d="M16 2 L29 5.4 V17.5 C29 26.4 23.6 33.2 16 36 C8.4 33.2 3 26.4 3 17.5 V5.4 Z" fill="${field}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
    if (pattern === 'chief') {
      body += `<path d="M16 2 L29 5.4 V11 H3 V5.4 Z" fill="${light}" opacity="0.9"/>`;
    } else if (pattern === 'pale') {
      body += `<path d="M12 3.3 L20 3.3 L20 33.6 C18.7 34.4 17.4 35.2 16 36 C14.6 35.2 13.3 34.4 12 33.6 Z" fill="${light}" opacity="0.75"/>`;
    } else if (pattern === 'quartered') {
      body += `<path d="M16 2 L29 5.4 V17.5 C29 21.9 27.5 25.8 24.9 29 L16 20 Z" fill="${light}" opacity="0.75"/>`;
      body += `<path d="M16 2 L3 5.4 V17.5 C3 21.9 4.5 25.8 7.1 29 L16 20 Z" fill="${light}" opacity="0.45"/>`;
    }
    body += `<path d="M16 4.6 L26.6 7.4 V17.2 C26.6 24.6 22.2 30.6 16 33.4 C9.8 30.6 5.4 24.6 5.4 17.2 V7.4 Z" fill="none" stroke="${PAPER}" stroke-width="0.85" stroke-linejoin="round" opacity="0.55"/>`;
    body += `<text x="16" y="23.5" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${PAPER}" stroke="#1f140d" stroke-width="0.8" paint-order="stroke" style="font-family: var(--gc-font-display), serif;">${monogram}</text>`;
  } else if (variant === 'roundel') {
    body += `<circle cx="16" cy="16" r="13.6" fill="${field}" stroke="${INK}" stroke-width="1.4"/>`;
    if (pattern === 'chief' || pattern === 'quartered') {
      body += `<path d="M2.4 16 A13.6 13.6 0 0 1 29.6 16 Z" fill="${light}" opacity="0.85"/>`;
    } else if (pattern === 'pale') {
      body += `<path d="M11.5 3.5 L20.5 3.5 L20.5 28.5 L11.5 28.5 Z" fill="${light}" opacity="0.75" clip-path="circle(13.6px at 16px 16px)"/>`;
    }
    body += `<circle cx="16" cy="16" r="11.2" fill="none" stroke="${PAPER}" stroke-width="0.85" opacity="0.55"/>`;
    body += `<text x="16" y="20" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${PAPER}" stroke="#1f140d" stroke-width="0.8" paint-order="stroke" style="font-family: var(--gc-font-display), serif;">${monogram}</text>`;
  } else {
    // banner — swallow-tailed pennant
    body += `<path d="M4 4 L28 4 L24 16 L28 28 L4 28 Z" fill="${field}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
    if (pattern === 'chief' || pattern === 'pale') {
      body += `<path d="M4 4 L28 4 L26.4 9.3 L4 9.3 Z" fill="${light}" opacity="0.85"/>`;
    } else if (pattern === 'quartered') {
      body += `<path d="M4 4 L16 4 L16 28 L4 28 Z" fill="${light}" opacity="0.5"/>`;
    }
    body += `<path d="M6.4 6.4 L25 6.4 L21.8 16 L25 25.6 L6.4 25.6 Z" fill="none" stroke="${PAPER}" stroke-width="0.85" stroke-linejoin="round" opacity="0.55"/>`;
    body += `<text x="14.6" y="20" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="${PAPER}" stroke="#1f140d" stroke-width="0.8" paint-order="stroke" style="font-family: var(--gc-font-display), serif;">${monogram}</text>`;
  }

  // engraved rim shadow (same trick as mapCounters)
  body += `<path d="M16 2 L29 5.4 V17.5 C29 26.4 23.6 33.2 16 36 C8.4 33.2 3 26.4 3 17.5 V5.4 Z" fill="none" stroke="${rim}" stroke-width="0.7" opacity="0.4" transform="translate(0.35 0.45)" style="display: ${variant === 'heater' ? 'block' : 'none'}"/>`;

  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Data-URI form for CSS backgrounds / img src. */
export function nationShieldDataUri(input: NationShieldInput, size = 24): string {
  return `data:image/svg+xml,${encodeURIComponent(nationShieldSvg(input, size))}`;
}
