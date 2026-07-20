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

export interface CultureDef { key: string; name: string; color: [number, number, number]; }
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
}

export interface FormableDefinition {
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
  | { t: 'boostRgo'; goodKey?: string; levels: number };

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
  | { t: 'hasFormableCandidate' };

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
  key: 'candidate' | 'independent' | 'power' | 'core_control';
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
}

export interface RGO {
  recipe: string;        // Recipe.key with building 'rgo'
  level: number;         // capacity
  employed: number;
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

export interface World {
  day: GameDay;
  seed: number;
  rngState: number;
  speed: number;         // 0 = paused, 1..5
  playerNation: NationId;

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
  nextEventInstanceId: number;

  nextArmyId: ArmyId;
  nextFleetId: FleetId;
  nextWarId: WarId;
  nextRebellionId: number;
  nextPopId: PopId;
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
  isBankrupt: boolean;
  constructionBlocked: boolean;
  mobilizationCapacity: number;
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
}

export interface PlayerStateSummary {
  id: StateId;
  name: string;
  factoryCount: number;
}

/** Sent every rendered frame; province array feeds the map paint. */
export interface WorldSnapshot {
  day: GameDay;
  date: GameDate;
  speed: number;
  playerNation: NationId;
  /** Campaign start seed (for shareable permalinks). */
  seed?: number;
  nations: NationSummary[];
  provinces: ProvinceSummary[];
  market: MarketGood[];
  wars: War[];
  relations: DiploRelation[];
  greatPowers: GreatPowerStanding[];
  playerCbs: CasusBelli[];
  playerInfluencePool: number;
  playerInfluenceTargets: InfluenceTarget[];
  infamyLimit: number;
  coalitionAgainstPlayer: NationId[];
  armies: Army[];
  fleets: Fleet[];
  rebellions: Rebellion[];
  playerProduction: ProductionLedgerEntry[];
  playerPopulation: PopulationLedgerEntry[];
  playerReformAgitation: { reform: string; support: number }[];
  playerStates: PlayerStateSummary[];
  playerCoreStateIds?: StateId[];
  playerFormables?: FormableStatus[];
  /** Pending events for the player nation (popup queue). */
  pendingPlayerEvents?: PendingEvent[];
  /** Player-initiated decisions with prereq gating. */
  playerDecisions?: DecisionStatus[];
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
  | { t: 'newGame'; seed: number; playerNation: NationId }
  | { t: 'save'; slot: string }
  | { t: 'load'; slot: string }
  | { t: 'listSaves' };

// ---------------------------------------------------------------------------
// Worker <-> UI message protocol
// ---------------------------------------------------------------------------

export type ToWorker =
  | { t: 'init'; seed: number }
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
