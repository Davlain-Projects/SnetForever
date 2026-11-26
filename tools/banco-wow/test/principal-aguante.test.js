// Ventana principal, parte 1, Task 26: aguante de la ventana principal con datos del tamaño real del jugador: 353 grupos en 5
// niveles, 11.630 objetos y las 15 operaciones de Subasta de op-04 repartidas por los grupos (con herencia, Grupo Base y
// una lista vacía). Los datos son sintéticos e inventados (test/sinteticos.js, el mismo generador que usa importar-tsm).
//
// Los tiempos son de CPU del proceso (process.cpuUsage), como en importar-tsm: con otras pruebas a la vez el reloj se
// dispara sin culpa del código. En Windows la CPU se cuenta a saltos de unos 16 ms. El recolector de basura de node puede
// alargar una medida suelta: cada medida se repite y cuenta la mejor (en el buscador, la mejor de 3 de cada pulsación).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';
import { N_GRUPOS, N_OBJETOS, SEP, nivelDe, rutasSinteticas } from './sinteticos.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 60 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const q = (t) => JSON.stringify(t);

// ---- Los datos ----

const DATOS = rutasSinteticas({ niveles: 5 });
const OPERACIONES = ['#Default', ...Array.from({ length: 14 }, (_, i) => `Subasta ${i + 2}`)];

// Las operaciones de Subasta de cada grupo (el override): Grupo Base con #Default; cada «Sub» con una de las otras 14 y, los
// «Sub 2», también #Default; el «Hoja» de «Nivel 2» con la lista vacía (no usa ninguna) y «Nivel 3`Sub 3» con una que ya
// no existe («Borrada», se ignora). Los de primer nivel y los demás «Hoja» heredan.
function gruposOps() {
  const g = { '': { subasta: ['#Default'] } };
  DATOS.rutas.forEach((r, i) => {
    if (nivelDe(r) !== 2) return;
    const lista = [OPERACIONES[(i % 14) + 1]];
    if (r.endsWith(`${SEP}Sub 2`)) lista.push('#Default');
    if (r === `Nivel 3${SEP}Sub 3`) lista.push('Borrada');
    g[r] = { subasta: lista };
  });
  g[`Nivel 2${SEP}Sub 1${SEP}Hoja`] = { subasta: [] };
  return g;
}

function cuentaGrande() {
  const grupos = {};
  for (const r of DATOS.rutas) grupos[r] = true;
  const subasta = {};
  for (const n of OPERACIONES) subasta[n] = { valores: {} };
  return { esquema: 1, comercio: { v2: { grupos, objetos: DATOS.objetos, operaciones: { subasta }, gruposOps: gruposOps() } } };
}

const cuentaChica = () => ({ esquema: 1, comercio: { v2: { grupos: { Uno: true }, objetos: { 'i:1': 'Uno' } } } });

// Las cuentas de op-04 hechas aquí, sin el addon: cada grupo usa la lista de su ascendiente más cercano que tenga una (o la
// de Grupo Base); cada operación suma los grupos que la usan y sus objetos, y en Grupo Base solo el asterisco.
function usosEsperados() {
  const ops = gruposOps();
  const porRuta = {};
  for (const r of Object.values(DATOS.objetos)) porRuta[r] = (porRuta[r] || 0) + 1;
  const salida = Object.fromEntries(OPERACIONES.map((n) => [n, { grupos: 0, objetos: 0, conBase: false }]));
  for (const ruta of ['', ...DATOS.rutas]) {
    let actual = ruta;
    while (actual !== '' && !ops[actual]) actual = actual.includes(SEP) ? actual.slice(0, actual.lastIndexOf(SEP)) : '';
    for (const n of new Set(ops[actual]?.subasta || [])) {
      const u = salida[n];
      if (!u) continue;
      u.grupos++;
      if (ruta === '') u.conBase = true;
      else u.objetos += porRuta[ruta] || 0;
    }
  }
  return salida;
}

// ---- Medidas ----

const ltable = createRequire(import.meta.url)('fengari/src/ltable.js');

function cpu(f) {
  const t0 = process.cpuUsage();
  f();
  const d = process.cpuUsage(t0);
  return (d.user + d.system) / 1000;
}

// Entra al juego con esa cuenta y mide la entrada: los eventos de entrar (ADDON_LOADED del núcleo y del comercio,
// PLAYER_LOGIN y PLAYER_ENTERING_WORLD) y un segundo más (lo que el addon deje para después con C_Timer también cuenta).
// - Tablas (las llamadas a luaH_new de fengari): desde el primer evento hasta el final, también mientras se cargan los
//   archivos del comercio (van entre los dos ADDON_LOADED). El texto de las SavedVariables se lee antes: no cuenta.
// - CPU: solo dentro de los eventos y del segundo de después. Cargar los archivos del comercio (unas 20.000 líneas que
//   fengari compila) no depende de los datos y es lo que más varía de una vez a otra.
let proto = null; // el de las máquinas del banco (src/maquina.js no exporta la clase)
function entrar(cuenta) {
  if (!proto) {
    const m = nuevaMaquina({ jugador: JUGADOR, arrancar: false });
    proto = Object.getPrototypeOf(m);
    m.cerrar();
  }
  const disparar = proto.disparar;
  const crear = ltable.luaH_new;
  let empezado = false;
  let tablas = 0;
  let ms = 0;
  const medir = (f) => {
    const t0 = process.cpuUsage();
    try {
      return f();
    } finally {
      const d = process.cpuUsage(t0);
      ms += (d.user + d.system) / 1000;
    }
  };
  proto.disparar = function (...args) {
    if (!empezado) {
      empezado = true;
      ltable.luaH_new = (L) => {
        tablas++;
        return crear(L);
      };
    }
    return medir(() => disparar.apply(this, args));
  };
  let m;
  try {
    m = nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, guardado: { SnetForeverCuenta: cuenta } });
    proto.disparar = disparar;
    medir(() => {
      for (let i = 0; i < 20; i++) m.avanzar(0.05);
    });
  } finally {
    proto.disparar = disparar;
    ltable.luaH_new = crear;
  }
  return { m, ms, tablas };
}

const maquinaGrande = () => entrar(cuentaGrande()).m;

// Cuántas tablas crea Lua mientras corre fn.
function tablasDe(fn) {
  const crear = ltable.luaH_new;
  let n = 0;
  ltable.luaH_new = (L) => {
    n++;
    return crear(L);
  };
  try {
    fn();
  } finally {
    ltable.luaH_new = crear;
  }
  return n;
}

// Las filas de un árbol o de una tabla: los marcos creados, los que se ven y cuántas caben por su alto.
const FILAS = `function(marco, alto)
  local vistas = 0
  for _, f in ipairs(marco.filas) do if f:IsShown() then vistas = vistas + 1 end end
  return {marcos = #marco.filas, vistas = vistas, caben = math.ceil(alto / 22)}
end`;

// ---- Las pruebas ----

test('entrar al juego con estos datos crea menos de 50 tablas nuevas y tarda menos de 100 ms en el banco', () => {
  const grande = cuentaGrande();
  assert.equal(Object.keys(grande.comercio.v2.grupos).length + 1, N_GRUPOS);
  assert.equal(Object.keys(grande.comercio.v2.objetos).length, N_OBJETOS);
  assert.equal(Math.max(...DATOS.rutas.map(nivelDe)), 5, '5 niveles');
  // Lo que cuestan los datos: la misma entrada con una cuenta casi vacía se resta (lo demás es el addon, con datos o sin
  // ellos). Una entrada de calentamiento y luego tres vueltas alternas; de cada una cuenta la mejor, por el recolector.
  const chicas = [];
  const grandes = [];
  entrar(cuentaChica()).m.cerrar(); // calentamiento: no cuenta
  for (let i = 0; i < 3; i++) {
    const c = entrar(cuentaChica());
    sinErrores(c.m);
    c.m.cerrar();
    chicas.push(c);
    const g = entrar(cuentaGrande());
    assert.equal(g.m.lua('SnetForever.Arbol.contar()'), N_OBJETOS, 'los datos llegaron');
    sinErrores(g.m);
    g.m.cerrar();
    grandes.push(g);
  }
  const tablas = grandes[0].tablas - chicas[0].tablas;
  assert.ok(tablas < 50, `los datos crearon ${tablas} tablas al entrar (${grandes[0].tablas} contra ${chicas[0].tablas})`);
  const mejor = (lista) => Math.min(...lista.map((x) => x.ms));
  const extra = mejor(grandes) - mejor(chicas);
  assert.ok(extra < 100, `los datos alargaron la entrada ${extra.toFixed(1)} ms de CPU (con: ${grandes.map((x) => x.ms.toFixed(1)).join(', ')}; sin: ${chicas.map((x) => x.ms.toFixed(1)).join(', ')})`);
});

test('abrir la ventana en Grupos y en Operaciones crea solo filas visibles', () => {
  const m = maquinaGrande();
  // Los grupos que tienen hijos (abrirlos todos deja a la vista los 353).
  const padres = DATOS.rutas.filter((r) => DATOS.rutas.some((x) => x.startsWith(r + SEP)));
  const aLuaLista = (l) => `{${l.map(q).join(', ')}}`;
  const r = m.lua(`(function()
    local filas = ${FILAS}
    local G = SnetForever.PrincipalGrupos
    SnetForever.Principal.abrir("grupos")
    local out = {arbol = filas(G.arbol, G.arbol:GetHeight()), visibles = G.arbol:visibles()}
    -- Con todo el árbol abierto (los 353) siguen siendo los mismos marcos.
    for _, ruta in ipairs(${aLuaLista(padres)}) do G.arbol:abrir(ruta, true) end
    out.abierto = filas(G.arbol, G.arbol:GetHeight())
    out.visiblesAbierto = G.arbol:visibles()
    -- Un subgrupo con sus dos listas.
    G.arbol:elegir("Nivel 4${SEP}Sub 1${SEP}Hoja")
    out.enGrupo = filas(G.tablaEnGrupo, G.tablaEnGrupo.cuerpo:GetHeight())
    out.sinGrupo = filas(G.tablaSinGrupo, G.tablaSinGrupo.cuerpo:GetHeight())
    out.cuantasEnGrupo = G.tablaEnGrupo:cuantas()
    SnetForever.Principal.elegir("operaciones")
    local P = SnetForever.PrincipalOperaciones
    P.abrir("subasta")
    out.ops = filas(P.arbol, P.arbol:GetHeight())
    out.tabla = filas(P.tabla, P.tabla.cuerpo:GetHeight())
    out.cuantasOps = P.tabla:cuantas()
    return out
  end)()`);
  const primeros = DATOS.rutas.filter((x) => nivelDe(x) === 1).length;
  assert.equal(r.visibles, 1 + primeros, `cerrados: Grupo Base y los ${primeros} de primer nivel`);
  assert.equal(r.visiblesAbierto, N_GRUPOS);
  // Cerrado hay menos filas de las que caben: un marco por fila. Abierto, los que caben y ni uno más.
  for (const [nombre, f, filas] of [['cerrado', r.arbol, r.visibles], ['abierto', r.abierto, r.visiblesAbierto]]) {
    const deben = Math.min(f.caben, filas);
    assert.equal(f.marcos, deben, `${nombre}: ${deben} marcos (caben ${f.caben} y hay ${filas} filas)`);
    assert.equal(f.vistas, deben, `${nombre}: y todos pintados`);
  }
  assert.ok(r.abierto.caben < N_GRUPOS);
  assert.ok(r.cuantasEnGrupo > 20, `la lista del grupo tiene sus objetos (${r.cuantasEnGrupo})`);
  for (const [nombre, f] of Object.entries({ enGrupo: r.enGrupo, sinGrupo: r.sinGrupo, ops: r.ops, tabla: r.tabla })) {
    assert.ok(f.marcos <= f.caben, `${nombre}: ${f.marcos} marcos con sitio para ${f.caben}`);
    assert.ok(f.vistas <= f.marcos);
  }
  assert.equal(r.cuantasOps, 15);
  assert.equal(r.ops.vistas, 7 + 15, 'los 7 tipos y las 15 de Subasta');
  // Al juego solo se le pregunta por los objetos que se ven.
  const pedidos = new Set(m.llamadas('GetItemInfo').map((x) => x[0]));
  assert.ok(pedidos.size <= r.enGrupo.marcos + r.sinGrupo.marcos, `se preguntó por ${pedidos.size} objetos`);
  sinErrores(m);
});

test('buscar en grupos y en objetos responde en menos de 100 ms en el banco', () => {
  const m = maquinaGrande();
  m.lua('SnetForever.Principal.abrir("grupos")');
  // Ronda 1: la misma tanda de pulsaciones 3 veces, y de cada pulsación cuenta la mejor (en Windows la CPU va a saltos de
  // unos 16 ms y el recolector de node alarga alguna suelta: una medida sola no basta).
  const medidas = [];
  let n = 0;
  const medir = (nombre, codigo) => {
    const t = cpu(() => m.lua(codigo));
    if (!medidas[n]) medidas[n] = [nombre, t];
    else medidas[n][1] = Math.min(medidas[n][1], t);
    n++;
  };
  // Escribe letra a letra (cada letra es un OnTextChanged, como en el juego) y luego borra el campo de una vez.
  const escribir = (campo, texto) => {
    for (const letra of texto) medir(`${campo} «${letra}»`, `SnetForever.PrincipalGrupos.${campo}:Insert(${q(letra)})`);
    medir(`${campo} borrar`, `SnetForever.PrincipalGrupos.${campo}:SetText("")`);
  };
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    n = 0;
    escribir('campo', 'hoja');
    escribir('campo', 'sub 1');
    // Grupo Base (Información: las bolsas) y un subgrupo (Objetos: bolsas, padre y el grupo).
    m.lua('SnetForever.PrincipalGrupos.arbol:elegir("")');
    escribir('campoObjetosBase', 'i:2');
    m.lua(`SnetForever.PrincipalGrupos.arbol:elegir("Nivel 5${SEP}Sub 1${SEP}Hoja${SEP}Hoja")`);
    escribir('campoObjetosGrupo', '2010');
  }
  assert.equal(medidas.length, 20);
  const hojas = m.lua('(function() SnetForever.PrincipalGrupos.campo:SetText("hoja") return SnetForever.PrincipalGrupos.arbol:visibles() end)()');
  const conHoja = DATOS.rutas.filter((x) => x.endsWith('Hoja')).length;
  m.lua('SnetForever.PrincipalGrupos.campo:SetText("")');
  const r = m.lua(`(function()
    local G = SnetForever.PrincipalGrupos
    G.campoObjetosGrupo:SetText("2")
    return {en = G.tablaEnGrupo:cuantas(), sin = G.tablaSinGrupo:cuantas()}
  end)()`);
  assert.ok(hojas > conHoja, `«hoja» deja ${hojas} filas: las ${conHoja} Hoja, sus padres y Grupo Base`);
  assert.ok(r.en > 20 && r.sin > 20, `con «2» se ven los del grupo (${r.en}) y los del padre (${r.sin - 2} y 2 secciones)`);
  const largas = medidas.filter(([, ms]) => ms >= 100);
  assert.equal(largas.length, 0, `pulsaciones de 100 ms o más (la mejor de 3): ${largas.map(([n, ms]) => `${n} ${ms.toFixed(1)}`).join(', ')}`);
  sinErrores(m);
});

test('el resumen de Subasta con 15 operaciones calcula los usos en menos de 200 ms en el banco', () => {
  const esperados = usosEsperados();
  // Las cuentas tienen de todo: Grupo Base con asterisco, una que no usa nadie y la que más grupos tiene.
  assert.equal(esperados['#Default'].conBase, true);
  // Contar no hace el índice de objetos por grupo (ni una lista de objetos por grupo): solo cuenta. En frío, menos de 50
  // tablas (el resultado, una por operación y las cuentas), con 353 grupos.
  const fria = maquinaGrande();
  const tablas = tablasDe(() => fria.lua('SnetForever.Operaciones.usosDeTipo("subasta")'));
  assert.ok(tablas < 50, `contar los usos en frío creó ${tablas} tablas`);
  fria.cerrar();
  const tiempos = { usos: [], resumen: [] };
  let m, usos, filas;
  for (let i = 0; i < 3; i++) {
    m = maquinaGrande();
    // En frío (sin el índice de objetos por grupo hecho) y a solas: Operaciones.usosDeTipo.
    tiempos.usos.push(cpu(() => {
      usos = m.lua('SnetForever.Operaciones.usosDeTipo("subasta")');
    }));
    // Y el resumen entero como lo pide el jugador (op-04: pulsar «Subasta» en el árbol, con la página enseñando otro tipo):
    // el árbol, la tabla, las cajas y los usos.
    m.lua('SnetForever.Principal.abrir("operaciones"); SnetForever.PrincipalOperaciones.abrir("correo")');
    m.lua(`(function()
      for _, f in ipairs(SnetForever.PrincipalOperaciones.arbol.filas) do
        if f:IsShown() and f.clave == "t:subasta" then FILA_SUBASTA = f end
      end
    end)()`);
    tiempos.resumen.push(cpu(() => m.lua('FILA_SUBASTA:Click("LeftButton")')));
    assert.equal(m.lua('SnetForever.PrincipalOperaciones.tipo()'), 'subasta');
    filas = m.lua(`(function()
      local P, t = SnetForever.PrincipalOperaciones, {}
      for _, f in ipairs(P.tabla.todas) do t[f.nombre] = {f.grupos, f.objetos, f.base} end
      return t
    end)()`);
    if (i < 2) m.cerrar();
  }
  for (const n of OPERACIONES) {
    const e = esperados[n];
    assert.deepEqual(usos[n], e, `usos de ${n}`);
    assert.deepEqual(filas[n], [e.grupos, e.objetos, e.conBase], `la fila de ${n}`);
  }
  assert.equal(m.lua('SnetForever.PrincipalOperaciones.titulo:GetText()'), '|cffe6ac7215|r Operaciones de Subasta');
  const mejor = (l) => Math.min(...l);
  assert.ok(mejor(tiempos.usos) < 200, `usosDeTipo en frío: ${tiempos.usos.map((t) => t.toFixed(1)).join(', ')} ms de CPU`);
  assert.ok(mejor(tiempos.resumen) < 200, `el resumen: ${tiempos.resumen.map((t) => t.toFixed(1)).join(', ')} ms de CPU`);
  sinErrores(m);
});

// Las SavedVariables como las escribe el cliente en WTF (una línea por valor, con tabuladores y «-- [n]» en las listas).
function serializar(valor, sangria = '') {
  if (typeof valor === 'string') return q(valor);
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  const dentro = `${sangria}\t`;
  const lineas = Array.isArray(valor)
    ? valor.map((v, i) => `${dentro}${serializar(v, dentro)}, -- [${i + 1}]`)
    : Object.entries(valor).map(([k, v]) => `${dentro}[${q(k)}] = ${serializar(v, dentro)},`);
  return `{\n${lineas.join('\n')}${lineas.length ? '\n' : ''}${sangria}}`;
}

test('lo guardado ocupa menos de 1,5 MB serializado', () => {
  const m = maquinaGrande();
  // Una sesión: abrir las dos páginas, elegir un grupo y el resumen; luego /reload, que guarda.
  m.lua(`SnetForever.Principal.abrir("grupos"); SnetForever.PrincipalGrupos.arbol:elegir("Nivel 6${SEP}Sub 2")`);
  m.lua('SnetForever.Principal.elegir("operaciones"); SnetForever.PrincipalOperaciones.abrir("subasta")');
  m.avanzar(1);
  const n = m.recargar();
  const guardado = n.guardado();
  const texto = Object.entries(guardado).map(([sv, v]) => `${sv} = ${serializar(v)}\n`).join('');
  const bytes = Buffer.byteLength(texto, 'utf8');
  assert.ok(bytes < 1.5 * 1024 * 1024, `lo guardado ocupa ${(bytes / 1024).toFixed(0)} KB`);
  assert.equal(n.lua('SnetForever.Arbol.contar()'), N_OBJETOS, 'y sigue todo tras /reload');
  sinErrores(n);
});
