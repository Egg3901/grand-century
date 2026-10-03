import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import edges from '../src/graphics/province-edges.json';
import { EDGE_STRIDE, provinceEdgeMesh } from '../src/graphics/provinceEdges';

const geometry = readFileSync(new URL('../src/data/generated/provinces.geo.json', import.meta.url));

describe('3D vector border edges', () => {
  it('were built from the shipped province geometry', () => {
    const hash = createHash('sha256').update(geometry).digest('hex').slice(0, 16);
    expect((edges as { geometryHash: string }).geometryHash, 'run node scripts/build-province-edges.mjs').toBe(hash);
  });

  it('cover every shared border and coastline as finite quads', () => {
    const { vertices, quads } = provinceEdgeMesh();
    expect(quads).toBeGreaterThan(200_000);
    expect(vertices.length).toBe(quads * 4 * EDGE_STRIDE);
    for (let i = 0; i < vertices.length; i += 997) expect(Number.isFinite(vertices[i])).toBe(true);
    const chains = (edges as { chains: number[][] }).chains;
    const pairs = new Set(chains.filter((c) => c[1] >= 0).map((c) => `${c[0]}:${c[1]}`));
    expect(pairs.size).toBeGreaterThan(5000);
    expect(chains.some((c) => c[1] === -1)).toBe(true);
  });
});
