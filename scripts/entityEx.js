///
/// Put this script in the entity where you want extra behaviors
///


var EntityEx = pc.createScript('entityEx');



EntityEx.attributes.add('canBeDetected', {
    title: 'can be detected ?',
    description: 'indicates whether the entity can be discovered by a character.',
    type: 'boolean',
    default: false
});

EntityEx.attributes.add('canInteract', {
    title: 'can interact',
    description: 'indicates whether the entity can be interacted with.',
    type: 'boolean',
    default: false
});

EntityEx.attributes.add('typeInteract', {
    title: 'typeInteract',
    description: '',
    type: 'string',
    default: "",
    enum: [
        { "door": "door" },
        { "pickable": "pickable" },
        { "observable": "observable" }
    ]
});


EntityEx.attributes.add("behaviorScript", {
    title: "behaviorScript",
    description: "behavior script: Indicates the script to be executed when the player interacts with the entity. It is important to know that the script must have the Preload flag turned on",
    type: "asset",
    assetType: "script",
    default: null
});

/*
EntityEx.attributes.add('gameConfig', {
    type: 'json',
    schema: [{
        name: 'numEnemies',
        type: 'number',
        default: 10
    }, {
        name: 'enemyModels',
        type: 'asset',
        assetType: 'model',
        array: true
    }, {
        name: 'godMode',
        type: 'boolean',
        default: false
    }]
});
*/

// initialize code called once per entity
EntityEx.prototype.initialize = function () {


    this.entity.isCharacter = false;
    this.entity.canBeDetected = this.canBeDetected;
    this.entity.canInteract = this.canInteract;
    this.entity.typeInteract = this.typeInteract;
    this.entity.behaviorScript = this.behaviorScript;

    ///-------------------------------------------------------------
    ///ENTITY METHODS:
    ///-------------------------------------------------------------
    this.createHinge = async function () {
        ///TODO: IN PROGRESS

        var pivotDoorEntity = new pc.Entity();
        var material = new pc.StandardMaterial();
        material.diffuse.set(1, 0, 0); // Rojo
        pivotDoorEntity.addComponent("render", {
            type: 'box',
            material: material
        });
        this.entity.addChild(pivotDoorEntity);
        pivotDoorEntity.setLocalScale(0.01, 1, 1);
        pivotDoorEntity.setLocalPosition(1, 0, 0);
        pivotDoorEntity.setRotation(0, 0, 0, 0);
        pivotDoorEntity.setLocalRotation(0, 0, 0, 0);


        var hinchDoorEntity = new pc.Entity();
        hinchDoorEntity.addComponent("render", {
            type: 'sphere',
            material: material
        });
        this.app.root.addChild(hinchDoorEntity);
        hinchDoorEntity.setPosition(pivotDoorEntity.getPosition());



        // Obtén las dos entidades que deseas conectar mediante la bisagra
        var entidadPuerta = pivotDoorEntity;
        var entidadMarco = hinchDoorEntity;

        // Obtén los componentes RigidBody de ambas entidades
        var rigidBodyPuerta = entidadPuerta.rigidbody;
        var rigidBodyMarco = entidadMarco.rigidbody;

        // Crea las transformaciones para los puntos de anclaje de la bisagra
        var transformPuerta = new Ammo.btTransform();
        var transformMarco = new Ammo.btTransform();

        // Establece las posiciones y orientaciones de los puntos de anclaje
        transformPuerta.setIdentity();
        transformPuerta.setOrigin(new Ammo.btVector3(0, 0, 0)); // Punto de anclaje en la puerta
        transformPuerta.setRotation(new Ammo.btQuaternion(0, 0, 0, 1)); // Sin rotación

        transformMarco.setIdentity();
        transformMarco.setOrigin(new Ammo.btVector3(0, 0, 0)); // Punto de anclaje en el marco
        transformMarco.setRotation(new Ammo.btQuaternion(0, 0, 0, 1)); // Sin rotación

        // Crea la restricción de bisagra
        this.hingeConstraint = new Ammo.btHingeConstraint(
            rigidBodyPuerta, rigidBodyMarco,
            transformPuerta, transformMarco,
            true // Habilita el límite de ángulo
        );

        // Configura límites de ángulo (puedes ajustarlos según tus necesidades)
        this.hingeConstraint.setLimit(-Math.PI / 4, Math.PI / 4); // Límite de ángulo de -45 grados a 45 grados

        // Agrega la restricción de bisagra al mundo de física
        this.app.systems.rigidbody.dynamicsWorld.addConstraint(this.hingeConstraint, true);
    };





    ///-------------------------------------------------------------
    ///ENTITY METHODS:
    ///-------------------------------------------------------------
    this.entity.pick = async function (fromEntity) {
        if (!fromEntity) return;
        if (!fromEntity.cameraEntity) return;

        var pickedEntity = this;


        pickedEntity.distance = pickedEntity.getPosition().distance(fromEntity.cameraEntity.getPosition());
        pickedEntity.startPosition = new pc.Vec2();
        pickedEntity.startPosition.copy(pickedEntity.getPosition());



        if (!pickedEntity.hookEntity) {
            pickedEntity.hookEntity = new pc.Entity();

            pickedEntity.hookEntity.addComponent("rigidbody", {
                type: pc.BODYTYPE_KINEMATIC
            });


            pickedEntity.hookEntity.addComponent("collision", {
                type: "box",
                halfExtents: new pc.Vec3(0.001, 0.001, 0.001)
            });

            var pos = pickedEntity.getPosition().clone();
            pickedEntity.hookEntity.setPosition(pos);
            pickedEntity.hookEntity.rigidbody.teleport(pos);


            (pickedEntity.rigidbody || {}).type = pc.BODYTYPE_DYNAMIC;

            var rbA = pickedEntity.hookEntity.rigidbody.body;
            rbA.setCcdMotionThreshold(1);
            rbA.setCcdSweptSphereRadius(0.2);

            var rbB = pickedEntity.rigidbody.body;

            if (rbA && rbA) {
                pickedEntity.joint = new Ammo.btPoint2PointConstraint(rbA, rbB,
                    new Ammo.btVector3(0, 0, 0),
                    new Ammo.btVector3(0, 0, 0)
                );
                //this.joint.setAngularOnly(true);
                // Add joint to simulation
                pickedEntity._app.systems.rigidbody.dynamicsWorld.addConstraint(pickedEntity.joint, true);
            }

        }

    }

    this.entity.unpick = async function (fromEntity) {
        var pickedEntity = this;

        if ((pickedEntity.hookEntity || {}).rigidbody) {
            pickedEntity.hookEntity.rigidbody.enabled = false;
        }

        if (pickedEntity.joint) {
            this._app.systems.rigidbody.dynamicsWorld.removeConstraint(pickedEntity.joint);
            Ammo.destroy(pickedEntity.joint);
            delete pickedEntity.joint;
        }

        if (pickedEntity.hookEntity) {
            pickedEntity.hookEntity.destroy();
            delete pickedEntity.hookEntity;
        }
    }











    ///-------------------------------------------------------------
    ///EVENTS
    ///-------------------------------------------------------------
    this.on('attr', function (name, value) {
        this.entity[name] = value;
    }, this);


    ///
    /// Interact with in
    ///
    this.entity.on("interact", async function (fromEntity) {
        if (!fromEntity) return;
        if (!this.entity.canInteract) return;
        if (this.entity.isInteracting) return;
        this.entity.fromEntity = fromEntity;

        if (!this.interactEventBusy) {
            this.interactEventBusy = true;

            var typeInteract = (this.entity.typeInteract || "").toLowerCase();
            if (typeInteract !== "") {
                this.entity.isInteracting = true; //* IS INTERACTING MODE ON*/

                switch (typeInteract) {
                    case "door":
                        break;
                    case "pickable":
                        this.entity.pick(fromEntity);
                        if (Ui) {
                            Ui.setCrossHair(UiCrossHairEnum.picked);
                            Ui.addCrossHairTip("DROP THE OBJECT", true);
                        }
                        break;
                    default:
                        break;
                }

                if (this.entity.behaviorScript && (this.entity.behaviorScript.resources || []).length > 0 && this.entity.behaviorScript.resources[0].scriptType) {
                    this.entity.behaviorScript.resources[0].scriptType.prototype.fromEntity = fromEntity;
                    this.entity.behaviorScript.resources[0].scriptType.prototype.entity = this.entity;
                    this.entity.behaviorScript.resources[0].scriptType.prototype.initialize();
                } else {
                    if (!this.behaviorScriptLostUserWarning) {
                        console.warn("ensure 'behaviorScript' source script file has preload attribute turned on.");
                        this.behaviorScriptLostUserWarning = true;
                    }
                }


            }
            this.interactEventBusy = false;
        }

    }, this);




    this.entity.on("interacted", async function (fromEntity) {
        if (!fromEntity) return;
        if (!this.entity.isInteracting) return;



        var typeInteract = (this.entity.typeInteract || "").toLowerCase();
        switch (typeInteract) {
            case "door":
                break;
            case "pickable":
                this.entity.unpick(fromEntity);
                if (Ui) {
                    Ui.clearCrossHairTip();
                }
                break;
            default:
                break;
        }

        this.entity.isInteracting = false; //* IS INTERACTING MODE OFF*/
        this.entity.fromEntity = null;

    }, this);







    ///
    ///if Player has detected this entity
    ///
    this.entity.on("detect", function (fromEntity) {
        if (!this.canBeDetected) return;


        ///TODO: Ask if is character. Ask if is HUMAN player.




        //Ui.debug(fromEntity.name + "entityex detected: " + this.entity.name);

    }, this);











    /* ************************************************************** */
    ///
    /// DETECTING ENTITIES BY A CHARACTER:
    ///
    /* ************************************************************** */

    var aabb = (((this.entity.render || {}).meshInstances || [])[0] || {}).aabb || ({ halfExtents: this.entity.localScale.clone().divScalar(2) });
    if (this.canBeDetected && !this.entity.collision) {
        //If no collision, it tries to create one:
        //BoundingBox
        this.entity.addComponent("collision", {
            type: "box",
            halfExtents: aabb.halfExtents
        });
    }


    if (this.canInteract && !this.entity.rigidbody) {
        var width = aabb.halfExtents.x * 2;
        var height = aabb.halfExtents.y * 2;
        var depth = aabb.halfExtents.z * 2;

        var density = 100;

        var volume = width * height * depth;
        var mass = density * volume;

        //If no rigidbody, it tries to create one:
        this.entity.addComponent("rigidbody", {
            type: pc.BODYTYPE_DYNAMIC,
            mass: mass

            //            linearFactor: new pc.Vec3(0.5, 1, 0.5),
            //            angularFactor: new pc.Vec3(0.5, 1, 0.5),
            //            linearDamping: 0,
            //            angularDamping: 0,
            //            friction: 1,
            //            restitution: 0
        });
    }

    //
    //Continuous Collision Detection
    //
    this.motionThreshold = 1;
    this.sweptSphereRadius = 0.2;
    var body = ((this.entity.rigidbody || {}).body || null);// Type btRigidBody
    if (body) {
        body.setCcdMotionThreshold(this.motionThreshold);
        body.setCcdSweptSphereRadius(this.sweptSphereRadius);
    }



    var typeInteract = (this.entity.typeInteract || "").toLowerCase();
    switch (typeInteract) {
        case "door":
            debugger;
            this.createHinge();


            //this.entity.render.enabled = false;



            break;
    }







    if (this.entity.collision) {
        this.entity.collision.on("triggerenter", function (characterEntity) {

            //if (this.entity.isPicking) {

            //}

            /*
                        if (this.canBeDetected && characterEntity && (characterEntity.isCharacter || false) && (characterEntity.playerDetector || false)) {
                            const thisScript = this;
                            characterEntity.detectedEntities = characterEntity.detectedEntities || [];
            
                            var index = characterEntity.detectedEntities.findIndex(function (ent) {
                                return (ent._guid || "") == ((thisScript.entity || {})._guid || "");
                            });
                            if (index < 0) {
                                characterEntity.detectedEntities.push(thisScript.entity); //ADDS THE ENTITIE
            
                                thisScript.app.fire('firstperson:detecting', characterEntity.detectedEntities);
            
                            }
                        }
            */
        }, this);

        this.entity.collision.on("triggerleave", async function (characterEntity) {
            /*
                        if (this.canBeDetected && characterEntity && (characterEntity.isCharacter || false)) {
                            const thisScript = this;
                            characterEntity.detectedEntities = characterEntity.detectedEntities || [];
            
            
                            var index = characterEntity.detectedEntities.findIndex(function (ent) {
                                return (ent._guid || "") == ((thisScript.entity || {})._guid || "");
                            });
                            if (index >= 0) {
                                characterEntity.detectedEntities.splice(index);  //DELETES THE ENTITY
            
                                thisScript.app.fire('firstperson:detecting', characterEntity.detectedEntities);
            
                            }
            
                        }
            */
        }, this);
    }


};



//////////////////////////////////////////////////////////////////////////
//
// U P D A T E
//
// update code called every frame
EntityEx.prototype.update = function (dt) {
};

EntityEx.prototype.postUpdate = function (dt) {


    if (!this.interacting_postupdateEventBusy) {
        if (this.entity.fromEntity && this.entity.isInteracting && this.entity.fromEntity.cameraEntity) {
            this.interacting_postupdateEventBusy = true;

            var typeInteract = (this.entity.typeInteract || "").toLowerCase();
            switch (typeInteract) {
                case "door":

                    break;
                case "pickable":
                    if (this.entity.hookEntity) {
                        var cameraPos = this.entity.fromEntity.cameraEntity.getPosition();
                        var direction = this.entity.fromEntity.cameraEntity.forward;
                        var targetPos = new pc.Vec3().add2(cameraPos, direction.scale(this.entity.distance));
                        if (this.entity.hookEntity.rigidbody) {
                            this.entity.hookEntity.rigidbody.teleport(targetPos);
                        } else {
                            this.entity.hookEntity.setPosition(targetPos);
                        }
                    }

                    break;
                default:
                    break;
            }
            this.interacting_postupdateEventBusy = false;
        }
    }
}

