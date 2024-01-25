//IMPORTANT:
//Put this script in ROOT entity
//
//


var GameUi = pc.createScript('gameUi');

// initialize code called once per entity
GameUi.prototype.initialize = function () {

    document.body.style.backgroundColor = "black";

    this.canvas = this.app.graphicsDevice.canvas;
    this.canvas.focus();

    this.AddUIstyle();

    this.div = document.createElement("DIV");
    this.canvas.parentElement.appendChild(this.div);
    this.div.innerHTML = "hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh<img width='100px' height='100px' src='https://playcanvas.com/static-assets/images/play_text_252_white.png' />";
    this.div.className = "divabsolute fade-out";
    this.div.style.display = "none";
    document.addEventListener('DOMContentLoaded', function (e) {
        debugger;
        this.div.style.display = "block";
        this.div.className = "divabsolute fade-in";
    }.bind(this));



    debugger;


};

GameUi.prototype.AddUIstyle = function () {
    var style = document.createElement("STYLE");

    style.innerHTML = " "
        + "    .divabsolute {"
        + "    position: absolute;"
        + "    left: 0;"
        + "    right: 0;"
        + "    top: 0;"
        + "    bottom: 0;"
        + "    background: transparent;"
        + "} "
        + "        .fade-out {"
        + "            opacity: 0;"
        + "        }"
        + "        .fade-in {"
        + "            opacity: 1;"
        + "        }"
        + "body, html {"
        + "            background: black;"
        + "            font-family: arial,sans-serif;"
        + "            font-size: 16px;"
        + "            font-weight: normal;"
        + "            top: 0;"
        + "            bottom: 0;"
        + "            left: 0;"
        + "            right: 0;"
        + "            margin: 0;"
        + "            overflow-x: hidden;"
        + "            overflow-y: hidden;"
        + "            width: 100%;"
        + "            height: 100%;"
        + "            color: white;"
        + "}"
        + " * {"
        + "            -webkit-transition: all 0.9s;"
        + "            -moz-transition: all 0.9s;"
        + "            -ms-transition: all 0.9s;"
        + "            -o-transition: all 0.9s;"
        + "            transition: all 0.9s;"
        + "            -webkit-box-shadow: 0px 0px 47px -12px rgba(0,0,0,0.3);"
        + "            -moz-box-shadow: 0px 0px 47px -12px rgba(0,0,0,0.3);"
        + "            box-shadow: 0px 0px 47px -12px rgba(0,0,0,0.3);"
        + "            box-sizing: border-box;"
        + "            outline: none;"
        + "            outline-offset: 0px !important;"
        + "            border-radius: 0.5vh;"
        + "            -webkit-border-radius: 0.5vh;"
        + "            -moz-border-radius: 0.5vh;"
        + "        }"

    document.head.appendChild(style);

}


