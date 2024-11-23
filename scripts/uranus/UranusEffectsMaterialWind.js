var UranusEffectsMaterialWind = pc.createScript("uranusEffectsMaterialWind");
UranusEffectsMaterialWind.attributes.add("inEditor", {
    type: "boolean",
    default: !0
}),
    UranusEffectsMaterialWind.attributes.add("eventEntity", {
        type: "entity",
        title: "Event Holder",
        description: "If an event entity is provided then all events will fire on that entity. Otherwise they will fire on the app object."
    }),
    UranusEffectsMaterialWind.attributes.add("onRender", {
        type: "string",
        title: "On Render",
        description: "If an event name is provided the shader will update automatically when the event will fire. Useful when combining multiple effects on the same shader (e.g. terrain splatmaps with surface noise)."
    }),
    UranusEffectsMaterialWind.attributes.add("materialAssets", {
        type: "asset",
        assetType: "material",
        array: !0
    }),
    UranusEffectsMaterialWind.attributes.add("windChannels", {
        type: "json",
        array: !0,
        schema: [{
            name: "x",
            type: "boolean",
            default: !0,
            title: "X"
        }, {
            name: "y",
            type: "boolean",
            default: !1,
            title: "Y"
        }, {
            name: "z",
            type: "boolean",
            default: !0,
            title: "Z"
        }, {
            name: "wavelength",
            type: "number",
            default: .5,
            title: "Wavelength"
        }, {
            name: "amplitude",
            type: "number",
            default: .05,
            title: "Amplitude"
        }, {
            name: "timeOffset",
            type: "number",
            default: 0,
            title: "Time Offset",
            description: "You can set an optional time offset per channel to further randomize the wind animation."
        }, {
            name: "textureCoord",
            type: "string",
            default: "vertex_texCoord0",
            enum: [{
                UV0: "vertex_texCoord0"
            }, {
                UV1: "vertex_texCoord1"
            }, {
                World: "world"
            }],
            title: "Texture Coord",
            description: "Set which set of coordinates will be used to calculate the wind animation."
        }, {
            name: "textureCoordAxis",
            type: "string",
            default: "y",
            enum: [{
                X: "x"
            }, {
                Y: "y"
            }, {
                Z: "z"
            }],
            title: "Texture Coord Axis",
            description: "The axis on which the wind animation will play on. To use multiple axis you can add more channels."
        }, {
            name: "windBase",
            type: "number",
            default: 0,
            min: 0,
            max: 1,
            title: "Wind Base",
            description: "Set the starting coordinates value in the range of 0.0 to 1.0 for the wind animation."
        }, {
            name: "invertCoords",
            type: "boolean",
            default: !1,
            title: "Invert Coordinates",
            description: "If selected the coordinates used will be inverted."
        }]
    }),
    UranusEffectsMaterialWind.attributes.add("useLocalClock", {
        type: "boolean",
        default: !1,
        title: "Use Local Clock",
        description: "Spawn a local clock instead of using the global wind timer."
    }),
    UranusEffectsMaterialWind.attributes.add("windTimeSpeed", {
        type: "number",
        default: 0,
        min: 0,
        title: "Wind Time Speed",
        description: "Can be used to control the wind animation speed, works only with a local wind clock."
    }),
    UranusEffectsMaterialWind.attributes.add("windGustSize", {
        type: "number",
        default: .5,
        title: "Wind Gust Size",
        description: "The size in world units of each  wind gust."
    }),
    UranusEffectsMaterialWind.attributes.add("windDirection", {
        type: "vec2",
        default: [1, 1],
        title: "Wind Direction",
        description: "The wind direction in the X and Z axis."
    }),
    UranusEffectsMaterialWind.attributes.add("interactObject", {
        type: "boolean",
        default: !1,
        title: "Interact Object",
        description: "If selected the vertices of the model will be pushed away by any objects nearby."
    }),
    UranusEffectsMaterialWind.attributes.add("interactList", {
        type: "entity",
        array: !0,
        title: "Interact List",
        description: "A list of entities that can interact with this material (on WebGL1 devices a maximum of 20 entities is supported)."
    }),
    UranusEffectsMaterialWind.attributes.add("interactRadius", {
        type: "number",
        default: 1,
        minimum: 0,
        title: "Interact Radius",
        description: "The area around each interaction entity that will be pushed away."
    }),
    UranusEffectsMaterialWind.attributes.add("interactAxis", {
        type: "json",
        schema: [{
            name: "x",
            type: "boolean",
            default: !0,
            title: "X"
        }, {
            name: "y",
            type: "boolean",
            default: !0,
            title: "Y"
        }, {
            name: "z",
            type: "boolean",
            default: !0,
            title: "Z"
        }],
        title: "Interact Axis",
        description: "Set the axis the vertext interact effect will be applied."
    }),
    UranusEffectsMaterialWind.attributes.add("billboard", {
        type: "boolean",
        default: !1,
        title: "Billboard",
        description: "If selected the model will be rendered as a billboard to always face the camera."
    }),
    UranusEffectsMaterialWind.attributes.add("billboardLockY", {
        type: "boolean",
        default: !0,
        title: "Billboard Lock Y",
        description: "If set to true the billboard rotation will be only on Y axis, otherwise it will face the camera in all direction."
    }),
    UranusEffectsMaterialWind.attributes.add("billboardReverseSize", {
        type: "boolean",
        default: !1,
        title: "Billboard Reverse Size",
        description: "If selected the billboard half extents calculation from the reference render asset will be reversed."
    }),
    UranusEffectsMaterialWind.attributes.add("billboardRefSize", {
        type: "asset",
        assetType: "render",
        array: !0,
        description: "Provide a list of render assets for each material (in the same order), to be used for sizing the billboard."
    }),
    UranusEffectsMaterialWind.prototype.initialize = function () {
        !1 !== this.app.graphicsDevice.webgl2 ? (this.arr2 = [0, 0],
            this.interactionArr = [],
            this.prepare(),
            this.on("attr", (function (e) {
                "windGustSize" === e || "windDirection" === e ? this.materialAssets.forEach((e => this.updateAttributes(e.resource))) : this.materialAssets.forEach((e => this.updateMaterial(e.resource)))
            }
            )),
            this.on("state", (function (e) {
                e ? this.materialAssets.forEach((e => this.updateMaterial(e.resource))) : this.materialAssets.forEach((e => this.clearMaterial(e.resource)))
            }
            ))) : this.enabled = !1
    }
    ,
    UranusEffectsMaterialWind.prototype.prepare = async function () {
        this.useLocalClock ? (this.time = 0,
            this.clockUniform = "uranus_material_wind_time_local") : (this.clockUniform = "uranus_material_wind_time",
                UranusEffectsMaterialWind.time || UranusEffectsMaterialWind.prepareGlobal(this.app)),
            await UranusUtilities.loadAssets(this.materialAssets.concat(this.billboardRefSize)),
            this.materialAssets.forEach((e => {
                e.ready(this.onMaterialReady.bind(this)),
                    e.on("change", this.onMaterialReady.bind(this))
            }
            ))
    }
    ,
    UranusEffectsMaterialWind.prototype.onMaterialReady = function (e) {
        if (this.onRender) {
            (this.eventEntity ? this.eventEntity : this.app).on(this.onRender, (function () {
                this.updateMaterial(e.resource)
            }
            ), this)
        } else
            this.updateMaterial(e.resource)
    }
    ,
    UranusEffectsMaterialWind.prototype.updateMaterial = function (e) {
        UranusUtilities.prepareShaderForInjection(e, "transformVS");
        let t = e.chunks.transformVS_uranusBase
            , i = `\nuniform float ${this.clockUniform};\nuniform float windGustSize;\nuniform vec2 windDirection;\n`;
        this.interactObject && (i += "\nuniform vec3 interactionList[20];\nuniform int interactionListLength;\n"),
            this.billboard && (i += "\nuniform vec2 billboardSize;\n");
        let a = this.getWindChunk();
        this.interactObject && (a += this.getInteractChunk()),
            t = t.replace("// INJECT uniforms", i),
            this.billboard && (t = this.applyBillboard(t, e)),
            t = t.replace("// INJECT chunk", a),
            e.chunks.transformVS = t,
            e.chunks.APIVersion = pc.CHUNKAPI_1_55,
            e.update(),
            this.updateAttributes(e)
    }
    ,
    UranusEffectsMaterialWind.prototype.applyBillboard = function (e, t) {
        const i = this.materialAssets.findIndex((e => e.resource === t))
            , a = this.billboardRefSize[i];
        let n;
        if (a) {
            const e = a.resource.meshes[0]
                , t = [e.aabb.halfExtents.x, e.aabb.halfExtents.y, e.aabb.halfExtents.z];
            t.reverse(),
                n = [t[0], t[1]],
                this.billboardReverseSize && n.sort()
        } else
            n = [1, 1];
        return t.setParameter("billboardSize", n),
            e.replace("vec4 posW = dModelMatrix * vec4(localPos, 1.0);", `\n    vec3 right = vec3(matrix_view[0][0], matrix_view[1][0], matrix_view[2][0]);\n\n    ${this.billboardLockY ? "\n    vec3 up = vec3(0.0, 1.0, 0.0);\n" : "\n    vec3 up\t= vec3(matrix_view[0][1], matrix_view[1][1], matrix_view[2][1]);\n"}\n    vec2 billboardSizeScaled = billboardSize;\n\n    // --- if the billboard is instanced, uniform scaling is supported\n    #ifdef INSTANCING\n        billboardSizeScaled *= instance_line3.y;\n    #endif\n    \n    vec3 actualQuadCenter = vec3(dModelMatrix[3][0], dModelMatrix[3][1], dModelMatrix[3][2]);\n    actualQuadCenter.y += billboardSizeScaled.y;\n\n    vec2 quadPos = vertex_texCoord0 * 2.0 - vec2(1.0);\n\n    localPos = actualQuadCenter - (quadPos.x * right * billboardSizeScaled.x + quadPos.y * up * billboardSizeScaled.y);\n    vec4 posW = vec4(localPos, 1.0);\n`)
    }
    ,
    UranusEffectsMaterialWind.prototype.getWindChunk = function () {
        let e = "";
        return this.windChannels.forEach(((t, i) => {
            "world" !== t.textureCoord ? e += `\n    vec2 uv${i} = vec2(${t.textureCoord}.x, 1.0 -  ${t.textureCoord}.y);\n\n    float height${i} = uv${i}.y >= ${t.windBase.toFixed(2)} ? pow(${t.invertCoords ? "1.0 -" : ""}uv${i}.${t.textureCoordAxis}, 2.0) : 0.0;\n    \n    float posTime${i} = ${this.clockUniform} + ${t.timeOffset.toFixed(2)};\n\n    ${t.x ? `posW.x += sin( posTime${i} * ${t.amplitude.toFixed(2)} + posW.x * windGustSize) * height${i} * ${t.wavelength.toFixed(2)} * windDirection.x;` : ""}\n    ${t.y ? `posW.y += sin( posTime${i} * ${t.amplitude.toFixed(2)} + posW.y * windGustSize) * height${i} * ${t.wavelength.toFixed(2)} * windDirection.y;` : ""}\n    ${t.z ? `posW.z += sin( posTime${i} * ${t.amplitude.toFixed(2)} + posW.z * windGustSize) * height${i} * ${t.wavelength.toFixed(2)} * windDirection.y;` : ""}\n    ` : e += `    \n      float posWorldTime${i} = ${this.clockUniform} + ${t.timeOffset.toFixed(2)};\n      posW.${t.textureCoordAxis} +=cos( (posW.x + posWorldTime${i}) /${t.wavelength.toFixed(2)} ) * sin( (posW.z + posWorldTime${i}) /${t.wavelength.toFixed(2)} ) * ${t.amplitude.toFixed(2)};\n      `
        }
        )),
            e
    }
    ,
    UranusEffectsMaterialWind.prototype.getInteractChunk = function () {
        return `\n    for (int i = 0; i < ${this.app.graphicsDevice.webgl2 ? "interactionListLength" : "20"}; i++){\n       vec3 interactionPos = interactionList[i];\n       vec3 dis = vec3(distance(interactionPos, posW.xyz));\n       vec3 circle = 1.0 - clamp(dis / ${this.interactRadius.toFixed(2)},0.0,1.0);\n       vec3 sphereDisp = posW.xyz - interactionPos;\n       sphereDisp *= circle;\n       sphereDisp.y = clamp(sphereDisp.y, -1.0, 0.0);\n       sphereDisp.xyz *= 2.0;\n       ${this.interactAxis.x ? "posW.x += sphereDisp.x;" : ""}\n       ${this.interactAxis.y ? "posW.y += sphereDisp.y;" : ""}\n       ${this.interactAxis.z ? "posW.z += sphereDisp.z;" : ""}\n    }\n`
    }
    ,
    UranusEffectsMaterialWind.prototype.clearMaterial = function (e) {
        e && (delete e.chunks.transformVS,
            e.update())
    }
    ,
    UranusEffectsMaterialWind.prototype.updateAttributes = function (e) {
        e.setParameter("windGustSize", this.windGustSize),
            e.setParameter("windGustSize", this.windGustSize),
            this.arr2[0] = this.windDirection.x,
            this.arr2[1] = this.windDirection.y,
            e.setParameter("windDirection", this.arr2)
    }
    ,
    UranusEffectsMaterialWind.prototype.updateInteractAttributes = function (e) {
        const t = this.interactionArr;
        let i = 0;
        this.interactList.forEach((e => {
            if (!e)
                return !0;
            const a = e.getPosition();
            t[i++] = a.x,
                t[i++] = a.y,
                t[i++] = a.z
        }
        )),
            e.setParameter("interactionList[0]", t),
            !0 === this.app.graphicsDevice.webgl2 && e.setParameter("interactionListLength", i / 3)
    }
    ,
    UranusEffectsMaterialWind.prototype.update = function (e) {
        this.useLocalClock && (this.time += e * this.windTimeSpeed),
            this.materialAssets.forEach((e => {
                const t = e.resource;
                t && (this.useLocalClock && t.setParameter("uranus_material_wind_time_local", this.time),
                    this.interactObject && this.updateInteractAttributes(t))
            }
            ))
    }
    ,
    UranusEffectsMaterialWind.time = 0,
    UranusEffectsMaterialWind.prepareGlobal = function (e) {
        this.app = e,
            this.windTimeId = this.app.graphicsDevice.scope.resolve("uranus_material_wind_time"),
            this.app.on("update", UranusEffectsMaterialWind.appUpdate, this)
    }
    ,
    UranusEffectsMaterialWind.appUpdate = function (e) {
        UranusEffectsMaterialWind.time += e,
            this.windTimeId.setValue(UranusEffectsMaterialWind.time)
    }
    ;