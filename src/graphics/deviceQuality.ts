import type { GraphicsMode } from "./preferences";

export type GraphicsPreference = GraphicsMode | "auto";
export interface GraphicsDevice {
  modelId: string | null;
  modelName: string | null;
  totalMemory: number | null;
  isDevice: boolean;
}
/** A conservative starting budget, not a promise about thermal/GPU performance. */
export function automaticGraphics(device: GraphicsDevice): GraphicsMode {
  if (!device.isDevice) return "3d";
  const memory = (device.totalMemory ?? 0) / 2 ** 30;
  if (memory > 0 && memory < 3) return "2d";
  const iphone = /^iPhone(\d+),/.exec(device.modelId ?? "");
  // iPhone hardware generation 16 starts with the A17 Pro family.
  if (iphone && Number(iphone[1]) >= 16 && memory >= 5.5) return "high";
  if (memory >= 7.5) return "high";
  return "3d";
}
export function graphicsPreference(value: unknown): GraphicsPreference {
  return value === "2d" || value === "3d" || value === "high" ? value : "auto";
}
