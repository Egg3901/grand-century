// Included only by the simulator CI entry point. Never selected in release builds.
import { useEffect, useRef, useState } from "react";
import { PixelRatio, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import TerrainMap from "./TerrainMap";
import type { TerrainRenderer } from "../../../src/graphics/TerrainRenderer";
import { NationFlag } from "./NationFlag";
import { verifyTerrainFrame } from "./terrainFrame";
import {
  elevation,
  mercator,
  type View as CameraView,
} from "../../../src/graphics/terrainData";

function visibleSceneryPixels(
  gl: ExpoWebGLRenderingContext,
  renderer: TerrainRenderer,
) {
  const width = Math.floor(gl.drawingBufferWidth / 2);
  const height = Math.floor(gl.drawingBufferHeight / 2);
  const x = Math.floor(width / 2),
    y = Math.floor(height / 2);
  const read = () => {
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  renderer.render(0, false, null, false);
  const terrain = read();
  renderer.render(0, false, null);
  const count = (pixels: Uint8Array) => {
    let changed = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        Math.abs(pixels[i] - terrain[i]) +
          Math.abs(pixels[i + 1] - terrain[i + 1]) +
          Math.abs(pixels[i + 2] - terrain[i + 2]) >
        24
      )
        changed++;
    return changed;
  };
  const visible = count(read());
  if (visible < 100) {
    // On failure distinguish hidden geometry from a missing native draw.
    const draw = gl.drawArrays;
    let withoutDepth = 0;
    try {
      gl.drawArrays = (...args) => {
        gl.disable(gl.DEPTH_TEST);
        draw.apply(gl, args);
        gl.enable(gl.DEPTH_TEST);
      };
      renderer.render(0, false, null);
      withoutDepth = count(read());
    } finally {
      gl.drawArrays = draw;
      renderer.render(0, false, null);
    }
    throw new Error(
      `Invisible city geometry: ${visible} changed pixels, ${withoutDepth} without depth, CPU elevation ${elevation(renderer.data, ...mercator(-0.118668, 51.501941))}`,
    );
  }
  return visible;
}

function verifyAtmosphere(
  gl: ExpoWebGLRenderingContext,
  renderer: TerrainRenderer,
  checkpoint: (stage: string) => void,
) {
  const width = Math.floor(gl.drawingBufferWidth / 2),
    height = Math.floor(gl.drawingBufferHeight / 2);
  const read = () => {
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  renderer.setAtmosphere({ lighting: "day", weather: "clear", dayOfYear: 180 });
  renderer.render(0, false, null);
  checkpoint("atmosphere-day-read");
  const day = read();
  checkpoint("atmosphere-day-done");
  const changed = (pixels: Uint8Array) => {
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        Math.abs(day[i] - pixels[i]) +
          Math.abs(day[i + 1] - pixels[i + 1]) +
          Math.abs(day[i + 2] - pixels[i + 2]) >
        12
      )
        count++;
    return count;
  };
  renderer.setAtmosphere({
    lighting: "night",
    weather: "clear",
    dayOfYear: 180,
  });
  renderer.render(0, false, null);
  checkpoint("atmosphere-night-read");
  const nightPixels = changed(read());
  checkpoint("atmosphere-night-done");
  renderer.setAtmosphere({ lighting: "day", weather: "rain", dayOfYear: 180 });
  renderer.render(0, false, null);
  checkpoint("atmosphere-rain-read");
  const rainPixels = changed(read());
  checkpoint("atmosphere-rain-done");
  renderer.setAtmosphere({ lighting: "day", weather: "snow", dayOfYear: 1 });
  renderer.render(0, false, null);
  checkpoint("atmosphere-snow-read");
  const snowPixels = changed(read());
  checkpoint("atmosphere-snow-done");
  renderer.setAtmosphere({ lighting: "day", weather: "clear", dayOfYear: 180 });
  renderer.render(0, false, null);
  if (
    nightPixels < width * height * 0.25 ||
    rainPixels < 100 ||
    snowPixels < 100
  )
    throw new Error(
      `Atmosphere did not render: ${nightPixels}/${rainPixels}/${snowPixels}`,
    );
  if (gl.getError() !== gl.NO_ERROR) throw new Error("Atmosphere GL error");
  return { nightPixels, rainPixels, snowPixels };
}

import { verifyNativeCampaignStorage } from "./campaignSmoke";

const report = new File(Paths.document, "graphics-smoke.json");
export default function GraphicsSmoke() {
  const storage = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    storage.current = verifyNativeCampaignStorage();
    void storage.current.catch((error) => fail(String(error)));
  }, []);
  const [phase, setPhase] = useState(0),
    [failed, setFailed] = useState("");
  const camera = useRef<CameraView | null>({
      lon: -0.118668,
      lat: 51.501941,
      zoom: 8,
    }),
    done = useRef(-1);
  const results = useRef<object[]>([]);
  const highHeight = useRef(0);
  const lastCheckpoint = useRef(0);
  function checkpoint(stage: string, renderer?: TerrainRenderer) {
    new File(Paths.document, "graphics-smoke-progress.json").write(
      JSON.stringify({
        phase,
        stage,
        time: Date.now(),
        results: results.current,
        terrainDetail: renderer?.elevationDetail,
        preparing: renderer?.isPreparingScenery,
        needsFrame: renderer?.needsFrame,
      }),
    );
  }
  function fail(reason: string) {
    setFailed(reason);
    report.write(
      JSON.stringify({ ok: false, reason, results: results.current }),
    );
  }
  function frame(gl: ExpoWebGLRenderingContext, renderer: TerrainRenderer) {
    if (Date.now() - lastCheckpoint.current > 1000 && done.current !== phase) {
      lastCheckpoint.current = Date.now();
      checkpoint("waiting-for-detail", renderer);
    }
    if (
      done.current === phase ||
      renderer.needsFrame ||
      renderer.isPreparingScenery ||
      renderer.elevationDetail.loading ||
      renderer.elevationDetail.loadedTiles === 0
    )
      return;
    // A layout event reaches JS after the parent changes height. Ignore frames
    // from the previous surface while waiting for the resized context.
    if (phase === 2 && gl.drawingBufferHeight >= highHeight.current - 100)
      return;
    done.current = phase;
    try {
      checkpoint("frame-read", renderer);
      const result = verifyTerrainFrame(gl);
      checkpoint("frame-verified", renderer);
      if (phase > 0 && renderer.sceneryVertexCount === 0)
        throw new Error("High scenery did not finish loading");
      if (renderer.detailResolution !== 1024)
        throw new Error("Close-zoom province detail did not finish loading");
      const terrainDetail = renderer.elevationDetail;
      if (
        terrainDetail.spacingMeters === null ||
        terrainDetail.spacingMeters > 1000
      )
        throw new Error("Detailed elevation was not loaded");
      const atmospherePixels =
        phase === 1 ? verifyAtmosphere(gl, renderer, checkpoint) : null;
      checkpoint("scenery-read", renderer);
      const sceneryPixels = phase > 0 ? visibleSceneryPixels(gl, renderer) : 0;
      checkpoint("scenery-verified", renderer);
      let cameraUpdateMaxMs = 0;
      if (phase === 1) {
        const width = gl.drawingBufferWidth / 2,
          height = gl.drawingBufferHeight / 2;
        for (let i = 0; i < 60; i++) {
          const before = performance.now();
          renderer.setView(
            { lon: 8 + i * 0.008, lat: 46, zoom: 4 + i * 0.016 },
            width,
            height,
          );
          cameraUpdateMaxMs = Math.max(
            cameraUpdateMaxMs,
            performance.now() - before,
          );
        }
        renderer.setView(
          camera.current ?? { lon: 8, lat: 46, zoom: 4.1 },
          width,
          height,
        );
        if (cameraUpdateMaxMs > 16.7)
          throw new Error(
            `Camera update exceeded frame budget: ${cameraUpdateMaxMs}ms`,
          );
      }
      if (phase === 1) highHeight.current = result.height;
      results.current.push({
        phase,
        quality: phase === 0 ? "balanced" : "high",
        ratio: PixelRatio.get(),
        cameraUpdateMaxMs,
        sceneryVertices: renderer.sceneryVertexCount,
        provinceDetailSize: renderer.detailResolution,
        sceneryPixels,
        terrainDetail,
        atmospherePixels,
        ...result,
      });
      new File(Paths.document, "graphics-smoke-progress.json").write(
        JSON.stringify({ phase, results: results.current }),
      );
      if (phase < 2) setTimeout(() => setPhase((p) => p + 1), 1500);
      else
        setTimeout(() => {
          void storage.current
            ?.then((campaignStorage) =>
              report.write(
                JSON.stringify({
                  ok: true,
                  campaignStorage,
                  results: results.current,
                }),
              ),
            )
            .catch((error) => fail(String(error)));
        }, 500);
    } catch (error) {
      fail(String(error));
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#091a26" }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: phase === 2 ? 120 : 0,
        }}
      >
        <TerrainMap
          quality={phase === 0 ? "balanced" : "high"}
          camera={camera}
          focus={{ center: [-0.118668, 51.501941], zoom: 8.7 }}
          snapshot={null}
          political={false}
          selected={null}
          onSelect={() => {}}
          onFallback={fail}
          onFrame={frame}
        />
      </View>
      <View
        style={{
          position: "absolute",
          top: 65,
          left: 20,
          padding: 12,
          backgroundColor: "#18272d",
          gap: 8,
        }}
      >
        <NationFlag tag="ALG" name="Algeria" color={[90, 120, 70]} />
        <Text style={{ color: "#fff" }}>
          Native graphics check {phase + 1}/3{failed ? `: ${failed}` : ""}
        </Text>
      </View>
    </View>
  );
}
