function pointKey(point) {
  return `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
}

function edgeKey(a, b) {
  const left = pointKey(a);
  const right = pointKey(b);
  return left <= right ? `${left}|${right}` : `${right}|${left}`;
}

function ringsOf(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  return geometry.coordinates.flatMap((polygon) => polygon);
}

function decimate(line, tolerance = 0.02) {
  if (line.length <= 2) return line;
  const output = [line[0]];
  let [lastX, lastY] = line[0];
  for (const [x, y] of line.slice(1, -1)) {
    if ((x - lastX) ** 2 + (y - lastY) ** 2 < tolerance ** 2) continue;
    output.push([x, y]);
    lastX = x;
    lastY = y;
  }
  output.push(line.at(-1));
  return output;
}

export function buildNationalBorders(provincesGeo, world) {
  const ownerById = new Map(world.provinces.map((province) => [province.id, province.ownerTag]));
  const edges = new Map();
  for (const feature of provincesGeo.features) {
    const provinceId = feature.id ?? feature.properties.id;
    const ownerTag = ownerById.get(provinceId);
    if (!ownerTag) throw new Error(`Geometry uses unknown province ${provinceId}`);
    for (const ring of ringsOf(feature.geometry)) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const a = ring[index];
        const b = ring[index + 1];
        const key = edgeKey(a, b);
        const hits = edges.get(key) ?? [];
        hits.push({ ownerTag, line: [a, b] });
        edges.set(key, hits);
      }
    }
  }

  const segments = [];
  for (const hits of edges.values()) {
    if (hits.length === 1 || new Set(hits.map((hit) => hit.ownerTag)).size > 1) {
      segments.push(hits[0].line);
    }
  }

  const segmentsByPoint = new Map();
  for (let index = 0; index < segments.length; index += 1) {
    for (const endpoint of segments[index]) {
      const key = pointKey(endpoint);
      const values = segmentsByPoint.get(key) ?? [];
      values.push(index);
      segmentsByPoint.set(key, values);
    }
  }
  const used = new Set();
  const chains = [];
  for (let index = 0; index < segments.length; index += 1) {
    if (used.has(index)) continue;
    used.add(index);
    const chain = [segments[index][0], segments[index][1]];
    for (const direction of ['forward', 'backward']) {
      while (true) {
        const endpoint = direction === 'forward' ? chain.at(-1) : chain[0];
        const next = (segmentsByPoint.get(pointKey(endpoint)) ?? []).find((candidate) => !used.has(candidate));
        if (next == null) break;
        used.add(next);
        const segment = segments[next];
        const far = pointKey(segment[0]) === pointKey(endpoint) ? segment[1] : segment[0];
        if (direction === 'forward') chain.push(far);
        else chain.unshift(far);
      }
    }
    chains.push(decimate(chain).map(([lon, lat]) => [Number(lon.toFixed(4)), Number(lat.toFixed(4))]));
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { id: 0 },
      geometry: { type: 'MultiLineString', coordinates: chains },
    }],
  };
}
