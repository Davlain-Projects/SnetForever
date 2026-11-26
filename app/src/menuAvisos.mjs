// Los avisos de fallo desde el menú de la bandeja (fase 5, tarea 13; sacado de principal.mjs en la ronda 1). Cuenta los que
// quedan por mandar y los manda como pide F5-3: primero «Guardar en un archivo» (avisos_archivo) y «Copiar al
// portapapeles» (avisos_copiar), que marcan todos como enviados, y en segundo lugar «Abrir una incidencia en GitHub»
// (avisos), que marca solo los que caben en la URL (los `incluidos` de urlIssue). La app no envía nada: lo hace el jugador.
import { dirname } from 'node:path';
import { archivoAvisos, leerFallos, marcarEnviados, pendientes, textoAvisos, urlIssue } from './avisos.mjs';
import { abrirCarpeta as abrirCarpetaReal, abrirUrl as abrirUrlReal, copiarAlPortapapeles } from './navegador.mjs';
import { leerConfig } from './rutas.mjs';
import { log } from './registro.mjs';
/** La carpeta `_forever_` de una carpeta `…\_forever_\Interface\AddOns`, o null si no tiene esa forma. */
export function raizDelJuego(addonsDir) {
    const a = typeof addonsDir === 'string' ? addonsDir.replace(/[\\/]+$/, '') : '';
    return /(?:^|[\\/])Interface[\\/]AddOns$/i.test(a) ? dirname(dirname(a)) : null;
}
/**
 * @param {object} p
 * @param {object} p.env el entorno (carpeta de datos y config.json)
 * @param {'es'|'en'} p.idioma el de los textos de los avisos
 * @param {Function} [p.abrirUrl] [p.abrirCarpeta] [p.copiar] los de navegador.mjs; solo se cambian en las pruebas
 * @returns {{pendientes: (addonsDir: string|null) => object[], mandar: (como: string, addonsDir: string|null) =>
 *   Promise<{ok: boolean, marcados: number}>}} `mandar` nunca lanza: si algo falla, `ok: false` (y queda en el registro)
 */
export function crearMenuAvisos({ env, idioma, abrirUrl = abrirUrlReal, abrirCarpeta = abrirCarpetaReal, copiar = copiarAlPortapapeles }) {
    // Los que quedan por mandar, de todas las cuentas del juego (en solo lectura).
    function pendientesDe(addonsDir) {
        const raiz = raizDelJuego(addonsDir);
        if (!raiz)
            return [];
        try {
            return pendientes(leerFallos(raiz, { env }), { env });
        }
        catch (e) {
            log('aviso', `avisos: no se pudieron leer (${e?.code || 'ERROR'})`);
            return [];
        }
    }
    async function mandar(como, addonsDir) {
        const lista = pendientesDe(addonsDir);
        if (lista.length === 0)
            return { ok: true, marcados: 0 };
        try {
            let marcar;
            if (como === 'avisos') {
                const repo = leerConfig(env).actualizaciones?.repo;
                const { url, incluidos } = urlIssue(repo, lista, idioma);
                if (!url || !abrirUrl(url, { repo, env }))
                    throw Object.assign(new Error('no se abrió el navegador'), { code: 'NAVEGADOR' });
                marcar = incluidos;
            }
            else if (como === 'avisos_archivo') {
                const ruta = archivoAvisos(lista, { env, idioma });
                marcar = lista.map((a) => a.id);
                if (!abrirCarpeta(dirname(ruta), { env }))
                    log('aviso', 'avisos: el archivo está guardado, pero no se pudo abrir su carpeta');
            }
            else if (como === 'avisos_copiar') {
                if (!(await copiar(textoAvisos(lista, idioma), { env })))
                    throw Object.assign(new Error('no se copió'), { code: 'PORTAPAPELES' });
                marcar = lista.map((a) => a.id);
            }
            else {
                throw Object.assign(new Error('acción desconocida'), { code: 'ACCION' });
            }
            marcarEnviados(marcar, { env });
            log('info', `avisos: ${como} (${marcar.length})`);
            return { ok: true, marcados: marcar.length };
        }
        catch (e) {
            log('aviso', `avisos: ${como} no se pudo (${e?.code || 'ERROR'})`);
            return { ok: false, marcados: 0 };
        }
    }
    return { pendientes: pendientesDe, mandar };
}
