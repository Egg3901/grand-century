import type { TerrainData } from "./terrainData";
/** Views into one prebuilt asset. No base64 parsing or decompression on the UI thread. */
export function readTerrainBinary(bytes: Uint8Array): TerrainData {
  if (bytes.byteLength < 16 || bytes.byteOffset % 2 !== 0)
    throw new Error("Invalid terrain asset");
  const header = new DataView(bytes.buffer, bytes.byteOffset, 16);
  const size = header.getUint32(4, true),
    provinceSize = header.getUint32(8, true);
  if (
    header.getUint32(0, false) !== 0x47435431 ||
    size < 1 ||
    size > 8192 ||
    provinceSize < 1 ||
    provinceSize > 8192 ||
    bytes.byteLength !== 16 + size * size * 8 + provinceSize * provinceSize * 2
  )
    throw new Error("Invalid terrain asset");
  let offset = bytes.byteOffset + 16;
  const heights = new Uint16Array(bytes.buffer, offset, size * size);
  offset += size * size * 2;
  const surface = new Uint8Array(bytes.buffer, offset, size * size * 4);
  offset += size * size * 4;
  const normals = new Uint8Array(bytes.buffer, offset, size * size * 2);
  offset += size * size * 2;
  const provinces = new Uint16Array(
    bytes.buffer,
    offset,
    provinceSize * provinceSize,
  );
  return { size, provinceSize, heights, surface, normals, provinces };
}
