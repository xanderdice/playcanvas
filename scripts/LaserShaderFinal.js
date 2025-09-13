// LaserShaderFinal.js
var LaserShaderFinal = pc.createScript('laserShaderFinal');

// Editor attributes
LaserShaderFinal.attributes.add('coreColor', { type: 'rgb', default: [0.2, 0.8, 1.0] });
LaserShaderFinal.attributes.add('haloColor', { type: 'rgb', default: [0.2, 0.8, 1.0] });
LaserShaderFinal.attributes.add('intensity', { type: 'number', default: 4.0, min: 0, max: 20 });
LaserShaderFinal.attributes.add('stripeCount', { type: 'number', default: 8, min: 1, max: 32 });
LaserShaderFinal.attributes.add('speed', { type: 'number', default: 1.0, min: 0, max: 10 });
LaserShaderFinal.attributes.add('textureWidth', { type: 'number', default: 64 });
LaserShaderFinal.attributes.add('textureHeight', { type: 'number', default: 32 });
LaserShaderFinal.attributes.add('updateInterval', { type: 'number', default: 1, min: 1 });
LaserShaderFinal.attributes.add('useSharedTexture', { type: 'boolean', default: true });
LaserShaderFinal.attributes.add('lightEntity', { type: 'entity', title: 'Optional Light' });

// Shared cache
LaserShaderFinal._shared = LaserShaderFinal._shared || {
    key: null,
    texture: null
};

// ------------------- Initialize -------------------
LaserShaderFinal.prototype.initialize = function () {
    this._frameCounter = 0;
    this._time = 0;

    function colorToArray(c) {
        if (!c) return [1, 1, 1];
        if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
            return [c.r, c.g, c.b];
        }
        return [c[0] !== undefined ? c[0] : 1, c[1] !== undefined ? c[1] : 1, c[2] !== undefined ? c[2] : 1];
    }

    this._coreArr = colorToArray(this.coreColor);
    this._haloArr = colorToArray(this.haloColor);

    // Clamp resolution
    this._tw = Math.max(16, Math.round(this.textureWidth));
    this._th = Math.max(8, Math.round(this.textureHeight));

    // Shared texture key
    var keyParts = [
        'laser',
        'w' + this._tw,
        'h' + this._th,
        's' + Math.round(this.stripeCount),
        'c' + Math.round(this._coreArr[0] * 255) + '-' + Math.round(this._coreArr[1] * 255) + '-' + Math.round(this._coreArr[2] * 255)
    ];
    var key = keyParts.join('_');

    if (this.useSharedTexture && LaserShaderFinal._shared.key === key && LaserShaderFinal._shared.texture) {
        this._texture = LaserShaderFinal._shared.texture;
        console.log('[Laser] reused shared texture', key);
    } else {
        this._texture = this._createTexture(this._tw, this._th, this._coreArr, this.stripeCount);
        if (this.useSharedTexture) {
            LaserShaderFinal._shared.key = key;
            LaserShaderFinal._shared.texture = this._texture;
            console.log('[Laser] created & cached shared texture', key);
        } else {
            console.log('[Laser] created per-instance texture');
        }
    }

    // ---------------- Material ----------------
    var mat = new pc.StandardMaterial();
    mat.useLighting = false;
    mat.emissive = new pc.Color(this._coreArr[0] * this.intensity, this._coreArr[1] * this.intensity, this._coreArr[2] * this.intensity);
    mat.emissiveIntensity = 1.0;
    mat.emissiveMap = this._texture;
    mat.emissiveMapChannel = "rgb";

    mat.opacityMap = this._texture;
    mat.opacityMapChannel = "a";
    mat.opacity = 0.5;

    mat.blendType = pc.BLEND_ADDITIVE;
    mat.depthWrite = false;
    mat.cull = pc.CULLFACE_BACK;

    // initial tiling
    var s = this.entity.getLocalScale();
    var tilingV = Math.max(0.001, Math.abs(s.y));
    mat.emissiveMapTiling = new pc.Vec2(1, tilingV);
    mat.emissiveMapOffset = new pc.Vec2(0, 0);

    mat.update();
    this._material = mat;

    // assign material robustly
    this._assignMaterial();
};

// ---------------- Texture creation ----------------
LaserShaderFinal.prototype._createTexture = function (w, h, coreArr, stripeCount) {
    var app = this.app;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(w, h);

    function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }
    function smoothstep(a, b, v) { var t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }

    var core = coreArr;
    var freq = Math.max(1, stripeCount);

    for (var x = 0; x < w; x++) {
        var nx = x / (w - 1);
        var centerDist = Math.abs(nx - 0.5) / 0.5;
        var radial = 1.0 - smoothstep(0, 1, centerDist);

        for (var y = 0; y < h; y++) {
            var ny = y / (h - 1);
            var stripe = 0.5 + 0.5 * Math.sin(ny * freq * Math.PI * 2.0);
            stripe = Math.max(0.15, stripe * 1.2);
            var brightness = radial * (0.25 + 0.75 * stripe);

            var r = clampByte(core[0] * brightness * 255);
            var g = clampByte(core[1] * brightness * 255);
            var b = clampByte(core[2] * brightness * 255);
            var a = clampByte(Math.max(brightness, 0.12) * 255);

            var idx = (y * w + x) * 4;
            img.data[idx + 0] = r;
            img.data[idx + 1] = g;
            img.data[idx + 2] = b;
            img.data[idx + 3] = a;
        }
    }

    ctx.putImageData(img, 0, 0);

    var tex = new pc.Texture(app.graphicsDevice, {
        format: pc.PIXELFORMAT_R8_G8_B8_A8,
        autoMipmap: true
    });
    tex.setSource(canvas);
    tex.minFilter = pc.FILTER_LINEAR_MIPMAP_LINEAR;
    tex.magFilter = pc.FILTER_LINEAR;
    tex.addressU = pc.ADDRESS_REPEAT;
    tex.addressV = pc.ADDRESS_REPEAT;

    return tex;
};

// ---------------- Material assignment ----------------
LaserShaderFinal.prototype._assignMaterial = function () {
    var assigned = false;

    if (this.entity.model && this.entity.model.meshInstances && this.entity.model.meshInstances.length > 0) {
        var mis = this.entity.model.meshInstances;
        for (var i = 0; i < mis.length; i++) mis[i].material = this._material;
        assigned = true;
    } else if (this.entity.render && this.entity.render.meshInstances && this.entity.render.meshInstances.length > 0) {
        var mis2 = this.entity.render.meshInstances;
        for (var j = 0; j < mis2.length; j++) mis2[j].material = this._material;
        assigned = true;
    }

    if (assigned) {
        this._material.update();
        console.log('[Laser] material assigned to entity:', this.entity.name);
        return;
    }

    // retry if async
    var self = this;
    var tries = 0;
    var maxTries = 60;
    (function retry() {
        tries++;
        if (self.entity.model && self.entity.model.meshInstances && self.entity.model.meshInstances.length > 0) {
            var mis = self.entity.model.meshInstances;
            for (var i = 0; i < mis.length; i++) mis[i].material = self._material;
            self._material.update();
            console.log('[Laser] material assigned (deferred) to entity:', self.entity.name);
            return;
        }
        if (tries < maxTries) setTimeout(retry, 50);
        else console.warn('[Laser] could not assign material to entity after retries:', self.entity.name);
    })();
};

// ---------------- Update ----------------
LaserShaderFinal.prototype.update = function (dt) {
    this._time += dt;
    this._frameCounter++;

    if (!this._material) return;
    if (this._frameCounter < (this.updateInterval || 1)) return;
    this._frameCounter = 0;

    // animate laser movement
    var off = this._material.emissiveMapOffset ? this._material.emissiveMapOffset.clone() : new pc.Vec2(0, 0);
    off.y = -(this._time * this.speed * (this.stripeCount * 0.35)) % 1.0;
    this._material.emissiveMapOffset = off;

    // maintain tiling
    var s = this.entity.getLocalScale();
    var tilingV = Math.max(0.001, Math.abs(s.y));
    this._material.emissiveMapTiling = new pc.Vec2(1, tilingV);

    this._material.update();

    // --- Light flicker rápido y muy aleatorio ---
    if (this.lightEntity && this.lightEntity.light) {
        var t = this._time * this.speed * 10.0; // amplifica velocidad
        // combinación de senos con distintas frecuencias para generar aleatoriedad pseudo-random
        var flicker = 0.4 +
            0.3 * Math.abs(Math.sin(t * 3.1 + 0.13)) +
            0.2 * Math.abs(Math.sin(t * 5.7 + 1.47)) +
            0.1 * Math.abs(Math.sin(t * 7.3 + 2.21));
        // escala final por intensidad
        this.lightEntity.light.intensity = flicker * this.intensity;
    }
};
