// Convierte guías de RestedXP (RegisterGuide([[ ... ]])) al formato de Mis guías de SnetForever (la global
// SnetForeverMisGuias de SnetForever_MisGuias/mis-guias.lua; ver templates/SnetForever_MisGuias/LEEME.txt).
//
// Sale del conversor que se usó a mano el 15-nov, con estos cambios (17-nov):
//   * Un paso con condición de personaje en la cabecera («step << Warrior», «<< Troll», «<< Horde», «<< !Human»,
//     «<< Human Warrior») ya no se tira: lleva clase / raza / faccion / sin_clase / sin_raza (src/condiciones.js).
//   * Las líneas con condición («.accept 123 << Warrior») parten el paso: lo común en un paso y cada línea con condición
//     en el suyo, en orden (las seguidas con la misma condición, juntas). Antes entraban para todos.
//   * Las condiciones que no son del personaje (tbc, wotlk, sod, skip, niveles...) siguen como antes: en la cabecera el
//     paso se tira y en una línea no cuentan. #xprate, #season y las demás líneas «#» se saltan, como antes.
//   * Con `misiones` (la base de SnetForever_Misiones), las misiones que no están se quitan del paso y el paso que se queda
//     sin nada no sale (lo que hacía limpiar-misiones.js después, a mano).
// Ronda 2:
//   * La condición de la cabecera de la GUÍA («<< Alliance Hunter») va a la guía: su facción (y la etiqueta [A]/[H]) y
//     clase, raza, sin_clase o sin_raza; dentro de ella, los pasos solo miran lo que queda («<< Hunter» vale para todos).
//   * !tbc y !wotlk se cumplen siempre (condiciones.js, CIERTAS); en una línea, lo que no es del personaje se salta y la
//     clase o la raza se quedan. Lo que se sigue tirando se cuenta por palabra (tiradasPorPalabra).
//   * Con `anterior` (el mis-guias.lua de antes), cada paso que ya estaba conserva su id (el de antes: «m<número>» o el
//     que traía; el progreso guardado del jugador va por él) y los nuevos llevan «n<k>» (en una guía que no estaba,
//     «m<número>»). Un paso partido deja el id de antes a su trozo común (ronda 3; si no lo tiene, al primero). Una guía
//     que ahora lleva otra etiqueta sale con la nueva y con `nombre_antes` = el nombre de antes (ronda 3: el addon pasa
//     el progreso guardado de uno a otro); el informe lista los ids de antes que se pierden y los que caen en un paso con
//     filtro.
//
// convertir(archivos, opciones) -> {lua, pendientes, informe, guias}
//   guias: las que salen, con cada paso y su `origen` ('normal', 'cabecera': con condición en la cabecera, 'partido': de
//   un paso partido por sus líneas); el origen no se escribe en el Lua: es para comparar con lo de antes.
//   archivos: [{ruta, texto}] en el orden en que se recorren.
//   opciones: {traducciones?: {inglés: español}, yaEnRutas?: Set (claves de normClave), incluirSod?, misiones?: Set,
//   anterior?: texto del mis-guias.lua de antes}
import {
  analizar, universo, conjuntoDe, camposDeConjunto, camposEnEspanol, interseccion, claveDe,
} from './condiciones.js';

// uiMapID de las zonas por su nombre en inglés (los que usan las guías de RestedXP en sus .goto).
const ZONAS_RAW = {
  'Teldrassil': 1438, 'Winterspring': 1452, 'Darkshore': 1439, 'Felwood': 1448, 'Azshara': 1447,
  'Ashenvale': 1440, 'Stonetalon Mountains': 1442, 'Durotar': 1411, 'Barrens': 1413, 'The Barrens': 1413,
  'Desolace': 1443, 'Mulgore': 1412, 'Dustwallow Marsh': 1445, 'Feralas': 1444, 'Thousand Needles': 1441,
  'Tanaris': 1446, "Un'Goro Crater": 1449, 'Silithus': 1451, 'Orgrimmar': 1454, 'Thunder Bluff': 1456,
  'Darnassus': 1457, 'Moonglade': 1450, 'Eastern Plaguelands': 1423, 'Western Plaguelands': 1422,
  'Tirisfal Glades': 1420, 'Alterac Mountains': 1416, 'Silverpine Forest': 1421, 'The Hinterlands': 1425,
  'Hinterlands': 1425, 'Hillsbrad Foothills': 1424, 'Arathi Highlands': 1417, 'Wetlands': 1437,
  'Loch Modan': 1432, 'Dun Morogh': 1426, 'Badlands': 1418, 'Burning Steppes': 1428, 'Searing Gorge': 1427,
  'Redridge Mountains': 1433, 'Elwynn Forest': 1429, 'Swamp of Sorrows': 1435, 'Duskwood': 1431,
  'Westfall': 1436, 'Blasted Lands': 1419, 'Stranglethorn Vale': 1434, 'Stormwind City': 1453,
  'Ironforge': 1455, 'Undercity': 1458,
};
// Claves normalizadas: minúsculas, sin apóstrofes, sin «the »
const normZona = (s) => s.toLowerCase().replace(/'/g, '').replace(/^the\s+/, '').trim();
const ZONAS = {};
for (const [nombre, id] of Object.entries(ZONAS_RAW)) ZONAS[normZona(nombre)] = id;
ZONAS['ungoro crater'] = 1449; ZONAS['ungoro'] = 1449; ZONAS['stranglethorn'] = 1434;
ZONAS['stranglethorn vale'] = 1434; ZONAS['dun morogh'] = 1426; ZONAS['barrens'] = 1413;

// Limpia el marcado de texto de WoW (iconos, colores, RXP_*) y la condición «<< ...» del final.
function limpiarTexto(s) {
  return s
    .replace(/\|T[^|]*\|t/g, '')
    .replace(/\|cRXP_[A-Z]+_([^|]*)\|r/g, '$1')
    .replace(/\|c[0-9A-Fa-f]{8}([^|]*)\|r/g, '$1')
    .replace(/\|r|\|t/g, '')
    .replace(/\s*<<.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Escapa una cadena para Lua
const luaStr = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const luaNum = (n) => String(Number(n));

// Serializa un valor (número, texto o lista) para Lua
function luaValor(v) {
  if (Array.isArray(v)) return '{' + v.map(luaValor).join(', ') + '}';
  if (typeof v === 'string') return luaStr(v);
  return luaNum(v);
}
const unoOLista = (v) => (Array.isArray(v) && v.length === 1 ? v[0] : v);

// Quita los números internos de RestedXP («104. Fortaleza…», «105 Profundidades…», «03. The Deadmines»)
const limpiarNombre = (s) => s.replace(/^\d{3}\.?\s+/, '').replace(/^\d{2}\.\s+/, '').trim();

// La condición de una línea o de una cabecera: lo que va detrás del primer «<<», sin el comentario «--».
const condicionDe = (texto) => {
  const i = texto.indexOf('<<');
  return i < 0 ? null : texto.slice(i + 2).replace(/\s--.*$/, '').trim();
};

// Con EXCLUIR_RUTAS: la clave de una guía (sin números del principio, sin condición y solo letras)
export const normClave = (s) => (s.replace(/^\s*\d+([.-]\d+)?\.?\s*/, '').replace(/\s*<<.*$/, '').replace(/[^\p{L}]/gu, '')).toLowerCase();

const EJEMPLO = `  {
    nombre = "Ejemplo: Valle de los Retos",
    niveles = {1, 4},
    faccion = "Horda",
    pasos = {
      {aceptar = 4641, ir = {1411, 43.3, 68.5}, texto = "Habla con Kaltunk"},
      {entregar = 4641, aceptar = 788, ir = {1411, 42.1, 68.3}, texto = "Gornek está dentro de la cueva"},
      {completar = 788, texto = "Mata jabalíes moteados por el valle"},
      {entregar = 788, aceptar = 789, ir = {1411, 42.1, 68.3}},
      {completar = 789, texto = "Recoge colas de escórpido obrero"},
      {entregar = 789, ir = {1411, 42.1, 68.3}},
      {texto = "Vende lo que no uses antes de seguir"},
    },
  },`;

const CABECERA = `-- Mis guías de SnetForever. Las instrucciones están en LEEME.txt, en esta misma carpeta.
--
-- Generado a partir de RXPGuides (CC BY-NC-SA 4.0). Uso personal, no redistribuir con fines comerciales.
-- Después de cambiar este archivo, escribe /reload en el juego.

SnetForeverMisGuias = {

`;

// Los contadores de los pasos con condición (17-nov).
const nuevasCuentas = () => ({
  pasos: 0, pasosCondicion: 0, pasosConFiltro: 0, recuperadosPor: { clase: 0, raza: 0, faccion: 0 }, pasosImposibles: 0,
  pasosPartidos: 0, pasosDeMas: 0, lineasImposibles: 0,
  // Ronda 2: los pasos que entran porque su condición solo tenía !tbc / !wotlk, y los que se siguen tirando, por palabra.
  pasosCiertos: 0, tiradasPorPalabra: {},
});

export function convertir(archivos, {
  traducciones = null, yaEnRutas = null, incluirSod = false, misiones = null, anterior = null,
} = {}) {
  const stats = {
    archivos: 0, guias: 0, guiasSinPasos: 0, pasos: 0, pasosCondicion: 0, pasosVacios: 0, gotoSinMapa: 0,
    nombresRepetidos: 0,
    // 17-nov
    ...nuevasCuentas(), lineasConCondicionOtra: 0,
    // Lo mismo, solo de las guías que salen (sin las que ya están en Rutas ni las de SoD).
    enLasGuias: nuevasCuentas(),
    misionesQuitadas: 0, pasosSinMisiones: 0, guiasSinMisiones: 0,
    // Ronda 2: guías que salen con clase o raza en la cabecera, y con una condición de guía que no se pudo usar.
    guiasConFiltro: 0, guiasConCondicionSinUsar: 0, listaGuiasConCondicionSinUsar: [],
  };
  const zonasDesconocidas = new Map();
  const conAnterior = anterior !== null; // (dentro de parsearGuia, «anterior» es el trozo de antes)
  const traducir = (s) => (traducciones && Object.hasOwn(traducciones, s) && traducciones[s]) || s;

  // El paso de unas líneas de RestedXP (las del paso entero o las de un trozo partido), como antes: las misiones, el
  // primer goto con mapa y el primer texto. null si no queda nada. Con `contar` false no toca el informe.
  function pasoDeLineas(lineas, contar = true) {
    const aceptar = [], completar = [], entregar = [];
    let ir = null, texto = null, textoCmd = null;
    for (const l of lineas) {
      if (l.startsWith('+')) { if (!textoCmd) textoCmd = limpiarTexto(l.slice(1)); continue; }
      if (l.startsWith('>>')) { if (!texto) texto = limpiarTexto(l.slice(2)); continue; }
      if (!l.startsWith('.')) continue;
      const [cmdRaw, extra] = l.split('>>');
      const cmd = cmdRaw.replace(/\s--.*$/, '').trim();
      if (extra && !texto) texto = limpiarTexto(extra);
      let m;
      if ((m = cmd.match(/^\.accept\s+(\d+)/))) aceptar.push(+m[1]);
      else if ((m = cmd.match(/^\.complete\s+(\d+)(?:\s*,\s*(\d+))?/))) completar.push({ id: +m[1], obj: m[2] ? +m[2] : null });
      else if ((m = cmd.match(/^\.turnin\s+(\d+)/))) entregar.push(+m[1]);
      else if ((m = cmd.match(/^\.goto\s+([^,]+),\s*([\d.]+),\s*([\d.]+)/)) && !ir) {
        const zona = m[1].trim();
        // Puede venir el nombre de la zona o ya el uiMapID (ej. 1411 o 1438/1)
        const id = /^\d+(\/\d+)?$/.test(zona) ? +zona.split('/')[0] : ZONAS[normZona(zona)];
        // Solo porcentajes 0-100: hay coordenadas de mundo (p. ej. 6453.96) que el motor no admite
        const xOk = Number(m[2]) >= 0 && Number(m[2]) <= 100, yOk = Number(m[3]) >= 0 && Number(m[3]) <= 100;
        if (id && xOk && yOk) ir = [id, Number(m[2]), Number(m[3])];
        else if (contar) { zonasDesconocidas.set(zona, (zonasDesconocidas.get(zona) || 0) + 1); stats.gotoSinMapa++; }
      }
    }
    if (!texto && textoCmd) texto = textoCmd;
    const paso = {};
    if (aceptar.length) paso.aceptar = [...new Set(aceptar)];
    if (completar.length) {
      const ids = [...new Set(completar.map((c) => c.id))];
      if (ids.length === 1 && completar.length === 1 && completar[0].obj) {
        paso.completar = ids[0]; paso.objetivo = completar[0].obj;
      } else paso.completar = ids.length === 1 ? ids[0] : ids;
    }
    if (entregar.length) paso.entregar = [...new Set(entregar)];
    if (ir) paso.ir = ir;
    if (texto) { paso.texto = traducir(texto); paso.textoEn = texto; }
    return Object.keys(paso).length ? paso : null;
  }

  // Con la base de misiones: fuera las que no están (y el objetivo, si se quita una de las de completar). Devuelve el paso
  // o null si se queda sin nada.
  function conMisionesDeLaBase(paso, contar = true) {
    if (!misiones) return paso;
    const p = { ...paso };
    const filtrar = (ids) => {
      const ok = ids.filter((q) => misiones.has(q));
      if (contar) stats.misionesQuitadas += ids.length - ok.length;
      return ok;
    };
    if (p.aceptar) { p.aceptar = filtrar(p.aceptar); if (!p.aceptar.length) delete p.aceptar; }
    if (p.entregar) { p.entregar = filtrar(p.entregar); if (!p.entregar.length) delete p.entregar; }
    if (p.completar !== undefined) {
      const ids = [p.completar].flat();
      const ok = filtrar(ids);
      if (ok.length < ids.length) delete p.objetivo;
      if (ok.length === 0) delete p.completar;
      else p.completar = ok.length === 1 ? ok[0] : ok;
    }
    if (!p.aceptar && p.completar === undefined && !p.entregar && !p.ir && !p.texto) {
      if (contar) stats.pasosSinMisiones++;
      return null;
    }
    return p;
  }

  function parsearGuia(cuerpo) {
    const lineas = cuerpo.split(/\r?\n/);
    const cabecera = [];
    let i = 0;
    while (i < lineas.length && !/^\s*step(\s|$)/.test(lineas[i])) cabecera.push(lineas[i++]);

    const nombreLinea = cabecera.find((l) => /^#name\s+/.test(l));
    if (!nombreLinea) return null;
    const nombre = nombreLinea.replace(/^#name\s+/, '').trim();
    let niveles = null;
    const mn = nombre.match(/^(\d+)-(\d+)/);
    if (mn && +mn[1] >= 1 && +mn[2] <= 60 && +mn[1] <= +mn[2]) niveles = [+mn[1], +mn[2]];
    // Ronda 2: la condición de la cabecera de la guía («<< Horde», «<< Alliance Hunter», varias líneas: Y). Las que traen
    // algo que no es del personaje («<<sod») no cuentan, como antes.
    let deGuia = null; // el conjunto de personajes de la guía, o null si no tiene condición de personaje
    let condicionSinUsar = false;
    for (const l of cabecera) {
      if (!/^\s*<</.test(l)) continue;
      const a = analizar(condicionDe(l));
      if (a.otros) { condicionSinUsar = true; continue; }
      if (!a.dePersonaje) continue;
      const c = conjuntoDe(a, universo());
      deGuia = deGuia ? interseccion(deGuia, c) : c;
    }
    // Su facción (la etiqueta) si todos sus personajes son de una; sus campos, si caben en una guía.
    let faccion = null;
    let campos = {};
    let u = universo();
    if (deGuia && deGuia.size > 0) {
      const facciones = [...new Set([...deGuia].map((k) => k.split('|')[2]))];
      if (facciones.length === 1) faccion = facciones[0] === 'Alliance' ? 'Alianza' : 'Horda';
      const deFaccion = universo(facciones.length === 1 ? facciones[0] : null);
      const enCampos = camposDeConjunto(deGuia, deFaccion);
      if (enCampos.length === 1) {
        campos = camposEnEspanol(enCampos[0]);
        u = deFaccion.filter((pj) => deGuia.has(claveDe(pj)));
      } else {
        condicionSinUsar = true;
        u = deFaccion;
      }
    } else if (deGuia) condicionSinUsar = true; // no la cumple nadie: como si no la tuviera
    const todos = new Set(u.map(claveDe));

    // Separar pasos
    const bloques = [];
    let actual = null;
    for (; i < lineas.length; i++) {
      const l = lineas[i];
      if (/^\s*step(\s|$)/.test(l)) {
        actual = { cabecera: l.replace(/^\s*step/, '').trim(), lineas: [] };
        bloques.push(actual);
      } else if (actual) {
        actual.lineas.push(l);
      }
    }

    // Lo que cuenta el informe de esta guía (va a stats y, si la guía sale, también a stats.enLasGuias).
    const cuentas = nuevasCuentas();
    const sumar = (clave, n = 1, dentro = null) => {
      for (const s of [stats, cuentas]) {
        const donde = dentro ? s[dentro] : s;
        donde[clave] = (donde[clave] ?? 0) + n;
      }
    };
    const pasos = [];
    let sinLaBase = 0; // los pasos que saldrían sin mirar la base de misiones
    for (const b of bloques) {
      sumar('pasos');
      // La condición de la cabecera: si no es del personaje, el paso se tira (como antes).
      let delPaso = todos;
      const condCabecera = b.cabecera.includes('<<') ? condicionDe(b.cabecera) : null;
      if (condCabecera !== null) {
        const a = analizar(condCabecera);
        if (a.otros) {
          sumar('pasosCondicion');
          const palabras = new Set(a.grupos.flatMap((g) => g.otras).map((w) => w.toLowerCase()));
          if (a.grupos.length === 0) palabras.add(condCabecera === '' ? '(vacía)' : '(paréntesis)');
          for (const w of palabras) sumar(w, 1, 'tiradasPorPalabra');
          continue;
        }
        if (!a.dePersonaje) {
          sumar('pasosCiertos'); // solo !tbc / !wotlk: entra para todos
        } else {
          delPaso = conjuntoDe(a, u);
          if (delPaso.size === 0) { sumar('pasosImposibles'); continue; }
          sumar('pasosConFiltro');
          for (const [tipo, letra] of [['clase', 'c'], ['raza', 'r'], ['faccion', 'f']]) {
            if (a.grupos.some((g) => g.terminos.some((t) => t.tipo === letra))) sumar(tipo, 1, 'recuperadosPor');
          }
        }
      }

      // Los trozos del paso: lo común (en el sitio de su primera línea) y las líneas con condición de personaje, en orden.
      const trozos = [];
      let comun = null;
      let anterior = null;
      let sinLineas = false; // se quitó alguna línea que no cumple nadie (el paso ya no es el de antes)
      for (const raw of b.lineas) {
        const l = raw.trim();
        if (!l || l.startsWith('#') || l.startsWith('--')) continue;
        let conjunto = null; // null: lo común
        const cond = condicionDe(l);
        if (cond !== null) {
          const a = analizar(cond);
          if (a.otros) stats.lineasConCondicionOtra++;
          const c = conjuntoDe(a, u, 'linea');
          if (c !== null) {
            if (c.size === 0) { sumar('lineasImposibles'); sinLineas = true; anterior = null; continue; }
            if (c.size < u.length) conjunto = c;
          }
        }
        if (conjunto === null) {
          if (!comun) { comun = { conjunto: null, lineas: [] }; trozos.push(comun); }
          comun.lineas.push(l);
          anterior = comun;
        } else {
          const firma = [...conjunto].sort().join(',');
          if (anterior && anterior.firma === firma) anterior.lineas.push(l);
          else { anterior = { conjunto, firma, lineas: [l] }; trozos.push(anterior); }
        }
      }
      const conCondicion = trozos.some((t) => t.conjunto !== null);
      if (conCondicion) sumar('pasosPartidos');

      // Con el archivo de antes: el paso como lo escribía el conversor de antes (entero, sin mirar las condiciones de sus
      // líneas; con condición en la cabecera no salía), para darle a su primer trozo el id que tenía.
      let vieja = null;
      if (conAnterior && condCabecera === null) {
        const lineas = b.lineas.map((r) => r.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('--'));
        const entero = pasoDeLineas(lineas, false);
        const conBase = entero && conMisionesDeLaBase(entero, false);
        if (conBase) vieja = luaPaso(conBase);
      }
      // Ronda 3: el id de antes va al trozo común (sin filtro añadido por sus líneas); si no lo hay, al primero.
      let destino = null;
      const primero = pasos.length;
      let salen = 0;
      let conAlgo = false;
      for (const t of trozos) {
        const paso = pasoDeLineas(t.lineas);
        if (!paso) continue;
        conAlgo = true;
        const para = t.conjunto ? interseccion(delPaso, t.conjunto) : delPaso;
        const deCampos = camposDeConjunto(para, u);
        if (deCampos.length > 0) sinLaBase++;
        const conBase = conMisionesDeLaBase(paso);
        if (!conBase) continue;
        if (t.conjunto === null && destino === null && deCampos.length > 0) destino = pasos.length;
        for (const campos of deCampos) {
          pasos.push({ ...camposEnEspanol(campos), ...conBase, origen: conCondicion || sinLineas ? 'partido' : condCabecera !== null ? 'cabecera' : 'normal' });
          salen++;
        }
      }
      if (vieja !== null && salen > 0) pasos[destino ?? primero].vieja = vieja;
      if (!conAlgo) { stats.pasosVacios++; continue; }
      if (salen > 1) sumar('pasosDeMas', salen - 1);
    }
    // Sin pasos ni antes de mirar la base: no es una guía (como antes). Si se queda sin pasos por la base, se decide fuera
    // (después de saltar las que ya están en Rutas, como cuando la base se miraba después, a mano).
    if (sinLaBase === 0) { stats.guiasSinPasos++; return null; }
    delete campos.faccion;
    return {
      nombre: limpiarNombre(traducir(nombre)), nombreEn: limpiarNombre(nombre), niveles, faccion, campos, pasos, cuentas,
      condicionSinUsar,
    };
  }

  // Recorre los archivos y convierte cada RegisterGuide
  const guias = [];
  const excluidas = [];
  const pendientes = new Set();
  const yaExiste = (grupo, nombre) => yaEnRutas !== null
    && (yaEnRutas.has(normClave(grupo) + '|' + normClave(nombre)) || yaEnRutas.has('*|' + normClave(nombre)));
  for (const { texto } of archivos) {
    stats.archivos++;
    const re = /RegisterGuide\(\[\[([\s\S]*?)\]\]/g;
    let m;
    while ((m = re.exec(texto))) {
      const g = parsearGuia(m[1]);
      if (!g) continue;
      const grupo = (/#group\s+(.+)/.exec(m[1]) || [])[1] || '';
      if (yaExiste(grupo.trim(), g.nombreEn)) { excluidas.push(`${grupo.trim()} :: ${g.nombreEn}`); continue; }
      if (!incluirSod && /\bSoD\b/.test(g.nombreEn)) { stats.sod = (stats.sod || 0) + 1; continue; } // Season of Discovery
      if (g.pasos.length === 0) { stats.guiasSinMisiones++; continue; } // todas sus misiones faltan en la base
      for (const [k, v] of Object.entries(g.cuentas)) {
        if (typeof v === 'number') stats.enLasGuias[k] += v;
        else for (const [k2, v2] of Object.entries(v)) stats.enLasGuias[k][k2] = (stats.enLasGuias[k][k2] ?? 0) + v2;
      }
      delete g.cuentas;
      if (Object.keys(g.campos).length > 0) stats.guiasConFiltro++;
      if (g.condicionSinUsar) { stats.guiasConCondicionSinUsar++; stats.listaGuiasConCondicionSinUsar.push(g.nombreEn); }
      delete g.condicionSinUsar;
      guias.push(g);
      pendientes.add(g.nombreEn);
      for (const p of g.pasos) if (p.textoEn) pendientes.add(p.textoEn);
      stats.guias++;
    }
  }

  // Orden por nivel (como en las guías de Rested) y nombres únicos: el motor descarta los repetidos.
  // Etiqueta [A] / [H] según la facción de la guía; las que valen para las dos llevan [H-A].
  const etiqueta = (g) => (g.faccion === 'Alianza' ? 'A' : g.faccion === 'Horda' ? 'H' : 'H-A');
  for (const g of guias) {
    const e = etiqueta(g);
    g.nombre = `[${e}] ${g.nombre}`; g.nombreEn = `[${e}] ${g.nombreEn}`;
  }
  const ordenFaccion = (g) => ({ A: 0, H: 1, 'H-A': 2 }[etiqueta(g)]);
  const nivelMin = (g) => (g.niveles ? g.niveles[0] : 99);
  const nivelMax = (g) => (g.niveles ? g.niveles[1] : 99);
  guias.sort((a, b) => ordenFaccion(a) - ordenFaccion(b) || nivelMin(a) - nivelMin(b) || nivelMax(a) - nivelMax(b) || a.nombreEn.localeCompare(b.nombreEn));
  const cuenta = new Map();
  for (const g of guias) cuenta.set(g.nombre, (cuenta.get(g.nombre) || 0) + 1);
  const usados = new Set(['Ejemplo: Valle de los Retos']);
  for (const g of guias) {
    if (cuenta.get(g.nombre) > 1) {
      stats.nombresRepetidos++;
      const base = g.nombre;
      g.nombre = g.niveles ? `${base} (${g.niveles[0]}-${g.niveles[1]})` : base;
      let k = 2;
      while (usados.has(g.nombre)) g.nombre = `${base} (${k++})`;
    }
    usados.add(g.nombre);
  }

  const ids = anterior !== null ? ponerIds(guias, leerAnterior(anterior)) : null;

  const lua = CABECERA + EJEMPLO + '\n\n' + guias.map(luaGuia).join('\n\n') + '\n\n}\n';
  const informe = {
    ...stats,
    ...(ids ? {
      ids: ids.cuentas, idsPerdidos: ids.perdidos, idsEnPasosConFiltro: ids.enFiltro, guiasConNombreAntes: ids.renombradas,
      guiasDeAntesQueFaltan: ids.faltan,
    } : {}),
    yaExistentesEnRutas: excluidas.length,
    listaYaExistentes: excluidas,
    zonasDesconocidas: Object.fromEntries(zonasDesconocidas),
    tamanoMB: +(Buffer.byteLength(lua) / 1048576).toFixed(2),
  };
  return { lua, pendientes: [...pendientes].sort(), informe, guias };
}

// Un paso en Lua, sin su id: los campos de para quién es van delante (clase, raza, faccion, sin_clase, sin_raza).
function luaPaso(p) {
  const partes = [];
  for (const c of ['clase', 'raza', 'faccion', 'sin_clase', 'sin_raza']) if (p[c]) partes.push(`${c} = ${luaValor(unoOLista(p[c]))}`);
  if (p.aceptar) partes.push(`aceptar = ${luaValor(unoOLista(p.aceptar))}`);
  if (p.completar !== undefined) partes.push(`completar = ${luaValor(p.completar)}`);
  if (p.objetivo !== undefined) partes.push(`objetivo = ${luaNum(p.objetivo)}`);
  if (p.entregar) partes.push(`entregar = ${luaValor(unoOLista(p.entregar))}`);
  if (p.ir) partes.push(`ir = {${p.ir.map(luaNum).join(', ')}}`);
  if (p.texto) partes.push(`texto = ${luaStr(p.texto)}`);
  if (p.textoEn && p.textoEn !== p.texto) partes.push(`texto_en = ${luaStr(p.textoEn)}`);
  return `{${partes.join(', ')}}`;
}

// Una guía en Lua: sus campos de clase y raza (ronda 2) detrás de la facción; cada paso con su id delante, si lo tiene.
export function luaGuia(g) {
  const campos = [`nombre = ${luaStr(g.nombre)}`];
  if (g.nombreEn && g.nombreEn !== g.nombre) campos.push(`nombre_en = ${luaStr(g.nombreEn)}`);
  if (g.nombreAntes) campos.push(`nombre_antes = ${luaStr(g.nombreAntes)}`);
  if (g.niveles) campos.push(`niveles = {${g.niveles.join(', ')}}`);
  if (g.faccion) campos.push(`faccion = ${luaStr(g.faccion)}`);
  for (const c of ['clase', 'raza', 'sin_clase', 'sin_raza']) {
    if (g.campos?.[c]) campos.push(`${c} = ${luaValor(unoOLista(g.campos[c]))}`);
  }
  const pasos = g.pasos.map((p) => {
    const linea = luaPaso(p);
    return `      ${p.id ? `{id = ${luaStr(p.id)}, ${linea.slice(1)}` : linea},`;
  });
  return `  {\n    ${campos.join(',\n    ')},\n    pasos = {\n${pasos.join('\n')}\n    },\n  },`;
}

// El mis-guias.lua de antes: por guía (su nombre), su nombre_en y sus pasos {id, linea} (la línea sin el id; sin id, el
// del número del paso, «m<n>», como lo da el addon).
const ID_DELANTE = /^\{id = "((?:[^"\\]|\\.)*)", /;
function leerAnterior(texto) {
  const guias = new Map();
  let g = null;
  for (const l of texto.split(/\r?\n/)) {
    const nombre = l.match(/^ {4}nombre = "((?:[^"\\]|\\.)*)",$/);
    // Ronda 3 (m2): los nombres, sin los escapes de Lua (como los de las guías nuevas).
    if (nombre) {
      g = { nombre: sinEscapes(nombre[1]), nombreEn: null, nombreAntes: null, pasos: [] };
      guias.set(g.nombre, g);
      continue;
    }
    const en = l.match(/^ {4}nombre_en = "((?:[^"\\]|\\.)*)",$/);
    if (en && g) { g.nombreEn = sinEscapes(en[1]); continue; }
    const antes = l.match(/^ {4}nombre_antes = "((?:[^"\\]|\\.)*)",$/);
    if (antes && g) { g.nombreAntes = sinEscapes(antes[1]); continue; }
    if (!g || !/^ {6}\{.*\},$/.test(l)) continue;
    const linea = l.trim().slice(0, -1);
    const id = linea.match(ID_DELANTE);
    g.pasos.push(id ? { id: id[1], linea: `{${linea.slice(id[0].length)}` } : { id: `m${g.pasos.length + 1}`, linea });
  }
  return guias;
}
const sinEtiqueta = (nombre) => nombre.replace(/^\[[^\]]*\] /, '');
const sinEscapes = (s) => s.replace(/\\(.)/g, '$1');

// Los ids de los pasos con el archivo de antes. Para cada guía (por su nombre o, si ahora lleva otra etiqueta, por el
// nombre sin ella: entonces conserva el de antes), la subsecuencia común más larga entre sus pasos nuevos (la línea o, en
// el primer trozo de un paso partido, la del paso entero de antes) y los de antes da a cada paso que ya estaba su id; los
// demás, «n<k>» sin chocar. Una guía que no estaba lleva «m<número>», los de siempre.
function ponerIds(guias, deAntes) {
  const cuentas = { conservados: 0, nuevos: 0, deAntesSinPaso: 0, guiasNuevas: 0 };
  const renombradas = [];
  const perdidos = []; // los ids de antes que ya no caen en ningún paso: {guia, id, linea}
  const enFiltro = []; // los ids de antes que caen en un paso con filtro: {guia, id, linea}
  const nombres = new Set(guias.map((g) => g.nombre));
  const usadas = new Set();
  for (const g of guias) {
    let vieja = deAntes.get(g.nombre);
    if (!vieja) {
      const parecidas = [...deAntes.values()].filter((v) => !nombres.has(v.nombre) && !usadas.has(v.nombre)
        && sinEtiqueta(v.nombre) === sinEtiqueta(g.nombre));
      // Ronda 3: la guía lleva su etiqueta nueva y nombre_antes con el de antes (el addon pasa el progreso).
      if (parecidas.length === 1) {
        vieja = parecidas[0];
        g.nombreAntes = vieja.nombre;
      }
    } else if (vieja.nombreAntes !== null) g.nombreAntes = vieja.nombreAntes; // se queda en el archivo
    if (g.nombreAntes) renombradas.push(g.nombre);
    if (!vieja) {
      cuentas.guiasNuevas++;
      g.pasos.forEach((p, i) => { p.id = `m${i + 1}`; });
      cuentas.nuevos += g.pasos.length;
      continue;
    }
    usadas.add(vieja.nombre);
    const a = g.pasos.map((p) => [luaPaso(p), p.vieja].filter(Boolean));
    const b = vieja.pasos.map((p) => p.linea);
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i].includes(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const tomados = new Set(vieja.pasos.map((p) => p.id));
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[i].includes(b[j])) { g.pasos[i].id = vieja.pasos[j].id; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    let k = Math.max(0, ...[...tomados].map((id) => (/^n\d+$/.test(id) ? Number(id.slice(1)) : 0)));
    for (const p of g.pasos) {
      if (p.id) { cuentas.conservados++; continue; }
      do k++; while (tomados.has(`n${k}`));
      p.id = `n${k}`;
      cuentas.nuevos++;
    }
    const puestos = new Set(g.pasos.map((p) => p.id));
    for (const p of vieja.pasos) if (!puestos.has(p.id)) perdidos.push({ guia: vieja.nombre, id: p.id, linea: p.linea });
    cuentas.deAntesSinPaso += vieja.pasos.filter((p) => !puestos.has(p.id)).length;
    for (const p of g.pasos) {
      if (tomados.has(p.id) && ['clase', 'raza', 'faccion', 'sin_clase', 'sin_raza'].some((c) => p[c])) {
        enFiltro.push({ guia: g.nombre, id: p.id, linea: luaPaso(p) });
      }
    }
  }
  for (const g of guias) for (const p of g.pasos) delete p.vieja;
  const faltan = [...deAntes.keys()].filter((nombre) => !usadas.has(nombre) && nombre !== 'Ejemplo: Valle de los Retos');
  return { cuentas, renombradas, faltan, perdidos, enFiltro };
}
