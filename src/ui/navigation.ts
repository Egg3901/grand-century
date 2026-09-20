import type { PanelId } from '../store';

export type PanelGroupId = 'direction' | 'nation' | 'economy' | 'world' | 'forces' | 'records';

export interface PanelNavigationItem {
  id: Exclude<PanelId, null | 'province'>;
  label: string;
}

export interface PanelNavigationGroup {
  id: PanelGroupId;
  label: string;
  shortLabel: string;
  panels: PanelNavigationItem[];
}

export const PANEL_GROUPS: PanelNavigationGroup[] = [
  {
    id: 'direction',
    label: 'Direction',
    shortLabel: 'Briefing',
    panels: [
      { id: 'cabinet', label: 'Cabinet' },
      { id: 'decisions', label: 'Decisions' },
      { id: 'formables', label: 'National Claims' },
    ],
  },
  {
    id: 'nation',
    label: 'Home Affairs',
    shortLabel: 'Nation',
    panels: [
      { id: 'population', label: 'Population' },
      { id: 'cultures', label: 'Cultures' },
      { id: 'politics', label: 'Politics' },
    ],
  },
  {
    id: 'economy',
    label: 'Treasury & Trade',
    shortLabel: 'Economy',
    panels: [
      { id: 'budget', label: 'Budget' },
      { id: 'production', label: 'Production' },
      { id: 'market', label: 'World Market' },
    ],
  },
  {
    id: 'world',
    label: 'Foreign Office',
    shortLabel: 'World',
    panels: [
      { id: 'diplomacy', label: 'Diplomacy' },
      { id: 'great_powers', label: 'Great Powers' },
      { id: 'colonization', label: 'Colonies' },
    ],
  },
  {
    id: 'forces',
    label: 'War Office',
    shortLabel: 'Forces',
    panels: [
      { id: 'military', label: 'Military' },
      { id: 'technology', label: 'Technology' },
    ],
  },
  {
    id: 'records',
    label: 'Records',
    shortLabel: 'Records',
    panels: [{ id: 'save_load', label: 'Save / Load' }],
  },
];

export function panelGroupFor(panel: PanelId): PanelNavigationGroup | null {
  if (!panel || panel === 'province') return null;
  return PANEL_GROUPS.find((group) => group.panels.some((entry) => entry.id === panel)) ?? null;
}
