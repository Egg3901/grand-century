import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const services = fileURLToPath(
  new URL("./native-services.tsx", import.meta.url),
);
const shim = fileURLToPath(new URL("./platform.tsx", import.meta.url));
export default defineConfig({
  cacheDir: "node_modules/.vite-native-graphics",
  plugins: [
    react(),
    {
      name: "native-assets-for-browser-test",
      enforce: "pre",
      transform(code, id) {
        if (id.includes("/apps/mobile/"))
          return code.replace(
            /require\((['"])([^'"]*\.png)\1\)/g,
            (_, _quote, path) =>
              `new URL(${JSON.stringify(path)},import.meta.url).href`,
          );
      },
    },
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: /.*\/terrainAssets$/,
        replacement: fileURLToPath(
          new URL("./terrain-assets.ts", import.meta.url),
        ),
      },
      { find: /.*\/NativeSimTransport$/, replacement: services },
      ...[
        "expo-file-system",
        "expo-device",
        "expo-status-bar",
        "@expo/vector-icons/Ionicons",
        "@maplibre/maplibre-react-native",
        "react-native-safe-area-context",
      ].map((find) => ({ find, replacement: services })),
      { find: "react-native", replacement: shim },
      { find: "expo-gl", replacement: shim },
      {
        find: /.*terrain-atlas(?:-high)?\.json$/,
        replacement: fileURLToPath(new URL("./atlas.json", import.meta.url)),
      },
    ],
  },
  optimizeDeps: { entries: ["tests/native-graphics/index.html"] },
});
