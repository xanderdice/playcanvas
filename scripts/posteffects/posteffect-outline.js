

// --------------- POST EFFECT DEFINITION --------------- //
Object.assign(pc, function () {

    /**
     * @class
     * @name pc.OutlineEffect
     * @classdesc Applies an outline effect on input render target
     * @description Creates new instance of the post effect.
     * @augments pc.PostEffect
     * @param {pc.GraphicsDevice} graphicsDevice - The graphics device of the application.
     * @property {pc.Texture} texture The outline texture to use.
     * @property {pc.Color} color The outline color.
     */
    var OutlineEffect = function (graphicsDevice, thickness) {
        pc.PostEffect.call(this, graphicsDevice);

        this.shader = new pc.Shader(graphicsDevice, {
            attributes: {
                aPosition: pc.SEMANTIC_POSITION
            },
            vshader: [
                "attribute vec2 aPosition;",
                "",
                "varying vec2 vUv0;",
                "",
                "void main(void)",
                "{",
                "    gl_Position = vec4(aPosition, 0.0, 1.0);",
                "    vUv0 = (aPosition.xy + 1.0) * 0.5;",
                "}"
            ].join("\n"),
            fshader: [
                "precision " + graphicsDevice.precision + " float;",
                "",
                "#define THICKNESS " + thickness.toFixed(0),
                "uniform float uWidth;",
                "uniform float uHeight;",
                "uniform vec4 uOutlineCol;",
                "uniform sampler2D uColorBuffer;",
                "uniform sampler2D uOutlineTex;",
                "",
                "varying vec2 vUv0;",
                "",
                "void main(void)",
                "{",
                "    vec4 texel1 = texture2D(uColorBuffer, vUv0);",
                "    float sample0 = texture2D(uOutlineTex, vUv0).a;",
                "    float outline = 0.0;",
                "    if (sample0==0.0)",
                "    {",
                "        for (int x=-THICKNESS;x<=THICKNESS;x++)",
                "        {",
                "            for (int y=-THICKNESS;y<=THICKNESS;y++)",
                "            {    ",
                "                float sample=texture2D(uOutlineTex, vUv0+vec2(float(x)/uWidth, float(y)/uHeight)).a;",
                "                if (sample>0.0)",
                "                {",
                "                    outline=1.0;",
                "                }",
                "            }",
                "        } ",
                "    }",
                "    gl_FragColor = mix(texel1, uOutlineCol, outline * uOutlineCol.a);",
                "}"
            ].join("\n")
        });

        // Uniforms
        this.color = new pc.Color(1, 1, 1, 1);
        this.texture = new pc.Texture(graphicsDevice);
        this.texture.name = 'pe-outline';
    };

    OutlineEffect.prototype = Object.create(pc.PostEffect.prototype);
    OutlineEffect.prototype.constructor = OutlineEffect;

    var colorArray = [0, 0, 0, 0];

    Object.assign(OutlineEffect.prototype, {
        render: function (inputTarget, outputTarget, rect) {
            var device = this.device;
            var scope = device.scope;

            scope.resolve("uWidth").setValue(inputTarget.width);
            scope.resolve("uHeight").setValue(inputTarget.height);

            colorArray[0] = this.color.r;
            colorArray[1] = this.color.g;
            colorArray[2] = this.color.b;
            colorArray[3] = this.color.a;
            scope.resolve("uOutlineCol").setValue(colorArray);

            scope.resolve("uColorBuffer").setValue(inputTarget.colorBuffer);
            scope.resolve("uOutlineTex").setValue(this.texture);
            pc.drawFullscreenQuad(device, outputTarget, this.vertexBuffer, this.shader, rect);

            //this.drawQuad(this.outputTarget, this.shader, rect);
        }
    });

    return {
        OutlineEffect: OutlineEffect
    };
}());

// ----------------- SCRIPT DEFINITION ------------------ //
var Outline = pc.createScript('outline');

Outline.attributes.add('color', {
    type: 'rgb',
    default: [0.5, 0.5, 0.5, 1],
    title: 'Color'
});

Outline.attributes.add('texture', {
    type: 'asset',
    assetType: 'texture',
    title: 'Texture'
});

Outline.prototype.initialize = function () {
    this.effect = new pc.OutlineEffect(this.app.graphicsDevice);
    this.effect.color = this.color;
    this.effect.texture = this.texture.resource;

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

    this.on('attr:color', function (value) {
        this.effect.color = value;
    }, this);

    this.on('attr:texture', function (value) {
        this.effect.texture = value ? value.resource : null;
    }, this);
};
