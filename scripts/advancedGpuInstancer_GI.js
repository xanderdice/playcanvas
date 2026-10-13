var AdvancedGpuInstancer = pc.createScript('advancedGpuInstancer');
AdvancedGpuInstancer.attributes.add('chunkSize', {
    type: 'number',
    default: 256,
    min: 16,
    title: 'Tamano de chunks'
});
AdvancedGpuInstancer.attributes.add('autoLod', {
    type: 'boolean',
    default: true,
    title: 'AutoLOD'
});
AdvancedGpuInstancer.attributes.add('physicsStreaming', {
    type: 'boolean',
    default: true,
    title: 'Colisiones por proximidad'
});
AdvancedGpuInstancer.attributes.add('dynamicShadowCatcher', {
    type: 'boolean',
    default: true,
    title: 'Sombras dinamicas sobre bake'
});
AdvancedGpuInstancer.attributes.add('debug', {
    type: 'boolean',
    default: true,
    title: 'Diagnostico'
});
(function () {
    'use strict';
    var TAG = '[GI2.5]';
    var MIN = 2;
    var RECT = [0, 0, 1, 1];
    var SEM = [
        pc.SEMANTIC_ATTR11,
        pc.SEMANTIC_ATTR12,
        pc.SEMANTIC_ATTR13,
        pc.SEMANTIC_ATTR14
    ];
    var GLSL_X = [
        'attribute vec4 aGi0;',
        'attribute vec4 aGi1;',
        'attribute vec4 aGi2;',
        'attribute vec4 aGiRect;',
        'mat4 getModelMatrix() { return mat4(',
        ' vec4(aGi0.xyz,0.0), vec4(aGi1.xyz,0.0),',
        ' vec4(aGi2.xyz,0.0),',
        ' vec4(aGi0.w,aGi1.w,aGi2.w,1.0)); }'
    ].join('\n');
    var WGSL_X = [
        'attribute aGi0: vec4f;',
        'attribute aGi1: vec4f;',
        'attribute aGi2: vec4f;',
        'attribute aGiRect: vec4f;',
        'fn getModelMatrix() -> mat4x4f { return mat4x4f(',
        ' vec4f(aGi0.xyz,0.0), vec4f(aGi1.xyz,0.0),',
        ' vec4f(aGi2.xyz,0.0),',
        ' vec4f(aGi0.w,aGi1.w,aGi2.w,1.0)); }'
    ].join('\n');
    var GLSL_U =
        '\n#if defined(INSTANCING) && defined(UV1_UNMODIFIED)\n' +
        'vUv1 = vUv1 * aGiRect.zw + aGiRect.xy;\n' +
        '#endif\n';
    var WGSL_U =
        '\n#if defined(INSTANCING) && defined(UV1_UNMODIFIED)\n' +
        'output.vUv1 = output.vUv1 * aGiRect.zw + aGiRect.xy;\n' +
        '#endif\n';
    function alive(e) {
        return !!(e && e.enabled && !e._destroyed);
    }
    function getp(mi, name) {
        var p = mi && mi.getParameter
            ? mi.getParameter(name)
            : null;
        return p && p.data !== undefined ? p.data : p;
    }
    function lm(mi) {
        var n = pc.MeshInstance.lightmapParamNames || [
            'instance_lightMap',
            'texture_dirLightMap'
        ];
        return {
            name: n[0] || 'instance_lightMap',
            texture:
                getp(mi, n[0] || 'instance_lightMap') ||
                getp(mi, 'instance_lightMap'),
            dirName: n[1] || 'texture_dirLightMap',
            direction:
                getp(mi, n[1] || 'texture_dirLightMap')
        };
    }
    function rect(mi) {
        var a = getp(mi, 'uPT6LmRect');
        return a &&
            a.length === 4 &&
            Array.from(a).every(Number.isFinite) &&
            a[2] > 0 &&
            a[3] > 0
            ? a
            : null;
    }
    function baked(c, mi) {
        return !!(
            (c.lightmapped === true || c.entity.__giProxy) &&
            lm(mi).texture
        );
    }
    function worldBounds(mi) {
        var b = mi && mi.aabb;
        if (!b || !b.center || !b.halfExtents) {
            return null;
        }
        var c = b.center;
        var h = b.halfExtents;
        var a = [
            c.x - h.x,
            c.y - h.y,
            c.z - h.z,
            c.x + h.x,
            c.y + h.y,
            c.z + h.z
        ];
        return a.every(Number.isFinite) ? a : null;
    }
    function union(a, b) {
        if (!a) {
            return b.slice();
        }
        for (var i = 0; i < 3; i++) {
            a[i] = Math.min(a[i], b[i]);
            a[i + 3] = Math.max(a[i + 3], b[i + 3]);
        }
        return a;
    }
    function makeAabb(a) {
        return new pc.BoundingBox(
            new pc.Vec3(
                (a[0] + a[3]) / 2,
                (a[1] + a[4]) / 2,
                (a[2] + a[5]) / 2
            ),
            new pc.Vec3(
                (a[3] - a[0]) / 2,
                (a[4] - a[1]) / 2,
                (a[5] - a[2]) / 2
            )
        );
    }
    function oid(self, x) {
        if (!x) {
            return 0;
        }
        var n = self._ids.get(x);
        if (!n) {
            n = ++self._id;
            self._ids.set(x, n);
        }
        return n;
    }
    function extraParams(mi) {
        if (
            !mi.parameters ||
            typeof mi.parameters.forEach !== 'function'
        ) {
            return false;
        }
        var extra = false;
        mi.parameters.forEach(function (value, name) {
            if (
                name !== 'uPT6LmRect' &&
                name !== 'instance_lightMap' &&
                name !== 'texture_dirLightMap'
            ) {
                extra = true;
            }
        });
        return extra;
    }
    function reason(c, mi) {
        if (
            !mi ||
            !mi.mesh ||
            !mi.mesh.vertexBuffer ||
            !mi.material ||
            !mi.node ||
            mi.visible === false ||
            mi.skinInstance ||
            mi.morphInstance ||
            mi.instancingData ||
            extraParams(mi)
        ) {
            return 'malla especial';
        }
        if (!(mi.material instanceof pc.StandardMaterial)) {
            return 'material no PBR';
        }
        if (mi.material.blendType !== pc.BLEND_NONE) {
            return 'transparencia';
        }
        if (mi.flipFacesFactor !== 1) {
            return 'escala reflejada';
        }
        var p = mi.mesh.primitive;
        if (
            !p ||
            p.length !== 1 ||
            p[0].type !== pc.PRIMITIVE_TRIANGLES
        ) {
            return 'topologia';
        }
        if (
            mi.mesh.vertexBuffer.getFormat().elements.some(
                function (e) {
                    return SEM.indexOf(e.name) >= 0;
                }
            )
        ) {
            return 'atributos reservados';
        }
        var l = lm(mi);
        if (c.lightmapped && (!l.texture || !rect(mi))) {
            return 'esperando PT';
        }
        if (!c.lightmapped && l.texture) {
            return 'lightmap sin bandera';
        }
        if (mi.calculateSortDistance) {
            return 'orden especial';
        }
        return '';
    }
    function collect(self) {
        var items = [];
        var waiting = 0;
        self.app.root.findComponents('render').forEach(
            function (c) {
                if (
                    !alive(c.entity) ||
                    !c.enabled ||
                    !c.isStatic ||
                    c.entity.__giProxy ||
                    c.entity.__giShadowCatcher ||
                    c.batchGroupId >= 0
                ) {
                    return;
                }
                (c.meshInstances || []).forEach(function (mi) {
                    self.stats.staticMeshes++;
                    var why = reason(c, mi);
                    if (why) {
                        self.stats.excluded[why] =
                            (self.stats.excluded[why] || 0) + 1;
                        if (why === 'esperando PT') {
                            waiting++;
                        }
                        return;
                    }
                    var b = worldBounds(mi);
                    if (!b) {
                        self.stats.excluded.bounds =
                            (self.stats.excluded.bounds || 0) + 1;
                        return;
                    }
                    items.push({
                        mi: mi,
                        c: c,
                        lm: lm(mi),
                        rect: rect(mi),
                        bounds: b
                    });
                });
            }
        );
        return {
            items: items,
            waiting: waiting
        };
    }
    function stateKey(self, x) {
        var m = x.mi;
        var c = x.c;
        var manual = false;
        (c.layers || []).forEach(function (id) {
            var l = self.app.scene.layers.getLayerById(id);
            if (
                l &&
                l.opaqueSortMode === pc.SORTMODE_MANUAL
            ) {
                manual = true;
            }
        });
        var casts = !!(m.castShadow && c.castShadows);
        return [
            (c.layers || []).join(','),
            m.mask,
            m.renderStyle,
            m.shaderPassMask,
            casts ? 1 : 0,
            !!(m.receiveShadow && c.receiveShadows) ? 1 : 0,
            casts ? m.shadowCascadeMask : 'no',
            m.drawBucket,
            manual ? m.drawOrder : 'auto',
            typeof m._shaderDefs === 'number'
                ? (
                    m._shaderDefs &
                    ~(pc.SHADERDEF_INSTANCING || 0)
                )
                : '?'
        ].join('|');
    }
    function instanceMaterial(self, g) {
        var src = g.items[0].mi.material;
        var cached = self._materialCache.get(src);
        if (cached) return cached;
        var m = src.clone();
        m.name = (src.name || 'Material') + '_GI25';
        m.shaderChunksVersion = '2.23';
        [
            [pc.SHADERLANGUAGE_GLSL, GLSL_X, GLSL_U],
            [pc.SHADERLANGUAGE_WGSL, WGSL_X, WGSL_U]
        ].forEach(function (x) {
            var chunks = m.getShaderChunks(x[0]);
            chunks.set('transformInstancingVS', x[1]);
            chunks.set(
                'litUserMainEndVS',
                (chunks.get('litUserMainEndVS') || '') + x[2]
            );
        });
        ['aGi0', 'aGi1', 'aGi2', 'aGiRect'].forEach(
            function (n, i) {
                m.setAttribute(n, SEM[i]);
            }
        );
        m.update();
        self._materialCache.set(src, m);
        return m;
    }
    function pack(dst, i, x) {
        var m = x.mi.node.getWorldTransform().data;
        var o = i * 16;
        dst[o] = m[0];
        dst[o + 1] = m[1];
        dst[o + 2] = m[2];
        dst[o + 3] = m[12];
        dst[o + 4] = m[4];
        dst[o + 5] = m[5];
        dst[o + 6] = m[6];
        dst[o + 7] = m[13];
        dst[o + 8] = m[8];
        dst[o + 9] = m[9];
        dst[o + 10] = m[10];
        dst[o + 11] = m[14];
        dst.set(x.rect || RECT, o + 12);
    }
    function build(self, g, format) {
        var src = g.items[0].mi;
        var proxy = null;
        var vb = null;
        var mat = null;
        var committed = false;
        try {
            var data = new Float32Array(g.items.length * 16);
            g.items.forEach(function (x, i) {
                pack(data, i, x);
            });
            vb = new pc.VertexBuffer(
                self.app.graphicsDevice,
                format,
                g.items.length,
                { data: data }
            );
            mat = instanceMaterial(self, g);
            proxy = new pc.Entity(
                'GI25_' +
                (self._groups.length + 1) +
                '_' +
                g.items[0].c.entity.name
            );
            proxy.__giProxy = true;
            self.app.root.addChild(proxy);
            var mi = new pc.MeshInstance(
                src.mesh,
                mat,
                proxy
            );
            mi.castShadow = src.castShadow;
            mi.receiveShadow = src.receiveShadow;
            mi.shadowCascadeMask = src.shadowCascadeMask;
            mi.mask = src.mask;
            mi.shaderPassMask = src.shaderPassMask;
            mi.renderStyle = src.renderStyle;
            mi.drawOrder = src.drawOrder;
            mi.drawBucket = src.drawBucket;
            mi.setInstancing(vb, true);
            proxy.addComponent('render', {
                meshInstances: [mi],
                layers: g.items[0].c.layers.slice()
            });
            proxy.render.castShadows =
                g.items[0].c.castShadows;
            proxy.render.receiveShadows =
                g.items[0].c.receiveShadows;
            mi.mask = src.mask;
            if (g.items[0].c.lightmapped) {
                var l = g.items[0].lm;
                mi.setRealtimeLightmap(
                    l.name,
                    l.texture
                );
                if (l.direction) {
                    mi.setRealtimeLightmap(
                        l.dirName,
                        l.direction
                    );
                }
                mi.setParameter('uPT6LmRect', RECT);
            }
            if (
                typeof mi._updateShaderDefs === 'function' &&
                typeof src._shaderDefs === 'number'
            ) {
                mi._updateShaderDefs(
                    src._shaderDefs |
                    (mi._shaderDefs & ~src._shaderDefs)
                );
            }
            var a = makeAabb(g.bounds);
            proxy.render.customAabb = a;
            mi.aabb = a;
            g.proxy = proxy;
            g.mi = mi;
            g.vb = vb;
            g.mat = mat;
            g.center = a.center.clone();
            g.radius = a.halfExtents.length();
            g.current = 0;
            self._groups.push(g);
            committed = true;
            g.items.forEach(function (x) {
                self._hidden.push({
                    mi: x.mi,
                    visible: x.mi.visible
                });
                x.mi.visible = false;
            });
            self.stats.groups++;
            self.stats.instanced += g.items.length;
            self.stats.savedDrawsEstimate +=
                g.items.length - 1;
            self._registerLod(g);
        } catch (e) {
            console.warn(TAG, 'Grupo preservado por error:', e);
            if (committed) {
                self._groups.pop();
                g.items.forEach(function (x) {
                    var h = self._hidden.find(function (q) {
                        return q.mi === x.mi;
                    });
                    if (h) {
                        x.mi.visible = h.visible;
                    }
                });
                self._hidden = self._hidden.filter(
                    function (h) {
                        return !g.items.some(function (x) {
                            return x.mi === h.mi;
                        });
                    }
                );
            }
            if (proxy) {
                try { proxy.destroy(); } catch (_) { }
            }
            if (vb) {
                try { vb.destroy(); } catch (_) { }
            }
            self.stats.excluded['fallo grupo'] =
                (self.stats.excluded['fallo grupo'] || 0) +
                g.items.length;
        }
    }
    function normalizedMode(mode) {
        var aliases = {
            'Optimizar horneados': 'optimized',
            'Automatico seguro': 'auto',
            'Original (GI1.7)': 'original',
            'Original (sin optimizar)': 'original'
        };
        mode = aliases[mode] || mode;
        return (
            mode === 'optimized' ||
            mode === 'original' ||
            mode === 'auto'
        ) ? mode : 'auto';
    }
    var frameOwner = null;
    function shadowComponents(app) {
        if (frameOwner && frameOwner.app === app && frameOwner._frameComponents) {
            return frameOwner._frameComponents;
        }
        return app.root.findComponents('render').concat(
            app.root.findComponents('model')
        );
    }
    function shadowLights(app) {
        if (frameOwner && frameOwner.app === app && frameOwner._frameLights) {
            return frameOwner._frameLights;
        }
        return app.root.findComponents('light');
    }
    function shadowParticles(app) {
        if (frameOwner && frameOwner.app === app) {
            if (!frameOwner._frameParticles) {
                frameOwner._frameParticles = app.root.findComponents('particlesystem');
            }
            return frameOwner._frameParticles;
        }
        return app.root.findComponents('particlesystem');
    }
    function validCasterComponent(c, originals) {
        if (!c || !alive(c.entity) || !c.enabled) {
            return false;
        }
        var saved = originals.get(c);
        if (!c.castShadows && !saved) {
            return false;
        }
        if (
            !(
                c.isStatic === true ||
                c.entity.__giProxy === true
            )
        ) {
            return false;
        }
        var arr = c.meshInstances || [];
        var any = false;
        var seen = false;
        if (!arr.length) {
            return false;
        }
        for (var i = 0; i < arr.length; i++) {
            var mi = arr[i];
            if (
                !mi ||
                !mi.mesh ||
                mi.visible === false
            ) {
                continue;
            }
            seen = true;
            if (!baked(c, mi)) {
                return false;
            }
            if (mi.castShadow) {
                any = true;
            }
        }
        return seen && (any || !!saved);
    }
    function sphereOf(mi) {
        var a = mi && mi.aabb;
        if (!a || !a.center || !a.halfExtents) {
            return null;
        }
        var c = a.center;
        var h = a.halfExtents;
        var r = Math.sqrt(
            h.x * h.x +
            h.y * h.y +
            h.z * h.z
        );
        if (
            ![c.x, c.y, c.z, r].every(Number.isFinite)
        ) {
            return null;
        }
        return {
            x: c.x,
            y: c.y,
            z: c.z,
            r: r
        };
    }
    function lightHitsSphere(l, s) {
        if (!s) return true;
        if (l.type === 'directional') {
            return true;
        }
        var p = l.entity.getPosition();
        var dx = s.x - p.x;
        var dy = s.y - p.y;
        var dz = s.z - p.z;
        var d = Math.hypot(dx, dy, dz);
        var range = Number(l.range);
        if (!Number.isFinite(range) || range <= 0) {
            return true;
        }
        if (d > s.r + range) {
            return false;
        }
        if (l.type !== 'spot' || d <= s.r) {
            return true;
        }
        var half = Number(l.outerConeAngle);
        if (!Number.isFinite(half)) {
            return true;
        }
        var allowed = Math.min(
            Math.PI,
            Math.max(0, half) * Math.PI / 180 +
            Math.asin(Math.min(1, s.r / d))
        );
        var up = l.entity.up;
        if (!up) return true;
        var coneCos = -(
            dx * up.x +
            dy * up.y +
            dz * up.z
        ) / d;
        return coneCos >= Math.cos(allowed) - 0.0001;
    }
    function receiverForLight(l, receiverBaked, mi) {
        if (receiverBaked) {
            if (l.bake || l.affectLightmapped !== true) {
                return false;
            }
        } else if (l.affectDynamic === false) {
            return false;
        }
        if (
            typeof l.mask === 'number' &&
            typeof mi.mask === 'number' &&
            !(l.mask & mi.mask)
        ) {
            return false;
        }
        return lightHitsSphere(l, sphereOf(mi));
    }
    function canShadow(caster, receiver, l) {
        if (!caster || !receiver) {
            return true;
        }
        var vx;
        var vy;
        var vz;
        var maxDist = Infinity;
        if (l.type === 'directional') {
            var up = l.entity.up;
            if (!up) return true;
            vx = up.x;
            vy = up.y;
            vz = up.z;
        } else {
            var p = l.entity.getPosition();
            vx = p.x - receiver.x;
            vy = p.y - receiver.y;
            vz = p.z - receiver.z;
            maxDist = Math.hypot(vx, vy, vz);
            if (maxDist < 1e-6) {
                return true;
            }
            vx /= maxDist;
            vy /= maxDist;
            vz /= maxDist;
        }
        var rx = caster.x - receiver.x;
        var ry = caster.y - receiver.y;
        var rz = caster.z - receiver.z;
        var t = rx * vx + ry * vy + rz * vz;
        var radius = caster.r + receiver.r + 1.0;
        if (
            t < -radius ||
            t > maxDist + radius
        ) {
            return false;
        }
        var clamped = Math.max(
            0,
            Math.min(t, maxDist)
        );
        var ox = rx - vx * clamped;
        var oy = ry - vy * clamped;
        var oz = rz - vz * clamped;
        return (
            ox * ox +
            oy * oy +
            oz * oz
        ) <= radius * radius;
    }
    function shadowSources(self, c) {
        if (c.entity.__giProxy) {
            for (var i = 0; i < self._groups.length; i++) {
                var g = self._groups[i];
                if (g.proxy === c.entity) {
                    if (!g._shadowSources) {
                        g._shadowSources = g.items.map(function (x) {
                            return { mi: x.mi, c: x.c };
                        });
                    }
                    return g._shadowSources;
                }
            }
        }
        return (c.meshInstances || [])
            .filter(function (mi) {
                return (
                    mi &&
                    mi.mesh &&
                    mi.visible !== false
                );
            })
            .map(function (mi) {
                return {
                    mi: mi,
                    c: c
                };
            });
    }
    function trivialSelfShadow(src, r) {
        if (src.mi !== r.mi) {
            return false;
        }
        var type = src.c.type;
        return (
            type === 'box' ||
            type === 'plane' ||
            type === 'sphere' ||
            type === 'cylinder' ||
            type === 'capsule'
        );
    }
    function potentialShadow(self, c, lights, receivers) {
        var src = shadowSources(self, c);
        var checked = 0;
        var maxChecks = Math.max(
            1000,
            self.shadowPairBudget || 50000
        );
        if (src.some(function (x) {
            return x.mi.skinInstance || x.mi.morphInstance;
        })) {
            return 'Animacion de caster';
        }
        for (var k = 0; k < lights.length; k++) {
            var l = lights[k];
            for (var j = 0; j < receivers.length; j++) {
                var r = receivers[j];
                if (r.c.entity.__giShadowCatcher) {
                    continue;
                }
                if (!receiverForLight(l, r.baked, r.mi)) {
                    continue;
                }
                var rb = sphereOf(r.mi);
                for (var i = 0; i < src.length; i++) {
                    if (++checked > maxChecks) {
                        return 'Protegido por limite de analisis';
                    }
                    var x = src[i];
                    var mi = x.mi;
                    if (trivialSelfShadow(x, r)) {
                        continue;
                    }
                    if (
                        typeof l.mask === 'number' &&
                        typeof mi.mask === 'number' &&
                        !(l.mask & mi.mask)
                    ) {
                        continue;
                    }
                    if (!lightHitsSphere(l, sphereOf(mi))) {
                        continue;
                    }
                    if (canShadow(sphereOf(mi), rb, l)) {
                        return (
                            'Puede sombrear ' +
                            r.name +
                            ' por ' +
                            l.entity.name
                        );
                    }
                }
            }
        }
        return '';
    }
    function shadowScene(self) {
        var receivers = frameOwner === self
            ? self._frameReceivers : null;
        var lights = [];
        if (!receivers) {
            receivers = [];
            shadowComponents(self.app).forEach(function (c) {
                if (
                    !c ||
                    !c.enabled ||
                    !alive(c.entity) ||
                    c.receiveShadows === false
                ) {
                    return;
                }
                shadowSources(self, c).forEach(function (x) {
                    var mi = x.mi;
                    if (
                        !mi ||
                        !mi.mesh ||
                        mi.receiveShadow === false
                    ) {
                        return;
                    }
                    receivers.push({
                        mi: mi,
                        baked: baked(x.c, mi),
                        name: x.c.entity.name,
                        c: x.c
                    });
                });
            });
            if (frameOwner === self) self._frameReceivers = receivers;
        }
        shadowLights(self.app).forEach(
            function (l) {
                if (!l.enabled || !alive(l.entity)) {
                    return;
                }
                var saved = self._lightOriginals.get(l);
                if (
                    !l.castShadows &&
                    (!saved || !saved.cast)
                ) {
                    return;
                }
                lights.push(l);
            }
        );
        return {
            receivers: receivers,
            lights: lights
        };
    }
    AdvancedGpuInstancer.prototype._restoreOneCaster =
        function (c, rec) {
            if (
                !c ||
                !c.entity ||
                c.entity._destroyed
            ) {
                return;
            }
            c.castShadows = rec.cast;
            rec.instances.forEach(function (m) {
                if (m.mi) {
                    m.mi.castShadow = m.cast;
                }
            });
        };
    AdvancedGpuInstancer.prototype._restoreCasters =
        function (clear) {
            if (!this._casterOriginals) {
                return;
            }
            this._casterOriginals.forEach(
                function (rec, c) {
                    try {
                        this._restoreOneCaster(c, rec);
                    } catch (e) {
                        console.warn(TAG, e);
                    }
                },
                this
            );
            if (clear !== false) {
                this._casterOriginals.clear();
            }
            this._casterDisabled = 0;
        };
    AdvancedGpuInstancer.prototype._applyCasterMode =
        function (override) {
            if (
                !this._alive ||
                !this._built ||
                this._baking
            ) {
                return;
            }
            var mode = normalizedMode(
                override || this.smartShadowMode
            );
            var scene = shadowScene(this);
            var seen = new Set();
            var report = [];
            var names = [];
            scene.receivers.forEach(function (r) {
                if (
                    !r.baked &&
                    names.indexOf(r.name) < 0
                ) {
                    names.push(r.name);
                }
            });
            shadowComponents(this.app).forEach(
                function (c) {
                    if (
                        !validCasterComponent(
                            c,
                            this._casterOriginals
                        )
                    ) {
                        return;
                    }
                    seen.add(c);
                    var why = mode === 'original'
                        ? 'Modo original'
                        : mode === 'optimized'
                            ? 'Modo forzado'
                            : potentialShadow(
                                this,
                                c,
                                scene.lights,
                                scene.receivers
                            );
                    var off = mode !== 'original' && !why;
                    if (mode === 'optimized') {
                        off = true;
                    }
                    var rec = this._casterOriginals.get(c);
                    if (off) {
                        if (!rec) {
                            rec = {
                                cast: c.castShadows,
                                instances: (c.meshInstances || [])
                                    .map(function (mi) {
                                        return {
                                            mi: mi,
                                            cast: mi.castShadow
                                        };
                                    })
                            };
                            this._casterOriginals.set(c, rec);
                        }
                        if (c.castShadows) {
                            c.castShadows = false;
                        }
                    } else if (rec) {
                        this._restoreOneCaster(c, rec);
                        this._casterOriginals.delete(c);
                    }
                    report.push({
                        objeto: c.entity.name,
                        proyecta: !off,
                        motivo: off
                            ? (
                                mode === 'optimized'
                                    ? 'Forzado'
                                    : 'Sin sombras utiles detectadas'
                            )
                            : why
                    });
                },
                this
            );
            this._casterOriginals.forEach(
                function (rec, c) {
                    if (seen.has(c)) {
                        return;
                    }
                    try {
                        this._restoreOneCaster(c, rec);
                    } catch (_) { }
                    this._casterOriginals.delete(c);
                },
                this
            );
            this._casterDisabled =
                this._casterOriginals.size;
            this._casterReport = report;
            var status =
                mode + '|' +
                this._casterDisabled + '|' +
                report.map(function (r) {
                    return (
                        r.objeto + ':' +
                        (r.proyecta ? 1 : 0)
                    );
                }).join('|');
            this._casterStatus = {
                mode: mode,
                receptoresSinBake: names.length,
                nombres: names,
                componentesSinSombras:
                    this._casterDisabled,
                analizados: report.length,
                motivo: mode === 'auto'
                    ? 'Evaluacion geometrica automatica'
                    : 'Modo manual'
            };
            if (
                this.debug &&
                status !== this._lastCasterStatus
            ) {
                console.log(
                    TAG,
                    'Baked Static Shadow Casting:',
                    this._casterStatus
                );
                console.table(report);
                this._lastCasterStatus = status;
            }
        };
    AdvancedGpuInstancer.prototype.auditBakedCasters =
        function () {
            console.log(
                TAG,
                'BakedCasterMode:',
                normalizedMode(this.smartShadowMode),
                '|',
                this._casterStatus
            );
            console.table(this._casterReport || []);
            return this._casterStatus;
        };
    AdvancedGpuInstancer.prototype.setBakedCasterMode =
        function (mode) {
            mode = normalizedMode(mode);
            if (this._probe) {
                this.cancelShadowProbe();
            }
            this.smartShadowMode = mode;
            this._casterStateKey = null;
            this._applyCasterMode();
            return this.auditBakedCasters();
        };
    function signature(e) {
        if (!e || !e.getWorldTransform) {
            return '';
        }
        var d = e.getWorldTransform().data;
        var s = '';
        for (var i = 0; i < 16; i++) {
            s += Math.round(d[i] * 10000) + ',';
        }
        return s;
    }
    function lightSignature(l) {
        return signature(l.entity) + '|' + [
            l.type,
            l.range,
            l.innerConeAngle,
            l.outerConeAngle,
            l.shadowResolution,
            l.shadowType,
            l.shadowDistance,
            l.numCascades,
            l.mask
        ].join('|');
    }
    function nearLight(l, mi) {
        if (l.type === 'directional') {
            return true;
        }
        var b = mi.aabb;
        if (
            !b ||
            !b.center ||
            !b.halfExtents
        ) {
            return true;
        }
        var p = l.entity.getPosition();
        var dx = p.x - b.center.x;
        var dy = p.y - b.center.y;
        var dz = p.z - b.center.z;
        var range = Number(l.range);
        if (!Number.isFinite(range) || range <= 0) {
            return true;
        }
        var t = range + b.halfExtents.length();
        return (
            dx * dx +
            dy * dy +
            dz * dz
        ) <= t * t;
    }
    function lightParticipants(self, l) {
        var receivers = 0;
        var dynamic = 0;
        var staticSignature = [];
        shadowComponents(self.app).forEach(function (c) {
            if (
                !c ||
                !alive(c.entity) ||
                !c.enabled
            ) {
                return;
            }
            (c.meshInstances || []).forEach(function (mi) {
                if (
                    !mi ||
                    !mi.mesh ||
                    mi.visible === false ||
                    !nearLight(l, mi)
                ) {
                    return;
                }
                if (
                    !baked(c, mi) &&
                    c.receiveShadows !== false &&
                    mi.receiveShadow !== false
                ) {
                    receivers++;
                }
                if (
                    c.castShadows === false ||
                    mi.castShadow === false
                ) {
                    return;
                }
                if (
                    !(c.isStatic || c.entity.__giProxy) ||
                    mi.skinInstance ||
                    mi.morphInstance
                ) {
                    dynamic++;
                    return;
                }
                staticSignature.push(
                    c.entity.name +
                    ':' +
                    signature(mi.node || c.entity) +
                    ':' +
                    mi.mask
                );
            });
        });
        shadowParticles(self.app)
            .forEach(function (c) {
                if (
                    c.enabled &&
                    alive(c.entity) &&
                    c.castShadows
                ) {
                    dynamic++;
                }
            });
        staticSignature.sort();
        return {
            receivers: receivers,
            dynamic: dynamic,
            sig: staticSignature.join(';')
        };
    }
    AdvancedGpuInstancer.prototype._lightState =
        function (l) {
            var s = this._lightOriginals.get(l);
            if (!s) {
                s = {
                    l: l,
                    cast: !!l.castShadows,
                    appliedCast: !!l.castShadows,
                    intensity: l.shadowIntensity,
                    mode: l.shadowUpdateMode,
                    overrides: l.shadowUpdateOverrides
                        ? l.shadowUpdateOverrides.slice()
                        : null,
                    policy: 'original',
                    reason: '',
                    stable: 0,
                    key: lightSignature(l),
                    casters: ''
                };
                this._lightOriginals.set(l, s);
            }
            return s;
        };
    AdvancedGpuInstancer.prototype._restoreLight =
        function (s) {
            var l = s.l;
            if (
                l &&
                l.entity &&
                !l.entity._destroyed
            ) {
                l.castShadows = s.cast;
                l.shadowUpdateOverrides = s.overrides
                    ? s.overrides.slice()
                    : null;
                l.shadowUpdateMode = s.mode;
            }
            s.policy = 'original';
            s.stable = 0;
        };
    AdvancedGpuInstancer.prototype._restoreLights =
        function (clear) {
            if (!this._lightOriginals) {
                return;
            }
            this._lightOriginals.forEach(
                function (s) {
                    try {
                        this._restoreLight(s);
                    } catch (e) {
                        console.warn(TAG, e);
                    }
                },
                this
            );
            if (clear !== false) {
                this._lightOriginals.clear();
            }
        };
    function lightNeedsShadow(self, l) {
        var scene = shadowScene(self);
        var casters = [];
        var checked = 0;
        var maxChecks = Math.max(
            1000,
            self.shadowPairBudget || 50000
        );
        if (
            shadowParticles(self.app)
                .some(function (p) {
                    return (
                        p.enabled &&
                        alive(p.entity) &&
                        p.castShadows
                    );
                })
        ) {
            return true;
        }
        if (frameOwner === self && self._frameLightCasters) {
            casters = self._frameLightCasters;
        } else {
            shadowComponents(self.app).forEach(function (c) {
                if (!c || !c.enabled || !alive(c.entity)) return;
                var saved = self._casterOriginals.get(c);
                if (!c.castShadows && (!saved || !saved.cast)) return;
                shadowSources(self, c).forEach(function (x) {
                    if (x.mi && x.mi.mesh && x.mi.castShadow) {
                        casters.push(x);
                    }
                });
            });
            if (frameOwner === self) self._frameLightCasters = casters;
        }
        for (var i = 0; i < scene.receivers.length; i++) {
            var r = scene.receivers[i];
            if (r.c.entity.__giShadowCatcher) {
                continue;
            }
            if (
                !receiverVisible(self, r.mi, l) ||
                !receiverForLight(l, r.baked, r.mi)
            ) {
                continue;
            }
            var rb = sphereOf(r.mi);
            for (var j = 0; j < casters.length; j++) {
                if (++checked > maxChecks) {
                    return true;
                }
                var x = casters[j];
                var mi = x.mi;
                if (mi.skinInstance || mi.morphInstance) {
                    return true;
                }
                if (trivialSelfShadow(x, r)) {
                    continue;
                }
                if (
                    typeof l.mask === 'number' &&
                    typeof mi.mask === 'number' &&
                    !(l.mask & mi.mask)
                ) {
                    continue;
                }
                if (l.type === 'directional') {
                    var current =
                        self._directionalOriginals.get(x.c);
                    var originalMask =
                        current &&
                        current.meshes.find(function (z) {
                            return z.mi === mi;
                        });
                    if (
                        (
                            originalMask
                                ? originalMask.mask
                                : mi.shadowCascadeMask
                        ) === 0
                    ) {
                        continue;
                    }
                }
                var sb = sphereOf(mi);
                if (!lightHitsSphere(l, sb)) {
                    continue;
                }
                if (canShadow(sb, rb, l)) {
                    return true;
                }
            }
        }
        return false;
    }
    function localShadowStatus(self, l) {
        var cameras = (self._cameras || []).filter(
            function (c) {
                return c.enabled && alive(c.entity);
            }
        );
        if (!cameras.length) {
            return {
                visible: true,
                distance: null,
                range: l.range
            };
        }
        var range = Number(l.range);
        if (!(range > 0 && Number.isFinite(range))) {
            return {
                visible: true,
                distance: null,
                range: l.range
            };
        }
        var pos = l.entity.getPosition();
        var sphere = new pc.BoundingSphere(pos, range);
        var visible = cameras.some(function (c) {
            return (
                !c.frustum ||
                c.frustum.containsSphere(sphere) !== 0
            );
        });
        var distance = Math.min.apply(
            null,
            cameras.map(function (c) {
                return c.entity.getPosition().distance(pos);
            })
        );
        return {
            visible: visible,
            distance: distance,
            range: range
        };
    }
    function receiverVisible(self, mi, light) {
        var b = mi && mi.aabb;
        if (!b) {
            return true;
        }
        var cams = (self._cameras || []).filter(
            function (c) {
                return c.enabled && alive(c.entity);
            }
        );
        if (!cams.length) {
            return true;
        }
        return cams.some(function (c) {
            if (
                c.frustum &&
                !c.frustum.containsAabb(b)
            ) {
                return false;
            }
            if (
                light &&
                light.type === 'directional'
            ) {
                var dist = Number(light.shadowDistance);
                if (
                    Number.isFinite(dist) &&
                    dist > 0
                ) {
                    var p = c.entity.getPosition();
                    var ce = b.center;
                    var h = b.halfExtents;
                    var dx = Math.max(
                        0,
                        Math.abs(ce.x - p.x) - h.x
                    );
                    var dy = Math.max(
                        0,
                        Math.abs(ce.y - p.y) - h.y
                    );
                    var dz = Math.max(
                        0,
                        Math.abs(ce.z - p.z) - h.z
                    );
                    if (
                        dx * dx +
                        dy * dy +
                        dz * dz >
                        dist * dist
                    ) {
                        return false;
                    }
                }
            }
            return true;
        });
    }
    function shadowDemand(self, l) {
        if (
            l.type === 'directional' &&
            self._catcherActive &&
            self._nearDynamicCasters &&
            self._nearDynamicCasters.length
        ) {
            return true;
        }
        if (
            l.type !== 'directional' &&
            !localShadowStatus(self, l).visible
        ) {
            return false;
        }
        return lightNeedsShadow(self, l);
    }
    AdvancedGpuInstancer.prototype._reconcileLights =
        function (dt, force) {
            if (
                !this._alive ||
                !this._built ||
                this._baking ||
                (this._probe && !force)
            ) {
                return;
            }
            if (!this.shadowOptimizer) {
                this._restoreLights(true);
                this._shadowReport = [];
                return;
            }
            var report = [];
            var active = new Set();
            this._spotLodReport = [];
            shadowLights(this.app).forEach(
                function (l) {
                    if (
                        !l.enabled ||
                        !alive(l.entity)
                    ) {
                        return;
                    }
                    active.add(l);
                    var s = this._lightState(l);
                    var before = s.policy;
                    if (l.castShadows !== s.appliedCast) {
                        s.cast = !!l.castShadows;
                        s._offVotes = 0;
                    }
                    s.appliedCast = !!l.castShadows;
                    var info = lightParticipants(this, l);
                    var key =
                        lightSignature(l) +
                        '|' +
                        info.sig;
                    var geometryChanged =
                        s._geometryKey !== key;
                    s._geometryKey = key;
                    var local =
                        l.type === 'spot' ||
                        l.type === 'omni';
                    var localState = local
                        ? localShadowStatus(this, l)
                        : null;
                    var demand =
                        s.cast &&
                        shadowDemand(this, l);
                    if (demand) {
                        s._offVotes = 0;
                    } else {
                        s._offVotes =
                            (s._offVotes || 0) + 1;
                    }
                    var off =
                        s.cast &&
                        !demand &&
                        s._offVotes >= 2;
                    if (!demand && !off) {
                        this._pendingOff = true;
                    }
                    var freeze =
                        this.freezeStaticShadows &&
                        s.cast &&
                        local &&
                        !info.dynamic &&
                        s.mode === pc.SHADOWUPDATE_REALTIME;
                    if (off) {
                        l.castShadows = false;
                        s.policy =
                            localState && !localState.visible
                                ? 'fuera-frustum'
                                : 'sin-sombra-visible';
                        s.reason =
                            localState && !localState.visible
                                ? 'Luz fuera de camaras activas'
                                : 'Ningun receptor visible necesita shadow map';
                    } else {
                        if (
                            s.policy === 'fuera-frustum' ||
                            s.policy === 'sin-sombra-visible'
                        ) {
                            l.castShadows = s.cast;
                            l.shadowUpdateMode = s.mode;
                        }
                        if (freeze) {
                            if (
                                geometryChanged ||
                                s.policy !== 'congelada'
                            ) {
                                l.shadowUpdateMode =
                                    pc.SHADOWUPDATE_THISFRAME;
                            }
                            s.policy = 'congelada';
                            s.reason =
                                'Shadow map estatico; actualizar cuando cambie la escena';
                        } else {
                            if (s.policy === 'congelada') {
                                l.shadowUpdateMode = s.mode;
                            }
                            s.policy = 'original';
                            s.reason = demand
                                ? 'Sombras necesarias para geometria visible'
                                : 'Proteccion anti-parpadeo';
                        }
                    }
                    s.appliedCast = !!l.castShadows;
                    if (local) {
                        this._spotLodReport.push({
                            luz: l.entity.name,
                            distanciaCamara:
                                localState.distance,
                            rangeProyecto:
                                localState.range,
                            dentroFrustum:
                                localState.visible,
                            castShadows:
                                l.castShadows,
                            intensidadConfigurada:
                                l.shadowIntensity
                        });
                    }
                    if (
                        this.debug &&
                        s.policy !== before
                    ) {
                        console.log(
                            TAG,
                            'Luz',
                            l.entity.name,
                            before,
                            '->',
                            s.policy,
                            s.reason
                        );
                    }
                    report.push({
                        luz: l.entity.name,
                        bake: !!l.bake,
                        castShadows: !!l.castShadows,
                        update: l.shadowUpdateMode,
                        politica: s.policy,
                        receptoresSinBake: info.receivers,
                        emisoresDinamicos: info.dynamic,
                        motivo: s.reason
                    });
                },
                this
            );
            this._lightOriginals.forEach(
                function (s, l) {
                    if (!active.has(l)) {
                        this._restoreLight(s);
                        this._lightOriginals.delete(l);
                    }
                },
                this
            );
            this._shadowReport = report;
        };
    AdvancedGpuInstancer.prototype.auditShadowOptimizer =
        function () {
            console.log(
                TAG,
                'Luces:',
                this.shadowOptimizer,
                '| Baked casters:',
                normalizedMode(this.smartShadowMode),
                '| AutoLOD:',
                this.autoLod,
                '| DrawCalls:',
                this.app.stats.drawCallCount
            );
            console.table(this._shadowReport || []);
            this.auditBakedCasters();
            this.auditDynamicShadows();
            console.log(
                TAG,
                'Cache CPU:',
                {
                    analisis: this._shadowAnalyses,
                    reutilizaciones: this._shadowCacheHits,
                    transferenciasReceptor:
                        this._catcherTileUpdates
                }
            );
            return this._shadowReport;
        };
    AdvancedGpuInstancer.prototype.auditLights =
        function () {
            return this.auditShadowOptimizer();
        };
    AdvancedGpuInstancer.prototype.setShadowOptimization =
        function (on) {
            if (this._probe) {
                this.cancelShadowProbe();
            }
            this.shadowOptimizer = !!on;
            if (!on) {
                this._restoreLights(true);
            } else {
                this._reconcileLights(1, true);
            }
            return this.auditShadowOptimizer();
        };
    AdvancedGpuInstancer.prototype._endProbe =
        function (reapply) {
            this._shadowCacheKey = null;
            this._casterStateKey = null;
            var p = this._probe;
            if (!p) return;
            this.app.off('frameend', p.handler);
            this._probe = null;
            if (p.kind === 'casters') {
                this._restoreCasters(true);
                if (
                    reapply &&
                    this._alive &&
                    this._built &&
                    !this._baking
                ) {
                    this._applyCasterMode();
                }
            } else {
                this._restoreLights(false);
                if (
                    reapply &&
                    p.lightsEnabled &&
                    this._alive &&
                    this._built &&
                    !this._baking
                ) {
                    this._reconcileLights(1, true);
                }
            }
        };
    AdvancedGpuInstancer.prototype.cancelShadowProbe =
        function () {
            this._endProbe(true);
        };
    AdvancedGpuInstancer.prototype._startProbe =
        function (kind) {
            if (
                this._probe ||
                !this._built ||
                this._baking
            ) {
                console.warn(
                    TAG,
                    'GI ocupado o bake incompleto'
                );
                return;
            }
            if (
                kind === 'lights' &&
                !this.shadowOptimizer
            ) {
                console.warn(
                    TAG,
                    'Activar optimizador de luces'
                );
                return;
            }
            var self = this;
            var p = {
                kind: kind,
                phase: 0,
                frame: 0,
                values: [],
                results: [],
                handler: null,
                lightsEnabled: !!this.shadowOptimizer
            };
            this._probe = p;
            if (kind === 'casters') {
                this._applyCasterMode('original');
            } else {
                this._restoreLights(false);
            }
            p.handler = function () {
                if (self._probe !== p) {
                    return;
                }
                p.frame++;
                if (p.frame > 12) {
                    p.values.push(
                        self.app.stats.drawCallCount
                    );
                }
                if (p.frame < 54) {
                    return;
                }
                p.values.sort(function (a, b) {
                    return a - b;
                });
                p.results.push({
                    modo: p.phase === 0
                        ? 'Original'
                        : kind === 'casters'
                            ? 'Sin casters horneados'
                            : 'Luces optimizadas',
                    drawCalls:
                        p.values[
                        Math.floor(p.values.length / 2)
                        ]
                });
                p.phase++;
                p.frame = 0;
                p.values = [];
                if (p.phase === 1) {
                    if (kind === 'casters') {
                        self._applyCasterMode('optimized');
                    } else {
                        self._reconcileLights(1, true);
                    }
                } else {
                    self._endProbe(true);
                    var baseline = p.results[0].drawCalls;
                    console.table(
                        p.results.map(function (r) {
                            return {
                                modo: r.modo,
                                drawCalls: r.drawCalls,
                                ahorro:
                                    baseline - r.drawCalls
                            };
                        })
                    );
                    console.log(
                        TAG,
                        'Fin prueba A/B ' + kind
                    );
                }
            };
            this.app.on('frameend', p.handler);
            console.log(
                TAG,
                'Prueba A/B iniciada:',
                kind
            );
        };
    AdvancedGpuInstancer.prototype.probeBakedCasterShadows =
        function () {
            this._startProbe('casters');
        };
    AdvancedGpuInstancer.prototype.probeShadowOptimizer =
        function () {
            this._startProbe('lights');
        };
    AdvancedGpuInstancer.prototype.probeRealtimeShadows =
        function () {
            this.probeShadowOptimizer();
        };
    AdvancedGpuInstancer.prototype._destroyCatchers =
        function () {
            if (this._catcher) {
                try {
                    this._catcher.entity.destroy();
                } catch (_) { }
                this._catcher = null;
            }
            if (this._catcherMesh) {
                try {
                    this._catcherMesh.destroy();
                } catch (_) { }
                this._catcherMesh = null;
            }
            if (this._catcherMat) {
                try {
                    this._catcherMat.destroy();
                } catch (_) { }
                this._catcherMat = null;
            }
            this._catcherActive = false;
            this._ground = [];
            this._groundTiles = [];
            this._catcherSelection = '';
            this._catcherSelectedPanels = 0;
            this._catcherSelectedTriangles = 0;
            this._catcherCapacityVertices = 0;
            this._catcherCapacityIndices = 0;
            this._catcherCandidates = [];
            this._groundTriangleCount = 0;
        };
    AdvancedGpuInstancer.prototype._makeCatcherMaterial =
        function () {
            var m = new pc.StandardMaterial();
            m.name = 'GI25_ShadowOnly_Multiply';
            m.shadowCatcher = true;
            m.blendType = pc.BLEND_MULTIPLICATIVE;
            m.cull = pc.CULLFACE_NONE;
            m.depthWrite = false;
            m.depthTest = true;
            m.useSkybox = false;
            m.diffuse.set(0, 0, 0);
            m.specular.set(0, 0, 0);
            m.update();
            return m;
        };
    AdvancedGpuInstancer.prototype._scanGround =
        function () {
            this._ground = [];
            this._groundTiles = [];
            var vertices = [];
            var normals = [];
            var uvs = [];
            var indices = [];
            var bounds = null;
            var components =
                this.app.root.findComponents('render');
            var MAX_TRIANGLES = 12000;
            var tmpA = new pc.Vec3();
            var tmpB = new pc.Vec3();
            var tmpC = new pc.Vec3();
            function emit(a, b, c) {
                var ux = b.x - a.x;
                var uy = b.y - a.y;
                var uz = b.z - a.z;
                var vx = c.x - a.x;
                var vy = c.y - a.y;
                var vz = c.z - a.z;
                var nx = uy * vz - uz * vy;
                var ny = uz * vx - ux * vz;
                var nz = ux * vy - uy * vx;
                var len = Math.hypot(nx, ny, nz);
                if (
                    len < 1e-8 ||
                    Math.abs(ny) / len < 0.94
                ) {
                    return false;
                }
                if (ny < 0) {
                    var swap = b;
                    b = c;
                    c = swap;
                }
                var base = vertices.length / 3;
                [a, b, c].forEach(function (p) {
                    var y = p.y + 0.008;
                    vertices.push(p.x, y, p.z);
                    normals.push(0, 1, 0);
                    uvs.push(p.x * 0.01, p.z * 0.01);
                    bounds = union(bounds, [
                        p.x, y, p.z,
                        p.x, y, p.z
                    ]);
                });
                indices.push(
                    base,
                    base + 1,
                    base + 2
                );
                return true;
            }
            components.forEach(
                function (c) {
                    if (
                        !c.enabled ||
                        !alive(c.entity) ||
                        !c.isStatic ||
                        !c.lightmapped ||
                        c.entity.__giProxy ||
                        c.entity.__giShadowCatcher
                    ) {
                        return;
                    }
                    var floorType =
                        c.type === 'plane' ||
                        /floor|ground|piso|suelo|terreno/i
                            .test(c.entity.name);
                    if (!floorType) {
                        return;
                    }
                    (c.meshInstances || []).forEach(
                        function (mi) {
                            if (
                                indices.length / 3 >=
                                MAX_TRIANGLES ||
                                !mi ||
                                !mi.mesh ||
                                !lm(mi).texture
                            ) {
                                return;
                            }
                            var wb = worldBounds(mi);
                            if (!wb) {
                                return;
                            }
                            if (wb[4] - wb[1] > 0.55) {
                                return;
                            }
                            var matrix =
                                mi.node.getWorldTransform();
                            var sourcePos = [];
                            var sourceIndices = [];
                            var emitted = 0;
                            var initialPos = vertices.length;
                            var initialNorm = normals.length;
                            var initialUv = uvs.length;
                            try {
                                mi.mesh.getPositions(sourcePos);
                                mi.mesh.getIndices(sourceIndices);
                                var count = sourcePos.length / 3;
                                if (!sourceIndices.length) {
                                    for (
                                        var n = 0;
                                        n < count;
                                        n++
                                    ) {
                                        sourceIndices.push(n);
                                    }
                                }
                                for (
                                    var j = 0;
                                    j + 2 < sourceIndices.length &&
                                    indices.length / 3 <
                                    MAX_TRIANGLES;
                                    j += 3
                                ) {
                                    var a = sourceIndices[j];
                                    var b = sourceIndices[j + 1];
                                    var d = sourceIndices[j + 2];
                                    if (
                                        a >= count ||
                                        b >= count ||
                                        d >= count
                                    ) {
                                        continue;
                                    }
                                    matrix.transformPoint(
                                        tmpA.set(
                                            sourcePos[a * 3],
                                            sourcePos[a * 3 + 1],
                                            sourcePos[a * 3 + 2]
                                        ),
                                        tmpA
                                    );
                                    matrix.transformPoint(
                                        tmpB.set(
                                            sourcePos[b * 3],
                                            sourcePos[b * 3 + 1],
                                            sourcePos[b * 3 + 2]
                                        ),
                                        tmpB
                                    );
                                    matrix.transformPoint(
                                        tmpC.set(
                                            sourcePos[d * 3],
                                            sourcePos[d * 3 + 1],
                                            sourcePos[d * 3 + 2]
                                        ),
                                        tmpC
                                    );
                                    if (emit(tmpA, tmpB, tmpC)) {
                                        emitted++;
                                    }
                                }
                            } catch (err) {
                                if (this.debug) {
                                    console.warn(
                                        TAG,
                                        'Panel sin lectura de vertices:',
                                        c.entity.name,
                                        err
                                    );
                                }
                            }
                            if (
                                !emitted &&
                                c.type === 'plane' &&
                                indices.length / 3 + 2 <=
                                MAX_TRIANGLES
                            ) {
                                var wd = matrix.data;
                                var ny = wd[5] / Math.max(
                                    1e-8,
                                    Math.hypot(
                                        wd[4],
                                        wd[5],
                                        wd[6]
                                    )
                                );
                                if (Math.abs(ny) > 0.94) {
                                    var y =
                                        (wb[1] + wb[4]) * 0.5;
                                    var v0 = new pc.Vec3(
                                        wb[0], y, wb[2]
                                    );
                                    var v1 = new pc.Vec3(
                                        wb[3], y, wb[2]
                                    );
                                    var v2 = new pc.Vec3(
                                        wb[3], y, wb[5]
                                    );
                                    var v3 = new pc.Vec3(
                                        wb[0], y, wb[5]
                                    );
                                    emit(v0, v1, v2);
                                    emit(v0, v2, v3);
                                    emitted = 2;
                                }
                            }
                            if (emitted) {
                                var tile = {
                                    b: wb,
                                    y: (wb[1] + wb[4]) * 0.5,
                                    entity: c.entity,
                                    positions:
                                        vertices.slice(initialPos),
                                    normals:
                                        normals.slice(initialNorm),
                                    uvs:
                                        uvs.slice(initialUv)
                                };
                                var nv =
                                    tile.positions.length / 3;
                                if (
                                    !Number.isInteger(nv) ||
                                    nv < 3 ||
                                    tile.normals.length !==
                                    nv * 3 ||
                                    tile.uvs.length !==
                                    nv * 2
                                ) {
                                    console.warn(
                                        TAG,
                                        'Panel descartado: streams inconsistentes:',
                                        c.entity.name
                                    );
                                    vertices.length = initialPos;
                                    normals.length = initialNorm;
                                    uvs.length = initialUv;
                                    indices.length -=
                                        emitted * 3;
                                    return;
                                }
                                tile._giTileId =
                                    this._groundTiles.length;
                                this._ground.push(tile);
                                this._groundTiles.push(tile);
                            }
                        },
                        this
                    );
                },
                this
            );
            return {
                positions: vertices,
                normals: normals,
                uvs: uvs,
                indices: indices,
                bounds: bounds
            };
        };
    AdvancedGpuInstancer.prototype._findDynamicCasters =
        function () {
            var arr = [];
            shadowComponents(this.app).forEach(function (c) {
                if (
                    !c ||
                    !c.enabled ||
                    !alive(c.entity) ||
                    c.isStatic ||
                    c.entity.__giProxy ||
                    c.entity.__giShadowCatcher ||
                    !c.castShadows
                ) {
                    return;
                }
                var bb = null;
                (c.meshInstances || []).forEach(function (mi) {
                    if (
                        mi &&
                        mi.mesh &&
                        mi.visible !== false &&
                        mi.castShadow
                    ) {
                        var b = worldBounds(mi);
                        if (b) {
                            bb = union(bb, b);
                        }
                    }
                });
                if (bb) {
                    arr.push({
                        c: c,
                        b: bb
                    });
                }
            });
            return arr;
        };
    AdvancedGpuInstancer.prototype._createCatchers =
        function () {
            this._destroyCatchers();
            if (!this.dynamicShadowCatcher) {
                return;
            }
            var probe = new pc.StandardMaterial();
            var supported = 'shadowCatcher' in probe;
            probe.destroy();
            if (!supported) {
                console.warn(
                    TAG,
                    'shadowCatcher no disponible'
                );
                return;
            }
            var suns = this.app.root
                .findComponents('light')
                .filter(function (l) {
                    return (
                        l.enabled &&
                        alive(l.entity) &&
                        l.type === 'directional' &&
                        l.castShadows
                    );
                });
            if (!suns.length) {
                return;
            }
            var ground = this._scanGround();
            if (!ground.indices.length) {
                console.warn(
                    TAG,
                    'No se encontraron triangulos de suelo baked horizontales'
                );
                return;
            }
            this._catcherCandidates =
                this._findDynamicCasters();
            var vertexCount =
                ground.positions.length / 3;
            if (
                !Number.isInteger(vertexCount) ||
                ground.normals.length !==
                vertexCount * 3 ||
                ground.uvs.length !==
                vertexCount * 2
            ) {
                console.error(
                    TAG,
                    'Shadow Catcher cancelado: streams inconsistentes'
                );
                return;
            }
            var mesh = null;
            var mat = null;
            var entity = null;
            try {
                mesh = new pc.Mesh(
                    this.app.graphicsDevice
                );
                this._catcherCapacityVertices =
                    vertexCount;
                this._catcherCapacityIndices =
                    ground.indices.length;
                if (typeof mesh.clear === 'function') {
                    mesh.clear(
                        true,
                        true,
                        this._catcherCapacityVertices,
                        this._catcherCapacityIndices
                    );
                }
                mesh.setPositions(ground.positions);
                mesh.setNormals(ground.normals);
                mesh.setUvs(0, ground.uvs);
                mesh.setIndices(ground.indices);
                mesh.update(pc.PRIMITIVE_TRIANGLES);
                mat = this._makeCatcherMaterial();
                entity = new pc.Entity(
                    'GI25_ShadowReceiver_MultiPanel'
                );
                entity.__giShadowCatcher = true;
                this.app.root.addChild(entity);
                var mi = new pc.MeshInstance(
                    mesh,
                    mat,
                    entity
                );
                mi.castShadow = false;
                mi.receiveShadow = true;
                mi.cull = true;
                entity.addComponent('render', {
                    meshInstances: [mi],
                    castShadows: false,
                    receiveShadows: true
                });
                entity.render.isStatic = false;
                entity.render.lightmapped = false;
                this._catcher = {
                    entity: entity,
                    mi: mi,
                    bounds: ground.bounds
                };
                this._catcherSelection = '';
                this._catcherMesh = mesh;
                this._catcherMat = mat;
                this._groundTriangleCount =
                    ground.indices.length / 3;
                if (this.debug) {
                    console.log(
                        TAG,
                        'Receptor unificado:',
                        this._ground.length,
                        'paneles,',
                        this._groundTriangleCount,
                        'triangulos, 1 MeshInstance'
                    );
                }
            } catch (e) {
                console.warn(
                    TAG,
                    'No se pudo crear shadow catcher:',
                    e
                );
                if (entity) {
                    try { entity.destroy(); } catch (_) { }
                }
                if (mesh) {
                    try { mesh.destroy(); } catch (_) { }
                }
                if (mat) {
                    try { mat.destroy(); } catch (_) { }
                }
                this._catcher = null;
                this._catcherMesh = null;
                this._catcherMat = null;
            }
        };
    function projectedRect(bounds, up, groundY) {
        if (!up || up.y <= 0) {
            return null;
        }
        if (groundY > bounds[1]) {
            return null;
        }
        var ax = [bounds[0], bounds[3]];
        var ay = [bounds[1], bounds[4]];
        var az = [bounds[2], bounds[5]];
        var result = [
            Infinity,
            Infinity,
            -Infinity,
            -Infinity
        ];
        for (var i = 0; i < 2; i++) {
            for (var j = 0; j < 2; j++) {
                for (var k = 0; k < 2; k++) {
                    var h =
                        (ay[j] - groundY) / up.y;
                    var x =
                        ax[i] - up.x * h;
                    var z =
                        az[k] - up.z * h;
                    result[0] = Math.min(
                        result[0],
                        x
                    );
                    result[1] = Math.min(
                        result[1],
                        z
                    );
                    result[2] = Math.max(
                        result[2],
                        x
                    );
                    result[3] = Math.max(
                        result[3],
                        z
                    );
                }
            }
        }
        return result;
    }
    function intersectsRect(r, b) {
        return (
            r[0] <= b[3] &&
            r[2] >= b[0] &&
            r[1] <= b[5] &&
            r[3] >= b[2]
        );
    }
    function bboxVisibleInProject(self, b, light) {
        var cams = (self._cameras || []).filter(
            function (c) {
                return c.enabled && alive(c.entity);
            }
        );
        if (!cams.length) {
            return true;
        }
        var aabb = makeAabb(b);
        var dist = Number(light.shadowDistance);
        return cams.some(function (cam) {
            if (
                cam.frustum &&
                !cam.frustum.containsAabb(aabb)
            ) {
                return false;
            }
            if (
                Number.isFinite(dist) &&
                dist > 0
            ) {
                var pos =
                    cam.entity.getPosition();
                var dx = Math.max(
                    0,
                    b[0] - pos.x,
                    pos.x - b[3]
                );
                var dy = Math.max(
                    0,
                    b[1] - pos.y,
                    pos.y - b[4]
                );
                var dz = Math.max(
                    0,
                    b[2] - pos.z,
                    pos.z - b[5]
                );
                return (
                    dx * dx +
                    dy * dy +
                    dz * dz
                ) <= dist * dist;
            }
            return true;
        });
    }
    AdvancedGpuInstancer.prototype._setCatcherTiles =
        function (selected) {
            if (!this._catcher || !this._catcherMesh) {
                return false;
            }
            var key = selected.map(function (t) {
                return t._giTileId;
            }).join('|');
            if (key === this._catcherSelection) {
                return true;
            }
            if (!selected.length) {
                return false;
            }
            var p = [];
            var n = [];
            var u = [];
            var ix = [];
            var aabb = null;
            for (var t = 0; t < selected.length; t++) {
                var tile = selected[t];
                var tp = tile.positions;
                var tn = tile.normals;
                var tu = tile.uvs;
                var count = tp.length / 3;
                if (
                    !Number.isInteger(count) ||
                    count < 3 ||
                    tn.length !== tp.length ||
                    tu.length !== count * 2 ||
                    count % 3 !== 0
                ) {
                    console.warn(
                        TAG,
                        'Overlay descartado: streams inconsistentes:',
                        tile.entity.name,
                        {
                            posiciones: tp.length,
                            normales: tn.length,
                            uv: tu.length
                        }
                    );
                    return false;
                }
                var base = p.length / 3;
                for (var q = 0; q < tp.length; q++) {
                    p.push(tp[q]);
                }
                for (q = 0; q < tn.length; q++) {
                    n.push(tn[q]);
                }
                for (q = 0; q < tu.length; q++) {
                    u.push(tu[q]);
                }
                for (var k = 0; k < count; k++) {
                    ix.push(base + k);
                }
                aabb = union(aabb, tile.b);
            }
            var nv = p.length / 3;
            if (
                !Number.isInteger(nv) ||
                nv < 3 ||
                n.length !== nv * 3 ||
                u.length !== nv * 2 ||
                ix.length !== nv
            ) {
                console.error(
                    TAG,
                    'Overlay: longitudes incorrectas antes de GPU',
                    {
                        posiciones: p.length,
                        normales: n.length,
                        uv: u.length,
                        indices: ix.length
                    }
                );
                return false;
            }
            try {
                this._catcherMesh.setPositions(p);
                this._catcherMesh.setNormals(n);
                this._catcherMesh.setUvs(0, u);
                this._catcherMesh.setIndices(ix);
                this._catcherMesh.update(
                    pc.PRIMITIVE_TRIANGLES
                );
                this._catcher.bounds = aabb;
                this._catcherSelectedTriangles =
                    ix.length / 3;
                this._catcherTileUpdates++;
                this._catcherSelection = key;
                return true;
            } catch (e) {
                console.error(
                    TAG,
                    'Error reconstruyendo Shadow Catcher:',
                    e
                );
                this._catcherSelection = '';
                return false;
            }
        };
    AdvancedGpuInstancer.prototype._updateCatchers =
        function () {
            var catcher = this._catcher;
            if (
                !catcher ||
                !this._alive ||
                this._baking
            ) {
                return;
            }
            var sun = this.app.root
                .findComponents('light')
                .find(function (l) {
                    return (
                        l.enabled &&
                        alive(l.entity) &&
                        l.type === 'directional' &&
                        (
                            l.castShadows ||
                            (
                                this._lightOriginals.get(l) ||
                                {}
                            ).cast
                        )
                    );
                }, this);
            var tiles = this._groundTiles || [];
            var selected = [];
            var casters = [];
            var active = false;
            if (
                sun &&
                this.dynamicShadowCatcher &&
                sun.entity.up &&
                sun.entity.up.y > 0
            ) {
                var up = sun.entity.up;
                var sources =
                    this._findDynamicCasters();
                tiles.forEach(
                    function (tile) {
                        if (
                            !bboxVisibleInProject(
                                this,
                                tile.b,
                                sun
                            )
                        ) {
                            return;
                        }
                        var hit = false;
                        sources.forEach(function (source) {
                            var r = projectedRect(
                                source.b,
                                up,
                                tile.y
                            );
                            if (
                                r &&
                                intersectsRect(r, tile.b)
                            ) {
                                hit = true;
                                if (
                                    casters.indexOf(
                                        source.c.entity.name
                                    ) < 0
                                ) {
                                    casters.push(
                                        source.c.entity.name
                                    );
                                }
                            }
                        });
                        if (hit) {
                            selected.push(tile);
                        }
                    },
                    this
                );
                active = selected.length > 0;
            }
            if (
                active &&
                !this._setCatcherTiles(selected)
            ) {
                active = false;
                selected = [];
                casters = [];
            }
            if (!active) {
                this._catcherSelection = '';
            }
            if (active) {
                this._catcherOffVotes = 0;
            } else {
                this._catcherOffVotes =
                    (this._catcherOffVotes || 0) + 1;
            }
            if (
                active ||
                this._catcherOffVotes >= 2
            ) {
                catcher.entity.enabled = active;
                this._catcherActive = active;
            } else {
                this._pendingOff = true;
            }
            this._nearDynamicCasters = casters;
            this._catcherSelectedPanels =
                selected.length;
        };
    AdvancedGpuInstancer.prototype.auditDynamicShadows =
        function () {
            var rows = [{
                receptor:
                    'GI25_ShadowReceiver_MultiPanel',
                paneles: this._ground.length,
                triangulos:
                    this._catcherSelectedTriangles || 0,
                panelesActivos:
                    this._catcherSelectedPanels || 0,
                actualizacionesGPU:
                    this._catcherTileUpdates || 0,
                drawCallsReceptor:
                    this._catcherActive ? 1 : 0,
                activo: !!this._catcherActive,
                dinamicosEnRango:
                    (
                        this._nearDynamicCasters || []
                    ).join(', ') || '-'
            }];
            console.table(rows);
            console.table(this._spotLodReport || []);
            return rows;
        };
    AdvancedGpuInstancer.prototype._restoreDirectionalMasks =
        function () {
            if (!this._directionalOriginals) {
                return;
            }
            this._directionalOriginals.forEach(
                function (rec, c) {
                    if (
                        !c ||
                        !c.entity ||
                        c.entity._destroyed
                    ) {
                        return;
                    }
                    try {
                        if (rec.component !== undefined) {
                            c.shadowCascadeMask =
                                rec.component;
                        }
                        rec.meshes.forEach(function (x) {
                            if (x.mi) {
                                x.mi.shadowCascadeMask =
                                    x.mask;
                            }
                        });
                    } catch (_) { }
                }
            );
            this._directionalOriginals.clear();
            this._maskedDirectionalCount = 0;
        };
    AdvancedGpuInstancer.prototype._optimizeDirectionalMasks =
        function () {
            if (
                !this._alive ||
                !this._built ||
                this._baking
            ) {
                return;
            }
            var sun = this.app.root
                .findComponents('light')
                .find(function (l) {
                    return (
                        l.enabled &&
                        alive(l.entity) &&
                        l.type === 'directional' &&
                        (
                            l.castShadows ||
                            (
                                this._lightOriginals.get(l) ||
                                {}
                            ).cast
                        )
                    );
                }, this);
            if (!sun) {
                this._restoreDirectionalMasks();
                return;
            }
            var scene = shadowScene(this);
            var dynamics = scene.receivers.filter(
                function (r) {
                    return (
                        !r.baked &&
                        !r.c.entity.__giShadowCatcher
                    );
                }
            );
            var touched = new Set();
            shadowComponents(this.app).forEach(
                function (c) {
                    if (
                        !c ||
                        !c.enabled ||
                        !alive(c.entity) ||
                        !(c.isStatic || c.entity.__giProxy)
                    ) {
                        return;
                    }
                    var miList = (c.meshInstances || [])
                        .filter(function (mi) {
                            return mi && mi.mesh;
                        });
                    if (!miList.length) {
                        return;
                    }
                    if (
                        !miList.some(function (mi) {
                            return baked(c, mi);
                        })
                    ) {
                        return;
                    }
                    var needs = false;
                    var sources =
                        shadowSources(this, c);
                    for (
                        var ri = 0;
                        ri < dynamics.length && !needs;
                        ri++
                    ) {
                        var r = dynamics[ri];
                        var rb = sphereOf(r.mi);
                        if (!rb) {
                            needs = true;
                            break;
                        }
                        if (
                            !receiverVisible(
                                this,
                                r.mi,
                                sun
                            ) ||
                            !receiverForLight(
                                sun,
                                false,
                                r.mi
                            )
                        ) {
                            continue;
                        }
                        for (
                            var si = 0;
                            si < sources.length && !needs;
                            si++
                        ) {
                            var sb =
                                sphereOf(sources[si].mi);
                            if (
                                !sb ||
                                canShadow(sb, rb, sun)
                            ) {
                                needs = true;
                            }
                        }
                    }
                    touched.add(c);
                    var rec =
                        this._directionalOriginals.get(c);
                    if (!needs) {
                        if (!rec) {
                            rec = {
                                component:
                                    c.shadowCascadeMask,
                                meshes: miList.map(function (mi) {
                                    return {
                                        mi: mi,
                                        mask: mi.shadowCascadeMask
                                    };
                                })
                            };
                            this._directionalOriginals.set(
                                c,
                                rec
                            );
                        }
                        c.shadowCascadeMask = 0;
                        miList.forEach(function (mi) {
                            mi.shadowCascadeMask = 0;
                        });
                    } else if (rec) {
                        if (rec.component !== undefined) {
                            c.shadowCascadeMask =
                                rec.component;
                        }
                        rec.meshes.forEach(function (x) {
                            if (x.mi) {
                                x.mi.shadowCascadeMask =
                                    x.mask;
                            }
                        });
                        this._directionalOriginals.delete(c);
                    }
                },
                this
            );
            this._directionalOriginals.forEach(
                function (rec, c) {
                    if (touched.has(c)) {
                        return;
                    }
                    try {
                        if (rec.component !== undefined) {
                            c.shadowCascadeMask =
                                rec.component;
                        }
                        rec.meshes.forEach(function (x) {
                            if (x.mi) {
                                x.mi.shadowCascadeMask =
                                    x.mask;
                            }
                        });
                    } catch (_) { }
                    this._directionalOriginals.delete(c);
                },
                this
            );
            this._maskedDirectionalCount =
                this._directionalOriginals.size;
        };
    AdvancedGpuInstancer.prototype.initialize =
        function () {
            this.lodNearPixels = 90;
            this.lodFarPixels = 30;
            this.collisionRadius = 140;
            this.collisionMargin = 45;
            this.predictionSeconds = 2;
            this.physicsBudget = 50;
            this.smartShadowMode = 'auto';
            this.shadowOptimizer = true;
            this.freezeStaticShadows = true;
            this.shadowPairBudget = 50000;
            this._catcher = null;
            this._ground = [];
            this._catcherMat = null;
            this._catcherMesh = null;
            this._catcherActive = false;
            this._nearDynamicCasters = [];
            this._groundTriangleCount = 0;
            this._directionalOriginals = new Map();
            this._maskedDirectionalCount = 0;
            this._spotLodReport = [];
            this._shadowCacheKey = null;
            this._casterStateKey = null;
            this._casterChangeToken = null;
            this._shadowCacheHits = 0;
            this._shadowAnalyses = 0;
            this._casterCacheHits = 0;
            this._casterAnalyses = 0;
            this._pendingOff = false;
            this._catcherOffVotes = 0;
            this._catcherTileUpdates = 0;
            this._catcherSelectedPanels = 0;
            this._catcherSelectedTriangles = 0;
            this._catcherCapacityVertices = 0;
            this._catcherCapacityIndices = 0;
            this._groups = [];
            this._hidden = [];
            this._physics = [];
            this._physicsGrid = null;
            this._physicsLarge = [];
            this._physicsActive = new Set();
            this._physicsCellSize = 0;
            this._materialCache = new Map();
            this._lods = new Map();
            this._lodQueue = [];
            this._lodJobs = [];
            this._lodWorking = null;
            this._worker = null;
            this._ids = new WeakMap();
            this._id = 0;
            this._casterOriginals = new Map();
            this._casterDisabled = 0;
            this._casterStatus = null;
            this._lastCasterStatus = '';
            this._casterReport = [];
            this._lightOriginals = new Map();
            this._shadowReport = [];
            this._probe = null;
            this._alive = false;
            this._built = false;
            this._baking = false;
            this._clock = 0;
            this._retry = 0;
            this._discovery = 0;
            this._player = null;
            this._cameras = [];
            this._frameComponents = null;
            this._frameLights = null;
            this._frameParticles = null;
            this._frameReceivers = null;
            this._frameLightCasters = null;
            this._workerEpoch = 0;
            this._perf = {
                enabled: false, samples: 0,
                signature: 0, shadows: 0, systems: 0, total: 0,
                catcher: 0, casters: 0, directional: 0, lights: 0
            };
            this._mobileBaseline = null;
            this.stats = {};
            this._groupReport = [];
            this.on(
                'disable',
                this.restore,
                this
            );
            this.on(
                'destroy',
                this.restore,
                this
            );
            this.on(
                'enable',
                function () {
                    if (!this._alive) {
                        this.rebuild();
                    }
                },
                this
            );
            this.rebuild();
        };
    AdvancedGpuInstancer.prototype._discover =
        function () {
            var players =
                this.app.root.findByTag('is-player');
            this._player =
                players.find(function (e) {
                    return alive(e) && e.rigidbody;
                }) ||
                players.find(alive) ||
                null;
            var cams = this.app.root
                .findComponents('camera')
                .filter(function (c) {
                    return (
                        c.enabled &&
                        alive(c.entity)
                    );
                });
            this._cameras = cams.filter(function (c) {
                return !c.renderTarget;
            });
            if (!this._cameras.length) {
                this._cameras = cams;
            }
        };
    AdvancedGpuInstancer.prototype.rebuild =
        function () {
            this.restore();
            this._alive = true;
            this._discover();
            this.stats = {
                staticMeshes: 0,
                instanced: 0,
                groups: 0,
                savedDrawsEstimate: 0,
                minimum: MIN,
                excluded: {},
                colliders: 0,
                lods: 0
            };
            var scan = collect(this);
            if (scan.waiting) {
                if (this.debug) {
                    console.log(
                        TAG,
                        'Esperando',
                        scan.waiting,
                        'lightmaps de PT'
                    );
                }
                return;
            }
            var items = scan.items;
            var size = Math.max(16, this.chunkSize);
            var visual = new Map();
            var groups = new Map();
            var sceneBounds = null;
            if (items.length <= 64) {
                items.forEach(function (x) {
                    sceneBounds = union(sceneBounds, x.bounds);
                });
            }
            var singleZone = items.length <= 64 &&
                (!sceneBounds ||
                    (sceneBounds[3] - sceneBounds[0] <= size &&
                        sceneBounds[5] - sceneBounds[2] <= size));
            items.forEach(
                function (x) {
                    var b = x.bounds;
                    var chunk = singleZone
                        ? 'zona-unica'
                        : (
                            Math.floor(
                                (b[0] + b[3]) / (2 * size)
                            ) +
                            ',' +
                            Math.floor(
                                (b[2] + b[5]) / (2 * size)
                            )
                        );
                    var key = [
                        chunk,
                        oid(this, x.mi.mesh),
                        oid(this, x.mi.material),
                        x.c.lightmapped ? 1 : 0,
                        oid(this, x.lm.texture),
                        oid(this, x.lm.direction)
                    ].join('|');
                    var state = stateKey(this, x);
                    var v = visual.get(key);
                    if (!v) {
                        v = {
                            objeto: x.c.entity.name,
                            candidatos: 0,
                            estados: new Set()
                        };
                        visual.set(key, v);
                    }
                    v.candidatos++;
                    v.estados.add(state);
                    var full = key + '|' + state;
                    var g = groups.get(full);
                    if (!g) {
                        g = {
                            items: [],
                            bounds: null
                        };
                        groups.set(full, g);
                    }
                    g.items.push(x);
                    g.bounds = union(g.bounds, b);
                },
                this
            );
            this._groupReport = [];
            visual.forEach(
                function (v) {
                    if (v.candidatos >= MIN) {
                        this._groupReport.push({
                            objeto: v.objeto,
                            candidatos: v.candidatos,
                            estados: v.estados.size
                        });
                    }
                },
                this
            );
            try {
                var fmt = new pc.VertexFormat(
                    this.app.graphicsDevice,
                    SEM.map(function (s) {
                        return {
                            semantic: s,
                            components: 4,
                            type: pc.TYPE_FLOAT32
                        };
                    })
                );
                groups.forEach(
                    function (g) {
                        if (g.items.length >= MIN) {
                            build(this, g, fmt);
                        }
                    },
                    this
                );
            } catch (e) {
                console.error(
                    TAG,
                    'Instancing:',
                    e
                );
            }
            this._scanPhysics();
            this._built = true;
            this._createCatchers();
            this._updateCatchers();
            this._applyCasterMode();
            this._optimizeDirectionalMasks();
            this._reconcileLights(0, false);
            if (this.debug) {
                console.log(
                    TAG,
                    'Listo:',
                    JSON.stringify(this.stats),
                    'Jugador:',
                    this._player
                        ? this._player.name
                        : 'no detectado',
                    'Camaras:',
                    this._cameras.length,
                    'DrawCalls frame anterior:',
                    this.app.stats.drawCallCount
                );
                console.table(this._groupReport);
                this.auditShadowOptimizer();
            }
            this.app.fire('gi:ready', this);
        };
    AdvancedGpuInstancer.prototype.explainGroups =
        function () {
            console.table(this._groupReport);
            return this._groupReport;
        };
    function hasStaticAncestor(e) {
        for (var p = e; p; p = p.parent) {
            if (p.render && p.render.isStatic) {
                return true;
            }
        }
        return false;
    }
    function ancestor(a, e) {
        for (var p = e; p; p = p.parent) {
            if (p === a) {
                return true;
            }
        }
        return false;
    }
    function collisionBounds(c) {
        var h;
        if (c.type === 'box' && c.halfExtents) {
            h = [
                c.halfExtents.x,
                c.halfExtents.y,
                c.halfExtents.z
            ];
        } else if (c.type === 'sphere') {
            h = [
                c.radius,
                c.radius,
                c.radius
            ];
        } else {
            return null;
        }
        var q = c.angularOffset;
        if (
            q &&
            (
                Math.abs(q.x) +
                Math.abs(q.y) +
                Math.abs(q.z)
            ) > 1e-5
        ) {
            return null;
        }
        var m =
            c.entity.getWorldTransform().data;
        var o = c.linearOffset || {
            x: 0,
            y: 0,
            z: 0
        };
        var x =
            m[12] +
            m[0] * o.x +
            m[4] * o.y +
            m[8] * o.z;
        var y =
            m[13] +
            m[1] * o.x +
            m[5] * o.y +
            m[9] * o.z;
        var z =
            m[14] +
            m[2] * o.x +
            m[6] * o.y +
            m[10] * o.z;
        var r = [
            Math.abs(m[0]) * h[0] +
            Math.abs(m[4]) * h[1] +
            Math.abs(m[8]) * h[2],
            Math.abs(m[1]) * h[0] +
            Math.abs(m[5]) * h[1] +
            Math.abs(m[9]) * h[2],
            Math.abs(m[2]) * h[0] +
            Math.abs(m[6]) * h[1] +
            Math.abs(m[10]) * h[2]
        ];
        return [
            x - r[0],
            y - r[1],
            z - r[2],
            x + r[0],
            y + r[1],
            z + r[2]
        ];
    }
    function segmentBox(a, b, box, r) {
        var lo = 0;
        var hi = 1;
        for (var i = 0; i < 3; i++) {
            var d = b[i] - a[i];
            var mn = box[i] - r;
            var mx = box[i + 3] + r;
            if (Math.abs(d) < 1e-8) {
                if (
                    a[i] < mn ||
                    a[i] > mx
                ) {
                    return false;
                }
            } else {
                var t0 = (mn - a[i]) / d;
                var t1 = (mx - a[i]) / d;
                if (t0 > t1) {
                    var t = t0;
                    t0 = t1;
                    t1 = t;
                }
                lo = Math.max(lo, t0);
                hi = Math.min(hi, t1);
                if (lo > hi) {
                    return false;
                }
            }
        }
        return true;
    }
    function cellKey(x, z) { return x + ':' + z; }
    function indexPhysics(self) {
        var grid = new Map();
        var large = [];
        var cell = Math.max(16, self.collisionRadius + self.collisionMargin);
        self._physics.forEach(function (item) {
            var b = item.b;
            var x0 = Math.floor(b[0] / cell), x1 = Math.floor(b[3] / cell);
            var z0 = Math.floor(b[2] / cell), z1 = Math.floor(b[5] / cell);
            if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) {
                large.push(item);
                return;
            }
            for (var x = x0; x <= x1; x++) {
                for (var z = z0; z <= z1; z++) {
                    var key = cellKey(x, z);
                    var bucket = grid.get(key);
                    if (!bucket) { bucket = []; grid.set(key, bucket); }
                    bucket.push(item);
                }
            }
        });
        self._physicsGrid = grid;
        self._physicsLarge = large;
        self._physicsCellSize = cell;
        self._physicsActive = new Set(self._physics.filter(function (x) {
            return x.on;
        }));
    }
    function nearbyPhysics(self, a, b, r) {
        if (!self._physicsGrid) return self._physics;
        var cell = self._physicsCellSize;
        var x0 = Math.floor((Math.min(a[0], b[0]) - r) / cell);
        var x1 = Math.floor((Math.max(a[0], b[0]) + r) / cell);
        var z0 = Math.floor((Math.min(a[2], b[2]) - r) / cell);
        var z1 = Math.floor((Math.max(a[2], b[2]) + r) / cell);
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
            return self._physics;
        }
        var out = new Set(self._physicsLarge);
        for (var x = x0; x <= x1; x++) {
            for (var z = z0; z <= z1; z++) {
                var list = self._physicsGrid.get(cellKey(x, z));
                if (!list) continue;
                for (var j = 0; j < list.length; j++) out.add(list[j]);
            }
        }
        return out;
    }
    AdvancedGpuInstancer.prototype._scanPhysics = function () {
        (this._physics || []).forEach(function (x) {
            try { x.c.enabled = x.origC; x.rb.enabled = x.origR; }
            catch (_) { }
        });
        this._physics = [];
        this._physicsGrid = null;
        this._physicsLarge = [];
        this._physicsActive = new Set();
        this.stats.colliders = 0;
        if (!this.physicsStreaming || !this._player) return;
        this.app.root.findComponents('collision').forEach(function (c) {
            var e = c.entity, rb = e.rigidbody;
            if (!c.enabled || !alive(e) || !rb || !rb.enabled ||
                rb.type !== pc.BODYTYPE_STATIC || c.isTrigger ||
                !hasStaticAncestor(e) || ancestor(e, this._player) ||
                (e.tags && e.tags.has('no-gi-physics'))) return;
            var b = collisionBounds(c);
            if (!b || Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) > 1024) {
                return;
            }
            this._physics.push({
                c: c, rb: rb, b: b, on: true,
                origC: c.enabled, origR: rb.enabled
            });
        }, this);
        this.stats.colliders = this._physics.length;
        indexPhysics(this);
    };
    AdvancedGpuInstancer.prototype.rebuildPhysics = function () {
        this._discover();
        this._scanPhysics();
        return this.auditPhysicsStreaming();
    };
    AdvancedGpuInstancer.prototype._switchPhysics = function (x, on) {
        if (x.on === on) return;
        if (on) {
            x.c.enabled = x.origC;
            x.rb.enabled = x.origR;
        } else {
            x.rb.enabled = false;
            x.c.enabled = false;
        }
        x.on = on;
        if (this._physicsActive) {
            if (on) this._physicsActive.add(x);
            else this._physicsActive.delete(x);
        }
    };
    AdvancedGpuInstancer.prototype._updatePhysics = function () {
        if (!this.physicsStreaming || !this._player || !this._physics.length) {
            return;
        }
        var p = this._player.getPosition();
        var v = this._player.rigidbody && this._player.rigidbody.linearVelocity;
        var t = Math.max(0, this.predictionSeconds);
        var a = [p.x, p.y, p.z];
        var b = v ? [p.x + v.x * t, p.y + v.y * t, p.z + v.z * t] : a;
        var r = Math.max(10, this.collisionRadius);
        var far = r + Math.max(0, this.collisionMargin);
        var budget = Math.max(1, this.physicsBudget | 0);
        var nearby = nearbyPhysics(this, a, b, r);
        nearby.forEach(function (x) {
            if (!x.on && segmentBox(a, b, x.b, r)) this._switchPhysics(x, true);
        }, this);
        for (var x of this._physicsActive) {
            if (budget <= 0) break;
            if (x.on && !segmentBox(a, b, x.b, far)) {
                this._switchPhysics(x, false);
                budget--;
            }
        }
    };
    AdvancedGpuInstancer.prototype.auditPhysicsStreaming = function () {
        var total = this._physics ? this._physics.length : 0;
        var on = this._physicsActive ? this._physicsActive.size : total;
        var row = {
            colliders: total, activos: on,
            desactivados: total - on,
            desactivadosPct: total ? +((total - on) * 100 / total).toFixed(2) : 0,
            celdas: this._physicsGrid ? this._physicsGrid.size : 0,
            jugador: this._player ? this._player.name : 'no detectado'
        };
        console.table([row]);
        return row;
    };
    AdvancedGpuInstancer.prototype._registerLod =
        function (g) {
            var mesh = g.items[0].mi.mesh;
            var mat = g.items[0].mi.material;
            var lod = this._lods.get(mesh);
            if (!lod) {
                lod = {
                    meshes: [mesh, null, null]
                };
                this._lods.set(mesh, lod);
                if (this.autoLod && !mat.normalMap) {
                    this._lodQueue.push({
                        mesh: mesh,
                        lod: lod
                    });
                }
            }
            g.lod = lod;
        };
    AdvancedGpuInstancer.prototype._prepareLod =
        function () {
            if (
                !this.autoLod ||
                !this._lodQueue.length ||
                typeof Worker === 'undefined'
            ) {
                return;
            }
            var job = this._lodQueue.shift();
            var mesh = job.mesh;
            var p = mesh.primitive;
            if (
                !p ||
                p.length !== 1 ||
                !p[0].indexed ||
                p[0].base !== 0 ||
                p[0].type !== pc.PRIMITIVE_TRIANGLES
            ) {
                return;
            }
            var allowed = [
                pc.SEMANTIC_POSITION,
                pc.SEMANTIC_NORMAL,
                pc.SEMANTIC_TEXCOORD0,
                pc.SEMANTIC_TEXCOORD1
            ];
            if (
                mesh.vertexBuffer.getFormat().elements
                    .some(function (x) {
                        return allowed.indexOf(x.name) < 0;
                    })
            ) {
                return;
            }
            var pos = [];
            var n = [];
            var u = [];
            var v = [];
            var ix = [];
            try {
                mesh.getPositions(pos);
                mesh.getNormals(n);
                mesh.getUvs(0, u);
                mesh.getUvs(1, v);
                mesh.getIndices(ix);
            } catch (_) {
                return;
            }
            if (
                pos.length < 300 ||
                pos.length > 600000 ||
                ix.length < 300 ||
                ix.length % 3 ||
                ix.length !== p[0].count
            ) {
                return;
            }
            this._lodJobs.push({
                lod: job.lod,
                data: {
                    p: pos,
                    n: n,
                    u: u,
                    v: v,
                    ix: ix
                }
            });
            this._startWorker();
        };
    AdvancedGpuInstancer.prototype._startWorker =
        function () {
            if (!this._lodJobs.length) {
                return;
            }
            if (!this._worker) {
                var url;
                try {
                    url = URL.createObjectURL(
                        new Blob(
                            [
                                '(' +
                                lodWorker.toString() +
                                ')();'
                            ],
                            {
                                type: 'text/javascript'
                            }
                        )
                    );
                    this._worker = new Worker(url);
                    var self = this;
                    var epoch = this._workerEpoch;
                    this._worker.onmessage = function (ev) {
                        if (self._workerEpoch !== epoch) return;
                        var job = self._lodWorking;
                        self._lodWorking = null;
                        if (!job || !self._alive) {
                            return;
                        }
                        (ev.data.levels || []).forEach(
                            function (r, i) {
                                if (!r) return;
                                var mesh = null;
                                try {
                                    mesh = new pc.Mesh(
                                        self.app.graphicsDevice
                                    );
                                    mesh.setPositions(r.p);
                                    if (r.n.length) {
                                        mesh.setNormals(r.n);
                                    }
                                    if (r.u.length) {
                                        mesh.setUvs(0, r.u);
                                    }
                                    if (r.v.length) {
                                        mesh.setUvs(1, r.v);
                                    }
                                    mesh.setIndices(r.ix);
                                    mesh.update(pc.PRIMITIVE_TRIANGLES);
                                    job.lod.meshes[i + 1] = mesh;
                                    self.stats.lods++;
                                } catch (e) {
                                    if (mesh) {
                                        try {
                                            mesh.destroy();
                                        } catch (_) { }
                                    }
                                    console.warn(
                                        TAG,
                                        'LOD descartado:',
                                        e
                                    );
                                }
                            }
                        );
                        self._nextWorkerJob();
                    };
                    this._worker.onerror = function (e) {
                        console.warn(
                            TAG,
                            'Worker LOD:',
                            e.message
                        );
                        self._stopWorker();
                    };
                } catch (e) {
                    console.warn(
                        TAG,
                        'No se pudo crear Worker:',
                        e
                    );
                    return;
                } finally {
                    if (url) {
                        URL.revokeObjectURL(url);
                    }
                }
            }
            this._nextWorkerJob();
        };
    AdvancedGpuInstancer.prototype._nextWorkerJob =
        function () {
            if (
                !this._worker ||
                this._lodWorking ||
                !this._lodJobs.length
            ) {
                return;
            }
            this._lodWorking = this._lodJobs.shift();
            try {
                this._worker.postMessage(
                    this._lodWorking.data
                );
            } catch (e) {
                this._lodWorking = null;
                console.warn(TAG, e);
            }
        };
    AdvancedGpuInstancer.prototype._stopWorker =
        function () {
            if (this._worker) {
                this._worker.terminate();
                this._worker = null;
            }
            this._lodQueue = [];
            this._lodJobs = [];
            this._lodWorking = null;
        };
    AdvancedGpuInstancer.prototype._updateLods =
        function () {
            if (
                !this.autoLod ||
                !this._cameras.length
            ) {
                return;
            }
            var device = this.app.graphicsDevice;
            this._groups.forEach(
                function (g) {
                    var lod = g.lod;
                    if (
                        !lod ||
                        (
                            !lod.meshes[1] &&
                            !lod.meshes[2]
                        )
                    ) {
                        return;
                    }
                    var pxMax = 0;
                    this._cameras.forEach(
                        function (cam) {
                            if (
                                !cam.enabled ||
                                !alive(cam.entity)
                            ) {
                                return;
                            }
                            var pos =
                                cam.entity.getPosition();
                            var dist = Math.max(
                                0.1,
                                pos.distance(g.center) -
                                g.radius
                            );
                            var dim = cam.horizontalFov
                                ? device.width
                                : device.height;
                            var px =
                                cam.projection ===
                                    pc.PROJECTION_ORTHOGRAPHIC
                                    ? (
                                        g.radius * dim /
                                        Math.max(
                                            0.01,
                                            cam.orthoHeight * 2
                                        )
                                    )
                                    : (
                                        g.radius * dim /
                                        (
                                            2 * dist *
                                            Math.tan(
                                                Math.max(5, cam.fov) *
                                                Math.PI / 360
                                            )
                                        )
                                    );
                            pxMax = Math.max(pxMax, px);
                        },
                        this
                    );
                    var target =
                        pxMax > this.lodNearPixels
                            ? 0
                            : pxMax > this.lodFarPixels
                                ? 1
                                : 2;
                    while (
                        target > 0 &&
                        !lod.meshes[target]
                    ) {
                        target--;
                    }
                    if (target !== g.current) {
                        g.mi.mesh = lod.meshes[target];
                        g.current = target;
                    }
                },
                this
            );
        };
    function lodWorker() {
        self.onmessage = function (ev) {
            try {
                self.postMessage({
                    levels: [
                        reduce(ev.data, 0.5),
                        reduce(ev.data, 0.24)
                    ]
                });
            } catch (e) {
                self.postMessage({
                    error: String(e)
                });
            }
        };
        function reduce(s, factor) {
            var p = s.p;
            var n = s.n;
            var u = s.u;
            var v = s.v;
            var ix = s.ix;
            var N = p.length / 3;
            var mn = [Infinity, Infinity, Infinity];
            var mx = [-Infinity, -Infinity, -Infinity];
            var i;
            var k;
            for (i = 0; i < N; i++) {
                for (k = 0; k < 3; k++) {
                    mn[k] = Math.min(
                        mn[k],
                        p[3 * i + k]
                    );
                    mx[k] = Math.max(
                        mx[k],
                        p[3 * i + k]
                    );
                }
            }
            var cells = Math.max(
                2,
                Math.ceil(Math.cbrt(N * factor))
            );
            var hn = n.length === N * 3;
            var hu = u.length === N * 2;
            var hv = v.length === N * 2;
            var table = new Map();
            var nodes = [];
            var remap = new Uint32Array(N);
            for (i = 0; i < N; i++) {
                var key = [];
                for (k = 0; k < 3; k++) {
                    key.push(
                        Math.min(
                            cells - 1,
                            Math.floor(
                                (
                                    p[i * 3 + k] -
                                    mn[k]
                                ) /
                                Math.max(
                                    1e-7,
                                    mx[k] - mn[k]
                                ) *
                                cells
                            )
                        )
                    );
                }
                if (hu) {
                    key.push(
                        Math.round(
                            u[i * 2] * cells * 2
                        ),
                        Math.round(
                            u[i * 2 + 1] * cells * 2
                        )
                    );
                }
                if (hv) {
                    key.push(
                        Math.round(
                            v[i * 2] * cells * 2
                        ),
                        Math.round(
                            v[i * 2 + 1] * cells * 2
                        )
                    );
                }
                if (hn) {
                    key.push(
                        Math.round(n[i * 3] * 4),
                        Math.round(n[i * 3 + 1] * 4),
                        Math.round(n[i * 3 + 2] * 4)
                    );
                }
                key = key.join(',');
                var id = table.get(key);
                if (id === undefined) {
                    id = nodes.length;
                    table.set(key, id);
                    nodes.push({
                        p: [0, 0, 0],
                        n: [0, 0, 0],
                        u: [0, 0],
                        v: [0, 0],
                        w: 0
                    });
                }
                remap[i] = id;
                var o = nodes[id];
                o.w++;
                for (k = 0; k < 3; k++) {
                    o.p[k] += p[i * 3 + k];
                    if (hn) {
                        o.n[k] += n[i * 3 + k];
                    }
                }
                if (hu) {
                    o.u[0] += u[i * 2];
                    o.u[1] += u[i * 2 + 1];
                }
                if (hv) {
                    o.v[0] += v[i * 2];
                    o.v[1] += v[i * 2 + 1];
                }
            }
            var inds = [];
            for (i = 0; i < ix.length; i += 3) {
                var a = remap[ix[i]];
                var b = remap[ix[i + 1]];
                var c = remap[ix[i + 2]];
                if (
                    a !== b &&
                    a !== c &&
                    b !== c
                ) {
                    inds.push(a, b, c);
                }
            }
            if (
                inds.length < 3 ||
                inds.length >= ix.length * 0.85 ||
                nodes.length >= N * 0.9
            ) {
                return null;
            }
            var P = [];
            var NN = [];
            var U = [];
            var V = [];
            nodes.forEach(function (o) {
                for (var j = 0; j < 3; j++) {
                    P.push(o.p[j] / o.w);
                }
                if (hn) {
                    var len = Math.hypot(
                        o.n[0],
                        o.n[1],
                        o.n[2]
                    ) || 1;
                    for (j = 0; j < 3; j++) {
                        NN.push(o.n[j] / len);
                    }
                }
                if (hu) {
                    U.push(
                        o.u[0] / o.w,
                        o.u[1] / o.w
                    );
                }
                if (hv) {
                    V.push(
                        o.v[0] / o.w,
                        o.v[1] / o.w
                    );
                }
            });
            return {
                p: P,
                n: NN,
                u: U,
                v: V,
                ix: inds
            };
        }
    }
    AdvancedGpuInstancer.prototype.setBakeMode =
        function (on) {
            on = !!on;
            if (
                !this._alive ||
                this._baking === on
            ) {
                return;
            }
            if (on) {
                this._endProbe(false);
                this._destroyCatchers();
                this._restoreDirectionalMasks();
                this._restoreCasters(true);
                this._restoreLights(true);
            }
            this._baking = on;
            this._groups.forEach(function (g) {
                g.mi.visible = !on;
            });
            this._hidden.forEach(function (h) {
                h.mi.visible = on ? h.visible : false;
            });
            if (!on) {
                this.rebuild();
            }
        };
    AdvancedGpuInstancer.prototype._shadowSignature =
        function () {
            var sig = [];
            var cameraSig = [];
            (this._cameras || []).forEach(function (c) {
                cameraSig.push(
                    'C',
                    c.enabled,
                    signature(c.entity),
                    c.nearClip,
                    c.farClip,
                    c.fov,
                    c.aspectRatio,
                    c.orthoHeight,
                    c.projection
                );
            });
            shadowLights(this.app).forEach(
                function (l) {
                    sig.push(
                        'L',
                        l.enabled,
                        l.entity.enabled,
                        l.castShadows,
                        lightSignature(l),
                        l.bake,
                        l.affectDynamic,
                        l.affectLightmapped,
                        l.shadowIntensity,
                        (
                            this._lightOriginals.get(l) ||
                            {}
                        ).cast === undefined
                            ? l.castShadows
                            : this._lightOriginals.get(l).cast
                    );
                },
                this
            );
            shadowComponents(this.app).forEach(
                function (c) {
                    if (c.entity.__giShadowCatcher) {
                        return;
                    }
                    sig.push(
                        'R',
                        c.entity.guid || c.entity.name,
                        c.enabled,
                        c.entity.enabled,
                        c.isStatic,
                        c.lightmapped,
                        this._casterOriginals.has(c)
                            ? this._casterOriginals.get(c).cast
                            : c.castShadows,
                        c.receiveShadows
                    );
                    if (c.isStatic || c.entity.__giProxy) {
                        return;
                    }
                    (c.meshInstances || []).forEach(
                        function (mi) {
                            var bb = mi && mi.aabb;
                            sig.push(mi.castShadow, mi.receiveShadow, mi.visible);
                            if (bb && bb.center && bb.halfExtents) {
                                var ce = bb.center, he = bb.halfExtents;
                                sig.push(ce.x - he.x, ce.y - he.y, ce.z - he.z,
                                    ce.x + he.x, ce.y + he.y, ce.z + he.z);
                            } else {
                                sig.push('?');
                            }
                        }
                    );
                },
                this
            );
            var sceneKey = sig.join('|');
            this._casterChangeToken = sceneKey;
            return cameraSig.join('|') + '~' + sceneKey;
        };
    AdvancedGpuInstancer.prototype.invalidateShadows =
        function () {
            this._shadowCacheKey = null;
            this._casterStateKey = null;
        };
    function percentLess(a, b) {
        return Number.isFinite(a) && a > 0 && Number.isFinite(b)
            ? +((a - b) * 100 / a).toFixed(2) : null;
    }
    AdvancedGpuInstancer.prototype.auditPerformance = function (enabled) {
        var p = this._perf;
        if (enabled === true) {
            p.samples = p.signature = p.shadows = p.systems = p.total = 0;
            p.catcher = p.casters = p.directional = p.lights = 0;
            p.enabled = true;
        } else if (enabled === false) {
            p.enabled = false;
        }
        var n = Math.max(1, p.samples);
        var report = {
            activo: p.enabled,
            muestras: p.samples,
            firmaMs: +(p.signature / n).toFixed(4),
            sombrasMs: +(p.shadows / n).toFixed(4),
            catcherMs: +(p.catcher / n).toFixed(4),
            castersMs: +(p.casters / n).toFixed(4),
            direccionalesMs: +(p.directional / n).toFixed(4),
            lucesMs: +(p.lights / n).toFixed(4),
            sistemasMs: +(p.systems / n).toFixed(4),
            totalMs: +(p.total / n).toFixed(4),
            drawCallsUltimoFrame: this.app.stats.drawCallCount,
            grupos: this.stats.groups,
            colliders: this.stats.colliders
        };
        console.table([report]);
        return report;
    };
    AdvancedGpuInstancer.prototype.mobileReport = function () {
        var s = this.stats, st = this.app.stats;
        var before = (s.instanced || 0);
        var after = (s.groups || 0);
        var totalP = this._physics ? this._physics.length : 0;
        var activeP = this._physicsActive ? this._physicsActive.size : totalP;
        var analyses = this._shadowAnalyses || 0;
        var hits = this._shadowCacheHits || 0;
        var p = this._perf, n = Math.max(1, p.samples);
        var cpu = p.samples ? p.total / n : null;
        var report = {
            version: 'GI2.5',
            instanciadas: before,
            grupos: after,
            ahorroDrawsTeoricoPct: before ? +((before - after) * 100 / before).toFixed(2) : 0,
            drawCallsMedidas: st.drawCallCount,
            cacheSombrasPct: analyses + hits ? +(hits * 100 / (analyses + hits)).toFixed(2) : 0,
            cacheCastersPct: this._casterAnalyses + this._casterCacheHits
                ? +(this._casterCacheHits * 100 / (this._casterAnalyses + this._casterCacheHits)).toFixed(2) : 0,
            colliders: totalP,
            collidersDesactivadosPct: totalP ? +((totalP - activeP) * 100 / totalP).toFixed(2) : 0,
            tiempoScriptMs: cpu === null ? null : +cpu.toFixed(4),
            presupuesto30FPSConsumidoEnEstaPCPct: cpu === null ? null : +(cpu / 33.333333 * 100).toFixed(3),
            vramEstimadaBytes: Number.isFinite(st.vramTotalBytes) ? st.vramTotalBytes : null,
            dispositivo: 'Medicion local; NO predice FPS en moviles'
        };
        console.table([report]);
        return report;
    };
    AdvancedGpuInstancer.prototype.captureMobileBaseline = function () {
        var st = this.app.stats, p = this._perf;
        var snap = {
            drawCalls: st.drawCallCount,
            cpuUpdateMs: st.cpuUpdateTime,
            cpuRenderMs: st.cpuRenderTime,
            gpuMs: st.gpuFrameTime,
            vramBytes: st.vramTotalBytes,
            giCpuMs: p.samples ? p.total / p.samples : null
        };
        this._mobileBaseline = snap;
        console.table([snap]);
        return snap;
    };
    AdvancedGpuInstancer.prototype.compareMobileBaseline = function (baseline) {
        var a = baseline || this._mobileBaseline;
        if (!a) {
            console.warn(TAG, 'Falta baseline; use captureMobileBaseline()');
            return null;
        }
        var st = this.app.stats, p = this._perf;
        var cpu = p.samples ? p.total / p.samples : null;
        var row = {
            ahorroDrawCallsPct: percentLess(a.drawCalls, st.drawCallCount),
            ahorroCpuUpdatePct: percentLess(a.cpuUpdateMs, st.cpuUpdateTime),
            ahorroCpuRenderPct: percentLess(a.cpuRenderMs, st.cpuRenderTime),
            ahorroGpuPct: percentLess(a.gpuMs, st.gpuFrameTime),
            ahorroVramEstimadaPct: percentLess(a.vramBytes, st.vramTotalBytes),
            ahorroCpuGiPct: percentLess(a.giCpuMs, cpu)
        };
        console.table([row]);
        console.log(TAG, 'Porcentajes medidos en ESTE dispositivo; no son FPS movil.');
        return row;
    };
    AdvancedGpuInstancer.prototype.update = function (dt) {
        if (!this._alive || this._baking) return;
        this._retry += dt;
        this._clock += dt;
        this._discovery += dt;
        if (!this._built) {
            if (this._retry >= 0.75) {
                this._retry = 0;
                this.rebuild();
            }
            return;
        }
        var p = this._perf;
        var measure = p.enabled && typeof performance !== 'undefined';
        var t0 = measure ? performance.now() : 0;
        var t = t0;
        var shadowStart = 0;
        this._frameComponents = shadowComponents(this.app);
        this._frameLights = shadowLights(this.app);
        this._frameParticles = null;
        this._frameReceivers = null;
        this._frameLightCasters = null;
        frameOwner = this;
        try {
            var key = this._shadowSignature();
            var geometryKey = this._casterChangeToken;
            if (measure) {
                p.signature += performance.now() - t;
                t = performance.now();
                shadowStart = t;
            }
            if (key !== this._shadowCacheKey || this._pendingOff) {
                this._pendingOff = false;
                this._updateCatchers();
                if (measure) {
                    p.catcher += performance.now() - t;
                    t = performance.now();
                }
                if (!this._probe) {
                    if (geometryKey !== this._casterStateKey) {
                        this._frameLightCasters = null;
                        this._applyCasterMode();
                        this._casterAnalyses++;
                    } else {
                        this._casterCacheHits++;
                    }
                    if (measure) {
                        p.casters += performance.now() - t;
                        t = performance.now();
                    }
                    this._optimizeDirectionalMasks();
                    if (measure) {
                        p.directional += performance.now() - t;
                        t = performance.now();
                    }
                    this._reconcileLights(dt, false);
                    if (measure) {
                        p.lights += performance.now() - t;
                        t = performance.now();
                    }
                }
                this._shadowAnalyses++;
                this._shadowCacheKey = this._shadowSignature();
                this._casterStateKey = this._casterChangeToken;
            } else {
                this._shadowCacheHits++;
            }
            if (measure) {
                p.shadows += performance.now() - shadowStart;
                t = performance.now();
            }
            if (this._discovery >= 3) {
                this._discovery = 0;
                var oldPlayer = this._player;
                var oldCameras = this._cameras.slice();
                this._discover();
                if (oldPlayer !== this._player) this._scanPhysics();
                if (oldCameras.length !== this._cameras.length ||
                    oldCameras.some(function (c, i) { return c !== this._cameras[i]; }, this)) {
                    this.invalidateShadows();
                }
            }
            if (this._clock >= 0.25) {
                this._clock = 0;
                this._prepareLod();
                this._updateLods();
                this._updatePhysics();
            }
            if (measure) p.systems += performance.now() - t;
        } finally {
            frameOwner = null;
            this._frameComponents = null;
            this._frameLights = null;
            this._frameParticles = null;
            this._frameReceivers = null;
            this._frameLightCasters = null;
            if (measure) { p.total += performance.now() - t0; p.samples++; }
        }
    };
    AdvancedGpuInstancer.prototype.restore =
        function () {
            this._shadowCacheKey = null;
            this._casterStateKey = null;
            this._casterChangeToken = null;
            this._pendingOff = false;
            this._alive = false;
            this._built = false;
            this._baking = false;
            this._endProbe(false);
            this._destroyCatchers();
            this._restoreDirectionalMasks();
            this._restoreCasters(true);
            this._restoreLights(true);
            this._stopWorker();
            (this._hidden || []).forEach(function (h) {
                try {
                    h.mi.visible = h.visible;
                } catch (_) { }
            });
            (this._groups || []).forEach(function (g) {
                try {
                    g.mi.setInstancing(null);
                } catch (_) { }
                try {
                    g.proxy.destroy();
                } catch (_) { }
                try {
                    g.vb.destroy();
                } catch (_) { }
            });
            if (this._materialCache) {
                this._materialCache.forEach(function (mat) {
                    try { mat.destroy(); } catch (_) { }
                });
                this._materialCache.clear();
            }
            (this._physics || []).forEach(function (x) {
                try {
                    x.c.enabled = x.origC;
                    x.rb.enabled = x.origR;
                } catch (_) { }
            });
            if (this._lods) {
                this._lods.forEach(function (l) {
                    for (
                        var i = 1;
                        i < l.meshes.length;
                        i++
                    ) {
                        if (l.meshes[i]) {
                            try {
                                l.meshes[i].destroy();
                            } catch (_) { }
                        }
                    }
                });
            }
            this._groups = [];
            this._hidden = [];
            this._physics = [];
            this._physicsGrid = null;
            this._physicsLarge = [];
            this._physicsActive = new Set();
            this._frameComponents = null;
            this._frameLights = null;
            this._frameParticles = null;
            this._frameReceivers = null;
            this._frameLightCasters = null;
            this._workerEpoch = (this._workerEpoch || 0) + 1;
            if (frameOwner === this) frameOwner = null;
            this._lods = new Map();
            this._ids = new WeakMap();
            this._id = 0;
            this._shadowReport = [];
            this._casterStatus = null;
            this._lastCasterStatus = '';
            this._casterReport = [];
            this._casterDisabled = 0;
            if (this.app) {
                this.app.fire('gi:restored', this);
            }
        };
})();