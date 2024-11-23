var UranusEffectsMaterialTextureMix = pc.createScript("uranusEffectsMaterialTextureMix");
UranusEffectsMaterialTextureMix.attributes.add("inEditor", {
    type: "boolean",
    default: !0
}),
    UranusEffectsMaterialTextureMix.attributes.add("materialAsset", {
        type: "asset",
        assetType: "material"
    }),
    UranusEffectsMaterialTextureMix.attributes.add("mixChannel", {
        type: "string",
        default: "diffusePS",
        enum: [{
            Diffuse: "diffusePS"
        }, {
            Emissive: "emissivePS"
        }]
    }),
    UranusEffectsMaterialTextureMix.attributes.add("mixTextureA", {
        type: "asset",
        assetType: "texture",
        title: "Mix Texture A",
        description: "The texture to mix from based on the alpha value provided."
    }),
    UranusEffectsMaterialTextureMix.attributes.add("mixTextureB", {
        type: "asset",
        assetType: "texture",
        title: "Mix Texture B",
        description: "The texture to mix to based on the alpha value provided."
    }),
    UranusEffectsMaterialTextureMix.attributes.add("mixAlpha", {
        type: "number",
        default: .5,
        min: 0,
        max: 1,
        title: "Mix Alpha",
        description: "The alpha value used to mix the base and mix textures."
    }),
    UranusEffectsMaterialTextureMix.attributes.add("animateEvent", {
        type: "string",
        default: "",
        title: "Animate Event",
        description: "An app wide animation event that can be called with a true/false argument and animate the transition."
    }),
    UranusEffectsMaterialTextureMix.attributes.add("animateTime", {
        type: "number",
        default: 1,
        title: "Animate Time",
        description: "The time it takes to animate a full transition when the animate event is called."
    }),
    UranusEffectsMaterialTextureMix.prototype.initialize = function () {
        this.materialAsset.ready((() => this.updateMaterial(this.materialAsset.resource))),
            this.materialAsset.on("change", (() => this.updateMaterial(this.materialAsset.resource))),
            UranusUtilities.loadAsset(this.materialAsset),
            this.animateEvent && (this.app.on(this.animateEvent, (function (e) {
                void 0 !== e ? this.onAnimate(e) : this.onAnimate(this.mixAlpha > 0 ? 0 : 1)
            }
            ), this),
                this.app.on(`${this.animateEvent}:off`, (function () {
                    this.onAnimate(0)
                }
                ), this),
                this.app.on(`${this.animateEvent}:on`, (function () {
                    this.onAnimate(1)
                }
                ), this)),
            this.on("attr", (function () {
                this.updateAttributes(this.materialAsset.resource)
            }
            )),
            this.on("state", (function (e) {
                e ? this.updateMaterial(this.materialAsset.resource) : this.clearMaterial(this.materialAsset.resource)
            }
            ))
    }
    ,
    UranusEffectsMaterialTextureMix.prototype.updateMaterial = function (e) {
        const t = this.getShader();
        if (!t)
            return !1;
        e.chunks[this.mixChannel] = t,
            e.chunks.APIVersion = pc.CHUNKAPI_1_58,
            e.update(),
            this.updateAttributes(e)
    }
    ,
    UranusEffectsMaterialTextureMix.prototype.getShader = function () {
        const e = "\nuniform sampler2D texture_mixTextureA;\nuniform sampler2D texture_mixTextureB;\nuniform float mixAlpha;\n    ";
        switch (this.mixChannel) {
            case "diffusePS":
                return `\n${e}\n#ifdef MAPCOLOR\nc\n#endif\n\nvoid getAlbedo() {\n    dAlbedo = vec3(1.0);\n\n#ifdef MAPCOLOR\n    dAlbedo *= material_diffuse.rgb;\n#endif\n\n#ifdef MAPTEXTURE\n    vec3 albedoBase1 = $DECODE(texture2DBias(texture_mixTextureA, $UV, textureBias)).$CH;\n    vec3 albedoBase2 = $DECODE(texture2DBias(texture_mixTextureB, $UV, textureBias)).$CH;\n\n    vec3 albedoBase = mix(albedoBase1, albedoBase2, mixAlpha);\n\n    dAlbedo *= addAlbedoDetail(albedoBase);\n#endif\n\n#ifdef MAPVERTEX\n    dAlbedo *= gammaCorrectInput(saturate(vVertexColor.$VC));\n#endif\n}        \n        `;
            case "emissivePS":
                return `\n${e}\n#ifdef MAPCOLOR\nuniform vec3 material_emissive;\n#endif\n\n#ifdef MAPFLOAT\nuniform float material_emissiveIntensity;\n#endif\n\nvoid getEmission() {\n    dEmission = vec3(1.0);\n\n    #ifdef MAPFLOAT\n    dEmission *= material_emissiveIntensity;\n    #endif\n\n    #ifdef MAPCOLOR\n    dEmission *= material_emissive;\n    #endif\n\n    #ifdef MAPTEXTURE\n    vec3 emissionBase1 = $DECODE(texture2DBias(texture_mixTextureA, $UV, textureBias)).$CH;\n    vec3 emissionBase2 = $DECODE(texture2DBias(texture_mixTextureB, $UV, textureBias)).$CH;\n\n    vec3 emissionBase = mix(emissionBase1, emissionBase2, mixAlpha);\n\n    dEmission *= emissionBase;\n    #endif\n\n    #ifdef MAPVERTEX\n    dEmission *= gammaCorrectInput(saturate(vVertexColor.$VC));\n    #endif\n}        \n        `
        }
    }
    ,
    UranusEffectsMaterialTextureMix.prototype.clearMaterial = function (e) {
        e && (delete e.chunks[this.mixChannel],
            e.update())
    }
    ,
    UranusEffectsMaterialTextureMix.prototype.updateAttributes = async function (e) {
        if (!this.mixTextureA.loaded || !this.mixTextureB.loaded) {
            const t = this.app.assets.find("texture-white.jpg");
            e.setParameter("texture_mixTextureA", t.resource),
                e.setParameter("texture_mixTextureB", t.resource),
                await UranusUtilities.loadAssets([this.mixTextureA, this.mixTextureB])
        }
        e.setParameter("texture_mixTextureA", this.mixTextureA.resource),
            e.setParameter("texture_mixTextureB", this.mixTextureB.resource),
            e.setParameter("mixAlpha", this.mixAlpha)
    }
    ,
    UranusEffectsMaterialTextureMix.prototype.onAnimate = function (e) {
        const t = this.materialAsset?.resource;
        if (!t)
            return;
        this.animateTween && this.animateTween.stop();
        const i = {
            alpha: this.mixAlpha
        };
        this.animateTween = this.app.tween(i).to({
            alpha: e
        }, this.animateTime, pc.SineInOut).onUpdate((() => {
            this.mixAlpha = i.alpha,
                t.setParameter("mixAlpha", i.alpha)
        }
        )).onComplete((() => {
            this.mixAlpha = e,
                this.animateTween = void 0
        }
        )).start()
    }
    ;