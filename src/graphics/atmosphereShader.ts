import { WEATHER_FIELD_GLSL } from "./weather";

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
 // Moonlit night keeps nations and borders legible through the whole cycle.
 vec3 ambient=mix(vec3(.27,.33,.47),vec3(.34,.40,.46),day);
 vec3 sunshine=mix(vec3(1.0,.48,.23),vec3(1.0,.96,.83),smoothstep(.05,.45,sun.z));
 return albedo*(ambient+sunshine*direct*day*.80);
}
float cloudAt(vec2 p){
 vec2 q=p*155.0+vec2(clock*.004,-clock*.0015);
 // One warp sample shears round value-noise blobs into frontal bands.
 float w=noise(q*.35+3.1);
 q+=vec2(w,1.0-w)*1.6-.8;
 return noise(q)*.55+noise(q*2.13+13.7)*.3+noise(q*4.37+2.9)*.15;
}
${WEATHER_FIELD_GLSL}
vec3 weatherAt(vec2 p,float height){
 float mode=atmosphere.z;
 if(mode<.5)return vec3(0);
 float lat=latitudeAt(p);
 vec2 geo=vec2((p.x-.5)*360.0-atmosphere.y*15.0,lat*57.2958);
 // Ragged edges: the elliptical bank only sets where weather can form.
 float ragged=noise(geo*.22+vec2(clock*.002,0.0));
 float bank=smoothstep(.12,.8,weatherCoverage(geo)*1.15-(1.0-ragged)*.5);
 float winter=max(0.0,-sin(lat)*sin(atmosphere.y))*35.0;
 float cold=smoothstep(53.0,59.0,abs(lat)*57.2958+height*.003+winter);
 if(mode<1.5)return vec3(bank*.85,bank*(1.0-cold),bank*cold);
 if(mode<2.5)return vec3(bank*.85,bank,0);
 if(mode<3.5)return vec3(bank*.85,0,bank);
 // Fog settles in basins and along coasts rather than on ridgelines.
 return vec3(bank*(1.0-smoothstep(150.0,1400.0,height)*.75),0,0);
}
float rainLayer(vec2 s,float scale,float speed,float seed,float density){
 vec2 p=s*vec2(scale*2.6,scale);
 p.y+=clock*speed;
 p.x+=p.y*.16;
 vec2 cell=floor(p),f=fract(p);
 float x=.15+.7*hash(cell+seed+17.3),len=.28+.4*hash(cell.yx+seed*3.1);
 float y0=hash(cell+seed)*(1.0-len);
 float body=(1.0-smoothstep(.03,.085,abs(f.x-x)))*smoothstep(y0,y0+len*.7,f.y)*(1.0-smoothstep(y0+len*.85,y0+len,f.y));
 return body*step(1.0-density,hash(cell+seed+5.1));
}
float snowLayer(vec2 s,float scale,float speed,float seed,float density){
 vec2 p=s*scale+vec2(sin(clock*.5+seed)*.7,clock*speed);
 vec2 cell=floor(p),f=fract(p);
 vec2 at=vec2(hash(cell+seed),hash(cell+seed+9.7))*.64+.18;
 at.x+=sin(clock*1.2+hash(cell+2.2)*6.28)*.12;
 float size=.04+.055*hash(cell+seed+3.3);
 return (1.0-smoothstep(size*.35,size,length(f-at)))*step(1.0-density,hash(cell+seed+1.9));
}
vec3 atmosphereColor(vec3 color,vec3 sun,vec3 weather){
 if(weather.x<.001&&weather.y<.001&&weather.z<.001)return color;
 float day=daylight(sun),cloud=cloudAt(uv);
 bool fog=atmosphere.z>3.5;
 // Dense cores shade the ground beneath them; one cloud sample serves both.
 float shadow=smoothstep(.45,.8,cloud)*weather.x;
 color*=1.0-shadow*(fog?.05:.24)*day-weather.x*.06;
 vec3 deck=mix(vec3(.19,.24,.34),mix(vec3(.80,.83,.86),vec3(.96,.96,.95),smoothstep(.55,.9,cloud)),day);
 // Dense cores stay translucent so borders and provinces read beneath them.
 float cover=weather.x*smoothstep(.42,.82,cloud)*.46;
 if(fog)cover=weather.x*(.34+smoothstep(.3,.8,cloud)*.26);
 color=mix(color,deck,cover);
 vec2 screen=gl_FragCoord.xy/max(viewport.y,1.0);
 // Showers are patchy and anchored to the map; the drops are screen-space.
 float shower=.35+.65*smoothstep(.3,.72,noise(uv*520.0+vec2(clock*.012,0.0)));
 vec3 drop=mix(vec3(.42,.52,.64),vec3(.84,.90,.95),day);
 if(weather.y>.01){
  float rain=rainLayer(screen,16.0,21.0,0.0,.32)*.6+rainLayer(screen,31.0,34.0,41.0,.26)*.36;
  color=mix(color*(1.0-weather.y*.05),drop,min(1.0,rain)*weather.y*shower*.7);
 }
 if(weather.z>.01){
  float snow=snowLayer(screen,14.0,1.7,0.0,.38)+snowLayer(screen,30.0,2.9,29.0,.32)*.6;
  color=mix(color,mix(vec3(.55,.62,.74),vec3(.98),day),min(1.0,snow)*weather.z*shower*.85);
 }
 return color;
}
`;
