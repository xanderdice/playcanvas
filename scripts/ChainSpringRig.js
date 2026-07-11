var ChainSpringRig = pc.createScript('chainSpringRig');

/* -----------------------------
   CONFIG
----------------------------- */

ChainSpringRig.attributes.add('style', {
    type: 'string',
    default: 'hair',
    enum: [
        { hair: 'hair' },
        { cape: 'cape' },
        { tail: 'tail' },
        { custom: 'custom' }
    ],
    title: 'Style'
});

ChainSpringRig.attributes.add('maxBones', {
    type: 'number',
    default: 5,
    min: 2,
    max: 8,
    precision: 0,
    title: 'Max Bones'
});

ChainSpringRig.attributes.add('rootFollow', {
    type: 'number',
    default: 0.80,
    min: 0,
    max: 2,
    title: 'Root Follow'
});

ChainSpringRig.attributes.add('tipFollow', {
    type: 'number',
    default: 0.95,
    min: 0,
    max: 2,
    title: 'Tip Follow'
});

ChainSpringRig.attributes.add('rootStiffness', {
    type: 'number',
    default: 18,
    min: 0,
    max: 100,
    title: 'Root Stiffness'
});

ChainSpringRig.attributes.add('tipStiffness', {
    type: 'number',
    default: 28,
    min: 0,
    max: 120,
    title: 'Tip Stiffness'
});

ChainSpringRig.attributes.add('rootDamping', {
    type: 'number',
    default: 0.18,
    min: 0,
    max: 1,
    title: 'Root Damping'
});

ChainSpringRig.attributes.add('tipDamping', {
    type: 'number',
    default: 0.12,
    min: 0,
    max: 1,
    title: 'Tip Damping'
});

ChainSpringRig.attributes.add('gravityScale', {
    type: 'number',
    default: 0.35,
    min: 0,
    max: 2,
    title: 'Gravity Scale'
});

ChainSpringRig.attributes.add('windDirection', {
    type: 'vec3',
    default: [1, 0, 0],
    title: 'Wind Direction'
});

ChainSpringRig.attributes.add('windStrength', {
    type: 'number',
    default: 0.0,
    min: 0,
    max: 10,
    title: 'Wind Strength'
});

ChainSpringRig.attributes.add('windPulse', {
    type: 'number',
    default: 0.15,
    min: 0,
    max: 2,
    title: 'Wind Pulse'
});

ChainSpringRig.attributes.add('lateralSway', {
    type: 'number',
    default: 0.25,
    min: 0,
    max: 3,
    title: 'Lateral Sway'
});

ChainSpringRig.attributes.add('iterations', {
    type: 'number',
    default: 2,
    min: 1,
    max: 6,
    precision: 0,
    title: 'Iterations'
});

ChainSpringRig.attributes.add('rigidTipBoost', {
    type: 'number',
    default: 1.25,
    min: 0.5,
    max: 3,
    title: 'Rigid Tip Boost'
});

ChainSpringRig.attributes.add('applyBodyAvoidance', {
    type: 'boolean',
    default: false,
    title: 'Avoid Body'
});

ChainSpringRig.attributes.add('bodyRadius', {
    type: 'number',
    default: 0.22,
    min: 0.01,
    max: 2,
    title: 'Body Radius'
});

ChainSpringRig.attributes.add('bodyHeight', {
    type: 'number',
    default: 0.95,
    min: 0.01,
    max: 4,
    title: 'Body Height'
});

ChainSpringRig.attributes.add('bodyOffset', {
    type: 'vec3',
    default: [0, 0, 0],
    title: 'Body Offset'
});

ChainSpringRig.attributes.add('bodyPadding', {
    type: 'number',
    default: 0.01,
    min: 0,
    max: 0.2,
    title: 'Body Padding'
});

ChainSpringRig.attributes.add('cameraEntity', {
    type: 'entity',
    default: null,
    title: 'Camera Entity'
});

ChainSpringRig.attributes.add('maxUpdateDistance', {
    type: 'number',
    default: 0,
    min: 0,
    max: 500,
    title: 'Max Update Distance'
});

ChainSpringRig.attributes.add('debug', {
    type: 'boolean',
    default: false,
    title: 'Debug'
});


/* -----------------------------
   INIT
----------------------------- */

ChainSpringRig.prototype.initialize = function () {
    this._enabled = true;
    this._time = 0;

    this._bones = [];
    this._targetPos = [];
    this._simPos = [];
    this._simVel = [];
    this._restLen = [];
    this._restLocalRot = [];
    this._segFollow = [];
    this._segStiff = [];
    this._segDamp = [];

    this._tmpA = new pc.Vec3();
    this._tmpB = new pc.Vec3();
    this._tmpV = new pc.Vec3();
    this._tmpM = new pc.Mat4();

    this._rootPrevWorld = new pc.Vec3();
    this._rootNowWorld = new pc.Vec3();
    this._windWorld = new pc.Vec3();

    this._cfg = this._buildConfig();

    this._buildChain();

    if (this._bones.length < 2) {
        this._enabled = false;
        console.warn('[chainSpringRig] Cadena inválida: necesito al menos 2 huesos.');
        return;
    }

    this._captureRestPose();
};

ChainSpringRig.prototype._buildConfig = function () {
    var cfg = {
        rootFollow: this.rootFollow,
        tipFollow: this.tipFollow,
        rootStiffness: this.rootStiffness,
        tipStiffness: this.tipStiffness,
        rootDamping: this.rootDamping,
        tipDamping: this.tipDamping,
        gravityScale: this.gravityScale,
        windStrength: this.windStrength,
        windPulse: this.windPulse,
        lateralSway: this.lateralSway,
        rigidTipBoost: this.rigidTipBoost
    };

    if (this.style === 'hair') {
        cfg.rootFollow *= 1.05;
        cfg.tipFollow *= 1.00;
        cfg.rootStiffness *= 1.05;
        cfg.tipStiffness *= 1.10;
        cfg.rootDamping *= 0.95;
        cfg.tipDamping *= 0.90;
        cfg.gravityScale *= 0.55;
        cfg.lateralSway *= 0.85;
        cfg.windStrength *= 0.80;
    } else if (this.style === 'cape') {
        cfg.rootFollow *= 0.85;
        cfg.tipFollow *= 1.05;
        cfg.rootStiffness *= 0.90;
        cfg.tipStiffness *= 1.00;
        cfg.rootDamping *= 1.00;
        cfg.tipDamping *= 0.95;
        cfg.gravityScale *= 1.20;
        cfg.lateralSway *= 1.25;
        cfg.windStrength *= 1.15;
    } else if (this.style === 'tail') {
        cfg.rootFollow *= 0.95;
        cfg.tipFollow *= 1.10;
        cfg.rootStiffness *= 0.95;
        cfg.tipStiffness *= 1.20;
        cfg.rootDamping *= 0.98;
        cfg.tipDamping *= 0.92;
        cfg.gravityScale *= 0.80;
        cfg.lateralSway *= 1.00;
        cfg.windStrength *= 0.90;
    }

    return cfg;
};

ChainSpringRig.prototype._buildChain = function () {
    var node = this.entity;
    var count = 0;

    while (node && count < this.maxBones) {
        this._bones.push(node);
        count++;

        var next = null;
        for (var i = 0; i < node.children.length; i++) {
            if (node.children[i] && node.children[i].enabled) {
                next = node.children[i];
                break;
            }
        }

        if (!next) break;
        node = next;
    }
};

ChainSpringRig.prototype._captureRestPose = function () {
    this._rootPrevWorld.copy(this._bones[0].getPosition());

    for (var i = 0; i < this._bones.length; i++) {
        var bone = this._bones[i];
        this._targetPos[i] = bone.getPosition().clone();
        this._simPos[i] = bone.getPosition().clone();
        this._simVel[i] = new pc.Vec3(0, 0, 0);
        this._restLocalRot[i] = bone.getLocalRotation().clone();

        if (i === 0) {
            this._restLen[i] = 0;
            this._segFollow[i] = 0;
            this._segStiff[i] = 0;
            this._segDamp[i] = 0;
            continue;
        }

        this._restLen[i] = bone.getPosition().distance(this._bones[i - 1].getPosition());
        if (this._restLen[i] < 0.0001) this._restLen[i] = 0.02;

        var t = i / Math.max(1, this._bones.length - 1);
        var tipBias = t * t;

        this._segFollow[i] = pc.math.lerp(this._cfg.rootFollow, this._cfg.tipFollow, t);
        this._segStiff[i] = pc.math.lerp(this._cfg.rootStiffness, this._cfg.tipStiffness, tipBias) * pc.math.lerp(1.0, this._cfg.rigidTipBoost, tipBias);
        this._segDamp[i] = pc.math.lerp(this._cfg.rootDamping, this._cfg.tipDamping, t);
    }
};


/* -----------------------------
   UPDATE
----------------------------- */

ChainSpringRig.prototype.postUpdate = function (dt) {
    if (!this._enabled || dt <= 0) return;

    if (this.maxUpdateDistance > 0 && this.cameraEntity) {
        var camPos = this.cameraEntity.getPosition();
        var rootPos = this.entity.getPosition();
        if (camPos.distance(rootPos) > this.maxUpdateDistance) {
            return;
        }
    }

    dt = Math.min(dt, 1 / 30);
    this._time += dt;

    this._sampleAnimatedPose();
    this._stepSimulation(dt);
    this._writeBack();
};

ChainSpringRig.prototype._sampleAnimatedPose = function () {
    for (var i = 0; i < this._bones.length; i++) {
        this._targetPos[i].copy(this._bones[i].getPosition());
    }
    this._rootNowWorld.copy(this._targetPos[0]);
};

ChainSpringRig.prototype._stepSimulation = function (dt) {
    var rootMove = this._tmpB.copy(this._rootNowWorld).sub(this._rootPrevWorld);
    this._rootPrevWorld.copy(this._rootNowWorld);

    this._simPos[0].copy(this._targetPos[0]);
    this._simVel[0].set(0, 0, 0);

    this._windWorld.copy(this.windDirection);
    if (this._windWorld.lengthSq() > 0.000001) this._windWorld.normalize();
    var windPulse = 1 + Math.sin(this._time * 2.0) * this._cfg.windPulse;
    this._windWorld.scale(this._cfg.windStrength * windPulse);

    var gravityY = -9.8 * this._cfg.gravityScale;
    var steps = Math.max(1, Math.floor(this.iterations));

    for (var i = 1; i < this._bones.length; i++) {
        var follow = this._segFollow[i];
        var stiff = this._segStiff[i];
        var damp = this._segDamp[i];
        var target = this._targetPos[i];
        var pos = this._simPos[i];
        var vel = this._simVel[i];

        vel.x += (target.x - pos.x) * stiff * dt;
        vel.y += (target.y - pos.y) * stiff * dt;
        vel.z += (target.z - pos.z) * stiff * dt;

        vel.x += rootMove.x * follow * dt;
        vel.y += rootMove.y * follow * dt;
        vel.z += rootMove.z * follow * dt;

        vel.x += (-rootMove.z * this._cfg.lateralSway) * dt;
        vel.z += (rootMove.x * this._cfg.lateralSway) * dt;

        vel.x += this._windWorld.x * dt;
        vel.y += this._windWorld.y * dt;
        vel.z += this._windWorld.z * dt;

        vel.y += gravityY * dt;

        vel.x *= (1 - damp);
        vel.y *= (1 - damp);
        vel.z *= (1 - damp);

        pos.x += vel.x * dt;
        pos.y += vel.y * dt;
        pos.z += vel.z * dt;
    }

    for (var s = 0; s < steps; s++) {
        this._simPos[0].copy(this._targetPos[0]);

        for (var j = 1; j < this._bones.length; j++) {
            this._satisfyDistance(this._simPos[j - 1], this._simPos[j], this._restLen[j], this._segStiff[j]);

            var blend = this._segFollow[j] * dt * 0.85;
            if (blend > 1) blend = 1;

            this._simPos[j].x = pc.math.lerp(this._simPos[j].x, this._targetPos[j].x, blend);
            this._simPos[j].y = pc.math.lerp(this._simPos[j].y, this._targetPos[j].y, blend);
            this._simPos[j].z = pc.math.lerp(this._simPos[j].z, this._targetPos[j].z, blend);

            if (this.applyBodyAvoidance) {
                this._pushOutsideBody(this._simPos[j]);
            }
        }
    }
};

ChainSpringRig.prototype._satisfyDistance = function (a, b, restLen, stiffness) {
    this._tmpA.copy(b).sub(a);
    var d2 = this._tmpA.lengthSq();
    if (d2 < 1e-8) return;

    var d = Math.sqrt(d2);
    var diff = (d - restLen) / d;
    var k = stiffness * 0.015;

    b.x -= this._tmpA.x * diff * k;
    b.y -= this._tmpA.y * diff * k;
    b.z -= this._tmpA.z * diff * k;
};

ChainSpringRig.prototype._pushOutsideBody = function (pos) {
    var root = this.entity.parent || this.entity;
    /* _tmpV solo se usa en _writeBack (posterior a la simulación): no hay aliasing aquí */
    var center = this._tmpV.copy(root.getPosition()).add(this.bodyOffset);

    var halfSegment = Math.max(0, (this.bodyHeight * 0.5) - this.bodyRadius);
    var minR = this.bodyRadius + this.bodyPadding;
    var minRSq = minR * minR;

    var lx = pos.x - center.x;
    var ly = pos.y - center.y;
    var lz = pos.z - center.z;

    var nearestY = pc.math.clamp(ly, -halfSegment, halfSegment);

    var nx = lx;
    var ny = ly - nearestY;
    var nz = lz;

    var d2 = nx * nx + ny * ny + nz * nz;
    if (d2 >= minRSq) return;

    var d = Math.sqrt(Math.max(d2, 1e-8));
    var push = (minR - d) / d;

    pos.x = center.x + lx + nx * push;
    pos.y = center.y + ly + ny * push;
    pos.z = center.z + lz + nz * push;
};

ChainSpringRig.prototype._writeBack = function () {
    for (var i = 1; i < this._bones.length; i++) {
        var bone = this._bones[i];
        var parent = this._bones[i - 1];

        this._tmpM.copy(parent.getWorldTransform()).invert();
        this._tmpM.transformPoint(this._simPos[i], this._tmpV);

        bone.setLocalPosition(this._tmpV);
        bone.setLocalRotation(this._restLocalRot[i]);
    }
};