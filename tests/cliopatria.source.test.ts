import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  discoverCliopatria,
  loadCliopatriaArchive,
  parseCliopatriaArchive,
} from '../content/sources/cliopatria/adapter.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function sampleDocument() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          Name: 'Example polity', FromYear: 1600, ToYear: 1750, Area: 12,
          Type: 'POLITY', Wikipedia: 'Example', Wikidata: 'Q1', SeshatID: 'EX1',
          Components: '', MemberOf: 'Example union',
        },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      },
      {
        type: 'Feature',
        properties: {
          Name: 'Later polity', FromYear: 1800, ToYear: 1900, Area: 20,
          Type: 'POLITY', Wikipedia: '', Wikidata: 'Q2', SeshatID: '', Components: '', MemberOf: '',
        },
        geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
      },
      {
        type: 'Feature',
        properties: {
          Name: 'Composite relation', FromYear: 1600, ToYear: 1750, Area: 30,
          Type: 'RELATION', Wikipedia: '', Wikidata: 'Q3', SeshatID: '', Components: '', MemberOf: '',
        },
        geometry: { type: 'Polygon', coordinates: [[[4, 4], [5, 4], [5, 5], [4, 4]]] },
      },
    ],
  };
}

describe('Cliopatria source adapter', () => {
  it('filters inclusive year intervals and keeps assertion-level source fields', () => {
    const candidates = discoverCliopatria(sampleDocument(), '1700-01-01', {
      license: 'CC BY 4.0',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      identityKey: 'Q1',
      name: 'Example polity',
      fromYear: 1600,
      toYear: 1750,
      memberOf: 'Example union',
      geometryType: 'Polygon',
      bounds: [0, 0, 1, 1],
      license: 'CC BY 4.0',
    });
    expect(candidates[0].geometryHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('parses the GeoJSON payload from a ZIP archive', () => {
    const archive = zipSync({ 'cliopatria.geojson': strToU8(JSON.stringify(sampleDocument())) });
    expect(parseCliopatriaArchive(archive)).toEqual(sampleDocument());
  });

  it('is offline by default and rejects archives that do not match the pinned hash', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'grand-century-cliopatria-'));
    temporaryDirectories.push(directory);
    const cachePath = path.join(directory, 'cliopatria.zip');
    await expect(loadCliopatriaArchive({ cachePath })).rejects.toThrow(/cache missing/i);

    const archive = zipSync({ 'cliopatria.geojson': strToU8(JSON.stringify(sampleDocument())) });
    await expect(loadCliopatriaArchive({
      cachePath,
      refresh: true,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => archive.buffer,
      }) as Response,
    })).rejects.toThrow(/archive hash mismatch/i);
    expect((await readFile(cachePath)).byteLength).toBeGreaterThan(0);
  });
});
