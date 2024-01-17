//
// UTILS
//
function getOrthogonalVectors(n, p, q) {
    // From the Bullet sourcebase. See btPlaneSpace1.
    // Generate two suitable orthogonal vectors to n.
    var a, k;
    if (Math.abs(n.z) > 0.7071067811865475244008443621048490) {
        // choose p in y-z plane
        a = n.y * n.y + n.z * n.z;
        k = 1 / Math.sqrt(a);
        p.x = 0;
        p.y = -n.z * k;
        p.z = n.y * k;
        // set q = n x p
        q.x = a * k;
        q.y = -n.x * p.z;
        q.z = n.x * p.y;
    } else {
        // choose p in x-y plane
        a = n.x * n.x + n.y * n.y;
        k = 1 / Math.sqrt(a);
        p.x = -n.y * k;
        p.y = n.x * k;
        p.z = 0;
        // set q = n x p
        q.x = -n.z * p.y;
        q.y = n.z * p.x;
        q.z = a * k;
    }
}


//
// PointToPointConstraint
//
var PointToPointConstraint = pc.createScript('pointToPointConstraint');

PointToPointConstraint.attributes.add('pivotA', {
    title: 'Pivot',
    description: 'Position of the constraint in the local space of this entity.',
    type: 'vec3',
    default: [0, 0, 0]
});
PointToPointConstraint.attributes.add('entityB', {
    title: 'Connected Entity',
    description: 'Optional second entity',
    type: 'entity'
});
PointToPointConstraint.attributes.add('pivotB', {
    title: 'Connected Pivot',
    description: 'Position of the constraint in the local space of entity B (if specified).',
    type: 'vec3',
    default: [0, 0, 0]
});
PointToPointConstraint.attributes.add('breakingThreshold', {
    title: 'Break Threshold',
    description: 'Maximum breaking impulse threshold required to break the constraint.',
    type: 'number',
    default: 3.4e+38
});
PointToPointConstraint.attributes.add('enableCollision', {
    title: 'Enable Collision',
    description: 'Enable collision between linked rigid bodies.',
    type: 'boolean',
    default: true
});
PointToPointConstraint.attributes.add('debugRender', {
    title: 'Debug Render',
    description: 'Enable to render a representation of the constraint.',
    type: 'boolean',
    default: false
});
PointToPointConstraint.attributes.add('debugColor', {
    title: 'Debug Color',
    description: 'The color of the debug rendering of the constraint.',
    type: 'rgb',
    default: [1, 0, 0]
});

// initialize code called once per entity
PointToPointConstraint.prototype.initialize = function() {
    this.createConstraint();

    this.on('attr', function(name, value, prev) {
        // If any constraint properties change, recreate the constraint
        if (name === 'pivotA' || name === 'entityB' || name === 'pivotB') {
            this.createConstraint();
        } else if (name === 'breakingThreshold') {
            this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);
            this.activate();
        }
    });
    this.on('enable', function () {
        this.createConstraint();
    });
    this.on('disable', function () {
        this.destroyConstraint();
    });
    this.on('destroy', function () {
        this.destroyConstraint();
    });
};

PointToPointConstraint.prototype.createConstraint = function() {
    if (this.constraint) {
        this.destroyConstraint();
    }

    var bodyA = this.entity.rigidbody.body;
    var pivotA = new Ammo.btVector3(this.pivotA.x, this.pivotA.y, this.pivotA.z);
    if (this.entityB && this.entityB.rigidbody) {
        var bodyB = this.entityB.rigidbody.body;
        var pivotB = new Ammo.btVector3(this.pivotB.x, this.pivotB.y, this.pivotB.z);
        this.constraint = new Ammo.btPoint2PointConstraint(bodyA, bodyB, pivotA, pivotB);
    } else {
        this.constraint = new Ammo.btPoint2PointConstraint(bodyA, pivotA);
    }

    var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
    dynamicsWorld.addConstraint(this.constraint, !this.enableCollision);
    
    this.activate();
};

PointToPointConstraint.prototype.destroyConstraint = function() {
    if (this.constraint) {
        var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
        dynamicsWorld.removeConstraint(this.constraint);
        Ammo.destroy(this.constraint);
        this.constraint = null;
    }
};

PointToPointConstraint.prototype.activate = function() {
    this.entity.rigidbody.activate();
    if (this.entityB) {
        this.entityB.rigidbody.activate();
    }
};

// update code called every frame
PointToPointConstraint.prototype.update = function(dt) {
    if (this.debugRender) {
        // Note that it's generally bad to allocate new objects in an update function
        // but this is just for debug rendering and will normally be disabled
        var tempVecA = new pc.Vec3();
        this.entity.getWorldTransform().transformPoint(this.pivotA, tempVecA);
        this.app.renderLine(this.entity.getPosition(), tempVecA, this.debugColor);
        if (this.entityB) {
            this.app.renderLine(this.entityB.getPosition(), tempVecA, this.debugColor);
        }
    }
};


//
// HingeConstraint
//
var HingeConstraint = pc.createScript('hingeConstraint');

HingeConstraint.attributes.add('pivotA', {
    title: 'Pivot',
    description: 'Position of the constraint in the local space of this entity.',
    type: 'vec3',
    default: [0, 0, 0]
});
HingeConstraint.attributes.add('axisA', {
    title: 'Axis',
    description: 'Axis of rotation of the constraint in the local space this entity.',
    type: 'vec3',
    default: [0, 1, 0]
});
HingeConstraint.attributes.add('entityB', {
    title: 'Connected Entity',
    description: 'Optional second connected entity.',
    type: 'entity'
});
HingeConstraint.attributes.add('pivotB', {
    title: 'Connected Pivot',
    description: 'Position of the constraint in the local space of the connected entity (if specified).',
    type: 'vec3',
    default: [0, 0, 0]
});
HingeConstraint.attributes.add('axisB', {
    title: 'Connected Axis',
    description: 'Axis of rotation of the constraint in the local space of the connected entity (if specified).',
    type: 'vec3',
    default: [0, 1, 0]
});
HingeConstraint.attributes.add('limits', {
    title: 'Limits',
    description: 'Low and high angular limits for the constraint in degrees. By default, low is greater than high meaning no limits.',
    type: 'vec2',
    default: [1, -1]
});
HingeConstraint.attributes.add('softness', {
    title: 'Softness',
    description: 'Softness of the constraint. Recommend 0.8 to 1. Describes the percentage of limits where movement is free. Beyond this softness percentage, the limit is gradually enforced until the "hard" (1.0) limit is reached.',
    type: 'number',
    min: 0,
    max: 1,
    default: 0.9
});
HingeConstraint.attributes.add('biasFactor', {
    title: 'Bias Factor',
    description: 'Bias factor of the constraint. Recommend 0.3 +/- approximately 0.3. Strength with which constraint resists zeroth order (angular, not angular velocity) limit violation.',
    type: 'number',
    min: 0,
    max: 1,
    default: 0.3
});
HingeConstraint.attributes.add('relaxationFactor', {
    title: 'Relaxation Factor',
    description: 'Relaxation factor of the constraint. Recommend to keep this near 1. The lower the value, the less the constraint will fight velocities which violate the angular limits.',
    type: 'number',
    min: 0,
    max: 1,
    default: 1
});
HingeConstraint.attributes.add('enableMotor', {
    title: 'Use Motor',
    description: 'Enable a motor to power the automatic rotation around the hinge axis.',
    type: 'boolean',
    default: false
});
HingeConstraint.attributes.add('motorTargetVelocity', {
    title: 'Target Velocity',
    description: 'Target motor angular velocity.',
    type: 'number',
    default: 0
});
HingeConstraint.attributes.add('maxMotorImpulse', {
    title: 'Max Motor Impulse',
    description: 'Maximum motor impulse.',
    type: 'number',
    default: 0
});
HingeConstraint.attributes.add('breakingThreshold', {
    title: 'Break Threshold',
    description: 'Maximum breaking impulse threshold required to break the constraint.',
    type: 'number',
    default: 3.4e+38
});
HingeConstraint.attributes.add('enableCollision', {
    title: 'Enable Collision',
    description: 'Enable collision between linked rigid bodies.',
    type: 'boolean',
    default: true
});
HingeConstraint.attributes.add('debugRender', {
    title: 'Debug Render',
    description: 'Enable to render a representation of the constraint.',
    type: 'boolean',
    default: false
});
HingeConstraint.attributes.add('debugColor', {
    title: 'Debug Color',
    description: 'The color of the debug rendering of the constraint.',
    type: 'rgb',
    default: [1, 0, 0]
});

// initialize code called once per entity
HingeConstraint.prototype.initialize = function() {
    this.createConstraint();

    this.on('attr', function(name, value, prev) {
        // If any constraint properties change, recreate the constraint
        if (name === 'pivotA' || name === 'axisA' || name === 'entityB' || name === 'pivotB' || name === 'axisB') {
            this.createConstraint();
        } else if (name === 'limits' || name === 'softness' || name === 'biasFactor' || name === 'relaxationFactor') {
            // setLimit takes angles in radians
            var low = this.limits.x * Math.PI / 180;
            var high = this.limits.y * Math.PI / 180;
            this.constraint.setLimit(low, high, this.softness, this.biasFactor, this.relaxationFactor);
            this.activate();
        } else if (name === 'enableMotor' || name === 'motorTargetVelocity' || name === 'maxMotorImpulse') {
            this.constraint.enableAngularMotor(this.enableMotor, this.motorTargetVelocity * Math.PI / 180, this.maxMotorImpulse);
            this.activate();
        } else if (name === 'breakingThreshold') {
            this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);
            this.activate();
        }
    });
    this.on('enable', function () {
        this.createConstraint();
    });
    this.on('disable', function () {
        this.destroyConstraint();
    });
    this.on('destroy', function () {
        this.destroyConstraint();
    });
};

HingeConstraint.prototype.createConstraint = function() {
    if (this.constraint) {
        this.destroyConstraint();
    }

    var v1 = new pc.Vec3();
    var v2 = new pc.Vec3();
    var q = new pc.Quat();
    var m = new pc.Mat4();

    var bodyA = this.entity.rigidbody.body;
    var pivotA = new Ammo.btVector3(this.pivotA.x, this.pivotA.y, this.pivotA.z);

    getOrthogonalVectors(this.axisA, v1, v2);
    m.set([
        v1.x, v1.y, v1.z, 0,
        v2.x, v2.y, v2.z, 0,
        this.axisA.x, this.axisA.y, this.axisA.z, 0,
        0, 0, 0, 1
    ]);
    q.setFromMat4(m);

    var quatA = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
    var frameA = new Ammo.btTransform(quatA, pivotA);

    if (this.entityB && this.entityB.rigidbody) {
        var bodyB = this.entityB.rigidbody.body;
        var pivotB = new Ammo.btVector3(this.pivotB.x, this.pivotB.y, this.pivotB.z);

        getOrthogonalVectors(this.axisB, v1, v2);
        m.set([
            v1.x, v1.y, v1.z, 0,
            v2.x, v2.y, v2.z, 0,
            this.axisB.x, this.axisB.y, this.axisB.z, 0,
            0, 0, 0, 1
        ]);
        q.setFromMat4(m);

        var quatB = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
        var frameB = new Ammo.btTransform(quatB, pivotB);

        this.constraint = new Ammo.btHingeConstraint(bodyA, bodyB, frameA, frameB, false);

        Ammo.destroy(frameB);
        Ammo.destroy(quatB);
        Ammo.destroy(pivotB);
    } else {
        this.constraint = new Ammo.btHingeConstraint(bodyA, frameA, false);
    }

    var low = this.limits.x * Math.PI / 180;
    var high = this.limits.y * Math.PI / 180;
    this.constraint.setLimit(low, high, this.softness, this.biasFactor, this.relaxationFactor);
    this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);
    this.constraint.enableAngularMotor(this.enableMotor, this.motorTargetVelocity * Math.PI / 180, this.maxMotorImpulse);

    Ammo.destroy(frameA);
    Ammo.destroy(quatA);
    Ammo.destroy(pivotA);

    var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
    dynamicsWorld.addConstraint(this.constraint, !this.enableCollision);

    this.activate();
};

HingeConstraint.prototype.destroyConstraint = function() {
    if (this.constraint) {
        var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
        dynamicsWorld.removeConstraint(this.constraint);
        Ammo.destroy(this.constraint);
        this.constraint = null;
    }
};

HingeConstraint.prototype.activate = function() {
    this.entity.rigidbody.activate();
    if (this.entityB) {
        this.entityB.rigidbody.activate();
    }
};

// update code called every frame
HingeConstraint.prototype.update = function(dt) {
    if (this.debugRender) {
        // Note that it's generally bad to allocate new objects in an update function
        // but this is just for debug rendering and will normally be disabled
        var tempVecA = new pc.Vec3();
        var tempVecB = new pc.Vec3();
        var tempVecC = new pc.Vec3();
        var tempVecD = new pc.Vec3();
        var worldTransform = this.entity.getWorldTransform();
        worldTransform.transformPoint(this.pivotA, tempVecA);
        worldTransform.transformVector(this.axisA, tempVecB);

        tempVecB.normalize().scale(0.5);
        tempVecC.add2(tempVecA, tempVecB);
        tempVecD.sub2(tempVecA, tempVecB);

        this.app.renderLine(this.entity.getPosition(), tempVecA, this.debugColor);
        this.app.renderLine(tempVecC, tempVecD, this.debugColor);

        if (this.entityB) {
            this.app.renderLine(this.entityB.getPosition(), tempVecA, this.debugColor);
        }
    }
};


//
// ConeTwistConstraint
//
/*
Overview:

btConeTwistConstraint can be used to simulate ragdoll joints (upper arm, leg etc).
It is a fixed translation, 3 degree-of-freedom (DOF) rotational "joint".
It divides the 3 rotational DOFs into swing (movement within a cone) and twist.
Swing is divided into swing1 and swing2 which can have different limits, giving an elliptical shape.
(Note: the cone's base isn't flat, so this ellipse is "embedded" on the surface of a sphere.)

In the contraint's frame of reference:
twist is along the x-axis,
and swing 1 and 2 are along the z and y axes respectively.
*/
var ConeTwistConstraint = pc.createScript('coneTwistConstraint');

ConeTwistConstraint.attributes.add('pivotA', {
    title: 'Pivot',
    description: 'Position of the constraint in the local space of this entity.',
    type: 'vec3',
    default: [0, 0, 0]
});
ConeTwistConstraint.attributes.add('axisA', {
    title: 'Axis',
    description: 'Axis of rotation of the constraint in the local space this entity.',
    type: 'vec3',
    default: [0, 1, 0]
});
ConeTwistConstraint.attributes.add('entityB', {
    title: 'Connected Entity',
    description: 'Optional second connected entity.',
    type: 'entity'
});
ConeTwistConstraint.attributes.add('pivotB', {
    title: 'Connected Pivot',
    description: 'Position of the constraint in the local space of the connected entity (if specified).',
    type: 'vec3',
    default: [0, 0, 0]
});
ConeTwistConstraint.attributes.add('axisB', {
    title: 'Connected Axis',
    description: 'Axis of rotation of the constraint in the local space of the connected entity (if specified).',
    type: 'vec3',
    default: [0, 1, 0]
});
ConeTwistConstraint.attributes.add('swingSpan1', {
    title: 'Swing 1 Limit',
    description: 'The Swing 1 Limit limits the rotation around the swing axis. Swing 1 Limit limits an axis of rotation orthogonal to the twist axis and Swing Limit 2. The limit angle is symmetric. Therefore, a value of 20 will limit the rotation between -20 and 20 degrees.',
    type: 'number',
    default: 1e+30
});
ConeTwistConstraint.attributes.add('swingSpan2', {
    title: 'Swing 2 Limit',
    description: 'The Swing 2 Limit limits the rotation around the swing axis. Swing 2 Limit limits an axis of rotation orthogonal to the twist axis and Swing Limit 1. The limit angle is symmetric. Therefore, a value of 20 will limit the rotation between -20 and 20 degrees.',
    type: 'number',
    default: 1e+30
});
ConeTwistConstraint.attributes.add('twistSpan', {
    title: 'Twist Limit',
    description: 'The Twist Limit limits the rotation around the twist axis. The limit angle is symmetric. Therefore, a value of 20 will limit the twist rotation between -20 and 20 degrees.',
    type: 'number',
    default: 1e+30
});
ConeTwistConstraint.attributes.add('breakingThreshold', {
    title: 'Break Threshold',
    description: 'Maximum breaking impulse threshold required to break the constraint.',
    type: 'number',
    default: 1e+30
});
ConeTwistConstraint.attributes.add('enableCollision', {
    title: 'Enable Collision',
    description: 'Enable collision between linked rigid bodies.',
    type: 'boolean',
    default: true
});
ConeTwistConstraint.attributes.add('debugRender', {
    title: 'Debug Render',
    description: 'Enable to render a representation of the constraint.',
    type: 'boolean',
    default: false
});
ConeTwistConstraint.attributes.add('debugColor', {
    title: 'Debug Color',
    description: 'The color of the debug rendering of the constraint.',
    type: 'rgb',
    default: [1, 0, 0]
});

// initialize code called once per entity
ConeTwistConstraint.prototype.initialize = function() {
    this.createConstraint();

    this.on('attr', function(name, value, prev) {
        // If any constraint properties change, recreate the constraint
        if (name === 'pivotA' || name === 'axisA' || name === 'entityB' || name === 'pivotB' || name === 'axisB') {
            this.createConstraint();
        } else if (name === 'swingSpan1') {
            this.constraint.setLimit(5, this.swingSpan1 * Math.PI / 180);
            this.activate();
        } else if (name === 'swingSpan2') {
            this.constraint.setLimit(4, this.swingSpan2 * Math.PI / 180);
            this.activate();
        } else if (name === 'twistSpan') {
            this.constraint.setLimit(3, this.twistSpan * Math.PI / 180);
            this.activate();
        } else if (name === 'breakingThreshold') {
            this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);
            this.activate();
        }
    });
    this.on('enable', function () {
        this.createConstraint();
    });
    this.on('disable', function () {
        this.destroyConstraint();
    });
    this.on('destroy', function () {
        this.destroyConstraint();
    });
};

ConeTwistConstraint.prototype.createConstraint = function() {
    if (this.constraint) {
        this.destroyConstraint();
    }

    var v1 = new pc.Vec3();
    var v2 = new pc.Vec3();
    var q = new pc.Quat();
    var m = new pc.Mat4();

    var bodyA = this.entity.rigidbody.body;
    var pivotA = new Ammo.btVector3(this.pivotA.x, this.pivotA.y, this.pivotA.z);

    getOrthogonalVectors(this.axisA, v1, v2);
    m.set([
        v1.x, v1.y, v1.z, 0,
        v2.x, v2.y, v2.z, 0,
        this.axisA.x, this.axisA.y, this.axisA.z, 0,
        0, 0, 0, 1
    ]);
    q.setFromMat4(m);

    var quatA = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
    var frameA = new Ammo.btTransform(quatA, pivotA);

    if (this.entityB && this.entityB.rigidbody) {
        var bodyB = this.entityB.rigidbody.body;
        var pivotB = new Ammo.btVector3(this.pivotB.x, this.pivotB.y, this.pivotB.z);

        getOrthogonalVectors(this.axisB, v1, v2);
        m.set([
            v1.x, v1.y, v1.z, 0,
            v2.x, v2.y, v2.z, 0,
            this.axisB.x, this.axisB.y, this.axisB.z, 0,
            0, 0, 0, 1
        ]);
        q.setFromMat4(m);

        var quatB = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
        var frameB = new Ammo.btTransform(quatB, pivotB);

        this.constraint = new Ammo.btConeTwistConstraint(bodyA, bodyB, frameA, frameB);

        Ammo.destroy(frameB);
        Ammo.destroy(quatB);
        Ammo.destroy(pivotB);
    } else {
        this.constraint = new Ammo.btConeTwistConstraint(bodyA, frameA);
    }

    this.constraint.setLimit(3, this.twistSpan * Math.PI / 180);
    this.constraint.setLimit(4, this.swingSpan2 * Math.PI / 180);
    this.constraint.setLimit(5, this.swingSpan1 * Math.PI / 180);
    this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);

    Ammo.destroy(frameA);
    Ammo.destroy(quatA);
    Ammo.destroy(pivotA);

    var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
    dynamicsWorld.addConstraint(this.constraint, !this.enableCollision);

    this.activate();
};

ConeTwistConstraint.prototype.destroyConstraint = function() {
    if (this.constraint) {
        var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
        dynamicsWorld.removeConstraint(this.constraint);
        Ammo.destroy(this.constraint);
        this.constraint = null;
    }
};

ConeTwistConstraint.prototype.activate = function() {
    this.entity.rigidbody.activate();
    if (this.entityB) {
        this.entityB.rigidbody.activate();
    }
};

// update code called every frame
ConeTwistConstraint.prototype.update = function(dt) {
    if (this.debugRender) {
        this.app.renderLine(this.entity.getPosition(), pc.Vec3.ZERO, this.debugColor);
    }
};


//
// SliderConstraint
//
var SliderConstraint = pc.createScript('sliderConstraint');

SliderConstraint.attributes.add('pivotA', {
    title: 'Pivot',
    description: 'Position of the constraint in the local space of this entity.',
    type: 'vec3',
    default: [0, 0, 0]
});
SliderConstraint.attributes.add('axisA', {
    title: 'Axis',
    description: 'Axis of rotation of the constraint in the local space this entity.',
    type: 'vec3',
    default: [0, 1, 0]
});
SliderConstraint.attributes.add('entityB', {
    title: 'Connected Entity',
    description: 'Optional second connected entity.',
    type: 'entity'
});
SliderConstraint.attributes.add('pivotB', {
    title: 'Connected Pivot',
    description: 'Position of the constraint in the local space of the connected entity (if specified).',
    type: 'vec3',
    default: [0, 0, 0]
});
SliderConstraint.attributes.add('axisB', {
    title: 'Connected Axis',
    description: 'Axis of rotation of the constraint in the local space of the connected entity (if specified).',
    type: 'vec3',
    default: [0, 1, 0]
});
SliderConstraint.attributes.add('linearLimits', {
    title: 'Linear Limits',
    description: 'Linear limits of the constraint.',
    type: 'vec2',
    default: [1, -1]
});
SliderConstraint.attributes.add('angularLimits', {
    title: 'Angular Limits',
    description: 'Angular limits of the constraint.',
    type: 'vec2',
    default: [0, 0]
});
SliderConstraint.attributes.add('breakingThreshold', {
    title: 'Break Threshold',
    description: 'Maximum breaking impulse threshold required to break the constraint.',
    type: 'number',
    default: 1e+30
});
SliderConstraint.attributes.add('enableCollision', {
    title: 'Enable Collision',
    description: 'Enable collision between linked rigid bodies.',
    type: 'boolean',
    default: true
});
SliderConstraint.attributes.add('debugRender', {
    title: 'Debug Render',
    description: 'Enable to render a representation of the constraint.',
    type: 'boolean',
    default: false
});
SliderConstraint.attributes.add('debugColor', {
    title: 'Debug Color',
    description: 'The color of the debug rendering of the constraint.',
    type: 'rgb',
    default: [1, 0, 0]
});

// initialize code called once per entity
SliderConstraint.prototype.initialize = function() {
    this.createConstraint();

    this.on('attr', function(name, value, prev) {
        // If any constraint properties change, recreate the constraint
        if (name === 'pivotA' || name === 'axisA' || name === 'entityB' || name === 'pivotB' || name === 'axisB') {
            this.createConstraint();
        } else if (name === 'linearLimits') {
            this.constraint.setLowerLinLimit(this.linearLimits.x);
            this.constraint.setUpperLinLimit(this.linearLimits.y);
            this.activate();
        } else if (name === 'angularLimits') {
            this.constraint.setLowerAngLimit(this.angularLimits.x);
            this.constraint.setUpperAngLimit(this.angularLimits.y);
            this.activate();
        } else if (name === 'breakingThreshold') {
            this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);
            this.activate();
        }
    });
    this.on('enable', function () {
        this.createConstraint();
    });
    this.on('disable', function () {
        this.destroyConstraint();
    });
    this.on('destroy', function () {
        this.destroyConstraint();
    });
};

SliderConstraint.prototype.createConstraint = function() {
    if (this.constraint) {
        this.destroyConstraint();
    }

    var v1 = new pc.Vec3();
    var v2 = new pc.Vec3();
    var q = new pc.Quat();
    var m = new pc.Mat4();

    var bodyA = this.entity.rigidbody.body;
    var pivotA = new Ammo.btVector3(this.pivotA.x, this.pivotA.y, this.pivotA.z);

    getOrthogonalVectors(this.axisA, v1, v2);
    m.set([
        this.axisA.x, this.axisA.y, this.axisA.z, 0,
        v1.x, v1.y, v1.z, 0,
        v2.x, v2.y, v2.z, 0,
        0, 0, 0, 1
    ]);
    q.setFromMat4(m);

    var quatA = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
    var frameA = new Ammo.btTransform(quatA, pivotA);
    frameA.setOrigin(pivotA);

    if (this.entityB && this.entityB.rigidbody) {
        var bodyB = this.entityB.rigidbody.body;
        var pivotB = new Ammo.btVector3(this.pivotB.x, this.pivotB.y, this.pivotB.z);

        getOrthogonalVectors(this.axisB, v1, v2);
        m.set([
            v1.x, v1.y, v1.z, 0,
            v2.x, v2.y, v2.z, 0,
            this.axisB.x, this.axisB.y, this.axisB.z, 0,
            0, 0, 0, 1
        ]);
        q.setFromMat4(m);

        var quatB = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
        var frameB = new Ammo.btTransform(quatB, pivotB);

        this.constraint = new Ammo.btSliderConstraint(bodyA, bodyB, frameA, frameB);

        Ammo.destroy(frameB);
        Ammo.destroy(quatB);
        Ammo.destroy(pivotB);
    } else {
        this.constraint = new Ammo.btSliderConstraint(bodyA, frameA);
    }

    this.constraint.setLowerLinLimit(this.linearLimits.x);
    this.constraint.setUpperLinLimit(this.linearLimits.y);
    this.constraint.setLowerAngLimit(this.angularLimits.x);
    this.constraint.setUpperAngLimit(this.angularLimits.y);
    this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);

    Ammo.destroy(frameA);
    Ammo.destroy(quatA);
    Ammo.destroy(pivotA);

    var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
    dynamicsWorld.addConstraint(this.constraint, !this.enableCollision);

    this.activate();
};

SliderConstraint.prototype.destroyConstraint = function() {
    if (this.constraint) {
        var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
        dynamicsWorld.removeConstraint(this.constraint);
        Ammo.destroy(this.constraint);
        this.constraint = null;
    }
};

SliderConstraint.prototype.activate = function() {
    this.entity.rigidbody.activate();
    if (this.entityB) {
        this.entityB.rigidbody.activate();
    }
};

// update code called every frame
SliderConstraint.prototype.update = function(dt) {
    if (this.debugRender) {
        // TODO
    }
};

//
// Generic6DofConstraint
//
var Generic6DofConstraint = pc.createScript('generic6DofConstraint');

Generic6DofConstraint.attributes.add('pivotA', {
    title: 'Pivot',
    description: 'Position of the constraint in the local space of this entity.',
    type: 'vec3',
    default: [0, 0, 0]
});
Generic6DofConstraint.attributes.add('axisA', {
    title: 'Axis',
    description: 'Axis of rotation of the constraint in the local space this entity.',
    type: 'vec3',
    default: [0, 1, 0]
});
Generic6DofConstraint.attributes.add('entityB', {
    title: 'Connected Entity',
    description: 'Optional second connected entity.',
    type: 'entity'
});
Generic6DofConstraint.attributes.add('pivotB', {
    title: 'Connected Pivot',
    description: 'Position of the constraint in the local space of the connected entity (if specified).',
    type: 'vec3',
    default: [0, 0, 0]
});
Generic6DofConstraint.attributes.add('axisB', {
    title: 'Connected Axis',
    description: 'Axis of rotation of the constraint in the local space of the connected entity (if specified).',
    type: 'vec3',
    default: [0, 1, 0]
});
Generic6DofConstraint.attributes.add('linearLimits', {
    title: 'Linear Limits',
    description: 'Linear limits of the constraint.',
    type: 'vec2',
    default: [1, -1]
});
Generic6DofConstraint.attributes.add('angularLimits', {
    title: 'Angular Limits',
    description: 'Angular limits of the constraint.',
    type: 'vec2',
    default: [0, 0]
});
Generic6DofConstraint.attributes.add('breakingThreshold', {
    title: 'Break Threshold',
    description: 'Maximum breaking impulse threshold required to break the constraint.',
    type: 'number',
    default: 1e+30
});
Generic6DofConstraint.attributes.add('enableCollision', {
    title: 'Enable Collision',
    description: 'Enable collision between linked rigid bodies.',
    type: 'boolean',
    default: true
});
Generic6DofConstraint.attributes.add('debugRender', {
    title: 'Debug Render',
    description: 'Enable to render a representation of the constraint.',
    type: 'boolean',
    default: false
});
Generic6DofConstraint.attributes.add('debugColor', {
    title: 'Debug Color',
    description: 'The color of the debug rendering of the constraint.',
    type: 'rgb',
    default: [1, 0, 0]
});

// initialize code called once per entity
Generic6DofConstraint.prototype.initialize = function() {
    this.createConstraint();

    this.on('attr', function(name, value, prev) {
        // If any constraint properties change, recreate the constraint
        if (name === 'pivotA' || name === 'axisA' || name === 'entityB' || name === 'pivotB' || name === 'axisB') {
            this.createConstraint();
        } else if (name === 'linearLimits') {
            this.constraint.setLowerLinLimit(this.linearLimits.x);
            this.constraint.setUpperLinLimit(this.linearLimits.y);
            this.activate();
        } else if (name === 'angularLimits') {
            this.constraint.setLowerAngLimit(this.angularLimits.x);
            this.constraint.setUpperAngLimit(this.angularLimits.y);
            this.activate();
        } else if (name === 'breakingThreshold') {
            this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);
            this.activate();
        }
    });
    this.on('enable', function () {
        this.createConstraint();
    });
    this.on('disable', function () {
        this.destroyConstraint();
    });
    this.on('destroy', function () {
        this.destroyConstraint();
    });
};

Generic6DofConstraint.prototype.createConstraint = function() {
    if (this.constraint) {
        this.destroyConstraint();
    }

    var v1 = new pc.Vec3();
    var v2 = new pc.Vec3();
    var q = new pc.Quat();
    var m = new pc.Mat4();

    var bodyA = this.entity.rigidbody.body;
    var pivotA = new Ammo.btVector3(this.pivotA.x, this.pivotA.y, this.pivotA.z);

    getOrthogonalVectors(this.axisA, v1, v2);
    m.set([
        this.axisA.x, this.axisA.y, this.axisA.z, 0,
        v1.x, v1.y, v1.z, 0,
        v2.x, v2.y, v2.z, 0,
        0, 0, 0, 1
    ]);
    q.setFromMat4(m);

    var quatA = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
    var frameA = new Ammo.btTransform(quatA, pivotA);
    frameA.setOrigin(pivotA);

    if (this.entityB && this.entityB.rigidbody) {
        var bodyB = this.entityB.rigidbody.body;
        var pivotB = new Ammo.btVector3(this.pivotB.x, this.pivotB.y, this.pivotB.z);

        getOrthogonalVectors(this.axisB, v1, v2);
        m.set([
            v1.x, v1.y, v1.z, 0,
            v2.x, v2.y, v2.z, 0,
            this.axisB.x, this.axisB.y, this.axisB.z, 0,
            0, 0, 0, 1
        ]);
        q.setFromMat4(m);

        var quatB = new Ammo.btQuaternion(q.x, q.y, q.z, q.w);
        var frameB = new Ammo.btTransform(quatB, pivotB);

        this.constraint = new Ammo.btSliderConstraint(bodyA, bodyB, frameA, frameB);

        Ammo.destroy(frameB);
        Ammo.destroy(quatB);
        Ammo.destroy(pivotB);
    } else {
        this.constraint = new Ammo.btSliderConstraint(bodyA, frameA);
    }

    this.constraint.setLowerLinLimit(this.linearLimits.x);
    this.constraint.setUpperLinLimit(this.linearLimits.y);
    this.constraint.setLowerAngLimit(this.angularLimits.x);
    this.constraint.setUpperAngLimit(this.angularLimits.y);
    this.constraint.setBreakingImpulseThreshold(this.breakingThreshold);

    Ammo.destroy(frameA);
    Ammo.destroy(quatA);
    Ammo.destroy(pivotA);

    var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
    dynamicsWorld.addConstraint(this.constraint, !this.enableCollision);

    this.activate();
};

Generic6DofConstraint.prototype.destroyConstraint = function() {
    if (this.constraint) {
        var dynamicsWorld = this.app.systems.rigidbody.dynamicsWorld;
        dynamicsWorld.removeConstraint(this.constraint);
        Ammo.destroy(this.constraint);
        this.constraint = null;
    }
};

Generic6DofConstraint.prototype.activate = function() {
    this.entity.rigidbody.activate();
    if (this.entityB) {
        this.entityB.rigidbody.activate();
    }
};

// update code called every frame
Generic6DofConstraint.prototype.update = function(dt) {
    if (this.debugRender) {
        // TODO
    }
};
