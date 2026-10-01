import { Image, Text, View } from "react-native";
import { nationFlags } from "./nationFlags";
export function NationFlag({
  tag,
  name,
  color,
  size = 28,
  testID,
}: {
  tag: string;
  name: string;
  color: readonly number[];
  size?: number;
  testID?: string;
}) {
  const source = nationFlags[tag];
  const style = {
    width: size * 1.5,
    height: size,
    borderWidth: 1,
    borderColor: "#bd954e",
    borderRadius: 2,
  };
  return source ? (
    <Image
      source={source}
      style={style}
      resizeMode="contain"
      accessibilityLabel={`${name} flag`}
      testID={testID}
    />
  ) : (
    <View
      style={{
        ...style,
        backgroundColor: `rgb(${color.join(",")})`,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessibilityLabel={name}
      testID={testID}
    >
      <Text style={{ color: "#fff", fontSize: 9 }}>{tag}</Text>
    </View>
  );
}
