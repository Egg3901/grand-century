import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { useSnapshotFields } from './useSnapshotFields';
import { parseStartHash } from './permalink';
import { DEFAULT_CAMPAIGN_MAP_MODE, parseCampaignMapMode } from '../shared/campaignMap';
import { DEFAULT_SCENARIO_ID, listScenarios } from '../data/generated';

/**
 * If the URL hash encodes a start (`#/new?seed=&nation=`), begin that campaign
 * as soon as the sim is ready — skip the main menu.
 */
export function PermalinkBootstrap() {
  const snapshot = useSnapshotFields(['scenarioId', 'mapMode', 'seed', 'playerNation', 'nations'] as const);
  const sendCommand = useStore((state) => state.sendCommand);
  const setShowMainMenu = useStore((state) => state.setShowMainMenu);
  const applied = useRef(false);
  const pendingRegen = useRef(false);
  const start = useMemo(() => parseStartHash(), []);

  useEffect(() => {
    if (start) setShowMainMenu(false);
  }, [start, setShowMainMenu]);

  useEffect(() => {
    if (applied.current || !snapshot || !start) return;
    const mapMode = parseCampaignMapMode(start.mode ?? DEFAULT_CAMPAIGN_MAP_MODE);
    const scenarioId = listScenarios().some((scenario) => scenario.id === start.scenarioId && scenario.status === 'playable')
      ? start.scenarioId as string
      : DEFAULT_SCENARIO_ID;
    const mapMismatch = (snapshot.mapMode ?? DEFAULT_CAMPAIGN_MAP_MODE) !== mapMode
      || (snapshot.seed ?? 0) !== start.seed
      || (snapshot.scenarioId ?? DEFAULT_SCENARIO_ID) !== scenarioId;

    if (mapMismatch && !pendingRegen.current) {
      pendingRegen.current = true;
      sendCommand({ t: 'newGame', seed: start.seed, playerNation: snapshot.playerNation, mapMode, scenarioId });
      return;
    }

    if (mapMismatch) return;

    pendingRegen.current = false;
    const nation = snapshot.nations.find((entry) => entry.tag === start.nationTag);
    if (!nation) {
      applied.current = true;
      setShowMainMenu(true);
      return;
    }
    applied.current = true;
    sendCommand({ t: 'newGame', seed: start.seed, playerNation: nation.id, mapMode, scenarioId });
    setShowMainMenu(false);
  }, [snapshot?.scenarioId, snapshot?.mapMode, snapshot?.seed, snapshot?.playerNation, snapshot?.nations, sendCommand, setShowMainMenu, start]);

  return null;
}
