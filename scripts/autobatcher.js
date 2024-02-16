//Put this script in ROOT entitity

//https://mebiusbox.github.io/contents/EffectTextureMaker/  SPRITE EFFECT
//https://basis.dev.jibencaozuo.com/                        BASIS



var Autobatcher = pc.createScript('autobatcher');

// initialize code called once per entity
Autobatcher.prototype.initialize = function () {
    if (!this.app.autobatcher) {
        this.app.autobatcher = { statics: [], dynamics: [] };
    }


    this.autoBatcher_busy = false;
    this.autoBatcherTimer = setInterval(async function () {
        if (!this.autoBatcher_busy) {
            this.autoBatcher_busy = true;
            this.doBatching();
            this.autoBatcher_busy = false;
        }

    }.bind(this), 10000);



};

Autobatcher.prototype.doBatching = function () {
    // Obtener todas las entidades en la escena
    var renderComponents = this.app.root.findComponents('render');


    var i = 0,
        renderComponents_length = renderComponents.length;
    this.app.autobatcher.statics = [];
    for (; i < renderComponents_length; i++) {
        var render = renderComponents[i];
        if (render.enabled && render.entity.enabled && render.isStatic) {

            var material = render.material;
            var matKey = material.name + "_" + material.id;

            // Agrupar por material
            if (!this.app.autobatcher.statics[matKey]) {
                this.app.autobatcher.statics[matKey] = { batch: null, renders: [] };
            }

            this.app.autobatcher.statics[matKey].renders.push(render);
        }

        if (render.enabled && render.entity.enabled && !render.isStatic) {

            var material = render.material;
            var matKey = material.name + "_" + material.id;

            // Agrupar por material
            if (!this.app.autobatcher.dynamics[matKey]) {
                this.app.autobatcher.dynamics[matKey] = { batch: null, renders: [] };
            }

            this.app.autobatcher.dynamics[matKey].renders.push(render);
        }

    }

    for (var matKey in this.app.autobatcher.statics) {
        var group = this.app.autobatcher.statics[matKey];

        if (group.batch) {

        } else {

            const newBatchGroup = this.app.batcher.addGroup("batch_static_" + matKey, false, 100);

            var r = 0,
                autobatcher_statics_renders_length = this.app.autobatcher.statics[matKey].renders.length;
            for (; r < autobatcher_statics_renders_length; r++) {
                this.app.autobatcher.statics[matKey].renders[r].batchGroupId = newBatchGroup.id;
            }

            this.app.autobatcher.statics[matKey].batch = newBatchGroup;

        }
    }


    /*
        for (var matKey in this.app.autobatcher.dynamics) {
    
            var group = this.app.autobatcher.dynamics[matKey];
    
            if (group.batch) {
    
            } else {
    
                const newBatchGroup = this.app.batcher.addGroup("batch_dynamic_" + matKey, true, 100);
    
                var r = 0,
                    autobatcher_dynamics_renders_length = this.app.autobatcher.dynamics[matKey].renders.length;
                debugger;
                for (; r < autobatcher_dynamics_renders_length; r++) {
                    if (!this.app.autobatcher.dynamics[matKey].renders[r].entity.isCharacter) {
                        this.app.autobatcher.dynamics[matKey].renders[r].batchGroupId = newBatchGroup.id;
                    }
                }
    
                this.app.autobatcher.dynamics[matKey].batch = newBatchGroup;
    
            }
        }
    */


    //this.app.batcher.generate();

};

// update code called every frame
Autobatcher.prototype.update = function (dt) {

};

// swap method called for script hot-reloading
// inherit your script state here
// Autobatcher.prototype.swap = function(old) { };

// to learn more about script anatomy, please read:
// https://developer.playcanvas.com/en/user-manual/scripting/