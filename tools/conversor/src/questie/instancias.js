// Tabla instanceID -> AreaID de QuestieDB: une `support/Forever/Zones/instanceIdToAreaId.lua`
// (`[n] = ZoneDB.zoneIDs.NOMBRE` o un número) con el enum `src/corrections/enum/zones.lua` (`NOMBRE = n`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const quitarComentarios = (texto) => texto.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');

/**
 * @param {string} dirQuestieDB carpeta del addon QuestieDB
 * @param {string[]} [avisos] recibe un aviso por cada nombre que no está en el enum
 * @returns {Map<number, number>} instanceID -> AreaID
 */
export function leerInstancias(dirQuestieDB, avisos = []) {
  const enumZonas = new Map();
  const textoEnum = quitarComentarios(readFileSync(join(dirQuestieDB, 'src', 'corrections', 'enum', 'zones.lua'), 'utf8'));
  for (const m of textoEnum.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)/g)) enumZonas.set(m[1], Number(m[2]));

  const ruta = join(dirQuestieDB, 'support', 'Forever', 'Zones', 'instanceIdToAreaId.lua');
  const texto = quitarComentarios(readFileSync(ruta, 'utf8'));
  const instancias = new Map();
  for (const m of texto.matchAll(/\[(\d+)\]\s*=\s*(?:ZoneDB\.zoneIDs\.([A-Za-z_][A-Za-z0-9_]*)|(\d+))/g)) {
    const instancia = Number(m[1]);
    if (m[3] !== undefined) { instancias.set(instancia, Number(m[3])); continue; }
    if (!enumZonas.has(m[2])) { avisos.push(`instancia ${instancia}: ${m[2]} no está en el enum de zonas`); continue; }
    instancias.set(instancia, enumZonas.get(m[2]));
  }
  return instancias;
}
