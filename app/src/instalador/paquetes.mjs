// Los paquetes que el instalador deja en `{app}\paquetes` (fase 5; tarea 12 y tarea 13, ronda 1): el manifiesto, su firma
// y los paquetes de AddOns. La lectura y la comprobación están aquí, en un único sitio, porque es la ruta de seguridad: la
// usan la CLI del instalador (`instalar`) y el primer arranque de la app (R17, primerArranque.mjs).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLAVE_PUBLICA } from '../actualizar/clave-publica.mjs';
import { MAX_FIRMA, MAX_MANIFIESTO, comprobarPaquete, leerManifiesto, verificarFirma } from '../actualizar/manifiesto.mjs';
/** El nombre del manifiesto (su firma es `<MANIFIESTO>.sig`). */
export const MANIFIESTO = 'snetforever-manifiesto.json';
/**
 * Los componentes que van en AddOns, en el orden en que se instalan (la app la pone Inno). El comercio (0.7.0, Task 8) va
 * el último de AddOns: depende del addon (`## Dependencies: SnetForever`).
 */
export const COMPONENTES_ADDONS = Object.freeze(['addon', 'rutas', 'misiones', 'comercio']);
/**
 * Error de los paquetes de la instalación: `code` = 'paquete' y `detalle` dice qué falló: 'falta_manifiesto',
 * 'falta_firma', 'firma', 'sin_<componente>' (el manifiesto no lo trae) o 'falta_<componente>' (falta su archivo, no es
 * un archivo o es más grande que lo que dice el manifiesto). Los del manifiesto y del paquete (ErrorManifiesto,
 * ErrorPaquete: 'hash', 'tamano', 'version'…) salen tal cual.
 */
export class ErrorPaquetes extends Error {
    constructor(detalle) {
        super(`Los paquetes de la instalación no valen (${detalle})`);
        this.name = 'ErrorPaquetes';
        this.code = 'paquete';
        this.detalle = detalle;
    }
}
// Un archivo de `dir`, de `max` bytes como mucho; si falta o no vale, el error de `detalle`.
function leerDe(dir, nombre, max, detalle, error) {
    const ruta = join(dir, nombre);
    let info;
    try {
        info = statSync(ruta);
    }
    catch {
        throw error(detalle);
    }
    if (!info.isFile() || info.size > max)
        throw error(detalle);
    return readFileSync(ruta);
}
/**
 * Los paquetes de `componentes` de `dir`, comprobados: con `clavePublica`, la firma del manifiesto antes de leerlo (sin la
 * firma buena no se lee nada); siempre, el tamaño, el SHA-256, la versión y el esquema de cada paquete frente a su entrada
 * (comprobarPaquete). Solo se leen los archivos de los componentes pedidos.
 * @param {string} dir la carpeta (`{app}\paquetes`)
 * @param {object} [p]
 * @param {string|null} [p.clavePublica] la clave del manifiesto (CLAVE_PUBLICA); con null, solo los SHA-256
 * @param {string[]} [p.componentes] por defecto los de AddOns (`COMPONENTES_ADDONS`), en su orden
 * @param {string[]} [p.opcionales] de `componentes`, los que se saltan sin error si el manifiesto no los trae (el comercio en
 *   un `{app}\paquetes` de una 0.6.x). Si el manifiesto sí los trae, se leen y se comprueban como los demás.
 * @param {(detalle: string) => Error} [p.error] el error que se lanza con cada `detalle` (por defecto, ErrorPaquetes)
 * @returns {{componente: string, buffer: Buffer}[]} en el orden de `componentes`
 */
export function leerPaquetes(dir, { clavePublica = CLAVE_PUBLICA, componentes = COMPONENTES_ADDONS, opcionales = [], error = (d) => new ErrorPaquetes(d), } = {}) {
    const bytes = leerDe(dir, MANIFIESTO, MAX_MANIFIESTO, 'falta_manifiesto', error);
    if (clavePublica !== null) {
        const firma = leerDe(dir, `${MANIFIESTO}.sig`, MAX_FIRMA, 'falta_firma', error);
        if (!verificarFirma(bytes, firma, clavePublica))
            throw error('firma');
    }
    const manifiesto = leerManifiesto(bytes);
    return componentes.flatMap((componente) => {
        const entrada = manifiesto.componentes[componente];
        if (!entrada && opcionales.includes(componente))
            return [];
        if (!entrada)
            throw error(`sin_${componente}`);
        // entrada.archivo ya cumple `SnetForever-<componente>-<version>.snfpaq` (validarManifiesto): no sale de `dir`
        const buffer = leerDe(dir, entrada.archivo, entrada.tamano, `falta_${componente}`, error);
        comprobarPaquete(manifiesto, componente, buffer);
        return [{ componente, buffer }];
    });
}
