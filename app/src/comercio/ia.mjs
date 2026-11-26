// Comercio para la IA (tarea 15): lo que la IA ve del comercio (`datos.comercio`) y la validación de lo que propone (el
// campo `comercio` del bloque ```snet```). Lógica pura: el historial y el catálogo llegan inyectados.
//
// datos.comercio = {casa, bando?, bandos?, generado, objetos: [{id, nombre, precio, normal, tendencia, ritmo, vendidosDia,
//                  otrasCasas, poco?, aLaVenta?, mercancia?} | {id, nombre, sinDatos: true}], enVivo?}
//   F7: casa es la de la subasta abierta (la neutral, en la neutral) o, cerrada, la de su facción; bando, de qué subasta
//   es («Horde», «Alliance» o «Neutral»); bandos, el de cada casa de otrasCasas. Nunca los precios de otra casa en su lugar.
//   precio: la unidad más barata a la venta ahora; null y aLaVenta: false si en la última foto no hay ninguno.
//   normal: el valor de mercado. ritmo: de las subastas que salen, la parte que sale sin caducar (vendida o retirada).
//   vendidosDia: unidades que salen sin caducar al día, un máximo aproximado (vendidas o retiradas). mercancia: true en
//   una mercancía (F5): ahí ya no cuentan, ni en ritmo ni en vendidosDia, las cancelaciones de encima de lo más barato que
//   sigue intacto; en un objeto suelto no va y cuenta todo lo que sale antes de tiempo. Las fórmulas: la cabecera de
//   historial.mjs. Los dos números son los mismos que enseña el tooltip y que miran las reglas de compra.
//   objetos: como mucho 60, en este orden y sin repetir: los del inventario, los mencionados (enlazados o con su nombre
//   en el mensaje), los de las oportunidades de la subasta abierta y los 20 más baratos respecto a lo normal (por debajo
//   de lo normal), a la venta ahora y con ritmo >= 0,25 (RITMO_BARATOS). Precios en cobre; tendencia en % (un decimal); ritmo de 0 a 1 (dos decimales; null si no se sabe);
//   vendidosDia con un decimal; otrasCasas = {casa: precio} de las otras casas del reino que tienen ese objeto.
//   Solo un mencionado sin datos entra con `sinDatos: true` (para que la IA diga que no tiene datos de él).
//   enVivo: lo que manda el addon con la subasta abierta (ctx.comercio, saneado): {casa, edadPrecios, grupo: {clave,
//   nombre}, oportunidades: [{id, precio, pct, ritmo?, fuente?, edad?, mercancia?, mercanciaSinSaber?}] (como mucho 20; fuente «lista» | «app» | «escaneo» y
//   edad en segundos, F1 ronda 1)}.
import { cortar } from '../texto.mjs';
import { bandoDe, casaDe, casasDelReino } from './casas.mjs';
export const MAX_OBJETOS_COMERCIO = 60;
export const MAX_OPORTUNIDADES = 20;
const MAX_BARATOS = 20;
// «Baratos que suelen salir»: la parte de las subastas que sale sin caducar (ritmo) tiene que llegar a esto. Hasta T1b
// era 0,40, pensado para la tasa vieja, que contaba como vendidas la mitad de las caducadas y salía inflada. Con la
// cuenta de ahora un objeto que se mueve bien anda por 0,25 (la tasa de venta de TSM para el hacha de la captura: 0,244).
// F5: en las mercancías el ritmo ya no lo suben las cancelaciones de encima del más barato intacto, pero las de lo más
// barato se cuelan y no se sabe cuánto lo inflan (F9). F9p: un ritmo alto no prueba que se venda; uno bajo sí es fiable. Por
// eso los baratos se eligen y ordenan solo por precio frente a lo normal, y este umbral solo descarta lo claramente lento.
export const RITMO_BARATOS = 0.25;
const MAX_NOMBRE_OBJETO = 80;
const MAX_MENCIONADOS = 20;
const MIN_NOMBRE_MENCION = 4; // letras: un nombre más corto se encuentra en cualquier frase
const MAX_CLAVE_GRUPO = 100;
const MAX_NOMBRE_GRUPO_VIVO = 60;
// Lo que la IA puede proponer.
export const MAX_NOMBRE_GRUPO = 40;
// Bytes UTF-8 del nombre: el addon (Grupos) corta en 60 bytes; aquí se corta antes entre caracteres para que nunca parta uno.
export const MAX_BYTES_NOMBRE_GRUPO = 60;
export const MAX_IDS_GRUPO = 200;
// Rangos de las reglas (los mismos que Reglas.poner del addon, tarea 11): {mínimo, máximo, entero?}; máximo null = sin tope.
export const RANGOS_REGLA = {
    compraPct: [1, 100],
    sniperPct: [1, 100],
    ritmoMin: [0, 1],
    valorMin: [0, null],
    maxUnidades: [1, 10000, true],
    maxOro: [0, null],
};
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
// F1 (ronda 1): de dónde puede salir el precio de una oportunidad de la subasta abierta.
const FUENTES_VIVO = new Set(['lista', 'app', 'escaneo']);
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Un id de objeto: entero de 1 a 2^31 - 1 (lo que cabe en el addon).
const esId = (v) => Number.isInteger(v) && v >= 1 && v < 2 ** 31;
const redondear = (v, decimales) => {
    const f = 10 ** decimales;
    return Math.round(v * f) / f;
};
const limpio = (t) => String(t).replace(/[\x00-\x1f\x7f]/g, '').trim();
// ctx.comercio del addon, saneado (solo los campos conocidos y con topes). null si no es una tabla.
export function enVivoDe(v) {
    if (!esObjeto(v))
        return null;
    const salida = {};
    if (esNumero(v.casa))
        salida.casa = Math.floor(v.casa);
    if (BANDOS.includes(v.faccion))
        salida.faccion = v.faccion; // F7: la facción del subastador de la subasta abierta
    if (esNumero(v.edadPrecios) && v.edadPrecios >= 0)
        salida.edadPrecios = Math.floor(v.edadPrecios);
    if (esObjeto(v.grupo) && typeof v.grupo.clave === 'string' && limpio(v.grupo.clave) !== '') {
        const clave = limpio(v.grupo.clave);
        if (clave.length <= MAX_CLAVE_GRUPO) {
            salida.grupo = { clave };
            if (typeof v.grupo.nombre === 'string' && limpio(v.grupo.nombre) !== '')
                salida.grupo.nombre = cortar(limpio(v.grupo.nombre), MAX_NOMBRE_GRUPO_VIVO);
        }
    }
    const lista = Array.isArray(v.oportunidades) ? v.oportunidades : [];
    salida.oportunidades = lista.filter((o) => esObjeto(o) && esId(o.id) && esNumero(o.precio) && esNumero(o.pct))
        .slice(0, MAX_OPORTUNIDADES)
        .map((o) => {
        const s = { id: o.id, precio: Math.floor(o.precio), pct: Math.round(o.pct) };
        if (esNumero(o.ritmo))
            s.ritmo = redondear(o.ritmo, 2);
        // F1 (ronda 1): de qué foto sale el precio («lista», «app» o «escaneo») y su edad en segundos.
        if (FUENTES_VIVO.has(o.fuente))
            s.fuente = o.fuente;
        if (esNumero(o.edad) && o.edad >= 0)
            s.edad = Math.floor(o.edad);
        if (o.mercancia === true)
            s.mercancia = true; // F9p, ronda 1: puede quedarse fuera de los 60 objetos
        return s;
    });
    return salida;
}
// El nombre del objeto en el catálogo (cortado), o null.
function nombreDe(catalogo, id) {
    let f = null;
    try {
        f = typeof catalogo?.ficha === 'function' ? catalogo.ficha(id) : null;
    }
    catch {
        f = null;
    }
    return f && typeof f.nombre === 'string' && f.nombre.trim() !== '' ? cortar(limpio(f.nombre), MAX_NOMBRE_OBJETO) : null;
}
// Los resúmenes de una casa (Map id -> resumen), o un Map vacío si no se pueden leer.
function resumenesDe(historial, casa) {
    if (!historial || typeof historial.todos !== 'function' || casa == null)
        return new Map();
    const m = historial.todos(casa);
    return m instanceof Map ? m : new Map();
}
const conPrecio = (r) => r && esNumero(r.precio) && r.precio > 0;
// Con precio y en la última foto: hay alguno a la venta ahora. (enVenta lo pone historial.mjs; sin él se da por bueno.)
const aLaVenta = (r) => conPrecio(r) && r.enVenta !== false;
// F9p, ronda 1: qué se sabe de una oportunidad. Sin el 1 de las mercancías, la fila del addon puede ser de un objeto suelto o
// de una app de antes de F5, y un addon de antes no manda el campo. El historial de la app lo aclara: si dice que es una
// mercancía, lo es; si estaba en la última foto sin serlo, es un objeto suelto y queda como hoy. Si no, no se sabe. Ronda 2:
// tampoco se sabe con un historial sin la columna mercancia, hasta la foto siguiente de esa casa (r.mercanciaSinSaber).
function conMercancia(o, r) {
    if (o.mercancia === true)
        return o;
    if (r?.mercancia === true)
        return { ...o, mercancia: true };
    return aLaVenta(r) && r.mercanciaSinSaber !== true ? o : { ...o, mercanciaSinSaber: true };
}
// Los objetos con precio cuyo nombre (del catálogo, sin distinguir mayúsculas) sale en el texto del jugador.
function mencionadosEnTexto(texto, resumenes, catalogo) {
    const bajo = typeof texto === 'string' ? texto.toLowerCase() : '';
    if (bajo.trim() === '')
        return [];
    const salida = [];
    for (const [id, r] of resumenes) {
        if (salida.length >= MAX_MENCIONADOS)
            break;
        if (!conPrecio(r))
            continue;
        const nombre = nombreDe(catalogo, id);
        if (nombre && Array.from(nombre).length >= MIN_NOMBRE_MENCION && bajo.includes(nombre.toLowerCase()))
            salida.push(id);
    }
    return salida;
}
const BANDOS = ['Horde', 'Alliance', 'Neutral'];
/**
 * Task 17a: la fuente de los datos de comercio de la app para un turno de la IA ({historial, catalogo, casa, otrasCasas},
 * lo que espera nucleo.mjs en `comercioDatos`), o null si aún no se sabe quién juega o su casa no tiene precios.
 * estado: el estado del comercio (comercio/estado.mjs: identidad() y conocidas()); historial y catalogo: los mismos que
 * usa el programador. Solo mira lo que ya hay (memoria, o el disco la primera vez): nada de red.
 * El bando del mensaje (ctx.pj.faccion) manda sobre el de la identidad: la identidad solo se lee con el juego cerrado y
 * el jugador puede estar con un personaje de otro bando del mismo reino.
 */
export function fuenteDeComercio({ estado, historial, catalogo, mensaje } = {}) {
    const yo = estado?.identidad?.();
    if (!yo)
        return null;
    const faccion = mensaje?.ctx?.pj?.faccion;
    const quien = BANDOS.includes(faccion) ? { ...yo, faccion } : yo;
    const conocidas = estado.conocidas?.() ?? {};
    // F7: con la subasta abierta manda la suya (ctx.comercio: su casa y la facción de su subastador; en la neutral, la
    // neutral). Si el addon dice la facción pero no la casa (no la conoce), se busca entre las descubiertas; si tampoco, nada:
    // nunca los precios de otra casa.
    const vivo = mensaje?.ctx?.comercio;
    const vivoCasa = esObjeto(vivo) && esNumero(vivo.casa) ? Math.floor(vivo.casa) : null;
    const vivoBando = esObjeto(vivo) && BANDOS.includes(vivo.faccion) ? vivo.faccion : null;
    let casa;
    if (vivoCasa != null)
        casa = vivoCasa;
    else if (vivoBando)
        casa = casaDe({ ...quien, faccion: vivoBando }, conocidas);
    else
        casa = casaDe(quien, conocidas);
    if (casa == null || typeof historial?.tieneDatos !== 'function' || !historial.tieneDatos(casa))
        return null;
    const bando = bandoDe(quien.reino, casa, conocidas) ?? vivoBando;
    const otrasCasas = casasDelReino(quien, conocidas).filter((c) => c !== casa);
    const bandos = {};
    for (const c of otrasCasas) {
        const b = bandoDe(quien.reino, c, conocidas);
        if (b)
            bandos[c] = b;
    }
    return { historial, catalogo, casa, bando, otrasCasas, bandos };
}
/**
 * datos.comercio (ver la cabecera) o null si no hay ni historial con datos de la casa ni subasta abierta.
 * historial: {todos(casa) -> Map(id -> resumen)}; catalogo: {ficha(id) -> {nombre} | null}; casa: la del personaje;
 * otrasCasas: las otras casas del reino; inventarioIds y mencionadas: ids; enVivo: ctx.comercio ya saneado (enVivoDe) o
 * null; texto: el mensaje del jugador (para encontrar los nombres de objetos que escribe).
 */
export function construirComercio({ historial, catalogo, casa, bando = null, otrasCasas = [], bandos = {}, inventarioIds = [], mencionadas = [], enVivo = null, texto = '', } = {}) {
    const resumenes = resumenesDe(historial, casa);
    if (resumenes.size === 0 && !enVivo)
        return null;
    const otras = [];
    for (const c of Array.isArray(otrasCasas) ? otrasCasas : []) {
        if (c == null || c === casa)
            continue;
        try {
            const m = resumenesDe(historial, c);
            if (m.size > 0)
                otras.push([c, m]);
        }
        catch {
            // una casa que no se puede leer no impide las demás
        }
    }
    const baratos = [...resumenes]
        .filter(([, r]) => aLaVenta(r) && esNumero(r.normal) && r.precio < r.normal && esNumero(r.ritmo) && r.ritmo >= RITMO_BARATOS)
        .sort((a, b) => a[1].precio / a[1].normal - b[1].precio / b[1].normal || a[0] - b[0])
        .slice(0, MAX_BARATOS)
        .map(([id]) => id);
    const deTexto = mencionadosEnTexto(texto, resumenes, catalogo);
    const mencionadosTodos = new Set([...mencionadas, ...deTexto].filter(esId));
    const candidatos = [
        ...inventarioIds,
        ...mencionadosTodos,
        ...(enVivo?.oportunidades ?? []).map((o) => o.id),
        ...baratos,
    ].filter(esId);
    const objetos = [];
    const vistos = new Set();
    for (const id of candidatos) {
        if (objetos.length >= MAX_OBJETOS_COMERCIO)
            break;
        if (vistos.has(id))
            continue;
        const r = resumenes.get(id);
        if (!conPrecio(r)) {
            // Sin datos solo va lo que el jugador menciona: así la IA puede decir que no tiene datos de ese objeto.
            if (mencionadosTodos.has(id)) {
                vistos.add(id);
                objetos.push({ id, nombre: nombreDe(catalogo, id), sinDatos: true });
            }
            continue;
        }
        vistos.add(id);
        const o = {
            id,
            nombre: nombreDe(catalogo, id),
            precio: aLaVenta(r) ? Math.round(r.precio) : null, // sin ninguno a la venta no hay precio de ahora
            normal: esNumero(r.normal) ? Math.round(r.normal) : null,
            tendencia: esNumero(r.tendencia) ? redondear(r.tendencia, 1) : null,
            ritmo: esNumero(r.ritmo) ? redondear(r.ritmo, 2) : null,
            vendidosDia: esNumero(r.vendidosDia) ? redondear(r.vendidosDia, 1) : null,
            otrasCasas: {},
        };
        for (const [c, m] of otras) {
            const otro = m.get(id);
            if (aLaVenta(otro))
                o.otrasCasas[c] = Math.round(otro.precio);
        }
        if (!aLaVenta(r))
            o.aLaVenta = false;
        if (r.poco === true)
            o.poco = true;
        if (r.mercancia === true)
            o.mercancia = true; // F5 y F9p: sus salidas son un máximo; altas no justifican recomendar
        if (r.mercanciaSinSaber === true)
            o.mercanciaSinSaber = true; // F9p, ronda 2: historial sin la columna mercancia
        objetos.push(o);
    }
    let generado = null;
    for (const r of resumenes.values())
        if (r && esNumero(r.hora) && (generado === null || r.hora > generado))
            generado = r.hora;
    const salida = { casa: casa ?? enVivo?.casa ?? null, generado, objetos };
    // F7: de qué subasta son los precios («Horde», «Alliance» o «Neutral») y el bando de cada casa de otrasCasas.
    const elBando = BANDOS.includes(bando) ? bando : (BANDOS.includes(enVivo?.faccion) ? enVivo.faccion : null);
    if (elBando)
        salida.bando = elBando;
    const usados = new Set(otras.map(([c]) => String(c)));
    const leyenda = {};
    for (const [c, b] of Object.entries(esObjeto(bandos) ? bandos : {}))
        if (usados.has(String(c)) && BANDOS.includes(b))
            leyenda[c] = b;
    if (Object.keys(leyenda).length > 0)
        salida.bandos = leyenda;
    if (enVivo) {
        salida.enVivo = Array.isArray(enVivo.oportunidades)
            ? { ...enVivo, oportunidades: enVivo.oportunidades.map((o) => conMercancia(o, resumenes.get(o.id))) }
            : enVivo;
    }
    return salida;
}
// ---------------------------------------------------------------------------------------------------
// Validación de la propuesta de la IA
// ---------------------------------------------------------------------------------------------------
// Una regla válida (solo con los campos conocidos y en rango) o null. `quitados` recibe lo que se quita.
function reglaValida(v, quitados) {
    if (!esObjeto(v)) {
        quitados.push('comercio.regla');
        return null;
    }
    const regla = {};
    let mala = false;
    for (const [campo, valor] of Object.entries(v)) {
        const rango = RANGOS_REGLA[campo];
        if (!rango) {
            quitados.push(`comercio.regla:${campo}`);
            continue;
        }
        const [min, max, entero] = rango;
        if (!esNumero(valor) || valor < min || (max !== null && valor > max) || (entero && !Number.isInteger(valor))) {
            quitados.push(`comercio.regla.${campo}`);
            mala = true;
            continue;
        }
        regla[campo] = valor;
    }
    if (mala)
        return null; // una regla con un número fuera de rango no se aplica a medias
    if (Object.keys(regla).length === 0) {
        quitados.push('comercio.regla');
        return null;
    }
    return regla;
}
// Un grupo válido ({nombre, objetos}) o null.
function grupoValido(v, existeObjeto, quitados) {
    if (!esObjeto(v)) {
        quitados.push('comercio.grupo');
        return null;
    }
    for (const campo of Object.keys(v))
        if (campo !== 'nombre' && campo !== 'objetos')
            quitados.push(`comercio.grupo:${campo}`);
    // Sin `|` (los códigos de escape del juego: color, enlaces, texturas).
    let nombre = typeof v.nombre === 'string' ? limpio(v.nombre.replaceAll('|', '')) : '';
    if (nombre === '' || Array.from(nombre).length > MAX_NOMBRE_GRUPO) {
        quitados.push('comercio.grupo.nombre');
        return null;
    }
    if (Buffer.byteLength(nombre, 'utf8') > MAX_BYTES_NOMBRE_GRUPO) {
        let corto = '';
        for (const letra of nombre) {
            if (Buffer.byteLength(corto + letra, 'utf8') > MAX_BYTES_NOMBRE_GRUPO)
                break;
            corto += letra;
        }
        nombre = corto.trim();
    }
    const ids = [];
    for (const id of Array.isArray(v.objetos) ? v.objetos : []) {
        if (!esId(id) || !existeObjeto(id)) {
            quitados.push(`objeto:${String(id)}`);
            continue;
        }
        if (!ids.includes(id))
            ids.push(id);
    }
    if (ids.length > MAX_IDS_GRUPO) {
        ids.length = MAX_IDS_GRUPO;
        quitados.push('comercio.grupo.objetos');
    }
    if (ids.length === 0) {
        quitados.push('comercio.grupo');
        return null;
    }
    return { nombre, objetos: ids };
}
/**
 * El campo `comercio` del bloque: {grupo?, regla?, paraGrupo?} o null. Lo inválido se quita y se apunta en `quitados`.
 *   grupo: nombre de 1 a 40 caracteres y de 1 a 200 ids que existen (existeObjeto); si no vale, tampoco la regla (era
 *          para ese grupo).
 *   regla: los campos de RANGOS_REGLA; un número fuera de rango quita la regla entera.
 *   paraGrupo: con una regla sola, el grupo abierto en la subasta ({clave, nombre}); sin grupo abierto, la regla se quita.
 */
export function validarComercio(v, { existeObjeto = () => false, grupoAbierto = null } = {}, quitados = []) {
    if (!esObjeto(v)) {
        quitados.push('comercio');
        return null;
    }
    for (const campo of Object.keys(v))
        if (campo !== 'grupo' && campo !== 'regla')
            quitados.push(`comercio:${campo}`);
    const salida = {};
    let grupoMalo = false;
    if (v.grupo !== undefined) {
        const g = grupoValido(v.grupo, existeObjeto, quitados);
        if (g)
            salida.grupo = g;
        else
            grupoMalo = true;
    }
    if (v.regla !== undefined) {
        if (grupoMalo) {
            quitados.push('comercio.regla');
        }
        else {
            const regla = reglaValida(v.regla, quitados);
            if (regla && salida.grupo)
                salida.regla = regla;
            else if (regla && grupoAbierto && typeof grupoAbierto.clave === 'string') {
                salida.regla = regla;
                salida.paraGrupo = { ...grupoAbierto };
            }
            else if (regla)
                quitados.push('comercio.regla');
        }
    }
    return Object.keys(salida).length > 0 ? salida : null;
}
