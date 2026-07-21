import { useEffect, useMemo, useState } from 'react';
import { useStore, type MapMode, type PanelId } from '../store';
import { copyShareLink } from './permalink';
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
  { id: 'formables', label: 'Formables' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'technology', label: 'Technology' },
  { id: 'military', label: 'Military' },
  { id: 'colonization', label: 'Colonization' },
  { id: 'save_load', label: 'Save / Load' },
];
const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'political', label: 'Political' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'ruling_ideology', label: 'Ruling Ideology' },
  { id: 'unrest', label: 'Unrest' },
  { id: 'population', label: 'Population' },
  { id: 'economy', label: 'Economy' },
  { id: 'military', label: 'Military' },
  { id: 'diplomatic', label: 'Diplomatic' },
  { id: 'cores', label: 'Cores' },
];
const MAX_SPEED = SPEEDS[SPEEDS.length - 1];

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
  const multiplayer = useStore((state) => state.multiplayer);
  const mpIsLeader = useStore((state) => state.mpIsLeader);
  const [mobilePanelsOpen, setMobilePanelsOpen] = useState(false);
  const [mobileMapModesOpen, setMobileMapModesOpen] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);

  const playerNation = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.nations.find((nation) => nation.id === snapshot.playerNation) ?? null;
  }, [snapshot]);
  const currentSpeed = snapshot?.speed ?? 0;
  const formattedDate = snapshot
    ? `${snapshot.date.year}-${String(snapshot.date.month).padStart(2, '0')}-${String(snapshot.date.day).padStart(2, '0')}`
    : '1820-01-01';

  const panels = useMemo(
    () => (multiplayer ? PANELS.filter((p) => p.id !== 'save_load') : PANELS),
    [multiplayer],
  );
  const canControlSpeed = !multiplayer || mpIsLeader;

  useEffect(() => {
    if (openPanel) setMobilePanelsOpen(false);
  }, [openPanel]);

  const setSpeed = (speed: number) => {
    if (!canControlSpeed) return;
    const clamped = Math.max(0, Math.min(MAX_SPEED, speed));
    sendCommand({ t: 'setSpeed', speed: clamped });
  };

  const toggleMobilePanels = () => {
    setMobilePanelsOpen((open) => !open);
    setMobileMapModesOpen(false);
  };

  const toggleMobileMapModes = () => {
    setMobileMapModesOpen((open) => !open);
    setMobilePanelsOpen(false);
  };

  return (
    <>
      <header className="hud-top atlas-panel">
        <div className="hud-top__section">
          <span className="atlas-heading">Date</span>
          <strong data-testid="hud-date">{formattedDate}</strong>
        </div>
        <div className="hud-top__section hud-top__speeds" data-coach-id="speed-controls-desktop">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              data-testid={`speed-${speed}`}
              className={currentSpeed === speed ? 'is-active' : ''}
              disabled={!canControlSpeed}
              title={canControlSpeed ? undefined : 'Only the session leader may change speed'}
              onClick={() => sendCommand({ t: 'setSpeed', speed })}
            >
              {speedLabel(speed)}
            </button>
          ))}
        </div>
        <div className="hud-top__section hud-top__nation" data-coach-id="hud-nation">
          <span className="atlas-heading">{playerNation?.name ?? 'United Kingdom'}</span>
          <strong>{formatMoney(playerNation?.treasury ?? 0)}</strong>
          <span className={`hud-infamy ${playerNation && snapshot && playerNation.infamy >= snapshot.infamyLimit ? 'is-danger' : ''}`}>
            Infamy {(playerNation?.infamy ?? 0).toFixed(1)}
            {snapshot ? ` / ${snapshot.infamyLimit.toFixed(1)}` : ''}
          </span>
          <button type="button" onClick={() => setMuteAudio(!muteAudio)}>{muteAudio ? 'Unmute' : 'Mute'}</button>
          <button
            type="button"
            data-testid="hud-copy-share"
            title={shareHint ?? 'Copy share link'}
            onClick={() => {
              if (!playerNation) return;
              void copyShareLink({
                seed: snapshot?.seed ?? 1836,
                nationTag: playerNation.tag,
              }).then((ok) => {
                setShareHint(ok ? 'Copied' : 'Copy failed');
                window.setTimeout(() => setShareHint(null), 2000);
              });
            }}
          >
            {shareHint ?? 'Share'}
          </button>
          <button type="button" onClick={() => setShowMainMenu(true)}>Menu</button>
        </div>
      </header>

      <nav className="hud-rail atlas-panel" aria-label="Panels" data-coach-id="panel-rail-desktop">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            data-testid={`panel-${panel.id}`}
            data-coach-id={panel.id === 'budget'
              ? 'panel-budget'
              : panel.id === 'production'
                ? 'panel-production'
                : panel.id === 'politics'
                  ? 'panel-politics'
                  : panel.id === 'diplomacy'
                    ? 'panel-diplomacy'
                    : panel.id === 'military'
                      ? 'panel-military'
                      : panel.id === 'save_load'
                        ? 'panel-save-load'
                        : undefined}
            className={openPanel === panel.id ? 'is-active' : ''}
            onClick={() => openPanelId(openPanel === panel.id ? null : panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </nav>

      <nav className="hud-mapmodes atlas-panel" aria-label="Map mode" data-coach-id="mapmodes-desktop">
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

      <header className="hud-mobile-top atlas-panel" aria-label="Mobile controls">
        <div className="hud-mobile-top__date">
          <span className="atlas-heading">Date</span>
          <strong>{formattedDate}</strong>
        </div>
        <div className="hud-mobile-top__speed" data-coach-id="speed-controls-mobile">
          <button type="button" aria-label="Decrease speed" onClick={() => setSpeed(currentSpeed - 1)}>-</button>
          <button type="button" onClick={() => setSpeed(currentSpeed === 0 ? 3 : 0)}>{currentSpeed === 0 ? 'Play' : 'Pause'}</button>
          <button type="button" aria-label="Increase speed" onClick={() => setSpeed(currentSpeed + 1)}>+</button>
        </div>
        <div className="hud-mobile-top__nation">
          <span>{playerNation?.name ?? 'United Kingdom'}</span>
          <strong>{speedLabel(currentSpeed)} · {formatMoney(playerNation?.treasury ?? 0)}</strong>
        </div>
      </header>

      {mobilePanelsOpen ? (
        <nav className="hud-mobile-panel-drawer atlas-panel" aria-label="Panel drawer" data-coach-id="panel-rail-mobile">
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              data-testid={`panel-${panel.id}`}
              data-coach-id={panel.id === 'budget'
                ? 'panel-budget'
                : panel.id === 'production'
                  ? 'panel-production'
                  : panel.id === 'politics'
                    ? 'panel-politics'
                    : panel.id === 'diplomacy'
                      ? 'panel-diplomacy'
                      : panel.id === 'military'
                        ? 'panel-military'
                        : panel.id === 'save_load'
                          ? 'panel-save-load'
                          : undefined}
              className={openPanel === panel.id ? 'is-active' : ''}
              onClick={() => openPanelId(openPanel === panel.id ? null : panel.id)}
            >
              {panel.label}
            </button>
          ))}
        </nav>
      ) : null}

      {mobileMapModesOpen ? (
        <nav className="hud-mobile-mapmodes atlas-panel" aria-label="Map mode drawer" data-coach-id="mapmodes-mobile-drawer">
          {MAP_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={mapMode === mode.id ? 'is-active' : ''}
              onClick={() => {
                setMapMode(mode.id);
                setMobileMapModesOpen(false);
              }}
            >
              {mode.label}
            </button>
          ))}
        </nav>
      ) : null}

      <nav className="hud-mobile-bottom atlas-panel" aria-label="Mobile primary navigation">
        <button type="button" className={mobilePanelsOpen ? 'is-active' : ''} data-coach-id="panels-mobile-toggle" onClick={toggleMobilePanels}>Panels</button>
        <button type="button" className={mobileMapModesOpen ? 'is-active' : ''} data-coach-id="mapmodes-mobile-toggle" onClick={toggleMobileMapModes}>Map</button>
        <button type="button" onClick={() => setMuteAudio(!muteAudio)}>{muteAudio ? 'Unmute' : 'Mute'}</button>
        <button type="button" onClick={() => setShowMainMenu(true)}>Menu</button>
      </nav>
    </>
  );
}
