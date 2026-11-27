// Comercio, Task 20d y T1b: nuestras líneas dentro del tooltip de objetos del juego (addon SnetForever_Comercio, ui/tooltip.lua).
// Salen en GameTooltip e ItemRefTooltip por el mismo enganche que las marcas del núcleo, en dos apartados de título amarillo
// («SnetForever · Información general» y «SnetForever · Subasta») con cada línea en dos columnas (AddDoubleLine). Nada de
// lo del juego se toca. T1b: el % con flecha es la tendencia del valor de mercado, «N subastas», el inventario por
// personaje, ItemID e IconID, y un ajuste por línea. Todos los datos de aquí son inventados.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000; // GetServerTime() del banco al empezar (hh:13:20)
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const foto = (h) => h * 3600 + 1357; // hh:22:37

// Una ranura de precios como la escribe la app: casas = {casa: {item: [precio, cantidad, normal, tendencia, ritmo, vendidosDia,
// poco, subastas, conTendencia, mercancia?]}} (subastas y conTendencia desde T1b; una fila de 7 es de una app de antes; F5:
// un 1 detrás si es una mercancía).
function ponerRanura(dir, i, casasDeLaRanura, generado = foto(H)) {
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\np2.lua\n');
  writeFileSync(join(carpeta, 'p1.lua'), `if SNF_PRECIOS == nil or (SNF_PRECIOS.seq or 0) < 1 then
  SNF_PRECIOS = {v = 1, seq = 1, generado = ${generado}, region = "us", conocidas = {["Normal|Horde"] = 114}, casas = {}, grupos = {}, nombres = {}}
end
`);
  const lineas = ['local P = SNF_PRECIOS; if not (P and P.seq == 1) then return end', 'local c = P.casas'];
  for (const [casa, objetos] of Object.entries(casasDeLaRanura)) {
    lineas.push(`c[${casa}] = c[${casa}] or {}`);
    for (const [item, f] of Object.entries(objetos)) lineas.push(`c[${casa}][${item}] = {${f.join(', ')}}`);
  }
  lineas.push('P.completo = true');
  writeFileSync(join(carpeta, 'p2.lua'), `${lineas.join('\n')}\n`);
}

// 2589: el lino, una mercancía (F5: el 1 del final), a 9g 80s con el valor de mercado en 10g que sube un 12 %, 37
// subastas, 0,42 y 2054,4 al día. 5000: un objeto suelto (sin el 1) con 85 al día; el valor no cambia (0 %, sabido). 5001: mínima 12g y mercado 10g que baja un 7,4 %. 5002: una fila de antes de T1b (7 números: sin
// subastas y sin saber la tendencia) con lo que sale desconocido (-1).
function casas() {
  return { 114: {
    2589: [98000, 400, 100000, 12, 0.42, 2054.4, 0, 37, 1, 1],
    5000: [40000, 20, 1000000, 0, 0.42, 85, 0, 5, 1],
    5001: [120000, 20, 100000, -7.4, 0.42, 85, 0, 3, 1],
    5002: [98000, 20, 100000, 0, -1, -1, 0],
    5003: [98000, 20, 'nil', 0, 0.42, 85, 0, 1, 0], // sin valor normal
    5004: [98000, 1, 100000, 0, 0.42, 85, 0, 1, 0], // una subasta de una unidad; la tendencia no se sabe
    5005: [40000, 0, 100000, 3, 0.42, 85, 0, 0, 1], // ya no está a la venta: 40000 es de la última vez que se vio
  } };
}

// La foto de la hora anterior (la que la consulta lee sin abrir la subasta): el lino más barato y con menos a la venta.
function casasAntes() {
  return { 114: { 2589: [90000, 300, 95000, 0, 0.4, 80, 0] } };
}

// ranuras (F1): {ahora, antes}, otras casas para la foto de esta hora y para la de la anterior.
function maquina({ precios = true, escaneo = true, sinApi, previo, cargar = true, minuto = 40, viejas = false, ranuras } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-tooltip-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  if (precios) {
    // viejas: la app lleva horas sin escribir; las ranuras traen fotos de hace 8 y 9 horas.
    ponerRanura(dir, ranuraDeHora(H), ranuras ? ranuras.ahora : casas(), viejas ? foto(H - 8) : foto(H));
    ponerRanura(dir, ranuraDeHora(H - 1), ranuras ? ranuras.antes : casasAntes(), viejas ? foto(H - 9) : foto(H - 1));
  }
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde', idioma: 'esES' }, sinApi, previo });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((minuto * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  if (precios && cargar) m.lua('SnetForever.Precios.alAbrir()'); // carga los precios como al abrir la subasta (con cargar: false se dejan para la consulta del tooltip)
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(5000, { nombre: 'Barato de oro', calidad: 3 });
  m.itemInfo(5001, { nombre: 'Caro de oro', calidad: 2 });
  m.itemInfo(5002, { nombre: 'Sin ritmo', calidad: 1 });
  m.itemInfo(5003, { nombre: 'Sin normal', calidad: 1 });
  m.itemInfo(5004, { nombre: 'Uno solo', calidad: 1 });
  m.itemInfo(5005, { nombre: 'Agotado', calidad: 1 });
  m.itemInfo(6000, { nombre: 'Sin datos', calidad: 1 });
  if (escaneo) {
    // El escaneo en vivo imitado: el lino a 4g 50s (20 unidades, visto hace 10 min).
    m.lua(`SnetForever.Escaneo = {
      estado = function() return "parado" end,
      datos = function() return {[2589] = {precio = 45000, cantidad = 20, hora = GetServerTime() - 600}} end,
    }`);
  }
  return m;
}

// Un grupo «Paños › Lino» con el lino dentro, su operación de subasta y su regla de compra.
const GRUPO_LINO = `local A, O = SnetForever.Arbol, SnetForever.Operaciones
  local r1 = A.crear("", "Paños")
  local r2 = A.crear(r1, "Lino")
  assert(A.poner("i:2589", r2))
  assert(O.crear("subasta", "Vender lino"))
  assert(O.ponerDeGrupo(r2, "subasta", {"Vender lino"}))
  assert(SnetForever.Reglas.poner("propio:" .. r2, {compraPct = 85}))`;

// Sin los colores; una textura metida en el texto (la flecha del %) queda como «^».
const sinColores = (s) => String(s ?? '').replace(/\|c[0-9a-fA-F]{8}/g, '').replace(/\|r/g, '').replace(/\|T[^|]*\|t/g, '^');
const T_GENERAL = 'SnetForever · Información general';
// F5: en una mercancía (el lino) y en un objeto suelto, con el aviso de que no son ventas debajo.
const SALEN = 'Salidas locales/día (ventas y retiradas, aprox.)';
const PARTE = 'Parte que sale (vendida o retirada, aprox.)';
const SALEN_SUELTO = 'Salen antes de tiempo al día (vendidas o retiradas)';
const PARTE_SUELTO = 'Parte que sale antes de tiempo (vendida o retirada)';
const NO_SON_VENTAS = 'No son ventas: también cuenta lo que retira su dueño';
// F9p: en una mercancía el número alto no prueba que se venda: su aprobado lo dice y el número es un tope.
const SIN_CONFIRMAR = 'El precio cumple tu regla · rotación sin confirmar';
const SIN_CONFIRMAR_EN = 'Price meets your rule · turnover unconfirmed';
// La flecha del %: el icono «sube» o «baja» del atlas del tema, teñido con el color de TooltipComercio.COLORES.
const flecha = (m, icono, color) => m.lua(`local c = SnetForever.TooltipComercio.COLORES[${aLua(color)}]
  return SnetForever.Tema.iconoTexto(${aLua(icono)}, c[1], c[2], c[3])`);
const hex = (m, clave) => m.lua(`SnetForever.TooltipComercio.hex(${aLua(clave)})`);
const ver = (m, id, tooltip) => { m.tooltipObjeto(id, tooltip); return m.detalleTooltip(tooltip); };
// Las líneas que añadimos: todas menos el nombre del objeto.
const nuestras = (detalle) => detalle.slice(1);
const linea = (detalle, izq) => detalle.find((d) => sinColores(d.izq) === izq);
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));
const texto = (m, clave, ...args) => m.lua(`SnetForever.L.t(${[clave, ...args].map(aLua).join(', ')})`);
const AMARILLO = [1, 0.82, 0];
// F1: la línea de la regla dice con qué mínimo la ha mirado («No cumple tu regla (a 9g 80s 00c)»); esto da solo el veredicto.
const reglaDice = (x) => sinColores(x.izq).replace(/ \(a [^)]*\)$/, '');
const aprobada = (x) => reglaDice(x) === 'Buena compra según tu regla' || reglaDice(x) === SIN_CONFIRMAR;
// F1: la lista de Navegar de un objeto, imitada (SNF.Busqueda.vivo): {precio, cantidad, hora, origen = "lista"} de hace
// `hace` segundos. Es lo único que gana a la foto de la app (el escaneo ya no).
const listaImitada = (m, item, precio, cantidad, hace) => m.lua(`SnetForever.Busqueda.vivo = function(i)
    if i == ${item} then return {precio = ${precio}, cantidad = ${cantidad}, hora = GetServerTime() - ${hace}, origen = "lista"} end
  end`);

test('el objeto con grupo, operación y precios lleva los dos apartados de título amarillo y sus líneas en orden', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  listaImitada(m, 2589, 45000, 20, 600); // F1: la lista de Navegar, leída hace 10 min
  const d = ver(m, 2589);
  assert.equal(d[0].izq, 'Paño de lino', 'lo del juego sigue primero y sin tocar');
  const t1 = d.findIndex((x) => x.izq === T_GENERAL);
  const t2 = d.findIndex((x) => x.izq === 'SnetForever · Subasta');
  assert.ok(t1 > 0 && t2 > t1, JSON.stringify(d));
  assert.deepEqual(d[t1].colorIzq, AMARILLO);
  assert.deepEqual(d[t2].colorIzq, AMARILLO);
  assert.equal(d[t1].der, undefined, 'el título es una línea sola');
  // Apartado de información general: grupo con « › » y la operación de subasta.
  assert.deepEqual([d[t1 + 1].izq, d[t1 + 1].der], ['Grupo', 'Paños › Lino']);
  assert.deepEqual([d[t1 + 2].izq, d[t1 + 2].der], ['Operación de subasta', 'Vender lino']);
  // Apartado «Subasta»: cada línea con la etiqueta a la izquierda (gris claro) y el valor a la derecha.
  const etiquetas = d.slice(t2 + 1).filter((x) => x.der !== undefined).map((x) => x.izq);
  assert.deepEqual(etiquetas, ['A la venta', 'Compra mínima', 'Valor de mercado', SALEN, PARTE]);
  for (const x of d.slice(t1 + 1)) {
    if (x.der !== undefined) assert.deepEqual(x.colorIzq, [0.8, 0.8, 0.8], `etiqueta gris claro: ${x.izq}`);
  }
  assert.equal(sinColores(linea(d, 'A la venta').der), '20 unidades (subasta, hace 10 min)', 'el dato de ahora: la lista de Navegar (una mercancía no cuenta subastas)');
  assert.equal(sinColores(linea(d, 'Compra mínima').der), '4g 50s 00c');
  assert.equal(sinColores(linea(d, 'Valor de mercado').der), '[^12%] 10g 00s 00c (app, hace 17 min)', 'la tendencia del valor, delante, el valor y de cuándo es');
  assert.equal(sinColores(linea(d, SALEN).der), 'hasta 2.054');
  assert.equal(sinColores(linea(d, PARTE).der), '42 %');
  // Cumple la regla del jugador: 4g 50s ≤ 85 % de 10g, ritmo 0,42 ≥ 0,25. F9p: es una mercancía, rotación sin confirmar.
  const buena = d.find((x) => reglaDice(x) === SIN_CONFIRMAR);
  assert.ok(buena, JSON.stringify(d));
  assert.equal(sinColores(buena.izq), `${SIN_CONFIRMAR} (a 4g 50s 00c)`);
  assert.deepEqual(buena.colorIzq, m.lua('SnetForever.TooltipComercio.COLORES.amarillo'));
  sinErrores(m);
});

test('el dinero va en g, s y c como Tema.dinero (B6r, punto 11 y ronda 1) con los colores del tema', () => {
  const m = maquina();
  listaImitada(m, 2589, 45000, 20, 600);
  const d = ver(m, 2589);
  const oro = m.lua('SnetForever.Tema.HEX.oro');
  const plata = m.lua('SnetForever.Tema.HEX.plata');
  const minima = linea(d, 'Compra mínima').der;
  assert.match(minima, /^\|cff[0-9a-f]{6}4g\|r \|cff[0-9a-f]{6}50s\|r \|cff[0-9a-f]{6}00c\|r$/);
  assert.ok(minima.includes(`|cff${plata}50s|r`), minima);
  assert.ok(linea(d, 'Valor de mercado').der.includes(`|cff${oro}10g|r`), linea(d, 'Valor de mercado').der);
  sinErrores(m);
});

test('el % es la tendencia del valor de mercado: [▲x%] en verde si sube, [▼x%] en rojo si baja, [0%] neutro; bajar nunca va en verde', () => {
  const m = maquina({ escaneo: false });
  const verde = hex(m, 'verde');
  const rojo = hex(m, 'rojo');
  // Sube un 12 %: flecha hacia arriba y todo el corchete en verde.
  const sube = linea(ver(m, 2589), 'Valor de mercado').der;
  assert.equal(sinColores(sube), '[^12%] 10g 00s 00c');
  assert.ok(sube.startsWith(`|cff${verde}[${flecha(m, 'sube', 'verde')}12%]|r `), sube);
  assert.ok(!sube.includes(rojo), sube);
  // Baja un 7,4 %: flecha hacia abajo, redondeado, en rojo y nunca en verde.
  const baja = linea(ver(m, 5001), 'Valor de mercado').der;
  assert.equal(sinColores(baja), '[^7%] 10g 00s 00c');
  assert.ok(baja.startsWith(`|cff${rojo}[${flecha(m, 'baja', 'rojo')}7%]|r `), baja);
  assert.ok(!baja.includes(verde), `bajar nunca va en verde: ${baja}`);
  // No cambia (y se sabe): [0%] sin flecha y en el gris de las etiquetas.
  const igual = linea(ver(m, 5000), 'Valor de mercado').der;
  assert.equal(sinColores(igual), '[0%] 100g 00s 00c');
  assert.ok(igual.startsWith(`|cff${hex(m, 'gris')}[0%]|r `), igual);
  assert.ok(!igual.includes('|T'), 'sin flecha');
  // La tendencia no se sabe (pocos días de datos, o una fila de una app de antes): sin corchete, no un 0 % inventado.
  assert.equal(sinColores(linea(ver(m, 5004), 'Valor de mercado').der), '10g 00s 00c');
  assert.equal(sinColores(linea(ver(m, 5002), 'Valor de mercado').der), '10g 00s 00c');
  // El % ya no compara la compra mínima con el mercado: la línea de la compra mínima no lleva corchete.
  assert.equal(sinColores(linea(ver(m, 5001), 'Compra mínima').der), '12g 00s 00c');
  // La flecha es una textura (la letra del juego puede no traer los triángulos): nada de ▲ ni ▼ como letra.
  assert.ok(!/[\u25b2\u25bc]/.test(sube + baja));
  sinErrores(m);
});

test('«N subastas» además de las unidades, y el «(hace…)» en azul claro', () => {
  const m = maquina({ escaneo: false });
  const azul = hex(m, 'azul');
  const der = linea(ver(m, 2589), 'A la venta').der;
  assert.equal(sinColores(der), '400 unidades, 37 subastas (app, hace 17 min)');
  assert.ok(der.endsWith(`|cff${azul}(app, hace 17 min)|r`), der);
  assert.equal(sinColores(linea(ver(m, 5004), 'A la venta').der), '1 unidad, 1 subasta (app, hace 17 min)');
  assert.equal(sinColores(linea(ver(m, 5002), 'A la venta').der), '20 unidades (app, hace 17 min)', 'una fila de antes de T1b no trae las subastas: no se inventan');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(sinColores(linea(ver(m, 2589), 'On sale').der), `400 units, 37 auctions (app, ${texto(m, 'COMERCIO_HACE_MIN', 17)})`);
  assert.equal(sinColores(linea(ver(m, 5004), 'On sale').der), `1 unit, 1 auction (app, ${texto(m, 'COMERCIO_HACE_MIN', 17)})`);
  sinErrores(m);
});

test('el tiempo va en rojo con más de 24 h y no con menos', () => {
  const m = maquina({ escaneo: false });
  const rojo = hex(m, 'rojo');
  const poco = linea(ver(m, 2589), 'A la venta').der;
  assert.equal(sinColores(poco), '400 unidades, 37 subastas (app, hace 17 min)', 'sin escaneo en vivo: la app (hecha a las hh:22:37, ahora hh:40)');
  assert.ok(!poco.includes(`|cff${rojo}`), poco);
  m.lua('SnetForever.Precios.edad = function() return 25 * 3600 end');
  const mucho = linea(ver(m, 2589), 'A la venta').der;
  assert.equal(sinColores(mucho), '400 unidades, 37 subastas (app, hace 25 h)');
  assert.ok(mucho.includes(`|cff${rojo}(app, hace 25 h)|r`), mucho);
  m.lua('SnetForever.Precios.edad = function() return 24 * 3600 end');
  assert.ok(!linea(ver(m, 2589), 'A la venta').der.includes(`|cff${rojo}`), 'justo 24 h todavía no pasa');
  sinErrores(m);
});

test('con la app y el escaneo sale la app, más nueva o no (F1: el escaneo no sabe de cuándo es su foto)', () => {
  const m = maquina();
  m.lua('SnetForever.Precios.edad = function() return 120 end');
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'A la venta').der), '400 unidades, 37 subastas (app, hace 2 min)');
  assert.equal(sinColores(linea(d, 'Compra mínima').der), '9g 80s 00c');
  sinErrores(m);
});

test('sin grupo no sale la línea de Grupo; sin operación no sale la de Operación', () => {
  const m = maquina();
  const sin = ver(m, 2589);
  assert.ok(!linea(sin, 'Grupo'), JSON.stringify(sin));
  assert.ok(!linea(sin, 'Operación de subasta'));
  assert.ok(!sin.some((x) => aprobada(x) || reglaDice(x) === 'No cumple tu regla'), 'sin regla no sale nada');
  m.lua('local A = SnetForever.Arbol; assert(A.poner("i:2589", A.crear("", "Telas")))');
  const con = ver(m, 2589);
  assert.equal(linea(con, 'Grupo').der, 'Telas');
  assert.ok(!linea(con, 'Operación de subasta'), 'el grupo no tiene operación');
  sinErrores(m);
});

test('la operación heredada de un grupo de arriba también sale', () => {
  const m = maquina();
  m.lua(`local A, O = SnetForever.Arbol, SnetForever.Operaciones
    local r1 = A.crear("", "Paños"); local r2 = A.crear(r1, "Lino")
    assert(A.poner("i:2589", r2))
    assert(O.crear("subasta", "De los paños")); assert(O.ponerDeGrupo(r1, "subasta", {"De los paños"}))`);
  assert.equal(linea(ver(m, 2589), 'Operación de subasta').der, 'De los paños');
  sinErrores(m);
});

test('sin ningún precio (ni app ni escaneo) no sale la sección de Subasta: sale una sola línea gris que lo explica', () => {
  const m = maquina({ precios: false, escaneo: false });
  const d = ver(m, 6000);
  assert.equal(d.length, 2, JSON.stringify(d));
  assert.equal(d[1].izq, 'SnetForever: sin precios todavía (abre la subasta o la app)');
  assert.equal(d[1].der, undefined, 'una línea sola');
  assert.deepEqual(d[1].colorIzq, m.lua('SnetForever.TooltipComercio.COLORES.gris'));
  m.lua('local A = SnetForever.Arbol; assert(A.poner("i:6000", A.crear("", "Telas")))');
  const con = ver(m, 6000);
  assert.ok(con.some((x) => x.izq === T_GENERAL), 'el grupo sí sale');
  assert.ok(!con.some((x) => String(x.izq).includes('Subasta')), JSON.stringify(con));
  assert.equal(con.filter((x) => String(x.izq).includes('sin precios')).length, 1, 'una sola vez');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(ver(m, 6000).at(-1).izq, 'SnetForever: no prices yet (open the auction house or the app)');
  sinErrores(m);
});

test('con la tabla de precios cargada, un objeto que no está en ella no lleva la línea gris', () => {
  const m = maquina({ escaneo: false });
  assert.deepEqual(ver(m, 6000).map((x) => x.izq), ['Sin datos']);
  sinErrores(m);
});

test('solo con el escaneo en vivo (sin la app) la sección sale con lo que hay y sin valor de mercado ni tasas', () => {
  const m = maquina({ precios: false });
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'A la venta').der), '20 unidades (escaneo, leído hace 10 min)');
  assert.equal(sinColores(linea(d, 'Compra mínima').der), '4g 50s 00c');
  for (const e of ['Valor de mercado', SALEN, PARTE, SALEN_SUELTO, PARTE_SUELTO, NO_SON_VENTAS]) assert.ok(!linea(d, e), e);
  sinErrores(m);
});

// F5: «Salen sin caducar al día: 36846,0» contaba las cancelaciones como salidas y salía con «,0».
test('F5: en una mercancía, «Salidas locales/día (ventas y retiradas, aprox.)» sale entero y con separador, sin aviso', () => {
  const m = maquina({ escaneo: false });
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, SALEN).der), 'hasta 2.054');
  assert.equal(sinColores(linea(d, PARTE).der), '42 %');
  for (const e of [SALEN_SUELTO, PARTE_SUELTO, NO_SON_VENTAS]) assert.ok(!linea(d, e), `${e}: ${JSON.stringify(d)}`);
  sinErrores(m);
});

test('F5: en un objeto suelto, «Salen antes de tiempo al día (vendidas o retiradas)», entero, con el aviso gris de que no son ventas debajo', () => {
  const m = maquina({ escaneo: false });
  const d = ver(m, 5000);
  const i = d.findIndex((x) => sinColores(x.izq) === SALEN_SUELTO);
  assert.ok(i > 0, JSON.stringify(d));
  assert.equal(sinColores(d[i].der), '85');
  assert.equal(sinColores(d[i + 1].izq), NO_SON_VENTAS, 'el aviso, justo debajo');
  assert.equal(d[i + 1].der, undefined, 'una línea sola');
  assert.deepEqual(d[i + 1].colorIzq, [0.8, 0.8, 0.8]);
  assert.equal(sinColores(d[i + 2].izq), PARTE_SUELTO);
  assert.equal(sinColores(d[i + 2].der), '42 %');
  for (const e of [SALEN, PARTE]) assert.ok(!linea(d, e), `${e}: ${JSON.stringify(d)}`);
  sinErrores(m);
});

test('F5: en inglés, el separador es la coma y los nombres, los suyos', () => {
  const m = maquina({ escaneo: false });
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'Local departures/day (sales and removals, est.)').der), 'up to 2,054');
  assert.ok(linea(d, 'Share that leaves (sold or pulled, approx.)'), JSON.stringify(d));
  const s = ver(m, 5000);
  assert.equal(sinColores(linea(s, 'Leave early per day (sold or pulled)').der), '85');
  assert.ok(linea(s, 'Not sales: also counts what owners pull'), JSON.stringify(s));
  assert.ok(linea(s, 'Share that leaves early (sold or pulled)'), JSON.stringify(s));
  sinErrores(m);
});

test('una mercancía aprobada dice rotación sin confirmar en el tooltip; un objeto suelto no', () => {
  const m = maquina({ escaneo: false });
  m.lua(GRUPO_LINO);
  m.lua(`local A = SnetForever.Arbol; local r = A.crear("", "Sueltos"); assert(A.poner("i:5000", r))
    assert(SnetForever.Reglas.poner("propio:" .. r, {compraPct = 85}))`);
  listaImitada(m, 2589, 45000, 20, 600);
  const d = ver(m, 2589);
  const v = d.find((x) => reglaDice(x) === SIN_CONFIRMAR);
  assert.ok(v, JSON.stringify(d));
  assert.equal(sinColores(v.izq), `${SIN_CONFIRMAR} (a 4g 50s 00c)`);
  assert.deepEqual(v.colorIzq, m.lua('SnetForever.TooltipComercio.COLORES.amarillo'), 'ni verde de aprobado ni rojo');
  assert.ok(!d.some((x) => reglaDice(x) === 'Buena compra según tu regla'), JSON.stringify(d));
  // El objeto suelto (sin el dato de mercancía en su fila) sigue como hoy.
  const s = ver(m, 5000);
  const b = s.find((x) => reglaDice(x) === 'Buena compra según tu regla');
  assert.ok(b, JSON.stringify(s));
  assert.deepEqual(b.colorIzq, m.lua('SnetForever.TooltipComercio.COLORES.verde'));
  assert.ok(!s.some((x) => reglaDice(x) === SIN_CONFIRMAR), JSON.stringify(s));
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const e = ver(m, 2589);
  assert.ok(e.some((x) => sinColores(x.izq).startsWith(`${SIN_CONFIRMAR_EN} (at `)), JSON.stringify(e));
  sinErrores(m);
});

test('en una mercancía el tooltip dice hasta N, con separador de miles; en un objeto suelto, el número solo', () => {
  const m = maquina({ escaneo: false });
  assert.equal(sinColores(linea(ver(m, 2589), SALEN).der), 'hasta 2.054');
  assert.equal(sinColores(linea(ver(m, 5000), SALEN_SUELTO).der), '85');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(sinColores(linea(ver(m, 2589), 'Local departures/day (sales and removals, est.)').der), 'up to 2,054');
  assert.equal(sinColores(linea(ver(m, 5000), 'Leave early per day (sold or pulled)').der), '85');
  sinErrores(m);
});

test('menos de media unidad no dice hasta 0', () => {
  const m = maquina({ escaneo: false });
  const salen = (item, valor, etiqueta) => {
    m.lua(`SNF_PRECIOS.casas[114][${item}][6] = ${valor}`);
    return sinColores(linea(ver(m, item), etiqueta).der);
  };
  assert.equal(salen(2589, 0.4, SALEN), 'menos de 1');
  assert.equal(salen(2589, 0.5, SALEN), 'hasta 1');
  assert.equal(salen(2589, 0, SALEN), '0', 'no ha salido nada: no es un tope');
  assert.equal(salen(5000, 0.4, SALEN_SUELTO), '0', 'un objeto suelto sigue como hoy');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(salen(2589, 0.4, 'Local departures/day (sales and removals, est.)'), 'less than 1');
  sinErrores(m);
});

test('lo que sale de la subasta, si no se sabe, no sale: ni las unidades al día ni la parte', () => {
  const m = maquina({ escaneo: false });
  const d = ver(m, 5002);
  assert.ok(linea(d, 'Compra mínima') && linea(d, 'Valor de mercado'));
  for (const e of [SALEN, PARTE, SALEN_SUELTO, PARTE_SUELTO, NO_SON_VENTAS]) assert.ok(!linea(d, e), `${e}: ${JSON.stringify(d)}`);
  sinErrores(m);
});

test('la regla que no se cumple sale en rojo y entonces no hay «buena compra»', () => {
  const m = maquina({ escaneo: false });
  m.lua('local A = SnetForever.Arbol; local r = A.crear("", "Caros"); assert(A.poner("i:5001", r)); assert(SnetForever.Reglas.poner("propio:" .. r, {compraPct = 85}))');
  const d = ver(m, 5001);
  const no = d.find((x) => reglaDice(x) === 'No cumple tu regla');
  assert.ok(no, JSON.stringify(d));
  assert.equal(sinColores(no.izq), 'No cumple tu regla (a 12g 00s 00c)');
  assert.deepEqual(no.colorIzq, m.lua('SnetForever.TooltipComercio.COLORES.rojo'));
  assert.ok(!d.some(aprobada));
  sinErrores(m);
});

test('ningún texto añadido contiene «foto» (ni en español ni en inglés)', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    for (const id of [2589, 5000, 5001, 5002]) {
      for (const x of nuestras(ver(m, id))) {
        assert.ok(!/foto|photo|snapshot/i.test(`${x.izq} ${x.der ?? ''}`), `${idioma} ${id}: ${x.izq} ${x.der}`);
      }
    }
  }
  const en = ver(m, 2589).map((x) => `${x.izq} ${x.der ?? ''}`).join('\n');
  assert.match(en, /SnetForever · Auction/);
  sinErrores(m);
});

test('dos llamadas al enganche para el mismo objeto dan una sola copia de cada sección (con TooltipDataProcessor)', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  ver(m, 2589);
  m.lua('for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do f(GameTooltip, {id = 2589, type = Enum.TooltipDataType.Item}) end');
  const d = m.detalleTooltip();
  assert.equal(d.filter((x) => x.izq === T_GENERAL).length, 1);
  assert.equal(d.filter((x) => x.izq === 'SnetForever · Subasta').length, 1);
  assert.equal(d.filter((x) => x.izq === 'Compra mínima').length, 1);
  // Al limpiarse, o al cambiar de objeto, vuelven a salir (una vez).
  m.lua('GameTooltip:ClearLines()');
  assert.equal(m.detalleTooltip().length, 0);
  assert.equal(ver(m, 2589).filter((x) => x.izq === 'SnetForever · Subasta').length, 1);
  assert.equal(ver(m, 5000).filter((x) => x.izq === 'SnetForever · Subasta').length, 1);
  assert.equal(linea(ver(m, 5000), 'Compra mínima').der.includes('4g'), true);
  sinErrores(m);
});

test('sin TooltipDataProcessor engancha OnTooltipSetItem (y OnTooltipCleared), una vez, y sin repetidas', () => {
  const m = maquina({ sinApi: ['TooltipDataProcessor'] });
  m.lua(GRUPO_LINO);
  assert.equal(m.llamadas('TooltipDataProcessor.AddTooltipPostCall').length, 0);
  ver(m, 2589);
  m.lua('GameTooltip:GetScript("OnTooltipSetItem")(GameTooltip)');
  const d = m.detalleTooltip();
  assert.equal(d.filter((x) => x.izq === 'SnetForever · Subasta').length, 1);
  assert.equal(linea(d, 'Grupo').der, 'Paños › Lino');
  m.lua('GameTooltip:ClearLines()');
  assert.equal(ver(m, 2589).filter((x) => x.izq === T_GENERAL).length, 1);
  sinErrores(m);
});

test('el enganche se instala una sola vez y no sustituye nada de otros addons', () => {
  const m = maquina();
  assert.equal(m.llamadas('TooltipDataProcessor.AddTooltipPostCall').length, 2, 'las marcas del núcleo y el tooltip del comercio');
  m.lua('rawset(_G, "AJENO", {}); local f = function(t) AJENO[#AJENO + 1] = t:GetName() end; TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, f)');
  ver(m, 2589);
  assert.deepEqual(m.lua('AJENO'), ['GameTooltip'], 'el de otro addon sigue llamándose');
  sinErrores(m);
});

test('sale también en ItemRefTooltip, el de los enlaces del chat, sin tocar GameTooltip', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  const d = ver(m, 2589, 'ItemRefTooltip');
  assert.ok(d.some((x) => x.izq === 'SnetForever · Subasta'), JSON.stringify(d));
  assert.equal(m.detalleTooltip().length, 0, 'GameTooltip no se ha tocado');
  const n = maquina({ sinApi: ['TooltipDataProcessor'] });
  n.lua(GRUPO_LINO);
  assert.equal(linea(ver(n, 2589, 'ItemRefTooltip'), 'Grupo').der, 'Paños › Lino', 'también con el respaldo de OnTooltipSetItem');
  sinErrores(m);
  sinErrores(n);
});

test('con el ajuste apagado no se añade nada; /snet comercio tooltip lo enciende y lo apaga y lo dice en el chat', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  assert.ok(ver(m, 2589).length > 3, 'por defecto está encendido');
  assert.equal(m.lua('SnetForever.TooltipComercio.activo()'), true);
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.tooltip = false');
  assert.equal(ver(m, 2589).length, 1, 'apagado: solo lo del juego');
  m.lua('SlashCmdList.SNET("comercio tooltip")');
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltip'), true);
  assert.ok(impresos(m).at(-1).includes(texto(m, 'COMERCIO_TT_ENCENDIDO')), impresos(m).at(-1));
  assert.ok(ver(m, 2589).length > 3);
  m.lua('SlashCmdList.SNET("comercio tooltip")');
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltip'), false);
  assert.ok(impresos(m).at(-1).includes(texto(m, 'COMERCIO_TT_APAGADO')), impresos(m).at(-1));
  assert.equal(ver(m, 2589).length, 1);
  assert.equal(m.lua('SnetForever.TooltipComercio.activo()'), false);
  sinErrores(m);
});

// T1b: el precio de venta al vendedor sale siempre que el objeto se venda, aunque el juego ya lo pinte (como hace TSM): es
// una línea más del apartado, con su ajuste para apagarla. Antes no salía si el juego lo traía, y en el juego no salía nunca.
for (const [titulo, sinApi] of [['con TooltipDataProcessor', undefined], ['sin TooltipDataProcessor', ['TooltipDataProcessor']]]) {
  test(`el precio de venta al vendedor ${titulo}: sale si el objeto se vende, también cuando el juego ya lo pinta`, () => {
    const m = maquina({ escaneo: false, sinApi });
    const etiqueta = 'Precio de venta al vendedor';
    assert.equal(texto(m, 'COMERCIO_TT_PRECIO_VENTA'), etiqueta);
    m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250 });
    const sin = ver(m, 2589);
    assert.equal(sinColores(linea(sin, etiqueta).der), '2s 50c');
    assert.ok(sin.findIndex((x) => x.izq === etiqueta) < sin.findIndex((x) => x.izq === 'SnetForever · Subasta'), 'va en la información general');
    m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250, precioEnTooltip: true });
    assert.equal(sinColores(linea(ver(m, 2589), etiqueta).der), '2s 50c', 'aunque el juego ya lo pinte');
    m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 0 });
    assert.ok(!linea(ver(m, 2589), etiqueta), 'un objeto que no se vende no lleva precio de venta');
    sinErrores(m);
  });
}

test('con el GameTooltip prohibido no se toca', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  m.lua('BANCO.tooltipProhibido = true');
  assert.equal(ver(m, 2589).length, 1);
  sinErrores(m);
});

test('nuestra lista: pasar el ratón por una fila enseña el tooltip del objeto con nuestras secciones, sin el tooltip suelto', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(0.05);
  m.lua('SnetForever.emitir("SNF_COMERCIO_ESCANEO", 1, 1)');
  // La lista a la vista: la luz no se enciende en una fila escondida (T1a, ronda 2), y en el juego no se puede pasar el
  // ratón por una fila que no se ve.
  m.lua('SnetForever.UIComercio.elegirPestana("ofertas")');
  const F = 'SnetForever.UIComercio.marco().filas[1]';
  m.lua(`${F}:GetScript("OnEnter")(${F})`);
  assert.equal(m.lua('GameTooltip:IsShown()'), true);
  assert.equal(m.lua(`GameTooltip:GetOwner() == ${F}`), true);
  const d = m.detalleTooltip();
  assert.equal(d[0].izq, 'Paño de lino', 'el tooltip del objeto del juego');
  assert.equal(m.lua('select(1, GameTooltip:GetItem())'), 'Paño de lino');
  assert.ok(d.some((x) => x.izq === 'SnetForever · Subasta') && d.some((x) => x.izq === T_GENERAL), JSON.stringify(d));
  const todo = d.map((x) => `${x.izq} ${x.der ?? ''}`).join('\n');
  for (const viejo of ['Ahora:', 'Lo normal', 'Tienes', 'Otras casas', 'Ritmo de venta', 'Mínimo de la']) assert.ok(!todo.includes(viejo), `${viejo}: ${todo}`);
  m.lua(`${F}:GetScript("OnLeave")(${F})`);
  m.avanzar(0.3); // el tooltip va con la luz: se esconde cuando se apaga, con el ratón 0,2 s fuera (T1a, ronda 1)
  assert.equal(m.lua('GameTooltip:IsShown()'), false);
  sinErrores(m);
});

test('el código ya no trae la ventanita suelta ni sus textos', () => {
  const ui = readFileSync(join(RAIZ, 'addons', 'SnetForever_Comercio', 'ui', 'comercio.lua'), 'utf8');
  assert.ok(!/llenarVentanita|COMERCIO_TT_/.test(ui), 'comercio.lua sin la ventanita suelta');
  for (const idioma of ['es', 'en']) {
    const t = readFileSync(join(RAIZ, 'addons', 'SnetForever', 'textos', `${idioma}.lua`), 'utf8');
    for (const vieja of ['TT_AHORA', 'TT_EN_VENTA', 'TT_NORMAL', 'TT_MINIMO', 'TT_SUBASTAS', 'TT_RITMO', 'TT_POCO', 'TT_GRUPOS', 'TT_TIENES', 'TT_OTRAS']) {
      assert.ok(!t.includes(`COMERCIO_${vieja}`), `${idioma}: ${vieja}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// Ronda de arreglos 1
// ---------------------------------------------------------------------------------------------------

const cargasDePrecios = (m) => m.llamadas('C_AddOns.LoadAddOn').filter((a) => String(a[0]).startsWith('SnetForever_P'));
const SUBASTA_ABIERTA = (m) => { m.disparar('AUCTION_HOUSE_SHOW'); m.avanzar(0.05); };

test('A: con la subasta sin abrir, el primer tooltip carga los precios (solo consulta) y enseña la sección Subasta', () => {
  const m = maquina({ cargar: false, escaneo: false });
  assert.equal(m.lua('rawget(_G, "SNF_PRECIOS")'), undefined, 'nada cargado al entrar');
  assert.equal(m.lua('SnetForever.Comercio.abierta()'), false);
  const d = ver(m, 2589);
  // Carga la foto de la hora anterior (la de la hora actual se deja libre para la subasta): 9g, 300 unidades, hace 1 h.
  assert.equal(sinColores(linea(d, 'Compra mínima').der), '9g 00s 00c');
  assert.equal(sinColores(linea(d, 'A la venta').der), '300 unidades (app, hace 1 h)', 'una fila de 7 números, como las de antes de T1b');
  assert.equal(sinColores(linea(d, 'Valor de mercado').der), '9g 50s 00c', 'la casa se calcula sin la subasta abierta');
  assert.equal(cargasDePrecios(m).length, 1, 'se carga una sola vez');
  ver(m, 2589);
  ver(m, 5000);
  assert.equal(cargasDePrecios(m).length, 1, 'y no se vuelve a cargar con más tooltips');
  // Sin despertar nada más del comercio: ni ventana ni subasta abierta.
  assert.equal(m.lua('SnetForever.UIComercio.marco()'), undefined);
  assert.equal(m.lua('SnetForever.Comercio.abierta()'), false);
  sinErrores(m);
});

test('A: después de la consulta, alAbrir funciona igual que antes: la ranura de la hora actual sigue libre', () => {
  const m = maquina({ cargar: false, escaneo: false });
  ver(m, 2589);
  // El cliente solo ejecuta cada addon una vez por sesión: la ranura de la hora anterior ya está gastada (el banco lo imita), la
  // de la hora actual sigue libre. Por eso la consulta la apunta como cargada, y alAbrir no la vuelve a intentar.
  const gastada = (i) => m.lua(`BANCO.addonsCargados["SnetForever_P0${i}"] == true`);
  assert.equal(gastada(ranuraDeHora(H - 1)), true, 'la de la hora anterior está gastada en el cliente');
  assert.equal(gastada(ranuraDeHora(H)), false, 'la de la hora actual sigue libre');
  assert.equal(m.lua('SnetForever.Precios.agotadas()'), false, 'a las hh:40 aún falta la de la hora actual');
  assert.equal(m.lua('SnetForever.Precios.hayQueRecargar()'), false);
  SUBASTA_ABIERTA(m);
  assert.equal(m.lua('SnetForever.Precios.hayQueRecargar()'), false);
  assert.equal(m.lua('SnetForever.Precios.edad()'), 1043, 'alAbrir cargó la foto de esta hora (hecha hace 17 min)');
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'Compra mínima').der), '9g 80s 00c', 'la foto nueva de esta hora, no la de antes');
  assert.equal(sinColores(linea(d, 'A la venta').der), '400 unidades, 37 subastas (app, hace 17 min)');
  sinErrores(m);
});

test('A: en combate no se carga; fuera de combate se carga en el siguiente tooltip', () => {
  const m = maquina({ cargar: false, escaneo: false });
  m.jugador({ enCombate: true });
  const d = ver(m, 2589);
  assert.equal(cargasDePrecios(m).length, 0, 'en combate no se carga nada');
  assert.equal(m.lua('rawget(_G, "SNF_PRECIOS")'), undefined);
  assert.equal(d.at(-1).izq, 'SnetForever: sin precios todavía (abre la subasta o la app)');
  ver(m, 2589);
  assert.equal(cargasDePrecios(m).length, 0);
  m.jugador({ enCombate: false });
  const fuera = ver(m, 2589);
  assert.equal(cargasDePrecios(m).length, 1);
  assert.equal(sinColores(linea(fuera, 'Compra mínima').der), '9g 00s 00c');
  assert.ok(!fuera.some((x) => String(x.izq).includes('sin precios')));
  sinErrores(m);
});

test('A: si la app no ha dejado precios, la consulta no se repite en cada tooltip ni da error', () => {
  const m = maquina({ precios: false, escaneo: false });
  ver(m, 2589);
  ver(m, 2589);
  ver(m, 5000);
  assert.equal(cargasDePrecios(m).length, 1, 'se intentó una sola vez');
  sinErrores(m);
});

test('2: sin valor normal o sin ritmo no sale ninguna línea de regla (ni «No cumple tu regla»)', () => {
  const m = maquina({ escaneo: false });
  m.lua(`local A, R = SnetForever.Arbol, SnetForever.Reglas
    for _, id in ipairs({5002, 5003, 5001}) do
      local r = A.crear("", "G" .. id)
      assert(A.poner("i:" .. id, r))
      assert(R.poner("propio:" .. r, {compraPct = 85}))
    end`);
  for (const id of [5002, 5003]) {
    const d = ver(m, id);
    assert.ok(linea(d, 'Compra mínima'), `${id}: la sección sale`);
    assert.ok(!d.some((x) => reglaDice(x) === 'No cumple tu regla' || aprobada(x)), `${id}: ${JSON.stringify(d)}`);
  }
  assert.ok(ver(m, 5001).some((x) => reglaDice(x) === 'No cumple tu regla'), 'con todos los datos y precio caro, sí');
  sinErrores(m);
});

test('3: con las marcas del núcleo, una marca puesta y un grupo con precios: sale la marca y después nuestras dos secciones', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  m.lua('SnetForever.Marcas.poner({vender = {2589}})');
  const vender = texto(m, 'MARCA_VENDER');
  const d = ver(m, 2589);
  const iMarca = d.findIndex((x) => String(x.izq).includes(vender));
  const t1 = d.findIndex((x) => x.izq === T_GENERAL);
  const t2 = d.findIndex((x) => x.izq === 'SnetForever · Subasta');
  assert.ok(iMarca > 0, JSON.stringify(d));
  assert.ok(t1 > iMarca && t2 > t1, `la marca va antes: ${iMarca} ${t1} ${t2}`);
  assert.equal(d.filter((x) => String(x.izq).includes(vender)).length, 1);
  sinErrores(m);
});

test('4: un error dentro del tooltip con la subasta abierta no apaga el comercio ni para el escaneo; solo se apunta', () => {
  const m = maquina();
  m.lua(GRUPO_LINO); // T1b: la regla solo se mira si el objeto está en un grupo
  SUBASTA_ABIERTA(m);
  m.lua('PARADO = false; SnetForever.Escaneo.parar = function() PARADO = true end');
  m.lua('SnetForever.Guardado.preparar(); FALLOS_ANTES = #SnetForeverCuenta.fallos');
  m.lua('SnetForever.Reglas.buenaCompra = function() error("fallo de prueba") end');
  const d = ver(m, 2589);
  assert.equal(d[0].izq, 'Paño de lino', 'lo del juego sigue');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true, 'el comercio sigue en marcha');
  assert.equal(m.lua('PARADO'), false, 'el escaneo no se ha parado');
  assert.ok(!impresos(m).some((l) => l.includes(texto(m, 'COMERCIO_FALLO'))), 'sin aviso de comercio apagado');
  assert.equal(m.lua('#SnetForeverCuenta.fallos'), m.lua('FALLOS_ANTES') + 1, 'el fallo queda apuntado');
  assert.match(m.lua('SnetForeverCuenta.fallos[#SnetForeverCuenta.fallos].texto'), /^tooltip: .*fallo de prueba/);
  sinErrores(m);
});

test('5: solo en GameTooltip e ItemRefTooltip: no sale en tooltips de comparar ni de otros addons', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  m.lua(`OTRO = 0
    local otro = {AddLine = function() OTRO = OTRO + 1 end, AddDoubleLine = function() OTRO = OTRO + 1 end,
      NumLines = function() return 0 end, IsForbidden = function() return false end, GetName = function() return "ShoppingTooltip1" end}
    for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do f(otro, {id = 2589, lines = {}}) end`);
  assert.equal(m.lua('OTRO'), 0, 'ni una línea en un tooltip ajeno');
  assert.ok(ver(m, 2589, 'ItemRefTooltip').some((x) => x.izq === 'SnetForever · Subasta'), 'ItemRefTooltip sí');
  assert.ok(ver(m, 2589).some((x) => x.izq === 'SnetForever · Subasta'), 'GameTooltip sí');
  sinErrores(m);
});

test('6: si se rehace el tooltip del mismo objeto con las mismas líneas o más, nuestras secciones vuelven a salir', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  ver(m, 2589);
  const antes = m.detalleTooltip().length;
  // El juego rehace el tooltip (ClearLines lanza OnTooltipCleared) y lo llena con más líneas que antes.
  m.lua(`GameTooltip:ClearLines()
    for i = 1, ${antes + 10} do GameTooltip:AddLine("línea del juego " .. i) end
    for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do f(GameTooltip, {id = 2589, lines = {}}) end`);
  const d = m.detalleTooltip();
  assert.equal(d.filter((x) => x.izq === 'SnetForever · Subasta').length, 1, 'vuelven a salir, una vez');
  assert.equal(d.filter((x) => x.izq === T_GENERAL).length, 1);
  // Con menos líneas que antes también.
  m.lua(`GameTooltip:ClearLines()
    for i = 1, 3 do GameTooltip:AddLine("línea " .. i) end
    for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do f(GameTooltip, {id = 2589, lines = {}}) end`);
  assert.equal(m.detalleTooltip().filter((x) => x.izq === 'SnetForever · Subasta').length, 1);
  sinErrores(m);
});

test('8: singular: «1 unidad» y «1 unit»', () => {
  const m = maquina({ escaneo: false });
  listaImitada(m, 2589, 45000, 1, 600);
  assert.equal(sinColores(linea(ver(m, 2589), 'A la venta').der), '1 unidad (subasta, hace 10 min)');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(sinColores(linea(ver(m, 2589), 'On sale').der), `1 unit (auction house, ${texto(m, 'COMERCIO_HACE_MIN', 10)})`);
  sinErrores(m);
});

test('9: tooltip = true está en la plantilla de los ajustes del comercio de la cuenta', () => {
  const m = maquina({ escaneo: false });
  m.lua('SnetForeverCuenta.comercio.tooltip = nil; SnetForever.Guardado.preparar()');
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltip'), true);
  const fuente = readFileSync(join(RAIZ, 'addons', 'SnetForever', 'nucleo', 'guardado.lua'), 'utf8');
  assert.match(fuente.slice(fuente.indexOf('PLANTILLA_CUENTA = {'), fuente.indexOf('local PLANTILLA_PJ')), /tooltip = true/);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda de arreglos 2
// ---------------------------------------------------------------------------------------------------

const avisosDeRecarga = (m) => impresos(m).filter((t) => /reload/i.test(t));

// Con la app parada (fotos de hace 8 y 9 horas en las ranuras), consultar y luego abrir la subasta no saca el aviso falso de
// /reload (al recargar saldría la misma foto), ni a las hh:20 ni a las hh:40, y deja las mismas fotos que sin la consulta.
for (const minuto of [20, 40]) {
  test(`R2: fotos viejas, minuto ${minuto}: tooltip primero y alAbrir después, sin aviso falso de /reload`, () => {
    const sin = maquina({ precios: true, escaneo: false, cargar: false, minuto, viejas: true });
    sin.lua('SnetForever.Precios.alAbrir()');
    const con = maquina({ precios: true, escaneo: false, cargar: false, minuto, viejas: true });
    ver(con, 2589); // la consulta
    assert.equal(con.lua('SnetForever.Precios.edad() ~= nil'), true, 'la consulta cargó una foto vieja');
    con.lua('SnetForever.Precios.alAbrir()');
    // Sin consulta previa, igual que antes (sin aviso) y con ella lo mismo.
    assert.equal(sin.lua('SnetForever.Precios.hayQueRecargar()'), false);
    assert.equal(con.lua('SnetForever.Precios.hayQueRecargar()'), false, 'sin aviso falso');
    assert.deepEqual(avisosDeRecarga(sin), []);
    assert.deepEqual(avisosDeRecarga(con), []);
    assert.equal(con.lua('SnetForever.Precios.edad()'), sin.lua('SnetForever.Precios.edad()'), 'da por buena esa foto');
    sinErrores(sin);
    sinErrores(con);
  });
}

test('R2: la consulta apunta la ranura que gastó: a las hh:20 las ranuras candidatas ya están agotadas', () => {
  const m = maquina({ cargar: false, escaneo: false, minuto: 20 });
  assert.equal(m.lua('SnetForever.Precios.agotadas()'), false);
  ver(m, 2589);
  assert.equal(m.lua('SnetForever.Precios.agotadas()'), true, 'antes de las hh:35 solo cuenta la de la hora anterior');
  const antes = m.llamadas('C_AddOns.LoadAddOn').filter((a) => String(a[0]).startsWith('SnetForever_P')).length;
  m.lua('SnetForever.Precios.alAbrir()');
  assert.equal(m.llamadas('C_AddOns.LoadAddOn').filter((a) => String(a[0]).startsWith('SnetForever_P')).length, antes, 'alAbrir no vuelve a intentar esa ranura');
  sinErrores(m);
});

test('R2: sin consulta previa alAbrir no cambia: a las hh:40 con la foto de esta hora, sin aviso y con esa foto', () => {
  const m = maquina({ cargar: false, escaneo: false });
  m.lua('SnetForever.Precios.alAbrir()');
  assert.equal(m.lua('SnetForever.Precios.hayQueRecargar()'), false);
  assert.equal(m.lua('SnetForever.Precios.edad()'), 1043);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Ronda de arreglos 3: la marca de la consulta caduca
// ---------------------------------------------------------------------------------------------------

// Las ranuras dan la vuelta cada 8 horas. La consulta apunta la HORA que leyó, no la ranura: esa ranura solo cuenta como
// «gastada por la consulta, no avisar» en la hora de la consulta; después todo es igual que sin ella.
function maquinaVuelta({ viejas = false, incompleta = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-vuelta-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir, ranuraDeHora(H), casas(), foto(H - 8));
  ponerRanura(dir, ranuraDeHora(H - 1), casasAntes(), viejas ? foto(H - 9) : foto(H - 1));
  for (let k = 1; k <= 6; k++) ponerRanura(dir, ranuraDeHora(H + k), casas(), foto(H + k - 8));
  if (incompleta) {
    writeFileSync(join(dir, nombre(ranuraDeHora(H - 1)), 'p2.lua'), 'local P = SNF_PRECIOS; if not (P and P.seq == 1) then return end\n');
  }
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde', idioma: 'esES' } });
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  return { m, dir };
}
function irA(m, h, minuto) {
  const ahora = m.lua('GetServerTime()');
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((h * 3600 + minuto * 60 - ahora) * 20)}`);
}
// Abre la subasta en cada (hora, minuto) del plan y devuelve lo que decide cada apertura. `antes(h, minuto)` prepara la hora.
function recorrer({ consulta, viejas, plan, antes = () => {} }) {
  const { m, dir } = maquinaVuelta({ viejas });
  const decisiones = [];
  plan.forEach(([h, minuto], i) => {
    antes({ dir, h, minuto });
    irA(m, h, minuto);
    if (consulta && i === 0) ver(m, 2589); // la consulta, antes de la primera apertura
    m.lua('SnetForever.Precios.alAbrir()');
    decisiones.push({ recargar: m.lua('SnetForever.Precios.hayQueRecargar()'), edad: m.lua('SnetForever.Precios.edad()') });
  });
  sinErrores(m);
  return decisiones;
}

test('R3: con la app escribiendo cada hora, la vuelta de 8 horas: a las H+7:40 sale el aviso verdadero, igual que sin consulta', () => {
  const plan = [[H, 20], [H + 6, 40], [H + 7, 40], [H + 8, 20]];
  // La app escribe la foto de la hora cuando llega a ella: H+6 antes de abrir a H+6:40, y H+7 (en la ranura de la hora H-1,
  // la que gastó la consulta o la primera apertura) antes de abrir a H+7:40.
  const antes = ({ dir, h }) => {
    if (h === H + 6) ponerRanura(dir, ranuraDeHora(H + 6), casas(), foto(H + 6));
    if (h === H + 7) ponerRanura(dir, ranuraDeHora(H + 7), casas(), foto(H + 7));
  };
  const sin = recorrer({ consulta: false, viejas: false, plan, antes });
  const con = recorrer({ consulta: true, viejas: false, plan, antes });
  assert.deepEqual(con, sin, 'con la consulta, lo mismo que sin ella en cada apertura');
  assert.equal(sin[2].recargar, true, 'a las H+7:40 la foto nueva fue a una ranura ya gastada: hace falta /reload');
  assert.equal(con[2].recargar, true);
});

test('R3: con la app parada, consulta y apertura a las H:40 y otra a las H+1:40: el aviso (b) sale igual que sin consulta', () => {
  const plan = [[H, 40], [H + 1, 40]];
  const sin = recorrer({ consulta: false, viejas: true, plan });
  const con = recorrer({ consulta: true, viejas: true, plan });
  assert.deepEqual(con, sin);
  assert.equal(con[0].recargar, false, 'la primera apertura tras la consulta no avisa (recargar traería la misma foto)');
  assert.equal(con[1].recargar, sin[1].recargar, 'la segunda, igual que sin consulta');
  assert.equal(con[1].recargar, true, 'precios de hace más de 2 horas y ninguna candidata sirve: aviso (b)');
});

test('R3: si alAbrir ya gastó esa ranura, la consulta no la vuelve a cargar ni la apunta como suya', () => {
  const { m } = maquinaVuelta({ incompleta: true });
  irA(m, H, 20);
  m.lua('SnetForever.Precios.alAbrir()'); // gasta la ranura de la hora anterior; su foto no es válida
  assert.equal(m.lua('SnetForever.Precios.edad()'), undefined, 'sin precios válidos');
  const antes = cargasDePrecios(m).length;
  const d = ver(m, 2589);
  assert.equal(cargasDePrecios(m).length, antes, 'la consulta no vuelve a pedir esa ranura');
  assert.equal(d.at(-1).izq, 'SnetForever: sin precios todavía (abre la subasta o la app)');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T1b: el inventario, ItemID e IconID, lo que no tenemos y un ajuste por línea
// ---------------------------------------------------------------------------------------------------

// El inventario guardado de la cuenta: «Zula» (maga) es el personaje del banco; «Brok» (guerrero) es otro personaje propio
// del mismo reino; «Lejana» es de otro reino y no cuenta.
const INVENTARIO = `SnetForever.Guardado.preparar()
  local yo = UnitName("player") .. "-" .. GetRealmName()
  SnetForeverCuenta.comercio.inventario = {v = 1, pj = {
    [yo] = {nombre = UnitName("player"), reino = GetRealmName(), clase = "MAGE", bolsas = {[2589] = 5}, banco = {[2589] = 12}},
    ["Brok-Normal"] = {nombre = "Brok", reino = "Normal", clase = "WARRIOR", bolsas = {[2589] = 3, [5000] = 1}},
    ["Lejana-Otro"] = {nombre = "Lejana", reino = "Otro", clase = "PRIEST", bolsas = {[2589] = 40}},
  }}
  SnetForever.InventarioCuenta.olvidarOrden()
  BANCO.ponerObjeto(2589, 5)`; // lo que el personaje de ahora lleva encima se pregunta al juego (GetItemCount)

test('inventario: el total y, debajo, cada personaje propio con su desglose y su nombre en el color de su clase', () => {
  const m = maquina({ escaneo: false });
  m.lua(INVENTARIO);
  const d = ver(m, 2589);
  const i = d.findIndex((x) => x.izq === 'Inventario');
  assert.ok(i > d.findIndex((x) => x.izq === T_GENERAL) && i < d.findIndex((x) => x.izq === 'SnetForever · Subasta'), JSON.stringify(d));
  assert.equal(d[i].der, '20 en bolsas y banco', 'dice lo que cuenta de verdad (no «en total»); lo de otro reino no se suma');
  const yo = m.lua('UnitName("player")');
  assert.deepEqual([d[i + 1].izq, d[i + 1].der], [`  ${yo}`, '17 (5 Bolsas, 12 Banco)'], 'primero el personaje con el que se juega');
  assert.deepEqual([d[i + 2].izq, d[i + 2].der], ['  Brok', '3 (3 Bolsas, banco sin ver)'], 'el banco de Brok no se ha visto: se dice, no se da a entender que tiene 0');
  assert.ok(!/en total|total/i.test(JSON.stringify(d.slice(i, i + 3))), 'nunca un total que no lo es');
  const color = (clase) => m.lua(`local c = RAID_CLASS_COLORS.${clase}; return {c.r, c.g, c.b}`);
  assert.deepEqual(d[i + 1].colorIzq, color('MAGE'));
  assert.deepEqual(d[i + 2].colorIzq, color('WARRIOR'));
  assert.ok(!d.some((x) => String(x.izq).includes('Lejana')), 'un personaje de otro reino no sale');
  assert.ok(!JSON.stringify(d).includes('Casa de subastas') && !JSON.stringify(d).includes('Correo'), 'lo que no se cuenta no sale');
  // Un objeto que solo tiene otro personaje.
  const otro = ver(m, 5000);
  const j = otro.findIndex((x) => x.izq === 'Inventario');
  assert.equal(otro[j].der, '1 en bolsas y banco');
  assert.deepEqual([otro[j + 1].izq, otro[j + 1].der], ['  Brok', '1 (1 Bolsas, banco sin ver)']);
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const en = ver(m, 5000);
  const k = en.findIndex((x) => x.izq === 'Inventory');
  assert.deepEqual([en[k].der, en[k + 1].der], ['1 in bags and bank', '1 (1 Bags, bank not seen yet)']);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  // Sin ninguno, no sale el apartado del inventario.
  assert.ok(!linea(ver(m, 5001), 'Inventario'));
  sinErrores(m);
});

// F2 (fallo en el juego): el nombre con apellido y la frase de lo que no se cuenta. Nombres inventados.
const SIN_CONTAR = (d) => d.find((x) => /^(Sin contar|Not counted)/.test(sinColores(x.izq)));

test('la línea del inventario enseña el nombre con apellido', () => {
  const m = maquina({ escaneo: false });
  m.jugador({ nombre: 'Nombre', apellido: 'Apellido' });
  m.lua(`SnetForever.Guardado.preparar()
    SnetForeverCuenta.comercio.inventario = {v = 2, pj = {
      ["Otro Segundo-Normal"] = {nombre = "Otro Segundo", reino = "Normal", clase = "WARRIOR", bolsas = {[2589] = 3}},
    }}
    SnetForever.InventarioCuenta.olvidarOrden()
    BANCO.ponerObjeto(2589, 5)`);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const d = ver(m, 2589);
  const i = d.findIndex((x) => x.izq === 'Inventario');
  assert.deepEqual(d.slice(i + 1, i + 3).map((x) => x.izq), ['  Nombre Apellido', '  Otro Segundo'], JSON.stringify(d));
  assert.ok(!d.some((x) => sinColores(x.izq) === '  Nombre'), 'nunca solo la primera palabra');
  sinErrores(m);
});

test('el inventario dice lo que no cuenta: bancos y correos sin abrir y personajes con los que no se ha entrado', () => {
  const m = maquina({ escaneo: false });
  m.lua(INVENTARIO); // el de ahora con el banco visto; Brok sin banco; ninguno ha abierto el buzón
  const d = ver(m, 2589);
  const frase = SIN_CONTAR(d);
  assert.ok(frase, JSON.stringify(d));
  assert.equal(frase.izq, 'Sin contar: 1 banco, 2 buzones y los personajes sin entrar');
  assert.deepEqual(frase.colorIzq, [0.8, 0.8, 0.8], 'en gris');
  assert.equal(frase.der, undefined, 'una línea sola');
  // Va debajo del total y de las filas de los personajes, antes del apartado de la subasta.
  const i = d.findIndex((x) => x.izq === 'Inventario');
  assert.equal(d.indexOf(frase), i + 3, JSON.stringify(d));
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(SIN_CONTAR(ver(m, 2589)).izq, 'Not counted: 1 bank, 2 mailboxes and characters not logged in');
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  // Con el banco y los buzones vistos, solo queda lo que nunca se sabe: si hay personajes con los que no se ha entrado.
  // Lo de Brok viene de la importación de TSM: su fila lo dice, con la fecha.
  const hora = m.lua('GetServerTime() - 3 * 86400');
  m.lua(`local pj = SnetForeverCuenta.comercio.inventario.pj
    pj[UnitName("player") .. "-" .. GetRealmName()].correo = {}
    pj["Brok-Normal"].banco = {[2589] = 4}
    pj["Brok-Normal"].correo = {[2589] = 2}
    pj["Brok-Normal"].tsm = {banco = ${hora}, correo = ${hora}}`);
  const e = ver(m, 2589);
  assert.equal(SIN_CONTAR(e).izq, 'Sin contar: los personajes sin entrar');
  const j = e.findIndex((x) => x.izq === 'Inventario');
  assert.equal(e[j].der, '26 en bolsas, banco y correo', 'el correo entra en el total');
  const fecha = m.lua(`date("%d/%m", ${hora})`);
  assert.deepEqual([e[j + 2].izq, sinColores(e[j + 2].der)], ['  Brok', `9 (3 Bolsas, 4 Banco, 2 Correo; banco y correo de TSM, a ${fecha})`]);
  assert.equal(e[j + 1].der, '17 (5 Bolsas, 12 Banco)', 'lo nuestro, sin marca; un correo sin nada del objeto no sale en la fila');
  // Con el inventario simple también sale, debajo del total.
  m.lua(`${TT}.ponerLinea("inventarioSimple", true)`);
  const s = ver(m, 2589);
  const k = s.findIndex((x) => x.izq === 'Inventario');
  assert.equal(sinColores(s[k + 1].izq), 'Sin contar: los personajes sin entrar');
  sinErrores(m);
});

test('un alter con 0 encima y el banco sin abrir cuenta como banco sin abrir en la frase', () => {
  const m = maquina({ escaneo: false });
  m.lua(`SnetForever.Guardado.preparar()
    local yo = UnitName("player") .. "-" .. GetRealmName()
    SnetForeverCuenta.comercio.inventario = {v = 2, pj = {
      [yo] = {nombre = UnitName("player"), reino = GetRealmName(), clase = "MAGE", bolsas = {}, banco = {}, correo = {}},
      ["Alter Inventado-Normal"] = {nombre = "Alter Inventado", reino = "Normal", clase = "PRIEST", bolsas = {}, correo = {}},
    }}
    SnetForever.InventarioCuenta.olvidarOrden()
    BANCO.ponerObjeto(2589, 5)`);
  const d = ver(m, 2589);
  assert.ok(!d.some((x) => String(x.izq).includes('Alter')), 'no tiene ninguno: no sale en las filas');
  assert.equal(SIN_CONTAR(d).izq, 'Sin contar: 1 banco y los personajes sin entrar');
  sinErrores(m);
});

test('ItemID e IconID: apagados por defecto; encendidos salen al final', () => {
  const m = maquina({ escaneo: false });
  m.lua('BANCO.iconosItem[2589] = 132889'); // lo que da C_Item.GetItemIconByID
  const sin = ver(m, 2589);
  assert.ok(!linea(sin, 'ItemID') && !linea(sin, 'IconID'), JSON.stringify(sin));
  assert.equal(m.lua('SnetForever.TooltipComercio.linea("ids")'), false);
  assert.equal(m.lua('SnetForever.TooltipComercio.ponerLinea("ids", true)'), true);
  const con = ver(m, 2589);
  assert.deepEqual(con.slice(-2).map((x) => [x.izq, x.der]), [['ItemID', '2589'], ['IconID', '132889']]);
  // Un objeto sin ningún otro dato lleva también su número; si el juego no da el icono, el IconID no sale.
  assert.deepEqual(ver(m, 6000).slice(1).map((x) => [x.izq, x.der]), [['ItemID', '6000']]);
  sinErrores(m);
});

// Task 37: además de lo de T1b, ni otros reinos, ni valor reciente, ni destruir ni convertir, ni compra al vendedor: con
// TODAS las líneas que tienen datos encendidas (también una fuente propia), y tampoco como casilla en Tooltip.GRUPOS.
const NO_TENEMOS = /regi[oó]n|desencant|disenchant|otros reinos|other realm|alt realm|reciente|recent|destru|destroy|convert|transform|compra al vendedor|vendor buy|prospect/i;
test('lo que no tenemos sigue sin salir: ni región, ni otros reinos, ni valor reciente, ni destruir, ni compra al vendedor', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  m.lua(INVENTARIO);
  m.lua(`assert(SnetForever.Formulas.ponerFuente("barato", "snfmercado * 0.5"))
    local T = SnetForever.TooltipComercio
    for _, l in ipairs(T.LINEAS) do T.ponerLinea(l.clave, true) end
    T.ponerLinea("inventario", true); T.ponerLinea("mercado", true)
    assert(T.ponerLinea("fuente:barato", true))`);
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250 });
  m.lua('BANCO.iconosItem[2589] = 132889');
  for (const idioma of ['es', 'en']) {
    m.lua(`SnetForever.Ajustes.set("idioma", "${idioma}")`);
    const todo = JSON.stringify(ver(m, 2589));
    assert.ok(!NO_TENEMOS.test(todo), todo);
    const casillas = m.lua(`local s = {}
      for _, g in ipairs(SnetForever.TooltipComercio.GRUPOS) do
        s[#s + 1] = SnetForever.L.t(g.texto)
        for _, l in ipairs(g.lineas) do
          if not l.llega then s[#s + 1] = SnetForever.L.t(l.texto) end
        end
      end
      return table.concat(s, "\\n")`);
    assert.ok(!NO_TENEMOS.test(casillas), casillas);
  }
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Task 37: las líneas en los grupos de TSM, con los datos que tenemos de verdad, y Tooltip.componer
// ---------------------------------------------------------------------------------------------------

const TT = 'SnetForever.TooltipComercio';
// Task 39: los motivos y los nombres de Fabricación se acortan para caber en la columna de Ajustes › Tooltip.
const LLEGA_CONTA = 'llega con Contabilidad';
const LLEGA_VENDER = 'llega con Vender';
const LLEGA_FAB = 'llega con Fabricación';
// [clave, texto, [[clave, texto, defecto, excluye, llega]…]], con los textos ya traducidos (es).
const GRUPOS = [
  ['gruposOps', 'Grupos y operaciones', [
    ['grupo', 'Grupo', true, null, null], ['operacion', 'Operación de subasta', true, null, null],
    ['operacionArtesania', 'Operación de artesanía', false, null, null], ['operacionCorreo', 'Operación de correo', false, null, null],
    ['operacionCompras', 'Operación de compras', false, null, null], ['operacionSniper', 'Operación de sniper', false, null, null],
    ['operacionVendedor', 'Operación de vendedor', false, null, null], ['operacionAlmacen', 'Operación de almacén', false, null, null],
  ]],
  ['valores', 'Valores', [
    ['destruirCompleto', 'Destruir, completo', false, null, 'llega con Destruir'],
    ['destruirSimple', 'Destruir, simple', false, null, 'llega con Destruir'],
    ['convertirCompleto', 'Convertir, completo', false, null, 'llega con Destruir'],
    ['convertirSimple', 'Convertir, simple', false, null, 'llega con Destruir'],
    ['vendedorCompra', 'Compra al vendedor', false, null, 'aún sin datos'],
    ['vendedor', 'Precio de venta al vendedor', true, null, null],
  ]],
  ['inventario', 'Inventario', [
    ['inventario', 'Inventario completo', true, 'inventarioSimple', null], ['inventarioSimple', 'Inventario simple', false, 'inventario', null],
  ]],
  ['contabilidad', 'Contabilidad', [
    ['contaCompras', 'Compras', false, null, null], ['contaVentas', 'Ventas', false, null, LLEGA_CONTA],
    ['contaRitmo', 'Ritmo de venta', false, null, LLEGA_CONTA], ['contaCaducadas', 'Caducadas', false, null, LLEGA_CONTA],
    ['contaCanceladas', 'Canceladas', false, null, LLEGA_CONTA],
  ]],
  ['bdSubasta', 'Precios de la subasta', [
    ['aLaVenta', 'A la venta', true, null, null], ['minima', 'Compra mínima', true, null, null],
    ['mercadoSolo', 'Valor de mercado', false, 'mercado', null], ['mercado', 'Valor de mercado y tendencia', true, 'mercadoSolo', null],
    ['historico', 'Precio histórico', false, null, null], ['salen', SALEN, true, null, null], ['parte', PARTE, true, null, null],
  ]],
  ['opSubasta', 'Subasta (operación)', [
    ['cantidadPublicar', 'Cantidad que se publica', false, null, LLEGA_VENDER],
    ['preciosSubasta', 'Precios mínimo, normal y máximo', false, null, null], ['maximoPublicar', 'Máximo a publicar', false, null, null],
  ]],
  ['fabricacion', 'Fabricación', [
    ['coste', 'Coste', false, null, LLEGA_FAB], ['costeDetallado', 'Coste detallado', false, null, LLEGA_FAB],
    ['costeMateriales', 'Coste de materiales', false, null, LLEGA_FAB],
  ]],
  ['compras', 'Compras', [
    ['maximoCompras', 'Precio máximo (Compras)', false, null, null], ['regla', 'Si cumple tu regla de compra', true, null, null],
  ]],
  ['sniper', 'Sniper', [['maximoSniper', 'Precio máximo (Sniper)', false, null, null]]],
  ['otros', 'Otros', [['ids', 'ItemID e IconID', false, null, null]]],
];
const LEER_GRUPOS = `local L, s = SnetForever.L, {}
  for i, g in ipairs(${TT}.GRUPOS) do
    local lineas = {}
    for j, l in ipairs(g.lineas) do
      lineas[j] = {l.clave, L.t(l.texto), l.defecto, l.excluye or "-", l.llega and L.t(l.llega) or "-"}
    end
    s[i] = {g.clave, L.t(g.texto), lineas}
  end
  return s`;
const conGuiones = (grupos) => grupos.map(([c, t, ls]) => [c, t, ls.map(([a, b, d, e, l]) => [a, b, d, e ?? '-', l ?? '-'])]);
const OPS = 'SnetForever · Operaciones';

// Lo que el tooltip del lino (con grupo, operación, regla, inventario, precio de venta y la lista de Navegar de hace 10 min)
// enseñaba antes de la Task 37, línea a línea: [izquierda, derecha, color de la izquierda], con lo que añadió F1 (de qué foto
// es cada número y de cuándo, y el mínimo con que se mira la regla), y lo de F2 (la frase de lo que no cuenta el inventario). `yo` es el personaje del banco.
const antesDeLaTask37 = (yo, maga, guerrero) => [
  ['Paño de lino', undefined, undefined], // la línea del juego
  [T_GENERAL, undefined, AMARILLO],
  ['Grupo', 'Paños › Lino', [0.8, 0.8, 0.8]],
  ['Operación de subasta', 'Vender lino', [0.8, 0.8, 0.8]],
  ['Precio de venta al vendedor', '2s 50c', [0.8, 0.8, 0.8]],
  ['Inventario', '20 en bolsas y banco', [0.8, 0.8, 0.8]],
  [`  ${yo}`, '17 (5 Bolsas, 12 Banco)', maga],
  ['  Brok', '3 (3 Bolsas, banco sin ver)', guerrero],
  // F2: debajo, en gris, lo que el total no cuenta.
  ['Sin contar: 1 banco, 2 buzones y los personajes sin entrar', undefined, [0.8, 0.8, 0.8]],
  ['SnetForever · Subasta', undefined, AMARILLO],
  ['A la venta', '20 unidades (subasta, hace 10 min)', [0.8, 0.8, 0.8]],
  ['Compra mínima', '4g 50s 00c', [0.8, 0.8, 0.8]],
  ['Valor de mercado', '[^12%] 10g 00s 00c (app, hace 17 min)', [0.8, 0.8, 0.8]],
  [SALEN, 'hasta 2.054', [0.8, 0.8, 0.8]],
  [PARTE, '42 %', [0.8, 0.8, 0.8]],
  [`${SIN_CONFIRMAR} (a 4g 50s 00c)`, undefined, AMARILLO],
];

test('las líneas van en los grupos de TSM con sus claves; las nuevas salen apagadas y el tooltip sin tocar nada es igual que antes', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  m.lua(INVENTARIO);
  listaImitada(m, 2589, 45000, 20, 600);
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250 });
  assert.deepEqual(m.lua(LEER_GRUPOS), conGuiones(GRUPOS));
  // LINEAS: las que tienen datos, en el orden de GRUPOS (se queda por compatibilidad).
  const conDatos = GRUPOS.flatMap(([, , ls]) => ls.filter((l) => !l[4]).map(([c, t, d]) => [c, t, d]));
  assert.deepEqual(m.lua(`local s = {}; for i, l in ipairs(${TT}.LINEAS) do s[i] = {l.clave, SnetForever.L.t(l.texto), l.defecto} end; return s`), conDatos);
  for (const [clave, , defecto] of conDatos) assert.equal(m.lua(`${TT}.linea(${aLua(clave)})`), defecto, clave);
  // Sin nada guardado, el tooltip es el de antes, línea a línea.
  m.lua('SnetForeverCuenta.comercio.tooltipLineas = nil');
  const color = (clase) => m.lua(`local c = RAID_CLASS_COLORS.${clase}; return {c.r, c.g, c.b}`);
  const ahora = ver(m, 2589).map((x) => [sinColores(x.izq), x.der === undefined ? undefined : sinColores(x.der), x.colorIzq]);
  assert.deepEqual(ahora, antesDeLaTask37(m.lua('UnitName("player")'), color('MAGE'), color('WARRIOR')));
  // Ronda 1: con 2 operaciones de Subasta en el grupo, la línea de siempre sigue con solo la primera, como antes.
  m.lua(`local O = SnetForever.Operaciones
    assert(O.crear("subasta", "Otra de lino"))
    assert(O.ponerDeGrupo(SnetForever.Arbol.objeto("i:2589"), "subasta", {"Vender lino", "Otra de lino"}))`);
  const dos = ver(m, 2589).map((x) => [sinColores(x.izq), x.der === undefined ? undefined : sinColores(x.der), x.colorIzq]);
  assert.deepEqual(dos, antesDeLaTask37(m.lua('UnitName("player")'), color('MAGE'), color('WARRIOR')));
  // Y en inglés los títulos de los grupos también tienen texto.
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const en = m.lua(LEER_GRUPOS);
  assert.deepEqual(en.map((g) => g[1]), ['Groups and operations', 'Values', 'Inventory', 'Accounting', 'Auction house prices',
    'Auction (operation)', 'Crafting', 'Shopping', 'Sniper', 'Other']);
  for (const g of en) for (const l of g[2]) assert.ok(!/^COMERCIO_/.test(l[1]) && !/^COMERCIO_/.test(l[4]), JSON.stringify(l));
  sinErrores(m);
});

test('cada operación de los 7 tipos sale en su línea al encenderla, también heredada, con hasta 3 nombres', () => {
  const m = maquina({ escaneo: false });
  m.lua(`local A, O = SnetForever.Arbol, SnetForever.Operaciones
    local r1 = A.crear("", "Paños"); local r2 = A.crear(r1, "Lino")
    assert(A.poner("i:2589", r2))
    for _, n in ipairs({"S1", "S2"}) do assert(O.crear("subasta", n)) end
    assert(O.ponerDeGrupo(r2, "subasta", {"S1", "S2"}))
    assert(O.crear("artesania", "Fabricar")); assert(O.ponerDeGrupo(r1, "artesania", {"Fabricar"})) -- heredada
    for _, n in ipairs({"C1", "C2", "C3", "C4"}) do assert(O.crear("correo", n)) end
    assert(O.ponerDeGrupo(r1, "correo", {"C1", "C2", "C3", "C4"})) -- heredada, cuatro
    assert(O.crear("compras", "Comprar")); assert(O.ponerDeGrupo(r2, "compras", {"Comprar"}))
    assert(O.crear("sniper", "Vigilar")); assert(O.ponerDeGrupo(r2, "sniper", {"Vigilar"}))
    for _, n in ipairs({"V1", "V2", "V3"}) do assert(O.crear("vendedor", n)) end
    assert(O.ponerDeGrupo(r2, "vendedor", {"V1", "V2", "V3"}))
    assert(O.crear("almacen", "Guardar")); assert(O.ponerDeGrupo("", "almacen", {"Guardar"})) -- del Grupo Base`);
  const esperadas = [
    ['operacion', 'Operación de subasta', 'S1'], // la de siempre: solo la primera, como antes (ronda 1)
    ['operacionArtesania', 'Operación de artesanía', 'Fabricar'],
    ['operacionCorreo', 'Operación de correo', 'C1, C2, C3 y 1 más'],
    ['operacionCompras', 'Operación de compras', 'Comprar'],
    ['operacionSniper', 'Operación de sniper', 'Vigilar'],
    ['operacionVendedor', 'Operación de vendedor', 'V1, V2 y V3'],
    ['operacionAlmacen', 'Operación de almacén', 'Guardar'],
  ];
  // Por defecto solo la de subasta.
  const antes = ver(m, 2589);
  assert.deepEqual(esperadas.filter(([, e]) => linea(antes, e)).map(([c]) => c), ['operacion'], JSON.stringify(antes));
  for (const [clave] of esperadas) assert.equal(m.lua(`${TT}.ponerLinea(${aLua(clave)}, true)`), true, clave);
  const d = ver(m, 2589);
  const t1 = d.findIndex((x) => x.izq === T_GENERAL);
  const i = d.findIndex((x) => x.izq === 'Grupo');
  // En el apartado de información general, detrás del grupo y en el orden de los tipos.
  assert.deepEqual(d.slice(i + 1, i + 8).map((x) => [x.izq, x.der]), esperadas.map(([, e, v]) => [e, v]));
  assert.ok(t1 >= 0 && i === t1 + 1, JSON.stringify(d));
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const en = ver(m, 2589);
  assert.equal(linea(en, 'Mailing operation').der, 'C1, C2, C3 and 1 more');
  assert.equal(linea(en, 'Vendoring operation').der, 'V1, V2 and V3');
  assert.equal(linea(en, 'Auction operation').der, 'S1');
  // Sin grupo, ninguna (ni la del Grupo Base: el objeto tiene que estar en un grupo, como hoy).
  assert.ok(!ver(m, 5000).some((x) => /operation/i.test(String(x.izq))));
  sinErrores(m);
});

test('inventario simple enseña solo el total; marcarlo apaga el completo y al revés', () => {
  const m = maquina({ escaneo: false });
  m.lua(INVENTARIO);
  assert.equal(m.lua(`${TT}.ponerLinea("inventarioSimple", true)`), true);
  assert.equal(m.lua(`${TT}.linea("inventario")`), false, 'marcar el simple apaga el completo');
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipLineas.inventario'), false);
  const simple = ver(m, 2589);
  const i = simple.findIndex((x) => x.izq === 'Inventario');
  assert.equal(simple[i].der, '20 en bolsas y banco');
  assert.ok(!simple.some((x) => String(x.izq).startsWith('  ')), `sin el desglose por personaje: ${JSON.stringify(simple)}`);
  assert.equal(simple.filter((x) => x.izq === 'Inventario').length, 1);
  assert.equal(m.lua(`${TT}.ponerLinea("inventario", true)`), true);
  assert.equal(m.lua(`${TT}.linea("inventarioSimple")`), false, 'y al revés');
  assert.ok(linea(ver(m, 2589), '  Brok'), 'el completo vuelve con cada personaje');
  // Apagar una no enciende la otra.
  m.lua(`${TT}.ponerLinea("inventario", false)`);
  assert.equal(m.lua(`${TT}.linea("inventarioSimple")`), false);
  assert.ok(!linea(ver(m, 2589), 'Inventario'));
  sinErrores(m);
});

test('valor de mercado sin tendencia y con tendencia son pareja: marcar una apaga la otra', () => {
  const m = maquina({ escaneo: false });
  assert.equal(m.lua(`${TT}.ponerLinea("mercadoSolo", true)`), true);
  assert.equal(m.lua(`${TT}.linea("mercado")`), false);
  const solo = ver(m, 2589);
  assert.equal(sinColores(linea(solo, 'Valor de mercado').der), '10g 00s 00c', 'sin el corchete de la tendencia');
  assert.equal(solo.filter((x) => x.izq === 'Valor de mercado').length, 1);
  assert.equal(m.lua(`${TT}.ponerLinea("mercado", true)`), true);
  assert.equal(m.lua(`${TT}.linea("mercadoSolo")`), false);
  assert.equal(sinColores(linea(ver(m, 2589), 'Valor de mercado').der), '[^12%] 10g 00s 00c');
  m.lua(`${TT}.ponerLinea("mercado", false)`);
  assert.equal(m.lua(`${TT}.linea("mercadoSolo")`), false, 'apagar una no enciende la otra');
  assert.ok(!linea(ver(m, 2589), 'Valor de mercado'));
  sinErrores(m);
});

test('una fuente propia encendida sale con su valor; renombrarla en Ajustes mueve su ajuste; quitarla no rompe nada', () => {
  const m = maquina({ escaneo: false });
  m.lua('assert(SnetForever.Formulas.ponerFuente("barato", "snfmercado * 0.5")); assert(SnetForever.Formulas.ponerFuente("alto", "snfmercado * 2"))');
  // Ronda 1: la misma forma que LINEAS (texto = clave que se traduce, defecto) y el nombre de la fuente aparte.
  assert.deepEqual(m.lua(`local s = {}; for i, l in ipairs(${TT}.lineasFuentes()) do s[i] = {l.clave, SnetForever.L.t(l.texto), l.defecto, l.nombre} end; return s`),
    [['fuente:alto', 'Fuente propia', false, 'alto'], ['fuente:barato', 'Fuente propia', false, 'barato']], 'por nombre');
  assert.equal(m.lua(`${TT}.linea("fuente:barato")`), false, 'apagada por defecto');
  assert.ok(!ver(m, 2589).some((x) => String(x.izq).startsWith('Fuente propia')));
  assert.equal(m.lua(`${TT}.ponerLinea("fuente:nada", true)`), false, 'una fuente que no existe no se puede encender');
  assert.equal(m.lua('(SnetForeverCuenta.comercio.tooltipLineas or {})["fuente:nada"]'), undefined);
  assert.equal(m.lua(`${TT}.ponerLinea("fuente:barato", true)`), true);
  assert.equal(m.lua(`${TT}.linea("fuente:barato")`), true);
  assert.equal(m.lua(`${TT}.linea("fuente:Barato")`), true, 'el nombre de una fuente se guarda en minúsculas');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250 });
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'Fuente propia «barato»').der), '5g 00s 00c');
  assert.ok(!linea(d, 'Fuente propia «alto»'), 'la otra sigue apagada');
  const iFuente = d.findIndex((x) => x.izq === 'Fuente propia «barato»');
  assert.ok(iFuente > d.findIndex((x) => x.izq === 'Precio de venta al vendedor') && iFuente > d.findIndex((x) => x.izq === T_GENERAL)
    && iFuente < d.findIndex((x) => x.izq === 'SnetForever · Subasta'), `en la información general, detrás del precio de venta: ${JSON.stringify(d)}`);
  // Renombrarla en Ajustes › Fuentes propias: su ajuste pasa al nombre nuevo.
  m.lua(`SnetForever.Principal.abrir("ajustes")
    local A = SnetForever.PrincipalAjustes
    A.elegir("fuentes")
    local F = SnetForever.EditorFormula.marco()
    for _, f in ipairs(A.fuentes.filas) do
      if f:IsShown() and f.fuente == "barato" then f:Click("LeftButton") end
    end
    F.campoNombre:SetText("rebajado")
    F.botonGuardar:Click("LeftButton")
    SnetForever.Principal.cerrar()`);
  assert.equal(m.lua('SnetForever.Formulas.fuentes().rebajado'), 'snfmercado * 0.5');
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipLineas["fuente:rebajado"]'), true);
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipLineas["fuente:barato"]'), undefined);
  assert.equal(sinColores(linea(ver(m, 2589), 'Fuente propia «rebajado»').der), '5g 00s 00c');
  // Quitarla: la clave se queda guardada y no estorba (ni línea, ni error, ni fallo apuntado).
  m.lua('FALLOS_ANTES = #SnetForeverCuenta.fallos; assert(SnetForever.Formulas.quitarFuente("rebajado"))');
  const sin = ver(m, 2589);
  assert.ok(!sin.some((x) => String(x.izq).startsWith('Fuente propia')), JSON.stringify(sin));
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipLineas["fuente:rebajado"]'), true);
  assert.equal(m.lua('#SnetForeverCuenta.fallos'), m.lua('FALLOS_ANTES'));
  assert.deepEqual(m.lua(`local s = {}; for i, l in ipairs(${TT}.lineasFuentes()) do s[i] = l.clave end; return s`), ['fuente:alto']);
  // Ronda 1: el ajuste de una fuente ya quitada se puede apagar; encenderla, no.
  assert.equal(m.lua(`${TT}.ponerLinea("fuente:rebajado", false)`), true);
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipLineas["fuente:rebajado"]'), false);
  assert.equal(m.lua(`${TT}.ponerLinea("fuente:rebajado", true)`), false);
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipLineas["fuente:rebajado"]'), false);
  sinErrores(m);
});

test('precios mínimo, normal y máximo y máximo a publicar salen de la primera operación de Subasta del grupo; con una fórmula rota esa línea no sale y se apunta', () => {
  const m = maquina({ escaneo: false });
  m.lua(`${GRUPO_LINO}
    assert(O.poner("subasta", "Vender lino", "precioMinimo", "1g 20s"))
    assert(O.poner("subasta", "Vender lino", "precioNormal", "2g"))
    assert(O.poner("subasta", "Vender lino", "precioMaximo", "5g"))
    assert(O.poner("subasta", "Vender lino", "tope", "250"))
    assert(O.crear("subasta", "Otra"))
    assert(O.poner("subasta", "Otra", "precioMinimo", "9g"))
    assert(O.ponerDeGrupo(r2, "subasta", {"Vender lino", "Otra"}))`);
  // Apagadas por defecto: ni el apartado.
  assert.ok(!ver(m, 2589).some((x) => x.izq === OPS));
  m.lua(`${TT}.ponerLinea("preciosSubasta", true); ${TT}.ponerLinea("maximoPublicar", true)`);
  const d = ver(m, 2589);
  const t = d.findIndex((x) => x.izq === OPS);
  assert.ok(t > d.findIndex((x) => x.izq === 'SnetForever · Subasta'), JSON.stringify(d));
  assert.deepEqual(d[t].colorIzq, AMARILLO);
  assert.deepEqual(d.slice(t + 1).map((x) => [x.izq, sinColores(x.der)]), [
    ['Mínimo / normal / máximo', '1g 20s 00c / 2g 00s 00c / 5g 00s 00c'],
    ['Máximo a publicar', '250'],
  ], 'de la primera operación del grupo, y el máximo a publicar es un número, no dinero');
  // Sin valor: «—» en su sitio.
  m.lua('assert(SnetForever.Operaciones.poner("subasta", "Vender lino", "precioNormal", "vendorbuy"))');
  assert.equal(sinColores(linea(ver(m, 2589), 'Mínimo / normal / máximo').der), '1g 20s 00c / — / 5g 00s 00c');
  // Una fórmula rota: esa línea no sale, las demás sí, se apunta una vez y nada se rompe.
  m.lua(`FALLOS_ANTES = #SnetForeverCuenta.fallos
    SnetForeverCuenta.comercio.v2.operaciones.subasta["Vender lino"].valores.precioMinimo = "max(1g"`);
  const rota = ver(m, 2589);
  assert.ok(!linea(rota, 'Mínimo / normal / máximo'), JSON.stringify(rota));
  assert.equal(linea(rota, 'Máximo a publicar').der, '250');
  assert.ok(linea(rota, 'Compra mínima') && linea(rota, 'Grupo'), 'el resto del tooltip sigue');
  assert.equal(m.lua('#SnetForeverCuenta.fallos'), m.lua('FALLOS_ANTES') + 1, 'se apunta');
  assert.match(m.lua('SnetForeverCuenta.fallos[#SnetForeverCuenta.fallos].texto'), /^tooltip: /);
  ver(m, 2589);
  ver(m, 5000);
  assert.equal(m.lua('#SnetForeverCuenta.fallos'), m.lua('FALLOS_ANTES') + 1, 'una vez, no en cada tooltip');
  // Sin operación de Subasta en el grupo, nada (ni «— / — / —»).
  m.lua('assert(SnetForever.Operaciones.ponerDeGrupo(SnetForever.Arbol.objeto("i:2589"), "subasta", {}))');
  assert.ok(!ver(m, 2589).some((x) => x.izq === OPS));
  sinErrores(m);
});

test('el precio máximo de Compras y de Sniper sale de su operación', () => {
  const m = maquina({ escaneo: false });
  m.lua(`${GRUPO_LINO}
    assert(O.crear("compras", "Comprar lino")); assert(O.poner("compras", "Comprar lino", "precioMaximo", "3g"))
    assert(O.crear("sniper", "Vigilar")); assert(O.poner("sniper", "Vigilar", "precioMaximo", "2g 50s"))
    assert(O.ponerDeGrupo(r2, "compras", {"Comprar lino"})); assert(O.ponerDeGrupo(r1, "sniper", {"Vigilar"}))`);
  assert.ok(!ver(m, 2589).some((x) => x.izq === OPS), 'apagadas por defecto');
  m.lua(`${TT}.ponerLinea("maximoCompras", true); ${TT}.ponerLinea("maximoSniper", true)`);
  const d = ver(m, 2589);
  const t = d.findIndex((x) => x.izq === OPS);
  assert.deepEqual(d.slice(t + 1).map((x) => [x.izq, sinColores(x.der)]), [
    ['Precio máximo (Compras)', '3g 00s 00c'], ['Precio máximo (Sniper)', '2g 50s 00c'],
  ], JSON.stringify(d));
  // Sin grupo, nada.
  assert.ok(!ver(m, 5000).some((x) => x.izq === OPS));
  sinErrores(m);
});

// Tope prudente: el tooltip enseña el tope con el que Sniper y Compras compran de verdad. El lino vale 10 de oro en tu casa.
test('el precio máximo de Compras y de Sniper sale con el tope prudente y dice de dónde sale', () => {
  const m = maquina({ escaneo: false });
  m.lua(`${GRUPO_LINO}
    assert(O.crear("compras", "Comprar lino")); assert(O.poner("compras", "Comprar lino", "precioMaximo", "50g"))
    assert(O.crear("sniper", "Vigilar")); assert(O.poner("sniper", "Vigilar", "precioMaximo", "2g 50s"))
    assert(O.ponerDeGrupo(r2, "compras", {"Comprar lino"})); assert(O.ponerDeGrupo(r1, "sniper", {"Vigilar"}))`);
  m.lua(`${TT}.ponerLinea("maximoCompras", true); ${TT}.ponerLinea("maximoSniper", true)`);
  const d = ver(m, 2589);
  const t = d.findIndex((x) => x.izq === OPS);
  const recortado = sinColores(m.lua('SnetForever.L.t("COMERCIO_TT_MAX_RECORTE_MERCADO", SnetForever.Tema.dinero(100000))'));
  assert.deepEqual(d.slice(t + 1).map((x) => [x.izq, sinColores(x.der)]), [
    ['Precio máximo (Compras)', recortado], ['Precio máximo (Sniper)', '2g 50s 00c'],
  ], JSON.stringify(d));
  assert.match(recortado, /^10g 00s 00c \(tu casa\)$/);
  sinErrores(m);
});

test('las líneas «llega con…» no se pueden encender (ponerLinea da false) y no salen en el tooltip', () => {
  const m = maquina({ escaneo: false });
  m.lua(GRUPO_LINO);
  const llegan = GRUPOS.flatMap(([, , ls]) => ls.filter((l) => l[4]));
  assert.equal(llegan.length, 13); // fase 2: el precio histórico y el coste medio de compra ya tienen datos
  for (const [clave] of llegan) {
    assert.equal(m.lua(`${TT}.ponerLinea(${aLua(clave)}, true)`), false, clave);
    assert.equal(m.lua(`${TT}.linea(${aLua(clave)})`), false, clave);
    assert.equal(m.lua(`(SnetForeverCuenta.comercio.tooltipLineas or {})[${aLua(clave)}]`), undefined, `${clave} no se guarda`);
  }
  assert.equal(m.lua(`local n = 0; for _, l in ipairs(${TT}.LINEAS) do if l.llega then n = n + 1 end end; return n`), 0, 'no están en LINEAS');
  m.lua(`for _, g in ipairs(${TT}.GRUPOS) do for _, l in ipairs(g.lineas) do if l.llega then SnetForeverCuenta.comercio.tooltipLineas = SnetForeverCuenta.comercio.tooltipLineas or {}; SnetForeverCuenta.comercio.tooltipLineas[l.clave] = true end end end`);
  const todas = ver(m, 2589).map((x) => sinColores(x.izq));
  for (const [, texto] of llegan) assert.ok(!todas.includes(texto), `${texto}: ${JSON.stringify(todas)}`);
  assert.ok(!JSON.stringify(todas).includes('llega'), 'ni el aviso');
  sinErrores(m);
});

test('Tooltip.componer con una salida falsa recibe las mismas líneas que el tooltip de verdad', () => {
  const m = maquina();
  m.lua(GRUPO_LINO);
  m.lua(INVENTARIO);
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250 });
  m.lua('BANCO.iconosItem[2589] = 132889');
  m.lua(`assert(SnetForever.Formulas.ponerFuente("barato", "snfmercado * 0.5"))
    local O = SnetForever.Operaciones
    assert(O.poner("subasta", "Vender lino", "precioMinimo", "1g"))
    for _, l in ipairs(${TT}.LINEAS) do ${TT}.ponerLinea(l.clave, true) end
    ${TT}.ponerLinea("inventario", true); ${TT}.ponerLinea("mercado", true); ${TT}.ponerLinea("fuente:barato", true)`);
  const fuera = (cuerpo) => m.lua(`local T, L = ${TT}, SnetForever.L
    local out = {}
    local salida = {
      titulo = function(self, clave) out[#out + 1] = {L.t(clave), "-", T.COLORES.amarillo} end,
      doble = function(self, izq, der, color) out[#out + 1] = {izq, der, color or T.COLORES.gris} end,
      linea = function(self, texto, color) out[#out + 1] = {texto, "-", color or T.COLORES.gris} end,
    }
    ${cuerpo}
    return out`);
  for (const id of [2589, 5000, 6000]) {
    const deVerdad = nuestras(ver(m, id)).map((x) => [x.izq, x.der ?? '-', x.colorIzq]);
    const falsa = fuera(`T.componer(salida, T.datos(${id}), SnetForeverCuenta.comercio.tooltipLineas)`);
    assert.deepEqual(falsa, deVerdad, `${id}`);
    assert.ok(id !== 2589 || deVerdad.length > 15, JSON.stringify(deVerdad));
  }
  // Unos datos inventados (lo que hará el ejemplo de Ajustes › Tooltip): cada dato se pide por su función.
  const inventada = fuera(`local datos = {
      grupo = function() return "Paños" .. SnetForever.Arbol.SEP .. "Lino" end,
      operaciones = function(tipo) return {"Ejemplo"} end,
      venta = function() return 8 end,
      fuente = function(nombre) return 10 end,
      inventario = function() return 5, {{nombre = "Uno", clase = "MAGE", total = 5, bolsas = 5, banco = 0}} end,
      subasta = function() return 1100, 3, 2, 60, {normal = 1200, tendencia = 5, conTendencia = true, vendidosDia = 2, ritmo = 0.5} end,
      campoSubasta = function(campo) return campo == "tope" and 7 or 2000 end,
      maximo = function(tipo) return 3000 end,
      regla = function() return true end,
      ids = function() return 1234, 5678 end,
    }
    T.componer(salida, datos, {preciosSubasta = true, maximoPublicar = true, maximoCompras = true, ids = true, ["fuente:barato"] = true})`);
  const izq = inventada.map((x) => x[0]);
  for (const e of ['Grupo', 'Operación de subasta', 'Precio de venta al vendedor', 'Fuente propia «barato»', 'Inventario', 'A la venta',
    'Mínimo / normal / máximo', 'Máximo a publicar', 'Precio máximo (Compras)', 'ItemID', 'IconID']) assert.ok(izq.includes(e), `${e}: ${JSON.stringify(izq)}`);
  // Ronda 1: también los valores, línea a línea.
  assert.deepEqual(inventada.map((x) => [sinColores(x[0]), sinColores(x[1])]), [
    [T_GENERAL, '-'], ['Grupo', 'Paños › Lino'], ['Operación de subasta', 'Ejemplo'], ['Precio de venta al vendedor', '8c'],
    ['Fuente propia «barato»', '10c'], ['Inventario', '5 en bolsas y banco'], ['  Uno', '5 (5 Bolsas, 0 Banco)'],
    ['SnetForever · Subasta', '-'], ['A la venta', '3 unidades, 2 subastas (app, hace 1 min)'], ['Compra mínima', '11s 00c'],
    ['Valor de mercado', '[^5%] 12s 00c'], [SALEN_SUELTO, '2'], [NO_SON_VENTAS, '-'], [PARTE_SUELTO, '50 %'],
    ['Buena compra según tu regla (a 11s 00c)', '-'],
    [OPS, '-'], ['Mínimo / normal / máximo', '20s 00c / 20s 00c / 20s 00c'], ['Máximo a publicar', '7'],
    ['Precio máximo (Compras)', '30s 00c'], ['ItemID', '1234'], ['IconID', '5678'],
  ]);
  sinErrores(m);
});

test('ronda 1: componer usa siempre el idioma del cliente: después de componer y cambiar de idioma, el tooltip sale en el nuevo', () => {
  const m = maquina({ escaneo: false });
  m.lua(GRUPO_LINO);
  // Una composición aparte (como la del ejemplo de Ajustes), aunque pida otro idioma, no estropea las etiquetas guardadas.
  m.lua(`local salida = {titulo = function() end, doble = function() end, linea = function() end}
    ${TT}.componer(salida, ${TT}.datos(2589), nil, {idioma = "en"})
    ${TT}.componer(salida, ${TT}.datos(2589), nil)`);
  assert.ok(linea(ver(m, 2589), 'Compra mínima'), 'en español');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const en = ver(m, 2589).map((x) => sinColores(x.izq));
  for (const e of ['SnetForever · General information', 'Group', 'Auction operation', 'SnetForever · Auction', 'Lowest buyout', 'Market value']) {
    assert.ok(en.includes(e), `${e}: ${JSON.stringify(en)}`);
  }
  assert.ok(!en.includes('Compra mínima') && !en.includes('Grupo'), JSON.stringify(en));
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  assert.ok(linea(ver(m, 2589), 'Compra mínima'), 'y de vuelta en español');
  sinErrores(m);
});

test('ronda 1: una fuente propia guardada con mayúsculas (de antes) sale igual, por el mismo camino que las fórmulas', () => {
  const m = maquina({ escaneo: false });
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.v2.fuentes.Viejo = "snfmercado * 3"');
  assert.deepEqual(m.lua(`local s = {}; for i, l in ipairs(${TT}.lineasFuentes()) do s[i] = l.clave end; return s`), ['fuente:viejo']);
  assert.equal(m.lua(`${TT}.ponerLinea("fuente:viejo", true)`), true);
  assert.equal(m.lua('SnetForever.Formulas.valor("viejo", 2589)'), 300000, 'la fórmula la encuentra');
  const l = linea(ver(m, 2589), 'Fuente propia «viejo»');
  assert.ok(l, 'la línea sale');
  assert.equal(sinColores(l.der), '30g 00s 00c');
  sinErrores(m);
});

test('ronda 1: una fuente propia con la fórmula rota no sale, se apunta una vez por fórmula y el resto del tooltip sigue', () => {
  const m = maquina({ escaneo: false });
  m.lua(GRUPO_LINO);
  m.lua(`assert(SnetForever.Formulas.ponerFuente("rota", "snfmercado * 2"))
    assert(SnetForever.Formulas.ponerFuente("buena", "snfmercado * 0.5"))
    assert(${TT}.ponerLinea("fuente:rota", true)); assert(${TT}.ponerLinea("fuente:buena", true))
    FALLOS_ANTES = #SnetForeverCuenta.fallos
    SnetForeverCuenta.comercio.v2.fuentes.rota = "max(1g"`);
  const d = ver(m, 2589);
  assert.ok(!linea(d, 'Fuente propia «rota»'), JSON.stringify(d));
  assert.equal(sinColores(linea(d, 'Fuente propia «buena»').der), '5g 00s 00c', 'las demás siguen');
  assert.ok(linea(d, 'Grupo') && linea(d, 'Compra mínima') && linea(d, 'Valor de mercado'), 'y el resto del tooltip');
  assert.equal(m.lua('#SnetForeverCuenta.fallos'), m.lua('FALLOS_ANTES') + 1, 'se apunta');
  assert.match(m.lua('SnetForeverCuenta.fallos[#SnetForeverCuenta.fallos].texto'), /^tooltip: fuente «rota».*max\(1g/);
  ver(m, 2589);
  ver(m, 5000);
  assert.equal(m.lua('#SnetForeverCuenta.fallos'), m.lua('FALLOS_ANTES') + 1, 'una vez, no en cada tooltip');
  // Otra fórmula rota en la misma fuente es otro fallo: se apunta otra vez (una vez por fórmula).
  m.lua('SnetForeverCuenta.comercio.v2.fuentes.rota = "min(2g"');
  ver(m, 2589);
  ver(m, 2589);
  assert.equal(m.lua('#SnetForeverCuenta.fallos'), m.lua('FALLOS_ANTES') + 2);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------

test('cada línea tiene su ajuste: todas las de antes encendidas menos ItemID/IconID, y cada una apaga la suya', () => {
  const m = maquina({ escaneo: false });
  m.lua(GRUPO_LINO);
  m.lua(INVENTARIO);
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250 });
  m.lua('BANCO.iconosItem[2589] = 132889');
  const T = 'SnetForever.TooltipComercio';
  const lista = [
    ['grupo', 'Grupo', true], ['operacion', 'Operación de subasta', true], ['vendedor', 'Precio de venta al vendedor', true],
    ['inventario', 'Inventario completo', true], ['aLaVenta', 'A la venta', true], ['minima', 'Compra mínima', true],
    ['mercado', 'Valor de mercado y tendencia', true], ['salen', SALEN, true], ['parte', PARTE, true],
    ['regla', 'Si cumple tu regla de compra', true], ['ids', 'ItemID e IconID', false],
  ];
  for (const [clave, , defecto] of lista) assert.equal(m.lua(`${T}.linea(${aLua(clave)})`), defecto, clave);
  // Lo que pone cada línea (su etiqueta a la izquierda).
  const pone = {
    grupo: ['Grupo'], operacion: ['Operación de subasta'], vendedor: ['Precio de venta al vendedor'], inventario: ['Inventario', '  Brok'],
    aLaVenta: ['A la venta'], minima: ['Compra mínima'], mercado: ['Valor de mercado'], salen: [SALEN], parte: [PARTE],
    regla: ['No cumple tu regla'], ids: ['ItemID', 'IconID'],
  };
  m.lua(`${T}.ponerLinea("ids", true)`);
  const todas = ver(m, 2589).map(reglaDice);
  for (const etiquetas of Object.values(pone)) for (const e of etiquetas) assert.ok(todas.includes(e), `${e}: ${JSON.stringify(todas)}`);
  for (const [clave] of lista) {
    assert.equal(m.lua(`${T}.ponerLinea(${aLua(clave)}, false)`), true);
    assert.equal(m.lua(`SnetForeverCuenta.comercio.tooltipLineas[${aLua(clave)}]`), false, 'se guarda en la cuenta');
    const ahora = ver(m, 2589).map(reglaDice);
    for (const e of pone[clave]) assert.ok(!ahora.includes(e), `${clave} apagada: ${JSON.stringify(ahora)}`);
    for (const [otra, etiquetas] of Object.entries(pone)) {
      if (otra !== clave) for (const e of etiquetas) assert.ok(ahora.includes(e), `${clave} no apaga ${e}`);
    }
    assert.equal(m.lua(`${T}.ponerLinea(${aLua(clave)}, true)`), true);
  }
  assert.equal(m.lua(`${T}.ponerLinea("no existe", true)`), false);
  assert.equal(m.lua(`${T}.linea("no existe")`), false);
  // Con todo lo de un apartado apagado, su título tampoco sale.
  for (const clave of ['aLaVenta', 'minima', 'mercado', 'salen', 'parte', 'regla']) m.lua(`${T}.ponerLinea(${aLua(clave)}, false)`);
  assert.ok(!ver(m, 2589).some((x) => x.izq === 'SnetForever · Subasta'));
  assert.ok(!ver(m, 6000).some((x) => String(x.izq).includes('sin precios')));
  sinErrores(m);
});

test('sin nada guardado todas las líneas valen su valor por defecto; ponerLinea crea tooltipLineas en la cuenta', () => {
  const m = maquina({ escaneo: false });
  m.lua('SnetForever.Guardado.preparar(); SnetForeverCuenta.comercio.tooltipLineas = nil');
  assert.equal(m.lua('SnetForever.TooltipComercio.linea("mercado")'), true);
  assert.equal(m.lua('SnetForever.TooltipComercio.linea("ids")'), false);
  assert.ok(linea(ver(m, 2589), 'Valor de mercado'));
  assert.equal(m.lua('SnetForever.TooltipComercio.ponerLinea("mercado", false)'), true);
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipLineas.mercado'), false);
  assert.ok(!linea(ver(m, 2589), 'Valor de mercado'));
  sinErrores(m);
});

test('el grupo del objeto se busca una sola vez por tooltip (lo comparten el grupo, la operación y la regla)', () => {
  const m = maquina({ escaneo: false });
  m.lua('local A = SnetForever.Arbol; local r = A.crear("", "Caros"); assert(A.poner("i:5001", r)); assert(SnetForever.Reglas.poner("propio:" .. r, {compraPct = 85}))');
  m.lua('VECES = 0; local f = SnetForever.Arbol.objeto; SnetForever.Arbol.objeto = function(...) VECES = VECES + 1; return f(...) end');
  const d = ver(m, 5001);
  assert.ok(linea(d, 'Grupo') && d.some((x) => reglaDice(x) === 'No cumple tu regla'), JSON.stringify(d));
  assert.equal(m.lua('VECES'), 1);
  // Reglas.deObjeto y Reglas.buenaCompra siguen valiendo sin el grupo (lo buscan ellas) y con él dan lo mismo.
  assert.equal(m.lua('SnetForever.Reglas.buenaCompra(5001, {precio = 120000, cantidad = 1}, SnetForever.Precios.de(5001))'), false);
  assert.equal(m.lua('SnetForever.Reglas.buenaCompra(5001, {precio = 120000, cantidad = 1}, SnetForever.Precios.de(5001), "Caros")'), false);
  assert.equal(m.lua('SnetForever.Reglas.buenaCompra(5001, {precio = 50000, cantidad = 1}, SnetForever.Precios.de(5001), "Caros")'), true);
  assert.equal(m.lua('SnetForever.Reglas.deObjeto(5001, "Otro grupo")'), undefined, 'un grupo sin regla: nada');
  sinErrores(m);
});

// T1b, ronda 1.
test('un objeto que ya no está a la venta (0 unidades): sin compra mínima y sin veredicto de la regla', () => {
  const m = maquina({ escaneo: false });
  m.lua('local A = SnetForever.Arbol; local r = A.crear("", "Agotados"); assert(A.poner("i:5005", r)); assert(SnetForever.Reglas.poner("propio:" .. r, {compraPct = 85}))');
  const d = ver(m, 5005);
  assert.equal(sinColores(linea(d, 'A la venta').der), '0 unidades (app, hace 17 min)');
  assert.ok(!linea(d, 'Compra mínima'), `la de 4g ya no existe: ${JSON.stringify(d)}`);
  assert.ok(!d.some((x) => aprobada(x) || reglaDice(x) === 'No cumple tu regla'), JSON.stringify(d));
  assert.ok(!JSON.stringify(d).includes('4g'), 'el precio viejo no sale por ningún lado');
  // Lo que no depende de que haya alguno ahora sí sale.
  assert.equal(sinColores(linea(d, 'Valor de mercado').der), '[^3%] 10g 00s 00c');
  assert.ok(linea(d, SALEN_SUELTO) && linea(d, PARTE_SUELTO)); // F5: 5005 es un objeto suelto
  // En cuanto la lista de Navegar trae uno, vuelve la compra mínima y el veredicto (F1: el escaneo ya no gana a la app).
  listaImitada(m, 5005, 40000, 2, 60);
  const con = ver(m, 5005);
  assert.equal(sinColores(linea(con, 'Compra mínima').der), '4g 00s 00c');
  assert.ok(con.some((x) => reglaDice(x) === 'Buena compra según tu regla'), JSON.stringify(con));
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// F1 (fallo en el juego): el tooltip decía «A la venta 14263 unidades (hace 8 min) · Compra mínima 1s 34c» cuando la lista
// recién leída en Navegar decía otra cosa. El escaneo apuntaba como hora del dato la de lectura, pero ReplicateItems da una
// foto guardada por el servidor (de cuándo, no se sabe), y el tooltip la tomaba por más nueva que la foto de la app. Regla:
// cada número dice de qué momento es, y el mínimo, las unidades y las subastas salen siempre de la misma foto.
// ---------------------------------------------------------------------------------------------------

// El lino de la investigación (datos inventados con la misma forma): la foto de la app de la hora anterior y la de esta hora.
const F1 = {
  antes: { 114: { 2589: [20, 26446, 28, 0, 0.4, 80, 0, 300, 1] } },
  ahora: { 114: { 2589: [21, 26371, 28, 0, 0.4, 80, 0, 290, 1] } },
};
// La réplica del servidor con la foto vieja: 100 a 20c y 26346 a 25c (26446 en total), y un objeto que la app no trae.
const REPLICA_VIEJA = `BANCO.ponerSubasta({replica = {
  {name = "Paño de lino", itemID = 2589, count = 100, buyoutPrice = 2000},
  {name = "Paño de lino", itemID = 2589, count = 26346, buyoutPrice = 26346 * 25},
  {name = "Sin datos", itemID = 6000, count = 4, buyoutPrice = 200},
}})`;
const pasar = (m, segundos) => m.lua(`BANCO.tick = BANCO.tick + ${Math.round(segundos * 20)}`);
const esperarA = (m, cond, max = 400) => { for (let i = 0; i < max && !cond(); i++) m.avanzar(0.05); return cond(); };
const escaneoCompleto = (m) => assert.ok(esperarA(m, () => m.lua('SnetForever.Escaneo.estado()') === 'completo'), 'el escaneo acaba');
// La lista de Navegar de un objeto, imitada: {precio, cantidad, hora, origen = "lista"} de hace `hace` segundos.
const regla = (d) => d.find((x) => aprobada(x) || /^No cumple tu regla/.test(sinColores(x.izq)));

test('compra mínima, unidades y subastas salen de la misma foto y la línea dice cuál y de cuándo', () => {
  // La app (hace 17 min) y el escaneo (leído hace 10 min): sale la app entera, y lo dice.
  const m = maquina();
  m.lua(GRUPO_LINO);
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'A la venta').der), '400 unidades, 37 subastas (app, hace 17 min)');
  assert.ok(linea(d, 'A la venta').der.endsWith(`|cff${hex(m, 'azul')}(app, hace 17 min)|r`), linea(d, 'A la venta').der);
  assert.equal(sinColores(linea(d, 'Compra mínima').der), '9g 80s 00c', 'el mínimo de la misma foto que las unidades');
  // La regla dice con qué mínimo la ha mirado: 9g 80s > 85 % de 10g.
  assert.equal(sinColores(regla(d).izq), 'No cumple tu regla (a 9g 80s 00c)');
  // Con la lista de Navegar leída: todo de la lista (sin subastas: una mercancía no las cuenta), y la regla con su mínimo.
  listaImitada(m, 2589, 50000, 12, 120);
  const v = ver(m, 2589);
  assert.equal(sinColores(linea(v, 'A la venta').der), '12 unidades (subasta, hace 2 min)');
  assert.equal(sinColores(linea(v, 'Compra mínima').der), '5g 00s 00c');
  assert.equal(sinColores(regla(v).izq), `${SIN_CONFIRMAR} (a 5g 00s 00c)`);
  // Sin «A la venta», la compra mínima dice ella de dónde y de cuándo es.
  m.lua('SnetForever.TooltipComercio.ponerLinea("aLaVenta", false)');
  assert.equal(sinColores(linea(ver(m, 2589), 'Compra mínima').der), '5g 00s 00c (subasta, hace 2 min)');
  // Solo el escaneo (la app no trae el objeto): lo dice, con la hora a la que se leyó.
  const e = maquina({ precios: false });
  const s = ver(e, 2589);
  assert.equal(sinColores(linea(s, 'A la venta').der), '20 unidades (escaneo, leído hace 10 min)');
  assert.equal(sinColores(linea(s, 'Compra mínima').der), '4g 50s 00c');
  // En inglés, con sus palabras.
  m.lua('SnetForever.TooltipComercio.ponerLinea("aLaVenta", true); SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(sinColores(linea(ver(m, 2589), 'On sale').der), `12 units (auction house, ${texto(m, 'COMERCIO_HACE_MIN', 2)})`);
  e.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(sinColores(linea(ver(e, 2589), 'On sale').der), `20 units (scan, read ${texto(e, 'COMERCIO_HACE_MIN', 10)})`);
  sinErrores(m);
  sinErrores(e);
});

test('el valor de mercado dice que es de la app y de cuándo', () => {
  const m = maquina({ escaneo: false });
  // La fuente de arriba ya es la app: basta un «hace» para las dos.
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'A la venta').der), '400 unidades, 37 subastas (app, hace 17 min)');
  assert.equal(sinColores(linea(d, 'Valor de mercado').der), '[^12%] 10g 00s 00c');
  // Con la lista de Navegar arriba, el valor de mercado dice que es de la app y de cuándo; lo demás de la app no lo repite.
  listaImitada(m, 2589, 50000, 12, 30);
  const v = ver(m, 2589);
  assert.equal(sinColores(linea(v, 'A la venta').der), '12 unidades (subasta, ahora mismo)');
  const mercado = linea(v, 'Valor de mercado').der;
  assert.equal(sinColores(mercado), '[^12%] 10g 00s 00c (app, hace 17 min)');
  assert.ok(mercado.endsWith(`|cff${hex(m, 'azul')}(app, hace 17 min)|r`), mercado);
  assert.equal(sinColores(linea(v, SALEN).der), 'hasta 2.054');
  assert.equal(sinColores(linea(v, PARTE).der), '42 %');
  // Sin el valor de mercado, lo dice la primera línea de la app que sale.
  m.lua('SnetForever.TooltipComercio.ponerLinea("mercado", false)');
  assert.equal(sinColores(linea(ver(m, 2589), SALEN).der), 'hasta 2.054 (app, hace 17 min)');
  // Con la app arriba pero sin «A la venta» ni «Compra mínima», el valor de mercado lo dice él.
  m.lua(`SnetForever.Busqueda.vivo = function() return nil end
    local T = SnetForever.TooltipComercio
    T.ponerLinea("mercado", true); T.ponerLinea("aLaVenta", false); T.ponerLinea("minima", false)`);
  const solo = ver(m, 2589);
  assert.equal(sinColores(linea(solo, 'Valor de mercado').der), '[^12%] 10g 00s 00c (app, hace 17 min)');
  assert.equal(sinColores(linea(solo, SALEN).der), 'hasta 2.054');
  sinErrores(m);
});

test('una réplica vieja del servidor no pasa por de ahora ni gana a una foto de la app: dice que es del escaneo y cuándo se leyó', () => {
  // A las hh:40 se abre la subasta: alAbrir ya cargó la foto de esta hora (hh:22) y la réplica trae la foto vieja.
  const m = maquina({ escaneo: false, ranuras: F1 });
  m.lua(REPLICA_VIEJA);
  m.disparar('AUCTION_HOUSE_SHOW');
  escaneoCompleto(m);
  assert.equal(m.lua('SnetForever.Escaneo.datos()[2589].origen'), 'replica');
  pasar(m, 5 * 60);
  // Cinco minutos después: la réplica (leída hace 5 min) no gana a la foto de la app, que sale entera con su hora.
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'A la venta').der), '26371 unidades, 290 subastas (app, hace 22 min)');
  assert.equal(sinColores(linea(d, 'Compra mínima').der), '21c');
  assert.equal(sinColores(linea(d, 'Valor de mercado').der), '[0%] 28c');
  // Lo que solo trae la réplica sale, pero dice que es del escaneo y cuándo se leyó (no «de ahora»).
  const s = ver(m, 6000);
  assert.equal(sinColores(linea(s, 'A la venta').der), '4 unidades (escaneo, leído hace 5 min)');
  assert.equal(sinColores(linea(s, 'Compra mínima').der), '50c');
  sinErrores(m);
});

test('tras leer en Navegar la lista entera de un objeto, el tooltip enseña su mínimo y sus unidades y dice que son de la subasta, ahora', () => {
  // La lista de la captura: 278×25c, 165×26c, 721×27c, 5487×28c, 1007×29c, 3463×30c y más filas hasta 26446 unidades. La
  // fila de navegar (el resumen del servidor) dice 20c: es la foto vieja.
  const m = maquina({ escaneo: false, ranuras: F1 });
  m.lua(`BANCO.ponerSubasta({
    navegar = {{itemID = 2589, totalQuantity = 26446, minPrice = 20}},
    mercancias = {[2589] = {{quantity = 278, unitPrice = 25}, {quantity = 165, unitPrice = 26}, {quantity = 721, unitPrice = 27},
      {quantity = 5487, unitPrice = 28}, {quantity = 1007, unitPrice = 29}, {quantity = 3463, unitPrice = 30},
      {quantity = 5000, unitPrice = 31}, {quantity = 5000, unitPrice = 32}, {quantity = 5325, unitPrice = 35}}},
  })`);
  m.disparar('AUCTION_HOUSE_SHOW');
  escaneoCompleto(m);
  assert.equal(m.lua('SnetForever.Busqueda.buscar("paño")'), true);
  assert.ok(esperarA(m, () => m.lua('SnetForever.Busqueda.estado()') === 'completa', 40));
  assert.equal(m.lua('SnetForever.Busqueda.pedirSubastas(2589, {leer = true})'), true);
  assert.ok(esperarA(m, () => m.lua('SnetForever.Busqueda.leyendo()') === false, 40));
  // Lo mismo que la fila de Navegar: su compra mínima y sus unidades.
  const fila = m.lua('SnetForever.Busqueda.resultados()[1]');
  assert.deepEqual([fila.resumen.minimo, fila.resumen.disponible, fila.resumen.completa], [25, 26446, true]);
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'A la venta').der), '26446 unidades (subasta, ahora mismo)');
  assert.equal(sinColores(linea(d, 'Compra mínima').der), '25c');
  assert.equal(sinColores(linea(d, 'Valor de mercado').der), '[0%] 28c (app, hace 17 min)');
  // Pasado un rato, la misma lista dice de cuándo es.
  pasar(m, 3 * 60);
  assert.equal(sinColores(linea(ver(m, 2589), 'A la venta').der), '26446 unidades (subasta, hace 3 min)');
  // Al cerrar la subasta deja de ser de ahora: vuelve la foto de la app.
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(sinColores(linea(ver(m, 2589), 'A la venta').der), '26371 unidades, 290 subastas (app, hace 20 min)');
  sinErrores(m);
});

test('dos fotos seguidas de la app: cada una sale entera con su hace', () => {
  // A las hh:30, sin subasta: la consulta carga la foto de la hora anterior.
  const m = maquina({ cargar: false, escaneo: false, minuto: 30, ranuras: F1 });
  const antes = ver(m, 2589);
  assert.equal(sinColores(linea(antes, 'A la venta').der), '26446 unidades, 300 subastas (app, hace 1 h)');
  assert.equal(sinColores(linea(antes, 'Compra mínima').der), '20c');
  // A las hh:40 se abre la subasta: alAbrir carga la foto de esta hora y la réplica trae la foto vieja (26446 a 20c).
  pasar(m, 10 * 60);
  m.lua(REPLICA_VIEJA);
  m.disparar('AUCTION_HOUSE_SHOW');
  escaneoCompleto(m);
  const despues = ver(m, 2589);
  assert.equal(sinColores(linea(despues, 'A la venta').der), '26371 unidades, 290 subastas (app, hace 17 min)');
  assert.equal(sinColores(linea(despues, 'Compra mínima').der), '21c', 'la réplica de la foto vieja no se mezcla con la foto nueva');
  sinErrores(m);
});

// Otro caso del juego (datos inventados de la misma forma). La barra de Navegar decía «Leyendo 18 / 223» (la lectura de fondo
// de todos los objetos, uno tras otro), pero la lista de cada objeto ya leído estaba entera. El tooltip decía:
//   lana: «A la venta 17842 unidades (ahora mismo) · Compra mínima 1s 70c» con la lista en 19293 unidades desde 1s 64c;
//   lino: «26381 unidades (ahora mismo) · 22c» con la lista en 30017 unidades desde 25c.
// Era la réplica, recién leída, que se vendía como de ahora y con un mínimo que la lista ya no tenía.
test('caso del juego (lana y lino): con la lista de cada objeto ya leída y la lectura de fondo aún en marcha, el tooltip da el mínimo y las unidades de la lista, de ahora, y nunca llama «ahora mismo» a una réplica', () => {
  const ranuras = {
    antes: F1.antes,
    ahora: { 114: { ...F1.ahora[114], 2592: [159, 14813, 191, 0, 0.4, 80, 0, 377, 1] } },
  };
  const m = maquina({ escaneo: false, ranuras });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1 });
  m.lua(`BANCO.ponerSubasta({
    replica = {
      {name = "Paño de lana", itemID = 2592, count = 17842, buyoutPrice = 17842 * 170},
      {name = "Paño de lino", itemID = 2589, count = 26381, buyoutPrice = 26381 * 22},
      {name = "Sin datos", itemID = 6000, count = 4, buyoutPrice = 200},
    },
    navegar = {{itemID = 2592, totalQuantity = 17842, minPrice = 170}, {itemID = 2589, totalQuantity = 26381, minPrice = 22}},
    mercancias = {
      [2592] = {{quantity = 293, unitPrice = 164}, {quantity = 9000, unitPrice = 170}, {quantity = 10000, unitPrice = 180}},
      [2589] = {{quantity = 1017, unitPrice = 25}, {quantity = 9000, unitPrice = 26}, {quantity = 20000, unitPrice = 28}},
    },
  })`);
  m.disparar('AUCTION_HOUSE_SHOW');
  escaneoCompleto(m);
  assert.equal(m.lua('SnetForever.Escaneo.datos()[2592].origen'), 'replica');
  // Una réplica recién leída dice que es del escaneo, y nunca «ahora mismo» (eso es solo la lista).
  const solo = sinColores(linea(ver(m, 6000), 'A la venta').der);
  assert.equal(solo, '4 unidades (escaneo, leído hace menos de 1 min)');
  assert.ok(!solo.includes('ahora mismo'), solo);
  // La lectura de fondo: la lana ya está leída (su lista, entera) y el lino va en camino.
  assert.equal(m.lua('SnetForever.Busqueda.buscar("paño")'), true);
  assert.ok(esperarA(m, () => m.lua('SnetForever.Busqueda.estado()') === 'completa', 40));
  assert.equal(m.lua('SnetForever.Busqueda.pedirSubastas(2592, {leer = true})'), true);
  assert.ok(esperarA(m, () => m.lua('SnetForever.Busqueda.leyendo()') === false, 40));
  assert.equal(m.lua('SnetForever.Busqueda.pedirSubastas(2589, {leer = true})'), true);
  assert.equal(m.lua('SnetForever.Busqueda.leyendo()'), true, 'la lectura de fondo sigue (el lino aún no ha llegado)');
  // La lana: lo de su lista, de ahora, aunque la lectura de los demás siga.
  const lana = ver(m, 2592);
  assert.equal(sinColores(linea(lana, 'A la venta').der), '19293 unidades (subasta, ahora mismo)');
  assert.equal(sinColores(linea(lana, 'Compra mínima').der), '1s 64c', 'el mínimo de la lista, no el 1s 70c de la réplica');
  assert.equal(sinColores(linea(lana, 'Valor de mercado').der), '[0%] 1s 91c (app, hace 17 min)');
  // El lino, aún sin su lista: la foto de la app con su hora, no la réplica (22c) como «ahora mismo».
  const linoAntes = ver(m, 2589);
  assert.equal(sinColores(linea(linoAntes, 'A la venta').der), '26371 unidades, 290 subastas (app, hace 17 min)');
  assert.equal(sinColores(linea(linoAntes, 'Compra mínima').der), '21c');
  // Llega la lista del lino: ya es la suya.
  assert.ok(esperarA(m, () => m.lua('SnetForever.Busqueda.leyendo()') === false, 40));
  const lino = ver(m, 2589);
  assert.equal(sinColores(linea(lino, 'A la venta').der), '30017 unidades (subasta, ahora mismo)');
  assert.equal(sinColores(linea(lino, 'Compra mínima').der), '25c', 'el mínimo de la lista, no el 22c de la réplica');
  assert.equal(sinColores(linea(lino, 'Valor de mercado').der), '[0%] 28c (app, hace 17 min)');
  for (const d of [lana, linoAntes, lino]) {
    const venta = sinColores(linea(d, 'A la venta').der);
    assert.ok(!/17842|26381/.test(venta), `la réplica no sale: ${venta}`);
  }
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// F1, ronda 1 (la revisión)
// ---------------------------------------------------------------------------------------------------

test('F1 ronda 1: solo la lista dice «ahora mismo»; una foto de la app de menos de un minuto dice «hace menos de 1 min»', () => {
  const m = maquina({ escaneo: false });
  m.lua('SnetForever.Precios.edad = function() return 30 end');
  const d = ver(m, 2589);
  const venta = sinColores(linea(d, 'A la venta').der);
  assert.equal(venta, '400 unidades, 37 subastas (app, hace menos de 1 min)');
  assert.ok(!venta.includes('ahora'), venta);
  // Con la lista de Navegar arriba, el «hace» de la app del valor de mercado tampoco es «ahora».
  listaImitada(m, 2589, 50000, 12, 10);
  const v = ver(m, 2589);
  assert.equal(sinColores(linea(v, 'A la venta').der), '12 unidades (subasta, ahora mismo)');
  assert.equal(sinColores(linea(v, 'Valor de mercado').der), '[^12%] 10g 00s 00c (app, hace menos de 1 min)');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(sinColores(linea(ver(m, 5004), 'On sale').der), '1 unit, 1 auction (app, under 1 min ago)');
  sinErrores(m);
});

test('F1 ronda 1: una lista entera sin ninguna que se pueda comprar (todas tuyas o solo pujas) da «A la venta» sin compra mínima ni regla', () => {
  const m = maquina({ escaneo: false });
  m.lua(GRUPO_LINO);
  m.lua(`SnetForever.Busqueda.vivo = function(i)
    if i == 2589 then return {cantidad = 15, hora = GetServerTime() - 5, origen = "lista"} end
  end`);
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'A la venta').der), '15 unidades (subasta, ahora mismo)');
  assert.ok(!linea(d, 'Compra mínima'), JSON.stringify(d));
  assert.ok(!regla(d), `sin mínimo no hay veredicto: ${JSON.stringify(d)}`);
  assert.equal(sinColores(linea(d, 'Valor de mercado').der), '[^12%] 10g 00s 00c (app, hace 17 min)', 'lo de la app sigue');
  sinErrores(m);
});

test('F1 ronda 1: un escaneo sin hora dice solo «(escaneo)», sin «leído —»', () => {
  const m = maquina({ precios: false });
  m.lua(`SnetForever.Escaneo = {estado = function() return "parado" end,
    datos = function() return {[2589] = {precio = 45000, cantidad = 20}} end}`);
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'A la venta').der), '20 unidades (escaneo)');
  assert.ok(!JSON.stringify(d).includes('—'), JSON.stringify(d));
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(sinColores(linea(ver(m, 2589), 'On sale').der), '20 units (scan)');
  sinErrores(m);
});

// F1 (ronda 2): una fuente propia con snfminimo sale de la misma foto que la compra mínima del tooltip (antes, del escaneo).
test('F1 ronda 2: una fuente propia con snfminimo da la misma compra mínima que el tooltip: la de la app, y con la lista, la de la lista', () => {
  const m = maquina(); // la app (9g 80s) y el escaneo imitado (4g 50s, leído hace 10 min)
  m.lua('assert(SnetForever.Formulas.ponerFuente("minimo", "snfminimo")); SnetForever.TooltipComercio.ponerLinea("fuente:minimo", true)');
  const d = ver(m, 2589);
  assert.equal(sinColores(linea(d, 'Fuente propia «minimo»').der), '9g 80s 00c', 'la de la app: la réplica no gana');
  assert.equal(sinColores(linea(d, 'Fuente propia «minimo»').der), sinColores(linea(d, 'Compra mínima').der));
  listaImitada(m, 2589, 50000, 12, 30);
  const v = ver(m, 2589);
  assert.equal(sinColores(linea(v, 'Fuente propia «minimo»').der), '5g 00s 00c', 'la de la lista de Navegar');
  assert.equal(sinColores(linea(v, 'Fuente propia «minimo»').der), sinColores(linea(v, 'Compra mínima').der));
  sinErrores(m);
});
