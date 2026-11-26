// Subasta, parte 3, bloque B, tarea S1: la tabla del sniper (y la de la lista vieja de ofertas) llena su panel y crece o
// encoge con la ventana. En el juego (con 7b75f3b) la tabla del sniper medía unos 500 px de ancho y 12 filas de alto y
// dejaba vacío a la derecha y abajo. Ahora la tabla (TablaComercio con `estirar`) mide lo que su panel: las columnas se
// reparten el ancho (Objeto se lleva casi todo lo que sobra) y caben tantas filas de FILA px como deja el alto.
// Tarea S2: la tabla del sniper es la de ui/subasta/sniper.lua (SnetForever.SubastaSniper): su panel es el marco fino de
// la tabla (marcoTabla), con 1 px de borde a cada lado, y sus columnas son las de la vista de resultados.
// BANCO.tamanoPorAnclajes = true hace que el banco lance OnSizeChanged cuando cambia el tamaño que dan los anclajes (como el
// cliente al estirar la ventana con el agarre).
import { after, test as testSiempre } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

// B3r: el alto de fila y de cabecera de las tablas sigue a la letra del tema (Tema.ALTO_FILA: 22 px; antes 20).
const FILA = 22;
const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const AHORA = 1790000000;
const H = Math.floor(AHORA / 3600);

// Precios de la app: lo normal de todos es 10 de oro, ritmo 0,6 (como en comercio-sniper.test.js).
function ponerRanura(dir) {
  const i = (H % 8) + 1;
  const nombre = `SnetForever_P${String(i).padStart(2, '0')}`;
  const carpeta = join(dir, nombre);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${nombre}.toc`), '## Interface: 16001\n## LoadOnDemand: 1\n## Dependencies: SnetForever\n\np1.lua\n');
  const filas = [2589, 2592, 4306, 4338, 14047].map((item) => `[${item}] = {98000, 400, 100000, 0, 0.6, 85, 0}`).join(', ');
  writeFileSync(join(carpeta, 'p1.lua'), `SNF_PRECIOS = {v = 1, seq = 1, generado = ${H * 3600 + 1357}, region = "us", conocidas = {["Normal|Horde"] = 114},
  casas = {[114] = {${filas}}}, grupos = {}, nombres = {}, completo = true}
`);
}

function maquina() {
  const dir = mkdtempSync(join(tmpdir(), 'snf-tabla-tamano-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever'), { recursive: true });
  ponerRanura(dir);
  const m = crearMaquina({ addonsDir: dir, jugador: { reino: 'Normal', faccion: 'Horde' } });
  m.lua(`BANCO.tick = BANCO.tick + ${Math.round((40 * 60 - (AHORA - H * 3600) + 0.5) * 20)}`);
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  m.lua('BANCO.jugador.dinero = 10000000');
  m.lua('BANCO.tamanoPorAnclajes = true');
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 2 });
  return m;
}

const V = 'SnetForever.UIComercio.marco()';
const SV = 'SnetForever.SubastaVentana';
const SN = 'SnetForever.SubastaSniper.marcos';
const P = `${SN}.marcoTabla`; // el panel de la tabla del sniper (su marco fino)
const TS = `${SN}.tabla`;
const COLS_SNIPER = ['aviso', 'objeto', 'nivel', 'cantidad', 'compra', 'pct', 'foto']; // S2, ronda 1: sin Pujar; F1 ronda 2: con la Foto
const COLS_LISTA = ['objeto', 'nivel', 'cantidad', 'precio', 'pct', 'ritmo', 'foto']; // F1 (ronda 1): la columna Foto, la última
const MINIMOS_SNIPER = { aviso: 44, objeto: 302, nivel: 44, cantidad: 52, compra: 120, pct: 50, foto: 100 };
const BORDE_SNIPER = 1; // la tabla va 1 px dentro de su marco fino

// Abre la subasta con la seda a la venta al 60 % (un hallazgo), deja acabar el escaneo y arranca el sniper en su pestaña.
function conSniper(m) {
  m.lua('BANCO.ponerSubasta({navegar = {{itemID = 2589, totalQuantity = 10, minPrice = 100000}, {itemID = 4306, totalQuantity = 10, minPrice = 60000}}, porPagina = 50})');
  m.disparar('AUCTION_HOUSE_SHOW');
  for (let i = 0; i < 400 && m.lua('SnetForever.Escaneo.estado()') !== 'completo'; i++) m.avanzar(0.05);
  assert.equal(m.lua('SnetForever.Escaneo.estado()'), 'completo', 'el escaneo de la apertura acaba');
  m.lua('SnetForever.UIComercio.elegirPestana("sniper")');
  m.lua(`${SN}.grande:Click()`);
  m.avanzar(0.6);
  assert.equal(m.lua(`${TS}.marco:IsVisible()`), true, 'en marcha se ve la tabla');
  assert.equal(m.lua(`${TS}.huecos[1]:IsShown()`), true, 'con un hallazgo');
}

// Cambia el tamaño de la ventana (centrada) y deja pasar dos fotogramas: en el primero llega OnSizeChanged y en el
// siguiente la tabla pone las filas (B7: los cambios que no vienen del asa, agrupados).
function tamano(m, ancho, alto) {
  m.lua(`${SV}.colocar({ancho = ${ancho}, alto = ${alto}})`);
  m.avanzar(0.05);
  m.avanzar(0.05); // B7: un cambio que no viene del asa se aplica en el fotograma siguiente al aviso
}
const ancho = (m, marco) => m.lua(`${marco}:GetRight() - ${marco}:GetLeft()`);
const anchos = (m, tabla, claves) => Object.fromEntries(claves.map((c) => [c, ancho(m, `${tabla}.cabeceras.${c}`)]));
const filas = (m, tabla) => m.lua(`#${tabla}.huecos`);
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} y ${b}`);

// El marco de la tabla va de un lado al otro del panel (con `relleno` px a cada lado) y las cabeceras, una detrás de
// otra, lo llenan entero.
function llenaDeLado(m, panel, tabla, claves, relleno) {
  cerca(m.lua(`${tabla}.marco:GetLeft()`), m.lua(`${panel}:GetLeft()`) + relleno, 'borde izquierdo');
  cerca(m.lua(`${tabla}.marco:GetRight()`), m.lua(`${panel}:GetRight()`) - relleno, 'borde derecho');
  cerca(m.lua(`${tabla}.cabeceras.${claves[0]}:GetLeft()`), m.lua(`${tabla}.marco:GetLeft()`), 'la primera columna empieza en el borde');
  for (let i = 1; i < claves.length; i++) {
    cerca(m.lua(`${tabla}.cabeceras.${claves[i]}:GetLeft()`), m.lua(`${tabla}.cabeceras.${claves[i - 1]}:GetRight()`), `${claves[i]} sigue a ${claves[i - 1]}`);
  }
  cerca(m.lua(`${tabla}.cabeceras.${claves.at(-1)}:GetRight()`), m.lua(`${tabla}.marco:GetRight()`), 'la última acaba en el borde');
}

test('la tabla del sniper ocupa todo el ancho de su panel', () => {
  const m = maquina();
  conSniper(m);
  llenaDeLado(m, P, TS, COLS_SNIPER, BORDE_SNIPER);
  const antes = ancho(m, `${TS}.marco`);
  tamano(m, 1200, 700);
  llenaDeLado(m, P, TS, COLS_SNIPER, BORDE_SNIPER);
  assert.ok(ancho(m, `${TS}.marco`) > antes + 300, 'más ancha con la ventana más ancha');
  // Las celdas de las filas siguen a sus cabeceras: «%» acaba dentro de su columna, a la derecha del todo.
  assert.ok(m.lua(`${TS}.huecos[1].celdas.pct:GetRight()`) <= m.lua(`${TS}.cabeceras.pct:GetRight()`) + 0.01);
  assert.ok(m.lua(`${TS}.huecos[1].celdas.pct:GetLeft()`) >= m.lua(`${TS}.cabeceras.pct:GetLeft()`) - 0.01);
  sinErrores(m);
});

test('las filas visibles del sniper siguen el alto del panel', () => {
  const m = maquina();
  conSniper(m);
  const comprobar = (msg) => {
    const alto = m.lua(`${TS}.marco:GetTop() - ${TS}.marco:GetBottom()`);
    assert.equal(filas(m, TS), Math.floor((alto - FILA) / FILA), `${msg}: caben todas las filas de ${FILA} px que deja el alto`);
    const ultima = m.lua(`${TS}.huecos[#${TS}.huecos]:GetBottom()`);
    // Tarea S2: lo de abajo es la barra oscura del sniper; la tabla acaba 8 px por encima (más el borde de su marco).
    assert.ok(ultima >= m.lua(`${SN}.pie:GetTop()`) + 8 + BORDE_SNIPER - 0.01, `${msg}: la última fila queda encima de lo de abajo`);
    assert.ok(ultima - m.lua(`${SN}.pie:GetTop()`) < FILA + 8 + BORDE_SNIPER + 0.01, `${msg}: y no deja hueco para otra fila`);
    assert.equal(m.lua(`${TS}.huecos[1]:GetHeight()`), FILA, `${msg}: las filas no cambian de alto`);
  };
  comprobar('por defecto');
  const n = filas(m, TS);
  tamano(m, 900, 750);
  comprobar('más alta');
  assert.ok(filas(m, TS) >= n + 9, `más alto, más filas (${n} -> ${filas(m, TS)})`);
  assert.equal(m.lua(`${TS}.huecos[1]:IsShown()`), true, 'el hallazgo sigue a la vista');
  tamano(m, 900, 500);
  comprobar('más baja');
  assert.ok(filas(m, TS) < n, 'menos alto, menos filas');
  // Los huecos que sobran se esconden (no se destruyen): al volver a crecer se reutilizan.
  const creados = m.lua(`#${TS}._todos`);
  tamano(m, 900, 750);
  assert.equal(m.lua(`#${TS}._todos`), creados, 'no se crean huecos nuevos al volver al mismo alto');
  for (let i = filas(m, TS) + 1; i <= creados; i++) {
    assert.equal(m.lua(`${TS}._todos[${i}]:IsShown()`), false, `el hueco ${i} que sobra, escondido`);
  }
  sinErrores(m);
});

test('al agrandar la ventana con el agarre la tabla crece', () => {
  const m = maquina();
  conSniper(m);
  const anchoAntes = ancho(m, `${TS}.marco`);
  const filasAntes = filas(m, TS);
  const objetoAntes = ancho(m, `${TS}.cabeceras.objeto`);
  const asa = `${SV}.marcos.asa`;
  m.lua(`${asa}:GetScript("OnMouseDown")(${asa}, "LeftButton")`);
  m.lua(`BANCO.redimensionar = {ancho = 200, alto = ${6 * FILA}}`);
  m.lua(`${asa}:GetScript("OnMouseUp")(${asa}, "LeftButton")`);
  m.avanzar(0.05);
  cerca(ancho(m, `${TS}.marco`), anchoAntes + 200, 'la tabla crece lo mismo que la ventana');
  llenaDeLado(m, P, TS, COLS_SNIPER, BORDE_SNIPER);
  assert.equal(filas(m, TS), filasAntes + 6, '6 filas de alto más: 6 filas más');
  assert.ok(ancho(m, `${TS}.cabeceras.objeto`) > objetoAntes + 100, 'Objeto se lleva casi todo');
  // Y al achicarla vuelve a lo de antes.
  m.lua(`${asa}:GetScript("OnMouseDown")(${asa}, "LeftButton")`);
  m.lua(`BANCO.redimensionar = {ancho = -200, alto = ${-6 * FILA}}`);
  m.lua(`${asa}:GetScript("OnMouseUp")(${asa}, "LeftButton")`);
  m.avanzar(0.05);
  cerca(ancho(m, `${TS}.marco`), anchoAntes, 'vuelve al ancho de antes');
  assert.equal(filas(m, TS), filasAntes);
  sinErrores(m);
});

test('Objeto se lleva el ancho que sobra', () => {
  const m = maquina();
  conSniper(m);
  tamano(m, 1300, 600);
  const a = anchos(m, TS, COLS_SNIPER);
  const total = Object.values(a).reduce((s, x) => s + x, 0);
  const sobra = total - Object.values(MINIMOS_SNIPER).reduce((s, x) => s + x, 0);
  assert.ok(sobra > 500, `a 1300 de ancho sobra mucho (${sobra})`);
  const crece = Object.fromEntries(COLS_SNIPER.map((c) => [c, a[c] - MINIMOS_SNIPER[c]]));
  for (const c of COLS_SNIPER) assert.ok(crece[c] >= 0, `${c} nunca baja de su ancho (${a[c]})`);
  for (const c of COLS_SNIPER.filter((x) => x !== 'objeto')) assert.ok(crece.objeto > 3 * crece[c], `Objeto crece mucho más que ${c}`);
  assert.ok(crece.objeto >= sobra / 2, `Objeto se lleva al menos la mitad de lo que sobra (${crece.objeto} de ${sobra})`);
  for (const c of COLS_SNIPER) assert.equal(a[c], Math.round(a[c]), `${c} en píxeles enteros`);
  // El nombre del objeto usa el ancho nuevo de su columna (no se queda recortado a 302); tarea S2: menos el icono, sus
  // márgenes y el sitio de «(n)» (62 px).
  const celda = m.lua(`${TS}.huecos[1].celdas.objeto:GetWidth()`);
  assert.ok(celda > a.objeto - 70 && celda < a.objeto, `el nombre ocupa su columna (${celda} en ${a.objeto})`);
  sinErrores(m);
});

test('la lista vieja de ofertas también llena su panel y sigue a la ventana', () => {
  const m = maquina();
  conSniper(m);
  m.lua('SnetForever.UIComercio.elegirPestana("lista")');
  m.avanzar(0.05);
  const T = `${V}.tabla`;
  const C = `${V}.cuerpo`;
  assert.equal(m.lua(`${C}:IsVisible()`), true);
  const comprobar = (msg) => {
    llenaDeLado(m, C, T, COLS_LISTA, 0);
    cerca(m.lua(`${T}.marco:GetTop()`), m.lua(`${C}:GetTop()`), `${msg}: arriba`);
    cerca(m.lua(`${T}.marco:GetBottom()`), m.lua(`${C}:GetBottom()`), `${msg}: abajo`);
    assert.equal(filas(m, T), Math.floor((m.lua(`${C}:GetTop() - ${C}:GetBottom()`) - FILA) / FILA), `${msg}: filas`);
    assert.equal(m.lua(`${V}.filas == ${T}.huecos`), true, `${msg}: raiz.filas sigue siendo la lista de huecos`);
  };
  comprobar('por defecto');
  const n = filas(m, T);
  // Compare both measurements in window units even when the page scales its text.
  const itemWidth = () => m.lua(`(function() local header = ${T}.cabeceras.objeto
    return (header:GetRight() - header:GetLeft()) * header:GetEffectiveScale() / ${V}:GetEffectiveScale() end)()`);
  const objeto = itemWidth();
  tamano(m, 1200, 750);
  comprobar('más grande');
  assert.ok(filas(m, T) > n);
  assert.ok(itemWidth() > objeto + 150);
  sinErrores(m);
});

// Revisión B7, Importante 1 (regla de interfaz): con el asa cogida y el ratón parado justo donde cabe una fila
// más, el temblor de la mano (1 px arriba y abajo) no hace salir y esconderse la última fila, ni en vaivenes seguidos ni
// con un temblor suelto tras estar quieto más de 0,3 s (el fallo de 01d50a5). La tabla sigue al asa, como el oro: cogida,
// no sale ninguna fila nueva (solo se va la que deja de caber, y no vuelve); al soltar, las que caben, una sola vez.
// Lo visible se apunta desde ANTES del primer vaivén. `tabla` es la expresión de la tabla en Lua.
function sinParpadeoAlEstirar(m, tabla) {
  const anchoV = m.lua(`${V}:GetWidth()`);
  const resto = m.lua(`${V}:GetHeight()`) - m.lua(`${tabla}.marco:GetTop() - ${tabla}.marco:GetBottom()`);
  const n = filas(m, tabla);
  const limite = FILA + (n + 1) * FILA + resto; // el alto de ventana en que cabe justo la fila n + 1
  const poner = (alto) => m.lua(`${V}:SetSize(${anchoV}, ${alto})`);
  poner(limite - 1);
  m.avanzar(0.05);
  m.avanzar(0.05);
  assert.equal(filas(m, tabla), n, 'con 1 px menos que el límite, n filas');
  m.avanzar(0.5); // el ratón quieto más de 0,3 s
  const asa = `${SV}.marcos.asa`;
  m.lua(`${asa}:GetScript("OnMouseDown")(${asa}, "LeftButton")`);
  const vistas = [filas(m, tabla)]; // lo que se veía antes del primer vaivén
  const paso = (alto) => { poner(alto); m.avanzar(0.05); vistas.push(filas(m, tabla)); };
  // Un temblor suelto de 1 px tras estar quieto, y otro tras otra pausa.
  paso(limite); paso(limite - 1);
  m.avanzar(0.5); vistas.push(filas(m, tabla));
  paso(limite); paso(limite - 1);
  // Y diez vaivenes seguidos.
  for (let i = 0; i < 10; i++) { paso(limite); paso(limite - 1); }
  // Parado en el límite, aún con el asa cogida: nada sale hasta soltar.
  paso(limite); paso(limite);
  assert.deepEqual(vistas, vistas.map(() => n), `con el asa cogida no sale ninguna fila: ${vistas.join(' ')}`);
  // Al soltar, la fila n + 1 sale una vez y se queda.
  m.lua(`${asa}:GetScript("OnMouseUp")(${asa}, "LeftButton")`);
  const tras = [];
  for (let i = 0; i < 8; i++) { m.avanzar(0.05); tras.push(filas(m, tabla)); }
  assert.deepEqual(tras, tras.map(() => n + 1), `al soltar, las que caben, una vez: ${tras.join(' ')}`);
  // Encoger con el asa cogida: la fila que deja de caber se va una vez y no vuelve con el temblor, hasta soltar.
  m.avanzar(0.5);
  m.lua(`${asa}:GetScript("OnMouseDown")(${asa}, "LeftButton")`);
  const enc = [filas(m, tabla)];
  const pasoEnc = (alto) => { poner(alto); m.avanzar(0.05); enc.push(filas(m, tabla)); };
  for (let i = 0; i < 10; i++) { pasoEnc(limite - 1); pasoEnc(limite); }
  let cambios = 0;
  for (let i = 1; i < enc.length; i++) if (enc[i] !== enc[i - 1]) cambios++;
  assert.equal(cambios, 1, `encogiendo, la fila se va una vez y no vuelve: ${enc.join(' ')}`);
  assert.equal(enc.at(-1), n);
  m.lua(`${asa}:GetScript("OnMouseUp")(${asa}, "LeftButton")`);
  m.avanzar(0.05);
  assert.equal(filas(m, tabla), n + 1, 'al soltar en el límite, otra vez n + 1');
  return n;
}

test('B7: con el asa cogida, la última fila del sniper no sale y se esconde con el temblor (seguido o suelto)', () => {
  const m = maquina();
  conSniper(m);
  sinParpadeoAlEstirar(m, TS);
  sinErrores(m);
});

test('B7: lo mismo en la tabla de la lista vieja de ofertas', () => {
  const m = maquina();
  conSniper(m);
  m.lua('SnetForever.UIComercio.elegirPestana("lista")');
  m.avanzar(0.05);
  sinParpadeoAlEstirar(m, `${V}.tabla`);
  sinErrores(m);
});

test('B7: los cambios de tamaño que no vienen del asa se aplican una vez, agrupados, en el fotograma siguiente', () => {
  const m = maquina();
  conSniper(m);
  const n = filas(m, TS);
  const anchoV = m.lua(`${V}:GetWidth()`);
  const altoV = m.lua(`${V}:GetHeight()`);
  // Dos cambios en el mismo fotograma (como colocar y la escala): un solo cambio de filas, con el tamaño del último.
  m.lua(`${V}:SetSize(${anchoV}, ${altoV + 200})`);
  m.lua(`${TS}.marco:GetScript("OnSizeChanged")(${TS}.marco)`);
  m.lua(`${V}:SetSize(${anchoV}, ${altoV + 100})`);
  m.lua(`${TS}.marco:GetScript("OnSizeChanged")(${TS}.marco)`);
  assert.equal(filas(m, TS), n, 'en el mismo fotograma, nada');
  const vistas = [];
  for (let i = 0; i < 6; i++) { m.avanzar(0.05); vistas.push(filas(m, TS)); }
  // Tarea S2: las que caben con el alto del final (100 px más: 4 o 5 filas más, según lo que sobraba antes).
  const caben = Math.floor((m.lua(`${TS}.marco:GetTop() - ${TS}.marco:GetBottom()`) - FILA) / FILA);
  assert.ok(caben >= n + 4, `más alto, más filas (${n} -> ${caben})`);
  assert.deepEqual(vistas, vistas.map(() => caben), `una vez, con las que caben al final: ${vistas.join(' ')}`);
  sinErrores(m);
});

test('las tablas sin estirar (cuadro de cantidad, escalones) siguen como estaban', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.tamanoPorAnclajes = true');
  m.lua(`
    PADRE = CreateFrame("Frame", nil, UIParent)
    PADRE:SetSize(600, 400)
    PADRE:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -10)
    TABLA = SnetForever.TablaComercio.crear(PADRE, {
      columnas = {
        {clave = "precio", titulo = "Precio", ancho = 130, justificado = "RIGHT", valor = function(f) return f.precio end},
        {clave = "n", titulo = "N", ancho = 90, justificado = "RIGHT", valor = function(f) return f.n end},
      },
      filasVisibles = 8,
    })
    TABLA.marco:SetPoint("TOPLEFT", PADRE, "TOPLEFT", 0, 0)
    TABLA:poner({{clave = 1, precio = 5, n = 1}})
  `);
  const igual = () => {
    assert.equal(m.lua('TABLA.marco:GetWidth()'), 220);
    assert.equal(m.lua('TABLA.marco:GetHeight()'), FILA + 8 * FILA);
    assert.equal(m.lua('#TABLA.huecos'), 8);
    assert.equal(m.lua('TABLA.cabeceras.precio:GetWidth()'), 130);
    assert.equal(m.lua('TABLA.cabeceras.n:GetWidth()'), 90);
  };
  igual();
  m.lua('PADRE:SetSize(900, 700)');
  m.avanzar(0.1);
  igual();
  assert.equal(m.lua('TABLA.marco:GetScript("OnSizeChanged")'), undefined, 'sin estirar no escucha su tamaño');
  sinErrores(m);
});

testSiempre('el banco lanza OnSizeChanged cuando cambia el tamaño que dan los anclajes, solo con tamanoPorAnclajes', () => {
  const m = nuevaMaquina();
  m.lua(`
    PADRE = CreateFrame("Frame", nil, UIParent)
    PADRE:SetSize(300, 200)
    PADRE:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 0, 0)
    HIJO = CreateFrame("Frame", nil, PADRE)
    HIJO:SetPoint("TOPLEFT", PADRE, "TOPLEFT", 10, -10)
    HIJO:SetPoint("BOTTOMRIGHT", PADRE, "BOTTOMRIGHT", -10, 10)
    TAMANOS = {}
    HIJO:SetScript("OnSizeChanged", function(_, w, h) TAMANOS[#TAMANOS + 1] = {w, h} end)
  `);
  m.avanzar(0.1);
  m.lua('PADRE:SetSize(400, 250)');
  m.avanzar(0.1);
  assert.deepEqual(m.lua('TAMANOS'), [], 'sin la opción, como siempre');
  m.lua('BANCO.tamanoPorAnclajes = true');
  m.avanzar(0.05);
  assert.deepEqual(m.lua('TAMANOS'), [], 'la primera vez solo se apunta');
  m.lua('PADRE:SetSize(500, 300)');
  m.avanzar(0.1);
  assert.deepEqual(m.lua('TAMANOS'), [[480, 280]], 'una vez, con el tamaño nuevo');
  m.lua('PADRE:Hide(); PADRE:SetSize(600, 300)');
  m.avanzar(0.1);
  assert.deepEqual(m.lua('TAMANOS'), [[480, 280]], 'escondido no se mira');
  m.lua('PADRE:Show()');
  m.avanzar(0.05);
  assert.deepEqual(m.lua('TAMANOS'), [[480, 280], [580, 280]], 'al volver a verse, sí');
  sinErrores(m);
});
