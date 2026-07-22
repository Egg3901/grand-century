import { describe, expect, it } from 'vitest';
import {
  HEARTLAND_PREVIEW_LIMIT,
  heartlandDisplay,
} from '../src/ui/heartlandDisplay';
import {
  POP_COMPOSITION_WIDTH,
  populationComposition,
  shareToSvgX,
} from '../src/ui/populationComposition';

describe('populationComposition', () => {
  it('sizes stacked-bar segments to fixture population shares', () => {
    const fixture = [
      { type: 'farmer', size: 500 },
      { type: 'laborer', size: 300 },
      { type: 'craftsman', size: 200 },
    ];
    const segments = populationComposition(fixture);

    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.type)).toEqual(['farmer', 'laborer', 'craftsman']);
    expect(segments[0].share).toBeCloseTo(0.5, 6);
    expect(segments[1].share).toBeCloseTo(0.3, 6);
    expect(segments[2].share).toBeCloseTo(0.2, 6);
    expect(segments[0].offset).toBeCloseTo(0, 6);
    expect(segments[1].offset).toBeCloseTo(0.5, 6);
    expect(segments[2].offset).toBeCloseTo(0.8, 6);

    const widths = segments.map((s) => shareToSvgX(s.share));
    expect(widths[0]).toBeCloseTo(POP_COMPOSITION_WIDTH * 0.5, 6);
    expect(widths[1]).toBeCloseTo(POP_COMPOSITION_WIDTH * 0.3, 6);
    expect(widths[2]).toBeCloseTo(POP_COMPOSITION_WIDTH * 0.2, 6);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(POP_COMPOSITION_WIDTH, 6);
  });

  it('returns an empty chart for zero or empty population', () => {
    expect(populationComposition([])).toEqual([]);
    expect(populationComposition([{ type: 'farmer', size: 0 }])).toEqual([]);
  });
});

describe('heartlandDisplay', () => {
  const longList = Array.from({ length: 12 }, (_, i) => `Province ${i + 1}`);

  it('does not dump an unbounded list when collapsed', () => {
    const result = heartlandDisplay(longList, false);
    expect(result.visible).toHaveLength(HEARTLAND_PREVIEW_LIMIT);
    expect(result.visible).toEqual(longList.slice(0, HEARTLAND_PREVIEW_LIMIT));
    expect(result.hiddenCount).toBe(longList.length - HEARTLAND_PREVIEW_LIMIT);
    expect(result.canToggle).toBe(true);
    expect(result.visible.join(', ').length).toBeLessThan(longList.join(', ').length);
  });

  it('expands to the full heartland list on toggle', () => {
    const collapsed = heartlandDisplay(longList, false);
    const expanded = heartlandDisplay(longList, true);
    expect(collapsed.hiddenCount).toBe(7);
    expect(expanded.visible).toEqual(longList);
    expect(expanded.hiddenCount).toBe(0);
    expect(expanded.canToggle).toBe(true);
  });

  it('skips the toggle for short or empty heartlands', () => {
    expect(heartlandDisplay([], false)).toEqual({
      visible: [],
      hiddenCount: 0,
      canToggle: false,
    });
    const short = ['A', 'B', 'C'];
    expect(heartlandDisplay(short, false)).toEqual({
      visible: short,
      hiddenCount: 0,
      canToggle: false,
    });
  });
});
