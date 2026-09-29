import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View as NativeView,
} from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import {
  TerrainRenderer,
  renderScale,
  shouldRenderFrame,
} from "../../../src/graphics/TerrainRenderer";
import {
  normalizeView,
  unpackTerrain,
  type View,
} from "../../../src/graphics/terrainData";
import type { WorldSnapshot } from "../../../src/shared/types";
import { homelandAnchors } from "../../../src/graphics/mapAnchors";
import worldSeed from "../assets/game/worldSeed.json";

type Props = {
  camera: RefObject<View | null>;
  focus: { center: [number, number]; zoom: number };
  snapshot: WorldSnapshot | null;
  political: boolean;
  selected: number | null;
  onSelect: (id: number | null) => void;
  onFallback: (reason: string) => void;
};
export default function TerrainMap(props: Props) {
  const renderer = useRef<TerrainRenderer | null>(null),
    glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const frame = useRef(0),
    last = useRef(0),
    alive = useRef(true),
    active = useRef(AppState.currentState === "active"),
    reduce = useRef(false),
    dirty = useRef(true);
  const latest = useRef(props);
  latest.current = props;
  const view = useRef<View>(
    props.camera.current ?? {
      lon: props.focus.center[0],
      lat: props.focus.center[1],
      zoom: props.focus.zoom - 0.7,
    },
  );
  const size = useRef({ width: 1, height: 1 }),
    [ready, setReady] = useState(false),
    [revision, setRevision] = useState(0);
  const gesture = useRef({ x: 0, y: 0, distance: 0, moved: 0 });
  function tick(time: number) {
    frame.current = 0;
    if (!alive.current || !active.current) return;
    const r = renderer.current;
    if (
      r &&
      shouldRenderFrame(time, last.current, true, reduce.current, dirty.current)
    ) {
      r.render(
        reduce.current ? 0 : time / 1000,
        latest.current.political,
        latest.current.selected,
      );
      glRef.current?.endFrameEXP();
      dirty.current = false;
      last.current = time;
    }
    if (r && !reduce.current) frame.current = requestAnimationFrame(tick);
  }
  function wake() {
    dirty.current = true;
    if (!frame.current && active.current && renderer.current)
      frame.current = requestAnimationFrame(tick);
  }
  function move(v: View) {
    view.current = normalizeView(v);
    latest.current.camera.current = view.current;
    renderer.current?.setView(
      view.current,
      size.current.width,
      size.current.height,
    );
    setRevision((n) => n + 1);
    wake();
  }
  useEffect(() => {
    alive.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive.current) {
        reduce.current = value;
        wake();
      }
    });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        reduce.current = value;
        wake();
      },
    );
    const state = AppState.addEventListener("change", (value) => {
      active.current = value === "active";
      if (!active.current) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      } else wake();
    });
    const watchdog = setTimeout(() => {
      if (!renderer.current)
        latest.current.onFallback("3D could not start. Using the 2D map.");
    }, 15000);
    return () => {
      alive.current = false;
      clearTimeout(watchdog);
      motion.remove();
      state.remove();
      cancelAnimationFrame(frame.current);
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    const r = renderer.current,
      s = props.snapshot;
    if (r && s)
      r.setPalette(
        s.provinces.map((p) => s.nations[p.owner]?.color ?? [170, 160, 130]),
      );
    wake();
  }, [props.snapshot, props.political, props.selected]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const t = e.nativeEvent.touches;
          gesture.current = {
            x: t[0].pageX,
            y: t[0].pageY,
            distance:
              t.length > 1
                ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY)
                : 0,
            moved: 0,
          };
        },
        onPanResponderMove: (e) => {
          const t = e.nativeEvent.touches;
          if (t.length > 1) {
            const distance = Math.hypot(
              t[0].pageX - t[1].pageX,
              t[0].pageY - t[1].pageY,
            );
            if (gesture.current.distance > 0)
              move({
                ...view.current,
                zoom:
                  view.current.zoom +
                  Math.log2(distance / gesture.current.distance),
              });
            gesture.current.distance = distance;
            gesture.current.moved = 100;
          } else if (t.length === 1) {
            // Re-anchor when a pinch releases one finger before continuing the drag.
            if (gesture.current.distance > 0) {
              gesture.current.x = t[0].pageX;
              gesture.current.y = t[0].pageY;
              gesture.current.distance = 0;
              return;
            }
            const dx = t[0].pageX - gesture.current.x,
              dy = t[0].pageY - gesture.current.y;
            gesture.current.moved += Math.abs(dx) + Math.abs(dy);
            gesture.current.x = t[0].pageX;
            gesture.current.y = t[0].pageY;
            gesture.current.distance = 0;
            const r = renderer.current;
            if (r) move(r.pan(dx, dy));
          }
        },
        onPanResponderRelease: (e) => {
          if (gesture.current.moved < 7)
            latest.current.onSelect(
              renderer.current?.provinceAtPoint(
                e.nativeEvent.locationX,
                e.nativeEvent.locationY,
              ) ?? null,
            );
        },
        onPanResponderTerminate: () => {
          gesture.current.moved = 100;
        },
      }),
    [],
  );
  async function context(gl: ExpoWebGLRenderingContext) {
    try {
      const packed = await import("../../../src/graphics/terrain-atlas.json");
      if (!alive.current) return;
      glRef.current = gl;
      const r = new TerrainRenderer(
        gl as unknown as WebGLRenderingContext,
        unpackTerrain(packed.default),
      );
      renderer.current = r;
      r.setView(view.current, size.current.width, size.current.height);
      const s = latest.current.snapshot;
      if (s)
        r.setPalette(
          s.provinces.map((p) => s.nations[p.owner]?.color ?? [170, 160, 130]),
        );
      setReady(true);
      wake();
    } catch {
      latest.current.onFallback(
        "3D is unavailable on this device. Using the 2D map.",
      );
    }
  }
  void revision;
  const r = renderer.current;
  return (
    <NativeView
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        size.current = e.nativeEvent.layout;
        move(view.current);
      }}
    >
      <GLView
        style={{
          position: "absolute",
          width:
            (size.current.width * renderScale(PixelRatio.get())) /
            PixelRatio.get(),
          height:
            (size.current.height * renderScale(PixelRatio.get())) /
            PixelRatio.get(),
          left:
            (size.current.width -
              (size.current.width * renderScale(PixelRatio.get())) /
                PixelRatio.get()) /
            2,
          top:
            (size.current.height -
              (size.current.height * renderScale(PixelRatio.get())) /
                PixelRatio.get()) /
            2,
          transform: [
            { scale: PixelRatio.get() / renderScale(PixelRatio.get()) },
          ],
        }}
        msaaSamples={0}
        onContextCreate={context}
      />
      <NativeView
        style={StyleSheet.absoluteFill}
        {...pan.panHandlers}
        accessibilityLabel="3D terrain map. Drag to pan and pinch to zoom."
      />
      {!ready && (
        <Text style={styles.loading} accessibilityRole="text">
          Preparing offline terrain...
        </Text>
      )}
      {ready &&
        r &&
        props.snapshot?.nations
          .filter((n) => n.gpRank > 0 && n.gpRank <= 8)
          .map((n) => {
            const p = worldSeed.provinces.find((p) => p.id === n.capital);
            if (!p) return null;
            const anchor = homelandAnchors[n.tag] ?? [p.lon, p.lat];
            const [x, y] = r.project(anchor[0], anchor[1]);
            if (
              x < 60 ||
              x > size.current.width - 60 ||
              y < 220 ||
              y > size.current.height - 250
            )
              return null;
            return (
              <Text
                pointerEvents="none"
                key={n.id}
                style={[styles.label, { left: x - 60, top: y - 10 }]}
                numberOfLines={1}
              >
                {n.name}
              </Text>
            );
          })}
      <NativeView style={styles.zoom}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          onPress={() =>
            move({ ...view.current, zoom: view.current.zoom + 0.4 })
          }
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          onPress={() =>
            move({ ...view.current, zoom: view.current.zoom - 0.4 })
          }
          style={styles.zoomButton}
        >
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
      </NativeView>
    </NativeView>
  );
}
const styles = StyleSheet.create({
  loading: {
    position: "absolute",
    top: "45%",
    alignSelf: "center",
    padding: 14,
    backgroundColor: "#f3ead7",
    color: "#213d46",
  },
  label: {
    position: "absolute",
    width: 120,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: "#f4eddc",
    textShadowColor: "#16303a",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  zoom: {
    position: "absolute",
    right: 8,
    bottom: 255,
    flexDirection: "row",
    gap: 4,
  },
  zoomButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eeeae0",
    borderWidth: 1,
    borderColor: "#87918b",
  },
  zoomText: { fontSize: 24, color: "#17262d" },
});
