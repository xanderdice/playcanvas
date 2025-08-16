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
//
//LUTS:
//            https://greggman.github.io/LUT-to-PNG/
//            https://freshluts.com/most_popular_luts?page=4
//            https://o-l-l-i.github.io/lut-maker/




var GameCharactersController = pc.createScript('gameCharactersController');


GameCharactersController.attributes.add('fontAsset', {
    title: 'font',
    type: 'asset',
    assetType: "font",
    default: null,
    description: "Font."
});

GameCharactersController.attributes.add('interv', {
    title: 'interv',
    type: 'boolean',
    default: true,
    description: "interv"
});








// initialize code called once per entity
GameCharactersController.prototype.initialize = function () {



    //720p (HD): 1280x720
    //screen_width = 1280;
    //screen_height = 720;

    //console.log("screen_width" + screen_width);
    //console.log("screen_height" + screen_height);







    // Actualizar la resolución interna del dispositivo gráfico

    //screen_width = ((screen_width * currentPixelRatio) / 4) * 3;
    //screen_height = ((screen_height * currentPixelRatio) / 4) * 3;


    //    this.app.resizeCanvas(screen_width, screen_height);
    //    this.app.setCanvasResolution(pc.RESOLUTION_AUTO, screen_width, screen_height);
    //    this.app.setCanvasFillMode(pc.FILLMODE_KEEP_ASPECT, screen_width, screen_height);



    //this.app.scene.lighting.debugLayer = this.app.scene.layers.getLayerByName("World").id;



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
    this.app.scene.root.addChild(this.mousePointer);
    this.mousePointer.setLocalRotation(0, 0, 0);
    this.mousePointer.setLocalScale(1, 1, 1);
    this.previousX = 0;
    this.previousY = 0;
    this.canvas = this.app.graphicsDevice.canvas;

    this.gameMouse_busy = false;
    this.gameMouseMoved = false;



    /*-----------*/
    /* keyboard  */
    /*-----------*/
    this.jumping_elapsedtime = 0;
    this.jumping_availability = true;













    /*******************************************************/
    /*
    /*    UPDATE CHARACTERS MOVEMENT
    /*
    /*******************************************************/
    this.updateCharactersMovementStep = 0;
    this.updateCharactersMovementAIStep = [0, 0];
    if (this.interv) {
        this.interval_accumul = 1;
        this.interval_time = 1000 / 60;
        this.interval_deltatime = this.interval_time;

        this.setInterval_busy = false;
        Timer.addTimer(0.016, this.setInterval, this, false);

    }


};

GameCharactersController.prototype.destroy = function () {
    alert("GameCharactersController destru  ");
}

GameCharactersController.prototype.setInterval = async function () {
    if (this.setInterval_busy) {
        this.interval_accumul++;

    } else {
        this.setInterval_busy = true;
        const startTime = performance.now();
        this.updateCharactersMovement();
        const endTime = performance.now();    // Toma el tiempo de finalización
        const elapsedTime = endTime - startTime;
        /*if (elapsedTime > 0.2) {
            Tracer("updateCharactersMovement", elapsedTime);
        }*/

        this.interval_accumul = 1;
        this.setInterval_busy = false;
    }
};





GameCharactersController.prototype.updateCharactersMovement = async function () {

    if (!this.updateCharactersMovement_busy) {
        this.updateCharactersMovement_busy = true;


        //Moves all characters:
        const characters = this.dividirArray(this.getCharacters())[this.updateCharactersMovementStep] || [],
            characters_length = characters.length;
        var i = 0;


        for (; i < characters_length; i++) {

            //visibleThisFrame
            if (characters[i].enabled) {
                const otherScript = characters[i].script.character

                if (otherScript) {
                    if (characters[i].isPlayer) {
                        characters[i].input = GameManager.input;
                    } else {
                        characters[i].input.dt = GameManager.input.dt;
                        if (this.updateCharactersMovementAIStep[this.updateCharactersMovementStep] === i) {
                            otherScript.doAI();
                        }
                    }
                    otherScript.doMove();
                }
            }
        }
        this.updateCharactersMovementAIStep[this.updateCharactersMovementStep]++;
        this.updateCharactersMovementStep++;


        if (this.updateCharactersMovementStep > 1) this.updateCharactersMovementStep = 0;
        if (this.updateCharactersMovementAIStep[this.updateCharactersMovementStep] > characters_length) this.updateCharactersMovementAIStep[this.updateCharactersMovementStep] = 0;

        /*Tracer(" ", this.updateCharactersMovementStep + "-" + this.updateCharactersMovementAIStep[0]);
        Tracer(" ", this.updateCharactersMovementStep + "-" + this.updateCharactersMovementAIStep[1]);
        Tracer("characters_length", characters_length);*/




        this.updateCharactersMovement_busy = false;
    } else {
        console.warn("updateCharactersMovement_busy = true");
        Trace("updateCharactersMovement_busy = true");
    }
}


GameCharactersController.prototype.dividirArray = function (arr) {
    const mitad = Math.ceil(arr.length / 2); // Si es impar, la mitad será el siguiente número entero
    const primeraMitad = arr.slice(0, mitad);  // Toma la primera mitad (inclusive hasta el punto medio)
    const segundaMitad = arr.slice(mitad);     // Toma la segunda mitad desde el punto medio

    return [primeraMitad, segundaMitad];
}




// update code called every frame
GameCharactersController.prototype.postUpdate = async function (dt) {

};


GameCharactersController.prototype.update = async function (dt) {
    if (!this.interv) {
        await this.updateCharactersMovement();
    }
    this.gameMouseMoved = false;
}


/// ------------------------------------------------------------
///FUNCTIONS
/// ------------------------------------------------------------
GameCharactersController.prototype.createAudioListener = function () {
    if (!this.audiolistener) {
        this.audiolistener = this.app.scene.root.addComponent("audiolistener");
    }
}


GameCharactersController.prototype.getCharacters = function () {

    if (!this.sceneCharacters) {
        this.sceneCharacters = this.app.scene.root.children.filter(function (char) {
            return (char.isCharacter)
        });
    }

    return this.sceneCharacters;
}

GameCharactersController.prototype.getSelectedCharacters = function () {
    const characters = this.getCharacters().filter(function (char) {
        return char.selected;
    });
    return characters;
}
GameCharactersController.prototype.getSelectableCharacters = function () {
    const characters = this.getCharacters().filter(function (char) {
        return char.isSelectable;
    });
    return characters;
}

GameCharactersController.prototype.getMainPlayer = function (characters) {
    const mainPlayer = this.getCharacters().find(function (char) {
        return char.isPlayer;
    });
    return mainPlayer;
}



GameCharactersController.prototype.showTextForEntity = function (entity, point) {

    if (!this.textEntity) {
        this.textEntity = new pc.Entity();
        this.app.scene.root.addChild(this.textEntity);

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

    if (!this.lensflareCamera.enabled) return;

    if (this.lensflareCamera.elapsedTime === 0) {
    }


    var i = 0,
        lights_length = this.lensflareCamera.lights.length;




    for (; i < lights_length; i++) {
        var lightEntity = this.lensflareCamera.lights[i];

        if (!lightEntity.lensFlarePlane) {
            lightEntity.lensFlarePlane = new pc.Entity();



            if (!this.lensflareCamera.material) {
                this.lensflareCamera.material = new pc.StandardMaterial();
                this.lensflareCamera.material.name = "lensflareMaterial";
                this.lensflareCamera.material.diffuseMap = this.lensflareCamera.texture.resource;
                this.lensflareCamera.material.opacityMap = this.lensflareCamera.texture.resource;
                this.lensflareCamera.material.opacityMapChannel = "r";
                this.lensflareCamera.material.opacity = 0.8;
                this.lensflareCamera.material.blendType = pc.BLEND_ADDITIVEALPHA; // Tipo de mezcla (puedes ajustar según tus necesidades)
                this.lensflareCamera.material.update();
            }




            lightEntity.lensFlarePlane.addComponent('element', {
                type: 'image', // Tipo de elemento: imagen
                anchor: [0.5, 0.5, 0.5, 0.5], // Anclajes para ajustar la posición y tamaño de la imagen
                pivot: [0.5, 0.5], // Pivote de la imagen
                width: 4, // Ancho de la imagen en píxeles
                height: 4, // Altura de la imagen en píxeles
                //opacity: 1, // Opacidad de la imagen (0 a 1)
                rect: [0, 0, 1, 1], // Rectángulo que define la región de la imagen (x, y, width, height)
                //materialAsset: this.lensflareCamera.material, // Asset de textura para la imagen (puede ser null)
                material: this.lensflareCamera.material, // Asset de textura para la imagen (puede ser null)
                layers: [pc.LAYERID_WORLD],
                //batchGroupId: this.lensflareCamera.batchGroup_lensflare_images.id
            });




            /*
                        lightEntity.lensFlarePlane.addComponent('render', {
                            type: 'plane', // Tipo de geometría (plano)
                            material: this.lensflareCamera.material,
                            isStatic: true,
                            layers: [pc.LAYERID_WORLD],
                            batchGroupId: this.lensflareCamera.batchGroup_lensflare_sphere.id,
                            normal: new pc.Vec3(0, -1, 0)
                        });
                        */

            this.app.scene.root.addChild(lightEntity.lensFlarePlane);
            lightEntity.lensFlarePlane.setPosition(lightEntity.getPosition().clone());
        }



        //var rotation = new pc.Quat().setFromMat4(this.camera.camera.viewMatrix).conjugate();
        var rotation = this.camera.getRotation();
        lightEntity.lensFlarePlane.setRotation(rotation);
        //lightEntity.lensFlarePlane.lookAt(this.camera.getPosition());



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

