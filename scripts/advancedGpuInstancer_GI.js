/*
 * AGI3.9 - Advanced GPU Instancer
 * PlayCanvas Engine 2.23.1
 * Compatible con BakePT6.6.0, WebGPU/WebGL2.
 *
 * MEJORAS:
 * - Cache de AABB dinamicos.
 * - Cache independiente de proyeccion de sombras.
 * - Cache de visibilidad de camaras.
 * - Spot shadowDistance controlado por el juego.
 * - Conservacion de sombras baked y realtime.
 * - Sin nuevas distancias de sombras hardcodeadas.
 * - GPU Instancing, AutoLOD y streaming.
 *
 * Classic Script: reemplazar AGI3.8 completo.
 */

var AdvancedGpuInstancer =
    pc.createScript('advancedGpuInstancer');

AdvancedGpuInstancer.attributes.add('chunkSize', {
    type: 'number',
    default: 96,
    min: 16,
    title: 'Tamano de celda'
});

AdvancedGpuInstancer.attributes.add('autoLod', {
    type: 'boolean',
    default: true,
    title: 'AutoLOD'
});

AdvancedGpuInstancer.attributes.add('physicsStreaming', {
    type: 'boolean',
    default: true,
    title: 'Fisica predictiva'
});

AdvancedGpuInstancer.attributes.add('dynamicShadowCatcher', {
    type: 'boolean',
    default: true,
    title: 'Sombras dinamicas sobre PT'
});

AdvancedGpuInstancer.attributes.add('debug', {
    type: 'boolean',
    default: true,
    title: 'Diagnosticos'
});

(function () {
    'use strict';

    var TAG = '[AGI3.9]';

    var SEM = [
        pc.SEMANTIC_ATTR11,
        pc.SEMANTIC_ATTR12,
        pc.SEMANTIC_ATTR13,
        pc.SEMANTIC_ATTR14
    ];

    var GLSL =
        'attribute vec4 aAgi0;\n' +
        'attribute vec4 aAgi1;\n' +
        'attribute vec4 aAgi2;\n' +
        'attribute vec4 aAgiRect;\n' +
        'mat4 getModelMatrix(){return mat4(' +
        'vec4(aAgi0.xyz,0.),' +
        'vec4(aAgi1.xyz,0.),' +
        'vec4(aAgi2.xyz,0.),' +
        'vec4(aAgi0.w,aAgi1.w,aAgi2.w,1.));}';

    var WGSL =
        'attribute aAgi0: vec4f;\n' +
        'attribute aAgi1: vec4f;\n' +
        'attribute aAgi2: vec4f;\n' +
        'attribute aAgiRect: vec4f;\n' +
        'fn getModelMatrix() -> mat4x4f {' +
        'return mat4x4f(' +
        'vec4f(aAgi0.xyz,0.),' +
        'vec4f(aAgi1.xyz,0.),' +
        'vec4f(aAgi2.xyz,0.),' +
        'vec4f(aAgi0.w,aAgi1.w,aAgi2.w,1.));}';

    var UVG =
        '\n#if defined(INSTANCING) && defined(UV1_UNMODIFIED)\n' +
        'vUv1=vUv1*aAgiRect.zw+aAgiRect.xy;\n' +
        '#endif\n';

    var UVW =
        '\n#if defined(INSTANCING) && defined(UV1_UNMODIFIED)\n' +
        'output.vUv1=output.vUv1*aAgiRect.zw+aAgiRect.xy;\n' +
        '#endif\n';

    function live(e) {
        return !!(e && e.enabled && !e._destroyed);
    }

    function tag(e, n) {
        return !!(e && e.tags && e.tags.has(n));
    }

    function clamp(x, a, b) {
        return Math.min(b, Math.max(a, x));
    }

    function pct(x, n) {
        return n ? +(100 * x / n).toFixed(2) : 0;
    }

    function median(a, p) {
        if (!a.length) return null;

        var b = a.slice().sort(function (x, y) {
            return x - y;
        });

        return +b[
            Math.floor((b.length - 1) * p)
        ].toFixed(4);
    }

    function objId(s, o) {
        if (!o) return 0;

        var n = s._ids.get(o);

        if (!n) {
            n = ++s._id;
            s._ids.set(o, n);
        }

        return n;
    }

    function param(mi, n) {
        var p = mi.getParameter
            ? mi.getParameter(n)
            : null;

        return p && p.data !== undefined
            ? p.data
            : p;
    }

    function lmOf(mi) {
        var names =
            pc.MeshInstance.lightmapParamNames ||
            ['instance_lightMap', 'texture_dirLightMap'];

        return {
            name: names[0],
            dn: names[1],
            tex: param(mi, names[0]) ||
                param(mi, 'instance_lightMap'),
            dir: param(mi, names[1]),
            rect: param(mi, 'uPT6LmRect')
        };
    }

    function bounds(mi) {
        var b = mi && mi.aabb;
        if (!b) return null;

        var c = b.center;
        var h = b.halfExtents;

        return [
            c.x - h.x,
            c.y - h.y,
            c.z - h.z,
            c.x + h.x,
            c.y + h.y,
            c.z + h.z
        ];
    }

    function joinBox(a, b) {
        if (!b) return a;
        if (!a) return b.slice();

        for (var i = 0; i < 3; i++) {
            a[i] = Math.min(a[i], b[i]);
            a[i + 3] = Math.max(a[i + 3], b[i + 3]);
        }

        return a;
    }

    function box3(a) {
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

    function boxDist2(b, p) {
        var x = Math.max(0, b[0] - p.x, p.x - b[3]);
        var y = Math.max(0, b[1] - p.y, p.y - b[4]);
        var z = Math.max(0, b[2] - p.z, p.z - b[5]);

        return x * x + y * y + z * z;
    }

    function cams(s) {
        return (s._cameras || []).filter(function (c) {
            return c.enabled && live(c.entity);
        });
    }

    function floorSource(c) {
        return !!(
            c &&
            c.isStatic &&
            c.lightmapped &&
            (
                c.type === 'plane' ||
                /floor|ground|suelo|piso|terreno|^plane|quad/i
                    .test(c.entity.name)
            )
        );
    }

    // =====================================================
    // AGI3.9 - CACHE DE MATRICES SIN ASIGNACIONES POR FRAME
    // =====================================================

    var AGI39_MAT = [
        0, 1, 2,
        4, 5, 6,
        8, 9, 10,
        12, 13, 14
    ];

    function matrixChanged(rec, node) {
        if (!node || node._destroyed) return true;

        var m = node.getWorldTransform().data;
        var last = rec.mat;
        var dirty = !last;

        if (!last) {
            last = rec.mat = new Float64Array(12);
        }

        for (var i = 0; i < 12; i++) {
            var v = m[AGI39_MAT[i]];

            if (last[i] !== v) {
                dirty = true;
                last[i] = v;
            }
        }

        return dirty;
    }

    function sameRefs(a, b) {
        if (!a || a.length !== b.length) return false;

        for (var i = 0; i < b.length; i++) {
            if (a[i] !== b[i]) return false;
        }

        return true;
    }

    // =====================================================
    // GPU INSTANCING
    // =====================================================

    function chooseMi(c, mi) {
        if (
            !c ||
            !c.enabled ||
            !live(c.entity) ||
            !c.isStatic ||
            tag(c.entity, 'agi-no-instance') ||
            c.entity.__agiProxy ||
            c.entity.__agiCatcher ||
            c.batchGroupId >= 0
        ) {
            return 'no estatico';
        }

        if (
            !mi ||
            !mi.mesh ||
            !mi.mesh.vertexBuffer ||
            !mi.material ||
            !mi.node ||
            !mi.visible ||
            mi.skinInstance ||
            mi.morphInstance ||
            mi.instancingData ||
            mi.calculateSortDistance
        ) {
            return 'malla especial';
        }

        if (
            !(mi.material instanceof pc.StandardMaterial) ||
            mi.material.blendType !== pc.BLEND_NONE ||
            mi.flipFacesFactor !== 1
        ) {
            return 'material especial';
        }

        var pr = mi.mesh.primitive;

        if (
            !pr ||
            pr.length !== 1 ||
            pr[0].type !== pc.PRIMITIVE_TRIANGLES
        ) {
            return 'topologia';
        }

        if (
            mi.mesh.vertexBuffer.getFormat()
                .elements.some(function (e) {
                    return SEM.indexOf(e.name) >= 0;
                })
        ) {
            return 'atributos ocupados';
        }

        var lm = lmOf(mi);

        if (
            c.lightmapped &&
            (
                !lm.tex ||
                !lm.rect ||
                lm.rect.length !== 4 ||
                lm.rect[2] <= 0 ||
                lm.rect[3] <= 0
            )
        ) {
            return 'esperando PT';
        }

        if (!c.lightmapped && lm.tex) {
            return 'lightmap no marcado';
        }

        var extra = false;

        if (mi.parameters && mi.parameters.forEach) {
            mi.parameters.forEach(function (v, n) {
                if (
                    n !== lm.name &&
                    n !== lm.dn &&
                    n !== 'uPT6LmRect'
                ) {
                    extra = true;
                }
            });
        }

        return extra ? 'parametros propios' : '';
    }

    function signature(x) {
        var m = x.mi;
        var c = x.c;

        return [
            c.layers.join(','),
            m.mask,
            m.renderStyle,
            m.shaderPassMask,
            m.castShadow,
            c.castShadows,
            m.receiveShadow,
            m.shadowCascadeMask,
            m.drawOrder,
            m.drawBucket
        ].join('|');
    }

    function materialClone(s, src) {
        if (s._materials.has(src)) {
            return s._materials.get(src);
        }

        var m = src.clone();

        m.name = (src.name || 'Material') + '_AGI39';
        m.shaderChunksVersion = '2.23';

        [
            [pc.SHADERLANGUAGE_GLSL, GLSL, UVG],
            [pc.SHADERLANGUAGE_WGSL, WGSL, UVW]
        ].forEach(function (v) {
            var ch = m.getShaderChunks(v[0]);

            ch.set('transformInstancingVS', v[1]);

            ch.set(
                'litUserMainEndVS',
                (ch.get('litUserMainEndVS') || '') + v[2]
            );
        });

        [
            'aAgi0',
            'aAgi1',
            'aAgi2',
            'aAgiRect'
        ].forEach(function (n, i) {
            m.setAttribute(n, SEM[i]);
        });

        m.update();

        s._materials.set(src, m);

        return m;
    }

    function instanceData(g) {
        var a = new Float32Array(g.items.length * 16);

        g.items.forEach(function (x, i) {
            var m = x.mi.node.getWorldTransform().data;
            var j = i * 16;

            a.set([
                m[0], m[1], m[2], m[12],
                m[4], m[5], m[6], m[13],
                m[8], m[9], m[10], m[14]
            ], j);

            a.set(
                x.lm.rect || [0, 0, 1, 1],
                j + 12
            );
        });

        return a;
    }

    function addGroup(s, g) {
        var src = g.items[0];
        var proxy = null;
        var vb = null;

        try {
            g.data = instanceData(g);
            g.bytes = g.data.byteLength;

            proxy = new pc.Entity(
                'AGI_Cell_' + g.cell + '_' + s.groups.length
            );

            proxy.__agiProxy = true;
            s.app.root.addChild(proxy);

            var mi = new pc.MeshInstance(
                src.mi.mesh,
                materialClone(s, src.mi.material),
                proxy
            );

            mi.castShadow = src.mi.castShadow;
            mi.receiveShadow = src.mi.receiveShadow;
            mi.shadowCascadeMask = src.mi.shadowCascadeMask;
            mi.mask = src.mi.mask;
            mi.shaderPassMask = src.mi.shaderPassMask;
            mi.renderStyle = src.mi.renderStyle;
            mi.drawOrder = src.mi.drawOrder;
            mi.drawBucket = src.mi.drawBucket;

            vb = new pc.VertexBuffer(
                s.app.graphicsDevice,
                s._format,
                g.items.length,
                { data: g.data }
            );

            mi.setInstancing(vb, true);

            proxy.addComponent('render', {
                meshInstances: [mi],
                layers: src.c.layers.slice()
            });

            proxy.render.isStatic = true;
            proxy.render.lightmapped = src.c.lightmapped;
            proxy.render.castShadows = src.c.castShadows;
            proxy.render.receiveShadows = src.c.receiveShadows;

            if (src.c.lightmapped) {
                mi.setRealtimeLightmap(
                    src.lm.name,
                    src.lm.tex
                );

                if (src.lm.dir) {
                    mi.setRealtimeLightmap(
                        src.lm.dn,
                        src.lm.dir
                    );
                }

                mi.setParameter(
                    'uPT6LmRect',
                    [0, 0, 1, 1]
                );
            }

            if (
                typeof mi._updateShaderDefs === 'function' &&
                typeof src.mi._shaderDefs === 'number'
            ) {
                mi._updateShaderDefs(
                    src.mi._shaderDefs |
                    (mi._shaderDefs & ~src.mi._shaderDefs)
                );
            }

            g.box = box3(g.b);

            proxy.render.customAabb = g.box;
            mi.aabb = g.box;

            g.proxy = proxy;
            g.mi = mi;
            g.vb = vb;
            g.mesh = src.mi.mesh;
            g.loaded = true;
            g.idle = 0;
            g.lod = 0;

            g.castsShadow = !!(
                mi.castShadow &&
                proxy.render.castShadows
            );

            s.groups.push(g);

            g.items.forEach(function (x) {
                s._hidden.push({
                    mi: x.mi,
                    visible: x.mi.visible
                });

                x.mi.visible = false;
            });

            s.stats.instances += g.items.length;
            s.stats.groups++;
            s.stats.instanceBytes += g.bytes;

            return true;

        } catch (e) {
            console.warn(
                TAG,
                'Grupo omitido:',
                g.cell,
                e
            );

            if (proxy) {
                try { proxy.destroy(); } catch (_) { }
            }

            if (vb) {
                try { vb.destroy(); } catch (_) { }
            }

            return false;
        }
    }

    function unload(s, g) {
        if (!g.loaded) return;

        g.mi.visible = false;

        try {
            g.mi.setInstancing(null);
        } catch (_) { }

        if (g.vb) {
            try { g.vb.destroy(); } catch (_) { }
        }

        g.vb = null;
        g.loaded = false;

        s.stats.vbUnloads++;
    }

    function reload(s, g) {
        if (g.loaded) return;

        var vb;

        try {
            vb = new pc.VertexBuffer(
                s.app.graphicsDevice,
                s._format,
                g.items.length,
                { data: g.data }
            );

            g.mi.setInstancing(vb, true);
            g.mi.visible = true;

            g.vb = vb;
            g.loaded = true;

            s.stats.vbUploads++;

        } catch (e) {
            if (vb) {
                try { vb.destroy(); } catch (_) { }
            }

            console.warn(TAG, 'Recarga GPU', e);
        }
    }

    // =====================================================
    // INFLUENCIA LOCAL DE LUCES
    // =====================================================

    function affects(l, b) {
        if (!b || !l || !l.entity) return true;

        var p = l.entity.getPosition();

        var x = (b[0] + b[3]) / 2 - p.x;
        var y = (b[1] + b[4]) / 2 - p.y;
        var z = (b[2] + b[5]) / 2 - p.z;

        var radius = Math.hypot(
            b[3] - b[0],
            b[4] - b[1],
            b[5] - b[2]
        ) / 2;

        var d = Math.sqrt(x * x + y * y + z * z);
        var range = +l.range;

        if (
            Number.isFinite(range) &&
            range >= 0 &&
            d > range + radius
        ) {
            return false;
        }

        if (
            l.type !== 'spot' ||
            d <= radius ||
            d <= 1e-5
        ) {
            return true;
        }

        var dir = l.entity.up;

        if (!dir) return true;

        var angle = (
            Number.isFinite(+l.outerConeAngle)
                ? +l.outerConeAngle
                : 45
        ) * Math.PI / 180 +
            Math.asin(Math.min(1, radius / d));

        return -(
            x * dir.x +
            y * dir.y +
            z * dir.z
        ) / d >=
            Math.cos(Math.min(Math.PI, angle)) - 0.01;
    }

    function actualLocalCasterLight(s, l) {
        var state = s._spotStates.get(l);

        return state
            ? state.original
            : !!l.castShadows;
    }

    function keepBakedCaster(s, c, original) {
        if (
            tag(c.entity, 'agi-baked-only') ||
            tag(c.entity, 'agi-no-realtime-shadow')
        ) {
            return false;
        }

        if (
            tag(c.entity, 'agi-spot-caster') ||
            tag(c.entity, 'agi-keep-realtime-shadows')
        ) {
            return true;
        }

        if (floorSource(c)) return false;

        if (c.entity.__agiProxy) {
            var g = s.groups.find(function (g) {
                return g.proxy === c.entity;
            });

            if (
                g &&
                g.items.length &&
                g.items.every(function (x) {
                    return floorSource(x.c);
                })
            ) {
                return false;
            }
        }

        return s._watchLights.some(function (l) {
            return (
                l.enabled &&
                live(l.entity) &&
                (
                    l.type === 'spot' ||
                    l.type === 'omni'
                ) &&
                actualLocalCasterLight(s, l) &&
                original.mesh.some(function (q) {
                    return (
                        q.cast &&
                        affects(l, bounds(q.mi))
                    );
                })
            );
        });
    }

    // =====================================================
    // RESTAURACION DE CASTERS
    // =====================================================

    AdvancedGpuInstancer.prototype._restoreCasters =
        function () {
            this._castersOriginal.forEach(function (orig, c) {
                if (
                    !c ||
                    !c.entity ||
                    c.entity._destroyed
                ) {
                    return;
                }

                try {
                    c.castShadows = orig.cast;

                    if (
                        orig.compMask !== undefined &&
                        'shadowCascadeMask' in c
                    ) {
                        c.shadowCascadeMask = orig.compMask;
                    }

                    orig.mesh.forEach(function (q) {
                        q.mi.castShadow = q.cast;
                        q.mi.shadowCascadeMask = q.mask;
                    });

                } catch (e) {
                    console.warn(TAG, 'Restauracion caster', e);
                }
            });

            this._castersOriginal.clear();
        };

    // =====================================================
    // SEPARACION DE SOMBRAS BAKED / REALTIME
    // =====================================================

    AdvancedGpuInstancer.prototype._updateCasters =
        function () {
            var s = this;
            var seen = new Set();

            var noLocal = 0;
            var retained = 0;
            var dirExcluded = 0;

            this.app.root.findComponents('render')
                .forEach(function (c) {
                    if (
                        !c.enabled ||
                        !live(c.entity) ||
                        c.entity.__agiCatcher ||
                        !c.isStatic ||
                        !c.lightmapped
                    ) {
                        return;
                    }

                    var meshes = c.meshInstances || [];

                    if (!meshes.some(function (mi) {
                        return mi && lmOf(mi).tex;
                    })) {
                        return;
                    }

                    seen.add(c);

                    var orig = s._castersOriginal.get(c);

                    if (!orig) {
                        orig = {
                            cast: !!c.castShadows,
                            compMask: c.shadowCascadeMask,
                            mesh: meshes.map(function (mi) {
                                return {
                                    mi: mi,
                                    cast: !!mi.castShadow,
                                    mask: mi.shadowCascadeMask
                                };
                            })
                        };

                        s._castersOriginal.set(c, orig);
                    }

                    if (!orig.cast) return;

                    var keep = keepBakedCaster(s, c, orig);

                    c.castShadows = keep;

                    if ('shadowCascadeMask' in c) {
                        c.shadowCascadeMask = 0;
                    }

                    orig.mesh.forEach(function (q) {
                        q.mi.castShadow = !!(
                            keep && q.cast
                        );

                        q.mi.shadowCascadeMask = 0;
                    });

                    dirExcluded++;

                    if (keep) {
                        retained++;
                    } else {
                        noLocal++;
                    }
                });

            this._castersOriginal.forEach(function (orig, c) {
                if (seen.has(c)) return;

                if (c.entity && !c.entity._destroyed) {
                    try {
                        c.castShadows = orig.cast;

                        if (
                            orig.compMask !== undefined &&
                            'shadowCascadeMask' in c
                        ) {
                            c.shadowCascadeMask = orig.compMask;
                        }

                        orig.mesh.forEach(function (q) {
                            q.mi.castShadow = q.cast;
                            q.mi.shadowCascadeMask = q.mask;
                        });

                    } catch (_) { }
                }

                s._castersOriginal.delete(c);
            });

            this.stats.bakedCastersDisabled = noLocal;
            this.stats.bakedSpotRetained = retained;
            this.stats.bakedDirectionalExcluded = dirExcluded;

            this.groups.forEach(function (g) {
                g.castsShadow = !!(
                    g.mi &&
                    g.proxy &&
                    g.proxy.render &&
                    g.mi.castShadow &&
                    g.proxy.render.castShadows
                );
            });
        };

    // =====================================================
    // SPOT SHADOW DISTANCE DEL JUEGO
    // =====================================================

    AdvancedGpuInstancer.prototype._restoreSpotShadows =
        function () {
            if (!this._spotStates) return;

            this._spotStates.forEach(function (st, l) {
                if (
                    !l ||
                    !l.entity ||
                    l.entity._destroyed
                ) {
                    return;
                }

                if (st.suspended) {
                    try {
                        l.castShadows = st.original;
                    } catch (e) {
                        console.warn(TAG, 'Spot restore', e);
                    }
                }
            });

            this._spotStates.clear();
            this.stats.spotSuspended = 0;
        };

    AdvancedGpuInstancer.prototype._updateSpotShadows =
        function () {
            if (
                !this._spotStates ||
                !this.optimizeBakedCasters
            ) {
                return;
            }

            var lights = this._spotLights || [];
            var cameras = this._cameras || [];

            var stopped = 0;
            var routingChanged = false;

            for (var i = 0; i < lights.length; i++) {
                var l = lights[i];

                if (
                    !l ||
                    !l.entity ||
                    l.entity._destroyed
                ) {
                    continue;
                }

                var st = this._spotStates.get(l);

                if (!st) {
                    st = {
                        original: !!l.castShadows,
                        suspended: false
                    };

                    this._spotStates.set(l, st);
                }

                if (
                    !st.suspended &&
                    !!l.castShadows !== st.original
                ) {
                    st.original = !!l.castShadows;
                    routingChanged = true;
                }

                if (
                    st.suspended &&
                    l.castShadows === true
                ) {
                    st.original = true;
                    st.suspended = false;
                    routingChanged = true;
                }

                if (
                    !l.enabled ||
                    !live(l.entity) ||
                    !st.original
                ) {
                    if (st.suspended) {
                        l.castShadows = st.original;
                        st.suspended = false;
                    }

                    continue;
                }

                var distance = +l.shadowDistance;

                if (
                    !Number.isFinite(distance) ||
                    distance < 0 ||
                    !cameras.length
                ) {
                    if (st.suspended) {
                        l.castShadows = st.original;
                        st.suspended = false;
                        this.stats.spotDistanceTransitions++;
                    }

                    continue;
                }

                var m = l.entity.getWorldTransform().data;
                var r2 = distance * distance;
                var near = false;
                var activeCameras = 0;

                for (var j = 0; j < cameras.length; j++) {
                    var c = cameras[j];

                    if (
                        !c.enabled ||
                        !live(c.entity)
                    ) {
                        continue;
                    }

                    activeCameras++;

                    var cm = c.entity.getWorldTransform().data;

                    var dx = cm[12] - m[12];
                    var dy = cm[13] - m[13];
                    var dz = cm[14] - m[14];

                    if (
                        dx * dx + dy * dy + dz * dz <= r2
                    ) {
                        near = true;
                        break;
                    }
                }

                if (activeCameras === 0) {
                    near = true;
                }

                if (!near) {
                    if (!st.suspended) {
                        l.castShadows = false;
                        st.suspended = true;

                        this.stats.spotDistanceTransitions++;
                    }

                    stopped++;

                } else if (st.suspended) {
                    l.castShadows = st.original;
                    st.suspended = false;

                    this.stats.spotDistanceTransitions++;
                }
            }

            this.stats.spotSuspended = stopped;

            if (routingChanged) {
                this._castersDirty = true;
            }
        };

    // =====================================================
    // CACHE DE CONFIGURACION DE LUCES LOCALES
    // =====================================================

    AdvancedGpuInstancer.prototype._localCasterConfigChanged =
        function () {
            var lights = this._localLights || [];
            var changed = false;

            for (var i = 0; i < lights.length; i++) {
                var l = lights[i];

                if (
                    !l.entity ||
                    l.entity._destroyed
                ) {
                    continue;
                }

                var rec = this._localCasterWatch.get(l);

                if (!rec) {
                    rec = {};
                    this._localCasterWatch.set(l, rec);
                    changed = true;
                }

                var caster = actualLocalCasterLight(this, l);

                if (
                    rec.type !== l.type ||
                    rec.enabled !== l.enabled ||
                    rec.entityEnabled !== l.entity.enabled ||
                    rec.caster !== caster ||
                    rec.range !== l.range ||
                    rec.cone !== l.outerConeAngle ||
                    rec.mask !== l.mask
                ) {
                    rec.type = l.type;
                    rec.enabled = l.enabled;
                    rec.entityEnabled = l.entity.enabled;
                    rec.caster = caster;
                    rec.range = l.range;
                    rec.cone = l.outerConeAngle;
                    rec.mask = l.mask;

                    changed = true;
                }

                if (matrixChanged(rec, l.entity)) {
                    changed = true;
                }
            }

            return changed;
        };

    // =====================================================
    // STREAMING VISUAL
    // =====================================================

    function groupCastsToLocal(s, g) {
        if (!g.castsShadow) return false;

        return s._watchLights.some(function (l) {
            return (
                l.enabled &&
                live(l.entity) &&
                (
                    l.type === 'spot' ||
                    l.type === 'omni'
                ) &&
                actualLocalCasterLight(s, l) &&
                affects(l, g.b)
            );
        });
    }

    function groupDirectionalRelevant(s, g) {
        return !!(
            g.castsShadow &&
            g.mi.shadowCascadeMask !== 0 &&
            s._watchLights.some(function (l) {
                return (
                    l.enabled &&
                    live(l.entity) &&
                    l.type === 'directional' &&
                    l.castShadows
                );
            })
        );
    }

    AdvancedGpuInstancer.prototype._streamGraphics =
        function (dt) {
            var cameraList = cams(this);
            var loading = [];
            var removing = [];

            this.groups.forEach(function (g) {
                var needed = !cameraList.length;
                var best = Infinity;

                cameraList.forEach(function (c) {
                    var p = c.entity.getPosition();
                    var d2 = boxDist2(g.b, p);

                    best = Math.min(best, d2);

                    var far = +c.farClip;

                    var inside =
                        !c.frustumCulling ||
                        !c.frustum ||
                        c.frustum.containsAabb(g.box);

                    if (
                        inside &&
                        (
                            !Number.isFinite(far) ||
                            far <= 0 ||
                            d2 <= far * far
                        )
                    ) {
                        needed = true;
                    }
                });

                if (
                    !needed &&
                    (
                        groupDirectionalRelevant(this, g) ||
                        groupCastsToLocal(this, g)
                    )
                ) {
                    needed = true;
                }

                if (needed) {
                    g.idle = 0;

                    if (!g.loaded) {
                        loading.push({
                            g: g,
                            d: best
                        });
                    }

                } else {
                    g.idle += dt;

                    if (
                        g.loaded &&
                        g.idle > this.unloadDelay
                    ) {
                        removing.push({
                            g: g,
                            d: best
                        });
                    }
                }

            }, this);

            loading.sort(function (a, b) {
                return a.d - b.d;
            });

            removing.sort(function (a, b) {
                return b.d - a.d;
            });

            loading.slice(0, this.uploadsPerStep)
                .forEach(function (x) {
                    reload(this, x.g);
                }, this);

            removing.slice(0, this.unloadsPerStep)
                .forEach(function (x) {
                    unload(this, x.g);
                }, this);

            this.stats.residentGroups =
                this.groups.reduce(function (n, g) {
                    return n + (g.loaded ? 1 : 0);
                }, 0);

            this.stats.residentInstanceBytes =
                this.groups.reduce(function (n, g) {
                    return n + (g.loaded ? g.bytes : 0);
                }, 0);
        };

    // =====================================================
    // FISICA PREDICTIVA OPT-IN
    // =====================================================

    function pBounds(c) {
        if (!c || !c.entity) return null;

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

        } else if (
            c.type === 'capsule' ||
            c.type === 'cylinder'
        ) {
            var r = c.radius || 0.5;
            var k = (c.height || 1) / 2;

            h = c.axis === 0
                ? [k, r, r]
                : c.axis === 2
                    ? [r, r, k]
                    : [r, k, r];

        } else {
            return null;
        }

        if (
            c.angularOffset &&
            (
                Math.abs(c.angularOffset.x) +
                Math.abs(c.angularOffset.y) +
                Math.abs(c.angularOffset.z)
            ) > 1e-6
        ) {
            return null;
        }

        var o = c.linearOffset || {
            x: 0,
            y: 0,
            z: 0
        };

        var m = c.entity.getWorldTransform().data;

        var p = [
            m[12] + m[0] * o.x + m[4] * o.y + m[8] * o.z,
            m[13] + m[1] * o.x + m[5] * o.y + m[9] * o.z,
            m[14] + m[2] * o.x + m[6] * o.y + m[10] * o.z
        ];

        var v = [
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
            p[0] - v[0],
            p[1] - v[1],
            p[2] - v[2],
            p[0] + v[0],
            p[1] + v[1],
            p[2] + v[2]
        ];
    }

    function segBox(a, b, v, r) {
        var t0 = 0;
        var t1 = 1;

        for (var i = 0; i < 3; i++) {
            var d = b[i] - a[i];
            var lo = v[i] - r;
            var hi = v[i + 3] + r;

            if (Math.abs(d) < 1e-9) {
                if (a[i] < lo || a[i] > hi) {
                    return false;
                }

            } else {
                var x = (lo - a[i]) / d;
                var y = (hi - a[i]) / d;

                if (x > y) {
                    var z = x;
                    x = y;
                    y = z;
                }

                t0 = Math.max(t0, x);
                t1 = Math.min(t1, y);

                if (t0 > t1) return false;
            }
        }

        return true;
    }

    AdvancedGpuInstancer.prototype._restorePhysics =
        function () {
            (this._phys || []).forEach(function (q) {
                if (
                    q.c.entity &&
                    !q.c.entity._destroyed
                ) {
                    q.c.enabled = q.c0;
                    q.rb.enabled = q.r0;
                }
            });

            this._phys = [];
            this._physActive = new Set();
        };

    AdvancedGpuInstancer.prototype._scanPhysics =
        function () {
            this._restorePhysics();

            if (
                !this.physicsStreaming ||
                !this.player
            ) {
                return;
            }

            this.app.root.findComponents('collision')
                .forEach(function (c) {
                    var e = c.entity;
                    var rb = e.rigidbody;

                    if (
                        !live(e) ||
                        !c.enabled ||
                        !rb ||
                        !rb.enabled ||
                        rb.type !== pc.BODYTYPE_STATIC ||
                        c.isTrigger ||
                        !tag(e, 'agi-stream-physics') ||
                        tag(e, 'agi-physics-always')
                    ) {
                        return;
                    }

                    var b = pBounds(c);

                    if (!b) return;

                    var q = {
                        c: c,
                        rb: rb,
                        b: b,
                        c0: c.enabled,
                        r0: rb.enabled,
                        on: true
                    };

                    this._phys.push(q);
                    this._physActive.add(q);

                }, this);
        };

    AdvancedGpuInstancer.prototype._streamPhysics =
        function () {
            if (
                !this.player ||
                !this._phys.length
            ) {
                return;
            }

            var p = this.player.getPosition();

            var v = this.player.rigidbody &&
                this.player.rigidbody.linearVelocity;

            var now = [p.x, p.y, p.z];
            var previous = this._prevPlayer || now;

            var phys = this.app.systems.rigidbody;

            var step = phys && phys.fixedTimeStep > 0
                ? phys.fixedTimeStep
                : this._lastDt;

            var sub = phys && phys.maxSubSteps > 0
                ? phys.maxSubSteps
                : 1;

            var t = step * sub;

            var after = v
                ? [
                    p.x + v.x * t,
                    p.y + v.y * t,
                    p.z + v.z * t
                ]
                : now;

            var pb = this.player.collision
                ? pBounds(this.player.collision)
                : null;

            var radius = pb
                ? Math.hypot(
                    pb[3] - pb[0],
                    pb[4] - pb[1],
                    pb[5] - pb[2]
                ) / 2
                : 0;

            var list = cams(this);

            if (!list.length) return;

            var maxFar = Math.max.apply(
                null,
                list.map(function (c) {
                    return c.farClip;
                })
            );

            if (
                !Number.isFinite(maxFar) ||
                maxFar <= 0
            ) {
                return;
            }

            var reach = Math.max(radius, maxFar);
            var budget = this.physicsOffBudget;

            this._phys.forEach(function (q) {
                var want =
                    segBox(previous, now, q.b, reach) ||
                    segBox(now, after, q.b, reach);

                if (want && !q.on) {
                    q.rb.enabled = q.r0;
                    q.c.enabled = q.c0;
                    q.on = true;

                    this._physActive.add(q);
                }

                if (!want && q.on && budget > 0) {
                    q.rb.enabled = false;
                    q.c.enabled = false;
                    q.on = false;

                    this._physActive.delete(q);
                    budget--;
                }
            }, this);

            this._prevPlayer = now;
        };

    AdvancedGpuInstancer.prototype.rebuildPhysics =
        function () {
            this._discover();
            this._scanPhysics();

            return this.auditStreaming();
        };

    // =====================================================
    // AUTOLOD WORKER
    // =====================================================

    function workerSource() {
        self.onmessage = function (e) {
            try {
                self.postMessage({
                    id: e.data.id,
                    result: [
                        reduce(e.data, 0.55),
                        reduce(e.data, 0.27)
                    ]
                });

            } catch (err) {
                self.postMessage({
                    id: e.data.id,
                    result: [null, null],
                    error: String(err)
                });
            }
        };

        function reduce(d, ratio) {
            var pos = d.pos;
            var n = d.n;
            var u = d.u;
            var v = d.v;
            var idx = d.idx;

            var count = pos.length / 3;

            if (
                count < 80 ||
                idx.length < 240
            ) {
                return null;
            }

            var keys = new Map();
            var out = [];
            var ref = [];

            var ext = [
                Infinity,
                Infinity,
                Infinity,
                -Infinity,
                -Infinity,
                -Infinity
            ];

            for (var i = 0; i < count; i++) {
                for (var j = 0; j < 3; j++) {
                    ext[j] = Math.min(
                        ext[j],
                        pos[i * 3 + j]
                    );

                    ext[j + 3] = Math.max(
                        ext[j + 3],
                        pos[i * 3 + j]
                    );
                }
            }

            var div = Math.max(
                2,
                Math.ceil(Math.cbrt(count * ratio))
            );

            var nn = n.length === count * 3;
            var uu = u.length === count * 2;
            var vv = v.length === count * 2;

            for (i = 0; i < count; i++) {
                var k = [];

                for (j = 0; j < 3; j++) {
                    k.push(Math.floor(
                        (pos[i * 3 + j] - ext[j]) /
                        Math.max(
                            1e-7,
                            ext[j + 3] - ext[j]
                        ) * div
                    ));
                }

                if (uu) {
                    k.push(
                        Math.round(u[2 * i] * 1024),
                        Math.round(u[2 * i + 1] * 1024)
                    );
                }

                if (vv) {
                    k.push(
                        Math.round(v[2 * i] * 4096),
                        Math.round(v[2 * i + 1] * 4096)
                    );
                }

                if (nn) {
                    k.push(
                        Math.round(n[3 * i] * 16),
                        Math.round(n[3 * i + 1] * 16),
                        Math.round(n[3 * i + 2] * 16)
                    );
                }

                var key = k.join(',');
                var at = keys.get(key);

                if (at === undefined) {
                    at = out.length;
                    keys.set(key, at);

                    out.push({
                        p: [0, 0, 0],
                        n: [0, 0, 0],
                        u: [0, 0],
                        v: [0, 0],
                        c: 0
                    });
                }

                ref[i] = at;

                var o = out[at];
                o.c++;

                for (j = 0; j < 3; j++) {
                    o.p[j] += pos[i * 3 + j];

                    if (nn) {
                        o.n[j] += n[i * 3 + j];
                    }
                }

                if (uu) {
                    o.u[0] += u[2 * i];
                    o.u[1] += u[2 * i + 1];
                }

                if (vv) {
                    o.v[0] += v[2 * i];
                    o.v[1] += v[2 * i + 1];
                }
            }

            var ind = [];

            for (i = 0; i < idx.length; i += 3) {
                var a = ref[idx[i]];
                var b = ref[idx[i + 1]];
                var c = ref[idx[i + 2]];

                if (
                    a !== b &&
                    b !== c &&
                    a !== c
                ) {
                    ind.push(a, b, c);
                }
            }

            if (
                ind.length < 3 ||
                ind.length > idx.length * 0.8
            ) {
                return null;
            }

            var p = [];
            var norm = [];
            var uv = [];
            var uv1 = [];

            out.forEach(function (o) {
                for (var i = 0; i < 3; i++) {
                    p.push(o.p[i] / o.c);
                }

                if (nn) {
                    var len = Math.hypot(
                        o.n[0],
                        o.n[1],
                        o.n[2]
                    ) || 1;

                    for (i = 0; i < 3; i++) {
                        norm.push(o.n[i] / len);
                    }
                }

                if (uu) {
                    uv.push(
                        o.u[0] / o.c,
                        o.u[1] / o.c
                    );
                }

                if (vv) {
                    uv1.push(
                        o.v[0] / o.c,
                        o.v[1] / o.c
                    );
                }
            });

            return {
                pos: p,
                n: norm,
                u: uv,
                v: uv1,
                idx: ind
            };
        }
    }

    // =====================================================
    // AUTOLOD CONTROL
    // =====================================================

    AdvancedGpuInstancer.prototype._stopLod =
        function () {
            if (this._worker) {
                this._worker.terminate();
                this._worker = null;
            }

            this._lodQueue = [];
            this._lodJob = null;
        };

    AdvancedGpuInstancer.prototype._nextLod =
        function () {
            if (
                !this._worker ||
                this._lodJob ||
                !this._lodQueue.length
            ) {
                return;
            }

            var j = this._lodQueue.shift();

            j.id = ++this._lodCounter;
            this._lodJob = j;

            try {
                this._worker.postMessage(j);
            } catch (e) {
                this._stopLod();
            }
        };

    AdvancedGpuInstancer.prototype._startLod =
        function () {
            if (
                !this.autoLod ||
                typeof Worker === 'undefined'
            ) {
                return;
            }

            var meshes = new Set();
            var s = this;

            this.groups.forEach(function (g) {
                if (!tag(g.items[0].c.entity, 'agi-no-lod')) {
                    meshes.add(g.mesh);
                }
            });

            this._lodQueue = [];

            meshes.forEach(function (m) {
                var pr = m.primitive;

                if (
                    !pr ||
                    pr.length !== 1 ||
                    !pr[0].indexed ||
                    pr[0].base !== 0 ||
                    pr[0].type !== pc.PRIMITIVE_TRIANGLES
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
                    m.vertexBuffer.getFormat()
                        .elements.some(function (x) {
                            return allowed.indexOf(x.name) < 0;
                        })
                ) {
                    return;
                }

                var pos = [];
                var n = [];
                var u = [];
                var v = [];
                var idx = [];

                try {
                    m.getPositions(pos);
                    m.getNormals(n);
                    m.getUvs(0, u);
                    m.getUvs(1, v);
                    m.getIndices(idx);

                } catch (_) {
                    return;
                }

                if (
                    pos.length > 350000 ||
                    idx.length !== pr[0].count ||
                    idx.length < 240
                ) {
                    return;
                }

                if (
                    s.groups.some(function (g) {
                        return (
                            g.mesh === m &&
                            g.items[0].c.lightmapped
                        );
                    }) &&
                    v.length !== pos.length * 2 / 3
                ) {
                    return;
                }

                s._lodQueue.push({
                    mesh: m,
                    pos: pos,
                    n: n,
                    u: u,
                    v: v,
                    idx: idx
                });
            });

            if (!this._lodQueue.length) return;

            var url;

            try {
                url = URL.createObjectURL(
                    new Blob(
                        ['(' + workerSource.toString() + ')();'],
                        { type: 'text/javascript' }
                    )
                );

                this._worker = new Worker(url);

            } catch (e) {
                if (this.debug) {
                    console.warn(TAG, 'Worker LOD', e);
                }

                return;

            } finally {
                if (url) {
                    URL.revokeObjectURL(url);
                }
            }

            this._worker.onmessage = function (e) {
                if (
                    !s._alive ||
                    !s._lodJob ||
                    e.data.id !== s._lodJob.id
                ) {
                    return;
                }

                var job = s._lodJob;
                var out = [job.mesh, null, null];

                s._lodJob = null;

                (e.data.result || []).forEach(function (d, i) {
                    if (!d) return;

                    var mesh;

                    try {
                        mesh = new pc.Mesh(
                            s.app.graphicsDevice
                        );

                        mesh.setPositions(d.pos);

                        if (d.n.length) {
                            mesh.setNormals(d.n);
                        }

                        if (d.u.length) {
                            mesh.setUvs(0, d.u);
                        }

                        if (d.v.length) {
                            mesh.setUvs(1, d.v);
                        }

                        mesh.setIndices(d.idx);
                        mesh.update(pc.PRIMITIVE_TRIANGLES);

                        out[i + 1] = mesh;

                        s._ownedLod.add(mesh);
                        s.stats.lodMeshes++;

                    } catch (err) {
                        if (mesh) {
                            try { mesh.destroy(); } catch (_) { }
                        }

                        if (s.debug) {
                            console.warn(TAG, 'LOD', err);
                        }
                    }
                });

                s._lodMeshes.set(job.mesh, out);
                s._nextLod();
            };

            this._worker.onerror = function (e) {
                console.warn(TAG, 'Worker', e.message);
                s._stopLod();
            };

            this._nextLod();
        };

    AdvancedGpuInstancer.prototype._updateLod =
        function () {
            if (!this.autoLod) return;

            var cameras = cams(this);
            var dev = this.app.graphicsDevice;

            this.groups.forEach(function (g) {
                if (!g.loaded) return;

                var levels = this._lodMeshes.get(g.mesh);

                if (
                    !levels ||
                    (!levels[1] && !levels[2])
                ) {
                    return;
                }

                var px = 0;

                cameras.forEach(function (c) {
                    var p = c.entity.getPosition();

                    var d = Math.max(
                        0.1,
                        Math.hypot(
                            p.x - g.cx,
                            p.y - g.cy,
                            p.z - g.cz
                        ) - g.radius
                    );

                    var dim = c.horizontalFov
                        ? dev.width
                        : dev.height;

                    var q = c.projection ===
                        pc.PROJECTION_ORTHOGRAPHIC
                        ? g.radius * dim /
                        Math.max(0.01, 2 * c.orthoHeight)
                        : g.radius * dim /
                        (
                            d * Math.tan(
                                Math.max(5, c.fov) *
                                Math.PI / 360
                            )
                        );

                    px = Math.max(px, q);
                });

                var a = this.lodNearPixels *
                    this._lodQuality;

                var b = this.lodFarPixels *
                    this._lodQuality;

                var n = px >= a
                    ? 0
                    : px >= b
                        ? 1
                        : 2;

                if (
                    g.lod !== n &&
                    Math.abs(
                        px - (g.lod === 0 ? a : b)
                    ) < 8
                ) {
                    n = g.lod;
                }

                while (n > 0 && !levels[n]) {
                    n--;
                }

                if (n !== g.lod) {
                    g.mi.mesh = levels[n];
                    g.lod = n;
                }

            }, this);
        };

    // =====================================================
    // AGI3.9 - SNAPSHOTS DE CASTERS DINAMICOS
    // =====================================================

    AdvancedGpuInstancer.prototype._snapshotCasters =
        function () {
            var list = this._dynamicSnapshots;
            var active = this._activeCasterSnapshots;

            active.length = 0;

            var dirty = false;

            for (var i = 0; i < list.length; i++) {
                var rec = list[i];
                var c = rec.c;
                var mi = rec.mi;
                var e = c.entity;

                var visible = !!(
                    c.enabled &&
                    live(e) &&
                    !c.isStatic &&
                    !c.lightmapped &&
                    !tag(e, 'agi-no-shadow') &&
                    c.castShadows &&
                    mi.mesh &&
                    mi.visible !== false &&
                    mi.castShadow
                );

                if (rec.active !== visible) {
                    rec.active = visible;
                    dirty = true;
                }

                if (!visible) continue;

                var moved = matrixChanged(rec, mi.node);
                var deform = !!(
                    mi.skinInstance ||
                    mi.morphInstance
                );

                if (
                    moved ||
                    deform ||
                    rec.mesh !== mi.mesh ||
                    !rec.box
                ) {
                    rec.mesh = mi.mesh;
                    rec.box = bounds(mi);

                    dirty = true;

                    this.stats.casterAabbUpdates++;
                }

                if (rec.box) {
                    active.push(rec);
                }
            }

            if (dirty) {
                this._casterVersion++;
                this._catcherVisibilityDirty = true;
            }

            this.stats.dynamicCasterCount = active.length;

            return active;
        };

    // =====================================================
    // PROYECCION DE SOMBRAS
    // =====================================================

    function projShadow(b, l, floor) {
        var dir = l.entity.up;

        if (
            !dir ||
            Math.abs(dir.y) < 1e-7 ||
            !floor
        ) {
            return null;
        }

        var fy = (floor[1] + floor[4]) / 2;

        if (b[4] < fy) return null;

        var xmin = Infinity;
        var xmax = -Infinity;
        var zmin = Infinity;
        var zmax = -Infinity;

        for (var i = 0; i < 2; i++) {
            for (var j = 0; j < 2; j++) {
                for (var k = 0; k < 2; k++) {
                    var y = b[j ? 4 : 1];
                    var t = (y - fy) / dir.y;

                    var x = b[i ? 3 : 0] - dir.x * t;
                    var z = b[k ? 5 : 2] - dir.z * t;

                    xmin = Math.min(xmin, x);
                    xmax = Math.max(xmax, x);
                    zmin = Math.min(zmin, z);
                    zmax = Math.max(zmax, z);
                }
            }
        }

        return Number.isFinite(
            xmin + xmax + zmin + zmax
        )
            ? [xmin, fy, zmin, xmax, fy, zmax]
            : null;
    }

    function intersectsXZ(a, b) {
        return !!(
            a &&
            b &&
            a[0] <= b[3] &&
            a[3] >= b[0] &&
            a[2] <= b[5] &&
            a[5] >= b[2]
        );
    }

    // =====================================================
    // DESTRUIR SHADOW CATCHER
    // =====================================================

    AdvancedGpuInstancer.prototype._destroyCatcher =
        function () {
            var c = this._catcher;

            if (c) {
                try { c.entity.destroy(); } catch (_) { }
                try { c.mesh.destroy(); } catch (_) { }
                try { c.mat.destroy(); } catch (_) { }
            }

            this._catcher = null;
            this._catcherActive = false;
            this._floorBounds = null;

            this._catcherCache = null;
            this._projectionCache = new Map();
            this._catcherVisibilityDirty = true;
        };

    // =====================================================
    // CONSTRUCCION DE SHADOW CATCHER
    // =====================================================

    AdvancedGpuInstancer.prototype._buildCatcher =
        function () {
            this._destroyCatcher();

            if (!this.dynamicShadowCatcher) {
                return;
            }

            var probe = new pc.StandardMaterial();
            var supported = 'shadowCatcher' in probe;

            probe.destroy();

            if (!supported) return;

            var P = [];
            var N = [];
            var U = [];
            var I = [];

            var floorBox = null;
            var quads = 0;
            var s = this;

            this.app.root.findComponents('render')
                .forEach(function (c) {
                    if (
                        !c.enabled ||
                        !live(c.entity) ||
                        !floorSource(c) ||
                        c.entity.__agiProxy
                    ) {
                        return;
                    }

                    (c.meshInstances || []).forEach(function (mi) {
                        if (
                            !mi ||
                            !mi.mesh ||
                            !lmOf(mi).tex
                        ) {
                            return;
                        }

                        var b = bounds(mi);

                        if (!b) return;

                        var pos = [];
                        var ind = [];

                        try {
                            mi.mesh.getPositions(pos);
                            mi.mesh.getIndices(ind);
                        } catch (_) {
                            return;
                        }

                        if (!ind.length) {
                            for (
                                var j = 0;
                                j < pos.length / 3;
                                j++
                            ) {
                                ind.push(j);
                            }
                        }

                        var M = mi.node.getWorldTransform();

                        var a = new pc.Vec3();
                        var v = new pc.Vec3();
                        var w = new pc.Vec3();

                        var count = 0;

                        for (
                            var k = 0;
                            k + 2 < ind.length &&
                            I.length / 3 < s.maxCatcherTriangles;
                            k += 3
                        ) {
                            var ia = ind[k];
                            var ib = ind[k + 1];
                            var ic = ind[k + 2];

                            var nn = pos.length / 3;

                            if (
                                ia >= nn ||
                                ib >= nn ||
                                ic >= nn
                            ) {
                                continue;
                            }

                            M.transformPoint(
                                a.set(
                                    pos[ia * 3],
                                    pos[ia * 3 + 1],
                                    pos[ia * 3 + 2]
                                ),
                                a
                            );

                            M.transformPoint(
                                v.set(
                                    pos[ib * 3],
                                    pos[ib * 3 + 1],
                                    pos[ib * 3 + 2]
                                ),
                                v
                            );

                            M.transformPoint(
                                w.set(
                                    pos[ic * 3],
                                    pos[ic * 3 + 1],
                                    pos[ic * 3 + 2]
                                ),
                                w
                            );

                            var abx = v.x - a.x;
                            var aby = v.y - a.y;
                            var abz = v.z - a.z;

                            var acx = w.x - a.x;
                            var acy = w.y - a.y;
                            var acz = w.z - a.z;

                            var cy = abz * acx - abx * acz;

                            var len = Math.hypot(
                                aby * acz - abz * acy,
                                cy,
                                abx * acy - aby * acx
                            );

                            if (
                                len < 1e-8 ||
                                Math.abs(cy / len) < 0.94
                            ) {
                                continue;
                            }

                            var order = cy < 0
                                ? [a, w, v]
                                : [a, v, w];

                            var start = P.length / 3;

                            order.forEach(function (pt) {
                                P.push(
                                    pt.x,
                                    pt.y + 0.006,
                                    pt.z
                                );

                                N.push(0, 1, 0);

                                U.push(
                                    pt.x * 0.01,
                                    pt.z * 0.01
                                );
                            });

                            I.push(
                                start,
                                start + 1,
                                start + 2
                            );

                            count++;
                        }

                        if (count) {
                            floorBox = joinBox(floorBox, b);
                            quads++;
                        }
                    });
                });

            this.stats.catcherTiles = quads;

            if (!I.length) return;

            var mesh;
            var mat;
            var e;

            try {
                mesh = new pc.Mesh(
                    this.app.graphicsDevice
                );

                mesh.setPositions(P);
                mesh.setNormals(N);
                mesh.setUvs(0, U);
                mesh.setIndices(I);
                mesh.update(pc.PRIMITIVE_TRIANGLES);

                mat = new pc.StandardMaterial();

                mat.name = 'AGI39_ShadowCatcher';
                mat.shadowCatcher = true;

                mat.blendType = pc.BLEND_MULTIPLICATIVE;
                mat.cull = pc.CULLFACE_NONE;

                mat.depthWrite = false;
                mat.depthTest = true;
                mat.useSkybox = false;

                mat.diffuse.set(0, 0, 0);
                mat.specular.set(0, 0, 0);

                mat.update();

                e = new pc.Entity(
                    'AGI_ShadowReceiver_JoinedQuads'
                );

                e.__agiCatcher = true;

                this.app.root.addChild(e);

                var mi = new pc.MeshInstance(
                    mesh,
                    mat,
                    e
                );

                mi.castShadow = false;
                mi.receiveShadow = true;

                e.addComponent('render', {
                    meshInstances: [mi],
                    castShadows: false,
                    receiveShadows: true
                });

                e.render.isStatic = false;
                e.render.lightmapped = false;

                e.enabled = false;

                this._catcher = {
                    entity: e,
                    mesh: mesh,
                    mat: mat,
                    mi: mi
                };

                this._floorBounds = floorBox;

                this._catcherCache = null;
                this._projectionCache = new Map();
                this._catcherVisibilityDirty = true;

            } catch (err) {
                console.warn(TAG, 'Catcher', err);

                if (e) {
                    try { e.destroy(); } catch (_) { }
                }

                if (mesh) {
                    try { mesh.destroy(); } catch (_) { }
                }

                if (mat) {
                    try { mat.destroy(); } catch (_) { }
                }
            }
        };

    // =====================================================
    // AGI3.9 - SHADOW CATCHER CON DOBLE CACHE
    // =====================================================

    AdvancedGpuInstancer.prototype._updateCatcher =
        function () {
            var receiver = this._catcher;

            if (
                !receiver ||
                !this.dynamicShadowCatcher ||
                !this.optimizeBakedCasters
            ) {
                if (
                    receiver &&
                    receiver.entity.enabled
                ) {
                    receiver.entity.enabled = false;
                }

                this._catcherActive = false;
                return;
            }

            var floor = this._floorBounds;

            if (!floor) return;

            // CACHE 1: bounds de casters dinamicos.
            var casters = this._snapshotCasters();

            var list = this._directionalLights || [];
            var cameraList = this._cameras || [];

            var revisionsChanged = false;

            var projected = this._projectionCache;
            var candidates = this._shadowProjectedCandidates;

            candidates.length = 0;

            // CACHE 2: proyeccion caster -> suelo.
            // No depende de la posicion de la camara.

            for (var i = 0; i < list.length; i++) {
                var light = list[i];

                if (
                    !light ||
                    !light.entity ||
                    light.entity._destroyed
                ) {
                    continue;
                }

                var current = projected.get(light);
                var dir = light.entity.up;

                var can = !!(
                    light.enabled &&
                    live(light.entity) &&
                    light.castShadows &&
                    !light.affectLightmapped
                );

                var distance = +light.shadowDistance;

                if (
                    !can ||
                    !Number.isFinite(distance) ||
                    distance <= 0
                ) {
                    continue;
                }

                if (!current) {
                    current = {
                        version: -1,
                        shapes: [],
                        x: NaN,
                        y: NaN,
                        z: NaN
                    };

                    projected.set(light, current);
                }

                // Reproyectar solo cuando cambian
                // casters o direccion de la luz.

                if (
                    current.version !== this._casterVersion ||
                    current.x !== dir.x ||
                    current.y !== dir.y ||
                    current.z !== dir.z
                ) {
                    current.version = this._casterVersion;

                    current.x = dir.x;
                    current.y = dir.y;
                    current.z = dir.z;

                    current.shapes.length = 0;

                    revisionsChanged = true;

                    for (var j = 0; j < casters.length; j++) {
                        var b = projShadow(
                            casters[j].box,
                            light,
                            floor
                        );

                        if (!intersectsXZ(b, floor)) {
                            continue;
                        }

                        var overlap = [
                            Math.max(b[0], floor[0]),
                            floor[1],
                            Math.max(b[2], floor[2]),
                            Math.min(b[3], floor[3]),
                            floor[4],
                            Math.min(b[5], floor[5])
                        ];

                        current.shapes.push({
                            bounds: overlap,
                            box: box3(overlap)
                        });

                        this.stats.shadowProjectionRebuilds++;
                    }
                }

                if (current.shapes.length) {
                    candidates.push({
                        light: light,
                        distance: distance,
                        shapes: current.shapes
                    });
                }
            }

            // CACHE 3: visibilidad de camara.
            // Mover la camara no invalida proyecciones.

            var cameraChanged =
                this._catcherVisibilityDirty ||
                revisionsChanged;

            var cache = this._cameraVisibilityCache;

            if (cache.length !== cameraList.length) {
                cache.length = cameraList.length;
                cameraChanged = true;
            }

            for (i = 0; i < cameraList.length; i++) {
                var c = cameraList[i];
                var state = cache[i];

                if (!state || state.c !== c) {
                    state = { c: c };
                    cache[i] = state;
                    cameraChanged = true;
                }

                if (matrixChanged(state, c.entity)) {
                    cameraChanged = true;
                }

                if (
                    state.enabled !== c.enabled ||
                    state.entityEnabled !== c.entity.enabled ||
                    state.far !== c.farClip ||
                    state.near !== c.nearClip ||
                    state.fov !== c.fov ||
                    state.aspect !== c.aspectRatio ||
                    state.projection !== c.projection ||
                    state.ortho !== c.orthoHeight ||
                    state.culling !== c.frustumCulling
                ) {
                    state.enabled = c.enabled;
                    state.entityEnabled = c.entity.enabled;
                    state.far = c.farClip;
                    state.near = c.nearClip;
                    state.fov = c.fov;
                    state.aspect = c.aspectRatio;
                    state.projection = c.projection;
                    state.ortho = c.orthoHeight;
                    state.culling = c.frustumCulling;

                    cameraChanged = true;
                }
            }

            if (
                this._catcherLightsSnapshot.length !== list.length
            ) {
                this._catcherLightsSnapshot.length = list.length;
                cameraChanged = true;
            }

            for (i = 0; i < list.length; i++) {
                light = list[i];

                var old = this._catcherLightsSnapshot[i];

                if (!old || old.l !== light) {
                    old = { l: light };

                    this._catcherLightsSnapshot[i] = old;
                    cameraChanged = true;
                }

                if (
                    old.distance !== light.shadowDistance ||
                    old.enabled !== light.enabled ||
                    old.entityEnabled !== light.entity.enabled ||
                    old.cast !== light.castShadows ||
                    old.affect !== light.affectLightmapped
                ) {
                    old.distance = light.shadowDistance;
                    old.enabled = light.enabled;
                    old.entityEnabled = light.entity.enabled;
                    old.cast = light.castShadows;
                    old.affect = light.affectLightmapped;

                    cameraChanged = true;
                }
            }

            if (!cameraChanged) {
                this.stats.catcherCacheHits++;
                return;
            }

            this._catcherVisibilityDirty = false;
            this.stats.catcherVisibilityTests++;

            var on = false;

            outer:
            for (i = 0; i < candidates.length; i++) {
                var candidate = candidates[i];
                var dist = candidate.distance;
                var shapes = candidate.shapes;

                if (!cameraList.length) {
                    on = true;
                    break;
                }

                for (var k = 0; k < cameraList.length; k++) {
                    c = cameraList[k];

                    if (
                        !c.enabled ||
                        !live(c.entity)
                    ) {
                        continue;
                    }

                    var limit = Math.min(
                        +c.farClip,
                        dist
                    );

                    if (
                        !Number.isFinite(limit) ||
                        limit <= 0
                    ) {
                        continue;
                    }

                    var cm = c.entity
                        .getWorldTransform().data;

                    var pos = this._tmpCameraPosition.set(
                        cm[12],
                        cm[13],
                        cm[14]
                    );

                    if (
                        boxDist2(floor, pos) >
                        limit * limit
                    ) {
                        continue;
                    }

                    for (j = 0; j < shapes.length; j++) {
                        var shape = shapes[j];

                        if (
                            boxDist2(shape.bounds, pos) >
                            limit * limit
                        ) {
                            continue;
                        }

                        if (
                            !c.frustumCulling ||
                            !c.frustum ||
                            c.frustum.containsAabb(shape.box)
                        ) {
                            on = true;
                            break outer;
                        }
                    }
                }
            }

            if (on !== this._catcherActive) {
                receiver.entity.enabled = on;
                this._catcherActive = on;

                this.stats.catcherRebuilds++;
            }
        };

    // =====================================================
    // DESCUBRIMIENTO AUTOMATICO
    // =====================================================

    AdvancedGpuInstancer.prototype._discover =
        function () {
            var p = this.app.root.findByTag('is-player');

            this.player =
                p.find(function (e) {
                    return live(e) && !!e.rigidbody;
                }) ||
                p.find(live) ||
                null;

            this._cameras =
                this.app.root.findComponents('camera')
                    .filter(function (c) {
                        return (
                            c.enabled &&
                            live(c.entity)
                        );
                    });
        };

    // =====================================================
    // AGI3.9 - SNAPSHOT DE COMPONENTES
    // =====================================================

    AdvancedGpuInstancer.prototype._refresh =
        function () {
            var lights = this.app.root.findComponents('light');

            var render =
                this.app.root.findComponents('render')
                    .concat(
                        this.app.root.findComponents('model')
                    );

            var local = [];
            var spots = [];
            var directional = [];
            var dynamic = [];
            var original = [];

            for (var i = 0; i < lights.length; i++) {
                var l = lights[i];

                if (l.type === 'spot') {
                    spots.push(l);
                    local.push(l);

                } else if (l.type === 'omni') {
                    local.push(l);

                } else if (l.type === 'directional') {
                    directional.push(l);
                }
            }

            for (i = 0; i < render.length; i++) {
                var c = render[i];

                if (
                    !c ||
                    c.isStatic ||
                    c.entity.__agiProxy ||
                    c.entity.__agiCatcher
                ) {
                    continue;
                }

                dynamic.push(c);

                var mesh = c.meshInstances || [];

                for (var j = 0; j < mesh.length; j++) {
                    var mi = mesh[j];

                    if (mi && mi.mesh && mi.node) {
                        original.push({
                            c: c,
                            mi: mi
                        });
                    }
                }
            }

            var old = this._dynamicSnapshots || [];

            var same = old.length === original.length;

            if (same) {
                for (i = 0; i < original.length; i++) {
                    if (
                        old[i].c !== original[i].c ||
                        old[i].mi !== original[i].mi
                    ) {
                        same = false;
                        break;
                    }
                }
            }

            if (!same) {
                this._dynamicSnapshots = original;
                this._activeCasterSnapshots = [];

                this._casterVersion++;
                this._catcherVisibilityDirty = true;
            }

            if (!sameRefs(this._watchLights, lights)) {
                this._castersDirty = true;
            }

            var spotSet = new Set(spots);
            var self = this;

            this._spotStates.forEach(function (st, l) {
                if (spotSet.has(l)) return;

                if (
                    st.suspended &&
                    l.entity &&
                    !l.entity._destroyed
                ) {
                    l.castShadows = st.original;
                }

                self._spotStates.delete(l);
            });

            var localSet = new Set(local);

            this._localCasterWatch.forEach(function (st, l) {
                if (!localSet.has(l)) {
                    self._localCasterWatch.delete(l);
                }
            });

            this._watchLights = lights;
            this._spotLights = spots;
            this._localLights = local;
            this._directionalLights = directional;
            this._watchDynamic = dynamic;
        };

    // =====================================================
    // CONTROL PUBLICO DE SOMBRAS
    // =====================================================

    AdvancedGpuInstancer.prototype.invalidateShadows =
        function () {
            this._castersDirty = true;
            this._catcherVisibilityDirty = true;
            this._casterVersion++;

            this.stats.shadowInvalidations++;
        };

    AdvancedGpuInstancer.prototype.setShadowOptimization =
        function (on) {
            this.optimizeBakedCasters = !!on;

            if (!on) {
                this._restoreCasters();
                this._restoreSpotShadows();

                if (this._catcher) {
                    this._catcher.entity.enabled = false;
                }

                this._catcherActive = false;
                this._catcherVisibilityDirty = true;

            } else {
                this.invalidateShadows();
            }

            return this.auditShadows();
        };

    // =====================================================
    // INITIALIZE
    // =====================================================

    AdvancedGpuInstancer.prototype.initialize =
        function () {
            this.unloadDelay = 2;

            this.uploadsPerStep = 8;
            this.unloadsPerStep = 8;

            this.physicsOffBudget = 50;

            this.lodNearPixels = 90;
            this.lodFarPixels = 30;

            this.adaptiveMobile = true;
            this.targetFPS = 30;

            this.maxCatcherTriangles = 12000;

            this.optimizeBakedCasters = true;

            this._lodQuality = 1;
            this._lastDt = 0;

            this._frameEMA = 0;
            this._adaptiveClock = 0;
            this._streamClock = 0;
            this._discoveryClock = 0;

            this._alive = false;
            this._built = false;
            this._baking = false;
            this._retry = 0;

            this._ids = new WeakMap();
            this._id = 0;

            this.groups = [];
            this._hidden = [];

            this._materials = new Map();
            this._format = null;

            this._cameras = [];
            this.player = null;

            this._watchLights = [];
            this._watchDynamic = [];

            this._castersOriginal = new Map();
            this._spotStates = new Map();
            this._localCasterWatch = new Map();
            this._castersDirty = true;

            this._spotLights = [];
            this._localLights = [];
            this._directionalLights = [];

            this._dynamicSnapshots = [];
            this._activeCasterSnapshots = [];
            this._casterVersion = 0;

            this._projectionCache = new Map();
            this._shadowProjectedCandidates = [];

            this._cameraVisibilityCache = [];
            this._catcherLightsSnapshot = [];

            this._catcherVisibilityDirty = true;
            this._tmpCameraPosition = new pc.Vec3();

            this._phys = [];
            this._physActive = new Set();
            this._prevPlayer = null;

            this._catcher = null;
            this._catcherActive = false;
            this._catcherCache = null;
            this._floorBounds = null;

            this._worker = null;
            this._lodQueue = [];
            this._lodJob = null;
            this._lodCounter = 0;

            this._lodMeshes = new Map();
            this._ownedLod = new Set();

            this.stats = {};

            this._perf = {
                on: false,
                n: 0,
                total: 0,
                shadows: 0,
                catcher: 0,
                graphics: 0,
                physics: 0,
                lod: 0
            };

            this._bench = null;

            this.on('disable', this.restore, this);
            this.on('destroy', this.restore, this);

            this.on('enable', function () {
                if (!this._alive) {
                    this.rebuild();
                }
            }, this);

            this.rebuild();
        };

    // =====================================================
    // REBUILD
    // =====================================================

    AdvancedGpuInstancer.prototype.rebuild =
        function () {
            this.restore();

            this._alive = true;
            this._discover();

            this.stats = {
                sources: 0,
                instances: 0,
                groups: 0,

                instanceBytes: 0,
                residentGroups: 0,
                residentInstanceBytes: 0,

                vbUploads: 0,
                vbUnloads: 0,

                excluded: {},
                lodMeshes: 0,

                catcherTiles: 0,
                catcherRebuilds: 0,
                catcherCacheHits: 0,

                catcherVisibilityTests: 0,
                shadowProjectionRebuilds: 0,
                casterAabbUpdates: 0,

                bakedCastersDisabled: 0,
                bakedSpotRetained: 0,
                bakedDirectionalExcluded: 0,

                shadowInvalidations: 0,

                spotSuspended: 0,
                spotDistanceTransitions: 0,

                dynamicCasterCount: 0,
                qualityChanges: 0
            };

            var candidates = [];
            var waiting = 0;

            this.app.root.findComponents('render')
                .forEach(function (c) {
                    if (
                        !c.enabled ||
                        !live(c.entity) ||
                        !c.isStatic ||
                        c.entity.__agiProxy ||
                        c.entity.__agiCatcher
                    ) {
                        return;
                    }

                    (c.meshInstances || []).forEach(function (mi) {
                        this.stats.sources++;

                        var reason = chooseMi(c, mi);

                        if (reason) {
                            this.stats.excluded[reason] =
                                (this.stats.excluded[reason] || 0) + 1;

                            if (reason === 'esperando PT') {
                                waiting++;
                            }

                            return;
                        }

                        var b = bounds(mi);

                        if (b) {
                            candidates.push({
                                mi: mi,
                                c: c,
                                b: b,
                                lm: lmOf(mi)
                            });
                        }

                    }, this);

                }, this);

            if (waiting) {
                this._built = false;
                this._waitCount = waiting;
                return;
            }

            this._waitCount = 0;

            var groups = new Map();
            var size = Math.max(16, this.chunkSize);
            var extent = null;

            if (candidates.length <= 64) {
                candidates.forEach(function (x) {
                    extent = joinBox(extent, x.b);
                });
            }

            var single =
                candidates.length <= 64 &&
                extent &&
                extent[3] - extent[0] <= size &&
                extent[5] - extent[2] <= size;

            candidates.forEach(function (x) {
                var b = x.b;

                var cell = single
                    ? '0:0'
                    : Math.floor(
                        (b[0] + b[3]) / (2 * size)
                    ) + ':' +
                    Math.floor(
                        (b[2] + b[5]) / (2 * size)
                    );

                var key = [
                    cell,
                    objId(this, x.mi.mesh),
                    objId(this, x.mi.material),
                    objId(this, x.lm.tex),
                    objId(this, x.lm.dir),
                    x.c.lightmapped ? 1 : 0,
                    floorSource(x.c) ? 1 : 0,
                    signature(x)
                ].join('|');

                var g = groups.get(key);

                if (!g) {
                    g = {
                        cell: cell,
                        items: [],
                        b: null
                    };

                    groups.set(key, g);
                }

                g.items.push(x);
                g.b = joinBox(g.b, b);

            }, this);

            try {
                this._format = new pc.VertexFormat(
                    this.app.graphicsDevice,
                    SEM.map(function (n) {
                        return {
                            semantic: n,
                            components: 4,
                            type: pc.TYPE_FLOAT32
                        };
                    })
                );

                groups.forEach(function (g) {
                    if (g.items.length < 2) return;

                    g.cx = (g.b[0] + g.b[3]) / 2;
                    g.cy = (g.b[1] + g.b[4]) / 2;
                    g.cz = (g.b[2] + g.b[5]) / 2;

                    g.radius = Math.hypot(
                        g.b[3] - g.b[0],
                        g.b[4] - g.b[1],
                        g.b[5] - g.b[2]
                    ) / 2;

                    addGroup(this, g);

                }, this);

            } catch (e) {
                console.error(TAG, 'Instancing', e);
            }

            this.stats.residentGroups = this.stats.groups;

            this.stats.residentInstanceBytes =
                this.stats.instanceBytes;

            this._refresh();
            this._scanPhysics();

            this._built = true;

            this._updateSpotShadows();
            this._localCasterConfigChanged();

            if (this.optimizeBakedCasters) {
                this._updateCasters();
            }

            this._buildCatcher();
            this._updateCatcher();
            this._startLod();

            this._castersDirty = false;

            if (this.debug) {
                console.log(
                    TAG,
                    'Listo',
                    JSON.stringify(this.stats),
                    'player',
                    this.player
                        ? this.player.name
                        : 'sin tag is-player',
                    'cameras',
                    this._cameras.length
                );
            }

            this.app.fire('agi:ready', this);
            this.app.fire('gi:ready', this);
        };

    // =====================================================
    // PT BAKE MODE
    // =====================================================

    AdvancedGpuInstancer.prototype.setBakeMode =
        function (on) {
            on = !!on;

            if (
                !this._alive ||
                on === this._baking
            ) {
                return;
            }

            this._baking = on;

            if (on) {
                this._restoreCasters();
                this._restoreSpotShadows();

                if (this._catcher) {
                    this._catcher.entity.enabled = false;
                }

                this._catcherActive = false;

                this.groups.forEach(function (g) {
                    g.mi.visible = false;
                });

                this._hidden.forEach(function (h) {
                    h.mi.visible = h.visible;
                });

            } else {
                this.rebuild();
            }
        };

    // =====================================================
    // ADAPTACION DE LOD
    // =====================================================

    AdvancedGpuInstancer.prototype._adaptive =
        function (dt) {
            if (!this.adaptiveMobile) return;

            var ms = Math.min(250, dt * 1000);

            this._frameEMA = this._frameEMA
                ? this._frameEMA * 0.95 + ms * 0.05
                : ms;

            this._adaptiveClock += dt;

            if (this._adaptiveClock < 3) return;

            this._adaptiveClock = 0;

            var old = this._lodQuality;

            if (
                this._frameEMA >
                (1000 / this.targetFPS) * 1.15
            ) {
                this._lodQuality = Math.min(
                    1.65,
                    old * 1.12
                );

            } else if (
                this._frameEMA <
                (1000 / this.targetFPS) * 0.79
            ) {
                this._lodQuality = Math.max(
                    1,
                    old * 0.95
                );
            }

            if (old !== this._lodQuality) {
                this.stats.qualityChanges++;
            }
        };

    // =====================================================
    // UPDATE
    // =====================================================

    AdvancedGpuInstancer.prototype.update =
        function (dt) {
            if (
                !this._alive ||
                this._baking
            ) {
                return;
            }

            if (!this._built) {
                this._retry += dt;

                if (this._retry > 0.85) {
                    this._retry = 0;
                    this.rebuild();
                }

                return;
            }

            this._lastDt = dt;

            var perf = this._perf;
            var on = perf.on;

            var start = on ? performance.now() : 0;
            var t = start;

            this._adaptive(dt);

            this._streamClock += dt;
            this._discoveryClock += dt;

            if (this._discoveryClock >= 3) {
                this._discoveryClock = 0;

                var oldPlayer = this.player;

                this._discover();
                this._refresh();

                if (oldPlayer !== this.player) {
                    this._prevPlayer = null;
                    this._scanPhysics();
                }

                this._catcherVisibilityDirty = true;
            }

            if (
                this._castersDirty &&
                this.optimizeBakedCasters
            ) {
                this._updateCasters();
                this._castersDirty = false;
            }

            if (on) {
                perf.shadows += performance.now() - t;
                t = performance.now();
            }

            if (this._streamClock >= 0.1) {
                var elapsed = this._streamClock;

                this._streamClock = 0;

                this._streamGraphics(elapsed);

                if (on) {
                    perf.graphics += performance.now() - t;
                    t = performance.now();
                }

                this._streamPhysics();

                if (on) {
                    perf.physics += performance.now() - t;
                    t = performance.now();
                }

                this._updateLod();

                if (on) {
                    perf.lod += performance.now() - t;
                    t = performance.now();
                }
            }

            if (on) {
                perf.total += performance.now() - start;
                perf.n++;
            }
        };

    // =====================================================
    // POSTUPDATE
    // =====================================================

    AdvancedGpuInstancer.prototype.postUpdate =
        function () {
            if (
                !this._alive ||
                !this._built ||
                this._baking
            ) {
                return;
            }

            var p = this._perf;
            var on = p.on;

            var start = on ? performance.now() : 0;
            var t = start;

            this._updateSpotShadows();

            if (this._localCasterConfigChanged()) {
                this._castersDirty = true;
            }

            if (
                this._castersDirty &&
                this.optimizeBakedCasters
            ) {
                this._updateCasters();
                this._castersDirty = false;
            }

            if (on) {
                p.shadows += performance.now() - t;
                t = performance.now();
            }

            this._updateCatcher();

            if (on) {
                p.catcher += performance.now() - t;
                p.total += performance.now() - start;
            }
        };

    // =====================================================
    // RESTAURACION COMPLETA
    // =====================================================

    AdvancedGpuInstancer.prototype.restore =
        function () {
            this._alive = false;
            this._built = false;
            this._baking = false;

            if (this._bench) {
                this.cancelBenchmark();
            }

            if (this._castersOriginal) {
                this._restoreCasters();
            }

            if (this._spotStates) {
                this._restoreSpotShadows();
            }

            this._destroyCatcher();
            this._stopLod();

            (this.groups || []).forEach(function (g) {
                if (g.mi) {
                    try {
                        g.mi.setInstancing(null);
                    } catch (_) { }
                }

                if (g.proxy) {
                    try {
                        g.proxy.destroy();
                    } catch (_) { }
                }

                if (g.vb) {
                    try {
                        g.vb.destroy();
                    } catch (_) { }
                }
            });

            (this._hidden || []).forEach(function (h) {
                try {
                    h.mi.visible = h.visible;
                } catch (_) { }
            });

            this._restorePhysics();

            if (this._materials) {
                this._materials.forEach(function (m) {
                    try {
                        m.destroy();
                    } catch (_) { }
                });

                this._materials.clear();
            }

            if (this._ownedLod) {
                this._ownedLod.forEach(function (m) {
                    try {
                        m.destroy();
                    } catch (_) { }
                });

                this._ownedLod.clear();
            }

            this.groups = [];
            this._hidden = [];

            this._lodMeshes = new Map();

            this._ids = new WeakMap();
            this._id = 0;

            this._prevPlayer = null;
            this._castersDirty = true;

            if (this._localCasterWatch) {
                this._localCasterWatch.clear();
            }

            if (this._projectionCache) {
                this._projectionCache.clear();
            }

            if (this._dynamicSnapshots) {
                this._dynamicSnapshots.length = 0;
            }

            if (this._activeCasterSnapshots) {
                this._activeCasterSnapshots.length = 0;
            }

            if (this._cameraVisibilityCache) {
                this._cameraVisibilityCache.length = 0;
            }

            this._catcherVisibilityDirty = true;

            if (this.app) {
                this.app.fire('agi:restored', this);
                this.app.fire('gi:restored', this);
            }
        };

    // =====================================================
    // AUDITORIA DEL SPOT
    // =====================================================

    AdvancedGpuInstancer.prototype.auditSpotDistances =
        function () {
            var cameraList = cams(this);
            var rows = [];

            this._watchLights.forEach(function (l) {
                if (l.type !== 'spot') return;

                var st = this._spotStates.get(l);

                var lightPos = l.entity.getPosition();
                var best = Infinity;

                cameraList.forEach(function (c) {
                    var p = c.entity.getPosition();

                    best = Math.min(
                        best,
                        Math.hypot(
                            p.x - lightPos.x,
                            p.y - lightPos.y,
                            p.z - lightPos.z
                        )
                    );
                });

                rows.push({
                    luz: l.entity.name,
                    shadowDistance: l.shadowDistance,
                    range: l.range,

                    distanciaCamara:
                        Number.isFinite(best)
                            ? +best.toFixed(2)
                            : null,

                    sombraConfigurada:
                        st ? st.original : l.castShadows,

                    sombraEfectiva: l.castShadows,

                    suspendidaPorAGI:
                        st ? st.suspended : false,

                    iluminacionActiva:
                        l.enabled && live(l.entity),

                    updateMode: l.shadowUpdateMode
                });

            }, this);

            console.table(rows);

            return rows;
        };

    // =====================================================
    // DISTANCIAS CONFIGURADAS POR EL JUEGO
    // =====================================================

    AdvancedGpuInstancer.prototype.auditEngineDistances =
        function () {
            var rows = [];

            cams(this).forEach(function (c) {
                rows.push({
                    tipo: 'camera',
                    nombre: c.entity.name,
                    farClip: c.farClip,
                    nearClip: c.nearClip,
                    frustumCulling: c.frustumCulling
                });
            });

            this._watchLights.forEach(function (l) {
                rows.push({
                    tipo: l.type,
                    nombre: l.entity.name,

                    shadowDistance: l.shadowDistance,

                    range:
                        l.type === 'directional'
                            ? 'no aplica'
                            : l.range,

                    castShadows: l.castShadows,
                    shadowUpdateMode: l.shadowUpdateMode,
                    bake: l.bake,
                    affectLightmapped: l.affectLightmapped
                });
            });

            console.table(rows);

            return rows;
        };

    // =====================================================
    // AGI3.9 - AUDITORIA DE SOMBRAS
    // =====================================================

    AdvancedGpuInstancer.prototype.auditShadows =
        function () {
            var n = this.stats;

            var row = {
                version: 'AGI3.9',

                castersBakedSoloSpot:
                    n.bakedSpotRetained,

                castersBakedSinRealtime:
                    n.bakedCastersDisabled,

                direccionalExcluida:
                    n.bakedDirectionalExcluded,

                spotsSuspendidos:
                    n.spotSuspended,

                transicionesSpot:
                    n.spotDistanceTransitions,

                castersDinamicos:
                    n.dynamicCasterCount,

                catcherActivo:
                    this._catcherActive,

                quadsCatcher:
                    n.catcherTiles,

                cacheCatcher:
                    n.catcherCacheHits,

                proyecciones:
                    n.shadowProjectionRebuilds,

                testsCamaras:
                    n.catcherVisibilityTests,

                actualizacionesAABB:
                    n.casterAabbUpdates,

                drawCalls:
                    this.app.stats.drawCallCount
            };

            console.table([row]);

            return row;
        };

    // =====================================================
    // STREAMING REPORT
    // =====================================================

    AdvancedGpuInstancer.prototype.auditStreaming =
        function () {
            var n = this.stats;

            var row = {
                version: 'AGI3.9',

                instancias: n.instances,
                grupos: n.groups,
                residentes: n.residentGroups,

                bytes: n.instanceBytes,
                bytesResidentes: n.residentInstanceBytes,

                uploads: n.vbUploads,
                unloads: n.vbUnloads,

                colisionesOptIn: this._phys.length,
                colisionesActivas: this._physActive.size
            };

            console.table([row]);

            return row;
        };

    // =====================================================
    // CPU PROFILER
    // =====================================================

    AdvancedGpuInstancer.prototype.auditPerformance =
        function (enabled) {
            var p = this._perf;

            if (enabled === true) {
                p.on = true;
                p.n = 0;

                p.total = 0;
                p.shadows = 0;
                p.catcher = 0;
                p.graphics = 0;
                p.physics = 0;
                p.lod = 0;

            } else if (enabled === false) {
                p.on = false;
            }

            var n = p.n || 1;

            var row = {
                version: 'AGI3.9',
                samples: p.n,

                cpuAGIMs:
                    p.n ? +(p.total / n).toFixed(4) : null,

                cpuSombrasMs:
                    p.n ? +(p.shadows / n).toFixed(4) : null,

                cpuCatcherMs:
                    p.n ? +(p.catcher / n).toFixed(4) : null,

                cpuCeldasMs:
                    p.n ? +(p.graphics / n).toFixed(4) : null,

                cpuFisicaMs:
                    p.n ? +(p.physics / n).toFixed(4) : null,

                cpuLodMs:
                    p.n ? +(p.lod / n).toFixed(4) : null,

                drawCalls:
                    this.app.stats.drawCallCount
            };

            console.table([row]);

            return row;
        };

    // =====================================================
    // AUDITORIA GLOBAL
    // =====================================================

    AdvancedGpuInstancer.prototype.audit =
        function () {
            return {
                performance: this.auditPerformance(),
                shadows: this.auditShadows(),
                spot: this.auditSpotDistances(),
                stream: this.auditStreaming(),
                game: this.auditEngineDistances()
            };
        };

    AdvancedGpuInstancer.prototype.mobileReport =
        function () {
            return this.audit();
        };

    AdvancedGpuInstancer.prototype.auditShadowRouting =
        function () {
            var rows = [];

            this._castersOriginal.forEach(function (orig, c) {
                if (
                    !c.entity ||
                    c.entity._destroyed
                ) {
                    return;
                }

                rows.push({
                    nombre: c.entity.name,

                    proxy:
                        !!c.entity.__agiProxy,

                    realtime:
                        c.castShadows,

                    cascadas:
                        (c.meshInstances || [])
                            .map(function (mi) {
                                return mi.shadowCascadeMask;
                            }).join(','),

                    miCast:
                        (c.meshInstances || [])
                            .some(function (mi) {
                                return mi.castShadow;
                            })
                });
            });

            console.table(rows);

            return rows;
        };

    // =====================================================
    // BENCHMARK
    // =====================================================

    AdvancedGpuInstancer.prototype.benchmark =
        function (seconds) {
            if (this._bench) {
                return console.warn(
                    TAG,
                    'Benchmark ya activo'
                );
            }

            var s = this;
            var sec = clamp(+seconds || 10, 3, 120);

            var start = performance.now();
            var last = start;

            var frames = [];
            var calls = [];
            var pauses = 0;

            function tick() {
                var t = performance.now();
                var dt = t - last;

                last = t;

                if (dt > 250) {
                    pauses++;
                    return;
                }

                if (dt > 0) {
                    frames.push(dt);

                    calls.push(
                        s.app.stats.drawCallCount
                    );
                }
            }

            function stop() {
                if (s._bench !== state) return;

                s.app.off('frameend', tick);

                clearTimeout(state.timer);
                s._bench = null;

                var cpu = s.auditPerformance(false);
                var elapsed = performance.now() - start;

                var row = {
                    version: 'AGI3.9',

                    seg:
                        +(elapsed / 1000).toFixed(2),

                    frames:
                        frames.length,

                    fps:
                        +(
                            frames.length * 1000 /
                            Math.max(1, elapsed)
                        ).toFixed(2),

                    frameP50:
                        median(frames, 0.5),

                    frameP95:
                        median(frames, 0.95),

                    drawsP50:
                        median(calls, 0.5),

                    drawsP95:
                        median(calls, 0.95),

                    cpuAGIMs:
                        cpu.cpuAGIMs,

                    cpuCatcherMs:
                        cpu.cpuCatcherMs,

                    spotSuspendido:
                        s.stats.spotSuspended,

                    pausas:
                        pauses
                };

                console.log(TAG, 'BENCHMARK');
                console.table([row]);

                s.auditSpotDistances();

                return row;
            }

            var state = {
                stop: stop,
                timer: null
            };

            this._bench = state;
            this.auditPerformance(true);

            this.app.on('frameend', tick);

            state.timer = setTimeout(
                stop,
                sec * 1000
            );

            console.log(
                TAG,
                'Benchmark',
                sec,
                's'
            );
        };

    AdvancedGpuInstancer.prototype.cancelBenchmark =
        function () {
            if (this._bench) {
                this._bench.stop();
            }
        };

    // =====================================================
    // ESTIMACION DE ESCALADO
    // =====================================================

    AdvancedGpuInstancer.prototype.estimateScaling =
        function () {
            var n = this.stats;

            var avg = n.groups
                ? n.instances / n.groups
                : 0;

            var unit = n.instances
                ? n.instanceBytes / n.instances
                : 0;

            var rows = [1000, 5000, 10000]
                .map(function (q) {
                    return {
                        objetos: q,

                        grupos:
                            avg
                                ? Math.ceil(q / avg)
                                : null,

                        bytes:
                            Math.round(q * unit),

                        fps:
                            'medir en runtime'
                    };
                });

            console.table(rows);

            return rows;
        };

})();