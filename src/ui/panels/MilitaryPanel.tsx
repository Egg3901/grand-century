import { useEffect, useMemo, useState } from 'react';
import { WORLD_SEED } from '../../data/generated';
import type { Army, Fleet, Ship } from '../../shared/types';
import { useStore } from '../../store';
import { TraceTooltip } from '../components/TraceTooltip';

function avgRegimentStrength(army: Army): number {
  if (army.regiments.length === 0) return 0;
  return army.regiments.reduce((sum, regiment) => sum + regiment.strength, 0) / army.regiments.length;
}

function avgRegimentOrg(army: Army): number {
  if (army.regiments.length === 0) return 0;
  return army.regiments.reduce((sum, regiment) => sum + regiment.organization, 0) / army.regiments.length;
}

function shipSummary(fleet: Fleet): string {
  const counts: Record<Ship['type'], number> = { transport: 0, frigate: 0, manofwar: 0, ironclad: 0 };
  for (const ship of fleet.ships) counts[ship.type] += 1;
  return `T ${counts.transport} | F ${counts.frigate} | M ${counts.manofwar} | I ${counts.ironclad}`;
}

export function MilitaryPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const selectedProvince = useStore((state) => state.selectedProvince);
  const selectedArmy = useStore((state) => state.selectedArmy);
  const selectedFleet = useStore((state) => state.selectedFleet);
  const setSelectedArmy = useStore((state) => state.setSelectedArmy);
  const setSelectedFleet = useStore((state) => state.setSelectedFleet);
  const sendCommand = useStore((state) => state.sendCommand);
  const provinceNameById = useMemo(() => (
    new Map<number, string>(WORLD_SEED.provinces.map((province) => [province.id, province.name]))
  ), []);
  const stateNameById = useMemo(() => (
    new Map<number, string>(WORLD_SEED.states.map((state) => [state.id, state.name]))
  ), []);

  const [recruitProvince, setRecruitProvince] = useState<number>(-1);
  const [fleetProvince, setFleetProvince] = useState<number>(-1);
  const [fleetType, setFleetType] = useState<Ship['type']>('transport');
  const [fleetCount, setFleetCount] = useState(1);
  const [selectedWar, setSelectedWar] = useState<number>(-1);
  const [enforcedGoals, setEnforcedGoals] = useState<number[]>([]);

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const player = snapshot.playerNation;
    const armies = snapshot.armies.filter((army) => army.owner === player && !army.rebel).sort((a, b) => a.id - b.id);
    const fleets = snapshot.fleets.filter((fleet) => fleet.owner === player).sort((a, b) => a.id - b.id);
    const ownedProvinces = snapshot.provinces
      .filter((province) => province.owner === player)
      .map((province) => province.id)
      .sort((a, b) => a - b);
    const coastalProvinces = ownedProvinces.filter((provinceId) => WORLD_SEED.provinces[provinceId]?.coastal);
    const wars = snapshot.wars
      .filter((war) => war.attackers.includes(player) || war.defenders.includes(player))
      .sort((a, b) => a.id - b.id);
    return { armies, fleets, ownedProvinces, coastalProvinces, wars };
  }, [snapshot]);

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
      setEnforcedGoals([]);
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
  const selectedWarGoals = selectedWarObj?.goals ?? [];
  const isPlayerAttacker = selectedWarObj ? selectedWarObj.attackers.includes(snapshot.playerNation) : false;
  const scorePerspective = selectedWarObj ? (isPlayerAttacker ? selectedWarObj.score : -selectedWarObj.score) : 0;
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
          <select value={recruitProvince} onChange={(event) => setRecruitProvince(Number(event.target.value))}>
            {derived.ownedProvinces.map((provinceId) => (
              <option key={provinceId} value={provinceId}>{provinceNameById.get(provinceId) ?? `Province ${provinceId}`}</option>
            ))}
          </select>
        </label>
        <div className="mil-actions">
          <button type="button" disabled={recruitProvince < 0} onClick={() => sendCommand({ t: 'recruitArmy', province: recruitProvince })}>Recruit Army</button>
          <button type="button" onClick={() => sendCommand({ t: 'mobilize' })}>Mobilize</button>
          <button type="button" onClick={() => sendCommand({ t: 'demobilize' })}>Demobilize</button>
        </div>
      </div>

      <div className="mil-grid">
        <label>
          Build Fleet In
          <select value={fleetProvince} onChange={(event) => setFleetProvince(Number(event.target.value))}>
            {derived.coastalProvinces.map((provinceId) => (
              <option key={provinceId} value={provinceId}>{provinceNameById.get(provinceId) ?? `Province ${provinceId}`}</option>
            ))}
          </select>
        </label>
        <label>
          Ship
          <select value={fleetType} onChange={(event) => setFleetType(event.target.value as Ship['type'])}>
            <option value="transport">Transport</option>
            <option value="frigate">Frigate</option>
            <option value="manofwar">Man-o-war</option>
            <option value="ironclad">Ironclad</option>
          </select>
        </label>
        <label>
          Count
          <input
            type="number"
            min={1}
            max={8}
            value={fleetCount}
            onChange={(event) => setFleetCount(Math.max(1, Math.min(8, Number(event.target.value) || 1)))}
          />
        </label>
        <div className="mil-actions">
          <button type="button" disabled={fleetProvince < 0} onClick={() => sendCommand({ t: 'buildFleet', province: fleetProvince, shipType: fleetType, count: fleetCount })}>
            Build Fleet
          </button>
        </div>
      </div>

      <h3 className="atlas-heading panel-small-heading">Armies</h3>
      <ul className="panel-list mil-list">
        {derived.armies.map((army) => (
          <li key={army.id}>
            <div>
              <strong>Army {army.id}</strong>
              <span>
                {provinceNameById.get(army.location) ?? `Province ${army.location}`} | {army.regiments.length} regiments | STR {avgRegimentStrength(army).toFixed(0)} | ORG {avgRegimentOrg(army).toFixed(0)}
                {army.leader ? ` | ${army.leader.name}` : ' | No general'}
              </span>
            </div>
            <div className="mil-actions">
              <button type="button" onClick={() => setSelectedArmy(army.id)}>Select</button>
              <button type="button" onClick={() => sendCommand({ t: 'assignGeneral', army: army.id })}>Assign General</button>
              {derived.fleets.some((fleet) => fleet.location === army.location && fleet.embarkedArmy < 0) ? (
                <button
                  type="button"
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
              </span>
            </div>
            <div className="mil-actions">
              <button type="button" onClick={() => setSelectedFleet(fleet.id)}>Select</button>
              <button
                type="button"
                disabled={fleet.embarkedArmy < 0 || selectedProvince === null}
                onClick={() => selectedProvince !== null && sendCommand({ t: 'disembarkArmy', fleet: fleet.id, target: selectedProvince })}
              >
                Land At Selected Province
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="atlas-heading panel-small-heading">War Overview</h3>
      {derived.wars.length === 0 ? <p className="panel-subtle">No active wars.</p> : (
        <>
          <label className="mil-label">
            Active War
            <select value={selectedWar} onChange={(event) => {
              setSelectedWar(Number(event.target.value));
              setEnforcedGoals([]);
            }}
            >
              {derived.wars.map((war) => (
                <option key={war.id} value={war.id}>
                  War {war.id}: A[{war.attackers.join(',')}] vs D[{war.defenders.join(',')}]
                </option>
              ))}
            </select>
          </label>
          {selectedWarObj ? (
            <>
              <p className="panel-subtle">
                Score (your perspective):{' '}
                <TraceTooltip
                  value={scorePerspective.toFixed(1)}
                  trace={[
                    { label: 'Raw warscore', value: selectedWarObj.score },
                    { label: 'Attacker exhaustion', value: selectedWarObj.attackerExhaustion },
                    { label: 'Defender exhaustion', value: selectedWarObj.defenderExhaustion },
                    { label: 'Goals', value: selectedWarObj.goals.length },
                  ]}
                />{' '}
                | Exhaustion A {selectedWarObj.attackerExhaustion.toFixed(1)} / D {selectedWarObj.defenderExhaustion.toFixed(1)}
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
              <ul className="panel-list mil-goal-list">
                {selectedWarGoals.map((goal, index) => (
                  <li key={`${goal.type}-${index}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={enforcedGoals.includes(index)}
                        onChange={(event) => {
                          setEnforcedGoals((prev) => (
                            event.target.checked
                              ? [...prev, index].sort((a, b) => a - b)
                              : prev.filter((value) => value !== index)
                          ));
                        }}
                      />
                      {goal.type} ({stateNameById.get(goal.stateId) ?? goal.stateId}) - cost {goal.scoreValue.toFixed(1)}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mil-actions">
                <button type="button" onClick={() => sendCommand({ t: 'offerPeace', war: selectedWarObj.id, goalsToEnforce: [] })}>White Peace</button>
                <button type="button" onClick={() => sendCommand({ t: 'offerPeace', war: selectedWarObj.id, goalsToEnforce: enforcedGoals })}>Enforce Selected Goals</button>
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
