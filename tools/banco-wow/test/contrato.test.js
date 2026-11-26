// Prueba de contrato: todo lo que emite la fase 1 (SnetForever_Rutas) lo entiende el motor. Si la fase 1 añade un
// tipo de elemento o un tipo de requisito nuevo, esta prueba falla y enseña cuál y dónde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const hayDatos = existsSync(TOC_RUTAS);
const opciones = { skip: hayDatos ? false : 'no está addons/SnetForever_Rutas (la fase 1 no se ha generado)' };

// Máquina con los datos reales de las dos bases.
const conDatosReales = () => nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });

// Tipos de requisito que entiende el motor de pasos (plan, contrato de datos de la fase 1).
const REQUISITOS = ['grupo', 'elite', 'nivel', 'paso', 'mision', 'profesion', 'reputacion', 'objeto', 'mazmorra'];

// «tipo (N usos, p. ej. guía línea L)» por cada entrada de un informe {clave: {n, ejemplo}}.
const enumerar = (informe) =>
  Object.entries(informe)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([clave, d]) => `  ${clave}: ${d.n} usos, p. ej. «${d.ejemplo}»`)
    .join('\n');

// Todas las guías de los dos addons de datos: las de SNF_RUTAS y las laterales de SNF_MISIONES (fase 3).
const TODAS = `local TODAS = {}
  for clave, guia in pairs(SNF_RUTAS.guias) do TODAS[clave] = guia end
  for clave, guia in pairs(SNF_MISIONES.guias or {}) do TODAS[clave] = guia end`;

// Recorre todos los elementos de todas las guías (y sus requisitos) y lo resume.
const REVISION = `(function()
  ${TODAS}
  local E = SnetForever.Elementos
  local REQUISITOS = ${aLua(Object.fromEntries(REQUISITOS.map((t) => [t, true])))}
  local sinRegistrar, faltan, requisitosMalos = {}, {}, {}
  local function anotar(tabla, clave, guia, linea)
    local d = tabla[clave]
    if not d then
      d = {n = 0, ejemplo = guia .. " " .. tostring(linea)}
      tabla[clave] = d
    end
    d.n = d.n + 1
  end
  for clave, guia in pairs(TODAS) do
    for _, paso in ipairs(guia.pasos) do
      for _, el in ipairs(paso.elementos) do
        local def = E.def(el.t)
        if def then
          for _, campo in ipairs(def.campos) do
            if el[campo] == nil then anotar(faltan, el.t .. "." .. campo, clave, el.linea and ("línea " .. el.linea) or ("paso " .. paso.n)) end
          end
        elseif not E.INFORMATIVOS[el.t] then
          anotar(sinRegistrar, tostring(el.t), clave, el.linea and ("línea " .. el.linea) or ("paso " .. paso.n))
        end
      end
      for _, req in ipairs(paso.requisitos) do
        if not REQUISITOS[req.t] then anotar(requisitosMalos, tostring(req.t), clave, "línea " .. tostring(paso.linea)) end
      end
    end
  end
  return {sinRegistrar = sinRegistrar, faltan = faltan, requisitosMalos = requisitosMalos}
end)()`;

test('contrato: todo t de las guías está registrado o es informativo', opciones, () => {
  const m = conDatosReales();
  const informe = m.lua(REVISION);
  assert.equal(Object.keys(informe.sinRegistrar).length, 0,
    `tipos de elemento sin evaluador ni lista de informativos:\n${enumerar(informe.sinRegistrar)}`);
  sinErrores(m);
});

test('contrato: cada elemento real trae los campos obligatorios de su def', opciones, () => {
  const m = conDatosReales();
  const informe = m.lua(REVISION);
  assert.equal(Object.keys(informe.faltan).length, 0,
    `elementos a los que les falta un campo obligatorio (tipo.campo):\n${enumerar(informe.faltan)}`);
  sinErrores(m);
});

test('contrato: todo t de requisitos es uno de los que entiende el motor', opciones, () => {
  const m = conDatosReales();
  const informe = m.lua(REVISION);
  assert.equal(Object.keys(informe.requisitosMalos).length, 0,
    `tipos de requisito desconocidos (se esperaban ${REQUISITOS.join(', ')}):\n${enumerar(informe.requisitosMalos)}`);
  sinErrores(m);
});

test('contrato: la revisión incluye las guías laterales de SNF_MISIONES (cadenas y mazmorras), con sus elementos nuevos', opciones, () => {
  const m = conDatosReales();
  const resumen = m.lua(`(function()
    ${TODAS}
    local nRutas, nMisiones, nTodas, tipos = 0, 0, 0, {}
    for _ in pairs(SNF_RUTAS.guias) do nRutas = nRutas + 1 end
    for _, g in pairs(SNF_MISIONES.guias or {}) do
      nMisiones = nMisiones + 1
      for _, paso in ipairs(g.pasos) do for _, el in ipairs(paso.elementos) do tipos[el.t] = true end end
    end
    for _ in pairs(TODAS) do nTodas = nTodas + 1 end
    return {nRutas = nRutas, nMisiones = nMisiones, nTodas = nTodas, tipos = tipos}
  end)()`);
  assert.ok(resumen.nMisiones > 0, 'SNF_MISIONES.guias trae guías laterales');
  assert.equal(resumen.nTodas, resumen.nRutas + resumen.nMisiones, 'ninguna clave está en las dos tablas');
  for (const t of ['goto', 'accept', 'turnin', 'complete', 'isQuestTurnedIn', 'subzone']) {
    assert.ok(resumen.tipos[t], `las laterales traen elementos «${t}»`);
  }
  sinErrores(m);
});

// Evalúa cada elemento de cada guía y comprueba la forma del resultado.
const EVALUACION = `(function()
  ${TODAS}
  local E = SnetForever.Elementos
  local VALIDOS = {hecho = 1, pendiente = 1, info = 1, saltar_paso = 1, ir_a = 1, ir_guia = 1}
  local malos, resultados = {}, {}
  for clave, guia in pairs(TODAS) do
    for _, paso in ipairs(guia.pasos) do
      for _, el in ipairs(paso.elementos) do
        local r, extra = E.evaluar(el, {})
        resultados[r] = (resultados[r] or 0) + 1
        if not VALIDOS[r] then
          malos[#malos + 1] = el.t .. " devolvió " .. tostring(r)
        elseif r == "ir_a" and type(extra) ~= "string" then
          malos[#malos + 1] = el.t .. " ir_a sin etiqueta"
        elseif r == "ir_guia" and extra ~= nil and type(extra) ~= "table" then
          malos[#malos + 1] = el.t .. " ir_guia con extra que no es lista"
        end
      end
    end
  end
  return {malos = malos, resultados = resultados, desconocidos = E.desconocidos}
end)()`;

test('contrato: con los datos reales, todos los elementos se evalúan y ningún tipo queda desconocido', opciones, () => {
  const m = conDatosReales();
  // Primero un personaje recién creado y luego uno avanzado, rico, fantasma y con profesiones.
  const nuevo = m.lua(EVALUACION);
  assert.deepEqual(nuevo.malos.slice(0, 10), []);
  m.jugador({ nivel: 45, xp: 100000, xpMax: 200000, dinero: 10000000, muerto: true, fantasma: true, clase: 'SHAMAN' });
  m.lua('BANCO.ponerHechizo(9134, "Herboristería", true); BANCO.ponerHabilidad("Herboristería", 150, 300)');
  m.lua('BANCO.ponerServicios({taxi = true})');
  const avanzado = m.lua(EVALUACION);
  assert.deepEqual(avanzado.malos.slice(0, 10), []);
  for (const informe of [nuevo, avanzado]) {
    assert.deepEqual(Object.keys(informe.desconocidos), [], `desconocidos: ${JSON.stringify(informe.desconocidos)}`);
  }
  assert.ok(nuevo.resultados.hecho > 0 && nuevo.resultados.pendiente > 0 && nuevo.resultados.info > 0
    && nuevo.resultados.saltar_paso > 0, JSON.stringify(nuevo.resultados));
  assert.ok(avanzado.resultados.ir_guia > 0, 'el `next` real da ir_guia');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Vigilancia 1: lo que la base añada mañana no rompe el addon, solo se cuenta como desconocido.
// ---------------------------------------------------------------------------------------------------

test('vigilancia 1: un tipo nuevo de la base y una etiqueta nueva se cargan y avanzan sin error, y se cuentan', () => {
  const m = nuevaMaquina();
  const guia = guiaDePrueba([
    { elementos: [{ t: 'nota', texto: { en: 'a' } }, { t: 'nuevoDeLaBase', dato: 7 }], etiquetas: { nuevaEtiqueta: 'x' } },
    { elementos: [{ t: 'xp', nivel: 1, efecto: 'objetivo' }], etiquetas: { completewith: 'next', otraNueva: true } },
  ]);
  m.ponerGuia(guia);
  // Se carga por la misma vía que usa el motor y se recorren sus pasos y elementos en orden, como al avanzar.
  const informe = m.lua(`(function()
    local E = SnetForever.Elementos
    local g = SnetForever.Datos.guia(${aLua(guia.clave)})
    local resultados = {}
    for _, paso in ipairs(g.pasos) do
      for _, el in ipairs(paso.elementos) do
        resultados[#resultados + 1] = (E.evaluar(el, {}))
      end
    end
    return {resultados = resultados, desconocidos = E.desconocidos, etiqueta = g.pasos[1].etiquetas.nuevaEtiqueta}
  end)()`);
  assert.deepEqual(informe.resultados, ['info', 'info', 'hecho']);
  assert.equal(informe.etiqueta, 'x');
  assert.equal(informe.desconocidos.nuevoDeLaBase, 1);
  assert.deepEqual(Object.keys(informe.desconocidos), ['nuevoDeLaBase']);
  sinErrores(m);
});
