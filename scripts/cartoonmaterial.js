/* CartoonMaterial — look de caricatura: la BASE del objeto sale de su propio
   material original (color diffuse y textura diffuseMap si la tiene) y las
   ARISTAS se pintan encima como trazo de lápiz de grafito (como un cubo
   dibujado a mano: se remarcan los bordes entre caras, no solo la silueta).

   BASE (color/textura):
   - Si el render YA tiene material: se toma su diffuse (color) y su
     diffuseMap (textura) como base, y se le aplica el shader encima.
   - Si el render NO tiene material: se le aplica el nuestro con base blanca.
   - Los assets cargan ASÍNCRONO: la textura o el material pueden aparecer
     DESPUÉS de initialize (o el engine puede reponer el material recién
     cargado pisando el nuestro). update() vigila ambos casos con comparaciones
     de puntero (barato) y re-captura/re-aplica al vuelo — sin esto la textura
     "no se ve" según el orden de carga.

   Cómo se detectan las aristas (1 solo pase, sin geometría extra):
   - En espacio LOCAL del mesh, un fragmento está "en una arista" cuando su
     posición está pegada al límite de la caja (AABB local) en un eje que NO es
     el de su propia cara. En un cubo eso pinta las 12 aristas exactas; en
     formas curvas queda además la silueta por fresnel como refuerzo.
   - Caja, color base y textura van POR MESHINSTANCE (setParameter): pisan a
     los del material sin romper el material COMPARTIDO.
   - Un grano estático en espacio local tiembla el umbral: trazo irregular
     tipo grafito que no "nada" cuando el objeto se mueve.
   (Nota: en mallas skinned la posición local es la bind pose; para personajes
   solo aporta la silueta fresnel.)

   Performance para CIENTOS de instancias en móvil de gama baja:
   - 1 solo programa de shader (uniqueName compartido).
   - Materiales COMPARTIDOS por combinación de atributos (caché con refcount);
     al salir el color base del material original, la caché colapsa a un
     material por (pencilColor, pencilWidth).
   - update() por frame: solo comparaciones de puntero sobre las meshes ya
     enganchadas (re-scan completo cada 30 frames).
   - Fragment barato: 2 dot, 1 sin, 1 fetch de textura, sin ramas.
   - GLSL (WebGL2) y WGSL (WebGPU) equivalentes, dialecto oficial de
     pc.ShaderMaterial (engine 2.x).
   (Tiling/offset del material original no se replican; texturas sRGB se
   re-codifican con sqrt para no verse oscuras.)

   Atributos (solo 2, a pedido): pencilColor y pencilWidth. */

var CartoonMaterial = pc.createScript('cartoonMaterial');

CartoonMaterial.attributes.add('pencilColor', {
    type: 'rgb',
    default: [0.12, 0.12, 0.14],
    title: 'Pencil Color',
    description: 'Color del lápiz que remarca las aristas (grafito).'
});

CartoonMaterial.attributes.add('pencilWidth', {
    type: 'number',
    default: 0.4,
    min: 0,
    max: 1,
    precision: 2,
    title: 'Pencil Width',
    description: 'Grosor del trazo de las aristas (0 = sin trazo, 1 = grueso).'
});


/* =========================================================
   SHADERS (GLSL para WebGL2, WGSL para WebGPU)
   - Normal en mundo vía matrix_model (matrix_normal del engine es mat3 y su
     layout difiere entre backends; con escala uniforme da igual resultado y
     se normaliza en el fragment).
   - view_position es el uniform ESTÁNDAR del engine con la posición de la
     cámara en mundo.
   - uBaseColor / uDiffuseMap / uBoxCenter / uBoxHalf / uBoxMinHalf llegan
     POR MESHINSTANCE (del material original y del AABB local del mesh).
   - Luz direccional FIJA (constante de compilación): cero uniforms extra.
   ========================================================= */

CartoonMaterial._vertexGLSL = [
    'attribute vec3 aPosition;',
    'attribute vec3 aNormal;',
    'attribute vec2 aUv0;',
    '',
    'uniform mat4 matrix_model;',
    'uniform mat4 matrix_viewProjection;',
    '',
    'varying vec3 vWorldNormal;',
    'varying vec3 vWorldPos;',
    'varying vec3 vLocalNormal;',
    'varying vec3 vLocalPos;',
    'varying vec2 vUv0;',
    '',
    'void main(void) {',
    '    vec4 worldPos = matrix_model * vec4(aPosition, 1.0);',
    '    vWorldPos = worldPos.xyz;',
    '    vWorldNormal = (matrix_model * vec4(aNormal, 0.0)).xyz;',
    '    vLocalPos = aPosition;',
    '    vLocalNormal = aNormal;',
    '    vUv0 = aUv0;',
    '    gl_Position = matrix_viewProjection * worldPos;',
    '}'
].join('\n');

CartoonMaterial._fragmentGLSL = [
    'uniform vec3 uBaseColor;',
    'uniform vec3 uPencilColor;',
    'uniform float uPencilWidth;',
    'uniform vec3 view_position;',
    'uniform vec3 uBoxCenter;',
    'uniform vec3 uBoxHalf;',
    'uniform float uBoxMinHalf;',
    'uniform sampler2D uDiffuseMap;',
    'uniform float uTexEncode;',
    '',
    'varying vec3 vWorldNormal;',
    'varying vec3 vWorldPos;',
    'varying vec3 vLocalNormal;',
    'varying vec3 vLocalPos;',
    'varying vec2 vUv0;',
    '',
    'float hash21(vec2 p) {',
    '    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    '',
    'void main(void) {',
    '    vec3 N = normalize(vWorldNormal);',
    '    vec3 V = normalize(view_position - vWorldPos);',
    '    vec3 L = normalize(vec3(0.5, 1.0, 0.3));',
    '',
    /* cel shading: 3 bandas fijas (sombra 0.55 / media 0.8 / luz 1.0).
       Base = diffuse del material original * su textura (blanco si no hay).
       uTexEncode=1 re-codifica texturas sRGB (el sample llega lineal y a la
       salida directa se vería oscuro). */
    '    float ndl = max(dot(N, L), 0.0);',
    '    float shade = 0.55 + 0.25 * step(0.3, ndl) + 0.2 * step(0.65, ndl);',
    '    vec3 texCol = texture2D(uDiffuseMap, vUv0).rgb;',
    '    texCol = mix(texCol, sqrt(texCol), uTexEncode);',
    '    vec3 col = uBaseColor * texCol * shade;',
    '',
    /* ARISTAS: distancia al límite de la caja local por eje; pegado al borde
       en un eje que NO es el de la cara (mask 1-|n|) = arista. */
    '    float w = max(uPencilWidth * 0.25 * uBoxMinHalf, 0.00001);',
    '    vec3 dist = uBoxHalf - abs(vLocalPos - uBoxCenter);',
    '    vec3 t = 1.0 - clamp(dist / w, vec3(0.0), vec3(1.0));',
    '    vec3 an = abs(normalize(vLocalNormal));',
    '    vec3 e = t * (1.0 - an);',
    '    float edge = max(max(e.x, e.y), e.z);',
    '',
    /* silueta fresnel (refuerzo para curvas y caras rasantes) */
    '    float rim = 1.0 - max(dot(N, V), 0.0);',
    '    edge = max(edge, smoothstep(0.72, 0.92, rim));',
    '',
    /* grano de grafito en coords locales NORMALIZADAS (independiente de la
       escala del asset; el trazo no nada al mover el objeto) */
    '    vec3 q = (vLocalPos - uBoxCenter) / uBoxHalf;',
    '    float grain = hash21(floor(q.xy * 24.0) + floor(q.zz * 13.0));',
    '    float pencil = smoothstep(0.5, 0.8, edge + (grain - 0.5) * 0.3);',
    '    col = mix(col, uPencilColor, pencil * (0.8 + 0.2 * grain));',
    '',
    '    gl_FragColor = vec4(col, 1.0);',
    '}'
].join('\n');

CartoonMaterial._vertexWGSL = [
    'attribute aPosition: vec3f;',
    'attribute aNormal: vec3f;',
    'attribute aUv0: vec2f;',
    '',
    'uniform matrix_model: mat4x4f;',
    'uniform matrix_viewProjection: mat4x4f;',
    '',
    'varying vWorldNormal: vec3f;',
    'varying vWorldPos: vec3f;',
    'varying vLocalNormal: vec3f;',
    'varying vLocalPos: vec3f;',
    'varying vUv0: vec2f;',
    '',
    '@vertex',
    'fn vertexMain(input: VertexInput) -> VertexOutput {',
    '    var output: VertexOutput;',
    '    let worldPos: vec4f = uniform.matrix_model * vec4f(input.aPosition, 1.0);',
    '    output.vWorldPos = worldPos.xyz;',
    '    output.vWorldNormal = (uniform.matrix_model * vec4f(input.aNormal, 0.0)).xyz;',
    '    output.vLocalPos = input.aPosition;',
    '    output.vLocalNormal = input.aNormal;',
    '    output.vUv0 = input.aUv0;',
    '    output.position = uniform.matrix_viewProjection * worldPos;',
    '    return output;',
    '}'
].join('\n');

CartoonMaterial._fragmentWGSL = [
    'varying vWorldNormal: vec3f;',
    'varying vWorldPos: vec3f;',
    'varying vLocalNormal: vec3f;',
    'varying vLocalPos: vec3f;',
    'varying vUv0: vec2f;',
    '',
    'uniform uBaseColor: vec3f;',
    'uniform uPencilColor: vec3f;',
    'uniform uPencilWidth: f32;',
    'uniform view_position: vec3f;',
    'uniform uBoxCenter: vec3f;',
    'uniform uBoxHalf: vec3f;',
    'uniform uBoxMinHalf: f32;',
    'uniform uTexEncode: f32;',
    '',
    'var uDiffuseMap: texture_2d<f32>;',
    'var uDiffuseMapSampler: sampler;',
    '',
    'fn hash21(p: vec2f) -> f32 {',
    '    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);',
    '}',
    '',
    '@fragment',
    'fn fragmentMain(input: FragmentInput) -> FragmentOutput {',
    '    var output: FragmentOutput;',
    '    let N: vec3f = normalize(input.vWorldNormal);',
    '    let V: vec3f = normalize(uniform.view_position - input.vWorldPos);',
    '    let L: vec3f = normalize(vec3f(0.5, 1.0, 0.3));',
    '',
    '    let ndl: f32 = max(dot(N, L), 0.0);',
    '    let shade: f32 = 0.55 + 0.25 * step(0.3, ndl) + 0.2 * step(0.65, ndl);',
    '    var texCol: vec3f = textureSample(uDiffuseMap, uDiffuseMapSampler, input.vUv0).rgb;',
    '    texCol = mix(texCol, sqrt(texCol), uniform.uTexEncode);',
    '    var col: vec3f = uniform.uBaseColor * texCol * shade;',
    '',
    '    let w: f32 = max(uniform.uPencilWidth * 0.25 * uniform.uBoxMinHalf, 0.00001);',
    '    let dist: vec3f = uniform.uBoxHalf - abs(input.vLocalPos - uniform.uBoxCenter);',
    '    let t: vec3f = 1.0 - clamp(dist / w, vec3f(0.0), vec3f(1.0));',
    '    let an: vec3f = abs(normalize(input.vLocalNormal));',
    '    let e: vec3f = t * (1.0 - an);',
    '    var edge: f32 = max(max(e.x, e.y), e.z);',
    '',
    '    let rim: f32 = 1.0 - max(dot(N, V), 0.0);',
    '    edge = max(edge, smoothstep(0.72, 0.92, rim));',
    '',
    '    let q: vec3f = (input.vLocalPos - uniform.uBoxCenter) / uniform.uBoxHalf;',
    '    let grain: f32 = hash21(floor(q.xy * 24.0) + floor(q.zz * 13.0));',
    '    let pencil: f32 = smoothstep(0.5, 0.8, edge + (grain - 0.5) * 0.3);',
    '    col = mix(col, uniform.uPencilColor, pencil * (0.8 + 0.2 * grain));',
    '',
    '    output.color = vec4f(col, 1.0);',
    '    return output;',
    '}'
].join('\n');


/* =========================================================
   CACHÉ ESTÁTICA DE MATERIALES (compartidos por combinación
   de atributos, con conteo de referencias)
   ========================================================= */

CartoonMaterial._cache = {};

/* Blanco 1x1 estático: fallback de uDiffuseMap para objetos SIN textura
   (base = diffuse del original * blanco). Vive toda la app. */
CartoonMaterial._getWhiteTexture = function (device) {
    if (!CartoonMaterial._whiteTex) {
        var tex = new pc.Texture(device, {
            width: 1, height: 1,
            format: pc.PIXELFORMAT_RGBA8,
            mipmaps: false,
            name: 'cartoonWhite'
        });
        tex.lock().set([255, 255, 255, 255]);
        tex.unlock();
        CartoonMaterial._whiteTex = tex;
    }
    return CartoonMaterial._whiteTex;
};

CartoonMaterial._acquireMaterial = function (device, key, pencil, width) {
    var entry = CartoonMaterial._cache[key];
    if (!entry) {
        var mat = new pc.ShaderMaterial({
            uniqueName: 'CartoonMaterial',
            vertexGLSL: CartoonMaterial._vertexGLSL,
            fragmentGLSL: CartoonMaterial._fragmentGLSL,
            vertexWGSL: CartoonMaterial._vertexWGSL,
            fragmentWGSL: CartoonMaterial._fragmentWGSL,
            attributes: {
                aPosition: pc.SEMANTIC_POSITION,
                aNormal: pc.SEMANTIC_NORMAL,
                aUv0: pc.SEMANTIC_TEXCOORD0
            }
        });
        /* marca para no capturar NUNCA un material nuestro como "original" */
        mat.__isCartoon = true;
        /* atributos rgb son pc.Color (.r/.g/.b) — NO arrays indexables */
        mat.setParameter('uPencilColor', [pencil.r, pencil.g, pencil.b]);
        mat.setParameter('uPencilWidth', width);
        /* defaults a nivel material; cada meshInstance los pisa con los suyos */
        mat.setParameter('uBaseColor', [1, 1, 1]);
        mat.setParameter('uBoxCenter', [0, 0, 0]);
        mat.setParameter('uBoxHalf', [1e6, 1e6, 1e6]);
        mat.setParameter('uBoxMinHalf', 1);
        mat.setParameter('uDiffuseMap', CartoonMaterial._getWhiteTexture(device));
        mat.setParameter('uTexEncode', 0);
        mat.update();
        entry = { mat: mat, refs: 0 };
        CartoonMaterial._cache[key] = entry;
    }
    entry.refs++;
    return entry.mat;
};

CartoonMaterial._releaseMaterial = function (key) {
    var entry = CartoonMaterial._cache[key];
    if (!entry) return;
    entry.refs--;
    if (entry.refs <= 0) {
        delete CartoonMaterial._cache[key];
        entry.mat.destroy();
    }
};


/* =========================================================
   CICLO DE VIDA
   ========================================================= */

CartoonMaterial.prototype.initialize = function () {
    this._matKey = null;
    this._material = null;
    this._applied = false;
    this._mis = [];      // meshInstances enganchadas (para la vigilancia barata)
    this._frame = 0;

    this._refreshMaterial();

    /* los uniforms solo cambian cuando cambia un atributo (nada por frame) */
    this.on('attr:pencilColor', this._refreshMaterial, this);
    this.on('attr:pencilWidth', this._refreshMaterial, this);

    /* el sistema de scripts NO llama a un método destroy() del prototype:
       la limpieza va en el EVENTO destroy */
    this.on('destroy', this._onDestroy, this);
};

/* Vigilancia de carga ASÍNCRONA (la razón de que "no se vea la textura"):
   - el engine puede reponer el material recién cargado del asset PISANDO el
     nuestro -> se re-captura como nuevo original y se re-aplica el shader;
   - la textura del material original puede aparecer tarde -> se refrescan
     los parámetros de esa meshInstance.
   Coste por frame: comparaciones de puntero. Re-scan completo (meshes nuevas)
   cada 30 frames o mientras no haya meshes enganchadas. */
CartoonMaterial.prototype.update = function () {
    if (!this._material) return;

    this._frame++;
    if (!this._applied || (this._frame % 30) === 0) {
        this._applied = this._applyToEntity();
        return;
    }

    var mis = this._mis;
    for (var i = 0; i < mis.length; i++) {
        var mi = mis[i];
        if (mi.material !== this._material) {
            /* material repuesto por el engine (asset que cargó tarde) */
            if (!(mi.material && mi.material.__isCartoon)) mi.__cartoonOriginal = mi.material;
            mi.material = this._material;
            this._setInstanceParams(mi);
        } else if (mi.__cartoonOriginal &&
            ((mi.__cartoonOriginal.diffuseMap || null) !== (mi.__cartoonLastTex || null))) {
            /* la textura del original apareció (o cambió) tarde */
            this._setInstanceParams(mi);
        }
    }
};

CartoonMaterial.prototype._refreshMaterial = function () {
    var p = this.pencilColor;
    var w = pc.math.clamp(+this.pencilWidth || 0, 0, 1);

    var key = p.r.toFixed(3) + ',' + p.g.toFixed(3) + ',' + p.b.toFixed(3) + '|' + w.toFixed(3);
    if (key === this._matKey) return;

    var prevKey = this._matKey;
    this._material = CartoonMaterial._acquireMaterial(this.app.graphicsDevice, key, p, w);
    this._matKey = key;
    if (prevKey) CartoonMaterial._releaseMaterial(prevKey);

    this._applied = this._applyToEntity();
};

/* Aplica el material a todas las meshInstances (render y model) del subárbol.
   Si la mesh trae material propio se captura como ORIGINAL (de él salen color
   y textura base); si no trae, el nuestro actúa con base blanca ("crearlo").
   Devuelve true si había meshes a las que aplicar. */
CartoonMaterial.prototype._applyToEntity = function () {
    if (!this._material) return false;

    var comps = this.entity.findComponents('render').concat(this.entity.findComponents('model'));
    var mis = this._mis;
    mis.length = 0;
    var applied = false;

    for (var i = 0; i < comps.length; i++) {
        var list = comps[i].meshInstances;
        if (!list || !list.length) continue;
        for (var j = 0; j < list.length; j++) {
            var mi = list[j];
            mis.push(mi);
            if (mi.material !== this._material) {
                /* nunca capturar un material cartoon (p.ej. el previo al
                   cambiar un atributo) como "original" */
                if (!(mi.material && mi.material.__isCartoon)) mi.__cartoonOriginal = mi.material;
                mi.material = this._material;
                this._setInstanceParams(mi);
            }
            applied = true;
        }
    }
    return applied;
};

/* Parámetros POR MESHINSTANCE (pisan a los del material sin romper el
   material compartido): AABB local para las aristas + color/textura base
   del material ORIGINAL. */
CartoonMaterial.prototype._setInstanceParams = function (mi) {
    var mesh = mi.mesh;
    if (mesh && mesh.aabb) {
        var c = mesh.aabb.center;
        var h = mesh.aabb.halfExtents;
        var hx = Math.max(h.x, 0.00001);
        var hy = Math.max(h.y, 0.00001);
        var hz = Math.max(h.z, 0.00001);

        /* min de los semiejes REALES: ignora ejes casi planos (p.ej. un plano)
           para que el grosor del trazo no colapse a cero */
        var maxH = Math.max(hx, Math.max(hy, hz));
        var minH = maxH;
        if (hx > maxH * 0.01 && hx < minH) minH = hx;
        if (hy > maxH * 0.01 && hy < minH) minH = hy;
        if (hz > maxH * 0.01 && hz < minH) minH = hz;

        mi.setParameter('uBoxCenter', [c.x, c.y, c.z]);
        mi.setParameter('uBoxHalf', [hx, hy, hz]);
        mi.setParameter('uBoxMinHalf', minH);
    }

    var orig = (mi.__cartoonOriginal && !mi.__cartoonOriginal.__isCartoon)
        ? mi.__cartoonOriginal
        : null;

    /* color base = diffuse del material original (blanco si no hay) */
    var d = (orig && orig.diffuse) ? orig.diffuse : null;
    mi.setParameter('uBaseColor', d ? [d.r, d.g, d.b] : [1, 1, 1]);

    /* textura difusa del original; sin ella caen los del material (blanco).
       sRGB: el sample llega LINEAL -> uTexEncode=1 lo re-codifica (sqrt). */
    var tex = (orig && orig.diffuseMap) ? orig.diffuseMap : null;
    mi.__cartoonLastTex = tex;
    if (tex) {
        mi.setParameter('uDiffuseMap', tex);
        var f = tex.format;
        mi.setParameter('uTexEncode', (f === pc.PIXELFORMAT_SRGBA8 || f === pc.PIXELFORMAT_SRGB8) ? 1 : 0);
    } else {
        mi.deleteParameter('uDiffuseMap');
        mi.deleteParameter('uTexEncode');
    }
};

CartoonMaterial.prototype._onDestroy = function () {
    /* restaurar materiales originales (por si solo se quita el script y la
       entidad sigue viva) */
    var comps = this.entity
        ? this.entity.findComponents('render').concat(this.entity.findComponents('model'))
        : [];
    for (var i = 0; i < comps.length; i++) {
        var mis = comps[i].meshInstances;
        if (!mis) continue;
        for (var j = 0; j < mis.length; j++) {
            var mi = mis[j];
            if (mi.__cartoonOriginal !== undefined) {
                if (mi.material === this._material) mi.material = mi.__cartoonOriginal;
                delete mi.__cartoonOriginal;
                delete mi.__cartoonLastTex;
                mi.deleteParameter('uBaseColor');
                mi.deleteParameter('uBoxCenter');
                mi.deleteParameter('uBoxHalf');
                mi.deleteParameter('uBoxMinHalf');
                mi.deleteParameter('uDiffuseMap');
                mi.deleteParameter('uTexEncode');
            }
        }
    }
    this._mis.length = 0;

    if (this._matKey) {
        CartoonMaterial._releaseMaterial(this._matKey);
        this._matKey = null;
        this._material = null;
    }
};

/* Hot-reload del editor: heredar material/refcount y re-registrar listeners
   (los de la instancia vieja mueren con ella). */
CartoonMaterial.prototype.swap = function (old) {
    this._matKey = old._matKey;
    this._material = old._material;
    this._applied = old._applied;
    this._mis = old._mis || [];
    this._frame = old._frame || 0;

    this.on('attr:pencilColor', this._refreshMaterial, this);
    this.on('attr:pencilWidth', this._refreshMaterial, this);
    this.on('destroy', this._onDestroy, this);

    this._refreshMaterial();
};
