import type { ExpoWebGLRenderingContext } from "expo-gl";

/** Check the first presented frame, not just successful shader allocation. */
export function verifyTerrainFrame(gl: ExpoWebGLRenderingContext) {
  const width = gl.drawingBufferWidth,
    height = gl.drawingBufferHeight;
  if (width < 16 || height < 16)
    throw new Error("Terrain surface has no measured size");
  const pixel = new Uint8Array(4);
  let painted = 0;
  for (const x of [0.2, 0.5, 0.8])
    for (const y of [0.2, 0.5, 0.8]) {
      gl.readPixels(
        Math.floor(width * x),
        Math.floor(height * y),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      if (
        pixel[3] > 240 &&
        Math.abs(pixel[0] - 9) +
          Math.abs(pixel[1] - 26) +
          Math.abs(pixel[2] - 38) >
          12
      )
        painted++;
    }
  const error = gl.getError();
  if (error !== gl.NO_ERROR || painted < 3)
    throw new Error("Terrain did not draw a complete frame");
  return { width, height, painted, error };
}
