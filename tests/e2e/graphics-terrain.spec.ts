import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const PARIS = (JSON.parse(readFileSync(new URL("../../src/data/generated/worldSeed.json", import.meta.url), "utf8")) as {
  provinces: { id: number; name: string }[];
}).provinces.find((province) => province.name === "Paris")!;

test("3D terrain preserves province interaction, 2D fallback and phone controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "3d");
  });
  await page.goto("/");
  await page.getByTestId("menu-new-game").click();
  await expect(page.getByTestId("terrain-3d")).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  // The shared renderer's public geographic projection is the interaction contract.
  const paris = await page.evaluate(() => {
    const r = (window as any).__gcTerrain;
    const point = r.project(2.35, 48.86);
    return {
      point,
      geo: r.unproject(...point),
      province: r.provinceAtPoint(...point),
    };
  });
  expect(paris.geo[0]).toBeCloseTo(2.35, 3);
  expect(paris.geo[1]).toBeCloseTo(48.86, 3);
  expect(paris.point[0]).toBeGreaterThan(200);
  expect(paris.point[0]).toBeLessThan(1000);
  // The province named for Paris in the world v8 1830 atlas.
  expect(paris.province).toBe(PARIS.id);
  await page.mouse.click(paris.point[0], paris.point[1]);
  await expect(
    page.getByRole("heading", { name: PARIS.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Terrain", exact: true }).click();
  await page.screenshot({ path: "artifacts/graphics-terrain-desktop.png" });
  const beforeSwitch = await page.evaluate(() =>
    (window as any).__gcTerrain.project(2.35, 48.86),
  );
  await page
    .getByRole("button", { name: "2D · Low power", exact: true })
    .click();
  await expect(page.getByTestId("terrain-3d")).toHaveCount(0);
  await page
    .getByRole("button", { name: "3D · Balanced", exact: true })
    .click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  const afterSwitch = await page.evaluate(() =>
    (window as any).__gcTerrain.project(2.35, 48.86),
  );
  expect(afterSwitch[0]).toBeCloseTo(beforeSwitch[0], 0);
  expect(afterSwitch[1]).toBeCloseTo(beforeSwitch[1], 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/graphics-terrain-phone.png" });
  await page
    .getByRole("button", { name: "2D · Low power", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("grand-century-graphics-v1"),
    ),
  ).toBe("2d");
  expect(errors).toEqual([]);
});

test("loss of the graphics context recovers into the interactive 2D atlas", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "3d");
  });
  await page.goto("/");
  await page.getByTestId("menu-new-game").click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  await page
    .locator(".gc-terrain-view canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(
    page.getByRole("button", { name: "2D · Low power", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("3D graphics became unavailable. Switched to 2D."),
  ).toBeVisible();
  await expect(page.locator(".grand-map canvas")).toBeVisible();
});

test("High renders detailed geometry, modeled scenery and moving water while paused", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "high");
  });
  await page.goto("/");
  await page.getByTestId("menu-new-game").click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  await expect(
    page.getByRole("button", { name: "3D · High", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() =>
    (window as any).__gcTerrainFocus({ lon: 8, lat: 46, zoom: 4.4 }),
  );
  await page.waitForFunction(
    () =>
      !(window as any).__gcTerrain.needsFrame &&
      !(window as any).__gcTerrain.isPreparingScenery,
  );
  const metrics = await page.evaluate(() => {
    const r = (window as any).__gcTerrain;
    const c = document.querySelector(
      ".gc-terrain-view canvas",
    ) as HTMLCanvasElement;
    (window as any).__gcTerrainFocus({ lon: 8, lat: 46, zoom: 4.4 });
    const now = performance.now() / 1000;
    r.render(now, false, null);
    const gl = c.getContext("webgl")!;
    const pixels = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
    );
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    r.render(now + 1.5, false, null);
    const later = new Uint8Array(pixels.length);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      later,
    );
    let changed = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        Math.abs(pixels[i] - later[i]) +
          Math.abs(pixels[i + 1] - later[i + 1]) +
          Math.abs(pixels[i + 2] - later[i + 2]) >
        8
      )
        changed++;
    const anchor = r.project(7.5, 46.5);
    const v = r.zoomAt(anchor[0], anchor[1], 0.6);
    (window as any).__gcTerrainFocus(v);
    const after = r.project(7.5, 46.5);
    return {
      changed,
      pixels: pixels.length / 4,
      error: gl.getError(),
      size: r.data.size,
      scenery: r.sceneryCount,
      anchor,
      after,
    };
  });
  expect(metrics.size).toBe(4096);
  expect(metrics.error).toBe(0);
  expect(metrics.scenery).toBeGreaterThan(0);
  expect(metrics.changed / metrics.pixels).toBeGreaterThan(0.01);
  expect(metrics.after[0]).toBeCloseTo(metrics.anchor[0], 0);
  expect(metrics.after[1]).toBeCloseTo(metrics.anchor[1], 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const animation = await page.evaluate(
    () =>
      new Promise<{ frames: number; changed: boolean }>((resolve) => {
        const r = (window as any).__gcTerrain;
        const original = r.render.bind(r);
        const canvas = document.querySelector(
          ".gc-terrain-view canvas",
        ) as HTMLCanvasElement;
        const gl = canvas.getContext("webgl")!;
        let frames = 0,
          first = 0,
          changed = false;
        const finish = () => {
          r.render = original;
          clearTimeout(timeout);
          resolve({ frames, changed });
        };
        const timeout = setTimeout(finish, 30000);
        r.render = (
          time: number,
          political: boolean,
          selected: number | null,
        ) => {
          original(time, political, selected);
          const pixels = new Uint8Array(
            gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
          );
          gl.readPixels(
            0,
            0,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
          let hash = 0;
          for (let i = 0; i < pixels.length; i += 64)
            hash = (Math.imul(hash, 31) + pixels[i]) | 0;
          if (!frames) first = hash;
          else changed ||= hash !== first;
          frames++;
          if (frames >= 2) finish();
        };
      }),
  );
  expect(animation.frames).toBeGreaterThanOrEqual(2);
  expect(animation.changed).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Terrain", exact: true }).click();
  await page.screenshot({ path: "artifacts/graphics-high-alps.png" });
  await page.setViewportSize({ width: 430, height: 932 });
  await page.evaluate(() =>
    (window as any).__gcTerrainFocus({ lon: 54, lat: 24, zoom: 5 }),
  );
  await page.screenshot({ path: "artifacts/graphics-high-phone.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "3D · Balanced", exact: true })
    .click();
  await page.waitForFunction(
    () => (window as any).__gcTerrain?.quality === "balanced",
  );
  await expect(page.getByTestId("terrain-3d")).toBeVisible();
});

test("close-zoom frontiers follow ownership even when nations have identical colors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "3d");
  });
  await page.goto("/");
  await page.getByTestId("menu-new-game").click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  await page.evaluate(() =>
    (window as any).__gcTerrainFocus({ lon: 10, lat: 45, zoom: 6 }),
  );
  await page.waitForFunction(
    () => !(window as any).__gcTerrain.isPreparingScenery,
  );
  const result = await page.evaluate(() => {
    const r = (window as any).__gcTerrain;
    const gl = (
      document.querySelector(".gc-terrain-view canvas") as HTMLCanvasElement
    ).getContext("webgl")!;
    const colors = Array.from({ length: 4096 }, () => [160, 150, 110]);
    const read = () => {
      const pixels = new Uint8Array(
        gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
      );
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      return pixels;
    };
    r.setPalette(
      colors,
      colors.map((_, i) => i),
    );
    r.render(0, true, null, false);
    const before = read();
    r.setPalette(
      colors,
      colors.map(() => 0),
    );
    r.render(0, true, null, false);
    const after = read();
    let changed = 0;
    for (let i = 0; i < before.length; i += 4)
      if (
        Math.abs(before[i] - after[i]) +
          Math.abs(before[i + 1] - after[i + 1]) +
          Math.abs(before[i + 2] - after[i + 2]) >
        30
      )
        changed++;
    const anchor = r.project(10.4, 45.2),
      view = r.zoomAt(...anchor, 0.6);
    r.setView(view, innerWidth, innerHeight);
    return {
      changed,
      detail: r.detailResolution,
      error: gl.getError(),
      anchor,
      after: r.project(10.4, 45.2),
    };
  });
  expect(result.detail).toBe(1024);
  expect(result.error).toBe(0);
  expect(result.changed).toBeGreaterThan(100);
  expect(result.after[0]).toBeCloseTo(result.anchor[0], 0);
  expect(result.after[1]).toBeCloseTo(result.anchor[1], 0);
});

test("fine terrain, day/night cycle and weather draw real pixels and persist controls", async ({
  page,
}) => {
  // Five full pixel readbacks use software GL in CI; camera timing has its own native gate.
  test.setTimeout(360000);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "high");
  });
  await page.goto("/");
  await page.getByTestId("menu-new-game").click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  await page.evaluate(() =>
    (window as any).__gcTerrainFocus({ lon: 12, lat: 46, zoom: 7 }),
  );
  await page.waitForFunction(() => {
    const r = (window as any).__gcTerrain;
    return (
      !r.isPreparingScenery &&
      !r.needsFrame &&
      !r.elevationDetail.loading &&
      r.elevationDetail.loadedTiles > 0
    );
  });
  const result = await page.evaluate(() => {
    const r = (window as any).__gcTerrain,
      gl = (
        document.querySelector(".gc-terrain-view canvas") as HTMLCanvasElement
      ).getContext("webgl")!;
    const read = () => {
      const p = new Uint8Array(
        gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
      );
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p,
      );
      return p;
    };
    const now = performance.now() / 1000;
    r.setAtmosphere({ lighting: "cycle", weather: "clear", dayOfYear: 180 });
    r.render(now, false, null);
    const day = read();
    r.render(now + 120, false, null);
    const night = read();
    const changed = (a: Uint8Array, b: Uint8Array) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4)
        if (
          Math.abs(a[i] - b[i]) +
            Math.abs(a[i + 1] - b[i + 1]) +
            Math.abs(a[i + 2] - b[i + 2]) >
          12
        )
          n++;
      return n;
    };
    r.setAtmosphere({ lighting: "day", weather: "rain", dayOfYear: 180 });
    r.render(now, false, null);
    const rain = read();
    r.render(now + 1, false, null);
    const movingRain = changed(rain, read());
    r.setAtmosphere({ lighting: "day", weather: "snow", dayOfYear: 180 });
    r.render(now, false, null);
    const snow = read();
    const anchor = r.project(12.1, 46.1),
      target = r.zoomAt(...anchor, 0.4);
    r.setView(target, innerWidth, innerHeight);
    const after = r.project(12.1, 46.1);
    return {
      night: changed(day, night),
      rain: changed(day, rain),
      snow: changed(rain, snow),
      movingRain,
      pixels: day.length / 4,
      error: gl.getError(),
      elevation: r.elevationDetail,
      anchor,
      after,
    };
  });
  expect(result.elevation.spacingMeters).toBeLessThan(1000);
  expect(result.night / result.pixels).toBeGreaterThan(0.5);
  expect(result.rain).toBeGreaterThan(100);
  expect(result.snow).toBeGreaterThan(100);
  expect(result.movingRain).toBeGreaterThan(100);
  expect(result.error).toBe(0);
  expect(result.after[0]).toBeCloseTo(result.anchor[0], 0);
  expect(result.after[1]).toBeCloseTo(result.anchor[1], 0);
  await page.locator(".gc-atmosphere-controls summary").click();
  await page.getByLabel("Map lighting").selectOption("night");
  await page.getByLabel("Map weather").selectOption("snow");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("grand-century-atmosphere-v1")!),
    ),
  ).toMatchObject({ lighting: "night", weather: "snow" });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.getByLabel("Map weather").selectOption("clear");
  await expect(page.getByLabel("Map weather")).toHaveValue("clear");
});

test("engraved homepage fits portrait and landscape; regional weather remains visible in 2D", async ({ page }) => {
  test.setTimeout(360000);
  await page.addInitScript(() => {
    localStorage.setItem("grand-century.tutorial.v0_2_0.seen", "1");
    localStorage.setItem("grand-century-graphics-v1", "2d");
    localStorage.setItem("grand-century-atmosphere-v1", JSON.stringify({ lighting: "day", weather: "clear" }));
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "An age of steam. A world in upheaval." })).toBeVisible();
  await expect(page.locator(".menu-home__atlas")).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 850 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.querySelector(".menu-home")!.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/homepage-web-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByTestId("menu-new-game").click();
  await page.waitForFunction(() => (window as any).__grandCenturyMap?.getSource("visual-weather-clouds"));
  await page.evaluate(() => (window as any).__grandCenturyMap.jumpTo({ center: [2.5, 47], zoom: 3.8 }));
  const clip = { x: 60, y: 220, width: 300, height: 300 };
  await page.waitForFunction(() => (window as any).__grandCenturyMap.loaded() && !(window as any).__grandCenturyMap.isMoving());
  const clear = await page.screenshot({ clip });
  await page.locator(".gc-atmosphere-controls summary").click();
  await page.getByLabel("Map weather").selectOption("rain");
  await page.locator(".gc-atmosphere-controls summary").click();
  await page.waitForFunction(() => {
    const map = (window as any).__grandCenturyMap;
    return map.loaded() && !map.isMoving() && map.querySourceFeatures("visual-weather-clouds").length > 0;
  });
  const rain = await page.screenshot({ clip });
  // Compare pixels from the central map, away from HUD and weather controls.
  const changed = await page.evaluate(async ([a, b]) => {
    const read = async (data: string) => {
      const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, 300, 300).data;
    };
    const x = await read(a), y = await read(b); let count = 0;
    for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i+1] - y[i+1]) + Math.abs(x[i+2] - y[i+2]) > 12) count++;
    return count;
  }, [clear.toString("base64"), rain.toString("base64")]);
  expect(changed).toBeGreaterThan(1000);
  await page.screenshot({ path: "artifacts/regional-weather-2d.png" });
  await page.getByRole("button", { name: "3D · Balanced", exact: true }).click();
  await page.waitForFunction(() => !!(window as any).__gcTerrain);
  await page.locator(".gc-atmosphere-controls summary").click();
  await expect(page.getByLabel("Map weather")).toHaveValue("rain");
});
