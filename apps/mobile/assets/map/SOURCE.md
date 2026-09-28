# Offline map relief

`gray-earth-relief.png` is derived from Natural Earth's `GRAY_50M_SR_W.tif` version 3.2.0, downloaded from:

https://naturalearth.s3.amazonaws.com/50m_raster/GRAY_50M_SR_W.zip

The source raster is public domain under https://www.naturalearthdata.com/about/terms-of-use/. It was cropped from 90N to 90S to 85N to 85S and resized from 10,800 × 5,400 to 4,096 × 1,934 pixels. Water pixels were made transparent and the image was clipped to Grand Century's province geometry to avoid coastline mismatches. It is bundled with the app and does not require network access.

The small terrain patterns in this directory are original procedural assets generated for Grand Century.

## Projection correction

The original latitude-linear clipped raster is retained in
`content/mobile/gray-earth-relief-equirectangular.png`. Run
`node scripts/project-mobile-relief.mjs` with ImageMagick 7 installed to rebuild
the bundled 4096 x 4096 Web Mercator raster. The latitude extent remains 85N to
85S, matching the ImageSource corners. Pixel centers are inverse-projected and
RGBA is interpolated with premultiplied alpha. MapLibre projects image corners,
not the latitude rows inside an image; the old latitude-linear asset therefore
stretched land away from the political borders.

`node --test scripts/project-mobile-relief.test.mjs` checks geographic landmarks
against MapLibre's independent MercatorCoordinate implementation.

Projection reference: https://maplibre.org/maplibre-native/docs/book/design/coordinate-system.html
