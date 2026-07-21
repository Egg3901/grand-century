/**
 * Multiplayer lobby UI (MP-M2): browse/create sessions, pick nation/team, ready, start.
 * Matches the atlas design system (theme.css / menu-card).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { attachTransport } from '../bootTransport';
import { LobbyClient } from '../net/lobbyClient';
import { buildLobbyInviteUrl } from '../net/mpJoin';
import type { LobbyStateMessage, SessionListEntry, SessionMode } from '../net/sessionProtocol';
import { useStore } from '../store';

type LobbyView = 'browser' | 'room';

export interface LobbyScreenProps {
  /** Pre-join this session id (from `#/lobby?session=`). */
  initialSessionId?: string | null;
}

export function LobbyScreen({ initialSessionId = null }: LobbyScreenProps) {
  const setShowLobby = useStore((s) => s.setShowLobby);
  const setShowMainMenu = useStore((s) => s.setShowMainMenu);
  const setMultiplayerMeta = useStore((s) => s.setMultiplayerMeta);

  const clientRef = useRef<LobbyClient | null>(null);
  const startedRef = useRef(false);
  const [view, setView] = useState<LobbyView>(initialSessionId ? 'room' : 'browser');
  const [lobby, setLobby] = useState<LobbyStateMessage | null>(null);
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [inviteHint, setInviteHint] = useState<string | null>(null);

  const [playerName, setPlayerName] = useState('Player');
  const [createName, setCreateName] = useState('Grand Session');
  const [createSeed, setCreateSeed] = useState('1836');
  const [createMode, setCreateMode] = useState<SessionMode>('competitive');
  const [createMax, setCreateMax] = useState('4');

  const you = lobby?.you ?? null;
  const self = useMemo(
    () => lobby?.players.find((p) => p.clientId === you) ?? null,
    [lobby, you],
  );
  const isLeader = Boolean(self?.leader);
  const taken = useMemo(() => new Set(lobby?.takenNations ?? []), [lobby]);

  const canStart = useMemo(() => {
    if (!lobby || lobby.phase !== 'lobby' || !isLeader) return false;
    if (lobby.players.length === 0) return false;
    return lobby.players.every((p) => {
      if (!p.nationTag || !p.ready) return false;
      if (lobby.mode === 'coop' && p.team == null) return false;
      return true;
    });
  }, [lobby, isLeader]);

  const bindClient = (client: LobbyClient) => {
    client.onLobbyState((state) => {
      setLobby(state);
      setView('room');
      setMultiplayerMeta({
        multiplayer: true,
        sessionId: state.sessionId,
        mode: state.mode,
        isLeader: state.players.some((p) => p.clientId === state.you && p.leader),
        players: state.players,
      });
      if (state.phase === 'running' && !startedRef.current) {
        startedRef.current = true;
        attachTransport(client);
        setShowLobby(false);
        setShowMainMenu(false);
        const tag = state.players.find((p) => p.clientId === state.you)?.nationTag ?? 'ENG';
        window.location.hash = `#/mp?session=${encodeURIComponent(state.sessionId)}&nation=${encodeURIComponent(tag)}&seed=${state.seed}`;
      }
    });
    client.onSessionList((list) => setSessions(list));
    client.onLobbyError((msg) => {
      setStatus(msg);
      window.setTimeout(() => setStatus(null), 4000);
    });
  };

  const ensureClient = (): LobbyClient => {
    if (clientRef.current) return clientRef.current;
    const client = new LobbyClient({ playerName: playerName.trim() || 'Player' });
    clientRef.current = client;
    bindClient(client);
    return client;
  };

  // Invite deep-link + lobby list polling. Client is created once (lazy) and kept
  // for the lifetime of this overlay so StrictMode doesn't drop the game socket.
  useEffect(() => {
    const client = ensureClient();
    client.listSessions();
    if (initialSessionId) client.joinLobby(initialSessionId);
    const poll = window.setInterval(() => client.listSessions(), 3000);
    return () => {
      window.clearInterval(poll);
      const attached = useStore.getState().transport === client;
      if (!attached && !startedRef.current) {
        client.dispose();
        if (clientRef.current === client) clientRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per overlay open
  }, []);

  useEffect(() => {
    if (clientRef.current) clientRef.current.playerName = playerName.trim() || 'Player';
  }, [playerName]);

  const onCreate = () => {
    const seed = Number(createSeed);
    const maxPlayers = Number(createMax);
    ensureClient().createSession({
      name: createName,
      seed: Number.isFinite(seed) ? Math.max(1, Math.floor(seed)) : 1836,
      mode: createMode,
      maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : 4,
    });
  };

  const onCopyInvite = async () => {
    if (!lobby) return;
    const url = buildLobbyInviteUrl(lobby.sessionId);
    try {
      await navigator.clipboard.writeText(url);
      setInviteHint('Invite link copied.');
    } catch {
      setInviteHint(url);
    }
    window.setTimeout(() => setInviteHint(null), 4000);
  };

  const onBack = () => {
    const c = clientRef.current;
    if (c && useStore.getState().transport !== c) {
      c.leaveSession();
      c.dispose();
      clientRef.current = null;
    }
    setLobby(null);
    setView('browser');
    setMultiplayerMeta({ multiplayer: false, sessionId: null, mode: null, isLeader: false, players: [] });
    setShowLobby(false);
    setShowMainMenu(true);
  };

  const nationOptions = lobby?.nations ?? [];

  return (
    <div className="menu-overlay" data-testid="lobby-overlay">
      <section className={`menu-card atlas-panel lobby-card${view === 'room' ? ' lobby-card--room' : ''}`}>
        <h1 className="atlas-heading">Multiplayer</h1>

        {view === 'browser' ? (
          <>
            <p>Create a private lobby or join an open session.</p>
            <label>
              Your name
              <input
                className="gc-input"
                data-testid="lobby-player-name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </label>

            <div className="lobby-section">
              <h2 className="atlas-heading lobby-section__title">Create session</h2>
              <label>
                Name
                <input className="gc-input" data-testid="lobby-create-name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
              </label>
              <label>
                Seed
                <input className="gc-input" data-testid="lobby-create-seed" value={createSeed} onChange={(e) => setCreateSeed(e.target.value)} />
              </label>
              <label>
                Mode
                <select
                  className="gc-select"
                  data-testid="lobby-create-mode"
                  value={createMode}
                  onChange={(e) => setCreateMode(e.target.value as SessionMode)}
                >
                  <option value="competitive">Competitive (one nation each)</option>
                  <option value="coop">Co-op (teams vs AI)</option>
                </select>
              </label>
              <label>
                Max players
                <select className="gc-select" data-testid="lobby-create-max" value={createMax} onChange={(e) => setCreateMax(e.target.value)}>
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn--primary" data-testid="lobby-create" onClick={onCreate}>
                Create lobby
              </button>
            </div>

            <div className="lobby-section">
              <h2 className="atlas-heading lobby-section__title">Open lobbies</h2>
              {sessions.length === 0 ? (
                <p className="lobby-empty">No open sessions. Create one to begin.</p>
              ) : (
                <ul className="lobby-session-list" data-testid="lobby-session-list">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <div>
                        <strong>{s.name}</strong>
                        <span className="lobby-meta">
                          {s.mode} · {s.playerCount}/{s.maxPlayers} · seed {s.seed}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        data-testid={`lobby-join-${s.id}`}
                        onClick={() => ensureClient().joinLobby(s.id)}
                      >
                        Join
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="btn btn--ghost" data-testid="lobby-refresh" onClick={() => ensureClient().listSessions()}>
                Refresh list
              </button>
            </div>
          </>
        ) : lobby ? (
          <>
            <p>
              {lobby.name} · {lobby.mode} · seed {lobby.seed}
            </p>
            <ul className="lobby-player-list" data-testid="lobby-player-list">
              {lobby.players.map((p) => (
                <li key={p.clientId} className={p.clientId === you ? 'is-you' : undefined}>
                  <span>
                    {p.name}
                    {p.leader ? ' (leader)' : ''}
                    {p.clientId === you ? ' — you' : ''}
                  </span>
                  <span className="lobby-meta">
                    {lobby.mode === 'coop' && p.team != null ? `Team ${p.team} · ` : ''}
                    {p.nationTag ?? '—'}
                    {p.ready ? ' · ready' : ''}
                  </span>
                </li>
              ))}
            </ul>

            {lobby.mode === 'coop' ? (
              <label>
                Team
                <select
                  className="gc-select"
                  data-testid="lobby-team-select"
                  value={self?.team ?? 1}
                  onChange={(e) => ensureClient().selectTeam(Number(e.target.value))}
                >
                  {[1, 2, 3, 4].map((t) => (
                    <option key={t} value={t}>Team {t}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              Nation
              <select
                className="gc-select"
                data-testid="lobby-nation-select"
                value={self?.nationTag ?? ''}
                onChange={(e) => ensureClient().selectNation(e.target.value)}
              >
                <option value="" disabled>Select a nation…</option>
                {nationOptions.map((n) => {
                  const blocked = taken.has(n.tag) && self?.nationTag !== n.tag;
                  return (
                    <option key={n.tag} value={n.tag} disabled={blocked}>
                      {n.name} ({n.tag}){blocked ? ' — taken' : ''}
                    </option>
                  );
                })}
              </select>
            </label>

            <div className="menu-actions">
              <button
                type="button"
                className={`btn ${self?.ready ? 'btn--secondary is-active' : 'btn--secondary'}`}
                data-testid="lobby-ready"
                onClick={() => ensureClient().setReady(!self?.ready)}
              >
                {self?.ready ? 'Unready' : 'Ready'}
              </button>
              {isLeader ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  data-testid="lobby-start"
                  disabled={!canStart}
                  onClick={() => ensureClient().leaderStart()}
                >
                  Start
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost" data-testid="lobby-copy-invite" onClick={() => { void onCopyInvite(); }}>
                Copy invite link
              </button>
            </div>
            {inviteHint ? <p className="menu-share-status" data-testid="lobby-invite-status">{inviteHint}</p> : null}
          </>
        ) : (
          <p className="lobby-empty">Connecting to lobby…</p>
        )}

        {status ? <p className="menu-share-status" data-testid="lobby-status">{status}</p> : null}

        <div className="menu-actions">
          <button type="button" className="btn btn--ghost" data-testid="lobby-back" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    </div>
  );
}
