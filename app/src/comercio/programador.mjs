// Programador horario del comercio: baja cada hora las fotos de las casas en uso, las añade al historial, completa el
// catálogo y escribe una ranura de precios para el addon.
//
// Calendario (la foto de Blizzard cambia una vez por hora, hacia las hh:22 GMT):
//   - desde el minuto 20 de cada hora (UTC) pregunta cada 2 minutos, con If-Modified-Since (un 304 cuesta poco), hasta
//     tener la foto de esta hora de todas las casas o llegar al minuto 50; después, hasta las hh:20 siguientes;
//   - con «sin_credenciales» deja la ronda y no vuelve a preguntar hasta las hh:20 de la hora siguiente;
//   - un error de red o un fallo dentro de la ronda nunca para el programador: se apunta y se sigue.
// Una foto de una casa son sus subastas y sus mercancías: solo se añade al historial cuando las dos han llegado nuevas (de
// la misma foto) y ninguna viene vacía. Una foto vacía o a medias contaría como vendido todo lo de la anterior. Si una
// llega y la otra falla, la que llegó se guarda en memoria hasta que llegue la otra en otra ronda.
// Si hay un escaneo del jugador cuya casa no se conoce, se compara con las mercancías de las 5 casas de su bando
// (`descubrir`) y la casa que sale se guarda en el estado.
// F7: las casas de la ronda son las que sigue el jugador (estado.enUso: la de cada facción con personajes y la neutral,
// solo las descubiertas), cada una con su historial (`historial-<casa>.bin`) y su última foto. Entre una casa y la
// siguiente hay un respiro de ESPACIO_CASAS_MS. Hay un escaneo por subasta (el de la neutral descubre la neutral entre
// sus 5 candidatas, CASAS.Neutral): se prueba uno por ronda. Ronda 1: si una descarga de candidatas falla a medias, se
// reintenta en la ronda siguiente con lo ya bajado (como mucho 3 veces); si ninguna candidata sale con claridad, esa
// casa no se vuelve a probar en 24 h (estado.sinCasa). La ranura lleva la casa propia, la neutral y, si caben, las demás (como mucho MAX_CASAS_RANURA), cada una en su Q[casa].
// Precio regional (regional.mjs, opcional): cada foto nueva de una casa seguida se anota (como mucho cada 12 h) y, una vez
// por hora y después de publicar, se baja una casa más de la región (la que hace más que no se mira de las 15 de CASAS que
// no se siguen). La ranura lleva el precio regional de cada objeto (precios-lua.mjs: R[item]).
//
// crearProgramadorComercio({cliente, historial, catalogo, casas, escribir, reloj, dormir, registrar, espacio?, regional?})
//   cliente: (region) => cliente de blizzard.mjs (o el cliente directamente); historial: historial.mjs; catalogo: objetos.mjs;
//   casas: el estado del comercio (estado.mjs: enUso, identidad, desde, ponerDesde, conocidas, aprender, porDescubrir,
//   descubierto, sinCasa, ponerSinCasa, siguienteSeq, guardar); espacio: el respiro entre casas (ESPACIO_CASAS_MS); escribir(textos, {generado}): escribe la ranura (escribirPrecios); reloj(): milisegundos;
//   dormir(ms): una promesa; registrar(nivel, texto): el registro (nunca lleva secretos).
//   → {arrancar(), parar(), ahora()}: ahora() hace una ronda ya, sea la hora que sea, y da su resultado.
import { CASAS, casaDe, descubrir } from './casas.mjs';
import { CADA_PROPIA_S } from './regional.mjs';
import { textosPrecios } from './precios-lua.mjs';
import { DIAS_HISTORICO, MIN_DIAS_HISTORICO, MIN_MUESTRAS_DIA, MAX_DIAS_SIN_DATO } from './historial.mjs';
// Fase 2: los umbrales del histórico, que viajan en p1 para que el addon diga por qué no hay histórico.
const UMBRALES_HISTORICO = Object.freeze({
    ventana: DIAS_HISTORICO, minDias: MIN_DIAS_HISTORICO, minMuestras: MIN_MUESTRAS_DIA, maxDiasSinDato: MAX_DIAS_SIN_DATO,
});
const MIN = 60_000;
const HORA = 60 * MIN;
// F7, ronda 1: lo que se espera para volver a probar una casa con la que ningún escaneo se pareció a ninguna candidata.
export const ESPERA_SIN_CASA_MS = 24 * HORA;
export const CALENDARIO = Object.freeze({ desde: 20 * MIN, hasta: 50 * MIN, cada: 2 * MIN });
// F7: el respiro entre una casa y la siguiente dentro de una ronda (cada casa son ~12 MB): las descargas no van todas
// seguidas. Con 3 casas, la ronda dura 1 min más; las llamadas siguen muy por debajo de los límites de la API (ver
// fallo-F7-report.md: unas 6 llamadas por hora si todo va bien, ~100 en el peor caso, frente a 36.000 por hora).
export const ESPACIO_CASAS_MS = 30_000;
// F7: como mucho tantas casas en una ranura de precios: la propia, la neutral y la de la otra facción si tiene personajes.
// Las de más (personajes en otro tipo de reino) no van a la ranura (se siguen bajando y guardando en su historial). Con
// ~7.000 objetos por casa, 3 casas son ~1,4 MB de filas más los nombres: caben en los 5 archivos de datos (2,5 MB) y el
// juego las carga sin problema (medido en el banco: ver fallo-F7-report.md). Si aun así no caben, se quitan desde el final.
export const MAX_CASAS_RANURA = 3;
const DESFASE_MAX_S = 30 * 60; // subastas y mercancías de una misma foto no se llevan más que esto
const VIEJA_S = 45 * 60; // una lista que espera a su pareja más que esto ya es de otra foto
const TIPOS = ['subastas', 'mercancias'];
const segundos = (texto) => {
    const ms = Date.parse(texto ?? '');
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};
const redondear = (v, decimales) => (Number.isFinite(v) ? Math.round(v * 10 ** decimales) / 10 ** decimales : null);
const codigo = (e) => e?.code || e?.name || 'Error';
// {[item]: {[precio]: cantidad}} de una lista de mercancías, como el escaneo del jugador (para descubrir).
function aMuestras(lista) {
    const m = {};
    for (const s of lista || []) {
        const fila = (m[s.item] ||= {});
        fila[s.precio] = (fila[s.precio] || 0) + s.cantidad;
    }
    return m;
}
export function crearProgramadorComercio({ cliente, historial, catalogo, casas, escribir, reloj = Date.now, dormir, registrar = (() => { }), espacio = ESPACIO_CASAS_MS, regional = null, }) {
    const clienteDe = typeof cliente === 'function' ? cliente : () => cliente;
    const pendientes = new Map(); // "<region>|<casa>" → {subastas?, mercancias?}: {hora, texto, lista}
    const memoria = new Map(); // "<region>|<casa>" → {subastas, mercancias}: el desde con el que preguntar
    const hechas = new Map(); // "<region>|<casa>" → inicio (ms) de la hora de la última foto completa
    const muestrasUltimas = new Map(); // "<region>|<casa>" → mercancías de la última foto completa, como {[item]: {[precio]: n}}
    const avisados = new Set();
    // Intentos de descubrir la casa con un escaneo. F7: cada escaneo (uno por subasta) lleva su cuenta
    // ("<reino>|<faccion>|<hora>" → {ultimo, fallos, reintentar}). Ronda 1: tras una descarga a medias se reintenta en la
    // ronda siguiente (reintentar) y, tras 3 fallidos, se deja.
    const intentos = new Map();
    // F7, ronda 1: las mercancías de las candidatas bajadas para el intento en curso ("<region>|<casa>" → {muestras, desde,
    // hora}): una descarga a medias no tira lo ya bajado. Se vacía al acabar el intento.
    const bajadas = new Map();
    let parado = true;
    let generacion = 0; // cada arrancar() tiene la suya: un bucle viejo que despierta tras parar() y arrancar() se va
    let despertar = null;
    let bloqueadoHasta = 0;
    let cadena = Promise.resolve();
    let horaRegional = -1; // inicio (ms) de la hora en la que ya se bajó (o se intentó) una casa de la región
    const avisarUnaVez = (clave, nivel, texto) => {
        if (avisados.has(clave))
            return;
        avisados.add(clave);
        registrar(nivel, texto);
    };
    const inicioDeHora = (ms) => Math.floor(ms / HORA) * HORA;
    const clave = (region, casa) => `${region}|${casa}`;
    const desdeDe = (region, casa) => memoria.get(clave(region, casa)) ?? casas.desde(region, casa) ?? {};
    function enUso() {
        let uso = null;
        try {
            uso = casas.enUso();
        }
        catch (e) {
            registrar('aviso', `comercio: no se pudo saber qué casas se usan (${codigo(e)})`);
        }
        if (!uso || !Array.isArray(uso.casas) || uso.casas.length === 0) {
            avisarUnaVez('sin-identidad', 'info', 'comercio: aún no hay identidad del personaje (abre la subasta en el juego); no se baja nada');
            return null;
        }
        avisados.delete('sin-identidad');
        return uso;
    }
    // ¿Ya está la foto de esta hora de la casa? Por la última foto completa o, tras un reinicio, por los desde guardados.
    function hecha(region, casa, inicio) {
        const k = clave(region, casa);
        if (hechas.get(k) === inicio)
            return true;
        if (pendientes.has(k))
            return false;
        const d = desdeDe(region, casa);
        return TIPOS.every((t) => (segundos(d[t]) ?? 0) * 1000 >= inicio);
    }
    function todasHechas(inicio) {
        let uso = null;
        try {
            uso = casas.enUso();
        }
        catch {
            return false;
        }
        if (!uso || !uso.casas?.length)
            return false;
        return uso.casas.every((c) => hecha(uso.region, c, inicio));
    }
    // Pide lo que falte de la foto de una casa. → {sinCredenciales} | {completa, anadida, hora, subastas, mercancias} | {}
    async function fotoDeCasa(cli, region, casa) {
        const k = clave(region, casa);
        const ahoraS = Math.floor(reloj() / 1000);
        const pend = { ...(pendientes.get(k) || {}) };
        const desde = { ...desdeDe(region, casa) };
        for (const tipo of TIPOS) {
            if (pend[tipo] && ahoraS - pend[tipo].hora > VIEJA_S) {
                // ya es de otra foto: se tira y se vuelve a pedir desde la última foto completa
                delete pend[tipo];
                desde[tipo] = casas.desde(region, casa)?.[tipo];
            }
        }
        for (const tipo of TIPOS) {
            if (pend[tipo])
                continue; // ya llegó en otra ronda: espera a su pareja
            let r;
            try {
                r = await cli[tipo](casa, { desde: desde[tipo] });
            }
            catch (e) {
                r = { estado: 'error', motivo: codigo(e) };
            }
            if (r?.estado === 'sin_credenciales') {
                pendientes.set(k, pend);
                memoria.set(k, desde);
                return { sinCredenciales: true };
            }
            if (r?.estado === 'nueva' && Array.isArray(r.subastas)) {
                pend[tipo] = { hora: segundos(r.hora) ?? ahoraS, texto: r.hora ?? null, lista: r.subastas };
                if (r.hora)
                    desde[tipo] = r.hora;
            }
            else if (r?.estado !== 'igual') {
                registrar('aviso', `comercio: la casa ${casa} no respondió (${tipo}${r?.motivo ? `, ${r.motivo}` : ''}); se vuelve a probar en la próxima ronda`);
            }
        }
        memoria.set(k, desde);
        if (!pend.subastas || !pend.mercancias) {
            if (pend.subastas || pend.mercancias)
                pendientes.set(k, pend);
            else
                pendientes.delete(k);
            return {};
        }
        const { subastas: s, mercancias: m } = pend;
        if (Math.abs(s.hora - m.hora) > DESFASE_MAX_S) {
            // de fotos distintas: se queda la más nueva y se espera a su pareja
            const tipo = s.hora > m.hora ? 'subastas' : 'mercancias';
            pendientes.set(k, { [tipo]: pend[tipo] });
            return {};
        }
        pendientes.delete(k);
        const hora = Math.max(s.hora, m.hora);
        const cuentas = { subastas: s.lista.length, mercancias: m.lista.length };
        // La foto ya está entera: se apunta como hecha (y su desde) solo al terminar, salga como salga.
        const terminar = () => {
            casas.ponerDesde(region, casa, { subastas: desde.subastas, mercancias: desde.mercancias, cuentas });
            hechas.set(k, inicioDeHora(hora * 1000));
            muestrasUltimas.set(k, aMuestras(m.lista));
        };
        const vacia = TIPOS.find((t) => cuentas[t] === 0 && !vaciaValida(region, casa, t));
        if (vacia) {
            terminar();
            registrar('aviso', `comercio: la casa ${casa} trae una lista vacía (${vacia}) tras una que no lo estaba; esta foto no se añade al historial`);
            return { completa: true, anadida: false, hora, mercancias: m.lista };
        }
        // Si anadirFoto lanza, la casa no queda hecha: se vuelve a pedir en la ronda siguiente.
        let anadida;
        try {
            anadida = historial.anadirFoto(casa, hora, s.lista, m.lista);
        }
        catch (e) {
            memoria.set(k, { ...casas.desde(region, casa) }); // sin el desde nuevo: la foto se vuelve a bajar entera
            throw e;
        }
        if (anadida) {
            try {
                await historial.guardar(casa);
            }
            catch (e) {
                // la foto ya está en memoria: se guardará con la siguiente; los precios se publican igual
                registrar('aviso', `comercio: el historial de la casa ${casa} no se pudo guardar (${codigo(e)}); se guardará con la próxima foto`);
            }
        }
        terminar();
        return { completa: true, anadida, hora, subastas: s.lista, mercancias: m.lista };
    }
    // Una lista vacía solo vale si la última foto añadida de esa casa también la traía vacía (una casa sin mercancías) o si
    // la casa aún no tiene historial (no hay nada que contar como vendido). Una vacía tras una llena se rechaza.
    function vaciaValida(region, casa, tipo) {
        const antes = casas.desde(region, casa)?.cuentas;
        if (antes && Number.isFinite(antes[tipo]))
            return antes[tipo] === 0;
        try {
            const todos = historial.todos(casa);
            return !todos || todos.size === 0;
        }
        catch {
            return false;
        }
    }
    // Las filas de precios de las casas en uso. Lo que no está en la última foto de la casa sale con cantidad y subastas 0.
    // Fase 2: `historicos` (opcional) se llena con el histórico de cada objeto que tiene, de la misma casa que su fila.
    function filasDe(listaCasas, historicos = null) {
        const salida = {};
        for (const casa of listaCasas) {
            const todos = historial.todos(casa);
            if (!todos || todos.size === 0)
                continue;
            let ultima = 0;
            for (const r of todos.values())
                if (r && r.hora > ultima)
                    ultima = r.hora;
            const filas = {};
            const hist = {};
            for (const [item, r] of todos) {
                if (!r)
                    continue;
                if (r.historico && r.historico.razon !== 'sin-datos')
                    hist[item] = r.historico;
                const enVenta = r.hora === ultima;
                filas[item] = [
                    r.precio, enVenta ? r.cantidad : 0, r.normal,
                    redondear(r.tendencia, 1), redondear(r.ritmo, 3), redondear(r.vendidosDia, 1), r.poco ? 1 : 0,
                ];
                // T1b: cuántas subastas son y si la tendencia se sabe (sin ella se escribe 0, que no es lo mismo que «no cambia»).
                if (Number.isFinite(r.subastas)) {
                    filas[item].push(enVenta ? r.subastas : 0, Number.isFinite(r.tendencia) ? 1 : 0);
                    if (r.mercancia)
                        filas[item].push(1); // F5: es una mercancía (el addon elige con eso el nombre de «Salen»)
                }
            }
            salida[casa] = filas;
            if (historicos)
                historicos[casa] = hist;
        }
        return salida;
    }
    // El precio regional para la ranura, o null (sin módulo regional o sin datos). Un fallo aquí no para la publicación.
    function regionalParaRanura() {
        if (!regional)
            return null;
        try {
            return regional.valores(Math.floor(reloj() / 1000));
        }
        catch (e) {
            registrar('aviso', `comercio: el precio regional no se pudo calcular (${codigo(e)})`);
            return null;
        }
    }
    // Anota en el precio regional la foto de una casa seguida (como mucho cada CADA_PROPIA_S). Nunca para la ronda.
    function anotarRegional(casa, hora, subastas, mercancias) {
        if (!regional)
            return false;
        try {
            return regional.anotar(casa, hora, subastas, mercancias, { cada: CADA_PROPIA_S });
        }
        catch (e) {
            registrar('aviso', `comercio: la foto de la casa ${casa} no entró en el precio regional (${codigo(e)})`);
            return false;
        }
    }
    async function guardarRegional() {
        try {
            await regional.guardar();
        }
        catch (e) {
            registrar('aviso', `comercio: el precio regional no se pudo guardar (${codigo(e)}); se guardará con la próxima casa`);
        }
    }
    // Una vez por hora: baja una casa de la región que no se sigue (la que hace más que no se mira) y la anota.
    // → 'sin_credenciales' | 'anotada' | null
    async function rondaRegional(cli, uso, inicio, pedidas) {
        if (!regional || horaRegional === inicio)
            return null;
        horaRegional = inicio;
        let casa = null;
        try {
            casa = regional.siguiente(Object.values(CASAS).flat(), uso.casas);
        }
        catch (e) {
            registrar('aviso', `comercio: no se pudo elegir la casa regional (${codigo(e)})`);
            return null;
        }
        if (casa == null)
            return null;
        if (pedidas > 0 && espacio > 0)
            await dormir(espacio);
        const listas = {};
        let hora = 0;
        for (const tipo of TIPOS) {
            let r;
            try {
                r = await cli[tipo](casa, {});
            }
            catch (e) {
                r = { estado: 'error', motivo: codigo(e) };
            }
            if (r?.estado === 'sin_credenciales')
                return 'sin_credenciales';
            if (r?.estado !== 'nueva' || !Array.isArray(r.subastas)) {
                registrar('aviso', `comercio: la casa ${casa} de la región no respondió (${tipo}${r?.motivo ? `, ${r.motivo}` : ''}); se probará otra en la próxima hora`);
                try {
                    regional.probada(casa, Math.floor(reloj() / 1000));
                }
                catch {
                    // el turno sigue igual: se volverá a elegir
                }
                await guardarRegional();
                return null;
            }
            listas[tipo] = r.subastas;
            hora = Math.max(hora, segundos(r.hora) ?? Math.floor(reloj() / 1000));
        }
        let anotada = false;
        try {
            anotada = regional.anotar(casa, hora, listas.subastas, listas.mercancias);
            if (!anotada)
                regional.probada(casa, Math.floor(reloj() / 1000));
        }
        catch (e) {
            registrar('aviso', `comercio: la casa ${casa} no entró en el precio regional (${codigo(e)})`);
        }
        await guardarRegional();
        registrar('info', anotada
            ? `comercio: precio regional: casa ${casa} anotada (${listas.subastas.length + listas.mercancias.length} subastas)`
            : `comercio: precio regional: la casa ${casa} no trae subastas`);
        return anotada ? 'anotada' : null;
    }
    async function publicar(uso, generado) {
        try {
            const propia = uso.casas[0];
            // F7, ronda 1: los grupos automáticos, solo de la casa de la facción del personaje; si no está descubierta, ninguno
            // (nunca los de otra casa: llevan precios, como «más barato de lo normal»).
            const yoGrupos = casas.identidad?.();
            const casaGrupos = yoGrupos ? casaDe(yoGrupos, casas.conocidas()) : null;
            let grupos = [];
            try {
                if (casaGrupos != null && uso.casas.includes(casaGrupos))
                    grupos = catalogo.grupos(historial.todos(casaGrupos) || new Map());
            }
            catch (e) {
                registrar('aviso', `comercio: grupos sin hacer (${codigo(e)})`);
            }
            const historicos = {};
            const filas = filasDe(uso.casas, historicos);
            const nombresDe = (deCasas) => {
                const nombres = {};
                for (const casa of Object.keys(deCasas)) {
                    for (const item of Object.keys(deCasas[casa])) {
                        const n = catalogo.ficha?.(Number(item))?.nombre;
                        if (typeof n === 'string' && n)
                            nombres[item] = n;
                    }
                }
                return nombres;
            };
            const conocidas = casas.conocidas();
            const base = { seq: casas.siguienteSeq(reloj()), generado, region: uso.region, conocidas };
            // F7: qué casas van a la ranura y en qué orden: la propia, la neutral de su reino y luego las demás (las de otras
            // facciones con personajes y las de otros tipos de reino), como mucho MAX_CASAS_RANURA. Si no caben, se quitan desde
            // el final: la propia y la neutral son las últimas en caer.
            const yo = casas.identidad?.();
            const neutral = yo ? casaDe({ ...yo, faccion: 'Neutral' }, conocidas) : null;
            const orden = [propia, ...(neutral !== propia && uso.casas.includes(neutral) ? [neutral] : [])];
            for (const c of uso.casas)
                if (!orden.includes(c))
                    orden.push(c);
            const conFilas = orden.filter((c) => filas[c]);
            let elegidas = conFilas.slice(0, MAX_CASAS_RANURA);
            const fuera = conFilas.slice(MAX_CASAS_RANURA);
            if (fuera.length > 0) {
                registrar('aviso', `comercio: la ranura de precios lleva como mucho ${MAX_CASAS_RANURA} casas; no van las casas ${fuera.join(', ')}`);
            }
            let textos;
            for (;;) {
                const solo = Object.fromEntries(elegidas.map((c) => [c, filas[c]]));
                const info = Object.fromEntries(elegidas.map((c) => [c, historial.resumenCasa?.(c)]));
                let gruposAqui = grupos;
                if (elegidas.length < conFilas.length) {
                    // Con casas fuera: en los grupos, solo los objetos de las que van (los grupos que se quedan vacíos no van).
                    const enCasas = new Set(elegidas.flatMap((c) => Object.keys(filas[c]).map(Number)));
                    gruposAqui = grupos
                        .map((g) => ({ ...g, objetos: (g.objetos || []).filter((id) => enCasas.has(id)) }))
                        .filter((g) => g.objetos.length > 0);
                }
                try {
                    const historico = Object.fromEntries(elegidas.map((c) => [c, historicos[c] || {}]));
                    textos = textosPrecios({
                        ...base, casas: solo, grupos: gruposAqui, nombres: nombresDe(solo), info, historico,
                        umbralesHistorico: UMBRALES_HISTORICO, regional: regionalParaRanura(),
                    });
                    break;
                }
                catch (e) {
                    if (e?.code !== 'PRECIOS_GRANDES' || elegidas.length <= 1)
                        throw e;
                    const quitada = elegidas.at(-1);
                    elegidas = elegidas.slice(0, -1);
                    registrar('aviso', `comercio: los precios de las ${elegidas.length + 1} casas no caben; la casa ${quitada} no va (van las casas ${elegidas.join(', ')})`);
                }
            }
            await escribir(textos, { generado });
            registrar('info', `comercio: precios escritos (foto de las ${new Date(generado * 1000).toISOString().slice(11, 16)} UTC)`);
        }
        catch (e) {
            registrar('error', `comercio: no se pudieron escribir los precios (${codigo(e)})`);
        }
    }
    // Compara el escaneo pendiente con las mercancías de las 5 casas de su bando.
    // → 'sin_credenciales', 'probado' (el estado cambió: escaneo probado y quizá una casa nueva) o null (nada, o se reintentará).
    // Se llama después de pedir las casas de la ronda: usa las mercancías ya bajadas (las de esta ronda, las que esperan a su
    // pareja, las de la última foto de cada casa en uso y, ronda 1, las ya bajadas para este intento) y solo baja las que
    // faltan. Tras una descarga a medias se reintenta en la ronda siguiente y, tras 3 intentos fallidos, se da por probado.
    // Si ninguna candidata sale con claridad, la casa no se vuelve a probar en 24 h.
    async function intentarDescubrir(listas) {
        const claveIntento = (e) => `${e.identidad.reino}|${e.identidad.faccion}|${e.hora}`;
        // F7, ronda 1: una casa con la que ningún escaneo se pareció a ninguna candidata no se prueba en 24 h.
        const bloqueada = (e) => reloj() - (casas.sinCasa?.(`${e.identidad.reino}|${e.identidad.faccion}`) ?? -Infinity) < ESPERA_SIN_CASA_MS;
        // Tras una descarga a medias se reintenta en la ronda siguiente (con lo ya bajado); si no, pasada una hora.
        const libre = (e) => {
            if (bloqueada(e))
                return false;
            const i = intentos.get(claveIntento(e));
            return !i || i.reintentar || reloj() - i.ultimo >= HORA;
        };
        const esc = casas.porDescubrir?.(libre);
        if (!esc || !libre(esc))
            return null;
        const ci = claveIntento(esc);
        if (!intentos.has(ci))
            intentos.set(ci, { ultimo: -Infinity, fallos: 0, reintentar: false });
        const intento = intentos.get(ci);
        intento.ultimo = reloj();
        intento.reintentar = false;
        const { region, reino, faccion } = esc.identidad;
        // Acabado el intento (salga o no la casa), lo bajado para él ya no hace falta.
        const acabar = () => {
            bajadas.clear();
            intentos.delete(ci);
        };
        const candidatas = CASAS[faccion];
        let cli = null;
        try {
            cli = candidatas ? clienteDe(region) : null;
        }
        catch {
            cli = null;
        }
        if (!cli) {
            casas.descubierto(esc);
            acabar();
            return 'probado';
        }
        const fotos = new Map();
        const horaAhora = inicioDeHora(reloj());
        for (const casa of candidatas) {
            const k = clave(region, casa);
            const ya = listas.get(k) ?? pendientes.get(k)?.mercancias?.lista;
            let muestras = ya ? aMuestras(ya) : muestrasUltimas.get(k);
            // F7, ronda 1: lo ya bajado para este intento. En la misma hora no se vuelve a pedir; en otra, con If-Modified-Since.
            const guardada = bajadas.get(k);
            if (!muestras && guardada?.hora === horaAhora)
                muestras = guardada.muestras;
            if (!muestras) {
                let r;
                try {
                    r = await cli.mercancias(casa, guardada?.desde ? { desde: guardada.desde } : {});
                }
                catch (e) {
                    r = { estado: 'error', motivo: codigo(e) };
                }
                if (r?.estado === 'sin_credenciales')
                    return 'sin_credenciales';
                if (r?.estado === 'igual' && guardada) {
                    guardada.hora = horaAhora;
                    muestras = guardada.muestras;
                }
                else if (r?.estado !== 'nueva' || !Array.isArray(r.subastas)) {
                    intento.fallos += 1;
                    if (intento.fallos >= 3) {
                        casas.descubierto(esc);
                        acabar();
                        registrar('aviso', `comercio: tras 3 intentos no se pudo bajar la casa ${casa} para saber cuál es la del personaje; se esperará a otro escaneo`);
                        return 'probado';
                    }
                    intento.reintentar = true; // la ronda siguiente, solo lo que falta
                    registrar('aviso', `comercio: no se pudo bajar la casa ${casa} para saber cuál es la del personaje; se vuelve a probar en la ronda siguiente`);
                    return null;
                }
                else {
                    muestras = aMuestras(r.subastas);
                    bajadas.set(k, { muestras, desde: r.hora ?? null, hora: horaAhora });
                }
            }
            fotos.set(casa, muestras);
        }
        const r = descubrir(esc.muestras, fotos);
        casas.descubierto(esc);
        acabar();
        if (r) {
            casas.aprender(reino, faccion, r.casa);
            registrar('info', `comercio: la casa de ${reino}|${faccion} es la ${r.casa} (${r.aciertos} de ${r.total} precios iguales)`);
        }
        else {
            casas.ponerSinCasa?.(`${reino}|${faccion}`, reloj());
            // Sin ninguna que se parezca, o con dos que se parecen casi igual (descubrir no se fía): no se sabe cuál es.
            registrar('aviso', `comercio: no se ha podido decidir la casa de ${reino}|${faccion} con este escaneo (candidatas ${candidatas.join(', ')}: ninguna se parece lo bastante, o dos se parecen casi igual); no se vuelve a probar en 24 h`);
        }
        return 'probado';
    }
    // F7, ronda 1: ¿hay un intento de descubrir a medias que se reintenta en la ronda siguiente (aunque las casas ya estén)?
    const reintentoPendiente = () => [...intentos.values()].some((i) => i.reintentar);
    // El código si el historial de la casa está ocupado ahora, o null (un historial sin `ocupada` nunca lo está).
    function historialOcupado(casa) {
        try {
            return historial.ocupada?.(casa) || null;
        }
        catch {
            return null;
        }
    }
    async function ronda(conRegional = false) {
        const uso = enUso();
        if (!uso) {
            // Sin ninguna casa en uso (un reino sin casa supuesta, como los nombres reales de Forever): se prueba igualmente a
            // descubrirla con el escaneo del jugador. Si sale, la vuelta siguiente ya baja su casa.
            let d = null;
            try {
                d = await intentarDescubrir(new Map());
            }
            catch (e) {
                registrar('aviso', `comercio: no se pudo descubrir la casa (${codigo(e)})`);
            }
            if (d === 'probado') {
                try {
                    await casas.guardar();
                }
                catch (e) {
                    registrar('aviso', `comercio: no se pudo guardar el estado (${codigo(e)})`);
                }
            }
            if (d === 'sin_credenciales')
                return { estado: 'sin_credenciales', nuevas: [] };
            return { estado: 'sin_casas', nuevas: [] };
        }
        let cli;
        try {
            cli = clienteDe(uso.region);
        }
        catch (e) {
            avisarUnaVez(`region-${uso.region}`, 'aviso', `comercio: la región ${uso.region} no se puede usar (${codigo(e)})`);
            return { estado: 'sin_casas', nuevas: [] };
        }
        const nuevas = [];
        const ids = new Set();
        const listas = new Map(); // mercancías nuevas de esta ronda, para descubrir sin volver a bajarlas
        let generado = 0;
        let sinCredenciales = false;
        let cambios = false; // algo que guardar en el estado
        const inicio = inicioDeHora(reloj());
        let pedidas = 0;
        let regionalCambiado = false;
        for (const casa of uso.casas) {
            if (hecha(uso.region, casa, inicio))
                continue;
            // Con el archivo del historial ocupado (p. ej. el antivirus) la foto no se podría añadir: esta vuelta no se baja.
            const ocupada = historialOcupado(casa);
            if (ocupada) {
                avisarUnaVez(`ocupada-${casa}`, 'aviso', `comercio: el historial de la casa ${casa} está ocupado (${ocupada}); no se baja su foto hasta que se libere`);
                continue;
            }
            avisados.delete(`ocupada-${casa}`);
            // F7: un respiro entre casa y casa (la primera que se pide en la ronda, sin esperar).
            if (pedidas > 0 && espacio > 0)
                await dormir(espacio);
            pedidas += 1;
            let r;
            try {
                r = await fotoDeCasa(cli, uso.region, casa);
            }
            catch (e) {
                registrar('aviso', `comercio: fallo con la casa ${casa} (${codigo(e)})`);
                continue;
            }
            if (r.sinCredenciales) {
                sinCredenciales = true;
                break;
            }
            if (r.completa)
                cambios = true;
            if (r.mercancias)
                listas.set(clave(uso.region, casa), r.mercancias);
            if (r.anadida) {
                if (anotarRegional(casa, r.hora, r.subastas, r.mercancias))
                    regionalCambiado = true;
                nuevas.push(casa);
                generado = Math.max(generado, r.hora);
                for (const s of r.subastas)
                    ids.add(s.item);
                for (const s of r.mercancias)
                    ids.add(s.item);
            }
        }
        if (nuevas.length > 0) {
            try {
                await catalogo.completar([...ids]);
            }
            catch (e) {
                registrar('aviso', `comercio: el catálogo de objetos no se pudo completar (${codigo(e)})`);
            }
            await publicar(uso, generado);
        }
        if (regionalCambiado)
            await guardarRegional();
        if (!sinCredenciales) {
            try {
                const d = await intentarDescubrir(listas);
                sinCredenciales = d === 'sin_credenciales';
                if (d === 'probado')
                    cambios = true;
            }
            catch (e) {
                registrar('aviso', `comercio: no se pudo descubrir la casa (${codigo(e)})`);
            }
        }
        // Lo último de la ronda, y solo en las del calendario (no en las de ahora(), que adelanta un escaneo): una casa de la
        // región. Así nunca retrasa ni la publicación ni el descubrimiento de una casa.
        if (conRegional && !sinCredenciales) {
            try {
                if ((await rondaRegional(cli, uso, inicio, pedidas)) === 'sin_credenciales')
                    sinCredenciales = true;
            }
            catch (e) {
                registrar('aviso', `comercio: fallo con la casa regional (${codigo(e)})`);
            }
        }
        if (cambios) {
            try {
                await casas.guardar();
            }
            catch (e) {
                registrar('aviso', `comercio: no se pudo guardar el estado (${codigo(e)})`);
            }
        }
        if (sinCredenciales)
            avisarUnaVez('sin-credenciales', 'info', 'comercio: sin credenciales de Blizzard válidas; se vuelve a probar cada hora');
        else
            avisados.delete('sin-credenciales');
        return { estado: sinCredenciales ? 'sin_credenciales' : 'ok', nuevas };
    }
    // Una ronda cada vez (la del calendario y las de ahora() no se pisan). `conRegional`: solo las del calendario.
    function enCadena(conRegional = false) {
        const hacer = () => ronda(conRegional);
        const hecho = cadena.then(hacer, hacer);
        cadena = hecho.catch(() => { });
        return hecho;
    }
    // Lo que toca ahora: hace la ronda si es la hora y devuelve cuánto esperar hasta la siguiente vez.
    async function paso() {
        const t = reloj();
        const inicio = inicioDeHora(t);
        const siguiente = inicio + HORA + CALENDARIO.desde;
        if (t < bloqueadoHasta)
            return bloqueadoHasta - t;
        if (t - inicio < CALENDARIO.desde)
            return inicio + CALENDARIO.desde - t;
        if (t - inicio >= CALENDARIO.hasta || (todasHechas(inicio) && !reintentoPendiente()))
            return siguiente - t;
        const r = await enCadena(true);
        const t2 = reloj();
        const inicio2 = inicioDeHora(t2);
        if (r.estado === 'sin_credenciales') {
            bloqueadoHasta = inicio2 + HORA + CALENDARIO.desde;
            return bloqueadoHasta - t2;
        }
        if (todasHechas(inicio2) && !reintentoPendiente())
            return inicio2 + HORA + CALENDARIO.desde - t2;
        return CALENDARIO.cada;
    }
    async function bucle(mia) {
        const vivo = () => !parado && generacion === mia;
        while (vivo()) {
            let espera;
            try {
                espera = await paso();
            }
            catch (e) {
                registrar('error', `comercio: fallo en el programador (${codigo(e)})`);
                espera = CALENDARIO.cada;
            }
            if (!vivo())
                break;
            await Promise.race([
                dormir(espera > 0 ? espera : 1000),
                new Promise((resolver) => { despertar = resolver; }),
            ]);
        }
    }
    return {
        arrancar() {
            if (!parado)
                return;
            parado = false;
            generacion += 1;
            bucle(generacion).catch((e) => registrar('error', `comercio: el programador se paró (${codigo(e)})`));
        },
        parar() {
            parado = true;
            despertar?.();
            despertar = null;
        },
        ahora: () => enCadena(),
    };
}
