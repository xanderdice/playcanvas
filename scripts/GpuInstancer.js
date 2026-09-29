/* GpuInstancer.js — Instancing por GPU automático y encapsulado (PlayCanvas 2.x, script CLÁSICO)

   QUÉ HACE
   Se pone UNA VEZ en una entidad (la raíz, por ejemplo) y no hay que tocar nada
   más de la escena. Intercepta el punto exacto por donde el engine registra las
   mesh instances en las capas y colapsa todas las copias de (MISMA malla +
   MISMO material) en UN solo comando de dibujo con hardware instancing. El
   resto de la escena —entidades, componentes render, materiales, luces— sigue
   igual: nadie tiene que saber que este script existe.

   DE DÓNDE VIENE
   La idea de encapsularlo así es la de uranusInstancer.js: parchear
   pc.Layer.prototype.addMeshInstances, crear un MeshInstance "proxy" por grupo,
   agrupar por celdas y elegir nivel de detalle. Lo que sigue es esa idea
   reescrita contra el engine 2.x, con los agujeros tapados:

   | Uranus                                   | Acá                                          |
   |------------------------------------------|----------------------------------------------|
   | UN buffer por payload, rellenado dentro   | UNA VISTA (buffer + proxy) POR CÁMARA. En    |
   | de isVisibleFunc para "la" cámara         | 2.x el engine CULEA TODAS las cámaras ANTES  |
   |                                          | de dibujar (Renderer.cullComposition +       |
   |                                          | Layer.getCulledInstances), así que un buffer |
   |                                          | compartido lo pisa la última cámara que      |
   |                                          | culea: con 2 cámaras el resultado es erróneo.|
   | clonaba materiales para forzar INSTANCING | innecesario en 2.x: setInstancing() ya pone  |
   |                                          | SHADERDEF_INSTANCING en la mesh instance y   |
   |                                          | las variantes de shader se cachean por       |
   |                                          | objDefs. Menos materiales, menos VRAM.       |
   | id de payload = BigInt con mesh.id y      | clave string completa: sin colisiones cuando |
   | material.id truncados a 16 bits           | la escena pasa de 65535 ids.                 |
   | copiaba matriz a matriz (bucle JS)        | Float32Array.set() por celda: una copia de   |
   |                                          | bloque en vez de 16 escrituras por instancia.|
   | oclusión con consultas de GPU (WebGL2)    | oclusión por ocluyentes grandes en CPU, sin  |
   |                                          | latencia ni stalls (ver informe, punto 12).  |
   | sin guarda de lightmap                    | GUARDA: nunca instancia un objeto con        |
   |                                          | lightmap horneado (ver abajo).               |
   | LOD por distancia                         | LOD por TAMAÑO EN PANTALLA con histéresis.   |
   | lo horneado no se puede instanciar        | atlas de lightmaps: sí se puede, y con la    |
   |                                          | iluminación correcta en cada copia.          |
   | worker + assets externos + polyfills      | un archivo, cero dependencias.               |

   LO QUE IMPLEMENTA DEL INFORME "Rendimiento y luz en pcse"
   - (02) Medir antes que nada: contadores propios por frame (draw calls
     ahorrados, instancias enviadas y descartadas por cada motivo, bytes
     subidos, ms de CPU del propio instancer), HUD opcional y pc.MiniStats.
   - (03) Lightmap + instancing: el informe pide PROHIBIRLO porque es el peor
     fallo silencioso de la lista —compila, renderiza, y las N copias muestran
     la misma iluminación horneada—. Acá está prohibido... y además resuelto:
     los lightmaps del grupo se juntan en un ATLAS y cada instancia recibe su
     rectángulo, que es como lo resuelve la industria. Si el engine no expone
     los chunks necesarios, el atlas no se activa y se vuelve a la prohibición
     (esos objetos no se instancian en color y se avisa por consola). Nunca se
     dibuja una iluminación equivocada. Ver la sección del atlas más abajo.
   - (04) Culling por distancia y por tamaño en pantalla: la mejor relación
     resultado/renglón del informe.
   - (09) Nivel de detalle de dos (o más) escalones, por tamaño en pantalla.
   - (10) Instancing POR CELDA, no global: con cull en su valor por defecto
     (false) un búfer global se envía entero en cada cámara y en cada cascada
     de sombra. Acá setInstancing(vb, TRUE) siempre, y además la celda entera
     se descarta antes de mirar una sola instancia.
   - (12) Oclusión por ocluyentes grandes (estilo Godot), al final de la cadena
     porque el beneficio medido es modesto y no reduce el coste de sombras.
   Y los fallos silenciosos que enumera:
   - setInstancing no culea por defecto  -> siempre se pasa cull = true.
   - la matriz de instancia se multiplica por el worldTransform del nodo
     (engine >= 2.0.0: el chunk real es "matrix_model * mat4(instance_line1..4)")
     -> los proxies cuelgan de un pc.GraphNode propio que NUNCA se mueve.
   - MeshInstance.visible es global, no por cámara -> este script no toca
     .visible jamás; usa MeshInstance.isVisibleFunc, que el engine consulta
     por cámara (incluida cada cámara de sombra).
   - la niebla no ahorra nada -> opción para atar la distancia de culling al
     final de la niebla, que es donde sí está el ahorro.
   - el batcher pelea con los lightmaps y con el culling por objeto -> si un
     objeto tiene batchGroupId asignado se lo deja en paz y se avisa.

   LO QUE NO HACE (a propósito)
   - No instancia objetos con skin (skinning), con morph targets, con
     parámetros de material propios de esa mesh instance, ni con batchGroupId.
     Cada uno de esos casos rompe de una forma distinta. Los que tienen
     lightmap horneado SÍ se instancian, pero por el camino del atlas.
   - No hace culling dirigido por GPU (consultas, Hi-Z, compute, dibujo
     indirecto): WebGL2 no lo permite y el informe lo descarta.
   - No fusiona mallas distintas en una sola (eso corre offline, en un paso de
     horneado, no en runtime).
   - No toca lightmaps, tonemapping, ni pixel ratio: esos puntos del informe
     son del horneador y del editor, no de un instancer.

   LÍMITES CONOCIDOS (honestidad por delante)
   - PICKING: las entidades instanciadas dejan de existir como mesh instances
     en la capa, así que pc.Picker no las encuentra. Usá el tag de exclusión en
     lo que necesite ser clickeable, o raycast de física.
   - TRANSPARENCIA: por defecto NO se instancian materiales transparentes,
     porque al colapsarlos se pierde el orden por objeto y aparecen artefactos.
     Se puede forzar (capture.transparent) si el material no lo sufre.
   - Una entidad instanciada que se MUEVE hay que declararla dinámica (tag) o
     avisar con instancer.refresh(entity). Lo estático se fotografía una vez.
   - Materiales con parámetros por mesh instance (setParameter en la instancia)
     quedan fuera: en un draw instanciado hay UN solo juego de parámetros. La
     excepción es el lightmap, que es justamente lo que resuelve el atlas.
   - El ATLAS de lightmaps DUPLICA en VRAM los lightmaps del grupo (quedan la
     copia original de cada objeto y la del atlas). Con lightmaps de 128x128 y
     500 objetos son unos 33 MB de más. Si no te sobra memoria, apagá
     lightmaps.atlas y esos objetos vuelven a dibujarse de a uno.
   - El atlas cambia UN chunk global del engine (transformInstancingVS) por uno
     equivalente. Es equivalente para cualquier matriz rígida, que es lo único
     que se usa para instanciar, y se restaura si el script se destruye.

   CÓMO SE USA
   1. Poné este script en UNA entidad (la raíz). Nada más es obligatorio.
   2. Opcional, por entidad:
      - tag "no-instancing"        -> esa entidad no se instancia.
      - tag "instancing-dynamic"   -> esa entidad se mueve; se relee su matriz.
      - script gpuInstancerLod     -> niveles de detalle propios de ese objeto.
      - script gpuInstancerOccluder-> ese objeto tapa a los demás (ocluyente).
   3. Para medir: activá debug.hud y mirá la consola con instancer.report().

   VERIFICADO CONTRA
   PlayCanvas 2.7.4 (bundle estable de code.playcanvas.com, leído a mano):
   - MeshInstance.setInstancing = function(vb, cull) { ... cull ?? false ... }
   - MeshInstance._isVisible: isVisibleFunc ? isVisibleFunc(camera) : esfera vs frustum
   - Renderer.cullComposition: culea TODAS las cámaras y después renderiza
   - ShadowRenderer._cullShadowCastersInternal: castShadow && (!cull || _isVisible(shadowCam))
   - chunk de instancing: matrix_model * mat4(instance_line1..4)
   - VertexBuffer.setData exige data.byteLength === this.numBytes
   - Frustum.containsSphere devuelve 0 fuera / 1 cruza / 2 dentro
   - SHADERDEF_LM = 64, SHADERDEF_DIRLM = 128, SHADERDEF_SKIN = 2, INSTANCING = 32
   Si usás otra versión del engine, el script avisa por consola de lo que no
   encuentre en vez de romper en silencio.
*/

var GpuInstancer = pc.createScript('gpuInstancer');

GpuInstancer.VERSION = '1.0.0';

/* ------------------------------------------------------------------------- */
/* Atributos                                                                  */
/* ------------------------------------------------------------------------- */

GpuInstancer.attributes.add('inEditor', {
    type: 'boolean',
    default: false,
    title: 'In Editor',
    description: 'Correr también dentro del editor de PlayCanvas. Apagado por defecto: en el editor conviene ver la escena tal cual es, y el instancer saca las mesh instances de las capas.'
});

GpuInstancer.attributes.add('excludeLayers', {
    type: 'string',
    array: true,
    default: ['Depth', 'Skybox', 'Immediate', 'UI', 'Sky', 'Occlusion'],
    title: 'Exclude Layers',
    description: 'Capas que no se tocan. Las de sistema (profundidad, cielo, UI, dibujo inmediato) nunca deben instanciarse.'
});

GpuInstancer.attributes.add('capture', {
    type: 'json',
    title: 'Captura',
    description: 'Qué se instancia y qué se deja en paz.',
    schema: [
        {
            name: 'auto',
            type: 'boolean', default: true,
            title: 'Auto',
            description: 'Capturar automáticamente todo lo que ya está en la escena y todo lo que se agregue después. Si lo apagás, solo se instancia lo que tenga el tag de "Only Tag".'
        },
        {
            name: 'transparent',
            type: 'boolean', default: false,
            title: 'Transparent',
            description: 'Instanciar también materiales transparentes. APAGADO por defecto: al colapsar N objetos en un draw se pierde el orden por objeto y las transparencias se pisan entre sí.'
        },
        {
            name: 'minPerBatch',
            type: 'number', default: 2, min: 1, precision: 0,
            title: 'Min Per Batch',
            description: 'Un grupo con menos copias que esto se devuelve a la capa tal como estaba. Instanciar UNA copia no ahorra nada y cuesta un buffer.'
        },
        {
            name: 'shadowsOfNonInstanced',
            type: 'boolean', default: true,
            title: 'Shadows Of Non Instanced',
            description: 'Instanciar las SOMBRAS de objetos que no se pudieron instanciar en el pase de color (típico: los que tienen lightmap). El shader de sombra no lee lightmaps ni transparencia, así que ahí sí es seguro, y según el informe las sombras son la mayoría de los draw calls.'
        },
        {
            name: 'excludeTag',
            type: 'string', default: 'no-instancing',
            title: 'Exclude Tag',
            description: 'Entidades con este tag (o con un padre que lo tenga) nunca se instancian. Usalo para lo que tenga que seguir siendo clickeable con pc.Picker.'
        },
        {
            name: 'onlyTag',
            type: 'string', default: '',
            title: 'Only Tag',
            description: 'Si lo llenás, SOLO se instancian las entidades con este tag. Es el modo opt-in, útil para empezar de a poco en una escena grande.'
        },
        {
            name: 'dynamicTag',
            type: 'string', default: 'instancing-dynamic',
            title: 'Dynamic Tag',
            description: 'Entidades con este tag se mueven: su matriz se vuelve a leer en cada reconstrucción del buffer. Sin el tag, la matriz se fotografía una vez (y se puede refrescar a mano con instancer.refresh(entity)).'
        }
    ]
});

GpuInstancer.attributes.add('cells', {
    type: 'json',
    title: 'Celdas',
    description: 'Rejilla espacial. Es la unidad de todo: culling, nivel de detalle y oclusión descartan CELDAS ENTERAS antes de mirar una sola instancia, y la celda visible se copia al buffer de un saque.',
    schema: [
        {
            name: 'enabled',
            type: 'boolean', default: true,
            title: 'Enabled',
            description: 'Sin celdas, cada frame recorre todas las instancias de cada grupo. Con celdas, la mayoría se descarta con una prueba por celda.'
        },
        {
            name: 'size',
            type: 'vec3', default: [40, 40, 40],
            title: 'Size',
            description: 'Tamaño de celda en metros. Chica = más celdas (más pruebas, mejor descarte). Grande = menos pruebas, peor descarte. Regla práctica: que entren entre 20 y 200 instancias por celda.'
        },
        {
            name: 'perInstance',
            type: 'boolean', default: true,
            title: 'Per Instance',
            description: 'Dentro de una celda que cruza el borde del frustum (o que está cerca), probar instancia por instancia. Si lo apagás, la celda va entera o no va: más barato en CPU, más vértices a la GPU.'
        }
    ]
});

GpuInstancer.attributes.add('culling', {
    type: 'json',
    title: 'Culling',
    description: 'El orden de coste es el que recomienda la industria: distancia, tamaño en pantalla, frustum y recién al final oclusión.',
    schema: [
        {
            name: 'frustum',
            type: 'boolean', default: true,
            title: 'Frustum',
            description: 'Descartar lo que queda fuera de la vista de la cámara.'
        },
        {
            name: 'maxDistance',
            type: 'number', default: 0, min: 0,
            title: 'Max Distance',
            description: 'Distancia máxima a la que se dibuja una instancia. 0 = usar el Far Clip de cada cámara.'
        },
        {
            name: 'minScreenSize',
            type: 'number', default: 0, min: 0, precision: 1,
            title: 'Min Screen Size',
            description: 'Radio proyectado mínimo EN PÍXELES. Por debajo de eso la instancia no se dibuja. 2 o 3 px ya es invisible y suele borrar la mitad de un bosque. 0 = apagado.'
        },
        {
            name: 'useFogEnd',
            type: 'boolean', default: false,
            title: 'Use Fog End',
            description: 'Usar el final de la niebla (scene.fogEnd) como distancia máxima. La niebla NO ahorra nada por sí sola —se mezcla al final del sombreado—: el ahorro está en dejar de dibujar lo que ya tapó.'
        },
        {
            name: 'hysteresis',
            type: 'number', default: 0.08, min: 0, max: 0.5, precision: 2,
            title: 'Hysteresis',
            description: 'Margen relativo para que una instancia que YA se veía no parpadee al quedar justo en el borde de un umbral (distancia, tamaño o nivel de detalle).'
        }
    ]
});

GpuInstancer.attributes.add('shadows', {
    type: 'json',
    title: 'Sombras',
    description: 'Las sombras suelen ser la mayoría de los draw calls de un frame, y ninguna técnica de oclusión de cámara las reduce. Instanciarlas sí.',
    schema: [
        {
            name: 'enabled',
            type: 'boolean', default: true,
            title: 'Enabled',
            description: 'Instanciar el pase de sombras. Los proyectores de sombra van en un grupo aparte, con su propio buffer.'
        },
        {
            name: 'everyNFrames',
            type: 'number', default: 3, min: 1, precision: 0,
            title: 'Every N Frames',
            description: 'Cada cuántos frames se reconstruye el buffer de sombras (si nada se movió y la cámara no salió del margen). Las sombras toleran mucho más retraso que la imagen.'
        },
        {
            name: 'maxDistance',
            type: 'number', default: 0, min: 0,
            title: 'Max Distance',
            description: 'Radio alrededor de la cámara dentro del cual un objeto proyecta sombra. 0 = usar la distancia de sombra de la escena. Es el mando más rentable del pase de sombras.'
        }
    ]
});

GpuInstancer.attributes.add('lod', {
    type: 'json',
    title: 'Nivel de detalle',
    description: 'Un objeto autorizado como Casa_LOD0 / Casa_LOD1 se instancia en dos grupos y cada instancia elige nivel por su tamaño en pantalla. APAGADO por defecto: si lo prendés sin niveles definidos se usan los automáticos.',
    schema: [
        {
            name: 'enabled',
            type: 'boolean', default: false,
            title: 'Enabled',
            description: 'Prendé esto solo si tus mallas están autorizadas con sufijo _LOD0, _LOD1... o si usás el script gpuInstancerLod.'
        },
        {
            name: 'autoByName',
            type: 'boolean', default: true,
            title: 'Auto By Name',
            description: 'Sacar el índice de nivel del nombre de la entidad (sufijo _LOD0, _LOD1, ...).'
        },
        {
            name: 'multiplier',
            type: 'number', default: 1, min: 0.05, max: 20, precision: 2,
            title: 'Multiplier',
            description: 'Multiplica los umbrales de todos los niveles. Un solo mando para hacer preset "calidad" o preset "rendimiento".'
        },
        {
            name: 'shadowLod',
            type: 'number', default: -1, min: -1, max: 9, precision: 0,
            title: 'Shadow LOD',
            description: 'Nivel que se usa para proyectar sombras, sin importar la distancia. -1 = cada nivel proyecta la suya. Fijarlo en 1 baja mucho el triángulo del pase de sombras.'
        }
    ]
});

GpuInstancer.attributes.add('lodLevels', {
    type: 'json',
    array: true,
    title: 'Lod Levels',
    description: 'Umbrales globales por nivel. Si está vacío y el LOD está prendido, se usan los automáticos: 40 px para LOD0, 10 px para LOD1, 2.5 px para LOD2, y por debajo no se dibuja.',
    schema: [
        {
            name: 'index',
            type: 'number', default: 0, min: 0, max: 9, precision: 0,
            title: 'Index',
            description: 'A qué nivel corresponde (0 = el de más detalle).'
        },
        {
            name: 'minScreenSize',
            type: 'number', default: 0, min: 0, precision: 1,
            title: 'Min Screen Size',
            description: 'Radio proyectado en píxeles a partir del cual este nivel es el que se dibuja. El nivel se usa mientras el tamaño esté entre este valor y el del nivel anterior.'
        },
        {
            name: 'maxDistance',
            type: 'number', default: 0, min: 0,
            title: 'Max Distance',
            description: 'Alternativa por distancia, en metros. 0 = ignorar y usar solo el tamaño en pantalla. Si ponés los dos, mandan los dos (tiene que cumplir ambos).'
        }
    ]
});

GpuInstancer.attributes.add('occlusion', {
    type: 'json',
    title: 'Oclusión',
    description: '"Si un objeto tapa a los demás, que no se dibujen". Se eligen unos pocos ocluyentes grandes (script gpuInstancerOccluder), se arma una pirámide de 5 planos desde la cámara por cada uno, y se esconde toda caja que entre entera. Es lo mismo que hacen Godot y Panda3D.',
    schema: [
        {
            name: 'enabled',
            type: 'boolean', default: false,
            title: 'Enabled',
            description: 'Requiere al menos una entidad con el script gpuInstancerOccluder. Va último en la cadena a propósito: el beneficio medido es modesto y NO reduce el coste de sombras.'
        },
        {
            name: 'maxOccluders',
            type: 'number', default: 4, min: 1, max: 16, precision: 0,
            title: 'Max Occluders',
            description: 'Cuántos ocluyentes se usan por frame, los más grandes en pantalla primero. Con 3 o 4 bien puestos ya rinde; más solo cuesta CPU.'
        },
        {
            name: 'perInstance',
            type: 'boolean', default: false,
            title: 'Per Instance',
            description: 'Además de descartar celdas enteras, probar instancia por instancia. Cuesta bastante más CPU y casi siempre no compensa.'
        }
    ]
});

GpuInstancer.attributes.add('lightmaps', {
    type: 'json',
    title: 'Lightmaps',
    description: 'Instanciar TAMBIÉN los objetos con iluminación horneada. Se juntan sus lightmaps en un atlas y cada instancia recibe su rectángulo, que es como lo resuelve la industria. Si el engine no expone los chunks que hacen falta, se apaga solo y esos objetos se quedan sin instanciar (que es lo seguro).',
    schema: [
        {
            name: 'atlas',
            type: 'boolean', default: true,
            title: 'Atlas',
            description: 'Sin esto, un objeto con lightmap nunca se instancia en el pase de color: instanciarlo a secas haría que las N copias compartan la iluminación horneada de la primera, sin dar error.'
        },
        {
            name: 'maxSize',
            type: 'number', default: 2048, min: 256, max: 8192, precision: 0,
            title: 'Max Size',
            description: 'Lado máximo del atlas en píxeles. Si no entran todos los lightmaps a su tamaño original, se reducen proporcionalmente y se avisa por consola.'
        },
        {
            name: 'gutter',
            type: 'number', default: 2, min: 0, max: 8, precision: 0,
            title: 'Gutter',
            description: 'Margen en píxeles entre casillas, relleno con el borde repetido. Sin él, el filtrado bilineal chupa color de la casilla vecina en los bordes.'
        },
        {
            name: 'shadowsAlways',
            type: 'boolean', default: true,
            title: 'Shadows Always',
            description: 'Instanciar las sombras de los objetos horneados aunque su color no se pueda instanciar. El shader de sombra no lee lightmaps, así que ahí siempre es seguro.'
        }
    ]
});

GpuInstancer.attributes.add('debug', {
    type: 'json',
    title: 'Diagnóstico',
    description: 'Medir antes que optimizar. Sin un número, todo lo demás es una apuesta.',
    schema: [
        {
            name: 'hud',
            type: 'boolean', default: false,
            title: 'HUD',
            description: 'Panel en pantalla con draw calls ahorrados, instancias enviadas y descartadas por motivo, y el coste en CPU del propio instancer.'
        },
        {
            name: 'miniStats',
            type: 'boolean', default: false,
            title: 'Mini Stats',
            description: 'Instanciar pc.MiniStats si está compilado en el bundle del engine. Da fps, ms de frame y VRAM.'
        },
        {
            name: 'warnings',
            type: 'boolean', default: true,
            title: 'Warnings',
            description: 'Avisar por consola (una vez por motivo) de todo lo que se dejó fuera del instancing y por qué: lightmap, skin, batchGroupId, parámetros propios...'
        },
        {
            name: 'drawCells',
            type: 'boolean', default: false,
            title: 'Draw Cells',
            description: 'Dibujar las cajas de las celdas visibles con app.drawWireSphere/drawLines. Solo para depurar: cuesta.'
        }
    ]
});

/* ------------------------------------------------------------------------- */
/* Constantes y utilidades                                                    */
/* ------------------------------------------------------------------------- */

/* Máscaras de shaderDefs del engine. Se leen de pc.* cuando existen y si no se
   usan los valores del bundle 2.x (verificados a mano en 2.7.4). Agrupar por
   shaderDefs garantiza que todo lo que cae en un mismo draw comparte variante
   de shader: sombras recibidas, UV, vertex colors, tangentes, todo. */
GpuInstancer.DEF = {
    NOSHADOW: (typeof pc.SHADERDEF_NOSHADOW === 'number') ? pc.SHADERDEF_NOSHADOW : 1,
    SKIN: (typeof pc.SHADERDEF_SKIN === 'number') ? pc.SHADERDEF_SKIN : 2,
    INSTANCING: (typeof pc.SHADERDEF_INSTANCING === 'number') ? pc.SHADERDEF_INSTANCING : 32,
    LM: (typeof pc.SHADERDEF_LM === 'number') ? pc.SHADERDEF_LM : 64,
    DIRLM: (typeof pc.SHADERDEF_DIRLM === 'number') ? pc.SHADERDEF_DIRLM : 128,
    MORPH_POS: (typeof pc.SHADERDEF_MORPH_POSITION === 'number') ? pc.SHADERDEF_MORPH_POSITION : 1024,
    MORPH_NRM: (typeof pc.SHADERDEF_MORPH_NORMAL === 'number') ? pc.SHADERDEF_MORPH_NORMAL : 2048,
    LMAMBIENT: (typeof pc.SHADERDEF_LMAMBIENT === 'number') ? pc.SHADERDEF_LMAMBIENT : 4096,
    BATCH: (typeof pc.SHADERDEF_BATCH === 'number') ? pc.SHADERDEF_BATCH : 16384
};

/* Nombres de los parámetros de lightmap: si una mesh instance solo tiene estos
   parámetros propios, para el pase de SOMBRA da igual (el shader de sombra no
   los lee) y se la puede instanciar igual. */
GpuInstancer.LIGHTMAP_PARAMS = (pc.MeshInstance && pc.MeshInstance.lightmapParamNames) ?
    pc.MeshInstance.lightmapParamNames : ['texture_lightMap', 'texture_dirLightMap'];

/* Máscara de "este objeto se ilumina con lightmap". El engine la pone en cuanto
   se marca lightmapped, mucho antes de que exista la textura. */
GpuInstancer.MASK_LIGHTMAPPED = (typeof pc.MASK_AFFECT_LIGHTMAPPED === 'number') ? pc.MASK_AFFECT_LIGHTMAPPED : 2;

/* Umbrales automáticos de nivel de detalle, en píxeles de radio proyectado.
   Solo se usan si el LOD está prendido y no se definió ningún nivel a mano. */
GpuInstancer.AUTO_LOD = [40, 10, 2.5, 1];

/* ------------------------------------------------------------------------- */
/* Ciclo de vida                                                              */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype.initialize = function () {

    if (GpuInstancer.api && GpuInstancer.api !== this) {
        console.warn('[gpuInstancer] ya hay otro gpuInstancer activo en "' +
            GpuInstancer.api.entity.name + '". Este de "' + this.entity.name + '" se apaga.');
        this.enabled = false;
        return;
    }

    this._normalizeAttributes();

    this._device = this.app.graphicsDevice;
    this._active = false;
    this._frame = 0;

    this._payloads = new Map();      // clave -> payload
    this._captured = new Map();      // meshInstance -> { model, shadow }
    this._pending = [];              // payloads nuevos, a revisar por minPerBatch

    /* NUNCA se mueve. En el engine 2.x el chunk de instancing es
       "matrix_model * mat4(instance_line1..4)": la matriz de cada instancia se
       multiplica por la del nodo del MeshInstance. Si este nodo no fuese la
       identidad, TODO el grupo se iría volando. */
    this._root = new pc.GraphNode('gpu-instancer-root');

    this._cameras = [];              // pc.CameraComponent activas
    this._mainCamera = null;         // pc.Camera de referencia (sombras, HUD)
    this._ctx = new Map();           // pc.Camera -> contexto de culling del frame
    this._occluders = [];            // scripts gpuInstancerOccluder registrados
    this._shadowDistance = 0;

    this._warned = {};
    this._skipped = { lightmap: 0, skin: 0, morph: 0, batch: 0, params: 0, material: 0, transparent: 0, tag: 0, other: 0 };

    this.stats = {
        payloads: 0, views: 0, instances: 0,
        drawCallsSaved: 0, drawCalls: 0,
        sent: 0, culledDistance: 0, culledScreen: 0, culledFrustum: 0,
        culledLod: 0, culledOccluder: 0, cellsTested: 0, cellsCulled: 0,
        blockCopies: 0, uploads: 0, uploadedBytes: 0, cpuMs: 0
    };

    /* temporales: cero basura por frame */
    this._tmpSphere = new pc.BoundingSphere();
    this._tmpVec = new pc.Vec3();
    this._tmpVec2 = new pc.Vec3();
    this._tmpAabb = new pc.BoundingBox();

    if (this._isEditor() && !this.inEditor) return;

    this._patch();

    this.app.on('prerender', this._onPreRender, this);
    this.on('enable', this._onEnable, this);
    this.on('disable', this._onDisable, this);
    this.on('destroy', this._onDestroy, this);

    GpuInstancer.api = this;
    this.app.gpuInstancer = this;
};

GpuInstancer.prototype.postInitialize = function () {
    if (GpuInstancer.api !== this) return;

    this._measureShadowDistance();
    this._patchLightmapper();
    if (!this._active) this._activate();

    if (this.debug.miniStats) this._startMiniStats();
    if (this.debug.hud) this._startHud();

    this.app.fire('gpuInstancer:ready', this);
};

GpuInstancer.prototype._onEnable = function () {
    if (GpuInstancer.api !== this || this._active) return;
    this._activate();
};

/* Dos pasadas: primero lo normal, y después lo horneado, que necesita tener su
   atlas armado ANTES de salir de la capa (así nunca se ve un frame con la
   iluminación equivocada). */
GpuInstancer.prototype._activate = function () {
    this._active = true;
    this._captureExisting();
    this._captureLightmapped();
};

GpuInstancer.prototype._onDisable = function () {
    if (!this._active) return;
    this._active = false;
    this._releaseAll();
};

GpuInstancer.prototype._onDestroy = function () {
    this._onDisable();
    this.app.off('prerender', this._onPreRender, this);
    if (this._hud && this._hud.parentNode) this._hud.parentNode.removeChild(this._hud);
    if (GpuInstancer.api === this) {
        GpuInstancer.api = null;
        this.app.gpuInstancer = null;
        this._unpatch();
        this._unpatchChunks();
        if (this._lightmapperOriginalBake && this.app.lightmapper) {
            this.app.lightmapper.bake = this._lightmapperOriginalBake;
            this.app.lightmapper._gpuInstancerPatched = false;
        }
    }
};

/* Los atributos de tipo json son cómodos para agrupar el inspector, pero si el
   script se crea por código (script.create('gpuInstancer')) o si se agregó un
   campo nuevo a un schema ya guardado, llegan a medio llenar. Acá se completan
   con los mismos valores por defecto del schema, así nunca hay un undefined. */
GpuInstancer.prototype._normalizeAttributes = function () {
    function fill(obj, defaults) {
        for (var k in defaults) {
            if (obj[k] === undefined || obj[k] === null) obj[k] = defaults[k];
        }
        return obj;
    }

    if (!this.excludeLayers || !this.excludeLayers.length) {
        this.excludeLayers = ['Depth', 'Skybox', 'Immediate', 'UI', 'Sky', 'Occlusion'];
    }
    if (!this.lodLevels) this.lodLevels = [];

    this.capture = fill(this.capture || {}, {
        auto: true, transparent: false, minPerBatch: 2, shadowsOfNonInstanced: true,
        excludeTag: 'no-instancing', onlyTag: '', dynamicTag: 'instancing-dynamic'
    });

    this.cells = fill(this.cells || {}, { enabled: true, size: null, perInstance: true });
    if (!this.cells.size) this.cells.size = new pc.Vec3(40, 40, 40);

    this.culling = fill(this.culling || {}, {
        frustum: true, maxDistance: 0, minScreenSize: 0, useFogEnd: false, hysteresis: 0.08
    });

    this.shadows = fill(this.shadows || {}, { enabled: true, everyNFrames: 3, maxDistance: 0 });

    this.lod = fill(this.lod || {}, {
        enabled: false, autoByName: true, multiplier: 1, shadowLod: -1
    });

    this.occlusion = fill(this.occlusion || {}, {
        enabled: false, maxOccluders: 4, perInstance: false
    });

    this.lightmaps = fill(this.lightmaps || {}, {
        atlas: true, maxSize: 2048, gutter: 2, shadowsAlways: true
    });

    this.debug = fill(this.debug || {}, {
        hud: false, miniStats: false, warnings: true, drawCells: false
    });
};

GpuInstancer.prototype._isEditor = function () {
    return !!(window.editor && window.editor.call) ||
        !!(window.UranusEditor && window.UranusEditor.inEditor && window.UranusEditor.inEditor()) ||
        !!(this.app && this.app._inTools);
};

/* ------------------------------------------------------------------------- */
/* El parche: por acá pasa TODO lo que el engine registra en una capa         */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._patch = function () {
    if (GpuInstancer._patched) return;

    var P = pc.Layer.prototype;
    var orig = {
        addMeshInstances: P.addMeshInstances,
        removeMeshInstances: P.removeMeshInstances,
        addShadowCasters: P.addShadowCasters,
        removeShadowCasters: P.removeShadowCasters
    };
    GpuInstancer._orig = orig;
    GpuInstancer._patched = true;

    P.addMeshInstances = function (list, skipShadowCasters) {
        var api = GpuInstancer.api;
        if (api && api._active && list.length > 0 && api._isLayerValid(this)) {
            list = api._captureAdd(list, this, false, skipShadowCasters);
        }
        orig.addMeshInstances.call(this, list, skipShadowCasters);
    };

    P.addShadowCasters = function (list) {
        var api = GpuInstancer.api;
        if (api && api._active && list.length > 0 && api._isLayerValid(this)) {
            list = api._captureAdd(list, this, true, true);
        }
        orig.addShadowCasters.call(this, list);
    };

    P.removeMeshInstances = function (list, skipShadowCasters) {
        var api = GpuInstancer.api;
        if (api && api._captured.size > 0 && list.length > 0) {
            list = api._captureRemove(list, this, false, skipShadowCasters);
        }
        orig.removeMeshInstances.call(this, list, skipShadowCasters);
    };

    P.removeShadowCasters = function (list) {
        var api = GpuInstancer.api;
        if (api && api._captured.size > 0 && list.length > 0) {
            list = api._captureRemove(list, this, true, true);
        }
        orig.removeShadowCasters.call(this, list);
    };
};

GpuInstancer.prototype._unpatch = function () {
    if (!GpuInstancer._patched) return;
    var P = pc.Layer.prototype;
    var orig = GpuInstancer._orig;
    P.addMeshInstances = orig.addMeshInstances;
    P.removeMeshInstances = orig.removeMeshInstances;
    P.addShadowCasters = orig.addShadowCasters;
    P.removeShadowCasters = orig.removeShadowCasters;
    GpuInstancer._patched = false;
};

GpuInstancer.prototype._isLayerValid = function (layer) {
    if (!layer || !layer.name) return false;
    return this.excludeLayers.indexOf(layer.name) === -1;
};

/* Vuelve a pasar por el parche todo lo que YA estaba en las capas cuando este
   script arrancó: se saca con el método original (para no re-entrar) y se
   vuelve a meter con el parcheado. */
GpuInstancer.prototype._captureExisting = function () {
    var orig = GpuInstancer._orig;
    var list = this.app.scene.layers.layerList;

    for (var i = 0; i < list.length; i++) {
        var layer = list[i];
        if (!this._isLayerValid(layer)) continue;

        var mis = layer.meshInstances.slice();
        var casters = layer.shadowCasters.slice();
        if (mis.length === 0 && casters.length === 0) continue;

        orig.removeMeshInstances.call(layer, mis, true);
        orig.removeShadowCasters.call(layer, casters);

        layer.addMeshInstances(mis, true);
        layer.addShadowCasters(casters);
    }

    this._logSkipped();
};

/* Devuelve todo a su estado original: las instancias vuelven a las capas y los
   proxies se destruyen. */
GpuInstancer.prototype._releaseAll = function () {
    var self = this;
    var all = [];
    this._payloads.forEach(function (payload) { all.push(payload); });
    for (var i = 0; i < all.length; i++) self._releasePayload(all[i]);
    this._payloads.clear();
    this._captured.clear();
    this._ctx.clear();
};

GpuInstancer.prototype._releasePayload = function (payload) {
    var orig = GpuInstancer._orig;
    var i;

    payload.views.forEach(function (view) {
        if (payload.shadow) orig.removeShadowCasters.call(payload.layer, [view.proxy]);
        else orig.removeMeshInstances.call(payload.layer, [view.proxy], true);
        if (view.vb) view.vb.destroy();
        view.proxy.isVisibleFunc = null;
    });
    payload.views.clear();

    var back = [];
    for (i = 0; i < payload.instances.length; i++) {
        var inst = payload.instances[i];
        this._forgetInstance(inst);
        back.push(inst.mi);
    }
    if (back.length > 0) {
        if (payload.shadow) orig.addShadowCasters.call(payload.layer, back);
        else orig.addMeshInstances.call(payload.layer, back, true);
    }

    payload.instances.length = 0;
    payload.cells.clear();
    payload.loose.length = 0;
    payload.released = true;

    if (payload.atlas) { this._destroyAtlas(payload.atlas); payload.atlas = null; }
    if (payload.atlasMaterial) { payload.atlasMaterial.destroy(); payload.atlasMaterial = null; }

    this._payloads.delete(payload.key);
};

/* ------------------------------------------------------------------------- */
/* Decidir qué se puede instanciar                                            */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._entityOf = function (node) {
    var n = node;
    while (n && !(n instanceof pc.Entity)) n = n.parent;
    return n || null;
};

GpuInstancer.prototype._hasTag = function (entity, tag) {
    var n = entity;
    while (n) {
        if (n.tags && n.tags.has(tag)) return true;
        n = n.parent;
    }
    return false;
};

/* Parámetros propios de la mesh instance. En un draw instanciado hay UN solo
   juego de parámetros para las N copias, así que si la instancia tiene los
   suyos no se puede instanciar. Excepción: los de lightmap en el pase de
   sombra, que el shader de sombra no lee. */
GpuInstancer.prototype._hasOwnParameters = function (mi, forShadow) {
    var params = mi.parameters;
    if (!params) return false;
    var lm = GpuInstancer.LIGHTMAP_PARAMS;
    for (var k in params) {
        if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
        if (forShadow && lm.indexOf(k) !== -1) continue;
        return true;
    }
    return false;
};

GpuInstancer.prototype._warn = function (kind, msg) {
    this._skipped[kind] = (this._skipped[kind] || 0) + 1;
    if (!this.debug.warnings) return;
    if (this._warned[kind]) return;
    this._warned[kind] = true;
    console.warn('[gpuInstancer] ' + msg);
};

GpuInstancer.prototype._canCapture = function (mi, layer, forShadow, allowLightmap) {
    var D = GpuInstancer.DEF;

    if (mi._gpuInstancer) return false;                  // es un proxy nuestro
    if (!mi.mesh || !mi.material) return false;
    if (mi.instancingData) return false;                 // ya lo instancia otro sistema
    if (mi.visible === false) return false;

    /* payload de otro instancer (por ejemplo uranusInstancer): todavía no tiene
       instancingData en el momento en que entra a la capa, así que hay que
       reconocerlo por el nombre de su nodo o se lo instanciaría dos veces */
    if (mi.node && typeof mi.node.name === 'string' && mi.node.name.indexOf('instancer-payload') !== -1) return false;

    /* SOLO materiales que el engine sabe recompilar con el define INSTANCING.
       Un pc.ShaderMaterial (o cualquier material con shader propio) trae sus
       atributos FIJOS: si le cambiás el búfer de instancias por el formato por
       defecto, su vertex shader pide un slot que ese formato no tiene. En
       WebGL2 eso dibuja basura en silencio; en WebGPU la validación lo rechaza
       ("Vertex attribute slot 13 ... is not present in the VertexState") y el
       objeto no se dibuja.

       Ojo: NO alcanza con mirar instancingData, porque un script puede agregar
       su mesh instance a la capa primero y llamar a setInstancing después: en
       ese momento todavía parece un objeto común. Por eso la guarda es por
       tipo de material.

       Escape para quien sepa lo que hace: material._gpuInstancerAllow = true. */
    if (!(mi.material instanceof pc.StandardMaterial) && !mi.material._gpuInstancerAllow) {
        this._warn('material', 'hay objetos con material propio (pc.ShaderMaterial u otro shader a mano): NO se instancian, porque su shader tiene los atributos fijos y el búfer de instancias por defecto no se los da. Si tu shader declara instance_line1..4, poné material._gpuInstancerAllow = true.');
        return false;
    }

    var defs = mi._shaderDefs | 0;

    if (mi.skinInstance || (mi.mesh && mi.mesh.skin) || (defs & D.SKIN)) {
        this._warn('skin', 'hay mallas con skinning (personajes): el instancing por hardware no las soporta, se dejan como estaban.');
        return false;
    }
    if (mi.morphInstance || (defs & (D.MORPH_POS | D.MORPH_NRM))) {
        this._warn('morph', 'hay mallas con morph targets: quedan fuera del instancing.');
        return false;
    }
    if (defs & D.BATCH) return false;

    /* GUARDA DEL INFORME (punto 03). Instancing + lightmap horneado COMPILA y
       RENDERIZA sin un solo aviso, y las N copias visten la textura y el
       trazado UV1 de la primera. Es el peor fallo silencioso de la lista.
       En el pase de SOMBRA sí se puede: ese shader no lee lightmaps.

       Hay que mirar TRES señales, no una: los shaderDefs solo traen el bit LM
       cuando la textura YA está asignada, así que un objeto marcado para
       hornear (mask = MASK_AFFECT_LIGHTMAPPED) todavía no lo tiene y se
       colaría. Verificado en 2.7.4: render.lightmapped = true deja
       shaderDefs sin el bit 64 y mask en 2. */
    if (!forShadow && !allowLightmap && this._isLightmapped(mi)) {
        /* Por el camino normal no se capturan: o los toma la captura diferida
           del atlas (_captureLightmapped), que sí sabe darle a cada copia su
           rectángulo, o se quedan como estaban. */
        if (!this._atlasSupported()) {
            this._warn('lightmap', 'hay objetos con lightmap horneado y el atlas no está disponible: se los deja sin instanciar en el pase de color. Sus SOMBRAS sí se instancian.');
        }
        return false;
    }

    /* Un objeto horneado SIEMPRE tiene parámetros propios: su textura de
       lightmap. No cuentan ni en el pase de sombra (que no la lee) ni cuando
       vamos a reemplazarla por el atlas. */
    if (this._hasOwnParameters(mi, forShadow || allowLightmap)) {
        this._warn('params', 'hay mesh instances con parámetros de material propios: en un draw instanciado hay un solo juego de parámetros, así que quedan fuera.');
        return false;
    }

    if (!forShadow && !this.capture.transparent && mi.material.blendType !== pc.BLEND_NONE) {
        this._skipped.transparent++;
        return false;
    }

    if (forShadow) {
        if (!this.shadows.enabled) return false;
        if (!mi.castShadow) return false;
    }

    var entity = this._entityOf(mi.node);
    if (!entity) return false;

    var render = entity.render || entity.model;
    if (render && render.batchGroupId !== undefined && render.batchGroupId !== -1) {
        this._warn('batch', 'hay objetos con batchGroupId asignado: el batcher pelea con los lightmaps y con el culling por objeto, así que se los deja en paz. Si no usás grupos de batch, poné batchGroupId en -1.');
        return false;
    }

    var cap = this.capture;
    if (cap.excludeTag && this._hasTag(entity, cap.excludeTag)) { this._skipped.tag++; return false; }
    if (cap.onlyTag) {
        if (!this._hasTag(entity, cap.onlyTag)) { this._skipped.tag++; return false; }
    } else if (!cap.auto) {
        return false;
    }

    /* nivel de detalle: si se fijó un nivel para sombras, los demás niveles no
       proyectan sombra (baja mucho el triángulo del pase de sombras) */
    if (forShadow && this.lod.enabled && this.lod.shadowLod >= 0) {
        if (this._lodIndexOf(entity) !== this.lod.shadowLod) return false;
    }

    return true;
};

/* ------------------------------------------------------------------------- */
/* Alta y baja de instancias                                                  */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._captureAdd = function (list, layer, forShadow, skipShadow) {
    var rest = [];
    var keepAsCaster = null;

    for (var i = 0; i < list.length; i++) {
        var mi = list[i];
        var captured = false;

        if (this._canCapture(mi, layer, forShadow)) {
            captured = this._addInstance(mi, layer, forShadow);
        }
        if (!captured) { rest.push(mi); continue; }

        /* Si el objeto se instanció en color, su sombra ya no va a pasar por
           addShadowCasters (lo sacamos de la lista). O la instanciamos también,
           o la devolvemos a mano a la lista de proyectores para no perderla. */
        if (!forShadow && !skipShadow && mi.castShadow) {
            var shadowed = false;
            if (this._canCapture(mi, layer, true)) shadowed = this._addInstance(mi, layer, true);
            if (!shadowed) {
                this._entryOf(mi).keptCaster = true;
                (keepAsCaster || (keepAsCaster = [])).push(mi);
            }
        }
    }

    if (keepAsCaster) GpuInstancer._orig.addShadowCasters.call(layer, keepAsCaster);

    return rest;
};

GpuInstancer.prototype._captureRemove = function (list, layer, forShadow, skipShadow) {
    var rest = [];
    var casterCleanup = null;

    for (var i = 0; i < list.length; i++) {
        var mi = list[i];
        var entry = this._captured.get(mi);
        if (!entry) { rest.push(mi); continue; }

        var handled = false;
        var inst;

        if (forShadow) {
            inst = this._instFor(mi, layer, true);
            if (inst) { this._removeInstance(inst); handled = true; }
            if (entry.keptCaster) { entry.keptCaster = false; rest.push(mi); handled = true; }
        } else {
            inst = this._instFor(mi, layer, false);
            if (inst) { this._removeInstance(inst); handled = true; }
            if (!skipShadow) {
                var si = this._instFor(mi, layer, true);
                if (si) this._removeInstance(si);
                if (entry.keptCaster) {
                    entry.keptCaster = false;
                    (casterCleanup || (casterCleanup = [])).push(mi);
                }
            }
        }

        if (!handled) rest.push(mi);
        if (entry.model.length === 0 && entry.shadow.length === 0 && !entry.keptCaster) this._captured.delete(mi);
    }

    if (casterCleanup) GpuInstancer._orig.removeShadowCasters.call(layer, casterCleanup);

    return rest;
};

/* signo del determinante 3x3: con escala negativa hay que invertir las caras,
   y como es una propiedad del draw entero, va en la clave del grupo. */
GpuInstancer.prototype._scaleSign = function (m) {
    var d = m.data;
    var det = d[0] * (d[5] * d[10] - d[6] * d[9]) -
              d[1] * (d[4] * d[10] - d[6] * d[8]) +
              d[2] * (d[4] * d[9] - d[5] * d[8]);
    return det < 0 ? -1 : 1;
};

/* Esfera envolvente de una instancia, en mundo.

   NO se usa meshInstance.aabb (el aabb de MUNDO) para el radio: ese aabb es el
   de la caja ya rotada, así que su radio OSCILA con la rotación —hasta sqrt(3)
   veces para un cubo— y un objeto que gira entraría y saldría del culling solo
   por girar. El radio estable es el de la malla en LOCAL multiplicado por la
   mayor escala de mundo. */
GpuInstancer.prototype._boundingOf = function (mi, world) {
    var local = mi.mesh.aabb;
    var d = world.data;

    var sx = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    var sy = Math.sqrt(d[4] * d[4] + d[5] * d[5] + d[6] * d[6]);
    var sz = Math.sqrt(d[8] * d[8] + d[9] * d[9] + d[10] * d[10]);
    var scale = Math.max(sx, Math.max(sy, sz));

    var pos = new pc.Vec3();
    world.transformPoint(local.center, pos);

    return { pos: pos, radius: local.halfExtents.length() * scale };
};

/* Una mesh instance puede estar en VARIAS capas a la vez (un render component
   con dos capas la registra en las dos), así que lo capturado se guarda como
   una lista por tipo y se busca siempre por capa. */
GpuInstancer.prototype._entryOf = function (mi) {
    var e = this._captured.get(mi);
    if (!e) { e = { model: [], shadow: [], keptCaster: false }; this._captured.set(mi, e); }
    return e;
};

GpuInstancer.prototype._instFor = function (mi, layer, forShadow) {
    var e = this._captured.get(mi);
    if (!e) return null;
    var list = forShadow ? e.shadow : e.model;
    for (var i = 0; i < list.length; i++) {
        if (list[i].payload.layer === layer) return list[i];
    }
    return null;
};

GpuInstancer.prototype._forgetInstance = function (inst) {
    var e = this._captured.get(inst.mi);
    if (!e) return;
    var list = inst.payload.shadow ? e.shadow : e.model;
    var i = list.indexOf(inst);
    if (i >= 0) list.splice(i, 1);
    if (e.model.length === 0 && e.shadow.length === 0 && !e.keptCaster) this._captured.delete(inst.mi);
};

GpuInstancer.prototype._addInstance = function (mi, layer, forShadow) {
    if (this._instFor(mi, layer, forShadow)) return true;   // ya estaba: no duplicar

    var entity = this._entityOf(mi.node);
    var world = mi.node.getWorldTransform();
    var flip = this._scaleSign(world) < 0;

    var payload = this._getPayload(mi, layer, forShadow, flip, entity);
    if (!payload) return false;

    var dynamic = this.capture.dynamicTag ? this._hasTag(entity, this.capture.dynamicTag) : false;
    var sphere = this._boundingOf(mi, world);

    var inst = {
        mi: mi,
        node: mi.node,
        entity: entity,
        payload: payload,
        data: dynamic ? null : new Float32Array(world.data),
        pos: sphere.pos,
        radius: sphere.radius,
        dynamic: dynamic,
        cell: null,
        slot: -1,
        visible: true,
        lodScript: (entity && entity.script && entity.script.gpuInstancerLod) || null
    };

    payload.instances.push(inst);
    payload.count = payload.instances.length;
    payload.stamp++;
    payload.aabbValid = false;

    this._placeInstance(payload, inst);

    var entry = this._entryOf(mi);
    (forShadow ? entry.shadow : entry.model).push(inst);

    return true;
};

GpuInstancer.prototype._removeInstance = function (inst) {
    var payload = inst.payload;
    if (!payload || payload.released) return;

    this._forgetInstance(inst);

    var idx = payload.instances.indexOf(inst);
    if (idx >= 0) {
        payload.instances[idx] = payload.instances[payload.instances.length - 1];
        payload.instances.pop();
    }
    payload.count = payload.instances.length;
    payload.stamp++;
    payload.aabbValid = false;

    if (inst.cell) this._removeFromCell(payload, inst);
    else {
        var li = payload.loose.indexOf(inst);
        if (li >= 0) { payload.loose[li] = payload.loose[payload.loose.length - 1]; payload.loose.pop(); }
    }

    if (payload.instances.length === 0) this._releasePayload(payload);
};

/* ------------------------------------------------------------------------- */
/* Grupos (payloads) y sus vistas por cámara                                  */
/* ------------------------------------------------------------------------- */

/* Todo lo que tiene que coincidir para que dos objetos entren en el MISMO draw:
   capa, malla, material, variante de shader (shaderDefs completos), máscara de
   luces, sentido de las caras y estilo de render. Con la clave completa —y no
   con ids recortados a 16 bits— dos grupos distintos no pueden colisionar. */
GpuInstancer.prototype._payloadKey = function (mi, layer, forShadow, flip) {
    return (forShadow ? 'S|' : 'M|') + layer.id + '|' + mi.mesh.id + '|' + mi.material.id +
        '|' + (mi._shaderDefs | 0) + '|' + (mi.mask | 0) + '|' + (flip ? 1 : 0) + '|' + (mi.renderStyle | 0);
};

GpuInstancer.prototype._getPayload = function (mi, layer, forShadow, flip, entity) {
    var defs = mi._shaderDefs | 0;
    var mask = mi.mask | 0;
    var key = this._payloadKey(mi, layer, forShadow, flip);

    var payload = this._payloads.get(key);
    if (payload) return payload;

    payload = {
        key: key,
        mesh: mi.mesh,
        material: mi.material,
        layer: layer,
        shadow: forShadow,
        flip: flip,
        defs: defs,
        mask: mask,
        renderStyle: mi.renderStyle | 0,
        lodIndex: this._lodIndexOf(entity),
        instances: [],
        cells: new Map(),
        loose: [],
        views: new Map(),
        aabb: new pc.BoundingBox(),
        aabbValid: false,
        atlas: null,
        atlasMaterial: null,
        lightmapped: false,
        stamp: 0,
        lastStamp: -1,
        count: 0,
        bornFrame: this._frame,
        released: false,
        checked: false
    };

    this._payloads.set(key, payload);
    this._pending.push(payload);
    return payload;
};

GpuInstancer.prototype._syncViews = function (payload) {
    var self = this;

    if (payload.shadow) {
        if (!payload.views.has('shadow')) this._createView(payload, 'shadow', null, null);
        return;
    }

    var cams = this._cameras;
    var i;

    /* alta: una vista (proxy + buffer) por cámara que dibuje esta capa.
       En 2.x el engine culea TODAS las cámaras ANTES de dibujar, así que un
       buffer por grupo compartido entre cámaras lo pisaría la última en culear. */
    for (i = 0; i < cams.length; i++) {
        var cc = cams[i];
        if (!cc.enabled || !cc.entity.enabled) continue;
        if (cc.layers.indexOf(payload.layer.id) === -1) continue;
        if (!payload.views.has(cc.camera)) this._createView(payload, cc.camera, cc.camera, cc);
    }

    /* baja: cámaras que ya no existen */
    var dead = null;
    payload.views.forEach(function (view, key) {
        if (key === 'shadow') return;
        var alive = false;
        for (var j = 0; j < cams.length; j++) {
            if (cams[j].camera === key && cams[j].enabled && cams[j].entity.enabled &&
                cams[j].layers.indexOf(payload.layer.id) !== -1) { alive = true; break; }
        }
        if (!alive) (dead || (dead = [])).push(key);
    });
    if (dead) {
        for (i = 0; i < dead.length; i++) {
            var v = payload.views.get(dead[i]);
            GpuInstancer._orig.removeMeshInstances.call(payload.layer, [v.proxy], true);
            if (v.vb) v.vb.destroy();
            v.proxy.isVisibleFunc = null;
            payload.views.delete(dead[i]);
        }
    }
};

GpuInstancer.prototype._createView = function (payload, key, camera, cameraComponent) {
    var self = this;
    var D = GpuInstancer.DEF;

    var proxy = new pc.MeshInstance(payload.mesh, payload.atlasMaterial || payload.material, this._root);
    proxy._gpuInstancer = true;
    proxy.pick = false;
    /* El volteado de caras NO se controla con una propiedad "flipFaces" (eso no
       existe en el engine 2.x): Renderer.setupCullMode usa
       flipFacesFactor * node.worldScaleSign, y como el nodo del proxy es la
       identidad (worldScaleSign = 1), el factor tiene que llevarlo todo.
       Verificado en 2.7.4: setupCullMode -> t*n.flipFacesFactor*n.node.worldScaleSign */
    proxy.flipFacesFactor = payload.flip ? -1 : 1;
    proxy.castShadow = payload.shadow;
    proxy.receiveShadow = (payload.defs & D.NOSHADOW) === 0;
    proxy.mask = payload.mask;
    proxy.renderStyle = payload.renderStyle;
    proxy.cull = true;

    var view = {
        key: key,
        camera: camera,
        cameraComponent: cameraComponent,
        proxy: proxy,
        storage: null,
        vb: null,
        capacity: 0,
        count: 0,
        frame: -1,
        stamp: -1,
        lastBuildFrame: -1,
        camPos: new pc.Vec3(),
        camValid: false
    };

    if (payload.shadow) {
        /* El pase de sombras lo culea el engine una vez por LUZ y por cascada.
           Reconstruir el buffer en cada una sería carísimo y además se pisarían
           entre sí (comparten proxy). Acá el contenido se arma UNA vez por
           frame en prerender y esto solo responde "¿mi caja toca tu frustum?". */
        proxy.isVisibleFunc = function (cam) {
            if (view.count === 0) return false;
            if (!payload.aabbValid) return true;
            var s = self._tmpSphere;
            s.center = payload.aabb.center;
            s.radius = payload.aabb.halfExtents.length();
            return cam.frustum.containsSphere(s) > 0;
        };
    } else {
        proxy.isVisibleFunc = function (cam) {
            if (cam !== view.camera) return false;     // esta vista es de otra cámara
            return self._buildView(payload, view, cam) > 0;
        };
    }

    payload.views.set(key, view);

    if (payload.atlas) this._applyAtlasToView(payload, view);

    if (payload.shadow) GpuInstancer._orig.addShadowCasters.call(payload.layer, [proxy]);
    else GpuInstancer._orig.addMeshInstances.call(payload.layer, [proxy], true);

    return view;
};

/* Crece el buffer de una vista a potencia de dos. El VertexBuffer se crea con
   la capacidad COMPLETA (así el buffer de GPU queda de ese tamaño) y después
   cada frame se sube solo el trozo usado. */
GpuInstancer.prototype._ensureCapacity = function (view, need) {
    if (view.capacity >= need && view.vb) return;

    var cap = view.capacity > 0 ? view.capacity : 64;
    while (cap < need) cap *= 2;

    var storage = new Float32Array(cap * 16);
    if (view.storage) storage.set(view.storage);

    if (view.vb) view.vb.destroy();

    var format = pc.VertexFormat.getDefaultInstancingFormat(this._device);
    var vb = new pc.VertexBuffer(this._device, format, cap, {
        usage: pc.BUFFER_DYNAMIC,
        data: storage
    });

    view.storage = storage;
    view.vb = vb;
    view.capacity = cap;
    view.capacityBytes = vb.numBytes;

    /* cull = TRUE. Es el segundo argumento y su valor por defecto es false:
       sin esto el grupo entero se envía desde toda cámara y toda cascada de
       sombra, y puede salir más lento que no instanciar. */
    view.proxy.setInstancing(vb, true);
};

GpuInstancer.prototype._upload = function (view, n) {
    view.proxy.instancingCount = n;
    view.count = n;
    if (n === 0) return;

    var vb = view.vb;
    var bytes = n * 64;                    // 16 floats * 4 bytes

    vb.numBytes = bytes;                   // setData exige byteLength === numBytes
    vb.setData(view.storage.subarray(0, n * 16));
    vb.numBytes = view.capacityBytes;      // se restaura para el conteo de VRAM
    vb.storage = view.storage;

    this.stats.uploads++;
    this.stats.uploadedBytes += bytes;
};

/* ------------------------------------------------------------------------- */
/* Rejilla de celdas                                                          */
/* ------------------------------------------------------------------------- */

/* Tamaño de celda: el del gpuInstancerCell más cercano hacia arriba en la
   jerarquía, o el global. Un bosque quiere celdas grandes y un interior chicas,
   y las dos rejillas pueden convivir en el mismo grupo porque el tamaño entra
   en la clave de la celda. */
GpuInstancer.prototype._cellSizeFor = function (entity) {
    var n = entity;
    while (n) {
        var s = n.script && n.script.gpuInstancerCell;
        if (s && s.size && (s.size.x > 0 || s.size.y > 0 || s.size.z > 0)) return s.size;
        n = n.parent;
    }
    return this.cells.size;
};

GpuInstancer.prototype._placeInstance = function (payload, inst) {
    if (!this.cells.enabled || inst.dynamic) {
        payload.loose.push(inst);
        return;
    }

    var s = inst.cellSize || (inst.cellSize = this._cellSizeFor(inst.entity));
    var sx = Math.max(s.x, 0.001), sy = Math.max(s.y, 0.001), sz = Math.max(s.z, 0.001);
    var ix = Math.floor(inst.pos.x / sx);
    var iy = Math.floor(inst.pos.y / sy);
    var iz = Math.floor(inst.pos.z / sz);
    var key = ix + '_' + iy + '_' + iz + '@' + sx + '_' + sy + '_' + sz;

    var cell = payload.cells.get(key);
    if (!cell) {
        cell = {
            key: key,
            count: 0,
            capacity: 0,
            matrices: null,
            instances: [],
            aabb: new pc.BoundingBox(),
            aabbValid: false,
            center: new pc.Vec3(),
            radius: 0,
            minRadius: Infinity,
            maxRadius: 0
        };
        payload.cells.set(key, cell);
    }

    if (cell.count + 1 > cell.capacity) {
        var cap = cell.capacity > 0 ? cell.capacity * 2 : 16;
        var m = new Float32Array(cap * 16);
        if (cell.matrices) m.set(cell.matrices);
        cell.matrices = m;
        cell.capacity = cap;
    }

    var slot = cell.count++;
    cell.matrices.set(inst.data, slot * 16);
    cell.instances[slot] = inst;
    inst.cell = cell;
    inst.slot = slot;

    var box = this._tmpAabb;
    box.center.copy(inst.pos);
    box.halfExtents.set(inst.radius, inst.radius, inst.radius);
    if (!cell.aabbValid) { cell.aabb.copy(box); cell.aabbValid = true; }
    else cell.aabb.add(box);

    cell.center.copy(cell.aabb.center);
    cell.radius = cell.aabb.halfExtents.length();
    if (inst.radius < cell.minRadius) cell.minRadius = inst.radius;
    if (inst.radius > cell.maxRadius) cell.maxRadius = inst.radius;
};

GpuInstancer.prototype._removeFromCell = function (payload, inst) {
    var cell = inst.cell;
    var last = cell.count - 1;

    if (inst.slot !== last) {
        cell.matrices.copyWithin(inst.slot * 16, last * 16, last * 16 + 16);
        cell.instances[inst.slot] = cell.instances[last];
        cell.instances[inst.slot].slot = inst.slot;
    }
    cell.count = last;
    cell.instances.length = last;
    inst.cell = null;
    inst.slot = -1;

    if (cell.count === 0) payload.cells.delete(cell.key);
};

/* Vuelve a leer la transform de una entidad ya instanciada. Es lo que hay que
   llamar si movés algo estático a mano (o poné el tag de dinámico). */
GpuInstancer.prototype.refresh = function (entity) {
    var self = this;
    var mis = [];

    if (entity) {
        var comps = entity.findComponents ? entity.findComponents('render') : [];
        for (var i = 0; i < comps.length; i++) {
            var arr = comps[i].meshInstances || [];
            for (var j = 0; j < arr.length; j++) mis.push(arr[j]);
        }
        var models = entity.findComponents ? entity.findComponents('model') : [];
        for (i = 0; i < models.length; i++) {
            var arr2 = (models[i].model && models[i].model.meshInstances) || [];
            for (j = 0; j < arr2.length; j++) mis.push(arr2[j]);
        }
    } else {
        this._captured.forEach(function (entry, mi) { mis.push(mi); });
    }

    for (i = 0; i < mis.length; i++) {
        var entry = this._captured.get(mis[i]);
        if (!entry) continue;
        for (j = 0; j < entry.model.length; j++) this._refreshInstance(entry.model[j]);
        for (j = 0; j < entry.shadow.length; j++) this._refreshInstance(entry.shadow[j]);
    }
};

GpuInstancer.prototype._refreshInstance = function (inst) {
    var payload = inst.payload;
    var world = inst.node.getWorldTransform();
    var sphere = this._boundingOf(inst.mi, world);

    if (inst.data) inst.data.set(world.data);
    inst.pos.copy(sphere.pos);
    inst.radius = sphere.radius;

    payload.aabbValid = false;
    payload.stamp++;

    if (!inst.cell) return;

    /* si se fue de su celda, se reubica */
    var s = inst.cellSize || this.cells.size;
    var sx = Math.max(s.x, 0.001), sy = Math.max(s.y, 0.001), sz = Math.max(s.z, 0.001);
    var ix = Math.floor(inst.pos.x / sx);
    var iy = Math.floor(inst.pos.y / sy);
    var iz = Math.floor(inst.pos.z / sz);
    var key = ix + '_' + iy + '_' + iz + '@' + sx + '_' + sy + '_' + sz;

    if (key !== inst.cell.key) {
        this._removeFromCell(payload, inst);
        this._placeInstance(payload, inst);
    } else {
        inst.cell.matrices.set(inst.data, inst.slot * 16);
        var box = this._tmpAabb;
        box.center.copy(inst.pos);
        box.halfExtents.set(inst.radius, inst.radius, inst.radius);
        inst.cell.aabb.add(box);
        inst.cell.center.copy(inst.cell.aabb.center);
        inst.cell.radius = inst.cell.aabb.halfExtents.length();
    }
};

/* ------------------------------------------------------------------------- */
/* El frame                                                                   */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._onPreRender = function () {
    if (!this._active) return;

    var t0 = this._now();

    /* las cuentas del frame que termina quedan disponibles para el HUD y para
       report(), y las del nuevo arrancan en cero */
    this.lastFrame = this._snapshotStats();
    this._resetStats();

    this._frame++;

    this._updateCameras();
    this._settlePending();

    var list = this._payloadList();
    var i;

    for (i = 0; i < list.length; i++) {
        var payload = list[i];
        if (payload.released) continue;
        this._syncViews(payload);
        if (!payload.aabbValid) this._updatePayloadAabb(payload);
    }

    /* el pase de sombras se arma UNA vez por frame (no por luz ni por cascada) */
    for (i = 0; i < list.length; i++) {
        if (list[i].shadow && !list[i].released) this._buildShadow(list[i]);
    }

    if (this.debug.drawCells) this._debugDrawCells();
    if (this._hud) this._updateHud();

    this.stats.cpuMs += this._now() - t0;
};

GpuInstancer.prototype._now = function () {
    return (window.performance && window.performance.now) ? window.performance.now() : 0;
};

GpuInstancer.prototype._payloadList = function () {
    var out = [];
    this._payloads.forEach(function (p) { out.push(p); });
    return out;
};

GpuInstancer.prototype._resetStats = function () {
    var s = this.stats;
    s.drawCallsSaved = 0; s.drawCalls = 0;
    s.sent = 0; s.culledDistance = 0; s.culledScreen = 0; s.culledFrustum = 0;
    s.culledLod = 0; s.culledOccluder = 0; s.cellsTested = 0; s.cellsCulled = 0;
    s.blockCopies = 0; s.uploads = 0; s.uploadedBytes = 0; s.cpuMs = 0;
};

GpuInstancer.prototype._snapshotStats = function () {
    var s = this.stats, o = {};
    for (var k in s) o[k] = s[k];
    return o;
};

/* Cámaras activas de la composición. En 2.x el engine culea todas ANTES de
   dibujar, así que cada una necesita su propia vista (proxy + buffer). */
GpuInstancer.prototype._updateCameras = function () {
    var cams = this.app.scene.layers.cameras;
    this._cameras = cams;

    var main = null;
    for (var i = 0; i < cams.length; i++) {
        var cc = cams[i];
        if (!cc.enabled || !cc.entity.enabled) continue;
        if (!main || (!cc.renderTarget && main.renderTarget)) main = cc;
        else if (!cc.renderTarget && !main.renderTarget && cc.priority >= main.priority) main = cc;
    }
    this._mainCamera = main ? main.camera : null;
};

/* Un grupo con menos copias que capture.minPerBatch no ahorra nada: se le
   devuelven sus mesh instances a la capa tal como estaban. */
GpuInstancer.prototype._settlePending = function () {
    if (this._pending.length === 0) return;

    var min = Math.max(this.capture.minPerBatch | 0, 1);
    var keep = [];

    for (var i = 0; i < this._pending.length; i++) {
        var payload = this._pending[i];
        if (payload.released || payload.checked) continue;

        /* El grupo se juzga recién cuando dejó de crecer: si la escena carga
           por oleadas (streaming), el primer árbol llegaría solo y se lo
           devolvería a la capa justo antes de que lleguen los otros mil. */
        if (payload.stamp !== payload.lastStamp) {
            payload.lastStamp = payload.stamp;
            payload.bornFrame = this._frame;
            keep.push(payload);
            continue;
        }
        if (this._frame - payload.bornFrame < 2) { keep.push(payload); continue; }

        payload.checked = true;
        if (payload.instances.length < min) this._releasePayload(payload);
    }

    this._pending = keep;
};

GpuInstancer.prototype._updatePayloadAabb = function (payload) {
    var first = true;
    var box = this._tmpAabb;
    var i;

    payload.cells.forEach(function (cell) {
        if (cell.count === 0) return;
        if (first) { payload.aabb.copy(cell.aabb); first = false; }
        else payload.aabb.add(cell.aabb);
    });

    for (i = 0; i < payload.loose.length; i++) {
        var inst = payload.loose[i];
        box.center.copy(inst.pos);
        box.halfExtents.set(inst.radius, inst.radius, inst.radius);
        if (first) { payload.aabb.copy(box); first = false; }
        else payload.aabb.add(box);
    }

    payload.aabbValid = !first;

    /* el aabb del proxy manda en el ordenamiento y en el encuadre de las
       sombras; con el nodo en la identidad, el aabb "local" ya es el de mundo */
    if (payload.aabbValid) {
        payload.views.forEach(function (view) {
            view.proxy.setCustomAabb(payload.aabb);
        });
    }
};

/* ------------------------------------------------------------------------- */
/* Contexto de culling por cámara                                             */
/* ------------------------------------------------------------------------- */

/* Constante de proyección: cuántos píxeles de radio mide, a un metro de
   profundidad, una esfera de un metro de radio.  R_px = k * r / profundidad.

   k = H / (2 * tan(fovVertical/2)), y en ortográfica k = H / (2 * orthoHeight)
   sin distancia (orthoHeight es SEMI-altura, no altura: el factor 2 es el error
   clásico). Con horizontalFov el fov guardado es el HORIZONTAL y hay que pasarlo
   a vertical dividiendo la tangente por el aspecto, o sale 1.78x mal en 16:9. */
GpuInstancer.prototype._projConstant = function (camera, out) {
    var device = this._device;
    var rt = camera.renderTarget;
    var h = (rt ? rt.height : device.height) * (camera.rect ? camera.rect.w : 1);

    if (camera.projection === pc.PROJECTION_ORTHOGRAPHIC) {
        out.ortho = true;
        out.k = h / (2 * Math.max(camera.orthoHeight, 0.001));
        return out;
    }

    var fov = camera.fov * pc.math.DEG_TO_RAD;
    if (camera.horizontalFov) {
        var aspect = camera.aspectRatio || (device.width / Math.max(device.height, 1));
        fov = 2 * Math.atan(Math.tan(fov * 0.5) / Math.max(aspect, 0.001));
    }
    out.ortho = false;
    out.k = h / (2 * Math.tan(fov * 0.5));
    return out;
};

GpuInstancer.prototype._makeCtx = function (camera) {
    var ctx = this._ctx.get(camera);
    if (!ctx) {
        ctx = {
            frame: -1, pos: new pc.Vec3(), fwd: new pc.Vec3(), near: 0.1,
            k: 1, ortho: false,
            maxDist: 0, minPx: 0, hyst: 0, frustum: null,
            useFrustum: true, occluders: null, lodLevels: null
        };
        this._ctx.set(camera, ctx);
    }
    if (ctx.frame === this._frame) return ctx;
    ctx.frame = this._frame;

    var cull = this.culling;
    var node = camera._node;

    ctx.pos.copy(node.getPosition());
    node.getWorldTransform().getZ(ctx.fwd);
    ctx.fwd.mulScalar(-1);                      // la cámara mira hacia -Z local
    ctx.near = Math.max(camera.nearClip, 0.001);

    /* El frustum solo es válido DENTRO del render: el culler lo actualiza justo
       antes de pedir visibilidad, y por eso este contexto se arma dentro de
       isVisibleFunc y no en update() ni en precull, donde estaría un frame viejo. */
    ctx.frustum = camera.frustum;
    ctx.useFrustum = cull.frustum;
    ctx.hyst = cull.hysteresis;
    ctx.minPx = cull.minScreenSize;

    this._projConstant(camera, ctx);

    ctx.maxDist = cull.maxDistance > 0 ? cull.maxDistance : camera.farClip;

    if (cull.useFogEnd) {
        var scene = this.app.scene;
        var fog = scene.fog;
        var type = (fog && typeof fog === 'object') ? fog.type : fog;
        var end = (fog && typeof fog === 'object') ? fog.end : scene.fogEnd;
        if (type && type !== 'none' && end > 0) ctx.maxDist = Math.min(ctx.maxDist, end);
    }

    ctx.lodLevels = this.lod.enabled ? this._resolveLodLevels() : null;
    ctx.occluders = this.occlusion.enabled ? this._buildOccluders(ctx) : null;

    return ctx;
};

GpuInstancer.prototype._resolveLodLevels = function () {
    if (this._lodCache && this._lodCacheStamp === this.lod.multiplier) return this._lodCache;

    var levels = [];
    var i;

    if (this.lodLevels && this.lodLevels.length > 0) {
        for (i = 0; i < this.lodLevels.length; i++) {
            var l = this.lodLevels[i];
            levels[l.index | 0] = { minScreenSize: l.minScreenSize || 0, maxDistance: l.maxDistance || 0 };
        }
    } else {
        for (i = 0; i < GpuInstancer.AUTO_LOD.length; i++) {
            levels[i] = { minScreenSize: GpuInstancer.AUTO_LOD[i], maxDistance: 0 };
        }
    }

    this._lodCache = levels;
    this._lodCacheStamp = this.lod.multiplier;
    return levels;
};

GpuInstancer.prototype._lodIndexOf = function (entity) {
    if (!this.lod.enabled || !entity) return -1;

    var script = entity.script && entity.script.gpuInstancerLod;
    if (script && script.index >= 0) return script.index;

    if (!this.lod.autoByName) return -1;

    var n = entity.name || '';
    var i = n.lastIndexOf('_LOD');
    if (i === -1) return -1;
    var v = parseInt(n.substring(i + 4), 10);
    return isNaN(v) ? -1 : v;
};

/* ------------------------------------------------------------------------- */
/* Construcción del buffer de una vista                                       */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._buildView = function (payload, view, camera) {
    if (view.frame === this._frame && view.stamp === payload.stamp) return view.count;

    var t0 = this._now();
    view.frame = this._frame;
    view.stamp = payload.stamp;

    var count = payload.instances.length;
    if (count === 0) { this._upload(view, 0); return 0; }

    this._ensureCapacity(view, count);

    var ctx = this._makeCtx(camera);
    var storage = view.storage;
    var self = this;
    var n = 0;

    payload.cells.forEach(function (cell) {
        n = self._appendCell(payload, cell, storage, n, ctx);
    });

    for (var i = 0; i < payload.loose.length; i++) {
        n = this._appendInstance(payload.loose[i], storage, n, ctx, payload);
    }

    this._upload(view, n);

    this.stats.sent += n;
    if (n > 0) this.stats.drawCalls++;
    this.stats.drawCallsSaved += (n > 0) ? (n - 1) : 0;
    this.stats.cpuMs += this._now() - t0;

    return n;
};

GpuInstancer.prototype._appendCell = function (payload, cell, storage, n, ctx) {
    if (cell.count === 0) return n;

    this.stats.cellsTested++;

    var test = this._testCell(cell, ctx, payload);
    if (test === 0) {
        /* la celda se fue entera: las instancias que se ahorró se cuentan igual,
           por motivo, o el reporte diría que no se descartó nada */
        var s = this.stats;
        s.cellsCulled++;
        if (this._cellReason === 1) s.culledDistance += cell.count;
        else if (this._cellReason === 2) s.culledScreen += cell.count;
        else if (this._cellReason === 3) s.culledFrustum += cell.count;
        else s.culledOccluder += cell.count;
        return n;
    }

    if (test === 2) {
        /* la celda entra entera: una sola copia de bloque en vez de recorrer
           instancia por instancia */
        storage.set(cell.matrices.subarray(0, cell.count * 16), n * 16);
        this.stats.blockCopies++;
        for (var k = 0; k < cell.count; k++) cell.instances[k].visible = true;
        return n + cell.count;
    }

    for (var i = 0; i < cell.count; i++) {
        n = this._appendInstance(cell.instances[i], storage, n, ctx, payload);
    }
    return n;
};

/* 0 = descartada, 1 = hay que mirar instancia por instancia, 2 = entra entera */
GpuInstancer.prototype._testCell = function (cell, ctx, payload) {
    var dx = cell.center.x - ctx.pos.x;
    var dy = cell.center.y - ctx.pos.y;
    var dz = cell.center.z - ctx.pos.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);

    var near = d - cell.radius;
    var far = d + cell.radius;

    /* profundidad (proyección sobre el eje de vista), no distancia euclídea:
       para el tamaño en pantalla la buena es la profundidad. Usar la euclídea
       sobreestima y hace desaparecer cosas en los bordes de la pantalla. */
    var depth = dx * ctx.fwd.x + dy * ctx.fwd.y + dz * ctx.fwd.z;
    var depthNear = Math.max(depth - cell.radius, ctx.near);
    var depthFar = Math.max(depth + cell.radius, ctx.near);

    /* 1. distancia */
    if (near > ctx.maxDist) { this._cellReason = 1; return 0; }

    /* 2. tamaño en pantalla: si ni la instancia más grande de la celda llega al
       umbral desde el punto más cercano, no hay nada que dibujar */
    if (ctx.minPx > 0) {
        var cellPx = ctx.ortho ? cell.maxRadius * ctx.k : cell.maxRadius * ctx.k / depthNear;
        if (cellPx < ctx.minPx) { this._cellReason = 2; return 0; }
    }

    /* 3. frustum */
    var inside = true;
    if (ctx.useFrustum) {
        var s = this._tmpSphere;
        s.center = cell.center;
        s.radius = cell.radius;
        var r = ctx.frustum.containsSphere(s);   // 0 fuera, 1 cruza, 2 dentro
        if (r === 0) { this._cellReason = 3; return 0; }
        inside = (r === 2);
    }

    /* 4. oclusión, al final de la cadena */
    if (ctx.occluders && this._occluded(cell.center, cell.radius, ctx)) { this._cellReason = 4; return 0; }

    /* ¿se puede copiar de un saque? Solo si NINGUNA prueba por instancia puede
       dar distinto dentro de la celda. */
    if (!this.cells.perInstance) return 2;
    if (!inside) return 1;
    if (far > ctx.maxDist) return 1;
    if (ctx.minPx > 0) {
        var px = ctx.ortho ? cell.minRadius * ctx.k : cell.minRadius * ctx.k / depthFar;
        if (px < ctx.minPx) return 1;
    }
    if (ctx.lodLevels && payload.lodIndex >= 0) return 1;
    if (this.occlusion.perInstance && ctx.occluders) return 1;

    return 2;
};

GpuInstancer.prototype._appendInstance = function (inst, storage, n, ctx, payload) {
    var s = this.stats;
    var h = ctx.hyst;

    var dx = inst.pos.x - ctx.pos.x;
    var dy = inst.pos.y - ctx.pos.y;
    var dz = inst.pos.z - ctx.pos.z;
    var d2 = dx * dx + dy * dy + dz * dz;

    /* histéresis: lo que YA se veía aguanta un poco más antes de irse, así no
       parpadea en el borde exacto de un umbral */
    var slack = inst.visible ? (1 + h) : (1 - h);
    var maxD = ctx.maxDist * slack;
    if (d2 > maxD * maxD) { inst.visible = false; s.culledDistance++; return n; }

    var d = Math.sqrt(d2);
    var depth = ctx.ortho ? 1 : Math.max(dx * ctx.fwd.x + dy * ctx.fwd.y + dz * ctx.fwd.z, ctx.near);
    var px = ctx.ortho ? inst.radius * ctx.k : inst.radius * ctx.k / depth;

    if (ctx.minPx > 0) {
        var lim = ctx.minPx * (inst.visible ? (1 - h) : (1 + h));
        if (px < lim) { inst.visible = false; s.culledScreen++; return n; }
    }

    if (ctx.lodLevels && payload.lodIndex >= 0) {
        if (!this._lodVisible(inst, payload, px, d, ctx)) { inst.visible = false; s.culledLod++; return n; }
    }

    if (ctx.useFrustum) {
        var sph = this._tmpSphere;
        sph.center = inst.pos;
        sph.radius = inst.radius;
        if (ctx.frustum.containsSphere(sph) === 0) { inst.visible = false; s.culledFrustum++; return n; }
    }

    if (ctx.occluders && this.occlusion.perInstance) {
        if (this._occluded(inst.pos, inst.radius, ctx)) { inst.visible = false; s.culledOccluder++; return n; }
    }

    inst.visible = true;

    var o = n * 16;
    storage.set(inst.data || inst.node.getWorldTransform().data, o);

    /* una instancia dinámica lee su matriz del nodo en cada frame, así que hay
       que volver a meterle el rectángulo del atlas en los 4 huecos libres */
    if (!inst.data && inst.atlasRect) {
        storage[o + 3] = inst.atlasRect[0];
        storage[o + 7] = inst.atlasRect[1];
        storage[o + 11] = inst.atlasRect[2];
        storage[o + 15] = inst.atlasRect[3];
    }

    return n + 1;
};

/* Banda de nivel de detalle: este nivel dibuja mientras el tamaño en pantalla
   esté entre su umbral y el del nivel anterior. */
GpuInstancer.prototype._lodVisible = function (inst, payload, px, d, ctx) {
    var idx = payload.lodIndex;
    var levels = (inst.lodScript && inst.lodScript._levels) || ctx.lodLevels;
    var lvl = levels[idx];
    if (!lvl) return true;

    var mult = this.lod.multiplier * (inst.lodScript ? (inst.lodScript.multiplier || 1) : 1);
    var h = ctx.hyst;

    var minPx = lvl.minScreenSize * mult;
    if (px < minPx * (inst.visible ? (1 - h) : (1 + h))) return false;

    var prev = idx > 0 ? levels[idx - 1] : null;
    if (prev) {
        var maxPx = prev.minScreenSize * mult;
        if (px >= maxPx * (inst.visible ? (1 + h) : (1 - h))) return false;
    }

    if (lvl.maxDistance > 0 && d > lvl.maxDistance * mult) return false;

    return true;
};

/* ------------------------------------------------------------------------- */
/* Pase de sombras                                                            */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._buildShadow = function (payload) {
    var view = payload.views.get('shadow');
    if (!view) return;

    var camera = this._mainCamera;
    if (!camera) return;

    var maxDist = this.shadows.maxDistance > 0 ? this.shadows.maxDistance :
        (this._shadowDistance > 0 ? this._shadowDistance : camera.farClip);

    var camPos = camera._node.getPosition();
    var moved = !view.camValid || view.camPos.distance(camPos) > maxDist * 0.05;
    var aged = (this._frame - view.lastBuildFrame) >= Math.max(this.shadows.everyNFrames | 0, 1);
    var changed = view.stamp !== payload.stamp;

    if (!moved && !aged && !changed) return;

    var t0 = this._now();

    view.stamp = payload.stamp;
    view.lastBuildFrame = this._frame;
    view.camPos.copy(camPos);
    view.camValid = true;

    var count = payload.instances.length;
    if (count === 0) { this._upload(view, 0); return; }

    this._ensureCapacity(view, count);

    /* Contexto propio, construido A MANO y no con _makeCtx: esto corre en
       prerender, donde el frustum de la cámara todavía es el del frame anterior.
       Si se reutilizara el contexto cacheado, la cámara principal heredaría ese
       frustum viejo al culear después. Acá no hace falta frustum ninguno: la
       sombra la mira otra cámara. Tampoco oclusión (lo que la cámara no ve
       puede seguir proyectando sombra sobre lo que sí ve), ni tamaño en
       pantalla. Solo distancia: el radio de sombra. */
    var shadowCtx = this._shadowCtx || (this._shadowCtx = {
        frame: -1, pos: new pc.Vec3(), fwd: new pc.Vec3(), near: 0.1, k: 1, ortho: false,
        maxDist: 0, minPx: 0, hyst: 0, frustum: null, useFrustum: false,
        occluders: null, lodLevels: null
    });

    var node = camera._node;
    shadowCtx.pos.copy(camPos);
    node.getWorldTransform().getZ(shadowCtx.fwd);
    shadowCtx.fwd.mulScalar(-1);
    shadowCtx.near = Math.max(camera.nearClip, 0.001);
    this._projConstant(camera, shadowCtx);

    shadowCtx.hyst = this.culling.hysteresis;
    shadowCtx.maxDist = maxDist;
    shadowCtx.minPx = 0;
    shadowCtx.useFrustum = false;
    shadowCtx.occluders = null;
    shadowCtx.lodLevels = (this.lod.enabled && this.lod.shadowLod < 0) ? this._resolveLodLevels() : null;

    var storage = view.storage;
    var self = this;
    var n = 0;

    payload.cells.forEach(function (cell) {
        n = self._appendCell(payload, cell, storage, n, shadowCtx);
    });
    for (var i = 0; i < payload.loose.length; i++) {
        n = this._appendInstance(payload.loose[i], storage, n, shadowCtx, payload);
    }

    this._upload(view, n);

    this.stats.sent += n;
    if (n > 0) { this.stats.drawCalls++; this.stats.drawCallsSaved += n - 1; }
    this.stats.cpuMs += this._now() - t0;
};

GpuInstancer.prototype._measureShadowDistance = function () {
    var lights = this.app.root.findComponents('light');
    var max = 0;
    for (var i = 0; i < lights.length; i++) {
        var l = lights[i];
        if (!l.castShadows) continue;
        if (l.type === 'directional') max = Math.max(max, l.shadowDistance || 0);
        else max = Math.max(max, (l.range || 0) * 2);
    }
    this._shadowDistance = max;
};

/* ------------------------------------------------------------------------- */
/* Oclusión por ocluyentes grandes                                            */
/*                                                                            */
/* La técnica de Godot y Panda3D, y la frase del informe tal cual: se eligen   */
/* unos pocos rectángulos grandes, se arma desde el ojo una pirámide de 5      */
/* planos por cada uno (4 laterales + 1 trasero) y se esconde toda caja que    */
/* entre ENTERA. Dos advertencias que vienen con la técnica:                   */
/*  - los ocluyentes NO se pueden fusionar: un objeto tapado a medias por dos  */
/*    paredes distintas no se puede descartar. Es una limitación real, no un   */
/*    descuido.                                                                */
/*  - no reduce el coste de las sombras: la sombra la mira otra cámara.        */
/* ------------------------------------------------------------------------- */

GpuInstancer.occluders = [];

GpuInstancer.prototype._buildOccluders = function (ctx) {
    var list = GpuInstancer.occluders;
    if (list.length === 0) return null;

    var pool = this._occPool || (this._occPool = []);
    var out = this._occOut || (this._occOut = []);
    out.length = 0;

    for (var i = 0; i < list.length; i++) {
        var occ = list[i];
        if (!occ.enabled || !occ.entity.enabled) continue;

        var corners = occ.getQuad(ctx.pos);
        if (!corners) continue;

        var entry = pool[out.length];
        if (!entry) { entry = { planes: new Float64Array(20), score: 0 }; pool[out.length] = entry; }

        if (!this._buildPlanes(corners, ctx.pos, entry.planes)) continue;

        /* ángulo sólido aproximado: área / distancia^2. Los más grandes en
           pantalla primero, que son los que de verdad tapan algo. */
        var cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) * 0.25;
        var cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) * 0.25;
        var cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) * 0.25;
        var dx = cx - ctx.pos.x, dy = cy - ctx.pos.y, dz = cz - ctx.pos.z;
        var d2 = Math.max(dx * dx + dy * dy + dz * dz, 0.001);

        var e1x = corners[1].x - corners[0].x, e1y = corners[1].y - corners[0].y, e1z = corners[1].z - corners[0].z;
        var e2x = corners[3].x - corners[0].x, e2y = corners[3].y - corners[0].y, e2z = corners[3].z - corners[0].z;
        var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        var area = Math.sqrt(nx * nx + ny * ny + nz * nz);

        entry.score = area / d2;
        out.push(entry);
    }

    if (out.length === 0) return null;

    out.sort(function (a, b) { return b.score - a.score; });
    var max = Math.max(this.occlusion.maxOccluders | 0, 1);
    if (out.length > max) out.length = max;

    return out;
};

/* 4 planos laterales desde el ojo por cada arista + 1 plano trasero (el del
   propio rectángulo, mirando hacia el lado contrario al ojo). Todos orientados
   hacia ADENTRO del volumen tapado, así "estar tapado" es simplemente estar
   del lado positivo de los cinco. */
GpuInstancer.prototype._buildPlanes = function (c, eye, out) {
    var i, o;
    var ccx = (c[0].x + c[1].x + c[2].x + c[3].x) * 0.25;
    var ccy = (c[0].y + c[1].y + c[2].y + c[3].y) * 0.25;
    var ccz = (c[0].z + c[1].z + c[2].z + c[3].z) * 0.25;

    for (i = 0; i < 4; i++) {
        var a = c[i], b = c[(i + 1) & 3];
        var ax = a.x - eye.x, ay = a.y - eye.y, az = a.z - eye.z;
        var bx = b.x - eye.x, by = b.y - eye.y, bz = b.z - eye.z;

        var nx = ay * bz - az * by;
        var ny = az * bx - ax * bz;
        var nz = ax * by - ay * bx;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-9) return false;
        nx /= len; ny /= len; nz /= len;

        var d = -(nx * eye.x + ny * eye.y + nz * eye.z);
        if (nx * ccx + ny * ccy + nz * ccz + d < 0) { nx = -nx; ny = -ny; nz = -nz; d = -d; }

        o = i * 4;
        out[o] = nx; out[o + 1] = ny; out[o + 2] = nz; out[o + 3] = d;
    }

    /* plano del rectángulo */
    var e1x = c[1].x - c[0].x, e1y = c[1].y - c[0].y, e1z = c[1].z - c[0].z;
    var e2x = c[3].x - c[0].x, e2y = c[3].y - c[0].y, e2z = c[3].z - c[0].z;
    var qx = e1y * e2z - e1z * e2y, qy = e1z * e2x - e1x * e2z, qz = e1x * e2y - e1y * e2x;
    var ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
    if (ql < 1e-9) return false;
    qx /= ql; qy /= ql; qz /= ql;

    var qd = -(qx * c[0].x + qy * c[0].y + qz * c[0].z);
    var side = qx * eye.x + qy * eye.y + qz * eye.z + qd;
    if (Math.abs(side) < 0.05) return false;            // ojo casi en el plano: no sirve
    if (side > 0) { qx = -qx; qy = -qy; qz = -qz; qd = -qd; }

    out[16] = qx; out[17] = qy; out[18] = qz; out[19] = qd;
    return true;
};

GpuInstancer.prototype._occluded = function (center, radius, ctx) {
    var occs = ctx.occluders;
    var cx = center.x, cy = center.y, cz = center.z;

    for (var i = 0; i < occs.length; i++) {
        var p = occs[i].planes;
        var inside = true;
        for (var j = 0; j < 5; j++) {
            var o = j * 4;
            if (p[o] * cx + p[o + 1] * cy + p[o + 2] * cz + p[o + 3] < radius) { inside = false; break; }
        }
        if (inside) return true;
    }
    return false;
};

/* ------------------------------------------------------------------------- */
/* Lightmaps horneados + instancing: el atlas                                 */
/*                                                                            */
/* El problema (punto 03 del informe): con instancing por hardware el engine   */
/* ve UNA sola mesh instance, con UNA textura de lightmap y UN juego de UV1.   */
/* Instanciar N copias horneadas a secas hace que todas vistan la iluminación  */
/* de la primera, y no da ningún error.                                        */
/*                                                                            */
/* La salida es la de la industria: juntar los N lightmaps en UN atlas y darle */
/* a cada instancia SU rectángulo. Faltaba resolver tres cosas:                */
/*                                                                            */
/* 1. POR DÓNDE VIAJA EL RECTÁNGULO. Sin atributo nuevo: una matriz de         */
/*    instancia son 16 floats y solo 12 llevan información (la última columna  */
/*    de una transformación rígida es 0,0,0,1). Ahí van u, v, escalaU, escalaV.*/
/*    Viaja pegado a la matriz, así que sobrevive al reordenamiento que hace   */
/*    el culling cada frame, y no cuesta un byte más de subida.                */
/*                                                                            */
/* 2. EL REGISTRO DE ATRIBUTOS. Para leer esos 4 floats hay que cambiar el     */
/*    chunk que arma la matriz. Y ahí está la trampa: el engine registra los   */
/*    atributos instance_line1..4 SOLO si ese chunk es idéntico al suyo        */
/*    (lit-shader: `options.useInstancing && chunks.transformInstancingVS ===  */
/*    shaderChunks.transformInstancingVS`). Si lo sobrescribís por material,   */
/*    los cuatro atributos dejan de registrarse y el instancing entero se      */
/*    rompe sin decir nada: eso es lo que hay que "registrar a mano".          */
/*    Acá se esquiva mutando el chunk GLOBAL, así los dos lados de la          */
/*    comparación siguen siendo el mismo string y el engine los registra él.   */
/*    El chunk nuevo es equivalente al suyo para cualquier matriz rígida:      */
/*    arma la matriz con las xyz y fuerza la última fila a (0,0,0,1).          */
/*                                                                            */
/* 3. LA UV DEL LIGHTMAP. El chunk lightmapPS muestrea con                     */
/*    {STD_LIGHT_TEXTURE_UV} (que se resuelve a la UV1). Se sobrescribe SOLO   */
/*    en el material clonado del grupo, envolviendo esa UV con el rectángulo.  */
/*    No se puede hacer con el sistema de uv-transform del engine porque       */
/*    lightMapTransform se fuerza a 0 cuando hay lightmap horneado.            */
/*                                                                            */
/* Si algo de esto no calza con la versión del engine, el atlas NO se activa y */
/* los objetos horneados se quedan sin instanciar, que es el comportamiento    */
/* seguro. Nunca se dibuja una iluminación equivocada.                          */
/* ------------------------------------------------------------------------- */

GpuInstancer.ATLAS_VARYING = 'vGpuInstAtlas';

GpuInstancer.prototype._isLightmapped = function (mi) {
    var D = GpuInstancer.DEF;
    var defs = mi._shaderDefs | 0;
    return (defs & (D.LM | D.DIRLM | D.LMAMBIENT)) !== 0 ||
        !!(mi.material && mi.material.lightMap) ||
        (mi.mask & GpuInstancer.MASK_LIGHTMAPPED) !== 0;
};

GpuInstancer.prototype._lightmapOf = function (mi, index) {
    var p = mi.getParameter(GpuInstancer.LIGHTMAP_PARAMS[index]);
    return (p && p.data && p.data.width) ? p.data : null;
};

/* ¿Este engine deja hacer el truco? Se comprueba el chunk de instancing y el
   del lightmap ANTES de tocar nada. */
GpuInstancer.prototype._atlasSupported = function () {
    if (this._atlasOk !== undefined) return this._atlasOk;
    this._atlasOk = false;

    var why = null;
    var chunks = pc.shaderChunks;

    if (!this.lightmaps.atlas) why = 'está apagado en los atributos';
    else if (this._device.isWebGPU) why = 'WebGPU usa chunks WGSL, no los GLSL que necesita este truco';
    else if (!chunks) why = 'este engine no expone pc.shaderChunks';
    else if (typeof chunks.transformInstancingVS !== 'string') why = 'no existe el chunk transformInstancingVS';
    else if (typeof chunks.lightmapPS !== 'string') why = 'no existe el chunk lightmapPS';
    else if (chunks.transformInstancingVS.indexOf('instance_line4') === -1 ||
             chunks.transformInstancingVS.indexOf('getModelMatrix') === -1 ||
             chunks.transformInstancingVS.indexOf('matrix_model') === -1) {
        why = 'el chunk transformInstancingVS no tiene la forma esperada';
    } else if (chunks.lightmapPS.indexOf('{STD_LIGHT_TEXTURE_UV}') === -1) {
        why = 'el chunk lightmapPS no usa {STD_LIGHT_TEXTURE_UV}';
    }

    if (why) {
        if (this.lightmaps.atlas && this.debug.warnings) {
            console.warn('[gpuInstancer] atlas de lightmaps desactivado: ' + why +
                '. Los objetos horneados no se instancian en el pase de color (sus sombras sí).');
        }
        return false;
    }

    this._atlasOk = this._patchChunks();
    return this._atlasOk;
};

GpuInstancer.prototype._patchChunks = function () {
    if (GpuInstancer._chunksPatched) return true;

    var chunks = pc.shaderChunks;
    var V = GpuInstancer.ATLAS_VARYING;
    var original = chunks.transformInstancingVS;

    var src =
        '\nattribute vec4 instance_line1;\n' +
        'attribute vec4 instance_line2;\n' +
        'attribute vec4 instance_line3;\n' +
        'attribute vec4 instance_line4;\n' +
        'varying vec4 ' + V + ';\n' +
        'mat4 getModelMatrix() {\n' +
        /* los 4 floats libres de una matriz rígida: el rectángulo del atlas */
        '    ' + V + ' = vec4(instance_line1.w, instance_line2.w, instance_line3.w, instance_line4.w);\n' +
        '    return matrix_model * mat4(\n' +
        '        vec4(instance_line1.xyz, 0.0),\n' +
        '        vec4(instance_line2.xyz, 0.0),\n' +
        '        vec4(instance_line3.xyz, 0.0),\n' +
        '        vec4(instance_line4.xyz, 1.0));\n' +
        '}\n';

    try {
        chunks.transformInstancingVS = src;
        if (chunks.transformInstancingVS !== src) return false;   // objeto congelado
    } catch (e) {
        return false;
    }

    GpuInstancer._chunksPatched = true;
    GpuInstancer._chunkOriginal = original;
    this._recompileInstanced();

    return true;
};

/* Un material que YA compiló su variante instanciada la tiene cacheada con el
   chunk viejo. Solo esos necesitan recompilar. */
GpuInstancer.prototype._recompileInstanced = function () {
    var layers = this.app.scene.layers.layerList;
    var seen = new Set();

    for (var i = 0; i < layers.length; i++) {
        var mis = layers[i].meshInstances;
        for (var j = 0; j < mis.length; j++) {
            var mi = mis[j];
            if (!mi.instancingData || !mi.material || seen.has(mi.material)) continue;
            seen.add(mi.material);
            mi.material.clearVariants();
        }
    }
};

GpuInstancer.prototype._unpatchChunks = function () {
    if (!GpuInstancer._chunksPatched) return;
    pc.shaderChunks.transformInstancingVS = GpuInstancer._chunkOriginal;
    GpuInstancer._chunksPatched = false;
    this._recompileInstanced();
};

/* Material del grupo: clon con el chunk del lightmap envuelto por el atlas. */
GpuInstancer.prototype._atlasMaterial = function (material) {
    var V = GpuInstancer.ATLAS_VARYING;
    var base = pc.shaderChunks.lightmapPS;

    var src = 'varying vec4 ' + V + ';\n' +
        'vec2 gpuInstAtlasUv(vec2 uv) { return uv * ' + V + '.zw + ' + V + '.xy; }\n' +
        base.split('{STD_LIGHT_TEXTURE_UV}').join('gpuInstAtlasUv({STD_LIGHT_TEXTURE_UV})');

    var clone = material.clone();
    clone.name = (material.name || 'material') + '_gpuInstancerAtlas';
    clone.chunks.lightmapPS = src;
    clone.chunks.APIVersion = GpuInstancer._chunkApi();
    clone.update();
    return clone;
};

GpuInstancer._chunkApi = function () {
    var best = null;
    for (var k in pc) {
        if (k.indexOf('CHUNKAPI_') !== 0) continue;
        var v = pc[k];
        if (typeof v !== 'string') continue;
        if (!best || GpuInstancer._apiNewer(v, best)) best = v;
    }
    return best;
};

GpuInstancer._apiNewer = function (a, b) {
    var pa = a.split('.'), pb = b.split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
        var x = parseInt(pa[i] || '0', 10), y = parseInt(pb[i] || '0', 10);
        if (x !== y) return x > y;
    }
    return false;
};

/* ------------------------------------------------------------------------- */
/* Captura diferida de lo horneado                                            */
/*                                                                            */
/* Los objetos con lightmap NO pasan por la captura normal: se los deja en su  */
/* capa hasta que existe su atlas. Así nunca hay un frame con la iluminación   */
/* equivocada, y si el atlas no se puede armar simplemente no cambia nada.     */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._captureLightmapped = function () {
    if (!this._atlasSupported()) return;

    var orig = GpuInstancer._orig;
    var layers = this.app.scene.layers.layerList;
    var groups = new Map();
    var i, j;

    for (i = 0; i < layers.length; i++) {
        var layer = layers[i];
        if (!this._isLayerValid(layer)) continue;

        var mis = layer.meshInstances;
        for (j = 0; j < mis.length; j++) {
            var mi = mis[j];
            if (mi._gpuInstancer) continue;
            if (!this._isLightmapped(mi)) continue;
            if (!this._lightmapOf(mi, 0)) continue;              // todavía sin hornear
            if (!this._canCapture(mi, layer, false, true)) continue;

            var flip = this._scaleSign(mi.node.getWorldTransform()) < 0;
            var key = this._payloadKey(mi, layer, false, flip);

            var g = groups.get(key);
            if (!g) { g = { key: key, layer: layer, mis: [] }; groups.set(key, g); }
            g.mis.push(mi);
        }
    }

    var min = Math.max(this.capture.minPerBatch | 0, 1);
    var self = this;

    groups.forEach(function (g) {
        if (g.mis.length < min) return;

        var atlas = self._buildAtlas(g);
        if (!atlas) return;

        /* recién ahora se las saca de la capa (sin tocar sus sombras, que ya
           están instanciadas por el camino normal) */
        orig.removeMeshInstances.call(g.layer, g.mis, true);

        var payload = null;
        for (var k = 0; k < g.mis.length; k++) {
            if (!self._addInstance(g.mis[k], g.layer, false)) continue;
            var inst = self._instFor(g.mis[k], g.layer, false);
            if (!inst) continue;
            payload = inst.payload;
            self._applyAtlasRect(inst, atlas.rects.get(g.mis[k]));
        }

        if (!payload) { self._destroyAtlas(atlas); return; }

        payload.atlas = atlas;
        payload.lightmapped = true;
        payload.atlasMaterial = self._atlasMaterial(payload.material);

        if (self.debug.warnings) {
            console.log('[gpuInstancer] atlas de lightmaps: ' + g.mis.length + ' objetos horneados de "' +
                (payload.material.name || 'material') + '" en ' + atlas.width + 'x' + atlas.height +
                (atlas.scale < 1 ? (' (reducidos al ' + Math.round(atlas.scale * 100) + '% para que entren)') : '') +
                ' -> 1 draw call');
        }
    });
};

GpuInstancer.prototype._applyAtlasRect = function (inst, rect) {
    if (!rect) return;
    inst.atlasRect = rect;
    if (inst.data) {
        inst.data[3] = rect[0];
        inst.data[7] = rect[1];
        inst.data[11] = rect[2];
        inst.data[15] = rect[3];
        if (inst.cell) inst.cell.matrices.set(inst.data, inst.slot * 16);
    }
};

/* ------------------------------------------------------------------------- */
/* Armado del atlas                                                           */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._buildAtlas = function (group) {
    var device = this._device;
    var gutter = Math.max(this.lightmaps.gutter | 0, 0);
    var maxSize = Math.max(this.lightmaps.maxSize | 0, 256);
    var i;

    /* una casilla por textura distinta (dos instancias pueden compartirla) */
    var tiles = [];
    var byTexture = new Map();
    var hasDir = false;
    var type = null, format = null;

    for (i = 0; i < group.mis.length; i++) {
        var tex = this._lightmapOf(group.mis[i], 0);
        if (!tex) return null;
        if (!byTexture.has(tex)) {
            var dir = this._lightmapOf(group.mis[i], 1);
            if (dir) hasDir = true;
            if (type === null) { type = tex.type; format = tex.format; }
            var tile = { tex: tex, dir: dir, w: tex.width, h: tex.height, x: 0, y: 0 };
            byTexture.set(tex, tile);
            tiles.push(tile);
        }
    }
    if (tiles.length === 0) return null;

    /* ¿entra a tamaño original? Si no, se reduce todo por igual. */
    var scale = 1;
    var packed = this._packTiles(tiles, gutter, maxSize, 1);
    if (!packed) {
        var area = 0;
        for (i = 0; i < tiles.length; i++) area += (tiles[i].w + 2 * gutter) * (tiles[i].h + 2 * gutter);
        scale = Math.sqrt((maxSize * maxSize * 0.85) / area);
        for (var s = scale; s > 0.05; s *= 0.8) {
            packed = this._packTiles(tiles, gutter, maxSize, s);
            if (packed) { scale = s; break; }
        }
        if (!packed) {
            this._warn('lightmap', 'los lightmaps de un grupo no entran en un atlas de ' + maxSize +
                ' px ni reduciéndolos: ese grupo se queda sin instanciar.');
            return null;
        }
    }

    var atlas = {
        width: packed.width, height: packed.height, scale: scale,
        texture: null, dirTexture: null, rects: new Map()
    };

    atlas.texture = this._blitAtlas(tiles, packed, gutter, type, format, false);
    if (hasDir) atlas.dirTexture = this._blitAtlas(tiles, packed, gutter, null, format, true);

    if (!atlas.texture) return null;

    /* rectángulo normalizado de cada instancia */
    for (i = 0; i < group.mis.length; i++) {
        var t = byTexture.get(this._lightmapOf(group.mis[i], 0));
        atlas.rects.set(group.mis[i], [
            (t.x + gutter) / packed.width,
            (t.y + gutter) / packed.height,
            t.tw / packed.width,
            t.th / packed.height
        ]);
    }

    return atlas;
};

/* Empaquetado por estantes: las casillas ordenadas por alto, de izquierda a
   derecha, saltando de fila cuando no entran. Sencillo y suficiente: casi
   siempre todas las casillas son del mismo tamaño. */
GpuInstancer.prototype._packTiles = function (tiles, gutter, maxSize, scale) {
    var order = tiles.slice().sort(function (a, b) { return b.h - a.h; });
    var i;

    for (i = 0; i < tiles.length; i++) {
        tiles[i].tw = Math.max(Math.floor(tiles[i].w * scale), 1);
        tiles[i].th = Math.max(Math.floor(tiles[i].h * scale), 1);
    }

    for (var width = 128; width <= maxSize; width *= 2) {
        var x = 0, y = 0, rowH = 0, ok = true;

        for (i = 0; i < order.length; i++) {
            var t = order[i];
            var w = t.tw + 2 * gutter, h = t.th + 2 * gutter;
            if (w > width) { ok = false; break; }
            if (x + w > width) { x = 0; y += rowH; rowH = 0; }
            t.x = x; t.y = y;
            x += w;
            if (h > rowH) rowH = h;
            if (y + rowH > maxSize) { ok = false; break; }
        }

        if (!ok) continue;

        var height = 1;
        while (height < y + rowH) height *= 2;
        if (height > maxSize) continue;
        return { width: width, height: height };
    }
    return null;
};

GpuInstancer.prototype._blitAtlas = function (tiles, packed, gutter, type, format, useDir) {
    var device = this._device;
    var options = {
        name: 'gpuInstancerAtlas' + (useDir ? 'Dir' : ''),
        width: packed.width,
        height: packed.height,
        format: format || pc.PIXELFORMAT_RGBA8,
        mipmaps: false,
        minFilter: pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE
    };
    if (type !== null && type !== undefined) options.type = type;

    var texture = new pc.Texture(device, options);
    var target = new pc.RenderTarget({ name: options.name, colorBuffer: texture, depth: false });
    var shader = this._blitShader();
    var scope = device.scope.resolve('source');
    var rect = new pc.Vec4();

    for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        var src = useDir ? t.dir : t.tex;
        if (!src) continue;

        var prevU = src.addressU, prevV = src.addressV;
        src.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
        src.addressV = pc.ADDRESS_CLAMP_TO_EDGE;

        /* se dibuja SOBRE el margen: el borde se repite y el filtrado bilineal
           de la casilla vecina nunca chupa color de otra */
        rect.set(t.x, t.y, t.tw + 2 * gutter, t.th + 2 * gutter);
        scope.setValue(src);
        pc.drawQuadWithShader(device, target, shader, rect);

        src.addressU = prevU;
        src.addressV = prevV;
    }

    target.destroy();
    return texture;
};

GpuInstancer.prototype._blitShader = function () {
    if (GpuInstancer._blit) return GpuInstancer._blit;

    var vs = pc.shaderChunks.fullscreenQuadVS;
    var fs = '\nvarying vec2 vUv0;\nuniform sampler2D source;\n' +
        'void main(void) { gl_FragColor = texture2D(source, vUv0); }\n';

    GpuInstancer._blit = pc.createShaderFromCode(this._device, vs, fs, 'gpuInstancerBlit');
    return GpuInstancer._blit;
};

GpuInstancer.prototype._destroyAtlas = function (atlas) {
    if (!atlas) return;
    if (atlas.texture) atlas.texture.destroy();
    if (atlas.dirTexture) atlas.dirTexture.destroy();
    atlas.texture = null;
    atlas.dirTexture = null;
};

/* El proxy tiene que pedir el lightmap como lo pide una mesh instance horneada:
   el parámetro de textura y los bits de shader que encienden el muestreo. */
GpuInstancer.prototype._applyAtlasToView = function (payload, view) {
    var D = GpuInstancer.DEF;
    var atlas = payload.atlas;
    if (!atlas || payload.shadow) return;

    var names = GpuInstancer.LIGHTMAP_PARAMS;
    view.proxy.setParameter(names[0], atlas.texture);
    if (atlas.dirTexture) view.proxy.setParameter(names[1], atlas.dirTexture);

    var defs = view.proxy._shaderDefs | 0;
    defs |= D.LM;
    if (atlas.dirTexture) defs |= D.DIRLM;
    if (payload.defs & D.LMAMBIENT) defs |= D.LMAMBIENT;
    view.proxy._updateShaderDefs(defs);
};

/* ------------------------------------------------------------------------- */
/* Hornear con el instancer puesto                                            */
/*                                                                            */
/* El lightmapper tiene que ver la escena tal cual la escribiste: sus propias  */
/* mesh instances en sus capas, no nuestros proxies. Así que se apaga el       */
/* instancer, se hornea, y se vuelve a capturar con los lightmaps nuevos.      */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._patchLightmapper = function () {
    var lm = this.app.lightmapper;
    if (!lm || lm._gpuInstancerPatched) return;

    var self = this;
    var orig = lm.bake;

    lm.bake = function () {
        var api = GpuInstancer.api;
        var wasActive = !!(api && api._active);
        if (wasActive) api._onDisable();

        var result = orig.apply(this, arguments);

        if (wasActive) {
            api._atlasOk = undefined;    // el chunk sigue parcheado; se revalida
            api._onEnable();             // recaptura, y con ella el atlas nuevo
        }
        return result;
    };

    lm._gpuInstancerPatched = true;
    this._lightmapperOriginalBake = orig;
};

/* ------------------------------------------------------------------------- */
/* Medición: sin un número, todo lo demás es una apuesta                      */
/* ------------------------------------------------------------------------- */

GpuInstancer.prototype._startMiniStats = function () {
    if (!pc.MiniStats) {
        console.warn('[gpuInstancer] pc.MiniStats no está en este bundle del engine.');
        return;
    }
    if (!GpuInstancer._miniStats) GpuInstancer._miniStats = new pc.MiniStats(this.app);
};

GpuInstancer.prototype._startHud = function () {
    var el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:8px;left:8px;z-index:1000;pointer-events:none;' +
        'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#dfe6dd;' +
        'background:rgba(10,14,12,.78);padding:8px 10px;border-left:2px solid #4fb89a;white-space:pre';
    var canvas = this.app.graphicsDevice.canvas;
    (canvas.parentNode || document.body).appendChild(el);
    this._hud = el;
};

GpuInstancer.prototype._updateHud = function () {
    if ((this._frame & 7) !== 0) return;
    var s = this.lastFrame || this.stats;
    var totalInstances = 0;
    this._payloads.forEach(function (p) { totalInstances += p.instances.length; });

    this._hud.textContent =
        'gpuInstancer v' + GpuInstancer.VERSION + '\n' +
        'grupos ' + this._payloads.size + '   instancias ' + totalInstances + '\n' +
        'draws ' + s.drawCalls + '  (ahorrados ' + s.drawCallsSaved + ')\n' +
        'enviadas ' + s.sent + '\n' +
        'descartadas  dist ' + s.culledDistance + '  px ' + s.culledScreen +
        '  frustum ' + s.culledFrustum + '\n' +
        '             lod ' + s.culledLod + '  ocluidas ' + s.culledOccluder + '\n' +
        'celdas ' + s.cellsTested + ' (fuera ' + s.cellsCulled + ', bloque ' + s.blockCopies + ')\n' +
        'subidos ' + (s.uploadedBytes / 1024).toFixed(1) + ' KB en ' + s.uploads + '\n' +
        'cpu ' + s.cpuMs.toFixed(2) + ' ms';
};

/* Lo que hay que mirar ANTES de tocar nada más. */
GpuInstancer.prototype.report = function () {
    var s = this.lastFrame || this.stats;
    var payloads = [];
    var totalInstances = 0;

    this._payloads.forEach(function (p) {
        totalInstances += p.instances.length;
        payloads.push({
            grupo: p.key,
            malla: p.mesh.id,
            material: p.material.name || p.material.id,
            capa: p.layer.name,
            tipo: p.shadow ? 'sombra' : 'color',
            lod: p.lodIndex,
            instancias: p.instances.length,
            celdas: p.cells.size,
            vistas: p.views.size
        });
    });

    payloads.sort(function (a, b) { return b.instancias - a.instancias; });

    var out = {
        version: GpuInstancer.VERSION,
        grupos: this._payloads.size,
        instancias: totalInstances,
        drawCallsDelInstancer: s.drawCalls,
        drawCallsAhorrados: s.drawCallsSaved,
        instanciasEnviadas: s.sent,
        descartadas: {
            distancia: s.culledDistance, tamanoEnPantalla: s.culledScreen,
            frustum: s.culledFrustum, lod: s.culledLod, oclusion: s.culledOccluder
        },
        celdas: { probadas: s.cellsTested, descartadas: s.cellsCulled, copiasDeBloque: s.blockCopies },
        subidaKB: +(s.uploadedBytes / 1024).toFixed(1),
        cpuMs: +s.cpuMs.toFixed(3),
        noInstanciado: this._skipped,
        detalle: payloads
    };

    if (console.table) console.table(payloads.slice(0, 20));
    console.log('[gpuInstancer]', out);
    return out;
};

GpuInstancer.prototype._logSkipped = function () {
    if (!this.debug.warnings) return;
    var k = this._skipped;
    var total = k.lightmap + k.skin + k.morph + k.batch + k.params + k.material + k.transparent + k.tag;
    if (total === 0) return;
    console.log('[gpuInstancer] fuera del instancing: ' +
        'lightmap ' + k.lightmap + ', skin ' + k.skin + ', morph ' + k.morph +
        ', batchGroup ' + k.batch + ', parámetros propios ' + k.params +
        ', material propio ' + k.material +
        ', transparentes ' + k.transparent + ', por tag ' + k.tag + '.');
};

GpuInstancer.prototype._debugDrawCells = function () {
    var app = this.app;
    var green = new pc.Color(0.3, 0.9, 0.6);
    var self = this;

    this._payloads.forEach(function (payload) {
        if (payload.shadow) return;
        payload.cells.forEach(function (cell) {
            self._drawBox(app, cell.aabb, green);
        });
    });
};

GpuInstancer.prototype._drawBox = function (app, aabb, color) {
    var c = aabb.center, h = aabb.halfExtents;
    var x0 = c.x - h.x, x1 = c.x + h.x;
    var y0 = c.y - h.y, y1 = c.y + h.y;
    var z0 = c.z - h.z, z1 = c.z + h.z;

    var p = this._boxPoints || (this._boxPoints = []);
    p.length = 0;

    function edge(ax, ay, az, bx, by, bz) {
        p.push(new pc.Vec3(ax, ay, az), new pc.Vec3(bx, by, bz));
    }

    edge(x0, y0, z0, x1, y0, z0); edge(x1, y0, z0, x1, y0, z1); edge(x1, y0, z1, x0, y0, z1); edge(x0, y0, z1, x0, y0, z0);
    edge(x0, y1, z0, x1, y1, z0); edge(x1, y1, z0, x1, y1, z1); edge(x1, y1, z1, x0, y1, z1); edge(x0, y1, z1, x0, y1, z0);
    edge(x0, y0, z0, x0, y1, z0); edge(x1, y0, z0, x1, y1, z0); edge(x1, y0, z1, x1, y1, z1); edge(x0, y0, z1, x0, y1, z1);

    if (app.drawLines) app.drawLines(p, color);
};

/* ------------------------------------------------------------------------- */
/* API pública                                                                */
/* ------------------------------------------------------------------------- */

/* Vuelve a capturar todo desde cero (después de cambiar atributos a mano). */
GpuInstancer.prototype.rebuild = function () {
    if (!this._active) return;
    this._releaseAll();
    this._lodCache = null;
    this._measureShadowDistance();
    this._captureExisting();
    this._captureLightmapped();
};

/* Cuántos draw calls tendría la escena sin instancing, y cuántos tiene con él.
   Es la comparación honesta: cuenta también los grupos que no se pudieron
   instanciar. */
GpuInstancer.prototype.balance = function () {
    var sin = 0, con = 0;
    this._payloads.forEach(function (p) {
        sin += p.instances.length;
        con += p.views.size > 0 ? 1 : 0;
    });
    return { sinInstancing: sin, conInstancing: con, ahorro: sin - con };
};

/* ========================================================================= */
/* gpuInstancerLod — niveles de detalle propios de un objeto                  */
/*                                                                           */
/* Ponelo en la entidad de CADA nivel (Casa_LOD0, Casa_LOD1, ...) solo si     */
/* querés umbrales distintos a los globales. Si tus entidades ya se llaman    */
/* con el sufijo _LOD0/_LOD1, con los niveles globales alcanza.               */
/* ========================================================================= */

var GpuInstancerLod = pc.createScript('gpuInstancerLod');

GpuInstancerLod.attributes.add('index', {
    type: 'number', default: -1, min: -1, max: 9, precision: 0,
    title: 'Index',
    description: 'Índice de nivel de esta entidad. -1 = sacarlo del nombre (sufijo _LOD0, _LOD1...).'
});

GpuInstancerLod.attributes.add('multiplier', {
    type: 'number', default: 1, min: 0.05, max: 20, precision: 2,
    title: 'Multiplier',
    description: 'Multiplica los umbrales de ESTE objeto. Un árbol denso aguanta menos píxeles que una casa.'
});

GpuInstancerLod.attributes.add('levels', {
    type: 'json', array: true,
    title: 'Levels',
    description: 'Umbrales propios. Vacío = usar los globales del gpuInstancer.',
    schema: [
        {
            name: 'index',
            type: 'number', default: 0, min: 0, max: 9, precision: 0,
            title: 'Index'
        },
        {
            name: 'minScreenSize',
            type: 'number', default: 0, min: 0, precision: 1,
            title: 'Min Screen Size',
            description: 'Radio proyectado en píxeles a partir del cual manda este nivel.'
        },
        {
            name: 'maxDistance',
            type: 'number', default: 0, min: 0,
            title: 'Max Distance',
            description: 'Distancia máxima en metros. 0 = solo tamaño en pantalla.'
        }
    ]
});

GpuInstancerLod.prototype.initialize = function () {
    this._levels = null;
    if (!this.levels || this.levels.length === 0) return;

    var out = [];
    for (var i = 0; i < this.levels.length; i++) {
        var l = this.levels[i];
        out[l.index | 0] = { minScreenSize: l.minScreenSize || 0, maxDistance: l.maxDistance || 0 };
    }
    this._levels = out;
};

/* ========================================================================= */
/* gpuInstancerCell — tamaño de celda propio de una rama de la escena         */
/*                                                                           */
/* Un bosque quiere celdas grandes; el interior de un edificio, chicas. El    */
/* script vale para toda la rama que cuelga de la entidad donde se ponga.     */
/* ========================================================================= */

var GpuInstancerCell = pc.createScript('gpuInstancerCell');

GpuInstancerCell.attributes.add('size', {
    type: 'vec3', default: [0, 0, 0],
    title: 'Size',
    description: 'Tamaño de celda para esta rama, en metros. (0,0,0) = usar el global. Regla práctica: que entren entre 20 y 200 instancias por celda.'
});

/* ========================================================================= */
/* gpuInstancerOccluder — "si este objeto tapa a los demás, que no se dibujen" */
/*                                                                           */
/* Ponelo en una pared, una montaña o un edificio. Se usa UN rectángulo del   */
/* objeto (el que más tapa desde la cámara), nunca la malla entera: es la     */
/* técnica de Godot, y con 3 o 4 bien puestos ya rinde.                       */
/* ========================================================================= */

var GpuInstancerOccluder = pc.createScript('gpuInstancerOccluder');

GpuInstancerOccluder.attributes.add('shape', {
    type: 'string', default: 'box',
    title: 'Shape',
    description: 'Box usa la caja del objeto y elige sola la cara que más tapa. Quad usa un rectángulo en el plano XY local (normal = Z local): es lo más barato y lo más predecible.',
    enum: [{ 'Caja del objeto': 'box' }, { 'Rectángulo (plano XY local)': 'quad' }]
});

GpuInstancerOccluder.attributes.add('size', {
    type: 'vec2', default: [10, 10],
    title: 'Size',
    description: 'Ancho y alto del rectángulo, en metros locales (solo en modo Quad).'
});

GpuInstancerOccluder.attributes.add('shrink', {
    type: 'number', default: 0.95, min: 0.1, max: 1, precision: 2,
    title: 'Shrink',
    description: 'Encoge el ocluyente antes de usarlo. Menos de 1 es SEGURO: descarta un poco menos, pero nunca esconde algo que se veía asomar por el borde.'
});

GpuInstancerOccluder.FACES = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]
];

GpuInstancerOccluder.prototype.initialize = function () {
    this._corners = [new pc.Vec3(), new pc.Vec3(), new pc.Vec3(), new pc.Vec3()];
    this._box = [];
    for (var i = 0; i < 8; i++) this._box.push(new pc.Vec3());
    this._local = new pc.BoundingBox();
    this._localValid = false;
    this._tmp = new pc.Vec3();

    this.on('enable', this._register, this);
    this.on('disable', this._unregister, this);
    this.on('destroy', this._unregister, this);
    this._register();
};

GpuInstancerOccluder.prototype._register = function () {
    if (GpuInstancer.occluders.indexOf(this) === -1) GpuInstancer.occluders.push(this);
};

GpuInstancerOccluder.prototype._unregister = function () {
    var i = GpuInstancer.occluders.indexOf(this);
    if (i !== -1) GpuInstancer.occluders.splice(i, 1);
};

/* Caja local del objeto: la del render component si lo tiene, y si no un cubo
   unidad (que la escala de la entidad se encarga de estirar). */
GpuInstancerOccluder.prototype._localBox = function () {
    if (this._localValid) return this._local;

    var mis = null;
    if (this.entity.render) mis = this.entity.render.meshInstances;
    else if (this.entity.model && this.entity.model.model) mis = this.entity.model.model.meshInstances;

    if (mis && mis.length > 0) {
        var first = true;
        for (var i = 0; i < mis.length; i++) {
            var mesh = mis[i].mesh;
            if (!mesh || !mesh.aabb) continue;
            if (first) { this._local.copy(mesh.aabb); first = false; }
            else this._local.add(mesh.aabb);
        }
        if (!first) { this._localValid = true; return this._local; }
    }

    this._local.center.set(0, 0, 0);
    this._local.halfExtents.set(0.5, 0.5, 0.5);
    this._localValid = true;
    return this._local;
};

/* Devuelve los 4 vértices en mundo del rectángulo que va a tapar, o null. */
GpuInstancerOccluder.prototype.getQuad = function (eye) {
    var m = this.entity.getWorldTransform();
    var c = this._corners;
    var s = Math.max(this.shrink, 0.01);
    var i;

    if (this.shape === 'quad') {
        var hx = this.size.x * 0.5 * s, hy = this.size.y * 0.5 * s;
        c[0].set(-hx, -hy, 0); c[1].set(hx, -hy, 0); c[2].set(hx, hy, 0); c[3].set(-hx, hy, 0);
        for (i = 0; i < 4; i++) m.transformPoint(c[i], c[i]);
        return c;
    }

    /* modo caja: se arman los 8 vértices en mundo y se elige la cara que más
       superficie ocupa desde el ojo. Usar UNA cara en vez de la silueta entera
       descarta un poco menos, pero nunca de más. */
    var box = this._localBox();
    var cx = box.center.x, cy = box.center.y, cz = box.center.z;
    var ex = box.halfExtents.x * s, ey = box.halfExtents.y * s, ez = box.halfExtents.z * s;
    var b = this._box;

    b[0].set(cx - ex, cy - ey, cz - ez); b[1].set(cx + ex, cy - ey, cz - ez);
    b[2].set(cx + ex, cy + ey, cz - ez); b[3].set(cx - ex, cy + ey, cz - ez);
    b[4].set(cx - ex, cy - ey, cz + ez); b[5].set(cx + ex, cy - ey, cz + ez);
    b[6].set(cx + ex, cy + ey, cz + ez); b[7].set(cx - ex, cy + ey, cz + ez);
    for (i = 0; i < 8; i++) m.transformPoint(b[i], b[i]);

    var centerW = this._tmp;
    centerW.set(0, 0, 0);
    for (i = 0; i < 8; i++) centerW.add(b[i]);
    centerW.mulScalar(1 / 8);

    var faces = GpuInstancerOccluder.FACES;
    var best = -1, bestScore = 0;

    for (i = 0; i < faces.length; i++) {
        var f = faces[i];
        var p0 = b[f[0]], p1 = b[f[1]], p2 = b[f[2]], p3 = b[f[3]];

        var fx = (p0.x + p1.x + p2.x + p3.x) * 0.25;
        var fy = (p0.y + p1.y + p2.y + p3.y) * 0.25;
        var fz = (p0.z + p1.z + p2.z + p3.z) * 0.25;

        var e1x = p1.x - p0.x, e1y = p1.y - p0.y, e1z = p1.z - p0.z;
        var e2x = p3.x - p0.x, e2y = p3.y - p0.y, e2z = p3.z - p0.z;
        var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        var area = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (area < 1e-6) continue;

        /* normal hacia afuera de la caja */
        if (nx * (fx - centerW.x) + ny * (fy - centerW.y) + nz * (fz - centerW.z) < 0) {
            nx = -nx; ny = -ny; nz = -nz;
        }

        /* ¿mira al ojo? */
        var vx = eye.x - fx, vy = eye.y - fy, vz = eye.z - fz;
        var d2 = vx * vx + vy * vy + vz * vz;
        if (d2 < 1e-6) continue;
        var facing = nx * vx + ny * vy + nz * vz;
        if (facing <= 0) continue;

        var score = (area * facing / Math.sqrt(area)) / (d2 * Math.sqrt(d2));
        if (score > bestScore) { bestScore = score; best = i; }
    }

    if (best === -1) return null;

    var bf = faces[best];
    for (i = 0; i < 4; i++) c[i].copy(b[bf[i]]);
    return c;
};
