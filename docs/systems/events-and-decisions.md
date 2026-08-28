# Events and decisions

Events are the game's narrative layer, but they are not flavour text. Each one is
a data-driven package of requirements, choices, and effects that changes the
world state.

The engine runs monthly, staggered across nations so the work is spread out
rather than landing all at once.

## How an event fires

Every event has **requirements** checked against the current world. An event only
becomes a candidate when its conditions are actually true of your nation — the
right government, the right technology, the right circumstances.

When one fires for you it becomes **pending** and waits. The game does not resolve
your events for you; it waits until you choose. AI nations resolve theirs
immediately.

## Choices and effects

Each choice carries **effects**, and the game summarises what each effect will do
before you pick. You are not choosing blind between two pieces of prose.

Effects operate on the same world state everything else does — treasury, prestige,
pops, reforms, relations, and so on. There is no separate "event currency".

## Determinism

Events are deterministic. They come from the seeded random number generator
threaded through the simulation, which means the same save played the same way
produces the same events. An event you got is not an event you were lucky to get;
it is one the world state and the seed produced.

## Balance of power

Riding alongside the event engine is a **balance of power** pressure system,
aimed at formable nations — the unifications that would create a new great power.

As a formable's progress crosses thresholds, the rest of the world reacts:

- At the **alarm** share, powers apply pressure at 1.5.
- At the **rivalry** share, that rises to 3.

There is a player-facing readout for the formable you are closest to completing,
so you can see the alarm you are generating before it becomes opposition.

This is the counterweight to unification. [Diplomacy](diplomacy.md) discounts
unification war goals by 60% infamy, making the wars affordable — and then balance
of power ensures that as you approach the prize, the existing powers notice and
push back. Getting most of the way to a unified great power is the point at which
the world becomes hostile.

## What this means in play

- **Read the effects, not the prose.** Every choice tells you what it will do.
- **Pending events wait for you.** There is no timer forcing a bad choice.
- **Events follow from your situation.** If you keep getting a category of event,
  it is because your world state keeps satisfying its requirements.
- **Watch your balance-of-power readout while unifying.** The opposition scales
  with your progress, and it is visible in advance.

## See also

- [Diplomacy](diplomacy.md) — infamy, and the unification discount this
  counterbalances
- [Crises and the Concert of Europe](crises.md) — the other way the world reacts
  to a rising power
- [AI nations](ai-nations.md) — who is applying the pressure
