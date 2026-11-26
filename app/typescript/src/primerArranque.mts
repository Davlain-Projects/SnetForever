// R17, el primer arranque con componentes que faltan (fase 5, tarea 13; sacado de principal.mjs en la ronda 1): si
// `config.instalada` es verdadero y a AddOns le falta algún componente (estadoInstalado con algún null), la app lo instala
// desde `<instalación>\paquetes` con el juego cerrado. Así un asistente cerrado a medias no deja el addon sin instalar.
// Los paquetes se leen y se comprueban con la función común de la CLI (instalador/paquetes.mjs). Nada se borra: lo que
// hubiera va a la cuarentena (instalarComponentes).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaDatos, cuarentenaComponentes, leerConfig } from './rutas.mjs';
import { MARCA_ROTO, estadoInstalado, instalarComponentes } from './instalador/componentes.mjs';
import { COMPONENTES_ADDONS, leerPaquetes } from './instalador/paquetes.mjs';
import { log } from './registro.mjs';

// El comercio (0.7.0) es opcional aquí: un `{app}\paquetes` que dejó el instalador de una 0.6.x no lo trae, y eso no es un
// error. Ese comercio lo trae el actualizador (una app 0.7.0 ya lo conoce); R17 solo instala el que venga en los paquetes.
const OPCIONALES = ['comercio'];

/** Los códigos con los que se vuelve a intentar más tarde; con los demás, no en esta sesión. */
export const R17_REINTENTA = new Set(['juego_abierto', 'ocupado']);

/**
 * @param {object} p
 * @param {object} p.env el entorno (carpeta de datos, config.json y cuarentena)
 * @param {string} p.instalacion la carpeta de instalación (carpetaInstalacion)
 * @param {string|null} p.clavePublica la clave del manifiesto (CLAVE_PUBLICA); con null, solo los SHA-256
 * @param {() => Promise<boolean>} p.juegoAbierto si el juego está abierto (si falla, cuenta como abierto)
 * @returns {{intentar: (addonsDir: string) => Promise<{instalados: string[]}|null>, estado: string|null}}
 *   `intentar` da los componentes instalados, o null si no hizo nada (no toca, el juego está abierto o falló); nunca
 *   lanza. `estado`: null, 'esperando' (el juego abierto o un archivo ocupado), 'hecho' o 'fallo' (no se reintenta).
 */
export function crearPrimerArranque({ env, instalacion, clavePublica, juegoAbierto }) {
  let estado = null;
  let ocupado = false;
  const omitidos = new Set(); // opcionales que los paquetes no traen: no se vuelven a buscar en esta sesión

  async function intentar(addonsDir) {
    if (!addonsDir || estado === 'fallo' || ocupado) return null;
    const config = leerConfig(env);
    if (config.instalada !== true) return null;
    let faltan;
    try {
      const instalado = estadoInstalado(addonsDir);
      faltan = COMPONENTES_ADDONS.filter((c) => instalado[c] === null && !omitidos.has(c));
    } catch {
      return null;
    }
    const dir = join(instalacion, 'paquetes');
    if (faltan.length === 0 || !existsSync(dir)) return null;
    ocupado = true;
    try {
      if (await juegoAbierto()) {
        if (estado !== 'esperando') log('info', `primer arranque: faltan ${faltan.join(', ')}; se instalarán al cerrar el juego`);
        estado = 'esperando';
        return null;
      }
      const paquetes = leerPaquetes(dir, { clavePublica, componentes: faltan, opcionales: OPCIONALES });
      for (const c of faltan) if (!paquetes.some((p) => p.componente === c)) omitidos.add(c);
      if (paquetes.length === 0) {
        estado = 'hecho'; // lo que falta no viene en los paquetes (opcional): nada que instalar
        return null;
      }
      const r = await instalarComponentes(addonsDir, paquetes, {
        cuarentena: () => cuarentenaComponentes({ env, config }),
        juegoAbierto,
        marcaRoto: join(carpetaDatos(env), MARCA_ROTO),
      });
      const instalados = Array.isArray(r?.instalados) ? r.instalados : paquetes.map((p) => p.componente);
      for (const a of r?.avisos ?? []) log('aviso', `primer arranque: algo no pasó a la cuarentena (${a?.code ?? 'aviso'})`);
      estado = 'hecho';
      log('info', `primer arranque: instalado lo que faltaba (${instalados.join(', ')})`);
      return { instalados };
    } catch (e) {
      const codigo = e?.code || 'ERROR';
      if (R17_REINTENTA.has(codigo)) {
        estado = 'esperando';
        return null;
      }
      estado = 'fallo';
      log('error', `primer arranque: no se pudo instalar lo que falta (${codigo}${typeof e?.detalle === 'string' ? `, ${e.detalle}` : ''})`);
      return null;
    } finally {
      ocupado = false;
    }
  }

  return {
    intentar,
    get estado() {
      return estado;
    },
  };
}
