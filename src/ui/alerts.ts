/**
 * Pure alert derivation from consecutive world snapshots.
 * No store access — independently testable. See issue #8.
 */

import type { WorldSnapshot } from '../shared/types';
import { peaceSignedMessage, warDeclaredMessage } from './warNaming';

/** Panels an alert may deep-link into (mirrors Exclude<PanelId, null>). */
export type AlertPanel =
  | 'budget'
  | 'population'
  | 'cultures'
  | 'market'
  | 'politics'
  | 'diplomacy'
  | 'great_powers'
  | 'military'
  | 'production'
  | 'technology'
  | 'province'
  | 'colonization'
  | 'save_load'
  | 'formables'
  | 'decisions';

export interface UiAlert {
  id: string;
  kind: 'war' | 'peace' | 'bankruptcy' | 'rebellion' | 'election' | 'save' | 'formation' | 'unrest' | 'event' | 'market' | 'crisis' | 'culture';
  day: number;
  message: string;
  panel: AlertPanel | null;
  suggestion?: string;
  dedupeKey?: string;
}

export const ALERT_FEED_CAP = 18;

/**
 * Derive the next alert feed from a snapshot transition.
 * Same semantics as the former inline `onSnapshot` block: dedupe/cooldown,
 * foreign-election batching, 18-alert cap, stable identity when nothing changes.
 */
export function deriveAlerts(
  prev: WorldSnapshot | null,
  next: WorldSnapshot,
  existingAlerts: readonly UiAlert[],
  goodNames: ReadonlyMap<number, string> = new Map(),
): UiAlert[] {
  if (!prev) return existingAlerts as UiAlert[];

  const alerts = existingAlerts.slice();
  let changed = false;

  const hasRecentAlert = (dedupeKey: string | undefined, day: number, cooldownDays = 45) => {
    if (!dedupeKey) return false;
    return alerts.some((alert) => (
      alert.dedupeKey === dedupeKey
      && Math.abs(day - alert.day) <= cooldownDays
    ));
  };

  const pushAlert = (
    kind: UiAlert['kind'],
    message: string,
    day: number,
    panel: UiAlert['panel'],
    suggestion: string,
    dedupeKey?: string,
    cooldownDays = 45,
  ) => {
    if (hasRecentAlert(dedupeKey, day, cooldownDays)) return;
    alerts.push({
      id: `${kind}-${day}-${alerts.length}`,
      kind,
      day,
      message,
      panel,
      suggestion,
      dedupeKey,
    });
    changed = true;
  };

  const prevWarIds = new Set(prev.wars.map((war) => war.id));
  const currWarIds = new Set(next.wars.map((war) => war.id));
  for (const war of next.wars) {
    if (prevWarIds.has(war.id)) continue;
    const playerInWar = war.attackers.includes(next.playerNation) || war.defenders.includes(next.playerNation);
    if (!playerInWar) continue;
    const nameOf = (id: number) => next.nations.find((nation) => nation.id === id)?.name ?? `Nation ${id}`;
    const attackerTag = next.nations.find((nation) => nation.id === war.attackers[0])?.tag ?? '';
    pushAlert(
      'war',
      warDeclaredMessage(war.attackers, war.defenders, nameOf, attackerTag || undefined),
      next.day,
      'military',
      'Open Military and review War Overview.',
      `war-start-${war.id}`,
      365,
    );
  }
  // U4: battle reports — name the outcome AND the decisive factor.
  const prevBattleKeys = new Set((prev.recentBattles ?? []).map((b) => `${b.day}:${b.provinceId}:${b.warId}`));
  for (const battle of next.recentBattles ?? []) {
    const key = `${battle.day}:${battle.provinceId}:${battle.warId}`;
    if (prevBattleKeys.has(key)) continue;
    if (battle.outcome === 'clash') continue; // only decided engagements toast
    const playerIsAttacker = battle.attackerNation === next.playerNation;
    const playerWon = (battle.outcome === 'attacker_victory') === playerIsAttacker;
    const enemyId = playerIsAttacker ? battle.defenderNation : battle.attackerNation;
    const enemy = next.nations.find((nation) => nation.id === enemyId)?.name ?? 'the enemy';
    // decisive factor from the player's perspective (flip sign if defending)
    const sign = playerIsAttacker ? 1 : -1;
    const entries = Object.entries(battle.factors) as Array<[string, number]>;
    const decisive = entries.reduce((best, entry) => (Math.abs(entry[1]) > Math.abs(best[1]) ? entry : best));
    const helpedPlayer = decisive[1] * sign > 0;
    const FACTOR_TEXT: Record<string, [string, string]> = {
      roll: ['fortune favored our arms', 'the dice went against us'],
      organization: ['superior organization told', 'our lines were disordered'],
      leadership: ['the general carried the day', 'we were outgeneraled'],
      technology: ['better guns and drill decided it', 'their guns and drill outmatched ours'],
      terrain: ['the ground fought for us', 'the ground fought against us'],
      fort: ['the fortress held firm', 'their fortress blunted the assault'],
    };
    const why = (FACTOR_TEXT[decisive[0]] ?? ['', ''])[helpedPlayer ? 0 : 1];
    const ourLosses = playerIsAttacker ? battle.attackerLosses : battle.defenderLosses;
    const theirLosses = playerIsAttacker ? battle.defenderLosses : battle.attackerLosses;
    pushAlert(
      'war',
      `${playerWon ? 'Victory' : 'Defeat'} at ${battle.provinceName} against ${enemy} — ${why}. Losses ${Math.round(ourLosses)} to ${Math.round(theirLosses)}.`,
      next.day,
      'military',
      playerWon ? 'Press the advantage while their line reforms.' : 'Regroup — broken armies rally at reduced organization.',
      `battle-${key}`,
      0,
    );
  }
  for (const war of prev.wars) {
    if (currWarIds.has(war.id)) continue;
    const playerInWar = war.attackers.includes(next.playerNation) || war.defenders.includes(next.playerNation);
    if (!playerInWar) continue;
    const nameOf = (id: number) => next.nations.find((nation) => nation.id === id)?.name
      ?? prev.nations.find((nation) => nation.id === id)?.name
      ?? `Nation ${id}`;
    pushAlert(
      'peace',
      peaceSignedMessage(war.attackers, war.defenders, nameOf),
      next.day,
      'military',
      'Open Military to review postwar status.',
      `war-end-${war.id}`,
      365,
    );
  }
  const prevWarById = new Map(prev.wars.map((war) => [war.id, war]));
  for (const war of next.wars) {
    const playerIsAttacker = war.attackers.includes(next.playerNation);
    const playerIsDefender = war.defenders.includes(next.playerNation);
    if (!playerIsAttacker && !playerIsDefender) continue;
    const perspectiveScore = playerIsAttacker ? war.score : -war.score;
    const previous = prevWarById.get(war.id);
    const previousPerspectiveScore = previous
      ? (previous.attackers.includes(next.playerNation) ? previous.score : -previous.score)
      : 0;
    if (perspectiveScore >= 10 && previousPerspectiveScore < 10) {
      pushAlert(
        'peace',
        `Peace leverage available (War ${war.id}, score ${perspectiveScore.toFixed(1)}).`,
        next.day,
        'military',
        'Open Military and use Enforce Selected Goals or White Peace.',
        `peace-window-${war.id}`,
        60,
      );
    }
  }
  const prevBankrupt = new Set(prev.nations.filter((nation) => nation.isBankrupt).map((nation) => nation.id));
  for (const nation of next.nations) {
    if (nation.isBankrupt && !prevBankrupt.has(nation.id)) {
      const isPlayer = nation.id === next.playerNation;
      pushAlert(
        'bankruptcy',
        `${nation.name} went bankrupt.`,
        next.day,
        isPlayer ? 'budget' : 'diplomacy',
        isPlayer ? 'Open Budget and restore a positive monthly net.' : 'Open Diplomacy and monitor regional instability.',
        `bankruptcy-${nation.id}`,
      );
    }
  }
  const prevRebels = prev.armies.filter((army) => army.rebel).length;
  const rebels = next.armies.filter((army) => army.rebel).length;
  if (rebels > prevRebels) {
    pushAlert(
      'rebellion',
      'Rebellion forces have risen.',
      next.day,
      'military',
      'Open Military and reposition armies toward unrest hotspots.',
      'rebellion-risen',
      20,
    );
  }
  const prevRebellions = new Map((prev.rebellions ?? []).map((rebellion) => [rebellion.id, rebellion]));
  for (const rebellion of next.rebellions ?? []) {
    const prior = prevRebellions.get(rebellion.id);
    if (!prior && rebellion.status === 'active') {
      const target = next.nations.find((nation) => nation.id === rebellion.targetNation);
      pushAlert(
        'rebellion',
        `${target?.name ?? 'A nation'} faces rebels demanding ${rebellion.demand.description}.`,
        next.day,
        'military',
        'Open Military to review rebel fronts and demands.',
        `rebellion-demand-${rebellion.id}`,
        365,
      );
    }
    if (prior?.status === 'active' && rebellion.status === 'enforced') {
      const target = next.nations.find((nation) => nation.id === rebellion.targetNation);
      pushAlert(
        'rebellion',
        `Rebels forced concessions in ${target?.name ?? 'a nation'} (${rebellion.demand.description}).`,
        next.day,
        'military',
        'Open Military to assess the post-rebellion map.',
        `rebellion-enforced-${rebellion.id}`,
        365,
      );
    } else if (prior?.status === 'active' && rebellion.status === 'crushed') {
      pushAlert(
        'rebellion',
        `A rebellion was crushed (${rebellion.demand.description}).`,
        next.day,
        'military',
        'Open Military to stand down reserve forces if needed.',
        `rebellion-crushed-${rebellion.id}`,
        180,
      );
    }
  }
  const prevPartyByNation = new Map(prev.nations.map((nation) => [nation.id, nation.rulingParty]));
  const prevTagByNation = new Map(prev.nations.map((nation) => [nation.id, nation.tag]));
  let foreignElectionCount = 0;
  for (const nation of next.nations) {
    const oldParty = prevPartyByNation.get(nation.id);
    if (oldParty && oldParty !== nation.rulingParty) {
      if (nation.id === next.playerNation) {
        pushAlert(
          'election',
          `${nation.name} elected ${nation.rulingParty}.`,
          next.day,
          'politics',
          'Open Politics to review party shifts and reform support.',
          `election-${nation.id}-${nation.rulingParty}`,
          365,
        );
      } else {
        foreignElectionCount += 1;
      }
    }
    const oldTag = prevTagByNation.get(nation.id);
    if (oldTag && oldTag !== nation.tag) {
      if (nation.tag === 'GER') {
        pushAlert('formation', 'The German Empire is proclaimed!', next.day, 'diplomacy', 'Open Diplomacy and reassess alliances and rivals.', `formation-${nation.tag}`, 3650);
      } else if (nation.tag === 'ITA') {
        pushAlert('formation', 'The Kingdom of Italy is proclaimed!', next.day, 'diplomacy', 'Open Diplomacy and reassess alliances and rivals.', `formation-${nation.tag}`, 3650);
      } else {
        pushAlert('formation', `${nation.name} has formed.`, next.day, 'diplomacy', 'Open Diplomacy to review the balance of power.', `formation-${nation.tag}`, 3650);
      }
    }
  }
  const prevCrisis = prev.activeCrisis ?? null;
  const currCrisis = next.activeCrisis ?? null;
  if (!prevCrisis && currCrisis) {
    const subject = next.nations.find((nation) => nation.id === currCrisis.subject)?.name ?? `Nation ${currCrisis.subject}`;
    pushAlert(
      'crisis',
      `Crisis erupts over ${subject}.`,
      next.day,
      'great_powers',
      'Open Great Powers to back a side or watch the Concert.',
      `crisis-spawn-${currCrisis.id}`,
      365,
    );
  } else if (prevCrisis && !currCrisis) {
    const history = next.congressHistory ?? [];
    const latest = history[history.length - 1];
    const outcome = latest && latest.day === next.day
      ? latest.outcome === 'war'
        ? 'Diplomacy failed — war.'
        : latest.outcome === 'fizzle'
          ? 'Crisis fizzled.'
          : 'Congress settled the crisis.'
      : 'Crisis resolved.';
    pushAlert(
      'crisis',
      outcome,
      next.day,
      'great_powers',
      'Open Great Powers to review the congress ledger.',
      `crisis-resolve-${prevCrisis.id}`,
      365,
    );
  }
  if (foreignElectionCount > 0) {
    const monthKey = `election-foreign-${next.date.year}-${next.date.month}`;
    const existingIdx = alerts.findIndex((alert) => alert.dedupeKey === monthKey);
    if (existingIdx >= 0) {
      const existing = alerts[existingIdx]!;
      const priorCount = Number(existing.message.match(/^(\d+)/)?.[1] ?? 1);
      alerts[existingIdx] = {
        ...existing,
        message: `${priorCount + foreignElectionCount} elections this month`,
        day: next.day,
      };
      changed = true;
    } else {
      pushAlert(
        'election',
        foreignElectionCount === 1
          ? '1 election this month'
          : `${foreignElectionCount} elections this month`,
        next.day,
        'politics',
        'Routine foreign elections — expand in the outliner if needed.',
        monthKey,
        45,
      );
    }
  }
  // Province unrestRisk only changes on monthly sim ticks (never from a
  // command), so this O(provinces) scan is pointless on same-day snapshots
  // — which is most of them at low speed (8Hz snapshots share a day). Skip
  // it unless a day actually elapsed. A single loop also avoids two 620-arg
  // Math.max spreads.
  if (next.day !== prev.day) {
    let maxUnrest = 0;
    for (const province of next.provinces) {
      if (province.owner === next.playerNation && province.unrestRisk > maxUnrest) maxUnrest = province.unrestRisk;
    }
    let prevMaxUnrest = 0;
    for (const province of prev.provinces) {
      if (province.owner === prev.playerNation && province.unrestRisk > prevMaxUnrest) prevMaxUnrest = province.unrestRisk;
    }
    if (maxUnrest >= 0.55 && prevMaxUnrest < 0.55) {
      pushAlert(
        'unrest',
        `High unrest risk detected (${maxUnrest.toFixed(2)}).`,
        next.day,
        'politics',
        'Open Politics and enact stabilizing reforms or cut taxes.',
        'high-unrest',
        120,
      );
    }
  }
  // Culture: alert when a player movement newly crosses the boiling gates.
  {
    const prevBoiling = new Set(
      (prev.playerMovements ?? []).filter((movement) => movement.boiling).map((movement) => movement.id),
    );
    for (const movement of next.playerMovements ?? []) {
      if (!movement.boiling || prevBoiling.has(movement.id)) continue;
      pushAlert(
        'culture',
        `${movement.cultureName} movement is boiling — uprising imminent.`,
        next.day,
        'cultures',
        'Open Cultures: grant acceptance, flip pluralist, or prepare for rebels.',
        `culture-boil-${movement.id}`,
        180,
      );
    }
  }
  const prevPendingIds = new Set((prev.pendingPlayerEvents ?? []).map((event) => event.instanceId));
  for (const event of next.pendingPlayerEvents ?? []) {
    if (prevPendingIds.has(event.instanceId)) continue;
    pushAlert(
      'event',
      event.title,
      next.day,
      'decisions',
      'A national event requires your choice.',
      `event-${event.instanceId}`,
      365,
    );
  }
  // Life-need goods (grain/cattle/fish) — alert when world unmet is severe.
  const lifeGoodIds = new Set([0, 1, 2]);
  for (const good of next.market) {
    if (!lifeGoodIds.has(good.good)) continue;
    const denom = Math.max(1, good.priceTrace.requestedDemand);
    const unmetFrac = good.unmet / denom;
    if (unmetFrac < 0.22 && good.unmet < Math.max(8, good.supply * 0.18)) continue;
    const name = goodNames.get(good.good) ?? `Good ${good.good}`;
    pushAlert(
      'market',
      `${name} shortage: ${good.unmet.toFixed(0)} unmet (${(unmetFrac * 100).toFixed(0)}% of demand).`,
      next.day,
      'market',
      'Open Market and Production — expand RGOs or import capacity for life goods.',
      `market-shortage-${good.good}`,
      45,
    );
  }

  if (!changed) return existingAlerts as UiAlert[];
  return alerts.slice(-ALERT_FEED_CAP);
}
