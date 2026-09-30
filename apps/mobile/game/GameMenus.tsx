import { type ReactNode } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Command, WorldSnapshot } from "../../../src/shared/types";
import type { CampaignTransport } from "./NativeSimTransport";
import {
  GameplayPanels,
  gameplayPages,
  type GameplayPage,
} from "./GameplayPanels";
import { NativeAlerts, NativeTutorial } from "./NativeAdvisor";
import type { UiAlert } from "../../../src/ui/alerts";
import { Button, Copy, Heading } from "./PanelControls";
export { Button as MenuButton } from "./PanelControls";
export type GamePanel =
  "menu" | "graphics" | "alerts" | "tutorial" | GameplayPage;
export const gamePanels = [
  { key: "economy", label: "Economy", icon: "wallet-outline" },
  { key: "military", label: "Military", icon: "shield-outline" },
  { key: "diplomacy", label: "Diplomacy", icon: "globe-outline" },
  { key: "research", label: "Research", icon: "flask-outline" },
] as const;
export function MenuSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={["portrait", "landscape-left", "landscape-right"]}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="light" />
          <View
            style={[
              styles.heading,
              landscape && {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 8,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>THE CABINET</Text>
              <Text
                accessibilityRole="header"
                style={[styles.headingTitle, landscape && { fontSize: 24 }]}
              >
                {title}
              </Text>
            </View>
            <Button label="Return to map" onPress={onClose} />
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
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
  onSaves,
  snapshot,
  send,
  notice,
  graphics,
  selectedProvince,
  transport,
  online,
  alerts,
  dismissAlert,
  muted,
  onMuted,
}: {
  alerts: readonly UiAlert[];
  dismissAlert: (id: string) => void;
  muted: boolean;
  onMuted: (value: boolean) => void;
  online?: boolean;
  page: GamePanel;
  onPage: (p: GamePanel) => void;
  onClose: () => void;
  onHome: () => void;
  onSaves: () => void;
  snapshot: WorldSnapshot | null;
  send: (cmd: Command) => void;
  notice: string;
  graphics: ReactNode;
  selectedProvince: number | null;
  transport: CampaignTransport;
}) {
  const heading =
    page === "alerts"
      ? "Reports and alerts"
      : page === "tutorial"
        ? "Tutorial"
        : page === "menu"
          ? "Campaign menu"
          : page === "graphics"
            ? "Map and graphics"
            : (gamePanels.find((p) => p.key === page)?.label ??
              gameplayPages.find(([key]) => key === page)?.[1] ??
              page);
  return (
    <MenuSheet title={heading} onClose={onClose}>
      {page !== "menu" && (
        <Button label="All menus" onPress={() => onPage("menu")} />
      )}
      {!!notice && (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      )}
      {page === "menu" ? (
        <>
          <Heading>
            {snapshot?.nations[snapshot.playerNation]?.name ?? "Your campaign"}
          </Heading>
          <Copy>
            {online
              ? "Online campaign. Time is controlled by the session host."
              : "The campaign is paused. Return to the map and press play to advance time."}
          </Copy>
          {gamePanels.map((p) => (
            <Button key={p.key} label={p.label} onPress={() => onPage(p.key)} />
          ))}
          <Button label="Reports and alerts" onPress={() => onPage("alerts")} />
          <Button label="Tutorial" onPress={() => onPage("tutorial")} />
          {gameplayPages.map(([key, label]) => (
            <Button key={key} label={label} onPress={() => onPage(key)} />
          ))}
          <Button label="Map and graphics" onPress={() => onPage("graphics")} />
          <Button
            label={online ? "Session and chat" : "Save and load campaigns"}
            onPress={onSaves}
          />
          <Button label="Main menu" onPress={onHome} />
        </>
      ) : page === "alerts" ? (
        <NativeAlerts alerts={alerts} onPage={onPage} dismiss={dismissAlert} />
      ) : page === "tutorial" ? (
        <NativeTutorial onPage={onPage} />
      ) : page === "graphics" ? (
        <>
          {graphics}
          <Button
            label={muted ? "Enable game audio" : "Mute game audio"}
            onPress={() => onMuted(!muted)}
          />
        </>
      ) : snapshot ? (
        <GameplayPanels
          key={page}
          page={page}
          snapshot={snapshot}
          transport={transport}
          send={send}
          selectedProvince={selectedProvince}
        />
      ) : (
        <Copy>Preparing campaign...</Copy>
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
