import { describe, expect, it } from 'vitest';
import { labelFitsViewport } from '../apps/mobile/game/mapLabelPlacement';

const screen = {
  imageWidth: 200,
  imageHeight: 44,
  iconScale: 0.5,
  mapWidth: 390,
  mapHeight: 844,
  topInset: 205,
  bottomInset: 215,
  sideInset: 12,
};

describe('native map label placement', () => {
  it('shows a whole symbol in the uncovered map area', () => {
    expect(labelFitsViewport({ ...screen, point: [195, 400] })).toBe(true);
  });

  it.each([
    [61, 400], [329, 400], [195, 213], [195, 620],
  ])('hides a symbol that would be clipped at %s, %s', (x, y) => {
    expect(labelFitsViewport({ ...screen, point: [x, y] })).toBe(false);
  });

  it('accepts a symbol exactly on the safe boundary', () => {
    expect(labelFitsViewport({ ...screen, point: [62, 216] })).toBe(true);
  });
});
