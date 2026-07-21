import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { buildShareUrl, copyShareLink, parseStartHash } from './permalink';

export function MainMenu() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);
  const setShowMainMenu = useStore((state) => state.setShowMainMenu);
  const setShowLobby = useStore((state) => state.setShowLobby);
  const multiplayer = useStore((state) => state.multiplayer);
  const hashStart = useMemo(() => parseStartHash(), []);
  const [seedInput, setSeedInput] = useState(() => String(hashStart?.seed ?? snapshot?.seed ?? 1836));
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const nations = useMemo(() => (snapshot?.nations ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [snapshot]);
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

  if (!snapshot) return null;

  const selectedTag = nations.find((nation) => nation.id === selectedNation)?.tag
    ?? snapshot.nations.find((nation) => nation.id === selectedNation)?.tag
    ?? 'ENG';

  const startGame = () => {
    if (multiplayer) {
      // In an active MP session, Continue just closes the menu.
      setShowMainMenu(false);
      return;
    }
    const parsedSeed = Number(seedInput);
    const seed = Number.isFinite(parsedSeed) ? Math.max(1, Math.floor(parsedSeed)) : 1836;
    sendCommand({ t: 'newGame', seed, playerNation: selectedNation });
    const tag = nations.find((nation) => nation.id === selectedNation)?.tag ?? selectedTag;
    window.location.hash = `#/new?seed=${seed}&nation=${encodeURIComponent(tag)}`;
    setShowMainMenu(false);
  };

  const onCopyShare = async () => {
    const parsedSeed = Number(seedInput);
    const seed = Number.isFinite(parsedSeed) ? Math.max(1, Math.floor(parsedSeed)) : 1836;
    const ok = await copyShareLink({ seed, nationTag: selectedTag });
    setShareStatus(ok ? 'Link copied.' : buildShareUrl({ seed, nationTag: selectedTag }));
    window.setTimeout(() => setShareStatus(null), 3500);
  };

  const openMultiplayer = () => {
    setShowMainMenu(false);
    setShowLobby(true);
  };

  return (
    <div className="menu-overlay">
      <section className="menu-card atlas-panel">
        <h1 className="atlas-heading">Grand Century</h1>
        <p>{multiplayer ? 'Multiplayer session in progress.' : 'Select a nation and begin a new campaign.'}</p>
        {!multiplayer ? (
          <>
            <label>
              Nation
              <select className="gc-select" data-testid="menu-nation-select" value={selectedNation} onChange={(event) => setSelectedNation(Number(event.target.value))}>
                {nations.map((nation) => (
                  <option key={nation.id} value={nation.id}>
                    {nation.name} ({nation.tag})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seed
              <input className="gc-input" data-testid="menu-seed-input" value={seedInput} onChange={(event) => setSeedInput(event.target.value)} />
            </label>
          </>
        ) : null}
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
            Continue
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
      </section>
    </div>
  );
}
