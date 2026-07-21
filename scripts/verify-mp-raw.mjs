import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocket } from 'ws';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const port = 3499;
  const proc = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: root,
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 15_000);
    proc.stdout?.on('data', (d) => {
      if (String(d).includes('listening')) {
        clearTimeout(timer);
        resolve(undefined);
      }
    });
    proc.stderr?.on('data', (d) => process.stderr.write(d));
  });

  function client(nation) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const snaps = [];
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'join', sessionId: 'raw-test', nation, seed: 1836 }));
      });
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data));
        if (msg.t === 'snapshot') snaps.push(msg.snapshot);
        if (msg.t === 'joined') {
          resolve({ ws, snaps, get: () => snaps.at(-1), joined: msg });
        }
      });
      ws.on('error', reject);
    });
  }

  const a = await client('ENG');
  const b = await client('FRA');
  console.log('joined', a.joined.leader, b.joined.leader);
  console.log('days0', a.get().day, b.get().day);

  a.ws.send(JSON.stringify({ t: 'command', cmd: { t: 'setSpeed', speed: 5 } }));
  await new Promise((r) => setTimeout(r, 400));
  a.ws.send(JSON.stringify({ t: 'command', cmd: { t: 'setSpeed', speed: 0 } }));
  await new Promise((r) => setTimeout(r, 150));
  console.log('days1', a.get().day, b.get().day, 'equal', a.get().day === b.get().day);

  b.ws.send(JSON.stringify({ t: 'command', cmd: { t: 'setTax', bracket: 'poor', rate: 0.37 } }));
  await new Promise((r) => setTimeout(r, 100));
  const fraA = a.get().nations.find((n) => n.tag === 'FRA').taxRatePoor;
  const fraB = b.get().nations.find((n) => n.tag === 'FRA').taxRatePoor;
  console.log('tax', fraA, fraB);

  const ok = a.get().day === b.get().day && a.get().day > 0 && fraA === 0.37 && fraB === 0.37;
  console.log(ok ? 'PASS raw WS two-client' : 'FAIL raw WS two-client');
  a.ws.close();
  b.ws.close();
  proc.kill('SIGTERM');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
