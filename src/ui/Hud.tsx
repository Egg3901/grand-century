import { useMemo } from 'react';
import { useStore, type MapMode, type PanelId } from '../store';
import './Hud.css';

const SPEEDS = [0, 1, 2, 3, 4, 5] as const;
const PANELS: { id: PanelId; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'production', label: 'Production' },
  { id: 'population', label: 'Population' },
  { id: 'market', label: 'Market' },
  { id: 'politics', label: 'Politics' },
  { id: 'diplomacy', label: 'Diplomacy' },
  { id: 'great_powers', label: 'Great Powers' },
  { id: 'military', label: 'Military' },
  { id: 'colonization', label: 'Colonization' },
  { id: 'save_load', label: 'Save / Load' },
];
const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'political', label: 'Political' },
  { id: 'ruling_ideology', label: 'Ruling Ideology' },
  { id: 'unrest', label: 'Unrest' },
  { id: 'population', label: 'Population' },
  { id: 'economy', label: 'Economy' },
  { id: 'military', label: 'Military' },
  { id: 'diplomatic', label: 'Diplomatic' },
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
  const mapMode = useStore((state) => state.mapMode);
  const setMapMode = useStore((state) => state.setMapMode);
  const setShowMainMenu = useStore((state) => state.setShowMainMenu);
  const muteAudio = useStore((state) => state.muteAudio);
  const setMuteAudio = useStore((state) => state.setMuteAudio);

  const playerNation = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.nations.find((nation) => nation.id === snapshot.playerNation) ?? null;
  }, [snapshot]);

  return (
    <>
      <header className="hud-top atlas-panel">
        <div className="hud-top__section">
          <span className="atlas-heading">Date</span>
          <strong data-testid="hud-date">
            {snapshot ? `${snapshot.date.year}-${String(snapshot.date.month).padStart(2, '0')}-${String(snapshot.date.day).padStart(2, '0')}` : '1836-01-01'}
          </strong>
        </div>
        <div className="hud-top__section hud-top__speeds">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              data-testid={`speed-${speed}`}
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
          <span className={`hud-infamy ${playerNation && snapshot && playerNation.infamy >= snapshot.infamyLimit ? 'is-danger' : ''}`}>
            Infamy {(playerNation?.infamy ?? 0).toFixed(1)}
            {snapshot ? ` / ${snapshot.infamyLimit.toFixed(1)}` : ''}
          </span>
          <button type="button" onClick={() => setMuteAudio(!muteAudio)}>{muteAudio ? 'Unmute' : 'Mute'}</button>
          <button type="button" onClick={() => setShowMainMenu(true)}>Menu</button>
        </div>
      </header>

      <nav className="hud-rail atlas-panel" aria-label="Panels">
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            type="button"
            data-testid={`panel-${panel.id}`}
            className={openPanel === panel.id ? 'is-active' : ''}
            onClick={() => openPanelId(openPanel === panel.id ? null : panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </nav>

      <nav className="hud-mapmodes atlas-panel" aria-label="Map mode">
        {MAP_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={mapMode === mode.id ? 'is-active' : ''}
            onClick={() => setMapMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </nav>
    </>
  );
}
