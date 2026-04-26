var FirePlane = pc.createScript('firePlane');

FirePlane.attributes.add('intensity', {
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    precision: 2,
    step: 0.01
});

FirePlane.attributes.add('strength', {
    type: 'number',
    default: 1,
    min: 0,
    max: 5,
    precision: 3,
    step: 0.001
});

FirePlane.attributes.add('power', {
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    precision: 3,
    step: 0.001
});

FirePlane.attributes.add('range', {
    type: 'number',
    default: 5,
    min: 0,
    max: 5,
    precision: 3,
    step: 0.001
});

FirePlane.attributes.add('width', {
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    precision: 2,
    step: 0.01
});

FirePlane.attributes.add('color', {
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    precision: 1,
    step: 0.1
});

FirePlane.attributes.add('opacityMode', {
    type: 'number',
    default: 0,
    enum: [
        { 'ADDITIVE': 0 },
        { 'NORMAL': 1 }
    ]
});

FirePlane.attributes.add('cullFace', {
    type: 'number',
    default: 0,
    enum: [
        { 'NONE': 0 },
        { 'BACK': 1 },
        { 'FRONT': 2 }
    ]
});

FirePlane.prototype.initialize = function () {
    if (!this.entity.render) {
        this.entity.addComponent('render', { type: 'plane' });
    }

    this.entity.render.castShadows = false;
    this.entity.render.receiveShadows = false;

    this.time = 0;

    var vs = [
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

    var fs = [
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

    this.material = new pc.ShaderMaterial({
        uniqueName: 'FirePlaneShader',
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aUv0: pc.SEMANTIC_TEXCOORD0
        },
        vertexGLSL: vs,
        fragmentGLSL: fs
    });

    this.material.depthWrite = false;

    this.entity.render.material = this.material;

    this._applyMaterialState();
    this.material.update();
};

FirePlane.prototype._applyMaterialState = function () {
    this.material.setParameter('uTime', this.time);
    this.material.setParameter('uIntensity', this.intensity);
    this.material.setParameter('uStrength', this.strength);
    this.material.setParameter('uPower', this.power);
    this.material.setParameter('uRange', this.range);
    this.material.setParameter('uWidth', this.width);
    this.material.setParameter('uColor', this.color);

    this.material.blendType = (this.opacityMode === 0) ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL;

    if (this.cullFace === 1) {
        this.material.cull = pc.CULLFACE_BACK;
    } else if (this.cullFace === 2) {
        this.material.cull = pc.CULLFACE_FRONT;
    } else {
        this.material.cull = pc.CULLFACE_NONE;
    }
};

FirePlane.prototype.update = function (dt) {
    this.time += dt;

    if (this.material) {
        this._applyMaterialState();
    }
};