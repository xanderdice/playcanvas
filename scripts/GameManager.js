/*PUT THIS SCRIPT ON ROOT ENTITY */
/*IMPORTANT:
//Put this script in ROOT entity
// 
//
THE PRINCIPAL SCENE MUST BE CALLED "game". 
THOS SCENE MUST BE SET AS DEAFULT OR AS CURRENT

//https://mebiusbox.github.io/contents/EffectTextureMaker/  SPRITE EFFECT
//https://basis.dev.jibencaozuo.com/                        BASIS
//cloth simulation https://playcanvas.com/project/691109/overview/cloth-simulation-demo
//ABLEDO TO NORMAL : https://www.smart-page.net/smartnormal/

//https://github.com/yandongCoder/circular-menu

//resolutions
//4320p (8K): 7680x4320
//2160p (4K): 3840x2160
//1440p (2K): 2560x1440
//1080p (HD): 1920x1080
//720p (HD): 1280x720
//480p (SD): 854x480
//360p (SD): 640x360
//240p (SD): 426x240 

LUTS:
/*https://greggman.github.io/LUT-to-PNG/
https://freshluts.com/most_popular_luts?page=4
https://o-l-l-i.github.io/lut-maker/

*/




/**
 * A namespace for managing timers.
 *
 * The `Timer` object provides methods and properties for creating and managing timers.
 * 
 * @namespace Timer
 */
var Timer = {};
Timer._timers = [];
Timer._timercounter = 0;

/**
 * Adds a new timer to the system.
 *
 * This function creates a timer with the specified time and a callback function that will be executed when the timer expires. The timer can be configured to execute only once or repeatedly.
 *
 * @param {number} time - The time in seconds until the timer expires.
 * @param {Function} callback - The function that will be executed when the timer expires. This function should accept the argument `(scope)`, where `scope` is the provided execution context.
 * @param {Object} [scope] - The context in which the callback function will be executed. If not provided, the default context will be `undefined`.
 * @param {boolean} [once=false] - If `true`, the timer will execute only once. If `false`, the timer will repeat according to the specified time.
 * @returns {string} A unique identifier for the timer. This identifier can be used to manage or cancel the timer later.
 */
Timer.addTimer = function (time, callback, scope, once) {
    const timerId = "t_" + this._timercounter;
    Timer._timers[timerId] = {
        time: time,
        callback: callback,
        scope: scope,
        once: once,
        __elapsedTime: 0
    };
    Timer._timercounter++;
    return timerId;
}

Timer.addTimerManually = function (time) {
    const timerId = "t_" + this._timercounter;
    Timer._timers[timerId] = {
        time: time || 0,
        __elapsedTime: 0
    };
    Timer._timercounter++;
    return timerId;
}

Timer.checkElapsed = function (timerId) {
    const timer = this._timers[timerId];
    if (timer.time && timer.__elapsedTime >= timer.time) {
        timer.__elapsedTime = 0;
        return true;
    } else {
        return false;
    }
}

/**
 * Removes a timer from the system.
 *
 * This function deletes the timer with the specified identifier from the list of active timers. After deletion, the timer will no longer be managed by the system.
 *
 * @param {string} timerId - The unique identifier of the timer to be removed. This ID was previously returned by `Timer.addTimer`.
 * @returns {null} Always returns `null` to indicate that the operation is complete.
 */
Timer.destroyTimer = function (timerId) {
    delete this._timers[timerId];
    return null;
}

/**
 * Clears all active timers from the system.
 *
 * This function removes all timers from the list of active timers and resets the timer counter. It effectively stops all currently running timers and clears the timer storage.
 *
 * @returns {void} This function does not return any value.
 */
Timer.clearAllTimers = function () {
    for (let key in this._timers) {
        this.destroyTimer(key);
    }
    this._timers = [];
    Timer._timercounter = 0;
}

/**
 * Evaluates and updates all active timers.
 *
 * This function iterates through all active timers, updating their elapsed time based on the provided delta time (`dt`). If a timer's elapsed time exceeds or equals its specified duration, the timer's callback is executed. If the timer is set to execute only once, it is removed from the list of active timers. Otherwise, its elapsed time is reset to allow it to continue running.
 *
 * @param {number} dt - The delta time since the last evaluation. This value is added to each timer's elapsed time to track the passage of time.
 * @returns {void} This function does not return any value.
 */
Timer.evaluateTimers = function (dt) {
    for (let key in this._timers) {
        var timer = this._timers[key];
        timer.__elapsedTime += dt;
        if (timer.time && timer.__elapsedTime >= timer.time) {
            timer.callback.call(timer.scope);
            if (timer.once) {
                this.destroyTimer(key);
            } else {
                timer.__elapsedTime = 0;
            }
        }
    }
}


/*
poner en cualquier entidad. Se recomienda poner en ROOT.
*/
if (typeof (document) !== "undefined") {
    /*! FPSMeter 0.3.1 - 9th May 2013 | https://github.com/Darsain/fpsmeter */
    (function (m, j) {
        function s(a, e) { for (var g in e) try { a.style[g] = e[g] } catch (j) { } return a } function H(a) { return null == a ? String(a) : "object" === typeof a || "function" === typeof a ? Object.prototype.toString.call(a).match(/\s([a-z]+)/i)[1].toLowerCase() || "object" : typeof a } function R(a, e) { if ("array" !== H(e)) return -1; if (e.indexOf) return e.indexOf(a); for (var g = 0, j = e.length; g < j; g++)if (e[g] === a) return g; return -1 } function I() {
            var a = arguments, e; for (e in a[1]) if (a[1].hasOwnProperty(e)) switch (H(a[1][e])) {
                case "object": a[0][e] =
                    I({}, a[0][e], a[1][e]); break; case "array": a[0][e] = a[1][e].slice(0); break; default: a[0][e] = a[1][e]
            }return 2 < a.length ? I.apply(null, [a[0]].concat(Array.prototype.slice.call(a, 2))) : a[0]
        } function N(a) { a = Math.round(255 * a).toString(16); return 1 === a.length ? "0" + a : a } function S(a, e, g, j) { if (a.addEventListener) a[j ? "removeEventListener" : "addEventListener"](e, g, !1); else if (a.attachEvent) a[j ? "detachEvent" : "attachEvent"]("on" + e, g) } function D(a, e) {
            function g(a, b, d, c) { return y[0 | a][Math.round(Math.min((b - d) / (c - d) * J, J))] }
            function r() { f.legend.fps !== q && (f.legend.fps = q, f.legend[T] = q ? "FPS" : "ms"); K = q ? b.fps : b.duration; f.count[T] = 999 < K ? "999+" : K.toFixed(99 < K ? 0 : d.decimals) } function m() {
                z = A(); L < z - d.threshold && (b.fps -= b.fps / Math.max(1, 60 * d.smoothing / d.interval), b.duration = 1E3 / b.fps); for (c = d.history; c--;)E[c] = 0 === c ? b.fps : E[c - 1], F[c] = 0 === c ? b.duration : F[c - 1]; r(); if (d.heat) {
                    if (w.length) for (c = w.length; c--;)w[c].el.style[h[w[c].name].heatOn] = q ? g(h[w[c].name].heatmap, b.fps, 0, d.maxFps) : g(h[w[c].name].heatmap, b.duration, d.threshold,
                        0); if (f.graph && h.column.heatOn) for (c = u.length; c--;)u[c].style[h.column.heatOn] = q ? g(h.column.heatmap, E[c], 0, d.maxFps) : g(h.column.heatmap, F[c], d.threshold, 0)
                } if (f.graph) for (p = 0; p < d.history; p++)u[p].style.height = (q ? E[p] ? Math.round(O / d.maxFps * Math.min(E[p], d.maxFps)) : 0 : F[p] ? Math.round(O / d.threshold * Math.min(F[p], d.threshold)) : 0) + "px"
            } function k() { 20 > d.interval ? (x = M(k), m()) : (x = setTimeout(k, d.interval), P = M(m)) } function G(a) {
                a = a || window.event; a.preventDefault ? (a.preventDefault(), a.stopPropagation()) : (a.returnValue =
                    !1, a.cancelBubble = !0); b.toggle()
            } function U() { d.toggleOn && S(f.container, d.toggleOn, G, 1); a.removeChild(f.container) } function V() {
                f.container && U(); h = D.theme[d.theme]; y = h.compiledHeatmaps || []; if (!y.length && h.heatmaps.length) {
                    for (p = 0; p < h.heatmaps.length; p++) {
                        y[p] = []; for (c = 0; c <= J; c++) {
                            var b = y[p], e = c, g; g = 0.33 / J * c; var j = h.heatmaps[p].saturation, m = h.heatmaps[p].lightness, n = void 0, k = void 0, l = void 0, t = l = void 0, v = n = k = void 0, v = void 0, l = 0.5 >= m ? m * (1 + j) : m + j - m * j; 0 === l ? g = "#000" : (t = 2 * m - l, k = (l - t) / l, g *= 6, n = Math.floor(g),
                                v = g - n, v *= l * k, 0 === n || 6 === n ? (n = l, k = t + v, l = t) : 1 === n ? (n = l - v, k = l, l = t) : 2 === n ? (n = t, k = l, l = t + v) : 3 === n ? (n = t, k = l - v) : 4 === n ? (n = t + v, k = t) : (n = l, k = t, l -= v), g = "#" + N(n) + N(k) + N(l)); b[e] = g
                        }
                    } h.compiledHeatmaps = y
                } f.container = s(document.createElement("div"), h.container); f.count = f.container.appendChild(s(document.createElement("div"), h.count)); f.legend = f.container.appendChild(s(document.createElement("div"), h.legend)); f.graph = d.graph ? f.container.appendChild(s(document.createElement("div"), h.graph)) : 0; w.length = 0; for (var q in f) f[q] &&
                    h[q].heatOn && w.push({ name: q, el: f[q] }); u.length = 0; if (f.graph) { f.graph.style.width = d.history * h.column.width + (d.history - 1) * h.column.spacing + "px"; for (c = 0; c < d.history; c++)u[c] = f.graph.appendChild(s(document.createElement("div"), h.column)), u[c].style.position = "absolute", u[c].style.bottom = 0, u[c].style.right = c * h.column.width + c * h.column.spacing + "px", u[c].style.width = h.column.width + "px", u[c].style.height = "0px" } s(f.container, d); r(); a.appendChild(f.container); f.graph && (O = f.graph.clientHeight); d.toggleOn && ("click" ===
                        d.toggleOn && (f.container.style.cursor = "pointer"), S(f.container, d.toggleOn, G))
            } "object" === H(a) && a.nodeType === j && (e = a, a = document.body); a || (a = document.body); var b = this, d = I({}, D.defaults, e || {}), f = {}, u = [], h, y, J = 100, w = [], W = 0, B = d.threshold, Q = 0, L = A() - B, z, E = [], F = [], x, P, q = "fps" === d.show, O, K, c, p; b.options = d; b.fps = 0; b.duration = 0; b.isPaused = 0; b.tickStart = function () { Q = A() }; b.tick = async function () { z = A(); W = z - L; B += (W - B) / d.smoothing; b.fps = 1E3 / B; b.duration = Q < L ? B : z - Q; L = z }; b.pause = function () {
                x && (b.isPaused = 1, clearTimeout(x),
                    C(x), C(P), x = P = 0); return b
            }; b.resume = function () { x || (b.isPaused = 0, k()); return b }; b.set = function (a, c) { d[a] = c; q = "fps" === d.show; -1 !== R(a, X) && V(); -1 !== R(a, Y) && s(f.container, d); return b }; b.showDuration = function () { b.set("show", "ms"); return b }; b.showFps = function () { b.set("show", "fps"); return b }; b.toggle = function () { b.set("show", q ? "ms" : "fps"); return b }; b.hide = function () { b.pause(); f.container.style.display = "none"; return b }; b.show = function () { b.resume(); f.container.style.display = "block"; return b }; b.destroy = function () {
                b.pause();
                U(); b.tick = b.tickStart = function () { }
            }; V(); k()
        } var A, r = m.performance; A = r && (r.now || r.webkitNow) ? r[r.now ? "now" : "webkitNow"].bind(r) : function () { return +new Date }; for (var C = m.cancelAnimationFrame || m.cancelRequestAnimationFrame, M = m.requestAnimationFrame, r = ["moz", "webkit", "o"], G = 0, k = 0, Z = r.length; k < Z && !C; ++k)M = (C = m[r[k] + "CancelAnimationFrame"] || m[r[k] + "CancelRequestAnimationFrame"]) && m[r[k] + "RequestAnimationFrame"]; C || (M = function (a) {
            var e = A(), g = Math.max(0, 16 - (e - G)); G = e + g; return m.setTimeout(function () {
                a(e +
                    g)
            }, g)
        }, C = function (a) { clearTimeout(a) }); var T = "string" === H(document.createElement("div").textContent) ? "textContent" : "innerText"; D.extend = I; window.FPSMeter = D; D.defaults = { interval: 100, smoothing: 10, show: "fps", toggleOn: "click", decimals: 1, maxFps: 60, threshold: 100, position: "absolute", zIndex: 10, left: "5px", top: "5px", right: "auto", bottom: "auto", margin: "0 0 0 0", theme: "dark", heat: 0, graph: 0, history: 20 }; var X = ["toggleOn", "theme", "heat", "graph", "history"], Y = "position zIndex left top right bottom margin".split(" ")
    })(window); (function (m, j) {
        j.theme = {}; var s = j.theme.base = {
            heatmaps: [], container: { heatOn: null, heatmap: null, padding: "5px", minWidth: "95px", height: "30px", lineHeight: "30px", textAlign: "right", textShadow: "none" }, count: { heatOn: null, heatmap: null, position: "absolute", top: 0, right: 0, padding: "5px 10px", height: "30px", fontSize: "24px", fontFamily: "Consolas, Andale Mono, monospace", zIndex: 2 }, legend: {
                heatOn: null, heatmap: null, position: "absolute", top: 0, left: 0, padding: "5px 10px", height: "30px", fontSize: "12px", lineHeight: "32px", fontFamily: "sans-serif",
                textAlign: "left", zIndex: 2
            }, graph: { heatOn: null, heatmap: null, position: "relative", boxSizing: "padding-box", MozBoxSizing: "padding-box", height: "100%", zIndex: 1 }, column: { width: 4, spacing: 1, heatOn: null, heatmap: null }
        }; j.theme.dark = j.extend({}, s, { heatmaps: [{ saturation: 0.8, lightness: 0.8 }], container: { background: "#222", color: "#fff", border: "1px solid #1a1a1a", textShadow: "1px 1px 0 #222" }, count: { heatOn: "color" }, column: { background: "#3f3f3f" } }); j.theme.light = j.extend({}, s, {
            heatmaps: [{ saturation: 0.5, lightness: 0.5 }],
            container: { color: "#666", background: "#fff", textShadow: "1px 1px 0 rgba(255,255,255,.5), -1px -1px 0 rgba(255,255,255,.5)", boxShadow: "0 0 0 1px rgba(0,0,0,.1)" }, count: { heatOn: "color" }, column: { background: "#eaeaea" }
        }); j.theme.colorful = j.extend({}, s, { heatmaps: [{ saturation: 0.5, lightness: 0.6 }], container: { heatOn: "backgroundColor", background: "#888", color: "#fff", textShadow: "1px 1px 0 rgba(0,0,0,.2)", boxShadow: "0 0 0 1px rgba(0,0,0,.1)" }, column: { background: "#777", backgroundColor: "rgba(0,0,0,.2)" } }); j.theme.transparent =
            j.extend({}, s, { heatmaps: [{ saturation: 0.8, lightness: 0.5 }], container: { padding: 0, color: "#fff", textShadow: "1px 1px 0 rgba(0,0,0,.5)" }, count: { padding: "0 5px", height: "40px", lineHeight: "40px" }, legend: { padding: "0 5px", height: "40px", lineHeight: "42px" }, graph: { height: "40px" }, column: { width: 5, background: "#999", heatOn: "backgroundColor", opacity: 0.5 } })
    })(window, FPSMeter);
}

var TracerScript = {};
TracerScript.linesValues = {};
TracerScript.div = null;
TracerScript.divValues = null;
TracerScript.timer = null;
TracerScript.__tracer_busy = false;

/**************************************************/
/*             G A M E   M A N A G E R            */
/**************************************************/
var GameManager = pc.createScript('gameManager');

GameManager.attributes.add('cameraOptions', {
    title: "Camera Options",
    type: 'json',
    schema: [


        {
            name: 'cameratype',
            title: "cameratype",
            type: 'string', enum: [
                { 'FirstPerson': 'FirstPerson' },
                { 'ThirdPerson': 'ThirdPerson' },
                { 'ThirdPersonPointMove': 'ThirdPersonPointMove' },
                { 'FlyCamera': 'FlyCamera' }
            ], default: 'ThirdPerson',
            description: "General style of player view for this game.",
        }

    ]
});

GameManager.attributes.add('cameraPostProcessing', {
    title: "CameraPostProcessing",
    description: "CameraPostProcessing effects",
    type: 'json',
    schema: [
        {
            name: 'enabled',
            type: 'boolean',
            default: true,
            title: 'enabled',
            description: 'enables CameraPostProcessing'
        },

        {
            name: 'bloom',
            type: 'boolean',
            default: true,
            title: 'bloom',
            description: 'bloom'
        },
        {
            name: 'ssao',
            type: 'boolean',
            default: true,
            title: 'ssao',
            description: 'ssao'
        },
        {
            name: 'taa',
            type: 'boolean',
            default: true,
            title: 'taa',
            description: 'taa'
        },
        {
            name: 'lut',
            type: 'boolean',
            default: true,
            title: 'lut',
            description: 'lut'
        },
    ]
});




GameManager.attributes.add('scenesConfig', {
    title: "scenesConfig",
    type: 'json',
    schema: [
        {
            name: 'mainMenuScene',
            title: 'mainMenuScene',
            type: 'boolean',
            array: false,
            default: true,
            description: 'mainMenuScene'
        }
    ]
});

GameManager.attributes.add('mouseOptions', {
    title: "Mouse Options",
    type: 'json',
    schema: [
        {
            name: 'hideMousePointer',
            title: 'hideMousePointer',
            type: 'boolean',
            default: false,
            description: 'hideMousePointer'
        },
        {
            name: 'fireMenuEventOnMouseMove',
            title: 'fireMenuEventOnMouseMove',
            type: 'boolean',
            default: false,
            description: 'fireMenuEventOnMouseMove'
        },
        {
            name: "mouseSensitivity",
            type: 'number',
            default: 10,
            title: 'Mouse Sensitivity'
        }

    ]
});


GameManager.attributes.add('ui', {
    title: "UI",
    type: 'json',
    schema: [
        {
            name: 'htmlFile',
            type: 'asset',
            assetType: 'html',
            array: false,
            default: null,
            description: 'htmlFile'
        },
        {
            name: 'cssFiles',
            type: 'asset',
            assetType: 'css',
            array: true,
            default: [],
            description: 'Select multiple CSS files.'
        },
        {
            name: 'jsFiles',
            type: 'asset',
            assetType: 'script',
            array: true,
            default: [],
            description: 'Select multiple JavaScript files.'
        },
        {
            name: 'showMenuOnEnabledPointer',
            type: 'boolean',
            default: true
        }

    ]
});




GameManager.attributes.add('followCamera',
    {
        title: "Follow Camera",
        type: 'json',
        schema: [
            {
                name: 'targetName',
                type: 'string',
                default: "targetEntity",
                title: 'Target Entity Name',
                description: "Select the entity name around which the camera will orbit. recoment use: 'targetEntity'. "
            },
            {
                name: 'orbitRadius',
                type: 'number',
                default: 3,
                title: 'Orbit Radius'
            },
            {
                name: 'bottomClamp',
                type: 'number',
                default: 320,
                min: 320,
                max: 340,
                precision: 0,
                title: 'bottomClamp',
                description: "The maximum value in angle degrees for the camera downwards movement."
            },
            {
                name: 'topClamp',
                type: 'number',
                default: 70,
                min: 50,
                max: 70,
                precision: 0,
                title: 'topClamp',
                description: "The maximum value in angle degrees for the camera upwards movement."
            },
            {
                name: 'smoothFactor',
                type: 'number',
                default: 0.2,
                min: 0.01,
                max: 1,
                title: 'Smooth Factor',
                description: 'Adjusts the smoothness of camera movement (0.1 for more smooth, 1 for immediate response)'
            },
            {
                name: 'autofov',
                type: 'boolean',
                default: false,
                title: 'autofov'
            },

        ]
    });


GameManager.attributes.add('flyCamera',
    {
        title: "Fly Camera",
        description: "Only works for playerPersonStyle = FlyCamera.",
        type: 'json',
        schema: [
            {
                name: 'speed',
                type: 'number',
                default: 20,
                title: 'speed',
                description: 'speed',
                min: 10,
                max: 20,
                precision: 1
            },
        ]
    });

GameManager.attributes.add("subtitles", {
    title: "subtitles",
    type: "json",
    schema: [

        {
            name: 'enabled',
            type: 'boolean',
            default: true,
            title: 'enabled',
            description: 'enables subtitles'
        },

        {
            name: 'enableSubtitles',
            type: 'boolean',
            default: true,
        },
    ]
});

GameManager.attributes.add('tracer', {
    title: "Tracer",
    type: 'json',
    schema: [
        {
            name: 'enabled',
            type: 'boolean',
            default: false,
            title: 'enabled',
            description: 'enables Tracer'
        },

        {
            name: 'trenablefps',
            title: "FPS Enabled",
            type: 'boolean',
            default: true
        },
        {
            name: 'trshowstats',
            type: 'boolean',
            default: false
        },
        {
            name: 'trenablelightingdebugLayer',
            type: 'boolean',
            default: false
        },
        {
            name: 'tralwaysshow',
            title: "Always show",
            type: 'boolean',
            default: false
        },
        {
            name: 'trordermode',
            title: "Order mode",
            type: 'string',
            enum: [{ 'newlestlast': 'newlestlast' }, { 'oldestfirst': 'oldestfirst' }],
            default: "oldestfirst"
        },
        {
            name: 'trgamesleep',
            title: "gamesleep",
            type: 'number',
            default: 0,
            min: 0, max: 100, precision: 0
        },
        {
            name: 'trgametimescale',
            title: "trgametimescale",
            type: 'number',
            default: 1,
            min: 0, max: 1, precision: 2
        },
    ]
});



GameManager._app = null;
GameManager.showMenuOnEnabledPointer = true;
GameManager.__menuchecktime = 0;
GameManager.__subtitleTimeout = null;
GameManager.__assetLoaderTimeout = null;
GameManager.currentCamera = null;
GameManager.cameraOptions = {};
GameManager.followCamera = {};
GameManager.mouseOptions = { mouseSensitivity: 10 };
GameManager.__gameMouseMoved = false;
GameManager.__gameMouse_busy = false;
GameManager.input = {
    cameratype: (GameManager.cameraOptions.cameratype || ""),
    x: 0,
    z: 0,
    esc: false,
    jump: false,
    sprint: false,
    interact: false,
    attack: false,
    camera: null,
    previousY: 0,
    previousX: 0,
    mouseSensitivity: GameManager.mouseOptions.mouseSensitivity,
    mouseX: 0,
    mouseY: 0,
    mouseDx: 0,
    mouseDy: 0,
    mousePrimaryButton: false,
    mouseSecondaryButton: false,
    mouseXButton: 0,
    mouseYButton: 0,
    mouseWheel: 0,
    lookLastDeltaX: 0,
    lookLastDeltaY: 0,
    dt: 0,
    mode: 0
};



function onYouTubeIframeAPIReady() {
    GameManager.backgroundMusicYTPlayer = new YT.Player('backgroundMusicYTPlayer', {
        height: '0',
        width: '0',
        videoId: 'M7lc1UVf-VE',
        events: {
            /*'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange*/
        }
    });
}


// initialize code called once per entity
GameManager.prototype.initialize = function () {
    GameManager.showMenuOnEnabledPointer = this.ui.showMenuOnEnabledPointer;
    GameManager.mainScene = "game";
    GameManager.currentScene = GameManager.mainScene;
    GameManager._app = this.app;
    GameManager._app.mouse.disableContextMenu();
    GameManager._app.isMenuMode = false;

    GameManager.cameraOptions = this.cameraOptions;
    GameManager.currentCamera = GameManager.calculateCameraScene();
    GameManager.cameraPostProcessing = this.cameraPostProcessing;
    GameManager.applyCameraPostProcessing(this.cameraPostProcessing);
    GameManager.input.camera = GameManager.currentCamera;
    GameManager.input.cameratype = (this.cameraOptions.cameratype || "");
    GameManager.followCamera = this.followCamera;
    GameManager.followCamera.initialFov = GameManager.currentCamera ? GameManager.currentCamera.fov : 45;
    GameManager.followCamera.eulers = new pc.Vec3();
    GameManager.followCamera.smoothedPosition = new pc.Vec3();
    GameManager.followCamera.target = null;

    GameManager.playerEntity = null;
    GameManager.playerEntityScript = null;
    GameManager.checkForPlayerAndTargetEntities = true;

    GameManager.mouseOptions = this.mouseOptions;
    GameManager.flyCamera = this.flyCamera;
    GameManager.flyCamera.moved = false;
    GameManager.flyCamera.ex = 0;
    GameManager.flyCamera.ey = 0;



    GameManager.enableSubtitles = this.subtitles.enabled;

    var canvas = this.app.graphicsDevice.canvas;
    canvas.focus();

    canvas.requestPointerLock = canvas.requestPointerLock ||
        canvas.mozRequestPointerLock ||
        canvas.webkitRequestPointerLock;

    document.exitPointerLock = document.exitPointerLock ||
        document.mozExitPointerLock ||
        document.webkitExitPointerLock;

    TracerScript.trenable = this.tracer.enabled;
    TracerScript.tralwaysshow = this.tracer.tralwaysshow;
    TracerScript.trordermode = this.tracer.trordermode;
    TracerScript.trenablefps = TracerScript.trenable ? this.tracer.trenablefps : false;
    TracerScript.trshowstats = TracerScript.trenable ? this.tracer.trshowstats : false;
    TracerScript.trenablelightingdebugLayer = TracerScript.trenable ? this.tracer.trenablelightingdebugLayer : false;

    if (TracerScript.trenablefps) {
        TracerScript.fps = new FPSMeter({ heat: true, graph: true });
    }
    if (TracerScript.trenable) {
        TracerScript.trgamesleep = this.tracer.trgamesleep;
        TracerScript.trgametimescale = this.tracer.trgametimescale;
    } else {
        TracerScript.trgamesleep = 0;
        TracerScript.trgametimescale = 1;
    }



    this.app.root.name = "APPROOT";
    this.app.maxDeltaTime = 0.2;


    document.body.style.backgroundColor = "#000";

    for (var i = 0; i < this.ui.cssFiles.length; i++) {
        var cssAsset = this.ui.cssFiles[i]; // Obtener el asset CSS en la posición i
        var cssId = cssAsset.id + "_" + cssAsset.name;

        if (!document.getElementById(cssId)) {
            var linkElement = document.createElement("LINK");
            linkElement.id = cssId;
            linkElement.rel = "stylesheet";
            linkElement.type = "text/css";
            linkElement.href = cssAsset.getFileUrl();
            document.head.appendChild(linkElement);
        }
    }

    for (var i = 0; i < this.ui.jsFiles.length; i++) {
        var jsAsset = this.ui.jsFiles[i]; // Obtener el asset en la posición i
        var jsId = jsAsset.id + "_" + jsAsset.name;

        if (!document.getElementById(jsId)) {
            var script = document.createElement("SCRIPT");
            script.type = "text/javascript";
            script.id = jsId;
            script.onerror = function () {
                console.error("Error al cargar el script:", script.src);
            };
            script.onload = function () {
                /*console.log("script loaded: ", script.src);*/
            }
            script.src = jsAsset.getFileUrl();
            document.head.appendChild(script);
        }
    }

    var YTtagScript = document.createElement('script');
    YTtagScript.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(YTtagScript, firstScriptTag);


    GameManager.backgroundMusicYTPlayer = null;




    this.createMenuDIV(canvas);
    this.createSceneLoaderDIV(canvas);
    this.createSubtitleDIV(canvas);
    this.createLoadingDIV(canvas);


    GameManager.menuDIV.innerHTML = uiGameHTML();
    GameManager.createCircularMenu();

    if (this.ui.htmlFile) {
        var htmlUrl = this.ui.htmlFile.getFileUrl(); // Obtener la URL del archivo HTML

        // Hacer una petición fetch para obtener el contenido del archivo
        fetch(htmlUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.text();
            })
            .then(htmlContent => {
                GameManager.menuDIV.innerHTML += htmlContent;
                //GameManager.createCircularMenu();
            })
            .catch(error => {
                console.error('Error fetching HTML:', error);
            });
    }






    this.app.on("showmenu", function () {
        if (GameManager._app && !GameManager._app.isMenuMode) {
            var canvas = GameManager._app.graphicsDevice.canvas;
            canvas.focus();
            GameManager.fadeIn(GameManager.menuDIV, 200, function () {
                GameManager._app.isMenuMode = true;
                if (GameManager.showhideMousePointer("show") === false) {
                    /*if fails when shows pointer*/
                    GameManager.menuDIV.style.display = "none";
                    GameManager.menuDIV.style.opacity = "0";
                    GameManager._app.isMenuMode = false;
                }
            });
        }
    }, this);


    this.app.on("hidemenu", function () {

        if (GameManager._app && GameManager._app.isMenuMode) {
            var canvas = GameManager._app.graphicsDevice.canvas;
            canvas.focus();
            GameManager.createAudioListener();
            GameManager.fadeOut(GameManager.menuDIV, 200, function () {
                GameManager._app.isMenuMode = false;
                if (GameManager.showhideMousePointer("hide") === false) {
                    GameManager.menuDIV.style.display = "block";
                    GameManager.menuDIV.style.opacity = "1";
                    this.app.isMenuMode = true;
                }
            });
        }
    }, this);



    /* ************* */
    /* ASSETS LOADER */
    /* ************* */
    this.app.assets.on("load", function (asset) {
        GameManager.assetLoaded(asset);
    }, this);

    TracerScript.initialize();

    /* KEYBOARD AND MOUSE */
    GameManager.bindInputs();
    this.on("destroy", function () {
        GameManager.unbindInputs();
    }, this);

    canvas.setAttribute('tabindex', '0');
    canvas.focus();




    /*POST PROCESSING ATRIBUTE SCRIPT EVENT*/
    GameManager.cameraPostProcessing = this.cameraPostProcessing
    this.on('attr:cameraPostProcessing', function (nuevoValor) {
        GameManager.applyCameraPostProcessing(nuevoValor);
        GameManager.cameraPostProcessing = nuevoValor
    }, this);




};




/**/
GameManager.prototype.postInitialize = function () {

    /* ************* */
    /* APP UPDATE    */
    /* ************* */
    this.app.on("update", GameManager.updateGameManager, this);




    if (GameManager.currentScene === GameManager.mainScene) {
        this.app.fire("showmenu");
    }
}


GameManager.bindInputs = function () {
    GameManager._app.mouse.on(pc.EVENT_MOUSEMOVE, GameManager._onMouseMove, GameManager);
    GameManager._app.mouse.on(pc.EVENT_MOUSEUP, GameManager._onMouseDownUp, GameManager);
    GameManager._app.mouse.on(pc.EVENT_MOUSEWHEEL, GameManager._onMouseWheel, GameManager);
};
GameManager.unbindInputs = function () {
    GameManager._app.mouse.off(pc.EVENT_MOUSEMOVE, GameManager._onMouseMove);
    GameManager._app.mouse.off(pc.EVENT_MOUSEDOWN, GameManager._onMouseDownUp);
    GameManager._app.mouse.off(pc.EVENT_MOUSEWHEEL, GameManager._onMouseWheel);
};


GameManager.readKeyboardInput = function () {
    const keyboard = GameManager._app.keyboard;

    // Movimiento horizontal
    if (keyboard.isPressed(pc.KEY_A) || keyboard.isPressed(pc.KEY_LEFT)) {
        GameManager.input.x = -1;
    } else if (keyboard.isPressed(pc.KEY_D) || keyboard.isPressed(pc.KEY_RIGHT)) {
        GameManager.input.x = 1;
    } else {
        GameManager.input.x = 0;
    }

    // Movimiento vertical
    if (keyboard.isPressed(pc.KEY_W) || keyboard.isPressed(pc.KEY_UP)) {
        GameManager.input.z = 1;
    } else if (keyboard.isPressed(pc.KEY_S) || keyboard.isPressed(pc.KEY_DOWN)) {
        GameManager.input.z = -1;
    } else {
        GameManager.input.z = 0;
    }
    GameManager.input.esc = keyboard.isPressed(pc.KEY_ESCAPE);
    GameManager.input.jump = keyboard.isPressed(pc.KEY_SPACE);
    GameManager.input.sprint = keyboard.isPressed(pc.KEY_SHIFT);
    GameManager.input.interact = keyboard.isPressed(pc.KEY_E);
    GameManager.input.attack = keyboard.isPressed(pc.KEY_F);
    GameManager.input.impact = keyboard.isPressed(pc.KEY_I);
    GameManager.input.death = keyboard.isPressed(pc.KEY_U);
    //GameManager.input.mode = +(keyboard.isPressed(pc.KEY_M));
};



/**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/
/**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/
/**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/
/**/                                                                                 /**/
/*                                  MOUSE MOVE                                         */
/**/                                                                                 /**/
/**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/
/**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/
/**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/ /**/
GameManager._onMouseMove = function (event) {
    if (GameManager.__gameMouseMoved) return;

    if (!GameManager.__gameMouse_busy) {
        GameManager.__gameMouse_busy = true;


        // Actualiza las variables de posición anterior para el próximo cálculo
        const x = event.x, y = event.y;
        var deltaX = event.clientX ? event.clientX - GameManager.input.previousX : event.dx,
            deltaY = event.clientY ? event.clientY - GameManager.input.previousY : event.dy;

        GameManager.input.mouseX = x;
        GameManager.input.mouseY = y;
        GameManager.input.mouseDx = deltaX;
        GameManager.input.mouseDy = deltaY;

        if (GameManager.input.lookLastDeltaX === deltaX) deltaX = 0;
        if (GameManager.input.lookLastDeltaY === deltaY) deltaY = 0;
        if (GameManager.currentCamera) {
            GameManager.onMouseMoveFollowCamera();
        }
        GameManager.input.lookLastDeltaX = deltaX;
        GameManager.input.lookLastDeltaY = deltaY;

        GameManager.input.previousX = event.clientX;
        GameManager.input.previousY = event.clientY;

        GameManager.__gameMouseMoved = true;
        GameManager.__gameMouse_busy = false;
    }
}

GameManager.onMouseMoveFollowCamera = function () {
    GameManager.followCamera.eulers.x -= ((GameManager.input.mouseSensitivity * GameManager.input.mouseDx) / 60) % 360;
    GameManager.followCamera.eulers.y += ((GameManager.input.mouseSensitivity * GameManager.input.mouseDy) / 60) % 360;

    GameManager.followCamera.eulers.x = (GameManager.followCamera.eulers.x + 360) % 360;
    GameManager.followCamera.eulers.y = (GameManager.followCamera.eulers.y + 360) % 360;

    GameManager.flyCamera.ex -= GameManager.input.mouseDy / GameManager.input.mouseSensitivity;
    GameManager.flyCamera.ex = pc.math.clamp(GameManager.flyCamera.ex, -90, 90);
    GameManager.flyCamera.ey -= GameManager.input.mouseDx / GameManager.input.mouseSensitivity;

    if (GameManager.followCamera.eulers.y > GameManager.followCamera.topClamp && GameManager.followCamera.eulers.y < GameManager.followCamera.topClamp + 180) {
        GameManager.followCamera.eulers.y = GameManager.followCamera.topClamp;
    }
    if (GameManager.followCamera.eulers.y < GameManager.followCamera.bottomClamp && GameManager.followCamera.eulers.y > GameManager.followCamera.bottomClamp - 180) {
        GameManager.followCamera.eulers.y = GameManager.followCamera.bottomClamp;
    }
}




GameManager.updateCameraOrientation = function () {

    //if (GameManager.playerPersonStyle === "FlyCamera") {
    if (GameManager.input.cameratype === "FlyCamera") {

        if (this.mouseOptions.hideMousePointer) {
            if (pc.Mouse.isPointerLocked()) {
                this.camera.setLocalEulerAngles(this.flyCamera.ex, this.flyCamera.ey, 0);
            }
        } else {
            this.camera.setLocalEulerAngles(this.flyCamera.ex, this.flyCamera.ey, 0);
        }
        return;
    }

    if (GameManager.followCamera && GameManager.followCamera.eulers) {
        GameManager.currentCamera.entity.setEulerAngles(new pc.Vec3(
            -GameManager.followCamera.eulers.y,
            GameManager.followCamera.eulers.x + 180,
            0
        ));

        if (GameManager.input.cameratype === "FirstPerson") {
            if (GameManager.playerEntity && GameManager.playerEntityScript) {
                //GameManager.playerEntityScript
                //if (otherScript) {
                //    otherScript.rotateCharacter(0, 0, this.camera, 0);
                //}

            }
        };

    }
};



GameManager.updateCameraPosition = function (dt) {
    /*dt = this.app.dt;*/
    //if (this.playerPersonStyle === "FlyCamera") {
    if (GameManager.input.cameratype === "FlyCamera") {

        if (this.input.x < 0) {
            this.camera.translateLocal(-this.flyCamera.speed * dt, 0, 0);
        }
        if (this.input.x > 0) {
            this.camera.translateLocal(this.flyCamera.speed * dt, 0, 0);
        }
        if (this.input.z < 0) {
            this.camera.translateLocal(0, 0, this.flyCamera.speed * dt);
        }
        if (this.input.z > 0) {
            this.camera.translateLocal(0, 0, -this.flyCamera.speed * dt);
        }
        return;
    }

    if (!GameManager.followCamera.target) return;

    if (!GameManager.followCamera.smoothedPosition) return;

    var targetPosition = GameManager.followCamera.target.getPosition();

    //if (this.playerPersonStyle === "FirstPerson") {
    if (GameManager.input.cameratype === "FirstPerson") {
        GameManager.currentCamera.entity.setPosition(targetPosition);
        return;
    }


    var cameraPosition = targetPosition.clone().add(GameManager.currentCamera.entity.forward.scale(-GameManager.followCamera.orbitRadius));
    cameraPosition.y = pc.math.clamp(cameraPosition.y, 0.5, Number.POSITIVE_INFINITY);


    const hit = GameManager._app.systems.rigidbody.raycastFirst(targetPosition, cameraPosition);

    if (hit && hit.entity && !(hit.entity.isPlayer ?? false) && hit.entity.name.toLowerCase() !== "charactersensor" && !hit.entity.tags.has('ignore-camera-collision')) {
        var direction = GameManager.followCamera.target.getPosition().sub(hit.point).normalize();
        cameraPosition = hit.point.clone().add(direction.scale(0.1));
    }




    const deltaTimeAdjustment = dt / (1.0 / 60); // 60 es la tasa de frames objetivo (puedes ajustarla según tu necesidad)
    const smoothFactor = GameManager.followCamera.smoothFactor * deltaTimeAdjustment;
    //const smoothFactor = 1;
    if (smoothFactor > 0 && smoothFactor < 1) {
        GameManager.followCamera.smoothedPosition.lerp(GameManager.followCamera.smoothedPosition, cameraPosition, smoothFactor);
    } else {
        GameManager.followCamera.smoothedPosition = cameraPosition;
    }

    GameManager.currentCamera.entity.setPosition(GameManager.followCamera.smoothedPosition);

    targetPosition = GameManager.followCamera.target.getPosition();
    GameManager.currentCamera.entity.lookAt(targetPosition);


    var distanceToTarget = targetPosition.distance(GameManager.currentCamera.entity.getPosition());

    if (GameManager.followCamera.autofov) {
        var fov = GameManager.followCamera.initialFov + (GameManager.followCamera.initialFov * (1 - Math.min(distanceToTarget, GameManager.followCamera.orbitRadius) / GameManager.followCamera.orbitRadius));
        // Limitar el FOV a un rango válido
        fov = pc.math.clamp(fov, GameManager.followCamera.initialFov, 90);
        // Aplicar el FOV a la cámara
        GameManager.currentCamera.fov = fov;
    }

};


GameManager._onMouseDownUp = function (event) {
    GameManager.input.mouseXButton = event.x;
    GameManager.input.mouseYButton = event.y;

    GameManager.input.mousePrimaryButton = (event.buttons[pc.MOUSEBUTTON_LEFT]);
    GameManager.input.mouseSecondaryButton = (event.buttons[pc.MOUSEBUTTON_RIGHT]);
};

GameManager._onMouseWheel = function (event) {
    GameManager.input.mouseWheel = event.wheelDelta;
};




/* ----------------------------------------------------------------------------------------------- */
GameManager.sleep = function (ms) {
    if (!ms) return;
    const end = Date.now() + ms;
    while (Date.now() < end) {
        // Bloqueo del hilo principal
    }
}




// update code called every frame
GameManager.updateGameManager = async function (dt) {
    GameManager._app.dt = dt;
    GameManager.input.dt = dt;
    Timer.evaluateTimers(dt);


    if (GameManager.checkForPlayerAndTargetEntities) {
        GameManager._app.scene.root.find(function (entity) {
            if (entity.name.trim().toLowerCase() === (GameManager.followCamera.targetName || "").trim().toLowerCase()) {
                GameManager.followCamera.target = entity;
            }
            if (entity.isPlayer) {
                GameManager.playerEntity = entity;
                GameManager.playerEntityScript = GameManager.playerEntity.script.character;
            }
        });
        if (!GameManager.followCamera.target) {
            GameManager.followCamera.target = GameManager.playerEntity;
        }


        GameManager.checkForPlayerAndTargetEntities = false;
    }

    GameManager.readKeyboardInput()

    GameManager.sleep(TracerScript.trgamesleep);
    GameManager._app.timeScale = TracerScript.trgametimescale;

    if (TracerScript.trenablefps) {
        TracerScript.fps.tick();
    }

    if (TracerScript.trshowstats) {
        if (window.performance && window.performance.memory) {
            var memoryInfo = window.performance.memory;
            Trace('totalJSHeapSize', parseInt(memoryInfo.totalJSHeapSize / 1048576) + "mb");
            Trace('usedJSHeapSize', parseInt(memoryInfo.usedJSHeapSize / 1048576) + "mb");
            Trace('jsHeapSizeLimit', parseInt(memoryInfo.jsHeapSizeLimit / 1048576) + "mb");
        }
        const vram = GameManager._app.stats.vram;
        Trace("vram",
            parseInt(
                (
                    parseInt("0" + (vram.tex || 0))
                    + parseInt("0" + (vram.vb || 0))
                    + parseInt("0" + (vram.ib || 0))
                    + parseInt("0" + (vram.ub || 0))
                    + parseInt("0" + (vram.sb || 0))
                )
                / 1048576) + "mb");
    }

    GameManager.__menuchecktime += dt;
    if (GameManager.__menuchecktime >= 0.5) {
        if (GameManager._app) {
            if (GameManager.showMenuOnEnabledPointer) {
                if (!pc.Mouse.isPointerLocked()) {
                    GameManager._app.fire("showmenu");
                }
            }
            if (GameManager._app.isMenuMode) {
                if (!pc.Mouse.isPointerLocked()) {
                    GameManager.showhideMousePointer("show");
                }
            } else {
                if (pc.Mouse.isPointerLocked()) {
                    GameManager.showhideMousePointer("hide");
                }
            }
        }
        GameManager.__menuchecktime = 0;
    }


    /* CAMERA MOVEMENT */
    if (GameManager.currentCamera) {
        GameManager.updateCameraOrientation();
        GameManager.updateCameraPosition(dt);
    }

    GameManager.__gameMouseMoved = false;
};

/**************************************************************************************/

GameManager.createAudioListener = function () {
    if (!GameManager.audiolistener) {
        GameManager.audiolistener = GameManager._app.scene.root.addComponent("audiolistener");
    }
}

GameManager.showhideMousePointer = function (action) {
    function sleepPointerLock(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getLockedElement() {
        return document.pointerLockElement ||
            document.mozPointerLockElement ||
            document.webkitPointerLockElement;
    }

    function isLockedElement(canvas) {
        return getLockedElement() === canvas;
    }

    var canvas = GameManager._app.graphicsDevice.canvas;
    canvas.focus();




    var result = false;
    try {
        if (action === "show") {

            if (isLockedElement(canvas)) {
                try {
                    document.exitPointerLock();
                    result = true;
                    (async function () { await sleepPointerLock(500); })();
                } catch { }
            } else {
                result = true;
            }
        }
        if (action === "hide") {
            if (!isLockedElement(canvas)) {
                try {
                    canvas.requestPointerLock();
                    //Trace("isLockedElement = ", isLockedElement(canvas));
                    //GameManager._app.mouse.enablePointerLock();
                    result = true;
                    (async function () { await sleepPointerLock(500); })();
                } catch { }
            } else {
                result = true;
            }
        }
    } catch { }

    return result;









    /* ************************************************ */

    var result = false;
    try {
        if (action === "show") {
            if (pc.Mouse.isPointerLocked()) {
                try {
                    GameManager._app.mouse.disablePointerLock();
                    result = true;
                    (async function () { await sleepPointerLock(500); })();
                } catch { }
            } else {
                result = true;
            }
        }
        if (action === "hide") {
            if (!pc.Mouse.isPointerLocked()) {
                try {
                    GameManager._app.mouse.enablePointerLock();
                    result = true;
                    (async function () { await sleepPointerLock(500); })();
                } catch { }
            } else {
                result = true;
            }
        }
    } catch { }

    return result;
}


GameManager.prototype.createLoadingDIV = function (canvas) {
    GameManager.loadingDIV = document.getElementById("loadingDIV");
    if (!GameManager.loadingDIV) {
        GameManager.loadingDIV = document.createElement("DIV");
        GameManager.loadingDIV.id = "loadingDIV";
        GameManager.loadingDIV.style.backgroundColor = "black";
        GameManager.loadingDIV.style.color = "white";
        GameManager.loadingDIV.style.position = "absolute";
        GameManager.loadingDIV.style.right = "0px";
        GameManager.loadingDIV.style.bottom = "0px";
        GameManager.loadingDIV.style.display = "none";
        GameManager.loadingDIV.innerHTML = "<style type=\"text/css\">.loader {width: 48px; --b: 8px; aspect-ratio: 1; border-radius: 50%; background: azure; -webkit-mask: repeating-conic-gradient(#0000 0deg,#000 1deg 70deg,#0000 71deg 90deg), radial-gradient(farthest-side,#0000 calc(100% - var(--b) - 1px),#000 calc(100% - var(--b))); -webkit-mask-composite: destination-in; mask-composite: intersect; animation: l5 1s infinite;} @keyframes l5 {to{transform: rotate(.5turn)}}</style><div class=\"loader\"></div>";
        canvas.parentElement.appendChild(GameManager.loadingDIV);
    }
}

GameManager.prototype.createMenuDIV = function (canvas) {
    GameManager.menuDIV = document.getElementById("mainmenuDIV");
    if (!GameManager.menuDIV) {
        GameManager.menuDIV = document.createElement("DIV");
        GameManager.menuDIV.id = "mainmenuDIV";
        GameManager.menuDIV.style.position = "absolute";
        GameManager.menuDIV.style.left = "0px";
        GameManager.menuDIV.style.top = "0px";
        GameManager.menuDIV.style.right = "0px";
        GameManager.menuDIV.style.bottom = "0px";
        GameManager.menuDIV.style.margin = "0px";
        GameManager.menuDIV.style.padding = "0px";
        GameManager.menuDIV.style.display = "none";
        GameManager.menuDIV.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
        GameManager.menuDIV.style.opacity = "0";

        canvas.parentElement.appendChild(GameManager.menuDIV);
    }
}

GameManager.prototype.createSceneLoaderDIV = function (canvas) {
    GameManager.sceneLoaderDIV = document.getElementById("sceneloaderDIV");
    if (!GameManager.sceneLoaderDIV) {
        GameManager.sceneLoaderDIV = document.createElement("DIV");
        GameManager.sceneLoaderDIV.id = "sceneloaderDIV";
        GameManager.sceneLoaderDIV.style.position = "absolute";
        GameManager.sceneLoaderDIV.style.left = "0px";
        GameManager.sceneLoaderDIV.style.top = "0px";
        GameManager.sceneLoaderDIV.style.right = "0px";
        GameManager.sceneLoaderDIV.style.bottom = "0px";
        GameManager.sceneLoaderDIV.style.margin = "0px";
        GameManager.sceneLoaderDIV.style.padding = "0px";
        GameManager.sceneLoaderDIV.style.display = "none";
        GameManager.sceneLoaderDIV.style.backgroundColor = "black";
        GameManager.sceneLoaderDIV.style.opacity = "1";
        GameManager.sceneLoaderDIV.style.justifyCcontent = "center";
        GameManager.sceneLoaderDIV.style.alignItems = "center";

        canvas.parentElement.appendChild(GameManager.sceneLoaderDIV);
    }
}

GameManager.prototype.createSubtitleDIV = function (canvas) {
    GameManager.subtitleDIV = document.getElementById("subtitleDIV");
    if (!GameManager.subtitleDIV) {
        GameManager.subtitleDIV = document.createElement("DIV");
        GameManager.subtitleDIV.id = "subtitleDIV";
        GameManager.subtitleDIV.style.position = "absolute";
        GameManager.subtitleDIV.style.left = "2em";
        GameManager.subtitleDIV.style.right = "2em";
        GameManager.subtitleDIV.style.bottom = "2em";
        GameManager.subtitleDIV.style.margin = "0px";
        GameManager.subtitleDIV.style.display = "none";
        GameManager.subtitleDIV.style.opacity = "1";
        GameManager.subtitleDIV.style.justifyCcontent = "center";
        GameManager.subtitleDIV.style.alignItems = "center";
        GameManager.subtitleDIV.style.textAlign = "center";
        GameManager.subtitleDIV.style.padding = "0.1em";

        GameManager.subtitleBackgroundDIV = document.createElement("DIV");
        GameManager.subtitleBackgroundDIV.id = "subtitleBackgroundDIV";
        GameManager.subtitleBackgroundDIV.style.position = "absolute";
        GameManager.subtitleBackgroundDIV.style.left = "0px";
        GameManager.subtitleBackgroundDIV.style.right = "0px";
        GameManager.subtitleBackgroundDIV.style.bottom = "0px";
        GameManager.subtitleBackgroundDIV.style.top = "0px";
        GameManager.subtitleBackgroundDIV.style.margin = "0px";
        GameManager.subtitleBackgroundDIV.style.padding = "0px";
        GameManager.subtitleBackgroundDIV.style.backgroundColor = "black";
        GameManager.subtitleBackgroundDIV.style.opacity = "0.5";
        GameManager.subtitleDIV.appendChild(GameManager.subtitleBackgroundDIV);

        GameManager.subtitleTextDIV = document.createElement("LABEL");
        GameManager.subtitleTextDIV.id = "subtitleTextDIV";
        GameManager.subtitleTextDIV.style.justifyCcontent = "center";
        GameManager.subtitleTextDIV.style.alignItems = "center";
        GameManager.subtitleTextDIV.style.textAlign = "center";
        GameManager.subtitleTextDIV.style.position = "relative";
        GameManager.subtitleTextDIV.style.justifyCcontent = "center";
        GameManager.subtitleTextDIV.style.alignItems = "center";
        GameManager.subtitleTextDIV.style.fontSize = "1.1em";
        GameManager.subtitleTextDIV.style.fontWeight = "bold";
        GameManager.subtitleTextDIV.style.textShadow = "1px 1px 0px night";
        GameManager.subtitleTextDIV.style.letterSpacing = "2px";
        GameManager.subtitleTextDIV.style.color = "white";
        GameManager.subtitleDIV.appendChild(GameManager.subtitleTextDIV);

        document.body.appendChild(GameManager.subtitleDIV);
    }
}


/*public methods*/
/*Public methods*/

GameManager.resumeGame = function () {
    var app = GameManager._app;
    app.fire("hidemenu");
}

GameManager.newGame = function () {
    GameManager.loadScene("mansion");
}

GameManager.loadScene = function (sceneName) {
    var app = GameManager._app;
    if (!app) return;
    // Find the Scene Registry Item by the name of the scene
    const sceneItem = app.scenes.find(sceneName);

    if (!sceneItem) {
        console.error("The scene '" + sceneName + "' does not exists.");
        return;
    }




    app.autoRender = false;

    GameManager.showsceneloader(sceneName, function () {


        GameManager.showAssetLoader();
        Timer.clearAllTimers();/*DESTROYS ALL TIMERS IN CURRENT SCENE*/
        GameManager.freeAssets();

        // Obtener la entidad raíz
        var rootEntity = app.root;

        var anims = rootEntity.findComponents("anim"),
            i = 0;
        for (; i < anims.length; i++) {
            anims[i].entity.removeComponent("anim");
        }

        var rigids = rootEntity.findComponents("rigidbody"),
            i = 0;
        for (; i < rigids.length; i++) {
            rigids[i].entity.removeComponent("rigidbody");
        }

        var renders = rootEntity.findComponents("render"),
            i = 0;
        for (; i < renders.length; i++) {
            renders[i].entity.removeComponent("render");
        }

        var scripts = rootEntity.findComponents("script"),
            i = 0;
        for (; i < scripts.length; i++) {
            var entity = scripts[i].entity;
            if (entity.script) {
                let propiedades = Object.getOwnPropertyNames(entity.script);
                for (var s = 0; s < propiedades.length; s++) {
                    if (entity.script[propiedades[s]] instanceof pc.ScriptType &&
                        (propiedades[s] !== this.__name)) {
                        try {
                            entity.script.destroy(propiedades[s]);
                        } catch (e) {
                            console.warn("script " + propiedades[s] + " destruido con error: " + e);
                        }
                    }
                }
            }

            entity.removeComponent("script");
        }

        app.scenes.changeScene(sceneName, function (err, loadedSceneRootEntity) {
            if (err) {
                console.error(err);
                alert(err);
            } else {

                GameManager.currentScene = sceneName;
                GameManager.calculateSceneAssets(loadedSceneRootEntity, function () {


                    for (let key in app.loader._cache) {
                        if (app.loader._cache.hasOwnProperty(key)) {
                            let value = app.loader._cache[key];

                            if (value instanceof pc.Texture) {
                                app.loader.clearCache(key, "texture");
                            }

                        }
                    }

                    GameManager.currentCamera = GameManager.calculateCameraScene();
                    GameManager.applyCameraPostProcessing(GameManager.cameraPostProcessing);
                    GameManager.input.camera = GameManager.currentCamera;
                    GameManager.followCamera.initialFov = GameManager.currentCamera ? GameManager.currentCamera.fov : 45;

                    GameManager.checkForPlayerAndTargetEntities = true;
                    app.autoRender = true;

                    app.fire("hidemenu");
                    GameManager.hidesceneloader();


                    GameManager.showSubtitle("The scene " + GameManager.currentScene + " has loaded...");




                });




            }
        });

    });

}

GameManager.calculateCameraScene = function () {
    var app = GameManager._app;
    if (!app) return null;

    var cameras = app.scene.root.findComponents("camera");
    cameras = cameras.sort((a, b) => a.priority - b.priority);


    if (!(cameras.length)) {
        /*TODO: DEBE CREAR LA CAMARA*/
    }

    if (cameras.length) {

        var camera = cameras[0];


        return camera;
    }
}

GameManager.applyCameraPostProcessing = function (options) {
    var app = GameManager._app;
    if (!app) return null;

    if (options.enabled) {

        var cameraFrame = new pc.CameraFrame(app, GameManager.currentCamera);

        app.scene.skyboxHighlightMultiplier = 100;
        //app.scene.skyboxIntensity = 0.1;
        cameraFrame.rendering.samples = 4;
        cameraFrame.rendering.toneMapping = pc.TONEMAP_LINEAR;

        cameraFrame.bloom.enabled = options.bloom;
        cameraFrame.bloom.intensity = 0.1;
        //cameraFrame.bloom.blur = 4;


        cameraFrame.vignette.inner = 0.5;
        cameraFrame.vignette.outer = 1;
        cameraFrame.vignette.curvature = 0.5;
        cameraFrame.vignette.intensity = 0.75;

        cameraFrame.taa.enabled = options.taa;
        cameraFrame.taa.jitter = 1;

        //cameraFrame.rendering.sharpness = 1;
        //cameraFrame.debug = "scene";


        cameraFrame.ssao.type = options.ssao ? "combine" : "none";
        cameraFrame.ssao.blurEnabled = options.ssao;
        cameraFrame.ssao.intensity = 1;
        cameraFrame.ssao.power = 1;
        cameraFrame.ssao.radius = 1;
        cameraFrame.ssao.samples = 4;
        cameraFrame.ssao.minAngle = 0;
        cameraFrame.ssao.scale = 1;

        /*
                    cameraFrame.grading.enabled = true;
                    cameraFrame.grading.saturation = 1.5;
        */


        /*https://greggman.github.io/LUT-to-PNG/
        https://freshluts.com/most_popular_luts?page=4
        https://o-l-l-i.github.io/lut-maker/
        */

        var colorLUT = app.assets.find("luck.cube-s32.png");
        cameraFrame.colorLUT.texture = colorLUT.resource;
        cameraFrame.colorLUT.intensity = options.lut ? 1.0 : 0.0;


        cameraFrame.update();

    } else {
        GameManager.currentCamera.renderPasses = [];
    }

}



GameManager.freeAssets = function () {
    var app = GameManager._app;
    if (!app) return;
    var assets = app.assets.list();

    var i = 0;
    const assets_length = assets.length,
        excludeAssets = ["gamemanager.js", "ui.js", "ammo.js", "ammo.wasm.js", "ammo.wasm.wasm", "draco.js", "draco.wasm.js", "draco.wasm.wasm", "basis.js", "basis.wasm.js", "basis.wasm.wasm"],
        includeTypes = ["container", "render", "texture", "material"];
    for (; i < assets_length; i++) {
        var asset = assets[i];
        const canUnload = includeTypes.some(type => type.toLowerCase() === asset.type.toLowerCase());
        if (canUnload && asset.loaded) {
            for (var r = 0; r < asset.resources.length; r++) {
                //asset.resources[r].destroy();
                asset.resources[r];

            }

            asset.unload();
        }
    }
}

GameManager.showAssetLoader = function (assetname) {
    if (GameManager.__assetLoaderTimeout) {
        clearTimeout(GameManager.__assetLoaderTimeout);
    }

    //GameManager.loadingDIV.innerHTML = assetname;

    GameManager.fadeIn(GameManager.loadingDIV, 250, function () {
        GameManager.__assetLoaderTimeout = setTimeout(function () {
            GameManager.fadeOut(GameManager.loadingDIV, 250, function () {
                //GameManager.loadingDIV.innerHTML = "";
            });
        }, 1000);

    });
}

GameManager.assetLoaded = function (asset) {
    GameManager.showAssetLoader(asset.name);

    if (asset.type === "texture") {

    }

}


GameManager.fadeOut = function (element, duration, callback) {
    let start = null; // Tiempo de inicio de la animación
    const initialOpacity = parseFloat(window.getComputedStyle(element).opacity); // Opacidad inicial
    const opacityStep = initialOpacity / (duration / 1000 * 60); // Paso de cambio de opacidad por cuadro (60 cuadros por segundo)

    // Función de animación
    function animate(timestamp) {
        if (!start) start = timestamp; // Establece el tiempo de inicio

        // Calcula el progreso de la animación
        const progress = timestamp - start;
        let opacity = initialOpacity - opacityStep * progress; // Calcula la nueva opacidad

        // Limita la opacidad para asegurar que no sea menor que cero
        opacity = Math.max(opacity, 0);

        // Aplica la nueva opacidad al elemento
        element.style.opacity = opacity;

        // Continúa la animación si no ha terminado
        if (progress < duration) {
            requestAnimationFrame(animate); // Solicita el siguiente cuadro de animación
        } else {
            element.style.display = 'none'; // Oculta el elemento al finalizar la animación
            if (typeof callback === 'function') {
                callback(); // Ejecuta la función de callback si está definida y es una función
            }
        }
    }

    // Inicia la animación
    requestAnimationFrame(animate);
}

GameManager.fadeIn = function (element, duration, callback) {
    let start = null; // Tiempo de inicio de la animación
    const initialOpacity = parseFloat(window.getComputedStyle(element).opacity); // Opacidad inicial actual del elemento
    const finalOpacity = 1; // Opacidad final que queremos alcanzar
    const opacityStep = (finalOpacity - initialOpacity) / (duration / 1000 * 60); // Paso de cambio de opacidad por cuadro (60 cuadros por segundo)

    // Aseguramos que el elemento esté inicialmente invisible para el efecto fadeIn
    element.style.opacity = initialOpacity;
    element.style.display = 'block'; // Asegura que el elemento esté visible antes de la animación

    // Función de animación
    function animate(timestamp) {
        if (!start) start = timestamp; // Establece el tiempo de inicio

        // Calcula el progreso de la animación
        const progress = timestamp - start;
        let opacity = initialOpacity + opacityStep * progress; // Calcula la nueva opacidad

        // Limita la opacidad para asegurar que esté dentro del rango válido (0 a 1)
        opacity = Math.min(opacity, finalOpacity);

        // Aplica la nueva opacidad al elemento
        element.style.opacity = opacity;

        // Continúa la animación si no ha terminado
        if (progress < duration) {
            requestAnimationFrame(animate); // Solicita el siguiente cuadro de animación
        } else {
            if (typeof callback === 'function') {
                callback(); // Ejecuta la función de callback si está definida y es una función
            }
        }
    }

    // Inicia la animación
    requestAnimationFrame(animate);
}

GameManager.hidesceneloader = function (callback) {
    GameManager.fadeOut(GameManager.sceneLoaderDIV, 1000, function () {
        if (typeof callback === "function") {
            callback(); // Ejecuta la función de callback si está definida y es una función
        }
    });
}

GameManager.showsceneloader = function (sceneName, callback) {
    GameManager.fadeIn(GameManager.sceneLoaderDIV, 1000, function () {
        if (typeof callback === "function") {
            callback(); // Ejecuta la función de callback si está definida y es una función
        }
    });
}


GameManager.calculateSceneAssets = function (loadedSceneRootEntity, callback) {

    function waitForAssetsToLoad(sceneRootEntity, app, maxTime) {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkAssets = () => {
                const assetsToLoad = [];

                // Encontrar todos los componentes de render en la raíz de la escena
                const renders = sceneRootEntity.findComponents("render")
                    .filter(params => params.type === "asset" && params.materialAssets.length !== 0);

                renders.forEach(render => {
                    // Verificar el asset asociado al componente de render
                    if (render.asset !== 0 && !assetsToLoad.find(a => a.id === render.asset)) {
                        const asset = app.assets.get(render.asset);
                        if (!asset.loaded) {
                            assetsToLoad.push(asset);
                        }
                    }

                    // Verificar los materiales asociados al componente de render
                    const materials = Array.isArray(render.material) ? render.material : [render.material];
                    materials.forEach(material => {
                        const assetReferences = material._assetReferences;
                        for (const propName in assetReferences) {
                            if (assetReferences.hasOwnProperty(propName)) {
                                const assetId = ((assetReferences[propName] || {}).asset || {}).id || 0;
                                if (assetId !== 0 && !assetsToLoad.find(a => a.id === assetId)) {
                                    const asset = app.assets.get(assetId);
                                    if (!asset.loaded) {
                                        assetsToLoad.push(asset);
                                    }
                                }
                            }
                        }
                    });
                });

                // Verificar si todos los assets están cargados
                if (assetsToLoad.length === 0) {
                    resolve();
                } else if (Date.now() - startTime >= maxTime) {
                    reject(new Error('Tiempo máximo de carga de assets alcanzado.'));
                } else {
                    setTimeout(checkAssets, 100); // Revisar cada 100ms
                }
            };

            checkAssets();
        });
    }

    // Uso:
    waitForAssetsToLoad(loadedSceneRootEntity, GameManager._app, 60000)
        .then(() => {
            if (typeof callback === "function") {
                callback(); // Ejecuta la función de callback si está definida y es una función
            }
            return;
        })
        .catch((error) => {
            if (typeof callback === "function") {
                callback(error);
            }
            return;
        });

}

/********************************************** */
/*       S U B T I T L E S                      */
/********************************************** */

GameManager.showSubtitle = function (text) {
    if (!GameManager.enableSubtitles) return;

    if (GameManager.__subtitleTimeout) {
        clearTimeout(GameManager.__subtitleTimeout);
    }

    GameManager.subtitleTextDIV.innerHTML = text;
    GameManager.subtitleBackgroundDIV.style.display = "block";
    GameManager.fadeIn(GameManager.subtitleDIV, 250, function () {
        GameManager.__subtitleTimeout = setTimeout(function () {
            GameManager.fadeOut(GameManager.subtitleDIV, 1000, function () {
                GameManager.subtitleTextDIV.innerHTML = "";
                GameManager.subtitleBackgroundDIV.style.display = "none";
            });
        }, 5000);

    });


}

/********************************************** */
/*       T R A C E R                           */
/********************************************** */

TracerScript.initialize = function () {


    TracerScript.div = document.createElement("DIV");
    TracerScript.div.id = "tracer";
    TracerScript.div.style.backgroundColor = "black";
    TracerScript.div.style.color = "white";
    TracerScript.div.style.position = "absolute";
    TracerScript.div.style.left = "0px";
    TracerScript.div.style.top = "2em";
    TracerScript.div.style.buttom = "2em";
    document.body.appendChild(TracerScript.div);

    TracerScript.divValues = document.createElement("DIV");
    TracerScript.divValues.id = "tracer_values";
    TracerScript.divValues.style.color = "#80FF00";
    TracerScript.divValues.style.backgroundColor = "black";
    TracerScript.divValues.style.position = "absolute";
    TracerScript.divValues.style.fontFamily = "'Courier New', Courier, monospace";
    TracerScript.divValues.style.backgroundColor = "rgba(0, 0, 0, 0.5)"; /* Gris semi-transparente */

    TracerScript.divValues.style.top = "2em";
    TracerScript.divValues.style.buttom = "2em";
    TracerScript.divValues.style.right = "0px";
    TracerScript.divValues.style.left = "60%";
    document.body.appendChild(TracerScript.divValues);

    if (TracerScript.trenablelightingdebugLayer) {
        GameManager._app.scene.lighting.debugLayer = GameManager._app.scene.layers.getLayerByName("World").id;
    }

    TracerScript.__tracer_busy = false;


};

TracerScript.print = async function (text, value) {

    if (!TracerScript.trenable) return;
    function esperar() {
        // Mientras la variable no esté libre, espera
        if (TracerScript.__tracer_busy) {
            requestAnimationFrame(esperar.bind(this)); // Espera hasta el próximo cuadro de animación
        } else {

            TracerScript.__tracer_busy = true;

            if (TracerScript.div.style.display === 'none') {
                TracerScript.div.style.display = "block";
                TracerScript.divValues.style.display = "block";
                TracerScript.div.innerHTML = text + "";
            } else {
                requestAnimationFrame(function () {
                    if (typeof (value) === "undefined") {
                        var lines = TracerScript.div.innerHTML.split("<br>");

                        if (TracerScript.trordermode === "oldestfirst") {
                            lines.unshift(text);
                            lines = lines.slice(0, 25);
                        } else if (TracerScript.trordermode === "newlestlast") {
                            lines.push(text);
                            lines = lines.slice(-25);
                        }
                        TracerScript.div.innerHTML = lines.join("<br>");

                    } else {
                        TracerScript.linesValues[text || "unnamed"] = value;
                        try {
                            TracerScript.divValues.innerHTML = JSON.stringify(TracerScript.linesValues, null, 0).replace(/,/g, "<br>").replace(/{/g, "").replace(/}/g, "");
                        } catch { }
                    }


                });
            }





            TracerScript.__tracer_busy = false;
        }
    }

    if (TracerScript.timer) {
        clearTimeout(TracerScript.timer);
    }

    TracerScript.timer = setTimeout(function () {
        if (TracerScript.tralwaysshow) {
            TracerScript.div.style.display = 'block';
            TracerScript.divValues.style.display = 'block';
        } else {
            TracerScript.div.style.display = 'none';  // Ocultar el div
            TracerScript.divValues.style.display = 'none';
        }
    }, 3000);

    esperar();
};


async function Trace(text, value) {
    if (TracerScript) {
        TracerScript.print(text, value);
    }
}
async function Tracer(text, value) {
    if (TracerScript) {
        TracerScript.print(text, value);
    }
}


/*********************************//*********************************//*********************************/
/*********************************//*********************************//*********************************/
/*********************************//*********************************//*********************************/
/*********************************//*********************************//*********************************/
GameManager.createCircularMenu = function (circularMenuConfig) {
    var ele = document.getElementById('circle-menu1');
    if (!ele) return;


    const rect = GameManager.menuDIV.getBoundingClientRect();

    var cmenu = CMenu(ele)
        .config({
            totalAngle: 360,//deg,
            spaceDeg: 2,//deg
            background: "#323232",
            backgroundHover: "#123321",
            pageBackground: "#0c0c0c",
            percent: 0.25,//%
            diameter: ((rect.width || screen.width) || 600) / 4,//px
            position: 'top',
            horizontal: true,
            start: -45,//deg
            animation: "into",
            hideAfterClick: false,
            menus: [
                {
                    title: 'resume',
                    icon: 'fa fa-circle',
                    /*
                    href: {
                        url: "http://github.com",
                        blank: false
                    },
                    */
                    click: function (e, data) {
                        GameManager.resumeGame();
                    },
                    menus: [
                        {
                            title: 'menu1-1',
                            icon: 'fa fa-circle',
                        },
                        {
                            title: 'menu1-2',
                            icon: 'fa fa-cc-visa'
                        }
                    ]
                },
                {
                    disabled: true,
                    title: '菜单2',
                    icon: 'my-icon icon1',
                    href: '#2'
                },
                {
                    title: 'menu3',
                    disabled: function () {
                        return true;
                    },
                    icon: '',
                    href: '#3'
                },
                {
                    title: '菜单4',
                    icon: 'my-icon icon2',
                    href: '#4',
                    menus: [
                        {
                            title: 'menu4-1',
                            icon: 'fa fa-circle'
                        },
                        {
                            title: 'menu4-2',
                            icon: 'fa fa-cc-visa'
                        },
                        {
                            title: 'menu4-3',
                            icon: 'fa fa-cc-visa'
                        },
                        {
                            title: 'menu4-1',
                            icon: 'fa fa-circle'
                        },
                        {
                            title: 'menu4-2',
                            icon: 'fa fa-cc-visa'
                        },
                        {
                            title: 'menu4-3',
                            icon: 'fa fa-cc-visa'
                        }
                    ]
                }, {
                    title: 'menu5',
                    icon: '',
                    href: '#5',
                    menus: [
                        {
                            title: 'menu1-1',
                            icon: 'fa fa-circle'
                        },
                        {
                            title: 'menu1-2',
                            icon: 'fa fa-cc-visa'
                        }
                    ]
                },
                {
                    title: '菜单6',
                    icon: '',
                    href: '#6',
                    menus: [
                        {
                            title: 'menu6-1',
                            icon: 'fa fa-circle'
                        }
                    ]
                },
                {
                    title: 'menu7',
                    icon: 'my-icon icon3',
                    href: '#7'
                },
                {
                    title: '菜单8',
                    icon: '',
                    href: '#8'
                }
            ]
        });
    cmenu.styles({
        top: '50%',
        left: '50%',
        //width: '100%',
    });
    cmenu.show();

};


//circular-menu
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && define.amd ? define(factory) :
            (global.CMenu = factory());
}(this, function () {
    'use strict';

    function rotateDeg(i) {
        return this.startDeg + this.rotateUnit * i;
    }

    function rotateDeg$1(i) {
        return - (this.rotateDeg(i) + this.unskewDeg);
    }

    function startDeg(config) {
        var top = -(config.totalAngle - 180) / 2,
            positions = {
                top: top,
                left: top - 90,
                right: top + 90,
                bottom: top + 180
            };

        return config.start !== undefined ? config.start : positions[config.position];
    }

    const antialiasing = 3;

    function coverRadius(radius, percent) {
        var square = radius * radius * 2;
        return Math.sqrt(square) * percent + antialiasing;
    }

    function coverSize(coverRadius) {
        var l = coverRadius * 2;
        var m = -l / 2;

        l += "px";
        m += "px";

        return {
            width: l,
            height: l,
            marginLeft: m,
            marginTop: m
        };
    }

    function menuSize(config) {
        var l = config.diameter;
        var m = - config.diameter / 2;

        l += "px";
        m += "px";

        return {
            width: l,
            height: l,
            marginLeft: m,
            marginTop: m
        };
    }

    const fixedTop = 10;

    function clickZoneSize(config) {
        var l = config.diameter;
        var m = - config.diameter / 2;

        l += "px";
        m += "px";

        return {
            width: l,
            height: l,
            marginRight: m,
            marginBottom: m
        };
    }

    function listSize(config) {
        var l = (config.diameter / 2) + 'px';

        return {
            width: l,
            height: l
        };
    }

    const middleRatio = 0.41;

    function textTop(clickZoneRadius) {
        return clickZoneRadius * middleRatio - fixedTop + 'px';

    }

    function Calculation(config) {
        this._config = config;

        var c = this.config = config,
            itemsNum = c.menus.length,
            spaceNumber = c.totalAngle === 360 ? itemsNum : itemsNum - 1;

        this.radius = config.diameter / 2;
        this.coverRadius = coverRadius(this.radius, config.percent);
        this.clickZoneRadius = this.radius - this.coverRadius;



        this.listSize = listSize(config);
        this.clickZoneSize = clickZoneSize(config);
        this.menuSize = menuSize(config);
        this.coverSize = coverSize(this.coverRadius);
        this.startDeg = startDeg(config);
        this.centralDeg = (c.totalAngle - (c.spaceDeg * spaceNumber)) / itemsNum;
        this.rotateUnit = this.centralDeg + c.spaceDeg;
        this.skewDeg = 90 - this.centralDeg;
        this.unskewDeg = - (90 - this.centralDeg / 2);
        this.textTop = textTop(this.clickZoneRadius);
    }

    Calculation.prototype = {
        constructor: Calculation,
        rotateDeg: rotateDeg,
        horizontalDeg: rotateDeg$1
    };

    function createLists(parent) {

        this._config.menus.forEach(function (v, k) {

            this._createList(parent, v, k);

        }, this);

    }

    function defaultView(node) {
        return (node.ownerDocument && node.ownerDocument.defaultView) // node is a Node
            || (node.document && node) // node is a Window
            || node.defaultView; // node is a Document
    }

    function styleRemove(name) {
        this.style.removeProperty(name);
    }

    function styleConstant(name, value, priority) {
        this.style.setProperty(name, value, priority);
    }

    function styleFunction(name, value, priority) {
        var v = value.apply(this, arguments);
        if (v == null) this.style.removeProperty(name);
        else this.style.setProperty(name, v, priority);
    }

    function style(ele, name, value, priority) {

        var node;
        return arguments.length > 1
            ? ((value == null
                ? styleRemove : typeof value === "function"
                    ? styleFunction
                    : styleConstant).call(ele, name, value, priority == null ? "" : priority))
            : defaultView(node = ele)
                .getComputedStyle(node, null)
                .getPropertyValue(name);
    }

    function createList(parent, data, index) {

        var list = document.createElement('li');
        list.setAttribute('tabindex', '-1');
        style(list, 'width', this._calc.listSize.width);
        style(list, 'height', this._calc.listSize.height);
        style(list, 'transform', 'rotate(' + this._calc.rotateDeg(index) + 'deg) skew(' + this._calc.skewDeg + 'deg)');

        parent.appendChild(list);

        this._createAnchor(list, data, index);

    }

    function classArray(string) {
        return string.trim().split(/^|\s+/);
    }

    function classList(node) {
        return node.classList || new ClassList(node);
    }

    function ClassList(node) {
        this._node = node;
        this._names = classArray(node.getAttribute("class") || "");
    }

    ClassList.prototype = {
        add: function (name) {
            var i = this._names.indexOf(name);
            if (i < 0) {
                this._names.push(name);
                this._node.setAttribute("class", this._names.join(" "));
            }
        },
        remove: function (name) {
            var i = this._names.indexOf(name);
            if (i >= 0) {
                this._names.splice(i, 1);
                this._node.setAttribute("class", this._names.join(" "));
            }
        },
        contains: function (name) {
            return this._names.indexOf(name) >= 0;
        }
    };

    function classedAdd(node, names) {
        var list = classList(node), i = -1, n = names.length;
        while (++i < n) list.add(names[i]);
    }

    function classedRemove(node, names) {
        var list = classList(node), i = -1, n = names.length;
        while (++i < n) list.remove(names[i]);
    }

    function classedTrue(names) {
        classedAdd(this, names);
    }

    function classedFalse(names) {
        classedRemove(this, names);
    }

    function classedFunction(names, value) {
        (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
    }

    function classed(ele, name, value) {
        var names = classArray(name + "");

        if (arguments.length < 2) {
            var list = classList(this), i = -1, n = names.length;
            while (++i < n) if (!list.contains(names[i])) return false;
            return true;
        }

        var callee = (typeof value === "function"
            ? classedFunction : value
                ? classedTrue
                : classedFalse).call(ele, names, value);
    }

    var UID = {
        _current: 0,
        getNew: function () {
            this._current++;
            return this._current;
        }
    };
    function styleSheet(element, prop, value, pseudo) {

        var _this = element;
        var _sheetId = "sheetStyles";
        var _head = document.head || document.getElementsByTagName('head')[0];
        var _sheet = document.getElementById(_sheetId) || document.createElement('style');
        _sheet.id = _sheetId;
        var className = "s-S" + UID.getNew();

        _this.className += " " + className;



        _sheet.innerHTML += " ." + className + (pseudo ? (":" + pseudo) : "") + "{" + prop + ":" + value + "}";
        _head.appendChild(_sheet);
        return this;
    };

    function on(ele, type, callback, data) {
        ele.addEventListener(type, function (e) {
            callback.call(this, e, data);
        });
    }

    function createMenu() {
        var p = this._container;

        classed(p, 'circular-menu', true);
        style(p, 'width', this._calc.menuSize.width);
        style(p, 'height', this._calc.menuSize.height);
        style(p, 'margin-top', this._calc.menuSize.marginTop);
        style(p, 'margin-left', this._calc.menuSize.marginLeft);

        var self = this;
        on(p, "click", function (e) {
            if (e.toElement === p) {
                self._cMenu.hide();
            }
        });
        setTimeout(function () {
            style(p, 'display', 'block');
        }, 100);

        styleSheet(p, 'width', this._calc.coverSize.width, 'after');
        styleSheet(p, 'height', this._calc.coverSize.height, 'after');
        styleSheet(p, 'margin-left', this._calc.coverSize.marginLeft, 'after');
        styleSheet(p, 'margin-top', this._calc.coverSize.marginTop, 'after');
        styleSheet(p, 'border', "3px solid " + this._config.pageBackground, 'after');


        var ul = p.appendChild(document.createElement('ul'));
        this._createLists(ul);
    }

    function hasSubMenus(menus) {
        return menus instanceof Array && menus.length !== 0;
    }
    function ifDisabled(disabled) {
        if (disabled instanceof Function)
            return disabled();
        else
            return Boolean(disabled);
    }

    function setHref(ele, href) {
        if (!href) return;

        if (href instanceof Object) {
            ele.href = href.url;
            ele.target = href.blank ? "_blank" : "";
        } else {
            ele.href = href;
        }
    }



    var delayShow = null;// delayShow reference the last setTimeout triggered by any one of menu item(anchor)

    function createAnchor(parent, data, index) {
        var self = this;

        var delayHide = null;// delayHide reference the last setTimeout triggered by the menu item itself

        var a = document.createElement('a');
        a.setAttribute('tabindex', '-1');

        setHref(a, data.href);

        a.setDisabled = function () {
            classed(a, 'disabled', ifDisabled(data.disabled));
        };
        this._anchors.push(a);


        style(a, 'width', this._calc.clickZoneSize.width);
        style(a, 'height', this._calc.clickZoneSize.height);
        style(a, 'right', this._calc.clickZoneSize.marginRight);
        style(a, 'bottom', this._calc.clickZoneSize.marginBottom);
        style(a, 'transform', 'skew(' + -this._calc.skewDeg + 'deg) rotate(' + this._calc.unskewDeg + 'deg) scale(1)');

        classed(a, 'disabled', ifDisabled(data.disabled));


        var percent = this._config.percent * 100 + "%";
        styleSheet(a, 'background', 'radial-gradient(transparent ' + percent + ', ' + this._config.background + ' ' + percent + ')');
        styleSheet(a, 'background', 'radial-gradient(transparent ' + percent + ', ' + this._config.backgroundHover + ' ' + percent + ')', 'hover');


        function clickCallBack(e, data) {
            if (data.click) data.click.call(this, e, data);

            if (self._config.hideAfterClick) {
                self._cMenu.hide();
                if (self._cMenu._pMenu) self._cMenu._pMenu.hide();
                if (subMenu) subMenu.hide();
            }
        }

        on(a, 'click', clickCallBack, data);

        parent.appendChild(a);

        this._createHorizontal(a, data, index);


        //toggle subMenu
        if (hasSubMenus(data.menus)) {
            var subMenu = this._createSubMenu(self, data.menus, index);

            on(a, 'mouseenter', function () {
                delayShow = setTimeout(function () {
                    subMenu
                        .styles({
                            top: self._container.offsetTop + self._calc.radius + 'px',
                            left: self._container.offsetLeft + self._calc.radius + 'px'
                        })
                        .show();
                }, 150);
                try {
                    const audio = document.getElementById('audio-menu-hover');
                    audio.pause();
                    audio.currentTime = 0;  // Reiniciar el audio al principio
                    audio.play();
                } catch { }

            });

            on(a, 'mouseleave', function (e) {
                if (!subMenu._container.contains(e.toElement)) {
                    delayHide = setTimeout(function () {
                        subMenu.hide();
                    }, 200);
                }
            });

            on(subMenu._container, 'mouseenter', function () {
                clearTimeout(delayShow);
                clearTimeout(delayHide);
                try {
                    const audio = document.getElementById('audio-menu-hover');
                    audio.pause();
                    audio.currentTime = 0;  // Reiniciar el audio al principio
                    audio.play();
                } catch { }

            });

            on(subMenu._container, 'mouseleave', function (e) {
                if (!a.contains(e.toElement) || e.toElement.children[0] === a) {
                    subMenu.hide();
                }
            });
        }
    }

    const sizeRatio = 0.65;
    const marginTopRatio = 0.2;
    const fontHeight = 13;

    function hasIcon(icon) {
        if (icon === undefined) return false;
        else if (typeof icon === "string") return icon !== "";
        else return icon.length && icon[0] !== "";
    }

    function getIcon(icon) {
        return typeof icon === "string" ? icon : icon[0];
    }

    function getIconColor(icon) {
        return typeof icon === "string" ? null : icon[1];
    }

    function createIcon(parent, data, index) {
        if (!hasIcon(data.icon)) return;

        var span = document.createElement('span');
        span.setAttribute('tabindex', '-1');

        var icon = getIcon(data.icon),
            color = getIconColor(data.icon);

        classed(span, icon + " cm-icon", true);
        style(span, 'color', color);

        var l = this._calc.clickZoneRadius * sizeRatio - fontHeight + "px",
            m = this._calc.clickZoneRadius * marginTopRatio - fontHeight + "px";
        style(span, 'width', l);
        style(span, 'height', l);
        style(span, 'font-size', l);
        style(span, 'margin-top', m);

        span.addEventListener('mouseenter', function () {
            const audio = document.getElementById('audio-menu-hover');
            audio.currentTime = 0;  // Reiniciar el audio al principio
            audio.play();
        });

        parent.appendChild(span);
    }

    const withIconMarginTop = "3px";
    const withIconTop = "-3px";

    function createText(parent, data, index) {

        var span = document.createElement('span');
        span.setAttribute('tabindex', '-1');
        span.textContent = data.title;

        classed(span, 'text', true);
        style(span, 'margin-top', hasIcon(data.icon) ? withIconMarginTop : this._calc.textTop);
        style(span, 'top', hasIcon(data.icon) ? withIconTop : 0);

        span.onmouseenter = function (e) {
            const audio = document.getElementById('audio-menu-hover');
            audio.currentTime = 0;  // Reiniciar el audio al principio
            audio.play();
        };


        parent.appendChild(span);
    }

    function createHorizontal(parent, data, index) {

        var div = document.createElement('div');
        div.setAttribute('tabindex', '-1');
        classed(div, "horizontal", true);

        if (this._config.horizontal) style(div, 'transform', 'rotate(' + this._calc.horizontalDeg(index) + 'deg)');

        parent.appendChild(div);

        this._createIcon(div, data, index);
        this._createText(div, data, index);
    }

    function extend$1() {
        // Variables
        var extended = {};
        var deep = false;
        var i = 0;
        var length = arguments.length;

        // Check if a deep merge
        if (Object.prototype.toString.call(arguments[0]) === '[object Boolean]') {
            deep = arguments[0];
            i++;
        }

        // Merge the object into the extended object
        var merge = function (obj) {
            for (var prop in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                    // If deep merge and property is an object, merge properties
                    if (deep && Object.prototype.toString.call(obj[prop]) === '[object Object]') {
                        extended[prop] = extend(true, extended[prop], obj[prop]);
                    } else {
                        extended[prop] = obj[prop];
                    }
                }
            }
        };

        // Loop through each object and conduct a merge
        for (; i < length; i++) {
            var obj = arguments[i];
            merge(obj);
        }

        return extended;

    };

    const sizeRatio$1 = 5 / 3;
    const percentRatio = 0.45;
    const centralDegRatio = 0.618;


    function createSubMenu(creator, menus, index) {
        var subMenu = document.createElement('div');
        subMenu.setAttribute('tabindex', '-1');

        classed(subMenu, 'circular-sub-menu', true);

        this._container.parentNode.insertBefore(subMenu, this._container);

        var totalAngle = this._calc.centralDeg * centralDegRatio * menus.length;
        var startDeg = this._calc.rotateDeg(index) - totalAngle / 2 + this._calc.centralDeg / 2;

        var config = extend$1(this._config, {
            totalAngle: totalAngle,//deg,
            percent: percentRatio,//%
            diameter: this._config.diameter * sizeRatio$1,//px
            start: startDeg,//deg
            animation: "into",
            menus: menus
        });

        return new CMenu(subMenu, creator._cMenu)
            .config(config);
    }

    function Creator(cMenu, config) {
        this._cMenu = cMenu;
        this._container = cMenu._container;
        this._config = config;
        this._calc = new Calculation(config);
        this._anchors = [];
    }


    Creator.prototype = {
        constructor: Creator,
        createMenu: createMenu,
        _createLists: createLists,
        _createList: createList,
        _createAnchor: createAnchor,
        _createText: createText,
        _createHorizontal: createHorizontal,
        _createIcon: createIcon,
        _createSubMenu: createSubMenu
    };

    const defaultConfig = {
        totalAngle: 360,//deg,
        spaceDeg: 2,//deg
        background: "#323232",
        backgroundHover: "#515151",
        pageBackground: "transparent",
        percent: 0.25,//%
        diameter: 300,//px
        position: 'top',
        horizontal: true,
        animation: "into",
        hideAfterClick: true
    };


    function config(config) {

        config = extend$1(defaultConfig, config);

        this._creator = new Creator(this, config);
        this._creator.createMenu();

        return this;
    }

    function setCoordinate(coordinate) {
        if (!(coordinate instanceof Array) || !(coordinate.length === 2)) return;

        //TODO verify if has unit
        style(this._container, 'left', coordinate[0] + "px");
        style(this._container, 'top', coordinate[1] + "px");
    }

    //check disabled

    function setDisabled() {
        this._creator._anchors.forEach(function (v) {
            v.setDisabled();
        });
    }

    function show(coordinate) {


        setDisabled.call(this);

        setCoordinate.call(this, coordinate);

        classed(this._container, 'opened-nav', true);
        return this;
    }

    function hide() {
        classed(this._container, 'opened-nav', false);
        return this;
    }

    function styles(styles) {
        if (!styles instanceof Object) return this;

        for (var k in styles) {
            if (styles.hasOwnProperty(k)) style(this._container, k, styles[k]);
        }

        return this;
    }

    function CMenu(element, pMenu) {
        this._container = element;

        if (pMenu) this._pMenu = pMenu;
    }

    CMenu.prototype = {
        constructor: CMenu,
        config: config,
        show: show,
        hide: hide,
        styles: styles

    };

    function index(selector) {
        return typeof selector === "string"
            ? new CMenu(document.querySelector(selector))
            : new CMenu(selector);
    }

    return index;

}));


function uiGameHTML() {
    return `

<style type="text/css">
    *:not(canvas) {
        transition: all 0.3s ease-in-out;
        outline: none;
    }

    html,
    body {
        background-color: black;
        color: white;
        margin: 0;
        padding: 0;
    }


    /************************************************/
    .fade-out {
        opacity: 0;
        transition: opacity 1s ease-in-out;
    }

    /************************************************/
    .menu-center {
        display: flex;
        justify-content: center;
        align-items: center;
        position: absolute;
        top: 0px;
        left: 0px;
        right: 0px;
        bottom: 0px;
    }

    .menu {
        color: white;
        background-color: rgb(1, 1, 1);
        /* Color de fondo del menú */
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        /* Sombra opcional */
        text-align: center;
        max-width: 80%;
        /* Ancho máximo del menú para evitar que sea demasiado ancho en pantallas grandes */
        border: 2px solid rgb(4, 4, 4);
    }

    .menu h1 {
        margin-bottom: 20px;
    }

    .menu ul {
        list-style-type: none;
        padding: 0;
    }

    .menu ul li {
        margin-bottom: 10px;
    }

    .menu ul li a {
        text-decoration: none;
        color: #6f6f6f;
        /* Color del texto de las opciones */
        font-weight: bold;
        font-size: 18px;

    }

    .menu ul li a:hover {
        color: #007bff;
        /* Cambia el color al pasar el mouse por encima */
    }
</style>


<style type="text/css">
    .circular-menu {
        font-family: "Helvetica Neue", Helvetica, "Hiragino Sans GB", "STHeitiSC-Light", "Microsoft YaHei", Arial, sans-serif;
        /*z-index: 1040;*/
        border-radius: 50%;
        background: transparent;
        opacity: 0;
        position: fixed;
        display: none;
        cursor: default;
        transform: scale(0.1);
        pointer-events: none;
        overflow: hidden;
        /*cover to prevent extra space of anchors from being clickable*/
    }


    .circular-menu.circular-sub-menu {
        /*transition: all 0s ease 0s;*/
    }


    .circular-menu.circular-sub-menu:after {
        display: none;
    }


    .circular-menu:after {
        content: ".";
        display: block;
        position: absolute;
        left: 50%;
        top: 50%;
        border-radius: 50%;
        z-index: 10;
        color: transparent;
        box-sizing: border-box;
    }


    .circular-menu.opened-nav {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
    }

    .circular-menu.opened-nav li {
        pointer-events: none;
    }

    .circular-menu.opened-nav li a {
        pointer-events: auto;
    }

    .circular-menu.opened-nav li a .horizontal {
        pointer-events: none;
    }

    .circular-menu ul {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .circular-menu ul li {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        position: absolute;
        overflow: hidden;
        border: 1px solid transparent;
        transform-origin: 100% 100%;
    }

    .circular-menu ul li a {
        box-sizing: border-box;
        position: absolute;
        display: block;
        border-radius: 50%;
        cursor: pointer;
        color: #fff;
        padding-top: 10px;
        text-align: center;
        text-decoration: none;
        backface-visibility: hidden;
    }

    .circular-menu ul li a span.cm-icon {
        display: inline-block;
        background-size: cover;
    }


    .circular-menu ul li a span.text {
        display: block;
        font-size: 13px;
        line-height: 1;
        position: relative;
    }


    .circular-menu ul li a .cn-icon:before {
        display: table;
    }


    .circular-menu ul li a.disabled {
        -webkit-filter: grayscale(100%);
        pointer-events: none !important;
        cursor: default;
    }


    .circular-menu ul li a:focus {
        position: fixed;
        /* fix the displacement bug in webkit browsers when using tab key */
    }

    .circle-menu-center {
        position: absolute;
        top: 0px;
        left: 0px;
        right: 0px;
        bottom: 0px;
        /**/
    }
</style>


<style type="text/css">
    .cn-menu1 {
        position: absolute;
        left: 50%;
        top: 50%;
    }

    .cn-menu2 {
        position: absolute;
        left: 40%;
        top: 50%;
    }

    .cn-menu3 {
        position: absolute;
        left: 60%;
        top: 50%;
    }

    .cn-menu4 {
        position: absolute;
        left: 80%;
        top: 50%;
    }

    .rect-icon {
        background: #fff;
        display: inline-block !important;
    }

    .circle-icon {
        background: #f94321;
        display: inline-block !important;
        border-radius: 50%;
    }

    .my-icon {
        /* background: url("./images/circular-menu.png");*/
    }

    .icon1 {
        background-position: 0 0;
    }

    .icon2 {
        background-position: 0 -56px;
    }

    .icon3 {
        background-position: 0 -116px;
    }
</style>

<style type="text/css">
    .MusicYTPlayer {
        display: none;
    }
</style>

    <div class="circle-menu-center" tabindex="-1">
        <div id="circle-menu1" class="cn-menu1" tabindex="-1"></div>
    </div>


    <audio id="audio-menu-hover" class="MusicYTPlayer" tabindex="-1">
    <source src="data:audio/mp3;base64,//vgRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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sxs6BJWY4FBCcY8JmAjg4JAobDCUw0ECgaFgYMBxIRAQMFQYvuXoFgYtigiS3SsRKQDIMqaKjTBSqYSzhf6vkvWYOWp5dS0VHmvuc2rWmYtAe5tWHN1cdqLEm4vo1tvWHNxdt+F3ODAENva/0Ax2DHmd12n1gpqTut1hh/3Vf6IzUFxSGYaguHIu7r7ROgkEPQzGI24N2KzUce59Y5PyG/ZhrK3elV29nSyq9lj++VZmzV3rlNTbq4UvLWuY6q/q1vnaXn5/v8sv5WvirLN001HLrLUiEAKEQA2FQDoLAPpgB4JcYEYNMmH7jqZhF4UAYlOJMHCEWnx80I7gYw8C+mEmgWBgpgDOeiSCX6Z+ImBjo6IJoxqpxo57xFzHWV6nYlLnRpNR5FuOKqoth47GjiG7oXMmqiOX8fU9+VERKP2sWhPuqVajk1VZDWnVfPcfdN0Oqv6h7++t8eG4ie5Gn////9NVTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQaAAEwAMUAAIsARhACIHAXZgiQISYn2B1GDwgghgeYj8Y4/+//74kQSD/OeOz6D/BqgcQfH0H+DVBEc+vQP9MqCoSRd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IR5mmuYxp9RiP+ZJdMYPNOYMncYEE+YICkYDh6GCeAg1SCWxIAYBTJ5xs8FCJ4626BH0U0JAINa1o7sIvu53jOb0/PE8qFOrCFwDiPTbnrXX8r9KYgpqKZlxyclxrVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVRGABDIBCYAIAnDIDCYBQBsGBZg8JhGAooYdaVGGBiBZpjKAN2d2fwdGlGr2BkP4SuYcgB9GD0gP50ojG//74kQeD/RcLjED/EMwpGal8H9sZg8w+MgOfKfCEZHYwf2ZoGSeaONxjgjGLQu0ZWNJhMCGW5zuok77lGhOeMB4wGLCKZBvaDQYJ1u2UhizjERhZHYQpkUTHK/V+XA6B1/HB7hwGF4qnY2mPXTp////9v6W4JtjAAIRAG5gAQAgYAsA6mB7jbhjbwcKYKyAoGDOiRBoFlQcfyUNvmMFg5Bg1AH6YG+AkHEGJiIEBBhCQWlAw8JCQKElepol02XsURJfdkYnMj+VgPE0fqkRE0RDsbmZwFh5gbl2YTBliCq1lw0se1vecfKUD0q0TiqNfBr2adtTkNaXmsLTGd/3ggAYMrBVoQAr0jTKcLItLP7jaLn1J////9qlwcBRoVAIkmRQcaSBZ6k1nL7oYcUEImFbEMZgwv1SYsWXWmBwBQhgWQKCYDuBmGAWAOpgCIB8QgC6fQkACukterCnKc1nUH3r9JGcZ+tFZ0DCoqBA0o4kcccYjDjKMIUo0tEVinGKxTsaxiHVFkdNWf//rvfp+O/9AFABAQAGgEAgFAEcwBUCIMBeBQTBMRPYxY4hMMM2DFTFxBps4oP5lNqWJ/TGOQqIwqIEvMGHAtD2lE4koM4AjCBYwANXMk7Yc1uTbu89bnxiEO5PTNNbpAtZ51qjumcpFLeyZSvlV3nLIw+mGS4aOiYoeKtzlk7kq6mRk8n/////////rUxBTUUzLjk5LjVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/++JEAA/0Tyowg/1KwFIDJnB3/EAQQKrAD+jNQhuVmIH9pZhZIwACCMAXAACgYBOAimAnAbxgf4qOYlIM2mBqghBhN4Bab6ATVn5Rjyp7I4hquXZkkLxieGpicChhyDpedBI3qsKl8laQ6rwuYqeq11phxpk0gJScPaTU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8UDKwIAABQNiZiqViDD1YZA58qnnMZTFnPjkCzExLY1GojFnFiskm4BjNW1fqUyMUESZtZsQBooRJp4SrJDrrubDTV0tBL4h3U5+MGV8yn/925mNjO3/l19vx9798P5J7pi/0/+2EMHRxAQBWYAgAgGAogMpgsgAOZAUERmBhgRhghoH+Z1txMnaalrhic4ViYJwB3GBdgZZ8IBx5pmlQwQBoUiKs8LuJCTS82S3GhPZGY44kan5FFECADjgWJkEjRG84kSFHqJ09hj3Gc6bklL7UPHJZn/7qSPBFaI8M9i5rMf///t////9NUxBTUUzLjk5LjVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVBoICATEoTPCwFeAcEwaUJMMTsCzDEVgvMwmYoDMUvSJT4uA3kz7/++JkEw/0sDGrA1/pIIulpZB/aWgR/PiuD+ytgZiMl0Gv5JjygwWXkwjKAwRIcECUOACDgbMAAJLssMTuKwFKAHQTq4bpCpG3Fn6sDXKWH77SYxTT7pXIdil2ij8l7L4Mlu+QJGKftyIZZWvtVcZyexyx38vnKbti5hl+NL3Letf3nN/jfOkph50ShlFxoNwxX8ceYILABQCAATAFwAswEQAsMDRAWTCuglYysgJ4MKTBjjAmBkYx7H25O0KYoDBPBAEwI8HqMAABGzEJwKnplBgZcEBA+gSGgdk6t6x4HY9D8UpY7AsanHxo36WaDIhNzFDB+YqHy0SfCJ/UzIX2JwdmJQlCL8+pXsvUr/lBKJyOhN/tQ0t/6P/t////2UpNBwAiYAKALgYB4MA7AMDAqgAMwwEIhMOFAFTDMgYkwyoe1M7y76TfaXAEwkUSOMBwBuTAOQUQsaoJcAarmdjZMMCQ2vMwQJQxWMwIvcgNFgFfTIlj3lQMpl7aP1Bd6ewtzdTkhkkuzxwszNCNZR5AQTHo7vHjxgywqTbVzsyKYiEtYSHZfq5Hb+jKg36/URh5YpesoIAImdZUYImCRGI0BBBgyQFuYK0GcmVt9iJxNg/OYbsC1GB3gS5gLgEIe/5iEGa6aYYOASrjTavC/UARuUwdvCfxoY/Q5U1PXs8t6yta5jVQZUGnpBsYB2qDV4qsj/v/62JMQU1FMy45OS41qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//vgZAAP86ogLIO/6gCAY3WQc/wmDVyEsgx9JcGLjVbB3/TImkAhZsWBQiC4xEA4zx/852Mk0eFkw/ZUwtYnDP+BBmT193jMhDzFUWDAYSyQIBwG0Ig4BQEA7WmiPPE2KTcEw/D9eMyl/Z+GZfuf1XlV/dPKbsrr/l3L8tfzDX4XdoHCosSGiEuDoM3aWhxMglzbeSJf+n/6E3QQFDBIzMXEgyWszXWiMIHE+zBrCGMwTwHKMTLElTkJPt0wrIuFMbiCtjC2QSUwbYC2OIqc2YZjQpzMakUxkJAgDruU5eJFNhjJn8eihwgyr+EP8hFDZmZ7LKT537PL9Wl5UloaKpJFiIs4gLkCAVWy1691630m7ql/X/1f3f9VMwCGyhJxieKAQUVMA6AVigENMB+BkTBbWKE/t0X4MJiApDARwBlAAYAsASkAAIW1e1QBSaK0OtnkSqkwzmR9rsgO2TMNs7AyUMug17pJKfncY71YQ8E5FTAKODJVBBR8NWaFr+y93/7P/oQkl/gEAJgGDRgsIZhqWxk5c5tj05hSoRsYdKMIGZeeTxo+IOid3KGbElAZlD6Y/iIYyAOCg7C4IlzkRWXS+Gnef+VxyHYjSwbbrXLGdTOz+dPjW/u88ubuOSPSH+hKLwgu7UmIKaimZccnJca1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy45OS41VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//viZAAP80oarIN/6SBsY4WQb/0kDcBysA7/pkIEkhWB/ploVtFQBI0xcaMQRTN6owJQU7MDbDtTBawXYw1EE4M6oP8j+1wNw80YUzrMYycG0xTEYwwBdpLSmqNxiCrXCgpyG/syixOUvN08uszE7PVrt/da9jYwr/S1SZUiBxSpBghSMyW3//v/V//7l4InlsDFwszw4N7lTBYgkAxosNgMGJAqjBKA2Qz+X0qM0UKCDll4zIw1jIkfTEgSDC0KTB4IDBwBEu2mqDsamZY40BQhskalVXUqvQ1LqexYy+1O93//zD8cbtQ2aJNKiBQgEK+Lsvo03/7wwgqJAcBghBwriRWjTFnMFUmkMBmGyhGhhdI0EZC165HFIpLx3V/Jhu8RjIgZgaWRgIM5gYGgOBAHCODgAf9va7cLsnYbDTrVIxViFLjbs7s09+rlby3O46tfjSXvugMwAh0eu5yzyxXi9X/6m/9bci+5VABgAABhUAgMADAczAcBGwxnEICMDiAqTCBgkcxzf6GPCeCNjgknTSILDLMGgcYBEARhAFwKAgLAaqotFWlX6N80vuQwywx5oXRTsud2sgCIhQqAIiRCkdHMqvaBhUmrIoucrm7HSk3tPC45K7lhsGFMQR/U//qR/9P///+hMQU1FMy45OS41VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVXcHQ8wQOMXITTlw6t1MHWCqjGLRd4wYkBsMLYE4DcwfEw8cgYoMGYDeTAXwWQwCYDxOVoNizMoyDBAkrFihkwbXV4v3DD7MlblEXDdGrLV6QNKIev/74mQqD/RHJyoDf9Ewr6e1EH9IehSYxKAP8M2Bn4xWAb/smAinj3IrRxqSQRUlMxdpreuY6xvfhzncMs7eP3Od1+Gdw6GhM8MBByUJarf6HI///+n////QYAiAVGABAH4qA7GAZAVpgF4IEYAUFhmEllVhh+JPoYc8IVmSrCLJtmuD0fhFDrmaOiPRi3QPGYXKCkGEHAQ5gpYBiYGYAUGOzGjXmHAFAkMQioVvlMxCCWMnOlIzdSyAGFRdTHKTLtdJtX4iT8tNgWK2NXpVN2txsBTU0kjLGCccUNRx4uPNUs1WZkbolS4smUpy0FvGXty9x3STw139jDgOd6+/7/qff/X//7lu/rAwAUCgA0wBEAGBwE4CgKswPgCZMNHDzDKhwXkw6YKDMUEDGzXusbI+fZHXMGPG2jAVQxEwHEGENISkRpYyabzBoFMDA9M4UBDEWlloURA4BOUmoyRQSUO07EsjK7s32gprTzOBEI/UdK5E5+MWq1BRwAkyZsWSDG88KwWi3eg2vBsBm2cZVfed8ss0Xh0Xh8CuUbAQbM0l7JJW/0/kaf///yVH+hAMW5MDEDBCExk0N04zA+QpwwwASAMKWB0zDuhLk083xfM1xCujFHQeYweYETMEfAoDpD81MoGkVDkBAlwn7WA+M2ZW3j3y7LmMtxmZuV8yxu17tTV61TAYXafEhgLrue8myaQx6tf1qkxBTUUzLjk5LjWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr/++JkAA/09T4ng/pjQGFjBYBv+iYPXHSoDf9kwdIOFQG/7Jh3U7CIAF4YBEAWhcBxMFhBcjKfQOkaC2jDrRCI1hHViP5xbVTJyQOAMD7DBHwEsrlBqtHE1AYLiFACgsXPXkmuXeXmupLlFFxFNnnZi/qopCQic+OMhYlNXDwZKSG8YlgyKLxKfvqwi2pC/GRVn3VIcT6mNSltuUWOzj9Xc2afkFnqVhnpy1Jgzf23fnZOdEFnLURWaVWfR/7Kf///20NHR4MLBTCjIyNbNMzDAww6cxAYQvME8AzDCWxN8z77sNNTxEajEPAIYwX0BZMDEAGD3szrHDVqTHlzCAEBcIm34sOnA0PU9mU0s7Ww3S/e/nN1c8LmY0UcTItNvF73Tv/ofJEswQaM9LzMF49n7MLcEgjD+gL0wxEDkMBYHpDN/uhQ1LJg+MYDEBzB/gbYwQcENN6uDb4825OM8LjLyMeKI2kW093HqdZSFLPTFA7cWlFV9YzfnK1LGYjMfnOzlPvn4dv/cAq0uNg0EjADDbXCoWU2zFyDuz7////SYMEmGihjAuZqYGaLJ8PYYOYJvmIYEb5iiIfYYvmX1HS9dcRrtoViYzMGXmEcg9xgtgIqe3aG4KJmIQSCJgIcXJVud1abzO8/TcWzNeoex7kR+zubsz87fqztft2xhM3e/2hEJVUwVB0+TUy4sEtLkbmdCfIpiDVMQU1FMy45OS41VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//viZAAP87IcKoP9YqCC5CUwc/wmCexCsg7/RolYilYB3/TILVCIAbEYBQAQD8RgPBgBAI6YDKLGGJGEfhhDwVOYo4H9nRg8NJ9UQqOeen4buFOaPiUZYBKEHcYMAMYIAsCAJfpYUMQUJSCSjokIRSOjOjx+tb9l3GYWVlvXO3b37QrAAQUsOrY08nInPWT///t//5P/////+0QgIEhMwINjE5ZMZLI0jrzBYhZww6IxqMCnCPzFcg4I/w9iSMj2FDjH7QcMwvAB6MGTAUzigcNakcz0PDFA2MHh0EgpBCVgOy+8CubTOI89K++UipYvLvnMdYxOxM16lmdyuY52Pw5e5zeqm7l9glAUFgMuSuY1RNKWfp/9v//T/7f0vOhQBgDMHAOMOwrMhB4Ni0RNzqlMJsBDTAQBdszYbqvMf8H0TBhAjQwIUEVM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gAHMSeMRdMAZBejFhAAIwToEdMGkCQzIAOJEyPoHaDdmcIEJo8QAZSjxXMJAAuA0t3pTFb8Odgqkpb2cZwpu2Jq/nftB82cJzqnvlXt//10zdzAAwycLN0Mji6kwZwPHMa0DEjAoQH8wtwHxMdr9ozv50OIwhwLZMBiA4DAaQKkw+Q5pszQQUcDRJlw0CMWGYAtp3S4au3Wp3Xnn9n6kQt2IjBDbSqVTOOVBIpyanbFL/ZRascyuXO/zVvOrq9n/2ct/S3AMto8S3IQk1FLk/v///5L////TTN0jnqpBUCMwAgTjAbBpNdAIAwdABDAzD7MeR5TTI5BPQXSgFM0YpAAYYgWDg4AwNlq1oOPOQxLqkji8Xy27t6p/N8rbv1+mlhoDPPWvsjPQ+6cikiJSZkIYiMYHOGqmKcAexgugFOFxDExwvjpOf9Jwzh4yDQ0TzFgQjFEHzCQLjA8E0QWRP2xJrTas6gtkkUfV4H6swmzGorNU9Jy3TVZbb73PKbu1alaxhN4Y4dzufEJcOzw4OIg+Otvu/bb////QmIKaimZccnJca1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy45OS41VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV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SzKQzAqKVUAhvIbi7sZyHqUL8s/z09iHe3///01MQU1FMy45OS41VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV" 
        type="audio/mp3" tabindex="-1" />
    </audio>

<div id="backgroundMusicYTPlayer" class="MusicYTPlayer"  tabindex="-1"></div>




  `;
}