# Culture and nationalism

Your nation has a **primary culture** and a set of **accepted cultures**. Every
pop belongs to a culture. Pops whose culture is neither primary nor accepted are
second-class in your state, and the game models exactly what that costs you.

This system runs monthly, immediately *before* politics — because the unrest it
produces is an input to the political pass.

It is entirely deterministic. Nothing here is a dice roll.

## The fault lines of 1830

The map seeds the historical nationalities, so the pressure you feel depends on
who you play:

- **Austria** holds Hungarians, Czechs, Italians in Lombardy and Venetia, South
  Slavs in Croatia, Slavonia and Dalmatia, Poles in West Galicia, Ukrainians in
  East Galicia, and Romanians in Transylvania. It is the hardest nationality
  problem in the game by a wide margin.
- **The Ottoman Empire** holds Greeks along the Aegean and the Anatolian coast,
  South Slavs across Bosnia, Macedonia and Bulgaria, Armenians in the east, and
  Arabs from Aleppo to Basra.
- **Russia** holds Ukrainians, Poles in Congress Poland, Balts, the Baltic German
  nobility, Finns, Crimean Tatars, the Caucasus and the Kazakh steppe.
- **Britain** holds the Irish and, through the Company, the subcontinent.
- **Prussia** holds Poles in Posen, West Prussia and Upper Silesia.

## Culture policy

You choose one of three postures, and it is the single biggest lever in the
system:

| Policy | Assimilation | Monthly militancy | Radicalism drift |
|---|---|---|---|
| Exclusionary | ×1.2 | +0.05 | +0.8 |
| Assimilationist | ×1.0 | +0.025 | 0 |
| Pluralist | ×0.45 | +0.006 | -0.6 |

The trade is explicit. Exclusionary policy melts minorities fastest *and* makes
them angriest. Pluralism keeps the peace and largely gives up on assimilation.
Assimilationist sits between the two.

## Assimilation

Non-accepted pops drift toward the primary culture at a base rate of **0.6% per
month**, modified by:

- **How surrounded they are.** The local primary-culture share drives the rate,
  and it does so superlinearly. A minority dispersed among the majority melts
  quickly; a compact homeland barely moves. In 1830 terms: the Finns around St
  Petersburg are surrounded by Russians and assimilate, while the Baltic German
  nobility sits inside a Baltic majority rather than a Russian one and holds its
  numbers almost indefinitely. You cannot assimilate people you do not surround.
- **National literacy.** Schools melt minorities — a literate nation assimilates
  faster.
- **Culture policy**, per the table above.
- **Religion.** Assimilating across a religious divide runs at 70% speed.
- **Radicalism.** A radical national movement smothers assimilation entirely.
  Under pressure, identity hardens instead of dissolving.

That last point is the crux of the system: push too hard and you stop assimilating
anyone at all.

## Militancy and consciousness

Non-accepted pops accrue militancy every month at the policy rate, multiplied by
1.2 where their religion also differs from the state's. They accrue consciousness
at 1.2% a month regardless — an awakening that proceeds whatever you do.

## National movements

Once a non-accepted culture reaches **4% of national population** and an average
consciousness of **2.5**, a national movement forms for that culture.

A movement has a **radicalism** score, which drifts monthly:

- A base of **-0.3**, so a content, calm minority's movement decays on its own.
  Radicalism tracks grievance, not time.
- Up with consciousness (+0.15 per point) and much faster with militancy
  (+0.5 per point).
- Down when the pops' needs are being met (a relief term of 2.0).
- Up or down by policy, per the table above.

If you accept the culture, radicalism decays at 4 per month and the movement
winds down.

## Uprisings

A movement launches an independence rebellion when **both** gates are passed:
radicalism at or above **85** and militancy at or above **4.2**. Anger alone is
not enough, and neither is an abstract sense of grievance — it takes both.

The rebellion targets the culture's **heartland** states, meaning states where
that culture is at least 35% of the population.

After an uprising fires, radicalism resets to 30, the culture's pops get militancy
relief, and that movement cannot rise again for **6 years**. Nationalist revolt is
a periodic crisis, not a permanent bleed. All the usual rebellion caps apply —
world and nation limits, per-state cooldowns, and the rebel army cap — so
nationalism can never spawn endless rebellions.

## Accepting a culture

You can add a culture to your accepted list. It costs prestige, scaling with how
many cultures you already accept. Acceptance ends the militancy accrual, winds
down any movement, and stops the assimilation of that culture — you are choosing
plurality over homogeneity for that group.

## What this means in play

- **Decide early what kind of empire you are.** Exclusionary assimilation works,
  but it builds anger while it works, and the anger can reach the point where
  assimilation stops entirely.
- **Feed your minorities.** Needs relief is one of the strongest downward forces
  on radicalism. A well-fed minority is a quiet one.
- **Literacy cuts both ways.** It speeds assimilation and it raises consciousness,
  which is what lets movements form in the first place.
- **Acceptance is a real option.** It is expensive in prestige, and it permanently
  defuses a movement. Sometimes that is cheaper than the rebellion.
- **A 6-year cooldown is a window.** After an uprising you have time to address the
  cause before the same movement can rise again.

## See also

- [Politics and reform](politics-and-reform.md) — the system this feeds directly
- [Population](population.md) — where militancy, consciousness and needs live
- [War](war.md) — how rebellions are actually fought
