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
            /require\(('(?:[^']*\.png)')\)/g,
            "new URL($1,import.meta.url).href",
          );
      },
    },
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /.*\/NativeSimTransport$/, replacement: services },
      ...[
        "expo-file-system",
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
