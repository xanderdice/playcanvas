/*PUT THIS SCRIPT IN THE BOAT ENTITY*/

var BoatWaveMovement = pc.createScript('BoatWaveMovement');

// Atributos configurables en el editor
BoatWaveMovement.attributes.add('maxRotationDegrees', {
    type: 'number',
    default: 25,
    description: 'Máximo ángulo de rotación permitido.'
});

BoatWaveMovement.attributes.add('rotationSpeed', {
    type: 'number',
    default: 2,
    description: 'Velocidad de rotación del barco.'
});

BoatWaveMovement.attributes.add('waveAmplitude', {
    type: 'number',
    default: 0.1,
    description: 'Amplitud máxima del movimiento de las olas.'
});

BoatWaveMovement.attributes.add('waveSpeed', {
    type: 'number',
    default: 1.0,
    description: 'Velocidad de las olas.'
});

// Inicialización
BoatWaveMovement.prototype.initialize = function () {
    // Variables para controlar la rotación del barco
    this.currentRotationX = 0;
    this.currentRotationZ = 0;
    this.targetRotationX = 0;
    this.targetRotationZ = 0;

    // Iniciar fase aleatoria para hacer que las olas sean más aleatorias
    this.phaseOffsetX = Math.random() * Math.PI * 2;
    this.phaseOffsetZ = Math.random() * Math.PI * 2;

    this.elapsedTime = 0;
    this.maxTime = Math.random() * (0.5 - 0.1) + 0.1;
};

// Update se llama cada frame
BoatWaveMovement.prototype.update = function (dt) {
    this.elapsedTime += dt;
    if (this.elapsedTime >= this.maxTime) {
        this.maxTime = Math.random() * (0.1 - 0.01) + 0.01;
        this.elapsedTime = 0;
        // this.waveAmplitude = Math.random() * (1 - 0.1) + 0.1;
        // this.waveSpeed = Math.random() * (1 - 0.1) + 0.1;
    }
    // Simulación de movimiento de las olas (para ejemplo)
    var waveMovementX = Math.sin((Date.now() * this.waveSpeed + this.phaseOffsetX) * 0.001) * this.waveAmplitude;
    var waveMovementZ = Math.cos((Date.now() * this.waveSpeed + this.phaseOffsetZ) * 0.001) * this.waveAmplitude;

    // Calcular la rotación deseada del barco
    this.targetRotationX = waveMovementX * this.maxRotationDegrees;
    this.targetRotationZ = waveMovementZ * this.maxRotationDegrees;

    // Suavizar la rotación actual hacia la rotación deseada
    this.currentRotationX = this.smoothRotation(this.currentRotationX, this.targetRotationX, dt);
    this.currentRotationZ = this.smoothRotation(this.currentRotationZ, this.targetRotationZ, dt);

    // Aplicar la rotación al barco
    this.entity.setLocalEulerAngles(this.currentRotationX, 0, this.currentRotationZ);
};

// Función para suavizar la transición de la rotación actual a la rotación deseada
BoatWaveMovement.prototype.smoothRotation = function (current, target, dt) {
    var speed = this.rotationSpeed * dt;
    return pc.math.lerp(current, target, speed);
};