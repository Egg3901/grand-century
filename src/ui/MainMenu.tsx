import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useSnapshotFields } from './useSnapshotFields';
import { APP_RELEASE, VERSION_LABEL } from '../buildInfo';
import { buildShareUrl, copyShareLink, parseStartHash } from './permalink';
import { NationFlag } from './components/NationFlag';
import {
  CAMPAIGN_MAP_MODES,
  DEFAULT_CAMPAIGN_MAP_MODE,
  parseCampaignMapMode,
  type CampaignMapMode,
} from '../shared/campaignMap';

function yearFromDay(day: number): number {
  return 1820 + Math.floor(day / 365);
}

function randomSeed(): number {
  return Math.floor(Math.random() * 899999) + 100000;
}

function parseSeed(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1836;
}

export function MainMenu() {
  const snapshot = useSnapshotFields(['nations', 'seed', 'mapMode', 'provinces', 'playerNation'] as const);
  const sendCommand = useStore((state) => state.sendCommand);
  const setShowMainMenu = useStore((state) => state.setShowMainMenu);
  const setShowLobby = useStore((state) => state.setShowLobby);
  const multiplayer = useStore((state) => state.multiplayer);
  const saveSlots = useStore((state) => state.saveSlots);
  const hashStart = useMemo(() => parseStartHash(), []);
  const [seedInput, setSeedInput] = useState(() => String(hashStart?.seed ?? snapshot?.seed ?? 1836));
  const [mapMode, setMapMode] = useState<CampaignMapMode>(() => parseCampaignMapMode(hashStart?.mode ?? snapshot?.mapMode));
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [nationFilter, setNationFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    sendCommand({ t: 'listSaves' });
  }, [sendCommand]);

  const nations = useMemo(
    () => (snapshot?.nations ?? []).slice().sort((a, b) => {
      const rankA = a.gpRank > 0 ? a.gpRank : 999;
      const rankB = b.gpRank > 0 ? b.gpRank : 999;
      return rankA - rankB || b.powerScore - a.powerScore || a.name.localeCompare(b.name);
    }),
    [snapshot?.nations],
  );

  const provinceCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const province of snapshot?.provinces ?? []) {
      counts.set(province.owner, (counts.get(province.owner) ?? 0) + 1);
    }
    return counts;
  }, [snapshot?.provinces]);

  const filteredNations = useMemo(() => {
    const query = nationFilter.trim().toLowerCase();
    if (!query) return nations;
    return nations.filter((nation) =>
      nation.name.toLowerCase().includes(query) || nation.tag.toLowerCase().includes(query));
  }, [nations, nationFilter]);

  const defaultNation = useMemo(() => {
    if (hashStart?.nationTag) {
      const match = nations.find((nation) => nation.tag === hashStart.nationTag);
      if (match) return match.id;
    }
    return snapshot?.playerNation ?? 0;
  }, [hashStart, nations, snapshot?.playerNation]);
  const [selectedNation, setSelectedNation] = useState<number>(defaultNation);
  const syncedHashNation = useRef(false);

  useEffect(() => {
    if (syncedHashNation.current || !hashStart?.nationTag || nations.length === 0) return;
    const match = nations.find((nation) => nation.tag === hashStart.nationTag);
    if (match) {
      setSelectedNation(match.id);
      syncedHashNation.current = true;
    }
  }, [hashStart, nations]);

  const latestSave = saveSlots[0] ?? null;
  const latestSaveNation = latestSave
    ? (snapshot?.nations.find((nation) => nation.id === latestSave.playerNation) ?? null)
    : null;

  // Procedural previews replace the nation list — keep the selection valid.
  useEffect(() => {
    if (!snapshot || nations.length === 0) return;
    if (nations.some((nation) => nation.id === selectedNation)) return;
    setSelectedNation(snapshot.playerNation ?? nations[0]?.id ?? 0);
  }, [snapshot?.playerNation, nations, selectedNation]);

  if (!snapshot) return null;

  const selectedTag = nations.find((nation) => nation.id === selectedNation)?.tag
    ?? snapshot.nations.find((nation) => nation.id === selectedNation)?.tag
    ?? 'ENG';

  const parsedSeed = () => parseSeed(seedInput);

  const mapModeBlurb = CAMPAIGN_MAP_MODES.find((entry) => entry.id === mapMode)?.blurb ?? '';

  const previewWorld = (nextMode: CampaignMapMode, nextSeed: number, playerNation = selectedNation) => {
    sendCommand({ t: 'newGame', seed: nextSeed, playerNation, mapMode: nextMode });
  };

  const startGame = () => {
    if (multiplayer) {
      // In an active MP session, Continue just closes the menu.
      setShowMainMenu(false);
      return;
    }
    const seed = parsedSeed();
    sendCommand({ t: 'newGame', seed, playerNation: selectedNation, mapMode });
    const tag = nations.find((nation) => nation.id === selectedNation)?.tag ?? selectedTag;
    const modeQuery = mapMode === DEFAULT_CAMPAIGN_MAP_MODE ? '' : `&mode=${encodeURIComponent(mapMode)}`;
    window.location.hash = `#/new?seed=${seed}&nation=${encodeURIComponent(tag)}${modeQuery}`;
    setShowMainMenu(false);
  };

  const resumeLatest = () => {
    if (!latestSave) return;
    sendCommand({ t: 'load', slot: latestSave.slot });
    setShowMainMenu(false);
  };

  const onCopyShare = async () => {
    const seed = parsedSeed();
    const params = {
      seed,
      nationTag: selectedTag,
      mode: mapMode === DEFAULT_CAMPAIGN_MAP_MODE ? undefined : mapMode,
    };
    const ok = await copyShareLink(params);
    setShareStatus(ok ? 'Link copied.' : buildShareUrl(params));
    window.setTimeout(() => setShareStatus(null), 3500);
  };

  const openMultiplayer = () => {
    setShowMainMenu(false);
    setShowLobby(true);
  };

  const flavorLine = (nationId: number, gpRank: number, government: string): string => {
    const provinces = provinceCounts.get(nationId) ?? 0;
    const gp = gpRank > 0 && gpRank <= 8 ? `Great Power #${gpRank}` : null;
    const gov = government.replaceAll('_', ' ');
    return [gp, `${provinces} provinces`, gov].filter(Boolean).join(' · ');
  };

  return (
    <div className="menu-overlay menu-overlay--hero">
      <section className="menu-card menu-card--title atlas-panel">
        <header className="menu-title">
          <h1 className="menu-title__name">Grand Century</h1>
          <p className="menu-title__rule" aria-hidden="true" />
          <p className="menu-title__tag">An atlas of the long nineteenth century · 1820–1920</p>
        </header>

        {multiplayer ? (
          <p className="menu-note">Multiplayer session in progress.</p>
        ) : (
          <>
            {!multiplayer && latestSave && latestSaveNation ? (
              <button
                type="button"
                className="menu-resume"
                data-testid="menu-resume"
                onClick={resumeLatest}
              >
                <span className="menu-resume__shield">
                  <NationFlag tag={latestSaveNation.tag} color={latestSaveNation.color} size={26} />
                </span>
                <span className="menu-resume__text">
                  <span className="menu-resume__action">Continue — {latestSaveNation.name}</span>
                  <span className="menu-resume__detail">
                    {yearFromDay(latestSave.day)} · {latestSave.slot.replace(/^autosave-/, 'autosave ')}
                  </span>
                </span>
              </button>
            ) : null}

            <div className="menu-browser">
              <div className="menu-browser__bar">
                <span className="menu-browser__label">Choose your nation</span>
                <input
                  className="gc-input menu-browser__search"
                  data-testid="menu-nation-search"
                  placeholder="Search…"
                  value={nationFilter}
                  onChange={(event) => setNationFilter(event.target.value)}
                />
              </div>
              <div className="menu-browser__grid" data-testid="menu-nation-grid" role="listbox" aria-label="Nations">
                {filteredNations.map((nation) => (
                  <button
                    key={nation.id}
                    type="button"
                    role="option"
                    aria-selected={nation.id === selectedNation}
                    className={`nation-card${nation.id === selectedNation ? ' nation-card--selected' : ''}`}
                    data-testid={`menu-nation-${nation.tag}`}
                    onClick={() => setSelectedNation(nation.id)}
                    onDoubleClick={startGame}
                  >
                    <span className="nation-card__shield">
                      <NationFlag tag={nation.tag} color={nation.color} size={30} />
                    </span>
                    <span className="nation-card__name">{nation.name}</span>
                    <span className="nation-card__flavor">{flavorLine(nation.id, nation.gpRank, nation.government)}</span>
                  </button>
                ))}
                {filteredNations.length === 0 ? (
                  <p className="menu-browser__empty">No nation matches “{nationFilter}”.</p>
                ) : null}
              </div>
            </div>

            <div className="menu-advanced">
              <button
                type="button"
                className="menu-advanced__toggle"
                data-testid="menu-advanced-toggle"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced((open) => !open)}
              >
                Advanced {showAdvanced ? '▾' : '▸'}
              </button>
              {showAdvanced ? (
                <div className="menu-advanced__body">
                  <label>
                    Map
                    <select
                      className="gc-select"
                      data-testid="menu-map-mode-select"
                      value={mapMode}
                      onChange={(event) => {
                        const next = parseCampaignMapMode(event.target.value);
                        setMapMode(next);
                        previewWorld(next, parsedSeed());
                      }}
                    >
                      {CAMPAIGN_MAP_MODES.map((mode) => (
                        <option key={mode.id} value={mode.id}>
                          {mode.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="menu-map-blurb" data-testid="menu-map-mode-blurb">{mapModeBlurb}</p>
                  <label>
                    Seed
                    <span className="menu-advanced__seed-row">
                      <input className="gc-input" data-testid="menu-seed-input" value={seedInput} onChange={(event) => setSeedInput(event.target.value)} />
                      <button
                        type="button"
                        className="btn btn--ghost menu-advanced__dice"
                        title="Reroll seed"
                        data-testid="menu-seed-dice"
                        onClick={() => setSeedInput(String(randomSeed()))}
                      >
                        Reroll
                      </button>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
          </>
        )}

        <div className="menu-actions">
          {!multiplayer ? (
            <button
              type="button"
              className="btn btn--primary"
              data-testid="menu-new-game"
              onClick={startGame}
            >
              New Game
            </button>
          ) : null}
          <button type="button" className="btn btn--secondary" onClick={() => setShowMainMenu(false)}>
            Return to Map
          </button>
          {!multiplayer ? (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                data-testid="menu-replay-tutorial"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('gc:replay-tutorial'));
                  setShowMainMenu(false);
                }}
              >
                Replay Tutorial
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                data-testid="menu-copy-share"
                onClick={() => { void onCopyShare(); }}
              >
                Copy share link
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                data-testid="menu-multiplayer"
                onClick={openMultiplayer}
              >
                Multiplayer
              </button>
            </>
          ) : null}
        </div>
        {shareStatus ? <p className="menu-share-status" data-testid="menu-share-status">{shareStatus}</p> : null}
        <p className="menu-version" data-testid="menu-version" title={APP_RELEASE}>{VERSION_LABEL}</p>
      </section>
    </div>
  );
}
