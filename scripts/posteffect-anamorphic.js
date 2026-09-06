/* posteffect-anamorphic.js — Anamorphic Lens Flare para PlayCanvas 2.x
   (patrón oficial: pc.PostEffect + pc.ShaderUtils.createShader + drawQuad).

   Los brillos de la escena se estiran en un destello HORIZONTAL con tinte
   (azul clásico de lente anamórfica). Pipeline, pensado para gama baja:

     1. BRIGHT-PASS a un RT de 1/4 x 1/4 (RGBA8): umbral con rodilla suave +
        box de 4 taps bilineales (estable, sin parpadeo).
     2. STREAK horizontal ITERATIVO (estilo Kawase): 3 pases ping-pong de
        5 taps sobre el RT chico, con paso que crece x4 por pase -> kernel
        efectivo de cientos de píxeles pagando 15 taps en 1/16 del área.
     3. COMPOSITE aditivo: escena + destello * tinte * intensidad (el RT chico
        se re-amplía gratis con el filtrado bilineal).

   Coste total por frame: 5 draws (3 de ellos diminutos), formato RGBA8, sin
   float, sin depth, cero allocs por frame (uniforms y scopes pre-resueltos).

   Uso: agregar el script a la ENTIDAD DE LA CÁMARA.

   BACKENDS: WebGL2 y WebGPU con UNA sola fuente GLSL — el engine 2.x
   transpila GLSL -> WGSL automáticamente para shaders de usuario, y ese
   conversor evoluciona con cada versión del engine (nada que mantener aquí).

   Atributos: intensity, threshold, tint, streakLength. */

/* =========================================================
   EFECTO (pc.PostEffect)
   ========================================================= */

/* pc.PostEffect es clase ES6 en 2.x: hay que extender, no .call() */
class AnamorphicEffect extends pc.PostEffect {
    constructor(graphicsDevice) {
    super(graphicsDevice);

    this.needsDepthBuffer = false;

    /* parámetros (los sincroniza el script) */
    this.intensity = 1.0;
    this.threshold = 0.75;
    this.streakLength = 0.5;
    this._tintIntensity = new Float32Array([0.3, 0.55, 1.0]);

    /* constantes del streak: atenuación por tap y normalización */
    this._atten = 0.85;
    this._weights = new Float32Array([this._atten, this._atten * this._atten]);
    this._invTotal = 1.0 / (1.0 + 2.0 * this._weights[0] + 2.0 * this._weights[1]);

    /* scratch pre-alocado (cero basura GC por frame) */
    this._texel = new Float32Array(2);
    this._offset = new Float32Array(2);
    this._threshParams = new Float32Array(2);

    /* DOBLE FUENTE nativa (GLSL para WebGL2, WGSL para WebGPU):
       el transpilador GLSL->WGSL del engine requiere los WASM glslang/twgsl
       pasados al crear el device (el editor los provee, un build standalone
       no, y pesan cientos de KB: veneno para gama baja). Con ambas fuentes,
       ShaderUtils.createShader usa la nativa de cada backend, sin deps.
       El vertex WGSL es propio (pc.PostEffect.quadVertexShader es solo GLSL):
       en WebGPU la fila 0 de una textura renderizada es el TOP, por eso
       v = 0.5 - y*0.5 (equivale al getImageEffectUV del GLSL). */
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

    this._brightShader = pc.ShaderUtils.createShader(graphicsDevice, {
        uniqueName: 'AnamorphicBrightShader',
        attributes: { aPosition: pc.SEMANTIC_POSITION },
        vertexGLSL: vs,
        vertexWGSL: vsWGSL,
        fragmentWGSL: [
            'varying vUv0: vec2f;',
            '',
            'uniform uTexel: vec2f;',
            'uniform uThreshParams: vec2f;',
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
            '    output.color = vec4f(c * m, 1.0);',
            '    return output;',
            '}'
        ].join('\n'),
        fragmentGLSL: [
            'varying vec2 vUv0;',
            'uniform sampler2D uColorBuffer;',
            'uniform vec2 uTexel;',
            'uniform vec2 uThreshParams;',
            '',
            'void main(void) {',
            '    vec3 c = texture2D(uColorBuffer, vUv0 + uTexel * vec2(-0.5, -0.5)).rgb;',
            '    c += texture2D(uColorBuffer, vUv0 + uTexel * vec2( 0.5, -0.5)).rgb;',
            '    c += texture2D(uColorBuffer, vUv0 + uTexel * vec2(-0.5,  0.5)).rgb;',
            '    c += texture2D(uColorBuffer, vUv0 + uTexel * vec2( 0.5,  0.5)).rgb;',
            '    c *= 0.25;',
            '    float lum = dot(c, vec3(0.299, 0.587, 0.114));',
            /* rodilla suave cuadrática: sin corte duro que parpadee */
            '    float m = clamp((lum - uThreshParams.x) * uThreshParams.y, 0.0, 1.0);',
            '    m *= m;',
            '    gl_FragColor = vec4(c * m, 1.0);',
            '}'
        ].join('\n')
    });

    this._streakShader = pc.ShaderUtils.createShader(graphicsDevice, {
        uniqueName: 'AnamorphicStreakShader',
        attributes: { aPosition: pc.SEMANTIC_POSITION },
        vertexGLSL: vs,
        vertexWGSL: vsWGSL,
        fragmentWGSL: [
            'varying vUv0: vec2f;',
            '',
            'uniform uOffset: vec2f;',
            'uniform uWeights: vec2f;',
            'uniform uInvTotal: f32;',
            '',
            'var uColorBuffer: texture_2d<f32>;',
            'var uColorBufferSampler: sampler;',
            '',
            '@fragment',
            'fn fragmentMain(input: FragmentInput) -> FragmentOutput {',
            '    var output: FragmentOutput;',
            '    var c: vec3f = textureSample(uColorBuffer, uColorBufferSampler, input.vUv0).rgb;',
            '    c += (textureSample(uColorBuffer, uColorBufferSampler, input.vUv0 + uniform.uOffset).rgb +',
            '          textureSample(uColorBuffer, uColorBufferSampler, input.vUv0 - uniform.uOffset).rgb) * uniform.uWeights.x;',
            '    c += (textureSample(uColorBuffer, uColorBufferSampler, input.vUv0 + uniform.uOffset * 2.0).rgb +',
            '          textureSample(uColorBuffer, uColorBufferSampler, input.vUv0 - uniform.uOffset * 2.0).rgb) * uniform.uWeights.y;',
            '    output.color = vec4f(c * uniform.uInvTotal, 1.0);',
            '    return output;',
            '}'
        ].join('\n'),
        fragmentGLSL: [
            'varying vec2 vUv0;',
            'uniform sampler2D uColorBuffer;',
            'uniform vec2 uOffset;',
            'uniform vec2 uWeights;',
            'uniform float uInvTotal;',
            '',
            'void main(void) {',
            '    vec3 c = texture2D(uColorBuffer, vUv0).rgb;',
            '    c += (texture2D(uColorBuffer, vUv0 + uOffset).rgb +',
            '          texture2D(uColorBuffer, vUv0 - uOffset).rgb) * uWeights.x;',
            '    c += (texture2D(uColorBuffer, vUv0 + uOffset * 2.0).rgb +',
            '          texture2D(uColorBuffer, vUv0 - uOffset * 2.0).rgb) * uWeights.y;',
            '    gl_FragColor = vec4(c * uInvTotal, 1.0);',
            '}'
        ].join('\n')
    });

    this._compositeShader = pc.ShaderUtils.createShader(graphicsDevice, {
        uniqueName: 'AnamorphicCompositeShader',
        attributes: { aPosition: pc.SEMANTIC_POSITION },
        vertexGLSL: vs,
        fragmentGLSL: [
            'varying vec2 vUv0;',
            'uniform sampler2D uColorBuffer;',
            'uniform sampler2D uFlareBuffer;',
            'uniform vec3 uTint;',
            '',
            'void main(void) {',
            '    vec4 scene = texture2D(uColorBuffer, vUv0);',
            '    vec3 flare = texture2D(uFlareBuffer, vUv0).rgb;',
            '    gl_FragColor = vec4(scene.rgb + flare * uTint, scene.a);',
            '}'
        ].join('\n')
    });

    /* scopes resueltos UNA vez (resolve por frame cuesta) */
    var scope = graphicsDevice.scope;
    this._sColor = scope.resolve('uColorBuffer');
    this._sFlare = scope.resolve('uFlareBuffer');
    this._sTexel = scope.resolve('uTexel');
    this._sThresh = scope.resolve('uThreshParams');
    this._sOffset = scope.resolve('uOffset');
    this._sWeights = scope.resolve('uWeights');
    this._sInvTotal = scope.resolve('uInvTotal');
    this._sTint = scope.resolve('uTint');

    this._rtA = null;
    this._rtB = null;
    }

    /* RTs chicos (1/4 x 1/4, RGBA8, bilineal, clamp). Se (re)crean lazy cuando
       cambia el tamaño del backbuffer. */
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

    this._rtA = make('anamorphicA');
    this._rtB = make('anamorphicB');
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

    render(inputTarget, outputTarget, rect) {
    var sw = Math.max(8, Math.floor(inputTarget.width / 4));
    var sh = Math.max(8, Math.floor(inputTarget.height / 4));
    if (!this._rtA || this._rtA.width !== sw || this._rtA.height !== sh) {
        this._allocTargets(sw, sh);
    }

    /* --- 1. BRIGHT-PASS (input -> rtA, reducido) --- */
    this._texel[0] = 1.0 / inputTarget.width;
    this._texel[1] = 1.0 / inputTarget.height;
    this._threshParams[0] = this.threshold;
    this._threshParams[1] = 4.0;   /* 1/rodilla (0.25): transición suave */

    this._sColor.setValue(inputTarget.colorBuffer);
    this._sTexel.setValue(this._texel);
    this._sThresh.setValue(this._threshParams);
    this.drawQuad(this._rtA, this._brightShader);

    /* --- 2. STREAK horizontal iterativo (rtA <-> rtB, 4 pases) ---
       paso en texels: 1, 3, 9, 27 (x escala de longitud): crecimiento x3 =
       falloff suave sin escalones, alcance efectivo de cientos de píxeles con
       20 taps en total sobre un RT de 1/16 del área */
    var lengthScale = 0.5 + 1.5 * this.streakLength;
    var texelW = 1.0 / sw;
    var src = this._rtA;
    var dst = this._rtB;

    this._sWeights.setValue(this._weights);
    this._sInvTotal.setValue(this._invTotal);
    this._offset[1] = 0.0;

    for (var i = 0, stride = 1; i < 4; i++, stride *= 3) {
        this._offset[0] = texelW * stride * lengthScale;
        this._sColor.setValue(src.colorBuffer);
        this._sOffset.setValue(this._offset);
        this.drawQuad(dst, this._streakShader);

        var tmp = src;
        src = dst;
        dst = tmp;
    }

    /* --- 3. COMPOSITE aditivo (escena + destello) --- */
    this._sColor.setValue(inputTarget.colorBuffer);
    this._sFlare.setValue(src.colorBuffer);
    this._sTint.setValue(this._tintIntensity);
    this.drawQuad(outputTarget, this._compositeShader, rect);
    }
}


/* =========================================================
   SCRIPT (agregar a la entidad de la cámara)
   ========================================================= */

var AnamorphicFlare = pc.createScript('anamorphicFlare');

AnamorphicFlare.attributes.add('intensity', {
    type: 'number', default: 1.5, min: 0, max: 4, precision: 2,
    title: 'Intensity',
    description: 'Fuerza del destello (multiplica al tinte).'
});

AnamorphicFlare.attributes.add('threshold', {
    type: 'number', default: 0.75, min: 0, max: 1, precision: 2,
    title: 'Threshold',
    description: 'Luminancia mínima que genera destello (rodilla suave).'
});

AnamorphicFlare.attributes.add('tint', {
    type: 'rgb', default: [0.3, 0.55, 1.0],
    title: 'Tint',
    description: 'Color del destello (azul = anamórfico clásico).'
});

AnamorphicFlare.attributes.add('streakLength', {
    type: 'number', default: 0.5, min: 0, max: 1, precision: 2,
    title: 'Streak Length',
    description: 'Longitud del trazo horizontal.'
});

AnamorphicFlare.prototype.initialize = function () {
    if (!this.entity.camera) {
        console.warn('anamorphicFlare: la entidad no tiene componente camera');
        return;
    }

    /* WebGL y WebGPU con UNA sola fuente GLSL: el engine 2.x transpila
       GLSL -> WGSL automáticamente para shaders de usuario (y ese conversor
       evoluciona con el engine: nada que mantener acá). El try/catch degrada
       con aviso si algún build no pudiera crear los shaders. */
    try {
        this.effect = new AnamorphicEffect(this.app.graphicsDevice);
    } catch (e) {
        console.warn('anamorphicFlare: no se pudieron crear los shaders; efecto desactivado', e);
        return;
    }
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

    this.on('attr:intensity', this._syncParams, this);
    this.on('attr:threshold', this._syncParams, this);
    this.on('attr:tint', this._syncParams, this);
    this.on('attr:streakLength', this._syncParams, this);
};

/* tinte * intensidad precalculado en CPU (atributos rgb son pc.Color:
   .r/.g/.b, no indexables como array) */
AnamorphicFlare.prototype._syncParams = function () {
    if (!this.effect) return;
    var e = this.effect;
    e.threshold = pc.math.clamp(+this.threshold || 0, 0, 1);
    e.streakLength = pc.math.clamp(+this.streakLength || 0, 0, 1);
    var t = this.tint;
    var k = Math.max(+this.intensity || 0, 0);
    e._tintIntensity[0] = t.r * k;
    e._tintIntensity[1] = t.g * k;
    e._tintIntensity[2] = t.b * k;
};
