"""Compile offline Terrarium elevation tiles, with hashes and source provenance.
Requires Pillow and numpy. Network concurrency is capped at three.
"""
import base64, concurrent.futures, hashlib, io, json, math, pathlib, urllib.request, zlib
import numpy as np
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[1]
cache=pathlib.Path(__import__('os').environ.get('TERRAIN_TILE_CACHE',root/'content/raw/terrain-tiles'));cache.mkdir(parents=True,exist_ok=True)
source='https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
def xy(lon,lat,z):return int((lon+180)/360*2**z),int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
def region(z,w,s,e,n):
 a,b=xy(w,n,z);c,d=xy(e,s,z)
 return [(z,x,y) for x in range(a,c+1) for y in range(b,d+1)]
# Europe overview; extra detail for Alps/Adriatic and London native smoke fixture.
keys=sorted(set(region(7,-12,35,32,60)+region(8,5,43,17,49)+region(8,-3,49,2,54)))
def compile_tile(key):
 z,x,y=key;k=f'{z}/{x}/{y}';p=cache/f'{z}-{x}-{y}.png'
 if not p.exists():
  with urllib.request.urlopen(f'{source}/{k}.png',timeout=30) as response:p.write_bytes(response.read())
 raw=p.read_bytes();pixels=np.array(Image.open(io.BytesIO(raw)).convert('RGB'),dtype=np.int32)
 heights=np.maximum(0,pixels[:,:,0]*256+pixels[:,:,1]-32768).astype('<u2').tobytes()
 return k,base64.b64encode(zlib.compress(heights,9)).decode(),hashlib.sha256(raw).hexdigest()
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(compile_tile,keys))
(root/'src/graphics/terrain-detail.json').write_text(json.dumps({k:v for k,v,h in results},separators=(',',':')))
(root/'content/terrain/elevation-sources.json').write_text(json.dumps({'source':source,'format':'Terrarium RGB, whole metres, sea floor clamped to zero','license':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md','compiled':'2026-09-30','sha256':{k:h for k,v,h in results}},indent=2)+'\n')
(root/'tests/fixtures/terrain/7-68-45.png').write_bytes((cache/'7-68-45.png').read_bytes())
print(f'Compiled {len(results)} tiles: {(root/"src/graphics/terrain-detail.json").stat().st_size:,} bytes')
