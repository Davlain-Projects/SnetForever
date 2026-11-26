// Tarea 15 de la fase 3: el addon entero con los datos reales (SnetForever_Rutas + SnetForever_Misiones): cadenas de clase,
// mazmorras, profesiones, avisos, la ventana nueva y «Objetivos cercanos». Se salta si no están los dos addons de datos.
// Manda el formato real de los datos: aquí no se retoca nada para que pase (si algo falla, se arregla el módulo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGuideDetails as nuevaMaquina, sinErrores } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS) && existsSync(TOC_MISIONES);
const opciones = { skip: hayDatos ? false : 'no están addons/SnetForever_Rutas y addons/SnetForever_Misiones (fase 1 sin generar)' };

const V = 'SnetForever.Ventana';
const M = `${V}.marcos`;
const FELINA = 'Cadenas de clase (H)\\druida-felina';
const OSO = 'Cadenas de clase (H)\\druida-oso';

// el druida de prueba: druida Skyborne de la Horda, nivel 20.
const DRUIDA_SKYBORNE = { clase: 'DRUID', raza: 'Skyborne', faccion: 'Horde', nivel: 20 };
const DRUIDA_TAUREN_10 = { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 };

// Misiones de la felina para un Skyborne (pasos 1, 2, 10-18 de los datos reales) y las que son solo de tauren.
const FELINA_SKYBORNE = [98340, 98341, 98404, 98738, 98362];
const SOLO_TAUREN = [98405, 98342, 98739];

const maquinaReal = (jugador, extra = {}) => nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], jugador, ...extra });
const ids = (lista) => lista.map((a) => a.id);
const cola = (m) => ids(m.lua('SnetForever.Avisos.cola()'));
const abrir = (m, clave) => m.lua(`SnetForever.Guias.abrirLateral(${aLua(clave)})`);
const estado = (m) => m.lua('SnetForever.Motor.estado()');

// Todos los elementos de los pasos que ve el personaje (los de Motor, ya filtrados): [{n, t, q}].
const elementosVisibles = (m) => m.lua(`(function()
  local salida = {}
  local i = 1
  while SnetForever.Motor.paso(i) do
    local paso = SnetForever.Motor.paso(i)
    for _, el in ipairs(paso.elementos) do
      salida[#salida + 1] = {n = paso.n, t = el.datos.t, q = el.datos.q or false}
    end
    i = i + 1
  end
  return salida
end)()`);
const aceptadas = (m) => elementosVisibles(m).filter((e) => e.t === 'accept').map((e) => e.q);

// Todos los textos visibles de la ventana (sus piezas y el bloque activo).
const textos = (m) => m.lua(`(function()
  local salida = {}
  local function recorrer(o)
    if o:IsObjectType("FontString") then
      if o:IsVisible() and o:GetText() then salida[#salida + 1] = o:GetText() end
    elseif o:IsObjectType("Frame") then
      for _, r in ipairs({o:GetRegions()}) do recorrer(r) end
      for _, h in ipairs({o:GetChildren()}) do recorrer(h) end
    end
  end
  recorrer(SnetForeverVentana)
  return salida
end)()`) || [];

// Un fallo de Lua dice en qué guía fue.
function sinErroresEn(m, donde) {
  try {
    sinErrores(m);
  } catch (e) {
    assert.fail(`${donde}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------------------------------
// Vigilancia 2: el druida de prueba (druida Skyborne de la Horda, nivel 20)
// ---------------------------------------------------------------------------------------------------

test('vigilancia 2: el druida de prueba recibe el aviso de la felina Skyborne, ve oso y felina y no recibe pasos solo de tauren', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  m.lua('SnetForever.Avisos.revisar(20)');
  const avisos = cola(m);
  assert.ok(avisos.includes('druida-felina-H-3'), `cola: ${avisos.join(', ')}`);
  assert.ok(!avisos.includes('druida-felina-H-1'), 'el aviso de la felina tauren no es para un Skyborne');
  assert.ok(!avisos.includes('druida-oso-H-1'), 'el del oso tauren tampoco');
  const cadenas = m.lua('SnetForever.Guias.laterales("cadena")');
  assert.ok(cadenas.includes(OSO), cadenas.join(' | '));
  assert.ok(cadenas.includes(FELINA), cadenas.join(' | '));
  assert.ok(m.lua('SnetForever.Avisos.ahora("druida-felina-H-3")'), 'la guía del aviso se abre');
  assert.equal(estado(m).clave, FELINA);
  const visibles = aceptadas(m);
  assert.equal(visibles[0], 98340, `la primera misión aceptada es la 98340 y no ${visibles[0]}`);
  assert.equal(elementosVisibles(m).find((e) => e.t === 'accept').n, 1);
  for (const q of SOLO_TAUREN) assert.ok(!visibles.includes(q), `un Skyborne no ve el paso de la ${q}`);
  assert.deepEqual(visibles, FELINA_SKYBORNE.slice(0, 4).concat(98362), `misiones aceptadas: ${visibles.join(', ')}`);
  sinErrores(m);
});

test('vigilancia 2: la felina de un druida tauren sí lleva las misiones solo de tauren', opciones, () => {
  const m = maquinaReal({ ...DRUIDA_SKYBORNE, raza: 'Tauren' });
  assert.ok(abrir(m, FELINA));
  const visibles = aceptadas(m);
  for (const q of SOLO_TAUREN) assert.ok(visibles.includes(q), `un tauren ve la ${q}: ${visibles.join(', ')}`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Vigilancia 1: lo ya hecho no se ofrece y la guía lo da por hecho
// ---------------------------------------------------------------------------------------------------

test('vigilancia 1: con la 98362 entregada no hay aviso de la felina', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  m.estadoMision(98362, { entregada: true });
  m.lua('SnetForever.Avisos.revisar(20)');
  const avisos = cola(m);
  assert.ok(!avisos.some((id) => id.startsWith('druida-felina')), `cola: ${avisos.join(', ')}`);
  sinErrores(m);
});

test('vigilancia 1: con la cadena entregada, la guía abierta da por hechos todos sus pasos y acaba', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  for (const q of FELINA_SKYBORNE) m.estadoMision(q, { entregada: true });
  assert.ok(abrir(m, FELINA));
  m.avanzar(10);
  const e = estado(m);
  assert.equal(e.fin, true, JSON.stringify(e));
  const pendientes = m.lua(`(function()
    local salida = {}
    local i = 1
    while SnetForever.Motor.paso(i) do
      if not SnetForever.Motor.paso(i).hecho then salida[#salida + 1] = SnetForever.Motor.paso(i).n end
      i = i + 1
    end
    return salida
  end)()`);
  assert.deepEqual(pendientes, [], 'ningún paso queda sin hacer');
  sinErrores(m);
});

test('vigilancia 1: si el aviso de la felina estaba en la cola y se entrega la 98362, se va al momento', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  m.lua('SnetForever.Avisos.revisar(20)');
  assert.ok(cola(m).includes('druida-felina-H-3'));
  m.estadoMision(98362, { entregada: true });
  assert.ok(!cola(m).includes('druida-felina-H-3'));
  sinErrores(m);
});

test('un druida tauren de nivel 10 recibe el aviso del oso (y un Skyborne, el suyo)', opciones, () => {
  const tauren = maquinaReal(DRUIDA_TAUREN_10);
  tauren.lua('SnetForever.Avisos.revisar(10)');
  assert.ok(cola(tauren).includes('druida-oso-H-1'), cola(tauren).join(', '));
  assert.ok(!cola(tauren).includes('druida-oso-H-2'));
  const texto = tauren.lua(`SnetForever.Avisos.texto(SnetForever.Avisos.cola()[1])`);
  assert.equal(typeof texto, 'string');
  assert.ok(texto.length > 0);
  sinErrores(tauren);
  const skyborne = maquinaReal({ ...DRUIDA_TAUREN_10, raza: 'Skyborne' });
  skyborne.lua('SnetForever.Avisos.revisar(10)');
  assert.ok(cola(skyborne).includes('druida-oso-H-2'), cola(skyborne).join(', '));
  assert.ok(!cola(skyborne).includes('druida-oso-H-1'));
  sinErrores(skyborne);
});

test('avisos reales: todos tienen texto, apuntan a una guía que existe y la de cada aviso de cadena es de su clase y facción', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  const informe = m.lua(`(function()
    local malos, n = {}, 0
    for _, aviso in ipairs(SNF_RUTAS.avisos) do
      n = n + 1
      local texto = SnetForever.Avisos.texto(aviso)
      if type(texto) ~= "string" or texto == "" or string.find(texto, "nil", 1, true) or string.find(texto, "#%d") then
        malos[#malos + 1] = aviso.id .. ": texto «" .. tostring(texto) .. "»"
      end
      local guia = aviso.guia and SnetForever.Datos.guia(aviso.guia)
      if aviso.guia and not guia then
        malos[#malos + 1] = aviso.id .. ": la guía «" .. aviso.guia .. "» no existe"
      elseif guia and (aviso.tipo or "cadena") ~= guia.tipo then
        malos[#malos + 1] = aviso.id .. ": tipo " .. tostring(aviso.tipo) .. " y guía de tipo " .. tostring(guia.tipo)
      elseif guia and aviso.faccion and guia.faccion and aviso.faccion ~= guia.faccion then
        malos[#malos + 1] = aviso.id .. ": facción " .. aviso.faccion .. " y guía de " .. guia.faccion
      end
    end
    return {n = n, malos = malos}
  end)()`);
  assert.ok(informe.n > 0);
  assert.deepEqual(informe.malos, []);
  sinErrores(m);
});

test('avisos de mazmorra reales: con la versión de mazmorras, un guerrero de la Horda de nivel 20 recibe los vigentes, con texto y guía', opciones, () => {
  const m = maquinaReal({ clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 20 });
  // Lo que dicen los datos: avisos de mazmorra de la Horda con 20 dentro de [nivel, hasta].
  const esperados = m.lua(`(function()
    local salida = {}
    for _, a in ipairs(SNF_RUTAS.avisos) do
      if a.tipo == "mazmorra" and a.faccion == "Horde" and a.nivel <= 20 and (a.hasta == nil or 20 <= a.hasta) then
        salida[#salida + 1] = a.id
      end
    end
    table.sort(salida)
    return salida
  end)()`);
  assert.ok(esperados.length > 0, 'los datos traen avisos de mazmorra para el nivel 20');
  // Lote A (52-I1): solo manda el ajuste avisos.mazmorras, no la versión. Apagado no sale ninguno; encendido salen
  // todos, con la versión normal y con la de mazmorras.
  m.lua('SnetForever.Ajustes.set("avisos.mazmorras", false)');
  m.lua('SnetForever.Avisos.revisar(20)');
  assert.deepEqual(cola(m).filter((id) => id.startsWith('mazmorra-')), []);
  m.lua('SnetForever.Ajustes.set("avisos.mazmorras", true)');
  m.lua('SnetForever.Avisos.revisar(20)');
  assert.deepEqual(cola(m).filter((id) => id.startsWith('mazmorra-')).sort(), esperados, 'con la versión normal');
  m.lua('SnetForever.Ajustes.set("version", "mazmorras")');
  m.lua('SnetForever.Avisos.revisar(20)');
  assert.deepEqual(cola(m).filter((id) => id.startsWith('mazmorra-')).sort(), esperados);
  for (const id of esperados) {
    assert.ok(m.lua(`SnetForever.Avisos.tieneGuia(${aLua(id)})`), `${id}: su guía existe`);
    assert.ok(m.lua(`SnetForever.Avisos.ahora(${aLua(id)})`), `${id}: se abre`);
    assert.equal(m.lua('SnetForever.Guias.esLateral(SnetForever.Motor.estado().clave)'), true, id);
    assert.equal(m.lua('SnetForever.Datos.guia(SnetForever.Motor.estado().clave).tipo'), 'mazmorra', id);
  }
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Todas las guías laterales: se abren, se pintan en la ventana nueva y se vuelve
// ---------------------------------------------------------------------------------------------------

// Un personaje de la facción de la guía y de la clase y la raza de su filtro (la primera alternativa).
const PERSONAJE_DE = `(function()
  local salida = {}
  for _, clave in ipairs(SnetForever.Datos.claves()) do
    local g = SnetForever.Datos.guia(clave)
    if SnetForever.Guias.LATERALES[g.tipo] then
      local minimo = SnetForever.Guias.niveles(g)
      local clase, raza
      -- Clase y raza: las del filtro de la guía y, si no las dice, las del primer paso (las cadenas van por raza).
      for _, filtro in ipairs({g.filtro or {}, g.pasos[1].filtro or {}}) do
        for _, token in ipairs(filtro[1] or {}) do
          if string.sub(token, 1, 2) == "c:" then clase = clase or string.sub(token, 3) end
          if string.sub(token, 1, 2) == "r:" then raza = raza or string.sub(token, 3) end
        end
      end
      local faccion = g.faccion or "Horde"
      salida[#salida + 1] = {clave = clave, tipo = g.tipo, pasos = #g.pasos, sinVerificar = g.sinVerificar == true,
        pj = {clase = clase or "WARRIOR", raza = raza or (faccion == "Horde" and "Orc" or "Human"), faccion = faccion,
          nivel = math.max(minimo, 1)}}
    end
  end
  return salida
end)()`;

test('cada guía lateral se abre para su personaje, se pinta paso a paso en la ventana y «Volver» devuelve a la principal', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  const laterales = m.lua(PERSONAJE_DE);
  const porTipo = { cadena: 0, mazmorra: 0, profesion: 0 };
  for (const g of laterales) porTipo[g.tipo]++;
  assert.ok(porTipo.cadena > 0 && porTipo.mazmorra > 0 && porTipo.profesion > 0, JSON.stringify(porTipo));
  m.lua(`${V}.crear()`);
  for (const g of laterales) {
    m.jugador(g.pj);
    m.disparar('PLAYER_ENTERING_WORLD'); // Personaje.actual() se rehace al entrar al mundo
    // Con el personaje de la guía, la guía está en su lista de laterales.
    const lista = m.lua(`SnetForever.Guias.laterales(${aLua(g.tipo)}, ${aLua(g.pj)})`);
    assert.ok(lista.includes(g.clave), `${g.clave} no sale en laterales("${g.tipo}") de ${JSON.stringify(g.pj)}`);
    // La principal desde la que se abre (una guía normal de su facción) y a la que se vuelve.
    const principal = m.lua(`SnetForever.Guias.porDefecto(${aLua(g.pj)}, "normal")`);
    assert.ok(principal, `${g.clave}: hay guía principal`);
    assert.ok(m.lua(`SnetForever.Guias.cargar(${aLua(principal)})`), `${g.clave}: carga la principal`);
    assert.ok(abrir(m, g.clave), `${g.clave}: abrirLateral`);
    assert.equal(estado(m).clave, g.clave);
    assert.equal(m.lua('SnetForeverPJ.volverA'), principal);
    // Se pinta cada paso (el actual y los de después) sin errores ni restos de Lua en los textos.
    const cuantos = m.lua('(function() local n = 0 while SnetForever.Motor.paso(n + 1) do n = n + 1 end return n end)()');
    assert.ok(cuantos > 0, `${g.clave}: sin pasos para este personaje`);
    for (let i = 1; i <= cuantos; i++) {
      m.lua(`SnetForever.Motor.irA(${i}); ${V}.pintar()`);
      for (const t of textos(m)) {
        assert.ok(!/\bnil\b|table: |function: |%[sd]/.test(t), `${g.clave} paso ${i}: texto raro «${t}»`);
      }
    }
    m.lua(`SnetForever.Motor.irA(1); ${V}.pintar()`);
    const visibles = textos(m);
    const titulo = m.lua(`SnetForever.Guias.titulo(${aLua(g.clave)})`);
    assert.ok(visibles.some((t) => t.includes(titulo)), `${g.clave}: la cabecera enseña «${titulo}»: ${visibles.slice(0, 8).join(' | ')}`);
    assert.ok(m.lua(`${M}.estado.volver:IsVisible()`), `${g.clave}: hay «Volver»`);
    if (g.sinVerificar) {
      assert.ok(visibles.some((t) => /sin verificar/i.test(t)), `${g.clave}: dice «sin verificar»`);
    }
    // «Volver» carga la principal y cierra la vuelta.
    m.lua(`${M}.estado.volver:Click()`);
    assert.equal(estado(m).clave, principal, `${g.clave}: «Volver» carga la principal`);
    assert.equal(m.lua('SnetForeverPJ.volverA'), undefined);
    sinErroresEn(m, g.clave);
  }
});

// ---------------------------------------------------------------------------------------------------
// Profesiones: niveles y mapas, y el requisito de nivel en la ventana
// ---------------------------------------------------------------------------------------------------

test('profesiones: ningún requisito de nivel pasa de 60 y todo mapa de sus goto y loop está en la base', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  const informe = m.lua(`(function()
    local nivelAlto, mapas, enBase, fuera = {}, {}, {}, {}
    local profesiones = 0
    for clave, g in pairs(SNF_RUTAS.guias) do
      if g.tipo == "profesion" then
        profesiones = profesiones + 1
        for _, paso in ipairs(g.pasos) do
          for _, r in ipairs(paso.requisitos) do
            if r.t == "nivel" and r.n > 60 then nivelAlto[#nivelAlto + 1] = clave .. " paso " .. paso.n .. " nivel " .. r.n end
          end
          local etiqueta = tonumber(paso.etiquetas.level)
          if etiqueta and etiqueta > 60 then nivelAlto[#nivelAlto + 1] = clave .. " paso " .. paso.n .. " #level " .. etiqueta end
          for _, el in ipairs(paso.elementos) do
            if el.t == "goto" and el.mapa then mapas[el.mapa] = clave end
            if el.t == "loop" then
              for _, p in ipairs(el.puntos or {}) do if p.mapa then mapas[p.mapa] = clave end end
            end
          end
        end
      end
    end
    for _, tipo in ipairs({"npc", "object"}) do
      for _, d in pairs(SNF_MISIONES[tipo]) do
        if type(d.spawns) == "table" then
          for mapa in pairs(d.spawns) do enBase[mapa] = true end
        end
      end
    end
    for mapa, clave in pairs(mapas) do
      if not enBase[mapa] then fuera[#fuera + 1] = mapa .. " (" .. clave .. ")" end
    end
    return {profesiones = profesiones, nivelAlto = nivelAlto, fuera = fuera}
  end)()`);
  assert.equal(informe.profesiones, 6);
  assert.deepEqual(informe.nivelAlto, []);
  assert.deepEqual(informe.fuera, []);
  sinErrores(m);
});

test('un paso de profesión con nivel mayor que 1 enseña su requisito de nivel, en los datos y en la ventana', opciones, () => {
  const clave = 'Profesiones\\01-300 Herbalism (H)';
  const m = maquinaReal({ clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 10 });
  m.lua(`${V}.crear()`);
  assert.ok(abrir(m, clave));
  // Los pasos que ve un guerrero orco con un requisito de nivel mayor que 1 (el índice vivo y el n que pide).
  const conNivel = m.lua(`(function()
    local salida = {}
    local i = 1
    while SnetForever.Motor.paso(i) do
      for _, r in ipairs(SnetForever.Motor.paso(i).datos.requisitos) do
        if r.t == "nivel" and r.n > 1 then salida[#salida + 1] = {i = i, n = r.n} end
      end
      i = i + 1
    end
    return salida
  end)()`);
  assert.ok(conNivel.length > 0, 'la herboristería real trae pasos con requisito de nivel');
  for (const { i, n } of conNivel) {
    const requisitos = m.lua(`SnetForever.Requisitos.delPaso(SnetForever.Motor.paso(${i}))`);
    const nivel = requisitos.find((r) => r.t === 'nivel');
    assert.ok(nivel, `paso ${i}: Requisitos.delPaso no trae el de nivel`);
    assert.ok(nivel.texto.includes(String(n)), `paso ${i}: «${nivel.texto}» no dice el nivel ${n}`);
    // En la ventana: el paso pintado lleva el texto del requisito.
    m.lua(`SnetForever.Motor.irA(${i}); ${V}.pintar()`);
    assert.ok(textos(m).some((t) => t.includes(nivel.texto)), `paso ${i}: la ventana no enseña «${nivel.texto}»`);
  }
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Objetivos cercanos con pasos reales
// ---------------------------------------------------------------------------------------------------

test('«Objetivos cercanos» lista los objetivos (mob, target, unitscan) de un paso real de RestedXP y los pinta', opciones, () => {
  const m = maquinaReal({ clase: 'WARRIOR', raza: 'Orc', faccion: 'Horde', nivel: 10 });
  m.lua(`${V}.crear()`);
  // Busca en las guías normales de la Horda un paso con mob y target (de los que ve el personaje).
  const candidato = m.lua(`(function()
    for _, clave in ipairs(SnetForever.Datos.claves()) do
      local g = SnetForever.Datos.guia(clave)
      if g.tipo == "normal" and SnetForever.Guias.existe(clave) then
        SnetForever.Guias.cargar(clave)
        local i = 1
        while SnetForever.Motor.paso(i) do
          local paso = SnetForever.Motor.paso(i)
          local tipos = {}
          for _, el in ipairs(paso.elementos) do
            if (el.datos.t == "mob" or el.datos.t == "target" or el.datos.t == "unitscan") and type(el.datos.npcs) == "table" then
              tipos[el.datos.t] = true
            end
          end
          if tipos.mob or tipos.unitscan then return {clave = clave, i = i} end
          i = i + 1
        end
      end
    end
  end)()`);
  assert.ok(candidato, 'hay un paso real con mob o unitscan');
  m.lua(`SnetForever.Guias.cargar(${aLua(candidato.clave)}); SnetForever.Motor.irA(${candidato.i})`);
  m.avanzar(1);
  const lista = m.lua(`(function()
    local salida = {}
    for i, e in ipairs(SnetForever.Cercanos.lista()) do
      salida[i] = {clave = e.clave, tipo = e.tipo, estado = e.estado, nombreMacro = e.nombreMacro, paso = e.paso}
    end
    return salida
  end)()`);
  assert.ok(lista.length > 0, `Cercanos.lista() vacía en ${candidato.clave} paso ${candidato.i}`);
  for (const e of lista) {
    assert.ok(['mob', 'target', 'unitscan'].includes(e.tipo), e.tipo);
    assert.ok(['visto', 'cerca', 'lejos'].includes(e.estado), e.estado);
    assert.ok(typeof e.nombreMacro === 'string' && e.nombreMacro.length > 0, `${e.clave}: sin nombre para la macro`);
  }
  m.lua('SnetForever.Objetivos.crear(); SnetForever.Objetivos.pintar()');
  const botones = m.lua(`(function()
    local salida = {}
    for i, b in ipairs(SnetForever.Objetivos.marcos.botones) do
      if b:IsShown() then salida[#salida + 1] = b:GetAttribute("macrotext") or "" end
    end
    return salida
  end)()`);
  const esperados = m.lua('#SnetForever.Cercanos.ordenada()');
  assert.equal(botones.length, esperados);
  assert.ok(botones.length > 0);
  // Lote D (D1, ronda 1): con la marca por defecto, la de RestedXP: /cleartarget, /targetexact y /tm !1.
  for (const macro of botones) assert.match(macro, /^\/cleartarget\n\/targetexact [^\n]+\n\/tm !1$/, macro);
  sinErrores(m);
});

test('«Objetivos cercanos» no falla ni pinta botones en una guía lateral generada (sin mob ni target)', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  m.lua(`${V}.crear(); SnetForever.Objetivos.crear()`);
  assert.ok(abrir(m, FELINA));
  m.avanzar(1);
  assert.equal(m.lua('#SnetForever.Cercanos.lista()'), 0);
  m.lua('SnetForever.Objetivos.pintar()');
  assert.equal(m.lua(`(function() local n = 0 for _, b in ipairs(SnetForever.Objetivos.marcos.botones) do
    if b:IsShown() then n = n + 1 end end return n end)()`), 0);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Correcciones propias (Ruling F3-29): la acuática del druida para el Skyborne de la Horda
// ---------------------------------------------------------------------------------------------------

test('acuática: el druida de prueba con la 27 y la 28 entregadas y la 30 en el registro tiene como paso actual el de la 30', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  m.estadoMision(27, { entregada: true });
  m.estadoMision(28, { entregada: true });
  m.estadoMision(30, { enDiario: true });
  const clave = 'Cadenas de clase (H)\\druida-acuatica';
  assert.ok(m.lua('SnetForever.Guias.laterales("cadena")').includes(clave), 'la acuática sale en las cadenas de un Skyborne');
  assert.ok(abrir(m, clave));
  m.avanzar(10);
  const e = estado(m);
  assert.equal(e.fin, false, JSON.stringify(e));
  const qs = m.lua(`(function()
    local salida = {}
    for _, el in ipairs(SnetForever.Motor.paso(${e.actual}).elementos) do salida[#salida + 1] = el.datos.q or false end
    return salida
  end)()`);
  assert.ok(qs.includes(30), `el paso actual (${e.actual}) lleva las misiones ${qs.join(', ')}`);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ruling F3-31: el menú de cadenas no ofrece cadenas vacías para la raza del personaje
// ---------------------------------------------------------------------------------------------------

const CADENA = (f, id) => `Cadenas de clase (${f})\\${id}`;
const lateralesDe = (m, personaje) => m.lua(`SnetForever.Guias.laterales("cadena", ${aLua(personaje)})`);

test('F3-31: el druida de prueba ve oso, felina, claro, acuática y veneno en el menú de cadenas', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  const cadenas = lateralesDe(m, DRUIDA_SKYBORNE);
  for (const id of ['druida-oso', 'druida-felina', 'druida-claro', 'druida-acuatica', 'druida-veneno']) {
    assert.ok(cadenas.includes(CADENA('H', id)), `falta ${id}: ${cadenas.join(' | ')}`);
  }
  sinErrores(m);
});

test('F3-31: los casos de la revisión final ya no salen vacíos en el menú', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  const noLaVe = (personaje, clave) => {
    const lista = lateralesDe(m, personaje);
    assert.ok(!lista.includes(clave), `${JSON.stringify(personaje)} ve ${clave}`);
  };
  noLaVe({ clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 20 }, CADENA('H', 'druida-claro'));
  noLaVe({ clase: 'DRUID', raza: 'NightElf', faccion: 'Alliance', nivel: 20 }, CADENA('A', 'druida-claro'));
  noLaVe({ clase: 'PRIEST', raza: 'Human', faccion: 'Alliance', nivel: 20 }, CADENA('A', 'sacerdote-10'));
  noLaVe({ clase: 'PRIEST', raza: 'Dwarf', faccion: 'Alliance', nivel: 20 }, CADENA('A', 'sacerdote-10'));
  noLaVe({ clase: 'WARRIOR', raza: 'Skyborne', faccion: 'Horde', nivel: 20 }, CADENA('H', 'guerrero-defensiva'));
  noLaVe({ clase: 'WARRIOR', raza: 'Skyborne', faccion: 'Alliance', nivel: 20 }, CADENA('A', 'guerrero-defensiva'));
  noLaVe({ clase: 'HUNTER', raza: 'Skyborne', faccion: 'Alliance', nivel: 20 }, CADENA('A', 'cazador-domesticar'));
  noLaVe({ clase: 'WARLOCK', raza: 'Skyborne', faccion: 'Horde', nivel: 20 }, CADENA('H', 'brujo-abisario'));
  sinErrores(m);
});

test('F3-31: para toda clase y raza, cada cadena del menú tiene algún paso para el personaje (sin misiones en el juego)', opciones, () => {
  const m = maquinaReal(DRUIDA_SKYBORNE);
  const vacias = m.lua(`(function()
    local RAZAS = {Horde = {"Orc", "Scourge", "Tauren", "Troll", "Goblin", "Skyborne"},
      Alliance = {"Human", "Dwarf", "NightElf", "Gnome", "Skyborne"}}
    local salida = {}
    for faccion, razas in pairs(RAZAS) do
      for _, raza in ipairs(razas) do
        for clase in pairs(SnetForever.Filtros.MASCARA_CLASE) do
          local pj = {clase = clase, raza = raza, faccion = faccion, nivel = 60}
          for _, clave in ipairs(SnetForever.Guias.laterales("cadena", pj)) do
            local alguno = false
            for _, paso in ipairs(SnetForever.Datos.guia(clave).pasos) do
              if SnetForever.Filtros.evaluar(paso.filtro, pj) then alguno = true break end
            end
            if not alguno then salida[#salida + 1] = clave .. " (" .. raza .. " " .. clase .. ")" end
          end
        end
      end
    end
    return salida
  end)()`) || [];
  assert.deepEqual(vacias, []);
  sinErrores(m);
});
