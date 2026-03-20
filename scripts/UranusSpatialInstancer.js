var UranusSpatialBatch = pc.createScript("uranusSpatialBatch");
UranusSpatialBatch.attributes.add("batchGroupName", {
    type: "string",
    title: "Batch Group Name",
    description: "The batch group name to target, only one instance of this script should run per batch group type."
}),
    UranusSpatialBatch.attributes.add("frustumCulling", {
        type: "boolean",
        default: !0,
        title: "Frustum Culling",
        description: "Controls the culling of batches against the camera frustum (frustum culling needs to enabled on each camera component). If false all batches will be rendered regardless of their visibility."
    }),
    UranusSpatialBatch.attributes.add("layerSimplifySettings", {
        type: "json",
        array: !0,
        title: "Layer Simplify Settings",
        description: "Optional overrides for batch simplification per layer and per renderer (forward vs shadow caster). If a matching entry exists with shadowCaster=true, a dedicated shadow-only mesh instance will be created for that layer so shadows can use different triangle settings.",
        schema: [{
            name: "layer",
            type: "string",
            title: "Layer",
            description: 'Layer name to match (case-insensitive). Use "*" to match all layers.'
        }, {
            name: "shadowCaster",
            type: "boolean",
            default: !1,
            title: "Shadow Caster",
            description: "If true, applies to the shadow-caster renderer (shadow map pass). If false, applies to the forward renderer."
        }, {
            name: "triangleRatio",
            type: "number",
            default: 1,
            min: 0,
            max: 1,
            precision: 2,
            title: "Triangle Ratio",
            description: "Desired triangle retention as a ratio of the source mesh (0..1). This is converted into a target index count: floor(sourceIndexCount * ratio) and then rounded down to a multiple of 3. 1 keeps the original mesh (no simplification); smaller values reduce triangles more aggressively."
        }, {
            name: "simplifyError",
            type: "number",
            default: 1,
            min: 0,
            max: 1,
            precision: 4,
            title: "Simplify Error",
            description: 'Maximum allowed geometric deviation during simplification. This value is passed as the simplifier "error/tolerance" parameter: lower values preserve shape more strictly (less reduction), higher values allow more deviation (more reduction) for the same triangleRatio.'
        }, {
            name: "lockBorder",
            type: "boolean",
            default: !1,
            title: "Lock Border",
            description: "If enabled, passes the MeshoptSimplifier 'LockBorder' flag so boundary vertices/edges are preserved (open edges, UV/seam-like boundaries). This helps prevent cracks or silhouette shrink on borders, but can reduce how much the mesh can be simplified."
        }, {
            name: "maxAabbSize",
            type: "number",
            default: 0,
            min: 0,
            precision: 2,
            title: "Max AABB Size",
            description: "Optional per-layer override for the batch group maxAabbSize (0 = use batch group value)."
        }]
    }),
    UranusSpatialBatch.addBatch = {},
    UranusSpatialBatch.removeBatch = {};
var URANUS_MESHOPT_LOCK_BORDER_FLAGS = ["LockBorder"]
    , URANUS_MESHOPT_MODULE_READY_EVENT = "uranusModuleLoader:MeshoptSimplifier:ready"
    , URANUS_MESHOPT_KEY_SCALE = 1e4;
UranusSpatialBatch.prototype.initialize = function () {
    this.batchGroup = void 0,
        this.instancerDisable = this.entity.tags.has("instancer-disable"),
        this.instancerShadowsOnly = this.entity.tags.has("instancer-shadows-only"),
        this._singleMeshInstances = [null],
        this._layerSimplifyForward = {},
        this._layerSimplifyShadow = {},
        this._layerSimplifyForwardAny = null,
        this._layerSimplifyShadowAny = null,
        this._meshoptCache = new WeakMap,
        this._meshoptPending = [],
        this._meshoptListenerAttached = !1,
        this._meshoptReadyPromiseAttached = !1,
        this._meshoptReadyPromiseResolved = !1,
        this._meshoptProcessBound = this.processMeshoptPending.bind(this),
        this._meshoptPollNextMs = 0,
        this._meshoptPollIntervalMs = 250,
        this.on("attr:layerSimplifySettings", this.rebuildLayerSimplifyLookup, this),
        this.rebuildLayerSimplifyLookup(),
        this.patchBatchManager(),
        this.on("destroy", this.onDestroy, this),
        this.prepare()
}
    ,
    UranusSpatialBatch.prototype.onDestroy = function () {
        this._meshoptListenerAttached && (this.app.off(URANUS_MESHOPT_MODULE_READY_EVENT, this._meshoptProcessBound),
            this._meshoptListenerAttached = !1),
            this._meshoptPending && (this._meshoptPending.length = 0),
            this._singleMeshInstances && (this._singleMeshInstances[0] = null),
            this.batchGroup && (this.batchGroup._uranusMaxAabbSizeByLayerId = null,
                this.batchGroup._uranusHasMaxAabbSizeOverrides = !1)
    }
    ,
    UranusSpatialBatch.prototype.update = function (e) {
        const t = this._meshoptPending;
        if (!t || 0 === t.length)
            return;
        const i = pc.now();
        i < this._meshoptPollNextMs || (this._meshoptPollNextMs = i + this._meshoptPollIntervalMs,
            this.processMeshoptPending())
    }
    ,
    UranusSpatialBatch.prototype.rebuildLayerSimplifyLookup = function () {
        this._layerSimplifyForward = {},
            this._layerSimplifyShadow = {},
            this._layerSimplifyForwardAny = null,
            this._layerSimplifyShadowAny = null;
        const e = this.layerSimplifySettings;
        if (e && 0 !== e.length) {
            for (let t = 0; t < e.length; t++) {
                const i = e[t];
                if (!i)
                    continue;
                const a = (void 0 !== i.layer && null !== i.layer ? "" + i.layer : "*").trim().toLowerCase()
                    , s = "*" === a || "" === a
                    , r = {
                        layer: s ? "*" : a,
                        shadowCaster: !!i.shadowCaster,
                        triangleRatio: void 0 !== i.triangleRatio ? i.triangleRatio : 1,
                        simplifyError: void 0 !== i.simplifyError ? i.simplifyError : 1,
                        lockBorder: !!i.lockBorder,
                        maxAabbSize: void 0 !== i.maxAabbSize && null !== i.maxAabbSize ? i.maxAabbSize : 0
                    };
                r.triangleRatio < 0 ? r.triangleRatio = 0 : r.triangleRatio > 1 && (r.triangleRatio = 1),
                    r.simplifyError < 0 ? r.simplifyError = 0 : r.simplifyError > 1 && (r.simplifyError = 1),
                    r.maxAabbSize < 0 && (r.maxAabbSize = 0),
                    r.shadowCaster ? s ? this._layerSimplifyShadowAny = r : this._layerSimplifyShadow[a] = r : s ? this._layerSimplifyForwardAny = r : this._layerSimplifyForward[a] = r
            }
            this.batchGroup && (this.applyBatchGroupOverrides(),
                this.app.batcher.markGroupDirty(this.batchGroup.id))
        } else
            this.batchGroup && (this.applyBatchGroupOverrides(),
                this.app.batcher.markGroupDirty(this.batchGroup.id))
    }
    ,
    UranusSpatialBatch.prototype.getLayerSimplifySettings = function (e, t) {
        const i = null != e ? ("" + e).toLowerCase() : "";
        return t ? this._layerSimplifyShadow[i] || this._layerSimplifyShadowAny : this._layerSimplifyForward[i] || this._layerSimplifyForwardAny
    }
    ,
    UranusSpatialBatch.prototype.getLayerMaxAabbSize = function (e) {
        const t = this.getLayerSimplifySettings(e, !1)
            , i = this.getLayerSimplifySettings(e, !0)
            , a = t && void 0 !== t.maxAabbSize && t.maxAabbSize > 0 ? t.maxAabbSize : 0
            , s = i && void 0 !== i.maxAabbSize && i.maxAabbSize > 0 ? i.maxAabbSize : 0;
        return a > 0 && s > 0 ? a < s ? a : s : a > 0 ? a : s
    }
    ,
    UranusSpatialBatch.prototype.applyBatchGroupOverrides = function () {
        const e = this.batchGroup;
        if (!e)
            return;
        e._uranusHasMaxAabbSizeOverrides = !1,
            e._uranusMaxAabbSizeByLayerId = null;
        const t = e.layers
            , i = this.app && this.app.scene && this.app.scene.layers;
        if (!i || !t || 0 === t.length)
            return;
        const a = void 0 !== e.maxAabbSize && null !== e.maxAabbSize ? e.maxAabbSize : 0
            , s = Object.create(null);
        let r = !1;
        for (let e = 0; e < t.length; e++) {
            const n = t[e]
                , o = i.getLayerById(n);
            if (!o)
                continue;
            const h = this.getLayerMaxAabbSize(o.name);
            h > 0 && (0 === a || Math.abs(h - a) > 1e-5) && (s[n] = h,
                r = !0)
        }
        r && (e._uranusHasMaxAabbSizeOverrides = !0,
            e._uranusMaxAabbSizeByLayerId = s)
    }
    ,
    UranusSpatialBatch.prototype.patchBatchManager = function () {
        const e = this.app && this.app.batcher;
        e && !e._uranusLayerMaxAabbSizePatched && (e._uranusLayerMaxAabbSizePatched = !0,
            e._uranusGenerateOriginal = e.generate,
            e.generate = function (e) {
                const t = this._uranusGenerateOriginal
                    , i = this._batchGroups;
                if (!t || !i)
                    return t ? t.call(this, e) : void 0;
                let a = e;
                a || (a = Object.keys(i));
                let s = !1;
                for (let e = 0; e < a.length; e++) {
                    const t = i[a[e]];
                    if (t && t._uranusHasMaxAabbSizeOverrides) {
                        s = !0;
                        break
                    }
                }
                if (!s)
                    return t.call(this, e);
                const r = {};
                e || (e = Object.keys(i));
                const n = Object.create(null);
                for (let t = 0; t < e.length; t++)
                    n[e[t]] = 1;
                const o = [];
                for (let e = 0; e < this._batchList.length; e++) {
                    const t = this._batchList[e];
                    n[t.batchGroupId] ? this.destroyBatch(t) : o.push(t)
                }
                if (this._batchList = o,
                    this._collectAndRemoveMeshInstances(r, e),
                    e === this._dirtyGroups)
                    this._dirtyGroups.length = 0;
                else {
                    const e = [];
                    for (let t = 0; t < this._dirtyGroups.length; t++) {
                        const i = this._dirtyGroups[t];
                        n[i] || e.push(i)
                    }
                    this._dirtyGroups = e
                }
                let h, l, c, p;
                for (const e in r) {
                    if (!r.hasOwnProperty(e))
                        continue;
                    if (h = r[e],
                        c = i[e],
                        !c) {
                        pc && pc.Debug && pc.Debug.error ? pc.Debug.error("batch group " + e + " not found") : console.error("batch group " + e + " not found");
                        continue
                    }
                    const t = c._ui || c._sprite
                        , a = parseInt(e, 10)
                        , s = c.layers
                        , n = c._uranusMaxAabbSizeByLayerId
                        , o = void 0 !== c.maxAabbSize && null !== c.maxAabbSize ? c.maxAabbSize : Number.POSITIVE_INFINITY;
                    if (s && s.length > 0 && n) {
                        const e = Object.create(null)
                            , i = [];
                        for (let t = 0; t < s.length; t++) {
                            const a = s[t]
                                , r = n[a]
                                , h = null != r ? r : o
                                , l = "" + h;
                            let c = e[l];
                            c || (c = e[l] = {
                                maxAabbSize: h,
                                layers: []
                            },
                                i.push(l)),
                                c.layers.push(a)
                        }
                        for (let s = 0; s < i.length; s++) {
                            const r = e[i[s]];
                            l = this.prepare(h, c.dynamic, r.maxAabbSize, t);
                            for (let e = 0; e < l.length; e++)
                                p = this.create(l[e], c.dynamic, a),
                                    p && (p._uranusMaxAabbSize = r.maxAabbSize,
                                        p.addToLayers(this.scene, r.layers))
                        }
                    } else {
                        l = this.prepare(h, c.dynamic, o, t);
                        for (let e = 0; e < l.length; e++)
                            p = this.create(l[e], c.dynamic, a),
                                p && (p._uranusMaxAabbSize = o,
                                    p.addToLayers(this.scene, s))
                    }
                }
            }
        )
    }
    ,
    UranusSpatialBatch.prototype.prepare = function () {
        this.batchGroupName && (this.batchGroup = this.app.batcher.getGroupByName(this.batchGroupName),
            this.batchGroup && (void 0 === this.batchGroup._uranusHasMaxAabbSizeOverrides && (this.batchGroup._uranusHasMaxAabbSizeOverrides = !1,
                this.batchGroup._uranusMaxAabbSizeByLayerId = null),
                this.applyBatchGroupOverrides(),
                this.app.batcher.markGroupDirty(this.batchGroup.id),
                UranusSpatialBatch.addBatch[this.batchGroup.id] = this.addBatch.bind(this),
                UranusSpatialBatch.removeBatch[this.batchGroup.id] = this.removeBatch.bind(this)))
    }
    ,
    UranusSpatialBatch.prototype.cloneMeshInstance = function (e, t, i) {
        const a = new pc.MeshInstance(e.mesh, e.material, e.node);
        return a.castShadow = e.castShadow,
            a.parameters = e.parameters,
            a.layer = e.layer,
            a._shaderDefs = e._shaderDefs,
            a.batching = !0,
            a.cull = e.cull,
            a.skinInstance = e.skinInstance,
            a.drawOrder = e.drawOrder,
            a.stencilFront = e.stencilFront,
            a.stencilBack = e.stencilBack,
            a.flipFacesFactor = e.flipFacesFactor,
            a.castShadow = e.castShadow,
            a.aabb = e.aabb,
            a._updateAabb = !1,
            a._uranusShadowOnly = !!i,
            t && this.applySimplifySettings(a, e.mesh, t),
            a
    }
    ,
    UranusSpatialBatch.prototype.addBatch = function (e, t) {
        if (this.instancerDisable)
            return;
        const i = t.name
            , a = this.getLayerSimplifySettings(i, !1)
            , s = this.getLayerSimplifySettings(i, !0)
            , r = !!s && !(!e.meshInstance || !e.meshInstance.castShadow)
            , n = this.cloneMeshInstance(e.meshInstance, a, !1);
        r && (n.castShadow = !1),
            e.spatialMeshInstances || (e.spatialMeshInstances = []),
            n._uranusSpatialLayerId = t.id;
        const o = this._singleMeshInstances;
        o[0] = n,
            t.addMeshInstances(o),
            e.spatialMeshInstances.push(n);
        let h = null;
        r && (h = this.cloneMeshInstance(e.meshInstance, s, !0),
            h._uranusSpatialLayerId = t.id,
            o[0] = h,
            t.addMeshInstances(o),
            e.spatialMeshInstances.push(h)),
            o[0] = null,
            this.setupVisibilityForLayer(e, t, n),
            h && this.setupVisibilityForLayer(e, t, h)
    }
    ,
    UranusSpatialBatch.prototype.removeBatch = function (e, t) {
        const i = e.spatialMeshInstances;
        if (!i || 0 === i.length)
            return;
        const a = t.id
            , s = this._singleMeshInstances;
        for (let e = i.length - 1; e >= 0; e--) {
            const r = i[e];
            r && r._uranusSpatialLayerId === a && (s[0] = r,
                t.removeMeshInstances(s),
                i[e] = i[i.length - 1],
                i.pop())
        }
        s[0] = null
    }
    ,
    UranusSpatialBatch.prototype.setupVisibilityForLayer = function (e, t, i) {
        i.cull = this.frustumCulling;
        if (this.frustumCulling || this.instancerShadowsOnly || i._uranusShadowOnly) {
            if (this.frustumCulling) {
                const a = this.entity.script.uranusSpatialVisibility;
                a.visibilityPerLayer || (a.visibilityPerLayer = {});
                let s = a.visibilityPerLayer[t.name];
                s || (s = a.visibilityPerLayer[t.name] = [a.visibility.find((e => e.layer === t.name)), a.visibilityShadows.find((e => e.layer === t.name))]);
                const r = a ? a.cells.size : e._uranusMaxAabbSize || this.batchGroup.maxAabbSize;
                i.spatialObject = new UranusSpatialObject(e.meshInstance.aabb, s, r)
            }
            i.isVisibleFunc = e => this.isMeshInstanceVisible(e, i)
        }
    }
    ,
    UranusSpatialBatch.prototype.isMeshInstanceVisible = function (e, t) {
        if (!(0 === e.node.name.indexOf("ShadowCam"))) {
            if (this.instancerShadowsOnly)
                return !1;
            if (t._uranusShadowOnly)
                return !1
        }
        const i = t.spatialObject;
        if (!i)
            return !0;
        return i.update(e).state
    }
    ,
    pc.Batch.prototype.addToLayers = function (e, t) {
        const i = UranusSpatialBatch.addBatch[this.batchGroupId];
        for (let a = 0; a < t.length; a++) {
            const s = e.layers.getLayerById(t[a]);
            s && (i ? i(this, s) : s.addMeshInstances([this.meshInstance]))
        }
    }
    ,
    pc.Batch.prototype.removeFromLayers = function (e, t) {
        const i = UranusSpatialBatch.removeBatch[this.batchGroupId];
        for (let a = 0; a < t.length; a++) {
            const s = e.layers.getLayerById(t[a]);
            s && (i ? i(this, s) : s.removeMeshInstances([this.meshInstance]))
        }
    }
    ,
    UranusSpatialBatch.prototype.makeMeshoptKey = function (e, t, i) {
        return (e * URANUS_MESHOPT_KEY_SCALE + .5 | 0) + ":" + (t * URANUS_MESHOPT_KEY_SCALE + .5 | 0) + ":" + (i ? 1 : 0)
    }
    ,
    UranusSpatialBatch.prototype.getMeshoptSimplifier = function () {
        return ("undefined" != typeof globalThis ? globalThis : window).MeshoptSimplifier || null
    }
    ,
    UranusSpatialBatch.prototype.getOrCreateMeshoptCacheForMesh = function (e) {
        let t = this._meshoptCache.get(e);
        return t || (t = new Map,
            this._meshoptCache.set(e, t)),
            t
    }
    ,
    UranusSpatialBatch.prototype.getCachedSimplifiedMesh = function (e, t, i, a) {
        const s = this._meshoptCache.get(e);
        if (!s)
            return null;
        const r = this.makeMeshoptKey(t, i, a)
            , n = s.get(r);
        return !1 === n ? null : n || null
    }
    ,
    UranusSpatialBatch.prototype.applySimplifySettings = function (e, t, i) {
        const a = i.triangleRatio;
        if (void 0 === a || a <= 0 || a >= .999999)
            return;
        const s = void 0 === i.simplifyError ? 1 : i.simplifyError
            , r = !!i.lockBorder
            , n = this.getCachedSimplifiedMesh(t, a, s, r);
        if (n)
            return void (e.mesh = n);
        const o = this.getMeshoptSimplifier();
        if (o && o.supported) {
            const i = o.ready;
            if (i && "function" == typeof i.then && !this._meshoptReadyPromiseResolved)
                return this.queueMeshoptSimplify(e, t, a, s, r),
                    this.ensureMeshoptListeners(),
                    void this.processMeshoptPending();
            const n = this.getOrCreateSimplifiedMesh(t, a, s, r);
            n && (e.mesh = n)
        } else
            this.queueMeshoptSimplify(e, t, a, s, r),
                this.ensureMeshoptListeners()
    }
    ,
    UranusSpatialBatch.prototype.queueMeshoptSimplify = function (e, t, i, a, s) {
        this._meshoptPending || (this._meshoptPending = []),
            this._meshoptPending.push({
                meshInstance: e,
                sourceMesh: t,
                ratio: i,
                error: a,
                lockBorder: s
            })
    }
    ,
    UranusSpatialBatch.prototype.ensureMeshoptListeners = function () {
        this._meshoptListenerAttached || (this._meshoptListenerAttached = !0,
            this.app.on(URANUS_MESHOPT_MODULE_READY_EVENT, this._meshoptProcessBound))
    }
    ,
    UranusSpatialBatch.prototype.processMeshoptPending = function () {
        const e = this._meshoptPending;
        if (!e || 0 === e.length)
            return;
        const t = this.getMeshoptSimplifier();
        if (!t)
            return;
        if (!t.supported)
            return;
        const runAll = () => {
            for (let t = 0; t < e.length; t++) {
                const i = e[t]
                    , a = i && i.meshInstance;
                if (!a || !i.sourceMesh)
                    continue;
                const s = this.getOrCreateSimplifiedMesh(i.sourceMesh, i.ratio, i.error, i.lockBorder);
                s && (a.mesh = s)
            }
            e.length = 0
        }
            , i = t.ready;
        if (i && "function" == typeof i.then && !this._meshoptReadyPromiseResolved) {
            if (this._meshoptReadyPromiseAttached)
                return;
            return this._meshoptReadyPromiseAttached = !0,
                void i.then((() => {
                    this._meshoptReadyPromiseResolved = !0,
                        runAll()
                }
                ))
        }
        runAll()
    }
    ,
    UranusSpatialBatch.prototype.getOrCreateSimplifiedMesh = function (e, t, i, a) {
        const s = this.getOrCreateMeshoptCacheForMesh(e)
            , r = this.makeMeshoptKey(t, i, a)
            , n = s.get(r);
        if (n)
            return n;
        if (!1 === n)
            return null;
        const o = this.buildSimplifiedMesh(e, t, i, a);
        return o ? (s.set(r, o),
            o) : (s.set(r, !1),
                null)
    }
    ,
    UranusSpatialBatch.prototype.buildSimplifiedMesh = function (e, t, i, a) {
        const s = this.getMeshoptSimplifier();
        if (!s || !s.supported)
            return null;
        const r = e.primitive && e.primitive[0];
        if (!r || !r.indexed)
            return null;
        const n = e.vertexBuffer;
        if (!n)
            return null;
        const o = n.numVertices
            , h = r.count;
        if (!o || !h || h < 3)
            return null;
        let l = Math.floor(h * t);
        if (l -= l % 3,
            l < 3 && (l = 3),
            l >= h)
            return null;
        this._meshoptScratchPositions || (this._meshoptScratchPositions = null),
            this._meshoptScratchIndices || (this._meshoptScratchIndices = null);
        const c = n.getFormat();
        let p = null
            , u = 0;
        for (let e = 0; e < c.elements.length; e++) {
            const t = c.elements[e];
            if (t.name === pc.SEMANTIC_POSITION) {
                p = new Float32Array(n.lock(), t.offset),
                    u = t.stride / 4;
                break
            }
        }
        if (!p || !u)
            return null;
        const d = e.indexBuffer && e.indexBuffer[0];
        if (!d || !d.storage)
            return null;
        const y = r.base || 0;
        let m = null;
        const f = d.getFormat();
        m = f === pc.INDEXFORMAT_UINT8 ? new Uint8Array(d.storage, y, h) : f === pc.INDEXFORMAT_UINT16 ? new Uint16Array(d.storage, 2 * y, h) : new Uint32Array(d.storage, 4 * y, h);
        const b = 3 * o;
        let S = this._meshoptScratchPositions;
        if (!S || S.length < b) {
            const e = b + 4095 & -4096;
            S = this._meshoptScratchPositions = new Float32Array(e)
        }
        let g = this._meshoptScratchIndices;
        if (!g || g.length < h) {
            const e = h + 4095 & -4096;
            g = this._meshoptScratchIndices = new Uint32Array(e)
        }
        for (let e = 0, t = 0; e < o; e++,
            t += 3) {
            const i = e * u;
            S[t] = p[i],
                S[t + 1] = p[i + 1],
                S[t + 2] = p[i + 2]
        }
        if (m instanceof Uint32Array)
            g.set(m, 0);
        else
            for (let e = 0; e < h; e++)
                g[e] = m[e];
        const _ = a ? URANUS_MESHOPT_LOCK_BORDER_FLAGS : void 0
            , M = s.simplify(g.subarray(0, h), S.subarray(0, b), 3, l, i, _);
        let A = M && M[0];
        if (!A || A.length < 3 || A.length >= h)
            return null;
        A instanceof Uint16Array || A instanceof Uint32Array || (A = new Uint32Array(A));
        const B = n.device;
        if (!B)
            return null;
        const v = new pc.Mesh(B);
        v.vertexBuffer = n,
            v.skin = e.skin,
            v.morph = e.morph,
            v.boneAabb = e.boneAabb,
            v.aabb = e.aabb;
        const I = n.numVertices > 65535 || A instanceof Uint32Array
            , w = I ? pc.INDEXFORMAT_UINT32 : pc.INDEXFORMAT_UINT16
            , U = I ? A instanceof Uint32Array ? A : new Uint32Array(A) : A instanceof Uint16Array ? A : new Uint16Array(A);
        return v.indexBuffer[0] = new pc.IndexBuffer(B, w, U.length, pc.BUFFER_STATIC, U),
            v.primitive[0].type = r.type,
            v.primitive[0].base = 0,
            v.primitive[0].baseVertex = r.baseVertex || 0,
            v.primitive[0].count = U.length,
            v.primitive[0].indexed = !0,
            v
    }
    ;
var UranusSpatialCollider = pc.createScript("uranusSpatialCollider");
UranusSpatialCollider.attributes.add("groupByScale", {
    type: "number",
    default: .5,
    title: "Group By Scale"
}),
    UranusSpatialCollider.attributes.add("bypassCache", {
        type: "boolean",
        default: !1,
        title: "Bypass Cache"
    }),
    UranusSpatialCollider.attributes.add("refEntity", {
        type: "entity",
        title: "Reference Entity"
    }),
    UranusSpatialCollider.overrideInPlace = !1,
    UranusSpatialCollider.prototype.initialize = function () {
        UranusSpatialCollider.overrideInPlace || (UranusSpatialCollider.overrideInPlace = !0,
            this.override())
    }
    ,
    UranusSpatialCollider.prototype.postInitialize = function () {
        this.entity.collision && (this.entity.collision.enabled = !0)
    }
    ,
    UranusSpatialCollider.prototype.getMeshCacheId = function (e, t) {
        return `${e}_${t}`
    }
    ,
    UranusSpatialCollider.prototype.override = function () {
        this.app.systems.collision._createImplementation("mesh");
        const e = new pc.GraphNode
            , t = this.app.systems.collision.implementations.mesh;
        t.createAmmoMesh = function (e, t, a, i = !0, o) {
            let r = e.id;
            const s = o.script?.uranusSpatialCollider
                , n = s?.groupByScale
                , l = s?.bypassCache;
            if (l)
                r = o._guid;
            else if (n > 0) {
                const t = s.refEntity ? s.refEntity : o
                    , a = Math.floor(t.getLocalScale().x / n) * n;
                r = UranusSpatialCollider.prototype.getMeshCacheId(e.id, a)
            }
            const c = this.system;
            let d;
            if (c._triMeshCache[r])
                d = c._triMeshCache[r];
            else {
                const t = e.vertexBuffer
                    , a = t.getFormat();
                let o, s;
                for (let e = 0; e < a.elements.length; e++) {
                    const i = a.elements[e];
                    if (i.name === pc.SEMANTIC_POSITION) {
                        s = new Float32Array(t.lock(), i.offset),
                            o = i.stride / 4;
                        break
                    }
                }
                const n = [];
                e.getIndices(n);
                const l = e.primitive[0].count / 3
                    , m = new Ammo.btVector3;
                let h, u, f;
                const y = e.primitive[0].base;
                d = new Ammo.btTriangleMesh,
                    c._triMeshCache[r] = d;
                const S = new Map;
                d.getIndexedMeshArray().at(0).m_numTriangles = l;
                const addVertex = e => {
                    const t = s[e * o]
                        , a = s[e * o + 1]
                        , r = s[e * o + 2];
                    let n;
                    if (i) {
                        const e = `${t}:${a}:${r}`;
                        if (n = S.get(e),
                            void 0 !== n)
                            return n;
                        m.setValue(t, a, r),
                            n = d.findOrAddVertex(m, !1),
                            S.set(e, n)
                    } else
                        m.setValue(t, a, r),
                            n = d.findOrAddVertex(m, !1);
                    return n
                }
                    ;
                for (var p = 0; p < l; p++)
                    h = addVertex(n[y + 3 * p]),
                        u = addVertex(n[y + 3 * p + 1]),
                        f = addVertex(n[y + 3 * p + 2]),
                        d.addIndex(h),
                        d.addIndex(u),
                        d.addIndex(f);
                Ammo.destroy(m)
            }
            const m = new Ammo.btBvhTriangleMeshShape(d, !0)
                , h = c._getNodeScaling(t);
            m.setLocalScaling(h),
                Ammo.destroy(h);
            const u = c._getNodeTransform(t);
            a.addChildShape(u, m),
                Ammo.destroy(u)
        }
            .bind(t),
            t.createPhysicalShape = function (t, a, i, o, r) {
                if ("undefined" != typeof Ammo && (a.model || a.render)) {
                    const s = new Ammo.btCompoundShape;
                    if (a.model) {
                        const e = a.model.meshInstances;
                        for (let i = 0; i < e.length; i++)
                            this.createAmmoMesh(e[i].mesh, e[i].node, s, a.checkVertexDuplicates, t)
                    } else if (a.render) {
                        const i = a.render.meshes;
                        for (let o = 0; o < i.length; o++)
                            this.createAmmoMesh(i[o], e, s, a.checkVertexDuplicates, t)
                    }
                    const n = t.getWorldTransform();
                    scale = n.getScale(),
                        void 0 !== i && (scale.x = i,
                            scale.y = o,
                            scale.z = r);
                    const l = new Ammo.btVector3(scale.x, scale.y, scale.z);
                    return s.setLocalScaling(l),
                        Ammo.destroy(l),
                        s
                }
            }
                .bind(t)
    }
    ;
var UranusSpatialInstancer = pc.createScript("uranusSpatialInstancer");
UranusSpatialInstancer.attributes.add("excludeLayers", {
    type: "string",
    array: !0,
    default: ["Depth", "Skybox", "Immediate", "Outline", "UI"],
    title: "Exclude Layers",
    description: "Mesh instances rendered in these layers won't be instanced."
}),
    UranusSpatialInstancer.attributes.add("excludeShadowLayers", {
        type: "string",
        array: !0,
        default: [],
        title: "Exclude Shadow Layers",
        description: "Layers whose mesh instances will never be added to shadow caster payloads."
    }),
    UranusSpatialInstancer.attributes.add("excludeTag", {
        type: "string",
        default: "instancer-disable",
        title: "Exclude Tag",
        description: "An entity tag that can be used to exclude objects from instancing."
    }),
    UranusSpatialInstancer.attributes.add("excludeRenderTag", {
        type: "string",
        default: "instancer-render-disable",
        title: "Exclude Render Tag",
        description: "Use this tag on entities to disable rendering while keeping spatial visibility/picking/logic active (acts as a proxy object)."
    }),
    UranusSpatialInstancer.attributes.add("shadowsOnlyTag", {
        type: "string",
        default: "instancer-shadows-only",
        title: "Shadows Only Tag",
        description: "An entity tag that forces objects to render only as shadow casters (no regular pass)."
    }),
    UranusSpatialInstancer.attributes.add("materialShadowsDisable", {
        type: "string",
        default: "instancer-material-shadows-disable",
        title: "Material Shadows Disable",
        description: "Use this tag on material assets to exclude them from rendering shadows."
    }),
    UranusSpatialInstancer.attributes.add("materialCloneDisable", {
        type: "string",
        default: "instancer-material-clone-disable",
        title: "Material Clone Disable",
        description: "Use this tag on material assets to exclude them from cloning their material."
    }),
    UranusSpatialInstancer.attributes.add("frustumCulling", {
        type: "boolean",
        default: !0,
        title: "Frustum Culling"
    }),
    UranusSpatialInstancer.attributes.add("startupFullRenderFrames", {
        type: "number",
        default: 0,
        title: "Startup Full-Render Frames",
        description: "Bypass all visibility culling for N frames after activation to warm up shaders. Set 0 to disable."
    }),
    UranusSpatialInstancer.attributes.add("lodDistanceMultiplier", {
        type: "number",
        default: 1,
        title: "LOD Distance Multiplier",
        description: "Global scale factor for all visibility (min/max) distances and animation LOD distances."
    }),
    UranusSpatialInstancer.attributes.add("cloneMaterials", {
        type: "boolean",
        default: !1,
        title: "Clone Materials",
        description: "If selected all instances will use a clone of the original model material. This is useful when the original material is being used in non instanced models and otherwise it will produce render artifacts. Changing this setting requires application reload."
    }),
    UranusSpatialInstancer.attributes.add("bypassTransparent", {
        type: "boolean",
        default: !0,
        title: "Bypass Transparent",
        description: "If selected transparent mesh instances will not be instanced."
    }),
    UranusSpatialInstancer.attributes.add("controlNonInstancedShadows", {
        type: "boolean",
        default: !1,
        title: "Control Non-Instanced Shadows",
        description: "When enabled, toggles MeshInstance.castShadow for non-instanced meshes based on their Visibility Shadows distances."
    }),
    UranusSpatialInstancer.attributes.add("parseEntities", {
        type: "entity",
        array: !0,
        title: "Entities to be disabled/enabled when instancer is first activated. This helps with when visual artifacts are observed."
    }),
    UranusSpatialInstancer.attributes.add("debugSpatialUpdate", {
        type: "boolean",
        default: !1,
        title: "Debug Spatial Update",
        description: "When enabled, UranusSpatialObject.update() will log slow calls with breakdown information. Off by default to keep hot paths allocation-free."
    }),
    UranusSpatialInstancer.prototype.initialize = function () {
        UranusSpatialInstancer.api = this,
            this.worldMatX = new pc.Vec3,
            this.worldMatY = new pc.Vec3,
            this.worldMatZ = new pc.Vec3,
            this.payloads = new Map,
            this.materialCloneCache = new Map,
            this.visibilityScriptByName = new Map,
            this.payloadByRefMeshInstance = new Map,
            this._warmupFramesLeft = Math.max(0, Math.floor(this.startupFullRenderFrames || 0)),
            this._warmupActive = this._warmupFramesLeft > 0,
            this._warmupLastCountedFrame = -1,
            "undefined" != typeof UranusSpatialObject && (UranusSpatialObject.lodMultiplier = this.lodDistanceMultiplier && this.lodDistanceMultiplier > 0 ? this.lodDistanceMultiplier : 1),
            this.on("attr:lodDistanceMultiplier", (function (t, e) {
                if ("undefined" != typeof UranusSpatialObject && (UranusSpatialObject.lodMultiplier = t && t > 0 ? t : 1),
                    this.payloads)
                    for (const t of this.payloads.values())
                        t.forceUpdate = !0,
                            t.bufferDirty = !0
            }
            ), this),
            "undefined" != typeof UranusSpatialObject && (UranusSpatialObject.DEBUG_SPATIAL_UPDATE = !!this.debugSpatialUpdate),
            this.on("attr:debugSpatialUpdate", (function (t, e) {
                "undefined" != typeof UranusSpatialObject && (UranusSpatialObject.DEBUG_SPATIAL_UPDATE = !!t)
            }
            ), this),
            this.on("attr:controlNonInstancedShadows", (function (t, e) {
                if (!t && this.payloads)
                    for (const t of this.payloads.values())
                        if (t && !t.supportsInstancing)
                            for (const e of t.instances.values()) {
                                const t = e && e.meta;
                                t && t.meshInstance && void 0 !== t._origCastShadow && (t.meshInstance.castShadow = t._origCastShadow)
                            }
            }
            ), this),
            UranusSpatialInstancer.instancingFormat || (UranusSpatialInstancer.instancingFormat = pc.VertexFormat.getDefaultInstancingFormat(this.app.graphicsDevice)),
            this._onMarkDirty = t => {
                const markByMeshInstance = t => {
                    if (!t)
                        return;
                    const e = this.payloadByRefMeshInstance.get(t);
                    if (e && e.length)
                        for (let t = 0; t < e.length; t++)
                            e[t].forceUpdate = !0,
                                e[t].bufferDirty = !0;
                    else
                        for (const e of this.payloads.values())
                            e.instances && e.instances.has(t) && (e.forceUpdate = !0,
                                e.bufferDirty = !0)
                }
                    ;
                if (t)
                    if (t.mesh && t.node)
                        markByMeshInstance(t);
                    else if (t.meta && t.meta.meshInstance)
                        markByMeshInstance(t.meta.meshInstance);
                    else if (t.render && t.render.meshInstances) {
                        const e = t.render.meshInstances;
                        for (let t = 0; t < e.length; t++)
                            markByMeshInstance(e[t])
                    } else
                        t.uranusSpatialObject && t.uranusSpatialObject.meta && t.uranusSpatialObject.meta.meshInstance && markByMeshInstance(t.uranusSpatialObject.meta.meshInstance)
            }
            ,
            this.app.on("uranusSpatial:markDirty", this._onMarkDirty),
            this.on("destroy", (function () {
                this.app && this.app.off("uranusSpatial:markDirty", this._onMarkDirty),
                    this._onMarkDirty = null
            }
            ), this),
            this.indexVisibilityScripts(),
            this.prepare()
    }
    ,
    UranusSpatialInstancer.prototype.prepare = function () {
        UranusSpatialInstancer.isLayerValid = this.isLayerValid.bind(this),
            UranusSpatialInstancer.isShadowLayerExcluded = this.isShadowLayerExcluded.bind(this),
            UranusSpatialInstancer.addMeshInstance = this.addMeshInstance.bind(this),
            UranusSpatialInstancer.removeMeshInstance = this.removeMeshInstance.bind(this);
        for (const t of this.parseEntities)
            t.enabled = !1;
        this.parseLayers();
        for (const t of this.parseEntities)
            t.enabled = !0
    }
    ,
    UranusSpatialInstancer.prototype.update = function (t) {
        if ("undefined" != typeof UranusSpatialObject && (UranusSpatialObject.applyDeferredGroupToggles && UranusSpatialObject.applyDeferredGroupToggles(),
            UranusSpatialObject.applyDeferredAvatarEvents && UranusSpatialObject.applyDeferredAvatarEvents(),
            UranusSpatialObject.applyDeferredEntityVisibilityEvents && UranusSpatialObject._hasPendingEntityVisibilityEvents && UranusSpatialObject.applyDeferredEntityVisibilityEvents()),
            this._warmupActive && !((0 | this._warmupFramesLeft) <= 0))
            if (this.frustumCulling)
                this._isWarmupActive && this._isWarmupActive();
            else
                for (const t of this.payloads.values())
                    this.updatePayload(t, null)
    }
    ,
    UranusSpatialInstancer.prototype.indexVisibilityScripts = function () {
        this.visibilityScriptByName ? this.visibilityScriptByName.clear() : this.visibilityScriptByName = new Map;
        let t = [];
        if (this.entity.findScripts) {
            const e = this.entity.findScripts("uranusSpatialVisibility");
            Array.isArray(e) && (t = e)
        }
        for (let e = 0; e < t.length; e++) {
            const a = t[e]
                , n = a && a.entity;
            if (!n || n === this.entity)
                continue;
            const s = n.name;
            s && !this.visibilityScriptByName.has(s) && this.visibilityScriptByName.set(s, a)
        }
    }
    ,
    UranusSpatialInstancer.prototype.parseLayers = function () {
        const t = this.app.scene.layers.layerList
            , e = [];
        for (let a = 0; a < t.length; a++) {
            const n = t[a];
            if (!1 === this.isLayerValid(n) || e.indexOf(n.id) > -1)
                continue;
            let s;
            e.push(n.id),
                s = this.bypassTransparent ? n.meshInstances.filter((t => t.material.blendType === pc.BLEND_NONE)) : n.meshInstances.filter((t => t)),
                n.removeMeshInstances(s),
                this.overrideEngine(),
                n.addMeshInstances(s)
        }
    }
    ,
    UranusSpatialInstancer.prototype.isLayerValid = function (t) {
        return -1 === this.excludeLayers.indexOf(t.name)
    }
    ,
    UranusSpatialInstancer.prototype.isShadowLayerExcluded = function (t) {
        return this.excludeShadowLayers && -1 !== this.excludeShadowLayers.indexOf(t.name)
    }
    ,
    UranusSpatialInstancer.prototype.shouldFlipFaces = function (t) {
        const e = this.worldMatX
            , a = this.worldMatY
            , n = this.worldMatZ
            , s = t.getWorldTransform();
        return s.getX(e),
            s.getY(a),
            s.getZ(n),
            e.cross(e, a),
            !(e.dot(n) >= 0)
    }
    ,
    UranusSpatialInstancer.prototype.getPayloadId = function (t, e, a) {
        const n = this.shouldFlipFaces(t.node);
        return 4294967296 * (((65535 & e.id) << 2 | (a ? 1 : 0) << 1 | (n ? 1 : 0)) >>> 0) + (((65535 & t.mesh.id) << 16 | 65535 & t.material.id) >>> 0)
    }
    ,
    UranusSpatialInstancer.prototype.getMeshInstanceEntity = function (t) {
        if (!t.material || t.batching || !t.node || "instancer-payload" === t.node.name)
            return;
        const e = t.node;
        return !0 === e.tags.has(this.excludeTag) || e.render?.batchGroupId > -1 || e.particlesystem || e instanceof pc.GraphNode && e.parent?.element || e instanceof pc.GraphNode && e.parent?.sprite ? void 0 : e
    }
    ,
    UranusSpatialInstancer.prototype.addMeshInstance = function (t, e, a, n) {
        const s = this.getMeshInstanceEntity(t);
        if (!s)
            return !1;
        const i = !t.mesh.skin;
        let r = this.cloneMaterials;
        if (s.render) {
            const e = s.render.meshInstances.indexOf(t);
            if (e > -1) {
                const t = s.render.materialAssets[e]
                    , n = this.app.assets.get(t);
                n && (!0 === n.tags.has(this.materialShadowsDisable) && (a = !0),
                    !0 === n.tags.has(this.materialCloneDisable) && (r = !1))
            }
        }
        const l = s.tags && s.tags.has && !0 === s.tags.has(this.excludeRenderTag)
            , o = !0 === s.tags.has(this.shadowsOnlyTag)
            , c = this.isShadowLayerExcluded && this.isShadowLayerExcluded(e);
        return n || o || this.addToPayload(s, t, e, !1, r, l),
            a || c || !t.castShadow || i && (l || this.addToPayload(s, t, e, !0, r, !1)),
            !(!o || n) || (!!l || i)
    }
    ,
    UranusSpatialInstancer.prototype.removeMeshInstance = function (t, e, a, n) {
        const s = this.getMeshInstanceEntity(t);
        if (!s)
            return !1;
        const i = !t.mesh.skin
            , r = s.tags && s.tags.has && !0 === s.tags.has(this.shadowsOnlyTag)
            , l = s.tags && s.tags.has && !0 === s.tags.has(this.excludeRenderTag)
            , o = this.isShadowLayerExcluded && this.isShadowLayerExcluded(e);
        return n || r || this.removeFromPayload(t, e, !1),
            a || o || !i || l || this.removeFromPayload(t, e, !0),
            !(!r || n) || (!!l || i)
    }
    ,
    UranusSpatialInstancer.prototype.removeFromPayload = function (t, e, a) {
        const n = this.getPayloadId(t, e, a);
        let s = this.payloads.get(n);
        if (!s)
            return !1;
        if (s.refMeshInstances.size > 0) {
            if (!s.refMeshInstances.has(t))
                return !1;
            const e = s.instances.get(t);
            if (e && (UranusSpatialObject.dynamicPickables.delete(e),
                e.meta && e.meta.meshInstance && void 0 !== e.meta._origCastShadow && (e.meta.meshInstance.castShadow = e.meta._origCastShadow)),
                e.cell) {
                s.cells.get(e.cell).instances.delete(t)
            } else
                s.instancesNonCell.delete(t);
            if (s.refMeshInstances.delete(t),
                s.instances.delete(t),
                this.payloadByRefMeshInstance) {
                const e = this.payloadByRefMeshInstance.get(t);
                if (e) {
                    const a = e.indexOf(s);
                    -1 !== a && e.splice(a, 1),
                        0 === e.length && this.payloadByRefMeshInstance.delete(t)
                }
            }
            if (e && e.meta && e.meta._stateListener) {
                const t = e.meta._stateListener
                    , a = e.meta.entity;
                a && (a.off("enable", t),
                    a.off("disable", t)),
                    e.meta._stateListener = null
            }
            e.destroy()
        }
        0 === s.instances.size ? (this.clearPayload(s),
            this.payloads.delete(n)) : (this.updateVertexBuffer(s, !0),
                this.frustumCulling || this.updatePayload(s))
    }
    ,
    UranusSpatialInstancer.prototype.clearPayload = function (t) {
        t.supportsInstancing && (t.buffer.vertexBuffer.destroy(),
            t.layer.removeMeshInstances([t.meshInstance], !0))
    }
    ,
    UranusSpatialInstancer.prototype.addToPayload = function (t, e, a, n, s, i) {
        const r = this.getPayloadId(e, a, n);
        let l = this.payloads.get(r);
        l || (l = this.createPayload(r, e, a, n, s));
        let o = -1;
        if (t.name.indexOf("_LOD") > -1) {
            const e = t.name.split("_LOD");
            o = parseInt(e[1])
        }
        let c = t.script?.uranusSpatialVisibility;
        if (!c && this.visibilityScriptByName && (c = this.visibilityScriptByName.get(t.name)),
            c || (c = this.entity.script.uranusSpatialVisibility),
            c.isStatic) {
            const e = !(!t || !t.rigidbody)
                , a = t && t.tags && t.tags.has && !0 === t.tags.has("player-carried-object");
            e || a || t.uranusStaticMatrix || (t.uranusStaticMatrix = new Float32Array(t.getWorldTransform().data))
        }
        c.visibilityPerLayer || (c.visibilityPerLayer = {});
        const p = `${o}_${a.name}`;
        let u = c.visibilityPerLayer[p];
        if (u || (u = c.visibilityPerLayer[p] = [c.visibility.find((t => t.index === o && t.layer === a.name)), c.visibilityShadows.find((t => t.index === o && t.layer === a.name))],
            u[1] || (u[1] = u[0])),
            !1 === n && (t && c.occlusion && (c.occlusion.entity = t),
                t && c.picking && c.picking.enabled && (c.picking.entity = t),
                t && c.sound && t.sound?.positional && (c.sound.entity = t),
                t && c.collision && t.collision && (c.collision.entity = t),
                c.animation && c.animation.spatialAnimation)) {
            c.animation.animComponent || t && t.anim && (c.animation.animComponent = t);
            const e = c.animation.animComponent;
            e && e.anim && (e.anim.enabled = !1)
        }
        const d = t && t.tags && t.tags.has && !0 === t.tags.has("player-carried-object")
            , h = c.cells && !0 === c.cells.enabled && !d
            , f = new UranusSpatialObject(e.aabb, u, h ? c.cells.size : void 0, c.occlusion, c.picking && c.picking.enabled ? c.picking : void 0, c.sound, c.collision, c.animation && c.animation.spatialAnimation ? c.animation : void 0, c.groupEntities && c.groupEntities.spatialGroup ? c.groupEntities : void 0);
        if ((c.cells.dynamic || t.rigidbody || t.script?.uranusPlayerController) && f.pickable && UranusSpatialObject.dynamicPickables.add(f),
            n || (t.uranusSpatialObject = f),
            f.meta = {
                entity: t,
                meshInstance: e,
                payload: l,
                noRender: !!i,
                _origCastShadow: e.castShadow
            },
            f.cell) {
            const t = f.cell;
            let a = l.cells.get(t);
            a || (a = {
                buffer: void 0,
                bufferEnabledCount: 0,
                dynamic: c.cells.dynamic,
                instances: new Map,
                spatialCell: t
            },
                l.cells.set(t, a)),
                a.instances.set(e, f)
        } else
            l.instancesNonCell.set(e, f);
        if (l.instances.set(e, f),
            t && !f.meta._stateListener) {
            const _stateListener = function () {
                const t = f.meta && f.meta.payload;
                t && (t.forceUpdate = !0,
                    t.bufferDirty = !0);
                const a = UranusSpatialInstancer.api;
                if (a && a.payloads)
                    for (const t of a.payloads.values())
                        if (t.shadowCaster && t.instances && t.instances.has(e)) {
                            t.forceUpdate = !0,
                                t.bufferDirty = !0;
                            break
                        }
            };
            t.on("enable", _stateListener),
                t.on("disable", _stateListener),
                f.meta._stateListener = _stateListener
        }
        if (l.refMeshInstances.add(e),
            this.payloadByRefMeshInstance.has(e)) {
            const t = this.payloadByRefMeshInstance.get(e);
            -1 === t.indexOf(l) && t.push(l)
        } else
            this.payloadByRefMeshInstance.set(e, [l]);
        this.updateVertexBuffer(l, !0),
            this.frustumCulling || this.updatePayload(l)
    }
    ,
    UranusSpatialInstancer.prototype.createPayload = function (t, e, a, n, s) {
        const i = !e.mesh.skin
            , r = this.getPayloadMaterial(e.material, s)
            , l = new pc.MeshInstance(e.mesh, r, new pc.GraphNode("instancer-payload"));
        l.pick = !1,
            l.flipFaces = this.shouldFlipFaces(e.node),
            l.flipFacesFactor = e.node.worldTransform.scaleSign,
            l.castShadow = n,
            l.receiveShadow = e.receiveShadow,
            l.aabb.center.copy(e.aabb.center),
            l.aabb.halfExtents.copy(e.aabb.halfExtents),
            n ? a.addShadowCasters([l]) : a.addMeshInstances([l]);
        const o = {
            buffer: {
                instancesCount: 0,
                originalStorage: void 0,
                vertexBuffer: void 0
            },
            cells: new Map,
            id: t,
            instances: new Map,
            instancesNonCell: new Map,
            forceUpdate: !1,
            bufferDirty: !1,
            layer: a,
            meshInstance: l,
            modelAabb: l.aabb.clone(),
            refMeshInstances: new Set,
            shadowCaster: n,
            supportsInstancing: i
        };
        return this.setPayloadCulling(this.frustumCulling, o),
            this.payloads.set(t, o),
            o
    }
    ,
    UranusSpatialInstancer.prototype.getPayloadMaterial = function (t, e) {
        if (!e)
            return t._uranusInstancingPatched || (t.onUpdateShader = function (t) {
                return t.litOptions.useInstancing = !0,
                    t
            }
                ,
                t.update(),
                t._uranusInstancingPatched = !0),
                t;
        const a = this.materialCloneCache;
        let n = a.get(t.id);
        return n || (n = t.clone(),
            n.onUpdateShader = function (t) {
                return t.litOptions.useInstancing = !0,
                    t
            }
            ,
            n.update(),
            a.set(t.id, n)),
            n
    }
    ,
    UranusSpatialInstancer.prototype.setPayloadCulling = function (t, e) {
        e.meshInstance.cull = t,
            t && (e.meshInstance.isVisibleFunc = t => this.isMeshInstanceVisible(t, e))
    }
    ,
    UranusSpatialInstancer.prototype._isWarmupActive = function () {
        if (!this._warmupActive || (0 | this._warmupFramesLeft) <= 0)
            return !1;
        const t = pc.app ? 0 | pc.app.frame : 0;
        return !(this._warmupLastCountedFrame !== t && (this._warmupLastCountedFrame = t,
            this._warmupFramesLeft = (0 | this._warmupFramesLeft) - 1,
            this._warmupFramesLeft <= 0)) || (this._warmupActive = !1,
                this._endWarmup(),
                !1)
    }
    ,
    UranusSpatialInstancer.prototype._endWarmup = function () {
        if (this.payloads)
            for (const t of this.payloads.values())
                t.forceUpdate = !0,
                    t.bufferDirty = !0
    }
    ,
    UranusSpatialInstancer.prototype.isMeshInstanceVisible = function (t, e) {
        this.updatePayload(e, t);
        const a = e && e.buffer;
        return (a ? 0 | a.instancesCount : 0) > 0
    }
    ,
    UranusSpatialInstancer.prototype.updateCell = function (t, e, a, n) {
        const s = t.instances;
        if (n) {
            const i = s.values();
            let r = i.next().value;
            for (; r && r.meta && r.meta.entity && !1 === r.meta.entity.enabled;)
                r = i.next().value;
            if (!r)
                return 0 != (0 | t.bufferEnabledCount) && (t.bufferEnabledCount = 0,
                    e.bufferDirty = !0),
                    a;
            if (!r.update(n).state)
                return a
        }
        e.shadowCaster && (0 === a ? e.meshInstance.aabb.copy(t.spatialCell.aabb) : e.meshInstance.aabb.add(t.spatialCell.aabb));
        let i = 0
            , r = !1;
        for (const t of s.values()) {
            const e = t.meta
                , a = e && e.entity;
            if (a && !1 !== a.enabled && (!e || !e.noRender)) {
                if (!r) {
                    (a.tags && a.tags.has && !0 === a.tags.has("player-carried-object") || a.rigidbody) && (r = !0)
                }
                a.uranusSpatialData ? i += a.uranusSpatialData.length / 16 | 0 : i++
            }
        }
        if (0 === i)
            return 0 != (0 | t.bufferEnabledCount) && (t.bufferEnabledCount = 0,
                e.bufferDirty = !0),
                a;
        const l = 16 * i;
        let o = t.buffer
            , c = !o || o.length < l;
        if (c) {
            let e = o ? o.length : 0;
            for (e < 256 && (e = 256); e < l;)
                e <<= 1;
            o = new Float32Array(e),
                t.buffer = o
        }
        if (c || t.dynamic || r) {
            let t = 0;
            for (const e of s.values()) {
                const a = e.meta
                    , n = a && a.entity;
                if (!n || !1 === n.enabled)
                    continue;
                if (a && a.noRender)
                    continue;
                let s;
                if (n.uranusSpatialData)
                    s = n.uranusSpatialData;
                else {
                    s = !(n.tags && n.tags.has && !0 === n.tags.has("player-carried-object")) && !n.rigidbody && !!n.uranusStaticMatrix ? n.uranusStaticMatrix : n.getWorldTransform().data
                }
                o.set(s, t),
                    t += s.length
            }
        }
        t.bufferEnabledCount = 0 | i,
            o = t.buffer;
        const p = 16 * (0 | t.bufferEnabledCount);
        if (o && p > 0) {
            const t = e.buffer.originalStorage
                , n = a + o.length;
            if (!t || t.length < n) {
                let a = t ? t.length : 0;
                for (a < 256 && (a = 256); a < n;)
                    a <<= 1;
                const s = new Float32Array(a);
                t && t.length && s.set(t),
                    e.buffer.originalStorage = s
            }
            e.buffer.originalStorage.set(o, a),
                e.bufferDirty = !0,
                a += p
        }
        return a
    }
    ,
    UranusSpatialInstancer.prototype.updateInstance = function (t, e, a, n) {
        const s = e.supportsInstancing
            , i = t.meta
            , r = i && i.entity;
        if (!r || !1 === r.enabled)
            return !s && i && i.meshInstance && (i.meshInstance.visible = !1),
                a;
        if (n) {
            if (!t.update(n).state)
                return s || (i.meshInstance.visible = !1),
                    a
        }
        e.shadowCaster && (0 === a ? e.meshInstance.aabb.copy(i.meshInstance.aabb) : e.meshInstance.aabb.add(i.meshInstance.aabb));
        const l = !(!i || !i.noRender);
        if (s) {
            if (l)
                return a;
            const t = !(r && r.tags && r.tags.has && !0 === r.tags.has("player-carried-object")) && !r.rigidbody && !!r.uranusStaticMatrix ? r.uranusStaticMatrix : r.getWorldTransform().data;
            let n = e.buffer.originalStorage;
            const s = a + t.length;
            if (!n || n.length < s) {
                let t = n ? n.length : 0;
                for (t < 256 && (t = 256); t < s;)
                    t <<= 1;
                const a = new Float32Array(t);
                n && n.length && a.set(n),
                    e.buffer.originalStorage = a,
                    n = a
            }
            n.set(t, a),
                e.bufferDirty = !0,
                a += t.length
        } else if (i.meshInstance.visible = !l,
            this.controlNonInstancedShadows && i && i.meshInstance) {
            void 0 === i._origCastShadow && (i._origCastShadow = !!i.meshInstance.castShadow);
            const e = t.visibilityLimits && t.visibilityLimits[UranusSpatialObject.VIS_CAMERA_SHADOWDIR];
            if (e) {
                const a = UranusSpatialObject.lastMainCamera || n;
                if (a && a.node && a.node.getPosition) {
                    let n = i._origCastShadow;
                    if (e.maxDistance > 0) {
                        const s = t.cell ? t.cell.position : r ? r.getPosition() : t.position
                            , l = t.checkVisibleDistance(s, a.node.getPosition(), e.minDistance, e.maxDistance);
                        n = i._origCastShadow && l
                    }
                    i.meshInstance.castShadow !== n && (i.meshInstance.castShadow = n)
                }
            }
        }
        return a
    }
    ,
    UranusSpatialInstancer.prototype.updatePayload = function (t, e) {
        const a = !!this._isWarmupActive && this._isWarmupActive()
            , n = e && e.visIndex === UranusSpatialObject.VIS_CAMERA_SHADOWDIR;
        if (e && !n && !a) {
            let a = !1;
            if (t.forceUpdate || t.bufferDirty)
                t.forceUpdate = !1,
                    a = !0;
            else {
                for (const n of t.cells.values()) {
                    const t = n.instances.values();
                    let s = t.next().value
                        , i = !1;
                    for (; s;) {
                        const e = s.meta && s.meta.entity;
                        if (e && !1 !== e.enabled) {
                            i = !0;
                            break
                        }
                        s = t.next().value
                    }
                    if (i) {
                        s.update(e).frameSinceLastUpdate >= pc.app.frame && (a = !0)
                    } else
                        (0 | n.bufferEnabledCount) > 0 && (a = !0)
                }
                for (const n of t.instancesNonCell.values()) {
                    n.update(e).frameSinceLastUpdate >= pc.app.frame && (a = !0)
                }
                if (!a)
                    return
            }
        }
        let s = 0;
        for (const n of t.cells.values())
            s = this.updateCell(n, t, s, a ? null : e);
        for (const n of t.instancesNonCell.values())
            s = this.updateInstance(n, t, s, a ? null : e);
        const i = s / 16;
        this.updateVertexBuffer(t, !1, i)
    }
    ,
    UranusSpatialInstancer.prototype.updateVertexBuffer = function (t, e, a) {
        const n = t.buffer
            , s = t.meshInstance;
        let i;
        if (void 0 !== a)
            i = 0 | a;
        else {
            let e = 0;
            for (const a of t.instances.values()) {
                const t = a.meta;
                if (t && t.noRender)
                    continue;
                const n = t.entity;
                n.uranusSpatialData ? e += n.uranusSpatialData.length / 16 | 0 : e++
            }
            i = 0 | e
        }
        if (!e && !t.bufferDirty && i === n.instancesCount)
            return;
        if (i > 0 || !n.vertexBuffer) {
            const e = 16 * (0 | i);
            if (!n.originalStorage || n.originalStorage.length < e) {
                let t = n.originalStorage ? n.originalStorage.length : 0;
                for (t < 256 && (t = 256); t < e;)
                    t <<= 1;
                const a = new Float32Array(t);
                n.originalStorage && n.originalStorage.length && a.set(n.originalStorage),
                    n.originalStorage = a
            }
            const a = n.originalStorage.length / 16 | 0
                , r = n.vertexBuffer
                , l = r && r.getNumVertices ? r.getNumVertices() : 0;
            if (!r || l !== a) {
                r && r.destroy();
                const t = UranusSpatialInstancer.instancingFormat
                    , e = new pc.VertexBuffer(this.app.graphicsDevice, t, a, {
                        data: n.originalStorage,
                        usage: pc.BUFFER_DYNAMIC
                    });
                s.setInstancing(e, !0),
                    n.vertexBuffer = e
            } else
                t.bufferDirty && r.setData(n.originalStorage)
        }
        n.instancesCount = 0 | i,
            s.instancingCount = 0 | i,
            t.bufferDirty = !1,
            e && (t.forceUpdate = !0)
    }
    ,
    UranusSpatialInstancer.prototype.forEachEntityInstances = function (t, e) {
        const a = this;
        if (!(a && t && t.render && t.render.meshInstances))
            return;
        const n = t.render.meshInstances;
        for (let t = 0, s = n.length; t < s; t++) {
            const s = n[t]
                , i = a.payloadByRefMeshInstance.get(s);
            if (i && 0 !== i.length)
                for (let t = 0, a = i.length; t < a; t++) {
                    const a = i[t]
                        , n = a && a.instances ? a.instances.get(s) : null;
                    n && e(a, n, s)
                }
        }
    }
    ,
    UranusSpatialInstancer.prototype.detachFromCellsForEntity = function (t, e) {
        const a = this;
        if (!a || !t)
            return;
        const n = e && e.source || "generic"
            , s = e && !1 !== e.registerDynamicPickable;
        this.forEachEntityInstances(t, (function (t, e, a) {
            const i = e && e.cell;
            if (i) {
                const n = t.cells.get(i);
                if (n && (n.instances.delete(a),
                    0 === n.instances.size && t.cells.delete(i)),
                    e.pickable && i.pickables) {
                    const t = i.pickables.indexOf(e);
                    -1 !== t && i.pickables.splice(t, 1)
                }
                t.instancesNonCell.set(a, e),
                    e.cell = void 0,
                    e.visible && "function" == typeof e.visible.clear && e.visible.clear()
            }
            s && "undefined" != typeof UranusSpatialObject && e.pickable && (UranusSpatialObject.dynamicPickables.has(e) || UranusSpatialObject.dynamicPickables.add(e),
                "carry" === n ? e._uranusCarryTempDynamicPickable = !0 : "ume" === n ? e._umeTempDynamicPickable = !0 : e._tempDynamicPickable = !0),
                t.forceUpdate = !0,
                t.bufferDirty = !0
        }
        )),
            a.app && a.app.fire("uranusSpatial:markDirty", t),
            "undefined" != typeof UranusSpatialObject && (UranusSpatialObject.pickGridDirty = !0)
    }
    ,
    UranusSpatialInstancer.prototype.attachToCellsForEntity = function (t, e) {
        const a = this;
        if (!a || !t)
            return;
        const n = t.script && t.script.uranusSpatialVisibility || null
            , s = e && e.source || "generic";
        if (!n || !n.cells || !n.cells.enabled)
            return this.forEachEntityInstances(t, (function (t, e) {
                "undefined" != typeof UranusSpatialObject && ("carry" === s && e._uranusCarryTempDynamicPickable ? (UranusSpatialObject.dynamicPickables.delete(e),
                    e._uranusCarryTempDynamicPickable = !1) : "ume" === s && e._umeTempDynamicPickable ? (UranusSpatialObject.dynamicPickables.delete(e),
                        e._umeTempDynamicPickable = !1) : "generic" === s && (e._uranusCarryTempDynamicPickable || e._umeTempDynamicPickable || e._tempDynamicPickable) && (UranusSpatialObject.dynamicPickables.delete(e),
                            e._uranusCarryTempDynamicPickable = !1,
                            e._umeTempDynamicPickable = !1,
                            e._tempDynamicPickable = !1)),
                    t.forceUpdate = !0,
                    t.bufferDirty = !0
            }
            )),
                a.app && a.app.fire("uranusSpatial:markDirty", t),
                void ("undefined" != typeof UranusSpatialObject && (UranusSpatialObject.pickGridDirty = !0));
        const i = 0 | Math.floor(n.cells.size);
        if (i <= 0)
            return;
        const r = t.getPosition();
        this.forEachEntityInstances(t, (function (t, e, a) {
            if (e.cell)
                return;
            const l = e.getObjectCell(i, r);
            e.pickable && l.pickables && l.pickables.push(e),
                t.instancesNonCell.delete(a);
            let o = t.cells.get(l);
            o || (o = {
                buffer: void 0,
                bufferEnabledCount: 0,
                dynamic: !!n.cells.dynamic,
                instances: new Map,
                spatialCell: l
            },
                t.cells.set(l, o)),
                o.instances.set(a, e),
                e.cell = l,
                e._lastCellGuid = l.guid,
                e._px = r.x,
                e._py = r.y,
                e._pz = r.z,
                "undefined" != typeof UranusSpatialObject && ("carry" === s && e._uranusCarryTempDynamicPickable ? (UranusSpatialObject.dynamicPickables.delete(e),
                    e._uranusCarryTempDynamicPickable = !1) : "ume" === s && e._umeTempDynamicPickable ? (UranusSpatialObject.dynamicPickables.delete(e),
                        e._umeTempDynamicPickable = !1) : "generic" === s && (e._uranusCarryTempDynamicPickable || e._umeTempDynamicPickable || e._tempDynamicPickable) && (UranusSpatialObject.dynamicPickables.delete(e),
                            e._uranusCarryTempDynamicPickable = !1,
                            e._umeTempDynamicPickable = !1,
                            e._tempDynamicPickable = !1)),
                t.forceUpdate = !0,
                t.bufferDirty = !0
        }
        )),
            a.app && a.app.fire("uranusSpatial:markDirty", t),
            "undefined" != typeof UranusSpatialObject && (UranusSpatialObject.pickGridDirty = !0)
    }
    ,
    UranusSpatialInstancer.detachFromCellsForEntity = function (t, e) {
        const a = UranusSpatialInstancer.api;
        a && "function" == typeof a.detachFromCellsForEntity && a.detachFromCellsForEntity(t, e)
    }
    ,
    UranusSpatialInstancer.attachToCellsForEntity = function (t, e) {
        const a = UranusSpatialInstancer.api;
        a && "function" == typeof a.attachToCellsForEntity && a.attachToCellsForEntity(t, e)
    }
    ,
    UranusSpatialInstancer.prototype.overrideEngine = function () {
        if (UranusSpatialInstancer.override)
            return;
        UranusSpatialInstancer.override = !0;
        const t = new Set
            , addMeshInstancesFunc = function (e, a) {
                const n = this.meshInstances
                    , s = this.meshInstancesSet;
                for (let a = 0; a < e.length; a++) {
                    const i = e[a];
                    s.has(i) || (n.push(i),
                        s.add(i),
                        i.material && t.add(i.material))
                }
                if (a || this.addShadowCasters(e),
                    t.size > 0) {
                    const e = this._shaderVersion;
                    t.forEach((t => {
                        e >= 0 && t._shaderVersion !== e && (t.getShaderVariant !== pc.Material.prototype.getShaderVariant && t.clearVariants(),
                            t._shaderVersion = e)
                    }
                    )),
                        t.clear()
                }
            }
            , e = pc.Layer.prototype.removeMeshInstances
            , a = pc.Layer.prototype.addShadowCasters
            , n = pc.Layer.prototype.removeShadowCasters
            , execute = function (t, e, a, n, s, i) {
                let r;
                for (let i = 0; i < t.length; i++) {
                    const l = t[i];
                    n(l, s, a, e) || (r || (r = []),
                        r.push(l))
                }
                r && (arguments[0] = r,
                    i.apply(s, arguments))
            };
        if (pc.Layer.prototype.addMeshInstances = function (t, e) {
            !0 === UranusSpatialInstancer.isLayerValid(this) ? execute(t, !1, e, UranusSpatialInstancer.addMeshInstance, this, addMeshInstancesFunc) : addMeshInstancesFunc.apply(this, arguments)
        }
            ,
            pc.Layer.prototype.removeMeshInstances = function (t, a) {
                !0 === UranusSpatialInstancer.isLayerValid(this) ? execute(t, !1, a, UranusSpatialInstancer.removeMeshInstance, this, e) : e.apply(this, arguments)
            }
            ,
            pc.Layer.prototype.addShadowCasters = function (t) {
                !0 === UranusSpatialInstancer.isLayerValid(this) ? UranusSpatialInstancer.isShadowLayerExcluded && UranusSpatialInstancer.isShadowLayerExcluded(this) || execute(t, !0, !1, UranusSpatialInstancer.addMeshInstance, this, a) : a.apply(this, arguments)
            }
            ,
            pc.Layer.prototype.removeShadowCasters = function (t) {
                !0 === UranusSpatialInstancer.isLayerValid(this) ? execute(t, !0, !1, UranusSpatialInstancer.removeMeshInstance, this, n) : n.apply(this, arguments)
            }
            ,
            !UranusSpatialInstancer._animOverride) {
            UranusSpatialInstancer._animOverride = !0;
            const t = this.app || pc.app
                , e = t && t.systems && t.systems.anim;
            e && e.onAnimationUpdate && (t.systems.off("animationUpdate", e.onAnimationUpdate, e),
                e.onAnimationUpdate = function (t) {
                    const e = this.store;
                    for (const a in e) {
                        if (!e.hasOwnProperty(a))
                            continue;
                        const n = e[a].entity.anim;
                        if (n.data.enabled && n.entity.enabled && n.playing)
                            if (void 0 !== n.uranusAnimTimer) {
                                n.uranusAnimTimer += t,
                                    n.uranusAnimFrame = (n.uranusAnimFrame || 0) + 1;
                                const e = n.uranusAnimFps;
                                if (e === 1 / 0)
                                    continue;
                                if ((0 | e) > 0 && n.uranusAnimFrame < e)
                                    continue;
                                n.update(n.uranusAnimTimer),
                                    n.uranusAnimTimer = 0,
                                    n.uranusAnimFrame = 0
                            } else
                                n.update(t)
                    }
                }
                    .bind(e),
                t.systems.on("animationUpdate", e.onAnimationUpdate, e))
        }
    }
    ;
class UranusSpatialObject {
    static lodMultiplier = 1;
    constructor(t, e, i, a, s, n, r, l, c) {
        if (this.aabb = t,
            this.position = t.center,
            this.visibilityLimits = e,
            this.visible = new Map,
            this.occlusion = a,
            this.sound = n,
            this.collision = r,
            this.animation = l,
            this.radius = t.halfExtents.length(),
            (i = Math.floor(i)) > 0 && (this.cell = this.getObjectCell(i, this.position)),
            this._lastCellGuid = this.cell ? this.cell.guid : 0n,
            this._px = this.position.x,
            this._py = this.position.y,
            this._pz = this.position.z,
            this.pickable = void 0 !== s,
            this.pickable && (this.picking = s,
                this.cell && this.cell.pickables.push(this),
                s.entity)) {
            const t = s.entity;
            UranusSpatialObject.pickables.has(t) || UranusSpatialObject.pickables.set(t, []),
                UranusSpatialObject.pickables.get(t).push(this),
                UranusSpatialObject.pickGridDirty = !0
        }
        if (a?.occluder && !1 === UranusSpatialObject.occluders.has(a.entity)) {
            const t = a.entity.uranusSpatialData
                , e = [];
            if (t)
                for (let i = 0; i < t.length; i += 16) {
                    const s = new pc.BoundingBox;
                    s.center.x = t[i + 12],
                        s.center.y = t[i + 13] + this.aabb.halfExtents.y,
                        s.center.z = t[i + 14],
                        s.halfExtents.copy(this.aabb.halfExtents),
                        s.halfExtents.x *= a.occluderScale.x,
                        s.halfExtents.y *= a.occluderScale.y,
                        s.halfExtents.z *= a.occluderScale.z;
                    const n = new pc.BoundingSphere;
                    n.center.copy(s.center),
                        n.radius = s.halfExtents.length(),
                        e.push({
                            aabb: s,
                            sphere: n
                        })
                }
            else {
                const t = new pc.BoundingBox;
                t.center.copy(this.aabb.center),
                    t.halfExtents.copy(this.aabb.halfExtents),
                    t.halfExtents.x *= a.occluderScale.x,
                    t.halfExtents.y *= a.occluderScale.y,
                    t.halfExtents.z *= a.occluderScale.z;
                const i = new pc.BoundingSphere;
                i.center.copy(t.center),
                    i.radius = t.halfExtents.length(),
                    e.push({
                        aabb: t,
                        sphere: i
                    })
            }
            UranusSpatialObject.occluders.set(a.entity, e),
                UranusSpatialObject.occluderGridInitialized = !1
        }
        if (this.sound?.entity?.sound && window.UranusSpatialAudio && UranusSpatialAudio.register(this),
            r && r.spatialTrigger && r.entity && !r.entity.rigidbody) {
            this.triggerEntity = r.entity;
            const t = this.triggerEntity.collision || null;
            this._hasTrigger = !!t,
                this._triggerPrevEnabled = !!t && !!t.enabled,
                this._triggerUpdateFrame = -1
        } else
            this.triggerEntity = null,
                this._hasTrigger = !1,
                this._triggerPrevEnabled = !1,
                this._triggerUpdateFrame = -1;
        if (this.animation?.spatialAnimation) {
            const t = this.animation.animComponent;
            this._eventTarget = t || null;
            const e = t && t.anim ? t.anim : null;
            e && (this.anim = e,
                this._animPrevEnabled = this.anim.enabled,
                !1 !== this.anim.enabled && (this.anim.enabled = !1),
                this._animPrevEnabled = this.anim.enabled,
                this._animUpdateFrame = -1,
                void 0 === this.anim.uranusAnimTimer && (this.anim.uranusAnimTimer = 0),
                void 0 === this.anim.uranusAnimFrame && (this.anim.uranusAnimFrame = 0),
                void 0 === this.anim.uranusAnimFps && (this.anim.uranusAnimFps = 0))
        }
        if (this.group = c,
            this._hasGroup = !!(c && c.spatialGroup && Array.isArray(c.entities) && c.entities.length > 0),
            this._hasGroup) {
            const t = [];
            for (let e = 0, i = c.entities, a = i.length; e < a; e++) {
                const a = i[e];
                a && void 0 !== a && t.push(a)
            }
            this._groupEntities = t,
                this._groupPrevEnabled = !0;
            for (let e = 0, i = t.length; e < i; e++) {
                const i = t[e];
                !1 !== i.enabled && (i.enabled = !1)
            }
            this._groupPrevEnabled = !1,
                this._groupUpdateFrame = -1
        }
        this._evtAvatarLastLod = -999,
            this._evtAvatarLastVisible = void 0,
            this._evtAvatarPendingTypes = 0,
            this._evtEntityLastVisible = void 0,
            this._evtEntityLastAway = void 0
    }
    destroy() {
        if (UranusSpatialObject.dynamicPickables.delete(this),
            this.sound?.entity?.sound && window.UranusSpatialAudio && UranusSpatialAudio.unregister(this),
            this.occlusion?.occluder && this.occlusion.entity && UranusSpatialObject.occluders.has(this.occlusion.entity) && (UranusSpatialObject.occluders.delete(this.occlusion.entity),
                UranusSpatialObject.occluderGridInitialized = !1),
            this.pickable && this.picking?.entity) {
            const t = this.picking.entity;
            if (UranusSpatialObject.pickables.has(t)) {
                const e = UranusSpatialObject.pickables.get(t)
                    , i = e.indexOf(this);
                i > -1 && e.splice(i, 1),
                    0 === e.length && UranusSpatialObject.pickables.delete(t),
                    UranusSpatialObject.pickGridDirty = !0
            }
        }
        if (this.cell && this.pickable) {
            const t = this.cell.pickables.indexOf(this);
            -1 !== t && this.cell.pickables.splice(t, 1)
        }
        this.visible.clear()
    }
    isVisible(t) {
        return !!t && (this.cell ? this.cell.isVisible(t, this.visibilityLimits[t.visIndex]) : this.visible.get(t)?.state)
    }
    static isSelectable(t) {
        const e = t.meta?.entity;
        return !(!t.pickable || !e || !1 === e.enabled || e.uranusSpatialData)
    }
    getObjectCell(t, e) {
        const i = UranusSpatialCell.computeGuid(t, e);
        let a = UranusSpatialObject.cells.get(i);
        return a || (a = new UranusSpatialCell(i, t, e),
            UranusSpatialObject.cells.set(i, a)),
            a
    }
    static distanceSq(t, e) {
        const i = t.x - e.x
            , a = t.y - e.y
            , s = t.z - e.z;
        return i * i + a * a + s * s
    }
    checkVisibleDistance(t, e, i, a) {
        const s = UranusSpatialObject.distanceSq(t, e)
            , n = UranusSpatialObject.lodMultiplier
            , r = i * n
            , l = a * n;
        return s >= r * r && s <= l * l
    }
    static _getGridCellCoords(t, e, i) {
        return i.x = Math.floor(t.x / e),
            i.y = Math.floor(t.y / e),
            i.z = Math.floor(t.z / e),
            i
    }
    static _getGridCellGuid(t, e) {
        const i = BigInt(t.x + 32768)
            , a = BigInt(t.y + 32768)
            , s = BigInt(t.z + 32768);
        return BigInt(e) << 48n | i << 32n | a << 16n | s
    }
    _syncTrigger(t, e) {
        if (!this._hasTrigger || this._triggerUpdateFrame === e)
            return;
        const i = this.triggerEntity;
        if (!i || i.rigidbody)
            return this._hasTrigger = !1,
                void (this._triggerUpdateFrame = e);
        const a = i.collision;
        if (!a)
            return this._hasTrigger = !1,
                void (this._triggerUpdateFrame = e);
        const s = !t;
        s !== this._triggerPrevEnabled && (a.enabled !== s && (a.enabled = s),
            this._triggerPrevEnabled = s),
            this._triggerUpdateFrame = e
    }
    hasValidTrigger() {
        const t = this.triggerEntity;
        return !(!this._hasTrigger || !t || t.rigidbody || !t.collision)
    }
    _syncAnim(t, e) {
        let i = this.anim;
        if (!i || !i.entity || i.entity.anim !== i) {
            const t = this.animation && this.animation.animComponent ? this.animation.animComponent : this.meta && this.meta.entity ? this.meta.entity : null
                , a = t && t.anim ? t.anim : null;
            if (!a)
                return void (this._animUpdateFrame = e);
            this.anim = i = a,
                void 0 === i.uranusAnimTimer && (i.uranusAnimTimer = 0),
                void 0 === i.uranusAnimFrame && (i.uranusAnimFrame = 0),
                void 0 === i.uranusAnimFps && (i.uranusAnimFps = 0)
        }
        if (this._animUpdateFrame === e)
            return;
        const a = !t;
        this._animUpdateFrame < 0 || i.enabled !== a ? (i.enabled !== a && (i.enabled = a),
            this._animPrevEnabled = a) : this._animPrevEnabled = i.enabled;
        const s = this.animation;
        if (s)
            if (void 0 === i.uranusAnimTimer && (i.uranusAnimTimer = 0),
                void 0 === i.uranusAnimFrame && (i.uranusAnimFrame = 0),
                t)
                i.uranusAnimFps = 1 / 0,
                    i.entity && (i.entity.uranusAvatarLod = 3),
                    this._emitAvatarLodIfChanged(3);
            else {
                const t = UranusSpatialObject.lastMainCamera
                    , e = s.animLodTimes
                    , a = s.animLodDistances;
                if (t && e) {
                    const s = t.node.getPosition()
                        , n = this.cell ? this.cell.position : this.meta?.entity ? this.meta.entity.getPosition() : this.position
                        , r = n.x - s.x
                        , l = n.y - s.y
                        , c = n.z - s.z
                        , o = r * r + l * l + c * c;
                    let u = 0
                        , p = 0
                        , d = 0
                        , b = 1e12;
                    if (a) {
                        const t = UranusSpatialObject.lodMultiplier > 0 ? UranusSpatialObject.lodMultiplier : 1;
                        let e = a.x > 0 ? a.x * t : 0
                            , i = a.y > 0 ? a.y * t : e
                            , s = a.z > 0 ? a.z * t : i
                            , n = a.w > 0 ? a.w * t : s > 0 ? s : 1e6;
                        u = e * e,
                            p = i * i,
                            d = s * s,
                            b = n * n
                    }
                    let h = e.x;
                    o > u && (h = e.y),
                        o > p && (h = e.z),
                        o > d && (h = e.w),
                        i.uranusAnimFps = h;
                    let m = 0;
                    m = h === e.x ? 0 : h === e.y ? 1 : h === e.z ? 2 : 3,
                        i.entity && (i.entity.uranusAvatarLod = m),
                        this._emitAvatarLodIfChanged(m)
                }
            }
        this._animUpdateFrame = e
    }
    setAnimComponent(t) {
        const e = pc.app ? pc.app.frame : 0;
        let i = null
            , a = null;
        if (!t)
            return this.anim && !1 !== this.anim.enabled && (this.anim.enabled = !1),
                this.anim = null,
                this.animation && (this.animation.animComponent = null),
                this._animUpdateFrame = -1,
                this._eventTarget = null,
                this._evtAvatarLastLod = -999,
                this._evtAvatarLastVisible = void 0,
                !1;
        if (t.anim && t.anim.update ? (a = t,
            i = t.anim) : t.update && void 0 !== t.playing && (i = t,
                a = t.entity || null),
            !i)
            return !1;
        if (this.anim === i)
            return this.animation && (this.animation.animComponent = a || i.entity || null),
                !0;
        this.anim && !1 !== this.anim.enabled && (this.anim.enabled = !1),
            this.animation || (this.animation = {
                spatialAnimation: !0
            }),
            this.animation.animComponent = a || i.entity || null,
            this.anim = i,
            void 0 === this.anim.uranusAnimTimer && (this.anim.uranusAnimTimer = 0),
            void 0 === this.anim.uranusAnimFrame && (this.anim.uranusAnimFrame = 0),
            void 0 === this.anim.uranusAnimFps && (this.anim.uranusAnimFps = 0),
            this._eventTarget = a || i.entity || null,
            this._evtAvatarLastLod = -999,
            this._evtAvatarLastVisible = void 0,
            this._animPrevEnabled = this.anim.enabled,
            !1 !== this.anim.enabled && (this.anim.enabled = !1),
            this._animPrevEnabled = this.anim.enabled,
            this._animUpdateFrame = -1;
        let s = !0;
        const n = this.meta && this.meta.entity;
        n && "boolean" == typeof n.uranusSpatialAway ? s = !!n.uranusSpatialAway : n && "boolean" == typeof n.uranusSpatialVisible && (s = !n.uranusSpatialVisible),
            this._syncAnim(s, e);
        const r = this.anim ? this.anim.entity : null;
        if (r) {
            const t = n && "boolean" == typeof n.uranusSpatialVisible ? n.uranusSpatialVisible : void 0
                , e = "boolean" == typeof t ? t : !s;
            r.uranusAvatarVisible = e,
                this._eventTarget && (this._eventTarget.uranusAvatarVisible = e)
        }
        return !0
    }
    _emitAvatarLodIfChanged(t) {
        if (!this._eventTarget)
            return;
        const e = 0 | t;
        e !== this._evtAvatarLastLod && (this._evtAvatarLastLod = e,
            this._evtAvatarPendingTypes |= 1,
            UranusSpatialObject._pendingAvatarEvents.add(this))
    }
    _emitAvatarVisibleIfChanged(t) {
        if (!this._eventTarget)
            return;
        const e = !!t;
        e !== this._evtAvatarLastVisible && (this._evtAvatarLastVisible = e,
            this._evtAvatarPendingTypes |= 2,
            UranusSpatialObject._pendingAvatarEvents.add(this))
    }
    _emitEntityVisibilityEventsIfOpted(t, e, i) {
        if (!t || !t.script)
            return;
        const a = t.script.uranusSpatialVisibility;
        if (!a || !a.emitVisibilityEvents)
            return;
        const s = !!e
            , n = !!i;
        s !== this._evtEntityLastVisible && (this._evtEntityLastVisible = s,
            UranusSpatialObject._queueEntityVisibilityEvent(t, "visible", s)),
            n !== this._evtEntityLastAway && (this._evtEntityLastAway = n,
                UranusSpatialObject._queueEntityVisibilityEvent(t, "away", n))
    }
    _syncGroup(t, e) {
        if (!this._hasGroup)
            return;
        if (this._groupUpdateFrame === e)
            return;
        const i = !t;
        if (this._groupUpdateFrame < 0 || i !== this._groupPrevEnabled) {
            const t = this._groupEntities;
            if (t) {
                const e = UranusSpatialObject._groupEntitiesPending;
                for (let a = 0, s = t.length; a < s; a++) {
                    const s = t[a];
                    s && (s._uranusSpatialGroupDesiredEnabled = i,
                        s._uranusSpatialGroupDirty = !0,
                        e.add(s))
                }
            }
            this._groupPrevEnabled = i
        }
        this._groupUpdateFrame = e
    }
    static ensureOccluderGridUpdated() {
        if (UranusSpatialObject.occluderGridInitialized)
            return;
        UranusSpatialObject.occluderGrid.clear();
        const t = UranusSpatialObject.OCCLUDER_GRID_CELL_SIZE
            , e = UranusSpatialObject._tempCellCoords1
            , i = UranusSpatialObject._tempCellCoords2
            , a = {
                x: 0,
                y: 0,
                z: 0
            };
        for (const [s, n] of UranusSpatialObject.occluders)
            for (const r of n) {
                const n = r.aabb
                    , l = n.getMin()
                    , c = n.getMax();
                UranusSpatialObject._getGridCellCoords(l, t, e),
                    UranusSpatialObject._getGridCellCoords(c, t, i);
                const o = {
                    aabb: r.aabb,
                    sphere: r.sphere,
                    entity: s
                };
                for (let s = e.x; s <= i.x; s++)
                    for (let n = e.y; n <= i.y; n++)
                        for (let r = e.z; r <= i.z; r++) {
                            a.x = s,
                                a.y = n,
                                a.z = r;
                            const e = UranusSpatialObject._getGridCellGuid(a, t);
                            UranusSpatialObject.occluderGrid.has(e) || UranusSpatialObject.occluderGrid.set(e, []),
                                UranusSpatialObject.occluderGrid.get(e).push(o)
                        }
            }
        UranusSpatialObject.occluderGridInitialized = !0
    }
    static _collectOccludersAlongRay = function (t, e, i, a, s) {
        const n = e.x > 0 ? 1 : e.x < 0 ? -1 : 0
            , r = e.y > 0 ? 1 : e.y < 0 ? -1 : 0
            , l = e.z > 0 ? 1 : e.z < 0 ? -1 : 0
            , c = UranusSpatialObject._getGridCellCoords(t, a, UranusSpatialObject._tempCellCoords1);
        let o, u, p, d, b, h;
        const m = 0 !== n ? 1 / e.x : 1 / 0
            , y = 0 !== r ? 1 / e.y : 1 / 0
            , S = 0 !== l ? 1 / e.z : 1 / 0;
        if (0 !== n) {
            o = ((c.x + (n > 0 ? 1 : 0)) * a - t.x) * m,
                d = Math.abs(a * m)
        } else
            o = 1 / 0,
                d = 1 / 0;
        if (0 !== r) {
            u = ((c.y + (r > 0 ? 1 : 0)) * a - t.y) * y,
                b = Math.abs(a * y)
        } else
            u = 1 / 0,
                b = 1 / 0;
        if (0 !== l) {
            p = ((c.z + (l > 0 ? 1 : 0)) * a - t.z) * S,
                h = Math.abs(a * S)
        } else
            p = 1 / 0,
                h = 1 / 0;
        let _ = 0;
        for (; _ <= i;) {
            const t = UranusSpatialObject._getGridCellGuid(c, a)
                , e = UranusSpatialObject.occluderGrid.get(t);
            if (e)
                for (let t = 0; t < e.length; ++t)
                    s.add(e[t]);
            if (Math.min(o, u, p) > i)
                break;
            o <= u && o <= p ? (c.x += n,
                _ = o,
                o += d) : u <= p ? (c.y += r,
                    _ = u,
                    u += b) : (c.z += l,
                        _ = p,
                        p += h)
        }
    }
        ;
    _checkAabbOcclusion(t, e, i) {
        UranusSpatialObject.ensureOccluderGridUpdated();
        const a = t.node.getPosition()
            , s = e.center
            , n = e.halfExtents
            , r = 1e-4
            , l = UranusSpatialObject._tempVec3_1
            , c = UranusSpatialObject._tempVec3_2
            , o = UranusSpatialObject._tempVec3_4
            , u = UranusSpatialObject._tempRay
            , p = UranusSpatialObject._collectedOccludersForRay
            , d = UranusSpatialObject.OCCLUDER_GRID_CELL_SIZE;
        UranusSpatialObject._tempQueryCoords;
        for (let t = 0; t < 8; t++) {
            l.set(s.x + (1 & t ? n.x : -n.x), s.y + (2 & t ? n.y : -n.y), s.z + (4 & t ? n.z : -n.z)),
                u.origin.copy(a),
                o.sub2(l, a);
            const e = o.length();
            if (e < r)
                continue;
            const b = Math.max(0, e - r)
                , h = b * b;
            o.mulScalar(1 / e),
                u.direction.copy(o),
                p.clear(),
                UranusSpatialObject._collectOccludersAlongRay(a, u.direction, e, d, p);
            let m = !1;
            for (const t of p) {
                if (i && t.entity === i)
                    continue;
                const e = t.aabb;
                if (t.sphere.intersectsRay(u) && e.intersectsRay(u, c)) {
                    if (UranusSpatialObject._tempVec3_3.sub2(a, c).lengthSq() < h) {
                        m = !0;
                        break
                    }
                }
            }
            if (!m)
                return !1
        }
        return !0
    }
    checkOcclusion(t) {
        return this._checkAabbOcclusion(t, this.aabb, this.meta?.entity)
    }
    getVisibleCache(t) {
        let e = this.visible.get(t);
        return e || (e = {
            camera: t,
            frameSinceLastUpdate: -1 / 0,
            state: !1,
            stateAway: !0
        },
            this.visible.set(t, e)),
            e
    }
    update(t) {
        const e = pc.app.frame
            , i = !0 === UranusSpatialObject.DEBUG_SPATIAL_UPDATE;
        let a = 0
            , s = 0
            , n = 0;
        i && (a = pc.now());
        const r = this.getVisibleCache(t, UranusSpatialObject.visibilityLimitsDummy);
        if (r.frameSinceLastUpdate === e) {
            const i = this.meta?.entity;
            if (i && t.visIndex === UranusSpatialObject.VIS_CAMERA_FORWARD && (i.uranusSpatialVisible = r.state,
                i.uranusSpatialAway = r.stateAway,
                this._hasTrigger && this._syncTrigger(r.stateAway, e),
                this.anim && this._syncAnim(r.stateAway, e),
                this._hasGroup && this._syncGroup(r.stateAway, e)),
                this.anim && t.visIndex === UranusSpatialObject.VIS_CAMERA_FORWARD) {
                const t = this.anim.entity;
                t && (t.uranusAvatarVisible = r.state)
            }
            return r
        }
        const l = void 0 !== this.cell
            , c = l ? this.cell : this;
        let o = t.visIndex;
        if (void 0 === o) {
            const e = 0 === t.node.name.indexOf("ShadowCam");
            o = t.visIndex = e ? UranusSpatialObject.VIS_CAMERA_SHADOWDIR : UranusSpatialObject.VIS_CAMERA_FORWARD
        }
        const u = o !== UranusSpatialObject.VIS_CAMERA_FORWARD
            , p = this.meta?.entity
            , d = !u && p
            , b = this.visibilityLimits[o]
            , h = c.getVisibleCache(t, b)
            , m = d && p && p.script && p.script.uranusSpatialVisibility && p.script.uranusSpatialVisibility.emitVisibilityEvents;
        if (p && !1 === p.enabled) {
            if (h.state = !1,
                h.stateAway = !0,
                d && (p.uranusSpatialVisible = !1,
                    p.uranusSpatialAway = !0),
                !u && this._hasTrigger && this._syncTrigger(!0, e),
                this.anim && !u && this._syncAnim(!0, e),
                this._hasGroup && !u && this._syncGroup(!0, e),
                h.frameSinceLastUpdate = e,
                r.frameSinceLastUpdate = e,
                r.state = h.state,
                r.stateAway = h.stateAway,
                this.anim && !u) {
                const t = this.anim.entity;
                t && (t.uranusAvatarVisible = !1)
            }
            return m && this._emitEntityVisibilityEventsIfOpted(p, !1, !0),
                h
        }
        if (e - h.frameSinceLastUpdate < b.updateFrequency) {
            if (d && (p.uranusSpatialVisible = h.state,
                p.uranusSpatialAway = h.stateAway),
                this.anim && !u) {
                const t = this.anim.entity;
                t && (t.uranusAvatarVisible = h.state)
            }
            return h
        }
        h.frameSinceLastUpdate = e,
            o === UranusSpatialObject.VIS_CAMERA_FORWARD && (UranusSpatialObject.lastMainCamera = t);
        let y = p ? p.parent : null
            , S = !1
            , _ = 0;
        for (i && y && (_ = pc.now()); y;) {
            if (y._uranusVisFrame === e) {
                S = y._uranusVisHidden;
                break
            }
            if ("function" == typeof y.isParentVisible && !1 === y.isParentVisible(void 0, p)) {
                S = !0;
                break
            }
            if (!1 === y.uranusSpatialVisible) {
                S = !0;
                break
            }
            y = y.parent
        }
        if (i && 0 !== _ && (s = pc.now() - _),
            p) {
            const t = !S;
            if (h.state = t,
                h.stateAway = r.stateAway,
                p._uranusVisFrame = e,
                p._uranusVisHidden = !t,
                !t) {
                if (!u) {
                    p.uranusSpatialVisible = h.state,
                        p.uranusSpatialAway = h.stateAway,
                        this._hasTrigger && this._syncTrigger(r.stateAway, e),
                        this.anim && this._syncAnim(!0, e),
                        this._hasGroup && this._syncGroup(!0, e);
                    const t = this.anim ? this.anim.entity : null;
                    t && (t.uranusAvatarVisible = h.state),
                        m && this._emitEntityVisibilityEventsIfOpted(p, h.state, h.stateAway)
                }
                return h
            }
        }
        const f = UranusSpatialObject.tempSphere;
        let O = 0;
        i && (O = pc.now());
        const U = l ? c.position : p ? p.getPosition() : c.position;
        f.center.copy(U);
        let g = c.radius;
        if (!l && p) {
            const t = UranusSpatialObject._tempVec3_4;
            p.getWorldTransform().getScale(t),
                g *= Math.max(t.x, t.y, t.z)
        }
        f.radius = g * UranusSpatialObject.FRUSTUM_PAD + UranusSpatialObject.FRUSTUM_EPS;
        const j = t.frustum.containsSphere(f);
        if (i && 0 !== O && (n = pc.now() - O),
            h.state = j > 0,
            0 === j) {
            if (d && (p.uranusSpatialVisible = !1,
                p.uranusSpatialAway = h.stateAway,
                this.hasValidTrigger() && this._syncTrigger(h.stateAway, e),
                m && this._emitEntityVisibilityEventsIfOpted(p, !1, h.stateAway)),
                !u) {
                const t = this.anim ? this.anim.entity : null;
                t && (t.uranusAvatarVisible = !1)
            }
            return this._emitAvatarVisibleIfChanged(!1),
                i && UranusSpatialObject._debugMaybeLogSlowUpdate(this, t, UranusSpatialObject._DEBUG_SPATIAL_UPDATE_STAGE.FRUSTUM_ONLY, a, h, e, s, n),
                h
        }
        if (b.minDistance >= 0 && b.maxDistance > 0) {
            const i = o === UranusSpatialObject.VIS_CAMERA_SHADOWDIR && UranusSpatialObject.lastMainCamera ? UranusSpatialObject.lastMainCamera : t
                , a = l ? c.position : p ? p.getPosition() : c.position
                , s = c.checkVisibleDistance(a, i.node.getPosition(), b.minDistance, b.maxDistance);
            if (h.state = s,
                h.stateAway = !s,
                !s) {
                if (p?.light && (p.light.light.visibleThisFrame = !1),
                    !u && this._hasTrigger && this._syncTrigger(h.stateAway, e),
                    this.anim && !u && this._syncAnim(!0, e),
                    this._hasGroup && !u && this._syncGroup(!0, e),
                    !u) {
                    const t = this.anim ? this.anim.entity : null;
                    t && (t.uranusAvatarVisible = h.state),
                        p && (p.uranusSpatialVisible = !1,
                            p.uranusSpatialAway = !0,
                            m && this._emitEntityVisibilityEventsIfOpted(p, !1, !0))
                }
                return this._emitAvatarVisibleIfChanged(!1),
                    h
            }
        }
        if (h.state && this.occlusion?.occludee) {
            let e = !1;
            if (u) {
                let i, a = t.farClip;
                if (t.projection === pc.PROJECTION_ORTHOGRAPHIC) {
                    i = UranusSpatialObject._tempVec3_3.copy(t.node.forward);
                    const e = pc.Vec3.UP
                        , s = pc.math.clamp(-i.dot(e), 0, 1)
                        , n = .5
                        , r = 7;
                    a = pc.math.lerp(r, n, s)
                } else {
                    const e = t.node.getPosition();
                    i = UranusSpatialObject._tempVec3_3,
                        i.sub2(this.aabb.center, e).normalize()
                }
                if (i.lengthSq() > 1e-4 && a > 0) {
                    const s = this.buildExtrudedVolume(i, a, t);
                    e = this.checkExtrudedVolumeOcclusion(s, t),
                        !e && UranusSpatialObject.DEBUG_DRAW_EXTRUDED_VOLUMES && UranusSpatialObject.debugDrawExtrudedVolume(s, pc.Color.YELLOW)
                } else
                    e = !1
            } else
                e = this.checkOcclusion(t),
                    d && o === UranusSpatialObject.VIS_CAMERA_FORWARD && (p.uranusSpatialOccluded = e);
            if (h.state = !e,
                !u && p?.light) {
                const e = p.light
                    , i = e.light;
                if (i.visibleThisFrame && "directional" !== e.type) {
                    const e = UranusSpatialObject._tempAabb;
                    i.getBoundingBox(e);
                    const a = this.occlusion.occluderScale;
                    e.halfExtents.x *= a.x,
                        e.halfExtents.y *= a.y,
                        e.halfExtents.z *= a.z,
                        this._checkAabbOcclusion(t, e) && (i.visibleThisFrame = !1)
                }
            }
        }
        if (d && (p.uranusSpatialVisible = h.state,
            p.uranusSpatialAway = h.stateAway,
            !u && this._hasTrigger && this._syncTrigger(h.stateAway, e),
            this.anim && !u && this._syncAnim(h.stateAway, e),
            this._hasGroup && !u && this._syncGroup(h.stateAway, e),
            m && this._emitEntityVisibilityEventsIfOpted(p, h.state, h.stateAway)),
            !u && this.anim) {
            const t = this.anim.entity;
            t && (t.uranusAvatarVisible = h.state)
        }
        return this._emitAvatarVisibleIfChanged(h.state),
            r.frameSinceLastUpdate = e,
            r.state = h.state,
            r.stateAway = h.stateAway,
            i && UranusSpatialObject._debugMaybeLogSlowUpdate(this, t, UranusSpatialObject._DEBUG_SPATIAL_UPDATE_STAGE.FORWARD_FULL, a, h, e, s, n),
            h
    }
    checkExtrudedVolumeOcclusion(t, e) {
        UranusSpatialObject.ensureOccluderGridUpdated();
        const i = UranusSpatialObject.lastMainCamera && UranusSpatialObject.lastMainCamera.node ? UranusSpatialObject.lastMainCamera.node.getPosition() : e.node.getPosition()
            , a = this.meta?.entity
            , s = 1e-4
            , n = UranusSpatialObject._tempEVOcclusion_Vec3_1
            , r = UranusSpatialObject._tempEVOcclusion_Vec3_2
            , l = UranusSpatialObject._tempEVOcclusion_Ray
            , c = UranusSpatialObject._tempEVOcclusion_CollectedOccluders
            , o = UranusSpatialObject.OCCLUDER_GRID_CELL_SIZE;
        for (let e = 0; e < 8; e++) {
            const u = t[e];
            l.origin.copy(i),
                r.sub2(u, i);
            const p = r.length();
            if (p < s)
                continue;
            const d = (p - s) * (p - s);
            r.mulScalar(1 / p),
                l.direction.copy(r),
                c.clear(),
                UranusSpatialObject._collectOccludersAlongRay(i, l.direction, p, o, c);
            let b = !1;
            for (const t of c) {
                if (a && t.entity === a)
                    continue;
                const e = t.aabb;
                if (t.sphere.intersectsRay(l) && e.intersectsRay(l, n)) {
                    if (UranusSpatialObject._tempVec3_4.sub2(i, n).lengthSq() < d) {
                        b = !0;
                        break
                    }
                }
            }
            if (!b)
                return !1
        }
        return !0
    }
    intersectsRay(t, e = 1 / 0) {
        const i = UranusSpatialObject._tempPick_Vec2
            , a = UranusSpatialObject._tempPick_Vec1.sub2(this.position, t.origin)
            , s = a.dot(t.direction);
        if (a.lengthSq() - s * s > this.radius * this.radius)
            return 1 / 0;
        if (this.aabb.intersectsRay(t, i)) {
            const a = UranusSpatialObject.distanceSq(t.origin, i);
            if (a < e * e)
                return Math.sqrt(a)
        }
        return 1 / 0
    }
    static _updatePickGridForObject(t, e, i) {
        const a = UranusSpatialObject.PICK_GRID_CELL_SIZE
            , s = UranusSpatialObject._tempCellCoords1
            , n = UranusSpatialObject._tempCellCoords2
            , r = {
                x: 0,
                y: 0,
                z: 0
            }
            , l = e.getMin()
            , c = e.getMax();
        UranusSpatialObject._getGridCellCoords(l, a, s),
            UranusSpatialObject._getGridCellCoords(c, a, n);
        for (let e = s.x; e <= n.x; e++)
            for (let i = s.y; i <= n.y; i++)
                for (let l = s.z; l <= n.z; l++) {
                    r.x = e,
                        r.y = i,
                        r.z = l;
                    const s = UranusSpatialObject._getGridCellGuid(r, a)
                        , n = UranusSpatialObject.pickGrid.get(s);
                    if (n) {
                        const e = n.indexOf(t);
                        e > -1 && n.splice(e, 1)
                    }
                }
        const o = i.getMin()
            , u = i.getMax();
        UranusSpatialObject._getGridCellCoords(o, a, s),
            UranusSpatialObject._getGridCellCoords(u, a, n);
        for (let e = s.x; e <= n.x; e++)
            for (let i = s.y; i <= n.y; i++)
                for (let l = s.z; l <= n.z; l++) {
                    r.x = e,
                        r.y = i,
                        r.z = l;
                    const s = UranusSpatialObject._getGridCellGuid(r, a);
                    UranusSpatialObject.pickGrid.has(s) || UranusSpatialObject.pickGrid.set(s, []),
                        UranusSpatialObject.pickGrid.get(s).push(t)
                }
    }
    static ensurePickGrid() {
        if (!UranusSpatialObject.pickGridDirty)
            return;
        UranusSpatialObject.pickGrid.clear();
        const t = UranusSpatialObject.PICK_GRID_CELL_SIZE
            , e = UranusSpatialObject._tempCellCoords1
            , i = UranusSpatialObject._tempCellCoords2
            , a = {
                x: 0,
                y: 0,
                z: 0
            };
        for (const s of UranusSpatialObject.pickables.values())
            for (const n of s) {
                const s = n.aabb
                    , r = s.getMin()
                    , l = s.getMax();
                UranusSpatialObject._getGridCellCoords(r, t, e),
                    UranusSpatialObject._getGridCellCoords(l, t, i);
                for (let s = e.x; s <= i.x; s++)
                    for (let r = e.y; r <= i.y; r++)
                        for (let l = e.z; l <= i.z; l++) {
                            a.x = s,
                                a.y = r,
                                a.z = l;
                            const e = UranusSpatialObject._getGridCellGuid(a, t);
                            UranusSpatialObject.pickGrid.has(e) || UranusSpatialObject.pickGrid.set(e, []),
                                UranusSpatialObject.pickGrid.get(e).push(n)
                        }
            }
        UranusSpatialObject.pickGridDirty = !1
    }
    static _collectPickablesAlongRay = function (t, e, i, a, s) {
        const n = e.x > 0 ? 1 : e.x < 0 ? -1 : 0
            , r = e.y > 0 ? 1 : e.y < 0 ? -1 : 0
            , l = e.z > 0 ? 1 : e.z < 0 ? -1 : 0
            , c = UranusSpatialObject._getGridCellCoords(t, a, UranusSpatialObject._tempCellCoords1);
        let o, u, p, d, b, h;
        const m = 0 !== n ? 1 / e.x : 1 / 0
            , y = 0 !== r ? 1 / e.y : 1 / 0
            , S = 0 !== l ? 1 / e.z : 1 / 0;
        if (0 !== n) {
            o = ((c.x + (n > 0 ? 1 : 0)) * a - t.x) * m,
                d = Math.abs(a * m)
        } else
            o = 1 / 0,
                d = 1 / 0;
        if (0 !== r) {
            u = ((c.y + (r > 0 ? 1 : 0)) * a - t.y) * y,
                b = Math.abs(a * y)
        } else
            u = 1 / 0,
                b = 1 / 0;
        if (0 !== l) {
            p = ((c.z + (l > 0 ? 1 : 0)) * a - t.z) * S,
                h = Math.abs(a * S)
        } else
            p = 1 / 0,
                h = 1 / 0;
        let _ = 0;
        for (; _ <= i;) {
            const t = UranusSpatialObject._getGridCellGuid(c, a)
                , e = UranusSpatialObject.pickGrid.get(t);
            if (e)
                for (let t = 0; t < e.length; ++t)
                    s.add(e[t]);
            if (Math.min(o, u, p) > i)
                break;
            o <= u && o <= p ? (c.x += n,
                _ = o,
                o += d) : u <= p ? (c.y += r,
                    _ = u,
                    u += b) : (c.z += l,
                        _ = p,
                        p += h)
        }
    }
        ;
    static query(t, e, i, a, s, n = !0) {
        s.length = 0,
            UranusSpatialObject.ensurePickGrid();
        const r = UranusSpatialObject._collectedPickablesForQuery;
        r.clear();
        const l = UranusSpatialObject._processedCellsForQuery;
        l.clear(),
            UranusSpatialObject._collectPickablesAlongRay(t, e, a, UranusSpatialObject.PICK_GRID_CELL_SIZE, r);
        const c = Math.tan(i)
            , o = UranusSpatialObject._tempPick_Vec1
            , u = UranusSpatialObject._tempRayForPicking;
        u.origin.copy(t),
            u.direction.copy(e);
        for (const i of r) {
            if (!UranusSpatialObject.isSelectable(i))
                continue;
            if (n && i.cell) {
                if (l.has(i.cell))
                    continue;
                l.add(i.cell),
                    i.cell.queryPickables(t, e, c, a, s, i);
                continue
            }
            const r = i.position
                , p = UranusSpatialObject.distanceSq(r, t);
            if (p > a * a)
                continue;
            o.sub2(r, t);
            const d = o.dot(e);
            if (d < 0 || d > a)
                continue;
            const b = o.lengthSq() - d * d
                , h = d * c + i.radius;
            if (b > h * h)
                continue;
            const m = i.intersectsRay(u, a)
                , y = m === 1 / 0 ? Math.sqrt(p) : m;
            s.push(y, i)
        }
        return s.length
    }
    static queryRay(t, e, i, a) {
        return UranusSpatialObject.query(t.origin, t.direction, 0, e, i, a)
    }
    static updateDynamicPickables() {
        const t = pc.app.frame;
        if (t === UranusSpatialObject._lastDynamicPickablesUpdateFrame)
            return;
        UranusSpatialObject._lastDynamicPickablesUpdateFrame = t;
        const e = UranusSpatialObject.dynamicPickables;
        if (0 !== e.size)
            for (const t of e) {
                const e = t.meta?.entity;
                if (!e)
                    continue;
                if (e.uranusSpatialData && !t._uranusCarryTempDynamicPickable)
                    continue;
                const i = e.getPosition()
                    , a = i.x - t._px
                    , s = i.y - t._py
                    , n = i.z - t._pz
                    , r = a * a + s * s + n * n
                    , l = t.cell ? .01 * t.cell.cellSize : .01;
                if (r > l * l) {
                    const e = UranusSpatialObject._tempAabbForPicking;
                    if (e.center.set(t._px, t._py, t._pz),
                        e.halfExtents.copy(t.aabb.halfExtents),
                        t.aabb.center.copy(i),
                        UranusSpatialObject._updatePickGridForObject(t, e, t.aabb),
                        t._px = i.x,
                        t._py = i.y,
                        t._pz = i.z,
                        t.cell) {
                        const e = t.cell
                            , a = UranusSpatialObject._getGridCellGuid(UranusSpatialObject._getGridCellCoords(i, e.cellSize, UranusSpatialObject._tempCellCoords1), e.cellSize);
                        if (a !== t._lastCellGuid) {
                            const s = e.pickables.indexOf(t);
                            -1 !== s && e.pickables.splice(s, 1);
                            let n = UranusSpatialObject.cells.get(a);
                            n || (n = new UranusSpatialCell(a, e.cellSize, i),
                                UranusSpatialObject.cells.set(a, n)),
                                n.pickables.push(t),
                                n.visible.clear(),
                                t.visible.clear();
                            const r = t.meta?.payload;
                            if (r) {
                                const i = r.cells.get(e);
                                i && (i.instances.delete(t.meta.meshInstance),
                                    0 === i.instances.size && r.cells.delete(e));
                                let a = r.cells.get(n);
                                a || (a = {
                                    buffer: void 0,
                                    dynamic: !!i && i.dynamic,
                                    instances: new Map,
                                    spatialCell: n
                                },
                                    r.cells.set(n, a)),
                                    a.instances.set(t.meta.meshInstance, t),
                                    r.forceUpdate = !0
                            }
                            t.cell = n,
                                t._lastCellGuid = a
                        }
                    }
                }
            }
    }
    buildExtrudedVolume(t, e, i) {
        const a = this.aabb
            , s = a.getMin()
            , n = a.getMax()
            , r = a.center
            , l = UranusSpatialObject._tempBuildExtruded_Corner
            , c = UranusSpatialObject._tempBuildExtruded_VecToCorner
            , o = UranusSpatialObject._tempBuildExtruded_ExtrusionOffset;
        o.copy(t).mulScalar(e);
        const u = UranusSpatialObject._extrudedVolumePointsResult;
        let p;
        i.projection === pc.PROJECTION_PERSPECTIVE && (p = i.node.getPosition());
        for (let a = 0; a < 8; a++) {
            l.x = 1 & a ? n.x : s.x,
                l.y = 2 & a ? n.y : s.y,
                l.z = 4 & a ? n.z : s.z,
                c.sub2(l, r);
            const d = u[a];
            if (d.copy(l),
                c.dot(t) > 0)
                if (i.projection === pc.PROJECTION_PERSPECTIVE) {
                    const t = UranusSpatialObject._tempBuildExtruded_RayFromLight;
                    t.sub2(l, p).normalize();
                    const i = UranusSpatialObject._tempBuildExtruded_CurrentOffset;
                    i.copy(t).mulScalar(e),
                        d.add(i)
                } else
                    d.add(o)
        }
        return u
    }
    static debugDrawExtrudedVolume(t, e, i) {
        if (!t || 8 !== t.length)
            return void console.error("UranusSpatialObject.debugDrawExtrudedVolume: requires 8 points.");
        if (!pc.app)
            return void console.error("UranusSpatialObject.debugDrawExtrudedVolume: pc.app not available.");
        const a = pc.app;
        let s = i;
        if (!s) {
            s = a.scene.layers.getLayerById(pc.LAYERID_IMMEDIATE) || a.scene.defaultDrawLayer
        }
        const n = !1;
        a.drawLine(t[0], t[1], e, n, s),
            a.drawLine(t[1], t[3], e, n, s),
            a.drawLine(t[3], t[2], e, n, s),
            a.drawLine(t[2], t[0], e, n, s),
            a.drawLine(t[4], t[5], e, n, s),
            a.drawLine(t[5], t[7], e, n, s),
            a.drawLine(t[7], t[6], e, n, s),
            a.drawLine(t[6], t[4], e, n, s),
            a.drawLine(t[0], t[4], e, n, s),
            a.drawLine(t[1], t[5], e, n, s),
            a.drawLine(t[2], t[6], e, n, s),
            a.drawLine(t[3], t[7], e, n, s)
    }
}
UranusSpatialObject.VIS_CAMERA_FORWARD = 0,
    UranusSpatialObject.VIS_CAMERA_SHADOWDIR = 1,
    UranusSpatialObject.VIS_CAMERA_SHADOWLOCAL = 2,
    UranusSpatialObject.DEBUG_DRAW_EXTRUDED_VOLUMES = !1,
    UranusSpatialObject.DEBUG_SPATIAL_UPDATE = !1,
    UranusSpatialObject.DEBUG_SPATIAL_UPDATE_THRESHOLD_MS = 1,
    UranusSpatialObject._DEBUG_SPATIAL_UPDATE_STAGE = {
        FORWARD_FULL: 0,
        FRUSTUM_ONLY: 1
    },
    UranusSpatialObject._DEBUG_SPATIAL_UPDATE_STAGE_LABELS = ["forward-full", "frustum-only"],
    UranusSpatialObject.visibilityLimitsDummy = {
        index: 0,
        layer: "",
        minDistance: 0,
        maxDistance: 0,
        updateFrequency: 0
    },
    UranusSpatialObject.lastMainCamera = void 0,
    UranusSpatialObject.tempSphere = new pc.BoundingSphere,
    UranusSpatialObject.cells = new Map,
    UranusSpatialObject.occluders = new Map,
    UranusSpatialObject.pickables = new Map,
    UranusSpatialObject.dynamicPickables = new Set,
    UranusSpatialObject._tempRayForPicking = new pc.Ray,
    UranusSpatialObject._tempVec3ForPicking = new pc.Vec3,
    UranusSpatialObject._tempPick_Vec1 = new pc.Vec3,
    UranusSpatialObject._tempPick_Vec2 = new pc.Vec3,
    UranusSpatialObject.OCCLUDER_GRID_CELL_SIZE = 50,
    UranusSpatialObject.occluderGrid = new Map,
    UranusSpatialObject.occluderGridInitialized = !1,
    UranusSpatialObject.PICK_GRID_CELL_SIZE = 32,
    UranusSpatialObject.pickGrid = new Map,
    UranusSpatialObject.pickGridDirty = !0,
    UranusSpatialObject._collectedPickablesForQuery = new Set,
    UranusSpatialObject._processedCellsForQuery = new Set,
    UranusSpatialObject._tempCellCoords1 = {
        x: 0,
        y: 0,
        z: 0
    },
    UranusSpatialObject._tempCellCoords2 = {
        x: 0,
        y: 0,
        z: 0
    },
    UranusSpatialObject._tempRay = new pc.Ray,
    UranusSpatialObject._tempVec3_1 = new pc.Vec3,
    UranusSpatialObject._tempVec3_2 = new pc.Vec3,
    UranusSpatialObject._tempVec3_3 = new pc.Vec3,
    UranusSpatialObject._tempVec3_4 = new pc.Vec3,
    UranusSpatialObject._collectedOccludersForRay = new Set,
    UranusSpatialObject._tempQueryCoords = {
        x: 0,
        y: 0,
        z: 0
    },
    UranusSpatialObject.FRUSTUM_PAD = 1.1,
    UranusSpatialObject.FRUSTUM_EPS = .01,
    UranusSpatialObject._tempEVOcclusion_Ray = new pc.Ray,
    UranusSpatialObject._tempEVOcclusion_Vec3_1 = new pc.Vec3,
    UranusSpatialObject._tempEVOcclusion_Vec3_2 = new pc.Vec3,
    UranusSpatialObject._tempEVOcclusion_CollectedOccluders = new Set,
    UranusSpatialObject._tempEVOcclusion_QueryCoords = {
        x: 0,
        y: 0,
        z: 0
    },
    UranusSpatialObject._tempEVOcclusion_CellCoords1 = {
        x: 0,
        y: 0,
        z: 0
    },
    UranusSpatialObject._tempEVOcclusion_CellCoords2 = {
        x: 0,
        y: 0,
        z: 0
    },
    UranusSpatialObject._tempAabb = new pc.BoundingBox,
    UranusSpatialObject._tempAabbForPicking = new pc.BoundingBox,
    UranusSpatialObject._debugMaybeLogSlowUpdate = function (t, e, i, a, s, n, r, l) {
        if (!UranusSpatialObject.DEBUG_SPATIAL_UPDATE)
            return;
        const c = pc.now() - a;
        if (c < (UranusSpatialObject.DEBUG_SPATIAL_UPDATE_THRESHOLD_MS || 0))
            return;
        const o = t.meta && t.meta.entity
            , u = o ? o.name : "(no-entity)"
            , p = o ? o.path : "(no-path)"
            , d = e && e.node ? e.node : null
            , b = d ? d.name : "(no-camera-node)"
            , h = UranusSpatialObject._DEBUG_SPATIAL_UPDATE_STAGE_LABELS
            , m = h && h[i] ? h[i] : String(i)
            , y = s || (t.visible && e ? t.visible.get(e) : null) || null
            , S = y ? !!y.state : void 0
            , _ = y ? !!y.stateAway : void 0;
        let f = !1
            , O = 0;
        if (o && o.script && o.script.uranusSpatialVisibility) {
            const t = o.script.uranusSpatialVisibility;
            f = !!t.emitVisibilityEvents;
            const e = t.groupEntities;
            e && Array.isArray(e.entities) && (O = e.entities.length)
        }
        const U = t.anim || null
            , g = U && U.entity ? U.entity : null
            , j = !!U
            , A = !!t._hasGroup
            , v = !!t._hasTrigger
            , E = !(!t.occlusion || !t.occlusion.occluder && !t.occlusion.occludee)
            , C = void 0 !== n ? n : pc.app ? pc.app.frame : -1;
        console.log("[UranusSpatial][DebugUpdate]", "frame=", C, "ms=", c.toFixed(3), "stage=", m, "entity=", u, "path=", p, "entityEnabled=", o ? o.enabled : void 0, "camera=", b, "cameraVisIndex=", e ? e.visIndex : void 0, "visible=", S, "away=", _, "hasAnim=", j, "animEntity=", g ? g.name : null, "hasGroup=", A, "groupSize=", O, "hasTrigger=", v, "hasOcclusion=", E, "emitVisibilityEvents=", f, "ancestorMs=", "number" == typeof r ? r.toFixed(3) : void 0, "frustumMs=", "number" == typeof l ? l.toFixed(3) : void 0)
    }
    ,
    UranusSpatialObject._tempBuildExtruded_Corner = new pc.Vec3,
    UranusSpatialObject._tempBuildExtruded_VecToCorner = new pc.Vec3,
    UranusSpatialObject._tempBuildExtruded_ExtrusionOffset = new pc.Vec3,
    UranusSpatialObject._tempBuildExtruded_RayFromLight = new pc.Vec3,
    UranusSpatialObject._tempBuildExtruded_CurrentOffset = new pc.Vec3,
    UranusSpatialObject._extrudedVolumePointsResult = Array(8).fill(null).map((() => new pc.Vec3)),
    UranusSpatialObject._groupEntitiesPending = new Set,
    UranusSpatialObject.applyDeferredGroupToggles = function () {
        const t = UranusSpatialObject._groupEntitiesPending;
        if (t && 0 !== t.size) {
            for (const e of t) {
                if (!e)
                    continue;
                const t = e._uranusSpatialGroupDesiredEnabled;
                "boolean" == typeof t && e.enabled !== t && (e.enabled = t),
                    e._uranusSpatialGroupDirty = !1
            }
            t.clear()
        }
    }
    ,
    UranusSpatialObject._pendingAvatarEvents = new Set,
    UranusSpatialObject.applyDeferredAvatarEvents = function () {
        const t = UranusSpatialObject._pendingAvatarEvents;
        if (t && 0 !== t.size) {
            for (const e of t) {
                if (!e)
                    continue;
                const t = 0 | e._evtAvatarPendingTypes;
                if (!t)
                    continue;
                e._evtAvatarPendingTypes = 0;
                const i = e._eventTarget
                    , a = e.animation;
                if (i) {
                    if (1 & t) {
                        const t = 0 | e._evtAvatarLastLod;
                        i.uranusAvatarLod = t,
                            a && a.emitAvatarEvents && i.fire && i.fire("uranusPlayerAvatar:lodChanged", t)
                    }
                    if (2 & t) {
                        const t = !!e._evtAvatarLastVisible;
                        i.uranusAvatarVisible = t,
                            a && a.emitAvatarEvents && i.fire && i.fire("uranusPlayerAvatar:visibleChanged", t)
                    }
                }
            }
            t.clear()
        }
    }
    ,
    UranusSpatialObject._entityVisibilityEventState = new Map,
    UranusSpatialObject._hasPendingEntityVisibilityEvents = !1,
    UranusSpatialObject._queueEntityVisibilityEvent = function (t, e, i) {
        if (!t)
            return;
        let a = UranusSpatialObject._entityVisibilityEventState.get(t);
        a || (a = {
            hasVisible: !1,
            visible: !1,
            hasAway: !1,
            away: !1
        },
            UranusSpatialObject._entityVisibilityEventState.set(t, a)),
            "visible" === e ? (a.visible = !!i,
                a.hasVisible = !0) : "away" === e && (a.away = !!i,
                    a.hasAway = !0),
            UranusSpatialObject._hasPendingEntityVisibilityEvents = !0
    }
    ,
    UranusSpatialObject.applyDeferredEntityVisibilityEvents = function () {
        const t = UranusSpatialObject._entityVisibilityEventState;
        if (UranusSpatialObject._hasPendingEntityVisibilityEvents && t && 0 !== t.size) {
            for (const e of t) {
                const t = e[0]
                    , i = e[1];
                t && t.fire && (i.hasVisible && t.fire("uranusSpatialVisibility:visibleChanged", i.visible),
                    i.hasAway && t.fire("uranusSpatialVisibility:awayChanged", i.away),
                    i.hasVisible = !1,
                    i.hasAway = !1)
            }
            t.clear(),
                UranusSpatialObject._hasPendingEntityVisibilityEvents = !1
        }
    }
    ,
    UranusSpatialObject.getGridCellGuid = UranusSpatialObject._getGridCellGuid,
    UranusSpatialObject.getGridCellCoords = UranusSpatialObject._getGridCellCoords,
    UranusSpatialObject._lastDynamicPickablesUpdateFrame = -1;
class UranusSpatialCell {
    constructor(t, e, i) {
        this.guid = t,
            this.cellSize = e,
            this.coords = this.getCellCoords(i, this.cellSize),
            this.aabb = new pc.BoundingBox,
            this.aabb.center.set((this.coords.x + .5) * e, (this.coords.y + .5) * e, (this.coords.z + .5) * e),
            this.aabb.halfExtents.set(.5 * e, .5 * e, .5 * e),
            this.position = this.aabb.center,
            this.radius = 1.25 * this.aabb.halfExtents.length(),
            this.visible = new Map,
            this.pickables = []
    }
    static computeGuid(t, e) {
        const i = BigInt(Math.floor(e.x / t) + 32768)
            , a = BigInt(Math.floor(e.y / t) + 32768)
            , s = BigInt(Math.floor(e.z / t) + 32768);
        return BigInt(t) << 48n | i << 32n | a << 16n | s
    }
    getCellCoords(t, e, i) {
        return i || (i = {
            x: 0,
            y: 0,
            z: 0
        }),
            i.x = Math.floor(t.x / e),
            i.y = Math.floor(t.y / e),
            i.z = Math.floor(t.z / e),
            i
    }
    getVisibleCache(t, e) {
        let i = this.visible.get(t);
        i || (i = new Map,
            this.visible.set(t, i));
        const a = this.getHash(e);
        let s = i.get(a);
        return s || (s = {
            frameSinceLastUpdate: -1 / 0,
            state: !1
        },
            i.set(a, s)),
            s
    }
    getHash(t) {
        let e = 17;
        e = 31 * e + t.index | 0;
        const i = t.layer;
        let a = 0;
        for (let t = 0; t < i.length; t++)
            a = 31 * a + i.charCodeAt(t) | 0;
        return e = 31 * e + a | 0,
            e = 31 * e + t.minDistance | 0,
            e = 31 * e + t.maxDistance | 0,
            e = 31 * e + t.updateFrequency | 0,
            e >>> 0
    }
    isVisible(t, e) {
        const i = this.visible.get(t);
        if (!i)
            return !1;
        const a = i.get(this.getHash(e));
        return !!a && a.state
    }
    checkVisibleDistance(t, e, i, a) {
        const s = UranusSpatialObject.distanceSq(t, e)
            , n = UranusSpatialObject.lodMultiplier
            , r = i * n
            , l = a * n;
        return s >= r * r && s <= l * l
    }
    queryPickables(t, e, i, a, s, n) {
        const r = UranusSpatialObject._tempPick_Vec1
            , l = UranusSpatialObject._tempRayForPicking;
        l.origin.copy(t),
            l.direction.copy(e);
        for (const c of this.pickables) {
            if (!UranusSpatialObject.isSelectable(c))
                continue;
            const o = c.position
                , u = UranusSpatialObject.distanceSq(o, t);
            if (u > a * a)
                continue;
            r.sub2(o, t);
            const p = r.dot(e);
            if (p < 0 || p > a)
                continue;
            const d = r.lengthSq() - p * p
                , b = p * i + c.radius;
            if (d > b * b)
                continue;
            const h = c.intersectsRay(l, a)
                , m = h === 1 / 0 ? Math.sqrt(u) : h;
            c.proxy = n,
                s.push(m, c)
        }
    }
}
UranusSpatialCell.tempCoords = {
    x: 0,
    y: 0,
    z: 0
},
    UranusSpatialCell.prototype._scratchPicks = [];
var UranusSpatialVisibility = pc.createScript("uranusSpatialVisibility");
UranusSpatialVisibility.attributes.add("isStatic", {
    type: "boolean",
    default: !1,
    title: "Is Static",
    description: "Performance optimization, if enabled the entity world transform will be cached in a typed array."
}),
    UranusSpatialVisibility.attributes.add("emitVisibilityEvents", {
        type: "boolean",
        default: !1,
        title: "Emit Visibility Events",
        description: 'When enabled, fires entity events when visibility properties update: "uranusSpatialVisibility:visibleChanged" and "uranusSpatialVisibility:awayChanged".'
    }),
    UranusSpatialVisibility.attributes.add("cells", {
        type: "json",
        title: "Cells",
        schema: [{
            name: "enabled",
            type: "boolean",
            default: !1,
            title: "Enabled"
        }, {
            name: "dynamic",
            type: "boolean",
            default: !1,
            title: "Dynamic",
            description: "Dynamic cells recalculate position/rotation/scale of instances on each update cycle."
        }, {
            name: "size",
            type: "number",
            default: 50,
            title: "Size",
            description: "The size of each cell."
        }]
    }),
    UranusSpatialVisibility.attributes.add("collision", {
        type: "json",
        title: "Collision",
        schema: [{
            name: "spatialTrigger",
            type: "boolean",
            default: !1,
            title: "Spatial Trigger"
        }]
    }),
    UranusSpatialVisibility.attributes.add("occlusion", {
        type: "json",
        title: "Occlusion",
        schema: [{
            name: "occluder",
            type: "boolean",
            default: !1,
            title: "Occluder"
        }, {
            name: "occluderScale",
            type: "vec3",
            default: [.75, 1.05, .75],
            title: "Occluder Scale"
        }, {
            name: "occludee",
            type: "boolean",
            default: !1,
            title: "Occludee"
        }]
    }),
    UranusSpatialVisibility.attributes.add("picking", {
        type: "json",
        title: "Picking",
        schema: [{
            name: "enabled",
            type: "boolean",
            default: !1,
            title: "Enabled"
        }, {
            name: "outlineColor",
            type: "rgba",
            default: [1, 1, 1, 1],
            title: "Outline Color"
        }, {
            name: "text",
            type: "string",
            default: "",
            title: "Text",
            description: "Optional label to display when the object is picked."
        }, {
            name: "icon",
            type: "asset",
            assetType: "sprite",
            title: "Icon (Sprite Asset)",
            description: "Optional icon sprite asset to display when the object is picked."
        }, {
            name: "labelOffset",
            type: "vec3",
            default: [0, 0, 0],
            title: "Label Offset",
            description: "Interpreted by Label Offset Mode: screen → (x,y) pixels (z ignored); world/local → (x,y,z) in world units; none → ignored."
        }, {
            name: "labelOffsetMode",
            type: "string",
            default: "none",
            enum: [{
                None: "none"
            }, {
                Local: "local"
            }, {
                Screen: "screen"
            }, {
                World: "world"
            }],
            title: "Label Offset Mode",
            description: "How to apply label offset: 'none' (ignored), 'screen' (pixels), 'world' (world units), or 'local' (entity local axes in world units)."
        }, {
            name: "outlineChildrenOverride",
            type: "boolean",
            default: !1,
            title: "Outline Children Override",
            description: "If true, this object will outline its child render / mesh instances regardless of the global Outline Children setting on the picker."
        }, {
            name: "carryOutlineWhileCarryOverride",
            type: "string",
            default: "inherit",
            enum: [{
                "Inherit (Global Setting)": "inherit"
            }, {
                "Always Enable While Carrying": "enable"
            }, {
                "Always Disable While Carrying": "disable"
            }],
            title: "Carry Outline Override",
            description: 'Per-object override for the "Disable Pick Outline While Carry" controller setting. Inherit = use global; Enable/Disable force outline visibility while carrying.'
        }, {
            name: "materialsSkipOutline",
            type: "asset",
            assetType: "material",
            array: !0,
            title: "Skip Outline Materials",
            description: "Optional list of material assets whose mesh instances should be excluded from outlining when this object is picked."
        }]
    }),
    UranusSpatialVisibility.attributes.add("sound", {
        type: "json",
        title: "Sound",
        schema: [{
            name: "priority",
            type: "number",
            default: 1,
            title: "Priority (lower → stronger)"
        }]
    }),
    UranusSpatialVisibility.attributes.add("animation", {
        type: "json",
        title: "Animation",
        schema: [{
            name: "spatialAnimation",
            type: "boolean",
            default: !1,
            title: "Spatial Animation",
            description: "If enabled, toggles an Anim component based on spatial visibility."
        }, {
            name: "animComponent",
            type: "entity",
            title: "Anim Component",
            description: "Optional: target entity holding the Anim component. If empty, uses this entity when it has one."
        }, {
            name: "animLodTimes",
            type: "vec4",
            default: [0, 5, 10, 15],
            title: "Animation LOD Times",
            description: "Per-LOD update delay in skipped frames: [LOD0, LOD1, LOD2, LOD3]. 0 = update every frame; N = update after N frames."
        }, {
            name: "animLodDistances",
            type: "vec4",
            default: [15, 25, 40, 50],
            title: "Animation LOD Distances",
            description: "Max camera distance (main camera only) for each LOD: [LOD0, LOD1, LOD2, LOD3] in world units."
        }, {
            name: "emitAvatarEvents",
            type: "boolean",
            default: !0,
            title: "Emit Avatar Events",
            description: "When enabled, fires avatar LOD/visibility events to target (player root or anim entity)."
        }]
    }),
    UranusSpatialVisibility.attributes.add("groupEntities", {
        type: "json",
        title: "Group Entities",
        schema: [{
            name: "spatialGroup",
            type: "boolean",
            default: !1,
            title: "Spatial Group",
            description: "If enabled, toggles an array of entities on/off based on spatial distance (same policy as Animation)."
        }, {
            name: "entities",
            type: "entity",
            array: !0,
            title: "Entities",
            description: "Entities to enable when near and disable when away."
        }]
    }),
    UranusSpatialVisibility.attributes.add("visibility", {
        type: "json",
        title: "Visibility",
        array: !0,
        schema: [{
            name: "index",
            type: "number",
            default: -1,
            precision: 0,
            min: -1,
            max: 9,
            description: "The LOD index for this level e.g. 0 for LOD0, 1 for LOD 1 etc. Use entity names to set LOD per instance. If no name suffix is provided, it defaults to -1."
        }, {
            name: "layer",
            type: "string",
            default: "World",
            title: "Layer",
            description: "The layer to configure visibility for."
        }, {
            name: "minDistance",
            type: "number",
            default: 0,
            min: 0,
            title: "Min Distance",
            description: "The minimum distance from the active camera this batch is visible from."
        }, {
            name: "maxDistance",
            type: "number",
            default: 100,
            min: 0,
            title: "Max Distance",
            description: "The maximum distance from the active camera this batch is visible from. Set it to 0.0 to disable distance checks."
        }, {
            name: "updateFrequency",
            type: "number",
            default: 0,
            min: 0,
            title: "Update Frequency",
            description: "How often in frames visibility calculations will execute."
        }]
    }),
    UranusSpatialVisibility.attributes.add("visibilityShadows", {
        type: "json",
        title: "Visibility Shadows",
        array: !0,
        schema: [{
            name: "index",
            type: "number",
            default: -1,
            precision: 0,
            min: -1,
            max: 9,
            description: "The LOD index for this level e.g. 0 for LOD0, 1 for LOD 1 etc. Use entity names to set LOD per instance. If no name suffix is provided, it defaults to -1."
        }, {
            name: "layer",
            type: "string",
            default: "World",
            title: "Layer",
            description: "The layer to configure visibility for."
        }, {
            name: "minDistance",
            type: "number",
            default: 0,
            min: 0,
            title: "Min Distance",
            description: "The minimum distance from the active camera this batch is visible from."
        }, {
            name: "maxDistance",
            type: "number",
            default: 50,
            min: 0,
            title: "Max Distance",
            description: "The maximum distance from the active camera this batch is visible from. Set it to 0.0 to disable distance checks."
        }, {
            name: "updateFrequency",
            type: "number",
            default: 0,
            min: 0,
            title: "Update Frequency",
            description: "How often in frames visibility calculations will execute."
        }]
    });
