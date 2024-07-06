var UranusInstancer = pc.createScript("uranusInstancer");
UranusInstancer.attributes.add("inEditor", {
    type: "boolean",
    default: !0
}),
    UranusInstancer.attributes.add("frustumCulling", {
        type: "boolean",
        default: !0,
        title: "Frustum Culling",
        description: "Controls the culling of instances against the camera frustum (frustum culling needs to enabled on each camera component). If false all instances will be rendered regardless of their visibility. Changing this setting requires application reload."
    }),
    UranusInstancer.attributes.add("cloneMaterials", {
        type: "boolean",
        default: !1,
        title: "Clone Materials",
        description: "If selected all instances will use a clone of the original model material. This is useful when the original material is being used in non instanced models and otherwise it will produce render artifacts. Changing this setting requires application reload."
    }),
    UranusInstancer.attributes.add("autoDynamicCells", {
        type: "boolean",
        default: !1,
        title: "Auto Dynamic Cells",
        description: "If this is selected the instancer will attempt to automatically understand if an instance has moved in a cell and update it accordingly. It can have a performance hit with too many cells/instances"
    }),
    UranusInstancer.attributes.add("disableCells", {
        type: "boolean",
        default: !1,
        title: "Disable Cells",
        description: "Disable cells generation and do per instance culling globally. In editor this setting is being bypassed for entities to allow for individual editing."
    }),
    UranusInstancer.attributes.add("disableShadows", {
        type: "boolean",
        default: !1,
        title: "Disable Shadows",
        description: "If selected no shadows buffers will be created (optimization). Requires app reload."
    }),
    UranusInstancer.attributes.add("bypassTransparent", {
        type: "boolean",
        default: !0,
        title: "Bypass Transparent",
        description: "If selected transparent mesh instances will not be instanced."
    }),
    UranusInstancer.attributes.add("excludeTag", {
        type: "string",
        default: "uranus-instancing-exclude",
        title: "Exclude Tag",
        description: "Use this tag on entities to exclude them from instancing."
    }),
    UranusInstancer.attributes.add("excludeCellsTag", {
        type: "string",
        default: "uranus-instancing-exclude-cells",
        title: "Exclude Cells Tag",
        description: "Use this tag to exclude entities from being included in the global cells, if used."
    }),
    UranusInstancer.attributes.add("shadowsOnlyTag", {
        type: "string",
        default: "uranus-instancing-shadows-only",
        title: "Shadows Only Tag",
        description: "Use this tag on entities to exclude them from model rendering. Those models will only render shadows."
    }),
    UranusInstancer.attributes.add("forceTransparentTag", {
        type: "string",
        default: "uranus-instancing-force-transparent",
        title: "Force Transparent Tag",
        description: "Use this tag on entities with transparent materials to force them to be included when the Bypass Transparent flag is used."
    }),
    UranusInstancer.attributes.add("entityDisableTag", {
        type: "string",
        default: "uranus-instancing-entity-disable",
        title: "Entity Disable Tag",
        description: "Use this tag on entities to exclude them from rendering their model. It will be rendered only for shadows."
    }),
    UranusInstancer.attributes.add("materialShadowsDisable", {
        type: "string",
        default: "uranus-instancing-material-shadows-disable",
        title: "Material Shadows Disable",
        description: "Use this tag on material assets to exclude them from rendering shadows."
    }),
    UranusInstancer.attributes.add("materialCloneDisable", {
        type: "string",
        default: "uranus-instancing-material-clone-disable",
        title: "Material Clone Disable",
        description: "Use this tag on material assets to exclude them from cloning their material."
    }),
    UranusInstancer.attributes.add("materialCloneEnable", {
        type: "string",
        default: "uranus-instancing-material-clone-enable",
        title: "Material Clone Enabled",
        description: "Use this tag on material assets to force them cloning their material."
    }),
    UranusInstancer.attributes.add("excludeLayers", {
        type: "string",
        array: !0,
        default: ["Depth", "Skybox", "Immediate", "UI", "Sky", "Occlusion"],
        title: "Exclude Layers",
        description: "Mesh instances rendered in these layers won't be instanced."
    }),
    UranusInstancer.attributes.add("excludeShadowsLayers", {
        type: "string",
        array: !0,
        default: ["WaterReflection"],
        title: "Exclude Shadows Layers",
        description: "Payloads in these layers will skip generating shadow casters."
    }),
    UranusInstancer.attributes.add("lodMultiplier", {
        type: "number",
        min: 0,
        max: 10,
        default: 1,
        title: "LOD Multiplier",
        description: "The LOD multiplier all LOD Levels start/end distances will be multiplied with. Useful when creating LOD presets."
    }),
    UranusInstancer.attributes.add("lodLevels", {
        type: "json",
        title: "Lod Levels",
        array: !0,
        schema: [{
            name: "index",
            type: "number",
            default: 0,
            precision: 0,
            min: 0,
            max: 9,
            description: "The LOD index for this level e.g. 0 for LOD0, 1 for LOD1."
        }, {
            name: "start",
            type: "number",
            default: 0
        }, {
            name: "end",
            type: "number",
            default: 0
        }]
    }),
    UranusInstancer.attributes.add("cells", {
        type: "json",
        title: "Cells",
        array: !0,
        schema: [{
            name: "cellSize",
            type: "vec3",
            default: [10, 10, 10],
            title: "Cell Size",
            description: "The size of the cell in the frustum culling grid. Only static instances support cell based culling. Minimum cell side size is 1."
        }, {
            name: "updateFrequency",
            type: "number",
            default: 0,
            title: "Update Frequency",
            description: "Set how often in seconds culling updates will execute for this cell. To disable this check and execute it per frame set it to 0."
        }, {
            name: "updateShadowsFrequency",
            type: "number",
            default: 0,
            title: "Update Shadows Frequency",
            description: "Set how often in seconds culling shadows updates will execute for this cell. To disable this check and execute it per frame set it to 0."
        }, {
            name: "isDynamic",
            type: "boolean",
            default: !1,
            title: "Is Dynamic",
            description: "If selected all entities in each cell will update their world transform matrix. Useful for animating instances while in a cell. Note if an instanced changes its position to be outside its initial cell, it will not change cell automatically."
        }, {
            name: "cullingRadius",
            type: "number",
            default: 1,
            title: "Culling Radius"
        }]
    }),
    UranusInstancer.editorLayers = ["Editor Layer Viewport Grid", "Editor Layer Bright Gizmo", "Editor Layer Bright Gizmo", "Editor Layer Viewport Grid", "Editor Layer Bright Collision", "Editor Layer Bright Collision", "Editor Layer Dim Gizmo", "Editor Layer Dim Gizmo", "Editor Layer Viewport Outline", "Editor Layer Viewport Outline", "Editor Layer Axis Gizmo Immediate", "Editor Layer Axis Gizmo Immediate", "Editor Layer Axis Rotate Gizmo Immediate", "Editor Layer Axis Rotate Gizmo Immediate", "Editor Layer Axis Gizmo", "Editor Layer Axis Gizmo", "Editor Layer Camera Preview", "Editor Layer Camera Preview"],
    UranusInstancer.prototype.initialize = function () {
        UranusInstancer.api = this,
            this.payloads = void 0,
            this.runningInEditor = window.UranusEditor && window.UranusEditor.inEditor(),
            this.vec = new pc.Vec3,
            this.vec2 = new pc.Vec3,
            this.quat = new pc.Quat,
            this.matrix = new pc.Mat4,
            this.hasLod = this.lodLevels.length > 0,
            this.globalCells = void 0,
            this.viewPos = [0, 0, 0],
            this.instancerWorker = void 0,
            this.bypassCulling = !1,
            this.prepare(),
            window.setTimeout((() => this.onState(!0)), 0),
            this.on("state", this.onState, this),
            this.on("attr:disableShadows", this.onDisableShadows, this),
            this.on("attr:lodMultiplier", this.onLodMultiplier, this),
            this.app.on("UranusInstancer:setBypassCulling", (function (e) {
                this.bypassCulling = e;
                for (let e in this.payloads) {
                    const t = this.payloads[e];
                    if (t.shadowCaster) {
                        const e = t.refPayload ? t.refPayload : t;
                        e.updateFrequencyTime = e.updateFrequency
                    }
                }
            }
            ), this),
            this.app.on("UranusInstancer:setBypassShadows", (function (e) {
                for (let t in this.payloads) {
                    const a = this.payloads[t];
                    if (a.shadowCaster) {
                        const t = a.refPayload ? a.refPayload : a;
                        t.updateFrequencyTime = t.updateFrequency,
                            a.meshInstance.visible = !e
                    }
                }
            }
            ), this)
    }
    ,
    UranusInstancer.prototype.prepare = function () {
        this.overrideEngine(),
            this.payloads = {},
            this.cells.length > 0 && (this.globalCells = new UranusInstancerCell({
                app: this.app,
                entity: this.entity,
                enabled: !0
            }),
                this.onCellsUpdated(this.cells)),
            !this.frustumCulling && this.cloneMaterials && this.app.on("update", this.onUpdate, this),
            this.app.on("prerender", this.onPreRender, this),
            this.app.on("postrender", this.onPostRender, this)
    }
    ,
    UranusInstancer.prototype.onCellsUpdated = function (e) {
        (e = e[0]) && this.globalCells && (this.globalCells.cellSize = e.cellSize,
            this.globalCells.cullingRadius = e.cullingRadius,
            this.globalCells.updateFrequency = e.updateFrequency,
            this.globalCells.updateShadowsFrequency = e.updateShadowsFrequency,
            this.globalCells.isDynamic = e.isDynamic)
    }
    ,
    UranusInstancer.prototype.onState = function (e) {
        if (e) {
            const e = this.app.scene.layers.layerList;
            for (let t = 0; t < e.length; t++) {
                const a = e[t];
                if (!1 === this.isLayerValid(a))
                    continue;
                let s;
                s = this.bypassTransparent ? a.meshInstances.filter((e => e.material.blendType === pc.BLEND_NONE || e.node.tags.has(this.forceTransparentTag))) : a.meshInstances,
                    a.removeMeshInstances(s),
                    a.addMeshInstances(s)
            }
        } else {
            for (let e in this.payloads) {
                const t = this.payloads[e]
                    , a = t.refMeshInstances
                    , s = t.layer;
                this.clearPayload(t),
                    s.addMeshInstances(a)
            }
            this.payloads = {}
        }
    }
    ,
    UranusInstancer.prototype.onDisableShadows = function (e) {
        this.enabled && (this.enabled = !1,
            this.enabled = !0)
    }
    ,
    UranusInstancer.prototype.setShadows = function (e) {
        this.disableShadows = !e
    }
    ,
    UranusInstancer.prototype.onLodMultiplier = function (e) {
        this.app.fire("UranusInstancer:onLodMultiplier", e)
    }
    ,
    UranusInstancer.prototype.isLayerValid = function (e, t) {
        return t ? -1 === this.excludeShadowsLayers.indexOf(e.name) : -1 === this.excludeLayers.indexOf(e.name) && -1 === UranusInstancer.editorLayers.indexOf(e.name)
    }
    ,
    UranusInstancer.worldMatX = new pc.Vec3,
    UranusInstancer.worldMatY = new pc.Vec3,
    UranusInstancer.worldMatZ = new pc.Vec3,
    UranusInstancer.prototype.shouldFlipFaces = function (e) {
        const t = UranusInstancer.worldMatX
            , a = UranusInstancer.worldMatY
            , s = UranusInstancer.worldMatZ
            , n = e.getWorldTransform();
        return n.getX(t),
            n.getY(a),
            n.getZ(s),
            t.cross(t, a),
            !(t.dot(s) >= 0)
    }
    ,
    UranusInstancer.prototype.getPayloadId = function (e, t, a, s) {
        const n = s || e.material
            , i = this.shouldFlipFaces(e.node);
        return BigInt(65535 & t.id) << 34n | BigInt(a ? 1 : 0) << 33n | BigInt(i ? 1 : 0) << 32n | BigInt(65535 & e.mesh.id) << 16n | BigInt(65535 & n.id)
    }
    ,
    UranusInstancer.prototype.getMeshInstanceEntity = function (e) {
        let t = e.node;
        if (t instanceof pc.Entity == !1) {
            for (; t instanceof pc.Entity == !1 && t.parent;)
                t = t.parent;
            if (t instanceof pc.Entity == !1)
                return
        }
        return t
    }
    ,
    UranusInstancer.prototype.addMeshInstance = function (e, t, a, s) {
        if (!e.material || e.mesh.skin)
            return !1;
        if ("uranus-instancer-payload" === e.node.name)
            return !1;
        const n = this.getMeshInstanceEntity(e);
        if (this.bypassTransparent && !UranusUtilities.itemHasTag(n, this.forceTransparentTag) && e.material.blendType !== pc.BLEND_NONE)
            return !1;
        if (!n)
            return !1;
        const i = e.node !== n ? e.node : n;
        if (!0 === UranusUtilities.itemHasTag(n, this.excludeTag))
            return !1;
        const r = n.render ? n.render : n.model;
        if (!r || r && r.batchGroupId > -1)
            return !1;
        let l = this.cloneMaterials;
        if (n.render) {
            const t = r.meshInstances.findIndex((t => t === e));
            if (t > -1) {
                const e = r.materialAssets[t]
                    , s = this.app.assets.get(e);
                s && (!0 === UranusUtilities.itemHasTag(s, this.materialShadowsDisable) && (a = !0),
                    !0 === UranusUtilities.itemHasTag(s, this.materialCloneDisable) && (l = !1),
                    !0 === UranusUtilities.itemHasTag(s, this.materialCloneEnable) && (l = !0))
            }
        }
        const o = n.uranusInstancingData;
        return o ? (n.on("UranusInstancerData:add:instances", (n => {
            this.addBufferToPayload(n, i, e, t, a, s, l)
        }
        )),
            n.on("UranusInstancerData:remove:instances", (n => {
                this.removeBufferFromPayload(n, e, t, a, s)
            }
            )),
            this.addBufferToPayload(o, i, e, t, a, s, l)) : (s || this.addToPayload(n, i, e, t, !1, !1, l),
                !this.disableShadows && !a && e.castShadow && this.isLayerValid(t, !0) && this.addToPayload(n, i, e, t, !0, !1, l),
                this.overrideMeshInstance(e, (() => {
                    this.removeFromPayload(e, t, !1, null),
                        this.removeFromPayload(e, t, !0, null),
                        s || this.addToPayload(n, i, e, t, !1, !1, l),
                        !this.disableShadows && !a && e.castShadow && this.isLayerValid(t, !0) && this.addToPayload(n, i, e, t, !0, !1, l)
                }
                ))),
            !0
    }
    ,
    UranusInstancer.WORKER_CALCULATE_CELLS = "calculate-cells",
    UranusInstancer.prototype.workerCalculateCells = function (e) {
        this.instancerWorker || (this.instancerWorker = UranusUtilities.createWorker(this.entity, "uranus-instancer.worker.js"),
            UranusUtilities.postWorkerMessage(this.instancerWorker, "load-libraries", {
                libraries: [UranusUtilities.getAbsoluteUrl(this.app.assets.find("playcanvas-stable.min.js", "script").getFileUrl()), UranusUtilities.getAbsoluteUrl(this.app.assets.find("uranus-worker-polyfill.js", "script").getFileUrl()), UranusUtilities.getAbsoluteUrl(this.app.assets.find("uranus-instancer-cell.worker.js", "script").getFileUrl())]
            })),
            UranusUtilities.postWorkerMessage(this.instancerWorker, UranusInstancer.WORKER_CALCULATE_CELLS, e, !0)
    }
    ,
    UranusInstancer.workerCalculateCellsListeners = [],
    UranusInstancer.prototype.addBufferToPayload = function (e, t, a, s, n, i, r) {
        const l = e[0];
        let o = t.script?.uranusInstancerCell;
        !o && this.globalCells && !1 === UranusUtilities.itemHasTag(t, this.excludeCellsTag) && (o = this.globalCells);
        const c = void 0 !== o && o.enabled;
        if (l.singleInstance && c) {
            if (this.entity.on(`worker:${UranusInstancer.WORKER_CALCULATE_CELLS}:${l.bufferId}`, (function (e) {
                t.fire("UranusInstancerData:onBufferConsumed"),
                    l.workerPayload = e.payload,
                    i || this.addToPayload(l, t, a, s, !1, !1, r),
                    !this.disableShadows && !n && a.castShadow && this.isLayerValid(s, !0) && this.addToPayload(l, t, a, s, !0, !1, r),
                    UranusInstancer.workerCalculateCellsListeners[l.bufferId] || (UranusInstancer.workerCalculateCellsListeners[l.bufferId] = window.setTimeout((() => {
                        this.entity.off(`worker:${UranusInstancer.WORKER_CALCULATE_CELLS}:${l.bufferId}`)
                    }
                    ), 0))
            }
            ), this),
                !l.bufferDetached) {
                l.bufferDetached = !0;
                const e = l.useBaseMatrix || l.baseEntity === t;
                let s;
                e || (s = UranusUtilities.serializeEntityTRS(t)),
                    this.workerCalculateCells({
                        id: l.bufferId,
                        cellSize: UranusUtilities.serializeVec3(o.cellSize),
                        cullingRadius: o.cullingRadius,
                        buffer: l.buffer,
                        node: s,
                        refBoundingBox: a.aabb.halfExtents.data,
                        useBaseMatrix: e
                    })
            }
        } else {
            for (let l = 0; l < e.length; l++) {
                const o = e[l]
                    , c = l >= e.length - 1;
                i || this.addToPayload(o, t, a, s, !1, !c, r),
                    !this.disableShadows && !n && a.castShadow && this.isLayerValid(s, !0) && this.addToPayload(o, t, a, s, !0, !c, r)
            }
            t.fire("UranusInstancerData:onBufferConsumed")
        }
    }
    ,
    UranusInstancer.prototype.removeBufferFromPayload = function (e, t, a, s, n) {
        n || this.removeFromPayload(t, a, !1, e),
            !s && t.castShadow && this.removeFromPayload(t, a, !0, e)
    }
    ,
    UranusInstancer.prototype.addToPayload = function (e, t, a, s, n, i, r) {
        const l = e.workerPayload
            , o = !l && e instanceof pc.Entity;
        if (!n && !0 === UranusUtilities.itemHasTag(o ? e : t, this.shadowsOnlyTag))
            return;
        let c, d, u;
        o ? (c = e.script?.uranusInstancerCell,
            !c && this.globalCells && !1 === UranusUtilities.itemHasTag(e, this.excludeCellsTag) && (c = this.globalCells),
            d = void 0 !== c && c.enabled,
            (this.disableCells || this.runningInEditor && o) && (d = !1),
            u = !1) : (c = t.script?.uranusInstancerCell,
                !c && this.globalCells && (c = this.globalCells),
                d = void 0 !== c && c.enabled,
                (this.disableCells || this.runningInEditor && o) && (d = !1),
                u = e.singleInstance);
        const h = this.getPayloadId(a, s, n);
        let p = this.payloads[h];
        if (p) {
            if (!p.refPayload && o) {
                if (p.refMeshInstances.indexOf(a) > -1)
                    return p
            } else if (!p.refPayload && !l && p.refBufferInstances.indexOf(e) > -1)
                return p
        } else
            p = this.createPayload(h, a, s, n, u, d, r),
                this.setPayloadUpdateFrequency(p, c);
        if (p.refPayload)
            return !0 !== i && this.updateVertexBuffer(p, !0),
                p;
        const f = {};
        if (this.hasLod) {
            const e = t.script?.uranusInstancerLod;
            e && (f.lodScript = e)
        }
        if (o) {
            if (f.entity = e,
                e.uranusIsInstanced = !0,
                p.refMeshInstances.push(a),
                a.uranusPayloadMaterial = a.material,
                a.isStatic) {
                const e = t.getWorldTransform()
                    , a = e.data
                    , s = [];
                for (let e = 0; e < 16; e++)
                    s[e] = a[e];
                f.data = s,
                    f.cullPosition = e.getTranslation()
            }
        } else if (!l) {
            const s = e
                , n = s.baseEntity;
            let i, r, l;
            if (s.useBaseMatrix || n === t) {
                const e = this.vec.set(s.position[0], s.position[1], s.position[2])
                    , t = this.quat.setFromEulerAngles(s.rotation[0], s.rotation[1], s.rotation[2])
                    , a = this.vec2.set(s.scale[0], s.scale[1], s.scale[2]);
                i = this.matrix,
                    r = i.setTRS(e, t, a).data
            } else
                n.setPosition(s.position[0], s.position[1], s.position[2]),
                    n.setEulerAngles(s.rotation[0], s.rotation[1], s.rotation[2]),
                    n.setLocalScale(s.scale[0], s.scale[1], s.scale[2]),
                    i = t.getWorldTransform(),
                    r = i.data;
            if (u)
                l = r;
            else {
                l = [];
                for (let e = 0; e < 16; e++)
                    l[e] = r[e]
            }
            f.data = l,
                f.cullPosition = i.getTranslation(),
                u || (s.payloads || (s.payloads = {}),
                    s.payloads[h] = f),
                p.singleInstance || p.refBufferInstances.push(s),
                -1 === p.refMeshInstances.indexOf(a) && p.refMeshInstances.push(a)
        }
        if (u && !p.singleInstance && (p.singleInstance = !0),
            o || 0 !== p.refMeshInstances.length || p.refMeshInstances.push(a),
            d)
            if (l) {
                const a = e.workerPayload.cells
                    , s = t.script?.uranusInstancerLod;
                a.forEach(((e, t) => {
                    if (e.aabb = new pc.BoundingBox(UranusUtilities.deserializeVec3(e.aabb.center), UranusUtilities.deserializeVec3(e.aabb.halfExtents)),
                        !0 === p.cells.set(t, e)) {
                        const a = p.cells.get(t);
                        a.aabb.add(e.aabb),
                            a.buffer = Float32Array.from(a.buffer, e.buffer)
                    } else
                        s && (e.lodScript = s),
                            p.cells.set(t, e)
                }
                )),
                    p.shouldUpdateShadows = 2
            } else
                c.addInstanceToPayload(f, p, t, c.cellSize, c.cullingRadius),
                    f.data = void 0,
                    f.cullPosition = void 0;
        else
            f.meshInstance = a,
                f.node = t,
                p.onlyCells = !1,
                p.shouldUpdateShadows = 2;
        if (p.singleInstance)
            p.instancesCount || (delete p.instances,
                p.instancesCount = 0),
                l ? p.instancesCount += e.workerPayload.instancesCount : p.instancesCount++;
        else if (p.instances.push(f),
            p.basePayload) {
            const e = p.instances.length - 1;
            p.basePayload.instances && p.basePayload.instances[e] && (f.refInstance = p.basePayload.instances[e])
        }
        return o && !0 === f.entity.enabled && !0 === UranusUtilities.itemHasTag(f.entity, this.entityDisableTag) && window.setTimeout((() => f.entity.enabled = !1), 0),
            !0 !== i && (this.updateVertexBuffer(p, !0),
                p.shadowCaster && (p.shouldUpdateShadows = 2),
                this.frustumCulling || this.isMeshInstanceVisible(null, p)),
            p
    }
    ,
    UranusInstancer.prototype.setPayloadUpdateFrequency = function (e, t) {
        if (t && (e.isCellDynamic = t.isDynamic,
            !e.updateFrequency)) {
            const a = e.shadowCaster ? t.updateShadowsFrequency : t.updateFrequency;
            a > 0 && (e.updateFrequency = a <= 1 ? 10 * a : a,
                e.updateFrequencyTime = e.updateFrequency,
                e.updateFrequencyLastNow = pc.app.frame)
        }
    }
    ,
    UranusInstancer.prototype.removeMeshInstance = function (e, t, a, s) {
        if (e.mesh.skin)
            return !1;
        if ("uranus-instancer-payload" === e.node.name)
            return !1;
        let n = !1;
        return s || (n = this.removeFromPayload(e, t, !1)),
            a || (n = this.removeFromPayload(e, t, !0)),
            this.overrideMeshInstance(e),
            n
    }
    ,
    UranusInstancer.prototype.removeFromPayload = function (e, t, a, s) {
        const n = e.uranusPayloadMaterial ? e.uranusPayloadMaterial : e.material;
        if (!n)
            return !1;
        const i = this.getPayloadId(e, t, a, n)
            , r = this.payloads[i];
        if (!r)
            return !1;
        if (e.node.uranusHasInstancingData) {
            const t = e.node.uranusInstancingData;
            if ((r.refPayload ? r.refPayload : r).singleInstance || !s && !t)
                r.refBufferInstances.length = 0,
                    r.instancesCount = 0;
            else {
                s || (s = t);
                for (let e = 0; e < s.length; e++) {
                    const t = s[e]
                        , a = r.refBufferInstances.indexOf(t);
                    if (-1 === a)
                        continue;
                    r.refBufferInstances.splice(a, 1);
                    const n = t.payloads[i];
                    void 0 !== n.cell && UranusInstancerCell.prototype.removeInstanceFromPayload(n, r);
                    const l = r.instances.indexOf(n);
                    -1 !== l && r.instances.splice(l, 1)
                }
            }
        } else if (!r.refPayload && r.refMeshInstances.length > 0 && r.instances) {
            const t = r.refMeshInstances.indexOf(e);
            if (-1 === t)
                return !1;
            const a = r.instances[t];
            if (UranusUtilities.itemHasTag(a.entity, this.entityDisableTag) && !1 === a.entity._destroying)
                return !1;
            void 0 !== a.cell && UranusInstancerCell.prototype.removeInstanceFromPayload(a, r),
                r.instances.splice(t, 1),
                r.refMeshInstances.splice(t, 1)
        }
        0 === r.instancesCount || r.instances && 0 === r.instances.length ? this.clearPayload(r) : (this.updateVertexBuffer(r, !0),
            r.shadowCaster && (r.shouldUpdateShadows = 2),
            this.frustumCulling || this.isMeshInstanceVisible(null, r))
    }
    ,
    UranusInstancer.prototype.clearPayload = function (e) {
        e.cells = void 0,
            e.instances = void 0,
            e.buffer.vertexBuffer.destroy(),
            e.shadowCaster ? e.layer.removeShadowCasters([e.meshInstance]) : e.layer.removeMeshInstances([e.meshInstance], !0),
            delete this.payloads[e.id]
    }
    ,
    UranusInstancer.prototype.updateVertexBuffer = function (e, t, a) {
        let s;
        if (void 0 !== a)
            s = a;
        else if (e.instances)
            s = e.instances.length;
        else {
            s = (e.refPayload ? e.refPayload : e).instancesCount
        }
        const n = e.buffer
            , i = e.meshInstance;
        if (s > 0 || !n.vertexBuffer) {
            let a;
            if (a = t || !n.originalStorage ? n.originalStorage = new Float32Array(16 * s) : n.originalStorage.subarray(0, 16 * s),
                s > n.instancesCount || !n.vertexBuffer) {
                n.vertexBuffer && n.vertexBuffer.destroy();
                const e = pc.VertexFormat.defaultInstancingFormat ? pc.VertexFormat.defaultInstancingFormat : pc.VertexFormat.getDefaultInstancingFormat(this.app.graphicsDevice)
                    , t = new pc.VertexBuffer(this.app.graphicsDevice, e, s, { usage: pc.BUFFER_STATIC, data: a });
                i.setInstancing(t, !0),
                    n.vertexBuffer = t
            } else {
                const t = n.vertexBuffer
                    , i = t.format;
                t.numBytes = i.verticesByteSize ? i.verticesByteSize : i.size * s,
                    t.setData(a),
                    e.meshInstance.instancingCount = s
            }
        }
        n.instancesCount = s,
            i.instancingCount = s
    }
    ,
    UranusInstancer.prototype.createPayload = function (e, t, a, s, n, i, r) {
        const l = this.getPayloadMaterial(t.material, r)
            , o = new pc.MeshInstance(t.mesh, l, new pc.GraphNode("uranus-instancer-payload"));
        o.pick = !1,
            o.flipFaces = this.shouldFlipFaces(t.node),
            o.flipFacesFactor = t.node.worldTransform.scaleSign,
            o.castShadow = s,
            o.aabb.center.copy(t.aabb.center),
            o.aabb.halfExtents.copy(t.aabb.halfExtents),
            s ? a.addShadowCasters([o]) : a.addMeshInstances([o], !0);
        const c = {
            basePayload: void 0,
            buffer: {
                instancesCount: 0,
                originalStorage: void 0,
                vertexBuffer: void 0
            },
            cells: new Map,
            firstTimeVisible: !0,
            id: e,
            instances: [],
            layer: a,
            lodIndex: this.hasLod ? UranusInstancerLod.prototype.getLodIndexFromName(t.node.name) : -1,
            meshInstance: o,
            onlyCells: !0,
            refBoundingBox: new pc.BoundingBox,
            refBufferInstances: [],
            refMaterial: t.material,
            refMeshInstances: [],
            refPayload: void 0,
            singleInstance: !1,
            shadowCaster: s,
            shouldCloneMaterial: r,
            updateFrequency: void 0,
            updateFrequencyTime: void 0,
            updateFrequencyLastNow: void 0
        };
        if (c.refBoundingBox.halfExtents.copy(t.aabb.halfExtents),
            s || i && c.lodIndex > 0) {
            let e = t.node.name;
            i && (e = e.replace(`_LOD${c.lodIndex}`, "_LOD0"));
            const s = this.payloads;
            let n;
            for (let i in s) {
                const r = s[i]
                    , l = r.refMeshInstances[0];
                if (l && !1 === r.shadowCaster && r.layer === a && l.node.name === e && !0 === l.node.getLocalScale().equals(t.node.getLocalScale())) {
                    n = r;
                    break
                }
            }
            n && (i ? (c.refPayload = n,
                c.cells = c.refPayload.cells,
                c.instances = c.refPayload.instances,
                c.refBufferInstances = c.refPayload.refBufferInstances,
                c.refMeshInstances = c.refPayload.refMeshInstances) : c.basePayload = n)
        }
        return this.setPayloadCulling(this.frustumCulling, c),
            this.payloads[e] = c,
            c
    }
    ,
    UranusInstancer.prototype.setPayloadCulling = function (e, t) {
        e ? (t.meshInstance.cull = !0,
            t.meshInstance.isVisibleFunc = e => this.isMeshInstanceVisible(e, t)) : (t.meshInstance.cull = !1,
                delete t.meshInstance.isVisibleFunc)
    }
    ,
    UranusInstancer.prototype.isMeshInstanceVisible = function (e, t) {
        if (e && !t.shadowCaster) {
            const a = e.node.getPosition()
                , s = this.viewPos;
            s[0] = a.x,
                s[1] = a.y,
                s[2] = a.z,
                t.meshInstance.setParameter("uranus_view_position", s),
                t.meshInstance.setParameter("uranus_view_position_alpha", s)
        }
        if (this.updatePayload(t, e),
            t.shadowCaster && t.shouldUpdateShadows >= 0) {
            let e = !0;
            const a = t.meshInstance.aabb
                , s = t.instances;
            if (!1 === t.onlyCells && s)
                for (let t = 0; t < s.length; t++) {
                    const n = s[t];
                    if (n.cell)
                        continue;
                    const i = n.meshInstance;
                    0 !== i.visibleThisFrame && (e ? (e = !1,
                        a.copy(i.aabb)) : a.add(i.aabb))
                }
            const n = t.cells;
            n && n.forEach((t => {
                e ? (e = !1,
                    a.copy(t.aabb)) : a.add(t.aabb)
            }
            )),
                t.shouldUpdateShadows--
        }
        return !0
    }
    ,
    UranusInstancer.prototype.getPayloadMaterial = function (e, t) {
        const a = t ? e.clone() : e;
        return e._uranusRequiresVertexColors && (a._uranusRequiresVertexColors = !0),
            a.onUpdateShader = function (t) {
                return t.litOptions.useInstancing = !0,
                    e._uranusRequiresVertexColors && (t.vertexColors = !0),
                    t
            }
            ,
            a.update(),
            a._uranusRequiresInstancing = !0,
            t && this.app.fire("UranusInstancer:materialCloned", a),
            a
    }
    ,
    UranusInstancer.prototype.onUpdate = function () {
        const e = this.payloads;
        if (e && this.cloneMaterials)
            for (let t in e)
                this.updatePayload(e[t])
    }
    ,
    UranusInstancer.prototype.onPreRender = function () {
        UranusInstancerLod.cellsVisCache && UranusInstancerLod.cellsVisCache.forEach((e => e.dirty = !0)),
            UranusInstancerCell.cellsVisCache && UranusInstancerCell.cellsVisCache.forEach((e => e.dirty = !0))
    }
    ,
    UranusInstancer.prototype.onPostRender = function () {
        const e = this.payloads;
        if (e)
            for (let t in e) {
                const a = e[t]
                    , s = a.cells;
                s && (-1 === a.updateFrequencyTime && (a.updateFrequencyTime = 0,
                    a.updateFrequencyLastNow = pc.app.frame),
                    a.isCellDynamic && s.forEach((e => {
                        if (!e.entityMoved)
                            return !0;
                        if (e.entityMoved = !1,
                            this.autoDynamicCells) {
                            const t = e.instances;
                            for (let e = 0; e < t.length; e++)
                                t[e].entity._dirtyNormal = !1
                        }
                    }
                    )))
            }
    }
    ,
    UranusInstancer.prototype.updatePayload = function (e, t) {
        const a = e.refPayload ? e.refPayload : e
            , s = e.cells
            , n = a.onlyCells;
        let i = 0;
        const r = e.instances;
        if (!n && r)
            for (let a = 0; a < r.length; a++) {
                const s = r[a];
                s.cell || (i = this.updateInstance(s, e, i, t))
            }
        if (s && s.size > 0) {
            const r = e.refPayload && !e.shadowCaster ? e.refPayload : e;
            let l = !0
                , o = !0;
            for (const e of s.values())
                if (e.entityMoved) {
                    o = !1;
                    break
                }
            if (!this.bypassCulling && o && r.updateFrequency) {
                if (a.updateFrequencyTime >= 0) {
                    const e = pc.app.frame
                        , t = e - r.updateFrequencyLastNow;
                    r.updateFrequencyTime += t,
                        r.updateFrequencyLastNow = e,
                        r.updateFrequencyTime < r.updateFrequency && (l = !1)
                }
                l && (r.updateFrequencyTime = -1)
            }
            if (this.autoDynamicCells) {
                let e = !1;
                if (r.isCellDynamic)
                    e: for (const t of s.values()) {
                        const a = t.instances;
                        if (a)
                            for (let s = 0; s < a.length; s++) {
                                void 0 === t.entityMoved && (e = !0);
                                const n = a[s].entity;
                                if (n && !0 === n.uranusCellDynamicBypass || !0 === n._dirtyNormal) {
                                    e = !0,
                                        t.entityMoved = !0;
                                    continue e
                                }
                            }
                    }
                e && (l = !0)
            }
            if (l)
                s.forEach((a => {
                    i = this.updateCell(a, e, i, t, a.entityMoved)
                }
                ));
            else if (n)
                return
        }
        const l = i / 16;
        this.updateVertexBuffer(e, !1, l),
            this.cloneMaterials && this.checkPayloadMaterial(e)
    }
    ,
    UranusInstancer.prototype.checkPayloadMaterial = function (e) {
        const t = e.refMeshInstances[0];
        if (!t)
            return;
        const a = t.material !== e.refMaterial;
        a && (e.refMaterial = t.material);
        const s = e.refMaterial;
        if (s && (s.dirty || a)) {
            const t = this.getPayloadMaterial(s, e.shouldCloneMaterial);
            e.meshInstance.material = t,
                this.app.once("postrender", (function () {
                    e.refMaterial.dirty = !1
                }
                ), this)
        }
    }
    ,
    UranusInstancer.prototype.updateCell = function (e, t, a, s, n) {
        if (!1 === e.uranusCellVisibilityBypass)
            return a;
        if (s && !this.bypassCulling) {
            if (!1 === UranusInstancerCell.prototype.isVisible(e, s, t.layer))
                return a;
            if (!1 === this.cullInstanceLOD(e, t, s))
                return a
        }
        const i = t.buffer.originalStorage
            , r = e.buffer;
        if (e.hasEntities && n) {
            const t = e.instances;
            let s = 0;
            for (let e = 0; e < t.length; e++) {
                const n = t[e].entity.getWorldTransform().data;
                for (let e = 0; e < 16; e++)
                    i[a++] = n[e],
                        r[s++] = n[e]
            }
        } else
            for (let e = 0; e < r.length; e++)
                i[a++] = r[e];
        return a
    }
    ,
    UranusInstancer.prototype.updateInstance = function (e, t, a, s) {
        let n;
        if (s && (n = this.cullInstance(e, t, s),
            !n))
            return a;
        const i = t.buffer.originalStorage
            , r = e.data ? e.data : e.node.getWorldTransform().data;
        for (let e = 0; e < 16; e++)
            i[a++] = r[e];
        return 2 === n && (i[a - 3] = e.lodScript.skipShadowsOffset),
            a
    }
    ,
    UranusInstancer.shadowCameraName = "ShadowCamera",
    UranusInstancer.prototype.cullInstanceLOD = function (e, t, a) {
        let s = !0;
        const n = t.lodIndex
            , i = UranusInstancer.shadowCameraName === a.node.name && a.farClip < 2e5;
        if (this.hasLod && (n > -1 || i)) {
            const r = t.shadowCaster
                , l = e.lodScript;
            if (l) {
                const e = l.proxyMesh;
                if (e && !0 === e.uranusLodVisible)
                    return !1
            }
            if (i || !r || l && l.hasCustomShadowLod) {
                let o;
                o = e.cullPosition ? e.cullPosition : e.center ? e.center : e.entity.getPosition();
                const c = r && !i && t.refPayload ? t.refPayload.camera : a;
                s = l ? l.isLodVisible(n, o, c, void 0, t, this.lodMultiplier) > 0 : UranusInstancerLod.prototype.isLodVisible(n, o, c, this.lodLevels, void 0, this.lodMultiplier) > 0,
                    r || (e.refLodIndices || (e.refLodIndices = []),
                        e.refLodIndices[n] = s),
                    e.isVisible = s
            } else if (l && l.skipShadowsLod) {
                const t = e.refLodIndices;
                if (t) {
                    s = !1;
                    for (let e = 0; e < t.length; e++)
                        if (!0 === t[e]) {
                            s = 2;
                            break
                        }
                } else
                    s = 2
            } else
                e.refLodIndices ? s = e.refLodIndices[n] : e.refInstance && (s = e.refInstance.isVisible)
        }
        return t.refPayload || (t.camera = a),
            e.entity && (e.entity.uranusLodVisible = !1 !== s),
            s
    }
    ,
    UranusInstancer.prototype.cullInstance = function (e, t, a) {
        const s = this.bypassCulling
            , n = this.cullInstanceLOD(e, t, a);
        if (!1 === n && !s)
            return n;
        if (e.entity && !1 === e.entity.uranusZoneActive)
            return !1;
        if (s)
            return 2 !== n || n;
        {
            const t = e.meshInstance;
            e.data && t.aabb.center.copy(e.cullPosition);
            let s = t._isVisible(a);
            return t.visibleThisFrame = s,
                s = s > 0,
                s && 2 === n ? n : s
        }
    }
    ,
    UranusInstancer.prototype.overrideEngine = function () {
        const e = pc.Layer.prototype.addMeshInstances;
        pc.Layer.prototype.addMeshInstances = function (t, a) {
            if (UranusInstancer.api && UranusInstancer.api.enabled && UranusInstancer.api.isLayerValid(this)) {
                let s = [];
                t.forEach((e => {
                    UranusInstancer.api.addMeshInstance(e, layer = this, a, !1) || s.push(e)
                }
                )),
                    arguments[0] = s,
                    e.apply(this, arguments)
            } else
                e.apply(this, arguments)
        }
            ;
        const t = pc.Layer.prototype.removeMeshInstances;
        UranusInstancer.removeMeshInstancesFunc = t,
            pc.Layer.prototype.removeMeshInstances = function (e, a) {
                if (UranusInstancer.api && UranusInstancer.api.enabled && UranusInstancer.api.isLayerValid(this)) {
                    let s = [];
                    e.forEach((e => {
                        UranusInstancer.api.removeMeshInstance(e, layer = this, a, !1) || s.push(e)
                    }
                    )),
                        arguments[0] = s,
                        t.apply(this, arguments)
                } else
                    t.apply(this, arguments)
            }
            ;
        const a = pc.Layer.prototype.addShadowCasters;
        pc.Layer.prototype.addShadowCasters = function (e) {
            if (UranusInstancer.api && UranusInstancer.api.enabled && UranusInstancer.api.isLayerValid(this)) {
                let t = [];
                e.forEach((e => {
                    UranusInstancer.api.addMeshInstance(e, layer = this, !1, !0) || t.push(e)
                }
                )),
                    arguments[0] = t,
                    a.apply(this, arguments)
            } else
                a.apply(this, arguments)
        }
            ;
        const s = pc.Layer.prototype.removeShadowCasters;
        pc.Layer.prototype.removeShadowCasters = function (e) {
            if (UranusInstancer.api && UranusInstancer.api.enabled && UranusInstancer.api.isLayerValid(this)) {
                let t = [];
                e.forEach((e => {
                    UranusInstancer.api.removeMeshInstance(e, layer = this, !1, !0) || t.push(e)
                }
                )),
                    arguments[0] = t,
                    s.apply(this, arguments)
            } else
                s.apply(this, arguments)
        }
    }
    ,
    UranusInstancer.prototype.overrideMeshInstance = function (e, t) {
        Object.defineProperty(e, "material", {
            set: function (e) {
                this.clearShaders();
                const a = this._material;
                if (a && a.removeMeshInstanceRef(this),
                    this._material = e,
                    this._material) {
                    this._material.addMeshInstanceRef(this),
                        this.updateKey();
                    if ((a && a.blendType !== pc.BLEND_NONE) !== (this._material.blendType !== pc.BLEND_NONE)) {
                        let e = this._material._scene;
                        !e && a && a._scene && (e = a._scene),
                            e ? e.layers._dirtyBlend = !0 : this._material._dirtyBlend = !0
                    }
                    t && this._mesh && t()
                }
            },
            get: function () {
                return this._material
            },
            configurable: !0
        })
    }
    ;

var UranusInstancerCell = pc.createScript("uranusInstancerCell");
UranusInstancerCell.attributes.add("inEditor", {
    type: "boolean",
    default: !0
}),
    UranusInstancerCell.attributes.add("cellSize", {
        type: "vec3",
        default: [10, 10, 10],
        title: "Cell Size",
        description: "The size of the cell in the frustum culling grid. Only static instances support cell based culling. Minimum cell side size is 1."
    }),
    UranusInstancerCell.attributes.add("updateFrequency", {
        type: "number",
        default: 0,
        title: "Update Frequency",
        description: "Set how often in seconds culling updates will execute for this cell. To disable this check and execute it per frame set it to 0."
    }),
    UranusInstancerCell.attributes.add("updateShadowsFrequency", {
        type: "number",
        default: 0,
        title: "Update Shadows Frequency",
        description: "Set how often in seconds culling shadows updates will execute for this cell. To disable this check and execute it per frame set it to 0."
    }),
    UranusInstancerCell.attributes.add("isDynamic", {
        type: "boolean",
        default: !1,
        title: "Is Dynamic",
        description: "If selected all entities in each cell will update their world transform matrix. Useful for animating instances while in a cell. Note if an instanced changes its position to be outside its initial cell, it will not change cell automatically."
    }),
    UranusInstancerCell.attributes.add("cullingRadius", {
        type: "number",
        default: 1,
        title: "Culling Radius"
    }),
    UranusInstancerCell.prototype.addInstanceToPayload = function (e, t, n, l, a) {
        const s = e.entity
            , r = e.cullPosition ? e.cullPosition : s.getPosition()
            , i = this.getCellFromPosition(r, t, l, a);
        t && !t.singleInstance && i.instances.push(e);
        const c = i.buffer
            , o = e.data ? e.data : n.getWorldTransform().data;
        let u = c.length;
        e.cell = i;
        const d = e.lodScript;
        d && (i.lodScript = d),
            void 0 === i.hasEntities && s && (i.hasEntities = !0),
            s && (s.uranusInstancerCells || (s.uranusInstancerCells = []),
                -1 === s.uranusInstancerCells.indexOf(i) && s.uranusInstancerCells.push(i));
        for (let e = 0; e < 16; e++)
            c[u++] = o[e]
    }
    ,
    UranusInstancerCell.prototype.removeInstanceFromPayload = function (e, t) {
        const n = e.cell;
        if (!n)
            return;
        const l = n.instances.indexOf(e);
        l > -1 && (n.instances.splice(l, 1),
            Array.isArray(n.buffer) && n.buffer.splice(16 * l, 16)),
            0 === n.instances.length && t.cells.delete(n.id)
    }
    ,
    UranusInstancerCell.vec = new pc.Vec3,
    UranusInstancerCell.prototype.getPositionOnGrid = function (e, t) {
        const n = Math.max(t.x, 1)
            , l = Math.max(t.y, 1)
            , a = Math.max(t.z, 1)
            , s = Math.floor(e.x / n) * n
            , r = Math.floor(e.y / l) * l
            , i = Math.floor(e.z / a) * a;
        return UranusInstancerCell.vec.set(s, r, i)
    }
    ,
    UranusInstancerCell.prototype.getCellGuid = function (e, t, n, l) {
        return e.toFixed(0) + "_" + t.toFixed(0) + "_" + n.toFixed(0) + "-" + l.x + "_" + l.y + "_" + l.z
    }
    ,
    UranusInstancerCell.prototype.calculateCellBounding = function (e, t) {
        const n = new pc.BoundingBox
            , l = n.halfExtents.copy(pc.Vec3.ZERO);
        l.x += t.x / 2,
            l.y += t.y / 2,
            l.z += t.z / 2;
        const a = n.center.copy(e);
        return a.x += l.x,
            a.y += l.y,
            a.z += l.z,
            n
    }
    ,
    UranusInstancerCell.prototype.getCellFromPosition = function (e, t, n, l) {
        const a = Math.max(n.x, 1)
            , s = Math.max(n.y, 1)
            , r = Math.max(n.z, 1)
            , i = Math.floor(e.x / a) * a
            , c = Math.floor(e.y / s) * s
            , o = Math.floor(e.z / r) * r
            , u = this.getCellGuid(i, c, o, n);
        t.cells || (t.cells = new Map);
        let d = t.cells.get(u);
        if (!d) {
            const e = t.refBoundingBox.halfExtents
                , a = new pc.Vec3;
            a.x += n.x / 2 + e.x / 2,
                a.y += n.y / 2 + e.y / 2,
                a.z += n.z / 2 + e.z / 2;
            const s = 2 * Math.max(a.x, a.y, a.z)
                , r = a.clone();
            r.x += i,
                r.y += c,
                r.z += o,
                d = UranusInstancerCell.prototype.createCell(u, r, a, s, l, t)
        }
        return d
    }
    ,
    UranusInstancerCell.prototype.createCell = function (e, t, n, l, a, s) {
        const r = {
            aabb: new pc.BoundingBox(t, n),
            center: t,
            cullingRadius: a,
            radius: l,
            buffer: [],
            id: e,
            instances: !1 === s.singleInstance ? [] : void 0,
            refLodIndices: []
        };
        return s.cells.set(e, r),
            s.shadowCaster && (s.shouldUpdateShadows = 2),
            r
    }
    ,
    UranusInstancerCell.tempSphere = new pc.BoundingSphere,
    UranusInstancerCell.cellsVisCache = new Map,
    UranusInstancerCell.prototype.isVisible = function (e, t, n) {
        let l = UranusInstancerCell.cellsVisCache.get(e.id);
        if (l || (l = {
            camera: void 0,
            layer: void 0,
            dirty: !0,
            visible: !1
        },
            UranusInstancerCell.cellsVisCache.set(e.id, l)),
            l.dirty || l.camera !== t || l.layer !== n) {
            l.camera = t,
                l.layer = n,
                l.dirty = !1;
            const a = UranusInstancerCell.tempSphere;
            a.center = e.center,
                a.radius = e.radius * e.cullingRadius;
            const s = t.frustum.containsSphere(a);
            l.visible = s > 0
        }
        return l.visible
    }
    ,
    UranusInstancerCell.prototype.updateInstancerCell = function (e) {
        e.forEach((e => {
            const t = e.entity.uranusInstancerCells;
            if (!t)
                return !0;
            t.forEach((e => e.entityMoved = !0))
        }
        ))
    }
    ;
var UranusInstancerLod = pc.createScript("uranusInstancerLod");
UranusInstancerLod.attributes.add("inEditor", {
    type: "boolean",
    default: !0
}),
    UranusInstancerLod.LAYER_TYPE_ALL = "all",
    UranusInstancerLod.LAYER_TYPE_MODEL = "model",
    UranusInstancerLod.LAYER_TYPE_SHADOW = "shadow",
    UranusInstancerLod.attributes.add("lodLevels", {
        type: "json",
        title: "Lod Levels",
        array: !0,
        schema: [{
            name: "index",
            type: "number",
            default: 0,
            precision: 0,
            min: 0,
            max: 9,
            description: "The LOD index for this level e.g. 0 for LOD0, 1 for LOD1."
        }, {
            name: "layer",
            type: "string",
            description: "Add an optional layer name to specify a LOD level for this layer only. If left blank it will be used for any layer."
        }, {
            name: "layerType",
            type: "string",
            default: UranusInstancerLod.LAYER_TYPE_ALL,
            enum: [{
                All: UranusInstancerLod.LAYER_TYPE_ALL
            }, {
                Model: UranusInstancerLod.LAYER_TYPE_MODEL
            }, {
                Shadow: UranusInstancerLod.LAYER_TYPE_SHADOW
            }],
            description: "Set what type of payloads this LOD level will apply to. If left blank it will be used for any type."
        }, {
            name: "start",
            type: "number",
            default: 0,
            description: "Starting from this distance from the camera this level of detail will be visible."
        }, {
            name: "end",
            type: "number",
            default: 0,
            description: "After this distance from the camera this level of detail will be hidden. Use 0 to keep it enabled infinitely."
        }]
    }),
    UranusInstancerLod.attributes.add("proxyMesh", {
        type: "entity",
        title: "Proxy Mesh",
        description: "If an entity is referenced, as soon as its model level of detail is visible, this entity model will be hidden. Useful for hierarchical LODs. The referenced entity needs to have an instanced model rendered."
    }),
    UranusInstancerLod.attributes.add("skipShadowsLod", {
        type: "boolean",
        default: !1,
        title: "Skip Shadows LOD",
        description: "If selected all shadowcaster instances will skip any LOD check. Useful for rendering shadows for a lower level of detail, to lower polycount. You can control which LOD casts shadows by using the model/render component Cast Shadows property."
    }),
    UranusInstancerLod.attributes.add("skipShadowsOffset", {
        type: "number",
        default: 0,
        title: "Skip Shadows Offset",
        description: "If Skip Shadows LOD is selected you can define an offset on the Y axis to adjust the rendering position of the LOD shadowcaster. Useful for removing self shadowing artifacts when rendering shadows on a level of detail with a different polycount."
    }),
    UranusInstancerLod.prototype.initialize = function () {
        this.lodLevelsFiltered = {},
            this.hasCustomShadowLod = !1
    }
    ,
    UranusInstancerLod.prototype.prepareLodLevels = function (e) {
        const t = {};
        this.lodLevels.forEach((e => {
            const n = e.layer ? e.layer : "";
            if (e.layerType === UranusInstancerLod.LAYER_TYPE_ALL) {
                let s = `${n}_${UranusInstancerLod.LAYER_TYPE_MODEL}`;
                t[s] || (t[s] = []),
                    t[s][e.index] = e,
                    s = `${n}_${UranusInstancerLod.LAYER_TYPE_SHADOW}`,
                    t[s] || (t[s] = []),
                    t[s][e.index] = e
            } else {
                const s = `${n}_${e.layerType}`;
                e.layerType === UranusInstancerLod.LAYER_TYPE_SHADOW && (this.hasCustomShadowLod = !0),
                    t[s] || (t[s] = []),
                    t[s][e.index] = e
            }
        }
        )),
            this.lodLevelsFiltered[e.id] = void 0;
        let n = `${e.layer.name}_${e.shadowCaster ? "shadow" : "model"}`;
        t[n] ? this.lodLevelsFiltered[e.id] = t[n].map((e => e)) : (n = "_" + (e.shadowCaster ? "shadow" : "model"),
            t[n] && (this.lodLevelsFiltered[e.id] = t[n].map((e => e))))
    }
    ,
    UranusInstancerLod.prototype.getLodIndexFromName = function (e) {
        const t = e.split("_")
            , n = t[t.length - 1];
        if (0 !== n.indexOf("LOD"))
            return -1;
        return parseInt(n.replace("LOD", ""))
    }
    ,
    UranusInstancerLod.prototype.isLodVisible = function (e, t, n, s, a, o) {
        if (!n)
            return 0;
        const r = n.fov > 90;
        let i;
        if (s)
            i = s[e];
        else {
            let t = this.lodLevelsFiltered[a.id];
            t || (this.prepareLodLevels(a),
                t = this.lodLevelsFiltered[a.id]),
                i = t[e]
        }
        if (!i) {
            if (r) {
                return n.node.getPosition().distance(t) <= n.farClip ? 2 : 0
            }
            return 0
        }
        const d = n.node.getPosition().distance(t)
            , l = i.start * o;
        return end = i.end > 0 ? i.end * o : 1 / 0,
            end > n.farClip && (end = n.farClip),
            d >= l && d < end ? 2 : 0
    }
    ;

var UranusUtilities = pc.createScript("uranusUtilities");
UranusUtilities.workerMinRestTime = 2e3,
    UranusUtilities.workersResting = 0,
    UranusUtilities.waitForWorker = function (e) { }
    ,
    UranusUtilities.loadAsset = function (e, n) {
        return new Promise((t => {
            const i = pc.Application.getApplication()
                , r = e instanceof pc.Asset ? e : i.assets.find(e, n);
            r ? (r.ready(t),
                i.assets.load(r)) : t()
        }
        ))
    }
    ,
    UranusUtilities.loadAssets = function (e) {
        return new Promise((n => {
            const t = pc.Application.getApplication();
            let i = 0;
            e = e.filter((e => e instanceof pc.Asset)),
                Array.isArray(e) || (e = [e]);
            const r = e.length
                , onAssetReady = function () {
                    i += 1,
                        i >= r && n()
                };
            for (let n = 0; n < e.length; n++) {
                const i = e[n];
                i && (i.loaded ? onAssetReady() : (i.ready(onAssetReady),
                    t.assets.load(i)))
            }
            e && e.length || onAssetReady()
        }
        ))
    }
    ,
    UranusUtilities.copyCameraProperties = function (e, n) {
        if (!e || !n)
            return;
        const t = e.camera
            , i = n.camera;
        t.fov = i.fov,
            t.aspectRatio = i.aspectRatio,
            t.clearColor = i.clearColor,
            t.clearColorBuffer = i.clearColorBuffer,
            t.clearDepthBuffer = i.clearDepthBuffer,
            t.clearStencilBuffer = i.clearStencilBuffer,
            t.farClip = i.farClip,
            t.nearClip = i.nearClip,
            t.frustumCulling = i.frustumCulling,
            t.rect.copy(i.rect)
    }
    ,
    UranusUtilities.readPixelsFromTexture = function (e) {
        const n = pc.Application.getApplication().graphicsDevice.gl
            , t = n.createFramebuffer();
        n.bindFramebuffer(n.FRAMEBUFFER, t),
            n.framebufferTexture2D(n.FRAMEBUFFER, n.COLOR_ATTACHMENT0, n.TEXTURE_2D, e._glTexture, 0);
        const i = new Uint8Array(e.width * e.height * 4);
        return n.readPixels(0, 0, e.width, e.height, n.RGBA, n.UNSIGNED_BYTE, i),
            n.bindFramebuffer(n.FRAMEBUFFER, null),
            i
    }
    ,
    UranusUtilities.getWorkerLibraryUrl = function (e) {
        const n = `importScripts( "${e}" );`;
        return URL.createObjectURL(new Blob([n], {
            type: "text/javascript"
        }))
    }
    ,
    UranusUtilities.createWorker = function (e, n) {
        let t;
        const i = pc.Application.getApplication().assets.find(n, "script");
        if (i) {
            const n = UranusUtilities.getWorkerLibraryUrl(UranusUtilities.getAbsoluteUrl(i.getFileUrl()));
            t = new Worker(n),
                t.addEventListener("message", (n => UranusUtilities.onWorkerMessage(e, n)))
        }
        return t
    }
    ,
    UranusUtilities.onWorkerMessage = function (e, n) {
        const t = n.data.type;
        if (!t)
            return;
        const i = n.data.data;
        e.fire(`worker:${t}`, i)
    }
    ,
    UranusUtilities.postWorkerMessage = function (e, n, t, i) {
        const r = [];
        i && UranusUtilities.getMessageBuffers(t, r),
            e.postMessage({
                type: n,
                data: t
            }, r)
    }
    ,
    UranusUtilities.getMessageBuffers = function (e, n) {
        Object.keys(e).forEach((t => {
            e[t] && (e[t].buffer ? n.push(e[t].buffer) : "object" == typeof e[t] && UranusUtilities.getMessageBuffers(e[t], n))
        }
        ))
    }
    ,
    UranusUtilities.getAbsoluteUrl = function (e) {
        if (0 === e.indexOf("http"))
            return e;
        const n = new URL(window.location.href);
        let t = n.origin;
        return 0 === e.indexOf("/") ? t += e : t += n.pathname + e,
            t
    }
    ,
    UranusUtilities.serializeEntityTRS = function (e) {
        const n = e.getLocalPosition()
            , t = e.getLocalEulerAngles()
            , i = e.getLocalScale();
        return {
            position: {
                x: n.x,
                y: n.y,
                z: n.z
            },
            rotation: {
                x: t.x,
                y: t.y,
                z: t.z
            },
            scale: {
                x: i.x,
                y: i.y,
                z: i.z
            }
        }
    }
    ,
    UranusUtilities.serializeVec3 = function (e) {
        return {
            x: e.x,
            y: e.y,
            z: e.z
        }
    }
    ,
    UranusUtilities.deserializeVec3 = function (e) {
        return new pc.Vec3(e.x, e.y, e.z)
    }
    ,
    UranusUtilities.prepareShaderForInjection = function (e, n) {
        const t = `${n}_uranusBase`;
        if (e.chunks[t])
            return;
        let i;
        if ("transformVS" === n)
            i = "\n// INJECT uniforms\n\nuniform mat4 matrix_view;\nuniform vec3 view_position;\n\n#ifdef PIXELSNAP\nuniform vec4 uScreenSize;\n#endif\n\n#ifdef MORPHING\nuniform vec4 morph_weights_a;\nuniform vec4 morph_weights_b;\n#endif\n\n#ifdef MORPHING_TEXTURE_BASED\nuniform vec4 morph_tex_params;\n\nvec2 getTextureMorphCoords() {\n    float vertexId = morph_vertex_id;\n    vec2 textureSize = morph_tex_params.xy;\n    vec2 invTextureSize = morph_tex_params.zw;\n\n    // turn vertexId into int grid coordinates\n    float morphGridV = floor(vertexId * invTextureSize.x);\n    float morphGridU = vertexId - (morphGridV * textureSize.x);\n\n    // convert grid coordinates to uv coordinates with half pixel offset\n    return (vec2(morphGridU, morphGridV) * invTextureSize) + (0.5 * invTextureSize);\n}\n#endif\n\n#ifdef MORPHING_TEXTURE_BASED_POSITION\nuniform highp sampler2D morphPositionTex;\n#endif\n\nmat4 getModelMatrix() {\n    #ifdef DYNAMICBATCH\n    return getBoneMatrix(vertex_boneIndices);\n    #elif defined(SKIN)\n    return matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);\n    #elif defined(INSTANCING)\n    return mat4(instance_line1, instance_line2, instance_line3, instance_line4);\n    #else\n    return matrix_model;\n    #endif\n}\n\nvec4 getPosition() {\n    dModelMatrix = getModelMatrix();\n    vec3 localPos = vertex_position;\n\n    #ifdef NINESLICED\n    // outer and inner vertices are at the same position, scale both\n    localPos.xz *= outerScale;\n\n    // offset inner vertices inside\n    // (original vertices must be in [-1;1] range)\n    vec2 positiveUnitOffset = clamp(vertex_position.xz, vec2(0.0), vec2(1.0));\n    vec2 negativeUnitOffset = clamp(-vertex_position.xz, vec2(0.0), vec2(1.0));\n    localPos.xz += (-positiveUnitOffset * innerOffset.xy + negativeUnitOffset * innerOffset.zw) * vertex_texCoord0.xy;\n\n    vTiledUv = (localPos.xz - outerScale + innerOffset.xy) * -0.5 + 1.0; // uv = local pos - inner corner\n\n    localPos.xz *= -0.5; // move from -1;1 to -0.5;0.5\n    localPos = localPos.xzy;\n    #endif\n\n    #ifdef MORPHING\n    #ifdef MORPHING_POS03\n    localPos.xyz += morph_weights_a[0] * morph_pos0;\n    localPos.xyz += morph_weights_a[1] * morph_pos1;\n    localPos.xyz += morph_weights_a[2] * morph_pos2;\n    localPos.xyz += morph_weights_a[3] * morph_pos3;\n    #endif // MORPHING_POS03\n    #ifdef MORPHING_POS47\n    localPos.xyz += morph_weights_b[0] * morph_pos4;\n    localPos.xyz += morph_weights_b[1] * morph_pos5;\n    localPos.xyz += morph_weights_b[2] * morph_pos6;\n    localPos.xyz += morph_weights_b[3] * morph_pos7;\n    #endif // MORPHING_POS47\n    #endif // MORPHING\n\n    #ifdef MORPHING_TEXTURE_BASED_POSITION\n    // apply morph offset from texture\n    vec2 morphUV = getTextureMorphCoords();\n    vec3 morphPos = texture2D(morphPositionTex, morphUV).xyz;\n    localPos += morphPos;\n    #endif\n\n    vec4 posW = dModelMatrix * vec4(localPos, 1.0);\n\n// INJECT chunk\n\n    #ifdef SCREENSPACE\n    posW.zw = vec2(0.0, 1.0);\n    #endif\n    dPositionW = posW.xyz;\n\n    vec4 screenPos;\n\n    #ifdef UV1LAYOUT\n    screenPos = vec4(vertex_texCoord1.xy * 2.0 - 1.0, 0.5, 1);\n    #else\n    #ifdef SCREENSPACE\n    screenPos = posW;\n    #else\n    screenPos = matrix_viewProjection * posW;\n    #endif\n\n    #ifdef PIXELSNAP\n    // snap vertex to a pixel boundary\n    screenPos.xy = (screenPos.xy * 0.5) + 0.5;\n    screenPos.xy *= uScreenSize.xy;\n    screenPos.xy = floor(screenPos.xy);\n    screenPos.xy *= uScreenSize.zw;\n    screenPos.xy = (screenPos.xy * 2.0) - 1.0;\n    #endif\n    #endif\n\n    return screenPos;\n}\n\nvec3 getWorldPosition() {\n    return dPositionW;\n}           \n";
        else
            i = `\n// INJECT uniforms\n\n${pc.shaderChunks[n]}\n`,
                i = i.replace("() {", "() {                \n// INJECT preChunk\n"),
                i = i.replace(new RegExp("}\n"), "\n// INJECT chunk\n}    \n");
        e.chunks[t] = i
    }
    ,
    UranusUtilities.addUranusBaseUniforms = function (e) {
        let n;
        if (e.chunks.basePS) {
            if (n = e.chunks.basePS,
                n.indexOf("uranus_view_position") > -1)
                return
        } else
            n = pc.shaderChunks.basePS;
        e.chunks.basePS = `\nuniform vec3 uranus_view_position;\n\n${n}\n`,
            e.chunks.APIVersion = pc.CHUNKAPI_1_62
    }
    ,
    UranusUtilities.textCapitalizeFirstLetter = function (e) {
        return e.charAt(0).toUpperCase() + e.slice(1)
    }
    ,
    UranusUtilities.findEntityMeshInstances = function (e, n) {
        let t = [];
        Array.isArray(e) ? e.forEach((e => {
            e instanceof pc.Entity != !1 && (t = t.concat(e.findComponents("model").concat(e.findComponents("render"))))
        }
        )) : t = e.findComponents("model").concat(e.findComponents("render")),
            n && (t = t.filter((e => !1 === e.entity.tags.has(...n))));
        let i = [];
        return t.forEach((e => {
            i = i.concat(e.meshInstances)
        }
        )),
            i
    }
    ,
    UranusUtilities.getMeshGeometry = function (e) {
        const n = e.node.getWorldTransform()
            , t = e.mesh.vertexBuffer
            , i = new pc.VertexIterator(t)
            , r = []
            , s = new pc.Vec3;
        for (let e = 0; e < t.getNumVertices(); e++) {
            const e = i.element[pc.SEMANTIC_POSITION]
                , t = e.array[e.index]
                , o = e.array[e.index + 1]
                , a = e.array[e.index + 2];
            s.set(t, o, a),
                n.transformPoint(s, s),
                r.push(s.x, s.y, s.z),
                i.next()
        }
        i.end();
        const o = e.mesh.indexBuffer[pc.RENDERSTYLE_SOLID]
            , a = new Uint16Array(o.lock())
            , c = []
            , l = e.mesh.primitive[0].base
            , u = e.mesh.primitive[0].count;
        for (let e = 0; e < u; e++)
            c.push(a[e + l]);
        return {
            vertices: r,
            indices: c,
            numIndices: u,
            numVertices: r.length / 3
        }
    }
    ,
    UranusUtilities.getCombinedGeometry = function (e) {
        const n = []
            , t = [];
        let i = 0
            , r = 0;
        for (let s = 0; s < e.length; s++) {
            const o = e[s]
                , a = UranusUtilities.getMeshGeometry(o);
            let c = 0;
            for (let e = 0; e < a.vertices.length; e += 3)
                t.push(a.vertices[e], a.vertices[e + 1], a.vertices[e + 2]),
                    c++;
            for (let e = 0; e < a.indices.length; e += 3)
                n.push(a.indices[e + 2] + r, a.indices[e + 1] + r, a.indices[e] + r);
            i += a.vertices.length / 3,
                r += c
        }
        return {
            positions: t,
            indices: n,
            offset: i
        }
    }
    ,
    UranusUtilities.vecToRecast = function (e) {
        return new Recast.Vec3(e.x, e.y, e.z)
    }
    ,
    UranusUtilities.recastToVec = function (e, n) {
        return n ? n.set(e.x, e.y, e.z) : new pc.Vec3(e.x, e.y, e.z)
    }
    ,
    UranusUtilities.loadGlbContainerFromAsset = function (e, n, t, i) {
        const r = pc.Application.getApplication();
        var s = function (e) {
            var r = new Blob([e.resource])
                , s = URL.createObjectURL(r);
            return this.loadGlbContainerFromUrl(s, n, t, (function (e, n) {
                i(e, n),
                    URL.revokeObjectURL(s)
            }
            ))
        }
            .bind(this);
        e.ready(s),
            r.assets.load(e)
    }
    ,
    UranusUtilities.loadGlbContainerFromUrl = function (e, n, t, i) {
        const r = pc.Application.getApplication();
        var s = t + ".glb"
            , o = {
                url: e,
                filename: s
            }
            , a = new pc.Asset(s, "container", o, null, n);
        return a.once("load", (function (e) {
            if (i) {
                var n = e.resource.animations;
                if (1 == n.length)
                    n[0].name = t;
                else if (n.length > 1)
                    for (var r = 0; r < n.length; ++r)
                        n[r].name = t + " " + r.toString();
                i(null, e)
            }
        }
        )),
            r.assets.add(a),
            r.assets.load(a),
            a
    }
    ,
    UranusUtilities.getUrlParam = function (e) {
        const n = new URLSearchParams(window.location.search);
        if (!0 === n.has(e))
            return n.get(e)
    }
    ,
    UranusUtilities.addUrlParam = function (e, n) {
        const t = new URL(window.location);
        t.searchParams.set(e, n),
            window.history.pushState(null, "", t.toString())
    }
    ,
    UranusUtilities.removeUrlParam = function (e) {
        const n = new URL(window.location);
        n.searchParams.delete(e),
            window.history.pushState(null, "", n.toString())
    }
    ,
    UranusUtilities.itemHasTag = function (e, n) {
        if (window.UranusEditor && !0 === window.UranusEditor.inEditor()) {
            let t;
            return e instanceof pc.Entity ? t = editor.entities.get(e._guid) : e instanceof pc.Asset && (t = editor.assets.get(e.id)),
                !!t && (t && t.get("tags").indexOf(n) > -1)
        }
        return e.tags.has(n)
    }
    ,
    UranusUtilities.shuffleArray = function (e, n) {
        n || (n = Math.random);
        for (var t = e.length - 1; t > 0; t--) {
            var i = Math.floor(n() * (t + 1))
                , r = e[t];
            e[t] = e[i],
                e[i] = r
        }
        return e
    }
    ,
    UranusUtilities.roundValue = function (e, n) {
        return Math.round(e * n) / n
    }
    ,
    UranusUtilities._distanceVec3 = new pc.Vec3,
    UranusUtilities.raycastFirstRigidbody = function (e, n, t, i) {
        const r = UranusUtilities._distanceVec3;
        let s = Number.MAX_VALUE
            , o = null;
        const a = pc.app.systems.rigidbody.raycastAll(e, n);
        for (let n = 0; n < a.length; ++n) {
            const c = a[n]
                , l = c.entity.rigidbody;
            if (l && (void 0 === t || l.group !== t) && (void 0 === i || c.entity !== i)) {
                r.sub2(c.point, e);
                const n = r.lengthSq();
                n < s && (s = n,
                    o = c)
            }
        }
        return o
    }
    ,
    UranusUtilities.raycastFirstColliderTag = function (e, n, t) {
        const i = UranusUtilities._distanceVec3;
        let r = Number.MAX_VALUE
            , s = null;
        const o = pc.app.systems.rigidbody.raycastAll(e, n);
        for (let n = 0; n < o.length; ++n) {
            const a = o[n];
            if (a?.entity.tags.has(t)) {
                i.sub2(a.point, e);
                const n = i.lengthSq();
                n < r && (r = n,
                    s = a)
            }
        }
        return s
    }
    ,
    UranusUtilities.smoothDampVec3 = function (e, n, t, i, r, s) {
        var o = 0
            , a = 0
            , c = 0
            , l = 2 / (i = Math.max(1e-4, i))
            , u = l * s
            , f = 1 / (1 + u + .48 * u * u + .235 * u * u * u)
            , p = e.x - n.x
            , d = e.y - n.y
            , U = e.z - n.z
            , h = n
            , m = r * i
            , x = p + p + d + d + U + U;
        if (x > Math.pow(r, 2)) {
            var g = Math.sqrt(x);
            p = p / g * m,
                d = d / g * m,
                U = U / g * m
        }
        n.x = e.x - p,
            n.y = e.y - d,
            n.z = e.z - U;
        var y = (t.x + l * p) * s
            , v = (t.y + l * d) * s
            , _ = (t.z + l * U) * s;
        t.x = (t.x - l * y) * f,
            t.y = (t.y - l * v) * f,
            t.z = (t.z - l * _) * f,
            o = n.x + (p + y) * f,
            a = n.y + (d + v) * f,
            c = n.z + (U + _) * f;
        var P = h.x - e.x
            , w = h.y - e.y
            , z = h.z - e.z;
        P * (o - h.x) + w * (a - h.y) + z * (c - h.z) > 0 && (o = h.x,
            a = h.y,
            c = h.z,
            t.x = (o - h.x) / s,
            t.y = (a - h.y) / s,
            t.z = (c - h.z) / s),
            e.x = o,
            e.y = a,
            e.z = c
    }
    ,
    UranusUtilities.isEven = function (e) {
        return e % 2
    }
    ,
    UranusUtilities.random = function (e, n, t) {
        const i = n - e;
        return (t || Math.random)() * i + e
    }
    ;
