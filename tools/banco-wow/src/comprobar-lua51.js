// Comprobador estático de los .lua del addon: rechaza lo que no es Lua 5.1 y las APIs prohibidas por §4 del diseño.
// No es un analizador de Lua: trocea el texto saltándose cadenas y comentarios y busca patrones en el código.

// Separa el código de las cadenas y los comentarios. Las dos vistas tienen la misma longitud que el texto y
// conservan los saltos de línea, así las líneas cuadran:
//   * `codigo`: cadenas y comentarios cambiados por espacios;
//   * `conCadenas`: solo los comentarios cambiados por espacios (para `_G["Nombre"]`).
// `cadenas` guarda el contenido de cada cadena, la línea en la que empieza y si es corta ("…", '…') o larga ([[…]]).
function separar(texto) {
  const codigo = texto.split('');
  const conCadenas = texto.split('');
  const cadenas = [];
  let linea = 1;
  let i = 0;
  const n = texto.length;

  // Borra [desde, hasta) y cuenta sus saltos de línea; con `comentario` se borra también de conCadenas.
  const borrar = (desde, hasta, comentario) => {
    for (let k = desde; k < hasta; k++) {
      if (texto[k] === '\n') {
        linea++;
      } else {
        codigo[k] = ' ';
        if (comentario) conCadenas[k] = ' ';
      }
    }
  };
  // Si en `p` empieza un corchete largo ([[, [=[, [==[…), devuelve su nivel; si no, -1.
  const nivelLargo = (p) => {
    const m = /\[(=*)\[/y;
    m.lastIndex = p;
    const r = m.exec(texto);
    return r ? r[1].length : -1;
  };
  // Final (exclusivo) de un bloque largo de nivel `nivel` que abre en `p`; sin cierre, el final del texto.
  const finLargo = (p, nivel) => {
    const cierre = `]${'='.repeat(nivel)}]`;
    const k = texto.indexOf(cierre, p + nivel + 2);
    return k === -1 ? n : k + cierre.length;
  };

  while (i < n) {
    const c = texto[i];
    if (c === '-' && texto[i + 1] === '-') {
      const nivel = nivelLargo(i + 2);
      const fin = nivel >= 0 ? finLargo(i + 2, nivel) : (texto.indexOf('\n', i) === -1 ? n : texto.indexOf('\n', i));
      borrar(i, fin, true);
      i = fin;
    } else if (c === '[' && nivelLargo(i) >= 0) {
      const nivel = nivelLargo(i);
      const fin = finLargo(i, nivel);
      const inicio = i + nivel + 2;
      cadenas.push({ texto: texto.slice(inicio, Math.max(inicio, fin - nivel - 2)), linea, corta: false });
      borrar(i, fin, false);
      i = fin;
    } else if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && texto[k] !== c && texto[k] !== '\n') k += texto[k] === '\\' ? 2 : 1;
      const fin = Math.min(n, k + 1);
      cadenas.push({ texto: texto.slice(i + 1, Math.min(k, n)), linea, corta: true });
      borrar(i, fin, false);
      i = fin;
    } else {
      if (c === '\n') linea++;
      i++;
    }
  }
  return { codigo: codigo.join(''), conCadenas: conCadenas.join(''), cadenas };
}

// Escapes de cadena que Lua 5.1 no tiene (\x, \u{ y \z son de 5.2/5.3). Solo cuentan en las cadenas cortas:
// en las largas no hay escapes. Devuelve [{desfase de línea, escape}].
function escapesNo51(contenido) {
  const salida = [];
  let lineas = 0;
  for (let k = 0; k < contenido.length; k++) {
    const c = contenido[k];
    if (c === '\n') lineas++;
    if (c !== '\\') continue;
    const sig = contenido[k + 1];
    if (sig === 'x' || sig === 'z' || (sig === 'u' && contenido[k + 2] === '{')) salida.push({ lineas, escape: `\\${sig}` });
    if (sig === '\n') lineas++;
    k++; // el carácter escapado no puede abrir otro escape
  }
  return salida;
}

// Delante de una global: ni letra, ni cifra, ni _, ni . ni : (así `t.AcceptQuest` o `self:sin()` no cuentan).
const GLOBAL = '(?<![\\w.:])';

const API_PROHIBIDAS = [
  'AcceptQuest', 'CompleteQuest', 'GetQuestReward', 'SelectGossipOption', 'SelectGossipAvailableQuest',
  'SelectGossipActiveQuest', 'TakeTaxiNode', 'TargetUnit', 'SetRaidTarget', 'CastSpellByName', 'CastSpellByID',
  'UseItemByName', 'UseContainerItem', 'RunMacroText', 'EditMacro', 'CreateMacro',
  'ConfirmBinder', 'AcceptXPLoss', 'BuyTrainerService', 'SendChatMessage', 'SetCVar', 'AbandonQuest',
  'SetAbandonQuest', 'EasyMenu', 'LibStub',
  // Fase 4: el addon nunca vende, usa, equipa, coge ni borra objetos.
  'UseInventoryItem', 'PickupInventoryItem', 'EquipItemByName', 'AutoEquipCursorItem', 'DeleteCursorItem',
  'SellCursorItem',
];
const NOMBRES = API_PROHIBIDAS.join('|');

// Los motivos de §4 que nombran la misma API (C_ChatInfo.SendChatMessage, _G.SendChatMessage, SendChatMessage)
// comparten `clave`: en una línea solo sale el primero, el más concreto (por eso van en este orden).
const sinEspacios = (s) => s.replace(/\s+/g, '');
const ultimoNombre = (s) => sinEspacios(s).split(/[.:]/).pop();
const esDialogo = (archivo) => /^(?:addons\/SnetForever\/)?motor\/dialogos\.lua$/.test(String(archivo).replace(/\\/g, '/'));
const API_DIALOGOS = new Set(['AcceptQuest', 'CompleteQuest', 'GetQuestReward', 'SelectAvailableQuest', 'SelectActiveQuest']);
const permiteDialogo = (nombre, archivo) => esDialogo(archivo) && API_DIALOGOS.has(nombre);

// Excepción aprobada por Alain (26-nov, «Sí, un movimiento por clic»): SOLO el ejecutor de Almacén
// (addons/SnetForever_Comercio/comercio/almacen-mover.lua, con la ruta del repositorio o relativa al addon) puede llamar a
// C_Container.PickupContainerItem y C_Container.SplitContainerItem, con el espacio de nombres delante. Las globales viejas,
// _G[...], UseContainerItem y todas las demás siguen prohibidas también ahí.
const esAlmacenMover = (archivo) => /^(?:addons\/SnetForever_Comercio\/)?comercio\/almacen-mover\.lua$/.test(String(archivo).replace(/\\/g, '/'));

// El único archivo que puede usar SecureActionButtonTemplate (F3-10): ui/objetivos.lua del addon, con la ruta del
// repositorio (addons/SnetForever/ui/objetivos.lua) o relativa al addon (ui/objetivos.lua), con / o con \.
const esObjetivos = (archivo) => /^(?:addons\/SnetForever\/)?ui\/objetivos\.lua$/.test(String(archivo).replace(/\\/g, '/'));

// Primera coincidencia de la regla en el texto que no esté permitida por su excepción (si la tiene).
function buscar(regla, texto, archivo) {
  if (!regla.permitido) return regla.re.exec(texto);
  for (const m of texto.matchAll(new RegExp(regla.re.source, 'g'))) {
    if (!regla.permitido(m, archivo)) return m;
  }
  return null;
}

// Cada regla mira una vista: 'codigo' (sin cadenas ni comentarios), 'conCadenas' (sin comentarios)
// o 'todo' (el código y también el contenido de las cadenas).
const REGLAS = [
  // §4 en cualquier sitio del código, con espacio de nombres delante.
  {
    vista: 'codigo',
    re: /(C_GossipInfo\s*\.\s*(?:SelectOption|SelectAvailableQuest|SelectActiveQuest)|C_Container\s*\.\s*UseContainerItem|C_Item\s*\.\s*EquipItemByName|C_CVar\s*\.\s*SetCVar|C_QuestLog\s*\.\s*(?:AbandonQuest|SetAbandonQuest)|C_ChatInfo\s*\.\s*SendChatMessage|:\s*AddDataProvider|\.\s*pinPools)/,
    motivo: (m) => `prohibido por §4: ${sinEspacios(m[1])}`,
    clave: (m) => `§4 ${ultimoNombre(m[1])}`,
    permitido: (m, archivo) => permiteDialogo(ultimoNombre(m[1]), archivo),
  },
  // Solo el acceso directo por C_Container se permite en el ejecutor.
  {
    vista: 'codigo',
    re: /\b(C_Container\s*\.\s*)?(PickupContainerItem|SplitContainerItem)\b/,
    motivo: (m) => `API prohibida por §4: ${sinEspacios(m[0])}`,
    clave: (m) => `§4 ${m[2]}`,
    permitido: (m, archivo) => m[1] && esAlmacenMover(archivo) && !/[.:]\s*$/.test(m.input.slice(0, m.index)),
  },
  {
    vista: 'conCadenas',
    re: /(?:\brawget\s*\([^,\n]+,\s*|\[\s*)(["'])(PickupContainerItem|SplitContainerItem)\1\s*[)\]]/,
    motivo: (m) => `API prohibida por §4: ${m[2]}`,
    clave: (m) => `§4 ${m[2]}`,
  },
  // §4 a través de _G: _G.Nombre, _G["Nombre"] o _G['Nombre'].
  {
    vista: 'conCadenas',
    re: new RegExp(`${GLOBAL}_G\\s*(?:\\.\\s*(${NOMBRES})\\b|\\[\\s*(["'])(${NOMBRES})\\2\\s*\\])`),
    motivo: (m) => `API prohibida por §4: ${m[1] || m[3]}`,
    clave: (m) => `§4 ${m[1] || m[3]}`,
    permitido: (m, archivo) => permiteDialogo(m[1] || m[3], archivo),
  },
  // SendChatMessage en cualquier sitio (también como campo o método).
  {
    vista: 'codigo',
    re: /(?<!\w)SendChatMessage\b/,
    motivo: () => 'API prohibida por §4: SendChatMessage',
    clave: () => '§4 SendChatMessage',
  },
  // §4 como nombre global.
  {
    vista: 'codigo',
    re: new RegExp(`${GLOBAL}(${NOMBRES})\\b`),
    motivo: (m) => `API prohibida por §4: ${m[1]}`,
    clave: (m) => `§4 ${m[1]}`,
    permitido: (m, archivo) => permiteDialogo(m[1], archivo),
  },
  // Lua 5.1.
  { vista: 'codigo', re: /\/\//, motivo: () => 'división entera // (no existe en Lua 5.1)' },
  { vista: 'codigo', re: /\bgoto\b/, motivo: () => 'goto (no existe en Lua 5.1)' },
  { vista: 'codigo', re: /::/, motivo: () => 'etiqueta :: (no existe en Lua 5.1)' },
  { vista: 'codigo', re: /&/, motivo: () => 'operador de bits & (no existe en Lua 5.1)' },
  { vista: 'codigo', re: /\|/, motivo: () => 'operador de bits | (no existe en Lua 5.1)' },
  { vista: 'codigo', re: /~(?!=)/, motivo: () => 'operador de bits ~ (no existe en Lua 5.1)' },
  { vista: 'codigo', re: /<</, motivo: () => 'desplazamiento << (no existe en Lua 5.1)' },
  { vista: 'codigo', re: />>/, motivo: () => 'desplazamiento >> (no existe en Lua 5.1)' },
  {
    vista: 'codigo',
    re: new RegExp(`${GLOBAL}(table\\s*\\.\\s*(?:unpack|move)|math\\s*\\.\\s*(?:type|tointeger)|string\\s*\\.\\s*pack\\w*|utf8\\s*\\.)`),
    motivo: (m) => `${sinEspacios(m[1])} no existe en Lua 5.1`,
  },
  { vista: 'codigo', re: new RegExp(`${GLOBAL}bit\\s*\\.`), motivo: () => 'librería bit (las máscaras se comprueban con aritmética)' },
  // Fallo en el juego (19-nov, Task 25): el cliente de WoW Forever no tiene la librería os (el banco sí la imitaba).
  { vista: 'codigo', re: new RegExp(`${GLOBAL}os\\s*\\.`), motivo: () => 'librería os (no existe en el cliente de WoW Forever: usa time() o GetServerTime())' },
  {
    vista: 'codigo',
    re: new RegExp(`${GLOBAL}(sin|cos|tan|asin|acos|atan|atan2)\\b`),
    motivo: (m) => `${m[1]} global de WoW trabaja en grados (usa math.${m[1]} en radianes)`,
  },
  // También dentro de las cadenas.
  // Única excepción (F3-10): el botón de ui/objetivos.lua, que el JUGADOR pulsa para fijar el objetivo con /targetexact.
  {
    vista: 'todo',
    re: /Secure\w*Template\w*/,
    motivo: (m) => `plantilla segura prohibida por §4: ${m[0]}`,
    permitido: (m, archivo) => m[0] === 'SecureActionButtonTemplate' && esObjetivos(archivo) && !/\w/.test(m.input[m.index - 1] || ''),
  },
  { vista: 'todo', re: /UIDropDownMenu/, motivo: () => 'UIDropDownMenu prohibido por §4 (los menús son propios)' },
  { vista: 'todo', re: /StaticPopup/, motivo: () => 'StaticPopup prohibido por §4' },
];

/**
 * Comprueba un .lua del addon. Devuelve una entrada por línea y motivo: [{archivo, linea, motivo}].
 */
export function comprobarLua51(texto, archivo) {
  const { codigo, conCadenas, cadenas } = separar(texto);
  const salida = [];
  const vistos = new Set();
  const anotar = (linea, motivo, clave = motivo) => {
    const id = `${linea}\u0000${clave}`;
    if (vistos.has(id)) return;
    vistos.add(id);
    salida.push({ archivo, linea, motivo });
  };

  const lineasCodigo = codigo.split('\n');
  const lineasConCadenas = conCadenas.split('\n');
  lineasCodigo.forEach((textoLinea, i) => {
    for (const regla of REGLAS) {
      const m = buscar(regla, regla.vista === 'conCadenas' ? lineasConCadenas[i] : textoLinea, archivo);
      if (m) anotar(i + 1, regla.motivo(m), regla.clave?.(m));
    }
  });
  for (const cadena of cadenas) {
    cadena.texto.split('\n').forEach((textoLinea, i) => {
      for (const regla of REGLAS) {
        if (regla.vista !== 'todo') continue;
        const m = buscar(regla, textoLinea, archivo);
        if (m) anotar(cadena.linea + i, regla.motivo(m));
      }
    });
    if (cadena.corta) {
      for (const { lineas, escape } of escapesNo51(cadena.texto)) {
        anotar(cadena.linea + lineas, `escape ${escape} en una cadena (no existe en Lua 5.1)`);
      }
    }
  }
  return salida.sort((a, b) => a.linea - b.linea);
}
