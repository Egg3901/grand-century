import React from "react";
import { View, Text } from "./platform";
import type { FromWorker, ToWorker, World } from "../../src/shared/types";
import { GAME_DATA } from "../../src/data/gameData";
import { createWorld } from "../../src/sim/bootstrap";
import { snapshot } from "../../src/sim/world";
import { applyCommand } from "../../src/sim/commands";
export class NativeSimTransport {
  private world: World | null = null;
  private handler: ((m: FromWorker) => void) | null = null;
  onMessage(fn: (m: FromWorker) => void) {
    this.handler = fn;
  }
  send(m: ToWorker) {
    if (m.t === "init") return;
    if (m.t !== "command") return;
    if (m.cmd.t === "newGame") {
      this.world = createWorld(GAME_DATA, m.cmd.seed);
      this.world.playerNation = m.cmd.playerNation;
      this.world.nations.forEach(
        (n) => (n.isPlayer = n.id === m.cmd.playerNation),
      );
    } else if (this.world)
      applyCommand(this.world, GAME_DATA, m.cmd, (m) => this.handler?.(m));
    (window as any).nativeCommand = m.cmd;
    if (this.world)
      this.handler?.({
        t: "snapshot",
        snapshot: snapshot(this.world, GAME_DATA),
      });
  }
  dispose() {}
}
export class File {
  exists = false;
  constructor(..._: any[]) {}
  textSync() {
    return "";
  }
  write(_: string) {}
}
export const Paths = { document: "test" };
export const StatusBar = () => null;
export default function Ionicons({ name }: any) {
  return (
    <Text>
      {name === "menu" ? "☰" : name === "settings-outline" ? "⚙" : "◇"}
    </Text>
  );
}
export const Map = ({ children, style }: any) => (
  <View style={{ ...style, backgroundColor: "#406776" }}>{children}</View>
);
export const Camera = () => null,
  GeoJSONSource = () => null,
  ImageSource = () => null,
  Images = () => null,
  Layer = () => null;
export const SafeAreaProvider = ({ children }: any) => <>{children}</>;
export const SafeAreaView = ({ children, style }: any) => (
  <View style={[style, { paddingTop: 59, paddingBottom: 34 }]}>{children}</View>
);

export const modelId = null,
  modelName = null,
  totalMemory = null,
  isDevice = false;
