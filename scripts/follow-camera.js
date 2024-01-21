/*
ATENCION:
REQUIERE QUE GameCharactersController.js este instalado en la entidad ROOT.

poner este script en la camara. la camara debe estar en el root.


*/

var FollowCamera = pc.createScript('followCamera');

FollowCamera.attributes.add('target', {
    type: 'entity',
    title: 'Target',
    description: 'The target entity to follow'
});



FollowCamera.attributes.add('cameraOffset', {
    type: 'vec3',
    default: [0, 5, -10],
    title: 'Camera Offset',
    description: 'The local space offset with respect to the target entity coordinate system'
});
FollowCamera.attributes.add('lerpAmount', {
    type: 'number',
    min: 0,
    max: 1,
    default: 0.99,
    title: 'Lerp Amount',
    description: 'The amount to lerp the camera towards its desired position over time. The closer it is to 1, the faster the camera will move. Lerping is frame rate independent and will be correct for every frame rate.'
});



// initialize code called once per entity
FollowCamera.prototype.initialize = function () {
    this.entity.setRotation(pc.Vec3.ZERO);
    this.targetPos = new pc.Vec3();
    this.matrix = new pc.Mat4();
    this.quat = new pc.Quat();
    this.vec = new pc.Vec3();
    this.cameraPitchRotation = 0;
    this.cameraPitch_busy = false;
    this.playerPersonStyle = (this.app.gameConfig || {}).playerPersonStyle;

    if (this.target) {
        if (this.target.isCharacter) {
            console.error("Camera can not set directly to the character entity. you need create a target entity and set it as child of the main character entity.");
            return;
        }

        this.updateTargetPosition();
        this.currentPos = this.targetPos.clone();

        if (this.playerPersonStyle === "FirstPerson") {
            this.cameraOffset = pc.Vec3.ZERO;
            this.lerpAmount = 1;

            this.entity.on('camera:pitch', function (eventLook) {
                if (!this.cameraPitch_busy) {
                    this.cameraPitch_busy = true;

                    var deltaY = (eventLook.deltaY || 0) * (eventLook.lookSpeed || 1);

                    var pitch = -deltaY;
                    this.cameraPitchRotation += pitch;
                    this.cameraPitchRotation = pc.math.clamp(this.cameraPitchRotation, -90, 80);

                    this.cameraPitch_busy = false;
                }
            }, this);

        }

    } else {
        this.currentPos = this.entity.getPosition().clone();
    }
};

FollowCamera.prototype.updateTargetPosition = function () {

    // Calculate the target's angle around the world Y axis
    var forward = this.target.forward;
    this.vec.set(-forward.x, 0, -forward.z).normalize();
    var angle = Math.atan2(this.vec.x, this.vec.z) * 180 / Math.PI;

    // Rebuild the world transform for the target with a rotation limited to the world y axis
    this.quat.setFromEulerAngles(0, angle, 0);
    this.matrix.setTRS(this.target.getPosition(), this.quat, pc.Vec3.ONE);


    // Calculate the desired camera position in world space
    this.matrix.transformPoint(this.cameraOffset, this.targetPos);


};

// update code called every frame
FollowCamera.prototype.postUpdate = function (dt) {
    if (this.target) {
        // Calculate where we want the camera to be
        this.updateTargetPosition();

        // Lerp the current camera position to where we want it to be
        // Note that the lerping is framerate independent
        // From: https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
        if (this.lerpAmount === 1) {
            this.currentPos = this.targetPos;
        } else {
            this.currentPos.lerp(this.currentPos, this.targetPos, 1 - Math.pow(1 - this.lerpAmount, dt));
        }

        // Set the camera's position
        this.entity.setPosition(this.currentPos);

        if (this.playerPersonStyle === "FirstPerson") {
            var targetRotation = this.target.getRotation();  // Obtener la rotación como cuaternión

            // Crear un cuaternión para la rotación en el eje X
            var pitchRotation = new pc.Quat();
            pitchRotation.setFromEulerAngles(this.cameraPitchRotation, 0, 0);

            // Multiplicar la rotación original por el pitchRotation
            targetRotation.mul(pitchRotation);

            // Aplicar la rotación resultante a la cámara
            this.entity.setRotation(targetRotation);
        } else {
            this.entity.lookAt(this.target.getPosition());
        }

    }
};
