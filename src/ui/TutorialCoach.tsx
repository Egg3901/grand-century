import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import './TutorialCoach.css';

const STORAGE_KEY = 'grand-century.tutorial.v0_2_0.seen';

type TutorialStep = {
  title: string;
  body: string;
  hint: string;
  complete: boolean;
  selectors: string[];
};

function readSeenFlag(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSeenFlag(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Ignore storage failures in private/incognito contexts.
  }
}

function elementVisible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const opacity = Number.parseFloat(style.opacity || '1');
  if (!Number.isFinite(opacity) || opacity < 0.05) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 2 && rect.height > 2;
}

function findVisibleTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    const visible = nodes.find((node) => elementVisible(node));
    if (visible) return visible;
  }
  return null;
}

export function TutorialCoach() {
  const snapshot = useStore((state) => state.snapshot);
  const openPanel = useStore((state) => state.openPanel);
  const mapMode = useStore((state) => state.mapMode);
  const nationDetail = useStore((state) => state.nationDetail);
  const requestNation = useStore((state) => state.requestNation);
  const showMainMenu = useStore((state) => state.showMainMenu);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [queuedReplay, setQueuedReplay] = useState(false);

  const bootstrappedSeenRef = useRef(false);
  const seenRef = useRef(false);
  const baselineTaxPoorRef = useRef(0);
  const baselineFactoryCountRef = useRef(0);
  const baselineSpeedRef = useRef(0);
  const baselineReformsRef = useRef<string | null>(null);

  const playerNation = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.nations.find((nation) => nation.id === snapshot.playerNation) ?? null;
  }, [snapshot]);
  const totalFactoryCount = useMemo(() => (
    snapshot?.playerStates.reduce((sum, entry) => sum + entry.factoryCount, 0) ?? 0
  ), [snapshot]);
  const reformSignature = useMemo(() => {
    if (!snapshot || !nationDetail || nationDetail.id !== snapshot.playerNation) return null;
    return JSON.stringify(Object.entries(nationDetail.reforms).sort(([a], [b]) => a.localeCompare(b)));
  }, [nationDetail, snapshot]);

  const speedChanged = snapshot ? snapshot.speed !== baselineSpeedRef.current : false;
  const taxAdjusted = playerNation ? Math.abs(playerNation.taxRatePoor - baselineTaxPoorRef.current) >= 0.01 : false;
  const factoryBuilt = totalFactoryCount > baselineFactoryCountRef.current;
  const reformChanged = Boolean(
    baselineReformsRef.current
    && reformSignature
    && reformSignature !== baselineReformsRef.current,
  );

  const tutorialSteps = useMemo<TutorialStep[]>(() => [
    {
      title: 'Your nation and the map',
      body: `You lead ${playerNation?.name ?? 'your nation'}. The map is your command table: click provinces to inspect and direct operations.`,
      hint: 'Pan and zoom to orient yourself.',
      complete: true,
      selectors: ['[data-coach-id="hud-nation"]', '[data-coach-id="world-map"]', '.hud-mobile-top__nation'],
    },
    {
      title: 'Mapmodes explain the world',
      body: 'Swap mapmodes to read economy, unrest, diplomacy, and military posture instantly.',
      hint: 'Try one mode now to compare colors.',
      complete: mapMode !== 'political',
      selectors: ['[data-coach-id="mapmodes-desktop"]', '[data-coach-id="mapmodes-mobile-drawer"]', '[data-coach-id="mapmodes-mobile-toggle"]'],
    },
    {
      title: 'Budget: adjust a tax slider',
      body: 'Open Budget and move a tax slider. Budget traces break every line into concrete inputs.',
      hint: 'Tap the Budget panel, then move Poor Tax.',
      complete: openPanel === 'budget' && taxAdjusted,
      selectors: openPanel === 'budget'
        ? ['[data-coach-id="budget-tax-slider"]']
        : ['[data-coach-id="panel-budget"]', '[data-testid="panel-budget"]', '[data-coach-id="panels-mobile-toggle"]'],
    },
    {
      title: 'Production: build a factory',
      body: 'Open Production and queue one factory to start industrial growth in a state.',
      hint: 'Use the first Build button in the list.',
      complete: openPanel === 'production' && factoryBuilt,
      selectors: openPanel === 'production'
        ? ['[data-coach-id="build-factory-primary"]']
        : ['[data-coach-id="panel-production"]', '[data-testid="panel-production"]', '[data-coach-id="panels-mobile-toggle"]'],
    },
    {
      title: 'Politics: enact a reform',
      body: 'Open Politics and enact one available reform. Reforms shape unrest, economy, and military readiness.',
      hint: 'Look for an enabled Enact button.',
      complete: openPanel === 'politics' && reformChanged,
      selectors: openPanel === 'politics'
        ? ['[data-coach-id="reform-action"]']
        : ['[data-coach-id="panel-politics"]', '[data-testid="panel-politics"]', '[data-coach-id="panels-mobile-toggle"]'],
    },
    {
      title: 'Diplomacy and military flow',
      body: 'Wars usually start from Diplomacy with a selected goal, then shift to Military for warscore and peace enforcement.',
      hint: 'Open Diplomacy (declare war) or Military (war overview).',
      complete: openPanel === 'diplomacy' || openPanel === 'military',
      selectors: openPanel === 'diplomacy'
        ? ['[data-testid="diplo-declare-war"]']
        : openPanel === 'military'
          ? ['[data-coach-id="war-overview"]']
          : ['[data-coach-id="panel-diplomacy"]', '[data-coach-id="panel-military"]', '[data-coach-id="panels-mobile-toggle"]'],
    },
    {
      title: 'Speed controls and saves',
      body: 'Set sim speed to control pacing, then open Save / Load so progress is safe before major decisions.',
      hint: 'Change speed once, then open Save / Load.',
      complete: speedChanged && openPanel === 'save_load',
      selectors: openPanel === 'save_load'
        ? ['[data-coach-id="save-panel"]']
        : speedChanged
          ? ['[data-coach-id="panel-save-load"]', '[data-testid="panel-save_load"]', '[data-coach-id="panels-mobile-toggle"]']
          : ['[data-coach-id="speed-controls-desktop"]', '[data-coach-id="speed-controls-mobile"]'],
    },
  ], [factoryBuilt, mapMode, openPanel, playerNation?.name, reformChanged, speedChanged, taxAdjusted]);

  const currentStep = tutorialSteps[Math.max(0, Math.min(stepIndex, tutorialSteps.length - 1))];

  const beginTutorial = () => {
    if (!snapshot) return;
    baselineTaxPoorRef.current = playerNation?.taxRatePoor ?? 0;
    baselineFactoryCountRef.current = totalFactoryCount;
    baselineSpeedRef.current = snapshot.speed;
    baselineReformsRef.current = reformSignature;
    setStepIndex(0);
    setActive(true);
  };

  const finishTutorial = () => {
    writeSeenFlag();
    seenRef.current = true;
    setActive(false);
  };

  useEffect(() => {
    if (bootstrappedSeenRef.current) return;
    seenRef.current = readSeenFlag();
    bootstrappedSeenRef.current = true;
  }, []);

  useEffect(() => {
    const replay = () => setQueuedReplay(true);
    window.addEventListener('gc:replay-tutorial', replay);
    return () => window.removeEventListener('gc:replay-tutorial', replay);
  }, []);

  useEffect(() => {
    if (!snapshot || showMainMenu) return;
    if (queuedReplay) {
      beginTutorial();
      setQueuedReplay(false);
      return;
    }
    if (!active && !seenRef.current) beginTutorial();
  }, [active, playerNation?.taxRatePoor, queuedReplay, reformSignature, showMainMenu, snapshot, totalFactoryCount]);

  useEffect(() => {
    if (!active || !snapshot) return;
    requestNation(snapshot.playerNation);
  }, [active, requestNation, snapshot?.day, snapshot?.playerNation]);

  useEffect(() => {
    if (!active || baselineReformsRef.current || !reformSignature) return;
    baselineReformsRef.current = reformSignature;
  }, [active, reformSignature]);

  useEffect(() => {
    if (!active || !currentStep) return;
    const updateTarget = () => {
      const node = findVisibleTarget(currentStep.selectors);
      setTargetRect(node ? node.getBoundingClientRect() : null);
    };
    updateTarget();
    const timer = window.setInterval(updateTarget, 130);
    window.addEventListener('resize', updateTarget);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', updateTarget);
    };
  }, [active, currentStep, openPanel]);

  if (!active || !snapshot) return null;

  const progress = `${stepIndex + 1}/${tutorialSteps.length}`;
  const isLastStep = stepIndex >= tutorialSteps.length - 1;

  return (
    <div className="tutorial-coach">
      {targetRect ? (
        <div
          className="tutorial-coach__spotlight"
          style={{
            left: `${Math.max(6, targetRect.left - 8)}px`,
            top: `${Math.max(6, targetRect.top - 8)}px`,
            width: `${Math.max(48, targetRect.width + 16)}px`,
            height: `${Math.max(44, targetRect.height + 16)}px`,
          }}
        />
      ) : null}
      <aside className="tutorial-coach__card atlas-panel" role="dialog" aria-live="polite" aria-label="First session coach">
        <div className="tutorial-coach__progress">
          <strong>{currentStep.title}</strong>
          <span>{progress}</span>
        </div>
        <p>{currentStep.body}</p>
        <p className="tutorial-coach__hint">
          {currentStep.hint}
          {currentStep.complete ? ' Completed.' : ''}
        </p>
        <div className="tutorial-coach__actions">
          <button type="button" onClick={finishTutorial}>Skip</button>
          <button
            type="button"
            onClick={() => {
              if (isLastStep) finishTutorial();
              else setStepIndex((value) => Math.min(tutorialSteps.length - 1, value + 1));
            }}
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </aside>
    </div>
  );
}
