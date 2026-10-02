import { useEffect, useState } from 'react';
import { DEFAULT_SCENARIO_ID, ensureScenario, isScenarioLoaded, loadScenario } from '../data/generated';
import { useStore } from '../store';

/**
 * Resolve static map metadata for the scenario that owns the live UI data.
 * Era seeds load on demand; until one arrives the 1830 seed stands in (same
 * province mesh), and the hook re-renders once the era seed is ready.
 */
export function useScenarioWorldSeed() {
  const scenarioId = useStore((state) => (
    state.snapshot?.scenarioId ?? state.data?.scenarioId ?? DEFAULT_SCENARIO_ID
  ));
  const [, setLoaded] = useState(0);
  const ready = isScenarioLoaded(scenarioId);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void ensureScenario(scenarioId).then(() => { if (live) setLoaded((n) => n + 1); });
    return () => { live = false; };
  }, [scenarioId, ready]);
  return loadScenario(ready ? scenarioId : DEFAULT_SCENARIO_ID).worldSeed;
}
