(function () {
    var _timers = {};
    var _nextFreeId = 0;
    
    pc.timer = {};
    pc.timer.add = function (durationSecs, callback, scope) {
        if (durationSecs > 0) {
            var handle = {};
            handle.id = _nextFreeId;

            _timers[_nextFreeId] = {
                secsLeft: durationSecs,
                callback: callback,
                scope: scope
            };

            _nextFreeId += 1;
            return handle;

        }
        return null;        
    };
    
    pc.timer.remove = function (handle) {
        if (handle) {
            delete _timers[handle.id];
        }
    };
    
    pc.timer.update = function (dt) {
        for (var property in _timers) {
            var timer = _timers[property];
            timer.secsLeft -= dt;
            if (timer.secsLeft <= 0) {
                timer.callback.call(timer.scope);
                delete _timers[property];
            }
        }
    };
    
    var application = pc.Application.getApplication();
    if (application) {
        application.on("update", function (dt) {
            pc.timer.update(dt);
        });
    }
})();
