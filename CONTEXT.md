# Grand Century

Grand Century is a historical grand-strategy game whose scenario-neutral engine simulates curated political worlds across the early modern and modern eras.

## Language

**Engine**:
The reusable simulation rules that advance any compatible Scenario through time. It is inspired by Victoria II's systemic model but contains no Victoria II runtime code.
_Avoid_: Victoria II engine, Vic2 clone

**Scenario**:
A curated campaign beginning on one exact date, with a complete playable world and date-appropriate content. A Scenario is more than a map or a selectable year.
_Avoid_: Start date, seed date, map

**Polity**:
A political actor with gameplay agency, whether sovereign, constituent, dependent, colonial, tributary, or decentralized.
_Avoid_: Country, nation, state when referring to every playable actor

**Polity Roster**:
The Polities present in a Scenario and the relationships that define their standing at its opening date.
_Avoid_: Country list, tag list

**Ground Situation**:
The local combination of administration, control, occupation, claims, and contested authority. It can differ from a province's sovereign or overlord relationship.
_Avoid_: Ownership when more than one authority is involved

**Source Pack**:
The checked-in, human-reviewable historical inputs, corrections, provenance, and asset policy for one Scenario.
_Avoid_: Raw seed, data dump

**Compiled Scenario**:
The immutable, validated runtime assets produced from a Source Pack, including the world seed, province graph, geometry, and manifest.
_Avoid_: Generated map, world seed when referring to the full artifact

**Historical Source**:
An external evidence or geometry source used while authoring a Source Pack. Historical Sources never define gameplay directly and are not runtime dependencies.
_Avoid_: Truth source
