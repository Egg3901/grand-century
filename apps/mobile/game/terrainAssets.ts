import "./terrainTileCache";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { readTerrainBinary } from "../../../src/graphics/terrainBinary";
import type {
  TerrainData,
  TerrainQuality,
} from "../../../src/graphics/terrainData";
const assets = {
  balanced: require("../assets/terrain/balanced.terrain"),
  high: require("../assets/terrain/high.terrain"),
};
let cached: { quality: TerrainQuality; promise: Promise<TerrainData> } | null =
  null;
export function loadNativeTerrain(
  quality: TerrainQuality,
): Promise<TerrainData> {
  if (cached?.quality === quality) return cached.promise;
  const promise = (async () => {
    const asset = await Asset.fromModule(assets[quality]).downloadAsync();
    if (!asset.localUri) throw new Error("Offline terrain is missing");
    return readTerrainBinary(await new File(asset.localUri).bytes());
  })();
  cached = { quality, promise };
  void promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}
export function releaseTerrainCache() {
  cached = null;
}
