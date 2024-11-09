var UranusInstancerOcclusion = pc.createScript("uranusInstancerOcclusion");
UranusInstancerOcclusion.attributes.add("inEditor", {
    type: "boolean",
    default: !1
}),
    UranusInstancerOcclusion.attributes.add("occlusionType", {
        type: "string",
        default: "occluder",
        enum: [{
            Occluder: "occluder"
        }, {
            Occludee: "occludee"
        }],
        title: "Occlusion Type",
        description: "1. Occluder: this entity will act as an occluder and obstruct occludees. 2. Occludee: this entity will act as an occludee and getting obstructed by occluders. A hardware occlusion query will execute for this entity based on its occlusion shape. The entity will be automatically change its visible status based on the query result."
    }),
    UranusInstancerOcclusion.attributes.add("occlusionShape", {
        type: "string",
        default: "calculateBounding",
        enum: [{
            "Calculate Bounding": "calculateBounding"
        }, {
            "Collision Bounding": "collisionBounding"
        }, {
            "Raw Geometry": "rawGeometry"
        }, {
            None: "none"
        }],
        title: "Occlusion Shape",
        description: "1. Calculate Bounding: the script will automatically calculate the total bounding box of the model. 2. Collision Bounding: If a box collision component is provided that bounding box will be used. 3. Raw Geometry: No bounding box will be created, the raw geometry will be rendered in the Occlusion Layer. This provides accurate queries at the cost of performance. 4. None: The script will not add any model to the Occlusion Layer. Requires application restart."
    }),
    UranusInstancerOcclusion.attributes.add("isStatic", {
        type: "boolean",
        default: !0,
        title: "Is Static",
        description: "If selected the occluder will not update its position/rotation/scale per frame, this is a performance optimization."
    }),
    UranusInstancerOcclusion.attributes.add("behaviorResult", {
        type: "string",
        default: "visibilityState",
        enum: [{
            "Visibility State": "visibilityState"
        }, {
            "Entity State": "entityState"
        }, {
            None: "none"
        }],
        title: "Behavior Result",
        description: "Controls what will happen When the occlusion query returns a new visibility state (works for Occludees only). 1. Visibility State: The model will change its visibility state. 2. Entity State: The entity will change its Enabled property. 3. Nothing will happen and only onEvent will fire if provided. Useful for gameplay only queries."
    }),
    UranusInstancerOcclusion.attributes.add("refEntities", {
        type: "entity",
        array: !0,
        title: "Reference Entities",
        description: "Optionally provide one or more entities that this occludee is responsible for managing their state instead of this entity."
    }),
    UranusInstancerOcclusion.attributes.add("bypassInstancer", {
        type: "boolean",
        default: !1,
        title: "Bypass Instancer",
        description: "If selected the occludee will toggle its model/render component instead of using the instancer to handle visibility."
    }),
    UranusInstancerOcclusion.attributes.add("onEvent", {
        type: "string",
        title: "On Event",
        description: "If an event name is provided it will automatically fire on the pc.Application context when the visibility state changes."
    }),
    UranusInstancerOcclusion.prototype.initialize = function () {
        this.bounding = new pc.BoundingBox,
            this.occlusionEntity = void 0,
            this.useWorldTransform = !1,
            this.useCollisionBounding = !1,
            this.glQuery = void 0,
            this.enableOcclusionCulling(),
            this.prepareOcclusionEntity(),
            this.addOcclusionQuery(),
            this.on("state", (function (t) {
                this.occlusionEntity && "entityState" !== this.behaviorResult && (this.occlusionEntity.enabled = t)
            }
            )),
            this.on("destroy", (function () {
                if (this.glQuery) {
                    this.app.graphicsDevice.gl.deleteQuery(this.glQuery)
                }
                this.occlusionEntity && this.occlusionEntity.destroy()
            }
            ))
    }
    ,
    UranusInstancerOcclusion.prototype.update = function () {
        !1 === this.isStatic && this.occlusionEntity && this.updateTransform()
    }
    ,
    UranusInstancerOcclusion.prototype.updateTransform = function () {
        const t = this.entity
            , e = this.occlusionEntity;
        if (this.useWorldTransform) {
            const n = t.getWorldTransform();
            e.setPosition(n.getTranslation()),
                e.setEulerAngles(n.getEulerAngles()),
                e.setLocalScale(n.getScale())
        } else {
            const n = this.bounding;
            if (this.useCollisionBounding) {
                const e = t.collision;
                n.center.copy(e.getShapePosition()),
                    n.halfExtents.copy(e.halfExtents)
            } else
                t.render && t.render.meshInstances.forEach(((t, e) => {
                    debugger;
                    0 === e ? n.copy(t.aabb) : n.add(t.aabb)
                }
                ));
            e.setPosition(n.center),
                e.setLocalScale(2 * n.halfExtents.x, 2 * n.halfExtents.y, 2 * n.halfExtents.z)
        }
    }
    ,
    UranusInstancerOcclusion.prototype.prepareOcclusionEntity = function () {
        const t = this.app.scene.layers.getLayerByName("Occlusion");
        t && ("none" !== this.occlusionShape ? ("rawGeometry" === this.occlusionShape ? (this.occlusionEntity = new pc.Entity,
            this.entity.render.system.cloneComponent(this.entity, this.occlusionEntity),
            this.occlusionEntity.render.layers = [t.id],
            this.app.root.addChild(this.occlusionEntity),
            this.useWorldTransform = !0) : (this.occlusionEntity = new pc.Entity,
                this.occlusionEntity.addComponent("render", {
                    type: "box",
                    layers: [t.id]
                }),
                this.app.root.addChild(this.occlusionEntity),
                "collisionBounding" === this.occlusionShape && this.entity.collision && "box" === this.entity.collision.type && (this.useCollisionBounding = !0)),
            this.updateTransform(),
            this.occlusionEntity.render.meshInstances.forEach((t => t.isOccludee = "occludee" === this.occlusionType))) : this.occlusionEntity = this.entity)
    }
    ,
    UranusInstancerOcclusion.prototype.addOcclusionQuery = function () {
        if (!this.occlusionEntity || "occludee" === !this.occlusionType)
            return;
        const t = this.app.graphicsDevice.gl;
        this.occlusionEntity.render.meshInstances.forEach((e => {
            const n = {
                inProgress: !1,
                meshInstance: e,
                onOcclusionResult: t => this.setVisibleState(t),
                query: t.createQuery()
            };
            this.glQuery = n.query,
                e.uranusInstancerOcclusion = n
        }
        ))
    }
    ,
    UranusInstancerOcclusion.prototype.setVisibleState = function (t) {
        const e = this.refEntities
            , n = e.length > 0;
        this.bypassInstancer ? "visibilityState" === this.behaviorResult ? n ? e.forEach((e => e.render.enabled = t)) : this.entity.render.enabled = t : "entityState" === this.behaviorResult && (n ? e.forEach((e => e.enabled = t)) : this.entity.enabled = t) : "visibilityState" === this.behaviorResult ? n ? e.forEach((e => e.uranusZoneActive = t)) : this.entity.uranusZoneActive = t : "entityState" === this.behaviorResult && (n ? e.forEach((e => e.enabled = t)) : this.entity.enabled = t),
            this.onEvent && this.app.fire(this.onEvent, t)
    }
    ,
    UranusInstancerOcclusion.cullingEnabled = !1,
    UranusInstancerOcclusion.layer = void 0,
    UranusInstancerOcclusion.nextLayer = void 0,
    UranusInstancerOcclusion.bypassCulling = void 0,
    UranusInstancerOcclusion.toggleDebugger = function () {
        const t = UranusInstancerOcclusion.nextLayer;
        t && (t.clearColorBuffer = !t.clearColorBuffer,
            t.clearDepthBuffer = !t.clearDepthBuffer)
    }
    ,
    UranusInstancerOcclusion.setOcclusionState = function (t) {
        UranusInstancerOcclusion.layer.opaqueMeshInstances.forEach((e => {
            const n = e.uranusInstancerOcclusion;
            e.visible = t,
                !1 === t && n && (n.onOcclusionResult(!0),
                    n.inProgress = !1)
        }
        ))
    }
    ,
    UranusInstancerOcclusion.prototype.enableOcclusionCulling = function () {
        if (UranusInstancerOcclusion.cullingEnabled)
            return;
        UranusInstancerOcclusion.cullingEnabled = !0;
        const t = this.app.scene.layers.getLayerByName("Occlusion");
        UranusInstancerOcclusion.layer = t,
            t.opaqueSortMode = pc.SORTMODE_CUSTOM,
            t.passThrough = !0,
            t.shaderPass = pc.SHADER_DEPTH;
        const e = this.app.scene.layers.layerList.findIndex((t => "Occlusion" === t.name)) + 1
            , n = this.app.scene.layers.layerList[e];
        UranusInstancerOcclusion.nextLayer = n,
            n.clearColorBuffer = !0,
            n.clearDepthBuffer = !0,
            t.customCalculateSortValues = function (t, e, n, i) {
                this._calculateSortDistances(t, e, n, i)
            }
            ,
            t.customSortCallback = function (t, e) {
                return t.isOccludee || e.isOccludee ? t.isOccludee && e.isOccludee ? e.zdist - t.zdist : t.isOccludee ? 1 : -1 : t.zdist - e.zdist
            }
            ,
            pc.app.renderer.drawInstance = function (t, e, n, i, s) {
                const o = e.instancingData;
                if (o)
                    o.count > 0 && (this._instancedDrawCalls++,
                        t.setVertexBuffer(o.vertexBuffer),
                        t.draw(n.primitive[i], o.count));
                else {
                    const o = e.node.worldTransform;
                    this.modelMatrixId.setValue(o.data),
                        s && this.normalMatrixId.setValue(e.node.normalMatrix.data);
                    const c = pc.app.graphicsDevice.gl
                        , a = e.uranusInstancerOcclusion;
                    if (a && a.inProgress && c.getQueryParameter(a.query, c.QUERY_RESULT_AVAILABLE)) {
                        const t = !!c.getQueryParameter(a.query, c.QUERY_RESULT);
                        a.onOcclusionResult(t),
                            a.inProgress = !1
                    }
                    a && !a.inProgress && c.beginQuery(c.ANY_SAMPLES_PASSED_CONSERVATIVE, a.query),
                        t.draw(n.primitive[i]),
                        a && !a.inProgress && (c.endQuery(c.ANY_SAMPLES_PASSED_CONSERVATIVE),
                            a.inProgress = !0)
                }
            }
                .bind(pc.app.renderer)
    }



var UranusInstancerZone = pc.createScript("uranusInstancerZone");
UranusInstancerZone.attributes.add("inEditor", {
    type: "boolean",
    default: !1
}),
    UranusInstancerZone.attributes.add("activeCameras", {
        type: "entity",
        array: !0,
        title: "Active Cameras",
        description: "A list of entities to be used for calculating the state of the occludees from. Requires a collider together with a dynamic or kinematic rigidbody."
    }),
    UranusInstancerZone.attributes.add("occluder", {
        type: "entity",
        title: "Occluder",
        description: "Reference an entity with a collision component attached that will act as the occluder zone. When the active camera enters the zone, all occludees will be visible."
    }),
    UranusInstancerZone.attributes.add("filters", {
        type: "entity",
        title: "Filters",
        description: "Optionally reference an entity with a collision component attached that will filter the occludees based on their world position. Any occludee outside of the collision trigger will be discarded and not parsed. Support collision shapes are box and sphere."
    }),
    UranusInstancerZone.attributes.add("bypassInstancer", {
        type: "boolean",
        default: !1,
        title: "Bypass Instancer",
        description: "If selected the occluder will toggle the model/render component instead of using the instancer to toggle visibility."
    }),
    UranusInstancerZone.attributes.add("occludees", {
        type: "entity",
        array: !0,
        title: "Occludees",
        description: "A list of one or more entities to find occludees. Occludees will be any render component attached to them and on their children."
    }),
    UranusInstancerZone.prototype.initialize = function () {
        this.lastOccluder = void 0,
            this.occludeeEntities = [],
            this.activeCamera = void 0,
            this.camerasInTriggers = {},
            this.activeState = void 0,
            this.boundingBox = new pc.BoundingBox,
            this.prepare(),
            this.attachListeners(),
            this.on("attr:occluder", (function () {
                this.detachListeners(),
                    this.attachListeners()
            }
            )),
            this.on("destroy", this.onDestroy)
    }
    ,
    UranusInstancerZone.prototype.prepare = function () {
        let e = this.filters ? this.filters.findComponents("collision") : [];
        this.occludees.forEach((t => {
            const n = t.findComponents("render");
            let i = this.filterOccludees(n, e);
            i = i.filter((e => !0 === e.entity.enabled && !0 === e.enabled)),
                this.occludeeEntities = this.occludeeEntities.concat(i.map((e => e.entity)))
        }
        ))
    }
    ,
    UranusInstancerZone.prototype.filterOccludees = function (e, t) {
        if (t.length > 0) {
            let n = [];
            const i = this.boundingBox;
            e: for (const s of t) {
                let t;
                switch (s.type) {
                    case "box":
                        i.center.copy(s.entity.getPosition()),
                            i.halfExtents.copy(s.halfExtents);
                        break;
                    case "sphere":
                        t = s.entity.getPosition();
                        break;
                    default:
                        continue e
                }
                for (const r of e) {
                    const e = r.entity.getPosition();
                    let o = !1;
                    switch (s.type) {
                        case "box":
                            o = i.containsPoint(e);
                            break;
                        case "sphere":
                            o = t.distance(e) <= s.radius;
                            break;
                        default:
                            continue e
                    }
                    o && -1 === n.indexOf(r) && n.push(r)
                }
            }
            return n
        }
        return e
    }
    ,
    UranusInstancerZone.prototype.onDestroy = function () {
        this.detachListeners()
    }
    ,
    UranusInstancerZone.prototype.attachListeners = function () {
        if (!this.occluder)
            return;
        this.occluder.findComponents("collision").forEach((e => {
            e.on("triggerenter", this.onTriggerEnter, this),
                e.on("triggerleave", this.onTriggerLeave, this)
        }
        )),
            this.lastOccluder = this.occluder
    }
    ,
    UranusInstancerZone.prototype.detachListeners = function () {
        if (!this.lastOccluder)
            return;
        this.occluder.findComponents("collision").forEach((e => {
            e.off("triggerenter", this.onTriggerEnter, this),
                e.off("triggerleave", this.onTriggerLeave, this)
        }
        )),
            this.lastOccluder = void 0
    }
    ,
    UranusInstancerZone.prototype.onTriggerEnter = function (e) {
        e === this.activeCamera && (this.camerasInTriggers[e._guid] || (this.camerasInTriggers[e._guid] = 0),
            this.camerasInTriggers[e._guid]++)
    }
    ,
    UranusInstancerZone.prototype.onTriggerLeave = function (e) {
        e === this.activeCamera && this.camerasInTriggers[e._guid]--
    }
    ,
    UranusInstancerZone.prototype.isActive = function () {
        return this.activeCamera && this.camerasInTriggers && this.camerasInTriggers[this.activeCamera._guid] > 0
    }
    ,
    UranusInstancerZone.prototype.update = function (e) {
        let t;
        if (this.activeCameras.forEach((e => {
            e.enabled && (t = e)
        }
        )),
            !t) {
            const e = this.app.scene.layers.cameras;
            if (0 === e.length)
                return;
            t = e[e.length - 1].entity
        }
        this.activeCamera = t;
        const n = this.isActive();
        n !== this.activeState && (this.activeState = n,
            this.setOccluderState(n))
    }
    ,
    UranusInstancerZone.prototype.setOccluderState = function (e) {
        this.bypassInstancer ? this.occludeeEntities.forEach((t => {
            const n = t.render ? t.render : t.model;
            n && (n.enabled = e)
        }
        )) : this.occludeeEntities.forEach((t => t.uranusZoneActive = e))
    }
    ;