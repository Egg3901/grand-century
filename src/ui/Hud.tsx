import { useMemo } from 'react';
import { useStore, type PanelId } from '../store';
import './Hud.css';

const SPEEDS = [0, 1, 2, 3, 4, 5] as const;
const PANELS: { id: PanelId; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'population', label: 'Population' },
  { id: 'politics', label: 'Politics' },
  { id: 'diplomacy', label: 'Diplomacy' },
  { id: 'military', label: 'Military' },
];

function speedLabel(speed: number): string {
  if (speed === 0) return 'Pause';
  return `x${speed}`;
}

function formatMoney(value: number): string {
  return `${value < 0 ? '-' : ''}\u00a3${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function Hud() {
  const snapshot = useStore((state) => state.snapshot);
  const openPanel = useStore((state) => state.openPanel);
  const openPanelId = useStore((state) => state.openPanelId);
  const sendCommand = useStore((state) => state.sendCommand);

  const playerNation = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.nations.find((nation) => nation.id === snapshot.playerNation) ?? null;
  }, [snapshot]);

  return (
    <>
      <header className="hud-top atlas-panel">
        <div className="hud-top__section">
          <span className="atlas-heading">Date</span>
          <strong>
            {snapshot ? `${snapshot.date.year}-${String(snapshot.date.month).padStart(2, '0')}-${String(snapshot.date.day).padStart(2, '0')}` : '1836-01-01'}
          </strong>
        </div>
        <div className="hud-top__section hud-top__speeds">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={snapshot?.speed === speed ? 'is-active' : ''}
              onClick={() => sendCommand({ t: 'setSpeed', speed })}
            >
              {speedLabel(speed)}
            </button>
          ))}
        </div>
        <div className="hud-top__section hud-top__nation">
          <span className="atlas-heading">{playerNation?.name ?? 'United Kingdom'}</span>
          <strong>{formatMoney(playerNation?.treasury ?? 0)}</strong>
        </div>
      </header>

      <nav className="hud-rail atlas-panel" aria-label="Panels">
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className={openPanel === panel.id ? 'is-active' : ''}
            onClick={() => openPanelId(openPanel === panel.id ? null : panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </nav>
    </>
  );
}
