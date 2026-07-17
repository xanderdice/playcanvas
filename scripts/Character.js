/*
El script character proporciona funcionalidades para el control de movimiento 
y detección de colisiones de un personaje en un entorno 3D. 
Algunas características notables incluyen:

ATENCION:
REQUIERE QUE GameManager.js este instalado en la entidad ROOT.

*/

/* VFX
// https://mebiusbox.github.io/contents/EffectTextureMaker/ */

var Character = pc.createScript("character");

Character.attributes.add("speed", { type: "number", default: 1.5, title: "speed", description: "Velocidad del personaje.", min: 1.5, max: 2.5, precision: 1 });
Character.attributes.add("gravity", { type: "number", default: -9.8, title: "gravity", description: "gravity del personaje.", min: -9.8, max: -9.8, precision: 1 });
Character.attributes.add("isSelectable", { type: "boolean", default: false });
Character.attributes.add("isPlayer", { type: "boolean", default: false });
Character.attributes.add("defaultrun", { type: "boolean", default: true });
Character.attributes.add("inertia", { type: "boolean", default: true });
Character.attributes.add("canmoveonair", { type: "boolean", default: false });
Character.attributes.add("templateEntity", { type: "entity", title: "Template", description: "Entidad hija (render + armature) que rota para encarar la dirección de movimiento. Si se deja vacío se autodetecta desde el render." });
Character.attributes.add("playerOptions",
    {
        title: "Player options",
        type: "json",
        schema: [
            {
                name: "playerControllerOnKeyUP",
                type: "string", enum: [
                    { "MoveForward": "MoveForward" },
                    { "Jump": "Jump" }
                ], default: "MoveForward"
            }, {
                name: "playerControllerOnKeyRight",
                type: "string", enum: [
                    { "Rotate": "Rotate" },
                    { "Strafe": "Strafe" }
                ], default: "Rotate"
            },
            {
                name: "rotationEventDelay",
                title: "rotationEventDelay",
                type: "number",
                default: 0
            }
        ]
    });

Character.attributes.add("ccd",
    {
        title: "ccd",
        type: "json",
        schema: [
            {
                name: "enabled",
                type: "boolean",
                default: true,
                title: "enabled",
                description: "enables ccd"
            },
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
                description: "The constraint solver can discard solving contacts, if the distance is above this threshold. 0 by default. \n Note that using contacts with positive distance can improve stability. It increases, however, the chance of colliding with degerate contacts, such as 'interior' triangle edges"
            }
        ]
    });


Character.attributes.add("sensorOptions",
    {
        title: "Sensor options",
        type: "json",
        schema: [
            {
                name: "enabled",
                type: "boolean",
                default: true,
                title: "enabled",
                description: "enables sensorOptions"
            },
            {
                name: "sensorDebug",
                type: "boolean",
                default: false
            },
            {
                name: "sensorJumpDebug",
                type: "boolean",
                default: false
            }
            ,
            {
                name: "groundtolerance",
                type: "number",
                description: "ground tolerance for steps",
                default: 0.15,
                min: 0.1,
                max: 0.5
            }
        ]
    });

Character.attributes.add("tracerOptions",
    {
        title: "Trace Options",
        type: "json",
        schema: [
            {
                name: "enabled",
                type: "boolean",
                default: true,
                title: "enabled",
                description: "enables Tracer Options"
            },
            {
                name: "traceinput",
                type: "boolean",
                default: false
            },
            {
                name: "tracedetector",
                type: "boolean",
                default: false
            },
            {
                name: "traceattack",
                type: "boolean",
                default: false
            }
        ]
    });
/* NOTA: los antiguos traceplayercapsule/tracehitpoints se eliminaron — todas
   las colisiones (capsula, hitpoints, armas, mundo) se visualizan con el
   AmmoDebugDrawer del gameManager (tracer.trenableammodebugdrawer). */


Character.attributes.add("playerAnimationsOptions",
    {
        title: "Player Animations Options",
        type: "json",
        schema: [
            {
                name: "global",
                title: "Motion Root (global)",
                description: "Modo de motion root GLOBAL. En 'none' (default), cada animacion " +
                    "usa su propio selector 'motion root' (esta debajo de cada animacion). " +
                    "Con cualquier otro valor, ese valor manda sobre TODAS las animaciones: " +
                    "place-in-<ejes> = el modelo queda CLAVADO en su sitio en esos ejes (el " +
                    "desplazamiento de la animacion se descarta; la capsula se mueve solo por " +
                    "input/fisica); teleport = la animacion mueve al modelo y la capsula lo sigue.",
                type: "string", enum: [
                    { "none": "none" },
                    { "teleport": "teleport" },
                    { "place-in-x": "place-in-x" },
                    { "place-in-y": "place-in-y" },
                    { "place-in-z": "place-in-z" },
                    { "place-in-zx": "place-in-zx" },
                    { "place-in-zy": "place-in-zy" },
                    { "place-in-yx": "place-in-yx" },
                    { "place-in-zxy": "place-in-zxy" }],
                default: "none"
            }
        ]
    });


Character.attributes.add("bones",
    {
        title: "bones",
        type: "json",
        schema: [
            {
                name: "autodetectFromMixamoArmature",
                type: "boolean",
                default: true
            },
            {
                name: "hips",
                type: "entity",
                default: null
            },
            {
                name: "leftHand",
                type: "entity",
                default: null
            },
            {
                name: "rightHand",
                type: "entity",
                default: null
            },
            {
                name: "leftFoot",
                type: "entity",
                default: null
            },
            {
                name: "rightFoot",
                type: "entity",
                default: null
            },
            {
                name: "leftLeg",
                type: "entity",
                default: null
            },
            {
                name: "rightLeg",
                type: "entity",
                default: null
            },
            {
                name: "spine2",
                type: "entity",
                default: null
            },
            {
                name: "head",
                type: "entity",
                default: null
            },
        ]
    });



Character.attributes.add("carryWeapons",
    {
        title: "Carry Weapons",
        type: "json",
        schema: [

            {
                name: "leftHandWeaponEntity",
                type: "entity",
                default: null
            },
            {
                name: "rightHandWeaponEntity",
                type: "entity",
                default: null
            }


        ]
    });


Character.attributes.add("attackSystem",
    {
        title: "attackSystem",
        type: "json",
        schema: [
            {
                name: "canAttack",
                type: "boolean",
                default: true
            },
            {
                name: "walkAndAttack",
                type: "boolean",
                default: false
            }
        ]
    });


Character.attributes.add("health",
    {
        title: "health",
        type: "json",
        schema: [
            {
                name: "max",
                type: "number",
                default: 100,
                min: 1,
                title: "max",
                description: "Vida maxima del personaje. Al llegar a 0 se dispara la animacion de muerte."
            }
        ]
    });


/* CULLING FÍSICO AGRESIVO (opcional). OFF por defecto: activarlo apaga rigidbody
   y collision de los NPCs que llevan 'physicsCullDelay' segundos fuera de cámara
   y NO están en combate, ahorrando simulación de Ammo.js. Se reactivan al volver
   a ser visibles. El PLAYER nunca se culla. */
Character.attributes.add("cullingOptions",
    {
        title: "Culling options",
        type: "json",
        schema: [
            {
                name: "physicsCulling",
                type: "boolean",
                default: true,
                title: "Physics culling",
                description: "Apaga rigidbody+collision de NPCs fuera de cámara (no en combate) para ahorrar Ammo.js."
            },
            {
                name: "physicsCullDelay",
                type: "number",
                default: 2,
                min: 0,
                title: "Physics cull delay (s)",
                description: "Segundos fuera de cámara antes de apagar la física del NPC."
            }
        ]
    });


/* HITPOINTS por hueso: al habilitarlo, cada hueso de la seccion bones recibe
   una collision (trigger, sin rigidbody: detecta pero no empuja ni pesa)
   dimensionada automaticamente a partir del MISMO characterHeight que ya
   dimensiona la capsula y la masa. Base para daño localizado (headshots, etc.).
   Ver _setupHitpoints. Visualizacion: AmmoDebugDrawer del gameManager
   (hitpoints en amarillo, capsulas de personaje en rojo). */
Character.attributes.add("hitpointsoptions",
    {
        title: "hitpointsoptions",
        type: "json",
        schema: [
            {
                name: "enabled",
                type: "boolean",
                default: true,
                title: "enabled",
                description: "enables hitpointsoptions"
            }
        ]
    });


/* ONAIR = modo de locomoción "en el aire" (salto). Va en el ÍNDICE 1, contiguo
   a UNARMED, para que el armado de transiciones entre modos contiguos genere
   directamente unarmed<->onair. El VALOR del modo debe coincidir con su índice
   en animation_modes (el grafo filtra con value: m). torch/armed_2w se corren a
   2/3 pero son inertes en runtime (input.mode nunca se setea; ver GameManager). */
const CharacterLocomotionModeEnum = Object.freeze({
    UNARMED: 0,
    ONAIR: 1,
    TORCH: 2,
    ARMED_2W: 3
});

Character.animation_modes = ["unarmed", "onair", "torch", "armed_2w"];
Character.animation_idles = ["idle", "idle_searching", "idle_examine", "idle_resting", "idle_hit"];
Character.animation_attack = ["attack1"];

Character.animation_states = [
    "death1",
    "death2",
    "walking",
    "walking_backward",
    "walking_turn_180",
    "running",
    "running_backward",
    "onair",
    "landing",
    "impact_block",
    "impact1",
    "impact2"
];

Character.animation_custom_states = [
    /*{
        modeName: "unarmed",
        name: "custom_state_name"
    }*/
];





for (var a_s = 0; a_s < Character.animation_modes.length; a_s++) {
    var modeName = (Character.animation_modes[a_s] || "");
    var statesSchema = Character.animation_custom_states.filter(function (s) {
        return s.modeName === modeName;
    });

    for (var i = 0; i < Character.animation_idles.length; i++) {
        statesSchema.push({
            name: modeName + "_" + Character.animation_idles[i],
            type: "asset",
            assetType: "animation"
        });
    }
    for (var i = 0; i < Character.animation_attack.length; i++) {
        statesSchema.push({
            name: modeName + "_" + Character.animation_attack[i],
            type: "asset",
            assetType: "animation"
        });
    }
    for (var i = 0; i < Character.animation_states.length; i++) {
        statesSchema.push({
            name: modeName + "_" + Character.animation_states[i],
            type: "asset",
            assetType: "animation"
        });
    }


    for (var i = 0; i < statesSchema.length; i++) {
        statesSchema[i].name = modeName + "_" + (statesSchema[i].name || "").replace(modeName + "_", "");
        statesSchema[i].type = "asset";
        statesSchema[i].assetType = "animation";
    }

    if (statesSchema.length > 0) {
        /* Debajo de CADA animación va su selector "<anim>_rootmotion" (en el MISMO
           grupo, no en un grupo aparte). El selector dice qué hacer con el
           desplazamiento que la animación trae "de fábrica":
             - none         : no se hace nada (la animación se ve tal cual)
             - teleport     : la animación se desplaza sola y la cápsula (física)
                              la sigue por debajo (para ataques/embestidas)
             - place-in-<ejes> (x, y, z, zx, zy, yx, zxy):
                              en esos ejes el modelo queda CLAVADO en su sitio
                              (el desplazamiento de la animación se descarta);
                              la cápsula se mueve SOLO por input/física
           SOLO se usan cuando el global (Motion Root global) está en "none". */
        const fullSchema = [];
        for (let fs = 0; fs < statesSchema.length; fs++) {
            fullSchema.push(statesSchema[fs]);
            fullSchema.push({
                name: statesSchema[fs].name + "_rootmotion",
                title: "motion root",
                type: "string",
                enum: [
                    { "none": "none" },
                    { "teleport": "teleport" },
                    { "place-in-x": "place-in-x" },
                    { "place-in-y": "place-in-y" },
                    { "place-in-z": "place-in-z" },
                    { "place-in-zx": "place-in-zx" },
                    { "place-in-zy": "place-in-zy" },
                    { "place-in-yx": "place-in-yx" },
                    { "place-in-zxy": "place-in-zxy" }
                ],
                default: "none"
            });
        }

        Character.attributes.add("animations_" + modeName,
            {
                title: "Animations " + modeName,
                type: "json",
                schema: fullSchema
            }
        );
    }

}




/**
 * Enumeration representing the various states of the character"s attack system.
 * @readonly
 * @enum {number}
 */
const CharacterAttackSystemStatusEnum = Object.freeze({
    /**
     * No attack or damage is occurring.
     * @type {number}
     */
    NONE: 0,

    /**
     * The character is in the process of attacking but is not yet causing damage.
     * @type {number}
     */
    ATTACKING: 1,

    /**
     * The character is actively attacking and causing damage.
     * @type {number}
     */
    DAMAGING: 2,

    /**
     * The character is ending the attack phase, possibly with a final animation or finishing move.
     * @type {number}
     */
    ENDING: 3,
});



Character.prototype.initialize = function () {
    /* BLINDAJE de atributos json: si la escena guarda datos de una versión
       vieja del script (sin re-parsear en el editor), un grupo puede llegar
       null y una sola lectura (p.ej. this.attackSystem.canAttack) rompería
       TODO el initialize -> personaje muerto, sin movimiento ni armas.
       Con esto el script arranca siempre, con defaults seguros. */
    this.playerOptions = this.playerOptions || {};
    this.ccd = this.ccd || { enabled: false };
    this.sensorOptions = this.sensorOptions || {};
    this.tracerOptions = this.tracerOptions || {};
    this.playerAnimationsOptions = this.playerAnimationsOptions || {};
    this.bones = this.bones || { autodetectFromMixamoArmature: true };
    this.carryWeapons = this.carryWeapons || {};
    this.attackSystem = this.attackSystem || { canAttack: true, walkAndAttack: false };
    this.health = this.health || { max: 100 };
    this.cullingOptions = this.cullingOptions || { physicsCulling: false, physicsCullDelay: 2 };
    this.hitpointsoptions = this.hitpointsoptions || { enabled: false };

    this.entity.isCharacter = true;
    if (this.entity.isCharacter) {
        this.entity.tags.add("is-character");
    }
    this.entity.isPlayer = this.isPlayer;
    if (this.entity.isPlayer) {
        this.entity.tags.add("is-player");
    }
    this.entity.isSelectable = this.isSelectable;
    if (this.entity.isSelectable) {
        this.entity.tags.add("is-selectable");
    }
    this.entity.selected = this.entity.isPlayer;
    this.entity.tags.add("is-detectable");

    /* INPUT */
    this.entity.input = {};
    this.entity.input.targetEntity = null;




    this.pointCharacterEntity = new pc.Entity()
    this.pointCharacterEntity.name = (this.entity.isPlayer ? "player-" : "") + "point-character-entity";
    this.pointCharacterEntity.tags.add(this.pointCharacterEntity.name);
    /* scene.root lo asigna el scene handler AL CARGAR la escena; si este script
       inicializa antes (o la escena se instancia por código), sería null y
       rompería todo el initialize -> fallback al root de la app */
    (this.app.scene.root || this.app.root).addChild(this.pointCharacterEntity);



    this._doMoveBusy = false;


    this._curPosition = this.entity.getPosition();



    this.renderCharacterComponent = this.entity.findComponent("render");

    this.entity.renderCharacterComponent = this.renderCharacterComponent;
    if (this.renderCharacterComponent) {
        this.renderCharacterComponent.entity.tags.add("uranus-instancing-exclude");
    }
    /* meshInstance para el culling por visibilidad de doMove. Si todavía no hay
       meshes (asset sin cargar o render desactivado), se usa un placeholder
       VISIBLE y doMove adopta la mesh real cuando aparezca. El placeholder viejo
       era { visibleThisFrame: false }: dejaba al personaje CONGELADO para
       siempre (sin movimiento, sin animación, "sin agarrar armas"). */
    this._characterMeshInstance =
        (this.renderCharacterComponent && (this.renderCharacterComponent.meshInstances || [])[0]) ||
        { visibleThisFrame: true, __placeholder: true };




    this._jumpAvailable = true;
    this._jumpKeyHeld = false;   /* flanco de subida de Espacio (input.jump es isPressed) */
    this._jumping = false;      /* en el aire por un salto propio (hasta aterrizar) */


    this._animStateGraphData = null;


    this.entity.attackSystem = {
        canAttack: this.attackSystem.canAttack,
        walkAndAttack: this.attackSystem.walkAndAttack,
        status: CharacterAttackSystemStatusEnum.NONE,
        attackInput: false,
        attackInputOld: false,
        canDoAttack: true,
        __elapsedTime: 0,
        leftHandWeaponScript: null,
        rightHandWeaponScript: null,
    };

    /* VIDA / DAÑO: el personaje es "damagable". El arma (weapon.js) le hace daño
       disparando el evento "damage" sobre esta entidad; _onReceiveDamage lo aplica. */
    this.entity.tags.add("is-damageable");
    this.entity.health = {
        max: this.health.max,
        current: this.health.max,
        alive: true
    };
    this.entity.on("damage", this._onReceiveDamage, this);


    if (!this.bones.hips && this.bones.autodetectFromMixamoArmature) {
        this.bones.hips = this.entity.findByName("mixamorig:Hips");
    }
    if (!this.bones.leftHand && this.bones.autodetectFromMixamoArmature) {
        this.bones.leftHand = this.entity.findByName("mixamorig:LeftHand");
    }
    if (!this.bones.rightHand && this.bones.autodetectFromMixamoArmature) {
        this.bones.rightHand = this.entity.findByName("mixamorig:RightHand");
    }
    if (!this.bones.leftFoot && this.bones.autodetectFromMixamoArmature) {
        this.bones.leftFoot = this.entity.findByName("mixamorig:LeftFoot");
    }
    if (!this.bones.rightFoot && this.bones.autodetectFromMixamoArmature) {
        this.bones.rightFoot = this.entity.findByName("mixamorig:RightFoot");
    }
    if (!this.bones.leftLeg && this.bones.autodetectFromMixamoArmature) {
        this.bones.leftLeg = this.entity.findByName("mixamorig:LeftLeg");
    }
    if (!this.bones.rightLeg && this.bones.autodetectFromMixamoArmature) {
        this.bones.rightLeg = this.entity.findByName("mixamorig:RightLeg");
    }
    if (!this.bones.spine2 && this.bones.autodetectFromMixamoArmature) {
        this.bones.spine2 = this.entity.findByName("mixamorig:Spine2");
    }
    if (!this.bones.head && this.bones.autodetectFromMixamoArmature) {
        this.bones.head = this.entity.findByName("mixamorig:Head");
    }

    if (this.bones.hips) {
        this.playerAnimationsOptions.startPosition = this.bones.hips.getLocalPosition().clone();
    }
    if (this.renderCharacterComponent) {
        this.renderCharacterComponent.rootBone = this.bones.hips;
    }

    /* TEMPLATE (hijo con render/armature): se resuelve aquí porque el height se
       deriva de SU AABB, y el giro de más abajo reutiliza esta misma referencia. */
    this._templateEntity = this._resolveTemplateEntity();

    /* HEIGHT: extensión en Y del AABB (world) del subárbol del TEMPLATE, que es el
       modelo visible. Se basa en el template para no inflar la altura con hijos
       ajenos de la cápsula (cápsula de debug, props sujetos, etc.). Cae a toda la
       jerarquía si el template no diera meshes, y a 2 m como último recurso. */
    this.characterHeight =
        (this._templateEntity && getTotalHeight(this._templateEntity)) ||
        getTotalHeight(this.entity) ||
        2;
    this.characterRadius = 0.5;

    if (!this.entity.collision) {
        this.entity.tags.add("uranus-instancing-exclude");
        this.entity.addComponent("collision", {
            type: "capsule",
            radius: this.characterRadius,
            height: this.characterHeight,
            sides: 4,
            heightSegments: 1
        });
    }
    /* SIEMPRE registrar los eventos (aunque la collision venga creada desde el editor):
       la detección de suelo por contactos depende de ellos */
    this.entity.collision.on("collisionstart", this.characterCollisionStart, this);
    this.entity.collision.on("collisionend", this.characterCollisionEnd, this);
    this.entity.other = null;

    /* IS ON AIR  &  IS ON GROUND */
    this.entity.isonair = false;
    this.entity.isonground = true;







    /* SUELO POR CONTACTOS: _updateGroundedState() no lanza raycasts; el estado se alimenta
       de los eventos collisionstart/collisionend de la cápsula. */
    this._groundContacts = 0;   // cuántas superficies "suelo" nos sostienen
    this._groundBy = {};        // guid de entidad -> true si nos está sosteniendo
    this._coyoteTime = 0;       // gracia anti-parpadeo de manifolds de Bullet

    /* CULLING FÍSICO (ver cullingOptions): tiempo acumulado fuera de cámara y si
       la física ya está apagada. Solo se usan en NPCs con physicsCulling activo. */
    this._invisibleTime = 0;
    this._physicsCulled = false;

    /* contacto de PARED más reciente (lo consume CharacterIA): dirección
       horizontal de escape + timestamp en ms */
    this.entity.wallAway = new pc.Vec3();
    this.entity.wallTimeMs = -1e9;

    /* Tope del casquete inferior de la cápsula, relativo al origen de la entidad:
       solo contactos por debajo de esta cota cuentan como suelo. Se leen las
       dimensiones reales del componente collision (puede venir del editor con
       valores distintos a characterHeight/Radius). +0.02 de tolerancia por el
       margen de contactos de Bullet. Precalculado: cero coste por contacto. */
    var col = this.entity.collision;
    var colHeight = (col && col.type === "capsule") ? col.height : this.characterHeight;
    var colRadius = (col && col.type === "capsule") ? col.radius : this.characterRadius;
    /* getWorldScale() no existe en engine 2.x: derivar de la matriz mundial,
       con fallback a la escala local */
    var scaleY = 1;
    if (this.entity.getWorldTransform) {
        var wt = this.entity.getWorldTransform();
        if (wt && wt.getScale) scaleY = Math.abs(wt.getScale().y) || 1;
    } else if (this.entity.getLocalScale) {
        scaleY = Math.abs(this.entity.getLocalScale().y) || 1;
    }
    this._capsuleBaseOffset = (-(colHeight * 0.5) + colRadius) * scaleY + 0.02;

    /* SALTO: el apex del salto es la MITAD del height real (escalado) de la
       cápsula. Precalculado aquí; la velocidad se deriva con v = sqrt(2*g*h). */
    this._jumpApexHeight = (colHeight * scaleY) * 0.5;

    /* REFUERZO DE SUELO por raycast (ver _probeGroundBelow): cotas Y del rayo
       corto relativas al origen de la entidad. Arranca 0.02 m DENTRO del casquete
       inferior (así Bullet no reporta auto-impacto) y baja hasta 'groundtolerance'
       por debajo de la punta de la cápsula. Precalculado: cero coste por consulta. */
    var groundtol = (this.sensorOptions && typeof this.sensorOptions.groundtolerance === "number")
        ? this.sensorOptions.groundtolerance : 0.15;
    var bottomTipY = -(colHeight * 0.5) * scaleY;   // punta inferior de la cápsula
    this._groundProbeStartY = bottomTipY + 0.02;
    this._groundProbeEndY = bottomTipY - groundtol;








    const linearYfactor = this.canmoveonair ? 0 : 1;

    if (!this.entity.rigidbody) {
        var mass = getCharacterMassFromCapsule(this.entity);

        this.entity.addComponent("rigidbody", {
            type: "dynamic",         // Tipo de cuerpo rígido (puede ser "dynamic", "static" o "kinematic")
            mass: mass,              // Masa del cuerpo rígido
            friction: 1,          // Coeficiente de fricción
            restitution: 0,       // Coeficiente de restitución (rebote)
            linearDamping: 0.0,     // Amortiguación lineal
            angularDamping: 0.0,    // Amortiguación angular
            linearFactor: new pc.Vec3(1, linearYfactor, 1),  // Permitir movimiento en los ejes X y Z, pero no en el eje Y
            angularFactor: new pc.Vec3(0, 0, 0)
        });
    }

    /* VUELO: aplicar SIEMPRE el linearFactor según canmoveonair (el rigidbody
       puede venir creado desde el editor y quedaría con gravedad activa),
       y soportar el cambio del atributo en runtime */
    this.entity.rigidbody.linearFactor = new pc.Vec3(1, linearYfactor, 1);
    this.on("attr:canmoveonair", function (value) {
        const rb = this.entity.rigidbody;
        if (!rb) return;
        rb.linearFactor = new pc.Vec3(1, value ? 0 : 1, 1);
        /* al entrar/salir de vuelo, cortar la velocidad vertical acumulada */
        const v = this._vLinStop.copy(rb.linearVelocity);
        v.y = 0;
        rb.linearVelocity = v;
    }, this);

    var ccd;
    if (this.ccd.enabled) {
        (ccd = this.entity.rigidbody.body)?.setCcdMotionThreshold(this.ccd.motionThreshold);
        ccd?.setCcdSweptSphereRadius(this.ccd.sweptSphereRadius);
        ccd?.setContactProcessingThreshold(this.ccd.contactProcessingThreshold);
    }

    /* HITPOINTS por hueso (hitboxes localizadas). Va aquí porque necesita
       characterHeight (calculado arriba) y los huesos ya automapeados.
       Visualización: AmmoDebugDrawer del gameManager (en amarillo). */
    this._hitpoints = [];
    if (this.hitpointsoptions.enabled) {
        this._setupHitpoints();
    }

    this.prepareAnimComponent();




    /* OPTIMIZACION (GC): vectores/quats reutilizables para evitar "new pc.Vec3()" / ".clone()"
       en el hot-path (doMove, _updateGroundedState, rootMotionFix). Cada uno tiene una única responsabilidad
       dentro de una misma llamada para evitar aliasing entre ellos. */
    this._vDirToTarget = new pc.Vec3();    // dirección del NPC hacia su objetivo (doMove)
    this._vDirection = new pc.Vec3();      // dirección de movimiento deseada
    this._vCamForward = new pc.Vec3();     // forward de cámara/objetivo (temporal)
    this._vCamRight = new pc.Vec3();       // right de cámara/objetivo (temporal)
    this._vDesired = new pc.Vec3();        // velocidad deseada
    this._vCurrent = new pc.Vec3();        // velocidad lineal actual (lectura/escritura)
    this._vAccel = new pc.Vec3();          // aceleración / fuerza a aplicar
    this._vLinStop = new pc.Vec3();        // velocidad lineal al detenerse
    this._vAngStop = new pc.Vec3();        // velocidad angular al detenerse
    this._vAngTurn = new pc.Vec3();        // velocidad angular al girar
    this._vFaceDir = new pc.Vec3();        // dirección a la que mirar
    this._vForward = new pc.Vec3();        // forward actual de la entidad (temporal)
    this._vJump = new pc.Vec3();           // velocidad lineal al saltar
    this._vProbeStart = new pc.Vec3();     // origen del raycast de refuerzo de suelo
    this._vProbeEnd = new pc.Vec3();       // destino del raycast de refuerzo de suelo

    /* MOTION ROOT — estado persistente entre frames (ver rootMotionFix) */
    this._vHipsPinnedPos = new pc.Vec3();  // posición de hips ya clavada (place-in)
    this._vHipsPrevLocal = new pc.Vec3();  // pose local de hips del frame anterior
    this._vHipsDeltaLocal = new pc.Vec3(); // cuánto se movió hips este frame (local)
    this._vHipsDeltaWorld = new pc.Vec3(); // ese movimiento convertido a mundo
    this._vTemplatePos = new pc.Vec3();    // posición compensada del template (teleport)
    this._teleportShifted = false;         // el template tiene compensación acumulada
    this._rootMotionState = null;          // último estado de anim muestreado
    this._rootMotionPrimed = false;        // ya hay un frame previo válido

    /* caché del modo (se recalcula SOLO al cambiar de animación o de valor en
       el editor; el resto de frames son comparaciones baratas, cero basura GC) */
    this._rootMotionKey = null;            // "<anim>_rootmotion" de la anim en curso
    this._rootMotionTable = null;          // tabla animations_<modo> de la anim en curso
    this._rootMotionRaw = "__dirty__";     // último texto de modo parseado
    this._motionKind = 0;                  // tipo interno (CharacterMotionKindEnum)
    this._motionUseX = false;              // clavar el modelo en el eje X
    this._motionUseY = false;              // clavar el modelo en el eje Y
    this._motionUseZ = false;              // clavar el modelo en el eje Z

    /* CONDUCCIÓN por root motion (solo modo teleport): la cápsula se mueve
       fijando su VELOCIDAD (nunca con rigidbody.teleport(): eso rompe los
       contactos de suelo y pelea con las fuerzas de doMove).
       "driving" decide quién conduce: la animación o el input (doMove). */
    this._rootMotionDriving = false;       // true = la animación conduce la cápsula
    this._vRootMotionVel = new pc.Vec3();  // velocidad que la animación pide este frame
    this._vRootMotionVelAvg = new pc.Vec3(); // media suavizada (decide driving, con histéresis)
    this._vCapsulePrevPos = new pc.Vec3(); // posición previa de la cápsula (teleport)

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     *  GIRO DEL TEMPLATE (hijo con render/armature), NO de la cápsula.
     *  Se toma la rotación y escala ACTUALES del template como baseline/punto de
     *  partida (da igual si viene rotado en X/Y o con escala 0.01). El giro se
     *  reproduce sobre el template EXACTAMENTE como el sistema anterior rotaba la
     *  cápsula (template.worldRot = Ry(yaw) · baseline), así el jugador no nota el
     *  cambio. La cápsula queda bloqueada en rotación (angularFactor 0).
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
    this._qYaw = new pc.Quat();            // rotación de yaw (world Y) a aplicar
    this._qTemplateTarget = new pc.Quat(); // rotación world objetivo del template
    /* this._templateEntity ya se resolvió arriba (para el height) */

    if (this._templateEntity) {
        this._templateWorldBase = this._templateEntity.getRotation().clone();
        this._templateBaseScale = this._templateEntity.getLocalScale().clone();
        /* posición local de reposo del template: el modo teleport la desplaza para
           compensar el movimiento de la cápsula y debe poder restaurarla */
        this._templateBaseLocalPos = this._templateEntity.getLocalPosition().clone();
        this._templateYaw = 0;
        this._templateYawApplied = 0;   // último yaw efectivamente escrito (dedupe)

        /* Referencia = orientación horizontal INICIAL de la cápsula. Reproducimos
           sobre el template el mismo yaw absoluto que la cápsula habría aplicado,
           por lo que el resultado es idéntico al sistema anterior (que rotaba la
           cápsula y el template la seguía como hijo). La cápsula está siempre
           vertical => su forward es horizontal => sin caso degenerado. */
        var capsuleForward = this.entity.forward.clone();
        capsuleForward.y = 0;
        this._templateRefYaw = (capsuleForward.lengthSq() < 0.000001) ? 0 : Math.atan2(capsuleForward.x, capsuleForward.z);

        /* La cápsula NO rota: bloquear todos los ejes angulares. */
        this.entity.rigidbody.angularFactor = new pc.Vec3(0, 0, 0);

        /* dejar el template en su baseline (yaw 0) de forma consistente */
        this._applyTemplateRotation();
    } else {
        /* Sin template (render en la propia cápsula): comportamiento anterior,
           la cápsula rota en Y. */
        this.entity.rigidbody.angularFactor = new pc.Vec3(0, 1, 0);
    }

    this.entity.mode = CharacterLocomotionModeEnum.UNARMED;



    this.on("destroy", this._onDestroy, this);

    /* (sin listener attr:tracerOptions: traceinput/tracedetector/traceattack se
       leen en vivo donde se usan; los wireframes por-script se eliminaron a
       favor del AmmoDebugDrawer del gameManager) */




    /* ******************************************************************************** */
    /* HELPER FUNCTIONS
    /* ******************************************************************************** */

    function getCharacterMassFromCapsule(entity) {
        var DEFAULT_MASS = 70;                 // kg
        var ORGANIC_CAPSULE_DENSITY = 170;     // kg/m³

        if (!entity || !entity.collision || !entity.collision.enabled) {
            return DEFAULT_MASS;
        }

        var collision = entity.collision;

        if (collision.type !== "capsule") {
            return DEFAULT_MASS;
        }

        var scale = null;

        // Preferimos escala mundial (de la matriz; getWorldScale no existe en 2.x)
        if (entity.getWorldTransform) {
            var wt = entity.getWorldTransform();
            if (wt && wt.getScale) scale = wt.getScale();
        }
        if (!scale && entity.getLocalScale) {
            scale = entity.getLocalScale();
        }

        if (!scale) {
            return DEFAULT_MASS;
        }

        var sx = Math.abs(scale.x || 1);
        var sy = Math.abs(scale.y || 1);
        var sz = Math.abs(scale.z || 1);

        var axis = collision.axis; // 0 = X, 1 = Y, 2 = Z

        var radiusScale;
        var heightScale;

        switch (axis) {
            case 0: // X
                radiusScale = Math.max(sy, sz);
                heightScale = sx;
                break;
            case 2: // Z
                radiusScale = Math.max(sx, sy);
                heightScale = sz;
                break;
            case 1: // Y
            default:
                radiusScale = Math.max(sx, sz);
                heightScale = sy;
                break;
        }

        var radius = collision.radius * radiusScale;
        var height = collision.height * heightScale;

        // Height en PlayCanvas es tip-to-tip, así que el cilindro central es:
        var cylinderHeight = height - (2 * radius);
        if (cylinderHeight < 0) cylinderHeight = 0;

        // Volumen cápsula = cilindro + 2 semiesferas
        var volume = (Math.PI * radius * radius * cylinderHeight) +
            ((4.0 / 3.0) * Math.PI * radius * radius * radius);

        var mass = volume * ORGANIC_CAPSULE_DENSITY;

        if (!isFinite(mass) || mass <= 0) {
            return DEFAULT_MASS;
        }

        return mass;
    }
    // Altura (extensión en Y) del AABB world combinado de una entidad y sus hijos.
    // Devuelve 0 si el subárbol no tiene meshes (el llamador decide el fallback).
    function getTotalHeight(entity) {
        if (!entity) return 0;
        // 1. Crear un bounding box vacío
        const combinedAABB = new pc.BoundingBox();
        let first = true;

        // 2. Función recursiva para recorrer la jerarquía
        function collectMeshInstances(node) {
            // Procesar componentes de modelo o render
            if (node.model && node.model.meshInstances) {
                node.model.meshInstances.forEach(mi => addMeshInstanceAABB(mi));
            }
            if (node.render && node.render.meshInstances) {
                node.render.meshInstances.forEach(mi => addMeshInstanceAABB(mi));
            }
            // Recursión sobre hijos
            node.children.forEach(child => collectMeshInstances(child));
        }

        function addMeshInstanceAABB(meshInstance) {
            // Actualizar el AABB (importante para mallas dinámicas)
            if (meshInstance.mesh) meshInstance.mesh.update();
            const aabb = meshInstance.aabb;
            if (first) {
                combinedAABB.copy(aabb);
                first = false;
            } else {
                combinedAABB.add(aabb);
            }
        }

        collectMeshInstances(entity);

        // 3. Extraer altura (extensión total en Y); 0 si no hubo meshes
        if (first) return 0;
        const height = combinedAABB.halfExtents.y * 2 <= 0.1 ? 0 : combinedAABB.halfExtents.y * 2;
        return height;
    }


};


///
/// HELPERS:
///







Character.prototype.updateSpeedAnimBlendFromVelocity = function (dt) {

    /* Cuando el ROOT MOTION conduce, el parámetro "speed" del grafo debe salir
       de la INTENCIÓN (input/IA), no de la velocidad medida: la animación
       genera velocidad, y esa velocidad mantendría a la animación sonando —
       un lazo que dejaba al personaje caminando para siempre o alternando
       idle/walk de forma errática. */
    let horizontalSpeed;
    if (this._rootMotionDriving) {
        horizontalSpeed = this._isMoving ? (this._charSpeed || 0) : 0;
    } else {
        const v = this.entity.rigidbody.linearVelocity;
        horizontalSpeed = Math.sqrt(v.x * v.x + v.z * v.z);
    }

    const idleThreshold = 0.12; // m/s: por debajo de esto debe quedar en idle

    let targetBlend = 0;
    if (horizontalSpeed > idleThreshold) {
        // Normaliza contra tu speed base para que:
        // ~0 = idle, ~1 = walk, >1 = run
        targetBlend = pc.math.clamp(horizontalSpeed / Math.max(this.speed, 0.001), 0, 2);
    }

    // Suavizado corto para evitar jitter entre idle/walk
    const lerpT = pc.math.clamp(dt * 12, 0, 1);
    this._speedAnimBlend = pc.math.lerp(this._speedAnimBlend || 0, targetBlend, lerpT);

    if (this._speedAnimBlend < 0.05) {
        this._speedAnimBlend = 0;
    }
};


/* Resuelve el "template": el hijo DIRECTO de la cápsula que contiene el render/
   armature. Prioriza el atributo asignado; si no, sube desde el render hasta el
   hijo directo de this.entity; último recurso: primer hijo. Devuelve null si el
   render está en la propia cápsula (no hay template separado). */
Character.prototype._resolveTemplateEntity = function () {
    if (this.templateEntity) return this.templateEntity;

    var n = this.renderCharacterComponent ? this.renderCharacterComponent.entity : null;
    /* render en la PROPIA cápsula: no hay template separado -> null, para que
       el llamador use la rotación por física (comportamiento original). Caer a
       children[0] aquí rotaría un hijo arbitrario (p.ej. debug capsule). */
    if (n === this.entity) return null;
    while (n && n.parent && n.parent !== this.entity) {
        n = n.parent;
    }
    if (n && n.parent === this.entity) return n;

    return (this.entity.children && this.entity.children[0]) || null;
};

/* Aplica al template la rotación de encare: world = Ry(_templateYaw) · baseline.
   El yaw es alrededor del eje Y del MUNDO, compuesto SOBRE la rotación de reposo,
   por lo que preserva pitch/roll iniciales. Reasienta la escala base (normaliza)
   por si setRotation introdujera deriva al recomponer la local con la del padre. */
Character.prototype._applyTemplateRotation = function () {
    var t = this._templateEntity;
    if (!t) return;

    this._qYaw.setFromAxisAngle(pc.Vec3.UP, this._templateYaw * pc.math.RAD_TO_DEG);
    this._qTemplateTarget.mul2(this._qYaw, this._templateWorldBase);
    t.setRotation(this._qTemplateTarget);

    t.setLocalScale(this._templateBaseScale);
};



Character.prototype.doMove = function () {
    if (!this.entity || !this.entity.rigidbody) {
        return;
    }

    if (this._doMoveBusy) return;
    this._doMoveBusy = true;

    /* CACHÉ del componente físico: se accede muchas veces por frame
       (linearVelocity/angularVelocity/mass/applyForce). Guardar la referencia
       evita re-resolver this.entity.rigidbody en cada acceso. */
    const rb = this.entity.rigidbody;

    const input = this.entity.input || {};
    const dt = Number(input.dt || 0);
    const useFlight = !!this.canmoveonair;

    this._curPosition = this.entity.getPosition();

    if (this.pointCharacterEntity) {
        this.pointCharacterEntity.setPosition(this._curPosition);
    }

    /* si initialize arrancó sin meshes (placeholder), adoptar la mesh real en
       cuanto exista para que el culling vuelva a funcionar en NPCs */
    if (this._characterMeshInstance && this._characterMeshInstance.__placeholder &&
        this.renderCharacterComponent && (this.renderCharacterComponent.meshInstances || [])[0]) {
        this._characterMeshInstance = this.renderCharacterComponent.meshInstances[0];
    }

    /* CULLING por visibilidad (optimización para multitudes): un NPC fuera de
       cámara no simula movimiento. Reglas para no "matar" a un personaje:
       - el PLAYER NUNCA se congela (aunque su render esté desactivado/oculto)
       - visibleThisFrame solo es fiable si el render está de verdad activo
         (componente y entidad habilitados); con el render DESACTIVADO ese flag
         queda false para siempre y congelaba TODO: movimiento, animación... */
    let visibleThisFrame = true;
    if (!this.entity.isPlayer &&
        this.renderCharacterComponent &&
        this.renderCharacterComponent.enabled &&
        this.renderCharacterComponent.entity.enabled &&
        this._characterMeshInstance &&
        typeof this._characterMeshInstance.visibleThisFrame === "boolean") {
        visibleThisFrame = this._characterMeshInstance.visibleThisFrame;
    }

    if (this.entity.anim) {
        this.entity.anim.enabled = visibleThisFrame;
    }

    /* CULLING FÍSICO AGRESIVO (opcional, off por defecto): un NPC que lleva
       'physicsCullDelay' s fuera de cámara y NO está en combate apaga su
       rigidbody+collision para no gastar simulación de Ammo.js. Se reactiva en
       cuanto vuelve a ser visible (o si entra en combate). El player nunca se culla. */
    if (!this.entity.isPlayer && this.cullingOptions && this.cullingOptions.physicsCulling) {
        if (visibleThisFrame) {
            if (this._physicsCulled) this._restorePhysics();
            this._invisibleTime = 0;
        } else {
            this._invisibleTime += dt;
            const inCombat = this._isInCombat();
            if (this._physicsCulled) {
                if (inCombat) this._restorePhysics();   // reanuda simulación si entra en combate
            } else if (!inCombat && this._invisibleTime >= (this.cullingOptions.physicsCullDelay || 0)) {
                this._cullPhysics();
            }
        }
    }

    if (visibleThisFrame) {
        this._updateGroundedState();
    }

    if (!visibleThisFrame) {
        this._doMoveBusy = false;
        return;
    }

    if (this.tracerOptions && this.tracerOptions.traceinput && this.entity.isPlayer) {
        const t = {};

        for (const k in input) {
            if (k === "mouseRaycast") {
                t[k] = input[k]?.entity?.name ?? "";
                continue;
            }
            if (k === "dt") {
                const p = input[k];
                t[k] = Number(p).toFixed(4);
                continue;
            }
            if (k === "camera") {
                t[k] = "";
                continue;
            }
            if (k === "targetPoint") {
                const p = input[k];
                if (p) {
                    t[k] = `x:${Number(p.x).toFixed(2)}-y:${Number(p.y).toFixed(2)}-z:${Number(p.z).toFixed(2)}`;
                } else {
                    t[k] = "";
                }
                continue;
            }

            t[k] = input[k];
        }

        Trace("input", t);
    }

    let targetDirection = null;

    if (this.entity.isPlayer) {
        targetDirection = (input.camera && input.camera.entity) ? input.camera.entity : input.camera;
    } else {
        targetDirection = input.targetEntity;

        if (targetDirection) {
            /* OPTIMIZACION (GC): scratch reutilizable en vez de .clone() */
            const directionToTarget = this._vDirToTarget.copy(targetDirection.getPosition()).sub(this._curPosition).normalize();

            input.x = directionToTarget.x;
            if (input.x < 0.1 && input.x > -0.1) input.x = 0;

            input.z = -directionToTarget.z;
            if (input.z < 0.1 && input.z > -0.1) input.z = 0;
        } else {
            input.z = 0;
            input.x = 0;
        }
    }

    const wantsStrafe = this.entity.isPlayer && this.playerOptions.playerControllerOnKeyRight === "Strafe";
    const shouldFaceCamera = this.entity.isPlayer && (wantsStrafe || input.cameratype === "FirstPerson");

    if (wantsStrafe) {
        if (input.x !== 0) input.z = 0;
        if (input.z !== 0) input.x = 0;
    }

    const targetPoint = input.targetPoint || (this.entity.input && this.entity.input.targetPoint) || null;

    /* OPTIMIZACION (GC): direction es ahora un vector reutilizable, no "new pc.Vec3()" cada frame */
    const direction = this._vDirection;
    direction.set(0, 0, 0);

    let moveSpeed = this.defaultrun
        ? (input.sprint ? this.speed : this.speed * 2)
        : (input.sprint ? this.speed * 2 : this.speed);

    let stopMovementNow = false;

    if (targetPoint) {
        const tp = targetPoint.getPosition ? targetPoint.getPosition() : targetPoint;

        direction.set(
            tp.x - this._curPosition.x,
            tp.y - this._curPosition.y,
            tp.z - this._curPosition.z
        );

        if (!useFlight) {
            direction.y = 0;
        }

        const distance = direction.length();
        const stopRadius = 0.25;
        const slowRadius = 1.25;

        if (distance <= stopRadius) {
            stopMovementNow = true;
            this._isMoving = false;

            if (this.entity.input && this.entity.input.targetPoint === targetPoint) {
                this.entity.input.targetPoint = null;
            }
        } else {
            this._isMoving = true;

            direction.normalize();

            if (distance < slowRadius) {
                moveSpeed *= (distance / slowRadius);
            }
        }
    } else {
        this._isMoving = input.x !== 0 || input.z !== 0;
        if (!this._isMoving) moveSpeed = 0;

        if (this._isMoving && targetDirection) {
            /* OPTIMIZACION (GC): camForward/camRight reutilizables; direction se COPIA al final
               en vez de quedar como alias del propio camForward (igual resultado numérico). */
            const camForward = this._vCamForward.copy(targetDirection.forward);
            const camRight = this._vCamRight.copy(targetDirection.right);

            if (useFlight) {
                /* la Y del forward NO se aplana: en FirstPerson vuela hacia
                   donde mira la cámara (pitch incluido) */
                if (camForward.lengthSq() > 0.000001) camForward.normalize();

                camRight.y = 0;
                if (camRight.lengthSq() > 0.000001) camRight.normalize();

                camForward.scale(input.z);
                camRight.scale(input.x);
                direction.copy(camForward).add(camRight);

                /* VUELO: Espacio (input.jump) NO hace nada en este modo; el
                   ascenso/descenso viene solo del pitch de la cámara */

                if (direction.lengthSq() > 0.000001) {
                    direction.normalize();
                } else {
                    this._isMoving = false;
                }
            } else {
                camForward.y = 0;
                if (camForward.lengthSq() > 0.000001) camForward.normalize();

                camRight.y = 0;
                if (camRight.lengthSq() > 0.000001) camRight.normalize();

                camForward.scale(input.z);
                camRight.scale(input.x);
                direction.copy(camForward).add(camRight);

                if (direction.lengthSq() > 0.000001) {
                    direction.normalize();
                } else {
                    this._isMoving = false;
                }
            }
        } else {
            direction.set(0, 0, 0);
        }
    }

    this._charSpeed = this._isMoving
        ? (this._charSpeed < moveSpeed - 0.1
            ? pc.math.lerp(this._charSpeed, moveSpeed, dt * this.speed * 4)
            : moveSpeed)
        : 0;

    this.updateSpeedAnimBlendFromVelocity(dt);

    if (this.entity.attackSystem.canAttack &&
        !this.entity.attackSystem.walkAndAttack &&
        this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
        this._isMoving = false;
        stopMovementNow = true;
    }

    if (this._isMoving && !useFlight && this.entity.isonair) {
        this._isMoving = false;
        stopMovementNow = true;
    }

    if (this._isMoving && direction.lengthSq() > 0.000001) {
        /* OPTIMIZACION (GC): vectores reutilizables en vez de .clone() */
        const desiredVelocity = this._vDesired.copy(direction).scale(this._charSpeed);

        if (useFlight) {
            /* VUELO: aceleración suave hacia la velocidad deseada
               (el setter de linearVelocity copia el vector: seguro reutilizarlo) */
            const current = this._vCurrent.copy(rb.linearVelocity);
            current.lerp(current, desiredVelocity, Math.min(1, dt * 8));
            rb.linearVelocity = current;
        } else if (!this._rootMotionDriving) {
            const currentVelocity = this._vCurrent.copy(rb.linearVelocity);
            currentVelocity.y = 0;
            desiredVelocity.y = 0;

            const accel = this._vAccel.copy(desiredVelocity).sub(currentVelocity);
            const force = accel.scale(rb.mass * 8);
            force.y = 0;

            rb.applyForce(force);
        }
        /* si _rootMotionDriving: la velocidad la fija la ANIMACIÓN (rootMotionFix,
           en postUpdate). Empujar además con fuerzas = doble motor y tirones. */
    } else if (useFlight) {
        /* VUELO sin input: frenado suave hasta quedar en hover (sin esto, al no
           haber gravedad ni damping, la velocidad persistiría para siempre) */
        const v = this._vLinStop.copy(rb.linearVelocity);
        const damp = 1 - Math.min(1, dt * (this.inertia ? 4 : 20));
        v.x *= damp;
        v.y *= damp;
        v.z *= damp;
        rb.linearVelocity = v;
    } else if (stopMovementNow || (!this._isMoving && !this.inertia)) {
        const v = this._vLinStop.copy(rb.linearVelocity);

        /* SALTO: durante el arco del salto se conserva el momento horizontal
           (sin esto, saltar corriendo frenaría en seco al pasar a isonair) */
        if (!this._jumping) {
            v.x = 0;
            v.z = 0;
        }

        /* la velocidad vertical solo se anula con contacto de suelo REAL:
           en el aire debe gobernar la gravedad. Usar el flag isonair aquí
           realimenta el lazo (el fallback por velocidad oscila en -0.3 m/s
           y la caída queda frenada frame a frame). Durante el salto tampoco
           se toca: el coyoteTime residual del despegue la anularía. */
        if ((this._groundContacts > 0 || this._coyoteTime > 0) && !this._jumping) {
            v.y = 0;
        }

        rb.linearVelocity = v;

        const a = this._vAngStop.copy(rb.angularVelocity);
        a.x = 0;
        a.y = 0;
        a.z = 0;
        rb.angularVelocity = a;
    }

    /* * * * * * * * * */
    /* S A L T O       */
    /* * * * * * * * * */
    /* Solo en modo suelo (canmoveonair = false): Espacio (input.jump) aplica
       velocidad vertical calculada para que el apex del salto sea la mitad
       del height de la cápsula. input.jump es isPressed (true mientras se
       mantiene), por eso el flanco de subida con jumpKeyHeld. */
    if (!useFlight) {
        const jumpPressed = !!input.jump;
        const groundedForJump = (this._groundContacts > 0 || this._coyoteTime > 0) && !this._jumping;

        /* re-armar el salto al volver a tener suelo */
        if (groundedForJump) {
            this._jumpAvailable = true;
        }

        if (jumpPressed && !this._jumpKeyHeld && groundedForJump && this._jumpAvailable) {
            /* v = sqrt(2*g*h) con h = _jumpApexHeight (mitad del height de la cápsula) */
            const g = Math.abs(this.app.systems.rigidbody.gravity.y) || Math.abs(this.gravity) || 9.8;
            const vy = Math.sqrt(2 * g * this._jumpApexHeight);

            const v = this._vJump.copy(rb.linearVelocity);
            v.y = vy;
            rb.linearVelocity = v;

            this._jumping = true;
            this._jumpAvailable = false;
            this._coyoteTime = 0;

            if (this.sensorOptions.sensorJumpDebug) {
                console.log("[character] JUMP  vy =", vy.toFixed(2), "m/s | apex =", this._jumpApexHeight.toFixed(2), "m");
            }
        }

        this._jumpKeyHeld = jumpPressed;
    } else {
        this._jumpKeyHeld = !!input.jump;
    }

    /* OPTIMIZACION (GC): faceDir es un vector reutilizable; hasFaceDir sustituye al antiguo
       patrón "faceDir = null" para indicar "no hay dirección a la que mirar". */
    let hasFaceDir = false;
    const faceDir = this._vFaceDir;

    if (this.entity.isPlayer) {
        if (shouldFaceCamera) {
            if (targetDirection && targetDirection.forward) {
                faceDir.copy(targetDirection.forward);
                faceDir.y = 0;
                if (faceDir.lengthSq() > 0.000001) {
                    faceDir.normalize();
                    hasFaceDir = true;
                }
            }
        } else if (this._isMoving && direction.lengthSq() > 0.000001 && input.cameratype !== "FirstPerson") {
            faceDir.copy(direction);
            faceDir.y = 0;
            if (faceDir.lengthSq() > 0.000001) {
                faceDir.normalize();
                hasFaceDir = true;
            }
        }
    } else {
        if (targetPoint) {
            const tpPos = targetPoint.getPosition ? targetPoint.getPosition() : targetPoint;
            faceDir.copy(tpPos).sub(this._curPosition);
            faceDir.y = 0;
            if (faceDir.lengthSq() > 0.000001) {
                faceDir.normalize();
                hasFaceDir = true;
            }
        } else if (input.targetEntity) {
            faceDir.copy(input.targetEntity.getPosition()).sub(this._curPosition);
            faceDir.y = 0;
            if (faceDir.lengthSq() > 0.000001) {
                faceDir.normalize();
                hasFaceDir = true;
            }
        }
    }

    if (this._templateEntity) {
        /* GIRO VISUAL sobre el TEMPLATE (no la cápsula). Se integra un yaw
           relativo al baseline con el MISMO "feel" que la versión por física
           (turnSpeed/maxTurnSpeed iguales) para que el jugador no note el cambio.
           _templateYaw converge a φ = ánguloFaceDir − ánguloForwardInicialCápsula,
           reproduciendo la rotación que antes recibía la cápsula. */
        if (hasFaceDir) {
            const turnSpeed = 20;
            const maxTurnSpeed = 14;

            let delta = (Math.atan2(faceDir.x, faceDir.z) - this._templateRefYaw) - this._templateYaw;
            delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // camino más corto

            const rate = pc.math.clamp(delta * turnSpeed, -maxTurnSpeed, maxTurnSpeed);
            this._templateYaw += rate * dt;
        }
        /* PERF (multitudes): re-escribir la rotación solo si el yaw cambió de forma
           perceptible desde la última vez. En idle o ya encarado no se toca el
           transform (evita setRotation/setLocalScale y el re-sync de la jerarquía
           por frame en miles de instancias). */
        if (Math.abs(this._templateYaw - this._templateYawApplied) > 1e-5) {
            this._applyTemplateRotation();
            this._templateYawApplied = this._templateYaw;
        }
    } else if (hasFaceDir) {
        /* Fallback sin template: rotación por física sobre la cápsula (original). */
        const forward = this._vForward.copy(this.entity.forward);
        forward.y = 0;

        if (forward.lengthSq() > 0.000001) {
            forward.normalize();

            let delta = Math.atan2(faceDir.x, faceDir.z) - Math.atan2(forward.x, forward.z);
            delta = Math.atan2(Math.sin(delta), Math.cos(delta));

            const turnSpeed = 20;
            const maxTurnSpeed = 14;

            const ang = this._vAngTurn.copy(rb.angularVelocity);
            ang.x = 0;
            ang.z = 0;
            ang.y = pc.math.clamp(delta * turnSpeed, -maxTurnSpeed, maxTurnSpeed);
            rb.angularVelocity = ang;
        }
    }

    if (this.entity.anim) {
        /* MODO EN EL AIRE: durante un SALTO deliberado (no caídas por bordes) y
           NO en vuelo se fuerza el modo ONAIR para reproducir la pose de aire en
           vez de caminar/correr. El vuelo (canmoveonair) mantiene su modo de arma
           y usa su propio estado onair (mecanismo distinto). Al aterrizar
           (_jumping=false) vuelve al modo de arma y el grafo retorna a idle/walk/run. */
        var animMode = +(input.mode || 0);
        if (this._jumping && !this.canmoveonair) {
            animMode = CharacterLocomotionModeEnum.ONAIR;
        }
        this.entity.anim.setInteger("mode", animMode);
        this.entity.anim.setFloat("speed", this._speedAnimBlend);
        this.entity.anim.setInteger("onair", +(this.entity.isonair));
        this.entity.anim.setInteger("impact", input.impact ? Math.floor(Math.random() * 2) + 1 : 0);
        this.entity.anim.setInteger("death", input.death ? Math.floor(Math.random() * 2) + 1 : 0);

        /* one-shot: consumir el pulso para que impact/death disparen una sola
           transicion (ANY -> impact/death) y no se re-lancen cada frame. */
        if (input.impact) input.impact = false;
        if (input.death) input.death = false;
    }

    this.doAttackSystem(input);

    this._doMoveBusy = false;
};


/* * * * * * * * * * * * * * * * */
/* D O  C A R R Y  W E A P O N S */
/* * * * * * * * * * * * * * * * */
Character.prototype.doCarryWeapons = function () {

    function setDefRigidBodyValues(r) {
        if (!r) return;
        r.entity.tags.add("uranus-instancing-exclude");
        r.entity.tags.add("ignore-camera-collision");
        r.restitution = 0;
        r.friction = 1;
    }

    if (this.bones.leftHand) {
        if (this.carryWeapons.leftHandWeaponEntity) {
            this.carryWeapons.leftHandWeaponEntity.setPosition(this.bones.leftHand.getPosition());
            this.carryWeapons.leftHandWeaponEntity.setRotation(this.bones.leftHand.getRotation());





            if ((this.carryWeapons.leftHandWeaponEntity._guid || "0") !== this.carryWeapons.leftHandWeaponEntityOld?._guid) {
                this.entity.attackSystem.leftHandWeaponRigidBody = this.carryWeapons.leftHandWeaponEntity.findComponent("rigidbody");
                setDefRigidBodyValues(this.entity.attackSystem.leftHandWeaponRigidBody);
                this._equipWeaponScript(this.carryWeapons.leftHandWeaponEntity, "left");
            }

        } else {
            if (this.carryWeapons.leftHandWeaponEntityOld) {
                /*QUITAR COLISIONES*/
                this.entity.attackSystem.leftHandWeaponRigidBody = null;
                this._unequipWeaponScript(this.carryWeapons.leftHandWeaponEntityOld, "left");
            }
        }

        this.carryWeapons.leftHandWeaponEntityOld = this.carryWeapons.leftHandWeaponEntity;
    }

    if (this.bones.rightHand) {
        if (this.carryWeapons.rightHandWeaponEntity) {
            this.carryWeapons.rightHandWeaponEntity.setPosition(this.bones.rightHand.getPosition());
            this.carryWeapons.rightHandWeaponEntity.setRotation(this.bones.rightHand.getRotation());

            if ((this.carryWeapons.rightHandWeaponEntity._guid || "0") !== this.carryWeapons.rightHandWeaponEntityOld?._guid) {

                var r = this.carryWeapons.rightHandWeaponEntity.findComponent("render");
                if (r) {
                    var rotation = new pc.Quat();
                    rotation.setFromEulerAngles(0, -90, 0);

                    // Aplica la rotación a la entidad
                    r.entity.setRotation(rotation);
                }

                this.entity.attackSystem.rightHandWeaponRigidBody = this.carryWeapons.rightHandWeaponEntity.findComponent("rigidbody");
                setDefRigidBodyValues(this.entity.attackSystem.rightHandWeaponRigidBody);
                this._equipWeaponScript(this.carryWeapons.rightHandWeaponEntity, "right");
            }
        } else {
            if (this.carryWeapons.rightHandWeaponEntityOld) {
                /*QUITAR COLISIONES*/
                this.entity.attackSystem.rightHandWeaponRigidBody = null;
                this._unequipWeaponScript(this.carryWeapons.rightHandWeaponEntityOld, "right");
            }
        }
        this.carryWeapons.rightHandWeaponEntityOld = this.carryWeapons.rightHandWeaponEntity;
    }
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *  INTEGRACION CON weapon.js
 *  El arma (script "weapon") gestiona SU PROPIA collision y detecta golpes.
 *  Character solo: (a) le dice quien es su portador (para que no lo dañe) y
 *  (b) abre/cierra la ventana de daño segun la animacion de ataque.
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

/* Cablea el arma recien equipada: cachea su script y le fija el portador. */
Character.prototype._equipWeaponScript = function (weaponEntity, hand) {
    if (!weaponEntity) return;
    weaponEntity.tags.add("is-taken");

    const ws = (weaponEntity.script && weaponEntity.script.weapon) || null;
    this.entity.attackSystem[hand + "HandWeaponScript"] = ws;

    if (ws) {
        ws.setOwner(this.entity);            // el arma no daña a quien la empuña
    } else {
        console.warn('[character] La entidad de arma no tiene el script "weapon"; no habra daño real.');
    }
};

/* Suelta el arma: corta su ventana de daño y limpia el portador/cache. */
Character.prototype._unequipWeaponScript = function (weaponEntity, hand) {
    this.entity.attackSystem[hand + "HandWeaponScript"] = null;
    if (!weaponEntity) return;

    weaponEntity.tags.remove("is-taken");
    const ws = (weaponEntity.script && weaponEntity.script.weapon) || null;
    if (ws) {
        ws.endDamage();
        ws.setOwner(null);
    }
};

/* Abre (on=true) o cierra (on=false) la ventana de daño de las armas equipadas.
   Lo llaman los eventos de animacion del ataque (ver prepareAnimComponent). */
Character.prototype._setWeaponsDamaging = function (on) {
    const as = this.entity.attackSystem;
    const l = as.leftHandWeaponScript;
    const r = as.rightHandWeaponScript;
    if (l) { if (on) l.startDamage(); else l.endDamage(); }
    if (r) { if (on) r.startDamage(); else r.endDamage(); }
};

/* Recibe el evento "damage" que dispara weapon.js sobre esta entidad. */
Character.prototype._onReceiveDamage = function (amount, attacker, weaponEntity) {
    this.applyDamage(amount, attacker);
};

/* Aplica daño a la vida y dispara la reaccion (impact / death). */
Character.prototype.applyDamage = function (amount, attacker) {
    const h = this.entity.health;
    if (!h || !h.alive) return;

    h.current = Math.max(0, h.current - (amount || 0));

    if (h.current <= 0) {
        h.alive = false;
        this.entity.input.death = true;    // one-shot: se consume en doMove
    } else {
        this.entity.input.impact = true;   // one-shot: se consume en doMove
    }
};

/* LIMPIEZA. Cubre los dos casos: destruir la cápsula (entidad) o quitar solo el
   script. Todo lo que este script crea/engancha debe soltarse aquí para no dejar
   entidades huérfanas ni callbacks colgando que referencien un script muerto. */
Character.prototype._onDestroy = function () {
    var entity = this.entity;

    /* listener del evento de daño (weapon.js) */
    if (entity) entity.off("damage", this._onReceiveDamage, this);

    /* contactos de la cápsula (por si la entidad sobrevive al script) */
    if (entity && entity.collision) {
        entity.collision.off("collisionstart", this.characterCollisionStart, this);
        entity.collision.off("collisionend", this.characterCollisionEnd, this);
    }

    /* eventos de animación propios de este script (nombres exclusivos), que
       referencian `this`: si la entidad sobrevive, quedarían colgando */
    if (entity && entity.anim) {
        entity.anim.off("attack-end-animation");
        entity.anim.off("attack-start-damage-animation");
        entity.anim.off("attack-end-damage-animation");
    }

    /* armas: la entidad del arma es EXTERNA (no hija). No se destruye: se cierra
       su ventana de daño, se le quita el portador y el tag is-taken (weapon.js
       gestiona sus propios eventos de colisión). */
    this._unequipWeaponScript(this.carryWeapons.leftHandWeaponEntity || this.carryWeapons.leftHandWeaponEntityOld, "left");
    this._unequipWeaponScript(this.carryWeapons.rightHandWeaponEntity || this.carryWeapons.rightHandWeaponEntityOld, "right");

    /* hitpoints: quitar las collisions que ESTE script añadió a los huesos (el
       esqueleto puede sobrevivir al script) */
    if (this._hitpoints) {
        for (var h = 0; h < this._hitpoints.length; h++) {
            var bone = this._hitpoints[h].bone;
            if (bone) {
                if (this._hitpoints[h].added && bone.collision) bone.removeComponent("collision");
                if (bone.tags) {
                    bone.tags.remove("is-hitpoint");
                    bone.tags.remove("is-damageable");
                }
                bone.characterEntity = null;
            }
        }
        this._hitpoints.length = 0;
    }

    /* entidad auxiliar colgada de scene.root (NO es hija de la cápsula): hay que
       destruirla a mano o queda huérfana en la escena */
    if (this.pointCharacterEntity) {
        this.pointCharacterEntity.destroy();
        this.pointCharacterEntity = null;
    }
};

/* * * * * * * * * * * * * * * * */
/* D O  A T T A C K  S Y S T E M */
/* * * * * * * * * * * * * * * * */
Character.prototype.doAttackSystem = function (input) {
    if (!this.entity.attackSystem.canAttack) return;

    this.entity.attackSystem.attackInput = input.attack || input.mousePrimaryButton;
    if (this.entity.attackSystem.attackInput === this.entity.attackSystem.attackInputOld) {
        /*if is playing attack animation*/
        if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            this.entity.attackSystem.__elapsedTime += input.dt;
        }
    } else {
        /*the player attack*/
        if (this.entity.attackSystem.attackInput) {
            if (this.entity.attackSystem.canDoAttack) {
                this.entity.attackSystem.__elapsedTime = 0;
                this.entity.attackSystem.canDoAttack = false;
                this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.ATTACKING;

                Timer.addTimer(0.1, function () {
                    /* el timer puede disparar tras destruir el personaje: guard */
                    if (this.entity && this.entity.attackSystem) {
                        this.entity.attackSystem.canDoAttack = true;
                    }
                }, this, true);

            }
        } else {
            this.entity.attackSystem.canDoAttack = true;
            this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.NONE;
            this.entity.attackSystem.__elapsedTime = 0;
        }


    }
    if (this.entity.attackSystem.__elapsedTime >= 2) {
        this.entity.attackSystem.__elapsedTime = 0;
        this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.NONE;
    }




    this.entity.attackSystem.attackAction = 0;
    if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
        this.entity.attackSystem.attackAction = 1;
    }
    if (this.entity.attackSystem.status === CharacterAttackSystemStatusEnum.NONE) {
        this.entity.attackSystem.attackAction = 0;
    }

    /* shows animation */
    this.entity.anim.setInteger("attack", this.entity.attackSystem.attackAction);

    this.entity.attackSystem.attackInputOld = this.entity.attackSystem.attackInput;


    if (this.tracerOptions.traceattack && this.entity.isPlayer) {
        const clonedObject = Object.assign({}, this.entity.attackSystem);
        clonedObject.rightHandWeaponRigidBody = null;
        clonedObject.leftHandWeaponRigidBody = null;
        delete clonedObject.rightHandWeaponRigidBody;
        delete clonedObject.leftHandWeaponRigidBody;
        Trace("attackSystem", clonedObject);
    }


};
















/*-----------------------------------------------------------------------------------------*/

/*******************************/
/*                             */
/*   S E N S O R               */
/*                             */
/*******************************/
Character.prototype.characterCollisionStart = function (event) {
    /* HITPOINTS: los triggers de hueso (propios o de OTRO personaje) disparan
       collisionstart SIN contacts sobre la cápsula; no son suelo ni pared y no
       deben pisar entity.other */
    if (event.other && event.other.tags && event.other.tags.has("is-hitpoint")) return;

    this.entity.other = event.other;

    var contacts = event.contacts;
    if (!contacts) return;
    var selfPos = this.entity.getPosition();
    /* cota máxima en Y para que un contacto cuente como "base de la cápsula" */
    var baseMaxY = selfPos.y + this._capsuleBaseOffset;
    var groundFound = false;
    for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        var ny = c.normal.y;
        if (this.sensorOptions.sensorDebug) {
            console.log("[character] contact normal.y =", ny.toFixed(2), "| point.y - baseMaxY =", (c.point.y - baseMaxY).toFixed(2), "(<= 0 es base)");
        }
        /* suelo = normal casi vertical (cualquier signo: la convención varió entre
           versiones del engine) Y contacto dentro del casquete inferior de la
           cápsula. Bordes/salientes a la altura de la pierna quedan excluidos. */
        if (!groundFound && (ny > 0.5 || ny < -0.5) && c.point.y <= baseMaxY) {
            if (!this._groundBy[event.other._guid]) {
                this._groundBy[event.other._guid] = true;
                this._groundContacts++;
            }
            groundFound = true;
        } else if (ny < 0.5 && ny > -0.5 && !event.other.isCharacter) {
            /* PARED (no otro personaje): dirección horizontal de escape para la IA,
               desde el punto de contacto hacia la entidad — independiente de la
               convención de signo de la normal */
            var ax = selfPos.x - c.pointOther.x;
            var az = selfPos.z - c.pointOther.z;
            var d2 = ax * ax + az * az;
            if (d2 > 0.000001) {
                var inv = 1 / Math.sqrt(d2);
                this.entity.wallAway.set(ax * inv, 0, az * inv);
                this.entity.wallTimeMs = performance.now();
            }
        }
    }
}


Character.prototype.characterCollisionEnd = function (other) {
    /* simetría con el guard de collisionstart: ignorar triggers de hitpoint */
    if (other && other.tags && other.tags.has("is-hitpoint")) return;

    if (this.entity.other === other) this.entity.other = null;

    if (this._groundBy[other._guid]) {
        this._groundBy[other._guid] = false;
        if (this._groundContacts > 0) this._groundContacts--;
    }
}

Character.prototype._updateGroundedState = function () {
    /* Suelo por CONTACTOS de la cápsula (ver characterCollisionStart/End); un
       raycast corto SOLO refuerza los casos ambiguos (sin contactos y sin salto).
       coyoteTime = 100 ms de gracia para cubrir el parpadeo de manifolds de Bullet. */
    var rb = this.entity.rigidbody;
    if (!rb) return;
    var dt = this.entity.input.dt || 0;

    if (this._groundContacts > 0) {
        this._coyoteTime = 0.1;
    } else if (this._coyoteTime > 0) {
        this._coyoteTime -= dt;
    }

    var grounded = this._groundContacts > 0 || this._coyoteTime > 0;

    /* caída franca: anula la gracia (cubre collisionend perdidos) */
    if (grounded && rb.linearVelocity.y < -1.5) {
        grounded = false;
        this._coyoteTime = 0;
    }

    /* REFUERZO por raycast: en casos ambiguos (sin contactos de suelo, sin salto
       propio en curso y fuera del modo vuelo) un rayo corto hacia abajo confirma
       si hay suelo a <= groundtolerance de los pies. Recupera contactos perdidos
       (collisionend espurio de Bullet) sin depender del ruidoso fallback por
       velocidad. Coste casi nulo: no corre parado sobre suelo, ni saltando, ni volando. */
    if (!this.canmoveonair && this._groundContacts === 0 && !this._jumping && this._probeGroundBelow()) {
        grounded = true;
        this._coyoteTime = 0.1;
    }

    /* fallback, mismo criterio que la versión original con raycasts: sin evidencia
       de contacto solo se está en el aire si se está cayendo (vy <= -0.3) */
    if (!grounded) {
        grounded = rb.linearVelocity.y > -0.3;
    }

    /* SALTO: durante el ascenso el fallback por velocidad daría grounded=true
       (vy > 0); mientras dure el salto se está en el aire. Aterrizaje = volver
       a tener contacto de suelo sin velocidad ascendente. */
    if (this._jumping) {
        if (this._groundContacts > 0 && rb.linearVelocity.y <= 0.01) {
            this._jumping = false;
        } else {
            grounded = false;
        }
    }

    if (this.canmoveonair) grounded = false;

    this.entity.isonground = grounded;
    this.entity.isonair = !grounded;
}

/* REFUERZO DE SUELO: rayo corto hacia abajo desde el interior del casquete
   inferior de la cápsula hasta 'groundtolerance' bajo los pies. Solo lo llama
   _updateGroundedState en casos ambiguos (sin contactos, sin salto, sin vuelo),
   así que no hay coste por frame en el caso normal. Arranca DENTRO de la cápsula
   (offset +0.02) para que Bullet no reporte auto-impacto; el guard entity!==this
   lo refuerza. Reutiliza vectores scratch (cero GC). */
Character.prototype._probeGroundBelow = function () {
    var sys = this.app.systems.rigidbody;
    if (!sys) return false;
    var p = this.entity.getPosition();
    var start = this._vProbeStart.set(p.x, p.y + this._groundProbeStartY, p.z);
    var end = this._vProbeEnd.set(p.x, p.y + this._groundProbeEndY, p.z);
    var hit = sys.raycastFirst(start, end);
    /* suelo = cuerpo SÓLIDO distinto de uno mismo. Exigir rigidbody descarta los
       volúmenes trigger (collision sin rigidbody), que rayTest también reporta. */
    return !!(hit && hit.entity !== this.entity && hit.entity.rigidbody);
};

/* CULLING FÍSICO — helpers (solo NPCs, opt-in por cullingOptions.physicsCulling).
   "en combate" = atacando o con objetivo/punto de destino activo: nunca se apaga
   la física en ese caso para no romper persecuciones ni golpes fuera de cámara. */
Character.prototype._isInCombat = function () {
    var as = this.entity.attackSystem;
    if (as && as.status !== CharacterAttackSystemStatusEnum.NONE) return true;
    var input = this.entity.input;
    if (input && (input.targetEntity || input.targetPoint)) return true;
    return false;
};

/* Apaga rigidbody+collision: el cuerpo sale de la simulación de Ammo.js y deja de
   generar contactos/integración. Incluye los triggers de hitpoint de los huesos. */
Character.prototype._cullPhysics = function () {
    this._physicsCulled = true;
    if (this.entity.rigidbody) this.entity.rigidbody.enabled = false;
    if (this.entity.collision) this.entity.collision.enabled = false;
    this._setHitpointCollisionsEnabled(false);
};

/* Reactiva la física: collision primero (recrea la shape) y luego rigidbody
   (re-crea el body). La detección de suelo por contactos parte de cero: los
   manifolds se reconstruyen con los próximos collisionstart. */
Character.prototype._restorePhysics = function () {
    this._physicsCulled = false;
    this._invisibleTime = 0;
    if (this.entity.collision) this.entity.collision.enabled = true;
    if (this.entity.rigidbody) this.entity.rigidbody.enabled = true;
    this._setHitpointCollisionsEnabled(true);
    this._groundContacts = 0;
    this._groundBy = {};
    this._coyoteTime = 0;
};


/* =========================================================================
   HITPOINTS: collision (trigger) por hueso, para daño localizado
   ========================================================================= */

/* Crea las collisions de los huesos de la seccion bones. Tamaños derivados del
   MISMO characterHeight (AABB del template) que ya dimensiona la capsula y la
   masa, con proporciones antropometricas estandar (la cabeza mide ~0.13*H, los
   hombros ~0.25*H...).
   ESCALA: las primitivas de collision NO heredan la escala de la entidad en
   este build (verificado con el AmmoDebugDrawer: compensar dividiendo por la
   escala del hueso las dejaba ~100x fuera de escala con el rig 0.01 de
   Mixamo). Por eso radius/halfExtents/offsets se pasan en METROS MUNDO tal
   cual; lo unico que se convierte es el vector rodilla->tobillo de las
   piernas, que viene en unidades locales del rig y se multiplica por la
   escala mundial del hueso.
   PERFORMANCE: todas las shapes son BOX — un solo tipo de primitiva barata
   para los tests de solape de Ammo. Las PIERNAS se miden de
   verdad: la caja se tiende del hueso Leg (rodilla) a su hijo Foot (tobillo)
   usando la posicion local del hijo. Sin rigidbody => son triggers: detectan
   armas/proyectiles pero no empujan ni pesan.
   Cada hueso recibe el tag "is-damageable": el arma (weapon.js) los reconoce
   como golpeables y resuelve el daño contra el PERSONAJE via characterEntity
   (una sola vida; un golpe por swing aunque cruce varios huesos). */
Character.prototype._setupHitpoints = function () {
    var H = this.characterHeight;
    var b = this.bones;

    /* TODAS las shapes son BOX (uniforme y barato para Ammo). halfExtents en
       metros mundo. Las piernas no llevan "he": su box se tiende midiendo
       rodilla->tobillo (thickness = semiancho de los ejes no dominantes). */
    var specs = [
        { bone: b.head, name: "head", he: [0.055 * H, 0.07 * H, 0.065 * H], offsetY: 0.06 * H },
        { bone: b.spine2, name: "torso", he: [0.13 * H, 0.10 * H, 0.075 * H], offsetY: 0.04 * H },
        { bone: b.hips, name: "hips", he: [0.12 * H, 0.08 * H, 0.08 * H], offsetY: 0 },
        { bone: b.leftHand, name: "hand-l", he: [0.045 * H, 0.045 * H, 0.045 * H], offsetY: 0 },
        { bone: b.rightHand, name: "hand-r", he: [0.045 * H, 0.045 * H, 0.045 * H], offsetY: 0 },
        { bone: b.leftFoot, name: "foot-l", he: [0.05 * H, 0.05 * H, 0.05 * H], offsetY: 0 },
        { bone: b.rightFoot, name: "foot-r", he: [0.05 * H, 0.05 * H, 0.05 * H], offsetY: 0 },
        { bone: b.leftLeg, name: "leg-l", thickness: 0.045 * H, along: b.leftFoot },
        { bone: b.rightLeg, name: "leg-r", thickness: 0.045 * H, along: b.rightFoot }
    ];

    for (var i = 0; i < specs.length; i++) {
        var spec = specs[i];
        var bone = spec.bone;
        if (!bone) continue;

        /* los huesos de un glb instanciado por codigo pueden ser GraphNodes
           puros (sin addComponent): solo las Entities admiten collision */
        if (typeof bone.addComponent !== "function") {
            console.warn('[character] hitpoints: el hueso "' + bone.name + '" no es una Entity; sin collision.');
            continue;
        }

        /* collision YA existente (puesta en el editor): NO se agrega otra ni se
           re-dimensiona; solo se registra (culling/daño) y se etiqueta */
        if (bone.collision) {
            bone.tags.add("is-hitpoint");
            bone.tags.add("is-damageable");
            bone.hitpointName = spec.name;
            bone.characterEntity = this.entity;
            this._hitpoints.push({ bone: bone, name: spec.name, added: false });
            continue;
        }

        /* escala mundial del hueso (los rigs de Mixamo suelen traer 0.01):
           SOLO se usa para pasar a mundo el vector rodilla->tobillo */
        var s = 1;
        var wt = bone.getWorldTransform && bone.getWorldTransform();
        if (wt && wt.getScale) {
            var sc = wt.getScale();
            s = Math.max(Math.abs(sc.x), Math.abs(sc.y), Math.abs(sc.z)) || 1;
        }

        var opts;
        if (spec.he) {
            /* BOX simple centrada en el hueso (con offset opcional en su +Y) */
            opts = {
                type: "box",
                halfExtents: new pc.Vec3(spec.he[0], spec.he[1], spec.he[2]),
                linearOffset: new pc.Vec3(0, spec.offsetY, 0)
            };
        } else {
            /* BOX de PIERNA: si el hueso del pie es hijo directo, la caja se
               tiende EXACTA de rodilla a tobillo (posicion local del hijo, en
               unidades del rig, convertida a METROS multiplicando por la
               escala mundial del hueso); el eje dominante recibe la mitad de
               esa longitud y los otros dos el thickness. Fallback: 0.26*H
               sobre +Y. */
            var t = spec.thickness;
            var hx = t, hy = t, hz = t;
            var off;
            var child = spec.along;
            if (child && child.parent === bone) {
                var dl = child.getLocalPosition();
                var half = Math.max(dl.length() * s * 0.5, t);
                var axv = Math.abs(dl.x), ayv = Math.abs(dl.y), azv = Math.abs(dl.z);
                if (axv > ayv && axv > azv) hx = half;
                else if (azv > ayv) hz = half;
                else hy = half;
                off = new pc.Vec3(dl.x * 0.5 * s, dl.y * 0.5 * s, dl.z * 0.5 * s);
            } else {
                hy = Math.max(0.13 * H, t);
                off = new pc.Vec3(0, hy, 0);
            }
            opts = { type: "box", halfExtents: new pc.Vec3(hx, hy, hz), linearOffset: off };
        }

        bone.addComponent("collision", opts);
        bone.tags.add("is-hitpoint");
        bone.tags.add("is-damageable");         // el arma los reconoce como golpeables
        bone.tags.add("ignore-camera-collision");
        bone.hitpointName = spec.name;          // "head", "torso", "leg-l"...
        bone.characterEntity = this.entity;     // el daño se resuelve contra el personaje

        this._hitpoints.push({ bone: bone, name: spec.name, added: true });
    }
};

/* Enciende/apaga las collisions de los hitpoints (culling físico). */
Character.prototype._setHitpointCollisionsEnabled = function (on) {
    if (!this._hitpoints) return;
    for (var i = 0; i < this._hitpoints.length; i++) {
        var bone = this._hitpoints[i].bone;
        if (bone && bone.collision) bone.collision.enabled = on;
    }
};

/* (los wireframes por-script de capsula/hitpoints se eliminaron: todas las
   colisiones se visualizan con el AmmoDebugDrawer del gameManager, que ademas
   colorea hitpoints en amarillo y capsulas de personaje en rojo) */


/*-----------------------------------------------------------------------------------------*/
/*-----------------------------------------------------------------------------------------*/
/*******************************/
/*                             */
/*   U P D A T E               */
/*                             */
/*******************************/
/*-----------------------------------------------------------------------------------------*/
Character.prototype.postUpdate = function (dt) {
    this.rootMotionFix(dt);
    this.doCarryWeapons();
}

/* ============================================================================
   MOTION ROOT — cómo leerlo si no sabes programar:
   Cada animación puede traer "de fábrica" un desplazamiento del esqueleto
   (el hueso de la cadera / hips se mueve). Aquí se decide, UNA VEZ POR FRAME,
   qué hacer con ese desplazamiento según el modo elegido en el editor:
     none         -> no tocar nada (la animación se ve tal cual)
     place-in-XYZ -> el modelo queda CLAVADO en su sitio en esos ejes (ese
                     desplazamiento se descarta). La cápsula física se mueve
                     SOLO por input/IA, como siempre. Es el modo típico para
                     caminar/correr cuando el clip trae drift indeseado.
     teleport     -> la animación mueve al modelo tal cual fue autorada y la
                     cápsula física lo sigue por debajo (fijando su VELOCIDAD,
                     nunca con teleports que rompen los contactos de suelo).
                     Es el modo para ataques/embestidas con desplazamiento.
   El modo se elige así: si "Motion Root (global)" NO está en none, manda el
   global para TODAS las animaciones. Si está en none, manda el selector
   "motion root" que hay debajo de cada animación.
   ============================================================================ */

/* Tipos internos de modo (números: comparar números por frame es más barato
   que comparar textos, y no genera basura para el recolector/GC) */
const CharacterMotionKindEnum = Object.freeze({
    NONE: 0,          // no hacer nada
    TELEPORT: 1,      // la cápsula sigue al modelo (única variante que "conduce")
    AXES: 2,          // place-in-<ejes>: clavar el modelo en esos ejes
    IN_PLACE_ALL: 3,  // legacy: fijar hips en todos los ejes
});

/* rootMotionFix: ÚNICO punto de entrada del motion root (corre en postUpdate).
   Hace todo en orden, de arriba a abajo:
     1. Mira qué animación suena y, si cambió, reinicia el estado interno.
     2. Lee el modo elegido en el editor (global o el de la animación) y, SOLO
        si el texto cambió, lo traduce a banderas internas (kind + ejes).
     3. Aplica el modo:  none -> nada | place-in -> clavar modelo en esos ejes
        | teleport -> la cápsula sigue al modelo (_applyTeleportFollow)
        | in_place_all (legacy) -> clavar modelo en todos los ejes.
   Cero reservas de memoria por frame: los textos solo se construyen al cambiar
   de animación y los vectores son scratch pre-creados en initialize. */
Character.prototype.rootMotionFix = function (dt) {
    const hips = this.bones.hips;
    if (!hips || !(dt > 0)) return;

    /* --- 1. ¿QUÉ ANIMACIÓN SUENA? (p.ej. "unarmed_attack1") --- */
    const stateName = (this.entity.anim && this.entity.anim.baseLayer)
        ? this.entity.anim.baseLayer.activeState
        : null;

    if (stateName !== this._rootMotionState) {
        /* cambió la animación: reiniciar muestreo/conducción y cachear la clave
           del selector y su tabla (así no se construyen textos cada frame) */
        this._rootMotionState = stateName;
        this._rootMotionPrimed = false;
        this._rootMotionDriving = false;
        this._vRootMotionVelAvg.set(0, 0, 0);
        this._restoreTemplateOffset();
        this._rootMotionKey = stateName ? (stateName + "_rootmotion") : null;
        this._rootMotionRaw = "__dirty__";   /* fuerza re-parseo abajo */

        /* tabla animations_<modo> a la que pertenece la animación, por su
           prefijo ("unarmed_attack1" -> animations_unarmed) */
        this._rootMotionTable = null;
        if (stateName) {
            const modes = Character.animation_modes;
            for (let i = 0; i < modes.length; i++) {
                if (stateName.indexOf(modes[i] + "_") === 0) {
                    this._rootMotionTable = this["animations_" + modes[i]] || null;
                    break;
                }
            }
        }
    }

    /* --- 2. ¿QUÉ MODO PIDIÓ EL USUARIO? ---
       El global manda salvo que esté en "none"; en "none" manda el selector
       propio de la animación. Se relee cada frame (2 lecturas de propiedad,
       costo casi cero) para que tocar un dropdown en caliente aplique al
       instante; el parseo solo corre si el TEXTO cambió. */
    let raw = this.playerAnimationsOptions.global;
    if (!raw || raw === "none") {
        raw = (this._rootMotionTable && this._rootMotionKey)
            ? (this._rootMotionTable[this._rootMotionKey] || "none")
            : "none";
    }

    if (raw !== this._rootMotionRaw) {
        /* PARSEO (solo al cambiar): texto -> kind + banderas de ejes */
        if (this._motionKind === CharacterMotionKindEnum.TELEPORT) {
            this._restoreTemplateOffset();   /* veníamos de teleport */
        }
        this._rootMotionRaw = raw;
        this._rootMotionPrimed = false;
        this._rootMotionDriving = false;
        this._vRootMotionVelAvg.set(0, 0, 0);
        this._motionUseX = false;
        this._motionUseY = false;
        this._motionUseZ = false;

        if (raw === "teleport") {
            this._motionKind = CharacterMotionKindEnum.TELEPORT;
        } else if (raw === "in_place_all_axis" || raw === "in_place_all") {
            this._motionKind = CharacterMotionKindEnum.IN_PLACE_ALL;   /* legacy */
        } else if (typeof raw === "string" && raw.indexOf("place-in-") === 0) {
            /* las letras tras "place-in-" dicen en qué ejes queda clavado */
            const axes = raw.slice(9);   /* 9 = longitud de "place-in-" */
            this._motionUseX = axes.indexOf("x") !== -1;
            this._motionUseY = axes.indexOf("y") !== -1;
            this._motionUseZ = axes.indexOf("z") !== -1;
            this._motionKind = (this._motionUseX || this._motionUseY || this._motionUseZ)
                ? CharacterMotionKindEnum.AXES
                : CharacterMotionKindEnum.NONE;
        } else {
            this._motionKind = CharacterMotionKindEnum.NONE;   /* "none" o desconocido */
        }
    }

    /* --- 3. APLICAR EL MODO --- */

    /* en VUELO (canmoveonair) la velocidad es del sistema de vuelo: el root
       motion no debe conducir la cápsula */
    if (this.canmoveonair) {
        this._rootMotionDriving = false;
        this._rootMotionPrimed = false;
        this._restoreTemplateOffset();
        return;
    }

    switch (this._motionKind) {
        case CharacterMotionKindEnum.TELEPORT:
            this._applyTeleportFollow(hips, dt);
            return;

        case CharacterMotionKindEnum.AXES: {
            /* place-in-<ejes>: clavar el modelo en esos ejes y NADA MÁS (el
               desplazamiento que la animación trae se descarta; los ejes no
               elegidos conservan la pose animada). La cápsula se mueve solo
               por input/física: cero interferencia = cero trabas al caminar. */
            const restPos = this.playerAnimationsOptions.startPosition;
            if (restPos) {
                const hipsPos = hips.getLocalPosition();
                this._vHipsPinnedPos.set(
                    this._motionUseX ? restPos.x : hipsPos.x,
                    this._motionUseY ? restPos.y : hipsPos.y,
                    this._motionUseZ ? restPos.z : hipsPos.z
                );
                hips.setLocalPosition(this._vHipsPinnedPos);
            }
            this._rootMotionPrimed = false;
            this._rootMotionDriving = false;
            return;
        }

        case CharacterMotionKindEnum.IN_PLACE_ALL: {
            /* legacy: clavar el modelo en TODOS los ejes */
            const restPos = this.playerAnimationsOptions.startPosition;
            if (restPos) hips.setLocalPosition(restPos);
            this._rootMotionPrimed = false;
            this._rootMotionDriving = false;
            return;
        }
    }

    /* NONE: no se hace nada (ni hips, ni cápsula, ni template) */
    this._rootMotionPrimed = false;
    this._rootMotionDriving = false;
    this._restoreTemplateOffset();
}

/* TELEPORT: la animación se reproduce TAL CUAL (no se toca hips) y la cápsula
   del rigidbody ACOMPAÑA al render/template (atributo templateEntity).
   Cómo: la cápsula persigue al visual fijando su VELOCIDAD horizontal
   (delta de hips / dt) — nunca con rigidbody.teleport(), que rompía los
   contactos de suelo — y el template se compensa cada frame por lo que la
   cápsula se movió DE VERDAD (medido, no estimado), de modo que el visual
   queda clavado a la animación aunque la física se frene contra una pared.
   Al terminar/loopear el clip, hips vuelve a su origen y la compensación se
   restaura: el personaje queda físicamente donde el visual terminó. */
Character.prototype._applyTeleportFollow = function (hips, dt) {
    const template = this._templateEntity;
    const body = this.entity.rigidbody;
    if (!template || !body) {
        /* sin template/render separado o sin física no hay a quién acompañar */
        this._rootMotionPrimed = false;
        this._rootMotionDriving = false;
        return;
    }

    const capsulePos = this.entity.getPosition();

    /* --- MUESTREO: cuánto se movió hips desde el frame anterior --- */
    let sampleOk = false;
    const hipsLocalPos = hips.getLocalPosition();
    if (!this._rootMotionPrimed) {
        /* primer frame de la animación: aún no hay "frame anterior" */
        this._vHipsPrevLocal.copy(hipsLocalPos);
        this._rootMotionPrimed = true;
    } else {
        this._vHipsDeltaLocal.set(
            hipsLocalPos.x - this._vHipsPrevLocal.x,
            hipsLocalPos.y - this._vHipsPrevLocal.y,
            hipsLocalPos.z - this._vHipsPrevLocal.z
        );
        this._vHipsPrevLocal.copy(hipsLocalPos);

        /* local -> mundo con el transform del PADRE de hips (incluye el giro de
           encare del template y la escala del rig, p.ej. 0.01 de Mixamo) */
        const hipsParent = hips.parent || this.entity;
        hipsParent.getWorldTransform().transformVector(this._vHipsDeltaLocal, this._vHipsDeltaWorld);

        /* guard de wrap: al reiniciarse el clip, hips salta al inicio en un solo
           frame. Se detecta porque el delta supera lo que un personaje podría
           moverse de verdad en un frame (15 m/s, suelo de 0.25 m para dt chicos). */
        const wrapLimit = (dt * 15 > 0.25) ? dt * 15 : 0.25;
        sampleOk = Math.abs(this._vHipsDeltaWorld.x) <= wrapLimit &&
            Math.abs(this._vHipsDeltaWorld.y) <= wrapLimit &&
            Math.abs(this._vHipsDeltaWorld.z) <= wrapLimit;
    }

    if (!sampleOk) {
        /* wrap del loop o primer frame: hips volvió a su origen -> el visual ya
           vuelve solo a la cápsula (que absorbió el recorrido); restaurar la
           compensación y re-anclar la referencia de posición. */
        this._restoreTemplateOffset();
        this._vCapsulePrevPos.copy(capsulePos);
        this._vRootMotionVelAvg.set(0, 0, 0);
        this._rootMotionDriving = false;
        return;
    }

    /* --- 1) compensar el template por el movimiento REAL de la cápsula desde
       el frame anterior (solo mientras conducimos nosotros; si conduce el
       input, el visual debe viajar con la cápsula como siempre) --- */
    const capsuleMovedX = capsulePos.x - this._vCapsulePrevPos.x;
    const capsuleMovedZ = capsulePos.z - this._vCapsulePrevPos.z;
    this._vCapsulePrevPos.copy(capsulePos);
    if (this._rootMotionDriving && (capsuleMovedX !== 0 || capsuleMovedZ !== 0)) {
        const templatePos = template.getPosition();
        this._vTemplatePos.set(templatePos.x - capsuleMovedX, templatePos.y, templatePos.z - capsuleMovedZ);
        template.setPosition(this._vTemplatePos);
        this._teleportShifted = true;
    }

    /* --- 2) velocidad de persecución (solo plano horizontal: la Y de la
       cápsula la gobierna la gravedad) con tope de seguridad --- */
    this._vRootMotionVel.set(this._vHipsDeltaWorld.x / dt, 0, this._vHipsDeltaWorld.z / dt);
    const speedSq = this._vRootMotionVel.lengthSq();
    if (speedSq > 225) this._vRootMotionVel.scale(15 / Math.sqrt(speedSq));   /* max 15 m/s */

    /* media + histéresis: el vaivén de un idle no debe poner a la cápsula a
       perseguir; un desplazamiento real (>0.2 m/s sostenido) sí. Suelta por
       debajo de 0.1 m/s (sin parpadeo en el umbral). */
    this._vRootMotionVelAvg.lerp(this._vRootMotionVelAvg, this._vRootMotionVel, Math.min(1, dt * 5));
    const avgSpeedSq = this._vRootMotionVelAvg.lengthSq();
    if (this._rootMotionDriving) {
        if (avgSpeedSq < 0.01) this._rootMotionDriving = false;
    } else if (avgSpeedSq > 0.04) {
        this._rootMotionDriving = true;
    }

    if (this._rootMotionDriving) {
        const newVelocity = this._vCurrent.copy(body.linearVelocity);
        newVelocity.x = this._vRootMotionVel.x;
        newVelocity.z = this._vRootMotionVel.z;
        body.linearVelocity = newVelocity;
    }
}

/* Devuelve el template a su posición local de reposo (deshace la compensación
   acumulada por el modo teleport). */
Character.prototype._restoreTemplateOffset = function () {
    if (!this._teleportShifted) return;
    if (this._templateEntity && this._templateBaseLocalPos) {
        this._templateEntity.setLocalPosition(this._templateBaseLocalPos);
    }
    this._teleportShifted = false;
}

/*-----------------------------------------------------------------------------------------*/
/*******************************/
/*                             */
/*   A N I M A T I O N S       */
/*                             */
/*******************************/
/*-----------------------------------------------------------------------------------------*/
Character.prototype.prepareAnimComponent = function () {

    /* BLINDAJE: si algún grupo animations_<modo> no existe aún (escena vieja
       sin re-parsear en el editor), usar objeto vacío en vez de reventar
       Object.keys(undefined) y tumbar todo el initialize */
    for (var g = 0; g < Character.animation_modes.length; g++) {
        if (!this["animations_" + Character.animation_modes[g]]) {
            this["animations_" + Character.animation_modes[g]] = {};
        }
    }

    this._animStateGraphData = {
        layers: [
            {
                name: "baseLayer",
                states: [{ name: "START" }, { name: "ANY" }],
                transitions: []
            }
        ],
        parameters: {
            mode: {
                name: "mode",
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            idle: {
                name: "idle",
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            speed: {
                name: "speed",
                type: pc.ANIM_PARAMETER_FLOAT,
                value: 0
            },
            turn180: {
                name: "turn180",
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            impact: {
                name: "impact",
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            death: {
                name: "death",
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            onair: {
                name: "onair",
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            landing: {
                name: "landing",
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            },
            attack: {
                name: "attack",
                type: pc.ANIM_PARAMETER_INTEGER,
                value: 0
            }
        }
    };


    const statesNoLoops = ["death", "landing"];
    const animation_modes_length = Character.animation_modes.length;
    var m = 0;
    for (; m < animation_modes_length; m++) {
        const animAttr = this["animations_" + Character.animation_modes[m]], keys = Object.keys(animAttr), keys_length = keys.length;
        var i = 0;
        for (; i < keys_length; i++) {
            const stateName = keys[i];
            /* los "<anim>_rootmotion" son selectores de texto, NO animaciones:
               saltarlos (y exigir .id: solo un asset real crea un estado) */
            if (stateName.indexOf("_rootmotion") !== -1) continue;
            if (animAttr[stateName] && animAttr[stateName].id) {
                animAttr[stateName].preload = true;
                const stateLoop = !statesNoLoops.some(s => stateName.includes(s));
                this._animStateGraphData.layers[0].states.push({ name: stateName, loop: stateLoop, assetId: animAttr[stateName].id });
            }
        }
    }






    /* * * * * * * * * * * * * * * * * */
    /*  IDLE                           */
    /* * * * * * * * * * * * * * * * * */
    var m = 0;
    for (; m < animation_modes_length; m++) {
        const modeName = Character.animation_modes[m];


        var idles = Character.animation_idles;
        for (var i = 0; i < idles.length; i++) {
            if (this["animations_" + modeName][modeName + "_" + idles[i]]) {
                this._animStateGraphData.layers[0].transitions.push({
                    from: "START",
                    to: modeName + "_" + idles[i],
                    time: 0.1,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "idle", predicate: pc.ANIM_EQUAL_TO, value: i }
                    ]
                });
            }
        }


        for (var i = 0; i < idles.length; i++) {
            const isStateAnim = this._animStateGraphData.layers[0].states.find(function (s) {
                return s.name === modeName + "_" + idles[i];
            });
            if (i !== 0 && isStateAnim) {
                this._animStateGraphData.layers[0].transitions.push({
                    from: modeName + "_" + idles[i],
                    to: modeName + "_" + idles[i - 1],
                    time: 0.1,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: 0 },
                        { parameterName: "idle", predicate: pc.ANIM_EQUAL_TO, value: i - 1 }
                    ]
                });
            }
        }


        /*WALKING*/
        if (this["animations_" + modeName][modeName + "_walking"]) {

            for (var i = 0; i < idles.length; i++) {
                const isStateAnim = this._animStateGraphData.layers[0].states.find(function (s) {
                    return s.name === modeName + "_" + idles[i];
                });
                if (isStateAnim) {
                    this._animStateGraphData.layers[0].transitions.push(
                        {
                            from: modeName + "_" + idles[i],
                            to: modeName + "_walking",
                            time: 0.2,
                            priority: 0,
                            conditions: [
                                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                                { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0 }
                            ]
                        },
                        {
                            from: modeName + "_walking",
                            to: modeName + "_" + idles[i],
                            time: 0.1,
                            priority: 0,
                            conditions: [
                                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                                { parameterName: "idle", predicate: pc.ANIM_EQUAL_TO, value: i },
                                { parameterName: "speed", predicate: pc.ANIM_LESS_THAN, value: 0.01 }
                            ]
                        }


                    );
                }
            }

            if (this["animations_" + modeName][modeName + "_walking_turn_180"]) {

                this._animStateGraphData.layers[0].transitions.push(
                    {
                        from: "ANY",
                        to: modeName + "_walking_turn_180",
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0 },
                            { parameterName: "speed", predicate: pc.ANIM_LESS_THAN_EQUAL_TO, value: 0.99 },
                            { parameterName: "turn180", predicate: pc.ANIM_EQUAL_TO, value: 1 }
                        ]
                    },
                    {
                        from: modeName + "_walking_turn_180",
                        to: modeName + "_walking",
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0 },
                            { parameterName: "speed", predicate: pc.ANIM_LESS_THAN_EQUAL_TO, value: 0.99 },
                            { parameterName: "turn180", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                        ]
                    }/*,
                {
                    from: "unarmed_walking_turn_180",
                    to: "START",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: 0 },
                        { parameterName: "turn180", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                    ]
                }*/



                );
            }

        }

        /*RUNNING*/
        if (this["animations_" + modeName][modeName + "_running"]) {
            if (this["animations_" + modeName][modeName + "_walking"]) {

                this._animStateGraphData.layers[0].transitions.push(
                    {
                        from: modeName + "_walking",
                        to: modeName + "_running",
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0.99 }
                        ]
                    },
                    {
                        from: modeName + "_running",
                        to: modeName + "_walking",
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "speed", predicate: pc.ANIM_LESS_THAN, value: 1 }
                        ]
                    }
                );
            }

            for (var i = 0; i < idles.length; i++) {
                const isStateAnim = this._animStateGraphData.layers[0].states.find(function (s) {
                    return s.name === modeName + "_" + idles[i];
                });
                if (isStateAnim) {
                    this._animStateGraphData.layers[0].transitions.push(
                        {
                            from: modeName + "_" + idles[i],
                            to: modeName + "_running",
                            time: 0.2,
                            priority: 0,
                            conditions: [
                                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                                { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN_EQUAL_TO, value: 1 },
                            ]
                        },
                        {
                            from: modeName + "_running",
                            to: modeName + "_" + idles[i],
                            time: 0.1,
                            priority: 0,
                            conditions: [
                                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                                { parameterName: "idle", predicate: pc.ANIM_EQUAL_TO, value: i },
                                { parameterName: "speed", predicate: pc.ANIM_LESS_THAN, value: 0.01 }
                            ]
                        }

                    );
                }
            }
        }


        /*IMPACT*/
        if (this["animations_" + modeName][modeName + "_impact_block"]) {

            this._animStateGraphData.layers[0].transitions.push(
                {
                    from: "ANY",
                    to: modeName + "_impact_block",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "impact", predicate: pc.ANIM_EQUAL_TO, value: 1 }
                    ]
                },
                {
                    from: modeName + "_impact_block",
                    to: modeName + "_idle",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "impact", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                    ]
                }
            );
        }

        for (var i = 1; i < 3; i++) {
            if (this["animations_" + modeName][modeName + "_impact" + i]) {

                this._animStateGraphData.layers[0].transitions.push(
                    {
                        from: "ANY",
                        to: modeName + "_impact" + i,
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "impact", predicate: pc.ANIM_EQUAL_TO, value: i + 1 }
                        ]
                    },
                    {
                        from: modeName + "_impact" + i,
                        to: modeName + "_idle",
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "impact", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                        ]
                    }
                );
            }
        }


        /*ONAIR*/
        if (this["animations_" + modeName][modeName + "_onair"]) {

            this._animStateGraphData.layers[0].transitions.push(
                {
                    from: "ANY",
                    to: modeName + "_onair",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "onair", predicate: pc.ANIM_EQUAL_TO, value: 1 }
                    ]
                },
                {
                    from: modeName + "_onair",
                    to: modeName + "_idle",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "onair", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                    ]
                }
            );
        }


        if (this["animations_" + modeName][modeName + "_landing"]) {

            this._animStateGraphData.layers[0].transitions.push(
                {
                    from: "ANY",
                    to: modeName + "_landing",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "landing", predicate: pc.ANIM_EQUAL_TO, value: 1 }
                    ]
                },
                {
                    from: modeName + "_landing",
                    to: modeName + "_idle",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "landing", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                    ]
                }
            );
        }





        /*IMPACT*/
        if (this["animations_" + modeName][modeName + "_impact_block"]) {

            this._animStateGraphData.layers[0].transitions.push(
                {
                    from: "ANY",
                    to: modeName + "_impact_block",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "impact", predicate: pc.ANIM_EQUAL_TO, value: 1 }
                    ]
                },
                {
                    from: modeName + "_impact_block",
                    to: modeName + "_idle",
                    time: 0.2,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                        { parameterName: "impact", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                    ]
                }
            );
        }


        /*ATTACK*/

        for (var i = 0; i < Character.animation_attack.length; i++) {
            if (this["animations_" + modeName][modeName + "_" + Character.animation_attack[i]]) {
                this._animStateGraphData.layers[0].transitions.push(
                    {
                        from: "ANY",
                        to: modeName + "_" + Character.animation_attack[i],
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "attack", predicate: pc.ANIM_EQUAL_TO, value: i + 1 }
                        ]
                    },
                    {
                        from: modeName + "_" + Character.animation_attack[i],
                        to: modeName + "_idle",
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "attack", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                        ]
                    }
                );
            }
        }



    }



    /***************************************************** */
    /*TRANSITIONS MODES */
    /***************************************************** */
    var m = 0;
    for (; m < animation_modes_length; m++) {
        const modeName = Character.animation_modes[m];
        const afterModeName = Character.animation_modes[m + 1];
        /* el último modo no tiene sucesor: sin este guard, animations_undefined
           lanza TypeError si ese modo tiene algún clip asignado */
        if (!afterModeName) continue;
        /* el modo ONAIR maneja sus propias entradas/retornos (ver bloque
           AIR MODE); no participa del encadenado por pares para no duplicar
           un onair_idle<->_idle sin condición de speed que competiría con el
           retorno a walk/run */
        if (m === CharacterLocomotionModeEnum.ONAIR || (m + 1) === CharacterLocomotionModeEnum.ONAIR) continue;

        const animAttr = this["animations_" + modeName], keys = Object.keys(animAttr), keys_length = keys.length;
        var i = 0;
        for (; i < keys_length; i++) {
            /* saltar los selectores "motion root": son texto, no animaciones, y
               crearían transiciones hacia estados que no existen */
            if ((keys[i] || "").indexOf("_rootmotion") !== -1) continue;
            const stateName = (keys[i] || "").replace(modeName + "_", "");
            if (this["animations_" + modeName][modeName + "_" + stateName] && this["animations_" + modeName][modeName + "_" + stateName].id &&
                this["animations_" + afterModeName][afterModeName + "_" + stateName] && this["animations_" + afterModeName][afterModeName + "_" + stateName].id) {

                this._animStateGraphData.layers[0].transitions.push(
                    {
                        from: modeName + "_" + stateName,
                        to: afterModeName + "_" + stateName,
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m + 1 }
                        ]
                    },
                    {
                        from: afterModeName + "_" + stateName,
                        to: modeName + "_" + stateName,
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m }
                        ]
                    }
                );

            }

        }
    }







    /***************************************************** */
    /* AIR MODE (ONAIR) TRANSITIONS                        */
    /***************************************************** */
    /* El modo ONAIR (salto/caída) usa como pose de aire el estado <onair>_idle.
       Se ENTRA desde CUALQUIER estado en cuanto mode==ONAIR (independiente de la
       velocidad, así saltar corriendo corta walk/run al instante), y se RETORNA
       al modo de arma al aterrizar (mode vuelve a su valor) hacia idle/walk/run
       según speed, para no meter un frame de idle si se aterriza en movimiento.
       Requiere tener asignado el clip "onair_idle". */
    const airModeName = Character.animation_modes[CharacterLocomotionModeEnum.ONAIR];
    const airIdleState = airModeName + "_idle";
    const graphStates = this._animStateGraphData.layers[0].states;
    const hasGraphState = function (n) {
        return graphStates.some(function (s) { return s.name === n; });
    };

    if (hasGraphState(airIdleState)) {
        /* ENTRADA: cualquier estado -> pose de aire cuando mode==ONAIR */
        this._animStateGraphData.layers[0].transitions.push({
            from: "ANY",
            to: airIdleState,
            time: 0.12,
            priority: 0,
            conditions: [
                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: CharacterLocomotionModeEnum.ONAIR }
            ]
        });

        /* RETORNO: al salir del modo ONAIR (aterrizaje) hacia el modo de arma.
           Rangos de speed mutuamente excluyentes: idle < 0.01, walking [0.01,0.99],
           running > 0.99. */
        for (var wm = 0; wm < animation_modes_length; wm++) {
            if (wm === CharacterLocomotionModeEnum.ONAIR) continue;
            const wModeName = Character.animation_modes[wm];

            if (hasGraphState(wModeName + "_idle")) {
                this._animStateGraphData.layers[0].transitions.push({
                    from: airIdleState,
                    to: wModeName + "_idle",
                    time: 0.15,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: wm },
                        { parameterName: "speed", predicate: pc.ANIM_LESS_THAN, value: 0.01 }
                    ]
                });
            }
            if (hasGraphState(wModeName + "_walking")) {
                this._animStateGraphData.layers[0].transitions.push({
                    from: airIdleState,
                    to: wModeName + "_walking",
                    time: 0.15,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: wm },
                        { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN_EQUAL_TO, value: 0.01 },
                        { parameterName: "speed", predicate: pc.ANIM_LESS_THAN_EQUAL_TO, value: 0.99 }
                    ]
                });
            }
            if (hasGraphState(wModeName + "_running")) {
                this._animStateGraphData.layers[0].transitions.push({
                    from: airIdleState,
                    to: wModeName + "_running",
                    time: 0.15,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: wm },
                        { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0.99 }
                    ]
                });
            }
        }
    }


    // add an anim component to the entity
    this.entity.addComponent("anim", {
        activate: true,
        rootBone: this.playerAnimationsOptions.hips && this.playerAnimationsOptions.hips
    });

    this.entity.anim.loadStateGraph(this._animStateGraphData);


    const locomotionLayer = this.entity.anim.baseLayer,
        states = this._animStateGraphData.layers[0].states,
        states_length = states.length;
    var i = 0;
    for (; i < states_length; i++) {
        const state = states[i];
        if (state.name !== "START" && state.name !== "END" && state.name !== "ANY") {


            var asset = this.app.assets.get(states[i].assetId);

            if (asset && asset.type === "animation") {
                if (asset.resource) {

                    locomotionLayer.assignAnimation(state.name, asset.resource);
                    state.animDuration = asset.resource.duration;
                    if (state.name.indexOf("attack") !== -1) {
                        asset.resource.events = new pc.AnimEvents([
                            {
                                time: asset.resource.duration,
                                name: "attack-end-animation"
                            },
                            {
                                time: asset.resource.duration * 0.25,
                                name: "attack-start-damage-animation"
                            },
                            {
                                time: asset.resource.duration * 0.75,
                                name: "attack-end-damage-animation"
                            }
                        ]);
                    }
                } else {
                    // El asset aún no está cargado, cargarlo
                    asset.ready(function (e) {
                        locomotionLayer.assignAnimation(state.name, e.resource);
                        state.animDuration = e.resource.duration;
                        if (state.name.indexOf("attack") !== -1) {
                            e.resource.events = new pc.AnimEvents([
                                {
                                    time: e.resource.duration,
                                    name: "attack-end-animation"
                                },
                                {
                                    time: e.resource.duration * 0.25,
                                    name: "attack-start-damage-animation"
                                },
                                {
                                    time: e.resource.duration * 0.75,
                                    name: "attack-end-damage-animation"
                                }
                            ]);

                            //this.entity.attackSystem.
                        }

                    }.bind(this));
                    this.app.assets.load(asset);
                }
            }
        }
    }






    this.entity.anim.on("attack-end-animation", function (e) {
        this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.NONE;
        this._setWeaponsDamaging(false);   // seguridad: cerrar ventana al terminar
    }, this);

    this.entity.anim.on("attack-start-damage-animation", function (e) {
        if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.DAMAGING;
            this._setWeaponsDamaging(true);   // ABRE ventana de daño del arma
        }
    }, this);

    this.entity.anim.on("attack-end-damage-animation", function (e) {
        if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.ENDING;
            this._setWeaponsDamaging(false);  // CIERRA ventana de daño del arma
        }
    }, this);


};
/************************************************************************ */
