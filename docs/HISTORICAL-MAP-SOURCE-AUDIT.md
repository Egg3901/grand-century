# Historical Map Source Audit

## Recommendation

Grand Century should lock **1820-01-01** as its canonical start date.

That date gives the game a distinct identity rather than placing it on the standard Victorian starting line. The Congress of Vienna settlement is only five years old, the post-Napoleonic Concert of Europe is still new, the Spanish monarchy still legally spans most of mainland Spanish America, independence wars are actively redrawing that empire, and European control over much of Africa, Asia, and the western half of North America remains partial, layered, or contested.

1820 also creates stronger opening play:

- Gran Colombia, Chile, the United Provinces, Paraguay, the two Haitian states, and revolutionary movements coexist with Spanish royalist strongholds. Brazil is still joined to Portugal as a constituent kingdom, not yet an independent empire.
- Egypt is an autonomous Ottoman vassal whose forces control the Hejaz, while the Levant remains directly Ottoman. This creates an imperial relationship with competing agency instead of two simple sovereign color fills.
- The East India Company governs major territories but shares the subcontinent with dependent princely states and independent powers such as the Sikh Empire.
- Qing authority in Mongolia, Tibet, and Xinjiang, Dutch reach in Indonesia, Anglo-American claims in Oregon, and Indigenous ground control all require multiple relationship types rather than modern borders.
- The German Confederation and the Italian states preserve the small-state diplomacy and roster density that the current map lacks.

The open [GeoPolHist database](https://github.com/medialab/geopolhist) supplies entity and relationship dates from 1816 onward. Exact 1820 vector references also exist for Germany and Qing China, although their licenses limit them to validation. Public-domain period maps can support an independent reconstruction.

The exact day matters. All initial entities, relationships, wars, and borders must describe **1 January 1820**, not a loose blend of the 1820s. Later atlases are corroborating evidence only and cannot introduce states that did not yet exist.

## Source classes

| Source | Coverage | Use | Rights and constraints |
|---|---|---|---|
| [Historical Basemaps](https://github.com/aourednik/historical-basemaps) | Global country and cultural-region polygons, including an 1815 snapshot | **Local comparison layer** for finding roster omissions and ownership seams near the 1820 start. Run `npm run map:reference:audit`; the generated report stays under ignored `artifacts/`. | GPL-3.0, explicitly work in progress, and authored for world/continent scale. Do not vendor its GeoJSON or ship derived geometry in Grand Century. Every correction still needs independent 1820 evidence. |
| [GeoPolHist](https://medialab.github.io/GeoPolHist/) and its [status-over-time CSV](https://github.com/medialab/geopolhist/blob/master/data/GeoPolHist_entities_status_over_time.csv) | Global entity, dependency, claim, occupation, and recognition status from 1816 | **Machine-readable roster and relationship validation. It has no boundary geometry.** | ODbL. Shipping a derived database needs attribution and an ODbL/share-alike review. Individual classifications are sometimes coarse and need regional sources. |
| [Atlas of Historical County Boundaries](https://publications.newberry.org/ahcb/downloads/states.html) | United States states and territories, 1783-2000 | **Machine-usable shapefiles and KMZ** for dated US internal boundaries | Newberry permits lawful commercial and non-commercial reuse. The [Library of Congress record](https://www.loc.gov/item/2018487899/) marks the dataset CC0. It does not establish international or Indigenous frontiers. |
| [1829 Carte Generale de L'Afrique](https://geo.nyu.edu/catalog/stanford-bm864yd2626/metadata) | Africa | **Machine-usable georeferenced raster**, suitable as a tracing and comparison layer | Public domain and no restrictions. It is a period cartographic view, not reliable political polygon data. |
| [Library of Congress digitized maps and books](https://www.loc.gov/free-to-use/maps-of-cities/) | Global, with strong regional holdings | Public-domain **visual reference and transcribable facts** | Item rights statements must still be checked. The items cited below are free to use and reuse. Scans are not ready-made vectors. |
| [German Historical GIS, 1820](https://geo.nyu.edu/catalog/harvard-ghgis1820core/metadata) | German states on 31 December 1820 | Exact vector **validation only** | Free distribution is limited to non-commercial academic research. Commercial use requires an agreement. Do not copy or derive shipping geometry without permission. |
| [CHGIS V4](https://yugong.fudan.edu.cn/CHGIS/sjxz.htm) | Qing administrative boundaries and places, including an 1820 layer | Detailed vector **validation only** | The [license](https://yugong.fudan.edu.cn/CHGIS/bqsm.htm) limits use to non-commercial research and education and prohibits redistribution of the full data. Commercial use needs a separate agreement. |
| [Historical Atlas of South Asia](https://dsal.uchicago.edu/reference/schwartzberg/bootstrap_index.html) | South Asia, including British expansion in 1766-1819 and 1819-1857 | Scholarly **validation only** | Copyrighted. Reproduction requires permission. Do not trace shipping geometry from it without clearance. |
| [David Rumsey 1835 India map](https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~295959~90066882%3AIndia) and [Minnesota 1836 India map](https://geo.nyu.edu/catalog/p16022coll246%3A126) | India | Later **visual references** for direct possessions, protected states, and independent states. Every feature needs an 1820 cross-check. | Public access does not by itself grant unrestricted derivative use. Confirm collection terms before tracing. |
| [CShapes](https://icr.ethz.ch/data/cshapes/shapefile.html) and [SUNGEO](https://www.sungeo.org/documentation) | Global sovereign boundaries | None for this start date | CShapes begins in 1886; SUNGEO's state-historical GIS begins in 1895. Both are too late for 1820. |

Natural Earth or another modern basemap may supply coastlines, rivers, and a neutral editing mesh. It must not determine 1820 ownership. Modern ADM0 polygons are the main reason historical maps acquire anachronistic countries and distorted borders.

## Chronological corrections to the 1820 audit

The following are high-confidence corrections to proposed 1820 entities or ownership. GeoPolHist is useful here as a machine-readable first pass, but its broad labels such as "part of" and "colony" should be implemented through owner, overlord, occupation, and claim relationships rather than copied as one flat owner field.

| Area | Correct 1820 anchor | Chronological error to reject |
|---|---|---|
| Brazil | Brazil was not an independent state in 1820. It was a constituent kingdom of the United Kingdom of Portugal, Brazil and the Algarves; independence followed in 1822. GeoPolHist records Portuguese dependency through 1822. | Independent Empire of Brazil in 1820. |
| Uruguay/Cisplatina | Portuguese forces occupied Montevideo and much of the Banda Oriental while Artiguist resistance still survived on 1 January. Formal incorporation as Cisplatina followed in 1821; Uruguay became sovereign in 1828. | Independent Uruguay in 1820, or an Argentine national border projected backward. |
| Gran Colombia | The Republic of Colombia, usually called Gran Colombia, is a valid 1820 entity, although royalist control survived in parts of its claimed territory. It lasted until 1830-1831. | Separate sovereign Colombia, Venezuela, Ecuador, and Panama in 1820. |
| Central America | The Captaincy General of Guatemala remained Spanish until September 1821. The Federal Republic of Central America did not exist until 1823. | Independent Central American federation or modern Guatemala, Honduras, El Salvador, Nicaragua, and Costa Rica in 1820. |
| Egypt and Hejaz | Muhammad Ali's Egypt was an autonomous Ottoman vassal in practice. Egyptian forces had defeated the First Saudi State and controlled the Hejaz from 1818 under Ottoman suzerainty. Use Egyptian control plus Ottoman overlordship, not a fully sovereign flat annexation. | Direct Ottoman control with no Egyptian layer, or independent Hejaz/Nejd in 1820. GeoPolHist dates the restored Nejd polity from 1824. |
| Ottoman Levant | Syria and the Levant were directly Ottoman in 1820. Egyptian occupation came later, following the First Egyptian-Ottoman War in 1831-1833. | Egyptian Syria, Palestine, Lebanon, or Jordan in 1820. |
| India | The East India Company directly administered large territories, but Hyderabad, Awadh, Travancore, and other princely states retained governments under subsidiary or dependent relationships. The Sikh Empire, Nepal, Bhutan, and Kalat/Baluchistan require separate treatment. Contemporary map categories distinguish British possessions, protected states, and independent states. | Painting the whole subcontinent as direct British or EIC territory, or using the modern Republic of India outline. |
| Russian America | Alaska was Russian America until its 1867 transfer to the United States. | US Alaska in 1820. |
| US-Spanish frontier | Texas, Alta California, and Nuevo Mexico remained Spanish on 1 January 1820. Mexico did not become independent until 1821. Spanish and US claims around the Sabine boundary were only finally settled when the Adams-Onis Treaty took effect in 1821. | Mexican, Texan, or US ownership based on later borders. |
| Florida | East Florida remains Spanish on the opening date. The Adams-Onis transfer to the United States took effect in 1821; the Library of Congress [East Florida Papers](https://www.loc.gov/collections/east-florida-papers/about-this-collection/) preserve the Spanish colonial government's records through that transfer. | US ownership of the modern Florida polygon in January 1820. |
| Oregon Country | Britain and the United States had overlapping claims and joint occupation after 1818; Russian and Spanish claims also persisted on 1 January 1820. It should be a contested region with Indigenous ground control, not a normal US state polygon. | Homogeneous US ownership of the Pacific Northwest in 1820. |
| Qing frontiers | Mongolia, Tibet, and Xinjiang belonged to the Qing imperial order but were governed through distinct frontier institutions and relationships, not as ordinary provinces. CHGIS and GeoPolHist support Qing inclusion, while also showing why a single modern-China fill is too blunt. | Treating all three as fully independent sovereign peers in 1820, or treating them as ordinary modern Chinese provinces. |
| Dutch East Indies | Dutch colonial possessions were restored after 1816, but direct control was uneven and negotiated across the archipelago. Aceh remained sovereign, and many outer-island courts were not equivalent to centrally governed Java. | A single direct-Dutch polygon over the entire modern Indonesian archipelago. |

These corrections come principally from the [GeoPolHist status series](https://github.com/medialab/geopolhist/blob/master/data/GeoPolHist_entities_status_over_time.csv), checked against the contemporary and scholarly regional sources below. GeoPolHist's status model is evidence for relationships and dates, not precise ground control.

## 1820 initial roster and relationship strategy

The initial roster should maximize historically meaningful actors, not count modern successor states. A polity belongs on the map when it had a government, ruler, recognized corporate identity, or durable military and fiscal organization that gameplay can express. Dependency does not make a polity disappear.

Use three linked layers:

1. **Playable polity**: the actor with its own court, cabinet, military, treasury, or revolutionary command. Sovereign states, autonomous vassals, major princely states, and durable confederated members can all qualify.
2. **Imperial relationship**: overlord, tributary, subsidiary alliance, personal union, protectorate, or federal membership. This is diplomacy and obligation, not a replacement map color.
3. **Ground situation**: direct administration, occupation, rebellion, competing claim, Indigenous control, or low-confidence frontier. This determines local gameplay without pretending every frontier was surveyed.

### High-confidence opening blocs

| Theater | Initial playable and relationship strategy |
|---|---|
| Concert of Europe | Preserve Britain, Bourbon France, Austria, Russia, and Prussia as the central great powers. Model the United Kingdom of the Netherlands before Belgian independence, the Sweden-Norway personal union as two kingdoms under one monarch, Congress Poland under the Russian crown, and Finland as a Russian grand duchy. Spain begins with the liberal military uprising that started on 1 January, while Greece remains Ottoman because its war begins in 1821. |
| German Confederation | Use the member-state roster, with Austria and Prussia linked to the Confederation only through their federal territories. Preserve the free cities and small duchies as political actors or explicit minor members rather than merging them into generic Germany. |
| Italian states | Use Sardinia, Lombardy-Venetia under Austria, Parma, Modena, Tuscany, Lucca, the Papal States, Two Sicilies, San Marino, and Monaco. There is no Italian nation-state owner. |
| Portuguese monarchy | Represent the United Kingdom of Portugal, Brazil and the Algarves as a composite monarchy. Portugal and Brazil can be separately administered playable components under the same crown, which makes the 1820 Portuguese revolution and the coming Brazilian break legible without inventing an independent Brazil early. |
| Spanish American wars | Use Gran Colombia, Chile, Paraguay, the weak central government of the United Provinces of Rio de la Plata, and the Artiguist Federal League where it still controls ground. Northern and southern Haiti are separate states on 1 January: the Kingdom of Haiti and Republic of Haiti. Preserve Spanish Peru, New Spain, Guatemala, Santo Domingo, Cuba, Puerto Rico, and remaining royalist enclaves. Patriot and royalist control must be mapped below the claim layer. Do not spawn Mexico, the Central American federation, Uruguay, Bolivia, or independent Brazil on day one. |
| Ottoman system | Keep the Levant directly Ottoman. Egypt is a playable autonomous vassal, with Egyptian military control in the Hejaz and Ottoman suzerainty above it. Treat Algiers, Tunis, and Tripoli according to their distinct regency and vassal relationships rather than as ordinary Ottoman provinces. Nejd begins under Egyptian occupation after the destruction of the First Saudi State; Oman, Yemen, and the Gulf coastal sheikhdoms remain separate actors. The General Maritime Treaty that produced the later Trucial relationship had not yet been signed on 1 January. |
| South Asia | Split East India Company direct administration from its princely dependencies. Preserve Hyderabad, Awadh, Mysore, Travancore, major Rajput states, and the Maratha successor states such as Gwalior, Indore, Baroda, and Nagpur. The Sikh Empire, Nepal, Bhutan, and Kalat remain outside a direct British fill. |
| Qing imperial order | Use Qing as the imperial sovereign while preserving Mongolia, Tibet, and Xinjiang as distinct governed spaces with their own institutions and relationship records. This creates frontier gameplay without falsely promoting them to ordinary independent nation-states or flattening them into provinces. |
| Central and Southeast Asia | Preserve Persia, Afghanistan, Khiva, Bukhara, Kokand, Kalat, Burma, Siam, Vietnam, and Cambodia's overlapping Siamese and Vietnamese relationships. Avoid later Russian, British, French, or modern national borders. |
| Indonesia | Separate Dutch-administered cores from dependent courts, treaty relationships, contested zones, and independent states such as Aceh. The Netherlands can claim a colonial system without directly owning every island province. |
| Africa | Add documented states and confederacies as actual actors, including Sokoto and its emirate network, Bornu, Asante, Dahomey, Oyo and its rebellious or dependent provinces, Futa states, Segu and Kaarta, Kongo successors, Lunda, and Luba. Use confidence-tagged cores and influence frontiers where exact borders are not supportable. Empty European map space is not a country called `UNC`. |
| North American frontier | Use dated US state and territorial borders from Newberry, Russian America in Alaska, Spanish Texas/California/New Mexico, shared Anglo-American Oregon claims, and Indigenous political control below those claims. Claims should create diplomatic pressure without erasing the peoples controlling the ground. |

This structure creates country count and flavor through real 1820 institutions. It also makes the start dynamic: independence movements can consolidate, composite monarchies can fracture, imperial dependents can resist or integrate, and frontier claims can become surveyed borders through play.

## Regional reconstruction anchors

### Germany

Use member states, not a German national polygon. The [German Historical GIS 1820 layer](https://geo.nyu.edu/catalog/harvard-ghgis1820core) contains 41 polygons representing 38 of the 41 sovereign members of the German Confederation within the later German Empire. It excludes Austria, Luxembourg, and Liechtenstein and treats Schleswig with Denmark. Its geometry can validate a fresh reconstruction but cannot ship under the standard license. Because its snapshot is 31 December 1820, every change during that year must be checked before using it for 1 January.

The public-domain 1835 [Abridgement of Universal Geography](https://www.loc.gov/item/05037239/) is a later corroborating roster. Its enumeration includes Austria and Prussia's federal lands, Bavaria, Saxony, Hanover, Württemberg, Baden, the Hessian and Saxon duchies, Mecklenburg, Oldenburg, Brunswick, Nassau, the Anhalt, Schwarzburg, Reuss, Lippe and Hohenzollern states, Liechtenstein, and Bremen, Hamburg, Lübeck, and Frankfurt. Use it to catch missing small states, but never back-port its count or borders without checking changes since 1820.

Minimum validation rule: there must be no unified Germany, and the four free cities must not disappear merely because they are small.

### Italy

The same [1835 geography](https://www.loc.gov/item/05037239/) provides a later public-domain roster: the Kingdom of the Two Sicilies, Papal States, San Marino, Tuscany, Lucca, Modena, Parma, Austrian Italy, Monaco, and the Kingdom of Sardinia. These all have valid 1820 counterparts, but borders and rulers should be reconstructed from sources representing 1 January 1820.

Minimum validation rule: there must be no unified Italy. Lombardy-Venetia belongs to the Austrian imperial system; Sardinia-Piedmont includes Savoy and Nice; the Papal States cross central Italy; and the Bourbon Two Sicilies control the south and Sicily.

### India

Build three visually and mechanically distinct categories:

1. Company-administered presidencies and provinces.
2. Princely or protected states with their own ruler and an EIC/British overlord relationship.
3. Independent states outside Company paramountcy.

The [1835 India map](https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~295959~90066882%3AIndia), [1836 India map](https://geo.nyu.edu/catalog/p16022coll246%3A126), and scholarly [Historical Atlas of South Asia](https://dsal.uchicago.edu/reference/schwartzberg/bootstrap_index.html) explicitly support this distinction, but the later maps cannot supply 1820 borders without a change audit. GeoPolHist identifies Hyderabad and Awadh as dependent/vassal entities and the Sikh Empire and Kalat as sovereign entities in this period. Kashmir passed from Afghan to Sikh control in 1819.

Minimum validation rule: no modern India outline and no single British fill. Hyderabad, Awadh, the Sikh Empire, Nepal, Bhutan, Kalat, Mysore, Travancore, and major Rajput and Maratha successor states need explicit review.

### Central Asia

The [1834 Central Asia map](https://www.loc.gov/item/2006626074/), compiled from 1829 material and printed in 1839, gives a strong public-domain visual anchor. Its catalog summary identifies Persia, a multi-part Afghanistan, Baluchistan under Kalat, and the khanates or emirates including Khiva and Bukhara. GeoPolHist additionally supports Kokand, Bukhara, Khiva, and Afghanistan as distinct sovereign entities from 1816.

The public-domain [1835 Persia, Arabia, Tartary, and Afghanistan map](https://www.loc.gov/item/2013593033/) is a useful second view, but the Library of Congress explicitly notes its incomplete and inaccurate geography. Use agreement between sources for core polity placement and encode uncertain steppe and desert limits as frontiers rather than precise surveyed borders.

Minimum validation rule: no Russian fill over the later Russian Central Asian empire. Khiva, Bukhara, Kokand, Afghanistan, Persia, and Kalat must survive as separate entities.

### Arabia and the Ottoman-Egyptian border

At 1820-01-01, Egypt should have an Ottoman-overlord relationship while exercising its own government and military. The Levant remains directly Ottoman. The Hejaz belongs in an Egyptian-control/Ottoman-suzerainty relationship after the Egyptian campaign against the First Saudi State. Nejd is still under Egyptian occupation, not the restored Saudi polity that appears in 1824. Oman and Yemen require separate polities, and the Gulf coastal sheikhdoms later called the Trucial States should not be merged into a modern UAE. The General Maritime Treaty was signed after the start date in January 1820. The [1835 regional map](https://www.loc.gov/item/2013593033/) provides a later public-domain visual check, while GeoPolHist supplies dates and relationship types.

Minimum validation rule: the Ottoman Empire, Egypt, Nejd, Oman, Yemen, and the Gulf sheikhdoms cannot be collapsed into modern national polygons. Control and suzerainty must be separate fields.

### West and Central Africa

No source supports a clean modern-style sovereign tessellation across the entire region. The public-domain georeferenced [1829 Africa map](https://geo.nyu.edu/catalog/stanford-bm864yd2626/metadata) can align period labels and routes, while the Library of Congress [African maps guide](https://guides.loc.gov/maps-illustrated-guide/african-maps) points to early Liberian maps that record settlements and Indigenous political districts.

Blank space on a European map is not unowned land. A [Library of Congress map-history analysis](https://blogs.loc.gov/maps/2024/07/west-african-collections/) shows how an 1833 colonization map omitted Indigenous towns and polities that its own source text knew existed. It also discusses locally made maps whose claimed domains were contested. The correct game model is named polity cores, settlement and trade networks, influence zones, and uncertain or disputed frontiers. Do not create an `UNC` country as a substitute for research.

Minimum validation rule: Sokoto and its emirate relationships, Bornu, Asante, Dahomey, Oyo's successor landscape, Futa states, Segu/Kaarta, coastal states, Kongo successor polities, Lunda, Luba, and other regionally documented powers must be checked before any generic fill is accepted. Their exact extents need regional evidence and confidence metadata, not modern borders projected backward.

### Southeast Asia and Indonesia

GeoPolHist supports Burma, Siam, and Vietnam as distinct sovereign states. It records Cambodia under overlapping Siamese and Vietnamese relationships in 1820, which requires relationship and control layers rather than a simple independent-state fill.

For Indonesia, the Dutch National Archives' official [overseas map guide](https://www.nationaalarchief.nl/onderzoeken/kaarten-en-tekeningen/navigatie-en-overzeese-expansie) identifies the Ministry of Colonies, topographic, and comprehensive Netherlands East Indies map series beginning in 1814-1816. These are the right archival collections for island-by-island adjudication. The archive's [research guide](https://nationaalarchief.nl/onderzoeken/zoekhulpen/slavernij-en-slavenhandel-in-nederlands-indie-1820-1900) also distinguishes centrally governed Java and Madura from outer possessions, confirming that Dutch imperial reach was not one uniform administrative condition. GeoPolHist preserves Aceh as sovereign until the late nineteenth century.

Minimum validation rule: no modern Indonesia polygon owned uniformly by the Netherlands. At minimum, distinguish core Dutch administration, dependent or treaty-linked courts, independent states such as Aceh, and areas where the map evidence supports only a claim or sphere of influence.

### North American frontier

Use the [Newberry Atlas of Historical County Boundaries](https://publications.newberry.org/ahcb/pages/United_States.html) for dated US state and territorial boundaries. Do not extend it beyond its scope into an international-control source.

The 1820 southwest remains Spanish: Texas, Nuevo Mexico, and Alta California are not Mexican, Texan, or American entities yet. The later public-domain [1835 map of Texas](https://www.loc.gov/item/2008625106/) is useful for physical alignment and retrospective comparison, not for ownership. Russian America remains Russian. Oregon requires simultaneous British, US, Spanish, and Russian claims as applicable on 1 January, with Indigenous ground control rather than a single owner. Use the [Newberry Atlas](https://publications.newberry.org/ahcb/pages/United_States.html) for exact US territorial organization on the start date.

Minimum validation rule: Alaska is Russian; California, Nuevo Mexico, and Texas are Spanish; and Oregon has no homogeneous owner at the January 1820 start.

## Reconstruction protocol

Every political polygon or relationship should carry this provenance record:

```text
asOf: exact ISO date
entity: stable internal polity ID
relationship: sovereign | direct-administration | vassal | protectorate | occupation | claim
overlord: optional polity ID
source: item-level URL and page/map identifier
sourceDate: date represented by the source, not only publication date
confidence: high | medium | low
license: public-domain | ODbL | validation-only | permission-required
notes: contradiction, interpolation, or disputed-boundary explanation
```

Recommended build order:

1. Freeze 1820-01-01 and publish an authoritative entity/relationship roster before drawing.
2. Use a modern physical basemap only for coastlines, rivers, and the editable mesh.
3. Reconstruct one region at a time from public-domain period sources, checking roster and status against GeoPolHist and the restricted academic datasets.
4. Represent dependencies, occupations, revolts, shared claims, and uncertain frontiers explicitly. A single `owner` field cannot reproduce this world.
5. Preserve the source and confidence record beside every authored feature so later corrections are local and auditable.
6. Add map assertions for the minimum validation rules above, including prohibited anachronisms such as unified Germany/Italy, independent 1820 Uruguay, US Alaska, direct-British all-India, and uniform Dutch Indonesia.

The Historical Basemaps comparison is deliberately outside the runtime build. Its source URL is pinned in `content/history/1820/reference-basemaps.json`; the audit retains names and mismatch metrics but never copies coordinates into its report. `provinceOverrides` records independently checked 1820 conclusions that take precedence over the 1815 comparison layer.

## Bottom line

The weak map is not primarily a polygon-count problem. It is a time model and provenance problem. Locking 1820-01-01, separating sovereignty from control and overlordship, and rebuilding from source-backed regional overlays will increase country count and flavor without replacing one false clean map with another. The result should feel specifically post-Napoleonic: revolutions in motion, composite monarchies under strain, a young Concert of Europe, and imperial frontiers that are still political systems rather than fixed lines.
