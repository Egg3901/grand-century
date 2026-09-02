import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  auditOhmGeometry,
  compileCuratedRelations,
  curatedRelationsQuery,
  discoverActiveAdminBoundaries,
  queryOverpassCached,
} from '../content/sources/ohm/adapter.mjs';
import { evaluateOhmLicense, requireAllowedOhmLicense } from '../content/sources/ohm/license.mjs';
import { relationToGeoJsonFeature } from '../content/sources/ohm/multipolygon.mjs';
import { parseOhmDate, relationActiveOn } from '../content/sources/ohm/temporal.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function way(ref: number, role: 'outer' | 'inner', points: Array<[number, number]>) {
  return {
    type: 'way',
    ref,
    role,
    geometry: points.map(([lon, lat]) => ({ lon, lat })),
  };
}

function sampleRelation() {
  return {
    type: 'relation',
    id: 2660798,
    tags: {
      type: 'boundary',
      boundary: 'administrative',
      admin_level: '2',
      name: 'Baden',
      wikidata: 'Q186320',
      start_date: '1819-09-08',
      end_date: '1871-05-04',
    },
    members: [
      way(1, 'outer', [[0, 0], [4, 0]]),
      way(2, 'outer', [[4, 4], [4, 0]]),
      way(3, 'outer', [[4, 4], [0, 4]]),
      way(4, 'outer', [[0, 4], [0, 0]]),
      way(5, 'inner', [[1, 1], [1, 2]]),
      way(6, 'inner', [[2, 2], [1, 2]]),
      way(7, 'inner', [[2, 2], [2, 1]]),
      way(8, 'inner', [[2, 1], [1, 1]]),
      { type: 'node', ref: 9, role: 'label', lat: 2, lon: 2 },
    ],
  };
}

describe('OHM temporal model', () => {
  it('treats partial start and end dates as inclusive ranges', () => {
    expect(parseOhmDate('1830', 'start')).toEqual([1830, 1, 1]);
    expect(parseOhmDate('1830', 'end')).toEqual([1830, 12, 31]);
    expect(parseOhmDate('1900-02', 'end')).toEqual([1900, 2, 28]);
    expect(relationActiveOn({ start_date: '1819-09-08', end_date: '1871-05-04' }, '1830-01-01')).toBe(true);
    expect(relationActiveOn({ start_date: '1830', end_date: '1830' }, '1830-12-31')).toBe(true);
    expect(relationActiveOn({ start_date: '1831' }, '1830-12-31')).toBe(false);
  });
});

describe('OHM license gate', () => {
  it('accepts OHM default CC0 and flags other element licenses for review', () => {
    expect(evaluateOhmLicense({})).toMatchObject({ effective: 'CC0', status: 'allowed' });
    expect(evaluateOhmLicense({ license: 'CC BY-SA 4.0' })).toMatchObject({ status: 'review_required' });
    expect(() => requireAllowedOhmLicense({ license: 'CC BY-SA 4.0' }, 'relation 1')).toThrow(/license review/i);
  });
});

describe('OHM multipolygon assembly', () => {
  it('joins reversed member ways and assigns inner rings', () => {
    const feature = relationToGeoJsonFeature(sampleRelation());
    expect(feature.geometry.type).toBe('Polygon');
    expect(feature.geometry.coordinates).toHaveLength(2);
    expect(feature.geometry.coordinates[0][0]).toEqual(feature.geometry.coordinates[0].at(-1));
    expect(feature.properties).toMatchObject({ ohmRelationId: 2660798, wikidata: 'Q186320', license: 'CC0' });
  });

  it('rejects incomplete geometry instead of silently drawing a gap', () => {
    const relation = sampleRelation();
    relation.members.splice(2, 1);
    expect(() => relationToGeoJsonFeature(relation)).toThrow(/unclosed boundary chains/i);
  });

  it('audits every requested relation without hiding individual geometry failures', () => {
    const valid = sampleRelation();
    valid.id = 1;
    const invalid = sampleRelation();
    invalid.id = 99;
    invalid.members.splice(2, 1);
    const results = auditOhmGeometry(
      { elements: [valid, invalid] },
      { asOf: '1830-01-01', relationIds: [valid.id, invalid.id, 404] },
    );
    expect(results).toEqual([
      expect.objectContaining({ relationId: valid.id, status: 'valid', geometryType: 'Polygon' }),
      expect.objectContaining({ relationId: invalid.id, status: 'invalid_geometry' }),
      expect.objectContaining({ relationId: 404, status: 'missing' }),
    ]);
  });

  it('expands nested boundary relations when recursive Overpass data is present', () => {
    const child = sampleRelation();
    child.id = 2;
    const parent = {
      ...sampleRelation(),
      id: 1,
      members: [{ type: 'relation', ref: 2, role: 'outer' }],
    };
    const results = auditOhmGeometry(
      { elements: [parent, child] },
      { asOf: '1830-01-01', relationIds: [parent.id] },
    );
    expect(results[0]).toMatchObject({ relationId: parent.id, status: 'valid' });
    expect(curatedRelationsQuery([parent.id])).toContain('.roots >>;');
  });
});

describe('OHM cached adapter', () => {
  it('requires an explicit refresh before any network request and then replays offline', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'grand-century-ohm-'));
    temporaryDirectories.push(directory);
    const cachePath = path.join(directory, 'query.json');
    await expect(queryOverpassCached('query', { cachePath })).rejects.toThrow(/cache missing/i);

    let calls = 0;
    const document = { elements: [sampleRelation()] };
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => document } as Response;
    };
    expect(await queryOverpassCached('query', { cachePath, refresh: true, fetchImpl })).toEqual(document);
    expect(calls).toBe(1);
    expect(JSON.parse(await readFile(cachePath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      query: 'query',
      document,
    });

    const offline = await queryOverpassCached('query', {
      cachePath,
      fetchImpl: async () => { throw new Error('network must not run'); },
    });
    expect(offline).toEqual(document);
    await expect(queryOverpassCached('different query', { cachePath })).rejects.toThrow(/query mismatch/i);
  });

  it('discovers dated candidates but compiles only explicitly curated relations', () => {
    const relation = sampleRelation();
    const discovery = discoverActiveAdminBoundaries({ elements: [relation] }, '1830-01-01');
    expect(discovery).toEqual([expect.objectContaining({
      relationId: 2660798,
      identityKey: 'Q186320',
      licenseStatus: 'allowed',
      evidenceTags: expect.objectContaining({}),
    })]);

    const result = compileCuratedRelations(
      { elements: [relation] },
      {
        schemaVersion: 1,
        asOf: '1830-01-01',
        boundaries: [{
          relationId: 2660798,
          polityKey: 'BAD',
          purpose: 'boundary_validation',
          expectedName: 'Baden',
          expectedWikidata: 'Q186320',
        }],
      },
    );
    expect(result.featureCollection.features).toHaveLength(1);
    expect(result.featureCollection.features[0].properties).toMatchObject({ polityKey: 'BAD' });
    expect(result.provenance[0]).toMatchObject({
      elementUrl: 'https://www.openhistoricalmap.org/relation/2660798',
      license: 'CC0',
    });
    expect(curatedRelationsQuery([2660798])).toContain('relation(id:2660798)');
  });
});
