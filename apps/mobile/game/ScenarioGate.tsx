import { useEffect, useState, type ReactNode } from "react";
import { preloadScenarios } from "../../../src/data/generated";

/** Renders its children once every era seed is loaded. */
export function ScenarioGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void preloadScenarios().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return ready ? <>{children}</> : null;
}
