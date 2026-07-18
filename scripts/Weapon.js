/*
 * WEAPON.js
 * ---------------------------------------------------------------------------
 * Va en la ENTIDAD que es el arma (espada, hacha, etc.).
 *
 * Qué hace:
 *  - Si la entidad NO tiene collision, la crea como caja (box) y la AJUSTA al
 *    tamaño real del modelo usando su AABB, teniendo en cuenta la escala mundial
 *    (halfExtents = mitadWorld / escalaWorld) y el desplazamiento del centro
 *    respecto al origen de la entidad (linearOffset).
 *  - Engancha los eventos de colisión (triggerenter/triggerleave y, como fallback,
 *    collisionstart/collisionend si el arma tuviera rigidbody).
 *  - Expone metodo + evento publicos: startDamage() / endDamage()
 *    (eventos "startdamage" / "enddamage").
 *  - Mientras esta en modo damage y colisiona contra algo "damagable"
 *    (tag configurable, por defecto "is-damageable"), suma puntos de daño a esa
 *    entidad: acumula en entity.damageTaken y dispara el evento "damage" sobre
 *    la victima para que reaccione (Character.js lo escucha).
 *
 * Contrato con Character.js:
 *  - Character llama a ws.setOwner(entidadPortadora) para que el arma NUNCA
 *    dañe a quien la empuña (la mano esta dentro de su propia capsula).
 *  - Character llama a ws.startDamage() al abrir la ventana de daño de la
 *    animacion de ataque, y ws.endDamage() al cerrarla.
 *
 * NOTA (trigger): para que dispare triggerenter, el arma debe tener collision y
 * NO tener rigidbody dinamico (o ser kinematic). El personaje golpeado ya trae
 * rigidbody + capsula, asi que el solape se detecta al entrar su cuerpo en el
 * volumen del arma.
 *
 * API estable de PlayCanvas Engine v2.x (collision triggers, BoundingBox,
 * Mat4.getScale/invert). Verificar en developer.playcanvas.com si cambia el build.
 */

var Weapon = pc.createScript('weapon');

Weapon.attributes.add('damage', {
    type: 'number', default: 10, min: 0, precision: 1,
    title: 'Damage',
    description: 'Puntos de daño que suma a la entidad damagable por golpe.'
});

Weapon.attributes.add('damageableTag', {
    type: 'string', default: 'is-damageable',
    title: 'Damageable Tag',
    description: 'Tag que debe tener una entidad para recibir daño de esta arma.'
});

Weapon.attributes.add('oneHitPerSwing', {
    type: 'boolean', default: true,
    title: 'One Hit Per Swing',
    description: 'Si esta activo, cada victima recibe daño una sola vez por blandido.'
});

Weapon.attributes.add('fitCollisionToAABB', {
    type: 'boolean', default: true,
    title: 'Fit Collision To AABB',
    description: 'Si el script crea la collision, la ajusta al AABB del modelo (con escala).'
});

Weapon.attributes.add('collisionPadding', {
    type: 'number', default: 0, min: 0, precision: 3,
    title: 'Collision Padding',
    description: 'Margen extra (m) sumado a cada semieje de la caja de colision.'
});

/* NOTA: el arma no trae debug propio — las colisiones se visualizan con el
   AmmoDebugDrawer del gameManager (tracer.trenableammodebugdrawer). */


/* =========================================================
   INIT
   ========================================================= */

Weapon.prototype.initialize = function () {
    this._owner = null;            // entidad portadora (no recibe daño)
    this._damaging = false;        // ventana de daño abierta
    this._overlaps = {};           // guid -> entidad actualmente solapada
    this._hitThisSwing = {};       // guid -> true si ya recibio daño este swing
    this._fitPending = false;
    this._fitAttempts = 0;

    this._ensureCollision();

    const col = this.entity.collision;
    if (col) {
        /* trigger (collision sin rigidbody): el uso previsto */
        col.on('triggerenter', this._onTriggerEnter, this);
        col.on('triggerleave', this._onTriggerLeave, this);
        /* fallback si el arma tuviera rigidbody (firma distinta: result.other) */
        col.on('collisionstart', this._onCollisionStart, this);
        col.on('collisionend', this._onCollisionEnd, this);
        this.entity.tags.add("ignore-camera-collision");
        if (!this.entity.tags.has("can-damage")) this.entity.tags.add("can-damage");
    } else {

    }

    this.on('destroy', this._onDestroy, this);
};


/* =========================================================
   COLISION: crear si falta y ajustar al AABB (con escala)
   ========================================================= */

Weapon.prototype._ensureCollision = function () {
    if (this.entity.collision) {
        /* ya tiene collision: se respeta tal cual, solo se enganchan eventos */
        return;
    }

    var box = this.fitCollisionToAABB ? this._computeLocalBox() : null;

    var halfExtents, offset;
    if (box) {
        halfExtents = box.halfExtents;
        offset = box.center;
    } else {
        halfExtents = Weapon._defaultHE;
        offset = Weapon._defaultOff;
        if (this.fitCollisionToAABB) {
            /* el modelo aun no esta cargado: reintentar en update */
            this._fitPending = true;
        }
    }

    this.entity.addComponent('collision', {
        type: 'box',
        halfExtents: halfExtents,
        linearOffset: offset
    });

};

/* Recalcula halfExtents/linearOffset desde el AABB actual. Publico: util si el
   modelo carga tarde o si cambia la escala. Solo actua sobre collision tipo box. */
Weapon.prototype.refitCollision = function () {
    var col = this.entity.collision;
    if (!col || col.type !== 'box') return false;

    var box = this._computeLocalBox();
    if (!box) return false;

    col.halfExtents = box.halfExtents;
    col.linearOffset = box.center;
    return true;
};

/* AABB combinado (world) del modelo -> caja en espacio LOCAL de la entidad:
   halfExtents desescalados + centro convertido a local (linearOffset). */
Weapon.prototype._computeLocalBox = function () {
    var aabb = this._combinedWorldAABB(this.entity);
    if (!aabb) return null;

    var scale = this._worldScale(this.entity);
    var pad = this.collisionPadding;

    var he = Weapon._scratchVec;
    he.set(
        Math.abs(aabb.halfExtents.x / (scale.x || 1)) + pad,
        Math.abs(aabb.halfExtents.y / (scale.y || 1)) + pad,
        Math.abs(aabb.halfExtents.z / (scale.z || 1)) + pad
    );

    var inv = Weapon._scratchMat.copy(this.entity.getWorldTransform()).invert();
    var localCenter = Weapon._scratchCenter;
    inv.transformPoint(aabb.center, localCenter);

    return { halfExtents: he, center: localCenter };
};
Weapon._scratchVec = new pc.Vec3();
Weapon._scratchCenter = new pc.Vec3();
Weapon._scratchMat = new pc.Mat4();
Weapon._defaultHE = new pc.Vec3(0.05, 0.5, 0.05);
Weapon._defaultOff = new pc.Vec3(0, 0, 0);

/* Union de los AABB (world) de todos los meshInstances del subarbol.
   Devuelve pc.BoundingBox o null si no hay meshes cargadas. */
Weapon.prototype._combinedWorldAABB = function (root) {
    var combined = new pc.BoundingBox();
    var first = true;

    function addMi(mi) {
        if (mi.mesh && mi.mesh.update) mi.mesh.update();
        var a = mi.aabb;
        if (first) { combined.copy(a); first = false; }
        else combined.add(a);
    }

    function walk(node) {
        if (node.render && node.render.meshInstances) {
            for (var i = 0; i < node.render.meshInstances.length; i++) addMi(node.render.meshInstances[i]);
        }
        if (node.model && node.model.meshInstances) {
            for (var j = 0; j < node.model.meshInstances.length; j++) addMi(node.model.meshInstances[j]);
        }
        for (var k = 0; k < node.children.length; k++) walk(node.children[k]);
    }

    walk(root);
    return first ? null : combined;
};

/* Escala mundial (getWorldScale no existe en engine 2.x). */
Weapon.prototype._worldScale = function (entity) {
    var wt = entity.getWorldTransform && entity.getWorldTransform();
    if (wt && wt.getScale) return wt.getScale();
    if (entity.getLocalScale) return entity.getLocalScale();
    return new pc.Vec3(1, 1, 1);
};


/* =========================================================
   VENTANA DE DAÑO (llamado por Character.js)
   ========================================================= */

Weapon.prototype.startDamage = function () {
    this._damaging = true;
    this._hitThisSwing = {};

    /* golpe a bocajarro: dañar a quienes YA estaban solapados al abrir la
       ventana (triggerenter solo dispara al ENTRAR, no si ya estabas dentro). */
    for (var guid in this._overlaps) {
        this._tryDamage(this._overlaps[guid]);
    }

    this.fire('startdamage');

};

Weapon.prototype.endDamage = function () {
    this._damaging = false;
    this.fire('enddamage');

};

Weapon.prototype.isDamaging = function () {
    return this._damaging;
};

/* Character llama a esto al equipar: el arma no daña a su portador. */
Weapon.prototype.setOwner = function (entity) {
    this._owner = entity || null;
};


/* =========================================================
   COLISIONES
   ========================================================= */

Weapon.prototype._onTriggerEnter = function (otherEntity) { this._beginOverlap(otherEntity); };
Weapon.prototype._onTriggerLeave = function (otherEntity) { this._endOverlap(otherEntity); };
Weapon.prototype._onCollisionStart = function (result) { if (result && result.other) this._beginOverlap(result.other); };
Weapon.prototype._onCollisionEnd = function (result) { if (result && result.other) this._endOverlap(result.other); };

Weapon.prototype._beginOverlap = function (other) {
    if (!other || !other._guid) return;
    this._overlaps[other._guid] = other;
    if (this._damaging) this._tryDamage(other);
};

Weapon.prototype._endOverlap = function (other) {
    if (!other || !other._guid) return;
    delete this._overlaps[other._guid];
};

Weapon.prototype._tryDamage = function (other) {
    if (!other || !other.enabled) return;

    /* HITPOINTS (character.js): un hueso golpeado pertenece a un personaje;
       el daño se resuelve contra el PERSONAJE (characterEntity). Asi hay una
       sola vida y UN golpe por swing aunque el arma cruce capsula + varios
       huesos de la misma victima (dedupe por el guid del personaje). */
    var victim = other.characterEntity || other;

    if (this._owner && victim._guid === this._owner._guid) return;  // no dañar al portador (ni sus huesos)
    if (!this._isDamageable(other)) return;
    if (this.oneHitPerSwing && this._hitThisSwing[victim._guid]) return;

    this._hitThisSwing[victim._guid] = true;
    this._dealDamage(victim, other);
};

Weapon.prototype._isDamageable = function (other) {
    if (this.damageableTag && other.tags && other.tags.has(this.damageableTag)) return true;
    /* fallbacks: cualquier cosa con health o con applyDamage tambien vale */
    if (other.health) return true;
    var s = other.script;
    if (s && s.character && typeof s.character.applyDamage === 'function') return true;
    return false;
};

/* victim = entidad que recibe el daño (personaje); hitPart = entidad realmente
   tocada (un hueso-hitpoint o la propia victima si fue la capsula). */
Weapon.prototype._dealDamage = function (victim, hitPart) {
    /* 1) acumulador crudo en la victima: "sumar puntos de daño a la entidad" */
    if (typeof victim.damageTaken !== 'number') victim.damageTaken = 0;
    victim.damageTaken += this.damage;

    /* 2) evento desacoplado: la victima decide como reaccionar (vida, impact...).
          Character.js escucha "damage" en su initialize. El 4o argumento dice
          QUE parte se golpeo ("head", "torso", "leg-l"... o null), listo para
          multiplicadores de daño localizado. */
    victim.fire('damage', this.damage, this._owner, this.entity, (hitPart && hitPart.hitpointName) || null);

    /* 3) evento en el arma por si algo externo quiere reaccionar al golpe */
    this.fire('hit', victim, this.damage, this._owner, hitPart || victim);
};


/* =========================================================
   UPDATE (solo para el ajuste diferido del AABB)
   ========================================================= */

Weapon.prototype.update = function (dt) {
    if (!this._fitPending) return;

    this._fitAttempts++;

    /* ventana inicial (~3s a 60fps): reintento cada frame; el modelo suele
       cargar dentro de ella. Pasada la ventana NO se abandona con la caja
       minima por defecto (dejaba al arma sin poder golpear): si el arma TIENE
       render/model pero aun sin meshes, el asset sigue cargando -> se sigue
       reintentando pero espaciado (barato). Solo se rinde si no existe ningun
       componente renderizable del que derivar el AABB (no habra meshes nunca). */
    var inGrace = this._fitAttempts <= 180;

    if (inGrace || (this._fitAttempts % 30 === 0)) {
        if (this.refitCollision()) {
            this._fitPending = false;
            return;
        }
    }

    if (!inGrace && !this.entity.render && !this.entity.model) {
        this._fitPending = false;  // sin render/model: no hay AABB posible
    }
};


/* =========================================================
   LIMPIEZA
   ========================================================= */

Weapon.prototype._onDestroy = function () {
    var col = this.entity.collision;
    if (col) {
        col.off('triggerenter', this._onTriggerEnter, this);
        col.off('triggerleave', this._onTriggerLeave, this);
        col.off('collisionstart', this._onCollisionStart, this);
        col.off('collisionend', this._onCollisionEnd, this);
    }
    this._overlaps = {};
    this._hitThisSwing = {};
    this._owner = null;
};
