/*
El script character proporciona funcionalidades para el control de movimiento 
y detección de colisiones de un personaje en un entorno 3D. 
Algunas características notables incluyen:

*/

var Character = pc.createScript('character');

Character.attributes.add('speed', { type: 'number', default: 4, title: "speed", description: "Velocidad del personaje." });
Character.attributes.add('isSelectable', { type: 'boolean', default: false });
Character.attributes.add('isPlayer', { type: 'boolean', default: false });
Character.attributes.add('playerOptions',
    {
        title: "Player options",
        type: 'json',
        schema: [
            {
                name: 'playerPersonStyle',
                title: 'Player Person Style',
                type: 'string', enum: [
                    { 'FirstPerson': 'FirstPerson' },
                    { 'ThirdPerson': 'ThirdPerson' }
                ], default: 'ThirdPerson'
            }, {
                name: 'playerControllerOnKeyUP',
                type: 'string', enum: [
                    { 'MoveForward': 'MoveForward' },
                    { 'Jump': 'Jump' }
                ], default: 'MoveForward'
            }, {
                name: 'playerControllerOnKeyRight',
                type: 'string', enum: [
                    { 'Rotate': 'Rotate' },
                    { 'Strafe': 'Strafe' }
                ], default: 'Rotate'
            }, {
                name: 'godMode',
                type: 'boolean',
                default: false
            }
        ]
    });



// VFX
//https://mebiusbox.github.io/contents/EffectTextureMaker/



Character.prototype.initialize = function () {
    this.entity.isSelectable = this.isSelectable;
    this.entity.isPlayer = this.isPlayer;
    this.entity.selected = this.entity.isPlayer;
    this.entity.isCharacter = true;
    this.entity.targetPoint = new pc.Vec3(0, 0, 0);
    this.doMoveCharacter_busy = false;

    this.anim = this.entity.anim;

    this.renderCharacterComponent = this.entity.findComponent('render')

    //this.pointEntity = new pc.Entity()
    /*
    this.pointEntity.addComponent('render', {
        type: 'sphere',
        radius: 0.05
    });
    */
    /*
        this.pointEntity.addComponent('collision', {
            type: 'sphere',
            radius: 0.1
        });
    
        this.pointEntity.collision.on('triggerenter', function () {
            this.stopMovement();
        }, this);
        this.app.root.addChild(this.pointEntity);
        this.pointEntity.setPosition(this.entity.getPosition());
        */








    if (!this.entity.collision) {
        this.entity.addComponent('collision', {
            type: 'compound'
        });
        var capsule_collision = new pc.Entity(this.entity.name + "_capsule_collision");
        this.entity.addChild(capsule_collision);

        capsule_collision.addComponent('collision', {
            type: 'capsule',
            radius: 0.35,
            height: 1.8
        });
        this.entity.collision.on("collisionstart", this.sensorCollisionstartEvent, this);
        this.entity.collision.on("collisionend", this.sensorCollisionendEvent, this);



        /*
                var cap = new pc.Entity();
                cap.addComponent('render', {
                    type: 'capsule',
                    radius: 0.35,
                    height: height
                });
                this.entity.addChild(cap);
        */

    }









    if (!this.entity.rigidbody) {
        var mass = 90;

        this.entity.addComponent('rigidbody', {
            type: 'dynamic',         // Tipo de cuerpo rígido (puede ser 'dynamic', 'static' o 'kinematic')
            mass: mass,              // Masa del cuerpo rígido
            friction: 0.5,          // Coeficiente de fricción
            restitution: 0.2,       // Coeficiente de restitución (rebote)
            linearDamping: 0.0,     // Amortiguación lineal
            angularDamping: 0.0,    // Amortiguación angular
            linearFactor: new pc.Vec3(1, 1, 1),  // Permitir movimiento en los ejes X y Z, pero no en el eje Y
            angularFactor: new pc.Vec3(0, 0, 0)
        });
    }




    this.entity.on('character:domove', async function (eventParams) {
        this.doMoveCharacter(eventParams);
    }, this);

    this.entity.on('character:look', async function (eventLook) {
        this.look = eventLook;
    }, this);

    this.entity.on('character:forward', async function (e) {

    }, this);

    this.entity.on('character:strafe', async function (e) {

    }, this);



};












Character.prototype.stopMovement = function () {

    this.entity.rigidbody.linearVelocity = new pc.Vec3(0, this.entity.rigidbody.linearVelocity.y, 0);
    this.entity.targetPoint = null;

}




Character.prototype.doMoveCharacter = async function (params) {
    if (!this.entity.rigidbody) return;
    if (!this.doMoveCharacter_busy) {
        this.doMoveCharacter_busy = true;


        var speed = 0,
            moveForward = params.deviceInputKeyboard.moveForward || 0,
            moveRight = params.deviceInputKeyboard.moveRight || 0,
            direction = new pc.Vec3(),
            rotation = this.entity.getLocalRotation(),
            walkingbackwards = false;


        if (moveForward !== 0) {
            this.entity.targetPoint = null;
            direction.copy(this.entity.forward).normalize();
            speed = this.speed * moveForward;
            walkingbackwards = moveForward < 0;
        }

        if ((this.playerOptions.playerPersonStyle || "") === "FirstPerson") {
            var deltaX = ((this.look || {}).deltaX) || 0;
            if (deltaX !== 0) {
                var deltaY = deltaX * ((this.look || {}).lookSpeed) || 1;
                var deltaRotation = new pc.Quat().setFromEulerAngles(0, -deltaY, 0);
                rotation.mul(deltaRotation);
                this.look.deltaX = 0;
            }
        }

        if ((this.playerOptions.playerControllerOnKeyRight || "") === "Rotate") {

            if (moveRight !== 0) {
                this.entity.targetPoint = null;
                if ((this.playerOptions.playerControllerOnKeyRight || "") === "Rotate") {
                    var deltaY = this.speed * (this.speed / 2) * moveRight; // Puedes ajustar este valor según tus necesidades
                    // Crea un cuaternión de rotación para representar la rotación adicional en el eje Y
                    var deltaRotation = new pc.Quat().setFromEulerAngles(0, -deltaY, 0);
                    // Multiplica la rotación actual por la rotación adicional en el eje Y
                    rotation.mul(deltaRotation);
                }
                else if ((this.playerOptions.playerControllerOnKeyRight || "") === "Strafe") {
                    direction.copy(this.entity.right).normalize();
                    speed = this.speed * moveRight;
                }
            }



            if (this.entity.targetPoint) {

                // Verificar si el jugador ha alcanzado el punto de destino
                if (Math.abs(this.entity.getPosition().x - this.entity.targetPoint.x) > 0.1 || Math.abs(this.entity.getPosition().z - this.entity.targetPoint.z) > 0.1) {
                    // Calcular la dirección hacia el punto de destino
                    direction.copy(this.entity.targetPoint).sub(this.entity.getPosition()).normalize();
                    // Calcular el ángulo de rotación
                    var angle = Math.atan2(-direction.x, -direction.z);

                    //this.entity.rigidbody.enabled = false;
                    var euler = new pc.Vec3(0, (angle * pc.math.RAD_TO_DEG), 0);
                    rotation = new pc.Quat().setFromEulerAngles(0, euler.y, 0);

                    rotation = new pc.Quat().slerp(this.entity.getLocalRotation(), rotation, 0.4);

                    speed = this.speed;
                } else {
                    speed = 0;
                    this.stopMovement();
                }
            }



            this.entity.rigidbody.teleport(this.entity.getPosition(), rotation);
            direction.y = 0; // Asegurarse de que no cambie la altura

            // Moverse en la dirección hacia el punto de destino
            var velocity = direction.scale(speed);
            if (speed !== 0) {
                this.entity.rigidbody.linearVelocity = new pc.Vec3(velocity.x, this.entity.rigidbody.linearVelocity.y, velocity.z);
            }



            this.doSensors();


            var currentVelocity = this.entity.rigidbody.linearVelocity;
            currentVelocity.y = 0;
            speed = currentVelocity.length();



            if (this.anim) {
                this.anim.enabled = this.visibleThisFrame();
                //this.anim.setInteger('dir', 0);
                //this.anim.setFloat('speed', speed);
                this.anim.setBoolean('walkingbackwards', walkingbackwards);
                this.anim.setBoolean('walking', speed > 0.1 && speed < 1.5);
                this.anim.setBoolean('running', speed > 1.5);
                this.anim.setBoolean('idle', speed < 0.1);
                //this.anim.setBoolean('isonair', this.entity.isonair);
            }


            /*
                for (var i = 0; i < 100000000; i++) {
                    var r = 0;
                }
            */
            this.doMoveCharacter_busy = false;
        }
    }
}


Character.prototype.doSensors = function () {


    if (this.entity.sensorFrontEntity) {

        this.stopMovement();
        this.entity.sensorFrontEntity = null;
    }


    var currentVelocity = this.entity.rigidbody.linearVelocity;


    this.entity.isonair = false;
    var onairThreshold = 2.5;
    if (!this.entity.sensorBottomEntity) {
        this.entity.isonair = !(currentVelocity.y >= -onairThreshold && currentVelocity.y <= onairThreshold);
    }

    if (this.entity.isonair) {
        this.stopMovement();
    }



    var characterPosition = this.entity.getPosition();
    var forward = this.entity.forward;

    // Calcular el punto final del rayo
    var endPosition = new pc.Vec3();
    endPosition.copy(characterPosition).addScaled(forward, 0.5);

    // Realizar el raycast
    var raycast = this.app.systems.rigidbody.raycastFirst
        (
            new pc.Vec3(characterPosition.x, characterPosition.y - 0.5, characterPosition.z),
            new pc.Vec3(endPosition.x, endPosition.y - 0.5, endPosition.z)
        );
    /*this.app.drawLine
        (
            new pc.Vec3(characterPosition.x, characterPosition.y - 0.5, characterPosition.z),
            new pc.Vec3(endPosition.x, endPosition.y - 0.5, endPosition.z),
            pc.Color.RED
        );
*/
    if (raycast != null && raycast.entity != this.entity) {


        var dot = raycast.normal.dot(new pc.Vec3(0, 1, 0)); // Calcular el producto punto con el eje Y
        var angle = Math.acos(Math.min(1, dot)); // Asegurarse de que el ángulo esté en el rango válido [0, π]
        var maxToleranceAngle = (60 * Math.PI) / 180; // Convertir 75 grados a radianes

        if (maxToleranceAngle < angle) {

            this.stopMovement();
        }
    }

    // Realizar el raycast hacia arriba
    var raycastUp = this.app.systems.rigidbody.raycastFirst
        (
            new pc.Vec3(characterPosition.x, characterPosition.y + 1, characterPosition.z),
            new pc.Vec3(endPosition.x, endPosition.y + 1, endPosition.z),
        );
    /*
this.app.drawLine
    (
        new pc.Vec3(characterPosition.x, characterPosition.y + 1, characterPosition.z),
        new pc.Vec3(endPosition.x, endPosition.y + 1, endPosition.z),
        pc.Color.RED
    );
*/
    // Lógica para el raycast hacia arriba
    if (raycastUp != null && raycastUp.entity != this.entity) {
        // Puedes realizar alguna lógica específica si hay colisión hacia arriba
        this.stopMovement();
    }

}


Character.prototype.sensorCollisionstartEvent = async function (result) {



    var i = 0,
        contacts_length = (result.contacts || []).length,
        /* Calcular los vectores de los ejes principales*/
        xAxis = new pc.Vec3(1, 0, 0),
        yAxis = new pc.Vec3(0, 1, 0),
        zAxis = new pc.Vec3(0, 0, 1),
        /* Definir un umbral para determinar si la colisión es significativ */
        threshold = 0.8;

    for (; i < contacts_length; i++) {
        var contactNormal = result.contacts[i].normal,
            /* Calcular el ángulo entre la normal de la colisión y los ejes principales */
            angleX = contactNormal.dot(xAxis),
            angleY = contactNormal.dot(yAxis),
            angleZ = contactNormal.dot(zAxis);



        /* Analizar los resultados y determinar el lado de la colisión */
        if (Math.abs(angleX) > threshold) {


            if (angleX > 0) {
                this.entity.sensorRightEntity = null;
                this.entity.sensorLeftEntity = result.other;

                /*Colisión en el lado izquierdo*/
            } else {
                this.entity.sensorRightEntity = result.other;
                this.entity.sensorLeftEntity = null;
                /*Colisión en el lado derecho*/

            }
        } else if (Math.abs(angleY) > threshold) {


            if (angleY > 0) {
                this.entity.sensorTopEntity = null;
                this.entity.sensorBottomEntity = result.other;
                /*Colisión en la parte inferior*/

            } else {
                this.entity.sensorTopEntity = result.other;
                this.entity.sensorBottomEntity = null;
                /*Colisión en la parte superior*/

            }
        } else if (Math.abs(angleZ) > threshold) {


            if (angleZ > 0) {

                this.entity.sensorFrontEntity = null;
                /*Colisión en el lado trasero*/
                this.entity.sensorBackEntity = result.other;

            } else {
                this.entity.sensorBackEntity = null;
                /*Colisión en el lado frontal*/

                this.entity.sensorFrontEntity = result.other;


            }
        }
    }

}
Character.prototype.sensorCollisionendEvent = function (entity) {

    if ((this.entity.sensorRightEntity || {})._guid === entity._guid) {
        this.entity.sensorRightEntity = null;
    }
    if ((this.entity.sensorLeftEntity || {})._guid === entity._guid) {
        this.entity.sensorLeftEntity = null;
    }
    if ((this.entity.sensorTopEntity || {})._guid === entity._guid) {
        this.entity.sensorTopEntity = null;
    }
    if ((this.entity.sensorBottomEntity || {})._guid === entity._guid) {
        this.entity.sensorBottomEntity = null;
    }
    if ((this.entity.sensorFrontEntity || {})._guid === entity._guid) {
        this.entity.sensorFrontEntity = null;
    }
    if ((this.entity.sensorBackEntity || {})._guid === entity._guid) {
        this.entity.sensorBackEntity = null;
    }

}



Character.prototype.visibleThisFrame = function (dt) {
    return (((this.renderCharacterComponent || {}).meshInstances || [])[0] || {}).visibleThisFrame;
}

/**
 * UPDATE 
 */
Character.prototype.update = function (dt) {

    //this.doMoveCharacter();

};