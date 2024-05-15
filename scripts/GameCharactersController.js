//IMPORTANT:
//Put this script in ROOT entitity
//
//

//https://mebiusbox.github.io/contents/EffectTextureMaker/  SPRITE EFFECT
//https://basis.dev.jibencaozuo.com/                        BASIS
//cloth simulation https://playcanvas.com/project/691109/overview/cloth-simulation-demo
//ABLEDO TO NORMAL : https://www.smart-page.net/smartnormal/

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
        { 'ThirdPerson': 'ThirdPerson' },
        { 'ThirdPersonPointMove': 'ThirdPersonPointMove' }
    ], default: 'ThirdPerson',
    description: "General style of player view for this game.",
});








GameCharactersController.attributes.add('fontAsset', {
    title: 'font',
    type: 'asset',
    assetType: "font",
    default: null,
    description: "Font."
});



GameCharactersController.attributes.add('mouseOptions', {
    title: "Mouse Options",
    type: 'json',
    schema: [
        {
            name: 'hideMousePointer',
            title: 'hideMousePointer',
            type: 'boolean',
            default: false,
            description: 'hideMousePointer'
        },
        {
            name: 'fireMenuEventOnMouseMove',
            title: 'fireMenuEventOnMouseMove',
            type: 'boolean',
            default: false,
            description: 'fireMenuEventOnMouseMove'
        },
        {
            name: "mouseSensitivity",
            type: 'number',
            default: 10,
            title: 'Mouse Sensitivity'
        }

    ]
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
                title: 'Target Entity',
                description: 'Select the entity around which the camera will orbit'
            },
            {
                name: 'orbitRadius',
                type: 'number',
                default: 3,
                title: 'Orbit Radius'
            },
            {
                name: 'bottomClamp',
                type: 'number',
                default: 320,
                min: 320,
                max: 340,
                precision: 0,
                title: 'bottomClamp',
                description: "The maximum value in angle degrees for the camera downwards movement."
            },
            {
                name: 'topClamp',
                type: 'number',
                default: 70,
                min: 50,
                max: 70,
                precision: 0,
                title: 'topClamp',
                description: "The maximum value in angle degrees for the camera upwards movement."
            },
            {
                name: 'smoothFactor',
                type: 'number',
                default: 0.2,
                min: 0.01,
                max: 1,
                title: 'Smooth Factor',
                description: 'Adjusts the smoothness of camera movement (0.1 for more smooth, 1 for immediate response)'
            },
            {
                name: 'autofov',
                type: 'boolean',
                default: false,
                title: 'autofov'
            },

        ]
    });


GameCharactersController.attributes.add('lensflareCamera',
    {
        title: "LensFlare Camera",
        type: 'json',
        schema: [
            {
                name: 'enabled',
                type: 'boolean',
                default: true,
                title: 'enabled',
                description: 'enables lens flares'
            },

            {
                name: 'texture',
                type: 'asset',
                assetType: "texture",
                default: null,
                title: 'texture',
                description: 'texture'
            }

        ]
    });


// initialize code called once per entity
GameCharactersController.prototype.initialize = function () {

    this.app.maxDeltaTime = 0.2;
    var display = this.app.graphicsDevice;
    // Obtener el pixelRatio actual
    var currentPixelRatio = window.devicePixelRatio || 1;
    // Calcular el ancho y alto deseados para mantener el pixelRatio en 1
    var desiredWidth = display.width / currentPixelRatio;
    var desiredHeight = display.height / currentPixelRatio;

    var screen_width = screen.width;
    var screen_height = screen.height;

    //this.app.resizeCanvas(screen_width, screen_height);

    // Establecer el nuevo ancho y alto en la pantalla

    // Actualizar la resolución interna del dispositivo gráfico
    screen_width = ((screen_width * currentPixelRatio) / 4) * 3;
    screen_height = ((screen_height * currentPixelRatio) / 4) * 3;

    //console.log("screen_width" + screen_width);
    //console.log("screen_height" + screen_width);

    this.app.setCanvasResolution(pc.RESOLUTION_FIXED, screen_width, screen_height);
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW, screen_width, screen_height);

    //var ambientColor = new pc.Color(96 / 255, 128 / 255, 128 / 255);
    //var ambientColor = new pc.Color(0 / 255, 32 / 255, 64 / 255);
    var ambientColor = new pc.Color(192 / 255, 224 / 255, 255 / 255);
    this.app.scene.ambientLight = ambientColor;

    //this.app.scene.lighting.debugLayer = this.app.scene.layers.getLayerByName("World").id;

    if (this.camera) {

        const currentOptions = {
            camera: this.camera.camera, // camera used to render those passes
            samples: 0, // number of samples for multi-sampling
            // sceneColorMap: true, // true if the scene color should be captured
            sceneColorMap: false,

            // enable the pre-pass to generate the depth buffer, which is needed by the TAA
            prepassEnabled: true,
            /*tonemapping: pc.TONEMAP_ACES,*/

            // enable temporal anti-aliasing
            taaEnabled: true
        };

        //        const renderPassCamera = new pcx.RenderPassCameraFrame(this.app, currentOptions);
        //this.camera.camera.renderPasses = [renderPassCamera];
        //renderPassCamera.composePass.toneMapping = pc.TONEMAP_ACES;
        //        this.camera.camera.jitter = 1;

    }


    this.characters = [];
    this.selectedCharacters = [];



    /*---------------*/
    /* MOUSE EVENTS  */
    /*---------------*/
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
    this.canvas = this.app.graphicsDevice.canvas;

    this.gameMouse_busy = false;
    this.app.mouse.on(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
    this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
    this.app.mouse.on(pc.EVENT_MOUSEWHEEL, this.onMouseWheel, this);

    this.canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); }.bind(this), false);
    this.app.mouse.disableContextMenu();

    this.on("destroy", function () {
        this.app.mouse.off(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
        this.app.mouse.off(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
        this.app.mouse.off(pc.EVENT_MOUSEWHEEL, this.onMouseWheel, this);
    }, this);



    /*-----------*/
    /* keyboard  */
    /*-----------*/
    this.jumping_elapsedtime = 0;
    this.jumping_availability = true;

    this.input = {
        playerPersonStyle: this.playerPersonStyle,
        x: 0,
        z: 0,
        jump: false,
        sprint: false,
        attack: false,
        interact: false,
        mouseX: 0,
        mouseY: 0,
        mouseDx: 0,
        mouseDy: 0,
        mouseSensitivity: this.mouseOptions.mouseSensitivity,
        mousePrimaryButton: false,
        mouseSecondaryButton: false,
        mouseWheel: 0,
        camera: this.camera,
        dt: 0
    };














    /*******************************************************/
    /*
    /*    FOLLOW CAMERA
    /*
    /*******************************************************/

    this.followCamera.eulers = new pc.Vec3();
    this.followCamera.smoothedPosition = new pc.Vec3();
    this.followCamera.initialFov = this.camera ? this.camera.camera.fov : 45;



    /*******************************************************/
    /*
    /*    LENS FLARE
    /*
    /*******************************************************/
    this.lensflareCamera.lights = [];
    this.lensflareCamera.elapsedTime = 0;
    this.lensflareCamera.batchGroup_lensflare_images = this.app.batcher.getGroupByName("lensflare_images");
    this.lensflareCamera.batchGroup_lensflare_sphere = this.app.batcher.getGroupByName("lensflare_sphere");
    if (!this.lensflareCamera.batchGroup_lensflare_images) {
        this.lensflareCamera.batchGroup_lensflare_images = this.app.batcher.addGroup("lensflare_images", true, 100);
    }
    if (!this.lensflareCamera.batchGroup_lensflare_sphere) {
        this.lensflareCamera.batchGroup_lensflare_sphere = this.app.batcher.addGroup("lensflare_sphere", true, 100);
    }

    this.lensflareCamera.lights = [];
    var lights = this.app.root.findComponents('light'),
        lights = lights.filter(function (li) {
            return li.isStatic;
        });

    var i = 0, lights_length = lights.length;
    this.lensflareCamera.lights = [];
    for (; i < lights_length; i++) {
        this.lensflareCamera.lights.push(lights[i].entity);
    }



};



/* MOUSE MOVE */
GameCharactersController.prototype.onMouseMove = function (event) {

    if (!this.gameMouse_busy) {
        this.gameMouse_busy = true;


        if (this.mouseOptions.hideMousePointer && !pc.Mouse.isPointerLocked()) {
            this.gameMouse_busy = false;
            return;
        }

        // Actualiza las variables de posición anterior para el próximo cálculo
        const x = event.x, y = event.y;
        var deltaX = event.clientX ? event.clientX - this.previousX : event.dx,
            deltaY = event.clientY ? event.clientY - this.previousY : event.dy;

        this.input.mouseX = x;
        this.input.mouseY = y;
        this.input.mouseDx = deltaX;
        this.input.mouseDy = deltaY;




        if (this.mainPlayer) {
            if (this.lookLastDeltaX === deltaX) deltaX = 0;
            if (this.lookLastDeltaY === deltaY) deltaY = 0;
            if (this.camera && this.camera.camera) {
                this.onMouseMoveFollowCamera();
            }
            this.lookLastDeltaX = deltaX;
            this.lookLastDeltaY = deltaY;
        } else {
            this.mainPlayer = this.getMainPlayer(this.characters);
        }

        this.previousX = event.clientX;
        this.previousY = event.clientY;

        if (pc.Mouse.isPointerLocked()) {
            /*if is firtsperson, extt */
            if (this.playerPersonStyle === "FirstPerson") {
                var cameraEntityPosition = this.camera.getPosition();
                var cameraEntityForward = this.camera.forward;

                var lineDistance = 4; // 2 metros
                var lineEnd = new pc.Vec3().add2(cameraEntityPosition, cameraEntityForward.scale(lineDistance));

                var raycast = this.app.systems.rigidbody.raycastFirst(cameraEntityPosition, lineEnd, { lowResolution: true });


                // Comprueba si el rayo golpeó algo
                if (raycast) {
                    this.showTextForEntity(raycast.entity, raycast.point);
                }

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
            to,
            { lowResolution: true }
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

}

GameCharactersController.prototype.onMouseMoveFollowCamera = function () {
    this.followCamera.eulers.x -= ((this.mouseOptions.mouseSensitivity * this.input.mouseDx) / 60) % 360;
    this.followCamera.eulers.y += ((this.mouseOptions.mouseSensitivity * this.input.mouseDy) / 60) % 360;

    this.followCamera.eulers.x = (this.followCamera.eulers.x + 360) % 360;
    this.followCamera.eulers.y = (this.followCamera.eulers.y + 360) % 360;


    if (this.followCamera.eulers.y > this.followCamera.topClamp && this.followCamera.eulers.y < this.followCamera.topClamp + 180) {
        this.followCamera.eulers.y = this.followCamera.topClamp;
    }
    if (this.followCamera.eulers.y < this.followCamera.bottomClamp && this.followCamera.eulers.y > this.followCamera.bottomClamp - 180) {
        this.followCamera.eulers.y = this.followCamera.bottomClamp;
    }
}

GameCharactersController.prototype.onMouseDown = function (event) {



    if (!this.gameMouse_busy) {
        this.gameMouse_busy = true;




        this.selectedCharacters = this.getSelectedCharacters(this.characters);
        if (this.selectedCharacters.length === 0) {
            this.gameMouse_busy = false;
            return;
        }

        if (this.mouseOptions.hideMousePointer) {
            try {
                if (!pc.Mouse.isPointerLocked()) {
                    this.app.mouse.enablePointerLock();
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
            to,
            { lowResolution: true }
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

};


GameCharactersController.prototype.onMouseWheel = function (event) {
    this.input.mouseWheel = event.wheelDelta;
};



GameCharactersController.prototype.onKeyboardInput = function (dt) {
    const keyboard = this.app.keyboard;

    // Movimiento horizontal
    if (keyboard.isPressed(pc.KEY_A) || keyboard.isPressed(pc.KEY_LEFT)) {
        this.input.x = -1;
    } else if (keyboard.isPressed(pc.KEY_D) || keyboard.isPressed(pc.KEY_RIGHT)) {
        this.input.x = 1;
    } else {
        this.input.x = 0;
    }

    // Movimiento vertical
    if (keyboard.isPressed(pc.KEY_W) || keyboard.isPressed(pc.KEY_UP)) {
        this.input.z = 1;
    } else if (keyboard.isPressed(pc.KEY_S) || keyboard.isPressed(pc.KEY_DOWN)) {
        this.input.z = -1;
    } else {
        this.input.z = 0;
    }


    // Salto
    if (this.jumping_availability) {
        if (keyboard.wasPressed(pc.KEY_SPACE)) {
            this.jumping_availability = false;
            this.input.jump = true;
        }
    }

    // Sprint
    const isShiftPressed = keyboard.isPressed(pc.KEY_SHIFT);
    //this.input.sprint = this.sprintByDefault ? !isShiftPressed : isShiftPressed;
    this.input.sprint = isShiftPressed;


    this.input.interact = keyboard.isPressed(pc.KEY_E);
    this.input.attack = keyboard.isPressed(pc.KEY_F);


    this.input.mousePrimaryButton = this.app.mouse.isPressed(pc.MOUSEBUTTON_LEFT);
    this.input.mouseSecondaryButton = this.app.mouse.isPressed(pc.MOUSEBUTTON_RIGHT);


    this.input.playerPersonStyle = this.playerPersonStyle;

}

GameCharactersController.prototype.updateCharactersMovement = function (dt) {
    if (!this.updateCharactersMovement_busy) {
        this.updateCharactersMovement_busy = true;

        //Moves all characters:
        this.characters = this.getCharacters(),
            characters_length = this.characters.length,
            i = 0;


        for (; i < characters_length; i++) {
            var otherScript = this.characters[i].script.character
            if (otherScript) {
                otherScript.doMove(this.input, dt);
            }

        }

        this.updateCharactersMovement_busy = false;
    } else {
        Trace("updateCharactersMovement_busy = true");
    }
}




GameCharactersController.prototype.updateCameraOrientation = function (dt) {

    if (this.camera && this.followCamera && this.followCamera.eulers) {
        this.camera.setEulerAngles(new pc.Vec3(
            -this.followCamera.eulers.y,
            this.followCamera.eulers.x + 180,
            0
        ));

        if (this.playerPersonStyle === "FirstPerson") {
            if (this.mainPlayer) {
                var otherScript = this.mainPlayer.script.character
                if (otherScript) {
                    otherScript.rotateCharacter(0, 0, this.camera, 0, true);
                }
            }
        };

    }
};



GameCharactersController.prototype.updateCameraPosition = function (dt) {
    if (!this.camera || !this.followCamera.target) {
        return;
    }
    if (!this.followCamera.smoothedPosition) {
        return;
    }

    var targetPosition = this.followCamera.target.getPosition();

    if (this.playerPersonStyle === "FirstPerson") {
        this.camera.setPosition(targetPosition);
        return;
    }


    var cameraPosition = targetPosition.clone().add(this.camera.forward.scale(-this.followCamera.orbitRadius));
    cameraPosition.y = pc.math.clamp(cameraPosition.y, 0.5, Number.POSITIVE_INFINITY);

    const hit = this.app.systems.rigidbody.raycastFirst(targetPosition, cameraPosition);

    if (hit && hit.entity && !(hit.entity.isPlayer ?? false) && hit.entity.name.toLowerCase() !== "charactersensor") {
        var direction = this.followCamera.target.getPosition().sub(hit.point).normalize();
        cameraPosition = hit.point.clone().add(direction.scale(0.1));
    }




    const deltaTimeAdjustment = dt / (1.0 / 60); // 60 es la tasa de frames objetivo (puedes ajustarla según tu necesidad)
    const smoothFactor = this.followCamera.smoothFactor * deltaTimeAdjustment;
    this.followCamera.smoothedPosition.lerp(this.followCamera.smoothedPosition, cameraPosition, smoothFactor);

    this.camera.setPosition(this.followCamera.smoothedPosition);

    targetPosition = this.followCamera.target.getPosition();
    this.camera.lookAt(targetPosition);


    var distanceToTarget = targetPosition.distance(this.camera.getPosition());

    if (this.followCamera.autofov) {
        var fov = this.followCamera.initialFov + (this.followCamera.initialFov * (1 - Math.min(distanceToTarget, this.followCamera.orbitRadius) / this.followCamera.orbitRadius));
        // Limitar el FOV a un rango válido
        fov = pc.math.clamp(fov, this.initialFov, 90);
        // Aplicar el FOV a la cámara
        this.camera.camera.fov = fov;
    }

};


// update code called every frame
GameCharactersController.prototype.update = function (dt) {

    this.input.dt = dt;
    this.onKeyboardInput(dt);

    this.updateCharactersMovement(dt);

    if (this.followCamera.target) {
        this.updateCameraOrientation(dt);
        this.updateCameraPosition(dt);
    }

    const clonedObject = Object.assign({}, this.input);
    clonedObject.camera = null;
    Trace("input", clonedObject);

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



GameCharactersController.prototype.getSceneLights = function (dt) {

    if (this.lensflareCamera.elapsedTime === 0) {
    }


    var i = 0,
        lights_length = this.lensflareCamera.lights.length;




    for (; i < lights_length; i++) {
        var lightEntity = this.lensflareCamera.lights[i];

        if (!lightEntity.lensFlareImage) {
            lightEntity.lensFlareImage = new pc.Entity();

            if (!this.lensflareCamera.material) {
                this.lensflareCamera.material = new pc.StandardMaterial();
                this.lensflareCamera.material.blendType = pc.BLEND_NORMAL; // Tipo de mezcla (puedes ajustar según tus necesidades)
                this.lensflareCamera.material.opacity = 0.01; // Opacidad del material (0 es totalmente transparente, 1 es totalmente opaco)
                this.lensflareCamera.material.update();
            }

            lightEntity.lensFlareImage.addComponent('element', {
                type: 'image', // Tipo de elemento: imagen
                anchor: [0.5, 0.5, 0.5, 0.5], // Anclajes para ajustar la posición y tamaño de la imagen
                pivot: [0.5, 0.5], // Pivote de la imagen
                width: 4, // Ancho de la imagen en píxeles
                height: 4, // Altura de la imagen en píxeles
                opacity: 1, // Opacidad de la imagen (0 a 1)
                rect: [0, 0, 1, 1], // Rectángulo que define la región de la imagen (x, y, width, height)
                textureAsset: this.lensflareCamera.texture, // Asset de textura para la imagen (puede ser null)
                layers: [pc.LAYERID_WORLD],
                batchGroupId: this.lensflareCamera.batchGroup_lensflare_images.id
            });

            lightEntity.lensFlareImage.addComponent('render', {
                type: 'sphere', // Tipo de geometría (plano)
                material: this.lensflareCamera.material,
                isStatic: true,
                layers: [pc.LAYERID_WORLD],
                batchGroupId: this.lensflareCamera.batchGroup_lensflare_sphere.id
            });


            this.app.root.addChild(lightEntity.lensFlareImage);
            lightEntity.lensFlareImage.setPosition(lightEntity.getPosition());
        }


        // Calcular la rotación necesaria utilizando la matriz de vista de la cámara
        var rotation = new pc.Quat().setFromMat4(this.camera.camera.viewMatrix).conjugate();
        lightEntity.lensFlareImage.setRotation(rotation);

    }




    this.lensflareCamera.elapsedTime += dt;
    if (this.lensflareCamera.elapsedTime >= 1) {
        this.lensflareCamera.elapsedTime = 0;
    }


}

// Función para calcular la rotación en grados dado un quaternion de rotación
GameCharactersController.prototype.getYaw = function (rotation) {
    // Calcular el ángulo en radianes del eje Y (Yaw) de la rotación
    var angleRadians = Math.atan2(2 * (rotation.w * rotation.y + rotation.x * rotation.z), 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z));
    // Convertir el ángulo de radianes a grados
    var angleDegrees = angleRadians * (180 / Math.PI);
    return angleDegrees;
}

