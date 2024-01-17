var CharacterIA = pc.createScript('characterIA');


CharacterIA.attributes.add('circleRadius', {
    type: 'number',
    default: 1.0,
    title: 'Circle Radius'
});

// initialize code called once per entity
CharacterIA.prototype.initialize = function () {

};

//NEED TO VIEW THIS:
//https://playcanv.as/p/eURtMzzW/


// update code called every frame
CharacterIA.prototype.update = function (dt) {
    if (!this.entity.targetPoint) {
        this.createNewTarget()
    }
};

CharacterIA.prototype.createNewTarget = function () {
    // Generar un ángulo aleatorio en radianes
    var randomAngle = Math.random() * 2 * Math.PI,
        characterPosition = this.entity.getPosition(),

        randomPoint = new pc.Vec3(
            characterPosition.x + Math.cos(randomAngle) * this.circleRadius,
            characterPosition.y,
            characterPosition.z + Math.sin(randomAngle) * this.circleRadius
        ),

        gridSize = 1,
        // Redondea las coordenadas a la grilla
        gridX = Math.round(randomPoint.x / gridSize) * gridSize,
        gridY = Math.round(randomPoint.y / gridSize) * gridSize,
        gridZ = Math.round(randomPoint.z / gridSize) * gridSize;

    randomPoint = new pc.Vec3(gridX, gridY, gridZ);

    this.entity.targetPoint = randomPoint;

    /*
        if (this.pointEntity) {
            this.pointEntity.destroy();
        }
        this.pointEntity = new pc.Entity()
        this.pointEntity.addComponent('render', {
            type: 'sphere',
            radius: 0.05
        });
        this.pointEntity.setPosition(this.entity.targetPoint);
        this.app.root.addChild(this.pointEntity);
        */
}








// swap method called for script hot-reloading
// inherit your script state here
// CharacterIa.prototype.swap = function(old) { };

// to learn more about script anatomy, please read:
// https://developer.playcanvas.com/en/user-manual/scripting/