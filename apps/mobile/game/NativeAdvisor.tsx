import { useEffect, useRef, useState } from "react";
import { File, Paths } from "expo-file-system";
import { deriveAlerts, type UiAlert } from "../../../src/ui/alerts";
import { gameDataForScenario } from "../../../src/data/gameData";
import type { WorldSnapshot } from "../../../src/shared/types";
import type { GamePanel } from "./GameMenus";
import { Button, Card, Copy, Heading } from "./PanelControls";
export function useNativeAlerts(snapshot: WorldSnapshot) {
  const previous = useRef<WorldSnapshot | null>(null);
  const [alerts, setAlerts] = useState<UiAlert[]>([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = snapshot;
    const goods = new Map(
      gameDataForScenario(snapshot.scenarioId).goods.map((g) => [g.id, g.name]),
    );
    setAlerts((current) => deriveAlerts(before, snapshot, current, goods));
  }, [snapshot]);
  return {
    alerts,
    dismiss: (id: string) =>
      setAlerts((current) => current.filter((a) => a.id !== id)),
  };
}
const alertPages: Record<string, GamePanel> = {
  budget: "economy",
  technology: "research",
  save_load: "menu",
};
export function NativeAlerts({
  alerts,
  onPage,
  dismiss,
}: {
  alerts: readonly UiAlert[];
  onPage: (page: GamePanel) => void;
  dismiss: (id: string) => void;
}) {
  return (
    <>
      {!alerts.length && (
        <Copy>
          No new reports. Alerts appear here when events change your nation.
        </Copy>
      )}
      {alerts
        .slice()
        .reverse()
        .map((a) => (
          <Card key={a.id}>
            <Copy>
              Day {a.day} · {a.kind}
            </Copy>
            <Copy>{a.message}</Copy>
            <Copy>{a.suggestion}</Copy>
            {a.panel && (
              <Button
                label={`Review report: ${a.message}`}
                onPress={() =>
                  onPage(alertPages[a.panel!] ?? (a.panel as GamePanel))
                }
              />
            )}
            <Button
              label={`Dismiss report: ${a.message}`}
              onPress={() => dismiss(a.id)}
            />
          </Card>
        ))}
    </>
  );
}
const tutorialFile = new File(
  Paths.document,
  "grand-century-native-tutorial.json",
);
const lessons: { title: string; text: string; page: GamePanel | null }[] = [
  {
    title: "Your nation and the map",
    text: "Pan and pinch to orient yourself. Tap a province to inspect ownership and population, then open its ledger for resources, defenses and culture.",
    page: "province",
  },
  {
    title: "Read the map modes",
    text: "Use the scrollable map bar to compare economy, hunger, unrest, military control, diplomacy, cores and culture. Every mode has an explanation in Map and graphics.",
    page: "graphics",
  },
  {
    title: "Adjust your budget",
    text: "Raise or lower a tax bracket. Tap Show calculation to trace income, expenditure and weekly balance. High taxes reduce the goods your people can buy.",
    page: "economy",
  },
  {
    title: "Build industry",
    text: "Select one of your states in Industry, then build an affordable factory. Check technology, coastal requirements and input/output goods before investing.",
    page: "production",
  },
  {
    title: "Enact a reform",
    text: "Open Politics and reforms. Read the upper-house support, money and prestige costs, then enact an available option. Blocked reforms explain what is missing.",
    page: "politics",
  },
  {
    title: "Diplomacy and military",
    text: "Select a foreign nation to form relations or fabricate a pretext. War needs a goal. Direct formations and fleets in Military, then settle wars in a peace conference.",
    page: "diplomacy",
  },
  {
    title: "Time and checkpoints",
    text: "Return to the map to pause or set any of the five speeds. Make a named checkpoint before a major decision. Offline campaigns autosave and pause when the app backgrounds.",
    page: "menu",
  },
];
export function NativeTutorial({
  onPage,
}: {
  onPage: (page: GamePanel) => void;
}) {
  const [step, setStep] = useState(() => {
    try {
      return Math.max(
        0,
        Math.min(
          lessons.length,
          Number(tutorialFile.exists ? tutorialFile.textSync() : 0) || 0,
        ),
      );
    } catch {
      return 0;
    }
  });
  const go = (next: number) => {
    setStep(next);
    try {
      tutorialFile.write(String(next));
    } catch {}
  };
  const lesson = lessons[step];
  return (
    <>
      {lesson ? (
        <>
          <Copy>
            Lesson {step + 1} of {lessons.length}
          </Copy>
          <Heading>{lesson.title}</Heading>
          <Copy>{lesson.text}</Copy>
          {lesson.page && (
            <Button
              label={`Practice: ${lesson.title}`}
              onPress={() => onPage(lesson.page!)}
            />
          )}
          <Button
            label={
              step === lessons.length - 1 ? "Finish tutorial" : "Next lesson"
            }
            onPress={() => go(step + 1)}
          />
          {step > 0 && (
            <Button label="Previous lesson" onPress={() => go(step - 1)} />
          )}
        </>
      ) : (
        <Copy>
          Tutorial complete. Replay whenever you want to review the controls.
        </Copy>
      )}
      <Button label="Replay tutorial" onPress={() => go(0)} />
    </>
  );
}
