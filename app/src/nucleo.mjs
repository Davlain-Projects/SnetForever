// Núcleo de la app (tarea 18): une todos los módulos. Recibe las tramas que lee la captura, reúne el mensaje, prepara el
// turno, se lo pregunta a la IA (Claude Code o Codex, a través de motor.mjs), procesa la respuesta y la devuelve al
// juego por el buzón de las ranuras y los timbres.
//
// Por cada mensaje completo:
//   1. toca `recibido_par` o `recibido_impar` (la paridad del n del id), apunta `recibidos[pj]` y guarda su `r`;
//   2. lo pone en la cola (de una en una; como mucho 3 a la vez, contando la que se está contestando: la cuarta recibe
//      `ocupado` enseguida); en su turno comprueba las cuentas, elige el motor, prepara los datos y pregunta;
//   3. escribe el registro con `seq = max(seq guardado, c) + 1` (datos/estado.json, reescrito de forma atómica);
//   4. escribe el buzón en las ranuras de `r` a `r + 15` (la `r` del último mensaje; las 20 si aún no hay ninguna) y toca
//      el timbre de buzón;
//   5. apunta la pregunta y la respuesta en el historial.
// UNA RANURA POR MENSAJE: el «recibido» viaja solo por su timbre y por `recibidos[pj]` dentro del mismo buzón de la
// respuesta; nunca se publica un buzón aparte para él.
//
// SEGURIDAD: antes de cada turno se llama a `comprobar()` de Claude y de Codex (con memoria de 60 s, y siempre después de
// un error de cuenta), y nunca se pregunta si `elegirMotor` no da un motor en `ok`: entonces el registro es un error con
// el texto de P6 (o el de `sin_motor`). Los errores de la IA pasan a registros con su texto de P6 en el idioma del
// mensaje, y `estado.claude` / `estado.codex` se ponen al día en la cabecera del buzón.
//
// NUNCA se apuntan en registro.log las preguntas, las respuestas ni los nombres de los personajes: solo ids de mensaje,
// estados, tipos de error y tiempos. Nada se borra: estado.json se reescribe con temporal y renombre, y uno roto va a la
// cuarentena de datos.
//
// crearNucleo({base, addonsDir, timbres, historial, datos, reloj, motor?, comprobar?, programas?, modulos?, config?,
//              tiempoMax?, raizVolumen?, fs?, misionesApi?, comercioDatos?, carpetaBase?, herramientas?, obtener?,
//              estadoJuego?, puente?, estadoTati?, cerebro?})
//              -> {recibirTrama, publicarEstado, estado, alCambiar, inactivo, recargarBase, baseActual, empujar,
//                  armarRespuesta}
//   base        Promise<Base> (o la base ya cargada), o una función que la carga
//   recargarBase()  (fase 5, tarea 13) vuelve a llamar a `base()` y solo cambia la base cuando la nueva carga bien; si
//                   falla, sigue la de antes y se apunta. → Promise<boolean> (false también si `base` no es una función)
//   baseActual()    la base en uso (una promesa)
//   addonsDir   carpeta AddOns del juego (con las ranuras ya creadas por prepararAddOns); de ahí se lee también (solo se
//               lee) SnetForever_MisGuias\mis-guias.lua, las guías propias del jugador (misguias.mjs)
//   timbres     lo que da crearTimbres (se crean una vez fuera); el núcleo arranca su vida (empezarVida)
//   historial   lo que da crearHistorial(datos)
//   datos       carpeta de datos (por defecto carpetaDatos())
//   reloj       {ahora() -> ms} (por defecto Date.now)
//   motor       el módulo motor.mjs (o uno de prueba con elegirMotor, preguntar y estadoMotor)
//   comprobar   {claude: async () => estado, codex: async () => estado}; por defecto los comprobar() reales
//   programas, modulos   se pasan tal cual a motor.preguntar (las pruebas los usan para el claude falso)
//   config      objeto o función que lo da; por defecto leerConfig() de `datos` en cada turno (config.motor)
//   tiempoMax   tiempo máximo de cada pregunta (por defecto el del modelo: 120 s el rápido, 180 s el listo y 300 s el más capaz con Claude)
//   comercioDatos  (tarea 15) async (mensaje) -> {historial, catalogo, casa, otrasCasas} | null: la fuente de los datos de
//               comercio de la app para la IA (contexto.mjs, extra.comercio). Por defecto, ninguna (null): el cableado con
//               el historial y el catálogo reales lo hace principal.mjs (Task 17a, fuenteDeComercio de comercio/ia.mjs).
//               Si falla, el turno sigue sin ella.
//   herramientas   (tarea 14) true: cada turno escribe <datos>\herramientas\turno.json (turnoDe: sin el nombre del
//               personaje) y pregunta con el servidor de guías: con Claude, asegurando mcp.json; con Codex (22-nov), con
//               solo las que leen (mcpCodex). Si no se pueden preparar, pregunta sin ellas. Al final de la respuesta va un
//               aviso (textoHerramientas) si el servidor no arrancó (`mcp.snetforever` no es 'connected'; en modo json no
//               se sabe y no se dice nada) o no se pudo preparar ('no_arrancaron'), si esta versión de Claude Code no
//               puede ('sin_opciones') o si Codex no pudo usarlas y el mensaje habla de guías ('codex'). Por defecto false.
//   carpetaBase  (tarea 14) la carpeta de la base que va en turno.json (el servidor carga de ahí la base)
//   obtener     (tarea 20) obtenerPagina de actualizar/red.mjs (las pruebas pasan uno falso): baja las páginas de los
//               puntos de internet de una guía de la IA
//   estadoJuego (S4) lo que da crearEstadoJuego de tati/estado.mjs (por defecto ninguno): el último estado de cada
//               personaje para TATI
//   puente      (S4) () -> {activo, cerebro} (por defecto puenteDe(config) de tati/config.mjs, en cada uso)
//   estadoTati  (S4) () -> estado de TATI para la cabecera con el cerebro 'tati' (por defecto `cerebro.ultimo()` si hay
//               cerebro; si no, 'desconocido')
//   cerebro     (S5) lo que da crearCerebro de tati/cerebro.mjs (por defecto ninguno): TATI como cerebro de los turnos
//
// S5, TATI como cerebro. Con `puente().cerebro === 'tati'` y `cerebro`, turno() no mira las cuentas de Claude ni de
// Codex ni los arranca (el modelo que elige el addon no cuenta): arma los datos del turno como siempre y se los pasa a
// `cerebro.turno` (instrucciones SISTEMA_TATI: el núcleo de sistema.md con el índice de temas, que TATI pide con la
// herramienta `instrucciones`, siempre el mismo texto; el bloque <datos_juego>, el texto neutralizado, el idioma y
// `nueva`; sin historial: el chat de TATI lleva el suyo). Su texto pasa por lo mismo que el de Claude, con las páginas
// «propias» (la app baja las de los puntos de internet del bloque) y `motor: 'tati'`; un error, al registro con su texto
// de TATI (textoError(tipo, …, 'tati')). En registro.log solo el id, el tipo y los ms, nunca lo que dice TATI.
//
// Turno largo de TATI. Mientras dura, la cabecera del buzón lleva `turno` = id del mensaje (se publica sin timbre al
// empezar: es lo que ve el jugador sin sonido) y cada 30 s se toca `recibido_par` o `recibido_impar`, la paridad del
// mensaje, como aviso de que sigue: no gasta ranuras ni crea archivos, y nunca hay más de un pulso pendiente. Deja de
// pulsar en cuanto hay otro mensaje del mismo pj en la cola: el pulso solo lleva la paridad y pasaría por el acuse de ese.
// Un mensaje `{tipo: 'parar', pj, idioma, id: '<sesión>-P<k>', turno: '<id del mensaje>'}` se trata como el latido: ni
// cola, ni registro, ni recibidos, ni historial, ni seq. Si `turno` es el turno de TATI en curso de ese pj, llama a
// `cerebro.parar()`; si ese mensaje aún espera en la cola, al llegarle contesta `detenido` sin preguntar a TATI (se
// recuerda solo ese id) y, si lo que tiene delante es un turno de TATI del mismo pj, se para también. Si no, se ignora,
// y un id de parar repetido tampoco hace nada.
//
// S4, el puente con TATI. Apagado (sin `puenteTati.activo` en la config, la versión pública) todo es como siempre: un
// mensaje con `tipo: 'latido'` se ignora (ni registro, ni ranuras, ni estado), la cabecera no cambia y no hay registros
// de TATI (solo los publica `empujar`, que solo llama el puente). Con el puente activo:
//   - un latido (`tipo: 'latido'`) solo apunta el estado del juego (estadoJuego.apuntar) y guarda su r y su cursor `c`
//     para la próxima publicación: sin cola, sin registro, sin timbres, sin `recibidos`, sin historial y sin subir seq;
//     registro.log dice «latido» solo si cambia la r o ha pasado un minuto. Un mensaje normal también lo apunta y se
//     contesta como siempre;
//   - cada publicación con timbre que escribe alguna ranura gasta una del estado del juego (estadoJuego.gastar, en
//     publicar: respuestas, errores, «ocupado», estados y registros de TATI; Ruling P8);
//   - la cabecera del buzón lleva `latido: true` (el addon manda entonces sus latidos) y, con el cerebro 'tati',
//     `motorNombre: 'tati'` y `motor` el estado de `estadoTati()`.
//   empujar({pj?, parcial, idioma?})
//                -> Promise<{registro} | {error: 'sin_puente' | 'sin_personaje' | 'sin_ranuras' | 'sin_latido'}>
//                un registro que no contesta a ninguna pregunta, `{seq, pj, msg: 'tati-<seq>', origen: 'tati', ...parcial}`
//                con seq = max(seq guardado, cursor más alto del addon) + 1, del personaje del último latido (o `pj`),
//                publicado con las ranuras 1…16 y r…r+15 y timbre. Con el puente apagado: sin_puente; sin estado del
//                juego: sin_personaje; con ranurasQuedan() === 0: sin_ranuras; sin ningún latido ni mensaje en esta
//                ejecución (la app recién reiniciada no sabe en qué ranura va el addon: lo escrito no se vería) y sin lo
//                guardado en puente-tati/latido.json (la r y el cursor del último latido o mensaje, de este mismo
//                personaje y de hace LATIDO_VALE_MS como mucho): sin_latido. En los cuatro casos no se escribe nada.
//                Con el puente activo, cada latido y cada mensaje guardan ahí su personaje, r, cursor y hora.
//   Revisión final: un mensaje ilegible cuyo id es de latido (…-L<n>) se descarta: ni error, ni recibidos, ni ranura.
//   armarRespuesta({pj?, mensaje, texto, idioma, id?, paginas?, motor?}) -> Promise<{parcial, historia, quitados, ruta, dibujos,
//                confirmar}>  (confirmar(): aplica los cambios de los tramos pendientes; quien publica lo llama si publicó)
//                lo que turno() hace con el texto de la IA (páginas de verdad, procesarRespuesta, la guía de la IA,
//                rutaZona, el pie, propuesta, marcas, comercio y guía), sin preguntar ni publicar: `mensaje` es el del
//                juego y `texto` el de la respuesta; `pj` por defecto el del último estado. `paginas`: null = como sin
//                stream-json; 'propias' = las direcciones del bloque (como mucho 3), que la app baja ella misma (TATI no
//                da las páginas que leyó). `quitados`: la lista de procesarRespuesta; `ruta`: {tramos, pasos, misiones,
//                quitados: {misiones, puntos, pasos, tramos, textos}} de la guía de la IA, o null si no la trae;
//                `dibujos`: {trazos, descartados} de los dibujos del bloque (procesarRespuesta), o null si no trae.
//
// Tarea 20: la guía que crea la IA (bloque `guiaNueva`). Cada turno lleva `puntoDeMarca` (las marcas de origen, con la
// base, el personaje, su mapa y los pasos de la biblioteca: crearLectorGuias sobre `datos`). Con `guiaNueva`, la app:
//   1. por cada dirección de sus puntos `web` que Claude leyó en esta pregunta (`r.paginas`; como mucho 3) busca el texto
//      DE VERDAD de la página: la copia guardada en la biblioteca (guias\enlaces, cabecera «# Dirección:») o, si no hay,
//      la baja (15 s cada una, a la vez; la que falla deja sus puntos fuera). El resumen de Claude nunca vale. Revisión
//      final: las direcciones de los `pinesWeb` entran en el mismo cupo de 3 y cada pin se comprueba igual que un `web`
//      (datosTurno.puntoDeWeb, que usa procesarRespuesta); esto se hace antes de procesar la respuesta, haya guía o no;
//   2. la comprueba (comprobarGuiaNueva: misiones de la base o de la biblioteca, puntos y webs) y la pasa a guías del
//      addon (guiasDeRuta), que son sus tramos;
//   3. manda el primero en `guiaIA` con `abrirGuiaIA` (el jugador la pidió: se abre sola) y añade al texto, enteros, el
//      resumen y lo que se ha quitado (lo que cortó guiaNuevaValida y lo de la comprobación); sin pasos, «sin_pasos».
// Los demás tramos quedan pendientes por personaje: un «sigue» (esSigue) se contesta sin preguntar a la IA con el
// siguiente. Sin pendientes, el «sigue» va a la IA como cualquier mensaje. Ronda 2 de abrir_guia (decisión 3): duran hasta
// que se abre otra guía (abrirGuia, guiaNueva, crear_ruta o una rutaZona con guía) o pasan TRAMOS_CADUCAN_MS (T3: 7 días; antes 6 h, como
// el latido; cada «sigue» vuelve a contar), aunque entre medias el jugador pregunte otra cosa o empiece una charla nueva,
// y se guardan en <datos>\tramos-pendientes.json (escribirAtomico), así que valen también tras reiniciar la app. Los de
// una acción de TATI (armarRespuesta) solo cambian cuando lo armado se publica (`confirmar`, M1).
// abrirGuia ({guia, desde?, hasta?}: una guía de la biblioteca TAL CUAL, la IA solo elige cuál y desde dónde; también
// abrir_guia de TATI, que llega aquí con ese bloque): la expande guiaBiblioteca.mjs (expandirGuia) con el lector de la
// biblioteca, y sigue como la guiaNueva (2 y 3: la misma comprobación, guiasDeRuta, guiaIA con abrirGuiaIA y los tramos
// pendientes). Cada tramo es una guía del addon y van como mucho 8; si la guía sigue, lo que falta queda con los tramos
// pendientes (`biblioteca`: el pedido del resto): el «sigue» tras el último tramo la abre desde el paso siguiente, sin
// preguntar a la IA. I1: un abrirGuia con ese mismo pedido mientras quedan tramos pendientes manda el siguiente de ellos
// (así TATI, con el `siguiente` que le dio abrir_guia, no se salta ninguno). Con un id que no está en la biblioteca no hay
// guía y el texto lo dice en una línea. Gana sobre una guiaNueva del mismo bloque.
// Con rutaZona, `abrirGuiaIA` solo si el mensaje pide una guía o una ruta (pideGuia); entonces (revisión final) la ruta
// se construye con `sinNivel` y `mazmorras`: nada quitado por nivel ni por mazmorra.
// En registro.log solo van contadores: ni el título de la ruta ni las direcciones de las páginas.
//
//   recibirTrama(bytes) -> Promise   la carga de una trama (P1). La promesa acaba cuando el mensaje está contestado,
//                                    publicado y sus timbres tocados (null si la trama no completa nada). Nunca se rechaza.
//   publicarEstado(estados?) -> Promise   pone al día los estados (los que se pasan o, si no, comprueba) y publica el
//                                    buzón: las 20 ranuras si aún no ha llegado ningún mensaje (sin timbre), o de r a r+15
//                                    y de 1 a 16 con timbre (la 1…16, por si el juego se reinició y el addon volvió a la 1).
//   estado(idioma = 'es') -> {motor, estadoMotor, texto, estados: {claude, codex}, enCola, seq, publicaciones, ultimo}
//   alCambiar(fn) -> quitar          fn(estado()) en cada cambio
//   inactivo() -> Promise            acaba cuando no queda nada en la cola ni por publicar (para las pruebas y al cerrar)
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { leerTrama, crearReunidor } from './franja/mensajes.mjs';
import { prepararTurno } from './contexto.mjs';
import { leerGuiaRutas } from './guiasAddon.mjs';
import { misionApiParaMensaje } from './comercio/misiones-api.mjs';
import { SISTEMA, SISTEMA_TATI, construirEntrada, bloqueDatos, neutralizar } from './prompt.mjs';
import { procesarRespuesta, renderizar, direccionesWeb } from './respuesta.mjs';
import { comprobarGuiaNueva, guiasDeRuta, crearComprobadorWeb } from './rutaIA.mjs';
import { expandirGuia, pedidoValido } from './guiaBiblioteca.mjs';
import { puntoDeMarca } from './herramientas/marcas.mjs';
import { crearLectorGuias } from './herramientas/fuentes.mjs';
import { obtenerPagina, urlDePagina } from './actualizar/red.mjs';
import { normal } from './biblioteca/texto.mjs';
import { CARPETA_GUIAS } from './biblioteca/indice.mjs';
import { CARPETA_ENLACES, textoDePagina } from './biblioteca/enlaces.mjs';
import { construirRutaZona, resolverZona } from './rutaZona.mjs';
import * as motorReal from './motor.mjs';
import { comprobar as comprobarClaude, resolverClaude } from './claude.mjs';
import { comprobar as comprobarCodex, resolverCodex } from './codex.mjs';
import { tablaBuzon, escribirRanuras, escribirAtomico, aLuaSeguro, RANURAS, MAX_REGISTROS, MAX_RECIBIDOS } from './buzon.mjs';
import { textoError, textoDetalle, textoHerramientas, textoGuiaNueva } from './textos.mjs';
import { leerMisGuias, hablaDeGuias } from './misguias.mjs';
import { NOMBRE_SERVIDOR, HERRAMIENTAS, turnoDe, escribirTurno, asegurarMcpHerramientas, mcpCodex } from './herramientas/config.mjs';
import { carpetaDatos, leerConfig, sello } from './rutas.mjs';
import { TURNOS } from './historial.mjs';
import { log } from './registro.mjs';
import { puenteDe, carpetaPuente } from './tati/config.mjs';
const TURNOS_RECIENTES = 3; // las guías con pasos de cuántos turnos se recuerdan (por personaje)
// Lo que la app guarda del último latido o mensaje (puente con TATI) vale para empujar tras un reinicio durante 6 h: una
// tarde de juego. Más allá lo normal es que el juego se haya cerrado o recargado (las ranuras vuelven a la 1) y el
// estado del personaje ya no dice nada; entonces sin_latido y TATI pide abrir el chat del juego.
export const LATIDO_VALE_MS = 6 * 60 * 60 * 1000;
export const MAX_COLA = 3; // mensajes a la vez (el que se contesta y los que esperan)
export const MEMORIA_ESTADOS_MS = 60_000;
export const RANURAS_POR_PUBLICACION = 16; // de r a r + 15
export const MAX_HISTORIAL_CARACTERES = 4000; // lo que ocupa como mucho el historial en la entrada de la IA
export const REINTENTO_BASE_MS = 60_000; // una base que no cargó se vuelve a pedir como mucho una vez por minuto
const MOTORES = ['claude', 'codex'];
const ESTADOS = ['ok', 'sin_instalar', 'sin_sesion', 'pago_por_uso', 'desconocido'];
// Errores tras los que el turno siguiente vuelve a comprobar las cuentas aunque no hayan pasado 60 s.
const ERRORES_DE_CUENTA = new Set(['sin_instalar', 'sin_sesion', 'pago_por_uso', 'desconocido', 'sin_motor']);
const MAX_VISTOS = 1000;
// T3 (B2, 17-nov: el tramo 2 se perdía en unas horas): los tramos pendientes de una guía duran hasta que se abre otra
// guía pedida; esto es solo un seguro de unos 7 días (antes, 6 h como el latido).
export const TRAMOS_CADUCAN_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PAGINAS_WEB = 3; // páginas que se miran por respuesta
export const TIEMPO_PAGINA_MS = 15_000; // cada una
const CABECERA_COPIA = /^#\s*Direcci[oó]n\s*:\s*(.+)$/i; // la primera línea de una copia de guias\enlaces
// Tarea 20: «sigue» y compañía, sin tildes, mayúsculas ni signos.
const SIGUES = new Set(['sigue', 'siguiente', 'siguiente tramo', 'continua', 'continue', 'next']);
/** ¿El mensaje solo pide el tramo siguiente? («sigue», «siguiente», «siguiente tramo», «continúa», «continue», «next») */
export const esSigue = (texto) => typeof texto === 'string' && SIGUES.has(normal(texto));
// R2: el jugador pide una guía o una ruta (o llegar a un sitio). Sobre el texto ya pasado por `normal`.
const PIDE_GUIA = /\b(?:crea|creame|hazme|haz|dame|ponme|quiero|make|create|give me)\b(?: [a-z0-9]+){0,3}? (?:guia|guias|ruta|rutas|route|routes|guide|guides)\b/;
const PIDE_IR = /\b(?:quiero (?:llegar|ir) a|llevame a|how do i get to|take me to)\b/;
/** ¿El mensaje pide una guía o una ruta? (es y en; entonces la guía de la app se abre sola en el juego) */
export function pideGuia(texto) {
    if (typeof texto !== 'string')
        return false;
    const t = normal(texto);
    return PIDE_GUIA.test(t) || PIDE_IR.test(t);
}
/**
 * T3 (B5): en qué parte va la guía de la IA con esta `clave` (la que manda el addon) y cuántas puede traer aún «sigue»,
 * con los pendientes `p` del personaje -> {i, n, pendientes} | null (una guía que no es de la IA). Si los pendientes son
 * de esa misma guía (su `clave`, la de la última parte mandada), de ellos; la continuación de una guía de la biblioteca
 * cuenta como una parte pendiente más, también en `n` (ronda 1, M7). Una entrada vieja sin `clave` vale si su `mandados`
 * es el «i» de la clave o, sin «i de n», si solo se mandó una. Si no, el «i de n» de la clave (o 1 de 1) y ninguna.
 */
export function tramoDePendientes(clave, p) {
    if (typeof clave !== 'string' || !clave.startsWith('IA\\'))
        return null;
    const m = /, (\d+) de (\d+)\)$/.exec(clave);
    const vieja = p?.clave === undefined && (m ? Number(m[1]) === p?.mandados : p?.mandados === 1);
    if (p && Array.isArray(p.guias) && (p.clave === clave || vieja)) {
        const pendientes = p.guias.length + (p.biblioteca?.sigue ? 1 : 0);
        return { i: p.mandados, n: p.mandados + pendientes, pendientes };
    }
    return m ? { i: Number(m[1]), n: Number(m[2]), pendientes: 0 } : { i: 1, n: 1, pendientes: 0 };
}
// Ronda 1 (I1): para la red S2 (una `ruta` no pedida con la guía a medias sale como pines), ¿pide el mensaje una ruta, una
// guía o llegar a un sitio? Más ancho que pideGuia (que solo decide si una rutaZona se abre sola): cualquier mensaje que
// nombre una ruta o una guía, y las formas corrientes de pedir que le lleven («llévame», «cómo llego», «guíame»,
// «márcame», «hazme», «necesito llegar», «dónde entrego», «a dónde tengo que ir», «how do I get», «where do I», «route
// me», «take me», «show me the way»…). Sobre el texto ya pasado por `normal`. «¿Por dónde voy?» (cómo va su guía) no.
const PIDE_RUTA = new RegExp('\\b(?:rutas?|routes?|guias?|guides?|llevame|guiame|marcame|hazme|necesito (?:llegar|ir)'
    + '|como (?:llego|voy|se llega|se va)|(?:a )?donde (?:entrego|entregar|tengo que (?:ir|entregar)|debo ir)'
    + '|how do i (?:get|go|reach)|where do i|route me|take me|show me the way|guide me|lead me)\\b');
/** ¿Pide el mensaje una ruta, una guía o llegar a un sitio? (es y en; la red S2 no actúa entonces) */
export function pideRuta(texto) {
    if (typeof texto !== 'string')
        return false;
    return pideGuia(texto) || PIDE_RUTA.test(normal(texto));
}
// La dirección de una página sin lo que no la distingue (#fragmento, barra final, http), como en rutaIA.mjs; null si
// no es una página pública.
function clavePagina(url) {
    const u = urlDePeticion(url);
    return u === null ? null : u.replace(/\/+$/, '');
}
// El personaje del turno para la base (como construirRutaZona): facción, raza, clase en mayúsculas y nivel.
function personajeDe(datosTurno) {
    const p = datosTurno?.datos?.personaje ?? {};
    return { faccion: p.faccion, raza: p.raza, clase: typeof p.clase === 'string' ? p.clase.toUpperCase() : undefined, nivel: p.nivel };
}
// La dirección que se pide: sin #fragmento y normalizada por urlDePagina (null si no es una página pública).
const urlDePeticion = (url) => (typeof url === 'string' ? urlDePagina(url.replace(/#.*$/s, '')) : null);
// S4/S5: las páginas «propias» de una respuesta: las direcciones de su bloque, que la app baja ella misma (TATI no dice
// qué páginas leyó). El tope de MAX_PAGINAS_WEB lo pone paginasDeVerdad.
const paginasPropias = (textoIA) => direccionesWeb(textoIA).map((url) => ({ url }));
/** La r de una trama (la siguiente ranura del addon) acotada a 1…RANURAS (20); lo que no es un entero vale 1. */
export function acotarRanura(r) {
    if (!Number.isInteger(r))
        return 1;
    return Math.min(Math.max(r, 1), RANURAS);
}
/**
 * Las rutas de claude y codex, resueltas una vez por proceso (where.exe es lento) y vueltas a buscar si el archivo ya no
 * existe. `programas.claude` / `programas.codex` son getters: lo que da `resolverClaude()` / `resolverCodex()`, o null.
 */
export function crearProgramas({ resolvedores = { claude: () => resolverClaude(), codex: () => resolverCodex() }, existe = fsReal.existsSync } = {}) {
    const memoria = {};
    const dar = (nombre) => {
        const c = memoria[nombre];
        if (c && existe(c.ruta))
            return c;
        const nuevo = resolvedores[nombre]();
        if (nuevo)
            memoria[nombre] = nuevo;
        else
            delete memoria[nombre];
        return nuevo || null;
    };
    return {
        get claude() {
            return dar('claude');
        },
        get codex() {
            return dar('codex');
        },
    };
}
const PROGRAMAS = crearProgramas(); // uno por proceso
/** Quita las líneas más viejas del historial hasta que sus textos ocupen ≤ `max` caracteres. */
export function recortarHistorial(lineas, max = MAX_HISTORIAL_CARACTERES) {
    const salida = [...lineas];
    let total = salida.reduce((n, l) => n + (typeof l?.texto === 'string' ? l.texto.length : 0), 0);
    while (salida.length > 0 && total > max)
        total -= salida.shift().texto?.length ?? 0;
    return salida;
}
/** recibidos[pj] = id por recencia: se borra y se vuelve a poner, y el tope de `max` conserva los más recientes. */
export function apuntarRecibido(recibidos, pj, id, max = MAX_RECIBIDOS) {
    delete recibidos[pj];
    recibidos[pj] = id;
    const claves = Object.keys(recibidos);
    for (let i = 0; i < claves.length - max; i++)
        delete recibidos[claves[i]];
    return recibidos;
}
const estadoDe = (estados, motor) => {
    const e = estados && typeof estados === 'object' && Object.hasOwn(estados, motor) ? estados[motor] : undefined;
    const s = e && typeof e === 'object' ? e.estado : undefined;
    return ESTADOS.includes(s) ? s : 'desconocido';
};
const motivoDe = (estados, motor) => {
    const e = estados && typeof estados === 'object' ? estados[motor] : undefined;
    return e && typeof e === 'object' && typeof e.motivo === 'string' ? e.motivo : '';
};
const entero = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
// Copia sin nulos, sin valores no finitos ni funciones: lo que queda se puede pasar a Lua (aLuaSeguro).
function limpio(v) {
    if (Array.isArray(v))
        return v.map(limpio).filter((x) => x !== undefined);
    if (v && typeof v === 'object') {
        const salida = {};
        for (const [k, x] of Object.entries(v)) {
            const y = limpio(x);
            if (y !== undefined)
                salida[k] = y;
        }
        return salida;
    }
    if (typeof v === 'string' || typeof v === 'boolean')
        return v;
    if (typeof v === 'number' && Number.isFinite(v))
        return v;
    return undefined;
}
// El n del id «<sesión>-<n>» (null si no lo tiene).
function numeroDe(id) {
    const m = /-(\d{1,9})$/.exec(String(id));
    return m ? Number(m[1]) : null;
}
export function crearNucleo({ base, addonsDir, timbres, historial, datos = carpetaDatos(), reloj, motor = motorReal, comprobar, programas, modulos, config, tiempoMax, raizVolumen, fs = fsReal, misionesApi, comercioDatos = async () => null, carpetaBase = null, herramientas = false, obtener = obtenerPagina, estadoJuego = null, puente, cerebro = null, estadoTati = cerebro ? () => cerebro.ultimo() : () => 'desconocido', } = {}) {
    const ahora = typeof reloj === 'function' ? reloj : reloj && typeof reloj.ahora === 'function' ? () => reloj.ahora() : Date.now;
    const programasDe = programas || PROGRAMAS;
    const comprobadores = comprobar || {
        claude: () => comprobarClaude(programasDe.claude),
        codex: () => comprobarCodex(programasDe.codex),
    };
    const leerLaConfig = () => {
        try {
            const c = typeof config === 'function' ? config() : config !== undefined ? config : leerConfig({ ...process.env, SNF_DATOS: datos });
            return c && typeof c === 'object' ? c : {};
        }
        catch {
            return {};
        }
    };
    // S4: el puente con TATI (apagado si falla o no se sabe: entonces todo como siempre).
    const elPuente = () => {
        try {
            const p = typeof puente === 'function' ? puente() : puenteDe(leerLaConfig());
            return p && typeof p === 'object' && p.activo === true ? { activo: true, cerebro: p.cerebro === 'tati' ? 'tati' : 'snetforever' } : { activo: false };
        }
        catch {
            return { activo: false };
        }
    };
    // La base: una promesa (o la base ya cargada) o una función que la carga. Si no carga, cada turno lo dice con «fallo»;
    // con una función se vuelve a pedir en un turno posterior, como mucho una vez por minuto.
    let baseLista = null;
    let baseFalloCuando = -Infinity;
    const pedirBase = () => {
        let p;
        try {
            p = Promise.resolve(typeof base === 'function' ? base() : base);
        }
        catch (e) {
            p = Promise.reject(e); // una función que lanza en el acto no rompe crearNucleo
        }
        p.catch(() => {
            baseFalloCuando = ahora();
        }); // no es un rechazo sin atender
        return p;
    };
    baseLista = pedirBase();
    async function obtenerBase() {
        try {
            return await baseLista;
        }
        catch (e) {
            if (typeof base !== 'function' || ahora() - baseFalloCuando < REINTENTO_BASE_MS)
                throw e;
            log('aviso', 'la base no cargó: se vuelve a pedir');
            baseLista = pedirBase();
            return baseLista;
        }
    }
    // Tarea 13, ronda 1: tras actualizar los datos de misiones. La base que hay sigue en uso hasta que la nueva carga.
    async function recargarBase() {
        if (typeof base !== 'function')
            return false;
        let p;
        try {
            p = Promise.resolve(base());
        }
        catch (e) {
            p = Promise.reject(e);
        }
        try {
            await p;
        }
        catch (e) {
            log('aviso', `la base nueva no cargó (${e?.code || e?.name || 'Error'}): se sigue con la anterior`);
            return false;
        }
        baseLista = p;
        log('info', 'la base se ha vuelto a cargar');
        return true;
    }
    const rutaEstado = join(datos, 'estado.json');
    const guardado = leerEstado();
    const rutaLatido = join(carpetaPuente(datos), 'latido.json');
    let latidoGuardado = leerLatido(); // {pj, r, c, cuando} del último latido o mensaje (de esta ejecución o de otra)
    let cadenaLatido = Promise.resolve();
    const reunidor = crearReunidor({ ahora });
    const vistos = new Map(); // «pj|id» ya admitidos en esta ejecución
    // 2.ª ronda: pj -> [[claves de las guías que entraron con pasos en un turno], …] de los últimos turnos (en memoria;
    // «nueva» lo borra).
    const guiasRecientes = new Map();
    // 17-nov: los personajes cuyo addon dijo que no pudo leer los talentos (se apunta una vez por personaje y sesión).
    const talentosAvisados = new Set();
    // Tarea 20: pj -> {guias, mandados, cuando, biblioteca?}: los tramos de la guía de la IA que aún no se han mandado (ronda
    // 3: solo los que quedan; `mandados`, cuántos se mandaron ya, para el «tramo i de n»).
    // `biblioteca` (abrirGuia): {guia, desde, hasta?, sigue} el pedido con el que seguir y si a la guía le queda algo.
    // Ronda 2: también en disco (ver leerPendientes).
    const rutaPendientes = join(datos, 'tramos-pendientes.json');
    let cadenaPendientes = Promise.resolve();
    let pendientesSucios = false; // al cargar se descartó alguna entrada (mala o caducada): se vuelve a guardar
    const tramosPendientes = leerPendientes();
    if (pendientesSucios)
        guardarPendientes();
    // Tarea 20: el lector de la biblioteca (los pasos de las marcas G:… y las misiones de las guías), con la base y el
    // idioma del turno en curso.
    let baseDelLector = null;
    let idiomaDelLector = 'es';
    const lector = crearLectorGuias({ datos, fs, base: () => baseDelLector, idioma: () => idiomaDelLector });
    const oyentes = new Set();
    let rUltima = null; // la r del último mensaje (null hasta el primero de esta ejecución)
    let cVisto = 0; // S4: el cursor más alto que ha mandado el addon (latidos y mensajes): el addon ignora seq <= cursor
    let latidoApuntado = null; // S4: {r, cuando} del último «latido» que se apuntó en registro.log
    let tatiEnCurso = null; // {pj, id, parado} del turno de TATI en marcha
    const enCola = new Set(); // «pj|id» de los mensajes admitidos que aún no han empezado (como mucho MAX_COLA)
    let paradoEnCola = null; // «pj|id» del mensaje de la cola que se pidió parar
    let ultimoParar = null; // «pj|id» del último mensaje de parar
    let pendientes = 0;
    let cadenaTurnos = Promise.resolve();
    let cadenaPublicar = Promise.resolve();
    let publicaciones = 0;
    let estados = null;
    let estadosCuando = -Infinity;
    let reComprobar = true;
    timbres?.empezarVida?.();
    // ---------- estado.json ----------
    function vacio() {
        return { seq: 0, recibidos: {}, registros: [] };
    }
    // Aparta un archivo a datos/cuarentena/<sello>/ (renombrando: nunca se borra).
    function apartar(origen, nombre) {
        const base_ = join(datos, 'cuarentena');
        fs.mkdirSync(base_, { recursive: true });
        for (let i = 0;; i++) {
            const dir = join(base_, i === 0 ? sello() : `${sello()}-${i}`);
            try {
                fs.mkdirSync(dir);
            }
            catch (e) {
                if (e.code === 'EEXIST' && i < 50)
                    continue;
                throw e;
            }
            fs.renameSync(origen, join(dir, nombre));
            return;
        }
    }
    function leerEstado() {
        let texto;
        try {
            texto = fs.readFileSync(rutaEstado, 'utf8');
        }
        catch {
            return vacio();
        }
        try {
            const j = JSON.parse(texto);
            if (!j || typeof j !== 'object' || Array.isArray(j))
                throw new Error('no es un objeto');
            const e = vacio();
            e.seq = entero(j.seq);
            if (j.recibidos && typeof j.recibidos === 'object' && !Array.isArray(j.recibidos)) {
                for (const [pj, id] of Object.entries(j.recibidos))
                    if (typeof id === 'string')
                        e.recibidos[pj] = id;
            }
            if (Array.isArray(j.registros)) {
                e.registros = j.registros.filter((r) => r && typeof r === 'object' && Number.isInteger(r.seq)).map(limpio).slice(-MAX_REGISTROS);
            }
            return e;
        }
        catch {
            try {
                apartar(rutaEstado, 'estado.json');
                log('aviso', 'estado.json roto: apartado a la cuarentena; se empieza de cero');
            }
            catch {
                log('error', 'estado.json roto y no se pudo apartar');
            }
            return vacio();
        }
    }
    async function guardarEstado() {
        fs.mkdirSync(datos, { recursive: true });
        const contenido = JSON.stringify({ seq: guardado.seq, recibidos: guardado.recibidos, registros: guardado.registros });
        await escribirAtomico(fs, rutaEstado, contenido, { mover: (origen, nombre) => apartar(origen, nombre) });
    }
    // ---------- puente-tati/latido.json ----------
    // Con el puente activo, lo último que se supo del addon por un latido o un mensaje: {version: 1, pj, r, c, cuando}
    // (el personaje, la ranura siguiente del addon, el cursor más alto visto y la hora de la app). El contexto del juego lo
    // guarda el estado del juego (puente-tati/estados.json). Tras un reinicio, empujar lo usa si es del mismo personaje y
    // de hace LATIDO_VALE_MS como mucho. Uno roto (o con otra forma) va a la cuarentena de datos, como estado.json.
    function leerLatido() {
        let texto;
        try {
            texto = fs.readFileSync(rutaLatido, 'utf8');
        }
        catch {
            return null;
        }
        try {
            const j = JSON.parse(texto);
            const bien = j && typeof j === 'object' && j.version === 1 && typeof j.pj === 'string' && j.pj !== ''
                && Number.isInteger(j.r) && Number.isInteger(j.c) && j.c >= 0 && Number.isFinite(j.cuando);
            if (!bien)
                throw new Error('otra forma');
            return { pj: j.pj, r: acotarRanura(j.r), c: j.c, cuando: j.cuando };
        }
        catch {
            try {
                apartar(rutaLatido, 'latido.json');
                log('aviso', 'latido.json roto: apartado a la cuarentena');
            }
            catch {
                log('error', 'latido.json roto y no se pudo apartar');
            }
            return null;
        }
    }
    // Apunta (y guarda, en fila: la última escritura deja lo más nuevo) la r y el cursor de ahora para `pj`.
    function guardarLatido(pj) {
        if (typeof pj !== 'string' || pj === '' || rUltima === null)
            return Promise.resolve();
        latidoGuardado = { pj, r: rUltima, c: cVisto, cuando: ahora() };
        const contenido = JSON.stringify({ version: 1, ...latidoGuardado });
        const hecho = cadenaLatido.then(async () => {
            fs.mkdirSync(carpetaPuente(datos), { recursive: true });
            await escribirAtomico(fs, rutaLatido, contenido, { mover: (origen, nombre) => apartar(origen, nombre) });
        }).catch((e) => {
            log('aviso', `latido.json no se pudo guardar (${e?.code || e?.name || 'Error'})`);
        });
        cadenaLatido = hecho;
        return hecho;
    }
    // Sin latido ni mensaje en esta ejecución: toma la r y el cursor de lo guardado si es de `pj` y reciente. -> boolean
    function recuperarLatido(pj) {
        const g = latidoGuardado;
        const edad = g ? ahora() - g.cuando : NaN;
        if (!g || g.pj !== pj || !(edad >= 0 && edad <= LATIDO_VALE_MS))
            return false;
        rUltima = g.r;
        cVisto = Math.max(cVisto, g.c);
        log('info', 'tati: la ranura del addon, de lo guardado');
        return true;
    }
    // ---------- tramos-pendientes.json ----------
    // Ronda 2 (decisión 3): {version: 1, pjs: {pj: {guias, mandados, cuando, biblioteca?}}}. Al arrancar se cargan los que no
    // han caducado; un archivo que no se puede leer (o con otra forma) va entero a la cuarentena de datos, como latido.json.
    // Ronda 3 (m4): una entrada mala (o caducada) se descarta sola y las demás se quedan. Cada cambio se guarda entero (en
    // fila: la última escritura deja lo más nuevo).
    function leerPendientes() {
        const salida = new Map();
        let texto;
        try {
            texto = fs.readFileSync(rutaPendientes, 'utf8');
        }
        catch {
            return salida;
        }
        try {
            const j = JSON.parse(texto);
            if (!j || typeof j !== 'object' || j.version !== 1 || !j.pjs || typeof j.pjs !== 'object' || Array.isArray(j.pjs))
                throw new Error('otra forma');
            let malas = 0;
            for (const [pj, p] of Object.entries(j.pjs)) {
                if (!entradaBien(p)) {
                    malas++;
                    continue;
                }
                const edad = ahora() - p.cuando;
                if (edad >= 0 && edad <= TRAMOS_CADUCAN_MS)
                    salida.set(pj, p);
                else
                    pendientesSucios = true;
            }
            if (malas > 0) {
                pendientesSucios = true;
                log('aviso', `tramos-pendientes.json: ${malas} entradas que no valen, descartadas`);
            }
            return salida;
        }
        catch {
            try {
                apartar(rutaPendientes, 'tramos-pendientes.json');
                log('aviso', 'tramos-pendientes.json roto: apartado a la cuarentena');
            }
            catch {
                log('error', 'tramos-pendientes.json roto y no se pudo apartar');
            }
            return new Map();
        }
    }
    // La forma de una entrada: guías del addon (con clave y pasos con elementos), cuántos tramos se mandaron, su hora y, de
    // una guía de la biblioteca, el pedido con el que seguir. Sin guías solo si la guía de la biblioteca sigue.
    function entradaBien(p) {
        const guiaBien = (g) => g && typeof g === 'object' && typeof g.clave === 'string' && Array.isArray(g.pasos)
            && g.pasos.every((x) => x && Array.isArray(x.elementos));
        const b = p?.biblioteca;
        const bibBien = b === undefined || (b && typeof b === 'object' && typeof b.sigue === 'boolean'
            && pedidoValido({ guia: b.guia, desde: b.desde, ...(b.hasta !== undefined ? { hasta: b.hasta } : {}) }) !== null);
        return Boolean(p && typeof p === 'object' && Array.isArray(p.guias) && p.guias.every(guiaBien)
            && (p.guias.length > 0 || b?.sigue === true) && Number.isInteger(p.mandados) && p.mandados >= 0
            && Number.isFinite(p.cuando) && bibBien);
    }
    function guardarPendientes() {
        const contenido = JSON.stringify({ version: 1, pjs: Object.fromEntries(tramosPendientes) });
        cadenaPendientes = cadenaPendientes.then(async () => {
            fs.mkdirSync(datos, { recursive: true });
            await escribirAtomico(fs, rutaPendientes, contenido, { mover: (origen, nombre) => apartar(origen, nombre) });
        }).catch((e) => {
            log('aviso', `tramos-pendientes.json no se pudo guardar (${e?.code || e?.name || 'Error'})`);
        });
        return cadenaPendientes;
    }
    // Los pendientes de `pj` que no han caducado (los caducados se quitan), o null.
    function pendientesDe(pj) {
        const p = tramosPendientes.get(pj);
        if (!p)
            return null;
        if (!(ahora() - p.cuando <= TRAMOS_CADUCAN_MS)) {
            quitarPendientes(pj);
            return null;
        }
        return p;
    }
    function ponerPendientes(pj, p) {
        tramosPendientes.set(pj, p);
        guardarPendientes();
    }
    function quitarPendientes(pj) {
        if (tramosPendientes.delete(pj))
            guardarPendientes();
    }
    const pedidoDe = (bib) => ({ guia: bib.guia, desde: bib.desde, ...(bib.hasta !== undefined ? { hasta: bib.hasta } : {}) });
    // T3 (B5): en qué parte va la guía de la IA que tiene cargada `pj` (tramoDePendientes con sus pendientes vivos).
    const tramoDeLaGuia = (pj, clave) => tramoDePendientes(clave, typeof clave === 'string' && clave.startsWith('IA\\') ? pendientesDe(pj) : null);
    // ---------- estados de las cuentas ----------
    async function pedir(m) {
        try {
            const e = await comprobadores[m]();
            return e && typeof e === 'object' ? e : { estado: 'desconocido', motivo: 'no se pudo comprobar la cuenta' };
        }
        catch {
            return { estado: 'desconocido', motivo: 'no se pudo comprobar la cuenta' };
        }
    }
    async function estadosMotores() {
        const t = ahora();
        if (estados && !reComprobar && t - estadosCuando < MEMORIA_ESTADOS_MS)
            return estados;
        const [claude, codex] = await Promise.all(MOTORES.map(pedir));
        estados = { claude, codex };
        estadosCuando = t;
        reComprobar = false;
        log('info', `cuentas: claude ${estadoDe(estados, 'claude')}, codex ${estadoDe(estados, 'codex')}`);
        avisar();
        return estados;
    }
    // ---------- avisos a quien mira (la bandeja) ----------
    function estado(idioma = 'es') {
        let em = { motor: null, estado: 'desconocido', texto: '' };
        try {
            if (estados)
                em = motor.estadoMotor(leerLaConfig(), estados, idioma);
        }
        catch {
            // se queda en desconocido
        }
        const ultimo = guardado.registros.at(-1);
        return {
            motor: em.motor,
            estadoMotor: em.estado,
            texto: em.texto,
            estados: { claude: estados ? estadoDe(estados, 'claude') : 'desconocido', codex: estados ? estadoDe(estados, 'codex') : 'desconocido' },
            enCola: pendientes,
            seq: guardado.seq,
            publicaciones,
            ultimo: ultimo ? { msg: ultimo.msg, t: ultimo.t, tipo: ultimo.tipo } : null,
        };
    }
    function avisar() {
        if (oyentes.size === 0)
            return;
        const e = estado();
        for (const fn of oyentes) {
            try {
                fn(e);
            }
            catch {
                // un oyente roto no para al núcleo
            }
        }
    }
    function alCambiar(fn) {
        oyentes.add(fn);
        return () => oyentes.delete(fn);
    }
    // ---------- publicar ----------
    function tocar(nombre) {
        if (!timbres)
            return Promise.resolve(false);
        try {
            return Promise.resolve(timbres.tocar(nombre)).catch((e) => {
                log('aviso', `timbre ${nombre}: ${e?.code || 'ERROR'}`);
                return false;
            });
        }
        catch (e) {
            log('aviso', `timbre ${nombre}: ${e?.code || 'ERROR'}`);
            return Promise.resolve(false);
        }
    }
    // Cabecera del buzón (Ruling F4-34): `motor` es un ESTADO (el addon lo lee así) y `motorNombre` el motor.
    //   claude, codex   el estado de cada uno
    //   motor           'ok' si hay uno listo; con un motor forzado, su estado; en auto sin ninguno en ok, el de Claude si
    //                   está instalado y si no el de Codex
    //   motorNombre     'claude' | 'codex' (el que se usa, o el forzado); sin él (nil) si no se usaría ninguno
    //   sabeParar       true siempre: esta app entiende el mensaje `parar` (a una vieja le entraría como una pregunta)
    //   latido          (S4) true solo con el puente con TATI activo: el addon manda entonces sus latidos
    //   Con el cerebro 'tati' (S4): motorNombre 'tati' y motor el estado que da `estadoTati()`.
    function cabecera() {
        const c = { claude: estadoDe(estados, 'claude'), codex: estadoDe(estados, 'codex'), sabeParar: true };
        let e = { error: 'sin_motor' };
        try {
            if (estados)
                e = motor.elegirMotor(leerLaConfig(), estados) || e;
        }
        catch {
            // sin elección
        }
        if (!e.error) {
            c.motor = 'ok';
            c.motorNombre = e.motor;
        }
        else if (MOTORES.includes(e.motor)) {
            c.motor = estadoDe(estados, e.motor);
            c.motorNombre = e.motor;
        }
        else {
            c.motor = c.claude !== 'sin_instalar' ? c.claude : c.codex;
        }
        const p = elPuente();
        if (p.activo) {
            c.latido = true;
            if (p.cerebro === 'tati') {
                let et = 'desconocido';
                try {
                    et = estadoTati();
                }
                catch {
                    // se queda en desconocido
                }
                c.motor = ESTADOS.includes(et) ? et : 'desconocido';
                c.motorNombre = 'tati';
            }
        }
        if (tatiEnCurso)
            c.turno = tatiEnCurso.id;
        return c;
    }
    // Un registro de error en lugar de otro que no se puede pasar a Lua (mismo seq, pj y msg).
    const sustitutoDe = (r, idioma) => ({
        seq: r.seq, pj: typeof r.pj === 'string' ? r.pj : '', msg: typeof r.msg === 'string' ? r.msg : '', t: 'error', tipo: 'fallo',
        texto: renderizar(textoError('fallo', textoDetalle('interno', idioma), idioma)),
    });
    function textoBuzon(idioma) {
        const datosBuzon = {
            seq: guardado.seq, estado: cabecera(), recibidos: guardado.recibidos, registros: guardado.registros, idioma,
            ahora: Math.floor(ahora() / 1000),
        };
        try {
            return tablaBuzon(datosBuzon);
        }
        catch (e) {
            // Un registro que no se puede pasar a Lua (el último o uno anterior) no debe dejar al juego sin buzón: cada uno que
            // falle pasa a un error con su seq, pj y msg, y se vuelve a intentar.
            log('error', `buzón: no se pudo serializar (${e?.code || 'ERROR'})`);
            let cambiados = 0;
            guardado.registros = guardado.registros.map((r) => {
                try {
                    aLuaSeguro(r);
                    return r;
                }
                catch {
                    cambiados++;
                    return sustitutoDe(r, idioma);
                }
            });
            if (cambiados === 0)
                throw e;
            log('aviso', `buzón: ${cambiados} registros sustituidos por un error`);
            return tablaBuzon({ ...datosBuzon, registros: guardado.registros });
        }
    }
    // Los tramos de ranuras de una publicación: todas hasta el primer mensaje; después, de r a r+15. Con `primeras` (una
    // publicación de estado, sin mensaje), también de 1 a 16: tras reiniciar el juego o un /reload sin reiniciar la app,
    // el addon vuelve a empezar por la 1 y así no carga una ranura vieja. Los mensajes no lo usan: una ranura por mensaje.
    function tramos(primeras) {
        if (rUltima === null)
            return [[1, RANURAS]];
        const hasta = Math.min(rUltima + RANURAS_POR_PUBLICACION - 1, RANURAS);
        if (!primeras)
            return [[rUltima, hasta]];
        const finPrimeras = Math.min(RANURAS_POR_PUBLICACION, RANURAS);
        if (rUltima <= finPrimeras + 1)
            return [[1, Math.max(hasta, finPrimeras)]];
        return [[1, finPrimeras], [rUltima, hasta]];
    }
    // Guarda estado.json, escribe el buzón en sus ranuras y, si se pide, toca el timbre. En cadena: cada publicación se
    // arma con el estado de ese momento, así la última siempre lleva todo.
    function publicar({ conTimbre = true, idioma = 'es', primeras = false } = {}) {
        const hecho = cadenaPublicar.then(async () => {
            try {
                await guardarEstado();
            }
            catch (e) {
                log('error', `estado.json no se pudo guardar (${e?.code || 'ERROR'})`);
            }
            if (!addonsDir) {
                log('aviso', 'no hay carpeta de AddOns: el buzón no se publica');
                return { escritas: [], fallos: [], toque: Promise.resolve(false) };
            }
            const texto = textoBuzon(idioma);
            const r = { escritas: [], fallos: [] };
            for (const [desde, hasta] of tramos(primeras)) { // rUltima ya está acotada a 1…RANURAS
                const parte = await escribirRanuras(addonsDir, texto, { desde, hasta, raizVolumen, fs });
                r.escritas.push(...parte.escritas);
                r.fallos.push(...parte.fallos);
            }
            publicaciones++;
            if (r.fallos.length > 0) {
                log('aviso', `buzón: ${r.fallos.length} ranuras sin escribir (${[...new Set(r.fallos.map((f) => f.codigo))].join(', ')})`);
            }
            const conToque = conTimbre && r.escritas.length > 0;
            const toque = conToque ? tocar('timbre') : Promise.resolve(false);
            // S4 (Ruling P8): cada publicación con timbre hace que el addon lea una ranura más; se cuenta aquí, en un solo
            // sitio (respuestas, errores, «ocupado», estados y registros de TATI). Con el puente apagado, nunca.
            if (conToque && estadoJuego && elPuente().activo) {
                try {
                    await estadoJuego.gastar();
                }
                catch (e) {
                    log('aviso', `tati: la ranura gastada no se pudo guardar (${e?.code || e?.name || 'Error'})`);
                }
            }
            avisar();
            return { ...r, toque };
        });
        cadenaPublicar = hecho.catch((e) => {
            log('error', `buzón: no se pudo publicar (${e?.code || 'ERROR'})`);
        });
        return hecho;
    }
    // Pone el registro de un mensaje (con su seq) y empieza a publicarlo: {registro, publicado} (`publicado` acaba cuando
    // el buzón está escrito y lleva el `toque` del timbre, que dura su pulso).
    function registrar({ pj, id, c, idioma }, parcial) {
        const seq = Math.max(guardado.seq, entero(c)) + 1;
        // Todo texto que va al chat del juego sale de renderizar (la única capa que escapa los |): también los errores.
        const texto = parcial.t === 'error' && typeof parcial.texto === 'string' ? renderizar(parcial.texto) : parcial.texto;
        const registro = limpio({ seq, pj, msg: id, ...parcial, texto });
        guardado.seq = seq;
        guardado.registros = [...guardado.registros, registro].sort((a, b) => a.seq - b.seq).slice(-MAX_REGISTROS);
        log('info', `mensaje ${id}: registro ${seq} (${registro.t}${registro.tipo ? ` ${registro.tipo}` : ''})`);
        const publicado = publicar({ idioma }).catch(() => ({ toque: Promise.resolve(false) }));
        return { registro, publicado };
    }
    // Espera a que el buzón esté escrito y a que acaben los pulsos de sus timbres; da el registro.
    async function rematar({ registro, publicado }, toques) {
        const r = await publicado;
        await r.toque;
        await Promise.all(toques);
        avisar();
        return registro;
    }
    const terminar = (peticion, parcial, toques) => rematar(registrar(peticion, parcial), toques);
    // S4: un registro de TATI, que no contesta a ninguna pregunta: `{seq, pj, msg: 'tati-<seq>', origen: 'tati', ...parcial}`
    // (seq, pj, msg y origen los pone siempre el núcleo; seq por encima del cursor del addon), para el personaje del último
    // latido (o `pj`), publicado con las ranuras 1…16 y r…r+15 y timbre (que gasta la ranura en publicar). Con el puente apagado, sin personaje conocido, sin ranuras o sin ningún latido ni mensaje en esta
    // ejecución (revisión final: no se sabe la ranura del addon; antes se escribía sin timbre y el juego no lo veía) ni
    // nada guardado que valga (recuperarLatido: mismo personaje y reciente), nada.
    // -> {registro} | {error: 'sin_puente' | 'sin_personaje' | 'sin_ranuras' | 'sin_latido'}
    async function empujar({ pj, parcial, idioma } = {}) {
        if (!elPuente().activo) {
            log('aviso', 'tati: registro sin_puente');
            return { error: 'sin_puente' };
        }
        const ultimo = estadoJuego ? estadoJuego.ultimo() : null;
        const quien = typeof pj === 'string' && pj !== '' ? pj : ultimo?.pj;
        if (!ultimo || typeof quien !== 'string' || quien === '') {
            log('aviso', 'tati: registro sin_personaje');
            return { error: 'sin_personaje' };
        }
        if (estadoJuego.ranurasQuedan() === 0) {
            log('aviso', 'tati: registro sin_ranuras');
            return { error: 'sin_ranuras' };
        }
        if (rUltima === null && !recuperarLatido(quien)) {
            log('aviso', 'tati: registro sin_latido');
            return { error: 'sin_latido' };
        }
        const lengua = (idioma ?? ultimo.mensaje?.idioma) === 'en' ? 'en' : 'es';
        const { seq: _seq, pj: _pj, msg: _msg, origen: _origen, ...resto } = parcial && typeof parcial === 'object' ? parcial : {};
        const seq = Math.max(guardado.seq, cVisto) + 1;
        // Como en registrar: todo texto que va al chat del juego sale de renderizar (los errores aquí).
        const texto = resto.t === 'error' && typeof resto.texto === 'string' ? renderizar(resto.texto) : resto.texto;
        const registro = limpio({ seq, pj: quien, msg: `tati-${seq}`, origen: 'tati', ...resto, texto });
        guardado.seq = seq;
        guardado.registros = [...guardado.registros, registro].sort((a, b) => a.seq - b.seq).slice(-MAX_REGISTROS);
        log('info', `tati: registro ${seq} (${registro.t}${registro.tipo ? ` ${registro.tipo}` : ''})`);
        try {
            const r = await publicar({ idioma: lengua, primeras: true, conTimbre: true });
            await r.toque;
        }
        catch {
            // ya apuntado en publicar
        }
        avisar();
        return { registro };
    }
    // ---------- el turno ----------
    async function anadirHistorial(pj, t, texto) {
        if (!historial)
            return;
        try {
            await historial.anadir(pj, { t, texto });
        }
        catch (e) {
            log('aviso', `historial: no se pudo apuntar (${e?.code || 'ERROR'})`);
        }
    }
    // Las 12 últimas líneas (6 intercambios), recortadas por lo más viejo hasta ≤ 4.000 caracteres.
    function recientes(pj) {
        try {
            return historial ? recortarHistorial(historial.recientes(pj, TURNOS)) : [];
        }
        catch {
            return [];
        }
    }
    // Texto de P6 con el detalle (o el motivo) en el idioma del mensaje: lo que no se reconoce pasa al genérico.
    const textoDe = (tipo, detalle, idioma, m) => textoError(tipo, textoDetalle(detalle, idioma), idioma, m);
    // Sin motor en ok: el error que mejor explica qué pasa.
    function errorDeEleccion(eleccion, est, idioma) {
        if (eleccion.motor) {
            const m = eleccion.motor;
            return { tipo: eleccion.error, texto: textoDe(eleccion.error, motivoDe(est, m), idioma, m), motor: m };
        }
        const instalados = MOTORES.filter((m) => estadoDe(est, m) !== 'sin_instalar');
        if (instalados.length === 0)
            return { tipo: 'sin_instalar', texto: textoError('sin_instalar', '', idioma, 'claude') };
        if (instalados.length === 1) {
            const m = instalados[0];
            const tipo = estadoDe(est, m);
            return { tipo, texto: textoDe(tipo, motivoDe(est, m), idioma, m), motor: m };
        }
        return { tipo: 'sin_motor', texto: textoError('sin_motor', '', idioma) };
    }
    // Tarea 14 (revisión 1): el texto renderizado de la respuesta con el aviso entero en su última línea. El cuerpo se
    // recorta (con «…») si hace falta para que los dos quepan en los topes de renderizar. Tarea 20: el pie puede llevar
    // varias líneas de la app (el resumen de la guía, lo quitado y el aviso), todas enteras.
    function conPie(plano, notas) {
        const pie = renderizar(notas.join('\n'));
        if (!plano)
            return pie;
        const cuerpo = renderizar(plano, { reserva: { caracteres: pie.length + 1, bytes: Buffer.byteLength(pie, 'utf8') + 1 } });
        return `${cuerpo}\n${pie}`;
    }
    // Tarea 14: el aviso de una respuesta que llegó (null si no hace falta). Con Claude: 'sin_opciones' si esta versión no
    // puede; 'no_arrancaron' si el stream dice que nuestro servidor no quedó conectado y no se usó ninguna de nuestras
    // herramientas (sin dato, como en json, no se dice nada). Con Codex: 'codex' si el mensaje habla de guías.
    function avisoHerramientas(r, conHerramientas, texto) {
        if (r.motor === 'codex') {
            // 22-nov: Codex ya las usa; el aviso solo sale si esta vez no pudo y el mensaje iba de guías.
            if (conHerramientas && r.sinHerramientas !== true && r.mcpFallo !== true)
                return null;
            return hablaDeGuias(texto) ? 'codex' : null;
        }
        if (!conHerramientas)
            return null;
        if (r.sinHerramientas === true)
            return 'sin_opciones';
        const mcp = r.mcp && typeof r.mcp === 'object' ? r.mcp : null;
        // Revisión 1: un estado como «pending» no es un fallo si después se usó alguna de nuestras herramientas.
        const usadas = r.usadas && typeof r.usadas === 'object' ? r.usadas : {};
        if (HERRAMIENTAS.some((h) => Object.hasOwn(usadas, h) && usadas[h] > 0))
            return null;
        if (mcp && Object.hasOwn(mcp, NOMBRE_SERVIDOR) && mcp[NOMBRE_SERVIDOR] !== 'connected')
            return 'no_arrancaron';
        return null;
    }
    // ---------- tarea 20: la guía que crea la IA ----------
    // El siguiente tramo pendiente de `p` (los pendientes de `pj`, con alguno por mandar): {guia, plano, confirmar} (confirmar
    // lo da por mandado).
    function tramoPendiente(pj, p, idioma) {
        const i = p.mandados;
        const n = p.mandados + p.guias.length;
        const guia = p.guias[0];
        const sigue = p.biblioteca?.sigue === true;
        const desde = i + 1 >= n && sigue ? { desde: p.biblioteca.desde } : {};
        const plano = textoGuiaNueva('tramo', { i: i + 1, n, titulo: guia.titulo?.[idioma === 'en' ? 'en' : 'es'] ?? '', ...desde }, idioma);
        // Ronda 3 (m2): solo si siguen siendo estos pendientes (si entre medias se abrió otra guía, no se resucitan).
        const confirmar = () => {
            if (tramosPendientes.get(pj) !== p)
                return;
            if (i + 1 >= n && !sigue)
                quitarPendientes(pj);
            else
                ponerPendientes(pj, { ...p, guias: p.guias.slice(1), mandados: i + 1, cuando: ahora(), clave: guia.clave });
        };
        return { guia, plano, i, n, confirmar };
    }
    // Con tramos pendientes de `pj` que no han caducado, un «sigue» trae el siguiente (sin preguntar a la IA); si no, null.
    // Mandados todos, si eran de una guía de la biblioteca que sigue: {continuar, pendientes} (el pedido abrirGuia del resto;
    // ronda 3, m3: los pendientes se quitan cuando seguirLaGuia ha armado, no antes).
    function siguienteTramo(pj, texto, idioma, id) {
        const p = pendientesDe(pj);
        if (!p || !esSigue(texto))
            return null;
        if (p.guias.length === 0) {
            if (p.biblioteca?.sigue)
                return { continuar: pedidoDe(p.biblioteca), pendientes: p };
            quitarPendientes(pj);
            return null;
        }
        const t = tramoPendiente(pj, p, idioma);
        t.confirmar();
        log('info', `mensaje ${id}: guiaNueva: tramo ${t.i + 1} de ${t.n}, sin preguntar a la IA`);
        return { parcial: { t: 'respuesta', guiaIA: t.guia, abrirGuiaIA: true, texto: renderizar(t.plano) }, historia: [['jugador', texto], ['ia', t.plano]] };
    }
    // I1: un abrirGuia de la misma guía con el `desde` que guardaron los pendientes de una guía de la biblioteca (el
    // `siguiente` que dio abrir_guia) mientras queda alguno por mandar: el siguiente de ellos, con la forma de rutaDeLaIA;
    // si no, null. Ronda 3: el `hasta` del pedido no cuenta; si es otro que el de los pendientes, se ignora y la cuenta lo
    // dice (hastaIgnorado).
    function pendienteDeLaBiblioteca(pj, pedido, idioma, id) {
        const p = pendientesDe(pj);
        const bib = p?.biblioteca;
        if (!bib || p.guias.length === 0)
            return null;
        const grupo = (x) => lector.grupo(x)?.id ?? x;
        if (grupo(pedido.guia) !== grupo(bib.guia) || (pedido.desde ?? 1) !== bib.desde)
            return null;
        const hastaIgnorado = pedido.hasta !== undefined && pedido.hasta !== bib.hasta;
        const t = tramoPendiente(pj, p, idioma);
        const misiones = new Set(t.guia.pasos.flatMap((x) => x.elementos.map((e) => e.q).filter(Number.isInteger)));
        log('info', `mensaje ${id}: abrirGuia: tramo ${t.i + 1} de ${t.n} de los pendientes`);
        return {
            guia: t.guia, notas: [t.plano], confirmar: t.confirmar,
            cuenta: {
                tramos: t.n, tramo: t.i + 1, pasos: t.guia.pasos.length, misiones: misiones.size,
                quitados: { misiones: 0, puntos: 0, pasos: 0, tramos: 0, textos: 0 }, previas: 0, hasta: bib.desde - 1,
                ...(bib.sigue ? { siguiente: bib.desde } : {}), deOtraClase: 0, sinMision: 0, pendientes: t.n - t.i - 1,
                ...(hastaIgnorado ? { hastaIgnorado: true } : {}),
            },
        };
    }
    // Las copias de páginas guardadas en la biblioteca (guias\enlaces\*.txt) de las direcciones de `claves`: clave -> texto
    // (lo que va tras la cabecera). Lo que no se puede leer se salta.
    function copiasGuardadas(claves) {
        const salida = new Map();
        const carpeta = join(datos, CARPETA_GUIAS, CARPETA_ENLACES);
        let nombres;
        try {
            nombres = fs.readdirSync(carpeta).filter((x) => x.toLowerCase().endsWith('.txt')).sort();
        }
        catch {
            return salida;
        }
        for (const nombre of nombres) {
            if (salida.size === claves.size)
                break;
            try {
                const contenido = fs.readFileSync(join(carpeta, nombre), 'utf8');
                const m = CABECERA_COPIA.exec(contenido.split(/\r?\n/, 1)[0].trim());
                const clave = m ? clavePagina(m[1].trim()) : null;
                if (clave === null || !claves.has(clave) || salida.has(clave))
                    continue;
                const corte = /\r?\n\r?\n/.exec(contenido);
                salida.set(clave, corte ? contenido.slice(corte.index + corte[0].length) : '');
            }
            catch {
                // ilegible: se salta
            }
        }
        return salida;
    }
    // El texto de una página bajada ahora (15 s como mucho), o null si no se pudo.
    async function bajarPagina(url) {
        let reloj = null;
        try {
            const tope = new Promise((_, rechazar) => {
                reloj = setTimeout(() => rechazar(new Error('tiempo')), TIEMPO_PAGINA_MS);
            });
            const pagina = await Promise.race([Promise.resolve().then(() => obtener(url, { tiempoMax: TIEMPO_PAGINA_MS })), tope]);
            return textoDePagina(pagina);
        }
        catch {
            return null;
        }
        finally {
            clearTimeout(reloj);
        }
    }
    // R15: los textos DE VERDAD de las páginas de `urls` (las de los puntos `web` de la guía y, revisión final, las de los
    // `pinesWeb`: direccionesWeb de respuesta.mjs) que Claude leyó en esta pregunta (como mucho MAX_PAGINAS_WEB entre
    // todas): la copia de la biblioteca o, si no hay, la página bajada. -> {paginas: [{url, texto}], miradas}
    async function paginasDeVerdad(urls, leidas) {
        if (!Array.isArray(leidas) || leidas.length === 0)
            return { paginas: [], miradas: 0 };
        const deClaude = new Set(leidas.map((p) => clavePagina(p?.url)).filter((c) => c !== null));
        const elegidas = new Map(); // clave -> dirección que se pide
        for (const url of urls) {
            const clave = clavePagina(url);
            if (clave === null || !deClaude.has(clave) || elegidas.has(clave))
                continue;
            if (elegidas.size < MAX_PAGINAS_WEB)
                elegidas.set(clave, urlDePeticion(url));
        }
        if (elegidas.size === 0)
            return { paginas: [], miradas: 0 };
        const copias = copiasGuardadas(new Set(elegidas.keys()));
        const textos = await Promise.all([...elegidas].map(([clave, url]) => (copias.has(clave) ? copias.get(clave) : bajarPagina(url))));
        const paginas = [...elegidas.values()].map((url, i) => ({ url, texto: textos[i] })).filter((p) => typeof p.texto === 'string' && p.texto !== '');
        return { paginas, miradas: elegidas.size };
    }
    function misionesDeLaBiblioteca() {
        try {
            const s = lector.misionesBiblioteca();
            return s instanceof Set ? s : new Set();
        }
        catch {
            return new Set();
        }
    }
    // Las opciones de comprobarGuiaNueva con los datos del turno (las mismas para la guía de la IA y la de la biblioteca).
    // 16-nov: con el registro del turno (entero) y el mapa del jugador, para las previas que faltan.
    // Con `hechas` (las misiones de los pasos de antes de `desde` de una guía de la biblioteca, I3), esas cuentan como del
    // registro: hechas o en curso.
    function opcionesDeComprobar({ b, pjRuta, datosTurno, paginas, hechas = [] }) {
        datosTurno.misionesBiblioteca = misionesDeLaBiblioteca();
        const registro = hechas.length > 0 ? [...(Array.isArray(datosTurno.idsRegistro) ? datosTurno.idsRegistro : []), ...hechas] : datosTurno.idsRegistro;
        return {
            base: b, pj: pjRuta, puntos: datosTurno.puntos, puntoDeMarca: datosTurno.puntoDeMarca, paginas,
            misionesBiblioteca: datosTurno.misionesBiblioteca, resolverZona: datosTurno.resolverZona,
            registro, mapaJugador: datosTurno.datos?.lugar?.mapa,
            // 17-nov: las listas para entregar y las hechas no llevan pasos de objetivo (completarObjetivos de rutaIA.mjs).
            listas: datosTurno.idsListas, hechas,
        };
    }
    // La guía de la IA ya validada de forma -> {guia (el primer tramo) | null, notas: [líneas para el jugador], cuenta}.
    // Deja los demás tramos pendientes para «sigue». Con `biblioteca` (lo de expandirGuia: abrirGuia), la guía es de la
    // biblioteca: su línea va tras el resumen, la cuenta lleva hasta, siguiente, deOtraClase y sinMision, y lo que falta de
    // la guía (`continuar`) queda con los tramos pendientes.
    async function rutaDeLaIA(guiaNueva, { b, pj, pjRuta, datosTurno, idioma, id, webs, biblioteca = null }) {
        const { paginas, miradas } = webs;
        // 21-nov: el orden se afina solo en la ruta que escribe la IA (ordenRutaIA.mjs); la de la biblioteca va tal cual.
        const comprobada = comprobarGuiaNueva(guiaNueva, { ...opcionesDeComprobar({ b, pjRuta, datosTurno, paginas, hechas: biblioteca?.hechas ?? [] }), ordenar: !biblioteca });
        // R18: lo que cortó guiaNuevaValida junto con lo que quitó la comprobación.
        const cq = comprobada.quitados;
        const vq = guiaNueva.quitados ?? {};
        const quitados = {
            misiones: cq.misiones, puntos: cq.puntos + cq.web, pasos: cq.pasos + (vq.pasos ?? 0), tramos: vq.tramos ?? 0, textos: vq.textos ?? 0,
        };
        // El título viene con `|` duplicado (respuesta.mjs) y renderizar lo vuelve a duplicar: aquí va sencillo.
        const titulo = String(guiaNueva.titulo ?? '').replace(/\|\|/g, '|');
        const guias = comprobada.tramos.length > 0 ? guiasDeRuta(comprobada.tramos, { titulo, pj: pjRuta, base: b }) : [];
        const pasos = guias.reduce((s, g) => s + g.pasos.length, 0);
        const misiones = new Set(guias.flatMap((g) => g.pasos.flatMap((p) => p.elementos.map((e) => e.q).filter(Number.isInteger))));
        const total = quitados.misiones + quitados.puntos + quitados.pasos + quitados.tramos;
        const de = biblioteca ? `abrirGuia: hasta ${biblioteca.cuenta.hasta}, ` : 'guiaNueva: ';
        log('info', `mensaje ${id}: ${de}tramos ${guias.length}, pasos ${pasos}, quitados ${total}${miradas > 0 ? `, páginas ${paginas.length} de ${miradas}` : ''}`);
        const notas = [];
        if (guias.length === 0)
            notas.push(textoGuiaNueva('sin_pasos', {}, idioma));
        else {
            // Revisión final: cuántos puntos de la ruta entera salen de una página (su paso lo dice en la nota).
            const web = comprobada.tramos.reduce((s, t) => s + t.pasos.filter((p) => p.punto?.origen?.tipo === 'web').length, 0);
            notas.push(textoGuiaNueva('resumen', { titulo, pasos, misiones: misiones.size, tramo: 1, tramos: guias.length, web, pasosTramo: guias[0].pasos.length }, idioma));
            if (biblioteca)
                notas.push(textoGuiaNueva('biblioteca', { ...biblioteca.cuenta, partes: guias.length }, idioma));
        }
        const lineaQuitados = textoGuiaNueva('quitados', quitados, idioma);
        if (lineaQuitados)
            notas.push(lineaQuitados);
        // 16-nov: las previas que se metieron delante y las misiones quitadas porque su previa no se puede hacer, en una línea
        // al final (con los nombres de la base, sin controles).
        const nombre = (q) => String(b.nombre('quest', q, idioma) ?? `#${q}`).replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 60);
        const lineaPrevias = textoGuiaNueva('previas', {
            previas: guias.length > 0 ? comprobada.previas : 0,
            sinPrevia: (comprobada.sinPrevia ?? []).map((s) => ({ mision: nombre(s.q), previa: nombre(s.previa), motivo: s.motivo })),
        }, idioma);
        if (lineaPrevias)
            notas.push(lineaPrevias);
        // Una ruta nueva sustituye a la que hubiera a medias (al confirmar, M1). S6: una sin pasos no se publica y no toca la
        // de antes. Con una guía de la biblioteca, el pedido con el que seguir (el `siguiente` o, si cabe entera, el paso de
        // después de `hasta`) y si le queda algo.
        const bib = biblioteca && guias.length > 0 ? {
            ...pedidoDe(biblioteca.pedidoSiguiente), sigue: biblioteca.continuar !== null,
        } : null;
        const confirmar = () => {
            if (guias.length > 1 || bib?.sigue)
                ponerPendientes(pj, { guias: guias.slice(1), mandados: 1, cuando: ahora(), clave: guias[0].clave, ...(bib ? { biblioteca: bib } : {}) });
            else if (guias.length === 1)
                quitarPendientes(pj);
        };
        const deBiblioteca = biblioteca ? (({ total: _t, ...resto }) => resto)(biblioteca.cuenta) : {};
        const previas = guias.length > 0 ? comprobada.previas ?? 0 : 0;
        return {
            guia: guias[0] ?? null, notas, confirmar,
            cuenta: { tramos: guias.length, pasos, misiones: misiones.size, quitados, previas, ...deBiblioteca, ...(biblioteca ? { pendientes: Math.max(0, guias.length - 1) } : {}) },
        };
    }
    // abrirGuia (y abrir_guia de TATI): la guía de la biblioteca tal cual (guiaBiblioteca.mjs) y, después, como la guiaNueva
    // de la IA (rutaDeLaIA). Cada tramo, una guía del addon: expandirGuia los mide con la misma comprobación y guiasDeRuta.
    // -> lo de rutaDeLaIA; con un id que no está en la biblioteca, {guia: null, notas, cuenta: {error: 'guia_desconocida'}}.
    async function rutaDeLaBiblioteca(pedido, { b, pj, pjRuta, datosTurno, idioma, id }) {
        const opciones = opcionesDeComprobar({ b, pjRuta, datosTurno, paginas: null });
        // Cada medida con las misiones de antes de `desde` como hechas (I3), igual que la comprobación final.
        const cuantasGuias = (g, { hechas = [] } = {}) => {
            const c = comprobarGuiaNueva(g, hechas.length > 0 ? opcionesDeComprobar({ b, pjRuta, datosTurno, paginas: null, hechas }) : opciones);
            return c.tramos.length > 0 ? guiasDeRuta(c.tramos, { titulo: g.titulo, pj: pjRuta, base: b }).length : 0;
        };
        const mapaJugador = Number.isFinite(datosTurno.datos?.lugar?.mapa) ? datosTurno.datos.lugar.mapa : undefined;
        // Valen las mismas misiones que en la guiaNueva de la IA: las de la base o las de alguna guía de la biblioteca.
        const existe = (q) => b?.mision(q, pjRuta) !== undefined || opciones.misionesBiblioteca.has(q);
        const e = await expandirGuia(pedido, { lector, base: b, pj: pjRuta, idioma, mapaJugador, existe, cuantasGuias });
        if (e.error) {
            log('aviso', `mensaje ${id}: abrirGuia: ${e.error}`);
            return { guia: null, notas: [textoGuiaNueva('guia_desconocida', {}, idioma)], cuenta: { error: e.error }, confirmar: () => { } };
        }
        if (!e.guiaNueva) {
            log('info', `mensaje ${id}: abrirGuia: sin pasos`);
            const { total: _t, ...resto } = e.cuenta;
            return {
                guia: null, notas: [textoGuiaNueva('sin_pasos', {}, idioma)], confirmar: () => { },
                cuenta: { tramos: 0, pasos: 0, misiones: 0, quitados: { misiones: 0, puntos: 0, pasos: 0, tramos: 0, textos: 0 }, previas: 0, pendientes: 0, ...resto },
            };
        }
        return rutaDeLaIA(e.guiaNueva, { b, pj, pjRuta, datosTurno, idioma, id, webs: { paginas: [], miradas: 0 }, biblioteca: e });
    }
    // S4: los datos de un turno (sacados de turno() sin cambiarlos): prepararTurno con la API de misiones, el comercio, las
    // guías propias y las del addon y las recientes de `pj`; las zonas y las marcas de origen. Con `recordar` (un turno del
    // jugador; no las acciones de TATI), el turno cuenta para las guías recientes de `pj`. -> {datosTurno, pjRuta}
    async function datosDelTurno(b, { pj, id, mensaje, idioma, recordar }) {
        // 13-nov: la búsqueda en la API es asíncrona y prepararTurno no: se hace antes y se le pasa el resultado.
        const misionApi = await misionApiParaMensaje(misionesApi, b, { ...mensaje, idioma });
        // Tarea 15: la fuente de los datos de comercio (inyectada; si falla, el turno sigue sin comercio).
        let comercio = null;
        try {
            comercio = await comercioDatos({ ...mensaje, idioma });
        }
        catch {
            log('aviso', `mensaje ${id}: sin datos de comercio (la fuente falló)`);
        }
        // 15-nov: las guías propias del jugador (SnetForever_MisGuias\mis-guias.lua, solo se lee; prepararTurno solo lo pide
        // si el mensaje habla de guías).
        const misGuias = () => leerMisGuias(addonsDir, { fs });
        // 2.ª ronda (en el juego): la guía elegida puede ser del propio addon (las de SnetForever_Rutas se leen del disco) y
        // las preguntas que siguen a la anterior vuelven a traer las guías de los últimos turnos de este personaje.
        const deAntes = [...new Set((guiasRecientes.get(pj) ?? []).flat())];
        const guiaAddon = (clave) => leerGuiaRutas(addonsDir, clave, { fs });
        // T3 (B5): la parte de su guía de la IA y cuántas trae aún «sigue» (datos.ruta.tramo).
        const tramo = tramoDeLaGuia(pj, mensaje?.ctx?.guia?.clave);
        const datosTurno = prepararTurno(b, mensaje, undefined, { misionApi, comercio, misGuias, guiaAddon, recientes: deAntes, tramo });
        // 17-nov (TATI decía «no puedo ver tus talentos» y no quedaba rastro): sin la pregunta ni el nombre del personaje.
        if (datosTurno.talentosFalta && !talentosAvisados.has(pj)) {
            talentosAvisados.add(pj);
            log('aviso', `mensaje ${id}: el addon no pudo leer los talentos`);
        }
        // Revisión: cada turno cuenta, aunque no traiga guías ([]), para que la memoria caduque a los TURNOS_RECIENTES.
        if (recordar)
            guiasRecientes.set(pj, [datosTurno.guiasConPasos, ...(guiasRecientes.get(pj) ?? [])].slice(0, TURNOS_RECIENTES));
        // 12-nov: los pines que la IA saca de internet llevan el nombre de la zona; la app la busca en la base.
        datosTurno.resolverZona = (zona) => resolverZona(b, zona, idioma);
        // Tarea 20: las marcas de origen (B:…, G:…) con la base, el personaje y su mapa, y los pasos de la biblioteca.
        const pjRuta = personajeDe(datosTurno);
        const mapaJugador = Number.isFinite(datosTurno.datos?.lugar?.mapa) ? datosTurno.datos.lugar.mapa : undefined;
        baseDelLector = b;
        idiomaDelLector = idioma;
        datosTurno.puntoDeMarca = (marca) => puntoDeMarca(marca, { base: b, pj: pjRuta, mapaJugador, idioma, pasoDeGuia: lector.pasoDeGuia });
        return { datosTurno, pjRuta };
    }
    async function armar({ b, pj, id, texto, idioma, datosTurno, pjRuta, textoIA, leidas, nombreMotor, aviso, diferir = false, redRuta = true }) {
        datosTurno.paginas = leidas; // las páginas que leyó (tarea 20); null si no se sabe
        // Revisión final: las páginas de verdad de los `web` de guiaNueva y de los `pinesWeb` (un solo cupo de 3), antes de
        // procesar: cada pin de internet pasa por la misma comprobación que un `web` (datosTurno.puntoDeWeb).
        const webs = await paginasDeVerdad(direccionesWeb(textoIA), datosTurno.paginas);
        datosTurno.puntoDeWeb = crearComprobadorWeb(webs.paginas, datosTurno.resolverZona);
        const res = procesarRespuesta(textoIA, datosTurno, idioma);
        let plano = res.texto;
        const parcial = { t: 'respuesta', ...(nombreMotor !== undefined ? { motor: nombreMotor } : {}) };
        // Tarea 20: las líneas de la app sobre la guía de la IA (van enteras al final del texto y al historial).
        const notasGuia = [];
        let ruta = null;
        const cambios = [];
        // abrirGuia gana sobre guiaNueva (respuesta.mjs ya ni la mira si el bloque trae abrirGuia). I1: si es el pedido con
        // el que siguen unos tramos pendientes, el siguiente de ellos.
        if (res.abrirGuia) {
            const g = pendienteDeLaBiblioteca(pj, res.abrirGuia, idioma, id) ?? await rutaDeLaBiblioteca(res.abrirGuia, { b, pj, pjRuta, datosTurno, idioma, id });
            ruta = g.cuenta;
            cambios.push(g.confirmar);
            if (g.guia) {
                parcial.guiaIA = g.guia;
                parcial.abrirGuiaIA = true; // el jugador la pidió: se abre sola
            }
            notasGuia.push(...g.notas);
        }
        else if (res.quitados.includes('abrirGuia')) {
            notasGuia.push(textoGuiaNueva('pedido_malo', {}, idioma));
        }
        else if (res.guiaNueva) {
            const g = await rutaDeLaIA(res.guiaNueva, { b, pj, pjRuta, datosTurno, idioma, id, webs });
            ruta = g.cuenta;
            cambios.push(g.confirmar);
            if (g.guia) {
                parcial.guiaIA = g.guia;
                parcial.abrirGuiaIA = true; // el jugador la pidió: se abre sola
            }
            notasGuia.push(...g.notas);
        }
        else if (res.quitados.includes('guiaNueva')) {
            notasGuia.push(textoGuiaNueva('sin_pasos', {}, idioma));
        }
        if (res.rutaZona && !res.guiaNueva && !res.abrirGuia) {
            // Revisión final (diseño §2): en una ruta que pidió el jugador no se quita nada por nivel ni por mazmorra.
            const pedida = pideGuia(texto);
            const rz = construirRutaZona(b, pedida ? { ...res.rutaZona, sinNivel: true, mazmorras: true } : res.rutaZona, datosTurno, idioma);
            if (rz.guia) {
                parcial.guiaIA = rz.guia;
                if (pedida)
                    parcial.abrirGuiaIA = true; // R2: solo si el jugador pidió una guía o una ruta
                // Otra guía que pidió (ronda 3, m1: solo la pedida): los tramos pendientes de la de antes ya no siguen.
                if (pedida)
                    cambios.push(() => quitarPendientes(pj));
            }
            if (rz.texto)
                plano = plano ? `${plano}\n\n${rz.texto}` : rz.texto;
        }
        // T3 (S2, 17-nov: una ruta improvisada se ponía delante de la guía que llevaba a medias): si el jugador no pide una
        // ruta ni llegar a un sitio (pideRuta, ronda 1: I1) y su guía cargada no está acabada (datos.ruta sin `fin`) o tiene
        // partes pendientes (las mismas que ve la IA: datos.ruta.tramo.pendientes, ronda 1: I3), la `ruta` sale como pines: se
        // marca en el mapa pero no se abre como guía, y el texto lo dice (M8). Ronda 1 (I2): no en las acciones de TATI
        // (`redRuta` false en armarRespuesta): allí manda su regla S1, porque la app no ve lo que pidió el jugador.
        const rutaCargada = datosTurno.datos?.ruta;
        if (redRuta && res.propuesta?.tipo === 'ruta' && !pideRuta(texto) && rutaCargada
            && (rutaCargada.fin !== true || (rutaCargada.tramo?.pendientes ?? 0) > 0)) {
            res.propuesta = { ...res.propuesta, tipo: 'pines', puntos: res.propuesta.puntos.map((p) => ({ ...p, seguir: false })) };
            notasGuia.push(textoGuiaNueva('ruta_en_pines', {}, idioma));
        }
        // El aviso de las herramientas solo va al juego: el historial guarda lo que dijo la IA.
        // Revisión 1: el aviso se renderiza aparte y el cuerpo deja su sitio bajo los topes, así llega siempre entero.
        // Tarea 20: igual que el resumen de la guía y lo quitado; el tope del cuerpo es solo para lo que escribió la IA.
        const pie = [...notasGuia, ...(aviso ? [textoHerramientas(aviso, idioma)] : [])];
        parcial.texto = pie.length > 0 ? conPie(plano, pie) : renderizar(plano);
        if (res.propuesta)
            parcial.propuesta = res.propuesta;
        if (res.marcas)
            parcial.marcas = res.marcas;
        // Dibujos de la IA en el mapa: el addon los pone sin pedir aceptar (mapa/dibujos.lua).
        if (res.dibujos)
            parcial.dibujos = res.dibujos;
        // Tarea 15: el grupo y la regla de comercio ya validados; el addon enseña [Aplicar] [Descartar].
        if (res.comercio)
            parcial.comercio = res.comercio;
        if (res.guia)
            parcial.guia = { clave: res.guia, titulo: datosTurno.guias.get(res.guia) };
        let hecho = false;
        const confirmar = () => {
            if (hecho)
                return;
            hecho = true;
            for (const c of cambios)
                c?.();
        };
        if (!diferir)
            confirmar();
        return {
            parcial, historia: [['jugador', texto], ['ia', [plano, ...notasGuia].filter(Boolean).join('\n\n')]], quitados: res.quitados, ruta,
            dibujos: res.cuentaDibujos ?? null, confirmar,
        };
    }
    // S4: armar a partir de un mensaje del juego (el de un latido o uno normal) y del texto de una respuesta, sin preguntar a
    // nadie ni publicar nada. `paginas`: null = como sin stream-json (no se mira ninguna página); 'propias' = las direcciones
    // del bloque (direccionesWeb; como mucho MAX_PAGINAS_WEB, que pone paginasDeVerdad), que la app baja ella misma; o la
    // lista [{url}] de las que se leyeron. `pj` por defecto el del último estado del juego. Puede rechazarse (la base que
    // no carga, por ejemplo). -> {parcial, historia, quitados, ruta, dibujos} (los tres últimos, como en armar)
    async function armarRespuesta({ pj = estadoJuego?.ultimo()?.pj, mensaje, texto, idioma, id = 'tati', paginas = null, motor: nombreMotor } = {}) {
        const m = mensaje && typeof mensaje === 'object' ? mensaje : {};
        const lengua = (idioma ?? m.idioma) === 'en' ? 'en' : 'es';
        const textoIA = typeof texto === 'string' ? texto : '';
        const b = await obtenerBase();
        const { datosTurno, pjRuta } = await datosDelTurno(b, { pj, id, mensaje: m, idioma: lengua, recordar: false });
        const leidas = paginas === 'propias' ? paginasPropias(textoIA) : Array.isArray(paginas) ? paginas : null;
        const { parcial, historia, quitados, ruta, dibujos, confirmar } = await armar({
            b, pj, id, texto: typeof m.texto === 'string' ? m.texto : '', idioma: lengua, datosTurno, pjRuta, textoIA, leidas, nombreMotor,
            aviso: null, diferir: true, redRuta: false,
        });
        return { parcial, historia, quitados, ruta, dibujos, confirmar };
    }
    // Un «sigue» tras el último tramo de una guía de la biblioteca que sigue: la abre desde el paso siguiente (el pedido
    // abrirGuia que guardaron los tramos pendientes), como si la IA hubiera contestado con ese bloque, sin preguntarle.
    // Ronda 3 (m3): los pendientes (`pendientes`) se quitan solo cuando ya se ha armado: si algo falla antes (la base que no
    // carga), la continuación sigue ahí para el siguiente «sigue». Si armar trae una guía nueva, ya los ha sustituido.
    async function seguirLaGuia({ pj, id, mensaje, idioma, texto, continuar, pendientes }) {
        const b = await obtenerBase();
        const { datosTurno, pjRuta } = await datosDelTurno(b, { pj, id, mensaje, idioma, recordar: true });
        log('info', `mensaje ${id}: abrirGuia: sigue desde el paso ${continuar.desde}, sin preguntar a la IA`);
        const textoIA = `\`\`\`snet\n${JSON.stringify({ abrirGuia: continuar })}\n\`\`\``;
        const { parcial, historia } = await armar({ b, pj, id, texto, idioma, datosTurno, pjRuta, textoIA, leidas: null, aviso: null });
        if (tramosPendientes.get(pj) === pendientes)
            quitarPendientes(pj);
        return { parcial, historia };
    }
    // S5: un turno con TATI como cerebro, sin mirar las cuentas ni preguntar a Claude o Codex. -> {parcial, historia?}
    async function turnoTati({ pj, id, mensaje, idioma, texto, t0 }) {
        const este = { pj, id, parado: false };
        tatiEnCurso = este;
        try {
            // La cabecera con `turno`, sin timbre: no gasta ranura y el jugador sin sonido la ve en sus repasos.
            await publicar({ conTimbre: false, idioma }).catch(() => { });
            const b = await obtenerBase();
            const { datosTurno, pjRuta } = await datosDelTurno(b, { pj, id, mensaje, idioma, recordar: true });
            if (este.parado)
                return detenidoSinPreguntar(id, idioma, t0);
            const n = numeroDe(id);
            const pulso = n === null ? null : (n % 2 === 0 ? 'recibido_par' : 'recibido_impar');
            let pulsoPendiente = false;
            const alSeguir = () => {
                // Con otro mensaje suyo detrás, este pulso se tomaría por el acuse de ese (solo llevan la paridad).
                if (!pulso || pulsoPendiente || hayDetras(pj))
                    return;
                pulsoPendiente = true;
                tocar(pulso).then(() => { pulsoPendiente = false; });
            };
            const r = await cerebro.turno({
                instrucciones: SISTEMA_TATI, datos: bloqueDatos(datosTurno.datos), texto: neutralizar(texto), idioma, nueva: mensaje.nueva === true, alSeguir,
            });
            if (!r || !r.ok) {
                const tipo = typeof r?.tipo === 'string' ? r.tipo : 'fallo';
                if (tipo === 'detenido')
                    log('info', `mensaje ${id}: tati detenido en ${ahora() - t0} ms`);
                else
                    log('aviso', `mensaje ${id}: tati error ${tipo} en ${ahora() - t0} ms`);
                return { parcial: { t: 'error', tipo, texto: textoDe(tipo, r?.detalle, idioma, 'tati'), motor: 'tati' } };
            }
            // Como armarRespuesta con paginas 'propias', con los datos de este turno (no se vuelven a preparar).
            const { parcial, historia, quitados } = await armar({
                b, pj, id, texto, idioma, datosTurno, pjRuta, textoIA: r.texto, leidas: paginasPropias(r.texto), nombreMotor: 'tati', aviso: null,
            });
            log('info', `mensaje ${id}: tati contestó en ${ahora() - t0} ms (${quitados.length} quitados)`);
            return { parcial, historia };
        }
        finally {
            // Antes del registro: la publicación del final ya sale sin `turno`.
            if (tatiEnCurso === este)
                tatiEnCurso = null;
        }
    }
    // ¿Hay en la cola algún mensaje de `pj` esperando?
    function hayDetras(pj) {
        for (const clave of enCola)
            if (clave.slice(0, clave.lastIndexOf('|')) === pj)
                return true;
        return false;
    }
    // Un turno parado antes de llegar a TATI.
    function detenidoSinPreguntar(id, idioma, t0) {
        log('info', `mensaje ${id}: tati detenido en ${ahora() - t0} ms`);
        return { parcial: { t: 'error', tipo: 'detenido', texto: textoDe('detenido', '', idioma, 'tati'), motor: 'tati' } };
    }
    async function turno({ pj, id, mensaje, idioma }) {
        const t0 = ahora();
        const texto = typeof mensaje.texto === 'string' ? mensaje.texto : '';
        try {
            // Revisión: «nueva» borra también las guías recientes aquí, antes de cualquier salida temprana (sin motor, fallos).
            // Ronda 2 (decisión 3): los tramos pendientes no: siguen hasta otra guía o 7 días (T3).
            if (mensaje.nueva === true) {
                guiasRecientes.delete(pj);
                await anadirHistorial(pj, 'nueva', '');
            }
            // Le ha tocado: si se pidió parar mientras esperaba en la cola, no se pregunta a nadie.
            const claveCola = `${pj}|${id}`;
            enCola.delete(claveCola);
            if (paradoEnCola === claveCola) {
                paradoEnCola = null;
                return detenidoSinPreguntar(id, idioma, t0);
            }
            // Tarea 20: con tramos pendientes, un «sigue» se contesta aquí, sin preguntar a la IA.
            const tramo = siguienteTramo(pj, texto, idioma, id);
            if (tramo?.continuar)
                return await seguirLaGuia({ pj, id, mensaje, idioma, texto, continuar: tramo.continuar, pendientes: tramo.pendientes });
            if (tramo)
                return tramo;
            // Ronda 2 (decisión 3): otra pregunta ya no borra los tramos pendientes; solo otra guía (la de este turno, si la
            // trae) o los 7 días (T3).
            // S5: con TATI como cerebro, ni cuentas ni motores.
            if (cerebro && elPuente().cerebro === 'tati')
                return await turnoTati({ pj, id, mensaje, idioma, texto, t0 });
            const est = await estadosMotores();
            const cfg = leerLaConfig();
            const eleccion = motor.elegirMotor(cfg, est, mensaje.modelo);
            if (!eleccion || eleccion.error) {
                reComprobar = true;
                const e = errorDeEleccion(eleccion || {}, est, idioma);
                log('aviso', `mensaje ${id}: sin motor listo (${e.tipo})`);
                return { parcial: { t: 'error', tipo: e.tipo, texto: e.texto, motor: e.motor } };
            }
            const b = await obtenerBase();
            const { datosTurno, pjRuta } = await datosDelTurno(b, { pj, id, mensaje, idioma, recordar: true });
            // Tarea 14: el turno de las herramientas antes de preguntar (si no se puede, sin ellas). Con Claude, su mcp.json;
            // 22-nov: con Codex, el mismo servidor con solo las que leen.
            let conHerramientas = null;
            let aviso = null;
            if (herramientas === true && MOTORES.includes(eleccion.motor)) {
                try {
                    await escribirTurno(datos, turnoDe(mensaje, { carpetaBase }), { fs });
                    conHerramientas = eleccion.motor === 'codex'
                        ? { mcp: mcpCodex(datos) }
                        : { mcpConfig: asegurarMcpHerramientas(datos, { fs }), nombres: HERRAMIENTAS };
                }
                catch (e) {
                    aviso = 'no_arrancaron';
                    log('aviso', `mensaje ${id}: herramientas sin preparar (${e?.code || e?.name || 'Error'})`);
                }
            }
            // Prueba B: solo si la pregunta va de verdad con las herramientas, la entrada lleva la línea que pide usarlas.
            const entrada = construirEntrada({ datos: datosTurno.datos, historial: recientes(pj), texto, herramientas: Boolean(conHerramientas) });
            const r = await motor.preguntar({
                config: cfg, estados: est, iaModelo: mensaje.modelo, sistema: SISTEMA, entrada, tiempoMax, programas: programasDe, modulos,
                ...(conHerramientas ? { herramientas: conHerramientas } : {}),
            });
            if (!r || !r.ok) {
                const tipo = r?.tipo || 'fallo';
                const m = r?.motor || eleccion.motor;
                if (ERRORES_DE_CUENTA.has(tipo)) {
                    reComprobar = true;
                    if (MOTORES.includes(m) && ESTADOS.includes(tipo))
                        estados = { ...estados, [m]: { estado: tipo } };
                }
                log('aviso', `mensaje ${id}: ${m} ${eleccion.modelo} error ${tipo} en ${ahora() - t0} ms`);
                return { parcial: { t: 'error', tipo, texto: textoDe(tipo, r?.detalle, idioma, m), motor: m } };
            }
            if (herramientas === true)
                aviso = avisoHerramientas(r, conHerramientas, texto) ?? aviso;
            if (aviso)
                log('aviso', `mensaje ${id}: herramientas ${aviso}`);
            // S4: lo que la app hace con el texto de la respuesta va en armar (lo usan también las acciones de TATI).
            const { parcial, historia, quitados } = await armar({
                b, pj, id, texto, idioma, datosTurno, pjRuta, textoIA: r.texto, leidas: r.paginas ?? null, nombreMotor: r.motor, aviso,
            });
            log('info', `mensaje ${id}: ${r.motor} ${eleccion.modelo} contestó en ${ahora() - t0} ms (${quitados.length} quitados)`);
            return { parcial, historia };
        }
        catch (e) {
            log('error', `mensaje ${id}: fallo interno en el turno (${e?.code || e?.name || 'Error'})`);
            return { parcial: { t: 'error', tipo: 'fallo', texto: textoDe('fallo', 'interno', idioma) } };
        }
    }
    // ---------- recibir ----------
    // S4: apunta el estado del juego de `pj` para TATI (un fallo no para nada; nunca con nombres en registro.log).
    function apuntarEstado(pj, mensaje, r) {
        if (!estadoJuego)
            return Promise.resolve();
        try {
            return Promise.resolve(estadoJuego.apuntar(pj, mensaje, r)).catch((e) => {
                log('aviso', `latido: no se pudo guardar (${e?.code || e?.name || 'Error'})`);
            });
        }
        catch (e) {
            log('aviso', `latido: no se pudo guardar (${e?.code || e?.name || 'Error'})`);
            return Promise.resolve();
        }
    }
    function admitir(completo) {
        const { pj, id } = completo;
        // Revisión final (M1): un latido que no se puede leer no es un mensaje del jugador: se descarta sin más (ni error en
        // el chat, ni recibidos, ni ranura gastada). Los ids de los mensajes nunca acaban en -L<n>. Igual un «parar» (-P<k>).
        if (completo.error && /-L\d+$/.test(String(id))) {
            log('aviso', 'latido: ilegible');
            return Promise.resolve(null);
        }
        if (completo.error && /-P\d+$/.test(String(id))) {
            log('aviso', 'parar: ilegible');
            return Promise.resolve(null);
        }
        const leido = !completo.error && completo.mensaje && typeof completo.mensaje === 'object' ? completo.mensaje : null;
        // S4: un latido (solo con el puente activo; si no, se ignora) guarda el estado y su r, y nada más: ni cola, ni
        // registro, ni timbres, ni recibidos, ni historial, ni seq.
        if (leido?.tipo === 'latido') {
            if (!elPuente().activo)
                return Promise.resolve(null);
            rUltima = acotarRanura(completo.r);
            cVisto = Math.max(cVisto, entero(completo.c));
            // registro.log: «latido» solo si cambia la r o ha pasado un minuto desde el último apuntado.
            const t = ahora();
            if (!latidoApuntado || latidoApuntado.r !== rUltima || t - latidoApuntado.cuando >= 60_000) {
                latidoApuntado = { r: rUltima, cuando: t };
                log('info', 'latido');
            }
            return Promise.all([apuntarEstado(pj, leido, completo.r), guardarLatido(pj)]).then(() => null);
        }
        if (leido?.tipo === 'parar')
            return admitirParar(completo, leido);
        const clave = `${pj}|${id}`;
        if (vistos.has(clave) || guardado.recibidos[pj] === id)
            return Promise.resolve(null);
        vistos.set(clave, true);
        while (vistos.size > MAX_VISTOS)
            vistos.delete(vistos.keys().next().value);
        cVisto = Math.max(cVisto, entero(completo.c));
        // S4: con el puente activo, un mensaje normal también cuenta como latido.
        if (leido && elPuente().activo)
            apuntarEstado(pj, leido, completo.r);
        rUltima = acotarRanura(completo.r);
        if (elPuente().activo)
            guardarLatido(pj);
        const toques = [];
        const n = numeroDe(id);
        if (n !== null)
            toques.push(tocar(n % 2 === 0 ? 'recibido_par' : 'recibido_impar'));
        apuntarRecibido(guardado.recibidos, pj, id);
        const mensaje = completo.mensaje && typeof completo.mensaje === 'object' ? completo.mensaje : {};
        const idioma = mensaje.idioma === 'en' ? 'en' : 'es';
        const peticion = { pj, id, c: completo.c, idioma, mensaje };
        log('info', `mensaje ${id} recibido`);
        // Un JSON ilegible no se contesta y no toca el historial: no se sabe si llevaba «nueva» (Ruling F4-35).
        if (completo.error) {
            return terminar(peticion, { t: 'error', tipo: 'fallo', texto: textoDe('fallo', 'mensaje_ilegible', idioma) }, toques);
        }
        // Uno que no cabe en la cola no se contesta, pero el addon ya gastó su «nueva»: se apunta igual.
        if (pendientes >= MAX_COLA) {
            log('aviso', `mensaje ${id}: cola llena (ocupado)`);
            if (mensaje.nueva === true)
                guiasRecientes.delete(pj);
            const nueva = mensaje.nueva === true ? anadirHistorial(pj, 'nueva', '') : Promise.resolve();
            const hecho = terminar(peticion, { t: 'error', tipo: 'ocupado', texto: textoError('ocupado', '', idioma) }, toques);
            return Promise.all([hecho, nueva]).then(([registro]) => registro);
        }
        pendientes++;
        enCola.add(clave);
        avisar();
        const paso = cadenaTurnos.then(async () => {
            const { parcial, historia } = await turno(peticion);
            const hecho = registrar(peticion, parcial);
            await hecho.publicado;
            if (historia)
                for (const [t, x] of historia)
                    await anadirHistorial(pj, t, x);
            return hecho;
        });
        // La cola sigue en cuanto el buzón está escrito: los pulsos de los timbres no la paran.
        cadenaTurnos = paso.then(() => { }, () => { }).finally(() => {
            pendientes--;
            avisar();
        });
        return paso.then((hecho) => rematar(hecho, toques)).catch(() => null);
    }
    // El botón de parar del chat: ni cola, ni registro, ni recibidos, ni historial, ni seq. Su r y su cursor sí valen, como
    // los de un latido: sin sonido, el addon puede haber gastado ranuras en sus repasos desde que mandó el mensaje.
    function admitirParar({ pj, id, r, c }, { turno: idTurno }) {
        // Vale el turno de TATI que esté en marcha, aunque entretanto se haya elegido otro cerebro.
        if (!cerebro || (!tatiEnCurso && elPuente().cerebro !== 'tati'))
            return Promise.resolve(null);
        const clave = `${pj}|${id}`;
        if (ultimoParar === clave)
            return Promise.resolve(null);
        ultimoParar = clave;
        rUltima = acotarRanura(r);
        cVisto = Math.max(cVisto, entero(c));
        const delPj = tatiEnCurso && tatiEnCurso.pj === pj ? tatiEnCurso : null;
        const pararEnCurso = () => {
            delPj.parado = true; // por si aún no ha llegado a preguntar a TATI
            log('info', `mensaje ${delPj.id}: parar`);
            return Promise.resolve().then(() => cerebro.parar()).then(() => null, () => null);
        };
        if (delPj && delPj.id === idTurno)
            return pararEnCurso();
        const objetivo = `${pj}|${idTurno}`;
        if (enCola.has(objetivo)) {
            paradoEnCola = objetivo;
            log('info', `mensaje ${idTurno}: parar en la cola`);
            // Un turno suyo anterior (p. ej. de antes de un /reload) es lo que lo tiene esperando: se para también.
            if (delPj)
                return pararEnCurso();
        }
        return Promise.resolve(null);
    }
    function recibirTrama(bytes) {
        try {
            const completo = reunidor.anadir(leerTrama(bytes));
            if (!completo)
                return Promise.resolve(null);
            return admitir(completo);
        }
        catch (e) {
            log('error', `trama: fallo interno (${e?.code || e?.name || 'Error'})`);
            return Promise.resolve(null);
        }
    }
    async function publicarEstado(nuevos) {
        if (nuevos && typeof nuevos === 'object') {
            const de = (m) => {
                const v = nuevos[m];
                if (typeof v === 'string')
                    return { estado: v };
                if (v && typeof v === 'object')
                    return v;
                return estados?.[m] ?? { estado: 'desconocido' };
            };
            estados = { claude: de('claude'), codex: de('codex') };
            estadosCuando = ahora();
            reComprobar = false;
        }
        else {
            await estadosMotores();
        }
        avisar();
        try {
            const r = await publicar({ conTimbre: rUltima !== null, primeras: true });
            await r.toque;
            return { escritas: r.escritas, fallos: r.fallos };
        }
        catch {
            return { escritas: [], fallos: [] };
        }
    }
    async function inactivo() {
        for (;;) {
            const turnos = cadenaTurnos;
            const pub = cadenaPublicar;
            const lat = cadenaLatido;
            const pen = cadenaPendientes;
            await turnos;
            await pub;
            await lat;
            await pen;
            if (turnos === cadenaTurnos && pub === cadenaPublicar && lat === cadenaLatido && pen === cadenaPendientes)
                return;
        }
    }
    return { recibirTrama, publicarEstado, estado, alCambiar, inactivo, recargarBase, baseActual: () => baseLista, empujar, armarRespuesta };
}
