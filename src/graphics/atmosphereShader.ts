export const atmosphereShader = `
uniform vec3 atmosphere; // solar phase, seasonal declination, weather mode
uniform vec2 viewport;
const float PI=3.14159265359;
float latitudeAt(vec2 p){float t=PI*(1.0-2.0*p.y);return atan((exp(t)-exp(-t))*.5);}
vec3 sunAt(vec2 p){
 float lat=latitudeAt(p);
 float h=(p.x-.5+atmosphere.x)*2.0*PI,d=atmosphere.y;
 return vec3(-cos(d)*sin(h),cos(lat)*sin(d)-sin(lat)*cos(d)*cos(h),sin(lat)*sin(d)+cos(lat)*cos(d)*cos(h));
}
float daylight(vec3 sun){return smoothstep(-.16,.14,sun.z);}
vec3 illumination(vec3 albedo,vec3 normal,vec3 sun){
 float day=daylight(sun),direct=max(0.0,dot(normal,sun));
 vec3 ambient=mix(vec3(.15,.22,.36),vec3(.30,.37,.44),day);
 vec3 sunshine=mix(vec3(1.0,.48,.23),vec3(1.0,.96,.83),smoothstep(.05,.45,sun.z));
 return albedo*(ambient+sunshine*direct*day*.83);
}
float cloudAt(vec2 p){
 vec2 q=p*155.0+vec2(clock*.004,-clock*.0015);
 return noise(q)*.54+noise(q*2.13+13.7)*.29+noise(q*4.37)*.17;
}
vec3 weatherAt(vec2 p,float height){
 float mode=atmosphere.z;
 if(mode<.5)return vec3(0);
 float lat=latitudeAt(p);
 float cloud=cloudAt(p),storm=smoothstep(.53,.76,cloud);
 float winter=max(0.0,-sin(lat)*sin(atmosphere.y))*45.0;
 float cold=smoothstep(48.0,65.0,abs(lat)*57.2958+height*.007+winter);
 if(mode<1.5)return vec3(smoothstep(.35,.74,cloud)*.65,storm*(1.0-cold),storm*cold);
 if(mode<2.5)return vec3(.7,.85,0);
 if(mode<3.5)return vec3(.65,0,.85);
 return vec3(.85,0,0);
}
vec3 atmosphereColor(vec3 color,vec3 sun,vec3 weather){
 if(weather.x<.001&&weather.y<.001&&weather.z<.001)return color;
 float day=daylight(sun),cloud=cloudAt(uv);
 color*=1.0-weather.x*smoothstep(.3,.75,cloud)*.24;
 // Translucent cloud banks and fog preserve readable borders beneath them.
 float haze=weather.x*smoothstep(.49,.79,cloud)*.17;
 if(atmosphere.z>3.5)haze=.23+cloud*.2;
 vec3 mist=mix(vec3(.16,.23,.34),vec3(.70,.76,.78),day);
 color=mix(color,mist,haze);
 vec2 screen=gl_FragCoord.xy/max(viewport.y,1.0);
 if(weather.y>.01){
  vec2 p=screen*vec2(190.0,37.0)+vec2(clock*11.0,-clock*38.0);
  p.x+=p.y*.14;
  vec2 f=fract(p),cell=floor(p);
  float streak=(1.0-smoothstep(.018,.05,abs(f.x-.5)))*smoothstep(.12,.25,f.y)*(1.0-smoothstep(.72,.9,f.y));
  color=mix(color,mist+vec3(.13),streak*step(.66,hash(cell))*weather.y*.38);
 }
 if(weather.z>.01){
  vec2 p=screen*110.0+vec2(sin(clock*.6)*1.8,-clock*3.8);
  vec2 cell=floor(p),f=fract(p)-.5;
  float flake=(1.0-smoothstep(.025,.09,length(f)))*step(.63,hash(cell));
  color=mix(color,mix(vec3(.48,.57,.69),vec3(.96),day),flake*weather.z*.85);
 }
 return color;
}
`;
