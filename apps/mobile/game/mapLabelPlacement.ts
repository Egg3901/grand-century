export interface LabelPlacement {
  point: readonly [number, number];
  imageWidth: number;
  imageHeight: number;
  iconScale: number;
  mapWidth: number;
  mapHeight: number;
  topInset: number;
  bottomInset: number;
  sideInset: number;
}

/** Keep the complete native map symbol inside the uncovered viewport. */
export function labelFitsViewport(options: LabelPlacement): boolean {
  const { point: [x, y], imageWidth, imageHeight, iconScale,
    mapWidth, mapHeight, topInset, bottomInset, sideInset } = options;
  const halfWidth = imageWidth * iconScale / 2;
  const halfHeight = imageHeight * iconScale / 2;
  return Number.isFinite(x) && Number.isFinite(y)
    && x - halfWidth >= sideInset && x + halfWidth <= mapWidth - sideInset
    && y - halfHeight >= topInset && y + halfHeight <= mapHeight - bottomInset;
}
