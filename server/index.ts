/**
 * Grand Century session server (MP-M1).
 *
 * Node + `ws`. One sim instance per session; server-authoritative clock.
 * Protocol: session join envelope + ToWorker / FromWorker messages.
 *
 *   PORT=3412 npm run server
 */

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  isSessionJoinMessage,
  isToWorkerMessage,
  type ServerToClient,
} from '../src/net/sessionProtocol.ts';
import { SessionManager } from './session.ts';

const PORT = Number(process.env.PORT ?? 3412);

const manager = new SessionManager();

interface SocketState {
  clientId: string;
  sessionId: string | null;
}

let nextClientSeq = 1;

function send(ws: WebSocket, msg: ServerToClient): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Grand Century session server (MP-M1)\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const state: SocketState = {
    clientId: `c${nextClientSeq++}`,
    sessionId: null,
  };

  ws.on('message', (data) => {
    let msg: unknown;
    try {
      msg = JSON.parse(String(data));
    } catch {
      send(ws, { t: 'log', level: 'error', msg: 'invalid JSON' });
      return;
    }

    if (isSessionJoinMessage(msg)) {
      if (state.sessionId) {
        manager.leave(state.sessionId, state.clientId);
        state.sessionId = null;
      }
      const seed = Number.isFinite(msg.seed) ? Math.max(1, Math.floor(msg.seed!)) : 1836;
      const session = manager.getOrCreate(msg.sessionId, seed);
      const result = session.join(state.clientId, msg.nation, (out) => send(ws, out));
      if (!result.ok) {
        send(ws, { t: 'log', level: 'error', msg: result.error ?? 'join failed' });
        return;
      }
      state.sessionId = msg.sessionId;
      send(ws, {
        t: 'joined',
        sessionId: msg.sessionId,
        nationId: result.nationId,
        nationTag: result.nationTag,
        leader: result.leader,
      });
      return;
    }

    if (!state.sessionId) {
      send(ws, { t: 'log', level: 'warn', msg: 'send join before other messages' });
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
    if (state.sessionId) {
      manager.leave(state.sessionId, state.clientId);
      state.sessionId = null;
    }
  });
});

// Fixed-timestep loop (~30 Hz), same cadence as the worker.
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
