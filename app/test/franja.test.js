// Franja en pantalla (ia/franja.lua): el banco dibuja los cuadritos, el ayudante los pinta en una imagen del tamaño de la
// pantalla física y la app los lee con el descodificador de verdad.
//
// regla de interfaz (16-nov, regla de interfaz): la franja SOLO se ve anclada al hueco del chat de la IA. Sin ancla
// no se enseña nunca (ni en la esquina, ni el aviso «Enviando a SnetForever…»), y cambia como mucho cada PERIODO = 0,5 s.
// Por eso casi todas las pruebas anclan la franja a un marco de prueba (como hace la ventana de chat) antes de mostrarla.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearMaquina } from '../../tools/banco-wow/src/maquina.js';
import { sinErrores } from '../../tools/banco-wow/test/ayuda.js';
import { buscarYDecodificar, pareceFranja } from '../src/franja/codec.mjs';
import { franjaComoImagen } from './ayuda/franja-banco.mjs';

const maquinas = [];
function nueva(opciones = {}) {
  const m = crearMaquina(opciones);
  maquinas.push(m);
  return m;
}
// Las máquinas de cada prueba se cierran al acabarla: guardarlas hasta el final del archivo agotaba el montón de Node.
afterEach(() => {
  maquinas.splice(0).forEach((m) => m.cerrar());
});

const literalLua = (texto) => `"${[...Buffer.from(texto, 'latin1')].map((b) => `\\${String(b).padStart(3, '0')}`).join('')}"`;
const mostrar = (m, partes, base) => m.lua(`SnetForever.Franja.mostrar({${partes.map(literalLua).join(', ')}}, ${base})`);
const entero = (v) => Math.abs(v - Math.round(v)) < 1e-3;

function decodificar(m) {
  const imagen = franjaComoImagen(m);
  assert.ok(entero(imagen.origen.x) && entero(imagen.origen.y), `la franja cae en medios píxeles: ${JSON.stringify(imagen.origen)}`);
  return { imagen, r: buscarYDecodificar(imagen) };
}

// Sin la franja en pantalla: ninguna celda a la vista, el descodificador no encuentra nada y no hay aviso.
function nadaEnPantalla(m, mensaje = '') {
  assert.equal(m.lua('SnetForever.Franja.visible()'), false, `franja visible ${mensaje}`);
  const imagen = franjaComoImagen(m);
  assert.equal(imagen.texturas, 0, `celdas a la vista ${mensaje}`);
  assert.equal(buscarYDecodificar(imagen).tipo, 'nada', `se decodifica algo ${mensaje}`);
  assert.equal(pareceFranja(imagen), false, `parece franja ${mensaje}`);
  if (m.lua('SnetForeverFranjaAviso ~= nil')) {
    assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false, `aviso visible ${mensaje}`);
  }
}

function marcoDePrueba(m, x, y) {
  m.lua(`(function()
    local f = CreateFrame("Frame", "MarcoPrueba", UIParent)
    f:SetSize(500, 300)
    f:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", ${x}, ${y})
  end)()`);
}

// Como la ventana de chat: la franja en la esquina superior izquierda del hueco, a (2, -2). El marco de prueba está en
// (X_HUECO, Y_HUECO) unidades de UIParent y mide 500 × 300.
const X_HUECO = 300.4;
const Y_HUECO = 200.3;
function anclarComoElChat(m) {
  marcoDePrueba(m, X_HUECO, Y_HUECO);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "TOPLEFT", 2, -2)');
}
// Dónde cae la esquina de la franja anclada como el chat (px desde la esquina superior izquierda de la pantalla).
const origenComoElChat = (escalaUI, alto) => {
  const k = (escalaUI * alto) / 768;
  return { x: Math.round((X_HUECO + 2) * k), y: alto - Math.round((Y_HUECO + 300 - 2) * k) };
};

// Una máquina con la franja ya anclada como el chat.
function anclada(opciones = {}) {
  const m = nueva(opciones);
  anclarComoElChat(m);
  return m;
}
const PERIODO = (m) => m.lua('SnetForever.Franja.PERIODO');

for (const [ancho, alto] of [[1920, 1080], [2560, 1440]]) {
  test(`mostrar una parte anclada a ${ancho}×${alto}: escala 768/alto, 1 unidad = 1 px y se decodifica`, () => {
    const m = anclada({ pantalla: { ancho, alto } });
    assert.equal(m.lua('SnetForever.Franja.visible()'), false);
    mostrar(m, ['abc'], 100);
    assert.equal(m.lua('SnetForever.Franja.visible()'), true);
    const { imagen, r } = decodificar(m);
    assert.ok(Math.abs(imagen.escala - 768 / alto) < 1e-6, `escala ${imagen.escala}`);
    assert.equal(pareceFranja(imagen), true);
    assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
    assert.equal(r.id, 100);
    assert.equal(r.bytes.toString('latin1'), 'abc');
    assert.deepEqual(imagen.origen, origenComoElChat(1, alto));
    assert.equal(m.marco('SnetForeverFranja').padre, 'UIParent');
    sinErrores(m);
  });
}

test('el marco es de UIParent, de estrato TOOLTIP, ignora la escala y la transparencia del padre y mide 400 × 40', () => {
  const m = anclada();
  mostrar(m, ['abc'], 1);
  assert.equal(m.lua('SnetForeverFranja:GetFrameStrata()'), 'TOOLTIP');
  assert.equal(m.lua('SnetForeverFranja:GetFrameLevel()'), 10000);
  assert.equal(m.lua('SnetForeverFranja:IsIgnoringParentScale()'), true);
  assert.equal(m.lua('SnetForeverFranja:IsIgnoringParentAlpha()'), true);
  const e = m.marco('SnetForeverFranja');
  assert.equal(e.ancho, 400);
  assert.equal(e.alto, 40);
  sinErrores(m);
});

for (const [ancho, alto] of [[1920, 1080], [2560, 1440]]) {
  test(`con UIParent a escala 0,7 (${ancho}×${alto}) la franja anclada sigue siendo de 1 px por unidad y se decodifica`, () => {
    const m = nueva({ pantalla: { ancho, alto } });
    m.lua('UIParent:SetScale(0.7)');
    anclarComoElChat(m);
    mostrar(m, ['abc'], 5);
    const { imagen, r } = decodificar(m);
    assert.ok(Math.abs(imagen.escala - 768 / alto) < 1e-6);
    assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
    assert.equal(r.id, 5);
    assert.equal(r.bytes.toString('latin1'), 'abc');
    assert.deepEqual(imagen.origen, origenComoElChat(0.7, alto));
    sinErrores(m);
  });
}

for (const [escalaUI, ancho, alto] of [[1, 1920, 1080], [0.7, 1920, 1080], [1, 2560, 1440]]) {
  test(`anclada a un marco en posición fraccionaria (UIParent a ${escalaUI}, ${ancho}×${alto}): píxeles enteros y se decodifica`, () => {
    const m = nueva({ pantalla: { ancho, alto } });
    m.lua(`UIParent:SetScale(${escalaUI})`);
    marcoDePrueba(m, 100.4, 50.3);
    m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 5.3, 4.2)');
    mostrar(m, ['hola mundo'], 7);
    const k = (escalaUI * alto) / 768;
    const { imagen, r } = decodificar(m);
    assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
    assert.equal(r.bytes.toString('latin1'), 'hola mundo');
    assert.equal(imagen.origen.x, Math.round((100.4 + 5.3) * k));
    assert.equal(imagen.origen.y, alto - Math.round((50.3 + 4.2) * k));
    sinErrores(m);
  });
}

test('anclar con otro punto del marco (esquina superior derecha) y con el marco redimensionado', () => {
  const m = nueva();
  marcoDePrueba(m, 200, 100);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "TOPRIGHT", -10, -4)');
  mostrar(m, ['xyz'], 1);
  const k = 1080 / 768;
  const { imagen, r } = decodificar(m);
  assert.equal(r.tipo, 'decodificada');
  assert.equal(imagen.origen.x, Math.round((200 + 500 - 10) * k));
  assert.equal(imagen.origen.y, 1080 - Math.round((100 + 300 - 4) * k));
  sinErrores(m);
});

test('al mover el marco, la franja se mueve (en el siguiente fotograma) y sigue cayendo en píxeles enteros', () => {
  const m = nueva();
  marcoDePrueba(m, 100.4, 50.3);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 0, 0)');
  mostrar(m, ['abc'], 1);
  const antes = decodificar(m);
  assert.equal(antes.r.tipo, 'decodificada');
  m.lua('MarcoPrueba:ClearAllPoints(); MarcoPrueba:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 333.7, 210.2)');
  m.avanzar(0.05);
  const despues = decodificar(m);
  assert.equal(despues.r.tipo, 'decodificada', JSON.stringify(despues.r));
  const k = 1080 / 768;
  assert.equal(despues.imagen.origen.x, Math.round(333.7 * k));
  assert.equal(despues.imagen.origen.y, 1080 - Math.round(210.2 * k));
  assert.notDeepEqual(despues.imagen.origen, antes.imagen.origen);
  sinErrores(m);
});

test('anclar(nil) esconde la franja (no hay respaldo en la esquina): nada en pantalla; al volver a anclar sigue el mismo mensaje', () => {
  const m = nueva();
  marcoDePrueba(m, 300, 300);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba)');
  assert.equal(m.lua('SnetForever.Franja.anclada()'), true);
  mostrar(m, ['uno', 'dos'], 40);
  assert.equal(decodificar(m).r.id, 40);
  m.lua('SnetForever.Franja.anclar(nil)');
  assert.equal(m.lua('SnetForever.Franja.anclada()'), false);
  nadaEnPantalla(m, 'al desanclar');
  // Escondida no avanza: ni cambia de parte ni cuenta vueltas.
  m.avanzar(3 * PERIODO(m));
  nadaEnPantalla(m, 'tras esperar sin ancla');
  assert.equal(m.lua('SnetForever.Franja.vueltas()'), 0);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba)');
  const { imagen, r } = decodificar(m);
  assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
  assert.equal(r.id, 40);
  assert.equal(r.bytes.toString('latin1'), 'uno');
  assert.deepEqual(imagen.origen, { x: Math.round(300 * (1080 / 768)), y: 1080 - Math.round(300 * (1080 / 768)) });
  sinErrores(m);
});

test('la franja de un latido (sinAviso) se tira al desanclar: al volver a anclar no sale', () => {
  const m = anclada();
  m.lua(`SnetForever.Franja.mostrar({${literalLua('latido')}}, 32768, {sinAviso = true})`);
  assert.equal(decodificar(m).r.bytes.toString('latin1'), 'latido');
  m.lua('SnetForever.Franja.anclar(nil)');
  nadaEnPantalla(m, 'al desanclar el latido');
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "TOPLEFT", 2, -2)');
  nadaEnPantalla(m, 'al volver a anclar');
  sinErrores(m);
});

test('ocultar() quita la franja: «nada»', () => {
  const m = anclada();
  mostrar(m, ['abc'], 1);
  assert.equal(decodificar(m).r.tipo, 'decodificada');
  m.lua('SnetForever.Franja.ocultar()');
  assert.equal(m.lua('SnetForever.Franja.visible()'), false);
  const imagen = franjaComoImagen(m);
  assert.equal(imagen.texturas, 0);
  assert.equal(buscarYDecodificar(imagen).tipo, 'nada');
  assert.equal(pareceFranja(imagen), false);
  m.avanzar(1);
  assert.equal(m.lua('SnetForever.Franja.visible()'), false);
  sinErrores(m);
});

for (const [escalaUI, ancho, alto] of [[1, 1920, 1080], [1, 2560, 1440], [0.7, 1920, 1080]]) {
  test(`con 2 partes ancladas alternan cada 0,5 s y cuentan las vueltas (UIParent a ${escalaUI}, ${ancho}×${alto})`, () => {
    const m = nueva({ pantalla: { ancho, alto } });
    m.lua(`UIParent:SetScale(${escalaUI})`);
    anclarComoElChat(m);
    assert.equal(PERIODO(m), 0.5);
    mostrar(m, ['primera', 'segunda!'], 100);
    const lee = () => {
      const { imagen, r } = decodificar(m);
      assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
      assert.deepEqual(imagen.origen, origenComoElChat(escalaUI, alto));
      return [r.id, r.bytes.toString('latin1')];
    };
    assert.deepEqual(lee(), [100, 'primera']);
    assert.equal(m.lua('SnetForever.Franja.vueltas()'), 0);
    m.avanzar(0.45);
    assert.deepEqual(lee(), [100, 'primera'], 'a los 0,45 s sigue la primera');
    m.avanzar(0.1); // 0,55 s
    assert.deepEqual(lee(), [101, 'segunda!']);
    assert.equal(m.lua('SnetForever.Franja.vueltas()'), 0);
    m.avanzar(0.5); // 1,05 s
    assert.deepEqual(lee(), [100, 'primera']);
    assert.equal(m.lua('SnetForever.Franja.vueltas()'), 1);
    m.avanzar(0.5); // 1,55 s
    assert.deepEqual(lee(), [101, 'segunda!']);
    m.avanzar(0.5); // 2,05 s
    assert.deepEqual(lee(), [100, 'primera']);
    assert.equal(m.lua('SnetForever.Franja.vueltas()'), 2);
    sinErrores(m);
  });
}

test('leída como la app (cada 100 ms), con 2 partes: toda lectura se decodifica y la franja cambia como mucho 2 veces por segundo', () => {
  const m = anclada();
  mostrar(m, ['primera', 'segunda!'], 100);
  const lecturas = [];
  for (let i = 0; i < 40; i++) {
    // 4 s de lecturas
    const { r } = decodificar(m);
    assert.equal(r.tipo, 'decodificada', `lectura ${i}: ${JSON.stringify(r)}`);
    lecturas.push(r.id);
    m.avanzar(0.1);
  }
  assert.deepEqual([...new Set(lecturas)].sort(), [100, 101], 'se leen las dos partes');
  // Cada parte se mantiene al menos 0,5 s: 5 lecturas seguidas iguales entre dos cambios.
  const cambios = [];
  for (let i = 1; i < lecturas.length; i++) if (lecturas[i] !== lecturas[i - 1]) cambios.push(i);
  for (let j = 1; j < cambios.length; j++) assert.ok(cambios[j] - cambios[j - 1] >= 5, `cambios en ${cambios}`);
  assert.ok(cambios.length <= 8, `${cambios.length} cambios en 4 s`);
  sinErrores(m);
});

test('con una sola parte la franja anclada no cambia nada: no se repinta ninguna celda', () => {
  const m = anclada();
  mostrar(m, ['solo una'], 3);
  const antes = repintados(m);
  for (let i = 0; i < 20; i++) m.avanzar(0.1);
  assert.equal(repintados(m), antes);
  assert.equal(decodificar(m).r.bytes.toString('latin1'), 'solo una');
  sinErrores(m);
});

test('el número de trama de la parte k es (base + k - 1) % 65536', () => {
  const m = anclada();
  mostrar(m, ['uno', 'dos'], 65535);
  assert.equal(decodificar(m).r.id, 65535);
  m.avanzar(PERIODO(m) + 0.05);
  assert.equal(decodificar(m).r.id, 0);
  sinErrores(m);
});

test('mostrar de nuevo con otro mensaje empieza por su primera parte y reinicia las vueltas', () => {
  const m = anclada();
  mostrar(m, ['a1', 'a2'], 10);
  m.avanzar(2 * PERIODO(m) + 0.05);
  assert.equal(m.lua('SnetForever.Franja.vueltas()'), 1);
  mostrar(m, ['b1', 'b2', 'b3'], 500);
  assert.equal(m.lua('SnetForever.Franja.vueltas()'), 0);
  const r = decodificar(m).r;
  assert.equal(r.id, 500);
  assert.equal(r.bytes.toString('latin1'), 'b1');
  sinErrores(m);
});

for (const [escalaUI, ancho, alto] of [[1, 1920, 1080], [1, 2560, 1440], [0.7, 1920, 1080]]) {
  test(`una carga de 1.400 bytes (4.000 celdas, 20 filas) anclada cabe y se decodifica (UIParent a ${escalaUI}, ${ancho}×${alto}); después una corta oculta las celdas que sobran`, () => {
    const m = nueva({ pantalla: { ancho, alto } });
    m.lua(`UIParent:SetScale(${escalaUI})`);
    anclarComoElChat(m);
    const grande = Array.from({ length: 1400 }, (_, i) => String.fromCharCode((i * 37 + 11) % 256)).join('');
    mostrar(m, [grande], 3);
    const { imagen, r } = decodificar(m);
    assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
    assert.equal(r.bytes.toString('latin1'), grande);
    assert.deepEqual(imagen.origen, origenComoElChat(escalaUI, alto));
    const creadas = m.lua('#BANCO.texturasDe("SnetForeverFranja").lista');
    assert.equal(creadas, Math.ceil((1400 + 8) * 8 / 3));
    mostrar(m, ['abc'], 4);
    const despues = m.lua('BANCO.texturasDe("SnetForeverFranja")').lista;
    assert.equal(despues.length, creadas, 'las celdas se reciclan, no se crean otras');
    assert.equal(despues.filter((t) => t.mostrada).length, Math.ceil(((3 + 8) * 8) / 3));
    assert.equal(decodificar(m).r.bytes.toString('latin1'), 'abc');
    sinErrores(m);
  });
}

test('2 partes de 1.400 bytes ancladas, leídas cada 100 ms como la app: se reúnen las dos sin errores', () => {
  const m = anclada({ pantalla: { ancho: 2560, alto: 1440 } });
  const parte = (s) => Array.from({ length: 1400 }, (_, i) => String.fromCharCode((i * s + 7) % 256)).join('');
  const a = parte(37);
  const b = parte(53);
  mostrar(m, [a, b], 200);
  const leidas = new Map();
  for (let i = 0; i < 15; i++) {
    const { r } = decodificar(m);
    assert.equal(r.tipo, 'decodificada', `lectura ${i}: ${JSON.stringify(r)}`);
    leidas.set(r.id, r.bytes.toString('latin1'));
    m.avanzar(0.1);
  }
  assert.equal(leidas.get(200), a);
  assert.equal(leidas.get(201), b);
  sinErrores(m);
});

test('una carga de 1.401 bytes da error de Lua y no deja la franja a medias', () => {
  const m = anclada();
  assert.throws(() => mostrar(m, ['x'.repeat(1401)], 1), /1401/);
  assert.equal(m.lua('SnetForever.Franja.visible()'), false);
});

for (const [ancho, alto] of [[1920, 1080], [2560, 1440]]) {
  test(`sin ancla no se ve nada (${ancho}×${alto}): ni la franja en la esquina ni el aviso «Enviando a SnetForever…», ni con el tiempo`, () => {
    const m = nueva({ pantalla: { ancho, alto } });
    assert.equal(m.lua('SnetForever.Franja.anclada()'), false);
    mostrar(m, ['abc', 'def'], 1);
    nadaEnPantalla(m, 'al mostrar sin ancla');
    for (let i = 0; i < 10; i++) {
      m.avanzar(0.3);
      nadaEnPantalla(m, `a los ${((i + 1) * 0.3).toFixed(1)} s`);
    }
    assert.equal(m.lua('SnetForever.Franja.vueltas()'), 0, 'escondida no avanza');
    // Lo mismo con UIParent a 0,7 y con otro mensaje encima.
    m.lua('UIParent:SetScale(0.7)');
    m.disparar('UI_SCALE_CHANGED');
    mostrar(m, ['ghi'], 2);
    nadaEnPantalla(m, 'con UIParent a 0,7');
    m.disparar('DISPLAY_SIZE_CHANGED');
    nadaEnPantalla(m, 'tras DISPLAY_SIZE_CHANGED');
    sinErrores(m);
  });
}

test('el latido (sinAviso) sin ancla tampoco se ve', () => {
  const m = nueva();
  m.lua(`SnetForever.Franja.mostrar({${literalLua('latido')}}, 32768, {sinAviso = true})`);
  nadaEnPantalla(m, 'latido sin ancla');
  m.avanzar(2);
  nadaEnPantalla(m, 'latido sin ancla, a los 2 s');
  sinErrores(m);
});

test('con la franja anclada a un marco, el aviso NO se enseña (lo enseña la línea de estado de la ventana de chat)', () => {
  const m = nueva();
  marcoDePrueba(m, 400, 100);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 0, 0)');
  mostrar(m, ['abc'], 1);
  assert.equal(m.lua('SnetForever.Franja.visible()'), true);
  assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false);
  m.avanzar(0.5);
  assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false);
  sinErrores(m);
});

test('anclar y desanclar: el aviso no sale nunca; sin ancla la franja se esconde y anclada vuelve a verse', () => {
  const m = nueva();
  marcoDePrueba(m, 400, 100);
  mostrar(m, ['abc'], 1);
  nadaEnPantalla(m, 'sin ancla');
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 0, 0)');
  assert.equal(m.lua('SnetForever.Franja.visible()'), true, 'al anclar se ve');
  assert.equal(decodificar(m).r.bytes.toString('latin1'), 'abc');
  assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false, 'anclada, sin aviso');
  m.lua('SnetForever.Franja.anclar(nil)');
  nadaEnPantalla(m, 'al quitar el ancla');
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 0, 0)');
  assert.equal(m.lua('SnetForever.Franja.visible()'), true, 'al volver a anclar se ve otra vez');
  m.lua('SnetForever.Franja.ocultar()');
  m.lua('SnetForever.Franja.anclar(MarcoPrueba)');
  nadaEnPantalla(m, 'oculta y anclada');
  m.lua('SnetForever.Franja.anclar(nil)');
  nadaEnPantalla(m, 'oculta y desanclada');
  sinErrores(m);
});

// Cuenta las llamadas al marco de la franja (envolviendo los métodos en la propia instancia).
function espiarMarco(m) {
  m.lua(`(function()
    local f = SnetForeverFranja
    BANCO.cuenta = {SetPoint = 0, ClearAllPoints = 0, SetScale = 0}
    for k in pairs(BANCO.cuenta) do
      local original = f[k]
      f[k] = function(...) BANCO.cuenta[k] = BANCO.cuenta[k] + 1; return original(...) end
    end
  end)()`);
}
const cuenta = (m) => m.lua('BANCO.cuenta');
const repintados = (m) => m.lua('#(BANCO.llamadas["Texture:SetColorTexture"] or {})');

test('en reposo (la escala se guarda como float de 32 bits) no se recoloca el marco en cada fotograma', () => {
  const m = nueva();
  marcoDePrueba(m, 100, 50);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "TOPLEFT", 2, -2)');
  mostrar(m, ['abc'], 1);
  // El cliente real devuelve la escala redondeada a float de 32 bits: no es 768/1080 en double.
  assert.notEqual(m.lua('SnetForeverFranja:GetScale()'), 768 / 1080);
  espiarMarco(m);
  for (let i = 0; i < 6; i++) m.avanzar(0.05);
  assert.deepEqual(cuenta(m), { SetPoint: 0, ClearAllPoints: 0, SetScale: 0 });
  sinErrores(m);
});

test('en reposo y anclada a un marco tampoco se recoloca', () => {
  const m = nueva();
  marcoDePrueba(m, 100.4, 50.3);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 0, 0)');
  mostrar(m, ['abc'], 1);
  espiarMarco(m);
  for (let i = 0; i < 6; i++) m.avanzar(0.05);
  assert.deepEqual(cuenta(m), { SetPoint: 0, ClearAllPoints: 0, SetScale: 0 });
  sinErrores(m);
});

test('al cambiar la pantalla o la escala de la interfaz sí se recoloca, y después vuelve a quedarse quieta', () => {
  const m = nueva();
  marcoDePrueba(m, 100.4, 50.3);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 0, 0)');
  mostrar(m, ['abc'], 1);
  espiarMarco(m);
  m.lua('UIParent:SetScale(0.8)');
  m.disparar('UI_SCALE_CHANGED');
  assert.equal(cuenta(m).SetPoint, 1);
  m.pantalla({ ancho: 2560, alto: 1440 });
  m.disparar('DISPLAY_SIZE_CHANGED');
  const c = cuenta(m);
  assert.equal(c.SetPoint, 2);
  assert.equal(c.SetScale, 1);
  m.avanzar(0.05);
  assert.deepEqual(cuenta(m), c);
  sinErrores(m);
});

test('mostrar valida TODAS las partes: si la segunda no cabe, error y no queda nada visible', () => {
  const m = anclada();
  assert.throws(() => mostrar(m, ['abc', 'x'.repeat(1401)], 1), /1401/);
  assert.equal(m.lua('SnetForever.Franja.visible()'), false);
  // Con la franja ya visible por otro mensaje, un fallo tampoco deja a medias el nuevo.
  mostrar(m, ['abc'], 1);
  assert.equal(m.lua('SnetForever.Franja.visible()'), true);
  assert.throws(() => mostrar(m, ['abc', 'x'.repeat(1401)], 1), /1401/);
  assert.equal(m.lua('SnetForever.Franja.visible()'), false);
  assert.equal(m.lua('SnetForeverFranjaAviso:IsVisible()'), false);
  sinErrores(m);
});

test('al alternar entre dos partes solo se repintan (SetColorTexture) las celdas que cambian', () => {
  const m = anclada();
  const a = 'a'.repeat(300);
  const b = 'a'.repeat(299) + 'b';
  mostrar(m, [a, b], 7);
  const colores = () => m.lua('BANCO.texturasDe("SnetForeverFranja")').lista.filter((t) => t.mostrada).map((t) => JSON.stringify(t.color));
  const parte1 = colores();
  const antes = repintados(m);
  m.avanzar(PERIODO(m) + 1e-3); // pasa a la parte 2
  const parte2 = colores();
  const distintas = parte1.reduce((n, c, i) => n + (c !== parte2[i] ? 1 : 0), 0);
  assert.ok(distintas > 0 && distintas < parte1.length / 2, `${distintas} de ${parte1.length} celdas cambian`);
  assert.equal(repintados(m) - antes, distintas, 'solo se pintan las que cambian');
  sinErrores(m);
});

test('tras ocultar() el marco ya no hace trabajo en cada fotograma', () => {
  const m = nueva();
  marcoDePrueba(m, 100.4, 50.3);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 0, 0)');
  mostrar(m, ['abc'], 1);
  assert.equal(m.lua('SnetForeverFranja:GetScript("OnUpdate") ~= nil'), true);
  m.lua('SnetForever.Franja.ocultar()');
  assert.equal(m.lua('SnetForeverFranja:GetScript("OnUpdate") == nil'), true, 'sin script de OnUpdate');
  espiarMarco(m);
  m.lua('MarcoPrueba:ClearAllPoints(); MarcoPrueba:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 333.7, 210.2)');
  for (let i = 0; i < 4; i++) m.avanzar(0.05);
  assert.deepEqual(cuenta(m), { SetPoint: 0, ClearAllPoints: 0, SetScale: 0 });
  mostrar(m, ['abc'], 2); // y al volver a mostrar, funciona de nuevo
  assert.equal(m.lua('SnetForeverFranja:GetScript("OnUpdate") ~= nil'), true);
  sinErrores(m);
});

test('si el marco anclado aún no tiene posición, la franja no se ve en (8, 8): espera a tenerla', () => {
  const m = nueva();
  m.lua('CreateFrame("Frame", "MarcoSinSitio", UIParent):SetSize(500, 300)'); // sin anclas: GetLeft() es nil
  m.lua('SnetForever.Franja.anclar(MarcoSinSitio, "BOTTOMLEFT", 0, 0)');
  mostrar(m, ['abc'], 1);
  assert.equal(m.lua('SnetForeverFranja:GetAlpha()'), 0, 'invisible mientras no hay posición');
  m.lua('MarcoSinSitio:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 200, 100)');
  m.avanzar(0.05);
  assert.equal(m.lua('SnetForeverFranja:GetAlpha()'), 1);
  const { imagen, r } = decodificar(m);
  assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
  assert.equal(imagen.origen.x, Math.round(200 * (1080 / 768)));
  assert.equal(imagen.origen.y, 1080 - Math.round(100 * (1080 / 768)));
  sinErrores(m);
});

test('DISPLAY_SIZE_CHANGED con otra pantalla vuelve a calcular la escala y la posición de la franja anclada', () => {
  const m = anclada();
  mostrar(m, ['abc'], 9);
  assert.ok(Math.abs(m.lua('SnetForeverFranja:GetScale()') - 768 / 1080) < 1e-6);
  assert.deepEqual(decodificar(m).imagen.origen, origenComoElChat(1, 1080));
  m.pantalla({ ancho: 2560, alto: 1440 });
  m.disparar('DISPLAY_SIZE_CHANGED');
  assert.ok(Math.abs(m.lua('SnetForeverFranja:GetScale()') - 768 / 1440) < 1e-6);
  const { imagen, r } = decodificar(m);
  assert.equal(imagen.ancho, 2560);
  assert.equal(r.tipo, 'decodificada', JSON.stringify(r));
  assert.deepEqual(imagen.origen, origenComoElChat(1, 1440));
  sinErrores(m);
});

test('UI_SCALE_CHANGED recoloca la franja anclada', () => {
  const m = nueva();
  marcoDePrueba(m, 100.4, 50.3);
  m.lua('SnetForever.Franja.anclar(MarcoPrueba, "BOTTOMLEFT", 0, 0)');
  mostrar(m, ['abc'], 1);
  m.lua('UIParent:SetScale(0.8)');
  m.disparar('UI_SCALE_CHANGED');
  const { imagen, r } = decodificar(m);
  assert.equal(r.tipo, 'decodificada');
  assert.equal(imagen.origen.x, Math.round(100.4 * 0.8 * (1080 / 768)));
  sinErrores(m);
});

test('sin GetPhysicalScreenSize (cliente sin esa API) usa 1080 de alto y no falla', () => {
  const m = anclada({ sinApi: ['GetPhysicalScreenSize'] });
  mostrar(m, ['abc'], 1);
  assert.equal(m.lua('SnetForever.Franja.visible()'), true);
  assert.ok(Math.abs(m.lua('SnetForeverFranja:GetScale()') - 768 / 1080) < 1e-6);
  sinErrores(m);
});
