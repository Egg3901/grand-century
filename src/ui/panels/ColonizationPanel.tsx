import { useMemo } from 'react';
import { WORLD_SEED } from '../../data/generated';
import { useStore } from '../../store';

const UNCOLONIZED_TAGS = new Set(['UNC', 'COL', 'UNA']);

export function ColonizationPanel() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const nationById = new Map(snapshot.nations.map((nation) => [nation.id, nation]));
    const ownerByProvince = new Map(snapshot.provinces.map((province) => [province.id, province.owner]));
    const playerOwned = new Set(snapshot.provinces.filter((province) => province.owner === snapshot.playerNation).map((province) => province.id));
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

    return { claimable, colonies };
  }, [snapshot]);

  if (!snapshot || !derived) {
    return (
      <section className="panel-card atlas-panel">
        <h2 className="atlas-heading">Colonization</h2>
        <p>Gathering expedition manifests...</p>
      </section>
    );
  }

  return (
    <section className="panel-card atlas-panel">
      <h2 className="atlas-heading">Colonization & Expansion</h2>
      <p className="panel-subtle">
        Colonial claims draw from naval reach and national military reforms. Claim cost is handled by the sim per expedition.
      </p>

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
                <button type="button" onClick={() => sendCommand({ t: 'colonize', state: state.id })}>Plant Claim</button>
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
              <span>{state.fullyOwned ? 'Fully controlled' : 'Partially contested'}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
