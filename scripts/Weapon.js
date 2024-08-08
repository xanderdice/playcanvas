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

Weapon.attributes.add('ccd',
    {
        title: "ccd",
        type: 'json',
        schema: [
            {
                name: "motionThreshold",
                type: "number",
                default: 1,
                title: "Motion Threshold",
                description: "Number of meters moved in one frame before CCD is enabled"
            }, {
                name: "sweptSphereRadius",
                type: "number",
                default: .2,
                title: "Swept Sphere Radius",
                description: "This should be below the half extent of the collision volume. E.g For an object of dimensions 1 meter, try 0.2"
            }, {
                name: "contactProcessingThreshold",
                type: "number",
                default: 0,
                title: "Contact Processing Threshold",
                description: 'The constraint solver can discard solving contacts, if the distance is above this threshold. 0 by default. \n Note that using contacts with positive distance can improve stability. It increases, however, the chance of colliding with degerate contacts, such as "interior" triangle edges'
            }
        ]
    });



// initialize code called once per entity
Weapon.prototype.initialize = function () {

    var rigid = this.entity.findComponent("rigidbody");
    if (rigid) {
        var ccd;
        (ccd = rigid.body).setCcdMotionThreshold(this.ccd.motionThreshold);
        ccd.setCcdSweptSphereRadius(this.ccd.sweptSphereRadius);
        ccd.setContactProcessingThreshold(this.ccd.contactProcessingThreshold);
    }


    var r = this.entity.findComponent("render");
    if (r) {
        this.entity.renderEntity = r.entity;
        this.entity.renderEntity.tags.add("uranus-instancing-exclude");
        this.entity.renderEntity.tags.add("ignore-camera-collision");
        this.entity.renderEntity.tags.add("is-weapon");
        this.entity.renderEntity.tags.add("is-detectable");
    }

}
// update code called every frame
Weapon.prototype.update = function (dt) {

};
