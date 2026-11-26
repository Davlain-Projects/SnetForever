// Comercio, tarea 11: grupos de objetos (propios y de la app) y reglas de compra / sniper.
import assert from 'node:assert/strict';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

// Máquina con unos grupos de la app puestos como los deja la ranura de precios (SNF_PRECIOS.grupos es una lista).
function maquina() {
  const m = nuevaMaquina();
  m.lua(`SNF_PRECIOS = {v = 1, seq = 1, generado = 1, casas = {}, completo = true, grupos = {
    {clave = "auto:Objetos comerciables › Tela", nombre = {es = "Tela", en = "Cloth"}, tipo = "auto", objetos = {2589, 2592}},
    {clave = "rapido", nombre = {es = "Se vende rápido", en = "Sells fast"}, tipo = "calculado", objetos = {2589}},
  }}`);
  return m;
}

const G = 'SnetForever.Grupos';
const R = 'SnetForever.Reglas';

test('grupos: crear, renombrar, añadir y quitar un grupo propio; salen primero y quedan guardados', () => {
  const m = maquina();
  const clave = m.lua(`${G}.crear("  Mis telas ")`);
  assert.equal(typeof clave, 'string');
  assert.equal(m.lua(`${G}.renombrar(${JSON.stringify(clave)}, "Telas buenas")`), true);
  // Desde la tarea 11 la clave de un grupo propio es «propio:<ruta>»: al renombrar cambia con la ruta.
  const nueva = 'propio:Telas buenas';
  assert.equal(m.lua(`${G}.anadir(${JSON.stringify(clave)}, 2589)`), false, 'la clave vieja ya no existe');
  assert.equal(m.lua(`${G}.anadir(${JSON.stringify(nueva)}, 2589)`), true);
  assert.equal(m.lua(`${G}.anadir(${JSON.stringify(nueva)}, 2589)`), true, 'repetido no falla');
  assert.equal(m.lua(`${G}.anadir(${JSON.stringify(nueva)}, 2592)`), true);
  assert.equal(m.lua(`${G}.quitar(${JSON.stringify(nueva)}, 2592)`), true);
  assert.equal(m.lua(`${G}.quitar(${JSON.stringify(nueva)}, 999)`), false);
  const lista = m.lua(`${G}.lista()`);
  assert.equal(lista.length, 3);
  assert.deepEqual(lista[0], { clave: nueva, nombre: 'Telas buenas', tipo: 'propio', objetos: [2589] });
  assert.equal(lista[1].tipo, 'auto');
  assert.equal(lista[2].tipo, 'calculado');
  // Los grupos propios se guardan en el árbol nuevo (comercio.v2); la lista plana de la 0.6.2 ya no se escribe.
  assert.deepEqual(m.lua('SnetForeverCuenta.comercio.v2.grupos'), { 'Telas buenas': true });
  assert.equal(m.lua(`#SnetForeverCuenta.comercio.grupos`), 0);
  assert.equal(m.lua(`${G}.crear("   ")`), undefined, 'nombre vacío no vale');
  sinErrores(m);
});

test('grupos: el nombre de los de la app sale en el idioma activo', () => {
  const m = maquina();
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  assert.equal(m.lua(`${G}.lista()[1].nombre`), 'Tela');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(m.lua(`${G}.lista()[1].nombre`), 'Cloth');
  sinErrores(m);
});

test('grupos: borrar va a la papelera y se recupera con sus objetos y su regla', () => {
  const m = maquina();
  const clave = m.lua(`${G}.crear("Hierbas")`);
  const c = JSON.stringify(clave);
  m.lua(`${G}.anadir(${c}, 2447)`);
  assert.equal(m.lua(`${R}.poner(${c}, {compraPct = 70})`), true);
  assert.equal(m.lua(`${G}.borrar(${c})`), true);
  assert.equal(m.lua(`#${G}.lista()`), 2);
  assert.deepEqual(m.lua(`${G}.papelera()`), [{ clave, nombre: 'Hierbas' }]);
  assert.equal(m.lua(`#SnetForeverCuenta.comercio.v2._papelera`), 1);
  // Un grupo nuevo no pisa la clave del borrado.
  const otra = m.lua(`${G}.crear("Otro")`);
  assert.notEqual(otra, clave);
  assert.equal(m.lua(`${G}.recuperar(${c})`), true);
  assert.equal(m.lua(`${G}.recuperar(${c})`), false);
  const recuperado = m.lua(`${G}.lista()`).find((g) => g.clave === clave);
  assert.deepEqual(recuperado.objetos, [2447]);
  assert.equal(m.lua(`${R}.de(${c}).compraPct`), 70);
  sinErrores(m);
});

test('grupos: los de la app no se editan ni se borran', () => {
  const m = maquina();
  const auto = JSON.stringify('auto:Objetos comerciables › Tela');
  assert.equal(m.lua(`${G}.borrar(${auto})`), false);
  assert.equal(m.lua(`${G}.renombrar(${auto}, "x")`), false);
  assert.equal(m.lua(`${G}.anadir(${auto}, 5)`), false);
  assert.equal(m.lua(`${G}.quitar(${auto}, 2589)`), false);
  assert.equal(m.lua(`${G}.borrar("rapido")`), false);
  assert.equal(m.lua(`#${G}.lista()`), 2);
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2._papelera`), undefined);
  sinErrores(m);
});

test('grupos: sin precios cargados la lista solo trae los propios', () => {
  const m = nuevaMaquina();
  m.lua(`${G}.crear("Mío")`);
  assert.equal(m.lua(`#${G}.lista()`), 1);
  sinErrores(m);
});

test('reglas: la plantilla, la regla de un grupo y la validación de rangos', () => {
  const m = maquina();
  assert.deepEqual(m.lua(`${R}.PLANTILLA`), { compraPct: 85, ritmoMin: 0.25, valorMin: 50000, sniperPct: 90, maxUnidades: 200, maxOro: 1000000 });
  assert.deepEqual(m.lua(`${R}.de("sin-regla")`), m.lua(`${R}.PLANTILLA`));
  assert.deepEqual(m.lua(`{${R}.poner("g", {compraPct = 150})}`), [false, 'compraPct']);
  assert.equal(m.lua(`${R}.de("g").compraPct`), 85, 'lo rechazado no se guarda');
  for (const mala of ['sniperPct = 0', 'sniperPct = 101', 'ritmoMin = 1.5', 'ritmoMin = -0.1', 'valorMin = -1', 'maxUnidades = 0',
    'maxUnidades = 10001', 'maxUnidades = 2.5', 'maxOro = -5', 'compraPct = "80"', 'compraPct = 0/0']) {
    assert.equal(m.lua(`(${R}.poner("g", {${mala}}))`), false, mala);
  }
  assert.equal(m.lua(`${R}.poner("g", {compraPct = 70, ritmoMin = 0.2, maxUnidades = 50})`), true);
  assert.deepEqual(m.lua(`${R}.de("g")`), { compraPct: 70, ritmoMin: 0.2, valorMin: 50000, sniperPct: 90, maxUnidades: 50, maxOro: 1000000 });
  // de() da una copia: tocarla no cambia lo guardado.
  m.lua(`${R}.de("g").compraPct = 1`);
  assert.equal(m.lua(`${R}.de("g").compraPct`), 70);
  m.lua(`${R}.PLANTILLA.compraPct = 85`);
  sinErrores(m);
});

const evaluar = (m, vivo, precios, regla = '{valorMin = 0}', modo = 'compra') =>
  m.lua(`(function() local r = ${R}.evaluar(2589, ${vivo}, ${precios}, ${regla}, "${modo}")
    return {buena = r.buena, pct = r.pct and math.floor(r.pct + 0.5) or false, motivo = r.motivo} end)()`);

test('reglas: evaluar da buena, caro, lento, sin_ritmo, sin_normal y barato', () => {
  const m = maquina();
  const vivo = '{precio = 20, cantidad = 5}';
  assert.deepEqual(evaluar(m, vivo, '{normal = 30, ritmo = 0.5}'), { buena: true, pct: 67, motivo: 'ok' });
  assert.deepEqual(evaluar(m, vivo, '{normal = 30, ritmo = 0.2}'), { buena: false, pct: 67, motivo: 'lento' }); // T1b: el mínimo por defecto es 0,25
  // Sin credenciales de Blizzard no hay ritmo: nunca es buena y lo dice.
  assert.deepEqual(evaluar(m, vivo, '{normal = 30}'), { buena: false, pct: 67, motivo: 'sin_ritmo' });
  assert.deepEqual(evaluar(m, vivo, '{ritmo = 0.9}'), { buena: false, pct: false, motivo: 'sin_normal' });
  assert.deepEqual(evaluar(m, vivo, 'nil'), { buena: false, pct: false, motivo: 'sin_normal' });
  assert.deepEqual(evaluar(m, '{precio = 29, cantidad = 1}', '{normal = 30, ritmo = 0.5}'), { buena: false, pct: 97, motivo: 'caro' });
  // Por debajo del valor mínimo (plantilla: 5 de oro) el objeto no interesa.
  assert.deepEqual(evaluar(m, vivo, '{normal = 30, ritmo = 0.5}', 'nil'), { buena: false, pct: 67, motivo: 'barato' });
  assert.deepEqual(evaluar(m, '{precio = 20000, cantidad = 1}', '{normal = 60000, ritmo = 0.5}', 'nil'), { buena: true, pct: 33, motivo: 'ok' });
  sinErrores(m);
});

test('reglas: el borde exacto cuenta como bueno y el sniper usa su propio porcentaje', () => {
  const m = maquina();
  // compraPct 85: 85 de 100 es justo el borde; sniperPct 90 admite hasta 90.
  assert.equal(evaluar(m, '{precio = 85, cantidad = 1}', '{normal = 100, ritmo = 0.4}').buena, true);
  assert.equal(evaluar(m, '{precio = 86, cantidad = 1}', '{normal = 100, ritmo = 0.4}').motivo, 'caro');
  assert.equal(evaluar(m, '{precio = 88, cantidad = 1}', '{normal = 100, ritmo = 0.4}', '{valorMin = 0}', 'sniper').buena, true);
  assert.equal(evaluar(m, '{precio = 91, cantidad = 1}', '{normal = 100, ritmo = 0.4}', '{valorMin = 0}', 'sniper').motivo, 'caro');
  assert.equal(evaluar(m, '{precio = 90, cantidad = 1}', '{normal = 100, ritmo = 0.4}', '{valorMin = 0}', 'sniper').buena, true);
  sinErrores(m);
});

// T1b, ronda 1.
test('reglas: el mínimo de «sale sin caducar» por defecto es 0,25 (antes 0,40); una regla guardada conserva el suyo', () => {
  const m = maquina();
  assert.equal(m.lua(`${R}.RITMO_MIN`), 0.25);
  assert.equal(m.lua(`${R}.PLANTILLA.ritmoMin`), 0.25);
  // Con la plantilla: 0,25 basta y 0,24 es lento.
  assert.equal(evaluar(m, '{precio = 50000, cantidad = 1}', '{normal = 100000, ritmo = 0.25}', 'nil').buena, true);
  assert.equal(evaluar(m, '{precio = 50000, cantidad = 1}', '{normal = 100000, ritmo = 0.24}', 'nil').motivo, 'lento');
  // Una regla que el jugador guardó antes (se guardan completas, con su 0,40) no cambia.
  m.lua(`SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.reglas["vieja"] = {compraPct = 85, ritmoMin = 0.4, valorMin = 50000, sniperPct = 90, maxUnidades = 200, maxOro = 1000000}`);
  assert.equal(m.lua(`${R}.de("vieja").ritmoMin`), 0.4);
  assert.equal(evaluar(m, '{precio = 50000, cantidad = 1}', '{normal = 100000, ritmo = 0.3}', `${R}.de("vieja")`).motivo, 'lento');
  sinErrores(m);
});

test('reglas: con 0 unidades a la venta no hay veredicto (ni buena compra ni «no cumple»)', () => {
  const m = maquina();
  // El precio es el de la última vez que se vio: ya no hay ninguna subasta a ese precio.
  assert.deepEqual(evaluar(m, '{precio = 20000, cantidad = 0}', '{normal = 60000, ritmo = 0.5}', 'nil'), { buena: false, pct: false, motivo: 'sin_venta' });
  assert.equal(evaluar(m, '{precio = 20000, cantidad = 1}', '{normal = 60000, ritmo = 0.5}', 'nil').buena, true);
  assert.equal(evaluar(m, '{precio = 20000}', '{normal = 60000, ritmo = 0.5}', 'nil').buena, true, 'sin cantidad (quien llama no la sabe) se juzga como antes');
  m.lua(`local A = SnetForever.Arbol; local r = A.crear("", "Sin venta"); assert(A.poner("i:77", r)); assert(${R}.poner("propio:" .. r, {compraPct = 85}))`);
  assert.equal(m.lua(`${R}.buenaCompra(77, {precio = 20000, cantidad = 1}, {normal = 60000, ritmo = 0.5})`), true);
  assert.equal(m.lua(`${R}.buenaCompra(77, {precio = 20000, cantidad = 0}, {normal = 60000, ritmo = 0.5})`), undefined);
  sinErrores(m);
});

// F9p: el número de ventas de una mercancía puede estar inflado por cancelaciones. Un número bajo es fiable; uno alto no prueba
// que se venda. Quién pasa la regla no cambia: solo se dice aparte que la rotación está sin confirmar.
const evaluarF9 = (m, vivo, precios, modo = 'compra') => m.lua(`(function() local r = ${R}.evaluar(2589, ${vivo}, ${precios}, {valorMin = 0}, "${modo}")
  return {buena = r.buena, motivo = r.motivo, sinConfirmar = r.rotacionSinConfirmar == true, hay = r.rotacionSinConfirmar ~= nil} end)()`);

test('el veto lento no cambia: las mismas mercancías y objetos pasan la regla que antes', () => {
  const m = maquina();
  for (const [modo, tope] of [['compra', 85], ['sniper', 90]]) {
    for (const precio of [50, 85, 86, 90, 91, 120]) {
      for (const ritmo of [0, 0.1, 0.24, 0.25, 0.31, 0.9]) {
        const motivo = precio > tope ? 'caro' : ritmo < 0.25 ? 'lento' : 'ok';
        for (const dato of ['', ', mercancia = false', ', mercancia = true']) {
          const r = evaluarF9(m, `{precio = ${precio}, cantidad = 5}`, `{normal = 100, ritmo = ${ritmo}${dato}}`, modo);
          assert.deepEqual([r.buena, r.motivo], [motivo === 'ok', motivo], `${modo}, ${precio}, ${ritmo}${dato}`);
        }
      }
    }
  }
  sinErrores(m);
});

test('una mercancía aprobada lleva rotacionSinConfirmar; una rechazada o un objeto suelto, no', () => {
  const m = maquina();
  const vivo = '{precio = 50, cantidad = 5}';
  assert.equal(evaluarF9(m, vivo, '{normal = 100, ritmo = 0.9, mercancia = true}').sinConfirmar, true);
  assert.equal(evaluarF9(m, vivo, '{normal = 100, ritmo = 0.9, mercancia = true}', 'sniper').sinConfirmar, true);
  assert.equal(evaluarF9(m, vivo, '{normal = 100, ritmo = 0.1, mercancia = true}').hay, false, 'lenta: no aprobada');
  assert.equal(evaluarF9(m, '{precio = 99, cantidad = 5}', '{normal = 100, ritmo = 0.9, mercancia = true}').hay, false, 'cara: no aprobada');
  assert.equal(evaluarF9(m, vivo, '{normal = 100, ritmo = 0.9, mercancia = false}').hay, false, 'objeto suelto');
  m.lua(`local A = SnetForever.Arbol; local r = A.crear("", "F9p"); assert(A.poner("i:77", r)); assert(A.poner("i:78", r)); assert(${R}.poner("propio:" .. r, {compraPct = 85}))`);
  const buena = (precios) => m.lua(`(function() local a, b = ${R}.buenaCompra(77, {precio = 20000, cantidad = 1}, ${precios}); return {a = a, b = b == true} end)()`);
  assert.deepEqual(buena('{normal = 60000, ritmo = 0.5, mercancia = true}'), { a: true, b: true });
  assert.deepEqual(buena('{normal = 60000, ritmo = 0.5}'), { a: true, b: false });
  assert.deepEqual(buena('{normal = 60000, ritmo = 0.1, mercancia = true}'), { a: false, b: false });
  sinErrores(m);
});

test('sin el dato de mercancía se trata como hoy', () => {
  const m = maquina();
  const r = evaluarF9(m, '{precio = 50, cantidad = 5}', '{normal = 100, ritmo = 0.9}');
  assert.deepEqual(r, { buena: true, motivo: 'ok', sinConfirmar: false, hay: false });
  sinErrores(m);
});
