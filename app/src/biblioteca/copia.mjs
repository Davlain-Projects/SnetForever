// Biblioteca de guías: la primera copia de las guías del juego a <datos>\guias\. Solo COPIA desde AddOns (nunca abre nada
// de allí para escribir):
//   SnetForever_MisGuias\mis-guias.lua   -> Mis guías\mis-guias.lua
//   SnetForever_Misiones\guias_*.lua     -> Del addon\SnetForever_Misiones\
//   SnetForever_Rutas\guias_*.lua        -> Del addon\SnetForever_Rutas\
//
//   copiarDelJuego({datos, addonsDir, fs}) -> Promise<{copiados: [archivo destino, relativo a guias], apartados: number}>
//
// <datos>\biblioteca\copias.json apunta la firma (mtime:size) de cada origen ya copiado. Un origen que no cambió no se
// vuelve a copiar aunque el jugador haya movido o quitado la copia. Si cambió, la copia anterior (si sigue en su sitio)
// va a la cuarentena y se copia la nueva: a un temporal con COPYFILE_EXCL y se renombra. Sin addonsDir o sin alguno de
// los addons copia lo que haya y no falla. El registro solo lleva contadores.
import * as fsReal from 'node:fs';
import { join, dirname, basename, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CARPETA_GUIAS } from './indice.mjs';
import { ARCHIVO_MIS_GUIAS } from '../misguias.mjs';
import { escribirAtomico } from '../buzon.mjs';
import { cuarentenaNueva } from '../rutas.mjs';
import { log } from '../registro.mjs';
export const RUTA_COPIAS = join('biblioteca', 'copias.json');
const GRUPO_ADDON = 'Del addon';
const ADDONS_CON_GUIAS = ['SnetForever_Misiones', 'SnetForever_Rutas'];
const firmaDe = (st) => `${Math.floor(st.mtimeMs)}:${st.size}`;
// Lo que hay que copiar: [{origen (relativo a AddOns, con «/»), destino (relativo a guias, con «/»)}].
function candidatos(fs, addonsDir) {
    const lista = [];
    const esArchivo = (ruta) => {
        try {
            return fs.statSync(ruta).isFile();
        }
        catch {
            return false;
        }
    };
    const mis = ARCHIVO_MIS_GUIAS.split(sep).join('/');
    if (esArchivo(join(addonsDir, ARCHIVO_MIS_GUIAS)))
        lista.push({ origen: mis, destino: 'Mis guías/mis-guias.lua' });
    for (const addon of ADDONS_CON_GUIAS) {
        let nombres = [];
        try {
            nombres = fs.readdirSync(join(addonsDir, addon));
        }
        catch {
            continue;
        }
        for (const nombre of nombres.filter((n) => /^guias_.*\.lua$/i.test(n)).sort()) {
            if (esArchivo(join(addonsDir, addon, nombre))) {
                lista.push({ origen: `${addon}/${nombre}`, destino: `${GRUPO_ADDON}/${addon}/${nombre}` });
            }
        }
    }
    return lista;
}
function leerCopias(fs, ruta) {
    try {
        const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
        if (j && j.version === 1 && j.firmas && typeof j.firmas === 'object' && !Array.isArray(j.firmas))
            return j;
    }
    catch {
        // no hay copias.json o está roto: se empieza de cero
    }
    return { version: 1, firmas: {} };
}
export async function copiarDelJuego({ datos, addonsDir, fs = fsReal } = {}) {
    const copiados = [];
    let apartados = 0;
    if (!addonsDir)
        return { copiados, apartados };
    const raiz = join(datos, CARPETA_GUIAS);
    const rutaCopias = join(datos, RUTA_COPIAS);
    const copias = leerCopias(fs, rutaCopias);
    let cuarentena = null;
    let cambiado = false;
    for (const { origen, destino } of candidatos(fs, addonsDir)) {
        const rutaOrigen = join(addonsDir, ...origen.split('/'));
        let firma;
        try {
            firma = firmaDe(fs.statSync(rutaOrigen));
        }
        catch {
            continue;
        }
        if (copias.firmas[origen] === firma)
            continue;
        const rutaDestino = join(raiz, ...destino.split('/'));
        const temporal = join(dirname(rutaDestino), `${basename(rutaDestino)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
        try {
            fs.mkdirSync(dirname(rutaDestino), { recursive: true });
            fs.copyFileSync(rutaOrigen, temporal, fs.constants.COPYFILE_EXCL);
            if (fs.existsSync(rutaDestino)) {
                cuarentena = cuarentena || cuarentenaNueva({ ...process.env, SNF_DATOS: datos });
                fs.renameSync(rutaDestino, join(cuarentena, `${apartados}-${basename(rutaDestino)}`));
                apartados++;
            }
            fs.renameSync(temporal, rutaDestino);
        }
        catch (e) {
            try {
                if (fs.existsSync(temporal)) {
                    cuarentena = cuarentena || cuarentenaNueva({ ...process.env, SNF_DATOS: datos });
                    fs.renameSync(temporal, join(cuarentena, basename(temporal)));
                }
            }
            catch {
                // sin cuarentena: el temporal queda donde está
            }
            log('aviso', `biblioteca: no se pudo copiar una guía (${e?.code ?? 'error'})`);
            continue;
        }
        copias.firmas[origen] = firma;
        copiados.push(destino);
        cambiado = true;
    }
    if (cambiado) {
        try {
            fs.mkdirSync(dirname(rutaCopias), { recursive: true });
            await escribirAtomico(fs, rutaCopias, JSON.stringify(copias));
        }
        catch (e) {
            log('aviso', `biblioteca: no se pudo guardar copias.json (${e?.code ?? 'error'})`);
        }
    }
    if (copiados.length || apartados)
        log('info', `biblioteca: ${copiados.length} guías copiadas del juego, ${apartados} apartadas`);
    return { copiados, apartados };
}
