function roundCoord(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Ring self-intersection repair, shared by the map build and the raster tracer.
 *
 * Lifted verbatim out of build-map.mjs. Traced rings bowtie for the same reason
 * clipped ones do, and an unrepaired bowtie draws a long thin spike across the
 * map: that is what the Arctic and Siberian spikes were. HANDOFF.md records the
 * two things that matter here, both learned the hard way — the recursion needs a
 * deep ceiling (12 was silently giving up; it is 96), and a coordinate transform
 * after repair can re-introduce intersections, so repair runs again afterwards.
 */
function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, c, epsilon) {
  return (
    Math.min(a[0], c[0]) - epsilon <= b[0]
    && b[0] <= Math.max(a[0], c[0]) + epsilon
    && Math.min(a[1], c[1]) - epsilon <= b[1]
    && b[1] <= Math.max(a[1], c[1]) + epsilon
  );
}

function ensureClosedRing(ring) {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function polygonAreaRing(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function segmentIntersectionPoint(a, b, c, d) {
  const denom = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(denom) < 1e-15) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denom;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denom;
  if (t < 1e-9 || t > 1 - 1e-9 || u < 1e-9 || u > 1 - 1e-9) return null;
  return [roundCoord(a[0] + t * (b[0] - a[0])), roundCoord(a[1] + t * (b[1] - a[1]))];
}

function segmentsProperlyIntersectOrTouch(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const eps = 1e-12;
  if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps)
    && (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) {
    return true;
  }
  if (Math.abs(o1) <= eps && onSegment(a, c, b, eps)) return true;
  if (Math.abs(o2) <= eps && onSegment(a, d, b, eps)) return true;
  if (Math.abs(o3) <= eps && onSegment(c, a, d, eps)) return true;
  if (Math.abs(o4) <= eps && onSegment(c, b, d, eps)) return true;
  return false;
}

function ringHasSelfIntersection(ring) {
  const closed = ensureClosedRing(ring).slice(0, -1);
  if (closed.length < 4) return false;
  for (let i = 0; i < closed.length; i++) {
    const a = closed[i];
    const b = closed[(i + 1) % closed.length];
    for (let j = i + 1; j < closed.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === closed.length - 1) continue;
      const c = closed[j];
      const d = closed[(j + 1) % closed.length];
      if (segmentsProperlyIntersectOrTouch(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Keep the largest simple loop when a ring bowties (Voronoi/clip artifact). */
function repairSelfIntersectingRing(ring, depth = 0) {
  const closed = ensureClosedRing(ring);
  // Each pass discards one bowtie lobe, so a ring with many crossings needs
  // many passes. The old ceiling of 12 silently returned unrepaired rings once
  // provinces became Voronoi cuts of concave coastlines.
  if (depth > 96 || closed.length < 4 || !ringHasSelfIntersection(closed)) {
    return closed.length >= 4 ? closed : null;
  }
  const body = closed.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    const a = body[i];
    const b = body[(i + 1) % body.length];
    for (let j = i + 1; j < body.length; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === body.length - 1) continue;
      const c = body[j];
      const d = body[(j + 1) % body.length];
      if (!segmentsProperlyIntersectOrTouch(a, b, c, d)) continue;
      const hit = segmentIntersectionPoint(a, b, c, d);
      if (hit) {
        const loopA = [hit, ...body.slice(i + 1, j + 1), hit];
        const loopB = [hit, ...body.slice(j + 1), ...body.slice(0, i + 1), hit];
        const areaA = Math.abs(polygonAreaRing(ensureClosedRing(loopA)));
        const areaB = Math.abs(polygonAreaRing(ensureClosedRing(loopB)));
        const prefer = areaA >= areaB ? loopA : loopB;
        return repairSelfIntersectingRing(prefer, depth + 1);
      }
      // Collinear / endpoint-touching spike: drop the offending vertex and retry.
      const stripped = body.filter((_, index) => index !== ((i + 1) % body.length));
      if (stripped.length >= 3) {
        return repairSelfIntersectingRing(ensureClosedRing(stripped), depth + 1);
      }
    }
  }
  return closed;
}

function repairGeometrySelfIntersections(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates
      .map((ring, index) => {
        const repaired = repairSelfIntersectingRing(ring);
        return repaired;
      })
      .filter((ring, index) => ring && (index === 0 || Math.abs(polygonAreaRing(ring)) > 1e-8));
    if (!rings.length || !rings[0]) return null;
    return { type: 'Polygon', coordinates: rings };
  }
  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates
      .map((poly) => {
        const rings = poly
          .map((ring, index) => repairSelfIntersectingRing(ring))
          .filter((ring, index) => ring && (index === 0 || Math.abs(polygonAreaRing(ring)) > 1e-8));
        return rings.length && rings[0] ? rings : null;
      })
      .filter(Boolean);
    if (polygons.length === 0) return null;
    if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] };
    return { type: 'MultiPolygon', coordinates: polygons };
  }
  return geometry;
}

export {
  ensureClosedRing,
  polygonAreaRing,
  ringHasSelfIntersection,
  repairSelfIntersectingRing,
  repairGeometrySelfIntersections,
};
