var BakePathTracing = pc.createScript('bakePathTracing'); BakePathTracing.attributes.add('quality', { type: 'string', default: 'maximum', title: 'Calidad', enum: [{ 'Minima': 'minimum' }, { 'Media': 'medium' }, { 'Maxima': 'maximum' }, { 'Ultrarealista': 'ultra' }] }); BakePathTracing.attributes.add('aoStrength', { type: 'number', default: 50, min: 0, max: 100, precision: 0, title: 'AO Horneado (%)' }); (function () {
    'use strict';
    var G = globalThis;
    var VERSION = '2.22.6-PT-5.3.2-HYBRID-ENV-MIS-ADAPTIVE-DIAG-FIX';
    var STATE_KEY = '__bakePathTracingPT532State';
    var CAP_NODES = '__bakePT532Nodes';
    var CAP_PASS = '__bakePT532Pass';
    var CAP_DEVICE = '__bakePT532Device';
    var CAP_PROMISE = '__bakePT532Promise';
    var CAP_HDR_USED = '__bakePT532HdrUsed';
    var CAP_AMBIENT_REPLACED = '__bakePT532AmbientReplaced';
    var GPUBufferUsageRef = G.GPUBufferUsage || { MAP_READ: 0x0001, MAP_WRITE: 0x0002, COPY_SRC: 0x0004, COPY_DST: 0x0008, INDEX: 0x0010, VERTEX: 0x0020, UNIFORM: 0x0040, STORAGE: 0x0080 };
    var GPUShaderStageRef = G.GPUShaderStage || { COMPUTE: 0x4 };
    var GPUMapModeRef = G.GPUMapMode || { READ: 0x0001, WRITE: 0x0002 };
    var DEVICE_CACHE = new WeakMap();
    var AO_DEVICE_CACHE = new WeakMap();

    var QUALITY = {
        minimum: { label: 'Minima', maxSamples: 128, minSamples: 64, perDispatch: 64, dispatchesPerSubmit: 4, noiseThreshold: 0.08, bounces: 2, leaf: 8, denoise: 2, dilation: 2, maxRadiance: 32, normalPower: 96, positionScale: 1.5, colorScale: 0.45, envResolution: 64, materialResolution: 64, aoSamples: 64, aoBatch: 32, aoDispatchesPerSubmit: 8, aoContactRadiusFraction: 0.015, aoCavityRadiusFraction: 0.045, aoIndirectStrength: 0.72, aoContactStrength: 0.12 },
        medium: { label: 'Media', maxSamples: 512, minSamples: 128, perDispatch: 128, dispatchesPerSubmit: 4, noiseThreshold: 0.04, bounces: 3, leaf: 6, denoise: 2, dilation: 3, maxRadiance: 64, normalPower: 128, positionScale: 1.25, colorScale: 0.35, envResolution: 128, materialResolution: 128, aoSamples: 128, aoBatch: 32, aoDispatchesPerSubmit: 8, aoContactRadiusFraction: 0.015, aoCavityRadiusFraction: 0.045, aoIndirectStrength: 0.72, aoContactStrength: 0.12 },
        maximum: { label: 'Maxima', maxSamples: 2048, minSamples: 256, perDispatch: 256, dispatchesPerSubmit: 4, noiseThreshold: 0.015, bounces: 5, leaf: 4, denoise: 1, dilation: 4, maxRadiance: 128, normalPower: 160, positionScale: 1.0, colorScale: 0.25, envResolution: 256, materialResolution: 256, aoSamples: 512, aoBatch: 64, aoDispatchesPerSubmit: 8, aoContactRadiusFraction: 0.015, aoCavityRadiusFraction: 0.045, aoIndirectStrength: 0.72, aoContactStrength: 0.12 },
        ultra: { label: 'Ultrarealista', maxSamples: 4096, minSamples: 1024, perDispatch: 256, dispatchesPerSubmit: 4, noiseThreshold: 0.01, bounces: 8, leaf: 4, denoise: 1, dilation: 4, maxRadiance: 256, normalPower: 192, positionScale: 0.8, colorScale: 0.18, envResolution: 256, materialResolution: 512, aoSamples: 1024, aoBatch: 64, aoDispatchesPerSubmit: 8, aoContactRadiusFraction: 0.015, aoCavityRadiusFraction: 0.045, aoIndirectStrength: 0.72, aoContactStrength: 0.12 }
    };
    function preset(owner) { return QUALITY[owner && owner.quality] || QUALITY.maximum; }
    function getState() { var s = G[STATE_KEY]; if (!s) { s = { installed: false, owner: null, epoch: 0, nativeBake: null, nativePost: null, patchedBake: null, patchedPost: null }; G[STATE_KEY] = s; } return s; }
    function log() { var a = Array.prototype.slice.call(arguments); a.unshift('[BakePT5.3.2]'); console.log.apply(console, a); }
    function warn() { var a = Array.prototype.slice.call(arguments); a.unshift('[BakePT5.3.2]'); console.warn.apply(console, a); }
    function fail() { var a = Array.prototype.slice.call(arguments); a.unshift('[BakePT5.3.2]'); console.error.apply(console, a); }
    function now() { return G.performance && typeof G.performance.now === 'function' ? G.performance.now() : Date.now(); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
    function srgbToLinear1(v) { v = Math.max(0, v); return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    function linearToSrgb1(v) { v = clamp(v, 0, 1); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
    function luminance(r, g, b) { return r * 0.2126 + g * 0.7152 + b * 0.0722; }
    function fmt(a, d) { d = d === undefined ? 3 : d; return '[' + Array.prototype.map.call(a, function (v) { return Number(v).toFixed(d); }).join(', ') + ']'; }
    function active(owner, epoch) { var s = getState(); return !!(s.installed && s.owner === owner && owner && owner.enabled && s.epoch === epoch); }
    function nativeGPUDevice(gd) { if (!gd) return null; var c = [gd.wgpu, gd._wgpu, gd.impl && gd.impl.wgpu, gd.impl && gd.impl._wgpu, gd.device, gd._device, gd.impl && gd.impl.device, gd.impl && gd.impl._device]; for (var i = 0; i < c.length; i++) { var d = c[i]; if (d && typeof d.createCommandEncoder === 'function' && typeof d.createShaderModule === 'function' && typeof d.createBuffer === 'function') return d; } return null; }
    function webgpuOK(gd) { return !!(gd && (gd.isWebGPU === true || gd.deviceType === 'webgpu' || (gd.supportsCompute && nativeGPUDevice(gd)))); }

    var WGSL = `
const PI:f32=3.14159265358979323846;
struct Params{width:u32,height:u32,triCount:u32,bvhCount:u32,lightCount:u32,sampleCount:u32,maxSamples:u32,minSamples:u32,maxBounces:u32,seed:u32,envFaceSize:u32,envCount:u32,ambient:vec4f,rayBias:f32,maxRadiance:f32,noiseThreshold:f32,envIntensity:f32,envMode:u32,adaptive:u32,customEnvDirect:u32,pad1:u32,envRot0:vec4f,envRot1:vec4f,envRot2:vec4f,envControl:vec4f};
struct GBuf{pos:vec4f,nrm:vec4f,du:vec4f,dv:vec4f};
struct Tri{
v0:vec4f,e1:vec4f,e2:vec4f,n0:vec4f,n1:vec4f,n2:vec4f,
albedo:vec4f,emission:vec4f,
uv0_01:vec4f,uv0_2:vec4f,uv1_01:vec4f,uv1_2:vec4f,
diffInfo:vec4f,diffXform:vec4f,diffMisc:vec4f,
emisInfo:vec4f,emisXform:vec4f,emisMisc:vec4f,
metalInfo:vec4f,metalXform:vec4f,metalMisc:vec4f
};
struct BvhNode{minLeft:vec4f,maxRight:vec4f,range:vec4f};
struct Light{posType:vec4f,colorRange:vec4f,axisFalloff:vec4f,shapeShadow:vec4f,axisX:vec4f,axisY:vec4f,axisZ:vec4f,cone:vec4f};
struct EnvAlias{q:f32,aliasIndex:f32,mass:f32,pad:f32};
struct Hit{t:f32,u:f32,v:f32,index:i32};
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var<storage,read> gbuf:array<GBuf>;
@group(0) @binding(2) var<storage,read> tris:array<Tri>;
@group(0) @binding(3) var<storage,read> bvh:array<BvhNode>;
@group(0) @binding(4) var<storage,read> lights:array<Light>;
@group(0) @binding(5) var<storage,read> pixelPool:array<vec4f>;
@group(0) @binding(6) var<storage,read> envAlias:array<EnvAlias>;
@group(0) @binding(7) var<storage,read_write> stats:array<vec4f>;
@group(0) @binding(8) var<storage,read_write> outPixels:array<vec4f>;
var<private> sampleOrdinal:u32;
var<private> sampleDimension:u32;
var<private> sampleSeed:u32;

fn pcgHash(v:u32)->u32{let state=v*747796405u+2891336453u;let word=(((state>>((state>>28u)+4u))^state)*277803737u);return(word>>22u)^word;}
fn rand()->f32{let d=sampleDimension;sampleDimension=d+1u;let h=pcgHash(sampleSeed^pcgHash(sampleOrdinal*0x9E3779B9u+0x85EBCA6Bu)^pcgHash(d*0xC2B2AE35u+0x27D4EB2Fu));return(f32(h)+0.5)*(1.0/4294967296.0);}
fn powerHeuristic(a:f32,b:f32)->f32{let aa=a*a;let bb=b*b;return aa/max(aa+bb,1.0e-20);}
fn makeBasis(n:vec3f)->mat3x3f{let s=select(-1.0,1.0,n.z>=0.0);let a=-1.0/(s+n.z);let b=n.x*n.y*a;let t=vec3f(1.0+s*n.x*n.x*a,s*b,-s*n.x);let bt=vec3f(b,s+n.y*n.y*a,-n.y);return mat3x3f(t,bt,n);}
fn cosineSample(n:vec3f)->vec3f{let u1=rand();let u2=rand();let phi=2.0*PI*u1;let r=sqrt(u2);let local=vec3f(r*cos(phi),r*sin(phi),sqrt(max(0.0,1.0-u2)));return normalize(makeBasis(n)*local);}
fn randomSphere()->vec3f{let z=1.0-2.0*rand();let r=sqrt(max(0.0,1.0-z*z));let a=2.0*PI*rand();return vec3f(r*cos(a),z,r*sin(a));}
fn sampleDisk()->vec2f{let r=sqrt(rand());let a=2.0*PI*rand();return vec2f(r*cos(a),r*sin(a));}
fn jitterDirectional(dir:vec3f,tanRadius:f32)->vec3f{if(tanRadius<=0.0){return dir;}let b=makeBasis(dir);let q=sampleDisk()*tanRadius;return normalize(dir+b[0]*q.x+b[1]*q.y);}
fn intersectTri(ro:vec3f,rd:vec3f,tri:Tri,tMax:f32)->vec3f{let p=cross(rd,tri.e2.xyz);let det=dot(tri.e1.xyz,p);if(abs(det)<1.0e-10){return vec3f(-1.0);}let inv=1.0/det;let s=ro-tri.v0.xyz;let u=dot(s,p)*inv;if(u<0.0||u>1.0){return vec3f(-1.0);}let q=cross(s,tri.e1.xyz);let v=dot(rd,q)*inv;if(v<0.0||u+v>1.0){return vec3f(-1.0);}let t=dot(tri.e2.xyz,q)*inv;if(t<=1.0e-6||t>=tMax){return vec3f(-1.0);}return vec3f(t,u,v);}
fn safeInv(v:f32)->f32{if(abs(v)<1.0e-20){return select(-1.0e30,1.0e30,v>=0.0);}return 1.0/v;}
fn hitAabb(ro:vec3f,rd:vec3f,bmin:vec3f,bmax:vec3f,tMax:f32)->bool{let inv=vec3f(safeInv(rd.x),safeInv(rd.y),safeInv(rd.z));let t0=(bmin-ro)*inv;let t1=(bmax-ro)*inv;let mn=min(t0,t1);let mx=max(t0,t1);let nearT=max(max(mn.x,mn.y),max(mn.z,0.0));let farT=min(min(mx.x,mx.y),mx.z);return nearT<=farT&&nearT<tMax;}
fn traceClosest(ro:vec3f,rd:vec3f)->Hit{var best=Hit(1.0e30,0.0,0.0,-1);if(params.bvhCount==0u){return best;}var stack:array<i32,64>;var sp:i32=0;stack[0]=0;loop{if(sp<0){break;}let ni=stack[u32(sp)];sp=sp-1;if(ni<0||u32(ni)>=params.bvhCount){continue;}let node=bvh[u32(ni)];if(!hitAabb(ro,rd,node.minLeft.xyz,node.maxRight.xyz,best.t)){continue;}let count=i32(node.range.y+0.5);if(count>0){let start=u32(node.range.x+0.5);for(var j=0u;j<u32(count);j=j+1u){let ti=start+j;if(ti>=params.triCount){break;}let hv=intersectTri(ro,rd,tris[ti],best.t);if(hv.x>0.0){best=Hit(hv.x,hv.y,hv.z,i32(ti));}}}else if(sp<61){let left=i32(node.minLeft.w);let right=i32(node.maxRight.w);if(right>=0){sp=sp+1;stack[u32(sp)]=right;}if(left>=0){sp=sp+1;stack[u32(sp)]=left;}}}return best;}
fn occluded(ro:vec3f,rd:vec3f,tMax:f32)->bool{if(params.bvhCount==0u){return false;}var stack:array<i32,64>;var sp:i32=0;stack[0]=0;loop{if(sp<0){break;}let ni=stack[u32(sp)];sp=sp-1;if(ni<0||u32(ni)>=params.bvhCount){continue;}let node=bvh[u32(ni)];if(!hitAabb(ro,rd,node.minLeft.xyz,node.maxRight.xyz,tMax)){continue;}let count=i32(node.range.y+0.5);if(count>0){let start=u32(node.range.x+0.5);for(var j=0u;j<u32(count);j=j+1u){let ti=start+j;if(ti>=params.triCount){break;}let tri=tris[ti];if(tri.albedo.w<0.5){continue;}if(intersectTri(ro,rd,tri,tMax).x>0.0){return true;}}}else if(sp<61){let left=i32(node.minLeft.w);let right=i32(node.maxRight.w);if(right>=0){sp=sp+1;stack[u32(sp)]=right;}if(left>=0){sp=sp+1;stack[u32(sp)]=left;}}}return false;}
fn geometricNormal(tri:Tri,incoming:vec3f)->vec3f{var gn=normalize(cross(tri.e1.xyz,tri.e2.xyz));if(dot(gn,incoming)>0.0){gn=-gn;}return gn;}
fn shadingNormal(tri:Tri,u:f32,v:f32,incoming:vec3f)->vec3f{let w=1.0-u-v;var sn=normalize(tri.n0.xyz*w+tri.n1.xyz*u+tri.n2.xyz*v);let gn=geometricNormal(tri,incoming);if(dot(sn,gn)<0.0){sn=-sn;}return normalize(sn);}

fn uvFor(tri:Tri,u:f32,v:f32,uvSet:u32)->vec2f{
let w=1.0-u-v;
if(uvSet==1u){let a=tri.uv1_01.xy;let b=tri.uv1_01.zw;let c=tri.uv1_2.xy;return a*w+b*u+c*v;}
let a=tri.uv0_01.xy;let b=tri.uv0_01.zw;let c=tri.uv0_2.xy;return a*w+b*u+c*v;
}
fn wrapCoord(x:f32,mode:u32)->f32{
if(mode==1u){return clamp(x,0.0,0.999999);}
if(mode==2u){let k=floor(x);let f=fract(x);let odd=(i32(k)&1)!=0;return select(f,1.0-f,odd);}
return fract(x);
}
fn transformUv(uv:vec2f,xform:vec4f,rotation:f32)->vec2f{
var q=uv*xform.xy+xform.zw;
if(abs(rotation)>1.0e-7){let c=cos(rotation);let s=sin(rotation);q=q-vec2f(0.5);q=vec2f(c*q.x-s*q.y,s*q.x+c*q.y)+vec2f(0.5);}
return q;
}
fn channel3(c:vec4f,code:u32)->vec3f{
let c0=code&3u;let c1=(code>>2u)&3u;let c2=(code>>4u)&3u;
return vec3f(c[c0],c[c1],c[c2]);
}
fn channel1(c:vec4f,code:u32)->f32{return c[code&3u];}
fn sampleTextureLinear(info:vec4f,xform:vec4f,misc:vec4f,uvIn:vec2f)->vec4f{
if(info.x<0.0||info.y<1.0||info.z<1.0){return vec4f(1.0);}
let width=u32(info.y+0.5);let height=u32(info.z+0.5);let offset=u32(info.x+0.5);
let addrU=u32(info.w+0.5);let addrV=u32(misc.x+0.5);
let uv=transformUv(uvIn,xform,misc.y);
let u=wrapCoord(uv.x,addrU);let v=wrapCoord(uv.y,addrV);
let xf=clamp(u*f32(width)-0.5,0.0,f32(width-1u));let yf=clamp(v*f32(height)-0.5,0.0,f32(height-1u));
let x0=u32(floor(xf));let y0=u32(floor(yf));let x1=min(x0+1u,width-1u);let y1=min(y0+1u,height-1u);
let fx=fract(xf);let fy=fract(yf);
let c00=pixelPool[offset+y0*width+x0];let c10=pixelPool[offset+y0*width+x1];let c01=pixelPool[offset+y1*width+x0];let c11=pixelPool[offset+y1*width+x1];
return mix(mix(c00,c10,fx),mix(c01,c11,fx),fy);
}
fn surfaceAlbedo(tri:Tri,u:f32,v:f32)->vec3f{
var a=tri.albedo.xyz;
if(tri.diffInfo.x>=0.0){let uv=uvFor(tri,u,v,u32(tri.diffMisc.z+0.5));let t=sampleTextureLinear(tri.diffInfo,tri.diffXform,tri.diffMisc,uv);a=a*channel3(t,u32(tri.diffMisc.w+0.5));}
var metal=clamp(tri.emission.w,0.0,1.0);
if(tri.metalInfo.x>=0.0){let uv=uvFor(tri,u,v,u32(tri.metalMisc.z+0.5));let t=sampleTextureLinear(tri.metalInfo,tri.metalXform,tri.metalMisc,uv);metal=clamp(metal*channel1(t,u32(tri.metalMisc.w+0.5)),0.0,1.0);}
return max(a*(1.0-metal),vec3f(0.0));
}
fn surfaceEmission(tri:Tri,u:f32,v:f32)->vec3f{
var e=tri.emission.xyz;
if(tri.emisInfo.x>=0.0){let uv=uvFor(tri,u,v,u32(tri.emisMisc.z+0.5));let t=sampleTextureLinear(tri.emisInfo,tri.emisXform,tri.emisMisc,uv);e=e*channel3(t,u32(tri.emisMisc.w+0.5));}
return max(e,vec3f(0.0));
}

fn sourcePoint(lt:Light)->vec3f{let shape=u32(lt.shapeShadow.x+0.5);let c=lt.posType.xyz;if(shape==0u){return c;}if(shape==1u){let a=rand()*2.0-1.0;let b=rand()*2.0-1.0;return c+lt.axisX.xyz*(a*lt.axisX.w)+lt.axisZ.xyz*(b*lt.axisZ.w);}if(shape==2u){let q=sampleDisk();return c+lt.axisX.xyz*(q.x*lt.axisX.w)+lt.axisZ.xyz*(q.y*lt.axisZ.w);}let q=randomSphere();return c+lt.axisX.xyz*(q.x*lt.axisX.w)+lt.axisY.xyz*(q.y*lt.axisY.w)+lt.axisZ.xyz*(q.z*lt.axisZ.w);}
fn directLights(p:vec3f,n:vec3f,offsetN:vec3f)->vec3f{var sum=vec3f(0.0);for(var i=0u;i<params.lightCount;i=i+1u){let lt=lights[i];let kind=u32(lt.posType.w+0.5);let casts=lt.shapeShadow.y>0.5;let shadowIntensity=clamp(lt.shapeShadow.w,0.0,1.0);var L=vec3f(0.0,1.0,0.0);var dist=1.0e30;var atten=1.0;if(kind==0u){L=jitterDirectional(normalize(lt.posType.xyz),lt.shapeShadow.z);}else{let lp=sourcePoint(lt);let d=lp-p;dist=length(d);if(dist<1.0e-5){continue;}L=d/dist;let range=max(lt.colorRange.w,1.0e-4);if(dist>=range){continue;}if(u32(lt.axisFalloff.w+0.5)==0u){atten=max((range-dist)/range,0.0);}else{let rr=dist/range;let f=clamp(1.0-rr*rr*rr*rr,0.0,1.0);atten=(1.0/max(dist*dist+1.0,1.0e-4))*f*f;}if(kind==2u){let ca=dot(normalize(lt.axisFalloff.xyz),-L);atten=atten*smoothstep(lt.cone.y,lt.cone.x,ca);}}let ndl=dot(n,L);if(ndl<=0.0||atten<=0.0){continue;}var vis=1.0;if(casts){let ro=p+offsetN*params.rayBias;let tMax=select(1.0e30,max(params.rayBias,dist-params.rayBias),kind!=0u);if(occluded(ro,L,tMax)){vis=1.0-shadowIntensity;}}sum=sum+lt.colorRange.xyz*(ndl*atten*vis);}return min(sum,vec3f(params.maxRadiance));}
fn worldToEnvDir(d:vec3f)->vec3f{return normalize(vec3f(dot(params.envRot0.xyz,d),dot(params.envRot1.xyz,d),dot(params.envRot2.xyz,d)));}
fn envToWorldDir(d:vec3f)->vec3f{return normalize(params.envRot0.xyz*d.x+params.envRot1.xyz*d.y+params.envRot2.xyz*d.z);}
fn cubeFaceUv(d:vec3f)->vec3f{let a=abs(d);var face=0.0;var s=0.0;var t=0.0;if(a.x>=a.y&&a.x>=a.z){if(d.x>=0.0){face=0.0;s=-d.z/a.x;t=-d.y/a.x;}else{face=1.0;s=d.z/a.x;t=-d.y/a.x;}}else if(a.y>=a.z){if(d.y>=0.0){face=2.0;s=d.x/a.y;t=d.z/a.y;}else{face=3.0;s=d.x/a.y;t=-d.z/a.y;}}else{if(d.z>=0.0){face=4.0;s=d.x/a.z;t=-d.y/a.z;}else{face=5.0;s=-d.x/a.z;t=-d.y/a.z;}}return vec3f(face,s*0.5+0.5,t*0.5+0.5);}
fn faceUvDir(face:u32,u:f32,v:f32)->vec3f{let s=u*2.0-1.0;let t=v*2.0-1.0;var d=vec3f(0.0,1.0,0.0);switch face{case 0u:{d=vec3f(1.0,-t,-s);}case 1u:{d=vec3f(-1.0,-t,s);}case 2u:{d=vec3f(s,1.0,t);}case 3u:{d=vec3f(s,-1.0,-t);}case 4u:{d=vec3f(s,-t,1.0);}default:{d=vec3f(-s,-t,-1.0);}}return normalize(d);}
fn envIndex(face:u32,x:u32,y:u32)->u32{let n=params.envFaceSize;return face*n*n+y*n+x;}
fn environmentAllowed(worldDir:vec3f)->bool{return worldDir.y>=params.envControl.x;}
fn environmentRadiance(worldDir:vec3f)->vec3f{if(params.envMode==0u||!environmentAllowed(worldDir)){return vec3f(0.0);}if(params.envMode==2u){return params.ambient.xyz;}let n=params.envFaceSize;if(n==0u){return vec3f(0.0);}let local=worldToEnvDir(worldDir);let fuv=cubeFaceUv(local);let face=u32(fuv.x+0.5);let xf=clamp(fuv.y*f32(n)-0.5,0.0,f32(n-1u));let yf=clamp(fuv.z*f32(n)-0.5,0.0,f32(n-1u));let x0=u32(floor(xf));let y0=u32(floor(yf));let x1=min(x0+1u,n-1u);let y1=min(y0+1u,n-1u);let fx=fract(xf);let fy=fract(yf);let c00=pixelPool[envIndex(face,x0,y0)];let c10=pixelPool[envIndex(face,x1,y0)];let c01=pixelPool[envIndex(face,x0,y1)];let c11=pixelPool[envIndex(face,x1,y1)];let c0=mix(c00.xyz,c10.xyz,fx);let c1=mix(c01.xyz,c11.xyz,fx);return min(mix(c0,c1,fy)*params.envIntensity,vec3f(params.maxRadiance));}
fn environmentPdf(worldDir:vec3f)->f32{if(params.envMode!=1u||params.envCount==0u||!environmentAllowed(worldDir)){return 0.0;}let n=params.envFaceSize;let local=worldToEnvDir(worldDir);let fuv=cubeFaceUv(local);let face=u32(fuv.x+0.5);let x=min(u32(clamp(fuv.y,0.0,0.999999)*f32(n)),n-1u);let y=min(u32(clamp(fuv.z,0.0,0.999999)*f32(n)),n-1u);let idx=envIndex(face,x,y);let mass=envAlias[idx].mass;if(mass<=0.0){return 0.0;}let s=fuv.y*2.0-1.0;let t=fuv.z*2.0-1.0;let jacobian=1.0/pow(1.0+s*s+t*t,1.5);let uvArea=4.0/(f32(n)*f32(n));return mass/max(uvArea*jacobian,1.0e-12);}

fn sampleEnvironmentDirection()->vec4f{
    if(params.envMode!=1u||params.envCount==0u){
        return vec4f(0.0,1.0,0.0,0.0);
    }

    let count=params.envCount;
    let column=min(u32(rand()*f32(count)),count-1u);
    let entry=envAlias[column];

    let idx=select(
        u32(entry.aliasIndex+0.5),
        column,
        rand()<entry.q
    );

    let n=params.envFaceSize;
    let facePixels=n*n;
    let face=idx/facePixels;

    // ESTA ERA LA LINEA QUE FALTABA
    let localIndex=idx-face*facePixels;

    let y=localIndex/n;
    let x=localIndex-y*n;

    let u=(f32(x)+rand())/f32(n);
    let v=(f32(y)+rand())/f32(n);

    let localDir=faceUvDir(face,u,v);
    let worldDir=envToWorldDir(localDir);

    let s=u*2.0-1.0;
    let t=v*2.0-1.0;
    let jacobian=1.0/pow(1.0+s*s+t*t,1.5);
    let uvArea=4.0/(f32(n)*f32(n));

    let mass=envAlias[idx].mass;
    let pdf=mass/max(uvArea*jacobian,1.0e-12);

    return vec4f(worldDir,pdf);
}

fn environmentDirect(p:vec3f,n:vec3f,offsetN:vec3f,useMis:bool)->vec3f{if(params.envMode==0u){return vec3f(0.0);}if(params.envMode==2u){return PI*params.ambient.xyz;}let s=sampleEnvironmentDirection();let L=s.xyz;let pdfEnv=s.w;if(pdfEnv<=0.0){return vec3f(0.0);}let cosTheta=max(dot(n,L),0.0);if(cosTheta<=0.0){return vec3f(0.0);}let ro=p+offsetN*params.rayBias;if(occluded(ro,L,1.0e30)){return vec3f(0.0);}let pdfBsdf=cosTheta/PI;let w=select(1.0,powerHeuristic(pdfEnv,pdfBsdf),useMis);return environmentRadiance(L)*(cosTheta/pdfEnv)*w;}
fn decodeOct(e:vec2f)->vec3f{var f=e*2.0-1.0;var n=vec3f(f.x,f.y,1.0-abs(f.x)-abs(f.y));if(n.z<0.0){let ox=n.x;let oy=n.y;n.x=(1.0-abs(oy))*select(-1.0,1.0,ox>=0.0);n.y=(1.0-abs(ox))*select(-1.0,1.0,oy>=0.0);}return normalize(n);}
fn shadeIndirect(receiverP:vec3f,receiverN:vec3f)->vec3f{
var e=vec3f(0.0);var throughput=vec3f(1.0);var origin=receiverP+receiverN*params.rayBias;var surfaceN=receiverN;var rd=cosineSample(surfaceN);var h=traceClosest(origin,rd);
if(h.index<0){if(params.customEnvDirect!=0u&&params.envMode==1u&&params.envControl.y<=1.0e-6&&environmentAllowed(rd)){let cosTheta=max(dot(surfaceN,rd),0.0);let pdfBsdf=cosTheta/PI;let pdfEnv=environmentPdf(rd);let w=powerHeuristic(pdfBsdf,pdfEnv);return environmentRadiance(rd)*PI*w;}return vec3f(0.0);}
for(var bounce=0u;bounce<params.maxBounces;bounce=bounce+1u){
let tri=tris[u32(h.index)];let hp=origin+rd*h.t;let gn=geometricNormal(tri,rd);let hn=shadingNormal(tri,h.u,h.v,rd);
e=e+throughput*surfaceEmission(tri,h.u,h.v)*PI;
throughput=throughput*surfaceAlbedo(tri,h.u,h.v);
e=e+throughput*directLights(hp,hn,gn);
e=e+throughput*environmentDirect(hp,hn,gn,true);
if(bounce>=2u){let survive=clamp(max(throughput.x,max(throughput.y,throughput.z)),0.10,0.95);if(rand()>survive){break;}throughput=throughput/survive;}
origin=hp+gn*params.rayBias;surfaceN=hn;rd=cosineSample(surfaceN);let nextHit=traceClosest(origin,rd);
if(nextHit.index<0){if(params.envMode==1u&&environmentAllowed(rd)){let cosTheta=max(dot(surfaceN,rd),0.0);let pdfBsdf=cosTheta/PI;let pdfEnv=environmentPdf(rd);let w=powerHeuristic(pdfBsdf,pdfEnv);e=e+throughput*environmentRadiance(rd)*PI*w;}break;}h=nextHit;}
return min(e,vec3f(params.maxRadiance));
}
fn primaryJitter(sampleIndex:u32)->vec2f{let n=max(1u,u32(ceil(sqrt(f32(params.maxSamples)))));let sx=sampleIndex%n;let sy=(sampleIndex/n)%n;return(vec2f(f32(sx)+rand(),f32(sy)+rand())/f32(n))-vec2f(0.5);}
fn luma(c:vec3f)->f32{return dot(c,vec3f(0.2126,0.7152,0.0722));}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid:vec3u){
if(gid.x>=params.width||gid.y>=params.height){return;}
let idx=gid.y*params.width+gid.x;let gb=gbuf[idx];if(gb.pos.w<0.5){return;}
var st=stats[idx];if(st.w>0.5){return;}
var accum=outPixels[idx];var rgbSum=accum.xyz;var count=u32(max(st.z,0.0)+0.5);var sumLum=st.x;var sumLum2=st.y;
let nrm=normalize(gb.nrm.xyz);let bent=decodeOct(vec2f(gb.du.w,gb.dv.w));let bentStrength=clamp(params.envControl.y,0.0,1.0);let envN=normalize(mix(nrm,bent,bentStrength));
for(var s=0u;s<params.sampleCount;s=s+1u){
if(count>=params.maxSamples){break;}
sampleOrdinal=count;sampleDimension=0u;sampleSeed=pcgHash(idx*9781u+params.seed*26699u+1u);
var p=gb.pos.xyz;if(gb.pos.w<1.5){let j=primaryJitter(sampleOrdinal);p=p+gb.du.xyz*(j.x/f32(params.width))+gb.dv.xyz*(j.y/f32(params.height));}
var c=shadeIndirect(p,nrm);if(params.customEnvDirect!=0u&&params.envMode!=0u){let primaryUseMis=bentStrength<=1.0e-6;c=c+environmentDirect(p,envN,nrm,primaryUseMis);}
rgbSum=rgbSum+c;let y=luma(c);sumLum=sumLum+y;sumLum2=sumLum2+y*y;count=count+1u;
}
var converged=0.0;
if(count>=params.maxSamples){converged=1.0;}
else if(params.adaptive!=0u&&count>=params.minSamples){let nf=f32(count);let mean=sumLum/nf;let variance=max(sumLum2/nf-mean*mean,0.0);let stdError=sqrt(variance/nf);let relativeError=stdError/max(abs(mean),0.02);if(relativeError<=params.noiseThreshold){converged=1.0;}}
stats[idx]=vec4f(sumLum,sumLum2,f32(count),converged);outPixels[idx]=vec4f(rgbSum,f32(count));
}`;

    var AO_WGSL = `
struct AOParams{width:u32,height:u32,triCount:u32,bvhCount:u32,sampleCount:u32,maxSamples:u32,seed:u32,pad0:u32,controls0:vec4f,controls1:vec4f};
struct GBuf{pos:vec4f,nrm:vec4f,du:vec4f,dv:vec4f};
struct Tri{
v0:vec4f,e1:vec4f,e2:vec4f,n0:vec4f,n1:vec4f,n2:vec4f,
albedo:vec4f,emission:vec4f,
uv0_01:vec4f,uv0_2:vec4f,uv1_01:vec4f,uv1_2:vec4f,
diffInfo:vec4f,diffXform:vec4f,diffMisc:vec4f,
emisInfo:vec4f,emisXform:vec4f,emisMisc:vec4f,
metalInfo:vec4f,metalXform:vec4f,metalMisc:vec4f
};
struct BvhNode{minLeft:vec4f,maxRight:vec4f,range:vec4f};
struct Hit{t:f32,u:f32,v:f32,index:i32};
@group(0) @binding(0) var<uniform> params:AOParams;
@group(0) @binding(1) var<storage,read> gbuf:array<GBuf>;
@group(0) @binding(2) var<storage,read> tris:array<Tri>;
@group(0) @binding(3) var<storage,read> bvh:array<BvhNode>;
@group(0) @binding(4) var<storage,read_write> outAO:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> outBent:array<vec4f>;
var<private> sampleOrdinal:u32;
var<private> sampleDimension:u32;
var<private> sampleSeed:u32;
fn pcgHash(v:u32)->u32{let state=v*747796405u+2891336453u;let word=(((state>>((state>>28u)+4u))^state)*277803737u);return(word>>22u)^word;}
fn rand()->f32{let d=sampleDimension;sampleDimension=d+1u;let h=pcgHash(sampleSeed^pcgHash(sampleOrdinal*0x9E3779B9u+0x85EBCA6Bu)^pcgHash(d*0xC2B2AE35u+0x27D4EB2Fu));return(f32(h)+0.5)*(1.0/4294967296.0);}
fn makeBasis(n:vec3f)->mat3x3f{let s=select(-1.0,1.0,n.z>=0.0);let a=-1.0/(s+n.z);let b=n.x*n.y*a;let t=vec3f(1.0+s*n.x*n.x*a,s*b,-s*n.x);let bt=vec3f(b,s+n.y*n.y*a,-n.y);return mat3x3f(t,bt,n);}
fn cosineSample(n:vec3f)->vec3f{let u1=rand();let u2=rand();let phi=6.283185307179586*u1;let r=sqrt(u2);let local=vec3f(r*cos(phi),r*sin(phi),sqrt(max(0.0,1.0-u2)));return normalize(makeBasis(n)*local);}
fn intersectTri(ro:vec3f,rd:vec3f,tri:Tri,tMax:f32)->vec3f{let p=cross(rd,tri.e2.xyz);let det=dot(tri.e1.xyz,p);if(abs(det)<1.0e-10){return vec3f(-1.0);}let inv=1.0/det;let s=ro-tri.v0.xyz;let u=dot(s,p)*inv;if(u<0.0||u>1.0){return vec3f(-1.0);}let q=cross(s,tri.e1.xyz);let v=dot(rd,q)*inv;if(v<0.0||u+v>1.0){return vec3f(-1.0);}let t=dot(tri.e2.xyz,q)*inv;if(t<=1.0e-6||t>=tMax){return vec3f(-1.0);}return vec3f(t,u,v);}
fn safeInv(v:f32)->f32{if(abs(v)<1.0e-20){return select(-1.0e30,1.0e30,v>=0.0);}return 1.0/v;}
fn hitAabb(ro:vec3f,rd:vec3f,bmin:vec3f,bmax:vec3f,tMax:f32)->bool{let inv=vec3f(safeInv(rd.x),safeInv(rd.y),safeInv(rd.z));let t0=(bmin-ro)*inv;let t1=(bmax-ro)*inv;let mn=min(t0,t1);let mx=max(t0,t1);let nearT=max(max(mn.x,mn.y),max(mn.z,0.0));let farT=min(min(mx.x,mx.y),mx.z);return nearT<=farT&&nearT<tMax;}
fn traceClosestMax(ro:vec3f,rd:vec3f,tLimit:f32)->Hit{var best=Hit(tLimit,0.0,0.0,-1);if(params.bvhCount==0u){return best;}var stack:array<i32,64>;var sp:i32=0;stack[0]=0;loop{if(sp<0){break;}let ni=stack[u32(sp)];sp=sp-1;if(ni<0||u32(ni)>=params.bvhCount){continue;}let node=bvh[u32(ni)];if(!hitAabb(ro,rd,node.minLeft.xyz,node.maxRight.xyz,best.t)){continue;}let count=i32(node.range.y+0.5);if(count>0){let start=u32(node.range.x+0.5);for(var j=0u;j<u32(count);j=j+1u){let ti=start+j;if(ti>=params.triCount){break;}let tri=tris[ti];if(tri.albedo.w<0.5){continue;}let hv=intersectTri(ro,rd,tri,best.t);if(hv.x>0.0){best=Hit(hv.x,hv.y,hv.z,i32(ti));}}}else if(sp<61){let left=i32(node.minLeft.w);let right=i32(node.maxRight.w);if(right>=0){sp=sp+1;stack[u32(sp)]=right;}if(left>=0){sp=sp+1;stack[u32(sp)]=left;}}}return best;}
fn smoothVisibility(t:f32,r:f32)->f32{if(t>=r){return 1.0;}let x=clamp(t/max(r,1.0e-6),0.0,1.0);return x*x*(3.0-2.0*x);}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid:vec3u){
if(gid.x>=params.width||gid.y>=params.height){return;}
let idx=gid.y*params.width+gid.x;let gb=gbuf[idx];if(gb.pos.w<0.5){return;}
var acc=outAO[idx];var bentAcc=outBent[idx];var contactSum=acc.x;var cavitySum=acc.y;var count=u32(acc.w+0.5);if(count>=params.maxSamples){return;}
let n=normalize(gb.nrm.xyz);let footprint=max(length(gb.du.xyz)/f32(params.width),length(gb.dv.xyz)/f32(params.height));let sceneExtent=max(params.controls0.y,1.0e-4);
let contactDesired=sceneExtent*params.controls0.z;let cavityDesired=sceneExtent*params.controls0.w;
let contactRadius=clamp(contactDesired,max(footprint*2.0,params.controls0.x*8.0),max(footprint*10.0,params.controls0.x*16.0));
let cavityRadius=clamp(cavityDesired,max(contactRadius*2.0,footprint*5.0),max(footprint*24.0,params.controls0.x*32.0));
let origin=gb.pos.xyz+n*params.controls0.x;
for(var s=0u;s<params.sampleCount;s=s+1u){
if(count>=params.maxSamples){break;}
sampleOrdinal=count;sampleDimension=0u;sampleSeed=pcgHash(idx*9781u+params.seed*26699u+1u);
let d=cosineSample(n);let h=traceClosestMax(origin,d,cavityRadius);var cv=1.0;var vv=1.0;if(h.index>=0){cv=smoothVisibility(h.t,contactRadius);vv=smoothVisibility(h.t,cavityRadius);}
contactSum=contactSum+cv;cavitySum=cavitySum+vv;bentAcc=bentAcc+vec4f(d*vv,vv);count=count+1u;
}
outAO[idx]=vec4f(contactSum,cavitySum,cavityRadius,f32(count));outBent[idx]=bentAcc;
}`;

    function normalMatrix(m) { var a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10]; var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g), GG = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d; var det = a * A + b * B + c * C; if (Math.abs(det) < 1e-20) det = 1; return [A / det, B / det, C / det, D / det, E / det, F / det, GG / det, H / det, I / det]; }
    function rootOf(lm) { if (lm && lm.root && typeof lm.root.findComponents === 'function') return { root: lm.root, source: 'lightmapper.root' }; try { var app = pc.Application && typeof pc.Application.getApplication === 'function' ? pc.Application.getApplication() : null; if (app && app.root) return { root: app.root, source: 'Application.getApplication().root' }; } catch (_) { } return { root: null, source: 'none' }; }
    function indexComponents(lm) { var ri = rootOf(lm), map = new Map(), stats = { scanned: 0, static: 0, dynamic: 0, disabled: 0, lightmapped: 0, castLightmapShadow: 0 }; if (!ri.root) return { root: ri, map: map, stats: stats };['render', 'model'].forEach(function (type) { var comps = []; try { comps = ri.root.findComponents(type) || []; } catch (_) { comps = []; } comps.forEach(function (comp) { if (!comp) return; stats.scanned++; var enabled = !!(comp.enabled && comp.entity && comp.entity.enabled); var stat = comp.isStatic === true; if (!enabled) stats.disabled++; else if (stat) stats.static++; else stats.dynamic++; if (comp.lightmapped === true) stats.lightmapped++; if (comp.castShadowsLightmap !== false) stats.castLightmapShadow++; var mis = comp.meshInstances || []; for (var i = 0; i < mis.length; i++) { if (!mis[i]) continue; map.set(mis[i], { type: type, component: comp, entity: comp.entity, entityName: comp.entity ? comp.entity.name : '(sin entidad)', enabled: enabled, isStatic: stat, lightmapped: comp.lightmapped === true, castShadowsLightmap: comp.castShadowsLightmap !== false }); } }); }); return { root: ri, map: map, stats: stats }; }
    function materialIsTransparent(mat) { if (!mat) return false; var blendNone = isNum(pc.BLEND_NONE) ? pc.BLEND_NONE : 0; if (isNum(mat.blendType) && mat.blendType !== blendNone) return true; if (isNum(mat.opacity) && mat.opacity < 0.9999) return true; if (isNum(mat.alphaTest) && mat.alphaTest > 0) return true; if (mat.opacityDither && mat.opacityDither !== 'none') return true; if (mat.opacityShadowDither && mat.opacityShadowDither !== 'none') return true; return false; }

    function buildGeometry(mi, owner, texDB) {
        var out = { ok: false, name: mi && mi.node ? mi.node.name : '(sin nombre)', mi: mi, owner: owner, positions: null, normals: null, uv0: null, uv1: null, indices: null, vertexCount: 0, triCount: 0, albedo: [0.8, 0.8, 0.8], emission: [0, 0, 0], metalness: 0, transparent: false, textured: false, material: null, diff: null, emis: null, metal: null, reason: '' };
        try {
            if (!mi || !mi.mesh || !mi.node) { out.reason = 'MeshInstance sin mesh/node'; return out; }
            if (mi.skinInstance) { out.reason = 'skinInstance no soportado para bake estatico'; return out; }
            var mesh = mi.mesh, pos = [], nrm = [], uv0a = [], uv1a = [], idx = [];
            var nv = mesh.getPositions(pos) || Math.floor(pos.length / 3);
            if (!nv || pos.length < nv * 3) { out.reason = 'sin positions'; return out; }
            var nn = 0, nu0 = 0, nu1 = 0, ni = 0;
            try { nn = mesh.getNormals(nrm) || 0; } catch (_) { nn = 0; }
            try { nu0 = mesh.getUvs(0, uv0a) || 0; } catch (_) { nu0 = 0; }
            try { nu1 = mesh.getUvs(1, uv1a) || 0; } catch (_) { nu1 = 0; }
            try { ni = mesh.getIndices(idx) || 0; } catch (_) { ni = 0; }
            if (nrm.length < nv * 3) nn = 0; if (uv0a.length < nv * 2) nu0 = 0; if (uv1a.length < nv * 2) nu1 = 0; if (!ni) ni = idx.length;
            var prim = mesh.primitive && mesh.primitive[0];
            if (prim && isNum(prim.type) && isNum(pc.PRIMITIVE_TRIANGLES) && prim.type !== pc.PRIMITIVE_TRIANGLES) { out.reason = 'primitive no TRIANGLES'; return out; }
            var indexed = prim ? (prim.indexed !== false && ni > 0) : ni > 0;
            var base = prim ? prim.base | 0 : 0, baseVertex = prim ? prim.baseVertex | 0 : 0, count = prim ? prim.count | 0 : (indexed ? ni : nv), tri = [];
            for (var k = 0; k + 2 < count; k += 3) { var ia, ib, ic; if (indexed) { ia = idx[base + k] + baseVertex; ib = idx[base + k + 1] + baseVertex; ic = idx[base + k + 2] + baseVertex; } else { ia = base + k; ib = base + k + 1; ic = base + k + 2; } if (ia >= 0 && ib >= 0 && ic >= 0 && ia < nv && ib < nv && ic < nv) tri.push(ia, ib, ic); }
            if (!tri.length) { out.reason = 'sin triangulos'; return out; }
            var m = mi.node.getWorldTransform().data, nm = normalMatrix(m), wp = new Float32Array(nv * 3), wn = new Float32Array(nv * 3), v, x, y, z;
            for (v = 0; v < nv; v++) { x = pos[v * 3]; y = pos[v * 3 + 1]; z = pos[v * 3 + 2]; wp[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; wp[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; wp[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
            if (nn) {
                for (v = 0; v < nv; v++) { x = nrm[v * 3]; y = nrm[v * 3 + 1]; z = nrm[v * 3 + 2]; var nx = nm[0] * x + nm[1] * y + nm[2] * z, ny = nm[3] * x + nm[4] * y + nm[5] * z, nz = nm[6] * x + nm[7] * y + nm[8] * z, nl = Math.hypot(nx, ny, nz) || 1; wn[v * 3] = nx / nl; wn[v * 3 + 1] = ny / nl; wn[v * 3 + 2] = nz / nl; }
            } else {
                for (var tt = 0; tt < tri.length; tt += 3) { ia = tri[tt]; ib = tri[tt + 1]; ic = tri[tt + 2]; var e1x = wp[ib * 3] - wp[ia * 3], e1y = wp[ib * 3 + 1] - wp[ia * 3 + 1], e1z = wp[ib * 3 + 2] - wp[ia * 3 + 2]; var e2x = wp[ic * 3] - wp[ia * 3], e2y = wp[ic * 3 + 1] - wp[ia * 3 + 1], e2z = wp[ic * 3 + 2] - wp[ia * 3 + 2]; var fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;[ia, ib, ic].forEach(function (q) { wn[q * 3] += fx; wn[q * 3 + 1] += fy; wn[q * 3 + 2] += fz; }); }
                for (v = 0; v < nv; v++) { nl = Math.hypot(wn[v * 3], wn[v * 3 + 1], wn[v * 3 + 2]) || 1; wn[v * 3] /= nl; wn[v * 3 + 1] /= nl; wn[v * 3 + 2] /= nl; }
            }
            var uv0 = new Float32Array(nv * 2), uv1 = new Float32Array(nv * 2);
            if (nu0) for (k = 0; k < nv * 2; k++) uv0[k] = uv0a[k];
            if (nu1) for (k = 0; k < nv * 2; k++) uv1[k] = uv1a[k]; else uv1.set(uv0);
            var mat = mi.material; out.material = mat;
            if (mat) {
                out.transparent = materialIsTransparent(mat);
                out.textured = !!(mat.diffuseMap || mat.emissiveMap || mat.metalnessMap);
                if (mat.diffuse && isNum(mat.diffuse.r)) out.albedo = [srgbToLinear1(mat.diffuse.r), srgbToLinear1(mat.diffuse.g), srgbToLinear1(mat.diffuse.b)];
                if (mat.emissive && isNum(mat.emissive.r)) { var ei = isNum(mat.emissiveIntensity) ? mat.emissiveIntensity : 1; out.emission = [srgbToLinear1(mat.emissive.r) * ei, srgbToLinear1(mat.emissive.g) * ei, srgbToLinear1(mat.emissive.b) * ei]; }
                out.metalness = mat.useMetalness && isNum(mat.metalness) ? clamp(mat.metalness, 0, 1) : 0;
                out.diff = mapDescriptor(mat, 'diffuse', texDB, false);
                out.emis = mapDescriptor(mat, 'emissive', texDB, false);
                out.metal = mapDescriptor(mat, 'metalness', texDB, true);
            } else {
                out.diff = mapDescriptor(null, 'diffuse', texDB, false); out.emis = mapDescriptor(null, 'emissive', texDB, false); out.metal = mapDescriptor(null, 'metalness', texDB, true);
            }
            out.positions = wp; out.normals = wn; out.uv0 = uv0; out.uv1 = uv1; out.indices = new Uint32Array(tri); out.vertexCount = nv; out.triCount = tri.length / 3; out.ok = true; return out;
        } catch (e) { out.reason = e && e.message ? e.message : String(e); return out; }
    }

    function buildBVH(records, leafSize) {
        var TRI_FLOATS = 84;
        if (!records.length) return { tris: new Float32Array(TRI_FLOATS), triCount: 0, nodes: new Float32Array(12), nodeCount: 0 };
        var order = records.map(function (_, i) { return i; }), nodes = [];
        function build(start, end, depth) {
            var idx = nodes.length; nodes.push(null); var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
            for (var i = start; i < end; i++) { var r = records[order[i]]; for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], r.min[k]); mx[k] = Math.max(mx[k], r.max[k]); cmn[k] = Math.min(cmn[k], r.centroid[k]); cmx[k] = Math.max(cmx[k], r.centroid[k]); } }
            var count = end - start; if (count <= leafSize || depth >= 48) { nodes[idx] = { min: mn, max: mx, left: -1, right: -1, start: start, count: count }; return idx; }
            var ex = [cmx[0] - cmn[0], cmx[1] - cmn[1], cmx[2] - cmn[2]], axis = ex[1] > ex[0] ? 1 : 0; if (ex[2] > ex[axis]) axis = 2;
            if (ex[axis] < 1e-9) { nodes[idx] = { min: mn, max: mx, left: -1, right: -1, start: start, count: count }; return idx; }
            var part = order.slice(start, end).sort(function (a, b) { return records[a].centroid[axis] - records[b].centroid[axis]; }); for (i = 0; i < part.length; i++) order[start + i] = part[i];
            var mid = start + (count >> 1), left = build(start, mid, depth + 1), right = build(mid, end, depth + 1); nodes[idx] = { min: mn, max: mx, left: left, right: right, start: 0, count: 0 }; return idx;
        }
        build(0, order.length, 0);
        var td = new Float32Array(order.length * TRI_FLOATS); for (var t = 0; t < order.length; t++) td.set(records[order[t]].data, t * TRI_FLOATS);
        var nd = new Float32Array(nodes.length * 12); for (var n = 0; n < nodes.length; n++) { var q = nodes[n], o = n * 12; nd[o] = q.min[0]; nd[o + 1] = q.min[1]; nd[o + 2] = q.min[2]; nd[o + 3] = q.left; nd[o + 4] = q.max[0]; nd[o + 5] = q.max[1]; nd[o + 6] = q.max[2]; nd[o + 7] = q.right; nd[o + 8] = q.start; nd[o + 9] = q.count; }
        return { tris: td, triCount: order.length, nodes: nd, nodeCount: nodes.length };
    }

    function collectScene(lm, bakeNodes, p, texDB) {
        var ix = indexComponents(lm), owners = ix.map, cache = new Map(), allGeoms = [], transportGeoms = [], receivers = new Set(), transportSet = new Set();
        var stats = { componentsScanned: ix.stats.scanned, staticComponents: ix.stats.static, dynamicComponents: ix.stats.dynamic, disabledComponents: ix.stats.disabled, receivers: 0, transportMeshes: 0, staticNonLightmappedCasters: 0, dynamicNonLightmappedExcluded: 0, transparentTransportExcluded: 0, pbrTexturedTransport: 0, diffuseMaps: 0, emissiveMaps: 0, metalnessMaps: 0, skippedUnknown: 0, skippedDisabled: 0, skippedSkin: 0 };
        function add(mi, owner) {
            if (cache.has(mi)) return cache.get(mi);
            var g = buildGeometry(mi, owner, texDB); cache.set(mi, g);
            if (g.ok) allGeoms.push(g); else { if (g.reason.indexOf('skinInstance') >= 0) stats.skippedSkin++; warn('Mesh "' + g.name + '" descartado: ' + g.reason); }
            return g;
        }
        for (var n = 0; n < bakeNodes.length; n++) {
            var mis = (bakeNodes[n] && bakeNodes[n].meshInstances) || [];
            for (var i = 0; i < mis.length; i++) {
                var mi = mis[i], owner = owners.get(mi);
                if (!owner) { stats.skippedUnknown++; continue; }
                if (!owner.enabled) { stats.skippedDisabled++; continue; }
                if (!owner.lightmapped) continue;
                receivers.add(mi); add(mi, owner);
            }
        }
        owners.forEach(function (owner, mi) {
            if (!owner.enabled || !mi || mi.visible === false) return;
            var eligibleStatic = owner.isStatic || owner.lightmapped;
            if (!eligibleStatic) { if (owner.castShadowsLightmap) stats.dynamicNonLightmappedExcluded++; return; }
            if (!owner.castShadowsLightmap && !owner.lightmapped) return;
            var g = add(mi, owner); if (!g || !g.ok) return;
            if (g.transparent) { stats.transparentTransportExcluded++; return; }
            if (g.textured) stats.pbrTexturedTransport++;
            if (g.material && g.material.diffuseMap && g.diff && g.diff.info[0] >= 0) stats.diffuseMaps++;
            if (g.material && g.material.emissiveMap && g.emis && g.emis.info[0] >= 0) stats.emissiveMaps++;
            if (g.material && g.material.metalnessMap && g.metal && g.metal.info[0] >= 0) stats.metalnessMaps++;
            if (owner.isStatic && !owner.lightmapped) stats.staticNonLightmappedCasters++;
            transportSet.add(mi); transportGeoms.push(g);
        });
        stats.receivers = receivers.size; stats.transportMeshes = transportGeoms.length;
        var records = [], bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
        transportGeoms.forEach(function (g) {
            var P = g.positions, N = g.normals, U0 = g.uv0, U1 = g.uv1, d = g.diff, e = g.emis, mt = g.metal;
            for (var t = 0; t < g.triCount; t++) {
                var ia = g.indices[t * 3], ib = g.indices[t * 3 + 1], ic = g.indices[t * 3 + 2];
                var ax = P[ia * 3], ay = P[ia * 3 + 1], az = P[ia * 3 + 2], bx = P[ib * 3], by = P[ib * 3 + 1], bz = P[ib * 3 + 2], cx = P[ic * 3], cy = P[ic * 3 + 1], cz = P[ic * 3 + 2];
                var e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az, crx = e1y * e2z - e1z * e2y, cry = e1z * e2x - e1x * e2z, crz = e1x * e2y - e1y * e2x;
                if (Math.hypot(crx, cry, crz) < 1e-12) continue;
                var mn = [Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.min(az, bz, cz)], mx = [Math.max(ax, bx, cx), Math.max(ay, by, cy), Math.max(az, bz, cz)];
                for (var k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], mn[k]); bmax[k] = Math.max(bmax[k], mx[k]); }
                records.push({
                    min: mn, max: mx, centroid: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
                    data: [
                        ax, ay, az, 0, e1x, e1y, e1z, 0, e2x, e2y, e2z, 0,
                        N[ia * 3], N[ia * 3 + 1], N[ia * 3 + 2], 0,
                        N[ib * 3], N[ib * 3 + 1], N[ib * 3 + 2], 0,
                        N[ic * 3], N[ic * 3 + 1], N[ic * 3 + 2], 0,
                        g.albedo[0], g.albedo[1], g.albedo[2], g.owner.castShadowsLightmap ? 1 : 0,
                        g.emission[0], g.emission[1], g.emission[2], g.metalness,
                        U0[ia * 2], U0[ia * 2 + 1], U0[ib * 2], U0[ib * 2 + 1],
                        U0[ic * 2], U0[ic * 2 + 1], 0, 0,
                        U1[ia * 2], U1[ia * 2 + 1], U1[ib * 2], U1[ib * 2 + 1],
                        U1[ic * 2], U1[ic * 2 + 1], 0, 0,
                        d.info[0], d.info[1], d.info[2], d.info[3],
                        d.xform[0], d.xform[1], d.xform[2], d.xform[3],
                        d.misc[0], d.misc[1], d.misc[2], d.misc[3],
                        e.info[0], e.info[1], e.info[2], e.info[3],
                        e.xform[0], e.xform[1], e.xform[2], e.xform[3],
                        e.misc[0], e.misc[1], e.misc[2], e.misc[3],
                        mt.info[0], mt.info[1], mt.info[2], mt.info[3],
                        mt.xform[0], mt.xform[1], mt.xform[2], mt.xform[3],
                        mt.misc[0], mt.misc[1], mt.misc[2], mt.misc[3]
                    ]
                });
            }
        });
        if (!records.length) { bmin = [0, 0, 0]; bmax = [0, 0, 0]; }
        var extent = records.length ? Math.max(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]) : 1, built = buildBVH(records, p.leaf);
        return { cache: cache, allGeoms: allGeoms, transportGeoms: transportGeoms, receivers: receivers, transportSet: transportSet, tris: built.tris, triCount: built.triCount, bvh: built.nodes, bvhCount: built.nodeCount, boundsMin: bmin, boundsMax: bmax, extent: extent, stats: stats };
    }

    function lightUnitConversion(comp) { var type = comp.type === 'omni' ? 'point' : comp.type; if (type === 'directional') return 1; if (type === 'point') return 4 * Math.PI; if (type === 'spot') { var inner = clamp(isNum(comp.innerConeAngle) ? comp.innerConeAngle : 40, 0, 89.9) * Math.PI / 180, outer = clamp(isNum(comp.outerConeAngle) ? comp.outerConeAngle : 45, 0, 89.9) * Math.PI / 180; return 2 * Math.PI * ((1 - Math.cos(inner)) + (Math.cos(inner) - Math.cos(outer)) * 0.5); } return 1; }
    function lightLinearColor(comp, scene) { var intensity = isNum(comp.intensity) ? comp.intensity : 1; if (scene && scene.physicalUnits && isNum(comp.luminance)) intensity = comp.luminance / Math.max(1e-6, lightUnitConversion(comp)); var c = comp.color || { r: 1, g: 1, b: 1 }; return [srgbToLinear1(c.r) * intensity, srgbToLinear1(c.g) * intensity, srgbToLinear1(c.b) * intensity]; }
    function collectLights(lm) { var ri = rootOf(lm), packed = [], report = [], stats = { scanned: 0, included: 0, notBaked: 0, disabled: 0, runtimeAffectLightmapped: 0 }; if (!ri.root) return { data: new Float32Array(32), count: 0, report: report, stats: stats }; var comps = []; try { comps = ri.root.findComponents('light') || []; } catch (_) { comps = []; } comps.forEach(function (comp) { stats.scanned++; if (!comp || !comp.enabled || !comp.entity || !comp.entity.enabled) { stats.disabled++; return; } if (comp.bake !== true) { stats.notBaked++; if (comp.affectLightmapped === true) stats.runtimeAffectLightmapped++; return; } var m = comp.entity.getWorldTransform().data, xl = Math.hypot(m[0], m[1], m[2]) || 1, yl = Math.hypot(m[4], m[5], m[6]) || 1, zl = Math.hypot(m[8], m[9], m[10]) || 1, X = [m[0] / xl, m[1] / xl, m[2] / xl], Y = [m[4] / yl, m[5] / yl, m[6] / yl], Z = [m[8] / zl, m[9] / zl, m[10] / zl]; var type = comp.type === 'omni' ? 'point' : comp.type, kind = type === 'directional' ? 0 : (type === 'spot' ? 2 : 1); if (type !== 'directional' && type !== 'point' && type !== 'spot') return; var col = lightLinearColor(comp, lm.scene), range = isNum(comp.range) && comp.range > 0 ? comp.range : 10, fall = comp.falloffMode === pc.LIGHTFALLOFF_INVERSESQUARED ? 1 : 0, shape = isNum(comp.shape) ? comp.shape : (isNum(pc.LIGHTSHAPE_PUNCTUAL) ? pc.LIGHTSHAPE_PUNCTUAL : 0), casts = comp.castShadows !== false ? 1 : 0, shadowIntensity = isNum(comp.shadowIntensity) ? clamp(comp.shadowIntensity, 0, 1) : 1, bakeArea = kind === 0 && isNum(comp.bakeArea) ? clamp(comp.bakeArea, 0, 179) : 0, tanRadius = Math.tan(bakeArea * Math.PI / 360), inner = clamp(isNum(comp.innerConeAngle) ? comp.innerConeAngle : 40, 0, 89.9), outer = clamp(isNum(comp.outerConeAngle) ? comp.outerConeAngle : 45, 0, 89.9), ci = Math.cos(Math.min(inner, outer) * Math.PI / 180), co = Math.cos(outer * Math.PI / 180); if (ci <= co) ci = co + 1e-4; packed.push(kind === 0 ? Y[0] : m[12], kind === 0 ? Y[1] : m[13], kind === 0 ? Y[2] : m[14], kind, col[0], col[1], col[2], range, -Y[0], -Y[1], -Y[2], fall, shape, casts, tanRadius, shadowIntensity, X[0], X[1], X[2], xl * 0.5, Y[0], Y[1], Y[2], yl * 0.5, Z[0], Z[1], Z[2], zl * 0.5, ci, co, isNum(comp.bakeNumSamples) ? comp.bakeNumSamples : 1, 0); stats.included++; report.push({ entity: comp.entity.name, type: type, color: col, shape: shape, castShadows: !!casts, bakeArea: bakeArea }); }); var data = new Float32Array(Math.max(32, packed.length)); data.set(packed); return { data: data, count: packed.length / 32, report: report, stats: stats }; }

    var _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
    function halfToFloat(h) { var s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; if (e === 0) return s * Math.pow(2, -14) * (f / 1024); if (e === 31) return f ? NaN : s * Infinity; return s * Math.pow(2, e - 15) * (1 + f / 1024); }
    function floatToHalf(value) { if (!(value > 0)) return 0; if (value >= 65504) return 0x7bff; _f32[0] = value; var x = _u32[0], exp = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff; if (exp <= 0) { if (exp < -10) return 0; m = (m | 0x800000) >> (1 - exp); return (m + 0x1000) >> 13; } var r = (exp << 10) + ((m + 0x1000) >> 13); return r >= 0x7c00 ? 0x7bff : r; }
    function unpackUFloat(bits, mantBits) { var mask = (1 << mantBits) - 1, m = bits & mask, e = (bits >> mantBits) & 0x1f; if (e === 0) return m * Math.pow(2, 1 - 15 - mantBits); if (e === 31) return Infinity; return (1 + m / (1 << mantBits)) * Math.pow(2, e - 15); }
    function unpackR11G11B10(v, out) { out[0] = unpackUFloat(v & 0x7ff, 6); out[1] = unpackUFloat((v >>> 11) & 0x7ff, 6); out[2] = unpackUFloat((v >>> 22) & 0x3ff, 5); }
    function packUFloat(v, mantBits) { if (!Number.isFinite(v) || v <= 0) return 0; var max = (1 << mantBits) - 1, minN = Math.pow(2, -14), sub = Math.pow(2, -14 - mantBits); if (v < minN) return Math.min(max, Math.max(0, Math.round(v / sub))); var e = Math.floor(Math.log2(v)), be = e + 15; if (be >= 31) return (30 << mantBits) | max; var base = Math.pow(2, e), mant = Math.round((v / base - 1) * (1 << mantBits)); if (mant >= (1 << mantBits)) { mant = 0; be++; if (be >= 31) return (30 << mantBits) | max; } if (be <= 0) return Math.min(max, Math.max(0, Math.round(v / sub))); return (be << mantBits) | mant; }
    function packR11G11B10(r, g, b) { return (packUFloat(r, 6) | (packUFloat(g, 6) << 11) | (packUFloat(b, 5) << 22)) >>> 0; }
    function unpackRGB9E5(v, out) { var rm = v & 0x1ff, gm = (v >>> 9) & 0x1ff, bm = (v >>> 18) & 0x1ff, e = (v >>> 27) & 0x1f, scale = Math.pow(2, e - 24); out[0] = rm * scale; out[1] = gm * scale; out[2] = bm * scale; }
    function encodeRGBM(r, g, b, out) { var er = Math.sqrt(Math.max(0, r)) / 8, eg = Math.sqrt(Math.max(0, g)) / 8, eb = Math.sqrt(Math.max(0, b)) / 8, a = clamp(Math.max(er, eg, eb, 1 / 255), 0, 1); a = Math.ceil(a * 255) / 255; out[0] = clamp(er / a, 0, 1); out[1] = clamp(eg / a, 0, 1); out[2] = clamp(eb / a, 0, 1); out[3] = a; }
    function formatEquals(format, name) { return isNum(pc[name]) && format === pc[name]; }

    function decodeTexturePixels(tex, raw, width, height) {
        var count = width * height, out = new Float32Array(count * 4), view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), tmp = [0, 0, 0], rgbm = tex.type === pc.TEXTURETYPE_RGBM || tex.encoding === 'rgbm', isSrgb = !!tex.srgb || formatEquals(tex.format, 'PIXELFORMAT_SRGB8') || formatEquals(tex.format, 'PIXELFORMAT_SRGBA8') || formatEquals(tex.format, 'PIXELFORMAT_SBGRA8'), isBgra = formatEquals(tex.format, 'PIXELFORMAT_BGRA8') || formatEquals(tex.format, 'PIXELFORMAT_SBGRA8'), i, o, off, ch;
        if (tex.format === pc.PIXELFORMAT_111110F) { for (i = 0; i < count; i++) { unpackR11G11B10(view.getUint32(i * 4, true), tmp); o = i * 4; out[o] = tmp[0]; out[o + 1] = tmp[1]; out[o + 2] = tmp[2]; out[o + 3] = 1; } return out; }
        if (formatEquals(tex.format, 'PIXELFORMAT_RGB9E5')) { for (i = 0; i < count; i++) { unpackRGB9E5(view.getUint32(i * 4, true), tmp); o = i * 4; out[o] = tmp[0]; out[o + 1] = tmp[1]; out[o + 2] = tmp[2]; out[o + 3] = 1; } return out; }
        if (tex.format === pc.PIXELFORMAT_RGBA16F || tex.format === pc.PIXELFORMAT_RGB16F) { ch = tex.format === pc.PIXELFORMAT_RGBA16F ? 4 : 3; for (i = 0; i < count; i++) { o = i * 4; off = i * ch * 2; out[o] = halfToFloat(view.getUint16(off, true)); out[o + 1] = halfToFloat(view.getUint16(off + 2, true)); out[o + 2] = halfToFloat(view.getUint16(off + 4, true)); out[o + 3] = ch === 4 ? halfToFloat(view.getUint16(off + 6, true)) : 1; } return out; }
        if (tex.format === pc.PIXELFORMAT_RGBA32F || tex.format === pc.PIXELFORMAT_RGB32F) { ch = tex.format === pc.PIXELFORMAT_RGBA32F ? 4 : 3; for (i = 0; i < count; i++) { o = i * 4; off = i * ch * 4; out[o] = view.getFloat32(off, true); out[o + 1] = view.getFloat32(off + 4, true); out[o + 2] = view.getFloat32(off + 8, true); out[o + 3] = ch === 4 ? view.getFloat32(off + 12, true) : 1; } return out; }
        var isR8 = formatEquals(tex.format, 'PIXELFORMAT_R8'), isRG8 = formatEquals(tex.format, 'PIXELFORMAT_RG8'), isRGB8 = formatEquals(tex.format, 'PIXELFORMAT_RGB8') || formatEquals(tex.format, 'PIXELFORMAT_SRGB8'), isRGBA8 = tex.format === pc.PIXELFORMAT_RGBA8 || formatEquals(tex.format, 'PIXELFORMAT_SRGBA8') || isBgra;
        if (isR8 || isRG8 || isRGB8 || isRGBA8) {
            ch = isR8 ? 1 : isRG8 ? 2 : isRGB8 ? 3 : 4;
            for (i = 0; i < count; i++) {
                o = i * 4; off = i * ch;
                var r = raw[off] / 255, g = ch > 1 ? raw[off + 1] / 255 : r, b = ch > 2 ? raw[off + 2] / 255 : r, a = ch > 3 ? raw[off + 3] / 255 : 1;
                if (isBgra) { var sw = r; r = b; b = sw; }
                if (rgbm && ch === 4) { var mm = 8 * a; out[o] = (r * mm) * (r * mm); out[o + 1] = (g * mm) * (g * mm); out[o + 2] = (b * mm) * (b * mm); }
                else if (isSrgb) { out[o] = srgbToLinear1(r); out[o + 1] = srgbToLinear1(g); out[o + 2] = srgbToLinear1(b); }
                else { out[o] = r; out[o + 1] = g; out[o + 2] = b; }
                out[o + 3] = a;
            }
            return out;
        }
        throw new Error('Formato de textura no soportado para lectura PT5.3.2: ' + tex.format);
    }

    function channelCode3(s) {
        s = (s || 'rgb').toLowerCase();
        function ch(c) { return c === 'g' ? 1 : c === 'b' ? 2 : c === 'a' ? 3 : 0; }
        var a = ch(s[0] || 'r'), b = ch(s[1] || s[0] || 'g'), c = ch(s[2] || s[1] || s[0] || 'b');
        return a | (b << 2) | (c << 4);
    }
    function channelCode1(s) { s = (s || 'r').toLowerCase(); return s[0] === 'g' ? 1 : s[0] === 'b' ? 2 : s[0] === 'a' ? 3 : 0; }
    function resampleRGBA(src, sw, sh, dw, dh) {
        if (sw === dw && sh === dh) return src;
        var out = new Float32Array(dw * dh * 4);
        for (var y = 0; y < dh; y++) {
            var fy = (y + 0.5) * sh / dh - 0.5, y0 = clamp(Math.floor(fy), 0, sh - 1), y1 = Math.min(y0 + 1, sh - 1), ty = fy - Math.floor(fy); if (fy < 0) ty = 0;
            for (var x = 0; x < dw; x++) {
                var fx = (x + 0.5) * sw / dw - 0.5, x0 = clamp(Math.floor(fx), 0, sw - 1), x1 = Math.min(x0 + 1, sw - 1), tx = fx - Math.floor(fx); if (fx < 0) tx = 0;
                var d = (y * dw + x) * 4, a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, e = (y1 * sw + x1) * 4;
                for (var k = 0; k < 4; k++) { var p0 = src[a + k] * (1 - tx) + src[b + k] * tx, p1 = src[c + k] * (1 - tx) + src[e + k] * tx; out[d + k] = p0 * (1 - ty) + p1 * ty; }
            }
        }
        return out;
    }
    async function readTextureForBake(tex, maxResolution) {
        if (!tex || tex.cubemap || tex.volume || tex.array) throw new Error('solo texturas 2D');
        var levels = Math.max(1, tex.numLevels || 1), mip = 0;
        while (mip + 1 < levels && Math.max(tex.width >> (mip + 1), tex.height >> (mip + 1)) >= Math.max(4, maxResolution)) mip++;
        var w = Math.max(1, tex.width >> mip), h = Math.max(1, tex.height >> mip), pixels = null, raw = null;
        try {
            raw = await tex.read(0, 0, w, h, { mipLevel: mip, immediate: true });
            if (raw) pixels = decodeTexturePixels(tex, raw, w, h);
        } catch (_) { pixels = null; }
        if (!pixels && typeof document !== 'undefined' && typeof tex.getSource === 'function') {
            try {
                var source = tex.getSource(mip) || tex.getSource(0);
                if (source && !Array.isArray(source) && source.width && source.height) {
                    var scale = Math.min(1, maxResolution / Math.max(source.width, source.height));
                    var dw = Math.max(1, Math.round(source.width * scale)), dh = Math.max(1, Math.round(source.height * scale));
                    var canvas = document.createElement('canvas'); canvas.width = dw; canvas.height = dh;
                    var ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, dw, dh);
                    var bytes = ctx.getImageData(0, 0, dw, dh).data; pixels = new Float32Array(dw * dh * 4);
                    var srgb = !!tex.srgb || formatEquals(tex.format, 'PIXELFORMAT_SRGB8') || formatEquals(tex.format, 'PIXELFORMAT_SRGBA8') || formatEquals(tex.format, 'PIXELFORMAT_SBGRA8');
                    for (var i = 0; i < dw * dh; i++) { var o = i * 4, r = bytes[o] / 255, g = bytes[o + 1] / 255, b = bytes[o + 2] / 255; pixels[o] = srgb ? srgbToLinear1(r) : r; pixels[o + 1] = srgb ? srgbToLinear1(g) : g; pixels[o + 2] = srgb ? srgbToLinear1(b) : b; pixels[o + 3] = bytes[o + 3] / 255; }
                    w = dw; h = dh; mip = 0;
                }
            } catch (_) { pixels = null; }
        }
        if (!pixels) throw new Error('readback/source no disponible o formato no soportado');
        if (Math.max(w, h) > maxResolution) {
            var s = maxResolution / Math.max(w, h), nw = Math.max(1, Math.round(w * s)), nh = Math.max(1, Math.round(h * s));
            pixels = resampleRGBA(pixels, w, h, nw, nh); w = nw; h = nh;
        }
        return { pixels: pixels, width: w, height: h, mip: mip, addressU: isNum(tex.addressU) ? tex.addressU : 0, addressV: isNum(tex.addressV) ? tex.addressV : 0, name: tex.name || '(texture)' };
    }
    async function prepareMaterialTextures(lm, p, baseOffset) {
        var ix = indexComponents(lm), textures = new Set(), materials = new Set();
        ix.map.forEach(function (owner, mi) {
            if (!owner.enabled || !mi || mi.visible === false || !(owner.isStatic || owner.lightmapped)) return;
            var mat = mi.material; if (!mat || materials.has(mat)) return; materials.add(mat);
            if (mat.diffuseMap) textures.add(mat.diffuseMap);
            if (mat.emissiveMap) textures.add(mat.emissiveMap);
            if (mat.metalnessMap) textures.add(mat.metalnessMap);
        });
        var list = Array.from(textures), decoded = await Promise.all(list.map(async function (tex) {
            try { return { tex: tex, data: await readTextureForBake(tex, p.materialResolution), error: null }; }
            catch (e) { return { tex: tex, data: null, error: e }; }
        }));
        var map = new Map(), total = 0, ok = 0, failed = 0;
        decoded.forEach(function (r) { if (r.data) { total += r.data.width * r.data.height; ok++; } else { failed++; warn('Texture PBR "' + (r.tex && r.tex.name || '?') + '" no pudo entrar al pool PT: ' + (r.error && r.error.message || r.error)); } });
        var pixels = new Float32Array(Math.max(4, total * 4)), cursor = 0;
        decoded.forEach(function (r) {
            if (!r.data) return;
            var d = r.data, count = d.width * d.height; pixels.set(d.pixels, cursor * 4);
            map.set(r.tex, { offset: baseOffset + cursor, width: d.width, height: d.height, addressU: d.addressU, addressV: d.addressV, mip: d.mip, name: d.name });
            cursor += count;
        });
        return { map: map, pixels: pixels, textureCount: ok, failedCount: failed, texelCount: cursor, materialCount: materials.size };
    }
    function mapDescriptor(mat, prefix, texDB, scalar) {
        var tex = mat && mat[prefix + 'Map'], entry = tex && texDB && texDB.map.get(tex), til = mat && mat[prefix + 'MapTiling'], off = mat && mat[prefix + 'MapOffset'];
        return {
            info: [entry ? entry.offset : -1, entry ? entry.width : 0, entry ? entry.height : 0, entry ? entry.addressU : 0],
            xform: [til && isNum(til.x) ? til.x : 1, til && isNum(til.y) ? til.y : 1, off && isNum(off.x) ? off.x : 0, off && isNum(off.y) ? off.y : 0],
            misc: [entry ? entry.addressV : 0, ((mat && isNum(mat[prefix + 'MapRotation']) ? mat[prefix + 'MapRotation'] : 0) * Math.PI / 180), mat && isNum(mat[prefix + 'MapUv']) ? mat[prefix + 'MapUv'] : 0, scalar ? channelCode1(mat && mat[prefix + 'MapChannel']) : channelCode3(mat && mat[prefix + 'MapChannel'])]
        };
    }
    function faceUvDirJS(face, u, v) { var s = u * 2 - 1, t = v * 2 - 1, x, y, z; switch (face) { case 0: x = 1; y = -t; z = -s; break; case 1: x = -1; y = -t; z = s; break; case 2: x = s; y = 1; z = t; break; case 3: x = s; y = -1; z = -t; break; case 4: x = s; y = -t; z = 1; break; default: x = -s; y = -t; z = -1; }var l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
    function inverseQuatRows(q) { var x = -(q && isNum(q.x) ? q.x : 0), y = -(q && isNum(q.y) ? q.y : 0), z = -(q && isNum(q.z) ? q.z : 0), w = q && isNum(q.w) ? q.w : 1, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z; return [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)]; }
    function envLocalToWorld(local, r) { return [r[0] * local[0] + r[3] * local[1] + r[6] * local[2], r[1] * local[0] + r[4] * local[1] + r[7] * local[2], r[2] * local[0] + r[5] * local[1] + r[8] * local[2]]; }
    function resampleFaceLinear(src, srcN, dstN) { if (srcN === dstN) return src; var out = new Float32Array(dstN * dstN * 4); for (var y = 0; y < dstN; y++) { var fy = (y + 0.5) * srcN / dstN - 0.5, y0 = clamp(Math.floor(fy), 0, srcN - 1), y1 = Math.min(y0 + 1, srcN - 1), ty = fy - Math.floor(fy); if (fy < 0) ty = 0; for (var x = 0; x < dstN; x++) { var fx = (x + 0.5) * srcN / dstN - 0.5, x0 = clamp(Math.floor(fx), 0, srcN - 1), x1 = Math.min(x0 + 1, srcN - 1), tx = fx - Math.floor(fx); if (fx < 0) tx = 0; var d = (y * dstN + x) * 4, a = (y0 * srcN + x0) * 4, b = (y0 * srcN + x1) * 4, c = (y1 * srcN + x0) * 4, e = (y1 * srcN + x1) * 4; for (var ch = 0; ch < 4; ch++) { var v0 = src[a + ch] * (1 - tx) + src[b + ch] * tx, v1 = src[c + ch] * (1 - tx) + src[e + ch] * tx; out[d + ch] = v0 * (1 - ty) + v1 * ty; } } } return out; }
    function buildAliasTable(weights) { var n = weights.length, data = new Float32Array(Math.max(4, n * 4)); if (!n) return { data: data, total: 0 }; var total = 0; for (var i = 0; i < n; i++)total += Math.max(0, weights[i]); if (!(total > 1e-20)) return { data: data, total: 0 }; var scaled = new Float64Array(n), mass = new Float64Array(n), small = [], large = []; for (i = 0; i < n; i++) { mass[i] = Math.max(0, weights[i]) / total; scaled[i] = mass[i] * n; (scaled[i] < 1 ? small : large).push(i); } var q = new Float64Array(n), alias = new Int32Array(n); while (small.length && large.length) { var s = small.pop(), l = large.pop(); q[s] = scaled[s]; alias[s] = l; scaled[l] -= 1 - scaled[s]; (scaled[l] < 1 ? small : large).push(l); } while (large.length) { l = large.pop(); q[l] = 1; alias[l] = l; } while (small.length) { s = small.pop(); q[s] = 1; alias[s] = s; } for (i = 0; i < n; i++) { var o = i * 4; data[o] = q[i]; data[o + 1] = alias[i]; data[o + 2] = mass[i]; } return { data: data, total: total }; }
    function buildEnvWeights(pixels, n, rows, minY) { var count = 6 * n * n, w = new Float64Array(count), cell = 4 / (n * n); for (var face = 0; face < 6; face++)for (var y = 0; y < n; y++) { var v = (y + 0.5) / n, t = v * 2 - 1; for (var x = 0; x < n; x++) { var u = (x + 0.5) / n, s = u * 2 - 1, local = faceUvDirJS(face, u, v), world = envLocalToWorld(local, rows), idx = face * n * n + y * n + x; if (world[1] < minY) { w[idx] = 0; continue; } var o = idx * 4, lum = Math.max(0, luminance(pixels[o], pixels[o + 1], pixels[o + 2])), jac = 1 / Math.pow(1 + s * s + t * t, 1.5); w[idx] = lum * cell * jac; } } return w; }
    function analyzeEnvironment(pixels, n, rows, minY, intensity) {
        var cell = 4 / (n * n), omega = 0, lumOmega = 0, maxLum = 0, upIrr = 0, rgbOmega = [0, 0, 0], upRgb = [0, 0, 0], activeTexels = 0;
        intensity = isNum(intensity) ? Math.max(0, intensity) : 1;
        for (var face = 0; face < 6; face++)for (var y = 0; y < n; y++) {
            var v = (y + 0.5) / n, t = v * 2 - 1;
            for (var x = 0; x < n; x++) {
                var u = (x + 0.5) / n, s = u * 2 - 1, local = faceUvDirJS(face, u, v), world = envLocalToWorld(local, rows);
                if (world[1] < minY) continue;
                var idx = face * n * n + y * n + x, o = idx * 4, jac = 1 / Math.pow(1 + s * s + t * t, 1.5), dOmega = cell * jac;
                var r = Math.max(0, pixels[o]) * intensity, g = Math.max(0, pixels[o + 1]) * intensity, b = Math.max(0, pixels[o + 2]) * intensity, lum = luminance(r, g, b);
                var upCos = Math.max(0, world[1]);
                omega += dOmega; lumOmega += lum * dOmega; maxLum = Math.max(maxLum, lum); upIrr += lum * upCos * dOmega;
                rgbOmega[0] += r * dOmega; rgbOmega[1] += g * dOmega; rgbOmega[2] += b * dOmega;
                upRgb[0] += r * upCos * dOmega; upRgb[1] += g * upCos * dOmega; upRgb[2] += b * upCos * dOmega;
                activeTexels++;
            }
        }
        var meanLum = omega > 0 ? lumOmega / omega : 0;
        return { solidAngle: omega, activeTexels: activeTexels, meanLuminance: meanLum, maxLuminance: maxLum, sphereLuminanceIntegral: lumOmega, isotropicDiffuseEstimate: Math.PI * meanLum, upIrradiance: upIrr, meanRgb: omega > 0 ? [rgbOmega[0] / omega, rgbOmega[1] / omega, rgbOmega[2] / omega] : [0, 0, 0], upIrradianceRgb: upRgb };
    }
    function syntheticAmbientEnvironment(scene) { var n = 16, count = 6 * n * n, pixels = new Float32Array(count * 4), a = scene.ambientLight || { r: 0, g: 0, b: 0 }, rgb = [srgbToLinear1(a.r), srgbToLinear1(a.g), srgbToLinear1(a.b)]; if (scene.physicalUnits && isNum(scene.ambientLuminance) && scene.ambientLuminance > 0) { rgb[0] *= scene.ambientLuminance; rgb[1] *= scene.ambientLuminance; rgb[2] *= scene.ambientLuminance; } for (var i = 0; i < count; i++) { var o = i * 4; pixels[o] = rgb[0]; pixels[o + 1] = rgb[1]; pixels[o + 2] = rgb[2]; pixels[o + 3] = 1; } return { n: n, pixels: pixels, intensity: 1, source: 'ambientLight sintetico' }; }

    async function buildEnvironment(scene, p) {
        var disabled = { mode: 0, faceSize: 1, count: 0, pixels: new Float32Array(4), alias: new Float32Array(4), rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], intensity: 1, minWorldY: -1, source: 'sin environment', readMs: 0, mipLevel: 0 };
        if (!scene) return disabled;
        var useBakeCap = scene.ambientBake === true, part = useBakeCap && isNum(scene.ambientBakeSpherePart) ? clamp(scene.ambientBakeSpherePart, 0.001, 1) : 1, minY = useBakeCap ? Math.cos(Math.PI * part) : -1, rows = inverseQuatRows(scene.skyboxRotation), sky = scene.skybox, t0 = now();
        try {
            var source = null;
            if (sky && sky.cubemap) {
                var levels = Math.max(1, sky.numLevels || 1), target = p.envResolution, mip = 0;
                while (mip + 1 < levels) { var candidate = Math.max(1, sky.width >> (mip + 1)); if (candidate < target) break; mip++; }
                var srcN = Math.max(1, sky.width >> mip), dstN = Math.min(target, srcN);
                var faces = await Promise.all([0, 1, 2, 3, 4, 5].map(function (face) { return sky.read(0, 0, srcN, srcN, { face: face, mipLevel: mip, immediate: true }); }));
                var pixels = new Float32Array(6 * dstN * dstN * 4);
                for (var f = 0; f < 6; f++) { var decoded = decodeTexturePixels(sky, faces[f], srcN, srcN), resized = resampleFaceLinear(decoded, srcN, dstN); pixels.set(resized, f * dstN * dstN * 4); }
                var intensity;
                if (scene.physicalUnits) { intensity = isNum(scene.skyboxLuminance) && scene.skyboxLuminance > 0 ? scene.skyboxLuminance / 20000 : 1; warn('physicalUnits=true: escala PT del skybox usa skyboxLuminance/20000 como aproximacion.'); }
                else intensity = isNum(scene.skyboxIntensity) ? scene.skyboxIntensity : 1;
                source = { n: dstN, pixels: pixels, intensity: intensity, source: 'scene.skybox cubemap mip=' + mip + ' (' + srcN + '->' + dstN + ')', mipLevel: mip };
            } else {
                var amb = scene.ambientLight || { r: 0, g: 0, b: 0 };
                if ((amb.r || amb.g || amb.b) || (scene.physicalUnits && scene.ambientLuminance > 0)) { source = syntheticAmbientEnvironment(scene); source.mipLevel = 0; }
            }
            if (!source) { disabled.source = 'sin skybox y ambientLight negro'; disabled.readMs = Math.round(now() - t0); return disabled; }
            var weights = buildEnvWeights(source.pixels, source.n, rows, minY), alias = buildAliasTable(weights);
            if (!(alias.total > 1e-20)) { disabled.source = 'environment negro/sin energia'; disabled.readMs = Math.round(now() - t0); return disabled; }
            var diagnostics = analyzeEnvironment(source.pixels, source.n, rows, minY, source.intensity);
            return { mode: 1, faceSize: source.n, count: 6 * source.n * source.n, pixels: source.pixels, alias: alias.data, rotation: rows, intensity: source.intensity, minWorldY: minY, source: source.source + (useBakeCap ? ' spherePart=' + part : ' full-sphere'), readMs: Math.round(now() - t0), mipLevel: source.mipLevel || 0, diagnostics: diagnostics };
        } catch (e) { warn('No se pudo preparar Environment GI:', e); disabled.source = 'fallo environment: ' + (e && e.message ? e.message : String(e)); disabled.readMs = Math.round(now() - t0); return disabled; }
    }

    function readParam(mi, name) { try { var p = typeof mi.getParameter === 'function' ? mi.getParameter(name) : null; if (!p && mi.parameters) p = mi.parameters[name]; if (!p) return null; var t = p.data !== undefined ? p.data : p; return t && isNum(t.width) && isNum(t.height) ? t : null; } catch (_) { return null; } }
    function finalTextures(bn, allowed) { var names = (pc.MeshInstance && pc.MeshInstance.lightmapParamNames) || ['texture_lightMap', 'texture_dirLightMap'], mis = bn.meshInstances || [], color = null, dir = null; for (var i = 0; i < mis.length && !color; i++) { if (allowed && !allowed.has(mis[i])) continue; color = readParam(mis[i], names[0]); dir = readParam(mis[i], names[1]); } return { color: color, dir: dir }; }

    function buildGBuffer(geoms, w, h) {
        var pos = new Float32Array(w * h * 4), nrm = new Float32Array(w * h * 4), du = new Float32Array(w * h * 4), dv = new Float32Array(w * h * 4), valid = 0;
        geoms.forEach(function (g, gi) {
            if (!g.ok || !g.uv1) return; var uv = g.uv1, P = g.positions, N = g.normals; for (var t = 0; t < g.triCount; t++) {
                var i0 = g.indices[t * 3], i1 = g.indices[t * 3 + 1], i2 = g.indices[t * 3 + 2]; var u0 = uv[i0 * 2], v0 = uv[i0 * 2 + 1], u1 = uv[i1 * 2], v1 = uv[i1 * 2 + 1], u2 = uv[i2 * 2], v2 = uv[i2 * 2 + 1], x0 = u0 * w, y0 = v0 * h, x1 = u1 * w, y1 = v1 * h, x2 = u2 * w, y2 = v2 * h, den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(den) < 1e-12) continue; var p0x = P[i0 * 3], p0y = P[i0 * 3 + 1], p0z = P[i0 * 3 + 2], p1x = P[i1 * 3], p1y = P[i1 * 3 + 1], p1z = P[i1 * 3 + 2], p2x = P[i2 * 3], p2y = P[i2 * 3 + 1], p2z = P[i2 * 3 + 2], eu1 = u1 - u0, ev1 = v1 - v0, eu2 = u2 - u0, ev2 = v2 - v0, uvDet = eu1 * ev2 - ev1 * eu2, dpdu = [0, 0, 0], dpdv = [0, 0, 0]; if (Math.abs(uvDet) > 1e-12) { var inv = 1 / uvDet, e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z, e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z; dpdu[0] = (e1x * ev2 - e2x * ev1) * inv; dpdu[1] = (e1y * ev2 - e2y * ev1) * inv; dpdu[2] = (e1z * ev2 - e2z * ev1) * inv; dpdv[0] = (-e1x * eu2 + e2x * eu1) * inv; dpdv[1] = (-e1y * eu2 + e2y * eu1) * inv; dpdv[2] = (-e1z * eu2 + e2z * eu1) * inv; }
                var minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2))), minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
                for (var y = minY; y <= maxY; y++)for (var x = minX; x <= maxX; x++) { var px = x + 0.5, py = y + 0.5, l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den, l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den, l2 = 1 - l0 - l1; if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue; var o = (y * w + x) * 4; if (pos[o + 3] === 0) valid++; pos[o] = l0 * p0x + l1 * p1x + l2 * p2x; pos[o + 1] = l0 * p0y + l1 * p1y + l2 * p2y; pos[o + 2] = l0 * p0z + l1 * p1z + l2 * p2z; pos[o + 3] = 1; var nx = l0 * N[i0 * 3] + l1 * N[i1 * 3] + l2 * N[i2 * 3], ny = l0 * N[i0 * 3 + 1] + l1 * N[i1 * 3 + 1] + l2 * N[i2 * 3 + 1], nz = l0 * N[i0 * 3 + 2] + l1 * N[i1 * 3 + 2] + l2 * N[i2 * 3 + 2], nl = Math.hypot(nx, ny, nz) || 1; nrm[o] = nx / nl; nrm[o + 1] = ny / nl; nrm[o + 2] = nz / nl; nrm[o + 3] = gi + 1; du[o] = dpdu[0]; du[o + 1] = dpdu[1]; du[o + 2] = dpdu[2]; dv[o] = dpdv[0]; dv[o + 1] = dpdv[1]; dv[o + 2] = dpdv[2]; }
            }
        });
        return { pos: pos, nrm: nrm, du: du, dv: dv, w: w, h: h, valid: valid };
    }

    function dilateGB(gb, iterations) { var w = gb.w, h = gb.h, dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]; for (var it = 0; it < iterations; it++) { var mask = new Uint8Array(w * h), i; for (i = 0; i < w * h; i++)mask[i] = gb.pos[i * 4 + 3] > 0.5 ? 1 : 0; for (var y = 0; y < h; y++)for (var x = 0; x < w; x++) { i = y * w + x; if (mask[i]) continue; for (var k = 0; k < dirs.length; k++) { var sx = x + dirs[k][0], sy = y + dirs[k][1]; if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue; var si = sy * w + sx; if (!mask[si]) continue; var d = i * 4, s = si * 4; gb.pos[d] = gb.pos[s]; gb.pos[d + 1] = gb.pos[s + 1]; gb.pos[d + 2] = gb.pos[s + 2]; gb.pos[d + 3] = 2; gb.nrm[d] = gb.nrm[s]; gb.nrm[d + 1] = gb.nrm[s + 1]; gb.nrm[d + 2] = gb.nrm[s + 2]; gb.nrm[d + 3] = gb.nrm[s + 3]; gb.du[d] = gb.du[s]; gb.du[d + 1] = gb.du[s + 1]; gb.du[d + 2] = gb.du[s + 2]; gb.dv[d] = gb.dv[s]; gb.dv[d + 1] = gb.dv[s + 1]; gb.dv[d + 2] = gb.dv[s + 2]; break; } } } }

    function octEncodeNormal(n) {
        var x = n[0], y = n[1], z = n[2], l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; x /= l; y /= l; z /= l;
        if (z < 0) { var ox = x, oy = y; x = (1 - Math.abs(oy)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (oy >= 0 ? 1 : -1); }
        return [x * 0.5 + 0.5, y * 0.5 + 0.5];
    }
    function applyBentNormalsToGBuffer(gb, bent) {
        for (var i = 0; i < gb.w * gb.h; i++) {
            var o = i * 4;
            if (gb.pos[o + 3] < 0.5) { gb.du[o + 3] = 0.5; gb.dv[o + 3] = 0.5; continue; }
            var nx = gb.nrm[o], ny = gb.nrm[o + 1], nz = gb.nrm[o + 2], bx = bent ? bent[o] : nx, by = bent ? bent[o + 1] : ny, bz = bent ? bent[o + 2] : nz;
            var l = Math.hypot(bx, by, bz) || 1; var enc = octEncodeNormal([bx / l, by / l, bz / l]); gb.du[o + 3] = enc[0]; gb.dv[o + 3] = enc[1];
        }
    }
    function packGBuffer(gb) {
        var count = gb.w * gb.h, out = new Float32Array(count * 16);
        for (var i = 0; i < count; i++) { var s = i * 4, d = i * 16; out.set(gb.pos.subarray(s, s + 4), d); out.set(gb.nrm.subarray(s, s + 4), d + 4); out.set(gb.du.subarray(s, s + 4), d + 8); out.set(gb.dv.subarray(s, s + 4), d + 12); }
        return out;
    }

    async function createDeviceState(gd) {
        var gpu = nativeGPUDevice(gd); if (!gpu) throw new Error('No se encontro GPUDevice WebGPU nativo.');
        if (gpu.limits && gpu.limits.maxStorageBuffersPerShaderStage < 8) throw new Error('WebGPU maxStorageBuffersPerShaderStage=' + gpu.limits.maxStorageBuffersPerShaderStage + '; PT5.3.2 necesita 8.');
        gpu.pushErrorScope('validation'); var C = GPUShaderStageRef.COMPUTE, entries = [{ binding: 0, visibility: C, buffer: { type: 'uniform' } }]; for (var b = 1; b <= 8; b++)entries.push({ binding: b, visibility: C, buffer: { type: (b === 7 || b === 8) ? 'storage' : 'read-only-storage' } });
        var bgl = gpu.createBindGroupLayout({ label: 'BakePT532-BGL', entries: entries }), mod = gpu.createShaderModule({ label: 'BakePT532-WGSL', code: WGSL });
        if (typeof mod.getCompilationInfo === 'function') { var ci = await mod.getCompilationInfo(), bad = false; ci.messages.forEach(function (m) { (m.type === 'error' ? fail : warn)('WGSL ' + m.type + ' L' + m.lineNum + ':' + m.linePos + ' ' + m.message); if (m.type === 'error') bad = true; }); if (bad) throw new Error('WGSL no compilo.'); }
        var pipeline = gpu.createComputePipeline({ label: 'BakePT532-Pipeline', layout: gpu.createPipelineLayout({ bindGroupLayouts: [bgl] }), compute: { module: mod, entryPoint: 'main' } }), validation = await gpu.popErrorScope(); if (validation) throw new Error('WebGPU validation: ' + validation.message); return { gpu: gpu, bgl: bgl, pipeline: pipeline };
    }
    function deviceState(gd) { var p = DEVICE_CACHE.get(gd); if (!p) { p = createDeviceState(gd); DEVICE_CACHE.set(gd, p); p.catch(function () { DEVICE_CACHE.delete(gd); }); } return p; }

    async function createAODeviceState(gd) {
        var gpu = nativeGPUDevice(gd); if (!gpu) throw new Error('No se encontro GPUDevice WebGPU para AO.');
        gpu.pushErrorScope('validation'); var C = GPUShaderStageRef.COMPUTE;
        var bgl = gpu.createBindGroupLayout({
            label: 'BakePT532-AO-BGL', entries: [
                { binding: 0, visibility: C, buffer: { type: 'uniform' } },
                { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
                { binding: 3, visibility: C, buffer: { type: 'read-only-storage' } },
                { binding: 4, visibility: C, buffer: { type: 'storage' } },
                { binding: 5, visibility: C, buffer: { type: 'storage' } }
            ]
        });
        var mod = gpu.createShaderModule({ label: 'BakePT532-AO-WGSL', code: AO_WGSL });
        if (typeof mod.getCompilationInfo === 'function') { var ci = await mod.getCompilationInfo(), bad = false; ci.messages.forEach(function (m) { (m.type === 'error' ? fail : warn)('AO WGSL ' + m.type + ' L' + m.lineNum + ':' + m.linePos + ' ' + m.message); if (m.type === 'error') bad = true; }); if (bad) throw new Error('WGSL de Ambient Occlusion no compilo.'); }
        var pipeline = gpu.createComputePipeline({ label: 'BakePT532-AO-Pipeline', layout: gpu.createPipelineLayout({ bindGroupLayouts: [bgl] }), compute: { module: mod, entryPoint: 'main' } });
        var validation = await gpu.popErrorScope(); if (validation) throw new Error('WebGPU AO validation: ' + validation.message); return { gpu: gpu, bgl: bgl, pipeline: pipeline };
    }
    function aoDeviceState(gd) { var p = AO_DEVICE_CACHE.get(gd); if (!p) { p = createAODeviceState(gd); AO_DEVICE_CACHE.set(gd, p); p.catch(function () { AO_DEVICE_CACHE.delete(gd); }); } return p; }
    function storage(gpu, data, label) { var size = Math.max(16, Math.ceil(data.byteLength / 16) * 16), b = gpu.createBuffer({ label: label, size: size, usage: GPUBufferUsageRef.STORAGE | GPUBufferUsageRef.COPY_DST }); if (data.byteLength) gpu.queue.writeBuffer(b, 0, data.buffer, data.byteOffset, data.byteLength); return b; }
    function emptyStorage(gpu, size, label, copySrc) { return gpu.createBuffer({ label: label, size: Math.max(16, Math.ceil(size / 16) * 16), usage: GPUBufferUsageRef.STORAGE | (copySrc ? GPUBufferUsageRef.COPY_SRC : 0) }); }

    function paramArray(p) {
        var ab = new ArrayBuffer(160), u = new Uint32Array(ab), f = new Float32Array(ab);
        u[0] = p.width; u[1] = p.height; u[2] = p.triCount; u[3] = p.bvhCount; u[4] = p.lightCount; u[5] = p.sampleCount; u[6] = p.maxSamples; u[7] = p.minSamples; u[8] = p.maxBounces; u[9] = p.seed; u[10] = p.envFaceSize; u[11] = p.envCount;
        f[12] = p.ambient[0]; f[13] = p.ambient[1]; f[14] = p.ambient[2]; f[15] = 1; f[16] = p.rayBias; f[17] = p.maxRadiance; f[18] = p.noiseThreshold; f[19] = p.envIntensity;
        u[20] = p.envMode; u[21] = p.adaptive ? 1 : 0; u[22] = p.customEnvDirect ? 1 : 0;
        f[24] = p.envRotation[0]; f[25] = p.envRotation[1]; f[26] = p.envRotation[2]; f[28] = p.envRotation[3]; f[29] = p.envRotation[4]; f[30] = p.envRotation[5]; f[32] = p.envRotation[6]; f[33] = p.envRotation[7]; f[34] = p.envRotation[8];
        f[36] = p.envMinWorldY; f[37] = p.bentStrength || 0;
        return ab;
    }
    function assertBindingSize(gpu, bytes, label) { var max = gpu.limits && gpu.limits.maxStorageBufferBindingSize; if (max && bytes > max) throw new Error(label + ' requiere ' + Math.round(bytes / 1048576) + ' MB, pero WebGPU permite ' + Math.round(max / 1048576) + ' MB por storage binding. Reduce la resolucion de ese lightmap.'); }

    async function traceGPU(ds, sb, eb, gb, si, p, seed, owner, epoch) {
        var gpu = ds.gpu, w = gb.w, h = gb.h, pixelCount = w * h, gPacked = packGBuffer(gb), gBytes = gPacked.byteLength, outBytes = pixelCount * 16, statsBytes = pixelCount * 16;
        assertBindingSize(gpu, gBytes, 'G-buffer ' + w + 'x' + h); assertBindingSize(gpu, outBytes, 'Acumulacion ' + w + 'x' + h); assertBindingSize(gpu, eb.pixelBytes, 'Environment pixels'); assertBindingSize(gpu, eb.aliasBytes, 'Environment alias');
        var gbufBuffer = storage(gpu, gPacked, 'BakePT532-GBuf'), statsBuffer = emptyStorage(gpu, statsBytes, 'BakePT532-Stats', true), outBuffer = emptyStorage(gpu, outBytes, 'BakePT532-Out', true), readBuffer = gpu.createBuffer({ label: 'BakePT532-Read', size: outBytes, usage: GPUBufferUsageRef.COPY_DST | GPUBufferUsageRef.MAP_READ }), statsReadBuffer = gpu.createBuffer({ label: 'BakePT532-StatsRead', size: statsBytes, usage: GPUBufferUsageRef.COPY_DST | GPUBufferUsageRef.MAP_READ }), paramsBuffer = gpu.createBuffer({ label: 'BakePT532-Params', size: 160, usage: GPUBufferUsageRef.UNIFORM | GPUBufferUsageRef.COPY_DST });
        var params = paramArray({ width: w, height: h, triCount: si.triCount, bvhCount: si.bvhCount, lightCount: si.lightCount, sampleCount: p.perDispatch, maxSamples: p.maxSamples, minSamples: p.minSamples, maxBounces: p.bounces, seed: seed >>> 0, ambient: si.ambient, rayBias: si.rayBias, maxRadiance: p.maxRadiance, noiseThreshold: p.noiseThreshold, envFaceSize: si.env.faceSize, envCount: si.env.count, envMode: si.env.mode, envIntensity: si.env.intensity, envRotation: si.env.rotation, envMinWorldY: si.env.minWorldY, adaptive: true, customEnvDirect: !!si.customEnvDirect, bentStrength: si.bentStrength || 0 });
        gpu.queue.writeBuffer(paramsBuffer, 0, params);
        var bind = gpu.createBindGroup({ layout: ds.bgl, entries: [{ binding: 0, resource: { buffer: paramsBuffer } }, { binding: 1, resource: { buffer: gbufBuffer } }, { binding: 2, resource: { buffer: sb.tris } }, { binding: 3, resource: { buffer: sb.bvh } }, { binding: 4, resource: { buffer: sb.lights } }, { binding: 5, resource: { buffer: eb.pixels } }, { binding: 6, resource: { buffer: eb.alias } }, { binding: 7, resource: { buffer: statsBuffer } }, { binding: 8, resource: { buffer: outBuffer } }] });
        try {
            var dispatches = Math.ceil(p.maxSamples / p.perDispatch), groupSize = Math.max(1, p.dispatchesPerSubmit || 4), done = 0;
            while (done < dispatches) {
                if (!active(owner, epoch)) throw new Error('cancelado');
                var batchEnd = Math.min(dispatches, done + groupSize), enc = gpu.createCommandEncoder({ label: 'BakePT532-Encoder-' + done });
                for (var di = done; di < batchEnd; di++) { var pass = enc.beginComputePass({ label: 'BakePT532-Pass-' + di }); pass.setPipeline(ds.pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8), 1); pass.end(); }
                if (batchEnd === dispatches) { enc.copyBufferToBuffer(outBuffer, 0, readBuffer, 0, outBytes); enc.copyBufferToBuffer(statsBuffer, 0, statsReadBuffer, 0, statsBytes); }
                gpu.queue.submit([enc.finish()]); if (typeof gpu.queue.onSubmittedWorkDone === 'function') await gpu.queue.onSubmittedWorkDone(); done = batchEnd;
            }
            if (!active(owner, epoch)) throw new Error('cancelado');
            await readBuffer.mapAsync(GPUMapModeRef.READ); var raw = new Float32Array(readBuffer.getMappedRange().slice(0)); readBuffer.unmap();
            await statsReadBuffer.mapAsync(GPUMapModeRef.READ); var rawStats = new Float32Array(statsReadBuffer.getMappedRange().slice(0)); statsReadBuffer.unmap();
            var result = new Float32Array(raw.length), sampleSum = 0, sampleMin = Infinity, sampleMax = 0, counted = 0, early = 0, relErrors = [], relSum = 0, cvSum = 0;
            for (var i = 0; i < pixelCount; i++) {
                var o = i * 4; if (gb.pos[o + 3] < 0.5) { result[o + 3] = 1; continue; }
                var n = Math.max(1, Math.round(raw[o + 3])); result[o] = raw[o] / n; result[o + 1] = raw[o + 1] / n; result[o + 2] = raw[o + 2] / n; result[o + 3] = 1;
                sampleSum += n; sampleMin = Math.min(sampleMin, n); sampleMax = Math.max(sampleMax, n); counted++; if (n < p.maxSamples) early++;
                var sn = Math.max(1, rawStats[o + 2]), mean = rawStats[o] / sn, variance = Math.max(rawStats[o + 1] / sn - mean * mean, 0), std = Math.sqrt(variance), stdError = std / Math.sqrt(sn), rel = stdError / Math.max(Math.abs(mean), 0.02), cv = std / Math.max(Math.abs(mean), 0.02);
                if (Number.isFinite(rel)) { relErrors.push(rel); relSum += rel; cvSum += cv; }
            }
            relErrors.sort(function (a, b) { return a - b; });
            function pct(q) { if (!relErrors.length) return 0; return relErrors[Math.min(relErrors.length - 1, Math.max(0, Math.round((relErrors.length - 1) * q)))]; }
            return { pixels: result, averageSamples: counted ? sampleSum / counted : 0, minSamplesUsed: counted ? sampleMin : 0, maxSamplesUsed: sampleMax, earlyConvergedPct: counted ? early * 100 / counted : 0, dispatches: dispatches, submits: Math.ceil(dispatches / groupSize), noiseThreshold: p.noiseThreshold, relativeErrorAverage: relErrors.length ? relSum / relErrors.length : 0, relativeErrorP50: pct(0.50), relativeErrorP90: pct(0.90), relativeErrorP95: pct(0.95), relativeErrorMax: relErrors.length ? relErrors[relErrors.length - 1] : 0, coefficientVariationAverage: relErrors.length ? cvSum / relErrors.length : 0 };
        } finally { [gbufBuffer, statsBuffer, outBuffer, readBuffer, statsReadBuffer, paramsBuffer].forEach(function (b) { try { b.destroy(); } catch (_) { } }); }
    }

    function aoParamArray(gb, scene, si, p, seed) {
        var ab = new ArrayBuffer(64), u = new Uint32Array(ab), f = new Float32Array(ab);
        u[0] = gb.w; u[1] = gb.h; u[2] = scene.triCount; u[3] = scene.bvhCount; u[4] = p.aoBatch; u[5] = p.aoSamples; u[6] = seed >>> 0;
        f[8] = si.rayBias; f[9] = scene.extent; f[10] = p.aoContactRadiusFraction; f[11] = p.aoCavityRadiusFraction;
        return ab;
    }
    async function traceAO(gd, sb, gb, scene, si, p, seed, owner, epoch) {
        var ds = await aoDeviceState(gd); if (!active(owner, epoch)) throw new Error('cancelado');
        var gpu = ds.gpu, w = gb.w, h = gb.h, pixelCount = w * h, gPacked = packGBuffer(gb), gBytes = gPacked.byteLength, outBytes = pixelCount * 16;
        assertBindingSize(gpu, gBytes, 'AO G-buffer ' + w + 'x' + h); assertBindingSize(gpu, outBytes, 'AO output ' + w + 'x' + h);
        var gbufBuffer = storage(gpu, gPacked, 'BakePT532-AO-GBuf'), outBuffer = emptyStorage(gpu, outBytes, 'BakePT532-AO-Out', true), bentBuffer = emptyStorage(gpu, outBytes, 'BakePT532-Bent-Out', true),
            readBuffer = gpu.createBuffer({ label: 'BakePT532-AO-Read', size: outBytes, usage: GPUBufferUsageRef.COPY_DST | GPUBufferUsageRef.MAP_READ }),
            bentRead = gpu.createBuffer({ label: 'BakePT532-Bent-Read', size: outBytes, usage: GPUBufferUsageRef.COPY_DST | GPUBufferUsageRef.MAP_READ }),
            paramsBuffer = gpu.createBuffer({ label: 'BakePT532-AO-Params', size: 64, usage: GPUBufferUsageRef.UNIFORM | GPUBufferUsageRef.COPY_DST });
        gpu.queue.writeBuffer(paramsBuffer, 0, aoParamArray(gb, scene, si, p, seed));
        var bind = gpu.createBindGroup({
            layout: ds.bgl, entries: [
                { binding: 0, resource: { buffer: paramsBuffer } }, { binding: 1, resource: { buffer: gbufBuffer } }, { binding: 2, resource: { buffer: sb.tris } }, { binding: 3, resource: { buffer: sb.bvh } }, { binding: 4, resource: { buffer: outBuffer } }, { binding: 5, resource: { buffer: bentBuffer } }
            ]
        });
        try {
            var dispatches = Math.ceil(p.aoSamples / p.aoBatch), groupSize = Math.max(1, p.aoDispatchesPerSubmit || 8), done = 0;
            while (done < dispatches) {
                if (!active(owner, epoch)) throw new Error('cancelado');
                var batchEnd = Math.min(dispatches, done + groupSize), enc = gpu.createCommandEncoder({ label: 'BakePT532-AO-Encoder-' + done });
                for (var di = done; di < batchEnd; di++) { var pass = enc.beginComputePass({ label: 'BakePT532-AO-Pass-' + di }); pass.setPipeline(ds.pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8), 1); pass.end(); }
                if (batchEnd === dispatches) { enc.copyBufferToBuffer(outBuffer, 0, readBuffer, 0, outBytes); enc.copyBufferToBuffer(bentBuffer, 0, bentRead, 0, outBytes); }
                gpu.queue.submit([enc.finish()]); if (typeof gpu.queue.onSubmittedWorkDone === 'function') await gpu.queue.onSubmittedWorkDone(); done = batchEnd;
            }
            if (!active(owner, epoch)) throw new Error('cancelado');
            await Promise.all([readBuffer.mapAsync(GPUMapModeRef.READ), bentRead.mapAsync(GPUMapModeRef.READ)]);
            var raw = new Float32Array(readBuffer.getMappedRange().slice(0)), br = new Float32Array(bentRead.getMappedRange().slice(0)); readBuffer.unmap(); bentRead.unmap();
            var contact = new Float32Array(pixelCount), cavity = new Float32Array(pixelCount), bent = new Float32Array(pixelCount * 4), radiusSum = 0, valid = 0;
            for (var i = 0; i < pixelCount; i++) {
                var o = i * 4;
                if (gb.pos[o + 3] < 0.5) { contact[i] = 1; cavity[i] = 1; bent[o] = gb.nrm[o]; bent[o + 1] = gb.nrm[o + 1]; bent[o + 2] = gb.nrm[o + 2]; bent[o + 3] = 1; continue; }
                var samples = Math.max(1, Math.round(raw[o + 3])); contact[i] = clamp(raw[o] / samples, 0, 1); cavity[i] = clamp(raw[o + 1] / samples, 0, 1); radiusSum += raw[o + 2]; valid++;
                var bx = br[o], by = br[o + 1], bz = br[o + 2], bl = Math.hypot(bx, by, bz);
                if (bl < 1e-8) { bx = gb.nrm[o]; by = gb.nrm[o + 1]; bz = gb.nrm[o + 2]; bl = Math.hypot(bx, by, bz) || 1; }
                bent[o] = bx / bl; bent[o + 1] = by / bl; bent[o + 2] = bz / bl; bent[o + 3] = 1;
            }
            return { contact: contact, cavity: cavity, bent: bent, averageRadius: valid ? radiusSum / valid : 0, dispatches: dispatches, submits: Math.ceil(dispatches / groupSize) };
        } finally { [gbufBuffer, outBuffer, bentBuffer, readBuffer, bentRead, paramsBuffer].forEach(function (b) { try { b.destroy(); } catch (_) { } }); }
    }

    function denoiseIndirect(src, gb, extent, p) { if (p.denoise <= 0) return src; var w = gb.w, h = gb.h, a = new Float32Array(src), b = new Float32Array(src.length), K = [1, 4, 6, 4, 1], basePos = Math.max(1e-6, extent / Math.max(w, h) * p.positionScale); for (var it = 0; it < p.denoise; it++) { var step = 1 << it, posSigma = basePos * Math.max(1, step * 0.5), invPos = 1 / (2 * posSigma * posSigma); for (var y = 0; y < h; y++)for (var x = 0; x < w; x++) { var o = (y * w + x) * 4; if (gb.pos[o + 3] < 0.5) { b[o] = a[o]; b[o + 1] = a[o + 1]; b[o + 2] = a[o + 2]; b[o + 3] = a[o + 3]; continue; } var px = gb.pos[o], py = gb.pos[o + 1], pz = gb.pos[o + 2], nx = gb.nrm[o], ny = gb.nrm[o + 1], nz = gb.nrm[o + 2], chart = gb.nrm[o + 3], cr = a[o], cg = a[o + 1], cb = a[o + 2], cl = luminance(cr, cg, cb), sr = 0, sg = 0, sb = 0, sw = 0; for (var ky = -2; ky <= 2; ky++) { var sy = y + ky * step; if (sy < 0 || sy >= h) continue; for (var kx = -2; kx <= 2; kx++) { var sx = x + kx * step; if (sx < 0 || sx >= w) continue; var q = (sy * w + sx) * 4; if (gb.pos[q + 3] < 0.5 || gb.nrm[q + 3] !== chart) continue; var dx = gb.pos[q] - px, dy = gb.pos[q + 1] - py, dz = gb.pos[q + 2] - pz, wp = Math.exp(-(dx * dx + dy * dy + dz * dz) * invPos), nd = Math.max(0, nx * gb.nrm[q] + ny * gb.nrm[q + 1] + nz * gb.nrm[q + 2]), wn = Math.pow(nd, p.normalPower), ql = luminance(a[q], a[q + 1], a[q + 2]), wc = Math.exp(-Math.abs(ql - cl) / (0.01 + Math.max(cl, ql) * p.colorScale)), wk = K[kx + 2] * K[ky + 2], ww = wk * wp * wn * wc; sr += a[q] * ww; sg += a[q + 1] * ww; sb += a[q + 2] * ww; sw += ww; } } if (sw > 1e-12) { b[o] = sr / sw; b[o + 1] = sg / sw; b[o + 2] = sb / sw; } else { b[o] = cr; b[o + 1] = cg; b[o + 2] = cb; } b[o + 3] = 1; } var tmp = a; a = b; b = tmp; } return a; }
    function denoiseAO(ao, gb, extent, p) { var rgba = new Float32Array(ao.length * 4); for (var i = 0; i < ao.length; i++) { var o = i * 4; rgba[o] = ao[i]; rgba[o + 1] = ao[i]; rgba[o + 2] = ao[i]; rgba[o + 3] = 1; } rgba = denoiseIndirect(rgba, gb, extent, p); var result = new Float32Array(ao.length); for (i = 0; i < ao.length; i++) result[i] = clamp(rgba[i * 4], 0, 1); return result; }
    function summarizeAO(ao, gb) { var sum = 0, min = 1, max = 0, count = 0; for (var i = 0; i < ao.length; i++) { if (gb.pos[i * 4 + 3] < 0.5) continue; var v = clamp(ao[i], 0, 1); sum += v; min = Math.min(min, v); max = Math.max(max, v); count++; } return { average: count ? sum / count : 1, min: count ? min : 1, max: count ? max : 1 }; }

    function summarizeRadiance(pixels, gb) {
        var sum = 0, max = 0, over1 = 0, over2 = 0, count = 0;
        for (var i = 0; i < pixels.length / 4; i++) {
            if (gb && gb.pos[i * 4 + 3] < 0.5) continue;
            var o = i * 4;
            var y = luminance(Math.max(0, pixels[o]), Math.max(0, pixels[o + 1]), Math.max(0, pixels[o + 2]));
            if (!Number.isFinite(y)) continue;
            sum += y;
            max = Math.max(max, y);
            if (y > 1) over1++;
            if (y > 2) over2++;
            count++;
        }
        return { average: count ? sum / count : 0, max: max, over1Pct: count ? over1 * 100 / count : 0, over2Pct: count ? over2 * 100 / count : 0 };
    }

    function canWrite(tex) { var f = tex && tex.format; return f === pc.PIXELFORMAT_RGBA8 || f === pc.PIXELFORMAT_SRGBA8 || f === pc.PIXELFORMAT_111110F || f === pc.PIXELFORMAT_RGBA16F || f === pc.PIXELFORMAT_RGBA32F || f === pc.PIXELFORMAT_RGB16F || f === pc.PIXELFORMAT_RGB32F; }
    async function readNativeLightmap(tex, w, h) { if (!canWrite(tex)) throw new Error('Formato nativo no soportado: ' + tex.format); var raw = await tex.read(0, 0, w, h, { immediate: true }); return decodeTexturePixels(tex, raw, w, h); }
    function writeTexture(tex, pixels, w, h, maxRadiance) { if (!canWrite(tex)) throw new Error('Formato de lightmap no soportado: ' + tex.format); var dst = tex.lock({ level: 0, face: 0 }); if (!dst) throw new Error('texture.lock() no devolvio buffer.'); var view = new DataView(dst.buffer, dst.byteOffset, dst.byteLength), count = w * h, mode = ''; try { var i, r, g, b, off, ch; if (tex.format === pc.PIXELFORMAT_111110F) { mode = 'R11G11B10F'; for (i = 0; i < count; i++) { r = clamp(Number.isFinite(pixels[i * 4]) ? pixels[i * 4] : 0, 0, maxRadiance); g = clamp(Number.isFinite(pixels[i * 4 + 1]) ? pixels[i * 4 + 1] : 0, 0, maxRadiance); b = clamp(Number.isFinite(pixels[i * 4 + 2]) ? pixels[i * 4 + 2] : 0, 0, maxRadiance); view.setUint32(i * 4, packR11G11B10(r, g, b), true); } } else if (tex.format === pc.PIXELFORMAT_RGBA16F || tex.format === pc.PIXELFORMAT_RGB16F) { ch = tex.format === pc.PIXELFORMAT_RGBA16F ? 4 : 3; mode = ch === 4 ? 'RGBA16F' : 'RGB16F'; for (i = 0; i < count; i++) { r = clamp(pixels[i * 4] || 0, 0, maxRadiance); g = clamp(pixels[i * 4 + 1] || 0, 0, maxRadiance); b = clamp(pixels[i * 4 + 2] || 0, 0, maxRadiance); off = i * ch * 2; view.setUint16(off, floatToHalf(r), true); view.setUint16(off + 2, floatToHalf(g), true); view.setUint16(off + 4, floatToHalf(b), true); if (ch === 4) view.setUint16(off + 6, 0x3c00, true); } } else if (tex.format === pc.PIXELFORMAT_RGBA32F || tex.format === pc.PIXELFORMAT_RGB32F) { ch = tex.format === pc.PIXELFORMAT_RGBA32F ? 4 : 3; mode = ch === 4 ? 'RGBA32F' : 'RGB32F'; for (i = 0; i < count; i++) { r = clamp(pixels[i * 4] || 0, 0, maxRadiance); g = clamp(pixels[i * 4 + 1] || 0, 0, maxRadiance); b = clamp(pixels[i * 4 + 2] || 0, 0, maxRadiance); off = i * ch * 4; view.setFloat32(off, r, true); view.setFloat32(off + 4, g, true); view.setFloat32(off + 8, b, true); if (ch === 4) view.setFloat32(off + 12, 1, true); } } else { var rgbm = tex.type === pc.TEXTURETYPE_RGBM || tex.encoding === 'rgbm', srgb = tex.format === pc.PIXELFORMAT_SRGBA8 || !!tex.srgb, q = [0, 0, 0, 1]; mode = rgbm ? 'RGBM8' : (srgb ? 'sRGBA8' : 'RGBA8-linear'); for (i = 0; i < count; i++) { r = clamp(pixels[i * 4] || 0, 0, maxRadiance); g = clamp(pixels[i * 4 + 1] || 0, 0, maxRadiance); b = clamp(pixels[i * 4 + 2] || 0, 0, maxRadiance); off = i * 4; if (rgbm) { encodeRGBM(r, g, b, q); dst[off] = Math.round(q[0] * 255); dst[off + 1] = Math.round(q[1] * 255); dst[off + 2] = Math.round(q[2] * 255); dst[off + 3] = Math.round(q[3] * 255); } else if (srgb) { dst[off] = Math.round(linearToSrgb1(r) * 255); dst[off + 1] = Math.round(linearToSrgb1(g) * 255); dst[off + 2] = Math.round(linearToSrgb1(b) * 255); dst[off + 3] = 255; } else { dst[off] = Math.round(clamp(r, 0, 1) * 255); dst[off + 1] = Math.round(clamp(g, 0, 1) * 255); dst[off + 2] = Math.round(clamp(b, 0, 1) * 255); dst[off + 3] = 255; } } } } finally { tex.unlock(); } return { mode: mode, format: tex.format, type: tex.type, encoding: tex.encoding }; }

    function combineNativeAndIndirect(nativePixels, indirect, aoContact, aoCavity, gb, maxRadiance, p, aoStrength) {
        var out = new Float32Array(nativePixels.length), count = nativePixels.length / 4, s = clamp(aoStrength, 0, 1);
        for (var i = 0; i < count; i++) {
            var o = i * 4;
            if (gb.pos[o + 3] > 0.5) {
                var contact = aoContact ? clamp(aoContact[i], 0, 1) : 1, cavity = aoCavity ? clamp(aoCavity[i], 0, 1) : 1;
                var contactOcc = 1 - contact, cavityOcc = 1 - cavity;
                var indirectFactor = 1 - s * p.aoIndirectStrength * cavityOcc;
                var nativeContactFactor = 1 - s * p.aoContactStrength * Math.pow(contactOcc, 1.35);
                var r = nativePixels[o] * nativeContactFactor + Math.max(0, indirect[o]) * indirectFactor;
                var g = nativePixels[o + 1] * nativeContactFactor + Math.max(0, indirect[o + 1]) * indirectFactor;
                var b = nativePixels[o + 2] * nativeContactFactor + Math.max(0, indirect[o + 2]) * indirectFactor;
                out[o] = clamp(r, 0, maxRadiance); out[o + 1] = clamp(g, 0, maxRadiance); out[o + 2] = clamp(b, 0, maxRadiance);
            } else { out[o] = nativePixels[o]; out[o + 1] = nativePixels[o + 1]; out[o + 2] = nativePixels[o + 2]; }
            out[o + 3] = 1;
        }
        return out;
    }

    function suppressDynamicNonLightmappedCasters(lm) { var ri = rootOf(lm), changed = []; if (!ri.root) return changed;['render', 'model'].forEach(function (type) { var comps = []; try { comps = ri.root.findComponents(type) || []; } catch (_) { comps = []; } comps.forEach(function (comp) { if (!comp || !comp.enabled || !comp.entity || !comp.entity.enabled) return; if (comp.castShadowsLightmap === true && comp.lightmapped !== true && comp.isStatic !== true) { changed.push(comp); comp.castShadowsLightmap = false; } }); }); return changed; }
    function restoreSuppressedCasters(changed) { for (var i = 0; i < changed.length; i++)try { changed[i].castShadowsLightmap = true; } catch (_) { } }

    async function run(lm, bakeNodes, passCount, gd, owner, epoch) {
        if (!active(owner, epoch)) return;
        if (!webgpuOK(gd)) { warn('WebGPU Compute no disponible; se conserva el bake nativo.'); return; }
        var p = preset(owner), t0 = now(), sc = lm.scene, aoStrength = clamp((isNum(owner.aoStrength) ? owner.aoStrength : 0) / 100, 0, 1);
        var env = await buildEnvironment(sc, p); if (!active(owner, epoch)) return;
        var envPixelCount = env.pixels.length / 4, texDB = await prepareMaterialTextures(lm, p, envPixelCount); if (!active(owner, epoch)) return;
        var scene = collectScene(lm, bakeNodes, p, texDB), lights = collectLights(lm), ambient = [0, 0, 0];
        if (sc && sc.ambientLight) ambient = [srgbToLinear1(sc.ambientLight.r), srgbToLinear1(sc.ambientLight.g), srgbToLinear1(sc.ambientLight.b)];
        var pool = new Float32Array(env.pixels.length + texDB.pixels.length); pool.set(env.pixels, 0); pool.set(texDB.pixels, env.pixels.length);
        var rayBias = Math.max(0.00005, scene.extent * 0.000025), customEnvDirect = env.mode !== 0 && (!sc || !sc.ambientBake || !!lm[CAP_AMBIENT_REPLACED]);
        var appCfg = { lightmapSizeMultiplier: sc && sc.lightmapSizeMultiplier, lightmapMaxResolution: sc && sc.lightmapMaxResolution, lightmapHDRConfigured: sc && sc.lightmapHDR, lightmapHDRUsed: !!lm[CAP_HDR_USED], nativeAmbientReplaced: !!lm[CAP_AMBIENT_REPLACED], lightmapPixelFormatNow: sc && sc.lightmapPixelFormat, lightmapMode: sc && sc.lightmapMode, filterEnabled: sc && sc.lightmapFilterEnabled, filterRange: sc && sc.lightmapFilterRange, filterSmoothness: sc && sc.lightmapFilterSmoothness, ambientBake: sc && sc.ambientBake, ambientBakeNumSamples: sc && sc.ambientBakeNumSamples, ambientBakeSpherePart: sc && sc.ambientBakeSpherePart, physicalUnits: sc && sc.physicalUnits, skyboxIntensity: sc && sc.skyboxIntensity, skyboxLuminance: sc && sc.skyboxLuminance };
        G.__bakePathTracingLastReport = { version: VERSION, quality: p.label, aoStrength: aoStrength * 100, app: appCfg, geometry: scene.stats, triangles: scene.triCount, bvhNodes: scene.bvhCount, lights: lights.stats, materialTextures: { loaded: texDB.textureCount, failed: texDB.failedCount, texels: texDB.texelCount, maxResolution: p.materialResolution }, environment: { mode: env.mode, source: env.source, faceSize: env.faceSize, count: env.count, intensity: env.intensity, minWorldY: env.minWorldY, readMs: env.readMs, customDirect: customEnvDirect, diagnostics: env.diagnostics || null }, nodes: [] };

        log('Version ' + VERSION + ' | ' + p.label + ' | GI adaptive ' + p.minSamples + '..' + p.maxSamples + ' spp | ' + p.bounces + ' bounces | AO=' + Math.round(aoStrength * 100) + '% (' + (aoStrength > 0 ? p.aoSamples + ' spp dual-radius + bent normals' : 'OFF') + ')');
        log('Arquitectura: direct/native + alpha/native + dir/native + indirect/WebGPU PT + Environment MIS + PBR diffuse/emissive/metalness sampling + dual-radius AO + bent normals.');
        log('Configuracion APP: ' + JSON.stringify(appCfg));
        log('HDR lightmap: ' + (lm[CAP_HDR_USED] ? 'ON' : 'OFF') + ' (se respeta Scene; PT5.3.2 no fuerza HDR).');
        log('PBR texture pool: ' + texDB.textureCount + ' textura(s), ' + texDB.texelCount + ' texels, maxMap=' + p.materialResolution + ', fallos=' + texDB.failedCount);
        log('Transporte PT: ' + scene.transportGeoms.length + ' meshes, ' + scene.triCount + ' tris, BVH ' + scene.bvhCount + ' nodos; receivers=' + scene.receivers.size);
        log('Filtro geometria: ' + JSON.stringify(scene.stats));
        log('Bounds ' + fmt(scene.boundsMin, 2) + ' -> ' + fmt(scene.boundsMax, 2) + ' rayBias=' + rayBias);
        log('Luces bake=' + lights.count + ': ' + JSON.stringify(lights.stats));
        if (lights.stats.runtimeAffectLightmapped > 0) warn(lights.stats.runtimeAffectLightmapped + ' luz/luces NO baked siguen con Affect Lightmapped=true.');
        if (scene.stats.transparentTransportExcluded > 0) log('Transparentes/cutout excluidos SOLO del transporte PT/AO: ' + scene.stats.transparentTransportExcluded);
        if (lm[CAP_AMBIENT_REPLACED]) log('Ambient Bake nativo: REEMPLAZADO. PT5.3.2 calcula environment y AO sin el oscurecimiento AO nativo.');
        lights.report.forEach(function (l) { log('  luz "' + l.entity + '" ' + l.type + ' color=' + fmt(l.color) + ' shadow=' + l.castShadows + ' bakeArea=' + l.bakeArea); });
        if (env.mode === 1) {
            log('Environment GI: ' + env.source + ' face=' + env.faceSize + 'x' + env.faceSize + ' texels=' + env.count + ' intensity=' + env.intensity.toFixed(4) + ' minWorldY=' + env.minWorldY.toFixed(4) + ' prep=' + env.readMs + 'ms | importance sampling + MIS | direct=' + (customEnvDirect ? 'PT' : 'native'));
            if (env.diagnostics) log('  Environment energy: meanLum=' + env.diagnostics.meanLuminance.toFixed(4) + ' maxLum=' + env.diagnostics.maxLuminance.toFixed(4) + ' solidAngle=' + env.diagnostics.solidAngle.toFixed(4) + ' sr | pi*mean=' + env.diagnostics.isotropicDiffuseEstimate.toFixed(4) + ' | Up irradiance=' + env.diagnostics.upIrradiance.toFixed(4) + ' rgb=' + fmt(env.diagnostics.upIrradianceRgb, 4));
            if (customEnvDirect && aoStrength > 0) log('  Primary Environment: bent-normal NEE sin peso MIS; MIS completo se mantiene en rebotes. Evita mezclar PDFs de normal geometrica y bent normal.');
        }
        else log('Environment GI: OFF (' + env.source + ').');

        if (!scene.triCount) { warn('No hay geometria estatica de transporte; queda bake nativo.'); return; }
        var doGI = lights.count > 0 || env.mode !== 0;
        if (!doGI && aoStrength <= 0) { warn('No hay fuentes GI ni AO habilitado; queda bake nativo.'); return; }
        var gpu = nativeGPUDevice(gd); if (!gpu) { warn('GPUDevice no disponible despues del bake.'); return; }
        var ds = doGI ? await deviceState(gd) : null; if (!active(owner, epoch)) return;
        var sb = { tris: storage(gpu, scene.tris, 'BakePT532-Tris'), bvh: storage(gpu, scene.bvh, 'BakePT532-BVH'), lights: storage(gpu, lights.data, 'BakePT532-Lights') };
        var eb = doGI ? { pixels: storage(gpu, pool, 'BakePT532-PixelPool'), alias: storage(gpu, env.alias, 'BakePT532-EnvAlias'), pixelBytes: pool.byteLength, aliasBytes: env.alias.byteLength } : null;
        var si = { triCount: scene.triCount, bvhCount: scene.bvhCount, lightCount: lights.count, ambient: ambient, rayBias: rayBias, env: env, customEnvDirect: customEnvDirect, bentStrength: aoStrength };

        try {
            for (var n = 0; n < bakeNodes.length; n++) {
                if (!active(owner, epoch)) break;
                var bn = bakeNodes[n], name = (bn.node && bn.node.name) || ('node' + n), nodeGeoms = [], mis = bn.meshInstances || [];
                for (var i = 0; i < mis.length; i++) { if (!scene.receivers.has(mis[i])) continue; var g = scene.cache.get(mis[i]); if (g && g.ok) nodeGeoms.push(g); }
                if (!nodeGeoms.length) { log('SKIP "' + name + '": sin receiver lightmapped.'); continue; }
                var ft = finalTextures(bn, scene.receivers); if (!ft.color) { warn('No se encontro texture_lightMap final de "' + name + '"; queda nativo.'); continue; }
                var tex = ft.color, w = Math.max(1, tex.width | 0), h = Math.max(1, tex.height | 0);
                if (!canWrite(tex)) { warn('Formato ' + tex.format + ' no soportado para "' + name + '"; queda nativo.'); continue; }
                if (Math.max(w, h) <= 64) warn('Lightmap "' + name + '" sigue en ' + w + 'x' + h + '. AO/bent normals y PBR GI necesitan mas resolucion para detalle AAA.');

                var nativeStart = now(), nativePixels = await readNativeLightmap(tex, w, h), nativeReadMs = Math.round(now() - nativeStart), gb = buildGBuffer(nodeGeoms, w, h);
                dilateGB(gb, p.dilation); applyBentNormalsToGBuffer(gb, null);
                var coverage = 100 * gb.valid / (w * h), nativeStats = summarizeRadiance(nativePixels, gb);
                log('BakeNode "' + name + '" ' + w + 'x' + h + ' coverage=' + coverage.toFixed(1) + '% texture="' + tex.name + '" format=' + tex.format + ' type=' + tex.type + ' encoding=' + tex.encoding + ' nativeRead=' + nativeReadMs + 'ms');
                log('  Native radiance avg=' + nativeStats.average.toFixed(3) + ' max=' + nativeStats.max.toFixed(3) + ' >1=' + nativeStats.over1Pct.toFixed(1) + '% >2=' + nativeStats.over2Pct.toFixed(1) + '%');
                var nt = { name: name, width: w, height: h, coverage: coverage, format: tex.format, type: tex.type, encoding: tex.encoding, nativeReadMs: nativeReadMs }; G.__bakePathTracingLastReport.nodes.push(nt);
                if (!gb.valid) continue;

                var aoContact = null, aoCavity = null, bent = null;
                if (aoStrength > 0) {
                    var aoStart = now(), aoTrace = await traceAO(gd, sb, gb, scene, si, p, 9187 + n * 3571, owner, epoch); if (!active(owner, epoch)) break;
                    nt.aoTraceMs = Math.round(now() - aoStart); nt.aoSamples = p.aoSamples; nt.aoDispatches = aoTrace.dispatches; nt.aoSubmits = aoTrace.submits; nt.aoAverageRadius = aoTrace.averageRadius;
                    var aoDenoiseStart = now(); aoContact = denoiseAO(aoTrace.contact, gb, scene.extent, p); aoCavity = denoiseAO(aoTrace.cavity, gb, scene.extent, p); nt.aoDenoiseMs = Math.round(now() - aoDenoiseStart);
                    bent = aoTrace.bent; applyBentNormalsToGBuffer(gb, bent);
                    var cs = summarizeAO(aoContact, gb), vs = summarizeAO(aoCavity, gb);
                    nt.aoContactAverage = cs.average; nt.aoCavityAverage = vs.average; nt.aoContactMin = cs.min; nt.aoCavityMin = vs.min;
                    log('  AO Ray Traced ' + Math.round(aoStrength * 100) + '%: ' + p.aoSamples + ' spp cavityRadius~' + aoTrace.averageRadius.toFixed(4) + ' trace=' + nt.aoTraceMs + 'ms submits=' + aoTrace.submits + ' denoise=' + nt.aoDenoiseMs + 'ms contactAvg=' + cs.average.toFixed(3) + ' cavityAvg=' + vs.average.toFixed(3) + ' min=[' + cs.min.toFixed(3) + '/' + vs.min.toFixed(3) + '] + bentNormals');
                }

                var indirect = new Float32Array(w * h * 4), trace = null;
                if (doGI) {
                    var ts = now(); trace = await traceGPU(ds, sb, eb, gb, si, p, 1234 + n * 7919, owner, epoch); if (!active(owner, epoch)) break;
                    nt.traceMs = Math.round(now() - ts); nt.averageSamples = trace.averageSamples; nt.minSamplesUsed = trace.minSamplesUsed; nt.maxSamplesUsed = trace.maxSamplesUsed; nt.earlyConvergedPct = trace.earlyConvergedPct; nt.giDispatches = trace.dispatches; nt.giSubmits = trace.submits; nt.adaptiveNoiseThreshold = trace.noiseThreshold; nt.relativeErrorAverage = trace.relativeErrorAverage; nt.relativeErrorP50 = trace.relativeErrorP50; nt.relativeErrorP90 = trace.relativeErrorP90; nt.relativeErrorP95 = trace.relativeErrorP95; nt.relativeErrorMax = trace.relativeErrorMax; nt.coefficientVariationAverage = trace.coefficientVariationAverage;
                    var td = now(); indirect = denoiseIndirect(trace.pixels, gb, scene.extent, p); nt.denoiseMs = Math.round(now() - td);
                } else { nt.traceMs = 0; nt.denoiseMs = 0; }

                var finalPixels = combineNativeAndIndirect(nativePixels, indirect, aoContact, aoCavity, gb, p.maxRadiance, p, aoStrength), finalStats = summarizeRadiance(finalPixels, gb), wr = writeTexture(tex, finalPixels, w, h, p.maxRadiance);
                nt.writer = wr.mode; nt.finalRadiance = finalStats;
                log('  Final radiance avg=' + finalStats.average.toFixed(3) + ' max=' + finalStats.max.toFixed(3) + ' >1=' + finalStats.over1Pct.toFixed(1) + '% >2=' + finalStats.over2Pct.toFixed(1) + '%');
                if (trace) {
                    log('  OK indirectTrace=' + nt.traceMs + 'ms adaptive avg=' + trace.averageSamples.toFixed(1) + ' spp [' + trace.minSamplesUsed + '..' + trace.maxSamplesUsed + '] early=' + trace.earlyConvergedPct.toFixed(1) + '% dispatches=' + trace.dispatches + ' submits=' + trace.submits + ' denoise=' + nt.denoiseMs + 'ms + nativeDirect writer=' + wr.mode);
                    log('  Adaptive error: target=' + (trace.noiseThreshold * 100).toFixed(2) + '% avg=' + (trace.relativeErrorAverage * 100).toFixed(2) + '% p50=' + (trace.relativeErrorP50 * 100).toFixed(2) + '% p90=' + (trace.relativeErrorP90 * 100).toFixed(2) + '% p95=' + (trace.relativeErrorP95 * 100).toFixed(2) + '% max=' + (trace.relativeErrorMax * 100).toFixed(2) + '% avgCV=' + trace.coefficientVariationAverage.toFixed(3));
                }
                else log('  OK AO-only + nativeDirect writer=' + wr.mode);
            }
        } finally {
            [sb.tris, sb.bvh, sb.lights].forEach(function (b) { try { b.destroy(); } catch (_) { } });
            if (eb) [eb.pixels, eb.alias].forEach(function (b) { try { b.destroy(); } catch (_) { } });
        }
        log('Hybrid Path Tracing PT5.3.2 terminado en ' + Math.round(now() - t0) + ' ms. Direct shadows y texture_dirLightMap permanecen nativos; GI/AO/bent normals quedan horneados en texture_lightMap.');
    }

    function restoreLegacy(LP) {
        var candidates = [G.__bakePathTracingPT531 && G.__bakePathTracingPT531.state, G.__bakePathTracingPT530 && G.__bakePathTracingPT530.state, G.__bakePathTracingPT521 && G.__bakePathTracingPT521.state, G.__bakePathTracingPT52 && G.__bakePathTracingPT52.state, G.__bakePathTracingPT51 && G.__bakePathTracingPT51.state, G.__bakePathTracingPT50 && G.__bakePathTracingPT50.state, G.__bakePathTracingPT42 && G.__bakePathTracingPT42.state, G.__bakePathTracingPT41 && G.__bakePathTracingPT41.state, G.__bakePathTracingPT4State];
        candidates.forEach(function (old) { if (!old || !old.installed) return; if (typeof old.nativeBake === 'function') LP.bake = old.nativeBake; if (typeof old.nativePost === 'function') LP.postprocessTextures = old.nativePost; if (typeof old.nativePostprocess === 'function') LP.postprocessTextures = old.nativePostprocess; old.installed = false; old.owner = null; old.epoch = (old.epoch || 0) + 1; });
        if (typeof LP.__bakePathTracingOriginalBake === 'function') LP.bake = LP.__bakePathTracingOriginalBake;
        if (typeof LP.__bakePathTracingOriginalPostprocessTextures === 'function') LP.postprocessTextures = LP.__bakePathTracingOriginalPostprocessTextures;
    }
    function install(owner) {
        if (!pc.Lightmapper || !pc.Lightmapper.prototype) { fail('pc.Lightmapper no disponible.'); return; }
        var LP = pc.Lightmapper.prototype, s = getState();
        if (s.installed) { s.owner = owner; s.epoch++; return; }
        restoreLegacy(LP); s.nativeBake = LP.bake; s.nativePost = LP.postprocessTextures;
        if (typeof s.nativeBake !== 'function' || typeof s.nativePost !== 'function') { fail('No se encontraron funciones nativas del Lightmapper.'); return; }
        s.patchedPost = function (device, bakeNodes, passCount) { var r = s.nativePost.apply(this, arguments); this[CAP_DEVICE] = device; this[CAP_NODES] = bakeNodes; this[CAP_PASS] = passCount; return r; };
        s.patchedBake = function (nodes, mode) {
            var lm = this, ownerNow = s.owner;
            if (!s.installed || !ownerNow || !ownerNow.enabled) return s.nativeBake.apply(lm, arguments);
            lm[CAP_NODES] = null; lm[CAP_PASS] = 0; lm[CAP_DEVICE] = null; lm[CAP_HDR_USED] = false; lm[CAP_AMBIENT_REPLACED] = false; s.epoch++;
            var epoch = s.epoch, pp = preset(ownerNow), sc = lm.scene, suppressed = suppressDynamicNonLightmappedCasters(lm), originalHDR = sc ? !!sc.lightmapHDR : false, originalAmbientBake = sc ? !!sc.ambientBake : false, replaceNativeAmbient = !!(sc && originalAmbientBake);
            if (suppressed.length) log('Bake nativo: suprimiendo temporalmente ' + suppressed.length + ' caster(s) dinamicos no-lightmapped.');
            if (replaceNativeAmbient) { sc.ambientBake = false; lm[CAP_AMBIENT_REPLACED] = true; log('Ambient Bake nativo temporalmente OFF: PT5.3.2 reemplaza environment/AO con ray tracing para evitar el AO nativo.'); }
            lm[CAP_HDR_USED] = originalHDR;
            var r;
            try { r = s.nativeBake.apply(lm, arguments); }
            finally { restoreSuppressedCasters(suppressed); if (replaceNativeAmbient && sc) sc.ambientBake = originalAmbientBake; }
            var bakeNodes = lm[CAP_NODES];
            if (!Array.isArray(bakeNodes) || !bakeNodes.length) { warn('Bake nativo termino sin bakeNodes capturados.'); return r; }
            log('Bake nativo listo: mode=' + mode + ' passCount=' + (lm[CAP_PASS] || 1) + ' nodes=' + bakeNodes.length + ' | calidad=' + pp.label + ' | HDR usado=' + lm[CAP_HDR_USED] + ' | APP sizeMultiplier=' + (sc && sc.lightmapSizeMultiplier) + ' maxRes=' + (sc && sc.lightmapMaxResolution) + ' | AO=' + Math.round(clamp((ownerNow.aoStrength || 0), 0, 100)) + '% | AmbientNativeReplaced=' + lm[CAP_AMBIENT_REPLACED]);
            try {
                var promise = run(lm, bakeNodes, lm[CAP_PASS] || 1, lm[CAP_DEVICE] || lm.device || (lm.app && lm.app.graphicsDevice), ownerNow, epoch);
                lm[CAP_PROMISE] = promise;
                if (promise && typeof promise.catch === 'function') promise.catch(function (e) { var text = String(e && e.message || e); if (text.indexOf('cancelado') >= 0) log('Bake PT cancelado.'); else fail('Error Hybrid Path Tracing PT5.3.2:', e); });
            } catch (e) { fail('No se pudo iniciar Hybrid Path Tracing PT5.3.2:', e); }
            return r;
        };
        LP.postprocessTextures = s.patchedPost; LP.bake = s.patchedBake; s.owner = owner; s.installed = true; s.epoch++;
        G.__bakePathTracingPT532 = { version: VERSION, state: s, shader: WGSL, aoShader: AO_WGSL, quality: QUALITY, lastReport: function () { return G.__bakePathTracingLastReport; } };
        log('Hook ' + VERSION + ' ACTIVADO. Direct=nativo; GI=WebGPU PT; Environment=automatico + MIS corregido/bent-safe; PBR maps=diffuse+emissive+metalness; AO=0..100%; BentNormals=ON cuando AO>0; HDR se respeta.');
    }
    function uninstall(owner) {
        var s = getState(); if (!s.installed) return; if (owner && s.owner && s.owner !== owner) return;
        if (pc.Lightmapper && pc.Lightmapper.prototype) { var LP = pc.Lightmapper.prototype; if (s.nativeBake) LP.bake = s.nativeBake; if (s.nativePost) LP.postprocessTextures = s.nativePost; }
        s.installed = false; s.owner = null; s.epoch++; console.log('[BakePT5.3.2] Hook DESACTIVADO. Los proximos bakes son PlayCanvas nativo.');
    }
    BakePathTracing.prototype.initialize = function () {
        var self = this;
        this.on('enable', function () { install(self); });
        this.on('disable', function () { uninstall(self); });
        this.on('destroy', function () { uninstall(self); });
        this.on('attr:quality', function () { log('Calidad cambiada a ' + preset(self).label + '. Se aplicara al proximo bake.'); });
        this.on('attr:aoStrength', function (value) { log('AO Horneado = ' + Math.round(clamp(value || 0, 0, 100)) + '%. Se aplicara al proximo bake.'); });
        if (this.enabled) install(this);
    };
    BakePathTracing.prototype.swap = function () { if (this.enabled) install(this); };
})();