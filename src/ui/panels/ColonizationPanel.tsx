import { useMemo } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { TraceTooltip } from '../components/TraceTooltip';
import { useScenarioWorldSeed } from '../useScenarioWorldSeed';

const CLAIM_COST = 32;

export function ColonizationPanel() {
  const worldSeed = useScenarioWorldSeed();
  const snapshot = useStore(useShallow((state) => state.snapshot));
  const sendCommand = useStore((state) => state.sendCommand);

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const nationById = new Map(snapshot.nations.map((nation) => [nation.id, nation]));
    const ownerByProvince = new Map(snapshot.provinces.map((province) => [province.id, province.owner]));
    const player = nationById.get(snapshot.playerNation) ?? null;
    const claimableById = new Map(
      (snapshot.playerClaimableColonialStates ?? []).map((entry) => [entry.stateId, entry.reach]),
    );
    const claimByState = new Map((snapshot.colonialClaims ?? []).map((claim) => [claim.stateId, claim]));

    const claimable = worldSeed.states
      .map((state) => {
        const reach = claimableById.get(state.id);
        if (!reach) return null;
        const claim = claimByState.get(state.id);
        const playerProgress = claim?.claimants.find((c) => c.nation === snapshot.playerNation)?.progress;
        const rivals = (claim?.claimants ?? [])
          .filter((c) => c.nation !== snapshot.playerNation)
          .sort((a, b) => b.progress - a.progress || a.nation - b.nation);
        const rivalLead = rivals[0] ?? null;
        return {
          id: state.id,
          name: state.name,
          reach,
          alreadyClaiming: playerProgress !== undefined,
          playerProgress: playerProgress ?? 0,
          rivalLead,
          tension: claim?.tension ?? 0,
        };
      })
      .filter((state): state is NonNullable<typeof state> => state !== null)
      .sort((a, b) => {
        // Adjacent first, then overseas; stable by name.
        if (a.reach !== b.reach) return a.reach === 'adjacent' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const colonies = worldSeed.states
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
        const stateName = worldSeed.states.find((state) => state.id === claim.stateId)?.name ?? `State ${claim.stateId}`;
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

    return { claimable, colonies, activeClaims, player, nationById };
  }, [snapshot, worldSeed]);

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
                    ? ` | Rival ${derived.nationById.get(claim.rival.nation)?.tag ?? claim.rival.nation} ${(claim.rival.progress * 100).toFixed(0)}%`
                    : ''}
                  {' '}| Claimants: {claim.claimants.map((c) => (
                    `${derived.nationById.get(c.nation)?.tag ?? c.nation} ${(c.progress * 100).toFixed(0)}%`
                  )).join(', ')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="atlas-heading panel-small-heading">Claimable Regions</h3>
      {derived.claimable.length === 0 ? (
        <p className="panel-subtle">No uncolonized regions in land or overseas naval reach.</p>
      ) : (
        <ul className="panel-list mil-list">
          {derived.claimable.slice(0, 24).map((state) => {
            const rivalLabel = state.rivalLead
              ? `Rival lead: ${derived.nationById.get(state.rivalLead.nation)?.tag ?? state.rivalLead.nation} ${(state.rivalLead.progress * 100).toFixed(0)}%`
              : null;
            return (
              <li key={state.id}>
                <div>
                  <strong>{state.name}</strong>
                  <span>
                    Reach: {state.reach === 'overseas' ? 'Overseas (naval base)' : 'Adjacent'}
                    {state.alreadyClaiming ? ` | Claiming ${(state.playerProgress * 100).toFixed(0)}%` : ''}
                    {rivalLabel ? ` | ${rivalLabel}` : ''}
                    {state.tension > 0 ? ` | Tension ${(state.tension * 100).toFixed(0)}%` : ''}
                  </span>
                </div>
                <div className="mil-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={state.alreadyClaiming || availableCp < CLAIM_COST}
                    title={
                      state.alreadyClaiming
                        ? 'Already claiming this state'
                        : availableCp < CLAIM_COST
                          ? `Need ${CLAIM_COST} colonial points`
                          : undefined
                    }
                    onClick={() => sendCommand({ t: 'colonize', state: state.id })}
                  >
                    {state.alreadyClaiming ? 'Already Claiming' : 'Plant Claim'}
                  </button>
                </div>
              </li>
            );
          })}
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
