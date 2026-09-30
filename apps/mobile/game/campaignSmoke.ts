// Simulator release gate: compare the Hermes worker with the shared engine,
// then exercise real app-private checkpoint storage for both scenarios.
import { NativeSimTransport } from "./NativeSimTransport";
import {
  newSaveId,
  listNativeSaves,
  writeNativeSave,
  readNativeSave,
  deleteNativeSave,
} from "./nativeSaves";
import { saveSummary, type CampaignConfig } from "./campaign";
import { gameDataForScenario } from "../../../src/data/gameData";
import { createWorld } from "../../../src/sim/bootstrap";
import { applyCommand } from "../../../src/sim/commands";
import { snapshot } from "../../../src/sim/world";
import type { Command } from "../../../src/shared/types";

export async function verifyNativeCampaignStorage() {
  const first = new NativeSimTransport();
  const restored = new NativeSimTransport();
  const ids: string[] = [];
  const results = [];
  try {
    for (const scenarioId of ["1830-01-01", "1936-01-01"]) {
      const config: CampaignConfig = {
        id: newSaveId(),
        name: "Native storage smoke",
        seed: 24681,
        mapMode: "historical",
        scenarioId,
        playerNation: 0,
        autosaveMinutes: 5,
      };
      const data = gameDataForScenario(scenarioId);
      const reference = createWorld(data, config.seed, config.mapMode);
      reference.playerNation = config.playerNation;
      reference.nations.forEach((nation) => {
        nation.isPlayer = nation.id === reference.playerNation;
      });
      reference.speed = 0;
      const initial = snapshot(reference, data);
      const tech = initial.playerTech?.statuses.find(
        (t) => t.available && !t.researched,
      )?.key;
      const commands: Command[] = [
        { t: "setTax", bracket: "poor", rate: 0.7 },
        { t: "setTariff", rate: 0.1 },
        {
          t: "setStockpileOrder",
          good: data.goods[0].id,
          mode: "buy",
          dailyAmount: 10,
        },
        ...(tech ? [{ t: "setResearch" as const, tech }] : []),
      ];
      first.send({ t: "command", cmd: { t: "newGame", ...config } });
      for (const cmd of commands) {
        applyCommand(reference, data, cmd, () => {});
        first.send({ t: "command", cmd });
      }
      const exported = await first.exportSave();
      if (
        JSON.stringify(exported.snapshot) !==
        JSON.stringify(snapshot(reference, data))
      )
        throw new Error(
          `${scenarioId}: native worker differs from the shared web engine.`,
        );
      const id = newSaveId(),
        secondId = newSaveId();
      ids.push(id, secondId);
      writeNativeSave(
        saveSummary(
          config,
          exported.snapshot,
          "manual",
          "First checkpoint",
          id,
        ),
        exported.payload,
      );
      writeNativeSave(
        saveSummary(
          config,
          exported.snapshot,
          "manual",
          "Second checkpoint",
          secondId,
        ),
        exported.payload,
      );
      if (
        !listNativeSaves().some(
          (s) => s.id === id && s.config.scenarioId === scenarioId,
        )
      )
        throw new Error(`${scenarioId}: checkpoint missing from save library.`);
      await restored.importSave(await readNativeSave(id));
      const loaded = await restored.exportSave();
      if (JSON.stringify(loaded.snapshot) !== JSON.stringify(exported.snapshot))
        throw new Error(
          `${scenarioId}: native save roundtrip lost campaign state.`,
        );
      deleteNativeSave(id);
      const saves = listNativeSaves();
      if (
        saves.some((s) => s.id === id) ||
        !saves.some((s) => s.id === secondId)
      )
        throw new Error("Native deletion affected the wrong checkpoint.");
      results.push({
        scenarioId,
        bytes: exported.payload.length,
        commands: commands.map((cmd) => cmd.t),
        equalSnapshot: true,
        roundtrip: true,
      });
    }
    return {
      ok: true,
      bytes: results[0].bytes,
      seed: 24681,
      restoredTax: 0.7,
      separateSaves: true,
      scenarioParity: results,
    };
  } finally {
    first.dispose();
    restored.dispose();
    ids.forEach(deleteNativeSave);
  }
}
