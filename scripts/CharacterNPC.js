var CharacterNpc = pc.createScript('characterNpc');

CharacterNpc.attributes.add('targetEntity', { type: 'entity', title: 'Target Entity' });  // El objetivo del NPC (por ejemplo, el jugador)
CharacterNpc.attributes.add('activateDistance', { type: 'number', default: 10, title: 'Activate Distance' });  // Distancia para activar el movimiento hacia el objetivo
CharacterNpc.attributes.add('patrolPoints', { type: 'entity', array: true, default: [], title: 'Patrol Points' });  // Puntos de patrullaje del NPC


// initialize code called once per entity
CharacterNpc.prototype.initialize = function () {

    this.entity.AI = {
        currentPatrolPoint: 0,
        targetEntity: null,
        timerId: 0
    };

};


CharacterNpc.prototype.doAI = function () {
    var input = this.entity.input;

    var distanceToTarget = this.activateDistance + 1;
    if (input.targetEntity) {
        distanceToTarget = this.entity.getPosition().distance(input.targetEntity.getPosition());
    }

    if (!input.targetEntity) {
        if (this.targetEntity) {
            distanceToTarget = this.entity.getPosition().distance(this.targetEntity.getPosition());
        }
    }


    if (distanceToTarget >= 1 && distanceToTarget <= this.activateDistance) {
        if (input.targetEntity) {
            if (distanceToTarget <= (this.activateDistance / 4)) {


                if (this.targetEntity) {
                    distanceToTarget = this.entity.getPosition().distance(this.targetEntity.getPosition());
                }
                if (distanceToTarget >= (this.activateDistance / 4)) {


                    if (input.targetEntity) {
                        input.targetEntity.destroy();
                        input.targetEntity = null; // destroy
                    }
                    if (this.targetEntity) {
                        input.targetEntity = new pc.Entity();
                        input.targetEntity.setPosition(this.targetEntity.getPosition());
                    }

                } else {

                    /*CAN ATTACK*/
                    if (input.targetEntity) {
                        input.targetEntity.destroy();
                        input.targetEntity = null; // destroy
                    }
                    input.attack = true;
                    Tracer("statu", "LLEGO   6666");

                }



            }
        } else {
            Tracer("statu", "LLEGO   3333");
            input.attack = false;
            if (input.targetEntity) {
                input.targetEntity.destroy();
                input.targetEntity = null; // destroy
            }
            if (this.targetEntity) {
                input.targetEntity = new pc.Entity();
                input.targetEntity.setPosition(this.targetEntity.getPosition());
            }
            input.sprint = true;
            /*
                        if (!this.entity.AI.timerId) {
                            this.entity.AI.timerId = Timer.addTimer(0.5, function () {
                                if (this.entity.input.targetEntity) {
                                    this.entity.input.targetEntity.destroy();
                                    this.entity.input.targetEntity = null;  // destroy
                                }
                            }, this, true);
                        }
            */
        }
    } else {
        if (input.targetEntity) {
            input.targetEntity.destroy();
            input.targetEntity = null; //destroy
            Tracer("statu", "44444 LLEGO   4");
        }
    }



};
