import atlas from "./atlas.json";
import {
  unpackTerrain,
  type TerrainQuality,
} from "../../src/graphics/terrainData";
export const loadNativeTerrain = async (_quality: TerrainQuality) =>
  unpackTerrain(atlas);
export const releaseTerrainCache = () => {};
