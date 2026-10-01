"""Stage 6: name provinces after their principal 1830 town, Victoria 2 style.

Candidates inside each province, in priority order:
  1. content/history/1830/cities.json (curated, period display names)
  2. Natural Earth populated places, by rank then population, with modern
     names mapped back to 1830 forms and towns founded after 1830 excluded
Provinces without a qualifying town take their first-level region name when
they are most of it, else their largest unit's name. Names are unique.
Reviewed overrides in names-1830.json (province key -> name) win over all.
"""
import json, sys, unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from shapely import STRtree, make_valid
from shapely.geometry import shape, Point

PROVINCES, PIECES, PROVINCE_LIST, PLACES, CITIES, OVERRIDES, OUT = [Path(p) for p in sys.argv[1:8]]

# Modern name -> 1830 name. Keep to places whose 1830 name is well attested.
ERA = {
    'Mumbai': 'Bombay', 'Chennai': 'Madras', 'Kolkata': 'Calcutta', 'Bengaluru': 'Bangalore', 'Pune': 'Poona',
    'Kanpur': 'Cawnpore', 'Varanasi': 'Benares', 'Prayagraj': 'Allahabad', 'Thiruvananthapuram': 'Trivandrum',
    'Kochi': 'Cochin', 'Vadodara': 'Baroda', 'Vishakhapatnam': 'Vizagapatam', 'Visakhapatnam': 'Vizagapatam',
    'Mysuru': 'Mysore', 'Kozhikode': 'Calicut', 'Puducherry': 'Pondicherry', 'Yangon': 'Rangoon', 'Mawlamyine': 'Moulmein',
    'Ho Chi Minh City': 'Saigon', 'Hanoi': 'Thang Long', 'Jakarta': 'Batavia', 'Makassar': 'Makassar',
    'Guangzhou': 'Canton', 'Tokyo': 'Edo', 'Istanbul': 'Constantinople', 'Izmir': 'Smyrna', 'Oslo': 'Christiania',
    'Helsinki': 'Helsingfors', 'Turku': 'Åbo', 'Tallinn': 'Reval', 'Tartu': 'Dorpat', 'Gdansk': 'Danzig', 'Gdańsk': 'Danzig',
    'Wroclaw': 'Breslau', 'Wrocław': 'Breslau', 'Poznan': 'Posen', 'Poznań': 'Posen', 'Szczecin': 'Stettin',
    'Kaliningrad': 'Königsberg', 'Bratislava': 'Pressburg', 'Ljubljana': 'Laibach', 'Zagreb': 'Agram', 'Lviv': 'Lemberg',
    'Chernivtsi': 'Czernowitz', 'Cluj-Napoca': 'Klausenburg', 'Brasov': 'Kronstadt', 'Brașov': 'Kronstadt', 'Sibiu': 'Hermannstadt',
    'Timisoara': 'Temesvár', 'Timișoara': 'Temesvár', 'Oradea': 'Nagyvárad', 'Kosice': 'Kaschau', 'Košice': 'Kaschau',
    'Brno': 'Brünn', 'Ostrava': 'Mährisch Ostrau', 'Plzen': 'Pilsen', 'Plzeň': 'Pilsen', 'Olomouc': 'Olmütz',
    'Volgograd': 'Tsaritsyn', 'Samara': 'Samara', 'Yekaterinburg': 'Yekaterinburg', 'Nizhny Novgorod': 'Nizhny Novgorod',
    'Dnipro': 'Yekaterinoslav', 'Dnipropetrovsk': 'Yekaterinoslav', 'Donetsk': 'Bakhmut', 'Kryvyi Rih': 'Krivoy Rog',
    'Zaporizhzhia': 'Aleksandrovsk', 'Kropyvnytskyi': 'Yelisavetgrad', 'Tbilisi': 'Tiflis', 'Ganja': 'Elisabethpol',
    'Gyumri': 'Gyumri', 'Almaty': 'Vernoye', 'Bishkek': 'Pishpek', 'Dushanbe': 'Dyushambe', 'Ashgabat': 'Askhabad',
    'Thessaloniki': 'Salonica', 'Edirne': 'Adrianople', 'Plovdiv': 'Philippopolis', 'Bitola': 'Monastir',
    'Iznik': 'Nicaea', 'Trabzon': 'Trebizond', 'Antakya': 'Antioch', 'Sanliurfa': 'Urfa', 'Şanlıurfa': 'Urfa',
    'Kahramanmaras': 'Marash', 'Gaziantep': 'Aintab', 'Diyarbakir': 'Diyarbekir', 'Diyarbakır': 'Diyarbekir',
    'Tel Aviv-Yafo': 'Jaffa', 'Kinshasa': 'Kinshasa', 'Maputo': 'Lourenço Marques', 'Luanda': 'São Paulo de Luanda',
    'Beijing': 'Beijing', 'Nanjing': 'Nanjing', 'Shenyang': 'Mukden', 'Xian': "Xi'an", "Xi'an": "Xi'an",
    'Seoul': 'Seoul', 'Taipei': 'Taipei', 'Kaohsiung': 'Takow', 'Tainan': 'Taiwan-fu', 'Lhasa': 'Lhasa',
    'Ulaanbaatar': 'Urga', 'Hohhot': 'Guihua', 'Urumqi': 'Dihua', 'Ürümqi': 'Dihua', 'Kashgar': 'Kashgar',
    'New York': 'New York', 'Washington, D.C.': 'Washington', 'Washington': 'Washington', 'Toronto': 'York',
    'Thunder Bay': 'Fort William', 'Montreal': 'Montréal', 'Quebec': 'Québec', 'Winnipeg': 'Fort Garry',
    'Ciudad Juárez': 'El Paso del Norte', 'Kingston': 'Kingston', 'Port-au-Prince': 'Port-au-Prince',
    'Chișinău': 'Kishinev', 'Chisinau': 'Kishinev', 'Vilnius': 'Wilno', 'Kaunas': 'Kovno', 'Grodno': 'Grodno', 'Hrodna': 'Grodno',
    'Minsk': 'Minsk', 'Kyiv': 'Kiev', 'Kiev': 'Kiev', 'Kharkiv': 'Kharkov', 'Odesa': 'Odessa', 'Mykolaiv': 'Nikolaev',
    'Sevastopol': 'Sevastopol', 'Simferopol': 'Simferopol', 'Lublin': 'Lublin', 'Lodz': 'Łódź', 'Bydgoszcz': 'Bromberg',
    'Torun': 'Thorn', 'Toruń': 'Thorn', 'Olsztyn': 'Allenstein', 'Opole': 'Oppeln', 'Gliwice': 'Gleiwitz', 'Katowice': 'Kattowitz',
    'Legnica': 'Liegnitz', 'Klaipeda': 'Memel', 'Klaipėda': 'Memel', 'Riga': 'Riga', 'Daugavpils': 'Dünaburg',
    'Bolzano': 'Bozen', 'Trento': 'Trient', 'Rijeka': 'Fiume', 'Split': 'Spalato', 'Dubrovnik': 'Ragusa', 'Zadar': 'Zara',
    'Koper': 'Capodistria', 'Pula': 'Pola', 'Novi Sad': 'Neusatz', 'Subotica': 'Szabadka', 'Belgrade': 'Belgrade',
    'Sarajevo': 'Sarajevo', 'Podgorica': 'Podgorica', 'Shkoder': 'Scutari', 'Shkodër': 'Scutari', 'Durres': 'Durazzo', 'Durrës': 'Durazzo',
    'Bucharest': 'Bucharest', 'Iasi': 'Jassy', 'Iași': 'Jassy', 'Constanta': 'Küstendje', 'Constanța': 'Küstendje',
    'Varna': 'Varna', 'Ruse': 'Rustchuk', 'Sofia': 'Sofia', 'Skopje': 'Üsküb', 'Nicosia': 'Nicosia',
    'Ankara': 'Angora', 'Bursa': 'Brusa', 'Konya': 'Konya', 'Kayseri': 'Kayseri', 'Erzurum': 'Erzurum',
    'Faisalabad': 'Lyallpur', 'Islamabad': 'Rawalpindi', 'Dhaka': 'Dacca', 'Chittagong': 'Chittagong',
    'Sri Jayawardenepura Kotte': 'Colombo', 'Male': 'Malé', 'Kathmandu': 'Kathmandu',
    'Port Louis': 'Port Louis', 'Antananarivo': 'Antananarivo', 'Zanzibar': 'Zanzibar',
}
# Founded or first chartered after 1830; never used as a province name.
POST_1830 = set('''Brasília Brasilia Canberra Islamabad Abuja Dodoma Yamoussoukro Belmopan Gaborone Lilongwe Nouakchott
Chandigarh Johannesburg Pretoria Nairobi Kampala Harare Lusaka Bulawayo Windhoek Wellington Auckland Christchurch
Vancouver Seattle Denver Miami Melbourne Adelaide Darwin Anchorage Dallas Houston Atlanta Minneapolis Calgary Regina
Saskatoon Novosibirsk Vladivostok Khabarovsk Harbin Qingdao Dalian Yokohama Kobe Kuala Lumpur Ipoh Port Said Ismailia
Djibouti Asmara Addis Ababa Mogadishu Juba Kinshasa Brazzaville Lubumbashi Kisangani Libreville Bangui Ndjamena N'Djamena
Niamey Bamako Ouagadougou Conakry Dakar Bissau Lomé Lome Cotonou Accra Lagos Port Harcourt Douala Yaoundé Yaounde
Malabo Luanda Maputo Beira Blantyre Antsiranana Durban East London Port Elizabeth Bloemfontein Kimberley Mbabane Maseru
Tel Aviv-Yafo Astana Nur-Sultan Karaganda Magnitogorsk Norilsk Murmansk Arkhangelsk Hong Kong Kowloon Shenzhen
Singapore Manaus Belo Horizonte Goiânia Goiania Campo Grande Porto Velho Rio Branco Boa Vista Macapá Palmas
La Paz Rosario Mar del Plata Bahia Blanca Neuquén Comodoro Rivadavia Punta Arenas Antofagasta Iquique Arica
Phoenix Las Vegas Salt Lake City Portland Spokane Fresno Sacramento Oakland San Jose Tucson Albuquerque Oklahoma City Tulsa
Omaha Kansas City Wichita Fargo Bismarck Billings Boise Reno Cheyenne Lincoln Topeka Tacoma Edmonton Victoria Halifax Hamilton
Thunder Bay Sudbury Juneau Fairbanks Honolulu Perth Brisbane Townsville Cairns Hobart Alice Springs Broken Hill Kalgoorlie
'''.split()) - {'Halifax', 'Hamilton', 'Victoria', 'Perth', 'Brisbane', 'Hobart', 'Singapore', 'Luanda', 'Accra', 'Lagos', 'Dakar', 'Bissau', 'La Paz', 'Rosario', 'Maputo', 'Mogadishu'}
POST_1830 |= {'Hong Kong', 'Kuala Lumpur', 'Port Said', 'Addis Ababa', 'Port Harcourt', 'East London', 'Port Elizabeth',
              'Tel Aviv-Yafo', 'Belo Horizonte', 'Campo Grande', 'Porto Velho', 'Rio Branco', 'Boa Vista', 'Mar del Plata',
              'Bahia Blanca', 'Comodoro Rivadavia', 'Punta Arenas', 'Las Vegas', 'Salt Lake City', 'San Jose', 'Oklahoma City',
              'Kansas City', 'Thunder Bay', 'Alice Springs', 'Broken Hill', 'Kuala Lumpur', 'Nur-Sultan', 'Novi Sad'} - {'Novi Sad'}

def fold(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()

def main():
    feats = json.load(open(PROVINCES))['features']
    geoms = []
    for f in feats:
        g = shape(f['geometry']); geoms.append(g if g.is_valid else make_valid(g))
    tree = STRtree(geoms)
    def province_of(lon, lat):
        p = Point(lon, lat)
        for j in tree.query(p):
            if geoms[j].contains(p): return int(j)
        return None
    cand = defaultdict(list)
    for c in json.load(open(CITIES))['cities']:
        j = province_of(c['lon'], c['lat'])
        if j is not None: cand[j].append((-1, c['importance'], 0, c['name']))
    for f in json.load(open(PLACES))['features']:
        p = f['properties']
        name = p.get('NAME') or p.get('NAMEASCII')
        if not name or name in POST_1830: continue
        x, y = f['geometry']['coordinates']
        j = province_of(x, y)
        if j is None: continue
        cand[j].append((0, p.get('SCALERANK', 10), -(p.get('POP_MAX') or 0), ERA.get(name, name)))
    overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    # largest units and region coverage for fallbacks
    pieces = {}
    for line in PIECES.open():
        r = json.loads(line); pieces[r['piece']] = (r['name'], r['adm1Name'], r['adm1'], r['km2'])
    adm1_area = defaultdict(float)
    for n, a1n, a1, km in pieces.values(): adm1_area[a1] += km
    members = [json.loads(l)['members'] for l in PROVINCE_LIST.open()]
    keys = []
    import hashlib
    for m in members: keys.append(hashlib.sha1(','.join(sorted(m)).encode()).hexdigest()[:12])
    names = []
    for pid, f in enumerate(feats):
        if keys[pid] in overrides:
            names.append((overrides[keys[pid]], 'override')); continue
        c = sorted(cand.get(pid, []))
        if c:
            names.append((c[0][3], 'town')); continue
        by_adm1 = defaultdict(float); largest = None
        for m in members[pid]:
            n, a1n, a1, km = pieces[m]; by_adm1[(a1, a1n)] += km
            if largest is None or km > largest[1]: largest = (n, km)
        (a1, a1n), share = max(by_adm1.items(), key=lambda kv: kv[1])
        if a1n and share >= 0.5 * adm1_area[a1]: names.append((a1n, 'region'))
        else: names.append((largest[0], 'unit'))
    # uniqueness: suffix the region, then a number
    count = Counter(fold(n) for n, _ in names)
    used = set(); final = []
    for pid, (n, how) in enumerate(names):
        if count[fold(n)] > 1:
            region = Counter()
            for m in members[pid]: region[pieces[m][1]] += pieces[m][3]
            r = region.most_common(1)[0][0]
            if r and fold(r) != fold(n): n = f'{n} ({r})'
        base, k = n, 2
        while fold(n) in used: n = f'{base} {k}'; k += 1
        used.add(fold(n)); final.append({'id': pid, 'key': keys[pid], 'name': n, 'source': how})
    OUT.write_text(json.dumps(final, ensure_ascii=False))
    print(json.dumps(Counter(x['source'] for x in final)))

if __name__ == '__main__':
    main()
