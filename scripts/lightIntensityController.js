/*
poner en la luz que se desea que vaya prendiendo y apagando 
*/


var LightIntensityController = pc.createScript('lightIntensityController');

LightIntensityController.attributes.add('maxIntensity', { type: 'number', default: 2.0 }); // Intensidad máxima de la luz
LightIntensityController.attributes.add('minIntensity', { type: 'number', default: 0.2 }); // Intensidad mínima de la luz
LightIntensityController.attributes.add('increaseSpeed', { type: 'number', default: 0.5 }); // Velocidad de aumento de intensidad
LightIntensityController.attributes.add('decreaseSpeed', { type: 'number', default: 0.2 }); // Velocidad de disminución de intensidad

// initialize code called once per entity
LightIntensityController.prototype.initialize = function () {
    this.currentIntensity = this.minIntensity; // Inicializar la intensidad actual
    this.increasing = true; // Indicar si estamos aumentando o disminuyendo la intensidad
};

// update code called every frame
LightIntensityController.prototype.update = function (dt) {
    // Incrementar o disminuir la intensidad según la dirección actual
    if (this.increasing) {
        this.currentIntensity += this.increaseSpeed * dt;
        if (this.currentIntensity >= this.maxIntensity) {
            this.currentIntensity = this.maxIntensity;
            this.increasing = false; // Cambiar la dirección a disminuir
        }
    } else {
        this.currentIntensity -= this.decreaseSpeed * dt;
        if (this.currentIntensity <= this.minIntensity) {
            this.currentIntensity = this.minIntensity;
            this.increasing = true; // Cambiar la dirección a aumentar
        }
    }

    // Aplicar la intensidad al componente de luz (asegúrate de que el objeto tenga un componente de luz)
    var lightComponent = this.entity.light;
    if (lightComponent) {
        lightComponent.intensity = this.currentIntensity;
    }
};