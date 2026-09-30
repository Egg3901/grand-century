import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { homeContent } from "../../../src/ui/homeContent";

export function HomeScreen({
  busy,
  notice,
  resume,
  onResume,
  onNew,
  onLoad,
  onMultiplayer,
  onAccount,
}: {
  busy: boolean;
  notice: string;
  resume?: string;
  onResume: () => void;
  onNew: () => void;
  onLoad: () => void;
  onMultiplayer: () => void;
  onAccount: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const action = (label: string, onPress: () => void, primary = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={[s.button, primary && s.primary, busy && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, primary && { color: "#102b35" }]}>
        {label}
      </Text>
      <Text style={[s.arrow, primary && { color: "#102b35" }]}>›</Text>
    </Pressable>
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#102b35" }}
      contentContainerStyle={[s.page, wide && { padding: 28 }]}
    >
      <View style={s.masthead}>
        <Image
          source={require("../assets/grand-century-icon.png")}
          accessibilityLabel="Grand Century"
          style={{ width: 48, height: 48 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>GRAND CENTURY</Text>
          <Text style={s.edition}>{homeContent.edition}</Text>
        </View>
      </View>
      <View
        style={[
          s.columns,
          wide && { flexDirection: "row", alignItems: "flex-start" },
        ]}
      >
        <View style={[s.cover, wide && { flex: 1.2 }]}>
          <Text style={s.kicker}>A HISTORICAL GRAND STRATEGY</Text>
          <Text
            accessibilityRole="header"
            style={[s.title, wide && { fontSize: 40, lineHeight: 45 }]}
          >
            {homeContent.title}
          </Text>
          <Text style={s.copy}>{homeContent.introduction}</Text>
          <Image
            source={require("../../../src/assets/home/menu-atlas.png")}
            accessibilityLabel="Engraved world atlas with coastlines, graticules and compass rose"
            resizeMode="cover"
            style={[s.atlas, wide && { height: 230 }]}
          />
          <Text style={s.caption}>THE WORLD AWAITS YOUR HAND</Text>
        </View>
        <View style={[s.ledger, wide && { flex: 1 }]}>
          <Text style={s.kicker}>THE CAMPAIGN REGISTER</Text>
          <Text style={s.registerTitle}>Write your history.</Text>
          {!!resume && action(`Resume ${resume}`, onResume)}
          {action("New campaign", onNew, true)}
          {action("Load and manage saves", onLoad)}
          {action("Multiplayer", onMultiplayer)}
          {action("Lakeside account", onAccount)}
          {!!notice && (
            <Text accessibilityRole="alert" style={s.copy}>
              {notice}
            </Text>
          )}
          <Text style={s.footnote}>
            Campaigns save on this device. Play offline and return whenever you
            like.
          </Text>
        </View>
      </View>
      <View style={[s.chapters, !wide && { flexDirection: "column" }]}>
        {homeContent.chapters.map((chapter, i) => (
          <View key={chapter.title} style={s.chapter}>
            <Text style={s.chapterTitle}>
              {["I", "II", "III"][i]} / {chapter.title}
            </Text>
            <Text style={s.copy}>{chapter.text}</Text>
          </View>
        ))}
      </View>
      <Text style={s.footnote}>
        Cartographic plate: Natural Earth, public domain. Decorative physical
        coastline.
      </Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 32,
    gap: 22,
    flexGrow: 1,
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
  },
  masthead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderColor: "#6e725e",
    paddingBottom: 18,
  },
  brand: {
    fontFamily: "Georgia",
    fontSize: 21,
    letterSpacing: 2,
    color: "#f4eddf",
  },
  edition: { marginTop: 5, fontSize: 9, letterSpacing: 2, color: "#d6b475" },
  columns: { gap: 22 },
  cover: { gap: 14, minWidth: 0 },
  kicker: {
    color: "#d6b475",
    fontSize: 9,
    letterSpacing: 1.8,
    fontWeight: "700",
  },
  title: {
    fontFamily: "Georgia",
    fontSize: 35,
    lineHeight: 41,
    color: "#f4eddf",
  },
  copy: { fontSize: 14, lineHeight: 22, color: "#c6d2d2" },
  atlas: { width: "100%", height: 174, borderWidth: 1, borderColor: "#b49a66" },
  caption: {
    fontSize: 9,
    letterSpacing: 2,
    color: "#aebbaf",
    textAlign: "center",
  },
  ledger: {
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: "#8c7d60",
    backgroundColor: "#18363f",
    minWidth: 0,
  },
  registerTitle: {
    fontFamily: "Georgia",
    fontSize: 24,
    color: "#f4eddf",
    marginBottom: 4,
  },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#6c827f",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  primary: {
    backgroundColor: "#d6b475",
    borderColor: "#ead5a9",
    minHeight: 56,
  },
  buttonText: {
    fontFamily: "Georgia",
    fontSize: 17,
    color: "#f4eddf",
    flexShrink: 1,
  },
  arrow: { fontSize: 26, color: "#d6b475" },
  chapters: {
    flexDirection: "row",
    gap: 20,
    borderTopWidth: 1,
    borderColor: "#6e725e",
    paddingTop: 18,
  },
  chapter: { flex: 1, gap: 6 },
  chapterTitle: { fontFamily: "Georgia", fontSize: 19, color: "#d6b475" },
  footnote: { fontSize: 11, lineHeight: 17, color: "#aebbaf" },
});
