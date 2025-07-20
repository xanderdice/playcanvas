//Put this script in ROOT entitity

//https://mebiusbox.github.io/contents/EffectTextureMaker/  SPRITE EFFECT
//https://basis.dev.jibencaozuo.com/                        BASIS



var Autobatcher = pc.createScript('autobatcher');

// initialize code called once per entity
Autobatcher.prototype.initialize = function () {
    this.app.batcher;
    this.autobatcher = { statics: [], dynamics: [] };

    this.autoBatcher_busy = false;
    this.elapsedTime = 0;
    this.processPart = 0;
    this.lastRenderComponentsLength = 0;
    this.needsProcess = true;

    this.renderComponents = [];
    this.hashes = [];

};

Autobatcher.prototype.doBatching = function () {

    if (!this.autoBatcher_busy) {
        this.autoBatcher_busy = true;


        if (this.processPart === 0) {
            this.renderComponents = this.app.scene.root.findComponents('render');
        }

        if (this.processPart === 1) {
            // Crear un objeto Map para almacenar los hashes con sus renders asociadas
            this.hashes = new Map();
            var hash = "";

            // Iterar sobre todas las this.renderComponents
            this.renderComponents.forEach(render => {

                if (render.isStatic) {
                    if (render.asset) {
                        hash = ((this.app.assets.get(render.asset) || {}).name || "") + render.asset || 0;
                    } else {
                        hash = render.type;
                    }

                    // Si el hash ya existe en el Map, añadir la render a ese hash
                    if (this.hashes.has(hash)) {
                        this.hashes.get(hash).push(render);
                    } else {
                        // Si el hash no existe, crear una nueva entrada en el Map
                        this.hashes.set(hash, [render]);
                    }
                }
            });
            this.renderComponents = [];
        }


        if (this.processPart === 2) {
            this.hashes.forEach((renders, hash) => {

                var newBatchGroup = null;
                if (((this.app.batcher.getGroupByName("batch_" + hash) || {}).id || null) === null) {
                    newBatchGroup = this.app.batcher.addGroup("batch_" + hash, false, 100);
                }

                // Convertir el Map a un array con los hashes y sus renders
                this.renderComponents.push({
                    hash: hash,
                    renders: renders,
                    batchgroup: newBatchGroup
                });


                //this.autobatcher.statics[matKey].batch = newBatchGroup;

                //this.app.batcher.getGroupByName("batch_" + this.renderComponents[0].hash).id

            });
            this.hashes = [];


        }

        if (this.processPart === 3) {
            this.renderComponents.forEach(render => {
                const batchid = ((render.batchgroup || {}).id || null);
                if (batchid !== null) {
                    render.renders.forEach(r => {
                        debugger;
                        if (r.batchGroupId !== batchid) {
                            r.batchGroupId = batchid;
                        }

                    });
                }
            });
        }





        /*
                if (this.processPart === 1) {
                    this.renderComponents = this.renderComponents.filter(function (r) {
                        return (r.enabled && r.entity.enabled);
                    });
                    this.needsProcess = (this.lastRenderComponentsLength !== this.renderComponents.length);
                    this.lastRenderComponentsLength = this.renderComponents.length;
                }
        */

        /*
                if (this.processPart === 3 && this.needsProcess) {
        
                    for (const matKey in this.autobatcher.statics) {
                        const group = this.autobatcher.statics[matKey];
        
                        if (!group.batch) {
                            const newBatchGroup = this.app.batcher.addGroup("batch_static_" + matKey, false, 100);
                            this.autobatcher.statics[matKey].batch = newBatchGroup;
                        }
                    }
                }
        */


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
