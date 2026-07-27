import { useEffect, useMemo, useState } from 'react';
import { useStore, type MapMode, type PanelId } from '../store';
import { useSnapshotFields } from './useSnapshotFields';
import { copyShareLink } from './permalink';
import { instantPressProps } from './instantPress';
import { NationFlag } from './components/NationFlag';
import './Hud.css';

const SPEEDS = [0, 1, 2, 3, 4, 5] as const;
const PANELS: { id: PanelId; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'production', label: 'Production' },
  { id: 'population', label: 'Population' },
  { id: 'cultures', label: 'Cultures' },
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
  { id: 'culture', label: 'Culture' },
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

function panelCoachId(id: PanelId): string | undefined {
  if (id === 'budget') return 'panel-budget';
  if (id === 'production') return 'panel-production';
  if (id === 'politics') return 'panel-politics';
  if (id === 'diplomacy') return 'panel-diplomacy';
  if (id === 'military') return 'panel-military';
  if (id === 'save_load') return 'panel-save-load';
  return undefined;
}

export function Hud() {
  const snapshot = useSnapshotFields([
    'nations',
    'playerNation',
    'playerBudget',
    'speed',
    'date',
    'playerTech',
    'infamyLimit',
    'playerBalanceOfPower',
    'seed',
  ] as const);
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
  /** Optimistic speed so Play/Pause reacts before the worker snapshot returns. */
  const [optimisticSpeed, setOptimisticSpeed] = useState<number | null>(null);

  const playerNation = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.nations.find((nation) => nation.id === snapshot.playerNation) ?? null;
  }, [snapshot?.nations, snapshot?.playerNation]);
  const monthlyNet = snapshot?.playerBudget?.net ?? 0;
  const snapshotSpeed = snapshot?.speed ?? 0;
  const currentSpeed = optimisticSpeed ?? snapshotSpeed;
  const formattedDate = snapshot
    ? `${snapshot.date.year}-${String(snapshot.date.month).padStart(2, '0')}-${String(snapshot.date.day).padStart(2, '0')}`
    : '1820-01-01';
  const researchChip = useMemo(() => {
    const tech = snapshot?.playerTech;
    if (!tech) return null;
    const currentName = tech.current
      ? (tech.statuses.find((status) => status.key === tech.current)?.name ?? tech.current)
      : null;
    return {
      points: tech.researchPoints,
      label: currentName ?? 'Idle',
      title: currentName
        ? `Open Technology — researching ${currentName}`
        : 'Open Technology — no active research',
    };
  }, [snapshot?.playerTech]);

  const panels = useMemo(
    () => (multiplayer ? PANELS.filter((p) => p.id !== 'save_load') : PANELS),
    [multiplayer],
  );
  const canControlSpeed = !multiplayer || mpIsLeader;

  useEffect(() => {
    if (openPanel) setMobilePanelsOpen(false);
  }, [openPanel]);

  useEffect(() => {
    if (optimisticSpeed === null) return;
    if (snapshotSpeed === optimisticSpeed) setOptimisticSpeed(null);
  }, [snapshotSpeed, optimisticSpeed]);

  const setSpeed = (speed: number) => {
    if (!canControlSpeed) return;
    const clamped = Math.max(0, Math.min(MAX_SPEED, speed));
    setOptimisticSpeed(clamped);
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

  const togglePanel = (id: Exclude<PanelId, null>) => {
    openPanelId(openPanel === id ? null : id);
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
              {...instantPressProps(() => setSpeed(speed))}
            >
              {speedLabel(speed)}
            </button>
          ))}
        </div>
        <div className="hud-top__section hud-top__nation" data-coach-id="hud-nation">
          {playerNation ? <NationFlag tag={playerNation.tag} color={playerNation.color} size={24} /> : null}
          <span className="atlas-heading">{playerNation?.name ?? 'United Kingdom'}</span>
          <strong>{formatMoney(playerNation?.treasury ?? 0)}</strong>
          <span className={`hud-monthly-net ${monthlyNet >= 0 ? 'is-positive' : 'is-negative'}`}>
            {monthlyNet >= 0 ? '+' : ''}{formatMoney(monthlyNet)}/mo
          </span>
          <span className={`hud-infamy ${playerNation && snapshot && playerNation.infamy >= snapshot.infamyLimit ? 'is-danger' : ''}`}>
            Infamy {(playerNation?.infamy ?? 0).toFixed(1)}
            {snapshot ? ` / ${snapshot.infamyLimit.toFixed(1)}` : ''}
          </span>
          {researchChip ? (
            <button
              type="button"
              className="hud-research"
              data-testid="hud-research"
              title={researchChip.title}
              {...instantPressProps(() => togglePanel('technology'))}
            >
              RP {researchChip.points.toFixed(0)}
              {' · '}
              {researchChip.label}
            </button>
          ) : null}
          {snapshot?.playerBalanceOfPower ? (
            <span
              className={`hud-infamy ${snapshot.playerBalanceOfPower.rivalryThreat ? 'is-danger' : ''}`}
              title={`${snapshot.playerBalanceOfPower.formableName}: GPs lose ${snapshot.playerBalanceOfPower.monthlyOpinionHit}/mo opinion`}
            >
              BoP {(snapshot.playerBalanceOfPower.share * 100).toFixed(0)}%
            </span>
          ) : null}
          <button type="button" {...instantPressProps(() => setMuteAudio(!muteAudio))}>{muteAudio ? 'Unmute' : 'Mute'}</button>
          <button
            type="button"
            data-testid="hud-copy-share"
            title={shareHint ?? 'Copy share link'}
            {...instantPressProps(() => {
              if (!playerNation) return;
              void copyShareLink({
                seed: snapshot?.seed ?? 1836,
                nationTag: playerNation.tag,
              }).then((ok) => {
                setShareHint(ok ? 'Copied' : 'Copy failed');
                window.setTimeout(() => setShareHint(null), 2000);
              });
            })}
          >
            {shareHint ?? 'Share'}
          </button>
          <button type="button" {...instantPressProps(() => setShowMainMenu(true))}>Menu</button>
        </div>
      </header>

      <nav className="hud-rail atlas-panel" aria-label="Panels" data-coach-id="panel-rail-desktop">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            data-testid={`panel-${panel.id}`}
            data-coach-id={panelCoachId(panel.id)}
            className={openPanel === panel.id ? 'is-active' : ''}
            {...instantPressProps(() => togglePanel(panel.id as Exclude<PanelId, null>))}
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
            {...instantPressProps(() => setMapMode(mode.id))}
          >
            {mode.label}
          </button>
        ))}
      </nav>

      <header className="hud-mobile-top atlas-panel" aria-label="Mobile controls">
        <div className="hud-mobile-top__date">
          <span className="atlas-heading">Date</span>
          <strong data-testid="hud-date-mobile">{formattedDate}</strong>
        </div>
        <div className="hud-mobile-top__speed" data-coach-id="speed-controls-mobile">
          <button type="button" aria-label="Decrease speed" data-testid="mobile-speed-down" {...instantPressProps(() => setSpeed(currentSpeed - 1))}>-</button>
          <button type="button" data-testid="mobile-speed-toggle" {...instantPressProps(() => setSpeed(currentSpeed === 0 ? 3 : 0))}>{currentSpeed === 0 ? 'Play' : 'Pause'}</button>
          <button type="button" aria-label="Increase speed" data-testid="mobile-speed-up" {...instantPressProps(() => setSpeed(currentSpeed + 1))}>+</button>
        </div>
        <div className="hud-mobile-top__nation">
          {playerNation ? <NationFlag tag={playerNation.tag} color={playerNation.color} size={18} /> : null}
          <span>{playerNation?.name ?? 'United Kingdom'}</span>
          <strong>{speedLabel(currentSpeed)} · {formatMoney(playerNation?.treasury ?? 0)}</strong>
          <span className={`hud-monthly-net ${monthlyNet >= 0 ? 'is-positive' : 'is-negative'}`}>
            {monthlyNet >= 0 ? '+' : ''}{formatMoney(monthlyNet)}/mo
          </span>
        </div>
      </header>

      {mobilePanelsOpen ? (
        <nav className="hud-mobile-panel-drawer atlas-panel" aria-label="Panel drawer" data-coach-id="panel-rail-mobile" data-testid="mobile-panel-drawer">
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              data-testid={`mobile-panel-${panel.id}`}
              data-coach-id={panelCoachId(panel.id)}
              className={openPanel === panel.id ? 'is-active' : ''}
              {...instantPressProps(() => togglePanel(panel.id as Exclude<PanelId, null>))}
            >
              {panel.label}
            </button>
          ))}
        </nav>
      ) : null}

      {mobileMapModesOpen ? (
        <nav className="hud-mobile-mapmodes atlas-panel" aria-label="Map mode drawer" data-coach-id="mapmodes-mobile-drawer" data-testid="mobile-mapmodes-drawer">
          {MAP_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={mapMode === mode.id ? 'is-active' : ''}
              {...instantPressProps(() => {
                setMapMode(mode.id);
                setMobileMapModesOpen(false);
              })}
            >
              {mode.label}
            </button>
          ))}
        </nav>
      ) : null}

      <nav className="hud-mobile-bottom atlas-panel" aria-label="Mobile primary navigation">
        <button
          type="button"
          className={mobilePanelsOpen ? 'is-active' : ''}
          data-testid="mobile-panels-toggle"
          data-coach-id="panels-mobile-toggle"
          {...instantPressProps(toggleMobilePanels)}
        >
          Panels
        </button>
        <button
          type="button"
          className={mobileMapModesOpen ? 'is-active' : ''}
          data-testid="mobile-mapmodes-toggle"
          data-coach-id="mapmodes-mobile-toggle"
          {...instantPressProps(toggleMobileMapModes)}
        >
          Map
        </button>
        <button type="button" data-testid="mobile-mute" {...instantPressProps(() => setMuteAudio(!muteAudio))}>{muteAudio ? 'Unmute' : 'Mute'}</button>
        <button type="button" data-testid="mobile-menu" {...instantPressProps(() => setShowMainMenu(true))}>Menu</button>
      </nav>
    </>
  );
}
