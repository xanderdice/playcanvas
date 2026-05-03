var FirePlane = pc.createScript("firePlane");

FirePlane.attributes.add("cameraEntity", { type: "entity", title: "Camera" });

FirePlane.attributes.add("shaderType", {
    type: "string",
    default: "fire",
    enum: [
        { "none": "none" },
        { "fire": "fire" },
        { "bonfire": "bonfire" },
        { "solar": "solar" }
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


FirePlane.attributes.add("shaderparams",
    {
        title: "shader params",
        type: "json",
        schema: [
            {
                name: "intensity",
                type: "number",
                max: 1,
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
                max: 1,
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

    fs.fire = [
        'precision mediump float;',
        'varying vec2 vUv0;',
        'uniform float uTime;',
        'uniform float uIntensity;',
        'uniform float uStrength;',
        'uniform float uPower;',
        'uniform float uRange;',
        'uniform float uWidth;',
        'uniform float uColor;',

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
        '    for (int i = 0; i < 5; i++) {',
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


    fs.bonfire = `
precision mediump float;

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
    for (int i = 0; i < 4; i++) {
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



    fs.solar = `
precision mediump float;

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

    this.material = new pc.ShaderMaterial({
        uniqueName: this.shaderType + "Shader",
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aUv0: pc.SEMANTIC_TEXCOORD0
        },
        vertexGLSL: vs,
        fragmentGLSL: fs[this.shaderType]
    });
    this.material.name = this.material.uniqueName;
    this.material.depthWrite = false;

    this.entity.render.material = this.material;

    this._applyMaterialState();
    this.material.update();
};

FirePlane.prototype._applyMaterialState = function () {
    this.material.setParameter('uTime', this.time);

    switch (this.shaderType) {
        case "fire":
        case "solar":
            this.material.setParameter('uIntensity', this.shaderparams.intensity);
            this.material.setParameter('uStrength', this.shaderparams.strength);
            this.material.setParameter('uPower', this.shaderparams.power);
            this.material.setParameter('uRange', this.shaderparams.range);
            this.material.setParameter('uWidth', this.shaderparams.width);
            this.material.setParameter('uColor', this.shaderparams.color);
            break;
        case "bonfire":
            this.material.setParameter('uResolution', this.cameraEntity.camera.screenSize);
            this.material.setParameter('uSpeed', this.shaderparams.strength * 0.5);
            this.material.setParameter('uIntensity', this.shaderparams.intensity);
            this.material.setParameter('uStrength', this.shaderparams.strength);
            this.material.setParameter('uRange', this.shaderparams.range);
            this.material.setParameter('uWidth', this.shaderparams.width);
            this.material.setParameter('uColor', this.shaderparams.color);
            this.material.setParameter('uDensity', this.shaderparams.width * 10.0); // Mapeado
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

    if (this.billboardType === "none") {
    } else if (this.billboardType === "lookatcamera") {

        this.entity.lookAt(this.cameraEntity.getPosition());
        this.entity.rotateLocal(-90, 0, 0);

    } else if (this.billboardType === "cilindrical") {
        var camPos = this.cameraEntity.getPosition();
        var pos = this.entity.getPosition();

        var dx = camPos.x - pos.x;
        var dz = camPos.z - pos.z;

        var angleY = -Math.atan2(dx, -dz) * pc.math.RAD_TO_DEG;

        this.entity.setEulerAngles(-90, angleY, 0);
    }

};