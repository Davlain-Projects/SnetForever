// Servidor de herramientas: los nombres fijos y el «turno» (lo que el servidor sabe del personaje en cada pregunta).
//
// La app escribe <datos>\herramientas\turno.json antes de cada pregunta con herramientas (tarea 14); el servidor, que
// Claude Code arranca para esa pregunta, lo lee cuando lo necesita (fuentes.mjs). Sale de `mensaje.ctx`, lo que manda el
// addon; `mensaje.pj` (el nombre del personaje) no se copia nunca.
//
//   turnoDe(mensaje, {carpetaBase}) -> Turno   (revisión final: sin la carpeta AddOns, que el servidor no usa)
//   Turno = {version: 1, carpetaBase, idioma, pj: {faccion, raza, clase (en mayúsculas), nivel},
//            lugar: {mapa, x, y, zona, subzona, instancia}, registro: [q], vuelos: [nombre], vuelosIds: [id] | null}
//   escribirTurno(datos, turno, {fs}) -> Promise<void>   (temporal y renombre; lo que falla va a la cuarentena)
//
// Tarea 13: <datos>\herramientas\mcp.json, el único servidor MCP que ve Claude Code en una pregunta con herramientas
// (`--strict-mcp-config --mcp-config <ruta>`). Fijo, como mcp-vacio.json: en cada pregunta se comprueba que sea
// exactamente el esperado y, si no, el cambiado va a la cuarentena y se escribe de nuevo.
//   asegurarMcpHerramientas(datos, {node, servidor, fs}) -> ruta
import * as fsReal from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { escribirAtomico } from '../buzon.mjs';
import { cuarentenaNueva } from '../rutas.mjs';
import { cortar } from '../texto.mjs';
export const NOMBRE_SERVIDOR = 'snetforever';
export const HERRAMIENTAS = ['buscar_guias', 'leer_guia', 'misiones_zona', 'mision', 'pnj', 'como_llegar', 'guardar_guia'];
// 22-nov: Codex solo recibe las que leen; `guardar_guia` es la única que escribe.
export const HERRAMIENTAS_LECTURA = HERRAMIENTAS.filter((h) => h !== 'guardar_guia');
export const SOLO_LECTURA = '--solo-lectura';
export const CARPETA_HERRAMIENTAS = 'herramientas';
export const rutaTurno = (datos) => join(datos, CARPETA_HERRAMIENTAS, 'turno.json');
// Ruta absoluta de servidor.mjs (el que arranca Claude Code con el node de la app).
export const SERVIDOR = fileURLToPath(new URL('./servidor.mjs', import.meta.url));
export const rutaMcp = (datos) => join(datos, CARPETA_HERRAMIENTAS, 'mcp.json');
const MAX_TEXTO = 100; // caracteres de un nombre de zona, raza o vuelo
const MAX_REGISTRO = 50; // misiones del registro (el del juego tiene 25 como mucho)
const MAX_VUELOS = 200;
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const entero = (v, min = 1) => (Number.isInteger(v) && v >= min ? v : null);
const coordenada = (v) => (esNumero(v) && v >= 0 && v <= 100 ? v : null);
const texto = (v) => {
    if (typeof v !== 'string')
        return null;
    const t = cortar(v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim(), MAX_TEXTO);
    return t === '' ? null : t;
};
const lista = (v) => (Array.isArray(v) ? v : []);
/** El turno de las herramientas a partir del mensaje del addon (solo `mensaje.ctx` e `idioma`; nunca `mensaje.pj`). */
export function turnoDe(mensaje, { carpetaBase = null } = {}) {
    const ctx = mensaje?.ctx && typeof mensaje.ctx === 'object' ? mensaje.ctx : {};
    const pj = ctx.pj && typeof ctx.pj === 'object' ? ctx.pj : {};
    const lugar = ctx.lugar && typeof ctx.lugar === 'object' ? ctx.lugar : {};
    const registro = [];
    for (const r of lista(ctx.registro)) {
        const q = entero(r?.q);
        if (q !== null && !registro.includes(q) && registro.length < MAX_REGISTRO)
            registro.push(q);
    }
    const vuelos = lista(ctx.vuelos).map(texto).filter(Boolean).slice(0, MAX_VUELOS);
    const vuelosIds = Array.isArray(ctx.vuelosIds)
        ? [...new Set(ctx.vuelosIds.map((v) => entero(v)).filter((v) => v !== null))].slice(0, MAX_VUELOS)
        : null;
    return {
        version: 1,
        carpetaBase: typeof carpetaBase === 'string' && carpetaBase !== '' ? carpetaBase : null,
        idioma: mensaje?.idioma === 'en' ? 'en' : 'es',
        pj: {
            faccion: texto(pj.faccion),
            raza: texto(pj.raza),
            clase: texto(pj.clase)?.toUpperCase() ?? null,
            nivel: entero(pj.nivel),
        },
        lugar: {
            mapa: entero(lugar.mapa),
            x: coordenada(lugar.x),
            y: coordenada(lugar.y),
            zona: texto(lugar.zona),
            subzona: texto(lugar.subzona),
            instancia: lugar.instancia === true,
        },
        registro,
        vuelos,
        vuelosIds,
    };
}
/** Escribe el turno en <datos>\herramientas\turno.json (temporal y renombre). */
export async function escribirTurno(datos, turno, { fs = fsReal } = {}) {
    fs.mkdirSync(join(datos, CARPETA_HERRAMIENTAS), { recursive: true });
    await escribirAtomico(fs, rutaTurno(datos), JSON.stringify(turno), {
        mover: (origen, nombre) => fs.renameSync(origen, join(cuarentenaNueva({ ...process.env, SNF_DATOS: datos }), nombre)),
    });
}
/** El servidor para Codex: el mismo, con solo las herramientas que leen. Codex lo recibe por `-c`, sin archivo. */
export function mcpCodex(datos, { node = process.execPath, servidor = SERVIDOR } = {}) {
    return { command: node, args: [servidor, '--datos', datos, SOLO_LECTURA], nombres: HERRAMIENTAS_LECTURA };
}
/**
 * Deja en <datos>\herramientas\mcp.json exactamente
 * {"mcpServers":{"snetforever":{"type":"stdio","command":<node>,"args":[<servidor>,"--datos",<datos>],"env":{}}}}
 * (JSON.stringify: las barras de Windows van bien escapadas). Si el que hay es otro, va a la cuarentena (nunca se borra)
 * y se escribe de nuevo, con un temporal en la misma carpeta y su renombre (nunca queda un mcp.json a medias). Devuelve la
 * ruta. Si no puede, LANZA el error (el temporal, si quedó, va a la cuarentena): quien pregunta (tarea 14) lo captura y
 * pregunta sin herramientas.
 */
export function asegurarMcpHerramientas(datos, { node = process.execPath, servidor = SERVIDOR, fs = fsReal } = {}) {
    const contenido = JSON.stringify({
        mcpServers: { [NOMBRE_SERVIDOR]: { type: 'stdio', command: node, args: [servidor, '--datos', datos], env: {} } },
    });
    fs.mkdirSync(join(datos, CARPETA_HERRAMIENTAS), { recursive: true });
    const ruta = rutaMcp(datos);
    const cuarentena = () => cuarentenaNueva({ ...process.env, SNF_DATOS: datos });
    if (fs.existsSync(ruta) && fs.readFileSync(ruta, 'utf8') !== contenido)
        fs.renameSync(ruta, join(cuarentena(), 'mcp.json'));
    if (!fs.existsSync(ruta)) {
        const temporal = `${ruta}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
        try {
            fs.writeFileSync(temporal, contenido, { encoding: 'utf8', flag: 'wx' });
            fs.renameSync(temporal, ruta);
        }
        catch (e) {
            try {
                if (fs.existsSync(temporal))
                    fs.renameSync(temporal, join(cuarentena(), basename(temporal)));
            }
            catch {
                // sin cuarentena: el error que importa es el de la escritura
            }
            throw e;
        }
    }
    return ruta;
}
