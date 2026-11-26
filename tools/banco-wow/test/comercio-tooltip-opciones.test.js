// Comercio, Task 38: las cuatro opciones de arriba de Ajustes › Tooltip y su efecto de verdad (ui/tooltip.lua):
//   · Activar (comercio.tooltip, el de «/snet comercio tooltip»);
//   · Insertarlas en el tooltip del juego (marcada por defecto; sin marcar, un tooltip aparte pegado debajo);
//   · Formato del precio: texto («345g 12s 67c», Tema.dinero) o iconos (las monedas del juego);
//   · Enseñarlo con una tecla: ninguna (siempre), Mayús, Ctrl o Alt.
// Se guardan en SnetForeverCuenta.comercio.tooltipOpciones, creada al primer cambio. Todos los datos son inventados.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000; // GetServerTime() del banco al empezar (hh:13:20)
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const foto = (h) => h * 3600 + 1357;

function ponerRanura(dir, i, objetos, generado) {
  const carpeta = join(dir, nombre(i));
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre(i)}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\np2.lua\n');
  writeFileSync(join(carpeta, 'p1.lua'), `if SNF_PRECIOS == nil or (SNF_PRECIOS.seq or 0) < 1 then
  SNF_PRECIOS = {v = 1, seq = 1, generado = ${generado}, region = "us", conocidas = {["Normal|Horde"] = 114}, casas = {}, grupos = {}, nombres = {}}
end
`);
  const lineas = ['local P = SNF_PRECIOS; if not (P and P.seq == 1) then return end', 'local c = P.casas', 'c[114] = c[114] or {}'];
  for (const [item, f] of Object.entries(objetos)) lineas.push(`c[114][${item}] = {${f.join(', ')}}`);
  lineas.push('P.completo = true');
  writeFileSync(join(carpeta, 'p2.lua'), `${lineas.join('\n')}\n`);
}

// El lino: 9g 80s de compra mínima en la app, valor de mercado 10g que sube un 12 %; el escaneo en vivo lo vio a 4g 50s (F1:
// el escaneo nunca gana a la foto de la app, así que la compra mínima es la de la app).
function maquina() {
  const dir = mkdtempSync(join(tmpdir(), 'snf-tt-opciones-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir, ranuraDeHora(H), { 2589: [98000, 400, 100000, 12, 0.42, 85, 0, 37, 1] }, foto(H));
  ponerRanura(dir, ranuraDeHora(H - 1), { 2589: [90000, 300, 95000, 0, 0.4, 80, 0] }, foto(H - 1));
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde', idioma: 'esES' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('SnetForever.Precios.alAbrir()');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.lua(`SnetForever.Escaneo = {
    estado = function() return "parado" end,
    datos = function() return {[2589] = {precio = 45000, cantidad = 20, hora = GetServerTime() - 600}} end,
  }`);
  m.lua(`local A, O = SnetForever.Arbol, SnetForever.Operaciones
    local r = A.crear(A.crear("", "Paños"), "Lino")
    assert(A.poner("i:2589", r))
    assert(O.crear("subasta", "Vender lino"))
    assert(O.ponerDeGrupo(r, "subasta", {"Vender lino"}))`);
  // El tooltip del juego, arriba a la izquierda, con su tamaño (el banco no lo calcula para GameTooltip).
  m.lua(`for _, t in ipairs({GameTooltip, ItemRefTooltip}) do
      t:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 100, -100); t:SetSize(250, 120)
    end`);
  return m;
}

const T_GENERAL = 'SnetForever · Información general';
const T_SUBASTA = 'SnetForever · Subasta';
const opcion = (m, clave) => m.lua(`SnetForever.TooltipComercio.opcion(${aLua(clave)})`);
const poner = (m, clave, valor) => m.lua(`SnetForever.TooltipComercio.ponerOpcion(${aLua(clave)}, ${aLua(valor)})`);
const izqs = (m, tooltip) => m.detalleTooltip(tooltip).map((x) => x.izq);
const ver = (m, id, tooltip) => { m.tooltipObjeto(id, tooltip); return izqs(m, tooltip); };
const existe = (m, global) => m.lua(`rawget(_G, ${aLua(global)}) ~= nil`);
const visible = (m, global) => m.lua(`local f = rawget(_G, ${aLua(global)}); return f ~= nil and f:IsVisible()`);
const linea = (m, izq, tooltip) => m.detalleTooltip(tooltip).find((x) => x.izq === izq);
const refrescos = (m) => m.llamadas('GameTooltip:RefreshData').length;
const tecla = (m, campo, pulsada, key) => m.lua(`BANCO.${campo} = ${pulsada}; BANCO.disparar("MODIFIER_STATE_CHANGED", ${aLua(key)}, ${pulsada ? 1 : 0})`);
const ORO = 'Interface\\MoneyFrame\\UI-GoldIcon';
const PLATA = 'Interface\\MoneyFrame\\UI-SilverIcon';
const COBRE = 'Interface\\MoneyFrame\\UI-CopperIcon';
const moneda = (n, ruta) => `${n}|T${ruta}:0:0:2:0|t`;

test('las opciones valen por defecto incrustado, texto y ninguna, y lo que no vale no se guarda', () => {
  const m = maquina();
  m.lua('SnetForever.Guardado.preparar(); _G.AVISOS = 0; SnetForever.escuchar("SNF_COMERCIO_TOOLTIP", function() AVISOS = AVISOS + 1 end)');
  assert.equal(opcion(m, 'incrustado'), true);
  assert.equal(opcion(m, 'formato'), 'texto');
  assert.equal(opcion(m, 'tecla'), 'ninguna');
  assert.equal(opcion(m, 'otra'), undefined, 'una clave que no existe no tiene valor');
  for (const [clave, valor] of [['formato', 'rosa'], ['tecla', 'F5'], ['incrustado', 'si'], ['incrustado', 1], ['otra', true], ['formato', null]]) {
    assert.equal(poner(m, clave, valor), false, `${clave} = ${valor}`);
  }
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipOpciones'), undefined, 'lo que no vale no crea nada');
  assert.equal(m.lua('AVISOS'), 0, 'ni avisa');
  assert.equal(poner(m, 'tecla', 'mayus'), true);
  assert.equal(opcion(m, 'tecla'), 'mayus');
  assert.equal(m.lua('AVISOS'), 1, 'cada cambio avisa con SNF_COMERCIO_TOOLTIP');
  for (const t of ['ctrl', 'alt', 'ninguna']) assert.equal(poner(m, 'tecla', t), true, t);
  assert.equal(poner(m, 'formato', 'iconos'), true);
  assert.equal(poner(m, 'incrustado', false), true);
  assert.equal(m.lua('AVISOS'), 6);
  // Un valor raro guardado (de otra versión o tocado a mano) se lee como el de por defecto.
  m.lua('SnetForeverCuenta.comercio.tooltipOpciones = {incrustado = "x", formato = 3, tecla = "F5"}');
  assert.equal(opcion(m, 'incrustado'), true);
  assert.equal(opcion(m, 'formato'), 'texto');
  assert.equal(opcion(m, 'tecla'), 'ninguna');
  m.lua('SnetForeverCuenta.comercio.tooltipOpciones = "roto"');
  assert.equal(opcion(m, 'formato'), 'texto');
  assert.equal(poner(m, 'formato', 'iconos'), true, 'y se rehace al cambiar');
  assert.deepEqual(m.lua('SnetForeverCuenta.comercio.tooltipOpciones'), { formato: 'iconos' });
  // La lista para la página de Ajustes (Task 39): las tres claves con sus valores y el de por defecto.
  assert.deepEqual(m.lua(`local r = {}
    for _, o in ipairs(SnetForever.TooltipComercio.OPCIONES) do
      local v = {}
      for i, x in ipairs(o.valores) do v[i] = tostring(x.valor) end
      r[#r + 1] = o.clave .. "=" .. tostring(o.defecto) .. ":" .. table.concat(v, ",")
    end
    return r`), ['incrustado=true:true,false', 'formato=texto:texto,iconos', 'tecla=ninguna:ninguna,mayus,ctrl,alt']);
  sinErrores(m);
});

test('las opciones se guardan en comercio.tooltipOpciones de la cuenta, sin ningún nombre de personaje', () => {
  const m = maquina();
  m.lua('SnetForever.Guardado.preparar()');
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipOpciones'), undefined, 'no está en la plantilla: se crea al primer cambio');
  assert.equal(poner(m, 'incrustado', false), true);
  assert.equal(poner(m, 'formato', 'iconos'), true);
  assert.equal(poner(m, 'tecla', 'alt'), true);
  const guardado = m.lua('SnetForeverCuenta.comercio.tooltipOpciones');
  assert.deepEqual(guardado, { incrustado: false, formato: 'iconos', tecla: 'alt' });
  const jugador = m.lua('UnitName("player")');
  const reino = m.lua('GetRealmName()');
  const texto = JSON.stringify(guardado);
  assert.ok(!texto.includes(jugador) && !texto.includes(reino), texto);
  assert.equal(poner(m, 'incrustado', true), true);
  assert.equal(m.lua('SnetForeverCuenta.comercio.tooltipOpciones.incrustado'), true);
  sinErrores(m);
});

test('sin insertar: nuestras líneas van en el tooltip aparte, pegado debajo, y el del juego no lleva ninguna; al esconder el del juego se esconde el aparte', () => {
  const m = maquina();
  ver(m, 2589);
  assert.equal(existe(m, 'SnetForeverTooltipAparte'), false, 'incrustado (por defecto) no se crea el aparte');
  assert.equal(poner(m, 'incrustado', false), true);
  assert.deepEqual(ver(m, 2589), ['Paño de lino'], 'el del juego no lleva ninguna línea nuestra');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true);
  const aparte = m.marco('SnetForeverTooltipAparte');
  assert.equal(aparte.tipo, 'GameTooltip');
  assert.equal(aparte.padre, 'UIParent');
  const enAparte = izqs(m, 'SnetForeverTooltipAparte');
  assert.equal(enAparte[0], T_GENERAL, JSON.stringify(enAparte));
  assert.ok(enAparte.includes('Grupo') && enAparte.includes(T_SUBASTA) && enAparte.includes('Compra mínima'), JSON.stringify(enAparte));
  assert.deepEqual(aparte.puntos, [{ punto: 'TOPLEFT', relativo: 'GameTooltip', relPunto: 'BOTTOMLEFT', x: 0, y: 0 }], 'pegado debajo');
  // Abajo del todo no cabe: va encima, pegado por abajo al borde de arriba del del juego.
  m.lua('GameTooltip:ClearAllPoints(); GameTooltip:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 10)');
  ver(m, 2589);
  assert.deepEqual(m.marco('SnetForeverTooltipAparte').puntos, [{ punto: 'BOTTOMLEFT', relativo: 'GameTooltip', relPunto: 'TOPLEFT', x: 0, y: 0 }]);
  // Dos llamadas al enganche: el aparte no repite nada.
  m.lua('for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do f(GameTooltip, {id = 2589, type = Enum.TooltipDataType.Item}) end');
  assert.equal(izqs(m, 'SnetForeverTooltipAparte').filter((x) => x === T_GENERAL).length, 1);
  // Esconder el del juego esconde el aparte; vaciarlo (OnTooltipCleared) también.
  m.lua('GameTooltip:Hide()');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  // Ronda 1: esconder también borra la marca: si el juego lo vuelve a enseñar con el mismo objeto sin vaciarlo, el aparte
  // vuelve a salir.
  m.lua('GameTooltip:Show(); for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do f(GameTooltip, {id = 2589, type = Enum.TooltipDataType.Item}) end');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true, 'esconder borra la marca');
  ver(m, 2589);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true);
  m.lua('GameTooltip:ClearLines()');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  // El aparte se crea una sola vez, y OnHide y OnTooltipCleared de cada tooltip del juego se enganchan una sola vez
  // (los cuenta el banco: nadie más engancha esos dos scripts).
  m.lua('rawset(_G, "PRIMERO", SnetForeverTooltipAparte)');
  ver(m, 2589);
  assert.equal(m.lua('PRIMERO == SnetForeverTooltipAparte'), true);
  const ganchos = m.llamadas('HookScript').map((a) => `${a[0]}:${a[1]}`);
  for (const t of ['GameTooltip', 'ItemRefTooltip']) {
    for (const script of ['OnHide', 'OnTooltipCleared']) {
      assert.equal(ganchos.filter((g) => g === `${t}:${script}`).length, 1, `${t}:${script} ${JSON.stringify(ganchos)}`);
    }
  }
  // Con el del juego prohibido, el aparte no se toca.
  m.lua('GameTooltip:Hide()');
  m.lua('BANCO.tooltipProhibido = true');
  ver(m, 2589);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  m.lua('BANCO.tooltipProhibido = false');
  // Volver a insertar: las líneas vuelven al del juego y el aparte se esconde.
  ver(m, 2589);
  assert.equal(poner(m, 'incrustado', true), true);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  assert.ok(ver(m, 2589).includes(T_GENERAL));
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  sinErrores(m);
});

test('sin insertar, con ItemRefTooltip: su propio aparte, y cerrarlo lo esconde', () => {
  const m = maquina();
  assert.equal(poner(m, 'incrustado', false), true);
  assert.deepEqual(ver(m, 2589, 'ItemRefTooltip'), ['Paño de lino']);
  assert.equal(visible(m, 'SnetForeverTooltipAparteRef'), true);
  assert.equal(existe(m, 'SnetForeverTooltipAparte'), false, 'el de GameTooltip no hace falta');
  assert.ok(izqs(m, 'SnetForeverTooltipAparteRef').includes(T_SUBASTA));
  assert.deepEqual(m.marco('SnetForeverTooltipAparteRef').puntos, [{ punto: 'TOPLEFT', relativo: 'ItemRefTooltip', relPunto: 'BOTTOMLEFT', x: 0, y: 0 }]);
  // Los dos a la vez, cada uno con el suyo.
  ver(m, 2589);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true);
  assert.equal(visible(m, 'SnetForeverTooltipAparteRef'), true);
  m.lua('ItemRefTooltip:Hide()');
  assert.equal(visible(m, 'SnetForeverTooltipAparteRef'), false, 'cerrar el del enlace esconde su aparte');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true, 'y no el otro');
  sinErrores(m);
});

test('formato iconos: el dinero sale con las monedas del juego; formato texto, como Tema.dinero', () => {
  const m = maquina();
  ver(m, 2589);
  assert.equal(linea(m, 'Compra mínima').der, m.lua('SnetForever.Tema.dinero(98000)'), 'texto, por defecto');
  assert.equal(poner(m, 'formato', 'iconos'), true);
  ver(m, 2589);
  assert.equal(linea(m, 'Compra mínima').der, `${moneda(9, ORO)} ${moneda(80, PLATA)} ${moneda('00', COBRE)}`);
  assert.ok(linea(m, 'Valor de mercado').der.endsWith(`${moneda(10, ORO)} ${moneda('00', PLATA)} ${moneda('00', COBRE)}`), linea(m, 'Valor de mercado').der);
  // Poco dinero: sin oro, y sin plata si no hay.
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 7 });
  ver(m, 2589);
  assert.equal(linea(m, 'Precio de venta al vendedor').der, moneda(7, COBRE));
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, precio: 250 });
  ver(m, 2589);
  assert.equal(linea(m, 'Precio de venta al vendedor').der, `${moneda(2, PLATA)} ${moneda(50, COBRE)}`);
  // Con GetCoinTextureString del juego, el suyo; si falla, el nuestro.
  m.lua('rawset(_G, "GetCoinTextureString", function(c) return "MONEDAS:" .. c end)');
  ver(m, 2589);
  assert.equal(linea(m, 'Compra mínima').der, 'MONEDAS:98000');
  m.lua('rawset(_G, "GetCoinTextureString", function(c) error("roto") end)');
  ver(m, 2589);
  assert.equal(linea(m, 'Compra mínima').der, `${moneda(9, ORO)} ${moneda(80, PLATA)} ${moneda('00', COBRE)}`);
  // componer con opciones.formato (el ejemplo de Ajustes, Task 40) manda sobre lo guardado.
  const der = m.lua(`local T = SnetForever.TooltipComercio
    local r = {}
    local salida = {titulo = function() end, linea = function() end,
      doble = function(_, izq, der) if izq == "Compra mínima" then r[1] = der end end}
    T.componer(salida, T.datos(2589), nil, {formato = "texto"})
    return r[1]`);
  assert.equal(der, m.lua('SnetForever.Tema.dinero(98000)'));
  assert.equal(poner(m, 'formato', 'texto'), true);
  ver(m, 2589);
  assert.equal(linea(m, 'Compra mínima').der, m.lua('SnetForever.Tema.dinero(98000)'));
  sinErrores(m);
});

test('con Mayús elegida: sin pulsarla no sale nada; al pulsarla, con RefreshData, el tooltip se rehace con las líneas; al soltarla se rehace sin ellas', () => {
  const m = maquina();
  assert.equal(poner(m, 'tecla', 'mayus'), true);
  assert.deepEqual(ver(m, 2589), ['Paño de lino'], 'sin pulsar, nada');
  tecla(m, 'shift', true, 'LSHIFT');
  assert.equal(refrescos(m), 1);
  let d = izqs(m);
  assert.equal(d[0], 'Paño de lino');
  assert.equal(d.filter((x) => x === T_GENERAL).length, 1, JSON.stringify(d));
  // Otra tecla (Ctrl) no cambia el estado de Mayús: no se rehace.
  tecla(m, 'ctrl', true, 'LCTRL');
  tecla(m, 'ctrl', false, 'LCTRL');
  assert.equal(refrescos(m), 1);
  tecla(m, 'shift', false, 'LSHIFT');
  assert.equal(refrescos(m), 2);
  assert.deepEqual(izqs(m), ['Paño de lino'], 'al soltar, sin ellas');
  // Con la tecla pulsada al pasar el ratón, salen directamente.
  m.lua('BANCO.shift = true');
  assert.ok(ver(m, 2589).includes(T_GENERAL));
  m.lua('BANCO.shift = false');
  // Ctrl y Alt, igual.
  assert.equal(poner(m, 'tecla', 'ctrl'), true);
  assert.deepEqual(ver(m, 2589), ['Paño de lino']);
  m.lua('BANCO.ctrl = true');
  assert.ok(ver(m, 2589).includes(T_GENERAL));
  m.lua('BANCO.ctrl = false');
  assert.equal(poner(m, 'tecla', 'alt'), true);
  m.lua('BANCO.alt = true');
  assert.ok(ver(m, 2589).includes(T_GENERAL));
  m.lua('BANCO.alt = false');
  sinErrores(m);
});

test('con Mayús y sin RefreshData: al pulsar se añaden una sola vez (sin repetidas) y en modo aparte el aparte se enseña y se esconde', () => {
  const m = maquina();
  m.lua('BANCO.estado[GameTooltip].quitados.RefreshData = true');
  assert.equal(poner(m, 'tecla', 'mayus'), true);
  assert.deepEqual(ver(m, 2589), ['Paño de lino']);
  const shows = () => m.llamadas('GameTooltip:Show').filter((a) => a[0] === 'GameTooltip').length;
  const showsAntes = shows();
  tecla(m, 'shift', true, 'LSHIFT');
  const cuenta = () => izqs(m).filter((x) => x === T_GENERAL).length;
  assert.equal(cuenta(), 1, JSON.stringify(izqs(m)));
  assert.equal(shows(), showsAntes + 1, 'ronda 1: con líneas nuevas se vuelve a llamar a Show (su tamaño y su fondo)');
  tecla(m, 'shift', true, 'RSHIFT'); // la otra Mayús con la primera pulsada: el estado no cambia
  assert.equal(cuenta(), 1);
  tecla(m, 'shift', false, 'LSHIFT');
  assert.equal(cuenta(), 1, 'al soltar se quedan hasta que se rehaga el tooltip');
  tecla(m, 'shift', true, 'LSHIFT');
  assert.equal(cuenta(), 1, 'pulsar otra vez no las repite');
  assert.equal(shows(), showsAntes + 1, 'sin líneas nuevas no hace falta otro Show');
  tecla(m, 'shift', false, 'LSHIFT');
  assert.equal(refrescos(m), 0);
  // Modo aparte: pulsar lo enseña y soltar lo esconde; el del juego nunca lleva nada.
  assert.equal(poner(m, 'incrustado', false), true);
  assert.deepEqual(ver(m, 2589), ['Paño de lino']);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  tecla(m, 'shift', true, 'LSHIFT');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true);
  assert.equal(izqs(m, 'SnetForeverTooltipAparte').filter((x) => x === T_GENERAL).length, 1);
  assert.deepEqual(izqs(m), ['Paño de lino']);
  tecla(m, 'shift', false, 'LSHIFT');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  tecla(m, 'shift', true, 'LSHIFT');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true);
  assert.equal(izqs(m, 'SnetForeverTooltipAparte').filter((x) => x === T_GENERAL).length, 1, 'sin repetidas');
  tecla(m, 'shift', false, 'LSHIFT');
  sinErrores(m);
});

// Task 39 (lo decide el controlador): la tecla solo vale para GameTooltip, el de pasar el ratón. Un enlace del chat abierto
// con un clic (ItemRefTooltip) se queda fijo mientras se lee y no se puede tener la tecla pulsada a la vez: enseña nuestras
// líneas siempre que «Activar» esté encendido.
test('la tecla solo vale al pasar el ratón: un enlace del chat (ItemRefTooltip) enseña las líneas sin pulsarla', () => {
  const m = maquina();
  assert.equal(poner(m, 'tecla', 'mayus'), true);
  assert.deepEqual(ver(m, 2589), ['Paño de lino'], 'GameTooltip sin la tecla: nada');
  const ref = ver(m, 2589, 'ItemRefTooltip');
  assert.equal(ref.filter((x) => x === T_GENERAL).length, 1, JSON.stringify(ref));
  assert.ok(ref.includes(T_SUBASTA), JSON.stringify(ref));
  // Pulsar y soltar la tecla no toca el del enlace (ni lo repite ni se lo quita).
  tecla(m, 'shift', true, 'LSHIFT');
  tecla(m, 'shift', false, 'LSHIFT');
  assert.equal(izqs(m, 'ItemRefTooltip').filter((x) => x === T_GENERAL).length, 1);
  // Las otras teclas, igual.
  for (const t of ['ctrl', 'alt']) {
    assert.equal(poner(m, 'tecla', t), true);
    assert.ok(ver(m, 2589, 'ItemRefTooltip').includes(T_GENERAL), t);
  }
  // En modo aparte, el del enlace saca su aparte; el de GameTooltip no sale sin la tecla.
  assert.equal(poner(m, 'incrustado', false), true);
  assert.deepEqual(ver(m, 2589, 'ItemRefTooltip'), ['Paño de lino']);
  assert.equal(visible(m, 'SnetForeverTooltipAparteRef'), true);
  assert.ok(izqs(m, 'SnetForeverTooltipAparteRef').includes(T_GENERAL));
  ver(m, 2589);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  // Con «Activar» apagado, tampoco el del enlace.
  assert.equal(poner(m, 'incrustado', true), true);
  m.lua('SnetForever.TooltipComercio.ponerActivo(false)');
  assert.deepEqual(ver(m, 2589, 'ItemRefTooltip'), ['Paño de lino']);
  sinErrores(m);
});

test('el marco de la tecla no usa OnUpdate y no hace nada con el tooltip escondido', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.TooltipComercio.marcoTecla:GetScript("OnUpdate") == nil'), true);
  assert.equal(m.lua('SnetForever.TooltipComercio.marcoTecla:IsEventRegistered("MODIFIER_STATE_CHANGED")'), true);
  // Ningún marco del tooltip lleva OnUpdate (tampoco el aparte).
  assert.equal(poner(m, 'incrustado', false), true);
  ver(m, 2589);
  assert.equal(m.lua('SnetForeverTooltipAparte:GetScript("OnUpdate") == nil'), true);
  assert.equal(poner(m, 'tecla', 'mayus'), true);
  ver(m, 2589);
  m.lua('GameTooltip:Hide()');
  tecla(m, 'shift', true, 'LSHIFT');
  assert.equal(refrescos(m), 0, 'escondido: no se rehace');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  tecla(m, 'shift', false, 'LSHIFT');
  // A la vista pero sin objeto (un tooltip de otra cosa): tampoco.
  m.lua('GameTooltip:SetOwner(UIParent, "ANCHOR_NONE"); GameTooltip:SetText("Hola"); GameTooltip:Show()');
  tecla(m, 'shift', true, 'LSHIFT');
  assert.equal(refrescos(m), 0);
  assert.deepEqual(izqs(m), ['Hola']);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  tecla(m, 'shift', false, 'LSHIFT');
  // Sin tecla elegida, pulsar no hace nada.
  assert.equal(poner(m, 'tecla', 'ninguna'), true);
  assert.equal(poner(m, 'incrustado', true), true);
  ver(m, 2589);
  tecla(m, 'shift', true, 'LSHIFT');
  tecla(m, 'shift', false, 'LSHIFT');
  assert.equal(refrescos(m), 0);
  sinErrores(m);
});

test('apagar Activar no deja nada, tampoco el aparte', () => {
  const m = maquina();
  assert.equal(poner(m, 'incrustado', false), true);
  ver(m, 2589);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true);
  m.lua('SnetForever.TooltipComercio.ponerActivo(false)');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false, 'se esconde en el momento');
  assert.deepEqual(ver(m, 2589), ['Paño de lino']);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  // Ni con la tecla.
  assert.equal(poner(m, 'tecla', 'mayus'), true);
  ver(m, 2589);
  tecla(m, 'shift', true, 'LSHIFT');
  assert.deepEqual(izqs(m), ['Paño de lino']);
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
  tecla(m, 'shift', false, 'LSHIFT');
  // Insertado y apagado, tampoco.
  assert.equal(poner(m, 'incrustado', true), true);
  assert.equal(poner(m, 'tecla', 'ninguna'), true);
  assert.deepEqual(ver(m, 2589), ['Paño de lino']);
  m.lua('SnetForever.TooltipComercio.ponerActivo(true)');
  assert.ok(ver(m, 2589).includes(T_GENERAL));
  sinErrores(m);
});

for (const sinLimpiar of [false, true]) {
  test(`ronda 1: con RefreshData y sin insertar, soltar la tecla esconde el aparte ${sinLimpiar ? 'aunque RefreshData no lance OnTooltipCleared' : '(RefreshData lanza OnTooltipCleared)'}`, () => {
    const m = maquina();
    m.lua(`BANCO.refrescoSinLimpiar = ${sinLimpiar}`);
    assert.equal(poner(m, 'incrustado', false), true);
    assert.equal(poner(m, 'tecla', 'mayus'), true);
    assert.deepEqual(ver(m, 2589), ['Paño de lino']);
    assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
    for (let vuelta = 1; vuelta <= 2; vuelta++) {
      tecla(m, 'shift', true, 'LSHIFT');
      assert.equal(visible(m, 'SnetForeverTooltipAparte'), true, `vuelta ${vuelta}: al pulsar, el aparte`);
      assert.equal(izqs(m, 'SnetForeverTooltipAparte').filter((x) => x === T_GENERAL).length, 1, 'sin repetidas');
      assert.deepEqual(izqs(m), ['Paño de lino'], 'el del juego no lleva nada');
      tecla(m, 'shift', false, 'LSHIFT');
      assert.equal(visible(m, 'SnetForeverTooltipAparte'), false, `vuelta ${vuelta}: al soltar se esconde`);
    }
    assert.equal(refrescos(m), 4);
    sinErrores(m);
  });
}

test('ronda 1: cambiar entre insertado y aparte borra la marca: el tooltip a la vista se rehace en el nuevo modo', () => {
  const m = maquina();
  assert.ok(ver(m, 2589).includes(T_GENERAL), 'insertado');
  assert.equal(poner(m, 'incrustado', false), true);
  m.lua('for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do f(GameTooltip, {id = 2589, type = Enum.TooltipDataType.Item}) end');
  assert.equal(visible(m, 'SnetForeverTooltipAparte'), true, 'el enganche otra vez con el mismo objeto ya va al aparte');
  sinErrores(m);
});

// F8: el tooltip abierto se pone al día cuando llega la lista entera de ese objeto. La lista se imita con vivo y versionVivo
// (una tabla nueva por lista, como Vivo.apuntar) y el aviso de verdad, SNF_COMERCIO_BUSQUEDA.
const conListas = (m) => m.lua(`_G.LISTAS, _G.VERSION = {}, 0
  SnetForever.Busqueda.vivo = function(i) return LISTAS[i] end
  SnetForever.Busqueda.versionVivo = function() return VERSION end`);
const llegaLista = (m, item, precio, cantidad) => m.lua(`VERSION = VERSION + 1
  LISTAS[${item}] = {precio = ${precio}, cantidad = ${cantidad}, hora = GetServerTime(), origen = "lista"}
  SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "lista")`);
const dice = (m, cantidad, precio, tooltip) => {
  const unidades = `${m.lua(`SnetForever.Texto.numero(${cantidad})`)} unidades`;
  const venta = linea(m, 'A la venta', tooltip);
  assert.ok(venta && venta.der.includes(unidades), `${unidades} en ${JSON.stringify(venta)}`);
  assert.equal(linea(m, 'Compra mínima', tooltip).der, m.lua(`SnetForever.Tema.dinero(${precio})`));
};
const sinRepetidas = (m, tooltip) => {
  const d = izqs(m, tooltip);
  for (const x of [T_GENERAL, T_SUBASTA, 'A la venta', 'Compra mínima']) {
    assert.equal(d.filter((y) => y === x).length, 1, `${x}: ${JSON.stringify(d)}`);
  }
};
const refrescosDe = (m, nombreTooltip) => m.llamadas('GameTooltip:RefreshData').filter((a) => a[0] === nombreTooltip).length;
const vigilarHide = (m, global) => m.lua(`_G.ESCONDIDOS = rawget(_G, "ESCONDIDOS") or {}; ESCONDIDOS.${global} = 0
  ${global}:HookScript("OnHide", function() ESCONDIDOS.${global} = ESCONDIDOS.${global} + 1 end)`);
const escondido = (m, global) => m.lua(`ESCONDIDOS.${global}`);
const ponerNatural = (m, global, ancho, margen = 0) => m.lua(`local e = BANCO.estado[${global}]; e.anchoNatural = ${ancho}; e.margenMinimo = ${margen}`);
const ancho = (m, global) => m.lua(`${global}:GetWidth()`);

test('con el ratón sobre un objeto, al llegar su lista nueva el tooltip enseña los números nuevos, sin líneas repetidas', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  ver(m, 2589);
  dice(m, 14612, 130);
  m.avanzar(1);
  llegaLista(m, 2589, 181, 14384);
  dice(m, 14384, 181);
  sinRepetidas(m);
  assert.equal(refrescos(m), 1, 'un solo repintado por la lista nueva');
  // El mismo aviso otra vez, sin lista nueva, no hace nada.
  m.avanzar(1);
  m.lua('SnetForever.emitir("SNF_COMERCIO_BUSQUEDA", "lista")');
  assert.equal(refrescos(m), 1);
  sinErrores(m);
});

test('una lista de otro objeto no toca el tooltip abierto', () => {
  const m = maquina();
  m.itemInfo(5000, { nombre: 'Otro objeto', calidad: 1 });
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  ver(m, 2589);
  const antes = JSON.stringify(m.detalleTooltip());
  m.avanzar(1);
  llegaLista(m, 5000, 999, 7);
  assert.equal(refrescos(m), 0);
  assert.equal(JSON.stringify(m.detalleTooltip()), antes);
  // Escondido, tampoco; ni con la lista de su objeto.
  m.lua('GameTooltip:Hide()');
  llegaLista(m, 2589, 181, 14384);
  assert.equal(refrescos(m), 0, 'sin tooltip a la vista no se hace nada');
  // A la vista con otra cosa que no es un objeto, tampoco.
  m.lua('GameTooltip:SetOwner(UIParent, "ANCHOR_NONE"); GameTooltip:SetText("Hola"); GameTooltip:Show()');
  llegaLista(m, 2589, 200, 14000);
  assert.equal(refrescos(m), 0);
  assert.deepEqual(izqs(m), ['Hola']);
  sinErrores(m);
});

test('varias listas seguidas dan como mucho un repintado cada 0,5 s y el último deja los números buenos', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  ver(m, 2589);
  m.avanzar(1);
  llegaLista(m, 2589, 140, 14600);
  assert.equal(refrescos(m), 1, 'la primera, en el momento');
  const pendientes = m.lua('#BANCO.temporizadores');
  llegaLista(m, 2589, 150, 14500);
  llegaLista(m, 2589, 160, 14400);
  m.avanzar(0.2);
  llegaLista(m, 2589, 181, 14384);
  assert.equal(refrescos(m), 1, 'dentro de la espera no se repinta');
  assert.equal(m.lua('#BANCO.temporizadores'), pendientes + 1, 'una sola espera, por muchas listas que lleguen');
  dice(m, 14600, 140);
  m.avanzar(0.25);
  assert.equal(refrescos(m), 1, 'a los 0,45 s, todavía no');
  m.avanzar(0.05);
  assert.equal(refrescos(m), 2, 'a los 0,5 s, la última');
  dice(m, 14384, 181);
  sinRepetidas(m);
  m.avanzar(3);
  assert.equal(refrescos(m), 2, 'y ya no vuelve a pintar');
  // Abrir el tooltip también cuenta como pintar: una lista justo después espera su turno.
  m.lua('GameTooltip:Hide()');
  ver(m, 2589);
  llegaLista(m, 2589, 190, 14300);
  assert.equal(refrescos(m), 2);
  m.avanzar(0.5);
  assert.equal(refrescos(m), 3);
  dice(m, 14300, 190);
  // Si durante la espera se va el ratón, el temporizador no pinta nada.
  m.avanzar(1);
  llegaLista(m, 2589, 200, 14200);
  assert.equal(refrescos(m), 4);
  llegaLista(m, 2589, 210, 14100);
  m.lua('GameTooltip:Hide()');
  m.avanzar(1);
  assert.equal(refrescos(m), 4);
  sinErrores(m);
});

test('si los números no cambian no se repinta', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  ver(m, 2589);
  const antes = JSON.stringify(m.detalleTooltip());
  m.avanzar(1);
  llegaLista(m, 2589, 130, 14612);
  m.avanzar(1);
  assert.equal(refrescos(m), 0);
  assert.equal(JSON.stringify(m.detalleTooltip()), antes);
  // Con las líneas de la subasta apagadas tampoco hay nada que cambiar.
  m.lua('local T = SnetForever.TooltipComercio; T.ponerLinea("aLaVenta", false); T.ponerLinea("minima", false); T.ponerLinea("regla", false)');
  ver(m, 2589);
  m.avanzar(1);
  llegaLista(m, 2589, 181, 14384);
  assert.equal(refrescos(m), 0, 'el cambio no se ve en ninguna línea');
  sinErrores(m);
});

test('el tooltip no se esconde ni se mueve al repintar, con RefreshData y sin él', () => {
  // Con RefreshData, insertado. El mínimo del cliente puede contar el margen o no: el ancho no cambia de las dos formas.
  for (const margen of [0, 16]) {
    const m = maquina();
    conListas(m);
    vigilarHide(m, 'GameTooltip');
    llegaLista(m, 2589, 130, 14612);
    ponerNatural(m, 'GameTooltip', 250, margen);
    ver(m, 2589);
    m.lua('GameTooltip:Show()');
    const puntos = JSON.stringify(m.marco('GameTooltip').puntos);
    assert.equal(ancho(m, 'GameTooltip'), 250);
    m.avanzar(1);
    ponerNatural(m, 'GameTooltip', 200, margen); // los números nuevos piden menos ancho
    llegaLista(m, 2589, 181, 14384);
    dice(m, 14384, 181);
    assert.equal(ancho(m, 'GameTooltip'), 250, `no encoge (margen ${margen})`);
    assert.equal(escondido(m, 'GameTooltip'), 0);
    assert.equal(m.lua('GameTooltip:IsVisible()'), true);
    assert.equal(JSON.stringify(m.marco('GameTooltip').puntos), puntos);
    m.avanzar(1);
    ponerNatural(m, 'GameTooltip', 300, margen);
    llegaLista(m, 2589, 182, 14383);
    assert.equal(ancho(m, 'GameTooltip'), 300, 'puede crecer');
    m.avanzar(1);
    ponerNatural(m, 'GameTooltip', 200, margen);
    llegaLista(m, 2589, 183, 14382);
    assert.equal(ancho(m, 'GameTooltip'), 300, 'y lo crecido no vuelve a encoger');
    m.lua('GameTooltip:Hide()');
    assert.equal(m.lua('GameTooltip:GetMinimumWidth()'), 0, 'al irse el ratón, el mínimo vuelve a como estaba');
    sinErrores(m);
  }
  // Sin RefreshData e insertado: nuestras líneas no se pueden sustituir. Se queda como está, sin repetidas, hasta la próxima vez.
  {
    const m = maquina();
    m.lua('BANCO.estado[GameTooltip].quitados.RefreshData = true');
    conListas(m);
    vigilarHide(m, 'GameTooltip');
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589);
    const antes = JSON.stringify(m.detalleTooltip());
    const puntos = JSON.stringify(m.marco('GameTooltip').puntos);
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    m.avanzar(1);
    assert.equal(JSON.stringify(m.detalleTooltip()), antes, 'ni líneas repetidas ni a medias');
    assert.equal(escondido(m, 'GameTooltip'), 0);
    assert.equal(JSON.stringify(m.marco('GameTooltip').puntos), puntos);
    m.lua('GameTooltip:Hide()');
    ver(m, 2589);
    dice(m, 14384, 181);
    sinRepetidas(m);
    sinErrores(m);
  }
  // Sin RefreshData y con el tooltip aparte: el aparte es nuestro y se rehace en su sitio, sin SetOwner ni anclarlo otra vez.
  {
    const m = maquina();
    m.lua('BANCO.estado[GameTooltip].quitados.RefreshData = true');
    conListas(m);
    assert.equal(poner(m, 'incrustado', false), true);
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589);
    vigilarHide(m, 'GameTooltip');
    vigilarHide(m, 'SnetForeverTooltipAparte');
    ponerNatural(m, 'SnetForeverTooltipAparte', 260);
    m.lua('SnetForeverTooltipAparte:Show()');
    m.lua(`_G.ANCLAJES = 0
      for _, n in ipairs({"SetPoint", "ClearAllPoints"}) do
        local f = SnetForeverTooltipAparte[n]
        rawset(SnetForeverTooltipAparte, n, function(...) ANCLAJES = ANCLAJES + 1; return f(...) end)
      end`);
    const puntos = JSON.stringify(m.marco('SnetForeverTooltipAparte').puntos);
    const duenos = m.llamadas('GameTooltip:SetOwner').length;
    m.avanzar(1);
    ponerNatural(m, 'SnetForeverTooltipAparte', 210);
    llegaLista(m, 2589, 181, 14384);
    dice(m, 14384, 181, 'SnetForeverTooltipAparte');
    sinRepetidas(m, 'SnetForeverTooltipAparte');
    assert.equal(escondido(m, 'SnetForeverTooltipAparte'), 0);
    assert.equal(escondido(m, 'GameTooltip'), 0);
    assert.equal(m.llamadas('GameTooltip:SetOwner').length, duenos, 'SetOwner vaciaría y podría esconder el aparte');
    assert.equal(m.lua('ANCLAJES'), 0, 'no se vuelve a anclar');
    assert.equal(JSON.stringify(m.marco('SnetForeverTooltipAparte').puntos), puntos);
    assert.equal(ancho(m, 'SnetForeverTooltipAparte'), 260, 'el aparte tampoco encoge');
    assert.deepEqual(izqs(m), ['Paño de lino'], 'el del juego sigue sin ninguna línea nuestra');
    sinErrores(m);
  }
});

test('con el tooltip aparte y con ItemRefTooltip también se pone al día', () => {
  // El aparte de GameTooltip: no hace falta rehacer el del juego.
  {
    const m = maquina();
    conListas(m);
    assert.equal(poner(m, 'incrustado', false), true);
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589);
    dice(m, 14612, 130, 'SnetForeverTooltipAparte');
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    dice(m, 14384, 181, 'SnetForeverTooltipAparte');
    sinRepetidas(m, 'SnetForeverTooltipAparte');
    assert.equal(refrescos(m), 0, 'con el aparte, el tooltip del juego no se toca');
    sinErrores(m);
  }
  // ItemRefTooltip insertado, a la vez que GameTooltip con otro objeto.
  {
    const m = maquina();
    m.itemInfo(5000, { nombre: 'Otro objeto', calidad: 1 });
    conListas(m);
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589, 'ItemRefTooltip');
    ver(m, 5000);
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    dice(m, 14384, 181, 'ItemRefTooltip');
    sinRepetidas(m, 'ItemRefTooltip');
    assert.equal(refrescosDe(m, 'ItemRefTooltip'), 1);
    assert.equal(refrescosDe(m, 'GameTooltip'), 0, 'el otro enseña otro objeto');
    sinErrores(m);
  }
  // ItemRefTooltip con su aparte.
  {
    const m = maquina();
    conListas(m);
    assert.equal(poner(m, 'incrustado', false), true);
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589, 'ItemRefTooltip');
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    dice(m, 14384, 181, 'SnetForeverTooltipAparteRef');
    sinRepetidas(m, 'SnetForeverTooltipAparteRef');
    sinErrores(m);
  }
});

test('con una tecla elegida y sin pulsar no aparece nada al llegar la lista', () => {
  for (const incrustado of [true, false]) {
    const m = maquina();
    conListas(m);
    assert.equal(poner(m, 'incrustado', incrustado), true);
    assert.equal(poner(m, 'tecla', 'mayus'), true);
    llegaLista(m, 2589, 130, 14612);
    assert.deepEqual(ver(m, 2589), ['Paño de lino']);
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    m.avanzar(1);
    assert.equal(refrescos(m), 0);
    assert.deepEqual(izqs(m), ['Paño de lino']);
    assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
    // Al pulsarla salen ya con los números nuevos.
    tecla(m, 'shift', true, 'LSHIFT');
    dice(m, 14384, 181, incrustado ? undefined : 'SnetForeverTooltipAparte');
    // Y con la tecla soltada otra vez, una lista nueva tampoco saca nada.
    tecla(m, 'shift', false, 'LSHIFT');
    const tras = refrescos(m);
    m.avanzar(1);
    llegaLista(m, 2589, 190, 14300);
    m.avanzar(1);
    assert.equal(refrescos(m), tras);
    assert.deepEqual(izqs(m), ['Paño de lino']);
    assert.equal(visible(m, 'SnetForeverTooltipAparte'), false);
    sinErrores(m);
  }
  // Un cliente cuyo RefreshData no lanza OnTooltipCleared: la marca sigue ahí con la tecla ya soltada, y aun así no se repinta.
  {
    const m = maquina();
    m.lua('BANCO.refrescoSinLimpiar = true');
    conListas(m);
    assert.equal(poner(m, 'tecla', 'mayus'), true);
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589);
    tecla(m, 'shift', true, 'LSHIFT');
    tecla(m, 'shift', false, 'LSHIFT');
    const tras = refrescos(m);
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    m.avanzar(1);
    assert.equal(refrescos(m), tras, 'sin pulsar, ni un repintado');
    assert.deepEqual(izqs(m), ['Paño de lino']);
    sinErrores(m);
  }
  // Elegir la tecla con el tooltip ya abierto: lo que se ve se queda como está, no desaparece por llegar una lista.
  for (const incrustado of [true, false]) {
    const m = maquina();
    conListas(m);
    assert.equal(poner(m, 'incrustado', incrustado), true);
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589);
    const donde = incrustado ? undefined : 'SnetForeverTooltipAparte';
    assert.equal(poner(m, 'tecla', 'mayus'), true);
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    m.avanzar(1);
    assert.equal(refrescos(m), 0);
    dice(m, 14612, 130, donde);
    if (!incrustado) assert.equal(visible(m, 'SnetForeverTooltipAparte'), true);
    sinErrores(m);
  }
});

// RefreshData puede rehacer las líneas sin lanzar OnTooltipCleared (no está comprobado en el cliente): tampoco hay repetidas.
test('F8: con un RefreshData que no lanza OnTooltipCleared, los números nuevos salen sin líneas repetidas', () => {
  const m = maquina();
  m.lua('BANCO.refrescoSinLimpiar = true');
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  ver(m, 2589);
  m.avanzar(1);
  llegaLista(m, 2589, 181, 14384);
  dice(m, 14384, 181);
  sinRepetidas(m);
  assert.equal(refrescos(m), 1);
  sinErrores(m);
});

test('F8: con el tooltip prohibido o con «Activar» apagado, una lista nueva no toca nada', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  ver(m, 2589);
  const antes = JSON.stringify(m.detalleTooltip());
  m.avanzar(1);
  m.lua('BANCO.tooltipProhibido = true');
  llegaLista(m, 2589, 181, 14384);
  m.avanzar(1);
  m.lua('BANCO.tooltipProhibido = false');
  assert.equal(refrescos(m), 0);
  assert.equal(JSON.stringify(m.detalleTooltip()), antes);
  m.lua('SnetForever.TooltipComercio.ponerActivo(false)');
  llegaLista(m, 2589, 190, 14300);
  m.avanzar(1);
  assert.equal(refrescos(m), 0);
  assert.equal(JSON.stringify(m.detalleTooltip()), antes);
  sinErrores(m);
});

// F8, ronda 1 (la revisión).
const filaConVendedor = (m) => m.lua(`_G.FILA = CreateFrame("Button", "FilaF8", UIParent); FILA:SetSize(100, 20); FILA:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -10)
  SnetForever.UIComercio.tooltipObjeto(FILA, {item = 2589, clave = "k", lineas = function(tt) tt:AddLine("Vendedor: Fulano"); tt:AddLine("Compra 1s 81c") end})`);
const veces = (m, texto, tooltip) => izqs(m, tooltip).filter((x) => x === texto).length;

test('F8 ronda 1: las líneas propias de una fila siguen al repintar, una vez cada una y detrás de las nuestras', () => {
  for (const sinLimpiar of [false, true]) {
    const m = maquina();
    m.lua(`BANCO.refrescoSinLimpiar = ${sinLimpiar}`);
    conListas(m);
    llegaLista(m, 2589, 130, 14612);
    filaConVendedor(m);
    assert.equal(veces(m, 'Vendedor: Fulano'), 1);
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    dice(m, 14384, 181);
    sinRepetidas(m);
    assert.equal(refrescos(m), 1);
    assert.equal(veces(m, 'Vendedor: Fulano'), 1, 'el vendedor sigue, una vez');
    assert.equal(veces(m, 'Compra 1s 81c'), 1);
    const d = izqs(m);
    assert.ok(d.indexOf('Vendedor: Fulano') > d.indexOf('A la venta'), JSON.stringify(d));
    // Una segunda lista: otra vez, sin acumular.
    m.avanzar(1);
    llegaLista(m, 2589, 190, 14300);
    assert.equal(refrescos(m), 2);
    assert.equal(veces(m, 'Vendedor: Fulano'), 1);
    sinErrores(m);
  }
});

test('F8 ronda 1: con un RefreshData que no rehace nada, las líneas de la fila no se repiten', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  filaConVendedor(m);
  m.lua('rawset(GameTooltip, "RefreshData", function() end)');
  const antes = JSON.stringify(m.detalleTooltip());
  m.avanzar(1);
  llegaLista(m, 2589, 181, 14384);
  assert.equal(veces(m, 'Vendedor: Fulano'), 1);
  assert.equal(JSON.stringify(m.detalleTooltip()), antes);
  sinErrores(m);
});

test('F8 ronda 1: al irse el ratón se olvidan las líneas de la fila: ni se guardan ni salen en el tooltip siguiente', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  filaConVendedor(m);
  m.lua('GameTooltip:Hide()');
  ver(m, 2589); // el mismo objeto, ahora desde la bolsa
  m.avanzar(1);
  llegaLista(m, 2589, 181, 14384);
  dice(m, 14384, 181);
  assert.equal(veces(m, 'Vendedor: Fulano'), 0, 'lo de la fila no pasa a otro tooltip');
  assert.ok(!JSON.stringify(m.guardado()).includes('Fulano'), 'nada en las SavedVariables');
  sinErrores(m);
});

test('F8 ronda 1: con líneas de otro addon el tooltip no se rehace y no se pierden', () => {
  // Un tooltip normal con una línea añadida después de las nuestras.
  {
    const m = maquina();
    conListas(m);
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589);
    m.lua('GameTooltip:AddLine("Línea de otro addon")');
    const antes = JSON.stringify(m.detalleTooltip());
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    m.avanzar(1);
    assert.equal(refrescos(m), 0);
    assert.equal(JSON.stringify(m.detalleTooltip()), antes);
    sinErrores(m);
  }
  // Una fila nuestra con una línea de otro addon detrás de las suyas.
  {
    const m = maquina();
    conListas(m);
    llegaLista(m, 2589, 130, 14612);
    filaConVendedor(m);
    m.lua('GameTooltip:AddLine("Línea de otro addon")');
    const antes = JSON.stringify(m.detalleTooltip());
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    m.avanzar(1);
    assert.equal(refrescos(m), 0);
    assert.equal(JSON.stringify(m.detalleTooltip()), antes);
    sinErrores(m);
  }
  // Con el aparte el del juego no se toca: la línea ajena se queda y el aparte se pone al día igual.
  {
    const m = maquina();
    conListas(m);
    assert.equal(poner(m, 'incrustado', false), true);
    llegaLista(m, 2589, 130, 14612);
    ver(m, 2589);
    m.lua('GameTooltip:AddLine("Línea de otro addon")');
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    dice(m, 14384, 181, 'SnetForeverTooltipAparte');
    assert.equal(veces(m, 'Línea de otro addon'), 1);
    assert.equal(refrescos(m), 0);
    sinErrores(m);
  }
});

test('F8 ronda 1: la primera lista al volver a abrir la subasta no se pierde aunque repita el número de versión', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612); // primera sesión: versión 1, vista por el aviso
  m.lua('VERSION = 0; LISTAS = {}'); // Busqueda.parar con el estado ya «parada»: a 0 y sin avisar
  ver(m, 2589);
  m.avanzar(1);
  llegaLista(m, 2589, 181, 14384); // segunda sesión: otra vez la versión 1
  assert.equal(refrescos(m), 1, 'la lista no se ignora');
  dice(m, 14384, 181);
  sinErrores(m);
});

test('F8 ronda 1: con solo líneas de fórmulas, dos listas iguales no repintan y una distinta sí', () => {
  const m = maquina();
  conListas(m);
  m.lua(`local T = SnetForever.TooltipComercio
    for _, k in ipairs({"aLaVenta", "minima", "regla", "mercado", "mercadoSolo", "salen", "parte"}) do T.ponerLinea(k, false) end
    T.ponerLinea("maximoPublicar", true)`);
  llegaLista(m, 2589, 130, 14612);
  ver(m, 2589);
  m.avanzar(1);
  llegaLista(m, 2589, 130, 14612);
  m.avanzar(1);
  llegaLista(m, 2589, 130, 14612);
  m.avanzar(1);
  assert.equal(refrescos(m), 0, 'los mismos números');
  llegaLista(m, 2589, 181, 14384);
  assert.equal(refrescos(m), 1, 'la fórmula puede usar la mínima de la lista');
  sinErrores(m);
});

test('F8 ronda 1: con todas las líneas de la subasta apagadas, el tooltip no carga los precios', () => {
  const m = maquina();
  conListas(m);
  m.lua(`local T = SnetForever.TooltipComercio
    for _, k in ipairs({"aLaVenta", "minima", "regla", "mercado", "mercadoSolo", "salen", "parte"}) do T.ponerLinea(k, false) end
    _G.CONSULTAS = 0
    local P = SnetForever.Precios
    local f = P.consultar
    P.consultar = function(...) CONSULTAS = CONSULTAS + 1; return f(...) end`);
  ver(m, 2589);
  m.avanzar(1);
  llegaLista(m, 2589, 181, 14384);
  assert.equal(m.lua('CONSULTAS'), 0);
  sinErrores(m);
});

test('F8 ronda 1: al pasar a otro objeto sin vaciar el tooltip se suelta el ancho sostenido', () => {
  const m = maquina();
  m.itemInfo(5000, { nombre: 'Otro objeto', calidad: 1 });
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  ponerNatural(m, 'GameTooltip', 250);
  ver(m, 2589);
  m.lua('GameTooltip:Show()');
  m.avanzar(1);
  ponerNatural(m, 'GameTooltip', 200);
  llegaLista(m, 2589, 181, 14384);
  assert.equal(m.lua('GameTooltip:GetMinimumWidth()'), 250, 'sostenido');
  m.lua('for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do f(GameTooltip, {id = 5000, type = Enum.TooltipDataType.Item}) end');
  assert.equal(m.lua('GameTooltip:GetMinimumWidth()'), 0, 'otro objeto: el mínimo de antes');
  sinErrores(m);
});

// F8, ronda 2 (la revisión).
test('F8 ronda 2: una línea de otro addon puesta antes de las de la fila no se pierde y esa fila no se rehace', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  // Otro addon engancha SetItemByID: su línea entra después de las nuestras y antes de las de la fila.
  m.lua(`local original = GameTooltip.SetItemByID
    rawset(GameTooltip, "SetItemByID", function(self, id) original(self, id); self:AddLine("Línea de otro addon") end)`);
  filaConVendedor(m);
  const d = izqs(m);
  assert.ok(d.indexOf('Línea de otro addon') < d.indexOf('Vendedor: Fulano'), JSON.stringify(d));
  const antes = JSON.stringify(m.detalleTooltip());
  for (const [precio, cantidad] of [[181, 14384], [190, 14300]]) {
    m.avanzar(1);
    llegaLista(m, 2589, precio, cantidad);
    m.avanzar(1);
    assert.equal(refrescos(m), 0, 'como en las bolsas: con líneas ajenas no se rehace');
    assert.equal(JSON.stringify(m.detalleTooltip()), antes);
  }
  // Al volver a abrirlo salen los números de ahora, con la línea ajena y las de la fila, una vez cada una.
  m.lua('GameTooltip:Hide()');
  filaConVendedor(m);
  dice(m, 14300, 190);
  assert.equal(veces(m, 'Línea de otro addon'), 1);
  assert.equal(veces(m, 'Vendedor: Fulano'), 1);
  sinErrores(m);
});

test('F8 ronda 2: abierto sin líneas nuestras, un RefreshData que no vacía pero lanza el enganche no repite las de la fila', () => {
  const m = maquina();
  m.itemInfo(5000, { nombre: 'Objeto sin datos', calidad: 1 });
  conListas(m);
  m.lua(`local T = SnetForever.TooltipComercio
    for _, k in ipairs({"mercado", "mercadoSolo", "salen", "parte", "regla", "minima"}) do T.ponerLinea(k, false) end
    _G.FILA = CreateFrame("Button", "FilaF8", UIParent); FILA:SetSize(100, 20); FILA:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -10)
    SnetForever.UIComercio.tooltipObjeto(FILA, {item = 5000, clave = "k", lineas = function(tt) tt:AddLine("Vendedor: Fulano") end})`);
  assert.deepEqual(izqs(m), ['Objeto sin datos', 'Vendedor: Fulano'], 'ninguna línea nuestra al abrirlo');
  m.lua(`rawset(GameTooltip, "RefreshData", function(self)
    BANCO.anotar("GameTooltip:RefreshData", "GameTooltip")
    for _, f in ipairs(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item]) do
      f(self, {id = 5000, type = Enum.TooltipDataType.Item})
    end
  end)`);
  m.avanzar(1);
  llegaLista(m, 5000, 181, 14384);
  assert.equal(refrescos(m), 1);
  assert.equal(veces(m, 'Vendedor: Fulano'), 1, JSON.stringify(izqs(m)));
  assert.equal(veces(m, 'A la venta'), 1, 'nuestras líneas nuevas, una vez');
  // Y otra lista después, ya con líneas nuestras: tampoco se acumula nada.
  m.avanzar(1);
  llegaLista(m, 5000, 190, 14300);
  m.avanzar(1);
  assert.equal(veces(m, 'Vendedor: Fulano'), 1, JSON.stringify(izqs(m)));
  assert.equal(veces(m, 'A la venta'), 1, JSON.stringify(izqs(m)));
  sinErrores(m);
});

// F8, ronda 3 (la revisión): si el tooltip se ha rehecho no se deduce contando líneas, sino mirando si las de la fila siguen
// en su sitio. Los dos clientes posibles: RefreshData lanza OnTooltipCleared o no lo lanza.
const filaCon = (m, item, cuerpo) => m.lua(`_G.FILA = rawget(_G, "FILA") or CreateFrame("Button", "FilaF8r3", UIParent)
  FILA:SetSize(100, 20); FILA:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -10)
  SnetForever.UIComercio.tooltipObjeto(FILA, {item = ${item}, clave = "k${item}", lineas = function(tt) ${cuerpo} end})`);
const VENDEDOR = 'tt:AddLine("Vendedor: Fulano")';
const sinLineasPropias = (m) => m.lua(`local T = SnetForever.TooltipComercio
  for _, k in ipairs({"mercado", "mercadoSolo", "salen", "parte", "regla", "minima"}) do T.ponerLinea(k, false) end`);
const maquinaSinDatos = (sinLimpiar) => {
  const m = maquina();
  m.lua(`BANCO.refrescoSinLimpiar = ${sinLimpiar}`);
  m.itemInfo(5000, { nombre: 'Objeto sin datos', calidad: 1 });
  conListas(m);
  sinLineasPropias(m);
  return m;
};

for (const sinLimpiar of [false, true]) {
  const cliente = sinLimpiar ? 'sin OnTooltipCleared' : 'con OnTooltipCleared';

  test(`F8 ronda 3: rehecho con una línea más del juego, abierto sin líneas nuestras, la fila sigue (${cliente})`, () => {
    const m = maquinaSinDatos(sinLimpiar);
    filaCon(m, 5000, VENDEDOR);
    assert.deepEqual(izqs(m), ['Objeto sin datos', 'Vendedor: Fulano']);
    m.itemInfo(5000, { nombre: 'Objeto sin datos', calidad: 1, tooltip: ['Requiere nivel 10'] });
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    assert.equal(refrescos(m), 1);
    assert.equal(veces(m, 'Requiere nivel 10'), 1);
    assert.equal(veces(m, 'Vendedor: Fulano'), 1, JSON.stringify(izqs(m)));
    const d = izqs(m);
    assert.equal(d[d.length - 1], 'Vendedor: Fulano', 'detrás de todo, como al abrirlo');
    sinErrores(m);
  });

  test(`F8 ronda 3: rehecho con muchas más líneas, con las nuestras, la fila sigue (${cliente})`, () => {
    const m = maquina();
    m.lua(`BANCO.refrescoSinLimpiar = ${sinLimpiar}`);
    conListas(m);
    llegaLista(m, 2589, 130, 14612);
    filaConVendedor(m);
    const n = izqs(m).length;
    m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1, tooltip: Array.from({ length: n + 2 }, (_, i) => `Del juego ${i}`) });
    m.avanzar(1);
    llegaLista(m, 2589, 181, 14384);
    // Sin OnTooltipCleared y con tantas líneas del juego, la salida temprana de Tooltip.anadir («ya están») no pone las nuestras:
    // es de antes y va a la lista de pendientes. Lo que se comprueba aquí es que las de la fila no se pierden.
    if (!sinLimpiar) {
      dice(m, 14384, 181);
      sinRepetidas(m);
    }
    assert.equal(veces(m, 'Vendedor: Fulano'), 1, JSON.stringify(izqs(m)));
    assert.equal(veces(m, 'Compra 1s 81c'), 1);
    sinErrores(m);
  });

  test(`F8 ronda 3: rehecho con una línea de un addon enganchado antes que el nuestro, la fila sigue (${cliente})`, () => {
    const m = maquinaSinDatos(sinLimpiar);
    m.lua(`_G.CON_AJENA = false
      table.insert(BANCO.postLlamadasTooltip[Enum.TooltipDataType.Item], 1, function(t)
        if CON_AJENA then t:AddLine("Línea de otro addon") end
      end)`);
    filaCon(m, 5000, VENDEDOR);
    m.lua('CON_AJENA = true');
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    assert.equal(veces(m, 'Línea de otro addon'), 1);
    assert.equal(veces(m, 'Vendedor: Fulano'), 1, JSON.stringify(izqs(m)));
    sinErrores(m);
  });

  test(`F8 ronda 3: una fila que no añadía nada y luego añade una línea la pone una sola vez (${cliente})`, () => {
    const m = maquinaSinDatos(sinLimpiar);
    m.lua('_G.CON_AVISO = false');
    filaCon(m, 5000, 'if CON_AVISO then tt:AddLine("Aviso de la fila") end');
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    assert.equal(veces(m, 'Aviso de la fila'), 0);
    m.lua('CON_AVISO = true');
    for (const [precio, cantidad] of [[190, 14300], [200, 14200], [210, 14100]]) {
      m.avanzar(1);
      llegaLista(m, 5000, precio, cantidad);
      assert.equal(veces(m, 'Aviso de la fila'), 1, JSON.stringify(izqs(m)));
    }
    sinErrores(m);
  });
}

test('F8 ronda 3: si RefreshData vacía sin lanzar el enganche y el siguiente no hace nada, la fila no sale dos veces', () => {
  const m = maquina();
  conListas(m);
  llegaLista(m, 2589, 130, 14612);
  filaConVendedor(m);
  m.lua(`_G.MODO_REFRESCO = "vacia"
    rawset(GameTooltip, "RefreshData", function(self)
      BANCO.anotar("GameTooltip:RefreshData", "GameTooltip")
      if MODO_REFRESCO == "vacia" then
        local e = BANCO.estado[self]
        local objeto = e.objeto
        self:ClearLines()
        self:AddLine("Paño de lino")
        e.objeto = objeto
      end
    end)`);
  m.avanzar(1);
  llegaLista(m, 2589, 181, 14384);
  assert.equal(veces(m, 'Vendedor: Fulano'), 1, `tras vaciar: ${JSON.stringify(izqs(m))}`);
  m.lua('MODO_REFRESCO = "nada"');
  m.avanzar(1);
  llegaLista(m, 2589, 190, 14300);
  assert.equal(veces(m, 'Vendedor: Fulano'), 1, `tras no hacer nada: ${JSON.stringify(izqs(m))}`);
  assert.equal(veces(m, 'Compra 1s 81c'), 1);
  // Y una línea ajena puesta ahora se ve como ajena: la cuenta de líneas conocidas no se ha quedado alta.
  m.lua('GameTooltip:AddLine("Línea de otro addon")');
  const antes = refrescos(m);
  m.avanzar(1);
  llegaLista(m, 2589, 200, 14200);
  assert.equal(refrescos(m), antes, 'con una línea ajena no se rehace');
  assert.equal(veces(m, 'Línea de otro addon'), 1);
  sinErrores(m);
});

test('F8 ronda 3: una línea del juego igual que la de la fila, en su mismo sitio, no hace perder ni repetir lo que se lee', () => {
  // Con OnTooltipCleared se sabe que se ha rehecho: salen las dos, la del juego y la de la fila.
  {
    const m = maquinaSinDatos(false);
    filaCon(m, 5000, VENDEDOR);
    m.itemInfo(5000, { nombre: 'Objeto sin datos', calidad: 1, tooltip: ['Vendedor: Fulano'] });
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    assert.equal(veces(m, 'Vendedor: Fulano'), 2, JSON.stringify(izqs(m)));
    sinErrores(m);
  }
  // Sin ese aviso no se puede distinguir: en ese sitio ya se lee lo mismo, así que no se añade (nunca líneas repetidas).
  {
    const m = maquinaSinDatos(true);
    filaCon(m, 5000, VENDEDOR);
    m.itemInfo(5000, { nombre: 'Objeto sin datos', calidad: 1, tooltip: ['Vendedor: Fulano'] });
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    assert.equal(veces(m, 'Vendedor: Fulano'), 1, JSON.stringify(izqs(m)));
    sinErrores(m);
  }
  // Si solo coincide la primera de dos, no son las de la fila: se ponen las dos y la segunda no se pierde.
  {
    const m = maquinaSinDatos(true);
    filaCon(m, 5000, `${VENDEDOR}; tt:AddLine("Compra 1s 81c")`);
    m.itemInfo(5000, { nombre: 'Objeto sin datos', calidad: 1, tooltip: ['Vendedor: Fulano'] });
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    assert.equal(veces(m, 'Compra 1s 81c'), 1, JSON.stringify(izqs(m)));
    sinErrores(m);
  }
});

test('F8 ronda 3: si las líneas de la fila no se pueden leer el tooltip no se rehace: ni se pierden ni se repiten', () => {
  const casos = {
    'sin texto al llegar la lista': (m) => m.lua('rawset(GameTooltipTextLeft2, "GetText", function() return nil end)'),
    'con un texto secreto al llegar la lista': (m) => m.lua(`local A = SnetForever.API
      local f = A.esSecreto
      A.esSecreto = function(v) return v == "Vendedor: Fulano" or f(v) end`),
  };
  for (const [nombreCaso, estropear] of Object.entries(casos)) {
    const m = maquinaSinDatos(false);
    filaCon(m, 5000, VENDEDOR);
    estropear(m);
    const antes = JSON.stringify(m.detalleTooltip());
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    m.avanzar(1);
    assert.equal(refrescos(m), 0, nombreCaso);
    assert.equal(JSON.stringify(m.detalleTooltip()), antes, nombreCaso);
    sinErrores(m);
  }
  // Ya sin poder leerlas al abrir la fila: tampoco.
  {
    const m = maquinaSinDatos(false);
    m.lua(`local A = SnetForever.API
      local f = A.esSecreto
      A.esSecreto = function(v) return v == "Vendedor: Fulano" or f(v) end`);
    filaCon(m, 5000, VENDEDOR);
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    assert.equal(refrescos(m), 0);
    assert.equal(veces(m, 'Vendedor: Fulano'), 1);
    sinErrores(m);
  }
  // Se dejan de poder leer durante el RefreshData, sin que se haya vaciado: en la duda no se añaden.
  {
    const m = maquinaSinDatos(false);
    filaCon(m, 5000, VENDEDOR);
    m.lua(`rawset(GameTooltip, "RefreshData", function(self)
      BANCO.anotar("GameTooltip:RefreshData", "GameTooltip")
      rawset(GameTooltipTextLeft2, "GetText", function() return nil end)
    end)`);
    m.avanzar(1);
    llegaLista(m, 5000, 181, 14384);
    assert.equal(refrescos(m), 1);
    assert.equal(veces(m, 'Vendedor: Fulano'), 1, JSON.stringify(izqs(m)));
    sinErrores(m);
  }
});
