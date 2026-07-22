import { describe, expect, it } from 'vitest';
import {
  peaceSignedMessage,
  sideLabel,
  warDeclaredMessage,
  warSidesLabel,
} from '../src/ui/warNaming';

const NAMES: Record<number, string> = {
  1: 'Austria',
  2: 'Bavaria',
  3: 'Saxony',
  10: 'Prussia',
  11: 'Hanover',
  12: 'Denmark',
};

const nameOf = (id: number) => NAMES[id] ?? `Nation ${id}`;

describe('warNaming', () => {
  it('sideLabel names primary parties and adds +N for extras', () => {
    expect(sideLabel([1], nameOf)).toBe('Austria');
    expect(sideLabel([1, 2], nameOf)).toBe('Austria & Bavaria');
    expect(sideLabel([1, 2, 3], nameOf)).toBe('Austria & Bavaria +1');
    expect(sideLabel([1, 2, 3, 10], nameOf)).toBe('Austria & Bavaria +2');
    expect(sideLabel([], nameOf)).toBe('Unknown');
  });

  it('warDeclaredMessage tags the primary attacker and keeps +N', () => {
    expect(warDeclaredMessage([1], [10], nameOf, 'AUS')).toBe(
      'Austria (AUS) declares war on Prussia.',
    );
    expect(warDeclaredMessage([1, 2, 3], [10, 11, 12], nameOf, 'AUS')).toBe(
      'Austria (AUS) & Bavaria +1 declares war on Prussia & Hanover +1.',
    );
    expect(warDeclaredMessage([1], [10], nameOf)).toBe(
      'Austria declares war on Prussia.',
    );
  });

  it('peaceSignedMessage names both sides with the same +N pattern', () => {
    expect(peaceSignedMessage([1], [10], nameOf)).toBe(
      'Peace signed: Austria vs Prussia.',
    );
    expect(peaceSignedMessage([1, 2, 3], [10], nameOf)).toBe(
      'Peace signed: Austria & Bavaria +1 vs Prussia.',
    );
  });

  it('warSidesLabel matches the Military panel selector format', () => {
    expect(warSidesLabel([1, 2], [10], nameOf)).toBe('Austria & Bavaria vs Prussia');
  });
});
