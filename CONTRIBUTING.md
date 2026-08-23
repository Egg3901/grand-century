# Contributing

Bug fixes, interface polish, tests, documentation, balance evidence, and historical content corrections are welcome.

## Development workflow

```bash
npm ci
npm run lint
npm test
npm run test:balance
npm run build
```

Open a focused pull request against `master`. Update `CHANGELOG.md` for player-visible changes.

Simulation changes need deterministic tests and a headless balance result proportionate to their reach. Keep the simulation independent of React and the DOM. Use the transport interfaces rather than teaching simulation systems whether they are running in a browser worker or multiplayer server.

Read [the architecture guide](./docs/ARCHITECTURE.md) and [master design](./docs/MASTER.md) before broad system work. Report vulnerabilities through [SECURITY.md](./SECURITY.md).
