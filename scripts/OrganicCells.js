/* OrganicCells.js — Campo INFINITO de células orgánicas (PlayCanvas 2.x, script CLÁSICO)

   QUÉ HACE
   Miles de "células" gelatinosas alrededor del jugador, que se mueven y se
   deforman solas, en UN SOLO DRAW CALL. Cada célula es un QUAD de 4 vértices
   (no una esfera): la forma esférica, el volumen y la iluminación las inventa
   el fragment shader (técnica de "sphere impostor"). Al rodearla con la cámara
   sigue pareciendo una esfera porque el quad es SCREEN-ALIGNED (se orienta en
   espacio de vista) y la normal se reconstruye por píxel.

   EL LOOK (mirando una foto de microscopio)
   - ANILLO DE MEMBRANA grueso y oscuro en el borde, con grosor propio por
     célula: es lo que más hace que se lea como célula y no como pelota.
   - CUERPO translúcido, más claro que el anillo.
   - NÚCLEO grande y difuso, teñido con el color de la propia célula, que se
     hunde hacia atrás cuando queda del lado opuesto (no está pintado en 2D:
     su desplazamiento es un vector de mundo).
   - GRANULADO (orgánulos): puntitos anclados a la SUPERFICIE de la célula en
     espacio de mundo, así que al rodearla giran con ella en vez de nadar.
   - RUGOSIDAD PROPIA POR CÉLULA: cada una tiene su granulado y su arruga fina
     de contorno; conviven lisas y ásperas en el mismo campo.
   - COLOR POR CUADRANTES: el espacio se divide en cuadrantes y cada uno tiene
     su tono y su claridad, interpolados de forma CONTINUA (ruido de valor
     trilineal): al volar se pasa de rojo a rojo oscuro, a ámbar, a verde...
     sin una sola costura visible.

   POR QUÉ ES BARATO (móvil de gama baja)
   - 1 draw call por capa (2 con el fondo encendido): una pc.MeshInstance con
     HARDWARE INSTANCING (MeshInstance.setInstancing) por capa. El quad son 4
     vértices y 2 triángulos COMPARTIDOS por todas las instancias.
   - "Mucho en cámara, pocas de verdad": la capa de detalle tiene pocas células
     cerca; la de fondo, muchas lejos, chicas en pantalla y con el camino corto
     del shader. Lo que cuesta son los PÍXELES: una célula grande cerca vale
     cientos de chicas lejos. Size Bias y Fondo Start son los mandos.
   - Memoria: 48 bytes por célula (3 vec4 de datos de instancia). 10.000
     células = 480 KB de VRAM. Cero entidades, cero nodos de escena, cero
     componentes: el motor no recorre miles de objetos por frame.
   - CPU por frame: UN setParameter (el reloj). Nada más. No hay bucle por
     célula en JavaScript.
   - El color de cuadrante se HORNEA en CPU al construir (dos ruidos por
     célula): en el shader no cuesta absolutamente nada.
   - Campo INFINITO sin generar nada: las posiciones se envuelven (wrap) en un
     cubo centrado en la cámara DENTRO DEL VERTEX SHADER, así que un presupuesto
     fijo de instancias cubre espacio ilimitado en todas las direcciones. El
     campo de color usa un ruido PERIÓDICO con ese mismo cubo, así que el color
     tampoco tiene costuras al envolverse.
   - Culling en GPU: la instancia que queda fuera del radio de visión colapsa a
     un punto (quad degenerado) y NO genera ni un fragmento.
   - Fragment sin texturas y con UN solo seno (el hash del granulado, y solo si
     el granulado está encendido). El contorno de ameba sale de armónicos
     angulares por identidades de ángulo múltiple: puros productos. Todo lo
     opcional (rizado, granulado, núcleo, especular, filo) va tras ramas por
     UNIFORM —todos los píxeles toman el mismo camino, no hay divergencia— y se
     apaga poniendo su valor en 0.

   LÍMITES CONOCIDOS (honestidad por delante)
   - Los quads NO escriben profundidad por píxel (no se usa gl_FragDepth porque
     rompe el early-Z y es carísimo en móvil): la profundidad de una célula es
     la de su plano central. Dos células que se atraviesan muestran un corte
     recto en vez de una intersección esférica. Con niebla y células separadas
     no se nota.
   - En modo 'blend' NO hay ordenamiento por célula: el motor ordena por mesh
     instance y acá todas son UNA sola. Por eso el modo por defecto es 'opaque'
     (oclusión correcta vía z-buffer y sin ordenar nada).
   - La silueta es un impostor: con FOV muy ancho, las células del borde de la
     pantalla tienen un error de silueta mínimo (típico de todo billboard).
   - Es un ShaderMaterial propio: no lo tocan las luces, la niebla ni el
     lightmap de la escena (por eso trae su propia luz y su propio Fog Color), y
     si la cámara pide profundidad de escena (depth prepass) las células
     aportan el quad entero, no su silueta.

   HABITACIONES (zonas sin células) — POR TAG
   Ponéle a la caja el tag 'no-cells' (o el que pongas en Habitaciones > Tag) y
   ahí adentro no se dibuja una sola célula. Da igual el tamaño —un armario o
   un hangar de 500 unidades— y da igual cuántas sean: se etiquetan todas las
   del nivel y cada frame el shader atiende las 16 MÁS CERCANAS a la cámara,
   que son las únicas que pueden tocar una célula visible. La caja es la
   envolvente real del modelo de la entidad (contando sus hijos), o su ESCALA
   si la entidad está vacía. Se pueden crear, etiquetar, mover y apagar en
   pleno juego.
   El vaciado se hace en el VERTEX SHADER sobre la posición YA ENVUELTA, que es
   la clave: hornear el hueco al generar las células en CPU NO sirve con el
   campo infinito encendido, porque la célula que hoy está lejos mañana se
   envuelve justo dentro de la habitación. Así, en cambio, el hueco se queda
   quieto en el mundo, las habitaciones pueden moverse en tiempo real y una
   célula tapada no cuesta ni un fragmento (su quad colapsa a un punto).
   CPU: buscar el tag recorre el grafo, así que va cada Scan Interval (0.5 s).
   Y de las encontradas, cada frame solo se le calcula la caja a las que están
   EN ALCANCE: las demás se descartan con una resta contra la esfera que las
   envuelve (cacheada, centrada en su posición, o sea que moverlas y rotarlas
   no la invalida). Así el coste crece con las habitaciones que tenés CERCA y
   no con las que tenga el nivel entero: 100 habitaciones-modelo en movimiento
   pasaron de 0.297 a 0.0245 ms por frame.

   USO
   1) Poné el script 'organicCells' en cualquier entidad (una vacía sirve: el
      script crea una entidad hija con el render).
   2) Los atributos están en SIETE SECCIONES plegables:
      · Visibilidad — hasta dónde se ve, cómo se funde con el fondo y el modo
        de render (aditivo para el look de vidrio).
      · Cantidad — cuántas células detalladas y en qué volumen.
      · Cuadrantes — tamaño del cuadrante y cómo alterna el color entre ellos.
      · Realismo — profundidad de campo, moteado y franja cromática.
      · Habitaciones — el tag que marca las zonas sin células.
      · Fondo — la segunda capa barata: muchas células lejanas y motas.
      · Célula — cómo es cada una: vidrio, membrana, núcleo, rugosidad, luz.
      En código: this.visibility.viewDistance, this.background.count,
      this.cell.translucency. Para cambiarlos por código usá set():
      cells.set('cell', { translucency: 0.9 }).
   3) Con Wrap Around Camera activo el campo sigue a la cámara y es infinito;
      apagado, queda un cubo fijo centrado en la entidad.
   4) Con Debug encendido, la consola imprime la cantidad real, la densidad, la
      memoria, los cuadrantes y la distancia de visión efectiva.

   BACKENDS: WebGL2 (GLSL) y WebGPU (WGSL) con doble fuente nativa, igual que
   cloudbox.js/cartoonmaterial.js de este proyecto (el transpilador del engine
   necesita WASM que un build standalone no carga). El engine 2.x ya no soporta
   WebGL1, así que el instancing es funcionalidad de núcleo: sin extensiones.

   VERIFICACION: el camino GLSL/WebGL2 esta probado en runtime (1 draw call,
   sin errores, habitaciones vaciando el campo). El WGSL NO se pudo EJECUTAR
   —el entorno de prueba no tiene adaptador WebGPU—, solo cotejar: mismos
   uniforms declarados y enviados, y las mismas constantes numericas que el
   GLSL con las mismas multiplicidades.

   API verificada contra la referencia oficial del engine v2.22.0: VertexFormat,
   VertexBuffer(device, format, numVertices, { data }),
   MeshInstance.setInstancing(vb, cull = false) — que además marca
   vb.format.instancing = true y deja cull = false —, ShaderMaterial
   ({ uniqueName, attributes, vertexGLSL, fragmentGLSL, vertexWGSL,
   fragmentWGSL }) y los uniforms estándar matrix_view, matrix_projection y
   view_position. */

var OrganicCells = pc.createScript('organicCells');

/* 1.6.1 — las habitaciones FUERA DE ALCANCE ya no se calculan. Antes se le
   armaba la caja de mundo a todas las del nivel (transformar la envolvente de
   cada malla de su subarbol) y recien despues se descartaban por distancia,
   asi que el coste por frame crecia con el TOTAL de habitaciones etiquetadas,
   estuvieran donde estuvieran. Ahora cada una guarda la esfera que la envuelve
   —centrada en su POSICION, o sea inmune a moverla y a rotarla— y con una
   resta se decide si vale la pena mirarla. Los radios se reciclan en cada
   Scan Interval, que es el limite del atajo: reescalar una habitacion lejana
   tarda como mucho eso en notarse (moverla y rotarla siguen siendo al
   instante). MEDIDO (escritorio, minimo de 8 pasadas x 200 frames): 100
   habitaciones que son modelos de 12 mallas y que ademas se mueven —el peor
   caso, porque moverse invalida el AABB cacheado del motor— pasaron de 0.297
   a 0.0245 ms por frame, 12x menos, eligiendo exactamente las mismas. Con
   habitaciones QUIETAS la diferencia es chica (300 salas: 0.0343 -> 0.0243
   ms) porque ahi el motor ya cachea sus envolventes.
   1.6.0 — HABITACIONES POR TAG. Ya no hay que arrastrar entidades a una
   lista: cualquier entidad con el tag (Habitaciones > Tag, 'no-cells' por
   defecto) vacia su caja, del tamano que sea y esten las que esten. Detalles
   que importan:
   · El tope de 8 cajas era un tope de ESCENA y ahora es solo de cuantas
     atiende el shader a la vez (16, y la constante se propaga sola a los dos
     shaders). Cada frame entran las MAS CERCANAS por distancia CAMARA-CAJA,
     no al centro: una habitacion enorme que te envuelve da distancia 0 y
     entra siempre, que es justo lo que fallaba si se miraba el centro.
   · Las que estan mas lejos que la vision efectiva (mas margen, desvanecido
     y el radio de la celula mas grande) no ocupan ranura: no pueden tocar
     ninguna celula visible.
   · findByTag recorre el grafo entero, asi que la BUSQUEDA va por intervalo
     (Scan Interval, 0.5 s) y la cache de mallas por habitacion solo se rehace
     cuando el conjunto cambia. Mover una habitacion ya encontrada se ve al
     instante igual, porque su caja se recalcula por frame.
   · La lista manual de entidades sigue estando y se suma al tag, sin repetir.
   · report() ahora lista las habitaciones activas con su nombre, centro,
     tamano real y distancia a la camara: si una caja no vacia nada, ahi se ve
     si el script la encontro y con que tamano.
   1.5.2 — tres bugs reportados.
   · CELULAS QUE APARECEN Y DESAPARECEN: el margen que las habitaciones le
     sumaban por Far Size Boost dependia del boost DE ESE FRAME, o sea de la
     distancia a la camara: el hueco cambiaba de tamano al moverse y las
     celulas del borde parpadeaban. Ahora usa el peor caso constante
     (uFarBoost), asi que el hueco es fijo en el mundo.
   · SKYBOX AZUL: era la neblina. Es una caja OPACA que escribe profundidad y
     por diseno tapa el skybox (ella pasa a ser el fondo). Ahora viene
     APAGADA: es opt-in.
   · TRIANGULOS/DRAW CALLS QUE SE DISPARAN SEGUN LA CAMARA: eso solo puede ser
     frustum culling. No se pudo reproducir aca (mis mesh instances tienen
     cull = false y los triangulos salen constantes en un barrido de 360),
     asi que se blindo: AABB del tamano del mundo en todas ellas, cull = false
     reafirmado despues de cada setInstancing y despues de crear el render
     component, y la neblina con malla propia en vez del primitivo 'box' (ya
     no hay que leer meshInstances del componente para marcarlas). Ademas
     report() imprime el estado en vivo para confirmarlo.
   · El depth bias del detalle ya no escala con el radio ni se aplica en modos
     con mezcla: escalado, una celula grande pegada a la camara podia cruzar
     el plano de camara y desaparecer entera.
   1.5.1 — arreglos de la revision de 1.5.0: la neblina ahora ESCRIBE z (el
   skybox del engine, que se dibuja despues con z ~ 1, la pisaba entera); usa
   CULLFACE_NONE (con un ancestro espejado el engine invertia el cull y la
   caja desaparecia); tiene reloj propio sin modulo (con el reloj de fase todo
   el fondo saltaba de lugar en cada reinicio); en los modos opacos las
   celulas lejanas se funden hacia el color de la neblina en su direccion y no
   hacia un Fog Color plano; las habitaciones incorporan el radio agrandado por
   Far Size Boost; los cumulos no dividen por pixel; y el z forzado da la
   misma profundidad en WebGL y WebGPU.
   1.5.0 — AMBIENTE LLENO CON POCAS CELULAS. Seccion Neblina: un fondo
   procedural (gradiente hacia la luz + cumulos de celulas desenfocadas con
   paralaje y deriva) pintado UNA vez por pixel, como un skybox: llenar el
   espacio vacio cuesta un pase de pantalla, no instancias. Y Far Size Boost:
   las celulas lejanas crecen con la distancia (van por el camino barato y son
   chicas en pantalla), asi el fondo se ve apretado con las mismas celulas.
   Coste medido de la neblina en escritorio: ~0.4 ms con dos octavas; por eso
   la segunda octava (Detail) va apagada por defecto y con Density 0 queda
   solo el gradiente.
   1.4.2 — celulas que desaparecian o cambiaban de tamano al acercarse. Raiz:
   las dos capas tenian celulas DISTINTAS (otra semilla, radio al 0.75x), asi
   que al acercarse una de fondo se apagaba a ~7 unidades y aparecia otra de
   detalle. Ahora las dos capas dibujan el MISMO buffer (misma celula, mismo
   lugar, mismo radio) con un traspaso complementario por banda alrededor de
   Background Start: en modos con mezcla la suma de pesos es exactamente 1 y
   en opacos el radio dibujado nunca baja del propio (verificado replicando la
   matematica del vertex en JS). Y el fundido cercano ahora es relativo al
   RADIO: una celula se desvanece recien al entrar en ella, no a una distancia
   fija de 1.5. Seccion Fondo: se fueron 'count' y 'radiusScale' (ya no hay
   celulas propias del fondo); 'enabled' elige si lo lejano usa el camino
   barato.
   1.4.1 — arreglos de la revision de 1.4.0. El grave: en hot reload el
   engine NO llama a initialize en la instancia nueva (verificado en
   ScriptComponent.swap de 2.7.4), asi que swap() ahora lo llama a mano e
   initialize es idempotente. Ademas: el modo aditivo usa BLEND_ADDITIVEALPHA
   (BLEND_ADDITIVE ignora el alpha: bordes escalonados y desenfoque muerto),
   el Fresnel va despues de la pared (antes la pared lo borraba justo en el
   borde), el achicado en modos opacos usa el fundido completo (cercano y
   lejano), y el nucleo emisivo no evalua un smoothstep degenerado con
   Nucleus Size 0.
   1.4.0 — HIPERREALISMO DE VIDRIO y DOS CAPAS.
   · Look de la referencia nueva: membrana translucida (Translucency), brillo
     Fresnel de pompa (Fresnel), nucleo EMISIVO de otro color con halo
     (Nucleus Color / Nucleus Glow), reflejo de vidrio con tamano ajustable
     (Specular Size) y modo de render ADITIVO, que suma luz y no necesita
     ordenar nada. Los defaults ahora son este look; el de tejido de
     microscopio queda como preset abajo.
   · "Mucho en camara pero pocas": una CAPA DE FONDO barata (seccion Fondo).
     Pocas celulas detalladas cerca; muchas celulas lejanas, siempre
     desenfocadas, con los bloques caros apagados por uniform, y motas
     (puntitos brillantes) que llenan el aire casi gratis. Mismo programa de
     shader, 2 draw calls. Size Bias amontona los tamanos hacia lo chico: lo
     que cuesta son los pixeles, no las instancias.
   · En los modos opacos la celula lejana ademas se ACHICA al fundirse con la
     niebla (uShrinkFar): si no, un disco opaco del color de la niebla taparia
     la capa de fondo.

   PRESET "tejido de microscopio" (la referencia anterior, salmon opaco):
     Visibilidad  Render Mode 'Opaco + bordes suaves' · Fog Color 0.06,0.02,0.07
     Celula       Translucency 0 · Fresnel 0 · Nucleus Glow 0 · Specular 0.1
                  Membrane Color A 0.80,0.36,0.31 · B 0.93,0.63,0.55
                  Membrane Tint 0.42,0.30,0.32 · Nucleus Tint 0.55,0.37,0.39
                  Speckle 0.45 · Membrane Width 0.22 · Ambient 0.62
     Cuadrantes   Hue Offset 0.02 · Hue Range 0.14 · Saturation 0.42
     Fondo        Count 0 (una sola capa)

   PRESET "gama baja" (sobre cualquiera de los dos looks):
     Cantidad     Cell Count 400 · Fondo Start 6 · Far Size Boost 1
     Celula       Size Bias 0.8 · Speckle 0 · Specular 0
     Realismo     Mottle 0 · Chromatic Fringe 0 · Focus Amount 0
     Neblina      Detail 0 (default); si aun falta margen, Density 0 (solo el
                  gradiente) o Enabled off
     Y a nivel app: bajar la resolucion de render (device.maxPixelRatio = 1,
     o un resolutionMode FIXED a 0.7x): con impostores el coste ES el pixel.

   1.3.1 — arreglos de la revision de 1.3.0: la caja de una habitacion ahora
   respeta la ROTACION (con la escala cruda, un pasillo girado dejaba el hueco
   atravesado) y toma las mallas de los HIJOS (una habitacion armada como
   jerarquia quedaba con una caja de 1x1x1); la franja cromatica se acota a un
   corrimiento fijo del radio (con pared gruesa pintaba de azul medio interior);
   Focus Amount va clampeado; y el grano mas grande ya entra en su celda.
   1.3.0 — realismo fotografico y HABITACIONES.
   · Desenfoque por distancia (profundidad de campo): las celulas fuera del
     plano de foco pierden nitidez de grano, nucleo y pared, como en una foto
     de microscopio. Con Render Mode 'coverage' o 'blend' tambien se ablanda
     la silueta.
   · Moteado fino del citoplasma, granos de tamano variable y concentrados
     hacia el centro, y franja cromatica en la pared (la aberracion del
     objetivo). La pared pasa de un escalar a un TINTE rgb: membraneShade ->
     membraneTint.
   · HABITACIONES: hasta 8 cajas donde NO se dibujan celulas, evaluadas en el
     vertex shader sobre la posicion YA envuelta, asi que los huecos se quedan
     quietos en el mundo aunque el campo sea infinito.

   PRESET "foto de microscopio" (denso, calido y con foco corto):
     Cantidad     Cell Count 4000 · Region Size 40
     Celula       Cell Radius 1.2 · Radius Variation 0.35
     Cuadrantes   Quadrant Size 14 · Hue Range 0.12 · Saturation 0.4
     Realismo     Focus Distance 7 · Focus Range 2 · Focus Falloff 9
     Visibilidad  View Distance 20 · Render Mode 'Opaco + bordes suaves'

   1.2.1 — el quad ya no recortaba la silueta: la cota anterior suponia la
   matriz de gelatina diagonal y con la cizalla se quedaba corta hasta un 11.8%,
   cortando el anillo de la membrana con una cuerda recta. La cota exacta por
   eje ademas deja el quad en 60% del area (39% con meneo maximo). Tambien:
   especular sin NaN en contraluz exacto, granos que no se cortan contra su
   celda, una division por pixel en vez de tres en la pared, y en WGSL los
   discard ahora cortan de verdad (alli 'discard' no termina la invocacion).
   1.2.0 — look de microscopio: anillo de membrana, granulado por rugosidad y
   color por cuadrantes. Datos por instancia: 32 -> 48 bytes.
   1.1.0 — atributos reagrupados en secciones. OJO al actualizar desde 1.0.x:
   los nombres cambiaron de planos a agrupados (cellCount -> amount.cellCount),
   así que una entidad que YA tenía el script configurado vuelve a los valores
   por defecto y hay que retocarla. */
OrganicCells.VERSION = '1.6.1';

/* Periodo del reloj de fase. Las velocidades por célula son múltiplos enteros
   de 0.1, así que a los 2*PI/0.1 el campo entero vuelve EXACTAMENTE al mismo
   estado: el acumulador se puede reiniciar sin salto visible y sin perder
   precisión de float después de horas de juego. */
OrganicCells.PHASE_PERIOD = 62.83185307179586;

/* Floats por instancia: 3 vec4 interleaved = 48 bytes. */
OrganicCells.FLOATS_PER_CELL = 12;

/* Cuantas habitaciones admite el shader A LA VEZ. Es el tamano de los arrays
   de uniforms Y el tope del bucle del vertex shader: las cadenas de los dos
   shaders se arman con esta constante, asi que se cambia SOLO aca (y no en
   caliente: el valor se congela cuando se carga el archivo).
   El bucle corta en uZoneCount, o sea que las ranuras vacias no cuestan nada;
   lo que se paga es una caja por vertice y solo por las habitaciones activas.
   NO es un tope de cuantas puede haber en la escena: se etiquetan las que
   sean y cada frame entran las MAS CERCANAS a la camara (las demas estan tan
   lejos que ninguna celula visible las toca). */
OrganicCells.MAX_ROOMS = 16;


/* =========================================================
   ATRIBUTOS — en SECCIONES
   ---------------------------------------------------------
   Cada sección es un atributo type:'json' con su schema: así es como el editor
   de PlayCanvas dibuja un grupo plegable con título (es el mecanismo oficial;
   los atributos sueltos no se pueden agrupar de otra forma). Dentro de un
   schema valen los mismos campos que en un atributo normal —type, default,
   title, description, min, max, precision y enum— pero NO otro json anidado.

   En código se leen como this.visibility.viewDistance, this.amount.cellCount,
   this.quadrants.quadrantSize o this.cell.roughness. El engine rellena SIEMPRE
   los campos que falten con su default (ScriptAttributes.rawToValue), así que
   nunca llega undefined ni hace falta chequear nada antes de usarlos.
   ========================================================= */

OrganicCells.attributes.add('visibility', {
    type: 'json',
    title: 'Visibilidad',
    description: 'Hasta dónde se ve el campo y cómo se funde con el fondo.',
    schema: [
        {
            name: 'viewDistance',
            type: 'number', default: 24, min: 1, precision: 1,
            title: 'View Distance',
            description: 'A esta distancia la célula ya se fundió del todo con Fog Color y deja de dibujarse. Con Wrap se limita solo a Region Size / 2 para que nada aparezca de golpe.'
        },
        {
            name: 'nearFade',
            type: 'number', default: 0.3, min: 0, precision: 2,
            title: 'Near Fade',
            description: 'Piso ABSOLUTO del fundido cercano (para el near clip de la cámara). Aparte de esto, cada célula se desvanece sola al ENTRAR en ella, en proporción a su propio radio: una célula grande al lado de la cámara no desaparece.'
        },
        {
            name: 'fogColor',
            type: 'rgb', default: [0.02, 0.07, 0.24],
            title: 'Fog Color',
            description: 'Color hacia el que se funden las células lejanas. Ponelo igual al fondo/niebla de la escena para que la desaparición sea invisible.'
        },
        {
            name: 'renderMode',
            type: 'string', default: 'additive',
            title: 'Render Mode',
            description: 'opaque = oclusión correcta y lo más rápido. coverage = bordes suaves con MSAA. blend = transparencia real pero sin orden entre células. additive = las células SUMAN luz: es el modo del look de vidrio y brillo (ordena solo, no necesita z), pide un fondo oscuro.',
            enum: [
                { 'Opaco': 'opaque' },
                { 'Opaco + bordes suaves (MSAA)': 'coverage' },
                { 'Transparente': 'blend' },
                { 'Aditivo (vidrio y brillo)': 'additive' }
            ]
        },
        {
            name: 'opacity',
            type: 'number', default: 1, min: 0, max: 1, precision: 2,
            title: 'Opacity',
            description: 'Solo en los modos con alpha (Bordes suaves / Transparente).'
        },
        {
            name: 'edgeSoftness',
            type: 'number', default: 0.07, min: 0, max: 0.5, precision: 2,
            title: 'Edge Softness',
            description: 'Suavidad del borde en los modos con alpha.'
        }
    ]
});

OrganicCells.attributes.add('amount', {
    type: 'json',
    title: 'Cantidad',
    description: 'Cuántas células hay y en qué volumen se reparten. Todas salen en 1 draw call y ocupan 48 bytes cada una.',
    schema: [
        {
            name: 'cellCount',
            type: 'number', default: 900, min: 1, max: 60000, precision: 0,
            title: 'Cell Count',
            description: 'Cantidad de células (instancias), compartidas por las dos capas. 1500 = 70 KB de datos, 20000 = 938 KB. Lo caro no es esta cifra sino los píxeles pintados: subila sin miedo y regulá el coste con Background Start, Size Bias y Cell Radius.'
        },
        {
            name: 'regionSize',
            type: 'number', default: 60, min: 1, precision: 1,
            title: 'Region Size',
            description: 'Lado del cubo donde se reparten. Con Wrap ese cubo se repite infinitamente alrededor de la cámara: la densidad real es Cell Count / (Region Size al cubo).'
        },
        {
            name: 'wrapAroundCamera',
            type: 'boolean', default: true,
            title: 'Wrap Around Camera',
            description: 'Campo infinito: el cubo de células se repite alrededor de la cámara. Apagalo para un cubo fijo anclado a la entidad.'
        },
        {
            name: 'seed',
            type: 'number', default: 1, precision: 0,
            title: 'Seed',
            description: 'Semilla del reparto aleatorio y del campo de color (mismo valor = mismo campo).'
        },
        {
            name: 'debug',
            type: 'boolean', default: false,
            title: 'Debug',
            description: 'Escribe en consola el resumen real al construir: cantidad, densidad, memoria, cuadrantes y distancia de visión efectiva.'
        }
    ]
});

OrganicCells.attributes.add('quadrants', {
    type: 'json',
    title: 'Cuadrantes',
    description: 'El espacio se parte en cuadrantes y cada uno tiene su color. La transición es CONTINUA: entre dos cuadrantes el color se interpola, nunca hay un salto ni una línea divisoria.',
    schema: [
        {
            name: 'quadrantSize',
            type: 'number', default: 12, min: 0.5, precision: 1,
            title: 'Quadrant Size',
            description: 'Lado del cuadrante en unidades de mundo. Chico = el color cambia seguido mientras volás; grande = zonas amplias de un mismo tono. Se ajusta solo al divisor más cercano de Region Size para que el campo infinito no muestre costuras.'
        },
        {
            name: 'colorStrength',
            type: 'number', default: 0.6, min: 0, max: 1, precision: 2,
            title: 'Color Strength',
            description: 'Cuánto manda el color del cuadrante sobre los colores de membrana de la sección Célula. 0 = los cuadrantes no pintan nada, 1 = el color es puramente del cuadrante.'
        },
        {
            name: 'hueRange',
            type: 'number', default: 0.16, min: 0, max: 1, precision: 2,
            title: 'Hue Range',
            description: 'Cuánto de la rueda de color recorre. 1 = pasa por todos los colores del RGB (rojo, ámbar, verde, cian, azul, magenta). 0.15 = solo variaciones alrededor de un mismo tono.'
        },
        {
            name: 'hueOffset',
            type: 'number', default: 0.56, min: 0, max: 1, precision: 2,
            title: 'Hue Offset',
            description: 'Desde qué color arranca la rueda (0 = rojo, 0.33 = verde, 0.66 = azul).'
        },
        {
            name: 'saturation',
            type: 'number', default: 0.55, min: 0, max: 1, precision: 2,
            title: 'Saturation',
            description: 'Qué tan puro es el color del cuadrante. Bajo = tonos lavados y orgánicos; alto = colores de neón.'
        },
        {
            name: 'colorSharpness',
            type: 'number', default: 0.55, min: 0, max: 1, precision: 2,
            title: 'Color Sharpness',
            description: 'Qué tan marcado es el cuadrante. 0 = un degradado continuo que nunca llega a los colores extremos de la rueda; 1 = cada cuadrante toma su color entero y la mezcla se concentra en una banda angosta del límite. En ningún valor hay escalón: la transición siempre es continua.'
        },
        {
            name: 'shadeRange',
            type: 'number', default: 0.45, min: 0, max: 1, precision: 2,
            title: 'Shade Range',
            description: 'Variación de claro/oscuro entre cuadrantes, con su propio campo suave. Es lo que hace que un rojo pase a rojo más oscuro sin cambiar de tono.'
        }
    ]
});

OrganicCells.attributes.add('realism', {
    type: 'json',
    title: 'Realismo',
    description: 'Los recursos fotográficos: profundidad de campo, moteado del citoplasma y aberración cromática del objetivo. Mottle y Chromatic Fringe tienen su propia rama y en 0 se saltan enteros; el desenfoque en cambio NO se saltea con Focus Amount 0 (queda multiplicando por 1), aunque ahí el compilador puede plegar sus dos divisiones.',
    schema: [
        {
            name: 'focusAmount',
            type: 'number', default: 0.85, min: 0, max: 1, precision: 2,
            title: 'Focus Amount',
            description: 'Cuánta profundidad de campo. 0 = todo perfectamente nítido. Es lo que más separa una imagen de render de una foto. Ojo: en 0 no se salta ningún bloque del shader, solo deja de tener efecto.'
        },
        {
            name: 'focusDistance',
            type: 'number', default: 5.5, min: 0, precision: 1,
            title: 'Focus Distance',
            description: 'A qué distancia de la cámara está el plano enfocado.'
        },
        {
            name: 'focusRange',
            type: 'number', default: 2.5, min: 0, precision: 1,
            title: 'Focus Range',
            description: 'Espesor de la franja que se ve nítida, a cada lado del plano de foco.'
        },
        {
            name: 'focusFalloff',
            type: 'number', default: 7, min: 0.1, precision: 1,
            title: 'Focus Falloff',
            description: 'En cuántas unidades más se pasa de nítido a totalmente desenfocado. Corto = look macro de microscopio.'
        },
        {
            name: 'blurAmount',
            type: 'number', default: 0.5, min: 0, max: 1, precision: 2,
            title: 'Blur Amount',
            description: 'Cuánto se ensancha el borde de las células desenfocadas. OJO: solo se ve en los modos con alpha (Bordes suaves / Transparente); en opaco puro el desenfoque solo afecta al detalle interno.'
        },
        {
            name: 'mottle',
            type: 'number', default: 0.3, min: 0, max: 2, precision: 2,
            title: 'Mottle',
            description: 'Moteado irregular del citoplasma: lo que saca a la célula del aspecto de degradado liso. NO es gratis: son 2 senos propios por píxel (más que todo el bloque de granos junto). En 0 se salta entero.'
        },
        {
            name: 'fringe',
            type: 'number', default: 0.06, min: 0, max: 0.5, precision: 2,
            title: 'Chromatic Fringe',
            description: 'Aberración cromática de la pared: el rojo y el azul quedan a radios apenas distintos, como en un objetivo real. Sutil, pero es de las cosas que más gritan "foto".'
        }
    ]
});

OrganicCells.attributes.add('rooms', {
    type: 'json',
    title: 'Habitaciones',
    description: 'Zonas donde NO se dibujan células: las habitaciones del juego. Marcá cada caja con un TAG y listo, sin importar el tamaño ni cuántas sean. Se evalúan en el vertex shader sobre la posición ya envuelta, así que los huecos se quedan quietos en el mundo aunque el campo sea infinito, y pueden moverse en tiempo real.',
    schema: [
        {
            name: 'tag',
            type: 'string', default: 'no-cells',
            title: 'Tag',
            description: 'Toda entidad de la escena con este TAG vacía su caja de células, del tamaño que sea. La caja es la envolvente real de su modelo (contando sus hijos) y si la entidad está vacía es su ESCALA (escala 4,3,5 = 4x3x5) en su posición. Podés poner varios tags separados por coma (vale cualquiera de ellos). Vacío = no se busca por tag. Se pueden etiquetar TODAS las que quieras: cada frame el shader atiende las 16 más cercanas a la cámara, y las que quedan afuera están tan lejos que no tocan ninguna célula visible.'
        },
        {
            name: 'scanInterval',
            type: 'number', default: 0.5, min: 0, precision: 2,
            title: 'Scan Interval',
            description: 'Cada cuántos segundos se vuelve a revisar la escena de verdad: buscar el tag (recorre el grafo entero) y volver a medir el tamaño de las habitaciones que están fuera de alcance. Bajalo si creás, etiquetás o REESCALÁS habitaciones en pleno juego y las querés al instante; 0 = cada frame, sin atajos. Mover y rotar una habitación ya encontrada se ve siempre al instante, esto no las afecta.'
        },
        {
            name: 'volumes',
            type: 'entity', array: true,
            title: 'Volumes',
            description: 'Habitaciones sueltas, además de las del tag (podés dejarlo vacío y usar solo el tag). Mismas reglas: envolvente del modelo si lo tiene, su escala si está vacía.'
        },
        {
            name: 'camera',
            type: 'entity',
            title: 'Camera',
            description: 'Cámara de referencia para decidir cuáles son las habitaciones más cercanas cuando hay más de 16 cerca. Vacío = la primera cámara activa de la escena, que es lo correcto salvo que tengas varias.'
        },
        {
            name: 'margin',
            type: 'number', default: 0.8, min: 0, precision: 2,
            title: 'Margin',
            description: 'Cuánto más allá de la caja se sigue vaciando, para que ninguna célula asome a través de una pared.'
        },
        {
            name: 'fade',
            type: 'number', default: 1.5, min: 0.01, precision: 2,
            title: 'Fade',
            description: 'En cuántas unidades las células se van achicando hasta desaparecer al acercarse a la habitación. Un borde duro delata la caja; con esto el hueco parece natural.'
        }
    ]
});

OrganicCells.attributes.add('background', {
    type: 'json',
    title: 'Fondo',
    description: 'Las MISMAS células, dibujadas por un segundo material BARATO cuando están lejos: mismo lugar y mismo radio, solo cambia el sombreado (todos los bloques caros apagados por uniform; mismo programa de shader, 2 draw calls). Como lo lejano es chico en pantalla, píxeles chicos por shader corto es lo que hace que corra en un teléfono flojo. Nada aparece ni desaparece en el traspaso.',
    schema: [
        {
            name: 'enabled',
            type: 'boolean', default: true,
            title: 'Cheap Far Path',
            description: 'Usar el camino barato para lo lejano. Apagado = una sola capa con todo el shader (1 draw call, más caro).'
        },
        {
            name: 'start',
            type: 'number', default: 9, min: 1, precision: 1,
            title: 'Background Start',
            description: 'A qué distancia de la cámara el sombreado pasa de detallado a barato. El traspaso ocurre en una banda alrededor de este valor. Cuanto más corto, más barato.'
        },
        {
            name: 'moteFraction',
            type: 'number', default: 0.35, min: 0, max: 1, precision: 2,
            title: 'Mote Fraction',
            description: 'Qué parte de TODAS las células son MOTAS: puntitos brillantes diminutos (partículas en suspensión). Casi no cuestan píxeles y llenan el aire de vida. Cambiarlo regenera el campo.'
        },
        {
            name: 'brightness',
            type: 'number', default: 1, min: 0, max: 2, precision: 2,
            title: 'Brightness',
            description: 'Brillo del camino barato respecto del detallado. Distinto de 1 se nota como un escalón en el traspaso; bajalo solo si querés hundir lo lejano en la niebla.'
        },
        {
            name: 'farSizeBoost',
            type: 'number', default: 0.6, min: 0, max: 2, precision: 2,
            title: 'Far Size Boost',
            description: 'Las células lejanas crecen con la distancia (1 = el doble al fondo). Compensa la perspectiva: el fondo se ve APRETADO con las mismas células, y como lo lejano va por el camino barato y es chico en pantalla, casi no cuesta. Es continuo en las dos capas: no hay salto en el traspaso.'
        }
    ]
});

OrganicCells.attributes.add('haze', {
    type: 'json',
    title: 'Neblina',
    description: 'FONDO PROCEDURAL: cúmulos de células desenfocadas pintados detrás de todo, UNA sola vez por píxel (como un skybox), con paralaje al moverse y deriva lenta. Es lo que hace que el ambiente se sienta lleno y saturado con pocas células de verdad: llenar el espacio vacío cuesta un pase de pantalla, no instancias. 1 draw call.',
    schema: [
        {
            name: 'enabled',
            type: 'boolean', default: false,
            title: 'Enabled',
            description: 'OJO: la neblina REEMPLAZA EL FONDO DE TU ESCENA. Es una caja opaca alrededor de la cámara que escribe profundidad, así que tapa el skybox (tiene que hacerlo: ella pasa a ser el fondo). Por eso viene apagada. Encendela solo si querés que el ambiente se vea lleno, y poné Color Far igual al fondo que tenías.'
        },
        {
            name: 'colorFar',
            type: 'rgb', default: [0.02, 0.06, 0.22],
            title: 'Color Far',
            description: 'Color de la neblina del lado opuesto a la luz. Conviene que coincida con Fog Color y con el clear color de la cámara.'
        },
        {
            name: 'colorLight',
            type: 'rgb', default: [0.10, 0.30, 0.62],
            title: 'Color Light',
            description: 'Color de la neblina mirando hacia la luz: el resplandor de la referencia.'
        },
        {
            name: 'density',
            type: 'number', default: 0.55, min: 0, max: 1, precision: 2,
            title: 'Density',
            description: 'Cuántos cúmulos borrosos hay en el fondo. 0 = solo el gradiente de luz (lo más barato: ~10 instrucciones por píxel).'
        },
        {
            name: 'scale',
            type: 'number', default: 4, min: 1, max: 16, precision: 1,
            title: 'Scale',
            description: 'Tamaño de los cúmulos: bajo = pocas manchas grandes, alto = muchas chicas.'
        },
        {
            name: 'brightness',
            type: 'number', default: 0.55, min: 0, max: 3, precision: 2,
            title: 'Brightness',
            description: 'Brillo de los cúmulos (toman el color del núcleo y la paleta de Cuadrantes).'
        },
        {
            name: 'detail',
            type: 'number', default: 0, min: 0, max: 1, precision: 2,
            title: 'Detail',
            description: 'Segunda octava de cúmulos más finos. Cuesta otro hash por píxel en TODA la pantalla: apagada por defecto, encendela solo en equipos con margen.'
        },
        {
            name: 'parallax',
            type: 'number', default: 0.12, min: 0, max: 1, precision: 2,
            title: 'Parallax',
            description: 'Cuánto se desplaza el fondo al mover la cámara. 0 = pegado al horizonte como un cielo; más = se siente un volumen alrededor.'
        },
        {
            name: 'drift',
            type: 'number', default: 0.04, min: 0, max: 1, precision: 2,
            title: 'Drift',
            description: 'Deriva lenta del fondo con el tiempo, aunque la cámara esté quieta.'
        }
    ]
});

OrganicCells.attributes.add('cell', {
    type: 'json',
    title: 'Célula',
    description: 'Cómo es cada célula: tamaño, membrana, núcleo, rugosidad, luz y meneo.',
    schema: [
        {
            name: 'cellRadius',
            type: 'number', default: 0.7, min: 0.01, precision: 2,
            title: 'Cell Radius',
            description: 'Radio medio de la célula en unidades de mundo. Es el control de coste más directo: el doble de radio son 4 veces los píxeles.'
        },
        {
            name: 'radiusVariation',
            type: 'number', default: 0.6, min: 0, max: 1, precision: 2,
            title: 'Radius Variation',
            description: 'Dispersión de tamaños (0 = todas iguales).'
        },
        {
            name: 'sizeBias',
            type: 'number', default: 0.45, min: 0, max: 1, precision: 2,
            title: 'Size Bias',
            description: 'Sesga el reparto de tamaños hacia lo CHICO: muchas células pequeñas y solo unas pocas grandes. Es el mando de rendimiento más honesto que hay: lo que cuesta son los píxeles, y una célula grande cerca de la cámara vale cientos de chicas.'
        },
        {
            name: 'translucency',
            type: 'number', default: 0.75, min: 0, max: 1, precision: 2,
            title: 'Translucency',
            description: 'Vidrio: el interior se vuelve transparente (deja ver el fondo) y solo los bordes, donde la membrana se ve de canto, quedan densos. 0 = tejido opaco de microscopio.'
        },
        {
            name: 'fresnel',
            type: 'number', default: 0.9, min: 0, max: 3, precision: 2,
            title: 'Fresnel',
            description: 'Brillo del borde de una esfera de vidrio (usa Edge Color). Sube con la inclinación de la superficie: es lo que dibuja la membrana como una pompa y no como un anillo pintado. 0 = apagado.'
        },
        {
            name: 'membraneColorA',
            type: 'rgb', default: [0.22, 0.50, 1.0],
            title: 'Membrane Color A',
            description: 'Color base 1. Solo se ve en la medida en que Color Strength de Cuadrantes sea menor que 1.'
        },
        {
            name: 'membraneColorB',
            type: 'rgb', default: [0.42, 0.82, 1.0],
            title: 'Membrane Color B',
            description: 'Color base 2. Cada célula mezcla A y B con su propio azar.'
        },
        {
            name: 'membraneWidth',
            type: 'number', default: 0.16, min: 0, max: 0.6, precision: 2,
            title: 'Membrane Width',
            description: 'Grosor del anillo oscuro del borde: la pared de la célula. Es LO que más acerca el resultado a una foto de microscopio.'
        },
        {
            name: 'membraneTint',
            type: 'rgb', default: [0.62, 0.80, 1.0],
            title: 'Membrane Tint',
            description: 'MULTIPLICA el color de la célula para pintar la pared. Gris = solo la oscurece; con un tinte cálido o frío la pared toma un color propio, que es lo que hace que se vea como material y no como sombra.'
        },
        {
            name: 'membraneHalo',
            type: 'number', default: 0.15, min: 0, max: 2, precision: 2,
            title: 'Membrane Halo',
            description: 'Banda CLARA justo por dentro de la pared. El contraste entre esa banda y el anillo oscuro es lo que hace que se lea como una célula al microscopio y no como una bola sombreada.'
        },
        {
            name: 'membraneVariation',
            type: 'number', default: 0.5, min: 0, max: 1, precision: 2,
            title: 'Membrane Variation',
            description: 'Cuánto varía el grosor de la pared entre una célula y otra.'
        },
        {
            name: 'edgeColor',
            type: 'rgb', default: [0.72, 0.90, 1.0],
            title: 'Edge Color',
            description: 'Color del filo húmedo, la línea clarita del borde exterior.'
        },
        {
            name: 'edgeGlow',
            type: 'number', default: 0.3, min: 0, max: 3, precision: 2,
            title: 'Edge Glow',
            description: 'Intensidad de ese filo (0 = apagado y se salta el cálculo).'
        },
        {
            name: 'nucleusTint',
            type: 'rgb', default: [0.85, 0.72, 0.95],
            title: 'Nucleus Tint',
            description: 'MULTIPLICA el color de la célula, no lo reemplaza: así el núcleo sigue el color del cuadrante en vez de pelearse con él. Valores bajos = núcleo más oscuro.'
        },
        {
            name: 'nucleusColor',
            type: 'rgb', default: [1.0, 0.32, 0.86],
            title: 'Nucleus Color',
            description: 'Color EMISIVO del núcleo (absoluto, no multiplica): un núcleo que brilla con luz propia, de otro color que la membrana.'
        },
        {
            name: 'nucleusGlow',
            type: 'number', default: 1.1, min: 0, max: 3, precision: 2,
            title: 'Nucleus Glow',
            description: 'Cuánto brilla el núcleo emisivo, con un halo suave alrededor (un bloom dentro de la célula). 0 = apagado y se salta el bloque; queda solo el núcleo oscuro de Nucleus Tint.'
        },
        {
            name: 'nucleusSize',
            type: 'number', default: 0.45, min: 0, max: 1.2, precision: 2,
            title: 'Nucleus Size',
            description: 'Tamaño de la mancha del núcleo (0 = sin núcleo, y además ahorra ALU en el fragment).'
        },
        {
            name: 'roughness',
            type: 'number', default: 0.5, min: 0, max: 1, precision: 2,
            title: 'Roughness',
            description: 'Rugosidad media: granulado de orgánulos y arruga fina del contorno.'
        },
        {
            name: 'roughnessVariation',
            type: 'number', default: 0.8, min: 0, max: 1, precision: 2,
            title: 'Roughness Variation',
            description: 'Cuánto difiere la rugosidad entre células. En 0 son todas iguales; en 1 conviven lisas y muy ásperas.'
        },
        {
            name: 'speckleAmount',
            type: 'number', default: 0.18, min: 0, max: 1, precision: 2,
            title: 'Speckle Amount',
            description: 'Cantidad de granos oscuros sobre la superficie (0 = apagado y se salta el bloque más caro del fragment).'
        },
        {
            name: 'speckleScale',
            type: 'number', default: 18, min: 2, max: 60, precision: 1,
            title: 'Speckle Scale',
            description: 'Tamaño del grano: más alto = puntos más chicos y más juntos.'
        },
        {
            name: 'specular',
            type: 'number', default: 1.2, min: 0, max: 2, precision: 2,
            title: 'Specular',
            description: 'Brillo húmedo. 0 = apagado y se salta el pow().'
        },
        {
            name: 'specularSize',
            type: 'number', default: 0.35, min: 0, max: 1, precision: 2,
            title: 'Specular Size',
            description: 'Tamaño del reflejo: 0 = punto duro de vidrio, 1 = mancha ancha y blanda.'
        },
        {
            name: 'ambient',
            type: 'number', default: 0.55, min: 0, max: 1, precision: 2,
            title: 'Ambient',
            description: 'Luz de relleno: cuánto se ve la cara en sombra. Alto = aspecto translúcido de tejido iluminado por detrás.'
        },
        {
            name: 'lightDirection',
            type: 'vec3', default: [-0.4, -1, -0.35],
            title: 'Light Direction',
            description: 'Dirección en la que VIAJA la luz (como una directional). Se normaliza sola. Es una luz falsa propia: el shader no lee las luces de la escena.'
        },
        {
            name: 'wobbleAmount',
            type: 'number', default: 0.18, min: 0, max: 0.45, precision: 2,
            title: 'Wobble Amount',
            description: 'Gelatina: cuánto se estira/aplasta la célula entera. Ojo: valores altos agrandan el quad y cuestan fragmentos.'
        },
        {
            name: 'wobbleSpeed',
            type: 'number', default: 0.6, min: 0, max: 5, precision: 2,
            title: 'Wobble Speed',
            description: 'Velocidad del meneo gelatinoso.'
        },
        {
            name: 'rippleAmount',
            type: 'number', default: 0.07, min: 0, max: 0.3, precision: 2,
            title: 'Ripple Amount',
            description: 'Ondas del contorno de la membrana (0 = círculo perfecto y se salta el cálculo).'
        },
        {
            name: 'rippleDetail',
            type: 'number', default: 0.4, min: 0, max: 1, precision: 2,
            title: 'Ripple Detail',
            description: 'Forma del contorno: 0 = 3 lóbulos anchos (ameba), 1 = 5 lóbulos finos. La arruga más fina la agrega Roughness por su cuenta.'
        }
    ]
});


/* =========================================================
   SHADERS
   ---------------------------------------------------------
   Datos por instancia (48 bytes, 3 vec4 interleaved):
     aCellA = (centro.xyz, radio)
     aCellB = (semilla de fase, wobble relativo, velocidad relativa, rugosidad)
     aCellC = (tono del cuadrante, claridad del cuadrante, semilla de granos,
               grosor de membrana relativo)
   El vértice del quad llega en aPosition.xy = (-1,-1)..(1,1).

   Varyings (5 vec4). La matriz de gelatina es SIMÉTRICA, así que con 3 floats
   alcanza y el cuarto lleva la semilla de granos:
     vDeform = (m00, m01=m10, m11, semilla granos)
     vShape  = (p.x, p.y, fade, rugosidad)
     vPhase  = (cos fase, sin fase, núcleo.x, núcleo.y)
     vLight  = (luz en vista .xyz, profundidad del núcleo)
     vSkin   = (color de la célula .rgb, grosor de membrana)
   ========================================================= */

OrganicCells._vertexGLSL = [
    'attribute vec3 aPosition;',
    'attribute vec4 aCellA;',
    'attribute vec4 aCellB;',
    'attribute vec4 aCellC;',
    '',
    'uniform mat4 matrix_view;',
    'uniform mat4 matrix_projection;',
    'uniform vec3 view_position;',
    '',
    'uniform float uTime;',
    'uniform float uRegion;',
    'uniform float uWrap;',
    'uniform float uFar;',
    'uniform float uNear;',
    'uniform float uWobble;',
    'uniform float uRipple;',
    'uniform vec3  uLightDir;',
    '',
    /* HABITACIONES: cajas alineadas a los ejes donde no se dibuja nada. */
    'uniform int  uZoneCount;',
    'uniform vec4 uZoneCenter[' + OrganicCells.MAX_ROOMS + '];',
    'uniform vec4 uZoneHalf[' + OrganicCells.MAX_ROOMS + '];',
    '',
    /* PROFUNDIDAD DE CAMPO por instancia. */
    'uniform float uFocusAmount;',
    'uniform float uFocusDist;',
    'uniform float uFocusRange;',
    'uniform float uFocusFalloff;',
    'uniform float uShrinkFar;',
    /* TRASPASO ENTRE CAPAS (ver abajo) */
    'uniform float uBandLo;',
    'uniform float uBandHi;',
    'uniform float uLayerFar;',
    'uniform float uDepthBias;',
    'uniform float uFarBoost;',
    'uniform vec3  uHazeFar;',
    'uniform vec3  uHazeLight;',
    '',
    'uniform vec3  uColorA;',
    'uniform vec3  uColorB;',
    'uniform float uQuadStrength;',
    'uniform float uHueRange;',
    'uniform float uHueOffset;',
    'uniform float uSaturation;',
    'uniform float uShadeRange;',
    'uniform float uMembraneWidth;',
    '',
    'varying vec4 vDeform;',
    'varying vec4 vShape;',
    'varying vec4 vPhase;',
    'varying vec4 vLight;',
    'varying vec4 vSkin;',
    'varying vec4 vFocus;',
    '',
    /* tono -> rgb (HSV con V=1), sin ramas: 1 fract, 1 abs, 1 clamp */
    'vec3 hue2rgb(float h) {',
    '    vec3 k = fract(vec3(h) + vec3(0.0, 0.66666667, 0.33333333));',
    '    return clamp(abs(k * 6.0 - 3.0) - 1.0, 0.0, 1.0);',
    '}',
    '',
    'void main(void) {',
    /* CAMPO INFINITO: lleva el centro al bloque más cercano a la cámara. Sin
       ramas y sin nada de CPU: el mismo puñado de instancias cubre espacio
       ilimitado en las 3 direcciones. */
    '    vec3 raw = aCellA.xyz - view_position;',
    '    vec3 wrapped = raw - uRegion * floor(raw / uRegion + 0.5);',
    '    vec3 rel = mix(raw, wrapped, uWrap);',
    '    float dist = length(rel);',
    '',
    /* Desvanecido lejano (hacia la niebla) y cercano (para no tapar la pantalla
       al atravesar una célula). */
    /* Fundido CERCANO relativo al RADIO: una célula grande al lado de la cámara
       no tiene por qué desaparecer. Se desvanece recién al ENTRAR en ella (la
       cámara más cerca que su radio); uNear es solo un piso absoluto para el
       near clip. Con una distancia fija, las grandes se apagaban antes de
       tocarlas. */
    '    float nearD = max(uNear, aCellA.w * 1.05);',
    '    float fadeFar = 1.0 - smoothstep(uFar * 0.7, uFar, dist);',
    '    float fade = fadeFar * smoothstep(nearD * 0.45, nearD, dist);',
    '',
    /* TRASPASO ENTRE CAPAS: la MISMA célula la dibujan dos materiales (detalle
       cerca, camino barato lejos), y acá se reparte el peso en una banda
       alrededor de Background Start, de forma complementaria. Es la misma
       instancia, en el mismo lugar y con el mismo radio: no aparece, no
       desaparece y no cambia de tamaño; solo cambia el sombreado. */
    '    float lw = smoothstep(uBandLo, uBandHi, dist);',
    '    float layerW = mix(1.0 - lw, lw, uLayerFar);',
    /* En los modos con mezcla el peso va al alpha/color (las dos se funden).
       En los modos OPACOS no se puede fundir: el detalle se ACHICA encima del
       fondo, que ya está entero debajo desde el inicio de la banda (con un
       pelo de sesgo de profundidad a favor del detalle). */
    '    float layerShrink = mix(layerW, step(uBandLo, dist), uLayerFar);',
    '    float vis = mix(layerW, layerShrink, uShrinkFar);',
    '    fade *= mix(layerW, 1.0, uShrinkFar);',
    '    float alive = step(0.002, fade) * step(0.002, vis);',
    /* En los modos OPACOS, una célula que se funde con la niebla sigue siendo
       un disco opaco que tapa lo de atrás. Ahí además se ACHICA con el fundido
       (lejano y cercano) y con su peso de capa: un disco chico y del color de
       la niebla ya no tapa nada. */
    '    float shrink = mix(1.0, fade * layerShrink, uShrinkFar);',
    '',
    /* HABITACIONES: se prueba la posición YA ENVUELTA, que es donde la célula
       se dibuja de verdad. Por eso los huecos quedan quietos en el mundo aunque
       el campo sea infinito y las células estén saltando de copia en copia.
       'clear' achica el radio en vez de matar la célula de golpe: en el borde
       de la habitación las células se van adelgazando y el hueco no delata la
       caja. Con clear = 0 el quad colapsa a un punto: cero fragmentos. */
    '    vec3 world = view_position + rel;',
    /* EMPUJE LEJANO: la célula crece con la distancia para compensar la
       perspectiva y que el fondo se vea apretado. Es el mismo uniform en las
       dos capas, así que es continuo en el traspaso. Se calcula acá porque las
       habitaciones tienen que ver el radio AGRANDADO. */
    '    float boost = 1.0 + uFarBoost * smoothstep(0.0, uFar, dist);',
    '    float clear = 1.0;',
    '    for (int i = 0; i < ' + OrganicCells.MAX_ROOMS + '; i++) {',
    '        if (i >= uZoneCount) break;',
    /* la caja se agranda con el radio extra que el boost PUEDE llegar a
       agregar (uFarBoost, el peor caso), NO con el boost de este frame: si
       dependiera de la distancia, el hueco de la habitación cambiaría de
       tamaño al moverse y las células del borde aparecerían y desaparecerían
       mientras caminás. Constante en el mundo = hueco quieto. */
    '        vec3 dv = abs(world - uZoneCenter[i].xyz) - uZoneHalf[i].xyz - vec3(aCellA.w * uFarBoost);',
    '        float outside = max(max(dv.x, dv.y), dv.z);',
    '        clear = min(clear, smoothstep(0.0, max(uZoneHalf[i].w, 0.001), outside));',
    '    }',
    '',
    /* PROFUNDIDAD DE CAMPO: 0 dentro de la franja de foco, 1 del todo borroso. */
    '    float coc = clamp((abs(dist - uFocusDist) - uFocusRange) /',
    '                      max(uFocusFalloff, 0.001), 0.0, 1.0) * uFocusAmount;',
    /* color de la neblina EN LA DIRECCIÓN de esta célula: en los modos opacos
       la célula lejana se funde hacia eso y no hacia un Fog Color plano, que
       sobre el gradiente de la neblina se veía como puntos oscuros. */
    '    float hl = dot(rel / max(dist, 0.0001), uLightDir) * 0.5 + 0.5;',
    '    vFocus = vec4(coc, mix(uHazeFar, uHazeLight, hl * hl));',
    '',
    /* Fase propia de cada célula. Los múltiplos de ph son ENTEROS: por eso el
       reloj puede reiniciarse sin salto (ver PHASE_PERIOD). */
    '    float ph = aCellB.x * 6.2831853 + uTime * aCellB.z;',
    '    float c1 = cos(ph);',
    '    float s1 = sin(ph);',
    '    float s2 = sin(2.0 * ph + 1.7);',
    '    float s3 = sin(3.0 * ph + 4.1);',
    '',
    /* GELATINA: matriz 2x2 SIMÉTRICA = estira en un eje y aplasta en el otro,
       con el eje girando en el tiempo. Es 1 mat2 por instancia, no por píxel. */
    '    float amp = min(aCellB.y * uWobble, 0.45);',
    '    float d = amp * s1;',
    '    float o = amp * 0.6 * s2;',
    '    vDeform = vec4(1.0 + d, o, 1.0 - d, aCellC.z);',
    '',
    /* El quad se agranda lo JUSTO para que la elipse deformada más el rizado
       entren enteros. Ojo: la matriz de gelatina NO es diagonal, así que su
       semieje máximo no es 1/(1-amp) — con la cizalla puede llegar a
       1/(1-1.166*amp) y la silueta se saldría por el lado plano del quad,
       cortando el anillo de la membrana con una cuerda recta.
       Estas son las semi-extensiones EXACTAS por eje (las normas de las filas
       de M^-1). Además son ANISÓTROPAS: el quad queda un 35-48% más chico que
       con una cota redonda, o sea bastantes menos fragmentos. */
    '    float det = max(1.0 - d * d - o * o, 0.05);',
    '    vec2 expand = (1.0 / max(0.05, 1.0 - uRipple)) *',
    '                  vec2(sqrt(o * o + (1.0 - d) * (1.0 - d)),',
    '                       sqrt(o * o + (1.0 + d) * (1.0 + d))) / det;',
    '    vec2 p = aPosition.xy * expand;',
    '',
    /* NÚCLEO EN 3D DE VERDAD: su desplazamiento dentro de la célula es un
       vector de MUNDO que se pasa a espacio de vista. Así, al rodear la célula,
       el núcleo gira con ella y se hunde hacia atrás (vLight.w) en vez de
       quedarse pegado a la cámara. */
    '    mat3 viewRot = mat3(matrix_view);',
    '    vec3 nucView = viewRot * (vec3(s3, s2, c1) * 0.22);',
    '',
    '    vShape = vec4(p, fade, aCellB.w);',
    '    vPhase = vec4(c1, s1, nucView.xy);',
    /* La luz pasa a espacio de VISTA acá (4 vértices por célula) y no en el
       fragment: la normal del impostor ya vive en espacio de vista. */
    '    vLight = vec4(viewRot * uLightDir, nucView.z);',
    '',
    /* COLOR: el tono y la claridad vienen HORNEADOS del campo de cuadrantes
       (ruido suave calculado en CPU), y un azar propio de cada célula rompe la
       uniformidad dentro del mismo cuadrante. */
    '    float jitter = fract(aCellB.x * 7.31);',
    '    vec3 base = mix(uColorA, uColorB, jitter);',
    '    vec3 quadCol = mix(vec3(1.0), hue2rgb(fract(uHueOffset + aCellC.x * uHueRange)), uSaturation);',
    /* El color del cuadrante cambia el TONO pero conserva el BRILLO del color
       base: si se mezclara a pelo contra un tono puro, las células se irían a
       pasteles planos y perderían el aspecto de tejido. */
    '    float lum = dot(base, vec3(0.32, 0.52, 0.16));',
    '    vec3 skin = mix(base, quadCol * lum * 1.7, uQuadStrength);',
    '    skin *= (1.0 + (aCellC.y - 0.5) * uShadeRange) * (0.9 + 0.2 * fract(aCellB.x * 13.7));',
    '    vSkin = vec4(skin, uMembraneWidth * aCellC.w);',
    '',
    /* BILLBOARD: el desplazamiento se hace en espacio de vista, así el quad
       siempre mira a la cámara (incluso si la cámara rota sobre su eje).
       Si la célula quedó fuera de rango, alive = 0 -> los 4 vértices caen en el
       mismo punto -> triángulo degenerado -> 0 fragmentos. */
    '    vec4 viewPos = matrix_view * vec4(world, 1.0);',
    '    viewPos.xy += p * (aCellA.w * boost * alive * clear * shrink);',
    /* la capa de detalle va un pelo más cerca de la cámara que la de fondo:
       en modo opaco las dos son coplanares y sin esto se pelearían el z. Es
       una constante chica y NO escala con el radio: escalado, una célula
       grande pegada a la cámara podía cruzar el plano de la cámara y
       desaparecer entera. En los modos con mezcla no hay z que pelear y vale 0. */
    '    viewPos.z += uDepthBias;',
    '    gl_Position = matrix_projection * viewPos;',
    '}'
].join('\n');

OrganicCells._fragmentGLSL = [
    'uniform mat4  matrix_view;',
    '',
    'uniform vec3  uNucleusTint;',
    'uniform vec3  uNucleusColor;',
    'uniform vec3  uMembraneTint;',
    'uniform vec3  uEdgeColor;',
    'uniform vec3  uFogColor;',
    'uniform float uAmbient;',
    'uniform float uTranslucency;',
    'uniform float uNucleusGlow;',
    'uniform float uFresnel;',
    'uniform float uSpecPow;',
    'uniform float uBrightness;',
    'uniform float uMembraneHalo;',
    'uniform float uEdgeGlow;',
    'uniform float uSpecular;',
    'uniform float uNucleusSize;',
    'uniform float uRipple;',
    'uniform float uRippleDetail;',
    'uniform float uSpeckle;',
    'uniform float uSpeckleScale;',
    'uniform float uMottle;',
    'uniform float uFringe;',
    'uniform float uBlur;',
    'uniform float uOpacity;',
    'uniform float uEdge;',
    'uniform float uUseAlpha;',
    'uniform float uMaxR2;',
    'uniform float uHazeOn;',
    '',
    'varying vec4 vDeform;',
    'varying vec4 vShape;',
    'varying vec4 vPhase;',
    'varying vec4 vLight;',
    'varying vec4 vSkin;',
    'varying vec4 vFocus;',
    '',
    'float hash13(vec3 p) {',
    '    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);',
    '}',
    '',
    'void main(void) {',
    '    vec2 p = vShape.xy;',
    /* q = coordenada dentro de la célula YA deformada por la gelatina (la
       matriz es simétrica: m01 y m10 son el mismo float). */
    '    vec2 q = vec2(vDeform.x * p.x + vDeform.y * p.y,',
    '                  vDeform.y * p.x + vDeform.z * p.y);',
    '    float r2 = dot(q, q);',
    /* Descarte temprano: las esquinas del quad se van antes que nada. uMaxR2 es
       el radio máximo que el rizado puede empujar hacia afuera: con Ripple 0
       vale 1 y este test YA es la silueta exacta. */
    '    if (r2 > uMaxR2) discard;',
    '',
    '    float rough = vShape.w;',
    /* coc = 0 enfocada, 1 del todo borrosa. 'sharp' es su complemento y va
       apagando todo lo que en una foto desaparece al desenfocarse: el grano,
       el contraste del núcleo, la pared y la franja cromática. */
    '    float coc = vFocus.x;',
    '    float sharp = 1.0 - coc;',
    '    float r = sqrt(r2);',
    '',
    /* CONTORNO DE AMEBA: armónicos 3, 5 y 7 del ángulo por identidades de
       ángulo múltiple — sin atan y sin un solo seno, puros productos. El 7º es
       la arruga fina y entra según la rugosidad de ESTA célula. Como
       |lobes| <= 1 exacto, el agrandado del quad del vertex shader es exacto. */
    '    if (uRipple > 0.0) {',
    '        vec2 u = q / max(r, 0.00001);',
    '        float c2 = u.x * u.x - u.y * u.y;',
    '        float s2 = 2.0 * u.x * u.y;',
    '        float c3 = u.x * c2 - u.y * s2;',
    '        float s3 = u.x * s2 + u.y * c2;',
    '        float c5 = c2 * c3 - s2 * s3;',
    '        float s5 = c2 * s3 + s2 * c3;',
    '        float c7 = c2 * c5 - s2 * s5;',
    '        float s7 = c2 * s5 + s2 * c5;',
    '        float cp = vPhase.x;',
    '        float sp = vPhase.y;',
    '        float cp2 = cp * cp - sp * sp;',
    '        float sp2 = 2.0 * cp * sp;',
    '        float wide = mix(c3 * cp + s3 * sp, c5 * cp2 + s5 * sp2, uRippleDetail);',
    '        float fine = c7 * cp2 + s7 * sp2;',
    /* La arruga fina SUMA un poco encima de los lóbulos anchos; no los
       reemplaza. Si se reemplazaran, la célula se volvería un polígono
       regular de 7 lados en vez de una silueta orgánica. Los pesos suman
       <= 1, que es lo que mantiene exacto el agrandado del quad. */
    '        r *= 1.0 - uRipple * (wide * (1.0 - 0.3 * rough) + fine * (0.22 * rough));',
    '    }',
    '    if (r > 1.0) discard;',
    '',
    /* SPHERE IMPOSTOR: la tercera componente reconstruye el volumen. La normal
       queda en espacio de VISTA, que es justo donde llega la luz. */
    '    float z = sqrt(max(1.0 - r * r, 0.0));',
    '    vec3 n = normalize(vec3(q, z + 0.001));',
    '',
    /* Half-lambert al cuadrado: la luz "envuelve" la célula como un material
       traslúcido, sin terminador duro. NORMALIZADA: uAmbient es el piso y el
       techo siempre es 1, así que subir Ambient APLANA la luz en vez de
       quemarla. Un tejido al microscopio está casi plano; el volumen lo dan la
       pared y el núcleo, no un brillo lateral. */
    '    float wrapL = dot(n, vLight.xyz) * 0.5 + 0.5;',
    '    wrapL *= wrapL;',
    '    float lit = uAmbient + (1.0 - uAmbient) * wrapL;',
    '',
    '    vec3 skin = vSkin.rgb;',
    '    vec3 col = skin * lit;',
    '',
    /* VIDRIO: la membrana se ve de canto en el borde (densa) y de frente en el
       centro (transparente). fres = 1 - z es exactamente esa inclinación. El
       interior se funde con la niebla —que en modo aditivo es negro, o sea
       transparente de verdad— y solo el borde conserva el color. */
    '    float fres = 1.0 - z;',
    '    float fres2 = fres * fres;',
    '    col = mix(col, uFogColor, uTranslucency * (1.0 - fres2));',
    '',
    /* NÚCLEO: mancha grande y difusa, TEÑIDA con el color de la propia célula
       (uNucleusTint multiplica, no reemplaza), y más apagada cuando el núcleo
       cae del lado de atrás. */
    '    if (uNucleusSize > 0.0) {',
    '        float nd = length(q - vPhase.zw);',
    '        float depth = 0.4 + 0.6 * smoothstep(-0.4, 0.4, vLight.w);',
    /* desenfocado: el núcleo se difumina y pierde contraste, no se recorta */
    '        float soft = mix(0.55, 0.1, coc);',
    '        float nuc = (1.0 - smoothstep(uNucleusSize * soft, uNucleusSize, nd)) *',
    '                    depth * mix(0.45, 1.0, sharp);',
    '        col = mix(col, skin * uNucleusTint * lit, nuc);',
    '    }',
    '',
    /* NÚCLEO EMISIVO: luz propia de otro color, con un halo ancho (un bloom
       dentro de la célula) y un centro caliente que tira a blanco. Se SUMA, no
       se mezcla: por eso atraviesa la translucidez y brilla en modo aditivo. */
    '    if (uNucleusGlow > 0.0 && uNucleusSize > 0.0) {',
    '        float gd = length(q - vPhase.zw);',
    '        float gdepth = 0.35 + 0.65 * smoothstep(-0.4, 0.4, vLight.w);',
    '        float core = 1.0 - smoothstep(0.0, uNucleusSize * 0.75, gd);',
    '        float halo = 1.0 - smoothstep(0.0, uNucleusSize * 2.4, gd);',
    '        halo *= halo;',
    '        col += (uNucleusColor * (core + halo * 0.55) + vec3(core * core * core * 0.6)) *',
    '               (uNucleusGlow * gdepth * mix(0.6, 1.0, sharp));',
    '    }',
    '',
    /* CITOPLASMA. Todo lo de la superficie se calcula sobre la normal en
       espacio de MUNDO (la del impostor vuelve a mundo con la traspuesta de la
       vista), así que la textura está PEGADA a la célula: al rodearla gira con
       ella en vez de nadar por la pantalla. */
    '    if (uSpeckle > 0.0 || uMottle > 0.0) {',
    '        vec3 nw = n * mat3(matrix_view);',
    '        float sd = vDeform.w;',
    '',
    /* MOTEADO: dos senos cruzados sobre direcciones oblicuas. Con una red de
       hash (fract/floor) quedaba un MOSAICO de cuadraditos visible, porque las
       caras de los cubos se notan; esto es continuo y no tiene ejes. */
    '        if (uMottle > 0.0) {',
    '            vec3 mm = nw * (uSpeckleScale * 0.3) + vec3(sd * 11.1, sd * 23.3, sd * 37.7);',
    '            float mott = sin(dot(mm, vec3(1.0, 0.7, -0.4))) +',
    '                         0.6 * sin(dot(mm, vec3(-0.3, 1.1, 0.8)) * 2.1);',
    '            col *= 1.0 + mott * (0.22 * uMottle * sharp);',
    '        }',
    '',
    /* GRANOS: puntos discretos de tamaño variable (en la foto no son todos
       iguales) y más densos hacia el centro, porque los orgánulos no se
       amontonan contra la pared. El corrimiento dentro de la celda tiene tope
       porque el grano no puede asomar de su celda: se compara contra dot(fp,fp),
       así que el radio ESPACIAL del punto es sqrt(rad) = 0.332 en el tamaño
       máximo, y 0.5 - 0.332 = 0.168 por lado, o sea el factor 0.33. Con más,
       los granos grandes se cortan contra el borde con un plano recto. */
    '        if (uSpeckle > 0.0) {',
    '            vec3 sp = nw * uSpeckleScale + vec3(sd * 17.3, sd * 29.7, sd * 43.1);',
    '            vec3 ip = floor(sp);',
    '            float h = hash13(ip);',
    '            vec3 fp = fract(sp) - 0.5 - (fract(h * vec3(13.7, 27.3, 41.9)) - 0.5) * 0.33;',
    '            float rad = mix(0.03, 0.11, fract(h * 7.7));',
    '            float grain = (1.0 - smoothstep(rad * 0.3, rad, dot(fp, fp))) *',
    '                          step(1.0 - uSpeckle * (0.3 + 0.7 * rough), h) *',
    '                          (1.0 - smoothstep(0.35, 1.0, r)) * sharp;',
    '            col *= 1.0 - grain * (0.25 + 0.5 * rough);',
    '        }',
    '    }',
    '',
    /* PARED DE LA CÉLULA. Lo que la hace leer como célula de microscopio no es
       solo el anillo oscuro del borde: es el CONTRASTE entre ese anillo y una
       banda CLARA justo por dentro. Se pintan las dos, con el grosor propio de
       cada célula (vSkin.w). */
    /* 't' es la distancia al borde MEDIDA EN GROSORES DE PARED. Calcularla una
       vez deja las tres bandas (pared, halo y filo) con bordes constantes, que
       el compilador pliega: 1 división por píxel en vez de 3. Es exactamente la
       misma curva que antes. */
    '    float t = (1.0 - r) / max(vSkin.w, 0.0001);',
    '    float ring = 1.0 - smoothstep(0.2, 1.0, t);',
    '    if (uMembraneHalo > 0.0) {',
    '        float halo = (1.0 - smoothstep(1.15, 2.6, t)) * (1.0 - ring);',
    '        col *= 1.0 + halo * uMembraneHalo * mix(0.4, 1.0, sharp);',
    '    }',
    '    vec3 wall = skin * uMembraneTint * (0.55 + 0.45 * lit);',
    /* FRANJA CROMÁTICA: el rojo y el azul de la pared caen a radios apenas
       distintos, como en un objetivo real. Se desvanece con el desenfoque
       porque una imagen borrosa no tiene bordes donde separar los colores. */
    '    vec3 ringRGB = vec3(ring);',
    '    if (uFringe > 0.0) {',
    /* fr esta en GROSORES DE PARED, así que el corrimiento real en radio es
       fr * vSkin.w: sin tope, una pared gruesa lo escala hasta pintar de azul
       medio interior de la célula. Una aberración de objetivo es un corrimiento
       FIJO, así que se acota a un 8% del radio (con los valores por defecto,
       0.12 x 0.22 = 2.6%, el tope ni se toca). */
    '        float fr = min(uFringe * sharp, 0.08 / max(vSkin.w, 0.0001));',
    '        ringRGB.r = 1.0 - smoothstep(0.2, 1.0, t + fr);',
    '        ringRGB.b = 1.0 - smoothstep(0.2, 1.0, t - fr);',
    '    }',
    '    col = mix(col, wall, ringRGB * mix(1.0, 0.5, coc));',
    '',
    /* FRESNEL: el brillo del borde de una pompa de vidrio, con la inclinación
       al cubo. Va DESPUÉS de la pared: la pared reemplaza el color con su
       propio tinte, y si el fresnel se sumara antes lo borraría justo en el
       borde, donde es máximo. */
    '    if (uFresnel > 0.0) {',
    '        col += uEdgeColor * (fres2 * fres * uFresnel);',
    '    }',
    '',
    /* FILO HÚMEDO: la línea clarita del borde de afuera. */
    '    if (uEdgeGlow > 0.0) {',
    '        col += uEdgeColor * ((1.0 - smoothstep(0.0, 0.45, t)) * uEdgeGlow * sharp);',
    '    }',
    /* El half-vector se normaliza A MANO: luz + vista da el vector NULO cuando
       la cámara mira justo hacia donde apunta la luz (contraluz exacto), y ahí
       normalize() devuelve NaN y ensucia la célula entera. Con el guard, en ese
       caso el brillo se apaga, que es lo correcto. El exponente 24 sale de 5
       multiplicaciones en vez de un pow(). */
    '    if (uSpecular > 0.0) {',
    '        vec3 hs = vLight.xyz + vec3(0.0, 0.0, 1.0);',
    '        float sp0 = max(dot(n, hs) * inversesqrt(max(dot(hs, hs), 1e-8)), 0.0);',
    '        col += vec3(pow(sp0, uSpecPow) * uSpecular);',
    '    }',
    '',
    /* Profundidad atmosférica: lo lejano se funde con la niebla ANTES de que el
       wrap lo haga desaparecer. Por eso no hay popping ni en modo opaco. */
    '    col = mix(mix(uFogColor, vFocus.yzw, uHazeOn), col * uBrightness, vShape.z);',
    '',
    /* En los modos con alpha, la célula desenfocada además se deshilacha por
       el borde: es lo mas parecido a un bokeh que se puede hacer sin un pase
       aparte. En opaco puro el alpha no se usa y el desenfoque queda solo en
       el detalle interno. */
    '    float edgeW = uEdge + coc * uBlur;',
    '    float a = (1.0 - smoothstep(1.0 - edgeW, 1.0, r)) * uOpacity * vShape.z;',
    '    gl_FragColor = vec4(col, mix(1.0, a, uUseAlpha));',
    '}'
].join('\n');

OrganicCells._vertexWGSL = [
    'attribute aPosition: vec3f;',
    'attribute aCellA: vec4f;',
    'attribute aCellB: vec4f;',
    'attribute aCellC: vec4f;',
    '',
    'uniform matrix_view: mat4x4f;',
    'uniform matrix_projection: mat4x4f;',
    'uniform view_position: vec3f;',
    '',
    'uniform uTime: f32;',
    'uniform uRegion: f32;',
    'uniform uWrap: f32;',
    'uniform uFar: f32;',
    'uniform uNear: f32;',
    'uniform uWobble: f32;',
    'uniform uRipple: f32;',
    'uniform uLightDir: vec3f;',
    '',
    'uniform uZoneCount: i32;',
    'uniform uZoneCenter: array<vec4f, ' + OrganicCells.MAX_ROOMS + '>;',
    'uniform uZoneHalf: array<vec4f, ' + OrganicCells.MAX_ROOMS + '>;',
    '',
    'uniform uFocusAmount: f32;',
    'uniform uFocusDist: f32;',
    'uniform uFocusRange: f32;',
    'uniform uFocusFalloff: f32;',
    'uniform uShrinkFar: f32;',
    'uniform uBandLo: f32;',
    'uniform uBandHi: f32;',
    'uniform uLayerFar: f32;',
    'uniform uDepthBias: f32;',
    'uniform uFarBoost: f32;',
    'uniform uHazeFar: vec3f;',
    'uniform uHazeLight: vec3f;',
    '',
    'uniform uColorA: vec3f;',
    'uniform uColorB: vec3f;',
    'uniform uQuadStrength: f32;',
    'uniform uHueRange: f32;',
    'uniform uHueOffset: f32;',
    'uniform uSaturation: f32;',
    'uniform uShadeRange: f32;',
    'uniform uMembraneWidth: f32;',
    '',
    'varying vDeform: vec4f;',
    'varying vShape: vec4f;',
    'varying vPhase: vec4f;',
    'varying vLight: vec4f;',
    'varying vSkin: vec4f;',
    'varying vFocus: vec4f;',
    '',
    'fn hue2rgb(h: f32) -> vec3f {',
    '    let k: vec3f = fract(vec3f(h) + vec3f(0.0, 0.66666667, 0.33333333));',
    '    return clamp(abs(k * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));',
    '}',
    '',
    '@vertex',
    'fn vertexMain(input: VertexInput) -> VertexOutput {',
    '    var output: VertexOutput;',
    '',
    '    let raw: vec3f = input.aCellA.xyz - uniform.view_position;',
    '    let wrapped: vec3f = raw - uniform.uRegion * floor(raw / uniform.uRegion + 0.5);',
    '    let rel: vec3f = mix(raw, wrapped, vec3f(uniform.uWrap));',
    '    let dist: f32 = length(rel);',
    '',
    '    let nearD: f32 = max(uniform.uNear, input.aCellA.w * 1.05);',
    '    let fadeFar: f32 = 1.0 - smoothstep(uniform.uFar * 0.7, uniform.uFar, dist);',
    '    var fade: f32 = fadeFar * smoothstep(nearD * 0.45, nearD, dist);',
    '',
    '    let lw: f32 = smoothstep(uniform.uBandLo, uniform.uBandHi, dist);',
    '    let layerW: f32 = mix(1.0 - lw, lw, uniform.uLayerFar);',
    '    let layerShrink: f32 = mix(layerW, step(uniform.uBandLo, dist), uniform.uLayerFar);',
    '    let vis: f32 = mix(layerW, layerShrink, uniform.uShrinkFar);',
    '    fade = fade * mix(layerW, 1.0, uniform.uShrinkFar);',
    '    let alive: f32 = step(0.002, fade) * step(0.002, vis);',
    '    let shrink: f32 = mix(1.0, fade * layerShrink, uniform.uShrinkFar);',
    '',
    '    let world: vec3f = uniform.view_position + rel;',
    '    let boost: f32 = 1.0 + uniform.uFarBoost * smoothstep(0.0, uniform.uFar, dist);',
    '    var clear: f32 = 1.0;',
    '    for (var i: i32 = 0; i < ' + OrganicCells.MAX_ROOMS + '; i = i + 1) {',
    '        if (i >= uniform.uZoneCount) { break; }',
    '        let dv: vec3f = abs(world - uniform.uZoneCenter[i].xyz) - uniform.uZoneHalf[i].xyz - vec3f(input.aCellA.w * uniform.uFarBoost);',
    '        let outside: f32 = max(max(dv.x, dv.y), dv.z);',
    '        clear = min(clear, smoothstep(0.0, max(uniform.uZoneHalf[i].w, 0.001), outside));',
    '    }',
    '',
    '    let coc: f32 = clamp((abs(dist - uniform.uFocusDist) - uniform.uFocusRange) /',
    '                         max(uniform.uFocusFalloff, 0.001), 0.0, 1.0) * uniform.uFocusAmount;',
    '    let hl: f32 = dot(rel / max(dist, 0.0001), uniform.uLightDir) * 0.5 + 0.5;',
    '    output.vFocus = vec4f(coc, mix(uniform.uHazeFar, uniform.uHazeLight, vec3f(hl * hl)));',
    '',
    '    let ph: f32 = input.aCellB.x * 6.2831853 + uniform.uTime * input.aCellB.z;',
    '    let c1: f32 = cos(ph);',
    '    let s1: f32 = sin(ph);',
    '    let s2: f32 = sin(2.0 * ph + 1.7);',
    '    let s3: f32 = sin(3.0 * ph + 4.1);',
    '',
    '    let amp: f32 = min(input.aCellB.y * uniform.uWobble, 0.45);',
    '    let d: f32 = amp * s1;',
    '    let o: f32 = amp * 0.6 * s2;',
    '    output.vDeform = vec4f(1.0 + d, o, 1.0 - d, input.aCellC.z);',
    '',
    '    let det: f32 = max(1.0 - d * d - o * o, 0.05);',
    '    let expand: vec2f = (1.0 / max(0.05, 1.0 - uniform.uRipple)) *',
    '                        vec2f(sqrt(o * o + (1.0 - d) * (1.0 - d)),',
    '                              sqrt(o * o + (1.0 + d) * (1.0 + d))) / det;',
    '    let p: vec2f = input.aPosition.xy * expand;',
    '',
    '    let v: mat4x4f = uniform.matrix_view;',
    '    let v3: mat3x3f = mat3x3f(v[0].xyz, v[1].xyz, v[2].xyz);',
    '    let nucView: vec3f = v3 * (vec3f(s3, s2, c1) * 0.22);',
    '',
    '    output.vShape = vec4f(p.x, p.y, fade, input.aCellB.w);',
    '    output.vPhase = vec4f(c1, s1, nucView.x, nucView.y);',
    '    output.vLight = vec4f(v3 * uniform.uLightDir, nucView.z);',
    '',
    '    let jitter: f32 = fract(input.aCellB.x * 7.31);',
    '    let base: vec3f = mix(uniform.uColorA, uniform.uColorB, vec3f(jitter));',
    '    let hue: f32 = fract(uniform.uHueOffset + input.aCellC.x * uniform.uHueRange);',
    '    let quadCol: vec3f = mix(vec3f(1.0), hue2rgb(hue), vec3f(uniform.uSaturation));',
    '    let lum: f32 = dot(base, vec3f(0.32, 0.52, 0.16));',
    '    var skin: vec3f = mix(base, quadCol * lum * 1.7, vec3f(uniform.uQuadStrength));',
    '    skin = skin * ((1.0 + (input.aCellC.y - 0.5) * uniform.uShadeRange) *',
    '                   (0.9 + 0.2 * fract(input.aCellB.x * 13.7)));',
    '    output.vSkin = vec4f(skin, uniform.uMembraneWidth * input.aCellC.w);',
    '',
    '    let viewPos: vec4f = v * vec4f(world, 1.0);',
    '    let off: vec2f = p * (input.aCellA.w * boost * alive * clear * shrink);',
    '    output.position = uniform.matrix_projection *',
    '        vec4f(viewPos.x + off.x, viewPos.y + off.y,',
    '              viewPos.z + uniform.uDepthBias, viewPos.w);',
    '    return output;',
    '}'
].join('\n');

OrganicCells._fragmentWGSL = [
    'varying vDeform: vec4f;',
    'varying vShape: vec4f;',
    'varying vPhase: vec4f;',
    'varying vLight: vec4f;',
    'varying vSkin: vec4f;',
    'varying vFocus: vec4f;',
    '',
    'uniform matrix_view: mat4x4f;',
    '',
    'uniform uNucleusTint: vec3f;',
    'uniform uNucleusColor: vec3f;',
    'uniform uMembraneTint: vec3f;',
    'uniform uEdgeColor: vec3f;',
    'uniform uFogColor: vec3f;',
    'uniform uAmbient: f32;',
    'uniform uTranslucency: f32;',
    'uniform uNucleusGlow: f32;',
    'uniform uFresnel: f32;',
    'uniform uSpecPow: f32;',
    'uniform uBrightness: f32;',
    'uniform uMembraneHalo: f32;',
    'uniform uEdgeGlow: f32;',
    'uniform uSpecular: f32;',
    'uniform uNucleusSize: f32;',
    'uniform uRipple: f32;',
    'uniform uRippleDetail: f32;',
    'uniform uSpeckle: f32;',
    'uniform uSpeckleScale: f32;',
    'uniform uMottle: f32;',
    'uniform uFringe: f32;',
    'uniform uBlur: f32;',
    'uniform uOpacity: f32;',
    'uniform uEdge: f32;',
    'uniform uUseAlpha: f32;',
    'uniform uMaxR2: f32;',
    'uniform uHazeOn: f32;',
    '',
    'fn hash13(p: vec3f) -> f32 {',
    '    return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);',
    '}',
    '',
    '@fragment',
    'fn fragmentMain(input: FragmentInput) -> FragmentOutput {',
    '    var output: FragmentOutput;',
    '',
    '    let p: vec2f = input.vShape.xy;',
    '    let dfm: vec4f = input.vDeform;',
    '    let q: vec2f = vec2f(dfm.x * p.x + dfm.y * p.y, dfm.y * p.x + dfm.z * p.y);',
    '    let r2: f32 = dot(q, q);',
    /* OJO: en WGSL 'discard' NO termina la invocación (solo la degrada a
       helper y sigue ejecutando); en GLSL sí. Sin el return, en WebGPU cada
       píxel descartado ejecutaba igual el rizado, el impostor, el granulado y
       todo el sombreado. */
    '    if (r2 > uniform.uMaxR2) { discard; return output; }',
    '',
    '    let rough: f32 = input.vShape.w;',
    '    let coc: f32 = input.vFocus.x;',
    '    let sharp: f32 = 1.0 - coc;',
    '    var r: f32 = sqrt(r2);',
    '',
    '    if (uniform.uRipple > 0.0) {',
    '        let u: vec2f = q / max(r, 0.00001);',
    '        let c2: f32 = u.x * u.x - u.y * u.y;',
    '        let s2: f32 = 2.0 * u.x * u.y;',
    '        let c3: f32 = u.x * c2 - u.y * s2;',
    '        let s3: f32 = u.x * s2 + u.y * c2;',
    '        let c5: f32 = c2 * c3 - s2 * s3;',
    '        let s5: f32 = c2 * s3 + s2 * c3;',
    '        let c7: f32 = c2 * c5 - s2 * s5;',
    '        let s7: f32 = c2 * s5 + s2 * c5;',
    '        let cp: f32 = input.vPhase.x;',
    '        let sp: f32 = input.vPhase.y;',
    '        let cp2: f32 = cp * cp - sp * sp;',
    '        let sp2: f32 = 2.0 * cp * sp;',
    '        let wide: f32 = mix(c3 * cp + s3 * sp, c5 * cp2 + s5 * sp2, uniform.uRippleDetail);',
    '        let fine: f32 = c7 * cp2 + s7 * sp2;',
    '        r = r * (1.0 - uniform.uRipple * (wide * (1.0 - 0.3 * rough) + fine * (0.22 * rough)));',
    '    }',
    '    if (r > 1.0) { discard; return output; }',
    '',
    '    let z: f32 = sqrt(max(1.0 - r * r, 0.0));',
    '    let n: vec3f = normalize(vec3f(q, z + 0.001));',
    '',
    '    var wrapL: f32 = dot(n, input.vLight.xyz) * 0.5 + 0.5;',
    '    wrapL = wrapL * wrapL;',
    '    let lit: f32 = uniform.uAmbient + (1.0 - uniform.uAmbient) * wrapL;',
    '',
    '    let skin: vec3f = input.vSkin.rgb;',
    '    var col: vec3f = skin * lit;',
    '',
    '    let fres: f32 = 1.0 - z;',
    '    let fres2: f32 = fres * fres;',
    '    col = mix(col, uniform.uFogColor, vec3f(uniform.uTranslucency * (1.0 - fres2)));',
    '',
    '    if (uniform.uNucleusSize > 0.0) {',
    '        let nd: f32 = length(q - input.vPhase.zw);',
    '        let depth: f32 = 0.4 + 0.6 * smoothstep(-0.4, 0.4, input.vLight.w);',
    '        let soft: f32 = mix(0.55, 0.1, coc);',
    '        let nuc: f32 = (1.0 - smoothstep(uniform.uNucleusSize * soft, uniform.uNucleusSize, nd)) *',
    '                       depth * mix(0.45, 1.0, sharp);',
    '        col = mix(col, skin * uniform.uNucleusTint * lit, vec3f(nuc));',
    '    }',
    '',
    '    if (uniform.uNucleusGlow > 0.0 && uniform.uNucleusSize > 0.0) {',
    '        let gd: f32 = length(q - input.vPhase.zw);',
    '        let gdepth: f32 = 0.35 + 0.65 * smoothstep(-0.4, 0.4, input.vLight.w);',
    '        let core: f32 = 1.0 - smoothstep(0.0, uniform.uNucleusSize * 0.75, gd);',
    '        var halo: f32 = 1.0 - smoothstep(0.0, uniform.uNucleusSize * 2.4, gd);',
    '        halo = halo * halo;',
    '        col = col + (uniform.uNucleusColor * (core + halo * 0.55) + vec3f(core * core * core * 0.6)) *',
    '              (uniform.uNucleusGlow * gdepth * mix(0.6, 1.0, sharp));',
    '    }',
    '',
    '    if (uniform.uSpeckle > 0.0 || uniform.uMottle > 0.0) {',
    '        let v: mat4x4f = uniform.matrix_view;',
    '        let v3: mat3x3f = mat3x3f(v[0].xyz, v[1].xyz, v[2].xyz);',
    '        let nw: vec3f = n * v3;',
    '        let sd: f32 = dfm.w;',
    '',
    '        if (uniform.uMottle > 0.0) {',
    '            let mm: vec3f = nw * (uniform.uSpeckleScale * 0.3) + vec3f(sd * 11.1, sd * 23.3, sd * 37.7);',
    '            let mott: f32 = sin(dot(mm, vec3f(1.0, 0.7, -0.4))) +',
    '                            0.6 * sin(dot(mm, vec3f(-0.3, 1.1, 0.8)) * 2.1);',
    '            col = col * (1.0 + mott * (0.22 * uniform.uMottle * sharp));',
    '        }',
    '',
    '        if (uniform.uSpeckle > 0.0) {',
    '            let sp3: vec3f = nw * uniform.uSpeckleScale + vec3f(sd * 17.3, sd * 29.7, sd * 43.1);',
    '            let ip: vec3f = floor(sp3);',
    '            let h: f32 = hash13(ip);',
    '            let fp: vec3f = fract(sp3) - 0.5 - (fract(vec3f(h) * vec3f(13.7, 27.3, 41.9)) - 0.5) * 0.33;',
    '            let rad: f32 = mix(0.03, 0.11, fract(h * 7.7));',
    '            let grain: f32 = (1.0 - smoothstep(rad * 0.3, rad, dot(fp, fp))) *',
    '                             step(1.0 - uniform.uSpeckle * (0.3 + 0.7 * rough), h) *',
    '                             (1.0 - smoothstep(0.35, 1.0, r)) * sharp;',
    '            col = col * (1.0 - grain * (0.25 + 0.5 * rough));',
    '        }',
    '    }',
    '',
    '    let t: f32 = (1.0 - r) / max(input.vSkin.w, 0.0001);',
    '    let ring: f32 = 1.0 - smoothstep(0.2, 1.0, t);',
    '    if (uniform.uMembraneHalo > 0.0) {',
    '        let halo: f32 = (1.0 - smoothstep(1.15, 2.6, t)) * (1.0 - ring);',
    '        col = col * (1.0 + halo * uniform.uMembraneHalo * mix(0.4, 1.0, sharp));',
    '    }',
    '    let wall: vec3f = skin * uniform.uMembraneTint * (0.55 + 0.45 * lit);',
    '    var ringRGB: vec3f = vec3f(ring);',
    '    if (uniform.uFringe > 0.0) {',
    '        let fr: f32 = min(uniform.uFringe * sharp, 0.08 / max(input.vSkin.w, 0.0001));',
    '        ringRGB = vec3f(1.0 - smoothstep(0.2, 1.0, t + fr), ring,',
    '                        1.0 - smoothstep(0.2, 1.0, t - fr));',
    '    }',
    '    col = mix(col, wall, ringRGB * mix(1.0, 0.5, coc));',
    '',
    '    if (uniform.uFresnel > 0.0) {',
    '        col = col + uniform.uEdgeColor * (fres2 * fres * uniform.uFresnel);',
    '    }',
    '',
    '    if (uniform.uEdgeGlow > 0.0) {',
    '        col = col + uniform.uEdgeColor * ((1.0 - smoothstep(0.0, 0.45, t)) * uniform.uEdgeGlow * sharp);',
    '    }',
    '    if (uniform.uSpecular > 0.0) {',
    '        let hs: vec3f = input.vLight.xyz + vec3f(0.0, 0.0, 1.0);',
    '        let sp0: f32 = max(dot(n, hs) * inverseSqrt(max(dot(hs, hs), 1e-8)), 0.0);',
    '        col = col + vec3f(pow(sp0, uniform.uSpecPow) * uniform.uSpecular);',
    '    }',
    '',
    '    col = mix(mix(uniform.uFogColor, input.vFocus.yzw, vec3f(uniform.uHazeOn)), col * uniform.uBrightness, vec3f(input.vShape.z));',
    '',
    '    let edgeW: f32 = uniform.uEdge + coc * uniform.uBlur;',
    '    let a: f32 = (1.0 - smoothstep(1.0 - edgeW, 1.0, r)) *',
    '                 uniform.uOpacity * input.vShape.z;',
    '    output.color = vec4f(col, mix(1.0, a, uniform.uUseAlpha));',
    '    return output;',
    '}'
].join('\n');


/* =========================================================
   NEBLINA — fondo procedural, 1 vez por píxel
   ---------------------------------------------------------
   Una caja que rodea SIEMPRE a la cámara (los vértices se ponen en
   view_position + aPosition, sin matriz de modelo) con la profundidad forzada
   al fondo del z-buffer: detrás de todo, delante de nada. El fragment pinta un
   gradiente hacia la luz y dos octavas de cúmulos borrosos con la misma
   retícula de hash de los granos, sobre p = dirección * escala + cámara *
   paralaje: al moverse, el fondo se desplaza como un volumen. Coste: un pase
   de pantalla con 2 hashes; es lo que llena el espacio vacío por casi nada.
   ========================================================= */

OrganicCells._hazeVertexGLSL = [
    'attribute vec3 aPosition;',
    'uniform mat4 matrix_viewProjection;',
    'uniform vec3 view_position;',
    'varying vec3 vDir;',
    '',
    'void main(void) {',
    '    vDir = aPosition;',
    '    vec4 pos = matrix_viewProjection * vec4(view_position + aPosition * 50.0, 1.0);',
    /* al fondo del z-buffer, pase lo que pase con el far clip */
    '    pos.z = pos.w * 0.99999;',
    '    gl_Position = pos;',
    '}'
].join('\n');

OrganicCells._hazeFragmentGLSL = [
    'uniform vec3  view_position;',
    'uniform float uTime;',
    'uniform vec3  uHazeFar;',
    'uniform vec3  uHazeLight;',
    'uniform vec3  uHazeGlow;',
    'uniform vec3  uLightDir;',
    'uniform float uHazeDensity;',
    'uniform float uHazeScale;',
    'uniform float uHazeBright;',
    'uniform float uHazeParallax;',
    'uniform float uHazeDrift;',
    'uniform float uHazeDetail;',
    'uniform float uHueOffset;',
    'uniform float uHueRange;',
    'uniform float uSaturation;',
    '',
    'varying vec3 vDir;',
    '',
    'float hash13(vec3 p) {',
    '    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);',
    '}',
    'vec3 hue2rgb(float h) {',
    '    vec3 k = fract(vec3(h) + vec3(0.0, 0.66666667, 0.33333333));',
    '    return clamp(abs(k * 6.0 - 3.0) - 1.0, 0.0, 1.0);',
    '}',
    /* un cúmulo borroso por celda de la retícula: disco suave con radio, brillo
       y tono propios; el corrimiento no pasa del margen que deja el radio. */
    'vec3 blobs(vec3 p, float density) {',
    '    vec3 ip = floor(p);',
    '    float h = hash13(ip);',
    '    vec3 fp = fract(p) - 0.5 - (fract(h * vec3(13.7, 27.3, 41.9)) - 0.5) * 0.3;',
    /* radio ya invertido y bordes constantes: cero divisiones por píxel */
    '    float invRad = mix(20.0, 9.0909, fract(h * 7.7));',
    '    float disc = (1.0 - smoothstep(0.1, 1.0, dot(fp, fp) * invRad)) * step(1.0 - density, h);',
    '    vec3 tint = mix(vec3(1.0), hue2rgb(fract(uHueOffset + fract(h * 3.1) * uHueRange)), uSaturation);',
    '    return tint * (disc * (0.5 + 0.5 * fract(h * 5.3)));',
    '}',
    '',
    'void main(void) {',
    '    vec3 dir = normalize(vDir);',
    /* gradiente: más claro mirando hacia la luz, como el resplandor de la foto */
    '    float l = dot(dir, uLightDir) * 0.5 + 0.5;',
    '    vec3 col = mix(uHazeFar, uHazeLight, l * l);',
    '',
    /* cúmulos con paralaje y deriva. Ramas por UNIFORM: con Density 0 queda
       solo el gradiente (~10 instrucciones por píxel) y la segunda octava,
       más fina, solo se paga si Detail > 0. Es un pase de pantalla completo:
       en gama baja, cada rama cuenta. */
    '    if (uHazeDensity > 0.0) {',
    '        vec3 base = view_position * uHazeParallax;',
    '        vec3 p1 = dir * uHazeScale + base + vec3(0.0, uTime * uHazeDrift, 0.0);',
    '        vec3 acc = blobs(p1, uHazeDensity);',
    '        if (uHazeDetail > 0.0) {',
    '            vec3 p2 = dir * (uHazeScale * 2.3) + base * 1.7 + vec3(uTime * uHazeDrift * 0.7, 0.0, 17.0);',
    '            acc += blobs(p2, uHazeDensity) * (0.45 * uHazeDetail);',
    '        }',
    '        col += uHazeGlow * acc * uHazeBright;',
    '    }',
    '',
    '    gl_FragColor = vec4(col, 1.0);',
    '}'
].join('\n');

OrganicCells._hazeVertexWGSL = [
    'attribute aPosition: vec3f;',
    'uniform matrix_viewProjection: mat4x4f;',
    'uniform view_position: vec3f;',
    'varying vDir: vec3f;',
    '',
    '@vertex',
    'fn vertexMain(input: VertexInput) -> VertexOutput {',
    '    var output: VertexOutput;',
    '    output.vDir = input.aPosition;',
    '    let pos: vec4f = uniform.matrix_viewProjection * vec4f(uniform.view_position + input.aPosition * 50.0, 1.0);',
    /* 0.999995 y no 0.99999: en WebGPU el NDC z YA es la profundidad (rango
       0..1), en WebGL se remapea (0.5*z+0.5). Así queda a la misma
       profundidad que en GLSL. */
    '    output.position = vec4f(pos.x, pos.y, pos.w * 0.999995, pos.w);',
    '    return output;',
    '}'
].join('\n');

OrganicCells._hazeFragmentWGSL = [
    'varying vDir: vec3f;',
    '',
    'uniform view_position: vec3f;',
    'uniform uTime: f32;',
    'uniform uHazeFar: vec3f;',
    'uniform uHazeLight: vec3f;',
    'uniform uHazeGlow: vec3f;',
    'uniform uLightDir: vec3f;',
    'uniform uHazeDensity: f32;',
    'uniform uHazeScale: f32;',
    'uniform uHazeBright: f32;',
    'uniform uHazeParallax: f32;',
    'uniform uHazeDrift: f32;',
    'uniform uHazeDetail: f32;',
    'uniform uHueOffset: f32;',
    'uniform uHueRange: f32;',
    'uniform uSaturation: f32;',
    '',
    'fn hash13(p: vec3f) -> f32 {',
    '    return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);',
    '}',
    'fn hue2rgb(h: f32) -> vec3f {',
    '    let k: vec3f = fract(vec3f(h) + vec3f(0.0, 0.66666667, 0.33333333));',
    '    return clamp(abs(k * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));',
    '}',
    'fn blobs(p: vec3f, density: f32) -> vec3f {',
    '    let ip: vec3f = floor(p);',
    '    let h: f32 = hash13(ip);',
    '    let fp: vec3f = fract(p) - 0.5 - (fract(vec3f(h) * vec3f(13.7, 27.3, 41.9)) - 0.5) * 0.3;',
    '    let invRad: f32 = mix(20.0, 9.0909, fract(h * 7.7));',
    '    let disc: f32 = (1.0 - smoothstep(0.1, 1.0, dot(fp, fp) * invRad)) * step(1.0 - density, h);',
    '    let tint: vec3f = mix(vec3f(1.0), hue2rgb(fract(uniform.uHueOffset + fract(h * 3.1) * uniform.uHueRange)), vec3f(uniform.uSaturation));',
    '    return tint * (disc * (0.5 + 0.5 * fract(h * 5.3)));',
    '}',
    '',
    '@fragment',
    'fn fragmentMain(input: FragmentInput) -> FragmentOutput {',
    '    var output: FragmentOutput;',
    '    let dir: vec3f = normalize(input.vDir);',
    '    let l: f32 = dot(dir, uniform.uLightDir) * 0.5 + 0.5;',
    '    var col: vec3f = mix(uniform.uHazeFar, uniform.uHazeLight, vec3f(l * l));',
    '    if (uniform.uHazeDensity > 0.0) {',
    '        let base: vec3f = uniform.view_position * uniform.uHazeParallax;',
    '        let p1: vec3f = dir * uniform.uHazeScale + base + vec3f(0.0, uniform.uTime * uniform.uHazeDrift, 0.0);',
    '        var acc: vec3f = blobs(p1, uniform.uHazeDensity);',
    '        if (uniform.uHazeDetail > 0.0) {',
    '            let p2: vec3f = dir * (uniform.uHazeScale * 2.3) + base * 1.7 + vec3f(uniform.uTime * uniform.uHazeDrift * 0.7, 0.0, 17.0);',
    '            acc = acc + blobs(p2, uniform.uHazeDensity) * (0.45 * uniform.uHazeDetail);',
    '        }',
    '        col = col + uniform.uHazeGlow * acc * uniform.uHazeBright;',
    '    }',
    '    output.color = vec4f(col, 1.0);',
    '    return output;',
    '}'
].join('\n');


/* =========================================================
   RECURSOS COMPARTIDOS
   ========================================================= */

/* PRNG determinista (mulberry32): el mismo Seed reproduce el mismo campo en
   todas las máquinas, y no ensucia Math.random. */
OrganicCells._makeRng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/* Hash espacial ENTERO (sin Math.sin: mismo resultado en cualquier motor JS).
   Las coordenadas se envuelven cada 'wrap' celdas para que el campo de color
   sea PERIÓDICO igual que el campo de células: así el wrap del vertex shader
   nunca produce una costura de color. */
OrganicCells._latticeHash = function (x, y, z, wrap, salt) {
    x = ((x % wrap) + wrap) % wrap;
    y = ((y % wrap) + wrap) % wrap;
    z = ((z % wrap) + wrap) % wrap;
    var h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) +
             Math.imul(z, 2147483647) + Math.imul(salt, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/* Curva de mezcla entre cuadrantes vecinos.

   Con la S normal (sharp = 1) esto es ruido de valor trilineal clásico, y tiene
   un problema medido: al promediar 8 esquinas, los valores se apelotonan
   alrededor de 0.5 y el tono nunca llega a los extremos de la rueda — con Hue
   Range en 1 se ven rosas y violetas pero jamás un verde.

   Subiendo sharp, la mezcla se concentra en una banda angosta pegada al límite
   entre cuadrantes: el interior de cada cuadrante toma SU color entero (y ahí
   sí aparece toda la rueda) y la transición sigue siendo continua, sin ningún
   escalón. Es el mando "Color Sharpness". */
OrganicCells._blendCurve = function (f, sharp) {
    var t = (f - 0.5) * sharp + 0.5;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
};

/* Ruido de valor TRILINEAL sobre la red de cuadrantes: en el centro de cada
   cuadrante manda su propio valor y entre cuadrantes se interpola con una
   curva suave. Eso es exactamente "cada cuadrante tiene su color pero la
   transición no se ve". */
OrganicCells._quadNoise = function (x, y, z, wrap, salt, sharp) {
    var x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    var k = sharp || 1;
    var B = OrganicCells._blendCurve;
    var sx = B(x - x0, k);
    var sy = B(y - y0, k);
    var sz = B(z - z0, k);

    var H = OrganicCells._latticeHash;
    var c000 = H(x0,     y0,     z0,     wrap, salt);
    var c100 = H(x0 + 1, y0,     z0,     wrap, salt);
    var c010 = H(x0,     y0 + 1, z0,     wrap, salt);
    var c110 = H(x0 + 1, y0 + 1, z0,     wrap, salt);
    var c001 = H(x0,     y0,     z0 + 1, wrap, salt);
    var c101 = H(x0 + 1, y0,     z0 + 1, wrap, salt);
    var c011 = H(x0,     y0 + 1, z0 + 1, wrap, salt);
    var c111 = H(x0 + 1, y0 + 1, z0 + 1, wrap, salt);

    var x00 = c000 + (c100 - c000) * sx;
    var x10 = c010 + (c110 - c010) * sx;
    var x01 = c001 + (c101 - c001) * sx;
    var x11 = c011 + (c111 - c011) * sx;
    var y0v = x00 + (x10 - x00) * sy;
    var y1v = x01 + (x11 - x01) * sy;
    return y0v + (y1v - y0v) * sz;
};

/* EL quad: 4 vértices y 2 triángulos para TODAS las células de la app. */
OrganicCells._getQuadMesh = function (device) {
    if (OrganicCells._quadMesh && OrganicCells._quadDevice === device) {
        return OrganicCells._quadMesh;
    }

    var mesh = new pc.Mesh(device);
    mesh.setPositions([
        -1, -1, 0,
         1, -1, 0,
         1,  1, 0,
        -1,  1, 0
    ]);
    mesh.setIndices([0, 1, 2, 0, 2, 3]);
    mesh.update(pc.PRIMITIVE_TRIANGLES);

    /* La malla es COMPARTIDA y vive en la caché: una referencia extra para que
       al destruir la última MeshInstance el refcount no llegue a 0 y deje la
       caché apuntando a una malla ya destruida. */
    if (mesh.incRefCount) mesh.incRefCount();

    OrganicCells._quadMesh = mesh;
    OrganicCells._quadDevice = device;
    return mesh;
};

/* Formato de instancia: 3 vec4 interleaved en ATTR12/13/14 (ATTR12 y ATTR13 son
   los mismos slots que usa el instancing por matrices del engine, que acá no se
   usa). */
OrganicCells._getInstanceFormat = function (device) {
    if (OrganicCells._instFormat && OrganicCells._instDevice === device) {
        return OrganicCells._instFormat;
    }

    var fmt = new pc.VertexFormat(device, [
        { semantic: pc.SEMANTIC_ATTR12, components: 4, type: pc.TYPE_FLOAT32 },
        { semantic: pc.SEMANTIC_ATTR13, components: 4, type: pc.TYPE_FLOAT32 },
        { semantic: pc.SEMANTIC_ATTR14, components: 4, type: pc.TYPE_FLOAT32 }
    ]);

    OrganicCells._instFormat = fmt;
    OrganicCells._instDevice = device;
    return fmt;
};


/* =========================================================
   CICLO DE VIDA
   ========================================================= */

OrganicCells.prototype.initialize = function () {
    /* Idempotente: swap() lo llama a mano (ver abajo) y después el engine
       puede volver a llamarlo tras un disable/enable del componente, porque
       en la instancia nueva _initialized queda en falso. Sin esta guarda, la
       segunda llamada construiría OTRAS dos capas: draw calls duplicados. */
    if (this._built) return;

    this._phase = 0;
    this._hazeTime = 0;
    this._built = false;
    this._holder = null;
    this._layers = [];
    this._vertexBuffer = null;
    this._haze = null;
    this._lightDir = new pc.Vec3();
    this._quadCount = 1;
    this._quadEffective = 0;
    this._useAlpha = 0;
    this._shrinkFar = 1;
    this._additive = false;

    /* HABITACIONES: los arrays van pre-alocados y se reescriben en el sitio,
       cero basura por frame. */
    this._zoneCenter = new Float32Array(OrganicCells.MAX_ROOMS * 4);
    this._zoneHalf = new Float32Array(OrganicCells.MAX_ROOMS * 4);
    this._zoneCount = -1;
    this._zoneBox = new pc.BoundingBox();
    this._zoneC = new pc.Vec3();
    this._zoneH = new pc.Vec3();
    /* candidatas (tag + lista manual) y su caché de mallas, en arrays que se
       reusan; _roomBoxes guarda centro y semiejes de cada una para no calcular
       la caja dos veces, y pick/dist son las N ranuras ordenadas por cercanía */
    this._roomEnts = [];
    this._roomMis = [];
    this._roomFound = [];
    this._roomBoxes = new Float32Array(OrganicCells.MAX_ROOMS * 6);
    /* radio de la esfera CENTRADA EN LA POSICIÓN de cada habitación que la
       envuelve entera; -1 = todavía no se midió. Es el rechazo barato: con
       esto una habitación lejana se descarta sin calcular su caja. */
    this._roomRad = new Float32Array(OrganicCells.MAX_ROOMS);
    this._roomPick = new Int32Array(OrganicCells.MAX_ROOMS);
    this._roomDist = new Float32Array(OrganicCells.MAX_ROOMS);
    this._roomScanT = 0;
    this._tagKey = null;
    this._tagArgs = null;

    this._build();

    /* CAMBIOS DESDE EL EDITOR: al tocar un campo de una sección, el engine
       reasigna la SECCIÓN entera, así que el evento 'attr' solo dice el nombre
       de la sección, nunca qué campo cambió. Por eso se compara una firma de
       los valores estructurales: si cambió alguno se rehacen los buffers de
       instancias; si no, basta con reenviar uniforms (cambiar un color no
       tiene por qué regenerar 20.000 células). */
    this.on('attr', function (name) {
        if (!this._built) return;

        if (this._structuralSignature() !== this._sig) {
            this._rebuildInstances();
            return;
        }
        if (name === 'visibility') this._applyRenderMode();
        this._applyUniforms();
    }, this);

    this.on('enable', function () {
        if (this._holder) this._holder.enabled = true;
    }, this);

    this.on('disable', function () {
        if (this._holder) this._holder.enabled = false;
    }, this);

    this.on('destroy', function () {
        this._destroyResources();
    }, this);
};

/* Hot reload en el launcher. OJO, verificado en el fuente del engine 2.7.4
   (ScriptComponent.swap): crea la instancia nueva, le carga los atributos y
   llama a swap() DIRECTAMENTE — NUNCA pasa por initialize. O sea que acá no
   hay _lightDir, ni arrays de habitaciones, ni listeners de 'attr'/'destroy'.
   Por eso swap() llama a initialize() a mano (que construye Y registra los
   listeners), suelta los recursos de la instancia vieja —su 'destroy' no se
   dispara— y hereda el reloj para que el campo no salte. */
OrganicCells.prototype.swap = function (old) {
    var phase = (old && typeof old._phase === 'number') ? old._phase : 0;
    var hazeTime = (old && typeof old._hazeTime === 'number') ? old._hazeTime : 0;
    if (old && old._destroyResources) old._destroyResources();
    if (!this._built) this.initialize();
    this._phase = phase;
    this._hazeTime = hazeTime;
};

OrganicCells.prototype.update = function (dt) {
    if (!this._built) return;

    /* ÚNICO trabajo de CPU por frame: avanzar el reloj de fase y mandarlo a
       las capas. El módulo es exacto (ver PHASE_PERIOD): no hay salto. */
    var period = OrganicCells.PHASE_PERIOD;
    this._phase += dt * this.cell.wobbleSpeed;
    if (this._phase >= period) this._phase -= period * Math.floor(this._phase / period);

    for (var i = 0; i < this._layers.length; i++) {
        this._layers[i].material.setParameter('uTime', this._phase);
    }
    /* La neblina tiene reloj PROPIO y sin módulo: su deriva es una traslación
       lineal de la retícula, no es periódica como la fase de las células, y
       con el reloj de fase todo el fondo saltaba de lugar en cada reinicio
       (cada ~105 s). En float32 aguanta horas sin perder precisión visible. */
    this._hazeTime += dt;
    if (this._haze) this._haze.material.setParameter('uTime', this._hazeTime);

    /* Las habitaciones pueden moverse (un ascensor, una nave): sus cajas se
       recalculan por frame, pero solo si hay alguna. La BÚSQUEDA por tag, que
       sí cuesta, va por intervalo (Scan Interval). */
    this._updateZones(dt);
};


/* =========================================================
   CONSTRUCCIÓN — DOS CAPAS
   ---------------------------------------------------------
   Capa 0, "detalle": pocas células, cerca, con todo el shader.
   Capa 1, "fondo":   muchas células, lejos, siempre desenfocadas y con todos
                      los bloques caros apagados por uniform.
   Las dos usan el MISMO programa de shader (mismo uniqueName): solo cambian
   los uniforms. Son 2 draw calls, y la de fondo es barata porque sus células
   son chicas en pantalla y su fragment corre el camino corto. Con Background
   Count en 0 la capa de fondo se apaga y vuelve a ser 1 draw call.
   ========================================================= */

OrganicCells.prototype._build = function () {
    var device = this.app.graphicsDevice;
    var mesh = OrganicCells._getQuadMesh(device);

    /* Entidad hija propia: no pisa un render component que ya tenga la entidad
       y se puede prender/apagar con el script. */
    this._holder = new pc.Entity('organicCellsField');
    this.entity.addChild(this._holder);

    try {
        this._layers = [
            this._makeLayer('detalle', mesh),
            this._makeLayer('fondo', mesh)
        ];
    } catch (e) {
        console.warn('organicCells: no se pudo crear el material; efecto desactivado', e);
        this._holder.destroy();
        this._holder = null;
        this._layers = [];
        return;
    }

    try {
        this._haze = this._makeHaze();
    } catch (e) {
        console.warn('organicCells: no se pudo crear la neblina de fondo; sigue sin ella', e);
        this._haze = null;
    }

    this._holder.enabled = this.enabled;
    this._built = true;
    this._applyRenderMode();
    this._rebuildInstances();
};

/* EL cubo de la neblina: 8 vértices, 12 triángulos, propio. Antes se usaba el
   primitivo 'box' del render component y había que leer sus meshInstances
   después de crearlo para marcarlas; con una malla propia el control es mío y
   no depende de cómo el componente arme sus instancias. */
OrganicCells._getHazeMesh = function (device) {
    if (OrganicCells._hazeMesh && OrganicCells._hazeDevice === device) {
        return OrganicCells._hazeMesh;
    }
    var mesh = new pc.Mesh(device);
    mesh.setPositions([
        -1, -1, -1,   1, -1, -1,   1,  1, -1,  -1,  1, -1,
        -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1
    ]);
    mesh.setIndices([
        0, 1, 2,  0, 2, 3,   5, 4, 7,  5, 7, 6,
        4, 0, 3,  4, 3, 7,   1, 5, 6,  1, 6, 2,
        3, 2, 6,  3, 6, 7,   4, 5, 1,  4, 1, 0
    ]);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    if (mesh.incRefCount) mesh.incRefCount();
    OrganicCells._hazeMesh = mesh;
    OrganicCells._hazeDevice = device;
    return mesh;
};

/* La neblina: un cubo propio con material propio. Sus vértices se colocan
   alrededor de view_position dentro del vertex shader, así que la entidad no
   tiene que seguir a la cámara: cero CPU por frame. */
OrganicCells.prototype._makeHaze = function () {
    var material = new pc.ShaderMaterial({
        uniqueName: 'OrganicCellsHaze',
        vertexGLSL: OrganicCells._hazeVertexGLSL,
        fragmentGLSL: OrganicCells._hazeFragmentGLSL,
        vertexWGSL: OrganicCells._hazeVertexWGSL,
        fragmentWGSL: OrganicCells._hazeFragmentWGSL,
        attributes: { aPosition: pc.SEMANTIC_POSITION }
    });
    material.name = 'OrganicCells_neblina';
    /* CULLFACE_NONE y no FRONT: el engine invierte FRONT/BACK cuando el nodo
       tiene escala negativa (worldScaleSign) suponiendo que matrix_model
       espejó el winding, pero este vertex ignora matrix_model; con un ancestro
       espejado la caja desaparecía. Desde adentro de una caja convexa cada
       píxel lo cubre exactamente una cara: sin overdraw extra.
       depthWrite SÍ: el skybox del engine se dibuja después, con z ≈ 1 y
       LESSEQUAL, y sin escribir z pisaba la neblina entera. Escribiendo
       0.999995 el skybox falla el test y lo demás (más cerca) pasa igual. */
    material.cull = pc.CULLFACE_NONE;
    material.blendType = pc.BLEND_NONE;
    material.depthWrite = true;
    material.depthTest = true;
    material.update();

    var holder = new pc.Entity('organicCells_neblina');
    this._holder.addChild(holder);

    var mi = new pc.MeshInstance(OrganicCells._getHazeMesh(this.app.graphicsDevice), material, holder);
    /* la caja "vive" en el origen para el motor pero se dibuja alrededor de la
       cámara: sin esto la culla en cuanto la cámara mira para otro lado */
    OrganicCells._neverCull(mi);

    holder.addComponent('render', {
        meshInstances: [mi],
        castShadows: false,
        receiveShadows: false
    });
    OrganicCells._neverCull(mi);

    return { material: material, holder: holder, meshInstance: mi };
};

OrganicCells.prototype._makeLayer = function (name, mesh) {
    var material = new pc.ShaderMaterial({
        uniqueName: 'OrganicCellsMaterial',
        vertexGLSL: OrganicCells._vertexGLSL,
        fragmentGLSL: OrganicCells._fragmentGLSL,
        vertexWGSL: OrganicCells._vertexWGSL,
        fragmentWGSL: OrganicCells._fragmentWGSL,
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aCellA: pc.SEMANTIC_ATTR12,
            aCellB: pc.SEMANTIC_ATTR13,
            aCellC: pc.SEMANTIC_ATTR14
        }
    });
    material.name = 'OrganicCells_' + name;

    var holder = new pc.Entity('organicCells_' + name);
    this._holder.addChild(holder);

    var mi = new pc.MeshInstance(mesh, material, holder);
    /* el descarte real lo hace el vertex shader */
    OrganicCells._neverCull(mi);

    holder.addComponent('render', {
        meshInstances: [mi],
        castShadows: false,
        receiveShadows: false
    });
    /* de nuevo DESPUÉS del componente: el setter de meshInstances reaplica
       varias propiedades y no quiero depender del orden */
    OrganicCells._neverCull(mi);

    return { name: name, material: material, holder: holder, meshInstance: mi, count: 0 };
};

/* Genera (o regenera) los datos por instancia de las dos capas y los sube a la
   GPU. Acá se hornea también el color de cuadrante de cada célula: en el
   shader sale gratis. */
OrganicCells.prototype._rebuildInstances = function () {
    if (!this._built) return;

    var a = this.amount;
    var c = this.cell;
    var qd = this.quadrants;
    var bg = this.background;

    var size = Math.max(0.001, a.regionSize);

    /* La red de cuadrantes se ajusta a un divisor exacto de Region Size: así el
       campo de color tiene el mismo periodo que el campo de células y el wrap
       no genera ninguna costura de color. Las dos capas comparten la red, o
       sea que una célula de fondo y una detallada en el mismo lugar tienen el
       mismo color. */
    var nQuad = Math.max(1, Math.round(size / Math.max(0.001, qd.quadrantSize)));
    var quadSize = size / nQuad;
    this._quadCount = nQuad;
    this._quadEffective = quadSize;

    var shared = {
        size: size,
        nQuad: nQuad,
        quadSize: quadSize,
        sharp: 1 + 3 * Math.min(1, Math.max(0, qd.colorSharpness)),
        saltHue: (a.seed | 0) * 7 + 11,
        saltShade: (a.seed | 0) * 7 + 977,
        center: this.entity.getPosition().clone()
    };

    var count = Math.max(1, Math.floor(a.cellCount));

    /* UN solo buffer: las dos capas dibujan las MISMAS instancias. Es lo que
       hace que el traspaso detalle/fondo no cambie nada de lugar ni de tamaño.
       Antes cada capa tenía sus propias células (otra semilla, otro radio) y al
       acercarse una de fondo se apagaba mientras aparecía otra de detalle. */
    this._fillBuffer(count, a.seed, c.cellRadius, bg.moteFraction, shared);
    for (var li = 0; li < this._layers.length; li++) {
        var L = this._layers[li];
        L.count = count;
        L.meshInstance.setInstancing(this._vertexBuffer);
        /* setInstancing(vb) deja cull = false y setInstancing(null) lo pone en
           TRUE: se reafirma acá para que ningún camino lo deje culleable */
        OrganicCells._neverCull(L.meshInstance);
        L.holder.enabled = (li === 0) || !!bg.enabled;
    }

    this._sig = this._structuralSignature();
    this._applyUniforms();

    if (nQuad < 3 && qd.colorStrength > 0.01) {
        console.warn('organicCells: Region Size / Quadrant Size = ' + nQuad +
            '. Solo hay ' + (nQuad * nQuad * nQuad) + ' cuadrantes distintos en todo el campo, ' +
            'así que se repiten poquísimos colores. Bajá Quadrant Size (o subí Region Size) ' +
            'para tener más variedad.');
    }

    if (a.debug) {
        var stride = OrganicCells.FLOATS_PER_CELL;
        var far = this._effectiveFar();
        var hasBg = !!bg.enabled;
        var heroRadius = hasBg ? Math.min(far, bg.start) : far;
        var vol = Math.pow(size, 3);
        var visHero = count * (4.18879 * Math.pow(heroRadius, 3)) / vol;
        var visAll = count * (4.18879 * Math.pow(far, 3)) / vol;
        console.log('organicCells v' + OrganicCells.VERSION +
            ' — ' + count + ' células en buffer · ~' + Math.round(visAll) + ' a la vista, de las que ~' +
            Math.round(visHero) + ' con detalle (hasta ' + heroRadius.toFixed(1) + ' unidades)' +
            (hasBg ? ' y el resto por el camino barato' : '') +
            ' · ' + Math.round(bg.moteFraction * 100) + '% motas' +
            ' · ' + (count * stride * 4 / 1024).toFixed(1) + ' KB' +
            ' · ' + ((hasBg ? 2 : 1) + (this.haze.enabled && this._haze ? 1 : 0)) + ' draw calls' +
            (this.haze.enabled && this._haze ? ' (1 es la neblina: un pase de pantalla)' : '') +
            ' · visión efectiva ' + far.toFixed(1) +
            (a.wrapAroundCamera ? ' (campo infinito)' : ' (cubo fijo)') +
            ' · CUADRANTES: ' + nQuad + '³ de ' + quadSize.toFixed(1) + ' unidades');
    }
};

/* Llena EL buffer de instancias (compartido por las dos capas). moteFraction
   convierte esa parte de las células en MOTAS: puntitos brillantes diminutos
   sin pared. */
OrganicCells.prototype._fillBuffer = function (count, seed, radiusBase, moteFraction, shared) {
    var device = this.app.graphicsDevice;
    var c = this.cell;

    if (this._vertexBuffer) {
        /* soltar el buffer viejo de las dos mesh instances antes de destruirlo */
        for (var li = 0; li < this._layers.length; li++) {
            this._layers[li].meshInstance.setInstancing(null);
        }
        this._vertexBuffer.destroy();
        this._vertexBuffer = null;
    }

    var stride = OrganicCells.FLOATS_PER_CELL;
    var data = new Float32Array(count * stride);
    var rnd = OrganicCells._makeRng(seed);
    var noise = OrganicCells._quadNoise;
    var center = shared.center;
    var size = shared.size;
    var variation = c.radiusVariation;
    var roughVar = c.roughnessVariation;
    var membVar = c.membraneVariation;
    /* Size Bias: u^k con k > 1 amontona el reparto hacia lo chico */
    var biasPow = 1 + 3 * Math.min(1, Math.max(0, c.sizeBias));

    for (var i = 0; i < count; i++) {
        var o = i * stride;

        var px = center.x + (rnd() - 0.5) * size;
        var py = center.y + (rnd() - 0.5) * size;
        var pz = center.z + (rnd() - 0.5) * size;
        var mote = moteFraction > 0 && rnd() < moteFraction;

        var u = Math.pow(rnd(), biasPow);
        var radius = radiusBase * (1 + (u - 0.5) * variation * 1.6);
        if (mote) radius *= 0.12;

        data[o]     = px;
        data[o + 1] = py;
        data[o + 2] = pz;
        data[o + 3] = Math.max(0.005, radius);

        data[o + 4] = rnd();                                /* semilla de fase */
        data[o + 5] = 0.6 + rnd() * 0.8;                    /* wobble relativo */
        /* Velocidad relativa SIEMPRE múltiplo de 0.1: es lo que hace exacto el
           reinicio del reloj (PHASE_PERIOD). */
        data[o + 6] = (6 + Math.floor(rnd() * 5)) * 0.1;
        /* RUGOSIDAD PROPIA: alrededor de la media, con la dispersión pedida. */
        data[o + 7] = Math.min(1, Math.max(0, c.roughness + (rnd() - 0.5) * roughVar * 1.4));

        /* COLOR POR CUADRANTE: dos campos suaves e independientes (tono y
           claridad) evaluados en la posición de la célula. */
        var lx = (px - center.x) / shared.quadSize;
        var ly = (py - center.y) / shared.quadSize;
        var lz = (pz - center.z) / shared.quadSize;
        data[o + 8] = noise(lx, ly, lz, shared.nQuad, shared.saltHue, shared.sharp);
        data[o + 9] = mote ? 1.0 : noise(lx * 0.5 + 3.7, ly * 0.5 + 8.1, lz * 0.5 + 5.3,
            Math.max(1, Math.round(shared.nQuad * 0.5)), shared.saltShade, shared.sharp);
        data[o + 10] = rnd();                               /* semilla de granos */
        /* una mota es toda núcleo: casi sin pared */
        data[o + 11] = mote ? 0.15 : Math.max(0.15, 1 + (rnd() - 0.5) * membVar * 1.6);
    }

    this._vertexBuffer = new pc.VertexBuffer(
        device,
        OrganicCells._getInstanceFormat(device),
        count,
        { data: data }
    );
};

/* Firma de lo que obliga a regenerar los buffers de instancias. */
OrganicCells.prototype._structuralSignature = function () {
    var a = this.amount, c = this.cell, q = this.quadrants, b = this.background;
    return [
        a.cellCount, a.regionSize, a.seed,
        c.cellRadius, c.radiusVariation, c.sizeBias, c.roughness, c.roughnessVariation,
        c.membraneVariation, q.quadrantSize, q.colorSharpness,
        b.enabled ? 1 : 0, b.moteFraction
    ].join('|');
};

/* Distancia de visión REAL: con el campo infinito no puede pasar de medio
   cubo, porque más allá el patrón se repite y las células aparecerían de golpe. */
OrganicCells.prototype._effectiveFar = function () {
    var region = Math.max(0.001, this.amount.regionSize);
    var far = Math.max(0.01, this.visibility.viewDistance);
    if (this.amount.wrapAroundCamera && far > region * 0.5) far = region * 0.5;
    return far;
};

/* Estado de blending/profundidad según el modo elegido, en las dos capas. */
OrganicCells.prototype._applyRenderMode = function () {
    if (!this._built) return;

    var mode = this.visibility.renderMode;
    this._additive = (mode === 'additive');
    /* en los modos opacos la célula lejana además se achica (ver uShrinkFar) */
    this._shrinkFar = (mode === 'opaque' || mode === 'coverage') ? 1 : 0;

    for (var i = 0; i < this._layers.length; i++) {
        var mat = this._layers[i].material;
        mat.cull = pc.CULLFACE_NONE;   /* el quad siempre encara: sin winding que cuidar */

        if (mode === 'additive') {
            /* ADDITIVEALPHA = (SRC_ALPHA, ONE): el rgb se multiplica por el alpha
               del fragment, que es lo que este shader espera (bordes suaves,
               desenfoque, opacidad). BLEND_ADDITIVE a secas es (ONE, ONE) e
               IGNORA el alpha: quedaba la silueta del discard, escalonada. */
            mat.blendType = (pc.BLEND_ADDITIVEALPHA !== undefined) ? pc.BLEND_ADDITIVEALPHA : pc.BLEND_ADDITIVE;
            mat.depthWrite = false;
            mat.alphaToCoverage = false;
            this._useAlpha = 1;
        } else if (mode === 'blend') {
            mat.blendType = pc.BLEND_NORMAL;
            mat.depthWrite = false;
            mat.alphaToCoverage = false;
            this._useAlpha = 1;
        } else if (mode === 'coverage') {
            mat.blendType = pc.BLEND_NONE;
            mat.depthWrite = true;
            mat.alphaToCoverage = true;
            this._useAlpha = 1;
        } else {
            mat.blendType = pc.BLEND_NONE;
            mat.depthWrite = true;
            mat.alphaToCoverage = false;
            this._useAlpha = 0;
        }

        mat.depthTest = true;
        mat.update();
    }
};

/* Todos los uniforms constantes, para las dos capas. Se llama al construir y
   al tocar atributos: NO se llama por frame. */
OrganicCells.prototype._applyUniforms = function () {
    if (!this._built) return;

    var vis = this.visibility;
    var amt = this.amount;
    var cel = this.cell;
    var qd = this.quadrants;
    var rea = this.realism;
    var bg = this.background;

    var wrap = amt.wrapAroundCamera ? 1 : 0;
    var region = Math.max(0.001, amt.regionSize);
    var far = this._effectiveFar();

    if (amt.debug && far < Math.max(0.01, vis.viewDistance)) {
        console.warn('organicCells: View Distance recortada a ' + far.toFixed(1) +
            ' (Region Size / 2) para que el campo infinito no muestre popping.');
    }

    var d = cel.lightDirection;
    this._lightDir.set(-d.x, -d.y, -d.z);
    if (this._lightDir.lengthSq() < 1e-8) this._lightDir.set(0.4, 1, 0.35);
    this._lightDir.normalize();

    var a = cel.membraneColorA;
    var b = cel.membraneColorB;
    var nuc = cel.nucleusTint;
    var glow = cel.nucleusColor;
    var wall = cel.membraneTint;
    var edge = cel.edgeColor;
    /* En modo aditivo la "niebla" es negro: sumar negro es no sumar nada, o
       sea transparente de verdad. Es lo que hace que la translucidez y el
       fundido por distancia funcionen sin ningún caso especial en el shader. */
    var fog = this._additive ? [0, 0, 0] : [vis.fogColor.r, vis.fogColor.g, vis.fogColor.b];

    /* Se manda el rizado CLAMPEADO, el mismo valor con el que se calcula la
       cota: min/max de los atributos son solo widgets del editor y por código
       podría llegar un negativo, que agrandaría la silueta más allá del quad. */
    var ripple = Math.min(0.95, Math.max(0, cel.rippleAmount));
    var maxR = 1 / (1 - ripple);
    /* Specular Size 0..1 -> exponente 160..10 (punto duro de vidrio .. mancha) */
    var specPow = 160 * Math.pow(0.0625, Math.min(1, Math.max(0, cel.specularSize)));

    var hzF = this.haze.colorFar;
    var hzL = this.haze.colorLight;
    var hasBg = !!bg.enabled;
    var bgStart = Math.max(0.5, bg.start);
    /* banda de traspaso: 20% de Background Start, mínimo media unidad */
    var band = Math.max(0.5, bgStart * 0.2);
    /* sin capa de fondo, la de detalle no se apaga nunca: banda en el infinito
       (dos bordes distintos: smoothstep con bordes iguales es indefinido) */
    var lo = hasBg ? bgStart - band : 1e8;
    var hi = hasBg ? bgStart + band : 2e8;

    for (var li = 0; li < this._layers.length; li++) {
        var isBg = (li === 1);
        var mat = this._layers[li].material;
        if (isBg && !hasBg) continue;

        /* --- lo compartido --- */
        mat.setParameter('uRegion', region);
        mat.setParameter('uWrap', wrap);
        mat.setParameter('uShrinkFar', this._shrinkFar);
        mat.setParameter('uWobble', Math.min(0.45, Math.max(0, cel.wobbleAmount)));
        mat.setParameter('uRipple', isBg ? 0 : ripple);
        mat.setParameter('uMaxR2', isBg ? 1.02 : maxR * maxR * 1.02);
        mat.setParameter('uLightDir', [this._lightDir.x, this._lightDir.y, this._lightDir.z]);

        mat.setParameter('uColorA', [a.r, a.g, a.b]);
        mat.setParameter('uColorB', [b.r, b.g, b.b]);
        mat.setParameter('uNucleusTint', [nuc.r, nuc.g, nuc.b]);
        mat.setParameter('uNucleusColor', [glow.r, glow.g, glow.b]);
        mat.setParameter('uMembraneTint', [wall.r, wall.g, wall.b]);
        mat.setParameter('uEdgeColor', [edge.r, edge.g, edge.b]);
        mat.setParameter('uFogColor', fog);

        /* CUADRANTES: el tono y la claridad ya vienen horneados por célula; acá
           solo van los mandos de la paleta, que se mueven en vivo sin
           regenerar nada. */
        mat.setParameter('uQuadStrength', qd.colorStrength);
        mat.setParameter('uHueRange', qd.hueRange);
        mat.setParameter('uHueOffset', qd.hueOffset);
        mat.setParameter('uSaturation', qd.saturation);
        mat.setParameter('uShadeRange', qd.shadeRange);

        mat.setParameter('uAmbient', cel.ambient);
        mat.setParameter('uMembraneWidth', cel.membraneWidth);
        mat.setParameter('uTranslucency', Math.min(1, Math.max(0, cel.translucency)));
        mat.setParameter('uNucleusSize', cel.nucleusSize);
        mat.setParameter('uSpecPow', specPow);
        mat.setParameter('uOpacity', vis.opacity);
        mat.setParameter('uEdge', Math.max(0.001, vis.edgeSoftness));
        mat.setParameter('uUseAlpha', this._useAlpha || 0);
        mat.setParameter('uTime', this._phase || 0);
        mat.setParameter('uBlur', Math.max(0, rea.blurAmount));

        /* mismos fundidos y mismo foco en las dos capas: son las mismas
           células, y cualquier diferencia se vería como un escalón en el
           traspaso. Lo único que cambia entre capas es la banda y los bloques
           caros. */
        mat.setParameter('uNear', Math.max(0.0001, vis.nearFade));
        mat.setParameter('uFar', far);
        /* Focus Amount va CLAMPEADO: de él sale coc, y de coc sale sharp,
           que se multiplica en seis lugares. Fuera de [0,1] los granos se
           vuelven blancos y la pared desaparece. */
        mat.setParameter('uFocusAmount', Math.min(1, Math.max(0, rea.focusAmount)));
        mat.setParameter('uFocusDist', Math.max(0, rea.focusDistance));
        mat.setParameter('uFocusRange', Math.max(0, rea.focusRange));
        mat.setParameter('uFocusFalloff', Math.max(0.1, rea.focusFalloff));
        mat.setParameter('uBandLo', lo);
        mat.setParameter('uBandHi', hi);
        mat.setParameter('uLayerFar', isBg ? 1 : 0);
        mat.setParameter('uFarBoost', Math.max(0, bg.farSizeBoost));
        /* en aditivo la niebla es negro (transparente) y no hace falta; en los
           demás modos la célula lejana se funde hacia el color de la neblina */
        mat.setParameter('uHazeFar', [hzF.r, hzF.g, hzF.b]);
        mat.setParameter('uHazeLight', [hzL.r, hzL.g, hzL.b]);
        mat.setParameter('uHazeOn', (this.haze.enabled && this._haze && !this._additive) ? 1 : 0);
        /* el detalle va un pelo más cerca que el fondo (coplanares en opaco);
           en los modos con mezcla no hay z que disputar */
        mat.setParameter('uDepthBias', (!isBg && this._shrinkFar) ? 0.01 : 0);

        if (!isBg) {
            /* --- CAPA DETALLE: todo encendido --- */
            mat.setParameter('uMottle', rea.mottle);
            mat.setParameter('uFringe', rea.fringe);
            mat.setParameter('uMembraneHalo', cel.membraneHalo);
            mat.setParameter('uEdgeGlow', cel.edgeGlow);
            mat.setParameter('uSpecular', cel.specular);
            mat.setParameter('uNucleusGlow', cel.nucleusGlow);
            mat.setParameter('uFresnel', cel.fresnel);
            mat.setParameter('uRippleDetail', cel.rippleDetail);
            mat.setParameter('uSpeckle', cel.speckleAmount);
            mat.setParameter('uSpeckleScale', cel.speckleScale);
            mat.setParameter('uBrightness', 1);
        } else {
            /* --- CAMINO BARATO (lejos): los bloques caros en 0 saltan su rama.
               Lo barato (núcleo emisivo, fresnel) se deja IGUAL que en detalle
               para que el traspaso no se note. --- */
            mat.setParameter('uMottle', 0);
            mat.setParameter('uFringe', 0);
            mat.setParameter('uMembraneHalo', 0);
            mat.setParameter('uEdgeGlow', 0);
            mat.setParameter('uSpecular', 0);
            mat.setParameter('uNucleusGlow', cel.nucleusGlow);
            mat.setParameter('uFresnel', cel.fresnel);
            mat.setParameter('uRippleDetail', 0);
            mat.setParameter('uSpeckle', 0);
            mat.setParameter('uSpeckleScale', cel.speckleScale);
            mat.setParameter('uBrightness', Math.max(0, bg.brightness));
        }
    }

    /* --- NEBLINA --- */
    if (this._haze) {
        var hz = this.haze;
        var hm = this._haze.material;
        this._haze.holder.enabled = !!hz.enabled;
        if (hz.enabled) {
            var cf = hz.colorFar, cl = hz.colorLight;
            hm.setParameter('uHazeFar', [cf.r, cf.g, cf.b]);
            hm.setParameter('uHazeLight', [cl.r, cl.g, cl.b]);
            /* los cúmulos toman el color del núcleo emisivo: coherente con las células */
            hm.setParameter('uHazeGlow', [glow.r, glow.g, glow.b]);
            hm.setParameter('uLightDir', [this._lightDir.x, this._lightDir.y, this._lightDir.z]);
            hm.setParameter('uHazeDensity', Math.min(1, Math.max(0, hz.density)));
            hm.setParameter('uHazeScale', Math.max(0.5, hz.scale));
            hm.setParameter('uHazeBright', Math.max(0, hz.brightness));
            hm.setParameter('uHazeParallax', Math.max(0, hz.parallax));
            hm.setParameter('uHazeDrift', Math.max(0, hz.drift));
            hm.setParameter('uHazeDetail', Math.min(1, Math.max(0, hz.detail)));
            hm.setParameter('uHueOffset', qd.hueOffset);
            hm.setParameter('uHueRange', qd.hueRange);
            hm.setParameter('uSaturation', qd.saturation);
            hm.setParameter('uTime', this._hazeTime || 0);
            hm.update();
        }
    }

    /* que el próximo _updateZones reescanee y reenvíe sí o sí (pudo cambiar
       el tag, el margen o el desvanecido) */
    this._zoneCount = -1;
    this._roomScanT = 0;
    this._updateZones();

    for (var mi = 0; mi < this._layers.length; mi++) this._layers[mi].material.update();
};


/* =========================================================
   HABITACIONES (zonas sin células)
   ---------------------------------------------------------
   El vaciado se hace en el VERTEX SHADER sobre la posición YA ENVUELTA: por
   eso el hueco se queda quieto en el mundo aunque el campo sea infinito y las
   células estén saltando de copia en copia. La alternativa —no generar esas
   células en CPU— no sirve con el wrap encendido: la célula que hoy está lejos
   mañana se envuelve justo dentro de la habitación.
   ========================================================= */

/* Junta las mesh instances de la habitación INCLUYENDO las de sus hijos: una
   habitación suele ser una entidad vacía con el modelo colgando abajo, y
   mirando solo el render propio quedaba una caja de 1x1x1. La lista se cachea
   —findComponents recorre el árbol y aloca— y se rehace cuando cambia el array
   de volúmenes; si le agregás hijos a una habitación en marcha, llamá a
   rebuild(). */
OrganicCells.prototype._roomMeshes = function (entity) {
    var out = [];
    var comps = entity.findComponents('render');
    var i, j;
    for (i = 0; i < comps.length; i++) {
        var mis = comps[i].meshInstances;
        if (mis) for (j = 0; j < mis.length; j++) out.push(mis[j]);
    }
    comps = entity.findComponents('model');
    for (i = 0; i < comps.length; i++) {
        var mm = comps[i].meshInstances;
        if (mm) for (j = 0; j < mm.length; j++) out.push(mm[j]);
    }
    return out;
};

/* Caja de una habitación: la envolvente real del modelo (con hijos) si lo hay,
   y si la entidad está vacía, su cubo unitario TRANSFORMADO por la matriz de
   mundo. Ojo con esto último: no alcanza con leer la escala, porque las zonas
   del shader son cajas alineadas a los ejes y la escala está medida sobre los
   ejes LOCALES. Un pasillo de escala (2,3,10) rotado 90° en Y mide 10x3x2 en
   el mundo, y con la escala cruda el hueco quedaba atravesado. Transformar el
   cubo da la envolvente correcta (para rotaciones intermedias agranda un poco
   el hueco, que es el lado seguro) y de paso tolera escalas negativas. */
OrganicCells.prototype._roomBox = function (entity, mis) {
    if (mis && mis.length) {
        this._zoneBox.copy(mis[0].aabb);
        for (var i = 1; i < mis.length; i++) this._zoneBox.add(mis[i].aabb);
    } else {
        this._zoneBox.setFromTransformedAabb(OrganicCells._unitBox(), entity.getWorldTransform());
    }
    this._zoneC.copy(this._zoneBox.center);
    this._zoneH.copy(this._zoneBox.halfExtents);
};

/* AABB deliberadamente ENORME para todo lo que dibuja este script. El campo
   es infinito (se envuelve alrededor de la cámara) y la neblina se coloca
   alrededor de la cámara dentro del vertex shader: en los dos casos la caja
   real no tiene nada que ver con la posición de la entidad, que es lo único
   que el motor puede ver. Con cull = false ya alcanzaría, pero si algo llegara
   a reactivar el culling (o el motor cambia), una caja del tamaño del mundo
   evita el síntoma clásico: el campo entero apareciendo y desapareciendo según
   a dónde apunte la cámara. */
OrganicCells._hugeAabb = function () {
    if (!OrganicCells._huge) {
        OrganicCells._huge = new pc.BoundingBox(new pc.Vec3(0, 0, 0),
            new pc.Vec3(100000, 100000, 100000));
    }
    return OrganicCells._huge;
};

/* Marca una mesh instance como "no la cullees nunca". */
OrganicCells._neverCull = function (mi) {
    mi.cull = false;
    if (mi.setCustomAabb) mi.setCustomAabb(OrganicCells._hugeAabb());
};

OrganicCells._unitBox = function () {
    if (!OrganicCells._unit) {
        OrganicCells._unit = new pc.BoundingBox(new pc.Vec3(0, 0, 0), new pc.Vec3(0.5, 0.5, 0.5));
    }
    return OrganicCells._unit;
};

OrganicCells.prototype._sendZones = function (count) {
    for (var i = 0; i < this._layers.length; i++) {
        var mat = this._layers[i].material;
        mat.setParameter('uZoneCount', count);
        mat.setParameter('uZoneCenter[0]', this._zoneCenter);
        mat.setParameter('uZoneHalf[0]', this._zoneHalf);
    }
};

/* Cámara de referencia. Sirve para UNA cosa: cuando hay más habitaciones
   cerca que ranuras en el shader, decidir cuáles entran. app.systems.camera
   .cameras tiene solo las cámaras ACTIVAS y ordenadas por prioridad
   (verificado en el fuente de 2.7.4: addCamera/removeCamera + sortPriority),
   así que la primera es la del mundo salvo que tengas cámaras de overlay. */
OrganicCells.prototype._refCamera = function () {
    var e = this.rooms.camera;
    if (e && e.enabled) return e;
    var sys = this.app.systems ? this.app.systems.camera : null;
    var cams = sys ? sys.cameras : null;
    if (cams && cams.length) return cams[0].entity;
    return null;
};

/* Busca las habitaciones: las del TAG más las de la lista manual, sin
   repetir. findByTag recorre TODO el grafo y aloca un array, por eso esto va
   por intervalo y no por frame. Si el conjunto no cambió se conserva la caché
   de mallas (que es lo caro: findComponents recorre cada subárbol). */
OrganicCells.prototype._scanRooms = function () {
    var found = this._roomFound;
    found.length = 0;

    var i;
    var list = this.rooms.volumes;
    if (list) {
        for (i = 0; i < list.length; i++) {
            if (list[i] && found.indexOf(list[i]) < 0) found.push(list[i]);
        }
    }

    var tag = this.rooms.tag;
    if (tag && typeof tag === 'string' && tag.length) {
        if (this._tagKey !== tag) {
            this._tagKey = tag;
            /* varios tags separados por coma o espacio: findByTag con varios
               argumentos es un O (cualquiera de ellos), que es lo que se espera */
            this._tagArgs = tag.split(/[,\s]+/).filter(function (s) { return s.length > 0; });
        }
        if (this._tagArgs.length) {
            var tagged = this.app.root.findByTag.apply(this.app.root, this._tagArgs);
            /* findByTag no repite nodos ni con varios tags (empuja uno por nodo
               que pase el filtro), asi que el indexOf —que es O(n²)— solo hace
               falta si ademas hay lista manual con la que chocar */
            var dedupe = found.length > 0;
            for (i = 0; i < tagged.length; i++) {
                if (!dedupe || found.indexOf(tagged[i]) < 0) found.push(tagged[i]);
            }
        }
    }

    var ents = this._roomEnts;
    var same = (ents.length === found.length);
    if (same) {
        for (i = 0; i < found.length; i++) {
            if (ents[i] !== found[i]) { same = false; break; }
        }
    }
    if (!same) {
        ents.length = 0;
        this._roomMis.length = 0;
        for (i = 0; i < found.length; i++) {
            ents.push(found[i]);
            /* findByTag devuelve nodos del grafo; los de la escena son entidades,
               pero un nodo pelado no tiene findComponents y va por la caja de escala */
            this._roomMis.push(found[i].findComponents ? this._roomMeshes(found[i]) : null);
        }
        if (this._roomBoxes.length < ents.length * 6) {
            this._roomBoxes = new Float32Array(ents.length * 6);
        }
        if (this._roomRad.length < ents.length) {
            this._roomRad = new Float32Array(ents.length);
        }
        this._warnedRooms = false;   /* cambió el conjunto: el aviso vuelve a tener sentido */
    }

    /* Cada escaneo BORRA los radios cacheados. Es lo que le pone límite al
       atajo: una habitación lejana a la que le cambiaron la ESCALA (o que
       tiene hijos que se movieron solos) se vuelve a medir como muy tarde en
       un Scan Interval, el mismo contrato que ya tenían las altas y bajas.
       Mover y ROTAR no necesitan esto: la esfera está centrada en la posición
       de la entidad, o sea que viaja con ella y girar no cambia la distancia
       de ningún punto a ese centro. */
    this._roomRad.fill(-1);
};

OrganicCells.prototype._updateZones = function (dt) {
    if (!this._built) return;

    var iv = this.rooms.scanInterval;
    if (!(iv >= 0)) iv = 0.5;              /* escena vieja sin el campo */
    this._roomScanT -= (dt || 0);
    if (this._roomScanT <= 0) {
        this._roomScanT = iv;
        this._scanRooms();
    }

    var ents = this._roomEnts;
    var total = ents.length;

    /* caso normal (sin habitaciones): se manda una sola vez, pero SÍ se mandan
       los dos arrays en cero. En WebGL daría igual, pero el uniform buffer de
       WebGPU recorre todos sus campos al actualizarse y un uniform sin valor
       queda con basura del buffer reciclado (y avisa por consola). */
    if (total === 0) {
        if (this._zoneCount !== 0) {
            this._zoneCount = 0;
            this._zoneCenter.fill(0);
            this._zoneHalf.fill(0);
            this._sendZones(0);
        }
        return;
    }

    var max = OrganicCells.MAX_ROOMS;
    var margin = this.rooms.margin;
    var fade = Math.max(0.01, this.rooms.fade);

    /* ALCANCE: una habitación solo puede afectar a una célula VISIBLE, y las
       visibles están a lo sumo a la distancia de visión efectiva de la cámara.
       Sumando lo que la zona se agranda (margen, desvanecido y el radio de la
       célula más grande ya empujada por Far Size Boost), cualquier habitación
       más lejos que esto es irrelevante y no ocupa ranura. Pasarse es gratis
       —igual entran primero las más cercanas—; quedarse corto sería un bug. */
    var rMax = Math.max(0.005, this.cell.cellRadius *
        (1 + 0.8 * Math.max(0, this.cell.radiusVariation))) *
        (1 + Math.max(0, this.background.farSizeBoost));
    var reach = this._effectiveFar() + fade + margin + rMax;
    var reach2 = reach * reach;

    var cam = this._refCamera();
    var cp = cam ? cam.getPosition() : null;

    var boxes = this._roomBoxes;
    var rads = this._roomRad;
    var pick = this._roomPick;
    var pdist = this._roomDist;
    var used = 0;
    var dropped = 0;
    var i, k, pe;

    for (i = 0; i < total; i++) {
        var e = ents[i];
        if (!e || !e.enabled) continue;   /* una habitación apagada no vacía nada */

        /* RECHAZO BARATO. Calcular la caja de una habitación no es gratis
           (transformar la envolvente de cada malla de su subárbol al mundo), y
           sin esto se pagaba por TODAS las del nivel, aunque estuvieran del
           otro lado del mapa. Con la esfera cacheada del frame anterior
           alcanza una resta y un producto por habitación: el coste pasa a
           crecer con las que están CERCA, no con cuantas haya. */
        var rad = rads[i];
        if (cp && rad >= 0) {
            pe = e.getPosition();
            var ex = pe.x - cp.x, ey = pe.y - cp.y, ez = pe.z - cp.z;
            var lim = reach + rad;
            if (ex * ex + ey * ey + ez * ez > lim * lim) continue;
        }

        this._roomBox(e, this._roomMis[i]);
        var b = i * 6;
        boxes[b] = this._zoneC.x; boxes[b + 1] = this._zoneC.y; boxes[b + 2] = this._zoneC.z;
        boxes[b + 3] = this._zoneH.x; boxes[b + 4] = this._zoneH.y; boxes[b + 5] = this._zoneH.z;

        /* se refresca la esfera del rechazo barato: distancia de la posición
           de la entidad al centro de la caja, más la diagonal de la caja. Es
           una cota SEGURA (la caja entra entera) y no depende de la rotación. */
        pe = e.getPosition();
        var ox = boxes[b] - pe.x, oy = boxes[b + 1] - pe.y, oz = boxes[b + 2] - pe.z;
        rads[i] = Math.sqrt(ox * ox + oy * oy + oz * oz) +
                  Math.sqrt(boxes[b + 3] * boxes[b + 3] + boxes[b + 4] * boxes[b + 4] +
                            boxes[b + 5] * boxes[b + 5]);

        /* distancia CÁMARA→CAJA (0 si está adentro). Es lo que hace que el
           orden no dependa del tamaño: una habitación enorme cuyo centro queda
           lejisísimos pero que te envuelve da 0 y entra primera, que es justo
           lo que con la distancia al centro fallaba. */
        var d2 = 0;
        if (cp) {
            var dx = Math.abs(cp.x - boxes[b]) - boxes[b + 3];
            var dy = Math.abs(cp.y - boxes[b + 1]) - boxes[b + 4];
            var dz = Math.abs(cp.z - boxes[b + 2]) - boxes[b + 5];
            if (dx > 0) d2 += dx * dx;
            if (dy > 0) d2 += dy * dy;
            if (dz > 0) d2 += dz * dz;
            if (d2 > reach2) continue;
        }

        /* inserción ordenada en las ranuras: la más cercana SIEMPRE entra */
        if (used < max) {
            k = used++;
        } else {
            if (d2 >= pdist[max - 1]) { dropped++; continue; }
            dropped++;              /* la que se cae de la última ranura */
            k = max - 1;
        }
        while (k > 0 && pdist[k - 1] > d2) {
            pdist[k] = pdist[k - 1];
            pick[k] = pick[k - 1];
            k--;
        }
        pdist[k] = d2;
        pick[k] = i;
    }

    var c = this._zoneCenter;
    var h = this._zoneHalf;
    for (var s = 0; s < used; s++) {
        var o = s * 4;
        var q = pick[s] * 6;
        c[o] = boxes[q]; c[o + 1] = boxes[q + 1]; c[o + 2] = boxes[q + 2]; c[o + 3] = 0;
        h[o] = boxes[q + 3] + margin;
        h[o + 1] = boxes[q + 4] + margin;
        h[o + 2] = boxes[q + 5] + margin;
        h[o + 3] = fade;
    }

    /* el aviso cuenta las que se DESCARTARON de verdad: las que están cerca
       pero no entraron. Las lejanas irrelevantes y las apagadas no cuentan. */
    if (dropped > 0 && this.amount.debug && !this._warnedRooms) {
        this._warnedRooms = true;
        console.warn('organicCells: hay ' + dropped + ' habitaciones cerca de la cámara que ' +
            'no entraron: el shader atiende ' + max + ' a la vez y quedan las más cercanas. ' +
            'Podés subir OrganicCells.MAX_ROOMS (arriba del archivo, se propaga sola a los ' +
            'dos shaders) o juntar habitaciones vecinas en una sola caja.');
    }

    this._zoneCount = used;
    this._sendZones(used);
};

OrganicCells.prototype._destroyResources = function () {
    for (var i = 0; i < this._layers.length; i++) {
        var L = this._layers[i];
        if (L.meshInstance) L.meshInstance.setInstancing(null);
    }
    if (this._vertexBuffer) {
        this._vertexBuffer.destroy();
        this._vertexBuffer = null;
    }
    if (this._holder) {
        this._holder.destroy();   /* destruye las entidades de capa (y la neblina), sus render y mesh instances */
        this._holder = null;
    }
    for (var j = 0; j < this._layers.length; j++) {
        if (this._layers[j].material) this._layers[j].material.destroy();
    }
    if (this._haze && this._haze.material) this._haze.material.destroy();
    this._haze = null;
    this._layers = [];
    this._built = false;
};


/* =========================================================
   API PÚBLICA
   ========================================================= */

/* CAMBIAR VALORES POR CÓDIGO — usá esto y no la asignación directa.

   Al agrupar en secciones, el atributo pasó a ser un objeto json, y el engine
   lo RECONSTRUYE ENTERO desde el schema en cada asignación: no hay merge. O sea

       this.amount = { cellCount: 900 };     // <- pisa regionSize, seed y wrap
                                             //    con sus valores por defecto

   y, del otro lado, escribir un campo suelto no avisa a nadie:

       this.amount.cellCount = 900;          // <- no dispara 'attr': no pasa nada

   set() hace lo correcto: copia la sección actual, aplica solo los campos que
   le pasás y reasigna, lo que dispara el evento y deja que el script decida si
   toca regenerar las instancias o basta con reenviar uniforms.

       cells.set('amount', { cellCount: 400 });
       cells.set('background', { start: 8, enabled: true });
       cells.set('cell', { translucency: 0.9, nucleusGlow: 1.5 });

   (Los colores y vectores se reenvían como pc.Color / pc.Vec3, que es un tipo
   que el conversor del engine acepta tal cual.) */
OrganicCells.prototype.set = function (section, values) {
    var current = this[section];
    if (!current || typeof current !== 'object') {
        console.warn('organicCells.set: sección desconocida "' + section +
            '". Son: visibility, amount, quadrants, realism, rooms, background, haze, cell.');
        return;
    }

    var merged = {};
    var k;
    for (k in current) merged[k] = current[k];
    for (k in values) {
        if (!current.hasOwnProperty(k)) {
            console.warn('organicCells.set: "' + section + '" no tiene el campo "' + k + '".');
            continue;
        }
        merged[k] = values[k];
    }

    this[section] = merged;
};

/* DIAGNÓSTICO en vivo. Si ves algo raro —células que aparecen y desaparecen,
   triángulos o draw calls que se disparan— llamalo desde la consola del
   launcher y mandame la salida:

       var c = pc.app.root.findByName('TU_ENTIDAD').script.organicCells;
       console.log(JSON.stringify(c.report(), null, 2));

   Lo importante: 'culleable' tiene que ser false en las tres filas (si alguna
   dice true, el motor puede sacar esa capa entera según a dónde mire la
   cámara, y ahí es donde el campo aparece y desaparece), y 'triangulos' es
   exactamente lo que este script le pide a la GPU por frame. */
OrganicCells.prototype.report = function () {
    var out = {
        version: OrganicCells.VERSION,
        construido: !!this._built,
        modo: this.visibility.renderMode,
        celulasEnBuffer: this._layers.length ? this._layers[0].count : 0,
        habitacionesTag: this.rooms.tag || '(sin tag)',
        habitacionesEncontradas: this._roomEnts.length,
        habitacionesActivas: this._zoneCount,
        habitaciones: [],
        capas: [],
        triangulos: 0,
        drawCalls: 0
    };
    for (var i = 0; i < this._layers.length; i++) {
        var L = this._layers[i];
        var inst = L.meshInstance.instancingData;
        var activa = !!(L.holder && L.holder.enabled);
        out.capas.push({
            capa: L.name,
            activa: activa,
            culleable: L.meshInstance.cull,
            instancias: inst ? inst.count : 0,
            instancingOk: !!(inst && inst.vertexBuffer),
            material: L.material.name,
            blendType: L.material.blendType,
            depthWrite: L.material.depthWrite
        });
        if (activa) {
            out.triangulos += (inst ? inst.count : 1) * 2;
            out.drawCalls += 1;
        }
    }
    for (var r = 0; r < this._zoneCount; r++) {
        var ro = r * 4;
        out.habitaciones.push({
            entidad: (this._roomEnts[this._roomPick[r]] || {}).name || '?',
            centro: [this._zoneCenter[ro], this._zoneCenter[ro + 1], this._zoneCenter[ro + 2]],
            tamano: [this._zoneHalf[ro] * 2, this._zoneHalf[ro + 1] * 2, this._zoneHalf[ro + 2] * 2],
            distanciaCamara: Math.sqrt(this._roomDist[r])
        });
    }
    if (this._haze) {
        var ha = !!this._haze.holder.enabled;
        out.capas.push({
            capa: 'neblina', activa: ha,
            culleable: this._haze.meshInstance ? this._haze.meshInstance.cull : 'desconocido',
            instancias: 0, material: this._haze.material.name,
            blendType: this._haze.material.blendType, depthWrite: this._haze.material.depthWrite
        });
        if (ha) { out.triangulos += 12; out.drawCalls += 1; }
    }
    return out;
};

/* Rehace el campo entero. Solo hace falta si tocaste los atributos SIN pasar
   por set() (mutando un campo suelto), o tras mover la entidad con el campo
   infinito apagado. */
OrganicCells.prototype.rebuild = function () {
    /* vaciar la lista obliga a rehacer la caché de mallas en el próximo scan:
       es lo que hay que llamar si le colgaste hijos a una habitación en marcha */
    this._roomEnts.length = 0;
    this._roomMis.length = 0;
    this._roomScanT = 0;
    if (!this._built) {
        this._build();
    } else {
        this._applyRenderMode();
        this._rebuildInstances();
    }
};
