/*
El script character proporciona funcionalidades para el control de movimiento 
y detección de colisiones de un personaje en un entorno 3D. 
Algunas características notables incluyen:

ATENCION:
REQUIERE QUE GameCharactersController.js este instalado en la entidad ROOT.

*/

/* VFX
// https://mebiusbox.github.io/contents/EffectTextureMaker/ */

var Character = pc.createScript('character');

Character.attributes.add('speed', { type: 'number', default: 1.5, title: "speed", description: "Velocidad del personaje.", min: 1.5, max: 2.5, precision: 1 });
Character.attributes.add('gravity', { type: 'number', default: -9.8, title: "gravity", description: "gravity del personaje.", min: -9.8, max: -9.8, precision: 1 });
Character.attributes.add('isSelectable', { type: 'boolean', default: false });
Character.attributes.add('isPlayer', { type: 'boolean', default: false });
Character.attributes.add('inertia', { type: 'boolean', default: true });
Character.attributes.add('playerOptions',
    {
        title: "Player options",
        type: 'json',
        schema: [
            {
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
            },
            {
                name: 'rotationEventDelay',
                title: 'rotationEventDelay',
                type: 'number',
                default: 0
            }
        ]
    });



Character.attributes.add('sensorOptions',
    {
        title: "Sensor options",
        type: 'json',
        schema: [
            {
                name: 'sensorEnabled',
                type: 'boolean',
                default: true
            },
            {
                name: 'sensorDebug',
                type: 'boolean',
                default: false
            },
            {
                name: 'sensorJumpDebug',
                type: 'boolean',
                default: false
            }
            ,
            {
                name: 'groundtolerance',
                type: 'number',
                description: 'ground tolerance for steps',
                default: 0.15,
                min: 0.1,
                max: 0.5
            }
        ]
    });

Character.attributes.add('tracerOptions',
    {
        title: "Trace Options",
        type: 'json',
        schema: [
            {
                name: 'traceinput',
                type: 'boolean',
                default: false
            },
            {
                name: 'tracedetector',
                type: 'boolean',
                default: false
            },
            {
                name: 'traceattack',
                type: 'boolean',
                default: false
            }
        ]
    });


Character.attributes.add('playerAnimationsOptions',
    {
        title: "Player Animations Options",
        type: 'json',
        schema: [
            {
                name: 'motionrootmode',
                title: "Motion root mode",
                type: 'string', enum: [
                    { "in_place_all_axis": "in_place_all_axis" },
                    { "in_place_z_axis": "in_place_z_axis" },
                    { "teleport": "teleport" },
                    { "none": "none" }],
                default: "in_place_z_axis"
            },
            {
                name: 'hips',
                title: "Hips Entity",
                type: 'entity',
                default: null
            }
        ]
    });


Character.attributes.add('animations_unarmed',
    {
        title: "Animations Unarmed",
        type: 'json',
        schema: [
            {
                name: 'idle',
                type: 'asset',
                assetType: 'animation',
                array: true
            },
            {
                name: 'walking',
                type: 'asset',
                assetType: 'animation',
                array: false
            },
            {
                name: 'running',
                type: 'asset',
                assetType: 'animation',
                array: false
            },
            {
                name: 'attack',
                type: 'asset',
                assetType: 'animation',
                array: true
            },
        ]
    });



Character.attributes.add('carryWeapons',
    {
        title: "Carry Weapons",
        type: 'json',
        schema: [
            {
                name: 'leftHand',
                type: 'entity',
                default: null
            },
            {
                name: 'leftHandWeaponEntity',
                type: 'entity',
                default: null
            },
            {
                name: 'rightHand',
                type: 'entity',
                default: null
            },
            {
                name: 'rightHandWeaponEntity',
                type: 'entity',
                default: null
            }


        ]
    });


Character.attributes.add('attackSystem',
    {
        title: "attackSystem",
        type: 'json',
        schema: [
            {
                name: 'canAttack',
                type: 'boolean',
                default: true
            },
            {
                name: 'walkAndAttack',
                type: 'boolean',
                default: false
            }
        ]
    });



/**
 * Enumeration representing the various states of the character's attack system.
 * @readonly
 * @enum {number}
 */
const CharacterAttackSystemStatusEnum = Object.freeze({
    /**
     * No attack or damage is occurring.
     * @type {number}
     */
    NONE: 0,

    /**
     * The character is in the process of attacking but is not yet causing damage.
     * @type {number}
     */
    ATTACKING: 1,

    /**
     * The character is actively attacking and causing damage.
     * @type {number}
     */
    DAMAGING: 2,

    /**
     * The character is ending the attack phase, possibly with a final animation or finishing move.
     * @type {number}
     */
    ENDING: 3,
});

const CharacterLocomotionModeEnum = Object.freeze({
    UNARMED: 0,
    LIGHTER: 1,
    ARMED: 2,
});


Character.prototype.initialize = function () {
    this.entity.isCharacter = true;
    if (this.entity.isCharacter) {
        this.entity.tags.add("is-character");
    }
    this.entity.isPlayer = this.isPlayer;
    if (this.entity.isPlayer) {
        this.entity.tags.add("is-player");
    }
    this.entity.isSelectable = this.isSelectable;
    if (this.entity.isSelectable) {
        this.entity.tags.add("is-selectable");
    }
    this.entity.selected = this.entity.isPlayer;
    this.entity.tags.add("is-detectable");


    this.entity.targetPoint = null;
    this.doMoveCharacter_busy = false;

    this.CHAR_CUR_POSITION = this.entity.getPosition();
    this.CHAR_CUR_ROTATION = this.entity.getRotation();
    this.CHAR_LAST_POSITION = this.CHAR_CUR_POSITION.clone();

    this.detectedEntities = [];
    this.sensorOptions.detectableEntities = []
    this.sensorOptions.detectableEntities_length = 0;



    this.renderCharacterComponent = this.entity.findComponent('render');
    this.renderCharacterComponent.entity.tags.add("uranus-instancing-exclude");




    /*internal character timers*/
    this._timers = {};
    this._timercounter = 0;

    this.jumping_availability = true;


    this.animPlayerStateGraphData = null;
    if (!this.playerAnimationsOptions.hips) {
        this.playerAnimationsOptions.hips = this.entity.findByName("mixamorig:Hips");
    }
    if (this.playerAnimationsOptions.hips) {
        this.playerAnimationsOptions.startPosition = this.playerAnimationsOptions.hips.getLocalPosition().clone();
    }
    this.motionrootmode = this.playerAnimationsOptions.motionrootmode;

    this.renderCharacterComponent.rootBone = this.playerAnimationsOptions.hips;


    this.animatorTargetReached = true;
    this.animatorCurrentAnimId = 0;


    if (!this.carryWeapons.leftHand) {
        this.carryWeapons.leftHand = this.entity.findByName("mixamorig:LeftHand");
    }
    if (!this.carryWeapons.rightHand) {
        this.carryWeapons.rightHand = this.entity.findByName("mixamorig:RightHand");
    }


    this.entity.attackSystem = {
        canAttack: this.attackSystem.canAttack,
        walkAndAttack: this.attackSystem.walkAndAttack,
        status: CharacterAttackSystemStatusEnum.NONE,
        attackInput: false,
        attackInputOld: false,
        canDoAttack: true,
        __elapsedTime: 0,
    };


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
        this.app.scene.root.addChild(this.pointEntity);
        this.pointEntity.setPosition(this.entity.getPosition());
        */






    this.characterHeight = 1.8;
    this.characterRadius = 0.3;

    if (!this.entity.collision) {
        this.entity.addComponent('collision', {
            type: 'compound'
        });
        var capsule_collision = new pc.Entity(this.entity.name + "_capsule_collision");
        this.entity.addChild(capsule_collision);

        capsule_collision.addComponent('collision', {
            type: 'capsule',
            radius: this.characterRadius,
            height: this.characterHeight
        });



        if (this.sensorOptions.sensorDebug) {

            const options = {
                radius: this.characterRadius,
                height: this.characterHeight
            };
            const capsuleMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, new pc.CapsuleGeometry(options));


            const transparentMaterial = new pc.StandardMaterial({
                diffuse: pc.Color.RED
            });
            const meshInstance = new pc.MeshInstance(capsule_collision, capsuleMesh, transparentMaterial);
            capsule_collision.addComponent('render', {
                renderStyle: pc.RENDERSTYLE_WIREFRAME,
                meshInstances: [meshInstance],
                material: transparentMaterial
            });
            capsule_collision.render.meshInstances[0].material = transparentMaterial;
        }


    }

    this.entity.collision.on("collisionstart", this.sensorCollisionStartEvent, this);
    this.entity.collision.on("collisionend", this.sensorCollisionEndEvent, this);



    this.sensorOptions.processstep = 0;
    this.sensorOptions.groundProcessstep = 0;

    this.mantleHeight = 0.9;







    if (!this.entity.rigidbody) {
        var mass = 90;

        this.entity.addComponent('rigidbody', {
            type: 'dynamic',         // Tipo de cuerpo rígido (puede ser 'dynamic', 'static' o 'kinematic')
            mass: mass,              // Masa del cuerpo rígido
            friction: 0.5,          // Coeficiente de fricción
            restitution: 0,       // Coeficiente de restitución (rebote)
            linearDamping: 0.0,     // Amortiguación lineal
            angularDamping: 0.0,    // Amortiguación angular
            linearFactor: new pc.Vec3(1, 1, 1),  // Permitir movimiento en los ejes X y Z, pero no en el eje Y
            angularFactor: new pc.Vec3(0, 0, 0)
        });
    }

    this.prepareAnimComponent();




    this.entity.on('character:detector', function (detectedEntities) {

        if (this.tracerOptions.tracedetector) {
            var detEnt = [];
            detEnt.push("" + detectedEntities.length);
            for (var i = 0; i < detectedEntities.length; i++) {
                detEnt.push(detectedEntities[i].name);
            }
            Trace("detectedEntities", detEnt);
        }
        for (var i = 0; i < detectedEntities.length; i++) {

        }

        //Trace("character:detector", detectedEntities);
    }, this);


    this.vec = new pc.Vec3;
    this.vec2 = new pc.Vec3;
    this.vec3 = new pc.Vec3;
    this.quat = new pc.Quat;


    this.on("destroy", function () {

    }, this);

    this.entity.on("destroy", function () {
        //this.entity.collision.off();
    }, this);



};






Character.prototype.rotateToNewDirectionFromCameraFunc = function (camera, teleport) {
    this.playerOptions.rotateToNewDirectionCamera = null;
    // Obtiene la posición actual del jugador y de la cámara
    var playerPosition = this.CHAR_CUR_POSITION;
    var cameraPosition = camera.getPosition();
    var originalPlayerRotation = this.entity.getRotation().clone();

    // Calcula la dirección desde el jugador hacia la cámara
    var direction = cameraPosition.clone().sub(playerPosition).normalize();

    // Utiliza el método lookAt para orientar al jugador hacia la cámara

    this.entity.lookAt(playerPosition.x + direction.x, playerPosition.y, playerPosition.z + direction.z);
    this.entity.rotateLocal(0, 180, 0);

    // Ajusta la rotación para el rigidbody

    var rigidbodyRotation = this.entity.getRotation();

    // Teletransporta al jugador a la nueva posición y rotación
    if (teleport) {
        this.entity.rigidbody.teleport(playerPosition, rigidbodyRotation);
    }

    var originalYaw = this.getYaw(originalPlayerRotation);
    var newYaw = this.getYaw(rigidbodyRotation);

    var result = "";
    var diff = newYaw - originalYaw;
    if (Math.abs(diff) < 1) {
        //Trace("rotateToNewDirectionFromCamera", "Sin cambio o Rotación mínima");
    } else {
        if (diff >= -180 && diff <= 180) {
            if (diff > 0) {
                //Trace("Derecha");
                //result = "right";
                result = "left";
            } else if (diff < 0) {
                //result = "left";
                result = "right";
                //Trace("Izquierda");
            } else {
                result = "";
                //Trace("Sin cambio");
            }
        } else if (diff < -180) {
            //result = "right";
            result = "left";
            //Trace("Derecha");
        } else if (diff > 180) {
            //result = "left";
            result = "right";
            //Trace("Izquierda");
        }
    }


    return result;
}



// Función para calcular la rotación en grados dado un quaternion de rotación
Character.prototype.getYaw = function (rotation) {
    // Calcular el ángulo en radianes del eje Y (Yaw) de la rotación
    var angleRadians = Math.atan2(2 * (rotation.w * rotation.y + rotation.x * rotation.z), 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z));
    // Convertir el ángulo de radianes a grados
    var angleDegrees = angleRadians * (180 / Math.PI);
    return angleDegrees;
}

Character.prototype.stopMovement = function () {

    this.entity.rigidbody.linearVelocity = new pc.Vec3(0, this.entity.rigidbody.linearVelocity.y, 0);
    this.entity.targetPoint = null;

}




/*              */
/* D O  M O V E */
/*              */
Character.prototype.doMove = function (input, dt) {


    if (!this.doMoveCharacter_busy) {
        this.doMoveCharacter_busy = true;

        this.CHAR_CUR_POSITION = this.entity.getPosition();
        this.CHAR_CUR_ROTATION = this.entity.getRotation();



        this.doSensors(dt);


        if (this.tracerOptions.traceinput && this.entity.isPlayer) {
            const clonedObject = Object.assign({}, input);
            delete clonedObject.camera;
            clonedObject.camera = null;
            Trace("input", clonedObject);

        }




        var x = 0;
        var z = 0;
        var targetDirection = this.entity;
        if (this.entity.isPlayer) {
            x = input.x;
            z = input.z;
            targetDirection = input.camera;
        }




        if (this.playerOptions.playerControllerOnKeyRight === "Strafe") {
            if (x !== 0) z = 0;
            if (z !== 0) x = 0;
        }




        var moveSpeed = input.sprint ? this.speed * 2.5 : this.speed;


        var isMoving = x !== 0 || z !== 0;
        !isMoving && (moveSpeed = 0);

        this.charSpeed < moveSpeed - 0.1 ? this.charSpeed = pc.math.lerp(this.charSpeed, moveSpeed, dt * this.speed * 4) : this.charSpeed = moveSpeed;


        this.speedAnimBlend = input.sprint ? moveSpeed / this.speed * 5 : moveSpeed / this.speed - 0.3;
        this.speedAnimBlend < 0.01 && (this.speedAnimBlend = 0);


        if (this.entity.attackSystem.canAttack && !this.entity.attackSystem.walkAndAttack && this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            isMoving = false;
        }






        if (isMoving) {

            var newPosition = this.CHAR_CUR_POSITION.clone();

            // Obtener la dirección de movimiento relativa a la cámara
            const forwardDirection = targetDirection.forward.clone().scale(z).normalize();
            const strafeDirection = targetDirection.right.clone().scale(x).normalize();

            // Combinar las direcciones para obtener la dirección final del movimiento
            const direction = forwardDirection.add(strafeDirection).normalize();
            direction.y = 0;

            // Calcular la nueva posición del jugador
            newPosition = newPosition.add(direction.scale(this.charSpeed * dt));

            this.entity.rigidbody.teleport(newPosition);
            delete newPosition;

            if (input.playerPersonStyle !== "FirstPerson") {
                this.rotateCharacter(x, z, targetDirection, this.speed * 7 * dt);
            }
        }

        delete targetDirection;


        this.doInteraction(input, dt);


        if (this.entity.anim) {
            this.entity.anim.setFloat("speed", this.speedAnimBlend);
        }

        this.doCarryWeapons(input, dt);

        this.doAttackSystem(input, dt);


        this.doMoveCharacter_busy = false;
    }
}

/* * * * * * * * * * * * * * * * */
/* D O  C A R R Y  W E A P O N S */
/* * * * * * * * * * * * * * * * */
Character.prototype.doCarryWeapons = function (input, dt) {

    function setDefRigidBodyValues(r) {
        if (!r) return;
        r.entity.tags.add("uranus-instancing-exclude");
        r.entity.tags.add("ignore-camera-collision");
        r.restitution = 0;
        r.friction = 1;
    }

    if (this.carryWeapons.rightHand) {
        if (this.carryWeapons.leftHandWeaponEntity) {
            this.carryWeapons.leftHandWeaponEntity.setPosition(this.carryWeapons.leftHand.getPosition());
            this.carryWeapons.leftHandWeaponEntity.setRotation(this.carryWeapons.leftHand.getRotation());

            if ((this.carryWeapons.leftHandWeaponEntity._guid || "0") !== (this.carryWeapons.leftHandWeaponEntityOld || {})._guid) {
                this.entity.attackSystem.leftHandWeaponRigidBody = this.carryWeapons.leftHandWeaponEntity.findComponent("rigidbody");
                setDefRigidBodyValues(this.entity.attackSystem.leftHandWeaponRigidBody);
                var col = this.carryWeapons.leftHandWeaponEntity.findComponent("collision");
                if (col) {
                    col.on("collisionstart", this.onCollisionStartWeapon, this);
                    col.on("collisionend", this.onCollisionEndWeapon, this);
                }
            }

        } else {
            if (this.carryWeapons.leftHandWeaponEntityOld) {
                /*QUITAR COLISIONES*/
                this.entity.attackSystem.leftHandWeaponRigidBody = null;
                var col = this.carryWeapons.leftHandWeaponEntityOld.findComponent("collision");
                if (col) {
                    col.off("collisionstart", this.onCollisionStartWeapon);
                    col.off("collisionend", this.onCollisionEndWeapon);
                }
            }
        }

        this.carryWeapons.leftHandWeaponEntityOld = this.carryWeapons.leftHandWeaponEntity;
    }

    if (this.carryWeapons.rightHand) {
        if (this.carryWeapons.rightHandWeaponEntity) {
            this.carryWeapons.rightHandWeaponEntity.setPosition(this.carryWeapons.rightHand.getPosition());
            this.carryWeapons.rightHandWeaponEntity.setRotation(this.carryWeapons.rightHand.getRotation());

            if ((this.carryWeapons.rightHandWeaponEntity._guid || "0") !== (this.carryWeapons.rightHandWeaponEntityOld || {})._guid) {
                this.entity.attackSystem.rightHandWeaponRigidBody = this.carryWeapons.rightHandWeaponEntity.findComponent("rigidbody");
                setDefRigidBodyValues(this.entity.attackSystem.rightHandWeaponRigidBody);
                var col = this.carryWeapons.rightHandWeaponEntity.findComponent("collision");
                if (col) {
                    col.on("triggerenter", this.onCollisionStartRightWeapon, this);
                    col.on("triggerleave", this.onCollisionEndRightWeapon, this);
                }
            }
        } else {
            if (this.carryWeapons.rightHandWeaponEntityOld) {
                /*QUITAR COLISIONES*/
                this.entity.attackSystem.rightHandWeaponRigidBody = null;
                var col = this.carryWeapons.rightHandWeaponEntityOld.findComponent("collision");
                if (col) {
                    col.off("triggerenter", this.onCollisionStartRightWeapon);
                    col.off("triggerleave", this.onCollisionEndRightWeapon);
                }
            }
        }
        this.carryWeapons.rightHandWeaponEntityOld = this.carryWeapons.rightHandWeaponEntity;
    }
}

Character.prototype.onCollisionStartRightWeapon = function (other) {
    if (this.entity.attackSystem.status === CharacterAttackSystemStatusEnum.DAMAGING) {
    }
}

Character.prototype.onCollisionEndRightWeapon = function (other) {

}

/* * * * * * * * * * * * * * * * */
/* D O  A T T A C K  S Y S T E M */
/* * * * * * * * * * * * * * * * */
Character.prototype.doAttackSystem = function (input, dt) {
    if (!this.entity.attackSystem.canAttack) return;

    this.entity.attackSystem.attackInput = input.attack || input.mousePrimaryButton;
    if (this.entity.attackSystem.attackInput === this.entity.attackSystem.attackInputOld) {
        /*if is playing attack animation*/
        if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            this.entity.attackSystem.__elapsedTime += dt;
        }
    } else {
        /*the player attack*/
        if (this.entity.attackSystem.attackInput) {
            if (this.entity.attackSystem.canDoAttack) {
                this.entity.attackSystem.__elapsedTime = 0;
                this.entity.attackSystem.canDoAttack = false;
                this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.ATTACKING;

                Timer.addTimer(0.1, function () {
                    this.entity.attackSystem.canDoAttack = true;
                }, this, true);

            }
        } else {
            this.entity.attackSystem.canDoAttack = true;
            this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.NONE;
            this.entity.attackSystem.__elapsedTime = 0;
        }


    }
    if (this.entity.attackSystem.__elapsedTime >= 2) {
        this.entity.attackSystem.__elapsedTime = 0;
        this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.NONE;
    }




    this.entity.attackSystem.attackAction = 0;
    if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
        this.entity.attackSystem.attackAction = 1;
    }
    if (this.entity.attackSystem.status === CharacterAttackSystemStatusEnum.NONE) {
        this.entity.attackSystem.attackAction = 0;
    }

    /* shows animation */
    //if (this.entity.attackSystem.attackActionOld !== attackAction) {
    this.entity.anim.setInteger("attack", this.entity.attackSystem.attackAction);
    //}



    this.entity.attackSystem.attackInputOld = this.entity.attackSystem.attackInput;
    this.entity.attackSystem.attackActionOld = this.entity.attackSystem.attackAction;


    if (this.tracerOptions.traceattack && this.entity.isPlayer) {
        const clonedObject = Object.assign({}, this.entity.attackSystem);
        clonedObject.rightHandWeaponRigidBody = null;
        clonedObject.leftHandWeaponRigidBody = null;
        delete clonedObject.rightHandWeaponRigidBody;
        delete clonedObject.leftHandWeaponRigidBody;
        Trace("attackSystem", clonedObject);
    }


};





Character.prototype.rotateCharacter = function (x, z, targetDirection, rotSpeed) {
    var addAngle = 0;
    if (this.playerOptions.playerControllerOnKeyRight === "Rotate") {
        if (x !== 0 || z !== 0) {
            const moveAngle = Math.atan2(z, x) * pc.math.RAD_TO_DEG;
            addAngle = (Math.round(moveAngle / 45) * 45) + 90;
        }
    }

    const direction = new pc.Vec3(-targetDirection.forward.x, 0, -targetDirection.forward.z).normalize();
    const angle = (Math.atan2(direction.x, direction.z) * pc.math.RAD_TO_DEG) + addAngle;
    this.currenRotation = pc.math.lerpAngle(this.currenRotation ?? 0, angle, rotSpeed ? rotSpeed : 0.2);
    this.entity.rigidbody.enabled = false;
    this.entity.setEulerAngles(0, this.currenRotation, 0);
    this.entity.rigidbody.enabled = true;
}

const CharacterLocomotionEnum = Object.freeze({
    IDLE: 0,
    FORWARD: 1,
    BACKWARD: 2,
    RIGHT: 3,
    LEFT: 4,
    FORWARDRIGHT: 5,
    FORWARDLEFT: 6,
    BACKWARDRIGHT: 7,
    BACKWARDLEFT: 8
});



Character.prototype.doCalculateLocomotionDirection = function (dt) {
    var direction = CharacterLocomotionEnum.IDLE;
    // Calcular el vector de movimiento
    var movimiento = new pc.Vec3();
    movimiento.sub2(this.CHAR_CUR_POSITION.clone(), this.CHAR_LAST_POSITION.clone());


    // Determinar si la magnitud del movimiento es pequeña (está quieto)
    var umbralMovimiento = 0.001; // Puedes ajustar este umbral según sea necesario
    if (movimiento.length() < umbralMovimiento) {
        direction = CharacterLocomotionEnum.IDLE;
    } else {
        movimiento.normalize(); // Normalizar solo si la magnitud es mayor al umbral

        // Obtener el vector forward de la entidad
        var ejeAdelante = this.entity.forward.clone().normalize();

        // Calcular la velocidad dividiendo la distancia entre fotogramas por el tiempo transcurrido
        var velocidad = movimiento.length() / dt;
        var velocidadRelativa = movimiento.dot(ejeAdelante) / dt;
        var distanciaRecorrida = movimiento.length();



        // Calcular el ángulo entre el vector de movimiento y el vector forward
        var anguloRad = Math.atan2(movimiento.z, movimiento.x) - Math.atan2(ejeAdelante.z, ejeAdelante.x);
        var anguloDeg = anguloRad * (180 / Math.PI);

        // Normalizar el ángulo dentro del rango de -180 a 180 grados
        if (anguloDeg > 180) {
            anguloDeg -= 360;
        } else if (anguloDeg < -180) {
            anguloDeg += 360;
        }

        // Determinar la dirección de movimiento dentro del rango de ±22.5 grados
        if (Math.abs(anguloDeg) <= 22.5 || Math.abs(anguloDeg) >= 337.5) {
            direction = CharacterLocomotionEnum.FORWARD;
        } else if (Math.abs(anguloDeg - 180) <= 22.5 || Math.abs(anguloDeg + 180) <= 22.5) {
            direction = CharacterLocomotionEnum.BACKWARD;
        } else if (Math.abs(anguloDeg - 90) <= 22.5 || Math.abs(anguloDeg + 270) <= 22.5) {
            direction = CharacterLocomotionEnum.RIGHT;
        } else if (Math.abs(anguloDeg + 90) <= 22.5 || Math.abs(anguloDeg - 270) <= 22.5) {
            direction = CharacterLocomotionEnum.LEFT;
        } else if (Math.abs(anguloDeg - 45) <= 22.5 || Math.abs(anguloDeg + 315) <= 22.5) {
            direction = CharacterLocomotionEnum.FORWARDRIGHT;
        } else if (Math.abs(anguloDeg + 45) <= 22.5 || Math.abs(anguloDeg - 315) <= 22.5) {
            direction = CharacterLocomotionEnum.FORWARDLEFT;
        } else if (Math.abs(anguloDeg + 135) <= 22.5 || Math.abs(anguloDeg - 225) <= 22.5) {
            direction = CharacterLocomotionEnum.BACKWARDRIGHT;
        } else if (Math.abs(anguloDeg - 135) <= 22.5 || Math.abs(anguloDeg + 225) <= 22.5) {
            direction = CharacterLocomotionEnum.BACKWARDLEFT;
        } else {
            direction = CharacterLocomotionEnum.IDLE;
        }
    }

    return direction;
}

/* e n t i t y   a n i m a t o r */
/**
 * its creates an animation.
 * @param {number} forwardVector - Direction vector.
 * @param {number} animatorDuration - Time to destroy the animator.
 * @param {string} animForce - Animacion you want to force while pays the movement.
 * @returns {void} void function.
 */
Character.prototype.createAnimator = function (forwardVector, animatorDuration, animForce, speed, rigidBodyType) {
    this.animatorAnimForce = animForce ?? null;
    this.animatorElapsedTime = 0;
    this.animatorTargetForwardVector = forwardVector;
    this.animatorDuration = animatorDuration;
    this.animatorTargetReached = false;
    this.animatorSpeed = speed ?? this.speed * 2;
    this.animatorRestoreToRigidBodyType = this.entity.rigidbody.type;
    this.entity.rigidbody.type = rigidBodyType ?? this.animatorRestoreToRigidBodyType;
}
Character.prototype.destroyAnimator = function () {
    this.animatorTargetReached = true;
    this.animatorElapsedTime = 0;
    this.animatorSpeed = 0;
    this.entity.rigidbody.type = this.animatorRestoreToRigidBodyType;
    this.animatorAnimForce = null;
    this.animatorAnimMotionRootMode = null;
}




/* ****************************************************** */
/*   C A L C U L A T E S    T H E    A N I M A T I O N    */
/* ****************************************************** */
Character.prototype.doCalculateAnimation = function (animVelocityMode, dt) {

}



/*-----------------------------------------------------------------------------------------*/

/*******************************/
/*                             */
/*   S E N S O R               */
/*                             */
/*******************************/

Character.prototype.doSensors = function (dt) {

    if (this.entity.isonair && this.entity.targetPoint) {
        this.stopMovement();
    }





    //var onairThreshold = 2.5;
    //this.entity.isonair = !(currentVelocity.y >= -onairThreshold && currentVelocity.y <= onairThreshold);








    // Calcular la nueva posición a un metro en la dirección del jugador
    const forwardVector = new pc.Vec3(0, 0, -1); // Asumiendo que la dirección "forward" está en el eje Z
    const rotatedForward = this.CHAR_CUR_ROTATION.transformVector(forwardVector);
    const newSensorPosition = this.CHAR_CUR_POSITION.clone().add(rotatedForward.scale(1)); // 1 metro de distancia




    const raycastJumplength = this.characterHeight / 2 + this.characterHeight; // 2 mts.

    const originAir = this.CHAR_CUR_POSITION.clone(); // Posición actual de la entidad
    const destinationAir = originAir.clone().add(new pc.Vec3(0, -raycastJumplength, 0)); // Un metro hacia abajo desde la posición actual
    const raycastAir1 = this.app.systems.rigidbody.raycastFirst(originAir, destinationAir, { lowResolution: true });
    var distanceToImpact1 = 0;
    var distanceToImpact2 = 0;
    var distanceToImpact3 = 0;
    const groundTolerance = this.characterRadius;
    if (raycastAir1) {
        const hitFraction = raycastAir1.hitFraction;
        const rayLength = originAir.distance(destinationAir);
        distanceToImpact1 = (rayLength * hitFraction) - this.characterHeight / 2;
    } else {
        distanceToImpact1 = null;
    }
    if (this.sensorOptions.sensorJumpDebug) {
        this.app.drawLine(originAir, destinationAir, (distanceToImpact1 ?? 1) > 0 ? pc.Color.RED : pc.Color.GREEN, 5);
    }
    this.entity.sensorGroundDistanceCenter = distanceToImpact1;



    if (this.sensorOptions.groundProcessstep === 1) {
        const forwardVectorAir = this.entity.forward.clone();
        forwardVectorAir.y = 0; // Establecer la componente Y a 0 para evitar movimientos verticales
        forwardVectorAir.normalize().scale((this.characterRadius / 4) * 3); // 50 cm hacia adelante
        originAir.add(forwardVectorAir);
        destinationAir.add(forwardVectorAir);
        const raycastAir2 = this.app.systems.rigidbody.raycastFirst(originAir, destinationAir, { lowResolution: true });
        if (raycastAir2) {
            const hitFraction = raycastAir2.hitFraction;
            const rayLength = originAir.distance(destinationAir);
            distanceToImpact2 = (rayLength * hitFraction) - this.characterHeight / 2;
        } else {
            distanceToImpact2 = null;
        }
        if (this.sensorOptions.sensorJumpDebug) {
            this.app.drawLine(originAir, destinationAir, (distanceToImpact2 ?? 1) > groundTolerance ? pc.Color.RED : pc.Color.GREEN, 5);
        }
        this.entity.sensorGroundDistanceForward = distanceToImpact2;
    }

    if (this.sensorOptions.groundProcessstep === 2) {
        const forwardVectorAir = this.entity.forward.clone().scale(-1);
        forwardVectorAir.y = 0; // Establecer la componente Y a 0 para evitar movimientos verticales
        forwardVectorAir.normalize().scale((this.characterRadius / 4) * 3); // 50 cm hacia adelante
        originAir.add(forwardVectorAir);
        destinationAir.add(forwardVectorAir);
        const raycastAir3 = this.app.systems.rigidbody.raycastFirst(originAir, destinationAir, { lowResolution: true });
        if (raycastAir3) {
            const hitFraction = raycastAir3.hitFraction;
            const rayLength = originAir.distance(destinationAir);
            distanceToImpact3 = (rayLength * hitFraction) - this.characterHeight / 2;
        } else {
            distanceToImpact3 = null;
        }
        if (this.sensorOptions.sensorJumpDebug) {
            this.app.drawLine(originAir, destinationAir, (distanceToImpact3 ?? 1) > groundTolerance ? pc.Color.RED : pc.Color.GREEN, 5);
        }
        this.entity.sensorGroundDistanceBackward = distanceToImpact3;
    }

    this.sensorOptions.groundProcessstep++;
    if (this.sensorOptions.groundProcessstep > 2) {
        this.sensorOptions.groundProcessstep = 0;
    }



    this.entity.isonair = (this.entity.sensorGroundDistanceCenter ?? 1) > 0 &&
        (this.entity.sensorGroundDistanceForward ?? 1) > groundTolerance &&
        (this.entity.sensorGroundDistanceBackward ?? 1) > groundTolerance;


    //TEETER:
    if (this.entity.isonair) {
        this.entity.isteeter = false;
    } else {
        const isteeter = (this.entity.sensorGroundDistanceForward ?? 1) > groundTolerance &&
            this.entity.sensorGroundDistanceCenter <= groundTolerance &&
            (this.entity.sensorGroundDistanceBackward ?? 1) <= groundTolerance;
        if (isteeter) {
            Timer.addTimer(0.1, function () {
                this.entity.isteeter = (this.entity.sensorGroundDistanceForward ?? 1) > groundTolerance &&
                    this.entity.sensorGroundDistanceCenter <= groundTolerance &&
                    (this.entity.sensorGroundDistanceBackward ?? 1) <= groundTolerance;
            }, this, true);
        }
    }

    //LANDING
    if (this.entity.isonair) {
        if (this.entity.sensorGroundDistanceCenter <= this.characterHeight / 4) {
            this.entity.islanding = true;
            this.entity.islanding_timerid = Timer.addTimer(1, function () {
                this.entity.islanding = false;
            }, this, true);
        }
    }




    //&& distanceToImpact2 > this.sensorOptions.groundtolerance && distanceToImpact3 > this.sensorOptions.groundtolerance;



    if (this.sensorOptions.sensorJumpDebug) {
        Trace("GDistanceForward", (0 + this.entity.sensorGroundDistanceForward).toFixed(2));
        Trace("GDistanceCenter", (0 + this.entity.sensorGroundDistanceCenter).toFixed(2));
        Trace("GDistanceBackward", (0 + this.entity.sensorGroundDistanceBackward).toFixed(2));
        Trace("entity.isonair", this.entity.isonair);
    }









    if (this.sensorOptions.processstep === 0) {
        if (this.sensorOptions.detectableEntities_length === 0) {
            this.sensorOptions.detectableEntities = this.app.scene.root.findByTag("is-detectable");
            this.sensorOptions.detectableEntities_length = this.sensorOptions.detectableEntities.length;
        }
        this.sensorOptions.raiseDetectedEvent = false;
        var d = 0,
            detectableEntity = null;
        const oldLength = this.detectedEntities.length;
        for (; d < this.sensorOptions.detectableEntities_length; d++) {
            detectableEntity = this.sensorOptions.detectableEntities[d];

            if (detectableEntity && detectableEntity._guid !== this.entity._guid) {
                const distance = this.CHAR_CUR_POSITION.distance(detectableEntity.getPosition());
                if (distance <= 5 + this.characterRadius) {
                    /*DETECTED*/
                    if (!this.detectedEntities.find(entity => entity._guid === detectableEntity._guid)) {
                        this.detectedEntities.push(detectableEntity);
                    }
                } else {
                    /*////////REMOVE*/
                    this.detectedEntities = this.detectedEntities.filter(entity => entity._guid !== detectableEntity._guid);
                }
            }
        }

        this.sensorOptions.raiseDetectedEvent = (oldLength !== this.detectedEntities.length);
    }


    if (this.sensorOptions.processstep === 1) {

        var d = 0,
            detectedEntity = null;


        const detectedEntities_length = this.detectedEntities.length;
        for (; d < detectedEntities_length; d++) {
            detectedEntity = this.detectedEntities[d];

            if (detectedEntity.tags.has("is-interactable")) {
                const distance = this.CHAR_CUR_POSITION.distance(detectedEntity.getPosition()),
                    origin = this.CHAR_CUR_POSITION,
                    destination = detectedEntity.getPosition(),
                    raycast = this.app.systems.rigidbody.raycastFirst(origin, destination, { lowResolution: true });
                if (raycast) {
                    const hitFraction = raycast.hitFraction;
                    distanceToImpact = (distance * hitFraction) - this.characterRadius;

                    const oldValue = detectedEntity.canInteract;
                    detectedEntity.canInteract = (distanceToImpact <= this.characterRadius);

                    if (!this.sensorOptions.raiseDetectedEvent && detectedEntity.canInteract !== oldValue) {
                        this.sensorOptions.raiseDetectedEvent = true;
                    }
                }
                if (this.sensorOptions.sensorJumpDebug) {
                    this.app.drawLine(origin, destination, (detectedEntity.canInteract ? pc.Color.GREEN : pc.Color.RED), 5);
                }
            }
        }
    }



    if (this.sensorOptions.processstep === 2) {
        if (this.sensorOptions.raiseDetectedEvent) {
            this.entity.fire("character:detector", this.detectedEntities);
        } else {
            this.sensorOptions.processstep++;
        }
    }




    if (this.sensorOptions.processstep === 3) {
        this.CHAR_CUR_ROTATION.transformVector(forwardVector, forwardVector);
        var origin = this.CHAR_CUR_POSITION.clone().add(new pc.Vec3(0, -0.5, 0)); // Medio metro hacia arriba
        var destination = origin.clone().add(forwardVector.scale(1)); // Un metro hacia adelante desde el origen

        // BOTON RAYCAST:
        const raycast = this.app.systems.rigidbody.raycastFirst(origin, destination, { lowResolution: true });
        if (raycast) {
            const hitFraction = raycast.hitFraction;
            const rayLength = origin.distance(destination);
            distanceToImpact = (rayLength * hitFraction) - 0.35;
        } else {
            distanceToImpact = null;
        }
        if (this.sensorOptions.sensorJumpDebug) {
            this.app.drawLine(origin, destination, (raycast ? pc.Color.GREEN : pc.Color.RED), 5);
        }

    }


    if (this.sensorOptions.processstep === 4) {
        const raycast = this.app.systems.rigidbody.raycastFirst(this.CHAR_CUR_POSITION, newSensorPosition, { lowResolution: true });
        if (raycast) {
            const hitFraction = raycast.hitFraction;
            const rayLength = this.CHAR_CUR_POSITION.distance(newSensorPosition);
            distanceToImpact = (rayLength * hitFraction) - 0.35;
        } else {
            distanceToImpact = null;
        }
        if (this.sensorOptions.sensorJumpDebug) {
            this.app.drawLine(this.CHAR_CUR_POSITION, newSensorPosition, (raycast ? pc.Color.GREEN : pc.Color.RED), 5);
        }
    }

    if (this.sensorOptions.processstep === 5) {
        this.CHAR_CUR_ROTATION.transformVector(forwardVector, forwardVector);
        var origin = this.CHAR_CUR_POSITION.clone().add(new pc.Vec3(0, 0.5, 0)); // Medio metro hacia arriba
        var destination = origin.clone().add(forwardVector.scale(1)); // Un metro hacia adelante desde el origen

        const raycast = this.app.systems.rigidbody.raycastFirst(origin, destination, { lowResolution: true });
        if (raycast) {
            const hitFraction = raycast.hitFraction;
            const rayLength = origin.distance(destination);
            distanceToImpact = (rayLength * hitFraction) - 0.35;
        } else {
            distanceToImpact = null;
        }
        if (this.sensorOptions.sensorJumpDebug) {
            this.app.drawLine(origin, destination, (raycast ? pc.Color.GREEN : pc.Color.RED), 5);
        }

    }


    if (this.sensorOptions.processstep === 6) {
        this.CHAR_CUR_ROTATION.transformVector(forwardVector, forwardVector);
        const origin = this.CHAR_CUR_POSITION.clone().add(new pc.Vec3(0, 1, 0)); // Medio metro hacia arriba
        const destination = origin.clone().add(forwardVector.scale(1)); // Un metro hacia adelante desde el origen

        if (this.sensorOptions.sensorJumpDebug) {
            this.app.drawLine(origin, destination, pc.Color.RED, 5);
        }
    }




    this.sensorOptions.processstep++;
    if (this.sensorOptions.processstep > 6) {
        this.sensorOptions.processstep = 0;
    }




}



Character.prototype.sensorCollisionStartEvent = function (result) {

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

    this.sensorTrace();

}
Character.prototype.sensorCollisionEndEvent = function (entity) {

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

    this.sensorTrace();

}

Character.prototype.sensorTrace = function () {
    if (!this.sensorOptions.sensorDebug) return;
    Trace("sensorRight ", (this.entity.sensorRightEntity ?? {}).name ?? "");
    Trace("sensorLeft  ", (this.entity.sensorLeftEntity ?? {}).name ?? "");
    Trace("sensorTop   ", (this.entity.sensorTopEntity ?? {}).name ?? "");
    Trace("sensorBottom", (this.entity.sensorBottomEntity ?? {}).name ?? "");
    Trace("sensorFront ", (this.entity.sensorFrontEntity ?? {}).name ?? "");
    Trace("sensorBack  ", (this.entity.sensorBackEntity ?? {}).name ?? "");
}


/*-----------------------------------------------------------------------------------------*/

/*******************************/
/*                             */
/*   I N T E R A C T I O N     */
/*                             */
/*******************************/
Character.prototype.doInteraction = function (input, dt) {

    if (input.interact) {
        var i = 0, detectedEntity = null;
        const detectedEntities_length = this.detectedEntities.length;
        for (; i < detectedEntities_length; i++) {
            detectedEntity = this.detectedEntities[i];

            //detectedEntity

        }
    }


}






/*-----------------------------------------------------------------------------------------*/
/*-----------------------------------------------------------------------------------------*/
/*******************************/
/*                             */
/*   U P D A T E               */
/*                             */
/*******************************/
/*-----------------------------------------------------------------------------------------*/
Character.prototype.update = function (dt) {
    this.CHAR_LAST_POSITION = this.CHAR_CUR_POSITION.clone();
}

Character.prototype.postUpdate = function (dt) {
    this.rootMotionFix();
    this.CHAR_LAST_POSITION = this.CHAR_CUR_POSITION.clone();
}

Character.prototype.rootMotionFix = function () {
    /*root motion FIX*/
    if (this.motionrootmode === "in_place_z_axis") {
        if (this.playerAnimationsOptions.hips) {
            var vecpos = this.playerAnimationsOptions.hips.getLocalPosition();

            vecpos = new pc.Vec3(vecpos.x, vecpos.y, this.playerAnimationsOptions.startPosition.z ?? 0);

            this.playerAnimationsOptions.hips.setLocalPosition(vecpos);
        }
    }
    if (this.motionrootmode === "in_place_all_axis") {
        this.playerAnimationsOptions.hips?.setLocalPosition(this.playerAnimationsOptions.startPosition);
    }

    if (this.animatorAnimMotionRootMode) {
        this.motionrootmode = this.animatorAnimMotionRootMode;
    } else {
        if (this.motionrootmode !== this.playerAnimationsOptions.motionrootmode) {
            this.playerAnimationsOptions.hips?.setLocalPosition(this.playerAnimationsOptions.startPosition);
            this.motionrootmode = this.playerAnimationsOptions.motionrootmode;
        }
    }
}


Character.prototype.prepareAnimComponent = function () {

    const animPlayerStateGraphDataX = {
        layers: [
            {
                name: 'unarmed',
                states: [
                    {
                        name: 'START'
                    },
                    {
                        name: 'ANY'
                    },
                    {
                        name: 'idle'
                    },
                    {
                        name: 'walking'
                    },
                    {
                        name: 'running'
                    },
                    {
                        name: 'sprinting'
                    },
                    {
                        name: 'attack',
                        loop: false
                    },
                    {
                        name: 'attack2',
                        loop: false
                    },
                    {
                        name: 'jump',
                        loop: false
                    },
                    {
                        name: 'climb',
                        loop: false
                    },
                    {
                        name: 'teeter'
                    },
                    {
                        name: 'landing',
                        loop: false
                    },
                    {
                        name: "leftturn90",
                        loop: false
                    },
                    {
                        name: "rightturn90",
                        loop: false
                    }
                ],
                transitions: [
                    {
                        from: 'START',
                        to: 'idle',
                        time: 0.2,
                        priority: 0
                    }, {
                        from: 'idle',
                        to: 'walking',
                        time: 0.2,
                        priority: 0,
                        conditions: [{
                            parameterName: 'speed',
                            predicate: pc.ANIM_GREATER_THAN,
                            value: 0
                        }]
                    }, {
                        from: 'walking',
                        to: 'idle',
                        time: 0.2,
                        priority: 0,
                        conditions: [{
                            parameterName: 'speed',
                            predicate: pc.ANIM_LESS_THAN,
                            value: 0.01
                        }]
                    },
                    {
                        from: 'walking',
                        to: 'running',
                        time: 0.2,
                        priority: 0,
                        conditions: [{
                            parameterName: 'speed',
                            predicate: pc.ANIM_GREATER_THAN,
                            value: 0.99
                        }]
                    },
                    {
                        from: 'running',
                        to: 'walking',
                        time: 0.1,
                        priority: 0,
                        conditions: [{
                            parameterName: 'speed',
                            predicate: pc.ANIM_LESS_THAN,
                            value: 1
                        }]
                    },
                    {
                        from: 'idle',
                        to: 'running',
                        time: 0.2,
                        priority: 0,
                        conditions: [{
                            parameterName: 'speed',
                            predicate: pc.ANIM_GREATER_THAN_EQUAL_TO,
                            value: 1
                        }
                        ]
                    },

                    {
                        from: 'ANY',
                        to: 'attack',
                        time: 0.1,
                        priority: 0,
                        conditions: [{
                            parameterName: 'attack',
                            predicate: pc.ANIM_EQUAL_TO,
                            value: 1
                        }]
                    },

                    {
                        from: 'attack',
                        to: 'idle',
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            {
                                parameterName: 'attack',
                                predicate: pc.ANIM_EQUAL_TO,
                                value: 0
                            },
                            {
                                parameterName: 'speed',
                                predicate: pc.ANIM_LESS_THAN,
                                value: 0.01
                            }]
                    },

                    {
                        from: 'attack',
                        to: 'walking',
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            {
                                parameterName: 'attack',
                                predicate: pc.ANIM_EQUAL_TO,
                                value: 0
                            },
                            {
                                parameterName: 'speed',
                                predicate: pc.ANIM_GREATER_THAN,
                                value: 0.01
                            }
                        ]
                    },


                    {
                        from: 'attack',
                        to: 'running',
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            {
                                parameterName: 'attack',
                                predicate: pc.ANIM_EQUAL_TO,
                                value: 0
                            },
                            {
                                parameterName: 'speed',
                                predicate: pc.ANIM_GREATER_THAN,
                                value: 0.99
                            }
                        ]
                    }




                ]
            }
        ],
        parameters: {
            speed: {
                name: 'speed',
                type: pc.ANIM_PARAMETER_FLOAT,
                value: 0
            },
            attack: {
                name: 'attack',
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            Jump: {
                name: 'Jump',
                type: pc.ANIM_PARAMETER_BOOLEAN,
                value: false
            },
            Grounded: {
                name: 'Grounded',
                type: pc.ANIM_PARAMETER_BOOLEAN,
                value: false
            },
            Fly: {
                name: 'Fly',
                type: pc.ANIM_PARAMETER_BOOLEAN,
                value: false
            },
            FreeFall: {
                name: 'FreeFall',
                type: pc.ANIM_PARAMETER_BOOLEAN,
                value: false
            },
            Swim: {
                name: 'Swim',
                type: pc.ANIM_PARAMETER_BOOLEAN,
                value: false
            }



        }
    };


    this.animPlayerStateGraphData = {
        layers: [
            {
                name: 'baseLayer',
                states: [{ name: 'START' }, { name: 'ANY' }],
                transitions: []
            }
        ],
        parameters: {
            mode: {
                name: 'mode',
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            speed: {
                name: 'speed',
                type: pc.ANIM_PARAMETER_FLOAT,
                value: 0
            },
            attack: {
                name: 'attack',
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            }
        }
    };

    /*IDLE*/
    for (let i = 0; i < this.animations_unarmed.idle.length; i++) {
        this.animations_unarmed.idle[i].preload = true;
        this.animPlayerStateGraphData.layers[0].states.push({ name: 'unarmed-idle' + i, assetId: this.animations_unarmed.idle[i].id });
        this.animPlayerStateGraphData.layers[0].transitions.push({
            from: 'START',
            to: 'unarmed-idle' + i,
            time: 0.2,
            priority: 0,
            conditions: [
                { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 }
            ]
        });
    }

    /*ATTACK*/
    for (let i = 0; i < this.animations_unarmed.attack.length; i++) {
        this.animations_unarmed.attack[i].preload = true;
        this.animPlayerStateGraphData.layers[0].states.push({ name: 'unarmed-attack' + (i + 1), loop: false, assetId: this.animations_unarmed.attack[i].id });
        this.animPlayerStateGraphData.layers[0].transitions.push({
            from: 'ANY',
            to: 'unarmed-attack' + (i + 1),
            time: 0.2,
            priority: 0,
            conditions: [
                { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                { parameterName: 'attack', predicate: pc.ANIM_EQUAL_TO, value: i + 1 }
            ]
        });

        for (let j = 0; j < this.animations_unarmed.idle.length; j++) {
            this.animPlayerStateGraphData.layers[0].transitions.push({
                from: 'unarmed-attack' + (i + 1),
                to: 'unarmed-idle' + j,
                time: 0.2,
                priority: 0,
                conditions: [
                    { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                    { parameterName: 'attack', predicate: pc.ANIM_EQUAL_TO, value: 0 }
                ]
            });
        }
    }


    /*WALKING*/
    if (this.animations_unarmed.walking) {
        this.animations_unarmed.walking.preload = true;
        this.animPlayerStateGraphData.layers[0].states.push({ name: 'unarmed-walking', assetId: this.animations_unarmed.walking.id });

        for (let i = 0; i < this.animations_unarmed.idle.length; i++) {
            this.animPlayerStateGraphData.layers[0].transitions.push(
                {
                    from: 'unarmed-idle' + i,
                    to: 'unarmed-walking',
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                        { parameterName: 'speed', predicate: pc.ANIM_GREATER_THAN, value: 0 },
                    ]
                },
                {
                    from: 'unarmed-walking',
                    to: 'unarmed-idle' + i,
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                        { parameterName: 'speed', predicate: pc.ANIM_LESS_THAN, value: 0.01 }
                    ]
                }

            );
        }

        for (let i = 0; i < this.animations_unarmed.attack.length; i++) {
            this.animPlayerStateGraphData.layers[0].transitions.push({
                from: 'unarmed-attack' + (i + 1),
                to: 'unarmed-walking',
                time: 0.2,
                priority: 0,
                conditions: [
                    { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                    { parameterName: 'attack', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                    { parameterName: 'speed', predicate: pc.ANIM_GREATER_THAN, value: 0 },
                ]
            });
        }

    }

    /*RUNNING*/
    if (this.animations_unarmed.running) {
        this.animations_unarmed.running.preload = true;
        this.animPlayerStateGraphData.layers[0].states.push({ name: 'unarmed-running', assetId: this.animations_unarmed.running.id });
        if (this.animations_unarmed.walking) {

            this.animPlayerStateGraphData.layers[0].transitions.push(
                {
                    from: 'unarmed-walking',
                    to: 'unarmed-running',
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                        { parameterName: 'speed', predicate: pc.ANIM_GREATER_THAN, value: 0.99 }
                    ]
                },
                {
                    from: 'unarmed-running',
                    to: 'unarmed-walking',
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                        { parameterName: 'speed', predicate: pc.ANIM_LESS_THAN, value: 1 }
                    ]
                }
            );


        }

        for (let i = 0; i < this.animations_unarmed.idle.length; i++) {
            this.animPlayerStateGraphData.layers[0].transitions.push(
                {
                    from: 'unarmed-idle' + i,
                    to: 'unarmed-running',
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                        { parameterName: 'speed', predicate: pc.ANIM_GREATER_THAN_EQUAL_TO, value: 1 },
                    ]
                },
                {
                    from: 'unarmed-running',
                    to: 'unarmed-idle' + i,
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                        { parameterName: 'speed', predicate: pc.ANIM_LESS_THAN, value: 0.01 }
                    ]
                }

            );
        }


        for (let i = 0; i < this.animations_unarmed.attack.length; i++) {
            this.animPlayerStateGraphData.layers[0].transitions.push({
                from: 'unarmed-attack' + (i + 1),
                to: 'unarmed-running',
                time: 0.2,
                priority: 0,
                conditions: [
                    { parameterName: 'mode', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                    { parameterName: 'attack', predicate: pc.ANIM_EQUAL_TO, value: 0 },
                    { parameterName: 'speed', predicate: pc.ANIM_GREATER_THAN_EQUAL_TO, value: 1 },
                ]
            });
        }

    }







    // add an anim component to the entity
    this.entity.addComponent('anim', {
        activate: true,
        rootBone: this.playerAnimationsOptions.hips && this.playerAnimationsOptions.hips
    });

    this.entity.anim.loadStateGraph(this.animPlayerStateGraphData);


    const locomotionLayer = this.entity.anim.baseLayer,
        states = this.animPlayerStateGraphData.layers[0].states,
        states_length = states.length;
    var i = 0;
    for (; i < states_length; i++) {
        const state = states[i];
        if (state.name !== "START" && state.name !== "END" && state.name !== "ANY") {


            var asset = this.app.assets.get(states[i].assetId);

            if (asset && asset.type === 'animation') {
                if (asset.resource) {
                    locomotionLayer.assignAnimation(state.name, asset.resource);
                    /*state.animDuration = asset.resource.duration;*/
                    if (state.name.indexOf("attack") !== -1) {
                        asset.resource.events = new pc.AnimEvents([
                            {
                                time: asset.resource.duration,
                                name: 'attack-end-animation'
                            },
                            {
                                time: asset.resource.duration * 1000 / 4 / 1000,
                                name: 'attack-start-damage-animation'
                            },
                            {

                                time: (3 * asset.resource.duration * 1000 / 4) / 1000,
                                name: 'attack-end-damage-animation'
                            }
                        ]);
                    }
                } else {
                    // El asset aún no está cargado, cargarlo
                    asset.ready(function (e) {
                        locomotionLayer.assignAnimation(state.name, e.resource);

                        /*state.animDuration = e.resource.duration;*/
                        if (state.name.indexOf("attack") !== -1) {
                            e.resource.events = new pc.AnimEvents([
                                {
                                    time: e.resource.duration,
                                    name: 'attack-end-animation'
                                },
                                {
                                    time: e.resource.duration * 1000 / 4 / 1000,
                                    name: 'attack-start-damage-animation'
                                },
                                {
                                    time: (3 * asset.resource.duration * 1000 / 4) / 1000,
                                    name: 'attack-end-damage-animation'
                                }
                            ]);

                            //this.entity.attackSystem.
                        }

                    }.bind(this));
                    this.app.assets.load(asset);
                }
            }
        }
    }






    this.entity.anim.on('attack-end-animation', function (e) {
        this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.NONE;
    }, this);

    this.entity.anim.on('attack-start-damage-animation', function (e) {
        if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.DAMAGING;
        }
        /*console.log("attack-start-damage-animation");*/

    }, this);

    this.entity.anim.on('attack-end-damage-animation', function (e) {
        if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.ENDING;
        }
        /*console.log("attack-end-damage-animation");*/

    }, this);


};