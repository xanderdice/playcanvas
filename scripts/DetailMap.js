var DetailMap = pc.createScript('detailMap');


DetailMap.attributes.add('diffuseDetailMap', {
    type: 'asset',
    assetType: 'texture',
    title: 'diffuseDetailMap'
});


// initialize code called once per entity
DetailMap.prototype.initialize = function () {
    this.entity.render.material.diffuseDetailMap = this.diffuseDetailMap;
    //this.entity.render.material.update();
};

// update code called every frame
DetailMap.prototype.update = function (dt) {

};

// uncomment the swap method to enable hot-reloading for this script
// update the method body to copy state from the old instance
// DetailMap.prototype.swap = function(old) { };

// learn more about scripting here:
// https://developer.playcanvas.com/user-manual/scripting/