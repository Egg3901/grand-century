/**
 * Diplomacy — the Foreign Office desk.
 *
 * Shape: three bands, in the order a foreign minister actually works in.
 *   1. The chancery strip — what we can afford this month (points, infamy,
 *      rivalries, influence) plus any standing warnings.
 *   2. The roster — a searchable, filterable index of nations. Rows carry NO
 *      buttons: a row is a selection, not a menu. That is what makes 48
 *      nations survive a 390px screen.
 *   3. The dossier — everything about ONE nation, including the war-goal
 *      console. War declaration used to be a global form floating above the
 *      list with its own target dropdown; it is now the bottom half of the
 *      dossier of whichever nation is selected, so the roster IS the target
 *      picker and two of the four selects disappear.
 *
 * On narrow viewports the roster and dossier are two views of the same band
 * (`data-view`), so the phone shows an index or a country, never both.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { WORLD_SEED } from '../../data/generated';
import type {
  DiploRelationKind, NationId, NationSummary, TraceLine, WarGoalType,
} from '../../shared/types';
import { useStore } from '../../store';
import { useSnapshotFields } from '../useSnapshotFields';
import { NationFlag } from '../components/NationFlag';
import { TraceTooltip } from '../components/TraceTooltip';

/**
 * Exactly the snapshot fields this panel reads. Previously it subscribed to
 * the whole snapshot object (see tests/perf.budgets.test.ts); naming the reads
 * is both the perf win and the documentation.
 */
const DIPLO_FIELDS = [
  'day',
  'playerNation',
  'nations',
  'provinces',
  'relations',
  'wars',
  'playerCbs',
  'playerPendingCbs',
  'playerDiplomaticPoints',
  'fabricateCbCostByGoal',
  'warGoalInfamyUse',
  'playerAlliancePreviews',
  'infamyLimit',
  'coalitionAgainstPlayer',
  'rivalryDpCost',
  'rivalryCap',
  'playerRivalryCount',
  'playerInfluencePool',
  'playerInfluenceTargets',
] as const;

/** Mirrors the clamp in sim/systems/diplomacy.ts `updateDiplomaticPointAccrual`. */
const DIPLOMATIC_POINT_CAP = 120;
/** Mirrors `evaluateAllianceAcceptance`: accepted at score >= 70. */
const ALLIANCE_THRESHOLD = 70;
/** `evaluateAllianceAcceptance` returns this when a rivalry or truce hard-blocks. */
const ALLIANCE_BLOCKED_SCORE = -900;
/** Opinion is clamped to +/-200 in the sim; the roster bar is drawn against that. */
const OPINION_RANGE = 200;

interface WarGoalInfo {
  id: WarGoalType;
  label: string;
  needsState: boolean;
  blurb: string;
}

const WAR_GOALS: WarGoalInfo[] = [
  {
    id: 'annex_state',
    label: 'Annex State',
    needsState: true,
    blurb: 'Take the state outright. The costliest pretext we can hold, and fabricating it already stains us.',
  },
  {
    id: 'liberate_state',
    label: 'Liberate State',
    needsState: true,
    blurb: 'Cut the state loose as a nation of its own. Far cheaper in infamy than annexation.',
  },
  {
    id: 'humiliate',
    label: 'Humiliate',
    needsState: false,
    blurb: 'Strip prestige from a rival without taking an acre of land.',
  },
  {
    id: 'add_to_sphere',
    label: 'Add To Sphere',
    needsState: false,
    blurb: 'Force a lesser power under our influence without annexing it.',
  },
  {
    id: 'take_colony',
    label: 'Take Colony',
    needsState: true,
    blurb: 'Seize an overseas holding. Aggressive: the fabrication itself costs infamy.',
  },
  {
    id: 'cut_down_to_size',
    label: 'Cut Down To Size',
    needsState: false,
    blurb: 'Break up a swollen power and cap its ambitions.',
  },
];

const GOAL_BY_ID = new Map(WAR_GOALS.map((goal) => [goal.id, goal]));

/** Period names for the government types. `hms_government` reads as gibberish
 *  once the underscore is stripped, and the rest lose their capitals. */
const GOVERNMENT_LABEL: Record<string, string> = {
  absolute_monarchy: 'Absolute Monarchy',
  constitutional_monarchy: 'Constitutional Monarchy',
  hms_government: "His Majesty's Government",
  democracy: 'Democracy',
  presidential_dictatorship: 'Presidential Dictatorship',
  proletarian_dictatorship: 'Proletarian Dictatorship',
  fascist_dictatorship: 'Fascist Dictatorship',
  uncivilized: 'Unrecognised State',
};

type RosterFilter = 'relevant' | 'gp' | 'near' | 'all';

const FILTERS: { id: RosterFilter; label: string; hint: string }[] = [
  { id: 'relevant', label: 'Relevant', hint: 'Neighbours, great powers, and anyone we have standing business with' },
  { id: 'gp', label: 'Powers', hint: 'The great powers only' },
  { id: 'near', label: 'Near', hint: 'Nations bordering our territory' },
  { id: 'all', label: 'All', hint: 'Every nation on the map' },
];

interface RelationView {
  kind: DiploRelationKind;
  opinion: number;
  expiresDay: number;
}

const NEUTRAL_RELATION: RelationView = { kind: 'neutral', opinion: 0, expiresDay: -1 };

interface Seal {
  label: string;
  tone: 'war' | 'rival' | 'ally' | 'guarantee' | 'truce';
}

function standingSeal(relation: RelationView, atWar: boolean, day: number): Seal | null {
  if (atWar) return { label: 'At war', tone: 'war' };
  const live = relation.expiresDay < 0 || relation.expiresDay > day;
  if (!live) return null;
  if (relation.kind === 'alliance') return { label: 'Allied', tone: 'ally' };
  if (relation.kind === 'rivalry') return { label: 'Rival', tone: 'rival' };
  if (relation.kind === 'guarantee') return { label: 'Guarantee', tone: 'guarantee' };
  if (relation.kind === 'truce') return { label: 'Truce', tone: 'truce' };
  return null;
}

function sphereNote(nation: NationSummary, playerNation: NationId, tagOf: (id: NationId) => string): string | null {
  if (nation.spheredBy === playerNation) return 'In our sphere';
  if (nation.spheredBy >= 0) return `In ${tagOf(nation.spheredBy)}'s sphere`;
  if (nation.sphereMembers.length > 0) return `Spheres ${nation.sphereMembers.length}`;
  return null;
}

/** Sort weight: business first, then power, then warmth. */
function tieWeight(seal: Seal | null): number {
  if (!seal) return 5;
  if (seal.tone === 'war') return 0;
  if (seal.tone === 'rival') return 1;
  if (seal.tone === 'ally') return 2;
  if (seal.tone === 'guarantee') return 3;
  return 4;
}

function daysLabel(days: number): string {
  if (days <= 0) return 'expired';
  if (days < 90) return `${days}d`;
  const years = days / 365;
  if (years >= 1.5) return `${years.toFixed(1)}y`;
  return `${Math.round(days / 30)}mo`;
}

/** Diverging opinion bar: hostile left of centre, friendly right. */
function OpinionBar({ opinion }: { opinion: number }) {
  const ratio = Math.max(-1, Math.min(1, opinion / OPINION_RANGE));
  const width = Math.abs(ratio) * 50;
  const left = ratio >= 0 ? 50 : 50 - width;
  return (
    <span className="diplo-opinion" aria-hidden="true">
      <span
        className={`diplo-opinion__fill ${ratio >= 0 ? 'is-warm' : 'is-cold'}`}
        style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
      />
    </span>
  );
}

function ChanceryMeter({
  label, display, ratio, trace, tone,
}: {
  label: string;
  display: string;
  ratio: number;
  trace: TraceLine[];
  tone?: 'danger' | 'positive';
}) {
  return (
    <div className={`diplo-meter${tone ? ` is-${tone}` : ''}`}>
      <span className="diplo-meter__label">{label}</span>
      <span className="diplo-meter__value">
        <TraceTooltip value={display} trace={trace} />
      </span>
      <span className="diplo-meter__track" aria-hidden="true">
        <span className="diplo-meter__fill" style={{ width: `${Math.max(1, Math.min(100, ratio * 100))}%` }} />
      </span>
    </div>
  );
}

export function DiplomacyPanel() {
  const snapshot = useSnapshotFields(DIPLO_FIELDS);
  const sendCommand = useStore((state) => state.sendCommand);
  const openPanelId = useStore((state) => state.openPanelId);
  const diploFocusNation = useStore((state) => state.diploFocusNation);
  const clearDiploFocus = useStore((state) => state.clearDiploFocus);

  const [filter, setFilter] = useState<RosterFilter>('relevant');
  const [query, setQuery] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<NationId | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<WarGoalType>('humiliate');
  const [selectedState, setSelectedState] = useState<number>(-1);
  /** Narrow viewports show the roster OR the dossier, never both. */
  const [view, setView] = useState<'roster' | 'dossier'>('roster');

  useEffect(() => {
    if (diploFocusNation === null) return;
    setSelectedTarget(diploFocusNation);
    setFilter('all'); // the tapped nation may be neither a neighbour nor a power
    setQuery('');
    setView('dossier');
    clearDiploFocus();
  }, [diploFocusNation, clearDiploFocus]);

  const provinceSeedById = useMemo(() => (
    new Map<number, number[]>(WORLD_SEED.provinces.map((province) => [province.id, province.neighbors]))
  ), []);
  const stateNameById = useMemo(() => (
    new Map<number, string>(WORLD_SEED.states.map((state) => [state.id, state.name]))
  ), []);

  const nations = snapshot?.nations;
  const provinces = snapshot?.provinces;
  const playerNation = snapshot?.playerNation ?? -1;

  const nationById = useMemo(
    () => new Map((nations ?? []).map((nation) => [nation.id, nation])),
    [nations],
  );

  /**
   * Province ownership changes at most a handful of times a century, but the
   * `provinces` array gets a fresh identity whenever any pop or output number
   * moves — i.e. every tick. Hashing owners is one allocation-free pass over
   * ~620 entries; the adjacency + state-index build behind it is far heavier,
   * so we key that on the hash and pay it only when the map actually changes.
   * A hash collision would leave the neighbour set one ownership change stale,
   * which is a cosmetic filter, not a rule.
   */
  const ownerFingerprint = useMemo(() => {
    if (!provinces) return 0;
    let hash = provinces.length;
    for (const province of provinces) hash = (Math.imul(hash, 31) + province.owner) | 0;
    return hash;
  }, [provinces]);

  const provincesRef = useRef(provinces);
  provincesRef.current = provinces;

  const geography = useMemo(() => {
    const list = provincesRef.current ?? [];
    const ownerByProvince = new Map<number, NationId>();
    const statesByNation = new Map<NationId, number[]>();
    for (const province of list) {
      ownerByProvince.set(province.id, province.owner);
      const owned = statesByNation.get(province.owner);
      if (owned) {
        if (!owned.includes(province.stateId)) owned.push(province.stateId);
      } else {
        statesByNation.set(province.owner, [province.stateId]);
      }
    }
    for (const states of statesByNation.values()) states.sort((a, b) => a - b);

    const neighbours = new Set<NationId>();
    for (const province of list) {
      if (province.owner !== playerNation) continue;
      for (const neighborId of provinceSeedById.get(province.id) ?? []) {
        const owner = ownerByProvince.get(neighborId);
        if (owner === undefined || owner === playerNation) continue;
        neighbours.add(owner);
      }
    }
    return { neighbours, statesByNation };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on ownerFingerprint by design (see comment above)
  }, [ownerFingerprint, playerNation, provinceSeedById]);

  const relationByNation = useMemo(() => {
    const map = new Map<NationId, RelationView>();
    for (const relation of snapshot?.relations ?? []) {
      if (relation.a === playerNation) {
        map.set(relation.b, { kind: relation.kind, opinion: relation.opinion, expiresDay: relation.expiresDay });
      } else if (relation.b === playerNation) {
        map.set(relation.a, { kind: relation.kind, opinion: relation.opinion, expiresDay: relation.expiresDay });
      }
    }
    return map;
  }, [snapshot?.relations, playerNation]);

  const warWith = useMemo(() => {
    const set = new Set<NationId>();
    for (const war of snapshot?.wars ?? []) {
      if (war.attackers.includes(playerNation)) for (const id of war.defenders) set.add(id);
      else if (war.defenders.includes(playerNation)) for (const id of war.attackers) set.add(id);
    }
    return set;
  }, [snapshot?.wars, playerNation]);

  const allianceScoreByNation = useMemo(() => (
    new Map((snapshot?.playerAlliancePreviews ?? []).map((entry) => [entry.target, entry]))
  ), [snapshot?.playerAlliancePreviews]);

  const influenceByNation = useMemo(() => (
    new Map((snapshot?.playerInfluenceTargets ?? []).map((entry) => [entry.target, entry]))
  ), [snapshot?.playerInfluenceTargets]);

  const day = snapshot?.day ?? 0;

  const allRows = useMemo(() => {
    if (!nations) return [];
    return nations
      .filter((nation) => nation.id !== playerNation)
      .map((nation) => {
        const relation = relationByNation.get(nation.id) ?? NEUTRAL_RELATION;
        const atWar = warWith.has(nation.id);
        const seal = standingSeal(relation, atWar, day);
        return {
          nation,
          relation,
          atWar,
          seal,
          isNeighbour: geography.neighbours.has(nation.id),
          weight: tieWeight(seal),
        };
      })
      .sort((a, b) => (
        a.weight - b.weight
        || (a.nation.gpRank > 0 ? a.nation.gpRank : 99) - (b.nation.gpRank > 0 ? b.nation.gpRank : 99)
        || b.relation.opinion - a.relation.opinion
        || a.nation.name.localeCompare(b.nation.name)
      ));
  }, [nations, playerNation, relationByNation, warWith, geography, day]);

  const counts = useMemo(() => {
    let relevant = 0;
    let gp = 0;
    let near = 0;
    for (const row of allRows) {
      if (row.nation.gpRank > 0) gp++;
      if (row.isNeighbour) near++;
      if (row.nation.gpRank > 0 || row.isNeighbour || row.seal) relevant++;
    }
    return { relevant, gp, near, all: allRows.length };
  }, [allRows]);

  const trimmedQuery = query.trim().toLowerCase();

  const rows = useMemo(() => {
    // A search reaches the whole map: on a phone, typing three letters beats
    // scrolling past forty nations to find the one you meant.
    if (trimmedQuery) {
      return allRows.filter((row) => (
        row.nation.name.toLowerCase().includes(trimmedQuery)
        || row.nation.tag.toLowerCase().includes(trimmedQuery)
      ));
    }
    if (filter === 'gp') return allRows.filter((row) => row.nation.gpRank > 0);
    if (filter === 'near') return allRows.filter((row) => row.isNeighbour);
    if (filter === 'relevant') {
      return allRows.filter((row) => row.nation.gpRank > 0 || row.isNeighbour || row.seal !== null);
    }
    return allRows;
  }, [allRows, filter, trimmedQuery]);

  if (!snapshot || !nations) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Diplomacy</h2>
        <p className="panel-subtle">Summoning envoys...</p>
      </section>
    );
  }

  const tagOf = (id: NationId) => nationById.get(id)?.tag ?? String(id);
  const player = nationById.get(playerNation);
  const playerInfamy = player?.infamy ?? 0;
  const infamyLimit = snapshot.infamyLimit;
  const points = snapshot.playerDiplomaticPoints ?? 0;
  const rivalryCost = snapshot.rivalryDpCost ?? 12;
  const rivalryCap = snapshot.rivalryCap ?? 4;
  const rivalryCount = snapshot.playerRivalryCount ?? 0;
  const playerIsGp = Boolean(player?.gpRank && player.gpRank > 0);

  const targetId = selectedTarget !== null && nationById.has(selectedTarget)
    ? selectedTarget
    : rows[0]?.nation.id ?? allRows[0]?.nation.id ?? null;
  const targetRow = targetId === null ? null : allRows.find((row) => row.nation.id === targetId) ?? null;
  const target = targetRow?.nation ?? null;
  const targetRelation = targetRow?.relation ?? NEUTRAL_RELATION;
  const targetAtWar = targetRow?.atWar ?? false;

  const goalInfo = GOAL_BY_ID.get(selectedGoal) ?? WAR_GOALS[0];
  const targetStateIds = targetId === null ? [] : geography.statesByNation.get(targetId) ?? [];
  const effectiveState = !goalInfo.needsState
    ? -1
    : (selectedState >= 0 && targetStateIds.includes(selectedState) ? selectedState : targetStateIds[0] ?? -1);
  const stateRequiredMissing = goalInfo.needsState && effectiveState < 0;

  const heldCbs = (snapshot.playerCbs ?? []).filter((cb) => cb.target === targetId);
  const pendingCbs = snapshot.playerPendingCbs ?? [];
  const pendingForTarget = pendingCbs.filter((cb) => cb.target === targetId);
  const matchingCb = heldCbs.find((cb) => (
    cb.goal === selectedGoal && (cb.stateId === -1 || cb.stateId === effectiveState)
  ));
  const fabricateCost = snapshot.fabricateCbCostByGoal?.[selectedGoal] ?? 0;
  const goalInfamyUse = snapshot.warGoalInfamyUse?.[selectedGoal] ?? 0;
  const projectedInfamy = matchingCb ? matchingCb.infamyCost : goalInfamyUse * 1.75;

  const truceLive = targetRelation.kind === 'truce'
    && (targetRelation.expiresDay < 0 || targetRelation.expiresDay > day);
  const alliancePreview = targetId === null ? null : allianceScoreByNation.get(targetId) ?? null;
  const allianceBlocked = alliancePreview !== null && alliancePreview.score <= ALLIANCE_BLOCKED_SCORE;
  const influence = targetId === null ? null : influenceByNation.get(targetId) ?? null;

  const alreadyAllied = targetRelation.kind === 'alliance';
  const alreadyGuaranteed = targetRelation.kind === 'guarantee';
  const alreadyRival = targetRelation.kind === 'rivalry';
  const canCancelKind: 'alliance' | 'guarantee' | 'rivalry' | null =
    alreadyAllied ? 'alliance' : alreadyGuaranteed ? 'guarantee' : alreadyRival ? 'rivalry' : null;

  const allianceReason = alreadyAllied
    ? 'Already allied.'
    : targetAtWar
      ? 'We are at war with them.'
      : allianceBlocked
        ? (alreadyRival ? 'A rivalry stands between us.' : 'A truce stands between us.')
        : alliancePreview
          ? `${alliancePreview.accepted ? 'Would accept' : 'Would refuse'}: score ${alliancePreview.score.toFixed(0)} of ${ALLIANCE_THRESHOLD}.`
          : 'No reading from our embassy.';

  const rivalReason = alreadyRival
    ? 'Already our rival.'
    : rivalryCount >= rivalryCap
      ? `Rivalry cap reached (${rivalryCount} of ${rivalryCap}). End one first.`
      : points < rivalryCost
        ? `Need ${rivalryCost} points, we hold ${points.toFixed(0)}.`
        : `Costs ${rivalryCost} points. ${rivalryCount} of ${rivalryCap} used.`;

  const declareBlockedReason = targetAtWar
    ? 'Already at war.'
    : truceLive
      ? `A truce holds until day ${targetRelation.expiresDay}.`
      : stateRequiredMissing
        ? 'This goal needs a state and they hold none we can name.'
        : null;

  const selectNation = (id: NationId) => {
    setSelectedTarget(id);
    setSelectedState(-1);
    setView('dossier');
  };

  return (
    <section className="panel-card atlas-panel diplo-panel">
      <h2 className="atlas-heading">Diplomacy</h2>

      <div className="diplo-chancery">
        <ChanceryMeter
          label="Points"
          display={points.toFixed(0)}
          ratio={points / DIPLOMATIC_POINT_CAP}
          trace={[
            { label: 'Diplomatic points held', value: points },
            { label: 'Cap', value: DIPLOMATIC_POINT_CAP },
            { label: `Fabricate ${goalInfo.label}`, value: fabricateCost },
            { label: 'Declare a rivalry', value: rivalryCost },
          ]}
        />
        <ChanceryMeter
          label="Infamy"
          display={playerInfamy.toFixed(1)}
          ratio={playerInfamy / Math.max(1, infamyLimit)}
          tone={playerInfamy >= infamyLimit ? 'danger' : undefined}
          trace={[
            { label: 'Current infamy', value: playerInfamy },
            { label: 'Containment limit', value: infamyLimit },
            { label: 'Next declaration adds', value: projectedInfamy },
          ]}
        />
        <ChanceryMeter
          label="Rivals"
          display={`${rivalryCount}/${rivalryCap}`}
          ratio={rivalryCount / Math.max(1, rivalryCap)}
          trace={[
            { label: 'Rivalries held', value: rivalryCount },
            { label: 'Concurrent cap', value: rivalryCap },
            { label: 'Cost of the next one', value: rivalryCost },
          ]}
        />
        {playerIsGp ? (
          <ChanceryMeter
            label="Influence"
            display={(snapshot.playerInfluencePool ?? 0).toFixed(0)}
            ratio={(snapshot.playerInfluencePool ?? 0) / 20}
            trace={[
              { label: 'Influence pool', value: snapshot.playerInfluencePool ?? 0 },
              { label: 'Nations we are courting', value: (snapshot.playerInfluenceTargets ?? []).length },
              { label: 'Points to sphere a nation', value: 100 },
            ]}
          />
        ) : null}
      </div>

      {playerInfamy >= infamyLimit ? (
        <p className="diplo-dispatch is-danger">
          Our infamy has passed the containment limit. The powers may form a coalition against us.
        </p>
      ) : null}
      {snapshot.coalitionAgainstPlayer.length > 0 ? (
        <p className="diplo-dispatch is-danger">
          Coalition forming: {snapshot.coalitionAgainstPlayer.map((id) => tagOf(id)).join(', ')}
        </p>
      ) : null}
      {pendingCbs.length > 0 ? (
        <ul className="diplo-dispatch-list">
          {pendingCbs.map((cb) => (
            <li key={`${cb.target}-${cb.goal}-${cb.stateId}-${cb.readyDay}`}>
              <button
                type="button"
                className="diplo-dispatch-link"
                onClick={() => selectNation(cb.target)}
              >
                Fabricating {GOAL_BY_ID.get(cb.goal)?.label ?? cb.goal} vs {tagOf(cb.target)}
              </button>
              <span>ready in {daysLabel(Math.max(0, cb.readyDay - day))}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="diplo-band" data-view={view}>
        <div className="diplo-roster">
          <div className="diplo-roster__tools">
            <div className="gc-segmented" role="group" aria-label="Roster filter">
              {FILTERS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`gc-segment${filter === entry.id && !trimmedQuery ? ' is-active' : ''}`}
                  title={entry.hint}
                  onClick={() => {
                    setFilter(entry.id);
                    setQuery('');
                  }}
                >
                  {entry.label}
                  <span className="gc-segment__count">{counts[entry.id]}</span>
                </button>
              ))}
            </div>
            <input
              className="gc-input diplo-search"
              type="search"
              value={query}
              placeholder="Search all nations"
              aria-label="Search all nations"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {rows.length === 0 ? (
            <p className="panel-subtle diplo-empty">
              {trimmedQuery
                ? `No nation matches "${query.trim()}".`
                : 'Nothing under this filter. Try All.'}
            </p>
          ) : (
            <ul className="panel-list diplo-list">
              {rows.map((row) => {
                const sphere = sphereNote(row.nation, playerNation, tagOf);
                const expiresIn = row.relation.expiresDay >= 0 ? row.relation.expiresDay - day : -1;
                return (
                  <li key={row.nation.id}>
                    <button
                      type="button"
                      className={`diplo-row${row.nation.id === targetId ? ' is-selected' : ''}`}
                      aria-pressed={row.nation.id === targetId}
                      onClick={() => selectNation(row.nation.id)}
                    >
                      <span className="diplo-row__nation">
                        <NationFlag tag={row.nation.tag} color={row.nation.color} size={18} />
                        <span className="diplo-row__names">
                          <strong>{row.nation.name}</strong>
                          <span className="diplo-row__meta">
                            {row.nation.gpRank > 0 ? <span className="diplo-rank">GP {row.nation.gpRank}</span> : null}
                            {row.isNeighbour ? <span>Border</span> : null}
                            {sphere ? <span>{sphere}</span> : null}
                            {row.seal && expiresIn > 0 ? <span>{daysLabel(expiresIn)} left</span> : null}
                          </span>
                        </span>
                      </span>
                      <span className="diplo-row__standing">
                        {row.seal ? <span className={`gc-seal is-${row.seal.tone}`}>{row.seal.label}</span> : null}
                        <span className="diplo-row__opinion">
                          <OpinionBar opinion={row.relation.opinion} />
                          <em>{row.relation.opinion > 0 ? '+' : ''}{row.relation.opinion.toFixed(0)}</em>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="diplo-dossier">
          <button
            type="button"
            className="btn btn--ghost diplo-back"
            onClick={() => setView('roster')}
          >
            &lsaquo; All nations
          </button>

          {target === null ? (
            <p className="panel-subtle">Select a nation to open its dossier.</p>
          ) : (
            <>
              <header className="diplo-dossier__head">
                <NationFlag tag={target.tag} color={target.color} size={26} />
                <div className="diplo-dossier__title">
                  <strong>{target.name}</strong>
                  <span>
                    {target.gpRank > 0 ? `Great Power ${target.gpRank}` : 'Lesser power'}
                    {' · '}
                    {GOVERNMENT_LABEL[target.government] ?? target.government.replaceAll('_', ' ')}
                  </span>
                </div>
                {targetRow?.seal ? <span className={`gc-seal is-${targetRow.seal.tone}`}>{targetRow.seal.label}</span> : null}
              </header>

              <dl className="ledger-grid">
                <div>
                  <dt>Opinion of us</dt>
                  <dd className={targetRelation.opinion >= 0 ? 'status-positive' : 'status-danger'}>
                    <TraceTooltip
                      value={`${targetRelation.opinion > 0 ? '+' : ''}${targetRelation.opinion.toFixed(0)}`}
                      trace={[
                        { label: 'Opinion of us', value: targetRelation.opinion },
                        { label: 'Alliance score (sim)', value: alliancePreview?.score ?? 0 },
                        { label: 'Alliance threshold', value: ALLIANCE_THRESHOLD },
                      ]}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Standing</dt>
                  <dd>
                    {targetRow?.seal?.label ?? 'Neutral'}
                    {targetRelation.expiresDay >= 0 && targetRelation.expiresDay > day
                      ? ` (${daysLabel(targetRelation.expiresDay - day)})`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt>Power score</dt>
                  <dd>
                    <TraceTooltip
                      value={target.powerScore.toFixed(0)}
                      trace={[
                        { label: 'Their power score', value: target.powerScore },
                        { label: 'Their industry', value: target.industryScore },
                        { label: 'Their military', value: target.militaryScore },
                        { label: 'Our power score', value: player?.powerScore ?? 0 },
                      ]}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Sphere</dt>
                  <dd>{sphereNote(target, playerNation, tagOf) ?? 'Unaligned'}</dd>
                </div>
                {influence ? (
                  <>
                    <div>
                      <dt>Our influence</dt>
                      <dd>
                        <TraceTooltip
                          value={influence.points.toFixed(0)}
                          trace={[
                            { label: 'Our influence points', value: influence.points },
                            { label: 'Points needed to sphere them', value: 100 },
                            { label: 'Strongest rival pressure', value: influence.rivalPressure },
                          ]}
                        />
                        <span className="ledger-suffix">/ 100</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Rival pressure</dt>
                      <dd className={influence.rivalPressure >= 25 ? 'status-danger' : undefined}>
                        {influence.rivalPressure.toFixed(0)}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>

              <div className="diplo-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={alreadyAllied || targetAtWar || allianceBlocked}
                  onClick={() => sendCommand({ t: 'proposeAlliance', target: target.id })}
                >
                  Propose Alliance
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={alreadyGuaranteed || targetAtWar}
                  onClick={() => sendCommand({ t: 'offerGuarantee', target: target.id })}
                >
                  Guarantee
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={alreadyRival || rivalryCount >= rivalryCap || points < rivalryCost}
                  onClick={() => sendCommand({ t: 'addRival', target: target.id })}
                >
                  Declare Rivalry ({rivalryCost} pts)
                </button>
                {playerIsGp && target.gpRank === 0 ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={(snapshot.playerInfluencePool ?? 0) < 1}
                    onClick={() => sendCommand({ t: 'influenceNation', target: target.id, spend: 1 })}
                  >
                    Send Influence
                  </button>
                ) : null}
                {canCancelKind ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => sendCommand({ t: 'cancelRelation', target: target.id, kind: canCancelKind })}
                  >
                    {canCancelKind === 'alliance' ? 'Break Alliance' : canCancelKind === 'guarantee' ? 'Withdraw Guarantee' : 'End Rivalry'}
                  </button>
                ) : null}
                {target.gpRank > 0 ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => openPanelId('great_powers')}
                    title="Open the Great Powers ledger"
                  >
                    Concert &rsaquo;
                  </button>
                ) : null}
              </div>

              <p className={`diplo-reason ${alliancePreview?.accepted && !alreadyAllied && !allianceBlocked ? 'status-positive' : ''}`}>
                Alliance: {allianceReason}
              </p>
              <p className="diplo-reason">Rivalry: {rivalReason}</p>

              <h3 className="atlas-heading panel-small-heading">Pretext and War</h3>

              {heldCbs.length > 0 ? (
                <ul className="panel-list diplo-cb-list">
                  {heldCbs.map((cb) => (
                    <li key={`${cb.goal}-${cb.stateId}-${cb.expiresDay}`}>
                      <strong>{GOAL_BY_ID.get(cb.goal)?.label ?? cb.goal}</strong>
                      <span>
                        {cb.stateId >= 0 ? `${stateNameById.get(cb.stateId) ?? `State ${cb.stateId}`} · ` : ''}
                        {cb.origin === 'core_claim' ? 'irredentist claim'
                          : cb.origin === 'unification' ? 'unification claim'
                          : `holds ${daysLabel(cb.expiresDay - day)}`}
                        {` · +${cb.infamyCost.toFixed(1)} infamy`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="panel-subtle">We hold no pretext against {target.name}.</p>
              )}

              {pendingForTarget.length > 0 ? (
                <ul className="panel-list diplo-cb-list">
                  {pendingForTarget.map((cb) => (
                    <li key={`p-${cb.goal}-${cb.stateId}-${cb.readyDay}`}>
                      <strong>Fabricating {GOAL_BY_ID.get(cb.goal)?.label ?? cb.goal}</strong>
                      <span>
                        {cb.stateId >= 0 ? `${stateNameById.get(cb.stateId) ?? `State ${cb.stateId}`} · ` : ''}
                        ready in {daysLabel(Math.max(0, cb.readyDay - day))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="diplo-controls">
                <label>
                  War Goal
                  <select
                    className="gc-select"
                    value={selectedGoal}
                    onChange={(event) => setSelectedGoal(event.target.value as WarGoalType)}
                  >
                    {WAR_GOALS.map((goal) => <option key={goal.id} value={goal.id}>{goal.label}</option>)}
                  </select>
                </label>
                <label>
                  State
                  <select
                    className="gc-select"
                    value={effectiveState}
                    onChange={(event) => setSelectedState(Number(event.target.value))}
                    disabled={!goalInfo.needsState}
                  >
                    {!goalInfo.needsState ? <option value={-1}>Not required</option> : null}
                    {goalInfo.needsState ? targetStateIds.map((stateId) => (
                      <option key={stateId} value={stateId}>
                        {stateNameById.get(stateId) ?? `State ${stateId}`}
                      </option>
                    )) : null}
                  </select>
                </label>
              </div>

              <p className="diplo-goal-blurb">{goalInfo.blurb}</p>

              {matchingCb?.origin === 'core_claim' ? (
                <p className="diplo-reason status-positive">
                  Irredentist claim: this state is one of our historic cores, held by a foreign power.
                  No fabrication is needed and the infamy is discounted.
                </p>
              ) : null}
              {matchingCb?.origin === 'unification' ? (
                <p className="diplo-reason status-positive">
                  Unification claim: this state belongs to a nation we could proclaim.
                  No fabrication is needed and the infamy is discounted.
                </p>
              ) : null}

              <p className="diplo-reason">
                {matchingCb
                  ? `Pretext ready. Declaring costs +${matchingCb.infamyCost.toFixed(1)} infamy.`
                  : `No pretext for this goal. Declaring anyway costs +${projectedInfamy.toFixed(1)} infamy (fabricated it would be +${goalInfamyUse.toFixed(1)}).`}
              </p>

              <div className="diplo-action-row">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={stateRequiredMissing || points < fabricateCost}
                  title={points < fabricateCost ? `Need ${fabricateCost.toFixed(1)} diplomatic points` : undefined}
                  onClick={() => sendCommand({ t: 'fabricateCB', target: target.id, goal: selectedGoal, state: effectiveState })}
                >
                  Fabricate ({fabricateCost.toFixed(0)} pts)
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  data-testid="diplo-declare-war"
                  disabled={declareBlockedReason !== null}
                  onClick={() => sendCommand({ t: 'declareWar', target: target.id, goal: selectedGoal, state: effectiveState })}
                >
                  Declare War
                </button>
              </div>
              {declareBlockedReason ? (
                <p className="diplo-reason status-danger">{declareBlockedReason}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
