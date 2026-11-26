// Historial de subastas por casa: el valor de mercado («lo normal»), su tendencia y cuánto sale de la subasta.
//
// CÓMO SE CALCULA CADA NÚMERO (T1b). Todo sale de las fotos que la API de Blizzard da cada hora; no hay otra fuente.
//   · Compra mínima (`precio` del resumen): el precio por unidad más barato de la última foto EN LA QUE ESTABA el
//     objeto, tal cual. Si no está en la última foto de la casa, `enVenta` es false y `cantidad` y `subastas` son 0: ese
//     precio ya no existe, y quien enseñe o juzgue un precio de ahora (el tooltip, las reglas, la IA, el grupo «más
//     barato de lo normal») no lo usa.
//   · Valor de la hora (`valor`): se ordenan las unidades a la venta de la más barata a la más cara y se coge el «tramo
//     barato», el 30 % de las unidades (3 como mínimo, o todas si hay menos). De ese tramo se mira el precio del medio
//     (el de la unidad central; con un número par, la de abajo) y se quitan los raros: lo que cuesta menos de la mitad o
//     más del doble de ese precio. El valor de la hora es la media de lo que queda. Con poca oferta ya no es la subasta
//     más barata.
//   · Valor de mercado (`normal`): la mediana de los valores de las últimas 72 fotos en las que el objeto estaba a
//     la venta (se guardan 72 por objeto). Con el objeto siempre a la venta son 3 días; si falta a ratos, esas 72 fotos
//     abarcan más, hasta 7 días (lo de más de 168 h se olvida). Una hora rara (alguien pone una ganga o se lleva lo
//     barato) no lo mueve. Con menos de 3 fotos es el último valor y `poco` vale true (`poco` llega a la IA y al addon;
//     el tooltip no lo enseña).
//   · Tendencia: la media de los valores de las 24 últimas de esas fotos contra la media de TODAS las anteriores que se
//     guardan (48 si hay las 72; menos si hay menos), en %. null si no hay más de 24 fotos.
//   · Lo que sale de la subasta. Entre dos fotos seguidas, una subasta que ya no está pudo venderse, retirarla su dueño
//     o caducar. La API no dice cuál, pero sí cuánto tiempo le quedaba (corto: menos de 30 min; medio: de 30 min a 2 h;
//     largo: más de 2 h), y con eso se separa lo que caducó de lo que salió antes de tiempo:
//       - le quedaba corto, o lleva dos fotos seguidas en medio: CADUCADA. En la segunda foto en medio le quedaban
//         menos de 2 h menos el hueco entre las dos: menos de una hora con fotos cada hora, y hasta 1 h 10 min en el
//         borde (dos fotos «seguidas» van de 50 a 70 min). No es seguro del todo: si salió antes de tiempo en ese último
//         rato (o en su última media hora, con «corto»), se cuenta como caducada. El error va siempre en la misma
//         dirección: una salida contada como caducada, así que los dos números quedan por debajo de la verdad;
//       - le quedaba largo: SALIÓ ANTES DE TIEMPO (vendida o retirada: eso no se puede distinguir, la API no trae al
//         vendedor);
//       - acababa de bajar de largo a medio (la foto anterior la vio en largo): SALIÓ ANTES DE TIEMPO si las tres fotos
//         (la que la vio en largo, la que la vio en medio y la que ya no la trae) caben en menos de 2 h 10 min
//         (2 h + MARGEN_SALIDA_S). En la primera le quedaban 2 h o más, así que dentro de 2 h justas es seguro que no
//         caducó. Los 10 minutos de margen están porque las fotos son cada hora pero no al segundo: sin margen, unos
//         segundos de retraso dejaban fuera casi todas estas salidas. A cambio, rara vez puede contar como salida una
//         subasta que caducó dentro de ese margen (le quedaban 2 h y pocos minutos en la primera foto y las fotos
//         tardaron más de 2 h). Si entre las tres fotos pasan 2 h 10 min o más: DUDOSA, no cuenta en nada;
//       - estaba en medio y no se sabe desde cuándo (primera vez que se ve, o tras un hueco): DUDOSA, no cuenta en nada.
//     Una subasta que sigue pero con menos unidades (compra parcial de una mercancía): esas unidades salieron seguro.
//     F5, las cancelaciones de las MERCANCÍAS. La API no trae vendedor ni motivo: una subasta que desaparece con tiempo
//     de sobra puede estar vendida o cancelada, y quien usa TSM cancela y vuelve a publicar un poco más barato a todas
//     horas (con el Paño de lana salían 36846 al día con 10557 a la venta: las ventas más las cancelaciones). Pero una
//     compra de una mercancía se lleva siempre lo más barato primero. Así que, por objeto, si entre las dos fotos alguna
//     de sus subastas sigue con el mismo id y la misma cantidad (intacta) a un precio P*, nadie compró nada por encima de
//     P*: lo que sale antes de tiempo a MÁS de P* es una cancelación y no cuenta en nada (ni en `vendidosDia` ni en
//     `ritmo`). Lo que sale a P* o menos, y lo que baja de cantidad, cuenta como siempre. Sin ninguna intacta del objeto
//     en el par, todo cuenta como siempre. Sigue siendo un tope por arriba (un «máximo aproximado»): la cancelación de la
//     más barata se cuela. Al revés, un caso raro: si la más barata intacta es del propio comprador (no puede comprarse a
//     sí mismo), una compra de verdad por encima se descuenta; es poco y va en la dirección segura. Con un mercado
//     inventado de unas 10500 unidades y 2000 ventas de verdad al día (la estimación de la investigación, también en las
//     pruebas): con el 30 % de TSM el número baja de 18147 a 2055, y con el 50 % cancelando cada hora, de 52296 a 1956;
//     sin nadie que cancele no cambia (1952). Para eso la última foto guarda el precio por unidad de cada mercancía
//     (`ultimaPrecio`). A los OBJETOS SUELTOS no se les aplica: allí el comprador elige la subasta que quiere, y cada
//     subasta que sale antes de tiempo cuenta como antes. Cada objeto sabe si es una mercancía (`mercancia`, de la última
//     foto en la que estuvo: alguna de sus subastas vino de la lista de mercancías) y el resumen lo dice.
//     `vendidosDia` son las UNIDADES que salen antes de tiempo al día y `ritmo` es, de las subastas que salen, la parte
//     que lo hace antes de caducar: anticipadas / (anticipadas + caducadas). Los dos nombres son de antes de T1b y se
//     quedan por no cambiar la forma de lo que leen el addon y la IA; el addon los enseña (F5) como «Salen al día
//     (vendidas o retiradas, aprox.)» en una mercancía y «Salen antes de tiempo al día (vendidas o retiradas)» en un
//     objeto suelto.
//     Solo se comparan dos fotos «seguidas» (entre 50 y 70 min una de otra). Hacen falta 24 de esos pares dentro de los
//     últimos 7 días (un día de observación en total; los pares no tienen que ir uno detrás de otro) para dar los dos
//     números: con menos valen null. Se dividen entre los pares que haya: unidades / (pares / 24).
//   Antes de T1b una subasta en «medio» que desaparecía contaba como vendida, y eso es lo que le pasa a la mitad de las
//   que caducan (la última foto las ve con entre 30 y 60 min). Por eso salían muchas más «ventas» de las reales. Un
//   historial de antes (sin `tiempos` en la cabecera) se lee, pero no se usa nada de él: ni lo que contó ni sus valores
//   por hora, que son de la fórmula vieja (ver empezarDeNuevo). Todo empieza con la foto siguiente.
//
// Se guarda poco y con tamaño fijo por objeto, para que la app (encendida todo el día) no crezca:
//   · precios: las últimas 72 fotos de cada objeto ([hora, valor de la hora] en un Float64Array), que es todo lo que
//     usan el valor de mercado (mediana de esas 72) y la tendencia (las 24 últimas frente a todas las anteriores que
//     se guardan); más la cantidad, las subastas, la compra mínima de la última y si es una mercancía (F5). Nada de
//     más de 168 h.
//   · ventas: por objeto, lo que salió antes de tiempo, lo caducado y las unidades en trozos de 6 h (28 trozos = 7 días,
//     en un Uint32Array); por casa, cuántos pares de fotos seguidas hubo en cada trozo. Así ocupa lo mismo siempre.
//   · la última foto de la casa en columnas ordenadas por id (id, objeto, cantidad, tiempo y, F5, el precio por unidad de
//     las mercancías; 0 en los objetos sueltos) para ver en la siguiente qué subastas han desaparecido, cuánto ha bajado
//     cada una y cuáles siguen intactas. El precio vive solo aquí, en el historial local, como `minimo`: no sale a
//     ningún sitio. Son los identificadores de subasta (auctionID) de la API.
//     La regla: en el addon (SavedVariables), nunca; en la app, solo los de la última foto (cada foto nueva los
//     sustituye: no hay histórico de identificadores), sin vendedor ni nombre al lado, y nunca salen del PC (no van a la
//     IA, ni a TATI, ni a los precios que lee el addon, ni a ninguna publicación). La columna del tiempo se llama `corta` (el nombre viejo) y
//     lleva 0 largo, 1 corto, 2 medio recién bajado de largo, 3 medio repetido, 4 medio sin saber. Las fotos crudas no
//     se guardan.
//
// En disco: `historial-<casa>.bin`, esas mismas columnas en binario y comprimidas (gzip en segundo plano, sin parar la
// app). El formato viejo (`historial-<casa>.json`, versión 1) se lee y se convierte; tras el primer guardado va a la
// cuarentena (nunca se borra). T1b añade sin cambiar de versión: `tiempos: 1` y `hueco` en la cabecera y la columna
// `minimo`; un archivo sin `tiempos` se lee y se empieza de nuevo (ver arriba) y una app de antes lee los nuevos sin
// romperse. F5 añade igual, sin cambiar de versión, dos columnas opcionales: `ultimaPrecio` (el precio por unidad de la
// última foto, una por subasta) y `mercancia` (una por objeto, 1 o 0). Un historial sin ellas se lee: su primer par se
// cuenta como antes (sin P*) y los objetos no saben si son mercancías hasta la foto siguiente. Una app de antes no las mira.
//
// La hora (`hora`) son SEGUNDOS desde 1970 (epoch), en todas partes: al añadir fotos, al guardar y en el resumen.
//
// F9m (temporal): `alPar` es el único enganche del contador de medir-salen.mjs. Se le avisa de cada par de fotos seguidas
// ya contado y puede pedir una COPIA de las dos fotos (`par()`); no puede cambiar nada de aquí, y si falla no pasa nada.
import { join, basename } from 'node:path';
import { gzip, gunzipSync } from 'node:zlib';
import { promisify } from 'node:util';
import { escribirAtomico } from '../buzon.mjs';
import { CODIGOS_OCUPADO } from '../fsseguro.mjs';
const comprimir = promisify(gzip);
const HORA = 3600;
export const HORAS_GUARDADAS = 168; // 7 días
const FOTOS_NORMAL = 72; // también las filas que se guardan por objeto
const FOTOS_RECIENTES = 24;
const MIN_FOTOS_NORMAL = 3;
const FRACCION_BARATA = 0.3; // el tramo barato: el 30 % de las unidades…
const MIN_UNIDADES_TRAMO = 3; // …y 3 como mínimo
const FACTOR_RARO = 2; // raro: menos de la mitad o más del doble del precio del medio del tramo
export const MIN_PARES = 24; // pares de fotos seguidas (un día) para dar lo que sale de la subasta
const DOS_HORAS = 2 * HORA;
// El margen de la regla «largo → medio → desaparece» (ver la cabecera), en segundos: cuenta como salida antes de tiempo
// si las tres fotos caben en menos de 2 h + este margen. Con 0 es exacto pero casi nunca se cumple (las fotos llegan
// cada hora y unos segundos); con 10 min entra lo normal y el riesgo es contar como salida algo que caducó en esos 10
// minutos. Si al comparar con TSM «Salen sin caducar» sale alto, este es el número que hay que bajar.
const MARGEN_SALIDA_S = 10 * 60;
// El tiempo que le quedaba a una subasta en la foto (columna `corta`).
const LARGO = 0;
const CORTO = 1;
const MEDIO_NUEVO = 2; // la foto anterior la vio en largo: le quedan al menos (2 h - el hueco entre las dos fotos)
const MEDIO_REPETIDO = 3; // ya estaba en medio en la foto anterior: le queda menos de (2 h - el hueco): de 50 min a 1 h 10
const MEDIO_DUDOSO = 4; // en medio y no se sabe desde cuándo
const HUECO_MIN = 50 * 60; // una hora menos 10 min
const HUECO_MAX = 70 * 60; // una hora más 10 min
const TROZO = 6 * HORA;
const TROZOS = HORAS_GUARDADAS / 6; // 28 trozos de 6 h = 7 días
const VERSION = 2;
const MAGIA = 'SNFH';
function vacio() {
    return {
        items: new Map(), // objeto -> {f: Float64Array(2*72) horas y valores, n, cantidad, subastas, minimo, mercancia, v: Uint32Array(3*28) | null}
        trozos: new Array(TROZOS).fill(-1), // qué trozo de 6 h hay en cada posición
        pares: new Array(TROZOS).fill(0), // pares de fotos seguidas en ese trozo
        ultima: null, // {ids, items, cant, corta, precio?} ordenado por id, o null si aún no hay foto (F5: precio, ver la cabecera)
        horaUltima: 0,
        hueco: 0, // segundos entre las dos últimas fotos, si eran seguidas (0 si no)
        // F9p, ronda 2 (solo en memoria, nunca se escribe): el archivo no traía la columna mercancia, así que hasta la foto
        // siguiente de esta casa no se sabe cuáles lo son. Mirar la columna después no sirve: al guardar se escribe 0 también en
        // lo que no se sabe.
        sinColumnaMercancia: false,
    };
}
const trozoDe = (hora) => Math.floor(hora / TROZO);
function nuevoObjeto() {
    return { f: new Float64Array(2 * FOTOS_NORMAL), n: 0, cantidad: 0, subastas: 0, minimo: 0, mercancia: false, v: null };
}
function objeto(est, item) {
    let it = est.items.get(item);
    if (!it)
        est.items.set(item, (it = nuevoObjeto()));
    return it;
}
function anadirFila(it, hora, precio) {
    const { f } = it;
    if (it.n === FOTOS_NORMAL) {
        f.copyWithin(0, 1, FOTOS_NORMAL);
        f.copyWithin(FOTOS_NORMAL, FOTOS_NORMAL + 1);
        it.n--;
    }
    f[it.n] = hora;
    f[FOTOS_NORMAL + it.n] = precio;
    it.n++;
}
// La posición del trozo `b` en las ventas. Si allí había otro trozo (más viejo), se vacía para todos los objetos.
function posTrozo(est, b) {
    const p = ((b % TROZOS) + TROZOS) % TROZOS;
    if (est.trozos[p] !== b) {
        est.trozos[p] = b;
        est.pares[p] = 0;
        for (const it of est.items.values())
            if (it.v)
                it.v.fill(0, p * 3, p * 3 + 3);
    }
    return p;
}
function sumarVenta(est, item, p, vendidas, caducadas, unidades) {
    const it = objeto(est, item);
    it.v ||= new Uint32Array(3 * TROZOS);
    it.v[p * 3] += vendidas;
    it.v[p * 3 + 1] += caducadas;
    it.v[p * 3 + 2] += unidades;
}
// Las posiciones de los trozos de los últimos 7 días (el actual y los 27 anteriores).
function posicionesValidas(est) {
    const minimo = trozoDe(est.horaUltima) - TROZOS;
    const pos = [];
    for (let p = 0; p < TROZOS; p++)
        if (est.trozos[p] > minimo)
            pos.push(p);
    return pos;
}
// El valor de la hora (ver la cabecera): la media del tramo barato (30 % de las unidades, 3 como mínimo) sin los raros
// (menos de la mitad o más del doble del precio del medio del tramo). `minimo` es la unidad más barata, tal cual.
function precioDeLaHora(lista) {
    const orden = lista.filter((s) => s.precio > 0 && s.cantidad > 0).sort((a, b) => a.precio - b.precio);
    const total = orden.reduce((n, s) => n + s.cantidad, 0);
    if (!total)
        return null;
    const tramo = Math.min(total, Math.max(MIN_UNIDADES_TRAMO, Math.ceil(total * FRACCION_BARATA)));
    // el precio del medio: el de la unidad central del tramo (con un número par, la de abajo)
    const central = Math.ceil(tramo / 2);
    let medio = orden[0].precio;
    let vistas = 0;
    for (const s of orden) {
        vistas += s.cantidad;
        if (vistas >= central) {
            medio = s.precio;
            break;
        }
    }
    let quedan = tramo;
    let suma = 0;
    let uds = 0;
    for (const s of orden) {
        if (quedan <= 0)
            break;
        const n = Math.min(s.cantidad, quedan);
        quedan -= n;
        if (s.precio * FACTOR_RARO < medio || s.precio > medio * FACTOR_RARO)
            continue; // un raro
        suma += n * s.precio;
        uds += n;
    }
    return { precio: Math.round(suma / uds), minimo: orden[0].precio, cantidad: total, subastas: orden.length };
}
function mediana(nums) {
    const o = Float64Array.from(nums).sort();
    const m = o.length >> 1;
    return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
}
function media(nums) {
    let s = 0;
    for (const x of nums)
        s += x;
    return s / nums.length;
}
function calcularResumen(est, it) {
    if (!it || !it.n)
        return null;
    const n = it.n;
    const precios = it.f.subarray(FOTOS_NORMAL, FOTOS_NORMAL + n); // ya son solo las últimas 72
    const ultimo = precios[n - 1];
    const poco = n < MIN_FOTOS_NORMAL;
    const normal = poco ? ultimo : mediana(precios);
    let tendencia = null;
    if (n > FOTOS_RECIENTES) {
        const base = media(precios.subarray(0, n - FOTOS_RECIENTES));
        if (base > 0)
            tendencia = ((media(precios.subarray(n - FOTOS_RECIENTES)) - base) / base) * 100;
    }
    // Lo que salió de la subasta en los últimos 7 días (en trozos de 6 h). `vendidas` son las que salieron antes de tiempo.
    let vendidas = 0;
    let caducadas = 0;
    let unidades = 0;
    let paresValidos = 0;
    for (const p of posicionesValidas(est)) {
        paresValidos += est.pares[p];
        if (!it.v)
            continue;
        vendidas += it.v[p * 3];
        caducadas += it.v[p * 3 + 1];
        unidades += it.v[p * 3 + 2];
    }
    // Con menos de un día de fotos seguidas no se dan: unas pocas horas engañan.
    const bastante = paresValidos >= MIN_PARES;
    const ritmo = bastante && vendidas + caducadas > 0 ? vendidas / (vendidas + caducadas) : null;
    const vendidosDia = bastante ? unidades / (paresValidos / 24) : null;
    // ¿Está en la última foto de la casa? Si no, ahora no hay ninguno a la venta.
    const enVenta = it.f[n - 1] === est.horaUltima;
    const salida = {
        // La compra mínima de la última foto en la que estuvo. Si enVenta es false ya no hay ninguno a ese precio: quien
        // enseñe o juzgue un precio de ahora tiene que mirar enVenta (o cantidad > 0) antes.
        precio: it.minimo > 0 ? it.minimo : ultimo,
        valor: ultimo, // el valor de la última hora en la que estuvo
        enVenta,
        cantidad: enVenta ? it.cantidad : 0,
        subastas: enVenta ? it.subastas : 0,
        normal,
        poco,
        tendencia,
        ritmo,
        vendidosDia,
        // F5: si es una mercancía (salió de la lista de mercancías la última vez que se vio). En las mercancías, lo que
        // desaparece por encima de lo más barato que sigue intacto no cuenta; en los objetos sueltos, sí (ver la cabecera).
        mercancia: it.mercancia === true,
        hora: it.f[n - 1],
    };
    if (est.sinColumnaMercancia)
        salida.mercanciaSinSaber = true; // F9p, ronda 2: el campo solo existe mientras dura
    return salida;
}
// El tiempo que le queda a una subasta, con lo que se vio de ella en la foto anterior (`previo`: su código, o -1 si no
// estaba o las dos fotos no son seguidas).
function codigoTiempo(tiempo, previo) {
    if (tiempo === 'SHORT')
        return CORTO;
    if (tiempo !== 'MEDIUM')
        return LARGO;
    if (previo === LARGO)
        return MEDIO_NUEVO;
    if (previo === MEDIO_NUEVO || previo === MEDIO_REPETIDO || previo === MEDIO_DUDOSO)
        return MEDIO_REPETIDO;
    return MEDIO_DUDOSO;
}
// La foto en columnas ordenadas por id (las subastas con un id que no es un número no se siguen). `antes` es la foto
// anterior si las dos son seguidas (para saber cuánto lleva cada subasta en «medio»), o null. `mercancias` (F5): el
// conjunto de las subastas de `todas` que son mercancías; solo de esas se guarda el precio por unidad (las demás llevan 0,
// «sin precio»), porque solo en ellas sirve (ver contarVentas).
function fotoEnColumnas(todas, antes = null, mercancias = null) {
    const lista = todas.filter((s) => Number.isFinite(Number(s.id)));
    const k = lista.length;
    const idsSueltos = new Float64Array(k);
    for (let i = 0; i < k; i++)
        idsSueltos[i] = Number(lista[i].id);
    const orden = new Uint32Array(k);
    for (let i = 0; i < k; i++)
        orden[i] = i;
    orden.sort((a, b) => idsSueltos[a] - idsSueltos[b]);
    const foto = {
        ids: new Float64Array(k), items: new Uint32Array(k), cant: new Uint32Array(k), corta: new Uint8Array(k),
        precio: new Float64Array(k),
    };
    let i = 0;
    for (let j = 0; j < k; j++) {
        const s = lista[orden[j]];
        const id = idsSueltos[orden[j]];
        let previo = -1;
        if (antes) {
            while (i < antes.ids.length && antes.ids[i] < id)
                i++;
            if (i < antes.ids.length && antes.ids[i] === id)
                previo = antes.corta[i];
        }
        foto.ids[j] = id;
        foto.items[j] = Number(s.item) || 0;
        foto.cant[j] = Math.max(0, Number(s.cantidad) || 0);
        foto.corta[j] = codigoTiempo(s.tiempo, previo);
        const precio = Number(s.precio);
        if (mercancias && mercancias.has(s) && Number.isFinite(precio) && precio > 0)
            foto.precio[j] = precio;
    }
    return foto;
}
// F5: el precio más barato de cada mercancía que ha seguido intacta entre las dos fotos (P*): el mismo id, el mismo objeto
// y la misma cantidad, y con precio (solo las mercancías lo llevan). objeto -> P*. Vacío si la foto anterior no trae
// precios (un historial de antes de F5).
export function intactasMasBaratas(antes, ahora) {
    const pMin = new Map();
    if (!antes.precio)
        return pMin;
    let j = 0;
    for (let i = 0; i < antes.ids.length; i++) {
        const precio = antes.precio[i];
        if (!(precio > 0))
            continue;
        const id = antes.ids[i];
        while (j < ahora.ids.length && ahora.ids[j] < id)
            j++;
        if (j < ahora.ids.length && ahora.ids[j] === id && ahora.items[j] === antes.items[i] && ahora.cant[j] === antes.cant[i]) {
            const item = antes.items[i];
            const ya = pMin.get(item);
            if (ya === undefined || precio < ya)
                pMin.set(item, precio);
        }
    }
    return pMin;
}
// Compara la foto anterior con la nueva (las dos ordenadas por id). Lo que ha desaparecido (ver la cabecera): caducada
// si le quedaba corto o llevaba dos fotos en medio; salió antes de tiempo (con todas sus unidades) si le quedaba largo o
// acababa de bajar a medio y entre las tres fotos han pasado menos de 2 h 10 min; si no, dudosa y no cuenta. Lo que sigue con
// menos cantidad (compra parcial de una mercancía): esas unidades salieron, pero la subasta no. F5: una mercancía que sale
// antes de tiempo a más de lo más barato que sigue intacto de su objeto (P*) no se pudo vender: es una cancelación y no
// cuenta en nada (ni en las unidades ni en la parte que sale).
// F9m: la cuenta de un par, sin tocar el estado. `ver` (opcional, solo para medir-salen.mjs) se entera de cada compra parcial
// (`parcial(objeto, unidades)`) y de cada subasta que sale antes de tiempo (`sale(posición en antes, si cuenta)`).
export function cuentasDelPar(huecoAntes, antes, ahora, hueco, ver = null) {
    const cuentas = new Map(); // objeto -> [antes de tiempo, caducadas, unidades]
    const cuenta = (item) => {
        let c = cuentas.get(item);
        if (!c)
            cuentas.set(item, (c = [0, 0, 0]));
        return c;
    };
    // un «medio nuevo» no ha podido caducar (o, dentro del margen, es muy raro que lo haya hecho)
    const medioSeguro = huecoAntes > 0 && huecoAntes + hueco < DOS_HORAS + MARGEN_SALIDA_S;
    const pIntacta = intactasMasBaratas(antes, ahora);
    let j = 0;
    for (let i = 0; i < antes.ids.length; i++) {
        const id = antes.ids[i];
        while (j < ahora.ids.length && ahora.ids[j] < id)
            j++;
        const item = antes.items[i];
        const tiempo = antes.corta[i];
        if (j < ahora.ids.length && ahora.ids[j] === id) {
            const baja = antes.cant[i] - ahora.cant[j];
            if (baja > 0 && ahora.items[j] === item) {
                cuenta(item)[2] += baja;
                ver?.parcial(item, baja);
            }
        }
        else if (tiempo === CORTO || tiempo === MEDIO_REPETIDO)
            cuenta(item)[1]++;
        else if (tiempo === LARGO || (tiempo === MEDIO_NUEVO && medioSeguro)) {
            const tope = pIntacta.get(item);
            const cancelada = tope !== undefined && antes.precio[i] > tope; // por encima de P*
            ver?.sale(i, !cancelada);
            if (cancelada)
                continue;
            const c = cuenta(item);
            c[0]++;
            c[2] += antes.cant[i];
        }
    }
    return cuentas;
}
function contarVentas(est, antes, ahora, p, hueco) {
    for (const [item, [v, c, u]] of cuentasDelPar(est.hueco, antes, ahora, hueco))
        sumarVenta(est, item, p, v, c, u);
}
// F9m: una copia de la foto en columnas, para que quien la mire no pueda cambiar la de verdad.
function copiaFoto(f) {
    return { ids: f.ids.slice(), items: f.items.slice(), cant: f.cant.slice(), corta: f.corta.slice(), precio: f.precio?.slice() };
}
// Quita las filas de más de 168 h; un objeto sin filas ni ventas de los últimos 7 días se olvida.
function podar(est, corte) {
    const validas = posicionesValidas(est);
    for (const [item, it] of est.items) {
        let k = 0;
        while (k < it.n && it.f[k] <= corte)
            k++;
        if (k) {
            it.f.copyWithin(0, k, FOTOS_NORMAL);
            it.f.copyWithin(FOTOS_NORMAL, FOTOS_NORMAL + k);
            it.n -= k;
        }
        if (it.n)
            continue;
        const conVentas = it.v && validas.some((p) => it.v[p * 3] || it.v[p * 3 + 1] || it.v[p * 3 + 2]);
        if (!conVentas)
            est.items.delete(item);
    }
}
// ---------- disco: columnas en binario ----------
//
// 'SNFH' | longitud de la cabecera (u32) | cabecera JSON | columnas, cada una alineada a 8 bytes. La cabecera dice el
// nombre, el tipo y la longitud de cada columna. Todo comprimido con gzip.
const TIPOS = { f64: Float64Array, u32: Uint32Array, u8: Uint8Array };
const tipoDe = (a) => (a instanceof Float64Array ? 'f64' : a instanceof Uint32Array ? 'u32' : 'u8');
const alinear = (n) => Math.ceil(n / 8) * 8;
function empaquetar(meta, columnas) {
    const cabecera = Buffer.from(JSON.stringify({ ...meta, columnas: columnas.map(([nombre, a]) => [nombre, tipoDe(a), a.length]) }));
    let total = alinear(8 + cabecera.length);
    for (const [, a] of columnas)
        total += alinear(a.byteLength);
    const buf = Buffer.alloc(total);
    buf.write(MAGIA, 0, 'latin1');
    buf.writeUInt32LE(cabecera.length, 4);
    cabecera.copy(buf, 8);
    let pos = alinear(8 + cabecera.length);
    for (const [, a] of columnas) {
        buf.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), pos);
        pos += alinear(a.byteLength);
    }
    return buf;
}
function desempaquetar(buf) {
    if (buf.length < 8 || buf.toString('latin1', 0, 4) !== MAGIA)
        throw new Error('no es un historial');
    const largo = buf.readUInt32LE(4);
    const meta = JSON.parse(buf.toString('utf8', 8, 8 + largo));
    const columnas = {};
    let pos = alinear(8 + largo);
    if (!Array.isArray(meta.columnas))
        throw new Error('sin columnas');
    for (const [nombre, tipo, n] of meta.columnas) {
        if (!TIPOS[tipo] || !Number.isInteger(n) || n < 0)
            throw new Error('columna rara');
        if (pos + n * TIPOS[tipo].BYTES_PER_ELEMENT > buf.length)
            throw new Error('historial cortado');
        const a = new TIPOS[tipo](n); // copia: así queda alineada
        new Uint8Array(a.buffer).set(buf.subarray(pos, pos + a.byteLength));
        columnas[nombre] = a;
        pos += alinear(a.byteLength);
    }
    return { meta, columnas };
}
function aBinario(est) {
    const lista = [...est.items];
    const n = lista.length;
    const items = new Uint32Array(n);
    const filas = new Uint8Array(n);
    const cantidad = new Uint32Array(n);
    const subastas = new Uint32Array(n);
    const minimo = new Float64Array(n);
    const mercancia = new Uint8Array(n);
    let total = 0;
    let conV = 0;
    for (const [, it] of lista) {
        total += it.n;
        if (it.v)
            conV++;
    }
    const horas = new Float64Array(total);
    const precios = new Float64Array(total);
    const conVentas = new Uint32Array(conV);
    const ventas = new Uint32Array(conV * 3 * TROZOS);
    let pos = 0;
    let pv = 0;
    lista.forEach(([item, it], i) => {
        items[i] = item;
        filas[i] = it.n;
        cantidad[i] = it.cantidad;
        subastas[i] = it.subastas;
        minimo[i] = it.minimo;
        mercancia[i] = it.mercancia ? 1 : 0;
        horas.set(it.f.subarray(0, it.n), pos);
        precios.set(it.f.subarray(FOTOS_NORMAL, FOTOS_NORMAL + it.n), pos);
        pos += it.n;
        if (it.v) {
            conVentas[pv] = i;
            ventas.set(it.v, pv * 3 * TROZOS);
            pv++;
        }
    });
    const u = est.ultima;
    const vacia = { ids: new Float64Array(0), items: new Uint32Array(0), cant: new Uint32Array(0), corta: new Uint8Array(0) };
    const f = u || vacia;
    const precioUltima = f.precio || new Float64Array(f.ids.length); // leída de un historial de antes de F5: todo 0, sin precio
    return empaquetar({ version: VERSION, horaUltima: est.horaUltima, trozos: est.trozos, pares: est.pares, hayUltima: !!u, tiempos: 1, hueco: est.hueco }, [
        ['items', items], ['filas', filas], ['cantidad', cantidad], ['subastas', subastas], ['horas', horas],
        ['precios', precios], ['conVentas', conVentas], ['ventas', ventas],
        ['ultimaIds', f.ids], ['ultimaItems', f.items], ['ultimaCant', f.cant], ['ultimaCorta', f.corta],
        ['minimo', minimo], // T1b: opcional al leer (un historial de antes no la trae)
        ['ultimaPrecio', precioUltima], ['mercancia', mercancia], // F5: opcionales al leer, igual
    ]);
}
// Un historial de antes de T1b no sirve para los números de ahora y se empieza de nuevo (el archivo se lee, no se da por
// roto):
//   · sus valores por hora son de la fórmula vieja (casi siempre la subasta más barata). Mezclados con los nuevos, el
//     valor de mercado seguiría siendo la compra mínima unos días y la tendencia saldría falsa (el mercado quieto daba
//     +43 %). Se olvidan: el valor de mercado y la tendencia salen solo de fotos nuevas;
//   · contó como vendidas muchas subastas caducadas y no sabe cuánto llevaba cada subasta en «medio»: lo que contó se
//     pone a cero y la última foto no se compara con la siguiente.
// Hasta la foto siguiente (una hora como mucho) la casa no tiene datos.
function empezarDeNuevo(est) {
    est.items.clear();
    est.trozos.fill(-1);
    est.pares.fill(0);
    est.ultima = null;
    est.hueco = 0;
}
// Un historial escrito por una app más nueva: no es un archivo roto, se deja en su sitio y no se pisa.
class VersionFutura extends Error {
    constructor(version) {
        super(`historial de la versión ${version}`);
        this.version = version;
    }
}
// ¿Cuadran las columnas entre sí? Si no, el archivo está roto.
function comprobarColumnas(meta, c) {
    const nombres = ['items', 'filas', 'cantidad', 'subastas', 'horas', 'precios', 'conVentas', 'ventas', 'ultimaIds',
        'ultimaItems', 'ultimaCant', 'ultimaCorta'];
    for (const n of nombres)
        if (!c[n])
            throw new Error(`falta la columna ${n}`);
    const n = c.items.length;
    if (c.filas.length !== n || c.cantidad.length !== n || c.subastas.length !== n)
        throw new Error('objetos descuadrados');
    if (c.minimo && c.minimo.length !== n)
        throw new Error('mínimos descuadrados');
    if (c.mercancia && c.mercancia.length !== n)
        throw new Error('mercancías descuadradas');
    let filas = 0;
    for (const f of c.filas) {
        if (f > FOTOS_NORMAL)
            throw new Error('demasiadas filas');
        filas += f;
    }
    if (c.horas.length !== filas || c.precios.length !== filas)
        throw new Error('filas descuadradas');
    if (c.ventas.length !== c.conVentas.length * 3 * TROZOS)
        throw new Error('ventas descuadradas');
    for (const i of c.conVentas)
        if (i >= n)
            throw new Error('ventas de un objeto que no está');
    const k = c.ultimaIds.length;
    if (c.ultimaItems.length !== k || c.ultimaCant.length !== k || c.ultimaCorta.length !== k)
        throw new Error('última foto descuadrada');
    if (c.ultimaPrecio && c.ultimaPrecio.length !== k)
        throw new Error('precios de la última foto descuadrados');
    if (!Number.isFinite(meta.horaUltima) || meta.trozos?.length !== TROZOS || meta.pares?.length !== TROZOS)
        throw new Error('cabecera rara');
}
function deBinario(buf) {
    const { meta, columnas: c } = desempaquetar(buf);
    if (Number.isInteger(meta.version) && meta.version > VERSION)
        throw new VersionFutura(meta.version);
    if (meta.version !== VERSION)
        throw new Error('versión rara');
    comprobarColumnas(meta, c);
    const est = vacio();
    est.sinColumnaMercancia = !c.mercancia;
    est.horaUltima = meta.horaUltima;
    est.trozos = meta.trozos;
    est.pares = meta.pares;
    const lista = [];
    let pos = 0;
    for (let i = 0; i < c.items.length; i++) {
        const it = nuevoObjeto();
        it.n = Math.min(c.filas[i], FOTOS_NORMAL);
        it.cantidad = c.cantidad[i];
        it.subastas = c.subastas[i];
        if (c.minimo)
            it.minimo = c.minimo[i];
        if (c.mercancia)
            it.mercancia = c.mercancia[i] === 1;
        it.f.set(c.horas.subarray(pos, pos + it.n), 0);
        it.f.set(c.precios.subarray(pos, pos + it.n), FOTOS_NORMAL);
        pos += c.filas[i];
        est.items.set(c.items[i], it);
        lista.push(it);
    }
    for (let k = 0; k < c.conVentas.length; k++) {
        lista[c.conVentas[k]].v = c.ventas.slice(k * 3 * TROZOS, (k + 1) * 3 * TROZOS);
    }
    if (meta.hayUltima) {
        est.ultima = { ids: c.ultimaIds, items: c.ultimaItems, cant: c.ultimaCant, corta: c.ultimaCorta };
        if (c.ultimaPrecio)
            est.ultima.precio = c.ultimaPrecio; // sin ella (antes de F5) el primer par se cuenta como antes
    }
    if (meta.tiempos === 1)
        est.hueco = Number(meta.hueco) > 0 ? Number(meta.hueco) : 0;
    else
        empezarDeNuevo(est);
    return est;
}
// El formato de la versión 1 (JSON): {horas: {item: [[hora, precio, cantidad, subastas]]}, ventas: {item: [[hora,
// vendidas, caducadas, unidades]]}, pares: [hora], ultima: {id: [item, tiempo, cantidad]}, horaUltima}.
function deV1(j) {
    if (!j || j.version !== 1 || !j.horas || !j.ventas || !Array.isArray(j.pares))
        return null;
    const est = vacio();
    est.sinColumnaMercancia = true; // el formato de la versión 1 no la tiene
    est.horaUltima = Number(j.horaUltima) || 0;
    const corte = est.horaUltima - HORAS_GUARDADAS * HORA;
    const minimo = trozoDe(est.horaUltima) - TROZOS;
    for (const [item, filas] of Object.entries(j.horas)) {
        const validas = (Array.isArray(filas) ? filas : []).filter((f) => f[0] > corte).slice(-FOTOS_NORMAL);
        if (!validas.length)
            continue;
        const it = objeto(est, Number(item));
        for (const f of validas)
            anadirFila(it, f[0], f[1]);
        const ultima = validas[validas.length - 1];
        it.cantidad = ultima[2];
        it.subastas = ultima[3];
    }
    for (const h of j.pares)
        if (trozoDe(h) > minimo)
            est.pares[posTrozo(est, trozoDe(h))]++;
    for (const [item, filas] of Object.entries(j.ventas)) {
        for (const [h, v, c, u] of Array.isArray(filas) ? filas : []) {
            if (trozoDe(h) > minimo)
                sumarVenta(est, Number(item), posTrozo(est, trozoDe(h)), v, c, u);
        }
    }
    if (j.ultima && typeof j.ultima === 'object') {
        est.ultima = fotoEnColumnas(Object.entries(j.ultima).map(([id, [item, tiempo, cantidad]]) => ({ id, item, tiempo, cantidad })));
    }
    empezarDeNuevo(est);
    return est;
}
/**
 * Historial de subastas. `fs` y `carpeta` (la carpeta `comercio` de los datos) se inyectan.
 * `opciones` (reintentador, mover, dormir) se pasan tal cual a la escritura atómica.
 * `cuarentena`: () => carpeta donde dejar el historial viejo ya convertido (la de los datos); sin ella, se renombra al
 * lado (`.viejo-<ms>`). Nunca se borra.
 * `registrar(nivel, texto)`: avisos para el registro de la app (archivo ocupado, de otra versión).
 * `alPar({casa, hora, hueco, huecoAntes, par})` (F9m, temporal): se llama con cada par de fotos seguidas; `par()` da una
 * copia de las dos fotos ({antes, ahora}). Lo que haga o lance no afecta al historial.
 *
 * Al leer: un archivo que no se puede abrir (EBUSY/EPERM, p. ej. el antivirus) no se toca: la casa queda «ocupada», se
 * vuelve a leer en cada uso, `anadirFoto` y `guardar` lanzan el error (el programador reintenta) y nada se sobrescribe.
 * Uno que no se descomprime o no cuadra está roto: se aparta al lado (`.roto-<ms>`). Uno de una versión futura se deja
 * en su sitio y nunca se pisa: la casa funciona solo en memoria.
 */
export function crearHistorial({ fs, carpeta, opciones = {}, cuarentena = null, registrar = (() => { }), alPar = null }) {
    const casas = new Map();
    const colas = new Map(); // casa -> el último guardado en marcha
    const avisadas = new Set(); // casas ocupadas ya avisadas (un aviso por racha)
    const rutaBin = (casa) => join(carpeta, `historial-${casa}.bin`);
    const rutaVieja = (casa) => join(carpeta, `historial-${casa}.json`);
    // Un archivo roto se aparta al lado (nunca se borra).
    function apartar(ruta) {
        try {
            fs.renameSync(ruta, `${ruta}.roto-${Date.now()}`);
        }
        catch {
            // si ni así se puede, se sobrescribirá al guardar
        }
    }
    // → {est} | {ocupado: código} | {ilegible: código} | {futura: versión} | null (no está, o estaba roto y se ha apartado)
    function leer(ruta, convertir) {
        let buf;
        try {
            buf = fs.readFileSync(ruta);
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            if (CODIGOS_OCUPADO.includes(e.code))
                return { ocupado: e.code };
            return { ilegible: e.code || 'ERROR' };
        }
        try {
            const est = convertir(buf);
            return est ? { est } : null;
        }
        catch (e) {
            if (e instanceof VersionFutura)
                return { futura: e.version };
            apartar(ruta);
            return null;
        }
    }
    function cargar(casa) {
        // el JSON viejo solo si no hay .bin (o estaba roto): uno ocupado o de otra versión manda
        const r = leer(rutaBin(casa), (buf) => deBinario(gunzipSync(buf))) ||
            leer(rutaVieja(casa), (buf) => deV1(JSON.parse(buf.toString('utf8'))));
        let est = r?.est || vacio();
        if (r?.ocupado) {
            est.ocupado = r.ocupado;
            if (!avisadas.has(casa)) {
                avisadas.add(casa);
                registrar('aviso', `comercio: el historial de la casa ${casa} está ocupado (${r.ocupado}); se vuelve a probar más tarde sin tocarlo`);
            }
        }
        else {
            avisadas.delete(casa);
            if (r?.futura) {
                est.noGuardar = true;
                registrar('aviso', `comercio: el historial de la casa ${casa} es de una versión más nueva de la app (${r.futura}); se deja como está y esta casa va solo en memoria`);
            }
            else if (r?.ilegible) {
                // ni ocupado ni roto (EISDIR, EIO…): no se sabe qué es, así que no se toca; la casa va solo en memoria
                est.noGuardar = true;
                registrar('aviso', `comercio: el historial de la casa ${casa} no se puede leer (${r.ilegible}); se deja como está y esta casa va solo en memoria`);
            }
        }
        casas.set(casa, est);
        return est;
    }
    // Una casa ocupada se vuelve a leer en cada uso, hasta que se pueda.
    function estado(casa) {
        const est = casas.get(casa);
        return est && !est.ocupado ? est : cargar(casa);
    }
    const errorOcupado = (casa, codigo) => Object.assign(new Error(`el historial de la casa ${casa} está ocupado (${codigo})`), { code: codigo });
    /**
     * Añade la foto de una hora. `hora` en segundos. `subastas` y `mercancias`: [{id, item, cantidad, precio, tiempo}]
     * (precio por unidad, en cobre). Una foto igual o anterior a la última, o a menos de 50 min de ella, se ignora.
     */
    function anadirFoto(casa, hora, subastas, mercancias) {
        const est = estado(casa);
        if (est.ocupado)
            throw errorOcupado(casa, est.ocupado);
        if (hora < est.horaUltima + HUECO_MIN)
            return false;
        const todas = [...(subastas || []), ...(mercancias || [])];
        const sonMercancias = new Set(mercancias || []);
        const hueco = hora - est.horaUltima;
        const seguidas = !!est.ultima && hueco <= HUECO_MAX;
        const foto = fotoEnColumnas(todas, seguidas ? est.ultima : null, sonMercancias);
        // Qué ha desaparecido (o bajado) desde la foto anterior.
        if (seguidas) {
            const p = posTrozo(est, trozoDe(hora));
            est.pares[p]++;
            contarVentas(est, est.ultima, foto, p, hueco);
            if (alPar) {
                const antes = est.ultima;
                try {
                    alPar({ casa, hora, hueco, huecoAntes: est.hueco, par: () => ({ antes: copiaFoto(antes), ahora: copiaFoto(foto) }) });
                }
                catch {
                    // el contador nunca para ni cambia el historial
                }
            }
        }
        est.hueco = seguidas ? hueco : 0;
        // Precio de la hora por objeto (y si es una mercancía: alguna de sus subastas viene de esa lista).
        const porItem = new Map();
        const esMercancia = new Set();
        for (const s of todas) {
            const item = Number(s.item);
            if (!porItem.has(item))
                porItem.set(item, []);
            porItem.get(item).push(s);
            if (sonMercancias.has(s))
                esMercancia.add(item);
        }
        for (const [item, lista] of porItem) {
            const p = precioDeLaHora(lista);
            if (!p)
                continue;
            const it = objeto(est, item);
            anadirFila(it, hora, p.precio);
            it.cantidad = p.cantidad;
            it.subastas = p.subastas;
            it.minimo = p.minimo;
            it.mercancia = esMercancia.has(item);
        }
        est.ultima = foto;
        est.horaUltima = hora;
        est.sinColumnaMercancia = false; // F9p, ronda 2: esta foto ya dice cuáles son mercancías
        podar(est, hora - HORAS_GUARDADAS * HORA);
        return true;
    }
    // El historial viejo (JSON), ya convertido y guardado en el formato nuevo, va a la cuarentena. Primero se renombra al
    // lado (`.viejo-<ms>`): si está ocupado falla ahí, sin haber hecho ninguna carpeta. Solo después se pide la carpeta de
    // cuarentena; si ese último paso fallara, la carpeta se guarda y se usa en el intento siguiente (no se hace otra).
    let carpetaPendiente = null;
    function apartarViejo(casa) {
        const vieja = rutaVieja(casa);
        // [ruta al lado, nombre en la cuarentena, nombre al que vuelve si falla]
        const mover = [];
        if (fs.existsSync(vieja)) {
            const alLado = `${vieja}.viejo-${Date.now()}`;
            try {
                fs.renameSync(vieja, alLado);
                mover.push([alLado, basename(vieja), vieja]);
            }
            catch {
                // ocupado: se intentará con el siguiente guardado
            }
        }
        if (!cuarentena)
            return; // sin cuarentena, `.viejo-<ms>` al lado es su sitio
        // Los `.viejo-<ms>` de esta casa que quedaron de antes (cierre a mitad, o un nombre que no se pudo devolver).
        const prefijo = `${basename(vieja)}.viejo-`;
        let nombres = [];
        try {
            nombres = fs.readdirSync(carpeta);
        }
        catch {
            // sin lista: solo el de ahora
        }
        for (const n of nombres) {
            const ruta = join(carpeta, n);
            if (n.startsWith(prefijo) && !mover.some(([r]) => r === ruta))
                mover.push([ruta, n, null]);
        }
        for (const [ruta, nombre, devolver] of mover) {
            try {
                const dir = carpetaPendiente && fs.existsSync(carpetaPendiente) ? carpetaPendiente : cuarentena();
                carpetaPendiente = dir;
                fs.renameSync(ruta, join(dir, nombre));
            }
            catch {
                if (!devolver)
                    continue; // se queda donde estaba: el próximo guardado lo vuelve a intentar
                try {
                    fs.renameSync(ruta, devolver); // vuelve a su nombre para el intento siguiente
                }
                catch {
                    // se queda al lado con `.viejo-<ms>` y el próximo guardado lo recoge
                }
            }
        }
        // Una carpeta que ya tiene algo no se reutiliza (cada guardado con algo que mover, la suya).
        if (carpetaPendiente && mover.length && fs.existsSync(carpetaPendiente) && fs.readdirSync(carpetaPendiente).length)
            carpetaPendiente = null;
    }
    // Lo que para la app es solo copiar las columnas; la compresión va en segundo plano.
    async function guardarYa(casa) {
        const est = estado(casa);
        if (est.ocupado)
            throw errorOcupado(casa, est.ocupado);
        if (est.noGuardar)
            return; // archivo de una versión más nueva: no se pisa
        fs.mkdirSync(carpeta, { recursive: true });
        const datos = await comprimir(aBinario(est), { level: 6 });
        await escribirAtomico(fs, rutaBin(casa), datos, opciones);
        apartarViejo(casa);
    }
    // Los guardados de una casa van en cola, uno detrás de otro: cada uno escribe lo que hay al empezar su turno, así que
    // el último en pedirse es el último en escribirse.
    function guardar(casa) {
        const antes = colas.get(casa) || Promise.resolve();
        const turno = antes.catch(() => { }).then(() => guardarYa(casa));
        colas.set(casa, turno);
        return turno;
    }
    const resumen = (casa, item) => calcularResumen(estado(casa), estado(casa).items.get(Number(item)));
    function resumenCasa(casa) {
        const est = estado(casa);
        if (est.horaUltima <= 0)
            return undefined;
        let desde = Infinity;
        let pares = 0;
        for (const position of posicionesValidas(est)) {
            desde = Math.min(desde, est.trozos[position] * TROZO);
            pares += est.pares[position];
        }
        return { hora: est.horaUltima, desde: Number.isFinite(desde) ? desde : 0, pares };
    }
    function todos(casa) {
        const est = estado(casa);
        const m = new Map();
        const ids = [...est.items.keys()].sort((a, b) => a - b);
        for (const item of ids) {
            const r = calcularResumen(est, est.items.get(item));
            if (r)
                m.set(item, r);
        }
        return m;
    }
    // Task 17a: si la casa tiene algún precio (lo que hay en memoria, o el disco la primera vez). Barato: no calcula nada.
    function tieneDatos(casa) {
        for (const it of estado(casa).items.values())
            if (it.n)
                return true;
        return false;
    }
    // El código (EBUSY, EPERM, EACCES) si el archivo de la casa está ocupado ahora (lo vuelve a probar), o null. Para que el
    // programador no baje una foto que no podría añadir.
    const ocupada = (casa) => estado(casa).ocupado || null;
    return { cargar, anadirFoto, guardar, resumen, resumenCasa, todos, tieneDatos, ocupada };
}
