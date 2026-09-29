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
import borders from "./assets/game/borders.json";
import { File, Paths } from "expo-file-system";
import { GRAPHICS_KEY } from "../../src/graphics/preferences";
const TerrainMap = lazy(() => import("./game/TerrainMap"));
import type { View as TerrainView } from "../../src/graphics/terrainData";
import { NationFlag } from "./game/NationFlag";
import terrainAttribution from "../../src/graphics/terrain-attribution.json";
const graphicsFile = new File(Paths.document, GRAPHICS_KEY + ".json");
import worldSeed from "./assets/game/worldSeed.json";
import { useCampaign, type Session } from "./game/useCampaign";
import { CampaignSetup, SaveLibrary } from "./game/CampaignScreens";
import { AccountScreen } from "./game/AccountScreen";
import { campaignNation, type NativeSave, type CampaignConfig } from "./game/campaign";
import type { SeedNation } from "../../src/data/generated";
import { labelFitsViewport } from "./game/mapLabelPlacement";

type Nation = SeedNation;
type Province = (typeof worldSeed.provinces)[number];
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
  const screenHeight = useWindowDimensions().height;
  const mapRef = useRef<MapRef>(null);
  const terrainCamera = useRef<TerrainView | null>(null);
  const projectionRun = useRef(0);
  const [province, setProvince] = useState<Province | null>(null);
  const { snapshot, transport } = session;
  const [mapMode, setMapMode] = useState<"political" | "terrain">("political");
  const [actionMessage, setActionMessage] = useState("");
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
  const [graphicsNotice, setGraphicsNotice] = useState("");
  const [panel, setPanel] = useState<GamePanel | null>(null);
  const openPanel = (next: GamePanel) => {
    transport?.send({ t: "command", cmd: { t: "setSpeed", speed: 0 } });
    setActionMessage("");
    setPanel(next);
  };
  useEffect(() => {
    if (!active)
      transport?.send({ t: "command", cmd: { t: "setSpeed", speed: 0 } });
  }, [active, transport]);
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
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [visibleLabelTags, setVisibleLabelTags] = useState<string[]>([]);
  const capital = worldSeed.provinces.find(
    (item) => item.id === nation.capitalProvinceId,
  );
  const focus = (session.config.mapMode === "historical" ? mapAnchors[nation.tag] : null) ?? {
    center: capital
      ? ([capital.lon, capital.lat] as [number, number])
      : ([0, 20] as [number, number]),
    zoom: 3.3,
  };
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
      (item) => session.config.mapMode === "historical" && item.gpRank > 0 && item.gpRank <= 8 && item.tag in mapAnchors,
    )
    .map((item) => item.tag)
    .sort()
    .join(",");
  const ownershipKey = snapshot.provinces.map((p) => p.owner).join(',') + '/' + snapshot.nations.map((n) => n.color.join(',')).join(';');
  const politicalAtlas = useMemo(() => ({ ...atlas, features: atlas.features.map((feature) => {
    const owner = snapshot.nations[snapshot.provinces[feature.properties.id]?.owner];
    return { ...feature, properties: { ...feature.properties, color: owner ? `rgb(${owner.color.join(',')})` : feature.properties.color } };
  }) }), [ownershipKey, session.config.id]);
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
    const bottomReserved = province ? 320 : 116;
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
              topInset: 176,
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
  }, [candidateTags, mapSize.width, mapSize.height, province?.id]);


  return (
    <View style={styles.mapPage}>
      {active &&
        (graphics !== "2d" ? (
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
              void placeLabels();
            }}
            onRegionWillChange={() => {
              projectionRun.current += 1;
              setVisibleLabelTags([]);
            }}
            onRegionDidChange={(event) => {
              const v = event.nativeEvent;
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
                paint={{ "raster-opacity": mapMode === "terrain" ? 0.8 : 0.55 }}
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
                  "fill-opacity": mapMode === "political" ? 0.77 : 0.18,
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
                  "fill-opacity": mapMode === "terrain" ? 0.45 : 0.1,
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
                  "fill-opacity": mapMode === "terrain" ? 0.38 : 0.15,
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
                  "line-opacity": session.config.mapMode === "historical" ? 0.9 : 0,
                }}
              />
              <Layer
                id="country-border"
                type="line"
                filter={["==", ["get", "kind"], "country"]}
                paint={{ "line-color": "#344a49", "line-width": 1.1, "line-opacity": session.config.mapMode === "historical" ? 1 : 0 }}
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
          </Map>
        ))}
      <View style={styles.topBar}>
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
            tag={nation.tag}
            name={nation.name}
            color={nation.color}
          />
        </View>
        <View style={styles.topTitleBlock}>
          <Text style={styles.topEyebrow}>YOUR NATION</Text>
          <Text style={styles.topTitle} numberOfLines={1}>
            {nation.name}
          </Text>
          <Text style={styles.topStatus}>
            {player?.atWar ? "At war" : "At peace"} · Unrest{" "}
            {player?.unrest.toFixed(2) ?? "..."}
          </Text>
        </View>
      </View>
      <View style={styles.summaryBar}>
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
      <View style={styles.mapModeBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Political map"
          accessibilityState={{ selected: mapMode === "political" }}
          onPress={() => setMapMode("political")}
          style={[
            styles.mapModeButton,
            mapMode === "political" && styles.mapModeSelected,
          ]}
        >
          <Ionicons
            name="globe-outline"
            size={13}
            color={mapMode === "political" ? "#f1eadc" : ink}
          />
          <Text
            style={[
              styles.mapModeText,
              mapMode === "political" && styles.mapModeSelectedText,
            ]}
          >
            Political
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Terrain map"
          accessibilityState={{ selected: mapMode === "terrain" }}
          onPress={() => setMapMode("terrain")}
          style={[
            styles.mapModeButton,
            mapMode === "terrain" && styles.mapModeSelected,
          ]}
        >
          <Ionicons
            name="leaf-outline"
            size={13}
            color={mapMode === "terrain" ? "#f1eadc" : ink}
          />
          <Text
            style={[
              styles.mapModeText,
              mapMode === "terrain" && styles.mapModeSelectedText,
            ]}
          >
            Terrain
          </Text>
        </Pressable>
      </View>
      {panel && (
        <GameMenus
          page={panel}
          onPage={openPanel}
          onClose={() => setPanel(null)}
          onHome={() => {
            setPanel(null);
            onHome();
          }}
          onSaves={() => { setPanel(null); onSaves(); }}
          snapshot={snapshot}
          notice={[actionMessage, notice].filter(Boolean).join(" ")}
          selectedProvince={province?.id ?? null}
          send={(cmd) => {
            setActionMessage("Order sent.");
            transport?.send({ t: "command", cmd });
          }}
          graphics={
            <>
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
              <Text style={{ color: ink, lineHeight: 21 }}>
                {terrainAttribution.text}
              </Text>
            </>
          }
        />
      )}
      <View style={styles.bottomDock}>
        {province && (
          <ScrollView
            style={[styles.provinceSheet, { maxHeight: screenHeight * 0.35 }]}
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
            {!!actionMessage && (
              <Text style={styles.actionMessage}>{actionMessage}</Text>
            )}
          </ScrollView>
        )}
        <View style={styles.navigationBar}>
          {gamePanels.map((p) => (
            <Pressable
              key={p.key}
              accessibilityRole="button"
              accessibilityLabel={`Open ${p.label}`}
              onPress={() => openPanel(p.key)}
              style={styles.navigationButton}
            >
              <Ionicons name={p.icon} size={21} color={wax} />
              <Text style={styles.navigationText}>{p.label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open map settings"
            onPress={() => openPanel("graphics")}
            style={styles.navigationButton}
          >
            <Ionicons name="settings-outline" size={21} color={paper} />
          </Pressable>
        </View>
        <View style={styles.clockBar}>
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
  const { session, busy, notice } = campaign;
  const config = session?.config;
  const nation = useMemo(() => config ? campaignNation(config) : null, [config]);
  const [screen, setScreen] = useState<"home" | "picker" | "game" | "saves" | "account">("home");
  const start = async (config: CampaignConfig) => { if (await campaign.open(config)) setScreen("game"); };
  const load = async (save: NativeSave) => { if (await campaign.open(save.config, save)) setScreen("game"); };
  const home = () => {
    setScreen("home");
    void campaign.save('auto', 'Returned to main menu');
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
                onSaves={() => setScreen("saves")}
                nation={nation}
                active={screen === "game"}
                onHome={home}
              />
            </View>
          )}
          {screen === "picker" && <CampaignSetup onBack={() => setScreen("home")} onStart={(config) => { void start(config); }} busy={busy} notice={notice} />}
          {screen === "saves" && <SaveLibrary onBack={() => setScreen("home")} onLoad={(save) => { void load(save); }} onSave={session ? (label) => campaign.save('manual', label) : undefined} campaignName={session?.config.name} busy={busy} notice={notice} />}
          {screen === "account" && <AccountScreen onBack={() => setScreen("home")} />}
          {screen === "home" && (
            <ScrollView contentContainerStyle={styles.home}>
              <View style={styles.homeMasthead}>
                <Image
                  source={require("./assets/grand-century-icon.png")}
                  style={{ width: 48, height: 48, borderRadius: 12 }}
                  accessibilityLabel="Grand Century"
                />
                <View>
                  <Text style={styles.homeBrand}>GRAND CENTURY</Text>
                  <Text style={styles.homeEdition}>THE AGE OF AMBITION</Text>
                </View>
              </View>
              <View style={styles.homeHero}>
                <Image
                  source={require("./assets/map/gray-earth-relief.png")}
                  resizeMode="cover"
                  style={styles.homeMap}
                />
                <Text style={styles.homeKicker}>
                  A WORLD ON THE BRINK OF CHANGE
                </Text>
                <Text style={styles.homeTitle}>
                  The world{`\n`}is yours to shape.
                </Text>
                <View style={styles.homeRule} />
                <Text style={styles.homeSubtitle}>
                  Build a nation. Command its future.
                </Text>
                <View style={styles.homeMetrics}>
                  <View>
                    <Text style={styles.homeNumber}>1830</Text>
                    <Text style={styles.homeEdition}>THE BEGINNING</Text>
                  </View>
                  <View>
                    <Text style={styles.homeNumber}>
                      {worldSeed.nations.length}
                    </Text>
                    <Text style={styles.homeEdition}>PLAYABLE NATIONS</Text>
                  </View>
                </View>
              </View>
              {nation && (
                <MenuButton
                  label={`Resume ${nation.name}`}
                  onPress={() => setScreen("game")}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New campaign"
                disabled={busy}
                onPress={() => setScreen("picker")}
                style={styles.homePrimary}
              >
                <Text style={styles.homePrimaryText}>New campaign</Text>
                <Ionicons name="arrow-forward" size={24} color={navy} />
              </Pressable>
              <MenuButton label="Load and manage saves" onPress={() => setScreen("saves")} disabled={busy} />
              <MenuButton label="Lakeside account" onPress={() => setScreen("account")} />
              {!!notice && <Text style={styles.homeCopy}>{notice}</Text>}
              <View style={styles.homeGuide}>
                <Text style={styles.homeGuideTitle}>
                  Power is built, not given.
                </Text>
                <Text style={styles.homeCopy}>
                  Shape your economy, forge alliances and lead your armies.
                  Every decision leaves its mark.
                </Text>
                <View style={styles.homePillars}>
                  {gamePanels.map((p) => (
                    <View key={p.key} style={styles.homePillar}>
                      <Ionicons name={p.icon} size={23} color={wax} />
                      <Text style={styles.homePillarLabel}>{p.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <Text style={styles.homeFootnote}>
                Campaigns save on this device. Play offline and return whenever you like.
              </Text>
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  home: {
    flexGrow: 1,
    padding: 22,
    gap: 18,
    backgroundColor: navy,
    alignItems: "stretch",
  },
  homeMasthead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: 4,
  },
  homeBrand: {
    fontSize: 17,
    fontWeight: "800",
    color: paper,
    letterSpacing: 2,
  },
  homeEdition: {
    fontSize: 9,
    fontWeight: "700",
    color: "#a8b8b9",
    letterSpacing: 1.5,
    marginTop: 5,
  },
  homeHero: {
    paddingTop: 32,
    paddingBottom: 22,
    overflow: "hidden",
    borderBottomWidth: 1,
    borderColor: "#34515b",
  },
  homeMap: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0.12,
  },
  homeKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.7,
    color: wax,
    marginBottom: 18,
  },
  homeTitle: {
    fontFamily: "Georgia",
    fontSize: 42,
    lineHeight: 48,
    color: paper,
    letterSpacing: -1,
  },
  homeRule: {
    height: 2,
    width: 44,
    backgroundColor: wax,
    marginTop: 22,
    marginBottom: 16,
  },
  homeSubtitle: { fontSize: 16, color: "#c2d0cc", lineHeight: 25 },
  homeMetrics: { flexDirection: "row", gap: 48, marginTop: 28 },
  homeNumber: { fontFamily: "Georgia", fontSize: 27, color: paper },
  homePrimary: {
    minHeight: 60,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: wax,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  homePrimaryText: { fontSize: 17, fontWeight: "800", color: navy },
  homeGuide: { paddingTop: 10, gap: 12 },
  homeGuideTitle: { fontFamily: "Georgia", fontSize: 23, color: paper },
  homeCopy: { fontSize: 14, lineHeight: 22, color: "#afc0c0" },
  homePillars: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  homePillar: { alignItems: "center", gap: 8 },
  homePillarLabel: { fontSize: 10, color: paper, fontWeight: "600" },
  homeFootnote: {
    fontSize: 11,
    lineHeight: 18,
    color: "#96acab",
    marginTop: 10,
  },
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
  mapModeBar: {
    borderRadius: 12,
    overflow: "hidden",
    position: "absolute",
    bottom: 134,
    right: 12,
    flexDirection: "row",
    borderColor: "#87918b",
    borderWidth: 1,
    backgroundColor: "#f4f1e8",
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
