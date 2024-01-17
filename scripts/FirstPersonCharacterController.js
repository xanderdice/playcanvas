var FirstPersonCharacterController = pc.createScript('firstPersonCharacterController');

FirstPersonCharacterController.attributes.add('speed', {
    type: 'number',
    default: 5,
    title: 'Speed'
});



FirstPersonCharacterController.attributes.add('lookSpeed', {
    type: 'number',
    default: 0.2,
    title: 'Look Speed'
});

FirstPersonCharacterController.attributes.add('characterCamera', {
    type: 'entity',
    title: 'characterCamera',
    description: 'Selecciona una entidad con un componente de cámara.'
});

FirstPersonCharacterController.attributes.add('coso_bloqueador', {
    type: 'boolean',
    title: 'coso_bloqueador',
    description: 'coso_bloqueador'
});


FirstPersonCharacterController.prototype.initialize = function () {
    this.entity.collision.on('collisionstart', this.onCollisionStart, this);
    this.entity.collision.on('collisionend', this.onCollisionEnd, this);

    this.app.mouse.on('mousemove', this.onMouseMove, this);
    this.app.mouse.disableContextMenu();

    this.app.mouse.on('mousedown', function (e) {
        if (e.button === pc.MOUSEBUTTON_LEFT || e.button === pc.MOUSEBUTTON_RIGHT) {
            this.app.mouse.enablePointerLock();
        }
    }, this);


    this.aspectRatio = this.app.graphicsDevice.width / this.app.graphicsDevice.height;
    this.mouseMovement = pc.Vec2.ZERO;
    this.lastMousePosition = pc.Vec2.ZERO;
    this.dtLookSpeed = this.lookSpeed;
    this.cameraRotation = 0;

    this.timerUpdateBusy = false;

    if (this.characterCamera) {
        this.characterCamera.setRotation(pc.Vec3.ZERO);
    } else {
        this.characterCamera = new pc.Entity();
        this.characterCamera.setName("Camera");

        // Agrega el componente de cámara
        this.characterCamera.addComponent("camera", {
            clearColor: new pc.Color(0.8, 0.8, 0.8), // Color de fondo de la cámara
            nearClip: 0.1,
            farClip: 100
        });
    }



    // Aplica la rotación de HEAD a la cámara


    this.headEntity = this.entity.findByName("mixamorig:Head");



    // Actualiza la rotación de la cámara para que coincida con la rotación de la cabeza
    var headRotation = this.headEntity.getRotation(); // Obtiene la rotación de la cabeza
    headRotation.y += 180;
    this.characterCamera.setRotation(headRotation); // Aplica la misma rotación a la cámara
    var cameraPos = this.headEntity.getPosition();
    cameraPos.z += 12;
    this.characterCamera.setPosition(cameraPos);

    this.headEntity.addChild(this.characterCamera);

    //setInterval(this.timerUpdate.bind(this), 30);

};


FirstPersonCharacterController.prototype.timerUpdate = async function (dt) {
    if (!this.timerUpdateBusy) {
        // Movimiento del jugador
        this.timerUpdateBusy = true;
        if (this.entity.rigidbody) {
            var forward = 0;
            var right = 0;

            if (this.app.keyboard.isPressed(pc.KEY_W)) forward += 1;
            if (this.app.keyboard.isPressed(pc.KEY_S)) forward -= 1;
            if (this.app.keyboard.isPressed(pc.KEY_A)) right += 1;
            if (this.app.keyboard.isPressed(pc.KEY_D)) right -= 1;





            // Saltar
            if (this.app.keyboard.isPressed(pc.KEY_SPACE)) {
                if (this.onGround) {

                    var mass = this.entity.rigidbody.mass;
                    // Calcular el impulso necesario
                    var impulse = Math.sqrt(2 * mass * Math.abs(9.8) * 10);
                    var impulseVector = new pc.Vec3(0, impulse, 0);

                    this.entity.rigidbody.applyImpulse(impulseVector);
                }
            }

            var movement = new pc.Vec3(right, 0, forward);
            movement.normalize().scale(this.speed);
            var rotation = this.entity.getRotation();
            var transformedMovement = rotation.transformVector(movement);

            // Aplicar movimiento al cuerpo rígido del jugador
            this.entity.rigidbody.linearVelocity = new pc.Vec3(transformedMovement.x, this.entity.rigidbody.linearVelocity.y, transformedMovement.z);




            var isMouseMoving = false;
            // Comprueba si la posición del mouse ha cambiado desde la última vez
            if (this.mouseMovement.equals(this.lastMousePosition)) {
                this.entity.rigidbody.angularVelocity = pc.Vec3.ZERO;
            } else {
                isMouseMoving = true;
            }
            this.lastMousePosition = new pc.Vec2(this.mouseMovement.x, this.mouseMovement.y);

            this.mouseMovement = new pc.Vec2().copy(this.mouseMovement);


            if (isMouseMoving) {

                // Aplicar rotación al cuerpo rígido del jugador
                var yaw = -this.mouseMovement.x;

                // Aplicar rotación solo si hay movimiento del mouse
                if (yaw !== 0) {
                    this.entity.rigidbody.angularVelocity = new pc.Vec3(0, yaw, 0);
                }

                if (this.characterCamera) {
                    var pitch = -this.mouseMovement.y;
                    this.cameraRotation += pitch;
                    this.cameraRotation = pc.math.clamp(this.cameraRotation, -50, 50);

                    if (this.cameraRotation) {
                        var currentAngles = this.characterCamera.getLocalRotation();
                        this.characterCamera.setLocalEulerAngles(this.cameraRotation, currentAngles.y + 180, currentAngles.z);
                    }
                }

            }


            var currentSpeed = Math.floor(this.entity.rigidbody.linearVelocity.length());

            if (this.entity.anim) {
                this.entity.anim.setFloat("speed", currentSpeed);
                this.entity.anim.enabled = !(isMouseMoving && currentSpeed < 0.1);
            }



        }

        if (this.coso_bloqueador) {

            for (var i = 0; i < 100000000; i++) {

            }

        }

        this.timerUpdateBusy = false;
    }

}


FirstPersonCharacterController.prototype.update = function (dt) {
    this.timerUpdate(dt);
};

FirstPersonCharacterController.prototype.onCollisionStart = function (result) {

    // Verificar si el jugador está en el suelo
    var groundNormal = new pc.Vec3(0, 1, 0);


    var resultNormal = (result.contacts || [])[0].normal;


    if (result.other && resultNormal) {
        var dot = resultNormal.dot(groundNormal);
        var angle = Math.acos(dot);  // Calcular el ángulo en radianes

        // Convertir el ángulo de radianes a grados
        //var angleDegrees = pc.math.radToDeg(angle);
        var angleDegrees = Math.abs(angle * (180 / Math.PI));


        // Ajustar el umbral de ángulo permitido (60 grados)
        var maxAllowedAngle = 190;
        if (angleDegrees <= maxAllowedAngle) {
            this.onGround = true;
        } else {
            this.onGround = false;
        }
    } else {
        this.onGround = false;
    }

};

FirstPersonCharacterController.prototype.onCollisionEnd = function (result) {
    this.onGround = false;
}


FirstPersonCharacterController.prototype.onMouseMove = function (event) {

    var deltaX = event.dx;
    var deltaY = event.dy;

    var deltaTime = this.app.stats.frame.dt;

    // Ajusta el desplazamiento del mouse con respecto al tiempo transcurrido
    deltaX *= this.lookSpeed / deltaTime;
    deltaY *= (this.lookSpeed / deltaTime) * this.aspectRatio * 1.2;

    // Actualizar el movimiento del mouse
    this.mouseMovement = new pc.Vec2(deltaX, deltaY);





};

