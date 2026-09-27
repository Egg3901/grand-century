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
const paper = '#f3eddf';
const ink = '#272c29';
const wax = '#8d3432';
const mapStyle = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'sea', type: 'background' as const, paint: { 'background-color': '#a9bec4' } }],
};

function NationPicker({ onSelect }: { onSelect: (nation: Nation) => void }) {
  const [query, setQuery] = useState('');
  const nations = useMemo(() => worldSeed.nations
    .filter((nation) => nation.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [query]);
  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>GRAND CENTURY</Text>
      <Text style={styles.title}>Choose a nation</Text>
      <Text style={styles.subtitle}>Native atlas preview. The game simulation is being connected next.</Text>
      <TextInput accessibilityLabel="Search nations" placeholder="Search nations"
        placeholderTextColor="#817e76" value={query} onChangeText={setQuery} style={styles.search} />
      <FlatList data={nations} keyExtractor={(nation) => nation.tag} keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name} on the map`}
            onPress={() => onSelect(item)} style={styles.nationRow}>
            <View style={[styles.swatch, { backgroundColor: colorOf(item) }]} />
            <Text style={styles.nationName}>{item.name}</Text>
            <Text style={styles.nationTag}>{item.tag}</Text>
          </Pressable>
        )} />
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
            const id = event.nativeEvent.features?.[0]?.properties?.id;
            setProvince(worldSeed.provinces.find((item) => item.id === id) ?? null);
          }}>
          <Layer id="political-fill" type="fill"
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.92 }} />
          <Layer id="province-line" type="line"
            paint={{ 'line-color': '#5c5447', 'line-width': 0.45 }} />
          <Layer id="selection-line" type="line"
            filter={['==', ['get', 'id'], province?.id ?? -1]}
            paint={{ 'line-color': wax, 'line-width': 3 }} />
        </GeoJSONSource>
      </Map>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Nations</Text>
        </Pressable>
        <Text style={styles.topTitle}>{nation.name}</Text>
      </View>
      {snapshot && <View style={styles.clockBar}>
        <Text style={styles.clockText}>{snapshot.date.year} · {snapshot.date.month}/{snapshot.date.day}</Text>
        <Pressable accessibilityRole="button"
          accessibilityLabel={snapshot.speed === 0 ? 'Resume game' : 'Pause game'}
          onPress={() => transport?.send({ t: 'command', cmd: { t: 'setSpeed', speed: snapshot.speed === 0 ? 2 : 0 } })}
          style={styles.speedButton}>
          <Text style={styles.backText}>{snapshot.speed === 0 ? 'Play' : 'Pause'}</Text>
        </Pressable>
      </View>}
      {province && <View style={styles.provinceSheet}>
        <Text style={styles.eyebrow}>PROVINCE</Text>
        <Text style={styles.sheetTitle}>{province.name}</Text>
        <Text style={styles.sheetDetail}>{province.ownerTag} · {province.terrain}</Text>
      </View>}
    </View>
  );
}

export default function App() {
  const [nation, setNation] = useState<Nation | null>(null);
  return <View style={styles.root}>
    <StatusBar style="dark" />
    {nation ? <Atlas nation={nation} onBack={() => setNation(null)} /> : <NationPicker onSelect={setNation} />}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: paper },
  page: { flex: 1, paddingTop: 64, paddingHorizontal: 20 },
  eyebrow: { color: wax, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: ink, fontSize: 32, fontWeight: '700', marginTop: 12 },
  subtitle: { color: '#655f53', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 22 },
  search: { backgroundColor: '#fffaf0', borderColor: '#c7bca9', borderWidth: 1, borderRadius: 8, color: ink, fontSize: 16, padding: 14, marginBottom: 12 },
  nationRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomColor: '#d6cdbd', borderBottomWidth: 1, gap: 12 },
  swatch: { width: 24, height: 24, borderRadius: 12, borderColor: '#6c6559', borderWidth: 1 },
  nationName: { color: ink, fontSize: 17, flex: 1 },
  nationTag: { color: '#746d61', fontSize: 12, fontWeight: '700' },
  mapPage: { flex: 1 },
  map: { flex: 1 },
  topBar: { position: 'absolute', top: 52, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { backgroundColor: paper, borderRadius: 7, paddingVertical: 10, paddingHorizontal: 14 },
  backText: { color: wax, fontWeight: '700' },
  topTitle: { color: ink, backgroundColor: paper, borderRadius: 7, overflow: 'hidden', paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  clockBar: { position: 'absolute', top: 106, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  clockText: { color: ink, backgroundColor: paper, overflow: 'hidden', borderRadius: 7, padding: 12, fontWeight: '700' },
  speedButton: { backgroundColor: paper, borderRadius: 7, padding: 12 },
  provinceSheet: { position: 'absolute', left: 12, right: 12, bottom: 22, backgroundColor: paper, borderRadius: 12, padding: 18, borderColor: '#bcae98', borderWidth: 1 },
  sheetTitle: { color: ink, fontSize: 23, fontWeight: '700', marginTop: 5 },
  sheetDetail: { color: '#655f53', fontSize: 14, marginTop: 5 },
});
