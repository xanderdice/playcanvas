var Ccd = pc.createScript("ccd");
Ccd.attributes.add("motionThreshold", {
    type: "number",
    default: 1,
    title: "Motion Threshold",
    description: "Number of meters moved in one frame before CCD is enabled"
});
Ccd.attributes.add("sweptSphereRadius", {
    type: "number",
    default: .2,
    title: "Swept Sphere Radius",
    description: "This should be below the half extent of the collision volume. E.g For an object of dimensions 1 meter, try 0.2"
});
Ccd.attributes.add("contactProcessingThreshold", {
    type: "number",
    default: 0,
    title: "Contact Processing Threshold",
    description: 'The constraint solver can discard solving contacts, if the distance is above this threshold. 0 by default. \n Note that using contacts with positive distance can improve stability. It increases, however, the chance of colliding with degerate contacts, such as "interior" triangle edges'
});
Ccd.attributes.add("fixedTimeStep", {
    type: "number",
    default: 0,
    title: "Fixed Time Step",
    description: "Physics fixed time step, the number of times the physics engine step refreshes per second, changing this to more then 60 can effect performance"
});
Ccd.prototype.initialize = function () {
    var e;
    this.fixedTimeStep > 0 && (this.app.systems.rigidbody.fixedTimeStep = 1 / this.fixedTimeStep),
        (e = this.entity.rigidbody.body).setCcdMotionThreshold(this.motionThreshold),
        e.setCcdSweptSphereRadius(this.sweptSphereRadius),
        e.setContactProcessingThreshold(this.contactProcessingThreshold),
        this.on("attr:motionThreshold", (function (t, i) {
            (e = this.entity.rigidbody.body).setCcdMotionThreshold(t)
        }
        )),
        this.on("attr:sweptSphereRadius", (function (t, i) {
            (e = this.entity.rigidbody.body).setCcdSweptSphereRadius(t)
        }
        )),
        this.on("attr:contactProcessingThreshold", (function (t, i) {
            (e = this.entity.rigidbody.body).setContactProcessingThreshold(t)
        }
        ))
};