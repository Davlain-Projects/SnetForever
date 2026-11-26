// Ayuda de las pruebas: un paquete de 4Ever Leveling INVENTADO (nombres, ids, textos y coordenadas), con la misma forma
// que sus Data.lua. 4Ever Leveling es «All Rights Reserved»: aquí no va nada suyo.

// JS -> tabla Lua escrita como la escriben sus archivos (["clave"]=valor, sin espacios).
export function lua(v) {
  if (v === null) return 'nil';
  if (Array.isArray(v)) return `{${v.map(lua).join(',')}}`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}]=${lua(x)}`).join(',')}}`;
  if (typeof v === 'string') return JSON.stringify(v).replace(/\\u00([0-9a-f]{2})/g, (_, h) => `\\${parseInt(h, 16)}`);
  return String(v);
}
export const registro = (id, datos) => `_G.FourEverLevelingContent.Register(${JSON.stringify(id)},"1.0.1",${lua(datos)})\n`;

export const t = (es, en = es) => ({ en, es });
export const paso = (id, capitulo, tareas, loc, extra = {}) => ({
  action: 'manual', chapter: capitulo, completion: 'tasks', conditions: [],
  detail: t(`Haz ${id}`, `Do ${id}`), id, locationId: loc, title: t('Sigue el recorrido', 'Follow the itinerary'),
  reason: t('repetido', 'repeated'), semanticHash: 'abc', tasks: tareas, ...extra,
});
export const tarea = (action, questId) => ({ action, id: `${action}-${questId}`, questId, required: true });

// Un paquete de niveles inventado: dos capítulos; el 1 tiene una variante para dos clases y otra para una, y una más
// solo para una raza; el 2 es el mismo para todas.
export const PAQUETE = {
  classSegments: {
    MAGE: ['horde-10-20-chapter-1-aaa', 'horde-10-20-chapter-2-ccc'],
    PRIEST: ['horde-10-20-chapter-1-aaa', 'horde-10-20-chapter-2-ccc'],
    WARRIOR: ['horde-10-20-chapter-1-bbb', 'horde-10-20-chapter-2-ccc'],
  },
  id: 'horde-10-20',
  locations: [
    { areaID: 1, id: 'loc-1', mapID: 1413, npcId: 70001, title: t('Los Llanos Inventados', 'The Made-up Plains'), waypoint: true, x: 0.5123, y: 0.25 },
    { id: 'loc-2', mapID: 1413, title: t('Otro sitio'), x: 0.1, y: 0.9 },
    { coordinateStatus: 'unmapped', id: 'loc-3', title: t('Sin mapa'), waypoint: false },
  ],
  quests: [
    { id: 90001, minLevel: 10, title: t('Colmillos inventados', 'Made-up Fangs') },
    { id: 90002, minLevel: 11, title: t('La carta perdida', 'The Lost Letter'), conditions: { races: ['Orc'] } },
    { id: 90003, minLevel: 12, title: t('Pruebas de guerrero', 'Warrior Trials') },
    { id: 90004, minLevel: 15, title: t('El segundo capítulo', 'Chapter Two') },
  ],
  segments: {
    'horde-10-20-chapter-1-aaa': {
      chapters: [{ id: 'horde-10-20-chapter-1', level: 10, originalTitle: '10-12 Made-up Plains', title: t('10-12 Llanos Inventados', '10-12 Made-up Plains'), untilLevel: 12 }],
      id: 'horde-10-20-chapter-1-aaa',
      orders: { MAGE: ['p1', 'p2', 'p3'], PRIEST: ['p1', 'p2', 'p3'] },
      revision: 'r1',
    },
    'horde-10-20-chapter-1-bbb': {
      chapters: [{ id: 'horde-10-20-chapter-1', level: 10, title: t('10-12 Llanos Inventados', '10-12 Made-up Plains'), untilLevel: 12 }],
      id: 'horde-10-20-chapter-1-bbb',
      orders: { WARRIOR: ['p1', 'p4', 'p3'] },
    },
    'forever-orc-mage-horde-10-20-chapter-1-aaa': {
      chapters: [{ id: 'horde-10-20-chapter-1', level: 10, title: t('10-12 Llanos Inventados', '10-12 Made-up Plains'), untilLevel: 12 }],
      id: 'forever-orc-mage-horde-10-20-chapter-1-aaa',
      orders: { MAGE: ['v1'] },
    },
    'horde-10-20-chapter-2-ccc': {
      chapters: [{ id: 'horde-10-20-chapter-2', level: 12, title: t('12-15 Colinas de Prueba', '12-15 Test Hills'), untilLevel: 15 }],
      id: 'horde-10-20-chapter-2-ccc',
      orders: { MAGE: ['p5'], PRIEST: ['p5'], WARRIOR: ['p5'] },
    },
  },
  steps: {
    p1: paso('p1', 'horde-10-20-chapter-1', [tarea('accept', 90001), tarea('accept', 90002)], 'loc-1'),
    p2: paso('p2', 'horde-10-20-chapter-1', [tarea('objective', 90001), { action: 'predicate', id: 'x', label: 'algo' }], 'loc-2'),
    p3: paso('p3', 'horde-10-20-chapter-1', [tarea('turn_in', 90001)], 'loc-1', { detail: t('Entrega «Colmillos» y di "os.execute(\'del\')"', 'Turn in') }),
    p4: paso('p4', 'horde-10-20-chapter-1', [tarea('accept', 90003)], 'loc-3', { conditions: { classes: ['WARRIOR'] } }),
    p5: paso('p5', 'horde-10-20-chapter-2', [tarea('accept', 90004), tarea('turn_in', 90004)], 'loc-2'),
    v1: paso('v1', 'horde-10-20-chapter-1', [tarea('accept', 90002)], 'loc-1', { conditions: { classes: ['MAGE'], races: ['Orc'] } }),
  },
  vacio: null,
};

