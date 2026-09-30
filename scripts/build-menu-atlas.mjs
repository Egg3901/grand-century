import { readFile, writeFile, mkdir } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";

// Code-drawn engraving from the game's bundled, public-domain Natural Earth
// physical coastline. No country boundaries or historical claims on this plate.
const root = new URL("../", import.meta.url);
const packed = JSON.parse(
  await readFile(new URL("src/graphics/physical-land.json", root), "utf8"),
);
const land = JSON.parse(inflateSync(Buffer.from(packed.geometry, "base64")));
const point = ([lon, lat]) => [((lon + 180) / 360) * 1400, (90 - lat) * 5];
function ringPath(ring) {
  let last = [-9999, -9999];
  const points = ring.map(point).filter((p, i) => {
    if (
      i &&
      i !== ring.length - 1 &&
      Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.2
    )
      return false;
    last = p;
    return true;
  });
  return (
    points
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join("") + "Z"
  );
}
const outline = land.features
  .flatMap((f) =>
    f.geometry.type === "MultiPolygon"
      ? f.geometry.coordinates
      : [f.geometry.coordinates],
  )
  .map((p) => p.map(ringPath).join(""))
  .join("");
const graticule =
  Array.from(
    { length: 23 },
    (_, i) => `<path d="M${((i + 1) * 1400) / 24} 0v900"/>`,
  ).join("") +
  Array.from(
    { length: 11 },
    (_, i) => `<path d="M0 ${(i + 1) * 75}h1400"/>`,
  ).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
<defs><path id="land" d="${outline}"/><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-2 6L6-2M4 8l4-4" stroke="#8d816a" stroke-width=".6" opacity=".28"/></pattern>
<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="3" seed="1830" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".13"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs>
<rect width="1400" height="900" fill="#e6dfcd" filter="url(#paper)"/>
<g stroke="#70817d" stroke-width=".6" opacity=".45">${graticule}</g>
<use href="#land" fill="none" stroke="#6c7c75" stroke-width="9" opacity=".13"/>
<use href="#land" fill="none" stroke="#6c7c75" stroke-width="5" opacity=".2"/>
<use href="#land" fill="#f0eadb" stroke="#536760" stroke-width="1.1" fill-rule="evenodd"/>
<use href="#land" fill="url(#hatch)" fill-rule="evenodd"/>
<g font-family="Georgia,serif" fill="#4b635f" text-anchor="middle" font-size="19" letter-spacing="6"><text x="276" y="257">NORTH AMERICA</text><text x="441" y="613">SOUTH AMERICA</text><text x="774" y="442">AFRICA</text><text x="1050" y="275">ASIA</text><text x="1210" y="670">OCEANIA</text></g>
<g font-family="Georgia,serif" fill="#647874" text-anchor="middle" font-size="18" font-style="italic" letter-spacing="3"><text x="580" y="428" transform="rotate(-14 580 428)">Atlantic Ocean</text><text x="115" y="580">Pacific Ocean</text><text x="962" y="626">Indian Ocean</text></g>
<g transform="translate(1280 155)" stroke="#5c705e" fill="none"><circle r="55" stroke-width="1"/><circle r="48" stroke-width=".5"/><path d="M0-70V70M-70 0H70M-40-40L40 40M40-40L-40 40" stroke-width=".7"/><path d="M0-58L10 0 0 58-10 0Z" fill="#4b635f"/><path d="M-58 0L0 10 58 0 0-10Z" fill="#e6dfcd"/><text x="0" y="-80" text-anchor="middle" fill="#4b635f" stroke="none" font-family="Georgia" font-size="18">N</text></g>
<rect x="22" y="22" width="1356" height="856" fill="none" stroke="#8c7d60" stroke-width="2"/><rect x="29" y="29" width="1342" height="842" fill="none" stroke="#8c7d60" stroke-width=".6"/>
<rect x="495" y="797" width="410" height="57" fill="#e6dfcd" stroke="#8c7d60"/><text x="700" y="832" text-anchor="middle" fill="#4b635f" font-family="Georgia,serif" font-size="19" letter-spacing="5">ATLAS OF THE WORLD</text>
</svg>`;
await mkdir(new URL("content/menu/", root), { recursive: true });
await mkdir(new URL("src/assets/home/", root), { recursive: true });
await writeFile(new URL("content/menu/menu-atlas.svg", root), svg);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<style>body{margin:0}</style>${svg}`);
  await page.screenshot({
    path: new URL("src/assets/home/menu-atlas.png", root).pathname,
  });
} finally {
  await browser.close();
}
console.log(
  "Built the vector plate and shared web/native PNG atlas from the bundled Natural Earth coastline.",
);
