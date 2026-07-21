/**
 * In-session multiplayer presence (MP-M2).
 * Shows connected players and their nation/team seats.
 */

import { useStore } from '../store';

export function PresenceHud() {
  const multiplayer = useStore((s) => s.multiplayer);
  const players = useStore((s) => s.mpPlayers);
  const mode = useStore((s) => s.mpMode);
  const sessionId = useStore((s) => s.mpSessionId);

  if (!multiplayer || players.length === 0) return null;

  return (
    <aside className="presence-hud atlas-panel" data-testid="presence-hud" aria-label="Multiplayer presence">
      <h2 className="atlas-heading">Players</h2>
      <p className="presence-hud__meta">
        {mode ?? 'mp'}
        {sessionId ? ` · ${sessionId}` : ''}
      </p>
      <ul>
        {players.map((p) => (
          <li key={p.clientId}>
            <span>{p.name}{p.leader ? ' ★' : ''}</span>
            <span className="presence-hud__seat">
              {mode === 'coop' && p.team != null ? `T${p.team} ` : ''}
              {p.nationTag ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
