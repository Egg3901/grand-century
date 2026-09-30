/** Shared by vertex grounding and fragment relief; keep CPU sampling equivalent. */
export const terrainHeightShader = `
uniform sampler2D heightMap;
uniform float heightTexel;
uniform sampler2D detailHeight;
uniform vec4 heightBounds;
uniform vec2 detailHeightTexel;
uniform float heightEnabled;
float decodeHeight(vec2 bytes){return dot(floor(bytes*255.0+.5),vec2(1.0,256.0));}
float detailInside(vec2 at){
 vec2 p=(at-heightBounds.xy)/heightBounds.zw;
 return heightEnabled*step(detailHeightTexel.x*.5,p.x)*step(p.x,1.0-detailHeightTexel.x*.5)*step(detailHeightTexel.y*.5,p.y)*step(p.y,1.0-detailHeightTexel.y*.5);
}
float heightAt(vec2 at) {
 if(detailInside(at)>.5){
  vec2 p=(at-heightBounds.xy)/heightBounds.zw/detailHeightTexel-.5;
  vec2 base=(floor(p)+.5)*detailHeightTexel,f=fract(p),d=detailHeightTexel;
  return mix(mix(decodeHeight(texture2D(detailHeight,base).ra),decodeHeight(texture2D(detailHeight,base+vec2(d.x,0)).ra),f.x),
   mix(decodeHeight(texture2D(detailHeight,base+vec2(0,d.y)).ra),decodeHeight(texture2D(detailHeight,base+d).ra),f.x),f.y);
 }
 vec2 p=at/heightTexel-.5,base=(floor(p)+.5)*heightTexel,f=fract(p);
 return mix(mix(decodeHeight(texture2D(heightMap,base).ra),decodeHeight(texture2D(heightMap,base+vec2(heightTexel,0)).ra),f.x),
  mix(decodeHeight(texture2D(heightMap,base+vec2(0,heightTexel)).ra),decodeHeight(texture2D(heightMap,base+vec2(heightTexel)).ra),f.x),f.y);
}
`;
