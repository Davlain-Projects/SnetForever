// Guardado, ajustes e idioma del addon (nucleo/guardado.lua, nucleo/idioma.lua, textos/es.lua y textos/en.lua).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, globalPermitida } from './ayuda.js';

// Nota: una tabla vacía de Lua llega a JS como [] (aJs no distingue), de ahí los [] de las comparaciones.

// Máquina con el addon cargado y Guardado.preparar() ya llamado, como hará ADDON_LOADED.
function maquinaPreparada(opciones = {}) {
  const m = nuevaMaquina(opciones);
  m.lua('SnetForever.Guardado.preparar()');
  return m;
}

test('preparar: crea las dos estructuras con esquema 1 y todos sus campos', () => {
  // Sin entrar al mundo: al entrar, el arranque carga la guía y apunta guia y progreso.
  const m = nuevaMaquina({ entrar: false });
  m.lua('SnetForever.Guardado.preparar()');
  assert.deepEqual(m.lua('SnetForeverCuenta'), { esquema: 1, ajustes: [], fallos: [], comercio: { grupos: [], reglas: [], conocidas: [], papelera: [], tooltip: true, v2: { grupos: [], objetos: [], operaciones: [], fuentes: [] } } });
  assert.deepEqual(m.lua('SnetForeverPJ'), {
    esquema: 1,
    ajustes: [],
    progreso: [],
    saltados: [],
    retomados: [],
    avisos: { vistos: [], pendientes: [] },
    ia: { cursor: 0, n: 0, marcas: { vender: [], usar: [] }, chat: [] },
    // Diario de objetos (ia/diario.lua).
    diario: { v: 1, e: [], omitidos: 0 },
    // Dibujos de la IA en el mapa (mapa/dibujos.lua).
    dibujos: { v: 1, porMapa: [] },
  });
  sinErrores(m);
});

test('preparar: rellena lo que falta sin tocar lo que hay', () => {
  const m = nuevaMaquina({
    guardado: {
      SnetForeverCuenta: { esquema: 1, ajustes: { idioma: 'en' } },
      SnetForeverPJ: { esquema: 1, guia: 'Horde\\Durotar', progreso: { p1: true }, avisos: { vistos: { a: true } } },
    },
    entrar: false, // al entrar, el arranque cambiaría esa guía (no está en los datos) por la de por defecto
  });
  m.lua('SnetForever.Guardado.preparar()');
  assert.deepEqual(m.lua('SnetForeverCuenta'), { esquema: 1, ajustes: { idioma: 'en' }, fallos: [], comercio: { grupos: [], reglas: [], conocidas: [], papelera: [], tooltip: true, v2: { grupos: [], objetos: [], operaciones: [], fuentes: [] } } });
  const pj = m.lua('SnetForeverPJ');
  assert.equal(pj.guia, 'Horde\\Durotar');
  assert.deepEqual(pj.progreso, { p1: true });
  assert.deepEqual(pj.avisos, { vistos: { a: true }, pendientes: [] });
  assert.deepEqual(pj.ajustes, []);
  assert.deepEqual(pj.saltados, []);
  assert.deepEqual(pj.retomados, []);
  sinErrores(m);
});

test('preparar: una variable que no es tabla se guarda en _roto de la nueva', () => {
  const m = nuevaMaquina({ guardado: { SnetForeverPJ: 5, SnetForeverCuenta: 'basura' } });
  m.lua('SnetForever.Guardado.preparar()');
  assert.equal(m.lua('type(SnetForeverPJ)'), 'table');
  assert.equal(m.lua('SnetForeverPJ._roto'), 5);
  assert.equal(m.lua('SnetForeverPJ.esquema'), 1);
  assert.equal(m.lua('SnetForeverCuenta._roto'), 'basura');
  assert.equal(m.lua('SnetForeverCuenta.esquema'), 1);
  // Un campo interno que no es tabla se repone igual que el nivel de arriba.
  const m2 = nuevaMaquina({ guardado: { SnetForeverPJ: { ajustes: 7 } } });
  m2.lua('SnetForever.Guardado.preparar()');
  assert.equal(m2.lua('SnetForeverPJ.ajustes._roto'), 7);
  sinErrores(m);
  sinErrores(m2);
});

test('old Blue saves pick Forge while the saved Neutral choice remains available', () => {
  const m = nuevaMaquina({
    guardado: {
      SnetForeverCuenta: { ajustes: { 'ventana.tema': 'azul' } },
      SnetForeverPJ: { ajustes: { 'ventana.tema': 'neutro' } },
    },
  });
  assert.equal(m.lua('SnetForeverCuenta.ajustes["ventana.tema"]'), 'forge');
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.tema")'), 'neutro');
  m.lua('SnetForever.Ajustes.set("ventana.tema", "azul")');
  assert.equal(m.lua('SnetForeverPJ.ajustes["ventana.tema"]'), 'forge');
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.tema")'), 'forge');
  sinErrores(m);
});

test('preparar: llamarlo dos veces no cambia nada', () => {
  const m = maquinaPreparada();
  m.lua('SnetForever.Ajustes.set("ventana.alfa", 0.5)');
  const antes = m.guardado();
  m.lua('SnetForever.Guardado.preparar()');
  assert.deepEqual(m.guardado(), antes);
  sinErrores(m);
});

test('Ajustes.get: valor por defecto, valor nuevo tras set y clave desconocida', () => {
  const m = maquinaPreparada();
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.alfa")'), 0.92);
  m.lua('SnetForever.Ajustes.set("ventana.alfa", 0.5)');
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.alfa")'), 0.5);
  assert.equal(m.lua('SnetForever.Ajustes.get("no.existe")'), undefined);
  // false no es «sin valor»: get devuelve false aunque el defecto fuera true.
  m.lua('SnetForever.Ajustes.set("ventana.visible", false)');
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.visible")'), false);
  sinErrores(m);
});

test('Ajustes.get: antes de preparar() da los valores por defecto sin error', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.ancho")'), 260);
  assert.equal(m.lua('SnetForever.Ajustes.get("idioma")'), 'cliente');
  sinErrores(m);
});

test('Ajustes: tabla de valores por defecto y de claves de cuenta, tal como el diseño', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForever.Ajustes.DEFECTO'), {
    idioma: 'cliente',
    version: 'normal',
    'guias.xp': 1,
    'guias.automatizar': false,
    'guias.objetosActivos': true,
    'ventana.visible': true,
    'auction.largeText': false,
    'guide.favorite': 'auto',
    'guide.details': false,
    'ventana.escala': 1,
    'ventana.ancho': 260,
    'ventana.alfa': 0.92,
    'ventana.tema': 'forge',
    'ventana.pasoArriba': true,
    'ventana.bloqueada': false,
    'ventana.siguientes': 3,
    'ventana.ocultarEnCombate': false,
    'objetivos.activo': true,
    'objetivos.marcaPlaca': true,
    'objetivos.soloCercanos': false,
    'objetivos.escala': 1,
    'objetivos.marca': 1, // lote D (D1): la estrella al pulsar un objetivo (0 = ninguna)
    'flecha.activa': true,
    'flecha.escala': 1,
    'flecha.avisoLlegada': true,
    'pines.mundo': true,
    'pines.minimapa': true,
    'pines.ia': true,
    'pines.caminos': true,
    'pines.cuantos': 7,
    'openmap.usar': true,
    'openmap.ficha': true,
    'pasos.saltarPorNivel': true,
    'pasos.saltarGrises': true, // lote D (D2)
    'pasos.saltarNoDisponibles': true, // 12-nov
    'pasos.margenVerdes': 0, // lote D (D2)
    'avisos.cadenas': true,
    'avisos.mejoras': true, // lote «Cadenas de mejoras»: encendido por defecto
    'avisos.mazmorras': false, // lote A, ronda 1: con «Con mazmorras» vale true (Ajustes.DEFECTO_SEGUN)
    'ia.modelo': 'haiku',
    'ia.inventario': false,
    'minimapa.boton': true,
    'minimapa.angulo': 225,
    'principal.pestana': 'grupos', // ventana principal de comercio (Task 12)
    comercioTope: 0, // comercio, tarea 13: tope de gasto de la sesión en cobre (0 = sin tope)
    comercioAvisoOro: 100000, // comercio, tarea 13: una compra de más de esto (cobre) pide un segundo clic
    comercioSniperCada: 5, // comercio, tarea 14: segundos entre dos vueltas del sniper
    comercioSniperSonido: true, // comercio, tarea 14: suena al encontrar algo
    comercioSniperModo: 'regla', // paridad TSM, fase 3: la regla de sniper hasta que el jugador elija las operaciones
    comercioTopePrudente: true, // tope prudente: Sniper y Compras no pagan más que el precio de mercado (casa o regional)
    comercioSiguienteSola: true, // ventana de compra, tarea 6: tras comprar se elige sola la fila siguiente
    comercioVista: 'snet', // ventana de compra, tarea 9: la última vista de la subasta ('snet' o 'blizzard')
    // 0.7.0: comercioActivo (la casilla de la 0.6.4) ya no está: el comercio es el addon SnetForever_Comercio.
  });
  assert.deepEqual(
    Object.keys(m.lua('SnetForever.Ajustes.DE_CUENTA')).sort(),
    // Ruling F3-19: tema, paso arriba y escala de los objetivos son preferencias visuales de la cuenta.
    ['flecha.escala', 'ia.modelo', 'idioma', 'minimapa.angulo', 'minimapa.boton', 'objetivos.escala', 'ventana.alfa',
      'ventana.ancho', 'ventana.escala', 'ventana.pasoArriba', 'ventana.tema'],
  );
  // Las posiciones no tienen valor por defecto pero son claves conocidas y se pueden guardar.
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.pos")'), undefined);
  m.lua('SnetForever.Ajustes.set("ventana.pos", {punto = "TOPLEFT", x = 10, y = -20})');
  assert.deepEqual(m.lua('SnetForever.Ajustes.get("ventana.pos")'), { punto: 'TOPLEFT', x: 10, y: -20 });
  m.lua('SnetForever.Ajustes.set("flecha.pos", {punto = "CENTER", x = 0, y = 0})');
  assert.equal(m.lua('SnetForever.Ajustes.get("flecha.pos").punto'), 'CENTER');
  sinErrores(m);
});

test('Ajustes.LIMITES: rangos y pasos del diseño', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua('SnetForever.Ajustes.LIMITES["ventana.escala"]'), { min: 0.6, max: 1.6, paso: 0.05 });
  assert.deepEqual(m.lua('SnetForever.Ajustes.LIMITES["ventana.ancho"]'), { min: 220, max: 500, paso: 10 });
  assert.deepEqual(m.lua('SnetForever.Ajustes.LIMITES["ventana.alfa"]'), { min: 0.2, max: 1, paso: 0.05 });
  assert.deepEqual(m.lua('SnetForever.Ajustes.LIMITES["ventana.siguientes"]'), { min: 0, max: 8, paso: 1 });
  assert.deepEqual(m.lua('SnetForever.Ajustes.LIMITES["flecha.escala"]'), { min: 0.5, max: 2, paso: 0.1 });
  assert.deepEqual(m.lua('SnetForever.Ajustes.LIMITES["pines.cuantos"]'), { min: 1, max: 15, paso: 1 });
  assert.deepEqual(m.lua('SnetForever.Ajustes.LIMITES["objetivos.escala"]'), { min: 0.6, max: 1.6, paso: 0.05 });
  assert.deepEqual(m.lua('SnetForever.Ajustes.OPCIONES["ia.modelo"]'), ['haiku', 'sonnet', 'opus']);
  assert.deepEqual(m.lua('SnetForever.Ajustes.OPCIONES["ventana.tema"]'), ['forge', 'neutro']);
  sinErrores(m);
});

test('Ajustes.set: una clave desconocida da error', () => {
  const m = maquinaPreparada();
  assert.throws(() => m.lua('SnetForever.Ajustes.set("no.existe", 1)'), /clave desconocida/);
});

test('Ajustes.set: las claves de cuenta valen para un personaje nuevo; las de personaje no', () => {
  const m = maquinaPreparada();
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  m.lua('SnetForever.Ajustes.set("ventana.bloqueada", true)');
  m.lua('SnetForever.Ajustes.set("ventana.ancho", 400)');
  assert.equal(m.lua('SnetForeverCuenta.ajustes.idioma'), 'en');
  assert.equal(m.lua('SnetForeverPJ.ajustes["ventana.bloqueada"]'), true);
  assert.equal(m.lua('SnetForeverCuenta.ajustes["ventana.bloqueada"]'), undefined);

  // Personaje nuevo: la cuenta se conserva y el personaje empieza vacío.
  m.lua('SnetForeverPJ = nil');
  const nuevo = m.recargar();
  nuevo.lua('SnetForever.Guardado.preparar()');
  assert.equal(nuevo.lua('SnetForever.Ajustes.get("idioma")'), 'en');
  assert.equal(nuevo.lua('SnetForever.Ajustes.get("ventana.ancho")'), 400);
  assert.equal(nuevo.lua('SnetForever.Ajustes.get("ventana.bloqueada")'), false);
  assert.equal(nuevo.lua('SnetForever.L.idioma()'), 'en');
  sinErrores(nuevo);
});

test('Ajustes: lo guardado sobrevive a /reload del mismo personaje', () => {
  const m = maquinaPreparada();
  m.lua('SnetForever.Ajustes.set("ventana.bloqueada", true)');
  m.lua('SnetForever.Ajustes.set("ventana.escala", 1.25)');
  const otra = m.recargar();
  otra.lua('SnetForever.Guardado.preparar()');
  assert.equal(otra.lua('SnetForever.Ajustes.get("ventana.bloqueada")'), true);
  assert.equal(otra.lua('SnetForever.Ajustes.get("ventana.escala")'), 1.25);
  sinErrores(otra);
});

test('Ajustes: el valor del personaje manda sobre el de la cuenta', () => {
  const m = maquinaPreparada({
    guardado: { SnetForeverCuenta: { ajustes: { 'ventana.alfa': 0.4 } }, SnetForeverPJ: { ajustes: { 'ventana.alfa': 0.9 } } },
  });
  m.lua('SnetForever.Guardado.preparar()');
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.alfa")'), 0.9);
  m.lua('SnetForeverPJ.ajustes["ventana.alfa"] = nil');
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.alfa")'), 0.4);
  sinErrores(m);
});

test('Ajustes.set: emite SNF_AJUSTE_CAMBIADO con la clave y el valor', () => {
  const m = maquinaPreparada();
  m.lua('ESCUCHADOS = {}');
  m.lua(`SnetForever.escuchar("SNF_AJUSTE_CAMBIADO", function(clave, valor)
    table.insert(ESCUCHADOS, {clave, valor})
  end)`);
  m.lua('SnetForever.Ajustes.set("pines.cuantos", 9)');
  m.lua('SnetForever.Ajustes.set("ventana.visible", false)');
  assert.deepEqual(m.lua('ESCUCHADOS'), [['pines.cuantos', 9], ['ventana.visible', false]]);
});

test('Ajustes.restablecer: vuelve al valor por defecto, en personaje y cuenta, y avisa', () => {
  const m = maquinaPreparada();
  m.lua('SnetForever.Ajustes.set("ventana.alfa", 0.5)');
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 5)');
  m.lua('ESCUCHADOS = {}');
  m.lua(`SnetForever.escuchar("SNF_AJUSTE_CAMBIADO", function(clave, valor)
    table.insert(ESCUCHADOS, {clave, valor})
  end)`);
  m.lua('SnetForever.Ajustes.restablecer("ventana.alfa")');
  m.lua('SnetForever.Ajustes.restablecer("ventana.siguientes")');
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.alfa")'), 0.92);
  assert.equal(m.lua('SnetForever.Ajustes.get("ventana.siguientes")'), 3);
  assert.equal(m.lua('SnetForeverCuenta.ajustes["ventana.alfa"]'), undefined);
  assert.equal(m.lua('SnetForeverPJ.ajustes["ventana.alfa"]'), undefined);
  assert.deepEqual(m.lua('ESCUCHADOS'), [['ventana.alfa', 0.92], ['ventana.siguientes', 3]]);
  sinErrores(m);
});

test('mensajes: escuchar y emitir llaman a todos los oyentes en orden, y un error de uno no corta a los demás', () => {
  const m = nuevaMaquina();
  m.lua('ORDEN = ""');
  m.lua(`SnetForever.escuchar("SNF_PRUEBA", function(a) ORDEN = ORDEN .. "1" .. a end)
         SnetForever.escuchar("SNF_PRUEBA", function() error("fallo de prueba") end)
         SnetForever.escuchar("SNF_PRUEBA", function(a) ORDEN = ORDEN .. "3" .. a end)
         SnetForever.emitir("SNF_PRUEBA", "x")`);
  assert.equal(m.lua('ORDEN'), '1x3x');
  // El error llegó al manejador de errores, como en el juego.
  assert.equal(m.errores().length, 1);
  assert.match(m.errores()[0], /fallo de prueba/);
});

test('L.idioma: cliente sigue al idioma del cliente; es y en lo fijan', () => {
  for (const [cliente, ajuste, esperado] of [
    ['esMX', 'cliente', 'es'],
    ['esES', 'cliente', 'es'],
    ['enUS', 'cliente', 'en'],
    ['deDE', 'cliente', 'en'],
    ['esMX', 'en', 'en'],
    ['enUS', 'es', 'es'],
  ]) {
    const m = maquinaPreparada({ jugador: { idioma: cliente } });
    m.lua(`SnetForever.Ajustes.set("idioma", ${JSON.stringify(ajuste)})`);
    assert.equal(m.lua('SnetForever.L.idioma()'), esperado, `${cliente} + ${ajuste}`);
    sinErrores(m);
  }
});

test('L.idioma: sin preparar() sigue al cliente', () => {
  const m = nuevaMaquina({ jugador: { idioma: 'enGB' } });
  assert.equal(m.lua('SnetForever.L.idioma()'), 'en');
  sinErrores(m);
});

test('L.t: SALTAR sale en el idioma activo', () => {
  const es = maquinaPreparada({ jugador: { idioma: 'esMX' } });
  assert.equal(es.lua('SnetForever.L.t("SALTAR")'), 'Saltar');
  const en = maquinaPreparada({ jugador: { idioma: 'enUS' } });
  assert.equal(en.lua('SnetForever.L.t("SALTAR")'), 'Skip');
  sinErrores(es);
  sinErrores(en);
});

test('L.t: cambiar el ajuste cambia el texto al momento', () => {
  const m = maquinaPreparada({ jugador: { idioma: 'esES' } });
  assert.equal(m.lua('SnetForever.L.t("SALTAR")'), 'Saltar');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  assert.equal(m.lua('SnetForever.L.t("SALTAR")'), 'Skip');
  sinErrores(m);
});

test('L.t: si falta en el idioma sale en inglés, y si falta también, la propia clave', () => {
  const m = maquinaPreparada({ jugador: { idioma: 'esES' } });
  m.lua('SnetForever.L.tablas.en.SOLO_INGLES = "Only English"');
  assert.equal(m.lua('SnetForever.L.t("SOLO_INGLES")'), 'Only English');
  assert.equal(m.lua('SnetForever.L.t("NO_EXISTE_NUNCA")'), 'NO_EXISTE_NUNCA');
  sinErrores(m);
});

test('L.t: da formato con string.format y no toca el texto si no hay argumentos', () => {
  const m = maquinaPreparada({ jugador: { idioma: 'esES' } });
  m.lua('SnetForever.L.tablas.es.PRUEBA_FORMATO = "Nivel %d de %s"');
  m.lua('SnetForever.L.tablas.es.PRUEBA_PORCIENTO = "100% seguro"');
  assert.equal(m.lua('SnetForever.L.t("PRUEBA_FORMATO", 12, "Durotar")'), 'Nivel 12 de Durotar');
  assert.equal(m.lua('SnetForever.L.t("PRUEBA_PORCIENTO")'), '100% seguro');
  sinErrores(m);
});

test('L.de: elige es o en de un texto bilingüe; una cadena pasa tal cual', () => {
  const es = maquinaPreparada({ jugador: { idioma: 'esES' } });
  assert.equal(es.lua('SnetForever.L.de({en = "Orgrimmar", es = "Orgrimmar (ES)"})'), 'Orgrimmar (ES)');
  assert.equal(es.lua('SnetForever.L.de({en = "Only English"})'), 'Only English');
  assert.equal(es.lua('SnetForever.L.de("Hola")'), 'Hola');
  const en = maquinaPreparada({ jugador: { idioma: 'enUS' } });
  assert.equal(en.lua('SnetForever.L.de({en = "Orgrimmar", es = "Orgrimmar (ES)"})'), 'Orgrimmar');
  assert.equal(en.lua('SnetForever.L.de({es = "Solo español"})'), 'Solo español');
  assert.equal(en.lua('SnetForever.L.de("Hello")'), 'Hello');
  sinErrores(es);
  sinErrores(en);
});

test('L.tablas: las mismas claves en es y en, todas en mayúsculas, y todas son texto', () => {
  const m = nuevaMaquina();
  const es = Object.keys(m.lua('SnetForever.L.tablas.es')).sort();
  const en = Object.keys(m.lua('SnetForever.L.tablas.en')).sort();
  assert.ok(es.length > 0);
  assert.deepEqual(es, en);
  for (const clave of es) assert.match(clave, /^[A-Z0-9_]+$/, `la clave ${clave} no está en mayúsculas`);
  assert.equal(m.lua('SnetForever.L.tablas.es.SALTAR'), 'Saltar');
  assert.equal(m.lua('SnetForever.L.tablas.en.SALTAR'), 'Skip');
  for (const idioma of ['es', 'en']) {
    for (const clave of es) assert.equal(m.lua(`type(SnetForever.L.tablas.${idioma}.${clave})`), 'string', `${idioma}.${clave}`);
  }
  sinErrores(m);
});

test('módulos nuevos: no crean globales fuera de las permitidas', () => {
  const m = maquinaPreparada();
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  const malas = (m.globalesNuevas() || []).filter((g) => !globalPermitida(g));
  assert.deepEqual(malas, []);
  sinErrores(m);
});

test('ajustes de la ventana nueva (D1): tema, pasoArriba y objetivos.*; objetivos.pos es clave conocida sin valor', () => {
  const m = maquinaPreparada();
  const get = (c) => m.lua(`SnetForever.Ajustes.get(${JSON.stringify(c)})`);
  assert.equal(get('ventana.tema'), 'forge');
  assert.equal(get('ventana.pasoArriba'), true);
  assert.equal(get('objetivos.activo'), true);
  assert.equal(get('objetivos.marcaPlaca'), true);
  assert.equal(get('objetivos.soloCercanos'), false);
  assert.equal(get('objetivos.escala'), 1);
  // No hay marca de banda hasta que el jugador la pida.
  assert.equal(m.lua('SnetForever.Ajustes.DEFECTO["objetivos.marcaBanda"]'), undefined);
  // objetivos.pos: sin valor por defecto, pero se puede guardar y leer.
  assert.equal(get('objetivos.pos'), undefined);
  m.lua('SnetForever.Ajustes.set("objetivos.pos", {punto = "LEFT", x = 5, y = 0})');
  assert.deepEqual(m.lua('SnetForever.Ajustes.get("objetivos.pos")'), { punto: 'LEFT', x: 5, y: 0 });
  // Ruling F3-19: tema, pasoArriba y objetivos.escala son de cuenta; los demás de objetivos, de cada personaje.
  m.lua('SnetForever.Ajustes.set("ventana.tema", "neutro")');
  assert.equal(m.lua('SnetForeverCuenta.ajustes["ventana.tema"]'), 'neutro');
  assert.equal(get('ventana.tema'), 'neutro');
  m.lua('SnetForever.Ajustes.set("ventana.pasoArriba", false); SnetForever.Ajustes.set("objetivos.escala", 1.2)');
  assert.equal(m.lua('SnetForeverCuenta.ajustes["ventana.pasoArriba"]'), false);
  assert.equal(m.lua('SnetForeverCuenta.ajustes["objetivos.escala"]'), 1.2);
  m.lua('SnetForever.Ajustes.set("objetivos.activo", false)');
  assert.equal(m.lua('SnetForeverCuenta.ajustes["objetivos.activo"]'), undefined);
  // Otro personaje de la cuenta (su SnetForeverPJ vacío) hereda el tema de la cuenta.
  m.lua('SnetForeverPJ.ajustes = {}');
  assert.equal(get('ventana.tema'), 'neutro');
  sinErrores(m);
});

// Cada clave de textos/es.lua y textos/en.lua se define una sola vez: una repetida pisa en silencio a la primera
// (pasó con las claves de dinero de la ventana de comercio y las del chat).
test('textos/es.lua y textos/en.lua: ninguna clave está definida dos veces', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const textos = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'addons', 'SnetForever', 'textos');
  for (const idioma of ['es', 'en']) {
    const vistas = new Set();
    const repetidas = [];
    for (const linea of readFileSync(join(textos, `${idioma}.lua`), 'utf8').split(/\r?\n/)) {
      const m = new RegExp(String.raw`^${idioma}\.([A-Za-z0-9_]+)\s*=`).exec(linea);
      if (!m) continue;
      if (vistas.has(m[1])) repetidas.push(m[1]);
      vistas.add(m[1]);
    }
    assert.deepEqual(repetidas, [], `claves repetidas en textos/${idioma}.lua`);
  }
});
