/* PUT ON ROOT ENTITY */
/*******************************/
/*                             */
/*   T I M E R                 */
/*                             */
/*******************************/
/*This script is designed to be attached to the root entity in a PlayCanvas 
project and provides a simple and flexible way
 to handle timed events within the application.*/

var Timer = pc.createScript('timer');

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
Timer.destroyTimer = function (timerId) {
    delete this._timers[timerId];
    return null;
}

Timer.prototype.evaluateTimers = function (dt) {
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


// initialize code called once per entity
Timer.prototype.initialize = function () {

    Timer._timers = [];
    Timer._timercounter = 0;

    this.on("destroy", function () {
        for (let key in this._timers) {
            delete this._timers[key];
        }
    }, this);

};

// update code called every frame
Timer.prototype.update = function (dt) {
    this.evaluateTimers(dt);
};

