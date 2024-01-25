/*
poner en cualquier entidad. Se recomienda poner en ROOT.
*/

var TracerScript = pc.createScript('tracer');

TracerScript.div = null;
TracerScript.timer = null;

TracerScript.prototype.initialize = function () {
    var canvas = this.app.graphicsDevice.canvas;
    TracerScript.div = document.createElement("DIV");
    TracerScript.div.id = "tracer";
    TracerScript.div.style.backgroundColor = "black";
    TracerScript.div.style.color = "white";
    TracerScript.div.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.parentElement.appendChild(TracerScript.div);
};

TracerScript.prototype.print = async function (text) {
    debugger;
    if (TracerScript.div.style.display === 'none') {
        TracerScript.div.style.display = "block";
        TracerScript.div.innerHTML = text + "<br />";
    } else {
        TracerScript.div.innerHTML += text + "<br />";
    }

    if (TracerScript.timer) {
        clearTimeout(TracerScript.timer);
    }

    TracerScript.timer = setTimeout(async function () {
        TracerScript.div.style.display = 'none';  // Ocultar el div
    }, 3000);
};


async function Trace(text) {
    if (TracerScript) {
        var fechaHoraActual = new Date();
        var horas = fechaHoraActual.getHours();
        var minutos = fechaHoraActual.getMinutes();
        var segundos = fechaHoraActual.getSeconds();
        var milisegundos = fechaHoraActual.getMilliseconds();
        var tiempoActual = horas + ":" + minutos + ":" + segundos + ":" + milisegundos;

        TracerScript.prototype.print(tiempoActual + ": " + text);
    }
}



