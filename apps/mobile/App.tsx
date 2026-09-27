import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { AppState, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import atlas from './assets/game/atlas.json';
import worldSeed from './assets/game/worldSeed.json';
import { NativeSimTransport } from './game/NativeSimTransport';
import type { WorldSnapshot } from '../../src/shared/types';

type Nation = (typeof worldSeed.nations)[number];
type Province = (typeof worldSeed.provinces)[number];
const paper = '#f4f0e6';
const ink = '#1d3038';
const wax = '#c99b54';
const navy = '#142a35';
const mapStyle = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'sea', type: 'background' as const, paint: { 'background-color': '#a5bec5' } }],
};

function NationPicker({ onSelect }: { onSelect: (nation: Nation) => void }) {
  const [query, setQuery] = useState('');
  const nations = useMemo(() => worldSeed.nations
    .filter((nation) => nation.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [query]);
  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <Text style={styles.brand}>GRAND CENTURY</Text>
        <Text style={styles.heroTitle}>The world is yours to shape.</Text>
        <Text style={styles.heroBody}>Lead a nation through an age of industry, diplomacy, and revolution.</Text>
        <Text style={styles.heroFoot}>1830 CAMPAIGN  ·  SINGLE PLAYER</Text>
      </View>
      <View style={styles.pickerContent}>
      <Text style={styles.eyebrow}>BEGIN A CAMPAIGN</Text>
      <Text style={styles.title}>Choose a nation</Text>
      <TextInput accessibilityLabel="Search nations" placeholder="Search nations"
        placeholderTextColor="#817e76" value={query} onChangeText={setQuery} style={styles.search} />
      <Text style={styles.resultCount}>{nations.length} NATIONS</Text>
      <FlatList data={nations} keyExtractor={(nation) => nation.tag} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.emptyText}>No nations match that search.</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Start as ${item.name}`}
            onPress={() => onSelect(item)} style={({ pressed }) => [styles.nationRow, pressed && styles.pressed]}>
            <View style={[styles.swatch, { backgroundColor: colorOf(item) }]} />
            <View style={styles.nationText}><Text style={styles.nationName}>{item.name}</Text><Text style={styles.nationTag}>{item.tag}</Text></View>
            <Text style={styles.rowArrow}>›</Text>
          </Pressable>
        )} />
      </View>
    </View>
  );
}

function colorOf(nation: Nation) {
  return `#${nation.color.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function Atlas({ nation, onBack }: { nation: Nation; onBack: () => void }) {
  const [province, setProvince] = useState<Province | null>(null);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [transport, setTransport] = useState<NativeSimTransport | null>(null);
  const capital = worldSeed.provinces.find((item) => item.id === nation.capitalProvinceId);
  const center: [number, number] = capital ? [capital.lon, capital.lat] : [0, 20];
  const player = snapshot?.nations[snapshot.playerNation];
  const selected = province && snapshot?.provinces[province.id];
  const owner = selected && snapshot?.nations[selected.owner];

  useEffect(() => {
    const sim = new NativeSimTransport();
    sim.onMessage((message) => {
      if (message.t === 'snapshot') setSnapshot(message.snapshot);
      if (message.t === 'log' && message.level === 'error') console.error(message.msg);
    });
    setTransport(sim);
    sim.send({ t: 'init', seed: 1830 });
    sim.send({ t: 'command', cmd: {
      t: 'newGame', seed: 1830,
      playerNation: worldSeed.nations.findIndex((item) => item.tag === nation.tag),
    } });
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') sim.send({ t: 'command', cmd: { t: 'setSpeed', speed: 0 } });
    });
    return () => {
      appState.remove();
      sim.dispose();
    };
  }, [nation.tag]);

  return (
    <View style={styles.mapPage}>
      <Map mapStyle={mapStyle} style={styles.map} touchRotate={false} touchPitch={false}>
        <Camera initialViewState={{ center, zoom: capital ? 3 : 1 }} />
        <GeoJSONSource id="provinces" data={atlas as GeoJSON.FeatureCollection}
          onPress={(event) => {
            const id = Number(event.nativeEvent.features?.[0]?.properties?.id);
            setProvince(worldSeed.provinces.find((item) => item.id === id) ?? null);
          }}>
          <Layer id="political-fill" type="fill"
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.94 }} />
          <Layer id="province-line" type="line"
            paint={{ 'line-color': '#52616a', 'line-opacity': 0.55, 'line-width': 0.5 }} />
          <Layer id="selection-line" type="line"
            filter={['==', ['get', 'id'], province?.id ?? -1]}
            paint={{ 'line-color': wax, 'line-width': 3 }} />
        </GeoJSONSource>
      </Map>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose another nation" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.topTitleBlock}><Text style={styles.topEyebrow}>GRAND CENTURY / 1830</Text><Text style={styles.topTitle} numberOfLines={1}>{nation.name}</Text></View>
      </View>
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>TREASURY</Text><Text style={styles.summaryValue}>{player ? `£${Math.round(player.treasury).toLocaleString()}` : '...'}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>PRESTIGE</Text><Text style={styles.summaryValue}>{player ? Math.round(player.prestige).toLocaleString() : '...'}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>PROVINCES</Text><Text style={styles.summaryValue}>{player?.numProvinces ?? '...'}</Text></View>
      </View>
      <View style={styles.bottomDock}>
      {province && <View style={styles.provinceSheet}>
        <View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>PROVINCE / {province.terrain.toUpperCase()}</Text><Text style={styles.sheetTitle}>{province.name}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close province detail" onPress={() => setProvince(null)}><Text style={styles.closeText}>×</Text></Pressable></View>
        <View style={styles.provinceFacts}><View><Text style={styles.factLabel}>OWNER</Text><Text style={styles.factValue}>{owner?.name ?? province.ownerTag}</Text></View><View><Text style={styles.factLabel}>POPULATION</Text><Text style={styles.factValue}>{selected?.population.toLocaleString() ?? '...'}</Text></View></View>
      </View>}
      <View style={styles.clockBar}>
        <View><Text style={styles.clockLabel}>CAMPAIGN DATE</Text><Text style={styles.clockText}>{snapshot ? `${snapshot.date.day} / ${snapshot.date.month} / ${snapshot.date.year}` : 'Loading...'}</Text></View>
        <View style={styles.speedControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Decrease game speed" disabled={!snapshot || snapshot.speed === 0}
          onPress={() => transport?.send({ t: 'command', cmd: { t: 'setSpeed', speed: Math.max(0, (snapshot?.speed ?? 0) - 1) } })} style={styles.speedStep}><Text style={styles.speedStepText}>−</Text></Pressable>
        <Pressable accessibilityRole="button"
          accessibilityLabel={snapshot?.speed ? 'Pause game' : 'Resume game'}
          onPress={() => transport?.send({ t: 'command', cmd: { t: 'setSpeed', speed: snapshot?.speed ? 0 : 2 } })}
          style={styles.speedButton}>
          <Text style={styles.speedText}>{snapshot?.speed ? 'Ⅱ' : '▶'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Increase game speed" disabled={!snapshot}
          onPress={() => transport?.send({ t: 'command', cmd: { t: 'setSpeed', speed: Math.min(5, (snapshot?.speed ?? 0) + 1) } })} style={styles.speedStep}><Text style={styles.speedStepText}>+</Text></Pressable>
        </View>
      </View>
      </View>
    </View>
  );
}

export default function App() {
  const [nation, setNation] = useState<Nation | null>(null);
  return <View style={styles.root}>
    <StatusBar style={nation ? 'light' : 'dark'} />
    {nation ? <Atlas nation={nation} onBack={() => setNation(null)} /> : <NationPicker onSelect={setNation} />}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: paper },
  page: { flex: 1 },
  hero: { backgroundColor: navy, paddingTop: 72, paddingHorizontal: 24, paddingBottom: 26 },
  brand: { color: wax, fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  heroTitle: { color: '#fffdf7', fontSize: 38, fontWeight: '800', lineHeight: 43, marginTop: 26, letterSpacing: -1 },
  heroBody: { color: '#c2d0d2', fontSize: 15, lineHeight: 23, marginTop: 12 },
  heroFoot: { color: '#a9bec2', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, borderTopColor: '#49606a', borderTopWidth: 1, paddingTop: 15, marginTop: 24 },
  pickerContent: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  eyebrow: { color: '#9c713a', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: ink, fontSize: 26, fontWeight: '800', marginTop: 5, marginBottom: 18 },
  search: { backgroundColor: '#fffdf7', borderColor: '#ddd8cb', borderWidth: 1, borderRadius: 12, color: ink, fontSize: 16, paddingHorizontal: 16, paddingVertical: 13 },
  resultCount: { color: '#66747a', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: 20, marginBottom: 7 },
  nationRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderBottomColor: '#ddd8cb', borderBottomWidth: 1, gap: 14 },
  pressed: { opacity: 0.55 },
  swatch: { width: 34, height: 34, borderRadius: 9, borderColor: '#53616a', borderWidth: 1 },
  nationText: { flex: 1 },
  nationName: { color: ink, fontSize: 17, fontWeight: '700' },
  nationTag: { color: '#66747a', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  rowArrow: { color: '#66747a', fontSize: 29 },
  emptyText: { color: '#66747a', paddingVertical: 24 },
  mapPage: { flex: 1, backgroundColor: '#a5bec5' },
  map: { flex: 1 },
  topBar: { position: 'absolute', top: 52, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: navy, borderRadius: 14, padding: 8, gap: 10 },
  backButton: { backgroundColor: '#25404d', borderRadius: 9, width: 43, height: 43, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fffdf7', fontSize: 31, lineHeight: 34 },
  topTitleBlock: { flex: 1, paddingRight: 8 },
  topEyebrow: { color: wax, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  topTitle: { color: '#fffdf7', fontSize: 19, fontWeight: '800', marginTop: 2 },
  summaryBar: { position: 'absolute', top: 122, left: 14, right: 14, flexDirection: 'row', backgroundColor: '#fffdf7', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 5 },
  summaryItem: { flex: 1, alignItems: 'center', borderRightColor: '#ddd8cb' },
  summaryLabel: { color: '#66747a', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  summaryValue: { color: ink, fontSize: 15, fontWeight: '800', marginTop: 4 },
  bottomDock: { position: 'absolute', bottom: 22, left: 14, right: 14, gap: 10 },
  provinceSheet: { backgroundColor: '#fffdf7', borderRadius: 15, padding: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitle: { color: ink, fontSize: 24, fontWeight: '800', marginTop: 4 },
  closeText: { color: '#66747a', fontSize: 27, lineHeight: 30 },
  provinceFacts: { flexDirection: 'row', gap: 26, borderTopColor: '#ddd8cb', borderTopWidth: 1, marginTop: 16, paddingTop: 12 },
  factLabel: { color: '#66747a', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  factValue: { color: ink, fontSize: 14, fontWeight: '700', marginTop: 4 },
  clockBar: { backgroundColor: navy, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 17, paddingRight: 9, paddingVertical: 10 },
  clockLabel: { color: wax, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  clockText: { color: '#fffdf7', fontSize: 16, fontWeight: '800', marginTop: 4 },
  speedControls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  speedStep: { width: 28, height: 39, alignItems: 'center', justifyContent: 'center' },
  speedStepText: { color: '#fffdf7', fontSize: 22 },
  speedButton: { width: 40, height: 39, borderRadius: 9, backgroundColor: wax, alignItems: 'center', justifyContent: 'center' },
  speedText: { color: navy, fontSize: 17, fontWeight: '900' },
});
