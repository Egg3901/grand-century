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
const paper = '#eeeae0';
const ink = '#17262d';
const wax = '#bd954e';
const navy = '#18272d';
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
        <Text style={styles.heroFoot}>NEW CAMPAIGN  /  1830  /  SINGLE PLAYER</Text>
      </View>
      <View style={styles.pickerContent}>
      <Text style={styles.title}>Select nation</Text>
      <TextInput accessibilityLabel="Search nations" placeholder="Search nations"
        placeholderTextColor="#817e76" value={query} onChangeText={setQuery} style={styles.search} />
      <View style={styles.listHeading}><Text style={styles.resultCount}>NATION</Text><Text style={styles.resultCount}>{nations.length} AVAILABLE</Text></View>
      <FlatList data={nations} keyExtractor={(nation) => nation.tag} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.emptyText}>No nations match that search.</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Start as ${item.name}`}
            onPress={() => onSelect(item)} style={({ pressed }) => [styles.nationRow, pressed && styles.pressed]}>
            <View style={[styles.swatch, { backgroundColor: colorOf(item) }]} />
            <View style={styles.nationText}><Text style={styles.nationName}>{item.name}</Text><Text style={styles.nationTag}>{item.tag}</Text></View>
            <Text style={styles.rowArrow}>→</Text>
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
        <View style={styles.topTitleBlock}><Text style={styles.topTitle} numberOfLines={1}>{nation.name}</Text><Text style={styles.topEyebrow}>POLITICAL MAP  /  1830</Text></View>
      </View>
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>TREASURY</Text><Text style={styles.summaryValue}>{player ? `£${Math.round(player.treasury).toLocaleString()}` : '...'}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>PRESTIGE</Text><Text style={styles.summaryValue}>{player ? Math.round(player.prestige).toLocaleString() : '...'}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>PROVINCES</Text><Text style={styles.summaryValue}>{player?.numProvinces ?? '...'}</Text></View>
      </View>
      <View style={styles.bottomDock}>
      {province && <View style={styles.provinceSheet}>
        <View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>PROVINCE  /  {province.terrain.toUpperCase()}</Text><Text style={styles.sheetTitle}>{province.name}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close province detail" onPress={() => setProvince(null)}><Text style={styles.closeText}>×</Text></Pressable></View>
        <View style={styles.provinceFacts}><View><Text style={styles.factLabel}>OWNER</Text><Text style={styles.factValue}>{owner?.name ?? province.ownerTag}</Text></View><View><Text style={styles.factLabel}>POPULATION</Text><Text style={styles.factValue}>{selected?.population.toLocaleString() ?? '...'}</Text></View></View>
      </View>}
      <View style={styles.clockBar}>
        <View><Text style={styles.clockLabel}>DATE  /  SPEED {snapshot?.speed ?? 0}</Text><Text style={styles.clockText}>{snapshot ? `${snapshot.date.day} / ${snapshot.date.month} / ${snapshot.date.year}` : 'Loading...'}</Text></View>
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
  hero: { backgroundColor: navy, paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12, borderBottomColor: wax, borderBottomWidth: 2 },
  brand: { color: '#f1eadc', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  heroFoot: { color: '#afbbb9', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 5 },
  pickerContent: { flex: 1, paddingHorizontal: 12, paddingTop: 15 },
  eyebrow: { color: '#836332', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  title: { color: ink, fontSize: 19, fontWeight: '800', marginBottom: 11 },
  search: { backgroundColor: '#f8f6ef', borderColor: '#aba99e', borderWidth: 1, borderRadius: 0, color: ink, fontSize: 14, paddingHorizontal: 10, paddingVertical: 8 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', borderBottomColor: '#99998e', borderBottomWidth: 1, marginTop: 16, paddingBottom: 5 },
  resultCount: { color: '#526268', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  nationRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomColor: '#c8c8bd', borderBottomWidth: 1, gap: 10 },
  pressed: { opacity: 0.55 },
  swatch: { width: 8, height: 30, borderRadius: 0 },
  nationText: { flex: 1 },
  nationName: { color: ink, fontSize: 14, fontWeight: '700' },
  nationTag: { color: '#526268', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  rowArrow: { color: '#526268', fontSize: 16 },
  emptyText: { color: '#66747a', paddingVertical: 24 },
  mapPage: { flex: 1, backgroundColor: '#a5bec5' },
  map: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: navy, paddingTop: 44, height: 94, borderBottomColor: wax, borderBottomWidth: 2 },
  backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRightColor: '#4b5a5d', borderRightWidth: 1 },
  backText: { color: '#f1eadc', fontSize: 28, lineHeight: 31 },
  topTitleBlock: { flex: 1, paddingLeft: 11 },
  topEyebrow: { color: '#a9b6b3', fontSize: 9, fontWeight: '700', letterSpacing: 0.9, marginTop: 2 },
  topTitle: { color: '#f1eadc', fontSize: 17, fontWeight: '800' },
  summaryBar: { position: 'absolute', top: 94, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#f4f1e8', borderBottomColor: '#878e8b', borderBottomWidth: 1, paddingVertical: 8 },
  summaryItem: { flex: 1, alignItems: 'center', borderRightColor: '#b4b8af', borderRightWidth: 1 },
  summaryLabel: { color: '#526268', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  summaryValue: { color: ink, fontSize: 13, fontWeight: '800', marginTop: 2 },
  bottomDock: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  provinceSheet: { backgroundColor: '#f4f1e8', borderTopColor: '#777d75', borderTopWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitle: { color: ink, fontSize: 17, fontWeight: '800', marginTop: 2 },
  closeText: { color: '#526268', fontSize: 22, lineHeight: 24 },
  provinceFacts: { flexDirection: 'row', gap: 24, borderTopColor: '#c8c8bd', borderTopWidth: 1, marginTop: 8, paddingTop: 7 },
  factLabel: { color: '#526268', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  factValue: { color: ink, fontSize: 12, fontWeight: '700', marginTop: 2 },
  clockBar: { backgroundColor: navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 13, paddingRight: 5, height: 54 },
  clockLabel: { color: '#a9b6b3', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  clockText: { color: '#f1eadc', fontSize: 14, fontWeight: '800', marginTop: 2 },
  speedControls: { flexDirection: 'row', alignItems: 'center' },
  speedStep: { width: 31, height: 43, alignItems: 'center', justifyContent: 'center' },
  speedStepText: { color: '#f1eadc', fontSize: 19 },
  speedButton: { width: 35, height: 32, backgroundColor: wax, alignItems: 'center', justifyContent: 'center' },
  speedText: { color: navy, fontSize: 15, fontWeight: '900' },
});
