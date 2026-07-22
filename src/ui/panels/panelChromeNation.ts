import type { PanelId } from '../../store';
import type { NationSummary, ProvinceDetail, ProvinceId, WorldSnapshot } from '../../shared/types';

/**
 * Nation whose flag belongs in the panel chrome header.
 * Most nation-scoped panels are about the player; the province panel is about
 * the tapped province's owner (who may be a foreign nation).
 */
export function resolvePanelChromeNation(
  openPanel: PanelId,
  snapshot: WorldSnapshot | null,
  selectedProvince: ProvinceId | null,
  provinceDetail: ProvinceDetail | null,
): NationSummary | null {
  if (!snapshot || !openPanel) return null;

  const playerNation = snapshot.nations.find((nation) => nation.id === snapshot.playerNation) ?? null;

  if (openPanel === 'province') {
    const ownerId =
      provinceDetail && selectedProvince !== null && provinceDetail.id === selectedProvince
        ? provinceDetail.owner
        : selectedProvince !== null
          ? snapshot.provinces[selectedProvince]?.owner
          : null;
    if (ownerId != null) {
      return snapshot.nations.find((nation) => nation.id === ownerId) ?? playerNation;
    }
  }

  return playerNation;
}
