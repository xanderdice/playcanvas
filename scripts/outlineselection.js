/* outlineselection.js — Outline de selección para personajes (PlayCanvas 2.x)

   Usa el pc.OutlineRenderer OFICIAL del engine (extras, incluido en el build):
   renderiza las meshInstances de las entidades marcadas a un RT con color
   plano y compone el borde expandido — funciona con meshes SKINNED (Mixamo)
   sin geometría duplicada ni shaders custom, y en WebGL2 y WebGPU con los
   shaders del propio engine.

   USO: agregar el script 'outlineSelection' a la ENTIDAD DE LA CÁMARA.

   INTEGRACIÓN AUTOMÁTICA con este proyecto (Character.js / GameManager.js):
   - autoTrack: toda entidad con tag 'is-selectable' y entity.selected == true
     recibe outline 'selectedColor' (el player arranca selected).
   - trackHover: escucha el evento 'game:mousehover' del GameManager y pinta
     la entidad bajo el mouse con 'hoverColor'.

   API MANUAL (desde otros scripts):
     var os = cameraEntity.script.outlineSelection;
     os.addOutline(entity, new pc.Color(1, 0, 0));   // color opcional
     os.removeOutline(entity);
     os.clearOutlines();

   PERF: la lista de seleccionables se re-escanea cada 30 frames (los toggles
   de .selected se ven al instante igual: la condición se evalúa por frame
   sobre la lista cacheada). El OutlineRenderer solo re-renderiza las meshes
   marcadas, a un RT que maneja el propio engine. */

var OutlineSelection = pc.createScript('outlineSelection');

OutlineSelection.attributes.add('selectedColor', {
    type: 'rgb', default: [0.25, 1.0, 0.45],
    title: 'Selected Color',
    description: 'Color del outline de entidades seleccionadas (entity.selected).'
});

OutlineSelection.attributes.add('hoverColor', {
    type: 'rgb', default: [1.0, 0.95, 0.6],
    title: 'Hover Color',
    description: 'Color del outline de la entidad bajo el mouse (game:mousehover).'
});

OutlineSelection.attributes.add('borderSize', {
    type: 'number', default: 3, min: 1, max: 8, precision: 0,
    title: 'Border Size',
    description: 'Grosor del outline en píxeles.'
});

OutlineSelection.attributes.add('autoTrack', {
    type: 'boolean', default: true,
    title: 'Auto Track',
    description: "Outline automático para entidades con tag 'is-selectable' y .selected true."
});

OutlineSelection.attributes.add('trackHover', {
    type: 'boolean', default: true,
    title: 'Track Hover',
    description: "Outline para la entidad del evento 'game:mousehover' del GameManager."
});

OutlineSelection.prototype.initialize = function () {
    if (!this.entity.camera) {
        console.warn('outlineSelection: la entidad no tiene componente camera');
        return;
    }
    if (typeof pc.OutlineRenderer !== 'function') {
        console.warn('outlineSelection: pc.OutlineRenderer no existe en este build del engine');
        return;
    }

    /* capa donde se COMPONE el outline: 'Immediate' existe en todo proyecto;
       si faltara, se crea una overlay y se agrega a la cámara */
    var layers = this.app.scene.layers;
    this._blendLayer = layers.getLayerByName('Immediate');
    if (!this._blendLayer) {
        this._blendLayer = new pc.Layer({ name: 'OutlineBlend' });
        layers.push(this._blendLayer);
        this.entity.camera.layers = this.entity.camera.layers.concat([this._blendLayer.id]);
    }

    this._createRenderer();

    /* colores como pc.Color (la API los pide así; attrs rgb ya son pc.Color) */
    this._manual = [];               // pares [entity, pc.Color] agregados por API
    this._hoverEntity = null;
    this._selectables = null;        // caché del findByTag
    this._frame = 0;

    this._onHover = function (data) {
        if (data && data.enterEntity) {
            this._hoverEntity = data.enterEntity;
        } else if (data && data.leaveEntity && this._hoverEntity === data.leaveEntity) {
            this._hoverEntity = null;
        }
    }.bind(this);
    this.app.on('game:mousehover', this._onHover);

    this.on('attr:borderSize', function () {
        this._createRenderer();      /* el grosor es del constructor: recrear */
    }, this);

    this.on('destroy', function () {
        this.app.off('game:mousehover', this._onHover);
        if (this._renderer) {
            this._renderer.destroy();
            this._renderer = null;
        }
    }, this);
};

OutlineSelection.prototype._createRenderer = function () {
    if (this._renderer) this._renderer.destroy();
    var size = Math.max(1, Math.round(+this.borderSize || 3));
    this._renderer = new pc.OutlineRenderer(this.app, null, size);
};

OutlineSelection.prototype.update = function () {
    if (!this._renderer) return;

    /* re-scan de seleccionables cada 30 frames (barato con multitudes);
       la CONDICIÓN .selected se evalúa cada frame sobre la lista cacheada */
    this._frame++;
    if (!this._selectables || (this._frame % 30) === 0) {
        this._selectables = this.app.root.findByTag('is-selectable');
    }

    var r = this._renderer;
    r.removeAllEntities();

    if (this.autoTrack) {
        var list = this._selectables;
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e && e.enabled && e.selected) {
                r.addEntity(e, this.selectedColor);
            }
        }
    }

    if (this.trackHover && this._hoverEntity && this._hoverEntity.enabled &&
        !this._hoverEntity.selected) {
        r.addEntity(this._hoverEntity, this.hoverColor);
    }

    for (var m = 0; m < this._manual.length; m++) {
        var pair = this._manual[m];
        if (pair[0] && pair[0].enabled) {
            r.addEntity(pair[0], pair[1]);
        }
    }

    r.frameUpdate(this.entity, this._blendLayer, false);
};

/* ===================== API MANUAL ===================== */

OutlineSelection.prototype.addOutline = function (entity, color) {
    if (!entity) return;
    this.removeOutline(entity);
    this._manual.push([entity, color || this.selectedColor]);
};

OutlineSelection.prototype.removeOutline = function (entity) {
    for (var i = 0; i < this._manual.length; i++) {
        if (this._manual[i][0] === entity) {
            this._manual.splice(i, 1);
            return;
        }
    }
};

OutlineSelection.prototype.clearOutlines = function () {
    this._manual.length = 0;
};
