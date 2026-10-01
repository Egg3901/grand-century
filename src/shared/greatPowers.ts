/** Historical great-power order used when a seed does not rank nations itself. */
export const GP_ORDER = ['ENG', 'FRA', 'PRU', 'AUS', 'RUS', 'USA', 'OTT', 'ESP'];

export function gpRankFor(seed: { tag: string; greatPowerRank?: number }): number {
  if (seed.greatPowerRank && seed.greatPowerRank > 0) return seed.greatPowerRank;
  return GP_ORDER.includes(seed.tag) ? GP_ORDER.indexOf(seed.tag) + 1 : 0;
}
