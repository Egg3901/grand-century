"""Derive visual physical coastlines; never used for province IDs or ownership."""
import base64,hashlib,json,pathlib,sys,zlib
from shapely.geometry import shape,mapping
root=pathlib.Path(__file__).resolve().parents[1]
p=pathlib.Path(sys.argv[1]);raw=p.read_bytes();data=json.loads(raw)
features=[]
for f in data['features']:
 g=shape(f['geometry']).simplify(.004,preserve_topology=True)
 features.append({'properties':{'id':0},'geometry':mapping(g)})
# Keep lake cutouts as separate rings in land polygons, including inland lakes
# from the same public-domain physical dataset when present in land geometry.
def rounded(value):
 if isinstance(value,float):return round(value,5)
 if isinstance(value,(list,tuple)):return [rounded(v) for v in value]
 if isinstance(value,dict):return {k:rounded(v) for k,v in value.items()}
 return value
payload=json.dumps(rounded({'features':features}),separators=(',',':')).encode()
(root/'src/graphics/physical-land.json').write_text(json.dumps({'geometry':base64.b64encode(zlib.compress(payload,9)).decode()},separators=(',',':')))
(root/'content/terrain/coast-source.json').write_text(json.dumps({'source':'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson','sha256':hashlib.sha256(raw).hexdigest(),'license':'https://www.naturalearthdata.com/about/terms-of-use/','simplifyDegrees':.004,'purpose':'Physical coast rendering only. Modern coastline; not historical ownership or province authority.'},indent=2)+'\n')
print((root/'src/graphics/physical-land.json').stat().st_size)
