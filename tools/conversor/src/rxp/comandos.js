// Traducción de los pasos de RestedXP a elementos normalizados, requisitos y etiquetas.
// Especificación: docs/plano-restedxp/2-comandos.md (fichas de cada comando, tabla 1.1 de prefijos
// y flags, §14) y 1-cargador-y-pasos.md §2 (etiquetas de paso). Código original de referencia:
// RXPGuides/functions.lua (parseo de cada comando) y GuideLoader.lua:977-1087 (`parseLine`).
//
// Reglas comunes:
// - `t` conserva el nombre del comando de RestedXP. Los prefijos `<`/`>` y los flags ya van
//   interpretados en campos explícitos. Los efectos de las condiciones siguen el contrato de la
//   fase 2: `efecto` = "objetivo" | "saltar_si_alcanzado" | "saltar_si_no_alcanzado"; `invertir`
//   solo aparece junto a "objetivo" (en las condiciones la inversión ya va dentro de `efecto`).
// - `padre` es el índice (en `elementos`) del último objetivo anterior del paso: el último elemento
//   con texto y casilla, o con texto dinámico (`complete`, `collect`, `cast` sin texto…), como
//   `addon.lastObjective` en GuideLoader.lua:1064-1069.
// - Si un comando da error al parsear, el original no crea elemento pero su texto `>>` queda como
//   texto suelto (GuideLoader.lua:1052): aquí, aviso + `{t: "nota"}` con ese texto.
import { analizarFiltro, yFiltro, oFiltro, negarFiltro, evaluarFiltro } from './filtros.js';
import { numeroLua as num, idMapa, punto, convertirGoto } from './coordenadas.js';

/** Los 72 comandos de la tabla 1 del plano 2, con su clase. */
export const COMANDOS = {
  goto: 'NAVEGACIÓN', target: 'PRESCINDIBLE', turnin: 'ACCIÓN', accept: 'ACCIÓN', complete: 'ACCIÓN',
  mob: 'PRESCINDIBLE', collect: 'ACCIÓN', isOnQuest: 'CONDICIÓN', xp: 'ACCIÓN o CONDICIÓN',
  itemcount: 'CONDICIÓN', trainer: 'ACCIÓN', train: 'ACCIÓN o CONDICIÓN', fly: 'ACCIÓN',
  itemStat: 'CONDICIÓN', zoneskip: 'CONDICIÓN', skill: 'ACCIÓN o CONDICIÓN', vendor: 'ACCIÓN',
  isQuestTurnedIn: 'CONDICIÓN', use: 'ACCIÓN', zone: 'ACCIÓN + NAVEGACIÓN', isQuestComplete: 'CONDICIÓN',
  unitscan: 'PRESCINDIBLE', hs: 'ACCIÓN', money: 'CONDICIÓN', cast: 'ACCIÓN', link: 'PRESCINDIBLE',
  waypoint: 'NAVEGACIÓN', subzoneskip: 'CONDICIÓN', loop: 'NAVEGACIÓN', fp: 'ACCIÓN', home: 'ACCIÓN',
  disablecheckbox: 'CONDICIÓN', isQuestAvailable: 'CONDICIÓN', abandon: 'ACCIÓN', deathskip: 'ACCIÓN',
  skipgossipid: 'PRESCINDIBLE', cooldown: 'CONDICIÓN', subzone: 'ACCIÓN + NAVEGACIÓN',
  maxlevel: 'CONDICIÓN', usespell: 'ACCIÓN', bankdeposit: 'ACCIÓN', pin: 'NAVEGACIÓN',
  line: 'NAVEGACIÓN', destroy: 'ACCIÓN', timer: 'PRESCINDIBLE', bankwithdraw: 'ACCIÓN',
  bindlocation: 'CONDICIÓN', skipgossip: 'PRESCINDIBLE', dungeon: 'REQUISITO', isNotOnQuest: 'CONDICIÓN',
  aura: 'ACCIÓN o CONDICIÓN', macro: 'PRESCINDIBLE', isQuestNotComplete: 'CONDICIÓN',
  bronzetube: 'CONDICIÓN', stable: 'ACCIÓN', group: 'REQUISITO', equip: 'ACCIÓN o CONDICIÓN',
  reputation: 'ACCIÓN o CONDICIÓN', enabledungeon: 'REQUISITO', daily: 'ACCIÓN', dailyturnin: 'ACCIÓN',
  istrained: 'CONDICIÓN', xpto60: 'ACCIÓN', showwhiledead: 'CONDICIÓN', gossipoption: 'ACCIÓN',
  openmap: 'PRESCINDIBLE', xpcheck: 'PRESCINDIBLE', blastedLands: 'ACCIÓN', addquestitem: 'PRESCINDIBLE',
  solo: 'REQUISITO', next: 'NAVEGACIÓN', clicknext: 'NAVEGACIÓN', engrave: 'PRESCINDIBLE',
};
// `itemStat` es CONDICIÓN, como en el plano (decisión R21: se conserva como elemento).

// Mazmorras de Forever y sus otros nombres (DB/forever/db.lua:117-166). Los nombres que son ID de
// área también valen como alias (`alternateNames[strupper(name)] = tag`).
export const MAZMORRAS = {
  RFC: 2437, DM: 1581, WC: 718, SFK: 209, BFD: 719, STOCKS: 717, GNOMER: 133, RFK: 491, SM: 796,
  RFD: 722, ULDA: 1337, ZF: 978, MARA: 2100, ST: 1417, BRD: 1584, DME: 2557, SCHOLO: 2057,
  STRAT: 2017, LBRS: 1583, HOT: 16919, ROL: 153, ES: 16732, COD: 16544, TDC: 17853, KS: 17780,
  AP: 2079, BH: 1216, TST: 16985,
};
const ALIAS_MAZMORRA = {
  DEADMINES: 'DM', VC: 'DM', STOCKADES: 'STOCKS', "TEMPLE OF ATAL'HAKKAR": 'ST', DMW: 'DME', DMN: 'DME',
  BMH: 'BH', SHT: 'TST', SH: 'TDC', DC: 'TDC', ESW: 'ES', AI: 'AP',
};
for (const [sigla, area] of Object.entries(MAZMORRAS)) ALIAS_MAZMORRA[String(area)] = sigla;
/** `GetDungeonName`: la sigla de una mazmorra (sin distinguir mayúsculas) o `undefined`. */
function siglaMazmorra(texto) {
  const m = String(texto ?? '').toUpperCase();
  if (MAZMORRAS[m] !== undefined) return m;
  return ALIAS_MAZMORRA[m];
}

// `addon.repStandingID` (DB/shared.lua:15-24).
const RANGOS = { hated: 1, hostile: 2, unfriendly: 3, neutral: 4, friendly: 5, honored: 6, revered: 7, exalted: 8 };

// Tabla de `.blastedLands` (functions.lua:5038-5050 y 5078): objetos en el orden del código y, por
// misión, cuántos de cada uno pide mientras no esté entregada.
const BLASTED_OBJETOS = [8396, 8394, 8392, 8393, 8391];
const BLASTED_MISIONES = [
  { q: 2583, n: [0, 1, 3, 2, 0] }, { q: 2601, n: [2, 10, 0, 0, 0] }, { q: 2585, n: [2, 0, 1, 3, 0] },
  { q: 2581, n: [0, 0, 2, 1, 3] }, { q: 2603, n: [10, 0, 0, 0, 2] },
];

class Falla extends Error {}

const condicion = (inv) => (inv ? 'saltar_si_no_alcanzado' : 'saltar_si_alcanzado');
/** Lista de números; los que no lo son dan aviso y se quitan. */
function numeros(args, h, que) {
  const sal = [];
  for (const a of args) {
    const v = num(a);
    if (v === undefined) h.aviso(`${que} no numérico: "${a}"`, 'argumento-no-numerico');
    else sal.push(v);
  }
  return sal;
}
/** Todos los números que aparecen en un texto (`5/6` → [5, 6]). */
const numerosDe = (texto) => [...String(texto ?? '').matchAll(/\d+/g)].map((m) => Number(m[0]));
/** Nombres de PNJ de `.target`, `.mob` y `.unitscan` (plano 2 §8): `Nombre::id`, `id` o `Nombre`. */
function pnjs(args) {
  return args.map((a) => {
    const m = /^(.*)::(\d+)$/.exec(a);
    if (m) return m[1] === '' ? { id: Number(m[2]) } : { nombre: m[1].trim(), id: Number(m[2]) };
    if (/^\d+$/.test(a)) return { id: Number(a) };
    return { nombre: a };
  });
}
/** Destinos de `.next` y `.clicknext`: lista separada por `;`, en crudo (los resuelve la tarea 11). */
const guias = (texto) => String(texto ?? '').split(';').map((s) => s.trim()).filter((s) => s !== '');
/** Segmentos `x1,y1,x2,y2…` en pares; un número que no lo es da error. */
function pares(args, h) {
  const v = args.map((a) => {
    const n = num(a);
    if (n === undefined) throw new Falla(`Coordenada no numérica: "${a}"`);
    return n;
  });
  if (v.length < 2) throw new Falla('Faltan coordenadas');
  if (v.length % 2 === 1) h.aviso('Número impar de coordenadas: se ignora la última', 'coordenadas-impares');
  const sal = [];
  for (let i = 0; i + 1 < v.length; i += 2) sal.push([v[i], v[i + 1]]);
  return sal;
}

// ---------------------------------------------------------------------------------------------
// Traductores. Cada uno recibe (args, texto, h) y devuelve:
//   {el, objetivo?, padre?, req?}  elemento (sin `t`, `linea`, `filtro` ni `padre`);
//                                  `objetivo` = pasa a ser el último objetivo; `padre` = se liga a él;
//   {nada: true, req?}             no hay elemento (su texto `>>`, si lo hay, queda como nota);
//   {descartar: true, objetivo?}   PRESCINDIBLE: se cuenta y su texto queda como nota;
//   {marcarPadre: {...}}           cambia campos del elemento padre (`.disablecheckbox`).
// `h.n(i, que)` exige un número; `h.opt(i, que)` lo admite ausente (con aviso si no es número).
// `texto` es el del elemento salvo que el traductor ponga `el.texto` o `sinTexto`.
// ---------------------------------------------------------------------------------------------
const T = {
  // Plano 2 §2 «.accept id[,flags[,idPrevia]]» (functions.lua:1153-1186).
  accept(a, tx, h) {
    const el = { q: h.n(0, 'ID de misión') };
    const flags = h.opt(1, 'flags') ?? 0;
    if (flags & 1) el.noAuto = true;
    if (flags & 2) {
      const previa = h.opt(2, 'misión previa');
      if (previa !== undefined) el.previa = previa;
    }
    return { el, objetivo: true };
  },
  daily(a, tx, h) {
    if (a.length === 0) throw new Falla('Falta el ID de misión');
    return { el: { qs: a.map((_, i) => h.n(i, 'ID de misión')) }, objetivo: true };
  },
  // Plano 2 §2 «.turnin [-]id[,recompensa[,flags]]» (functions.lua:1373-1410).
  turnin(a, tx, h) {
    let q = h.n(0, 'ID de misión');
    const recompensa = h.opt(1, 'recompensa') ?? 0;
    const flags = h.opt(2, 'flags') ?? 0;
    const el = {};
    if (flags % 2 === 1) el.noAuto = true;
    if (q < 0) {
      q = -q;
      el.siFalta = true;
      if (recompensa > 0) el.siIncompleta = true;
    } else if (recompensa > 0) el.recompensa = recompensa;
    el.q = q;
    return { el, objetivo: true };
  },
  // Plano 2 §2 «.dailyturnin id1,id2,…» (functions.lua:1528-1560): basta entregar una.
  dailyturnin(a, tx, h) {
    if (a.length === 0) throw new Falla('Falta el ID de misión');
    return { el: { qs: a.map((_, i) => h.n(i, 'ID de misión')) }, objetivo: true };
  },
  // Plano 2 §2 «.complete [-]id,objetivo[,objMax[,flags]]» (functions.lua:1798-1829).
  complete(a, tx, h) {
    let q = h.n(0, 'ID de misión');
    const el = { objetivo: h.n(1, 'objetivo') };
    const max = h.opt(2, 'objMax');
    if (max !== undefined && max > 0) el.max = max;
    const flags = h.opt(3, 'flags') ?? 0;
    if (flags % 2 === 1) el.info = true;
    if (q < 0) {
      q = -q;
      el.siFalta = true;
    }
    el.q = q;
    return { el, objetivo: true }; // texto dinámico: siempre es objetivo
  },
  // Plano 2 §2 «.abandon id1[,id2…]» (functions.lua:4074-4108).
  abandon(a, tx, h) {
    const qs = numeros(a, h, 'ID de misión');
    if (qs.length === 0 || num(a[0]) === undefined) throw new Falla('ID de misión no válido');
    const el = { qs };
    if (tx !== undefined && tx.startsWith('*')) {
      el.iconoEntrega = true;
      const resto = tx.slice(1).trim();
      if (resto !== '') el.texto = resto;
      return { el, objetivo: true, sinTexto: true };
    }
    return { el, objetivo: true };
  },
  // Plano 2 §3 (condiciones de misión): `isOnQuest`, `isNotOnQuest`.
  isOnQuest(a, tx, h) {
    if (num(a[0]) === undefined) throw new Falla(`ID de misión no válido: "${a[0] ?? ''}"`);
    return { el: { qs: numeros(a, h, 'ID de misión') } };
  },
  isNotOnQuest(a, tx, h) { return T.isOnQuest(a, tx, h); },
  // Plano 2 §3: `isQuestComplete id[,account]` e `isQuestNotComplete`.
  isQuestComplete(a, tx, h) {
    const el = { q: h.n(0, 'ID de misión') };
    if (a[1] === 'account') el.cuenta = true;
    return { el };
  },
  isQuestNotComplete(a, tx, h) { return T.isQuestComplete(a, tx, h); },
  // Plano 2 §3: `isQuestTurnedIn id1,…[,account]` (functions.lua:4427-4450). Para el jugador es
  // el requisito «misión previa».
  isQuestTurnedIn(a, tx, h) {
    const qs = [];
    let extra;
    for (const v of a) {
      const n = num(v);
      if (n !== undefined) qs.push(n);
      else if (extra === undefined) extra = v;
    }
    if (qs.length === 0) throw new Falla('ID de misión no válido');
    const el = { qs };
    if (extra === 'account') el.cuenta = true;
    const req = { t: 'mision', q: qs[0], estado: 'entregada' };
    if (qs.length > 1) req.alternativas = qs.slice(1);
    return { el, req: [req] };
  },
  // Plano 2 §3: `isQuestAvailable` = `isQuestTurnedIn` invertido (no es un requisito).
  isQuestAvailable(a, tx, h) {
    const { el } = T.isQuestTurnedIn(a, tx, h);
    return { el };
  },

  // Plano 2 §4 «.goto»: tres formas de punto y la tabla de radios (coordenadas.js).
  goto(a, tx, h) {
    const r = convertirGoto(a, { mapas: h.ctx.mapas, ultimaZona: h.ctx.ultimaZona });
    h.ctx.ultimaZona = r.zona;
    if (!r.punto) throw new Falla(r.aviso);
    if (a[3] !== undefined && r.radio === undefined) h.aviso(`Radio no numérico: "${a[3]}" (se toma como sin radio)`, 'argumento-no-numerico');
    const el = { ...r.punto, modo: r.modo };
    if (r.radio !== undefined) el.radio = r.radio;
    const objetivo = r.modo === 'objetivo';
    return { el, objetivo, padre: !objetivo };
  },
  // Plano 2 §4 «.waypoint zona,x,y[,radio[,prioridad|callback…]]» (functions.lua:2104-2188).
  waypoint(a, tx, h) {
    const [zArg, x, y, r, prio] = a;
    const zona = zArg ?? h.ctx.ultimaZona;
    h.ctx.ultimaZona = zona;
    const mundo = zona !== undefined && /\/\d+/.test(zona);
    const p = punto(zona, x, y, h.ctx.mapas, { especiales: !mundo });
    if (!p.punto) throw new Falla(p.aviso);
    let radio = num(r);
    if (r !== undefined && radio === undefined) h.aviso(`Radio no numérico: "${r}"`, 'argumento-no-numerico');
    const el = { ...p.punto };
    if (prio !== undefined && num(prio) === undefined) {
      // 6.º argumento con nombre de función: el original lo usa como comprobación con eventos.
      h.aviso(`waypoint con función de comprobación "${prio}": se ignora la función`, 'waypoint-funcion');
      radio = undefined;
    }
    if (radio !== undefined) el.radio = radio;
    // El 6.º argumento, sea cual sea (también "0"), da baja prioridad; radio 0 también.
    const baja = prio !== undefined || radio === 0;
    if (radio !== undefined && radio < 0) {
      el.modo = 'cercano';
      el.persistente = true; // se oculta al llegar a |radio| y vuelve al alejarse
    } else if (baja) el.modo = 'baja';
    else el.modo = radio !== undefined && radio > 0 ? 'paso' : 'flecha';
    el.sinPin = true;
    return { el, padre: true };
  },
  // Plano 2 §4 «.pin zona,x,y[,tooltip]» (functions.lua:2230-2290): pin sin flecha.
  pin(a, tx, h) {
    const [zArg, x, y, tooltip] = a;
    const zona = zArg ?? h.ctx.ultimaZona;
    h.ctx.ultimaZona = zona;
    const mundo = zona !== undefined && /\/\d+/.test(zona);
    const p = punto(zona, x, y, h.ctx.mapas, { especiales: !mundo });
    if (!p.punto) throw new Falla(p.aviso);
    const el = { ...p.punto, modo: 'pin' };
    if (tooltip !== undefined) el.tooltip = tooltip;
    return { el, padre: true };
  },
  // Plano 2 §4 «.line [+]zona,x1,y1,…» (functions.lua:2468-2517). El `+` no se quita en el original
  // (`zone:sub(2-1)`), así que con un nombre la línea falla; con la forma de mundo sí funciona.
  line(a, tx, h) {
    let zona = a[0];
    const el = {};
    if (zona !== undefined && zona.startsWith('+')) el.centro = true;
    const segs = pares(a.slice(1), h);
    const mundo = zona !== undefined ? /(\d+)\/(\d+)/.exec(zona) : null;
    if (mundo) {
      zona = mundo[1];
      h.ctx.ultimaZona = zona;
      const mapa = Number(mundo[1]);
      const inst = Number(mundo[2]);
      el.puntos = segs.map(([wx, wy]) => ({ mapa, inst, wx, wy }));
      return { el, padre: true };
    }
    zona = zona ?? h.ctx.ultimaZona;
    h.ctx.ultimaZona = zona;
    const mapa = idMapa(zona, h.ctx.mapas);
    if (mapa === undefined) throw new Falla(`Mapa desconocido: "${zona}"`);
    el.puntos = segs.map(([x, y]) => ({ mapa, x, y }));
    return { el, padre: true };
  },
  // Plano 2 §4 «.loop [@|+|*]rango,zona,x1,y1,…» (functions.lua:2521-2568).
  loop(a, tx, h) {
    let rango = a[0];
    const el = {};
    if (rango !== undefined) {
      const pre = rango.slice(0, 1);
      if (pre === '+') el.centro = true;
      else if (pre === '*') el.lineaInvisible = true;
      else if (pre === '@') el.sigue = true;
      if (el.centro || el.lineaInvisible || el.sigue) rango = rango.slice(1);
      const r = num(rango);
      if (r === undefined) h.aviso(`Rango no numérico: "${a[0]}"`, 'argumento-no-numerico');
      else el.rango = r;
    }
    const zona = a[1] ?? h.ctx.ultimaZona;
    h.ctx.ultimaZona = zona;
    const mapa = idMapa(zona, h.ctx.mapas);
    if (mapa === undefined) throw new Falla(`Mapa desconocido: "${zona}"`);
    el.puntos = pares(a.slice(2), h).map(([x, y]) => ({ mapa, x, y }));
    return { el, padre: true };
  },
  // Plano 2 §4 «.zone mapa >>texto» (functions.lua:4651-4670): el texto es obligatorio.
  zone(a, tx, h) {
    if (tx === undefined) throw new Falla('.zone sin texto (es obligatorio)');
    const mapa = idMapa(a[0], h.ctx.mapas);
    if (mapa === undefined) throw new Falla(`Mapa desconocido: "${a[0] ?? ''}"`);
    return { el: { mapa }, objetivo: true };
  },
  // Plano 2 §4 «.subzone idÁrea[,flags] >>texto» (functions.lua:4571-4590).
  subzone(a, tx, h) {
    if (tx === undefined) throw new Falla('.subzone sin texto (es obligatorio)');
    return { el: area(a, h), objetivo: true };
  },
  // Plano 2 §5 «.zoneskip mapa[+mapa2/mapa3…][,flags]» (functions.lua:4723-4744).
  zoneskip(a, tx, h) {
    if (a[0] === undefined) throw new Falla('Falta el mapa');
    const mapas = [];
    for (const nombre of a[0].split(/[+/]/).filter((s) => s !== '')) {
      const m = idMapa(nombre, h.ctx.mapas);
      if (m === undefined) h.aviso(`Mapa desconocido en .zoneskip: "${nombre}" (se ignora)`, 'mapa-desconocido');
      else mapas.push(m);
    }
    if (mapas.length === 0) throw new Falla(`Mapa desconocido: "${a[0]}"`);
    const el = { mapas };
    if ((h.opt(1, 'flags') ?? 0) & 1) el.invertir = true;
    return { el };
  },
  // Plano 2 §5 «.subzoneskip idÁrea[,flags]» (functions.lua:4612-4629).
  subzoneskip(a, tx, h) { return { el: area(a, h) }; },
  // Plano 2 §5 «.bindlocation idÁrea[,flags]» (functions.lua:2707-2717).
  bindlocation(a, tx, h) {
    const el = { area: h.n(0, 'ID de área') };
    if ((h.opt(1, 'flags') ?? 0) & 1) el.invertir = true;
    return { el };
  },

  // Plano 2 §6 «.xp [<]N[±xp|.fracción][,s[,etiqueta]]» y tabla 1.1 (functions.lua:3315-3437).
  xp(a, tx, h) {
    if (a[0] === undefined) throw new Falla('Falta el nivel');
    const m = /(<?)\s*(\d+)([+.-]?\d*)/.exec(a[0].replace(/ /g, ''));
    if (!m) throw new Falla(`Nivel no válido: "${a[0]}"`);
    const inv = m[1] === '<';
    const el = { nivel: Number(m[2]) };
    const suf = num(m[3]) ?? 0;
    if (suf < 0) el.faltan = -suf;
    else if (suf >= 1) el.xp = suf;
    else if (suf > 0) el.fraccion = suf;
    const s = h.opt(1, 'salto');
    if (s === undefined) {
      el.efecto = 'objetivo';
      if (inv) el.invertir = true;
      return { el, objetivo: true, req: inv ? [] : [{ t: 'nivel', n: el.nivel }] };
    }
    // Con `s`: sin `<` salta si ya llegaste; con `<`, si aún no; un `s` negativo también invierte.
    const rev = inv !== (s < 0);
    el.efecto = condicion(rev);
    if (!inv) el.segunAjuste = true; // solo se evalúa con «saltar pasos por nivel» activado
    if (a[2] !== undefined) el.etiqueta = a[2];
    return { el, req: rev && a[2] === undefined ? [{ t: 'nivel', n: el.nivel }] : [] };
  },
  // Plano 2 §6 «.maxlevel N[,etiqueta]» (functions.lua:5957-5985).
  maxlevel(a) {
    const m = /(\d+)/.exec(String(a[0] ?? '').replace(/ /g, ''));
    if (!m) throw new Falla(`Nivel no válido: "${a[0] ?? ''}"`);
    const el = { nivel: Number(m[1]) };
    if (a[1] !== undefined) el.etiqueta = a[1];
    return { el };
  },
  // Plano 2 §6 «.money <X|>X[,1]» y tabla 1.1 (functions.lua:3812-3837): el prefijo dice cuándo se
  // salta el paso. X en oro con decimales.
  money(a) {
    const s = a[0] ?? '';
    const pre = s.slice(0, 1);
    if (pre !== '<' && pre !== '>') throw new Falla(`.money necesita < o >: "${s}"`);
    const m = /(\d+\.?\d*)/.exec(s);
    if (!m) throw new Falla(`Cantidad no válida: "${s}"`);
    const el = { cobre: Math.round(Number(m[1]) * 1e4), efecto: condicion(pre === '<') };
    if (a[1] === '1') el.total = true;
    return { el };
  },
  // Plano 2 §6 «.xpto60»: cálculo propio de las rutas clásicas; queda como texto para la fase 2.
  xpto60() { return { el: {}, objetivo: true }; },
  // Plano 2 §6 «.xpcheck»: atajo fijo de la Horda 22-30; se descarta (§14).
  xpcheck(a, tx, h) {
    h.aviso('.xpcheck descartado (atajo propio de RestedXP)', 'xpcheck');
    return { descartar: true };
  },

  // Plano 2 §7 «.collect idObjeto,cantidad[,idMisión[,objFlags[,flags[,a1,a2,a3,a4]]]]»
  // (functions.lua:2985-3065).
  collect(a, tx, h) {
    if (!/^\d+/.test(a[0] ?? '')) throw new Falla(`ID de objeto no válido: "${a[0] ?? ''}"`);
    const ids = numerosDe(a[0]);
    const el = { i: ids[0] };
    if (ids.length > 1) el.is = ids;
    el.n = h.opt(1, 'cantidad') ?? 1;
    const q = h.opt(2, 'ID de misión');
    if (q !== undefined) el.q = q;
    const mascara = h.opt(3, 'objFlags') ?? 0;
    if (mascara !== 0) el.mascara = mascara;
    let flags = h.opt(4, 'flags') ?? 0;
    const [a1, a2, a3, a4] = a.slice(5);
    let multiplicador = 1;
    let profesion;
    if (flags < 0) {
      multiplicador = -flags;
      profesion = a1;
      flags = 3;
    }
    if (flags & 0x1) el.sinCasilla = true;
    if (flags & 0x2) el.restar = true;
    if (flags & 0x4) el.porObjetivos = true;
    if (flags & 0x8) el.banco = true;
    if (flags & 0x10) el.noAlEntregar = true;
    if (flags & 0x40) {
      el.siNinguno = true;
      if (a1 !== undefined) el.ignorarBanco = true;
    }
    if (a1 !== undefined && el.restar && multiplicador === 1) multiplicador = num(a1) ?? 1;
    if (flags & 0x20) {
      profesion = a1;
      multiplicador = num(a2) ?? 1;
      const ini = num(a3) ?? 0;
      const min = num(a4) ?? 0;
      if (ini !== 0) el.profesionInicio = ini;
      if (min !== 0) el.minimo = min;
    }
    if (profesion !== undefined) el.profesion = profesion;
    if (multiplicador !== 1) el.multiplicador = multiplicador;
    return { el, objetivo: true }; // texto dinámico
  },
  // Plano 2 §7 «.itemcount id[/id2…],[<|>][=]N[,banco]» y tabla 1.1 (functions.lua:6164-6243):
  // el paso se muestra si la cuenta cumple la comparación; si no, se salta.
  itemcount(a) {
    const is = numerosDe(a[0]);
    const m = /([<>]?)(=?)\s*(\d+)/.exec(String(a[1] ?? '').replace(/ /g, ''));
    if (is.length === 0 || !m) throw new Falla('ID de objeto o cantidad no válidos');
    const n = Number(m[3]);
    const op = m[1] === '<' ? (m[2] ? '<=' : '<') : m[1] === '>' ? (m[2] ? '>=' : '>') : (m[2] ? '==' : '>=');
    const el = { is, op, n, efecto: 'saltar_si_no_alcanzado' };
    if (a[2] !== undefined) el.banco = true; // el original pasa el texto tal cual: cualquiera vale
    const minimo = op === '>=' || op === '==' ? n : op === '>' ? n + 1 : undefined;
    const req = [];
    if (minimo !== undefined) {
      const r = { t: 'objeto', i: is[0], n: minimo };
      if (is.length > 1) r.is = is;
      req.push(r);
    }
    return { el, req };
  },
  // Plano 2 §7 «.itemStat hueco,STAT,[<|>]valor» y tabla 1.1 (functions.lua:7387-7449): el paso se
  // muestra si la estadística del objeto equipado en `hueco` cumple «stat op valor» (sin prefijo,
  // igualdad); si no, se salta. Con el hueco vacío o sin esa estadística no hace nada. Sin casilla
  // (`textOnly`): no pasa a ser el último objetivo. Decisión R21 (revoca R12): se conserva.
  itemStat(a) {
    const hueco = num(a[0]);
    const m = /^([<>]?)(.+)$/.exec(String(a[2] ?? '').replace(/ /g, ''));
    if (hueco === undefined || !a[1] || !m) throw new Falla('Argumentos no válidos (hacen falta hueco, estadística y valor)');
    const valor = num(m[2]) ?? m[2];
    return { el: { hueco, stat: a[1], op: m[1] === '' ? '==' : m[1], valor, efecto: 'saltar_si_no_alcanzado' } };
  },
  // Plano 2 §7 «.destroy id» (functions.lua:3255-3276).
  destroy(a, tx, h) {
    // Con texto, el original lo guarda como `rawtext` y el elemento no queda como último objetivo.
    return { el: { i: h.n(0, 'ID de objeto') }, objetivo: tx === undefined };
  },
  // Plano 2 §7 «.use id[:arg],…» (functions.lua:6026-6045). `:p` = mostrar el botón aunque no lo lleves.
  use(a, tx, h) { return usar(a, h, 'is'); },
  // Plano 2 §7 «.usespell idHechizo,…» (mismo código que `.use`).
  usespell(a, tx, h) { return usar(a, h, 'spells'); },
  // Plano 2 §7 «.macro»: PRESCINDIBLE. El texto `>>` es el cuerpo de la macro: no pasa a nota.
  macro() { return { descartar: true, sinNota: true }; },
  // Plano 2 §7 «.equip [-]hueco[,idObjeto] [>>texto]» (functions.lua:7940-7978).
  equip(a, tx, h) {
    let hueco = h.n(0, 'hueco');
    let inv = false;
    if (hueco < 0) {
      hueco = -hueco;
      inv = true;
    }
    const el = { hueco };
    const i = h.opt(1, 'ID de objeto');
    if (i !== undefined) el.i = i;
    return conTextoUObjetivo(el, inv, tx);
  },
  // Plano 2 §7 «.bankdeposit id1,…» (functions.lua:5450-5460).
  bankdeposit(a, tx) {
    return { el: { is: a.map((v) => num(v) ?? v) }, objetivo: tx !== undefined };
  },
  // Plano 2 §7 «.bankwithdraw id1,…» (functions.lua:5474-5488).
  bankwithdraw(a, tx) {
    return { el: { is: a.map((v) => num(v) ?? v) }, objetivo: tx !== undefined };
  },
  // Plano 2 §7 «.bronzetube [rev]» (functions.lua:5547-5571).
  bronzetube(a) { return { el: a[0] !== undefined ? { invertir: true } : {} }; },
  // Plano 2 §7 «.blastedLands»: se guardan los datos para que la fase 2 calcule el recuento.
  blastedLands() {
    return { el: { objetos: [...BLASTED_OBJETOS], misiones: BLASTED_MISIONES.map((m) => ({ q: m.q, n: [...m.n] })) }, objetivo: true };
  },
  // Plano 2 §7 «.addquestitem»: PRESCINDIBLE (dato para la base).
  addquestitem() { return { descartar: true }; },

  // Plano 2 §8 «.target/.mob/.unitscan nombre1;nombre2;…» (functions.lua:4972-5031): se guardan los
  // PNJ (datos útiles); un `+` delante del primero lo liga al objetivo anterior.
  target(a) { return objetivosPnj(a); },
  mob(a) { return objetivosPnj(a); },
  unitscan(a) { return objetivosPnj(a); },
  // Plano 2 §8 «.vendor/.trainer/.stable [idPNJ]» (functions.lua:3706-3781).
  vendor(a, tx, h) { return servicio(h); },
  trainer(a, tx, h) { return servicio(h); },
  stable(a, tx, h) { return servicio(h); },
  // Plano 2 §8 «.train idHechizo[,flags]» (functions.lua:3965-3994): flag 1 = condición, flag 2 = invierte.
  train(a, tx, h) {
    const el = { spell: h.n(0, 'ID de hechizo') };
    const flags = h.opt(1, 'flags') ?? 0;
    const inv = (flags & 2) === 2;
    if (flags & 1) {
      el.efecto = condicion(inv);
      return { el };
    }
    el.efecto = 'objetivo';
    if (inv) el.invertir = true;
    return { el, objetivo: tx !== undefined };
  },
  // Plano 2 §8 «.istrained id1,id2,…» (functions.lua:4049-4062).
  istrained(a, tx, h) { return { el: { spells: numeros(a, h, 'ID de hechizo') } }; },
  // Plano 2 §8 «.fp [nombre][,flags]» (functions.lua:2754-2784).
  fp(a, tx, h) {
    const el = {};
    if (a[0] !== undefined && /\w/.test(a[0])) el.nombre = a[0];
    const flags = h.opt(1, 'flags');
    if (flags === undefined) return { el, objetivo: true };
    if (flags % 2 === 1) el.sinCasilla = true;
    if (flags & 2) el.ignorarMensaje = true;
    return { el, objetivo: tx !== undefined && !el.sinCasilla };
  },
  // Plano 2 §8 «.fly destino [>>texto]» (functions.lua:2833-2854).
  fly(a, tx) {
    if (tx === undefined && a[0] === undefined) throw new Falla('.fly sin texto ni destino');
    return { el: a[0] !== undefined && /\w/.test(a[0]) ? { destino: a[0] } : {}, objetivo: true };
  },
  // Plano 2 §8 «.hs >>texto» (functions.lua:2572-2581): el texto es obligatorio.
  hs(a, tx) {
    if (tx === undefined) throw new Falla('.hs sin texto (es obligatorio)');
    return { el: {}, objetivo: true };
  },
  // Plano 2 §8 «.home [idÁrea] [>>texto]» (functions.lua:2657-2670).
  home(a, tx, h) {
    const area = h.opt(0, 'ID de área');
    if (tx === undefined && area === undefined) throw new Falla('.home sin texto ni área');
    return { el: area !== undefined ? { area } : {}, objetivo: true };
  },
  // Plano 2 §8 «.deathskip» (functions.lua:2907-2919). Marca el paso softcore: en Forever no cambia nada.
  deathskip() { return { el: {}, objetivo: true }; },
  // Plano 2 §8 «.skipgossip» y «.skipgossipid»: PRESCINDIBLES. `.skipgossip` tiene texto dinámico,
  // así que en el original pasa a ser el último objetivo (los padres siguientes no se emiten).
  skipgossip() { return { descartar: true, objetivo: true }; },
  skipgossipid() { return { descartar: true }; },
  // Plano 2 §8 «.gossipoption idOpción [>>texto]» (functions.lua:5898-5921).
  gossipoption(a, tx, h) { return { el: { id: h.n(0, 'ID de opción') }, objetivo: tx !== undefined }; },

  // Plano 2 §9 «.skill profesión,[<]N[,s[,max]]» (functions.lua:3439-3463).
  skill(a, tx, h) {
    const m = /(<?)\s*(\d+)/.exec(String(a[1] ?? '').replace(/ /g, ''));
    if (!m || a[0] === undefined) throw new Falla('Profesión o nivel no válidos');
    const inv = m[1] === '<';
    const el = { p: a[0], n: Number(m[2]) };
    if (a[3] !== undefined) el.maximo = true;
    const s = h.opt(2, 'salto');
    const req = [{ t: 'profesion', p: el.p, n: el.n }];
    if (s === undefined) {
      el.efecto = 'objetivo';
      if (inv) el.invertir = true;
      return { el, objetivo: tx !== undefined, req: inv ? [] : req };
    }
    el.efecto = condicion(inv);
    return { el, req: inv ? req : [] };
  },
  // Plano 2 §9 «.reputation idFacción,rango[,[<]valor][,s]» (functions.lua:3596-3666).
  reputation(a, tx, h) {
    const faccion = num(a[0]);
    let op = '';
    let rango;
    let rep;
    const m = /(<?)\s*([0-9A-Za-z]+)([+.-]?\d*)/.exec(String(a[1] ?? '').replace(/ /g, ''));
    if (m) {
      op = m[1];
      rango = RANGOS[m[2].toLowerCase()];
      rep = m[3];
    }
    if (a[2] !== undefined) {
      const v = /(<?)\s*(-?\d+\.?\d*)/.exec(a[2]);
      op = v?.[1];
      rep = v?.[2];
    }
    if (faccion === undefined || rango === undefined) throw new Falla(`Facción o rango no válidos: "${a[0] ?? ''}", "${a[1] ?? ''}"`);
    const valor = num(a[2]) ?? num(rep) ?? 0;
    const inv = op === '<';
    const el = { faccion, rango };
    if (valor !== 0) el.valor = valor;
    const req = { t: 'reputacion', faccion, rango };
    if (valor !== 0) req.valor = valor;
    if (a[3] !== undefined) { // el original acepta cualquier texto como 4.º argumento
      el.efecto = condicion(inv);
      return { el, req: inv ? [req] : [] };
    }
    el.efecto = 'objetivo';
    if (inv) el.invertir = true;
    return { el, objetivo: true, req: inv ? [] : [req] };
  },
  // Plano 2 §9 «.aura [-]idHechizo[,duración][,unidad]» (functions.lua:7852-7882).
  aura(a, tx, h) {
    let spell = h.n(0, 'ID de aura');
    let inv = false;
    const el = {};
    if (a[1] !== undefined) {
      const m = /(<?)\s*(\d+)([-+]?)/.exec(a[1]);
      if (m) {
        if (m[1] === '<' || m[3] === '-') inv = true;
        if (m[3] === '+' || m[3] === '-') el.cargas = Number(m[2]);
        else if (Number(m[2]) !== 0) el.dur = Number(m[2]);
      }
    }
    if (spell < 0) {
      spell = -spell;
      inv = !inv;
    }
    el.spell = spell;
    if (a[2] !== undefined) el.unidad = a[2];
    return conTextoUObjetivo(el, inv, tx);
  },
  // Plano 2 §9 «.cooldown tipo,id,[<|>]N[m|s][,1]» y tabla 1.1 (functions.lua:6325-6411): salta el
  // paso si lo que falta es `op` N (sin prefijo = `>`). `seg` va sin el mínimo de 2 s del original.
  cooldown(a, tx, h) {
    const id = h.n(1, 'ID');
    if (a[2] === undefined) throw new Falla('Falta el tiempo');
    const m = /([<>]?)\s*(\d+[^\w\s]?\d*)\s*([ms]?)/.exec(a[2]);
    let seg = (m && num(m[2])) ?? 0;
    if (m?.[3] === 'm') seg *= 60;
    const el = { tipo: a[0], id, op: m?.[1] === '<' ? '<' : '>', seg, efecto: 'saltar_si_alcanzado' };
    if (a[3] !== undefined) el.unaVez = true;
    return { el };
  },
  // Plano 2 §9 «.cast [unidad,]idHechizo1,…» (functions.lua:4841-4874). Con o sin texto queda como
  // último objetivo (sin texto, por el texto dinámico).
  cast(a, tx, h) {
    const el = {};
    let resto = a;
    if (a.length > 0 && num(a[0]) === undefined) {
      el.unidad = a[0];
      resto = a.slice(1);
    }
    el.spells = numeros(resto, h, 'ID de hechizo');
    return { el, objetivo: true };
  },
  // Plano 2 §9 «.engrave»: runas de SoD; en Forever la línea no existe.
  engrave(a, tx, h) {
    h.aviso('.engrave descartado (solo existe en Season of Discovery)', 'engrave');
    return { descartar: true };
  },

  // Plano 2 §10 «.group [N]»: requisito de grupo (O11). El texto, si lo hay, queda como nota.
  group(a, tx, h) {
    const n = h.opt(0, 'tamaño del grupo');
    return { nada: true, req: [n !== undefined ? { t: 'grupo', n } : { t: 'grupo' }] };
  },
  // Plano 2 §10 «.solo»: marca el paso como «en solitario» (ajuste de grupo de la fase 2).
  solo() { return { el: {} }; },
  // Plano 2 §10 «.dungeon [!]SIGLA»: requisito de mazmorra; `!` = solo si no está activada.
  dungeon(a) {
    const raw = a[0] ?? '';
    const neg = raw.startsWith('!');
    const sigla = siglaMazmorra(neg ? raw.slice(1) : raw);
    if (!sigla) throw new Falla(`Mazmorra desconocida: "${raw}"`);
    return { nada: true, req: [{ t: 'mazmorra', d: (neg ? '!' : '') + sigla }] };
  },
  // Plano 2 §10 «.enabledungeon [!]SIGLA»: activa o desactiva la mazmorra en toda la guía (lo
  // resuelve la tarea 11 en `Guia.mazmorras`).
  enabledungeon(a) {
    const raw = a[0] ?? '';
    const neg = raw.startsWith('!');
    const sigla = siglaMazmorra(neg ? raw.slice(1) : raw);
    if (!sigla) throw new Falla(`Mazmorra desconocida: "${raw}"`);
    return { el: { d: sigla, activar: !neg } };
  },
  // Plano 2 §10 «.disablecheckbox»: no hay elemento propio; el padre queda sin casilla.
  disablecheckbox() { return { marcarPadre: { sinCasilla: true } }; },
  // Plano 2 §10 «.timer segundos,texto[,callback…]»: cuenta atrás al completar el padre.
  timer(a, tx, h) {
    const el = {};
    const seg = h.opt(0, 'segundos');
    if (seg !== undefined) el.seg = seg;
    if (a[1] !== undefined) el.rotulo = a[1];
    if (a[2] !== undefined) h.aviso(`.timer con función "${a[2]}": se ignora la función`, 'timer-funcion');
    return { el, padre: true };
  },
  // Plano 2 §10 «.showwhiledead» (functions.lua:8596-8607).
  showwhiledead() { return { el: {} }; },
  // Plano 2 §10 «.link url >>texto»: PRESCINDIBLE; queda el texto como nota.
  link() { return { descartar: true }; },
  // Plano 2 §10 «.next [grupo\guía]» (functions.lua:3854-3859): solo cuenta el 1.er argumento.
  next(a) {
    const g = guias(a[0]);
    return { el: g.length > 0 ? { guias: g } : {} };
  },
  // Plano 2 §10 «.clicknext grupo\guía >>texto» (functions.lua:4761-4775): texto obligatorio.
  clicknext(a, tx) {
    if (a[0] === undefined || tx === undefined) throw new Falla('.clicknext necesita guía y texto');
    return { el: { guias: guias(a[0]) } };
  },
  // Plano 2 §4 «.openmap»: PRESCINDIBLE.
  openmap() { return { descartar: true }; },
};

/** `.subzone` y `.subzoneskip`: área, flag 1 invierte y flag 2 solo vale dentro de instancias. */
function area(a, h) {
  const el = { area: h.n(0, 'ID de área') };
  const flags = h.opt(1, 'flags') ?? 0;
  if (flags & 1) el.invertir = true;
  if (flags & 2) el.soloInstancia = true;
  return el;
}
/** `.use` y `.usespell`. */
function usar(a, h, campo) {
  const ids = [];
  const siempre = [];
  for (const v of a) {
    const m = /(\d+):?(\S*)/.exec(v);
    if (!m) throw new Falla(`ID no válido: "${v}"`);
    ids.push(Number(m[1]));
    if (m[2] === 'p') siempre.push(Number(m[1]));
    else if (m[2] !== '') h.aviso(`Argumento desconocido en .${campo === 'is' ? 'use' : 'usespell'}: "${v}"`, 'argumento-desconocido');
  }
  const el = { [campo]: ids };
  if (siempre.length > 0) el.siempre = siempre;
  return { el };
}
/** `.equip` y `.aura`: con texto son objetivo; sin texto, condición que salta el paso. */
function conTextoUObjetivo(el, inv, tx) {
  if (tx !== undefined) {
    el.efecto = 'objetivo';
    if (inv) el.invertir = true;
    return { el, objetivo: true };
  }
  el.efecto = condicion(inv);
  return { el };
}
/** `.vendor`, `.trainer`, `.stable`. */
function servicio(h) {
  const npc = h.opt(0, 'ID de PNJ');
  return { el: npc !== undefined ? { npc } : {}, objetivo: true };
}
/** `.target`, `.mob`, `.unitscan`. */
function objetivosPnj(a) {
  const lista = [...a];
  let padre = false;
  if (lista[0] !== undefined && lista[0].startsWith('+')) {
    lista[0] = lista[0].slice(1).trim();
    padre = true;
  }
  return { el: { npcs: pnjs(lista.filter((s) => s !== '')) }, padre };
}

// ---------------------------------------------------------------------------------------------
// Etiquetas de paso (plano 1 §2.2).
// ---------------------------------------------------------------------------------------------
const ETIQUETAS = new Set([
  'completewith', 'label', 'sticky', 'optional', 'requires', 'level', 'loop', 'map', 'icon', 'ignorecorpse',
  'hidewindow', 'title', 'arrowtext', 'track', 'tip', 'include', 'phase', 'season', 'era', 'som', 'era/som',
  'ah', 'ssf', 'softcore', 'hardcore', 'softcoreserver', 'hardcoreserver', 'xprate', 'maxlevel', 'daily',
  'fresh', 'veteran', 'questguide', 'speedrunguide', 'beta', 'disabled',
]);
// Erratas vistas en las guías reales cuya corrección es obvia.
const ERRATAS = { sofcore: 'softcore', requres: 'requires', completwith: 'completewith', hardcoore: 'hardcore', 'era/#som': 'era/som' };

/** Distancia de edición (para proponer correcciones de una letra). */
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * Nombre de etiqueta corregido: `{nombre, valor, aviso?}`. Las erratas obvias se corrigen con
 * aviso: la tabla `ERRATAS`, una etiqueta pegada a su valor (`#labelTeleIF`), una letra de
 * diferencia con una sola etiqueta conocida, y `lavel` (label o level) según el valor sea número.
 * Lo demás se conserva tal cual, con aviso.
 */
function corregirEtiqueta(nombreCrudo, valor) {
  const nombre = nombreCrudo.toLowerCase();
  if (ETIQUETAS.has(nombre)) return { nombre, valor };
  if (ERRATAS[nombre]) return { nombre: ERRATAS[nombre], valor, aviso: `Etiqueta mal escrita "#${nombreCrudo}": se lee como #${ERRATAS[nombre]}` };
  const pegada = /^(label|completewith|requires)([A-Z0-9].*)$/.exec(nombreCrudo);
  if (pegada && valor === '') {
    return { nombre: pegada[1], valor: pegada[2], aviso: `Etiqueta mal escrita "#${nombreCrudo}": se lee como #${pegada[1]} ${pegada[2]}` };
  }
  const cerca = [...ETIQUETAS].filter((e) => e.length >= 4 && distancia(nombre, e) === 1);
  let elegida;
  if (cerca.length === 1) [elegida] = cerca;
  else if (cerca.length === 2 && cerca.includes('label') && cerca.includes('level')) {
    elegida = num(valor) !== undefined ? 'level' : 'label';
  }
  if (elegida) return { nombre: elegida, valor, aviso: `Etiqueta mal escrita "#${nombreCrudo}": se lee como #${elegida}` };
  return { nombre, valor, aviso: `Etiqueta desconocida "#${nombreCrudo}": se conserva sin interpretar`, desconocida: true };
}

// Etiquetas que se resuelven al convertir (Forever: temporada 0, fase 6, multiplicador de xp 1,
// siempre softcore; plano 1 §2.2 y RXPGuides.lua:2507-2666). Devuelven si el paso se ve.
const FASE = 6;
const TEMPORADA = 0;
const MULTIPLICADOR = 1;
export const RESUELTAS = {
  era: () => true, // oculto solo en SoM
  som: () => false, // oculto fuera de SoM
  'era/som': () => true, // oculto solo en SoM con fase > 2
  season: (v) => String(v).split(/[,;\s]+/).filter((s) => s !== '').some((s) => num(s) === TEMPORADA),
  phase: (v) => {
    const r = /(\d+)-(\d+)/.exec(String(v));
    const min = r ? Number(r[1]) : num(v);
    const max = r ? Number(r[2]) : 0xffff;
    return min !== undefined && FASE >= min && FASE <= max;
  },
  xprate: (v) => evaluarFiltro(filtroMultiplicador(v), { xp: MULTIPLICADOR }),
  hardcore: () => false,
  softcore: () => true,
  hardcoreserver: () => false,
  softcoreserver: () => true,
};

function filtroMultiplicador(valor) {
  const [, op, desde, hasta] = /^([<>]?)\s*(\d+\.?\d*)-?(\d*\.?\d*)/.exec(String(valor)) ?? [];
  const min = op === '<' ? 0 : (num(desde) ?? 1) + (op === '>' ? 1e-4 : 0);
  const max = op === '<' ? Number(desde) - 1e-4 : (num(hasta) ?? 0xfff);
  return [[`m:${min},${max}`]];
}

export function filtroDeEtiqueta(nombre, valor, xpVariable) {
  return xpVariable && nombre === 'xprate' ? filtroMultiplicador(valor) : RESUELTAS[nombre](valor);
}

// ---------------------------------------------------------------------------------------------
// Traducción de un paso.
// ---------------------------------------------------------------------------------------------
const esFiltroDnf = (f) => Array.isArray(f);
const claveReq = (r) => JSON.stringify(r);

/**
 * Traduce un paso de `analizarGuia` (tarea 8).
 * @param {{linea: number, filtro?: string, lineas: object[]}} paso
 * @param {{mapas: Map<string, number>, archivo?: string, descartados: object, avisos?: object[], ultimaZona?: string}} ctx
 *   `descartados[nombre]` cuenta los comandos descartados, `<<false>>` las líneas con filtro falso y
 *   `#etiqueta` los pasos no emitidos. `ultimaZona` se arrastra entre pasos de la misma guía.
 *   `ctx.avisos` acumula los avisos de todos los pasos.
 * @returns {{elementos: object[], requisitos: object[], etiquetas: object, avisos: object[],
 *   etiquetasPorFiltro?: Array<{nombre, valor, filtro}>, filtro?: object, omitido?: string}}
 *   - `avisos`: solo los de este paso (los mismos que se añaden a `ctx.avisos`);
 *   - `etiquetasPorFiltro`: etiquetas con filtro de clase/raza, en orden; ganan, si su filtro aplica,
 *     sobre `etiquetas[nombre]` (que es la primera sin filtro);
 *   - `filtro`: condición extra para que el paso se vea, que sale de etiquetas resueltas con filtro
 *     (por ejemplo `#som << Paladin` → `!c:PALADIN`); se combina con Y con el filtro del paso;
 *   - `omitido`: la etiqueta que hace que el paso no se emita (`elementos` y demás vacíos).
 */
export function traducirPaso(paso, ctx) {
  ctx.descartados ??= {};
  const archivo = ctx.archivo ?? '';
  const avisos = [];
  const aviso = (linea, mensaje, tipo) => {
    const a = { archivo, linea, mensaje, tipo };
    avisos.push(a);
    ctx.avisos?.push(a);
  };
  const contar = (k) => { ctx.descartados[k] = (ctx.descartados[k] ?? 0) + 1; };

  const elementos = [];
  const requisitos = [];
  const etiquetas = {};
  const porFiltro = [];
  // Para las etiquetas resueltas con filtro: lo ya decidido y lo que oculta el paso, por etiqueta.
  const resueltas = {};
  let ultimo = -1; // índice del último objetivo; null si es un elemento que no se emite
  const textosElite = [];

  const meterReq = (r, filtro) => {
    const req = esFiltroDnf(filtro) ? { ...r, filtro } : r;
    if (!requisitos.some((x) => claveReq(x) === claveReq(req))) requisitos.push(req);
  };
  const nota = (texto, linea, filtro) => {
    const el = { t: 'nota', texto, linea };
    if (esFiltroDnf(filtro)) el.filtro = filtro;
    elementos.push(el);
    return el;
  };

  for (const l of paso.lineas) {
    // 1. Filtro de la línea.
    let filtro = true;
    if (l.filtro !== undefined) {
      const r = analizarFiltro(l.filtro, { archivo, linea: l.linea });
      for (const a of r.avisos) aviso(a.linea, a.mensaje, 'filtro');
      filtro = r.filtro;
      if (filtro === false) {
        contar('<<false>>');
        continue;
      }
    }

    // 2. Etiquetas.
    if (l.tipo === 'tag') {
      const c = corregirEtiqueta(l.nombre, (l.texto ?? '').trim());
      if (c.aviso) aviso(l.linea, c.aviso, c.desconocida ? 'etiqueta-desconocida' : 'etiqueta-mal-escrita');
      const valor = c.valor === '' ? true : c.valor;
      if (RESUELTAS[c.nombre]) {
        const r = (resueltas[c.nombre] ??= { decidido: false, oculta: false });
        if (r.decidido === true) continue; // gana la primera
        const aplica = yFiltro(filtro, negarFiltro(r.decidido));
        const visible = filtroDeEtiqueta(c.nombre, valor === true ? '' : valor, ctx.xpVariable);
        r.oculta = oFiltro(r.oculta, yFiltro(aplica, negarFiltro(visible)));
        r.decidido = oFiltro(r.decidido, filtro);
        continue;
      }
      if (etiquetas[c.nombre] !== undefined) continue; // gana la primera
      if (esFiltroDnf(filtro)) porFiltro.push({ nombre: c.nombre, valor, filtro });
      else etiquetas[c.nombre] = valor;
      if (c.nombre === 'level') {
        const n = num(valor);
        if (n === undefined) aviso(l.linea, `#level no numérico: "${valor}"`, 'argumento-no-numerico');
        else meterReq({ t: 'nivel', n }, filtro);
      } else if (c.nombre === 'requires' && valor !== true) {
        meterReq({ t: 'paso', etiqueta: valor }, filtro);
      }
      continue;
    }

    if (l.texto !== undefined) textosElite.push({ texto: l.texto, filtro, cmd: l.nombre });

    // 3. Líneas sin comando.
    if (l.tipo === 'texto' || l.tipo === 'nota') {
      nota(l.texto, l.linea, filtro);
      continue;
    }
    if (l.tipo === 'manual') {
      const el = { t: 'manual', texto: l.texto, linea: l.linea };
      if (esFiltroDnf(filtro)) el.filtro = filtro;
      elementos.push(el);
      ultimo = elementos.length - 1;
      continue;
    }
    if (l.tipo !== 'cmd') continue;

    // 4. Comandos.
    const traductor = Object.hasOwn(T, l.nombre) ? T[l.nombre] : undefined;
    if (!traductor) {
      aviso(l.linea, `Comando desconocido: ".${l.nombre}"`, 'comando-desconocido');
      if (l.texto !== undefined) nota(l.texto, l.linea, filtro);
      continue;
    }
    const args = l.args ?? [];
    const h = {
      ctx,
      aviso: (m, tipo) => aviso(l.linea, `.${l.nombre}: ${m}`, tipo),
      n(i, que) {
        const v = num(args[i]);
        if (v === undefined) throw new Falla(`${que} no numérico: "${args[i] ?? ''}"`);
        return v;
      },
      opt(i, que) {
        if (args[i] === undefined) return undefined;
        const v = num(args[i]);
        if (v === undefined) h.aviso(`${que} no numérico: "${args[i]}" (se ignora)`, 'argumento-no-numerico');
        return v;
      },
    };
    let r;
    try {
      r = traductor(args, l.texto, h);
    } catch (e) {
      if (!(e instanceof Falla)) throw e;
      aviso(l.linea, `.${l.nombre}: ${e.message}`, 'comando-no-valido');
      if (l.texto !== undefined) nota(l.texto, l.linea, filtro);
      continue;
    }

    for (const req of r.req ?? []) meterReq(req, filtro);
    if (r.descartar) {
      contar(l.nombre);
      if (r.objetivo) ultimo = null;
      if (l.texto !== undefined && !r.sinNota) nota(l.texto, l.linea, filtro);
      continue;
    }
    if (r.marcarPadre) {
      if (ultimo === null || ultimo < 0) aviso(l.linea, `.${l.nombre}: no hay elemento padre`, 'sin-padre');
      else Object.assign(elementos[ultimo], r.marcarPadre);
      if (l.texto !== undefined) nota(l.texto, l.linea, filtro);
      continue;
    }
    if (r.nada) {
      if (l.texto !== undefined) nota(l.texto, l.linea, filtro);
      continue;
    }
    const el = { t: l.nombre, ...r.el };
    if (!r.sinTexto && l.texto !== undefined && el.texto === undefined) el.texto = l.texto;
    if (esFiltroDnf(filtro)) el.filtro = filtro;
    if (r.padre && ultimo !== null && ultimo >= 0) el.padre = ultimo;
    el.linea = l.linea;
    elementos.push(el);
    if (r.objetivo) ultimo = elementos.length - 1;
  }

  // Requisito «élite»: algún texto del paso dice «elite»/«élite».
  let filtroElite = false;
  for (const { texto, filtro, cmd } of textosElite) {
    if (cmd === 'macro') continue; // el texto de `.macro` es el cuerpo de la macro
    if (/(^|[^\p{L}])[eé]lites?(?![\p{L}])/iu.test(texto)) filtroElite = oFiltro(filtroElite, filtro);
  }
  if (filtroElite !== false) meterReq({ t: 'elite' }, filtroElite);

  // Etiquetas resueltas: el paso se omite, o queda un filtro extra.
  let filtroPaso = true;
  let culpable;
  for (const [nombre, r] of Object.entries(resueltas)) {
    if (r.oculta === false) continue;
    culpable ??= nombre;
    filtroPaso = yFiltro(filtroPaso, negarFiltro(r.oculta));
    // Oculto para todos: de golpe (`#som`) o entre varias líneas con filtros que se completan
    // (`#xprate >1.49 << !Paladin` + `#xprate 1.49-1.59 << Paladin`).
    if (filtroPaso === false) {
      const omitido = `#${r.oculta === true ? nombre : culpable}`;
      contar(omitido);
      return { elementos: [], requisitos: [], etiquetas: {}, avisos, omitido };
    }
  }

  const sal = { elementos, requisitos, etiquetas, avisos };
  if (porFiltro.length > 0) sal.etiquetasPorFiltro = porFiltro;
  if (filtroPaso !== true) sal.filtro = filtroPaso;
  return sal;
}
