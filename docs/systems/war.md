# War

War is the only system that runs every single day, and it is the one place where
your decisions turn over fast. Armies move, provinces fall under siege, battles
resolve, and the war score shifts — daily.

## Armies and regiments

An army is a stack of regiments. A regiment holds up to 1,000 men; a ship up to
100 strength. Armies take 5 days to move between provinces as a baseline, fleets
4 days. Mobilized troops cost upkeep every day they are in the field.

There are four regiment types, and they are genuinely different tools:

| Type | Offense | Defense | Siege | Mobility | Pursuit |
|---|---|---|---|---|---|
| Infantry | 1.0 | 1.05 | 1.0 | 1.0 | 0.9 |
| Cavalry | 0.92 | 0.82 | 0.5 | 1.24 | 1.45 |
| Artillery | 1.42 | 0.64 | 1.9 | 0.76 | 0.72 |
| Guard | 1.25 | 1.26 | 1.12 | 0.95 | 1.02 |

Artillery hits hardest and takes fortresses nearly twice as fast as infantry, but
it is fragile on defence and slow. Cavalry is for movement and for running down a
beaten enemy, not for holding ground. Guards are good at everything and expensive
for exactly that reason.

## Combat width: why doomstacks do not work

Land battles have a **combat width soft cap of 24 regiments**. Up to that, every
regiment fights at full effectiveness. Beyond it, additional regiments still
contribute — a wall of extra bodies is not worthless — but on a square-root curve
that falls away steeply.

This exists because without it, piling every army in the nation into one province
was strictly optimal: offence summed linearly with stack size *and* damage taken
per regiment diluted further the bigger the stack, which compounded twice over.
Splitting your forces across several fronts is now a real strategic choice rather
than a mistake.

## Supply

An army is supplied if it can trace a path back to friendly-controlled territory
within its supply range. That range is 2 provinces, plus your army organization,
plus any bonus from railroad and logistics technology.

The tracing rule has teeth: after the first step, every province on the path must
itself be friendly-controlled. You cannot run a supply line through enemy
territory. Deep thrusts past unreduced fortresses go unsupplied.

## Generals

Generals are assigned to armies from a national pool and carry traits —
offensive and defensive doctrine, logistics, siegecraft, reckless, cautious.
A siegecraft general takes fortresses 25% faster.

## Sieges and occupation

Occupying a province is a daily accumulation, not an instant capture. Progress
builds until the province flips. Artillery and a siegecraft general both speed
this up considerably.

## War score

War score runs from -100 to +100 and is the sum of five components:

- **Occupation** — how much enemy territory you hold.
- **Capital** — whether you hold their capital.
- **Blockade** — naval pressure.
- **Battle** — the record of engagements won and lost.
- **Exhaustion** — the cost the war has imposed on each side.

Occupation is usually the dominant term. Winning battles without taking ground
moves the number far less than players expect.

## Peace

Peace is made by offering terms backed by your war score. **War goals** are the
specific things you are fighting for, and applying them is what actually transfers
territory or extracts concessions.

**White peace** — ending with nothing changing hands — is free when the two sides
are within 10 war score of each other, or when both are exhausted past 75.
Outside those conditions, the nation *offering* white peace pays a 6 prestige fee.
Suing for peace from a losing position has a visible cost.

## Rebellions

Rebel sieges tick at a slower base rate than regular armies. Once a rebellion's
progress passes 85, its demand is enforced. Rebels are pursuing the specific
reform demand they spawned with — see [Politics and reform](politics-and-reform.md).

## Colonial expansion

Colonial claims are bought with colonial points, at a cost of 32 per claim.

## What this means in play

- **Split your armies.** Past 24 regiments in a battle you are wasting men. Two
  fronts of 24 beat one stack of 48.
- **Match the regiment to the job.** Artillery for fortresses, cavalry for pursuit
  and manoeuvre, guards where you can afford them, infantry as the backbone.
- **Take ground, not just battles.** Occupation dominates war score.
- **Do not outrun your supply.** Range is 2 plus organization plus tech, and the
  path must be friendly the whole way. Reduce the fortresses behind you.
- **Decide early whether you are winning.** White peace is free inside a 10-point
  band; outside it, backing out costs prestige.
- **Every conquest is a permanent bill.** See
  [Budget and taxation](budget-and-taxation.md) — administration scales with
  provinces held.

## See also

- [Diplomacy](diplomacy.md) — how wars start, and who joins them
- [Crises and the Concert of Europe](crises.md) — the wars the world starts for you
- [Population](population.md) — where soldiers come from
- [Research](research.md) — logistics, artillery and supply-range technology
