# Reviewed 1830 province names

`names-1830.json` maps a province key (the stable 12-hex key from `names.py`)
to a reviewed name. `names.py` applies these overrides before its automatic
namer, so only provinces whose generated name was wrong for 1 January 1830
appear in the file. Every one of the 2,091 provinces was reviewed; 1,050 were
renamed.

`check_names_1830.py <names.json>` validates the file against a names stage
output: every key must exist, final names must be unique under the same case
and accent folding `names.py` uses, and no name may contain en or em dashes,
control characters or bidi marks.

## Conventions

- **The name a well-read English reader of 1830 would use.** Period English
  exonyms where one existed (Archangel, Corunna, Saragossa, Cordova, Candia,
  Janina, Smyrna, Trondhjem, Gothenburg, Bois-le-Duc, Akyab, Mergui), and
  otherwise the period local or imperial form (Vyatka, Simbirsk, Ust-Sysolsk,
  Yekaterinodar, Puerto Principe, Ega, Angostura, Porto Real). Exonyms stay
  consistent with the display names in `content/history/1830/cities.json`.
- **Imperial frames follow the 1830 owner.** Prussian, Austrian and Danish
  lands use the German or Danish forms (Gnesen, Lyck, Budweis, Reichenberg,
  Troppau, Christianshaab), Russian lands the Russian forms (Mogilev, Vitebsk,
  Ponevezh, Rovno, Zhitomir), Congress Poland its Polish town names, Qing
  China the prefecture or county seat of the day (Shaozhou, Yuezhou, Raozhou,
  Ningyuan), and the Hungarian crown lands the Hungarian forms used elsewhere
  in the game (Nagybanya, Marosvasarhely, Debrecen).
- **Towns founded or renamed after 1830 give way** to the principal 1830
  settlement inside the province, checked against the province polygon
  (Oeiras for Picos, Paracatu for Uberlandia, Natchez for Jackson, Monterey for
  Salinas, Grahamstown for Bhisho, Novocherkassk for Shakhty, Mecca for Jeddah).
- **Where no 1830 town fits, a period region, people, river or post is used**:
  forts and trading posts in North America and Siberia (Fort Chipewyan, Fort
  Vancouver, Fort Snelling, Okhotsk, Gizhiga), kingdoms and peoples in Africa
  (Kong, Kuba, Luba, Bunyoro, Usambara, Oyo, Nupe, Ovamboland), and
  navigators' or settlers' names on coasts that were charted but not settled
  (Arnhem Land, Shark Bay, De Witt's Land, Cape York, Geelvink Bay, Huon Gulf,
  MacCluer Gulf, Port Nicholson, Cape Lopez).
- **Uncharted interiors take a geographic name** that a later reader will
  recognise when nothing period-accurate exists (Great Sandy Desert, Barkly
  Tableland, Channel Country, Upper Xingu, Lower Purus). These are the least
  certain names in the file and are good candidates for further review.
- **Administrative jargon is removed**: departments, counties, voivodeships,
  autonomous counties, banners, governorates and districts become towns or
  historical regions (powiat ostrodzki to Osterode, Weininglizuhuizumiaozu
  zizhixian to Weining, Wulatezhongqi to Urad, Paris Paris to Darb al-Arbain,
  Easter Island Province to Rapa Nui, Waitangi to Chatham Islands). French
  departments are kept: they are period names.
- **Uniqueness without numbers or brackets.** Duplicates are separated by the
  place each province actually centres on (Swan River and Perth, Cape Breton
  and Sydney, Vitoria and Macapa for the two Vila Velhas, Cordova and Cordoba,
  Hydrabad, the period spelling for the Sindh capital, and Hyderabad).
- **Short and plain**: under 22 characters, no diacritic-only distinctions.

## Notable categories

| Category | Count | Examples |
|---|---|---|
| Post-1830 town or name replaced | 627 | Lashkar Gah to Girishk, Abidjan to Grand-Bassam, Tamale to Gonja |
| Administrative or unit name replaced | 181 | Roper Gulf to Roper River, Lubusz Voivodeship to Landsberg |
| Period exonym or spelling | 148 | Chattogram to Chittagong, Iraklio to Candia, Kirov to Vyatka |
| Duplicate or bracketed name resolved | 49 | Sydney (Nova Scotia) to Cape Breton, Kassel (Hessen) 2 to Waldeck |
| Sparse region named for region or people | 45 | Tamanrasset to Ahaggar, Krasino to Novaya Zemlya |

Curated 1830 cities that fall just off a coastline were missed by the automatic
namer; their provinces now carry the city name (St. Petersburg, Stockholm,
Lisbon, Constantinople, Algiers, Philadelphia).
