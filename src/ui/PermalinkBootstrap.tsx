import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { parseStartHash } from './permalink';

/**
 * If the URL hash encodes a start (`#/new?seed=&nation=`), begin that campaign
 * as soon as the sim is ready — skip the main menu.
 */
export function PermalinkBootstrap() {
  const snapshot = useStore((state) => state.snapshot);
  const sendCommand = useStore((state) => state.sendCommand);
  const setShowMainMenu = useStore((state) => state.setShowMainMenu);
  const applied = useRef(false);
  const start = useMemo(() => parseStartHash(), []);

  useEffect(() => {
    if (start) setShowMainMenu(false);
  }, [start, setShowMainMenu]);

  useEffect(() => {
    if (applied.current || !snapshot || !start) return;
    const nation = snapshot.nations.find((entry) => entry.tag === start.nationTag);
    if (!nation) {
      applied.current = true;
      setShowMainMenu(true);
      return;
    }
    applied.current = true;
    sendCommand({ t: 'newGame', seed: start.seed, playerNation: nation.id });
    setShowMainMenu(false);
  }, [snapshot, sendCommand, setShowMainMenu, start]);

  return null;
}
