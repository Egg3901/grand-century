// Included only by the simulator CI entry point. Never selected in release builds.
import { useRef, useState } from "react";
import { PixelRatio, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import TerrainMap from "./TerrainMap";
import { NationFlag } from "./NationFlag";
import { verifyTerrainFrame } from "./terrainFrame";
import type { View as CameraView } from "../../../src/graphics/terrainData";

const report = new File(Paths.document, "graphics-smoke.json");
export default function GraphicsSmoke() {
  const [phase, setPhase] = useState(0),
    [failed, setFailed] = useState("");
  const camera = useRef<CameraView | null>(null),
    done = useRef(-1);
  const results = useRef<object[]>([]);
  function fail(reason: string) {
    setFailed(reason);
    report.write(
      JSON.stringify({ ok: false, reason, results: results.current }),
    );
  }
  function frame(gl: ExpoWebGLRenderingContext) {
    if (done.current === phase) return;
    done.current = phase;
    try {
      const result = verifyTerrainFrame(gl);
      results.current.push({
        phase,
        quality: phase === 0 ? "balanced" : "high",
        ratio: PixelRatio.get(),
        ...result,
      });
      if (phase < 2) setTimeout(() => setPhase((p) => p + 1), 1500);
      else report.write(JSON.stringify({ ok: true, results: results.current }));
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
          focus={{ center: [8, 46], zoom: 4.8 }}
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
