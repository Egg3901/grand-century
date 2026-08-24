# Grand Century

A single-player, browser-based grand strategy game about the long nineteenth century.
Take a nation in 1820, amid the fragile Concert of Europe and Atlantic revolutions, and
carry it through a century of industry, reform, and conquest on a world whose population
and markets move whether you are watching or not.

Play at [lakesidegames.net/games/grand-century](https://lakesidegames.net/games/grand-century/).

## The game

**A world that lives without you.** Population groups grow, migrate, and promote between
strata. Factories boom and go bust. Prices move on a shared world market. AI nations
pursue their own wars and their own industrialisation. You nudge a system rather than
micromanage a spreadsheet.

**War is the payoff.** Mobilising population into armies, fronts that push and break, war
goals, occupation, peace deals, the great-power pecking order, and the colonial land grab.
Every other system feeds it: the economy funds it, population mans it, politics gates what
you can enact, diplomacy sets it up.

**Legible depth.** Interlocking systems stay understandable through tooltips that trace a
number back to the inputs that produced it.

Real time with pause, five speeds, a daily tick, with the heavier systems resolving on
coarser cadences to stay cheap in a browser tab.

## Running it

Requires Node 20+.

```bash
npm install
npm run dev            # local dev server
npm run build          # production build to dist/
npm test               # unit tests
npm run test:balance   # balance gauntlet
npm run test:all       # everything, including stability runs
```

The simulation is pure TypeScript with no DOM dependencies, so it runs in the browser, in
tests, and headless for batch balance runs. `npm run season-report` and
`npm run probe:pacing` drive the headless paths.

## Design docs

The full specification lives in [`docs/`](./docs). Start with
[`docs/MASTER.md`](./docs/MASTER.md) for the simulation model and architecture, and
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for how the code is laid out. The
`ROADMAP-*.md` files are the per-version scopes and are historical once shipped.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE.md). The source is available to read, learn from,
modify, and run noncommercially. Commercial use, including hosting it as a paid or
ad-supported service, is not licensed.
