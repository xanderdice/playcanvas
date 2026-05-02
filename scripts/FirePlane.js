var FirePlane = pc.createScript("firePlane");

FirePlane.attributes.add("cameraEntity", { type: "entity", title: "Camera" });

FirePlane.attributes.add("shaderType", {
    type: "string",
    default: "fire",
    enum: [
        { "fire": "fire" },
        { "bonfire": "bonfire" }
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
        { "clasic": "clasic" }
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

    this.entity.render.castShadows = false;
    this.entity.render.receiveShadows = false;

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


    fs.bonfire = [
        '#define PI 3.14159265359',
        'precision mediump float;',
        'varying vec2 vUv0;',
        'uniform vec2 uResolution;',
        'uniform float uTime;',
        'uniform float uIntensity;',
        'uniform float uStrength;',
        'uniform float uRange;',
        'uniform float uWidth;',
        'uniform float uColor;',
        'uniform float uDensity;', // Añadido
        'uniform float uSpeed;',   // Añadido

        'vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
        'vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
        'vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }',
        'vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }',

        'float snoise(vec3 v) {',
        '    const vec2 C = vec2(1.0/6.0, 1.0/3.0);',
        '    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
        '    vec3 i = floor(v + dot(v, C.yyy));',
        '    vec3 x0 = v - i + dot(i, C.xxx);',
        '    vec3 g = step(x0.yzx, x0.xyz);',
        '    vec3 l = 1.0 - g;',
        '    vec3 i1 = min(g.z, l.z);',
        '    vec3 i2 = max(g.x, l.x);',
        '    vec3 x1 = x0 - i1 + C.xxx;',
        '    vec3 x2 = x0 - i2 + C.yyy;',
        '    vec3 x3 = x0 - D.yyy;',
        '    i = mod289(i);',
        '    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
        '    float n_ = 0.142857142857;',
        '    vec3 ns = n_ * D.wyz - D.xzx;',
        '    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
        '    vec4 x_ = floor(j * ns.z);',
        '    vec4 y_ = floor(j - 7.0 * x_);',
        '    vec4 x = x_ * ns.x + ns.yyyy;',
        '    vec4 y = y_ * ns.x + ns.yyyy;',
        '    vec4 h = 1.0 - abs(x) - abs(y);',
        '    vec4 b0 = vec4(x.xy, y.xy);',
        '    vec4 b1 = vec4(x.zw, y.zw);',
        '    vec4 s0 = floor(b0) * 2.0 + 1.0;',
        '    vec4 s1 = floor(b1) * 2.0 + 1.0;',
        '    vec4 sh = -step(h, vec4(0.0));',
        '    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;',
        '    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;',
        '    vec3 p0 = vec3(a0.xy, h.x);',
        '    vec3 p1 = vec3(a0.zw, h.y);',
        '    vec3 p2 = vec3(a1.xy, h.z);',
        '    vec3 p3 = vec3(a1.zw, h.w);',
        '    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));',
        '    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
        '    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);', // Arreglado
        '    m = m * m;',
        '    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));',
        '}',

        'float prng(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',

        'void main(void) {',
        '    float aspect = uResolution.x / uResolution.y;',
        '    vec2 pinPosition = (vUv0 * 2.0 - 1.0) * vec2(aspect, 1.0);',
        '    vec2 coord = pinPosition;',
        '    float clip = 210.0;',
        '    float ypartClip = coord.y / clip;',
        '    float ypartClippedFalloff = clamp(2.0 - ypartClip, 0.0, 1.0);',
        '    float ypartClipped = min(ypartClip, 1.0);',
        '    float ypartClippedn = 1.0 - ypartClipped;',
        '    float xfuel = 1.0 - abs(2.0 * vUv0.x - 1.0);',
        '    float realTime = uSpeed * uTime;', // Usando uSpeed inyectado
        '    vec2 coordScaled = uDensity * coord.xy;', // Usando uDensity inyectado
        '    vec3 position = vec3(coordScaled, 0.0) + vec3(1223.0, 6443.0, 8425.0);',
        '    vec3 flow = vec3(4.1 * (0.5 - vUv0.x) * pow(ypartClippedn, 4.0), -2.0 * xfuel * pow(ypartClippedn, 64.0), 0.0);',
        '    vec3 timing = realTime * vec3(0.0, -1.7 * uStrength, 1.1);',
        '    vec3 displacePos = 1.5 * position + realTime * vec3(0.01, -0.7, 1.3);',
        '    float n3 = snoise(displacePos);',
        '    vec3 noiseCoord = position * 2.0 + timing + 0.4 * vec3(n3, n3, n3);',
        '    float noise = snoise(noiseCoord);',
        '    float flames = pow(ypartClipped, 0.3 * xfuel) * pow(noise, 0.3 * xfuel);',
        '    float f = ypartClippedFalloff * pow(1.0 - flames*flames*flames*flames, 8.0);',
        '    float fff = f * f * f;',
        '    vec3 fire = uIntensity * vec3(f, fff, fff * fff);',
        '    float sparkGridSize = uWidth * 10.0;',
        '    vec2 sparkCoord = coord.xy - vec2(0.0, 190.0 * realTime);',
        '    sparkCoord -= 30.0 * snoise(0.01 * vec3(sparkCoord, 30.0 * realTime));',
        '    sparkCoord += 100.0 * flow.xy;',
        '    if (mod(sparkCoord.y / sparkGridSize, 2.0) < 1.0) sparkCoord.x += 0.5 * sparkGridSize;',
        '    vec2 sparkGridIndex = vec2(floor(sparkCoord / sparkGridSize));',
        '    float sparkRandom = prng(sparkGridIndex);',
        '    float sparkLife = min(10.0 * (1.0 - min((sparkGridIndex.y + (190.0 * realTime / sparkGridSize) / (24.0 - 20.0 * sparkRandom), 1.0)), 1.0);',
        '    vec3 sparks = vec3(0.0);',
        '    if (sparkLife > 0.0) {',
        '        float sparkSize = xfuel * xfuel * sparkRandom * 0.08;',
        '        float sparkRadians = 999.0 * sparkRandom * 2.0 * PI + 2.0 * realTime;',
        '        vec2 sparkCircular = vec2(sin(sparkRadians), cos(sparkRadians));',
        '        vec2 sparkOffset = (0.5 - sparkSize) * sparkGridSize * sparkCircular;',
        '        vec2 sparkModules = mod(sparkCoord + sparkOffset, sparkGridSize) - 0.5 * vec2(sparkGridSize);',
        '        float sparkLength = length(sparkModules);',
        '        float sparksGray = max(0.0, 1.0 - sparkLength / (sparkSize * sparkGridSize));',
        '        sparks = sparkLife * sparksGray * vec3(1.0, 0.3, 0.0);',
        '    }',
        '    vec3 color = max(fire, sparks);',
        '    float gray = dot(color, vec3(0.3, 0.59, 0.11));',
        '    gl_FragColor = vec4(mix(vec3(gray), color, clamp(uColor, 0.0, 1.0)), 1.0);',
        '}'
    ].join('\n');

    this.material = new pc.ShaderMaterial({
        uniqueName: 'FirePlaneShader',
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aUv0: pc.SEMANTIC_TEXCOORD0
        },
        vertexGLSL: vs,
        fragmentGLSL: fs[this.shaderType]
    });

    this.material.depthWrite = false;

    this.entity.render.material = this.material;

    this._applyMaterialState();
    this.material.update();
};

FirePlane.prototype._applyMaterialState = function () {
    this.material.setParameter('uTime', this.time);

    switch (this.shaderType) {
        case "fire":
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
    this.time += dt;

    if (this.material) {
        this._applyMaterialState();
    }

    var camPos = this.cameraEntity.getPosition();
    var pos = this.entity.getPosition();

    var dx = camPos.x - pos.x;
    var dz = camPos.z - pos.z;

    var angleY = -Math.atan2(dx, -dz) * pc.math.RAD_TO_DEG;

    this.entity.setEulerAngles(-90, angleY, 0);

};