import { useEffect, useMemo, useState, type RefObject } from "react";
import { Pressable, Text, View } from "react-native";
import type { MapRef } from "@maplibre/maplibre-react-native";
import type { WorldSnapshot } from "../../../src/shared/types";
import { visibleUnitOwnerIds } from "../../../src/map/unitVisibility";
export function UnitCounters({
  snapshot,
  seed,
  map,
  project,
  revision,
  onSelect,
}: {
  snapshot: WorldSnapshot;
  seed: { provinces: readonly { name: string; lon: number; lat: number }[] };
  map?: RefObject<MapRef | null>;
  project?: (
    coordinates: [number, number],
  ) => [number, number] | Promise<[number, number]>;
  revision: number;
  onSelect: (province: number) => void;
}) {
  const key = JSON.stringify([
    snapshot.playerNation,
    snapshot.relations,
    snapshot.wars.map((w) => [w.attackers, w.defenders]),
    snapshot.armies.map((a) => [a.id, a.owner, a.location, a.regiments.length]),
    snapshot.fleets.map((f) => [f.id, f.owner, f.location, f.ships.length]),
  ]);
  const markers = useMemo(() => {
    const visible = visibleUnitOwnerIds(
      snapshot.playerNation,
      snapshot.wars,
      snapshot.relations,
    );
    const grouped = new Map<
      string,
      {
        id: string;
        province: number;
        owner: number;
        fleet: boolean;
        count: number;
      }
    >();
    for (const unit of [...snapshot.armies, ...snapshot.fleets]) {
      if (!visible.has(unit.owner)) continue;
      const fleet = "ships" in unit;
      const id = `${unit.owner}:${unit.location}:${fleet}`;
      const marker = grouped.get(id) ?? {
        id,
        province: unit.location,
        owner: unit.owner,
        fleet,
        count: 0,
      };
      marker.count += fleet ? unit.ships.length : unit.regiments.length;
      grouped.set(id, marker);
    }
    return [...grouped.values()];
  }, [key]);
  const [positions, setPositions] = useState<
    { id: string; x: number; y: number }[]
  >([]);
  useEffect(() => {
    let canceled = false;
    if (!project && !map?.current) return;
    void Promise.all(
      markers.map(async (marker) => {
        const province = seed.provinces[marker.province];
        if (!province) return null;
        try {
          const [x, y] = await (project
            ? project([province.lon, province.lat])
            : map!.current!.project([province.lon, province.lat]));
          return { id: marker.id, x, y };
        } catch {
          return null;
        }
      }),
    ).then((items) => {
      if (!canceled)
        setPositions(
          items.filter((p): p is { id: string; x: number; y: number } => !!p),
        );
    });
    return () => {
      canceled = true;
    };
  }, [markers, seed, revision, project]);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", inset: 0 }}>
      {positions.map((position) => {
        const marker = markers.find((m) => m.id === position.id)!;
        const name = snapshot.nations[marker.owner]?.name ?? "Unknown";
        return (
          <Pressable
            key={marker.id}
            accessibilityRole="button"
            accessibilityLabel={`${name} ${marker.fleet ? "fleet" : "army"}: ${marker.count} ${marker.fleet ? "ships" : "regiments"} in ${seed.provinces[marker.province]?.name}`}
            onPress={() => onSelect(marker.province)}
            style={{
              position: "absolute",
              left: position.x - 22,
              top: position.y - 22 + (marker.fleet ? 24 : 0),
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                marker.owner === snapshot.playerNation ? "#102b35" : "#67352f",
              borderColor: "#d6b475",
              borderWidth: 2,
              borderRadius: marker.fleet ? 20 : 5,
            }}
          >
            <Text style={{ color: "#f4eddf", fontSize: 13, fontWeight: "700" }}>
              {marker.fleet ? "⚓" : "⚔"} {marker.count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
