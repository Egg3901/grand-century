/**
 * Player-scoped unit-marker visibility for the strategic map.
 *
 * Combat seals still inspect every stack in a province; only heraldic
 * counters (and matching movement arrows) consult this set.
 */

export type WarSides = {
  attackers: readonly number[];
  defenders: readonly number[];
};

export type RelationSides = {
  a: number;
  b: number;
  kind: string;
};

/**
 * Nations whose army/fleet counters should appear on the map for the player.
 *
 * Always: the player, plus formal alliance partners (even at peace — players
 * expect to see where their treaty partners stand). Guarantees are excluded:
 * one-sided protection is not mutual military partnership.
 *
 * When the player is a belligerent in any war: also that war's co-belligerents
 * and enemies. Neutral third parties stay hidden.
 */
export function visibleUnitOwnerIds(
  playerNation: number,
  wars: readonly WarSides[],
  relations: readonly RelationSides[],
): Set<number> {
  const visible = new Set<number>([playerNation]);

  for (const relation of relations) {
    if (relation.kind !== 'alliance') continue;
    if (relation.a === playerNation) visible.add(relation.b);
    else if (relation.b === playerNation) visible.add(relation.a);
  }

  for (const war of wars) {
    if (war.attackers.includes(playerNation)) {
      for (const nationId of war.attackers) visible.add(nationId);
      for (const nationId of war.defenders) visible.add(nationId);
    } else if (war.defenders.includes(playerNation)) {
      for (const nationId of war.defenders) visible.add(nationId);
      for (const nationId of war.attackers) visible.add(nationId);
    }
  }

  return visible;
}
