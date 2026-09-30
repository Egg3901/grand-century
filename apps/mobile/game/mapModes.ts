import type { WorldSeedData } from "../../../src/data/generated";
import type { GameData, WorldSnapshot } from "../../../src/shared/types";
import { visibleUnitOwnerIds } from "../../../src/map/unitVisibility";
export const nativeMapModes = [
  ["political", "Political", "National ownership."],
  ["terrain", "Terrain", "Natural terrain and biomes."],
  [
    "population",
    "Population",
    "Needs met: red means hungry, green means well supplied.",
  ],
  ["economy", "Economy", "Darker green means greater economic output."],
  [
    "military",
    "Military",
    "Controller colors show occupation. Unit positions and routes are displayed.",
  ],
  [
    "diplomatic",
    "Diplomatic",
    "You: blue. Allies: green. Sphere: teal. Rivals: brown. Enemies: red.",
  ],
  ["unrest", "Unrest", "Darker red means greater unrest and militancy."],
  [
    "ruling_ideology",
    "Ruling ideology",
    "Reactionary: brown. Conservative: tan. Liberal: blue. Socialist and communist: red. Fascist: dark brown.",
  ],
  [
    "cores",
    "Cores",
    "Your national cores: green if owned, red if held by another nation.",
  ],
  [
    "culture",
    "Culture",
    "Plurality culture colors. National movement heartlands are red.",
  ],
] as const;
export type NativeMapMode = (typeof nativeMapModes)[number][0];
const clamp = (n: number) =>
  Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const rgb = (v: readonly number[]) =>
  `#${v
    .map((n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
function blend(hex: string, amount: number) {
  const a = clamp(amount);
  return rgb(
    [0, 1, 2].map(
      (i) =>
        parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) * (1 - a) +
        [232, 220, 192][i] * a,
    ),
  );
}
const ideology: Record<string, string> = {
  reactionary: "#5f4a3a",
  conservative: "#6a5f4b",
  liberal: "#4f6e8f",
  socialist: "#8c4f55",
  communist: "#7b3537",
  fascist: "#352926",
};
export function mapColors(
  mode: NativeMapMode,
  snap: WorldSnapshot,
  data: GameData,
): Map<number, string> {
  const output = snap.provinces.map((p) => p.economyOutput);
  const min = Math.min(...output),
    range = Math.max(1e-6, Math.max(...output) - min);
  const cores = new Set(snap.playerCoreStateIds ?? []);
  const war = snap.wars.filter(
    (w) =>
      w.attackers.includes(snap.playerNation) ||
      w.defenders.includes(snap.playerNation),
  );
  const enemies = new Set(
    war.flatMap((w) =>
      w.attackers.includes(snap.playerNation) ? w.defenders : w.attackers,
    ),
  );
  return new Map(
    snap.provinces.map((p) => {
      const owner = snap.nations[p.owner],
        controller = snap.nations[p.controller];
      const ownerColor = owner ? rgb(owner.color) : "#b7a486";
      let color = ownerColor;
      if (mode === "population") {
        const needs = clamp(p.needsMet);
        color = rgb([164 + (1 - needs) * 58, 92 + needs * 84, 78 + needs * 30]);
      }
      if (mode === "unrest") {
        const unrest = clamp(Math.max(p.unrestRisk, p.militancy / 10));
        color = rgb([136 + unrest * 86, 108 - unrest * 48, 92 - unrest * 50]);
      }
      if (mode === "economy")
        color = blend(
          "#5b7c72",
          0.6 - clamp((p.economyOutput - min) / range) * 0.5,
        );
      if (mode === "military")
        color =
          p.controller !== p.owner && controller
            ? blend(rgb(controller.color), 0.14)
            : blend(ownerColor, 0.32);
      if (mode === "ruling_ideology")
        color = blend(
          ideology[owner?.rulingIdeology] ?? ideology.conservative,
          0.12,
        );
      if (mode === "cores")
        color = !cores.has(p.stateId)
          ? blend(ownerColor, 0.6)
          : blend(p.owner === snap.playerNation ? "#4e8a5e" : "#8e4d46", 0.2);
      if (mode === "culture") {
        const c = data.cultures[p.pluralityCulture ?? -1];
        const share = clamp(p.nonAcceptedShare ?? 0);
        color = blend(c ? rgb(c.color) : ownerColor, 0.22 + share * 0.35);
        if (p.cultureHeartland && p.owner === snap.playerNation)
          color = blend("#8e4d46", 0.1);
        else if (share >= 0.45) color = blend("#8a5f46", 0.28 - share * 0.1);
      }
      if (mode === "diplomatic") {
        const relation = snap.relations.find(
          (r) =>
            (r.a === snap.playerNation && r.b === p.owner) ||
            (r.b === snap.playerNation && r.a === p.owner),
        );
        color =
          p.owner === snap.playerNation
            ? "#6f879f"
            : enemies.has(p.owner)
              ? "#8e5a52"
              : relation?.kind === "alliance"
                ? "#7c9472"
                : relation?.kind === "rivalry"
                  ? "#8a5f46"
                  : owner?.spheredBy === snap.playerNation ||
                      snap.nations[snap.playerNation]?.spheredBy === p.owner
                    ? "#6f8f7f"
                    : "#b5a27f";
      }
      return [p.id, color];
    }),
  );
}
/** Index shared polygon edges once; rebuild only the frontier list when ownership changes. */
export class NativeFrontiers {
  private segments = new Map<
    string,
    { coordinates: number[][]; provinces: number[] }
  >();
  constructor(
    features: readonly {
      properties: { id: number };
      geometry: { type: string; coordinates: number[][][] | number[][][][] };
    }[],
  ) {
    for (const f of features) {
      const polygons =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates as number[][][]]
          : (f.geometry.coordinates as number[][][][]);
      for (const polygon of polygons)
        for (const ring of polygon)
          for (let i = 1; i < ring.length; i++) {
            const key = [ring[i - 1].join(","), ring[i].join(",")]
              .sort()
              .join("|");
            const edge = this.segments.get(key) ?? {
              coordinates: [ring[i - 1], ring[i]],
              provinces: [],
            };
            edge.provinces.push(f.properties.id);
            this.segments.set(key, edge);
          }
    }
  }
  borders(snap: WorldSnapshot): GeoJSON.FeatureCollection {
    const coast: number[][][] = [],
      country: number[][][] = [],
      front: number[][][] = [];
    for (const edge of this.segments.values()) {
      const provinces = edge.provinces.map((id) => snap.provinces[id]);
      if (provinces.length === 1) coast.push(edge.coordinates);
      else if (provinces.some((p) => p?.owner !== provinces[0]?.owner))
        country.push(edge.coordinates);
      if (
        provinces.length > 1 &&
        provinces.some((p) => p?.controller !== provinces[0]?.controller) &&
        provinces.some((p) => p?.controller !== p?.owner)
      )
        front.push(edge.coordinates);
    }
    return {
      type: "FeatureCollection",
      features: [
        ["coast", coast],
        ["country", country],
        ["front", front],
      ].map(([kind, coordinates]) => ({
        type: "Feature",
        properties: { kind },
        geometry: {
          type: "MultiLineString",
          coordinates: coordinates as number[][][],
        },
      })),
    };
  }
}
export function unitRoutes(
  snap: WorldSnapshot,
  seed: WorldSeedData,
): GeoJSON.FeatureCollection {
  const visible = visibleUnitOwnerIds(
    snap.playerNation,
    snap.wars,
    snap.relations,
  );
  return {
    type: "FeatureCollection",
    features: [...snap.armies, ...snap.fleets]
      .filter((unit) => visible.has(unit.owner) && unit.moveTarget >= 0)
      .flatMap((unit) => {
        const from = seed.provinces[unit.location],
          to = seed.provinces[unit.moveTarget];
        return from && to
          ? [
              {
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "LineString" as const,
                  coordinates: [
                    [from.lon, from.lat],
                    [to.lon, to.lat],
                  ],
                },
              },
            ]
          : [];
      }),
  };
}

/** Snapshot cadence is faster than most overlays. Keep bridge geometry stable until its inputs change. */
export function mapDisplayKey(
  mode: NativeMapMode,
  snap: WorldSnapshot,
): string {
  const owners = snap.provinces
    .map((p) => `${p.owner}:${p.controller}`)
    .join(",");
  const nations = snap.nations
    .map((n) => `${n.color.join(",")}:${n.spheredBy}`)
    .join(";");
  if (mode === "population")
    return snap.provinces.map((p) => p.needsMet).join(",");
  if (mode === "economy")
    return snap.provinces.map((p) => p.economyOutput).join(",");
  if (mode === "unrest")
    return snap.provinces
      .map((p) => `${p.unrestRisk}:${p.militancy}`)
      .join(",");
  if (mode === "culture")
    return `${owners}/${nations}/${snap.provinces.map((p) => `${p.pluralityCulture}:${p.nonAcceptedShare}:${p.cultureHeartland}`).join(",")}`;
  if (mode === "ruling_ideology")
    return `${owners}/${snap.nations.map((n) => n.rulingIdeology).join(",")}`;
  if (mode === "cores")
    return `${owners}/${nations}/${snap.playerCoreStateIds?.join(",")}`;
  if (mode === "diplomatic")
    return `${owners}/${nations}/${JSON.stringify(snap.relations)}/${JSON.stringify(snap.wars.map((w) => [w.attackers, w.defenders]))}`;
  return `${owners}/${nations}`;
}
