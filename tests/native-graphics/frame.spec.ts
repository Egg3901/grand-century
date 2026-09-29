import { test, expect } from "@playwright/test";
test("native High paints the measured phone surface after initial layout", async ({
  page,
}) => {
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  await page.goto("/tests/native-graphics/index.html");
  await page.waitForFunction(() => !!(window as any).nativeGL);
  await expect(page.getByText("Preparing offline terrain...")).toHaveCount(0, {
    timeout: 30000,
  });
  const frame = await page.evaluate(() => {
    const { real, initial } = (window as any).nativeGL;
    const pixels = new Uint8Array(
      real.drawingBufferWidth * real.drawingBufferHeight * 4,
    );
    real.readPixels(
      0,
      0,
      real.drawingBufferWidth,
      real.drawingBufferHeight,
      real.RGBA,
      real.UNSIGNED_BYTE,
      pixels,
    );
    let painted = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        pixels[i + 3] === 255 &&
        Math.abs(pixels[i] - 9) +
          Math.abs(pixels[i + 1] - 26) +
          Math.abs(pixels[i + 2] - 38) >
          20
      )
        painted++;
    return {
      initial,
      viewport: Array.from(real.getParameter(real.VIEWPORT)),
      fraction: painted / (pixels.length / 4),
      error: real.getError(),
      failure: (window as any).nativeFailure,
    };
  });

  expect(frame.failure).toBeUndefined();
  expect(frame.error).toBe(0);
  expect(frame.fraction).toBeGreaterThan(0.9);
  await page.setViewportSize({ width: 600, height: 844 });
  await page.waitForFunction(
    () => (window as any).nativeGL.initial[0] === 1500,
  );
  await expect(page.getByText("Preparing offline terrain...")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Array.from(
        (window as any).nativeGL.real.getParameter(
          (window as any).nativeGL.real.VIEWPORT,
        ),
      ),
    ),
  ).toEqual([0, 0, 1500, 2110]);
});

test("a blank first draw reports fallback instead of declaring the terrain ready", async ({
  page,
}) => {
  await page.goto("/tests/native-graphics/index.html?blank");
  await page.waitForFunction(() => !!(window as any).nativeFailure);
  expect(await page.evaluate(() => (window as any).nativeFailure)).toBe(
    "3D could not draw the map. Using the 2D map.",
  );
});
