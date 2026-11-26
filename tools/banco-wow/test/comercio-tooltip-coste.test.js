// Comercio, Task 20d: coste del enganche del tooltip (SnetForever.TooltipComercio.anadir).
// Va en su propio archivo a propósito: node --test lanza un proceso por archivo, así la medida corre en un proceso limpio.
// Dentro de comercio-tooltip.test.js la basura y el montón de las pruebas anteriores contaban en el cronómetro y daba
// falsos fallos (470-550 ms con el archivo entero frente a unos 310 ms a solas).
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import v8 from 'node:v8';
import vm from 'node:vm';
import { crearMaquina } from '../src/maquina.js';
import { sinErrores, testConComercio as test } from './ayuda.js';

// fengari no implementa collectgarbage (lua_gc falla): su basura es la del montón de JS, así que se recoge con el gc de V8.
v8.setFlagsFromString('--expose-gc');
const recogerBasura = vm.runInNewContext('gc');

const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000; // GetServerTime() del banco al empezar (hh:13:20)
const H = Math.floor(AHORA / 3600);
const nombre = (i) => `SnetForever_P${String(i).padStart(2, '0')}`;
const ranuraDeHora = (h) => (h % 8) + 1;
const foto = (h) => h * 3600 + 1357; // hh:22:37

// Una ranura de precios como la escribe la app: casas = {casa: {item: [precio, cantidad, normal, tendencia, ritmo, vendidosDia,
// poco, subastas, conTendencia]}} (los dos últimos desde T1b).
function ponerRanura(dir, i, casasDeLaRanura, generado) {
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

function maquina() {
  const dir = mkdtempSync(join(tmpdir(), 'snf-tooltip-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir, ranuraDeHora(H), { 114: {
    2589: [98000, 400, 100000, 12, 0.42, 85, 0, 37, 1],
    5000: [40000, 20, 1000000, 0, 0.42, 85, 0],
    5001: [120000, 20, 100000, 0, 0.42, 85, 0],
    5002: [98000, 20, 100000, 0, -1, -1, 0],
    5003: [98000, 20, 'nil', 0, 0.42, 85, 0],
  } }, foto(H));
  ponerRanura(dir, ranuraDeHora(H - 1), { 114: { 2589: [90000, 300, 95000, 0, 0.4, 80, 0] } }, foto(H - 1));
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde', idioma: 'esES' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('SnetForever.Precios.alAbrir()');
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(5000, { nombre: 'Barato de oro', calidad: 3 });
  m.itemInfo(5001, { nombre: 'Caro de oro', calidad: 2 });
  m.itemInfo(5002, { nombre: 'Sin ritmo', calidad: 1 });
  m.itemInfo(5003, { nombre: 'Sin normal', calidad: 1 });
  m.itemInfo(6000, { nombre: 'Sin datos', calidad: 1 });
  m.lua(`SnetForever.Escaneo = {
    estado = function() return "parado" end,
    datos = function() return {[2589] = {precio = 45000, cantidad = 20, hora = GetServerTime() - 600}} end,
  }`);
  return m;
}

// Coste: el enganche se llama muchísimo (T1b: con el inventario de tres personajes y las líneas que salen por defecto). Solo búsquedas directas por objeto: nada de recorrer el árbol, las listas ni las
// tablas enteras. Con un árbol grande (300 grupos, 3.000 objetos) las llamadas no tocan ninguna función que recorra, y 200
// llamadas bajan de 500 ms (se calienta una pasada y se toma la mejor de tres).
test('coste: con 300 grupos y 3.000 objetos, el enganche no recorre nada y 200 llamadas tardan menos de 500 ms', (t) => {
  const m = maquina();
  m.lua(`local v2 = SnetForeverCuenta.comercio.v2
    for g = 1, 300 do v2.grupos["G" .. g] = true end
    for i = 1, 3000 do v2.objetos["i:" .. (10000 + i)] = "G" .. (i % 300 + 1) end
    v2.objetos["i:2589"] = "G7"
    SnetForever.Arbol.olvidarIndice()
    SnetForeverCuenta.comercio.reglas["propio:G7"] = {compraPct = 85}
    -- T1b: el inventario de tres personajes propios (el lino lo tienen dos). Las líneas, como vienen por defecto.
    SnetForeverCuenta.comercio.inventario = {v = 1, pj = {
      [UnitName("player") .. "-" .. GetRealmName()] = {nombre = UnitName("player"), reino = GetRealmName(), clase = "MAGE", bolsas = {[2589] = 5}, banco = {[2589] = 12}},
      ["Brok-Normal"] = {nombre = "Brok", reino = "Normal", clase = "WARRIOR", bolsas = {[2589] = 3}},
      ["Ana-Normal"] = {nombre = "Ana", reino = "Normal", clase = "PRIEST", bolsas = {}, banco = {}},
    }}
    SnetForever.InventarioCuenta.olvidarOrden()
    BANCO.ponerObjeto(2589, 5) -- lo que el personaje de ahora lleva encima se pregunta al juego
    -- Lo que recorre: si el enganche lo toca, la cuenta sube.
    _G.RECORRIDOS = 0
    for _, par in ipairs({{"Arbol", "listar"}, {"Arbol", "grupos"}, {"Arbol", "ordenadas"}, {"Arbol", "hijos"}, {"Arbol", "objetos"},
      {"Arbol", "contar"}, {"Grupos", "lista"}, {"Operaciones", "lista"}, {"Operaciones", "usos"}, {"Operaciones", "huerfanos"},
      {"InventarioCuenta", "apuntarBolsas"}, {"InventarioCuenta", "apuntarBanco"}, {"InventarioCuenta", "personajes"},
      {"InventarioCuenta", "apuntarCorreo"}, {"InventarioCuenta", "rellenar"}}) do -- F2: el correo y lo de TSM, tampoco
      local t, nombre = SnetForever[par[1]], par[2]
      local f = t[nombre]
      t[nombre] = function(...) RECORRIDOS = RECORRIDOS + 1; return f(...) end
    end`);
  // Antes de cada pasada se recoge la basura, para que no caiga una recogida dentro de la medida.
  const pasada = () => {
    recogerBasura();
    // Fengari implements os.clock() as process uptime. Measure the rendering
    // thread itself so time spent waiting for a CI worker is excluded.
    const cpu = process.threadCpuUsage ?? process.cpuUsage;
    const start = cpu();
    m.lua(`local T = SnetForever.TooltipComercio
    for n = 1, 200 do
      GameTooltip:ClearLines()
      T.anadir(GameTooltip, n % 2 == 0 and 2589 or (10000 + n))
    end`);
    const { user, system } = cpu(start);
    return (user + system) / 1e6;
  };
  pasada(); // calentar
  const tiempos = [pasada(), pasada(), pasada()];
  assert.equal(m.lua('RECORRIDOS'), 0, 'ninguna función que recorra el árbol, las listas, las bolsas o las tablas enteras');
  assert.equal(m.llamadas('C_Container.GetContainerItemInfo').length, 0, 'el tooltip no lee las bolsas');
  const d = m.detalleTooltip().map((x) => x.izq);
  for (const e of ['Inventario', '  Brok', 'A la venta', 'Valor de mercado']) assert.ok(d.includes(e), `la medida incluye ${e}: ${JSON.stringify(d)}`);
  const mejor = Math.min(...tiempos) * 1000;
  t.diagnostic(`coste tooltip: mejor ${mejor.toFixed(0)} ms (tiempos ${tiempos.map((x) => (x * 1000).toFixed(0)).join(', ')} ms)`);
  assert.ok(mejor < 500, `200 llamadas: ${mejor.toFixed(0)} ms (mejor de 3)`);
  sinErrores(m);
});
