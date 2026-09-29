export function containsPoint(geometry, point) {
  function inRing(ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
    }
    return inside;
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => inRing(rings[0]) && !rings.slice(1).some(inRing));
}
export function auditGeography({ world, geometry, contract }) {
  const provinces = new Map(world.provinces.map(p => [p.id,p]));
  const failures = [], matches = new Map(), checks = [];
  const hits = point => geometry.features.filter(f => containsPoint(f.geometry,point)).map(f=>provinces.get(f.id ?? f.properties.id)).filter(Boolean);
  for(const check of contract.points) {
    const found=hits(check.point), province=found[0];
    matches.set(check.key,found.length === 1 ? province.id : null);
    const actual=found.map(p=>({id:p.id,name:p.name,owner:p.ownerTag}));
    const ok=found.length === 1 && province.ownerTag === check.owner && !(check.forbidProvinceNames ?? []).includes(province.name);
    checks.push({key:check.key,name:check.name,ok,expectedOwner:check.owner,actual});
    if(!ok) failures.push({kind:'point',key:check.key,expectedOwner:check.owner,actual});
  }
  for(const keys of contract.distinctProvinces) {
    const ids=keys.map(key=>matches.get(key));
    if(ids.some(id=>id==null) || new Set(ids).size!==ids.length) failures.push({kind:'collapsed-provinces',keys,ids});
  }
  for(const check of contract.waterPoints ?? []) {
    const found=hits(check.point);
    if(found.length) failures.push({kind:'land-in-water',name:check.name,actual:found.map(p=>p.name)});
  }
  return {schemaVersion:1,asOf:contract.asOf,ok:failures.length===0,checks,failures};
}
