# Historical roster and boundary sources

## Decision

Grand Century should use a source stack, not a single historical map.
OpenHistoricalMap and Cliopatria are the only reviewed global sources in this report whose published terms support direct use in a commercial game build.[4][6]
OHM supplies dated feature geometry and element-level provenance.[1][2]
Cliopatria supplies a second global polity model, coarse empire membership, and independent geometry under CC BY 4.0.[5][6]

Institutional records should decide sovereignty, dependency, recognition, and ground-control disputes.[14][16][20]
Geometry should never decide those fields by itself.
Newberry data and rights-cleared Library of Congress maps can support regional geometry and boundary review.[7][18][19]
The League of Nations archive and official recognition histories should support 1936 roster classifications and relationships.[14][15][16]
National archives, treaties, and charters should support specific historical relationships.[20]

CShapes, China Historical GIS, and Correlates of War are useful research references, but their published terms do not permit incorporation into a commercial game pipeline.[8][9][10]
CShapes is CC BY-NC-SA 4.0 and CHGIS Version 6 prohibits commercial use and redistribution.[8][9]
Correlates of War prohibits commercial activity and third-party distribution.[10]
Do not download, transform, validate production output against, or redistribute those datasets for Grand Century unless the rights holder grants written permission.[8][9][10]

## Source ranking

| Source | Temporal and geographic fit | What it can establish | Product use | Main limitation |
|---|---|---|---|---|
| OpenHistoricalMap | Global and multi-period | Candidate boundaries, dates, names, source tags, external IDs | Import after element-level license and provenance checks | Community coverage is uneven; `admin_level=2` is not equivalent to sovereignty |
| Cliopatria 0.2.0 | Global, 3400 BCE to 2024 CE | Polity candidates, polygons, dates, identifiers, coarse membership | Import with attribution, pinned commit, and transformation notice | Coarse spatial scales and intervals; not a complete colony or dependency roster |
| Newberry Atlas of Historical County Boundaries | North America, mainly 1629 to 2000 | Dated colonial, county, state, and territorial subdivisions | Import regionally with provenance | Local administrative geography, not a global polity source |
| Library of Congress APIs and maps | Global collection, item-specific dates | Period cartographic evidence and bibliographic metadata | Review or trace only items whose record permits reuse | Raster evidence, cartographic claims, and item-specific rights |
| World Historical Gazetteer | Global union index | Name reconciliation, temporal names, source namespaces, identifiers | Reconciliation only, preserving upstream source rights | Aggregates records with different authority and rights |
| League of Nations and government archives | Strong for 1936 and selected historical relationships | Membership, mandates, diplomatic recognition, charters, treaties | Cite facts and encode reviewed assertions | Mostly documentary, not a ready-made global API or polygon layer |
| CShapes 2.0 | Global 1886 to 2019; Europe from 1816 | Independent and dependent territory boundaries and capitals | Do not use without permission | Non-commercial share-alike license |
| Correlates of War | Global 1816 onward | State-system membership, territorial transfers, named dependencies | Do not use without permission | Commercial use and redistribution prohibited; research definitions do not match game roster needs |
| CHGIS Version 6 | Historical China | Administrative units, time series, place names | Do not use without permission | Academic-only, no commercial use or redistribution |

## OpenHistoricalMap assessment

OHM is an ambitious, community-led map whose data is available through downloads and free APIs.[1]
Its date-filter implementation uses optional `start_date`, `start_decdate`, `end_date`, and `end_decdate` properties.[3]
Year-only queries include every feature overlapping that year, while full dates select a point in time.[3]
This supports exact scenario-date discovery, but the community-led model does not prove that every active polity was mapped.[1][2]

The OHM boundary convention explicitly states that non-independent countries are often tagged `admin_level=2`.[2]
It also says globe-spanning empires may be tagged at level 1 while colonies are tagged at level 2.[2]
Therefore an `admin_level=2` discovery result is a review queue containing possible sovereigns, dependencies, constituent units, and territorial fragments.[2]
It must never become the country roster automatically.[2]

OHM generally maps boundaries that are widely recognized and that best reflect conditions on the ground.[2] That choice is useful for a political map, but it is only one assertion dimension.[2] The Scenario schema must store de jure sovereign, de facto controller, administrative parent, claimants, and playable-polity status separately.[2]

OHM is CC0 unless an individual feature carries another open license.[4]
The project warns that significant reuse of share-alike content must honor that license and identifies `license=*` on individual elements as the mechanism for exceptions.[4]
The compiler must continue to reject unknown, non-commercial, or share-alike inputs until a deliberate rights review accepts them.[4]
It must preserve relation, way, and node IDs, source tags, attribution tags, license tags, query text, retrieval timestamp, and raw-response hash.[4]

The existing live audit in [Multi-era scenarios](../MULTI-ERA-SCENARIOS.md) found 187 active level-2 relations and 180 unique identity keys for 1700, compared with 212 active relations and 202 unique identity keys for 1936. These numbers show useful global coverage, but the OHM tagging rules prove that neither total is a sovereign-state count.[2] The audit should be rerun from a pinned Overpass response whenever either Source Pack is released.[1]

### Required OHM diagnostics

For each scenario date, compilation should emit:

- discovered relations, accepted relations, rejected relations, and unclassified relations;[1][2]
- exclusive-owner gaps and overlaps on inhabited land;[2]
- duplicate Wikidata IDs and simultaneous geometries for one polity;[2]
- boundaries with incomplete dates, uncertain dates, missing sources, or non-default licenses;[3][4]
- a distinction between missing geometry and intentionally unowned territory;[1][2]
- a source assertion report showing whether geometry, name, existence, status, parent, and control each have evidence.[2][4]

## Importable complementary sources

### Cliopatria

Cliopatria is the strongest global complement reviewed here.[5][6]
Its official repository describes more than 1,600 political entities in roughly 14,000 GeoJSON rows, sampled at varying time steps and spatial scales.[5]
Each row provides a name, polygon, applicable year interval, area, type, Wikidata ID, and sometimes a Seshat ID.[5]
Its license permits use, adaptation, and distribution under CC BY 4.0 with attribution, a license link, and an indication of changes.[6]

The exact main-branch snapshot inspected for this report was commit `ad28a691b7c07c1fca89d0e0636d324667d2a258`, downloaded on 2026-09-02.[5]
The ZIP SHA-256 was `d01ae3a20d358cc5d54f69d9d725d390767d9c8759ac89ad6f90c58d106f3370`.[5]
Direct inspection found 13,765 features, 113 polity rows active in 1700, and 90 polity rows active in 1936.[5]
It also found only 15 active 1700 rows and 10 active 1936 rows with a nonempty `MemberOf` value, including several self-references.[5]
These measurements confirm that Cliopatria is a valuable second candidate layer, not a complete dependency graph.[5]

Use Cliopatria to find OHM omissions, compare broad polygon topology, seed crosswalks, and propose empire membership for review.[5]
Do not treat its `MemberOf`, `Components`, names, or year intervals as accepted Scenario facts without a cited documentary source.[5]
Pin a tagged release or commit and record both the archive hash and the feature-level identifiers in provenance.[5][6]

### Newberry Atlas of Historical County Boundaries

The Newberry Atlas publishes date-coded shapefiles and KMZ files whose polygons can be filtered by start and end dates.[7]
Its national county coverage begins in 1629, while its United States state and territory layer begins in 1783.[7]
The current download page says the data may be consulted, reviewed, and reused for lawful purposes without license or permission fees, and OHM lists the Atlas as reusable without restriction.[4][7]

For 1700, Newberry can validate mapped colonial subdivisions and local boundary chronology in the parts of North America it covers.[7] It cannot determine the global sovereign roster, and its later state and territory layer cannot supply a 1700 continental ownership map.[7] Preserve the Atlas chronology citation associated with each imported boundary change.[7]

### Library of Congress and other public archives

The Library of Congress JSON API exposes search, item, and resource records for its digital collections, including maps.[18]
Individual map records can expose downloadable images, bibliographic metadata, and IIIF manifests.[18][19]
A 1719 world map in the Geography and Map Division, for example, is downloadable and its record says the digitized collection is free to use unless an item has a contrary rights advisory.[19]

Use period maps as review evidence for a specific place and assertion.[18][19]
They depict a cartographer's knowledge, claim, or publication context, not necessarily effective control.[19]
Any traced geometry must cite the exact item, edition, publication date, image or canvas ID, and rights statement.[18][19]
Prefer two independent maps or one map plus a legal or administrative record for disputed boundaries.[18][19]

### World Historical Gazetteer

WHG's Entity and Search APIs return Linked Places Format records containing names, types, geometries, temporal bounds, source namespaces, and links.[17]
This makes WHG useful for reconciling variant names and stable identifiers across OHM, Cliopatria, archives, and local datasets.[17]
WHG should not be treated as a new authority layer.[17]
Preserve the contributing dataset's identity and rights, and use the WHG identifier only as a crosswalk.[17]

## Restricted research sources

### CShapes 2.0

CShapes 2.0 maps independent states and dependent territories globally from 1886 to 2019, with Europe extended back to 1816.[9]
It offers GeoJSON, shapefile, CSV, SQL, and R formats and is directly aligned with the 1936 boundary problem.[9]
It is licensed CC BY-NC-SA 4.0.[9]
That makes it unsuitable for the Grand Century product, compiled artifacts, automated validation, or bundled authoring tools without separate written permission.[9]

### Correlates of War

State System Membership records COW states from 1816 onward, but its definition is narrower than a playable roster.[11]
Before 1920 it requires a population over 500,000 plus qualifying diplomatic missions with Britain and France.[11]
After 1920 it uses League or UN membership, or a population threshold plus diplomatic missions from two major powers.[11]
Small states, unrecognized entities, colonies, protectorates, and many game-relevant political actors can therefore be absent.[11]

The Colonial/Dependency Contiguity dataset records state relationships that arise because colonies or dependencies are geographically contiguous.[12]
It is not a complete hierarchy of administrative control.[12]
Territorial Change records transfers from 1816 onward only when at least one party is a COW-recognized nation-state.[13]
Both can suggest cases requiring documentary review, but neither defines the full roster or all overlord relationships.[12][13]

COW's site-wide terms prohibit use for commercial activity and prohibit third-party distribution without written permission.[10] The project should not use these files operationally unless COW grants a commercial license.[10] Public descriptions can inform schema design, but production facts need independently licensed evidence.[10]

### China Historical GIS

CHGIS Version 6 provides time-series historical administrative units and place names for China, which would make it a strong regional geometry check for 1700 and a useful administrative crosswalk for 1936.[8] Its license permits academic research but prohibits commercial use, resale, and redistribution.[8] It therefore requires written permission before any Grand Century use beyond evaluating whether permission is worth seeking.[8]

## Documentary sources for status and relationships

No reviewed global dataset expresses all distinctions the game needs.[2][5]
A polity can be sovereign, a member of a personal union, a vassal, a protectorate, a chartered company administration, a colony, a mandate, an autonomous constituent, a claimant, or a de facto government.[2][14][20]
These categories must be assigned from dated documentary evidence and must not be inferred from polygon nesting.[2][14][20]

For 1936, League records are a primary source for membership and mandates.[14][15]
The Covenant allowed a fully self-governing state, dominion, or colony to become a member, which proves that League membership is not itself a simple sovereignty flag.[14]
The League chronology records dated accessions, withdrawals, and events during 1936.[15]
League yearbooks, mandate reports, treaty records, and official journals should be cited at the page or document level for each accepted classification.[14][15]

The United States Department of State's country histories provide dated evidence for US recognition, diplomatic relations, missions, interruptions, and resumptions from 1776 onward.[16] Use them as one state's recognition record, not as universal legal truth.[16] For disputed recognition, store the recognizing actor and date instead of collapsing the evidence into a Boolean.[16]

For 1700, charters, treaties, administrative instructions, and archival correspondence carry the relationship evidence.[20]
The North Carolina State Archives identifies the 1663 Carolina Charter as the founding grant from Charles II to the Lords Proprietors and preserves the document and related colonial records.[20]
That supports the current Source Pack's classification of Carolina as a dependent administration under the English Crown, while OHM supplies only candidate geometry.[2][20]

## Scenario evidence model

Every accepted polity should carry assertion-level provenance rather than one undifferentiated source list:

```json
{
  "polityKey": "CAROLINA",
  "asOf": "1700-01-01",
  "assertions": {
    "existence": [],
    "displayName": [],
    "classification": [],
    "sovereign": [],
    "administrativeParent": [],
    "deJureClaims": [],
    "deFactoController": [],
    "geometry": []
  },
  "certainty": "reviewed",
  "reviewNotes": ""
}
```

Each source reference should include URI, institution, record or element ID, title, version or edition, applicable date, page or image locator, retrieval date, rights expression, raw hash, and which assertions it supports. A source that proves a polity existed does not automatically prove its boundary, independence, parent, or control.

## 1700 construction plan

1. Form the candidate union from OHM exact-date discovery and the pinned Cliopatria snapshot. Keep both source identities and do not merge on display name alone.[2][5]
2. Reconcile names and IDs through WHG and source-provided Wikidata IDs, but retain the upstream source record for authority.[5][17]
3. Classify every candidate before compiling geometry. Give special review queues to personal unions, the Holy Roman Empire, tributaries, chartered companies, indigenous polities, and colonial administrations.
4. Prove every parent and status edge with a dated charter, treaty, government record, or scholarly dataset whose commercial rights permit use. The Carolina Charter workflow is the pilot.[20]
5. Prefer OHM geometry when its dates, sources, and topology pass review.[4]
   Use Cliopatria as a second topology check and Newberry for covered North American subdivisions.[5][7]
   Use rights-cleared period maps for manual boundary review.[18][19]
6. Fail release if any inhabited region has an accidental owner gap, any exclusive owners overlap without a disputed-control record, or any playable polity lacks status evidence.

## 1936 construction plan

1. Form the geometry and roster candidate union from OHM and pinned Cliopatria.[2][5]
2. Review every OHM level-2 feature because OHM explicitly allows non-independent countries at that level.[2]
3. Prove League membership, mandates, withdrawals, and diplomatic-recognition disputes from League and government records.[14][15][16]
4. Seek written commercial permission before considering CShapes, COW, or CHGIS. Until permission exists, keep them outside downloads, tests, validation, screenshots, and generated artifacts.[8][9][10]
5. Store ground control separately from sovereignty and claims, particularly where a January 1936 opening date differs from later events in that year.[2][15]
6. Import no flags, seals, uniforms, portraits, propaganda, or raster symbology from source maps.[18][19] For Germany, compile geometry and neutral text only, and retain the approved neutral tricolor treatment. The no-Nazi-imagery rule applies to authoring previews, generated artifacts, tests, documentation screenshots, and shipped assets.

## Release gates

A 1700 or 1936 roster is ready only when:

- every playable polity has reviewed evidence for existence, classification, sovereign or parent relationship, capital, and opening-date control;[2][14][20]
- every dependent territory points to a valid parent and every relationship has its own documentary citation;[14][16][20]
- every geometry has a rights-compatible source, exact applicable date, source ID, retrieval record, and raw hash;[4][5][6]
- all OHM discoveries are accepted, rejected with a reason, or explicitly marked unresolved;[1][2]
- all imported CC BY data appears in the in-game credits and provenance bundle, with transformations declared;[4][6]
- no non-commercial, no-redistribution, unknown-license, or unreviewed share-alike data enters the build;[4][8][9]
- no source map's symbols or historical imagery are copied into the game;[18][19]
- world-scale topology and high-density regional reviews pass independently.[1][2][5]

## Sources

[1] https://www.openhistoricalmap.org/about - OpenHistoricalMap: About
[2] https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/Boundaries - OpenHistoricalMap Boundaries
[3] https://github.com/OpenHistoricalMap/maplibre-gl-dates - OpenHistoricalMap MapLibre GL Dates
[4] https://www.openhistoricalmap.org/copyright - OpenHistoricalMap Copyright and Acknowledgements
[5] https://github.com/Seshat-Global-History-Databank/cliopatria - Cliopatria official repository
[6] https://github.com/Seshat-Global-History-Databank/cliopatria/blob/main/LICENSE.md - Cliopatria CC BY 4.0 license
[7] https://publications.newberry.org/ahcb/downloads/index.html - Newberry Atlas of Historical County Boundaries downloads
[8] https://chgis.fas.harvard.edu/data/chgis/v6 - China Historical GIS Version 6
[9] https://icr.ethz.ch/data/cshapes - ETH CShapes 2.0
[10] https://correlatesofwar.org/data-sets - Correlates of War datasets and terms
[11] https://correlatesofwar.org/data-sets/state-system-membership - Correlates of War State System Membership v2024
[12] https://correlatesofwar.org/data-sets/colonial-dependency-contiguity - Correlates of War Colonial Dependency Contiguity v3.1
[13] https://correlatesofwar.org/data-sets/territorial-change - Correlates of War Territorial Change v6
[14] https://www.ungeneva.org/en/about/league-of-nations/covenant - Covenant of the League of Nations
[15] https://www.ungeneva.org/sites/default/files/2022-01/sdn_chronology_0.pdf - League of Nations chronology
[16] https://history.state.gov/countries - US Department of State country recognition histories
[17] https://docs.whgazetteer.org/content/technical/apis.html - World Historical Gazetteer APIs
[18] https://www.loc.gov/apis - Library of Congress APIs
[19] https://www.loc.gov/resource/g3200.ct007070 - Library of Congress 1719 world map
[20] https://appx.archives.ncdcr.gov/findingaids/VC_Vault_Collection_of_the_Stat_.html - North Carolina State Archives Carolina Charter
