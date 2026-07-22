/**
 * Grand Century — shared domain contract.
 *
 * THE single source of truth for the game data model. Both the simulation
 * (which runs in a Web Worker, see src/worker) and the UI (src/ui, src/map)
 * import from here and nowhere else for domain shapes.
 *
 * Rules:
 *  - Pure data only. No functions, no classes, no DOM, no imports.
 *  - The sim OWNS the mutable world. The UI only ever reads a `WorldSnapshot`.
 *  - All player intent flows to the sim as a `Command`. The UI never mutates.
 *
 * See the master doc (§3 entities, §4 architecture) for the design rationale.
 */

// ---------------------------------------------------------------------------
// Primitives & ids
// ---------------------------------------------------------------------------

export type NationId = number;   // index into nations
export type ProvinceId = number; // index into provinces (matches baked geometry)
export type StateId = number;    // index into states
export type PopId = number;      // index into the pop store
export type GoodId = number;     // index into the goods table
export type ArmyId = number;
export type FleetId = number;
export type WarId = number;

/** Days since the game epoch (1836-01-01). The sim's canonical clock. */
export type GameDay = number;

export interface GameDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-based day of month
}

// ---------------------------------------------------------------------------
// Static content (baked at build time from /content — see master doc §6)
// ---------------------------------------------------------------------------

export type Terrain =
  | 'plains' | 'farmland' | 'forest' | 'hills' | 'mountains'
  | 'desert' | 'jungle' | 'marsh' | 'arctic' | 'ocean' | 'coast';

export interface GoodDef {
  id: GoodId;
  key: string;          // 'grain', 'iron', 'small_arms', ...
  name: string;
  category: 'raw' | 'intermediate' | 'manufactured' | 'military';
  basePrice: number;    // world-market anchor price
}

/** A factory/RGO recipe: inputs -> outputs per unit of employment. */
export interface Recipe {
  key: string;
  name: string;
  inputs: { good: GoodId; amount: number }[]; // <= 3 inputs (master doc §3.4)
  output: { good: GoodId; amount: number };
  building: 'rgo' | 'factory';
  /** 0.6.0 research: recipe is buildable only once this tech is researched. */
  requiresTech?: string;
  /** 0.6.0 research: recipe requires a state with at least one coastal province. */
  requiresCoastal?: boolean;
}

export type PopType =
  | 'aristocrat' | 'capitalist' | 'clergy' | 'clerk' | 'craftsman'
  | 'farmer' | 'laborer' | 'soldier' | 'officer' | 'slave';

export interface NeedAmount {
  good: GoodId;
  amount: number;
}

export interface PopNeedsDef {
  life: NeedAmount[];
  everyday: NeedAmount[];
  luxury: NeedAmount[];
}

export interface CultureDef {
  key: string;
  name: string;
  color: [number, number, number];
  /** 0.8.0 culture: typical religion key for pops of this culture (optional). */
  religion?: string;
}
export interface ReligionDef { key: string; name: string; }

export type ReformCategory = 'economic' | 'political' | 'social' | 'military';

export interface ReformDef {
  key: string;
  category: ReformCategory;
  name: string;
  /** Ordered options low->high; index is the enacted level. */
  options: { key: string; name: string; effects: string[] }[];
}

export type PartyIdeology =
  | 'reactionary'
  | 'conservative'
  | 'liberal'
  | 'socialist'
  | 'communist'
  | 'fascist';

export interface Party {
  key: string;
  name: string;
  ideology: PartyIdeology;
  /** preferred reform level per ReformDef.key */
  positions: Record<string, number>;
}

export interface TechDef {
  key: string;
  name: string;
  category: 'army' | 'navy' | 'commerce' | 'industry' | 'culture';
  cost: number;
  effects: string[];
  /** 0.6.0 research: earliest game year this tech may be researched. */
  year?: number;
  /** 0.6.0 research: tech key that must be researched first (linear columns). */
  prereq?: string;
  /** 0.6.0 research: typed modifiers aggregated by the research system. */
  modifiers?: Partial<TechModifiers>;
  /** 0.6.0 research: recipe keys this tech makes buildable. */
  unlocksRecipes?: string[];
}

/**
 * 0.6.0 research — the typed modifier surface techs & inventions feed into.
 * Aggregated per nation by src/sim/systems/research.ts; consumed by economy
 * (throughput), budget (tax efficiency), and the research system itself.
 */
export interface TechModifiers {
  /** Multiplier bonus on factory output (0.06 = +6%). */
  factoryThroughput: number;
  /** Multiplier bonus on RGO output. */
  rgoThroughput: number;
  /** Multiplier bonus on monthly tax income. */
  taxEfficiency: number;
  /** Multiplier bonus on monthly research point gain. */
  researchRate: number;
  /** Flat monthly literacy gain (fraction, e.g. 0.0005). */
  literacyRate: number;
  /** Flat monthly prestige drip. */
  prestigeMonthly: number;
  /**
   * 0.7.0 tech-depth — additive monthly pop growth-rate bonus (e.g. 0.00003).
   * Applied in pops.ts on top of healthcare/needs; still clamped by maxGrowthRate.
   */
  popGrowth?: number;
  /**
   * 0.7.0 tech-depth — army movement speed bonus (0.1 = 10% fewer move days).
   * Railroads / logistics techs. Applied in war.ts movementDaysForArmy.
   */
  armyMovement?: number;
  /**
   * 0.7.0 tech-depth — extra friendly-control supply range provinces.
   * Railroads / logistics. Applied in war.ts isSupplied.
   */
  supplyRange?: number;
  /**
   * 0.7.0 tech-depth — factory revenue multiplier bonus (0.05 = +5%).
   * Commerce/finance. Applied in economy.ts processFactory.
   */
  factoryProfit?: number;
  /**
   * 0.7.0 tech-depth — tariff income multiplier bonus (0.05 = +5%).
   * Commerce/trade. Applied when monthly tariff income is settled in budget.
   */
  tradeEfficiency?: number;
}

/**
 * 0.6.0 research — an invention: a discrete discovery that can fire once a
 * prerequisite tech is researched. Rolled monthly (deterministic rng), scaled
 * by literacy.
 */
export interface InventionDef {
  key: string;
  name: string;
  description: string;
  /** Tech that must be researched before this invention can fire. */
  prereqTech: string;
  /** Base monthly chance (before literacy scaling). */
  monthlyChance: number;
  modifiers?: Partial<TechModifiers>;
}

export interface FormableDefinition {
  /** 1.0-U1: unification needs matured nationalism — no Germany in 1821. */
  yearAtLeast?: number;
  key: string;
  resultTag: string;
  resultName: string;
  resultColor: [number, number, number];
  resultPrimaryCulture?: string;
  candidateTags: string[];
  coreStateIds: StateId[];
  requiredCoreShare: number;
  requireIndependent: boolean;
  requireGreatPower: boolean;
  prestigeReward: number;
}

// ---------------------------------------------------------------------------
// Events & decisions (E4 — data-driven narrative agency)
// ---------------------------------------------------------------------------

/** Composable mutation applied by an event choice or decision. */
export type EventEffect =
  | { t: 'treasury'; amount: number }
  | { t: 'prestige'; amount: number }
  | { t: 'infamy'; amount: number }
  | { t: 'militancy'; amount: number }
  | { t: 'consciousness'; amount: number }
  | { t: 'literacy'; amount: number }
  | { t: 'researchPoints'; amount: number }
  | { t: 'colonialPoints'; amount: number }
  | { t: 'unrest'; amount: number }
  | { t: 'reformLevel'; reform: string; delta: number }
  | { t: 'modifyGoodPrice'; goodKey: string; factor: number }
  | { t: 'modifyGoodStockpile'; goodKey: string; amount: number }
  | { t: 'relationsWithGps'; amount: number }
  | { t: 'spawnRebels' }
  | { t: 'grantColonialClaim' }
  | { t: 'boostFactories'; levels: number }
  | { t: 'boostRgo'; goodKey?: string; levels: number }
  // 1.0-U1: content-driven diplomacy — free CBs, targeted opinion, rivalry.
  | { t: 'grantCasusBelli'; targetTag: string; goal: WarGoalType; monthsValid?: number }
  | { t: 'opinionWithTags'; tags: string[]; amount: number }
  | { t: 'forceRivalry'; tag: string };

export type EventRequirement =
  | { t: 'minTreasury'; value: number }
  | { t: 'minPrestige'; value: number }
  | { t: 'minColonialPoints'; value: number }
  | { t: 'isGreatPower' }
  | { t: 'isCivilized' }
  | { t: 'reformAtMost'; reform: string; level: number }
  | { t: 'reformAtLeast'; reform: string; level: number }
  | { t: 'yearAtLeast'; value: number }
  | { t: 'yearAtMost'; value: number }
  | { t: 'minLiteracy'; value: number }
  | { t: 'hasFormableCandidate' }
  // 1.0-U1: decision-chain gating.
  | { t: 'tagIn'; tags: string[] }
  | { t: 'decisionTaken'; id: string }
  | { t: 'formableCoreShareAtLeast'; key: string; share: number };

export interface EventTriggerDef {
  yearAtLeast?: number;
  yearAtMost?: number;
  minMilitancy?: number;
  maxMilitancy?: number;
  minAvgNeedsMet?: number;
  maxAvgNeedsMet?: number;
  minTreasury?: number;
  maxTreasury?: number;
  minLiteracy?: number;
  maxLiteracy?: number;
  isGreatPower?: boolean;
  isCivilized?: boolean;
  hasUncolonizedAdjacent?: boolean;
  hasFormableCandidate?: boolean;
  minFactoryCount?: number;
  tags?: string[];
  excludeTags?: string[];
  /** 1.0-U1: only fire once the nation has taken this decision. */
  decisionTaken?: string;
}

export interface EventChoiceDef {
  id: string;
  label: string;
  description?: string;
  effects: EventEffect[];
  requirements?: EventRequirement[];
  /** Higher = preferred by AI heuristic. */
  aiWeight?: number;
}

export interface EventDef {
  id: string;
  title: string;
  description: string;
  trigger: EventTriggerDef;
  /** Mean months between fire attempts when eligible. */
  mtthMonths: number;
  weight?: number;
  once: boolean;
  /** For repeatable events, minimum months between fires for the same nation. */
  cooldownMonths?: number;
  choices: EventChoiceDef[];
}

export interface DecisionDef {
  id: string;
  title: string;
  description: string;
  prerequisites: EventRequirement[];
  cost: { treasury?: number; prestige?: number; researchPoints?: number };
  effects: EventEffect[];
  cooldownMonths?: number;
  once?: boolean;
}

export interface PendingEventChoiceView {
  id: string;
  label: string;
  description?: string;
  effectsSummary: string[];
  available: boolean;
  unavailableReason?: string;
}

export interface PendingEvent {
  instanceId: number;
  eventKey: string;
  nationId: NationId;
  firedDay: GameDay;
  title: string;
  description: string;
  choices: PendingEventChoiceView[];
}

export interface DecisionStatus {
  id: string;
  title: string;
  description: string;
  available: boolean;
  reason: string;
  costSummary: string[];
  effectsSummary: string[];
}

export interface FormableRequirementStatus {
  key: 'candidate' | 'independent' | 'power' | 'core_control' | 'era';
  label: string;
  met: boolean;
  detail: string;
}

export interface FormableStatus {
  key: string;
  name: string;
  targetTag: string;
  ready: boolean;
  reason: string;
  coreStateIds: StateId[];
  controlledCoreStates: number;
  totalCoreStates: number;
  requiredCoreStates: number;
  requirements: FormableRequirementStatus[];
  /** Prestige granted on successful form (after NGF→GER stacking gate). */
  prestigeReward?: number;
  /** Per-core Owned / Sphered / Missing. */
  coreBreakdown?: Array<{ stateId: StateId; owner: NationId; kind: 'owned' | 'sphered' | 'missing' }>;
  ownedCoreCount?: number;
  spheredCoreCount?: number;
  /** Sphere members whose cores satisfy control but are not annexed on proclaim. */
  spheredRemainTags?: string[];
}

/** Everything static the game is built from. Loaded once, never mutated. */
export interface GameData {
  startDate: GameDate;   // 1836-01-01
  goods: GoodDef[];
  recipes: Recipe[];
  popNeeds: Record<PopType, PopNeedsDef>;
  cultures: CultureDef[];
  religions: ReligionDef[];
  reforms: ReformDef[];
  techs: TechDef[];
  provinceCount: number;
  nationCores?: Record<string, StateId[]>;
  formables?: FormableDefinition[];
  /** 0.6.0 research: inventions rolled monthly once their prereq tech is in. */
  inventions?: InventionDef[];
}

// ---------------------------------------------------------------------------
// Mutable world entities (owned by the sim)
// ---------------------------------------------------------------------------

export interface Pop {
  id: PopId;
  type: PopType;
  provinceId: ProvinceId;
  size: number;
  culture: number;       // index into cultures
  religion: number;      // index into religions
  money: number;
  militancy: number;     // 0-10
  consciousness: number; // 0-10
  needsMet: number;      // 0-1, fraction of life+everyday needs satisfied
  lastGrowth: number;    // monthly growth delta from last monthly tick
  /** ideology/issue leanings summed to 1; kept compact for perf */
  ideology: number;      // index into a small ideology enum for shallow model
  /** Last weekly life-needs fill fraction (0–1). Optional for old saves. */
  lifeNeedsFrac?: number;
  /** Last weekly everyday-needs fill fraction (0–1). */
  everydayNeedsFrac?: number;
  /** Last weekly luxury-needs fill fraction (0–1). */
  luxuryNeedsFrac?: number;
  /** Goods with unmet demand last weekly tick (worst fills first, capped). */
  scarceGoods?: { good: GoodId; fill: number }[];
}

export interface RGO {
  recipe: string;        // Recipe.key with building 'rgo'
  level: number;         // capacity
  employed: number;
  /** Last weekly owner+state share after wages (not a fabricated proxy). */
  weeklyProfit: number;
}

/** 1.0-U5: one yearly line of the player's campaign, recorded by the sim. */
export interface ChronicleEntry {
  year: number;
  tag: string;
  name: string;
  provinces: number;
  population: number;
  treasury: number;
  prestige: number;
  gpRank: number;
  techs: number;
  warsActive: number;
  infamy: number;
}

/** 1.0-U4: battle outcome record with the WHY — factor edges attacker-minus-defender. */
export interface BattleReport {
  day: GameDay;
  provinceId: ProvinceId;
  provinceName: string;
  warId: WarId;
  attackerNation: NationId;
  defenderNation: NationId;
  attackerLosses: number;
  defenderLosses: number;
  outcome: 'attacker_victory' | 'defender_victory' | 'clash';
  factors: {
    roll: number;
    organization: number;
    leadership: number;
    technology: number;
    terrain: number;
    fort: number;
  };
}

export interface Factory {
  recipe: string;        // Recipe.key with building 'factory'
  level: number;
  employed: number;
  stockpileIn: number;   // buffered inputs
  profitTrend: number;   // recent profit, drives expansion/closure
  weeklyProfit: number;
  cashReserve: number;
  workerShare: number;   // craftsman employed this week
  clerkShare: number;    // clerk employed this week
  lastOutput: number;
  profitableWeeks: number;
  lossWeeks: number;
  /** Last-week P&L / employment diagnostics for Production panel traces. */
  lastInputCost: number;
  lastWages: number;
  lastOperating: number;
  lastCapacity: number;
  /** 0–1 fraction of needed inputs actually purchased last week. */
  lastInputFill: number;
}

export interface Province {
  id: ProvinceId;
  name: string;
  owner: NationId;
  controller: NationId;  // differs from owner while occupied
  stateId: StateId;
  terrain: Terrain;
  rgo: RGO;
  fortLevel: number;
  navalBaseLevel: number;
  coastal: boolean;
  neighbors: ProvinceId[];
  popIds: PopId[];
  occupationProgress: number; // 0-1 toward flipping controller
  /** Colonization: 0 = uncolonized/unowned-by-anyone claimable region. */
  colonial: boolean;
}

export interface State {
  id: StateId;
  name: string;
  owner: NationId;
  provinceIds: ProvinceId[];
  factories: Factory[];   // factories live at the state level
  unrestRisk: number;     // 0-1+ monthly pressure toward rebellion
  unrestMonths: number;   // consecutive high-unrest months
  lastRebellionDay: GameDay;
}

export type GovernmentType =
  | 'absolute_monarchy' | 'constitutional_monarchy' | 'hms_government'
  | 'democracy' | 'presidential_dictatorship' | 'proletarian_dictatorship'
  | 'fascist_dictatorship' | 'uncivilized';

export interface Nation {
  id: NationId;
  tag: string;           // 'ENG', 'FRA', ...
  name: string;
  color: [number, number, number];
  primaryCulture: number;
  acceptedCultures: number[];
  government: GovernmentType;
  rulingParty: string; // Party.key
  parties: Party[];
  upperHouse: Record<PartyIdeology, number>; // ideology share, sums to 1
  electionIntervalYears: number;
  lastElectionYear: number;
  nextElectionYear: number;
  electionLastResult: string;
  capital: ProvinceId;
  coreStateIds?: StateId[];

  treasury: number;
  prestige: number;
  infamy: number;
  literacy: number;      // 0-1
  nationalConsciousness: number; // 0-10
  researchPoints: number;

  /** enacted reform level per ReformDef.key */
  reforms: Record<string, number>;
  /** researched tech keys */
  techs: string[];
  /** 0.6.0 research: tech currently being researched (null/undefined = none). */
  currentResearch?: string | null;
  /** 0.6.0 research: points already sunk into currentResearch. */
  researchProgress?: number;
  /** 0.6.0 research: invention keys that have fired for this nation. */
  inventions?: string[];

  taxRatePoor: number;   // 0-1 sliders
  taxRateMiddle: number;
  taxRateRich: number;
  tariffRate: number;    // -1..1

  gpRank: number;        // 0 = not a great power; 1..8 = GP rank
  spheredBy: NationId;   // -1 if none
  sphereMembers: NationId[];
  colonialPoints: number;

  isCivilized: boolean;
  isPlayer: boolean;
  isBankrupt: boolean;
  bankruptcyMonths: number;
  constructionBlocked: boolean;
  monthlyTariffIncome: number;
  monthlyProductionIncome: number;
  lastBudget: BudgetLine;

  // Derived monthly from military reforms (consumed by war in M5).
  regimentsPerSoldierPop: number;
  standingRegimentCapacity: number;
  mobilizationCapacity: number;
  armyOrganization: number;
  armyMorale: number;

  // --- 0.8.0 culture (optional: old saves self-heal) ---
  /** Stance toward non-accepted cultures. Default 'assimilationist'. */
  culturePolicy?: CulturePolicy;
  /** culture index -> people assimilated out of it last month (UI trace). */
  assimilationByCulture?: Record<number, number>;
}

// ---------------------------------------------------------------------------
// Military & war (the star system — master doc §3.3)
// ---------------------------------------------------------------------------

export interface Leader {
  name: string;
  attack: number;
  defense: number;
  trait: string;
}

export interface Regiment {
  type: 'infantry' | 'cavalry' | 'artillery' | 'guard';
  strength: number;      // manpower 0-1000
  organization: number;  // 0-100, depleted before strength
  sourcePop: PopId;      // soldier pop that supplies it
}

export type RebelDemandType = 'enact_reform' | 'independence';

export interface RebelDemand {
  type: RebelDemandType;
  description: string;
  reformKey?: string;
  reformLevel?: number;
  culture?: number;
  stateIds?: StateId[];
}

export interface Rebellion {
  id: number;
  targetNation: NationId;
  originState: StateId;
  startDay: GameDay;
  progress: number;
  holdDays: number;
  status: 'active' | 'enforced' | 'crushed';
  demand: RebelDemand;
}

export interface Army {
  id: ArmyId;
  owner: NationId;
  location: ProvinceId;
  moveTarget: ProvinceId; // -1 if stationary
  moveProgress: number;   // 0-1 along current leg
  regiments: Regiment[];
  leader: Leader | null;
  rebel: boolean;
  hostileTo: NationId;
  rebellionId?: number;
  rebelDemand?: RebelDemand | null;
  /** Snapshot/display: in supply range of friendly control. */
  supplied?: boolean;
}

export interface Ship {
  type: 'transport' | 'frigate' | 'manofwar' | 'ironclad';
  strength: number;
  organization: number;
}

export interface Fleet {
  id: FleetId;
  owner: NationId;
  location: ProvinceId;   // a coastal/sea province
  moveTarget: ProvinceId;
  moveProgress: number;
  ships: Ship[];
  embarkedArmy: ArmyId;   // -1 if none
}

export type WarGoalType =
  | 'annex_state' | 'liberate_state' | 'humiliate' | 'add_to_sphere'
  | 'take_colony' | 'cut_down_to_size';

export interface WarGoal {
  holder: NationId;      // who benefits
  target: NationId;
  type: WarGoalType;
  stateId: StateId;      // -1 if not state-specific
  scoreValue: number;    // war-score % required/awarded
}

/** Additive warscore parts from updateWarScores (attackers' perspective). */
export interface WarScoreBreakdown {
  occupation: number;
  capital: number;
  blockade: number;
  battle: number;
  exhaustion: number;
}

export interface War {
  id: WarId;
  attackers: NationId[];
  defenders: NationId[];
  goals: WarGoal[];
  /** war score from the attackers' perspective, -100..100 */
  score: number;
  attackerExhaustion: number;
  defenderExhaustion: number;
  startDay: GameDay;
  /** Component parts that sum (pre-clamp) into score. Display-only / additive. */
  scoreBreakdown?: WarScoreBreakdown;
}

export type DiploRelationKind =
  | 'alliance' | 'guarantee' | 'truce' | 'rivalry' | 'neutral';

export interface DiploRelation {
  a: NationId;
  b: NationId;
  kind: DiploRelationKind;
  opinion: number;       // -200..200
  expiresDay: GameDay;   // -1 if permanent
}

export interface CasusBelli {
  holder: NationId;
  target: NationId;
  goal: WarGoalType;
  stateId: StateId;
  scoreCost: number;
  infamyCost: number;
  readyDay: GameDay;
  expiresDay: GameDay;
  discovered: boolean;
}

export interface GreatPowerStanding {
  nation: NationId;
  rank: number;
  industry: number;
  military: number;
  prestige: number;
  score: number;
  sphereMembers: NationId[];
  influencePool: number;
}

export interface InfluenceTarget {
  target: NationId;
  points: number;
  /** Highest rival GP influence on the same target (0 if uncontested). */
  rivalPressure: number;
}

/** Precomputed alliance acceptance score for a Propose Alliance click. */
export interface AllianceAcceptancePreview {
  target: NationId;
  score: number;
  accepted: boolean;
}

// ---------------------------------------------------------------------------
// 0.7.0 Concert of Europe — world tension, flashpoint crises, congresses.
// All world/snapshot fields for this system are OPTIONAL so pre-0.7.0 saves
// load unchanged (the crisis system self-heals missing state).
// ---------------------------------------------------------------------------

export type CrisisType = 'sphere_contest' | 'containment' | 'humiliation';
export type CrisisSide = 'attacker' | 'defender';

/**
 * A single active international crisis (world singleton, Vic2-HoD style).
 * Two great-power leads press/resist a concrete demand over a subject nation;
 * other GPs may back either side while temperature climbs toward a showdown.
 */
export interface Crisis {
  id: number;
  type: CrisisType;
  /** The nation the crisis is about (sphere target, infamous power, rival). */
  subject: NationId;
  /** Demand the attacker side enforces on victory. */
  demand: WarGoalType;
  stateId: StateId;          // -1 unless demand is state-specific
  attackerLead: NationId;
  defenderLead: NationId;
  /** Full sides, leads included. */
  attackerBackers: NationId[];
  defenderBackers: NationId[];
  startDay: GameDay;
  /** Unresolved by this day -> showdown (congress or war). */
  deadlineDay: GameDay;
  /** 0-100 escalation; 100 forces the showdown early. */
  temperature: number;
  /** Leads that pressed the demand (blocks their AI from backing down). */
  pressedBy: NationId[];
}

/** Ledger entry for a resolved crisis — the Concert's public record. */
export interface CongressRecord {
  id: number;
  name: string;
  day: GameDay;
  type: CrisisType;
  subject: NationId;
  /** 'congress' = peaceful settlement, 'war' = blocs went to war, 'fizzle' = collapsed. */
  outcome: 'congress' | 'war' | 'fizzle';
  winnerLead: NationId;      // -1 when no winner (war/fizzle)
  loserLead: NationId;       // -1 when no loser
  detail: string;
}

/** One labelled contribution to world tension (UI trace tooltip). */
export interface TensionContribution {
  label: string;
  value: number;
}

/** Player-facing BoP readout when approaching a formable. */
export interface BalanceOfPowerView {
  formableKey: string;
  formableName: string;
  share: number;
  alarmed: boolean;
  rivalryThreat: boolean;
  monthlyOpinionHit: number;
  alarmedGpCount: number;
}

/** Idle flashpoint ranking for the Concert panel. */
export interface CrisisCandidateView {
  type: CrisisType;
  subject: NationId;
  demand: WarGoalType;
  attackerLead: NationId;
  defenderLead: NationId;
  score: number;
}

/** Active-crisis brinkmanship readout for the Concert panel. */
export interface CrisisShowdownView {
  attackerPower: number;
  defenderPower: number;
  powerRatio: number;
  showdownThreshold: number;
  forecast: 'congress_attacker' | 'congress_defender' | 'war';
  pressTemperature: number;
  pressTempAfter: number;
  backDownWinnerLeadPrestige: number;
  backDownLoserLeadPrestige: number;
  demandEnforceOnAttackerWin: boolean;
  peacefulContainmentLimited: boolean;
}

// ---------------------------------------------------------------------------
// 0.8.0 The Age of Nationalism — culture policy, assimilation, national
// movements. All world/nation/snapshot fields for this system are OPTIONAL so
// pre-0.8.0 saves load unchanged (culture.ts self-heals via ensureCultureState).
// ---------------------------------------------------------------------------

/**
 * A nation's stance toward its non-accepted cultures.
 * - exclusionary: forced assimilation — slightly faster melting, much more
 *   resentment (militancy + movement radicalism).
 * - assimilationist: the default 19th-century state-building posture.
 * - pluralist: minorities live freely — little resentment, slow assimilation.
 */
export type CulturePolicy = 'exclusionary' | 'assimilationist' | 'pluralist';

/**
 * A national awakening: one non-accepted culture inside one nation organising
 * toward a nation-state. Radicalism 0-100; at the top end (plus real anger) the
 * movement launches an independence rebellion through the existing rebellion
 * machinery (BALANCE.rebellion caps and cooldowns fully apply).
 */
export interface NationalMovement {
  id: number;
  nation: NationId;          // the empire being agitated against
  culture: number;           // index into GameData.cultures
  startDay: GameDay;
  /** 0-100 organisational fervor; >= uprising threshold can rebel. */
  radicalism: number;
  /** States where this culture is the plurality — the claimed homeland. */
  heartlandStateIds: StateId[];
  /** Total pop size of the culture inside the nation (recomputed monthly). */
  adherents: number;
  /** Monthly-averaged militancy/consciousness of the culture's pops. */
  militancy: number;
  consciousness: number;
  /** Last day this movement launched an uprising (-1 never). */
  lastUprisingDay: GameDay;
}

/** Snapshot row: one culture inside the player nation (Cultures ledger). */
export interface CultureLedgerEntry {
  culture: number;
  key: string;
  name: string;
  size: number;
  /** Share of the nation's total population, 0-1. */
  share: number;
  primary: boolean;
  accepted: boolean;
  avgMilitancy: number;
  avgConsciousness: number;
  /** People assimilated out of this culture last month (0 for primary). */
  assimilatedLastMonth: number;
  /** Player may grant acceptance right now (share/mechanics gate). */
  canAccept: boolean;
}

/** Snapshot row: a national movement inside the player nation. */
export interface MovementView {
  id: number;
  culture: number;
  cultureName: string;
  radicalism: number;
  adherents: number;
  militancy: number;
  consciousness: number;
  heartlandStateIds: StateId[];
  heartlandNames: string[];
  /** True when radicalism is in the uprising band — a rebellion may fire. */
  boiling: boolean;
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export interface MarketGood {
  good: GoodId;
  price: number;
  supply: number;        // last period
  demand: number;        // last period
  sold: number;
  /** Unmet consumer demand last week (requested − bought). */
  unmet: number;
  worldStockpile: number;
  trend: number[];
  priceTrace: PriceTrace;
}

export interface PriceTrace {
  basePrice: number;
  ratio: number;
  damping: number;
  requestedDemand: number;
  effectiveSupply: number;
  stockpileStart: number;
  stockpileEnd: number;
}

export interface MarketRuntimeGood {
  good: GoodId;
  stockpileStart: number;
  remainingProducer: number;
  remainingStockpile: number;
  producerSupply: number;
  requestedDemand: number;
  consumerBought: number;
  stockpileBuy: number;
  stockpileSell: number;
}

export interface MarketInvariant {
  good: GoodId;
  supply: number;
  sold: number;
  stockpileStart: number;
  stockpileEnd: number;
  residual: number;
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Full world state (lives in the worker; never sent whole to the UI raw)
// ---------------------------------------------------------------------------

/** Campaign world layout — distinct from HUD MapMode (political/terrain/…). */
export type CampaignMapMode =
  | 'historical'
  | 'procedural_real'
  | 'procedural_random';

export interface World {
  day: GameDay;
  seed: number;
  rngState: number;
  speed: number;         // 0 = paused, 1..5
  playerNation: NationId;
  /** How the starting political map was generated. */
  mapMode?: CampaignMapMode;

  nations: Nation[];
  provinces: Province[];
  states: State[];
  pops: Pop[];
  market: MarketGood[];
  marketRuntime: MarketRuntimeGood[];
  marketInvariants: MarketInvariant[];
  armies: Army[];
  fleets: Fleet[];
  wars: War[];
  rebellions: Rebellion[];
  relations: DiploRelation[];

  /** Pending narrative events awaiting a choice (player + AI buffer). */
  pendingEvents: PendingEvent[];
  /** `${eventId}:${nationId}` -> last fired day */
  eventLastFired: Record<string, GameDay>;
  /** `${decisionId}:${nationId}` -> last taken day */
  decisionLastTaken: Record<string, GameDay>;
  /** 1.0-U4: rolling battle log (capped); source for player battle alerts. */
  recentBattles?: BattleReport[];
  /** 1.0-U5: yearly campaign chronicle for the player nation. */
  chronicle?: ChronicleEntry[];
  /** 1.0-U5: distinct wars the player has fought (ids, cumulative). */
  chronicleWarIds?: number[];
  nextEventInstanceId: number;

  nextArmyId: ArmyId;
  nextFleetId: FleetId;
  nextWarId: WarId;
  nextRebellionId: number;
  nextPopId: PopId;

  // --- 0.7.0 Concert of Europe (optional: old saves self-heal) ---
  /** World tension 0-100; high tension breeds crises. */
  tension?: number;
  /** The single active crisis, if any. */
  crisis?: Crisis | null;
  /** Recent resolved crises, newest last (capped). */
  congresses?: CongressRecord[];
  nextCrisisId?: number;
  /** No new crisis spawns before this day (cooldown after resolution). */
  crisisCooldownUntil?: GameDay;

  // --- 0.8.0 culture (optional: old saves self-heal) ---
  /** Active national movements (non-accepted cultures organising). */
  movements?: NationalMovement[];
  nextMovementId?: number;

  /** Last monthly pop mobility flows for the player nation (migration + class conversion). */
  popMobilityLedger?: PopMobilityLedger;
}

// ---------------------------------------------------------------------------
// Snapshot: the read-only view the sim ships to the UI each frame.
// Compact by design — heavy per-pop detail is fetched on demand, not streamed.
// ---------------------------------------------------------------------------

export interface NationSummary {
  id: NationId;
  tag: string;
  name: string;
  color: [number, number, number];
  capital: ProvinceId;
  government: GovernmentType;
  rulingParty: string;
  rulingIdeology: PartyIdeology;
  treasury: number;
  prestige: number;
  infamy: number;
  gpRank: number;
  industryScore: number;
  militaryScore: number;
  powerScore: number;
  spheredBy: NationId;
  sphereMembers: NationId[];
  atWar: boolean;
  numProvinces: number;
  militancy: number; // avg
  unrest: number;    // avg state unrest risk
  taxRatePoor: number;
  taxRateMiddle: number;
  taxRateRich: number;
  tariffRate: number;
  /** Effective setTariff / slider band from trade_policy reform. */
  tariffMin: number;
  tariffMax: number;
  isBankrupt: boolean;
  bankruptcyMonths: number;
  constructionBlocked: boolean;
  mobilizationCapacity: number;
  /** Standing peacetime regiment cap (from soldier pops / reforms). */
  standingRegimentCapacity?: number;
  /** Available colonial points after claim commitments. */
  colonialPoints?: number;
  /** Breakdown of colonial capacity sources. */
  colonialPointsBreakdown?: {
    navalBases: number;
    reforms: number;
    navyTech: number;
    gpBonus: number;
    modifier: number;
    committed: number;
    available: number;
  };
}

export interface ProvinceSummary {
  id: ProvinceId;
  owner: NationId;
  controller: NationId;
  stateId: StateId;
  population: number;
  militancy: number;
  unrestRisk: number;
  needsMet: number;
  growth: number;
  economyOutput: number;
  rgoGood: GoodId;
  fortLevel: number;
  occupation: number;
}

export interface ProductionLedgerEntry {
  kind: 'rgo' | 'factory';
  locationName: string;
  recipe: string;
  outputGood: GoodId;
  outputAmount: number;
  employment: number;
  profit: number;
  level: number;
  /** Employment capacity (RGO level×4200 / factory level×2300). */
  capacity: number;
  inputCost: number;
  wages: number;
  operating: number;
  /** 0–1 input fill; 1 when no shortage (RGOs always 1). */
  inputFill: number;
  cashReserve: number;
  profitableWeeks: number;
  lossWeeks: number;
}

export interface PopulationLedgerEntry {
  type: PopType;
  size: number;
  avgNeedsMet: number;
  avgMilitancy: number;
  avgConsciousness: number;
  dominantIdeology: PartyIdeology;
  agitatingFor: string[];
  growth: number;
  /** Size-aware class averages of last weekly need-tier fills (0–1). */
  avgLifeNeeds?: number;
  avgEverydayNeeds?: number;
  avgLuxuryNeeds?: number;
  /** Worst-filled basket goods for this class (fill 0–1), for Needs tooltips. */
  scarceGoods?: { key: string; name: string; fill: number }[];
  /** Growth-rate formula inputs for the Growth tooltip. */
  growthDrivers?: TraceLine[];
  /** Consciousness formula inputs for the Con tooltip. */
  consciousnessDrivers?: TraceLine[];
}

/** Net domestic migration + class conversion flows from the last monthly pop tick. */
export interface PopMobilityLedger {
  /** World day when the monthly ledger was recorded. */
  day: GameDay;
  /** Total people who changed province (player nation). */
  migrated: number;
  /** Migration volume by pop type. */
  migrations: { type: PopType; amount: number }[];
  /** Class conversions (promotion, demotion, draft, discharge). */
  conversions: { from: PopType; to: PopType; amount: number }[];
}

export interface PlayerStateSummary {
  id: StateId;
  name: string;
  factoryCount: number;
  /** 0.6.0: state contains a coastal province (gates coastal-only recipes). */
  coastal?: boolean;
}

// ---------------------------------------------------------------------------
// 0.6.0 research — snapshot views for the Technology panel
// ---------------------------------------------------------------------------

export interface TechStatusView {
  key: string;
  name: string;
  category: TechDef['category'];
  cost: number;
  year: number;
  prereq: string | null;
  /** Display name of the prereq tech (null when none). */
  prereqName?: string | null;
  researched: boolean;
  /** Can be selected as current research right now. */
  available: boolean;
  /** Human-readable blocker when not available ('' when available/researched). */
  reason: string;
  effectsSummary: string[];
  unlocksRecipes: string[];
  /** Months to finish if started now (null when researched / no RP rate). */
  etaMonths?: number | null;
}

export interface InventionStatusView {
  key: string;
  name: string;
  description: string;
  prereqTech: string;
  owned: boolean;
  /** Prereq tech researched — the invention can fire any month now. */
  prereqMet: boolean;
  effectsSummary: string[];
}

export interface PlayerTechView {
  researchPoints: number;
  /** Points generated per month at current literacy/modifiers. */
  monthlyResearch: number;
  current: string | null;
  /** Points sunk into current research so far. */
  progress: number;
  /** Cost of current research (0 when none selected). */
  currentCost: number;
  techs: string[];
  inventions: string[];
  statuses: TechStatusView[];
  inventionStatuses: InventionStatusView[];
}

export interface ColonialClaimSummary {
  stateId: StateId;
  tension: number;
  claimants: Array<{ nation: NationId; progress: number }>;
  /** Player ETA days to finish at current daily rate; null if not claiming / stalled. */
  etaDays: number | null;
}

export interface ColonialClaimableState {
  stateId: StateId;
  reach: 'adjacent' | 'overseas';
}

/** Sent every rendered frame; province array feeds the map paint. */
export interface WorldSnapshot {
  day: GameDay;
  date: GameDate;
  speed: number;
  playerNation: NationId;
  /** Campaign start seed (for shareable permalinks). */
  seed?: number;
  /** Campaign map generation mode (for shareable permalinks / menu). */
  mapMode?: CampaignMapMode;
  nations: NationSummary[];
  provinces: ProvinceSummary[];
  market: MarketGood[];
  wars: War[];
  relations: DiploRelation[];
  greatPowers: GreatPowerStanding[];
  playerCbs: CasusBelli[];
  /** In-progress CB fabrications (not yet ready). */
  playerPendingCbs: CasusBelli[];
  /** Player diplomatic points (0–120); spent to fabricate CBs. */
  playerDiplomaticPoints: number;
  /** Fabricate-CB cost by war goal (mirrors sim `getFabricateCbCost`). */
  fabricateCbCostByGoal: Record<WarGoalType, number>;
  /** Infamy cost when declaring with a valid CB (from WAR_GOAL_RULES). */
  warGoalInfamyUse: Record<WarGoalType, number>;
  playerInfluencePool: number;
  playerInfluenceTargets: InfluenceTarget[];
  /** Alliance acceptance scores vs the player (threshold 70). */
  playerAlliancePreviews: AllianceAcceptancePreview[];
  infamyLimit: number;
  coalitionAgainstPlayer: NationId[];
  /** Score of the #9 nation — gap to this is the GP rank chase. */
  ninthPowerScore: number;
  /** Player's current power score (GP formula). */
  playerPowerScore: number;
  /** DP cost / concurrent cap for declaring rivalries. */
  rivalryDpCost: number;
  rivalryCap: number;
  playerRivalryCount: number;
  armies: Army[];
  fleets: Fleet[];
  rebellions: Rebellion[];
  playerProduction: ProductionLedgerEntry[];
  playerPopulation: PopulationLedgerEntry[];
  /** Net migration + promotion/demotion flows from the last monthly pop tick. */
  playerPopMobility?: PopMobilityLedger;
  playerReformAgitation: { reform: string; support: number }[];
  playerStates: PlayerStateSummary[];
  playerCoreStateIds?: StateId[];
  playerFormables?: FormableStatus[];
  /** Balance-of-power pressure when the player nears a formable. */
  playerBalanceOfPower?: BalanceOfPowerView | null;
  /** Pending events for the player nation (popup queue). */
  pendingPlayerEvents?: PendingEvent[];
  /** 1.0-U4: battles involving the player, newest last (for alerts). */
  recentBattles?: BattleReport[];
  /** 1.0-U5: campaign chronicle + end state for the recap screen. */
  chronicle?: ChronicleEntry[];
  chronicleWarsFought?: number;
  campaignOver?: 'century' | 'eliminated' | null;
  /** Player-initiated decisions with prereq gating. */
  playerDecisions?: DecisionStatus[];
  /** 0.6.0 research: technology tree + invention state for the player nation. */
  playerTech?: PlayerTechView;
  /** 0.7.0 Concert: world tension 0-100 with trace, active crisis, history. */
  worldTension?: number;
  tensionTrace?: TensionContribution[];
  /** Next-month tension decay and net Δ (pressure − decay). */
  tensionDecay?: number;
  tensionNetDelta?: number;
  crisisCooldownUntil?: number;
  activeCrisis?: Crisis | null;
  crisisShowdown?: CrisisShowdownView | null;
  crisisCandidates?: CrisisCandidateView[];
  congressHistory?: CongressRecord[];
  /** 0.8.0 culture: Cultures ledger + national movements for the player. */
  playerCulturePolicy?: CulturePolicy;
  playerCultures?: CultureLedgerEntry[];
  playerMovements?: MovementView[];
  /** Active colonial claims (progress races). */
  colonialClaims?: ColonialClaimSummary[];
  /** Player-reachable uncolonized states (land-adjacent or overseas naval). */
  playerClaimableColonialStates?: ColonialClaimableState[];
  /** headline numbers for the player nation's HUD */
  playerBudget: BudgetLine;
}

export interface TraceLine {
  label: string;
  value: number;
}

export interface BudgetLine {
  taxIncome: number;
  tariffIncome: number;
  productionIncome: number;
  armyUpkeep: number;
  subsidySpend: number;
  constructionSpend: number;
  adminSpend: number;
  reformUpkeep: number;
  net: number;
  bankrupt: boolean;
  trace: {
    taxIncome: TraceLine[];
    tariffIncome: TraceLine[];
    productionIncome: TraceLine[];
    armyUpkeep: TraceLine[];
    subsidySpend: TraceLine[];
    constructionSpend: TraceLine[];
    adminSpend: TraceLine[];
    reformUpkeep: TraceLine[];
    net: TraceLine[];
  };
}

export interface SaveSlotInfo {
  slot: string;
  updatedAt: number;
  day: GameDay;
  playerNation: NationId;
}

// ---------------------------------------------------------------------------
// Commands: the ONLY way the UI changes the world (§4 architecture)
// ---------------------------------------------------------------------------

export type Command =
  | { t: 'setSpeed'; speed: number }
  | { t: 'setPlayerNation'; nation: NationId }
  | { t: 'setTax'; bracket: 'poor' | 'middle' | 'rich'; rate: number }
  | { t: 'setTariff'; rate: number }
  | { t: 'enactReform'; reform: string; level: number }
  | { t: 'buildFactory'; state: StateId; recipe: string }
  | { t: 'recruitArmy'; province: ProvinceId }
  | { t: 'recruitArmyWithComposition'; province: ProvinceId; composition: Partial<Record<Regiment['type'], number>> }
  | { t: 'assignGeneral'; army: ArmyId }
  | { t: 'mobilize' }
  | { t: 'demobilize' }
  | { t: 'moveArmy'; army: ArmyId; target: ProvinceId }
  | { t: 'buildFleet'; province: ProvinceId; shipType: Ship['type']; count?: number }
  | { t: 'moveFleet'; fleet: FleetId; target: ProvinceId }
  | { t: 'embarkArmy'; fleet: FleetId; army: ArmyId }
  | { t: 'disembarkArmy'; fleet: FleetId; target: ProvinceId }
  | { t: 'proposeAlliance'; target: NationId }
  | { t: 'offerGuarantee'; target: NationId }
  | { t: 'addRival'; target: NationId }
  | { t: 'cancelRelation'; target: NationId; kind: 'alliance' | 'guarantee' | 'rivalry' }
  | { t: 'influenceNation'; target: NationId; spend?: number }
  | { t: 'fabricateCB'; target: NationId; goal: WarGoalType; state: StateId }
  | { t: 'declareWar'; target: NationId; goal: WarGoalType; state: StateId }
  | { t: 'offerPeace'; war: WarId; goalsToEnforce: number[] }
  | { t: 'colonize'; state: StateId }
  | { t: 'formNation'; key: string }
  | { t: 'resolveEvent'; instanceId: number; choiceId: string }
  | { t: 'takeDecision'; decision: string }
  | { t: 'setResearch'; tech: string | null }
  // --- 0.7.0 Concert of Europe ---
  | { t: 'crisisBackSide'; crisis: number; side: CrisisSide }
  | { t: 'crisisPressDemand'; crisis: number }
  | { t: 'crisisBackDown'; crisis: number }
  // --- 0.8.0 Age of Nationalism ---
  | { t: 'setCulturePolicy'; policy: CulturePolicy }
  | { t: 'setCultureAccepted'; culture: number; accepted: boolean }
  | { t: 'newGame'; seed: number; playerNation: NationId; mapMode?: CampaignMapMode }
  | { t: 'save'; slot: string }
  | { t: 'load'; slot: string }
  | { t: 'listSaves' };

// ---------------------------------------------------------------------------
// Worker <-> UI message protocol
// ---------------------------------------------------------------------------

export type ToWorker =
  | { t: 'init'; seed: number; mapMode?: CampaignMapMode }
  | { t: 'command'; cmd: Command }
  | { t: 'requestProvince'; id: ProvinceId }   // pull detailed province view
  | { t: 'requestNation'; id: NationId };

export type FromWorker =
  | { t: 'ready'; data: GameData }
  | { t: 'snapshot'; snapshot: WorldSnapshot }
  | { t: 'provinceDetail'; detail: ProvinceDetail }
  | { t: 'nationDetail'; detail: NationDetail }
  | { t: 'saveSlots'; slots: SaveSlotInfo[] }
  | { t: 'saveStatus'; action: 'save' | 'load' | 'autosave'; slot: string; ok: boolean; msg: string }
  | { t: 'log'; level: 'info' | 'warn' | 'error'; msg: string };

export interface ProvinceDetail {
  id: ProvinceId;
  name: string;
  owner: NationId;
  controller: NationId;
  terrain: Terrain;
  pops: { type: PopType; size: number; militancy: number; needsMet: number }[];
  rgo: RGO;
  fortLevel: number;
  navalBaseLevel: number;
  /** 0.8.0 culture: cultural makeup of the province (largest first). */
  cultures?: { culture: number; name: string; size: number; share: number; accepted: boolean }[];
}

export interface NationDetail {
  id: NationId;
  government: GovernmentType;
  rulingParty: string;
  rulingIdeology: PartyIdeology;
  upperHouse: { ideology: PartyIdeology; share: number }[];
  infamy: number;
  infamyLimit: number;
  gpRank: number;
  industryScore: number;
  militaryScore: number;
  powerScore: number;
  spheredBy: NationId;
  sphereMembers: NationId[];
  relations: { nation: NationId; kind: DiploRelationKind; opinion: number; expiresDay: GameDay }[];
  cbs: CasusBelli[];
  influencePool: number;
  coalitionAgainst: NationId[];
  election: {
    elective: boolean;
    yearsToNext: number;
    nextYear: number;
    lastResult: string;
  };
  military: {
    regimentsPerSoldierPop: number;
    standingRegimentCapacity: number;
    mobilizationCapacity: number;
    armyOrganization: number;
    armyMorale: number;
  };
  avgMilitancy: number;
  avgConsciousness: number;
  topReformDemands: { reform: string; support: number }[];
  stateUnrest: { stateId: StateId; name: string; risk: number; militancy: number }[];
  reforms: Record<string, number>;
  techs: string[];
  budget: BudgetLine;
  reformsAvailable: {
    reform: string;
    level: number;
    legal: boolean;
    reason: string;
    support: number;
    requiredSupport: number;
    costMoney: number;
    costPrestige: number;
  }[];
  formablesAvailable?: FormableStatus[];
}
