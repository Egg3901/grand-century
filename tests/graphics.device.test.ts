import { describe, it, expect } from "vitest";
import {
  automaticGraphics,
  graphicsPreference,
} from "../src/graphics/deviceQuality";
describe("automatic graphics budget", () => {
  const device = {
    modelId: null,
    modelName: null,
    totalMemory: null,
    isDevice: true,
  };
  it("uses High on recent iPhones with enough memory", () => {
    expect(
      automaticGraphics({
        ...device,
        modelId: "iPhone18,2",
        totalMemory: 12 * 2 ** 30,
      }),
    ).toBe("high");
  });
  it("keeps older, unknown and simulated devices conservative", () => {
    expect(automaticGraphics(device)).toBe("3d");
    expect(automaticGraphics({ ...device, totalMemory: 2 * 2 ** 30 })).toBe(
      "2d",
    );
    expect(
      automaticGraphics({
        ...device,
        totalMemory: 16 * 2 ** 30,
        isDevice: false,
      }),
    ).toBe("3d");
  });
  it("preserves explicit overrides and defaults missing or invalid preferences to Auto", () => {
    expect(graphicsPreference("2d")).toBe("2d");
    expect(graphicsPreference("high")).toBe("high");
    expect(graphicsPreference(null)).toBe("auto");
  });
});
