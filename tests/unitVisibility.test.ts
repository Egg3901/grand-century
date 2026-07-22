import { describe, expect, it } from 'vitest';
import { visibleUnitOwnerIds } from '../src/map/unitVisibility';

const PLAYER = 1;
const ALLY = 2;
const ENEMY = 3;
const NEUTRAL = 4;
const GUARANTEED = 5;
const CO_BELLIGERENT = 6;

describe('visibleUnitOwnerIds', () => {
  it('at peace shows only the player (and formal allies), not neutrals', () => {
    const visible = visibleUnitOwnerIds(
      PLAYER,
      [],
      [
        { a: PLAYER, b: ALLY, kind: 'alliance' },
        { a: PLAYER, b: GUARANTEED, kind: 'guarantee' },
        { a: PLAYER, b: NEUTRAL, kind: 'neutral' },
      ],
    );

    expect(visible.has(PLAYER)).toBe(true);
    expect(visible.has(ALLY)).toBe(true);
    expect(visible.has(GUARANTEED)).toBe(false);
    expect(visible.has(NEUTRAL)).toBe(false);
    expect(visible.has(ENEMY)).toBe(false);
  });

  it('at war shows own + war allies + enemies, but not unrelated neutrals', () => {
    const visible = visibleUnitOwnerIds(
      PLAYER,
      [{
        attackers: [PLAYER, CO_BELLIGERENT],
        defenders: [ENEMY],
      }],
      [
        { a: PLAYER, b: ALLY, kind: 'alliance' },
        { a: PLAYER, b: NEUTRAL, kind: 'neutral' },
      ],
    );

    expect(visible.has(PLAYER)).toBe(true);
    expect(visible.has(CO_BELLIGERENT)).toBe(true);
    expect(visible.has(ENEMY)).toBe(true);
    expect(visible.has(ALLY)).toBe(true);
    expect(visible.has(NEUTRAL)).toBe(false);
  });

  it('ignores wars the player is not fighting in', () => {
    const visible = visibleUnitOwnerIds(
      PLAYER,
      [{
        attackers: [ALLY],
        defenders: [ENEMY],
      }],
      [],
    );

    expect([...visible]).toEqual([PLAYER]);
  });

  it('treats the player as visible when defending', () => {
    const visible = visibleUnitOwnerIds(
      PLAYER,
      [{
        attackers: [ENEMY],
        defenders: [PLAYER, CO_BELLIGERENT],
      }],
      [],
    );

    expect(visible.has(PLAYER)).toBe(true);
    expect(visible.has(CO_BELLIGERENT)).toBe(true);
    expect(visible.has(ENEMY)).toBe(true);
    expect(visible.has(NEUTRAL)).toBe(false);
  });
});
