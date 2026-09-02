import { useEffect, useMemo, useState } from 'react';
import type { Army, Fleet, Ship } from '../../shared/types';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { TraceTooltip } from '../components/TraceTooltip';
import { warSidesLabel } from '../warNaming';
import { useScenarioWorldSeed } from '../useScenarioWorldSeed';
import { PeaceConference } from './PeaceConference';
import { REGIMENT_TYPES, SHIP_TYPES, regimentSpec, shipSpec } from '../../sim/militaryCatalog';

function avgRegimentStrength(army: Army): number {
  if (army.regiments.length === 0) return 0;
  return army.regiments.reduce((sum, regiment) => sum + regiment.strength, 0) / army.regiments.length;
}

function avgRegimentOrg(army: Army): number {
  if (army.regiments.length === 0) return 0;
  return army.regiments.reduce((sum, regiment) => sum + regiment.organization, 0) / army.regiments.length;
}

function shipSummary(fleet: Fleet): string {
  const counts = Object.fromEntries(SHIP_TYPES.map((type) => [type, 0])) as Record<Ship['type'], number>;
  for (const ship of fleet.ships) counts[ship.type] += 1;
  return SHIP_TYPES
    .filter((type) => counts[type] > 0)
    .map((type) => `${shipSpec(type).shortLabel} ${counts[type]}`)
    .join(' | ');
}

function regimentCountByType(armies: Army[]): Record<Army['regiments'][number]['type'], number> {
  const counts = Object.fromEntries(REGIMENT_TYPES.map((type) => [type, 0])) as Record<Army['regiments'][number]['type'], number>;
  for (const army of armies) {
    for (const regiment of army.regiments) counts[regiment.type] += 1;
  }
  return counts;
}

function formatRegimentCount(counts: Record<Army['regiments'][number]['type'], number>): string {
  return REGIMENT_TYPES
    .filter((type) => counts[type] > 0)
    .map((type) => `${regimentSpec(type).shortLabel} ${counts[type]}`)
    .join(' | ');
}

export function MilitaryPanel() {
  const worldSeed = useScenarioWorldSeed();
  const snapshot = useStore(useShallow((state) => state.snapshot));
  const selectedProvince = useStore((state) => state.selectedProvince);
  const selectedArmy = useStore((state) => state.selectedArmy);
  const selectedFleet = useStore((state) => state.selectedFleet);
  const setSelectedArmy = useStore((state) => state.setSelectedArmy);
  const setSelectedFleet = useStore((state) => state.setSelectedFleet);
  const sendCommand = useStore((state) => state.sendCommand);
  const provinceNameById = useMemo(() => (
    new Map<number, string>(worldSeed.provinces.map((province) => [province.id, province.name]))
  ), [worldSeed]);
  const stateNameById = useMemo(() => (
    new Map<number, string>(worldSeed.states.map((state) => [state.id, state.name]))
  ), [worldSeed]);

  const [recruitProvince, setRecruitProvince] = useState<number>(-1);
  const [fleetProvince, setFleetProvince] = useState<number>(-1);
  const [fleetType, setFleetType] = useState<Ship['type']>('transport');
  const [fleetCount, setFleetCount] = useState(1);
  const [selectedWar, setSelectedWar] = useState<number>(-1);
  const [recruitPlan, setRecruitPlan] = useState<Record<Army['regiments'][number]['type'], number>>(() => ({
    ...Object.fromEntries(REGIMENT_TYPES.map((type) => [type, 0])),
    infantry: 4,
  }) as Record<Army['regiments'][number]['type'], number>);

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const player = snapshot.playerNation;
    const allArmies = snapshot.armies.filter((army) => !army.rebel).sort((a, b) => a.id - b.id);
    const allFleets = snapshot.fleets.slice().sort((a, b) => a.id - b.id);
    const armies = allArmies.filter((army) => army.owner === player);
    const fleets = allFleets.filter((fleet) => fleet.owner === player);
    const ownedProvinces = snapshot.provinces
      .filter((province) => province.owner === player)
      .map((province) => province.id)
      .sort((a, b) => a - b);
    const coastalProvinces = ownedProvinces.filter((provinceId) => worldSeed.provinces[provinceId]?.coastal);
    const wars = snapshot.wars
      .filter((war) => war.attackers.includes(player) || war.defenders.includes(player))
      .sort((a, b) => a.id - b.id);
    const playerSummary = snapshot.nations.find((nation) => nation.id === player) ?? null;
    return { armies, fleets, allArmies, allFleets, ownedProvinces, coastalProvinces, wars, playerSummary };
  }, [snapshot, worldSeed]);

  useEffect(() => {
    if (!derived) return;
    if (recruitProvince < 0 || !derived.ownedProvinces.includes(recruitProvince)) {
      setRecruitProvince(derived.ownedProvinces[0] ?? -1);
    }
    if (fleetProvince < 0 || !derived.coastalProvinces.includes(fleetProvince)) {
      setFleetProvince(derived.coastalProvinces[0] ?? -1);
    }
    if (selectedWar < 0 || !derived.wars.some((war) => war.id === selectedWar)) {
      setSelectedWar(derived.wars[0]?.id ?? -1);
    }
  }, [derived, fleetProvince, recruitProvince, selectedWar]);

  if (!snapshot || !derived) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Military</h2>
        <p>Drafting field reports...</p>
      </section>
    );
  }

  const selectedWarObj = derived.wars.find((war) => war.id === selectedWar) ?? null;
  const isPlayerAttacker = selectedWarObj ? selectedWarObj.attackers.includes(snapshot.playerNation) : false;
  const scorePerspective = selectedWarObj ? (isPlayerAttacker ? selectedWarObj.score : -selectedWarObj.score) : 0;
  const selectedArmyObj = selectedArmy !== null ? derived.allArmies.find((army) => army.id === selectedArmy) ?? null : null;
  const selectedArmyStack = selectedArmyObj
    ? derived.allArmies.filter((army) => army.owner === selectedArmyObj.owner && army.location === selectedArmyObj.location)
    : [];
  const selectedFleetObj = selectedFleet !== null ? derived.allFleets.find((fleet) => fleet.id === selectedFleet) ?? null : null;
  const selectedFleetStack = selectedFleetObj
    ? derived.allFleets.filter((fleet) => fleet.owner === selectedFleetObj.owner && fleet.location === selectedFleetObj.location)
    : [];
  const selectedArmyComposition = regimentCountByType(selectedArmyStack);
  const totalFieldRegiments = derived.armies.reduce((sum, army) => sum + army.regiments.length, 0);
  const reserveCapacity = derived.playerSummary?.mobilizationCapacity ?? 0;
  const standingCap = derived.playerSummary?.standingRegimentCapacity ?? 0;
  const availableRegiments = new Set(derived.playerSummary?.availableRegimentTypes ?? ['infantry']);
  const availableShips = new Set(derived.playerSummary?.availableShipTypes ?? ['transport', 'frigate', 'manofwar']);
  const planContainsLockedType = REGIMENT_TYPES.some((type) => recruitPlan[type] > 0 && !availableRegiments.has(type));
  const mobilizeRaise = Math.max(0, reserveCapacity - Math.max(0, totalFieldRegiments - standingCap));
  const mobilizeCost = mobilizeRaise * 14;
  const warCombat = selectedWarObj ? (() => {
    const attackerArmies = snapshot.armies.filter((army) => selectedWarObj.attackers.includes(army.owner));
    const defenderArmies = snapshot.armies.filter((army) => selectedWarObj.defenders.includes(army.owner));
    const attackerRegiments = attackerArmies.reduce((sum, army) => sum + army.regiments.length, 0);
    const defenderRegiments = defenderArmies.reduce((sum, army) => sum + army.regiments.length, 0);
    const attackerOrg = attackerRegiments > 0
      ? attackerArmies.reduce((sum, army) => sum + army.regiments.reduce((inner, regiment) => inner + regiment.organization, 0), 0) / attackerRegiments
      : 0;
    const defenderOrg = defenderRegiments > 0
      ? defenderArmies.reduce((sum, army) => sum + army.regiments.reduce((inner, regiment) => inner + regiment.organization, 0), 0) / defenderRegiments
      : 0;
    const attackerPower = attackerRegiments * (0.8 + attackerOrg / 100);
    const defenderPower = defenderRegiments * (0.8 + defenderOrg / 100);
    const odds = attackerPower + defenderPower > 0 ? attackerPower / (attackerPower + defenderPower) : 0.5;
    const playerOdds = isPlayerAttacker ? odds : 1 - odds;
    return {
      playerOdds,
      attackerRegiments,
      defenderRegiments,
      attackerOrg,
      defenderOrg,
    };
  })() : null;

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Military Command</h2>
      <p className="panel-subtle">
        {selectedArmy !== null ? `Army ${selectedArmy} selected. Click a province to issue movement orders.` : ''}
        {selectedFleet !== null ? ` Fleet ${selectedFleet} selected. Click a coastal province to issue movement orders.` : ''}
        {selectedArmy === null && selectedFleet === null ? 'Select an army or fleet below, then click a province on the map to move.' : ''}
      </p>

      <h3 className="atlas-heading panel-small-heading">Recruitment & Mobilization</h3>
      <div className="mil-grid">
        <label>
          Raise Army In
          <select className="gc-select" value={recruitProvince} onChange={(event) => setRecruitProvince(Number(event.target.value))}>
            {derived.ownedProvinces.map((provinceId) => (
              <option key={provinceId} value={provinceId}>{provinceNameById.get(provinceId) ?? `Province ${provinceId}`}</option>
            ))}
          </select>
        </label>
        {REGIMENT_TYPES.map((type) => (
          <label key={type} title={availableRegiments.has(type) ? '' : 'Requires additional reforms or technology'}>
            {regimentSpec(type).label}
            <input
              type="number"
              min={0}
              max={16}
              className="gc-input"
              value={recruitPlan[type]}
              disabled={!availableRegiments.has(type)}
              onChange={(event) => setRecruitPlan((prev) => ({
                ...prev,
                [type]: Math.max(0, Math.min(16, Number(event.target.value) || 0)),
              }))}
            />
          </label>
        ))}
        <div className="mil-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={recruitProvince < 0 || planContainsLockedType}
            onClick={() => sendCommand({ t: 'recruitArmyWithComposition', province: recruitProvince, composition: recruitPlan })}
          >
            Recruit Composition
          </button>
          <button type="button" className="btn btn--secondary" disabled={recruitProvince < 0} onClick={() => sendCommand({ t: 'recruitArmy', province: recruitProvince })}>Quick Infantry Draft</button>
          <button type="button" className="btn btn--secondary" onClick={() => sendCommand({ t: 'mobilize' })}>
            Mobilize{mobilizeRaise > 0 ? ` (+${mobilizeRaise} / £${mobilizeCost})` : ''}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => sendCommand({ t: 'demobilize' })}>Demobilize</button>
        </div>
      </div>
      <p className="panel-subtle">
        Field regiments: {totalFieldRegiments} / standing cap {standingCap} | Reserve mobilization capacity: {reserveCapacity}
        {mobilizeRaise > 0 ? ` | Mobilize would raise ~${mobilizeRaise} regiments for £${mobilizeCost}` : ' | No mobilize headroom'}
        {' '}| Advanced formations unlock through military reforms and research.
      </p>

      <div className="mil-grid">
        <label>
          Build Fleet In
          <select className="gc-select" value={fleetProvince} onChange={(event) => setFleetProvince(Number(event.target.value))}>
            {derived.coastalProvinces.map((provinceId) => (
              <option key={provinceId} value={provinceId}>{provinceNameById.get(provinceId) ?? `Province ${provinceId}`}</option>
            ))}
          </select>
        </label>
        <label>
          Ship
          <select className="gc-select" value={fleetType} onChange={(event) => setFleetType(event.target.value as Ship['type'])}>
            {SHIP_TYPES.map((type) => (
              <option key={type} value={type} disabled={!availableShips.has(type)}>{shipSpec(type).label}</option>
            ))}
          </select>
        </label>
        <label>
          Count
          <input
            type="number"
            min={1}
            max={8}
            className="gc-input"
            value={fleetCount}
            onChange={(event) => setFleetCount(Math.max(1, Math.min(8, Number(event.target.value) || 1)))}
          />
        </label>
        <div className="mil-actions">
          <button type="button" className="btn btn--primary" disabled={fleetProvince < 0 || !availableShips.has(fleetType)} onClick={() => sendCommand({ t: 'buildFleet', province: fleetProvince, shipType: fleetType, count: fleetCount })}>
            Build Fleet
          </button>
        </div>
      </div>

      {selectedArmyStack.length > 0 || selectedFleetStack.length > 0 ? (
        <>
          <h3 className="atlas-heading panel-small-heading">Selected Stack</h3>
          {selectedArmyStack.length > 0 ? (
            <div className="panel-subtle">
              <strong>Army stack at {provinceNameById.get(selectedArmyObj?.location ?? -1) ?? selectedArmyObj?.location}</strong>
              <div>{selectedArmyStack.length} armies | {selectedArmyStack.reduce((sum, army) => sum + army.regiments.length, 0)} regiments</div>
              <div>{formatRegimentCount(selectedArmyComposition)}</div>
              <div>
                Avg STR {(
                  selectedArmyStack.reduce((sum, army) => sum + avgRegimentStrength(army), 0)
                  / Math.max(1, selectedArmyStack.length)
                ).toFixed(0)} | Avg ORG {(
                  selectedArmyStack.reduce((sum, army) => sum + avgRegimentOrg(army), 0)
                  / Math.max(1, selectedArmyStack.length)
                ).toFixed(0)}
              </div>
              <div>
                Orders: {selectedArmyObj && selectedArmyObj.moveTarget >= 0
                  ? `Moving to ${provinceNameById.get(selectedArmyObj.moveTarget) ?? selectedArmyObj.moveTarget}`
                  : 'Holding position'}
              </div>
            </div>
          ) : null}
          {selectedFleetStack.length > 0 ? (
            <div className="panel-subtle">
              <strong>Fleet stack at {provinceNameById.get(selectedFleetObj?.location ?? -1) ?? selectedFleetObj?.location}</strong>
              <div>{selectedFleetStack.length} fleets | {selectedFleetStack.reduce((sum, fleet) => sum + fleet.ships.length, 0)} ships</div>
              <div>
                Orders: {selectedFleetObj && selectedFleetObj.moveTarget >= 0
                  ? `Moving to ${provinceNameById.get(selectedFleetObj.moveTarget) ?? selectedFleetObj.moveTarget}`
                  : 'Holding position'}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <h3 className="atlas-heading panel-small-heading">Armies</h3>
      <ul className="panel-list mil-list">
        {derived.armies.map((army) => (
          <li key={army.id}>
            <div>
              <strong>Army {army.id}</strong>
              <span>
                {provinceNameById.get(army.location) ?? `Province ${army.location}`} | {army.regiments.length} regiments | STR {avgRegimentStrength(army).toFixed(0)} | ORG {avgRegimentOrg(army).toFixed(0)}
                {army.leader
                  ? ` | ${army.leader.name} (Atk ${army.leader.attack}/Def ${army.leader.defense}${army.leader.trait ? `, ${army.leader.trait.replaceAll('_', ' ')}` : ''})`
                  : ' | No general'}
                {' '}| {formatRegimentCount(regimentCountByType([army]))}
                {' '}| {army.moveTarget >= 0 ? `Order: ${provinceNameById.get(army.moveTarget) ?? army.moveTarget}` : 'Order: Hold'}
                {' '}| <span className={army.supplied === false ? 'status-danger' : 'status-positive'}>
                  {army.supplied === false ? 'Unsupplied' : 'Supplied'}
                </span>
                {army.supplied !== false
                  && avgRegimentStrength(army) < 1000
                  && snapshot.provinces[army.location]?.controller === army.owner
                  ? ' | Reinforcing'
                  : ''}
              </span>
            </div>
            <div className="mil-actions">
              <button type="button" className="btn btn--secondary" onClick={() => setSelectedArmy(army.id)}>Select</button>
              <button type="button" className="btn btn--secondary" onClick={() => sendCommand({ t: 'assignGeneral', army: army.id })}>Assign General</button>
              {derived.fleets.some((fleet) => fleet.location === army.location && fleet.embarkedArmy < 0) ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    const fleet = derived.fleets.find((candidate) => candidate.location === army.location && candidate.embarkedArmy < 0);
                    if (fleet) sendCommand({ t: 'embarkArmy', fleet: fleet.id, army: army.id });
                  }}
                >
                  Embark
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <h3 className="atlas-heading panel-small-heading">Fleets</h3>
      <ul className="panel-list mil-list">
        {derived.fleets.map((fleet) => (
          <li key={fleet.id}>
            <div>
              <strong>Fleet {fleet.id}</strong>
              <span>
                {provinceNameById.get(fleet.location) ?? `Province ${fleet.location}`} | {shipSummary(fleet)}
                {fleet.embarkedArmy >= 0 ? ` | Embarked army ${fleet.embarkedArmy}` : ''}
                {fleet.moveTarget >= 0 ? ` | Order: ${provinceNameById.get(fleet.moveTarget) ?? fleet.moveTarget}` : ' | Order: Hold'}
              </span>
            </div>
            <div className="mil-actions">
              <button type="button" className="btn btn--secondary" onClick={() => setSelectedFleet(fleet.id)}>Select</button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={fleet.embarkedArmy < 0 || selectedProvince === null}
                onClick={() => selectedProvince !== null && sendCommand({ t: 'disembarkArmy', fleet: fleet.id, target: selectedProvince })}
              >
                Land At Selected Province
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="atlas-heading panel-small-heading">Rebellions & Civil Wars</h3>
      {snapshot.rebellions.length === 0 ? <p className="panel-subtle">No active rebellions.</p> : (
        <ul className="panel-list mil-list">
          {snapshot.rebellions
            .filter((rebellion) => rebellion.status === 'active')
            .map((rebellion) => (
              <li key={`rebellion-${rebellion.id}`}>
                <div>
                  <strong>Rebellion {rebellion.id}</strong>
                  <span>
                    {snapshot.nations.find((nation) => nation.id === rebellion.targetNation)?.name ?? rebellion.targetNation}
                    {' '}| Demand: {rebellion.demand.description}
                    {' '}| Progress {rebellion.progress.toFixed(1)}
                    {' '}| Hold {rebellion.holdDays}d
                    {' '}| Core state {stateNameById.get(rebellion.originState) ?? rebellion.originState}
                  </span>
                </div>
              </li>
            ))}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading" data-coach-id="war-overview">War Overview</h3>
      {derived.wars.length === 0 ? <p className="panel-subtle">No active wars.</p> : (
        <>
          <label className="mil-label">
            Active War
            <select className="gc-select" value={selectedWar} onChange={(event) => {
              setSelectedWar(Number(event.target.value));
            }}
            >
              {derived.wars.map((war) => {
                const nameOf = (id: number) => snapshot.nations.find((nation) => nation.id === id)?.name ?? `Nation ${id}`;
                return (
                  <option key={war.id} value={war.id}>
                    {warSidesLabel(war.attackers, war.defenders, nameOf)}
                  </option>
                );
              })}
            </select>
          </label>
          {selectedWarObj ? (
            <>
              <p className="panel-subtle">
                Score (your perspective):{' '}
                <TraceTooltip
                  value={scorePerspective.toFixed(1)}
                  trace={(() => {
                    const parts = selectedWarObj.scoreBreakdown;
                    const sign = isPlayerAttacker ? 1 : -1;
                    if (!parts) {
                      return [
                        { label: 'Raw warscore', value: selectedWarObj.score },
                        { label: 'Attacker exhaustion', value: selectedWarObj.attackerExhaustion },
                        { label: 'Defender exhaustion', value: selectedWarObj.defenderExhaustion },
                        { label: 'Goals', value: selectedWarObj.goals.length },
                      ];
                    }
                    return [
                      { label: 'Occupation', value: parts.occupation * sign },
                      { label: 'Capital', value: parts.capital * sign },
                      { label: 'Blockade', value: parts.blockade * sign },
                      { label: 'Battles', value: parts.battle * sign },
                      { label: 'Exhaustion', value: parts.exhaustion * sign },
                      { label: 'Total (raw)', value: selectedWarObj.score * sign },
                    ];
                  })()}
                />{' '}
                | Exhaustion A{' '}
                <TraceTooltip
                  value={selectedWarObj.attackerExhaustion.toFixed(1)}
                  trace={[
                    { label: 'Attacker exhaustion', value: selectedWarObj.attackerExhaustion },
                    { label: 'Defender exhaustion', value: selectedWarObj.defenderExhaustion },
                    { label: 'Warscore', value: selectedWarObj.score },
                  ]}
                />{' '}
                / D{' '}
                <TraceTooltip
                  value={selectedWarObj.defenderExhaustion.toFixed(1)}
                  trace={[
                    { label: 'Defender exhaustion', value: selectedWarObj.defenderExhaustion },
                    { label: 'Attacker exhaustion', value: selectedWarObj.attackerExhaustion },
                    { label: 'Warscore', value: selectedWarObj.score },
                  ]}
                />
              </p>
              <p className="panel-subtle">
                Combat odds:{' '}
                <TraceTooltip
                  value={warCombat ? `${(warCombat.playerOdds * 100).toFixed(1)}%` : '50.0%'}
                  trace={warCombat ? [
                    { label: 'Attacker regiments', value: warCombat.attackerRegiments },
                    { label: 'Defender regiments', value: warCombat.defenderRegiments },
                    { label: 'Attacker avg org', value: warCombat.attackerOrg },
                    { label: 'Defender avg org', value: warCombat.defenderOrg },
                  ] : []}
                />
              </p>
              <PeaceConference war={selectedWarObj} />
            </>
          ) : null}
        </>
      )}

      <h3 className="atlas-heading panel-small-heading">Recent Battles</h3>
      {(snapshot.recentBattles ?? []).length === 0 ? (
        <p className="panel-subtle">No recent battles involving your forces.</p>
      ) : (
        <ul className="panel-list mil-list">
          {(snapshot.recentBattles ?? []).slice().reverse().map((battle) => {
            const playerIsAttacker = battle.attackerNation === snapshot.playerNation;
            const playerWon = (battle.outcome === 'attacker_victory') === playerIsAttacker;
            const enemyId = playerIsAttacker ? battle.defenderNation : battle.attackerNation;
            const enemy = snapshot.nations.find((nation) => nation.id === enemyId)?.name ?? 'enemy';
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
            const why = (FACTOR_TEXT[decisive[0]] ?? ['decisive factor unclear', 'decisive factor unclear'])[helpedPlayer ? 0 : 1];
            const ourLosses = playerIsAttacker ? battle.attackerLosses : battle.defenderLosses;
            const theirLosses = playerIsAttacker ? battle.defenderLosses : battle.attackerLosses;
            const outcomeLabel = battle.outcome === 'clash'
              ? 'Clash'
              : (playerWon ? 'Victory' : 'Defeat');
            return (
              <li key={`${battle.day}-${battle.provinceId}-${battle.warId}`}>
                <div>
                  <strong>{outcomeLabel} at {battle.provinceName}</strong>
                  <span>
                    Day {battle.day} vs {enemy} — {why}. Losses {Math.round(ourLosses)} to {Math.round(theirLosses)}.
                    {' '}| Decisive: {decisive[0]} ({(decisive[1] * sign).toFixed(1)})
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
