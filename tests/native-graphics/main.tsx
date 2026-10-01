import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../apps/mobile/App";
import { UnitCounterHarness } from "./unit-counter-harness";
import TerrainMap from "../../apps/mobile/game/TerrainMap";
import { hydrateFiles } from "./native-services";
await hydrateFiles();
createRoot(document.getElementById("root")!).render(
  location.search.includes("units") ? (
    <UnitCounterHarness />
  ) : location.search.includes("menus") ? (
    <App />
  ) : (
    <TerrainMap
      quality="high"
      camera={{ current: null }}
      focus={{ center: [8, 46], zoom: 4.7 }}
      snapshot={null}
      political={false}
      selected={null}
      onSelect={() => {}}
      onFallback={(reason) => {
        (window as any).nativeFailure = reason;
        console.log(reason);
      }}
    />
  ),
);
