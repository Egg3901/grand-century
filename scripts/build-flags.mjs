#!/usr/bin/env node
/**
 * build-flags.mjs: era-appropriate nation flags (1820-1920) as small SVGs.
 *
 * Every flag is hand-specified geometry (stripes, crosses, cantons, stylized
 * emblems) in a muted palette that sits well on the engraved-atlas UI —
 * deliberately NOT modern flags: Habsburg black-gold Austria, 25-star US,
 * pre-1910 blue-white Portugal, Bourbon Two Sicilies, Tokugawa mon, etc.
 * Output: public/flags/<TAG>.svg (3:2, 60×40 viewBox), self-hosted so they
 * ride the PWA precache + Caddy cache — no runtime hotlinking.
 *
 * Run: node scripts/build-flags.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../public/flags');
mkdirSync(OUT, { recursive: true });

// Muted era palette (parchment white, ink black, desaturated hues).
const W = '#efe6d0'; // parchment white
const K = '#2b261e'; // ink black
const R = '#a83a2e'; // signal red
const CR = '#8e2f3c'; // crimson
const B = '#31517a'; // deep blue
const LB = '#8fb0cc'; // light blue
const Y = '#d4a93c'; // gold/yellow
const G = '#41764a'; // green
const O = '#c07a35'; // orange
const N = '#6b6252'; // neutral khaki (game constructs)

const WIDTH = 60;
const HEIGHT = 40;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">${body}</svg>`;
const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const field = (fill) => rect(0, 0, WIDTH, HEIGHT, fill);

function hstripes(colors, weights) {
  const ws = weights ?? colors.map(() => 1);
  const total = ws.reduce((a, b) => a + b, 0);
  let y = 0;
  return colors.map((c, i) => {
    const h = (HEIGHT * ws[i]) / total;
    const r = rect(0, y.toFixed(2), WIDTH, h.toFixed(2), c);
    y += h;
    return r;
  }).join('');
}

function vstripes(colors, weights) {
  const ws = weights ?? colors.map(() => 1);
  const total = ws.reduce((a, b) => a + b, 0);
  let x = 0;
  return colors.map((c, i) => {
    const w = (WIDTH * ws[i]) / total;
    const r = rect(x.toFixed(2), 0, w.toFixed(2), HEIGHT, c);
    x += w;
    return r;
  }).join('');
}

// Nordic cross offset toward the hoist.
function nordicCross(bg, fg) {
  const arm = 7;
  const cx = 22;
  return field(bg)
    + rect(cx - arm / 2, 0, arm, HEIGHT, fg)
    + rect(0, HEIGHT / 2 - arm / 2, WIDTH, arm, fg);
}

function star5(cx, cy, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.4;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

function sun(cx, cy, r, fill, rays = 12) {
  let out = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  for (let i = 0; i < rays; i++) {
    const a = (i * 2 * Math.PI) / rays;
    const x1 = cx + Math.cos(a) * (r + 1);
    const y1 = cy + Math.sin(a) * (r + 1);
    const x2 = cx + Math.cos(a) * (r + 3.4);
    const y2 = cy + Math.sin(a) * (r + 3.4);
    out += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${fill}" stroke-width="1.4"/>`;
  }
  return out;
}

function crescentStar(fill) {
  return `<circle cx="26" cy="20" r="9" fill="${fill}"/>`
    + `<circle cx="29.5" cy="20" r="7.6" fill="${R}"/>`
    + star5(38, 20, 4.2, fill);
}

function unionJack() {
  const diagW = `<path d="M0,0 L60,40 M60,0 L0,40" stroke="${W}" stroke-width="8"/>`;
  const diagR = `<path d="M0,0 L60,40 M60,0 L0,40" stroke="${R}" stroke-width="3"/>`;
  const crossW = rect(24, 0, 12, HEIGHT, W) + rect(0, 14, WIDTH, 12, W);
  const crossR = rect(27, 0, 6, HEIGHT, R) + rect(0, 17, WIDTH, 6, R);
  return field(B) + diagW + diagR + crossW + crossR;
}

function bavarianLozenges() {
  // blue field, white lozenges on a checkerboard so the pattern tessellates
  const bg = field('#6f93b8');
  const hw = 6, hh = 8; // half-width / half-height of a lozenge
  let d = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      if ((row + col) % 2 === 1) continue;
      const cx = col * hw * 2 - hw + (row % 2) * 0;
      const cy = row * hh * 2 - hh * 2;
      d += `M${cx},${cy - hh} L${cx + hw},${cy} L${cx},${cy + hh} L${cx - hw},${cy} Z `;
    }
  }
  return bg + `<path d="${d}" fill="${W}"/>`;
}

function prussianEagle(fill) {
  // stylized spread eagle: fanned wing feathers, body, head, tail
  let wings = '';
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const a = -Math.PI / 2 + i * 0.38;
    const x2 = 30 + Math.cos(a) * 14;
    const y2 = 21 + Math.sin(a) * 12;
    wings += `<line x1="30" y1="21" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${fill}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  return wings
    + `<ellipse cx="30" cy="21" rx="4" ry="7" fill="${fill}"/>`
    + `<circle cx="30" cy="12" r="2.6" fill="${fill}"/>`
    + `<path d="M30,10.5 L33,11.5 L30,13 Z" fill="${fill}"/>`
    + `<path d="M27,27 L30,33 L33,27 Z" fill="${fill}"/>`;
}

function crossedKeys(cx, cy) {
  return `<g stroke="${Y}" stroke-width="2" stroke-linecap="round">`
    + `<line x1="${cx - 6}" y1="${cy + 7}" x2="${cx + 6}" y2="${cy - 7}"/>`
    + `<line x1="${cx + 6}" y1="${cy + 7}" x2="${cx - 6}" y2="${cy - 7}"/>`
    + `</g>`
    + `<circle cx="${cx - 6}" cy="${cy + 7}" r="2.4" fill="none" stroke="${Y}" stroke-width="1.6"/>`
    + `<circle cx="${cx + 6}" cy="${cy + 7}" r="2.4" fill="none" stroke="${Y}" stroke-width="1.6"/>`;
}

function savoyShield(cx, cy, s = 1) {
  return `<g transform="translate(${cx},${cy}) scale(${s})">`
    + `<path d="M-7,-9 L7,-9 L7,4 C7,8 4,10.5 0,12 C-4,10.5 -7,8 -7,4 Z" fill="${R}" stroke="${W}" stroke-width="1"/>`
    + `<rect x="-1.6" y="-9" width="3.2" height="21" fill="${W}"/>`
    + `<rect x="-7" y="-3.1" width="14" height="3.2" fill="${W}"/>`
    + `</g>`;
}

function taegeuk(cx, cy, r) {
  return `<path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy} A${r / 2},${r / 2} 0 0 1 ${cx},${cy} A${r / 2},${r / 2} 0 0 0 ${cx - r},${cy} Z" fill="${R}"/>`
    + `<path d="M${cx - r},${cy} A${r},${r} 0 0 0 ${cx + r},${cy} A${r / 2},${r / 2} 0 0 0 ${cx},${cy} A${r / 2},${r / 2} 0 0 1 ${cx - r},${cy} Z" fill="${B}"/>`;
}

function tokugawaMon(cx, cy, r) {
  let leaves = '';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const lx = cx + Math.cos(a) * r * 0.42;
    const ly = cy + Math.sin(a) * r * 0.42;
    leaves += `<ellipse cx="${lx.toFixed(2)}" cy="${ly.toFixed(2)}" rx="${r * 0.34}" ry="${r * 0.46}" fill="${K}" transform="rotate(${(a * 180) / Math.PI + 90} ${lx.toFixed(2)} ${ly.toFixed(2)})"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${K}" stroke-width="2"/>` + leaves;
}

function qingDragon() {
  return field(Y)
    + `<path d="M12,28 C18,20 24,30 30,22 C36,14 42,24 48,16" fill="none" stroke="${B}" stroke-width="3.4" stroke-linecap="round"/>`
    + `<circle cx="48" cy="13" r="3" fill="${B}"/>`
    + `<circle cx="14" cy="14" r="3.4" fill="${R}"/>`;
}

function elephant(cx, cy, s, fill) {
  return `<g transform="translate(${cx},${cy}) scale(${s})" fill="${fill}">`
    + `<ellipse cx="0" cy="0" rx="9" ry="6"/>`
    + `<circle cx="8.5" cy="-3" r="3.6"/>`
    + `<path d="M11.5,-2 C13.5,0 13.5,3 12,5.5 L10.5,4.5 C11.8,2.5 11.8,0.5 10.3,-1 Z"/>`
    + `<rect x="-7" y="4" width="3" height="5"/>`
    + `<rect x="3" y="4" width="3" height="5"/>`
    + `</g>`;
}

function peacock(cx, cy) {
  let tail = '';
  for (let i = -3; i <= 3; i++) {
    const a = -Math.PI / 2 + i * 0.32;
    tail += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * 12).toFixed(2)}" y2="${(cy + Math.sin(a) * 12).toFixed(2)}" stroke="${Y}" stroke-width="1.6"/>`;
  }
  return tail + `<circle cx="${cx}" cy="${cy}" r="4.4" fill="${G}"/>` + `<circle cx="${cx}" cy="${cy - 1}" r="1.2" fill="${Y}"/>`;
}

const FLAGS = {
  // ---- Europe -------------------------------------------------------------
  ENG: unionJack(),
  FRA: vstripes([B, W, R]),
  PRU: field(W) + prussianEagle(K),
  AUS: hstripes([K, Y]),
  RUS: hstripes([W, B, R]),
  ESP: hstripes([R, Y, R], [1, 2, 1]),
  POR: vstripes([B, W]) + `<circle cx="30" cy="20" r="6" fill="${R}" stroke="${Y}" stroke-width="1.4"/>`,
  NLD: hstripes([R, W, B]),
  DEN: nordicCross(R, W),
  SWE: nordicCross(B, Y),
  SWI: field(R) + rect(26, 12, 8, 16, W) + rect(22, 16, 16, 8, W),
  OTT: field(R) + crescentStar(W),
  // German states
  BAV: bavarianLozenges(),
  SAX: hstripes([W, G]),
  HAN: hstripes([Y, W]),
  BAD: hstripes([R, Y]),
  WUR: hstripes([K, R]),
  HES: hstripes([R, W]),
  // Italian states
  SAR: field(B) + savoyShield(30, 12, 1.2),
  TSC: field(W) + `<path d="M23,12 L37,12 L37,22 C37,26 34,28 30,29.5 C26,28 23,26 23,22 Z" fill="${Y}" stroke="${R}" stroke-width="1.2"/><circle cx="30" cy="17" r="1.6" fill="${R}"/><circle cx="26.8" cy="22" r="1.6" fill="${R}"/><circle cx="33.2" cy="22" r="1.6" fill="${R}"/>`,
  TUS: hstripes([W, R]),
  PAP: vstripes([Y, W]) + crossedKeys(45, 20),
  TSC2: null,
  MOD: hstripes([W, B]),
  PAR: hstripes([Y, B]),
  // ---- Near East / Africa --------------------------------------------------
  EGY: field(R) + `<circle cx="27" cy="20" r="8" fill="${W}"/><circle cx="30" cy="20" r="6.8" fill="${R}"/>` + star5(37, 20, 3.6, W),
  MOR: field(CR) + star5(30, 20, 8, 'none').replace('fill="none"', `fill="none" stroke="${Y}" stroke-width="1.2"`),
  ETH: field(CR) + `<g stroke="${Y}" stroke-width="2.4" stroke-linecap="round"><line x1="30" y1="10" x2="30" y2="30"/><line x1="21" y1="17" x2="39" y2="17"/><line x1="24.5" y1="26" x2="35.5" y2="26"/></g>`,
  PER: hstripes([G, W, R]) + sun(30, 20, 4.6, Y, 10),
  // ---- Asia -----------------------------------------------------------------
  QNG: qingDragon(),
  JPN: field(W) + tokugawaMon(30, 20, 10),
  KOR: field(W) + taegeuk(30, 20, 8),
  SIA: field(R) + elephant(28, 20, 1.15, W),
  BUR: field(W) + peacock(30, 22),
  VIE: field(Y) + `<rect x="23" y="13" width="14" height="14" fill="${R}" transform="rotate(45 30 20)"/>`,
  LAO: field(CR) + elephant(28, 22, 0.95, W) + `<path d="M18,10 C24,5 36,5 42,10" fill="none" stroke="${W}" stroke-width="1.8"/><line x1="30" y1="7" x2="30" y2="12" stroke="${W}" stroke-width="1.6"/>`,
  CAM: field(R) + `<g fill="${W}"><rect x="20" y="18" width="20" height="9"/><polygon points="24,18 24,12 27,12 27,18"/><polygon points="28.5,18 28.5,9 31.5,9 31.5,18"/><polygon points="33,18 33,12 36,12 36,18"/></g>`,
  NEP: field(W) + `<path d="M14,6 L40,14 L22,18 L44,32 L14,34 Z" fill="${CR}" stroke="${B}" stroke-width="1.6"/>` + `<circle cx="22" cy="12.5" r="2" fill="${W}"/>` + sun(24, 26, 2, W, 8),
  BHU: `<path d="M0,0 L60,0 L0,40 Z" fill="${Y}"/><path d="M60,0 L60,40 L0,40 Z" fill="${O}"/>` + `<path d="M22,26 C28,20 34,26 40,18" fill="none" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>`,
  AFG: field(K) + `<circle cx="30" cy="20" r="7" fill="none" stroke="#4c4434" stroke-width="2"/>`,
  // ---- Americas --------------------------------------------------------------
  USA: (() => {
    let stripes = '';
    for (let i = 0; i < 13; i++) stripes += rect(0, (i * HEIGHT) / 13, WIDTH, HEIGHT / 13 + 0.1, i % 2 === 0 ? R : W);
    let stars = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) stars += star5(2.6 + c * 4.7, 2.4 + r * 3.9, 1.15, W);
    return stripes + rect(0, 0, 26, HEIGHT * (7 / 13), B) + stars;
  })(),
  MEX: vstripes([G, W, R]) + `<path d="M27,17 L30,22 L33,17 L31.5,23 L30,25 L28.5,23 Z" fill="#6d4a2a"/>`,
  ARG: hstripes([LB, W, LB]) + sun(30, 20, 3.6, Y, 12),
  CHL: hstripes([W, R]) + rect(0, 0, 20, 20, B) + star5(10, 10, 5, W),
  CLM: hstripes([R, B, Y]),
  VEN: hstripes([Y, B, R]) + [0, 1, 2, 3, 4, 5, 6].map((i) => star5(15 + i * 5, 20 + Math.sin((i / 6) * Math.PI) * -3.5, 1.3, W)).join(''),
  PRG: hstripes([R, W, B]) + `<circle cx="30" cy="20" r="4.6" fill="none" stroke="${Y}" stroke-width="1.2"/>` + star5(30, 20, 2.6, Y),
  // ---- game constructs -------------------------------------------------------
  COL: field(N) + star5(30, 20, 7, 'none').replace('fill="none"', `fill="none" stroke="${W}" stroke-width="1.3"`) + star5(30, 20, 3, W),
  UNC: field('#7a7060') + `<circle cx="30" cy="20" r="7" fill="none" stroke="#5d5445" stroke-width="1.4"/><circle cx="30" cy="20" r="1.6" fill="#5d5445"/>`,
  // ---- formables ---------------------------------------------------------------
  GER: hstripes([K, W, R]),
  NGF: hstripes([K, W, R]), // the Norddeutscher Bund flew the same black-white-red
  ITA: vstripes([G, W, R]) + savoyShield(30, 10, 0.9),
};
delete FLAGS.TSC2;

// ---- Moonshot additions: the 1820 world overhaul nations ------------------
Object.assign(FLAGS, {
  // Americas
  BRA: field(G) + `<polygon points="30,6 50,20 30,34 10,20" fill="${Y}"/>` + `<circle cx="30" cy="20" r="6.5" fill="${B}"/>`,
  PEU: vstripes([R, W, R]),
  BOL: hstripes([R, Y, G]),
  URU: hstripes([W, LB, W, LB, W, LB, W, LB, W]) + rect(0, 0, 24, 17.8, W) + sun(12, 9, 5, Y),
  ECU: hstripes([Y, B, R], [2, 1, 1]),
  UCA: hstripes([LB, W, LB]) + `<polygon points="30,14 36,24 24,24" fill="none" stroke="${G}" stroke-width="1.3"/>`,
  HAI: hstripes([B, R]),
  // Balkans / Mediterranean
  GRE: nordicCross(LB, W),
  SER: hstripes([R, B, W]),
  TUN: field(R) + `<circle cx="30" cy="20" r="9" fill="${W}"/>` + crescentStar(R),
  TRI: field(G) + crescentStar(W),
  // South and Southeast Asia
  SIK: field(O) + `<circle cx="30" cy="20" r="8" fill="none" stroke="${K}" stroke-width="1.6"/>` + `<circle cx="30" cy="20" r="2" fill="${K}"/>`,
  HYD: field(Y) + `<circle cx="30" cy="20" r="7" fill="${W}" stroke="${K}" stroke-width="0.8"/>`,
  AWA: field(G) + `<ellipse cx="30" cy="20" rx="10" ry="4" fill="${Y}"/>` + `<circle cx="36" cy="19" r="1" fill="${K}"/>`,
  ACE: field(R) + crescentStar(W),
  // Africa / Middle East
  SOK: field(G) + `<circle cx="30" cy="20" r="6" fill="none" stroke="${W}" stroke-width="1.4"/>`,
  ZUL: field(N) + `<ellipse cx="30" cy="20" rx="8" ry="12" fill="${W}" stroke="${K}" stroke-width="1.2"/>` + `<line x1="30" y1="4" x2="30" y2="36" stroke="${K}" stroke-width="1.4"/>`,
  MAD: vstripes([W, R]),
  OMA: field(R) + `<rect x="26" y="12" width="8" height="16" fill="none" stroke="${W}" stroke-width="1.2"/>`,
  ASH: field(Y) + `<path d="M22,24 Q30,16 38,24 L36,27 L24,27 Z" fill="${K}"/>`,
});

// ---- 1.6.0 source-backed 1820 additions ---------------------------------
Object.assign(FLAGS, {
  RUA: hstripes([W, B, R]) + prussianEagle(K),
  HAW: hstripes([W, R, B, W, R, B, W, R])
    + rect(0, 0, 24, 20, B)
    + `<path d="M0,0 L24,20 M24,0 L0,20" stroke="${W}" stroke-width="4"/>`
    + rect(10, 0, 4, 20, W)
    + rect(0, 8, 24, 4, W),
  FIN: field(W) + rect(18, 0, 7, HEIGHT, B) + rect(0, 16, WIDTH, 7, B),
  POL: hstripes([W, R]),
  LVN: hstripes([K, Y]),
  ALG: vstripes([G, W])
    + `<circle cx="18" cy="20" r="8" fill="${W}"/><circle cx="21" cy="20" r="6.5" fill="${G}"/>`
    + star5(27, 20, 3.3, W),
  HEJ: field(G)
    + `<circle cx="27" cy="20" r="8" fill="${W}"/><circle cx="30" cy="20" r="6.5" fill="${G}"/>`
    + star5(37, 20, 3.3, W),
  SEN: hstripes([B, W, B]) + `<circle cx="30" cy="20" r="5" fill="${Y}"/>`,
  DAR: field(G) + `<polygon points="0,0 28,20 0,40" fill="${R}"/>` + star5(11, 20, 4, W),
  KZH: field(LB) + `<circle cx="30" cy="20" r="8" fill="none" stroke="${Y}" stroke-width="2"/>`
    + `<path d="M22,20 Q30,10 38,20 Q30,30 22,20" fill="none" stroke="${Y}" stroke-width="2"/>`,
  BUK: hstripes([G, W, G]) + `<circle cx="30" cy="20" r="5" fill="${Y}"/>`,
  KHI: vstripes([G, W, G]) + `<circle cx="30" cy="20" r="5" fill="none" stroke="${Y}" stroke-width="1.8"/>`,
  KOK: field(CR) + `<rect x="0" y="16" width="60" height="8" fill="${G}"/>` + star5(30, 20, 4, Y),
});

// ---- Fallback flags for the Vic2 region cut -----------------------------
// Cutting provinces to Vic2's state regions brought in dozens of minor polities
// (Chinese and Indian substates, Malay sultanates, Arabian emirates) that have
// no hand-drawn design here. Rather than leave them flagless, derive a plain
// but era-appropriate banner from the nation's own map colour, so the
// "every playable polity ships a local flag" invariant holds.
function fallbackFlag(color) {
  const [r, g, b] = color;
  const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  const base = `#${hex(r)}${hex(g)}${hex(b)}`;
  const shade = `#${hex(r * 0.62)}${hex(g * 0.62)}${hex(b * 0.62)}`;
  // Horizontal bicolour with a parchment band: reads cleanly at flag size and
  // stays inside the muted atlas palette because the hue comes from the map.
  return field(base) + rect(0, 16, WIDTH, 8, W) + rect(0, 30, WIDTH, 10, shade);
}

const seedPath = path.resolve(import.meta.dirname, '../src/data/generated/worldSeed.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
let generated = 0;
for (const nation of seed.nations) {
  if (FLAGS[nation.tag]) continue;
  FLAGS[nation.tag] = fallbackFlag(nation.color ?? [107, 98, 82]);
  generated += 1;
}

let count = 0;
for (const [tag, body] of Object.entries(FLAGS)) {
  if (!body) continue;
  writeFileSync(path.join(OUT, `${tag}.svg`), svg(body));
  count++;
}
console.log(`wrote ${count} flags to ${OUT} (${generated} generated from map colour)`);
