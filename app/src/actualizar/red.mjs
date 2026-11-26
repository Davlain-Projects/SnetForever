// La única puerta de red de la app (R5 del plan de la fase 5; tarea 6; vigilancia 4). Solo pide, con GET, las versiones
// publicadas en GitHub:
//
// - solo https, sin usuario ni contraseña en la URL, por el puerto 443 y solo a los sitios de `HOSTS` (origen.mjs);
// - las redirecciones (301, 302, 303, 307 y 308) pasan por la misma comprobación, y como mucho `maxRedirecciones`;
// - sin cuerpo y con solo dos cabeceras: `User-Agent: SnetForever/<versión>` y `Accept: */*` (nada de sesión ni de
//   credenciales, ni datos del jugador);
// - nunca lee más de `maxBytes`: si la longitud anunciada pasa del tope se corta sin leer el cuerpo, y si el cuerpo se
//   pasa al leerlo, también;
// - `tiempoMax` cuenta la petición entera, con sus redirecciones.
//
// Aparte hay `enviar`, la segunda puerta: habla con la API de Blizzard (GET o POST, con cabeceras y cuerpo, por ejemplo el
// pase de acceso), solo https y solo a los sitios de `HOSTS_BLIZZARD`, sin seguir redirecciones. Sus fallos llevan
// códigos en mayúsculas: 'ESQUEMA', 'HOST', 'GRANDE', 'TIEMPO' y 'CONEXION'.
//
// Y `obtenerPagina`, la tercera puerta: baja páginas públicas de guías (cualquier sitio https por el 443, con GET, las mismas
// dos cabeceras, 5 MB como mucho y redirecciones comprobadas una a una). Nunca llega a la red local: se rechazan los
// nombres y las IP de la red de casa, y al conectar se mira la IP a la que resolvió el nombre (evento `lookup` del socket;
// sin módulo de nombres, que está prohibido). Un `http://` se pide como `https://`. Sus fallos llevan los códigos de `obtener` y
// además 'red_local'.
//
// Cada fallo de `obtener` es un `ErrorRed` con su `code`: 'url', 'redireccion', 'estado' (con `.estado`, el código HTTP), 'tamano',
// 'tiempo' o 'conexion'. El resto de la app sigue sin red: la prueba de cumplimiento vigila que solo este archivo use
// node:https, y que los dos atajos de las pruebas (`permitirLocal`, que deja pasar http://127.0.0.1:<puerto>, y
// `transporte`, que cambia https.get por el http.get del servidor falso) no aparezcan en ningún otro archivo de la app.
import https from 'node:https';
import { HOSTS, HOSTS_BLIZZARD } from './origen.mjs';
import { VERSION } from '../version.mjs';
const REDIRECCIONES = new Set([301, 302, 303, 307, 308]);
// La misma forma de versión que el resto de la app (manifiesto.mjs y paquete.mjs): así el User-Agent nunca lleva nada
// más que «SnetForever/» y cifras con puntos.
const FORMA_VERSION = /^\d+(\.\d+){1,3}$/;
// Cabeceras que enviar pone o decide por su cuenta: quien llama no puede cambiarlas.
const PROHIBIDAS = new Set(['host', 'content-length', 'transfer-encoding']);
// El reloj más largo que admite setTimeout (con más, salta al momento).
const MAX_RELOJ = 2 ** 31 - 1;
export class ErrorRed extends Error {
    /**
     * @param {'url'|'redireccion'|'estado'|'tamano'|'tiempo'|'conexion'|'ESQUEMA'|'HOST'|'GRANDE'|'TIEMPO'|'CONEXION'} code
     *   (los de `obtener` en minúscula y los de `enviar` en mayúscula)
     * @param {string} mensaje
     * @param {{estado?: number, cause?: unknown}} [extra]
     */
    constructor(code, mensaje, { estado, cause } = {}) {
        super(mensaje, cause === undefined ? undefined : { cause });
        this.name = 'ErrorRed';
        this.code = code;
        if (estado !== undefined)
            this.estado = estado;
    }
}
/**
 * ¿Se puede pedir `texto`? Devuelve la URL ya normalizada (sin el :443) o `null`. Vale https, sin usuario ni contraseña,
 * con el puerto vacío o 443 y el host exactamente en `HOSTS`; con `permitirLocal`, también http://127.0.0.1:<puerto>.
 */
export function urlPermitida(texto, permitirLocal = false) {
    let u;
    try {
        u = new URL(String(texto));
    }
    catch {
        return null;
    }
    if (u.username !== '' || u.password !== '')
        return null;
    if (u.protocol === 'https:' && (u.port === '' || u.port === '443') && HOSTS.includes(u.hostname))
        return u.href;
    if (permitirLocal && u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.port !== '')
        return u.href;
    return null;
}
/**
 * Pide `url` con GET y devuelve el cuerpo entero (respuesta 200). `maxBytes` y `maxRedirecciones` son enteros ≥ 0,
 * `tiempoMax` un entero de 1 a 2^31-1 ms y `version` cumple `^\d+(\.\d+){1,3}$`; si no, `TypeError` sin conectar.
 * @param {string} url
 * @param {{maxBytes: number, tiempoMax?: number, maxRedirecciones?: number, version?: string,
 *   transporte?: typeof https.get, permitirLocal?: boolean}} opciones
 * @returns {Promise<Buffer>}
 */
export function obtener(url, { maxBytes, tiempoMax = 30000, maxRedirecciones = 5, version = VERSION, transporte = https.get, permitirLocal = false, } = {}) {
    // las opciones se comprueban antes de abrir nada: un número raro quitaría el tope (NaN) o haría saltar el reloj
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
        return Promise.reject(new TypeError(`maxBytes tiene que ser un entero mayor o igual que 0, no ${String(maxBytes)}`));
    }
    if (!Number.isSafeInteger(tiempoMax) || tiempoMax < 1 || tiempoMax > MAX_RELOJ) {
        return Promise.reject(new TypeError(`tiempoMax tiene que ser un entero de 1 a ${MAX_RELOJ} ms, no ${String(tiempoMax)}`));
    }
    if (!Number.isSafeInteger(maxRedirecciones) || maxRedirecciones < 0) {
        return Promise.reject(new TypeError(`maxRedirecciones tiene que ser un entero mayor o igual que 0, no ${String(maxRedirecciones)}`));
    }
    if (typeof version !== 'string' || !FORMA_VERSION.test(version)) {
        return Promise.reject(new TypeError(`version no válida para el User-Agent: ${JSON.stringify(version) ?? String(version)}`));
    }
    const primera = urlPermitida(url, permitirLocal);
    if (primera === null)
        return Promise.reject(new ErrorRed('url', `URL no permitida: ${String(url)}`));
    return new Promise((resolve, reject) => {
        const cabeceras = { 'User-Agent': `SnetForever/${version}`, Accept: '*/*' };
        let actual = null; // la petición en curso
        let terminado = false;
        const reloj = setTimeout(() => fallar(new ErrorRed('tiempo', `sin respuesta completa en ${tiempoMax} ms`)), tiempoMax);
        function fallar(error) {
            if (terminado)
                return;
            terminado = true;
            clearTimeout(reloj);
            actual?.destroy();
            reject(error);
        }
        function acabar(cuerpo) {
            if (terminado)
                return;
            terminado = true;
            clearTimeout(reloj);
            resolve(cuerpo);
        }
        function pedir(destino, saltos) {
            let peticion;
            try {
                peticion = transporte(destino, { headers: cabeceras }, (res) => responder(peticion, res, destino, saltos));
            }
            catch (e) {
                fallar(new ErrorRed('conexion', `no se pudo pedir ${destino}: ${e.message}`, { cause: e }));
                return;
            }
            actual = peticion;
            peticion.on('error', (e) => {
                // los errores de una petición vieja (ya redirigida) no cuentan
                if (peticion === actual)
                    fallar(new ErrorRed('conexion', `sin conexión con ${destino}: ${e.message}`, { cause: e }));
            });
        }
        function responder(peticion, res, destino, saltos) {
            if (terminado || peticion !== actual) {
                res.destroy();
                return;
            }
            const estado = res.statusCode;
            if (REDIRECCIONES.has(estado)) {
                res.destroy();
                if (saltos >= maxRedirecciones) {
                    fallar(new ErrorRed('redireccion', `más de ${maxRedirecciones} redirecciones (la última, desde ${destino})`));
                    return;
                }
                const lugar = res.headers.location;
                let siguiente = null;
                if (typeof lugar === 'string' && lugar !== '') {
                    try {
                        siguiente = urlPermitida(new URL(lugar, destino).href, permitirLocal);
                    }
                    catch {
                        siguiente = null;
                    }
                }
                if (siguiente === null) {
                    fallar(new ErrorRed('redireccion', `redirección no permitida desde ${destino} a ${String(lugar)}`));
                    return;
                }
                pedir(siguiente, saltos + 1);
                return;
            }
            if (estado !== 200) {
                res.destroy();
                fallar(new ErrorRed('estado', `HTTP ${estado} en ${destino}`, { estado }));
                return;
            }
            const anunciado = res.headers['content-length'];
            if (anunciado !== undefined && Number(anunciado) > maxBytes) {
                res.destroy();
                fallar(new ErrorRed('tamano', `${destino} anuncia ${anunciado} bytes y el tope es ${maxBytes}`));
                return;
            }
            const trozos = [];
            let total = 0;
            res.on('data', (trozo) => {
                if (terminado)
                    return;
                total += trozo.length;
                if (total > maxBytes) {
                    res.destroy();
                    fallar(new ErrorRed('tamano', `${destino} pasa de ${maxBytes} bytes`));
                    return;
                }
                trozos.push(trozo);
            });
            res.on('end', () => acabar(Buffer.concat(trozos, total)));
            res.on('error', (e) => fallar(new ErrorRed('conexion', `se cortó ${destino}: ${e.message}`, { cause: e })));
            res.on('close', () => {
                if (!res.complete)
                    fallar(new ErrorRed('conexion', `se cortó ${destino} antes de terminar`));
            });
        }
        pedir(primera, 0);
    });
}
/**
 * Habla con la API de Blizzard (`HOSTS_BLIZZARD`): solo https por el puerto 443, sin usuario en la URL, GET o POST y sin
 * seguir redirecciones (un 3xx se devuelve tal cual). Devuelve cualquier estado HTTP (200, 304, 401…): quien llama decide;
 * 304 y los demás sin contenido llegan con el cuerpo vacío. Las cabeceras de `cabeceras` van tal cual, salvo
 * `User-Agent`, que siempre es `SnetForever/<versión>`.
 * Fallos (`ErrorRed`): 'ESQUEMA' (no es https), 'HOST' (no es de Blizzard), 'GRANDE', 'TIEMPO' y 'CONEXION'.
 * @param {string} url
 * @param {{metodo?: 'GET'|'POST', cabeceras?: Record<string, string>, cuerpo?: string|Buffer|null, maxBytes: number,
 *   tiempoMax?: number, version?: string, transporte?: typeof https.request}} opciones
 * @returns {Promise<{estado: number, cabeceras: Record<string, string|string[]>, cuerpo: Buffer}>}
 */
export function enviar(url, { metodo = 'GET', cabeceras = {}, cuerpo = null, maxBytes, tiempoMax = 30000, version = VERSION, transporte = https.request, } = {}) {
    if (metodo !== 'GET' && metodo !== 'POST')
        return Promise.reject(new TypeError(`metodo tiene que ser GET o POST, no ${String(metodo)}`));
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
        return Promise.reject(new TypeError(`maxBytes tiene que ser un entero mayor o igual que 0, no ${String(maxBytes)}`));
    }
    if (!Number.isSafeInteger(tiempoMax) || tiempoMax < 1 || tiempoMax > MAX_RELOJ) {
        return Promise.reject(new TypeError(`tiempoMax tiene que ser un entero de 1 a ${MAX_RELOJ} ms, no ${String(tiempoMax)}`));
    }
    if (typeof version !== 'string' || !FORMA_VERSION.test(version)) {
        return Promise.reject(new TypeError(`version no válida para el User-Agent: ${JSON.stringify(version) ?? String(version)}`));
    }
    if (cuerpo !== null && typeof cuerpo !== 'string' && !Buffer.isBuffer(cuerpo)) {
        return Promise.reject(new TypeError('cuerpo tiene que ser texto, un Buffer o null'));
    }
    for (const nombre of Object.keys(cabeceras ?? {})) {
        if (PROHIBIDAS.has(nombre.toLowerCase()))
            return Promise.reject(new TypeError(`la cabecera ${nombre} la pone enviar, no quien llama`));
    }
    if (cuerpo !== null && metodo === 'GET')
        return Promise.reject(new TypeError('una petición GET no lleva cuerpo'));
    let u;
    try {
        u = new URL(String(url));
    }
    catch {
        return Promise.reject(new ErrorRed('ESQUEMA', 'URL no válida'));
    }
    if (u.protocol !== 'https:')
        return Promise.reject(new ErrorRed('ESQUEMA', `solo se admite https, no ${u.protocol}`));
    if (u.username !== '' || u.password !== '' || (u.port !== '' && u.port !== '443') || !HOSTS_BLIZZARD.includes(u.hostname)) {
        return Promise.reject(new ErrorRed('HOST', `sitio no permitido: ${u.hostname}`));
    }
    const destino = u.href;
    return new Promise((resolve, reject) => {
        const encabezados = { Accept: '*/*', ...cabeceras, 'User-Agent': `SnetForever/${version}` };
        if (cuerpo !== null)
            encabezados['Content-Length'] = String(Buffer.byteLength(cuerpo));
        let peticion = null;
        let terminado = false;
        const reloj = setTimeout(() => fallar(new ErrorRed('TIEMPO', `sin respuesta completa en ${tiempoMax} ms`)), tiempoMax);
        function fallar(error) {
            if (terminado)
                return;
            terminado = true;
            clearTimeout(reloj);
            peticion?.destroy();
            reject(error);
        }
        function acabar(resultado) {
            if (terminado)
                return;
            terminado = true;
            clearTimeout(reloj);
            resolve(resultado);
        }
        function responder(res) {
            if (terminado) {
                res.destroy();
                return;
            }
            const estado = res.statusCode;
            const resumen = { estado, cabeceras: res.headers ?? {} };
            if (estado === 304 || estado === 204) {
                res.destroy();
                acabar({ ...resumen, cuerpo: Buffer.alloc(0) });
                return;
            }
            const anunciado = res.headers?.['content-length'];
            if (anunciado !== undefined && Number(anunciado) > maxBytes) {
                res.destroy();
                fallar(new ErrorRed('GRANDE', `la respuesta anuncia ${anunciado} bytes y el tope es ${maxBytes}`));
                return;
            }
            const trozos = [];
            let total = 0;
            res.on('data', (trozo) => {
                if (terminado)
                    return;
                total += trozo.length;
                if (total > maxBytes) {
                    res.destroy();
                    fallar(new ErrorRed('GRANDE', `la respuesta pasa de ${maxBytes} bytes`));
                    return;
                }
                trozos.push(trozo);
            });
            res.on('end', () => acabar({ ...resumen, cuerpo: Buffer.concat(trozos, total) }));
            res.on('error', (e) => fallar(new ErrorRed('CONEXION', `se cortó la respuesta: ${e.message}`, { cause: e })));
            res.on('close', () => {
                if (res.complete === false)
                    fallar(new ErrorRed('CONEXION', 'se cortó la respuesta antes de terminar'));
            });
        }
        try {
            peticion = transporte(destino, { method: metodo, headers: encabezados }, responder);
        }
        catch (e) {
            fallar(new ErrorRed('CONEXION', `no se pudo pedir: ${e.message}`, { cause: e }));
            return;
        }
        peticion.on('error', (e) => fallar(new ErrorRed('CONEXION', `sin conexión con ${u.hostname}: ${e.message}`, { cause: e })));
        if (cuerpo !== null)
            peticion.end(cuerpo);
        else
            peticion.end();
    });
}
// ---------------------------------------------------------------------------------------------------------------------
// Tercera puerta: páginas públicas de guías.
export const MAX_PAGINA = 5 * 1024 * 1024;
// Las 4 cifras de una IPv4 («a.b.c.d», cada una de 0 a 255) o `null`.
function partesIpv4(texto) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(texto);
    if (m === null)
        return null;
    const partes = m.slice(1).map(Number);
    return partes.every((n) => n <= 255) ? partes : null;
}
// Los 8 grupos de 16 bits de una IPv6 (admite «::» y una IPv4 al final) o `null`.
function gruposIpv6(texto) {
    let t = texto.toLowerCase();
    const final = /(\d+\.\d+\.\d+\.\d+)$/.exec(t);
    if (final !== null) {
        const v4 = partesIpv4(final[1]);
        if (v4 === null)
            return null;
        t = `${t.slice(0, final.index)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
    }
    if (!/^[0-9a-f:]+$/.test(t) || t.includes(':::'))
        return null;
    const mitades = t.split('::');
    if (mitades.length > 2)
        return null;
    const lado = (x) => (x === '' ? [] : x.split(':'));
    const cabeza = lado(mitades[0]);
    const cola = mitades.length === 2 ? lado(mitades[1]) : [];
    const huecos = 8 - cabeza.length - cola.length;
    if (mitades.length === 1 ? huecos !== 0 : huecos < 1)
        return null;
    const todos = [...cabeza, ...Array(mitades.length === 2 ? huecos : 0).fill('0'), ...cola];
    if (todos.length !== 8 || todos.some((g) => g.length < 1 || g.length > 4))
        return null;
    return todos.map((g) => parseInt(g, 16));
}
function ipv4Privada([a, b, c]) {
    return a === 0 || a === 10 || a === 127 || a >= 224 // «esta red», privadas, bucle, multidifusión y reservadas
        || (a === 100 && b >= 64 && b <= 127) // CGNAT
        || (a === 169 && b === 254) // enlace local
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || (a === 192 && b === 0 && c === 0)
        || (a === 198 && (b === 18 || b === 19)); // pruebas de rendimiento
}
/**
 * ¿Es `direccion` una IP de la red local o reservada (no se puede pedir)? Mira IPv4 (bucle, privadas, enlace local,
 * CGNAT…) e IPv6 (::, ::1, fe80::/10, fc00::/7, multidifusión y las IPv4 embebidas, como ::ffff:192.168.1.1). Lo que no es
 * una IP devuelve `false`.
 * @param {string} direccion
 * @returns {boolean}
 */
export function ipPrivada(direccion) {
    const texto = String(direccion).trim().replace(/^\[|\]$/g, '');
    const v4 = partesIpv4(texto);
    if (v4 !== null)
        return ipv4Privada(v4);
    const g = gruposIpv6(texto);
    if (g === null)
        return false;
    if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1))
        return true; // :: y ::1
    if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xff00) === 0xff00)
        return true;
    const embebida = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0))
        return ipv4Privada(embebida); // ::ffff:a.b.c.d y ::a.b.c.d
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))
        return ipv4Privada(embebida); // NAT64
    return false;
}
// Mira una dirección de página: `{url}` si vale, o `{motivo}` con 'red_local' (nombre o IP de la red de casa) o 'url'.
function mirarPagina(texto, permitirLocal) {
    let u;
    try {
        u = new URL(String(texto));
    }
    catch {
        return { motivo: 'url' };
    }
    if (u.username !== '' || u.password !== '')
        return { motivo: 'url' };
    if (permitirLocal && u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.port !== '')
        return { url: u.href };
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
        return { motivo: 'url' };
    if (u.port !== '')
        return { motivo: 'url' }; // el puerto por defecto (80 o 443) ya queda vacío al normalizar
    const host = u.hostname.replace(/\.$/, '');
    if (host === '')
        return { motivo: 'url' };
    if (host.startsWith('[') || partesIpv4(host) !== null)
        return { motivo: ipPrivada(host) ? 'red_local' : 'url' };
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')
        || !host.includes('.'))
        return { motivo: 'red_local' };
    u.protocol = 'https:'; // un http:// se pide como https://
    return { url: u.href };
}
/**
 * ¿Se puede pedir `texto` como página de guía? Devuelve la URL https ya normalizada o `null`. Vale https (o http, que pasa
 * a https) a un nombre público, sin usuario ni contraseña y por el puerto por defecto; fuera `localhost`, los nombres sin
 * punto, `.local`, `.localhost`, `.internal` y las IP (de cualquier clase: las páginas se piden por nombre).
 * @param {string} texto
 * @returns {string | null}
 */
export function urlDePagina(texto) {
    return mirarPagina(texto, false).url ?? null;
}
/**
 * Baja una página pública (GET, respuesta 200). Los mismos topes y comprobaciones que `obtener`, con `urlDePagina` en lugar
 * de `urlPermitida`, y al conectar mira la IP resuelta: si es de la red local, corta con 'red_local' sin pedir nada.
 * Fallos (`ErrorRed`): 'url', 'red_local', 'redireccion', 'estado', 'tamano', 'tiempo' y 'conexion'.
 * @param {string} url
 * @param {{maxBytes?: number, tiempoMax?: number, maxRedirecciones?: number, version?: string,
 *   transporte?: typeof https.get, permitirLocal?: boolean}} opciones
 * @returns {Promise<{url: string, tipo: string, cuerpo: Buffer}>} `url` es la final, tras las redirecciones; `tipo`, el content-type
 */
export function obtenerPagina(url, { maxBytes = MAX_PAGINA, tiempoMax = 30000, maxRedirecciones = 5, version = VERSION, transporte = https.get, permitirLocal = false, } = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
        return Promise.reject(new TypeError(`maxBytes tiene que ser un entero mayor o igual que 0, no ${String(maxBytes)}`));
    }
    if (!Number.isSafeInteger(tiempoMax) || tiempoMax < 1 || tiempoMax > MAX_RELOJ) {
        return Promise.reject(new TypeError(`tiempoMax tiene que ser un entero de 1 a ${MAX_RELOJ} ms, no ${String(tiempoMax)}`));
    }
    if (!Number.isSafeInteger(maxRedirecciones) || maxRedirecciones < 0) {
        return Promise.reject(new TypeError(`maxRedirecciones tiene que ser un entero mayor o igual que 0, no ${String(maxRedirecciones)}`));
    }
    if (typeof version !== 'string' || !FORMA_VERSION.test(version)) {
        return Promise.reject(new TypeError(`version no válida para el User-Agent: ${JSON.stringify(version) ?? String(version)}`));
    }
    const primera = mirarPagina(url, permitirLocal);
    if (primera.url === undefined) {
        return Promise.reject(new ErrorRed('url', `URL no permitida: ${String(url)}`));
    }
    return new Promise((resolve, reject) => {
        const cabeceras = { 'User-Agent': `SnetForever/${version}`, Accept: '*/*' };
        let actual = null; // la petición en curso
        let terminado = false;
        const reloj = setTimeout(() => fallar(new ErrorRed('tiempo', `sin respuesta completa en ${tiempoMax} ms`)), tiempoMax);
        function fallar(error) {
            if (terminado)
                return;
            terminado = true;
            clearTimeout(reloj);
            actual?.destroy();
            reject(error);
        }
        function acabar(resultado) {
            if (terminado)
                return;
            terminado = true;
            clearTimeout(reloj);
            resolve(resultado);
        }
        function pedir(destino, saltos) {
            let peticion;
            try {
                peticion = transporte(destino, { headers: cabeceras }, (res) => responder(peticion, res, destino, saltos));
            }
            catch (e) {
                fallar(new ErrorRed('conexion', `no se pudo pedir ${destino}: ${e.message}`, { cause: e }));
                return;
            }
            actual = peticion;
            peticion.on('error', (e) => {
                // los errores de una petición vieja (ya redirigida) no cuentan
                if (peticion === actual)
                    fallar(new ErrorRed('conexion', `sin conexión con ${destino}: ${e.message}`, { cause: e }));
            });
            // la IP a la que resolvió el nombre: si es de la red local, se corta antes de mandar nada
            peticion.on('socket', (socket) => {
                socket.on('lookup', (error, direccion) => {
                    if (peticion !== actual || error || typeof direccion !== 'string')
                        return;
                    if (ipPrivada(direccion))
                        fallar(new ErrorRed('red_local', `${destino} resuelve a una dirección de la red local`));
                });
            });
        }
        function responder(peticion, res, destino, saltos) {
            if (terminado || peticion !== actual) {
                res.destroy();
                return;
            }
            const estado = res.statusCode;
            if (REDIRECCIONES.has(estado)) {
                res.destroy();
                if (saltos >= maxRedirecciones) {
                    fallar(new ErrorRed('redireccion', `más de ${maxRedirecciones} redirecciones (la última, desde ${destino})`));
                    return;
                }
                const lugar = res.headers.location;
                let siguiente = { motivo: 'redireccion' };
                if (typeof lugar === 'string' && lugar !== '') {
                    try {
                        siguiente = mirarPagina(new URL(lugar, destino).href, permitirLocal);
                    }
                    catch {
                        siguiente = { motivo: 'redireccion' };
                    }
                }
                if (siguiente.url === undefined) {
                    const codigo = siguiente.motivo === 'red_local' ? 'red_local' : 'redireccion';
                    fallar(new ErrorRed(codigo, `redirección no permitida desde ${destino} a ${String(lugar)}`));
                    return;
                }
                pedir(siguiente.url, saltos + 1);
                return;
            }
            if (estado !== 200) {
                res.destroy();
                fallar(new ErrorRed('estado', `HTTP ${estado} en ${destino}`, { estado }));
                return;
            }
            const anunciado = res.headers['content-length'];
            if (anunciado !== undefined && Number(anunciado) > maxBytes) {
                res.destroy();
                fallar(new ErrorRed('tamano', `${destino} anuncia ${anunciado} bytes y el tope es ${maxBytes}`));
                return;
            }
            const tipo = String(res.headers['content-type'] ?? '');
            const trozos = [];
            let total = 0;
            res.on('data', (trozo) => {
                if (terminado)
                    return;
                total += trozo.length;
                if (total > maxBytes) {
                    res.destroy();
                    fallar(new ErrorRed('tamano', `${destino} pasa de ${maxBytes} bytes`));
                    return;
                }
                trozos.push(trozo);
            });
            res.on('end', () => acabar({ url: destino, tipo, cuerpo: Buffer.concat(trozos, total) }));
            res.on('error', (e) => fallar(new ErrorRed('conexion', `se cortó ${destino}: ${e.message}`, { cause: e })));
            res.on('close', () => {
                if (!res.complete)
                    fallar(new ErrorRed('conexion', `se cortó ${destino} antes de terminar`));
            });
        }
        pedir(primera.url, 0);
    });
}
