import { DEFAULT_SCENARIO_ID, loadScenario } from '../data/generated';
import { useStore } from '../store';

/** Resolve static map metadata for the scenario that owns the live UI data. */
export function useScenarioWorldSeed() {
  const scenarioId = useStore((state) => (
    state.snapshot?.scenarioId ?? state.data?.scenarioId ?? DEFAULT_SCENARIO_ID
  ));
  return loadScenario(scenarioId).worldSeed;
}
