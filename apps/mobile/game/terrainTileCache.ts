import { Directory, File, Paths } from "expo-file-system";
import { installTerrainCache } from "../../../src/graphics/terrainTiles";
const directory = new Directory(Paths.cache, "terrain-detail-v1");
let entries: File[] | null = null;
function files() {
  if (!entries) {
    directory.create({ idempotent: true, intermediates: true });
    entries = directory
      .list()
      .filter((p): p is File => p instanceof File)
      .sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
  }
  return entries;
}
installTerrainCache({
  async read(key) {
    files();
    const file = new File(directory, key.replaceAll("/", "-") + ".png");
    return file.exists ? file.bytes() : null;
  },
  async write(key, bytes) {
    const list = files(),
      file = new File(directory, key.replaceAll("/", "-") + ".png");
    if (file.exists) return;
    // Each validated tile is at most 1 MiB; 64 entries is a hard 64 MiB ceiling.
    while (list.length >= 64) {
      const old = list.shift();
      if (old?.exists) old.delete();
    }
    file.write(bytes);
    list.push(file);
  },
});
