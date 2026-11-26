// Ayudante de pruebas: construye una Vista (src/questie/vista.js) sobre datos mínimos, sin QuestieDB.
//   misiones: { id: registroDeMision }       pnjs / objetos: { id: { name?, spawns: { areaId: [[x, y], …] } } }
//   zonas ficticias: el uiMap de un área es el propio AreaID; `mazmorras` es el mapa de zonas.mazmorras.
// Las correcciones se pasan en `correcciones` ({ Horde?, Alliance? }, cada una con quest/npc/object/item).
import { crearVista } from '../../src/questie/vista.js';

const aMapa = (obj = {}) => new Map(Object.entries(obj).map(([id, r]) => [Number(id), r]));

// Fuentes mínimas ({entidades, correcciones, zonas}) para crearVista y para guiasDeCadenas.
export function fuentesDePrueba({
  misiones = {}, pnjs = {}, objetos = {}, items = {}, mazmorras = {}, correcciones = {},
}) {
  const entidades = {
    quest: aMapa(misiones), npc: aMapa(pnjs), object: aMapa(objetos), item: aMapa(items),
  };
  const vacias = { quest: {}, npc: {}, object: {}, item: {} };
  const corr = {
    Horde: { ...vacias, ...(correcciones.Horde ?? {}) },
    Alliance: { ...vacias, ...(correcciones.Alliance ?? {}) },
  };
  const zonas = {
    uiMap: (area) => area,
    mazmorras: aMapa(mazmorras),
    avisos: [],
  };
  return { entidades, correcciones: corr, zonas };
}

export function vistaDePrueba({ faccion, clase, ...datos }) {
  return crearVista(fuentesDePrueba(datos), { faccion, clase });
}
