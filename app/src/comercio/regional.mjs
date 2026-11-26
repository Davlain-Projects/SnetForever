// Precio regional: el equivalente de DBRegionMarketAvg de TSM, calculado con la API de Blizzard y sin la app de TSM.
//
// QUÉ ES. TSM saca de sus servidores la media de mercado de toda la región (todas las casas de Forever-US). Aquí se hace lo
// mismo con las fotos que da la API: la región de Forever tiene 15 casas (CASAS en casas.mjs: 5 de cada bando). Las que
// sigue el jugador ya se bajan cada hora; las demás se bajan de una en una, por turnos, una por hora (ver programador.mjs).
//
// CÓMO SE CALCULA.
//   · De cada foto que entra se guarda el valor de la hora de cada objeto (`valoresDeFoto`, la misma regla que el
//     historial: el tramo barato sin los raros). Por casa se guardan las últimas FOTOS_POR_CASA fotos que traían algo.
//   · Una casa que el jugador sigue entra como mucho una vez cada CADA_PROPIA_S (12 h): así todas las casas cuentan con
//     fotos de unos días y no pesa más la propia por tener una foto cada hora.
//   · Valor de una casa para un objeto: la mediana de sus valores en las fotos de esa casa que no tienen más de VIGENCIA_S
//     (7 días). Una hora rara no lo mueve.
//   · Precio regional: la MEDIANA de los valores de las casas que tienen el objeto. Con el objeto en una sola casa, es el
//     de esa casa. Medido el 26-11 contra DBRegionMarketAvg de TSM en el juego (6.499 objetos): con la media simple las
//     casas pequeñas (la 121 y la 125, con ~1.000 subastas, frente a ~130.000 de las grandes) subían el precio un 25 % en
//     la mediana; con la mediana entre casas queda centrado (cociente 1,00, cuartiles 0,86-1,16).
// No se inventa nada: un objeto que ninguna casa vigente trae no tiene precio regional.
//
// Archivo: `<carpeta>/regional.json.gz` = {v: 1, casas: {[casa]: {probada, fotos: [{hora, items: [...], valores: [...]}]}}}
// (`hora` y `probada` en segundos; `items` ordenados). Uno roto se aparta al lado (`.roto-<ms>`), nunca se borra.
//
// crearRegional({fs, carpeta, opciones?, registrar?}) -> {
//   anotar(casa, hora, subastas, mercancias, {cada?}) -> boolean   añade la foto (false si no trae nada o es de hace menos
//                                                                  de `cada` segundos respecto a la última de la casa)
//   probada(casa, hora)                                            apunta que se intentó (para el turno), sin foto
//   siguiente(candidatas, excluir) -> casa | null                  la candidata (no excluida) que hace más que no se mira
//   valores(ahora) -> {valores: {[item]: cobre}, casas, desde, hora} | null   el precio regional de cada objeto
//   guardar() -> Promise, resumen() -> {[casa]: {fotos, ultima}}
// }
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { escribirAtomico } from '../buzon.mjs';
import { valoresDeFoto } from './historial.mjs';
const VERSION = 1;
const HORA_S = 3600;
export const FOTOS_POR_CASA = 6;
export const VIGENCIA_S = 7 * 24 * HORA_S;
export const CADA_PROPIA_S = 12 * HORA_S;
const vacio = () => ({ v: VERSION, casas: {} });
const entero = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0);
function fotoValida(f) {
    return !!f && Number.isFinite(f.hora) && Array.isArray(f.items) && Array.isArray(f.valores) && f.items.length === f.valores.length;
}
function mediana(nums) {
    const o = Float64Array.from(nums).sort();
    const m = o.length >> 1;
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
export function crearRegional({ fs, carpeta, opciones = {}, registrar = (() => { }) }) {
    const ruta = join(carpeta, 'regional.json.gz');
    let est = null;
    function cargar() {
        est = vacio();
        let buf;
        try {
            buf = fs.readFileSync(ruta);
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                registrar('aviso', `comercio: el precio regional no se pudo leer (${e.code || 'ERROR'}); se empieza de cero en memoria`);
            return est;
        }
        try {
            const j = JSON.parse(gunzipSync(buf).toString('utf8'));
            if (!j || j.v !== VERSION || typeof j.casas !== 'object')
                throw new Error('formato');
            for (const [casa, c] of Object.entries(j.casas)) {
                const fotos = Array.isArray(c?.fotos) ? c.fotos.filter(fotoValida).slice(-FOTOS_POR_CASA) : [];
                est.casas[casa] = { probada: entero(c?.probada), fotos };
            }
        }
        catch {
            try {
                fs.renameSync(ruta, `${ruta}.roto-${Date.now()}`);
            }
            catch {
                // si ni así se puede, se sobrescribirá al guardar
            }
            est = vacio();
            registrar('aviso', 'comercio: el archivo del precio regional estaba roto; se ha apartado y se empieza de cero');
        }
        return est;
    }
    const estado = () => est || cargar();
    const casaDe = (casa) => {
        const e = estado();
        const k = String(casa);
        return (e.casas[k] ||= { probada: 0, fotos: [] });
    };
    function probada(casa, hora) {
        const c = casaDe(casa);
        c.probada = Math.max(c.probada, entero(hora));
    }
    function anotar(casa, hora, subastas, mercancias, { cada = 0 } = {}) {
        const h = entero(hora);
        const c = casaDe(casa);
        const ultima = c.fotos.at(-1);
        if (ultima && (h <= ultima.hora || h - ultima.hora < cada))
            return false;
        probada(casa, h);
        const valores = valoresDeFoto(subastas, mercancias);
        if (valores.size === 0)
            return false;
        const items = [...valores.keys()].sort((a, b) => a - b);
        c.fotos.push({ hora: h, items, valores: items.map((i) => valores.get(i)) });
        if (c.fotos.length > FOTOS_POR_CASA)
            c.fotos.splice(0, c.fotos.length - FOTOS_POR_CASA);
        return true;
    }
    // La candidata que hace más que no se mira (ni foto ni intento); a igualdad, la de número menor.
    function siguiente(candidatas, excluir = []) {
        const fuera = new Set((excluir || []).map(Number));
        let mejor = null;
        let cuando = Infinity;
        for (const casa of [...(candidatas || [])].map(Number).sort((a, b) => a - b)) {
            if (!Number.isFinite(casa) || fuera.has(casa))
                continue;
            const c = estado().casas[String(casa)];
            const t = Math.max(c?.probada ?? 0, c?.fotos.at(-1)?.hora ?? 0);
            if (t < cuando) {
                mejor = casa;
                cuando = t;
            }
        }
        return mejor;
    }
    function valores(ahora) {
        const corte = entero(ahora) - VIGENCIA_S;
        const porCasa = new Map(); // item -> el valor de cada casa que lo tiene
        let casas = 0;
        let desde = Infinity;
        let hora = 0;
        for (const c of Object.values(estado().casas)) {
            const vigentes = c.fotos.filter((f) => f.hora >= corte);
            if (vigentes.length === 0)
                continue;
            const porItem = new Map();
            for (const f of vigentes) {
                desde = Math.min(desde, f.hora);
                hora = Math.max(hora, f.hora);
                for (let i = 0; i < f.items.length; i++) {
                    const v = f.valores[i];
                    if (!(v > 0))
                        continue;
                    const lista = porItem.get(f.items[i]);
                    if (lista)
                        lista.push(v);
                    else
                        porItem.set(f.items[i], [v]);
                }
            }
            if (porItem.size === 0)
                continue;
            casas += 1;
            for (const [item, lista] of porItem) {
                const v = mediana(lista);
                const deCasas = porCasa.get(item);
                if (deCasas)
                    deCasas.push(v);
                else
                    porCasa.set(item, [v]);
            }
        }
        if (casas === 0)
            return null;
        const salida = {};
        for (const [item, valores] of porCasa)
            salida[item] = Math.max(1, Math.round(mediana(valores)));
        return { valores: salida, casas, desde, hora };
    }
    async function guardar() {
        fs.mkdirSync(carpeta, { recursive: true });
        await escribirAtomico(fs, ruta, gzipSync(Buffer.from(JSON.stringify(estado()), 'utf8'), { level: 6 }), opciones);
    }
    function resumen() {
        const salida = {};
        for (const [casa, c] of Object.entries(estado().casas))
            salida[casa] = { fotos: c.fotos.length, ultima: c.fotos.at(-1)?.hora ?? 0 };
        return salida;
    }
    return { anotar, probada, siguiente, valores, guardar, resumen };
}
