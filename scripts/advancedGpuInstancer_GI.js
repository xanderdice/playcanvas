
/*
* AGI4.15.7 - Advanced GPU Instancer
* Scoped Core & Modern JavaScript
*
* PlayCanvas 2.23.x / WebGPU / WebGL2
* Script ID: advancedGpuInstancer
*
* ARQUITECTURA
*
* - Unico identificador global requerido por PlayCanvas.
* - Atributos del Editor declarados individualmente.
* - Constantes, shaders y helpers encapsulados en _core.
* - API publica mediante prototype.
* - Variables locales const / let.
* - Sin IIFE y sin helpers globales.
*
* ILUMINACION
*
* - Atlas PT compartidos.
* - Lightmaps nativos consolidados automaticamente.
* - Iluminacion realtime sin lightmaps.
*
* CONSERVA
*
* - Politica pre-bake AGI4.15.
* - Separacion baked / realtime.
* - Baked Shadow Mask.
* - Shadow Catcher.
* - Streaming fisico.
* - Restauracion de recursos GPU.
* - Auditorias y benchmarks.
*/

var AdvancedGpuInstancer = pc.createScript('advancedGpuInstancer');

// ============================================================
// 1. ATRIBUTOS DEL EDITOR
// ============================================================

AdvancedGpuInstancer.attributes.add('chunkSize', {
    type: 'number', default: 96, min: 8
});

AdvancedGpuInstancer.attributes.add('scanInterval', {
    type: 'number', default: 1.5, min: 0.2
});

AdvancedGpuInstancer.attributes.add('directionalShadowCatcher', {
    type: 'boolean', default: true
});

AdvancedGpuInstancer.attributes.add('smartShadowCatcher', {
    type: 'boolean', default: true
});

AdvancedGpuInstancer.attributes.add('bakedShadowMask', {
    type: 'boolean', default: true
});

AdvancedGpuInstancer.attributes.add('bakedShadowRatio', {
    type: 'number', default: 0.56, min: 0.05, max: 0.95
});

AdvancedGpuInstancer.attributes.add('bakedShadowSoftness', {
    type: 'number', default: 0.10, min: 0.01, max: 0.40
});

AdvancedGpuInstancer.attributes.add('distanceCulling', {
    type: 'boolean', default: true
});

AdvancedGpuInstancer.attributes.add('physicsStreaming', {
    type: 'boolean', default: true
});

AdvancedGpuInstancer.attributes.add('debug', {
    type: 'boolean', default: true
});

// ============================================================
// 2. NUCLEO INTERNO
// ============================================================

AdvancedGpuInstancer._core = Object.freeze({

    TAG: '[AGI4.15.7]',

    MAX_GROUP: 256,
    FLOATS_PER_INSTANCE: 20,
    CATCHER_INTERVAL: 0.15,
    PHYSICS_INTERVAL: 0.22,
    ATLAS_BORDER: 1,

    RECT_ONE: Object.freeze([0, 0, 1, 1]),

    DYNAMIC_MASK: pc.MASK_AFFECT_DYNAMIC || 1,

    SEM: Object.freeze([
        pc.SEMANTIC_ATTR11,
        pc.SEMANTIC_ATTR12,
        pc.SEMANTIC_ATTR14,
        pc.SEMANTIC_ATTR15,
        pc.SEMANTIC_ATTR13
    ]),

    // ========================================================
    // 3. SHADERS GLSL / WGSL
    // ========================================================

    GL: [
        'attribute vec4 aAGI0,aAGI1,aAGI2,aAGI3,aAGIRect;',
        'mat4 getModelMatrix(){return mat4(aAGI0,aAGI1,aAGI2,aAGI3);}'
    ].join('\n'),

    WG: [
        'attribute aAGI0: vec4f;',
        'attribute aAGI1: vec4f;',
        'attribute aAGI2: vec4f;',
        'attribute aAGI3: vec4f;',
        'attribute aAGIRect: vec4f;',
        'fn getModelMatrix() -> mat4x4f {',
        'return mat4x4f(aAGI0,aAGI1,aAGI2,aAGI3);',
        '}'
    ].join('\n'),

    UVG: '\n#if defined(INSTANCING) && defined(UV1_UNMODIFIED)\n' +
        'vUv1=vUv1*aAGIRect.zw+aAGIRect.xy;\n#endif',

    UVW: '\n#if defined(INSTANCING) && defined(UV1_UNMODIFIED)\n' +
        'output.vUv1=output.vUv1*aAGIRect.zw+aAGIRect.xy;\n#endif',

    MVG:
        'varying vec2 vAGIBakeUV; varying vec4 vAGIBakeRect;' +
        'attribute vec2 aAGIBakeUV;',

    MVW: [
        'varying vAGIBakeUV: vec2f;',
        'varying vAGIBakeRect: vec4f;',
        'attribute aAGIBakeUV: vec2f;'
    ].join('\n'),

    MEG:
        'vAGIBakeUV=aAGIBakeUV*aAGIRect.zw+aAGIRect.xy;' +
        'vAGIBakeRect=aAGIRect;',

    MEW:
        'output.vAGIBakeUV=aAGIBakeUV*aAGIRect.zw+aAGIRect.xy;' +
        'output.vAGIBakeRect=aAGIRect;',

    MPG:
        'varying vec2 vAGIBakeUV; varying vec4 vAGIBakeRect;' +
        'uniform sampler2D agiBakedAtlas; uniform vec4 agiMaskParams;' +
        'float agiLum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}',

    MPW: [
        'varying vAGIBakeUV: vec2f;',
        'varying vAGIBakeRect: vec4f;',
        'var agiBakedAtlas: texture_2d<f32>;',
        'var agiBakedAtlasSampler: sampler;',
        'uniform agiMaskParams: vec4f;',
        'fn agiLum(c: vec3f) -> f32 {',
        '    return dot(c, vec3f(.2126, .7152, .0722));',
        '}'
    ].join('\n'),

    MFG: [
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
    ].join('\n'),

    MFW: [
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
    ].join('\n'),

    // ========================================================
    // 4. UTILIDADES
    // ========================================================

    alive(entity) {
        return !!(entity && entity.enabled && !entity._destroyed);
    },

    tagged(entity, name) {
        return !!(entity && entity.tags && entity.tags.has(name));
    },

    n3(value) {
        return Number.isFinite(value) ? +value.toFixed(3) : null;
    },

    power2(value) {
        let result = 1;
        while (result < value) {
            result *= 2;
        }
        return result;
    },

    id(script, object) {
        if (!object) return 0;
        if (!script._ids.has(object)) {
            script._ids.set(object, ++script._lastId);
        }
        return script._ids.get(object);
    },

    readParameter(meshInstance, name) {
        const parameter = meshInstance && meshInstance.getParameter
            ? meshInstance.getParameter(name)
            : null;

        return parameter && parameter.data !== undefined
            ? parameter.data
            : parameter;
    },

    snapshot(script) {
        script._renders = script.app.root.findComponents('render');
        script._lights = script.app.root.findComponents('light');
        script._cameras = script.app.root.findComponents('camera');
        script._collisions = script.app.root.findComponents('collision');
    },

    cameras(script) {
        const core = AdvancedGpuInstancer._core;

        return script._cameras.filter(function (camera) {
            return camera.enabled && core.alive(camera.entity);
        });
    },

    directionals(script) {
        const core = AdvancedGpuInstancer._core;

        return script._lights.filter(function (light) {
            return light.enabled &&
                core.alive(light.entity) &&
                light.type === 'directional' &&
                light.castShadows &&
                light.affectDynamic;
        });
    },

    spots(script) {
        const core = AdvancedGpuInstancer._core;

        return script._lights.filter(function (light) {
            return light.enabled &&
                core.alive(light.entity) &&
                light.type === 'spot';
        });
    },

    renderBounds(meshInstance) {
        const aabb = meshInstance && meshInstance.aabb;
        if (!aabb) return null;

        const center = aabb.center;
        const half = aabb.halfExtents;

        return [
            center.x - half.x,
            center.y - half.y,
            center.z - half.z,
            center.x + half.x,
            center.y + half.y,
            center.z + half.z
        ];
    },

    merge(a, b) {
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
    },

    box3(bounds) {
        return new pc.BoundingBox(
            new pc.Vec3(
                (bounds[0] + bounds[3]) / 2,
                (bounds[1] + bounds[4]) / 2,
                (bounds[2] + bounds[5]) / 2
            ),
            new pc.Vec3(
                (bounds[3] - bounds[0]) / 2,
                (bounds[4] - bounds[1]) / 2,
                (bounds[5] - bounds[2]) / 2
            )
        );
    },

    floor(component) {
        const core = AdvancedGpuInstancer._core;

        return component.type === 'plane' ||
            core.tagged(component.entity, 'agi-floor');
    },

    // ========================================================
    // 5. LIGHTMAPS
    // ========================================================

    lightmap(meshInstance) {
        const core = AdvancedGpuInstancer._core;

        const names = pc.MeshInstance.lightmapParamNames || [
            'texture_lightMap',
            'texture_dirLightMap'
        ];

        let texture =
            core.readParameter(meshInstance, names[0]) ||
            core.readParameter(meshInstance, 'instance_lightMap') ||
            core.readParameter(meshInstance, 'texture_lightMap');

        let direction =
            core.readParameter(meshInstance, names[1]) ||
            core.readParameter(meshInstance, 'texture_dirLightMap');

        const rect = core.readParameter(meshInstance, 'uPT6LmRect');

        if (!(texture && typeof texture === 'object' && texture.width)) {
            texture = null;
        }

        if (!(direction && typeof direction === 'object' && direction.width)) {
            direction = null;
        }

        const hasRect = !!(rect && rect.length === 4);

        return {
            name: names[0],
            dirName: names[1],
            tex: texture,
            dir: direction,
            rect: hasRect ? Array.from(rect) : null,
            fromPT: hasRect,
            consolidated: false,
            atlas: null
        };
    },

    // ========================================================
    // 6. POLITICA BAKE / REALTIME
    // ========================================================

    bakeRole(component) {
        const core = AdvancedGpuInstancer._core;

        if (!component || !component.entity ||
            component.entity.__agiProxy ||
            component.entity.__agiCatcher) {
            return 'ignore';
        }

        if (core.tagged(component.entity, 'agi-realtime-only') ||
            core.tagged(component.entity, 'agi-no-bake-shadow')) {
            return 'realtime';
        }

        if (core.tagged(component.entity, 'agi-bake-caster') ||
            core.tagged(component.entity, 'agi-baked-only')) {
            return 'baked';
        }

        if (!component.isStatic) return 'realtime';
        if (component.lightmapped) return 'baked';
        if (component.castShadows) return 'realtime';

        return component.castShadowsLightmap ? 'baked' : 'none';
    },

    preBakePolicy(script) {
        const core = AdvancedGpuInstancer._core;

        script._renders.forEach(function (component) {
            if (!component || !component.entity ||
                component.entity._destroyed ||
                component.entity.__agiProxy ||
                component.entity.__agiCatcher) {
                return;
            }

            const role = core.bakeRole(component);

            if (role === 'ignore') return;

            if (!script._bakeOriginal.has(component)) {
                script._bakeOriginal.set(component, {
                    castShadowsLightmap: !!component.castShadowsLightmap,
                    role: role
                });
            }

            const original = script._bakeOriginal.get(component);

            const target = role === 'realtime'
                ? false
                : original.castShadowsLightmap;

            if (!!component.castShadowsLightmap !== !!target) {
                component.castShadowsLightmap = !!target;
                script._counts.bakeChanges++;
            }
        });
    },

    restoreBake(script) {
        script._bakeOriginal.forEach(function (original, component) {
            if (component && component.entity &&
                !component.entity._destroyed) {
                component.castShadowsLightmap =
                    original.castShadowsLightmap;
            }
        });

        script._bakeOriginal.clear();
    },

    hasLightmaps(script) {
        const core = AdvancedGpuInstancer._core;

        return script._renders.some(function (component) {
            return component &&
                component.lightmapped &&
                !component.entity.__agiProxy &&
                !component.entity.__agiCatcher &&
                (component.meshInstances || []).some(function (mi) {
                    return mi && !!core.lightmap(mi).tex;
                });
        });
    },

    hasBakeLights(script) {
        const core = AdvancedGpuInstancer._core;

        return script._lights.some(function (light) {
            return light.enabled &&
                core.alive(light.entity) &&
                !!light.bake;
        });
    },

    bakedCaster(component) {
        const core = AdvancedGpuInstancer._core;

        if (!component || !component.isStatic ||
            core.tagged(component.entity, 'agi-keep-realtime-shadows') ||
            core.tagged(component.entity, 'agi-spot-caster') ||
            core.tagged(component.entity, 'agi-realtime-only')) {
            return false;
        }

        return !!component.castShadowsLightmap &&
            (
                component.lightmapped ||
                core.tagged(component.entity, 'agi-bake-caster') ||
                core.tagged(component.entity, 'agi-baked-only')
            );
    },

    suppressBakedRealtime(script) {
        const core = AdvancedGpuInstancer._core;

        if (!core.hasLightmaps(script)) return;

        script._renders.forEach(function (component) {
            if (!component || !component.enabled ||
                !core.alive(component.entity) ||
                component.entity.__agiProxy ||
                component.entity.__agiCatcher ||
                !core.bakedCaster(component)) {
                return;
            }

            const meshInstances = component.meshInstances || [];
            if (!meshInstances.length) return;

            if (!script._casterOriginal.has(component)) {
                script._casterOriginal.set(component, {
                    component: !!component.castShadows,
                    mesh: meshInstances.map(function (mi) {
                        return { mi: mi, cast: !!mi.castShadow };
                    })
                });
            }

            const was = !!component.castShadows ||
                meshInstances.some(function (mi) {
                    return !!mi.castShadow;
                });

            component.castShadows = false;

            meshInstances.forEach(function (mi) {
                mi.castShadow = false;
            });

            if (was) {
                script._counts.bakedCasterSuppressed++;
            }
        });
    },

    restoreRealtime(script) {
        script._casterOriginal.forEach(function (original, component) {
            if (!component || !component.entity ||
                component.entity._destroyed) {
                return;
            }

            component.castShadows = original.component;

            original.mesh.forEach(function (item) {
                if (item.mi) {
                    item.mi.castShadow = item.cast;
                }
            });
        });

        script._casterOriginal.clear();
    },

    realtimeCasters(script) {
        const core = AdvancedGpuInstancer._core;
        const output = [];

        script._renders.forEach(function (component) {
            if (!component || !component.enabled ||
                !core.alive(component.entity) ||
                !component.castShadows ||
                component.entity.__agiProxy ||
                component.entity.__agiCatcher ||
                script._parked.has(component) ||
                core.tagged(component.entity, 'agi-no-catcher') ||
                core.bakedCaster(component)) {
                return;
            }

            (component.meshInstances || []).forEach(function (mi) {
                if (mi && mi.mesh && mi.visible &&
                    mi.castShadow &&
                    (mi.mask & core.DYNAMIC_MASK)) {
                    output.push({ c: component, mi: mi });
                }
            });
        });

        return output;
    },

    // ========================================================
    // 7. FUENTES DE INSTANCING
    // ========================================================

    eligible(component, pendingBake) {
        const core = AdvancedGpuInstancer._core;

        if (!component || !component.enabled ||
            !core.alive(component.entity) ||
            !component.isStatic ||
            component.entity.__agiProxy ||
            component.entity.__agiCatcher ||
            core.tagged(component.entity, 'agi-no-instance') ||
            core.tagged(component.entity, 'agi-native-spot-receiver') ||
            component.batchGroupId >= 0 ||
            !component.meshInstances ||
            component.meshInstances.length !== 1) {
            return false;
        }

        const mi = component.meshInstances[0];

        if (!mi || !mi.mesh || !mi.mesh.vertexBuffer ||
            !mi.node || !mi.material || !mi.visible ||
            mi.instancingData || mi.skinInstance ||
            mi.morphInstance || mi.calculateSortDistance) {
            return false;
        }

        if (!(mi.material instanceof pc.StandardMaterial) ||
            mi.material.blendType !== pc.BLEND_NONE) {
            return false;
        }

        const primitive = mi.mesh.primitive;

        if (!primitive || primitive.length !== 1 ||
            primitive[0].type !== pc.PRIMITIVE_TRIANGLES) {
            return false;
        }

        const format = mi.mesh.vertexBuffer.getFormat();

        if (!format || format.elements.some(function (element) {
            return core.SEM.indexOf(element.name) >= 0;
        })) {
            return false;
        }

        const lm = core.lightmap(mi);

        if (lm.tex) {
            const hasUV1 = format.elements.some(function (element) {
                return element.name === pc.SEMANTIC_TEXCOORD1;
            });

            if (!hasUV1) return false;

            if (!lm.rect) {
                lm.rect = core.RECT_ONE;
            }

            if (lm.rect[2] <= 0 || lm.rect[3] <= 0) {
                return false;
            }

        } else if (component.lightmapped && pendingBake) {
            return false;
        }

        if (mi.parameters && mi.parameters.forEach) {
            let unknown = false;

            mi.parameters.forEach(function (value, name) {
                if (name !== lm.name &&
                    name !== lm.dirName &&
                    name !== 'instance_lightMap' &&
                    name !== 'texture_lightMap' &&
                    name !== 'texture_dirLightMap' &&
                    name !== 'uPT6LmRect') {
                    unknown = true;
                }
            });

            if (unknown) return false;
        }

        return lm;
    },

    sources(script) {
        const core = AdvancedGpuInstancer._core;
        const output = [];
        const pendingBake = core.hasBakeLights(script);

        script._renders.forEach(function (component) {
            const lm = core.eligible(component, pendingBake);

            if (!lm) return;

            const mi = component.meshInstances[0];
            const bounds = core.renderBounds(mi);

            if (!bounds) return;

            output.push({
                c: component,
                mi: mi,
                lm: lm,
                bounds: bounds,
                layers: component.layers.slice()
            });
        });

        return output;
    },

    cellOf(bounds, size) {
        return Math.round((bounds[0] + bounds[3]) / (2 * size)) +
            ':' +
            Math.round((bounds[2] + bounds[5]) / (2 * size));
    },

    groupKey(script, item, cell, withLightmap) {
        const core = AdvancedGpuInstancer._core;
        const mi = item.mi;
        const original = script._casterOriginal.get(item.c);

        const parts = [
            cell,
            core.id(script, mi.mesh),
            core.id(script, mi.material),
            item.c.lightmapped ? 1 : 0,
            core.floor(item.c) ? 1 : 0,
            item.layers.join(','),
            mi.mask,
            mi.castShadow,
            mi.receiveShadow,
            mi.renderStyle,
            mi.shaderPassMask,
            mi.shadowCascadeMask,
            mi.drawOrder,
            mi.drawBucket,
            item.c.castShadows,
            item.c.receiveShadows,
            original ? +original.component : +item.c.castShadows,
            original && original.mesh[0]
                ? +original.mesh[0].cast : +mi.castShadow
        ];

        if (withLightmap) {
            parts.push(
                core.id(script, item.lm.tex),
                core.id(script, item.lm.dir)
            );
        } else {
            parts.push(
                item.lm.tex ? 'BAKED' : 'REALTIME',
                item.lm.dir ? 'DIR' : 'NO-DIR'
            );
        }

        return parts.join('|');
    },

    prepare(script, items) {
        const core = AdvancedGpuInstancer._core;
        let extent = null;

        items.forEach(function (item) {
            extent = core.merge(extent, item.bounds);
        });

        const size = Math.max(8, script.chunkSize);

        const common = !!(
            items.length <= core.MAX_GROUP &&
            extent &&
            extent[3] - extent[0] <= size &&
            extent[5] - extent[2] <= size
        );

        items.forEach(function (item) {
            item.cell = common
                ? '0:0'
                : core.cellOf(item.bounds, size);

            item.common = common;
        });

        return items;
    },

    groupsOf(script, items, withLightmap) {
        const core = AdvancedGpuInstancer._core;
        const output = new Map();

        items.forEach(function (item) {
            const key = core.groupKey(
                script,
                item,
                item.cell,
                withLightmap
            );

            if (!output.has(key)) {
                output.set(key, []);
            }

            output.get(key).push(item);
        });

        return output;
    },

    // ========================================================
    // 8. ATLAS NATIVOS AUTOMATICOS
    // ========================================================

    atlasCompatible(lm) {
        const texture = lm.tex;
        const direction = lm.dir;

        if (!texture || !texture.width ||
            !texture.height || lm.fromPT) {
            return false;
        }

        const formats = [
            pc.PIXELFORMAT_RGBA8,
            pc.PIXELFORMAT_SRGBA8,
            pc.PIXELFORMAT_RGBA16F,
            pc.PIXELFORMAT_RGBA32F,
            pc.PIXELFORMAT_RGB10A2,
            pc.PIXELFORMAT_111110F
        ];

        if (formats.indexOf(texture.format) < 0) {
            return false;
        }

        if (direction &&
            (formats.indexOf(direction.format) < 0 ||
                direction.width !== texture.width ||
                direction.height !== texture.height)) {
            return false;
        }

        return true;
    },

    atlasFormatKey(lm) {
        const texture = lm.tex;
        const direction = lm.dir;

        return [
            texture.format,
            texture.type,
            texture.encoding,
            !!texture.srgb,
            texture.minFilter,
            texture.magFilter,
            direction ? direction.format : '-',
            direction ? direction.type : '-',
            direction ? direction.encoding : '-',
            direction ? !!direction.srgb : '-',
            direction ? direction.minFilter : '-',
            direction ? direction.magFilter : '-'
        ].join('|');
    },

    atlasLayout(entries, maxSize) {
        const core = AdvancedGpuInstancer._core;

        const sorted = entries.slice().sort(function (a, b) {
            return b.tex.height - a.tex.height ||
                b.tex.width - a.tex.width;
        });

        let pixels = 0;
        let widest = 0;

        sorted.forEach(function (entry) {
            const width = entry.tex.width + 2 * core.ATLAS_BORDER;
            const height = entry.tex.height + 2 * core.ATLAS_BORDER;

            pixels += width * height;
            widest = Math.max(widest, width);
        });

        if (sorted.some(function (entry) {
            return entry.tex.width + 2 * core.ATLAS_BORDER > maxSize ||
                entry.tex.height + 2 * core.ATLAS_BORDER > maxSize;
        })) {
            return [];
        }

        let width = core.power2(
            Math.max(widest, Math.ceil(Math.sqrt(pixels)))
        );

        let best = null;

        while (width <= maxSize) {
            const pages = [];

            let page = {
                tiles: [],
                x: 0,
                y: 0,
                rowH: 0,
                usedW: 0,
                usedH: 0
            };

            pages.push(page);

            sorted.forEach(function (entry) {
                const tileW = entry.tex.width + 2 * core.ATLAS_BORDER;
                const tileH = entry.tex.height + 2 * core.ATLAS_BORDER;

                if (page.x + tileW > width) {
                    page.x = 0;
                    page.y += page.rowH;
                    page.rowH = 0;
                }

                if (page.y + tileH > maxSize) {
                    page = {
                        tiles: [],
                        x: 0,
                        y: 0,
                        rowH: 0,
                        usedW: 0,
                        usedH: 0
                    };

                    pages.push(page);
                }

                page.tiles.push({
                    entry: entry,
                    x: page.x,
                    y: page.y
                });

                page.usedW = Math.max(page.usedW, page.x + tileW);
                page.usedH = Math.max(page.usedH, page.y + tileH);

                page.x += tileW;
                page.rowH = Math.max(page.rowH, tileH);
            });

            pages.forEach(function (item) {
                item.width = core.power2(item.usedW);
                item.height = core.power2(item.usedH);
            });

            const area = pages.reduce(function (total, item) {
                return total + item.width * item.height;
            }, 0);

            if (!best ||
                pages.length < best.pages.length ||
                (pages.length === best.pages.length && area < best.area)) {
                best = { pages: pages, area: area };
            }

            if (pages.length === 1) break;

            width *= 2;
        }

        return best ? best.pages : [];
    },

    createAtlasTexture(script, source, width, height, name) {
        return new pc.Texture(script.app.graphicsDevice, {
            name: name,
            width: width,
            height: height,
            format: source.format,
            type: source.type,
            srgb: !!source.srgb,
            mipmaps: false,
            minFilter: source.minFilter === pc.FILTER_NEAREST
                ? pc.FILTER_NEAREST
                : pc.FILTER_LINEAR,
            magFilter: source.magFilter === pc.FILTER_NEAREST
                ? pc.FILTER_NEAREST
                : pc.FILTER_LINEAR,
            addressU: pc.ADDRESS_CLAMP_TO_EDGE,
            addressV: pc.ADDRESS_CLAMP_TO_EDGE
        });
    },

    copyWithBorder(destination, source, x, y) {
        const core = AdvancedGpuInstancer._core;
        const width = source.width;
        const height = source.height;
        const border = core.ATLAS_BORDER;

        function copy(sourceX, sourceY, w, h, destX, destY) {
            return destination.copy(source, {
                sourceX: sourceX,
                sourceY: sourceY,
                width: w,
                height: h,
                destX: destX,
                destY: destY
            }) !== false;
        }

        return copy(0, 0, width, height, x + border, y + border) &&
            copy(0, 0, width, 1, x + border, y) &&
            copy(0, height - 1, width, 1, x + border, y + border + height) &&
            copy(0, 0, 1, height, x, y + border) &&
            copy(width - 1, 0, 1, height, x + border + width, y + border) &&
            copy(0, 0, 1, 1, x, y) &&
            copy(width - 1, 0, 1, 1, x + border + width, y) &&
            copy(0, height - 1, 1, 1, x, y + border + height) &&
            copy(width - 1, height - 1, 1, 1,
                x + border + width, y + border + height);
    },

    consolidateNative(script, items) {
        const core = AdvancedGpuInstancer._core;
        const potential = new Set();

        core.groupsOf(script, items, false).forEach(function (group) {
            if (group.length >= 2) {
                group.forEach(function (item) {
                    potential.add(item);
                });
            }
        });

        const buckets = new Map();

        items.forEach(function (item) {
            if (!potential.has(item) ||
                !core.atlasCompatible(item.lm)) {
                return;
            }

            const formatKey = core.atlasFormatKey(item.lm);

            if (!buckets.has(formatKey)) {
                buckets.set(formatKey, new Map());
            }

            const bucket = buckets.get(formatKey);

            const textureKey =
                core.id(script, item.lm.tex) + '/' +
                core.id(script, item.lm.dir);

            if (!bucket.has(textureKey)) {
                bucket.set(textureKey, {
                    tex: item.lm.tex,
                    dir: item.lm.dir,
                    items: []
                });
            }

            bucket.get(textureKey).items.push(item);
        });

        const maxSize =
            script.app.graphicsDevice.maxTextureSize || 4096;

        buckets.forEach(function (uniqueTextures) {
            const entries = Array.from(uniqueTextures.values());

            if (entries.length < 2) return;

            core.atlasLayout(entries, maxSize).forEach(function (page) {
                if (page.tiles.length < 2) return;

                let color = null;
                let direction = null;
                let success = false;

                try {
                    const sample = page.tiles[0].entry;

                    color = core.createAtlasTexture(
                        script, sample.tex,
                        page.width, page.height,
                        'AGI4157_NativeLightmap'
                    );

                    if (sample.dir) {
                        direction = core.createAtlasTexture(
                            script, sample.dir,
                            page.width, page.height,
                            'AGI4157_NativeDirection'
                        );
                    }

                    success = page.tiles.every(function (tile) {
                        return core.copyWithBorder(
                            color, tile.entry.tex,
                            tile.x, tile.y
                        ) &&
                            (!direction || core.copyWithBorder(
                                direction, tile.entry.dir,
                                tile.x, tile.y
                            ));
                    });

                } catch (error) {
                    if (script.debug) {
                        console.warn(
                            core.TAG,
                            'Atlas nativo no compatible:',
                            error
                        );
                    }
                }

                if (!success) {
                    if (color) color.destroy();
                    if (direction) direction.destroy();
                    return;
                }

                const atlas = {
                    color: color,
                    dir: direction,
                    used: false
                };

                script._nativeAtlases.push(atlas);

                page.tiles.forEach(function (tile) {
                    const entry = tile.entry;

                    const rect = [
                        (tile.x + core.ATLAS_BORDER) / page.width,
                        (tile.y + core.ATLAS_BORDER) / page.height,
                        entry.tex.width / page.width,
                        entry.tex.height / page.height
                    ];

                    entry.items.forEach(function (item) {
                        item.lm = {
                            name: item.lm.name,
                            dirName: item.lm.dirName,
                            tex: color,
                            dir: direction,
                            rect: rect,
                            fromPT: false,
                            consolidated: true,
                            atlas: atlas
                        };
                    });
                });
            });
        });
    },

    releaseUnusedAtlases(script) {
        let usedCount = 0;
        let pageCount = 0;

        script._groups.forEach(function (group) {
            group.items.forEach(function (item) {
                if (item.lm.consolidated && item.lm.atlas) {
                    item.lm.atlas.used = true;
                    usedCount++;
                }
            });
        });

        script._nativeAtlases = script._nativeAtlases.filter(
            function (atlas) {
                if (atlas.used) {
                    pageCount++;
                    return true;
                }

                atlas.color.destroy();

                if (atlas.dir) {
                    atlas.dir.destroy();
                }

                return false;
            }
        );

        script._counts.nativeAtlasPages = pageCount;
        script._counts.nativeAtlasInstances = usedCount;
    },

    // ========================================================
    // 9. MATERIALES GPU
    // ========================================================

    getMaterial(script, source, catcher) {
        const core = AdvancedGpuInstancer._core;

        const cache = catcher
            ? script._catchMaterials
            : script._materials;

        if (cache.has(source)) {
            return cache.get(source);
        }

        const material = catcher
            ? new pc.StandardMaterial()
            : source.clone();

        material.name =
            (source.name || 'Material') +
            '_AGI4157' +
            (catcher ? '_Catcher' : '');

        if (catcher) {
            material.shadowCatcher = true;
            material.blendType = pc.BLEND_MULTIPLICATIVE;
            material.depthWrite = false;
            material.depthTest = true;
            material.cull = pc.CULLFACE_NONE;
            material.diffuse.set(0, 0, 0);
            material.specular.set(0, 0, 0);
            material.useSkybox = false;
        }

        material.shaderChunksVersion = '2.23';

        [
            [pc.SHADERLANGUAGE_GLSL, core.GL, core.UVG, true],
            [pc.SHADERLANGUAGE_WGSL, core.WG, core.UVW, false]
        ].forEach(function (language) {
            const chunks = material.getShaderChunks(language[0]);

            chunks.set('transformInstancingVS', language[1]);

            function append(name, value) {
                chunks.set(
                    name,
                    (chunks.get(name) || '') + '\n' + value
                );
            }

            if (!catcher) {
                append('litUserMainEndVS', language[2]);
            } else {
                append(
                    'litUserDeclarationVS',
                    language[3] ? core.MVG : core.MVW
                );

                append(
                    'litUserMainEndVS',
                    language[3] ? core.MEG : core.MEW
                );

                append(
                    'litUserDeclarationPS',
                    language[3] ? core.MPG : core.MPW
                );

                append(
                    'litUserMainEndPS',
                    language[3] ? core.MFG : core.MFW
                );
            }
        });

        [
            'aAGI0',
            'aAGI1',
            'aAGI2',
            'aAGI3',
            'aAGIRect'
        ].forEach(function (name, index) {
            material.setAttribute(name, core.SEM[index]);
        });

        if (catcher) {
            material.setAttribute(
                'aAGIBakeUV',
                pc.SEMANTIC_TEXCOORD1
            );
        }

        material.update();
        cache.set(source, material);

        return material;
    },

    packed(items) {
        const core = AdvancedGpuInstancer._core;

        const data = new Float32Array(
            items.length * core.FLOATS_PER_INSTANCE
        );

        items.forEach(function (item, index) {
            const matrix = item.mi.node.getWorldTransform().data;
            const offset = index * core.FLOATS_PER_INSTANCE;

            for (let i = 0; i < 16; i++) {
                data[offset + i] = matrix[i];
            }

            data.set(
                item.lm.rect || core.RECT_ONE,
                offset + 16
            );
        });

        return data;
    },

    applyMeshFlags(target, source, baked) {
        target.mask = source.mask;
        target.castShadow = baked ? false : !!source.castShadow;
        target.receiveShadow = !!source.receiveShadow;
        target.shadowCascadeMask = source.shadowCascadeMask;
        target.shaderPassMask = source.shaderPassMask;
    },

    maskParams(script) {
        const ratio = Math.fround(
            Math.max(0.05, Math.min(0.95, script.bakedShadowRatio))
        );

        const softness = Math.fround(
            Math.max(0.01, Math.min(0.4, script.bakedShadowSoftness))
        );

        const enabled = script.bakedShadowMask ? 1 : 0;
        const previous = script._maskParams;

        if (!previous ||
            previous[0] !== ratio ||
            previous[1] !== softness ||
            previous[2] !== enabled) {
            script._maskParams = new Float32Array([
                ratio,
                softness,
                enabled,
                0
            ]);

            script._maskVersion++;
        }

        return script._maskParams;
    },

    syncMaskParams(script) {
        const core = AdvancedGpuInstancer._core;
        const params = core.maskParams(script);

        if (script._maskUploadedVersion === script._maskVersion) {
            return;
        }

        script._groups.forEach(function (group) {
            if (group.catcher) {
                group.catcher.mi.setParameter(
                    'agiMaskParams',
                    params
                );
            }
        });

        script._maskUploadedVersion = script._maskVersion;
    },

    // ========================================================
    // 10. SHADOW CATCHER DIRECCIONAL
    // ========================================================

    makeCatcher(script, group) {
        const core = AdvancedGpuInstancer._core;
        let entity = null;

        try {
            const source = group.items[0];

            entity = new pc.Entity(
                'AGI4157_Catcher_' + source.c.entity.name
            );

            entity.__agiCatcher = true;
            script.app.root.addChild(entity);

            const mi = new pc.MeshInstance(
                source.mi.mesh,
                core.getMaterial(script, source.mi.material, true),
                entity
            );

            mi.setInstancing(group.vb, true);
            mi.setParameter('agiBakedAtlas', source.lm.tex);
            mi.setParameter('agiMaskParams', core.maskParams(script));

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

            mi.mask = core.DYNAMIC_MASK;
            mi.castShadow = false;
            mi.receiveShadow = true;

            entity.render.customAabb = core.box3(group.bounds);
            mi.aabb = core.box3(group.bounds);

            entity.enabled = false;

            group.catcher = {
                entity: entity,
                mi: mi,
                reason: 'inicial',
                z: null,
                distance: null
            };

        } catch (error) {
            if (entity) {
                entity.destroy();
            }

            console.warn(
                core.TAG,
                'No se pudo crear catcher:',
                error
            );
        }
    },

    // ========================================================
    // 11. CREACION DE GRUPOS GPU
    // ========================================================

    makeGroup(script, group) {
        const core = AdvancedGpuInstancer._core;
        const source = group.items[0];

        let entity = null;
        let vertexBuffer = null;
        const hiddenNow = [];

        try {
            const data = core.packed(group.items);

            vertexBuffer = new pc.VertexBuffer(
                script.app.graphicsDevice,
                script._format,
                group.items.length,
                {
                    data: data,
                    usage: pc.BUFFER_DYNAMIC
                }
            );

            entity = new pc.Entity(
                'AGI4157_' +
                source.c.entity.name +
                '_' +
                script._groups.size
            );

            entity.__agiProxy = true;
            script.app.root.addChild(entity);

            const mi = new pc.MeshInstance(
                source.mi.mesh,
                core.getMaterial(
                    script,
                    source.mi.material,
                    false
                ),
                entity
            );

            const baked = !!(
                source.c.lightmapped &&
                source.lm.tex
            );

            core.applyMeshFlags(mi, source.mi, baked);

            if (!baked && source.c.lightmapped) {
                mi.mask = core.DYNAMIC_MASK;
            }

            mi.renderStyle = source.mi.renderStyle;
            mi.drawOrder = source.mi.drawOrder;
            mi.drawBucket = source.mi.drawBucket;

            mi.setInstancing(vertexBuffer, true);

            entity.addComponent('render', {
                meshInstances: [mi],
                layers: source.layers.slice(),
                castShadows: baked
                    ? false
                    : !!source.c.castShadows,
                receiveShadows: !!source.c.receiveShadows
            });

            entity.render.isStatic = true;
            entity.render.lightmapped = baked;

            entity.render.castShadows = baked
                ? false
                : !!source.c.castShadows;

            entity.render.receiveShadows =
                !!source.c.receiveShadows;

            if (baked) {
                mi.setRealtimeLightmap(
                    source.lm.name,
                    source.lm.tex
                );

                if (source.lm.dir) {
                    mi.setRealtimeLightmap(
                        source.lm.dirName,
                        source.lm.dir
                    );
                }

                mi.setParameter(
                    'uPT6LmRect',
                    core.RECT_ONE
                );
            }

            if (typeof mi._updateShaderDefs === 'function' &&
                typeof source.mi._shaderDefs === 'number') {
                const extras =
                    mi._shaderDefs & ~source.mi._shaderDefs;

                mi._updateShaderDefs(
                    source.mi._shaderDefs | extras
                );
            }

            core.applyMeshFlags(mi, source.mi, baked);

            if (!baked && source.c.lightmapped) {
                mi.mask = core.DYNAMIC_MASK;
            }

            entity.render.customAabb = core.box3(group.bounds);
            mi.aabb = core.box3(group.bounds);

            group.entity = entity;
            group.mi = mi;
            group.vb = vertexBuffer;
            group.data = data;
            group.catcher = null;

            // AGI4.15.7:
            // Los casters baked pueden volver a proyectar mediante
            // su propio grupo GPU, sin reactivar MeshInstances.
            group.nativeLocalEligible = baked && !core.floor(source.c) &&
                group.items.some(function (item) {
                    const original = script._casterOriginal.get(item.c);
                    return original
                        ? original.component
                        : item.c.castShadows;
                });

            group.nativeLocalCast = false;

            if (baked && core.floor(source.c)) {
                core.makeCatcher(script, group);
            }

            group.items.forEach(function (item) {
                if (script._parked.has(item.c)) return;

                script._parked.set(item.c, {
                    layers: item.c.layers.slice(),
                    visible: item.mi.visible
                });

                hiddenNow.push(item.c);

                item.c.layers = [
                    script._hiddenLayer.id
                ];
            });

            script._groups.set(entity, group);
            return true;

        } catch (error) {
            hiddenNow.forEach(function (component) {
                const original = script._parked.get(component);

                if (original) {
                    try {
                        component.layers = original.layers.slice();
                    } catch (_) { }

                    script._parked.delete(component);
                }
            });

            if (group.catcher) {
                group.catcher.entity.destroy();
            }

            if (entity) {
                script._groups.delete(entity);
                entity.destroy();
            }

            if (vertexBuffer) {
                try {
                    vertexBuffer.destroy();
                } catch (_) { }
            }

            console.error(
                core.TAG,
                'Grupo omitido; originales conservados:',
                error
            );

            return false;
        }
    },

    // ========================================================
    // 12. DISTANCIAS Y SHADOW CATCHER
    // ========================================================

    cameraDepth(bounds, camera) {
        const core = AdvancedGpuInstancer._core;
        const matrix = camera.entity.getWorldTransform().data;

        const fx = -matrix[8];
        const fy = -matrix[9];
        const fz = -matrix[10];

        const box = core.box3(bounds);
        const center = box.center;
        const half = box.halfExtents;

        const distance =
            (center.x - matrix[12]) * fx +
            (center.y - matrix[13]) * fy +
            (center.z - matrix[14]) * fz;

        const radius =
            Math.abs(fx) * half.x +
            Math.abs(fy) * half.y +
            Math.abs(fz) * half.z;

        return [
            distance - radius,
            distance + radius
        ];
    },

    canShadowFloor(group, caster, light) {
        const core = AdvancedGpuInstancer._core;
        const bounds = core.renderBounds(caster.mi);

        if (!bounds) return true;

        const matrix = light.entity.getWorldTransform().data;

        const dx = -matrix[4];
        const dy = -matrix[5];
        const dz = -matrix[6];

        if (Math.abs(dy) < 0.06) return true;

        const y = group.bounds[4];

        const t0 = (y - bounds[1]) / dy;
        const t1 = (y - bounds[4]) / dy;

        if (Math.max(t0, t1) < 0) return false;

        const lo = Math.max(0, Math.min(t0, t1));
        const hi = Math.max(0, Math.max(t0, t1));

        const x0 = bounds[0] + Math.min(lo * dx, hi * dx) - 0.5;
        const x1 = bounds[3] + Math.max(lo * dx, hi * dx) + 0.5;

        const z0 = bounds[2] + Math.min(lo * dz, hi * dz) - 0.5;
        const z1 = bounds[5] + Math.max(lo * dz, hi * dz) + 0.5;

        return x1 >= group.bounds[0] &&
            x0 <= group.bounds[3] &&
            z1 >= group.bounds[2] &&
            z0 <= group.bounds[5];
    },

    catcherDecision(script, group, context) {
        const core = AdvancedGpuInstancer._core;

        if (!script.directionalShadowCatcher) {
            return { on: false, reason: 'desactivado' };
        }

        const lights = context.lights;
        const cameras = context.cameras;

        if (!lights.length) {
            return {
                on: false,
                reason: 'sin directional dinamica'
            };
        }

        if (script.smartShadowCatcher) {
            let relevant = false;

            for (let i = 0; i < lights.length && !relevant; i++) {
                for (let j = 0; j < context.casters.length; j++) {
                    const caster = context.casters[j];

                    if ((lights[i].mask & caster.mi.mask) &&
                        core.canShadowFloor(group, caster, lights[i])) {
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

        if (!script.distanceCulling) {
            return {
                on: true,
                reason: 'culling desactivado'
            };
        }

        for (let c = 0; c < cameras.length; c++) {
            for (let l = 0; l < lights.length; l++) {
                const camera = cameras[c];
                const light = lights[l];

                if (!(light.mask & core.DYNAMIC_MASK)) {
                    continue;
                }

                const distance = Math.min(
                    camera.farClip || Infinity,
                    light.shadowDistance || Infinity
                );

                if (!Number.isFinite(distance) || distance <= 0) {
                    continue;
                }

                const z = core.cameraDepth(group.bounds, camera);
                const near = Math.max(0, camera.nearClip || 0);

                const margin = Math.max(
                    0.25,
                    Math.min(3, distance * 0.04)
                );

                if (z[1] >= near && z[0] <= distance + margin) {
                    return {
                        on: true,
                        reason: 'shadowDistance',
                        z: z,
                        distance: distance
                    };
                }
            }
        }

        return {
            on: false,
            reason: 'fuera del shadowDistance'
        };
    },

    updateCatchers(script) {
        const core = AdvancedGpuInstancer._core;

        core.syncMaskParams(script);

        const context = {
            lights: core.directionals(script),
            cameras: core.cameras(script),
            casters: script.smartShadowCatcher
                ? core.realtimeCasters(script)
                : []
        };

        let active = 0;

        script._groups.forEach(function (group) {
            if (!group.catcher) return;

            const decision = core.catcherDecision(
                script,
                group,
                context
            );

            const catcher = group.catcher;

            if (catcher.entity.enabled !== decision.on) {
                catcher.entity.enabled = decision.on;
                script._counts.catcherTransitions++;
            }

            catcher.reason = decision.reason;
            catcher.z = decision.z || null;
            catcher.distance = decision.distance || null;

            if (decision.on) active++;
        });

        script._counts.catcherActive = active;
    },

    // ========================================================
    // 13. PROYECCION LOCAL NATIVA - SPOT / OMNI
    // ========================================================
    //
    // Esta es la correccion de AGI4.15.7.
    //
    // No modifica shaders, UV1, atlas ni lightmaps.
    // No crea shadow catchers adicionales.
    // No muestra objetos originales.
    // El RenderComponent administra los shadow casters nativos.
    //
    // shadowCascadeMask = 0 excluye las cascadas Directional.
    // Los shadow maps Spot / Omni siguen siendo del motor.
    // ========================================================

    updateNativeLocalCasters(script) {
        const core = AdvancedGpuInstancer._core;

        const lights = script._lights.filter(function (light) {
            return light.enabled && core.alive(light.entity) &&
                (light.type === 'spot' || light.type === 'omni') &&
                light.castShadows && light.range > 0 &&
                (light.affectLightmapped || light.affectDynamic);
        });

        const cameras = core.cameras(script);
        const directionals = core.directionals(script);

        const maxDirectionalDistance = directionals.reduce(
            function (distance, light) {
                return Math.max(distance, light.shadowDistance || 0);
            }, 0
        );

        script._groups.forEach(function (group) {
            if (!group.nativeLocalEligible) return;

            const b = group.bounds;

            const visible = !script.distanceCulling || cameras.some(
                function (camera) {
                    const limit = Math.min(
                        camera.farClip > 0 ? camera.farClip : Infinity,
                        maxDirectionalDistance > 0
                            ? maxDirectionalDistance : Infinity
                    );

                    const depth = core.cameraDepth(b, camera);

                    return depth[1] >= Math.max(0, camera.nearClip || 0) &&
                        depth[0] <= limit;
                }
            );

            const active = visible && lights.some(function (light) {
                if (!(light.mask & group.mi.mask)) return false;

                const p = light.entity.getPosition();

                const dx = Math.max(b[0] - p.x, 0, p.x - b[3]);
                const dy = Math.max(b[1] - p.y, 0, p.y - b[4]);
                const dz = Math.max(b[2] - p.z, 0, p.z - b[5]);

                return dx * dx + dy * dy + dz * dz <=
                    light.range * light.range;
            });

            if (group.nativeLocalCast === active) return;

            group.entity.render.castShadows = active;

            group.entity.render.shadowCascadeMask = active
                ? 0 : group.items[0].mi.shadowCascadeMask;

            group.mi.castShadow = active;

            group.mi.shadowCascadeMask = active
                ? 0 : group.items[0].mi.shadowCascadeMask;

            group.nativeLocalCast = active;
        });
    },

    // ========================================================
    // 14. FIRMA ESTRUCTURAL
    // ========================================================

    signature(script) {
        const core = AdvancedGpuInstancer._core;
        const output = [];

        script._renders.forEach(function (component) {
            if (!component || !component.isStatic ||
                !component.entity ||
                component.entity.__agiProxy ||
                component.entity.__agiCatcher) {
                return;
            }

            const mi = component.meshInstances &&
                component.meshInstances[0];

            const lm = mi ? core.lightmap(mi) : null;

            output.push([
                core.id(script, component),
                core.id(script, mi),
                core.id(script, mi && mi.mesh),
                core.id(script, mi && mi.material),
                core.id(script, lm && lm.tex),
                core.id(script, lm && lm.dir),
                lm && lm.rect && lm.rect.join(','),
                component.enabled,
                component.entity.enabled,
                component.isStatic,
                component.lightmapped,
                component.castShadows,
                component.castShadowsLightmap,
                component.receiveShadows,
                component.batchGroupId,
                component.meshInstances
                    ? component.meshInstances.length
                    : 0,
                component.layers.join(','),
                mi && mi.mask,
                mi && mi.castShadow,
                mi && mi.receiveShadow,
                mi && mi._shaderDefs
            ].join('|'));
        });

        return output.sort().join(';');
    },

    // ========================================================
    // 15. TRANSFORMACIONES
    // ========================================================

    matrixChanged(group) {
        const core = AdvancedGpuInstancer._core;

        for (let i = 0; i < group.items.length; i++) {
            const item = group.items[i];
            const matrix = item.mi.node.getWorldTransform().data;
            const offset = i * core.FLOATS_PER_INSTANCE;

            for (let j = 0; j < 16; j++) {
                if (Math.fround(matrix[j]) !==
                    group.data[offset + j]) {
                    return true;
                }
            }

            const rect = item.lm.rect || core.RECT_ONE;

            for (let k = 0; k < 4; k++) {
                if (Math.fround(rect[k]) !==
                    group.data[offset + 16 + k]) {
                    return true;
                }
            }
        }

        return false;
    },

    refreshTransforms(script) {
        const core = AdvancedGpuInstancer._core;
        const changes = [];
        let valid = true;

        script._groups.forEach(function (group) {
            if (!valid || !core.matrixChanged(group)) {
                return;
            }

            let bounds = null;
            const size = Math.max(8, script.chunkSize);

            group.items.forEach(function (item) {
                const box = core.renderBounds(item.mi);

                if (!box) {
                    valid = false;
                    return;
                }

                bounds = core.merge(bounds, box);

                if (!group.common &&
                    core.cellOf(box, size) !== group.cell) {
                    valid = false;
                }
            });

            if (valid) {
                changes.push({
                    group: group,
                    bounds: bounds,
                    data: core.packed(group.items)
                });
            }
        });

        if (!valid) return false;

        changes.forEach(function (change) {
            const group = change.group;

            if (group.vb.setData(change.data) === false) {
                valid = false;
                return;
            }

            group.data = change.data;
            group.bounds = change.bounds;

            group.mi.aabb = core.box3(change.bounds);
            group.entity.render.customAabb =
                core.box3(change.bounds);

            if (group.catcher) {
                group.catcher.mi.aabb =
                    core.box3(change.bounds);

                group.catcher.entity.render.customAabb =
                    core.box3(change.bounds);
            }

            script._counts.bufferUpdates++;
        });

        return valid;
    },

    // ========================================================
    // 16. RESTAURACION Y RECURSOS GPU
    // ========================================================

    restoreParked(script) {
        script._parked.forEach(function (original, component) {
            if (!component || !component.entity ||
                component.entity._destroyed) {
                return;
            }

            component.layers = original.layers.slice();

            if (component.meshInstances &&
                component.meshInstances[0]) {
                component.meshInstances[0].visible =
                    original.visible;
            }
        });

        script._parked.clear();
    },

    destroyGroups(script) {
        const core = AdvancedGpuInstancer._core;

        core.restoreParked(script);

        script._groups.forEach(function (group) {
            if (group.catcher) {
                group.catcher.entity.destroy();
            }

            if (group.entity) {
                try {
                    group.mi.setInstancing(null);
                } catch (_) { }

                group.entity.destroy();
            }

            if (group.vb) {
                try {
                    group.vb.destroy();
                } catch (_) { }
            }
        });

        script._groups.clear();

        [
            script._materials,
            script._catchMaterials
        ].forEach(function (cache) {
            cache.forEach(function (material) {
                try {
                    material.destroy();
                } catch (_) { }
            });

            cache.clear();
        });

        script._nativeAtlases.forEach(function (atlas) {
            try {
                atlas.color.destroy();
            } catch (_) { }

            if (atlas.dir) {
                try {
                    atlas.dir.destroy();
                } catch (_) { }
            }
        });

        script._nativeAtlases.length = 0;
        script._counts.nativeAtlasPages = 0;
        script._counts.nativeAtlasInstances = 0;
    },

    // ========================================================
    // 17. CONSTRUCCION GPU
    // ========================================================

    build(script) {
        const core = AdvancedGpuInstancer._core;

        if (script.app.graphicsDevice.insideRenderPass) {
            script._deferredBuild = true;
            return;
        }

        core.destroyGroups(script);
        core.snapshot(script);

        core.preBakePolicy(script);
        core.suppressBakedRealtime(script);

        const items = core.prepare(
            script,
            core.sources(script)
        );

        core.consolidateNative(script, items);

        const groups = core.groupsOf(script, items, true);

        let count = 0;

        groups.forEach(function (itemsInGroup) {
            for (let i = 0;
                i < itemsInGroup.length;
                i += core.MAX_GROUP) {

                const part = itemsInGroup.slice(
                    i,
                    i + core.MAX_GROUP
                );

                if (part.length < 2) continue;

                let bounds = null;

                part.forEach(function (item) {
                    bounds = core.merge(bounds, item.bounds);
                });

                if (core.makeGroup(script, {
                    items: part,
                    bounds: bounds,
                    cell: part[0].cell,
                    common: part[0].common
                })) {
                    count += part.length;
                }
            }
        });

        core.releaseUnusedAtlases(script);

        script._counts.groups = script._groups.size;
        script._counts.instances = count;
        script._counts.baked = 0;

        script._groups.forEach(function (group) {
            if (group.items[0].c.lightmapped &&
                group.items[0].lm.tex) {
                script._counts.baked += group.items.length;
            }
        });

        script._counts.rebuilds++;

        core.updateCatchers(script);
        core.updateNativeLocalCasters(script);

        script._signature = core.signature(script);

        if (script.debug) {
            console.log(
                core.TAG,
                'Grupos:', script._counts.groups,
                'Instancias:', count,
                'Baked:', script._counts.baked,
                'Catchers:', script._counts.catcherActive,
                'Atlas nativo:', script._counts.nativeAtlasPages,
                'Instancias atlas:',
                script._counts.nativeAtlasInstances,
                'Cambios Bake:', script._counts.bakeChanges
            );
        }
    },

    // ========================================================
    // 18. STREAMING FISICO
    // ========================================================

    physics(script, dt) {
        const core = AdvancedGpuInstancer._core;

        if (!script.physicsStreaming) return;

        script._physicsClock += dt;

        if (script._physicsClock < core.PHYSICS_INTERVAL) {
            return;
        }

        script._physicsClock = 0;

        const player = script.app.root
            .findByTag('is-player')
            .find(core.alive);

        if (!player) return;

        const position = player.getPosition();

        const velocity = player.rigidbody &&
            player.rigidbody.linearVelocity;

        const future = position.clone();

        if (velocity) {
            future.add(
                velocity.clone().mulScalar(0.6)
            );
        }

        const camera = core.cameras(script)[0];

        let distance = Math.max(
            12,
            (camera ? camera.farClip : 100) * 0.15
        );

        if (velocity) {
            distance += velocity.length() * 0.6;
        }

        script._collisions.forEach(function (collision) {
            if (!core.tagged(
                collision.entity,
                'agi-stream-physics'
            )) {
                return;
            }

            if (!script._physicsOriginal.has(collision)) {
                script._physicsOriginal.set(
                    collision,
                    collision.enabled
                );
            }

            const entityPosition =
                collision.entity.getPosition();

            const enabled = !!(
                script._physicsOriginal.get(collision) &&
                (
                    entityPosition.distance(future) < distance ||
                    entityPosition.distance(position) < distance * 0.65
                )
            );

            if (collision.enabled !== enabled) {
                collision.enabled = enabled;
            }
        });
    }

});

// ============================================================
// 19. PROTOTYPE: CICLO DE VIDA
// ============================================================

AdvancedGpuInstancer.prototype.initialize = function () {
    const core = AdvancedGpuInstancer._core;

    this._ids = new WeakMap();
    this._lastId = 0;

    this._groups = new Map();
    this._parked = new Map();

    this._materials = new Map();
    this._catchMaterials = new Map();
    this._nativeAtlases = [];

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
        bakedCasterSuppressed: 0,
        nativeAtlasPages: 0,
        nativeAtlasInstances: 0
    };

    this._scanClock = 0;
    this._catchClock = 0;
    this._physicsClock = 0;

    this._signature = '';
    this._paused = false;

    this._startPending = false;
    this._deferredBuild = false;

    this._format = new pc.VertexFormat(
        this.app.graphicsDevice,
        core.SEM.map(function (semantic) {
            return {
                semantic: semantic,
                components: 4,
                type: pc.TYPE_FLOAT32
            };
        })
    );

    let layerId = 21000;

    while (this.app.scene.layers.getLayerById(layerId)) {
        layerId++;
    }

    this._hiddenLayer = new pc.Layer({
        name: 'AGI4157_HIDDEN_SOURCES',
        id: layerId,
        enabled: false
    });

    this.app.scene.layers.push(this._hiddenLayer);

    this.on('disable', this.restore, this);
    this.on('destroy', this.restore, this);

    this.on('enable', function () {
        if (!this._groups.size) {
            this.rebuild();
        }
    }, this);

    core.snapshot(this);
    core.preBakePolicy(this);

    const script = this;

    this.app.once('postrender', function () {
        if (!script._paused) {
            script._startPending = true;
        }
    });
};

AdvancedGpuInstancer.prototype.update = function (dt) {
    const core = AdvancedGpuInstancer._core;

    if (this._paused) return;

    if (this._startPending || this._deferredBuild) {
        this._startPending = false;
        this._deferredBuild = false;
        core.build(this);
    }

    core.physics(this, dt);

    this._catchClock += dt;

    if (this._catchClock >= core.CATCHER_INTERVAL) {
        this._catchClock = 0;
        core.updateCatchers(this);
        core.updateNativeLocalCasters(this);
    }

    this._scanClock += dt;

    if (this._scanClock >= Math.max(0.2, this.scanInterval)) {
        this._scanClock = 0;

        core.snapshot(this);
        core.preBakePolicy(this);
        core.suppressBakedRealtime(this);

        if (core.signature(this) !== this._signature) {
            core.build(this);
        } else if (!core.refreshTransforms(this)) {
            core.build(this);
        }
    }
};

AdvancedGpuInstancer.prototype.restore = function () {
    const core = AdvancedGpuInstancer._core;

    this._paused = true;

    core.destroyGroups(this);
    core.restoreRealtime(this);
    core.restoreBake(this);

    this._physicsOriginal.forEach(function (original, collision) {
        if (collision && collision.entity &&
            !collision.entity._destroyed) {
            collision.enabled = original;
        }
    });

    this._physicsOriginal.clear();

    if (this._hiddenLayer &&
        this.app.scene.layers.getLayerById(
            this._hiddenLayer.id
        ) === this._hiddenLayer) {
        this.app.scene.layers.remove(
            this._hiddenLayer
        );
    }

    this._counts.groups = 0;
    this._counts.instances = 0;
    this._counts.baked = 0;
    this._counts.catcherActive = 0;
};

AdvancedGpuInstancer.prototype.rebuild = function () {
    const core = AdvancedGpuInstancer._core;

    this._paused = false;

    if (!this.app.scene.layers.getLayerById(
        this._hiddenLayer.id
    )) {
        this.app.scene.layers.push(
            this._hiddenLayer
        );
    }

    core.build(this);
};

// ============================================================
// 20. PROTOTYPE: CONTROLES
// ============================================================

AdvancedGpuInstancer.prototype.setBakeMode = function (enabled) {
    const core = AdvancedGpuInstancer._core;

    if (enabled) {
        this._paused = true;

        core.destroyGroups(this);
        core.restoreRealtime(this);

        core.snapshot(this);
        core.preBakePolicy(this);
    } else {
        this.rebuild();
    }

    if (this.debug) {
        console.log(core.TAG, 'Fuentes para bake:', !!enabled);
    }
};

AdvancedGpuInstancer.prototype.setBakedShadowMask = function (
    enabled,
    ratio
) {
    const core = AdvancedGpuInstancer._core;

    this.bakedShadowMask = !!enabled;

    if (typeof ratio === 'number' && Number.isFinite(ratio)) {
        this.bakedShadowRatio = Math.max(
            0.05,
            Math.min(0.95, ratio)
        );
    }

    core.syncMaskParams(this);

    console.log(
        core.TAG,
        'Mascara baked:', this.bakedShadowMask,
        'Umbral:', this.bakedShadowRatio
    );
};

AdvancedGpuInstancer.prototype.setCatcherBlend = function () {
    const core = AdvancedGpuInstancer._core;

    this._catchMaterials.forEach(function (material) {
        material.blendType = pc.BLEND_MULTIPLICATIVE;
        material.update();
    });

    console.warn(
        core.TAG,
        'Catcher mantiene composicion MULTIPLICATIVE.'
    );
};

// ============================================================
// 21. PROTOTYPE: AUDITORIAS
// ============================================================

AdvancedGpuInstancer.prototype.auditBakeRoles = function () {
    const core = AdvancedGpuInstancer._core;
    const script = this;
    const rows = [];

    this._renders.forEach(function (component) {
        if (!component || !component.entity ||
            component.entity.__agiProxy ||
            component.entity.__agiCatcher) {
            return;
        }

        const original = script._bakeOriginal.get(component);

        rows.push({
            nombre: component.entity.name,
            guid: component.entity.guid,
            rol: core.bakeRole(component),
            lightmapped: !!component.lightmapped,
            tieneLightmap: (component.meshInstances || [])
                .some(function (mi) {
                    return !!core.lightmap(mi).tex;
                }),
            bakeAntes: original
                ? original.castShadowsLightmap
                : null,
            bakeActual: !!component.castShadowsLightmap,
            castRealtime: !!component.castShadows,
            realtimeSuprimido:
                script._casterOriginal.has(component)
        });
    });

    console.table(rows);
    return rows;
};

AdvancedGpuInstancer.prototype.auditGroups = function () {
    const rows = [];

    this._groups.forEach(function (group) {
        rows.push({
            nombre: group.items[0].c.entity.name,
            instancias: group.items.length,
            baked: !!(
                group.items[0].c.lightmapped &&
                group.items[0].lm.tex
            ),
            castRealtime: group.mi.castShadow,
            receiveShadow: group.mi.receiveShadow,
            mask: group.mi.mask,
            shaderDefs: group.mi._shaderDefs,
            catcher: !!group.catcher,
            catcherActivo: !!(
                group.catcher &&
                group.catcher.entity.enabled
            )
        });
    });

    console.table(rows);
    return rows;
};

AdvancedGpuInstancer.prototype.auditDistance = function () {
    const core = AdvancedGpuInstancer._core;
    const rows = [];

    this._groups.forEach(function (group) {
        if (!group.catcher) return;

        const catcher = group.catcher;

        rows.push({
            nombre: group.entity.name,
            instancias: group.items.length,
            activo: catcher.entity.enabled,
            razon: catcher.reason,
            zMin: catcher.z
                ? core.n3(catcher.z[0])
                : null,
            zMax: catcher.z
                ? core.n3(catcher.z[1])
                : null,
            shadowDistance: catcher.distance
        });
    });

    console.table(rows);
    return rows;
};

AdvancedGpuInstancer.prototype.auditShadows = function () {
    const rows = [];

    this.app.root.findComponents('render')
        .forEach(function (component) {
            if (component.entity.__agiCatcher) return;

            (component.meshInstances || []).forEach(function (mi) {
                rows.push({
                    objeto: component.entity.name,
                    proxy: !!component.entity.__agiProxy,
                    lightmapped: !!component.lightmapped,
                    castRealtime: mi.castShadow,
                    receiveShadow: mi.receiveShadow,
                    mask: mi.mask,
                    layers: component.layers.join(','),
                    shaderDefs: mi._shaderDefs
                });
            });
        });

    console.table(rows);
    return rows;
};

AdvancedGpuInstancer.prototype.auditShadowSources = function () {
    const core = AdvancedGpuInstancer._core;
    const rows = [];

    const casters = new Set(
        core.realtimeCasters(this).map(function (item) {
            return item.mi;
        })
    );

    this._renders.forEach(function (component) {
        if (!component || !component.entity ||
            component.entity.__agiProxy ||
            component.entity.__agiCatcher) {
            return;
        }

        (component.meshInstances || []).forEach(function (mi) {
            rows.push({
                objeto: component.entity.name,
                receptorBaked: !!(
                    component.lightmapped &&
                    core.lightmap(mi).tex
                ),
                castShadowsLightmap:
                    !!component.castShadowsLightmap,
                castRealtime: !!(
                    component.castShadows &&
                    mi.castShadow
                ),
                catcherCaster: casters.has(mi),
                mask: mi.mask,
                estatico: !!component.isStatic
            });
        });
    });

    console.table(rows);
    return rows;
};

AdvancedGpuInstancer.prototype.auditSpotCasters = function () {
    const core = AdvancedGpuInstancer._core;
    const rows = [];

    core.spots(this).forEach(function (light) {
        const casters = [];

        ((light.light && light.light._renderData) || [])
            .forEach(function (renderData) {
                (renderData.visibleCasters || [])
                    .forEach(function (mi) {
                        casters.push(
                            mi.node && mi.node.name
                        );
                    });
            });

        rows.push({
            luz: light.entity.name,
            castShadows: light.castShadows,
            intensidad: light.intensity,
            shadowIntensity: light.shadowIntensity,
            range: light.range,
            cono: light.outerConeAngle,
            shadowBias: light.shadowBias,
            normalOffsetBias: light.normalOffsetBias,
            affectLightmapped: light.affectLightmapped,
            mask: light.mask,
            shadowMap: !!(
                light.light &&
                light.light.shadowMap
            ),
            casters: casters.join(',')
        });
    });

    console.table(rows);
    return rows;
};

AdvancedGpuInstancer.prototype.auditSpotReceivers = function () {
    const core = AdvancedGpuInstancer._core;
    const rows = [];
    const script = this;

    core.spots(script).forEach(function (light) {
        script._groups.forEach(function (group) {
            const center = core.box3(group.bounds).center;
            const position = light.entity.getPosition();

            const direction = center.clone().sub(position);
            const distance = direction.length();
            const matrix = light.entity.getWorldTransform().data;

            const forward = new pc.Vec3(
                -matrix[4],
                -matrix[5],
                -matrix[6]
            );

            const angle = distance > 0
                ? Math.acos(
                    Math.max(
                        -1,
                        Math.min(
                            1,
                            forward.dot(direction) / distance
                        )
                    )
                ) * 180 / Math.PI
                : 0;

            rows.push({
                luz: light.entity.name,
                receptor: group.items[0].c.entity.name,
                instancias: group.items.length,
                baked: !!(
                    group.items[0].c.lightmapped &&
                    group.items[0].lm.tex
                ),
                receiveShadow: group.mi.receiveShadow,
                mascaraCompatible:
                    !!(light.mask & group.mi.mask),
                distancia: core.n3(distance),
                anguloCentro: core.n3(angle),
                cono: light.outerConeAngle
            });
        });
    });

    console.table(rows);
    return rows;
};

AdvancedGpuInstancer.prototype.auditSpotDistances =
    AdvancedGpuInstancer.prototype.auditSpotReceivers;

AdvancedGpuInstancer.prototype.auditPerformance = function () {
    const core = AdvancedGpuInstancer._core;
    const counts = this._counts;

    const row = {
        version: 'AGI4.15.7',
        drawCalls: this.app.stats.drawCallCount,
        groups: counts.groups,
        instances: counts.instances,
        baked: counts.baked,
        catcherActive: counts.catcherActive,
        bakeChanges: counts.bakeChanges,
        bakedCasterSuppressed: counts.bakedCasterSuppressed,
        nativeAtlasPages: counts.nativeAtlasPages,
        nativeAtlasInstances: counts.nativeAtlasInstances,
        rebuilds: counts.rebuilds,
        bufferUpdates: counts.bufferUpdates,
        bakedShadowMask: !!this.bakedShadowMask,
        bakedShadowRatio: core.n3(this.bakedShadowRatio)
    };

    console.table([row]);
    return row;
};

AdvancedGpuInstancer.prototype.capturePerformance = function (label) {
    const result = this.auditPerformance();
    result.label = label || 'captura';
    return result;
};

AdvancedGpuInstancer.prototype.auditPasses = function () {
    return {
        drawCalls: this.app.stats.drawCallCount,
        catcherActive: this._counts.catcherActive,
        spot: this.auditSpotCasters()
    };
};

AdvancedGpuInstancer.prototype.audit = function () {
    return {
        performance: this.auditPerformance(),
        groups: this.auditGroups(),
        bakeRoles: this.auditBakeRoles(),
        distance: this.auditDistance(),
        shadows: this.auditShadows(),
        spot: this.auditSpotCasters()
    };
};

// ============================================================
// 22. PROTOTYPE: BENCHMARK
// ============================================================

AdvancedGpuInstancer.prototype.benchmarkPasses = async function (frames) {
    const core = AdvancedGpuInstancer._core;

    frames = Math.max(
        15,
        Math.min(240, Math.floor(frames || 60))
    );

    const script = this;
    const spots = core.spots(script);
    const directionals = core.directionals(script);
    const catchers = [];

    script._groups.forEach(function (group) {
        if (group.catcher) {
            catchers.push(group.catcher.entity);
        }
    });

    const oldSpots = spots.map(function (light) {
        return [light, light.castShadows];
    });

    const oldDirectionals = directionals.map(function (light) {
        return [light, light.castShadows];
    });

    const oldCatchers = catchers.map(function (entity) {
        return [entity, entity.enabled];
    });

    const wasPaused = script._paused;
    const rows = [];

    script._paused = true;

    async function sample(label) {
        const data = [];

        for (let i = 0; i < frames + 12; i++) {
            await new Promise(function (resolve) {
                requestAnimationFrame(resolve);
            });

            if (i >= 12) {
                data.push(
                    script.app.stats.drawCallCount || 0
                );
            }
        }

        data.sort(function (a, b) {
            return a - b;
        });

        return {
            estado: label,
            drawsP50: data[Math.floor(data.length / 2)],
            drawsPromedio: core.n3(
                data.reduce(function (a, b) {
                    return a + b;
                }, 0) / data.length
            )
        };
    }

    try {
        rows.push(
            await sample('Escena actual')
        );

        catchers.forEach(function (entity) {
            entity.enabled = false;
        });

        rows.push(
            await sample('Sin Catchers')
        );

        oldCatchers.forEach(function (item) {
            item[0].enabled = item[1];
        });

        spots.forEach(function (light) {
            light.castShadows = false;
        });

        rows.push(
            await sample('Sin sombras Spot')
        );

        oldSpots.forEach(function (item) {
            item[0].castShadows = item[1];
        });

        directionals.forEach(function (light) {
            light.castShadows = false;
        });

        rows.push(
            await sample('Sin sombras Directional')
        );

    } finally {
        oldSpots.forEach(function (item) {
            item[0].castShadows = item[1];
        });

        oldDirectionals.forEach(function (item) {
            item[0].castShadows = item[1];
        });

        oldCatchers.forEach(function (item) {
            item[0].enabled = item[1];
        });

        script._paused = wasPaused;
    }

    console.table(rows);
    return rows;
};
