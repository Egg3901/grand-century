export type GraphicsMode = "2d" | "3d";
export const GRAPHICS_KEY = "grand-century-graphics-v1";
export function parseGraphicsMode(value: unknown): GraphicsMode {
  // Conservative default: no hardware guess and no surprise battery cost.
  return value === "3d" ? "3d" : "2d";
}
export const TERRAIN_CREDIT =
  "Elevation: Mapzen terrain tiles, NOAA, USGS and contributing agencies";
