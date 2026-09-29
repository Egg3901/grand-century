import type { ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Command, WorldSnapshot } from "../../../src/shared/types";
import worldSeed from "../assets/game/worldSeed.json";

export type GamePanel =
  | "menu"
  | "economy"
  | "military"
  | "diplomacy"
  | "research"
  | "graphics";
export const gamePanels: { key: GamePanel; label: string }[] = [
  { key: "economy", label: "Economy" },
  { key: "military", label: "Military" },
  { key: "diplomacy", label: "Diplomacy" },
  { key: "research", label: "Research" },
];
const title = (page: GamePanel) =>
  page === "menu"
    ? "Campaign menu"
    : page === "graphics"
      ? "Map and graphics"
      : gamePanels.find((p) => p.key === page)!.label;
export function MenuButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.4 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
export function MenuSheet({
  title: heading,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {heading}
            </Text>
            <MenuButton label="Return to map" onPress={onClose} />
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
export function GameMenus({
  page,
  onPage,
  onClose,
  onHome,
  snapshot,
  send,
  notice,
  graphics,
  selectedProvince,
}: {
  page: GamePanel;
  onPage: (p: GamePanel) => void;
  onClose: () => void;
  onHome: () => void;
  snapshot: WorldSnapshot | null;
  send: (command: Command) => void;
  notice: string;
  graphics: ReactNode;
  selectedProvince: number | null;
}) {
  const player = snapshot?.nations[snapshot.playerNation];
  const fact = (label: string, value: string | number) => (
    <View style={styles.row} key={label}>
      <Text style={styles.text}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
  const provinceName = (id: number) =>
    worldSeed.provinces.find((p) => p.id === id)?.name ?? `Province ${id}`;
  return (
    <MenuSheet title={title(page)} onClose={onClose}>
      {page !== "menu" && (
        <MenuButton label="All menus" onPress={() => onPage("menu")} />
      )}
      {!!notice && (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      )}
      {page === "menu" && (
        <>
          <Text style={styles.title}>{player?.name ?? "Your campaign"}</Text>
          <Text style={styles.text}>
            The campaign is paused. Return to the map and press play to advance
            time.
          </Text>
          {gamePanels.map((p) => (
            <MenuButton
              key={p.key}
              label={p.label}
              onPress={() => onPage(p.key)}
            />
          ))}
          <MenuButton
            label="Map and graphics"
            onPress={() => onPage("graphics")}
          />
          <MenuButton label="Main menu" onPress={onHome} />
        </>
      )}
      {page === "graphics" && graphics}
      {!snapshot && page !== "menu" && page !== "graphics" && (
        <Text style={styles.text}>Preparing campaign...</Text>
      )}
      {page === "economy" && player && snapshot && (
        <>
          {fact("Treasury", `£${Math.round(player.treasury).toLocaleString()}`)}
          <Text style={styles.title}>Tax policy</Text>
          {(["poor", "middle", "rich"] as const).map((bracket) => {
            const rate =
              bracket === "poor"
                ? player.taxRatePoor
                : bracket === "middle"
                  ? player.taxRateMiddle
                  : player.taxRateRich;
            return (
              <View key={bracket} style={styles.card}>
                {fact(
                  `${bracket[0].toUpperCase() + bracket.slice(1)} income`,
                  `${Math.round(rate * 100)}%`,
                )}
                <View style={styles.actions}>
                  <MenuButton
                    label={`Lower ${bracket} tax`}
                    disabled={rate <= 0}
                    onPress={() =>
                      send({
                        t: "setTax",
                        bracket,
                        rate: Math.max(0, rate - 0.05),
                      })
                    }
                  />
                  <MenuButton
                    label={`Raise ${bracket} tax`}
                    disabled={rate >= 1}
                    onPress={() =>
                      send({
                        t: "setTax",
                        bracket,
                        rate: Math.min(1, rate + 0.05),
                      })
                    }
                  />
                </View>
              </View>
            );
          })}
          {fact("Tariffs", `${Math.round(player.tariffRate * 100)}%`)}
          <View style={styles.actions}>
            <MenuButton
              label="Lower tariffs"
              disabled={player.tariffRate <= player.tariffMin}
              onPress={() =>
                send({
                  t: "setTariff",
                  rate: Math.max(player.tariffMin, player.tariffRate - 0.05),
                })
              }
            />
            <MenuButton
              label="Raise tariffs"
              disabled={player.tariffRate >= player.tariffMax}
              onPress={() =>
                send({
                  t: "setTariff",
                  rate: Math.min(player.tariffMax, player.tariffRate + 0.05),
                })
              }
            />
          </View>
          <Text style={styles.title}>Production</Text>
          {snapshot.playerProduction.length === 0 && (
            <Text style={styles.text}>No production reported yet.</Text>
          )}
          {snapshot.playerProduction.map((p, i) => (
            <View style={styles.card} key={i}>
              <Text style={styles.value}>{p.locationName}</Text>
              <Text style={styles.text}>
                {p.recipe} · {p.outputGood}
              </Text>
            </View>
          ))}
        </>
      )}
      {page === "military" && snapshot && player && (
        <>
          {fact("Military score", player.militaryScore)}
          {fact("Mobilization capacity", player.mobilizationCapacity)}
          <View style={styles.actions}>
            <MenuButton
              label="Mobilize reserves"
              onPress={() => send({ t: "mobilize" })}
            />
            <MenuButton
              label="Stand down reserves"
              onPress={() => send({ t: "demobilize" })}
            />
          </View>
          <Text style={styles.title}>Armies</Text>
          {snapshot.armies.filter((a) => a.owner === snapshot.playerNation)
            .length === 0 && (
            <Text style={styles.text}>
              No armies raised. Select an owned province on the map to recruit a
              regiment.
            </Text>
          )}
          {snapshot.armies
            .filter((a) => a.owner === snapshot.playerNation)
            .map((a) => (
              <View style={styles.card} key={a.id}>
                <Text style={styles.value}>
                  Army {a.id + 1} · {a.regiments.length} regiments
                </Text>
                <Text style={styles.text}>
                  {provinceName(a.location)} ·{" "}
                  {a.supplied === false ? "Out of supply" : "In supply"}
                </Text>
                {!a.leader && (
                  <MenuButton
                    label={`Assign general to army ${a.id + 1}`}
                    onPress={() => send({ t: "assignGeneral", army: a.id })}
                  />
                )}
                {selectedProvince != null && (
                  <MenuButton
                    label={`Move army ${a.id + 1} to ${provinceName(selectedProvince)}`}
                    onPress={() =>
                      send({
                        t: "moveArmy",
                        army: a.id,
                        target: selectedProvince,
                      })
                    }
                  />
                )}
              </View>
            ))}
          {selectedProvince != null &&
            snapshot.provinces[selectedProvince]?.owner ===
              snapshot.playerNation && (
              <MenuButton
                label={`Recruit in ${provinceName(selectedProvince)}`}
                onPress={() =>
                  send({ t: "recruitArmy", province: selectedProvince })
                }
              />
            )}
          {fact(
            "Fleets",
            snapshot.fleets.filter((f) => f.owner === snapshot.playerNation)
              .length,
          )}
        </>
      )}
      {page === "diplomacy" && snapshot && player && (
        <>
          {fact(
            "Diplomatic points",
            Math.floor(snapshot.playerDiplomaticPoints),
          )}
          {fact("Infamy", player.infamy.toFixed(1))}
          <Text style={styles.title}>Nations</Text>
          {snapshot.nations
            .filter((n) => n.id !== snapshot.playerNation)
            .map((n) => {
              const allied = snapshot.relations.some(
                (r) =>
                  r.kind === "alliance" &&
                  ((r.a === n.id && r.b === snapshot.playerNation) ||
                    (r.b === n.id && r.a === snapshot.playerNation)),
              );
              return (
                <View key={n.id} style={styles.card}>
                  <Text style={styles.value}>{n.name}</Text>
                  <Text style={styles.text}>
                    {n.atWar ? "At war" : "At peace"}
                    {allied ? " · Allied" : ""}
                  </Text>
                  <MenuButton
                    label={`${allied ? "End alliance with" : "Propose alliance to"} ${n.name}`}
                    onPress={() =>
                      send(
                        allied
                          ? {
                              t: "cancelRelation",
                              target: n.id,
                              kind: "alliance",
                            }
                          : { t: "proposeAlliance", target: n.id },
                      )
                    }
                  />
                </View>
              );
            })}
        </>
      )}
      {page === "research" && snapshot?.playerTech && (
        <>
          {fact(
            "Research points",
            snapshot.playerTech.researchPoints.toFixed(1),
          )}
          {fact(
            "Monthly research",
            snapshot.playerTech.monthlyResearch.toFixed(1),
          )}
          {fact(
            "Current research",
            snapshot.playerTech.statuses.find(
              (t) => t.key === snapshot.playerTech?.current,
            )?.name ?? "None selected",
          )}
          {snapshot.playerTech.current && (
            <Text style={styles.text}>
              {snapshot.playerTech.progress.toFixed(1)} /{" "}
              {snapshot.playerTech.currentCost} points
            </Text>
          )}
          {snapshot.playerTech.statuses.map((t) => (
            <View style={styles.card} key={t.key}>
              <Text style={styles.value}>{t.name}</Text>
              <Text style={styles.text}>
                {t.category} · {t.cost} points
              </Text>
              <Text style={styles.text}>{t.effectsSummary.join(" · ")}</Text>
              {t.researched ? (
                <Text style={styles.text}>Researched</Text>
              ) : t.key === snapshot.playerTech?.current ? (
                <Text style={styles.text}>Researching</Text>
              ) : (
                <>
                  <Text style={styles.text}>{t.reason}</Text>
                  <MenuButton
                    label={`Research ${t.name}`}
                    disabled={!t.available}
                    onPress={() => send({ t: "setResearch", tech: t.key })}
                  />
                </>
              )}
            </View>
          ))}
        </>
      )}
    </MenuSheet>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#eeeae0" },
  heading: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#bd954e",
    gap: 8,
  },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { fontSize: 21, fontWeight: "800", color: "#17262d" },
  text: { fontSize: 15, lineHeight: 22, color: "#42565a" },
  value: { fontSize: 16, fontWeight: "700", color: "#17262d", flexShrink: 1 },
  button: {
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#18272d",
    justifyContent: "center",
    borderRadius: 3,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f1eadc",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
  },
  card: { borderWidth: 1, borderColor: "#b9b6a8", padding: 12, gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notice: {
    fontSize: 14,
    color: "#17262d",
    padding: 12,
    backgroundColor: "#ddd5bb",
  },
});
