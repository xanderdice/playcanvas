var LensFlare = pc.createScript('lensFlare');

LensFlare.attributes.add("flaresTexture", {
    type: "asset",
    assetType: "texture",  // Especificamos que este atributo es de tipo textura
    title: "Flares Texture"    // Un título opcional para la interfaz de usuario del editor
});

LensFlare.attributes.add('flaresMaterial', {
    type: 'asset',
    assetType: 'material',  // Especificamos que este atributo es de tipo material
    title: 'Flares Material'    // Un título opcional para la interfaz de usuario del editor
});



// initialize code called once per entity
LensFlare.prototype.initialize = function () {

    if (!this.app.LensFlareManager) {
        this.app.LensFlareManager = {};
    }

    this.camera = null;


    // Obtener el material del plano
    this.material = this.entity.render.material;

    if (this.material) {
        this.material.depthWhite = true;
        this.material.depthTest = false;
        this.material.useFog = false;
        this.material.useLighting = false;
        this.material.useSkybox = false;
        this.material.useGammaTonemap = false;

        this.beamsMaterial = this.material.clone();
        this.beamsMaterial.depthWhite = false;
        this.beamsMaterial.useFog = false;
        this.beamsMaterial.useLighting = false;
        this.beamsMaterial.diffuse = pc.Color.WHITE;
        this.beamsMaterial.emissiveMap = null;
        this.beamsMaterial.emissive = pc.Color.WHITE;
        this.beamsMaterial.emissiveIntensity = 1;
    }

    this.beam = new pc.Entity();
    this.beam.addComponent('render', {
        type: 'sphere'
    });

    this.beam.setLocalScale(0.5, 0.5, 0.5);
    this.beam.render.material = this.beamsMaterial;
    this.beam.render.castShadows = false;
    this.beam.render.castShadowsLightmap = false;
    this.beam.render.receiveShadows = false;
    this.beam.render.isStatic = false;
    this.beam.render.lightmapped = false;
    this.app.scene.root.addChild(this.beam);

};

// Calcula el factor de escala en función de la distancia.
LensFlare.prototype._getScaleFactor = function (distance) {

    this.minDistance = this.camera.camera.nearClip;  // Distancia mínima para el tamaño máximo.
    this.maxDistance = this.camera.camera.farClip; // Distancia máxima para el tamaño mínimo.


    // Asegúrate de que la distancia esté entre el rango mínimo y máximo.
    var clampedDistance = pc.math.clamp(distance, this.minDistance, this.maxDistance);

    // Invertir la relación: cuando la distancia es mayor, el plano debe ser más grande.
    var scale = (clampedDistance - this.minDistance) / (this.maxDistance - this.minDistance);

    // Ajusta la escala según tus necesidades (puedes modificar estos valores).
    return pc.math.lerp(this.minDistance, this.maxDistance, scale); // Ajusta los valores según lo que necesites.
};

// update code called every frame
LensFlare.prototype.update = function (dt) {

    if (!this.camera) {
        this.camera = this.app.scene.root.findComponents("camera")[0].entity;
    }

    // Crear un nuevo Vec3 para los ángulos de Euler
    var eulerRotation = this.camera.getRotation().getEulerAngles().clone();
    eulerRotation.x += 90;
    this.entity.setEulerAngles(eulerRotation);




    const screenWidth = this.app.graphicsDevice.width;
    const screenHeight = this.app.graphicsDevice.height;

    const flarePos = this.camera.camera.worldToScreen(this.entity.getPosition());
    const isInScreen = flarePos.x >= 0 && flarePos.x <= screenWidth && flarePos.y >= 0 && flarePos.y <= screenHeight;


    this.entity.render.enabled = isInScreen;
    this.beam.render.enabled = this.entity.render.enabled;
    //this.enabled = isInScreen;


    if (isInScreen) {

        var cameraPosition = this.camera.getPosition();
        var lensFlarePos = this.entity.getPosition();

        // Dirección del raycast hacia la cámara
        //var direction = cameraPosition.clone().sub(lensFlarePos).normalize(); // Vector de dirección hacia la cámara


        var direction = lensFlarePos.clone().sub(cameraPosition).normalize();
        Tracer("direction", direction);

        // Realizar el raycast
        //var result = this.app.systems.rigidbody.raycastFirst(lensFlarePos, direction);
        var result = this.app.systems.rigidbody.raycastFirst(cameraPosition, direction);


        var distance = 10; // 10 metros
        var destination = lensFlarePos.clone().add(direction.scale(distance)); // Sumar la dirección escalada por 10 metros

        this.app.drawLine(lensFlarePos, destination, pc.Color.RED);


        Tracer("result", result);

        if (result) {
            //alert("Raycast hit:" + result.entity);
        } else {
            console.log('No hit');
        }

        // Calcular la posición opuesta en la pantalla


        var planePosition = this.entity.getPosition();
        var distance = cameraPosition.distance(planePosition);



        // Calcula la nueva escala del plano basada en la distancia.
        var scaleFactor = this._getScaleFactor(distance);


        // Aplica la nueva escala.
        this.entity.setLocalScale(scaleFactor, scaleFactor, scaleFactor);





        var oppositePos = new pc.Vec3(
            screenWidth - flarePos.x,
            screenHeight - flarePos.y,
            flarePos.z // Mantén la misma profundidad
        );


        // Convertir la posición opuesta a mundo
        var worldPos = this.camera.camera.screenToWorld(oppositePos.x, oppositePos.y, flarePos.z);


        // Colocar los haces en la posición calculada
        this.beam.setPosition(worldPos);

        // Hacer que los haces miren hacia la cámara

        this.beam.setEulerAngles(eulerRotation);

        // Calcular la opacidad basada en la posición
        var centerX = screenWidth / 2;
        var distanceFromCenter = Math.abs(oppositePos.x - centerX);
        var maxDistance = screenWidth / 2; // La distancia máxima (a los bordes de la pantalla)

        // Normalizar la distancia y calcular la opacidad
        /*var opacity = 1 - (distanceFromCenter / maxDistance);
        opacity = Math.max(0, Math.min(opacity, 1)); // Asegurarse de que esté entre 0 y 1*/


        var beamOpacity = distanceFromCenter / maxDistance; // Invertir el cálculo
        beamOpacity = Math.max(0, Math.min(beamOpacity, 1)); // Asegurarse de que esté entre 0 y 1
        beamOpacity = parseFloat(beamOpacity.toFixed(2));



        if (this.oldBeamOpacity != beamOpacity) {
            this.beamsMaterial.opacity = beamOpacity;
            this.beamsMaterial.update();
            this.oldBeamOpacity = beamOpacity;
        }

    }




};


LensFlare.prototype.createLensFlareMaterial = function () {

    var fragShader =

        `
    precision ` + this.app.graphicsDevice.precision + ` float;

 

    // Based on https://www.shadertoy.com/view/4sX3Rs
    uniform float iTime;
    uniform vec2 lensPosition;
    uniform vec2 iResolution;
    uniform vec3 colorGain;
    uniform float starPoints;
    uniform float glareSize;
    uniform float flareSize;
    uniform float flareSpeed;
    uniform float flareShape;
    uniform float haloScale;
    uniform float opacity;
    uniform bool animated;
    uniform bool anamorphic;
    uniform bool enabled;
    uniform bool secondaryGhosts;
    uniform bool starBurst;
    uniform float ghostScale;
    uniform bool aditionalStreaks;
    uniform sampler2D lensDirtTexture;
    varying vec2 vUv;

    float uDispersal = 0.3;
    float uHaloWidth = 0.6;
    float uDistortion = 1.5;
    float uBrightDark = 0.5;
    vec2 vTexCoord;
    

    float rand(float n){return fract(sin(n) * 43758.5453123);}

    float noise(float p){
        float fl = floor(p);
        float fc = fract(p);
        return mix(rand(fl),rand(fl + 1.0), fc);
    }

    vec3 hsv2rgb(vec3 c)
    {
        vec4 k = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
        return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);
    }

    float saturate2(float x)
    {
        return clamp(x, 0.,1.);
    }


    vec2 rotateUV(vec2 uv, float rotation)
    {
        return vec2(
            cos(rotation) * uv.x + sin(rotation) * uv.y,
            cos(rotation) * uv.y - sin(rotation) * uv.x
        );
    }

    // Based on https://www.shadertoy.com/view/XtKfRV
    vec3 drawflare(vec2 p, float intensity, float rnd, float speed, int id)
    {
        float flarehueoffset = (1. / 32.) * float(id) * 0.1;
        float lingrad = distance(vec2(0.), p);
        float expgrad = 1. / exp(lingrad * (fract(rnd) * 0.66 + 0.33));
        vec3 colgrad = hsv2rgb(vec3( fract( (expgrad * 8.) + speed * flareSpeed + flarehueoffset), pow(1.-abs(expgrad*2.-1.), 0.45), 20.0 * expgrad * intensity)); //rainbow spectrum effect

        float internalStarPoints;

        if(anamorphic){
            internalStarPoints = 1.0;
        } else{
            internalStarPoints = starPoints;
        }
        
        float blades = length(p * flareShape * sin(internalStarPoints * atan(p.x, p.y))); //draw 6 blades
        
        float comp = pow(1.-saturate2(blades), ( anamorphic ? 100. : 12.));
        comp += saturate2(expgrad-0.9) * 3.;
        comp = pow(comp * expgrad, 8. + (1.-intensity) * 5.);
        
        if(flareSpeed > 0.0){
            return vec3(comp) * colgrad;
        } else{
            return vec3(comp) * flareSize * 15.;
        }
    }

    float dist(vec3 a, vec3 b) { return abs(a.x - b.x) + abs(a.y - b.y) + abs(a.z - b.z); }

    float glare(vec2 uv, vec2 pos, float size)
    {
        vec2 main;

        if(animated){
        main = rotateUV(uv-pos, iTime * 0.1);      
        } else{
        main = uv-pos;     
        }
        
        float ang = atan(main.y, main.x) * (anamorphic ? 1.0 : starPoints);
        float dist = length(main); 
        dist = pow(dist, .9);
        
        float f0 = 1.0/(length(uv-pos)*(1.0/size*16.0)+.2);

        return f0+f0*(sin((ang))*.2 +.3);
    }

    //https://www.shadertoy.com/view/Xd2GR3
    float sdHex(vec2 p){
        p = abs(p);
        vec2 q = vec2(p.x*2.0*0.5773503, p.y + p.x*0.5773503);
        return dot(step(q.xy,q.yx), 1.0-q.yx);
    }

    //fakes x^n for specular effects (k is 0-1)
    float fpow(float x, float k){
        return x > k ? pow((x-k)/(1.0-k),2.0) : 0.0;
    }

    vec3 renderhex(vec2 uv, vec2 p, float s, vec3 col){
        uv -= p;
        if (abs(uv.x) < 0.2*s && abs(uv.y) < 0.2*s){
            return mix(vec3(0),mix(vec3(0),col,0.1 + fpow(length(uv/s),0.1)*10.0),smoothstep(0.0,0.1,sdHex(uv*20.0/s)));
        }
        return vec3(0);
    }

    vec3 LensFlare(vec2 uv, vec2 pos)
    {
        vec2 main = uv-pos;
        vec2 uvd = uv*(length(uv));
        
        float ang = atan(main.x,main.y);
        
        float f0 = .3/(length(uv-pos)*16.0+1.0);
        
        f0 = f0*(sin(noise(sin(ang*3.9-(animated ? iTime : 0.0) * 0.3) * starPoints))*.2 );
        
        float f1 = max(0.01-pow(length(uv+1.2*pos),1.9),.0)*7.0;

        float f2 = max(.9/(10.0+32.0*pow(length(uvd+0.99*pos),2.0)),.0)*0.35;
        float f22 = max(.9/(11.0+32.0*pow(length(uvd+0.85*pos),2.0)),.0)*0.23;
        float f23 = max(.9/(12.0+32.0*pow(length(uvd+0.95*pos),2.0)),.0)*0.6;
        
        vec2 uvx = mix(uv,uvd, 0.1);
        
        float f4 = max(0.01-pow(length(uvx+0.4*pos),2.9),.0)*4.02;
        float f42 = max(0.0-pow(length(uvx+0.45*pos),2.9),.0)*4.1;
        float f43 = max(0.01-pow(length(uvx+0.5*pos),2.9),.0)*4.6;
        
        uvx = mix(uv,uvd,-.4);
        
        float f5 = max(0.01-pow(length(uvx+0.1*pos),5.5),.0)*2.0;
        float f52 = max(0.01-pow(length(uvx+0.2*pos),5.5),.0)*2.0;
        float f53 = max(0.01-pow(length(uvx+0.1*pos),5.5),.0)*2.0;
        
        uvx = mix(uv,uvd, 2.1);
        
        float f6 = max(0.01-pow(length(uvx-0.3*pos),1.61),.0)*3.159;
        float f62 = max(0.01-pow(length(uvx-0.325*pos),1.614),.0)*3.14;
        float f63 = max(0.01-pow(length(uvx-0.389*pos),1.623),.0)*3.12;
        
        vec3 c = vec3(glare(uv,pos, glareSize));

        vec2 prot;

        if(animated){
            prot = rotateUV(uv - pos, (iTime * 0.1));  
        } else if(anamorphic){
            prot = rotateUV(uv - pos, 1.570796);     
        } else {
            prot = uv - pos;
        }

        c += drawflare(prot, (anamorphic ? flareSize * 10. : flareSize), 0.1, iTime, 1);
        
        c.r+=f1+f2+f4+f5+f6; c.g+=f1+f22+f42+f52+f62; c.b+=f1+f23+f43+f53+f63;
        c = c*1.3 * vec3(length(uvd)+.09); // Vignette
        c+=vec3(f0);
        
        return c;
    }

    vec3 cc(vec3 color, float factor,float factor2)
    {
        float w = color.x+color.y+color.z;
        return mix(color,vec3(w)*factor,w*factor2);
    }    

    float rnd(vec2 p)
    {
        float f = fract(sin(dot(p, vec2(12.1234, 72.8392) )*45123.2));
        return f;   
    }

    float rnd(float w)
    {
        float f = fract(sin(w)*1000.);
        return f;   
    }

    float regShape(vec2 p, int N)
    {
        float f;
        
        float a=atan(p.x,p.y)+.2;
        float b=6.28319/float(N);
        f=smoothstep(.5,.51, cos(floor(.5+a/b)*b-a)*length(p.xy)* 2.0  -ghostScale);
            
        return f;
    }

    // Based on https://www.shadertoy.com/view/Xlc3D2
    vec3 circle(vec2 p, float size, float decay, vec3 color, vec3 color2, float dist, vec2 mouse)
    {
        float l = length(p + mouse*(dist*2.))+size/2.;
        float l2 = length(p + mouse*(dist*4.))+size/3.;
        
        float c = max(0.04-pow(length(p + mouse*dist), size*ghostScale), 0.0)*10.;
        float c1 = max(0.001-pow(l-0.3, 1./40.)+sin(l*20.), 0.0)*3.;
        float c2 =  max(0.09/pow(length(p-mouse*dist/.5)*1., .95), 0.0)/20.;
        float s = max(0.02-pow(regShape(p*5. + mouse*dist*5. + decay, 6) , 1.), 0.0)*1.5;
        
        color = cos(vec3(colorGain)*16. + dist/8.)*0.5+.5;
        vec3 f = c*color;
        f += c1*color;
        f += c2*color;  
        f +=  s*color;
        return f;
    }

    vec4 getLensColor(float x){
        return vec4(vec3(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(vec3(0., 0., 0.),
        vec3(0., 0., 0.), smoothstep(0.0, 0.063, x)),
        vec3(0., 0., 0.), smoothstep(0.063, 0.125, x)),
        vec3(0.0, 0., 0.), smoothstep(0.125, 0.188, x)),
        vec3(0.188, 0.131, 0.116), smoothstep(0.188, 0.227, x)),
        vec3(0.31, 0.204, 0.537), smoothstep(0.227, 0.251, x)),
        vec3(0.192, 0.106, 0.286), smoothstep(0.251, 0.314, x)),
        vec3(0.102, 0.008, 0.341), smoothstep(0.314, 0.392, x)),
        vec3(0.086, 0.0, 0.141), smoothstep(0.392, 0.502, x)),
        vec3(1.0, 0.31, 0.0), smoothstep(0.502, 0.604, x)),
        vec3(.1, 0.1, 0.1), smoothstep(0.604, 0.643, x)),
        vec3(1.0, 0.929, 0.0), smoothstep(0.643, 0.761, x)),
        vec3(1.0, 0.086, 0.424), smoothstep(0.761, 0.847, x)),
        vec3(1.0, 0.49, 0.0), smoothstep(0.847, 0.89, x)),
        vec3(0.945, 0.275, 0.475), smoothstep(0.89, 0.941, x)),
        vec3(0.251, 0.275, 0.796), smoothstep(0.941, 1.0, x))),
        1.0);
    }

    float dirtNoise(vec2 p){
        vec2 f = fract(p);
        f = (f * f) * (3.0 - (2.0 * f));    
        float n = dot(floor(p), vec2(1.0, 157.0));
        vec4 a = fract(sin(vec4(n + 0.0, n + 1.0, n + 157.0, n + 158.0)) * 43758.5453123);
        return mix(mix(a.x, a.y, f.x), mix(a.z, a.w, f.x), f.y);
    } 

    float fbm(vec2 p){
        const mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
        float f = 0.0;
        f += 0.5000*dirtNoise(p); p = m*p*2.02;
        f += 0.2500*dirtNoise(p); p = m*p*2.03;
        f += 0.1250*dirtNoise(p); p = m*p*2.01;
        f += 0.0625*dirtNoise(p);
        return f/0.9375;
    } 
    vec4 getLensStar(vec2 p){
        vec2 pp = (p - vec2(0.5)) * 2.0;
        float a = atan(pp.y, pp.x);
        vec4 cp = vec4(sin(a * 1.0), length(pp), sin(a * 13.0), sin(a * 53.0));
        float d = sin(clamp(pow(length(vec2(0.5) - p) * 0.5 + haloScale /2., 5.0), 0.0, 1.0) * 3.14159);
        vec3 c = vec3(d) * vec3(fbm(cp.xy * 16.0) * fbm(cp.zw * 9.0) * max(max(max(max(0.5, sin(a * 1.0)), sin(a * 3.0) * 0.8), sin(a * 7.0) * 0.8), sin(a * 9.0) * 10.6));
        c *= vec3(mix(2.0, (sin(length(pp.xy) * 256.0) * 0.5) + 0.5, sin((clamp((length(pp.xy) - 0.875) / 0.1, 0.0, 1.0) + 0.0) * 2.0 * 3.14159) * 1.5) + 0.5) * 0.3275;
        return vec4(vec3(c * 1.0), d);	
    }

    vec4 getLensDirt(vec2 p){
        p.xy += vec2(fbm(p.yx * 3.0), fbm(p.yx * 2.0)) * 0.0825;
        vec3 o = vec3(mix(0.125, 0.25, max(max(smoothstep(0.1, 0.0, length(p - vec2(0.25))),
                                            smoothstep(0.4, 0.0, length(p - vec2(0.75)))),
                                            smoothstep(0.8, 0.0, length(p - vec2(0.875, 0.125))))));
        o += vec3(max(fbm(p * 1.0) - 0.5, 0.0)) * 0.5;
        o += vec3(max(fbm(p * 2.0) - 0.5, 0.0)) * 0.5;
        o += vec3(max(fbm(p * 4.0) - 0.5, 0.0)) * 0.25;
        o += vec3(max(fbm(p * 8.0) - 0.75, 0.0)) * 1.0;
        o += vec3(max(fbm(p * 16.0) - 0.75, 0.0)) * 0.75;
        o += vec3(max(fbm(p * 64.0) - 0.75, 0.0)) * 0.5;
        return vec4(clamp(o, vec3(0.15), vec3(1.0)), 1.0);	
    }

    vec4 textureLimited(sampler2D tex, vec2 texCoord){
        if(((texCoord.x < 0.) || (texCoord.y < 0.)) || ((texCoord.x > 1.) || (texCoord.y > 1.))){
        return vec4(0.0);
        }else{
        return texture2D(tex, texCoord); 
        }
    }

    vec4 textureDistorted(sampler2D tex, vec2 texCoord, vec2 direction, vec3 distortion) {
        return vec4(textureLimited(tex, (texCoord + (direction * distortion.r))).r,
                    textureLimited(tex, (texCoord + (direction * distortion.g))).g,
                    textureLimited(tex, (texCoord + (direction * distortion.b))).b,
                    1.0);
    }

    vec4 getStartBurst(){
        vec2 aspectTexCoord = vec2(1.0) - (((vTexCoord - vec2(0.5)) * vec2(1.0)) + vec2(0.5)); 
        vec2 texCoord = vec2(1.0) - vTexCoord; 
        vec2 ghostVec = (vec2(0.5) - texCoord) * uDispersal - lensPosition;
        vec2 ghostVecAspectNormalized = normalize(ghostVec * vec2(1.0)) * vec2(1.0);
        vec2 haloVec = normalize(ghostVec) * uHaloWidth;
        vec2 haloVecAspectNormalized = ghostVecAspectNormalized * uHaloWidth;
        vec2 texelSize = vec2(1.0) / vec2(iResolution.xy);
        vec3 distortion = vec3(-(texelSize.x * uDistortion), 0.2, texelSize.x * uDistortion);
        vec4 c = vec4(0.0);
        for (int i = 0; i < 8; i++) {
        vec2 offset = texCoord + (ghostVec * float(i));
        c += textureDistorted(lensDirtTexture, offset, ghostVecAspectNormalized, distortion) * pow(max(0.0, 1.0 - (length(vec2(0.5) - offset) / length(vec2(0.5)))), 10.0);
        }                       
        vec2 haloOffset = texCoord + haloVecAspectNormalized; 
        return (c * getLensColor((length(vec2(0.5) - aspectTexCoord) / length(vec2(haloScale))))) + 
            (textureDistorted(lensDirtTexture, haloOffset, ghostVecAspectNormalized, distortion) * pow(max(0.0, 1.0 - (length(vec2(0.5) - haloOffset) / length(vec2(0.5)))), 10.0));
    } 

    void main()
    {
        vec2 uv = vUv;
        vec2 myUV = uv -0.5;
        myUV.y *= iResolution.y/iResolution.x;
        vec2 mouse = lensPosition * 0.5;
        mouse.y *= iResolution.y/iResolution.x;
        
        //First LensFlarePass
        vec3 finalColor = LensFlare(myUV, mouse) * 20.0 * colorGain / 256.;

        //Aditional Streaks
        if(aditionalStreaks){
            vec3 circColor = vec3(0.9, 0.2, 0.1);
            vec3 circColor2 = vec3(0.3, 0.1, 0.9);

            for(float i=0.;i<10.;i++){
            finalColor += circle(myUV, pow(rnd(i*2000.)*2.8, .1)+1.41, 0.0, circColor+i , circColor2+i, rnd(i*20.)*3.+0.2-.5, lensPosition);
            }
        }

        //Alternative Ghosts
        if(secondaryGhosts){
            vec3 altGhosts = vec3(0.1);
            altGhosts += renderhex(myUV, -lensPosition*0.25, ghostScale * 1.4, vec3(0.03)* colorGain);
            altGhosts += renderhex(myUV, lensPosition*0.25, ghostScale * 0.5, vec3(0.03)* colorGain);
            altGhosts += renderhex(myUV, lensPosition*0.1, ghostScale * 1.6,vec3(0.03)* colorGain);
            altGhosts += renderhex(myUV, lensPosition*1.8, ghostScale * 2.0, vec3(0.03)* colorGain);
            altGhosts += renderhex(myUV, lensPosition*1.25, ghostScale * 0.8, vec3(0.03)* colorGain);
            altGhosts += renderhex(myUV, -lensPosition*1.25, ghostScale * 5.0, vec3(0.03)* colorGain);
            
            //Circular ghost
            altGhosts += fpow(1.0 - abs(distance(lensPosition*0.8,myUV) - 0.5),0.985)*vec3(.1);
            altGhosts += fpow(1.0 - abs(distance(lensPosition*0.4,myUV) - 0.2),0.994)*vec3(.05);
            finalColor += altGhosts;
        }
        

        //Starburst                     
        if(starBurst){
            vTexCoord = myUV + 0.5;
            vec4 lensMod = getLensDirt(myUV);
            float tooBright = 1.0 - (clamp(uBrightDark, 0.0, 0.5) * 2.0); 
            float tooDark = clamp(uBrightDark - 0.5, 0.0, 0.5) * 2.0;
            lensMod += mix(lensMod, pow(lensMod * 2.0, vec4(2.0)) * 0.5, tooBright);
            float lensStarRotationAngle = ((myUV.x + myUV.y)) * (1.0 / 6.0);
            vec2 lensStarTexCoord = (mat2(cos(lensStarRotationAngle), -sin(lensStarRotationAngle), sin(lensStarRotationAngle), cos(lensStarRotationAngle)) * vTexCoord);
            lensMod += getLensStar(lensStarTexCoord) * 2.;
            
            finalColor += clamp((lensMod.rgb * getStartBurst().rgb ), 0.01, 1.0);
        }

        //Final composed output
        if(enabled){

            gl_FragColor = vec4(finalColor, mix(finalColor, -vec3(.15), 0.5) * opacity);

            //#include <tonemapping_fragment>
            //#include <encodings_fragment>
        }
    }
`;

    var vertexShader = `

        attribute vec3 position;
        attribute vec2 uv; // Atributo UV

        uniform mat4 matrix_model;
        uniform mat4 matrix_viewProjection;

        varying vec3 vWorldPos;
        varying vec4 vProjectedPos;
        varying vec2 vUv;

        void main(void)
        {
            vUv = uv;
            vec4 worldPos = matrix_model * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            vProjectedPos = matrix_viewProjection * worldPos;
            gl_Position = vProjectedPos;
        }

    `;


    vertexShader = `
attribute vec3 aPosition;
attribute vec2 aUv0;

varying vec2 vUv;

void main(void) {
    gl_Position = vec4(aPosition, 1.0);
    vUv = aUv0;
}
        `;

    fragShader = `
            precision ` + this.app.graphicsDevice.precision + ` float;

varying vec2 vUv;

void main(void) {
    // Ajustar el tamaño del círculo en función del plano
    float radius = 0.5; // Radio del círculo (ajustar según sea necesario)
    vec2 center = vec2(0.5, 0.5); // Centro del círculo en UV

    float dist = length(vUv - center);
    //if (dist < radius) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // Color del círculo (rojo)
    //} else {
        discard; // Fondo transparente
    //}
}
        `;




    const lensFlareShader = new pc.Shader(this.app.graphicsDevice, {
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aUv0: pc.SEMANTIC_TEXCOORD0,
        },
        vshader: vertexShader,
        fshader: fragShader,
    });


    this.lensFlareMaterial = new pc.Material();
    /*this.lensFlareMaterial.depthTest = false;
    this.lensFlareMaterial.useLighting = false;
    this.lensFlareMaterial.useSkybox = false;
    this.lensFlareMaterial.useFog = false;
    this.lensFlareMaterial.useGammaTonemap = false;
    */
    this.lensFlareMaterial.blendType = pc.BLEND_NORMAL; // Habilitar mezcla
    this.lensFlareMaterial.opacity = 1; // Opacidad completa


    if (this.lensDirtTexture) {
        var lensDirtTexture = this.app.assets.get(this.lensDirtTexture.id).resource;
        this.lensFlareMaterial.setParameter('lensDirtTexture', lensDirtTexture);
    }
    /*
        var width = pc.app.graphicsDevice.width;
        var height = pc.app.graphicsDevice.height;
        this.lensFlareMaterial.setParameter('iResolution', [width, height]);
    
        this.lensFlareMaterial.setParameter('enabled', true);
        this.lensFlareMaterial.setParameter('lensPosition', [25, 2]);
    
        this.lensFlareMaterial.setParameter('opacity', 0.8);
        this.lensFlareMaterial.setParameter('colorGain', [1, 1, 1]);
        this.lensFlareMaterial.setParameter('starPoints', 5.0);
        this.lensFlareMaterial.setParameter('glareSize', 0.55);
        this.lensFlareMaterial.setParameter('flareSize', 0.004);
        this.lensFlareMaterial.setParameter('flareSpeed', 0.4);
        this.lensFlareMaterial.setParameter('flareShape', 1.2);
        this.lensFlareMaterial.setParameter('haloScale', 0.5);
        this.lensFlareMaterial.setParameter('animated', true);
        this.lensFlareMaterial.setParameter('anamorphic', false);
        this.lensFlareMaterial.setParameter('secondaryGhosts', true);
        this.lensFlareMaterial.setParameter('starBurst', true);
        this.lensFlareMaterial.setParameter('ghostScale', 0.3);
        this.lensFlareMaterial.setParameter('aditionalStreaks', true);
        this.lensFlareMaterial.setParameter('followMouse', false);
    
        this.lensFlareMaterial.setParameter('pepito', false);
    */
    this.lensFlareMaterial.shader = lensFlareShader;
    //};
};

// uncomment the swap method to enable hot-reloading for this script
// update the method body to copy state from the old instance
// LensFlare.prototype.swap = function(old) { };

// learn more about scripting here:
// https://developer.playcanvas.com/user-manual/scripting/