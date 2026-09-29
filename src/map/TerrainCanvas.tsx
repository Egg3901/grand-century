import { cityLabels } from "../graphics/cities";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { homelandAnchors } from "../graphics/mapAnchors";
import worldSeed from "../data/generated/worldSeed.json";
import { useStore } from "../store";
import { useSnapshotFields } from "../ui/useSnapshotFields";
import {
  TerrainRenderer,
  renderScale,
  shouldRenderFrame,
} from "../graphics/TerrainRenderer";
import {
  normalizeView,
  unpackTerrain,
  type View,
  type TerrainQuality,
} from "../graphics/terrainData";
import { TERRAIN_CREDIT } from "../graphics/preferences";
import { visibleUnitOwnerIds } from "./unitVisibility";

export function TerrainCanvas({
  onFallback,
  camera,
  quality = "balanced",
}: {
  onFallback: (reason: string) => void;
  camera: RefObject<View | null>;
  quality?: TerrainQuality;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<TerrainRenderer | null>(null);
  const snapshot = useSnapshotFields([
      "playerNation",
      "nations",
      "provinces",
      "armies",
      "fleets",
      "wars",
      "relations",
    ] as const),
    data = worldSeed,
    mode = useStore((s) => s.mapMode),
    selected = useStore((s) => s.selectedProvince);
  const [ready, setReady] = useState(false),
    [revision, setRevision] = useState(0);
  const initial = useRef<View | null>(null);
  if (!initial.current) {
    const capital =
      data?.provinces[snapshot?.nations[snapshot.playerNation]?.capital ?? 0];
    const anchor =
      homelandAnchors[snapshot?.nations[snapshot.playerNation]?.tag ?? ""];
    initial.current = camera.current ?? {
      lon: anchor?.[0] ?? capital?.lon ?? 8,
      lat: anchor?.[1] ?? capital?.lat ?? 42,
      zoom: 2.9,
    };
  }
  const view = useRef(initial.current),
    dirty = useRef(true);
  const wakeRef = useRef(() => {});
  const move = useCallback(
    (v: View) => {
      view.current = normalizeView(v);
      camera.current = view.current;
      const c = canvas.current,
        r = renderer.current;
      if (c && r) {
        r.setView(view.current, c.clientWidth, c.clientHeight);
        dirty.current = true;
        setRevision((n) => n + 1);
        wakeRef.current();
      }
    },
    [camera],
  );
  const latest = useRef({ snapshot, data, mode, selected });
  latest.current = { snapshot, data, mode, selected };
  useEffect(() => {
    dirty.current = true;
    const r = renderer.current;
    if (r && snapshot)
      r.setPalette(
        snapshot.provinces.map(
          (p) => snapshot.nations[p.owner]?.color ?? [170, 160, 130],
        ),
      );
    wakeRef.current();
  }, [snapshot, mode, selected]);
  useEffect(() => {
    const node = canvas.current;
    let alive = true,
      frame = 0,
      last = 0;
    let observer: ResizeObserver | undefined;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (time: number) => {
      frame = 0;
      if (!alive || document.hidden) return;
      const r = renderer.current;
      if (
        r &&
        shouldRenderFrame(
          time,
          last,
          !document.hidden,
          motion.matches || r.isPreparingScenery,
          dirty.current || r.needsFrame,
        )
      ) {
        try {
          r.render(
            motion.matches ? 0 : time / 1000,
            latest.current.mode !== "terrain",
            latest.current.selected,
          );
        } catch {
          onFallback("3D graphics became unavailable. Switched to 2D.");
          return;
        }
        last = time;
        dirty.current = false;
      }
      if (!motion.matches || r?.needsFrame || r?.isPreparingScenery)
        frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const c = canvas.current,
        r = renderer.current;
      if (!c || !r) return;
      const box = c.getBoundingClientRect();
      c.width = Math.round(box.width * renderScale(devicePixelRatio, quality));
      c.height = Math.round(
        box.height * renderScale(devicePixelRatio, quality),
      );
      r.setView(view.current, box.width, box.height);
      camera.current = view.current;
      dirty.current = true;
      setRevision((v) => v + 1);
      wakeRef.current();
    };
    const wake = () => {
      dirty.current = true;
      if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;
    const lost = (e: Event) => {
      e.preventDefault();
      onFallback("3D graphics became unavailable. Switched to 2D.");
    };
    void (
      quality === "high"
        ? import("../graphics/terrain-atlas-high.json")
        : import("../graphics/terrain-atlas.json")
    )
      .then((p) => {
        if (!alive || !canvas.current) return;
        try {
          const gl = canvas.current.getContext("webgl", {
            alpha: false,
            antialias: false,
            powerPreference:
              quality === "high" ? "high-performance" : "low-power",
          });
          if (!gl) throw new Error("No graphics context");
          renderer.current = new TerrainRenderer(
            gl,
            unpackTerrain(p.default),
            quality,
          );
          renderer.current.setScenery(worldSeed.provinces);
          if (import.meta.env.DEV) {
            (
              globalThis as unknown as { __gcTerrain: TerrainRenderer | null }
            ).__gcTerrain = renderer.current;
            (
              globalThis as unknown as {
                __gcTerrainFocus: ((v: View) => void) | null;
              }
            ).__gcTerrainFocus = move;
          }
          const s = latest.current.snapshot;
          if (s)
            renderer.current.setPalette(
              s.provinces.map(
                (p) => s.nations[p.owner]?.color ?? [170, 160, 130],
              ),
            );
          resize();
          observer = new ResizeObserver(resize);
          observer.observe(canvas.current);
          canvas.current.addEventListener("webglcontextlost", lost);
          document.addEventListener("visibilitychange", wake);
          motion.addEventListener("change", wake);
          setReady(true);
          wake();
        } catch {
          onFallback("3D graphics are unavailable on this device. Using 2D.");
        }
      })
      .catch(() => onFallback("Terrain could not load. Using 2D."));
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", wake);
      motion.removeEventListener("change", wake);
      node?.removeEventListener("webglcontextlost", lost);
      renderer.current?.dispose();
      renderer.current = null;
      if (import.meta.env.DEV) {
        (
          globalThis as unknown as { __gcTerrain: TerrainRenderer | null }
        ).__gcTerrain = null;
        (
          globalThis as unknown as {
            __gcTerrainFocus: ((v: View) => void) | null;
          }
        ).__gcTerrainFocus = null;
      }
    };
  }, [onFallback, camera, quality, move]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ distance: 0, moved: 0, x: 0, y: 0 });
  function selectAt(x: number, y: number) {
    const r = renderer.current,
      c = canvas.current;
    if (!r || !c) return;
    const b = c.getBoundingClientRect(),
      id = r.provinceAtPoint(x - b.left, y - b.top);
    const s = useStore.getState();
    if (id === null) {
      s.selectProvince(null);
      return;
    }
    if (s.selectedArmy !== null) {
      const selected = s.snapshot?.armies.find((a) => a.id === s.selectedArmy);
      const stack =
        s.snapshot?.armies.filter(
          (a) =>
            !a.rebel &&
            a.owner === selected?.owner &&
            a.location === selected?.location,
        ) ?? [];
      for (const a of stack)
        s.sendCommand({ t: "moveArmy", army: a.id, target: id });
      return;
    }
    if (s.selectedFleet !== null) {
      const selected = s.snapshot?.fleets.find((f) => f.id === s.selectedFleet);
      for (const f of s.snapshot?.fleets.filter(
        (f) => f.owner === selected?.owner && f.location === selected?.location,
      ) ?? [])
        s.sendCommand({ t: "moveFleet", fleet: f.id, target: id });
      return;
    }
    s.selectProvince(id);
  }
  const r = renderer.current;
  void revision;
  const owners = snapshot
    ? visibleUnitOwnerIds(
        snapshot.playerNation,
        snapshot.wars,
        snapshot.relations,
      )
    : new Set<number>();
  return (
    <div className="gc-terrain-view" data-testid="terrain-3d">
      <canvas
        ref={canvas}
        aria-label="3D world map. Drag to pan, pinch or use zoom buttons to zoom."
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=")
            move({ ...view.current, zoom: view.current.zoom + 0.3 });
          if (e.key === "-")
            move({ ...view.current, zoom: view.current.zoom - 0.3 });
          const step = 30;
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            move(
              r?.pan(
                e.key === "ArrowLeft"
                  ? step
                  : e.key === "ArrowRight"
                    ? -step
                    : 0,
                e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0,
              ) ?? view.current,
            );
          }
        }}
        onWheel={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (r)
            move(
              r.zoomAt(
                e.clientX - box.left,
                e.clientY - box.top,
                -Math.sign(e.deltaY) * 0.18,
              ),
            );
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          gesture.current = {
            distance: 0,
            moved: 0,
            x: e.clientX,
            y: e.clientY,
          };
        }}
        onPointerMove={(e) => {
          const old = pointers.current.get(e.pointerId);
          if (!old) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const points = [...pointers.current.values()];
          if (points.length === 2) {
            const d = Math.hypot(
              points[0].x - points[1].x,
              points[0].y - points[1].y,
            );
            if (gesture.current.distance > 0 && d > 0 && r) {
              const box = e.currentTarget.getBoundingClientRect();
              move(
                r.zoomAt(
                  (points[0].x + points[1].x) / 2 - box.left,
                  (points[0].y + points[1].y) / 2 - box.top,
                  Math.log2(d / gesture.current.distance),
                ),
              );
            }
            gesture.current.distance = d;
            gesture.current.moved = 100;
          } else {
            const dx = e.clientX - old.x,
              dy = e.clientY - old.y;
            gesture.current.moved += Math.abs(dx) + Math.abs(dy);
            move(r?.pan(dx, dy) ?? view.current);
          }
        }}
        onPointerUp={(e) => {
          if (gesture.current.moved < 6 && pointers.current.size === 1)
            selectAt(e.clientX, e.clientY);
          pointers.current.delete(e.pointerId);
        }}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      />
      {!ready && (
        <p className="gc-terrain-loading" role="status">
          Preparing offline terrain...
        </p>
      )}
      {ready && snapshot && data && r && (
        <div className="gc-terrain-labels">
          {snapshot.nations
            .filter(
              (n) => view.current.zoom < 4.2 && n.gpRank > 0 && n.gpRank <= 8,
            )
            .map((n) => {
              const p = data.provinces[n.capital];
              if (!p) return null;
              const anchor = homelandAnchors[n.tag] ?? [p.lon, p.lat];
              const [x, y] = r.project(anchor[0], anchor[1]);
              if (
                x < 65 ||
                y < 110 ||
                x > (canvas.current?.clientWidth ?? 0) - 65 ||
                y > (canvas.current?.clientHeight ?? 0) - 100
              )
                return null;
              return (
                <button
                  key={n.id}
                  style={{ left: x, top: y }}
                  onClick={() => useStore.getState().focusNationDiplomacy(n.id)}
                >
                  {n.name}
                </button>
              );
            })}
          {cityLabels(
            (lon, lat) => r.project(lon, lat),
            view.current.zoom,
            canvas.current?.clientWidth ?? 0,
            canvas.current?.clientHeight ?? 0,
          ).map(({ city, x, y }) => (
            <button
              key={city.id}
              style={{ left: x, top: y + 8, fontSize: 12 }}
              onClick={() => {
                const id = r.provinceAtPoint(x, y);
                if (id !== null) useStore.getState().selectProvince(id);
              }}
            >
              {city.importance === 0 ? "◆ " : "• "}
              {city.name}
            </button>
          ))}
          {snapshot.armies
            .filter((a) => owners.has(a.owner))
            .map((a) => {
              const p = data.provinces[a.location];
              if (!p) return null;
              const [x, y] = r.project(p.lon, p.lat);
              return (
                <button
                  className="gc-terrain-unit"
                  key={`a${a.id}`}
                  style={{ left: x, top: y }}
                  onClick={() => useStore.getState().setSelectedArmy(a.id)}
                  aria-label={`Select army ${a.id}`}
                >
                  ⚑ {a.regiments.length}
                </button>
              );
            })}
          {snapshot.fleets
            .filter((f) => owners.has(f.owner))
            .map((f) => {
              const p = data.provinces[f.location];
              if (!p) return null;
              const [x, y] = r.project(p.lon, p.lat);
              return (
                <button
                  className="gc-terrain-unit"
                  key={`f${f.id}`}
                  style={{ left: x + 20, top: y + 20 }}
                  onClick={() => useStore.getState().setSelectedFleet(f.id)}
                  aria-label={`Select fleet ${f.id}`}
                >
                  ⚓ {f.ships.length}
                </button>
              );
            })}
        </div>
      )}
      <div className="gc-terrain-zoom">
        <button
          aria-label="Zoom in"
          onClick={() =>
            move({ ...view.current, zoom: view.current.zoom + 0.4 })
          }
        >
          +
        </button>
        <button
          aria-label="Zoom out"
          onClick={() =>
            move({ ...view.current, zoom: view.current.zoom - 0.4 })
          }
        >
          −
        </button>
      </div>
      <small className="gc-terrain-credit" title={TERRAIN_CREDIT}>
        Elevation: Mapzen / NOAA / USGS ·{" "}
        <a
          href={`${import.meta.env.BASE_URL}terrain-attribution.txt`}
          target="_blank"
          rel="noreferrer"
        >
          Credits
        </a>
      </small>
    </div>
  );
}
