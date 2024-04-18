var UranusControllerThirdPerson = pc.createScript("uranusControllerThirdPerson");
UranusControllerThirdPerson.attributes.add("moveSpeed", {
    type: "number",
    default: 2,
    title: "Move Speed",
    description: "The move speed of the character."
}),
    UranusControllerThirdPerson.attributes.add("sprintSpeed", {
        type: "number",
        default: 5,
        title: "Sprint Speed",
        description: "The sprint speed of the character. Set to 0.0 to disable sprinting."
    }),
    UranusControllerThirdPerson.attributes.add("jumpSpeed", {
        type: "number",
        default: 30,
        title: "Jump Speed",
        description: "The player jump speed."
    }),
    UranusControllerThirdPerson.attributes.add("swimSpeed", {
        type: "number",
        default: 3,
        title: "Swim Speed",
        description: "The swimming speed of the character."
    }),
    UranusControllerThirdPerson.attributes.add("flySpeed", {
        type: "number",
        default: 10,
        title: "Fly Speed",
        description: "The flying speed of the character."
    }),
    UranusControllerThirdPerson.attributes.add("flyClimbRatio", {
        type: "number",
        default: .2,
        title: "Fly Climb Ratio",
        description: "The vertical flying speed climb and descend ratio."
    }),
    UranusControllerThirdPerson.attributes.add("waterLevel", {
        type: "number",
        default: 0,
        title: "Water Level",
        description: "The global water level, if the player falls below this it will automatically enter swimming mode."
    }),
    UranusControllerThirdPerson.attributes.add("sprintByDefault", {
        type: "boolean",
        default: !0,
        title: "Sprint By Default",
        description: "If selected the default movement speed will be sprint."
    }),
    UranusControllerThirdPerson.attributes.add("canFly", {
        type: "boolean",
        default: !0,
        title: "Can Fly",
        description: "If selected the player will fly when double jumping."
    }),
    UranusControllerThirdPerson.attributes.add("canMantle", {
        type: "boolean",
        default: !1,
        title: "Can Mantle",
        description: "If selected the player can mantle on edges and climb up."
    }),
    UranusControllerThirdPerson.attributes.add("forceSwim", {
        type: "boolean",
        default: !1,
        title: "Force Swim",
        description: "If selected the player will be forced to swim/float."
    }),
    UranusControllerThirdPerson.attributes.add("playerToPlayerCollision", {
        type: "boolean",
        default: !0,
        title: "Player to Player Collision",
        description: "If enabled players can collide with each other. Requires application reload."
    }),
    UranusControllerThirdPerson.attributes.add("rotationStep", {
        type: "number",
        default: 0,
        min: 0,
        max: 360,
        title: "Rotation Step",
        description: "Useful for creating a more retro 4 or 8 direction player rotation (set it to 45 or 90 for example)."
    }),
    UranusControllerThirdPerson.attributes.add("rotationInertia", {
        type: "number",
        default: 10,
        title: "Rotation Inertia",
        description: "The rotation time required for the character to turn towards the movement direction."
    }),
    UranusControllerThirdPerson.attributes.add("speedChangeRate", {
        type: "number",
        default: 10,
        title: "Speed Change Rate",
        description: "The acceleration/deceleration speed change amount."
    }),
    UranusControllerThirdPerson.attributes.add("mantleRate", {
        type: "number",
        default: .5,
        title: "Mantle Rate",
        description: "Controls how quickly the player mantles in place (should be synchronized with a corresponding animation)."
    }),
    UranusControllerThirdPerson.attributes.add("gravity", {
        type: "number",
        default: -15,
        title: "Gravity",
        description: "Extra gravity applied to the player in addition to the scene gravity."
    }),
    UranusControllerThirdPerson.attributes.add("jumpUpTimeout", {
        type: "number",
        default: .3,
        title: "Jump Up Timeout",
        description: "Time required to reach the maximum jump elevation when jumping."
    }),
    UranusControllerThirdPerson.attributes.add("jumpTimeout", {
        type: "number",
        default: .5,
        title: "Jump Timeout",
        description: "Time required to pass before being able to jump again. Set to 0.0 to be able to instantly jump again."
    }),
    UranusControllerThirdPerson.attributes.add("fallTimeout", {
        type: "number",
        default: .15,
        title: "Ground Fall Timeout",
        description: "Time required to pass before entering the fall state while on ground. Useful for walking down stairs."
    }),
    UranusControllerThirdPerson.attributes.add("flyFallTimeout", {
        type: "number",
        default: 2,
        title: "Fly Fall Timeout",
        description: "Time required to pass before entering the fall state while on hovering on air."
    }),
    UranusControllerThirdPerson.attributes.add("groundedOffset", {
        type: "number",
        default: .1,
        title: "Grounded Offset",
        description: "The threshold in world units for the grounded property, useful to simulate movement in rough terrain."
    }),
    UranusControllerThirdPerson.attributes.add("topClamp", {
        type: "number",
        default: 70,
        title: "Top Clamp",
        description: "The maximum value in angle degrees for the camera upwards movement."
    }),
    UranusControllerThirdPerson.attributes.add("bottomClamp", {
        type: "number",
        default: -30,
        title: "Bottom Clamp",
        description: "The maximum value in angle degrees for the camera downwards movement."
    }),
    UranusControllerThirdPerson.attributes.add("cameraAngleOverride", {
        type: "number",
        default: -30,
        title: "Camera Angle Override",
        description: "Additional degress to override the camera. Useful for fine tuning camera position when locked."
    }),
    UranusControllerThirdPerson.attributes.add("cameraPositionInertia", {
        type: "number",
        default: 0,
        title: "Camera Position Inertia",
        description: 'Controls how quickly the camera snaps into position when following the player. Lower values give more "weight" to the camera. Set to 0.0 to disable any inertia.'
    }),
    UranusControllerThirdPerson.attributes.add("cameraPivotInertia", {
        type: "number",
        default: 25,
        title: "Camera Pivot Inertia",
        description: 'Controls how quickly the camera snaps its point of view when following the player. Lower values give more "weight" to the camera. Set to 0.0 to disable any inertia.'
    }),
    UranusControllerThirdPerson.attributes.add("lockPlayerPosition", {
        type: "boolean",
        default: !1,
        title: "Lock Player Position",
        description: "If selected player movement will be locked in all axis."
    }),
    UranusControllerThirdPerson.attributes.add("lockCameraPosition", {
        type: "boolean",
        default: !1,
        title: "Lock Camera Position",
        description: "If selected camera movement will be locked in all axis."
    }),
    UranusControllerThirdPerson.attributes.add("lockPlayerToCameraRotation", {
        type: "boolean",
        default: !1,
        title: "Lock Player To Camera Rotation",
        description: "If selected the player will follow the camera rotation always, even stationary."
    }),
    UranusControllerThirdPerson.attributes.add("lockCameraToPlayerRotation", {
        type: "boolean",
        default: !1,
        title: "Lock Camera To Player Rotation",
        description: "If selected the camera will follow the player rotation when the player is moving."
    }),
    UranusControllerThirdPerson.attributes.add("camera", {
        type: "entity",
        title: "Camera",
        description: "The camera entity used for this player controller."
    }),
    UranusControllerThirdPerson.attributes.add("model", {
        type: "entity",
        title: "Model",
        description: "The model entity used for this player controller."
    }),
    UranusControllerThirdPerson.attributes.add("avatarPivot", {
        type: "entity",
        title: "Avatar Pivot",
        description: "The avatar pivot entity used for this player controller."
    }),
    UranusControllerThirdPerson.attributes.add("forwardEntity", {
        type: "entity",
        title: "Forward Entity",
        description: "You can optionally provide an entity to be used to calculate the forward direction when applying input to the controller. If no entity is provided then the model forward direction is used."
    }),
    UranusControllerThirdPerson.attributes.add("mouseSpeed", {
        type: "number",
        default: 5,
        title: "Mouse Sensitivity"
    }),
    UranusControllerThirdPerson.attributes.add("touchSpeed", {
        type: "number",
        default: 30,
        title: "Touch Sensitivity"
    }),
    UranusControllerThirdPerson.attributes.add("touchSprintThreshold", {
        type: "number",
        default: .9,
        title: "Touch Sprint Threshold",
        description: "Set the threshold at which the touch joystick will switch from walking to sprinting."
    }),
    UranusControllerThirdPerson.attributes.add("touchRadius", {
        title: "Touch Radius",
        description: "The radius of the virtual joystick.",
        type: "number",
        default: 50
    }),
    UranusControllerThirdPerson.attributes.add("cameraWaterOffset", {
        title: "Camera Water Offset",
        description: "If a value > 0 is provided the camera will stay above the water surface by that offset.",
        type: "number",
        default: 0
    }),
    UranusControllerThirdPerson.attributes.add("doubleTapInterval", {
        title: "Double Tap Interval",
        description: "The time in milliseconds between two taps of the right virtual joystick for a double tap to register. A double tap will trigger a jump. Set to 0.0 to disable double tapping for jumping.",
        type: "number",
        default: 300
    }),
    UranusControllerThirdPerson.attributes.add("mousePointerLock", {
        type: "boolean",
        default: !0,
        title: "Mouse Pointer Lock",
        description: "If selected the mouse pointer will be locked on click."
    }),
    UranusControllerThirdPerson.attributes.add("horizontalFov", {
        type: "boolean",
        default: !1,
        title: "Horizontal Fov",
        description: "Control the horizontal fov property of the player camera."
    }),
    UranusControllerThirdPerson.attributes.add("landscapeFov", {
        type: "number",
        default: 45,
        title: "Landscape Fov",
        description: "The camera field of view in landscape viewports."
    }),
    UranusControllerThirdPerson.attributes.add("portraitFov", {
        type: "number",
        default: 45,
        title: "Portrait Fov",
        description: "The camera field of view in portrait viewports."
    }),
    UranusControllerThirdPerson.attributes.add("gamepadSpeed", {
        type: "number",
        default: 150,
        title: "Gamepad Sensitivity"
    }),
    UranusControllerThirdPerson.attributes.add("gamepadSprintThreshold", {
        type: "number",
        default: .9,
        title: "Gamepad Sprint Threshold",
        description: "Set the threshold at which the gamepad joystick will switch from walking to sprinting."
    }),
    UranusControllerThirdPerson.attributes.add("deadZoneLow", {
        title: "Low Dead Zone",
        description: "Radial thickness of inner dead zone of pad's joysticks. This dead zone ensures that all pads report a value of 0 for each joystick axis when untouched.",
        type: "number",
        min: 0,
        max: .4,
        default: .2
    }),
    UranusControllerThirdPerson.attributes.add("deadZoneHigh", {
        title: "High Dead Zone",
        description: "Radial thickness of outer dead zone of pad's joysticks. This dead zone ensures that all pads can reach the -1 and 1 limits of each joystick axis.",
        type: "number",
        min: 0,
        max: .4,
        default: .2
    }),
    UranusControllerThirdPerson.attributes.add("footstepsParticles", {
        title: "Footsteps Particles",
        description: "Reference an entity with a particlesystem component to fire automatically on certain footstep actions (start moving, jumping, landing, running).",
        type: "entity"
    }),
    UranusControllerThirdPerson.attributes.add("gender", {
        type: "string",
        default: "none",
        enum: [{
            None: "none"
        }, {
            Male: "male"
        }, {
            Female: "female"
        }],
        title: "Gender",
        description: "The gender of the player model, used by the sound selector."
    }),
    UranusControllerThirdPerson.attributes.add("customInputEvents", {
        title: "Custom Input Events",
        description: "Add custom input events to drive player input using app wide events. Requires application restart.",
        type: "json",
        array: !0,
        schema: [{
            name: "key",
            type: "string",
            default: "jumpRequest"
        }, {
            name: "event",
            type: "string",
            default: "player:jump"
        }]
    }),
    UranusControllerThirdPerson.avatarsCollection = void 0,
    UranusControllerThirdPerson.prototype.initialize = function () {
        this.vec = new pc.Vec3,
            this.vec2 = new pc.Vec3,
            this.vec3 = new pc.Vec3,
            this.vec4 = new pc.Vec3,
            this.vec5 = new pc.Vec3,
            this.vec2D = new pc.Vec2,
            this.quat = new pc.Quat,
            this.grounded = !0,
            this.groundedCount = 0,
            this.groundPoint = new pc.Vec3,
            this.groundNormal = new pc.Vec3,
            this.isMoving = !1,
            this.wasMoving = !1,
            this.wasOnGround = !1,
            this.canClimb = !1,
            this.speed = 0,
            this.animationBlend = 0,
            this.currentRotation = 0,
            this.targetMantlePosition = new pc.Vec3,
            this.mantleMaxTime = 1.25,
            this.mantleEndTimeout = .15,
            this.endMantling = !1,
            this.jumpSingleBoost = 1,
            this.cameraTargetPos = new pc.Vec3,
            this.cameraCurrentPos = new pc.Vec3,
            this.cameraPosVelocity = new pc.Vec3,
            this.cameraTargetPivot = new pc.Vec3,
            this.cameraCurrentPivot = new pc.Vec3,
            this.cameraPivotVelocity = new pc.Vec3,
            this.particlesPivot = new pc.Vec3,
            this.verticalVelocity = 0,
            this.terminalVelocity = -53,
            this.wasOnGroundTimeout = .2,
            this.footParticlesTimeout = .3,
            this.jumpTimeoutDelta = this.jumpTimeout,
            this.jumpUpTimeoutDelta = this.jumpUpTimeout,
            this.mantleTimeoutDelta = 0,
            this.mantleEndTimeoutDelta = 0,
            this.fallTimeoutDelta = this.fallTimeout,
            this.flyFallTimeoutDelta = this.flyFallTimeout,
            this.wasOnGroundTimeoutDelta = this.wasOnGroundTimeout,
            this.footParticlesTimeoutDelta = this.footParticlesTimeout,
            this.jetPackTimeoutDelta = 0,
            this.initialLinearFactor = this.entity.rigidbody.linearFactor.clone(),
            this.floatingLinearFactor = this.initialLinearFactor.clone(),
            this.floatingLinearFactor.y = 0,
            this.activeGravity = this.gravity,
            this.initialFriction = this.entity.rigidbody.friction,
            this.floatingFriction = 0,
            this.feetOffset = this.entity.collision.height / 2 + this.entity.collision.linearOffset.y,
            this.cameraTargetPitch = 0,
            this.gamepads = navigator.getGamepads ? navigator.getGamepads() : [],
            UranusControllerThirdPerson.avatarsCollection || (UranusControllerThirdPerson.avatarsCollection = this.app.root.findByTag("avatar-model"));
        const t = this.vec.copy(this.entity.forward).mulScalar(-1);
        this.cameraTargetYaw = (Math.atan2(t.x, t.z) * pc.math.RAD_TO_DEG + 360) % 360,
            this.cameraRayEnd = this.entity.findByName("RaycastEndPoint"),
            this.firstUpdate = !0,
            this.remoteEnableCooldown = pc.now(),
            this.isRemotePlayer = this.entity.tags.has("uranus-multiplayer-remote-player") || this.entity.tags.has("uranus-override-control"),
            this.isRemotePlayer ? this.entity.script.ccd && (this.entity.script.ccd.enabled = !1) : (this.uranusMultiplayerColyseusPlayer = this.entity.script.uranusMultiplayerColyseusPlayer,
                this.entity.script.ccd && (this.entity.script.ccd.enabled = !0),
                this.customInputEvents.forEach((t => {
                    t.key && t.event && this.entity.on(t.event, (() => {
                        this.input[t.key] = !0
                    }
                    ))
                }
                )),
                this.uranusControllerPlayerInteract = this.entity.findScript("uranusControllerPlayerInteract"),
                this.canInteract = this.uranusControllerPlayerInteract?.enabled),
            this.footstepsParticles && (this.isRemotePlayer ? (this.footstepsParticles.enabled = !1,
                this.footstepsParticles = this.footstepsParticles.clone(),
                this.app.root.addChild(this.footstepsParticles),
                this.footstepsParticles.enabled = !0) : this.footstepsParticles.reparent(this.app.root),
                this.footstepsParticlesSystem = this.footstepsParticles.findComponent("particlesystem"),
                this.footstepsParticlesSystem.rebuild()),
            this.entity.script.uranusPathfinderAgent && (this.uranusPathfinderAgent = this.entity.script.uranusPathfinderAgent),
            this.networkState = void 0,
            this.remoteState = void 0,
            this.input = {
                x: 0,
                y: 0,
                cameraX: 0,
                cameraY: 0,
                jump: !1,
                sprint: !1,
                swim: !1,
                fly: !1,
                climb: !1,
                interact: !1
            },
            this.lockAnimation = !1,
            this.prepare(),
            this.attachInputHandlers(),
            this.on("destroy", (function () {
                this.footstepsParticles && this.footstepsParticles.destroy()
            }
            )),
            this.isRemotePlayer || (UranusControllerThirdPerson.api = this,
                this.app.fire("UranusControllerThirdPerson:ready")),
            this.entity.on("uranusMultiplayerColyseusPlayer:avatarUrl", this.loadAvatar, this)
    }
    ,
    UranusControllerThirdPerson.prototype.prepare = function () {
        if (this.app.mouse.disableContextMenu(),
            this.remoteState = {
                currentPos: new pc.Vec3,
                targetPos: new pc.Vec3,
                currentAngleY: 0,
                targetAngleY: 0,
                currentSpeed: 0,
                targetSpeed: 0
            },
            !1 === this.playerToPlayerCollision && (this.entity.rigidbody.group = 0,
                this.entity.rigidbody.group = pc.BODYGROUP_USER_1,
                this.entity.rigidbody.mask = 0,
                this.entity.rigidbody.mask |= pc.BODYGROUP_STATIC,
                this.entity.rigidbody.mask |= pc.BODYGROUP_DYNAMIC,
                this.entity.rigidbody.mask |= pc.BODYGROUP_KINEMATIC,
                this.entity.rigidbody.mask |= pc.BODYGROUP_ENGINE_1,
                this.entity.rigidbody.mask |= pc.BODYGROUP_TRIGGER,
                this.entity.rigidbody.mask |= pc.BODYGROUP_ENGINE_2,
                this.entity.rigidbody.mask |= pc.BODYGROUP_ENGINE_3,
                this.excludeRaycastGroup = pc.BODYGROUP_USER_1),
            this.isRemotePlayer) {
            this.entity.findByTag("uranus-multiplayer-local-player-only").forEach((t => t.enabled = !1))
        } else
            this.camera && (this.camera.enabled = !0),
                this.networkState = {
                    x: 0,
                    y: 0,
                    z: 0,
                    angleY: 0,
                    speed: 0,
                    fly: !1,
                    climb: !1
                }

        if (!this.hips) {
            this.hips = this.entity.findByName("mixamorig:Hips");
        }
        this.hipsStartPosition = this.hips ? this.hips.getLocalPosition().clone() : pc.Vec3.ZERO;
        this.prepareAnimComponent();
    }
    ,
    UranusControllerThirdPerson.prototype.getNetworkState = function () {
        const t = this.input;
        if (!t)
            return;
        const e = this.entity.getPosition();
        return this.networkState = {
            x: e.x,
            y: e.y,
            z: e.z,
            ay: this.currentRotation,
            s: this.animationBlend
        },
            this.jumpSpeed > 0 && (this.networkState.j = t.jump),
            this.canFly && (this.networkState.f = t.fly),
            this.canMantle && (this.networkState.c = t.climb),
            this.networkState.jt = this.isUsingJetPack,
            this.networkState
    }
    ,
    UranusControllerThirdPerson.prototype.syncState = function (t) {
        this.remoteState.targetPos.set(t.x, t.y, t.z),
            !this.entity.enabled && pc.now() - this.remoteEnableCooldown >= 1e3 && (this.remoteState.currentPos.copy(this.remoteState.targetPos),
                this.entity.enabled = !0),
            t.angleY ? (this.remoteState.targetAngleY = t.angleY,
                this.currentRotation = t.angleY,
                this.remoteState.targetSpeed = t.speed,
                this.jumpSpeed > 0 && (this.input.jump = t.jump),
                this.canFly && (this.input.fly = t.fly),
                this.canMantle && (this.input.climb = t.climb)) : (this.remoteState.targetAngleY = t.ay,
                    this.currentRotation = t.ay,
                    this.remoteState.targetSpeed = t.s,
                    this.jumpSpeed > 0 && (this.input.jump = t.j),
                    this.canFly && (this.input.fly = t.f),
                    this.canMantle && (this.input.climb = t.c),
                    this.isUsingJetPack = t.jt)
    }
    ,
    UranusControllerThirdPerson.animationAssets = void 0,
    UranusControllerThirdPerson.prototype.loadAvatar = async function (t) {
        if (!t || this.avatarUrl === t)
            return !1;
        this.avatarUrl = t;
        const e = UranusControllerThirdPerson.avatarsCollection?.find((e => e.name === t));
        if (!e)
            return !1;
        const i = e.clone();
        i.tags.has("model-gender") ? this.gender = i.tags.has("model-gender-female") ? "female" : "male" : this.gender = "none";
        const o = this.model.findByTag("bone-reparent");
        for (const t of o) {
            const e = t.tags.list().find((t => 0 === t.indexOf("bone-reparent-")))?.replace("bone-reparent-", "");
            if (!e)
                continue;
            const o = i.findByName(e);
            if (!o)
                continue;
            o.script?.uranusControllerPlayerBoneAttach && o.script.uranusControllerPlayerBoneAttach.initialize();
            const r = !0 === t.tags.has("bone-reparent-child");
            r && (t.parent.inventoryChildren || (t.parent.inventoryChildren = []),
                -1 === t.parent.inventoryChildren.indexOf(t) && t.parent.inventoryChildren.push(t),
                t.parent.on("uranusControllerNetworkObject:enabled:updated", (function (e) {
                    t.inventoryParentStateSet = !0,
                        t.enabled = e
                }
                ), this)),
                t.reparent(o),
                o.setLocalPosition(0, 0, 0),
                o.setLocalEulerAngles(0, 0, 0),
                r && !t.inventoryParentStateSet ? t.enabled = !1 : t.enabled = !0
        }
        this.avatarPivot.addChild(i),
            this.entity.anim.rootBone = i;
        let r = UranusControllerThirdPerson.animationAssets;
        r || (r = UranusControllerThirdPerson.animationAssets = this.entity.anim.animationAssets);
        for (let t in r) {
            const e = r[t]
                , i = this.app.assets.get(e.asset);
            if (!i)
                continue;
            if (!1 === i.tags.has("anim-gender"))
                continue;
            const o = this.app.assets.findByTag(`anim-gender-${this.gender}`).find((t => t.name === i.name));
            o && (o.ready((() => {
                this.entity.anim && this.entity.anim.assignAnimation(t.split(":")[1], o.resource)
            }
            )),
                this.app.assets.load(o))
        }
        i.findComponents("render").forEach((t => t.enabled = !0)),
            i.enabled = !0,
            !this.isRemotePlayer && this.uranusMultiplayerColyseusPlayer && this.uranusMultiplayerColyseusPlayer.sendToRoom("playerUpdate", {
                avatarUrl: t
            });
        for (let t = this.avatarPivot.children.length - 2; t >= 0; t--)
            this.avatarPivot.children[t].destroy();
        return this.entity.fire("uranusMultiplayerColyseusPlayer:onLoadAvatar"),
            !0
    }
    ,
    UranusControllerThirdPerson.prototype.hasInput = function () {
        return !this.isRemotePlayer && (!this.uranusPathfinderAgent || !this.uranusPathfinderAgent.enabled || this.uranusPathfinderAgent.enabled && !this.uranusPathfinderAgent.isMoving)
    }
    ,
    UranusControllerThirdPerson.prototype.attachInputHandlers = function () {
        if (!1 === this.hasInput())
            return;
        this.onCameraFov(),
            this.on("attr:horizontalFov", this.onCameraFov),
            this.on("attr:landscapeFov", this.onCameraFov),
            this.on("attr:portraitFov", this.onCameraFov);
        const t = this.onCameraFov.bind(this);
        if (window.addEventListener("resize", t, !1),
            this.on("destroy", (function () {
                window.removeEventListener("resize", t, !1)
            }
            ), this),
            this.app.mouse) {
            const t = this.onInputMouseUp.bind(this);
            this.app.mouse.on("mousemove", this.onInputMouseMove, this),
                this.app.mouse.on("mousedown", this.onInputMouseDown, this),
                this.app.mouse.on("mouseup", t, this),
                window.addEventListener("mouseout", t, !1),
                this.on("destroy", (function () {
                    this.app.mouse.off("mousemove", this.onInputMouseMove, this),
                        this.app.mouse.off("mousedown", this.onInputMouseDown, this),
                        this.app.mouse.off("mouseup", this.onInputMouseUp, this),
                        window.removeEventListener("mouseout", t, !1)
                }
                ), this)
        }
        if (this.app.touch) {
            const t = this.app.graphicsDevice.canvas;
            this.tounchInput = {
                leftStick: {
                    identifier: -1,
                    center: new pc.Vec2,
                    pos: new pc.Vec2
                },
                rightStick: {
                    identifier: -1,
                    center: new pc.Vec2,
                    pos: new pc.Vec2
                }
            };
            const e = this.onInputTouchStart.bind(this)
                , i = this.onInputTouchMove.bind(this)
                , o = this.onInputTouchEnd.bind(this);
            this.entity.fire("UranusControllerThirdPerson:touchInput:enable"),
                t.addEventListener("touchstart", e, !1),
                t.addEventListener("touchmove", i, !1),
                t.addEventListener("touchend", o, !1),
                t.addEventListener("touchcancel", o, !1),
                this.on("destroy", (function () {
                    t.removeEventListener("touchstart", e, !1),
                        t.removeEventListener("touchmove", i, !1),
                        t.removeEventListener("touchend", o, !1),
                        t.removeEventListener("touchcancel", o, !1)
                }
                ), this)
        }
        this.remappedPos = new pc.Vec2,
            this.gamepadInput = {
                leftStick: {
                    pos: new pc.Vec2
                },
                rightStick: {
                    pos: new pc.Vec2
                }
            },
            this.entity.on("vr:controller:move", this.onInputGamepadMove, this),
            this.entity.on("vr:controller:turn", this.onInputGamepadTurn, this)
    }
    ,
    UranusControllerThirdPerson.prototype.onCameraFov = function () {
        this.camera && (this.camera.camera.horizontalFov = this.horizontalFov,
            this.app.graphicsDevice.width >= this.app.graphicsDevice.height ? this.camera.camera.fov = this.landscapeFov : this.camera.camera.fov = this.portraitFov)
    }
    ,
    UranusControllerThirdPerson.prototype.onInputMouseMove = function (t) {
        if (pc.Mouse.isPointerLocked() || !this.mousePointerLock && this.isMouseLeftPressed) {
            const e = this.input;
            e.cameraX = -this.mouseSpeed * t.dx,
                e.cameraY = -this.mouseSpeed * t.dy
        }
    }
    ,
    UranusControllerThirdPerson.prototype.onInputMouseDown = function (t) {
        this.entity.enabled && !this.lockCameraPosition && t.element === this.app.graphicsDevice.canvas && (t.button === pc.MOUSEBUTTON_LEFT && (this.isMouseLeftPressed = !0),
            this.mousePointerLock && this.app.mouse.enablePointerLock())
    }
    ,
    UranusControllerThirdPerson.prototype.onInputMouseUp = function (t) {
        t.button === pc.MOUSEBUTTON_LEFT && (this.isMouseLeftPressed = !1)
    }
    ,
    UranusControllerThirdPerson.prototype.onInputKeyboard = function () {

        const t = this.app.keyboard
            , e = this.input;
        (t.isPressed(pc.KEY_A) || t.isPressed(pc.KEY_LEFT)) && (e.x -= 1),
            (t.isPressed(pc.KEY_D) || t.isPressed(pc.KEY_RIGHT)) && (e.x += 1),
            (t.isPressed(pc.KEY_W) || t.isPressed(pc.KEY_UP)) && (e.y += 1),
            (t.isPressed(pc.KEY_S) || t.isPressed(pc.KEY_DOWN)) && (e.y -= 1),
            this.lockPlayerPosition ? e.jumpRequest = t.isPressed(pc.KEY_SPACE) : t.isPressed(pc.KEY_SPACE) && (e.jumpRequest = !0);
        const i = t.isPressed(pc.KEY_SHIFT);
        e.sprint = this.sprintByDefault ? !i : i
    }
    ,
    UranusControllerThirdPerson.prototype.onInputTouchStart = function (t) {
        t.preventDefault();
        const e = this.app.graphicsDevice
            , i = e.canvas
            , o = e.width / i.clientWidth
            , r = e.height / i.clientHeight
            , s = this.tounchInput
            , n = t.changedTouches;
        for (let t = 0; t < n.length; t++) {
            const e = n[t];
            if (e.pageX <= i.clientWidth / 2 && -1 === s.leftStick.identifier)
                s.leftStick.identifier = e.identifier,
                    s.leftStick.center.set(e.pageX, e.pageY),
                    s.leftStick.pos.set(0, 0),
                    this.entity.fire("UranusControllerThirdPerson:leftJoystick:enable", e.pageX * o, e.pageY * r);
            else if (e.pageX > i.clientWidth / 2 && -1 === s.rightStick.identifier) {
                s.rightStick.identifier = e.identifier,
                    s.rightStick.center.set(e.pageX, e.pageY),
                    s.rightStick.pos.set(0, 0);
                var a = Date.now();
                if (this.doubleTapInterval > 0 && a - this.lastRightTap < this.doubleTapInterval) {
                    this.input.jumpRequest = !0
                }
                this.lastRightTap = a,
                    this.entity.fire("UranusControllerThirdPerson:rightJoystick:enable", e.pageX * o, e.pageY * r)
            }
        }
    }
    ,
    UranusControllerThirdPerson.prototype.onInputTouchMove = function (t) {
        t.preventDefault();
        const e = this.app.graphicsDevice
            , i = e.canvas
            , o = e.width / i.clientWidth
            , r = e.height / i.clientHeight
            , s = this.tounchInput
            , n = t.changedTouches;
        for (let t = 0; t < n.length; t++) {
            const e = n[t];
            e.identifier === s.leftStick.identifier ? (s.leftStick.pos.set(e.pageX, e.pageY),
                s.leftStick.pos.sub(s.leftStick.center),
                s.leftStick.pos.scale(1 / this.touchRadius),
                this.entity.fire("UranusControllerThirdPerson:leftJoystick:move", e.pageX * o, e.pageY * r)) : e.identifier === s.rightStick.identifier && (s.rightStick.pos.set(e.pageX, e.pageY),
                    s.rightStick.pos.sub(s.rightStick.center),
                    s.rightStick.pos.scale(1 / this.touchRadius),
                    this.entity.fire("UranusControllerThirdPerson:rightJoystick:move", e.pageX * o, e.pageY * r))
        }
    }
    ,
    UranusControllerThirdPerson.prototype.onInputTouchEnd = function (t) {
        t.preventDefault();
        const e = this.tounchInput
            , i = t.changedTouches;
        for (let t = 0; t < i.length; t++) {
            const o = i[t];
            o.identifier === e.leftStick.identifier ? (e.leftStick.identifier = -1,
                e.leftStick.pos.copy(pc.Vec3.ZERO),
                this.entity.fire("UranusControllerThirdPerson:leftJoystick:disable")) : o.identifier === e.rightStick.identifier && (e.rightStick.identifier = -1,
                    e.rightStick.pos.copy(pc.Vec3.ZERO),
                    this.entity.fire("UranusControllerThirdPerson:rightJoystick:disable"))
        }
    }
    ,
    UranusControllerThirdPerson.prototype.onInputTouch = function () {
        const t = this.tounchInput;
        if (!t)
            return;
        const e = this.input
            , i = t.leftStick.pos;
        if (!1 === i.equals(pc.Vec2.ZERO)) {
            e.x = i.x,
                e.y = -i.y;
            const t = i.length();
            e.sprint = t > this.touchSprintThreshold
        }
        const o = t.rightStick.pos;
        !1 === o.equals(pc.Vec2.ZERO) && (e.cameraX = -this.touchSpeed * o.x,
            e.cameraY = -this.touchSpeed * o.y)
    }
    ,
    UranusControllerThirdPerson.prototype.onInputGamepadMove = function (t, e) {
        this.gamepadInput.leftStick.pos.set(t || 0, e ? -e : 0)
    }
    ,
    UranusControllerThirdPerson.prototype.onInputGamepadTurn = function (t, e) {
        this.gamepadInput.rightStick.pos.set(t || 0, e || 0)
    }
    ,
    UranusControllerThirdPerson.prototype.onInputGamepad = function () {
        const t = this.gamepadInput
            , e = this.input
            , i = this.gamepads;
        for (var o = 0; o < i.length; o++) {
            const r = i[o];
            r && ("standard" === r.mapping && r.axes.length >= 4 && (t.leftStick.pos.set(r.axes[0], r.axes[1]),
                t.rightStick.pos.set(r.axes[2], r.axes[3])),
                this.lockPlayerPosition ? e.jumpRequest = r.buttons[0].pressed : r.buttons[0].pressed && (e.jumpRequest = !0))
        }
        !1 === t.leftStick.pos.equals(pc.Vec2.ZERO) && (this.applyRadialDeadZone(t.leftStick.pos, this.remappedPos, this.deadZoneLow, this.deadZoneHigh),
            e.x = this.remappedPos.x,
            e.y = -this.remappedPos.y,
            e.sprint = this.remappedPos.length() > this.gamepadSprintThreshold,
            t.leftStick.pos.copy(pc.Vec2.ZERO)),
            !1 === t.rightStick.pos.equals(pc.Vec2.ZERO) && (this.applyRadialDeadZone(t.rightStick.pos, this.remappedPos, this.deadZoneLow, this.deadZoneHigh),
                e.cameraX = -this.gamepadSpeed * this.remappedPos.x,
                e.cameraY = -this.gamepadSpeed * this.remappedPos.y,
                t.rightStick.pos.copy(pc.Vec2.ZERO))
    }
    ,
    UranusControllerThirdPerson.prototype.applyRadialDeadZone = function (t, e, i, o) {
        const r = t.length();
        if (r > i) {
            var s = 1 - o - i
                , n = Math.min(1, (r - i) / s) / r;
            e.copy(t).scale(n)
        } else
            e.set(0, 0)
    }
    ,
    UranusControllerThirdPerson.prototype.resetInput = function () {
        const t = this.input;
        t.x = 0,
            t.y = 0,
            t.cameraX = 0,
            t.cameraY = 0
    }
    ,
    UranusControllerThirdPerson.prototype.update = function (t) {
        const e = this.hasInput();
        e && (this.onInputKeyboard(),
            this.onInputTouch(),
            this.onInputGamepad());
        const i = this.input;
        let o = i.jumpRequest;
        e && (this.entity.fire("UranusControllerThirdPerson:postInputUpdate", i),
            this.lockPlayerPosition && (i.x = 0,
                i.y = 0,
                i.jumpRequest = !1)),
            this.checkJumpAndGravity(t),
            this.checkGround(t),
            this.checkParticles(t),
            e && (this.checkInteract(t),
                this.checkClimb(),
                this.applyMovement(t)),
            e && this.lockPlayerPosition && (i.jumpRequest = o)
    }
    ,
    UranusControllerThirdPerson.prototype.postUpdate = function (t) {
        const e = this.hasInput();
        !e || !this.firstUpdate && this.lockCameraPosition || this.rotateCamera(t),
            e ? this.resetInput() : this.applyRemoteMovement(t),
            this.firstUpdate = !1;


        if (this.hips) {
            const pos = this.hips.getLocalPosition().clone();
            vecpos = new pc.Vec3(pos.x, pos.y, this.hipsStartPosition.z ?? 0);

            //this.hips.setLocalPosition(vecpos);
            this.hips.setLocalPosition(vecpos);
        }
    }
    ,
    UranusControllerThirdPerson.prototype.hasAnimation = function () {
        return this.entity.anim && !this.lockAnimation
    }
    ,
    UranusControllerThirdPerson.prototype.checkParticles = function (t) {
        if (!UranusGraphicsSettings?.api?.activePreset.playerParticles)
            return;
        const e = this.input
            , i = this.footstepsParticlesSystem
            , o = this.entity;
        if (!1 !== o.uranusPlayerVisible && i && i.enabled) {
            const r = this.footstepsParticles;
            if ((this.isMoving && !this.wasMoving && this.grounded || this.isMoving && this.grounded && e.sprint && Math.random() >= .99 || e.jump && (this.wasOnGround || this.jumpSingleBoost > 1) || this.grounded && !this.prevGrounded && !e.jump && !e.climb && o.rigidbody.linearVelocity.lengthSq() >= .1) && this.footParticlesTimeoutDelta <= 0 && (this.jumpSingleBoost ? (this.particlesPivot.copy(o.getPosition()),
                this.particlesPivot.y -= this.feetOffset) : this.particlesPivot.copy(this.groundPoint),
                i.reset(),
                i.play(),
                this.footParticlesTimeoutDelta = this.footParticlesTimeout),
                i.isPlaying()) {
                const t = o.getPosition();
                r.setPosition(t.x, this.particlesPivot.y + this.groundedOffset / 2, t.z)
            }
            this.footParticlesTimeoutDelta > 0 && (this.footParticlesTimeoutDelta -= t)
        }
    }
    ,
    UranusControllerThirdPerson.prototype.checkJumpAndGravity = function (t) {
        const e = this.input
            , i = this.hasAnimation();
        let o = !1;
        const r = this.uranusItemJetpack
            , s = r?.canUseJetpack()
            , n = this.isRemotePlayer
            , a = this.entity.anim
            , l = this.entity.rigidbody;
        !1 === l.linearFactor.equals(this.initialLinearFactor) && (l.linearFactor = this.initialLinearFactor),
            i && (n || (a.setBoolean("Fly", !1),
                a.setBoolean("Climb", !1),
                a.setBoolean("Jetpack", !1)));
        const h = this.grounded || this.wasOnGroundTimeoutDelta <= this.wasOnGroundTimeout;
        if (!this.isUsingJetPack && (e.jumpRequest && this.jumpSpeed > 0 && this.jumpTimeoutDelta <= 0 && h || n && e.jump && this.jumpTimeoutDelta <= 0) && (e.jump = !0,
            e.swim = !1,
            this.jumpTimeoutDelta = this.jumpTimeout,
            this.jumpUpTimeoutDelta = this.jumpUpTimeout),
            this.grounded && !this.forceSwim ? (i && (a.setBoolean("Jump", !1),
                a.setBoolean("FreeFall", !1),
                a.setBoolean("Swim", !1)),
                this.fallTimeoutDelta = this.fallTimeout,
                this.verticalVelocity < 0 && (this.verticalVelocity = 0),
                e.fly = !1) : (this.wasOnGroundTimeoutDelta += t,
                    this.canMantle && this.canClimb && e.jumpRequest && !e.climb && (this.jumpTimeoutDelta <= 0 || this.jumpTimeout - this.jumpTimeoutDelta >= .3) && (e.climb = !0,
                        e.jump = !1,
                        this.mantleTimeoutDelta = this.mantleMaxTime),
                    this.fallTimeoutDelta >= 0 ? this.fallTimeoutDelta -= t : !e.fly && this.verticalVelocity <= 1 && this.jumpSingleBoost <= 1 && i && a.setBoolean("FreeFall", !0),
                    this.canFly && e.jumpRequest && (e.fly = !0,
                        e.jump = !1,
                        this.jumpUpTimeoutDelta = 0,
                        this.jumpTimeoutDelta = 0,
                        this.flyFallTimeoutDelta = this.flyFallTimeout,
                        o = !0),
                    s || (e.jumpRequest = !1)),
            e.climb) {
            this.mantleTimeoutDelta -= t,
                e.jumpRequest = !1;
            let o = 0;
            if (this.uranusControllerNetworkPlatform && (o = this.uranusControllerNetworkPlatform.linearVelocity.y,
                o > 0 && (this.targetMantlePosition.y += .5 * o)),
                !(this.entity.getPosition().y >= this.targetMantlePosition.y || this.mantleTimeoutDelta <= 0)) {
                const t = .0083;
                return this.verticalVelocity = -this.gravity * t + t * this.mantleRate * 100,
                    n || (this.isUsingJetPack = !1),
                    o > 0 && (this.verticalVelocity += o),
                    void (i && (n || a.setBoolean("Climb", !0)))
            }
            n || (e.climb = !1),
                this.endMantling = !0,
                this.mantleEndTimeoutDelta = this.mantleEndTimeout
        } else
            this.mantleTimeoutDelta = 0;
        if (this.endMantling) {
            if (this.mantleEndTimeoutDelta -= t,
                e.jumpRequest = !1,
                this.verticalVelocity = 0,
                !(this.mantleEndTimeoutDelta <= 0))
                return;
            this.endMantling = !1
        }
        if (n || (this.isUsingJetPack = !h && s && e.jumpRequest,
            this.isUsingJetPack ? this.jetPackTimeoutDelta += t : this.jetPackTimeoutDelta = 0),
            e.swim && !e.jump || e.fly || this.isUsingJetPack)
            if (this.wasOnGroundTimeoutDelta = 1 / 0,
                e.fly) {
                const r = l.linearVelocity
                    , s = this.vec2D.set(r.x, r.z).length() > 0;
                i && a.setBoolean("Fly", !0),
                    s ? (this.verticalVelocity = this.cameraTargetPitch * this.flyClimbRatio,
                        this.flyFallTimeoutDelta = this.flyFallTimeout) : (this.flyFallTimeoutDelta -= t,
                            this.flyFallTimeoutDelta <= 0 && (e.fly = !1)),
                    o && (this.verticalVelocity = 10)
            } else
                this.isUsingJetPack ? (e.jumpRequest = !1,
                    r && (this.verticalVelocity += t * r.getJetpackPower()),
                    !n && i && this.jetPackTimeoutDelta >= .01 && a.setBoolean("Jetpack", !0)) : (this.verticalVelocity = 0,
                        l.linearFactor = this.floatingLinearFactor,
                        i && a.setBoolean("Swim", !0));
        else if (this.verticalVelocity > this.terminalVelocity) {
            if (this.jumpUpTimeoutDelta >= 0) {
                this.jumpUpTimeoutDelta -= t;
                const e = this.jumpSpeed;
                this.verticalVelocity += t * e * 30,
                    this.verticalVelocity = pc.math.clamp(this.verticalVelocity, e / 2, e),
                    this.verticalVelocity *= this.jumpSingleBoost,
                    i && a.setBoolean("Jump", !0),
                    this.activeGravity = this.gravity / 2
            } else
                this.activeGravity -= 10 * t,
                    this.activeGravity = Math.max(this.activeGravity, this.gravity),
                    n || (e.jump = !1),
                    e.jumpRequest = !1,
                    this.jumpSingleBoost = 1;
            this.jumpTimeoutDelta >= 0 && (this.jumpTimeoutDelta -= t),
                this.grounded && !e.jump ? (this.verticalVelocity = -.75,
                    this.activeGravity = this.gravity / 2) : this.verticalVelocity += this.activeGravity * t
        }
    }
    ,
    UranusControllerThirdPerson.prototype.checkInteract = function () {
        if (this.canInteract) {
            const t = this.uranusControllerPlayerInteract
                , e = this.entity.getPosition()
                , i = this.vec.copy(e)
                , o = this.vec2.copy(i).add(this.camera.forward.mulScalar(t.interactDistance))
                , r = UranusUtilities.raycastFirstColliderTag(i, o, t.interactTag);
            t.interactWithEntity(r?.entity, !1)
        }
    }
    ,
    UranusControllerThirdPerson.prototype.checkClimb = function () {
        if (this.uranusControllerNetworkPlatformTarget = void 0,
            this.grounded || !this.canMantle)
            return;
        const t = this.vec5.copy(this.model.forward.mulScalar(1.1))
            , e = this.entity.getPosition()
            , i = this.entity.collision
            , o = this.vec.copy(e);
        o.y += i.linearOffset.y;
        const r = this.vec3.copy(o);
        o.y += i.height / 2 * 1.35,
            r.y += i.height / 2 * .75;
        const s = this.vec2.copy(o).add(t)
            , n = this.vec4.copy(r).add(t)
            , a = UranusUtilities.raycastFirstRigidbody(o, s, this.excludeRaycastGroup, this.entity)
            , l = UranusUtilities.raycastFirstRigidbody(r, n, this.excludeRaycastGroup, this.entity);
        this.canClimb = null === a && null !== l && l.entity !== this.entity;
        const h = l?.entity.script?.uranusControllerNetworkPlatform;
        h && (this.uranusControllerNetworkPlatformTarget = h),
            this.canClimb && (this.targetMantlePosition.copy(l.point),
                this.targetMantlePosition.y += this.entity.collision.height / 2)
    }
    ,
    UranusControllerThirdPerson.prototype.checkGround = function (t) {
        const e = this.input;
        this.entity.onNonValidSurface = !1,
            e.climb && this.uranusControllerNetworkPlatformTarget ? this.uranusControllerNetworkPlatform = this.uranusControllerNetworkPlatformTarget : this.uranusControllerNetworkPlatform = void 0;
        const i = this.entity.getPosition()
            , o = this.vec.copy(i)
            , r = this.entity.collision;
        o.y += r.linearOffset.y;
        const s = this.vec2.copy(o);
        s.y -= this.feetOffset + this.groundedOffset;
        const n = UranusUtilities.raycastFirstRigidbody(o, s, this.excludeRaycastGroup, this.entity);
        let a = null !== n && void 0 !== n.entity.rigidbody;
        const l = i.y <= this.waterLevel;
        if (this.forceSwim || l)
            return e.swim = !0,
                l && a && (e.swim = !1),
                void (this.grounded = !0);
        if (e.swim = !1,
            !e.fly && !e.swim && Math.abs(this.entity.rigidbody.linearVelocity.y) < .01 && (a = !0),
            this.wasOnGround = !a && this.grounded,
            this.wasOnGround && (this.wasOnGroundTimeoutDelta = 0),
            this.prevGrounded = this.grounded,
            this.grounded !== a && (this.groundedCount > 1 ? (this.groundedCount = 0,
                this.grounded = a) : this.groundedCount++),
            n) {
            this.groundPoint.copy(n.point),
                this.groundNormal.copy(n.normal);
            const t = n.entity.script?.uranusControllerNetworkPlatform;
            t && (this.uranusControllerNetworkPlatform = t),
                (t || n.entity.nonValidSurface) && (this.entity.onNonValidSurface = !0),
                this.entity.fire("UranusControllerThirdPerson:onRaycastGround", n),
                this.app.fire("UranusControllerThirdPerson:onRaycastGround", n, this.entity)
        }
        if (this.entity.anim) {
            let t = this.grounded;
            this.isUsingJetPack && (t = !1),
                this.entity.anim.setBoolean("Grounded", t)
        }
    }
    ,
    UranusControllerThirdPerson.prototype.applyMovement = function (t) {
        const e = .0083
            //const e = t
            , i = this.input
            , o = this.hasAnimation()
            , r = this.sprintSpeed > 0;
        let s, n = !1;
        r && i.sprint ? (s = this.sprintSpeed,
            n = !0) : (s = this.moveSpeed,
                n = !0),
            i.swim && (s = this.swimSpeed,
                n = !1),
            i.fly && (s = this.flySpeed,
                n = !1),
            this.jumpTimeoutDelta > 0 && this.jumpUpTimeoutDelta <= 0 && (s *= .75);
        const a = (0 !== i.x || 0 !== i.y) && !i.climb;
        a || (s = 0,
            n = !1);
        if (this.speed < s - .1 ? this.speed = pc.math.lerp(this.speed, 1 * s, t * this.speedChangeRate) : this.speed = s,
            this.animationBlend = r ? s / this.sprintSpeed : s / this.moveSpeed - .3,
            this.animationBlend < .01 && (this.animationBlend = 0),
            this.app.xr.active) {
            const t = this.model.getPosition()
                , e = this.vec.copy(this.model.getPosition()).add(this.camera.forward.scale(10));
            e.y = t.y,
                this.model.lookAt(e);
            const o = (Math.atan2(-i.x, i.y) * pc.math.RAD_TO_DEG + 360) % 360;
            this.model.rotate(0, o, 0),
                this.currentRotation = Math.atan2(this.camera.forward.x, this.camera.forward.z) * pc.math.RAD_TO_DEG % 360 + 180
        } else if (a || this.lockPlayerToCameraRotation) {
            let e;
            if (this.lockCameraToPlayerRotation)
                e = this.cameraTargetYaw,
                    this.wasMoving || (i.x = 0,
                        i.y = 1);
            else if (this.forwardEntity) {
                const t = this.vec4.copy(this.forwardEntity.forward).mulScalar(-1);
                e = (Math.atan2(t.x, t.z) * pc.math.RAD_TO_DEG + 360) % 360
            } else
                e = this.cameraTargetYaw;
            let o = this.clampAngle((Math.atan2(-i.x, i.y) * pc.math.RAD_TO_DEG + e) % 360);
            const r = this.rotationStep;
            r > 0 && (o = Math.floor(o / r) * r),
                this.currentRotation = this.clampAngle(pc.math.lerpAngle(this.currentRotation, o, this.rotationInertia * t));
            let s = o - this.currentRotation;
            s = Math.abs((s + 180) % 360 - 180),
                this.lockCameraToPlayerRotation ? this.wasMoving || (this.currentRotation = o) : s >= 150 && (this.currentRotation = o),
                this.model.setEulerAngles(0, this.currentRotation, 0),
                this.lockCameraToPlayerRotation && (this.cameraTargetYaw = this.currentRotation)
        }
        const l = this.model.forward
            , h = s > 0 ? 1 - (s - this.speed) / s : 0;
        if (this.grounded && a && h >= .8) {
            const t = this.groundNormal.dot(this.model.forward)
                , e = Math.acos(this.groundNormal.dot(this.model.up)) * pc.math.RAD_TO_DEG;
            t && e >= 20 && (this.speed += .075 * pc.math.clamp(e, 0, 60))
        }
        this.jumpTimeoutDelta <= 0 && (this.grounded || !a) ? this.entity.rigidbody.friction = this.initialFriction : this.entity.rigidbody.friction = this.floatingFriction,
            this.endMantling && (this.speed = 6.5);
        const c = this.vec2.copy(l.mulScalar(this.speed * e))
            , u = this.vec3.set(0, this.verticalVelocity * e, 0);
        c.add(u),
            c.mulScalar(100),
            this.uranusControllerNetworkPlatform && c.add(this.uranusControllerNetworkPlatform.linearVelocity),
            this.entity.rigidbody.linearVelocity = c;
        const d = this.speed / s;
        if (o) {
            const t = this.entity.anim;
            t.setFloat("speed", this.animationBlend),
                t.speed = n ? Math.max(d, .5) : 1
        }
        this.wasMoving = this.isMoving,
            this.isMoving = a
    }
    ,
    UranusControllerThirdPerson.prototype.applyRemoteMovement = function (t) {
        const e = this.remoteState
            , i = this.hasAnimation()
            , o = void 0 !== this.remoteInterpolationInertia ? this.remoteInterpolationInertia * t : 1;
        e.currentPos.lerp(e.currentPos, e.targetPos, o);
        const r = this.uranusControllerNetworkPlatform;
        if (r && !this.input.jump && this.jumpTimeoutDelta <= 0) {
            const t = r.linearVelocity;
            t && 0 !== t.y && (e.currentPos.y = r.entity.getPosition().y + .9)
        }
        e.currentAngleY = pc.math.lerpAngle(e.currentAngleY, e.targetAngleY, o),
            e.currentSpeed = pc.math.lerp(e.currentSpeed, e.targetSpeed, o),
            this.entity.rigidbody.teleport(e.currentPos),
            this.model.setEulerAngles(0, e.currentAngleY, 0);
        const s = this.sprintSpeed > 0;
        if (i) {
            let t = e.currentSpeed;
            s || (t = Math.max(t - .3, 0));
            const i = this.entity.anim;
            i.setFloat("speed", t),
                i.setBoolean("Climb", this.input.climb),
                i.setBoolean("Jetpack", this.isUsingJetPack)
        }
        this.wasMoving = this.isMoving,
            this.isMoving = e.currentSpeed >= .1,
            this.input.sprint = s && e.currentSpeed > .7
    }
    ,
    UranusControllerThirdPerson.prototype.rotateCamera = function (t) {
        const e = this.input
            , i = this.camera?.parent;
        if (!i)
            return;
        this.cameraTargetYaw += 2.5 * e.cameraX * .0083,
            this.cameraTargetPitch += 2.5 * e.cameraY * .0083,
            this.cameraTargetPitch = this.clampAngle(this.cameraTargetPitch, this.bottomClamp, this.topClamp),
            i.setEulerAngles(this.cameraTargetPitch, this.cameraTargetYaw, 0);
        const o = i.getPosition()
            , r = this.cameraRayEnd.getPosition()
            , s = UranusUtilities.raycastFirstRigidbody(o, r);
        let n;
        n = this.isColliderValid(s) ? this.vec.copy(s.point).lerp(s.point, o, t) : r;
        const a = this.cameraWaterOffset;
        a > 0 && n.y < this.waterLevel + a && (n.y = this.waterLevel + a),
            this.cameraTargetPos.copy(n),
            UranusUtilities.smoothDampVec3(this.cameraCurrentPos, this.cameraTargetPos, this.cameraPosVelocity, .01 * this.cameraPositionInertia, 1 / 0, t),
            this.camera.setPosition(this.cameraPositionInertia > 0 ? this.cameraCurrentPos : this.cameraTargetPos),
            this.cameraTargetPivot.copy(i.getPosition()),
            UranusUtilities.smoothDampVec3(this.cameraCurrentPivot, this.cameraTargetPivot, this.cameraPivotVelocity, .01 * this.cameraPivotInertia, 1 / 0, t),
            this.camera.lookAt(this.cameraPivotInertia > 0 ? this.cameraCurrentPivot : this.cameraTargetPivot)
    }
    ,
    UranusControllerThirdPerson.prototype.isColliderValid = function (t) {
        if (t) {
            const e = t.entity;
            return !(e === this.entity || e.parent === this.entity || !e.rigidbody || e.script && e.script.uranusControllerThirdPerson)
        }
        return !1
    }
    ,
    UranusControllerThirdPerson.prototype.clampAngle = function (t, e, i) {
        return t < -360 && (t += 360),
            t > 360 && (t -= 360),
            pc.math.clamp(t, e, i)
    }
    ,
    UranusControllerThirdPerson.prototype.executeJump = function (t) {
        if (this.jumpSingleBoost = t > 1 ? t : 1,
            this.input.jumpRequest = !0,
            this.jumpTimeoutDelta = 0,
            this.wasOnGroundTimeoutDelta = 0,
            this.hasAnimation()) {
            this.entity.anim.setBoolean("FreeFall", !1)
        }
    },

    UranusControllerThirdPerson.prototype.prepareAnimComponent = function () {

        const animPlayerStateGraphData = {
            layers: [
                {
                    name: 'unarmed',
                    states: [
                        {
                            name: 'START'
                        },
                        {
                            name: 'ANY'
                        },
                        {
                            name: 'idle'
                        },
                        {
                            name: 'walking'
                        },
                        {
                            name: 'running'
                        },
                        {
                            name: 'sprinting'
                        },
                        {
                            name: 'jump',
                            loop: false
                        },
                        {
                            name: 'climb',
                            loop: false,
                            speed: 1
                        },
                        {
                            name: 'teeter'
                        },
                        {
                            name: 'landing',
                            loop: false
                        },
                        {
                            name: "leftturn90",
                            loop: false
                        },
                        {
                            name: "rightturn90",
                            loop: false
                        }
                    ],
                    transitions: [
                        {
                            from: 'START',
                            to: 'idle',
                            time: 0.2,
                            priority: 0
                        }, {
                            from: 'idle',
                            to: 'walking',
                            time: 0.2,
                            priority: 0,
                            conditions: [{
                                parameterName: 'speed',
                                predicate: pc.ANIM_GREATER_THAN,
                                value: 0
                            }]
                        }, {
                            from: 'walking',
                            to: 'idle',
                            time: 0.2,
                            priority: 0,
                            conditions: [{
                                parameterName: 'speed',
                                predicate: pc.ANIM_LESS_THAN,
                                value: 0.01
                            }]
                        },
                        {
                            from: 'walking',
                            to: 'running',
                            time: 0.2,
                            priority: 0,
                            conditions: [{
                                parameterName: 'speed',
                                predicate: pc.ANIM_GREATER_THAN,
                                value: 0.99
                            }]
                        },
                        {
                            from: 'running',
                            to: 'walking',
                            time: 0.1,
                            priority: 0,
                            conditions: [{
                                parameterName: 'speed',
                                predicate: pc.ANIM_LESS_THAN,
                                value: 1
                            }]
                        },
                        {
                            from: 'idle',
                            to: 'running',
                            time: 0.2,
                            priority: 0,
                            conditions: [{
                                parameterName: 'speed',
                                predicate: pc.ANIM_GREATER_THAN_EQUAL_TO,
                                value: 1
                            }]
                        }

                    ]
                }
            ],
            parameters: {
                speed: {
                    name: 'speed',
                    type: pc.ANIM_PARAMETER_FLOAT,
                    value: 0
                },
                Jump: {
                    name: 'Jump',
                    type: pc.ANIM_PARAMETER_BOOLEAN,
                    value: false
                },
                Grounded: {
                    name: 'Grounded',
                    type: pc.ANIM_PARAMETER_BOOLEAN,
                    value: false
                },
                Fly: {
                    name: 'Fly',
                    type: pc.ANIM_PARAMETER_BOOLEAN,
                    value: false
                },
                FreeFall: {
                    name: 'FreeFall',
                    type: pc.ANIM_PARAMETER_BOOLEAN,
                    value: false
                },
                Swim: {
                    name: 'Swim',
                    type: pc.ANIM_PARAMETER_BOOLEAN,
                    value: false
                }



            }
        };


        // add an anim component to the entity
        this.entity.addComponent('anim', {
            activate: true,
            rootBone: this.hips && this.hips

        });

        this.entity.anim.loadStateGraph(animPlayerStateGraphData);

        const locomotionLayer = this.entity.anim.baseLayer,
            states = locomotionLayer.states,
            states_length = states.length;
        var i = 0;
        for (; i < states_length; i++) {
            const state = states[i];
            if (state !== "START" && state !== "END" && state !== "ANY") {
                var asset = this.app.assets.find(state);
                if (asset && asset.type === 'animation') {
                    if (asset.resource) {
                        locomotionLayer.assignAnimation(state, asset.resource);
                    } else {
                        // El asset aún no está cargado, cargarlo
                        asset.ready(function () {
                            locomotionLayer.assignAnimation(state, this.resource);
                        });
                        this.app.assets.load(asset);
                    }
                }
            }
        }
    };