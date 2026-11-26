// Origen de las versiones (R6 del plan de la fase 5; tarea 6): de qué repositorio de GitHub salen el manifiesto, su
// firma y los paquetes, y a qué sitios puede ir la red (R5).
//
//   manifiesto: https://github.com/<repo>/releases/latest/download/snetforever-manifiesto.json
//   firma:      https://github.com/<repo>/releases/latest/download/snetforever-manifiesto.json.sig
//   paquete:    https://github.com/<repo>/releases/download/<publicacion>/<archivo>
//
// El repositorio se cambia con `config.actualizaciones.repo` (validado); si no vale, se usa el de por defecto. El nombre
// se confirmó en la tarea 18; mientras el repositorio no exista, GitHub contesta 404 y la app lo dice sin molestar.
// Aquí no se abre ninguna conexión: solo se montan las URL (la red está en red.mjs).
export const REPO_POR_DEFECTO = 'alvarezalain262-create/SnetForever';
// Los únicos sitios a los que va la red (R5): GitHub y los dos donde GitHub deja las descargas de las versiones.
export const HOSTS = Object.freeze(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
// Los únicos sitios de Blizzard a los que puede ir `enviar` (red.mjs): el que da el pase de acceso y las API de cada
// región. Aparte de GitHub, la app no habla con nadie más.
export const HOSTS_BLIZZARD = Object.freeze([
    'oauth.battle.net', 'us.api.blizzard.com', 'eu.api.blizzard.com', 'kr.api.blizzard.com', 'tw.api.blizzard.com',
]);
// <usuario>/<repositorio>, como los admite GitHub.
const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const MANIFIESTO = 'snetforever-manifiesto.json';
/**
 * El repositorio de las versiones: `config.actualizaciones.repo` si cumple `^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$`
 * (y su segunda parte no es «.» ni «..», que la URL resolvería como carpetas); si no, `REPO_POR_DEFECTO`.
 */
export function repoDe(config) {
    const repo = config?.actualizaciones?.repo;
    if (typeof repo !== 'string' || !REPO.test(repo))
        return REPO_POR_DEFECTO;
    const nombre = repo.slice(repo.indexOf('/') + 1);
    return nombre === '.' || nombre === '..' ? REPO_POR_DEFECTO : repo;
}
// Un trozo de la URL que va siempre como un único segmento (codificado). «.», «..» y vacío no se admiten: la URL los
// resolvería y el paquete saldría de otra carpeta.
function segmento(valor, que) {
    if (typeof valor !== 'string' || valor === '' || valor === '.' || valor === '..') {
        throw new TypeError(`${que} no válido para la URL del paquete: ${JSON.stringify(valor) ?? String(valor)}`);
    }
    return encodeURIComponent(valor);
}
/**
 * Las URL de las versiones para `config` (R6).
 * @returns {{manifiesto: string, firma: string, paquete: (publicacion: string, archivo: string) => string}}
 */
export function crearOrigen(config) {
    const raiz = `https://github.com/${repoDe(config)}/releases`;
    const manifiesto = `${raiz}/latest/download/${MANIFIESTO}`;
    return {
        manifiesto,
        firma: `${manifiesto}.sig`,
        // `publicacion` (p. ej. v0.5.0-2026.11.10.1) y `archivo` van cada uno como un único segmento, nunca como ruta
        paquete: (publicacion, archivo) => `${raiz}/download/${segmento(publicacion, 'publicación')}/${segmento(archivo, 'archivo')}`,
    };
}
