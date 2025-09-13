var BillboardRotateZ = pc.createScript('billboardRotateZ');

// velocidad de rotación en grados por segundo
BillboardRotateZ.attributes.add('rotationSpeed', {
    type: 'number',
    default: 30,
    title: 'Rotation Speed (deg/s)'
});

BillboardRotateZ.prototype.initialize = function () {
    this.cameraEntity = this.app.root.findByName('Camera');
    this.angle = 0;
};

BillboardRotateZ.prototype.update = function (dt) {
    if (this.cameraEntity) {
        // 1. Mirar hacia la cámara
        this.entity.lookAt(this.cameraEntity.getPosition());


        // 2. Incrementar ángulo en Z
        this.angle += this.rotationSpeed * dt;

        // 3. Crear un quaternion adicional de rotación en Z
        var rotZ = new pc.Quat();
        rotZ.setFromAxisAngle(pc.Vec3.FORWARD, this.angle);

        // 4. Combinar rotación original (lookAt) con la de Z
        this.entity.setRotation(this.entity.getRotation().mul(rotZ));
    }
};