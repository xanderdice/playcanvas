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