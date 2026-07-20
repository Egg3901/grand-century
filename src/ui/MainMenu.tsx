import { useMemo, useState } from 'react';
import { useStore } from '../store';

export function MainMenu() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);
  const setShowMainMenu = useStore((state) => state.setShowMainMenu);
  const [seedInput, setSeedInput] = useState('1836');

  const nations = useMemo(() => (snapshot?.nations ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [snapshot]);
  const [selectedNation, setSelectedNation] = useState<number>(snapshot?.playerNation ?? 0);

  if (!snapshot) return null;

  return (
    <div className="menu-overlay">
      <section className="menu-card atlas-panel">
        <h1 className="atlas-heading">Grand Century</h1>
        <p>Select a nation and begin a new campaign.</p>
        <label>
          Nation
          <select data-testid="menu-nation-select" value={selectedNation} onChange={(event) => setSelectedNation(Number(event.target.value))}>
            {nations.map((nation) => (
              <option key={nation.id} value={nation.id}>
                {nation.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seed
          <input data-testid="menu-seed-input" value={seedInput} onChange={(event) => setSeedInput(event.target.value)} />
        </label>
        <div className="menu-actions">
          <button
            type="button"
            data-testid="menu-new-game"
            onClick={() => {
              const parsedSeed = Number(seedInput);
              const seed = Number.isFinite(parsedSeed) ? Math.max(1, Math.floor(parsedSeed)) : 1836;
              sendCommand({ t: 'newGame', seed, playerNation: selectedNation });
              setShowMainMenu(false);
            }}
          >
            New Game
          </button>
          <button type="button" onClick={() => setShowMainMenu(false)}>
            Continue
          </button>
          <button
            type="button"
            data-testid="menu-replay-tutorial"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('gc:replay-tutorial'));
              setShowMainMenu(false);
            }}
          >
            Replay Tutorial
          </button>
        </div>
      </section>
    </div>
  );
}

