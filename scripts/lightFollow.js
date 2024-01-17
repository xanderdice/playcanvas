/*

poner en la luz general . 

este script por lo general va acompañado con la camara.  

es para que vaya creando las sombras a medida que se mueve la camara

El propósito principal de este script es asegurar que la entidad que tiene este script 
(directLightFollow) siempre esté ubicada en la misma posición que otra entidad
designada como "Target" generalmente una camara.
Utiliza un temporizador (setInterval) para actualizar continuamente la posición
de la entidad (camara) actual (this.entity) para que coincida 
con la posición de la entidad objetivo (this.target).

*/




var LightFollow = pc.createScript('lightFollow');
LightFollow.attributes.add('target', {
    type: 'entity',
    title: 'Target',
    description: 'The target entity to follow'
});

// initialize code called once per entity
LightFollow.prototype.initialize = function () {

    setInterval(function () {
        this.entity.setPosition(this.target.getPosition());
    }.bind(this), 1000);

};

// update code called every frame
LightFollow.prototype.update = function (dt) {

};
