import {
  ATMOSPHERE_KEY,
  calendarDay,
  parseAtmosphere,
  type Atmosphere,
} from "../../src/graphics/atmosphere";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Device from "expo-device";
import {
  automaticGraphics,
  graphicsPreference,
  type GraphicsPreference,
} from "../../src/graphics/deviceQuality";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Camera,
  GeoJSONSource,
  ImageSource,
  Images,
  Layer,
  Map,
  type MapRef,
} from "@maplibre/maplibre-react-native";
import {
  AppState,
  Linking,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  GameMenus,
  MenuButton,
  gamePanels,
  type GamePanel,
} from "./game/GameMenus";
import atlas from "./assets/game/atlas.json";
import {
  nativeMapModes,
  mapColors,
  mapDisplayKey,
  NativeFrontiers,
  unitRoutes,
  type NativeMapMode,
} from "./game/mapModes";
import {
  weatherMapData,
  weatherAtLocation,
  WEATHER_CLOUD_PAINT,
  WEATHER_PRECIPITATION_LAYOUT,
  WEATHER_RAIN_PAINT,
  WEATHER_SNOW_CASING_PAINT,
  WEATHER_SNOW_PAINT,
} from "../../src/graphics/weather";
import { HomeScreen } from "./game/HomeScreen";
import { MapModeChooser } from "./game/MapModeChooser";
import { UnitCounters } from "./game/UnitCounters";
import { useNativeAlerts, NativeReportToast } from "./game/NativeAdvisor";
import { NativeAudio } from "./game/NativeAudio";
import { gameDataForScenario } from "../../src/data/gameData";
import { campaignRoster } from "./game/campaign";
import { File, Paths } from "expo-file-system";
import { GRAPHICS_KEY } from "../../src/graphics/preferences";
const TerrainMap = lazy(() => import("./game/TerrainMap"));
import type { View as TerrainView } from "../../src/graphics/terrainData";
import { NationFlag } from "./game/NationFlag";
import terrainAttribution from "../../src/graphics/terrain-attribution.json";
const atmosphereFile = new File(Paths.document, ATMOSPHERE_KEY + ".json");
const graphicsFile = new File(Paths.document, GRAPHICS_KEY + ".json");
import worldSeed from "./assets/game/worldSeed.json";
import { useCampaign, type Session } from "./game/useCampaign";
import { CampaignSetup, SaveLibrary } from "./game/CampaignScreens";
import {
  useMultiplayer,
  MultiplayerScreen,
  inviteSession,
} from "./game/Multiplayer";
import { AccountScreen } from "./game/AccountScreen";
import {
  campaignNation,
  type NativeSave,
  type CampaignConfig,
} from "./game/campaign";
import type { SeedNation } from "../../src/data/generated";
import { labelFitsViewport } from "./game/mapLabelPlacement";

type Nation = SeedNation;
// The shared seed type: the JSON-inferred type narrows nullable fields to literal null.
type Province = import("../../src/data/generated").SeedProvince;
const paper = "#f4eddf";
const ink = "#192e35";
const wax = "#d6b475";
const navy = "#102b35";
const mapStyle = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: "sea",
      type: "background" as const,
      paint: { "background-color": "#214c60" },
    },
  ],
};
const mapAnchors: Record<string, { center: [number, number]; zoom: number }> = {
  ENG: { center: [-1.5, 53], zoom: 3.7 },
  FRA: { center: [2.5, 47], zoom: 3.7 },
  PRU: { center: [16, 52], zoom: 3.8 },
  AUS: { center: [17, 48], zoom: 3.6 },
  RUS: { center: [37, 55], zoom: 2.7 },
  USA: { center: [-84, 39], zoom: 3.1 },
  SPA: { center: [-4, 40], zoom: 3.6 },
  OTT: { center: [29, 41], zoom: 3.1 },
};
const labelImages = {
  "nation-ENG": require("./assets/map/labels/ENG.png"),
  "nation-FRA": require("./assets/map/labels/FRA.png"),
  "nation-PRU": require("./assets/map/labels/PRU.png"),
  "nation-AUS": require("./assets/map/labels/AUS.png"),
  "nation-RUS": require("./assets/map/labels/RUS.png"),
  "nation-USA": require("./assets/map/labels/USA.png"),
  "nation-SPA": require("./assets/map/labels/SPA.png"),
  "nation-OTT": require("./assets/map/labels/OTT.png"),
};

function compact(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (magnitude >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function Atlas({
  nation,
  onHome,
  active,
  session,
  onSaves,
  notice,
}: {
  notice: string;
  session: Session;
  onSaves: () => void;
  nation: Nation;
  onHome: () => void;
  active: boolean;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const landscape = screenWidth > screenHeight;
  const nationBarWidth = Math.max(
    200,
    Math.min(330, (screenWidth - 88) * 0.42),
  );
  const worldSeed = useMemo(
    () =>
      campaignRoster(
        session.config.seed,
        session.config.mapMode,
        session.config.scenarioId,
      ),
    [
      session.config.id,
      session.config.seed,
      session.config.mapMode,
      session.config.scenarioId,
    ],
  );
  const mapRef = useRef<MapRef>(null);
  const terrainCamera = useRef<TerrainView | null>(null);
  const projectionRun = useRef(0);
  const [province, setProvince] = useState<Province | null>(null);
  const { snapshot, transport } = session;
  const [mapMode, setMapMode] = useState<NativeMapMode>("political");
  const [actionMessage, setActionMessage] = useState("");
  const { alerts, dismiss } = useNativeAlerts(snapshot);
  const audioFile = useMemo(
    () => new File(Paths.document, "grand-century-audio-muted"),
    [],
  );
  const [muted, setMuted] = useState(() => {
    try {
      return !audioFile.exists || audioFile.textSync() !== "false";
    } catch {
      return true;
    }
  });
  const chooseMuted = (value: boolean) => {
    setMuted(value);
    try {
      audioFile.write(String(value));
    } catch {}
  };
  const [preference, setPreference] = useState<GraphicsPreference>(() => {
    try {
      return graphicsPreference(
        graphicsFile.exists ? graphicsFile.textSync() : null,
      );
    } catch {
      return "auto";
    }
  });
  const graphics =
    preference === "auto" ? automaticGraphics(Device) : preference;
  const [atmosphere, setAtmosphere] = useState<Atmosphere>(() => {
    try {
      return parseAtmosphere(
        atmosphereFile.exists ? atmosphereFile.textSync() : null,
      );
    } catch {
      return parseAtmosphere(null);
    }
  });
  const chooseAtmosphere = (value: Atmosphere) => {
    setAtmosphere(value);
    try {
      atmosphereFile.write(JSON.stringify(value));
    } catch {
      /* Keep this session's selection. */
    }
  };
  const [weatherCenter, setWeatherCenter] = useState<[number, number] | null>(
    null,
  );
  const currentAtmosphere = {
    ...atmosphere,
    dayOfYear: calendarDay(snapshot.date),
  };
  const weatherData = useMemo(
    () => weatherMapData(currentAtmosphere),
    [atmosphere.weather, currentAtmosphere.dayOfYear],
  );
  const [graphicsNotice, setGraphicsNotice] = useState("");
  const [panel, setPanel] = useState<GamePanel | null>(null);
  const openPanel = (next: GamePanel) => {
    if (!session.online)
      transport?.send({ t: "command", cmd: { t: "setSpeed", speed: 0 } });
    setActionMessage("");
    setPanel(next);
  };
  useEffect(() => {
    if (!active && !session.online)
      transport?.send({ t: "command", cmd: { t: "setSpeed", speed: 0 } });
  }, [active, transport, session.online]);
  const seenEvent = useRef<number | null>(null);
  const eventId = snapshot.pendingPlayerEvents?.[0]?.instanceId ?? null;
  useEffect(() => {
    if (active && eventId != null && seenEvent.current !== eventId) {
      seenEvent.current = eventId;
      openPanel("events");
    }
  }, [active, eventId]);
  useEffect(() => {
    if (snapshot.campaignOver && active) openPanel("recap");
  }, [snapshot.campaignOver, active]);
  const chooseGraphics = useCallback((value: GraphicsPreference) => {
    setPreference(value);
    setGraphicsNotice("");
    try {
      graphicsFile.write(value);
    } catch {
      /* Keep the working session preference. */
    }
  }, []);
  const graphicsFallback = useCallback(
    (reason: string) => {
      chooseGraphics("2d");
      setGraphicsNotice(reason);
    },
    [chooseGraphics],
  );
  const [mapRevision, setMapRevision] = useState(0);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [visibleLabelTags, setVisibleLabelTags] = useState<string[]>([]);
  const capital = worldSeed.provinces.find(
    (item) => item.id === nation.capitalProvinceId,
  );
  const focus = (session.config.mapMode === "historical"
    ? mapAnchors[nation.tag]
    : null) ?? {
    center: capital
      ? ([capital.lon, capital.lat] as [number, number])
      : ([0, 20] as [number, number]),
    zoom: 3.3,
  };
  const localWeather = weatherAtLocation(
    ...(weatherCenter ?? focus.center),
    currentAtmosphere,
  );
  const player = snapshot?.nations[snapshot.playerNation];
  const selected = province && snapshot?.provinces[province.id];
  const owner = selected && snapshot?.nations[selected.owner];
  const playerPopulation = snapshot?.provinces.reduce(
    (total, item) =>
      total + (item.owner === snapshot.playerNation ? item.population : 0),
    0,
  );
  const candidateTags = (snapshot?.nations ?? [])
    .filter(
      (item) =>
        session.config.mapMode === "historical" &&
        item.gpRank > 0 &&
        item.gpRank <= 8 &&
        item.tag in mapAnchors,
    )
    .map((item) => item.tag)
    .sort()
    .join(",");
  const useTerrain =
    graphics !== "2d" &&
    session.config.scenarioId === "1830-01-01" &&
    (mapMode === "political" || mapMode === "terrain");
  const frontierIndex = useMemo(() => new NativeFrontiers(atlas.features), []);
  const ownershipKey =
    snapshot.provinces.map((p) => `${p.owner}:${p.controller}`).join(",") +
    "/" +
    snapshot.nations.map((n) => n.color.join(",")).join(";");
  const displayKey = mapDisplayKey(mapMode, snapshot);
  const colors = useMemo(
    () =>
      mapColors(
        mapMode,
        snapshot,
        gameDataForScenario(session.config.scenarioId),
      ),
    [mapMode, displayKey, session.config.scenarioId],
  );
  const politicalAtlas = useMemo(
    () => ({
      ...atlas,
      features: atlas.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          name:
            worldSeed.provinces[feature.properties.id]?.name ??
            feature.properties.name,
          terrain:
            worldSeed.provinces[feature.properties.id]?.terrain ??
            feature.properties.terrain,
          color: colors.get(feature.properties.id) ?? feature.properties.color,
        },
      })),
    }),
    [colors, worldSeed],
  );
  const borders = useMemo(
    () => frontierIndex.borders(snapshot),
    [ownershipKey, frontierIndex],
  );
  const routes = useMemo(
    () => unitRoutes(snapshot, worldSeed),
    [snapshot.armies, snapshot.fleets, worldSeed],
  );
  const powerLabels = {
    type: "FeatureCollection" as const,
    features: visibleLabelTags.map((tag) => ({
      type: "Feature" as const,
      properties: { icon: `nation-${tag}` },
      geometry: { type: "Point" as const, coordinates: mapAnchors[tag].center },
    })),
  };

  async function placeLabels() {
    if (!mapRef.current || !mapSize.width || !mapSize.height) return;
    const run = ++projectionRun.current;
    const tags = candidateTags ? candidateTags.split(",") : [];
    const positions = await Promise.all(
      tags.map(async (tag) => {
        try {
          return {
            tag,
            point: await mapRef.current!.project(mapAnchors[tag].center),
          };
        } catch {
          return null;
        }
      }),
    );
    if (run !== projectionRun.current) return;
    const bottomReserved = landscape ? 66 : province ? 320 : 116;
    setVisibleLabelTags(
      positions
        .filter(
          (position): position is { tag: string; point: [number, number] } => {
            if (!position) return false;
            const image = Image.resolveAssetSource(
              labelImages[`nation-${position.tag}` as keyof typeof labelImages],
            );
            return labelFitsViewport({
              point: position.point,
              imageWidth: image.width,
              imageHeight: image.height,
              iconScale: 0.5,
              mapWidth: mapSize.width,
              mapHeight: mapSize.height,
              topInset: landscape ? 72 : 136,
              bottomInset: bottomReserved,
              sideInset: 12,
            });
          },
        )
        .map((position) => position.tag),
    );
  }

  useEffect(() => {
    void placeLabels();
  }, [candidateTags, mapSize.width, mapSize.height, province?.id, landscape]);

  return (
    <View style={styles.mapPage}>
      <NativeAudio alerts={alerts} muted={muted} active={active} />
      {active &&
        (useTerrain ? (
          <Suspense
            fallback={
              <Text
                style={{
                  position: "absolute",
                  top: "45%",
                  alignSelf: "center",
                }}
              >
                Loading terrain...
              </Text>
            }
          >
            <TerrainMap
              atmosphere={atmosphere}
              onViewChange={(v) => setWeatherCenter([v.lon, v.lat])}
              visible={panel === null}
              key={graphics}
              quality={graphics === "high" ? "high" : "balanced"}
              camera={terrainCamera}
              focus={focus}
              snapshot={snapshot}
              political={mapMode === "political"}
              selected={province?.id ?? null}
              onFallback={graphicsFallback}
              onSelect={(id) => {
                setProvince(
                  worldSeed.provinces.find((p) => p.id === id) ?? null,
                );
                setActionMessage("");
              }}
            />
          </Suspense>
        ) : (
          <Map
            ref={mapRef}
            mapStyle={mapStyle}
            style={styles.map}
            touchRotate={false}
            touchPitch={false}
            preferredFramesPerSecond={30}
            onLayout={(event) => setMapSize(event.nativeEvent.layout)}
            onDidFinishLoadingMap={() => {
              setMapRevision((n) => n + 1);
              void placeLabels();
            }}
            onRegionWillChange={() => {
              projectionRun.current += 1;
              setVisibleLabelTags([]);
            }}
            onRegionDidChange={(event) => {
              setMapRevision((n) => n + 1);
              const v = event.nativeEvent;
              setWeatherCenter(v.center);
              terrainCamera.current = {
                lon: v.center[0],
                lat: v.center[1],
                zoom:
                  v.zoom +
                  Math.log2(512 / Math.max(1, mapSize.height || screenHeight)),
              };
              void placeLabels();
            }}
          >
            <Camera
              initialViewState={
                terrainCamera.current
                  ? {
                      center: [
                        terrainCamera.current.lon,
                        terrainCamera.current.lat,
                      ],
                      zoom:
                        terrainCamera.current.zoom -
                        Math.log2(
                          512 / Math.max(1, mapSize.height || screenHeight),
                        ),
                    }
                  : { center: focus.center, zoom: focus.zoom }
              }
            />
            <Images
              images={{
                mountains: require("./assets/map/mountains.png"),
                forest: require("./assets/map/forest.png"),
                desert: require("./assets/map/desert.png"),
                farmland: require("./assets/map/farmland.png"),
                arctic: require("./assets/map/arctic.png"),
                plain: require("./assets/map/plain.png"),
                ...labelImages,
              }}
            />
            <ImageSource
              id="offline-relief"
              url={require("./assets/map/relief-low-power.png")}
              coordinates={[
                [-180, 85],
                [180, 85],
                [180, -85],
                [-180, -85],
              ]}
            >
              <Layer
                id="relief-raster"
                type="raster"
                paint={{
                  "raster-opacity":
                    mapMode === "terrain"
                      ? 0.8
                      : mapMode === "political"
                        ? 0.55
                        : 0.1,
                }}
              />
            </ImageSource>

            <GeoJSONSource
              id="provinces"
              data={politicalAtlas as GeoJSON.FeatureCollection}
              onPress={(event) => {
                const id = Number(
                  event.nativeEvent.features?.[0]?.properties?.id,
                );
                setProvince(
                  worldSeed.provinces.find((item) => item.id === id) ?? null,
                );
                setActionMessage("");
              }}
            >
              <Layer
                id="political-fill"
                type="fill"
                paint={{
                  "fill-color": ["get", "color"],
                  "fill-opacity": mapMode === "terrain" ? 0.18 : 0.85,
                }}
              />
              <Layer
                id="terrain-tint"
                type="fill"
                paint={{
                  "fill-color": [
                    "match",
                    ["get", "terrain"],
                    "mountains",
                    "#555b50",
                    "forest",
                    "#42634d",
                    "jungle",
                    "#317556",
                    "desert",
                    "#d3b679",
                    "farmland",
                    "#b9a96d",
                    "arctic",
                    "#d5d9cf",
                    "plains",
                    "#a8b383",
                    "#a8b383",
                  ],
                  "fill-opacity":
                    mapMode === "terrain"
                      ? 0.45
                      : mapMode === "political"
                        ? 0.1
                        : 0,
                }}
              />
              <Layer
                id="terrain-pattern"
                type="fill"
                paint={{
                  "fill-pattern": [
                    "match",
                    ["get", "terrain"],
                    "mountains",
                    "mountains",
                    "forest",
                    "forest",
                    "jungle",
                    "forest",
                    "desert",
                    "desert",
                    "farmland",
                    "farmland",
                    "arctic",
                    "arctic",
                    "plain",
                  ],
                  "fill-opacity":
                    mapMode === "terrain"
                      ? 0.38
                      : mapMode === "political"
                        ? 0.15
                        : 0,
                }}
              />
              <Layer
                id="province-line"
                type="line"
                paint={{
                  "line-color": "#354949",
                  "line-opacity": 0.2,
                  "line-width": 0.35,
                }}
              />
              <Layer
                id="selection-line"
                type="line"
                filter={["==", ["get", "id"], province?.id ?? -1]}
                paint={{ "line-color": "#fff2b0", "line-width": 2.5 }}
              />
            </GeoJSONSource>
            <GeoJSONSource
              id="borders"
              data={borders as GeoJSON.FeatureCollection}
            >
              <Layer
                id="coast-shelf"
                type="line"
                filter={["==", ["get", "kind"], "coast"]}
                paint={{
                  "line-color": "#75acae",
                  "line-width": 9,
                  "line-opacity": 0.15,
                  "line-blur": 4,
                }}
              />
              <Layer
                id="coastline"
                type="line"
                filter={["==", ["get", "kind"], "coast"]}
                paint={{
                  "line-color": "#526967",
                  "line-width": 0.8,
                  "line-opacity": 0.75,
                }}
              />
              <Layer
                id="country-border-casing"
                type="line"
                filter={["==", ["get", "kind"], "country"]}
                paint={{
                  "line-color": "#efe8d2",
                  "line-width": 2.2,
                  "line-opacity":
                    session.config.mapMode === "historical" ? 0.9 : 0,
                }}
              />
              <Layer
                id="country-border"
                type="line"
                filter={["==", ["get", "kind"], "country"]}
                paint={{
                  "line-color": "#344a49",
                  "line-width": 1.1,
                  "line-opacity":
                    session.config.mapMode === "historical" ? 1 : 0,
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="native-routes" data={routes}>
              <Layer
                id="native-route-lines"
                type="line"
                paint={{
                  "line-color": "#17262d",
                  "line-width": 2,
                  "line-dasharray": [3, 2],
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="native-fronts" data={borders}>
              <Layer
                id="native-front-lines"
                type="line"
                filter={["==", ["get", "kind"], "front"]}
                paint={{ "line-color": "#b8322e", "line-width": 3 }}
              />
            </GeoJSONSource>
            <GeoJSONSource
              id="power-labels"
              data={powerLabels as GeoJSON.FeatureCollection}
            >
              <Layer
                id="power-label-symbols"
                type="symbol"
                layout={{
                  "icon-image": ["get", "icon"],
                  "icon-size": 0.5,
                  "symbol-avoid-edges": true,
                  "icon-allow-overlap": false,
                  "icon-ignore-placement": false,
                  "icon-anchor": "center",
                }}
              />
            </GeoJSONSource>
            <GeoJSONSource id="visual-weather-clouds" data={weatherData.clouds}>
              <Layer
                id="visual-weather-clouds"
                type="fill"
                paint={WEATHER_CLOUD_PAINT}
              />
            </GeoJSONSource>
            <GeoJSONSource
              id="visual-weather-precipitation"
              data={weatherData.precipitation}
            >
              <Layer
                id="visual-weather-rain"
                type="line"
                filter={["==", ["get", "kind"], "rain"]}
                layout={WEATHER_PRECIPITATION_LAYOUT}
                paint={WEATHER_RAIN_PAINT as never}
              />
              <Layer
                id="visual-weather-snow-casing"
                type="line"
                filter={["==", ["get", "kind"], "snow"]}
                layout={WEATHER_PRECIPITATION_LAYOUT}
                paint={WEATHER_SNOW_CASING_PAINT as never}
              />
              <Layer
                id="visual-weather-snow"
                type="line"
                filter={["==", ["get", "kind"], "snow"]}
                layout={WEATHER_PRECIPITATION_LAYOUT}
                paint={WEATHER_SNOW_PAINT as never}
              />
            </GeoJSONSource>
          </Map>
        ))}
      {!useTerrain && active && (
        <UnitCounters
          snapshot={snapshot}
          seed={worldSeed}
          map={mapRef}
          revision={mapRevision}
          onSelect={(id) => setProvince(worldSeed.provinces[id] ?? null)}
        />
      )}
      <View
        style={[
          styles.topBar,
          landscape && {
            top: 8,
            right: undefined,
            width: nationBarWidth,
            height: 56,
            borderRadius: 0,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open campaign menu"
          onPress={() => openPanel("menu")}
          style={styles.backButton}
        >
          <Ionicons name="menu" size={25} color="#f1eadc" />
        </Pressable>
        <View style={{ paddingLeft: 10 }}>
          <NationFlag
            tag={player?.tag ?? nation.tag}
            name={player?.name ?? nation.name}
            color={player?.color ?? nation.color}
            testID="player-country-flag"
          />
        </View>
        <View style={styles.topTitleBlock}>
          <Text style={styles.topEyebrow}>YOUR NATION</Text>
          <Text style={styles.topTitle} numberOfLines={1}>
            {player?.name ?? nation.name}
          </Text>
          <Text style={styles.topStatus}>
            {player?.atWar ? "At war" : "At peace"} · Unrest{" "}
            {player?.unrest.toFixed(2) ?? "..."}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.summaryBar,
          landscape && {
            top: 8,
            left: nationBarWidth + 20,
            height: 56,
            justifyContent: "center",
            borderRadius: 0,
          },
        ]}
      >
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>TREASURY</Text>
          <Text style={styles.summaryValue}>
            {player
              ? `£${Math.round(player.treasury).toLocaleString()}`
              : "..."}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>POPULATION</Text>
          <Text style={styles.summaryValue}>
            {playerPopulation == null ? "..." : compact(playerPopulation)}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>WORLD RANK</Text>
          <Text style={styles.summaryValue}>
            {player?.gpRank ? `Rank ${player.gpRank}` : "Unranked"}
          </Text>
        </View>
      </View>
      {!!graphicsNotice && (
        <Text accessibilityRole="alert" style={styles.graphicsNotice}>
          {graphicsNotice}
        </Text>
      )}
      <MapModeChooser
        mode={mapMode}
        onChange={setMapMode}
        landscape={landscape}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Weather: ${localWeather.kind}. Open atmosphere settings`}
        onPress={() => openPanel("graphics")}
        style={{
          position: "absolute",
          left: 12,
          top: landscape ? 76 : 136,
          minHeight: 44,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: "#35545c",
          backgroundColor: "rgba(16, 43, 53, 0.88)",
        }}
      >
        <Ionicons
          name={
            localWeather.kind === "rain"
              ? "rainy-outline"
              : localWeather.kind === "snow"
                ? "snow-outline"
                : localWeather.kind === "fog"
                  ? "cloudy-outline"
                  : "sunny-outline"
          }
          size={17}
          color="#d6b475"
        />
        <Text style={{ color: "#f4eddf", fontSize: 13, fontWeight: "700" }}>
          {localWeather.kind.charAt(0).toUpperCase() +
            localWeather.kind.slice(1)}
          {atmosphere.weather === "dynamic" ? (
            <Text style={{ color: "#a9bcbd", fontWeight: "400" }}>
              {" "}
              · Regional
            </Text>
          ) : null}
        </Text>
      </Pressable>
      {active && !panel && !province && (
        <NativeReportToast
          alerts={alerts}
          landscape={landscape}
          onReview={() => openPanel("alerts")}
          dismiss={dismiss}
        />
      )}
      {panel && (
        <GameMenus
          page={panel}
          transport={transport}
          online={session.online}
          alerts={alerts}
          dismissAlert={dismiss}
          muted={muted}
          onMuted={chooseMuted}
          onPage={openPanel}
          onClose={() => setPanel(null)}
          onHome={() => {
            setPanel(null);
            onHome();
          }}
          onSaves={() => {
            setPanel(null);
            onSaves();
          }}
          snapshot={snapshot}
          notice={[actionMessage, notice].filter(Boolean).join(" ")}
          selectedProvince={province?.id ?? null}
          send={(cmd) => {
            setActionMessage("Order sent.");
            transport?.send({ t: "command", cmd });
          }}
          graphics={
            <>
              <Text style={{ color: ink, lineHeight: 22 }}>
                Reports: {alerts.length}. Open Reports and alerts from the
                campaign menu.
              </Text>
              <Text style={{ color: ink, lineHeight: 22 }}>
                {nativeMapModes.find(([id]) => id === mapMode)?.[2]}
              </Text>
              <Text style={{ color: ink, lineHeight: 22 }}>
                Analytical overlays and preview scenarios use the 2D atlas.
                Political and Terrain views in 1830 use your chosen graphics
                quality.
              </Text>
              <View style={styles.graphicsOptions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Automatic graphics"
                  accessibilityState={{ selected: preference === "auto" }}
                  onPress={() => chooseGraphics("auto")}
                  style={[
                    styles.graphicsButton,
                    preference === "auto" && styles.mapModeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.mapModeText,
                      preference === "auto" && styles.mapModeSelectedText,
                    ]}
                  >
                    Auto ·{" "}
                    {graphics === "high"
                      ? "High"
                      : graphics === "3d"
                        ? "Balanced"
                        : "2D"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="2D low power graphics"
                  accessibilityState={{ selected: preference === "2d" }}
                  onPress={() => chooseGraphics("2d")}
                  style={[
                    styles.graphicsButton,
                    preference === "2d" && styles.mapModeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.mapModeText,
                      preference === "2d" && styles.mapModeSelectedText,
                    ]}
                  >
                    2D · Low power
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="3D terrain graphics"
                  accessibilityState={{ selected: preference === "3d" }}
                  onPress={() => chooseGraphics("3d")}
                  style={[
                    styles.graphicsButton,
                    preference === "3d" && styles.mapModeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.mapModeText,
                      preference === "3d" && styles.mapModeSelectedText,
                    ]}
                  >
                    3D · Balanced
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="3D high quality graphics"
                  accessibilityState={{ selected: preference === "high" }}
                  onPress={() => chooseGraphics("high")}
                  style={[
                    styles.graphicsButton,
                    preference === "high" && styles.mapModeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.mapModeText,
                      preference === "high" && styles.mapModeSelectedText,
                    ]}
                  >
                    3D · High
                  </Text>
                </Pressable>
              </View>
              <Text style={{ color: ink, fontWeight: "700", marginTop: 12 }}>
                Atmosphere
              </Text>
              <Text style={{ color: ink, lineHeight: 21 }}>
                Cloud banks, rain and snow follow regions of the map in 2D and
                3D. Lighting cycles in 3D. Weather is visual only. Reduced
                Motion freezes animation.
              </Text>
              <View style={styles.graphicsOptions}>
                {(["cycle", "day", "night"] as const).map((lighting) => (
                  <Pressable
                    key={lighting}
                    accessibilityRole="button"
                    accessibilityLabel={`Lighting ${lighting}`}
                    accessibilityState={{
                      selected: atmosphere.lighting === lighting,
                    }}
                    onPress={() =>
                      chooseAtmosphere({ ...atmosphere, lighting })
                    }
                    style={[
                      styles.graphicsButton,
                      atmosphere.lighting === lighting &&
                        styles.mapModeSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.mapModeText,
                        atmosphere.lighting === lighting &&
                          styles.mapModeSelectedText,
                      ]}
                    >
                      {lighting === "cycle"
                        ? "Day / night cycle"
                        : lighting === "day"
                          ? "Day"
                          : "Night"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.graphicsOptions}>
                {(["dynamic", "clear", "rain", "snow", "fog"] as const).map(
                  (weather) => (
                    <Pressable
                      key={weather}
                      accessibilityRole="button"
                      accessibilityLabel={`Weather ${weather}`}
                      accessibilityState={{
                        selected: atmosphere.weather === weather,
                      }}
                      onPress={() =>
                        chooseAtmosphere({ ...atmosphere, weather })
                      }
                      style={[
                        styles.graphicsButton,
                        atmosphere.weather === weather &&
                          styles.mapModeSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.mapModeText,
                          atmosphere.weather === weather &&
                            styles.mapModeSelectedText,
                        ]}
                      >
                        {weather.charAt(0).toUpperCase() + weather.slice(1)}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
              <Text style={{ color: ink, lineHeight: 21 }}>
                {terrainAttribution.text}
              </Text>
            </>
          }
        />
      )}
      <View
        style={[
          styles.bottomDock,
          landscape && { flexDirection: "row", alignItems: "flex-end" },
        ]}
      >
        {province && (
          <ScrollView
            style={[
              styles.provinceSheet,
              landscape
                ? {
                    position: "absolute",
                    right: 10,
                    bottom: 66,
                    width: 300,
                    maxHeight: screenHeight - 160,
                  }
                : { maxHeight: screenHeight * 0.35 },
            ]}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.eyebrow}>
                  PROVINCE / {province.terrain.toUpperCase()}
                </Text>
                <Text style={styles.sheetTitle}>{province.name}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close province detail"
                onPress={() => setProvince(null)}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <View style={styles.provinceFacts}>
              <View>
                <Text style={styles.factLabel}>OWNER</Text>
                <Text style={styles.factValue}>
                  {owner?.name ?? province.ownerTag}
                </Text>
              </View>
              <View>
                <Text style={styles.factLabel}>POPULATION</Text>
                <Text style={styles.factValue}>
                  {selected?.population.toLocaleString() ?? "..."}
                </Text>
              </View>
              <View>
                <Text style={styles.factLabel}>UNREST</Text>
                <Text style={styles.factValue}>
                  {selected ? selected.unrestRisk.toFixed(2) : "..."}
                </Text>
              </View>
            </View>
            {selected?.owner === snapshot?.playerNation && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Recruit regiment in ${province.name}`}
                onPress={() => {
                  setActionMessage("");
                  transport?.send({
                    t: "command",
                    cmd: { t: "recruitArmy", province: province.id },
                  });
                }}
                style={styles.provinceAction}
              >
                <Ionicons name="add-circle-outline" size={15} color="#f1eadc" />
                <Text style={styles.provinceActionText}>Recruit regiment</Text>
              </Pressable>
            )}
            <MenuButton
              label="Open province ledger"
              onPress={() => openPanel("province")}
            />
            {!!actionMessage && (
              <Text style={styles.actionMessage}>{actionMessage}</Text>
            )}
          </ScrollView>
        )}
        <View
          style={[
            styles.navigationBar,
            landscape && { flex: 1, paddingVertical: 0 },
          ]}
        >
          {gamePanels.map((p) => (
            <Pressable
              key={p.key}
              accessibilityRole="button"
              accessibilityLabel={`Open ${p.label}`}
              onPress={() => openPanel(p.key)}
              style={[
                styles.navigationButton,
                landscape && {
                  minHeight: 56,
                  flexDirection: screenWidth < 740 ? "column" : "row",
                  gap: screenWidth < 740 ? 4 : 8,
                },
              ]}
            >
              <Ionicons name={p.icon} size={21} color={wax} />
              <Text style={styles.navigationText}>{p.label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open map settings"
            onPress={() => openPanel("graphics")}
            style={[
              styles.navigationButton,
              landscape && {
                minHeight: 56,
                flexDirection: screenWidth < 740 ? "column" : "row",
                gap: screenWidth < 740 ? 4 : 8,
              },
            ]}
          >
            <Ionicons name="settings-outline" size={21} color={paper} />
          </Pressable>
        </View>
        <View
          style={[
            styles.clockBar,
            landscape && { width: screenWidth < 740 ? 245 : 300 },
          ]}
        >
          <View>
            <Text style={styles.clockLabel}>
              DATE / SPEED {snapshot?.speed ?? 0}
            </Text>
            <Text style={styles.clockText}>
              {snapshot
                ? `${snapshot.date.day} / ${snapshot.date.month} / ${snapshot.date.year}`
                : "Loading..."}
            </Text>
          </View>
          <View style={styles.speedControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease game speed"
              disabled={!snapshot || snapshot.speed === 0}
              onPress={() =>
                transport?.send({
                  t: "command",
                  cmd: {
                    t: "setSpeed",
                    speed: Math.max(0, (snapshot?.speed ?? 0) - 1),
                  },
                })
              }
              style={styles.speedStep}
            >
              <Text style={styles.speedStepText}>−</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                snapshot?.speed ? "Pause game" : "Resume game"
              }
              onPress={() =>
                transport?.send({
                  t: "command",
                  cmd: { t: "setSpeed", speed: snapshot?.speed ? 0 : 2 },
                })
              }
              style={styles.speedButton}
            >
              <Text style={styles.speedText}>
                {snapshot?.speed ? "Ⅱ" : "▶"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase game speed"
              disabled={!snapshot}
              onPress={() =>
                transport?.send({
                  t: "command",
                  cmd: {
                    t: "setSpeed",
                    speed: Math.min(5, (snapshot?.speed ?? 0) + 1),
                  },
                })
              }
              style={styles.speedStep}
            >
              <Text style={styles.speedStepText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  useEffect(() => {
    let cancelled = false;
    const warm = setTimeout(() => {
      let choice: GraphicsPreference = "auto";
      try {
        choice = graphicsPreference(
          graphicsFile.exists ? graphicsFile.textSync() : null,
        );
      } catch {}
      const mode = choice === "auto" ? automaticGraphics(Device) : choice;
      if (mode !== "2d")
        void import("./game/terrainAssets")
          .then(({ loadNativeTerrain }) => {
            if (!cancelled)
              return loadNativeTerrain(mode === "high" ? "high" : "balanced");
          })
          .catch(() => {});
    }, 300);
    const memory = AppState.addEventListener("memoryWarning", () => {
      void import("./game/terrainAssets").then(({ releaseTerrainCache }) =>
        releaseTerrainCache(),
      );
    });
    return () => {
      cancelled = true;
      clearTimeout(warm);
      memory.remove();
    };
  }, []);

  const campaign = useCampaign();
  const multiplayer = useMultiplayer();
  const [focusOnline, setFocusOnline] = useState(false);
  const session = focusOnline ? multiplayer.session : campaign.session;
  const busy = campaign.busy;
  const notice = focusOnline
    ? `${multiplayer.status}: ${multiplayer.notice}`
    : campaign.notice;
  const [invitation, setInvitation] = useState<string | null>(null);
  const config = session?.config;
  const nation = useMemo(
    () => (config ? campaignNation(config) : null),
    [config],
  );
  const [screen, setScreen] = useState<
    "home" | "picker" | "game" | "saves" | "account" | "multiplayer"
  >("home");
  useEffect(() => {
    const receive = (url: string) => {
      const id = inviteSession(url);
      if (id) {
        setInvitation(id);
        setScreen("multiplayer");
      }
    };
    void Linking.getInitialURL().then((url) => {
      if (url) receive(url);
    });
    const listener = Linking.addEventListener("url", ({ url }) => receive(url));
    return () => listener.remove();
  }, []);
  const start = async (config: CampaignConfig) => {
    if (await campaign.open(config)) {
      setFocusOnline(false);
      setScreen("game");
    }
  };
  const load = async (save: NativeSave) => {
    if (await campaign.open(save.config, save)) {
      setFocusOnline(false);
      setScreen("game");
    }
  };
  const home = () => {
    setScreen("home");
    if (!focusOnline) void campaign.save("auto", "Returned to main menu");
  };
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: navy }}>
        <StatusBar style="light" />
        <View style={styles.root}>
          {nation && session && (
            <View
              style={{ flex: 1, display: screen === "game" ? "flex" : "none" }}
            >
              <Atlas
                key={session.config.id}
                session={session}
                notice={notice}
                onSaves={() =>
                  setScreen(session.online ? "multiplayer" : "saves")
                }
                nation={nation}
                active={screen === "game"}
                onHome={home}
              />
            </View>
          )}
          {screen === "picker" && (
            <CampaignSetup
              onBack={() => setScreen("home")}
              onStart={(config) => {
                void start(config);
              }}
              busy={busy}
              notice={notice}
            />
          )}
          {screen === "saves" && (
            <SaveLibrary
              onBack={() => setScreen("home")}
              onLoad={(save) => {
                void load(save);
              }}
              onSave={
                campaign.session
                  ? (label) => campaign.save("manual", label)
                  : undefined
              }
              campaignName={campaign.session?.config.name}
              busy={busy}
              notice={notice}
            />
          )}
          {screen === "multiplayer" && (
            <MultiplayerScreen
              multiplayer={multiplayer}
              invitation={invitation}
              onBack={() => setScreen("home")}
              onPlay={() => {
                setFocusOnline(true);
                setScreen("game");
              }}
            />
          )}
          {screen === "account" && (
            <AccountScreen onBack={() => setScreen("home")} />
          )}
          {screen === "home" && (
            <HomeScreen
              busy={busy}
              notice={notice}
              resume={nation?.name}
              onResume={() => setScreen("game")}
              onNew={() => setScreen("picker")}
              onLoad={() => setScreen("saves")}
              onMultiplayer={() => setScreen("multiplayer")}
              onAccount={() => setScreen("account")}
            />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  navigationBar: {
    flexDirection: "row",
    backgroundColor: navy,
    borderTopWidth: 1,
    borderColor: "#34515b",
    paddingVertical: 5,
  },
  navigationButton: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  navigationText: { fontSize: 10, fontWeight: "600", color: paper },
  root: { flex: 1, backgroundColor: paper },
  page: { flex: 1 },
  hero: {
    backgroundColor: navy,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomColor: wax,
    borderBottomWidth: 2,
  },
  brand: {
    color: "#f1eadc",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
  heroFoot: {
    color: "#afbbb9",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 5,
  },
  pickerContent: { flex: 1, paddingHorizontal: 12, paddingTop: 15 },
  eyebrow: {
    color: "#836332",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: { color: ink, fontSize: 19, fontWeight: "800", marginBottom: 11 },
  search: {
    backgroundColor: "#f8f6ef",
    borderColor: "#aba99e",
    borderWidth: 1,
    borderRadius: 12,
    color: ink,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  listHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomColor: "#99998e",
    borderBottomWidth: 1,
    marginTop: 16,
    paddingBottom: 5,
  },
  resultCount: {
    color: "#526268",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  nationRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: "#c8c8bd",
    borderBottomWidth: 1,
    gap: 10,
  },
  pressed: { opacity: 0.55 },
  swatch: { width: 8, height: 30, borderRadius: 0 },
  nationText: { flex: 1 },
  nationName: { color: ink, fontSize: 17, fontWeight: "700" },
  nationTag: {
    color: "#526268",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  rowArrow: { color: "#526268", fontSize: 16 },
  emptyText: { color: "#66747a", paddingVertical: 24 },
  mapPage: { flex: 1, backgroundColor: "#a5bec5" },
  map: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: navy,
    paddingTop: 0,
    height: 64,
    borderBottomColor: "#34515b",
    borderBottomWidth: 1,
  },
  backButton: {
    width: 48,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: "#f1eadc", fontSize: 28, lineHeight: 31 },
  topTitleBlock: { flex: 1, paddingLeft: 11 },
  topEyebrow: {
    color: "#c9aa71",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  topTitle: {
    color: "#f1eadc",
    fontFamily: "Georgia",
    fontSize: 21,
    fontWeight: "600",
    marginTop: 1,
  },
  topStatus: {
    color: "#c4d0cc",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  summaryBar: {
    position: "absolute",
    top: 74,
    left: 10,
    right: 10,
    flexDirection: "row",
    backgroundColor: navy,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    paddingVertical: 10,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    borderRightColor: "#34515b",
    borderRightWidth: 1,
  },
  summaryLabel: {
    color: "#a8b8b9",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  summaryValue: { color: paper, fontSize: 17, fontWeight: "800", marginTop: 2 },
  secondaryBar: {
    position: "absolute",
    top: 125,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "#dfdfd2",
    borderBottomColor: "#878e8b",
    borderBottomWidth: 1,
    height: 38,
    alignItems: "center",
  },
  secondaryItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderRightColor: "#34515b",
    borderRightWidth: 1,
  },
  secondaryLabel: { color: "#42565a", fontSize: 9, fontWeight: "800" },
  secondaryValue: {
    color: ink,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 4,
  },
  graphicsOptions: {
    gap: 12,
    backgroundColor: "#f4f1e8",
    borderWidth: 1,
    borderColor: "#87918b",
  },
  graphicsButton: {
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  graphicsNotice: {
    position: "absolute",
    bottom: 300,
    right: 8,
    left: 8,
    padding: 10,
    backgroundColor: "#f4f1e8",
    color: ink,
  },
  mapModeButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  mapModeSelected: { backgroundColor: navy },
  mapModeText: { color: ink, fontSize: 12, fontWeight: "800" },
  mapModeSelectedText: { color: "#f1eadc" },
  bottomDock: { position: "absolute", bottom: 0, left: 0, right: 0 },
  provinceSheet: {
    backgroundColor: "#f4f1e8",
    borderTopColor: "#777d75",
    borderTopWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sheetTitle: { color: ink, fontSize: 17, fontWeight: "800", marginTop: 2 },
  closeText: { color: "#526268", fontSize: 22, lineHeight: 24 },
  provinceFacts: {
    flexDirection: "row",
    gap: 24,
    borderTopColor: "#c8c8bd",
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 7,
  },
  factLabel: {
    color: "#526268",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  factValue: { color: ink, fontSize: 12, fontWeight: "700", marginTop: 2 },
  provinceAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: navy,
    minHeight: 38,
    marginTop: 9,
  },
  provinceActionText: { color: "#f1eadc", fontSize: 12, fontWeight: "800" },
  actionMessage: { color: "#42565a", fontSize: 11, marginTop: 6 },
  clockBar: {
    backgroundColor: "#0a2029",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 13,
    paddingRight: 5,
    height: 56,
  },
  clockLabel: {
    color: "#a9b6b3",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  clockText: {
    color: "#f1eadc",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 2,
  },
  speedControls: { flexDirection: "row", alignItems: "center" },
  speedStep: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  speedStepText: { color: "#f1eadc", fontSize: 19 },
  speedButton: {
    width: 44,
    height: 40,
    borderRadius: 10,
    backgroundColor: wax,
    alignItems: "center",
    justifyContent: "center",
  },
  speedText: { color: navy, fontSize: 15, fontWeight: "900" },
});
