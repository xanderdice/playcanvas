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
            },
            {
                name: "tracefacing",
                type: "boolean",
                default: false
            },
            {
                name: "traceanimlod",
                type: "boolean",
                default: false
            }
        ]
    });
/* NOTA: los antiguos traceplayercapsule/tracehitpoints se eliminaron — todas
   las colisiones (capsula, hitpoints, armas, mundo) se visualizan con el
   AmmoDebugDrawer del gameManager (tracer.trenableammodebugdrawer). */


/* TODO lo relativo a ANIMACION del personaje vive en este grupo: el motion root
   global y el LOD de animacion. Estaban separados (playerAnimationsOptions y
   animationLod) y no habia motivo: los dos gobiernan como corre la animacion y
   se leen juntos en el mismo sitio (rootMotionFix lee el motion root usando el
   _animDtApplied que publica el LOD). Un solo grupo en el editor. */
Character.attributes.add("playerAnimationsOptions",
    {
        title: "Animations Options (motion root + LOD)",
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
            },

            /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
             *  LOD DE ANIMACION
             *  En una multitud el coste dominante NO es doMove: es el sistema de
             *  animacion (evaluar ~200 curvas por clip, escribir ~65 huesos y
             *  re-sincronizar la jerarquia, por personaje y por frame). El LOD
             *  desacopla la tasa de ANIMACION de la de RENDER: la animacion corre
             *  a lodRateHz fijos en vez de a los fps que de la maquina.
             *  Ver _updateAnimLod para el mecanismo y las garantias en maquinas
             *  lentas (resumen: por debajo de lodRateHz el LOD se apaga solo y no
             *  puede saltear ni un frame, asi que nunca empeora lo que habia).
             * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
            {
                name: "lodEnabled",
                type: "boolean",
                default: true,
                title: "Animation LOD",
                description: "Desacopla la tasa de animacion de la de render. Apagado, cada frame de " +
                    "render evalua la animacion (comportamiento anterior)."
            },
            {
                name: "lodRateHz",
                type: "number",
                default: 30,
                min: 5,
                max: 120,
                precision: 0,
                title: "LOD rate (Hz)",
                description: "Veces por segundo que se evalua la animacion. 30 = a 60 fps se anima 1 de " +
                    "cada 2 frames; a 120 fps 1 de cada 4; a 30 fps o menos TODOS los frames (el LOD se " +
                    "desactiva solo y nunca puede empeorar lo que habia). El frame que si anima avanza el " +
                    "tiempo acumulado, asi que la animacion NO se ve en camara lenta: solo se muestrea " +
                    "mas grueso."
            },
            {
                name: "lodPlayerFullRate",
                type: "boolean",
                default: true,
                title: "player at full rate",
                description: "ENCENDIDO por defecto: el PLAYER se exime del LOD y anima a la tasa de " +
                    "render. Es el personaje que el jugador mira de cerca todo el tiempo y el unico cuya " +
                    "animacion responde a su input, asi que ahi el muestreo grueso se nota (sobre todo en " +
                    "ataques rapidos) y ademas ahorra 1 personaje de 30: no compensa. Apagalo solo si " +
                    "necesitas hasta ese ultimo frame."
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
            },
            /* ENCARE (facing lock): dentro de un radio, el personaje MIRA al character
               mas cercano en vez de mirar hacia donde se mueve (asi camina hacia atras
               sin dar la espalda). Vive en attackSystem porque encarar al rival es
               parte del combate. Lo demas se deriva solo en runtime: cada cuanto se
               busca objetivo y cuanto trabajo cabe por frame. Ver el planificador
               compartido mas abajo. */
            {
                name: "faceNearbyCharacters",
                type: "boolean",
                default: true,
                title: "face nearby characters",
                description: "Encarar al character mas cercano cuando entra en el radio de encare. " +
                    "Apagado, el personaje siempre mira hacia donde se mueve."
            },
            {
                name: "facingRadius",
                type: "number",
                default: 0,
                min: 0,
                title: "facing radius (0 = auto)",
                description: "Radio de encare en metros. En 0 se DERIVA solo: del rango de ataque " +
                    "de characterIA si la entidad lo lleva, y si no de la altura del personaje."
            }
        ]
    });


/* VIDA. Deliberadamente NO es un atributo del editor. Es un valor de GAMEPLAY,
   no de montaje de escena: por atributo obligaba a tocarlo personaje por
   personaje en el inspector, y ademas invitaba a que cada instancia guardara un
   numero distinto sin que nada lo justificara.
   El estado real vive donde siempre: entity.health = { max, current, alive }.
   Para configurarlo hay un unico camino soportado, setMaxHealth(), que ademas
   maneja bien el caso de cambiarlo con el personaje ya dañado.
   El valor de arranque es el MISMO que tenia el atributo por defecto, asi que
   quitar el atributo no cambia el balance de nada que ya estuviera montado. */
var CHARACTER_DEFAULT_MAX_HEALTH = 100;


/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *  C U L L I N G  —  lo hace la ENTIDAD, no este script
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *  Aca vivia "cullingOptions" (physicsCulling / physicsCullDelay) y, repartido
 *  por todo el archivo, un sistema propio de visibilidad que espiaba
 *  meshInstance.visibleThisFrame para congelar animacion, movimiento y fisica.
 *  Todo eso se elimino: el motor ya lo hace, mejor y gratis.
 *
 *  Apagar la ENTIDAD del personaje:
 *
 *      entity.enabled = false;
 *
 *  cascadea a TODOS los descendientes (GraphNode#enabled: "activate or
 *  deactivate all the enabled children"), y con eso, en un solo flag:
 *
 *    - los SCRIPTS dejan de correr           -> ni update, ni postUpdate, ni doMove
 *      (GameManager.updateCharactersMovement ya saltea !character.enabled)
 *    - la ANIMACION deja de evaluarse        -> AnimComponentSystem exige
 *      component.enabled && component.entity.enabled && component.playing
 *    - el RENDER deja de dibujar             -> incluidos TODOS los hijos _LODn
 *      que genera el Auto LOD
 *    - el RIGIDBODY sale de la simulacion    -> RigidBodyComponent.onDisable()
 *      llama a disableSimulation()
 *    - las COLLISIONS/TRIGGERS salen tambien -> incluidos los 9 hitpoints de hueso
 *
 *  Es estrictamente mas de lo que apagaba el sistema anterior, con cero codigo
 *  y sin la fragilidad de espiar una meshInstance que puede ser destruida o
 *  reemplazada (que es justo lo que pasaba al reestructurar en LODs).
 *
 *  QUIEN decide apagar es un sistema EXTERNO —spawner, gestor de zona, el futuro
 *  gestor de LOD/distancia—, no este script. Character solo reacciona: ver
 *  onEnable / onDisable.
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */


/* LOD de animación — constantes internas (ver _updateAnimLod) */
var ANIM_LOD_MIN_HZ = 1;                                 // suelo de lodRateHz (evita 1/0)
var ANIM_LOD_PHASE_STEP = 0.6180339887498949;            // razón áurea: reparto de fases
var ANIM_LOD_FIRE_TOLERANCE = 0.95;                      // margen del umbral (mata el escalón en dt≈intervalo)


/* HITPOINTS por hueso: cada hueso de la seccion bones recibe una collision
   (trigger, sin rigidbody: detecta pero no empuja ni pesa) dimensionada
   automaticamente a partir del MISMO characterHeight que ya dimensiona la
   capsula y la masa. Base para daño localizado (headshots, etc.).
   Ver _setupHitpoints. Visualizacion: AmmoDebugDrawer del gameManager
   (hitpoints en amarillo, capsulas de personaje en rojo).

   COSTE, que es lo que motiva los tres modos: una collision SIN rigidbody es un
   trigger (ghost object de Bullet), y el sistema de fisica le hace
   updateTransform() a CADA trigger en CADA frame — leer el transform mundial
   del hueso (que fuerza el sync de todo el esqueleto), escribirlo en Ammo y
   actualizar su AABB en el broadphase, mas el cache de pares que cada ghost
   mantiene por su cuenta. Son 9 por personaje: con 30 en pantalla, 270 ghosts
   moviendose todo el tiempo. Y solo hacen falta cuando alguien esta lo bastante
   cerca como para pegarte.

   MODOS:
     none   : no se crean. El arma golpea la capsula y el daño es global (sin
              parte del cuerpo). Coste cero.
     always : se crean y quedan siempre activos (comportamiento historico).
     smart  : se crean pero solo se ACTIVAN en modo batalla. "Modo batalla" es
              exactamente el ENCARE ya existente (attackSystem.faceNearbyCharacters):
              el personaje tiene el encare BLOQUEADO sobre otro character, o sea
              que hay alguien dentro del radio de encare. Se reutiliza esa señal
              y no se inventa otra: ya tiene histeresis (se entra en R y se sale
              en R*1.25), ya la calcula el planificador con presupuesto, y es
              justo la condicion "hay alguien a distancia de golpearme".
              Fuera de combate el personaje no le cuesta nada a la fisica. */
Character.attributes.add("hitpointsoptions",
    {
        title: "hitpointsoptions",
        type: "json",
        schema: [
            {
                name: "mode",
                title: "mode",
                type: "string",
                enum: [
                    { "none": "none" },
                    { "always": "always" },
                    { "smart": "smart" }
                ],
                default: "smart",
                description: "none = no crear colliders (daño global contra la capsula). " +
                    "always = colliders siempre activos. " +
                    "smart = colliders activos SOLO en modo batalla (encare bloqueado sobre " +
                    "otro character o atacando); fuera de combate se apagan y no cuestan fisica. " +
                    "smart necesita attackSystem.faceNearbyCharacters encendido: sin esa señal " +
                    "se comporta como always."
            },
            {
                name: "smartHold",
                title: "smart hold (s)",
                type: "number",
                default: 0.5,
                min: 0,
                max: 5,
                precision: 2,
                description: "Solo en modo smart: segundos que los colliders siguen activos tras salir " +
                    "de combate. Evita que un golpe que ya venia en camino atraviese al enemigo porque " +
                    "sus hitboxes se apagaron a mitad del swing, y evita encender/apagar en rafaga."
            }
        ]
    });

/* Modo de hitpoints resuelto a numero (comparar numeros por frame es mas barato
   que comparar textos, y no genera basura para el GC). */
const CharacterHitpointModeEnum = Object.freeze({
    NONE: 0,
    ALWAYS: 1,
    SMART: 2
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

/* SENTIDO DE MARCHA (parametro "moveDir" del grafo). Solo se usa con el encare
   BLOQUEADO sobre otro character: ahi la direccion de movimiento y la direccion
   de mirada se desacoplan, y hay que elegir el clip que corresponde. Sin lock el
   personaje gira hacia donde anda, asi que siempre es FORWARD.
   Los VALORES son el contrato con el grafo (condiciones moveDir == n) y con los
   nombres de estado: cambiar uno obliga a cambiar el otro. */
const CharacterMoveDirEnum = Object.freeze({
    FORWARD: 0,
    BACKWARD: 1,
    LEFT: 2,
    RIGHT: 3
});

/* Sufijo de estado de cada sentido, INDEXADO por el valor del enum de arriba.
   FORWARD no lleva sufijo (los estados historicos son "walking"/"running"). */
const CharacterMoveDirSuffix = ["", "_backward", "_left", "_right"];

/* solo para traza (tracerOptions.tracefacing) */
const CharacterMoveDirNames = ["forward", "backward", "left", "right"];

/* Margen que el sentido aspirante debe sacarle al vigente para destronarlo.
   0.2 sobre proyecciones normalizadas = ~11 grados de banda muerta a cada lado
   de las diagonales, que es donde dos componentes se igualan y el parpadeo
   walking <-> walking_left seria continuo. */
var MOVEDIR_HYSTERESIS = 0.2;

Character.animation_states = [
    "death1",
    "death2",
    "walking",
    "walking_backward",
    "walking_left",
    "walking_right",
    "walking_turn_180",
    "running",
    "running_backward",
    "running_left",
    "running_right",
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



/* =========================================================================
   PLANIFICADOR DE ENCARE (compartido por TODOS los characters)
   =========================================================================
   Elegir "quien es el character mas cercano" es O(N) (recorrer la lista de
   characters). Si cada personaje en pantalla lo hiciera cada frame seria
   O(N^2) por frame. Este planificador reparte esos recorridos SIN que haya
   nada que configurar:

   1. QUIEN compite: solo los VISIBLES con el encare activo. Los NPCs fuera de
      camara ni llegan a inscribirse (doMove ya hace early-return antes).

   2. CUANDO escanea cada uno: lo dice la GEOMETRIA, no un reloj. Tras cada
      escaneo el personaje calcula cuanto tiempo su respuesta es DEMOSTRABLE-
      MENTE valida = margen hasta la frontera de decision / velocidad de
      cierre pesimista. El que no tiene a nadie cerca casi no gasta; el que
      esta en el instante decisivo escanea cada frame. Al ser tiempo/velocidad,
      la latencia en SEGUNDOS DE JUEGO no depende de los fps: a 10 fps el mismo
      personaje escanea cada 10 frames en vez de cada 65, y tarda lo mismo.
      El "segundo" es el de SIMULACION (dt acumulado, ver hook), que es el
      mismo en el que estan las velocidades del calculo. Si el motor clampea dt
      —lo hace: app.maxDeltaTime— el mundo entra en camara lenta y los deadlines
      entran con el, que es justo lo que los mantiene validos.

   3. CUANTO cabe por frame: se MIDE (EWMA del coste real, igual que hace
      GameManager con _avgMsPerChar) contra un presupuesto derivado del frame,
      y un umbral de urgencia por realimentacion raciona cuando muchos
      coinciden. Si los escaneos son tan baratos que ni se miden, el racionado
      se desactiva solo: no estorba cuando no hace falta.

   4. SI BAJAN LOS FPS hay DOS topes, porque el presupuesto por si solo se
      comporta al reves de lo que uno querria:
        - el frame usado para presupuestar se CLAMPEA (FACING_BUDGET_MAX_DT).
          Un frame el doble de largo admite el doble de trabajo — eso es
          correcto y mantiene constante la latencia en segundos — pero un
          PICO (GC, carga de assets) no debe autorizar diez veces mas trabajo
          justo en el frame que ya iba mal. Por debajo de 20 fps el
          presupuesto se congela en 1 ms.
        - el trabajo total (escaneos x characters) se acota a FACING_MAX_WORK.
          Es el unico tope que sigue valiendo cuando el reloj no tiene
          resolucion para medir un escaneo, que es el caso normal; sin el, la
          unica cota era "N escaneos de coste N" = O(N^2) en un solo frame.
      Ninguno de los dos hace nada en una escena chica: ahi manda el limite
      por numero de candidatos.

   5. El "frame" de este planificador es el de RENDER (app.on("update")), NO el
      barrido de doMove: GameManager puede mover a los personajes desde tres
      relojes distintos (update / internalTimer / requestAnimationFrame), en
      lotes parciales y en orden variable. Si el barrido corre dos veces en un
      frame, el segundo encuentra el presupuesto agotado; si no corre, no se
      consume nada. El sistema es independiente de como GameManager llame.
      Nota de orden: GameManager registra SU app.on("update") antes (esta en la
      entidad ROOT, inicializa primero), asi que el barrido de doMove de un
      frame consume el presupuesto que dejo el hook del frame ANTERIOR, y
      _scanDemand que lee el hook es la demanda de ese mismo barrido. El lazo
      cierra bien; lo unico desplazado un frame es _nowSec, y como TODOS los
      deadlines se comparan contra el mismo reloj, las comparaciones no cambian.

   6. Sin inanicion: el turno se gana por RETRASO respecto al deadline propio,
      no por orden de llegada. Que el player corra siempre primero no le da
      ninguna ventaja. Quien no reciba doMove un frame simplemente envejece y
      entra antes en el reparto siguiente. En saturacion sostenida el liston de
      urgencia sube hasta su techo (FACING_MAX_DEADLINE) y la peor latencia de
      re-eleccion de objetivo es deadline + techo = ~4 s; el SEGUIMIENTO del
      objetivo ya elegido no se raciona nunca y sigue siendo cada frame, que es
      lo que se ve.
   ========================================================================= */
Character._frame = 0;
Character._candidates = [];        // aspirantes vivos (registro persistente)
Character._scansLeft = 1;          // presupuesto de escaneos del frame en curso
Character._scanDemand = 0;         // escaneos PEDIDOS este frame (entrada del lazo)
Character._urgencyCutoff = 0;      // s de retraso exigidos cuando hay que racionar
Character._avgScanMs = 0.01;       // coste medio MEDIDO de un escaneo
Character._scanSamples = 0;        // contador de muestreo de performance.now()
Character._nowSec = 0;             // reloj de SIMULACION acumulado (ver hook)
Character._fallbackList = null;    // lista de characters sin GameManager
Character._fallbackFrame = -1e9;

/* LOD DE ANIMACION — estado compartido.
   _animPhaseSeq reparte la FASE de cada personaje (ver _updateAnimLod).
   Los contadores son solo diagnostico (tracerOptions.traceanimlod): dicen
   cuantos characters evaluaron animacion en el frame anterior sobre el total,
   que es la forma directa de comprobar que el LOD esta haciendo su trabajo. */
Character._animPhaseSeq = 0;
Character._animLodRan = 0;         // animaron en el frame en curso
Character._animLodTotal = 0;       // candidatos a animar (habilitados, con anim)

var FACING_STALE_FRAMES = 6;       // frames sin pasar por doMove -> fuera del registro
var FACING_MIN_SCAN_MS = 0.001;    // suelo del coste medido (evita divisiones absurdas)
var FACING_BUDGET_RATIO = 0.02;    // parte del frame que puede ir a escaneos
var FACING_MAX_DEADLINE = 2;       // s: tope de validez (cubre spawns y teleports)
var FACING_SAMPLE_EVERY = 16;      // 1 de cada N escaneos se cronometra
var FACING_HYSTERESIS = 1.25;      // se sale del lock a radio * este factor
var FACING_BUDGET_MAX_DT = 0.05;   // s: frame mas largo que se acepta para presupuestar
var FACING_MAX_WORK = 20000;       // iteraciones por frame (escaneos x characters)

/* un unico listener por app: reparte el presupuesto del frame de render */
Character._installFrameHook = function (app) {
    if (app.__characterFrameHook) return;
    app.__characterFrameHook = true;

    app.on("update", function (dt) {
        Character._frame++;

        /* LOD DE ANIMACION (diagnostico): los contadores los llenan los
           characters en la fase "update" (_updateAnimLod) y los lee el Trace en
           postUpdate, ambas ANTES que este hook — app.on("update") va despues de
           systems.fire de update / animationUpdate / postUpdate. Aqui solo se
           reinician para el frame siguiente.
           (Habia ademas un juego de variables ..._Last que copiaba estos
           valores "por si alguien los inspecciona desde consola": no las leia
           NADIE, asi que eran asignaciones por frame a cambio de nada.) */
        Character._animLodRan = 0;
        Character._animLodTotal = 0;

        /* RELOJ DE SIMULACION, no de pared. Se acumula el MISMO dt que integra
           el movimiento, por tres razones:

           - Los deadlines se derivan de margen/velocidad, y esas velocidades son
             m/s de tiempo de JUEGO. Medir contra performance.now() mezcla dos
             relojes y solo funciona mientras ambos coinciden.
           - El motor clampea dt a app.maxDeltaTime (0.2 s en gameManager). Con
             el juego a 1 frame cada 5 s el mundo avanza 0.2 s mientras el reloj
             de pared avanza 5 s: TODOS quedarian permanentemente 25x atrasados
             respecto a un deadline que en tiempo de juego ni siquiera vencio, y
             el liston de urgencia (que sube de a dt) jamas podria alcanzarlos,
             asi que el racionado justo se apagaria y solo quedaria la cuota.
           - Con el juego en pausa (timeScale 0) dt es 0 y nada caduca, en vez de
             caducar todo y provocar una tormenta de escaneos al reanudar.

           Sigue siendo UN solo instante por frame para todos, que es lo que hace
           determinista el reparto dentro del frame. performance.now() se sigue
           usando donde corresponde: para MEDIR el coste real de un escaneo. */
        Character._nowSec += dt;

        /* PURGA: el que lleva varios frames sin pasar por doMove (invisible,
           deshabilitado, o al que GameManager no llego con su presupuesto) sale
           del registro y se re-inscribe solo en cuanto vuelva a correr. Sin
           esto, un candidato que ya no corre falsearia el reparto. */
        const list = Character._candidates;
        for (var i = list.length - 1; i >= 0; i--) {
            const s = list[i];
            if (!s || !s.entity || !s.entity.enabled ||
                (Character._frame - s._eligibleFrame) > FACING_STALE_FRAMES) {
                if (s) s._inCandidates = false;
                list[i] = list[list.length - 1];
                list.pop();
            }
        }

        /* PRESUPUESTO: fraccion del frame / coste medido. A 60 fps son ~0.33 ms;
           a 30 fps, ~0.67 ms (el frame lento dura mas, luego cabe mas trabajo
           manteniendo la misma latencia en SEGUNDOS, que es lo que se percibe).

           El frame usado se CLAMPEA a FACING_BUDGET_MAX_DT. Sin ese tope el
           presupuesto es realimentacion POSITIVA: frames lentos -> mas escaneos
           -> frames mas lentos. Justo en el pico (un GC, una carga de assets)
           es cuando mas trabajo se autorizaba. Con el tope, por debajo de 20 fps
           el presupuesto deja de crecer y se queda en 1 ms. */
        const budgetDt = dt > FACING_BUDGET_MAX_DT ? FACING_BUDGET_MAX_DT : dt;
        var quota = Math.floor((budgetDt * 1000 * FACING_BUDGET_RATIO) /
            Math.max(Character._avgScanMs, FACING_MIN_SCAN_MS));
        if (quota < 1) quota = 1;
        if (quota > list.length && list.length > 0) quota = list.length;

        /* TECHO DE TRABAJO: un escaneo recorre la lista ENTERA de characters, o
           sea que el coste del frame es (escaneos x characters) — cuadratico.
           Cuando el escaneo dura menos que la resolucion de performance.now()
           (lo normal: ~1 us), el coste medido cae al suelo, la cuota se dispara
           y la unica cota que queda es el numero de candidatos: N escaneos x N
           characters. A 300 characters eso es asumible; a 1000 son 1e6
           iteraciones en un frame. Este techo lo acota explicitamente y escala
           solo: a mas personajes, menos escaneos por frame, mismo trabajo total.
           En escenas chicas el limite por candidatos manda y esto no hace nada. */
        const sceneCount = (typeof GameManager !== "undefined" && GameManager.sceneCharacters)
            ? GameManager.sceneCharacters.length
            : list.length;
        var workCap = Math.floor(FACING_MAX_WORK / Math.max(sceneCount, 1));
        if (workCap < 1) workCap = 1;
        if (quota > workCap) quota = workCap;

        /* LAZO CERRADO: si el frame anterior se pidio mas de lo que cabia, sube
           el liston de urgencia (solo escanean los mas atrasados); si sobro, lo
           baja al doble de rapido. Se calibra solo en la maquina del jugador. */
        if (Character._scanDemand > quota) {
            Character._urgencyCutoff += dt;
            /* techo: un retraso mayor que la validez maxima ya significa que la
               respuesta esta segura obsoleta. Subir mas el liston solo serviria
               para bloquear a todo el mundo. */
            if (Character._urgencyCutoff > FACING_MAX_DEADLINE) {
                Character._urgencyCutoff = FACING_MAX_DEADLINE;
            }
        } else if (Character._urgencyCutoff > 0) {
            Character._urgencyCutoff -= dt * 2;
            if (Character._urgencyCutoff < 0) Character._urgencyCutoff = 0;
        }

        Character._scansLeft = quota;
        Character._scanDemand = 0;
    });
};


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
    /* ENCARE: campos NUEVOS dentro de un grupo VIEJO. Si la escena guardó
       attackSystem antes de que existieran, el grupo llega no-null y el || de
       arriba NO dispara, pero los campos vienen undefined. Sin este default
       explícito el encare quedaría apagado en todos los characters ya colocados
       hasta re-parsear el script en el editor. */
    if (this.attackSystem.faceNearbyCharacters === undefined) {
        this.attackSystem.faceNearbyCharacters = true;
    }
    if (this.attackSystem.facingRadius === undefined) {
        this.attackSystem.facingRadius = 0;
    }
    /* (health ya no es atributo: ver CHARACTER_DEFAULT_MAX_HEALTH y setMaxHealth) */
    /* (cullingOptions ya no existe: el culling lo hace entity.enabled — ver la
       cabecera del archivo. Una escena vieja puede seguir trayendo el grupo
       guardado; se ignora sin más.) */
    /* HITPOINTS: el grupo paso de un boolean `enabled` a un enum `mode` de tres
       valores. Una escena guardada antes del cambio trae `enabled` y NO trae
       `mode`, asi que se MIGRA aqui en vez de dejar el personaje sin hitboxes:
         enabled: false -> "none"    (no queria hitpoints: se respeta)
         enabled: true  -> "smart"   (los queria: los sigue teniendo, y ademas
                                      solo encendidos cuando hacen falta)
       El daño localizado sigue funcionando igual en smart: las hitboxes estan
       activas siempre que haya alguien lo bastante cerca como para golpearte.
       Quien quiera el comportamiento historico exacto pone "always" a mano.
       Migra EN SILENCIO: no cambia nada observable del juego, asi que no vale
       una linea de consola por sesion. Para ver el desplegable (none / always /
       smart) hay que re-parsear el script en el editor. */
    this.hitpointsoptions = this.hitpointsoptions || {};
    if (this.hitpointsoptions.mode === undefined) {
        this.hitpointsoptions.mode = (this.hitpointsoptions.enabled === false) ? "none" : "smart";
    }
    if (!(this.hitpointsoptions.smartHold >= 0)) this.hitpointsoptions.smartHold = 0.5;
    /* LOD DE ANIMACIÓN: campos NUEVOS dentro de playerAnimationsOptions (antes
       vivían en un grupo aparte, animationLod). El grupo llega no-null porque
       `global` ya existía, así que el || de arriba NO dispara y los campos del
       LOD vienen undefined. Sin estos defaults explícitos, lodRateHz llegaría
       undefined -> el intervalo saldría NaN -> la comparación de la deuda daría
       siempre false -> animación CONGELADA en todos los characters ya colocados
       hasta re-parsear el script en el editor.

       MIGRACIÓN del grupo viejo: si la escena todavía entrega animationLod
       (script sin re-parsear), sus valores mandan, así lo que el usuario ya
       había configurado no se pierde en silencio. Migra sin avisar por consola:
       el resultado es idéntico a lo que ya estaba configurado. Para que el
       grupo viejo desaparezca del inspector hay que re-parsear el script. */
    var oldLod = this.animationLod;
    if (oldLod && typeof oldLod === "object") {
        if (this.playerAnimationsOptions.lodEnabled === undefined && oldLod.enabled !== undefined) {
            this.playerAnimationsOptions.lodEnabled = oldLod.enabled;
        }
        if (this.playerAnimationsOptions.lodRateHz === undefined && oldLod.rateHz > 0) {
            this.playerAnimationsOptions.lodRateHz = oldLod.rateHz;
        }
        if (this.playerAnimationsOptions.lodPlayerFullRate === undefined &&
            oldLod.playerFullRate !== undefined) {
            this.playerAnimationsOptions.lodPlayerFullRate = oldLod.playerFullRate;
        }
    }

    if (this.playerAnimationsOptions.lodEnabled === undefined) {
        this.playerAnimationsOptions.lodEnabled = true;
    }
    if (!(this.playerAnimationsOptions.lodRateHz > 0)) {
        this.playerAnimationsOptions.lodRateHz = 30;
    }
    if (this.playerAnimationsOptions.lodPlayerFullRate === undefined) {
        this.playerAnimationsOptions.lodPlayerFullRate = true;
    }

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




    /* (aquí se creaba "point-character-entity": una entidad por personaje colgada
       de scene.root a la que doMove le hacía setPosition CADA FRAME y que no
       leía absolutamente nadie — ni este script, ni gameManager, ni la UI.
       Eliminada: con 30 personajes eran 30 entidades de más en el grafo de
       escena y 30 escrituras de transform por frame a cambio de nada.) */

    this._doMoveBusy = false;


    this._curPosition = this.entity.getPosition();



    /* render + meshInstance para el culling por visibilidad. La misma resolución
       Se resuelve UNA vez: ya no hay ningún sistema que espíe meshInstances por
       frame, así que no hay nada que revalidar. Lo consumen
       _resolveTemplateEntity y la asignación de rootBone. */
    this._resolveRenderRefs();
    if (this.renderCharacterComponent) {
        this.renderCharacterComponent.entity.tags.add("uranus-instancing-exclude");
    }




    this._jumpAvailable = true;
    this._jumpKeyHeld = false;   /* flanco de subida de Espacio (input.jump es isPressed) */
    this._jumping = false;      /* en el aire por un salto propio (hasta aterrizar) */
    this._jumpRestTime = 0;     /* s con vy≈0 durante _jumping (aterrizaje sin contactos) */


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
    /* Si algo ya dejo un entity.health puesto (spawner, script de gameplay que
       corrio antes), se RESPETA: pisarlo aqui resucitaria a un personaje que ya
       venia herido o muerto. Si no, arranca con el maximo por defecto. */
    if (!this.entity.health) {
        this.entity.health = {
            max: CHARACTER_DEFAULT_MAX_HEALTH,
            current: CHARACTER_DEFAULT_MAX_HEALTH,
            alive: true
        };
    }
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
        /* NOTA: "sides" y "heightSegments" NO son opciones del componente
           collision (son de las primitivas de MALLA). El engine las ignoraba y
           avisaba por consola: "addComponent: ignoring unknown option 'sides'
           passed to the 'collision' component". La forma física de una cápsula
           de Bullet es analítica —no tiene tesela— así que quitarlas no cambia
           absolutamente nada de la colisión. Propiedades válidas: type, radius,
           height, axis, halfExtents, linearOffset, angularOffset, asset,
           renderAsset, model, convexHull, checkVertexDuplicates. */
        this.entity.addComponent("collision", {
            type: "capsule",
            radius: this.characterRadius,
            height: this.characterHeight
        });
    }
    /* SIEMPRE registrar los eventos (aunque la collision venga creada desde el editor):
       la detección de suelo por contactos depende de ellos. "contact" se dispara
       en CADA paso de física mientras haya contacto (no solo al empezar). */
    this.entity.collision.on("contact", this.characterContact, this);
    this.entity.collision.on("collisionstart", this.characterCollisionStart, this);
    this.entity.collision.on("collisionend", this.characterCollisionEnd, this);
    this.entity.other = null;

    /* IS ON AIR  &  IS ON GROUND */
    this.entity.isonair = false;
    this.entity.isonground = true;







    /* SUELO POR CONTACTOS (sin raycasts): el evento "contact" re-marca
       _groundContactSeen en cada paso de física con apoyo, así el estado de
       suelo se re-evalúa por frame. El viejo conteo por collisionstart/end
       clasificaba el par UNA sola vez al empezar a tocarse: si el primer roce
       con el mesh del nivel era lateral (pared/escalón), ese mesh no contaba
       como suelo mientras durase el contacto y el salto quedaba muerto. */
    this._groundContactSeen = false; // hubo contacto de base en el último paso de física
    this._coyoteTime = 0;            // gracia anti-parpadeo de manifolds de Bullet

    /* contacto de PARED más reciente (lo consume CharacterIA): dirección
       horizontal de escape + timestamp en ms */
    this.entity.wallAway = new pc.Vec3();
    this.entity.wallTimeMs = -1e9;

    /* Tope del casquete inferior de la cápsula, relativo al origen de la entidad:
       solo contactos por debajo de esta cota cuentan como suelo. Se leen las
       dimensiones reales del componente collision (puede venir del editor con
       valores distintos a characterHeight/Radius) y su linearOffset (el editor
       puede desplazar la shape respecto al origen; sin esto, una cápsula con la
       base en el origen dejaba TODOS los contactos de suelo fuera de la cota).
       +0.02 de tolerancia por el margen de contactos de Bullet. Precalculado:
       cero coste por contacto. */
    var col = this.entity.collision;
    var colHeight = (col && col.type === "capsule") ? col.height : this.characterHeight;
    var colRadius = (col && col.type === "capsule") ? col.radius : this.characterRadius;
    var colOffY = (col && col.linearOffset) ? (col.linearOffset.y || 0) : 0;
    /* getWorldScale() no existe en engine 2.x: derivar de la matriz mundial,
       con fallback a la escala local */
    var scaleY = 1;
    if (this.entity.getWorldTransform) {
        var wt = this.entity.getWorldTransform();
        if (wt && wt.getScale) scaleY = Math.abs(wt.getScale().y) || 1;
    } else if (this.entity.getLocalScale) {
        scaleY = Math.abs(this.entity.getLocalScale().y) || 1;
    }
    this._capsuleBaseOffset = (colOffY - (colHeight * 0.5) + colRadius) * scaleY + 0.02;

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

    /* modo resuelto a número una sola vez (ver CharacterHitpointModeEnum) */
    var hpMode = this.hitpointsoptions.mode;
    this._hitpointMode = (hpMode === "none") ? CharacterHitpointModeEnum.NONE
        : (hpMode === "always") ? CharacterHitpointModeEnum.ALWAYS
            : CharacterHitpointModeEnum.SMART;

    /* SMART sin la señal de encare no tiene con qué decidir: degradar a ALWAYS
       en vez de dejar al personaje sin hitboxes para siempre (perder daño
       localizado en silencio es mucho peor que perder la optimización). */
    if (this._hitpointMode === CharacterHitpointModeEnum.SMART &&
        !this.attackSystem.faceNearbyCharacters) {
        this._hitpointMode = CharacterHitpointModeEnum.ALWAYS;
        if (!Character.__hitpointSmartWarned) {
            Character.__hitpointSmartWarned = true;
            console.warn('[character] hitpointsoptions.mode = "smart" necesita ' +
                'attackSystem.faceNearbyCharacters encendido (es la señal de "modo batalla"). ' +
                'Sin él se comporta como "always".');
        }
    }

    /* estado de la política (ver _applyHitpointPolicy). Se declara ANTES del
       setup: éste crea las collisions habilitadas y la política decide acto
       seguido si corresponde apagarlas. */
    this._hitpointsActive = false;   // último estado ESCRITO en los componentes
    this._hitpointHold = 0;          // s de gracia restantes al salir de combate

    if (this._hitpointMode !== CharacterHitpointModeEnum.NONE) {
        this._setupHitpoints();
        /* addComponent("collision") las crea HABILITADAS: registrar ese estado
           real y dejar que la política lo corrija (en smart, apagarlas ya). */
        this._hitpointsActive = true;
        this._applyHitpointPolicy(0);
    }

    /* CARRILES por modo de arma: _modeLanes[m][dir] = ese modo tiene al menos un
       clip (walking o running) para ese sentido de marcha. Se declara AQUI, antes
       de prepareAnimComponent, porque es esa quien lo rellena mientras arma el
       grafo (unica fuente de verdad: si no hay clip, no hay transicion, y el
       runtime no debe emitir ese moveDir). El default deja vivo solo FORWARD. */
    this._modeLanes = [];
    for (var ml = 0; ml < Character.animation_modes.length; ml++) {
        this._modeLanes.push([true, false, false, false]);
    }

    this.prepareAnimComponent();

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     *  L O D   D E   A N I M A C I Ó N  — estado por instancia.
     *  Va DESPUÉS de prepareAnimComponent porque necesita el anim component ya
     *  creado para leer su velocidad base. Ver _updateAnimLod.
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
    /* velocidad "de gameplay" del personaje (1 = normal). El LOD ESCRIBE
       anim.speed cada frame para compensar los frames salteados, así que este
       es el valor sobre el que compone; para cambiarlo desde fuera hay que usar
       setAnimBaseSpeed, no anim.speed (se perdería al frame siguiente). */
    this._animBaseSpeed = (this.entity.anim && this.entity.anim.speed) || 1;
    this._animDtApplied = 0;                 // dt EFECTIVO de animación del frame en curso
    this._animSpeedApplied = this._animBaseSpeed;

    /* FASE. Si todos los characters saltearan LOS MISMOS frames, un frame haría
       el trabajo de animación de los 30 y el siguiente ninguno: un serrucho de
       frame time PEOR que no tener LOD (el pico manda, no la media). La deuda
       inicial se siembra con una secuencia de baja discrepancia (razón áurea),
       que reparte los instantes de actualización de forma uniforme para
       CUALQUIER número de personajes, sin coordinación entre ellos y sin tener
       que saber cuántos hay. Es O(1) y no necesita mantenimiento al spawnear
       o destruir. */
    Character._animPhaseSeq = (Character._animPhaseSeq + ANIM_LOD_PHASE_STEP) % 1;
    this._animDebt = Character._animPhaseSeq /
        Math.max(ANIM_LOD_MIN_HZ, this.playerAnimationsOptions.lodRateHz);




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

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     *  ENCARE (facing lock) — estado por instancia. Ver el planificador
     *  compartido al principio del archivo.
     * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
    Character._installFrameHook(this.app);

    /* identidad estable del character. El getter `guid` lo CREA si la entidad se
       instancio por codigo (get guid() { if (!this._guid) this.guid = guid.create(); }),
       igual que hacia el viejo getGuid(); leer entity._guid crudo puede dar null
       y dos nulls se compararian como iguales. Solo se usa para traza: la
       exclusion de si mismo en el escaneo se hace por referencia (mas barato y
       exacto).
       getGuid() quedo DEPRECADO en el engine 2.x ("Entity#getGuid is deprecated.
       Use Entity#guid instead") — el getter tiene exactamente la misma semantica
       de creacion perezosa, asi que el cambio es puramente de nombre. */
    this._charId = (this.entity.guid !== undefined) ? this.entity.guid : (this.entity._guid || null);

    this._inCandidates = false;
    this._eligibleFrame = -1e9;      // ultimo frame en que paso por doMove siendo visible
    this._nextScanAt = 0;            // s (performance.now()*0.001) del proximo escaneo util
    this._facingTarget = null;       // character mas cercano conocido
    this._facingTargetDistSq = Infinity;
    this._lockActive = false;        // encare bloqueado sobre el objetivo
    this._lockRadius = 0;            // 0 = sin resolver (se deriva en el 1er doMove)
    this._moveDir = CharacterMoveDirEnum.FORWARD;   // sentido de marcha (parametro moveDir)
    this._vMoveDirScore = [0, 0, 0, 0];             // scratch: puntuacion por sentido (sin GC)

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



/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *  E N C A R E  (facing lock)
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

/* Lista de characters de la escena. Devuelve el ARRAY COMPARTIDO por referencia:
   NO retenerlo ni mutarlo (GameManager lo reutiliza). Coste O(1) en el caso
   normal, porque la lista ya la mantiene GameManager; el findByTag es solo el
   fallback para escenas sin GameManager, y ademas va cacheado. */
Character.prototype.getCharacters = function () {
    const list = (typeof GameManager !== "undefined") ? GameManager.sceneCharacters : null;
    if (list && list.length) return list;

    if (!Character._fallbackList || (Character._frame - Character._fallbackFrame) > 30) {
        Character._fallbackList = this.app.root.findByTag("is-character");
        Character._fallbackFrame = Character._frame;
    }
    return Character._fallbackList;
};

/* Radio de encare. Con attackSystem.facingRadius = 0 (por defecto) se DERIVA de
   datos que ya existen: el rango de ataque de la IA si la entidad la lleva, y si
   no la altura del personaje. Con los defaults del proyecto ambos caminos
   aterrizan en ~3.4-3.6 m. Se resuelve tarde (1er doMove) porque el initialize
   de characterIA puede correr despues del nuestro. */
Character.prototype._resolveLockRadius = function () {
    const r = this.attackSystem.facingRadius || 0;
    if (r > 0) return r;

    const ia = (this.entity.script && this.entity.script.characterIA) || null;
    if (ia) {
        const range = ia._attackRange || (ia.ai && ia.ai.attackRange) || 0;
        if (range > 0) return range * 2;
    }

    return (this.characterHeight || 2) * 2;
};

/* ELEGIR objetivo: recorre getCharacters() y se queda con el mas cercano en
   plano XZ (d1), midiendo de paso la distancia al segundo (d2). Es el unico
   O(N) del sistema y por eso va racionado por el planificador.
   Excluye: a si mismo, deshabilitados, muertos y los que esten demasiado por
   encima o por debajo. Sin asignaciones.
   Con d1 y d2 se auto-programa el siguiente escaneo: la respuesta solo puede
   volverse falsa si alguien cruza el radio o si el segundo adelanta al primero,
   y ambas cosas necesitan recorrer una distancia conocida a una velocidad
   acotada. Eso da un deadline que es una COTA, no una estimacion. */
Character.prototype._updateNearestCharacter = function (nowSec) {
    const list = this.getCharacters();
    const pos = this._curPosition;
    const R = this._lockRadius;
    const maxDY = R * 2;

    let best = null, bestSq = Infinity, secondSq = Infinity;

    for (var i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e === this.entity || !e.enabled) continue;
        if (e.health && e.health.alive === false) continue;   // muertos fuera
        if (!e.getPosition) continue;

        const p = e.getPosition();
        const dy = p.y - pos.y;
        if (dy > maxDY || dy < -maxDY) continue;

        const dx = p.x - pos.x, dz = p.z - pos.z;
        const d2 = dx * dx + dz * dz;

        if (d2 < bestSq) {
            secondSq = bestSq;
            bestSq = d2;
            best = e;
        } else if (d2 < secondSq) {
            secondSq = d2;
        }
    }

    this._facingTarget = best;
    this._facingTargetDistSq = bestSq;

    /* MARGEN hasta la frontera de decision */
    let margin;
    if (!best) {
        margin = Infinity;                       // no hay nadie: solo un spawn invalidaria esto
    } else {
        const d1 = Math.sqrt(bestSq);
        margin = Math.abs(d1 - R);               // cruzar el radio
        if (secondSq < Infinity) {
            const gap = (Math.sqrt(secondSq) - d1) * 0.5;   // ser adelantado
            if (gap < margin) margin = gap;
        }
    }

    /* VELOCIDAD DE CIERRE pesimista: los dos moviendose uno hacia el otro.
       speed*2 es el techo de doMove (defaultrun/sprint duplican), pero si algo
       mueve la capsula por fuera (root motion en teleport, empujones de fisica)
       la velocidad REAL manda: asi la cota no se queda corta. */
    let vSelf = this.speed * 2;
    const rb = this.entity.rigidbody;
    if (rb) {
        const v = rb.linearVelocity;
        const vReal = Math.sqrt(v.x * v.x + v.z * v.z);
        if (vReal > vSelf) vSelf = vReal;
    }
    const vClose = vSelf * 2;

    let valid = (margin === Infinity || vClose <= 0.0001)
        ? FACING_MAX_DEADLINE
        : (margin / vClose);
    if (valid > FACING_MAX_DEADLINE) valid = FACING_MAX_DEADLINE;
    if (valid < 0) valid = 0;

    this._nextScanAt = nowSec + valid;
};

/* SEGUIR al objetivo ya elegido: O(1) y CADA frame, para que salir del radio se
   note al instante aunque el proximo escaneo tarde. Histeresis: se entra al
   lock en el radio y se sale a radio*FACING_HYSTERESIS, para que un objetivo
   oscilando en el borde no produzca giros de 180 grados en bucle. */
Character.prototype._updateFacingLock = function () {
    const t = this._facingTarget;
    if (!t || !t.enabled || (t.health && t.health.alive === false)) {
        this._facingTarget = null;
        this._facingTargetDistSq = Infinity;
        this._lockActive = false;
        return;
    }

    const p = t.getPosition();
    const dx = p.x - this._curPosition.x;
    const dz = p.z - this._curPosition.z;
    const d2 = dx * dx + dz * dz;
    this._facingTargetDistSq = d2;

    const R = this._lockRadius;
    if (this._lockActive) {
        const exit = R * FACING_HYSTERESIS;
        if (d2 > exit * exit) this._lockActive = false;
    } else if (d2 <= R * R) {
        this._lockActive = true;
    }
};


Character.prototype.doMove = function () {
    if (!this.entity || !this.entity.rigidbody) {
        return;
    }

    if (this._doMoveBusy) return;
    this._doMoveBusy = true;

    const rb = this.entity.rigidbody;

    const input = this.entity.input || {};
    const dt = Number(input.dt || 0);
    const useFlight = !!this.canmoveonair;

    this._curPosition.copy(this.entity.getPosition());

    /* si initialize arrancó sin meshes (placeholder), adoptar la mesh real en
    /* (aquí estaba el CULLING por visibilidad: un early-return que espiaba
       meshInstance.visibleThisFrame para no mover ni simular al NPC fuera de
       cámara, más el apagado diferido de rigidbody/collision.
       Ya no hace falta: si el personaje tiene que dejar de simular, se apaga su
       ENTIDAD y el motor lo apaga entero — este doMove no llega a ejecutarse
       siquiera, porque GameManager.updateCharactersMovement saltea las entidades
       deshabilitadas. Ver la cabecera del archivo.) */

    this._updateGroundedState();

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

                camForward.mulScalar(input.z);
                camRight.mulScalar(input.x);
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

                camForward.mulScalar(input.z);
                camRight.mulScalar(input.x);
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
        const desiredVelocity = this._vDesired.copy(direction).mulScalar(this._charSpeed);

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
            const force = accel.mulScalar(rb.mass * 8);
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
        if (this._coyoteTime > 0 && !this._jumping) {
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
        /* GATE del salto: entity.isonground (calculado este mismo frame en
           _updateGroundedState) = contactos frescos + coyote + fallback por
           velocidad — el MISMO criterio que la versión original con raycasts.
           Gatear el salto SOLO por contactos lo dejaba muerto cuando el manifold
           no llegaba a clasificar la base (shape con offset, mesh tocado de
           lado...), aunque el personaje caminara con normalidad. */
        const groundedForJump = this.entity.isonground && !this._jumping;

        /* re-armar el salto al volver a tener suelo */
        if (groundedForJump) {
            this._jumpAvailable = true;
        }

        /* diagnóstico: una línea por PULSACIÓN de Espacio, pase o no el gate */
        if (this.sensorOptions.sensorJumpDebug && jumpPressed && !this._jumpKeyHeld) {
            console.log("[character] SPACE  isonground =", this.entity.isonground,
                "| coyote =", this._coyoteTime.toFixed(3),
                "| _jumping =", this._jumping,
                "| vy =", rb.linearVelocity.y.toFixed(2));
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
            this._jumpRestTime = 0;

            if (this.sensorOptions.sensorJumpDebug) {
                console.log("[character] JUMP  vy =", vy.toFixed(2), "m/s | apex =", this._jumpApexHeight.toFixed(2), "m");
            }
        }

        this._jumpKeyHeld = jumpPressed;
    } else {
        this._jumpKeyHeld = !!input.jump;
    }

    /* * * * * * * * * * * * * */
    /* E N C A R E  (facing)   */
    /* * * * * * * * * * * * * */
    /* Solo compiten en el planificador de encare los personajes que estan
       CORRIENDO. No hace falta ningun test de visibilidad: si la entidad esta
       apagada, doMove ni se llama (updateCharactersMovement saltea las
       deshabilitadas) y ademas onDisable ya limpio el lock. */
    if (this.attackSystem.faceNearbyCharacters) {
        if (this._lockRadius <= 0) this._lockRadius = this._resolveLockRadius();

        this._eligibleFrame = Character._frame;
        if (!this._inCandidates) {
            Character._candidates.push(this);
            this._inCandidates = true;
        }

        /* ELEGIR objetivo: lo pide el deadline propio (geometria); el
           presupuesto compartido solo raciona cuando muchos coinciden. */
        const nowSec = Character._nowSec;
        const overdue = nowSec - this._nextScanAt;
        if (overdue >= 0) {
            Character._scanDemand++;
            if (Character._scansLeft > 0 && overdue >= Character._urgencyCutoff) {
                Character._scansLeft--;

                /* el coste se mide por MUESTREO: performance.now() cuesta mas
                   que el propio escaneo, cronometrarlos todos falsearia la
                   medida y pagaria mas de lo que ahorra */
                if ((Character._scanSamples++ % FACING_SAMPLE_EVERY) === 0) {
                    const t0 = performance.now();
                    this._updateNearestCharacter(nowSec);
                    Character._avgScanMs = Character._avgScanMs * 0.88 +
                        (performance.now() - t0) * 0.12;
                } else {
                    this._updateNearestCharacter(nowSec);
                }
            }
        }

        /* SEGUIR al objetivo: siempre, cada frame, O(1) */
        this._updateFacingLock();

        if (this.tracerOptions.tracefacing && (this.entity.isPlayer || this.entity.selected)) {
            Trace("facing", {
                id: this._charId,
                target: this._facingTarget ? this._facingTarget.name : "",
                dist: this._facingTarget ? Math.sqrt(this._facingTargetDistSq).toFixed(2) : "",
                radius: this._lockRadius.toFixed(2),
                lock: this._lockActive,
                moveDir: CharacterMoveDirNames[this._moveDir],
                nextScanIn: (this._nextScanAt - nowSec).toFixed(3),
                candidates: Character._candidates.length,
                scansLeft: Character._scansLeft,
                cutoff: Character._urgencyCutoff.toFixed(3),
                avgScanMs: Character._avgScanMs.toFixed(4)
            });
        }
    } else {
        this._lockActive = false;
    }

    let hasFaceDir = false;
    const faceDir = this._vFaceDir;

    /* ENCARE BLOQUEADO: dentro del radio, mirar al character mas cercano MANDA
       sobre la direccion de movimiento (asi se camina hacia atras sin darle la
       espalda). Excepciones: strafe y FirstPerson, donde la camara ya dicta el
       encare. Se exige player o template para no cambiar el comportamiento de
       los NPCs sin template, que hoy no giran (ver ramas de abajo). */
    if (this._lockActive && this._facingTarget && !shouldFaceCamera &&
        (this.entity.isPlayer || this._templateEntity)) {
        faceDir.copy(this._facingTarget.getPosition()).sub(this._curPosition);
        faceDir.y = 0;
        if (faceDir.lengthSq() > 0.000001) {
            faceDir.normalize();
            hasFaceDir = true;
        }
    } else if (this.entity.isPlayer) {
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
    } else if (this._templateEntity) {
        /* NPCs sin template usan angularFactor 0: no rotan, saltar faceDir */
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

    /* SENTIDO DE MARCHA para la animacion (parametro "moveDir"): se proyecta la
       direccion de movimiento sobre el forward YA APLICADO (el yaw actual del
       template, no el objetivo: durante el giro son distintos) y sobre su
       perpendicular, y gana la componente mas grande de las cuatro.
       Solo se evalua con el encare BLOQUEADO. Sin lock el personaje gira hacia
       donde anda, asi que siempre va de frente — y mientras completa un giro
       normal las proyecciones pasan por valores que dispararian retroceso o
       strafe sin motivo. */
    if (this._lockActive && this._isMoving && direction.lengthSq() > 0.000001) {
        let fx, fz;
        if (this._templateEntity) {
            /* el giro converge a atan2(faceDir.x, faceDir.z) = refYaw + yaw,
               luego el forward encarado es (sin(a), 0, cos(a)) */
            const a = this._templateRefYaw + this._templateYaw;
            fx = Math.sin(a);
            fz = Math.cos(a);
        } else {
            /* fallback sin template: la rama de giro por fisica converge
               entity.forward hacia faceDir, asi que ESE vector es el encare.
               ADELANTE/ATRAS salen bien con cualquier convencion (se compara el
               vector consigo mismo); IZQUIERDA/DERECHA pueden salir espejadas si
               el modelo no tiene su forward visual en +Z. Solo afecta al montaje
               legacy "render en la propia capsula": con template (lo normal) la
               convencion es la misma que usa el giro, +Z. */
            const f = this.entity.forward;
            fx = f.x;
            fz = f.z;
        }

        /* forward = (fx, 0, fz)  ->  right = up x forward = (fz, 0, -fx).
           direction ya viene normalizada en las dos ramas que la calculan, asi
           que las dos proyecciones estan en [-1, 1] y son comparables. */
        const dotF = direction.x * fx + direction.z * fz;
        const dotR = direction.x * fz - direction.z * fx;

        /* CARRILES DISPONIBLES del modo de arma. Emitir un moveDir cuyo carril
           no tiene NINGUN clip asignado deja al grafo sin transicion valida y el
           personaje se queda clavado en idle deslizandose (o en walking haciendo
           moonwalk). Por eso el sentido cae siempre al mejor carril que EXISTE:
           lateral -> el que haya, y si no hay, adelante. */
        const lanes = this._modeLanes[+(input.mode || 0)] || this._modeLanes[0];

        /* PUNTUACION por sentido, indexada por CharacterMoveDirEnum. El ganador
           es el maximo; el empate exacto lo rompe el orden (adelante primero). */
        const score = this._vMoveDirScore;
        score[CharacterMoveDirEnum.FORWARD] = dotF;
        score[CharacterMoveDirEnum.BACKWARD] = -dotF;
        score[CharacterMoveDirEnum.LEFT] = -dotR;
        score[CharacterMoveDirEnum.RIGHT] = dotR;

        let bestDir = CharacterMoveDirEnum.FORWARD;
        let bestScore = -Infinity;
        for (var md = 0; md < 4; md++) {
            if (!lanes[md]) continue;             // carril sin clips: no compite
            if (score[md] > bestScore) {
                bestScore = score[md];
                bestDir = md;
            }
        }

        /* HISTERESIS por MARGEN: para destronar al sentido actual hay que
           ganarle por MOVEDIR_HYSTERESIS, no por un pelo. Sin esto, un
           desplazamiento justo en la diagonal (dos componentes casi iguales)
           haria parpadear walking <-> walking_left en cada frame.
           Sustituye a la banda -0.35/-0.15 de la version de solo dos carriles y
           se comporta igual en el limite: con solo FORWARD y BACKWARD vivos, el
           cambio ocurre cuando |dotF| supera el margen. */
        if (bestScore === -Infinity) {
            /* el modo no tiene NINGUN clip de locomocion: no hay nada que elegir
               y quedarse con el sentido anterior lo dejaria pegado para siempre */
            this._moveDir = CharacterMoveDirEnum.FORWARD;
        } else if (bestDir !== this._moveDir) {
            /* si el sentido vigente perdio su carril (cambio de modo de arma) su
               puntuacion es -Infinity y el aspirante entra sin margen que batir */
            const cur = lanes[this._moveDir] ? score[this._moveDir] : -Infinity;
            if (bestScore > cur + MOVEDIR_HYSTERESIS) {
                this._moveDir = bestDir;
            }
        }
    } else {
        this._moveDir = CharacterMoveDirEnum.FORWARD;
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
        this.entity.anim.setInteger("moveDir", this._moveDir);
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

/* Vida maxima en RUNTIME. Es el reemplazo del viejo atributo health.max: la
   vida es un valor de gameplay, no de montaje de escena (ver
   CHARACTER_DEFAULT_MAX_HEALTH).
     refill = true  -> deja la vida a tope.
     refill = false -> conserva la PROPORCION de vida actual, que es lo que uno
                       espera: subir el maximo no cura de golpe y bajarlo no
                       mata a un personaje que estaba entero.
   Uso:  entity.script.character.setMaxHealth(250);            */
Character.prototype.setMaxHealth = function (value, refill) {
    const h = this.entity.health;
    if (!h) return;

    const max = Math.max(1, +value || 0);
    /* la proporcion se toma ANTES de pisar h.max; con h.max invalido se asume
       personaje entero en vez de dividir por cero */
    const ratio = (h.max > 0) ? (h.current / h.max) : 1;

    h.max = max;
    h.current = refill ? max : Math.min(max, Math.max(0, max * ratio));
    h.alive = h.current > 0;
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

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *  C I C L O   D E   V I D A  —  el ÚNICO punto de reacción al culling
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *  Todo el culling del personaje pasa por habilitar/deshabilitar su ENTIDAD
 *  (ver la cabecera del archivo). Estos dos métodos son, entonces, los únicos
 *  que tienen que ordenar el estado interno al salir y al volver: mientras está
 *  apagado no corre absolutamente nada de este script.
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

/* Devuelve el anim component a un estado NEUTRO.
   El LOD de tasa deja anim.playing en false durante los frames que saltea. Si el
   personaje se deshabilita justo en uno de esos frames, ese false queda
   CONGELADO: al volver a habilitarlo el componente estaría perfectamente
   enabled, la entidad también, y aun así el personaje se quedaría clavado en una
   pose para siempre sin un solo error en consola — el peor tipo de bug.
   También se limpia el speed: si quedó en x2 por una compensación a medias, al
   revivir daría un tirón. */
Character.prototype._animLodRelease = function () {
    const anim = this.entity && this.entity.anim;
    if (!anim) return;
    anim.playing = true;
    anim.speed = this._animBaseSpeed || 1;
};

Character.prototype.onDisable = function () {
    this._animLodRelease();

    /* ENCARE: apagado no se encara a nadie. Sin esto, _lockActive quedaría con
       el valor que traía y la política de hitpoints lo tomaría por "en batalla"
       al reaparecer, encendiendo las 9 collisions de hueso sin motivo. */
    this._lockActive = false;
    this._facingTarget = null;
    this._facingTargetDistSq = Infinity;
};

Character.prototype.onEnable = function () {
    /* La deuda de animación acumulada mientras estuvo apagado no significa nada:
       se ACOTA a un intervalo para no disparar un fast-forward al reaparecer. Se
       acota en vez de ponerse a cero a propósito: cero borraría la fase con la
       que initialize reparte a los personajes entre frames (ver _updateAnimLod),
       y el sistema de scripts puede llamar a onEnable DESPUÉS de initialize —
       todos los characters quedarían en fase 0 y volverían a sincronizarse en el
       mismo frame, que es justo lo que la fase evita. El guard de undefined
       cubre el orden inverso (onEnable antes de initialize). */
    if (this._animDebt !== undefined) {
        const interval = 1 / Math.max(ANIM_LOD_MIN_HZ,
            (this.playerAnimationsOptions && this.playerAnimationsOptions.lodRateHz) || 30);
        if (this._animDebt > interval) this._animDebt = interval;
        this._animDtApplied = 0;
        this._animSpeedApplied = this._animBaseSpeed || 1;
    }
    this._animLodRelease();

    /* ROOT MOTION: el muestreo compara la pose de hips contra la del "frame
       anterior", que puede ser de hace mucho rato. Re-anclar la referencia o el
       primer delta valdría por todo el tiempo que estuvo apagado y mandaría a la
       cápsula de un tirón. Lo mismo con la posición previa de la cápsula, que la
       física pudo haber movido. */
    this._rootMotionPrimed = false;
    if (this._vCapsulePrevPos && this.entity) {
        this._vCapsulePrevPos.copy(this.entity.getPosition());
    }

    /* SUELO: los manifolds de contacto se reconstruyen desde cero al volver a la
       simulación, así que el estado de apoyo previo no vale. */
    this._groundContactSeen = false;
    this._coyoteTime = 0;
    this._jumpRestTime = 0;
};

/* LIMPIEZA. Cubre los dos casos: destruir la cápsula (entidad) o quitar solo el
   script. Todo lo que este script crea/engancha debe soltarse aquí para no dejar
   entidades huérfanas ni callbacks colgando que referencien un script muerto. */
Character.prototype._onDestroy = function () {
    var entity = this.entity;

    /* LOD de animación: si la entidad sobrevive al script, dejarla animando a
       velocidad normal en vez de congelada en el último frame salteado */
    this._animLodRelease();

    /* listener del evento de daño (weapon.js) */
    if (entity) entity.off("damage", this._onReceiveDamage, this);

    /* contactos de la cápsula (por si la entidad sobrevive al script) */
    if (entity && entity.collision) {
        entity.collision.off("contact", this.characterContact, this);
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

    /* ENCARE: salir del registro compartido del planificador y soltar el
       objetivo. Sin esto quedaria una referencia a un script muerto en
       Character._candidates (la purga por frescura lo acabaria echando, pero
       aqui es inmediato y no depende de que el hook siga corriendo). */
    if (this._inCandidates) {
        var ci = Character._candidates.indexOf(this);
        if (ci !== -1) {
            Character._candidates[ci] = Character._candidates[Character._candidates.length - 1];
            Character._candidates.pop();
        }
        this._inCandidates = false;
    }
    this._facingTarget = null;
};

/* * * * * * * * * * * * * * * * */
/* D O  A T T A C K  S Y S T E M */
/* * * * * * * * * * * * * * * * */
Character.prototype.doAttackSystem = function (input) {
    if (!this.entity.attackSystem.canAttack) return;

    /* input.attack      = tecla de ataque (F) para el player, o la orden de
                           characterIA para los NPCs. Vale en TODAS las camaras.
       input.attackMouse = el boton izquierdo YA INTERPRETADO por gameManager
                           segun el tipo de camara (ver leftClickIsAttack).
       NO se lee mousePrimaryButton crudo: en ThirdPersonPointMove ese boton es
       la orden de MOVERSE a un punto, y leerlo aqui hacia que el personaje
       lanzara un ataque en CADA orden de movimiento. Los NPCs no tienen
       attackMouse (undefined) y no les afecta. */
    this.entity.attackSystem.attackInput = !!(input.attack || input.attackMouse);
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
}

/* "contact" llega en cada paso de física por CADA par en contacto: la
   clasificación suelo/pared se hace aquí con el manifold fresco (con
   collisionstart solo se evaluaba el instante inicial del contacto). */
Character.prototype.characterContact = function (event) {
    if (event.other && event.other.tags && event.other.tags.has("is-hitpoint")) return;

    var contacts = event.contacts;
    if (!contacts) return;
    var selfPos = this.entity.getPosition();
    /* cota máxima en Y para que un contacto cuente como "base de la cápsula" */
    var baseMaxY = selfPos.y + this._capsuleBaseOffset;
    for (var i = 0; i < contacts.length; i++) {
        var c = contacts[i];
        var ny = c.normal.y;
        if (this.sensorOptions.sensorDebug) {
            console.log("[character] contact normal.y =", ny.toFixed(2), "| point.y - baseMaxY =", (c.point.y - baseMaxY).toFixed(2), "(<= 0 es base)");
        }
        /* suelo = normal casi vertical (cualquier signo: la convención varió entre
           versiones del engine) Y contacto dentro del casquete inferior de la
           cápsula. Bordes/salientes a la altura de la pierna quedan excluidos. */
        if ((ny > 0.5 || ny < -0.5) && c.point.y <= baseMaxY) {
            this._groundContactSeen = true;
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
}

Character.prototype._updateGroundedState = function () {
    /* Suelo por CONTACTOS de la cápsula (ver characterContact): el evento
       "contact" re-marca _groundContactSeen en cada paso de física con apoyo.
       coyoteTime = 100 ms de gracia para cubrir el parpadeo de manifolds de Bullet. */
    var rb = this.entity.rigidbody;
    if (!rb) return;
    var dt = this.entity.input.dt || 0;

    if (this._groundContactSeen) {
        this._coyoteTime = 0.1;
    } else if (this._coyoteTime > 0) {
        this._coyoteTime -= dt;
    }

    var grounded = this._coyoteTime > 0;

    /* caída franca: anula la gracia (cubre collisionend perdidos) */
    if (grounded && rb.linearVelocity.y < -1.5) {
        grounded = false;
        this._coyoteTime = 0;
    }

    /* fallback, mismo criterio que la versión original con raycasts: sin evidencia
       de contacto solo se está en el aire si se está cayendo (vy <= -0.3) */
    if (!grounded) {
        grounded = rb.linearVelocity.y > -0.3;
    }

    /* SALTO: durante el ascenso el fallback por velocidad daría grounded=true
       (vy > 0); mientras dure el salto se está en el aire. Aterrizaje = contacto
       de base real sin velocidad ascendente, o (fallback si los contactos no
       clasifican base) velocidad vertical en reposo SOSTENIDA 150 ms: el paso
       por el apex no cuenta (vy≈0 dura ~10 ms reales, la gravedad lo saca de la
       banda enseguida), así no hay doble salto en el aire. */
    if (this._jumping) {
        var vyNow = rb.linearVelocity.y;
        this._jumpRestTime = (vyNow > -0.05 && vyNow < 0.05) ? this._jumpRestTime + dt : 0;
        if ((this._groundContactSeen && vyNow <= 0.01) || this._jumpRestTime >= 0.15) {
            this._jumping = false;
        } else {
            grounded = false;
        }
    }

    if (this.canmoveonair) grounded = false;

    /* consumir la marca: el próximo paso de física la re-pone si sigue el apoyo */
    this._groundContactSeen = false;

    this.entity.isonground = grounded;
    this.entity.isonair = !grounded;
}

/* Resuelve las referencias al render del personaje. findComponent BAJA por el
   subarbol, asi que sirve tanto para el montaje normal (render en el template)
   como si el Auto LOD lo movio a un hijo <nombre>_LOD0.
   Solo se llama en initialize: no hay ningun sistema que espie meshInstances por
   frame, asi que no hay nada que revalidar despues (ver la cabecera del
   archivo). Lo usan _resolveTemplateEntity y la asignacion de rootBone. */
Character.prototype._resolveRenderRefs = function () {
    var rc = this.entity.findComponent("render");
    this.renderCharacterComponent = rc;
    this.entity.renderCharacterComponent = rc;
    return rc;
};


/* =========================================================================
   POLITICA DE HITPOINTS  (hitpointsoptions.mode)
   =========================================================================
   UNICO lugar que decide si las hitboxes de hueso estan activas: nadie mas
   escribe collision.enabled sobre ellas.

   NO hace falta contemplar el personaje "apagado": si la entidad se deshabilita,
   el motor saca del mundo fisico TODAS sus collisions —hitpoints incluidos— y
   ademas este script deja de correr, asi que esta funcion ni se llama. Ver la
   cabecera del archivo.

   POR QUE SE APOYA EN EL ENCARE
   El ENCARE (_lockActive) significa literalmente "hay otro character dentro del
   radio de encare", que es la misma condicion que "alguien esta lo bastante
   cerca como para golpearme". Ademas ya viene con histeresis (entra en R, sale
   en R*1.25), asi que no parpadea en el borde, y ya la calcula el planificador
   de encare con su presupuesto: coste adicional CERO, solo se lee un booleano.
   La alternativa evidente —mirar si hay objetivo o punto de destino— no sirve:
   characterIA le pone un targetPoint a cada NPC en patrulla permanentemente,
   asi que seria true SIEMPRE y el modo smart no ahorraria nada.

   POR QUE ES POR FLANCO Y NO POR FRAME
   Escribir collision.enabled DESTRUYE y RECREA el ghost object en Ammo. Hacerlo
   cada frame seria mucho peor que no optimizar nada. Se compara contra el
   ultimo estado escrito (_hitpointsActive) y solo se toca cuando cambia.

   POR QUE HAY UN HOLD
   Al salir de combate las hitboxes no se apagan de golpe: se sostienen
   smartHold segundos. Cubre el swing que ya estaba en el aire (la ventana de
   daño va del 25% al 75% del clip) y amortigua cualquier ida y vuelta rapida,
   que es justo lo que no queremos que llegue al broadphase.
   ========================================================================= */
Character.prototype._applyHitpointPolicy = function (dt) {
    if (this._hitpointMode === CharacterHitpointModeEnum.NONE) return;
    if (!this._hitpoints || this._hitpoints.length === 0) return;

    var want;

    if (this._hitpointMode === CharacterHitpointModeEnum.ALWAYS) {
        want = true;
    } else {
        /* MODO BATALLA = encare bloqueado sobre otro character, o el propio
           personaje en plena animacion de ataque (cubre el caso de golpear a
           algo que no dispara encare). */
        var as = this.entity.attackSystem;
        var inBattle = !!this._lockActive ||
            (as && as.status !== CharacterAttackSystemStatusEnum.NONE);

        if (inBattle) {
            this._hitpointHold = this.hitpointsoptions.smartHold;
        } else if (this._hitpointHold > 0) {
            this._hitpointHold -= dt;
            if (this._hitpointHold < 0) this._hitpointHold = 0;
        }

        /* "inBattle ||" y no solo el hold: smartHold acepta 0, y mirando solo el
           hold un 0 dejaba las hitboxes apagadas SIEMPRE — se perdía el daño
           localizado en silencio, sin error ni aviso. Con esto, smartHold = 0
           significa lo que uno espera: se apagan en cuanto termina el combate,
           sin gracia. El hold sólo extiende, nunca habilita por sí solo. */
        want = inBattle || this._hitpointHold > 0;
    }

    if (want === this._hitpointsActive) return;   /* sin cambios: no tocar Ammo */
    this._hitpointsActive = want;
    this._setHitpointCollisionsEnabled(want);
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
/* =========================================================================
   L O D   D E   A N I M A C I O N
   =========================================================================
   QUE HACE
   La animacion no tiene por que evaluarse a la tasa del render. Este LOD la
   corre a una tasa FIJA en Hz (playerAnimationsOptions.lodRateHz, 30 por
   defecto). El PLAYER va exento por defecto (lodPlayerFullRate):

       render 120 fps       -> 1 de cada 4 frames    (30 Hz)
       render  60 fps       -> 1 de cada 2 frames    (30 Hz)   <- el caso normal
       render  30 fps       -> TODOS los frames      (30 Hz)
       render   5 fps       -> TODOS los frames      ( 5 Hz)
       render 1 frame / 5 s -> TODOS los frames

   Es UNA sola regla, y las cinco filas salen de ella: se anima cuando el tiempo
   de juego acumulado sin animar alcanza 1/rateHz. Si el frame YA dura mas que
   ese intervalo, la condicion se cumple en cada frame y el LOD se apaga solo.
   Esa es la garantia para maquinas lentas: el sistema NO PUEDE saltear un
   frame cuando el render ya va por debajo de rateHz, asi que nunca empeora lo
   que habia — en el peor caso se comporta exactamente como antes.

   POR QUE NO SE VE EN CAMARA LENTA
   El frame que si anima avanza TODO el tiempo acumulado, no un frame: la
   compensacion va por anim.speed, que el sistema de animacion multiplica por el
   dt (AnimComponent.update: layers[i].update(dt * this.speed)). A 60 fps son
   speed = 2 en uno de cada dos frames: misma velocidad media, la mitad de
   muestras. La animacion no se ralentiza ni se desincroniza del gameplay.

   POR QUE LA CONTABILIDAD ES EN TIEMPO Y NO EN FRAMES
   Contar frames ("frame % 2") se rompe en cuanto el frame time varia: con
   frames alternados de 8 y 40 ms, "1 de cada 2" da dos tasas de animacion
   completamente distintas segun con cual arranque. Aca se lleva una DEUDA en
   segundos de juego, se le suma el dt de cada frame y se descarga ENTERA en el
   frame que anima. La tasa efectiva se adapta sola a los fps reales.

   DONDE SE ENGANCHA — Y POR QUE ESTO ES LO QUE LO HACE EXACTO
   En update(), es decir en la fase systems.fire("update"), que en app-base va
   JUSTO ANTES de systems.fire("animationUpdate"). Eso significa que cuando se
   escribe anim.speed ya se conoce el dt EXACTO con el que el sistema de
   animacion va a correr un instante despues, en este mismo frame:

       avance real = dt * speed = dt * (deuda / dt) = deuda      <- exacto

   No hay estimacion de por medio y la deuda queda en cero. Es la diferencia
   entre que funcione y que no: la version anterior decidia en postUpdate (o
   sea, para el frame SIGUIENTE) y tenia que ESTIMAR su duracion con la del
   frame actual. Como el avance es dt_real * (deuda / dt_estimado), el error de
   estimacion se multiplica; simulando frames alternados de 8 y 40 ms la
   animacion terminaba avanzando el DOBLE del tiempo de juego (+104 % de
   desfase, comprobado). Con el enganche en update ese escenario da 0 % de
   desfase. Cualquier LOD que programe "para el proximo frame" tiene este
   problema, y en una maquina lenta —donde el frame time salta— es constante.

   QUE RELOJ USA
   El dt de update(), que es EL MISMO que va a recibir el sistema de animacion
   (app-base pasa el mismo valor a las tres fases). Ya viene clampeado por
   app.maxDeltaTime (0.2 s, lo fija gameManager) y multiplicado por
   app.timeScale, asi que la pausa y la camara lenta del tracer entran solas:
   con dt = 0 la deuda no crece y la animacion no avanza, que es lo correcto.
   No se usa performance.now(): mezclar el reloj de pared con el de simulacion
   es justo lo que rompe el sistema cuando el motor clampea dt.

   POR QUE update() Y NO doMove()
   doMove no corre necesariamente todos los frames para todos: GameManager lo
   llama por lotes con presupuesto, y desde tres relojes distintos segun
   characterController.interv (update / internalTimer / requestAnimationFrame).
   Un NPC que se quede fuera del lote perderia frames de contabilidad y su
   animacion se atrasaria. update() lo llama el sistema de scripts para toda
   instancia habilitada, un frame es un frame, y ademas corre en la fase
   correcta. El LOD queda por completo independiente de como GameManager reparta
   el movimiento.

   POR QUE LA DEUDA NO NECESITA TOPE
   Solo crece mientras se saltea, y solo se saltea mientras deuda < intervalo.
   O sea que al entrar a un frame siempre vale menos que un intervalo, se le
   suma un dt (acotado por app.maxDeltaTime) y se descarga entera. Cota dura:
   deuda < intervalo + maxDeltaTime, siempre, sin necesidad de clamps. Y el
   multiplicador de velocidad sale de ahi: deuda/dt, que en regimen es
   exactamente intervalo/dt (2 a 60 fps, 4 a 120, 1 a 30 o menos).

   EVENTOS DE ANIMACION (ventanas de daño)
   No se pierde ninguno: AnimClip evalua los eventos por RANGO
   (activeEventsForFrame(time, time + speed*dt), con un while que dispara todos
   los del tramo), asi que attack-start-damage-animation y compañia siguen
   disparando aunque el paso los cruce de largo.

   CULLING TOTAL (personaje apagado)
   No lo hace este metodo ni ninguno: lo hace el MOTOR. Con la entidad
   deshabilitada este metodo no llega a correr —el sistema de scripts no
   actualiza entidades apagadas— y el de animacion tampoco evalua nada, porque
   exige component.entity.enabled. Ver la cabecera del archivo.
   Ningun camino de este script escribe anim.enabled: el componente queda como lo
   dejo el editor y el unico dueño del "¿anima o no?" es anim.playing, que se
   decide aca y solo para repartir la TASA.

   INTERACCION CON EL ROOT MOTION
   En los frames salteados hips NO se movio. rootMotionFix (postUpdate) no debe
   muestrear ahi: daria delta 0 -> velocidad 0 -> la capsula avanzaria a
   tirones. Por eso este metodo publica _animDtApplied: el dt de ANIMACION de
   este frame, 0 si no corrio. Como update() va antes que animationUpdate y
   postUpdate despues, el valor que lee rootMotionFix describe exactamente el
   paso que el sistema de animacion acaba de dar. Ver _applyTeleportFollow.
   ========================================================================= */
Character.prototype._updateAnimLod = function (dt) {
    const anim = this.entity.anim;
    if (!anim) {
        /* sin anim component no hay nada que muestrear ni que atrasar: hips no
           se mueve solo, asi que rootMotionFix debe seguir viendo el dt real */
        this._animDtApplied = dt;
        return;
    }

    /* dt no positivo (primer frame, pausa por timeScale 0, pestaña en segundo
       plano): no hay nada que contabilizar, y mas abajo se divide por el. Se
       deja el estado intacto — el anim component conserva lo que se le dejo. */
    if (!(dt > 0)) {
        this._animDtApplied = 0;
        return;
    }

    /* COMPONENTE APAGADO desde FUERA de este script (el editor, o gameplay).
       Este script ya NO toca anim.enabled: el culling por visibilidad se hace
       mas abajo con anim.playing, para tener un unico dueño del estado. El
       sistema de animacion ni mira un componente deshabilitado (exige enabled &&
       entity.enabled && playing), asi que no hay nada que compensar y la deuda
       se descarta. Se deja playing en true para que quede en estado NEUTRO: si
       algo lo reactiva por fuera, anima; ningun camino puede dejarlo congelado. */
    if (!anim.enabled) {
        anim.playing = true;
        anim.speed = this._animBaseSpeed;   /* que no reviva con un x2 pegado */
        this._animDtApplied = 0;
        this._animSpeedApplied = this._animBaseSpeed;
        this._animDebt = 0;
        return;
    }

    /* (aquí estaba el corte de animación FUERA DE CÁMARA, que espiaba
       meshInstance.visibleThisFrame. Ya no hace falta ni sería alcanzable: con
       la entidad deshabilitada este método no corre —el sistema de scripts no
       actualiza entidades apagadas— y el de animación tampoco evalúa nada,
       porque exige component.entity.enabled. Ver la cabecera del archivo.) */

    const lod = this.playerAnimationsOptions;
    Character._animLodTotal++;

    /* SIN LOD (apagado por atributo, o player eximido): a pleno y sin deuda. */
    if (!lod.lodEnabled || (this.entity.isPlayer && lod.lodPlayerFullRate)) {
        anim.playing = true;
        if (anim.speed !== this._animBaseSpeed) anim.speed = this._animBaseSpeed;
        this._animDtApplied = dt;
        this._animSpeedApplied = this._animBaseSpeed;
        this._animDebt = 0;
        Character._animLodRan++;
        return;
    }

    /* Este frame aporta su dt al tiempo de juego todavia no animado. */
    this._animDebt += dt;

    const interval = 1 / Math.max(ANIM_LOD_MIN_HZ, lod.lodRateHz);

    /* Todavia no se junto un intervalo: saltear. El sistema de animacion exige
       playing (ver AnimComponentSystem.onAnimationUpdate), asi que con esto se
       salta ENTERO — controller, evaluador de curvas y escritura de huesos.

       EL UMBRAL LLEVA UNA TOLERANCIA (no es "< interval" a secas) y es
       importante. Solo se puede animar en frontera de frame, asi que la tasa
       lograda es 1/(k*dt) con k el menor entero que junta un intervalo. Con el
       umbral exacto, un dt apenas POR DEBAJO del intervalo necesita k=2 y la
       tasa se DERRUMBA A LA MITAD:
           30.0 fps -> dt 0.03333 -> k=1 -> 30 Hz
           30.3 fps -> dt 0.03300 -> k=2 -> 15 Hz   <- escalon absurdo
       Y en el caso peor, un juego corriendo JUSTO a lodRateHz quedaba a merced
       del ruido de coma flotante: dt oscila un ULP alrededor del intervalo y la
       tasa de animacion salta entre 30 y 15 Hz de un frame a otro.
       Con el 5% de tolerancia, un frame que llega "casi" al intervalo cuenta:
       desaparece el escalon y el techo real queda en lodRateHz * 1.05, o sea
       que sigue sin hacer mas trabajo del pedido. No introduce deriva: se anime
       cuando se anime, el paso descarga la deuda COMPLETA (ver abajo). */
    if (this._animDebt < interval * ANIM_LOD_FIRE_TOLERANCE) {
        anim.playing = false;
        this._animDtApplied = 0;
        this._animSpeedApplied = 0;
        return;
    }

    /* ANIMAR, descargando la deuda COMPLETA en este paso. El sistema de
       animacion corre en la fase siguiente de ESTE MISMO frame (animationUpdate)
       y con ESTE MISMO dt, asi que el avance es dt * speed = deuda: exacto, sin
       estimar nada, y la deuda queda saldada en cero. Ver la cabecera. */
    anim.playing = true;
    this._animSpeedApplied = this._animBaseSpeed * (this._animDebt / dt);
    anim.speed = this._animSpeedApplied;
    this._animDtApplied = this._animDebt;
    this._animDebt = 0;
    Character._animLodRan++;
};

/* Fase "update" del sistema de scripts: va ANTES de animationUpdate, que es la
   unica posicion desde la que el LOD puede fijar anim.speed conociendo el dt
   real con el que la animacion va a correr. Todo lo demas del personaje sigue
   moviendose desde doMove (GameManager) y postUpdate. */
Character.prototype.update = function (dt) {
    this._updateAnimLod(dt);
};

/* Velocidad base de animacion de ESTE personaje (1 = normal). El LOD reescribe
   anim.speed cada frame para compensar los frames salteados, asi que asignar
   entity.anim.speed desde fuera se pierde al frame siguiente: hay que pasar por
   aca. Sirve para slow-motion / aceleracion por gameplay sin pelear con el LOD. */
Character.prototype.setAnimBaseSpeed = function (speed) {
    const s = +speed;
    this._animBaseSpeed = (isFinite(s) && s > 0) ? s : 1;
    if (this.entity.anim) this.entity.anim.speed = this._animBaseSpeed;
};


Character.prototype.postUpdate = function (dt) {
    /* Si el personaje llega hasta acá es que su entidad está habilitada: el
       sistema de scripts no actualiza entidades apagadas. No hay ningún test de
       visibilidad que hacer. */

    /* rootMotionFix lee _animDtApplied, que dejó _updateAnimLod en la fase
       update de ESTE frame y describe el paso que el sistema de animación acaba
       de dar (0 si el LOD de tasa lo salteó). */
    this.rootMotionFix(dt);
    this.doCarryWeapons();

    /* HITBOXES por hueso: acá y no en doMove porque doMove puede no correrle a
       un NPC en un frame dado (updateCharactersMovement reparte por lotes con
       presupuesto) y el hold necesita un dt continuo. */
    this._applyHitpointPolicy(dt);

    if (this.tracerOptions.traceanimlod && (this.entity.isPlayer || this.entity.selected)) {
        Trace("animLod", {
            renderFps: (1 / Math.max(dt, 1e-6)).toFixed(0),
            rateHz: this.playerAnimationsOptions.lodRateHz,
            /* contadores VIVOS: se llenan en la fase update y este Trace corre
               en postUpdate, o sea que ya estan completos para ESTE frame */
            animando: Character._animLodRan + "/" + Character._animLodTotal,
            animoEsteFrame: this._animDtApplied > 0
                ? ("si  paso " + (this._animDtApplied * 1000).toFixed(1) + "ms  x" +
                    (this._animSpeedApplied / this._animBaseSpeed).toFixed(2))
                : "no",
            deuda: (this._animDebt * 1000).toFixed(1) + "ms"
        });
    }
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

    /* dt de ANIMACIÓN de este frame (lo publica _updateAnimLod, que ya corrió).
       Con el LOD activo hay frames en los que la animación NO avanzó: ahí vale
       0, hips está exactamente donde quedó y no hay nada nuevo que muestrear ni
       que clavar. Todo lo que dependa del movimiento de hips tiene que mirar
       este valor, NO el dt del frame. */
    const animDt = this._animDtApplied;

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
            this._applyTeleportFollow(hips, animDt);
            return;

        case CharacterMotionKindEnum.AXES: {
            /* place-in-<ejes>: clavar el modelo en esos ejes y NADA MÁS (el
               desplazamiento que la animación trae se descarta; los ejes no
               elegidos conservan la pose animada). La cápsula se mueve solo
               por input/física: cero interferencia = cero trabas al caminar.
               LOD: si la animación no avanzó, hips sigue clavado donde lo
               dejamos y re-escribirlo sólo ensuciaría toda la jerarquía del
               esqueleto para nada. */
            const restPos = (animDt > 0) ? this.playerAnimationsOptions.startPosition : null;
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
            /* legacy: clavar el modelo en TODOS los ejes (mismo criterio de LOD
               que la rama AXES: sin avance de animación no hay nada que clavar) */
            const restPos = (animDt > 0) ? this.playerAnimationsOptions.startPosition : null;
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
Character.prototype._applyTeleportFollow = function (hips, animDt) {
    const template = this._templateEntity;
    const body = this.entity.rigidbody;
    if (!template || !body) {
        /* sin template/render separado o sin física no hay a quién acompañar */
        this._rootMotionPrimed = false;
        this._rootMotionDriving = false;
        return;
    }

    /* --- 0) COMPENSAR el template por el movimiento REAL de la cápsula desde
       el frame anterior (solo mientras conducimos nosotros; si conduce el
       input, el visual debe viajar con la cápsula como siempre).
       Va SIEMPRE, TODOS los frames, incluidos los que el LOD saltea: la cápsula
       la mueve la física en cada frame, y si no se compensa en los salteados el
       visual se despega y vuelve de un tirón en el siguiente muestreo. --- */
    const capsulePos = this.entity.getPosition();
    const capsuleMovedX = capsulePos.x - this._vCapsulePrevPos.x;
    const capsuleMovedZ = capsulePos.z - this._vCapsulePrevPos.z;
    this._vCapsulePrevPos.copy(capsulePos);
    if (this._rootMotionDriving && (capsuleMovedX !== 0 || capsuleMovedZ !== 0)) {
        const templatePos = template.getPosition();
        this._vTemplatePos.set(templatePos.x - capsuleMovedX, templatePos.y, templatePos.z - capsuleMovedZ);
        template.setPosition(this._vTemplatePos);
        this._teleportShifted = true;
    }

    /* --- 1) FRAME SIN AVANCE DE ANIMACIÓN (LOD): hips está exactamente donde
       quedó. Volver a muestrear daría delta 0 -> velocidad 0 -> la cápsula
       avanzaría a tirones (un frame a tope, el siguiente frenada). Se conserva
       la velocidad del último muestreo —que es justamente la MEDIA de todo el
       intervalo— y se sigue aplicando. --- */
    if (!(animDt > 0)) {
        if (this._rootMotionDriving) this._applyRootMotionVelocity(body);
        return;
    }

    /* --- 2) MUESTREO: cuánto se movió hips desde la última vez que la
       animación AVANZÓ (no desde el frame anterior) --- */
    const hipsLocalPos = hips.getLocalPosition();
    if (!this._rootMotionPrimed) {
        /* primer paso de la animación: aún no hay muestra previa con la que
           medir un delta */
        this._vHipsPrevLocal.copy(hipsLocalPos);
        this._rootMotionPrimed = true;
        this._restoreTemplateOffset();
        this._vRootMotionVelAvg.set(0, 0, 0);
        this._rootMotionDriving = false;
        return;
    }

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
       paso. Se detecta porque el delta supera lo que un personaje podría
       moverse de verdad en ESE paso (15 m/s, suelo de 0.25 m para pasos
       chicos). El umbral se mide contra animDt —el tiempo de animación que
       cubrió el paso—, NO contra el dt del frame: con el LOD un paso vale
       varios frames, y con el umbral del frame cada muestra legítima parecería
       un wrap y el root motion quedaría muerto. */
    const wrapLimit = (animDt * 15 > 0.25) ? animDt * 15 : 0.25;
    const sampleOk = Math.abs(this._vHipsDeltaWorld.x) <= wrapLimit &&
        Math.abs(this._vHipsDeltaWorld.y) <= wrapLimit &&
        Math.abs(this._vHipsDeltaWorld.z) <= wrapLimit;

    if (!sampleOk) {
        /* wrap del loop: hips volvió a su origen -> el visual ya vuelve solo a
           la cápsula (que absorbió el recorrido); restaurar la compensación. */
        this._restoreTemplateOffset();
        this._vRootMotionVelAvg.set(0, 0, 0);
        this._rootMotionDriving = false;
        return;
    }

    /* --- 3) velocidad de persecución (solo plano horizontal: la Y de la
       cápsula la gobierna la gravedad) con tope de seguridad. Se divide por
       animDt: ese delta de hips corresponde a animDt segundos de animación, y
       la cápsula tiene que cubrirlo en ese mismo tiempo real. Dividir por el dt
       del frame daría una velocidad inflada por el factor de LOD. --- */
    this._vRootMotionVel.set(this._vHipsDeltaWorld.x / animDt, 0, this._vHipsDeltaWorld.z / animDt);
    const speedSq = this._vRootMotionVel.lengthSq();
    if (speedSq > 225) this._vRootMotionVel.mulScalar(15 / Math.sqrt(speedSq));   /* max 15 m/s */

    /* media + histéresis: el vaivén de un idle no debe poner a la cápsula a
       perseguir; un desplazamiento real (>0.2 m/s sostenido) sí. Suelta por
       debajo de 0.1 m/s (sin parpadeo en el umbral). El suavizado usa animDt
       porque ese es el tiempo transcurrido ENTRE MUESTRAS: con el dt del frame
       la media se movería más lento de lo pedido en cuanto hubiera frames
       salteados, y la histéresis tardaría el doble en enganchar. */
    this._vRootMotionVelAvg.lerp(this._vRootMotionVelAvg, this._vRootMotionVel, Math.min(1, animDt * 5));
    const avgSpeedSq = this._vRootMotionVelAvg.lengthSq();
    if (this._rootMotionDriving) {
        if (avgSpeedSq < 0.01) this._rootMotionDriving = false;
    } else if (avgSpeedSq > 0.04) {
        this._rootMotionDriving = true;
    }

    if (this._rootMotionDriving) this._applyRootMotionVelocity(body);
}

/* Fija la velocidad horizontal de la cápsula a la que pide la animación (root
   motion en modo teleport). Se llama también en los frames que el LOD saltea,
   con la velocidad del último muestreo: así la cápsula avanza de forma continua
   aunque la animación se muestree a 30 Hz. */
Character.prototype._applyRootMotionVelocity = function (body) {
    const newVelocity = this._vCurrent.copy(body.linearVelocity);
    newVelocity.x = this._vRootMotionVel.x;
    newVelocity.z = this._vRootMotionVel.z;
    body.linearVelocity = newVelocity;
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

/* Renombra los nodos con nombre DUPLICADO dentro de 'root', conservando la
   PRIMERA aparicion en pre-orden (el mismo nodo que el DefaultAnimBinder elige
   con findByName) y agregando un sufijo a las siguientes. Elimina de raiz el
   warning "Anim Binder: Multiple animation curves with the path ..." sin alterar
   el enlace de la animacion. Devuelve cuantos nodos se renombraron. */
Character.prototype._dedupeAnimNodeNames = function (root) {
    if (!root) return 0;
    var seen = Object.create(null);
    var renamed = 0;

    function walk(node) {
        var name = node.name;
        if (name) {
            if (seen[name]) {
                /* duplicado: la animacion ya se enlazaba a la 1a aparicion; a
                   esta se le da un nombre unico para que el path deje de chocar */
                node.name = name + "__anmdup" + renamed;
                renamed++;
            } else {
                seen[name] = true;
            }
        }
        var ch = node.children;
        for (var i = 0; i < ch.length; i++) walk(ch[i]);
    }

    walk(root);

    if (renamed > 0 && this.sensorOptions && this.sensorOptions.sensorDebug) {
        console.log('[character] anim node dedupe en "' + this.entity.name + '": ' + renamed + " nodo(s) renombrado(s).");
    }
    return renamed;
};

/* Elimina CURVAS DUPLICADAS de un AnimTrack (asset.resource) antes de asignarlo.
   Es el arreglo del warning cuando la duplicacion viene del ASSET (GLB con dos
   huesos "LeftEye" -> dos curvas con el mismo path "LeftEye/graph/localX"): el
   binder avisa "Multiple animation curves with the path X". Se conserva la
   PRIMERA curva de cada path (la que el binder ya usaba) y se descartan las de
   path IDENTICO (clave sin perdida): la animacion no cambia y el path deja de
   estar repetido. Blindado: try/catch + flag idempotente + si la estructura
   interna del build no coincide, NO toca nada (el set queda inerte). El track
   es COMPARTIDO entre personajes: se deduplica una sola vez (flag). */
Character.prototype._dedupeTrackCurves = function (track) {
    try {
        if (!track || track.__curvesDeduped) return 0;

        var curves = track.curves || track._curves;
        if (!curves || !curves.length) return 0;

        var seen = Object.create(null);
        var kept = [];
        var removed = 0;
        var SEP = "";

        for (var i = 0; i < curves.length; i++) {
            var c = curves[i];
            var paths = c.paths || c._paths;
            if (paths && !paths.length && typeof paths === "object") paths = [paths]; // path unico

            var key = "";
            if (paths && paths.length) {
                for (var p = 0; p < paths.length; p++) {
                    var pa = paths[p];
                    if (typeof pa === "string") {
                        key += pa + SEP;
                    } else if (pa) {
                        key += (pa.entityPath ? pa.entityPath.join("/") : "") + SEP +
                            (pa.component || "") + SEP +
                            (pa.propertyPath ? (pa.propertyPath.join ? pa.propertyPath.join(".") : pa.propertyPath) : "") + SEP + SEP;
                    }
                }
            }

            if (!key) { kept.push(c); continue; }   // sin path legible: no arriesgar, mantener
            if (seen[key]) { removed++; continue; }  // path IDENTICO ya conservado: redundante
            seen[key] = true;
            kept.push(c);
        }

        if (removed > 0) {
            if (track._curves) track._curves = kept; else track.curves = kept;
            track.__curvesDeduped = true;
            if (this.sensorOptions && this.sensorOptions.sensorDebug) {
                console.log('[character] anim curve dedupe en "' + (track.name || "clip") + '": ' + removed + " curva(s) duplicada(s) eliminada(s).");
            }
        } else {
            track.__curvesDeduped = true;   // ya estaba limpio: no reintentar
        }
        return removed;
    } catch (e) {
        return 0;   // estructura interna distinta en este build: no tocar nada
    }
};


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
            /* SENTIDO DE MARCHA (CharacterMoveDirEnum): 0 adelante, 1 atras,
               2 izquierda, 3 derecha. Solo sale de 0 con el encare bloqueado
               (ver attackSystem.faceNearbyCharacters): sin lock el personaje gira
               hacia donde anda, asi que siempre va de frente. Separa el sub-grafo
               de locomocion en cuatro carriles mutuamente excluyentes
               (idle<->walking<->running y sus espejos _backward/_left/_right)
               enlazados entre si por cruces sin condicion de velocidad. */
            moveDir: {
                name: "moveDir",
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


    const animation_modes_length = Character.animation_modes.length;
    var m = 0;
    for (; m < animation_modes_length; m++) {
        const animAttr = this["animations_" + Character.animation_modes[m]], keys = Object.keys(animAttr), keys_length = keys.length;
        var i = 0;
        for (; i < keys_length; i++) {
            const stateName = keys[i];
            if (stateName.indexOf("_rootmotion") !== -1) continue;
            if (animAttr[stateName] && animAttr[stateName].id) {
                animAttr[stateName].preload = true;
                const stateLoop = stateName.indexOf("death") === -1 && stateName.indexOf("landing") === -1;
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
                                { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0 },
                                { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: 0 }
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
                            { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0.99 },
                            { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                        ]
                    },
                    {
                        from: modeName + "_running",
                        to: modeName + "_walking",
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "speed", predicate: pc.ANIM_LESS_THAN, value: 1 },
                            { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: 0 }
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
                                { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: 0 }
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


        /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
         *  C A R R I L E S   D I R E C C I O N A L E S
         * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
         *  Un carril por sentido de marcha (parametro moveDir), espejo del de
         *  adelante. Se usan cuando el encare esta bloqueado sobre otro
         *  character y el movimiento deja de coincidir con la mirada: el
         *  personaje lo sigue mirando y camina hacia atras o de lado en vez de
         *  girarse (y en vez de hacer moonwalk, que es lo que pasaba antes
         *  porque estos estados existian como slot pero sin transiciones).
         *
         *  Topologia: cuatro carriles paralelos colgando del mismo idle.
         *      idle <-> walking          <-> running           (moveDir 0)
         *      idle <-> walking_backward <-> running_backward  (moveDir 1)
         *      idle <-> walking_left     <-> running_left      (moveDir 2)
         *      idle <-> walking_right    <-> running_right     (moveDir 3)
         *              \______ cruces por moveDir, todos con todos ______/
         *
         *  Los CRUCES no llevan condicion de speed a proposito: si la llevaran,
         *  cambiar de sentido y de velocidad en el mismo frame podria dejar al
         *  grafo sin ninguna transicion valida (p.ej. en running, moveDir pasa
         *  a 1 y speed cae a 0.5: ni running->walking, que exige moveDir 0, ni
         *  running->running_backward, que exigiria speed alta). Sin ella el
         *  cambio siempre resuelve, como mucho en dos saltos.
         *
         *  Un cruce aterriza en el clip del MISMO tier (walk->walk, run->run) y
         *  si ese no existe CAE al otro tier del carril destino: con solo
         *  walking_left asignado, running tambien sabe salir hacia el. Sin esa
         *  caida, correr y strafear a la vez dejaba al personaje clavado en
         *  running (ningun cruce valido) hasta soltar el movimiento.
         *
         *  Cada transicion se crea solo si SUS DOS extremos tienen clip
         *  asignado: sin clips laterales ni de retroceso, nada de esto existe y
         *  el grafo queda exactamente como estaba. El runtime consulta esa
         *  misma disponibilidad en _modeLanes y NO emite un moveDir cuyo carril
         *  no exista, que es lo que dejaba al personaje deslizandose en idle.
         * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
        const laneT = this._animStateGraphData.layers[0].transitions;
        const laneStates = this._animStateGraphData.layers[0].states;

        const lanes = [];
        for (var dirI = 0; dirI < CharacterMoveDirSuffix.length; dirI++) {
            const wName = modeName + "_walking" + CharacterMoveDirSuffix[dirI];
            const rName = modeName + "_running" + CharacterMoveDirSuffix[dirI];
            const hasW = !!this["animations_" + modeName][wName];
            const hasR = !!this["animations_" + modeName][rName];
            lanes.push({
                walk: hasW ? wName : null,
                run: hasR ? rName : null,
                /* destino de un cruce segun el tier de origen, con caida al otro */
                inWalk: hasW ? wName : (hasR ? rName : null),
                inRun: hasR ? rName : (hasW ? wName : null)
            });
            this._modeLanes[m][dirI] = hasW || hasR;
        }

        /* 1. IDLE <-> carril y walk <-> run DENTRO del carril. El carril FORWARD
              (dir 0) ya lo armaron los bloques WALKING/RUNNING de arriba, asi
              que aqui se empieza en 1. */
        for (var laneI = 1; laneI < lanes.length; laneI++) {
            const lane = lanes[laneI];
            if (!lane.walk && !lane.run) continue;

            for (var idleI = 0; idleI < idles.length; idleI++) {
                const idleName = modeName + "_" + idles[idleI];
                const idleExists = laneStates.find(function (s) {
                    return s.name === idleName;
                });
                if (!idleExists) continue;

                if (lane.walk) {
                    laneT.push(
                        {
                            from: idleName,
                            to: lane.walk,
                            time: 0.2,
                            priority: 0,
                            conditions: [
                                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                                { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0 },
                                { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: laneI }
                            ]
                        },
                        {
                            /* el retorno a idle NO filtra por moveDir: pararse
                               debe funcionar se venga del sentido que se venga */
                            from: lane.walk,
                            to: idleName,
                            time: 0.1,
                            priority: 0,
                            conditions: [
                                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                                { parameterName: "idle", predicate: pc.ANIM_EQUAL_TO, value: idleI },
                                { parameterName: "speed", predicate: pc.ANIM_LESS_THAN, value: 0.01 }
                            ]
                        }
                    );
                }

                if (lane.run) {
                    laneT.push(
                        {
                            from: idleName,
                            to: lane.run,
                            time: 0.2,
                            priority: 0,
                            conditions: [
                                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                                { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN_EQUAL_TO, value: 1 },
                                { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: laneI }
                            ]
                        },
                        {
                            from: lane.run,
                            to: idleName,
                            time: 0.1,
                            priority: 0,
                            conditions: [
                                { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                                { parameterName: "idle", predicate: pc.ANIM_EQUAL_TO, value: idleI },
                                { parameterName: "speed", predicate: pc.ANIM_LESS_THAN, value: 0.01 }
                            ]
                        }
                    );
                }
            }

            /* walk <-> run del MISMO carril: por speed, con moveDir constante */
            if (lane.walk && lane.run) {
                laneT.push(
                    {
                        from: lane.walk,
                        to: lane.run,
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0.99 },
                            { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: laneI }
                        ]
                    },
                    {
                        from: lane.run,
                        to: lane.walk,
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "speed", predicate: pc.ANIM_LESS_THAN, value: 1 },
                            { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: laneI }
                        ]
                    }
                );
            }
        }

        /* 2. CRUCES entre carriles distintos, todos con todos y SIN condicion de
              speed (ver cabecera). La condicion es solo el moveDir DESTINO, que
              al ser mutuamente excluyente hace que nunca haya dos cruces validos
              a la vez desde el mismo estado. */
        for (var srcI = 0; srcI < lanes.length; srcI++) {
            for (var dstI = 0; dstI < lanes.length; dstI++) {
                if (srcI === dstI) continue;
                const src = lanes[srcI];
                const dst = lanes[dstI];

                if (src.walk && dst.inWalk) {
                    laneT.push({
                        from: src.walk,
                        to: dst.inWalk,
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: dstI }
                        ]
                    });
                }

                if (src.run && dst.inRun) {
                    laneT.push({
                        from: src.run,
                        to: dst.inRun,
                        time: 0.2,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: m },
                            { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: dstI }
                        ]
                    });
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
    const graphStateSet = new Set();
    for (var si = 0; si < graphStates.length; si++) graphStateSet.add(graphStates[si].name);

    if (graphStateSet.has(airIdleState)) {
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

            if (graphStateSet.has(wModeName + "_idle")) {
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
            if (graphStateSet.has(wModeName + "_walking")) {
                this._animStateGraphData.layers[0].transitions.push({
                    from: airIdleState,
                    to: wModeName + "_walking",
                    time: 0.15,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: wm },
                        { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN_EQUAL_TO, value: 0.01 },
                        { parameterName: "speed", predicate: pc.ANIM_LESS_THAN_EQUAL_TO, value: 0.99 },
                        { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                    ]
                });
            }
            if (graphStateSet.has(wModeName + "_running")) {
                this._animStateGraphData.layers[0].transitions.push({
                    from: airIdleState,
                    to: wModeName + "_running",
                    time: 0.15,
                    priority: 0,
                    conditions: [
                        { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: wm },
                        { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0.99 },
                        { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: 0 }
                    ]
                });
            }
            /* aterrizar retrocediendo o de lado: mismos rangos de speed, un
               carril por moveDir. Sin esto, tocar suelo con el encare bloqueado
               y moviendose en cualquier sentido que no sea adelante dejaria la
               pose de aire pegada (ninguna transicion valida). Empieza en 1: el
               carril FORWARD son las dos transiciones de aqui arriba. */
            for (var landDir = 1; landDir < CharacterMoveDirSuffix.length; landDir++) {
                const landWalk = wModeName + "_walking" + CharacterMoveDirSuffix[landDir];
                const landRun = wModeName + "_running" + CharacterMoveDirSuffix[landDir];

                if (graphStateSet.has(landWalk)) {
                    this._animStateGraphData.layers[0].transitions.push({
                        from: airIdleState,
                        to: landWalk,
                        time: 0.15,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: wm },
                            { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN_EQUAL_TO, value: 0.01 },
                            { parameterName: "speed", predicate: pc.ANIM_LESS_THAN_EQUAL_TO, value: 0.99 },
                            { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: landDir }
                        ]
                    });
                }
                if (graphStateSet.has(landRun)) {
                    this._animStateGraphData.layers[0].transitions.push({
                        from: airIdleState,
                        to: landRun,
                        time: 0.15,
                        priority: 0,
                        conditions: [
                            { parameterName: "mode", predicate: pc.ANIM_EQUAL_TO, value: wm },
                            { parameterName: "speed", predicate: pc.ANIM_GREATER_THAN, value: 0.99 },
                            { parameterName: "moveDir", predicate: pc.ANIM_EQUAL_TO, value: landDir }
                        ]
                    });
                }
            }
        }
    }


    /* ROOT BONE del anim component: el ARMATURE (padre de hips). Restringe el
       binder de animacion a ese subarbol, en vez de recorrer TODO el personaje:
       si una malla se llama igual que un hueso (p.ej. ojos: malla "LeftEye" +
       hueso "LeftEye"), el binder avisaba "Anim Binder: Multiple animation
       curves with the path..." y podia enlazar la curva al nodo equivocado.
       Con el armature como raiz, las mallas hermanas quedan fuera y el enlace
       es inequivoco. (El antiguo playerAnimationsOptions.hips no existe como
       atributo: rootBone llegaba siempre undefined.) */
    var animRootBone;
    if (this.bones.hips && this.bones.hips.parent && this.bones.hips.parent !== this.entity) {
        animRootBone = this.bones.hips.parent;
    }

    /* DEDUP de nombres de nodo (arreglo DEFINITIVO del warning del Anim Binder):
       el binder construye su mapa recorriendo el subarbol y avisa "Multiple
       animation curves with the path X" cuando DOS nodos resuelven al mismo
       nombre (caso tipico: la malla del ojo se llama igual que el hueso,
       LeftEye/RightEye). Se recorre en PRE-ORDEN (igual que findByName) y se
       CONSERVA la primera aparicion —justo el nodo al que el binder ya se
       enlazaba— renombrando solo las duplicadas: la animacion no cambia y el
       nombre pasa a ser unico, asi el warning desaparece de raiz. Se hace ANTES
       de crear el anim component (el binder corre en loadStateGraph). */
    this._dedupeAnimNodeNames(animRootBone || this.entity);

    // add an anim component to the entity
    this.entity.addComponent("anim", {
        activate: true,
        rootBone: animRootBone
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

                    this._dedupeTrackCurves(asset.resource);   // quita curvas de path duplicado (warning Anim Binder)
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
                        this._dedupeTrackCurves(e.resource);   // quita curvas de path duplicado (warning Anim Binder)
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
