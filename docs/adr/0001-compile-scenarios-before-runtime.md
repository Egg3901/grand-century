# Compile scenarios before runtime

Grand Century will import OpenHistoricalMap, Natural Earth, legacy Victoria II references, and hand-curated research only while authoring scenarios, then compile each Source Pack into checked-in, validated runtime assets. The game will not query those sources while starting or running a campaign. This keeps campaigns deterministic and offline-capable, isolates source schema and availability changes, permits per-feature license review, and gives human corrections authority over incomplete or overlapping historical data.
