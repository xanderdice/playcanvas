var CharacterIA = pc.createScript('characterIA');

// initialize code called once per entity
CharacterIA.prototype.initialize = function () {

};

// update code called every frame
CharacterIA.prototype.doIA = function (input, dt) {

    if (this.targetPosition) {
        const currentPos = this.entity.getPosition();
        const direction = this.targetPosition.clone().sub(currentPos).normalize();


        input.x = direction.x;
        input.z = direction.z;
    }



    return input;
};
