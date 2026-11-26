// Ventana principal, parte 1, Task 20 (punto de captura 3, Grupos): el texto de prueba que el jugador pega en el juego
// (test/fixtures/captura-3-grupos.txt, copiado también en docs/comercio/capturas-parte-1.md) tiene que ser exactamente lo que
// exporta el addon con estos datos y tiene que recrear el árbol, los objetos, las operaciones y las asignaciones.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';
import { GRUPOS, TIPOS, preparar, luaTabla } from './fixtures/captura-3-datos.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const T = 'SnetForever.TextoGrupos';
const A = 'SnetForever.Arbol';
const O = 'SnetForever.Operaciones';
const q = (t) => JSON.stringify(t);
const maquina = () => nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA });
const FIXTURE = new URL('./fixtures/captura-3-grupos.txt', import.meta.url);
const leerFixture = () => readFileSync(FIXTURE, 'utf8').trim();

const estado = (m) =>
  m.lua(`(function()
    local A, O = ${A}, ${O}
    local r = {raiz = A.hijos(""), grupos = {}, ops = {}, asignadas = {}}
    for _, ruta in ipairs(A.ordenadas()) do
      if ruta ~= "" then r.grupos[#r.grupos + 1] = {ruta, A.objetos(ruta)} end
    end
    for _, tipo in ipairs(${luaTabla(TIPOS)}) do
      r.ops[tipo] = O.lista(tipo)
      local nombres, heredada = O.deGrupo("Materiales", tipo)
      r.asignadas[tipo] = {nombres, heredada}
      local hijo, heredadaHijo = O.deGrupo("Materiales\`Hierbas", tipo)
      r.asignadas[tipo .. "Hijo"] = {hijo, heredadaHijo}
    end
    return r
  end)()`);

test('el texto de la captura 3 es lo que exporta el addon con los datos de prueba', () => {
  const m = maquina();
  m.lua(preparar());
  const t = m.lua(`${T}.exportar("")`);
  assert.match(t, /^SNF1:[A-Za-z0-9+/]+=*$/);
  assert.equal(t, leerFixture(), 'el archivo de prueba está desactualizado: vuelve a copiar el texto exportado');
  sinErrores(m);
});

test('importar el texto de la captura 3 en una cuenta limpia recrea árbol, objetos, operaciones y asignaciones', () => {
  const a = maquina();
  a.lua(preparar());
  const esperado = estado(a);

  const b = maquina();
  const r = b.lua(`(function()
    local d, e = ${T}.leer(${q(leerFixture())})
    if not d then return {error = e} end
    return {resumen = ${T}.resumen(d), res = ${T}.importar(d, {destino = "", moverObjetos = false})}
  end)()`);
  assert.equal(r.error, undefined);
  const total = GRUPOS.length;
  const objetos = GRUPOS.reduce((n, g) => n + g[2].length, 0);
  assert.equal(r.resumen.grupos, total);
  assert.equal(r.resumen.objetos, objetos);
  assert.equal(r.resumen.operaciones, 4);
  assert.equal(r.res.grupos, total);
  assert.equal(r.res.objetos, objetos);
  assert.equal(r.res.nuevas, 4);

  const real = estado(b);
  assert.deepEqual(real, esperado);
  assert.deepEqual(real.raiz.slice().sort(), ['Bolsas', 'Consumibles', 'Materiales']);
  for (const tipo of TIPOS) {
    assert.deepEqual(real.ops[tipo], ['#Default']);
    assert.deepEqual(real.asignadas[tipo][0], ['#Default']);
    assert.equal(real.asignadas[tipo][1], undefined, `${tipo}: la operación es propia de Materiales`);
    assert.notEqual(real.asignadas[tipo + 'Hijo'][1], undefined, `${tipo}: el subgrupo la hereda`);
  }
  // Tres niveles y los objetos donde tocan.
  assert.ok(real.grupos.some((g) => g[0] === 'Materiales`Hierbas`Raras'));
  const hierbas = real.grupos.find((g) => g[0] === 'Materiales`Hierbas')[1];
  assert.ok(hierbas.includes('i:2447') && hierbas.includes('i:765'));
  sinErrores(b);
});

test('importar el texto de la captura 3 por segunda vez no pisa nada: grupos «2» y operaciones reutilizadas', () => {
  const m = maquina();
  const r = m.lua(`(function()
    local d = ${T}.leer(${q(leerFixture())})
    ${T}.importar(d, {destino = ""})
    local res = ${T}.importar(d, {destino = "", moverObjetos = false})
    return {res = res, raiz = ${A}.hijos(""), subasta = ${O}.lista("subasta")}
  end)()`);
  assert.equal(r.res.nuevas, 0);
  assert.equal(r.res.reutilizadas, 4);
  assert.deepEqual(r.subasta, ['#Default']);
  assert.ok(r.raiz.includes('Materiales 2'));
  sinErrores(m);
});
