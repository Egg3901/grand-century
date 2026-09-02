# Time and the tick

Grand Century runs on simulated days. One day is the smallest unit of time the
world advances by, and every system in the game is attached to one of three
cadences: daily, weekly, or monthly. Nothing runs "continuously" — if you want
to know when something you did will take effect, the answer is always the next
time its cadence comes round.

The calendar starts on 1 January 1830. Months use fixed lengths (31, 28, 31, 30,
31, 30, 31, 31, 30, 31, 30, 31) and leap years are ignored, so a year is always
exactly 365 days. This keeps the simulation deterministic: the same save, played
the same way, produces the same world.

## The three cadences

**Daily.** Only two systems run every day:

- The market's daily pass, which handles buying and selling as it happens.
- War, which moves armies, resolves combat, and advances or breaks fronts.

This is why war feels responsive while the economy feels deliberate. A battle
turns in days. A price does not.

**Weekly** (every 7th day). The economic core, in a deliberate order:

1. The market week opens and the previous week's flows are cleared out.
2. Factories and resource sites produce, registering their output as supply.
3. Pops buy their needs — food first, then everyday goods, then luxuries.
4. National stockpile standing orders execute.
5. Producers are paid, but only for the share of their output that actually
   sold (see [Production and industry](production-and-industry.md)).
6. Prices move in response to the week's supply and demand.

The order matters and is not arbitrary. Producers are settled *after* buyers
have had their turn, so that money follows real sales rather than being created
at the moment of production.

**Monthly** (the 1st of each month). The slow, structural systems:

1. Budget — taxes collected, upkeep paid, treasury updated.
2. Population — growth, promotion between classes, migration.
3. Culture — assimilation and nationalist unrest. Runs *before* politics,
   because the unrest it generates is an input to politics.
4. Politics — parties, reforms, and unrest.
5. Research — research points accumulate and technologies complete.
6. Diplomacy — relations, opinion drift, truces, great-power ranking.
7. Crises — world tension and flashpoints.
8. Events — the event and decision engine.
9. AI — every nation that is not you decides what to do next.

Again the order is load-bearing. Culture feeds politics. Budget runs first so
the rest of the month's decisions are made against an up-to-date treasury.

## Yearly

Once every 365 days the game appends a line to your chronicle: the year, your
nation, how many provinces and people you hold, your treasury, prestige, great
power rank, technologies researched, active wars, and infamy. The chronicle
keeps the last 120 entries, which is longer than a full campaign.

## Speed

Speed does not change what happens on a given day, only how many days the game
advances per frame. Running at high speed and running at low speed produce the
same world; you just see less of it go by. Pausing stops the day counter
entirely — no system runs while paused.

## What this means in play

- **A reform, a tax change, or a new research target takes effect on the 1st.**
  Changing your tax rate on the 3rd does nothing until the following month.
- **A trade decision takes effect within the week.** Tariffs change what your
  pops pay at the next weekly buying pass.
- **A war decision takes effect tomorrow.** Movement and combat are daily.
- **If a number looks frozen, check its cadence before assuming it is broken.**
  Prices only move once a week, and population only moves once a month.

## See also

- [Population](population.md) — the monthly growth, promotion and migration pass
- [The world market](the-world-market.md) — how the weekly price move works
- [Budget and taxation](budget-and-taxation.md) — what the monthly budget pass does
- [The simulation loop](../engineering/simulation-loop.md) — the same thing from
  the code's side, for contributors
