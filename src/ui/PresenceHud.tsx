/**
 * In-session multiplayer presence (MP-M5).
 * Shows connected/disconnected players and their nation seats.
 */

import { useStore } from '../store';
import type { PresencePlayer } from '../net/sessionProtocol';

function presenceList(
  presence: PresencePlayer[],
  lobbyPlayers: { clientId: string; name: string; nationTag: string | null; team: number | null; leader: boolean }[],
): PresencePlayer[] {
  if (presence.length > 0) return presence;
  return lobbyPlayers.map((p) => ({
    clientId: p.clientId,
    name: p.name,
    nationTag: p.nationTag,
    team: p.team,
    leader: p.leader,
    connected: true,
  }));
}

export function PresenceHud() {
  const multiplayer = useStore((s) => s.multiplayer);
  const presence = useStore((s) => s.mpPresence);
  const players = useStore((s) => s.mpPlayers);
  const mode = useStore((s) => s.mpMode);
  const sessionId = useStore((s) => s.mpSessionId);

  const list = presenceList(presence, players);
  if (!multiplayer || list.length === 0) return null;

  return (
    <aside className="presence-hud atlas-panel" data-testid="presence-hud" aria-label="Multiplayer presence">
      <h2 className="atlas-heading">Players</h2>
      <p className="presence-hud__meta">
        {mode ?? 'mp'}
        {sessionId ? ` · ${sessionId}` : ''}
      </p>
      <ul>
        {list.map((p) => (
          <li key={p.clientId} className={p.connected ? undefined : 'is-disconnected'} data-connected={p.connected ? '1' : '0'}>
            <span className="presence-hud__dot" aria-hidden />
            <span>{p.name}{p.leader ? ' ★' : ''}</span>
            <span className="presence-hud__seat">
              {mode === 'coop' && p.team != null ? `T${p.team} ` : ''}
              {p.nationTag ?? '—'}
              {!p.connected ? ' (away)' : ''}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
