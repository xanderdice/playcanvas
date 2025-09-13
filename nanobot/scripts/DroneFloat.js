// droneFloat.js
var DroneFloat = pc.createScript('droneFloat');

// ===== ATRIBUTOS CONFIGURABLES =====
DroneFloat.attributes.add('floatHeight', {
    type: 'number',
    default: 5,
    title: 'Altura base'
});

DroneFloat.attributes.add('floatAmount', {
    type: 'number',
    default: 0.25,
    title: 'Amplitud de flotación'
});

DroneFloat.attributes.add('floatSpeed', {
    type: 'number',
    default: 0.6,
    title: 'Velocidad de oscilación'
});

DroneFloat.attributes.add('rotationAmount', {
    type: 'number',
    default: 2.5,
    title: 'Amplitud de rotación'
});

DroneFloat.attributes.add('noiseScale', {
    type: 'number',
    default: 0.5,
    title: 'Intensidad de ruido'
});

// ===== VARIABLES INTERNAS =====
DroneFloat.prototype.initialize = function () {
    this.basePos = this.entity.getLocalPosition().clone();
    this.time = Math.random() * 100; // Offset único por dron

    // Si no existe Perlin, lo creamos rápido
    if (!pc.noise) {
        pc.noise = {
            grad3: [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]],
            p: [],
            perm: [],
            init: function () {
                for (var i = 0; i < 256; i++) this.p[i] = Math.floor(Math.random() * 256);
                for (var i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
            },
            dot: function (g, x, y) { return g[0] * x + g[1] * y; },
            fade: function (t) { return t * t * t * (t * (t * 6 - 15) + 10); },
            lerp: function (a, b, t) { return (1 - t) * a + t * b; },
            noise2D: function (xin, yin) {
                var grad3 = this.grad3, perm = this.perm;
                var F2 = 0.5 * (Math.sqrt(3) - 1);
                var s = (xin + yin) * F2;
                var i = Math.floor(xin + s);
                var j = Math.floor(yin + s);
                var G2 = (3 - Math.sqrt(3)) / 6;
                var t = (i + j) * G2;
                var X0 = i - t, Y0 = j - t;
                var x0 = xin - X0, y0 = yin - Y0;
                var i1, j1;
                if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
                var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
                var x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
                var ii = i & 255, jj = j & 255;
                var gi0 = perm[ii + perm[jj]] % 12;
                var gi1 = perm[ii + i1 + perm[jj + j1]] % 12;
                var gi2 = perm[ii + 1 + perm[jj + 1]] % 12;
                var n0 = 0, n1 = 0, n2 = 0;
                var t0 = 0.5 - x0 * x0 - y0 * y0;
                if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * this.dot(grad3[gi0], x0, y0); }
                var t1 = 0.5 - x1 * x1 - y1 * y1;
                if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * this.dot(grad3[gi1], x1, y1); }
                var t2 = 0.5 - x2 * x2 - y2 * y2;
                if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * this.dot(grad3[gi2], x2, y2); }
                return 70 * (n0 + n1 + n2);
            }
        };
        pc.noise.init();
    }
};

DroneFloat.prototype.update = function (dt) {
    this.time += dt * this.floatSpeed;

    // ===== MOVIMIENTO SUAVE CON PERLIN NOISE =====
    var nx = pc.noise.noise2D(this.time * 0.5, 0) * this.floatAmount;
    var ny = pc.noise.noise2D(0, this.time * 0.5) * this.floatAmount;
    var nz = pc.noise.noise2D(this.time * 0.3, this.time * 0.7) * this.floatAmount;

    var pos = this.basePos.clone();
    pos.x += nx * this.noiseScale;
    pos.y += Math.sin(this.time) * this.floatAmount + ny * this.noiseScale;
    pos.z += nz * this.noiseScale;
    this.entity.setLocalPosition(pos);

    // ===== ROTACIÓN ORGÁNICA =====
    var tiltX = pc.noise.noise2D(this.time, 5) * this.rotationAmount; // pitch
    var tiltZ = pc.noise.noise2D(10, this.time) * this.rotationAmount; // roll
    var rot = new pc.Vec3(tiltX, 0, tiltZ);
    this.entity.setLocalEulerAngles(rot);
};