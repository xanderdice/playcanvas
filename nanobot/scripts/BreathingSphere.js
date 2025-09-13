var BreathingSphere = pc.createScript('breathingSphere');

BreathingSphere.attributes.add('baseSpeed', { type: 'number', default: 0.5, title: 'Velocidad base' });
BreathingSphere.attributes.add('intensity', { type: 'number', default: 0.25, title: 'Intensidad de respiración' });
BreathingSphere.attributes.add('speedVariation', { type: 'number', default: 0.3, title: 'Variación máxima de velocidad' });
BreathingSphere.attributes.add('speedChangeRate', { type: 'number', default: 0.1, title: 'Velocidad de cambio de ritmo' });
BreathingSphere.attributes.add('minScale', { type: 'number', default: 0.8, title: 'Escala mínima relativa' });

// --- Perlin noise ---
BreathingSphere.prototype.noise = function (x) {
    var X = Math.floor(x) & 255;
    x -= Math.floor(x);
    var u = x * x * (3 - 2 * x);
    return this.grad(this.perm[X], x) * (1 - u) + this.grad(this.perm[X + 1], x - 1) * u;
};

BreathingSphere.prototype.grad = function (hash, x) {
    return (hash & 1) === 0 ? x : -x;
};

BreathingSphere.prototype.initialize = function () {
    this.time = Math.random() * 100;
    this.speedTime = Math.random() * 50;
    this.baseScale = this.entity.getLocalScale().clone();
    this.basePosition = this.entity.getLocalPosition().clone(); // Guardar posición original

    this.perm = [];
    for (var i = 0; i < 256; i++) this.perm[i] = Math.floor(Math.random() * 256);
    this.perm = this.perm.concat(this.perm);

    this.currentSpeed = this.baseSpeed;
};

BreathingSphere.prototype.update = function (dt) {
    // Cambiar velocidad suavemente
    this.speedTime += dt * this.speedChangeRate;
    var speedOffset = this.noise(this.speedTime) * this.speedVariation;
    this.currentSpeed = this.baseSpeed + speedOffset;

    // Tiempo para respiración
    this.time += dt * this.currentSpeed;

    // Respiración orgánica
    var breath = this.noise(this.time) * this.intensity * this.baseScale.y;

    // Escalas compensadas
    var scaleY = this.baseScale.y + breath;
    var scaleX = this.baseScale.x - breath * 0.5;
    var scaleZ = this.baseScale.z - breath * 0.5;

    // Asegurar que nunca bajen de la escala mínima
    scaleX = Math.max(scaleX, this.baseScale.x * this.minScale);
    scaleY = Math.max(scaleY, this.baseScale.y * this.minScale);
    scaleZ = Math.max(scaleZ, this.baseScale.z * this.minScale);

    // Aplicar escala
    this.entity.setLocalScale(scaleX, scaleY, scaleZ);

    // Compensar posición para que el "centro" se mantenga
    var yOffset = (this.baseScale.y - scaleY) * 0.5; // mover mitad del cambio
    /*
    this.entity.setLocalPosition(
        this.basePosition.x,
        this.basePosition.y - yOffset,
        this.basePosition.z
    );
    */
};
