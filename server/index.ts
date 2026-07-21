/**
 * Grand Century session server (MP-M1 … MP-M5).
 *
 * Node + `ws`. Lobby + authoritative sim + diffed/compressed snapshots.
 *
 *   PORT=3412 npm run server
 *
 * HTTP:
 *   GET /           — health
 *   GET /sessions   — open lobbies (JSON)
 *   GET /stats      — bandwidth counters (JSON)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  isChatSendMessage,
  isLobbyClientMessage,
  isReconnectMessage,
  isSessionJoinMessage,
  isToWorkerMessage,
  type CreateSessionMessage,
  type ServerToClient,
  type SessionMode,
} from '../src/net/sessionProtocol.ts';
import { decodeWire, encodeWire } from '../src/net/snapshotCodec.ts';
import { SessionManager } from './session.ts';

const PORT = Number(process.env.PORT ?? 3412);

const manager = new SessionManager();

interface SocketState {
  clientId: string;
  sessionId: string | null;
}

let nextClientSeq = 1;

function send(ws: WebSocket, msg: ServerToClient, sessionId?: string | null): void {
  if (ws.readyState !== ws.OPEN) return;
  const payload = encodeWire(msg);
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload).length : payload.byteLength;
  if (sessionId) {
    manager.get(sessionId)?.recordWireBytes(bytes);
  }
  ws.send(payload);
}

function bindSend(ws: WebSocket, sessionId: string): (msg: ServerToClient) => void {
  return (msg) => send(ws, msg, sessionId);
}

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  const path = url.split('?')[0] ?? '/';

  if (req.method === 'GET' && (path === '/' || path === '')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Grand Century session server (MP-M5)\n');
    return;
  }

  if (req.method === 'GET' && path === '/sessions') {
    const sessions = manager.listOpenLobbies();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ sessions }));
    return;
  }

  if (req.method === 'GET' && path === '/stats') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ sessions: manager.collectStats() }));
    return;
  }

  if (req.method === 'OPTIONS' && (path === '/sessions' || path === '/stats')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found\n');
}

const httpServer = createServer((req, res) => {
  handleHttp(req, res);
});

const wss = new WebSocketServer({ server: httpServer });

function leaveCurrent(state: SocketState, hard = false): void {
  if (state.sessionId) {
    if (hard) manager.hardLeave(state.sessionId, state.clientId);
    else manager.leave(state.sessionId, state.clientId);
    state.sessionId = null;
  }
}

function handleCreateSession(ws: WebSocket, state: SocketState, msg: CreateSessionMessage): void {
  leaveCurrent(state, true);
  const mode: SessionMode = msg.mode === 'coop' ? 'coop' : 'competitive';
  const seed = Number.isFinite(msg.seed) ? Math.max(1, Math.floor(msg.seed)) : 1836;
  const session = manager.createLobby({
    name: msg.name,
    seed,
    mode,
    maxPlayers: msg.maxPlayers,
  });
  const result = session.joinLobby(state.clientId, msg.playerName, bindSend(ws, session.id));
  if (!result.ok) {
    send(ws, { t: 'log', level: 'error', msg: result.error ?? 'create failed' });
    manager.hardLeave(session.id, state.clientId);
    return;
  }
  state.sessionId = session.id;
  send(ws, { t: 'sessionCreated', sessionId: session.id }, session.id);
}

wss.on('connection', (ws) => {
  const state: SocketState = {
    clientId: `c${nextClientSeq++}`,
    sessionId: null,
  };

  // Tell the client its assigned id (for reconnect).
  send(ws, { t: 'log', level: 'info', msg: `clientId:${state.clientId}` });

  ws.on('message', (data, isBinary) => {
    let msg: unknown;
    try {
      if (isBinary) {
        msg = decodeWire(data as Buffer);
      } else {
        msg = JSON.parse(String(data));
      }
    } catch {
      send(ws, { t: 'log', level: 'error', msg: 'invalid JSON' });
      return;
    }

    // --- Reconnect --------------------------------------------------------
    if (isReconnectMessage(msg)) {
      leaveCurrent(state, true);
      const session = manager.get(msg.sessionId);
      if (!session) {
        send(ws, { t: 'log', level: 'error', msg: 'session not found' });
        return;
      }
      const reconnectId = msg.clientId;
      const result = session.reconnect(reconnectId, bindSend(ws, msg.sessionId));
      if (!result.ok) {
        send(ws, { t: 'log', level: 'error', msg: result.error ?? 'reconnect failed' });
        return;
      }
      state.clientId = reconnectId;
      state.sessionId = msg.sessionId;
      return;
    }

    // --- Chat -------------------------------------------------------------
    if (isChatSendMessage(msg)) {
      if (!state.sessionId) {
        send(ws, { t: 'log', level: 'warn', msg: 'not in a session' });
        return;
      }
      const session = manager.get(state.sessionId);
      if (!session) {
        send(ws, { t: 'log', level: 'error', msg: 'session gone' });
        return;
      }
      session.handleChat(state.clientId, msg.text);
      return;
    }

    // --- Lobby protocol -------------------------------------------------
    if (isLobbyClientMessage(msg)) {
      switch (msg.t) {
        case 'createSession':
          handleCreateSession(ws, state, msg);
          return;
        case 'listSessions':
          send(ws, { t: 'sessionList', sessions: manager.listOpenLobbies() });
          return;
        case 'joinLobby': {
          leaveCurrent(state, true);
          const session = manager.get(msg.sessionId);
          if (!session) {
            send(ws, { t: 'log', level: 'error', msg: 'session not found' });
            return;
          }
          const result = session.joinLobby(state.clientId, msg.playerName, bindSend(ws, msg.sessionId));
          if (!result.ok) {
            send(ws, { t: 'log', level: 'error', msg: result.error ?? 'join failed' });
            return;
          }
          state.sessionId = msg.sessionId;
          return;
        }
        case 'leaveSession':
          leaveCurrent(state, true);
          return;
        case 'selectNation':
        case 'selectTeam':
        case 'setReady':
        case 'leaderStart': {
          if (!state.sessionId) {
            send(ws, { t: 'log', level: 'warn', msg: 'not in a session' });
            return;
          }
          const session = manager.get(state.sessionId);
          if (!session) {
            send(ws, { t: 'log', level: 'error', msg: 'session gone' });
            return;
          }
          let result: { ok: boolean; error?: string };
          if (msg.t === 'selectNation') result = session.selectNation(state.clientId, msg.nation);
          else if (msg.t === 'selectTeam') result = session.selectTeam(state.clientId, msg.team);
          else if (msg.t === 'setReady') result = session.setReady(state.clientId, msg.ready);
          else result = session.leaderStart(state.clientId);
          if (!result.ok) {
            send(ws, { t: 'log', level: 'warn', msg: result.error ?? 'action failed' });
          }
          return;
        }
      }
    }

    // --- M1 join permalink ----------------------------------------------
    if (isSessionJoinMessage(msg)) {
      leaveCurrent(state, true);
      const seed = Number.isFinite(msg.seed) ? Math.max(1, Math.floor(msg.seed!)) : 1836;
      const existing = manager.get(msg.sessionId);
      const session = existing ?? manager.getOrCreate(msg.sessionId, seed);
      const result = session.join(state.clientId, msg.nation, bindSend(ws, msg.sessionId));
      if (!result.ok) {
        send(ws, { t: 'log', level: 'error', msg: result.error ?? 'join failed' });
        return;
      }
      state.sessionId = msg.sessionId;
      if (session.phase === 'lobby') {
        session.setReady(state.clientId, true);
      }
      return;
    }

    if (!state.sessionId) {
      send(ws, { t: 'log', level: 'warn', msg: 'send join or createSession before other messages' });
      return;
    }

    if (!isToWorkerMessage(msg)) {
      send(ws, { t: 'log', level: 'warn', msg: 'unknown message type' });
      return;
    }

    const session = manager.get(state.sessionId);
    if (!session) {
      send(ws, { t: 'log', level: 'error', msg: 'session gone' });
      return;
    }
    session.handleMessage(state.clientId, msg);
  });

  ws.on('close', () => {
    leaveCurrent(state, false);
  });
});

// Fixed-timestep loop (~30 Hz tick, snapshot cadence capped inside session).
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  manager.tickAll(dt);
}, 33);

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[grand-century-server] listening on ws://127.0.0.1:${PORT}`);
});
