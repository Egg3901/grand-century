/**
 * The full in-game HUD layer. Split into its own lazily-loaded chunk so the
 * main-menu / first paint isn't blocked by the HUD + all 15 panels (PanelHost).
 * Rendered inside App's hud-layer wrapper; behaviour is identical to when these
 * were mounted directly — only the code now loads asynchronously.
 */
import { AudioManager } from './AudioManager';
import { Hud } from './Hud';
import { PresenceHud } from './PresenceHud';
import { ChatHud } from './ChatHud';
import { Outliner } from './Outliner';
import { MapLegend } from './MapLegend';
import { EventFeed } from './EventFeed';
import { EventPopup } from './EventPopup';
import { PanelHost } from './panels/PanelHost';
import { TutorialCoach } from './TutorialCoach';
import { CampaignRecap } from './CampaignRecap';

export function GameHud() {
  return (
    <>
      <AudioManager />
      <Hud />
      <PresenceHud />
      <ChatHud />
      <Outliner />
      <MapLegend />
      <EventFeed />
      <EventPopup />
      <PanelHost />
      <TutorialCoach />
      <CampaignRecap />
    </>
  );
}

export default GameHud;
