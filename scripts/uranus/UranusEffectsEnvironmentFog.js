var UranusEffectsEnvironmentFog = pc.createScript("uranusEffectsEnvironmentFog");
UranusEffectsEnvironmentFog.attributes.add("inEditor", {
    type: "boolean",
    default: !0
}),
    UranusEffectsEnvironmentFog.attributes.add("fogCubemapColor", {
        type: "boolean",
        default: !0,
        title: "Cubemap Color"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogDensityMax", {
        type: "number",
        default: .75,
        min: 0,
        max: 1,
        title: "Fog Density Max"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogScattering", {
        type: "vec2",
        default: [.05, 25],
        title: "Scattering"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogScatteringHeight", {
        type: "number",
        default: 0,
        title: "Scattering Height"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogScatteringDistance", {
        type: "number",
        default: 1e3,
        title: "Scattering Distance"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogNoise", {
        type: "boolean",
        default: !0,
        title: "Noise"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogNoiseScale", {
        type: "number",
        default: .0015,
        title: "Noise Scale"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogNoiseDistance", {
        type: "number",
        default: 250,
        title: "Noise Distance"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogNoiseSpeed", {
        type: "number",
        default: 50,
        title: "Noise Speed"
    }),
    UranusEffectsEnvironmentFog.attributes.add("fogNoiseOctaves", {
        type: "number",
        default: 5,
        title: "Noise Octaves"
    }),
    UranusEffectsEnvironmentFog.prototype.initialize = function () {
        this.fogTime = 0,
            this.scopeFogTime = this.app.graphicsDevice.scope.resolve("fogTime"),
            this.scopeFogDensityMax = this.app.graphicsDevice.scope.resolve("fogDensityMax"),
            this.scopeFogScattering = this.app.graphicsDevice.scope.resolve("fogScattering"),
            this.scopeFogScatteringHeight = this.app.graphicsDevice.scope.resolve("fogScatteringHeight"),
            this.scopeFogScatteringDistance = this.app.graphicsDevice.scope.resolve("fogScatteringDistance"),
            this.scopeFogNoiseScale = this.app.graphicsDevice.scope.resolve("fogNoiseScale"),
            this.scopeFogNoiseDistance = this.app.graphicsDevice.scope.resolve("fogNoiseDistance"),
            this.scopeFogNoiseSpeed = this.app.graphicsDevice.scope.resolve("fogNoiseSpeed"),
            this.prepare(),
            this.on("attr", this.updateAttributes)
    }
    ,
    UranusEffectsEnvironmentFog.prototype.updateAttributes = function () {
        this.scopeFogDensityMax.setValue(this.fogDensityMax),
            this.scopeFogScattering.setValue([this.fogScattering.x, this.fogScattering.y]),
            this.scopeFogScatteringHeight.setValue(this.fogScatteringHeight),
            this.scopeFogScatteringDistance.setValue(this.fogScatteringDistance),
            this.scopeFogNoiseScale.setValue(this.fogNoiseScale),
            this.scopeFogNoiseDistance.setValue(this.fogNoiseDistance)
    }
    ,
    void 0 === UranusEffectsEnvironmentFog.overridenGlobalChunks && (UranusEffectsEnvironmentFog.overridenGlobalChunks = !1),
    UranusEffectsEnvironmentFog.prototype.prepare = function () {
        UranusEffectsEnvironmentFog.overridenGlobalChunks || (UranusEffectsEnvironmentFog.overridenGlobalChunks = !0,
            pc.shaderChunks.basePS = this.basePS(),
            this.fogCubemapColor && (pc.shaderChunks.ambientEnvPS = this.ambientEnvPS()),
            pc.shaderChunks.fogExp2PS = this.fogExp2PS(),
            pc.shaderChunks.particle_initVS = this.particle_initVS(),
            pc.shaderChunks.particle_cpuVS = this.particle_cpuVS(),
            pc.shaderChunks.particle_endVS = this.particle_endVS()),
            this.updateAttributes()
    }
    ,
    UranusEffectsEnvironmentFog.prototype.update = function (e) {
        this.fogNoise && (this.fogTime += e * this.fogNoiseSpeed,
            this.scopeFogTime.setValue(this.fogTime))
    }
    ,
    UranusEffectsEnvironmentFog.prototype.basePS = function () {
        return `\nvec3 dEnvironmentAmbient;\n\n${pc.shaderChunks.basePS}\n`
    }
    ,
    UranusEffectsEnvironmentFog.prototype.ambientEnvPS = function () {
        return "\n#ifndef ENV_ATLAS\n#define ENV_ATLAS\nuniform sampler2D texture_envAtlas;\n#endif\n\nvoid addAmbient(vec3 worldNormal) {\n    vec3 dir = normalize(cubeMapRotate(worldNormal) * vec3(-1.0, 1.0, 1.0));\n    vec2 uv = mapUv(toSphericalUv(dir), vec4(128.0, 256.0 + 128.0, 64.0, 32.0) / atlasSize);\n\n    vec4 raw = texture2D(texture_envAtlas, uv);\n    vec3 linear = $DECODE(raw);\n\n    dDiffuseLight += processEnvironment(linear);\n\n    // --- calculate ambient for environment fog\n    vec2 uv1 = vec2(0.5, 0.25); // sample a horizon pixel\n\n    vec4 raw1 = texture2D(texture_envAtlas, uv1);\n    vec3 linear1 = $DECODE(raw1);\n    \n    dEnvironmentAmbient = processEnvironment(linear1);\n}    \n"
    }
    ,
    UranusEffectsEnvironmentFog.prototype.fogExp2PS = function () {
        return `\n#ifdef PARTICLE\nvarying vec3 vPositionW;\nvec3 dEnvironmentAmbient = vec3(1.0, 1.0, 1.0);\nuniform vec3 view_position;\n#endif\n\nuniform float fogTime;\nuniform float fogDensityMax;\nuniform vec2 fogScattering;\nuniform float fogScatteringHeight;\nuniform float fogScatteringDistance;\n\nuniform vec3 fog_color;\nuniform float fog_density;\nfloat dBlendModeFogFactor = 1.0;\n\n${this.fogNoise ? `\nuniform float fogNoiseScale;\nuniform float fogNoiseDistance;\n\nfloat noise_simplex_3D( vec3 P )\n{\n    //  https://github.com/BrianSharpe/Wombat/blob/master/SimplexPerlin3D.glsl\n\n    //  simplex math constants\n    const float SKEWFACTOR = 1.0/3.0;\n    const float UNSKEWFACTOR = 1.0/6.0;\n    const float SIMPLEX_CORNER_POS = 0.5;\n    const float SIMPLEX_TETRAHEDRON_HEIGHT = 0.70710678118654752440084436210485;    // sqrt( 0.5 )\n\n    //  establish our grid cell.\n    P *= SIMPLEX_TETRAHEDRON_HEIGHT;    // scale space so we can have an approx feature size of 1.0\n    vec3 Pi = floor( P + dot( P, vec3( SKEWFACTOR) ) );\n\n    //  Find the vectors to the corners of our simplex tetrahedron\n    vec3 x0 = P - Pi + dot(Pi, vec3( UNSKEWFACTOR ) );\n    vec3 g = step(x0.yzx, x0.xyz);\n    vec3 l = 1.0 - g;\n    vec3 Pi_1 = min( g.xyz, l.zxy );\n    vec3 Pi_2 = max( g.xyz, l.zxy );\n    vec3 x1 = x0 - Pi_1 + UNSKEWFACTOR;\n    vec3 x2 = x0 - Pi_2 + SKEWFACTOR;\n    vec3 x3 = x0 - SIMPLEX_CORNER_POS;\n\n    //  pack them into a parallel-friendly arrangement\n    vec4 v1234_x = vec4( x0.x, x1.x, x2.x, x3.x );\n    vec4 v1234_y = vec4( x0.y, x1.y, x2.y, x3.y );\n    vec4 v1234_z = vec4( x0.z, x1.z, x2.z, x3.z );\n\n    // clamp the domain of our grid cell\n    Pi.xyz = Pi.xyz - floor(Pi.xyz * ( 1.0 / 69.0 )) * 69.0;\n    vec3 Pi_inc1 = step( Pi, vec3( 69.0 - 1.5 ) ) * ( Pi + 1.0 );\n\n    //\tgenerate the random vectors\n    vec4 Pt = vec4( Pi.xy, Pi_inc1.xy ) + vec2( 50.0, 161.0 ).xyxy;\n    Pt *= Pt;\n    vec4 V1xy_V2xy = mix( Pt.xyxy, Pt.zwzw, vec4( Pi_1.xy, Pi_2.xy ) );\n    Pt = vec4( Pt.x, V1xy_V2xy.xz, Pt.z ) * vec4( Pt.y, V1xy_V2xy.yw, Pt.w );\n    const vec3 SOMELARGEFLOATS = vec3( 635.298681, 682.357502, 668.926525 );\n    const vec3 ZINC = vec3( 48.500388, 65.294118, 63.934599 );\n    vec3 lowz_mods = vec3( 1.0 / ( SOMELARGEFLOATS.xyz + Pi.zzz * ZINC.xyz ) );\n    vec3 highz_mods = vec3( 1.0 / ( SOMELARGEFLOATS.xyz + Pi_inc1.zzz * ZINC.xyz ) );\n    Pi_1 = ( Pi_1.z < 0.5 ) ? lowz_mods : highz_mods;\n    Pi_2 = ( Pi_2.z < 0.5 ) ? lowz_mods : highz_mods;\n    vec4 hash_0 = fract( Pt * vec4( lowz_mods.x, Pi_1.x, Pi_2.x, highz_mods.x ) ) - 0.49999;\n    vec4 hash_1 = fract( Pt * vec4( lowz_mods.y, Pi_1.y, Pi_2.y, highz_mods.y ) ) - 0.49999;\n    vec4 hash_2 = fract( Pt * vec4( lowz_mods.z, Pi_1.z, Pi_2.z, highz_mods.z ) ) - 0.49999;\n\n    //\tevaluate gradients\n    vec4 grad_results = inversesqrt( hash_0 * hash_0 + hash_1 * hash_1 + hash_2 * hash_2 ) * ( hash_0 * v1234_x + hash_1 * v1234_y + hash_2 * v1234_z );\n\n    //\tNormalization factor to scale the final result to a strict 1.0->-1.0 range\n    //\thttp://briansharpe.wordpress.com/2012/01/13/simplex-noise/#comment-36\n    const float FINAL_NORMALIZATION = 37.837227241611314102871574478976;\n\n    //  evaulate the kernel weights ( use (0.5-x*x)^3 instead of (0.6-x*x)^4 to fix discontinuities )\n    vec4 kernel_weights = v1234_x * v1234_x + v1234_y * v1234_y + v1234_z * v1234_z;\n    kernel_weights = max(0.5 - kernel_weights, 0.0);\n    kernel_weights = kernel_weights*kernel_weights*kernel_weights;\n\n    //\tsum with the kernel and return\n    return dot( kernel_weights, grad_results ) * FINAL_NORMALIZATION;\n}\n\nfloat fog_FBM(vec3 p) {\n  float value = 0.0;\n  float amplitude = 0.5;\n  float frequency = 0.0;\n  for (int i = 0; i < ${Math.trunc(this.fogNoiseOctaves)}; ++i) {\n    value += amplitude * noise_simplex_3D(p);\n    p *= 2.0;\n    amplitude *= 0.5;\n  }\n  return value;\n}\n` : ""}\n\nvec3 addFog(vec3 color) {\n\n    float depth = distance(view_position, vPositionW);\n\n    ${this.fogNoise ? "\n    vec3 noisePos = vPositionW * fogNoiseScale + vec3(0.0, 0.0, fogTime * fogNoiseScale * 0.1);\n    float noiseSample = fog_FBM(noisePos + fog_FBM(noisePos)) * 0.5 + 0.5;\n    float fogDepth = depth * mix(noiseSample, 1.0, clamp((depth - fogNoiseDistance) / fogNoiseDistance, 0.0, 1.0));    \n    " : "\n    float fogDepth = depth;\n    "}\n\n    fogDepth *= fogDepth;\n\n    float fogAmount = fog_density * fog_density;\n\n    float scattering = fogScattering.x + fogScattering.y * clamp((depth - fogScatteringDistance) / fogScatteringDistance, 0.0, 1.0);\n\n    // --- calculate height based fog\n    float worldPosY = max( abs(vPositionW.y - fogScatteringHeight), 0.01);\n\n    float fogFactor = scattering * exp(-worldPosY * fogAmount) * (1.0 - exp(-fogDepth * fogAmount * worldPosY)) / worldPosY;\n    fogFactor = min(fogDensityMax, fogFactor);\n\n    fogFactor = clamp(1.0 - fogFactor, 0.0, 1.0);\n\n    return mix(${this.fogCubemapColor ? "dEnvironmentAmbient * " : ""} dBlendModeFogFactor * fog_color, color, fogFactor);\n}\n`
    }
    ,
    UranusEffectsEnvironmentFog.prototype.particle_initVS = function () {
        return `\n${pc.shaderChunks.particle_initVS}\n\nvarying vec3 vPositionW;\n`
    }
    ,
    UranusEffectsEnvironmentFog.prototype.particle_cpuVS = function () {
        return `\nvarying vec3 vPositionW;\n\n${pc.shaderChunks.particle_cpuVS}\n`
    }
    ,
    UranusEffectsEnvironmentFog.prototype.particle_endVS = function () {
        return `\n  ${pc.shaderChunks.particle_endVS} \n\n  vPositionW = gl_Position.xyz;\n`
    }
    ;