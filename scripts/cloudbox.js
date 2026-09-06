/* cloudbox.js — Niebla/nube volumétrica DENTRO de una caja (PlayCanvas 2.x)

   USO: poné una BOX en la escena (entidad con render box; si no tiene render,
   el script se lo crea) y agregale el script 'cloudBox'. La nube vive dentro
   de los límites de la caja (escala/rotación/posición de la entidad) y se ve
   también DESDE ADENTRO (se renderizan las caras traseras: el volumen no
   desaparece al internarse).

   TÉCNICA (pensada para móviles de muy baja gama):
   - Ray-march ANALÍTICO en espacio LOCAL de la caja: entrada/salida por
     slab-test (sin geometría extra, sin depth-map, sin posteffect).
   - 8 pasos fijos, UNA sola lectura de textura por paso: el fbm (4 octavas)
     va PRE-HORNEADO en una textura de ruido 64x64 generada una vez en CPU;
     el shader no calcula octavas. Jitter del arranque para ocultar banding.
   - Pseudo-3D: la Y desplaza la UV del ruido 2D (nada de texturas 3D).
   - Bordes SUAVES hacia las 6 paredes (la nube se desvanece antes de tocar
     la caja: no se ve el contorno del box) + iluminación fake por altura.
   - 1 draw call, sin float textures, ALU mínima (2 dot de setup, MADs).

   BACKENDS: WebGL2 (GLSL) y WebGPU (WGSL) con DOBLE FUENTE NATIVA en
   pc.ShaderMaterial. Nota: el transpilador del engine solo va GLSL->WGSL y
   exige los WASM glslang/twgsl (que un build standalone no carga y pesan
   demasiado para móvil); WGSL->GLSL no existe. Doble fuente = cero
   dependencias y cada backend compila su lenguaje nativo.

   LÍMITE conocido (precio de la gama baja): sin lectura de depth, un objeto
   sólido METIDO DENTRO de la caja oculta toda la niebla de su píxel (no solo
   la de atrás). Para volúmenes decorativos no se nota.

   Atributos: cloudColor, density, softness, windSpeed, camera (opcional). */

var CloudBox = pc.createScript('cloudBox');

CloudBox.attributes.add('cloudColor', {
    type: 'rgb', default: [0.92, 0.94, 0.98],
    title: 'Cloud Color',
    description: 'Color base de la nube.'
});

CloudBox.attributes.add('density', {
    type: 'number', default: 0.6, min: 0, max: 1, precision: 2,
    title: 'Density',
    description: 'Cuánta nube llena la caja (0 = tenue, 1 = espesa).'
});

CloudBox.attributes.add('softness', {
    type: 'number', default: 0.5, min: 0, max: 1, precision: 2,
    title: 'Softness',
    description: 'Desvanecimiento hacia las paredes de la caja.'
});

CloudBox.attributes.add('windSpeed', {
    type: 'number', default: 0.3, min: 0, max: 2, precision: 2,
    title: 'Wind Speed',
    description: 'Velocidad de deriva de la nube.'
});

CloudBox.attributes.add('camera', {
    type: 'entity',
    title: 'Camera (opcional)',
    description: 'Cámara a usar; vacío = primera cámara activa de la escena.'
});


/* =========================================================
   TEXTURA DE RUIDO (fbm 4 octavas, tileable, 64x64, UNA vez)
   ========================================================= */

CloudBox._getNoiseTexture = function (device) {
    if (CloudBox._noiseTex) return CloudBox._noiseTex;

    var SIZE = 64;
    var LAT = 16;                      /* celdas del lattice (tileable) */
    var lattice = new Float32Array(LAT * LAT);
    var seed = 1234567;
    var rnd = function () {            /* LCG determinista */
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (var i = 0; i < lattice.length; i++) lattice[i] = rnd();

    /* value noise bilineal con smoothstep, lattice con wrap */
    var sample = function (u, v) {
        var x = u * LAT, y = v * LAT;
        var x0 = Math.floor(x), y0 = Math.floor(y);
        var fx = x - x0, fy = y - y0;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        var x1 = (x0 + 1) % LAT, y1 = (y0 + 1) % LAT;
        x0 %= LAT; y0 %= LAT;
        var a = lattice[y0 * LAT + x0], b = lattice[y0 * LAT + x1];
        var c = lattice[y1 * LAT + x0], d = lattice[y1 * LAT + x1];
        return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };

    var pixels = new Uint8Array(SIZE * SIZE * 4);
    for (var py = 0; py < SIZE; py++) {
        for (var px = 0; px < SIZE; px++) {
            var u = px / SIZE, v = py / SIZE;
            /* fbm 4 octavas (frecuencias enteras: sigue tileando) */
            var f = 0.5330 * sample(u, v) +
                    0.2667 * sample((u * 2) % 1, (v * 2) % 1) +
                    0.1333 * sample((u * 4) % 1, (v * 4) % 1) +
                    0.0670 * sample((u * 8) % 1, (v * 8) % 1);
            var o = (py * SIZE + px) * 4;
            pixels[o] = Math.round(f * 255);                        /* R: fbm fino */
            pixels[o + 1] = Math.round(sample(u, v) * 255);         /* G: octava base */
            pixels[o + 2] = 0;
            pixels[o + 3] = 255;
        }
    }

    var tex = new pc.Texture(device, {
        width: SIZE, height: SIZE,
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: false,
        minFilter: pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_REPEAT,
        addressV: pc.ADDRESS_REPEAT,
        name: 'cloudNoise'
    });
    tex.lock().set(pixels);
    tex.unlock();
    CloudBox._noiseTex = tex;
    return tex;
};


/* =========================================================
   MATERIAL (compartido por TODAS las cajas de nube; los
   parámetros por caja van por meshInstance)
   ========================================================= */

CloudBox._getMaterial = function (device) {
    if (CloudBox._material) return CloudBox._material;

    var vertexGLSL = [
        'attribute vec3 aPosition;',
        '',
        'uniform mat4 matrix_model;',
        'uniform mat4 matrix_viewProjection;',
        '',
        'varying vec3 vLocalPos;',
        '',
        'void main(void) {',
        '    vLocalPos = aPosition;',
        '    gl_Position = matrix_viewProjection * (matrix_model * vec4(aPosition, 1.0));',
        '}'
    ].join('\n');

    var vertexWGSL = [
        'attribute aPosition: vec3f;',
        '',
        'uniform matrix_model: mat4x4f;',
        'uniform matrix_viewProjection: mat4x4f;',
        '',
        'varying vLocalPos: vec3f;',
        '',
        '@vertex',
        'fn vertexMain(input: VertexInput) -> VertexOutput {',
        '    var output: VertexOutput;',
        '    output.vLocalPos = input.aPosition;',
        '    output.position = uniform.matrix_viewProjection * (uniform.matrix_model * vec4f(input.aPosition, 1.0));',
        '    return output;',
        '}'
    ].join('\n');

    var fragmentGLSL = [
        'uniform vec3 uCamLocal;',
        'uniform vec3 uBoxScale;',
        'uniform vec3 uCloudColor;',
        'uniform float uFillCut;',
        'uniform float uDensityK;',
        'uniform float uSoftW;',
        'uniform float uTime;',
        'uniform float uWind;',
        'uniform sampler2D uNoiseMap;',
        '',
        'varying vec3 vLocalPos;',
        '',
        'void main(void) {',
        '    vec3 ro = uCamLocal;',
        '    vec3 rd = vLocalPos - ro;',
        '    rd = rd / max(length(rd), 0.0001);',
        '',
        /* slab test contra la caja unitaria local [-0.5, 0.5] */
        '    vec3 inv = 1.0 / rd;',
        '    vec3 tA = (vec3(-0.5) - ro) * inv;',
        '    vec3 tB = (vec3( 0.5) - ro) * inv;',
        '    vec3 tMin = min(tA, tB);',
        '    vec3 tMax = max(tA, tB);',
        '    float t0 = max(max(tMin.x, tMin.y), max(tMin.z, 0.0));',   /* max(..,0): cámara ADENTRO ok */
        '    float t1 = min(min(tMax.x, tMax.y), tMax.z);',
        '    float span = max(t1 - t0, 0.0);',
        '',
        '    float stepT = span * 0.125;',
        /* jitter del arranque: rompe el banding de 8 pasos */
        '    float jit = fract(sin(dot(vLocalPos.xy + vLocalPos.zx * 1.7, vec2(127.1, 311.7))) * 43758.5453);',
        '    float t = t0 + stepT * jit;',
        '    float worldStep = stepT * length(rd * uBoxScale);',
        '',
        /* INTEGRACIÓN FRONT-TO-BACK con transmitancia: los grumos de adelante
           sombrean a los de atrás (profundidad real). Sin exp(): el factor
           por paso se aproxima con clamp (idéntico a ojo con 8 pasos). */
        '    vec3 acc = vec3(0.0);',
        '    float T = 1.0;',
        '    vec2 wind = vec2(uTime * uWind, uTime * uWind * 0.3);',
        '    for (int i = 0; i < 8; i++) {',
        '        vec3 p = ro + rd * t;',
        '        vec3 pw = p * uBoxScale;',
        '',
        /* RUIDO 3D REAL: dos slices de la misma textura desplazadas por la',
           altura y mezcladas -> los grumos varían también en Y (nada de',
           patrón "pegado" a la superficie). 2 fetches; G = forma gruesa',
           de los grumos, R = detalle fino que erosiona el borde. */
        '        float fy = pw.y * 0.6;',
        '        float iy = floor(fy);',
        '        float sy = fract(fy);',
        '        sy = sy * sy * (3.0 - 2.0 * sy);',
        '        vec2 baseUV = pw.xz * 0.09 + wind;',
        '        vec2 sliceOff = vec2(0.317, 0.123);',
        '        vec4 s0 = texture2D(uNoiseMap, baseUV + sliceOff * iy);',
        '        vec4 s1 = texture2D(uNoiseMap, baseUV + sliceOff * (iy + 1.0));',
        '        float coarse = mix(s0.g, s1.g, sy);',
        '        float fine = mix(s0.r, s1.r, sy);',
        '',
        /* FORMA: elipsoide inscripto en la caja (nube redondeada, no cúbica);',
           base = grumos gruesos recortados por la forma; el detalle fino',
           EROSIONA el borde -> silueta coliflor esponjosa */
        '        vec3 p2 = p * 2.0;',
        '        float shape = clamp((1.0 - dot(p2, p2)) / uSoftW, 0.0, 1.0);',
        '        float base = clamp(coarse * 1.6 - uFillCut, 0.0, 1.0) * shape;',
        '        float d = clamp(base - fine * 0.45, 0.0, 1.0);',
        '',
        '        float f = clamp(d * worldStep * uDensityK, 0.0, 1.0);',
        '        float lit = 0.55 + 0.55 * clamp(p.y + 0.5, 0.0, 1.0);',
        '        acc += T * f * lit * uCloudColor;',
        '        T *= 1.0 - f;',
        '        t += stepT;',
        '    }',
        '',
        /* salida PREMULTIPLICADA (acc ya viene pesada por alpha) */
        '    gl_FragColor = vec4(acc, 1.0 - T);',
        '}'
    ].join('\n');

    var fragmentWGSL = [
        'varying vLocalPos: vec3f;',
        '',
        'uniform uCamLocal: vec3f;',
        'uniform uBoxScale: vec3f;',
        'uniform uCloudColor: vec3f;',
        'uniform uFillCut: f32;',
        'uniform uDensityK: f32;',
        'uniform uSoftW: f32;',
        'uniform uTime: f32;',
        'uniform uWind: f32;',
        '',
        'var uNoiseMap: texture_2d<f32>;',
        'var uNoiseMapSampler: sampler;',
        '',
        '@fragment',
        'fn fragmentMain(input: FragmentInput) -> FragmentOutput {',
        '    var output: FragmentOutput;',
        '    let ro: vec3f = uniform.uCamLocal;',
        '    var rd: vec3f = input.vLocalPos - ro;',
        '    rd = rd / max(length(rd), 0.0001);',
        '',
        '    let inv: vec3f = 1.0 / rd;',
        '    let tA: vec3f = (vec3f(-0.5) - ro) * inv;',
        '    let tB: vec3f = (vec3f( 0.5) - ro) * inv;',
        '    let tMin: vec3f = min(tA, tB);',
        '    let tMax: vec3f = max(tA, tB);',
        '    let t0: f32 = max(max(tMin.x, tMin.y), max(tMin.z, 0.0));',
        '    let t1: f32 = min(min(tMax.x, tMax.y), tMax.z);',
        '    let span: f32 = max(t1 - t0, 0.0);',
        '',
        '    let stepT: f32 = span * 0.125;',
        '    let jit: f32 = fract(sin(dot(input.vLocalPos.xy + input.vLocalPos.zx * 1.7, vec2f(127.1, 311.7))) * 43758.5453);',
        '    var t: f32 = t0 + stepT * jit;',
        '    let worldStep: f32 = stepT * length(rd * uniform.uBoxScale);',
        '',
        '    var acc: vec3f = vec3f(0.0);',
        '    var T: f32 = 1.0;',
        '    let wind: vec2f = vec2f(uniform.uTime * uniform.uWind, uniform.uTime * uniform.uWind * 0.3);',
        '    for (var i: i32 = 0; i < 8; i = i + 1) {',
        '        let p: vec3f = ro + rd * t;',
        '        let pw: vec3f = p * uniform.uBoxScale;',
        '',
        '        let fy: f32 = pw.y * 0.6;',
        '        let iy: f32 = floor(fy);',
        '        var sy: f32 = fract(fy);',
        '        sy = sy * sy * (3.0 - 2.0 * sy);',
        '        let baseUV: vec2f = pw.xz * 0.09 + wind;',
        '        let sliceOff: vec2f = vec2f(0.317, 0.123);',
        '        let s0: vec4f = textureSample(uNoiseMap, uNoiseMapSampler, baseUV + sliceOff * iy);',
        '        let s1: vec4f = textureSample(uNoiseMap, uNoiseMapSampler, baseUV + sliceOff * (iy + 1.0));',
        '        let coarse: f32 = mix(s0.g, s1.g, sy);',
        '        let fine: f32 = mix(s0.r, s1.r, sy);',
        '',
        '        let p2: vec3f = p * 2.0;',
        '        let shape: f32 = clamp((1.0 - dot(p2, p2)) / uniform.uSoftW, 0.0, 1.0);',
        '        let base: f32 = clamp(coarse * 1.6 - uniform.uFillCut, 0.0, 1.0) * shape;',
        '        let d: f32 = clamp(base - fine * 0.45, 0.0, 1.0);',
        '',
        '        let f: f32 = clamp(d * worldStep * uniform.uDensityK, 0.0, 1.0);',
        '        let lit: f32 = 0.55 + 0.55 * clamp(p.y + 0.5, 0.0, 1.0);',
        '        acc += T * f * lit * uniform.uCloudColor;',
        '        T *= 1.0 - f;',
        '        t += stepT;',
        '    }',
        '',
        '    output.color = vec4f(acc, 1.0 - T);',
        '    return output;',
        '}'
    ].join('\n');

    var mat = new pc.ShaderMaterial({
        uniqueName: 'CloudBoxMaterial',
        vertexGLSL: vertexGLSL,
        fragmentGLSL: fragmentGLSL,
        vertexWGSL: vertexWGSL,
        fragmentWGSL: fragmentWGSL,
        attributes: { aPosition: pc.SEMANTIC_POSITION }
    });

    /* caras TRASERAS: el volumen se ve desde afuera Y desde adentro */
    mat.cull = pc.CULLFACE_FRONT;
    /* premultiplicado: el color ya sale pesado por la transmitancia */
    mat.blendType = pc.BLEND_PREMULTIPLIED;
    mat.depthWrite = false;
    mat.setParameter('uNoiseMap', CloudBox._getNoiseTexture(device));
    mat.update();

    CloudBox._material = mat;
    return mat;
};


/* =========================================================
   CICLO DE VIDA
   ========================================================= */

CloudBox.prototype.initialize = function () {
    /* la caja: render box existente o uno nuevo */
    if (!this.entity.render && !this.entity.model) {
        this.entity.addComponent('render', { type: 'box' });
    }

    try {
        this._material = CloudBox._getMaterial(this.app.graphicsDevice);
    } catch (e) {
        console.warn('cloudBox: no se pudo crear el material; efecto desactivado', e);
        return;
    }

    /* scratch pre-alocado (cero basura GC por frame) */
    this._camLocal = new Float32Array(3);
    this._boxScale = new Float32Array(3);
    this._cloudCol = new Float32Array(3);
    this._invModel = new pc.Mat4();
    this._localPos = new pc.Vec3();
    this._time = Math.random() * 100;   /* cada caja arranca desfasada */

    this._mis = [];
    var comps = this.entity.render ? [this.entity.render] : [];
    if (this.entity.model) comps.push(this.entity.model);
    for (var i = 0; i < comps.length; i++) {
        var list = comps[i].meshInstances || [];
        for (var j = 0; j < list.length; j++) {
            var mi = list[j];
            mi.__cloudOriginal = mi.material;
            mi.material = this._material;
            this._mis.push(mi);
        }
    }

    this._syncParams();
    this.on('attr:cloudColor', this._syncParams, this);
    this.on('attr:density', this._syncParams, this);
    this.on('attr:softness', this._syncParams, this);

    this.on('destroy', this._onDestroy, this);
};

/* parámetros derivados de atributos (solo al cambiar; rgb es pc.Color) */
CloudBox.prototype._syncParams = function () {
    if (!this._material) return;
    var dens = pc.math.clamp(+this.density || 0, 0, 1);
    var soft = pc.math.clamp(+this.softness || 0, 0, 1);
    var c = this.cloudColor;
    this._cloudCol[0] = c.r;
    this._cloudCol[1] = c.g;
    this._cloudCol[2] = c.b;

    for (var i = 0; i < this._mis.length; i++) {
        var mi = this._mis[i];
        mi.setParameter('uCloudColor', this._cloudCol);
        /* umbral de los grumos: más density = más caja llena de nube */
        mi.setParameter('uFillCut', 0.95 - dens * 0.55);
        mi.setParameter('uDensityK', 3.0 + dens * 7.0);
        /* suavidad del elipsoide contenedor (borde gradual vs recortado) */
        mi.setParameter('uSoftW', 0.25 + soft * 0.9);
    }
};

CloudBox.prototype._activeCamera = function () {
    if (this.camera && this.camera.camera) return this.camera.camera;
    var cams = this.app.systems.camera.cameras;
    for (var i = 0; i < cams.length; i++) {
        if (cams[i].enabled && cams[i].entity.enabled) return cams[i];
    }
    return null;
};

CloudBox.prototype.update = function (dt) {
    if (!this._material || this._mis.length === 0) return;

    this._time += dt;

    var cam = this._activeCamera();
    if (!cam) return;

    /* cámara a espacio LOCAL de la caja (1 invert de 4x4 por frame, CPU) */
    this._invModel.copy(this.entity.getWorldTransform()).invert();
    this._invModel.transformPoint(cam.entity.getPosition(), this._localPos);
    this._camLocal[0] = this._localPos.x;
    this._camLocal[1] = this._localPos.y;
    this._camLocal[2] = this._localPos.z;

    /* escala mundial (para que el ruido no se estire en cajas no uniformes) */
    var ws = this.entity.getWorldTransform().getScale();
    this._boxScale[0] = Math.abs(ws.x) || 1;
    this._boxScale[1] = Math.abs(ws.y) || 1;
    this._boxScale[2] = Math.abs(ws.z) || 1;

    var wind = Math.max(+this.windSpeed || 0, 0);
    for (var i = 0; i < this._mis.length; i++) {
        var mi = this._mis[i];
        mi.setParameter('uCamLocal', this._camLocal);
        mi.setParameter('uBoxScale', this._boxScale);
        mi.setParameter('uTime', this._time);
        mi.setParameter('uWind', wind);
    }
};

CloudBox.prototype._onDestroy = function () {
    for (var i = 0; i < this._mis.length; i++) {
        var mi = this._mis[i];
        if (mi.__cloudOriginal !== undefined) {
            mi.material = mi.__cloudOriginal;
            delete mi.__cloudOriginal;
        }
        mi.deleteParameter('uCamLocal');
        mi.deleteParameter('uBoxScale');
        mi.deleteParameter('uTime');
        mi.deleteParameter('uWind');
        mi.deleteParameter('uCloudColor');
        mi.deleteParameter('uFillCut');
        mi.deleteParameter('uDensityK');
        mi.deleteParameter('uSoftW');
    }
    this._mis.length = 0;
    /* el material y la textura de ruido son compartidos y quedan cacheados
       para otras cajas (viven lo que la app) */
};
