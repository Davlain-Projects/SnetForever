// Nombres de zona de Questie (solo lectura): `l10n.zoneLookup` (AreaID -> nombre en inglés) con sus correcciones, y la
// traducción al español que Questie trae en `Translations/Zones/*.lua` (por el nombre en inglés). Nunca se inventa ni
// se traduce a mano un nombre: lo que Questie no trae, no está.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TEXTO = '"((?:[^"\\\\]|\\\\.)*)"';
const desescapar = (s) => s.replace(/\\(.)/g, '$1');

// Lee `dirLocalization` (la carpeta `Questie/Localization`). Devuelve {en: Map(areaId -> nombre), es: Map(nombre en -> nombre es)}.
// Solo vale lo que carga el .toc de la edición (`rutaToc`, p. ej. Questie_Forever.toc): `lookupZones.lua` siempre y
// `lookupZonesCorrections.lua` solo si ese .toc lo lista. El Forever no lo carga (lo hace Questie_Mists.toc): esas
// correcciones son de Cataclysm y Mists (p. ej. «Northern Barrens» por «The Barrens») y no valen para un cliente Classic.
export function leerNombresZonas(dirLocalization, rutaToc) {
  // Sin .toc no se aplican correcciones; las líneas comentadas (`#`) del .toc no cuentan.
  const cargaCorrecciones = rutaToc !== undefined && existsSync(rutaToc)
    && readFileSync(rutaToc, 'utf8').split(/\r?\n/).some((l) => !/^\s*#/.test(l) && /lookupZonesCorrections\.lua/i.test(l));
  const en = new Map();
  const es = new Map();

  const rutaBase = join(dirLocalization, 'lookups', 'lookupZones.lua');
  if (existsSync(rutaBase)) {
    const linea = new RegExp(`^\\s*\\[(\\d+)\\]\\s*=\\s*${TEXTO}\\s*,?\\s*$`);
    for (const l of readFileSync(rutaBase, 'utf8').split(/\r?\n/)) {
      const m = linea.exec(l);
      if (m) en.set(Number(m[1]), desescapar(m[2])); // las líneas comentadas (--) no encajan
    }
  }

  // Correcciones (solo si el .toc las carga): solo las líneas sueltas `alias[area] = "nombre"` (sin sangría). Las que están dentro de un `if` de
  // expansión posterior (con sangría) no valen para el Forever.
  const rutaCorrecciones = join(dirLocalization, 'lookups', 'lookupZonesCorrections.lua');
  if (cargaCorrecciones && existsSync(rutaCorrecciones)) {
    const linea = new RegExp(`^\\w+\\[(\\d+)\\]\\s*=\\s*${TEXTO}\\s*$`);
    for (const l of readFileSync(rutaCorrecciones, 'utf8').split(/\r?\n/)) {
      const m = linea.exec(l);
      if (m) en.set(Number(m[1]), desescapar(m[2]));
    }
  }

  const dirZonas = join(dirLocalization, 'Translations', 'Zones');
  if (existsSync(dirZonas)) {
    const bloque = new RegExp(`\\[${TEXTO}\\]\\s*=\\s*\\{([^}]*)\\}`, 'g');
    const esIgual = /\["esES"\]\s*=\s*true/;
    const esES = new RegExp(`\\["esES"\\]\\s*=\\s*${TEXTO}`);
    for (const archivo of readdirSync(dirZonas).filter((f) => f.endsWith('.lua')).sort()) {
      const texto = readFileSync(join(dirZonas, archivo), 'utf8');
      for (const m of texto.matchAll(bloque)) {
        const t = esES.exec(m[2]);
        if (t) es.set(desescapar(m[1]), desescapar(t[1]));
        else if (esIgual.test(m[2])) es.set(desescapar(m[1]), desescapar(m[1])); // `esES = true`: igual que en inglés
      }
    }
  }
  return { en, es };
}
