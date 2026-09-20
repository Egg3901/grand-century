import type { WorldSnapshot } from '../../shared/types';
import type { PanelId } from '../../store';

export const AGENDA_FIELDS = [
  'day', 'date', 'playerNation', 'nations', 'wars', 'relations', 'armies', 'rebellions',
  'playerBudget', 'playerPopulation', 'playerProduction', 'playerStates', 'playerTech',
  'playerDecisions', 'playerFormables', 'playerPowerScore', 'ninthPowerScore',
  'infamyLimit', 'chronicleWarsFought', 'playerMovements',
] as const satisfies readonly (keyof WorldSnapshot)[];

export type AgendaSnapshot = Pick<WorldSnapshot, (typeof AGENDA_FIELDS)[number]>;
export type AgendaTone = 'good' | 'watch' | 'danger' | 'neutral';
export type AgendaDestination = Exclude<PanelId, null | 'province'>;

export interface AgendaPriority {
  id: string;
  title: string;
  detail: string;
  action: string;
  destination: AgendaDestination;
  tone: AgendaTone;
}

export interface AgendaMeasure {
  label: string;
  value: string;
  detail: string;
  tone: AgendaTone;
  destination: AgendaDestination;
}

export interface AgendaGoal { label: string; met: boolean }

export interface AgendaChapter {
  title: string;
  purpose: string;
  goals: AgendaGoal[];
  completed: number;
  total: number;
}

export interface NationalAgenda {
  direction: string;
  directionDetail: string;
  headline: string;
  priorities: AgendaPriority[];
  measures: AgendaMeasure[];
  chapters: AgendaChapter[];
}

function money(value: number): string {
  const rounded = Math.round(Math.abs(value));
  return `${value < 0 ? '-' : ''}£${rounded.toLocaleString()}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function completeChapter(title: string, purpose: string, goals: AgendaGoal[]): AgendaChapter {
  return { title, purpose, goals, completed: goals.filter((goal) => goal.met).length, total: goals.length };
}

function pushUnique(priorities: AgendaPriority[], priority: AgendaPriority): void {
  if (!priorities.some((entry) => entry.id === priority.id)) priorities.push(priority);
}

export function deriveNationalAgenda(snapshot: AgendaSnapshot): NationalAgenda {
  const player = snapshot.nations.find((nation) => nation.id === snapshot.playerNation);
  if (!player) {
    return {
      direction: 'Awaiting dispatches',
      directionDetail: 'The cabinet is still assembling the national ledger.',
      headline: 'No national brief is available yet.',
      priorities: [], measures: [], chapters: [],
    };
  }

  const playerWars = snapshot.wars.filter((war) => war.attackers.includes(player.id) || war.defenders.includes(player.id));
  const activeRebellions = snapshot.rebellions.filter((rebellion) => rebellion.targetNation === player.id && rebellion.status === 'active');
  const playerArmies = snapshot.armies.filter((army) => army.owner === player.id && !army.rebel);
  const regiments = playerArmies.reduce((sum, army) => sum + army.regiments.length, 0);
  const armyCapacity = Math.max(0, player.standingRegimentCapacity ?? player.mobilizationCapacity ?? 0);
  const factoryCount = snapshot.playerStates.reduce((sum, state) => sum + state.factoryCount, 0);
  const factoryTarget = Math.max(2, Math.ceil(snapshot.playerStates.length / 3));
  const population = snapshot.playerPopulation.reduce((sum, row) => sum + row.size, 0);
  const needsMet = population > 0
    ? snapshot.playerPopulation.reduce((sum, row) => sum + row.avgNeedsMet * row.size, 0) / population
    : 1;
  const alliances = snapshot.relations.filter((relation) => relation.kind === 'alliance'
    && (relation.a === player.id || relation.b === player.id)
    && (relation.expiresDay < 0 || relation.expiresDay > snapshot.day)).length;
  const researchActive = Boolean(snapshot.playerTech?.current);
  const availableDecision = snapshot.playerDecisions?.find((decision) => decision.available);
  const formable = snapshot.playerFormables?.slice().sort((a, b) => (
    b.controlledCoreStates / Math.max(1, b.requiredCoreStates)
      - a.controlledCoreStates / Math.max(1, a.requiredCoreStates)
  ))[0];
  const activeMovement = snapshot.playerMovements?.slice().sort((a, b) => b.radicalism - a.radicalism)[0];
  const isGreatPower = player.gpRank > 0 && player.gpRank <= 8;
  const gpRatio = snapshot.playerPowerScore / Math.max(1, snapshot.ninthPowerScore);
  const infamyRatio = player.infamy / Math.max(1, snapshot.infamyLimit);
  const warsFought = snapshot.chronicleWarsFought ?? 0;

  let direction = isGreatPower ? 'Hold a place in the Concert' : 'Win recognition as a Great Power';
  let directionDetail = isGreatPower
    ? `Rank #${player.gpRank}. Convert strength into prestige, influence, and a durable settlement.`
    : `${Math.max(0, snapshot.ninthPowerScore - snapshot.playerPowerScore).toFixed(1)} power behind the Great Power threshold.`;
  if (formable) {
    const share = formable.controlledCoreStates / Math.max(1, formable.requiredCoreStates);
    direction = `Proclaim ${formable.name}`;
    directionDetail = `${formable.controlledCoreStates}/${formable.requiredCoreStates} required core states controlled. ${percent(share)} of the territorial requirement.`;
  }

  const priorities: AgendaPriority[] = [];
  if (player.isBankrupt) {
    pushUnique(priorities, {
      id: 'bankrupt', title: 'Restore the national credit',
      detail: `Bankruptcy has blocked construction for ${player.bankruptcyMonths} month${player.bankruptcyMonths === 1 ? '' : 's'}.`,
      action: 'Repair budget', destination: 'budget', tone: 'danger',
    });
  } else if (snapshot.playerBudget.net < 0) {
    const runway = player.treasury > 0 ? Math.floor(player.treasury / Math.abs(snapshot.playerBudget.net)) : 0;
    pushUnique(priorities, {
      id: 'deficit', title: 'Close the monthly deficit',
      detail: `${money(snapshot.playerBudget.net)} per month leaves about ${runway} month${runway === 1 ? '' : 's'} of cash at the current rate.`,
      action: 'Balance the books', destination: 'budget', tone: runway < 8 ? 'danger' : 'watch',
    });
  }
  if (activeRebellions.length > 0) {
    pushUnique(priorities, {
      id: 'rebellion', title: 'Put down the rebellion',
      detail: `${activeRebellions.length} armed movement${activeRebellions.length === 1 ? '' : 's'} challenge the state.`,
      action: 'Review rebel fronts', destination: 'military', tone: 'danger',
    });
  } else if (player.unrest >= 0.45 || activeMovement?.boiling) {
    pushUnique(priorities, {
      id: 'unrest', title: 'Defuse domestic unrest',
      detail: activeMovement?.boiling
        ? `${activeMovement.cultureName} nationalism is ready to erupt.`
        : `Average state unrest is ${percent(player.unrest)} and militancy is ${player.militancy.toFixed(1)}.`,
      action: activeMovement?.boiling ? 'Review cultures' : 'Review reforms',
      destination: activeMovement?.boiling ? 'cultures' : 'politics', tone: 'danger',
    });
  }
  if (playerWars.length > 0) {
    const war = playerWars[0]!;
    const perspective = war.attackers.includes(player.id) ? war.score : -war.score;
    pushUnique(priorities, {
      id: 'war', title: perspective >= 10 ? 'Turn leverage into peace' : 'Direct the war effort',
      detail: `${playerWars.length} active war${playerWars.length === 1 ? '' : 's'}. Current warscore from our side: ${perspective.toFixed(1)}.`,
      action: 'Open military command', destination: 'military', tone: perspective < -15 ? 'danger' : 'watch',
    });
  }
  if (!researchActive) {
    pushUnique(priorities, {
      id: 'research', title: 'Set a research programme',
      detail: `${snapshot.playerTech?.researchPoints.toFixed(0) ?? '0'} research points are idle. Technology compounds across the whole century.`,
      action: 'Choose technology', destination: 'technology', tone: 'watch',
    });
  }
  if (availableDecision) {
    pushUnique(priorities, {
      id: 'decision', title: availableDecision.title,
      detail: `${availableDecision.description} The cabinet can act now.`,
      action: 'Review decision', destination: 'decisions', tone: 'good',
    });
  }
  if (formable && priorities.length < 4) {
    pushUnique(priorities, {
      id: 'formable', title: formable.ready ? `Proclaim ${formable.name}` : `Advance ${formable.name}`,
      detail: formable.ready ? 'Every requirement is met.' : formable.reason,
      action: 'Open national claims', destination: 'formables', tone: formable.ready ? 'good' : 'neutral',
    });
  }
  if (factoryCount < factoryTarget && priorities.length < 4) {
    pushUnique(priorities, {
      id: 'industry', title: 'Build an industrial base',
      detail: `${factoryCount}/${factoryTarget} cabinet target factories. Profitable industry funds every other ambition.`,
      action: 'Review production', destination: 'production', tone: factoryCount === 0 ? 'watch' : 'neutral',
    });
  }
  if (!isGreatPower && priorities.length < 4) {
    pushUnique(priorities, {
      id: 'great-power', title: 'Climb into the Great Powers',
      detail: gpRatio >= 1
        ? 'Our score has crossed the current threshold. Hold it through the next ranking update.'
        : `${percent(gpRatio)} of the current Great Power threshold. Industry, military, and prestige all count.`,
      action: 'Inspect the rankings', destination: 'great_powers', tone: gpRatio >= 0.85 ? 'good' : 'neutral',
    });
  } else if (alliances === 0 && priorities.length < 4) {
    pushUnique(priorities, {
      id: 'alliance', title: 'Find a dependable ally',
      detail: 'No alliance protects the country. Rivals will weigh that isolation before attacking.',
      action: 'Open diplomacy', destination: 'diplomacy', tone: 'neutral',
    });
  }

  const headline = priorities[0]?.title ?? 'The state is secure. Choose the next national ambition.';
  const readinessTarget = Math.max(1, Math.min(Math.max(2, Math.ceil(armyCapacity * 0.5)), 12));
  const chapters = [
    completeChapter('I. Secure the state', 'Build room to act without courting collapse.', [
      { label: 'Run a balanced monthly budget', met: snapshot.playerBudget.net >= 0 && !player.isBankrupt },
      { label: 'Meet at least 65% of population needs', met: needsMet >= 0.65 },
      { label: 'Keep average unrest below 40%', met: player.unrest < 0.4 },
      { label: 'Keep a research programme active', met: researchActive },
    ]),
    completeChapter('II. Build national power', 'Turn stability into industry, arms, and friends.', [
      { label: `Operate ${factoryTarget} factories`, met: factoryCount >= factoryTarget },
      { label: `Field ${readinessTarget} regiments`, met: regiments >= readinessTarget },
      { label: 'Secure at least one alliance', met: alliances > 0 },
      { label: 'Reach 20 industry score', met: player.industryScore >= 20 },
    ]),
    completeChapter('III. Leave a legacy', directionDetail, formable ? [
      { label: `Control ${formable.requiredCoreStates} ${formable.name} core states`, met: formable.controlledCoreStates >= formable.requiredCoreStates },
      { label: 'Earn Great Power status', met: isGreatPower },
      { label: 'Reach 100 prestige', met: player.prestige >= 100 },
      { label: 'Fight at least one national war', met: warsFought > 0 || playerWars.length > 0 },
    ] : [
      { label: 'Enter the Great Powers', met: isGreatPower },
      { label: 'Reach the top four powers', met: player.gpRank > 0 && player.gpRank <= 4 },
      { label: 'Reach 100 prestige', met: player.prestige >= 100 },
      { label: 'Fight at least one national war', met: warsFought > 0 || playerWars.length > 0 },
    ]),
  ];

  const measures: AgendaMeasure[] = [
    { label: 'Treasury', value: money(player.treasury),
      detail: `${snapshot.playerBudget.net >= 0 ? '+' : ''}${money(snapshot.playerBudget.net)} monthly`,
      tone: player.isBankrupt || snapshot.playerBudget.net < 0 ? 'danger' : 'good', destination: 'budget' },
    { label: 'People', value: `${(population / 1_000_000).toFixed(population >= 10_000_000 ? 1 : 2)}m`,
      detail: `${percent(needsMet)} needs met, ${percent(player.unrest)} unrest`,
      tone: needsMet < 0.55 || player.unrest >= 0.5 ? 'danger' : needsMet < 0.7 ? 'watch' : 'good', destination: 'population' },
    { label: 'Industry', value: player.industryScore.toFixed(1),
      detail: `${factoryCount} factories across ${snapshot.playerStates.length} states`,
      tone: factoryCount >= factoryTarget ? 'good' : factoryCount === 0 ? 'watch' : 'neutral', destination: 'production' },
    { label: 'Armed forces', value: `${regiments}/${armyCapacity}`,
      detail: `${playerArmies.length} field armies, regiment count/capacity`,
      tone: regiments >= readinessTarget ? 'good' : regiments === 0 ? 'danger' : 'watch', destination: 'military' },
    { label: 'World standing', value: isGreatPower ? `#${player.gpRank}` : 'Unranked',
      detail: `${player.powerScore.toFixed(1)} power, ${player.prestige.toFixed(0)} prestige`,
      tone: isGreatPower ? 'good' : gpRatio >= 0.8 ? 'watch' : 'neutral', destination: 'great_powers' },
    { label: 'Diplomatic risk', value: `${player.infamy.toFixed(1)}/${snapshot.infamyLimit.toFixed(1)}`,
      detail: `${alliances} alliance${alliances === 1 ? '' : 's'}`,
      tone: infamyRatio >= 1 ? 'danger' : infamyRatio >= 0.75 ? 'watch' : 'good', destination: 'diplomacy' },
  ];

  return { direction, directionDetail, headline, priorities: priorities.slice(0, 4), measures, chapters };
}
