var NanoBot = pc.createScript('nanoBot');

// initialize code called once per entity
NanoBot.prototype.initialize = function () {

};

// update code called every frame
NanoBot.prototype.update = function (dt) {
    if (GameManager.checkForPlayerAndTargetEntities) return;


    const speed = GameManager.playerEntity.rigidbody.linearVelocity.length();
    const roundedSpeed = Math.ceil(speed * 100) / 100;
    GameManager.setHudParameter("linearVelocity", roundedSpeed.toFixed(2));



};
