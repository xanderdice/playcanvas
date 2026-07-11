var CharacterIA = pc.createScript('characterIA');

/*
IA de NPC integrada con el scheduler de GameManager.

- NO usa update(): expone doAI() a través del script "character" de la misma
  entidad, y GameManager.updateCharactersMovement() la invoca con aiFrequency
  escalonada + presupuesto de ms. La frecuencia se ajusta sola por distancia
  al jugador (AI-LOD).
- Percepción compartida: findByTag se cachea a nivel de clase y lo comparten
  todas las instancias. Si el tag es "is-player" se usa GameManager.playerEntity
  directamente (costo cero).
- Presupuesto GLOBAL de raycasts por frame entre TODOS los NPCs.
- Paredes por contacto físico (entity.wallAway / wallTimeMs, ver Character.js):
  al chocar se detiene y elige un objetivo alejándose de la pared; si un enemigo
  resulta inalcanzable, lo ignora un tiempo y busca otros objetivos.
- Cero asignaciones por tick en régimen: scratch compartido + estado persistente.

REQUIERE: Character.js en la misma entidad y GameManager.js en ROOT.
La entidad debe ser hija directa de ROOT (así la registra GameManager).
*/

/* =========================================================
   ATRIBUTOS (solo gameplay; el resto son constantes IA_*)
   ========================================================= */

CharacterIA.attributes.add('patrolRadius', {
    type: 'number',
    default: 8,
    min: 0.5,
    title: 'Radio de patrulla',
    description: 'Radio del área circular donde el NPC patrulla, en metros.'
});

CharacterIA.attributes.add('patrolPoints', {
    type: 'entity',
    array: true,
    title: 'Puntos de patrulla',
    description: 'Lista opcional de entidades usadas como destinos de patrulla.'
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
            description: 'Etiqueta usada para detectar enemigos.'
        },
        {
            name: 'enemyDetectDistance',
            type: 'number',
            default: 12,
            min: 0.5,
            title: 'Distancia de detección'
        },
        {
            name: 'enemyForgetDelay',
            type: 'number',
            default: 2.0,
            min: 0,
            title: 'Tiempo de olvido',
            description: 'Segundos que sigue persiguiendo tras perder de vista al enemigo.'
        },
        {
            name: 'returnHomeDelay',
            type: 'number',
            default: 10.0,
            min: 0,
            title: 'Volver al origen',
            description: 'Segundos hasta recentrar la patrulla en el origen tras un combate.'
        },
        {
            name: 'attackRange',
            type: 'number',
            default: 1.7,
            min: 0.1,
            title: 'Rango de ataque'
        },
        {
            name: 'attackCooldown',
            type: 'number',
            default: 0.8,
            min: 0,
            title: 'Tiempo entre ataques'
        },
        {
            name: 'pauseTime',
            type: 'number',
            default: 0.7,
            min: 0,
            title: 'Pausa natural',
            description: 'Duración media de las pausas al llegar a un destino (variación ±50%).'
        }
    ]
});

/* =========================================================
   CONSTANTES INTERNAS (antes eran atributos)
   ========================================================= */
var IA_ARRIVAL_RADIUS_SQ = 0.45 * 0.45; // llegada a destino (al cuadrado)
var IA_AVOID_SIDESTEP = 1.25;           // desvío lateral al esquivar en chase
var IA_STUCK_TIME = 2.0;                // s sin avanzar con intención = atascado
var IA_WALL_FRESH_MS = 400;             // validez del contacto de pared
var IA_UNREACHABLE_LIMIT = 4.0;         // acumulado que hace abandonar un objetivo
var IA_IGNORE_ENEMY_MS = 6000;          // ms que se ignora a un enemigo inalcanzable
var IA_DETECT_MAX_DY = 3.0;             // límite vertical de detección
var IA_TAG_CACHE_FRAMES = 15;           // frames de validez del caché findByTag
var IA_RAY_BUDGET = 6;                  // raycasts de IA por frame (todos los NPCs)

/* AI-LOD: frecuencia de tick (frames) según distancia plana al jugador */
var IA_LOD_NEAR_SQ = 20 * 20;
var IA_LOD_MID_SQ = 45 * 45;
var IA_FREQ_NEAR = 6;
var IA_FREQ_MID = 30;
var IA_FREQ_FAR = 120;

var CharacterIAState = Object.freeze({
    PATROL: 0,
    CHASE: 1,
    COMBAT: 2,
    PAUSE: 3
});

/* =========================================================
   RECURSOS COMPARTIDOS por todas las instancias.
   La IA corre secuencialmente (un NPC termina antes de que
   empiece el siguiente): no hay aliasing entre NPCs.
   ========================================================= */
var IA_tmpA = new pc.Vec3();
var IA_tmpB = new pc.Vec3();
var IA_from = new pc.Vec3();
var IA_to = new pc.Vec3();

CharacterIA._frame = 0;
CharacterIA._raysLeft = IA_RAY_BUDGET;
CharacterIA._tagCache = {};

/* un único listener por app: resetea el presupuesto de raycasts y
   avanza el contador de frame compartido */
CharacterIA._installFrameHook = function (app) {
    if (app.__iaFrameHook) return;
    app.__iaFrameHook = true;
    app.on('update', function () {
        CharacterIA._frame++;
        CharacterIA._raysLeft = IA_RAY_BUDGET;
    });
};

/* lista de entidades por tag, compartida y refrescada cada IA_TAG_CACHE_FRAMES */
CharacterIA._getTagList = function (app, tag) {
    var c = CharacterIA._tagCache[tag];
    if (!c) {
        c = CharacterIA._tagCache[tag] = { frame: -1e9, list: null };
    }
    if (CharacterIA._frame - c.frame >= IA_TAG_CACHE_FRAMES) {
        c.list = app.root.findByTag(tag);
        c.frame = CharacterIA._frame;
    }
    return c.list;
};

/* raycast con presupuesto global.
   Devuelve: objeto hit | null (camino libre) | undefined (sin presupuesto) */
CharacterIA._budgetRaycast = function (app, from, to) {
    if (CharacterIA._raysLeft <= 0) return undefined;
    CharacterIA._raysLeft--;
    return app.systems.rigidbody.raycastFirst(from, to) || null;
};


/* =========================================================
   INIT
   ========================================================= */

CharacterIA.prototype.initialize = function () {
    this._character = (this.entity.script && this.entity.script.character) || null;

    if (!this.entity.input) this.entity.input = {};

    CharacterIA._installFrameHook(this.app);

    var ai = this.ai || {};
    this._enemyTag = ai.enemyTag || 'is-player';
    var detect = Math.max(0.5, ai.enemyDetectDistance || 12);
    this._enemyDetectSq = detect * detect;
    this._enemyForgetDelay = Math.max(0, ai.enemyForgetDelay || 2.0);
    this._returnHomeDelay = Math.max(0, ai.returnHomeDelay || 10.0);
    this._attackRange = Math.max(0.1, ai.attackRange || 1.7);
    this._attackCooldown = Math.max(0, ai.attackCooldown || 0.8);
    this._pauseTime = Math.max(0, ai.pauseTime === undefined ? 0.7 : ai.pauseTime);

    /* estado persistente: vectores fijos + flags, sin clones en régimen */
    this._originHome = this.entity.getPosition().clone();
    this._patrolCenter = this._originHome.clone();
    this._goal = new pc.Vec3();
    this._hasGoal = false;
    this._avoid = new pc.Vec3();
    this._hasAvoid = false;
    this._enemyLastSeen = new pc.Vec3();
    this._hasEnemySeen = false;
    this._targetPoint = new pc.Vec3(); // objeto ÚNICO asignado a input.targetPoint

    this._state = CharacterIAState.PATROL;
    this._pauseRemaining = 0;
    this._returnHomeTimer = 0;

    this._enemyEntity = null;
    this._enemyLossTimer = 0;
    this._ignoredEnemyGuid = null;
    this._ignoredUntilMs = 0;
    this._unreachableTimer = 0;

    this._stuckTimer = 0;
    this._preferredSide = 1;
    this._attackCooldownRemaining = 0;
    this._lastPickedGuid = null;
    this._probeHeight = 0; // lazy: se deriva de la cápsula del character
    this._lastTickMs = performance.now();

    this.entity.aiFrequency = IA_FREQ_MID; // lo ajusta _updateLOD en cada tick

    /* integración con GameManager: updateCharactersMovement invoca
       script.character.doAI() con aiFrequency escalonada */
    if (this._character) {
        var self = this;
        this._character.doAI = function () { self.doAI(); };
    } else {
        console.warn('[characterIA] Se espera un script "character" en la misma entidad.');
    }

    this.on('destroy', function () {
        if (this._character && this._character.doAI) this._character.doAI = null;
    }, this);

    this._resetInput();
    this._chooseNewPatrolGoal();
};

CharacterIA.prototype._resetInput = function () {
    var input = this.entity.input;
    input.mode = this.entity.mode || 0;
    input.x = 0;
    input.z = 0;
    input.sprint = false;
    input.attack = false;
    input.targetEntity = null;
};


/* =========================================================
   HELPERS (matemática pura, sin asignaciones)
   ========================================================= */

CharacterIA.prototype._flatDistSq = function (a, b) {
    var dx = a.x - b.x;
    var dz = a.z - b.z;
    return dx * dx + dz * dz;
};

CharacterIA.prototype._insideArea = function (x, z) {
    var c = this._patrolCenter;
    var dx = x - c.x;
    var dz = z - c.z;
    return dx * dx + dz * dz <= this.patrolRadius * this.patrolRadius;
};

CharacterIA.prototype._clampToArea = function (v) {
    var c = this._patrolCenter;
    var dx = v.x - c.x;
    var dz = v.z - c.z;
    var d2 = dx * dx + dz * dz;
    var r = this.patrolRadius;
    if (d2 > r * r) {
        var inv = r / Math.sqrt(d2);
        v.x = c.x + dx * inv;
        v.z = c.z + dz * inv;
    }
    v.y = c.y;
    return v;
};

CharacterIA.prototype._randomAreaPoint = function (out) {
    var c = this._patrolCenter;
    var angle = Math.random() * 6.283185307179586;
    var radius = Math.sqrt(Math.random()) * this.patrolRadius;
    out.set(c.x + Math.cos(angle) * radius, c.y, c.z + Math.sin(angle) * radius);
    return out;
};


/* =========================================================
   PATRULLA
   ========================================================= */

/* elige un punto de patrulla válido escribiéndolo en out; sin arrays temporales */
CharacterIA.prototype._pickPatrolPoint = function (out) {
    var pts = this.patrolPoints;
    if (!pts || !pts.length) return false;

    var valid = 0, lastIdx = -1, i, p, pp;
    for (i = 0; i < pts.length; i++) {
        p = pts[i];
        if (!p || !p.getPosition || p._guid === this.entity._guid) continue;
        pp = p.getPosition();
        if (!this._insideArea(pp.x, pp.z)) continue;
        if (p._guid === this._lastPickedGuid) lastIdx = valid;
        valid++;
    }
    if (!valid) return false;

    var pick = Math.floor(Math.random() * valid);
    if (valid > 1 && pick === lastIdx) pick = (pick + 1) % valid;

    var k = 0;
    for (i = 0; i < pts.length; i++) {
        p = pts[i];
        if (!p || !p.getPosition || p._guid === this.entity._guid) continue;
        pp = p.getPosition();
        if (!this._insideArea(pp.x, pp.z)) continue;
        if (k === pick) {
            this._lastPickedGuid = p._guid;
            out.set(pp.x, this._patrolCenter.y, pp.z);
            return true;
        }
        k++;
    }
    return false;
};

CharacterIA.prototype._chooseNewPatrolGoal = function () {
    var usePoint = this.patrolPoints && this.patrolPoints.length > 0 && Math.random() < 0.7;
    if (!usePoint || !this._pickPatrolPoint(this._goal)) {
        this._randomAreaPoint(this._goal);
    }
    this._hasGoal = true;
    this._hasAvoid = false;
};

CharacterIA.prototype._chooseGoalAwayFromWall = function (pos, away) {
    var dist = 2 + Math.random() * Math.max(2, this.patrolRadius - 2);
    this._goal.set(pos.x + away.x * dist, this._patrolCenter.y, pos.z + away.z * dist);
    this._clampToArea(this._goal);
    this._hasGoal = true;
    this._hasAvoid = false;
};

CharacterIA.prototype._startPause = function () {
    this._pauseRemaining = this._pauseTime * (0.5 + Math.random());
};


/* =========================================================
   PERCEPCIÓN
   ========================================================= */

CharacterIA.prototype._findNearestEnemy = function (pos, nowMs) {
    var tag = this._enemyTag;
    if (!tag) return null;

    var ignoreGuid = (nowMs < this._ignoredUntilMs) ? this._ignoredEnemyGuid : null;
    var detectSq = this._enemyDetectSq;

    /* atajo: el jugador ya está cacheado por GameManager */
    if (tag === 'is-player' && typeof GameManager !== 'undefined' && GameManager.playerEntity) {
        var pl = GameManager.playerEntity;
        if (pl.enabled && pl._guid !== ignoreGuid && pl._guid !== this.entity._guid) {
            var pp = pl.getPosition();
            var dy = pp.y - pos.y;
            if (dy < IA_DETECT_MAX_DY && dy > -IA_DETECT_MAX_DY && this._flatDistSq(pos, pp) <= detectSq) {
                return pl;
            }
        }
        return null;
    }

    var list = CharacterIA._getTagList(this.app, tag);
    if (!list || !list.length) return null;

    var best = null;
    var bestSq = Infinity;
    for (var i = 0; i < list.length; i++) {
        var ent = list[i];
        if (!ent || !ent.enabled || !ent.getPosition) continue;
        if (ent._guid === this.entity._guid || ent._guid === ignoreGuid) continue;
        var ep = ent.getPosition();
        var dy2 = ep.y - pos.y;
        if (dy2 > IA_DETECT_MAX_DY || dy2 < -IA_DETECT_MAX_DY) continue;
        var dSq = this._flatDistSq(pos, ep);
        if (dSq <= detectSq && dSq < bestSq) {
            best = ent;
            bestSq = dSq;
        }
    }
    return best;
};

/* línea de visión presupuestada.
   true = libre | false = bloqueada | null = sin presupuesto este frame.
   passEntity: impactar contra el propio objetivo cuenta como visible. */
CharacterIA.prototype._checkLOS = function (fromPos, toPos, passEntity) {
    IA_from.set(fromPos.x, fromPos.y + this._probeHeight, fromPos.z);
    IA_to.set(toPos.x, toPos.y + this._probeHeight, toPos.z);
    var hit = CharacterIA._budgetRaycast(this.app, IA_from, IA_to);
    if (hit === undefined) return null;
    if (!hit) return true;
    if (passEntity && hit.entity === passEntity) return true;
    return false;
};

CharacterIA.prototype._updateEnemyMemory = function (dt, pos, nowMs) {
    var found = this._findNearestEnemy(pos, nowMs);

    if (found) {
        if (!this._enemyEntity || this._enemyEntity._guid !== found._guid) {
            /* nuevo objetivo: confirmar con línea de visión (no ve a través
               de paredes); sin presupuesto se reintenta el próximo tick */
            if (this._checkLOS(pos, found.getPosition(), found) !== true) {
                found = null;
            } else {
                this.onEnemySpotted(found);
                this._unreachableTimer = 0;
            }
        }

        if (found) {
            this._enemyEntity = found;
            this._enemyLastSeen.copy(found.getPosition());
            this._hasEnemySeen = true;
            this._enemyLossTimer = 0;
            return;
        }
    }

    if (this._enemyEntity) {
        if (this._enemyEntity.enabled) {
            this._enemyLastSeen.copy(this._enemyEntity.getPosition());
            this._hasEnemySeen = true;
        }
        this._enemyLossTimer += dt;
        if (this._enemyLossTimer >= this._enemyForgetDelay) {
            this.onEnemyLost(this._enemyEntity);
            this._enterPatrolShift(pos);
        }
        return;
    }

    if (this._hasEnemySeen) {
        this._enemyLossTimer += dt;
        if (this._enemyLossTimer >= this._enemyForgetDelay) {
            this._hasEnemySeen = false;
            this._enemyLossTimer = 0;
        }
    }
};

/* posición del enemigo trackeado (referencia, sin clone) o null */
CharacterIA.prototype._trackedEnemyPos = function () {
    if (this._enemyEntity && this._enemyEntity.enabled) {
        return this._enemyEntity.getPosition();
    }
    if (this._hasEnemySeen && this._enemyLossTimer < this._enemyForgetDelay) {
        return this._enemyLastSeen;
    }
    return null;
};

CharacterIA.prototype._enterPatrolShift = function (pos) {
    this._patrolCenter.copy(pos);
    this._enemyEntity = null;
    this._hasEnemySeen = false;
    this._enemyLossTimer = 0;
    this._unreachableTimer = 0;
    this._returnHomeTimer = this._returnHomeDelay;
    this._chooseNewPatrolGoal();
};

CharacterIA.prototype._maybeReturnHome = function (dt) {
    if (this._returnHomeTimer <= 0) return;
    this._returnHomeTimer -= dt;
    if (this._returnHomeTimer > 0) return;
    this._patrolCenter.copy(this._originHome);
    this._chooseNewPatrolGoal();
};


/* =========================================================
   DECISIÓN / APLICACIÓN
   ========================================================= */

/* mueve hacia target vía input.targetPoint (objeto persistente, sin clones) */
CharacterIA.prototype._applyMove = function (target, attack) {
    var input = this.entity.input;
    this._targetPoint.copy(target);
    input.targetPoint = this._targetPoint;
    input.attack = !!attack;
};

/* frena: targetPoint = posición propia -> doMove entra en stopRadius y frena */
CharacterIA.prototype._applyStop = function (pos) {
    var input = this.entity.input;
    this._targetPoint.copy(pos);
    input.targetPoint = this._targetPoint;
    input.attack = false;
};

/* punto de combate: mantenerse a ~60% del rango, sin empujar al enemigo */
CharacterIA.prototype._combatPoint = function (pos, enemyPos, out) {
    var dx = pos.x - enemyPos.x;
    var dz = pos.z - enemyPos.z;
    var d2 = dx * dx + dz * dz;
    if (d2 < 0.0001) {
        out.copy(pos);
        return;
    }
    var inv = (this._attackRange * 0.6) / Math.sqrt(d2);
    out.set(enemyPos.x + dx * inv, pos.y, enemyPos.z + dz * inv);
};

/* destino de persecución: directo si hay LOS; si está bloqueada, un único
   candidato lateral (alternando lado) validado con 1 raycast */
CharacterIA.prototype._resolveChaseTarget = function (pos, enemyPos, out) {
    var los = this._checkLOS(pos, enemyPos, this._enemyEntity);

    if (los === true) {
        this._hasAvoid = false;
        out.copy(enemyPos);
        return;
    }

    if (los === null) {
        /* sin presupuesto este frame: mantener la decisión previa */
        if (this._hasAvoid) out.copy(this._avoid);
        else out.copy(enemyPos);
        return;
    }

    var dx = enemyPos.x - pos.x;
    var dz = enemyPos.z - pos.z;
    var d2 = dx * dx + dz * dz;
    if (d2 > 0.0001) {
        var inv = 1 / Math.sqrt(d2);
        dx *= inv;
        dz *= inv;
        var side = this._preferredSide;
        this._preferredSide = -side;
        /* candidato = 1 m hacia el enemigo + desvío perpendicular */
        IA_tmpB.set(
            pos.x + dx + (-dz * side) * IA_AVOID_SIDESTEP,
            pos.y,
            pos.z + dz + (dx * side) * IA_AVOID_SIDESTEP
        );
        if (this._checkLOS(pos, IA_tmpB, null) === true) {
            this._avoid.copy(IA_tmpB);
            this._hasAvoid = true;
            out.copy(IA_tmpB);
            return;
        }
    }

    if (this._hasAvoid) out.copy(this._avoid);
    else out.copy(enemyPos);
};

CharacterIA.prototype._doPatrol = function (dt, pos, wallFresh) {
    if (wallFresh) {
        /* pared: detenerse un instante y elegir destino alejándose de ella */
        this.entity.wallTimeMs = -1e9; /* consumir el evento */
        this._chooseGoalAwayFromWall(pos, this.entity.wallAway);
        this._startPause();
        this._state = CharacterIAState.PAUSE;
        this._applyStop(pos);
        return;
    }

    if (!this._hasGoal || this._flatDistSq(pos, this._goal) <= IA_ARRIVAL_RADIUS_SQ) {
        if (this._hasGoal) this.onPatrolGoalReached(this._goal);
        this._chooseNewPatrolGoal();
        this._startPause();
        this._state = CharacterIAState.PAUSE;
        this._applyStop(pos);
        return;
    }

    this._state = CharacterIAState.PATROL;
    this._applyMove(this._goal, false);
};

CharacterIA.prototype._doChaseCombat = function (dt, pos, enemyPos, wallFresh, nowMs) {
    var distSq = this._flatDistSq(pos, enemyPos);

    if (distSq <= this._attackRange * this._attackRange) {
        /* COMBATE: mantener distancia de combate y atacar por cooldown */
        this._unreachableTimer = 0;
        this._state = CharacterIAState.COMBAT;
        this.onEnemyInRange(this._enemyEntity, Math.sqrt(distSq));

        var attack = false;
        if (this._attackCooldownRemaining <= 0) {
            /* a esta distancia, "sin presupuesto" no debe impedir el ataque */
            if (this._checkLOS(pos, enemyPos, this._enemyEntity) !== false) {
                this._attackCooldownRemaining = this._attackCooldown;
                attack = true;
            }
        }

        this._combatPoint(pos, enemyPos, IA_tmpA);
        this._applyMove(IA_tmpA, attack);
        return;
    }

    /* pared durante persecución: suma "inalcanzable"; sin pared, decae */
    if (wallFresh) {
        this.entity.wallTimeMs = -1e9;
        this._unreachableTimer += 1.0;
    } else if (this._unreachableTimer > 0) {
        this._unreachableTimer -= dt * 0.5;
    }

    if (this._unreachableTimer >= IA_UNREACHABLE_LIMIT) {
        /* objetivo inalcanzable: ignorarlo un tiempo y buscar otros */
        if (this._enemyEntity) {
            this._ignoredEnemyGuid = this._enemyEntity._guid;
            this._ignoredUntilMs = nowMs + IA_IGNORE_ENEMY_MS;
            this.onEnemyLost(this._enemyEntity);
        }
        this._enterPatrolShift(pos);
        this._startPause();
        this._state = CharacterIAState.PAUSE;
        this._applyStop(pos);
        return;
    }

    this._state = CharacterIAState.CHASE;
    this._resolveChaseTarget(pos, enemyPos, IA_tmpA);
    this._applyMove(IA_tmpA, false);
};


/* =========================================================
   ATASCO
   ========================================================= */

CharacterIA.prototype._updateStuck = function (dt) {
    var rb = this.entity.rigidbody;
    if (!rb || this._pauseRemaining > 0 || this.entity.input.attack || !this.entity.input.targetPoint) {
        this._stuckTimer = 0;
        return false;
    }

    var v = rb.linearVelocity;
    if ((v.x * v.x + v.z * v.z) <= 0.1) {
        this._stuckTimer += dt;
    } else {
        this._stuckTimer = 0;
    }
    return this._stuckTimer >= IA_STUCK_TIME;
};

CharacterIA.prototype._onStuckRecovery = function (pos) {
    this._stuckTimer = 0;
    if (this._state === CharacterIAState.CHASE) {
        /* atascado persiguiendo: acerca el abandono del objetivo */
        this._unreachableTimer += 1.5;
    }
    this.onStuck(this._state);
    this._chooseNewPatrolGoal();
    this._startPause();
    this._state = CharacterIAState.PAUSE;
    this._applyStop(pos);
};


/* =========================================================
   AI-LOD
   ========================================================= */

CharacterIA.prototype._updateLOD = function (pos) {
    var p = (typeof GameManager !== 'undefined') ? GameManager.playerEntity : null;
    if (!p) {
        this.entity.aiFrequency = IA_FREQ_MID;
        return;
    }
    var d2 = this._flatDistSq(pos, p.getPosition());
    this.entity.aiFrequency = d2 < IA_LOD_NEAR_SQ ? IA_FREQ_NEAR
        : (d2 < IA_LOD_MID_SQ ? IA_FREQ_MID : IA_FREQ_FAR);
};


/* =========================================================
   TICK PRINCIPAL — invocado por GameManager vía character.doAI()
   ========================================================= */

CharacterIA.prototype.doAI = function () {
    if (!this.enabled) return;

    /* dt real acumulado entre ticks (los ticks llegan cada aiFrequency frames) */
    var nowMs = performance.now();
    var dt = (nowMs - this._lastTickMs) * 0.001;
    this._lastTickMs = nowMs;
    if (dt <= 0) return;
    if (dt > 0.5) dt = 0.5;

    var entity = this.entity;
    var pos = entity.getPosition();

    /* probeHeight se deriva de la cápsula del character (lazy: su initialize
       puede correr después del nuestro) */
    if (this._probeHeight === 0) {
        this._probeHeight = (this._character && this._character.characterHeight)
            ? this._character.characterHeight * 0.5 : 1.0;
    }

    this._updateLOD(pos);

    if (this._attackCooldownRemaining > 0) {
        this._attackCooldownRemaining -= dt;
    }

    this._updateEnemyMemory(dt, pos, nowMs);
    this._maybeReturnHome(dt);

    this._resetInput();

    if (this._pauseRemaining > 0) {
        this._pauseRemaining -= dt;
        this._state = CharacterIAState.PAUSE;
        this._applyStop(pos);
        return;
    }

    var wallFresh = entity.wallTimeMs !== undefined &&
        (nowMs - entity.wallTimeMs) < IA_WALL_FRESH_MS;

    var enemyPos = this._trackedEnemyPos();
    if (enemyPos) {
        this._doChaseCombat(dt, pos, enemyPos, wallFresh, nowMs);
    } else {
        this._doPatrol(dt, pos, wallFresh);
    }

    if (this._updateStuck(dt)) {
        this._onStuckRecovery(pos);
    }
};


/* =========================================================
   CICLO DE VIDA / HOOKS
   ========================================================= */

CharacterIA.prototype.onDisable = function () {
    this._resetInput();
    this.entity.input.targetPoint = null;
};

CharacterIA.prototype.onEnable = function () {
    this._lastTickMs = performance.now();
    this._chooseNewPatrolGoal();
};

/*
    Hooks para extender sin tocar la base:
    - onEnemySpotted(enemy)
    - onEnemyLost(enemy)
    - onEnemyInRange(enemy, distance)
    - onPatrolGoalReached(goal)         goal es un Vec3 reutilizado: copiar si se guarda
    - onStuck(state)                    state: CharacterIAState (entero)
*/
CharacterIA.prototype.onEnemySpotted = function () { };
CharacterIA.prototype.onEnemyLost = function () { };
CharacterIA.prototype.onEnemyInRange = function () { };
CharacterIA.prototype.onPatrolGoalReached = function () { };
CharacterIA.prototype.onStuck = function () { };
