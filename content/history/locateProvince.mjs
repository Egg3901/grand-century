/**
 * Point-in-polygon province lookup over a province FeatureCollection.
 * Used to resolve location-keyed historical anchors on any mesh.
 */
function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function makeProvinceLocator(featureCollection) {
  const entries = featureCollection.features.map((feature) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const polygon of polygons) {
      for (const [x, y] of polygon[0]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { id: feature.properties?.id ?? feature.id, polygons, minX, minY, maxX, maxY };
  });
  return (lon, lat) => {
    for (const entry of entries) {
      if (lon < entry.minX || lon > entry.maxX || lat < entry.minY || lat > entry.maxY) continue;
      for (const polygon of entry.polygons) {
        if (!ringContains(polygon[0], lon, lat)) continue;
        if (polygon.slice(1).some((hole) => ringContains(hole, lon, lat))) continue;
        return entry.id;
      }
    }
    return null;
  };
}
