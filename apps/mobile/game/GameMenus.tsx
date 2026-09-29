import { useState, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { NationFlag } from "./NationFlag";
import { StatusBar } from "expo-status-bar";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Command, WorldSnapshot } from "../../../src/shared/types";
import worldSeed from "../assets/game/worldSeed.json";

export type GamePanel =
  "menu" | "economy" | "military" | "diplomacy" | "research" | "graphics";
export const gamePanels: {
  key: GamePanel;
  label: string;
  icon: "wallet-outline" | "shield-outline" | "globe-outline" | "flask-outline";
}[] = [
  { key: "economy", label: "Economy", icon: "wallet-outline" },
  { key: "military", label: "Military", icon: "shield-outline" },
  { key: "diplomacy", label: "Diplomacy", icon: "globe-outline" },
  { key: "research", label: "Research", icon: "flask-outline" },
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
          <StatusBar style="light" />
          <View style={styles.heading}>
            <View>
              <Text style={styles.eyebrow}>THE CABINET</Text>
              <Text accessibilityRole="header" style={styles.headingTitle}>
                {heading}
              </Text>
            </View>
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
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
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
          <Text style={styles.title}>Foreign relations</Text>
          <TextInput
            accessibilityLabel="Search diplomatic nations"
            placeholder="Find a nation"
            placeholderTextColor="#657b80"
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setLimit(12);
            }}
            style={styles.search}
          />
          {snapshot.nations
            .filter(
              (n) =>
                n.id !== snapshot.playerNation &&
                n.name.toLowerCase().includes(query.toLowerCase()),
            )
            .slice(0, limit)
            .map((n) => {
              const allied = snapshot.relations.some(
                (r) =>
                  r.kind === "alliance" &&
                  ((r.a === n.id && r.b === snapshot.playerNation) ||
                    (r.b === n.id && r.a === snapshot.playerNation)),
              );
              return (
                <View key={n.id} style={styles.card}>
                  <View style={styles.nationHeading}>
                    <NationFlag
                      tag={n.tag}
                      name={n.name}
                      color={n.color}
                      size={24}
                    />
                    <Text style={styles.value}>{n.name}</Text>
                  </View>
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
      {page === "diplomacy" &&
        snapshot &&
        snapshot.nations.filter(
          (n) =>
            n.id !== snapshot.playerNation &&
            n.name.toLowerCase().includes(query.toLowerCase()),
        ).length > limit && (
          <MenuButton
            label="Show more nations"
            onPress={() => setLimit((n) => n + 12)}
          />
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
  safe: { flex: 1, backgroundColor: "#102b35" },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 2,
    color: "#d6b475",
    fontWeight: "700",
    marginBottom: 6,
  },
  headingTitle: { fontFamily: "Georgia", fontSize: 30, color: "#f4eddf" },
  search: {
    minHeight: 48,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#d7d2c4",
    color: "#192e35",
  },
  nationHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  heading: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#bd954e",
    gap: 8,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
    backgroundColor: "#f4eddf",
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontFamily: "Georgia",
    fontWeight: "600",
    color: "#17262d",
  },
  text: { fontSize: 15, lineHeight: 22, color: "#42565a" },
  value: { fontSize: 16, fontWeight: "700", color: "#17262d", flexShrink: 1 },
  button: {
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#102b35",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bd954e",
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
  card: {
    backgroundColor: "#fffdf8",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd6c5",
    padding: 16,
    gap: 12,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notice: {
    fontSize: 14,
    color: "#17262d",
    padding: 12,
    backgroundColor: "#ddd5bb",
  },
});
