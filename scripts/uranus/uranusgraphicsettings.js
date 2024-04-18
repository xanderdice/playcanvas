var UranusGraphicsSettings = pc.createScript("uranusGraphicsSettings");
UranusGraphicsSettings.attributes.add("inEditor", {
    type: "boolean",
    default: !1
}),
    UranusGraphicsSettings.attributes.add("showDialog", {
        type: "boolean",
        default: !0,
        title: "Show Dialog"
    }),
    UranusGraphicsSettings.attributes.add("startingPreset", {
        type: "string",
        default: "desktop",
        title: "Starting Preset"
    }),
    UranusGraphicsSettings.attributes.add("autoSelectPreset", {
        type: "boolean",
        default: !0,
        title: "Auto Select Preset",
        description: "If selected a graphics preset will automatically be selected based on the device platform."
    }),
    UranusGraphicsSettings.attributes.add("lobbyEntity", {
        type: "entity",
        title: "Lobby Entity",
        description: "If an entity is provided the lobby entity will be enabled as soon as the settings dialog is enabled."
    }),
    UranusGraphicsSettings.attributes.add("startEntity", {
        type: "entity",
        title: "Start Entity",
        description: "If an entity is provided a start button will be created to enable that entity on user's action. The lobby entity will be disabled at the same time."
    }),
    UranusGraphicsSettings.attributes.add("playerControllers", {
        type: "entity",
        array: !0,
        title: "Player Controllers",
        description: "One or more player controllers to be used with the Toggle Controller button."
    }),
    UranusGraphicsSettings.attributes.add("defaultController", {
        type: "entity",
        title: "Default Controller",
        description: "The default controller the game will start with."
    }),
    UranusGraphicsSettings.attributes.add("grassObjects", {
        type: "entity",
        array: !0,
        title: "Grass Objects",
        description: "A list of entities to be disabled if grass is disabled in settings."
    }),
    UranusGraphicsSettings.attributes.add("terrainEntities", {
        type: "entity",
        array: !0,
        title: "Terrain Entities",
        description: "If one or more terrain entities are provided, they will be binded to the terrain shadows toggle."
    }),
    UranusGraphicsSettings.attributes.add("minTerrainLod", {
        type: "number",
        title: "Min Terrain Lod",
        description: "The minimum terrain LOD when no shadows are cast from the terain."
    }),
    UranusGraphicsSettings.attributes.add("soundVolume", {
        type: "number",
        default: .25,
        min: 0,
        max: 1,
        title: "Sound Volume"
    }),
    UranusGraphicsSettings.attributes.add("mapButton", {
        type: "boolean",
        default: !1,
        title: "Map Button"
    }),
    UranusGraphicsSettings.attributes.add("downgradePreset", {
        type: "json",
        schema: [{
            name: "minPreset",
            type: "string",
            default: "android",
            title: "Min Preset",
            description: "Preset to fall back to if minimum FPS threshold is crossed. Leave blank to disable the check."
        }, {
            name: "minFps",
            type: "number",
            default: 20,
            min: 1,
            title: "Min FPS",
            description: "The minimum FPS limit."
        }, {
            name: "minTime",
            type: "number",
            default: 3,
            min: 0,
            title: "Min Time",
            description: "The time in seconds the FPS should be lower than the limit to force a downgrade."
        }, {
            name: "startTime",
            type: "number",
            default: 5,
            min: 0,
            title: "Start Time",
            description: "The time in seconds counting from the application start the downgrade check should be enabled. Set to 0 to keep it always enabled."
        }],
        title: "Downgrade Preset"
    }),
    UranusGraphicsSettings.attributes.add("presets", {
        type: "json",
        array: !0,
        schema: [{
            name: "id",
            type: "string",
            default: "mobile",
            title: "ID"
        }, {
            name: "title",
            type: "string",
            default: "Mobile",
            title: "Title",
            description: "The title of the preset shown in the dialog."
        }, {
            name: "platforms",
            type: "string",
            default: "mobile",
            title: "Platforms"
        }, {
            name: "resolution",
            type: "number",
            min: 0,
            max: 2,
            default: 1,
            title: "Resolution",
            description: "This defines how much the resolution will be downscaled or upscaled in relation to the viewport resolution. Leverage the browser bilinear filtering to increase performance by rendering your application in a lower resolution. Or render to a higher resolution for reducing anti alias."
        }, {
            name: "devicePixelRatio",
            type: "number",
            min: 0,
            max: 1,
            default: 0,
            title: "Device Pixel Ratio",
            description: "A normalized value 0-1 to indicate min/max device pixel ratio."
        }, {
            name: "staticAo",
            type: "boolean",
            default: !1,
            title: "Static AO"
        }, {
            name: "fogNoise",
            type: "boolean",
            default: !1,
            title: "Fog Noise",
            description: "Requires page reload."
        }, {
            name: "grass",
            type: "boolean",
            default: !1,
            title: "Grass",
            description: "Requires page reload."
        }, {
            name: "lights",
            type: "boolean",
            default: !1,
            title: "Lights"
        }, {
            name: "lodMultiplier",
            type: "number",
            min: .25,
            max: 3,
            default: 1,
            title: "LOD Multiplier"
        }, {
            name: "localShadows",
            type: "boolean",
            default: !1,
            title: "Local Shadows"
        }, {
            name: "postEffects",
            type: "boolean",
            default: !1,
            title: "Post Effects"
        }, {
            name: "postEffectsTypes",
            type: "string",
            default: "ssao,bloom,fxaa,vignette,chromaticAberration,sharpen,bokeh",
            title: "Post Effects Types"
        }, {
            name: "planarReflections",
            type: "boolean",
            default: !1,
            title: "Planar Reflections"
        }, {
            name: "playerParticles",
            type: "boolean",
            default: !0,
            title: "Player Particles"
        }, {
            name: "sunShadows",
            type: "boolean",
            default: !1,
            title: "Sun Shadows"
        }, {
            name: "shadowsCascades",
            type: "number",
            min: 1,
            max: 4,
            precision: 0,
            default: 2,
            title: "Shadows Cascades"
        }, {
            name: "shadowsDistance",
            type: "number",
            min: 1,
            max: 1e3,
            precision: 0,
            default: 600,
            title: "Shadows Distance"
        }, {
            name: "skyClouds",
            type: "boolean",
            default: !1,
            title: "Sky Clouds"
        }, {
            name: "surfaceBlend",
            type: "boolean",
            default: !1,
            title: "Surface Blend"
        }]
    }),
    UranusGraphicsSettings.postEffectsTypes = ["ssao", "bloom", "fxaa", "vignette", "chromaticAberration", "sharpen", "bokeh", "hueSaturation"],
    UranusGraphicsSettings.prototype.initialize = function () {
        UranusGraphicsSettings.api = this,
            this.activePreset = void 0,
            this.dialogPane = void 0,
            this.dialogInputs = {},
            this.buttons = {},
            this.activePlayerController = this.playerControllers[0],
            this.gameStarted = !1,
            this.gameStartTime = 0,
            this.prepare(),
            this.updateSettings(),
            this.showDialog && (this.lobbyEntity && (this.lobbyEntity.enabled = !0),
                this.startEntity && (this.startEntity.enabled = !1),
                this.createDialog()),
            this.on("attr", ((t, e) => {
                "startingPreset" === t ? this.setSelectedPreset(e) : this.setSelectedPreset(this.startingPreset),
                    this.updateSettings()
            }
            )),
            this.app.on("UranusGraphicsSettings:startGame", this.startGame, this),
            this.app.on("UranusGraphicsSettings:setButtonState", this.setButtonState, this),
            this.app.on("UranusGraphicsSettings:setPreset", (function (t) {
                t ? this.setSelectedPreset(t) : this.setSelectedPreset(this.startingPreset),
                    this.updateSettings()
            }
            ), this)
    }
    ,
    UranusGraphicsSettings.prototype.prepare = function () {
        if (!1 === this.app.graphicsDevice.isWebGL2) {
            const t = this.getScriptInstancesByType("uranusInstancerOcclusion");
            t.forEach((e => {
                e.entity.render && (e.entity.render.enabled = !1),
                    t.enabled = !1
            }
            ))
        }
        if (this.app.systems.sound.volume = this.soundVolume,
            this.autoSelectPreset) {
            const t = this.presets.slice().reverse().find((t => {
                if (!t.platforms)
                    return !1;
                let e = !1;
                return t.platforms.split(",").forEach((t => {
                    !e && pc.platform[t] && (e = !0)
                }
                )),
                    e
            }
            ));
            t && (this.startingPreset = t.id)
        }
        const t = this.getPresetByName(this.startingPreset);
        this.activePreset = JSON.parse(JSON.stringify(t)),
            this.activePresetID = this.activePreset.id,
            this.activePreset.id = void 0
    }
    ,
    UranusGraphicsSettings.prototype.update = function (t) {
        const e = this.downgradePreset
            , i = e.minPreset;
        if (this.gameStartTime += t,
            e && (0 === e.startTime || this.gameStartTime <= e.startTime) && i !== this.activePresetID) {
            const s = pc.app.stats?.frame?.fps;
            s > 0 && s <= e.minFps ? (void 0 === this.downgradeTimer && (this.downgradeTimer = e.minTime),
                this.downgradeTimer -= t,
                this.downgradeTimer <= 0 && (this.downgradeTimer = void 0,
                    this.app.fire("UranusGraphicsSettings:setPreset", i))) : this.downgradeTimer = void 0
        }
    }
    ,
    UranusGraphicsSettings.prototype.setSelectedPreset = function (t) {
        if (t) {
            const e = this.getPresetByName(t);
            for (let t in e)
                "id" !== t ? this.activePreset[t] = e[t] : this.activePresetID = e[t]
        }
    }
    ,
    UranusGraphicsSettings.prototype.getPresetByName = function (t) {
        return this.presets.find((e => e.id === t))
    }
    ,
    UranusGraphicsSettings.prototype.getScriptInstancesByType = function (t) {
        return this.app.root.find((e => e.script && e.script[t])).map((e => e.script[t]))
    }
    ,
    UranusGraphicsSettings.prototype.getEntitiesByTag = function (t) {
        return this.app.root.findByTag(t)
    }
    ,
    UranusGraphicsSettings.prototype.getCameras = function () {
        return this.app.root.findComponents("camera")
    }
    ,
    UranusGraphicsSettings.prototype.getLights = function () {
        return this.app.root.findComponents("light")
    }
    ,
    UranusGraphicsSettings.prototype.addComponentLayer = function (t, e) {
        const i = this.app.scene.layers.getLayerByName(e);
        if (!i)
            return;
        const s = t.layers;
        if (!s)
            return;
        -1 === s.indexOf(i.id) && s.push(i.id),
            t.layers = s
    }
    ,
    UranusGraphicsSettings.prototype.removeComponentLayer = function (t, e) {
        const i = this.app.scene.layers.getLayerByName(e);
        if (!i)
            return;
        const s = t.layers;
        if (!s)
            return;
        const a = s.indexOf(i.id);
        s.splice(a, 1),
            t.layers = s
    }
    ,
    UranusGraphicsSettings.prototype.getDevicePixelRatio = function (t) {
        return 1 + (window.devicePixelRatio - 1) * t
    }
    ,
    UranusGraphicsSettings.prototype.updateSettings = function (t) {
        t && this.setSelectedPreset(t);
        const e = this.activePreset
            , i = this.getScriptInstancesByType("uranusGraphicsResolution")[0];
        i && (i.resolution = e.resolution),
            this.app.graphicsDevice.maxPixelRatio = this.getDevicePixelRatio(e.devicePixelRatio),
            this.grassObjects.forEach((t => t.enabled = e.grass));
        if (this.getScriptInstancesByType("uranusEffectsMaterialAoStatic").forEach((t => t.active = e.staticAo)),
            !this.gameStarted) {
            this.getScriptInstancesByType("uranusEffectsEnvironmentFog").forEach((t => t.fogNoise = e.fogNoise))
        }
        UranusInstancer.api && (UranusInstancer.api.lodMultiplier = e.lodMultiplier),
            this.app.root.findComponents("light").forEach((t => {
                if ("directional" === t.type)
                    return !0;
                t.enabled = e.lights
            }
            ));
        this.getScriptInstancesByType("uranusEffectsPlanarReflections").forEach((t => {
            t.reflectionLayersOriginal || (t.reflectionLayersOriginal = t.reflectionLayers.slice()),
                e.planarReflections ? t.reflectionLayers = t.reflectionLayersOriginal : t.reflectionLayersOriginal.indexOf("SkyReflection") > -1 ? t.reflectionLayers = ["SkyReflection"] : t.reflectionLayers = []
        }
        )),
            this.playerControllers.forEach((t => {
                t.findComponents("particlesystem").forEach((t => t.enabled = e.playerParticles))
            }
            ));
        const s = this.getLights();
        s.forEach((t => {
            if ("directional" !== t.type)
                return !0;
            void 0 === t.castShadowsOriginal && (t.castShadowsOriginal = t.castShadows),
                t.castShadowsOriginal && (t.castShadows = e.sunShadows,
                    t.numCascades = e.shadowsCascades,
                    t.shadowDistance = e.shadowsDistance)
        }
        )),
            s.forEach((t => {
                if ("directional" === t.type)
                    return !0;
                void 0 === t.castShadowsOriginal && (t.castShadowsOriginal = t.castShadows),
                    t.castShadowsOriginal && (t.castShadows = e.localShadows,
                        t.light.castShadowsUser = e.localShadows)
            }
            ));
        this.getCameras().forEach((t => {
            const i = t.entity;
            UranusGraphicsSettings.postEffectsTypes.forEach((t => {
                i.script && i.script[t] && (i.script[t].enabled = !1)
            }
            )),
                e.postEffectsTypes.split(",").forEach((t => {
                    i.script && i.script[t] && (i.script[t].enabled = e.postEffects)
                }
                ))
        }
        ));
        this.getScriptInstancesByType("uranusEffectsSkybox").forEach((t => t.renderClouds = e.skyClouds));
        this.getScriptInstancesByType("uranusEffectsMaterialSurfaceColor").forEach((t => {
            t.surfaceBlendOriginal || (t.surfaceBlendOriginal = t.surfaceBlend),
                t.surfaceBlendOriginal && (t.enabled = e.surfaceBlend)
        }
        )),
            this.app.fire("UranusGraphicsSettings:onPresetChange", this.activePresetID, e)
    }
    ,
    UranusGraphicsSettings.prototype.createDialog = function () {
        const t = new pcui.Container({
            id: "uranus-graphics-settings",
            grid: !1,
            scrollable: !0
        });
        t.style.position = "absolute",
            t.style.right = "10px",
            t.style.top = "10px",
            t.style.zIndex = "9999",
            t.style.backgroundColor = "rgba(54, 67, 70, 0.64)",
            t.style.backdropFilter = "blur(32px)",
            t.style.borderRadius = "6px",
            t.style.opacity = "0.8",
            t.style.boxShadow = "2px 2px 5px rgba(0,0,0,0.3)",
            document.body.appendChild(t.dom);
        const e = new pcui.Panel({
            flex: !0,
            collapsed: !0,
            collapsible: !0,
            collapseHorizontally: !0,
            scrollable: !0,
            headerText: "Settings"
        })
            , i = e.content;
        e.style.width = "350px",
            e.on("collapse", (function () {
                t.style.opacity = "0.5"
            }
            )),
            e.on("expand", (function () {
                t.style.opacity = "1.0"
            }
            )),
            t.dom.appendChild(e.dom),
            this.dialogPane = i.dom,
            this.createDialogSettings(e.content),
            this.addDivider(),
            this.createDialogButtons()
    }
    ,
    UranusGraphicsSettings.prototype.addDivider = function () {
        const t = new pcui.Divider;
        this.dialogPane.appendChild(t.dom)
    }
    ,
    UranusGraphicsSettings.prototype.createDialogSettings = function (t) {
        this.createDialogInput(t, "SelectInput", void 0, "Graphics Preset", {
            options: this.presets.map(((t, e) => ({
                v: t.id,
                t: t.title
            }))),
            value: this.startingPreset
        }, (t => {
            this.updateSettings(t);
            for (let t in this.activePreset) {
                const e = this.dialogInputs[t];
                e && (e.value = this.activePreset[t])
            }
        }
        )),
            this.createDialogInput(t, "SliderInput", void 0, "Time of Day", {
                min: 0,
                max: 24,
                precision: 2,
                value: 12
            }, (t => {
                this.app.fire("UranusEffectsSkybox:setTime", t)
            }
            ));
        const e = new pcui.Panel({
            flex: !0,
            collapsed: !0,
            collapsible: !0,
            scrollable: !0,
            headerText: "Graphics"
        });
        this.dialogPane.appendChild(e.dom),
            this.createDialogInput(e, "SliderInput", "resolution", "Resolution", {
                min: .01,
                max: 2,
                precision: 2,
                value: this.activePreset.resolution
            }, (t => {
                this.activePreset.resolution = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "SliderInput", "devicePixelRatio", "Device Pixel Ratio", {
                min: 0,
                max: 2,
                precision: 2,
                value: this.activePreset.devicePixelRatio
            }, (t => {
                this.app.graphicsDevice.maxPixelRatio = this.getDevicePixelRatio(t)
            }
            )),
            this.createDialogInput(e, "BooleanInput", "fogNoise", "Fog Noise *", {
                value: this.activePreset.fogNoise
            }, (t => {
                this.activePreset.fogNoise = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "BooleanInput", "grass", "Grass *", {
                value: this.activePreset.grass
            }, (t => {
                this.activePreset.grass = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "BooleanInput", "lights", "Local Lights", {
                value: this.activePreset.lights
            }, (t => {
                this.activePreset.lights = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "SliderInput", "lodMultiplier", "LOD Multiplier", {
                min: .25,
                max: 3,
                precision: 2,
                value: this.activePreset.lodMultiplier
            }, (t => {
                this.activePreset.lodMultiplier = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "BooleanInput", "planarReflections", "Planar Reflections", {
                value: this.activePreset.planarReflections
            }, (t => {
                this.activePreset.planarReflections = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "BooleanInput", "localShadows", "Local Shadows", {
                value: this.activePreset.localShadows
            }, (t => {
                this.activePreset.localShadows = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "BooleanInput", "postEffects", "Post Effects", {
                value: this.activePreset.postEffects
            }, (t => {
                this.activePreset.postEffects = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "TextInput", "postEffectsTypes", "Post Effects Types", {
                value: this.activePreset.postEffectsTypes
            }, (t => {
                this.activePreset.postEffectsTypes = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "SliderInput", "shadowsCascades", "Shadows Cascades", {
                min: 1,
                max: 4,
                precision: 0,
                value: this.activePreset.shadowsCascades
            }, (t => {
                this.activePreset.shadowsCascades = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "SliderInput", "shadowsDistance", "Shadows Distance", {
                min: 200,
                max: 1e3,
                precision: 0,
                value: this.activePreset.shadowsDistance
            }, (t => {
                this.activePreset.shadowsDistance = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "BooleanInput", "skyClouds", "Sky Clouds", {
                value: this.activePreset.skyClouds
            }, (t => {
                this.activePreset.skyClouds = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "BooleanInput", "sunShadows", "Sun Shadows", {
                value: this.activePreset.sunShadows
            }, (t => {
                this.activePreset.sunShadows = t,
                    this.updateSettings()
            }
            )),
            this.createDialogInput(e, "BooleanInput", "surfaceBlend", "Surface Blend", {
                value: this.activePreset.surfaceBlend
            }, (t => {
                this.activePreset.surfaceBlend = t,
                    this.updateSettings()
            }
            ));
        const i = new pcui.LabelGroup({
            text: "* requires reload",
            flexShrink: 0
        });
        i.label.width = 320,
            i.style.textAlign = "right",
            i.style.fontSize = "13px",
            e.dom.appendChild(i.dom)
    }
    ,
    UranusGraphicsSettings.prototype.createDialogInput = function (t, e, i, s, a, n) {
        const r = new pcui.LabelGroup({
            text: s,
            flexShrink: 0
        });
        r.label.width = 150;
        const o = new pcui[e](a);
        i && (this.dialogInputs[i] = o),
            o.on("change", n),
            r.dom.appendChild(o.dom),
            t.dom.appendChild(r.dom)
    }
    ,
    UranusGraphicsSettings.prototype.createDialogButtons = function () {
        const t = new pcui.Panel({
            collapsible: !1,
            headerText: "Actions"
        })
            , e = t.content;
        if (this.startEntity) {
            const t = new pcui.Button({
                text: "Start Game"
            });
            this.buttons.startGame = t,
                t.on("click", (() => {
                    t.enabled = !1,
                        window.setTimeout((() => {
                            this.startGame()
                        }
                        ), 200)
                }
                )),
                e.dom.appendChild(t.dom)
        }
        if (this.playerControllers.length > 1) {
            const t = new pcui.Button({
                text: "Toggle Controller"
            });
            t.enabled = !1;
            const i = "toggleController";
            this.buttons[i] = t,
                t.on("click", (() => {
                    this.toggleController(),
                        this.app.fire(`UranusGraphicsSettings:onButtonClick:${i}`)
                }
                )),
                e.dom.appendChild(t.dom)
        }
        if (this.mapButton) {
            const t = new pcui.Button({
                text: "Toggle Map"
            });
            t.enabled = !1;
            const i = "toggleMap";
            this.buttons[i] = t,
                t.on("click", (() => {
                    this.app.fire(`UranusGraphicsSettings:onButtonClick:${i}`)
                }
                )),
                e.dom.appendChild(t.dom)
        }
        this.dialogPane.appendChild(t.dom)
    }
    ,
    UranusGraphicsSettings.prototype.startGame = function () {
        this.gameStarted = !0,
            this.setButtonState("startGame", !1),
            this.playerControllers.length > 1 && this.setButtonState("toggleController", !0),
            this.defaultController && this.enableController(this.defaultController),
            this.lobbyEntity && (this.lobbyEntity.enabled = !1),
            this.startEntity && (this.startEntity.enabled = !0),
            this.enableController(this.activePlayerController),
            this.app.fire("UranusGraphicsSettings:onGameStart")
    }
    ,
    UranusGraphicsSettings.prototype.setButtonState = function (t, e) {
        const i = this.buttons[t];
        i && (i.enabled = e)
    }
    ,
    UranusGraphicsSettings.prototype.enableController = function (t) {
        if (!t)
            return;
        this.playerControllers.forEach((t => t.enabled = !1)),
            this.app.mouse.disablePointerLock(),
            t.enabled = !0;
        const e = this.activePlayerController;
        this.activePlayerController = t,
            this.activeControllerUpdateEffects(),
            this.app.fire("UranusGraphicsSettings:changeController", this.activePlayerController, e)
    }
    ,
    UranusGraphicsSettings.prototype.activeControllerUpdateEffects = function () {
        const t = this.activePlayerController.findComponent("camera")
            , e = t.entity;
        if (this.activePreset.postEffects && t) {
            t.postEffects.destroy();
            try {
                t.postEffects = new pc.PostEffectQueue(this.app, e)
            } catch (t) { }
            this.activePreset.postEffectsTypes.split(",").forEach((t => {
                e.script && e.script[t] && (e.script[t].enabled = !1,
                    e.script[t].enabled = !0)
            }
            ))
        }
    }
    ,
    UranusGraphicsSettings.prototype.toggleController = function (t) {
        t || (t = this.playerControllers.findIndex((t => t === this.activePlayerController))),
            ++t >= this.playerControllers.length && (t = 0);
        const e = this.playerControllers[t];
        !e.tags.has("settings-controller-mouse") || this.app.mouse ? this.enableController(e) : this.toggleController(t)
    }
    ;