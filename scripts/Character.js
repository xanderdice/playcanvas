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
                name: "traceplayercapsule",
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


Character.attributes.add("playerAnimationsOptions",
    {
        title: "Player Animations Options",
        type: "json",
        schema: [
            {
                name: "motionrootmode",
                title: "Motion root mode",
                type: "string", enum: [
                    { "in_place_all_axis": "in_place_all_axis" },
                    { "in_place_z_axis": "in_place_z_axis" },
                    { "teleport": "teleport" },
                    { "none": "none" }],
                default: "in_place_z_axis"
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
        Character.attributes.add("animations_" + modeName,
            {
                title: "Animations " + modeName,
                type: "json",
                schema: statesSchema
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
    this.app.scene.root.addChild(this.pointCharacterEntity);



    this._doMoveBusy = false;


    this._curPosition = this.entity.getPosition();



    this.renderCharacterComponent = this.entity.findComponent("render");

    this.entity.renderCharacterComponent = this.renderCharacterComponent;
    if (this.renderCharacterComponent) {
        this.renderCharacterComponent.entity.tags.add("uranus-instancing-exclude");
        this._characterMeshInstance = ((this.renderCharacterComponent.meshInstances || [])[0] || { visibleThisFrame: false });
    } else {
        this._characterMeshInstance = { visibleThisFrame: true };
    }




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
    };


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

    if (this.bones.hips) {
        this.playerAnimationsOptions.startPosition = this.bones.hips.getLocalPosition().clone();
    }
    this._motionRootMode = this.playerAnimationsOptions.motionrootmode;
    if (this.renderCharacterComponent) {
        this.renderCharacterComponent.rootBone = this.bones.hips;
    }


    this.characterHeight = getTotalHeight(this.entity) || 2;
    this.characterRadius = 0.5;

    if (!this.entity.collision) {
        this.entity.tags.add("uranus-instancing-exclude");
        this.entity.tags.add("is-capsule-collision");
        this.entity.addComponent("collision", {
            type: "capsule",
            radius: this.characterRadius,
            height: this.characterHeight
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



    if (this.tracerOptions.enabled && this.tracerOptions.traceplayercapsule) {
        // Crear el material transparente
        const transparentMaterial = new pc.StandardMaterial();
        transparentMaterial.diffuse = new pc.Color(1, 0, 0);  // Color rojo para el material
        transparentMaterial.update();  // Necesitamos actualizar el material para que los cambios se apliquen

        const capsuleMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, new pc.CapsuleGeometry({
            radius: this.characterRadius,
            height: this.characterHeight
        }));

        const meshInstance = new pc.MeshInstance(capsuleMesh, transparentMaterial);
        meshInstance.renderStyle = pc.RENDERSTYLE_WIREFRAME;
        const model = new pc.Model();
        model.graph = new pc.GraphNode();
        model.meshInstances = [meshInstance];

        this.entity.capsule_collision = new pc.Entity(this.entity.name + "_capsule_collision");
        this.entity.addChild(this.entity.capsule_collision);
        // Añadir el componente de renderizado con las opciones adecuadas
        this.entity.capsule_collision.addComponent("render", {
            type: "asset",
            renderStyle: pc.RENDERSTYLE_WIREFRAME,  // Estilo de renderizado en alambre
            material: transparentMaterial,  // Asignamos el material
            castShadows: false
        });

        this.entity.capsule_collision.render.meshInstances = model.meshInstances;
    }




    /* SUELO POR CONTACTOS: _updateGroundedState() no lanza raycasts; el estado se alimenta
       de los eventos collisionstart/collisionend de la cápsula. */
    this._groundContacts = 0;   // cuántas superficies "suelo" nos sostienen
    this._groundBy = {};        // guid de entidad -> true si nos está sosteniendo
    this._coyoteTime = 0;       // gracia anti-parpadeo de manifolds de Bullet

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
            angularFactor: new pc.Vec3(0, 1, 0)
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

    this.prepareAnimComponent();




    /* OPTIMIZACION (GC): vectores/quats reutilizables para evitar "new pc.Vec3()" / ".clone()"
       en el hot-path (doMove, _updateGroundedState, rootMotionFix). Cada uno tiene una única responsabilidad
       dentro de una misma llamada para evitar aliasing entre ellos. */
    this._vTmp = new pc.Vec3();            // temporal de uso puntual (una sola responsabilidad por llamada)
    this._vDirection = new pc.Vec3();      // dirección de movimiento deseada
    this._vCamForward = new pc.Vec3();     // forward de cámara/objetivo (temporal)
    this._vCamRight = new pc.Vec3();       // right de cámara/objetivo (temporal)
    this._vDesired = new pc.Vec3();        // velocidad deseada
    this._vCurrent = new pc.Vec3();        // velocidad lineal actual (lectura)
    this._vAccel = new pc.Vec3();          // aceleración / fuerza a aplicar
    this._vLinStop = new pc.Vec3();        // velocidad lineal al detenerse
    this._vAngStop = new pc.Vec3();        // velocidad angular al detenerse
    this._vAngTurn = new pc.Vec3();        // velocidad angular al girar
    this._vFaceDir = new pc.Vec3();        // dirección a la que mirar
    this._vForward = new pc.Vec3();        // forward actual de la entidad (temporal)
    this._vHipsPos = new pc.Vec3();        // posición local de hips (rootMotionFix)
    this._qHipsRot = new pc.Quat();        // rotación local de hips (rootMotionFix)
    this._vJump = new pc.Vec3();           // velocidad lineal al saltar

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
    this._templateEntity = this._resolveTemplateEntity();

    if (this._templateEntity) {
        this._templateWorldBase = this._templateEntity.getRotation().clone();
        this._templateBaseScale = this._templateEntity.getLocalScale().clone();
        this._templateYaw = 0;

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

    /* refleja en runtime los cambios del atributo tracerOptions */
    this.on("attr:tracerOptions", function (nuevoValor) {
        if (this.entity.capsule_collision) {
            this.entity.capsule_collision.render.enabled = nuevoValor.enabled ? nuevoValor.traceplayercapsule : false;
        }
    }, this);




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
    // Calcula la altura total (eje Y) de una entidad y todos sus hijos
    function getTotalHeight(entity) {
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

        // 3. Extraer altura (extensión total en Y)
        if (first) {
            console.warn("No se encontraron meshInstances en la jerarquía");
            return 0;
        }
        const height = combinedAABB.halfExtents.y * 2 <= 0.1 ? 0 : combinedAABB.halfExtents.y * 2;
        return height;
    }


};


///
/// HELPERS:
///







Character.prototype.updateSpeedAnimBlendFromVelocity = function (dt) {

    const v = this.entity.rigidbody.linearVelocity;
    const horizontalSpeed = Math.sqrt(v.x * v.x + v.z * v.z);

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


Character.prototype.stopMovement = function () {

    this.entity.rigidbody.linearVelocity = new pc.Vec3(0, this.entity.rigidbody.linearVelocity.y, 0);



}


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

    const input = this.entity.input || {};
    const dt = Number(input.dt || 0);
    const useFlight = !!this.canmoveonair;

    this._curPosition = this.entity.getPosition();

    if (this.pointCharacterEntity) {
        this.pointCharacterEntity.setPosition(this._curPosition);
    }

    const visibleThisFrame = (this._characterMeshInstance && typeof this._characterMeshInstance.visibleThisFrame === "boolean")
        ? this._characterMeshInstance.visibleThisFrame
        : true;

    if (this.entity.anim) {
        this.entity.anim.enabled = visibleThisFrame;
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
            /* OPTIMIZACION (GC): this._vTmp en vez de .clone() para el vector temporal */
            const directionToTarget = this._vTmp.copy(targetDirection.getPosition()).sub(this._curPosition).normalize();

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

    this._isMoving = this._isMoving && this.entity.anim.getInteger("turn180") === 0;

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
            const current = this._vCurrent.copy(this.entity.rigidbody.linearVelocity);
            current.lerp(current, desiredVelocity, Math.min(1, dt * 8));
            this.entity.rigidbody.linearVelocity = current;
        } else {
            const currentVelocity = this._vCurrent.copy(this.entity.rigidbody.linearVelocity);
            currentVelocity.y = 0;
            desiredVelocity.y = 0;

            const accel = this._vAccel.copy(desiredVelocity).sub(currentVelocity);
            const force = accel.scale(this.entity.rigidbody.mass * 8);
            force.y = 0;

            this.entity.rigidbody.applyForce(force);
        }
    } else if (useFlight) {
        /* VUELO sin input: frenado suave hasta quedar en hover (sin esto, al no
           haber gravedad ni damping, la velocidad persistiría para siempre) */
        const v = this._vLinStop.copy(this.entity.rigidbody.linearVelocity);
        const damp = 1 - Math.min(1, dt * (this.inertia ? 4 : 20));
        v.x *= damp;
        v.y *= damp;
        v.z *= damp;
        this.entity.rigidbody.linearVelocity = v;
    } else if (stopMovementNow || (!this._isMoving && !this.inertia)) {
        const v = this._vLinStop.copy(this.entity.rigidbody.linearVelocity);

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

        this.entity.rigidbody.linearVelocity = v;

        const a = this._vAngStop.copy(this.entity.rigidbody.angularVelocity);
        a.x = 0;
        a.y = 0;
        a.z = 0;
        this.entity.rigidbody.angularVelocity = a;
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

            const v = this._vJump.copy(this.entity.rigidbody.linearVelocity);
            v.y = vy;
            this.entity.rigidbody.linearVelocity = v;

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
        this._applyTemplateRotation();
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

            const ang = this._vAngTurn.copy(this.entity.rigidbody.angularVelocity);
            ang.x = 0;
            ang.z = 0;
            ang.y = pc.math.clamp(delta * turnSpeed, -maxTurnSpeed, maxTurnSpeed);
            this.entity.rigidbody.angularVelocity = ang;
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





            if ((this.carryWeapons.leftHandWeaponEntity._guid || "0") !== (this.carryWeapons.leftHandWeaponEntityOld || {})._guid) {
                this.entity.attackSystem.leftHandWeaponRigidBody = this.carryWeapons.leftHandWeaponEntity.findComponent("rigidbody");
                setDefRigidBodyValues(this.entity.attackSystem.leftHandWeaponRigidBody);
                var col = this.carryWeapons.leftHandWeaponEntity.findComponent("collision");
                if (col) {
                    col.entity.tags.add("is-taken");
                    col.on("triggerenter", this.onCollisionStartLeftWeapon, this);
                    col.on("triggerleave", this.onCollisionEndLeftWeapon, this);
                }
            }

        } else {
            if (this.carryWeapons.leftHandWeaponEntityOld) {
                /*QUITAR COLISIONES*/
                this.entity.attackSystem.leftHandWeaponRigidBody = null;
                var col = this.carryWeapons.leftHandWeaponEntityOld.findComponent("collision");
                if (col) {
                    col.entity.tags.remove("is-taken");
                    col.off("triggerenter", this.onCollisionStartLeftWeapon);
                    col.off("triggerleave", this.onCollisionEndLeftWeapon);
                }
            }
        }

        this.carryWeapons.leftHandWeaponEntityOld = this.carryWeapons.leftHandWeaponEntity;
    }

    if (this.bones.rightHand) {
        if (this.carryWeapons.rightHandWeaponEntity) {
            this.carryWeapons.rightHandWeaponEntity.setPosition(this.bones.rightHand.getPosition());
            this.carryWeapons.rightHandWeaponEntity.setRotation(this.bones.rightHand.getRotation());

            if ((this.carryWeapons.rightHandWeaponEntity._guid || "0") !== (this.carryWeapons.rightHandWeaponEntityOld || {})._guid) {

                var r = this.carryWeapons.rightHandWeaponEntity.findComponent("render");
                if (r) {
                    var rotation = new pc.Quat();
                    rotation.setFromEulerAngles(0, -90, 0);

                    // Aplica la rotación a la entidad
                    r.entity.setRotation(rotation);
                }

                this.entity.attackSystem.rightHandWeaponRigidBody = this.carryWeapons.rightHandWeaponEntity.findComponent("rigidbody");
                setDefRigidBodyValues(this.entity.attackSystem.rightHandWeaponRigidBody);
                var col = this.carryWeapons.rightHandWeaponEntity.findComponent("collision");
                if (col) {
                    col.entity.tags.add("is-taken");
                    col.on("triggerenter", this.onCollisionStartRightWeapon, this);
                    col.on("triggerleave", this.onCollisionEndRightWeapon, this);
                }
            }
        } else {
            if (this.carryWeapons.rightHandWeaponEntityOld) {
                /*QUITAR COLISIONES*/
                this.entity.attackSystem.rightHandWeaponRigidBody = null;
                var col = this.carryWeapons.rightHandWeaponEntityOld.findComponent("collision");
                if (col) {
                    col.entity.tags.remove("is-taken");
                    col.off("triggerenter", this.onCollisionStartRightWeapon);
                    col.off("triggerleave", this.onCollisionEndRightWeapon);
                }
            }
        }
        this.carryWeapons.rightHandWeaponEntityOld = this.carryWeapons.rightHandWeaponEntity;
    }
}

/* LIMPIEZA. Cubre los dos casos: destruir la cápsula (entidad) o quitar solo el
   script. Todo lo que este script crea/engancha debe soltarse aquí para no dejar
   entidades huérfanas ni callbacks colgando que referencien un script muerto. */
Character.prototype._onDestroy = function () {
    var entity = this.entity;

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

    /* armas: la entidad del arma es EXTERNA (no hija). No la destruimos, solo
       desenganchamos nuestros triggers y el tag is-taken. */
    this._detachWeapon(this.carryWeapons.leftHandWeaponEntity || this.carryWeapons.leftHandWeaponEntityOld,
        this.onCollisionStartLeftWeapon, this.onCollisionEndLeftWeapon);
    this._detachWeapon(this.carryWeapons.rightHandWeaponEntity || this.carryWeapons.rightHandWeaponEntityOld,
        this.onCollisionStartRightWeapon, this.onCollisionEndRightWeapon);

    /* entidad auxiliar colgada de scene.root (NO es hija de la cápsula): hay que
       destruirla a mano o queda huérfana en la escena */
    if (this.pointCharacterEntity) {
        this.pointCharacterEntity.destroy();
        this.pointCharacterEntity = null;
    }

    /* cápsula de debug (hija de la entidad): si solo se quita el script, limpiarla;
       si se destruye la entidad, ya cae con ella */
    if (entity && entity.capsule_collision) {
        entity.capsule_collision.destroy();
        entity.capsule_collision = null;
    }
};

/* Suelta los triggers y el tag is-taken que este script enganchó en un arma.
   La entidad del arma es externa: no se destruye, solo se desengancha. */
Character.prototype._detachWeapon = function (weaponEntity, onEnter, onLeave) {
    if (!weaponEntity || !weaponEntity.findComponent) return;
    var col = weaponEntity.findComponent("collision");
    if (col) {
        col.entity.tags.remove("is-taken");
        col.off("triggerenter", onEnter, this);
        col.off("triggerleave", onLeave, this);
    }
};

Character.prototype.onCollisionStartRightWeapon = function (other) {
    this.onCollisionStartWeapon(other, "right");
}
Character.prototype.onCollisionEndRightWeapon = function (other) {
}
Character.prototype.onCollisionStartLeftWeapon = function (other) {
    this.onCollisionStartWeapon(other, "left");
}
Character.prototype.onCollisionEndLeftWeapon = function (other) {
}


Character.prototype.onCollisionStartWeapon = function (other, hand) {
    if (this.entity.attackSystem.status === CharacterAttackSystemStatusEnum.DAMAGING) {
        if (this.entity.isPlayer && other.isPlayer) return;

        if (other.isCharacter) {
            console.log("DAMAGIN CHARACTER !!!");
        }
    }
}

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
    if (this.entity.other === other) this.entity.other = null;

    if (this._groundBy[other._guid]) {
        this._groundBy[other._guid] = false;
        if (this._groundContacts > 0) this._groundContacts--;
    }
}

Character.prototype._updateGroundedState = function () {
    /* Suelo por contactos de la cápsula, sin raycasts (ver characterCollisionStart/End).
       coyoteTime = 100 ms de gracia para cubrir el parpadeo de manifolds de Bullet. */
    var dt = this.entity.input.dt || 0;

    if (this._groundContacts > 0) {
        this._coyoteTime = 0.1;
    } else if (this._coyoteTime > 0) {
        this._coyoteTime -= dt;
    }

    var grounded = this._groundContacts > 0 || this._coyoteTime > 0;

    /* caída franca: anula la gracia (cubre collisionend perdidos) */
    if (grounded && this.entity.rigidbody.linearVelocity.y < -1.5) {
        grounded = false;
        this._coyoteTime = 0;
    }

    /* fallback, mismo criterio que la versión original con raycasts: sin evidencia
       de contacto solo se está en el aire si se está cayendo (vy <= -0.3) */
    if (!grounded) {
        grounded = this.entity.rigidbody.linearVelocity.y > -0.3;
    }

    /* SALTO: durante el ascenso el fallback por velocidad daría grounded=true
       (vy > 0); mientras dure el salto se está en el aire. Aterrizaje = volver
       a tener contacto de suelo sin velocidad ascendente. */
    if (this._jumping) {
        if (this._groundContacts > 0 && this.entity.rigidbody.linearVelocity.y <= 0.01) {
            this._jumping = false;
        } else {
            grounded = false;
        }
    }

    if (this.canmoveonair) grounded = false;

    this.entity.isonground = grounded;
    this.entity.isonair = !grounded;
}


/*-----------------------------------------------------------------------------------------*/
/*-----------------------------------------------------------------------------------------*/
/*******************************/
/*                             */
/*   U P D A T E               */
/*                             */
/*******************************/
/*-----------------------------------------------------------------------------------------*/
Character.prototype.postUpdate = function (dt) {
    this.rootMotionFix();
    this.doCarryWeapons();
}

Character.prototype.rootMotionFix = function () {



    /*root motion FIX*/
    if (this._motionRootMode === "in_place_z_axis") {
        if (this.bones.hips) {
            var vecpos = this.bones.hips.getLocalPosition();
            this._vHipsPos.set(vecpos.x, vecpos.y, this.playerAnimationsOptions.startPosition.z ?? 0);
            this.bones.hips.setLocalPosition(this._vHipsPos);

            const isTurning180 = this.entity.anim.getInteger("turn180") !== 0;
            if (isTurning180) {
                var vecrot = this.bones.hips.getLocalRotation();
                this._qHipsRot.set(vecrot.x, 0, vecrot.z, vecrot.w);
                this.bones.hips.setLocalRotation(this._qHipsRot);
            }

        }
    }
    if (this._motionRootMode === "in_place_all_axis") {
        this.bones.hips?.setLocalPosition(this.playerAnimationsOptions.startPosition);
    }

    /* si el atributo motionrootmode cambia en runtime, resincronizar */
    if (this._motionRootMode !== this.playerAnimationsOptions.motionrootmode) {
        this.bones.hips?.setLocalPosition(this.playerAnimationsOptions.startPosition);
        this._motionRootMode = this.playerAnimationsOptions.motionrootmode;
    }
}

/*-----------------------------------------------------------------------------------------*/
/*******************************/
/*                             */
/*   A N I M A T I O N S       */
/*                             */
/*******************************/
/*-----------------------------------------------------------------------------------------*/
Character.prototype.prepareAnimComponent = function () {

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
            if (animAttr[stateName]) {
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
            const stateName = (keys[i] || "").replace(modeName + "_", "");
            if (this["animations_" + modeName][modeName + "_" + stateName] && this["animations_" + afterModeName][afterModeName + "_" + stateName]) {

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
                                time: asset.resource.duration * 1000 / 4 / 1000,
                                name: "attack-start-damage-animation"
                            },
                            {

                                time: (3 * asset.resource.duration * 1000 / 4) / 1000,
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
                                    time: e.resource.duration * 1000 / 4 / 1000,
                                    name: "attack-start-damage-animation"
                                },
                                {
                                    time: (3 * asset.resource.duration * 1000 / 4) / 1000,
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
    }, this);

    this.entity.anim.on("attack-start-damage-animation", function (e) {
        if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.DAMAGING;
        }
    }, this);

    this.entity.anim.on("attack-end-damage-animation", function (e) {
        if (this.entity.attackSystem.status !== CharacterAttackSystemStatusEnum.NONE) {
            this.entity.attackSystem.status = CharacterAttackSystemStatusEnum.ENDING;
        }
    }, this); 


};
/************************************************************************ */
