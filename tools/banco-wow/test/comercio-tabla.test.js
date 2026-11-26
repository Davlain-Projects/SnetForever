// Comercio, ventana de compra, tarea 2: la tabla ordenable (ui/comercio_tabla.lua, SNF.TablaComercio). Cabeceras que ordenan,
// fila elegida, ratón encima, filas que se abren en subfilas y rueda del ratón. Es un componente suelto: aquí se prueba
// con una tabla de 3 columnas y 5 filas, sin la ventana de comercio.
import assert from 'node:assert/strict';
// 0.7.0: todas las pruebas de este archivo necesitan el addon SnetForever_Comercio; en la pasada de solo núcleo
// (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const T = 'SnetForever.TablaComercio';

// Tabla de prueba: nombre (texto), precio (número) y pct (a veces sin valor).
// Las 5 filas: a 30/10, b 10/50, c 20/nil, d 50/30, e 40/nil. `extra` añade opciones (código Lua dentro de la tabla).
function maquina(extra = '', filasLua = null) {
  const m = nuevaMaquina();
  m.lua(`
    TABLA = ${T}.crear(UIParent, {
      columnas = {
        {clave = "nombre", titulo = "Nombre", ancho = 100, justificado = "LEFT", valor = function(f) return f.nombre end},
        {clave = "precio", titulo = "Precio", ancho = 60, justificado = "RIGHT", valor = function(f) return f.precio end},
        {clave = "pct", titulo = "Pct", ancho = 40, justificado = "RIGHT", valor = function(f) return f.pct end},
      },
      filasVisibles = 4,
      ${extra}
    })
    TABLA:poner(${filasLua || `{
      {clave = "a", nombre = "Alfa", precio = 30, pct = 10},
      {clave = "b", nombre = "beta", precio = 10, pct = 50},
      {clave = "c", nombre = "Gamma", precio = 20},
      {clave = "d", nombre = "delta", precio = 50, pct = 30},
      {clave = "e", nombre = "Épsilon", precio = 40},
    }`})
  `);
  return m;
}

const claves = (m, n) => m.lua(`(function() local s = {} for i = 1, ${n} do local f = TABLA:visible(i) s[i] = f and f.clave or "-" end return table.concat(s, ",") end)()`);
const clic = (m, expr) => m.lua(`${expr}:Click()`);
const color = (m, i) => m.lua(`{TABLA.huecos[${i}].fondo:GetVertexColor()}`);
const esperado = (m, pct) => m.lua(`SnetForever.Estilo.aclarar(SnetForever.Estilo.comercio("filas"), ${pct})`);
const cerca = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-6);
// GetTexCoord da UL, LL, UR, LR (x, y): SetTexCoord(0, 0.5625, 0, 1) -> 0,0, 0,1, .5625,0, .5625,1.
const texCoord = (m, clave) => m.lua(`{TABLA.cabeceras.${clave}.flecha:GetTexCoord()}`);
const orden = (m) => [m.lua('select(1, TABLA:orden())'), m.lua('select(2, TABLA:orden())')];

test('pulsar una cabecera ordena de menor a mayor y otra vez de mayor a menor; la marca (raya y ▲/▼) va en esa columna', () => {
  const m = maquina();
  assert.equal(m.lua('TABLA:orden()'), undefined, 'al principio no hay orden');
  clic(m, 'TABLA.cabeceras.precio');
  assert.deepEqual(orden(m), ['precio', true]);
  assert.equal(claves(m, 4), 'b,c,a,e');
  assert.equal(m.lua('TABLA.cabeceras.precio.texto:GetText()'), 'Precio', 'el título no lleva la flecha escrita');
  assert.equal(m.lua('TABLA.cabeceras.precio.flecha:IsShown()'), true);
  assert.equal(m.lua('TABLA.cabeceras.precio.flecha:GetTexture()'), 'Interface\\Buttons\\UI-SortArrow');
  assert.deepEqual([m.lua('TABLA.cabeceras.precio.flecha:GetWidth()'), m.lua('TABLA.cabeceras.precio.flecha:GetHeight()')], [9, 8]);
  assert.deepEqual(texCoord(m, 'precio'), [0, 0, 0, 1, 0.5625, 0, 0.5625, 1], '▲ de menor a mayor');
  // La raya: acento de menor a mayor.
  assert.equal(m.lua('TABLA.cabeceras.precio.raya:IsShown()'), true);
  assert.equal(m.lua('TABLA.cabeceras.precio.raya:GetHeight()'), 2);
  assert.ok(cerca(m.lua('{TABLA.cabeceras.precio.raya:GetVertexColor()}'), m.lua('SnetForever.Estilo.comercio("acento")')));
  clic(m, 'TABLA.cabeceras.precio');
  assert.deepEqual(orden(m), ['precio', false]);
  assert.equal(claves(m, 4), 'd,e,a,c');
  assert.equal(m.lua('TABLA.cabeceras.precio.flecha:IsShown()'), true);
  assert.deepEqual(texCoord(m, 'precio'), [0, 1, 0, 0, 0.5625, 1, 0.5625, 0], '▼ de mayor a menor');
  // Al revés, la raya es del color secundario.
  assert.ok(cerca(m.lua('{TABLA.cabeceras.precio.raya:GetVertexColor()}'), m.lua('SnetForever.Estilo.comercio("secundario")')));
  // Las demás cabeceras no llevan flecha ni raya, y su fondo es el normal; el de la ordenada es más claro.
  assert.equal(m.lua('TABLA.cabeceras.nombre.texto:GetText()'), 'Nombre');
  assert.equal(m.lua('TABLA.cabeceras.pct.texto:GetText()'), 'Pct');
  assert.equal(m.lua('TABLA.cabeceras.nombre.flecha:IsShown()'), false);
  assert.equal(m.lua('TABLA.cabeceras.pct.flecha:IsShown()'), false);
  assert.equal(m.lua('TABLA.cabeceras.nombre.raya:IsShown()'), false);
  const normal = m.lua('{TABLA.cabeceras.nombre.fondo:GetVertexColor()}');
  assert.ok(cerca(normal, m.lua('SnetForever.Estilo.comercio("cabecera")')));
  assert.ok(m.lua('TABLA.cabeceras.precio.fondo:GetVertexColor()') > normal[0], 'la ordenada, más clara');
  // Una columna nueva empieza de menor a mayor, y los textos se ordenan sin distinguir mayúsculas.
  clic(m, 'TABLA.cabeceras.nombre');
  assert.deepEqual(orden(m), ['nombre', true]);
  assert.equal(claves(m, 4), 'a,b,d,c');
  assert.equal(m.lua('TABLA.cabeceras.precio.flecha:IsShown()'), false);
  assert.equal(m.lua('TABLA.cabeceras.nombre.flecha:IsShown()'), true);
  assert.equal(m.lua('TABLA.cabeceras.precio.raya:IsShown()'), false);
  sinErrores(m);
});

test('ordenarPor con asc explícito y alOrdenar', () => {
  const m = maquina('alOrdenar = function(c, a) VISTO = c .. tostring(a) end');
  m.lua('TABLA:ordenarPor("precio", false)');
  assert.equal(claves(m, 3), 'd,e,a');
  assert.equal(m.lua('VISTO'), 'preciofalse');
  m.lua('TABLA:ordenarPor("precio", false)');
  assert.equal(m.lua('select(2, TABLA:orden())'), false, 'con asc explícito no da la vuelta');
  sinErrores(m);
});

test('las filas sin valor van al final en los dos sentidos', () => {
  const m = nuevaMaquina();
  m.lua(`T5 = ${T}.crear(UIParent, {columnas = {{clave = "pct", titulo = "P", ancho = 40, valor = function(f) return f.pct end}}, filasVisibles = 5})
    T5:poner({{clave = "a", pct = 10}, {clave = "b"}, {clave = "c", pct = 5}, {clave = "d"}, {clave = "e", pct = 7}})`);
  const hueco = (i) => m.lua(`T5:visible(${i}).clave`);
  m.lua('T5:ordenarPor("pct", true)');
  assert.deepEqual([1, 2, 3].map(hueco), ['c', 'e', 'a'], 'de menor a mayor');
  assert.deepEqual([4, 5].map(hueco).sort(), ['b', 'd'], 'las dos sin valor, al final');
  m.lua('T5:ordenarPor("pct", false)');
  assert.deepEqual([1, 2, 3].map(hueco), ['a', 'e', 'c'], 'de mayor a menor');
  assert.deepEqual([4, 5].map(hueco).sort(), ['b', 'd'], 'las dos sin valor, al final también al revés');
  sinErrores(m);
});

test('la fila elegida queda pintada (+5 %), con el ratón +8 %; otra fila con el ratón +5 %; ninguna alterna', () => {
  const m = maquina();
  const base = esperado(m, 0);
  for (let i = 1; i <= 4; i++) assert.ok(cerca(color(m, i), base), `sin ratón ni elección, la fila ${i} es la base`);
  m.lua('TABLA:elegir("b")');
  assert.equal(m.lua('TABLA:elegida()'), 'b');
  assert.ok(cerca(color(m, 2), esperado(m, 5)), 'elegida +5 %');
  assert.ok(cerca(color(m, 1), base));
  m.lua('TABLA.huecos[2]:GetScript("OnEnter")(TABLA.huecos[2])');
  assert.ok(cerca(color(m, 2), esperado(m, 8)), 'elegida con ratón +8 %');
  m.lua('TABLA.huecos[3]:GetScript("OnEnter")(TABLA.huecos[3])');
  m.avanzar(0.3); // T1a ronda 1: el fondo del ratón pasa a otra fila pasada la espera
  assert.ok(cerca(color(m, 3), esperado(m, 5)), 'otra fila con ratón +5 %');
  m.lua('TABLA.huecos[3]:GetScript("OnLeave")(TABLA.huecos[3])');
  m.avanzar(0.3);
  assert.ok(cerca(color(m, 3), base), 'sin ratón vuelve a la base');
  m.lua('TABLA.huecos[2]:GetScript("OnLeave")(TABLA.huecos[2])');
  assert.ok(cerca(color(m, 2), esperado(m, 5)));
  m.lua('TABLA:elegir(nil)');
  assert.equal(m.lua('TABLA:elegida()'), undefined);
  assert.ok(cerca(color(m, 2), base));
  // Pulsar una fila la elige y llama a alPulsar.
  const p = maquina('alPulsar = function(f) PULSADA = f.clave end');
  clic(p, 'TABLA.huecos[3]');
  assert.equal(p.lua('PULSADA'), 'c');
  assert.equal(p.lua('TABLA:elegida()'), 'c');
  sinErrores(m);
  sinErrores(p);
});

test('poner() conserva la elegida y las abiertas por clave aunque cambie el orden', () => {
  const sub = (k) => `subfilas = {{clave = "${k}1", nombre = "s${k}", precio = 1}}`;
  const filas = `{
    {clave = "a", nombre = "Alfa", precio = 30, ${sub('a')}},
    {clave = "b", nombre = "beta", precio = 10, ${sub('b')}},
    {clave = "c", nombre = "Gamma", precio = 20},
  }`;
  const m = maquina('', filas);
  m.lua('TABLA:elegir("c"); TABLA:abrir("a", true)');
  m.lua('TABLA:ordenarPor("precio", true)');
  assert.equal(claves(m, 4), 'b,c,a,a1');
  m.lua(`TABLA:poner({
    {clave = "c", nombre = "Gamma", precio = 99},
    {clave = "a", nombre = "Alfa", precio = 5, ${sub('a')}},
    {clave = "b", nombre = "beta", precio = 10, ${sub('b')}},
  })`);
  assert.equal(m.lua('TABLA:elegida()'), 'c');
  assert.equal(claves(m, 4), 'a,a1,b,c', 'reordena con el orden vigente y a sigue abierta');
  assert.ok(cerca(color(m, 4), esperado(m, 5)), 'la elegida sigue pintada en su hueco nuevo');
  // Una elegida que ya no está se suelta.
  m.lua('TABLA:poner({{clave = "z", nombre = "Z", precio = 1}})');
  assert.equal(m.lua('TABLA:elegida()'), undefined);
  sinErrores(m);
});

test('una fila abierta enseña sus subfilas debajo, con sangría; pulsar una subfila llama a alPulsar con ella', () => {
  const filas = `{
    {clave = "a", nombre = "Alfa", precio = 30, subfilas = {{clave = "a1", nombre = "uno", precio = 1}, {clave = "a2", nombre = "dos", precio = 2}}},
    {clave = "b", nombre = "beta", precio = 10},
  }`;
  const m = maquina('alPulsar = function(f) PULSADA = f.clave end, alAbrir = function(f) ABIERTA = f.clave end', filas);
  assert.equal(claves(m, 4), 'a,b,-,-');
  assert.equal(m.lua('TABLA.huecos[1].flecha:GetTexture()'), 'Interface\\Buttons\\UI-PlusButton-Up');
  assert.equal(m.lua('TABLA.huecos[1].abrir:IsShown()'), true);
  assert.equal(m.lua('TABLA.huecos[2].abrir:IsShown()'), false, 'las filas sin subfilas no llevan botón de abrir');
  clic(m, 'TABLA.huecos[1].abrir');
  assert.equal(m.lua('ABIERTA'), 'a', 'pulsar la flecha llama a alAbrir');
  assert.equal(claves(m, 4), 'a,a1,a2,b');
  assert.equal(m.lua('TABLA.huecos[1].flecha:GetTexture()'), 'Interface\\Buttons\\UI-MinusButton-Up');
  assert.equal(m.lua('TABLA.huecos[2].celdas.nombre:GetText()'), 'uno');
  const xFila = m.lua('select(4, TABLA.huecos[1].celdas.nombre:GetPoint())');
  const xSub = m.lua('select(4, TABLA.huecos[2].celdas.nombre:GetPoint())');
  assert.ok(xSub > xFila, 'la subfila lleva sangría');
  clic(m, 'TABLA.huecos[3]');
  assert.equal(m.lua('PULSADA'), 'a2');
  assert.equal(m.lua('TABLA:elegida()'), 'a2');
  m.lua('TABLA:abrir("a", false)');
  assert.equal(claves(m, 4), 'a,b,-,-');
  sinErrores(m);
});

// B3r: el alto sigue a la letra del tema (Tema.ALTO_FILA, 22 px con Montserrat Medium 12; antes 20 px con ARIALN 11).
test('alto de fila y de cabecera 22 px (Tema.ALTO_FILA)', () => {
  const m = maquina();
  assert.equal(m.lua('TABLA.cabeceras.nombre:GetHeight()'), 22);
  assert.equal(m.lua('TABLA.huecos[1]:GetHeight()'), 22);
  assert.equal(m.lua('TABLA.huecos[4]:GetHeight()'), 22);
  assert.equal(m.lua('TABLA.huecos[5]'), undefined, 'solo hay filasVisibles huecos');
  assert.equal(m.lua('TABLA.marco:GetHeight()'), 22 + 4 * 22);
  assert.equal(m.lua('TABLA.marco:GetWidth()'), 200);
  assert.equal(m.lua('TABLA.huecos[1].fondo:GetTexture()'), 'Interface\\Buttons\\WHITE8X8');
  assert.deepEqual(m.lua('{TABLA.huecos[1].celdas.precio:GetFont()}').slice(0, 2), ['Interface\\AddOns\\SnetForever\\recursos\\fonts\\BarlowSemiCondensed-SemiBold.ttf', 12]);
  sinErrores(m);
});

test('la rueda del ratón desplaza y no pasa del final; los huecos de más se esconden', () => {
  const m = maquina();
  assert.equal(claves(m, 4), 'a,b,c,d');
  m.lua('TABLA.marco:GetScript("OnMouseWheel")(TABLA.marco, -1)');
  assert.equal(claves(m, 4), 'b,c,d,e', 'solo sobra una fila: el desplazamiento se recorta');
  m.lua('TABLA.marco:GetScript("OnMouseWheel")(TABLA.marco, 1)');
  assert.equal(claves(m, 4), 'a,b,c,d');
  m.lua('TABLA:poner({{clave = "x", nombre = "X", precio = 1}})');
  assert.equal(claves(m, 4), 'x,-,-,-');
  assert.equal(m.lua('TABLA.huecos[2]:IsShown()'), false);
  assert.equal(m.lua('TABLA.huecos[1]:IsShown()'), true);
  sinErrores(m);
});

test('un script que falla no rompe el addon: va por el ejecutar de las opciones o por el cortafuegos del comercio', () => {
  const m = maquina('alPulsar = function() error("fallo de prueba") end, ejecutar = function(nombre, fn, ...) FALLOS = (rawget(_G, "FALLOS") or 0) + 1; return pcall(fn, ...) end');
  clic(m, 'TABLA.huecos[1]');
  assert.equal(m.lua('FALLOS'), 1);
  sinErrores(m);
  // Sin ejecutar propio se usa SNF.Comercio.ejecutar: el fallo se apunta y nada llega a geterrorhandler().
  const n = maquina('alPulsar = function() error("fallo de prueba") end');
  n.disparar('AUCTION_HOUSE_SHOW');
  clic(n, 'TABLA.huecos[1]');
  assert.equal(n.lua('SnetForever.Comercio.activo()'), false, 'el cortafuegos apagó el comercio');
  sinErrores(n);
});

test('el botón de abrir no hace perder el ratón a la fila: sigue con +5 % y alSalir solo suena al irse de verdad', () => {
  const filas = '{{clave = "a", nombre = "Alfa", precio = 1, subfilas = {{clave = "a1", nombre = "u", precio = 1}}}, {clave = "b", nombre = "beta", precio = 2}}';
  const m = maquina('alSalir = function() SALES = (rawget(_G, "SALES") or 0) + 1 end', filas);
  const base = esperado(m, 0);
  const abrir = 'TABLA.huecos[1].abrir';
  const guion = (que, expr) => m.lua(`${expr}:GetScript("${que}")(${expr})`);
  // Orden de WoW: entra en la fila, y al pasar al botón la fila sale y entra el botón.
  guion('OnEnter', 'TABLA.huecos[1]');
  guion('OnLeave', 'TABLA.huecos[1]');
  guion('OnEnter', abrir);
  assert.ok(cerca(color(m, 1), esperado(m, 5)), 'con el ratón sobre el botón la fila sigue con +5 %');
  // Orden contrario (entra el botón antes de que la fila salga): también.
  guion('OnLeave', abrir);
  guion('OnEnter', 'TABLA.huecos[1]');
  guion('OnEnter', abrir);
  guion('OnLeave', 'TABLA.huecos[1]');
  assert.ok(cerca(color(m, 1), esperado(m, 5)), 'orden contrario: sigue con +5 %');
  // Sale del botón sin volver a la fila: ahora sí pierde el ratón.
  guion('OnLeave', abrir);
  m.avanzar(0.3); // T1a ronda 1: se apaga pasada la espera
  assert.ok(cerca(color(m, 1), base), 'fuera de los dos vuelve a la base');
  sinErrores(m);
});

test('al girar la rueda con el ratón sobre una fila se vuelve a llamar a alEntrar con la fila nueva', () => {
  const m = maquina('alEntrar = function(f) VISTA = f.clave end');
  m.lua('TABLA.huecos[1]:GetScript("OnEnter")(TABLA.huecos[1])');
  assert.equal(m.lua('VISTA'), 'a');
  m.lua('TABLA.marco:GetScript("OnMouseWheel")(TABLA.marco, -1)');
  assert.equal(m.lua('VISTA'), 'b', 'tras desplazar, bajo el hueco 1 está b');
  m.lua('TABLA.marco:GetScript("OnMouseWheel")(TABLA.marco, 1)');
  assert.equal(m.lua('VISTA'), 'a');
  // Sin el ratón sobre ninguna fila no se avisa.
  m.lua('TABLA.huecos[1]:GetScript("OnLeave")(TABLA.huecos[1]); VISTA = nil');
  m.avanzar(0.3); // T1a ronda 1: la fila del ratón (la luz) se va pasada la espera
  m.lua('TABLA.marco:GetScript("OnMouseWheel")(TABLA.marco, -1)');
  assert.equal(m.lua('rawget(_G, "VISTA")'), undefined);
  sinErrores(m);
});

test('t:fila(i) da la fila i del orden completo, sin depender del desplazamiento, y nil fuera de rango', () => {
  const m = maquina();
  m.lua('TABLA:ordenarPor("precio", true)'); // b 10, c 20, a 30, e 40, d 50
  const fila = (i) => m.lua(`(TABLA:fila(${i}) or {}).clave`);
  assert.deepEqual([1, 2, 3, 4, 5].map(fila), ['b', 'c', 'a', 'e', 'd']);
  m.lua('TABLA:desplazar(1)'); // 4 huecos de 5 filas: el hueco 1 pasa a ser la fila 2
  assert.equal(m.lua('TABLA:visible(1).clave'), 'c');
  assert.deepEqual([1, 2, 3, 4, 5].map(fila), ['b', 'c', 'a', 'e', 'd'], 'igual con la rueda girada');
  assert.equal(fila(6), undefined);
  assert.equal(fila(0), undefined);
  sinErrores(m);
});

// Revisión B7, menor 8: si la tabla se repinta bajo el ratón parado (llegan filas nuevas), la ventanita se pone al día con
// la fila que hay ahora bajo el ratón; con la misma fila no se vuelve a pedir, y sin fila se esconde.
test('B7: con el ratón parado, poner filas nuevas avisa con la fila que queda debajo (o la quita si no hay)', () => {
  const m = maquina('alEntrar = function(f) local v = rawget(_G, "VISTAS") or {}; v[#v + 1] = f.clave; rawset(_G, "VISTAS", v) end, alSalir = function() rawset(_G, "SALIDAS", (rawget(_G, "SALIDAS") or 0) + 1) end');
  m.lua('TABLA.huecos[1]:GetScript("OnEnter")(TABLA.huecos[1])');
  assert.deepEqual(m.lua('VISTAS'), ['a']);
  // Llega otra lista: debajo del ratón ahora está «z».
  m.lua('TABLA:poner({{clave = "z", nombre = "Zeta", precio = 1}, {clave = "a", nombre = "Alfa", precio = 30}})');
  assert.deepEqual(m.lua('VISTAS'), ['a', 'z'], 'avisa con la fila nueva');
  // La misma fila debajo (otra tabla de Lua, la misma clave): no se vuelve a pedir.
  m.lua('TABLA:poner({{clave = "z", nombre = "Zeta", precio = 1}, {clave = "a", nombre = "Alfa", precio = 30}})');
  assert.deepEqual(m.lua('VISTAS'), ['a', 'z']);
  // Sin filas: la ventanita se va.
  m.lua('TABLA:poner({})');
  assert.equal(m.lua('SALIDAS'), 1);
  sinErrores(m);
});

// Revisión B7, menor 5: poner(filas, true) mantiene el orden de lo que ya se veía y pone las filas nuevas detrás, en el
// orden en que llegan; poner(filas) vuelve a ordenar. Pulsar una cabecera ordena siempre.
test('B7: poner con mantener no mueve las filas que ya se veían; las nuevas van detrás en el orden en que llegan', () => {
  const m = maquina();
  clic(m, 'TABLA.cabeceras.precio');
  assert.equal(claves(m, 4), 'b,c,a,e');
  // Llegan dos más (una más barata que todas) y cambia el precio de «a»: con mantener, nada se mueve.
  m.lua(`TABLA:poner({
    {clave = "a", nombre = "Alfa", precio = 1}, {clave = "b", nombre = "beta", precio = 10}, {clave = "c", nombre = "Gamma", precio = 20},
    {clave = "d", nombre = "delta", precio = 50}, {clave = "e", nombre = "Épsilon", precio = 40},
    {clave = "g", nombre = "G", precio = 99}, {clave = "f", nombre = "F", precio = 0},
  }, true)`);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((i) => m.lua(`TABLA:fila(${i}).clave`)), ['b', 'c', 'a', 'e', 'd', 'g', 'f']);
  // Sin mantener, se ordena una vez.
  m.lua(`TABLA:poner({
    {clave = "a", nombre = "Alfa", precio = 1}, {clave = "b", nombre = "beta", precio = 10}, {clave = "c", nombre = "Gamma", precio = 20},
    {clave = "d", nombre = "delta", precio = 50}, {clave = "e", nombre = "Épsilon", precio = 40},
    {clave = "g", nombre = "G", precio = 99}, {clave = "f", nombre = "F", precio = 0},
  })`);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((i) => m.lua(`TABLA:fila(${i}).clave`)), ['f', 'a', 'b', 'c', 'e', 'd', 'g']);
  // olvidarOrden: con mantener, todo en el orden en que llega.
  m.lua('TABLA:olvidarOrden(); TABLA:poner({{clave = "x", precio = 5}, {clave = "y", precio = 1}}, true)');
  assert.deepEqual([1, 2].map((i) => m.lua(`TABLA:fila(${i}).clave`)), ['x', 'y']);
  // Pulsar la cabecera ordena aunque se esté manteniendo.
  clic(m, 'TABLA.cabeceras.precio');
  clic(m, 'TABLA.cabeceras.precio');
  assert.equal(m.lua('select(2, TABLA:orden())'), true);
  assert.deepEqual([1, 2].map((i) => m.lua(`TABLA:fila(${i}).clave`)), ['y', 'x']);
  sinErrores(m);
});

// T1a, ronda 2, menores 2 y 3, en TablaComercio.
test('ronda 2: si la lista encoge y se va la fila encendida mientras el ratón espera en otra, la luz pasa a esa fila', () => {
  const m = maquina('alEntrar = function(f) local v = rawget(_G, "VISTAS") or {}; v[#v + 1] = f.clave; rawset(_G, "VISTAS", v) end');
  const guion = (que, i) => m.lua(`TABLA.huecos[${i}]:GetScript("${que}")(TABLA.huecos[${i}])`);
  guion('OnEnter', 3);
  guion('OnLeave', 3);
  guion('OnEnter', 1);
  m.lua('TABLA:poner({{clave = "a", nombre = "Alfa", precio = 30}, {clave = "b", nombre = "beta", precio = 10}})');
  m.avanzar(0.5);
  assert.deepEqual(m.lua('VISTAS'), ['c', 'a'], 'la luz pasa a la fila del ratón');
  assert.ok(cerca(color(m, 1), esperado(m, 5)), 'y lleva el fondo del ratón');
  sinErrores(m);
});

test('ronda 2: si la tabla se esconde mientras la luz espera para pasar a otra fila, no se enciende nada', () => {
  const m = maquina('alEntrar = function(f) local v = rawget(_G, "VISTAS") or {}; v[#v + 1] = f.clave; rawset(_G, "VISTAS", v) end, alSalir = function() rawset(_G, "SALIDAS", (rawget(_G, "SALIDAS") or 0) + 1) end');
  const guion = (que, i) => m.lua(`TABLA.huecos[${i}]:GetScript("${que}")(TABLA.huecos[${i}])`);
  guion('OnEnter', 1);
  guion('OnLeave', 1);
  guion('OnEnter', 2);
  m.lua('TABLA.marco:Hide()');
  m.avanzar(0.5);
  assert.deepEqual(m.lua('VISTAS'), ['a'], 'la fila 2 no llega a encenderse');
  assert.equal(m.lua('rawget(_G, "SALIDAS")'), 1, 'al esconderse se apaga y avisa una vez');
  sinErrores(m);
});
