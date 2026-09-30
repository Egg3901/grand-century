import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TraceLine } from "../../../src/shared/types";

export const panelStyles = StyleSheet.create({
  title: {
    fontSize: 23,
    fontFamily: "Georgia",
    color: "#17262d",
    fontWeight: "600",
  },
  text: { fontSize: 15, lineHeight: 22, color: "#42565a" },
  value: { fontSize: 16, fontWeight: "700", color: "#17262d", flexShrink: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    flexWrap: "wrap",
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
  input: {
    minHeight: 48,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#657b80",
    color: "#192e35",
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    padding: 13,
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
});
export const number = (value: number, digits = 1) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
    : "0";
export const percent = (value: number) => `${number(value * 100)}%`;
export const money = (value: number) => `£${number(value)}`;
export const words = (value: string) => value.replaceAll("_", " ");
export function Button({
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
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[panelStyles.button, disabled && { opacity: 0.45 }]}
    >
      <Text style={panelStyles.buttonText}>{label}</Text>
    </Pressable>
  );
}
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={panelStyles.title}>
      {children}
    </Text>
  );
}
export function Copy({ children }: { children: ReactNode }) {
  return <Text style={panelStyles.text}>{children}</Text>;
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={panelStyles.card}>{children}</View>;
}
export function Fact({
  label,
  value,
  trace,
}: {
  label: string;
  value: ReactNode;
  trace?: TraceLine[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View>
      <View style={panelStyles.row}>
        <Text style={panelStyles.text}>{label}</Text>
        <Text style={panelStyles.value}>{value}</Text>
      </View>
      {!!trace?.length && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Explain ${label}`}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={panelStyles.text}>
              {expanded ? "Hide calculation" : "Show calculation"}
            </Text>
          </Pressable>
          {expanded &&
            trace.map((line, i) => (
              <View key={i} style={panelStyles.row}>
                <Text style={panelStyles.text}>{line.label}</Text>
                <Text style={panelStyles.value}>{number(line.value, 3)}</Text>
              </View>
            ))}
        </>
      )}
    </View>
  );
}
/** Each ledger starts small on phones; searching and paging keep every row reachable. */
export function Picker<T>({
  label,
  items,
  name,
  id,
  selected,
  onSelect,
}: {
  label: string;
  items: readonly T[];
  name: (item: T) => string;
  id: (item: T) => string | number;
  selected: string | number | null;
  onSelect: (item: T) => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const matches = items.filter((item) =>
    name(item).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <TextInput
        style={panelStyles.input}
        accessibilityLabel={`Search ${label}`}
        placeholder={`Find ${label}`}
        placeholderTextColor="#657b80"
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setLimit(12);
        }}
      />
      {matches.slice(0, limit).map((item) => (
        <Pressable
          key={id(item)}
          accessibilityRole="button"
          accessibilityLabel={`Select ${name(item)}`}
          accessibilityState={{ selected: selected === id(item) }}
          onPress={() => onSelect(item)}
          style={[
            panelStyles.card,
            {
              minHeight: 48,
              borderColor: selected === id(item) ? "#9c732c" : "#ddd6c5",
            },
          ]}
        >
          <Text style={panelStyles.value}>
            {selected === id(item) ? "● " : ""}
            {name(item)}
          </Text>
        </Pressable>
      ))}
      {!matches.length && <Copy>No matching {label}.</Copy>}
      {matches.length > limit && (
        <Button
          label={`Show more ${label}`}
          onPress={() => setLimit(limit + 12)}
        />
      )}
    </>
  );
}
