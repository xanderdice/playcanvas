/*********************************************************************************************
 * MIT License
 * Copyright (c) 2025 Anton Matrosov
 * https://www.linkedin.com/in/antonmatrosov/
 * https://forum.playcanvas.com/u/underlight/summary
 * https://ko-fi.com/antonmatrosov
 ********************************************************************************************/

/*********************************************************************************************
 * Physically Based HDR Bloom - PlayCanvas implementation
 * 
 * Beta release v0.9 / June 2023
 * Developed and tested with engine v1.63.6
 * 
 * DEV NOTES
 * This script supports all available tonemappers and both 1.0 and 2.2 gamma outputs
 * Materials with useGammaTonemap = false will still be tonemapped during postprocessing
 * Current release is targeting mainly WebGL and wasn't tested with WebGPU setups
 * 
 * PERFORMANCE
 * Performance cost of this posteffect is almost constant, regardless of number of iterations
 * The biggest impact on performance is posteffect itself, device pixel ratio and HDR format
 * On desktops and recent mobile devices it can be in a range of just a few milliseconds
 * On low end devices it may result in 1.5x - 2x fps drop even at pixel ratio 1 or lower
 * 
 * ACKNOWLEDGEMENTS
 * Inspired by PlayCanvas GitHub issue:
 * https://github.com/playcanvas/engine/issues/5187
 * Based on awesome tutorial by Alexander Christensen:
 * https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom
 * Which in turn is based on research by Jorge Jimenez
 * http://www.iryoku.com/publications
 * Special thanks to SashaRX for the proof of concept
 * High five to PlayCanvas team as well!
 ********************************************************************************************/





class Bloom2025Effect extends pc.PostEffect {

    constructor(graphicDevice, params) {
        super(graphicDevice);

        this.width = this.device.width;
        this.height = this.device.height;
        this.hdr = true;

        this.params =
        {
            blendmode: 'screen',
            iterations: 7,
            miplimit: 4,
            strength: 25,
            thresholdA: 0,
            thresholdB: 1,
            radius: new pc.Vec2(1, 1),
            hdrformat: pc.PIXELFORMAT_111110F,
            tonemapper: pc.TONEMAP_NONE,
            gamma: pc.GAMMA_SRGB,
            exposure: 1
        };

        this.targets =
        {
            downsampled: [],
            upsampled: []
        };

        this.shader =
        {
            downsample: null,
            upsample: null,
            combine: null
        };

        this.configure(params);
    }


    configure(params) {
        this.params = { ...this.params, ...params };

        if (params.iterations !== undefined || params.miplimit !== undefined || params.hdrformat !== undefined) {
            this.clearRenderTargets();
            this.setupRenderTargets(this.params);
        }

        if (params.blendmode !== undefined || params.tonemapper !== undefined) {
            this.setupShaders(this.params);
        }
    }


    render(inputTarget, outputTarget, rect) {
        this.checkResize();

        for (let i = 0; i < this.targets.downsampled.length; i++) {
            let input = (i == 0) ? inputTarget : this.targets.downsampled[i - 1];
            let output = this.targets.downsampled[i];
            let threshold = (i == 0) ? [this.params.thresholdA, this.params.thresholdB] : [0, 0];

            this.device.scope.resolve('uSource').setValue(input.colorBuffer);
            this.device.scope.resolve('uResolution').setValue([input.width, input.height]);
            this.device.scope.resolve('uThreshold').setValue(threshold);
            this.drawQuad(output, this.shader.downsample, rect);
        }

        for (let j = this.targets.downsampled.length - 1; j > 0; j--) {
            let input = (j == this.targets.downsampled.length - 1) ?
                this.targets.downsampled[j] :
                this.targets.upsampled[j];
            let input1 = this.targets.downsampled[j - 1];
            let output = this.targets.upsampled[j - 1];
            let radius = this.params.radius.clone().mulScalar(0.01);

            this.device.scope.resolve('uSource').setValue(input.colorBuffer);
            this.device.scope.resolve('uSource1').setValue(input1.colorBuffer);
            this.device.scope.resolve('uResolution').setValue([input.width, input.height]);
            this.device.scope.resolve('uFilterRadius').setValue([radius.x, radius.y]);
            this.drawQuad(output, this.shader.upsample, rect);
        }

        let input = inputTarget;
        let bloom = this.targets.upsampled[0];
        let output = outputTarget;

        this.device.scope.resolve('uSource').setValue(input.colorBuffer);
        this.device.scope.resolve('uBloom').setValue(bloom.colorBuffer);
        this.device.scope.resolve('uStrength').setValue(this.params.strength * 0.01);
        this.device.scope.resolve('uGamma').setValue((this.params.gamma === pc.GAMMA_NONE) ? 1.0 : 2.2);
        this.device.scope.resolve('exposure').setValue(this.params.exposure);
        this.drawQuad(output, this.shader.combine, rect);
    }


    checkResize() {
        if (this.device.width !== this.width || this.device.height !== this.height) {
            this.clearRenderTargets();
            this.setupRenderTargets(this.params);

            this.width = this.device.width;
            this.height = this.device.height;
        }
    }


    setupShaders(params) {
        this.shader =
        {
            downsample: this.createDownsampleShader(params),
            upsample: this.createUpsampleShader(params),
            combine: this.createCombineShader(params)
        };
    }


    setupRenderTargets(params) {
        this.targets.downsampled = [];
        this.targets.upsampled = [];

        for (let i = 0; i < params.iterations; i++) {
            let width = this.device.width >> (i + 1);
            let height = this.device.height >> (i + 1);

            if (width >= params.miplimit && height >= params.miplimit) {
                this.targets.downsampled.push(this.createRenderTarget(width, height, params.hdrformat));
                this.targets.upsampled.push(this.createRenderTarget(width, height, params.hdrformat));
            }
        }
    }


    clearRenderTargets() {
        for (let target of this.targets.downsampled)
            this.destroyRenderTarget(target);

        for (let target of this.targets.upsampled)
            this.destroyRenderTarget(target);
    }


    createRenderTarget(width, height, format) {
        let colorBuffer = new pc.Texture(this.device,
            {
                format: this.requestHDRFormat(format),
                width,
                height,
                mipmaps: false,
                minFilter: pc.FILTER_LINEAR,
                magFilter: pc.FILTER_LINEAR,
                addressU: pc.ADDRESS_CLAMP_TO_EDGE,
                addressV: pc.ADDRESS_CLAMP_TO_EDGE
            });

        return new pc.RenderTarget
            ({
                colorBuffer: colorBuffer,
                samples: 0,
                depth: false
            });
    }


    destroyRenderTarget(target) {
        if (target) {
            target.destroyTextureBuffers();
            target.destroy();
        }
    }


    requestHDRFormat(preferred) {

        const valid16 = (this.device.hasOwnProperty("extTextureHalfFloat") ? this.device.extTextureHalfFloat : true) && this.device.textureHalfFloatRenderable;
        const valid32 = (this.device.hasOwnProperty("extTextureFloat") ? this.device.extTextureFloat : true) && this.device.textureFloatRenderable;

        if (preferred === pc.PIXELFORMAT_RGBA32F) {
            if (valid32) return pc.PIXELFORMAT_RGBA32F;
            else if (valid16) return pc.PIXELFORMAT_RGBA16F;
            else return pc.PIXELFORMAT_111110F;
        }
        else if (preferred === pc.PIXELFORMAT_RGBA16F) {
            if (valid16) return pc.PIXELFORMAT_RGBA16F;
            else return pc.PIXELFORMAT_111110F;
        }
        else {
            return pc.PIXELFORMAT_111110F;
        }
    }


    destroy() {
        this.clearRenderTargets();
    }


    createDownsampleShader(params) {
        const downsampleShader =
            `
            precision ${this.device.precision} float;

            uniform sampler2D uSource;
            uniform vec2 uResolution;
            uniform vec2 uThreshold;
            varying vec2 vUv0;

            vec3 prefilter (vec3 color, vec2 threshold)
            {
                float thres1 = min (threshold.x, threshold.y);
                float thres2 = max (threshold.x, threshold.y);
                float brightness = (color.r + color.g + color.b) / 3.0;
                float factor = smoothstep (thres1, thres2, brightness);
                return color * factor;
            }

            void main()
            {
                float x = 1.0 / uResolution.x;
                float y = 1.0 / uResolution.y;

                vec3 a = texture2D (uSource, vec2 (vUv0.x - 2.0 * x, vUv0.y + 2.0 * y)).rgb;
                vec3 b = texture2D (uSource, vec2 (vUv0.x,           vUv0.y + 2.0 * y)).rgb;
                vec3 c = texture2D (uSource, vec2 (vUv0.x + 2.0 * x, vUv0.y + 2.0 * y)).rgb;

                vec3 d = texture2D (uSource, vec2 (vUv0.x - 2.0 * x, vUv0.y)).rgb;
                vec3 e = texture2D (uSource, vec2 (vUv0.x,           vUv0.y)).rgb;
                vec3 f = texture2D (uSource, vec2 (vUv0.x + 2.0 * x, vUv0.y)).rgb;

                vec3 g = texture2D (uSource, vec2 (vUv0.x - 2.0 * x, vUv0.y - 2.0 * y)).rgb;
                vec3 h = texture2D (uSource, vec2 (vUv0.x,           vUv0.y - 2.0 * y)).rgb;
                vec3 i = texture2D (uSource, vec2 (vUv0.x + 2.0 * x, vUv0.y - 2.0 * y)).rgb;

                vec3 j = texture2D (uSource, vec2 (vUv0.x - x, vUv0.y + y)).rgb;
                vec3 k = texture2D (uSource, vec2 (vUv0.x + x, vUv0.y + y)).rgb;
                vec3 l = texture2D (uSource, vec2 (vUv0.x - x, vUv0.y - y)).rgb;
                vec3 m = texture2D (uSource, vec2 (vUv0.x + x, vUv0.y - y)).rgb;

                vec3 downsample = vec3 (0.0);
                downsample += e * 0.125;
                downsample += (a + c + g + i) * 0.03125;
                downsample += (b + d + f + h) * 0.0625;
                downsample += (j + k + l + m) * 0.125;

                downsample = prefilter (downsample, uThreshold);

                gl_FragColor = vec4 (downsample, 1.0);
            }
        `;

        return pc.createShaderFromCode
            (
                this.device,
                pc.PostEffect.quadVertexShader,
                downsampleShader,
                `Bloom_Downsample_${Date.now()}`,
                { aPosition: pc.SEMANTIC_POSITION }
            );
    }


    createUpsampleShader(params) {
        const upsampleShader =
            `
            precision ${this.device.precision} float;

            uniform sampler2D uSource;
            uniform sampler2D uSource1;
            uniform vec2 uFilterRadius;
            uniform vec2 uResolution;
            varying vec2 vUv0;

            void main()
            {
                float x = uFilterRadius.x * uResolution.y / uResolution.x;
                float y = uFilterRadius.y;

                vec3 a = texture2D (uSource, vec2 (vUv0.x - x, vUv0.y + y)).rgb;
                vec3 b = texture2D (uSource, vec2 (vUv0.x,     vUv0.y + y)).rgb;
                vec3 c = texture2D (uSource, vec2 (vUv0.x + x, vUv0.y + y)).rgb;

                vec3 d = texture2D (uSource, vec2 (vUv0.x - x, vUv0.y)).rgb;
                vec3 e = texture2D (uSource, vec2 (vUv0.x,     vUv0.y)).rgb;
                vec3 f = texture2D (uSource, vec2 (vUv0.x + x, vUv0.y)).rgb;

                vec3 g = texture2D (uSource, vec2 (vUv0.x - x, vUv0.y - y)).rgb;
                vec3 h = texture2D (uSource, vec2 (vUv0.x,     vUv0.y - y)).rgb;
                vec3 i = texture2D (uSource, vec2 (vUv0.x + x, vUv0.y - y)).rgb;

                vec3 upsample = vec3 (0.0);
                upsample += e * 4.0;
                upsample += (b + d + f + h) * 2.0;
                upsample += (a + c + g + i);
                upsample *= 1.0 / 16.0;

                vec3 previous = texture2D (uSource1, vUv0).rgb;

                gl_FragColor = vec4 (upsample + previous, 1.0);
            }
        `;

        return pc.createShaderFromCode
            (
                this.device,
                pc.PostEffect.quadVertexShader,
                upsampleShader,
                `Bloom_Upsample_${Date.now()}`,
                { aPosition: pc.SEMANTIC_POSITION }
            );
    }


    createCombineShader(params) {
        let blendmode, tonemapper;

        switch (params && params.blendmode) {
            case 'add':
                blendmode = '#define BLENDMODE_ADD';
                break;

            case 'screen':
                blendmode = '#define BLENDMODE_SCREEN';
                break;

            default:
                blendmode = '#define BLENDMODE_ADD';
        }

        switch (params && params.tonemapper) {
            case pc.TONEMAP_LINEAR:
                tonemapper = pc.shaderChunks.tonemappingLinearPS;
                break;

            case pc.TONEMAP_FILMIC:
                tonemapper = pc.shaderChunks.tonemappingFilmicPS;
                break;

            case pc.TONEMAP_HEJL:
                tonemapper = pc.shaderChunks.tonemappingHejlPS;
                break;

            case pc.TONEMAP_ACES:
                tonemapper = pc.shaderChunks.tonemappingAcesPS;
                break;

            case pc.TONEMAP_ACES2:
                tonemapper = pc.shaderChunks.tonemappingAces2PS;
                break;

            default:
                tonemapper = pc.shaderChunks.tonemappingNonePS;
        };

        const combineShader =
            `
            precision ${this.device.precision} float;

            uniform sampler2D uSource;
            uniform sampler2D uBloom;
            uniform float uStrength;
            uniform float uGamma;
            varying vec2 vUv0;

            ${blendmode}
            ${tonemapper}

            void main()
            {
                vec3 color = texture2D (uSource, vUv0).rgb;
                vec3 bloom = texture2D (uBloom, vUv0).rgb;

                #ifdef BLENDMODE_ADD
                    color = mix (color, bloom, uStrength);
                    color = toneMap (color);
                #endif

                #ifdef BLENDMODE_SCREEN
                    vec3 c = toneMap (color);
                    vec3 b = toneMap (uStrength * (bloom - color));
                    color = 1.0 - (1.0 - c) * (1.0 - b);
                #endif

                color = pow (color + 0.0000001, vec3 (1.0 / uGamma));

                gl_FragColor = vec4 (color, 1.0);
            }
        `;

        return pc.createShaderFromCode
            (
                this.device,
                pc.PostEffect.quadVertexShader,
                combineShader,
                `Bloom_Combine_${Date.now()}`,
                { aPosition: pc.SEMANTIC_POSITION }
            );
    }

};


//--------------------------------------------------------------------------------------------
//                         Physically Based HDR Bloom - Editor Script                         
//--------------------------------------------------------------------------------------------


const Bloom2023 = pc.createScript('HDR Bloom 2023');


Bloom2023.attributes.add('camera',
    {
        title: 'Camera (Optional)', type: 'entity',
        description: `The camera object to apply Bloom2023 effect to. If no camera is provided the script tries
    to use camera component on its current entity. Eventually if no camera is found there as well -
    the first camera in pc.app.systems.camera.cameras is used.`
    });
Bloom2023.attributes.add('blendmode',
    {
        title: 'Blend Mode', type: 'string', default: 'screen', enum: [{ Add: 'add' }, { Screen: 'screen' }],
        description: `Bloom2023 blending mode. [Add] is using standard additive mixing, [Screen] results in higher
    contrast in extreme cases like super bright lights, maxed out iterations and low mip limit.`
    });
Bloom2023.attributes.add('iterations',
    {
        title: 'Iterations', type: 'number', default: 7, min: 1, max: 12, precision: 0,
        description: `Richness of Bloom2023 effect. The difference between 1 and 12 in terms of performance is
    truly negligible so it's recommended to leave it at maximum unless you're targeting specific artistic
    look. Not all iterations may be used internally since downscaling stops at Mip Limit resolution. Low
    and medium number of iterations may produce different results on retina and non-retina displays
    (pc.app.graphicsDevice.maxPixelRatio = 2 or 1), especially with non-zero filter radius.`
    });
Bloom2023.attributes.add('strength',
    {
        title: 'Strength', type: 'number', default: 25, min: 0, max: 100, precision: 1,
        description: `Blending factor. High values together with bright lights result in a steam room look! :D`
    });
Bloom2023.attributes.add('miplimit',
    {
        title: 'Mip Limit', type: 'number', default: 4, min: 1, max: 16, precision: 0,
        description: `This parameter controls the depth of the mip chain by limiting the lowest resolution
    allowed during downscaling. Going below 4 with maxed out iterations may result in a beautiful full
    screen glow which is possible only at sufficiently high resolutions (1024 and up at pixel ratio 1).`
    });
Bloom2023.attributes.add('thresholdA',
    {
        title: 'Threshold A', type: 'number', default: 0, min: 0, max: 10, precision: 1,
        description: `Thresholding function lower limit. Pixels dimmer than A do not contribute to Bloom2023,
    pixels brighter than B contribute fully, pixels in (A, B) range contribute with smoothstep curve.`
    });
Bloom2023.attributes.add('thresholdB',
    {
        title: 'Threshold B', type: 'number', default: 1, min: 0, max: 10, precision: 1,
        description: `Thresholding function upper limit. Pixels dimmer than A do not contribute to bloom,
    pixels brighter than B contribute fully, pixels in (A, B) range contribute with smoothstep curve.`
    });
Bloom2023.attributes.add('radius',
    {
        title: 'Filter Radius', type: 'vec2', default: [1, 1],
        description: `Radius of additional blur applied during upsampling stage. It's mostly used to
    dilute a minor moire artefact that is visible at radius (0, 0). Due to the nature of texture
    filtering Filter Radius may produce slightly different Bloom2023 kernel depending on device pixel
    ratio (i.e. retina and non-retina displays), so you may want to adjust it dynamically depending
    on window.devicePixelRatio or pc.app.graphicsDevice.maxPixelRatio.`
    });
Bloom2023.attributes.add('hdrformat',
    {
        title: 'HDR Format', type: 'number', default: pc.PIXELFORMAT_111110F,
        enum: [{ '11 bit': pc.PIXELFORMAT_111110F },
        { '16 bit': pc.PIXELFORMAT_RGBA16F },
        { '32 bit': pc.PIXELFORMAT_RGBA32F }],
        description: `Preferred HDR format. Actual format chosen by system may differ due to hardware
    compatibility. 11 bit is the best choice overall, it provides tangible performance benefits and
    is also widely supported even on old devices like iPhone 8. If selected format is not supported
    by target system the first valid lower format will be used.`
    });


Bloom2023.prototype.initialize = function () {
    this.effect = null;
    this.camcam = null;

    this.on('enable', this.handleEnable, this);
    this.on('disable', this.handleDisable, this);
    this.on('attr', this.handleAttribute, this);
    this.once('destroy', this.destroy, this);
};


Bloom2023.prototype.postInitialize = function () {
    this.handleEnable();
};


Bloom2023.prototype.handleEnable = function () {
    this.camcam = (this.camera && this.camera.camera) ||
        this.entity.camera ||
        this.app.systems.camera.cameras[0];

    if (!this.effect && this.camcam) {
        this.effect = this.createEffect();
        this.camcam.postEffects.addEffect(this.effect);
    }
};


Bloom2023.prototype.handleDisable = function () {
    if (this.effect) {
        this.camcam && this.camcam.postEffects.removeEffect(this.effect);
        this.destroyEffect(this.effect);
        this.effect = null;
    }
};


Bloom2023.prototype.handleAttribute = function (name, value) {
    if (this.effect) {
        if (name === 'camera') {
            this.handleDisable();
            this.handleEnable();
        }
        else {
            this.effect.configure({ [name]: value });
        }
    }
};


Bloom2023.prototype.update = function () {
    if (this.effect)
        this.updateEffect(this.effect);
};


Bloom2023.prototype.createEffect = function () {

    var tonemapper = pc.TONEMAP_LINEAR;
    var gamma = pc.GAMMA_NONE;
    if (this.app.scene.hasOwnProperty('toneMapping')) {
        tonemapper = this.app.scene.toneMapping;
    } else {
        tonemapper = this.camcam.toneMapping;
    }

    if (this.app.scene.hasOwnProperty('gammaCorrection')) {
        gamma = this.app.scene.gammaCorrection;
    } else {
        gamma = this.camcam.gammaCorrection;
    }

    var exposure = this.app.scene.exposure;

    return new Bloom2025Effect(this.app.graphicsDevice,
        {
            blendmode: this.blendmode,
            iterations: this.iterations,
            strength: this.strength,
            miplimit: this.miplimit,
            thresholdA: this.thresholdA,
            thresholdB: this.thresholdB,
            radius: this.radius,
            hdrformat: this.hdrformat,
            tonemapper: tonemapper,
            exposure: exposure,
            gamma: gamma
        });
};


Bloom2023.prototype.updateEffect = function (effect) {

    if (this.app.scene.hasOwnProperty('toneMapping')) {
        if (this.app.scene.toneMapping !== pc.TONEMAP_NONE) {
            effect.configure({ tonemapper: this.app.scene.toneMapping });
            this.app.scene.toneMapping = pc.TONEMAP_NONE;
        }
    } else {
        if (this.camcam.toneMapping !== pc.TONEMAP_NONE) {
            effect.configure({ tonemapper: this.camcam.toneMapping });
            this.camcam.toneMapping = pc.TONEMAP_NONE;
        }
    }

    if (this.app.scene.hasOwnProperty('gammaCorrection')) {
        if (this.app.scene.gammaCorrection === pc.GAMMA_SRGB ||
            this.app.scene.gammaCorrection === pc.GAMMA_SRGBFAST) {
            effect.configure({ gamma: this.app.scene.gammaCorrection });
            this.app.scene.gammaCorrection = pc.GAMMA_SRGBHDR;
        }
        else if (this.app.scene.gammaCorrection === pc.GAMMA_NONE) {
            effect.configure({ gamma: pc.GAMMA_NONE });
        }
    } else {
        if (this.camcam.gammaCorrection === pc.GAMMA_SRGB ||
            this.camcam.gammaCorrection === pc.GAMMA_SRGBFAST) {
            effect.configure({ gamma: this.camcam.gammaCorrection });
            this.camcam.gammaCorrection = pc.GAMMA_SRGBHDR;
        }
        else if (this.camcam.gammaCorrection === pc.GAMMA_NONE) {
            effect.configure({ gamma: pc.GAMMA_NONE });
        }
    }

    effect.configure({ exposure: this.app.scene.exposure });
};


Bloom2023.prototype.destroyEffect = function (effect) {
    this.app.scene.toneMapping = effect.params.tonemapper;
    this.app.scene.gammaCorrection = effect.params.gamma;

    effect.destroy();
};


Bloom2023.prototype.destroy = function () {
    this.off('enable', this.handleEnable, this);
    this.off('disable', this.handleDisable, this);
    this.off('attr', this.handleAttribute, this);

    this.handleDisable();
};


