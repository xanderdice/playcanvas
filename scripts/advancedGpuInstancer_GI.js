
/*
 * AGI4.15.1 - Advanced GPU Instancer / Clean Code
 * PlayCanvas 2.23.x | WebGPU / WebGL2 | BakePT6.6.0
 * ID inalterado: advancedGpuInstancer
 *
 * No modifica luces ni PT. Clasifica las fuentes ANTES del bake.
 * Reglas automaticas:
 *   lightmapped=true y estatico -> caster baked; realtime se suprime tras PT.
 *   no lightmapped + caster realtime -> exclusivamente realtime.
 *   no lightmapped + sin caster realtime + castShadowsLightmap -> baked-only.
 * Overrides opcionales: agi-bake-caster, agi-realtime-only,
 *                         agi-keep-realtime-shadows, agi-no-instance.
 * Necesita reiniciar Launch para corregir sombras YA horneadas.
 */
var AdvancedGpuInstancer = pc.createScript('advancedGpuInstancer');

[
    ['chunkSize', 'number', 96, 8],
    ['scanInterval', 'number', 1.5, 0.2],
    ['directionalShadowCatcher', 'boolean', true],
    ['smartShadowCatcher', 'boolean', true],
    ['bakedShadowMask', 'boolean', true],
    ['bakedShadowRatio', 'number', 0.56, 0.05, 0.95],
    ['bakedShadowSoftness', 'number', 0.10, 0.01, 0.40],
    ['distanceCulling', 'boolean', true],
    ['physicsStreaming', 'boolean', true],
    ['debug', 'boolean', true]
].forEach(function (a) {
    var options = {
        type: a[1],
        default: a[2],
        title: a[0]
    };

    if (a.length > 3) {
        options.min = a[3];
        if (a.length > 4) {
            options.max = a[4];
        }
    }

    AdvancedGpuInstancer.attributes.add(a[0], options);
});

(function () {
    'use strict';

    var TAG = '[AGI4.15.1]';

    // ======================================================
    // CONSTANTES
    // ======================================================

    var MAX_INSTANCES_PER_GROUP = 256;
    var INSTANCE_FLOATS = 20; // 16 Mat4 + 4 UV1 atlas.
    var CATCHER_INTERVAL = 0.15;
    var PHYSICS_INTERVAL = 0.22;
    var DEFAULT_ATLAS_RECT = [0, 0, 1, 1];

    var SEM = [
        pc.SEMANTIC_ATTR11,
        pc.SEMANTIC_ATTR12,
        pc.SEMANTIC_ATTR14,
        pc.SEMANTIC_ATTR15,
        pc.SEMANTIC_ATTR13
    ];

    // ======================================================
    // SHADERS INSTANCING
    // ======================================================

    var GL = [
        'attribute vec4 aAGI0,aAGI1,aAGI2,aAGI3,aAGIRect;',
        'mat4 getModelMatrix(){return mat4(aAGI0,aAGI1,aAGI2,aAGI3);}'
    ].join('\n');

    var WG = [
        'attribute aAGI0: vec4f;',
        'attribute aAGI1: vec4f;',
        'attribute aAGI2: vec4f;',
        'attribute aAGI3: vec4f;',
        'attribute aAGIRect: vec4f;',
        'fn getModelMatrix() -> mat4x4f {',
        '  return mat4x4f(aAGI0,aAGI1,aAGI2,aAGI3);',
        '}'
    ].join('\n');

    var UVG =
        '\n#if defined(INSTANCING) && defined(UV1_UNMODIFIED)\n' +
        'vUv1=vUv1*aAGIRect.zw+aAGIRect.xy;\n#endif';

    var UVW =
        '\n#if defined(INSTANCING) && defined(UV1_UNMODIFIED)\n' +
        'output.vUv1=output.vUv1*aAGIRect.zw+aAGIRect.xy;\n#endif';

    // ======================================================
    // BAKED SHADOW MASK
    // ======================================================

    // Misma mascara perceptual de AGI4.15.
    // No agrega draw calls.
    //
    // El color oscuro del atlas NO equivale a una
    // visibilidad baked fisicamente exacta.

    var MVG =
        'varying vec2 vAGIBakeUV; varying vec4 vAGIBakeRect;' +
        'attribute vec2 aAGIBakeUV;';

    var MVW =
        'varying vAGIBakeUV:vec2f; varying vAGIBakeRect:vec4f;' +
        'attribute aAGIBakeUV:vec2f;';

    var MEG =
        'vAGIBakeUV=aAGIBakeUV*aAGIRect.zw+aAGIRect.xy;' +
        'vAGIBakeRect=aAGIRect;';

    var MEW =
        'output.vAGIBakeUV=aAGIBakeUV*aAGIRect.zw+aAGIRect.xy;' +
        'output.vAGIBakeRect=aAGIRect;';

    var MPG = [
        'varying vec2 vAGIBakeUV; varying vec4 vAGIBakeRect;',
        'uniform sampler2D agiBakedAtlas; uniform vec4 agiMaskParams;',
        'float agiLum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}'
    ].join('\n');

    var MPW = [
        'varying vAGIBakeUV:vec2f; varying vAGIBakeRect:vec4f;',
        'var agiBakedAtlas:texture_2d<f32>;',
        'var agiBakedAtlasSampler:sampler;',
        'uniform agiMaskParams:vec4f;',
        'fn agiLum(c:vec3f)->f32{return dot(c,vec3f(.2126,.7152,.0722));}'
    ].join('\n');

    var MFG = [
        'if(agiMaskParams.z>.5){',
        'vec2 ro=vAGIBakeRect.xy,rs=vAGIBakeRect.zw;',
        'float refL=.0001;',
        'refL=max(refL,agiLum(texture2D(agiBakedAtlas,ro+rs*vec2(.17,.17)).rgb));',
        'refL=max(refL,agiLum(texture2D(agiBakedAtlas,ro+rs*vec2(.83,.17)).rgb));',
        'refL=max(refL,agiLum(texture2D(agiBakedAtlas,ro+rs*vec2(.17,.83)).rgb));',
        'refL=max(refL,agiLum(texture2D(agiBakedAtlas,ro+rs*vec2(.83,.83)).rgb));',
        'float lum=agiLum(texture2D(agiBakedAtlas,vAGIBakeUV).rgb);',
        'float w=smoothstep(agiMaskParams.x-agiMaskParams.y,',
        'agiMaskParams.x+agiMaskParams.y,lum/refL);',
        'gl_FragColor.rgb=mix(vec3(1.),gl_FragColor.rgb,w);',
        '}'
    ].join('\n');

    var MFW = [
        'if(uniform.agiMaskParams.z>.5){',
        'let ro=vAGIBakeRect.xy; let rs=vAGIBakeRect.zw;',
        'var refL:f32=.0001;',
        'refL=max(refL,agiLum(textureSampleLevel(agiBakedAtlas,agiBakedAtlasSampler,ro+rs*vec2f(.17,.17),0.).rgb));',
        'refL=max(refL,agiLum(textureSampleLevel(agiBakedAtlas,agiBakedAtlasSampler,ro+rs*vec2f(.83,.17),0.).rgb));',
        'refL=max(refL,agiLum(textureSampleLevel(agiBakedAtlas,agiBakedAtlasSampler,ro+rs*vec2f(.17,.83),0.).rgb));',
        'refL=max(refL,agiLum(textureSampleLevel(agiBakedAtlas,agiBakedAtlasSampler,ro+rs*vec2f(.83,.83),0.).rgb));',
        'let lum=agiLum(textureSampleLevel(agiBakedAtlas,agiBakedAtlasSampler,vAGIBakeUV,0.).rgb);',
        'let w=smoothstep(uniform.agiMaskParams.x-uniform.agiMaskParams.y,',
        'uniform.agiMaskParams.x+uniform.agiMaskParams.y,lum/refL);',
        'output.color=vec4f(mix(vec3f(1.),output.color.rgb,w),output.color.a);',
        '}'
    ].join('\n');

    // ======================================================
    // UTILIDADES
    // ======================================================

    function alive(e) {
        return !!(e && e.enabled && !e._destroyed);
    }

    function tag(e, n) {
        return !!(e && e.tags && e.tags.has(n));
    }

    function num(x) {
        return Number.isFinite(x) ? +x.toFixed(3) : null;
    }

    // ======================================================
    // CACHE DE PARAMETROS GPU
    // ======================================================

    // Evita crear un nuevo Float32Array en cada ciclo.
    // Math.fround evita falsos cambios por precision float32.

    function maskParams(s) {
        var ratio = Math.fround(
            Math.max(.05, Math.min(.95, s.bakedShadowRatio))
        );

        var softness = Math.fround(
            Math.max(.01, Math.min(.4, s.bakedShadowSoftness))
        );

        var enabled = s.bakedShadowMask ? 1 : 0;
        var p = s._maskParams;

        if (
            !p ||
            p[0] !== ratio ||
            p[1] !== softness ||
            p[2] !== enabled
        ) {
            s._maskParams = new Float32Array([
                ratio,
                softness,
                enabled,
                0
            ]);

            s._maskVersion++;
        }

        return s._maskParams;
    }

    function syncMaskParams(s) {
        var p = maskParams(s);

        if (s._maskUploadedVersion === s._maskVersion) {
            return;
        }

        s._groups.forEach(function (group) {
            if (group.catcher) {
                group.catcher.mi.setParameter(
                    'agiMaskParams',
                    p
                );
            }
        });

        s._maskUploadedVersion = s._maskVersion;
    }

    // ======================================================
    // IDENTIFICADORES Y LIGHTMAPS
    // ======================================================

    function oid(s, x) {
        if (!x) return 0;

        if (!s._ids.has(x)) {
            s._ids.set(x, ++s._id);
        }

        return s._ids.get(x);
    }

    function param(mi, n) {
        var p = mi.getParameter ?
            mi.getParameter(n) : null;

        return p && p.data !== undefined ?
            p.data : p;
    }

    function lm(mi) {
        var names =
            pc.MeshInstance.lightmapParamNames ||
            [
                'texture_lightMap',
                'texture_dirLightMap'
            ];

        var tex =
            param(mi, names[0]) ||
            param(mi, 'instance_lightMap') ||
            param(mi, 'texture_lightMap');

        var dir =
            param(mi, names[1]) ||
            param(mi, 'texture_dirLightMap');

        var rect = param(mi, 'uPT6LmRect');

        if (!(tex && typeof tex === 'object' && tex.width)) {
            tex = null;
        }

        if (!(dir && typeof dir === 'object' && dir.width)) {
            dir = null;
        }

        return {
            name: names[0],
            dirName: names[1],
            tex: tex,
            dir: dir,
            rect: rect && rect.length === 4 ?
                Array.from(rect) : null
        };
    }

    // ======================================================
    // BOUNDS
    // ======================================================

    function bounds(mi) {
        var a = mi && mi.aabb;

        if (!a) return null;

        var c = a.center;
        var h = a.halfExtents;

        return [
            c.x - h.x,
            c.y - h.y,
            c.z - h.z,
            c.x + h.x,
            c.y + h.y,
            c.z + h.z
        ];
    }

    function merge(a, b) {
        if (!a) return b ? b.slice() : null;
        if (!b) return a;

        return [
            Math.min(a[0], b[0]),
            Math.min(a[1], b[1]),
            Math.min(a[2], b[2]),
            Math.max(a[3], b[3]),
            Math.max(a[4], b[4]),
            Math.max(a[5], b[5])
        ];
    }

    function aabb(b) {
        return new pc.BoundingBox(
            new pc.Vec3(
                (b[0] + b[3]) / 2,
                (b[1] + b[4]) / 2,
                (b[2] + b[5]) / 2
            ),
            new pc.Vec3(
                (b[3] - b[0]) / 2,
                (b[4] - b[1]) / 2,
                (b[5] - b[2]) / 2
            )
        );
    }

    function isFloor(c) {
        return (
            c.type === 'plane' ||
            tag(c.entity, 'agi-floor')
        );
    }

    function cameras(s) {
        return s.app.root
            .findComponents('camera')
            .filter(function (c) {
                return c.enabled && alive(c.entity);
            });
    }

    function directionals(s) {
        return s.app.root
            .findComponents('light')
            .filter(function (l) {
                return (
                    l.enabled &&
                    alive(l.entity) &&
                    l.type === 'directional' &&
                    l.castShadows &&
                    l.affectDynamic
                );
            });
    }

    function spots(s) {
        return s.app.root
            .findComponents('light')
            .filter(function (l) {
                return (
                    l.enabled &&
                    alive(l.entity) &&
                    l.type === 'spot'
                );
            });
    }

    // ======================================================
    // PRE-BAKE POLICY
    // ======================================================

    // Esta es la politica funcional validada de AGI4.15.
    //
    // No depende de UV1 ni de un lightmap asignado.
    // Un objeto puede proyectar sombra horneada
    // sin recibir un lightmap propio.

    function bakeRole(c) {
        if (
            !c ||
            !c.entity ||
            c.entity.__agiProxy ||
            c.entity.__agiCatcher
        ) {
            return 'ignore';
        }

        if (
            tag(c.entity, 'agi-realtime-only') ||
            tag(c.entity, 'agi-no-bake-shadow')
        ) {
            return 'realtime';
        }

        if (
            tag(c.entity, 'agi-bake-caster') ||
            tag(c.entity, 'agi-baked-only')
        ) {
            return 'baked';
        }

        if (!c.isStatic) {
            return 'realtime';
        }

        if (c.lightmapped) {
            return 'baked';
        }

        if (c.castShadows) {
            return 'realtime';
        }

        return c.castShadowsLightmap ?
            'baked' : 'none';
    }

    function preBakePolicy(s) {
        s.app.root
            .findComponents('render')
            .forEach(function (c) {
                if (
                    !c ||
                    !c.entity ||
                    c.entity._destroyed ||
                    c.entity.__agiProxy ||
                    c.entity.__agiCatcher
                ) {
                    return;
                }

                var role = bakeRole(c);

                if (role === 'ignore') {
                    return;
                }

                if (!s._bakeOriginal.has(c)) {
                    s._bakeOriginal.set(c, {
                        castShadowsLightmap:
                            !!c.castShadowsLightmap,
                        role: role
                    });
                }

                // Los objetos realtime no deben
                // proyectar sombras durante el bake.
                //
                // Para los baked se preserva la
                // configuracion original.

                var target = role === 'realtime' ?
                    false :
                    s._bakeOriginal.get(c)
                        .castShadowsLightmap;

                if (
                    !!c.castShadowsLightmap !==
                    !!target
                ) {
                    c.castShadowsLightmap = !!target;

                    s._counts.bakeChanges++;
                }
            });
    }

    function restoreBake(s) {
        s._bakeOriginal.forEach(
            function (old, c) {
                if (
                    c &&
                    c.entity &&
                    !c.entity._destroyed
                ) {
                    c.castShadowsLightmap =
                        old.castShadowsLightmap;
                }
            }
        );

        s._bakeOriginal.clear();
    }

    // ======================================================
    // DETECCION DE PT
    // ======================================================

    function ptReady(s) {
        return s.app.root
            .findComponents('render')
            .some(function (c) {
                return (
                    c.lightmapped &&
                    !c.entity.__agiProxy &&
                    !c.entity.__agiCatcher &&
                    (c.meshInstances || [])
                        .some(function (mi) {
                            return mi && !!lm(mi).tex;
                        })
                );
            });
    }

    // ======================================================
    // CASTERS BAKED
    // ======================================================

    function bakedCaster(c) {
        if (
            !c ||
            !c.isStatic ||
            tag(c.entity, 'agi-keep-realtime-shadows') ||
            tag(c.entity, 'agi-spot-caster') ||
            tag(c.entity, 'agi-realtime-only')
        ) {
            return false;
        }

        return (
            !!c.castShadowsLightmap &&
            (
                c.lightmapped ||
                tag(c.entity, 'agi-bake-caster') ||
                tag(c.entity, 'agi-baked-only')
            )
        );
    }

    // ======================================================
    // SUPRESION REALTIME POST-BAKE
    // ======================================================

    function suppressBakedRealtime(s) {
        // No desactivar casters hasta que PT
        // haya producido los lightmaps.

        if (!ptReady(s)) {
            return;
        }

        s.app.root
            .findComponents('render')
            .forEach(function (c) {
                if (
                    !c ||
                    !c.enabled ||
                    !alive(c.entity) ||
                    c.entity.__agiProxy ||
                    c.entity.__agiCatcher ||
                    !bakedCaster(c)
                ) {
                    return;
                }

                var mis = c.meshInstances || [];

                if (!mis.length) {
                    return;
                }

                if (!s._casterOriginal.has(c)) {
                    s._casterOriginal.set(c, {
                        component:
                            !!c.castShadows,

                        mesh: mis.map(function (mi) {
                            return {
                                mi: mi,
                                cast: !!mi.castShadow
                            };
                        })
                    });
                }

                var was =
                    c.castShadows ||
                    mis.some(function (mi) {
                        return mi.castShadow;
                    });

                if (c.castShadows) {
                    c.castShadows = false;
                }

                mis.forEach(function (mi) {
                    mi.castShadow = false;
                });

                if (was) {
                    s._counts.bakedCasterSuppressed++;
                }
            });
    }

    function restoreRealtime(s) {
        s._casterOriginal.forEach(
            function (old, c) {
                if (
                    !c ||
                    !c.entity ||
                    c.entity._destroyed
                ) {
                    return;
                }

                c.castShadows = old.component;

                old.mesh.forEach(function (x) {
                    if (x.mi) {
                        x.mi.castShadow = x.cast;
                    }
                });
            }
        );

        s._casterOriginal.clear();
    }

    // ======================================================
    // CASTERS REALTIME
    // ======================================================

    function realtimeCasters(s) {
        var out = [];

        s.app.root
            .findComponents('render')
            .forEach(function (c) {
                if (
                    !c.enabled ||
                    !alive(c.entity) ||
                    !c.castShadows ||
                    c.entity.__agiProxy ||
                    c.entity.__agiCatcher ||
                    s._parked.has(c) ||
                    tag(c.entity, 'agi-no-catcher') ||
                    bakedCaster(c)
                ) {
                    return;
                }

                (c.meshInstances || [])
                    .forEach(function (mi) {
                        if (
                            mi &&
                            mi.mesh &&
                            mi.visible &&
                            mi.castShadow &&
                            (
                                mi.mask &
                                (pc.MASK_AFFECT_DYNAMIC || 1)
                            )
                        ) {
                            out.push({
                                c: c,
                                mi: mi
                            });
                        }
                    });
            });

        return out;
    }

    // ======================================================
    // SELECCION DE FUENTES GPU
    // ======================================================

    // Devuelve la informacion lightmap si la
    // fuente es elegible; false en caso contrario.
    //
    // Asi no consultamos el mismo atlas dos veces
    // durante sources().

    function eligible(c) {
        if (
            !c ||
            !c.enabled ||
            !alive(c.entity) ||
            !c.isStatic ||
            c.entity.__agiProxy ||
            c.entity.__agiCatcher ||
            tag(c.entity, 'agi-no-instance') ||
            tag(c.entity, 'agi-native-spot-receiver') ||
            c.batchGroupId >= 0 ||
            !c.meshInstances ||
            c.meshInstances.length !== 1
        ) {
            return false;
        }

        var mi = c.meshInstances[0];

        if (
            !mi ||
            !mi.mesh ||
            !mi.mesh.vertexBuffer ||
            !mi.node ||
            !mi.material ||
            !mi.visible ||
            mi.instancingData ||
            mi.skinInstance ||
            mi.morphInstance ||
            mi.calculateSortDistance
        ) {
            return false;
        }

        if (
            !(mi.material instanceof pc.StandardMaterial) ||
            mi.material.blendType !== pc.BLEND_NONE
        ) {
            return false;
        }

        var pr = mi.mesh.primitive;

        if (
            !pr ||
            pr.length !== 1 ||
            pr[0].type !== pc.PRIMITIVE_TRIANGLES
        ) {
            return false;
        }

        var fmt =
            mi.mesh.vertexBuffer.getFormat();

        if (
            !fmt ||
            fmt.elements.some(function (e) {
                return SEM.indexOf(e.name) >= 0;
            })
        ) {
            return false;
        }

        var m = lm(mi);

        if (c.lightmapped) {
            if (
                !m.tex ||
                !m.rect ||
                m.rect[2] <= 0 ||
                m.rect[3] <= 0 ||
                !fmt.elements.some(function (e) {
                    return e.name ===
                        pc.SEMANTIC_TEXCOORD1;
                })
            ) {
                return false;
            }

        } else if (m.tex) {
            return false;
        }

        // No combinar meshInstances que tengan
        // parametros privados incompatibles.

        if (
            mi.parameters &&
            mi.parameters.forEach
        ) {
            var extra = false;

            mi.parameters.forEach(
                function (v, n) {
                    if (
                        n !== m.name &&
                        n !== m.dirName &&
                        n !== 'instance_lightMap' &&
                        n !== 'texture_lightMap' &&
                        n !== 'texture_dirLightMap' &&
                        n !== 'uPT6LmRect'
                    ) {
                        extra = true;
                    }
                }
            );

            if (extra) {
                return false;
            }
        }

        return m;
    }

    // ======================================================
    // MATERIALES Y SHADER CHUNKS
    // ======================================================

    function getMaterial(s, source, catcher) {
        var cache = catcher ?
            s._catchMaterials :
            s._materials;

        if (cache.has(source)) {
            return cache.get(source);
        }

        var mat = catcher ?
            new pc.StandardMaterial() :
            source.clone();

        mat.name =
            (source.name || 'Material') +
            '_AGI415' +
            (catcher ? '_Catcher' : '');

        if (catcher) {
            mat.shadowCatcher = true;
            mat.blendType = pc.BLEND_MULTIPLICATIVE;

            mat.depthWrite = false;
            mat.depthTest = true;
            mat.cull = pc.CULLFACE_NONE;

            mat.diffuse.set(0, 0, 0);
            mat.specular.set(0, 0, 0);

            mat.useSkybox = false;
        }

        mat.shaderChunksVersion = '2.23';

        [
            [
                pc.SHADERLANGUAGE_GLSL,
                GL,
                UVG,
                true
            ],
            [
                pc.SHADERLANGUAGE_WGSL,
                WG,
                UVW,
                false
            ]
        ].forEach(function (data) {
            var chunks =
                mat.getShaderChunks(data[0]);

            chunks.set(
                'transformInstancingVS',
                data[1]
            );

            function add(n, v) {
                chunks.set(
                    n,
                    (chunks.get(n) || '') +
                    '\n' + v
                );
            }

            if (!catcher) {
                add('litUserMainEndVS', data[2]);

            } else {
                add(
                    'litUserDeclarationVS',
                    data[3] ? MVG : MVW
                );

                add(
                    'litUserMainEndVS',
                    data[3] ? MEG : MEW
                );

                add(
                    'litUserDeclarationPS',
                    data[3] ? MPG : MPW
                );

                add(
                    'litUserMainEndPS',
                    data[3] ? MFG : MFW
                );
            }
        });

        [
            'aAGI0',
            'aAGI1',
            'aAGI2',
            'aAGI3',
            'aAGIRect'
        ].forEach(function (n, i) {
            mat.setAttribute(n, SEM[i]);
        });

        if (catcher) {
            mat.setAttribute(
                'aAGIBakeUV',
                pc.SEMANTIC_TEXCOORD1
            );
        }

        mat.update();

        cache.set(source, mat);

        return mat;
    }

    // ======================================================
    // BUFFER DE INSTANCIAS
    // ======================================================

    function packed(items) {
        var data = new Float32Array(
            items.length * INSTANCE_FLOATS
        );

        items.forEach(function (x, i) {
            var m =
                x.mi.node.getWorldTransform().data;

            var k = i * INSTANCE_FLOATS;

            for (var j = 0; j < 16; j++) {
                data[k + j] = m[j];
            }

            data.set(
                x.lm.rect || DEFAULT_ATLAS_RECT,
                k + 16
            );
        });

        return data;
    }

    // ======================================================
    // SHADOW CATCHER
    // ======================================================

    function makeCatcher(s, g) {
        var entity = null;

        try {
            var source = g.items[0];

            entity = new pc.Entity(
                'AGI415_Catcher_' +
                source.c.entity.name
            );

            entity.__agiCatcher = true;

            s.app.root.addChild(entity);

            var mi = new pc.MeshInstance(
                source.mi.mesh,
                getMaterial(
                    s,
                    source.mi.material,
                    true
                ),
                entity
            );

            mi.setInstancing(g.vb, true);

            mi.setParameter(
                'agiBakedAtlas',
                source.lm.tex
            );

            mi.setParameter(
                'agiMaskParams',
                maskParams(s)
            );

            mi.castShadow = false;
            mi.receiveShadow = true;

            entity.addComponent('render', {
                meshInstances: [mi],
                layers: source.layers.slice(),
                castShadows: false,
                receiveShadows: true
            });

            entity.render.isStatic = false;
            entity.render.lightmapped = false;

            mi.mask =
                pc.MASK_AFFECT_DYNAMIC || 1;

            mi.castShadow = false;
            mi.receiveShadow = true;

            entity.render.customAabb =
                aabb(g.bounds);

            mi.aabb = aabb(g.bounds);

            entity.enabled = false;

            g.catcher = {
                entity: entity,
                mi: mi,
                reason: 'inicial',
                z: null,
                distance: null
            };

        } catch (err) {
            if (entity) {
                entity.destroy();
            }

            console.warn(
                TAG,
                'No se pudo crear catcher:',
                err
            );
        }
    }

    // ======================================================
    // ESTADO DE SOMBRAS MESHINSTANCE
    // ======================================================

    // PlayCanvas puede modificar los flags al crear
    // el RenderComponent.
    //
    // Por eso esta funcion se aplica antes y despues
    // de addComponent. NO es trabajo duplicado accidental.

    function applyMeshShadowState(target, source, isBaked) {
        target.mask = source.mask;

        target.castShadow = isBaked ?
            false :
            !!source.castShadow;

        target.receiveShadow =
            !!source.receiveShadow;

        target.shadowCascadeMask =
            source.shadowCascadeMask;

        target.shaderPassMask =
            source.shaderPassMask;
    }

    // ======================================================
    // CREAR GRUPO GPU
    // ======================================================

    function makeGroup(s, g) {
        var src = g.items[0];
        var entity = null;
        var vb = null;

        try {
            var data = packed(g.items);

            vb = new pc.VertexBuffer(
                s.app.graphicsDevice,
                s._format,
                g.items.length,
                {
                    data: data,
                    usage: pc.BUFFER_DYNAMIC
                }
            );

            entity = new pc.Entity(
                'AGI415_' +
                src.c.entity.name +
                '_' +
                s._groups.size
            );

            entity.__agiProxy = true;

            s.app.root.addChild(entity);

            var mi = new pc.MeshInstance(
                src.mi.mesh,
                getMaterial(
                    s,
                    src.mi.material,
                    false
                ),
                entity
            );

            var baked = !!src.c.lightmapped;

            applyMeshShadowState(
                mi,
                src.mi,
                baked
            );

            mi.renderStyle = src.mi.renderStyle;
            mi.drawOrder = src.mi.drawOrder;
            mi.drawBucket = src.mi.drawBucket;

            mi.setInstancing(vb, true);

            entity.addComponent('render', {
                meshInstances: [mi],
                layers: src.layers.slice(),

                castShadows: baked ?
                    false :
                    !!src.c.castShadows,

                receiveShadows:
                    !!src.c.receiveShadows
            });

            entity.render.isStatic = true;
            entity.render.lightmapped = baked;

            entity.render.castShadows = baked ?
                false :
                !!src.c.castShadows;

            entity.render.receiveShadows =
                !!src.c.receiveShadows;

            // Preservar el atlas nativo PT.

            if (baked) {
                mi.setRealtimeLightmap(
                    src.lm.name,
                    src.lm.tex
                );

                if (src.lm.dir) {
                    mi.setRealtimeLightmap(
                        src.lm.dirName,
                        src.lm.dir
                    );
                }

                mi.setParameter(
                    'uPT6LmRect',
                    [0, 0, 1, 1]
                );
            }

            // Compatibilidad con las definiciones
            // nativas LM / DIRLM de PlayCanvas/PT.

            if (
                typeof mi._updateShaderDefs ===
                'function' &&
                typeof src.mi._shaderDefs ===
                'number'
            ) {
                var bits =
                    mi._shaderDefs &
                    ~src.mi._shaderDefs;

                mi._updateShaderDefs(
                    src.mi._shaderDefs | bits
                );
            }

            // Reaplicar tras crear RenderComponent.

            applyMeshShadowState(
                mi,
                src.mi,
                baked
            );

            entity.render.customAabb =
                aabb(g.bounds);

            mi.aabb = aabb(g.bounds);

            g.entity = entity;
            g.mi = mi;
            g.vb = vb;
            g.data = data;
            g.catcher = null;

            s._groups.set(entity, g);

            if (baked && isFloor(src.c)) {
                makeCatcher(s, g);
            }

            // Solo ocultar los originales cuando
            // el grupo GPU ya existe correctamente.

            g.items.forEach(function (x) {
                if (!s._parked.has(x.c)) {
                    s._parked.set(x.c, {
                        layers: x.c.layers.slice(),
                        visible: x.mi.visible
                    });

                    x.c.layers = [
                        s._hiddenLayer.id
                    ];
                }
            });

            return true;

        } catch (err) {
            if (entity) {
                entity.destroy();
            }

            if (vb) {
                try {
                    vb.destroy();
                } catch (_) { }
            }

            console.error(
                TAG,
                'Grupo omitido:',
                err
            );

            return false;
        }
    }

    // ======================================================
    // CULLING DE SOMBRAS
    // ======================================================

    function cameraDepth(b, cam) {
        var m =
            cam.entity.getWorldTransform().data;

        var fx = -m[8];
        var fy = -m[9];
        var fz = -m[10];

        var box = aabb(b);
        var c = box.center;
        var h = box.halfExtents;

        var d =
            (c.x - m[12]) * fx +
            (c.y - m[13]) * fy +
            (c.z - m[14]) * fz;

        var r =
            Math.abs(fx) * h.x +
            Math.abs(fy) * h.y +
            Math.abs(fz) * h.z;

        return [d - r, d + r];
    }

    function canShadowFloor(g, caster, light) {
        var b = bounds(caster.mi);

        if (!b) {
            return true;
        }

        var m =
            light.entity.getWorldTransform().data;

        var dx = -m[4];
        var dy = -m[5];
        var dz = -m[6];

        if (Math.abs(dy) < .06) {
            return true;
        }

        var y = g.bounds[4];
        var t0 = (y - b[1]) / dy;
        var t1 = (y - b[4]) / dy;

        if (Math.max(t0, t1) < 0) {
            return false;
        }

        var lo = Math.max(
            0,
            Math.min(t0, t1)
        );

        var hi = Math.max(
            0,
            Math.max(t0, t1)
        );

        var x0 =
            b[0] +
            Math.min(lo * dx, hi * dx) - .5;

        var x1 =
            b[3] +
            Math.max(lo * dx, hi * dx) + .5;

        var z0 =
            b[2] +
            Math.min(lo * dz, hi * dz) - .5;

        var z1 =
            b[5] +
            Math.max(lo * dz, hi * dz) + .5;

        return (
            x1 >= g.bounds[0] &&
            x0 <= g.bounds[3] &&
            z1 >= g.bounds[2] &&
            z0 <= g.bounds[5]
        );
    }

    // ======================================================
    // CONTEXTO CATCHER POR CICLO
    // ======================================================

    // Antes: buscar camaras, luces y casters
    // por separado para cada grupo.
    //
    // Ahora: construir el contexto una vez.

    function makeCatcherContext(s) {
        return {
            lights: directionals(s),
            cameras: cameras(s),

            casters: s.smartShadowCatcher ?
                realtimeCasters(s) :
                []
        };
    }

    function catcherDecision(s, g, context) {
        if (!s.directionalShadowCatcher) {
            return {
                on: false,
                reason: 'desactivado'
            };
        }

        var lights = context.lights;
        var cams = context.cameras;

        if (!lights.length) {
            return {
                on: false,
                reason: 'sin directional dinamica'
            };
        }

        if (s.smartShadowCatcher) {
            var relevant = false;
            var casters = context.casters;

            for (
                var i = 0;
                i < lights.length && !relevant;
                i++
            ) {
                for (
                    var j = 0;
                    j < casters.length;
                    j++
                ) {
                    if (
                        (
                            lights[i].mask &
                            casters[j].mi.mask
                        ) &&
                        canShadowFloor(
                            g,
                            casters[j],
                            lights[i]
                        )
                    ) {
                        relevant = true;
                        break;
                    }
                }
            }

            if (!relevant) {
                return {
                    on: false,
                    reason: 'sin caster relevante'
                };
            }
        }

        if (!s.distanceCulling) {
            return {
                on: true,
                reason: 'culling desactivado'
            };
        }

        for (
            var c = 0;
            c < cams.length;
            c++
        ) {
            for (
                var l = 0;
                l < lights.length;
                l++
            ) {
                var camera = cams[c];
                var light = lights[l];

                if (
                    !(
                        light.mask &
                        (pc.MASK_AFFECT_DYNAMIC || 1)
                    )
                ) {
                    continue;
                }

                var dist = Math.min(
                    camera.farClip || Infinity,
                    light.shadowDistance || Infinity
                );

                if (
                    !Number.isFinite(dist) ||
                    dist <= 0
                ) {
                    continue;
                }

                var z = cameraDepth(
                    g.bounds,
                    camera
                );

                var near = Math.max(
                    0,
                    camera.nearClip || 0
                );

                var margin = Math.max(
                    .25,
                    Math.min(3, dist * .04)
                );

                if (
                    z[1] >= near &&
                    z[0] <= dist + margin
                ) {
                    return {
                        on: true,
                        reason: 'shadowDistance',
                        z: z,
                        distance: dist
                    };
                }
            }
        }

        return {
            on: false,
            reason: 'fuera del shadowDistance'
        };
    }

    function updateCatchers(s) {
        var active = 0;

        // Solo actualizar uniforms cuando cambian.

        syncMaskParams(s);

        // Una unica lectura del estado de escena.

        var context = makeCatcherContext(s);

        s._groups.forEach(function (g) {
            if (!g.catcher) {
                return;
            }

            var decision =
                catcherDecision(s, g, context);

            var entity = g.catcher.entity;

            if (entity.enabled !== decision.on) {
                entity.enabled = decision.on;

                s._counts.catcherTransitions++;
            }

            g.catcher.reason = decision.reason;
            g.catcher.z = decision.z || null;
            g.catcher.distance =
                decision.distance || null;

            if (decision.on) {
                active++;
            }
        });

        s._counts.catcherActive = active;
    }

    // ======================================================
    // FIRMA ESTRUCTURAL
    // ======================================================

    function signature(s) {
        var rows = [];

        s.app.root
            .findComponents('render')
            .forEach(function (c) {
                if (
                    !c.isStatic ||
                    c.entity.__agiProxy ||
                    c.entity.__agiCatcher
                ) {
                    return;
                }

                var mi =
                    c.meshInstances &&
                    c.meshInstances[0];

                var l = mi ? lm(mi) : null;

                rows.push([
                    oid(s, c),
                    oid(s, mi),
                    oid(s, mi && mi.mesh),
                    oid(s, mi && mi.material),
                    oid(s, l && l.tex),
                    oid(s, l && l.dir),

                    l && l.rect &&
                    l.rect.join(','),

                    c.enabled,
                    c.entity.enabled,
                    c.isStatic,
                    c.lightmapped,
                    c.castShadows,
                    c.castShadowsLightmap,
                    c.receiveShadows,
                    c.batchGroupId,

                    c.meshInstances ?
                        c.meshInstances.length : 0,

                    c.layers.join(','),

                    mi && mi.mask,
                    mi && mi.castShadow,
                    mi && mi.receiveShadow,
                    mi && mi._shaderDefs
                ].join('|'));
            });

        return rows.sort().join(';');
    }

    // ======================================================
    // RESTAURAR FUENTES
    // ======================================================

    function restoreParked(s) {
        s._parked.forEach(function (state, c) {
            if (
                !c ||
                !c.entity ||
                c.entity._destroyed
            ) {
                return;
            }

            c.layers = state.layers.slice();

            if (
                c.meshInstances &&
                c.meshInstances[0]
            ) {
                c.meshInstances[0].visible =
                    state.visible;
            }
        });

        s._parked.clear();
    }

    // ======================================================
    // DESTRUIR GRUPOS
    // ======================================================

    function destroyGroups(s) {
        restoreParked(s);

        s._groups.forEach(function (g) {
            if (g.catcher) {
                g.catcher.entity.destroy();
            }

            if (g.entity) {
                try {
                    g.mi.setInstancing(null);
                } catch (_) { }

                g.entity.destroy();
            }

            if (g.vb) {
                try {
                    g.vb.destroy();
                } catch (_) { }
            }
        });

        s._groups.clear();

        s._materials.forEach(function (m) {
            try {
                m.destroy();
            } catch (_) { }
        });

        s._catchMaterials.forEach(function (m) {
            try {
                m.destroy();
            } catch (_) { }
        });

        s._materials.clear();
        s._catchMaterials.clear();
    }

    // ======================================================
    // RECOLECTAR FUENTES
    // ======================================================

    function sources(s) {
        var out = [];

        s.app.root
            .findComponents('render')
            .forEach(function (c) {
                var lightmap = eligible(c);

                if (!lightmap) {
                    return;
                }

                var mi = c.meshInstances[0];
                var b = bounds(mi);

                if (!b) {
                    return;
                }

                out.push({
                    c: c,
                    mi: mi,
                    lm: lightmap,
                    bounds: b,
                    layers: c.layers.slice()
                });
            });

        return out;
    }

    // ======================================================
    // CONSTRUIR GPU INSTANCING
    // ======================================================

    function build(s) {
        destroyGroups(s);

        // Mantener orden validado por AGI4.15:
        // pre-bake -> post-bake -> grupos GPU.

        preBakePolicy(s);
        suppressBakedRealtime(s);

        var items = sources(s);
        var extent = null;

        items.forEach(function (x) {
            extent = merge(extent, x.bounds);
        });

        var size = Math.max(
            8,
            s.chunkSize
        );

        var common = !!(
            items.length <= 256 &&
            extent &&
            extent[3] - extent[0] <= size &&
            extent[5] - extent[2] <= size
        );

        var groups = new Map();

        items.forEach(function (x) {
            var b = x.bounds;
            var mi = x.mi;

            var cell = common ?
                '0:0' :
                Math.round(
                    (b[0] + b[3]) / (2 * size)
                ) + ':' +
                Math.round(
                    (b[2] + b[5]) / (2 * size)
                );

            // Evitar agrupar materiales, atlas,
            // mascaras y estados incompatibles.
            //
            // Tambien comparar las propiedades del
            // RenderComponent que afectan sombras.

            var key = [
                cell,

                oid(s, mi.mesh),
                oid(s, mi.material),
                oid(s, x.lm.tex),
                oid(s, x.lm.dir),

                x.c.lightmapped ? 1 : 0,
                isFloor(x.c) ? 1 : 0,

                x.layers.join(','),

                mi.mask,
                mi.castShadow,
                mi.receiveShadow,
                mi.renderStyle,
                mi.shaderPassMask,
                mi.shadowCascadeMask,
                mi.drawOrder,
                mi.drawBucket,

                x.c.castShadows,
                x.c.receiveShadows
            ].join('|');

            if (!groups.has(key)) {
                groups.set(key, {
                    items: [],
                    bounds: null,
                    cell: cell,
                    common: common
                });
            }

            var g = groups.get(key);

            g.items.push(x);

            g.bounds = merge(
                g.bounds,
                b
            );
        });

        var count = 0;

        groups.forEach(function (g) {
            for (
                var i = 0;
                i < g.items.length;
                i += MAX_INSTANCES_PER_GROUP
            ) {
                var part = g.items.slice(
                    i,
                    i + MAX_INSTANCES_PER_GROUP
                );

                if (part.length < 2) {
                    continue;
                }

                var b = null;

                part.forEach(function (x) {
                    b = merge(b, x.bounds);
                });

                if (
                    makeGroup(s, {
                        items: part,
                        bounds: b,
                        cell: g.cell,
                        common: g.common
                    })
                ) {
                    count += part.length;
                }
            }
        });

        s._counts.groups = s._groups.size;
        s._counts.instances = count;
        s._counts.baked = 0;

        s._groups.forEach(function (g) {
            if (g.items[0].c.lightmapped) {
                s._counts.baked +=
                    g.items.length;
            }
        });

        s._counts.rebuilds++;

        updateCatchers(s);

        s._signature = signature(s);

        if (s.debug) {
            console.log(
                TAG,
                'Grupos:', s._counts.groups,
                'Instancias:', count,
                'Baked:', s._counts.baked,
                'Catchers:', s._counts.catcherActive,
                'Cambios Bake:', s._counts.bakeChanges
            );
        }
    }

    // ======================================================
    // DETECCION DE CAMBIOS DE TRANSFORM
    // ======================================================

    // Comparacion directa contra el buffer actual.
    //
    // En un frame sin cambios no creamos
    // otro Float32Array de matrices.
    //
    // Math.fround conserva la misma precision
    // que utilizan los buffers GPU.

    function transformChanged(group) {
        for (
            var i = 0;
            i < group.items.length;
            i++
        ) {
            var item = group.items[i];

            var matrix =
                item.mi.node.getWorldTransform().data;

            var offset =
                i * INSTANCE_FLOATS;

            for (var k = 0; k < 16; k++) {
                if (
                    Math.fround(matrix[k]) !==
                    group.data[offset + k]
                ) {
                    return true;
                }
            }

            var rect =
                item.lm.rect || DEFAULT_ATLAS_RECT;

            for (var r = 0; r < 4; r++) {
                if (
                    Math.fround(rect[r]) !==
                    group.data[offset + 16 + r]
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    // ======================================================
    // REFRESH TRANSFORMS
    // ======================================================

    function refreshTransforms(s) {
        var changes = [];
        var valid = true;

        s._groups.forEach(function (group) {
            if (
                !valid ||
                !transformChanged(group)
            ) {
                return;
            }

            var box = null;

            group.items.forEach(function (item) {
                var b = bounds(item.mi);

                if (!b) {
                    valid = false;
                    return;
                }

                box = merge(box, b);
            });

            if (!valid) {
                return;
            }

            // Si la instancia abandono su chunk,
            // solicitar un rebuild.

            if (!group.common) {
                var size = Math.max(
                    8,
                    s.chunkSize
                );

                group.items.forEach(function (item) {
                    var b = bounds(item.mi);

                    if (!b) {
                        valid = false;
                        return;
                    }

                    var cell =
                        Math.round(
                            (b[0] + b[3]) /
                            (2 * size)
                        ) + ':' +
                        Math.round(
                            (b[2] + b[5]) /
                            (2 * size)
                        );

                    if (cell !== group.cell) {
                        valid = false;
                    }
                });
            }

            if (valid) {
                changes.push({
                    group: group,
                    data: packed(group.items),
                    box: box
                });
            }
        });

        if (!valid) {
            return false;
        }

        // Validar primero; subir al GPU despues.

        changes.forEach(function (change) {
            var group = change.group;

            if (
                group.vb.setData(change.data) ===
                false
            ) {
                valid = false;
                return;
            }

            group.data = change.data;
            group.bounds = change.box;

            group.mi.aabb =
                aabb(change.box);

            group.entity.render.customAabb =
                aabb(change.box);

            if (group.catcher) {
                group.catcher.mi.aabb =
                    aabb(change.box);

                group.catcher.entity.render.customAabb =
                    aabb(change.box);
            }

            s._counts.bufferUpdates++;
        });

        return valid;
    }

    // ======================================================
    // STREAMING FISICO
    // ======================================================

    function physics(s, dt) {
        if (!s.physicsStreaming) {
            return;
        }

        s._physicsClock += dt;

        if (
            s._physicsClock < PHYSICS_INTERVAL
        ) {
            return;
        }

        s._physicsClock = 0;

        var player = s.app.root
            .findByTag('is-player')
            .find(alive);

        if (!player) {
            return;
        }

        var p = player.getPosition();

        var v =
            player.rigidbody &&
            player.rigidbody.linearVelocity;

        var future = p.clone();

        if (v) {
            future.add(
                v.clone().mulScalar(.6)
            );
        }

        var cam = cameras(s)[0];

        var distance = Math.max(
            12,
            (cam ? cam.farClip : 100) * .15
        );

        if (v) {
            distance += v.length() * .6;
        }

        s.app.root
            .findComponents('collision')
            .forEach(function (c) {
                if (
                    !tag(
                        c.entity,
                        'agi-stream-physics'
                    )
                ) {
                    return;
                }

                if (!s._physicsOriginal.has(c)) {
                    s._physicsOriginal.set(
                        c,
                        c.enabled
                    );
                }

                var q =
                    c.entity.getPosition();

                var enabled = !!(
                    s._physicsOriginal.get(c) &&
                    (
                        q.distance(future) < distance ||
                        q.distance(p) < distance * .65
                    )
                );

                if (c.enabled !== enabled) {
                    c.enabled = enabled;
                }
            });
    }

    // ======================================================
    // INITIALIZE
    // ======================================================

    AdvancedGpuInstancer.prototype.initialize =
        function () {
            this._ids = new WeakMap();
            this._id = 0;

            this._groups = new Map();
            this._parked = new Map();

            this._materials = new Map();
            this._catchMaterials = new Map();

            this._casterOriginal = new Map();
            this._bakeOriginal = new Map();
            this._physicsOriginal = new Map();

            this._maskParams = null;
            this._maskVersion = 0;
            this._maskUploadedVersion = -1;

            this._counts = {
                groups: 0,
                instances: 0,
                baked: 0,
                rebuilds: 0,
                catcherActive: 0,
                catcherTransitions: 0,
                bufferUpdates: 0,
                bakeChanges: 0,
                bakedCasterSuppressed: 0
            };

            this._scanClock = 0;
            this._catchClock = 0;
            this._physicsClock = 0;

            this._signature = '';
            this._paused = false;

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

            var id = 21000;

            while (
                this.app.scene.layers
                    .getLayerById(id)
            ) {
                id++;
            }

            this._hiddenLayer = new pc.Layer({
                name: 'AGI415_HIDDEN_SOURCES',
                id: id,
                enabled: false
            });

            this.app.scene.layers.push(
                this._hiddenLayer
            );

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
                    if (!this._groups.size) {
                        this.rebuild();
                    }
                },
                this
            );

            // build() ya ejecuta preBakePolicy()
            // sincronamente. No duplicar recorrido.

            build(this);
        };

    // ======================================================
    // UPDATE
    // ======================================================

    AdvancedGpuInstancer.prototype.update =
        function (dt) {
            if (this._paused) {
                return;
            }

            physics(this, dt);

            this._catchClock += dt;

            if (
                this._catchClock >=
                CATCHER_INTERVAL
            ) {
                this._catchClock = 0;
                updateCatchers(this);
            }

            this._scanClock += dt;

            if (
                this._scanClock >=
                Math.max(.2, this.scanInterval)
            ) {
                this._scanClock = 0;

                preBakePolicy(this);
                suppressBakedRealtime(this);

                if (
                    signature(this) !==
                    this._signature
                ) {
                    build(this);

                } else if (
                    !refreshTransforms(this)
                ) {
                    build(this);
                }
            }
        };

    // ======================================================
    // RESTORE
    // ======================================================

    AdvancedGpuInstancer.prototype.restore =
        function () {
            this._paused = true;

            destroyGroups(this);

            restoreRealtime(this);
            restoreBake(this);

            this._physicsOriginal.forEach(
                function (was, c) {
                    if (
                        c &&
                        c.entity &&
                        !c.entity._destroyed
                    ) {
                        c.enabled = was;
                    }
                }
            );

            this._physicsOriginal.clear();

            if (
                this._hiddenLayer &&
                this.app.scene.layers.getLayerById(
                    this._hiddenLayer.id
                ) === this._hiddenLayer
            ) {
                this.app.scene.layers.remove(
                    this._hiddenLayer
                );
            }

            this._counts.groups = 0;
            this._counts.instances = 0;
            this._counts.baked = 0;
            this._counts.catcherActive = 0;
        };

    // ======================================================
    // REBUILD
    // ======================================================

    AdvancedGpuInstancer.prototype.rebuild =
        function () {
            this._paused = false;

            if (
                !this.app.scene.layers.getLayerById(
                    this._hiddenLayer.id
                )
            ) {
                this.app.scene.layers.push(
                    this._hiddenLayer
                );
            }

            build(this);
        };

    // ======================================================
    // MODO BAKE PT
    // ======================================================

    AdvancedGpuInstancer.prototype.setBakeMode =
        function (on) {
            if (on) {
                this._paused = true;

                destroyGroups(this);
                restoreRealtime(this);
                preBakePolicy(this);

            } else {
                this.rebuild();
            }

            if (this.debug) {
                console.log(
                    TAG,
                    'Fuentes para PT:',
                    !!on
                );
            }
        };

    // ======================================================
    // CONTROL DE MASCARA
    // ======================================================

    AdvancedGpuInstancer.prototype.setBakedShadowMask =
        function (on, ratio) {
            this.bakedShadowMask = !!on;

            if (
                typeof ratio === 'number' &&
                Number.isFinite(ratio)
            ) {
                this.bakedShadowRatio =
                    Math.max(
                        .05,
                        Math.min(.95, ratio)
                    );
            }

            syncMaskParams(this);

            console.log(
                TAG,
                'Mascara baked:',
                this.bakedShadowMask,
                'Umbral:',
                this.bakedShadowRatio
            );
        };

    AdvancedGpuInstancer.prototype.setCatcherBlend =
        function () {
            this._catchMaterials.forEach(
                function (m) {
                    m.blendType =
                        pc.BLEND_MULTIPLICATIVE;

                    m.update();
                }
            );

            console.warn(
                TAG,
                'Catcher mantiene composicion MULTIPLICATIVE.'
            );
        };

    // ======================================================
    // AUDITORIA DE ROLES
    // ======================================================

    AdvancedGpuInstancer.prototype.auditBakeRoles =
        function () {
            var s = this;
            var rows = [];

            this.app.root
                .findComponents('render')
                .forEach(function (c) {
                    if (
                        c.entity.__agiProxy ||
                        c.entity.__agiCatcher
                    ) {
                        return;
                    }

                    var before =
                        s._bakeOriginal.get(c);

                    rows.push({
                        nombre: c.entity.name,
                        guid: c.entity.guid,
                        rol: bakeRole(c),

                        lightmapped:
                            !!c.lightmapped,

                        tieneLightmap:
                            (c.meshInstances || [])
                                .some(function (mi) {
                                    return !!lm(mi).tex;
                                }),

                        bakeAntes: before ?
                            before.castShadowsLightmap :
                            null,

                        bakeActual:
                            !!c.castShadowsLightmap,

                        castRealtime:
                            !!c.castShadows,

                        realtimeSuprimido:
                            s._casterOriginal.has(c)
                    });
                });

            console.table(rows);

            return rows;
        };

    // ======================================================
    // AUDITORIA DE GRUPOS
    // ======================================================

    AdvancedGpuInstancer.prototype.auditGroups =
        function () {
            var rows = [];

            this._groups.forEach(function (g) {
                rows.push({
                    nombre:
                        g.items[0].c.entity.name,

                    instancias:
                        g.items.length,

                    baked:
                        !!g.items[0].c.lightmapped,

                    castRealtime:
                        g.mi.castShadow,

                    receiveShadow:
                        g.mi.receiveShadow,

                    mask:
                        g.mi.mask,

                    shaderDefs:
                        g.mi._shaderDefs,

                    catcher:
                        !!g.catcher,

                    catcherActivo:
                        !!(
                            g.catcher &&
                            g.catcher.entity.enabled
                        )
                });
            });

            console.table(rows);

            return rows;
        };

    // ======================================================
    // AUDITORIA DE DISTANCIA
    // ======================================================

    AdvancedGpuInstancer.prototype.auditDistance =
        function () {
            var rows = [];

            this._groups.forEach(function (g) {
                if (!g.catcher) {
                    return;
                }

                var c = g.catcher;

                rows.push({
                    nombre: g.entity.name,
                    instancias: g.items.length,

                    activo:
                        c.entity.enabled,

                    razon:
                        c.reason,

                    zMin:
                        c.z ? num(c.z[0]) : null,

                    zMax:
                        c.z ? num(c.z[1]) : null,

                    shadowDistance:
                        c.distance
                });
            });

            console.table(rows);

            return rows;
        };

    // ======================================================
    // AUDITORIA DE SOMBRAS
    // ======================================================

    AdvancedGpuInstancer.prototype.auditShadows =
        function () {
            var rows = [];

            this.app.root
                .findComponents('render')
                .forEach(function (c) {
                    if (c.entity.__agiCatcher) {
                        return;
                    }

                    (c.meshInstances || [])
                        .forEach(function (mi) {
                            rows.push({
                                objeto: c.entity.name,

                                proxy:
                                    !!c.entity.__agiProxy,

                                lightmapped:
                                    !!c.lightmapped,

                                castRealtime:
                                    mi.castShadow,

                                receiveShadow:
                                    mi.receiveShadow,

                                mask:
                                    mi.mask,

                                layers:
                                    c.layers.join(','),

                                shaderDefs:
                                    mi._shaderDefs
                            });
                        });
                });

            console.table(rows);

            return rows;
        };

    // ======================================================
    // AUDITORIA DE FUENTES
    // ======================================================

    AdvancedGpuInstancer.prototype.auditShadowSources =
        function () {
            var rows = [];

            var set = new Set(
                realtimeCasters(this)
                    .map(function (x) {
                        return x.mi;
                    })
            );

            this.app.root
                .findComponents('render')
                .forEach(function (c) {
                    if (
                        c.entity.__agiProxy ||
                        c.entity.__agiCatcher
                    ) {
                        return;
                    }

                    (c.meshInstances || [])
                        .forEach(function (mi) {
                            rows.push({
                                objeto:
                                    c.entity.name,

                                receptorBaked:
                                    !!(
                                        c.lightmapped &&
                                        lm(mi).tex
                                    ),

                                castShadowsLightmap:
                                    !!c.castShadowsLightmap,

                                castRealtime:
                                    !!(
                                        c.castShadows &&
                                        mi.castShadow
                                    ),

                                catcherCaster:
                                    set.has(mi),

                                mask:
                                    mi.mask,

                                estatico:
                                    !!c.isStatic
                            });
                        });
                });

            console.table(rows);

            return rows;
        };

    // ======================================================
    // AUDITORIA SPOT CASTERS
    // ======================================================

    AdvancedGpuInstancer.prototype.auditSpotCasters =
        function () {
            var rows = [];

            spots(this).forEach(function (l) {
                var casters = [];

                (
                    (
                        l.light &&
                        l.light._renderData
                    ) || []
                ).forEach(function (rd) {
                    (rd.visibleCasters || [])
                        .forEach(function (mi) {
                            casters.push(
                                mi.node &&
                                mi.node.name
                            );
                        });
                });

                rows.push({
                    luz: l.entity.name,
                    castShadows: l.castShadows,
                    intensidad: l.intensity,

                    shadowIntensity:
                        l.shadowIntensity,

                    range: l.range,
                    cono: l.outerConeAngle,
                    shadowBias: l.shadowBias,

                    normalOffsetBias:
                        l.normalOffsetBias,

                    affectLightmapped:
                        l.affectLightmapped,

                    mask: l.mask,

                    shadowMap:
                        !!(
                            l.light &&
                            l.light.shadowMap
                        ),

                    casters:
                        casters.join(',')
                });
            });

            console.table(rows);

            return rows;
        };

    // ======================================================
    // AUDITORIA SPOT RECEIVERS
    // ======================================================

    AdvancedGpuInstancer.prototype.auditSpotReceivers =
        function () {
            var rows = [];
            var s = this;

            spots(s).forEach(function (l) {
                s._groups.forEach(function (g) {
                    var center =
                        aabb(g.bounds).center;

                    var p =
                        l.entity.getPosition();

                    var v =
                        center.clone().sub(p);

                    var d = v.length();

                    var m =
                        l.entity.getWorldTransform().data;

                    var fw = new pc.Vec3(
                        -m[4],
                        -m[5],
                        -m[6]
                    );

                    var angle = d > 0 ?
                        Math.acos(
                            Math.max(
                                -1,
                                Math.min(
                                    1,
                                    fw.dot(v) / d
                                )
                            )
                        ) * 180 / Math.PI :
                        0;

                    rows.push({
                        luz: l.entity.name,

                        receptor:
                            g.items[0].c.entity.name,

                        instancias:
                            g.items.length,

                        baked:
                            !!g.items[0].c.lightmapped,

                        receiveShadow:
                            g.mi.receiveShadow,

                        mascaraCompatible:
                            !!(l.mask & g.mi.mask),

                        distancia:
                            num(d),

                        anguloCentro:
                            num(angle),

                        cono:
                            l.outerConeAngle
                    });
                });
            });

            console.table(rows);

            return rows;
        };

    AdvancedGpuInstancer.prototype.auditSpotDistances =
        AdvancedGpuInstancer.prototype.auditSpotReceivers;

    // ======================================================
    // AUDITORIA DE RENDIMIENTO
    // ======================================================

    AdvancedGpuInstancer.prototype.auditPerformance =
        function () {
            var r = {
                version: 'AGI4.15.1',

                drawCalls:
                    this.app.stats.drawCallCount,

                groups:
                    this._counts.groups,

                instances:
                    this._counts.instances,

                baked:
                    this._counts.baked,

                catcherActive:
                    this._counts.catcherActive,

                bakeChanges:
                    this._counts.bakeChanges,

                bakedCasterSuppressed:
                    this._counts.bakedCasterSuppressed,

                rebuilds:
                    this._counts.rebuilds,

                bufferUpdates:
                    this._counts.bufferUpdates,

                bakedShadowMask:
                    !!this.bakedShadowMask,

                bakedShadowRatio:
                    num(this.bakedShadowRatio)
            };

            console.table([r]);

            return r;
        };

    AdvancedGpuInstancer.prototype.capturePerformance =
        function (label) {
            var r = this.auditPerformance();

            r.label = label || 'captura';

            return r;
        };

    // ======================================================
    // AUDITORIA DE PASADAS
    // ======================================================

    AdvancedGpuInstancer.prototype.auditPasses =
        function () {
            return {
                drawCalls:
                    this.app.stats.drawCallCount,

                catcherActive:
                    this._counts.catcherActive,

                spot:
                    this.auditSpotCasters()
            };
        };

    // ======================================================
    // AUDITORIA COMPLETA
    // ======================================================

    AdvancedGpuInstancer.prototype.audit =
        function () {
            return {
                performance:
                    this.auditPerformance(),

                groups:
                    this.auditGroups(),

                bakeRoles:
                    this.auditBakeRoles(),

                distance:
                    this.auditDistance(),

                shadows:
                    this.auditShadows(),

                spot:
                    this.auditSpotCasters()
            };
        };

    // ======================================================
    // BENCHMARK A/B
    // ======================================================

    AdvancedGpuInstancer.prototype.benchmarkPasses =
        async function (frames) {
            frames = Math.max(
                15,
                Math.min(
                    240,
                    Math.floor(frames || 60)
                )
            );

            var s = this;

            var sp = spots(s);
            var dl = directionals(s);
            var cs = [];

            s._groups.forEach(function (g) {
                if (g.catcher) {
                    cs.push(g.catcher.entity);
                }
            });

            var oldSp = sp.map(function (l) {
                return [l, l.castShadows];
            });

            var oldDl = dl.map(function (l) {
                return [l, l.castShadows];
            });

            var oldCs = cs.map(function (e) {
                return [e, e.enabled];
            });

            var oldPause = s._paused;
            var rows = [];

            s._paused = true;

            async function sample(label) {
                var data = [];

                for (
                    var i = 0;
                    i < frames + 12;
                    i++
                ) {
                    await new Promise(
                        function (resolve) {
                            requestAnimationFrame(
                                resolve
                            );
                        }
                    );

                    if (i >= 12) {
                        data.push(
                            s.app.stats.drawCallCount || 0
                        );
                    }
                }

                data.sort(function (a, b) {
                    return a - b;
                });

                return {
                    estado: label,

                    drawsP50:
                        data[
                        Math.floor(
                            data.length / 2
                        )
                        ],

                    drawsPromedio:
                        num(
                            data.reduce(
                                function (a, b) {
                                    return a + b;
                                },
                                0
                            ) / data.length
                        )
                };
            }

            try {
                rows.push(
                    await sample('Escena actual')
                );

                cs.forEach(function (e) {
                    e.enabled = false;
                });

                rows.push(
                    await sample('Sin Catchers')
                );

                oldCs.forEach(function (x) {
                    x[0].enabled = x[1];
                });

                sp.forEach(function (l) {
                    l.castShadows = false;
                });

                rows.push(
                    await sample('Sin sombras Spot')
                );

                oldSp.forEach(function (x) {
                    x[0].castShadows = x[1];
                });

                dl.forEach(function (l) {
                    l.castShadows = false;
                });

                rows.push(
                    await sample('Sin sombras Directional')
                );

            } finally {
                oldSp.forEach(function (x) {
                    x[0].castShadows = x[1];
                });

                oldDl.forEach(function (x) {
                    x[0].castShadows = x[1];
                });

                oldCs.forEach(function (x) {
                    x[0].enabled = x[1];
                });

                s._paused = oldPause;
            }

            console.table(rows);

            return rows;
        };

})();
