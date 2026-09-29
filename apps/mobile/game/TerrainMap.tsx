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
  type TerrainQuality,
} from "../../../src/graphics/terrainData";
import type { WorldSnapshot } from "../../../src/shared/types";
import { homelandAnchors } from "../../../src/graphics/mapAnchors";
import { verifyTerrainFrame } from "./terrainFrame";
import worldSeed from "../assets/game/worldSeed.json";

type Props = {
  quality: TerrainQuality;
  visible?: boolean;
  camera: RefObject<View | null>;
  focus: { center: [number, number]; zoom: number };
  snapshot: WorldSnapshot | null;
  political: boolean;
  selected: number | null;
  onSelect: (id: number | null) => void;
  onFallback: (reason: string) => void;
  onFrame?: (gl: ExpoWebGLRenderingContext) => void;
};
export default function TerrainMap(props: Props) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const ratio = PixelRatio.get();
  // ExpoGL captures drawingBufferWidth/Height once. Mount only after layout,
  // and recreate the surface on resize instead of retaining stale dimensions.
  return (
    <NativeView
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setLayout((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
      }}
    >
      {layout.width > 0 && layout.height > 0 && (
        <TerrainSurface
          key={`${props.quality}:${layout.width}:${layout.height}:${ratio}`}
          {...props}
          layout={layout}
        />
      )}
    </NativeView>
  );
}
function TerrainSurface(
  props: Props & { layout: { width: number; height: number } },
) {
  const renderer = useRef<TerrainRenderer | null>(null),
    glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const frame = useRef(0),
    last = useRef(0),
    alive = useRef(true),
    active = useRef(
      props.visible !== false && AppState.currentState === "active",
    ),
    reduce = useRef(false),
    dirty = useRef(true),
    presented = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const view = useRef<View>(
    props.camera.current ?? {
      lon: props.focus.center[0],
      lat: props.focus.center[1],
      zoom: props.focus.zoom - 0.7,
    },
  );
  const size = useRef(props.layout),
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
      try {
        r.render(
          reduce.current ? 0 : time / 1000,
          latest.current.political,
          latest.current.selected,
        );
        const gl = glRef.current!;
        if (!presented.current) {
          verifyTerrainFrame(gl);
          presented.current = true;
          setReady(true);
        }
        latest.current.onFrame?.(gl);
        gl.endFrameEXP();
      } catch {
        r.dispose();
        renderer.current = null;
        latest.current.onFallback(
          "3D could not draw the map. Using the 2D map.",
        );
        return;
      }
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
      active.current = value === "active" && latest.current.visible !== false;
      if (!active.current) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      } else wake();
    });
    const watchdog = setTimeout(() => {
      // Synchronous atlas/shader setup can finish after the timer is due but
      // before the next RAF. The frame itself has a separate pixel check.
      if (!renderer.current && active.current)
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
    active.current =
      props.visible !== false && AppState.currentState === "active";
    if (active.current) wake();
    else {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
  }, [props.visible]);
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
            if (
              gesture.current.distance > 0 &&
              distance > 0 &&
              renderer.current
            )
              move(
                renderer.current.zoomAt(
                  (t[0].locationX + t[1].locationX) / 2,
                  (t[0].locationY + t[1].locationY) / 2,
                  Math.log2(distance / gesture.current.distance),
                ),
              );
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
      const packed =
        props.quality === "high"
          ? await import("../../../src/graphics/terrain-atlas-high.json")
          : await import("../../../src/graphics/terrain-atlas.json");
      if (!alive.current) return;
      glRef.current = gl;
      const r = new TerrainRenderer(
        gl as unknown as WebGLRenderingContext,
        unpackTerrain(packed.default),
        props.quality,
      );
      renderer.current = r;
      r.setScenery(worldSeed.provinces);
      r.setView(view.current, size.current.width, size.current.height);
      const s = latest.current.snapshot;
      if (s)
        r.setPalette(
          s.provinces.map((p) => s.nations[p.owner]?.color ?? [170, 160, 130]),
        );
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
    <NativeView style={StyleSheet.absoluteFill}>
      <GLView
        style={{
          position: "absolute",
          width:
            (size.current.width *
              renderScale(PixelRatio.get(), props.quality)) /
            PixelRatio.get(),
          height:
            (size.current.height *
              renderScale(PixelRatio.get(), props.quality)) /
            PixelRatio.get(),
          left:
            (size.current.width -
              (size.current.width *
                renderScale(PixelRatio.get(), props.quality)) /
                PixelRatio.get()) /
            2,
          top:
            (size.current.height -
              (size.current.height *
                renderScale(PixelRatio.get(), props.quality)) /
                PixelRatio.get()) /
            2,
          transform: [
            {
              scale:
                PixelRatio.get() / renderScale(PixelRatio.get(), props.quality),
            },
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
