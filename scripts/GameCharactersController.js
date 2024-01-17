//Put this script in ROOT entitity

//https://mebiusbox.github.io/contents/EffectTextureMaker/  SPRITE EFFECT
//https://basis.dev.jibencaozuo.com/                        BASIS

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

GameCharactersController.attributes.add('camera', { type: 'entity' });




// initialize code called once per entity
GameCharactersController.prototype.initialize = function () {

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



    var canvas = this.app.graphicsDevice.canvas;
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); }.bind(this), false);


    this.gameMouse_busy = false;
    this.app.mouse.on(pc.EVENT_MOUSEDOWN, function (event) {

        if (!this.gameMouse_busy) {
            this.gameMouse_busy = true;


            this.selectedCharacters = this.getSelectedCharacters(this.characters);
            if (this.selectedCharacters.length === 0) {
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

    }, this);


    this.app.mouse.on(pc.EVENT_MOUSEMOVE, function (event) {


        if (!this.gameMouse_busy) {
            this.gameMouse_busy = true;

            var selectedCharacters = this.getSelectedCharacters(this.characters);
            if (selectedCharacters.length === 0) {
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




    this.gameTimer_busy = false;
    this.gameTimer = setInterval(async function () {
        if (!this.gameTimer_busy) {
            this.gameTimer_busy = true;
            //Moves all characters:
            this.characters = this.getCharacters(),
                characters_length = this.characters.length,
                i = 0;
            for (; i < characters_length; i++) {
                var ent = this.characters[i];
                var playerScript = ent.script && ent.script.player;

                if (playerScript && playerScript.doMoveCharacter) {
                    // Llama al método
                    await playerScript.doMoveCharacter();

                }
            }
            this.gameTimer_busy = false;
        }

    }.bind(this), 50);

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


