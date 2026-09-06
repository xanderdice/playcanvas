/* posteffect-volumetriclight.js — Luz volumétrica (god rays) para PlayCanvas 2.x
   (patrón oficial: pc.PostEffect + pc.ShaderUtils.createShader + drawQuad).

   TÉCNICA (screen-space light shafts, la única viable en gama baja):
     1. BRIGHT-PASS ENMASCARADO a un RT de 1/4 x 1/4 (RGBA8): umbral de
        luminancia con rodilla suave x máscara radial alrededor de la posición
        de la luz EN PANTALLA (los brillos lejanos a la luz no generan rayos).
        La OCLUSIÓN sale gratis: lo que tapa la luz queda oscuro y no emite.
     2. BLUR RADIAL ITERATIVO hacia la luz: 3 pases ping-pong de 6 taps con
        alcance x6 por pase (equivale a ~216 taps) sobre el RT chico.
     3. COMPOSITE aditivo: escena + rayos * tinte * intensidad * fade.

   La posición de la luz se proyecta en CPU cada frame (matrices de la cámara,
   sin allocs). Si la luz queda fuera de pantalla o detrás de la cámara, el
   efecto se desvanece y los pases de rayos SE SALTAN (solo queda el blit).

   Coste por frame: 5 draws (3 diminutos), RGBA8, sin float, sin depth, cero
   basura GC (scopes y Float32Array pre-resueltos). Igual que el flare
   anamórfico ya validado en este proyecto.

   BACKENDS: WebGL2 y WGSL nativo para WebGPU (doble fuente; el transpilador
   GLSL->WGSL del engine requiere WASM externos que un build standalone no
   tiene y pesan demasiado para móvil).

   USO: agregar el script 'volumetricLight' a la ENTIDAD DE LA CÁMARA y
   asignar 'source' (entidad de la luz: sol direccional, lámpara, o cualquier
   entidad con algo BRILLANTE renderizado en su posición).

   Atributos: source, intensity, threshold, tint, rayLength. */

/* =========================================================
   EFECTO (pc.PostEffect)
   ========================================================= */

/* clase ES6: pc.PostEffect es clase en 2.x y no admite el patrón viejo
   pc.PostEffect.call(this, ...) — "Class constructor cannot be invoked
   without 'new'". extends funciona con padre clase O función. */
class VolumetricLightEffect extends pc.PostEffect {

    constructor(graphicsDevice) {
    super(graphicsDevice);

    this.needsDepthBuffer = false;

    /* parámetros (los sincroniza el script) */
    this.intensity = 1.0;
    this.threshold = 0.6;
    this.rayLength = 0.6;
    this._tint = new Float32Array([1.0, 0.95, 0.85]);

    /* referencias que setea el script */
    this.cameraComponent = null;
    this.sourceEntity = null;

    /* constantes del blur radial */
    this._decay = 0.86;                 // atenuación por tap
    this._radius = 0.75;                // radio de la máscara radial (UV)

    /* scratch pre-alocado (cero basura GC por frame) */
    this._texel = new Float32Array(2);
    this._threshParams = new Float32Array(2);
    this._lightUV = new Float32Array(2);
    this._aspect = new Float32Array(2);
    this._tintFinal = new Float32Array(3);
    this._vpMat = new pc.Mat4();
    this._sunPos = new pc.Vec3();

    /* vertex quad: GLSL del engine + WGSL propio (en WebGPU la fila 0 de una
       textura renderizada es el TOP, por eso v = 0.5 - y*0.5) */
    var vs = pc.PostEffect.quadVertexShader;
    var vsWGSL = [
        'attribute aPosition: vec2f;',
        '',
        'varying vUv0: vec2f;',
        '',
        '@vertex',
        'fn vertexMain(input: VertexInput) -> VertexOutput {',
        '    var output: VertexOutput;',
        '    output.position = vec4f(input.aPosition, 0.0, 1.0);',
        '    output.vUv0 = vec2f(input.aPosition.x * 0.5 + 0.5, 0.5 - input.aPosition.y * 0.5);',
        '    return output;',
        '}'
    ].join('\n');

    this._maskShader = pc.ShaderUtils.createShader(graphicsDevice, {
        uniqueName: 'VolumetricMaskShader',
        attributes: { aPosition: pc.SEMANTIC_POSITION },
        vertexGLSL: vs,
        vertexWGSL: vsWGSL,
        fragmentGLSL: [
            'varying vec2 vUv0;',
            'uniform sampler2D uColorBuffer;',
            'uniform vec2 uTexel;',
            'uniform vec2 uThreshParams;',
            'uniform vec2 uLightUV;',
            'uniform vec2 uAspect;',
            'uniform float uRadius;',
            '',
            'void main(void) {',
            '    vec3 c = texture2D(uColorBuffer, vUv0 + uTexel * vec2(-0.5, -0.5)).rgb;',
            '    c += texture2D(uColorBuffer, vUv0 + uTexel * vec2( 0.5, -0.5)).rgb;',
            '    c += texture2D(uColorBuffer, vUv0 + uTexel * vec2(-0.5,  0.5)).rgb;',
            '    c += texture2D(uColorBuffer, vUv0 + uTexel * vec2( 0.5,  0.5)).rgb;',
            '    c *= 0.25;',
            '    float lum = dot(c, vec3(0.299, 0.587, 0.114));',
            '    float m = clamp((lum - uThreshParams.x) * uThreshParams.y, 0.0, 1.0);',
            '    m *= m;',
            '    float d = length((vUv0 - uLightUV) * uAspect);',
            '    float radial = clamp(1.0 - d / uRadius, 0.0, 1.0);',
            '    gl_FragColor = vec4(c * (m * radial * radial), 1.0);',
            '}'
        ].join('\n'),
        fragmentWGSL: [
            'varying vUv0: vec2f;',
            '',
            'uniform uTexel: vec2f;',
            'uniform uThreshParams: vec2f;',
            'uniform uLightUV: vec2f;',
            'uniform uAspect: vec2f;',
            'uniform uRadius: f32;',
            '',
            'var uColorBuffer: texture_2d<f32>;',
            'var uColorBufferSampler: sampler;',
            '',
            '@fragment',
            'fn fragmentMain(input: FragmentInput) -> FragmentOutput {',
            '    var output: FragmentOutput;',
            '    var c: vec3f = textureSample(uColorBuffer, uColorBufferSampler, input.vUv0 + uniform.uTexel * vec2f(-0.5, -0.5)).rgb;',
            '    c += textureSample(uColorBuffer, uColorBufferSampler, input.vUv0 + uniform.uTexel * vec2f( 0.5, -0.5)).rgb;',
            '    c += textureSample(uColorBuffer, uColorBufferSampler, input.vUv0 + uniform.uTexel * vec2f(-0.5,  0.5)).rgb;',
            '    c += textureSample(uColorBuffer, uColorBufferSampler, input.vUv0 + uniform.uTexel * vec2f( 0.5,  0.5)).rgb;',
            '    c *= 0.25;',
            '    let lum: f32 = dot(c, vec3f(0.299, 0.587, 0.114));',
            '    var m: f32 = clamp((lum - uniform.uThreshParams.x) * uniform.uThreshParams.y, 0.0, 1.0);',
            '    m = m * m;',
            '    let d: f32 = length((input.vUv0 - uniform.uLightUV) * uniform.uAspect);',
            '    let radial: f32 = clamp(1.0 - d / uniform.uRadius, 0.0, 1.0);',
            '    output.color = vec4f(c * (m * radial * radial), 1.0);',
            '    return output;',
            '}'
        ].join('\n')
    });

    this._raysShader = pc.ShaderUtils.createShader(graphicsDevice, {
        uniqueName: 'VolumetricRaysShader',
        attributes: { aPosition: pc.SEMANTIC_POSITION },
        vertexGLSL: vs,
        vertexWGSL: vsWGSL,
        fragmentGLSL: [
            'varying vec2 vUv0;',
            'uniform sampler2D uColorBuffer;',
            'uniform vec2 uLightUV;',
            'uniform float uStep;',
            'uniform float uDecay;',
            '',
            'void main(void) {',
            '    vec2 delta = (uLightUV - vUv0) * uStep;',
            '    vec2 uv = vUv0;',
            '    vec3 c = texture2D(uColorBuffer, uv).rgb;',
            '    float w = 1.0;',
            '    float total = 1.0;',
            '    uv += delta; w *= uDecay; c += texture2D(uColorBuffer, uv).rgb * w; total += w;',
            '    uv += delta; w *= uDecay; c += texture2D(uColorBuffer, uv).rgb * w; total += w;',
            '    uv += delta; w *= uDecay; c += texture2D(uColorBuffer, uv).rgb * w; total += w;',
            '    uv += delta; w *= uDecay; c += texture2D(uColorBuffer, uv).rgb * w; total += w;',
            '    uv += delta; w *= uDecay; c += texture2D(uColorBuffer, uv).rgb * w; total += w;',
            '    gl_FragColor = vec4(c / total, 1.0);',
            '}'
        ].join('\n'),
        fragmentWGSL: [
            'varying vUv0: vec2f;',
            '',
            'uniform uLightUV: vec2f;',
            'uniform uStep: f32;',
            'uniform uDecay: f32;',
            '',
            'var uColorBuffer: texture_2d<f32>;',
            'var uColorBufferSampler: sampler;',
            '',
            '@fragment',
            'fn fragmentMain(input: FragmentInput) -> FragmentOutput {',
            '    var output: FragmentOutput;',
            '    let delta: vec2f = (uniform.uLightUV - input.vUv0) * uniform.uStep;',
            '    var uv: vec2f = input.vUv0;',
            '    var c: vec3f = textureSample(uColorBuffer, uColorBufferSampler, uv).rgb;',
            '    var w: f32 = 1.0;',
            '    var total: f32 = 1.0;',
            '    uv += delta; w *= uniform.uDecay; c += textureSample(uColorBuffer, uColorBufferSampler, uv).rgb * w; total += w;',
            '    uv += delta; w *= uniform.uDecay; c += textureSample(uColorBuffer, uColorBufferSampler, uv).rgb * w; total += w;',
            '    uv += delta; w *= uniform.uDecay; c += textureSample(uColorBuffer, uColorBufferSampler, uv).rgb * w; total += w;',
            '    uv += delta; w *= uniform.uDecay; c += textureSample(uColorBuffer, uColorBufferSampler, uv).rgb * w; total += w;',
            '    uv += delta; w *= uniform.uDecay; c += textureSample(uColorBuffer, uColorBufferSampler, uv).rgb * w; total += w;',
            '    output.color = vec4f(c / total, 1.0);',
            '    return output;',
            '}'
        ].join('\n')
    });

    this._compositeShader = pc.ShaderUtils.createShader(graphicsDevice, {
        uniqueName: 'VolumetricCompositeShader',
        attributes: { aPosition: pc.SEMANTIC_POSITION },
        vertexGLSL: vs,
        vertexWGSL: vsWGSL,
        fragmentGLSL: [
            'varying vec2 vUv0;',
            'uniform sampler2D uColorBuffer;',
            'uniform sampler2D uRaysBuffer;',
            'uniform vec3 uRaysTint;',
            '',
            'void main(void) {',
            '    vec4 scene = texture2D(uColorBuffer, vUv0);',
            '    vec3 rays = texture2D(uRaysBuffer, vUv0).rgb;',
            '    gl_FragColor = vec4(scene.rgb + rays * uRaysTint, scene.a);',
            '}'
        ].join('\n'),
        fragmentWGSL: [
            'varying vUv0: vec2f;',
            '',
            'uniform uRaysTint: vec3f;',
            '',
            'var uColorBuffer: texture_2d<f32>;',
            'var uColorBufferSampler: sampler;',
            'var uRaysBuffer: texture_2d<f32>;',
            'var uRaysBufferSampler: sampler;',
            '',
            '@fragment',
            'fn fragmentMain(input: FragmentInput) -> FragmentOutput {',
            '    var output: FragmentOutput;',
            '    let scene: vec4f = textureSample(uColorBuffer, uColorBufferSampler, input.vUv0);',
            '    let rays: vec3f = textureSample(uRaysBuffer, uRaysBufferSampler, input.vUv0).rgb;',
            '    output.color = vec4f(scene.rgb + rays * uniform.uRaysTint, scene.a);',
            '    return output;',
            '}'
        ].join('\n')
    });

    /* scopes resueltos UNA vez */
    var scope = graphicsDevice.scope;
    this._sColor = scope.resolve('uColorBuffer');
    this._sRays = scope.resolve('uRaysBuffer');
    this._sTexel = scope.resolve('uTexel');
    this._sThresh = scope.resolve('uThreshParams');
    this._sLightUV = scope.resolve('uLightUV');
    this._sAspect = scope.resolve('uAspect');
    this._sRadius = scope.resolve('uRadius');
    this._sStep = scope.resolve('uStep');
    this._sDecay = scope.resolve('uDecay');
    this._sTint = scope.resolve('uRaysTint');

    this._rtA = null;
    this._rtB = null;
    }

    _allocTargets(w, h) {
    this._destroyTargets();

    var device = this.device;
    var make = function (name) {
        var tex = new pc.Texture(device, {
            width: w,
            height: h,
            format: pc.PIXELFORMAT_RGBA8,
            mipmaps: false,
            minFilter: pc.FILTER_LINEAR,
            magFilter: pc.FILTER_LINEAR,
            addressU: pc.ADDRESS_CLAMP_TO_EDGE,
            addressV: pc.ADDRESS_CLAMP_TO_EDGE,
            name: name
        });
        return new pc.RenderTarget({ colorBuffer: tex, depth: false, name: name });
    };

    this._rtA = make('volumetricA');
    this._rtB = make('volumetricB');
    }

    _destroyTargets() {
    if (this._rtA) {
        this._rtA.colorBuffer.destroy();
        this._rtA.destroy();
        this._rtA = null;
    }
    if (this._rtB) {
        this._rtB.colorBuffer.destroy();
        this._rtB.destroy();
        this._rtB = null;
    }
    }

    /* Proyecta la fuente de luz a UV de pantalla (en el MISMO espacio de vUv0
       de cada backend) y devuelve el fade 0..1 (0 = detrás de cámara / muy
       afuera). Sin allocs: matrices y vectores scratch. */
    _projectLight() {
    var cam = this.cameraComponent;
    var src = this.sourceEntity;
    if (!cam || !src) return 0;

    var p = this._sunPos;
    if (src.light && src.light.type === 'directional') {
        /* sol virtual: opuesto a la dirección del rayo de luz (la luz viaja
           a lo largo de entity.forward), lejos de la cámara */
        var camPos = cam.entity.getPosition();
        var f = src.forward;
        var dist = cam.farClip * 0.5;
        p.set(camPos.x - f.x * dist, camPos.y - f.y * dist, camPos.z - f.z * dist);
    } else {
        p.copy(src.getPosition());
    }

    /* clip = viewProj * p (homogéneo, para detectar "detrás de cámara") */
    var m = this._vpMat.mul2(cam.projectionMatrix, cam.viewMatrix).data;
    var cx = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
    var cy = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
    var cw = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];

    /* !(x > eps) también atrapa NaN (canvas 0x0, matrices aún no válidas) */
    if (!(cw > 0.0001)) return 0;   /* detrás de la cámara o proyección inválida */

    var ndcx = cx / cw;
    var ndcy = cy / cw;
    if (!isFinite(ndcx) || !isFinite(ndcy)) return 0;

    /* UV en el espacio de muestreo del backend (WebGL: origen abajo;
       WebGPU con nuestro vertex: origen arriba) */
    this._lightUV[0] = ndcx * 0.5 + 0.5;
    this._lightUV[1] = this.device.isWebGPU ? (0.5 - ndcy * 0.5) : (ndcy * 0.5 + 0.5);

    /* fade suave al salir de pantalla (permite luz un poco fuera de cuadro) */
    var outX = Math.max(0, Math.abs(ndcx) - 1);
    var outY = Math.max(0, Math.abs(ndcy) - 1);
    var out = Math.max(outX, outY);
    return pc.math.clamp(1 - (out - 0.2) / 0.5, 0, 1);
    }

    render(inputTarget, outputTarget, rect) {
    var fade = this._projectLight();

    /* tinte final = tinte * intensidad * fade (CPU, cero coste GPU) */
    this._tintFinal[0] = this._tint[0] * this.intensity * fade;
    this._tintFinal[1] = this._tint[1] * this.intensity * fade;
    this._tintFinal[2] = this._tint[2] * this.intensity * fade;

    /* luz invisible: solo el blit de composite (uRaysTint = 0), sin pases */
    if (fade <= 0 || this.intensity <= 0) {
        this._tintFinal[0] = 0;
        this._tintFinal[1] = 0;
        this._tintFinal[2] = 0;
        /* uRaysBuffer necesita UNA textura válida aunque no se use */
        if (!this._rtA) this._allocTargets(8, 8);
        this._sColor.setValue(inputTarget.colorBuffer);
        this._sRays.setValue(this._rtA.colorBuffer);
        this._sTint.setValue(this._tintFinal);
        this.drawQuad(outputTarget, this._compositeShader, rect);
        return;
    }

    var sw = Math.max(8, Math.floor(inputTarget.width / 4));
    var sh = Math.max(8, Math.floor(inputTarget.height / 4));
    if (!this._rtA || this._rtA.width !== sw || this._rtA.height !== sh) {
        this._allocTargets(sw, sh);
    }

    /* --- 1. BRIGHT-PASS ENMASCARADO (input -> rtA, reducido) --- */
    this._texel[0] = 1.0 / inputTarget.width;
    this._texel[1] = 1.0 / inputTarget.height;
    this._threshParams[0] = this.threshold;
    this._threshParams[1] = 4.0;   /* 1/rodilla (0.25) */
    this._aspect[0] = inputTarget.width / inputTarget.height;
    this._aspect[1] = 1.0;

    this._sColor.setValue(inputTarget.colorBuffer);
    this._sTexel.setValue(this._texel);
    this._sThresh.setValue(this._threshParams);
    this._sLightUV.setValue(this._lightUV);
    this._sAspect.setValue(this._aspect);
    this._sRadius.setValue(this._radius);
    this.drawQuad(this._rtA, this._maskShader);

    /* --- 2. BLUR RADIAL ITERATIVO hacia la luz (rtA <-> rtB, 3 pases) ---
       cada pase cubre 5 taps de paso s, s*6, s*36 sobre el vector a la luz:
       alcance total ~R con coste de 18 taps sobre 1/16 del área */
    var reach = 0.3 + 0.7 * this.rayLength;   /* fracción del camino a la luz */
    var src = this._rtA;
    var dst = this._rtB;

    this._sDecay.setValue(this._decay);

    for (var i = 0, k = 1; i < 3; i++, k *= 6) {
        this._sStep.setValue(reach * k / (43 * 5));
        this._sColor.setValue(src.colorBuffer);
        this._sLightUV.setValue(this._lightUV);
        this.drawQuad(dst, this._raysShader);

        var tmp = src;
        src = dst;
        dst = tmp;
    }

    /* --- 3. COMPOSITE aditivo --- */
    this._sColor.setValue(inputTarget.colorBuffer);
    this._sRays.setValue(src.colorBuffer);
    this._sTint.setValue(this._tintFinal);
    this.drawQuad(outputTarget, this._compositeShader, rect);
    }
}


/* =========================================================
   SCRIPT (agregar a la entidad de la cámara)
   ========================================================= */

var VolumetricLight = pc.createScript('volumetricLight');

VolumetricLight.attributes.add('source', {
    type: 'entity',
    title: 'Light Source',
    description: 'Entidad de la luz (direccional = sol; si no, se usa su posición). Debe haber algo brillante renderizado ahí (sol, esfera emisiva...).'
});

VolumetricLight.attributes.add('intensity', {
    type: 'number', default: 1.0, min: 0, max: 4, precision: 2,
    title: 'Intensity',
    description: 'Fuerza de los rayos.'
});

VolumetricLight.attributes.add('threshold', {
    type: 'number', default: 0.6, min: 0, max: 1, precision: 2,
    title: 'Threshold',
    description: 'Luminancia mínima que emite rayos (rodilla suave).'
});

VolumetricLight.attributes.add('tint', {
    type: 'rgb', default: [1.0, 0.95, 0.85],
    title: 'Tint',
    description: 'Color de los rayos (cálido por defecto).'
});

VolumetricLight.attributes.add('rayLength', {
    type: 'number', default: 0.6, min: 0, max: 1, precision: 2,
    title: 'Ray Length',
    description: 'Longitud de los rayos hacia afuera de la luz.'
});

VolumetricLight.prototype.initialize = function () {
    if (!this.entity.camera) {
        console.warn('volumetricLight: la entidad no tiene componente camera');
        return;
    }

    try {
        this.effect = new VolumetricLightEffect(this.app.graphicsDevice);
    } catch (e) {
        console.warn('volumetricLight: no se pudieron crear los shaders; efecto desactivado', e);
        return;
    }
    this.effect.cameraComponent = this.entity.camera;
    this._syncParams();

    var queue = this.entity.camera.postEffects;
    queue.addEffect(this.effect);

    this.on('state', function (enabled) {
        if (enabled) {
            queue.addEffect(this.effect);
        } else {
            queue.removeEffect(this.effect);
        }
    });

    this.on('destroy', function () {
        queue.removeEffect(this.effect);
        this.effect._destroyTargets();
    });

    this.on('attr:source', this._syncParams, this);
    this.on('attr:intensity', this._syncParams, this);
    this.on('attr:threshold', this._syncParams, this);
    this.on('attr:tint', this._syncParams, this);
    this.on('attr:rayLength', this._syncParams, this);
};

/* atributos rgb son pc.Color (.r/.g/.b, no indexables como array) */
VolumetricLight.prototype._syncParams = function () {
    if (!this.effect) return;
    var e = this.effect;
    e.sourceEntity = this.source || null;
    e.intensity = Math.max(+this.intensity || 0, 0);
    e.threshold = pc.math.clamp(+this.threshold || 0, 0, 1);
    e.rayLength = pc.math.clamp(+this.rayLength || 0, 0, 1);
    var t = this.tint;
    e._tint[0] = t.r;
    e._tint[1] = t.g;
    e._tint[2] = t.b;
};
