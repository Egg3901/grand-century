"""Build deterministic offline elevation, material and octahedral-normal atlases.
Requires Pillow/numpy. --quality high uses 256 Mapzen Terrarium z4 tiles.
The authored province mask remains authoritative for both rendering and picking.
"""
import argparse, base64, concurrent.futures, hashlib, json, math, pathlib, urllib.request, zipfile, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
p=argparse.ArgumentParser()
p.add_argument('--cache',required=True)
p.add_argument('--landcover',help='Optional cached Natural Earth NE1_LR_LC.zip')
p.add_argument('--quality',choices=['balanced','high'],default='balanced')
a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
cache=pathlib.Path(a.cache);cache.mkdir(parents=True,exist_ok=True)
Z=4 if a.quality=='high' else 3
N=256*2**Z; P=4096
height=np.zeros((N,N),dtype=np.float32); hashes={}
def fetch(xy):
 x,y=xy;f=cache/f'{Z}-{x}-{y}.png';url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'
 if not f.exists():
  with urllib.request.urlopen(url,timeout=45) as r:f.write_bytes(r.read())
 arr=np.array(Image.open(f).convert('RGB'),dtype=np.float32)
 return x,y,arr[:,:,0]*256+arr[:,:,1]+arr[:,:,2]/256-32768,hashlib.sha256(f.read_bytes()).hexdigest()
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for x,y,t,h in pool.map(fetch,[(x,y) for y in range(2**Z) for x in range(2**Z)]):
  height[y*256:(y+1)*256,x*256:(x+1)*256]=t;hashes[f'{Z}/{x}/{y}']=h
atlas=json.loads((root/'apps/mobile/assets/game/atlas.json').read_text())
ids=Image.new('I',(P,P),0); colors=Image.new('RGB',(P,P),(22,66,86))
draw=ImageDraw.Draw(ids);cd=ImageDraw.Draw(colors)
coverage=Image.new('L',(P*2,P*2),0);coverageDraw=ImageDraw.Draw(coverage)
palette={'mountains':'#8e8973','forest':'#456a40','jungle':'#275a39','desert':'#c8b080','farmland':'#8c985b','arctic':'#bcc9bf','plains':'#a2a574'}
def xy(pt):
 lon,lat=pt;lat=max(-85.05112878,min(85.05112878,lat))
 return ((lon+180)/360*P,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*P)
for f in atlas['features']:
 props=f['properties'];polys=f['geometry']['coordinates'];polys=polys if f['geometry']['type']=='MultiPolygon' else [polys]
 for poly in polys:
  for i,ring in enumerate(poly):
   points=[xy(pt) for pt in ring]
   draw.polygon(points,fill=props['id']+1 if i==0 else 0)
   coverageDraw.polygon([(x*2,y*2) for x,y in points],fill=255 if i==0 else 0)
   cd.polygon(points,fill=palette.get(props['terrain'],'#9ba17b') if i==0 else '#164256')
land=np.asarray(ids.resize((N,N),Image.Resampling.NEAREST))>0
height=np.where(land,np.maximum(0,height),0).astype(np.float32)
# Normal maps retain ridges finer than the view-dependent geometry grid.
latitude=np.arctan(np.sinh(np.pi*(1-2*(np.arange(N,dtype=np.float32)+.5)/N)))
metresPerPixel=40075016.686*np.maximum(.12,np.cos(latitude))[:,None]/N
dy,dx=np.gradient(height)
nx=-dx/metresPerPixel*12;ny=dy/metresPerPixel*12
length=np.abs(nx)+np.abs(ny)+1
normals=np.stack((nx/length,ny/length),axis=2)
normals=np.clip((normals*.5+.5)*255,0,255).astype(np.uint8)
# Broad valleys, exposed ridges and altitude/latitude snow, without baked directional light.
base=np.asarray(colors.resize((N,N),Image.Resampling.BILINEAR).filter(ImageFilter.GaussianBlur(N/1400)),dtype=np.float32)
# Natural Earth unshaded land cover replaces province-sized flat color patches.
# Reproject latitude-linear source rows to the same Mercator grid as the DEM.
landcoverUrl='https://naturalearth.s3.amazonaws.com/10m_raster/NE1_LR_LC.zip'
landcover=pathlib.Path(a.landcover) if a.landcover else cache/'NE1_LR_LC.zip'
if not landcover.exists():
 with urllib.request.urlopen(landcoverUrl,timeout=180) as response:landcover.write_bytes(response.read())
with zipfile.ZipFile(landcover) as archive:
 with archive.open('NE1_LR_LC.tif') as raster:
  Image.MAX_IMAGE_PIXELS=150_000_000 # Known medium-resolution Natural Earth source.
  source=Image.open(raster).convert('RGB')
  source=np.asarray(source.resize((N,source.height),Image.Resampling.BILINEAR),dtype=np.float32)
for y in range(N):
 sy=np.clip((.5-latitude[y]/np.pi)*source.shape[0]-.5,0,source.shape[0]-1)
 iy=int(sy);ny=min(iy+1,source.shape[0]-1);f=sy-iy
 row=source[iy]*(1-f)+source[ny]*f
 # White ocean in the source must not become white land where authored coasts differ.
 valid=(row.min(axis=1)<235)|(abs(latitude[y])>math.radians(65))
 base[y]=np.where(valid[:,None],row*.86+base[y]*.14,base[y])
del source
slope=np.sqrt(dx*dx+dy*dy)/metresPerPixel
rock=np.clip((height-650)/1500,0,.85)*np.clip(slope*9+.3,0,1)
base=base*(1-rock[:,:,None])+np.array([143,137,121],dtype=np.float32)*rock[:,:,None]
snowline=2300-np.clip((np.abs(latitude)*180/np.pi-45)/30,0,1)*1400
snow=np.clip((height-snowline[:,None])/900,0,1)*(1-np.clip(slope*1.6,0,.6))
base=base*(1-snow[:,:,None])+np.array([228,234,229],dtype=np.float32)*snow[:,:,None]
# Multi-scale deterministic material variation; no simulation RNG or invented elevations.
rng=np.random.default_rng(1830)
variation=np.zeros((N,N),dtype=np.float32)
for frequency,weight in [(64,.055),(256,.035),(1024,.018)]:
 noise=Image.fromarray(rng.integers(0,256,(frequency,frequency),dtype=np.uint8))
 variation+=(np.asarray(noise.resize((N,N),Image.Resampling.BILINEAR),dtype=np.float32)/255-.5)*weight
base=np.clip(base*(1+variation[:,:,None]),0,255).astype(np.uint8)
coast=np.asarray(Image.fromarray((land*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(N/512)))
normals[:,:,1]=np.where(land,normals[:,:,1],np.minimum(255,coast.astype(np.uint16)*2)).astype(np.uint8)
coverage=np.asarray(coverage.resize((N,N),Image.Resampling.LANCZOS))
rgba=np.dstack((base,coverage)).astype(np.uint8)
def pack(v):return base64.b64encode(zlib.compress(v.tobytes(),9)).decode()
out={'size':N,'provinceSize':P,'projection':'EPSG:3857','heightUnitMetres':1,'height':pack(height.astype('<u2')),'surface':pack(rgba),'normals':pack(normals),'province':pack(np.asarray(ids,dtype='<u2'))}
suffix='-high' if a.quality=='high' else ''
target=root/f'src/graphics/terrain-atlas{suffix}.json';target.write_text(json.dumps(out,separators=(',',':'))+'\n')
(root/f'src/graphics/terrain-provenance{suffix}.json').write_text(json.dumps({'provinceGeometrySha256':hashlib.sha256((root/'src/data/generated/provinces.geo.json').read_bytes()).hexdigest(),'source':'https://registry.opendata.aws/terrain-tiles/','landcover':{'url':landcoverUrl,'sha256':hashlib.sha256(landcover.read_bytes()).hexdigest(),'license':'Public domain: https://www.naturalearthdata.com/about/terms-of-use/','processing':'Unshaded land-cover color reprojected to Web Mercator and blended with authored biome palette.'},'tiles':f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{{x}}/{{y}}.png','sha256':hashes,'processing':'Sea-clamped metre heights, game-province land mask, biome materials, octahedral normals, altitude/latitude snow. Natural Earth land-cover color and deterministic artistic material variation, not historical satellite imagery. No simulation state changed.'},indent=2)+'\n')
print(f'Wrote {target.name}: {target.stat().st_size:,} bytes; max height {height.max():.0f} m',flush=True)
