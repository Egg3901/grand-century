import { describe, expect, it } from 'vitest';
// @ts-expect-error The build-time compiler is plain ESM.
import { auditGeography } from '../scripts/lib/geography-contract.mjs';
describe('geographic promotion contract', () => {
  const square=(id:number,x:number)=>({id,geometry:{type:'Polygon',coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]}});
  const world={provinces:[{id:0,name:'A',ownerTag:'ENG'},{id:1,name:'B',ownerTag:'PAR'}]};
  const contract={asOf:'1830-01-01',points:[{key:'a',point:[.5,.5],owner:'ENG'},{key:'b',point:[1.5,.5],owner:'PAR'}],distinctProvinces:[['a','b']]};
  it('accepts distinct provinces with correct geographic ownership',()=>{
    expect(auditGeography({world,geometry:{features:[square(0,0),square(1,1)]},contract}).ok).toBe(true);
  });
  it('rejects swallowed minor states and overlapping polygons',()=>{
    expect(auditGeography({world,geometry:{features:[square(0,0),square(0,1)]},contract}).ok).toBe(false);
    expect(auditGeography({world,geometry:{features:[square(0,0),square(1,0),square(1,1)]},contract}).ok).toBe(false);
  });
});
