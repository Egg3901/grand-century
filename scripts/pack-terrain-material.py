"""Lossless PNG-to-RGBA serialization for ExpoGL (no DOM image decoder)."""
import base64,json,pathlib,zlib
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[1]
im=Image.open(root/'content/terrain/materials/alpine-atlas.png').convert('RGBA')
(root/'src/graphics/terrain-material.json').write_text(json.dumps({'width':im.width,'height':im.height,'rgba':base64.b64encode(zlib.compress(im.tobytes(),9)).decode()},separators=(',',':')))
