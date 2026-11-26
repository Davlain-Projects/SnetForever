// Bandeja del sistema (tarea 20): lanza el ayudante de PowerShell (ayudantes/bandeja.ps1), que solo es el icono y su menú,
// y habla con él por líneas JSON (ver la cabecera del .ps1). Si el ayudante muere solo, se vuelve a lanzar y se le repite lo
// último que se le dijo. Aquí no se escribe ningún archivo.
//
// lanzarBandeja({script?, alMenu?, textos?, lanzar?, powershell?, esperas?, esperaSalida?})
// (tras 5 fallos seguidos, un intento por minuto: `esperaLarga`)
//   -> {estado(texto, icono = 'ok', {lineas = [], tooltip}), globo(titulo, texto), motor(valor),
//       entradas({actualizacion, avisos, version}), inicio(activo), cerebro({visible, valor}), parar() -> Promise}
//   alMenu(accion, valor): 'comprobar' | 'registro' | 'carpeta' | 'salir' | 'motor' (con valor 'auto' | 'claude' | 'codex')
//     y, desde la fase 5 (F5 y F5-3), 'actualizar' | 'avisos' (la issue de GitHub) | 'avisos_archivo' | 'avisos_copiar'
//     y, de la biblioteca de guías, 'guias' (abrir la carpeta) | 'enlace' (añadir el del portapapeles) | 'enlaces' (actualizarlos)
//     y, del puente con TATI (S8), 'cerebro' (con valor 'snetforever' | 'tati') | 'complemento_tati'
//   inicio(activo): la marca de «Arrancar con Windows» (comercio, Task 8), la línea {"t":"inicio","valor":true|false}
//     (se repite al relanzar); su acción del menú es 'inicio' (la app decide si lo pone o lo quita)
//   cerebro({visible, valor}): S8, el submenú «Cerebro» y «Preparar el complemento para TATI», la línea
//     {"t":"cerebro","visible":true|false,"valor":"snetforever|tati"} (se repite al relanzar). Solo con el puente
//     activo la app la manda con visible true; sin ella, el ayudante los deja ocultos
//   entradas: la línea F5 `{"t":"entradas","actualizacion":"<texto>","avisos":N,"version":"0.5.0"}` (se repite al relanzar)
//   textos: las entradas del menú (de textos.mjs), que el ayudante recibe en -Textos
//   parar(): le manda `salir` (así quita el icono y no deja un fantasma), espera a que termine y, si no sale en
//            `esperaSalida` ms, lo mata por su PID (nunca por nombre)
// abrirRuta(ruta): abre una carpeta (o enseña un archivo) con el Explorador de Windows.
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWERSHELL } from './captura.mjs';
import { log } from './registro.mjs';
export const SCRIPT_BANDEJA = join(dirname(fileURLToPath(import.meta.url)), '..', 'ayudantes', 'bandeja.ps1');
export const TOOLTIP_MAX = 63; // el límite de Windows para el texto del icono
export const ESPERAS_RELANZAR = [2000, 5000, 10_000];
export const FALLOS_MAX = 5; // relanzamientos fallidos seguidos antes de pasar a la espera larga
export const ESPERA_LARGA = 60_000; // como la captura: tras FALLOS_MAX fallos seguidos, un intento por minuto
export const VIDA_ESTABLE = 60_000; // si vivió tanto, la cuenta de fallos vuelve a empezar
export const ESPERA_SALIDA = 1500;
const LINEA_MAX = 64 * 1024;
const ACCIONES = new Set(['comprobar', 'registro', 'carpeta', 'salir', 'motor', 'actualizar', 'avisos', 'avisos_archivo', 'avisos_copiar', 'inicio',
    'guias', 'enlace', 'enlaces', 'cerebro', 'complemento_tati']);
/** El texto en una sola línea y de como mucho `max` caracteres (con «…» al final si se recorta). */
export function recortar(texto, max) {
    const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
export function lanzarBandeja({ script = SCRIPT_BANDEJA, alMenu = (() => { }), textos = {}, lanzar = spawn, powershell = POWERSHELL, esperas = ESPERAS_RELANZAR, esperaLarga = ESPERA_LARGA, esperaSalida = ESPERA_SALIDA, } = {}) {
    let hijo = null;
    let parado = false;
    let temporizador = null;
    let fallos = 0;
    let finParar = null;
    let ultimoEstado = null;
    let ultimoMotor = null;
    let ultimasEntradas = null;
    let ultimoInicio = null;
    let ultimoCerebro = null;
    const textosB64 = Buffer.from(JSON.stringify(textos), 'utf8').toString('base64');
    function enviar(mensaje) {
        if (!hijo)
            return;
        try {
            hijo.stdin.write(`${JSON.stringify(mensaje)}\n`);
        }
        catch {
            // el ayudante ya no escucha
        }
    }
    function linea(texto) {
        let m;
        try {
            m = JSON.parse(texto);
        }
        catch {
            return;
        }
        if (!m || m.t !== 'menu' || !ACCIONES.has(m.accion))
            return;
        try {
            alMenu(m.accion, typeof m.valor === 'string' ? m.valor : undefined);
        }
        catch (e) {
            log('error', `bandeja: fallo al atender «${m.accion}» (${e?.code || e?.name || 'Error'})`);
        }
    }
    function programar() {
        if (parado)
            return;
        if (fallos === FALLOS_MAX)
            log('error', 'bandeja: el ayudante no se mantiene vivo; se prueba una vez por minuto');
        const ms = fallos >= FALLOS_MAX ? esperaLarga : esperas[Math.min(fallos, esperas.length - 1)];
        fallos++;
        temporizador = setTimeout(arrancar, ms);
    }
    function arrancar() {
        temporizador = null;
        if (parado)
            return;
        const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', script, '-PadrePid', String(process.pid), '-Textos', textosB64];
        const desde = Date.now();
        let h;
        try {
            h = lanzar(powershell, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        }
        catch {
            programar();
            return;
        }
        hijo = h;
        h.stdin?.on?.('error', () => { });
        h.stderr?.on?.('data', () => { });
        let resto = '';
        h.stdout.setEncoding?.('utf8');
        h.stdout.on('data', (trozo) => {
            let texto = resto + trozo;
            let i;
            while ((i = texto.indexOf('\n')) >= 0) {
                const l = texto.slice(0, i).replace(/\r$/, '');
                texto = texto.slice(i + 1);
                if (l)
                    linea(l);
            }
            resto = texto.length > LINEA_MAX ? '' : texto;
        });
        let terminado = false;
        const alTerminar = () => {
            if (terminado)
                return;
            terminado = true;
            if (hijo === h)
                hijo = null;
            if (Date.now() - desde >= VIDA_ESTABLE)
                fallos = 0;
            programar();
        };
        h.on('close', alTerminar);
        h.on('error', alTerminar);
        // Lo último que se le dijo (también cuando es un relanzamiento).
        if (ultimoEstado)
            enviar(ultimoEstado);
        if (ultimoMotor)
            enviar(ultimoMotor);
        if (ultimasEntradas)
            enviar(ultimasEntradas);
        if (ultimoInicio)
            enviar(ultimoInicio);
        if (ultimoCerebro)
            enviar(ultimoCerebro);
    }
    arrancar();
    return {
        estado(texto, icono = 'ok', { lineas = [], tooltip } = {}) {
            ultimoEstado = {
                t: 'estado',
                texto: recortar(texto, 200),
                icono: ['ok', 'aviso', 'error'].includes(icono) ? icono : 'ok',
                lineas: lineas.slice(0, 3).map((l) => recortar(l, 200)),
                tooltip: recortar(tooltip ?? texto, TOOLTIP_MAX),
            };
            enviar(ultimoEstado);
        },
        globo(titulo, texto) {
            enviar({ t: 'globo', titulo: recortar(titulo, 63), texto: recortar(texto, 255) });
        },
        motor(valor) {
            ultimoMotor = { t: 'motor', valor: String(valor) };
            enviar(ultimoMotor);
        },
        entradas({ actualizacion = '', avisos = 0, version = '' } = {}) {
            ultimasEntradas = {
                t: 'entradas',
                actualizacion: recortar(actualizacion, 200),
                avisos: Number.isSafeInteger(avisos) && avisos > 0 ? avisos : 0,
                version: recortar(version, 40),
            };
            enviar(ultimasEntradas);
        },
        inicio(activo) {
            ultimoInicio = { t: 'inicio', valor: activo === true };
            enviar(ultimoInicio);
        },
        cerebro({ visible = false, valor = 'snetforever' } = {}) {
            ultimoCerebro = { t: 'cerebro', visible: visible === true, valor: valor === 'tati' ? 'tati' : 'snetforever' };
            enviar(ultimoCerebro);
        },
        parar() {
            if (finParar)
                return finParar;
            parado = true;
            if (temporizador)
                clearTimeout(temporizador);
            temporizador = null;
            const h = hijo;
            if (!h) {
                finParar = Promise.resolve();
                return finParar;
            }
            finParar = new Promise((resolver) => {
                const limite = setTimeout(() => {
                    // Por su PID (ChildProcess.kill), nunca por nombre: hay más PowerShell en el PC.
                    try {
                        h.kill();
                    }
                    catch {
                        // ya no estaba
                    }
                    resolver();
                }, esperaSalida);
                h.once('close', () => {
                    clearTimeout(limite);
                    resolver();
                });
            });
            try {
                h.stdin.write(`${JSON.stringify({ t: 'salir' })}\n`);
                h.stdin.end();
            }
            catch {
                // si no se puede escribir, el límite lo mata
            }
            return finParar;
        },
    };
}
/**
 * Abre una carpeta (`/root,"<ruta>"`) o enseña un archivo (`/select,"<ruta>"`) con el Explorador de Windows. La ruta va entre
 * comillas explícitas y con `windowsVerbatimArguments`: explorer.exe separa sus opciones por comas, y sin ellas una coma en la
 * ruta abriría otra carpeta. Una ruta con comillas no se abre (no puede existir en Windows).
 */
export function abrirRuta(ruta, { lanzar = spawn, esArchivo = (r) => { try {
    return statSync(r).isFile();
}
catch {
    return false;
} } } = {}) {
    const texto = String(ruta ?? '');
    if (!texto || texto.includes('"'))
        return;
    const explorador = join(process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows', 'explorer.exe');
    const argumento = `${esArchivo(texto) ? '/select' : '/root'},"${texto}"`;
    try {
        const h = lanzar(explorador, [argumento], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
        h.on?.('error', () => { });
        h.unref?.();
    }
    catch (e) {
        log('aviso', `no se pudo abrir una ruta (${e?.code || 'ERROR'})`);
    }
}
