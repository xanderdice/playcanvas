/*
 * bakePathTracing.js - PlayCanvas 2.22.6 - PT 5.0.0 HYBRID GI
 *
 * Root Script Component.
 * ON  = native PlayCanvas lightmap (direct / alpha / direction) + WebGPU path-traced indirect GI.
 * OFF = native PlayCanvas lightmapper only.
 *
 * Important policy:
 * - Lightmapped components are receivers.
 * - Non-lightmapped objects only enter the baked/static solution when isStatic=true.
 * - Dynamic non-lightmapped objects are temporarily removed from native lightmap shadow casting
 *   while this script is enabled, and excluded from the PT BVH. Mark an object Static if you want
 *   it to cast a permanent baked shadow while remaining non-lightmapped.
 * - Transparent / alpha-cutout static meshes are left to the native direct bake, but excluded from
 *   PT indirect transport unless opaque. This avoids false solid blockers until full alpha-BSDF
 *   traversal is implemented.
 */

var BakePathTracing = pc.createScript('bakePathTracing');

BakePathTracing.attributes.add('quality', {
    type: 'string',
    default: 'maximum',
    title: 'Calidad',
    enum: [
        { 'Minima': 'minimum' },
        { 'Media': 'medium' },
        { 'Maxima': 'maximum' },
        { 'Ultrarealista': 'ultra' }
    ]
});

(function () {
    'use strict';

    var G = globalThis;
    var VERSION = '2.22.6-PT-5.0.0-HYBRID-GI';
    var STATE_KEY = '__bakePathTracingPT50State';
    var CAP_NODES = '__bakePT50Nodes';
    var CAP_PASS = '__bakePT50Pass';
    var CAP_DEVICE = '__bakePT50Device';
    var CAP_PROMISE = '__bakePT50Promise';

    var GPUBufferUsageRef = G.GPUBufferUsage || {
        MAP_READ: 0x0001,
        MAP_WRITE: 0x0002,
        COPY_SRC: 0x0004,
        COPY_DST: 0x0008,
        INDEX: 0x0010,
        VERTEX: 0x0020,
        UNIFORM: 0x0040,
        STORAGE: 0x0080
    };

    var GPUShaderStageRef = G.GPUShaderStage || { COMPUTE: 0x4 };
    var GPUMapModeRef = G.GPUMapMode || { READ: 0x0001, WRITE: 0x0002 };
    var DEVICE_CACHE = new WeakMap();

    // The PT solves INDIRECT irradiance only. Native PlayCanvas remains the ground truth for
    // primary/direct lighting, alpha-tested shadows and directional-lightmap data.
    var QUALITY = {
        minimum: {
            label: 'Minima',
            samples: 64,
            perDispatch: 16,
            bounces: 2,
            leaf: 8,
            denoise: 2,
            dilation: 2,
            maxRadiance: 32,
            normalPower: 96,
            positionScale: 1.5,
            colorScale: 0.45
        },

        medium: {
            label: 'Media',
            samples: 256,
            perDispatch: 16,
            bounces: 3,
            leaf: 6,
            denoise: 2,
            dilation: 3,
            maxRadiance: 64,
            normalPower: 128,
            positionScale: 1.25,
            colorScale: 0.35
        },

        maximum: {
            label: 'Maxima',
            samples: 1024,
            perDispatch: 32,
            bounces: 5,
            leaf: 4,
            denoise: 1,
            dilation: 4,
            maxRadiance: 128,
            normalPower: 160,
            positionScale: 1.0,
            colorScale: 0.25
        },

        ultra: {
            label: 'Ultrarealista',
            samples: 4096,
            perDispatch: 32,
            bounces: 8,
            leaf: 4,
            denoise: 1,
            dilation: 4,
            maxRadiance: 256,
            normalPower: 192,
            positionScale: 0.8,
            colorScale: 0.18
        }
    };


    function preset(owner) {
        return QUALITY[owner && owner.quality] || QUALITY.maximum;
    }


    function state() {

        var s = G[STATE_KEY];

        if (!s) {
            s = {
                installed: false,
                owner: null,
                epoch: 0,
                nativeBake: null,
                nativePost: null,
                patchedBake: null,
                patchedPost: null
            };

            G[STATE_KEY] = s;
        }

        return s;
    }


    function log() {
        var a = Array.prototype.slice.call(arguments);
        a.unshift('[BakePT5]');
        console.log.apply(console, a);
    }


    function warn() {
        var a = Array.prototype.slice.call(arguments);
        a.unshift('[BakePT5]');
        console.warn.apply(console, a);
    }


    function fail() {
        var a = Array.prototype.slice.call(arguments);
        a.unshift('[BakePT5]');
        console.error.apply(console, a);
    }


    function now() {
        return G.performance && G.performance.now ?
            G.performance.now() :
            Date.now();
    }


    function clamp(v, lo, hi) {
        return Math.max(
            lo,
            Math.min(
                hi,
                v
            )
        );
    }


    function isNum(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }


    // StandardMaterial color constants are specified in sRGB space.
    function srgbToLinear1(v) {

        v = Math.max(
            0,
            v
        );

        return v <= 0.04045 ?
            v / 12.92 :
            Math.pow(
                (v + 0.055) / 1.055,
                2.4
            );
    }


    function linearToSrgb1(v) {

        v = clamp(
            v,
            0,
            1
        );

        return v <= 0.0031308 ?
            12.92 * v :
            1.055 *
            Math.pow(
                v,
                1 / 2.4
            ) -
            0.055;
    }


    function fmt(a, d) {

        d =
            d === undefined ?
                3 :
                d;

        return '[' +
            Array.prototype.map.call(
                a,
                function (x) {
                    return Number(x).toFixed(d);
                }
            ).join(', ') +
            ']';
    }


    function active(owner, epoch) {

        var s = state();

        return !!(
            s.installed &&
            s.owner === owner &&
            owner &&
            owner.enabled &&
            s.epoch === epoch
        );
    }


    function nativeGPUDevice(gd) {

        if (!gd) {
            return null;
        }

        var c = [
            gd.wgpu,
            gd._wgpu,

            gd.impl &&
            gd.impl.wgpu,

            gd.impl &&
            gd.impl._wgpu,

            gd.device,
            gd._device,

            gd.impl &&
            gd.impl.device,

            gd.impl &&
            gd.impl._device
        ];


        for (
            var i = 0;
            i < c.length;
            i++
        ) {

            var d = c[i];

            if (
                d &&
                typeof d.createCommandEncoder === 'function' &&
                typeof d.createShaderModule === 'function' &&
                typeof d.createBuffer === 'function'
            ) {
                return d;
            }
        }

        return null;
    }


    function webgpuOK(gd) {

        return !!(
            gd &&
            (
                gd.isWebGPU === true ||
                gd.deviceType === 'webgpu' ||
                (
                    gd.supportsCompute &&
                    nativeGPUDevice(gd)
                )
            )
        );
    }


    // =========================================================================
    // WGSL - INDIRECT GI ONLY
    // =========================================================================

    var WGSL = /* wgsl */ `

struct Params {
    width:u32,
    height:u32,
    triCount:u32,
    bvhCount:u32,

    lightCount:u32,
    sampleOffset:u32,
    sampleCount:u32,
    totalSamples:u32,

    maxBounces:u32,
    seed:u32,
    pad0:u32,
    pad1:u32,

    ambient:vec4f,

    rayBias:f32,
    maxRadiance:f32,
    pad2:f32,
    pad3:f32
};


struct Tri {
    v0:vec4f,
    e1:vec4f,
    e2:vec4f,

    n0:vec4f,
    n1:vec4f,
    n2:vec4f,

    albedo:vec4f,
    emission:vec4f
};


struct BvhNode {
    minLeft:vec4f,
    maxRight:vec4f,
    range:vec4f
};


struct Light {
    posType:vec4f,
    colorRange:vec4f,
    axisFalloff:vec4f,
    shapeShadow:vec4f,

    axisX:vec4f,
    axisY:vec4f,
    axisZ:vec4f,

    cone:vec4f
};


struct Hit {
    t:f32,
    u:f32,
    v:f32,
    index:i32
};


@group(0)
@binding(0)
var<uniform>
params:Params;


@group(0)
@binding(1)
var<storage,read>
gPos:array<vec4f>;


@group(0)
@binding(2)
var<storage,read>
gNrm:array<vec4f>;


@group(0)
@binding(3)
var<storage,read>
gDu:array<vec4f>;


@group(0)
@binding(4)
var<storage,read>
gDv:array<vec4f>;


@group(0)
@binding(5)
var<storage,read>
tris:array<Tri>;


@group(0)
@binding(6)
var<storage,read>
bvh:array<BvhNode>;


@group(0)
@binding(7)
var<storage,read>
lights:array<Light>;


@group(0)
@binding(8)
var<storage,read_write>
outPixels:array<vec4f>;


var<private> sampleOrdinal:u32;
var<private> sampleDimension:u32;
var<private> sampleSeed:u32;


// -----------------------------------------------------------------------------
// RANDOM
// -----------------------------------------------------------------------------

fn pcgHash(v:u32)->u32 {

    let state =
        v *
        747796405u +
        2891336453u;


    let word =
        (
            (
                state >>
                (
                    (state >> 28u) +
                    4u
                )
            ) ^
            state
        ) *
        277803737u;


    return (
        word >>
        22u
    ) ^
    word;
}


// Independent hash per sample/dimension.
// PT4.x reused a correlated quasi sequence which could appear as structured
// blotches at high sample counts.
fn rand()->f32 {

    let d =
        sampleDimension;


    sampleDimension =
        d +
        1u;


    let h =
        pcgHash(

            sampleSeed ^

            pcgHash(
                sampleOrdinal *
                0x9E3779B9u +
                0x85EBCA6Bu
            ) ^

            pcgHash(
                d *
                0xC2B2AE35u +
                0x27D4EB2Fu
            )
        );


    return (
        f32(h) +
        0.5
    ) *
    (
        1.0 /
        4294967296.0
    );
}


// -----------------------------------------------------------------------------
// SAMPLING
// -----------------------------------------------------------------------------

fn makeBasis(
    n:vec3f
)->mat3x3f {

    let s =
        select(
            -1.0,
            1.0,
            n.z >=
            0.0
        );


    let a =
        -1.0 /
        (
            s +
            n.z
        );


    let b =
        n.x *
        n.y *
        a;


    let t =
        vec3f(

            1.0 +
            s *
            n.x *
            n.x *
            a,

            s *
            b,

            -s *
            n.x
        );


    let bt =
        vec3f(

            b,

            s +
            n.y *
            n.y *
            a,

            -n.y
        );


    return mat3x3f(
        t,
        bt,
        n
    );
}


fn cosineSample(
    n:vec3f
)->vec3f {

    let u1 =
        rand();


    let u2 =
        rand();


    let phi =
        6.283185307179586 *
        u1;


    let r =
        sqrt(u2);


    let local =
        vec3f(

            r *
            cos(phi),

            r *
            sin(phi),

            sqrt(
                max(
                    0.0,
                    1.0 -
                    u2
                )
            )
        );


    return normalize(
        makeBasis(n) *
        local
    );
}


fn randomSphere()->vec3f {

    let z =
        1.0 -
        2.0 *
        rand();


    let r =
        sqrt(
            max(
                0.0,
                1.0 -
                z *
                z
            )
        );


    let a =
        6.283185307179586 *
        rand();


    return vec3f(

        r *
        cos(a),

        z,

        r *
        sin(a)
    );
}


fn sampleDisk()->vec2f {

    let r =
        sqrt(
            rand()
        );


    let a =
        6.283185307179586 *
        rand();


    return vec2f(

        r *
        cos(a),

        r *
        sin(a)
    );
}


fn jitterDirectional(
    dir:vec3f,
    tanRadius:f32
)->vec3f {

    if (
        tanRadius <=
        0.0
    ) {
        return dir;
    }


    let b =
        makeBasis(dir);


    let q =
        sampleDisk() *
        tanRadius;


    return normalize(

        dir +

        b[0] *
        q.x +

        b[1] *
        q.y
    );
}


// -----------------------------------------------------------------------------
// TRIANGLE INTERSECTION
// -----------------------------------------------------------------------------

fn intersectTri(
    ro:vec3f,
    rd:vec3f,
    tri:Tri,
    tMax:f32
)->vec3f {

    let p =
        cross(
            rd,
            tri.e2.xyz
        );


    let det =
        dot(
            tri.e1.xyz,
            p
        );


    if (
        abs(det) <
        1.0e-10
    ) {
        return vec3f(
            -1.0
        );
    }


    let inv =
        1.0 /
        det;


    let s =
        ro -
        tri.v0.xyz;


    let u =
        dot(
            s,
            p
        ) *
        inv;


    if (
        u < 0.0 ||
        u > 1.0
    ) {
        return vec3f(
            -1.0
        );
    }


    let q =
        cross(
            s,
            tri.e1.xyz
        );


    let v =
        dot(
            rd,
            q
        ) *
        inv;


    if (
        v < 0.0 ||
        u +
        v >
        1.0
    ) {
        return vec3f(
            -1.0
        );
    }


    let t =
        dot(
            tri.e2.xyz,
            q
        ) *
        inv;


    if (
        t <=
        1.0e-6 ||
        t >=
        tMax
    ) {
        return vec3f(
            -1.0
        );
    }


    return vec3f(
        t,
        u,
        v
    );
}


// -----------------------------------------------------------------------------
// AABB
// -----------------------------------------------------------------------------

fn safeInv(v:f32)->f32 {

    if (
        abs(v) <
        1.0e-20
    ) {
        return select(
            -1.0e30,
            1.0e30,
            v >=
            0.0
        );
    }


    return (
        1.0 /
        v
    );
}


fn hitAabb(
    ro:vec3f,
    rd:vec3f,
    bmin:vec3f,
    bmax:vec3f,
    tMax:f32
)->bool {

    let inv =
        vec3f(
            safeInv(rd.x),
            safeInv(rd.y),
            safeInv(rd.z)
        );


    let t0 =
        (
            bmin -
            ro
        ) *
        inv;


    let t1 =
        (
            bmax -
            ro
        ) *
        inv;


    let mn =
        min(
            t0,
            t1
        );


    let mx =
        max(
            t0,
            t1
        );


    let nearT =
        max(

            max(
                mn.x,
                mn.y
            ),

            max(
                mn.z,
                0.0
            )
        );


    let farT =
        min(

            min(
                mx.x,
                mx.y
            ),

            mx.z
        );


    return (
        nearT <=
        farT &&
        nearT <
        tMax
    );
}


// -----------------------------------------------------------------------------
// BVH CLOSEST
// -----------------------------------------------------------------------------

fn traceClosest(
    ro:vec3f,
    rd:vec3f
)->Hit {

    var best =
        Hit(
            1.0e30,
            0.0,
            0.0,
            -1
        );


    if (
        params.bvhCount ==
        0u
    ) {
        return best;
    }


    var stack:
        array<i32,64>;


    var sp:i32 =
        0;


    stack[0] =
        0;


    loop {

        if (
            sp <
            0
        ) {
            break;
        }


        let ni =
            stack[
                u32(sp)
            ];


        sp =
            sp -
            1;


        if (
            ni < 0 ||
            u32(ni) >=
            params.bvhCount
        ) {
            continue;
        }


        let node =
            bvh[
                u32(ni)
            ];


        if (
            !hitAabb(

                ro,
                rd,

                node.minLeft.xyz,
                node.maxRight.xyz,

                best.t
            )
        ) {
            continue;
        }


        let count =
            i32(
                node.range.y +
                0.5
            );


        if (
            count >
            0
        ) {

            let start =
                u32(
                    node.range.x +
                    0.5
                );


            for (
                var j = 0u;
                j < u32(count);
                j = j + 1u
            ) {

                let ti =
                    start +
                    j;


                if (
                    ti >=
                    params.triCount
                ) {
                    break;
                }


                let hv =
                    intersectTri(

                        ro,
                        rd,

                        tris[ti],

                        best.t
                    );


                if (
                    hv.x >
                    0.0
                ) {
                    best =
                        Hit(
                            hv.x,
                            hv.y,
                            hv.z,
                            i32(ti)
                        );
                }
            }

        } else if (
            sp <
            61
        ) {

            let left =
                i32(
                    node.minLeft.w
                );


            let right =
                i32(
                    node.maxRight.w
                );


            if (
                right >=
                0
            ) {

                sp =
                    sp +
                    1;


                stack[
                    u32(sp)
                ] =
                    right;
            }


            if (
                left >=
                0
            ) {

                sp =
                    sp +
                    1;


                stack[
                    u32(sp)
                ] =
                    left;
            }
        }
    }


    return best;
}


// -----------------------------------------------------------------------------
// BVH SHADOW
// -----------------------------------------------------------------------------

fn occluded(
    ro:vec3f,
    rd:vec3f,
    tMax:f32
)->bool {

    if (
        params.bvhCount ==
        0u
    ) {
        return false;
    }


    var stack:
        array<i32,64>;


    var sp:i32 =
        0;


    stack[0] =
        0;


    loop {

        if (
            sp <
            0
        ) {
            break;
        }


        let ni =
            stack[
                u32(sp)
            ];


        sp =
            sp -
            1;


        if (
            ni < 0 ||
            u32(ni) >=
            params.bvhCount
        ) {
            continue;
        }


        let node =
            bvh[
                u32(ni)
            ];


        if (
            !hitAabb(

                ro,
                rd,

                node.minLeft.xyz,
                node.maxRight.xyz,

                tMax
            )
        ) {
            continue;
        }


        let count =
            i32(
                node.range.y +
                0.5
            );


        if (
            count >
            0
        ) {

            let start =
                u32(
                    node.range.x +
                    0.5
                );


            for (
                var j = 0u;
                j < u32(count);
                j = j + 1u
            ) {

                let ti =
                    start +
                    j;


                if (
                    ti >=
                    params.triCount
                ) {
                    break;
                }


                let tri =
                    tris[ti];


                if (
                    tri.albedo.w <
                    0.5
                ) {
                    continue;
                }


                if (
                    intersectTri(
                        ro,
                        rd,
                        tri,
                        tMax
                    ).x >
                    0.0
                ) {
                    return true;
                }
            }

        } else if (
            sp <
            61
        ) {

            let left =
                i32(
                    node.minLeft.w
                );


            let right =
                i32(
                    node.maxRight.w
                );


            if (
                right >=
                0
            ) {

                sp =
                    sp +
                    1;


                stack[
                    u32(sp)
                ] =
                    right;
            }


            if (
                left >=
                0
            ) {

                sp =
                    sp +
                    1;


                stack[
                    u32(sp)
                ] =
                    left;
            }
        }
    }


    return false;
}


// -----------------------------------------------------------------------------
// NORMALS
// -----------------------------------------------------------------------------

fn geometricNormal(
    tri:Tri,
    incoming:vec3f
)->vec3f {

    var gn =
        normalize(
            cross(
                tri.e1.xyz,
                tri.e2.xyz
            )
        );


    if (
        dot(
            gn,
            incoming
        ) >
        0.0
    ) {
        gn =
            -gn;
    }


    return gn;
}


fn shadingNormal(
    tri:Tri,
    u:f32,
    v:f32,
    incoming:vec3f
)->vec3f {

    let w =
        1.0 -
        u -
        v;


    var sn =
        normalize(

            tri.n0.xyz *
            w +

            tri.n1.xyz *
            u +

            tri.n2.xyz *
            v
        );


    let gn =
        geometricNormal(
            tri,
            incoming
        );


    if (
        dot(
            sn,
            gn
        ) <
        0.0
    ) {
        sn =
            -sn;
    }


    return normalize(sn);
}


// -----------------------------------------------------------------------------
// LIGHT SAMPLING
// -----------------------------------------------------------------------------

fn sourcePoint(
    lt:Light
)->vec3f {

    let shape =
        u32(
            lt.shapeShadow.x +
            0.5
        );


    let c =
        lt.posType.xyz;


    if (
        shape ==
        0u
    ) {
        return c;
    }


    if (
        shape ==
        1u
    ) {

        let a =
            rand() *
            2.0 -
            1.0;


        let b =
            rand() *
            2.0 -
            1.0;


        return (

            c +

            lt.axisX.xyz *
            (
                a *
                lt.axisX.w
            ) +

            lt.axisZ.xyz *
            (
                b *
                lt.axisZ.w
            )
        );
    }


    if (
        shape ==
        2u
    ) {

        let q =
            sampleDisk();


        return (

            c +

            lt.axisX.xyz *
            (
                q.x *
                lt.axisX.w
            ) +

            lt.axisZ.xyz *
            (
                q.y *
                lt.axisZ.w
            )
        );
    }


    let q =
        randomSphere();


    return (

        c +

        lt.axisX.xyz *
        (
            q.x *
            lt.axisX.w
        ) +

        lt.axisY.xyz *
        (
            q.y *
            lt.axisY.w
        ) +

        lt.axisZ.xyz *
        (
            q.z *
            lt.axisZ.w
        )
    );
}


// -----------------------------------------------------------------------------
// DIRECT LIGHT FOR SECONDARY HITS ONLY
// -----------------------------------------------------------------------------

fn directLight(
    p:vec3f,
    n:vec3f,
    offsetN:vec3f
)->vec3f {

    var sum =
        vec3f(
            0.0
        );


    for (
        var i = 0u;
        i < params.lightCount;
        i = i + 1u
    ) {

        let lt =
            lights[i];


        let kind =
            u32(
                lt.posType.w +
                0.5
            );


        let casts =
            lt.shapeShadow.y >
            0.5;


        let shadowIntensity =
            clamp(
                lt.shapeShadow.w,
                0.0,
                1.0
            );


        var L =
            vec3f(
                0.0,
                1.0,
                0.0
            );


        var dist =
            1.0e30;


        var atten =
            1.0;


        if (
            kind ==
            0u
        ) {

            L =
                jitterDirectional(
                    normalize(
                        lt.posType.xyz
                    ),
                    lt.shapeShadow.z
                );

        } else {

            let lp =
                sourcePoint(
                    lt
                );


            let d =
                lp -
                p;


            dist =
                length(
                    d
                );


            if (
                dist <
                1.0e-5
            ) {
                continue;
            }


            L =
                d /
                dist;


            let range =
                max(
                    lt.colorRange.w,
                    1.0e-4
                );


            if (
                dist >=
                range
            ) {
                continue;
            }


            if (
                u32(
                    lt.axisFalloff.w +
                    0.5
                ) ==
                0u
            ) {

                atten =
                    max(
                        (
                            range -
                            dist
                        ) /
                        range,
                        0.0
                    );

            } else {

                let rr =
                    dist /
                    range;


                let f =
                    clamp(
                        1.0 -
                        rr *
                        rr *
                        rr *
                        rr,
                        0.0,
                        1.0
                    );


                atten =
                    (
                        1.0 /
                        max(
                            dist *
                            dist +
                            1.0,
                            1.0e-4
                        )
                    ) *
                    f *
                    f;
            }


            if (
                kind ==
                2u
            ) {

                let ca =
                    dot(
                        normalize(
                            lt.axisFalloff.xyz
                        ),
                        -L
                    );


                atten =
                    atten *
                    smoothstep(
                        lt.cone.y,
                        lt.cone.x,
                        ca
                    );
            }
        }


        let ndl =
            dot(
                n,
                L
            );


        if (
            ndl <=
            0.0 ||
            atten <=
            0.0
        ) {
            continue;
        }


        var vis =
            1.0;


        if (
            casts
        ) {

            let ro =
                p +
                offsetN *
                params.rayBias;


            let tMax =
                select(
                    1.0e30,
                    max(
                        params.rayBias,
                        dist -
                        params.rayBias
                    ),
                    kind !=
                    0u
                );


            if (
                occluded(
                    ro,
                    L,
                    tMax
                )
            ) {
                vis =
                    1.0 -
                    shadowIntensity;
            }
        }


        sum =
            sum +
            lt.colorRange.xyz *
            (
                ndl *
                atten *
                vis
            );
    }


    return min(
        sum,
        vec3f(
            params.maxRadiance
        )
    );
}


// -----------------------------------------------------------------------------
// INDIRECT PATH ONLY
// -----------------------------------------------------------------------------

fn shadeIndirect(
    p:vec3f,
    n:vec3f
)->vec3f {

    var e =
        vec3f(
            0.0
        );


    var throughput =
        vec3f(
            1.0
        );


    var origin =
        p +
        n *
        params.rayBias;


    var nrm =
        n;


    for (
        var bounce = 0u;
        bounce < params.maxBounces;
        bounce = bounce + 1u
    ) {

        let d =
            cosineSample(
                nrm
            );


        let h =
            traceClosest(
                origin,
                d
            );


        if (
            h.index <
            0
        ) {

            e =
                e +
                throughput *
                params.ambient.xyz;


            break;
        }


        let tri =
            tris[
                u32(
                    h.index
                )
            ];


        let hp =
            origin +
            d *
            h.t;


        let gn =
            geometricNormal(
                tri,
                d
            );


        let hn =
            shadingNormal(
                tri,
                h.u,
                h.v,
                d
            );


        e =
            e +
            throughput *
            tri.emission.xyz;


        throughput =
            throughput *
            tri.albedo.xyz;


        e =
            e +
            throughput *
            directLight(
                hp,
                hn,
                gn
            );


        if (
            bounce >=
            2u
        ) {

            let survive =
                clamp(
                    max(
                        throughput.x,
                        max(
                            throughput.y,
                            throughput.z
                        )
                    ),
                    0.10,
                    0.95
                );


            if (
                rand() >
                survive
            ) {
                break;
            }


            throughput =
                throughput /
                survive;
        }


        origin =
            hp +
            gn *
            params.rayBias;


        nrm =
            hn;
    }


    return min(
        e,
        vec3f(
            params.maxRadiance
        )
    );
}


// -----------------------------------------------------------------------------
// SUB-TEXEL PRIMARY SAMPLE
// -----------------------------------------------------------------------------

fn primaryJitter()->vec2f {

    let n =
        max(
            1u,
            u32(
                ceil(
                    sqrt(
                        f32(
                            params.totalSamples
                        )
                    )
                )
            )
        );


    let sx =
        sampleOrdinal %
        n;


    let sy =
        (
            sampleOrdinal /
            n
        ) %
        n;


    return (

        vec2f(
            f32(sx) +
            rand(),

            f32(sy) +
            rand()
        ) /
        f32(n)

    ) -
    vec2f(
        0.5
    );
}


// -----------------------------------------------------------------------------
// COMPUTE MAIN
// -----------------------------------------------------------------------------

@compute
@workgroup_size(8,8,1)

fn main(
    @builtin(global_invocation_id)
    gid:vec3u
) {

    if (
        gid.x >=
        params.width ||
        gid.y >=
        params.height
    ) {
        return;
    }


    let idx =
        gid.y *
        params.width +
        gid.x;


    let pos =
        gPos[
            idx
        ];


    if (
        pos.w <
        0.5
    ) {
        return;
    }


    let nrm =
        normalize(
            gNrm[
                idx
            ].xyz
        );


    var sum =
        vec3f(
            0.0
        );


    for (
        var s = 0u;
        s < params.sampleCount;
        s = s + 1u
    ) {

        sampleOrdinal =
            params.sampleOffset +
            s;


        sampleDimension =
            0u;


        sampleSeed =
            pcgHash(
                idx *
                9781u +

                params.seed *
                26699u +

                1u
            );


        var p =
            pos.xyz;


        // PT4.x evaluated every sample at exactly one world-space texel center.
        // This spatially supersamples the receiver footprint.
        if (
            pos.w <
            1.5
        ) {

            let j =
                primaryJitter();


            p =
                p +

                gDu[
                    idx
                ].xyz *
                (
                    j.x /
                    f32(
                        params.width
                    )
                ) +

                gDv[
                    idx
                ].xyz *
                (
                    j.y /
                    f32(
                        params.height
                    )
                );
        }


        sum =
            sum +
            shadeIndirect(
                p,
                nrm
            );
    }


    let c =
        sum /
        f32(
            params.totalSamples
        );


    let first =
        params.sampleOffset ==
        0u;


    outPixels[
        idx
    ] =
        outPixels[
            idx
        ] +
        vec4f(
            c,
            select(
                0.0,
                1.0,
                first
            )
        );
}

`;


    // =========================================================================
    // GEOMETRY
    // =========================================================================

    function normalMatrix(m) {

        var a = m[0];
        var b = m[4];
        var c = m[8];

        var d = m[1];
        var e = m[5];
        var f = m[9];

        var g = m[2];
        var h = m[6];
        var i = m[10];


        var A =
            e * i -
            f * h;


        var B =
            -(
                d * i -
                f * g
            );


        var C =
            d * h -
            e * g;


        var D =
            -(
                b * i -
                c * h
            );


        var E =
            a * i -
            c * g;


        var F =
            -(
                a * h -
                b * g
            );


        var GG =
            b * f -
            c * e;


        var H =
            -(
                a * f -
                c * d
            );


        var I =
            a * e -
            b * d;


        var det =
            a * A +
            b * B +
            c * C;


        if (
            Math.abs(
                det
            ) <
            1e-20
        ) {
            det =
                1;
        }


        return [
            A / det,
            B / det,
            C / det,

            D / det,
            E / det,
            F / det,

            GG / det,
            H / det,
            I / det
        ];
    }


    function rootOf(lm) {

        if (
            lm &&
            lm.root &&
            typeof lm.root.findComponents ===
            'function'
        ) {
            return {
                root: lm.root,
                source: 'lightmapper.root'
            };
        }


        try {

            var app =
                pc.Application &&
                    typeof pc.Application.getApplication ===
                    'function' ?

                    pc.Application.getApplication() :
                    null;


            if (
                app &&
                app.root
            ) {
                return {
                    root: app.root,
                    source: 'Application.getApplication().root'
                };
            }

        } catch (_) {
            // nada
        }


        return {
            root: null,
            source: 'none'
        };
    }


    function indexComponents(lm) {

        var ri =
            rootOf(
                lm
            );


        var map =
            new Map();


        var stats = {
            scanned: 0,
            static: 0,
            dynamic: 0,
            disabled: 0,
            lightmapped: 0,
            castLightmapShadow: 0
        };


        if (
            !ri.root
        ) {
            return {
                root: ri,
                map: map,
                stats: stats
            };
        }


        [
            'render',
            'model'
        ].forEach(
            function (type) {

                var comps =
                    [];


                try {
                    comps =
                        ri.root.findComponents(
                            type
                        ) ||
                        [];
                } catch (_) {
                    comps =
                        [];
                }


                comps.forEach(
                    function (comp) {

                        if (
                            !comp
                        ) {
                            return;
                        }


                        stats.scanned++;


                        var enabled =
                            !!(
                                comp.enabled &&
                                comp.entity &&
                                comp.entity.enabled
                            );


                        var stat =
                            comp.isStatic ===
                            true;


                        if (
                            !enabled
                        ) {
                            stats.disabled++;

                        } else if (
                            stat
                        ) {
                            stats.static++;

                        } else {
                            stats.dynamic++;
                        }


                        if (
                            comp.lightmapped ===
                            true
                        ) {
                            stats.lightmapped++;
                        }


                        if (
                            comp.castShadowsLightmap !==
                            false
                        ) {
                            stats.castLightmapShadow++;
                        }


                        var mis =
                            comp.meshInstances ||
                            [];


                        for (
                            var i = 0;
                            i < mis.length;
                            i++
                        ) {

                            if (
                                !mis[i]
                            ) {
                                continue;
                            }


                            map.set(
                                mis[i],
                                {
                                    type: type,
                                    component: comp,
                                    entity: comp.entity,

                                    entityName:
                                        comp.entity ?
                                            comp.entity.name :
                                            '(sin entidad)',

                                    enabled:
                                        enabled,

                                    isStatic:
                                        stat,

                                    lightmapped:
                                        comp.lightmapped ===
                                        true,

                                    castShadowsLightmap:
                                        comp.castShadowsLightmap !==
                                        false
                                }
                            );
                        }
                    }
                );
            }
        );


        return {
            root: ri,
            map: map,
            stats: stats
        };
    }


    function materialIsTransparent(mat) {

        if (
            !mat
        ) {
            return false;
        }


        var blendNone =
            isNum(
                pc.BLEND_NONE
            ) ?
                pc.BLEND_NONE :
                0;


        if (
            isNum(
                mat.blendType
            ) &&
            mat.blendType !==
            blendNone
        ) {
            return true;
        }


        if (
            isNum(
                mat.opacity
            ) &&
            mat.opacity <
            0.9999
        ) {
            return true;
        }


        if (
            isNum(
                mat.alphaTest
            ) &&
            mat.alphaTest >
            0
        ) {
            return true;
        }


        if (
            mat.opacityDither &&
            mat.opacityDither !==
            'none'
        ) {
            return true;
        }


        if (
            mat.opacityShadowDither &&
            mat.opacityShadowDither !==
            'none'
        ) {
            return true;
        }


        return false;
    }


    function buildGeometry(
        mi,
        owner
    ) {

        var out = {

            ok:
                false,

            name:
                mi &&
                    mi.node ?
                    mi.node.name :
                    '(sin nombre)',

            mi:
                mi,

            owner:
                owner,

            positions:
                null,

            normals:
                null,

            uv0:
                null,

            uv1:
                null,

            indices:
                null,

            vertexCount:
                0,

            triCount:
                0,

            albedo: [
                0.8,
                0.8,
                0.8
            ],

            emission: [
                0,
                0,
                0
            ],

            transparent:
                false,

            textured:
                false,

            reason:
                ''
        };


        try {

            if (
                !mi ||
                !mi.mesh ||
                !mi.node
            ) {
                out.reason =
                    'MeshInstance sin mesh/node';

                return out;
            }


            if (
                mi.skinInstance
            ) {
                out.reason =
                    'skinInstance no soportado para bake estatico';

                return out;
            }


            var mesh =
                mi.mesh;


            var pos = [];
            var nrm = [];
            var uv0a = [];
            var uv1a = [];
            var idx = [];


            var nv =
                mesh.getPositions(
                    pos
                ) ||
                Math.floor(
                    pos.length /
                    3
                );


            if (
                !nv ||
                pos.length <
                nv * 3
            ) {
                out.reason =
                    'sin positions';

                return out;
            }


            var nn = 0;
            var nu0 = 0;
            var nu1 = 0;
            var ni = 0;


            try {
                nn =
                    mesh.getNormals(
                        nrm
                    ) ||
                    0;
            } catch (_) {
                nn =
                    0;
            }


            try {
                nu0 =
                    mesh.getUvs(
                        0,
                        uv0a
                    ) ||
                    0;
            } catch (_) {
                nu0 =
                    0;
            }


            try {
                nu1 =
                    mesh.getUvs(
                        1,
                        uv1a
                    ) ||
                    0;
            } catch (_) {
                nu1 =
                    0;
            }


            try {
                ni =
                    mesh.getIndices(
                        idx
                    ) ||
                    0;
            } catch (_) {
                ni =
                    0;
            }


            if (
                nrm.length <
                nv * 3
            ) {
                nn =
                    0;
            }


            if (
                uv0a.length <
                nv * 2
            ) {
                nu0 =
                    0;
            }


            if (
                uv1a.length <
                nv * 2
            ) {
                nu1 =
                    0;
            }


            if (
                !ni
            ) {
                ni =
                    idx.length;
            }


            var prim =
                mesh.primitive &&
                mesh.primitive[0];


            if (
                prim &&
                isNum(
                    prim.type
                ) &&
                isNum(
                    pc.PRIMITIVE_TRIANGLES
                ) &&
                prim.type !==
                pc.PRIMITIVE_TRIANGLES
            ) {
                out.reason =
                    'primitive no TRIANGLES';

                return out;
            }


            var indexed =
                prim ?
                    (
                        prim.indexed !==
                        false &&
                        ni >
                        0
                    ) :
                    ni >
                    0;


            var base =
                prim ?
                    prim.base |
                    0 :
                    0;


            var baseVertex =
                prim ?
                    prim.baseVertex |
                    0 :
                    0;


            var count =
                prim ?
                    prim.count |
                    0 :
                    (
                        indexed ?
                            ni :
                            nv
                    );


            var tri =
                [];


            for (
                var k = 0;
                k +
                2 <
                count;
                k += 3
            ) {

                var a;
                var b;
                var c;


                if (
                    indexed
                ) {

                    a =
                        idx[
                        base +
                        k
                        ] +
                        baseVertex;


                    b =
                        idx[
                        base +
                        k +
                        1
                        ] +
                        baseVertex;


                    c =
                        idx[
                        base +
                        k +
                        2
                        ] +
                        baseVertex;

                } else {

                    a =
                        base +
                        k;

                    b =
                        base +
                        k +
                        1;

                    c =
                        base +
                        k +
                        2;
                }


                if (
                    a >=
                    0 &&
                    b >=
                    0 &&
                    c >=
                    0 &&
                    a <
                    nv &&
                    b <
                    nv &&
                    c <
                    nv
                ) {
                    tri.push(
                        a,
                        b,
                        c
                    );
                }
            }


            if (
                !tri.length
            ) {
                out.reason =
                    'sin triangulos';

                return out;
            }


            var m =
                mi.node
                    .getWorldTransform()
                    .data;


            var nm =
                normalMatrix(
                    m
                );


            var wp =
                new Float32Array(
                    nv *
                    3
                );


            var wn =
                new Float32Array(
                    nv *
                    3
                );


            var v;
            var x;
            var y;
            var z;


            for (
                v = 0;
                v < nv;
                v++
            ) {

                x =
                    pos[
                    v *
                    3
                    ];


                y =
                    pos[
                    v *
                    3 +
                    1
                    ];


                z =
                    pos[
                    v *
                    3 +
                    2
                    ];


                wp[
                    v *
                    3
                ] =
                    m[0] *
                    x +
                    m[4] *
                    y +
                    m[8] *
                    z +
                    m[12];


                wp[
                    v *
                    3 +
                    1
                ] =
                    m[1] *
                    x +
                    m[5] *
                    y +
                    m[9] *
                    z +
                    m[13];


                wp[
                    v *
                    3 +
                    2
                ] =
                    m[2] *
                    x +
                    m[6] *
                    y +
                    m[10] *
                    z +
                    m[14];
            }


            if (
                nn
            ) {

                for (
                    v = 0;
                    v < nv;
                    v++
                ) {

                    x =
                        nrm[
                        v *
                        3
                        ];


                    y =
                        nrm[
                        v *
                        3 +
                        1
                        ];


                    z =
                        nrm[
                        v *
                        3 +
                        2
                        ];


                    var nx =
                        nm[0] *
                        x +
                        nm[1] *
                        y +
                        nm[2] *
                        z;


                    var ny =
                        nm[3] *
                        x +
                        nm[4] *
                        y +
                        nm[5] *
                        z;


                    var nz =
                        nm[6] *
                        x +
                        nm[7] *
                        y +
                        nm[8] *
                        z;


                    var nl =
                        Math.hypot(
                            nx,
                            ny,
                            nz
                        ) ||
                        1;


                    wn[
                        v *
                        3
                    ] =
                        nx /
                        nl;


                    wn[
                        v *
                        3 +
                        1
                    ] =
                        ny /
                        nl;


                    wn[
                        v *
                        3 +
                        2
                    ] =
                        nz /
                        nl;
                }

            } else {

                for (
                    var tt = 0;
                    tt < tri.length;
                    tt +=
                    3
                ) {

                    a =
                        tri[
                        tt
                        ];


                    b =
                        tri[
                        tt +
                        1
                        ];


                    c =
                        tri[
                        tt +
                        2
                        ];


                    var e1x =
                        wp[
                        b *
                        3
                        ] -
                        wp[
                        a *
                        3
                        ];


                    var e1y =
                        wp[
                        b *
                        3 +
                        1
                        ] -
                        wp[
                        a *
                        3 +
                        1
                        ];


                    var e1z =
                        wp[
                        b *
                        3 +
                        2
                        ] -
                        wp[
                        a *
                        3 +
                        2
                        ];


                    var e2x =
                        wp[
                        c *
                        3
                        ] -
                        wp[
                        a *
                        3
                        ];


                    var e2y =
                        wp[
                        c *
                        3 +
                        1
                        ] -
                        wp[
                        a *
                        3 +
                        1
                        ];


                    var e2z =
                        wp[
                        c *
                        3 +
                        2
                        ] -
                        wp[
                        a *
                        3 +
                        2
                        ];


                    var fx =
                        e1y *
                        e2z -
                        e1z *
                        e2y;


                    var fy =
                        e1z *
                        e2x -
                        e1x *
                        e2z;


                    var fz =
                        e1x *
                        e2y -
                        e1y *
                        e2x;


                    [
                        a,
                        b,
                        c
                    ].forEach(
                        function (q) {

                            wn[
                                q *
                                3
                            ] +=
                                fx;


                            wn[
                                q *
                                3 +
                                1
                            ] +=
                                fy;


                            wn[
                                q *
                                3 +
                                2
                            ] +=
                                fz;
                        }
                    );
                }


                for (
                    v = 0;
                    v < nv;
                    v++
                ) {

                    nl =
                        Math.hypot(

                            wn[
                            v *
                            3
                            ],

                            wn[
                            v *
                            3 +
                            1
                            ],

                            wn[
                            v *
                            3 +
                            2
                            ]
                        ) ||
                        1;


                    wn[
                        v *
                        3
                    ] /=
                        nl;


                    wn[
                        v *
                        3 +
                        1
                    ] /=
                        nl;


                    wn[
                        v *
                        3 +
                        2
                    ] /=
                        nl;
                }
            }


            var uv0 =
                null;


            var uv1 =
                null;


            if (
                nu0
            ) {

                uv0 =
                    new Float32Array(
                        nv *
                        2
                    );


                for (
                    k = 0;
                    k < nv *
                    2;
                    k++
                ) {
                    uv0[
                        k
                    ] =
                        uv0a[
                        k
                        ];
                }
            }


            if (
                nu1
            ) {

                uv1 =
                    new Float32Array(
                        nv *
                        2
                    );


                for (
                    k = 0;
                    k < nv *
                    2;
                    k++
                ) {
                    uv1[
                        k
                    ] =
                        uv1a[
                        k
                        ];
                }
            }


            var mat =
                mi.material;


            if (
                mat
            ) {

                out.transparent =
                    materialIsTransparent(
                        mat
                    );


                out.textured =
                    !!mat.diffuseMap;


                if (
                    mat.diffuse &&
                    isNum(
                        mat.diffuse.r
                    )
                ) {

                    out.albedo = [
                        srgbToLinear1(
                            mat.diffuse.r
                        ),

                        srgbToLinear1(
                            mat.diffuse.g
                        ),

                        srgbToLinear1(
                            mat.diffuse.b
                        )
                    ];
                }


                // Diffuse GI only.
                if (
                    mat.useMetalness &&
                    isNum(
                        mat.metalness
                    )
                ) {

                    var diffuseWeight =
                        1 -
                        clamp(
                            mat.metalness,
                            0,
                            1
                        );


                    out.albedo[0] *=
                        diffuseWeight;

                    out.albedo[1] *=
                        diffuseWeight;

                    out.albedo[2] *=
                        diffuseWeight;
                }


                if (
                    mat.emissive &&
                    isNum(
                        mat.emissive.r
                    )
                ) {

                    var ei =
                        isNum(
                            mat.emissiveIntensity
                        ) ?
                            mat.emissiveIntensity :
                            1;


                    out.emission = [
                        srgbToLinear1(
                            mat.emissive.r
                        ) *
                        ei,

                        srgbToLinear1(
                            mat.emissive.g
                        ) *
                        ei,

                        srgbToLinear1(
                            mat.emissive.b
                        ) *
                        ei
                    ];
                }
            }


            out.positions =
                wp;

            out.normals =
                wn;

            out.uv0 =
                uv0;

            out.uv1 =
                uv1;

            out.indices =
                new Uint32Array(
                    tri
                );

            out.vertexCount =
                nv;

            out.triCount =
                tri.length /
                3;

            out.ok =
                true;


            return out;

        } catch (e) {

            out.reason =
                e &&
                    e.message ?
                    e.message :
                    String(e);


            return out;
        }
    }


    // =========================================================================
    // BVH
    // =========================================================================

    function buildBVH(
        records,
        leafSize
    ) {

        if (
            !records.length
        ) {

            return {
                tris:
                    new Float32Array(
                        32
                    ),

                triCount:
                    0,

                nodes:
                    new Float32Array(
                        12
                    ),

                nodeCount:
                    0
            };
        }


        var order =
            records.map(
                function (_, i) {
                    return i;
                }
            );


        var nodes =
            [];


        function build(
            start,
            end,
            depth
        ) {

            var idx =
                nodes.length;


            nodes.push(
                null
            );


            var mn = [
                Infinity,
                Infinity,
                Infinity
            ];


            var mx = [
                -Infinity,
                -Infinity,
                -Infinity
            ];


            var cmn = [
                Infinity,
                Infinity,
                Infinity
            ];


            var cmx = [
                -Infinity,
                -Infinity,
                -Infinity
            ];


            for (
                var i = start;
                i < end;
                i++
            ) {

                var r =
                    records[
                    order[
                    i
                    ]
                    ];


                for (
                    var k = 0;
                    k < 3;
                    k++
                ) {

                    mn[
                        k
                    ] =
                        Math.min(
                            mn[
                            k
                            ],
                            r.min[
                            k
                            ]
                        );


                    mx[
                        k
                    ] =
                        Math.max(
                            mx[
                            k
                            ],
                            r.max[
                            k
                            ]
                        );


                    cmn[
                        k
                    ] =
                        Math.min(
                            cmn[
                            k
                            ],
                            r.centroid[
                            k
                            ]
                        );


                    cmx[
                        k
                    ] =
                        Math.max(
                            cmx[
                            k
                            ],
                            r.centroid[
                            k
                            ]
                        );
                }
            }


            var count =
                end -
                start;


            if (
                count <=
                leafSize ||
                depth >=
                48
            ) {

                nodes[
                    idx
                ] = {
                    min: mn,
                    max: mx,
                    left: -1,
                    right: -1,
                    start: start,
                    count: count
                };


                return idx;
            }


            var ex = [
                cmx[0] -
                cmn[0],

                cmx[1] -
                cmn[1],

                cmx[2] -
                cmn[2]
            ];


            var axis =
                ex[1] >
                    ex[0] ?
                    1 :
                    0;


            if (
                ex[2] >
                ex[
                axis
                ]
            ) {
                axis =
                    2;
            }


            if (
                ex[
                axis
                ] <
                1e-9
            ) {

                nodes[
                    idx
                ] = {
                    min: mn,
                    max: mx,
                    left: -1,
                    right: -1,
                    start: start,
                    count: count
                };


                return idx;
            }


            var part =
                order
                    .slice(
                        start,
                        end
                    )
                    .sort(
                        function (a, b) {
                            return (
                                records[
                                    a
                                ].centroid[
                                axis
                                ] -
                                records[
                                    b
                                ].centroid[
                                axis
                                ]
                            );
                        }
                    );


            for (
                i = 0;
                i < part.length;
                i++
            ) {
                order[
                    start +
                    i
                ] =
                    part[
                    i
                    ];
            }


            var mid =
                start +
                (
                    count >>
                    1
                );


            var left =
                build(
                    start,
                    mid,
                    depth +
                    1
                );


            var right =
                build(
                    mid,
                    end,
                    depth +
                    1
                );


            nodes[
                idx
            ] = {
                min: mn,
                max: mx,
                left: left,
                right: right,
                start: 0,
                count: 0
            };


            return idx;
        }


        build(
            0,
            order.length,
            0
        );


        var triData =
            new Float32Array(
                order.length *
                32
            );


        for (
            var t = 0;
            t < order.length;
            t++
        ) {

            triData.set(
                records[
                    order[
                    t
                    ]
                ].data,
                t *
                32
            );
        }


        var nodeData =
            new Float32Array(
                nodes.length *
                12
            );


        for (
            var n = 0;
            n < nodes.length;
            n++
        ) {

            var nd =
                nodes[
                n
                ];


            var o =
                n *
                12;


            nodeData[
                o
            ] =
                nd.min[0];

            nodeData[
                o +
                1
            ] =
                nd.min[1];

            nodeData[
                o +
                2
            ] =
                nd.min[2];

            nodeData[
                o +
                3
            ] =
                nd.left;


            nodeData[
                o +
                4
            ] =
                nd.max[0];

            nodeData[
                o +
                5
            ] =
                nd.max[1];

            nodeData[
                o +
                6
            ] =
                nd.max[2];

            nodeData[
                o +
                7
            ] =
                nd.right;


            nodeData[
                o +
                8
            ] =
                nd.start;

            nodeData[
                o +
                9
            ] =
                nd.count;

            nodeData[
                o +
                10
            ] =
                0;

            nodeData[
                o +
                11
            ] =
                0;
        }


        return {
            tris: triData,
            triCount: order.length,
            nodes: nodeData,
            nodeCount: nodes.length
        };
    }


    // =========================================================================
    // COLLECT STATIC TRANSPORT SCENE
    // =========================================================================

    function collectScene(
        lm,
        bakeNodes,
        p
    ) {

        var ix =
            indexComponents(
                lm
            );


        var owners =
            ix.map;


        var cache =
            new Map();


        var allGeoms =
            [];


        var transportGeoms =
            [];


        var receivers =
            new Set();


        var transportSet =
            new Set();


        var stats = {
            componentsScanned:
                ix.stats.scanned,

            staticComponents:
                ix.stats.static,

            dynamicComponents:
                ix.stats.dynamic,

            disabledComponents:
                ix.stats.disabled,

            receivers:
                0,

            transportMeshes:
                0,

            staticNonLightmappedCasters:
                0,

            dynamicNonLightmappedExcluded:
                0,

            transparentTransportExcluded:
                0,

            texturedTransportApprox:
                0,

            skippedUnknown:
                0,

            skippedDisabled:
                0,

            skippedSkin:
                0
        };


        function add(
            mi,
            owner
        ) {

            if (
                cache.has(
                    mi
                )
            ) {
                return cache.get(
                    mi
                );
            }


            var g =
                buildGeometry(
                    mi,
                    owner
                );


            cache.set(
                mi,
                g
            );


            if (
                g.ok
            ) {
                allGeoms.push(
                    g
                );

            } else {

                if (
                    g.reason.indexOf(
                        'skinInstance'
                    ) >=
                    0
                ) {
                    stats.skippedSkin++;
                }


                warn(
                    'Mesh "' +
                    g.name +
                    '" descartado: ' +
                    g.reason
                );
            }


            return g;
        }


        // Native bakeNodes are the authoritative receiver list.
        for (
            var n = 0;
            n < bakeNodes.length;
            n++
        ) {

            var mis =
                (
                    bakeNodes[
                    n
                    ] &&
                    bakeNodes[
                        n
                    ].meshInstances
                ) ||
                [];


            for (
                var i = 0;
                i < mis.length;
                i++
            ) {

                var mi =
                    mis[
                    i
                    ];


                var owner =
                    owners.get(
                        mi
                    );


                if (
                    !owner
                ) {
                    stats.skippedUnknown++;
                    continue;
                }


                if (
                    !owner.enabled
                ) {
                    stats.skippedDisabled++;
                    continue;
                }


                if (
                    !owner.lightmapped
                ) {
                    continue;
                }


                receivers.add(
                    mi
                );


                add(
                    mi,
                    owner
                );
            }
        }


        // Static transport geometry only. Lightmapped receivers are considered part of the
        // static baked solution even if their optimization hint is not set.
        owners.forEach(
            function (
                owner,
                mi
            ) {

                if (
                    !owner.enabled ||
                    !mi ||
                    mi.visible ===
                    false
                ) {
                    return;
                }


                var eligibleStatic =
                    owner.isStatic ||
                    owner.lightmapped;


                if (
                    !eligibleStatic
                ) {

                    if (
                        owner.castShadowsLightmap
                    ) {
                        stats.dynamicNonLightmappedExcluded++;
                    }

                    return;
                }


                if (
                    !owner.castShadowsLightmap &&
                    !owner.lightmapped
                ) {
                    return;
                }


                var g =
                    add(
                        mi,
                        owner
                    );


                if (
                    !g ||
                    !g.ok
                ) {
                    return;
                }


                // Alpha / blending is preserved in the native direct bake.
                // Until the PT has alpha-aware stochastic traversal, do not let these
                // meshes become false solid blockers in indirect GI.
                if (
                    g.transparent
                ) {
                    stats.transparentTransportExcluded++;
                    return;
                }


                if (
                    g.textured
                ) {
                    stats.texturedTransportApprox++;
                }


                if (
                    owner.isStatic &&
                    !owner.lightmapped
                ) {
                    stats.staticNonLightmappedCasters++;
                }


                transportSet.add(
                    mi
                );


                transportGeoms.push(
                    g
                );
            }
        );


        stats.receivers =
            receivers.size;


        stats.transportMeshes =
            transportGeoms.length;


        var records =
            [];


        var bmin = [
            Infinity,
            Infinity,
            Infinity
        ];


        var bmax = [
            -Infinity,
            -Infinity,
            -Infinity
        ];


        transportGeoms.forEach(
            function (g) {

                var P =
                    g.positions;


                var N =
                    g.normals;


                for (
                    var t = 0;
                    t < g.triCount;
                    t++
                ) {

                    var ia =
                        g.indices[
                        t *
                        3
                        ];


                    var ib =
                        g.indices[
                        t *
                        3 +
                        1
                        ];


                    var ic =
                        g.indices[
                        t *
                        3 +
                        2
                        ];


                    var ax =
                        P[
                        ia *
                        3
                        ];

                    var ay =
                        P[
                        ia *
                        3 +
                        1
                        ];

                    var az =
                        P[
                        ia *
                        3 +
                        2
                        ];


                    var bx =
                        P[
                        ib *
                        3
                        ];

                    var by =
                        P[
                        ib *
                        3 +
                        1
                        ];

                    var bz =
                        P[
                        ib *
                        3 +
                        2
                        ];


                    var cx =
                        P[
                        ic *
                        3
                        ];

                    var cy =
                        P[
                        ic *
                        3 +
                        1
                        ];

                    var cz =
                        P[
                        ic *
                        3 +
                        2
                        ];


                    var e1x =
                        bx -
                        ax;

                    var e1y =
                        by -
                        ay;

                    var e1z =
                        bz -
                        az;


                    var e2x =
                        cx -
                        ax;

                    var e2y =
                        cy -
                        ay;

                    var e2z =
                        cz -
                        az;


                    var crx =
                        e1y *
                        e2z -
                        e1z *
                        e2y;


                    var cry =
                        e1z *
                        e2x -
                        e1x *
                        e2z;


                    var crz =
                        e1x *
                        e2y -
                        e1y *
                        e2x;


                    if (
                        Math.hypot(
                            crx,
                            cry,
                            crz
                        ) <
                        1e-12
                    ) {
                        continue;
                    }


                    var mn = [
                        Math.min(
                            ax,
                            bx,
                            cx
                        ),

                        Math.min(
                            ay,
                            by,
                            cy
                        ),

                        Math.min(
                            az,
                            bz,
                            cz
                        )
                    ];


                    var mx = [
                        Math.max(
                            ax,
                            bx,
                            cx
                        ),

                        Math.max(
                            ay,
                            by,
                            cy
                        ),

                        Math.max(
                            az,
                            bz,
                            cz
                        )
                    ];


                    for (
                        var k = 0;
                        k < 3;
                        k++
                    ) {

                        bmin[
                            k
                        ] =
                            Math.min(
                                bmin[
                                k
                                ],
                                mn[
                                k
                                ]
                            );


                        bmax[
                            k
                        ] =
                            Math.max(
                                bmax[
                                k
                                ],
                                mx[
                                k
                                ]
                            );
                    }


                    records.push({
                        min: mn,
                        max: mx,

                        centroid: [
                            (
                                ax +
                                bx +
                                cx
                            ) /
                            3,

                            (
                                ay +
                                by +
                                cy
                            ) /
                            3,

                            (
                                az +
                                bz +
                                cz
                            ) /
                            3
                        ],

                        data: [
                            // v0
                            ax,
                            ay,
                            az,
                            0,

                            // e1
                            e1x,
                            e1y,
                            e1z,
                            0,

                            // e2
                            e2x,
                            e2y,
                            e2z,
                            0,

                            // n0
                            N[
                            ia *
                            3
                            ],
                            N[
                            ia *
                            3 +
                            1
                            ],
                            N[
                            ia *
                            3 +
                            2
                            ],
                            0,

                            // n1
                            N[
                            ib *
                            3
                            ],
                            N[
                            ib *
                            3 +
                            1
                            ],
                            N[
                            ib *
                            3 +
                            2
                            ],
                            0,

                            // n2
                            N[
                            ic *
                            3
                            ],
                            N[
                            ic *
                            3 +
                            1
                            ],
                            N[
                            ic *
                            3 +
                            2
                            ],
                            0,

                            // diffuse + casts-lightmap-shadow
                            g.albedo[
                            0
                            ],
                            g.albedo[
                            1
                            ],
                            g.albedo[
                            2
                            ],
                            g.owner.castShadowsLightmap ?
                                1 :
                                0,

                            // emissive
                            g.emission[
                            0
                            ],
                            g.emission[
                            1
                            ],
                            g.emission[
                            2
                            ],
                            0
                        ]
                    });
                }
            }
        );


        if (
            !records.length
        ) {

            bmin = [
                0,
                0,
                0
            ];


            bmax = [
                0,
                0,
                0
            ];
        }


        var extent =
            records.length ?
                Math.max(
                    bmax[0] -
                    bmin[0],

                    bmax[1] -
                    bmin[1],

                    bmax[2] -
                    bmin[2]
                ) :
                1;


        var built =
            buildBVH(
                records,
                p.leaf
            );


        return {
            cache: cache,
            allGeoms: allGeoms,
            transportGeoms: transportGeoms,
            receivers: receivers,
            transportSet: transportSet,

            tris: built.tris,
            triCount: built.triCount,

            bvh: built.nodes,
            bvhCount: built.nodeCount,

            boundsMin: bmin,
            boundsMax: bmax,
            extent: extent,

            stats: stats
        };
    }


    // =========================================================================
    // LIGHTS
    // =========================================================================

    function collectLights(lm) {

        var ri =
            rootOf(
                lm
            );


        var packed =
            [];


        var report =
            [];


        var stats = {
            scanned: 0,
            included: 0,
            notBaked: 0,
            disabled: 0,
            runtimeAffectLightmapped: 0
        };


        if (
            !ri.root
        ) {

            return {
                data:
                    new Float32Array(
                        32
                    ),

                count:
                    0,

                report:
                    report,

                stats:
                    stats
            };
        }


        var comps =
            [];


        try {
            comps =
                ri.root.findComponents(
                    'light'
                ) ||
                [];
        } catch (_) {
            comps =
                [];
        }


        comps.forEach(
            function (comp) {

                stats.scanned++;


                if (
                    !comp ||
                    !comp.enabled ||
                    !comp.entity ||
                    !comp.entity.enabled
                ) {

                    stats.disabled++;
                    return;
                }


                if (
                    comp.bake !==
                    true
                ) {

                    stats.notBaked++;


                    if (
                        comp.affectLightmapped ===
                        true
                    ) {
                        stats.runtimeAffectLightmapped++;
                    }


                    return;
                }


                var m =
                    comp.entity
                        .getWorldTransform()
                        .data;


                var xl =
                    Math.hypot(
                        m[0],
                        m[1],
                        m[2]
                    ) ||
                    1;


                var yl =
                    Math.hypot(
                        m[4],
                        m[5],
                        m[6]
                    ) ||
                    1;


                var zl =
                    Math.hypot(
                        m[8],
                        m[9],
                        m[10]
                    ) ||
                    1;


                var X = [
                    m[0] / xl,
                    m[1] / xl,
                    m[2] / xl
                ];


                var Y = [
                    m[4] / yl,
                    m[5] / yl,
                    m[6] / yl
                ];


                var Z = [
                    m[8] / zl,
                    m[9] / zl,
                    m[10] / zl
                ];


                var type =
                    comp.type ===
                        'omni' ?
                        'point' :
                        comp.type;


                var kind =
                    type ===
                        'directional' ?
                        0 :
                        (
                            type ===
                                'spot' ?
                                2 :
                                1
                        );


                if (
                    type !==
                    'directional' &&
                    type !==
                    'point' &&
                    type !==
                    'spot'
                ) {
                    return;
                }


                var c =
                    comp.color ||
                    {
                        r: 1,
                        g: 1,
                        b: 1
                    };


                var intensity =
                    isNum(
                        comp.intensity
                    ) ?
                        comp.intensity :
                        1;


                var col = [
                    srgbToLinear1(
                        c.r
                    ) *
                    intensity,

                    srgbToLinear1(
                        c.g
                    ) *
                    intensity,

                    srgbToLinear1(
                        c.b
                    ) *
                    intensity
                ];


                var range =
                    isNum(
                        comp.range
                    ) &&
                        comp.range >
                        0 ?
                        comp.range :
                        10;


                var fall =
                    comp.falloffMode ===
                        pc.LIGHTFALLOFF_INVERSESQUARED ?
                        1 :
                        0;


                var shape =
                    isNum(
                        comp.shape
                    ) ?
                        comp.shape :
                        (
                            isNum(
                                pc.LIGHTSHAPE_PUNCTUAL
                            ) ?
                                pc.LIGHTSHAPE_PUNCTUAL :
                                0
                        );


                var casts =
                    comp.castShadows !==
                        false ?
                        1 :
                        0;


                var shadowIntensity =
                    isNum(
                        comp.shadowIntensity
                    ) ?
                        clamp(
                            comp.shadowIntensity,
                            0,
                            1
                        ) :
                        1;


                var bakeArea =
                    kind ===
                        0 &&
                        isNum(
                            comp.bakeArea
                        ) ?
                        clamp(
                            comp.bakeArea,
                            0,
                            179
                        ) :
                        0;


                var tanRadius =
                    Math.tan(
                        bakeArea *
                        Math.PI /
                        360
                    );


                var inner =
                    clamp(
                        isNum(
                            comp.innerConeAngle
                        ) ?
                            comp.innerConeAngle :
                            40,
                        0,
                        89.9
                    );


                var outer =
                    clamp(
                        isNum(
                            comp.outerConeAngle
                        ) ?
                            comp.outerConeAngle :
                            45,
                        0,
                        89.9
                    );


                var ci =
                    Math.cos(
                        Math.min(
                            inner,
                            outer
                        ) *
                        Math.PI /
                        180
                    );


                var co =
                    Math.cos(
                        outer *
                        Math.PI /
                        180
                    );


                if (
                    ci <=
                    co
                ) {
                    ci =
                        co +
                        1e-4;
                }


                packed.push(

                    kind ===
                        0 ?
                        Y[0] :
                        m[12],

                    kind ===
                        0 ?
                        Y[1] :
                        m[13],

                    kind ===
                        0 ?
                        Y[2] :
                        m[14],

                    kind,


                    col[0],
                    col[1],
                    col[2],
                    range,


                    -Y[0],
                    -Y[1],
                    -Y[2],
                    fall,


                    shape,
                    casts,
                    tanRadius,
                    shadowIntensity,


                    X[0],
                    X[1],
                    X[2],
                    xl *
                    0.5,


                    Y[0],
                    Y[1],
                    Y[2],
                    yl *
                    0.5,


                    Z[0],
                    Z[1],
                    Z[2],
                    zl *
                    0.5,


                    ci,
                    co,

                    isNum(
                        comp.bakeNumSamples
                    ) ?
                        comp.bakeNumSamples :
                        1,

                    0
                );


                stats.included++;


                report.push({
                    entity:
                        comp.entity.name,

                    type:
                        type,

                    color:
                        col,

                    shape:
                        shape,

                    castShadows:
                        !!casts,

                    bakeArea:
                        bakeArea
                });
            }
        );


        var data =
            new Float32Array(
                Math.max(
                    32,
                    packed.length
                )
            );


        data.set(
            packed
        );


        return {
            data: data,
            count:
                packed.length /
                32,
            report: report,
            stats: stats
        };
    }


    function collectAmbient(lm) {

        var sc =
            lm &&
            lm.scene;


        if (
            !sc ||
            sc.ambientBake !==
            true ||
            !sc.ambientLight
        ) {

            return {
                rgb: [
                    0,
                    0,
                    0
                ],

                source:
                    'ambientBake=false'
            };
        }


        var a =
            sc.ambientLight;


        return {
            rgb: [
                srgbToLinear1(
                    a.r
                ),

                srgbToLinear1(
                    a.g
                ),

                srgbToLinear1(
                    a.b
                )
            ],

            source:
                'scene.ambientLight (secondary environment approximation)'
        };
    }


    // =========================================================================
    // FINAL LIGHTMAP LOOKUP
    // =========================================================================

    function readParam(
        mi,
        name
    ) {

        try {

            var p =
                typeof mi.getParameter ===
                    'function' ?
                    mi.getParameter(
                        name
                    ) :
                    null;


            if (
                !p &&
                mi.parameters
            ) {
                p =
                    mi.parameters[
                    name
                    ];
            }


            if (
                !p
            ) {
                return null;
            }


            var t =
                p.data !==
                    undefined ?
                    p.data :
                    p;


            return (
                t &&
                isNum(
                    t.width
                ) &&
                isNum(
                    t.height
                )
            ) ?
                t :
                null;

        } catch (_) {
            return null;
        }
    }


    function finalTextures(
        bn,
        allowed
    ) {

        var names =
            (
                pc.MeshInstance &&
                pc.MeshInstance.lightmapParamNames
            ) ||
            [
                'texture_lightMap',
                'texture_dirLightMap'
            ];


        var mis =
            bn.meshInstances ||
            [];


        var color =
            null;


        var dir =
            null;


        for (
            var i = 0;
            i < mis.length &&
            !color;
            i++
        ) {

            if (
                allowed &&
                !allowed.has(
                    mis[
                    i
                    ]
                )
            ) {
                continue;
            }


            color =
                readParam(
                    mis[
                    i
                    ],
                    names[
                    0
                    ]
                );


            dir =
                readParam(
                    mis[
                    i
                    ],
                    names[
                    1
                    ]
                );
        }


        return {
            color: color,
            dir: dir
        };
    }


    // =========================================================================
    // UV1 GBUFFER + WORLD DERIVATIVES
    // =========================================================================

    function buildGBuffer(
        geoms,
        w,
        h
    ) {

        var pos =
            new Float32Array(
                w *
                h *
                4
            );


        var nrm =
            new Float32Array(
                w *
                h *
                4
            );


        var du =
            new Float32Array(
                w *
                h *
                4
            );


        var dv =
            new Float32Array(
                w *
                h *
                4
            );


        var valid =
            0;


        geoms.forEach(
            function (
                g,
                gi
            ) {

                if (
                    !g.ok ||
                    !g.uv1
                ) {
                    return;
                }


                var uv =
                    g.uv1;


                var P =
                    g.positions;


                var N =
                    g.normals;


                for (
                    var t = 0;
                    t < g.triCount;
                    t++
                ) {

                    var i0 =
                        g.indices[
                        t *
                        3
                        ];


                    var i1 =
                        g.indices[
                        t *
                        3 +
                        1
                        ];


                    var i2 =
                        g.indices[
                        t *
                        3 +
                        2
                        ];


                    var u0 =
                        uv[
                        i0 *
                        2
                        ];


                    var v0 =
                        uv[
                        i0 *
                        2 +
                        1
                        ];


                    var u1 =
                        uv[
                        i1 *
                        2
                        ];


                    var v1 =
                        uv[
                        i1 *
                        2 +
                        1
                        ];


                    var u2 =
                        uv[
                        i2 *
                        2
                        ];


                    var v2 =
                        uv[
                        i2 *
                        2 +
                        1
                        ];


                    var x0 =
                        u0 *
                        w;


                    var y0 =
                        v0 *
                        h;


                    var x1 =
                        u1 *
                        w;


                    var y1 =
                        v1 *
                        h;


                    var x2 =
                        u2 *
                        w;


                    var y2 =
                        v2 *
                        h;


                    var den =
                        (
                            y1 -
                            y2
                        ) *
                        (
                            x0 -
                            x2
                        ) +
                        (
                            x2 -
                            x1
                        ) *
                        (
                            y0 -
                            y2
                        );


                    if (
                        Math.abs(
                            den
                        ) <
                        1e-12
                    ) {
                        continue;
                    }


                    var p0x =
                        P[
                        i0 *
                        3
                        ];


                    var p0y =
                        P[
                        i0 *
                        3 +
                        1
                        ];


                    var p0z =
                        P[
                        i0 *
                        3 +
                        2
                        ];


                    var p1x =
                        P[
                        i1 *
                        3
                        ];


                    var p1y =
                        P[
                        i1 *
                        3 +
                        1
                        ];


                    var p1z =
                        P[
                        i1 *
                        3 +
                        2
                        ];


                    var p2x =
                        P[
                        i2 *
                        3
                        ];


                    var p2y =
                        P[
                        i2 *
                        3 +
                        1
                        ];


                    var p2z =
                        P[
                        i2 *
                        3 +
                        2
                        ];


                    var eu1 =
                        u1 -
                        u0;


                    var ev1 =
                        v1 -
                        v0;


                    var eu2 =
                        u2 -
                        u0;


                    var ev2 =
                        v2 -
                        v0;


                    var uvDet =
                        eu1 *
                        ev2 -
                        ev1 *
                        eu2;


                    var dpdu = [
                        0,
                        0,
                        0
                    ];


                    var dpdv = [
                        0,
                        0,
                        0
                    ];


                    if (
                        Math.abs(
                            uvDet
                        ) >
                        1e-12
                    ) {

                        var inv =
                            1 /
                            uvDet;


                        var e1x =
                            p1x -
                            p0x;


                        var e1y =
                            p1y -
                            p0y;


                        var e1z =
                            p1z -
                            p0z;


                        var e2x =
                            p2x -
                            p0x;


                        var e2y =
                            p2y -
                            p0y;


                        var e2z =
                            p2z -
                            p0z;


                        dpdu[
                            0
                        ] =
                            (
                                e1x *
                                ev2 -
                                e2x *
                                ev1
                            ) *
                            inv;


                        dpdu[
                            1
                        ] =
                            (
                                e1y *
                                ev2 -
                                e2y *
                                ev1
                            ) *
                            inv;


                        dpdu[
                            2
                        ] =
                            (
                                e1z *
                                ev2 -
                                e2z *
                                ev1
                            ) *
                            inv;


                        dpdv[
                            0
                        ] =
                            (
                                -e1x *
                                eu2 +
                                e2x *
                                eu1
                            ) *
                            inv;


                        dpdv[
                            1
                        ] =
                            (
                                -e1y *
                                eu2 +
                                e2y *
                                eu1
                            ) *
                            inv;


                        dpdv[
                            2
                        ] =
                            (
                                -e1z *
                                eu2 +
                                e2z *
                                eu1
                            ) *
                            inv;
                    }


                    var minX =
                        Math.max(
                            0,
                            Math.floor(
                                Math.min(
                                    x0,
                                    x1,
                                    x2
                                )
                            )
                        );


                    var maxX =
                        Math.min(
                            w -
                            1,
                            Math.ceil(
                                Math.max(
                                    x0,
                                    x1,
                                    x2
                                )
                            )
                        );


                    var minY =
                        Math.max(
                            0,
                            Math.floor(
                                Math.min(
                                    y0,
                                    y1,
                                    y2
                                )
                            )
                        );


                    var maxY =
                        Math.min(
                            h -
                            1,
                            Math.ceil(
                                Math.max(
                                    y0,
                                    y1,
                                    y2
                                )
                            )
                        );


                    for (
                        var y = minY;
                        y <= maxY;
                        y++
                    ) {

                        for (
                            var x = minX;
                            x <= maxX;
                            x++
                        ) {

                            var px =
                                x +
                                0.5;


                            var py =
                                y +
                                0.5;


                            var l0 =
                                (
                                    (
                                        y1 -
                                        y2
                                    ) *
                                    (
                                        px -
                                        x2
                                    ) +
                                    (
                                        x2 -
                                        x1
                                    ) *
                                    (
                                        py -
                                        y2
                                    )
                                ) /
                                den;


                            var l1 =
                                (
                                    (
                                        y2 -
                                        y0
                                    ) *
                                    (
                                        px -
                                        x2
                                    ) +
                                    (
                                        x0 -
                                        x2
                                    ) *
                                    (
                                        py -
                                        y2
                                    )
                                ) /
                                den;


                            var l2 =
                                1 -
                                l0 -
                                l1;


                            if (
                                l0 <
                                -1e-4 ||
                                l1 <
                                -1e-4 ||
                                l2 <
                                -1e-4
                            ) {
                                continue;
                            }


                            var o =
                                (
                                    y *
                                    w +
                                    x
                                ) *
                                4;


                            if (
                                pos[
                                o +
                                3
                                ] ===
                                0
                            ) {
                                valid++;
                            }


                            pos[
                                o
                            ] =
                                l0 *
                                p0x +
                                l1 *
                                p1x +
                                l2 *
                                p2x;


                            pos[
                                o +
                                1
                            ] =
                                l0 *
                                p0y +
                                l1 *
                                p1y +
                                l2 *
                                p2y;


                            pos[
                                o +
                                2
                            ] =
                                l0 *
                                p0z +
                                l1 *
                                p1z +
                                l2 *
                                p2z;


                            pos[
                                o +
                                3
                            ] =
                                1;


                            var nx =
                                l0 *
                                N[
                                i0 *
                                3
                                ] +
                                l1 *
                                N[
                                i1 *
                                3
                                ] +
                                l2 *
                                N[
                                i2 *
                                3
                                ];


                            var ny =
                                l0 *
                                N[
                                i0 *
                                3 +
                                1
                                ] +
                                l1 *
                                N[
                                i1 *
                                3 +
                                1
                                ] +
                                l2 *
                                N[
                                i2 *
                                3 +
                                1
                                ];


                            var nz =
                                l0 *
                                N[
                                i0 *
                                3 +
                                2
                                ] +
                                l1 *
                                N[
                                i1 *
                                3 +
                                2
                                ] +
                                l2 *
                                N[
                                i2 *
                                3 +
                                2
                                ];


                            var nl =
                                Math.hypot(
                                    nx,
                                    ny,
                                    nz
                                ) ||
                                1;


                            nrm[
                                o
                            ] =
                                nx /
                                nl;


                            nrm[
                                o +
                                1
                            ] =
                                ny /
                                nl;


                            nrm[
                                o +
                                2
                            ] =
                                nz /
                                nl;


                            nrm[
                                o +
                                3
                            ] =
                                gi +
                                1;


                            du[
                                o
                            ] =
                                dpdu[
                                0
                                ];


                            du[
                                o +
                                1
                            ] =
                                dpdu[
                                1
                                ];


                            du[
                                o +
                                2
                            ] =
                                dpdu[
                                2
                                ];


                            dv[
                                o
                            ] =
                                dpdv[
                                0
                                ];


                            dv[
                                o +
                                1
                            ] =
                                dpdv[
                                1
                                ];


                            dv[
                                o +
                                2
                            ] =
                                dpdv[
                                2
                                ];
                        }
                    }
                }
            }
        );


        return {
            pos: pos,
            nrm: nrm,
            du: du,
            dv: dv,
            w: w,
            h: h,
            valid: valid
        };
    }


    function dilateGB(
        gb,
        iterations
    ) {

        var w =
            gb.w;


        var h =
            gb.h;


        var dirs = [
            [-1, 0],
            [1, 0],

            [0, -1],
            [0, 1],

            [-1, -1],
            [1, -1],

            [-1, 1],
            [1, 1]
        ];


        for (
            var it = 0;
            it < iterations;
            it++
        ) {

            var mask =
                new Uint8Array(
                    w *
                    h
                );


            var i;


            for (
                i = 0;
                i < w *
                h;
                i++
            ) {

                mask[
                    i
                ] =
                    gb.pos[
                        i *
                        4 +
                        3
                    ] >
                        0.5 ?
                        1 :
                        0;
            }


            for (
                var y = 0;
                y < h;
                y++
            ) {

                for (
                    var x = 0;
                    x < w;
                    x++
                ) {

                    i =
                        y *
                        w +
                        x;


                    if (
                        mask[
                        i
                        ]
                    ) {
                        continue;
                    }


                    for (
                        var k = 0;
                        k < dirs.length;
                        k++
                    ) {

                        var sx =
                            x +
                            dirs[
                            k
                            ][
                            0
                            ];


                        var sy =
                            y +
                            dirs[
                            k
                            ][
                            1
                            ];


                        if (
                            sx <
                            0 ||
                            sy <
                            0 ||
                            sx >=
                            w ||
                            sy >=
                            h
                        ) {
                            continue;
                        }


                        var si =
                            sy *
                            w +
                            sx;


                        if (
                            !mask[
                            si
                            ]
                        ) {
                            continue;
                        }


                        var d =
                            i *
                            4;


                        var s =
                            si *
                            4;


                        gb.pos[
                            d
                        ] =
                            gb.pos[
                            s
                            ];


                        gb.pos[
                            d +
                            1
                        ] =
                            gb.pos[
                            s +
                            1
                            ];


                        gb.pos[
                            d +
                            2
                        ] =
                            gb.pos[
                            s +
                            2
                            ];


                        gb.pos[
                            d +
                            3
                        ] =
                            2;


                        gb.nrm[
                            d
                        ] =
                            gb.nrm[
                            s
                            ];


                        gb.nrm[
                            d +
                            1
                        ] =
                            gb.nrm[
                            s +
                            1
                            ];


                        gb.nrm[
                            d +
                            2
                        ] =
                            gb.nrm[
                            s +
                            2
                            ];


                        gb.nrm[
                            d +
                            3
                        ] =
                            gb.nrm[
                            s +
                            3
                            ];


                        gb.du[
                            d
                        ] =
                            gb.du[
                            s
                            ];


                        gb.du[
                            d +
                            1
                        ] =
                            gb.du[
                            s +
                            1
                            ];


                        gb.du[
                            d +
                            2
                        ] =
                            gb.du[
                            s +
                            2
                            ];


                        gb.dv[
                            d
                        ] =
                            gb.dv[
                            s
                            ];


                        gb.dv[
                            d +
                            1
                        ] =
                            gb.dv[
                            s +
                            1
                            ];


                        gb.dv[
                            d +
                            2
                        ] =
                            gb.dv[
                            s +
                            2
                            ];


                        break;
                    }
                }
            }
        }
    }


    // =========================================================================
    // GPU PIPELINE
    // =========================================================================

    async function createDeviceState(gd) {

        var gpu =
            nativeGPUDevice(
                gd
            );


        if (
            !gpu
        ) {
            throw new Error(
                'No se encontro GPUDevice WebGPU nativo.'
            );
        }


        gpu.pushErrorScope(
            'validation'
        );


        var C =
            GPUShaderStageRef.COMPUTE;


        var entries =
            [];


        for (
            var b = 0;
            b <= 8;
            b++
        ) {

            entries.push({
                binding: b,
                visibility: C,

                buffer: {
                    type:
                        b === 0 ?
                            'uniform' :
                            (
                                b === 8 ?
                                    'storage' :
                                    'read-only-storage'
                            )
                }
            });
        }


        var bgl =
            gpu.createBindGroupLayout({
                label:
                    'BakePT50-BGL',

                entries:
                    entries
            });


        var mod =
            gpu.createShaderModule({
                label:
                    'BakePT50-WGSL',

                code:
                    WGSL
            });


        if (
            typeof mod.getCompilationInfo ===
            'function'
        ) {

            var ci =
                await mod.getCompilationInfo();


            var bad =
                false;


            ci.messages.forEach(
                function (m) {

                    (
                        m.type ===
                            'error' ?
                            fail :
                            warn
                    )(
                        'WGSL ' +
                        m.type +
                        ' L' +
                        m.lineNum +
                        ':' +
                        m.linePos +
                        ' ' +
                        m.message
                    );


                    if (
                        m.type ===
                        'error'
                    ) {
                        bad =
                            true;
                    }
                }
            );


            if (
                bad
            ) {
                throw new Error(
                    'WGSL no compilo.'
                );
            }
        }


        var pipe =
            gpu.createComputePipeline({

                label:
                    'BakePT50-Pipeline',

                layout:
                    gpu.createPipelineLayout({
                        bindGroupLayouts: [
                            bgl
                        ]
                    }),

                compute: {
                    module:
                        mod,

                    entryPoint:
                        'main'
                }
            });


        var ve =
            await gpu.popErrorScope();


        if (
            ve
        ) {
            throw new Error(
                'WebGPU validation: ' +
                ve.message
            );
        }


        return {
            gpu: gpu,
            bgl: bgl,
            pipeline: pipe
        };
    }


    function deviceState(gd) {

        var p =
            DEVICE_CACHE.get(
                gd
            );


        if (
            !p
        ) {

            p =
                createDeviceState(
                    gd
                );


            DEVICE_CACHE.set(
                gd,
                p
            );


            p.catch(
                function () {
                    DEVICE_CACHE.delete(
                        gd
                    );
                }
            );
        }


        return p;
    }


    function storage(
        gpu,
        data,
        label
    ) {

        var size =
            Math.max(
                16,
                Math.ceil(
                    data.byteLength /
                    16
                ) *
                16
            );


        var b =
            gpu.createBuffer({
                label:
                    label,

                size:
                    size,

                usage:
                    GPUBufferUsageRef.STORAGE |
                    GPUBufferUsageRef.COPY_DST
            });


        if (
            data.byteLength
        ) {

            gpu.queue.writeBuffer(
                b,
                0,

                data.buffer,
                data.byteOffset,
                data.byteLength
            );
        }


        return b;
    }


    function paramBuffer(
        gpu,
        p
    ) {

        var ab =
            new ArrayBuffer(
                80
            );


        var u =
            new Uint32Array(
                ab
            );


        var f =
            new Float32Array(
                ab
            );


        u[0] =
            p.width;

        u[1] =
            p.height;

        u[2] =
            p.triCount;

        u[3] =
            p.bvhCount;


        u[4] =
            p.lightCount;

        u[5] =
            p.sampleOffset;

        u[6] =
            p.sampleCount;

        u[7] =
            p.totalSamples;


        u[8] =
            p.maxBounces;

        u[9] =
            p.seed;


        f[12] =
            p.ambient[
            0
            ];

        f[13] =
            p.ambient[
            1
            ];

        f[14] =
            p.ambient[
            2
            ];

        f[15] =
            1;


        f[16] =
            p.rayBias;

        f[17] =
            p.maxRadiance;


        var b =
            gpu.createBuffer({

                label:
                    'BakePT50-Params',

                size:
                    80,

                usage:
                    GPUBufferUsageRef.UNIFORM |
                    GPUBufferUsageRef.COPY_DST
            });


        gpu.queue.writeBuffer(
            b,
            0,
            ab
        );


        return b;
    }


    async function traceGPU(
        ds,
        sb,
        gb,
        si,
        p,
        seed,
        owner,
        epoch
    ) {

        var gpu =
            ds.gpu;


        var w =
            gb.w;


        var h =
            gb.h;


        var outSize =
            w *
            h *
            16;


        var maxBind =
            gpu.limits &&
            gpu.limits.maxStorageBufferBindingSize;


        if (
            maxBind &&
            outSize >
            maxBind
        ) {
            throw new Error(
                'Lightmap ' +
                w +
                'x' +
                h +
                ' excede maxStorageBufferBindingSize=' +
                maxBind +
                '.'
            );
        }


        var gp =
            storage(
                gpu,
                gb.pos,
                'BakePT50-GPos'
            );


        var gn =
            storage(
                gpu,
                gb.nrm,
                'BakePT50-GNrm'
            );


        var gu =
            storage(
                gpu,
                gb.du,
                'BakePT50-GDu'
            );


        var gv =
            storage(
                gpu,
                gb.dv,
                'BakePT50-GDv'
            );


        var out =
            gpu.createBuffer({
                label:
                    'BakePT50-Out',

                size:
                    outSize,

                usage:
                    GPUBufferUsageRef.STORAGE |
                    GPUBufferUsageRef.COPY_SRC
            });


        var rd =
            gpu.createBuffer({
                label:
                    'BakePT50-Read',

                size:
                    outSize,

                usage:
                    GPUBufferUsageRef.COPY_DST |
                    GPUBufferUsageRef.MAP_READ
            });


        var params =
            [];


        try {

            for (
                var off = 0;
                off < p.samples;
                off += p.perDispatch
            ) {

                if (
                    !active(
                        owner,
                        epoch
                    )
                ) {
                    throw new Error(
                        'cancelado'
                    );
                }


                var count =
                    Math.min(
                        p.perDispatch,
                        p.samples -
                        off
                    );


                var pb =
                    paramBuffer(
                        gpu,
                        {
                            width:
                                w,

                            height:
                                h,

                            triCount:
                                si.triCount,

                            bvhCount:
                                si.bvhCount,

                            lightCount:
                                si.lightCount,

                            sampleOffset:
                                off,

                            sampleCount:
                                count,

                            totalSamples:
                                p.samples,

                            maxBounces:
                                p.bounces,

                            seed:
                                seed >>>
                                0,

                            ambient:
                                si.ambient,

                            rayBias:
                                si.rayBias,

                            maxRadiance:
                                p.maxRadiance
                        }
                    );


                params.push(
                    pb
                );


                var bg =
                    gpu.createBindGroup({

                        layout:
                            ds.bgl,

                        entries: [
                            {
                                binding:
                                    0,

                                resource: {
                                    buffer:
                                        pb
                                }
                            },

                            {
                                binding:
                                    1,

                                resource: {
                                    buffer:
                                        gp
                                }
                            },

                            {
                                binding:
                                    2,

                                resource: {
                                    buffer:
                                        gn
                                }
                            },

                            {
                                binding:
                                    3,

                                resource: {
                                    buffer:
                                        gu
                                }
                            },

                            {
                                binding:
                                    4,

                                resource: {
                                    buffer:
                                        gv
                                }
                            },

                            {
                                binding:
                                    5,

                                resource: {
                                    buffer:
                                        sb.tris
                                }
                            },

                            {
                                binding:
                                    6,

                                resource: {
                                    buffer:
                                        sb.bvh
                                }
                            },

                            {
                                binding:
                                    7,

                                resource: {
                                    buffer:
                                        sb.lights
                                }
                            },

                            {
                                binding:
                                    8,

                                resource: {
                                    buffer:
                                        out
                                }
                            }
                        ]
                    });


                var enc =
                    gpu.createCommandEncoder({
                        label:
                            'BakePT50-Encoder'
                    });


                var pass =
                    enc.beginComputePass({
                        label:
                            'BakePT50-Pass'
                    });


                pass.setPipeline(
                    ds.pipeline
                );


                pass.setBindGroup(
                    0,
                    bg
                );


                pass.dispatchWorkgroups(
                    Math.ceil(
                        w /
                        8
                    ),

                    Math.ceil(
                        h /
                        8
                    ),

                    1
                );


                pass.end();


                if (
                    off +
                    count >=
                    p.samples
                ) {

                    enc.copyBufferToBuffer(
                        out,
                        0,

                        rd,
                        0,

                        outSize
                    );
                }


                gpu.queue.submit([
                    enc.finish()
                ]);


                if (
                    typeof gpu.queue.onSubmittedWorkDone ===
                    'function'
                ) {

                    await gpu.queue.onSubmittedWorkDone();
                }
            }


            await rd.mapAsync(
                GPUMapModeRef.READ
            );


            var result =
                new Float32Array(
                    rd
                        .getMappedRange()
                        .slice(
                            0
                        )
                );


            rd.unmap();


            return result;

        } finally {

            [
                gp,
                gn,
                gu,
                gv,
                out,
                rd
            ]
                .concat(
                    params
                )
                .forEach(
                    function (b) {

                        try {
                            b.destroy();
                        } catch (_) {
                            // nada
                        }
                    }
                );
        }
    }


    // =========================================================================
    // INDIRECT-ONLY DENOISER
    // =========================================================================

    function lum(
        r,
        g,
        b
    ) {

        return (
            r *
            0.2126 +
            g *
            0.7152 +
            b *
            0.0722
        );
    }


    function denoiseIndirect(
        src,
        gb,
        extent,
        p
    ) {

        if (
            p.denoise <=
            0
        ) {
            return src;
        }


        var w =
            gb.w;


        var h =
            gb.h;


        var a =
            new Float32Array(
                src
            );


        var b =
            new Float32Array(
                src.length
            );


        var K = [
            1,
            4,
            6,
            4,
            1
        ];


        var basePos =
            Math.max(
                1e-6,
                extent /
                Math.max(
                    w,
                    h
                ) *
                p.positionScale
            );


        for (
            var it = 0;
            it < p.denoise;
            it++
        ) {

            var step =
                1 <<
                it;


            var posSigma =
                basePos *
                Math.max(
                    1,
                    step *
                    0.5
                );


            var invPos =
                1 /
                (
                    2 *
                    posSigma *
                    posSigma
                );


            for (
                var y = 0;
                y < h;
                y++
            ) {

                for (
                    var x = 0;
                    x < w;
                    x++
                ) {

                    var o =
                        (
                            y *
                            w +
                            x
                        ) *
                        4;


                    if (
                        gb.pos[
                        o +
                        3
                        ] <
                        0.5
                    ) {

                        b[
                            o
                        ] =
                            a[
                            o
                            ];


                        b[
                            o +
                            1
                        ] =
                            a[
                            o +
                            1
                            ];


                        b[
                            o +
                            2
                        ] =
                            a[
                            o +
                            2
                            ];


                        b[
                            o +
                            3
                        ] =
                            a[
                            o +
                            3
                            ];


                        continue;
                    }


                    var px =
                        gb.pos[
                        o
                        ];


                    var py =
                        gb.pos[
                        o +
                        1
                        ];


                    var pz =
                        gb.pos[
                        o +
                        2
                        ];


                    var nx =
                        gb.nrm[
                        o
                        ];


                    var ny =
                        gb.nrm[
                        o +
                        1
                        ];


                    var nz =
                        gb.nrm[
                        o +
                        2
                        ];


                    var chart =
                        gb.nrm[
                        o +
                        3
                        ];


                    var cr =
                        a[
                        o
                        ];


                    var cg =
                        a[
                        o +
                        1
                        ];


                    var cb =
                        a[
                        o +
                        2
                        ];


                    var cl =
                        lum(
                            cr,
                            cg,
                            cb
                        );


                    var sr = 0;
                    var sg = 0;
                    var sb = 0;
                    var sw = 0;


                    for (
                        var ky = -2;
                        ky <= 2;
                        ky++
                    ) {

                        var sy =
                            y +
                            ky *
                            step;


                        if (
                            sy <
                            0 ||
                            sy >=
                            h
                        ) {
                            continue;
                        }


                        for (
                            var kx = -2;
                            kx <= 2;
                            kx++
                        ) {

                            var sx =
                                x +
                                kx *
                                step;


                            if (
                                sx <
                                0 ||
                                sx >=
                                w
                            ) {
                                continue;
                            }


                            var q =
                                (
                                    sy *
                                    w +
                                    sx
                                ) *
                                4;


                            if (
                                gb.pos[
                                q +
                                3
                                ] <
                                0.5 ||
                                gb.nrm[
                                q +
                                3
                                ] !==
                                chart
                            ) {
                                continue;
                            }


                            var dx =
                                gb.pos[
                                q
                                ] -
                                px;


                            var dy =
                                gb.pos[
                                q +
                                1
                                ] -
                                py;


                            var dz =
                                gb.pos[
                                q +
                                2
                                ] -
                                pz;


                            var wp =
                                Math.exp(
                                    -(
                                        dx *
                                        dx +
                                        dy *
                                        dy +
                                        dz *
                                        dz
                                    ) *
                                    invPos
                                );


                            var nd =
                                Math.max(
                                    0,

                                    nx *
                                    gb.nrm[
                                    q
                                    ] +

                                    ny *
                                    gb.nrm[
                                    q +
                                    1
                                    ] +

                                    nz *
                                    gb.nrm[
                                    q +
                                    2
                                    ]
                                );


                            var wn =
                                Math.pow(
                                    nd,
                                    p.normalPower
                                );


                            var ql =
                                lum(
                                    a[
                                    q
                                    ],
                                    a[
                                    q +
                                    1
                                    ],
                                    a[
                                    q +
                                    2
                                    ]
                                );


                            var wc =
                                Math.exp(
                                    -Math.abs(
                                        ql -
                                        cl
                                    ) /
                                    (
                                        0.01 +
                                        Math.max(
                                            cl,
                                            ql
                                        ) *
                                        p.colorScale
                                    )
                                );


                            var wk =
                                K[
                                kx +
                                2
                                ] *
                                K[
                                ky +
                                2
                                ];


                            var ww =
                                wk *
                                wp *
                                wn *
                                wc;


                            sr +=
                                a[
                                q
                                ] *
                                ww;


                            sg +=
                                a[
                                q +
                                1
                                ] *
                                ww;


                            sb +=
                                a[
                                q +
                                2
                                ] *
                                ww;


                            sw +=
                                ww;
                        }
                    }


                    if (
                        sw >
                        1e-12
                    ) {

                        b[
                            o
                        ] =
                            sr /
                            sw;


                        b[
                            o +
                            1
                        ] =
                            sg /
                            sw;


                        b[
                            o +
                            2
                        ] =
                            sb /
                            sw;

                    } else {

                        b[
                            o
                        ] =
                            cr;


                        b[
                            o +
                            1
                        ] =
                            cg;


                        b[
                            o +
                            2
                        ] =
                            cb;
                    }


                    b[
                        o +
                        3
                    ] =
                        a[
                        o +
                        3
                        ];
                }
            }


            var tmp =
                a;

            a =
                b;

            b =
                tmp;
        }


        return a;
    }


    // =========================================================================
    // LIGHTMAP DECODE / ENCODE
    // =========================================================================

    var _f32 =
        new Float32Array(
            1
        );


    var _u32 =
        new Uint32Array(
            _f32.buffer
        );


    function halfToFloat(h) {

        var s =
            (
                h &
                0x8000
            ) ?
                -1 :
                1;


        var e =
            (
                h >>
                10
            ) &
            0x1f;


        var f =
            h &
            0x3ff;


        if (
            e ===
            0
        ) {
            return s *
                Math.pow(
                    2,
                    -14
                ) *
                (
                    f /
                    1024
                );
        }


        if (
            e ===
            31
        ) {
            return f ?
                NaN :
                s *
                Infinity;
        }


        return s *
            Math.pow(
                2,
                e -
                15
            ) *
            (
                1 +
                f /
                1024
            );
    }


    function floatToHalf(value) {

        if (
            !(value > 0)
        ) {
            return 0;
        }


        if (
            value >=
            65504
        ) {
            return 0x7bff;
        }


        _f32[0] =
            value;


        var x =
            _u32[0];


        var exp =
            (
                (
                    x >>>
                    23
                ) &
                0xff
            ) -
            127 +
            15;


        var m =
            x &
            0x7fffff;


        if (
            exp <=
            0
        ) {

            if (
                exp <
                -10
            ) {
                return 0;
            }


            m =
                (
                    m |
                    0x800000
                ) >>
                (
                    1 -
                    exp
                );


            return (
                m +
                0x1000
            ) >>
                13;
        }


        var r =
            (
                exp <<
                10
            ) +
            (
                (
                    m +
                    0x1000
                ) >>
                13
            );


        return r >=
            0x7c00 ?
            0x7bff :
            r;
    }


    function unpackUFloat(
        bits,
        mantBits
    ) {

        var mantMask =
            (
                1 <<
                mantBits
            ) -
            1;


        var mant =
            bits &
            mantMask;


        var exp =
            (
                bits >>
                mantBits
            ) &
            0x1f;


        if (
            exp ===
            0
        ) {
            return mant *
                Math.pow(
                    2,
                    1 -
                    15 -
                    mantBits
                );
        }


        if (
            exp ===
            31
        ) {
            return Infinity;
        }


        return (
            1 +
            mant /
            (
                1 <<
                mantBits
            )
        ) *
            Math.pow(
                2,
                exp -
                15
            );
    }


    function unpackR11G11B10(
        v,
        out
    ) {

        out[0] =
            unpackUFloat(
                v &
                0x7ff,
                6
            );


        out[1] =
            unpackUFloat(
                (
                    v >>>
                    11
                ) &
                0x7ff,
                6
            );


        out[2] =
            unpackUFloat(
                (
                    v >>>
                    22
                ) &
                0x3ff,
                5
            );
    }


    function packUFloat(
        v,
        mantBits
    ) {

        if (
            !Number.isFinite(
                v
            ) ||
            v <=
            0
        ) {
            return 0;
        }


        var maxMant =
            (
                1 <<
                mantBits
            ) -
            1;


        var minNormal =
            Math.pow(
                2,
                -14
            );


        var subStep =
            Math.pow(
                2,
                -14 -
                mantBits
            );


        if (
            v <
            minNormal
        ) {
            return Math.min(
                maxMant,
                Math.max(
                    0,
                    Math.round(
                        v /
                        subStep
                    )
                )
            );
        }


        var e =
            Math.floor(
                Math.log2(
                    v
                )
            );


        var be =
            e +
            15;


        if (
            be >=
            31
        ) {
            return (
                30 <<
                mantBits
            ) |
                maxMant;
        }


        var base =
            Math.pow(
                2,
                e
            );


        var mant =
            Math.round(
                (
                    v /
                    base -
                    1
                ) *
                (
                    1 <<
                    mantBits
                )
            );


        if (
            mant >=
            (
                1 <<
                mantBits
            )
        ) {

            mant =
                0;


            be++;


            if (
                be >=
                31
            ) {
                return (
                    30 <<
                    mantBits
                ) |
                    maxMant;
            }
        }


        if (
            be <=
            0
        ) {
            return Math.min(
                maxMant,
                Math.max(
                    0,
                    Math.round(
                        v /
                        subStep
                    )
                )
            );
        }


        return (
            be <<
            mantBits
        ) |
            mant;
    }


    function packR11G11B10(
        r,
        g,
        b
    ) {

        return (
            packUFloat(
                r,
                6
            ) |

            (
                packUFloat(
                    g,
                    6
                ) <<
                11
            ) |

            (
                packUFloat(
                    b,
                    5
                ) <<
                22
            )
        ) >>>
            0;
    }


    function encodeRGBM(
        r,
        g,
        b,
        out
    ) {

        var er =
            Math.sqrt(
                Math.max(
                    0,
                    r
                )
            ) /
            8;


        var eg =
            Math.sqrt(
                Math.max(
                    0,
                    g
                )
            ) /
            8;


        var eb =
            Math.sqrt(
                Math.max(
                    0,
                    b
                )
            ) /
            8;


        var a =
            clamp(
                Math.max(
                    er,
                    eg,
                    eb,
                    1 /
                    255
                ),
                0,
                1
            );


        a =
            Math.ceil(
                a *
                255
            ) /
            255;


        out[0] =
            clamp(
                er /
                a,
                0,
                1
            );


        out[1] =
            clamp(
                eg /
                a,
                0,
                1
            );


        out[2] =
            clamp(
                eb /
                a,
                0,
                1
            );


        out[3] =
            a;
    }


    function canWrite(tex) {

        var f =
            tex &&
            tex.format;


        return (
            f ===
            pc.PIXELFORMAT_RGBA8 ||

            f ===
            pc.PIXELFORMAT_SRGBA8 ||

            f ===
            pc.PIXELFORMAT_111110F ||

            f ===
            pc.PIXELFORMAT_RGBA16F ||

            f ===
            pc.PIXELFORMAT_RGBA32F ||

            f ===
            pc.PIXELFORMAT_RGB16F ||

            f ===
            pc.PIXELFORMAT_RGB32F
        );
    }


    async function readNativeLightmap(
        tex,
        w,
        h
    ) {

        if (
            !canWrite(
                tex
            )
        ) {
            throw new Error(
                'Formato nativo no soportado para lectura: ' +
                tex.format
            );
        }


        var raw =
            await tex.read(
                0,
                0,
                w,
                h,
                {
                    immediate:
                        true
                }
            );


        var out =
            new Float32Array(
                w *
                h *
                4
            );


        var count =
            w *
            h;


        var rgbm =
            tex.type ===
            pc.TEXTURETYPE_RGBM ||
            tex.encoding ===
            'rgbm';


        var tmp = [
            0,
            0,
            0
        ];


        var view =
            new DataView(
                raw.buffer,
                raw.byteOffset,
                raw.byteLength
            );


        var i;
        var o;
        var ch;


        if (
            tex.format ===
            pc.PIXELFORMAT_111110F
        ) {

            for (
                i = 0;
                i < count;
                i++
            ) {

                unpackR11G11B10(
                    view.getUint32(
                        i *
                        4,
                        true
                    ),
                    tmp
                );


                o =
                    i *
                    4;


                out[
                    o
                ] =
                    tmp[
                    0
                    ];


                out[
                    o +
                    1
                ] =
                    tmp[
                    1
                    ];


                out[
                    o +
                    2
                ] =
                    tmp[
                    2
                    ];


                out[
                    o +
                    3
                ] =
                    1;
            }


            return out;
        }


        if (
            tex.format ===
            pc.PIXELFORMAT_RGBA16F ||
            tex.format ===
            pc.PIXELFORMAT_RGB16F
        ) {

            ch =
                tex.format ===
                    pc.PIXELFORMAT_RGBA16F ?
                    4 :
                    3;


            for (
                i = 0;
                i < count;
                i++
            ) {

                o =
                    i *
                    4;


                var off =
                    i *
                    ch *
                    2;


                out[
                    o
                ] =
                    halfToFloat(
                        view.getUint16(
                            off,
                            true
                        )
                    );


                out[
                    o +
                    1
                ] =
                    halfToFloat(
                        view.getUint16(
                            off +
                            2,
                            true
                        )
                    );


                out[
                    o +
                    2
                ] =
                    halfToFloat(
                        view.getUint16(
                            off +
                            4,
                            true
                        )
                    );


                out[
                    o +
                    3
                ] =
                    1;
            }


            return out;
        }


        if (
            tex.format ===
            pc.PIXELFORMAT_RGBA32F ||
            tex.format ===
            pc.PIXELFORMAT_RGB32F
        ) {

            ch =
                tex.format ===
                    pc.PIXELFORMAT_RGBA32F ?
                    4 :
                    3;


            for (
                i = 0;
                i < count;
                i++
            ) {

                o =
                    i *
                    4;


                off =
                    i *
                    ch *
                    4;


                out[
                    o
                ] =
                    view.getFloat32(
                        off,
                        true
                    );


                out[
                    o +
                    1
                ] =
                    view.getFloat32(
                        off +
                        4,
                        true
                    );


                out[
                    o +
                    2
                ] =
                    view.getFloat32(
                        off +
                        8,
                        true
                    );


                out[
                    o +
                    3
                ] =
                    1;
            }


            return out;
        }


        // RGBA8 / sRGBA8 / RGBM8
        for (
            i = 0;
            i < count;
            i++
        ) {

            o =
                i *
                4;


            var r =
                raw[
                o
                ] /
                255;


            var g =
                raw[
                o +
                1
                ] /
                255;


            var b =
                raw[
                o +
                2
                ] /
                255;


            var a =
                raw[
                o +
                3
                ] /
                255;


            if (
                rgbm
            ) {

                var m =
                    8 *
                    a;


                out[
                    o
                ] =
                    (
                        r *
                        m
                    ) *
                    (
                        r *
                        m
                    );


                out[
                    o +
                    1
                ] =
                    (
                        g *
                        m
                    ) *
                    (
                        g *
                        m
                    );


                out[
                    o +
                    2
                ] =
                    (
                        b *
                        m
                    ) *
                    (
                        b *
                        m
                    );

            } else if (
                tex.format ===
                pc.PIXELFORMAT_SRGBA8 ||
                tex.srgb
            ) {

                out[
                    o
                ] =
                    srgbToLinear1(
                        r
                    );


                out[
                    o +
                    1
                ] =
                    srgbToLinear1(
                        g
                    );


                out[
                    o +
                    2
                ] =
                    srgbToLinear1(
                        b
                    );

            } else {

                out[
                    o
                ] =
                    r;


                out[
                    o +
                    1
                ] =
                    g;


                out[
                    o +
                    2
                ] =
                    b;
            }


            out[
                o +
                3
            ] =
                1;
        }


        return out;
    }


    function writeTexture(
        tex,
        pixels,
        w,
        h,
        maxRadiance
    ) {

        if (
            !canWrite(
                tex
            )
        ) {
            throw new Error(
                'Formato de lightmap no soportado: ' +
                tex.format
            );
        }


        var dst =
            tex.lock({
                level:
                    0,

                face:
                    0
            });


        if (
            !dst
        ) {
            throw new Error(
                'texture.lock() no devolvio buffer.'
            );
        }


        var view =
            new DataView(
                dst.buffer,
                dst.byteOffset,
                dst.byteLength
            );


        var count =
            w *
            h;


        var mode =
            '';


        try {

            var i;
            var r;
            var g;
            var b;
            var off;
            var ch;


            if (
                tex.format ===
                pc.PIXELFORMAT_111110F
            ) {

                mode =
                    'R11G11B10F';


                for (
                    i = 0;
                    i < count;
                    i++
                ) {

                    r =
                        clamp(
                            Number.isFinite(
                                pixels[
                                i *
                                4
                                ]
                            ) ?
                                pixels[
                                i *
                                4
                                ] :
                                0,
                            0,
                            maxRadiance
                        );


                    g =
                        clamp(
                            Number.isFinite(
                                pixels[
                                i *
                                4 +
                                1
                                ]
                            ) ?
                                pixels[
                                i *
                                4 +
                                1
                                ] :
                                0,
                            0,
                            maxRadiance
                        );


                    b =
                        clamp(
                            Number.isFinite(
                                pixels[
                                i *
                                4 +
                                2
                                ]
                            ) ?
                                pixels[
                                i *
                                4 +
                                2
                                ] :
                                0,
                            0,
                            maxRadiance
                        );


                    view.setUint32(
                        i *
                        4,
                        packR11G11B10(
                            r,
                            g,
                            b
                        ),
                        true
                    );
                }

            } else if (
                tex.format ===
                pc.PIXELFORMAT_RGBA16F ||
                tex.format ===
                pc.PIXELFORMAT_RGB16F
            ) {

                ch =
                    tex.format ===
                        pc.PIXELFORMAT_RGBA16F ?
                        4 :
                        3;


                mode =
                    ch ===
                        4 ?
                        'RGBA16F' :
                        'RGB16F';


                for (
                    i = 0;
                    i < count;
                    i++
                ) {

                    r =
                        clamp(
                            pixels[
                            i *
                            4
                            ] ||
                            0,
                            0,
                            maxRadiance
                        );


                    g =
                        clamp(
                            pixels[
                            i *
                            4 +
                            1
                            ] ||
                            0,
                            0,
                            maxRadiance
                        );


                    b =
                        clamp(
                            pixels[
                            i *
                            4 +
                            2
                            ] ||
                            0,
                            0,
                            maxRadiance
                        );


                    off =
                        i *
                        ch *
                        2;


                    view.setUint16(
                        off,
                        floatToHalf(
                            r
                        ),
                        true
                    );


                    view.setUint16(
                        off +
                        2,
                        floatToHalf(
                            g
                        ),
                        true
                    );


                    view.setUint16(
                        off +
                        4,
                        floatToHalf(
                            b
                        ),
                        true
                    );


                    if (
                        ch ===
                        4
                    ) {
                        view.setUint16(
                            off +
                            6,
                            0x3c00,
                            true
                        );
                    }
                }

            } else if (
                tex.format ===
                pc.PIXELFORMAT_RGBA32F ||
                tex.format ===
                pc.PIXELFORMAT_RGB32F
            ) {

                ch =
                    tex.format ===
                        pc.PIXELFORMAT_RGBA32F ?
                        4 :
                        3;


                mode =
                    ch ===
                        4 ?
                        'RGBA32F' :
                        'RGB32F';


                for (
                    i = 0;
                    i < count;
                    i++
                ) {

                    r =
                        clamp(
                            pixels[
                            i *
                            4
                            ] ||
                            0,
                            0,
                            maxRadiance
                        );


                    g =
                        clamp(
                            pixels[
                            i *
                            4 +
                            1
                            ] ||
                            0,
                            0,
                            maxRadiance
                        );


                    b =
                        clamp(
                            pixels[
                            i *
                            4 +
                            2
                            ] ||
                            0,
                            0,
                            maxRadiance
                        );


                    off =
                        i *
                        ch *
                        4;


                    view.setFloat32(
                        off,
                        r,
                        true
                    );


                    view.setFloat32(
                        off +
                        4,
                        g,
                        true
                    );


                    view.setFloat32(
                        off +
                        8,
                        b,
                        true
                    );


                    if (
                        ch ===
                        4
                    ) {
                        view.setFloat32(
                            off +
                            12,
                            1,
                            true
                        );
                    }
                }

            } else {

                var rgbm =
                    tex.type ===
                    pc.TEXTURETYPE_RGBM ||
                    tex.encoding ===
                    'rgbm';


                var srgb =
                    tex.format ===
                    pc.PIXELFORMAT_SRGBA8 ||
                    tex.srgb;


                var q = [
                    0,
                    0,
                    0,
                    1
                ];


                mode =
                    rgbm ?
                        'RGBM8' :
                        (
                            srgb ?
                                'sRGBA8' :
                                'RGBA8-linear'
                        );


                for (
                    i = 0;
                    i < count;
                    i++
                ) {

                    r =
                        clamp(
                            Number.isFinite(
                                pixels[
                                i *
                                4
                                ]
                            ) ?
                                pixels[
                                i *
                                4
                                ] :
                                0,
                            0,
                            maxRadiance
                        );


                    g =
                        clamp(
                            Number.isFinite(
                                pixels[
                                i *
                                4 +
                                1
                                ]
                            ) ?
                                pixels[
                                i *
                                4 +
                                1
                                ] :
                                0,
                            0,
                            maxRadiance
                        );


                    b =
                        clamp(
                            Number.isFinite(
                                pixels[
                                i *
                                4 +
                                2
                                ]
                            ) ?
                                pixels[
                                i *
                                4 +
                                2
                                ] :
                                0,
                            0,
                            maxRadiance
                        );


                    off =
                        i *
                        4;


                    if (
                        rgbm
                    ) {

                        encodeRGBM(
                            r,
                            g,
                            b,
                            q
                        );


                        dst[
                            off
                        ] =
                            Math.round(
                                q[
                                0
                                ] *
                                255
                            );


                        dst[
                            off +
                            1
                        ] =
                            Math.round(
                                q[
                                1
                                ] *
                                255
                            );


                        dst[
                            off +
                            2
                        ] =
                            Math.round(
                                q[
                                2
                                ] *
                                255
                            );


                        dst[
                            off +
                            3
                        ] =
                            Math.round(
                                q[
                                3
                                ] *
                                255
                            );

                    } else if (
                        srgb
                    ) {

                        dst[
                            off
                        ] =
                            Math.round(
                                linearToSrgb1(
                                    r
                                ) *
                                255
                            );


                        dst[
                            off +
                            1
                        ] =
                            Math.round(
                                linearToSrgb1(
                                    g
                                ) *
                                255
                            );


                        dst[
                            off +
                            2
                        ] =
                            Math.round(
                                linearToSrgb1(
                                    b
                                ) *
                                255
                            );


                        dst[
                            off +
                            3
                        ] =
                            255;

                    } else {

                        dst[
                            off
                        ] =
                            Math.round(
                                clamp(
                                    r,
                                    0,
                                    1
                                ) *
                                255
                            );


                        dst[
                            off +
                            1
                        ] =
                            Math.round(
                                clamp(
                                    g,
                                    0,
                                    1
                                ) *
                                255
                            );


                        dst[
                            off +
                            2
                        ] =
                            Math.round(
                                clamp(
                                    b,
                                    0,
                                    1
                                ) *
                                255
                            );


                        dst[
                            off +
                            3
                        ] =
                            255;
                    }
                }
            }

        } finally {

            tex.unlock();
        }


        return {
            mode: mode,
            format: tex.format,
            type: tex.type,
            encoding: tex.encoding
        };
    }


    function combineNativeAndIndirect(
        nativePixels,
        indirect,
        gb,
        maxRadiance
    ) {

        var out =
            new Float32Array(
                nativePixels.length
            );


        var count =
            nativePixels.length /
            4;


        for (
            var i = 0;
            i < count;
            i++
        ) {

            var o =
                i *
                4;


            if (
                gb.pos[
                o +
                3
                ] >
                0.5
            ) {

                out[
                    o
                ] =
                    clamp(
                        nativePixels[
                        o
                        ] +
                        Math.max(
                            0,
                            indirect[
                            o
                            ]
                        ),
                        0,
                        maxRadiance
                    );


                out[
                    o +
                    1
                ] =
                    clamp(
                        nativePixels[
                        o +
                        1
                        ] +
                        Math.max(
                            0,
                            indirect[
                            o +
                            1
                            ]
                        ),
                        0,
                        maxRadiance
                    );


                out[
                    o +
                    2
                ] =
                    clamp(
                        nativePixels[
                        o +
                        2
                        ] +
                        Math.max(
                            0,
                            indirect[
                            o +
                            2
                            ]
                        ),
                        0,
                        maxRadiance
                    );

            } else {

                out[
                    o
                ] =
                    nativePixels[
                    o
                    ];


                out[
                    o +
                    1
                ] =
                    nativePixels[
                    o +
                    1
                    ];


                out[
                    o +
                    2
                ] =
                    nativePixels[
                    o +
                    2
                    ];
            }


            out[
                o +
                3
            ] =
                1;
        }


        return out;
    }


    // =========================================================================
    // TEMPORARY NATIVE-BAKE POLICY
    // =========================================================================

    function suppressDynamicNonLightmappedCasters(lm) {

        var ri =
            rootOf(
                lm
            );


        var changed =
            [];


        if (
            !ri.root
        ) {
            return changed;
        }


        [
            'render',
            'model'
        ].forEach(
            function (type) {

                var comps =
                    [];


                try {
                    comps =
                        ri.root.findComponents(
                            type
                        ) ||
                        [];
                } catch (_) {
                    comps =
                        [];
                }


                comps.forEach(
                    function (comp) {

                        if (
                            !comp ||
                            !comp.enabled ||
                            !comp.entity ||
                            !comp.entity.enabled
                        ) {
                            return;
                        }


                        // Explicit static objects may cast permanent baked shadows even when
                        // not lightmapped. Dynamic non-lightmapped objects must stay out of
                        // a permanent lightmap.
                        if (
                            comp.castShadowsLightmap ===
                            true &&
                            comp.lightmapped !==
                            true &&
                            comp.isStatic !==
                            true
                        ) {

                            changed.push(
                                comp
                            );


                            comp.castShadowsLightmap =
                                false;
                        }
                    }
                );
            }
        );


        return changed;
    }


    function restoreSuppressedCasters(changed) {

        for (
            var i = 0;
            i < changed.length;
            i++
        ) {

            try {
                changed[
                    i
                ].castShadowsLightmap =
                    true;
            } catch (_) {
                // nada
            }
        }
    }


    // =========================================================================
    // RUN HYBRID GI
    // =========================================================================

    async function run(
        lm,
        bakeNodes,
        passCount,
        gd,
        owner,
        epoch
    ) {

        if (
            !active(
                owner,
                epoch
            )
        ) {
            return;
        }


        if (
            !webgpuOK(
                gd
            )
        ) {

            warn(
                'WebGPU Compute no disponible; se conserva el bake nativo.'
            );

            return;
        }


        var p =
            preset(
                owner
            );


        var t0 =
            now();


        var scene =
            collectScene(
                lm,
                bakeNodes,
                p
            );


        var lights =
            collectLights(
                lm
            );


        var amb =
            collectAmbient(
                lm
            );


        var sc =
            lm.scene;


        // Smaller than PT4.x global bias, but still scale-aware.
        var rayBias =
            Math.max(
                0.00005,
                scene.extent *
                0.000025
            );


        var appCfg = {
            lightmapSizeMultiplier:
                sc &&
                sc.lightmapSizeMultiplier,

            lightmapMaxResolution:
                sc &&
                sc.lightmapMaxResolution,

            lightmapHDR:
                sc &&
                sc.lightmapHDR,

            lightmapPixelFormat:
                sc &&
                sc.lightmapPixelFormat,

            lightmapMode:
                sc &&
                sc.lightmapMode,

            filterEnabled:
                sc &&
                sc.lightmapFilterEnabled,

            filterRange:
                sc &&
                sc.lightmapFilterRange,

            filterSmoothness:
                sc &&
                sc.lightmapFilterSmoothness,

            ambientBake:
                sc &&
                sc.ambientBake,

            physicalUnits:
                sc &&
                sc.physicalUnits
        };


        G.__bakePathTracingLastReport = {
            version:
                VERSION,

            quality:
                p.label,

            app:
                appCfg,

            geometry:
                scene.stats,

            triangles:
                scene.triCount,

            bvhNodes:
                scene.bvhCount,

            lights:
                lights.stats,

            nodes:
                []
        };


        log(
            'Version ' +
            VERSION +
            ' | ' +
            p.label +
            ' | ' +
            p.samples +
            ' spp indirect / ' +
            p.bounces +
            ' bounces | denoise=' +
            p.denoise
        );


        log(
            'Arquitectura: direct/native + alpha/native + dir/native + indirect/WebGPU PT.'
        );


        log(
            'Configuracion APP (NO modificada): ' +
            JSON.stringify(
                appCfg
            )
        );


        log(
            'Transporte PT: ' +
            scene.transportGeoms.length +
            ' meshes, ' +
            scene.triCount +
            ' tris, BVH ' +
            scene.bvhCount +
            ' nodos; receivers=' +
            scene.receivers.size
        );


        log(
            'Filtro geometria: ' +
            JSON.stringify(
                scene.stats
            )
        );


        log(
            'Bounds ' +
            fmt(
                scene.boundsMin,
                2
            ) +
            ' -> ' +
            fmt(
                scene.boundsMax,
                2
            ) +
            ' rayBias=' +
            rayBias
        );


        log(
            'Luces bake=' +
            lights.count +
            ': ' +
            JSON.stringify(
                lights.stats
            )
        );


        if (
            lights.stats.runtimeAffectLightmapped >
            0
        ) {

            warn(
                lights.stats.runtimeAffectLightmapped +
                ' luz/luces NO baked siguen con Affect Lightmapped=true. ' +
                'Se suman en runtime y pueden confundir la evaluacion visual del bake.'
            );
        }


        if (
            scene.stats.transparentTransportExcluded >
            0
        ) {

            log(
                'Materiales transparentes/cutout excluidos SOLO del rebote indirecto PT: ' +
                scene.stats.transparentTransportExcluded +
                '. El direct shadow sigue siendo el nativo de PlayCanvas.'
            );
        }


        if (
            scene.stats.texturedTransportApprox >
            0
        ) {

            warn(
                scene.stats.texturedTransportApprox +
                ' mesh(es) estaticos usan diffuseMap: PT5.0 usa el diffuse constante ' +
                'para el color bleed; el direct nativo conserva las texturas.'
            );
        }


        lights.report.forEach(
            function (l) {

                log(
                    '  luz "' +
                    l.entity +
                    '" ' +
                    l.type +
                    ' color=' +
                    fmt(
                        l.color
                    ) +
                    ' shadow=' +
                    l.castShadows +
                    ' bakeArea=' +
                    l.bakeArea
                );
            }
        );


        log(
            'Ambient secundario=' +
            fmt(
                amb.rgb
            ) +
            ' (' +
            amb.source +
            ')'
        );


        if (
            !scene.triCount ||
            !lights.count
        ) {

            warn(
                'No hay geometria de transporte o luces baked para GI indirecta; ' +
                'se conserva el bake nativo.'
            );

            return;
        }


        var ds =
            await deviceState(
                gd
            );


        if (
            !active(
                owner,
                epoch
            )
        ) {
            return;
        }


        var gpu =
            ds.gpu;


        var sb = {

            tris:
                storage(
                    gpu,
                    scene.tris,
                    'BakePT50-Tris'
                ),

            bvh:
                storage(
                    gpu,
                    scene.bvh,
                    'BakePT50-BVH'
                ),

            lights:
                storage(
                    gpu,
                    lights.data,
                    'BakePT50-Lights'
                )
        };


        var si = {
            triCount:
                scene.triCount,

            bvhCount:
                scene.bvhCount,

            lightCount:
                lights.count,

            ambient:
                amb.rgb,

            rayBias:
                rayBias
        };


        try {

            for (
                var n = 0;
                n < bakeNodes.length;
                n++
            ) {

                if (
                    !active(
                        owner,
                        epoch
                    )
                ) {
                    break;
                }


                var bn =
                    bakeNodes[
                    n
                    ];


                var name =
                    (
                        bn.node &&
                        bn.node.name
                    ) ||
                    (
                        'node' +
                        n
                    );


                var nodeGeoms =
                    [];


                var mis =
                    bn.meshInstances ||
                    [];


                for (
                    var i = 0;
                    i < mis.length;
                    i++
                ) {

                    if (
                        !scene.receivers.has(
                            mis[
                            i
                            ]
                        )
                    ) {
                        continue;
                    }


                    var g =
                        scene.cache.get(
                            mis[
                            i
                            ]
                        );


                    if (
                        g &&
                        g.ok
                    ) {
                        nodeGeoms.push(
                            g
                        );
                    }
                }


                if (
                    !nodeGeoms.length
                ) {

                    log(
                        'SKIP "' +
                        name +
                        '": sin receiver lightmapped.'
                    );

                    continue;
                }


                var ft =
                    finalTextures(
                        bn,
                        scene.receivers
                    );


                if (
                    !ft.color
                ) {

                    warn(
                        'No se encontro texture_lightMap final de "' +
                        name +
                        '"; queda nativo.'
                    );

                    continue;
                }


                var tex =
                    ft.color;


                var w =
                    Math.max(
                        1,
                        tex.width |
                        0
                    );


                var h =
                    Math.max(
                        1,
                        tex.height |
                        0
                    );


                if (
                    !canWrite(
                        tex
                    )
                ) {

                    warn(
                        'Formato ' +
                        tex.format +
                        ' no soportado para "' +
                        name +
                        '"; queda nativo.'
                    );

                    continue;
                }


                var nativeStart =
                    now();


                var nativePixels =
                    await readNativeLightmap(
                        tex,
                        w,
                        h
                    );


                var nativeReadMs =
                    Math.round(
                        now() -
                        nativeStart
                    );


                var gb =
                    buildGBuffer(
                        nodeGeoms,
                        w,
                        h
                    );


                dilateGB(
                    gb,
                    p.dilation
                );


                var coverage =
                    100 *
                    gb.valid /
                    (
                        w *
                        h
                    );


                log(
                    'BakeNode "' +
                    name +
                    '" ' +
                    w +
                    'x' +
                    h +
                    ' coverage=' +
                    coverage.toFixed(
                        1
                    ) +
                    '% texture="' +
                    tex.name +
                    '" format=' +
                    tex.format +
                    ' type=' +
                    tex.type +
                    ' encoding=' +
                    tex.encoding +
                    ' nativeRead=' +
                    nativeReadMs +
                    'ms'
                );


                var nt = {
                    name:
                        name,

                    width:
                        w,

                    height:
                        h,

                    coverage:
                        coverage,

                    format:
                        tex.format,

                    type:
                        tex.type,

                    encoding:
                        tex.encoding,

                    nativeReadMs:
                        nativeReadMs
                };


                G.__bakePathTracingLastReport.nodes.push(
                    nt
                );


                if (
                    !gb.valid
                ) {
                    continue;
                }


                var ts =
                    now();


                var indirect =
                    await traceGPU(
                        ds,
                        sb,
                        gb,
                        si,
                        p,

                        1234 +
                        n *
                        7919,

                        owner,
                        epoch
                    );


                if (
                    !active(
                        owner,
                        epoch
                    )
                ) {
                    break;
                }


                nt.traceMs =
                    Math.round(
                        now() -
                        ts
                    );


                var td =
                    now();


                indirect =
                    denoiseIndirect(
                        indirect,
                        gb,
                        scene.extent,
                        p
                    );


                nt.denoiseMs =
                    Math.round(
                        now() -
                        td
                    );


                var finalPixels =
                    combineNativeAndIndirect(
                        nativePixels,
                        indirect,
                        gb,
                        p.maxRadiance
                    );


                var wr =
                    writeTexture(
                        tex,
                        finalPixels,
                        w,
                        h,
                        p.maxRadiance
                    );


                nt.writer =
                    wr.mode;


                log(
                    '  OK indirectTrace=' +
                    nt.traceMs +
                    'ms denoise=' +
                    nt.denoiseMs +
                    'ms + nativeDirect writer=' +
                    wr.mode
                );
            }

        } finally {

            try {
                sb.tris.destroy();
            } catch (_) {
                // nada
            }


            try {
                sb.bvh.destroy();
            } catch (_) {
                // nada
            }


            try {
                sb.lights.destroy();
            } catch (_) {
                // nada
            }
        }


        log(
            'Hybrid Path Tracing terminado en ' +
            Math.round(
                now() -
                t0
            ) +
            ' ms. Direct shadows y texture_dirLightMap permanecen nativos.'
        );
    }


    // =========================================================================
    // PATCH MANAGEMENT
    // =========================================================================

    function restoreLegacy(LP) {

        var candidates = [
            G.__bakePathTracingPT42 &&
            G.__bakePathTracingPT42.state,

            G.__bakePathTracingPT41 &&
            G.__bakePathTracingPT41.state,

            G.__bakePathTracingPT4State
        ];


        candidates.forEach(
            function (old) {

                if (
                    !old ||
                    !old.installed
                ) {
                    return;
                }


                if (
                    typeof old.nativeBake ===
                    'function'
                ) {
                    LP.bake =
                        old.nativeBake;
                }


                if (
                    typeof old.nativePost ===
                    'function'
                ) {
                    LP.postprocessTextures =
                        old.nativePost;
                }


                if (
                    typeof old.nativePostprocess ===
                    'function'
                ) {
                    LP.postprocessTextures =
                        old.nativePostprocess;
                }


                old.installed =
                    false;


                old.owner =
                    null;


                old.epoch =
                    (
                        old.epoch ||
                        0
                    ) +
                    1;
            }
        );


        if (
            typeof LP.__bakePathTracingOriginalBake ===
            'function'
        ) {
            LP.bake =
                LP.__bakePathTracingOriginalBake;
        }


        if (
            typeof LP.__bakePathTracingOriginalPostprocessTextures ===
            'function'
        ) {
            LP.postprocessTextures =
                LP.__bakePathTracingOriginalPostprocessTextures;
        }
    }


    function install(owner) {

        if (
            !pc.Lightmapper ||
            !pc.Lightmapper.prototype
        ) {

            fail(
                'pc.Lightmapper no disponible.'
            );

            return;
        }


        var LP =
            pc.Lightmapper.prototype;


        var s =
            state();


        if (
            s.installed
        ) {

            s.owner =
                owner;


            s.epoch++;


            log(
                'Hook ya instalado; owner actualizado.'
            );


            return;
        }


        restoreLegacy(
            LP
        );


        s.nativeBake =
            LP.bake;


        s.nativePost =
            LP.postprocessTextures;


        if (
            typeof s.nativeBake !==
            'function' ||
            typeof s.nativePost !==
            'function'
        ) {

            fail(
                'No se encontraron funciones nativas del Lightmapper.'
            );

            return;
        }


        s.patchedPost =
            function (
                device,
                bakeNodes,
                passCount
            ) {

                var r =
                    s.nativePost.apply(
                        this,
                        arguments
                    );


                this[
                    CAP_DEVICE
                ] =
                    device;


                this[
                    CAP_NODES
                ] =
                    bakeNodes;


                this[
                    CAP_PASS
                ] =
                    passCount;


                return r;
            };


        s.patchedBake =
            function (
                nodes,
                mode
            ) {

                var lm =
                    this;


                var ownerNow =
                    s.owner;


                if (
                    !s.installed ||
                    !ownerNow ||
                    !ownerNow.enabled
                ) {

                    return s.nativeBake.apply(
                        lm,
                        arguments
                    );
                }


                lm[
                    CAP_NODES
                ] =
                    null;


                lm[
                    CAP_PASS
                ] =
                    0;


                lm[
                    CAP_DEVICE
                ] =
                    null;


                s.epoch++;


                var epoch =
                    s.epoch;


                // A dynamic non-lightmapped object should not be frozen into
                // a permanent static lightmap.
                var suppressed =
                    suppressDynamicNonLightmappedCasters(
                        lm
                    );


                if (
                    suppressed.length
                ) {

                    log(
                        'Bake nativo: suprimiendo temporalmente ' +
                        suppressed.length +
                        ' caster(s) dinamicos no-lightmapped. ' +
                        'Marcalos Static si queres hornear su sombra.'
                    );
                }


                var r;


                try {

                    r =
                        s.nativeBake.apply(
                            lm,
                            arguments
                        );

                } finally {

                    restoreSuppressedCasters(
                        suppressed
                    );
                }


                var bakeNodes =
                    lm[
                    CAP_NODES
                    ];


                if (
                    !Array.isArray(
                        bakeNodes
                    ) ||
                    !bakeNodes.length
                ) {

                    warn(
                        'Bake nativo termino sin bakeNodes capturados.'
                    );

                    return r;
                }


                var pp =
                    preset(
                        ownerNow
                    );


                var sc =
                    lm.scene;


                log(
                    'Bake nativo listo: mode=' +
                    mode +

                    ' passCount=' +
                    (
                        lm[
                        CAP_PASS
                        ] ||
                        1
                    ) +

                    ' nodes=' +
                    bakeNodes.length +

                    ' | calidad=' +
                    pp.label +

                    ' | APP sizeMultiplier=' +
                    (
                        sc &&
                        sc.lightmapSizeMultiplier
                    ) +

                    ' maxRes=' +
                    (
                        sc &&
                        sc.lightmapMaxResolution
                    ) +

                    ' HDR=' +
                    (
                        sc &&
                        sc.lightmapHDR
                    ) +

                    ' pixelFormat=' +
                    (
                        sc &&
                        sc.lightmapPixelFormat
                    )
                );


                try {

                    var promise =
                        run(
                            lm,
                            bakeNodes,

                            lm[
                            CAP_PASS
                            ] ||
                            1,

                            lm[
                            CAP_DEVICE
                            ] ||
                            lm.device ||
                            (
                                lm.app &&
                                lm.app.graphicsDevice
                            ),

                            ownerNow,
                            epoch
                        );


                    lm[
                        CAP_PROMISE
                    ] =
                        promise;


                    if (
                        promise &&
                        typeof promise.catch ===
                        'function'
                    ) {

                        promise.catch(
                            function (e) {

                                var text =
                                    String(
                                        e &&
                                        e.message ||
                                        e
                                    );


                                if (
                                    text.indexOf(
                                        'cancelado'
                                    ) >=
                                    0
                                ) {

                                    log(
                                        'Bake PT cancelado.'
                                    );

                                } else {

                                    fail(
                                        'Error Hybrid Path Tracing:',
                                        e
                                    );
                                }
                            }
                        );
                    }

                } catch (e) {

                    fail(
                        'No se pudo iniciar Hybrid Path Tracing:',
                        e
                    );
                }


                return r;
            };


        LP.postprocessTextures =
            s.patchedPost;


        LP.bake =
            s.patchedBake;


        s.owner =
            owner;


        s.installed =
            true;


        s.epoch++;


        G.__bakePathTracingPT50 = {
            version:
                VERSION,

            state:
                s,

            shader:
                WGSL,

            quality:
                QUALITY,

            lastReport:
                function () {
                    return G.__bakePathTracingLastReport;
                }
        };


        log(
            'Hook ' +
            VERSION +
            ' ACTIVADO. Direct=nativo; GI indirecta=WebGPU PT; ' +
            'dinamicos no-lightmapped no se congelan en el bake.'
        );
    }


    function uninstall(owner) {

        var s =
            state();


        if (
            !s.installed
        ) {
            return;
        }


        if (
            owner &&
            s.owner &&
            s.owner !==
            owner
        ) {
            return;
        }


        if (
            pc.Lightmapper &&
            pc.Lightmapper.prototype
        ) {

            var LP =
                pc.Lightmapper.prototype;


            if (
                s.nativeBake
            ) {
                LP.bake =
                    s.nativeBake;
            }


            if (
                s.nativePost
            ) {
                LP.postprocessTextures =
                    s.nativePost;
            }
        }


        s.installed =
            false;


        s.owner =
            null;


        s.epoch++;


        console.log(
            '[BakePT5] Hook DESACTIVADO. ' +
            'Los proximos bakes son PlayCanvas nativo.'
        );
    }


    // =========================================================================
    // SCRIPT LIFECYCLE
    // =========================================================================

    BakePathTracing.prototype.initialize =
        function () {

            var self =
                this;


            this.on(
                'enable',
                function () {
                    install(
                        self
                    );
                }
            );


            this.on(
                'disable',
                function () {
                    uninstall(
                        self
                    );
                }
            );


            this.on(
                'destroy',
                function () {
                    uninstall(
                        self
                    );
                }
            );


            this.on(
                'attr:quality',
                function () {

                    log(
                        'Calidad cambiada a ' +
                        preset(
                            self
                        ).label +
                        '. Se aplicara al proximo bake.'
                    );
                }
            );


            if (
                this.enabled
            ) {
                install(
                    this
                );
            }
        };


    BakePathTracing.prototype.swap =
        function () {

            if (
                this.enabled
            ) {
                install(
                    this
                );
            }
        };

})();