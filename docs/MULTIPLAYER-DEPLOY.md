# Multiplayer deploy notes (MP-M1)

Operator applies systemd + Caddy — this repo only authors the files.

## Run locally

```bash
npm run server          # listens on 127.0.0.1:${PORT:-3412}
```

Join from the client (dev server or built static app):

```
#/mp?session=<id>&nation=ENG&seed=1820
```

Example: two browsers share one world —

1. Tab A: `#/mp?session=demo1&nation=ENG&seed=1820`
2. Tab B: `#/mp?session=demo1&nation=FRA&seed=1820`
3. Tab A (session leader) unpauses / sets speed; both see the same date advance.

Or use the main menu **Multiplayer** button (hosts a random session id and prints a share URL).

Override the WebSocket URL in dev with `VITE_MP_WS_URL` or `VITE_MP_PORT`.

## systemd

Unit file: `server/grand-century-server.service`

```bash
sudo cp server/grand-century-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now grand-century-server
sudo systemctl status grand-century-server
```

Default bind: `127.0.0.1:3412` (loopback only; Caddy proxies).

## Caddy (lakesidegames.net)

Add under the `lakesidegames.net` site block so WebSocket upgrades are proxied
to the session server. Caddy auto-upgrades WS on `reverse_proxy`.

```caddy
# Grand Century multiplayer WebSocket (MP-M1)
handle /games/grand-century/ws* {
	reverse_proxy 127.0.0.1:3412
}
```

Place this **before** the static `handle_path /games/grand-century/*` (or equivalent)
so `/ws` is not swallowed by the static file handler.

After editing Caddyfile:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Prod clients connect to `wss://lakesidegames.net/games/grand-century/ws`
(`SocketTransport` derives this from `BASE_URL` + `location`).

## Notes

- Sessions are in-memory and ephemeral; empty sessions are GC'd.
- Server is authoritative (clock + commands). Snapshot **diffs** are TODO for MP-M4.
- Single-player remains the local `WorkerTransport` (unchanged).
