import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Camera, GeoJSONSource, ImageSource, Images, Layer, Map, type MapRef } from '@maplibre/maplibre-react-native';
import { AppState, Modal, ScrollView, FlatList, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import atlas from './assets/game/atlas.json';
import borders from './assets/game/borders.json';
import { File, Paths } from 'expo-file-system';
import { GRAPHICS_KEY, parseGraphicsMode, type GraphicsMode } from '../../src/graphics/preferences';
const TerrainMap = lazy(() => import('./game/TerrainMap'));
import type { View as TerrainView } from '../../src/graphics/terrainData';
import terrainAttribution from '../../src/graphics/terrain-attribution.json';
const graphicsFile = new File(Paths.document, GRAPHICS_KEY + '.json');
import worldSeed from './assets/game/worldSeed.json';
import { NativeSimTransport } from './game/NativeSimTransport';
import { labelFitsViewport } from './game/mapLabelPlacement';
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
  layers: [{ id: 'sea', type: 'background' as const, paint: { 'background-color': '#214c60' } }],
};
const mapAnchors: Record<string, { center: [number, number]; zoom: number }> = {
  ENG: { center: [-1.5, 53], zoom: 3.7 }, FRA: { center: [2.5, 47], zoom: 3.7 },
  PRU: { center: [16, 52], zoom: 3.8 }, AUS: { center: [17, 48], zoom: 3.6 },
  RUS: { center: [37, 55], zoom: 2.7 }, USA: { center: [-84, 39], zoom: 3.1 },
  SPA: { center: [-4, 40], zoom: 3.6 }, OTT: { center: [29, 41], zoom: 3.1 },
};
const labelImages = {
  'nation-ENG': require('./assets/map/labels/ENG.png'),
  'nation-FRA': require('./assets/map/labels/FRA.png'),
  'nation-PRU': require('./assets/map/labels/PRU.png'),
  'nation-AUS': require('./assets/map/labels/AUS.png'),
  'nation-RUS': require('./assets/map/labels/RUS.png'),
  'nation-USA': require('./assets/map/labels/USA.png'),
  'nation-SPA': require('./assets/map/labels/SPA.png'),
  'nation-OTT': require('./assets/map/labels/OTT.png'),
};

function compact(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (magnitude >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
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
  const screenHeight=useWindowDimensions().height;
  const mapRef = useRef<MapRef>(null);
  const terrainCamera=useRef<TerrainView|null>(null);
  const projectionRun = useRef(0);
  const [province, setProvince] = useState<Province | null>(null);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [transport, setTransport] = useState<NativeSimTransport | null>(null);
  const [mapMode, setMapMode] = useState<'political' | 'terrain'>('political');
  const [actionMessage, setActionMessage] = useState('');
  const [graphics,setGraphics]=useState<GraphicsMode>(()=>{try{return parseGraphicsMode(graphicsFile.exists?graphicsFile.textSync():null);}catch{return '2d';}});
  const [graphicsNotice,setGraphicsNotice]=useState('');
  const [showCredits,setShowCredits]=useState(false);
  const chooseGraphics=useCallback((value:GraphicsMode)=>{setGraphics(value);setGraphicsNotice('');try{graphicsFile.write(value);}catch{/* Keep the working session preference. */}},[]);
  const graphicsFallback=useCallback((reason:string)=>{chooseGraphics('2d');setGraphicsNotice(reason);},[chooseGraphics]);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [visibleLabelTags, setVisibleLabelTags] = useState<string[]>([]);
  const capital = worldSeed.provinces.find((item) => item.id === nation.capitalProvinceId);
  const focus = mapAnchors[nation.tag] ?? { center: capital ? [capital.lon, capital.lat] as [number, number] : [0, 20] as [number, number], zoom: 3.3 };
  const player = snapshot?.nations[snapshot.playerNation];
  const selected = province && snapshot?.provinces[province.id];
  const owner = selected && snapshot?.nations[selected.owner];
  const playerPopulation = snapshot?.provinces.reduce((total, item) =>
    total + (item.owner === snapshot.playerNation ? item.population : 0), 0);
  const candidateTags = (snapshot?.nations ?? []).filter((item) =>
    item.gpRank > 0 && item.gpRank <= 8 && item.tag in mapAnchors).map((item) => item.tag).sort().join(',');
  const powerLabels = { type: 'FeatureCollection' as const, features: visibleLabelTags
    .map((tag) => ({ type: 'Feature' as const, properties: { icon: `nation-${tag}` },
      geometry: { type: 'Point' as const, coordinates: mapAnchors[tag].center } })) };

  async function placeLabels() {
    if (!mapRef.current || !mapSize.width || !mapSize.height) return;
    const run = ++projectionRun.current;
    const tags = candidateTags ? candidateTags.split(',') : [];
    const positions = await Promise.all(tags.map(async (tag) => {
      try { return { tag, point: await mapRef.current!.project(mapAnchors[tag].center) }; }
      catch { return null; }
    }));
    if (run !== projectionRun.current) return;
    const bottomReserved = province ? 215 : 72;
    setVisibleLabelTags(positions.filter((position): position is { tag: string; point: [number, number] } => {
      if (!position) return false;
      const image = Image.resolveAssetSource(labelImages[`nation-${position.tag}` as keyof typeof labelImages]);
      return labelFitsViewport({ point: position.point, imageWidth: image.width,
        imageHeight: image.height, iconScale: 0.5, mapWidth: mapSize.width,
        mapHeight: mapSize.height, topInset: 205,
        bottomInset: bottomReserved, sideInset: 12 });
    }).map((position) => position.tag));
  }

  useEffect(() => { void placeLabels(); }, [candidateTags, mapSize.width, mapSize.height, province?.id]);


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
      {graphics!=='2d'?<Suspense fallback={<Text style={{position:'absolute',top:'45%',alignSelf:'center'}}>Loading terrain...</Text>}><TerrainMap key={graphics} quality={graphics==='high'?'high':'balanced'} camera={terrainCamera} focus={focus} snapshot={snapshot} political={mapMode==='political'} selected={province?.id??null} onFallback={graphicsFallback} onSelect={id=>{setProvince(worldSeed.provinces.find(p=>p.id===id)??null);setActionMessage('');}}/></Suspense>:<Map ref={mapRef} mapStyle={mapStyle} style={styles.map} touchRotate={false} touchPitch={false} preferredFramesPerSecond={30}
        onLayout={(event) => setMapSize(event.nativeEvent.layout)}
        onDidFinishLoadingMap={() => { void placeLabels(); }}
        onRegionWillChange={() => { projectionRun.current += 1; setVisibleLabelTags([]); }}
        onRegionDidChange={event => {const v=event.nativeEvent;terrainCamera.current={lon:v.center[0],lat:v.center[1],zoom:v.zoom+Math.log2(512/Math.max(1,mapSize.height||screenHeight))};void placeLabels();}}>
        <Camera initialViewState={terrainCamera.current?{center:[terrainCamera.current.lon,terrainCamera.current.lat],zoom:terrainCamera.current.zoom-Math.log2(512/Math.max(1,mapSize.height||screenHeight))}:{center:focus.center,zoom:focus.zoom}} />
        <Images images={{
          mountains: require('./assets/map/mountains.png'), forest: require('./assets/map/forest.png'),
          desert: require('./assets/map/desert.png'), farmland: require('./assets/map/farmland.png'),
          arctic: require('./assets/map/arctic.png'), plain: require('./assets/map/plain.png'),
          ...labelImages,
        }} />
        <ImageSource id="offline-relief" url={require('./assets/map/relief-low-power.png')}
          coordinates={[[-180, 85], [180, 85], [180, -85], [-180, -85]]}>
          <Layer id="relief-raster" type="raster"
            paint={{ 'raster-opacity': mapMode === 'terrain' ? 0.8 : 0.55 }} />
        </ImageSource>

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
          <Layer id="coast-shelf" type="line" filter={['==', ['get', 'kind'], 'coast']}
            paint={{ 'line-color': '#75acae', 'line-width': 9, 'line-opacity': 0.15, 'line-blur': 4 }} />
          <Layer id="coastline" type="line" filter={['==', ['get', 'kind'], 'coast']}
            paint={{ 'line-color': '#526967', 'line-width': 0.8, 'line-opacity': 0.75 }} />
          <Layer id="country-border-casing" type="line" filter={['==', ['get', 'kind'], 'country']}
            paint={{ 'line-color': '#efe8d2', 'line-width': 2.2, 'line-opacity': 0.9 }} />
          <Layer id="country-border" type="line" filter={['==', ['get', 'kind'], 'country']}
            paint={{ 'line-color': '#344a49', 'line-width': 1.1 }} />
        </GeoJSONSource>
        <GeoJSONSource id="power-labels" data={powerLabels as GeoJSON.FeatureCollection}>
          <Layer id="power-label-symbols" type="symbol"
            layout={{ 'icon-image': ['get', 'icon'], 'icon-size': 0.5,
              'symbol-avoid-edges': true, 'icon-allow-overlap': false,
              'icon-ignore-placement': false, 'icon-anchor': 'center' }} />
        </GeoJSONSource>
      </Map>}
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
      {graphics!=='2d'&&<Pressable accessibilityRole="button" accessibilityLabel="Terrain data credits" onPress={()=>setShowCredits(true)} style={{position:'absolute',left:8,bottom:105,backgroundColor:'#18272ddd',padding:7}}><Text style={{fontSize:10,color:paper}}>Terrain data credits</Text></Pressable>}
      <Modal visible={showCredits} animationType="slide" onRequestClose={()=>setShowCredits(false)}><View style={{flex:1,padding:24,paddingTop:60,backgroundColor:paper}}><Pressable accessibilityRole="button" onPress={()=>setShowCredits(false)} style={{minHeight:44}}><Text style={{color:ink,fontWeight:'700'}}>Close terrain credits</Text></Pressable><ScrollView><Text selectable style={{color:ink,lineHeight:20}}>{terrainAttribution.text}</Text></ScrollView></View></Modal>
      <View style={styles.graphicsBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="2D low power graphics" accessibilityState={{selected:graphics==='2d'}} onPress={()=>chooseGraphics('2d')} style={[styles.graphicsButton,graphics==='2d'&&styles.mapModeSelected]}><Text style={[styles.mapModeText,graphics==='2d'&&styles.mapModeSelectedText]}>2D · Low power</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="3D terrain graphics" accessibilityState={{selected:graphics==='3d'}} onPress={()=>chooseGraphics('3d')} style={[styles.graphicsButton,graphics==='3d'&&styles.mapModeSelected]}><Text style={[styles.mapModeText,graphics==='3d'&&styles.mapModeSelectedText]}>3D · Balanced</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="3D high quality graphics" accessibilityState={{selected:graphics==='high'}} onPress={()=>chooseGraphics('high')} style={[styles.graphicsButton,graphics==='high'&&styles.mapModeSelected]}><Text style={[styles.mapModeText,graphics==='high'&&styles.mapModeSelectedText]}>3D · High</Text></Pressable>
      </View>
      {!!graphicsNotice&&<Text accessibilityRole="alert" style={styles.graphicsNotice}>{graphicsNotice}</Text>}
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
  graphicsBar: {position:'absolute',bottom:150,right:7,flexDirection:'row',backgroundColor:'#f4f1e8',borderWidth:1,borderColor:'#87918b'},
  graphicsButton:{minHeight:44,paddingHorizontal:8,justifyContent:'center'},
  graphicsNotice:{position:'absolute',bottom:300,right:8,left:8,padding:10,backgroundColor:'#f4f1e8',color:ink},
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
