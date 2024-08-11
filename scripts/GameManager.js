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

//resolutions
//4320p (8K): 7680x4320
//2160p (4K): 3840x2160
//1440p (2K): 2560x1440
//1080p (HD): 1920x1080
//720p (HD): 1280x720
//480p (SD): 854x480
//360p (SD): 640x360
//240p (SD): 426x240 
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
        delete this._timers[key];
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
        if (timer.__elapsedTime >= timer.time) {
            timer.callback.call(timer.scope);
            if (timer.once) {
                delete this._timers[key];
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

GameManager.attributes.add("subtitles", {
    title: "subtitles",
    type: "json",
    schema: [
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
            name: 'trenablefps',
            title: "FPS Enabled",
            type: 'boolean',
            default: true
        },
        {
            name: 'trenable',
            title: "TR Enable",
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


// initialize code called once per entity
GameManager.prototype.initialize = function () {
    GameManager.showMenuOnEnabledPointer = this.ui.showMenuOnEnabledPointer;
    GameManager.mainScene = "game";
    GameManager.currentScene = GameManager.mainScene;
    GameManager._app = this.app;
    GameManager._app.isMenuMode = false;

    GameManager.enableSubtitles = this.subtitles.enableSubtitles;

    var canvas = this.app.graphicsDevice.canvas;
    TracerScript.trenable = this.tracer.trenable;
    TracerScript.tralwaysshow = this.tracer.tralwaysshow;
    TracerScript.trordermode = this.tracer.trordermode;
    TracerScript.trenablefps = this.tracer.trenablefps;
    TracerScript.trshowstats = this.tracer.trshowstats;
    TracerScript.trenablelightingdebugLayer = this.tracer.trenablelightingdebugLayer;

    if (TracerScript.trenablefps) {
        TracerScript.fps = new FPSMeter({ heat: true, graph: true });
    }
    TracerScript.trgamesleep = this.tracer.trgamesleep;
    TracerScript.trgametimescale = this.tracer.trgametimescale;



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


    var canvas = this.app.graphicsDevice.canvas;

    this.createMenuDIV(canvas);
    this.createSceneLoaderDIV(canvas);
    this.createSubtitleDIV(canvas);
    this.createLoadingDIV(canvas);


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
                GameManager.menuDIV.innerHTML = htmlContent;
            })
            .catch(error => {
                console.error('Error fetching HTML:', error);
            });
    }






    this.app.on("showmenu", function () {
        if (GameManager._app && !GameManager._app.isMenuMode) {
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

};
GameManager.prototype.postInitialize = function () {

    /* ************* */
    /* APP UPDATE    */
    /* ************* */
    this.app.on("update", GameManager.updateGameManager, this);

    if (GameManager.currentScene === GameManager.mainScene) {
        this.app.fire("showmenu");
    }


}

function sleep(ms) {
    if (!ms) return;
    const end = Date.now() + ms;
    while (Date.now() < end) {
        // Bloqueo del hilo principal
    }
}

// update code called every frame
GameManager.updateGameManager = async function (dt) {
    GameManager._app.dt = dt;
    Timer.evaluateTimers(dt);

    sleep(TracerScript.trgamesleep);

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
};

GameManager.showhideMousePointer = function (action) {
    function sleepPointerLock(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
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

                    app.autoRender = true;

                    app.fire("hidemenu");
                    GameManager.hidesceneloader();


                    GameManager.showSubtitle("The scene " + GameManager.currentScene + " has loaded...");

                });




            }
        });

    });

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


