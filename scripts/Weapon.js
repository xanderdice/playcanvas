var Weapon = pc.createScript('weapon');
Weapon.attributes.add('weaponType',
    {
        type: 'string', enum: [
            { "sword": "sword" },
            { "torch": "torch" },
            { "shield": "shield" },
            { "gun": "gun" },
            { "none": "none" }],
        default: "sword"
    });

// initialize code called once per entity
Weapon.prototype.initialize = function () {

    this.entity.isWeapon = true;
    this.entity.tags.add("weapon");
    this.entity.tags.add("is-detectable");

    var r = this.entity.findComponent("render");
    if (r) {
        this.entity.renderEntity = r.entity;
        this.entity.renderEntity.tags.add("uranus-instancing-exclude");
        this.entity.renderEntity.tags.add("ignore-camera-collision");
    }

}
// update code called every frame
Weapon.prototype.update = function (dt) {

};
