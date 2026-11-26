// Adaptado de NeverQuestAlone (MIT; © 2026 chelinho139 y los autores de NeverQuestAlone), bridge/transport/strip.mjs, commit 3a9b93c.
// Descodificador de la franja de cuadritos de colores de SnetForever (protocolo P1), en JavaScript.
// Sigue el descodificador de NeverQuestAlone: una celda se lee en su centro, un canal está encendido a partir de 128 y la
// geometría (esquina superior izquierda y paso de celda) se mide en los tramos de color de la magia y se ajusta con los
// cambios de color de la primera fila.
//
// Imagen = {ancho, alto, canales: 3|4, datos: Uint8Array, bgr?: boolean}: con bgr, el primer canal de cada píxel es el azul.
//
// La franja es pequeña (celdas de 2 px, 200 por fila, hasta 20 filas) y va dentro de la ventana de chat, que el jugador
// puede mover: se busca en toda la imagen que se recibe.
export const MAGIA = [0x53, 0x46];
// Valores ajustables (si en el juego hace falta). Deben coincidir con addons/SnetForever/ia/codec.lua.
export const ESPEC = {
    celdas: 200,
    filas: 20,
    filasBusqueda: Infinity,
    columnasBusqueda: Infinity,
    pasoMin: 1.5,
    pasoMax: 12,
};
const espec = (s) => ({ ...ESPEC, ...s });
// Coherencia de una geometría (barrera contra la magia que coincide por azar en el ruido): en las primeras celdas
// (la cabecera de la trama), los puntos de dentro de la celda tienen que dar el mismo valor que su centro.
// Los puntos que caen en el mismo píxel que el centro no cuentan (con celdas de 2 px, la mitad coinciden).
const COHERENCIA_CELDAS = 24;
const COHERENCIA_MIN = 0.55;
const COHERENCIA_PUNTOS_MIN = 12;
const PUNTOS_COHERENCIA = [[0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]];
// Paso mínimo con el que la magia cuenta como candidata (por debajo no se distingue del ruido); pasoMin decide después
// si se decodifica o se da «paso_pequeno».
const PASO_FIRMA_MIN = 1.5;
/** El valor de 3 bits de un píxel (R = bit 2, G = bit 1, B = bit 0). */
function celdaEn(img, x, y) {
    const p = (y * img.ancho + x) * img.canales;
    const d = img.datos;
    const r = img.bgr ? d[p + 2] : d[p];
    const b = img.bgr ? d[p] : d[p + 2];
    return (r >= 128 ? 4 : 0) | (d[p + 1] >= 128 ? 2 : 0) | (b >= 128 ? 1 : 0);
}
/** ¿Los puntos de dentro de las primeras celdas coinciden con su centro? */
function coherente(img, g, s) {
    let bien = 0;
    let total = 0;
    for (let i = 0; i < COHERENCIA_CELDAS; i++) {
        const col = i % s.celdas;
        const fila = Math.floor(i / s.celdas);
        const px = (fx) => Math.floor(g.x0 + (col + fx) * g.paso);
        const py = (fy) => Math.floor(g.y0 + (fila + fy) * g.paso);
        const cx = px(0.5);
        const cy = py(0.5);
        if (cx < 0 || cy < 0 || cx >= img.ancho || cy >= img.alto)
            continue;
        const centro = celdaEn(img, cx, cy);
        for (const [fx, fy] of PUNTOS_COHERENCIA) {
            const x = px(fx);
            const y = py(fy);
            if ((x === cx && y === cy) || x < 0 || y < 0 || x >= img.ancho || y >= img.alto)
                continue;
            total++;
            if (celdaEn(img, x, y) === centro)
                bien++;
        }
    }
    return total >= COHERENCIA_PUNTOS_MIN && bien / total >= COHERENCIA_MIN;
}
/**
 * Coherencia a lo largo de la fila y: en las primeras celdas desde x, los puntos de dentro de cada celda (a un cuarto y a
 * tres cuartos) tienen que dar el mismo valor que su centro. En ruido, esa coincidencia es de 1 entre 8.
 */
function coherenteFila(img, x, y, paso) {
    let bien = 0;
    let total = 0;
    for (let i = 0; i < COHERENCIA_CELDAS; i++) {
        const xc = Math.floor(x + (i + 0.5) * paso);
        if (xc >= img.ancho)
            break;
        const centro = celdaEn(img, xc, y);
        for (const f of [0.25, 0.75]) {
            const xp = Math.floor(x + (i + f) * paso);
            if (xp >= img.ancho || xp === xc)
                continue;
            total++;
            if (celdaEn(img, xp, y) === centro)
                bien++;
        }
    }
    return total >= COHERENCIA_PUNTOS_MIN && bien / total >= COHERENCIA_MIN;
}
/**
 * Decodifica con las celdas leídas en su centro para una geometría {x0, y0, paso}.
 * → {tipo: 'nada'} | {tipo: 'rechazada', motivo, geometria} | {tipo: 'decodificada', id, bytes, geometria}
 */
function decodificarEn(img, g, s) {
    let acc = 0;
    let nbits = 0;
    let necesarios = 6;
    const out = [];
    const total = s.celdas * s.filas;
    for (let i = 0; i < total && out.length < necesarios; i++) {
        const x = Math.floor(g.x0 + ((i % s.celdas) + 0.5) * g.paso);
        const y = Math.floor(g.y0 + (Math.floor(i / s.celdas) + 0.5) * g.paso);
        if (x < 0 || y < 0 || x >= img.ancho || y >= img.alto) {
            return out.length >= 2 ? { tipo: 'rechazada', motivo: 'cortada', geometria: g } : { tipo: 'nada' };
        }
        acc = ((acc << 3) | celdaEn(img, x, y)) >>> 0;
        nbits += 3;
        while (nbits >= 8) {
            out.push((acc >>> (nbits - 8)) & 0xff);
            nbits -= 8;
            acc &= (1 << nbits) - 1;
            if (out.length === 2 && (out[0] !== MAGIA[0] || out[1] !== MAGIA[1]))
                return { tipo: 'nada' };
            if (out.length === 6) {
                necesarios = 8 + ((out[4] << 8) | out[5]);
                if (necesarios > Math.floor((total * 3) / 8))
                    return { tipo: 'rechazada', motivo: 'longitud', geometria: g };
            }
            if (out.length >= necesarios)
                break;
        }
    }
    if (out.length < necesarios)
        return { tipo: 'rechazada', motivo: 'cortada', geometria: g };
    const len = (out[4] << 8) | out[5];
    let s1 = 0;
    let s2 = 0;
    for (let k = 2; k < 6 + len; k++) {
        s1 = (s1 + out[k]) % 255;
        s2 = (s2 + s1) % 255;
    }
    if (out[6 + len] !== s1 || out[7 + len] !== s2)
        return { tipo: 'rechazada', motivo: 'suma', geometria: g };
    return { tipo: 'decodificada', id: (out[2] << 8) | out[3], bytes: Buffer.from(out.slice(6, 6 + len)), geometria: g };
}
// Valores de las cinco primeras celdas enteras de la magia (cada una distinta de la anterior: son cinco tramos de color).
const VALORES_MAGIA = (() => {
    const m = (MAGIA[0] << 8) | MAGIA[1];
    return [0, 1, 2, 3, 4].map((k) => (m >>> (13 - 3 * k)) & 7);
})();
/**
 * ¿Empieza en (x, y) la magia? Recorre los cinco tramos de color de la magia sin reservar nada y sale en cuanto uno falla
 * (casi siempre en el primero o el segundo). Un parpadeo de 1 px dentro de un tramo, o entre dos (borde mezclado), se
 * suma al tramo. Devuelve el paso medido, o 0 si no es la magia.
 */
function firmaEn(img, x, y, s) {
    const limite = Math.min(img.ancho, x + Math.floor(s.pasoMax * 6) + 4);
    const largoMax = s.pasoMax * 1.6;
    const inicios = [x];
    let pos = x;
    for (let k = 0; k < 4; k++) {
        const v = VALORES_MAGIA[k];
        const sig = VALORES_MAGIA[k + 1];
        let q = pos + 1;
        while (q < limite) {
            const c = celdaEn(img, q, y);
            if (c === v) {
                q++;
                continue;
            }
            if (c !== sig && q + 1 < limite && celdaEn(img, q + 1, y) === v) {
                q += 2;
                continue;
            }
            break;
        }
        if (q >= limite)
            return 0;
        if (celdaEn(img, q, y) !== sig) {
            // Parpadeo en el borde entre los dos tramos.
            if (q + 1 < limite && celdaEn(img, q + 1, y) === sig)
                q++;
            else
                return 0;
        }
        if (q - pos > largoMax)
            return 0;
        inicios.push(q);
        pos = q;
    }
    const p = (inicios[4] - inicios[0]) / 4;
    if (p > s.pasoMax || p < PASO_FIRMA_MIN)
        return 0;
    for (let k = 0; k < 4; k++) {
        const largo = inicios[k + 1] - inicios[k];
        if (largo < p * 0.5 || largo > p * 1.6)
            return 0;
    }
    let fin = inicios[4] + 1;
    while (fin < img.ancho && celdaEn(img, fin, y) === VALORES_MAGIA[4])
        fin++;
    if (fin - inicios[4] < p * 0.5)
        return 0;
    return coherenteFila(img, x, y, p) ? p : 0;
}
/**
 * Geometrías candidatas: puntos donde empieza la magia (primer color, con otro color justo a su izquierda) y cuyos cinco
 * tramos de color son coherentes entre sí. Devuelve también la primera magia con celdas demasiado pequeñas (pequena).
 */
function candidatas(img, s, maxCandidatas = 64) {
    const halladas = [];
    let pequena = null;
    const maxY = Math.min(s.filasBusqueda, img.alto);
    const maxX = Math.min(s.columnasBusqueda, img.ancho);
    const primero = VALORES_MAGIA[0];
    for (let y = 0; y < maxY && halladas.length < maxCandidatas; y++) {
        for (let x = 0; x < maxX; x++) {
            if (celdaEn(img, x, y) !== primero || (x > 0 && celdaEn(img, x - 1, y) === primero))
                continue;
            const p = firmaEn(img, x, y, s);
            if (p === 0)
                continue;
            const g = { x0: x, y0: y, paso: p };
            if (p < s.pasoMin) {
                pequena ??= g;
                continue;
            }
            if (!halladas.some((f) => Math.abs(f.x0 - g.x0) < 1 && Math.abs(f.paso - g.paso) < 0.3 && Math.abs(f.y0 - g.y0) < p))
                halladas.push(g);
        }
    }
    return { halladas, pequena };
}
/** Afina x0 y el paso con un ajuste de mínimos cuadrados de los cambios de color de la primera fila de celdas. */
function afinar(img, g0, s) {
    const g = { ...g0 };
    const y = Math.floor(g.y0 + 0.5 * g.paso);
    if (y < 0 || y >= img.alto)
        return g;
    for (const maxCeldas of [3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, s.celdas]) {
        const xFin = Math.min(img.ancho, Math.floor(g.x0 + maxCeldas * g.paso));
        let n = 0;
        let sk = 0;
        let st = 0;
        let skk = 0;
        let skt = 0;
        let ultimoK = -1;
        let previo = celdaEn(img, Math.max(0, Math.floor(g.x0)), y);
        for (let x = Math.max(0, Math.floor(g.x0)) + 1; x < xFin; x++) {
            const v = celdaEn(img, x, y);
            if (v === previo)
                continue;
            const kf = (x - g.x0) / g.paso;
            const k = Math.round(kf);
            if (k >= 1 && Math.abs(kf - k) < 0.35 && k !== ultimoK) {
                n++;
                sk += k;
                st += x;
                skk += k * k;
                skt += k * x;
                ultimoK = k;
            }
            previo = v;
        }
        if (n < 3)
            continue;
        const den = n * skk - sk * sk;
        if (den <= 0)
            continue;
        const p = (n * skt - sk * st) / den;
        const x0 = (st - p * sk) / n;
        if (p > s.pasoMin && p < s.pasoMax && Math.abs(p - g.paso) < g.paso * 0.2) {
            g.paso = p;
            g.x0 = x0;
        }
    }
    return g;
}
/**
 * Busca la franja en la imagen y la decodifica.
 *
 * Uso en la captura: llama primero a `pareceFranja(imagen)` (barata) y no sigas si da falso; pasa siempre la `pista`
 * guardada (la `geometria` de la última decodificación buena), que evita la búsqueda completa. La búsqueda completa
 * recorre todos los píxeles: en una imagen ruidosa de 1920 × 1080 tarda de 60 a 73 ms (medidas reales de la tarea 2; la
 * prueba de tiempo de codec.test.js deja un margen amplio y se salta con SNF_SIN_PRUEBAS_DE_TIEMPO=1).
 *
 * La franja tiene que haberse pintado alineada a píxeles enteros (celdas de 2 px en posiciones enteras de la pantalla
 * física): con celdas tan pequeñas solo hay un píxel limpio por celda y una franja a medio píxel mezcla los colores de
 * celdas vecinas (el descodificador aguanta algo de mezcla en los bordes, pero no es lo que se quiere en el juego).
 *
 * «opciones» cambia valores de ESPEC. Una candidata solo da «rechazada» si además es coherente (los puntos de dentro de
 * sus primeras celdas coinciden con el centro); si no, se sigue buscando y, al final, «nada».
 * → {tipo: 'nada'} | {tipo: 'rechazada', motivo: 'suma'|'longitud'|'cortada'|'paso_pequeno', geometria}
 *   | {tipo: 'decodificada', id, bytes, geometria}
 */
export function buscarYDecodificar(img, pista = null, opciones = {}) {
    const s = espec(opciones);
    let rechazada = null;
    const apuntar = (r) => {
        if (r.tipo === 'rechazada' && !rechazada && coherente(img, r.geometria, s))
            rechazada = r;
    };
    if (pista) {
        const r = decodificarEn(img, pista, s);
        if (r.tipo === 'decodificada')
            return r;
        apuntar(r);
    }
    const { halladas, pequena } = candidatas(img, s);
    for (const est of halladas) {
        const f = afinar(img, est, s);
        // El ajuste, retoques de un eje a su alrededor y la estimación en bruto: como mucho 13 intentos por candidata,
        // para que una franja dañada no se coma la CPU.
        const intentos = [f,
            ...[0.005, -0.005, 0.01, -0.01, 0.02, -0.02].map((dp) => ({ ...f, paso: f.paso + dp })),
            ...[1, -1, 2].map((dy) => ({ ...f, y0: f.y0 + dy })),
            ...[0.5, -0.5].map((dx) => ({ ...f, x0: f.x0 + dx })),
            est];
        for (const g of intentos) {
            const r = decodificarEn(img, g, s);
            if (r.tipo === 'decodificada')
                return r;
            apuntar(r);
        }
    }
    if (rechazada)
        return rechazada;
    if (pequena && decodificarEn(img, pequena, s).tipo !== 'nada' && coherente(img, pequena, s)) {
        return { tipo: 'rechazada', motivo: 'paso_pequeno', geometria: pequena };
    }
    return { tipo: 'nada' };
}
// Para pareceFranja: salto entre filas. Es 1 (se mira cada fila) porque con un desfase de medio píxel solo una fila de cada
// celda de 2 px queda sin mezclar; un salto de 2 podría caer siempre en la fila mezclada.
const SALTO_FILAS = 1;
/**
 * ¿Parece haber una franja en la imagen? Comprobación barata de antes de decodificar: busca, en todas las filas de
 * toda la imagen (SALTO_FILAS = 1), el principio de la magia (cinco tramos de color seguidos, de ancho parecido). En ruido de 1920 × 1080
 * y 2560 × 1080 no da falsos positivos (la prueba usa 50 semillas); como filtro, si diera alguno solo costaría una búsqueda
 * completa, que a su vez da «nada».
 */
export function pareceFranja(img, opciones = {}) {
    const s = espec(opciones);
    const primero = VALORES_MAGIA[0];
    for (let y = 0; y < img.alto; y += SALTO_FILAS) {
        for (let x = 0; x < img.ancho; x++) {
            if (celdaEn(img, x, y) !== primero || (x > 0 && celdaEn(img, x - 1, y) === primero))
                continue;
            if (firmaEn(img, x, y, s) > 0)
                return true;
        }
    }
    return false;
}
