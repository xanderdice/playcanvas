// --------------- POST EFFECT DEFINITION --------------- //
function DistortionEffect(graphicsDevice) {
    pc.PostEffect.call(this, graphicsDevice);

    // Shaders
    var attributes = {
        aPosition: pc.SEMANTIC_POSITION
    };

    var vertex = [
        "attribute vec2 aPosition;",
        "",
        "uniform float uStrength;",
        "uniform float uHeight;",
        "uniform float uAspectRatio;",
        "uniform float uCylindricalRatio;",
        "",
        "varying vec3 vUv0;",
        "varying vec2 vUVDot;",
        "",
        "void main(void)",
        "{",
        "    gl_Position = vec4(aPosition, 0.0, 1.0);",
        "    vec2 uv = (aPosition.xy + 1.0) * 0.5;",
        `
        float scaledHeight = uStrength * uHeight;
        float cylAspectRatio = uAspectRatio * uCylindricalRatio;
        float aspectDiagSq = uAspectRatio * uAspectRatio + 1.0;
        float diagSq = scaledHeight * scaledHeight * aspectDiagSq;
        vec2 signedUV = (2.0 * uv + vec2(-1.0, -1.0));

        float z = 0.5 * sqrt(diagSq + 1.0) + 0.5;
        float ny = (z - 1.0) / (cylAspectRatio * cylAspectRatio + 1.0);

        vUVDot = sqrt(ny) * vec2(cylAspectRatio, 1.0) * signedUV;
        vUv0 = vec3(0.5, 0.5, 1.0) * z + vec3(-0.5, -0.5, 0.0);
        vUv0.xy += uv;
        `,
        "}"
    ].join("\n");

    var fragment = [
        "precision " + graphicsDevice.precision + " float;",
        "",
        "uniform sampler2D uColorBuffer;",
        "",
        "varying vec3 vUv0;",
        "varying vec2 vUVDot;",
        "",
        "void main() {",
        `
            vec3 uv = dot(vUVDot, vUVDot) * vec3(-0.5, -0.5, -1.0) + vUv0;
            gl_FragColor = texture2DProj(uColorBuffer, uv);
        `,
        "}"
    ].join("\n");

    this.distortionShader = new pc.Shader(graphicsDevice, {
        attributes: attributes,
        vshader: vertex,
        fshader: fragment
    });

    this.horizontalFOV = 140;
    this.strength = 0.5;
    this.cylindricalRatio = 2;
}

DistortionEffect.prototype = Object.create(pc.PostEffect.prototype);
DistortionEffect.prototype.constructor = DistortionEffect;

Object.assign(DistortionEffect.prototype, {
    render: function (inputTarget, outputTarget, rect) {
        const device = this.device;
        const scope = device.scope;

        const camera = this.cameraEntity.camera;
        const height = Math.tan(pc.math.DEG_TO_RAD * this.horizontalFOV / 2);
        camera.fov = Math.atan(height) * 2 * 180 / 3.1415926535;

        scope.resolve("uColorBuffer").setValue(inputTarget.colorBuffer);
        scope.resolve("uStrength").setValue(this.strength);
        scope.resolve("uHeight").setValue(height);
        scope.resolve("uAspectRatio").setValue(camera.aspectRatio);
        scope.resolve("uCylindricalRatio").setValue(this.cylindricalRatio);
        pc.drawFullscreenQuad(device, outputTarget, this.vertexBuffer, this.distortionShader, rect);
    }
});

// ----------------- SCRIPT DEFINITION ------------------ //
var Distortion = pc.createScript('distortion');

Distortion.attributes.add('cameraEntity', {
    type: 'entity',
});

Distortion.attributes.add('horizontalFOV', {
    type: 'number',
    default: 140,
    min: 0,
    max: 180,
    title: 'Horizontal FOV'
});

Distortion.attributes.add('strength', {
    type: 'number',
    default: 0.5,
    min: 0,
    max: 2,
    title: 'Strength'
});

Distortion.attributes.add('cylindricalRatio', {
    type: 'number',
    default: 2.0,
    min: 0.0,
    max: 5,
    title: 'Cylindrical Ratio'
});

// initialize code called once per entity
Distortion.prototype.initialize = function () {
    this.effect = new DistortionEffect(this.app.graphicsDevice);
    this.effect.cameraEntity = this.cameraEntity;
    this.effect.horizontalFOV = this.horizontalFOV;
    this.effect.strength = this.strength;
    this.effect.cylindricalRatio = this.cylindricalRatio;

    this.on('attr', function (name, value) {
        this.effect[name] = value;
    }, this);

    var queue = this.entity.camera.postEffects;
    queue.addEffect(this.effect);

    this.on('state', function (enabled) {
        if (enabled) {
            queue.addEffect(this.effect);
        } else {
            queue.removeEffect(this.effect);
        }
    });

    this.on('destroy', function () {
        queue.removeEffect(this.effect);
    });
};