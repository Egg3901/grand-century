# Classify polities before compilation

OpenHistoricalMap administrative relations are Historical Sources, not playable countries. Every imported relation must resolve to a curated Polity entry before scenario compilation. The Polity records its player-facing name, political status, flag treatment, and source references. Overlord and other directed relationships live in a separate relationship file and may only reference known Polity keys.

This prevents colonies, constituents, disputed claims, and map fragments from becoming accidental sovereign nation slots. It also lets player-facing presentation differ from source terminology while the provenance ledger retains the source name unchanged.

Scenario status is a release gate. A development or preview Scenario may exercise temporal, geometry, roster, and engine seams, but the runtime menu and multiplayer server expose only Scenarios marked playable. Promoting a Scenario requires global roster coverage and all acceptance gates in `docs/MULTI-ERA-SCENARIOS.md`.
