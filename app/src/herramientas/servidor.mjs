// Servidor de herramientas (MCP por stdio). Claude Code lo arranca en cada pregunta con herramientas:
//
//   node servidor.mjs --datos <carpeta de datos de la app>
//
// Lee un mensaje JSON-RPC por línea de stdin y escribe una respuesta por línea en stdout, en orden. Salta las líneas en
// blanco (y quita el \r del final). Solo lee el turno, la base y la biblioteca (fuentes.mjs), y solo cuando una
// herramienta los pide. La única que escribe es guardar_guia (biblioteca/guardar.mjs): en <datos>\guias\, el índice y
// una línea de registro sin direcciones ni nombres. Reindexa con su propio índice (crearIndice sobre el mismo archivo que
// el de la app, que además lo ve por su vigilancia de la carpeta) y solo si hay base: sin ella la pasada volvería a leer
// todas las guías sin poder resolver sus zonas. Los errores de arranque van a stderr sin rutas.
import { createInterface } from 'node:readline';
import * as fs from 'node:fs';
import { crearServidorMcp } from './protocolo.mjs';
import { crearFuentes } from './fuentes.mjs';
import { crearCatalogo } from './catalogo.mjs';
import { NOMBRE_SERVIDOR, HERRAMIENTAS, HERRAMIENTAS_LECTURA, SOLO_LECTURA } from './config.mjs';
import { crearIndice } from '../biblioteca/indice.mjs';
import { guardarGuia } from '../biblioteca/guardar.mjs';
import { VERSION } from '../version.mjs';
function carpetaDeDatos(argv) {
    const i = argv.indexOf('--datos');
    const v = i >= 0 ? argv[i + 1] : undefined;
    return typeof v === 'string' && v !== '' && !v.startsWith('--') ? v : null;
}
const datos = carpetaDeDatos(process.argv.slice(2));
if (!datos) {
    process.stderr.write('Uso: node servidor.mjs --datos <carpeta>\n');
    process.exitCode = 2;
}
else {
    // Solo las de HERRAMIENTAS (las siete que Claude tiene permitidas): `instrucciones` es para TATI; este chat ya lleva
    // sistema.md entero.
    const fuentes = crearFuentes({ datos });
    let indice = null;
    const reindexar = async () => {
        const base = fuentes.base();
        if (!base)
            return null;
        indice ??= crearIndice({ datos, fs, base: async () => base });
        await indice.actualizar();
        return indice.indice();
    };
    // 22-nov: con --solo-lectura (Codex) no existe guardar_guia: ni se anuncia ni se puede llamar.
    const soloLectura = process.argv.includes(SOLO_LECTURA);
    if (!soloLectura)
        fuentes.guardarGuia = (args, { idioma }) => guardarGuia(args, { datos, fs, idioma, reindexar });
    const permitidas = soloLectura ? HERRAMIENTAS_LECTURA : HERRAMIENTAS;
    const herramientas = crearCatalogo(fuentes).filter((h) => permitidas.includes(h.nombre));
    const servidor = crearServidorMcp({ nombre: NOMBRE_SERVIDOR, version: VERSION, herramientas });
    const lineas = createInterface({ input: process.stdin, crlfDelay: Infinity });
    let cola = Promise.resolve();
    lineas.on('line', (cruda) => {
        const linea = cruda.endsWith('\r') ? cruda.slice(0, -1) : cruda;
        if (linea.trim() === '')
            return;
        cola = cola.then(async () => {
            let respuesta;
            try {
                respuesta = await servidor.manejar(linea);
            }
            catch {
                respuesta = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Error interno.' } });
            }
            if (respuesta !== null)
                process.stdout.write(respuesta + '\n');
        });
    });
}
