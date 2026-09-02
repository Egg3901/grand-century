# AI nations

Every nation that is not yours runs the same simulation you do. They collect
taxes, feed pops, research technology, and go to war using the same rules. The AI
pass runs last in the monthly order, after the world has finished moving, so its
decisions are made against a settled picture.

## How the AI sees the world

The AI estimates **national power** from armies, navies, population and territory,
and it estimates **bloc power** the same way for coalitions. Almost every decision
it makes is a comparison of those numbers.

It also builds a neighbour map — who borders whom — because proximity governs what
is realistically attackable.

## Choosing a war

When the AI considers war, it scores candidate target states rather than picking
a nation and improvising. The score accounts for what the state is worth, whether
it borders the attacker, and whether it is a colonial target requiring reach the
attacker may not have.

Having picked a target, it selects a **war goal** that fits — which means AI wars
have specific, legible aims. It is not expanding at random; it wants a particular
state for a particular reason.

## Fighting a war

In war the AI works from a set of objective provinces: front targets where the
enemy can be engaged, and threatened home provinces that need defending. It moves
armies stepwise toward those objectives and falls back to the nearest friendly
supply province when it needs to recover, which means it respects the same supply
rules you do.

It tracks **army readiness** — average organization and strength across an army's
regiments — and does not throw broken formations into battles.

## What shapes an AI nation's character

Two things make AI nations develop distinct personalities over a campaign:

**Ruling party ideology**, which biases research (see [Research](research.md)).
A reactionary power pours points into its army and neglects culture. A liberal one
builds commerce and industry. Over decades this compounds into visibly different
nations.

**War posture**, which shifts how aggressively it weights military technology and
targets.

## Crises

In a [crisis](crises.md), AI great powers decide whether to join a bloc based on
an interest score, and whether to back down based on relative power. They fold at
a power ratio of 0.62 — before the situation is formally hopeless. AI powers are
not suicidal; a clearly stronger coalition will usually get its way without a war.

## What this means in play

- **AI expansion is legible.** It wants specific states for specific reasons.
  Look at what borders it and what those states are worth.
- **Their technology tells you their politics.** A neighbour suddenly researching
  army technology has had a change of government.
- **They respect supply and readiness.** You cannot bait an AI into a broken
  offensive the way you might expect.
- **They back down to strength.** In a crisis, being obviously stronger is often
  enough to win without fighting.
- **They are subject to everything you are.** AI nations go bankrupt, suffer
  nationalist uprisings and lose great-power rank on the same rules you do.

## See also

- [Diplomacy](diplomacy.md) — the relations and casus belli the AI works within
- [War](war.md) — the machinery its campaigns use
- [Crises and the Concert of Europe](crises.md) — bloc decisions and backing down
- [Research](research.md) — the ideological bias table
