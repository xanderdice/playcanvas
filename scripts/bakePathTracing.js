/*
 * ============================================================================
 * bakePathTracing.js  -  2.22.6-PT-3.0.0  (ETAPA 1: geometría real)
 * ============================================================================
 *
 * Monkey-Patch externo (IIFE) para PlayCanvas 2.22.x.
 *
 *   Lightmapper.bake()
 *      -> bake nativo (UV1, render targets, dilate...)
 *      -> postprocessTextures()  [hook: captura bakeNodes/passCount]
 *      -> bakePathTraceLights()
 *           1. Geometría REAL: bakeNode.meshInstances (+ oclusores de la escena)
 *              positions / normals / UV1 / indices / worldTransform -> triángulos
 *              en espacio mundial.
 *           2. Luces REALES: componentes 'light' con bake=true (+ ambient si
 *              scene.ambientBake).
 *           3. Pass correcto: la textura que el MeshInstance realmente muestrea
 *              como 'texture_lightMap' (NO se toca la textura de dirección ni
 *              las temporales).
 *           4. G-buffer por texel (CPU): UV1 texel -> triángulo -> barycentric
 *              -> posición mundial + normal mundial.
 *           5. WebGPU Compute (WGSL): sombras + rebotes contra los triángulos
 *              reales (fuerza bruta, sin BVH todavía).
 *           6. Readback -> encoding al formato REAL de la textura
 *              (f32 / f16 / RGBM / gamma / linear) -> lock/unlock/upload.
 *
 * Convención de unidades (igual que PlayCanvas): el lightmap almacena
 * "irradiancia / PI", es decir  luz.color * N.L * atenuación.  El albedo del
 * receptor se aplica luego en el shader del material.
 *
 * NO usa this.bakedTextures. NO usa escena ficticia.
 * ============================================================================
 */

(function (global) {
    'use strict';

    // =========================================================================
    // 0. VALIDACIÓN DEL ENTORNO
    // =========================================================================

    const pc = global && global.pc;

    if (!pc) {
        console.warn('[bakePathTracing.js] PlayCanvas (pc) no está disponible.');
        return;
    }

    if (!pc.Lightmapper || !pc.Lightmapper.prototype) {
        console.warn('[bakePathTracing.js] pc.Lightmapper no está disponible.');
        return;
    }

    const LP = pc.Lightmapper.prototype;

    // =========================================================================
    // 1. CLAVES / VERSIÓN
    // =========================================================================

    const PATCH_VERSION = '2.22.6-PT-3.0.0';
    const PATCH_FLAG = '__bakePathTracingMonkeyPatchInstalled';
    const VERSION_KEY = '__bakePathTracingVersion';
    const ORIGINAL_BAKE_KEY = '__bakePathTracingOriginalBake';
    const ORIGINAL_POSTPROCESS_KEY = '__bakePathTracingOriginalPostprocessTextures';
    const BAKENODES_KEY = '__bakePathTracingBakeNodes';
    const PASSCOUNT_KEY = '__bakePathTracingPassCount';
    const DEVICE_KEY = '__bakePathTracingPendingDevice';
    const TOKEN_KEY = '__bakePathTracingToken';
    const PROMISE_KEY = '__bakePathTracingPromise';

    // Recuperar nativos (permite recargar el script sin doble parche).
    const nativeBake = typeof LP[ORIGINAL_BAKE_KEY] === 'function' ?
        LP[ORIGINAL_BAKE_KEY] : LP.bake;

    const nativePostprocessTextures =
        typeof LP[ORIGINAL_POSTPROCESS_KEY] === 'function' ?
            LP[ORIGINAL_POSTPROCESS_KEY] : LP.postprocessTextures;

    if (typeof nativeBake !== 'function') {
        console.error('[bakePathTracing.js] No se encontró Lightmapper.prototype.bake().');
        return;
    }
    if (typeof nativePostprocessTextures !== 'function') {
        console.error('[bakePathTracing.js] No se encontró Lightmapper.prototype.postprocessTextures().');
        return;
    }

    // =========================================================================
    // 2. CONFIGURACIÓN
    // =========================================================================

    const CONFIG = {
        enabled: true,

        // Monte Carlo
        samplesPerTexel: 64,       // total por texel
        samplesPerDispatch: 16,    // por dispatch (evita timeouts de GPU)
        maxBounces: 2,             // rebotes difusos (GI)
        maxRadiance: 64,           // clamp de radiancia final

        // Rayos
        rayBias: 'auto',           // 'auto' o número (unidades de mundo)

        // Luces
        onlyBakedLights: true,     // solo componentes light con bake=true
        sunAngularRadiusDeg: 0.5,  // penumbra de luces direccionales
        pointLightRadius: 0.0,     // radio de luces puntuales/spot (0 = duras)
        lightColorGamma: 2.2,      // color de luz sRGB -> lineal (0 = no convertir)

        // Ambiente: solo si scene.ambientBake === true (como el bake nativo)
        useSceneAmbient: true,
        ambientOverride: null,     // [r,g,b] lineal para forzar ambiente

        // Geometría
        includeOccludersOutsideBake: true, // meshes con castShadow fuera del bake
        materialGamma: 2.2,        // albedo sRGB -> lineal

        // Mapeo UV1 -> texel.
        // Derivado del muestreo: en cualquier backend el shader lee la fila
        // floor(v*height) con el mismo uv1, por lo tanto fila = v*height.
        // Si al verificar con debugView el resultado sale espejado en vertical,
        // ponerlo en true.
        flipV: false,
        gbufferDilate: 3,          // texels de dilatación del G-buffer

        // Pass: si la detección automática falla, forzar {color: indiceDePass}
        passOverride: null,

        // Encoding para RGBA8 que no es RGBM: 'auto'|'gamma'|'srgb'|'linear'|'rgbm'
        ldrEncoding: 'auto',

        // 'off' | 'coverage' | 'worldPos' | 'normal' | 'direct' | 'indirect'
        debugView: 'off',

        verbose: true,
        logCoverageAscii: false
    };


    const DEBUG_MODES = {
        off: 0, coverage: 1, worldPos: 2, normal: 3, direct: 4, indirect: 5
    };

    // =========================================================================
    // 3. CONSTANTES WebGPU
    // =========================================================================

    const GPUBufferUsageRef = global.GPUBufferUsage || {
        MAP_READ: 0x0001, MAP_WRITE: 0x0002, COPY_SRC: 0x0004, COPY_DST: 0x0008,
        INDEX: 0x0010, VERTEX: 0x0020, UNIFORM: 0x0040, STORAGE: 0x0080
    };
    const GPUShaderStageRef = global.GPUShaderStage || { COMPUTE: 0x4 };
    const GPUMapModeRef = global.GPUMapMode || { READ: 0x0001, WRITE: 0x0002 };

    const DEVICE_STATE_CACHE = new WeakMap();

    // =========================================================================
    // 4. WGSL PATH TRACER (geometría real, sin escena ficticia)
    // =========================================================================
    //
    //  binding 0 : uniform Params (80 bytes)
    //  binding 1 : G-buffer posición mundial  (vec4: xyz, w = 0 vacío / 1 válido / 2 dilatado)
    //  binding 2 : G-buffer normal mundial    (vec4: xyz, 0)
    //  binding 3 : triángulos (5 x vec4 = 80 bytes): v0, e1, e2, albedo(w=castShadow), emission
    //  binding 4 : luces      (4 x vec4 = 64 bytes)
    //  binding 5 : salida lineal (vec4 por texel, se acumula entre dispatches)
    // =========================================================================

    const pathTraceShader = /* wgsl */ `
struct Params {
    width : u32,
    height : u32,
    triCount : u32,
    lightCount : u32,

    sampleOffset : u32,
    sampleCount : u32,
    totalSamples : u32,
    maxBounces : u32,

    seed : u32,
    debugMode : u32,
    padA : u32,
    padB : u32,

    ambient : vec4f,

    rayBias : f32,
    maxRadiance : f32,
    padC : f32,
    padD : f32
};

struct Tri {
    v0 : vec4f,
    e1 : vec4f,
    e2 : vec4f,
    albedo : vec4f,
    emission : vec4f
};

struct Light {
    posType : vec4f,   // xyz: dirección HACIA la luz (dir) o posición; w: tipo 0 dir / 1 punto / 2 spot
    color : vec4f,     // rgb lineal * intensidad; w: rango
    axis : vec4f,      // xyz: dirección de propagación del spot; w: falloff (0 lineal / 1 inv. cuadrado)
    cone : vec4f       // x: cosInner, y: cosOuter, z: radio (angular para dir / mundo para punto)
};

struct Hit {
    t : f32,
    index : i32
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read> gPos : array<vec4f>;
@group(0) @binding(2) var<storage, read> gNrm : array<vec4f>;
@group(0) @binding(3) var<storage, read> tris : array<Tri>;
@group(0) @binding(4) var<storage, read> lights : array<Light>;
@group(0) @binding(5) var<storage, read_write> outPixels : array<vec4f>;

var<private> rngState : u32;

fn pcgHash(v : u32) -> u32 {
    let state = v * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn rand() -> f32 {
    rngState = pcgHash(rngState);
    return min(f32(rngState) * (1.0 / 4294967296.0), 0.99999994);
}

// Base ortonormal (Duff et al. 2017). Columnas: tangente, bitangente, normal.
fn makeBasis(n : vec3f) -> mat3x3f {
    let s = select(-1.0, 1.0, n.z >= 0.0);
    let a = -1.0 / (s + n.z);
    let b = n.x * n.y * a;
    let t = vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x);
    let bt = vec3f(b, s + n.y * n.y * a, -n.y);
    return mat3x3f(t, bt, n);
}

fn cosineSample(n : vec3f) -> vec3f {
    let r1 = rand();
    let r2 = rand();
    let phi = 6.28318530718 * r1;
    let rr = sqrt(r2);
    let local = vec3f(rr * cos(phi), rr * sin(phi), sqrt(max(0.0, 1.0 - r2)));
    return normalize(makeBasis(n) * local);
}

fn randomOnSphere() -> vec3f {
    let z = 1.0 - 2.0 * rand();
    let r = sqrt(max(0.0, 1.0 - z * z));
    let phi = 6.28318530718 * rand();
    return vec3f(r * cos(phi), r * sin(phi), z);
}

fn jitterDirection(dir : vec3f, radius : f32) -> vec3f {
    if (radius <= 0.0) {
        return dir;
    }
    let m = makeBasis(dir);
    let r = radius * sqrt(rand());
    let phi = 6.28318530718 * rand();
    return normalize(dir + (m[0] * cos(phi) + m[1] * sin(phi)) * r);
}

// Moller-Trumbore, doble cara. Devuelve distancia o -1.
fn intersectTri(ro : vec3f, rd : vec3f, tri : Tri, tMax : f32) -> f32 {
    let p = cross(rd, tri.e2.xyz);
    let det = dot(tri.e1.xyz, p);
    if (abs(det) < 1.0e-12) {
        return -1.0;
    }
    let inv = 1.0 / det;
    let s = ro - tri.v0.xyz;
    let u = dot(s, p) * inv;
    if (u < 0.0 || u > 1.0) {
        return -1.0;
    }
    let q = cross(s, tri.e1.xyz);
    let v = dot(rd, q) * inv;
    if (v < 0.0 || (u + v) > 1.0) {
        return -1.0;
    }
    let d = dot(tri.e2.xyz, q) * inv;
    if (d > 1.0e-5 && d < tMax) {
        return d;
    }
    return -1.0;
}

fn traceClosest(ro : vec3f, rd : vec3f) -> Hit {
    var best = Hit(1.0e30, -1);
    for (var i = 0u; i < params.triCount; i = i + 1u) {
        let d = intersectTri(ro, rd, tris[i], best.t);
        if (d > 0.0) {
            best = Hit(d, i32(i));
        }
    }
    return best;
}

// Any-hit para sombras: solo triángulos con castShadow (albedo.w >= 0.5).
fn occluded(ro : vec3f, rd : vec3f, tMax : f32) -> bool {
    for (var i = 0u; i < params.triCount; i = i + 1u) {
        let tri = tris[i];
        if (tri.albedo.w < 0.5) {
            continue;
        }
        if (intersectTri(ro, rd, tri, tMax) > 0.0) {
            return true;
        }
    }
    return false;
}

// Iluminación directa (NEE) con sombras trazadas contra la geometría real.
fn directLight(p : vec3f, n : vec3f) -> vec3f {
    var sum = vec3f(0.0);

    for (var i = 0u; i < params.lightCount; i = i + 1u) {
        let lt = lights[i];
        let kind = u32(lt.posType.w + 0.5);

        var L = vec3f(0.0, 1.0, 0.0);
        var dist = 1.0e30;
        var atten = 1.0;

        if (kind == 0u) {
            L = jitterDirection(lt.posType.xyz, lt.cone.z);
        } else {
            var lp = lt.posType.xyz;
            if (lt.cone.z > 0.0) {
                lp = lp + randomOnSphere() * lt.cone.z;
            }
            let d = lp - p;
            dist = length(d);
            if (dist < 1.0e-5) {
                continue;
            }
            L = d / dist;

            let range = max(lt.color.w, 1.0e-4);
            if (dist >= range) {
                continue;
            }

            if (u32(lt.axis.w + 0.5) == 0u) {
                atten = max((range - dist) / range, 0.0);
            } else {
                let r = dist / range;
                let f = clamp(1.0 - r * r * r * r, 0.0, 1.0);
                atten = (1.0 / (dist * dist + 1.0)) * f * f;
            }

            if (kind == 2u) {
                let cosA = dot(lt.axis.xyz, -L);
                atten = atten * smoothstep(lt.cone.y, lt.cone.x, cosA);
            }
        }

        let ndl = dot(n, L);
        if (ndl <= 0.0 || atten <= 0.0) {
            continue;
        }

        let origin = p + n * params.rayBias;
        var tMax = 1.0e30;
        if (kind != 0u) {
            tMax = dist - params.rayBias;
        }
        if (occluded(origin, L, tMax)) {
            continue;
        }

        sum = sum + lt.color.xyz * (ndl * atten);
    }

    return sum;
}

// Estimador de E(P) = (1/PI) * integral(Lin * cos) (convención PlayCanvas).
fn shade(p : vec3f, n : vec3f, incDirect : bool, incIndirect : bool) -> vec3f {
    var e = vec3f(0.0);

    if (incDirect) {
        e = e + directLight(p, n);
    }
    if (!incIndirect) {
        return e;
    }

    var throughput = vec3f(1.0);
    var origin = p + n * params.rayBias;
    var nrm = n;

    for (var b = 0u; b < params.maxBounces; b = b + 1u) {
        let d = cosineSample(nrm);
        let h = traceClosest(origin, d);

        if (h.index < 0) {
            // Escapó: ambiente (solo si scene.ambientBake).
            e = e + throughput * params.ambient.xyz;
            break;
        }

        let tri = tris[u32(h.index)];
        var hn = normalize(cross(tri.e1.xyz, tri.e2.xyz));
        if (dot(hn, d) > 0.0) {
            hn = -hn;
        }
        let hp = origin + d * h.t;

        e = e + throughput * tri.emission.xyz;
        throughput = throughput * tri.albedo.xyz;
        e = e + throughput * directLight(hp, hn);

        origin = hp + hn * params.rayBias;
        nrm = hn;
    }

    return e;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
    if (gid.x >= params.width || gid.y >= params.height) {
        return;
    }

    let idx = gid.y * params.width + gid.x;
    let pos = gPos[idx];

    // Texel sin superficie: queda en 0.
    if (pos.w < 0.5) {
        return;
    }

    let nrm = normalize(gNrm[idx].xyz);

    // Vistas de depuración del mapeo UV1 -> superficie.
    if (params.debugMode >= 1u && params.debugMode <= 3u) {
        if (params.sampleOffset != 0u) {
            return;
        }
        var c = vec3f(1.0);
        if (params.debugMode == 1u) {
            c = vec3f(select(1.0, 0.25, pos.w > 1.5));
        } else if (params.debugMode == 2u) {
            c = fract(pos.xyz);
        } else {
            c = nrm * 0.5 + vec3f(0.5);
        }
        outPixels[idx] = vec4f(c, 1.0);
        return;
    }

    let incDirect = params.debugMode != 5u;
    let incIndirect = params.debugMode != 4u;

    var sum = vec3f(0.0);
    for (var s = 0u; s < params.sampleCount; s = s + 1u) {
        rngState = pcgHash(pcgHash(idx * 9781u + (params.sampleOffset + s) * 6271u + params.seed * 26699u + 1u));
        sum = sum + shade(pos.xyz, nrm, incDirect, incIndirect);
    }

    let c = sum / f32(params.totalSamples);
    let a = select(0.0, 1.0, params.sampleOffset == 0u);
    outPixels[idx] = outPixels[idx] + vec4f(c, a);
}
`;

    // =========================================================================
    // 5. UTILIDADES
    // =========================================================================

    function log() {
        if (CONFIG.verbose) console.log.apply(console, arguments);
    }
    function warn() {
        console.warn.apply(console, arguments);
    }
    function error() {
        console.error.apply(console, arguments);
    }
    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }
    function isNum(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }
    function toLinear(c, gamma) {
        return gamma > 0 ? Math.pow(Math.max(0, c), gamma) : c;
    }
    function fmt(a, d) {
        d = d === undefined ? 3 : d;
        return '[' + Array.prototype.map.call(a, function (x) {
            return Number(x).toFixed(d);
        }).join(', ') + ']';
    }

    // =========================================================================
    // 6. GPUDevice NATIVO
    // =========================================================================

    function getNativeGPUDevice(graphicsDevice) {
        if (!graphicsDevice) return null;

        const candidates = [
            graphicsDevice.wgpu,
            graphicsDevice._wgpu,
            graphicsDevice.impl && graphicsDevice.impl.wgpu,
            graphicsDevice.impl && graphicsDevice.impl._wgpu,
            graphicsDevice.device,
            graphicsDevice._device,
            graphicsDevice.impl && graphicsDevice.impl.device,
            graphicsDevice.impl && graphicsDevice.impl._device
        ];

        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (c &&
                typeof c.createCommandEncoder === 'function' &&
                typeof c.createShaderModule === 'function' &&
                typeof c.createBuffer === 'function') {
                return c;
            }
        }
        return null;
    }

    function isWebGPUDevice(graphicsDevice) {
        if (!graphicsDevice) return false;
        if (graphicsDevice.isWebGPU === true) return true;
        if (graphicsDevice.deviceType === 'webgpu') return true;
        return !!(graphicsDevice.supportsCompute && getNativeGPUDevice(graphicsDevice));
    }

    // =========================================================================
    // 7. GEOMETRÍA REAL: MeshInstance -> triángulos mundiales
    // =========================================================================
    //
    // Solo se usa API pública de PlayCanvas:
    //   mesh.getPositions(out) / getNormals(out) / getUvs(1, out) / getIndices(out)
    //   mesh.primitive[0] {type, base, count, indexed}
    //   meshInstance.node.getWorldTransform().data   (Float32Array 16, col-major)
    //   meshInstance.material.diffuse / emissive
    //
    // =========================================================================

    function normalMatrixFromWorld(m) {
        // A = [[m0 m4 m8],[m1 m5 m9],[m2 m6 m10]]  (columnas de m = ejes)
        const a = m[0], b = m[4], c = m[8];
        const d = m[1], e = m[5], f = m[9];
        const g = m[2], h = m[6], i = m[10];

        // matriz de cofactores
        const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
        const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
        const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;

        let det = a * A + b * B + c * C;
        if (Math.abs(det) < 1e-20) det = 1;

        // (A^-1)^T = cof / det
        return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
    }

    function buildGeometry(mi) {
        const geom = {
            mi: mi,
            ok: false,
            reason: '',
            name: '',
            vertexCount: 0,
            triCount: 0,
            worldPos: null,
            worldNrm: null,
            uv1: null,
            indices: null,
            albedo: [0.8, 0.8, 0.8],
            emission: [0, 0, 0],
            castShadow: false,
            hasUv1: false,
            hasNormals: false,
            primitive: null
        };

        try {
            geom.name = (mi.node && mi.node.name) || '(sin nombre)';
            const mesh = mi.mesh;

            if (!mesh || !mi.node) {
                geom.reason = 'MeshInstance sin mesh o node';
                return geom;
            }
            if (mi.skinInstance) {
                geom.reason = 'malla con skin: no soportada en esta etapa';
                return geom;
            }

            // ---- streams ----
            const posArr = [];
            let nv = mesh.getPositions(posArr);
            if (!nv) nv = Math.floor(posArr.length / 3);
            if (!nv || posArr.length < nv * 3) {
                geom.reason = 'mesh.getPositions() no devolvió datos';
                return geom;
            }

            const nrmArr = [];
            let nn = 0;
            try { nn = mesh.getNormals(nrmArr) || 0; } catch (_) { nn = 0; }
            if (nrmArr.length < nv * 3) nn = 0;

            const uvArr = [];
            let nu = 0;
            try { nu = mesh.getUvs(1, uvArr) || 0; } catch (_) { nu = 0; }
            if (uvArr.length < nv * 2) nu = 0;

            const idxArr = [];
            let ni = 0;
            try { ni = mesh.getIndices(idxArr) || 0; } catch (_) { ni = 0; }
            if (!ni) ni = idxArr.length;

            // ---- primitiva ----
            const prim = (mesh.primitive && mesh.primitive[0]) || null;
            geom.primitive = prim ? {
                type: prim.type, base: prim.base, count: prim.count,
                indexed: prim.indexed, baseVertex: prim.baseVertex
            } : null;

            if (prim && isNum(prim.type) && isNum(pc.PRIMITIVE_TRIANGLES) &&
                prim.type !== pc.PRIMITIVE_TRIANGLES) {
                geom.reason = 'primitiva no es TRIANGLES (type=' + prim.type + ')';
                return geom;
            }

            const indexed = prim ? (prim.indexed !== false && ni > 0) : ni > 0;
            const base = prim ? (prim.base | 0) : 0;
            const baseVertex = prim ? (prim.baseVertex | 0) : 0;
            const count = prim ? (prim.count | 0) : (indexed ? ni : nv);

            const tri = [];
            for (let i = 0; i + 2 < count; i += 3) {
                let a, b, c;
                if (indexed) {
                    a = idxArr[base + i] + baseVertex;
                    b = idxArr[base + i + 1] + baseVertex;
                    c = idxArr[base + i + 2] + baseVertex;
                } else {
                    a = base + i; b = base + i + 1; c = base + i + 2;
                }
                if (!(a >= 0 && b >= 0 && c >= 0 && a < nv && b < nv && c < nv)) continue;
                tri.push(a, b, c);
            }
            if (!tri.length) {
                geom.reason = 'sin triángulos válidos';
                return geom;
            }

            // ---- transformación local -> mundo ----
            const m = mi.node.getWorldTransform().data;
            const nm = normalMatrixFromWorld(m);

            const wp = new Float32Array(nv * 3);
            for (let v = 0; v < nv; v++) {
                const x = posArr[v * 3], y = posArr[v * 3 + 1], z = posArr[v * 3 + 2];
                wp[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
                wp[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
                wp[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
            }

            const wn = new Float32Array(nv * 3);
            if (nn) {
                for (let v = 0; v < nv; v++) {
                    const x = nrmArr[v * 3], y = nrmArr[v * 3 + 1], z = nrmArr[v * 3 + 2];
                    let nx = nm[0] * x + nm[1] * y + nm[2] * z;
                    let ny = nm[3] * x + nm[4] * y + nm[5] * z;
                    let nz = nm[6] * x + nm[7] * y + nm[8] * z;
                    const l = Math.hypot(nx, ny, nz) || 1;
                    wn[v * 3] = nx / l; wn[v * 3 + 1] = ny / l; wn[v * 3 + 2] = nz / l;
                }
            } else {
                // Sin normales: acumular normales de cara por vértice.
                for (let t = 0; t < tri.length; t += 3) {
                    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
                    const e1x = wp[b * 3] - wp[a * 3], e1y = wp[b * 3 + 1] - wp[a * 3 + 1], e1z = wp[b * 3 + 2] - wp[a * 3 + 2];
                    const e2x = wp[c * 3] - wp[a * 3], e2y = wp[c * 3 + 1] - wp[a * 3 + 1], e2z = wp[c * 3 + 2] - wp[a * 3 + 2];
                    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
                    [a, b, c].forEach(function (vi) {
                        wn[vi * 3] += fx; wn[vi * 3 + 1] += fy; wn[vi * 3 + 2] += fz;
                    });
                }
                for (let v = 0; v < nv; v++) {
                    const l = Math.hypot(wn[v * 3], wn[v * 3 + 1], wn[v * 3 + 2]) || 1;
                    wn[v * 3] /= l; wn[v * 3 + 1] /= l; wn[v * 3 + 2] /= l;
                }
            }

            let uv1 = null;
            if (nu) {
                uv1 = new Float32Array(nv * 2);
                for (let i = 0; i < nv * 2; i++) uv1[i] = uvArr[i];
            }

            // ---- material ----
            const mat = mi.material;
            if (mat) {
                const g = CONFIG.materialGamma;
                if (mat.diffuse && isNum(mat.diffuse.r)) {
                    geom.albedo = [
                        toLinear(mat.diffuse.r, g),
                        toLinear(mat.diffuse.g, g),
                        toLinear(mat.diffuse.b, g)
                    ];
                }
                if (mat.useMetalness && isNum(mat.metalness)) {
                    const k = 1 - clamp(mat.metalness, 0, 1);
                    geom.albedo = geom.albedo.map(function (x) { return x * k; });
                }
                if (mat.emissive && isNum(mat.emissive.r)) {
                    const k = isNum(mat.emissiveIntensity) ? mat.emissiveIntensity : 1;
                    geom.emission = [
                        toLinear(mat.emissive.r, g) * k,
                        toLinear(mat.emissive.g, g) * k,
                        toLinear(mat.emissive.b, g) * k
                    ];
                }
            }

            geom.castShadow = !!mi.castShadow;
            geom.vertexCount = nv;
            geom.triCount = tri.length / 3;
            geom.worldPos = wp;
            geom.worldNrm = wn;
            geom.uv1 = uv1;
            geom.indices = new Uint32Array(tri);
            geom.hasUv1 = !!uv1;
            geom.hasNormals = !!nn;
            geom.ok = true;
            return geom;

        } catch (err) {
            geom.reason = 'excepción: ' + (err && err.message);
            return geom;
        }
    }

    function getSceneRoot(lightmapper) {
        if (lightmapper && lightmapper.root && typeof lightmapper.root.findComponents === 'function') {
            return { root: lightmapper.root, source: 'lightmapper.root' };
        }
        try {
            const app = (pc.Application && typeof pc.Application.getApplication === 'function') ?
                pc.Application.getApplication() : null;
            if (app && app.root) return { root: app.root, source: 'Application.getApplication().root' };
        } catch (_) { /* nada */ }
        return { root: null, source: 'none' };
    }

    function collectSceneGeometry(lightmapper, bakeNodes) {
        const cache = new Map();
        const geoms = [];

        function add(mi) {
            if (!mi || cache.has(mi)) return cache.get(mi) || null;
            const g = buildGeometry(mi);
            cache.set(mi, g);
            if (g.ok) geoms.push(g);
            else warn('[bakePathTracing.js] MeshInstance "' + g.name + '" descartado: ' + g.reason);
            return g;
        }

        // 1) Receptores: meshInstances de los bakeNodes.
        for (let n = 0; n < bakeNodes.length; n++) {
            const mis = bakeNodes[n] && bakeNodes[n].meshInstances;
            if (mis) for (let i = 0; i < mis.length; i++) add(mis[i]);
        }

        // 2) Oclusores adicionales de la escena (castShadow).
        let rootInfo = { root: null, source: 'none' };
        if (CONFIG.includeOccludersOutsideBake) {
            rootInfo = getSceneRoot(lightmapper);
            if (rootInfo.root) {
                ['render', 'model'].forEach(function (type) {
                    let comps = [];
                    try { comps = rootInfo.root.findComponents(type) || []; } catch (_) { comps = []; }
                    comps.forEach(function (comp) {
                        try {
                            if (!comp.enabled || !comp.entity || !comp.entity.enabled) return;
                            const mis = comp.meshInstances || [];
                            for (let i = 0; i < mis.length; i++) {
                                if (mis[i] && mis[i].castShadow && mis[i].visible !== false) add(mis[i]);
                            }
                        } catch (_) { /* nada */ }
                    });
                });
            }
        }

        // Empaquetado de triángulos.
        let totalTris = 0;
        for (let i = 0; i < geoms.length; i++) totalTris += geoms[i].triCount;

        const STRIDE = 20;
        const tris = new Float32Array(Math.max(1, totalTris) * STRIDE);
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        let o = 0;
        let written = 0;

        for (let gi = 0; gi < geoms.length; gi++) {
            const g = geoms[gi];
            const p = g.worldPos;
            for (let v = 0; v < g.vertexCount; v++) {
                for (let k = 0; k < 3; k++) {
                    min[k] = Math.min(min[k], p[v * 3 + k]);
                    max[k] = Math.max(max[k], p[v * 3 + k]);
                }
            }
            for (let t = 0; t < g.triCount; t++) {
                const a = g.indices[t * 3], b = g.indices[t * 3 + 1], c = g.indices[t * 3 + 2];
                const e1x = p[b * 3] - p[a * 3], e1y = p[b * 3 + 1] - p[a * 3 + 1], e1z = p[b * 3 + 2] - p[a * 3 + 2];
                const e2x = p[c * 3] - p[a * 3], e2y = p[c * 3 + 1] - p[a * 3 + 1], e2z = p[c * 3 + 2] - p[a * 3 + 2];
                const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
                if (Math.hypot(cx, cy, cz) < 1e-12) continue; // degenerado

                tris[o++] = p[a * 3]; tris[o++] = p[a * 3 + 1]; tris[o++] = p[a * 3 + 2]; tris[o++] = 0;
                tris[o++] = e1x; tris[o++] = e1y; tris[o++] = e1z; tris[o++] = 0;
                tris[o++] = e2x; tris[o++] = e2y; tris[o++] = e2z; tris[o++] = 0;
                tris[o++] = g.albedo[0]; tris[o++] = g.albedo[1]; tris[o++] = g.albedo[2];
                tris[o++] = g.castShadow ? 1 : 0;
                tris[o++] = g.emission[0]; tris[o++] = g.emission[1]; tris[o++] = g.emission[2]; tris[o++] = 0;
                written++;
            }
        }

        const extent = written ?
            Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) : 1;

        return {
            cache: cache,
            geoms: geoms,
            tris: tris,
            triCount: written,
            boundsMin: min,
            boundsMax: max,
            extent: extent,
            root: rootInfo
        };
    }

    // =========================================================================
    // 8. LUCES REALES
    // =========================================================================

    function collectLights(lightmapper) {
        const rootInfo = getSceneRoot(lightmapper);
        const out = [];
        const report = [];

        if (!rootInfo.root) {
            warn('[bakePathTracing.js] No se pudo obtener la raíz de la escena para buscar luces.');
            return { data: new Float32Array(16), count: 0, report: report };
        }

        let comps = [];
        try { comps = rootInfo.root.findComponents('light') || []; } catch (_) { comps = []; }

        const g = CONFIG.lightColorGamma;
        const sunRad = CONFIG.sunAngularRadiusDeg * Math.PI / 180;

        comps.forEach(function (comp) {
            try {
                if (!comp.enabled || !comp.entity || !comp.entity.enabled) return;
                if (CONFIG.onlyBakedLights && !comp.bake) return;

                const m = comp.entity.getWorldTransform().data;
                const yx = m[4], yy = m[5], yz = m[6];
                const yl = Math.hypot(yx, yy, yz) || 1;
                const ax = yx / yl, ay = yy / yl, az = yz / yl; // eje +Y mundial

                const col = comp.color;
                const inten = isNum(comp.intensity) ? comp.intensity : 1;
                const cr = toLinear(col.r, g) * inten;
                const cg = toLinear(col.g, g) * inten;
                const cb = toLinear(col.b, g) * inten;

                let type = comp.type;
                if (type === 'omni') type = 'point';

                const L = new Float32Array(16);
                let kind;
                if (type === 'directional') {
                    kind = 0;
                    // La luz direccional ilumina hacia -Y local: dirección HACIA la luz = +Y.
                    L[0] = ax; L[1] = ay; L[2] = az; L[3] = 0;
                    L[8] = -ax; L[9] = -ay; L[10] = -az; L[11] = 0;
                    L[14] = sunRad;
                    L[12] = 1; L[13] = 0;
                } else if (type === 'point' || type === 'spot') {
                    kind = type === 'spot' ? 2 : 1;
                    L[0] = m[12]; L[1] = m[13]; L[2] = m[14]; L[3] = kind;
                    L[8] = -ax; L[9] = -ay; L[10] = -az;
                    L[11] = comp.falloffMode === pc.LIGHTFALLOFF_INVERSESQUARED ? 1 : 0;
                    L[14] = CONFIG.pointLightRadius;
                    if (kind === 2) {
                        const inner = clamp(isNum(comp.innerConeAngle) ? comp.innerConeAngle : 40, 0, 89.9);
                        const outer = clamp(isNum(comp.outerConeAngle) ? comp.outerConeAngle : 45, 0, 89.9);
                        const co = Math.cos(outer * Math.PI / 180);
                        let ci = Math.cos(Math.min(inner, outer) * Math.PI / 180);
                        if (ci <= co) ci = co + 1e-4;
                        L[12] = ci; L[13] = co;
                    }
                } else {
                    return;
                }

                L[3] = kind;
                L[4] = cr; L[5] = cg; L[6] = cb;
                L[7] = isNum(comp.range) && comp.range > 0 ? comp.range : 10;

                for (let i = 0; i < 16; i++) out.push(L[i]);

                report.push({
                    entity: comp.entity.name,
                    type: type,
                    color: [cr, cg, cb],
                    range: L[7],
                    position: [m[12], m[13], m[14]],
                    dirToLight: kind === 0 ? [ax, ay, az] : null
                });
            } catch (err) {
                warn('[bakePathTracing.js] Luz descartada:', err && err.message);
            }
        });

        const data = new Float32Array(Math.max(16, out.length));
        data.set(out);
        return { data: data, count: out.length / 16, report: report };
    }

    function collectAmbient(lightmapper) {
        if (CONFIG.ambientOverride) {
            return { rgb: CONFIG.ambientOverride.slice(0, 3), source: 'CONFIG.ambientOverride' };
        }
        const scene = lightmapper && lightmapper.scene;
        if (CONFIG.useSceneAmbient && scene && scene.ambientBake === true && scene.ambientLight) {
            const a = scene.ambientLight;
            const g = CONFIG.lightColorGamma;
            return {
                rgb: [toLinear(a.r, g), toLinear(a.g, g), toLinear(a.b, g)],
                source: 'scene.ambientLight (ambientBake=true)'
            };
        }
        return { rgb: [0, 0, 0], source: 'desactivado (scene.ambientBake != true)' };
    }

    // =========================================================================
    // 9. IDENTIFICAR LA TEXTURA FINAL DE COLOR
    // =========================================================================
    //
    // Los nombres de textura NO son fiables (PlayCanvas intercambia RTs
    // temporales/finales durante el postproceso). La fuente de verdad es lo que
    // el material realmente muestrea: el parámetro 'texture_lightMap' del
    // MeshInstance (BAKE_COLOR) y 'texture_dirLightMap' (BAKE_COLORDIR).
    //
    // =========================================================================

    function readMeshInstanceParam(mi, name) {
        try {
            let p = null;
            if (typeof mi.getParameter === 'function') p = mi.getParameter(name);
            if (!p && mi.parameters) p = mi.parameters[name];
            if (!p) return null;
            const t = p.data !== undefined ? p.data : p;
            return (t && isNum(t.width) && isNum(t.height)) ? t : null;
        } catch (_) {
            return null;
        }
    }

    function resolveBakeNodeTextures(bakeNode, nodeIndex) {
        const paramNames = (pc.MeshInstance && pc.MeshInstance.lightmapParamNames) ||
            ['texture_lightMap', 'texture_dirLightMap'];

        const result = {
            color: null,
            dir: null,
            source: '',
            rtTable: []
        };

        const rts = bakeNode.renderTargets || [];
        for (let i = 0; i < rts.length; i++) {
            const t = rts[i] && rts[i].colorBuffer;
            result.rtTable.push({
                pass: i,
                name: t ? t.name : null,
                size: t ? t.width + 'x' + t.height : null,
                format: t ? t.format : null,
                type: t ? t.type : null
            });
        }

        const mis = bakeNode.meshInstances || [];
        for (let i = 0; i < mis.length && (!result.color); i++) {
            const c = readMeshInstanceParam(mis[i], paramNames[0]);
            const d = readMeshInstanceParam(mis[i], paramNames[1]);
            if (c) { result.color = c; result.source = 'MeshInstance.' + paramNames[0]; }
            if (d) result.dir = d;
        }

        // Override manual.
        if (CONFIG.passOverride && isNum(CONFIG.passOverride.color) &&
            rts[CONFIG.passOverride.color] && rts[CONFIG.passOverride.color].colorBuffer) {
            result.color = rts[CONFIG.passOverride.color].colorBuffer;
            result.source = 'CONFIG.passOverride.color=' + CONFIG.passOverride.color;
        }

        result.colorPassIndex = -1;
        result.dirPassIndex = -1;
        for (let i = 0; i < rts.length; i++) {
            const t = rts[i] && rts[i].colorBuffer;
            if (t && t === result.color) result.colorPassIndex = i;
            if (t && t === result.dir) result.dirPassIndex = i;
        }

        return result;
    }

    // =========================================================================
    // 10. G-BUFFER: texel UV1 -> triángulo -> posición/normal mundial (CPU)
    // =========================================================================

    function uvToRow(v) {
        return CONFIG.flipV ? 1 - v : v;
    }

    function buildGBuffer(geoms, w, h) {
        const pos = new Float32Array(w * h * 4);
        const nrm = new Float32Array(w * h * 4);
        let valid = 0;
        let trisRasterized = 0;
        let trisWithoutUv = 0;

        for (let gi = 0; gi < geoms.length; gi++) {
            const g = geoms[gi];
            if (!g.ok || !g.uv1) { trisWithoutUv += g.triCount || 0; continue; }

            const uv = g.uv1;
            const P = g.worldPos;
            const N = g.worldNrm;

            for (let t = 0; t < g.triCount; t++) {
                const i0 = g.indices[t * 3], i1 = g.indices[t * 3 + 1], i2 = g.indices[t * 3 + 2];

                const x0 = uv[i0 * 2] * w, y0 = uvToRow(uv[i0 * 2 + 1]) * h;
                const x1 = uv[i1 * 2] * w, y1 = uvToRow(uv[i1 * 2 + 1]) * h;
                const x2 = uv[i2 * 2] * w, y2 = uvToRow(uv[i2 * 2 + 1]) * h;

                const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
                if (Math.abs(denom) < 1e-12) continue;

                const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
                const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
                const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
                const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));

                // normal geométrica de respaldo
                const e1x = P[i1 * 3] - P[i0 * 3], e1y = P[i1 * 3 + 1] - P[i0 * 3 + 1], e1z = P[i1 * 3 + 2] - P[i0 * 3 + 2];
                const e2x = P[i2 * 3] - P[i0 * 3], e2y = P[i2 * 3 + 1] - P[i0 * 3 + 1], e2z = P[i2 * 3 + 2] - P[i0 * 3 + 2];
                let fnx = e1y * e2z - e1z * e2y, fny = e1z * e2x - e1x * e2z, fnz = e1x * e2y - e1y * e2x;
                const fl = Math.hypot(fnx, fny, fnz) || 1;
                fnx /= fl; fny /= fl; fnz /= fl;

                trisRasterized++;

                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        const px = x + 0.5, py = y + 0.5;
                        const l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom;
                        const l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom;
                        const l2 = 1 - l0 - l1;
                        const eps = -1e-4;
                        if (l0 < eps || l1 < eps || l2 < eps) continue;

                        const idx = (y * w + x) * 4;
                        if (pos[idx + 3] === 0) valid++;

                        pos[idx] = l0 * P[i0 * 3] + l1 * P[i1 * 3] + l2 * P[i2 * 3];
                        pos[idx + 1] = l0 * P[i0 * 3 + 1] + l1 * P[i1 * 3 + 1] + l2 * P[i2 * 3 + 1];
                        pos[idx + 2] = l0 * P[i0 * 3 + 2] + l1 * P[i1 * 3 + 2] + l2 * P[i2 * 3 + 2];
                        pos[idx + 3] = 1;

                        let nx = l0 * N[i0 * 3] + l1 * N[i1 * 3] + l2 * N[i2 * 3];
                        let ny = l0 * N[i0 * 3 + 1] + l1 * N[i1 * 3 + 1] + l2 * N[i2 * 3 + 1];
                        let nz = l0 * N[i0 * 3 + 2] + l1 * N[i1 * 3 + 2] + l2 * N[i2 * 3 + 2];
                        let nl = Math.hypot(nx, ny, nz);
                        if (nl < 1e-6) { nx = fnx; ny = fny; nz = fnz; nl = 1; }
                        nrm[idx] = nx / nl; nrm[idx + 1] = ny / nl; nrm[idx + 2] = nz / nl;
                        nrm[idx + 3] = 0;
                    }
                }
            }
        }

        return { pos: pos, nrm: nrm, w: w, h: h, valid: valid, trisRasterized: trisRasterized, trisWithoutUv: trisWithoutUv };
    }

    function dilateGBuffer(gb, iterations) {
        const w = gb.w, h = gb.h;
        const nbrs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

        for (let it = 0; it < iterations; it++) {
            const validMask = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) validMask[i] = gb.pos[i * 4 + 3] > 0.5 ? 1 : 0;

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    if (validMask[i]) continue;
                    for (let k = 0; k < nbrs.length; k++) {
                        const sx = x + nbrs[k][0], sy = y + nbrs[k][1];
                        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
                        const s = sy * w + sx;
                        if (!validMask[s]) continue;
                        gb.pos[i * 4] = gb.pos[s * 4];
                        gb.pos[i * 4 + 1] = gb.pos[s * 4 + 1];
                        gb.pos[i * 4 + 2] = gb.pos[s * 4 + 2];
                        gb.pos[i * 4 + 3] = 2;
                        gb.nrm[i * 4] = gb.nrm[s * 4];
                        gb.nrm[i * 4 + 1] = gb.nrm[s * 4 + 1];
                        gb.nrm[i * 4 + 2] = gb.nrm[s * 4 + 2];
                        break;
                    }
                }
            }
        }
    }

    function describeGBuffer(gb) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        let dilated = 0;
        for (let i = 0; i < gb.w * gb.h; i++) {
            const f = gb.pos[i * 4 + 3];
            if (f > 1.5) dilated++;
            if (f < 0.5 || f > 1.5) continue;
            for (let k = 0; k < 3; k++) {
                min[k] = Math.min(min[k], gb.pos[i * 4 + k]);
                max[k] = Math.max(max[k], gb.pos[i * 4 + k]);
            }
        }
        return {
            size: gb.w + 'x' + gb.h,
            validTexels: gb.valid,
            coveragePct: Number((100 * gb.valid / (gb.w * gb.h)).toFixed(1)),
            dilatedTexels: dilated,
            worldMin: min,
            worldMax: max,
            trisRasterized: gb.trisRasterized
        };
    }

    function asciiCoverage(gb) {
        const rows = [];
        for (let y = 0; y < gb.h; y++) {
            let s = '';
            for (let x = 0; x < gb.w; x++) {
                const f = gb.pos[(y * gb.w + x) * 4 + 3];
                s += f > 1.5 ? '+' : (f > 0.5 ? '#' : '.');
            }
            rows.push(s);
        }
        return rows.join('\n');
    }

    // =========================================================================
    // 11. ESTADO GPU
    // =========================================================================

    async function createDeviceState(graphicsDevice) {
        const gpu = getNativeGPUDevice(graphicsDevice);
        if (!gpu) throw new Error('No fue posible localizar el GPUDevice nativo de WebGPU.');

        gpu.pushErrorScope('validation');

        const C = GPUShaderStageRef.COMPUTE;
        const bindGroupLayout = gpu.createBindGroupLayout({
            label: 'BakePT-BGL',
            entries: [
                { binding: 0, visibility: C, buffer: { type: 'uniform' } },
                { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
                { binding: 3, visibility: C, buffer: { type: 'read-only-storage' } },
                { binding: 4, visibility: C, buffer: { type: 'read-only-storage' } },
                { binding: 5, visibility: C, buffer: { type: 'storage' } }
            ]
        });

        const shaderModule = gpu.createShaderModule({ label: 'BakePT-WGSL', code: pathTraceShader });

        if (typeof shaderModule.getCompilationInfo === 'function') {
            const info = await shaderModule.getCompilationInfo();
            let hasError = false;
            for (let i = 0; i < info.messages.length; i++) {
                const m = info.messages[i];
                (m.type === 'error' ? error : warn)(
                    '[bakePathTracing.js] WGSL ' + m.type + ' L' + m.lineNum + ':' + m.linePos + ' ' + m.message);
                if (m.type === 'error') hasError = true;
            }
            if (hasError) throw new Error('El shader WGSL no compiló (ver mensajes arriba).');
        }

        const pipelineLayout = gpu.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
        const computePipeline = gpu.createComputePipeline({
            label: 'BakePT-Pipeline',
            layout: pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'main' }
        });

        const scopeError = await gpu.popErrorScope();
        if (scopeError) throw new Error('Error de validación WebGPU: ' + scopeError.message);

        return { graphicsDevice: graphicsDevice, gpu: gpu, bindGroupLayout: bindGroupLayout, computePipeline: computePipeline };
    }

    function getDeviceState(graphicsDevice) {
        let p = DEVICE_STATE_CACHE.get(graphicsDevice);
        if (!p) {
            p = createDeviceState(graphicsDevice);
            DEVICE_STATE_CACHE.set(graphicsDevice, p);
            p.catch(function () { DEVICE_STATE_CACHE.delete(graphicsDevice); });
        }
        return p;
    }

    function makeStorageBuffer(gpu, typed, label) {
        const size = Math.max(16, Math.ceil(typed.byteLength / 16) * 16);
        const buf = gpu.createBuffer({
            label: label,
            size: size,
            usage: GPUBufferUsageRef.STORAGE | GPUBufferUsageRef.COPY_DST
        });
        gpu.queue.writeBuffer(buf, 0, typed.buffer, typed.byteOffset, typed.byteLength);
        return buf;
    }

    function makeParamsBuffer(gpu, p) {
        const ab = new ArrayBuffer(80);
        const u = new Uint32Array(ab);
        const f = new Float32Array(ab);
        u[0] = p.width; u[1] = p.height; u[2] = p.triCount; u[3] = p.lightCount;
        u[4] = p.sampleOffset; u[5] = p.sampleCount; u[6] = p.totalSamples; u[7] = p.maxBounces;
        u[8] = p.seed; u[9] = p.debugMode; u[10] = 0; u[11] = 0;
        f[12] = p.ambient[0]; f[13] = p.ambient[1]; f[14] = p.ambient[2]; f[15] = 1;
        f[16] = p.rayBias; f[17] = p.maxRadiance; f[18] = 0; f[19] = 0;

        const buf = gpu.createBuffer({
            label: 'BakePT-Params',
            size: 80,
            usage: GPUBufferUsageRef.UNIFORM | GPUBufferUsageRef.COPY_DST
        });
        gpu.queue.writeBuffer(buf, 0, ab);
        return buf;
    }

    // =========================================================================
    // 12. EJECUCIÓN GPU POR BAKE NODE
    // =========================================================================

    async function traceOnGPU(state, sceneBufs, gb, seed, sceneInfo) {
        const gpu = state.gpu;
        const w = gb.w, h = gb.h;
        const outSize = w * h * 16;

        const maxBind = gpu.limits && gpu.limits.maxStorageBufferBindingSize;
        if (maxBind && outSize > maxBind) {
            throw new Error('Lightmap ' + w + 'x' + h + ' excede maxStorageBufferBindingSize (' + maxBind + ').');
        }

        const posBuf = makeStorageBuffer(gpu, gb.pos, 'BakePT-GPos');
        const nrmBuf = makeStorageBuffer(gpu, gb.nrm, 'BakePT-GNrm');

        const outBuf = gpu.createBuffer({
            label: 'BakePT-Out',
            size: outSize,
            usage: GPUBufferUsageRef.STORAGE | GPUBufferUsageRef.COPY_SRC
        });
        const readBuf = gpu.createBuffer({
            label: 'BakePT-Readback',
            size: outSize,
            usage: GPUBufferUsageRef.COPY_DST | GPUBufferUsageRef.MAP_READ
        });

        const total = clamp(Math.floor(CONFIG.samplesPerTexel), 1, 65536);
        const per = clamp(Math.floor(CONFIG.samplesPerDispatch), 1, total);
        const debugMode = DEBUG_MODES[CONFIG.debugView] || 0;
        const tmp = [posBuf, nrmBuf, outBuf, readBuf];

        for (let offset = 0; offset < total; offset += per) {
            const count = Math.min(per, total - offset);

            const pb = makeParamsBuffer(gpu, {
                width: w, height: h,
                triCount: sceneInfo.triCount,
                lightCount: sceneInfo.lightCount,
                sampleOffset: offset, sampleCount: count, totalSamples: total,
                maxBounces: clamp(Math.floor(CONFIG.maxBounces), 0, 16),
                seed: seed >>> 0,
                debugMode: debugMode,
                ambient: sceneInfo.ambient,
                rayBias: sceneInfo.rayBias,
                maxRadiance: CONFIG.maxRadiance
            });
            tmp.push(pb);

            const bg = gpu.createBindGroup({
                layout: state.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: pb } },
                    { binding: 1, resource: { buffer: posBuf } },
                    { binding: 2, resource: { buffer: nrmBuf } },
                    { binding: 3, resource: { buffer: sceneBufs.tris } },
                    { binding: 4, resource: { buffer: sceneBufs.lights } },
                    { binding: 5, resource: { buffer: outBuf } }
                ]
            });

            const enc = gpu.createCommandEncoder({ label: 'BakePT-Enc' });
            const pass = enc.beginComputePass({ label: 'BakePT-Pass' });
            pass.setPipeline(state.computePipeline);
            pass.setBindGroup(0, bg);
            pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8), 1);
            pass.end();

            if (offset + count >= total) {
                enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, outSize);
            }
            gpu.queue.submit([enc.finish()]);

            if (typeof gpu.queue.onSubmittedWorkDone === 'function') {
                await gpu.queue.onSubmittedWorkDone();
            }
        }

        await readBuf.mapAsync(GPUMapModeRef.READ);
        const data = new Float32Array(readBuf.getMappedRange().slice(0));
        readBuf.unmap();

        tmp.forEach(function (b) { try { b.destroy(); } catch (_) { /* nada */ } });
        return data;
    }

    // =========================================================================
    // 13. ENCODING + ESCRITURA EN LA TEXTURA DE PLAYCANVAS
    // =========================================================================

    const _f32 = new Float32Array(1);
    const _u32 = new Uint32Array(_f32.buffer);

    function floatToHalf(value) {
        if (!(value > 0)) return 0;
        if (value >= 65504) return 0x7bff;
        _f32[0] = value;
        const x = _u32[0];
        const exp = ((x >>> 23) & 0xff) - 127 + 15;
        let mant = x & 0x7fffff;
        if (exp <= 0) {
            if (exp < -10) return 0;
            mant = (mant | 0x800000) >> (1 - exp);
            return (mant + 0x1000) >> 13;
        }
        const r = (exp << 10) + ((mant + 0x1000) >> 13);
        return r >= 0x7c00 ? 0x7bff : r;
    }

    function linearToSRGB(c) {
        c = clamp(c, 0, 1);
        return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    }

    // RGBM estándar de PlayCanvas: decode = (8 * a * rgb)^2
    function encodeRGBM(r, g, b, out) {
        let er = Math.sqrt(Math.max(0, r)) / 8;
        let eg = Math.sqrt(Math.max(0, g)) / 8;
        let eb = Math.sqrt(Math.max(0, b)) / 8;
        let a = clamp(Math.max(er, eg, eb, 1 / 255), 0, 1);
        a = Math.ceil(a * 255) / 255;
        out[0] = clamp(er / a, 0, 1);
        out[1] = clamp(eg / a, 0, 1);
        out[2] = clamp(eb / a, 0, 1);
        out[3] = a;
    }

    function resolveU8Encoding(texture) {
        if (CONFIG.ldrEncoding !== 'auto') return CONFIG.ldrEncoding;

        // PlayCanvas expone TEXTURETYPE_RGBM como string ("rgbm"), no como número.
        if (texture && texture.type === pc.TEXTURETYPE_RGBM) return 'rgbm';

        if (isNum(pc.PIXELFORMAT_SRGBA8) &&
            texture &&
            texture.format === pc.PIXELFORMAT_SRGBA8) {
            return 'srgb';
        }

        return 'gamma';
    }



    function writeIntoPlayCanvasTexture(texture, pixels, w, h) {
        if (typeof texture.lock !== 'function' || typeof texture.unlock !== 'function') {
            throw new Error('La textura no soporta lock()/unlock().');
        }

        const pixelCount = w * h;
        const dest = texture.lock({ level: 0, face: 0 });
        if (!dest) throw new Error('texture.lock() no devolvió un buffer.');

        const chExact = dest.length / pixelCount;
        const ch = Math.floor(chExact);
        if (ch < 1 || Math.abs(chExact - ch) > 1e-3) {
            try { texture.unlock(); } catch (_) { /* nada */ }
            throw new Error('Nº de canales incompatible: ' + chExact);
        }

        let kind = 'unknown';
        if (dest instanceof Float32Array) kind = 'f32';
        else if (dest instanceof Uint16Array) kind = 'f16';
        else if (dest instanceof Uint8Array || dest instanceof Uint8ClampedArray) kind = 'u8';

        if (kind === 'unknown') {
            try { texture.unlock(); } catch (_) { /* nada */ }
            throw new Error('Tipo de buffer no soportado: ' + Object.prototype.toString.call(dest));
        }

        const u8mode = kind === 'u8' ? resolveU8Encoding(texture) : null;
        const maxV = CONFIG.maxRadiance;
        const rgbm = [0, 0, 0, 1];

        log('[bakePathTracing.js]   escritura: texture="' + texture.name + '" format=' + texture.format +
            ' type=' + texture.type + ' buffer=' + kind + ' canales=' + ch +
            (u8mode ? ' encoding=' + u8mode : ''));

        for (let i = 0; i < pixelCount; i++) {
            let r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
            if (!isNum(r)) r = 0;
            if (!isNum(g)) g = 0;
            if (!isNum(b)) b = 0;
            r = clamp(r, 0, maxV); g = clamp(g, 0, maxV); b = clamp(b, 0, maxV);

            const d = i * ch;
            let o0 = r, o1 = g, o2 = b, o3 = 1;

            if (kind === 'f32') {
                // linear tal cual
            } else if (kind === 'f16') {
                o0 = floatToHalf(r); o1 = floatToHalf(g); o2 = floatToHalf(b); o3 = 0x3c00; // 1.0h
            } else {
                if (u8mode === 'rgbm') {
                    encodeRGBM(r, g, b, rgbm);
                    o0 = rgbm[0] * 255; o1 = rgbm[1] * 255; o2 = rgbm[2] * 255; o3 = rgbm[3] * 255;
                } else if (u8mode === 'srgb') {
                    o0 = linearToSRGB(r) * 255; o1 = linearToSRGB(g) * 255; o2 = linearToSRGB(b) * 255; o3 = 255;
                } else if (u8mode === 'linear') {
                    o0 = clamp(r, 0, 1) * 255; o1 = clamp(g, 0, 1) * 255; o2 = clamp(b, 0, 1) * 255; o3 = 255;
                } else { // gamma (decodeGamma ~ pow 2.2)
                    o0 = Math.pow(clamp(r, 0, 1), 1 / 2.2) * 255;
                    o1 = Math.pow(clamp(g, 0, 1), 1 / 2.2) * 255;
                    o2 = Math.pow(clamp(b, 0, 1), 1 / 2.2) * 255;
                    o3 = 255;
                }
                o0 = Math.round(o0); o1 = Math.round(o1); o2 = Math.round(o2); o3 = Math.round(o3);
            }

            if (ch >= 1) dest[d] = o0;
            if (ch >= 2) dest[d + 1] = o1;
            if (ch >= 3) dest[d + 2] = o2;
            if (ch >= 4) dest[d + 3] = o3;
        }

        texture.unlock();
        if (typeof texture.upload === 'function') texture.upload();
    }

    // =========================================================================
    // 14. PIPELINE PRINCIPAL
    // =========================================================================

    async function runPathTracing(lightmapper, bakeNodes, passCount, graphicsDevice, token) {
        const report = {
            version: PATCH_VERSION,
            passCount: passCount,
            nodes: [],
            lights: [],
            ambient: null,
            scene: null
        };
        global.__bakePathTracingLastReport = report;

        if (!isWebGPUDevice(graphicsDevice)) {
            warn('[bakePathTracing.js] WebGPU/Compute no está activo. Se deja el lightmap nativo intacto.');
            return report;
        }

        const state = await getDeviceState(graphicsDevice);
        const gpu = state.gpu;

        // ---- escena real ----
        const scene = collectSceneGeometry(lightmapper, bakeNodes);
        const lights = collectLights(lightmapper);
        const ambient = collectAmbient(lightmapper);

        const rayBias = CONFIG.rayBias === 'auto' ?
            Math.max(1e-3, scene.extent * 2e-4) : Number(CONFIG.rayBias);

        report.scene = {
            meshInstances: scene.geoms.length,
            triangles: scene.triCount,
            boundsMin: scene.boundsMin,
            boundsMax: scene.boundsMax,
            extent: scene.extent,
            rayBias: rayBias,
            rootSource: scene.root.source,
            meshes: scene.geoms.map(function (g) {
                return {
                    name: g.name, vertices: g.vertexCount, triangles: g.triCount,
                    hasUv1: g.hasUv1, hasNormals: g.hasNormals, castShadow: g.castShadow,
                    albedo: g.albedo, emission: g.emission, primitive: g.primitive
                };
            })
        };
        report.lights = lights.report;
        report.ambient = ambient;

        log('[bakePathTracing.js] Escena real: ' + scene.geoms.length + ' MeshInstances, ' +
            scene.triCount + ' triángulos, bounds ' + fmt(scene.boundsMin, 2) + ' -> ' + fmt(scene.boundsMax, 2) +
            ', rayBias=' + rayBias.toFixed(4));
        log('[bakePathTracing.js] Luces bake: ' + lights.count);
        lights.report.forEach(function (l) {
            log('[bakePathTracing.js]   luz "' + l.entity + '" ' + l.type +
                ' color(lineal)=' + fmt(l.color) + (l.dirToLight ? ' haciaLuz=' + fmt(l.dirToLight) : ' pos=' + fmt(l.position)));
        });
        if (lights.count === 0) {
            warn('[bakePathTracing.js] No hay luces con bake=true: el resultado solo tendrá ambiente/GI (probablemente negro). ' +
                'Activa "Bake Lightmap" en la luz, o CONFIG.onlyBakedLights=false.');
        }
        log('[bakePathTracing.js] Ambiente: ' + fmt(ambient.rgb) + ' (' + ambient.source + ')');

        if (scene.triCount === 0) {
            warn('[bakePathTracing.js] La escena no tiene triángulos válidos.');
            return report;
        }

        const sceneBufs = {
            tris: makeStorageBuffer(gpu, scene.tris, 'BakePT-Tris'),
            lights: makeStorageBuffer(gpu, lights.data, 'BakePT-Lights')
        };

        const sceneInfo = {
            triCount: scene.triCount,
            lightCount: lights.count,
            ambient: ambient.rgb,
            rayBias: rayBias
        };

        try {
            for (let n = 0; n < bakeNodes.length; n++) {
                if (lightmapper[TOKEN_KEY] !== token) {
                    log('[bakePathTracing.js] Bake obsoleto; se cancela el path tracing.');
                    break;
                }

                const bakeNode = bakeNodes[n];
                const nodeName = (bakeNode.node && bakeNode.node.name) || ('node' + n);
                const entry = { index: n, name: nodeName };
                report.nodes.push(entry);

                const res = resolveBakeNodeTextures(bakeNode, n);
                entry.renderTargets = res.rtTable;
                entry.colorPassIndex = res.colorPassIndex;
                entry.dirPassIndex = res.dirPassIndex;
                entry.colorSource = res.source;

                log('[bakePathTracing.js] ---- bakeNode ' + n + ' "' + nodeName + '" ----');
                res.rtTable.forEach(function (r) {
                    const role = r.pass === res.colorPassIndex ? 'COLOR FINAL (se modifica)' :
                        (r.pass === res.dirPassIndex ? 'DIRECCION (no se toca)' : 'otro/temporal (no se toca)');
                    log('[bakePathTracing.js]   renderTargets[' + r.pass + '] "' + r.name + '" ' + r.size +
                        ' format=' + r.format + ' type=' + r.type + '  -> ' + role);
                });

                if (!res.color) {
                    warn('[bakePathTracing.js] No se pudo identificar la textura de color de "' + nodeName +
                        '" (ningún MeshInstance expone texture_lightMap). No se modifica nada. ' +
                        'Usa CONFIG.passOverride = { color: <índice de renderTargets> } tras revisar la tabla anterior.');
                    entry.skipped = 'sin textura de color';
                    continue;
                }

                const tex = res.color;
                const w = Math.max(1, Math.floor(tex.width));
                const h = Math.max(1, Math.floor(tex.height));

                // ---- G-buffer ----
                const nodeGeoms = [];
                const mis = bakeNode.meshInstances || [];
                for (let i = 0; i < mis.length; i++) {
                    const g = scene.cache.get(mis[i]);
                    if (g && g.ok) nodeGeoms.push(g);
                }

                const gb = buildGBuffer(nodeGeoms, w, h);
                dilateGBuffer(gb, CONFIG.gbufferDilate);
                entry.gbuffer = describeGBuffer(gb);

                log('[bakePathTracing.js]   G-buffer ' + entry.gbuffer.size + ': ' + entry.gbuffer.validTexels +
                    ' texels válidos (' + entry.gbuffer.coveragePct + '%), dilatados=' + entry.gbuffer.dilatedTexels +
                    ', mundo ' + fmt(entry.gbuffer.worldMin, 2) + ' -> ' + fmt(entry.gbuffer.worldMax, 2));
                if (CONFIG.logCoverageAscii && w <= 64) log(asciiCoverage(gb));

                if (gb.valid === 0) {
                    warn('[bakePathTracing.js]   Ningún texel cubierto por UV1 (¿sin UV1?). No se modifica la textura.');
                    entry.skipped = 'sin cobertura UV1';
                    continue;
                }

                // ---- GPU ----
                const t0 = (global.performance || Date).now();
                const pixels = await traceOnGPU(state, sceneBufs, gb, 1234 + n * 7919, sceneInfo);

                if (lightmapper[TOKEN_KEY] !== token) {
                    log('[bakePathTracing.js] Bake obsoleto; no se escribe el resultado.');
                    break;
                }

                writeIntoPlayCanvasTexture(tex, pixels, w, h);
                entry.ms = Math.round((global.performance || Date).now() - t0);
                log('[bakePathTracing.js]   OK en ' + entry.ms + ' ms');
            }
        } finally {
            try { sceneBufs.tris.destroy(); } catch (_) { /* nada */ }
            try { sceneBufs.lights.destroy(); } catch (_) { /* nada */ }
        }

        log('[bakePathTracing.js] Path Tracing terminado.');
        return report;
    }

    // =========================================================================
    // 15. API PÚBLICA: bakePathTraceLights()
    // =========================================================================

    LP.bakePathTraceLights = async function bakePathTraceLights(opts) {
        if (!CONFIG.enabled) return null;

        const lightmapper = this;
        opts = opts || {};

        const bakeNodes = opts.bakeNodes || lightmapper[BAKENODES_KEY];
        const passCount = opts.passCount || lightmapper[PASSCOUNT_KEY] || 1;
        const device = opts.device || lightmapper[DEVICE_KEY] || lightmapper.device ||
            (lightmapper.app && lightmapper.app.graphicsDevice) || null;
        const token = opts.token !== undefined ? opts.token : lightmapper[TOKEN_KEY];

        if (!Array.isArray(bakeNodes) || !bakeNodes.length) {
            warn('[bakePathTracing.js] bakePathTraceLights(): no hay bakeNodes capturados.');
            return null;
        }
        if (!device) {
            warn('[bakePathTracing.js] No se pudo obtener el GraphicsDevice.');
            return null;
        }

        return runPathTracing(lightmapper, bakeNodes, passCount, device, token);
    };

    // =========================================================================
    // 16. HOOK: postprocessTextures()  (captura bakeNodes / passCount)
    // =========================================================================

    Object.defineProperty(LP, ORIGINAL_POSTPROCESS_KEY, {
        value: nativePostprocessTextures, writable: false, configurable: true, enumerable: false
    });

    LP.postprocessTextures = function patchedPostprocessTextures(device, bakeNodes, passCount) {
        const result = nativePostprocessTextures.apply(this, arguments);

        try {
            this[DEVICE_KEY] = device;
            this[BAKENODES_KEY] = bakeNodes;
            this[PASSCOUNT_KEY] = passCount;
        } catch (e) {
            error('[bakePathTracing.js] No se pudieron capturar los bakeNodes.', e);
        }

        return result;
    };

    // =========================================================================
    // 17. HOOK: bake()
    // =========================================================================

    Object.defineProperty(LP, ORIGINAL_BAKE_KEY, {
        value: nativeBake, writable: false, configurable: true, enumerable: false
    });

    LP.bake = function patchedBake(nodes, mode) {
        const lightmapper = this;

        lightmapper[BAKENODES_KEY] = null;
        lightmapper[PASSCOUNT_KEY] = 0;
        lightmapper[TOKEN_KEY] = (lightmapper[TOKEN_KEY] || 0) + 1;
        const token = lightmapper[TOKEN_KEY];

        let nativeResult;
        try {
            nativeResult = nativeBake.apply(lightmapper, arguments);
        } catch (e) {
            error('[bakePathTracing.js] El bake nativo de PlayCanvas falló.', e);
            throw e;
        }

        if (!CONFIG.enabled) return nativeResult;

        const bakeNodes = lightmapper[BAKENODES_KEY];
        if (!Array.isArray(bakeNodes) || !bakeNodes.length) {
            warn('[bakePathTracing.js] postprocessTextures() no se ejecutó: no hay nada que path-tracear.');
            return nativeResult;
        }

        log('[bakePathTracing.js] bake nativo listo. mode=' + mode + ' (BAKE_COLOR=' + pc.BAKE_COLOR +
            ', BAKE_COLORDIR=' + pc.BAKE_COLORDIR + ') passCount=' + lightmapper[PASSCOUNT_KEY] +
            ' bakeNodes=' + bakeNodes.length +
            ' bakeHDR=' + lightmapper.bakeHDR +
            ' scene.lightmapPixelFormat=' + (lightmapper.scene && lightmapper.scene.lightmapPixelFormat));

        try {
            const p = lightmapper.bakePathTraceLights({
                bakeNodes: bakeNodes,
                passCount: lightmapper[PASSCOUNT_KEY],
                device: lightmapper[DEVICE_KEY],
                token: token
            });
            lightmapper[PROMISE_KEY] = p;
            if (p && typeof p.catch === 'function') {
                p.catch(function (e) {
                    error('[bakePathTracing.js] Error asíncrono del Path Tracing:', e);
                });
            }
        } catch (e) {
            error('[bakePathTracing.js] No se pudo iniciar bakePathTraceLights().', e);
        }

        return nativeResult;
    };

    // =========================================================================
    // 18. MARCADORES + DEBUG
    // =========================================================================

    Object.defineProperty(LP, PATCH_FLAG, {
        value: true, writable: false, configurable: true, enumerable: false
    });
    Object.defineProperty(LP, VERSION_KEY, {
        value: PATCH_VERSION, writable: false, configurable: true, enumerable: false
    });

    try {
        global.__bakePathTracingConfig = CONFIG;
        global.__bakePathTracingDebug = {
            version: PATCH_VERSION,
            shader: pathTraceShader,
            internals: {
                buildGeometry: buildGeometry,
                buildGBuffer: buildGBuffer,
                dilateGBuffer: dilateGBuffer,
                describeGBuffer: describeGBuffer,
                collectSceneGeometry: collectSceneGeometry,
                collectLights: collectLights,
                encodeRGBM: encodeRGBM,
                floatToHalf: floatToHalf,
                resolveBakeNodeTextures: resolveBakeNodeTextures,
                writeIntoPlayCanvasTexture: writeIntoPlayCanvasTexture
            }
        };
    } catch (_) { /* nada */ }

    console.log('[bakePathTracing.js] Monkey-Patch ' + PATCH_VERSION + ' instalado correctamente.');
    console.log('[bakePathTracing.js] Pipeline: bake nativo -> postprocessTextures (captura) -> geometría real + luces reales -> ' +
        'G-buffer UV1 -> WebGPU Compute Path Tracing -> textura "texture_lightMap" del MeshInstance.');

})(typeof globalThis !== 'undefined' ? globalThis : window);