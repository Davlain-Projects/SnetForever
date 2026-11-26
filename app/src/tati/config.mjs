// Configuración del puente con TATI: lee `puenteTati` de `config.json` y guarda el cerebro elegido.
// Apagado por defecto: sin `puenteTati.activo === true` todo se comporta como siempre.
import { join } from 'node:path';
import * as fsReal from 'node:fs';
import { escribirAtomico } from '../buzon.mjs';
import { cuarentenaNueva } from '../rutas.mjs';
export const CARPETA_PUENTE = 'puente-tati';
const CEREBROS = ['snetforever', 'tati'];
/** Carpeta del puente dentro de la de datos. */
export function carpetaPuente(datos) {
    return join(datos, CARPETA_PUENTE);
}
/** Estado del puente según la config: activo solo con `true` exacto; cerebro `tati` solo si es exactamente eso y activo. */
export function puenteDe(config) {
    const p = config && typeof config === 'object' ? config.puenteTati : null;
    const activo = !!p && typeof p === 'object' && p.activo === true;
    return { activo, cerebro: activo && p.cerebro === 'tati' ? 'tati' : 'snetforever' };
}
/**
 * Guarda `config.puenteTati.cerebro` en `datos/config.json`, de forma atómica y conservando lo demás. Una config que no se
 * puede leer va a `datos/cuarentena/`. Un valor fuera de los dos lanza un error con `code: 'VALOR'`.
 */
export async function guardarCerebro(datos, valor, { fs = fsReal, entorno = process.env } = {}) {
    if (!CEREBROS.includes(valor))
        throw Object.assign(new Error('cerebro no válido'), { code: 'VALOR' });
    const ruta = join(datos, 'config.json');
    const cuarentena = () => cuarentenaNueva({ ...entorno, SNF_DATOS: datos });
    let config = {};
    if (fs.existsSync(ruta)) {
        let valida = false;
        try {
            const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
            if (j && typeof j === 'object' && !Array.isArray(j)) {
                config = j;
                valida = true;
            }
        }
        catch {
            // se aparta abajo
        }
        if (!valida)
            fs.renameSync(ruta, join(cuarentena(), 'config.json'));
    }
    fs.mkdirSync(datos, { recursive: true });
    const previo = config.puenteTati && typeof config.puenteTati === 'object' && !Array.isArray(config.puenteTati) ? config.puenteTati : {};
    const mover = (origen, nombre) => fs.renameSync(origen, join(cuarentena(), nombre));
    await escribirAtomico(fs, ruta, JSON.stringify({ ...config, puenteTati: { ...previo, cerebro: valor } }, null, 2), { mover });
}
