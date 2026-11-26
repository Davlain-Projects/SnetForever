// Tema de la ventana principal (ui/tema.lua, SnetForever.Tema): colores, letras, iconos, dinero y paneles; y las
// texturas propias que genera tools/texturas/generar.mjs (tienen que ser iguales a las del repo).
// Las pruebas con testSiempre no necesitan el comercio: corren también en la pasada de solo núcleo.
import { after, test as testSiempre } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// 0.7.0: las pruebas de este archivo (salvo las de testSiempre) necesitan el addon SnetForever_Comercio; en la pasada
// de solo núcleo (npm run test:nucleo) se saltan con el motivo «necesita SnetForever_Comercio» (testConComercio, test/ayuda.js).
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';
import { aLua } from '../src/lua-js.js';
import { atlasIconos, esquina, ICONOS, COLUMNAS, FILAS, CELDA } from '../../texturas/generar.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADDON = join(RAIZ, 'addons', 'SnetForever');
// 0.7.0: el tema y sus recursos (letras, atlas y esquina) están en el addon SnetForever_Comercio; el icono, en el núcleo.
const COMERCIO = join(RAIZ, 'addons', 'SnetForever_Comercio');
const RECURSOS = join(COMERCIO, 'recursos');

// Forge surface and interaction colors, with the established semantic tokens.
const COLORES = {
  fondo: '191717', lateral: '272222', secundario: '232122', hundido: '110e0f', elegida: '3d2e27', pestanaElegida: '49372c',
  boton: '473832', botonApagado: '2c2524', borde: '775744',
  texto: 'f5e8d4', textoPestana: 'cbbeb1', apagado: 'a99b8e',
  acento: 'e6ac72', enlace: 'd5a77d', enlaceApagado: '7a6353', marca: 'ffd839',
  oro: 'dfbd0b', cobre: 'c08850',
  nivel1: 'fcf141', nivel2: 'bdaec6', nivel3: '06a2cb', nivel4: 'ffb85c', base: 'ffffff',
};
// El inventario solo dice «gris claro» (plata) y «verde azulado» (nivel 5): aquí se fija el valor elegido.
const ELEGIDOS = { plata: 'c9cfcf', nivel5: '2fb8a0' };

const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

test('commerce theme applies the Forge palette and preserves status colors', () => {
  const m = nuevaMaquina();
  for (const [token, hex] of Object.entries({ ...COLORES, ...ELEGIDOS })) {
    const c = m.lua(`SnetForever.Tema.color("${token}")`);
    assert.equal(aHex(c), hex, token);
    assert.equal(c[3], 1, `${token}: alfa`);
    assert.equal(m.lua(`SnetForever.Tema.hex("${token}")`), hex, `${token}: hex`);
  }
  sinErrores(m);
});

// The empty radio's iron fill and copper edge remain independently visible.
test('the Forge radio uses separate contrasting colors for the fill and edge', () => {
  const m = nuevaMaquina();
  for (const [token, hex] of Object.entries({ radioVacio: '352d2a', bordeRadio: '84644f' })) {
    const c = m.lua(`SnetForever.Tema.color("${token}")`);
    assert.equal(aHex(c), hex, token);
    assert.equal(c[3], 1, `${token}: alfa`);
    assert.equal(m.lua(`SnetForever.Tema.hex("${token}")`), hex, `${token}: hex`);
  }
  const cabecera = readFileSync(join(COMERCIO, 'ui', 'tema.lua'), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('--')).join(' ');
  assert.match(cabecera, /radioVacio/);
  assert.match(cabecera, /bordeRadio/);
  sinErrores(m);
});

test('Tema.color devuelve una copia: tocarla no cambia el tema; un token desconocido es un error de uso', () => {
  const m = nuevaMaquina();
  m.lua('local c = SnetForever.Tema.color("fondo"); c[1] = 1; c[4] = 0');
  assert.equal(aHex(m.lua('SnetForever.Tema.color("fondo")')), '191717');
  assert.equal(m.lua('SnetForever.Tema.color("fondo")')[3], 1);
  assert.throws(() => m.lua('SnetForever.Tema.color("nada")'), /token desconocido/);
  sinErrores(m);
});

test('Tema.dinero(104907) da 10g 49s 07c con los colores de oro, plata y cobre', () => {
  const m = nuevaMaquina();
  // El plan escribía «dinero(1049707) da 10g 49s 07c», pero 1049707 de cobre son 104g 97s 07c: 10g 49s 07c son 104907.
  assert.equal(
    m.lua('SnetForever.Tema.dinero(104907)'),
    `|cffdfbd0b10g|r |cff${ELEGIDOS.plata}49s|r |cffc0885007c|r`,
  );
  assert.equal(
    m.lua('SnetForever.Tema.dinero(1049707)'),
    `|cffdfbd0b104g|r |cff${ELEGIDOS.plata}97s|r |cffc0885007c|r`,
  );
  sinErrores(m);
});

test('Tema.dinero: sin ceros a la izquierda, céntimos a dos cifras y negativos', () => {
  const m = nuevaMaquina();
  const quitar = (t) => t.replace(/\|cff[0-9a-f]{6}|\|r/g, '');
  const dinero = (n) => quitar(m.lua(`SnetForever.Tema.dinero(${n})`));
  assert.equal(dinero(0), '0c');
  assert.equal(dinero(5), '5c');
  assert.equal(dinero(105), '1s 05c');
  assert.equal(dinero(10000), '1g 00s 00c');
  assert.equal(dinero(100007), '10g 00s 07c');
  assert.equal(dinero(-250), '-2s 50c');
  assert.equal(m.lua('SnetForever.Tema.dinero(nil)'), '|cffc088500c|r');
  sinErrores(m);
});

const letraDe = (m, tipo, tamano = 'nil') => m.lua(`(function()
  local s = CreateFrame("Frame", nil, UIParent):CreateFontString(nil, "OVERLAY")
  local devuelto = SnetForever.Tema.letra(s, "${tipo}", ${tamano})
  return {s:GetFont(), select(2, s:GetFont()), devuelto == s}
end)()`);

const FORGE_FONT_PATH = 'Interface\\AddOns\\SnetForever\\recursos\\fonts\\';
const FORGE_FONT_ROLES = {
  logo: ['AlegreyaSC-Bold', 16], titulo: ['AlegreyaSC-Bold', 14],
  pestana: ['BarlowSemiCondensed-SemiBold', 12], etiqueta: ['BarlowSemiCondensed-SemiBold', 12],
  texto: ['BarlowSemiCondensed-Medium', 12], boton: ['BarlowSemiCondensed-SemiBold', 12],
  tabla: ['BarlowSemiCondensed-Medium', 12], tablaNegrita: ['BarlowSemiCondensed-SemiBold', 12],
  mayusculas: ['BarlowSemiCondensed-SemiBold', 10], cabecera: ['BarlowSemiCondensed-SemiBold', 11],
};

test('commerce uses the Forge font roles and keeps the client font when a bundle is unavailable', () => {
  const m = nuevaMaquina();
  for (const [role, [file, size]] of Object.entries(FORGE_FONT_ROLES)) {
    assert.deepEqual(letraDe(m, role), [FORGE_FONT_PATH + file + '.ttf', size, true]);
  }
  assert.equal(letraDe(m, 'texto', 14)[1], 14);
  assert.throws(() => letraDe(m, 'inventado'), /tipo desconocido/);

  const missing = nuevaMaquina({ addon: RAIZ_SIN_LETRAS() });
  assert.deepEqual(letraDe(missing, 'logo', 20).slice(0, 2), ['Fonts\\FRIZQT__.TTF', 20]);
  assert.deepEqual(letraDe(missing, 'texto').slice(0, 1), ['Fonts\\FRIZQT__.TTF']);
  assert.deepEqual(letraDe(missing, 'tabla', 12).slice(0, 2), ['Fonts\\ARIALN.TTF', 12]);
  assert.deepEqual(letraDe(missing, 'tablaNegrita').slice(0, 1), ['Fonts\\ARIALN.TTF']);
  sinErrores(m);
  sinErrores(missing);
});

test('use the client font for unsupported character sets without changing role sizes', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'koKR' } });
  const clientFont = m.lua('(GameFontNormal:GetFont())');
  assert.deepEqual(letraDe(m, 'logo'), [clientFont, 16, true]);
  assert.deepEqual(letraDe(m, 'tabla'), [clientFont, 12, true]);
  sinErrores(m);
});

test('el tema da los tamaños de letra nuevos y las tablas su alto de fila', () => {
  const m = nuevaMaquina();
  const base = FORGE_FONT_PATH;
  for (const [tipo, [archivo, tamano]] of Object.entries(FORGE_FONT_ROLES)) {
    const [ruta, tam] = letraDe(m, tipo);
    assert.equal(ruta, `${base}${archivo}.ttf`, `${tipo}: la letra`);
    assert.equal(tam, tamano, `${tipo}: el tamaño`);
    assert.equal(m.lua(`SnetForever.Tema.TAMANOS.${tipo}`), tamano, `${tipo}: Tema.TAMANOS`);
  }
  // Sin sombra (nítida), aunque el texto la trajera puesta; sin contorno.
  const sombra = m.lua(`(function()
    local s = CreateFrame("Frame", nil, UIParent):CreateFontString(nil, "OVERLAY")
    s:SetShadowOffset(1, -1)
    SnetForever.Tema.letra(s, "tabla")
    local x, y = s:GetShadowOffset()
    return {x, y, select(3, s:GetFont())}
  end)()`);
  assert.deepEqual(sombra, [0, 0, ''], 'sin sombra y sin contorno');
  // El alto de fila de las tablas sigue a la letra de las filas: 22 px con la letra de 12.
  assert.equal(m.lua('SnetForever.Tema.ALTO_FILA'), 22);
  // La tabla de la subasta (TablaComercio: resultados, sniper, lista vieja y cuadro de cantidad) y la de la ventana principal
  // (Piezas.tabla) usan ese alto y la letra del tema.
  const r = m.lua(`(function()
    local tc = SnetForever.TablaComercio.crear(UIParent, {
      columnas = {{clave = "n", titulo = "Nombre", ancho = 100, valor = function(f) return f.n end}}, filasVisibles = 3})
    tc:poner({{clave = "a", n = "Alfa"}})
    local marco = CreateFrame("Frame", nil, UIParent)
    marco:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, 100)
    marco:SetSize(400, 300)
    local pt = SnetForever.Piezas.tabla(marco, {columnas = {{clave = "n", titulo = "Nombre", flex = 1, valor = function(f) return f.n end}}})
    pt:poner({{clave = "a", n = "Alfa"}, {clave = "b", n = "Beta"}})
    local celda, cab = tc.huecos[1].celdas.n, tc.cabeceras.n.texto
    local sx, sy = celda:GetShadowOffset()
    return {
      tcFila = tc.huecos[1]:GetHeight(), tcCab = tc.cabeceras.n:GetHeight(),
      tcLetra = {celda:GetFont()}, tcCabLetra = {cab:GetFont()}, tcSombra = {sx, sy},
      ptFila = pt.filas[1]:GetHeight(), ptLetra = {pt.filas[1].celdas.n.texto:GetFont()},
    }
  end)()`);
  assert.equal(r.tcFila, 22, 'TablaComercio: filas de 22 px');
  assert.equal(r.tcCab, 22, 'TablaComercio: cabecera de 22 px');
  assert.deepEqual(r.tcLetra.slice(0, 2), [`${base}BarlowSemiCondensed-Medium.ttf`, 12], 'TablaComercio: la letra «tabla»');
  assert.deepEqual(r.tcCabLetra.slice(0, 2), [`${base}BarlowSemiCondensed-SemiBold.ttf`, 11], 'TablaComercio: la letra «cabecera»');
  assert.deepEqual(r.tcSombra, [0, 0], 'TablaComercio: sin sombra');
  assert.equal(r.ptFila, 22, 'Piezas.tabla: filas de 22 px');
  assert.deepEqual(r.ptLetra.slice(0, 2), [`${base}BarlowSemiCondensed-Medium.ttf`, 12], 'Piezas.tabla: la letra «tabla»');
  sinErrores(m);
});

// Fixture without the Forge font bundle to verify the native font fallback.
const copias = [];
function RAIZ_SIN_LETRAS() {
  const dir = mkdtempSync(join(tmpdir(), 'snf-sin-letras-'));
  copias.push(dir);
  const destino = join(dir, 'SnetForever');
  cpSync(ADDON, destino, { recursive: true, filter: (source) => !/recursos[\\/]fonts/.test(source) });
  cpSync(COMERCIO, join(dir, 'SnetForever_Comercio'), { recursive: true });
  return destino;
}
after(() => copias.forEach((d) => rmSync(d, { recursive: true, force: true })));

testSiempre('banco: SetFont con un archivo de Interface\\AddOns que no existe da false y deja la letra de antes; con uno que existe, true', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local s = CreateFrame("Frame", nil, UIParent):CreateFontString(nil, "OVERLAY")
    local a = s:SetFont("Fonts\\\\FRIZQT__.TTF", 11, "")
    local b = s:SetFont("Interface\\\\AddOns\\\\SnetForever_Comercio\\\\recursos\\\\letras\\\\NoExiste.ttf", 13, "")
    local c = s:SetFont("Interface\\\\AddOns\\\\SnetForever_Comercio\\\\recursos\\\\letras\\\\Roboto-Bold.ttf", 12, "")
    local ruta, tam = s:GetFont()
    local e = CreateFrame("EditBox", nil, UIParent)
    local d = e:SetFont("Interface\\\\AddOns\\\\SnetForever\\\\nada.ttf", 11, "")
    return {a, b, c, ruta, tam, d}
  end)()`);
  assert.deepEqual(r, [true, false, true, 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\letras\\Roboto-Bold.ttf', 12, false]);
  sinErrores(m);
});

test('los archivos de letra existen con su licencia al lado', () => {
  const carpeta = join(ADDON, 'recursos', 'fonts');
  const archivos = readdirSync(carpeta);
  const ttf = archivos.filter((a) => a.endsWith('.ttf'));
  const esperados = [...new Set(Object.values(FORGE_FONT_ROLES).map(([name]) => name + '.ttf'))];
  assert.deepEqual([...ttf].sort(), esperados.sort());
  for (const archivo of ttf) {
    const familia = archivo.split('-')[0];
    const licencia = archivos.find((a) => a.toLowerCase() === familia.toLowerCase() + '-ofl.txt');
    assert.ok(licencia, `${archivo}: falta ${familia}-OFL.txt`);
    assert.match(readFileSync(join(carpeta, licencia), 'utf8'), /SIL Open Font License, Version 1\.1/, licencia);
    // TTF de verdad (cabecera 00 01 00 00) y estático (sin la tabla fvar de las letras variables).
    const bytes = readFileSync(join(carpeta, archivo));
    assert.deepEqual([...bytes.subarray(0, 4)], [0, 1, 0, 0], `${archivo}: cabecera TTF`);
    const tablas = bytes.readUInt16BE(4);
    const nombres = [];
    for (let i = 0; i < tablas; i++) nombres.push(bytes.toString('latin1', 12 + i * 16, 16 + i * 16));
    assert.ok(!nombres.includes('fvar'), `${archivo}: es una letra variable`);
  }
});

test('el atlas tiene todos los iconos con coordenadas dentro de 0..1', () => {
  const m = nuevaMaquina();
  const nombres = m.lua('SnetForever.Tema.nombresIconos()');
  assert.deepEqual(nombres, [
    'copiar', 'vinculo', 'mas', 'papelera', 'lapiz', 'importar', 'exportar', 'menu', 'tilde', 'restablecer', 'operacion',
    'lupa', 'carpeta', 'abierto', 'cerrado', 'cerrar', 'asa', 'desplegar', 'alerta', 'circulo', 'aro', 'abrir',
    'puntos', 'reloj', 'pausa', 'seguir', 'leyendo', // B3r: ↻ de la fila que espera su lectura
    'sube', 'baja', // T1b: las flechas del % del tooltip
    'masCirculo', // Task 22: ⊕ para crear en el árbol de operaciones
    'ventana', 'intercambio', // Task 32: ⧉ de la fila de operación de Grupos y ⇄ de la cabecera del editor
    'expandirTodo',
  ]);
  assert.deepEqual(ICONOS.map((i) => i.nombre), nombres, 'el generador dibuja los mismos, en el mismo orden');
  const atlas = atlasIconos();
  const ancho = atlas.readUInt16LE(12);
  const alto = atlas.readUInt16LE(14);
  const vistos = new Set();
  nombres.forEach((nombre, n) => {
    const r = m.lua(`(function()
      local t = CreateFrame("Frame", nil, UIParent):CreateTexture(nil, "ARTWORK")
      SnetForever.Tema.icono(t, "${nombre}")
      return {t:GetTexture(), t:GetTexCoord()}
    end)()`);
    assert.equal(r[0], 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\iconos');
    const [, ulx, uly, , lly, urx, , , ] = r;
    const [izq, arriba, abajo, der] = [ulx, uly, lly, urx];
    for (const v of [izq, der, arriba, abajo]) assert.ok(v >= 0 && v <= 1, `${nombre}: ${v}`);
    // Una celda de 16 x 16 píxeles del atlas.
    assert.ok(Math.abs((der - izq) * ancho - CELDA) < 1e-9, `${nombre}: ancho`);
    assert.ok(Math.abs((abajo - arriba) * alto - CELDA) < 1e-9, `${nombre}: alto`);
    // Es la celda donde el generador dibujó el icono, y tiene algo dibujado (blanco con alfa).
    const columna = Math.round(izq * ancho / CELDA);
    const fila = Math.round(arriba * alto / CELDA);
    assert.equal(fila * COLUMNAS + columna, n, `${nombre}: posición`);
    vistos.add(`${columna},${fila}`);
    let visibles = 0;
    for (let y = 0; y < CELDA; y++) {
      for (let x = 0; x < CELDA; x++) {
        const i = 18 + ((fila * CELDA + y) * ancho + columna * CELDA + x) * 4;
        if (atlas[i + 3] > 0) {
          visibles++;
          assert.deepEqual([atlas[i], atlas[i + 1], atlas[i + 2]], [255, 255, 255], `${nombre}: blanco`);
        }
      }
    }
    assert.ok(visibles >= 10, `${nombre}: tiene que dibujar algo (${visibles} píxeles)`);
  });
  assert.equal(vistos.size, nombres.length, 'cada icono tiene su celda');
  assert.ok(nombres.length <= COLUMNAS * FILAS);
  assert.throws(() => m.lua('SnetForever.Tema.icono(CreateFrame("Frame"):CreateTexture(), "inventado")'), /icono desconocido/);
  sinErrores(m);
});

// Task 32: ⧉ (un cuadrado abierto por la esquina de arriba a la derecha con una flecha que sale en diagonal) y ⇄ (dos flechas
// horizontales, una hacia cada lado), dibujados con código propio.
test('the 256 × 64 atlas keeps the existing glyphs and adds bulk expansion', () => {
  const m = nuevaMaquina();
  const nombres = m.lua('SnetForever.Tema.nombresIconos()');
  assert.deepEqual(nombres.slice(-3), ['ventana', 'intercambio', 'expandirTodo']);
  assert.ok(nombres.includes('abrir'), 'el icono «abrir» (↗) se queda en el atlas');
  assert.equal(nombres.length, 33);
  assert.equal(COLUMNAS * FILAS, 64);
  assert.deepEqual(ICONOS.map((i) => i.nombre), nombres, 'el generador dibuja los mismos, en el mismo orden');
  const atlas = atlasIconos();
  const ancho = atlas.readUInt16LE(12);
  assert.equal(ancho, 256);
  assert.equal(atlas.readUInt16LE(14), 64);
  const celda = (nombre) => {
    const n = nombres.indexOf(nombre);
    const x0 = (n % COLUMNAS) * CELDA;
    const y0 = Math.floor(n / COLUMNAS) * CELDA;
    return (x, y) => atlas[18 + ((y0 + y) * ancho + x0 + x) * 4 + 3];
  };
  for (const nombre of ['ventana', 'intercambio', 'expandirTodo']) {
    const c = m.lua(`(function()
      local t = CreateFrame("Frame", nil, UIParent):CreateTexture(nil, "ARTWORK")
      SnetForever.Tema.icono(t, "${nombre}")
      local izq, arriba, _, abajo, der = t:GetTexCoord()
      return {izq, der, arriba, abajo}
    end)()`);
    for (const v of c) assert.ok(v >= 0 && v <= 1, `${nombre}: ${v}`);
    assert.ok(c[1] > c[0] && c[3] > c[2], `${nombre}: celda con ancho y alto`);
    const alfa = celda(nombre);
    let visibles = 0;
    for (let y = 0; y < CELDA; y++) for (let x = 0; x < CELDA; x++) if (alfa(x, y) > 0) visibles++;
    assert.ok(visibles >= 30, `${nombre}: tiene que dibujar algo (${visibles} píxeles)`);
    // No es una copia de otro icono del atlas.
    for (const otro of ['abrir', 'copiar']) {
      const b = celda(otro);
      let distintos = 0;
      for (let y = 0; y < CELDA; y++) for (let x = 0; x < CELDA; x++) if (Math.abs(alfa(x, y) - b(x, y)) > 64) distintos++;
      assert.ok(distintos >= 10, `${nombre} no es ${otro} (${distintos} píxeles distintos)`);
    }
  }
  // ⧉: el lado izquierdo y el de abajo del cuadrado están; la esquina de arriba a la derecha del cuadrado no (por ahí sale la
  // flecha), y la punta de la flecha llega arriba a la derecha de la celda.
  const v = celda('ventana');
  assert.ok(v(2, 9) > 128 && v(7, 13) > 128, 'lado izquierdo y lado de abajo');
  assert.ok(v(13, 2) > 128, 'la punta de la flecha, arriba a la derecha');
  assert.equal(v(11, 7), 0, 'el lado derecho del cuadrado no llega arriba');
  assert.equal(v(8, 4), 0, 'el lado de arriba del cuadrado no llega a la derecha');
  // ⇄: una flecha arriba y otra abajo, y dando media vuelta a la celda queda igual (una hacia cada lado).
  const d = celda('intercambio');
  let arriba = 0;
  let abajo = 0;
  for (let y = 0; y < CELDA; y++) {
    for (let x = 0; x < CELDA; x++) {
      if (d(x, y) > 0) (y < 8 ? arriba++ : abajo++);
      assert.ok(Math.abs(d(x, y) - d(CELDA - 1 - x, CELDA - 1 - y)) <= 48, `intercambio: (${x}, ${y}) y su media vuelta`);
    }
  }
  assert.ok(arriba >= 15 && abajo >= 15, `una flecha arriba (${arriba}) y otra abajo (${abajo})`);
  assert.ok(d(13, 5) > 0 && d(2, 5) > 0 && d(2, 11) > 0 && d(13, 11) > 0, 'las dos flechas cruzan la celda');
  // La de arriba apunta a la derecha: su punta (columna 13) es más estrecha que su arranque ancho (columna 10).
  const altoColumna = (x, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) if (d(x, y) > 128) n++; return n; };
  assert.ok(altoColumna(10, 0, 8) > altoColumna(4, 0, 8), 'arriba: la punta ancha está a la derecha');
  assert.ok(altoColumna(5, 8, 16) > altoColumna(11, 8, 16), 'abajo: la punta ancha está a la izquierda');
  sinErrores(m);
});

test('circulo y aro dejan su borde libre (fila 0, fila 15, columna 0 y columna 15 con alfa 0): el filtro no sangra a la celda vecina', () => {
  const atlas = readFileSync(join(RECURSOS, 'iconos.tga'));
  const ancho = atlas.readUInt16LE(12);
  const nombres = ICONOS.map((i) => i.nombre);
  for (const nombre of ['circulo', 'aro']) {
    const n = nombres.indexOf(nombre);
    assert.ok(n >= 0, nombre);
    const x0 = (n % COLUMNAS) * CELDA;
    const y0 = Math.floor(n / COLUMNAS) * CELDA;
    const alfa = (x, y) => atlas[18 + ((y0 + y) * ancho + x0 + x) * 4 + 3];
    let dibujados = 0;
    for (let k = 0; k < CELDA; k++) {
      assert.equal(alfa(k, 0), 0, `${nombre}: fila 0, columna ${k}`);
      assert.equal(alfa(k, CELDA - 1), 0, `${nombre}: fila 15, columna ${k}`);
      assert.equal(alfa(0, k), 0, `${nombre}: columna 0, fila ${k}`);
      assert.equal(alfa(CELDA - 1, k), 0, `${nombre}: columna 15, fila ${k}`);
    }
    for (let y = 0; y < CELDA; y++) for (let x = 0; x < CELDA; x++) if (alfa(x, y) > 0) dibujados++;
    assert.ok(dibujados >= 40, `${nombre}: sigue dibujando algo (${dibujados} píxeles)`);
  }
});

test('las texturas del repo son iguales a lo que genera tools/texturas/generar.mjs', () => {
  assert.ok(readFileSync(join(RECURSOS, 'iconos.tga')).equals(atlasIconos()), 'iconos.tga: vuelve a lanzar node tools/texturas/generar.mjs');
  assert.ok(readFileSync(join(RECURSOS, 'esquina.tga')).equals(esquina()), 'esquina.tga: vuelve a lanzar node tools/texturas/generar.mjs');
});

test('las texturas son TGA de 32 bits sin comprimir, con la cabecera de recursos/icono.tga y lados en potencias de 2', () => {
  const potencia = (n) => n > 0 && (n & (n - 1)) === 0;
  const referencia = readFileSync(join(ADDON, 'recursos', 'icono.tga'));
  const archivos = [
    [RECURSOS, 'iconos.tga'], [RECURSOS, 'esquina.tga'],
    [join(ADDON, 'recursos'), 'forge-plate.tga'], [join(ADDON, 'recursos'), 'forge-controls.tga'],
  ];
  for (const [carpeta, archivo] of archivos) {
    const b = readFileSync(join(carpeta, archivo));
    assert.equal(b[0], 0, `${archivo}: sin campo de id`);
    assert.equal(b[1], 0, `${archivo}: sin paleta`);
    assert.equal(b[2], 2, `${archivo}: color verdadero sin comprimir`);
    assert.equal(b[16], 32, `${archivo}: 32 bits`);
    assert.equal(b[17], referencia[17], `${archivo}: descriptor como icono.tga (origen arriba a la izquierda, 8 de alfa)`);
    const [ancho, alto] = [b.readUInt16LE(12), b.readUInt16LE(14)];
    assert.ok(potencia(ancho) && potencia(alto), `${archivo}: ${ancho} x ${alto}`);
    assert.equal(b.length, 18 + ancho * alto * 4, `${archivo}: tamaño`);
  }
});

test('Tema.panel: fondo del color del token con cuatro esquinas de 3 px; con borde, otras tantas del color del borde', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local Tema = SnetForever.Tema
    local f = CreateFrame("Frame", nil, UIParent)
    f:SetSize(100, 50)
    local devuelto = Tema.panel(f, "lateral")
    local sin = {}
    for _, t in ipairs({f:GetRegions()}) do local r, g, b = t:GetVertexColor(); sin[#sin + 1] = {t:GetTexture(), r, g, b} end
    local g = CreateFrame("Frame", nil, UIParent)
    g:SetSize(100, 50)
    Tema.panel(g, "hundido", {borde = true})
    local con = {}
    for _, t in ipairs({g:GetRegions()}) do local r, g2, b = t:GetVertexColor(); con[#con + 1] = {t:GetTexture(), r, g2, b, t:IsShown() and 1 or 0} end
    Tema.panel(g, "secundario", {borde = true})
    local otra = {g:GetRegions()}
    local recolor = {otra[#otra]:GetVertexColor()}
    return {devuelto == f, sin, con, #otra, recolor}
  end)()`);
  const [devuelveMarco, sin, con, total, recolor] = r;
  assert.equal(devuelveMarco, true);
  const esquinas = (lista) => lista.filter((t) => t[0] === 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\esquina');
  assert.equal(sin.length, 7, 'centro, franja de arriba, franja de abajo y cuatro esquinas');
  assert.equal(esquinas(sin).length, 4);
  for (const t of sin) assert.equal(aHex(t.slice(1)), COLORES.lateral);
  assert.equal(con.length, 7 + 7, 'el borde (una forma entera) y el fondo metido 1 px');
  assert.equal(esquinas(con).length, 8);
  assert.equal(total, 14, 'cambiar el color no crea más texturas');
  const visibles = con.filter((t) => t[4] === 1);
  assert.equal(visibles.length, 14);
  assert.equal(visibles.filter((t) => aHex(t.slice(1)) === COLORES.borde).length, 7, 'siete del color del borde');
  assert.equal(visibles.filter((t) => aHex(t.slice(1)) === COLORES.hundido).length, 7, 'siete del color del fondo');
  assert.equal(aHex(recolor), COLORES.secundario, 'la segunda llamada repinta el fondo');
  sinErrores(m);
});

test('la versión es 0.7.0', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.VERSION'), '0.7.0');
  assert.match(readFileSync(join(ADDON, 'SnetForever.toc'), 'utf8'), /^## Version: 0.7.0\r?$/m);
  sinErrores(m);
});

test('keep the loaded Forge font when the client returns nil from SetFont', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.setFontDevuelveNil = true');
  const [ruta, , devuelveFs] = letraDe(m, 'logo', 18);
  assert.equal(ruta, FORGE_FONT_PATH + 'AlegreyaSC-Bold.ttf');
  assert.equal(devuelveFs, true);
  assert.equal(letraDe(m, 'tabla')[0], FORGE_FONT_PATH + 'BarlowSemiCondensed-Medium.ttf');
  // Y el interruptor de verdad hace que SetFont dé nil.
  assert.equal(m.lua('(function() local s = CreateFrame("Frame"):CreateFontString(); return s:SetFont("Fonts\\\\FRIZQT__.TTF", 11, "") == nil end)()'), true);
  // Si además el archivo no existe, sigue cayendo a la letra del juego (el banco da false aunque el cliente sea antiguo).
  const sin = nuevaMaquina({ addon: RAIZ_SIN_LETRAS() });
  sin.lua('BANCO.setFontDevuelveNil = true');
  assert.deepEqual(letraDe(sin, 'logo', 20).slice(0, 2), ['Fonts\\FRIZQT__.TTF', 20]);
  sinErrores(m);
});

test('a nil result with the previous font triggers the native fallback', () => {
  const m = nuevaMaquina();
  const calls = m.lua(`(function()
    local calls = {}
    local fontString = {
      SetFont = function(_, path) calls[#calls + 1] = path end,
      GetFont = function() return "Fonts\\\\Different.ttf" end,
    }
    SnetForever.Estilo.forgeFont(fontString, "body", 12, "Fonts\\\\FRIZQT__.TTF")
    return calls
  end)()`);
  assert.deepEqual(calls, [FORGE_FONT_PATH + 'BarlowSemiCondensed-Medium.ttf', 'Fonts\\FRIZQT__.TTF']);
  sinErrores(m);
});

test('a font file rejected during reload leaves localized native text available', () => {
  const m = nuevaMaquina();
  const state = m.lua(`(function()
    local clientFont, path, size
    local fs = {
      SetFontObject = function(_, object) clientFont = object end,
      SetFont = function(_, file, height)
        if file:find("Interface") then error("unknown font asset") end
        path, size = file, height
      end,
      GetFont = function() return path, size end,
    }
    SnetForever.Estilo.forgeFont(fs, "heading", 15)
    return {clientFont == GameFontNormal, path == GameFontNormal:GetFont(), size}
  end)()`);
  assert.deepEqual(state, [true, true, 15]);
  sinErrores(m);
});

test('Ronda 1: Tema.panel con borde y luego sin él deja lo mismo que llamar solo sin él', () => {
  const m = nuevaMaquina();
  const foto = (cuerpo) => m.lua(`(function()
    local f = CreateFrame("Frame", nil, UIParent)
    f:SetSize(100, 50)
    ${cuerpo}
    local r = {}
    for _, t in ipairs({f:GetRegions()}) do
      if t:IsShown() then
        local p = {}
        for i = 1, t:GetNumPoints() do local a, _, b, x, y = t:GetPoint(i); p[#p + 1] = {a, b, x, y} end
        local rr, g, b = t:GetVertexColor()
        r[#r + 1] = {t:GetTexture(), p, t:GetWidth(), t:GetHeight(), rr, g, b}
      end
    end
    return r
  end)()`);
  const directo = foto('SnetForever.Tema.panel(f, "lateral")');
  const vuelta = foto('SnetForever.Tema.panel(f, "lateral", {borde = true}); SnetForever.Tema.panel(f, "lateral")');
  assert.equal(directo.length, 7);
  assert.deepEqual(vuelta, directo);
  // Y volver a ponerlo con borde también lo deja como la primera vez con borde.
  const conBorde = foto('SnetForever.Tema.panel(f, "lateral", {borde = true})');
  const ida = foto('SnetForever.Tema.panel(f, "lateral", {borde = true}); SnetForever.Tema.panel(f, "lateral"); SnetForever.Tema.panel(f, "lateral", {borde = true})');
  assert.equal(conBorde.length, 14);
  assert.deepEqual(ida, conBorde);
  sinErrores(m);
});

test('Tema.panel con colorBorde pinta el borde de ese token y vuelve a «borde» sin la opción', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local Tema = SnetForever.Tema
    local marco = CreateFrame("Frame", nil, UIParent)
    -- Las piezas del borde (subnivel 0) son las primeras 7 que crea Tema.panel.
    local function bordes()
      local r = {}
      for i, t in ipairs({marco:GetRegions()}) do
        if i <= 7 then r[#r + 1] = {t:GetVertexColor()} end
      end
      return r
    end
    Tema.panel(marco, "hundido", {borde = true})
    local normal = bordes()
    Tema.panel(marco, "hundido", {borde = true, colorBorde = "error"})
    local rojo = bordes()
    Tema.panel(marco, "hundido", {borde = true})
    local vuelta = bordes()
    return {normal, rojo, vuelta, Tema.color("error"), Tema.color("borde")}
  end)()`);
  const [normal, rojo, vuelta, error, borde] = r;
  assert.equal(normal.length, 7);
  for (const c of normal) assert.deepEqual(c.slice(0, 3), borde.slice(0, 3));
  for (const c of rojo) assert.deepEqual(c.slice(0, 3), error.slice(0, 3));
  for (const c of vuelta) assert.deepEqual(c.slice(0, 3), borde.slice(0, 3), 'sin la opción, el borde por defecto');
  sinErrores(m);
});

// Revisión B7, menores 10 y 11: el dinero sale de un solo sitio, SNF.Texto.dinero (el núcleo): Tema.dinero,
// Tema.dineroPlano, el chat y el diario. Las letras se guardan y se rehacen al cambiar de idioma.
test('B7: Tema.dineroPlano es SNF.Texto.dinero, y el chat de las propuestas también va con g/s/c', () => {
  const m = nuevaMaquina();
  for (const n of [0, 5, 105, 10000, 1402003, 99999999, -250]) {
    assert.equal(m.lua(`SnetForever.Tema.dineroPlano(${n})`), m.lua(`SnetForever.Texto.dinero(${n})`), `${n}`);
    assert.equal(m.lua(`SnetForever.Tema.dinero(${n})`).replace(/\|c[0-9a-f]{8}/gi, '').replace(/\|r/g, ''), m.lua(`SnetForever.Texto.dinero(${n})`));
  }
  assert.equal(m.lua('SnetForever.Texto.dinero(1402003)'), '140g 20s 03c');
  // La regla de una propuesta de comercio en el chat: el valor mínimo y el oro máximo con las mismas letras.
  m.lua('SlashCmdList.SNET("chat")');
  const registro = { t: 'respuesta', texto: 'Te propongo un grupo.', comercio: { grupo: { nombre: 'Hierbas', objetos: [2447, 765] }, regla: { valorMin: 50000, maxOro: 1402003 } } };
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_RESPUESTA", ${aLua(registro)})`);
  const t = m.lua('SnetForever.Chat.marcos.comercio.completo') || '';
  assert.ok(t.includes('5g 00s 00c') && t.includes('140g 20s 03c'), `con g/s/c: ${t}`);
  assert.ok(!/\d o\b|\d p\b/.test(t), `sin «o» ni «p»: ${t}`);
  sinErrores(m);
});

test('B7: las letras del dinero se rehacen al cambiar de idioma', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  assert.equal(m.lua('SnetForever.Tema.dineroPlano(10203)'), '1g 02s 03c');
  // Otras letras en inglés (solo en esta prueba): al cambiar de idioma salen las nuevas.
  m.lua('SnetForever.L.tablas.en.COMERCIO_ORO = "G"; SnetForever.L.tablas.en.COMERCIO_PLATA = "S"; SnetForever.L.tablas.en.COMERCIO_COBRE = "C"');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(m.lua('SnetForever.Tema.dineroPlano(10203)'), '1G 02S 03C');
  m.lua('SnetForever.Ajustes.set("idioma", "es")');
  assert.equal(m.lua('SnetForever.Tema.dineroPlano(10203)'), '1g 02s 03c');
  // Guardadas: con el mismo idioma no se vuelven a pedir.
  m.lua('_G.PEDIDAS = 0; local t = SnetForever.L.t; SnetForever.L.t = function(k, ...) if k == "COMERCIO_ORO" then PEDIDAS = PEDIDAS + 1 end return t(k, ...) end');
  for (let i = 0; i < 3; i++) m.lua('SnetForever.Tema.dinero(10203)');
  assert.equal(m.lua('PEDIDAS'), 0, 'las letras no se piden en cada llamada');
  sinErrores(m);
});

// Revisión B7, menor 10: los textos que ya no usa nadie no están (ni en es ni en en).
test('B7: fuera los textos sin uso (COMERCIO_TITULO, SUBASTA_RES_PUJA, COMERCIO_PESTANA_LISTA y las letras viejas del chat)', () => {
  const m = nuevaMaquina();
  for (const idioma of ['es', 'en']) {
    for (const clave of ['COMERCIO_TITULO', 'SUBASTA_RES_PUJA', 'COMERCIO_PESTANA_LISTA', 'CHAT_ORO_N', 'CHAT_PLATA_N', 'CHAT_COBRE_N']) {
      assert.equal(m.lua(`SnetForever.L.tablas.${idioma}.${clave}`), undefined, `${idioma}.${clave}`);
    }
  }
  sinErrores(m);
});
