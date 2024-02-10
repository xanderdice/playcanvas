//IMPORTANT:
//Put this script in ROOT entitity
//
//

//https://mebiusbox.github.io/contents/EffectTextureMaker/  SPRITE EFFECT
//https://basis.dev.jibencaozuo.com/                        BASIS
//cloth simulation https://playcanvas.com/project/691109/overview/cloth-simulation-demo

//resolutions
//4320p (8K): 7680x4320
//2160p (4K): 3840x2160
//1440p (2K): 2560x1440
//1080p (HD): 1920x1080
//720p (HD): 1280x720
//480p (SD): 854x480
//360p (SD): 640x360
//240p (SD): 426x240 


var GameCharactersController = pc.createScript('gameCharactersController');

GameCharactersController.attributes.add('camera', {
    type: 'entity',
    title: "camera",
    description: "General camera for this game.",
    default: null
});

GameCharactersController.attributes.add('playerPersonStyle', {
    title: 'Player Person Style',
    type: 'string', enum: [
        { 'FirstPerson': 'FirstPerson' },
        { 'ThirdPerson': 'ThirdPerson' }
    ], default: 'ThirdPerson',
    description: "General style of player view for this game.",
});

GameCharactersController.attributes.add('gameTimerMillisecods', {
    title: 'gameTimerMillisecods',
    type: 'number',
    min: 16,
    max: 100,
    precision: 0,
    default: 55,
    description: "Time to refresh the movemente of the characters. Uses to nivelate performance.",
});


GameCharactersController.attributes.add('fontAsset', {
    title: 'font',
    type: 'asset',
    assetType: "font",
    default: null,
    description: "Font."
});


GameCharactersController.attributes.add('followCamera',
    {
        title: "Follow Camera",
        type: 'json',
        schema: [
            {
                name: 'target',
                type: 'entity',
                default: null,
                description: 'The target entity to follow'
            }, {

                name: "cameraOffset",
                type: 'vec3',
                default: [0, 1, 3],
                title: 'Camera Offset',
                description: 'The local space offset with respect to the target entity coordinate system'
            },
            {
                name: 'lerpAmount',
                type: 'number',
                min: 0,
                max: 1,
                default: 0.99,
                title: 'Lerp Amount',
                description: 'The amount to lerp the camera towards its desired position over time. The closer it is to 1, the faster the camera will move. Lerping is frame rate independent and will be correct for every frame rate.'
            }
        ]
    });


// initialize code called once per entity
GameCharactersController.prototype.initialize = function () {
    if (!this.camera) {
        console.error("you need configure a camera to GameCharactersController script boss !!");
        return;
    }

    this.characters = [];
    this.selectedCharacters = [];


    this.mousePointer = new pc.Entity();
    this.mousePointer.addComponent(
        'element', {
        type: 'image',
        spriteAsset: this.app.assets.find("square_selector", "sprite"),
        pivot: new pc.Vec2(0.5, 0.5), // Ajusta el pivote según tus necesidades
        width: 1, // Ajusta el ancho de la imagen
        height: 1, // Ajusta la altura de la imagen

    });
    this.app.root.addChild(this.mousePointer);
    this.mousePointer.setLocalRotation(0, 0, 0);
    this.mousePointer.setLocalScale(1, 1, 1);
    this.previousX = 0;
    this.previousY = 0;


    var canvas = this.app.graphicsDevice.canvas;
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); }.bind(this), false);
    this.app.mouse.disableContextMenu();




    this.moveForward = 0;
    this.moveRight = 0;

    this.gameMouse_busy = false;
    //this.app.mouse.on(pc.EVENT_MOUSEDOWN, function (event) {
    canvas.addEventListener(pc.EVENT_MOUSEDOWN, async function (event) {


        if (!this.gameMouse_busy) {
            this.gameMouse_busy = true;


            this.selectedCharacters = this.getSelectedCharacters(this.characters);
            if (this.selectedCharacters.length === 0) {
                this.gameMouse_busy = false;
                return;
            }

            if (this.playerPersonStyle === "FirstPerson") {
                var canvas = this.app.graphicsDevice.canvas;
                try {
                    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
                        canvas.requestPointerLock();
                    }
                } catch { }



                this.gameMouse_busy = false;
                return;
            }

            // Obtiene la posición del clic del mouse en pantalla (coordenadas normalizadas)
            var x = event.x; // this.app.graphicsDevice.width;
            var y = event.y; // this.app.graphicsDevice.height;

            var from = this.camera.getPosition().clone();
            var to = this.camera.camera.screenToWorld(
                x,
                y,
                this.camera.camera.farClip
            );


            var raycast = this.app.systems.rigidbody.raycastFirst(
                from,
                to
            );

            if (raycast != null && raycast.entity) {


                var selectableCharacters = this.getSelectableCharacters(this.characters);

                var isSelectableByRaycast = selectableCharacters.find(function (char) {
                    return char._guid === raycast.entity._guid;
                });

                if (isSelectableByRaycast) {
                    //If can select then adds
                    var exists = this.selectedCharacters.find(function (char) {
                        return char._guid === raycast.entity._guid;
                    });

                    raycast.entity.selected = !exists;

                    this.gameMouse_busy = false;
                    return;
                }



                var i = 0,
                    selectedCharacters_length = this.selectedCharacters.length,
                    threshold = 0.8,
                    faceNormal = raycast.normal,
                    hitPosition = raycast.point,
                    gridSize = 1,
                    // Redondea las coordenadas a la grilla
                    gridX = Math.round(hitPosition.x / gridSize) * gridSize,
                    gridY = Math.round(hitPosition.y / gridSize) * gridSize,
                    gridZ = Math.round(hitPosition.z / gridSize) * gridSize;

                raycast.calculatedPoint = new pc.Vec3(gridX, gridY, gridZ);


                if (faceNormal.dot(new pc.Vec3(0, 1, 0)) > threshold) {
                    for (; i < selectedCharacters_length; i++) {
                        this.selectedCharacters[i].targetPoint = raycast.calculatedPoint;
                    }
                }

            }

            this.gameMouse_busy = false;
        }

    }.bind(this));


    this.app.mouse.on(pc.EVENT_MOUSEMOVE, async function (event) {
        //canvas.addEventListener(pc.EVENT_MOUSEMOVE, async function (event) {


        if (!this.gameMouse_busy) {
            this.gameMouse_busy = true;

            if (document.pointerLockElement !== canvas && this.playerPersonStyle === "FirstPerson") {
                this.gameMouse_busy = false;
                return;
            }

            // Actualiza las variables de posición anterior para el próximo cálculo
            var x = event.x,
                y = event.y,
                deltaX = event.clientX ? event.clientX - this.previousX : event.dx,
                deltaY = event.clientY ? event.clientY - this.previousY : event.dy;


            if (this.mainPlayer) {
                this.lookSpeed = 0.3;
                if (this.lookLastDeltaX === deltaX) deltaX = 0;
                if (this.lookLastDeltaY === deltaY) deltaY = 0;
                this.mainPlayer.fire("character:rotate", { x: x, y: y, deltaX: deltaX, deltaY: deltaY, lookSpeed: this.lookSpeed || 1, playerPersonStyle: this.playerPersonStyle, camera: this.camera });
                if (this.camera && this.camera.camera) {
                    this.camera.fire("camera:pitch", { y: y, deltaY: deltaY, lookSpeed: this.lookSpeed || 1, playerPersonStyle: this.playerPersonStyle, camera: this.camera });
                }
                this.lookLastDeltaX = deltaX;
                this.lookLastDeltaY = deltaY;
            } else {
                this.mainPlayer = this.getMainPlayer(this.characters);
            }

            this.previousX = event.clientX;
            this.previousY = event.clientY;

            /*if is firtsperson, extt */
            if (this.playerPersonStyle === "FirstPerson") {
                var cameraEntityPosition = this.camera.getPosition();
                var cameraEntityForward = this.camera.forward;

                var lineDistance = 4; // 2 metros
                var lineEnd = new pc.Vec3().add2(cameraEntityPosition, cameraEntityForward.scale(lineDistance));

                var raycast = this.app.systems.rigidbody.raycastFirst(cameraEntityPosition, lineEnd);


                // Comprueba si el rayo golpeó algo
                if (raycast) {
                    this.showTextForEntity(raycast.entity, raycast.point);
                }

                this.gameMouse_busy = false;
                return;
            }



            //
            //RAYCAST:
            //
            var selectedCharacters = this.getSelectedCharacters(this.characters);
            if (selectedCharacters.length === 0) {
                this.gameMouse_busy = false;
                return;
            }


            var from = this.camera.getPosition().clone();
            var to = this.camera.camera.screenToWorld(
                x,
                y,
                this.camera.camera.farClip
            );


            var raycast = this.app.systems.rigidbody.raycastFirst(
                from,
                to
            );

            if (raycast != null) {

                var selectableCharacters = this.getSelectableCharacters(this.characters);

                var isSelectable = selectableCharacters.find(function (char) {
                    return char._guid === raycast.entity._guid;
                });

                //Si mueve el mouse sobre  un character:
                if (isSelectable) {
                    if (!this.mouseHoverCharacter) {
                        this.mouseHoverCharacter = raycast.entity;
                    }
                } else {
                    //Si mueve el mouse sobre el PISO:
                    if (this.mouseHoverCharacter) {
                        this.mouseHoverCharacter = null;
                    }

                    var hitPosition = raycast.point,
                        gridSize = 1;
                    // Redondea las coordenadas a la grilla
                    var gridX = Math.round(hitPosition.x / gridSize) * gridSize;
                    var gridY = Math.round(hitPosition.y / gridSize) * gridSize;
                    var gridZ = Math.round(hitPosition.z / gridSize) * gridSize;

                    //Posiona la entidad mouse pointer:
                    this.mousePointer.setPosition(gridX, gridY, gridZ);

                }

            } else {

                if (this.mouseHoverCharacter) {
                    var renderComp = (this.mouseHoverCharacter.findComponents("render") || [])[0];
                    this.mouseHoverCharacter = null;
                }
            }


            this.gameMouse_busy = false;
        }

    }, this);



    //this.app.keyboard.on(pc.EVENT_KEYDOWN, function (e) {
    canvas.addEventListener(pc.EVENT_KEYDOWN, function (event) {
        switch (event.keyCode) {
            case pc.KEY_W:
            case pc.KEY_UP:
                this.moveForward = 1;
                break;
            case pc.KEY_S:
            case pc.KEY_DOWN:
                this.moveForward = -1;
                break;
            case pc.KEY_D:
            case pc.KEY_RIGHT:
                this.moveRight = 1;
                break;
            case pc.KEY_A:
            case pc.KEY_LEFT:
                this.moveRight = -1;
                break;
            case pc.KEY_E:
                this.interact = true;
                break;
        }
    }.bind(this));


    //this.app.keyboard.on(pc.EVENT_KEYUP, function (event) {
    canvas.addEventListener(pc.EVENT_KEYUP, function (event) {
        if (event.keyCode === pc.KEY_W || event.keyCode === pc.KEY_S || event.keyCode === pc.KEY_UP || event.keyCode === pc.KEY_DOWN) {
            this.moveForward = 0;
        }
        if (event.keyCode === pc.KEY_D || event.keyCode === pc.KEY_A || event.keyCode === pc.KEY_RIGHT || event.keyCode === pc.KEY_LEFT) {
            this.moveRight = 0;
        }
    }.bind(this));


    this.gameTimer_busy = false;
    this.gameTimer = setInterval(async function () {
        if (!this.gameTimer_busy) {
            this.gameTimer_busy = true;
            //Moves all characters:
            this.characters = this.getCharacters(),
                characters_length = this.characters.length,
                i = 0,
                e = {
                    deviceInputKeyboard: {
                        moveForward: this.moveForward,
                        moveRight: this.moveRight,
                        camera: this.camera,
                        playerPersonStyle: this.playerPersonStyle
                    }
                };
            for (; i < characters_length; i++) {
                this.characters[i].fire("character:domove", e);
            }

            this.gameTimer_busy = false;
        }

    }.bind(this), this.gameTimerMillisecods || 55);



    /*******************************************************/
    /*
    /*    FOLLOR CAMERA
    /*
    /*******************************************************/

    this.camera.setRotation(pc.Vec3.ZERO);
    this.followCamera.targetPos = new pc.Vec3();
    this.followCamera.matrix = new pc.Mat4();
    this.followCamera.quat = new pc.Quat();
    this.followCamera.vec = new pc.Vec3();
    this.followCamera.cameraPitchRotation = 0;
    this.followCamera.cameraPitch_busy = false;

    if (this.followCamera.target) {
        if (this.followCamera.target.isCharacter) {
            console.error("Camera can not set directly to the character entity. you need create a target entity and set it as child of the main character entity.");
            return;
        }

        this.updateFollorCameraTargetPosition();
        this.followCamera.currentPos = this.followCamera.targetPos.clone();

        if (this.playerPersonStyle === "FirstPerson") {
            this.followCamera.cameraOffset = pc.Vec3.ZERO;
            this.followCamera.lerpAmount = 1;

            this.camera.on('camera:pitch', function (eventLook) {
                if (!this.followCamera.cameraPitch_busy) {
                    this.followCamera.cameraPitch_busy = true;

                    var deltaY = (eventLook.deltaY || 0) * (eventLook.lookSpeed || 1);

                    var pitch = -deltaY;
                    this.followCamera.cameraPitchRotation += pitch;
                    this.followCamera.cameraPitchRotation = pc.math.clamp(this.followCamera.cameraPitchRotation, -90, 80);

                    this.followCamera.cameraPitch_busy = false;
                }
            }, this);

        }

    } else {
        this.followCamera.currentPos = this.camera.getPosition().clone();
    }


};

GameCharactersController.prototype.updateFollorCameraTargetPosition = function () {

    // Calculate the target's angle around the world Y axis
    var forward = this.followCamera.target.forward;
    this.followCamera.vec.set(-forward.x, 0, -forward.z).normalize();
    var angle = Math.atan2(this.followCamera.vec.x, this.followCamera.vec.z) * 180 / Math.PI;

    // Rebuild the world transform for the target with a rotation limited to the world y axis
    this.followCamera.quat.setFromEulerAngles(0, angle, 0);
    this.followCamera.matrix.setTRS(this.followCamera.target.getPosition(), this.followCamera.quat, pc.Vec3.ONE);


    // Calculate the desired camera position in world space
    this.followCamera.matrix.transformPoint(this.followCamera.cameraOffset, this.followCamera.targetPos);


};

// update code called every frame
GameCharactersController.prototype.postUpdate = function (dt) {
    if (this.followCamera.target) {
        if (this.playerPersonStyle === "ThirdPerson") {
            // Calculate where we want the camera to be
            this.updateFollorCameraTargetPosition();

            // Lerp the current camera position to where we want it to be
            // Note that the lerping is framerate independent
            // From: https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
            if (this.followCamera.lerpAmount === 1) {
                this.followCamera.currentPos = this.followCamera.targetPos;
            } else {
                this.followCamera.currentPos.lerp(this.followCamera.currentPos, this.followCamera.targetPos, 1 - Math.pow(1 - this.followCamera.lerpAmount, dt));
            }

            // Set the camera's position
            this.camera.setPosition(this.followCamera.currentPos);

            this.camera.lookAt(this.followCamera.target.getPosition());
        }

        if (this.playerPersonStyle === "FirstPerson") {
            this.camera.setPosition(this.followCamera.target.getPosition());
            var targetRotation = this.followCamera.target.getRotation();  // Obtener la rotación como cuaternión

            // Crear un cuaternión para la rotación en el eje X
            var pitchRotation = new pc.Quat();
            pitchRotation.setFromEulerAngles(this.followCamera.cameraPitchRotation, 0, 0);

            // Multiplicar la rotación original por el pitchRotation
            targetRotation.mul(pitchRotation);

            // Aplicar la rotación resultante a la cámara
            this.camera.setRotation(targetRotation);
        }

    }
};


// update code called every frame
GameCharactersController.prototype.update = function (dt) {

};


/// ------------------------------------------------------------
///FUNCTIONS
/// ------------------------------------------------------------

GameCharactersController.prototype.getCharacters = function () {
    // Recorre las entidades hijas
    var characters = this.entity.children.filter(function (char) {
        return (char.enabled && char.isCharacter)
    });

    return characters;
}

GameCharactersController.prototype.getSelectedCharacters = function (characters) {
    var characters = characters.filter(function (char) {
        return char.selected;
    });
    return characters;
}
GameCharactersController.prototype.getSelectableCharacters = function (characters) {
    var characters = characters.filter(function (char) {
        return char.isSelectable;
    });
    return characters;
}

GameCharactersController.prototype.getMainPlayer = function (characters) {
    var mainPlayer = characters.find(function (char) {
        return char.isPlayer;
    });
    return mainPlayer;
}



GameCharactersController.prototype.showTextForEntity = function (entity, point) {

    if (!this.textEntity) {
        this.textEntity = new pc.Entity();
        this.app.root.addChild(this.textEntity);

        this.textEntity.addComponent('element', {
            type: pc.ELEMENTTYPE_TEXT,
            anchor: new pc.Vec4(0.5, 0.5, 0.5, 0.5),
            pivot: new pc.Vec2(0.5, 0.5),
            width: 200,
            height: 50,
            fontAsset: this.fontAsset
        });

        this.textEntity.element.color = pc.Color.WHITE;
        this.textEntity.element.fontSize = 0.1;
    }



    // Asigna el nombre de la entidad al texto
    this.textEntity.element.text = entity.name;

    // Ajusta la posición del texto para que aparezca cerca del objeto impactado
    this.textEntity.setPosition(point);

    this.textEntity.lookAt(this.camera.getPosition());
    this.textEntity.rotateLocal(0, 180, 0);
    // Ajusta otros estilos y propiedades del texto según sea necesario

}
