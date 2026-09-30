import { useState } from "react";
import { UnitCounters } from "../../apps/mobile/game/UnitCounters";
import { createWorld } from "../../src/sim/bootstrap";
import { GAME_DATA } from "../../src/data/gameData";
import { applyCommand } from "../../src/sim/commands";
import { snapshot } from "../../src/sim/world";
import { loadScenario } from "../../src/data/generated";
const seed = loadScenario("1830-01-01").worldSeed;
const project = () => [180, 250] as [number, number];
export function UnitCounterHarness() {
  const [state, setState] = useState(() => {
    const world = createWorld(GAME_DATA, 24681);
    applyCommand(
      world,
      GAME_DATA,
      { t: "recruitArmy", province: world.nations[world.playerNation].capital },
      () => {},
    );
    const s = snapshot(world, GAME_DATA);
    return {
      ...s,
      armies: [s.armies.find((a) => a.owner === s.playerNation)!],
      fleets: [],
    };
  });
  const [selected, setSelected] = useState<number | null>(null);
  const army = state.armies.find((a) => a.owner === state.playerNation)!;
  const target = seed.provinces[army?.location]?.neighbors[0];
  return (
    <>
      <UnitCounters
        snapshot={state}
        seed={seed}
        project={project}
        revision={0}
        onSelect={setSelected}
      />
      <button
        onClick={() =>
          setState({
            ...state,
            armies: state.armies.map((a) =>
              a.id === army.id ? { ...a, location: target } : a,
            ),
          })
        }
      >
        Move visible formation
      </button>
      <button onClick={() => setState({ ...state, armies: [] })}>
        Remove formations
      </button>
      <div role="status">
        Selected: {selected == null ? "none" : seed.provinces[selected].name}
      </div>
    </>
  );
}
