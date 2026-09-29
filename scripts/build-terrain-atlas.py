"""Build the offline Web Mercator elevation/biome atlas. No runtime tile service.
Requires Pillow/numpy. Downloads Mapzen Terrarium z3 tiles to an explicit cache.
Derived heights are sea-clamped, biome colors follow game provinces, and coast
mask follows game geometry so the visual and selectable land agree.
"""
import argparse, base64, concurrent.futures, hashlib, io, json, math, pathlib, urllib.request, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
p=argparse.ArgumentParser();p.add_argument('--cache',required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];cache=pathlib.Path(a.cache);cache.mkdir(parents=True,exist_ok=True)
N=2048
height=np.zeros((N,N),dtype=np.float32); hashes={}
def fetch(xy):
 x,y=xy;f=cache/f'3-{x}-{y}.png';url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/3/{x}/{y}.png'
 if not f.exists():
  with urllib.request.urlopen(url,timeout=45) as r:f.write_bytes(r.read())
 arr=np.array(Image.open(f).convert('RGB'),dtype=np.float32)
 return x,y,arr[:,:,0]*256+arr[:,:,1]+arr[:,:,2]/256-32768,hashlib.sha256(f.read_bytes()).hexdigest()
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for x,y,t,h in pool.map(fetch,[(x,y) for y in range(8) for x in range(8)]):
  height[y*256:(y+1)*256,x*256:(x+1)*256]=t;hashes[f'3/{x}/{y}']=h
atlas=json.loads((root/'apps/mobile/assets/game/atlas.json').read_text())
P=4096
ids=Image.new('I',(P,P),0); colors=Image.new('RGB',(P,P),(22,66,86)); draw=ImageDraw.Draw(ids);cd=ImageDraw.Draw(colors)
palette={'mountains':'#888778','forest':'#537151','jungle':'#356447','desert':'#c6b083','farmland':'#90966b','arctic':'#d7dfd9','plains':'#9bA17b'}
def xy(pt):
 lon,lat=pt;lat=max(-85.05112878,min(85.05112878,lat));return ((lon+180)/360*P,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*P)
for f in atlas['features']:
 props=f['properties'];polys=f['geometry']['coordinates'];polys=polys if f['geometry']['type']=='MultiPolygon' else [polys]
 for poly in polys:
  for i,ring in enumerate(poly):
   points=[xy(pt) for pt in ring]
   draw.polygon(points,fill=props['id']+1 if i==0 else 0)
   cd.polygon(points,fill=palette.get(props['terrain'],'#9ba17b') if i==0 else '#164256')
land=np.asarray(ids.resize((N,N),Image.Resampling.NEAREST))>0
colors=colors.resize((N,N),Image.Resampling.LANCZOS)
# Actual elevations; negative inland values (e.g. Caspian basin) are sea-level.
height=np.where(land,np.maximum(0,height),0)
# Preserve small geographic detail in lighting without adding more mesh vertices.
dy,dx=np.gradient(height);shade=np.clip(.90+(dy-dx)*.0007,.50,1.16)
base=np.asarray(colors,dtype=float);snow=np.clip((height-2500)/2300,0,.86)[:,:,None]
base=base*(1-snow)+np.array([226,230,218])*snow
base=np.clip(base*shade[:,:,None],0,255).astype(np.uint8)
# Encode exact province IDs, not colors, for GPU recoloring and province picking.
idsArr=np.asarray(ids,dtype=np.uint16)
# Keep bathymetry as a coastal-distance proxy entirely derived from the land mask.
coast=np.asarray(Image.fromarray((land*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)))
rgba=np.dstack((base,coast)).astype(np.uint8)
def pack(v):return base64.b64encode(zlib.compress(v.tobytes(),9)).decode()
out={'size':N,'provinceSize':P,'projection':'EPSG:3857','heightUnitMetres':1,'height':pack(height.astype('<u2')),'surface':pack(rgba),'province':pack(idsArr.astype('<u2'))}
target=root/'src/graphics/terrain-atlas.json';target.write_text(json.dumps(out,separators=(',',':'))+'\n')
(root/'src/graphics/terrain-provenance.json').write_text(json.dumps({'provinceGeometrySha256':hashlib.sha256((root/'src/data/generated/provinces.geo.json').read_bytes()).hexdigest(),'source':'https://registry.opendata.aws/terrain-tiles/','tiles':'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/3/{x}/{y}.png','sha256':hashes,'processing':'Sea-clamped metre heights, game-province land mask and biomes, slope lighting and altitude snow tint. No simulation state changed.'},indent=2)+'\n')
print(f'Wrote {target.name}: {target.stat().st_size:,} bytes; max height {height.max():.0f} m')
