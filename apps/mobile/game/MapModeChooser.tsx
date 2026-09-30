import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MenuSheet } from "./GameMenus";
import { nativeMapModes, type NativeMapMode } from "./mapModes";

export function MapModeChooser({
  mode,
  onChange,
  landscape,
}: {
  mode: NativeMapMode;
  onChange: (mode: NativeMapMode) => void;
  landscape: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = nativeMapModes.find(([id]) => id === mode)![1];
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Map mode: ${label}`}
        onPress={() => setOpen(true)}
        style={{
          position: "absolute",
          right: 12,
          ...(landscape ? { top: 76 } : { bottom: 134 }),
          minHeight: 48,
          maxWidth: "65%",
          paddingHorizontal: 14,
          justifyContent: "center",
          backgroundColor: "#f4eddf",
          borderWidth: 1,
          borderColor: "#87918b",
        }}
      >
        <Text style={{ color: "#192e35", fontSize: 13, fontWeight: "700" }}>
          Map / {label} ▾
        </Text>
      </Pressable>
      {open && (
        <MenuSheet title="Map layers" onClose={() => setOpen(false)}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {nativeMapModes.map(([id, name, description]) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`${name} map`}
                accessibilityState={{ selected: mode === id }}
                onPress={() => {
                  onChange(id);
                  setOpen(false);
                }}
                style={{
                  width: "47%",
                  minHeight: 76,
                  padding: 12,
                  gap: 6,
                  backgroundColor: mode === id ? "#102b35" : "#fffdf8",
                  borderWidth: 1,
                  borderColor: "#a79b81",
                }}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: 15,
                    color: mode === id ? "#f4eddf" : "#192e35",
                  }}
                >
                  {name}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    lineHeight: 17,
                    color: mode === id ? "#c6d2d2" : "#42565a",
                  }}
                >
                  {description}
                </Text>
              </Pressable>
            ))}
          </View>
        </MenuSheet>
      )}
    </>
  );
}
