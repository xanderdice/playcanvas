var FirePlane = pc.createScript("firePlane");

FirePlane.attributes.add("cameraEntity", { type: "entity", title: "Camera" });

FirePlane.attributes.add("shaderType", {
    type: "string",
    default: "fire",
    enum: [
        { "none": "none" },
        { "fire": "fire" },
        { "bonfire": "bonfire" },
        { "solar": "solar" },
        { "flame": "flame" },
        { "flameEye": "flameEye" },
        { "flamelance": "flamelance" },
        { "sun": "sun" }
    ]
});

/* HD/SD: al acercar la camara al fuego, "hd" activa mayor definicion
   (precision highp + mas octavas/pasos/supersampling). "sd" es mas barato. */
FirePlane.attributes.add("quality", {
    type: "string",
    default: "hd",
    enum: [
        { "hd": "hd" },
        { "sd": "sd" }
    ]
});

FirePlane.attributes.add("blendType", {
    type: "number",
    default: 1,
    enum: [
        { "NORMAL": pc.BLEND_NORMAL },
        { "ADDITIVE": pc.BLEND_ADDITIVE }
    ]
});

FirePlane.attributes.add("cull", {
    type: "number",
    default: 0,
    enum: [
        { "NONE": pc.CULLFACE_NONE },
        { "BACK": pc.CULLFACE_BACK },
        { "FRONT": pc.CULLFACE_FRONT }
    ]
});

FirePlane.attributes.add("billboardType", {
    type: "string",
    default: "cilindrical",
    enum: [
        { "cilindrical": "cilindrical" },
        { "lookatcamera": "lookatcamera" },
        { "none": "none" }
    ]
});


/* PARAMETROS GENERICOS
   Un unico set compartido por TODOS los tipos de fuego. Cada shader lee solo
   el subconjunto que necesita; el mapeo a los uniforms originales de pixy
   (cIntensity, cStrength, cSize, cRadius, cPowerExponent, ...) se hace dentro
   de cada shader o en _applyMaterialState. Asi los presets son intercambiables
   entre tipos de llama. */
FirePlane.attributes.add("shaderparams",
    {
        title: "shader params",
        type: "json",
        schema: [
            {
                name: "intensity",
                type: "number",
                min: 0,
                max: 3,
                precision: 2,
                step: 0.01,
                default: 1
            },
            {
                name: "strength",
                type: "number",
                default: 1,
                min: 0,
                max: 5,
                precision: 3,
                step: 0.001
            },
            {
                name: "power",
                type: "number",
                default: 0.5,
                min: 0,
                max: 2,
                precision: 3,
                step: 0.001
            },
            {
                name: "range",
                type: "number",
                default: 5,
                min: 0,
                max: 5,
                precision: 3,
                step: 0.001
            },
            {
                name: "width",
                type: "number",
                default: 1,
                min: 0,
                max: 1,
                precision: 2,
                step: 0.01
            },
            {
                name: "color",
                type: "number",
                default: 1,
                min: 0,
                max: 1,
                precision: 1,
                step: 0.1
            },
            {
                name: "speed",
                type: "number",
                default: 1,
                min: 0,
                max: 5,
                precision: 3,
                step: 0.001
            },
            {
                name: "density",
                type: "number",
                default: 1,
                min: 0,
                max: 5,
                precision: 3,
                step: 0.001
            },
            {
                name: "size",
                type: "number",
                default: 1,
                min: 0.05,
                max: 3,
                precision: 3,
                step: 0.001
            }
        ]
    });




FirePlane.prototype.initialize = function () {
    if (!this.entity.render) {
        this.entity.addComponent('render', { type: 'plane' });
    }

    if (!this.cameraEntity) {
        this.cameraEntity = window.GameManager?.input?.camera?.entity ?? null;
    }

    if (this.shaderType === "none") return;

    this.entity.render.castShadows = false;
    this.entity.render.receiveShadows = false;
    this.entity.tags.add("uranus-instancing-exclude");

    this.time = 0;
    var fs = {};

    const vs = [
        'attribute vec3 aPosition;',
        'attribute vec2 aUv0;',
        'uniform mat4 matrix_model;',
        'uniform mat4 matrix_viewProjection;',
        'varying vec2 vUv0;',
        'void main(void) {',
        '    vUv0 = aUv0;',
        '    gl_Position = matrix_viewProjection * matrix_model * vec4(aPosition, 1.0);',
        '}'
    ].join('\n');

    /* ============================================================= *
     *  FIRE  (shadertoy XsXSWS by xbe) - existente, testeado.
     *  HD/SD: FBM_OCT controla las octavas de ruido (mas = mas nitido).
     * ============================================================= */
    fs.fire = [
        'varying vec2 vUv0;',
        'uniform float uTime;',
        'uniform float uIntensity;',
        'uniform float uStrength;',
        'uniform float uPower;',
        'uniform float uRange;',
        'uniform float uWidth;',
        'uniform float uColor;',

        '#ifdef FIRE_HD',
        '#define FBM_OCT 8',
        '#else',
        '#define FBM_OCT 5',
        '#endif',

        'vec2 hash(vec2 p) {',
        '    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));',
        '    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);',
        '}',

        'float noise(vec2 p) {',
        '    const float K1 = 0.366025404;',
        '    const float K2 = 0.211324865;',
        '    vec2 i = floor(p + (p.x + p.y) * K1);',
        '    vec2 a = p - i + (i.x + i.y) * K2;',
        '    vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
        '    vec2 b = a - o + K2;',
        '    vec2 c = a - 1.0 + 2.0 * K2;',
        '    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);',
        '    vec3 n = h * h * h * h * vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));',
        '    return dot(n, vec3(70.0));',
        '}',

        'float fbm(vec2 p) {',
        '    float v = 0.0;',
        '    float a = 0.5;',
        '    for (int i = 0; i < FBM_OCT; i++) {',
        '        v += a * noise(p);',
        '        p = p * 2.02 + vec2(1.7, 9.2);',
        '        a *= 0.5;',
        '    }',
        '    return v;',
        '}',

        'float rgb2gray(vec3 c) {',
        '    return dot(c, vec3(0.299, 0.587, 0.114));',
        '}',

        'void main(void) {',
        '    vec2 q = vUv0;',
        '    q.y *= 2.0 - 1.0 * clamp(uPower, 0.0, 1.0);',

        '    float T3 = max(3.0, 1.25 * uStrength) * uTime;',
        '    q.x = mod(q.x, 1.0) - 0.5;',
        '    q.y -= 0.25;',

        '    float s = max(uStrength, 0.001);',
        '    float n = fbm(s * q - vec2(0.0, T3));',

        '    float w = clamp(uWidth, 0.0, 1.0);',
        '    float r = max(uRange, 0.001);',
        '    float i = clamp(uIntensity, 0.0, 1.0);',

        '    float c = 2.0 * i - 16.0 * pow(',
        '        max(',
        '            0.0,',
        '            length(q * vec2(3.0 - w * 3.0 + q.y * 1.5, 0.75)) - n * max(0.0, q.y + 0.25)',
        '        ),',
        '        1.2',
        '    );',

        '    float c1 = n * c * (1.5 - pow((2.50 / r) * vUv0.y, 4.0));',
        '    c1 = clamp(c1, 0.0, 1.0);',

        '    vec3 col = vec3(1.5 * c1, 1.5 * c1 * c1 * c1, c1 * c1 * c1 * c1 * c1);',
        '    float a = c * (1.0 - pow(vUv0.y, 3.0));',

        '    vec3 finalColor = mix(vec3(0.0), col, a);',
        '    float gray = rgb2gray(finalColor);',
        '    vec3 outColor = mix(vec3(gray), finalColor, clamp(uColor, 0.0, 1.0));',

        '    gl_FragColor = vec4(outColor, clamp(a * i, 0.0, 1.0));',
        '}'
    ].join('\n');


    /* ============================================================= *
     *  BONFIRE - existente, testeado. HD/SD: FBM_OCT.
     * ============================================================= */
    fs.bonfire = `
varying vec2 vUv0;

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uStrength;
uniform float uRange;
uniform float uWidth;
uniform float uColor;
uniform float uDensity;
uniform float uSpeed;

#ifdef FIRE_HD
#define FBM_OCT 6
#else
#define FBM_OCT 4
#endif

vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }

vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }

vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g = vec3(0.0);
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < FBM_OCT; i++) {
        value += amplitude * snoise(p);
        p = p * 2.02 + vec2(1.7, 9.2);
        amplitude *= 0.5;
    }
    return value * 0.5 + 0.5;
}

float prng(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void) {
    vec2 res = max(uResolution, vec2(1.0));
    float aspect = res.x / res.y;
    float t = uTime * uSpeed;

    vec2 uv = vUv0;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= aspect;

    float density = max(uDensity, 0.001);
    float strength = max(uStrength, 0.001);
    float height = mix(0.75, 1.75, clamp(uRange / 5.0, 0.0, 1.0));
    float width = max(uWidth, 0.001);

    vec2 flow = vec2(0.0, -t * (1.2 + 0.4 * strength));
    vec2 q = vec2(p.x * density * 1.4, p.y * density * height) + flow;

    float n0 = fbm(q);
    float n1 = fbm(q * 2.0 + vec2(9.2, 1.7));
    float n2 = fbm(q * 4.0 - vec2(3.4, 7.8));

    float base = pow(clamp(1.0 - uv.y, 0.0, 1.0), 1.35);
    float core = smoothstep(1.0, 0.0, abs(p.x) * (1.15 + 0.75 * width));
    core *= smoothstep(0.0, 0.85, uv.y);

    float flameNoise = mix(n0, n1, 0.55);
    float flame = base * core * pow(clamp(flameNoise, 0.0001, 1.0), 0.35 + 0.25 * strength);
    flame *= clamp(uIntensity, 0.0, 1.0);

    float emberBand = (1.0 - smoothstep(0.0, 0.15, uv.y)) * smoothstep(1.0, 0.3, abs(p.x));
    vec2 cell = floor(vec2(p.x * 18.0 * width, (uv.y - t * 1.7) * 28.0 * max(0.75, density)));
    float r = prng(cell);

    float spark = step(0.965, r);
    float sparkShape = 1.0 - smoothstep(0.0, 0.18, length(fract(vec2(p.x * 18.0, uv.y * 28.0 - t * 1.7)) - 0.5));
    spark *= sparkShape * emberBand * (0.4 + 0.6 * n2);

    vec3 fire = vec3(
        1.75 * flame + 0.8 * spark,
        0.55 * pow(flame, 1.15) + 0.25 * spark,
        0.08 * pow(flame, 3.5)
    );

    float alpha = clamp(flame + spark, 0.0, 1.0);
    vec3 gray = vec3(dot(fire, vec3(0.299, 0.587, 0.114)));
    vec3 outColor = mix(gray, fire, clamp(uColor, 0.0, 1.0));

    gl_FragColor = vec4(outColor, alpha);
}
`.trim();



    /* ============================================================= *
     *  SOLAR - existente, testeado (halo radial suave).
     * ============================================================= */
    fs.solar = `
varying vec2 vUv0;

uniform float uIntensity;
uniform float uStrength;
uniform float uRange;
uniform float uWidth;
uniform float uColor;
uniform float uTime;

void main(void) {
    vec2 p = vUv0 * 2.0 - 1.0;
    float d = length(p);

    float core = smoothstep(0.22, 0.0, d);
    float halo = pow(max(1.0 - d, 0.0), max(uStrength, 0.001));

    float t = uIntensity * (core * 1.5 + halo);
    t = max(t, 0.0);

    vec3 base = vec3(1.0, 0.82, 0.35);
    vec3 hot = vec3(1.0, 1.0, 1.0);
    vec3 color = mix(base, hot, core);

    float gray = dot(color * t, vec3(0.299, 0.587, 0.114));
    vec3 outColor = mix(vec3(gray), color * t, clamp(uColor, 0.0, 1.0));

    gl_FragColor = vec4(outColor, clamp(t, 0.0, 1.0));
}
`.trim();


    /* ============================================================= *
     *  FLAME  (shadertoy MdX3zr) - raymarch de una llama esferica.
     *  Original: pin/pout, gl_FragCoord/resolution -> portado a vUv0.
     *  Mapeo generico: cIntensity=uIntensity, cWidth<-uWidth,
     *  cScale<-uSize, animacion<-uSpeed. HD/SD: RM_STEPS.
     * ============================================================= */
    fs.flame = `
varying vec2 vUv0;

uniform float uTime;
uniform float uIntensity;
uniform float uWidth;
uniform float uSize;
uniform float uColor;
uniform float uSpeed;

#ifdef FIRE_HD
#define RM_STEPS 72
#else
#define RM_STEPS 36
#endif

float rgb2gray(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float flameNoise(vec3 p) {
    vec3 i = floor(p);
    vec4 a = vec4(dot(i, vec3(1.0, 57.0, 21.0))) + vec4(0.0, 57.0, 21.0, 78.0);
    vec3 f = cos((p - i) * acos(-1.0)) * (-0.5) + 0.5;
    a = mix(sin(cos(a) * a), sin(cos(vec4(1.0) + a) * (vec4(1.0) + a)), f.x);
    a.xy = mix(a.xz, a.yw, f.y);
    return mix(a.x, a.y, f.z);
}

float sphere(vec3 p, vec4 spr) {
    return length(spr.xyz - p) - spr.w;
}

float flame(vec3 p) {
    float d = sphere(p * vec3(1.0, 0.5, 1.0), vec4(0.0, -1.0, 0.0, 1.0));
    return d + (flameNoise(p + vec3(0.0, uTime * 2.0 * max(uSpeed, 0.001), 0.0)) + flameNoise(p * 3.0) * 0.5) * 0.25 * p.y;
}

float scene(vec3 p) {
    return min(100.0 - length(p), abs(flame(p)));
}

vec4 raymarch(vec3 org, vec3 dir) {
    float d = 0.0, glow = 0.0, eps = 0.02;
    vec3 p = org;
    bool glowed = false;
    for (int i = 0; i < RM_STEPS; i++) {
        d = scene(p) + eps;
        p += d * dir;
        if (d > eps) {
            if (flame(p) < 0.0) {
                glowed = true;
            } else if (glowed) {
                glow = float(i) / float(RM_STEPS);
            }
        }
    }
    return vec4(p, glow);
}

void main(void) {
    vec2 v = vUv0 * 2.0 - 1.0;
    float w = max(uWidth, 0.05);
    float sc = max(uSize, 0.05);

    vec3 org = vec3(0.0, -2.0, 4.0);
    vec3 dir = normalize(vec3(v.x * 1.6 / w, -v.y, -1.5 * sc));

    vec4 pm = raymarch(org, dir);
    float glow = pm.w;

    float g = pow(glow * 2.0 * max(uIntensity, 0.0), 4.0);
    vec3 col = vec3(1.6 * g, 1.1 * g * g, 0.45 * g * g * g);
    float a = clamp(g, 0.0, 1.0);

    float gray = rgb2gray(col);
    vec3 outColor = mix(vec3(gray), col, clamp(uColor, 0.0, 1.0));

    gl_FragColor = vec4(outColor, a);
}
`.trim();


    /* ============================================================= *
     *  FLAME EYE  (shadertoy ltBfDt) - ojo/corona de fuego 2D.
     *  Mapeo generico: cSpeed=uSpeed, cColor=uColor,
     *  innerFade<-uPower, border<-uWidth.
     * ============================================================= */
    fs.flameEye = `
varying vec2 vUv0;

uniform float uTime;
uniform float uSpeed;
uniform float uColor;
uniform float uPower;
uniform float uWidth;

float rgb2gray(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }

float feNoise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float light(vec2 pos, float size, float radius, float inner_fade, float outer_fade) {
    float len = length(pos / size);
    return pow(clamp((1.0 - pow(clamp(len - radius, 0.0, 1.0), 1.0 / inner_fade)), 0.0, 1.0), 1.0 / outer_fade);
}

float flare(float angle, float alpha, float t) {
    float n = feNoise(vec2(t + 0.5 + abs(angle) + pow(alpha, 0.6), t - abs(angle) + pow(alpha + 0.1, 0.6)) * 7.0);
    float split = (15.0 + sin(t * 2.0 + n * 4.0 + angle * 20.0 + alpha * 1.0 * n) * (0.3 + 0.5 + alpha * 0.6 * n));
    float rotate = sin(angle * 20.0 + sin(angle * 15.0 + alpha * 4.0 + t * 30.0 + n * 5.0 + alpha * 4.0)) * (0.5 + alpha * 1.5);
    float g = pow((2.0 + sin(split + n * 1.5 * alpha + rotate) * 1.4) * n * 4.0, n * (1.5 - 0.8 * alpha));
    g *= alpha * alpha * alpha * 0.4;
    g += alpha * 0.7 + g * g * g;
    return g;
}

void main(void) {
    const float cSize = 2.3;
    const float cRadius = 0.099;

    float innerFade = clamp(uPower * 1.6, 0.2, 1.6);
    float outerFade = 0.02;
    float border = clamp(mix(0.12, 0.34, clamp(uWidth, 0.0, 1.0)), 0.05, 0.45);

    vec2 uv = vUv0 * 2.0 - 1.0;
    float f = 0.0;
    float f2 = 0.0;
    float t = uTime * uSpeed;
    float alpha = light(uv, cSize, cRadius, innerFade, outerFade);
    float angle = atan(uv.x, uv.y);
    float n = feNoise(vec2(uv.x * 20.0 + uTime, uv.y * 20.0 + uTime));
    float l = length(uv);
    if (l < border) {
        t *= 0.8;
        alpha = (1.0 - pow(((border - l) / border), 0.22) * 0.7);
        alpha = clamp(alpha - light(uv, 0.2, 0.0, 1.3, 0.7) * 0.55, 0.0, 1.0);
        f = flare(angle * 1.0, alpha, -t * 0.5 + alpha);
        f2 = flare(angle * 1.0, alpha, ((-t + alpha * 0.5 + 5.38134)));
    } else if (alpha < 0.001) {
        f = alpha;
    } else {
        f = flare(angle, alpha, t) * 1.3;
    }
    vec3 col = vec3(
        f * (1.0 + sin(angle - t * 4.0) * 0.3) + f2 * f2 * f2,
        f * alpha + f2 * f2 * 2.0,
        f * alpha * 0.5 + f2 * (1.0 + sin(angle + t * 4.0) * 0.3)
    );
    float gray = rgb2gray(col);
    vec3 outColor = mix(vec3(gray), col, clamp(uColor, 0.0, 1.0));
    float a = clamp(max(outColor.r, max(outColor.g, outColor.b)), 0.0, 1.0);
    gl_FragColor = vec4(outColor, a);
}
`.trim();


    /* ============================================================= *
     *  FLAMELANCE - lanza/haz de fuego con ruido Perlin.
     *  Coord basadas en resolucion virtual (uResolution) -> definicion
     *  segun quality. cSize<-uSize*32, cPower<-uPower, cNoiseSize<-uStrength,
     *  cNoiseStrength<-uWidth. HD/SD: NOISE_DEPTH.
     * ============================================================= */
    fs.flamelance = `
varying vec2 vUv0;

uniform float uTime;
uniform vec2 uResolution;
uniform float uSpeed;
uniform float uPower;
uniform float uColor;
uniform float uStrength;
uniform float uWidth;
uniform float uSize;

#ifdef FIRE_HD
#define NOISE_DEPTH 5
#else
#define NOISE_DEPTH 2
#endif

float rgb2gray(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec2 P) {
    vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
    vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
    Pi = mod289(Pi);
    vec4 ix = Pi.xzxz;
    vec4 iy = Pi.yyww;
    vec4 fx = Pf.xzxz;
    vec4 fy = Pf.yyww;
    vec4 i = permute(permute(ix) + iy);
    vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
    vec4 gy = abs(gx) - 0.5;
    vec4 tx = floor(gx + 0.5);
    gx = gx - tx;
    vec2 g00 = vec2(gx.x, gy.x);
    vec2 g10 = vec2(gx.y, gy.y);
    vec2 g01 = vec2(gx.z, gy.z);
    vec2 g11 = vec2(gx.w, gy.w);
    vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
    g00 *= norm.x;
    g01 *= norm.y;
    g10 *= norm.z;
    g11 *= norm.w;
    float n00 = dot(g00, vec2(fx.x, fy.x));
    float n10 = dot(g10, vec2(fx.y, fy.y));
    float n01 = dot(g01, vec2(fx.z, fy.z));
    float n11 = dot(g11, vec2(fx.w, fy.w));
    vec2 fade_xy = fade(Pf.xy);
    vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
    float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
    return 2.3 * n_xy;
}

void main(void) {
    vec2 res = max(uResolution, vec2(1.0));
    vec2 coord = vUv0 * res;
    vec4 color = vec4(2.0, 1.5, 0.5, 1.0);

    float cAngle = 0.0;
    float cSize = clamp(uSize * 32.0, 1.0, 101.0);
    float cPower = max(uPower, 0.001);
    float cNoiseSize = mix(2.0, 16.0, clamp(uStrength / 5.0, 0.0, 1.0));
    float cNoiseStrength = clamp(mix(0.05, 0.5, clamp(uWidth, 0.0, 1.0)), 0.0, 1.0);

    vec2 position = vec2((cAngle + 1.0) / 2.0, 0.0) * res;
    float inc = -cAngle;
    float xslope = (coord.x - position.x);
    float yslope = (coord.y - position.y);
    float syd = (abs(yslope) < 1e-4) ? 1e-4 : yslope;
    float slope = xslope / syd;

    float xinc = clamp(mod(uTime, 6.0) - 3.0, -3.0, 3.0);
    float yinc = clamp(mod(-uTime, 6.0) + 3.0, -3.0, 3.0);
    float xsd = (abs(xslope) < 1e-4) ? 1e-4 : xslope;
    float xdif = xinc / xsd;
    float ydif = yinc / syd;

    float dist = distance(position, coord);
    dist = abs(slope - inc) * 0.1 + dist / (10000.0 * cPower);
    if ((inc > 0.0 && inc > 2.0) || (inc < 0.0 && inc < -2.0)) dist *= dist;
    if ((xdif < 0.0 && ydif < 0.0) || (ydif < 0.0 && xdif > 0.0)) dist = 10.0;

    vec2 noisePosition = cNoiseSize * (coord - position) / res.y - vec2(xinc * uSpeed * uTime, yinc * uSpeed * uTime);
    float noise = 0.0;
    for (int i = 0; i < 10; i++) {
        if (i > NOISE_DEPTH) break;
        noise += cnoise(noisePosition * pow(2.0, float(i)));
    }

    vec4 d = mix(vec4(-(101.0 - cSize) * dist), vec4(noise), cNoiseStrength) + color;
    float gray = rgb2gray(d.xyz);
    vec3 outColor = mix(vec3(gray), d.xyz, clamp(uColor, 0.0, 1.0));
    float a = clamp(rgb2gray(max(d.xyz, vec3(0.0))), 0.0, 1.0);
    gl_FragColor = vec4(outColor, a);
}
`.trim();


    /* ============================================================= *
     *  SUN  (shadertoy MlKGDc by Iulian Marinescu Ghetau) - sol
     *  volumetrico raytraced. Refactor: sin global mutable (sunObj()),
     *  para transpilar limpio a WGSL. cRadius<-uSize, cColor<-uColor.
     *  HD/SD: pasos de raymarch + supersampling 4x (solo HD).
     * ============================================================= */
    fs.sun = `
varying vec2 vUv0;

uniform float uTime;
uniform vec2 uResolution;
uniform float uSize;
uniform float uColor;

#ifdef FIRE_HD
#define RM_STEPS 30
#define SUPERSAMPLE
#else
#define RM_STEPS 16
#endif

struct Ray { vec3 o; vec3 dir; };
struct Intersect { vec3 pos; vec3 norm; };

const float eps = 1e-3;
const int iterations = 15;
const float cCamPanRadius = 10000.0;

float rgb2gray(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(float n) { return fract(sin(n) * 783.5453123); }

float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 157.0 + 113.0 * p.z;
    return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                   mix(hash(n + 157.0), hash(n + 158.0), f.x), f.y),
               mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                   mix(hash(n + 270.0), hash(n + 271.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    vec3 q = 0.1 * p;
    float f = 0.5 * noise(q); q = q * 2.01;
    f += 0.25 * noise(q); q = q * 2.02;
    f += 0.125 * noise(q); q = q * 2.03;
    f += 0.0625 * noise(q);
    return f;
}

vec4 sunObj() { return vec4(0.0, 0.0, 0.0, 5.0 - 3.5 * (1.0 - clamp(uSize, 0.05, 2.0))); }

float sdSphere(vec4 sp, vec3 p) { return length(p - sp.xyz) - sp.w; }

float dfSunSurface(vec3 p) {
    float cs = cos(uTime * 0.1);
    float si = sin(uTime * 0.1);
    mat2 rM = mat2(cs, si, -si, cs);
    p.xz = p.xz * rM;
    return max(0.0, sdSphere(sunObj() + vec4(0.0, 0.0, 0.0, -1.0), p) + fbm(p * 60.0 + uTime * 2.0) * 0.15);
}

bool intSphere(vec4 sp, vec3 ro, vec3 rd, float tm, out float t) {
    bool r = false;
    vec3 d = ro - sp.xyz;
    float b = dot(rd, d);
    float c = dot(d, d) - sp.w * sp.w;
    t = b * b - c;
    if (t > 0.0) {
        t = -b - sqrt(t);
        r = (t > 0.0) && (t < tm);
    }
    return r;
}

vec3 firePalette(float i) {
    float T = 900.0 + 3500.0 * i;
    vec3 L = vec3(7.4, 5.6, 4.4);
    L = pow(L, vec3(5.0)) * (exp(vec3(1.43876719683e5) / (T * L)) - 1.0);
    return vec3(1.0) - exp(vec3(-5e8) / L);
}

vec3 rayMarch(vec3 ro, vec3 rd, out float dist) {
    float ld = 0.0, td = 0.0, w;
    float d = 1.0, t = 0.0;
    const float h = 0.25;
    float tc = 0.0;
    for (int i = 0; i < RM_STEPS; i++) {
        if (td > (1.0 - 0.02) || d < 0.001 * t || t > 12.0) break;
        d = dfSunSurface(ro + t * rd);
        ld = (h - d) * step(d, h);
        w = (1.0 - td) * ld;
        tc += w * w + 1.0 / 70.0;
        td += w;
        t += d * 0.5;
    }
    dist = clamp(d, 0.0, 1.0);
    return firePalette(tc);
}

Ray calcFragmentRay(vec2 uv) {
    vec3 camPos = vec3(0.0, 0.0, 12.0);
    vec3 camForward = vec3(0.0, 0.0, -1.0);
    vec3 camRight = normalize(cross(vec3(0.0, 1.0, 0.0), camForward));
    vec3 camUp = cross(camForward, camRight);
    Ray r;
    r.o = camPos;
    r.dir = normalize(uv.x * camRight + uv.y * camUp + camForward);
    return r;
}

bool intObjs(vec3 ro, vec3 rd, out Intersect hit) {
    bool r = false;
    float t = 0.0, tm = cCamPanRadius;
    if (intSphere(sunObj(), ro, rd, tm, t)) {
        tm = t; r = true;
        hit.pos = ro + tm * rd;
        hit.norm = normalize(hit.pos - sunObj().xyz);
    }
    return r;
}

vec3 rayTrace(vec2 fragCoord) {
    vec2 uv = fragCoord / uResolution - vec2(0.5);
    Ray ray = calcFragmentRay(uv);
    float mask = 1.0;
    vec3 color = vec3(0.0);
    for (int i = 0; i <= iterations; i++) {
        Intersect hit;
        if (intObjs(ray.o, ray.dir, hit)) {
            float sunDist = 0.0;
            color += mask * rayMarch(hit.pos, ray.dir, sunDist);
            mask *= sunDist;
            ray.o = hit.pos + eps * ray.dir;
        } else {
            break;
        }
    }
    return color;
}

void main(void) {
    vec2 res = max(uResolution, vec2(1.0));
    vec2 fragCoord = vUv0 * res;
#ifdef SUPERSAMPLE
    vec3 col0 = rayTrace(fragCoord + vec2(0.0, 0.0));
    vec3 col1 = rayTrace(fragCoord + vec2(0.5, 0.0));
    vec3 col2 = rayTrace(fragCoord + vec2(0.0, 0.5));
    vec3 col3 = rayTrace(fragCoord + vec2(0.5, 0.5));
    vec3 col = 0.25 * (col0 + col1 + col2 + col3);
#else
    vec3 col = rayTrace(fragCoord);
#endif
    float gray = rgb2gray(col);
    vec3 outColor = mix(vec3(gray), col, clamp(uColor, 0.0, 1.0));
    float a = clamp(rgb2gray(col) * 1.4, 0.0, 1.0);
    gl_FragColor = vec4(outColor, a);
}
`.trim();


    /* highp SIEMPRE: da mejor definicion al acercar la camara y evita el
       desbordamiento de constantes de rango HDR (p.ej. el shader "sun" usa
       1.43e5 / 5e8, que superan el maximo de mediump ~65504). En WebGPU todo
       es f32; en WebGL2 highp esta garantizado en fragment. quality solo
       controla iteraciones/octavas/supersampling via FIRE_HD. */
    const header = (this.quality === "hd")
        ? "#define FIRE_HD\nprecision highp float;\n"
        : "precision highp float;\n";

    this.material = new pc.ShaderMaterial({
        uniqueName: this.shaderType + "Shader_" + this.quality,
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aUv0: pc.SEMANTIC_TEXCOORD0
        },
        vertexGLSL: vs,
        fragmentGLSL: header + fs[this.shaderType]
    });
    this.material.name = this.material.uniqueName;
    this.material.depthWrite = false;

    this.entity.render.material = this.material;

    this._applyMaterialState();
    this.material.update();
};

/* Resolucion de pantalla real (aspect correcto para bonfire). */
FirePlane.prototype._screenResolution = function () {
    var d = this.app.graphicsDevice;
    return [d.width || 1, d.height || 1];
};

/* Resolucion virtual para shaders basados en coordenadas (flamelance, sun).
   HD = mas muestreo -> mas nitidez al acercarse. */
FirePlane.prototype._virtualResolution = function () {
    var s = (this.quality === "hd") ? 1024.0 : 384.0;
    return [s, s];
};

FirePlane.prototype._applyMaterialState = function () {
    var p = this.shaderparams;

    /* PARAMETROS GENERICOS: se envian SIEMPRE. PlayCanvas ignora los uniforms
       que el shader activo no declara, asi que un mismo preset es compatible
       con todos los tipos de fuego. */
    this.material.setParameter('uTime', this.time);
    this.material.setParameter('uIntensity', p.intensity);
    this.material.setParameter('uStrength', p.strength);
    this.material.setParameter('uPower', p.power);
    this.material.setParameter('uRange', p.range);
    this.material.setParameter('uWidth', p.width);
    this.material.setParameter('uColor', p.color);
    this.material.setParameter('uSpeed', p.speed);
    this.material.setParameter('uDensity', p.density);
    this.material.setParameter('uSize', p.size);

    /* Mapeos especificos por tipo (resolucion / derivados testeados). */
    switch (this.shaderType) {
        case "bonfire":
            this.material.setParameter('uResolution', this._screenResolution());
            this.material.setParameter('uSpeed', p.strength * 0.5);
            this.material.setParameter('uDensity', p.width * 10.0);
            break;
        case "flamelance":
        case "sun":
            this.material.setParameter('uResolution', this._virtualResolution());
            break;
    }

    this.material.blendType = this.blendType;
    this.material.cull = this.cull;
};

FirePlane.prototype.update = function (dt) {
    if (!this.cameraEntity) return;

    if (this.shaderType !== "none" && this.material) {
        this.time += dt;
        this._applyMaterialState();
    }

    var camPos = this.cameraEntity.getPosition();
    if (this.billboardType === "none") {
    } else if (this.billboardType === "lookatcamera") {

        this.entity.lookAt(camPos);
        this.entity.rotateLocal(-90, 0, 0);

    } else if (this.billboardType === "cilindrical") {

        var pos = this.entity.getPosition();

        var dx = camPos.x - pos.x;
        var dz = camPos.z - pos.z;

        var angleY = -Math.atan2(dx, -dz) * pc.math.RAD_TO_DEG;

        this.entity.setEulerAngles(-90, angleY, 0);
    }

};
