// Build the geographic raster in the same Web Mercator space as MapLibre.
// ImageSource projects its four corners, not each latitude row inside the image.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const extent = 85;
const radians = Math.PI / 180;
const northing = Math.log(Math.tan(Math.PI / 4 + extent * radians / 2));
export function latitudeAtRow(row, height) {
  return Math.atan(Math.sinh(northing * (1 - 2 * (row + 0.5) / height))) / radians;
}
export function sourceRow(row, height, sourceHeight) {
  return (extent - latitudeAtRow(row, height)) / (2 * extent) * sourceHeight - 0.5;
}

function magick(args, input) {
  const result = spawnSync('magick', args, { input, maxBuffer: 128 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}

export function buildRelief() {
  const source = fileURLToPath(new URL('../content/mobile/gray-earth-relief-equirectangular.png', import.meta.url));
  const output = fileURLToPath(new URL('../apps/mobile/assets/map/gray-earth-relief.png', import.meta.url));
  const width = 4096, sourceHeight = 1934, height = 4096;
  const pixels = magick([source, '-depth', '8', 'rgba:-']);
  if (pixels.length !== width * sourceHeight * 4) throw new Error('Unexpected relief dimensions');
  const projected = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(sourceHeight - 1, sourceRow(y, height, sourceHeight)));
    const y0 = Math.floor(sy), y1 = Math.min(sourceHeight - 1, y0 + 1), weight = sy - y0;
    for (let x = 0; x < width; x++) {
      const a = (y0 * width + x) * 4, b = (y1 * width + x) * 4, out = (y * width + x) * 4;
      const alpha = pixels[a + 3] * (1 - weight) + pixels[b + 3] * weight;
      // Interpolate premultiplied color to avoid dark fringes at clipped coasts.
      for (let c = 0; c < 3; c++) projected[out + c] = alpha ? Math.round(
        (pixels[a + c] * pixels[a + 3] * (1 - weight) + pixels[b + c] * pixels[b + 3] * weight) / alpha) : 0;
      projected[out + 3] = Math.round(alpha);
    }
  }
  magick(['-size', `${width}x${height}`, '-depth', '8', 'rgba:-', output], projected);
  console.log('Projected offline relief to Web Mercator (85N to 85S)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildRelief();
