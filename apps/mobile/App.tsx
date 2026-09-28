import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Camera, GeoJSONSource, ImageSource, Images, Layer, Map, Marker, type MapRef } from '@maplibre/maplibre-react-native';
import { AppState, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import atlas from './assets/game/atlas.json';
import borders from './assets/game/borders.json';
import waves from './assets/game/waves.json';
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
  layers: [{ id: 'sea', type: 'background' as const, paint: { 'background-color': '#a7b8b9' } }],
};
const mapAnchors: Record<string, { center: [number, number]; zoom: number }> = {
  ENG: { center: [-1.5, 53], zoom: 3.7 }, FRA: { center: [2.5, 47], zoom: 3.7 },
  PRU: { center: [16, 52], zoom: 3.8 }, AUS: { center: [17, 48], zoom: 3.6 },
  RUS: { center: [37, 55], zoom: 2.7 }, USA: { center: [-84, 39], zoom: 3.1 },
  SPA: { center: [-4, 40], zoom: 3.6 }, OTT: { center: [29, 41], zoom: 3.1 },
};
const mapColorByTag = new globalThis.Map(atlas.features.map((feature) =>
  [feature.properties.ownerTag, feature.properties.color]));

function labelIsInside(bounds: [number, number, number, number] | null, lon: number, lat: number): boolean {
  if (!bounds) return false;
  const [west, south, east, north] = bounds;
  const width = east - west;
  const height = north - south;
  return lon > west + width * 0.18 && lon < east - width * 0.18
    && lat > south + height * 0.25 && lat < north - height * 0.29;
}

function compact(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (magnitude >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function Water() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((value) => value + 0.2), 120);
    return () => clearInterval(timer);
  }, []);
  return <GeoJSONSource id="water-waves" data={waves as GeoJSON.FeatureCollection}>
    <Layer id="waves-near" type="line" filter={['==', ['get', 'phase'], 0]}
      paint={{ 'line-color': '#e0eded', 'line-width': 1, 'line-opacity': 0.1 + 0.1 * Math.sin(phase) }} />
    <Layer id="waves-far" type="line" filter={['==', ['get', 'phase'], 1]}
      paint={{ 'line-color': '#d5e4e4', 'line-width': 0.8, 'line-opacity': 0.1 + 0.1 * Math.sin(phase + Math.PI) }} />
  </GeoJSONSource>;
}

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
  const mapRef = useRef<MapRef>(null);
  const [province, setProvince] = useState<Province | null>(null);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [transport, setTransport] = useState<NativeSimTransport | null>(null);
  const [mapMode, setMapMode] = useState<'political' | 'terrain'>('political');
  const [visibleBounds, setVisibleBounds] = useState<[number, number, number, number] | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const capital = worldSeed.provinces.find((item) => item.id === nation.capitalProvinceId);
  const focus = mapAnchors[nation.tag] ?? { center: capital ? [capital.lon, capital.lat] as [number, number] : [0, 20] as [number, number], zoom: 3.3 };
  const player = snapshot?.nations[snapshot.playerNation];
  const selected = province && snapshot?.provinces[province.id];
  const owner = selected && snapshot?.nations[selected.owner];
  const playerPopulation = snapshot?.provinces.reduce((total, item) =>
    total + (item.owner === snapshot.playerNation ? item.population : 0), 0);
  const powerLabels = snapshot?.nations.filter((item) => item.gpRank > 0 && item.gpRank <= 8) ?? [];


  useEffect(() => {
    const sim = new NativeSimTransport();
    sim.onMessage((message) => {
      if (message.t === 'snapshot') setSnapshot(message.snapshot);
      if (message.t === 'log') {
        if (message.level === 'error') console.error(message.msg);
        setActionMessage(message.msg);
      }
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
      <Map ref={mapRef} mapStyle={mapStyle} style={styles.map} touchRotate={false} touchPitch={false}
        onDidFinishLoadingMap={() => { void mapRef.current?.getBounds().then(setVisibleBounds).catch(() => undefined); }}
        onRegionDidChange={(event) => setVisibleBounds(event.nativeEvent.bounds)}>
        <Camera initialViewState={{ center: focus.center, zoom: focus.zoom }} />
        <Images images={{
          mountains: require('./assets/map/mountains.png'), forest: require('./assets/map/forest.png'),
          desert: require('./assets/map/desert.png'), farmland: require('./assets/map/farmland.png'),
          arctic: require('./assets/map/arctic.png'), plain: require('./assets/map/plain.png'),
        }} />
        <ImageSource id="offline-relief" url={require('./assets/map/gray-earth-relief.png')}
          coordinates={[[-180, 85], [180, 85], [180, -85], [-180, -85]]}>
          <Layer id="relief-raster" type="raster"
            paint={{ 'raster-opacity': mapMode === 'terrain' ? 0.8 : 0.55 }} />
        </ImageSource>
        <Water />
        <GeoJSONSource id="provinces" data={atlas as GeoJSON.FeatureCollection}
          onPress={(event) => {
            const id = Number(event.nativeEvent.features?.[0]?.properties?.id);
            setProvince(worldSeed.provinces.find((item) => item.id === id) ?? null);
            setActionMessage('');
          }}>
          <Layer id="political-fill" type="fill"
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': mapMode === 'political' ? 0.77 : 0.18 }} />
          <Layer id="terrain-tint" type="fill"
            paint={{ 'fill-color': ['match', ['get', 'terrain'],
              'mountains', '#555b50', 'forest', '#42634d', 'jungle', '#317556',
              'desert', '#d3b679', 'farmland', '#b9a96d', 'arctic', '#d5d9cf',
              'plains', '#a8b383', '#a8b383'],
              'fill-opacity': mapMode === 'terrain' ? 0.45 : 0.1 }} />
          <Layer id="terrain-pattern" type="fill"
            paint={{ 'fill-pattern': ['match', ['get', 'terrain'],
              'mountains', 'mountains', 'forest', 'forest', 'jungle', 'forest',
              'desert', 'desert', 'farmland', 'farmland', 'arctic', 'arctic', 'plain'],
              'fill-opacity': mapMode === 'terrain' ? 0.38 : 0.15 }} />
          <Layer id="province-line" type="line"
            paint={{ 'line-color': '#354949', 'line-opacity': 0.2, 'line-width': 0.35 }} />
          <Layer id="selection-line" type="line"
            filter={['==', ['get', 'id'], province?.id ?? -1]}
            paint={{ 'line-color': '#fff2b0', 'line-width': 2.5 }} />
        </GeoJSONSource>
        <GeoJSONSource id="borders" data={borders as GeoJSON.FeatureCollection}>
          <Layer id="coastline" type="line" filter={['==', ['get', 'kind'], 'coast']}
            paint={{ 'line-color': '#526967', 'line-width': 0.8, 'line-opacity': 0.75 }} />
          <Layer id="country-border-casing" type="line" filter={['==', ['get', 'kind'], 'country']}
            paint={{ 'line-color': '#efe8d2', 'line-width': 2.2, 'line-opacity': 0.9 }} />
          <Layer id="country-border" type="line" filter={['==', ['get', 'kind'], 'country']}
            paint={{ 'line-color': '#344a49', 'line-width': 1.1 }} />
        </GeoJSONSource>
        {powerLabels.map((item) => {
          const location = worldSeed.provinces[item.capital];
          const anchor = mapAnchors[item.tag]?.center ?? (location ? [location.lon, location.lat] : null);
          if (!anchor || !labelIsInside(visibleBounds, anchor[0], anchor[1])) return null;
          return <Marker key={item.id} id={`power-${item.id}`} lngLat={anchor as [number, number]}>
            <View style={[styles.mapLabel, { borderLeftColor: mapColorByTag.get(item.tag) ?? '#5e6860' }]} pointerEvents="none">
              <Text style={styles.mapLabelText}>{item.name.toUpperCase()}</Text>
            </View>
          </Marker>;
        })}
      </Map>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose another nation" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.topTitleBlock}><Text style={styles.topEyebrow}>PLAYING AS</Text><Text style={styles.topTitle} numberOfLines={1}>{nation.name}</Text><Text style={styles.topStatus}>{player?.atWar ? 'At war' : 'At peace'}  ·  Unrest {player?.unrest.toFixed(2) ?? '...'}</Text></View>
      </View>
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>TREASURY</Text><Text style={styles.summaryValue}>{player ? `£${Math.round(player.treasury).toLocaleString()}` : '...'}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>POPULATION</Text><Text style={styles.summaryValue}>{playerPopulation == null ? '...' : compact(playerPopulation)}</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>GREAT POWER RANK</Text><Text style={styles.summaryValue}>{player?.gpRank ? `Rank ${player.gpRank}` : 'Unranked'}</Text></View>
      </View>
      <View style={styles.secondaryBar}>
        <View style={styles.secondaryItem}><Ionicons name="construct-outline" size={14} color="#42565a" /><Text style={styles.secondaryLabel}> INDUSTRY</Text><Text style={styles.secondaryValue}>{player?.industryScore ?? '...'}</Text></View>
        <View style={styles.secondaryItem}><Ionicons name="shield-outline" size={14} color="#42565a" /><Text style={styles.secondaryLabel}> MILITARY</Text><Text style={styles.secondaryValue}>{player?.militaryScore ?? '...'}</Text></View>
        <View style={styles.secondaryItem}><Ionicons name="star-outline" size={14} color="#42565a" /><Text style={styles.secondaryLabel}> PRESTIGE</Text><Text style={styles.secondaryValue}>{player ? Math.round(player.prestige) : '...'}</Text></View>
      </View>
      <View style={styles.mapModeBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Political map" accessibilityState={{ selected: mapMode === 'political' }}
          onPress={() => setMapMode('political')} style={[styles.mapModeButton, mapMode === 'political' && styles.mapModeSelected]}>
          <Ionicons name="globe-outline" size={13} color={mapMode === 'political' ? '#f1eadc' : ink} />
          <Text style={[styles.mapModeText, mapMode === 'political' && styles.mapModeSelectedText]}>Political</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Terrain map" accessibilityState={{ selected: mapMode === 'terrain' }}
          onPress={() => setMapMode('terrain')} style={[styles.mapModeButton, mapMode === 'terrain' && styles.mapModeSelected]}>
          <Ionicons name="leaf-outline" size={13} color={mapMode === 'terrain' ? '#f1eadc' : ink} />
          <Text style={[styles.mapModeText, mapMode === 'terrain' && styles.mapModeSelectedText]}>Terrain</Text>
        </Pressable>
      </View>
      <View style={styles.bottomDock}>
      {province && <View style={styles.provinceSheet}>
        <View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>PROVINCE  /  {province.terrain.toUpperCase()}</Text><Text style={styles.sheetTitle}>{province.name}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close province detail" onPress={() => setProvince(null)}><Text style={styles.closeText}>×</Text></Pressable></View>
        <View style={styles.provinceFacts}><View><Text style={styles.factLabel}>OWNER</Text><Text style={styles.factValue}>{owner?.name ?? province.ownerTag}</Text></View><View><Text style={styles.factLabel}>POPULATION</Text><Text style={styles.factValue}>{selected?.population.toLocaleString() ?? '...'}</Text></View><View><Text style={styles.factLabel}>UNREST</Text><Text style={styles.factValue}>{selected ? selected.unrestRisk.toFixed(2) : '...'}</Text></View></View>
        {selected?.owner === snapshot?.playerNation && <Pressable accessibilityRole="button" accessibilityLabel={`Recruit regiment in ${province.name}`}
          onPress={() => { setActionMessage(''); transport?.send({ t: 'command', cmd: { t: 'recruitArmy', province: province.id } }); }} style={styles.provinceAction}>
          <Ionicons name="add-circle-outline" size={15} color="#f1eadc" /><Text style={styles.provinceActionText}>Recruit regiment</Text>
        </Pressable>}
        {!!actionMessage && <Text style={styles.actionMessage}>{actionMessage}</Text>}
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
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: navy, paddingTop: 40, height: 106, borderBottomColor: wax, borderBottomWidth: 2 },
  backButton: { width: 48, height: 64, alignItems: 'center', justifyContent: 'center', borderRightColor: '#4b5a5d', borderRightWidth: 1 },
  backText: { color: '#f1eadc', fontSize: 28, lineHeight: 31 },
  topTitleBlock: { flex: 1, paddingLeft: 11 },
  topEyebrow: { color: '#c9aa71', fontSize: 9, fontWeight: '800', letterSpacing: 0.9 },
  topTitle: { color: '#f1eadc', fontSize: 17, fontWeight: '800', marginTop: 1 },
  topStatus: { color: '#c4d0cc', fontSize: 10, fontWeight: '700', marginTop: 1 },
  summaryBar: { position: 'absolute', top: 106, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#f4f1e8', borderBottomColor: '#878e8b', borderBottomWidth: 1, paddingVertical: 6 },
  summaryItem: { flex: 1, alignItems: 'center', borderRightColor: '#b4b8af', borderRightWidth: 1 },
  summaryLabel: { color: '#42565a', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  summaryValue: { color: ink, fontSize: 13, fontWeight: '800', marginTop: 2 },
  secondaryBar: { position: 'absolute', top: 155, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#dfdfd2', borderBottomColor: '#878e8b', borderBottomWidth: 1, height: 38, alignItems: 'center' },
  secondaryItem: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', borderRightColor: '#b4b8af', borderRightWidth: 1 },
  secondaryLabel: { color: '#42565a', fontSize: 9, fontWeight: '800' },
  secondaryValue: { color: ink, fontSize: 12, fontWeight: '800', marginLeft: 4 },
  mapLabel: { backgroundColor: 'rgba(244,241,232,0.93)', borderColor: '#5e6860', borderWidth: 1, borderLeftWidth: 4, paddingHorizontal: 4, paddingVertical: 2 },
  mapLabelText: { color: '#253c3b', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  mapModeBar: { position: 'absolute', bottom: 201, right: 7, flexDirection: 'row', borderColor: '#87918b', borderWidth: 1, backgroundColor: '#f4f1e8' },
  mapModeButton: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  mapModeSelected: { backgroundColor: navy },
  mapModeText: { color: ink, fontSize: 10, fontWeight: '800' },
  mapModeSelectedText: { color: '#f1eadc' },
  bottomDock: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  provinceSheet: { backgroundColor: '#f4f1e8', borderTopColor: '#777d75', borderTopWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitle: { color: ink, fontSize: 17, fontWeight: '800', marginTop: 2 },
  closeText: { color: '#526268', fontSize: 22, lineHeight: 24 },
  provinceFacts: { flexDirection: 'row', gap: 24, borderTopColor: '#c8c8bd', borderTopWidth: 1, marginTop: 8, paddingTop: 7 },
  factLabel: { color: '#526268', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  factValue: { color: ink, fontSize: 12, fontWeight: '700', marginTop: 2 },
  provinceAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: navy, minHeight: 38, marginTop: 9 },
  provinceActionText: { color: '#f1eadc', fontSize: 12, fontWeight: '800' },
  actionMessage: { color: '#42565a', fontSize: 11, marginTop: 6 },
  clockBar: { backgroundColor: navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 13, paddingRight: 5, height: 54 },
  clockLabel: { color: '#a9b6b3', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  clockText: { color: '#f1eadc', fontSize: 14, fontWeight: '800', marginTop: 2 },
  speedControls: { flexDirection: 'row', alignItems: 'center' },
  speedStep: { width: 31, height: 43, alignItems: 'center', justifyContent: 'center' },
  speedStepText: { color: '#f1eadc', fontSize: 19 },
  speedButton: { width: 35, height: 32, backgroundColor: wax, alignItems: 'center', justifyContent: 'center' },
  speedText: { color: navy, fontSize: 15, fontWeight: '900' },
});
