// --------------- POST EFFECT DEFINITION --------------- //
var SAMPLE_COUNT = 5;

function computeGaussian(n, theta) {
    return ((1.0 / Math.sqrt(2 * Math.PI * theta)) * Math.exp(-(n * n) / (2 * theta * theta)));
}

function calculateBlurValues(sampleWeights, sampleOffsets, dx, dy, blurAmount) {
    sampleWeights[0] = computeGaussian(0, blurAmount);
    sampleOffsets[0] = 0;
    sampleOffsets[1] = 0;

    var totalWeights = sampleWeights[0];

    var i, len;
    for (i = 0, len = Math.floor(SAMPLE_COUNT / 2); i < len; i++) {
        var weight = computeGaussian(i + 1, blurAmount);
        sampleWeights[i * 2] = weight;
        sampleWeights[i * 2 + 1] = weight;
        totalWeights += weight * 2;

        var sampleOffset = i * 2 + 1.5;

        sampleOffsets[i * 4] = dx * sampleOffset;
        sampleOffsets[i * 4 + 1] = dy * sampleOffset;
        sampleOffsets[i * 4 + 2] = -dx * sampleOffset;
        sampleOffsets[i * 4 + 3] = -dy * sampleOffset;
    }

    for (i = 0, len = sampleWeights.length; i < len; i++) {
        sampleWeights[i] /= totalWeights;
    }
}

class BloomEffect extends pc.PostEffect {
    constructor(graphicsDevice) {
        super(graphicsDevice);

        var attributes = {
            aPosition: pc.SEMANTIC_POSITION
        };

        var extractFrag = [
            "varying vec2 vUv0;",
            "",
            "uniform sampler2D uBaseTexture;",
            "uniform float uBloomThreshold;",
            "",
            "void main(void)",
            "{",
            "    vec4 color = texture2D(uBaseTexture, vUv0);",
            "    gl_FragColor = clamp((color - uBloomThreshold) / (1.0 - uBloomThreshold), 0.0, 1.0);",
            "}"
        ].join("\n");

        var gaussianBlurFrag = [
            "#define SAMPLE_COUNT " + SAMPLE_COUNT,
            "",
            "varying vec2 vUv0;",
            "",
            "uniform sampler2D uBloomTexture;",
            "uniform vec2 uBlurOffsets[" + SAMPLE_COUNT + "];",
            "uniform float uBlurWeights[" + SAMPLE_COUNT + "];",
            "",
            "void main(void)",
            "{",
            "    vec4 color = vec4(0.0);",
            "    for (int i = 0; i < SAMPLE_COUNT; i++)",
            "    {",
            "        color += texture2D(uBloomTexture, vUv0 + uBlurOffsets[i]) * uBlurWeights[i];",
            "    }",
            "    gl_FragColor = color;",
            "}"
        ].join("\n");

        var combineFrag = [
            "varying vec2 vUv0;",
            "",
            "uniform float uBloomEffectIntensity;",
            "uniform sampler2D uBaseTexture;",
            "uniform sampler2D uBloomTexture;",
            "",
            "void main(void)",
            "{",
            "    vec4 bloom = texture2D(uBloomTexture, vUv0) * uBloomEffectIntensity;",
            "    vec4 base = texture2D(uBaseTexture, vUv0);",
            "    base *= (1.0 - clamp(bloom, 0.0, 1.0));",
            "    gl_FragColor = base + bloom;",
            "}"
        ].join("\n");
        this.extractShader = pc.ShaderUtils.createShader(graphicsDevice, {
            uniqueName: 'BloomExtractShader',
            attributes: attributes,
            vertexGLSL: pc.PostEffect.quadVertexShader,
            fragmentGLSL: extractFrag
        });
        this.blurShader = pc.ShaderUtils.createShader(graphicsDevice, {
            uniqueName: 'BloomBlurShader',
            attributes: attributes,
            vertexGLSL: pc.PostEffect.quadVertexShader,
            fragmentGLSL: gaussianBlurFrag
        });
        this.combineShader = pc.ShaderUtils.createShader(graphicsDevice, {
            uniqueName: 'BloomCombineShader',
            attributes: attributes,
            vertexGLSL: pc.PostEffect.quadVertexShader,
            fragmentGLSL: combineFrag
        });



        this.targets = [];

        this.bloomThreshold = 0.25;
        this.blurAmount = 4;
        this.bloomIntensity = 1.25;

        this.sampleWeights = new Float32Array(SAMPLE_COUNT);
        this.sampleOffsets = new Float32Array(SAMPLE_COUNT * 2);

        this.width = 0;
        this.height = 0;
    }

    _destroy() {
        if (!this.targets) return;

        for (var i = 0; i < this.targets.length; i++) {
            if (this.targets[i]) {
                this.targets[i].destroyTextureBuffers();
                this.targets[i].destroy();
            }
        }
        this.targets.length = 0;
    }

    _resize(target) {
        var width = Math.max(1, target.colorBuffer.width >> 1);
        var height = Math.max(1, target.colorBuffer.height >> 1);

        if (width === this.width && height === this.height) {
            return;
        }

        this.width = width;
        this.height = height;

        this._destroy();

        for (var i = 0; i < 2; i++) {
            var colorBuffer = new pc.Texture(this.device, {
                name: "Bloom Texture" + i,
                format: pc.PIXELFORMAT_RGBA8,
                width: width,
                height: height,
                mipmaps: false
            });

            colorBuffer.minFilter = pc.FILTER_LINEAR;
            colorBuffer.magFilter = pc.FILTER_LINEAR;
            colorBuffer.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
            colorBuffer.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
            colorBuffer.name = 'pe-bloom-' + i;

            var bloomTarget = new pc.RenderTarget({
                name: "Bloom Render Target " + i,
                colorBuffer: colorBuffer,
                depth: false
            });

            this.targets.push(bloomTarget);
        }
    }

    render(inputTarget, outputTarget, rect) {
        this._resize(inputTarget);

        var scope = this.device.scope;
        var threshold = Math.min(this.bloomThreshold, 0.9999);
        var blurAmount = Math.max(0.0001, this.blurAmount);

        scope.resolve("uBloomThreshold").setValue(threshold);
        scope.resolve("uBaseTexture").setValue(inputTarget.colorBuffer);
        this.drawQuad(this.targets[0], this.extractShader);

        calculateBlurValues(this.sampleWeights, this.sampleOffsets, 1.0 / this.targets[1].width, 0, blurAmount);
        scope.resolve("uBlurWeights[0]").setValue(this.sampleWeights);
        scope.resolve("uBlurOffsets[0]").setValue(this.sampleOffsets);
        scope.resolve("uBloomTexture").setValue(this.targets[0].colorBuffer);
        this.drawQuad(this.targets[1], this.blurShader);

        calculateBlurValues(this.sampleWeights, this.sampleOffsets, 0, 1.0 / this.targets[0].height, blurAmount);
        scope.resolve("uBlurWeights[0]").setValue(this.sampleWeights);
        scope.resolve("uBlurOffsets[0]").setValue(this.sampleOffsets);
        scope.resolve("uBloomTexture").setValue(this.targets[1].colorBuffer);
        this.drawQuad(this.targets[0], this.blurShader);

        scope.resolve("uBloomEffectIntensity").setValue(this.bloomIntensity);
        scope.resolve("uBloomTexture").setValue(this.targets[0].colorBuffer);
        scope.resolve("uBaseTexture").setValue(inputTarget.colorBuffer);
        this.drawQuad(outputTarget, this.combineShader, rect);
    }
}

// ----------------- SCRIPT DEFINITION ------------------ //
var Bloom = pc.createScript('bloom');

Bloom.attributes.add('bloomIntensity', {
    type: 'number',
    default: 1,
    min: 0,
    title: 'Intensity'
});

Bloom.attributes.add('bloomThreshold', {
    type: 'number',
    default: 0.25,
    min: 0,
    max: 1,
    title: 'Threshold'
});

Bloom.attributes.add('blurAmount', {
    type: 'number',
    default: 4,
    min: 1,
    title: 'Blur amount'
});

Bloom.prototype.initialize = function () {
    if (!this.entity.camera) {
        console.warn('[bloom] This script must be added to an entity with a camera component.');
        return;
    }

    this.effect = new BloomEffect(this.app.graphicsDevice);
    this.effect.bloomThreshold = this.bloomThreshold;
    this.effect.blurAmount = this.blurAmount;
    this.effect.bloomIntensity = this.bloomIntensity;

    this.queue = this.entity.camera.postEffects;
    this._effectAdded = false;

    var syncEffect = function () {
        if (!this.effect || !this.queue) return;

        if (this.enabled) {
            if (!this._effectAdded) {
                this.queue.addEffect(this.effect);
                this._effectAdded = true;
            }
        } else {
            if (this._effectAdded) {
                this.queue.removeEffect(this.effect);
                this._effectAdded = false;
            }
        }
    }.bind(this);

    this.on('enable', syncEffect);
    this.on('disable', syncEffect);

    this.on('attr', function (name, value) {
        if (this.effect) {
            this.effect[name] = value;
        }
    }, this);

    this.once('destroy', function () {
        if (this.queue && this.effect) {
            if (this._effectAdded) {
                this.queue.removeEffect(this.effect);
            }
            this.effect._destroy();
            this.effect = null;
            this._effectAdded = false;
        }
    }, this);

    syncEffect();
};