var FurnitureBehavior = pc.createScript('furnitureBehavior');

FurnitureBehavior.attributes.add('speed', {
    type: 'number',
    default: 5,
    title: 'Velocidad de la Puerta'
});

FurnitureBehavior.attributes.add('piece_0', {
    type: 'entity',
    title: 'piece_0',
    default: null
});
FurnitureBehavior.attributes.add('piece_0_type', {
    type: 'string',
    enum: [
        { 'door_x_axis': 'door_x_axis' },
        { 'door_y_axis': 'door_y_axis' },
        { 'door_z_axis': 'door_z_axis' },
        { 'drawer': 'drawer' },
        { 'none': 'none' }
    ],
    default: 'none',
    title: 'piece_0_type',
});




// initialize code called once per entity
FurnitureBehavior.prototype.initialize = function () {
    // Registra el evento de teclado para abrir y cerrar la puerta
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    this.umbral = 5;

    this.forniturePieces = [];
    for (var i = 0; i < 8; i++) {
        this.forniturePieces.push({
            entity: this["piece_" + i],
            type: this["piece_" + i + "_type"],
            state: "",
            do_action: "",
            last_rotation: pc.Vec3.ZERO,
            last_state: "",
            initial_position: this["piece_" + i] ? this["piece_" + i].getLocalPosition().clone() : pc.Vec3.ZERO,
            locked: false
        });
    }

    this.entity.on('forniture:doaction', function (do_action) {
        var fip = this.forniturePieces[eventParams.pieceID];
        fip.do_action = do_action || "";
        if (fip.do_action === "lock") {
            fip.locked = true;
        } else if (fip.do_action === "unlock") {
            fip.locked = false;
        }
    }, this);

};

// update code called every frame
FurnitureBehavior.prototype.update = function (dt) {
    var soundPrefix = "";
    for (var fi = 0; fi < 8; fi++) {
        fip = this.forniturePieces[fi];
        if (!(fip.entity)) continue;

        var currentRotation = pc.Vec3.ZERO;
        var currentPosition = pc.Vec3.ZERO;

        if (fip.do_action) {

            if (fip.type === "door_x_axis" || fip.type === "door_y_axis" || fip.type === "door_z_axis") {
                soundPrefix = "door";
                // Obtén el ángulo actual de rotación en el eje Y
                var currentRotation = fip.entity.getLocalEulerAngles();
                if (fip.type === "door_x_axis") currentRotation = currentRotation.x;
                if (fip.type === "door_y_axis") currentRotation = currentRotation.y;
                if (fip.type === "door_z_axis") currentRotation = currentRotation.z;

                var targetRotation = null;

                // Calcula el ángulo de rotación para abrir o cerrar la puerta
                if (fip.locked) fip.do_action = "close";
                switch (fip.do_action) {
                    case "open":
                        targetRotation = -90;
                        break;
                    case "close":
                        targetRotation = 0;
                        break;
                }


                // Interpola suavemente hacia el ángulo objetivo con la velocidad ajustada
                if (targetRotation !== null) {
                    var adjustedSpeed = this.speed * dt;
                    var newRotation = pc.math.lerp(currentRotation, targetRotation, adjustedSpeed);
                    // Aplica la nueva rotación a la puerta
                    if (fip.type === "door_x_axis") fip.entity.setLocalEulerAngles(newRotation, 0, 0);
                    if (fip.type === "door_y_axis") fip.entity.setLocalEulerAngles(0, newRotation, 0);
                    if (fip.type === "door_z_axis") fip.entity.setLocalEulerAngles(0, 0, newRotation);
                }

                // Verifica si la puerta está en movimiento dentro del umbral
                var isMoving = Math.abs(newRotation - fip.last_rotation) > this.umbral;


                // Si la puerta está en movimiento, determina la dirección
                if (isMoving) {
                    fip.state = (currentRotation > fip.last_rotation) ? 'closing' : 'opening';
                }
                if (Math.abs(currentRotation - 0) < this.umbral) {
                    fip.state = "closed";

                }
                if (Math.abs(currentRotation - (-90)) < this.umbral) {
                    fip.state = "opened";
                }

                fip.last_rotation = currentRotation;
            }

            /* DRAWER */
            if (fip.type === "drawer") {
                soundPrefix = "drawer";
                // Obtén la posición actual del cajón
                var currentPosition = fip.entity.getLocalPosition();
                var newPosition = currentPosition.clone();

                // Calcula la posición de destino para mover el cajón hacia adelante o hacia atrás
                var targetPosition = null;

                // Establece la distancia deseada (0.5 metro)
                var distance = 0.5;

                // Calcula la posición de destino para mover hacia adelante o hacia atrás
                switch (fip.do_action) {
                    case "open":
                        targetPosition = new pc.Vec3(fip.initial_position.x - distance, fip.initial_position.y, fip.initial_position.z);
                        break;
                    case "close":
                        targetPosition = new pc.Vec3(fip.initial_position.x, fip.initial_position.y, fip.initial_position.z);
                        break;
                }


                // Interpola suavemente hacia la posición objetivo con la velocidad ajustada
                if (targetPosition !== null) {
                    var adjustedSpeed = this.speed * dt;
                    newPosition = new pc.Vec3().lerp(currentPosition, targetPosition, adjustedSpeed);
                    // Aplica la nueva posición al cajón
                    fip.entity.setLocalPosition(newPosition);
                }

                // Verifica si la puerta está en movimiento dentro del umbral
                var isMoving = Math.abs(newPosition - fip.last_position) > this.umbral;


                // Si la puerta está en movimiento, determina la dirección
                if (isMoving) {
                    fip.state = (newPosition.x > fip.last_position.x) ? 'closing' : 'opening';
                }

                // Verifica si el cajón está cerrado o abierto
                if (Math.abs(newPosition.x - fip.initial_position.x) < this.umbral / 100) {
                    fip.state = "closed";
                }
                if (Math.abs(newPosition.x - (fip.initial_position.x - distance)) < this.umbral / 100) {
                    fip.state = "opened";
                }
                fip.last_position = currentPosition;

            }
        }


        /* ************************************************ */
        if (fip.state !== fip.last_state) {
            if (this.entity.sound) {
                this.entity.sound.stop();
                this.entity.sound.play(soundPrefix + "_" + fip.state);
            }
        }

        //    Trace(this.doorstate_01);



        fip.last_state = fip.state;
    }
};


// Función para abrir la puerta
FurnitureBehavior.prototype.openDoor = function (pieceNumber) {
    this.forniturePieces[pieceNumber].do_action = "open";
};

// Función para cerrar la puerta
FurnitureBehavior.prototype.closeDoor = function (pieceNumber) {
    this.forniturePieces[pieceNumber].do_action = "close";
};

// Función para manejar el evento de teclado
FurnitureBehavior.prototype.onKeyDown = function (event) {
    // Si se presiona la tecla 'O', abre la puerta
    if (event.key === pc.KEY_O) {
        this.openDoor(0);
    }

    // Si se presiona la tecla 'C', cierra la puerta
    if (event.key === pc.KEY_C) {
        this.closeDoor(0);
    }
};
