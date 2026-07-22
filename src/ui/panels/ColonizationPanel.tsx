import { useMemo } from 'react';
import { WORLD_SEED } from '../../data/generated';
import { useStore } from '../../store';
import { TraceTooltip } from '../components/TraceTooltip';

const UNCOLONIZED_TAGS = new Set(['UNC', 'COL', 'UNA']);
const CLAIM_COST = 32;

export function ColonizationPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const nationById = new Map(snapshot.nations.map((nation) => [nation.id, nation]));
    const ownerByProvince = new Map(snapshot.provinces.map((province) => [province.id, province.owner]));
    const playerOwned = new Set(snapshot.provinces.filter((province) => province.owner === snapshot.playerNation).map((province) => province.id));
    const player = nationById.get(snapshot.playerNation) ?? null;

    const claimable = WORLD_SEED.states
      .map((state) => {
        const provinceOwners = state.provinceIds.map((provinceId) => ownerByProvince.get(provinceId) ?? -1);
        const allUncolonized = provinceOwners.every((ownerId) => UNCOLONIZED_TAGS.has(nationById.get(ownerId)?.tag ?? ''));
        const adjacent = state.provinceIds.some((provinceId) => (
          WORLD_SEED.provinces[provinceId]?.neighbors.some((neighborId) => playerOwned.has(neighborId))
        ));
        return {
          id: state.id,
          name: state.name,
          ownerTags: Array.from(new Set(provinceOwners.map((ownerId) => nationById.get(ownerId)?.tag ?? '?'))),
          allUncolonized,
          adjacent,
        };
      })
      .filter((state) => state.allUncolonized && state.adjacent)
      .sort((a, b) => a.name.localeCompare(b.name));

    const colonies = WORLD_SEED.states
      .filter((state) => state.provinceIds.some((provinceId) => ownerByProvince.get(provinceId) === snapshot.playerNation))
      .map((state) => ({
        id: state.id,
        name: state.name,
        fullyOwned: state.provinceIds.every((provinceId) => ownerByProvince.get(provinceId) === snapshot.playerNation),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);

    const activeClaims = (snapshot.colonialClaims ?? [])
      .map((claim) => {
        const stateName = WORLD_SEED.states.find((state) => state.id === claim.stateId)?.name ?? `State ${claim.stateId}`;
        const playerEntry = claim.claimants.find((c) => c.nation === snapshot.playerNation);
        const rival = claim.claimants
          .filter((c) => c.nation !== snapshot.playerNation)
          .sort((a, b) => b.progress - a.progress || a.nation - b.nation)[0] ?? null;
        return {
          ...claim,
          stateName,
          playerProgress: playerEntry?.progress ?? null,
          rival,
        };
      })
      .sort((a, b) => a.stateName.localeCompare(b.stateName));

    return { claimable, colonies, activeClaims, player };
  }, [snapshot]);

  if (!snapshot || !derived) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Colonization</h2>
        <p>Gathering expedition manifests...</p>
      </section>
    );
  }

  const breakdown = derived.player?.colonialPointsBreakdown;
  const availableCp = derived.player?.colonialPoints ?? breakdown?.available ?? 0;

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Colonization & Expansion</h2>
      <p className="panel-subtle">
        Colonial points:{' '}
        <TraceTooltip
          value={`${availableCp} (claim cost ${CLAIM_COST})`}
          trace={breakdown ? [
            { label: 'Naval bases', value: breakdown.navalBases },
            { label: 'Reforms', value: breakdown.reforms },
            { label: 'Navy tech', value: breakdown.navyTech },
            { label: 'GP bonus', value: breakdown.gpBonus },
            { label: 'Event/decision modifier', value: breakdown.modifier },
            { label: 'Committed claims', value: -breakdown.committed },
            { label: 'Available', value: breakdown.available },
          ] : []}
        />
      </p>

      <h3 className="atlas-heading panel-small-heading">Active Claims</h3>
      {derived.activeClaims.length === 0 ? (
        <p className="panel-subtle">No active colonial claims worldwide.</p>
      ) : (
        <ul className="panel-list mil-list">
          {derived.activeClaims.map((claim) => (
            <li key={claim.stateId}>
              <div>
                <strong>{claim.stateName}</strong>
                <span>
                  Tension {(claim.tension * 100).toFixed(0)}%
                  {claim.playerProgress !== null
                    ? ` | Your progress ${(claim.playerProgress * 100).toFixed(0)}%`
                    : ' | You are not claiming'}
                  {claim.etaDays !== null ? ` | ETA ~${claim.etaDays}d` : ''}
                  {claim.rival
                    ? ` | Rival ${snapshot.nations.find((n) => n.id === claim.rival!.nation)?.tag ?? claim.rival.nation} ${(claim.rival.progress * 100).toFixed(0)}%`
                    : ''}
                  {' '}| Claimants: {claim.claimants.map((c) => (
                    `${snapshot.nations.find((n) => n.id === c.nation)?.tag ?? c.nation} ${(c.progress * 100).toFixed(0)}%`
                  )).join(', ')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading">Claimable Regions</h3>
      {derived.claimable.length === 0 ? <p className="panel-subtle">No adjacent uncolonized regions currently in reach.</p> : (
        <ul className="panel-list mil-list">
          {derived.claimable.slice(0, 20).map((state) => (
            <li key={state.id}>
              <div>
                <strong>{state.name}</strong>
                <span>Owners: {state.ownerTags.join(', ')}</span>
              </div>
              <div className="mil-actions">
                <button type="button" className="btn btn--primary" onClick={() => sendCommand({ t: 'colonize', state: state.id })}>Plant Claim</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading">Current Colonial Footprint</h3>
      <ul className="panel-list mil-list">
        {derived.colonies.map((state) => (
          <li key={state.id}>
            <div>
              <strong>{state.name}</strong>
              <span className={state.fullyOwned ? 'status-positive' : 'status-danger'}>
                {state.fullyOwned ? 'Fully controlled' : 'Incomplete ownership'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
