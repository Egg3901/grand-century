import { test } from 'node:test';
import assert from 'node:assert/strict';
import maplibre from 'maplibre-gl';
import { latitudeAtRow, sourceRow } from './project-mobile-relief.mjs';

// Compare raster rows with the renderer's independent geographic projection.
// Linear latitude placement (the old asset) fails at London and Cape Town.
for (const [name, lng, lat] of [['London', -0.1276, 51.5072], ['Cape Town', 18.4241, -33.9249],
  ['Singapore', 103.8198, 1.3521], ['Oslo', 10.7522, 59.9139]]) {
  test(`${name}: relief and vector geography share a screen position`, () => {
    const north = maplibre.MercatorCoordinate.fromLngLat([0, 85]).y;
    const south = maplibre.MercatorCoordinate.fromLngLat([0, -85]).y;
    const position = maplibre.MercatorCoordinate.fromLngLat([lng, lat]);
    const row = (position.y - north) / (south - north) * 4096 - 0.5;
    assert.ok(Math.abs(latitudeAtRow(row, 4096) - lat) < 1e-8);
    const inputLatitude = 85 - (sourceRow(row, 4096, 1934) + 0.5) / 1934 * 170;
    assert.ok(Math.abs(inputLatitude - lat) < 1e-8);
  });
}
