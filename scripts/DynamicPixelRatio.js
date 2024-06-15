/*PUT ON ROOT ENTITY */
// Polyfill for performance.now()
(function () {
    if (!window.performance) {
        window.performance = {};
    }

    if (!window.performance.now) {
        var nowOffset = Date.now();

        if (performance.timing && performance.timing.navigationStart) {
            nowOffset = performance.timing.navigationStart;
        }

        window.performance.now = function () {
            return Date.now() - nowOffset;
        };
    }
})();

var DynamicPixelRatio = pc.createScript('dynamicPixelRatio');

// Configurable settings
DynamicPixelRatio.attributes.add('targetFPS', {
    type: 'number',
    default: 45,
    min: 15,
    max: 45,
    precision: 0,
    description: 'FPS objetivo'
});
DynamicPixelRatio.attributes.add('minPixelRatio', {
    type: 'number',
    default: 0.5,
    min: 0,
    max: 0.5,
    precision: 2,
    description: 'Ratio de píxel mínimo'
});
/*
DynamicPixelRatio.attributes.add('maxPixelRatio', {
    type: 'number',
    default: 2,
    min: 1,
    max: 2,
    precision: 2,
    description: 'Ratio de píxel máximo'
});
*/
DynamicPixelRatio.attributes.add('adjustmentStep', {
    type: 'number',
    default: 0.1,
    description: 'Paso de ajuste del ratio de píxel'
});

// Initialization code
DynamicPixelRatio.prototype.initialize = function () {
    this.maxPixelRatio = window.devicePixelRatio;
    this.app.graphicsDevice.maxPixelRatio = this.maxPixelRatio;
    this.lastTime = window.performance.now();
    this.frameCount = 0;
    this.currentPixelRatio = this.app.graphicsDevice.maxPixelRatio;
};

// Update code called every frame
DynamicPixelRatio.prototype.update = function (dt) {
    this.frameCount++;
    var currentTime = window.performance.now();
    var elapsedTime = currentTime - this.lastTime;

    // Check FPS every second
    if (elapsedTime >= 1000) {
        var fps = (this.frameCount / elapsedTime) * 1000;
        this.frameCount = 0;
        this.lastTime = currentTime;

        // Adjust pixel ratio based on FPS
        if (fps < this.targetFPS && this.currentPixelRatio > this.minPixelRatio) {
            this.currentPixelRatio = Math.max(this.minPixelRatio, this.currentPixelRatio - this.adjustmentStep);
        } else if (fps > this.targetFPS && this.currentPixelRatio < this.maxPixelRatio) {
            this.currentPixelRatio = Math.min(this.maxPixelRatio, this.currentPixelRatio + this.adjustmentStep);
        }

        this.app.graphicsDevice.maxPixelRatio = this.currentPixelRatio;
        Trace("this.app.graphicsDevice.maxPixelRatio", this.app.graphicsDevice.maxPixelRatio);
    }
};