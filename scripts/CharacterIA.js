var CharacterIA = pc.createScript('characterIA');

CharacterIA.attributes.add('patrolAreaType', {
    type: 'string',
    enum: [
        { 'Rectangular': 'rect' },
        { 'Circular': 'circ' }
    ],
    default: 'rect',
    title: 'Tipo de área de patrulla',
    description: 'Define la forma del área donde el NPC se mueve. Puede ser rectangular o circular.'
});

CharacterIA.attributes.add('patrolRadius', {
    type: 'number',
    default: 8,
    min: 0.5,
    title: 'Tamaño del área',
    description: 'Tamaño del área de patrulla en metros. En modo circular es el radio. En rectangular es la mitad del ancho y largo.'
});

CharacterIA.attributes.add('patrolPoints', {
    type: 'entity',
    array: true,
    title: 'Puntos de patrulla',
    description: 'Lista opcional de entidades que el NPC puede usar como destinos durante la patrulla.'
});

CharacterIA.attributes.add('ai', {
    type: 'json',
    title: 'Configuración IA',
    schema: [
        {
            name: 'enemyTag',
            type: 'string',
            default: 'is-player',
            title: 'Tag de enemigo',
            description: 'Etiqueta usada para detectar enemigos en la escena.'
        },
        {
            name: 'enemyDetectDistance',
            type: 'number',
            default: 12,
            min: 0.5,
            title: 'Distancia de detección',
            description: 'Distancia máxima a la que el NPC puede detectar un enemigo.'
        },
        {
            name: 'enemyForgetDelay',
            type: 'number',
            default: 2.0,
            min: 0,
            title: 'Tiempo de olvido',
            description: 'Tiempo que el NPC sigue persiguiendo al enemigo después de perderlo.'
        },
        {
            name: 'returnHomeDelay',
            type: 'number',
            default: 10.0,
            min: 0,
            title: 'Volver al origen',
            description: 'Tiempo que tarda en volver al centro original de patrulla después de perder al enemigo.'
        },
        {
            name: 'attackRange',
            type: 'number',
            default: 1.7,
            min: 0.1,
            title: 'Rango de ataque',
            description: 'Distancia a la que el NPC puede atacar al enemigo.'
        },
        {
            name: 'attackCooldown',
            type: 'number',
            default: 0.8,
            min: 0,
            title: 'Tiempo entre ataques',
            description: 'Tiempo mínimo entre ataques consecutivos.'
        },
        {
            name: 'raycastEveryFrames',
            type: 'number',
            default: 1,
            min: 1,
            max: 2,
            title: 'Frecuencia de raycast',
            description: 'Cada cuántos frames se realiza el raycast para detectar obstáculos.'
        },
        {
            name: 'deadTimeMin',
            type: 'number',
            default: 0.35,
            min: 0,
            title: 'Pausa mínima',
            description: 'Tiempo mínimo de pausa natural al llegar a un punto o recalcular.'
        },
        {
            name: 'deadTimeMax',
            type: 'number',
            default: 1.0,
            min: 0,
            title: 'Pausa máxima',
            description: 'Tiempo máximo de pausa natural.'
        },
        {
            name: 'arrivalRadius',
            type: 'number',
            default: 0.45,
            min: 0.05,
            title: 'Radio de llegada',
            description: 'Distancia a la que se considera que el NPC llegó a su objetivo.'
        },
        {
            name: 'avoidSideStep',
            type: 'number',
            default: 1.25,
            min: 0.2,
            title: 'Desvío lateral',
            description: 'Distancia lateral usada para rodear obstáculos.'
        },
        {
            name: 'probeHeight',
            type: 'number',
            default: 1.0,
            min: 0.2,
            title: 'Altura del raycast',
            description: 'Altura desde la cual se lanzan los raycasts para detectar obstáculos.'
        },
        {
            name: 'stuckTime',
            type: 'number',
            default: 2.0,
            min: 0.25,
            title: 'Tiempo de atasco',
            description: 'Tiempo sin moverse necesario para considerar que el NPC está atascado y recalcular.'
        }
    ]
});

var CharacterIAState = Object.freeze({
    PATROL: 'patrol',
    CHASE: 'chase',
    COMBAT: 'combat',
    PAUSE: 'pause'
});

CharacterIA.prototype.initialize = function () {
    this._character = this.entity.script && this.entity.script.character ? this.entity.script.character : null;

    if (!this.entity.input) {
        this.entity.input = {};
    }

    if (typeof this.app.raycastfinder === 'undefined') {
        this.app.raycastfinder = false;
    }

    var ai = this.ai || {};

    this._enemyTag = ai.enemyTag || 'is-player';
    this._enemyDetectDistance = Math.max(0.5, ai.enemyDetectDistance || 12);
    this._enemyForgetDelay = Math.max(0, ai.enemyForgetDelay || 2.0);
    this._returnHomeDelay = Math.max(0, ai.returnHomeDelay || 10.0);

    this._attackRange = Math.max(0.1, ai.attackRange || 1.7);
    this._attackCooldown = Math.max(0, ai.attackCooldown || 0.8);

    this._raycastEveryFrames = Math.min(2, Math.max(1, ai.raycastEveryFrames || 1));
    this._deadTimeMin = Math.max(0, ai.deadTimeMin || 0.35);
    this._deadTimeMax = Math.max(this._deadTimeMin, ai.deadTimeMax || 1.0);

    this._arrivalRadius = Math.max(0.05, ai.arrivalRadius || 0.45);
    this._avoidSideStep = Math.max(0.2, ai.avoidSideStep || 1.25);
    this._probeHeight = Math.max(0.2, ai.probeHeight || 1.0);
    this._stuckTime = Math.max(0.25, ai.stuckTime || 2.0);

    this._originHome = this.entity.getPosition().clone();
    this._patrolCenter = this._originHome.clone();

    this._state = CharacterIAState.PATROL;

    this._frameCounter = 0;
    this._pauseRemaining = 0;
    this._returnHomeTimer = 0;

    this._enemyEntity = null;
    this._enemyLastSeenPos = null;
    this._enemyLossTimer = 0;

    this._currentPatrolGoal = null;
    this._currentTarget = this._patrolCenter.clone();
    this._avoidCandidate = null;

    this._lastMovePos = this.entity.getPosition().clone();
    this._stuckTimer = 0;
    this._preferredSide = 1;

    this._attackCooldownRemaining = 0;
    this._lastPickedPoint = null;
    this._warnedNoCharacter = false;

    this._resetInput();
    this._chooseNewPatrolGoal();
    this._applyDecisionTarget(this._currentTarget, false);
};

CharacterIA.prototype._resetInput = function () {
    var input = this.entity.input;
    input.dt = 0;
    input.mode = this.entity.mode || 0;
    input.x = 0;
    input.z = 0;
    input.sprint = false;
    input.attack = false;
    input.targetEntity = null;
};

CharacterIA.prototype._randomRange = function (min, max) {
    return min + (Math.random() * (max - min));
};

CharacterIA.prototype._flatDistanceSq = function (a, b) {
    var dx = a.x - b.x;
    var dz = a.z - b.z;
    return (dx * dx) + (dz * dz);
};

CharacterIA.prototype._flatDistance = function (a, b) {
    return Math.sqrt(this._flatDistanceSq(a, b));
};

CharacterIA.prototype._getCenter = function () {
    return this._patrolCenter || this._originHome;
};

CharacterIA.prototype._pointInsideArea = function (point) {
    var center = this._getCenter();
    var p = point.clone ? point.clone() : new pc.Vec3(point.x, point.y, point.z);
    p.y = center.y;

    if (this.patrolAreaType === 'circ') {
        return this._flatDistance(p, center) <= this.patrolRadius;
    }

    return Math.abs(p.x - center.x) <= this.patrolRadius && Math.abs(p.z - center.z) <= this.patrolRadius;
};

CharacterIA.prototype._clampPointToArea = function (point) {
    var center = this._getCenter();
    var p = point.clone ? point.clone() : new pc.Vec3(point.x, point.y, point.z);
    p.y = center.y;

    if (this.patrolAreaType === 'circ') {
        var offset = p.clone().sub(center);
        offset.y = 0;
        var len = offset.length();
        if (len > this.patrolRadius) {
            offset.normalize().scale(this.patrolRadius);
            p = center.clone().add(offset);
            p.y = center.y;
        }
        return p;
    }

    var dx = pc.math.clamp(p.x - center.x, -this.patrolRadius, this.patrolRadius);
    var dz = pc.math.clamp(p.z - center.z, -this.patrolRadius, this.patrolRadius);
    return new pc.Vec3(center.x + dx, center.y, center.z + dz);
};

CharacterIA.prototype._patrolPointsAvailable = function () {
    return Array.isArray(this.patrolPoints) && this.patrolPoints.length > 0;
};

CharacterIA.prototype._pickRandomAreaPoint = function () {
    var c = this._getCenter();

    if (this.patrolAreaType === 'circ') {
        var angle = Math.random() * Math.PI * 2;
        var radius = Math.sqrt(Math.random()) * this.patrolRadius;
        return new pc.Vec3(
            c.x + Math.cos(angle) * radius,
            c.y,
            c.z + Math.sin(angle) * radius
        );
    }

    return new pc.Vec3(
        c.x + (Math.random() * 2 - 1) * this.patrolRadius,
        c.y,
        c.z + (Math.random() * 2 - 1) * this.patrolRadius
    );
};

CharacterIA.prototype._pickPatrolPoint = function () {
    if (!this._patrolPointsAvailable()) {
        return null;
    }

    var candidates = [];
    for (var i = 0; i < this.patrolPoints.length; i++) {
        var ent = this.patrolPoints[i];
        if (!ent || !ent.getPosition) continue;
        if (ent._guid === this.entity._guid) continue;
        if (!this._pointInsideArea(ent.getPosition())) continue;
        candidates.push(ent);
    }

    if (!candidates.length) {
        return null;
    }

    if (candidates.length === 1) {
        this._lastPickedPoint = candidates[0];
        return candidates[0];
    }

    for (var tries = 0; tries < 8; tries++) {
        var idx = Math.floor(Math.random() * candidates.length);
        if (!this._lastPickedPoint || candidates[idx]._guid !== this._lastPickedPoint._guid) {
            this._lastPickedPoint = candidates[idx];
            return candidates[idx];
        }
    }

    this._lastPickedPoint = candidates[0];
    return candidates[0];
};

CharacterIA.prototype._chooseNewPatrolGoal = function () {
    var usePoint = this._patrolPointsAvailable() && Math.random() < 0.7;
    var pointEntity = usePoint ? this._pickPatrolPoint() : null;

    if (pointEntity) {
        this._currentPatrolGoal = pointEntity.getPosition().clone();
    } else {
        this._currentPatrolGoal = this._pickRandomAreaPoint();
    }

    this._currentPatrolGoal.y = this._getCenter().y;
    this._avoidCandidate = null;
};

CharacterIA.prototype._makeProbeOrigin = function (pos) {
    return new pc.Vec3(pos.x, pos.y + this._probeHeight, pos.z);
};

CharacterIA.prototype._raycast = function (from, to) {
    if (this.app.raycastfinder) {
        return { locked: true, hit: null };
    }

    var rigidbodySystem = this.app.systems && this.app.systems.rigidbody;
    if (!rigidbodySystem || typeof rigidbodySystem.raycastFirst !== 'function') {
        return { locked: false, hit: null };
    }

    this.app.raycastfinder = true;
    try {
        return {
            locked: false,
            hit: rigidbodySystem.raycastFirst(from, to)
        };
    } finally {
        this.app.raycastfinder = false;
    }
};

CharacterIA.prototype._checkClearPath = function (from, to) {
    var result = this._raycast(from, to);

    if (result.locked) {
        return { locked: true, clear: null, hit: null };
    }

    return {
        locked: false,
        clear: !result.hit,
        hit: result.hit || null
    };
};

CharacterIA.prototype._tryAvoidObstacle = function (from, target, hit) {
    var flatDir = target.clone().sub(from);
    flatDir.y = 0;

    var len = flatDir.length();
    if (len < 0.001) {
        return null;
    }

    flatDir.normalize();

    var left = new pc.Vec3(-flatDir.z, 0, flatDir.x);
    var right = left.clone().scale(-1);
    var sideOrder = this._preferredSide > 0 ? [left, right] : [right, left];
    this._preferredSide *= -1;

    var hitPoint = hit && hit.point ? hit.point.clone() : from.clone().add(flatDir.clone().scale(Math.min(len, 1.5)));
    hitPoint.y = this._getCenter().y;

    var hitNormal = null;
    if (hit && hit.normal) {
        hitNormal = new pc.Vec3(hit.normal.x, 0, hit.normal.z);
        if (hitNormal.lengthSq() >= 0.000001) {
            hitNormal.normalize();
        } else {
            hitNormal = null;
        }
    }

    for (var s = 0; s < sideOrder.length; s++) {
        for (var step = 0; step < 2; step++) {
            var sideScale = this._avoidSideStep * (step === 0 ? 1 : 1.5);
            var candidate = hitPoint.clone();

            if (hitNormal) {
                candidate.add(hitNormal.clone().scale(sideScale * 1.1));
            } else {
                candidate.add(flatDir.clone().scale(sideScale * 0.5));
            }

            candidate.add(sideOrder[s].clone().scale(sideScale));
            candidate.add(flatDir.clone().scale(sideScale * 0.35));
            candidate.y = this._getCenter().y;

            if (!this._pointInsideArea(candidate)) {
                continue;
            }

            var leg1 = this._checkClearPath(this._makeProbeOrigin(from), this._makeProbeOrigin(candidate));
            if (leg1.locked || !leg1.clear) {
                continue;
            }

            var leg2 = this._checkClearPath(this._makeProbeOrigin(candidate), this._makeProbeOrigin(target));
            if (leg2.locked || !leg2.clear) {
                continue;
            }

            return candidate;
        }
    }

    return null;
};

CharacterIA.prototype._isArrived = function (pos, target) {
    return this._flatDistance(pos, target) <= this._arrivalRadius;
};

CharacterIA.prototype._updateStuck = function (dt) {
    if (!this.entity.rigidbody) {
        this._stuckTimer = 0;
        return false;
    }

    var hasIntent =
        Math.abs(this.entity.input.x || 0) > 0.01 ||
        Math.abs(this.entity.input.z || 0) > 0.01 ||
        !!this.entity.input.targetPoint ||
        !!this._enemyEntity;

    if (!hasIntent || this._pauseRemaining > 0) {
        this._stuckTimer = 0;
        return false;
    }

    if (this.entity.input.attack) {
        this._stuckTimer = 0;
        return false;
    }

    var v = this.entity.rigidbody.linearVelocity || new pc.Vec3(0, 0, 0);
    var horizontalSpeedSq = (v.x * v.x) + (v.z * v.z);

    if (horizontalSpeedSq <= 0.1) {
        this._stuckTimer += dt;
    } else {
        this._stuckTimer = 0;
    }

    return this._stuckTimer >= this._stuckTime;
};

CharacterIA.prototype._findNearestEnemy = function (pos) {
    if (!this._enemyTag) {
        return null;
    }

    var root = this.app.scene && this.app.scene.root ? this.app.scene.root : null;
    if (!root || !root.findByTag) {
        return null;
    }

    var entities = root.findByTag(this._enemyTag);
    if (!entities || !entities.length) {
        return null;
    }

    var best = null;
    var bestDistance = Number.MAX_VALUE;
    var maxDetectSq = this._enemyDetectDistance * this._enemyDetectDistance;

    for (var i = 0; i < entities.length; i++) {
        var ent = entities[i];
        if (!ent || !ent.enabled || ent._guid === this.entity._guid || !ent.getPosition) {
            continue;
        }

        var dSq = this._flatDistanceSq(pos, ent.getPosition());
        if (dSq <= maxDetectSq && dSq < bestDistance) {
            best = ent;
            bestDistance = dSq;
        }
    }

    return best;
};

CharacterIA.prototype._updateEnemyMemory = function (dt, currentPos) {
    var found = this._findNearestEnemy(currentPos);

    if (found) {
        if (!this._enemyEntity || this._enemyEntity._guid !== found._guid) {
            this.onEnemySpotted(found);
        }

        this._enemyEntity = found;
        this._enemyLastSeenPos = found.getPosition().clone();
        this._enemyLossTimer = 0;
        return;
    }

    if (this._enemyEntity && this._enemyEntity.enabled && this._enemyEntity.getPosition) {
        this._enemyLastSeenPos = this._enemyEntity.getPosition().clone();
        this._enemyLossTimer += dt;

        if (this._enemyLossTimer >= this._enemyForgetDelay) {
            this.onEnemyLost(this._enemyEntity);
            this._enterPatrolShift(currentPos);
        }

        return;
    }

    if (this._enemyLastSeenPos) {
        this._enemyLossTimer += dt;

        if (this._enemyLossTimer >= this._enemyForgetDelay) {
            this._enemyEntity = null;
            this._enemyLastSeenPos = null;
            this._enemyLossTimer = 0;
        }
    }
};

CharacterIA.prototype._enterPatrolShift = function (currentPos) {
    this._patrolCenter = currentPos.clone();
    this._enemyEntity = null;
    this._enemyLastSeenPos = null;
    this._enemyLossTimer = 0;
    this._returnHomeTimer = Math.max(this._returnHomeDelay, 0);

    this._currentPatrolGoal = null;
    this._avoidCandidate = null;
    this._chooseNewPatrolGoal();
};

CharacterIA.prototype._maybeReturnHome = function (dt) {
    if (this._returnHomeTimer <= 0) {
        return false;
    }

    this._returnHomeTimer -= dt;
    if (this._returnHomeTimer > 0) {
        return false;
    }

    this._patrolCenter = this._originHome.clone();
    this._currentPatrolGoal = null;
    this._avoidCandidate = null;
    this._chooseNewPatrolGoal();
    return true;
};

CharacterIA.prototype._getTrackedEnemyPosition = function () {
    if (this._enemyEntity && this._enemyEntity.enabled && this._enemyEntity.getPosition) {
        return this._enemyEntity.getPosition().clone();
    }

    if (this._enemyLastSeenPos && this._enemyLossTimer < this._enemyForgetDelay) {
        return this._enemyLastSeenPos.clone();
    }

    return null;
};

CharacterIA.prototype._isEnemyInAttackRange = function (currentPos, enemyPos) {
    return this._flatDistance(currentPos, enemyPos) <= this._attackRange;
};

CharacterIA.prototype._isEnemyVisible = function (currentPos, enemyPos) {
    var check = this._checkClearPath(this._makeProbeOrigin(currentPos), this._makeProbeOrigin(enemyPos));
    return !check.locked && check.clear;
};

CharacterIA.prototype._resolveChaseTarget = function (currentPos, enemyPos) {
    var target = enemyPos.clone();

    if (this._shouldRaycastThisFrame()) {
        var check = this._checkClearPath(this._makeProbeOrigin(currentPos), this._makeProbeOrigin(target));

        if (!check.locked && !check.clear) {
            var avoid = this._tryAvoidObstacle(currentPos, target, check.hit);
            if (avoid) {
                this._avoidCandidate = avoid.clone();
                return avoid;
            }

            return this._avoidCandidate ? this._avoidCandidate.clone() : target;
        }

        if (!check.locked) {
            this._avoidCandidate = null;
        } else if (this._avoidCandidate) {
            return this._avoidCandidate.clone();
        }
    } else if (this._avoidCandidate) {
        return this._avoidCandidate.clone();
    }

    return target;
};

CharacterIA.prototype._resolvePatrolTarget = function (currentPos) {
    var target = this._currentPatrolGoal ? this._currentPatrolGoal.clone() : this._pickRandomAreaPoint();
    target.y = this._getCenter().y;

    if (this._shouldRaycastThisFrame()) {
        var check = this._checkClearPath(this._makeProbeOrigin(currentPos), this._makeProbeOrigin(target));

        if (!check.locked && !check.clear) {
            var avoid = this._tryAvoidObstacle(currentPos, target, check.hit);
            if (avoid && this._pointInsideArea(avoid)) {
                this._avoidCandidate = avoid.clone();
                return avoid;
            }
            return null;
        }

        if (!check.locked) {
            this._avoidCandidate = null;
        } else if (this._avoidCandidate) {
            return this._avoidCandidate.clone();
        }
    } else if (this._avoidCandidate) {
        return this._avoidCandidate.clone();
    }

    return target;
};

CharacterIA.prototype._shouldRaycastThisFrame = function () {
    return (this._frameCounter % this._raycastEveryFrames) === 0;
};

CharacterIA.prototype._buildPatrolDecision = function (currentPos) {
    if (!this._currentPatrolGoal || this._isArrived(currentPos, this._currentPatrolGoal)) {
        this.onPatrolGoalReached(this._currentPatrolGoal);
        this._chooseNewPatrolGoal();
    }

    var target = this._resolvePatrolTarget(currentPos);
    if (!target) {
        this._pauseRemaining = this._randomRange(this._deadTimeMin, this._deadTimeMax);
        this._chooseNewPatrolGoal();
        return {
            state: CharacterIAState.PAUSE,
            target: currentPos.clone(),
            attack: false,
            sprint: false
        };
    }

    return {
        state: CharacterIAState.PATROL,
        target: target,
        attack: false,
        sprint: false
    };
};

CharacterIA.prototype._buildChaseDecision = function (currentPos, enemyPos) {
    var distance = this._flatDistance(currentPos, enemyPos);
    var visible = this._isEnemyVisible(currentPos, enemyPos);

    if (distance <= this._attackRange && visible) {
        this._state = CharacterIAState.COMBAT;
        this.onEnemyInRange(this._enemyEntity, distance);

        if (this._attackCooldownRemaining <= 0) {
            this._attackCooldownRemaining = this._attackCooldown;
            return {
                state: CharacterIAState.COMBAT,
                target: enemyPos.clone(),
                attack: true,
                sprint: false
            };
        }

        return {
            state: CharacterIAState.COMBAT,
            target: enemyPos.clone(),
            attack: false,
            sprint: false
        };
    }

    var target = this._resolveChaseTarget(currentPos, enemyPos);

    return {
        state: CharacterIAState.CHASE,
        target: target,
        attack: false,
        sprint: false
    };
};

CharacterIA.prototype._buildDecision = function (dt, currentPos) {
    if (this._pauseRemaining > 0) {
        return {
            state: CharacterIAState.PAUSE,
            target: currentPos.clone(),
            attack: false,
            sprint: false
        };
    }

    var enemyPos = this._getTrackedEnemyPosition();
    if (enemyPos) {
        return this._buildChaseDecision(currentPos, enemyPos);
    }

    return this._buildPatrolDecision(currentPos);
};

CharacterIA.prototype._applyDecisionTarget = function (target, attack) {
    if (!target) {
        target = this.entity.getPosition().clone();
    }

    this._currentTarget = target.clone();
    this.entity.input.targetPoint = this._currentTarget.clone();
    this.entity.input.attack = !!attack;

    var pos = this.entity.getPosition();
    var dir = this._currentTarget.clone().sub(pos);
    dir.y = 0;

    if (dir.lengthSq() > 0.000001) {
        dir.normalize();

        var forward = this.entity.forward.clone();
        forward.y = 0;
        if (forward.lengthSq() > 0.000001) {
            forward.normalize();
        }

        var right = this.entity.right ? this.entity.right.clone() : new pc.Vec3(1, 0, 0);
        right.y = 0;
        if (right.lengthSq() > 0.000001) {
            right.normalize();
        }

        this.entity.input.x = pc.math.clamp(dir.dot(right), -1, 1);
        this.entity.input.z = pc.math.clamp(dir.dot(forward), -1, 1);
    } else {
        this.entity.input.x = 0;
        this.entity.input.z = 0;
    }

    if (this._state === CharacterIAState.COMBAT || attack) {
        this.entity.input.sprint = false;
    }
};

CharacterIA.prototype._buildRecoveryDecision = function (currentPos, baseDecision) {
    var enemyPos = this._getTrackedEnemyPosition();

    if (baseDecision && baseDecision.state === CharacterIAState.CHASE && enemyPos) {
        var chaseAvoid = this._tryAvoidObstacle(currentPos, enemyPos, null);
        if (chaseAvoid) {
            return {
                state: CharacterIAState.CHASE,
                target: chaseAvoid,
                attack: false,
                sprint: false
            };
        }

        return {
            state: CharacterIAState.CHASE,
            target: enemyPos.clone(),
            attack: false,
            sprint: false
        };
    }

    this.onStuck({
        position: currentPos.clone(),
        state: baseDecision ? baseDecision.state : CharacterIAState.PATROL
    });

    this._chooseNewPatrolGoal();
    this._pauseRemaining = this._randomRange(this._deadTimeMin * 0.5, this._deadTimeMax * 0.75);

    return {
        state: CharacterIAState.PAUSE,
        target: currentPos.clone(),
        attack: false,
        sprint: false
    };
};

CharacterIA.prototype.update = function (dt) {
    this._frameCounter++;

    if (!this.entity.input) {
        this.entity.input = {};
    }

    if (!this._character && !this._warnedNoCharacter) {
        this._warnedNoCharacter = true;
        console.warn('[characterIA] Se espera un script "character" en la misma entidad.');
    }

    this._attackCooldownRemaining = Math.max(0, this._attackCooldownRemaining - dt);


    this.entity.input.mode = this.entity.mode || 0;

    var currentPos = this.entity.getPosition().clone();

    this._updateEnemyMemory(dt, currentPos);
    this._maybeReturnHome(dt);

    if (this._pauseRemaining > 0) {
        this._pauseRemaining -= dt;
        if (this._pauseRemaining < 0) {
            this._pauseRemaining = 0;
        }

        this._state = CharacterIAState.PAUSE;
        this._resetInput();

        this.entity.input.mode = this.entity.mode || 0;
        this._applyDecisionTarget(currentPos, false);
        return;
    }

    var decision = this._buildDecision(dt, currentPos);
    this._state = decision.state;

    this._resetInput();

    this.entity.input.mode = this.entity.mode || 0;
    this._applyDecisionTarget(decision.target, decision.attack);

    if (this._updateStuck(dt)) {
        var recovery = this._buildRecoveryDecision(currentPos, decision);
        this._state = recovery.state;

        this._resetInput();

        this.entity.input.mode = this.entity.mode || 0;
        this._applyDecisionTarget(recovery.target, recovery.attack);
    }
};

CharacterIA.prototype.onDisable = function () {
    this._resetInput();
};

CharacterIA.prototype.onEnable = function () {
    this._chooseNewPatrolGoal();
    this._applyDecisionTarget(this._currentTarget || this.entity.getPosition(), false);
};

/*
    Hooks vacíos para escalar después sin romper la base.
    - onEnemySpotted(enemy)
    - onEnemyLost(enemy)
    - onEnemyInRange(enemy, distance)
    - onPatrolGoalReached(goal)
    - onStuck(context)
*/

CharacterIA.prototype.onEnemySpotted = function () { };
CharacterIA.prototype.onEnemyLost = function () { };
CharacterIA.prototype.onEnemyInRange = function () { };
CharacterIA.prototype.onPatrolGoalReached = function () { };
CharacterIA.prototype.onStuck = function () { };