//Put this script in ROOT entitity

//https://mebiusbox.github.io/contents/EffectTextureMaker/  SPRITE EFFECT
//https://basis.dev.jibencaozuo.com/                        BASIS



var Autobatcher = pc.createScript('autobatcher');

// initialize code called once per entity
Autobatcher.prototype.initialize = function () {

    debugger;
    this.app.batcher;
    this.autobatcher = { statics: [], dynamics: [] };

    this.autoBatcher_busy = false;
    this.elapsedTime = 0;
    this.processPart = 0;
    this.lastRenderComponentsLength = 0;
    this.needsProcess = true;

};

Autobatcher.prototype.doBatching = function () {
    if (!this.autoBatcher_busy) {
        this.autoBatcher_busy = true;
        // Obtener todas las entidades en la escena

        if (this.processPart === 0) {
            this.renderComponents = this.app.root.findComponents('render');
        }


        if (this.processPart === 1) {
            this.renderComponents = this.renderComponents.filter(function (r) {
                return (r.enabled && r.entity.enabled);
            });
            this.needsProcess = (this.lastRenderComponentsLength !== this.renderComponents.length);
            this.lastRenderComponentsLength = this.renderComponents.length;
        }

        if (this.processPart === 2 && this.needsProcess) {

            var i = 0;
            const renderComponents_length = this.renderComponents.length;
            for (; i < renderComponents_length; i++) {
                const render = this.renderComponents[i];

                if (render.isStatic) {
                    const material = render.material;
                    const matKey = material.name + "_" + material.id;

                    // Agrupar por material
                    if (!this.autobatcher.statics[matKey]) {
                        this.autobatcher.statics[matKey] = { batch: null, renders: [] };
                    }

                    this.autobatcher.statics[matKey].renders.push(render);
                }

                if (!render.isStatic) {

                    const material = render.material;
                    const matKey = material.name + "_" + material.id;

                    // Agrupar por material
                    if (!this.autobatcher.dynamics[matKey]) {
                        this.autobatcher.dynamics[matKey] = { batch: null, renders: [] };
                    }

                    this.autobatcher.dynamics[matKey].renders.push(render);
                }

            }
        }

        if (this.processPart === 3 && this.needsProcess) {

            for (const matKey in this.autobatcher.statics) {
                const group = this.autobatcher.statics[matKey];

                if (!group.batch) {
                    const newBatchGroup = this.app.batcher.addGroup("batch_static_" + matKey, false, 100);
                    this.autobatcher.statics[matKey].batch = newBatchGroup;
                }
            }
        }

        if (this.processPart === 4 && this.needsProcess) {

            for (const matKey in this.autobatcher.statics) {
                const group = this.autobatcher.statics[matKey];

                if (group.batch) {
                    var r = 0;
                    const autobatcher_statics_renders_length = this.autobatcher.statics[matKey].renders.length;
                    for (; r < autobatcher_statics_renders_length; r++) {
                        if (this.autobatcher.statics[matKey].renders[r].batchGroupId !== group.batch.id) {
                            this.autobatcher.statics[matKey].renders[r].batchGroupId = group.batch.id;
                        }
                    }
                }
            }
        }

        this.processPart++;
        if (this.processPart > 4) {
            this.processPart = 0;
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
        this.autoBatcher_busy = false;
    }
};

// update code called every frame
Autobatcher.prototype.update = function (dt) {

    this.elapsedTime += dt;
    if (this.elapsedTime >= 0.5) {
        this.elapsedTime = 0;
        this.doBatching();
    }

};
