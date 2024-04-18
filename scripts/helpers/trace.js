/*
poner en cualquier entidad. Se recomienda poner en ROOT.
*/

var TracerScript = pc.createScript('tracer');
TracerScript.attributes.add('trenable', { title: "Enabled", type: 'boolean', default: true });
TracerScript.attributes.add('tralwaysshow', { title: "Always show", type: 'boolean', default: false });
TracerScript.attributes.add('trordermode', { title: "Order mode", type: 'string', enum: [{ 'newlestlast': 'newlestlast' }, { 'oldestfirst': 'oldestfirst' }], default: "oldestfirst" });

TracerScript.linesValues = {};

TracerScript.div = null;
TracerScript.divValues = null;
TracerScript.timer = null;

TracerScript.prototype.initialize = function () {
    var canvas = this.app.graphicsDevice.canvas;
    TracerScript.trenable = this.trenable;
    TracerScript.tralwaysshow = this.tralwaysshow;
    TracerScript.trordermode = this.trordermode;

    TracerScript.div = document.createElement("DIV");
    TracerScript.div.id = "tracer";
    TracerScript.div.style.backgroundColor = "black";
    TracerScript.div.style.color = "white";
    TracerScript.div.style.position = "absolute";
    TracerScript.div.style.left = "0px";
    TracerScript.div.style.top = "2em";
    TracerScript.div.style.buttom = "2em";
    canvas.parentElement.appendChild(TracerScript.div);


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
    canvas.parentElement.appendChild(TracerScript.divValues);



    TracerScript.__tracer_busy = false;

    this.on("attr:trenable", function () {
        TracerScript.trenable = this.trenable;
        if (!TracerScript.trenable) {
            TracerScript.div.innerHTML = "";
            TracerScript.div.style.display = 'none';
            TracerScript.divValues.innerHTML = "";
            TracerScript.divValues.style.display = 'none';
        }
    }, this);

    this.on("attr:tralwaysshow", function () {
        TracerScript.tralwaysshow = this.tralwaysshow;
    }, this);

    this.on("attr:trordermode", function () {
        TracerScript.trordermode = this.trordermode;
    }, this);


};

TracerScript.prototype.print = async function (text, value) {

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



            if (TracerScript.timer) {
                clearTimeout(TracerScript.timer);
            }

            TracerScript.timer = setTimeout(async function () {
                if (TracerScript.tralwaysshow) {
                    TracerScript.div.style.display = 'block';
                    TracerScript.divValues.style.display = 'block';
                } else {
                    TracerScript.div.style.display = 'none';  // Ocultar el div
                    TracerScript.divValues.style.display = 'none';
                }
            }, 3000);

            TracerScript.__tracer_busy = false;
        }
    }

    esperar();
};


async function Trace(text, value) {
    if (TracerScript) {
        TracerScript.prototype.print(text, value);
    }
}
async function Tracer(text, value) {
    if (TracerScript) {
        TracerScript.prototype.print(text, value);
    }
}


