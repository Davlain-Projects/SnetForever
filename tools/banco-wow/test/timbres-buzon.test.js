// Fase 4, tarea 5: timbres y buzón de respuestas (ia/timbres.lua, ia/buzon.lua) y las opciones del banco addonsDir,
// sonido y ranurasDesactivadas (PlaySoundFile, StopSound y C_AddOns.LoadAddOn sobre una carpeta de verdad).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearMaquina } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
import { sinErrores } from './ayuda.js';

const TIMBRES = ['timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar', 'vivo_a', 'vivo_b', 'presente'];
const carpetas = [];
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const toc = (i) => `## Interface: 16001
## Title: SnetForever - Respuestas ${String(i).padStart(3, '0')}
## LoadOnDemand: 1
## Dependencies: SnetForever
## Group: SnetForever_R${String(i).padStart(3, '0')}

buzon.lua
`;
const nombre = (i) => `SnetForever_R${String(i).padStart(3, '0')}`;

// Carpeta de AddOns de prueba con los 7 .wav de senales/ y las ranuras R001…R<ranuras> (vacías).
function carpetaDePrueba(ranuras = 3) {
  const dir = mkdtempSync(join(tmpdir(), 'snf-addons-'));
  carpetas.push(dir);
  mkdirSync(join(dir, 'SnetForever', 'senales'), { recursive: true });
  for (const t of TIMBRES) writeFileSync(join(dir, 'SnetForever', 'senales', `${t}.wav`), '');
  for (let i = 1; i <= ranuras; i++) ponerBuzon(dir, i, null);
  return dir;
}

// Escribe la ranura i; con null, el contenido inicial («SNF_BUZON = nil»).
function ponerBuzon(dir, i, buzon) {
  mkdirSync(join(dir, nombre(i)), { recursive: true });
  writeFileSync(join(dir, nombre(i), `${nombre(i)}.toc`), toc(i));
  writeFileSync(join(dir, nombre(i), 'buzon.lua'), buzon === null ? 'SNF_BUZON = nil\n' : `SNF_BUZON = ${aLua(buzon)}\n`);
}

const wav = (dir, t) => join(dir, 'SnetForever', 'senales', `${t}.wav`);
const quitar = (dir, t) => renameSync(wav(dir, t), `${wav(dir, t)}.fuera`);
const devolver = (dir, t) => renameSync(`${wav(dir, t)}.fuera`, wav(dir, t));

// Máquina con la carpeta de prueba y un registro de los mensajes internos de la IA en EVT (texto por mensaje).
function maquina(dir, opciones = {}) {
  const m = crearMaquina({ addonsDir: dir, ...opciones });
  anotarEventos(m);
  return m;
}

function anotarEventos(m) {
  m.lua(`rawset(_G, "EVT", {})
    local function nota(e, a)
      if e == "SNF_IA_REGISTRO" then a = a.seq end
      EVT[#EVT + 1] = string.sub(e, 8) .. (a ~= nil and (":" .. tostring(a)) or "")
    end
    for _, e in ipairs({"SNF_IA_TIMBRE", "SNF_IA_RECIBIDO", "SNF_IA_APP", "SNF_IA_REGISTRO", "SNF_IA_AVISO", "SNF_IA_RECIBIDO_ID"}) do
      SnetForever.escuchar(e, function(a) nota(e, a) end)
    end`);
}

const eventos = (m) => m.lua('EVT');
const limpiar = (m) => m.lua('for i = #EVT, 1, -1 do EVT[i] = nil end');
const pj = (m) => m.lua('SnetForever.Personaje.clave()');

function conMaquina(opciones, prueba) {
  const dir = carpetaDePrueba(opciones.ranuras ?? 3);
  const m = maquina(dir, opciones.maquina);
  try { return prueba(m, dir); } finally { m.cerrar(); }
}

// --- Banco: PlaySoundFile, StopSound y LoadAddOn ---

test('banco: PlaySoundFile solo suena con un archivo que existe ahora y estaba en la foto; StopSound lo para', () => {
  conMaquina({}, (m, dir) => {
    const ruta = 'Interface\\AddOns\\SnetForever\\senales\\timbre_a.wav';
    assert.equal(m.lua(`(function() local ok, h = PlaySoundFile("${ruta.replace(/\\/g, '\\\\')}", "Master"); MANEJADOR = h; return ok end)()`), true);
    assert.equal(m.lua('BANCO.sonando[MANEJADOR]'), true);
    m.lua('StopSound(MANEJADOR)');
    assert.equal(m.lua('BANCO.sonando[MANEJADOR]'), undefined);
    const antes = m.llamadas('PlaySoundFile').length;
    quitar(dir, 'timbre_a');
    assert.equal(m.lua(`(PlaySoundFile("${ruta.replace(/\\/g, '\\\\')}", "Master"))`), false);
    devolver(dir, 'timbre_a');
    assert.equal(m.lua(`(PlaySoundFile("${ruta.replace(/\\/g, '\\\\')}", "Master"))`), true);
    // un .wav creado después de la máquina no estaba en la foto
    writeFileSync(wav(dir, 'nuevo'), '');
    assert.equal(m.lua('(PlaySoundFile("Interface\\\\AddOns\\\\SnetForever\\\\senales\\\\nuevo.wav", "Master"))'), false);
    // fuera de senales/ y fuera de Interface\AddOns no suena nada
    assert.equal(m.lua('(PlaySoundFile("Interface\\\\AddOns\\\\SnetForever\\\\SnetForever.toc", "Master"))'), false);
    assert.equal(m.lua('(PlaySoundFile("Sound\\\\algo.wav", "Master"))'), false);
    assert.equal(m.llamadas('PlaySoundFile').length - antes, 5);
    sinErrores(m);
  });
});

test('banco: con sonido: false PlaySoundFile siempre da false', () => {
  conMaquina({ maquina: { sonido: false } }, (m) => {
    assert.equal(m.lua('(PlaySoundFile("Interface\\\\AddOns\\\\SnetForever\\\\senales\\\\presente.wav", "Master"))'), false);
    sinErrores(m);
  });
});

test('banco: sin addonsDir no hay archivos: PlaySoundFile da false y LoadAddOn «MISSING»', () => {
  const m = crearMaquina();
  try {
    assert.equal(m.lua('(PlaySoundFile("Interface\\\\AddOns\\\\SnetForever\\\\senales\\\\presente.wav", "Master"))'), false);
    assert.equal(m.lua('select(2, C_AddOns.LoadAddOn("SnetForever_R001"))'), 'MISSING');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('banco: LoadAddOn lee del disco en ese momento, la segunda vez no ejecuta y avisa de MISSING y DISABLED', () => {
  const dir = carpetaDePrueba(2);
  const m = crearMaquina({ addonsDir: dir, ranurasDesactivadas: [nombre(2)] });
  try {
    ponerBuzon(dir, 1, { v: 1, seq: 7, registros: [] });
    assert.equal(m.lua(`(C_AddOns.LoadAddOn("${nombre(1)}"))`), true);
    assert.equal(m.lua('SNF_BUZON.seq'), 7);
    m.lua('SNF_BUZON = nil');
    ponerBuzon(dir, 1, { v: 1, seq: 8, registros: [] });
    assert.equal(m.lua(`(C_AddOns.LoadAddOn("${nombre(1)}"))`), true);
    assert.equal(m.lua('SNF_BUZON'), undefined, 'la segunda vez no ejecuta');
    assert.equal(m.lua(`C_AddOns.IsAddOnLoaded("${nombre(1)}")`), true);
    assert.equal(m.lua(`select(2, C_AddOns.LoadAddOn("${nombre(2)}"))`), 'DISABLED');
    assert.equal(m.lua(`select(2, C_AddOns.LoadAddOn("${nombre(9)}"))`), 'MISSING');
    // una carpeta creada después de la máquina no existe para ella, tampoco tras recargar()
    ponerBuzon(dir, 5, { v: 1, seq: 1, registros: [] });
    assert.equal(m.lua(`select(2, C_AddOns.LoadAddOn("${nombre(5)}"))`), 'MISSING');
    sinErrores(m);
    const n = m.recargar();
    try {
      assert.equal(n.lua(`select(2, C_AddOns.LoadAddOn("${nombre(5)}"))`), 'MISSING');
      assert.equal(n.lua(`(C_AddOns.LoadAddOn("${nombre(1)}"))`), true, 'tras recargar() se vuelve a cargar todo');
      assert.equal(n.lua('SNF_BUZON.seq'), 8);
      sinErrores(n);
    } finally { n.cerrar(); }
  } finally { m.cerrar(); }
});

// --- Timbres ---

test('timbres: sonido() es verdadero y probar() distingue estar, faltar y no saber', () => {
  conMaquina({}, (m, dir) => {
    assert.equal(m.lua('SnetForever.Timbres.sonido()'), true);
    assert.equal(m.lua('SnetForever.Timbres.probar("timbre_a")'), true);
    quitar(dir, 'timbre_a');
    assert.equal(m.lua('SnetForever.Timbres.probar("timbre_a")'), false);
    quitar(dir, 'presente');
    assert.equal(m.lua('SnetForever.Timbres.probar("timbre_b")'), undefined, 'sin presente no se sabe nada');
    assert.equal(m.lua('SnetForever.Timbres.sonido()'), false);
    sinErrores(m);
  });
});

test('timbres: con sonido: false, probar() da nil y sonido() falso', () => {
  conMaquina({ maquina: { sonido: false } }, (m) => {
    assert.equal(m.lua('SnetForever.Timbres.probar("timbre_a")'), undefined);
    assert.equal(m.lua('SnetForever.Timbres.sonido()'), false);
    sinErrores(m);
  });
});

test('timbres: la ruta es la de la carpeta senales y los sonidos se paran al instante', () => {
  conMaquina({}, (m) => {
    assert.equal(m.lua('SnetForever.Timbres.RUTA'), 'Interface\\AddOns\\SnetForever\\senales\\');
    const antes = m.llamadas('StopSound').length;
    m.lua('SnetForever.Timbres.probar("timbre_a")');
    assert.equal(m.llamadas('StopSound').length - antes, 2, 'para presente y el timbre');
    assert.equal(m.lua('next(BANCO.sonando)'), undefined);
    sinErrores(m);
  });
});

test('timbres: un pulso de timbre_a o de timbre_b emite SNF_IA_TIMBRE (con atento a 0,25 s)', () => {
  conMaquina({}, (m, dir) => {
    m.lua('SnetForever.Timbres.atento(true)');
    quitar(dir, 'timbre_a');
    m.avanzar(0.25);
    assert.deepEqual(eventos(m), ['TIMBRE']);
    m.avanzar(1);
    assert.deepEqual(eventos(m), ['TIMBRE'], 'mientras sigue fuera no repite');
    devolver(dir, 'timbre_a');
    quitar(dir, 'timbre_b');
    m.avanzar(0.25);
    assert.deepEqual(eventos(m), ['TIMBRE', 'TIMBRE']);
    sinErrores(m);
  });
});

// Lote C (52-M2): en reposo solo se miran presente y vivo_a/b, cada 2 s; los otros cuatro, con un mensaje en curso o con la
// app viva (tras ver un pulso de vida).
const VIGILADO = { maquina: { vigilarSecretos: ['ia/timbres.lua'] } };
const lecturas = (m) => m.llamadas('PlaySoundFile').length;
const lecturasDe = (m, t) => m.llamadas('PlaySoundFile').filter((a) => a[0].endsWith(`\\${t}.wav`)).length;

test('timbres (lote C): en reposo y sin app, 1,5 lecturas por segundo o menos, y solo de presente y vivo_a/b', () => {
  conMaquina(VIGILADO, (m) => {
    const antes = lecturas(m);
    const antesRapidos = ['timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar'].map((t) => lecturasDe(m, t));
    m.avanzar(60);
    const n = lecturas(m) - antes;
    assert.ok(n <= 90, `${n} lecturas en 60 s`);
    assert.ok(n >= 84, `sigue mirando presente y los vivo_* cada 2 s (${n} en 60 s)`);
    assert.deepEqual(['timbre_a', 'timbre_b', 'recibido_par', 'recibido_impar'].map((t) => lecturasDe(m, t)), antesRapidos);
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), false);
    sinErrores(m);
  });
});

test('timbres (lote C): en reposo un pulso de vida de 2,5 s nunca se escapa, y con la app viva se miran los otros cuatro', () => {
  conMaquina(VIGILADO, (m, dir) => {
    m.avanzar(0.7); // a destiempo de las lecturas
    quitar(dir, 'vivo_a');
    m.avanzar(2.5);
    devolver(dir, 'vivo_a');
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), true);
    assert.deepEqual(eventos(m), ['APP:true']);
    // con la app viva, un timbre de 3 s se ve también en reposo
    const antes = lecturasDe(m, 'timbre_a');
    m.avanzar(1.3);
    quitar(dir, 'timbre_a');
    m.avanzar(3);
    devolver(dir, 'timbre_a');
    assert.deepEqual(eventos(m), ['APP:true', 'TIMBRE']);
    assert.ok(lecturasDe(m, 'timbre_a') - antes <= 3, 'cada 2 s, no cada 0,25');
    sinErrores(m);
  });
});

test('timbres (lote C): sin app, un timbre en reposo no se mira; con atento(true) sí, y con atento(false) se vuelve al reposo', () => {
  conMaquina(VIGILADO, (m, dir) => {
    quitar(dir, 'timbre_a');
    m.avanzar(5);
    assert.deepEqual(eventos(m), [], 'en reposo sin app no se mira timbre_a');
    m.lua('SnetForever.Timbres.atento(true)');
    m.avanzar(0.25);
    assert.deepEqual(eventos(m), ['TIMBRE']);
    devolver(dir, 'timbre_a');
    m.avanzar(0.25);
    m.lua('SnetForever.Timbres.atento(false)');
    const antes = lecturas(m);
    m.avanzar(20);
    assert.ok(lecturas(m) - antes <= 30, `de vuelta al reposo (${lecturas(m) - antes} lecturas en 20 s)`);
    sinErrores(m);
  });
});

test('timbres (lote C): con un mensaje en curso se lee como hasta ahora (0,25 s los rápidos y 1 s los vivo_*)', () => {
  conMaquina(VIGILADO, (m) => {
    m.lua('SnetForever.Timbres.atento(true)');
    m.avanzar(0.25);
    const antesR = lecturasDe(m, 'recibido_par');
    const antesV = lecturasDe(m, 'vivo_b');
    m.avanzar(10);
    const r = lecturasDe(m, 'recibido_par') - antesR;
    const v = lecturasDe(m, 'vivo_b') - antesV;
    assert.ok(r >= 39 && r <= 41, `recibido_par cada 0,25 s (${r} en 10 s)`);
    assert.ok(v >= 9 && v <= 11, `vivo_b cada segundo (${v} en 10 s)`);
    sinErrores(m);
  });
});

// Revisión final, Important 1: con atento(true) los rápidos van cada 0,25 s y los vivo_* siguen mirándose cada segundo
// (un segundo reloj en el mismo OnUpdate), así una pregunta larga no apaga «App conectada».
test('timbres: con atento(true) los vivo_* se siguen mirando, pero solo cada segundo', () => {
  conMaquina({}, (m, dir) => {
    m.lua('SnetForever.Timbres.atento(true)');
    const vivos = () => m.llamadas('PlaySoundFile').filter((a) => /vivo_a\.wav$/.test(a[0])).length;
    const rapidos = () => m.llamadas('PlaySoundFile').filter((a) => /timbre_a\.wav$/.test(a[0])).length;
    const antesV = vivos();
    const antesR = rapidos();
    m.avanzar(4);
    assert.ok(vivos() - antesV >= 3 && vivos() - antesV <= 5, `vivo_a cada segundo (${vivos() - antesV} en 4 s)`);
    assert.ok(rapidos() - antesR >= 15, `timbre_a cada 0,25 s (${rapidos() - antesR} en 4 s)`);
    quitar(dir, 'vivo_a');
    m.avanzar(1.1);
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), true);
    sinErrores(m);
  });
});

test('timbres: la app late cada 10 s y una pregunta de 30 s con atento(true) no la da por caída', () => {
  conMaquina({}, (m, dir) => {
    // primer latido sin atento: la app está viva
    quitar(dir, 'vivo_a');
    m.avanzar(2.5);
    devolver(dir, 'vivo_a');
    m.avanzar(7.5);
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), true);
    m.lua('SnetForever.Timbres.atento(true)');
    for (const t of ['vivo_b', 'vivo_a', 'vivo_b']) {
      quitar(dir, t);
      m.avanzar(2.5);
      devolver(dir, t);
      m.avanzar(7.5);
    }
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), true);
    assert.deepEqual(eventos(m), ['APP:true'], 'sin APP:false durante la pregunta');
    m.lua('SnetForever.Timbres.atento(false)');
    m.avanzar(1);
    assert.deepEqual(eventos(m), ['APP:true'], 'ni parpadeo al volver a atento(false)');
    sinErrores(m);
  });
});

test('timbres: si la app deja de latir en mitad de una pregunta, con atento(true) sí sale APP:false', () => {
  conMaquina({}, (m, dir) => {
    quitar(dir, 'vivo_a');
    m.avanzar(2.5);
    devolver(dir, 'vivo_a');
    m.lua('SnetForever.Timbres.atento(true)');
    m.avanzar(30);
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), false);
    assert.deepEqual(eventos(m), ['APP:true', 'APP:false']);
    sinErrores(m);
  });
});

test('timbres: un timbre fuera 11 s está muerto: no emite otra vez hasta que una lectura lo ve volver', () => {
  conMaquina({}, (m, dir) => {
    m.lua('SnetForever.Timbres.atento(true)');
    quitar(dir, 'timbre_a');
    m.avanzar(11);
    assert.deepEqual(eventos(m), ['TIMBRE'], 'emite al empezar a faltar y nada más en esos 11 s');
    // vuelve y se quita sin que ninguna lectura lo vea presente: sigue muerto
    devolver(dir, 'timbre_a');
    quitar(dir, 'timbre_a');
    m.avanzar(1);
    assert.deepEqual(eventos(m), ['TIMBRE']);
    // ahora sí vuelve de verdad
    devolver(dir, 'timbre_a');
    m.avanzar(0.5);
    quitar(dir, 'timbre_a');
    m.avanzar(0.5);
    assert.deepEqual(eventos(m), ['TIMBRE', 'TIMBRE']);
    sinErrores(m);
  });
});

test('timbres: lo que ya faltaba al entrar al juego no es un pulso', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir, { entrar: false });
  try {
    quitar(dir, 'timbre_a');
    m.disparar('PLAYER_ENTERING_WORLD', true, false);
    m.lua('SnetForever.Timbres.atento(true)');
    m.avanzar(2);
    assert.deepEqual(eventos(m), []);
    devolver(dir, 'timbre_a');
    m.avanzar(0.5);
    quitar(dir, 'timbre_a');
    m.avanzar(0.5);
    assert.deepEqual(eventos(m), ['TIMBRE']);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('timbres: un pulso de vivo_a da appViva() durante 25 s y emite SNF_IA_APP al cambiar', () => {
  conMaquina({}, (m, dir) => {
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), false);
    quitar(dir, 'vivo_a');
    m.avanzar(2.05); // en reposo se mira cada 2 s: la lectura cae justo a los 2 s
    devolver(dir, 'vivo_a');
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), true);
    m.avanzar(23);
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), true);
    m.avanzar(3); // SNF_IA_APP(false) sale en la lectura siguiente (cada 2 s)
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), false);
    assert.deepEqual(eventos(m), ['APP:true', 'APP:false']);
    sinErrores(m);
  });
});

test('timbres: vivo_a y vivo_b alternos mantienen la app viva sin repetir SNF_IA_APP(true)', () => {
  conMaquina({}, (m, dir) => {
    for (const t of ['vivo_a', 'vivo_b', 'vivo_a', 'vivo_b']) {
      quitar(dir, t);
      m.avanzar(2.5);
      devolver(dir, t);
      m.avanzar(7.5);
    }
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), true);
    assert.deepEqual(eventos(m), ['APP:true']);
    sinErrores(m);
  });
});

test('timbres: un pulso de recibido_impar emite SNF_IA_RECIBIDO("impar") y uno de recibido_par, "par"', () => {
  conMaquina({}, (m, dir) => {
    m.lua('SnetForever.Timbres.atento(true)');
    quitar(dir, 'recibido_impar');
    m.avanzar(0.25);
    assert.deepEqual(eventos(m), ['RECIBIDO:impar']);
    devolver(dir, 'recibido_impar');
    quitar(dir, 'recibido_par');
    m.avanzar(0.25);
    assert.deepEqual(eventos(m), ['RECIBIDO:impar', 'RECIBIDO:par']);
    sinErrores(m);
  });
});

test('timbres: sin sonido no se emite nada y la app se da por muerta', () => {
  conMaquina({ maquina: { sonido: false } }, (m, dir) => {
    quitar(dir, 'timbre_a');
    quitar(dir, 'vivo_a');
    m.avanzar(3);
    assert.deepEqual(eventos(m), []);
    assert.equal(m.lua('SnetForever.Timbres.appViva()'), false);
    sinErrores(m);
  });
});

// --- Buzón ---

const registro = (seq, pjNombre, extra = {}) => ({ seq, pj: pjNombre, msg: `a3f1-${seq}`, t: 'respuesta', texto: `texto ${seq}`, ...extra });

test('buzón: nombre(i), RANURAS y proxima() al empezar', () => {
  conMaquina({}, (m) => {
    assert.equal(m.lua('SnetForever.Buzon.RANURAS'), 20);
    assert.equal(m.lua('SnetForever.Buzon.nombre(7)'), 'SnetForever_R007');
    assert.equal(m.lua('SnetForever.Buzon.nombre(20)'), 'SnetForever_R020');
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 1);
    assert.equal(m.lua('SnetForever.Buzon.cursor()'), 0);
    assert.equal(m.lua('SnetForever.Buzon.estadoApp()'), undefined);
    sinErrores(m);
  });
});

test('buzón: cargar() emite solo los registros del personaje con seq mayor que el cursor, mueve el cursor y gasta la ranura', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    ponerBuzon(dir, 1, { v: 1, app: '0.4.0', seq: 3, ahora: 1790000000, registros: [registro(2, pj(m)), registro(3, 'Otro Jugador')] });
    const buzon = m.lua('SnetForever.Buzon.cargar("timbre")');
    assert.equal(buzon.seq, 3);
    assert.deepEqual(eventos(m), ['REGISTRO:2']);
    assert.equal(m.lua('SnetForever.Buzon.cursor()'), 3);
    assert.equal(m.lua('SnetForeverPJ.ia.cursor'), 3);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 2);
    assert.equal(m.lua('SNF_BUZON'), undefined, 'SNF_BUZON vuelve a nil');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('buzón: el mismo buzón en la ranura siguiente no emite nada', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    const mismo = { v: 1, seq: 3, registros: [registro(2, pj(m)), registro(3, 'Otro Jugador')] };
    ponerBuzon(dir, 1, mismo);
    ponerBuzon(dir, 2, mismo);
    m.lua('SnetForever.Buzon.cargar()');
    limpiar(m);
    assert.ok(m.lua('SnetForever.Buzon.cargar()'));
    assert.deepEqual(eventos(m), []);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 3);
    assert.equal(m.lua('SNF_BUZON'), undefined);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('buzón: los registros salen en orden de seq y recibidos[pj] emite SNF_IA_RECIBIDO_ID', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    const yo = pj(m);
    ponerBuzon(dir, 1, {
      v: 1, seq: 6, recibidos: { [yo]: 'a3f1-7', 'Otro Jugador': 'zzzz-1' },
      registros: [registro(6, yo), registro(4, yo), registro(5, 'Otro Jugador')],
    });
    m.lua('SnetForever.Buzon.cargar()');
    assert.deepEqual(eventos(m), ['REGISTRO:4', 'REGISTRO:6', 'RECIBIDO_ID:a3f1-7']);
    assert.equal(m.lua('SnetForever.Buzon.cursor()'), 6);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('buzón: el registro llega entero a quien escucha', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    ponerBuzon(dir, 1, {
      v: 1, seq: 2,
      registros: [registro(2, pj(m), { propuesta: { titulo: 'Ruta', puntos: [{ mapa: 1413, x: 45.2, y: 30.1, etiqueta: 'Aquí', tipo: 'recoger', q: 748, seguir: true }] }, marcas: { vender: [2589] } })],
    });
    m.lua('SnetForever.escuchar("SNF_IA_REGISTRO", function(r) COPIA = r end)');
    m.lua('SnetForever.Buzon.cargar()');
    assert.equal(m.lua('COPIA.propuesta.puntos[1].q'), 748);
    assert.equal(m.lua('COPIA.propuesta.puntos[1].x'), 45.2);
    assert.deepEqual(m.lua('COPIA.marcas.vender'), [2589]);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('buzón: estado = {claude = "sin_sesion"} se lee con estadoApp(), y un buzón sin estado no lo borra', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    ponerBuzon(dir, 1, { v: 1, seq: 1, estado: { claude: 'sin_sesion' }, registros: [] });
    ponerBuzon(dir, 2, { v: 1, seq: 2, registros: [] });
    m.lua('SnetForever.Buzon.cargar()');
    assert.equal(m.lua('SnetForever.Buzon.estadoApp().claude'), 'sin_sesion');
    m.lua('SnetForever.Buzon.cargar()');
    assert.equal(m.lua('SnetForever.Buzon.estadoApp().claude'), 'sin_sesion');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('buzón: una ranura vacía («SNF_BUZON = nil») se gasta, da nil y no emite nada', () => {
  conMaquina({}, (m) => {
    assert.equal(m.lua('SnetForever.Buzon.cargar()'), undefined);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 2);
    assert.deepEqual(eventos(m), []);
    sinErrores(m);
  });
});

test('buzón (vigilancia 2): si falta una carpeta, cargar() da nil y SNF_IA_AVISO(RANURAS_FALTAN) sin gastar la ranura', () => {
  conMaquina({}, (m) => {
    for (let i = 0; i < 3; i++) m.lua('SnetForever.Buzon.cargar()');
    assert.deepEqual(eventos(m), []);
    assert.equal(m.lua('SnetForever.Buzon.cargar()'), undefined);
    assert.deepEqual(eventos(m), ['AVISO:RANURAS_FALTAN']);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 4);
    sinErrores(m);
  });
});

test('buzón (vigilancia 2): una ranura desactivada da SNF_IA_AVISO(RANURAS_DESACTIVADAS)', () => {
  conMaquina({ maquina: { ranurasDesactivadas: ['SnetForever_R001'] } }, (m) => {
    assert.equal(m.lua('SnetForever.Buzon.cargar()'), undefined);
    assert.deepEqual(eventos(m), ['AVISO:RANURAS_DESACTIVADAS']);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 1);
    sinErrores(m);
  });
});

// Lote G: 20 ranuras (eran 100). Aunque en AddOns quede alguna de más (la R021 de antes), no se carga.
test('buzón: con las 20 ranuras cargadas, proxima() es 21 y la siguiente carga da SNF_IA_AVISO(RANURAS_AGOTADAS)', () => {
  conMaquina({ ranuras: 21 }, (m) => {
    for (let i = 0; i < 20; i++) m.lua('SnetForever.Buzon.cargar()');
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 21);
    assert.deepEqual(eventos(m), []);
    assert.equal(m.lua('SnetForever.Buzon.cargar()'), undefined);
    assert.deepEqual(eventos(m), ['AVISO:RANURAS_AGOTADAS']);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 21);
    assert.ok(!m.llamadas('C_AddOns.LoadAddOn').some((a) => a[0] === 'SnetForever_R021'), 'la R021 no se carga');
    sinErrores(m);
  });
});

test('buzón: los avisos tienen su texto en español y en inglés', () => {
  conMaquina({}, (m) => {
    for (const clave of ['RANURAS_FALTAN', 'RANURAS_DESACTIVADAS', 'RANURAS_AGOTADAS']) {
      assert.match(m.lua(`SnetForever.L.t("${clave}")`), /\S/, clave);
      assert.notEqual(m.lua(`SnetForever.L.t("${clave}")`), clave, clave);
    }
    assert.match(m.lua('SnetForever.L.t("RANURAS_FALTAN")'), /^Faltan las carpetas de respuesta de SnetForever\./);
    // Lote G: sin el número fijo en el texto; el número sale de Buzon.RANURAS.
    assert.equal(m.lua('SnetForever.L.t("RANURAS_AGOTADAS", SnetForever.Buzon.RANURAS)'),
      'Se han usado todos los huecos de respuesta de esta sesión (20). Escribe /reload para seguir.');
    assert.doesNotMatch(m.lua('SnetForever.L.tablas.es.RANURAS_AGOTADAS'), /100/);
    assert.equal(m.lua('string.format(SnetForever.L.tablas.en.RANURAS_AGOTADAS, 20)'),
      'All the reply slots of this session (20) have been used. Type /reload to continue.');
    assert.doesNotMatch(m.lua('SnetForever.L.t("RANURAS_DESACTIVADAS")'), /categoría/);
    assert.match(m.lua('SnetForever.L.t("RANURAS_DESACTIVADAS")'), /bajo SnetForever/);
    sinErrores(m);
  });
});

test('buzón: recargar() devuelve las ranuras (proxima() == 1) y conserva el cursor guardado', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    const mismo = { v: 1, seq: 3, registros: [registro(2, pj(m)), registro(3, 'Otro Jugador')] };
    ponerBuzon(dir, 1, mismo);
    m.lua('SnetForever.Buzon.cargar()');
    m.lua('SnetForever.Buzon.cargar()');
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 3);
    const n = m.recargar();
    anotarEventos(n);
    try {
      assert.equal(n.lua('SnetForever.Buzon.proxima()'), 1);
      assert.equal(n.lua('SnetForever.Buzon.cursor()'), 3);
      n.lua('SnetForever.Buzon.cargar()');
      assert.deepEqual(eventos(n), [], 'el registro 2 ya se vio: el cursor sobrevivió');
      sinErrores(n);
    } finally { n.cerrar(); }
  } finally { m.cerrar(); }
});

test('buzón (vigilancia 5): un buzón con seq 1 y un cursor de 9 no emite nada, no da error y no baja el cursor', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir, { guardado: { SnetForeverPJ: { esquema: 1, ia: { cursor: 9 } } } });
  try {
    ponerBuzon(dir, 1, { v: 1, seq: 1, registros: [registro(1, pj(m))], recibidos: {} });
    assert.equal(m.lua('SnetForever.Buzon.cursor()'), 9);
    assert.ok(m.lua('SnetForever.Buzon.cargar()'));
    assert.deepEqual(eventos(m), []);
    assert.equal(m.lua('SnetForever.Buzon.cursor()'), 9);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('buzón: un buzón mal formado (registros que no son tablas, sin seq) no da error', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    ponerBuzon(dir, 1, { v: 1, seq: 'x', registros: [1, 'a', { pj: pj(m) }, registro(2, pj(m))], recibidos: [1, 2] });
    m.lua('SnetForever.Buzon.cargar()');
    assert.deepEqual(eventos(m), ['REGISTRO:2']);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('buzón: un error en un oyente no impide mover el cursor ni cargar la ranura siguiente', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    ponerBuzon(dir, 1, { v: 1, seq: 2, registros: [registro(2, pj(m))] });
    ponerBuzon(dir, 2, { v: 1, seq: 2, registros: [registro(2, pj(m))] });
    m.lua('SnetForever.escuchar("SNF_IA_REGISTRO", function() error("oyente roto") end)');
    m.lua('SnetForever.Buzon.cargar()');
    limpiar(m);
    m.lua('SnetForever.Buzon.cargar()');
    assert.deepEqual(eventos(m), [], 'el registro roto no se repite');
    assert.equal(m.errores().length, 1);
  } finally { m.cerrar(); }
});

test('buzón: el primer SNF_IA_APP(true) de la sesión carga una ranura, y solo ese', () => {
  const dir = carpetaDePrueba();
  const m = maquina(dir);
  try {
    ponerBuzon(dir, 1, { v: 1, seq: 4, estado: { claude: 'ok' }, registros: [registro(4, pj(m))] });
    quitar(dir, 'vivo_a');
    m.avanzar(2.1); // en reposo los vivo_* se miran cada 2 s
    devolver(dir, 'vivo_a');
    assert.deepEqual(eventos(m), ['REGISTRO:4', 'APP:true']);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 2);
    assert.equal(m.lua('SnetForever.Buzon.estadoApp().claude'), 'ok');
    // la app se calla y vuelve: ya no es la primera vez
    m.avanzar(26);
    quitar(dir, 'vivo_b');
    m.avanzar(2.1);
    devolver(dir, 'vivo_b');
    assert.deepEqual(eventos(m), ['REGISTRO:4', 'APP:true', 'APP:false', 'APP:true']);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 2);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('buzón: el pulso de timbre emite SNF_IA_TIMBRE y el buzón carga la siguiente ranura (F4-6)', () => {
  conMaquina({}, (m, dir) => {
    m.lua('SnetForever.Timbres.atento(true)');
    quitar(dir, 'timbre_a');
    m.avanzar(0.25);
    assert.equal(m.lua('SnetForever.Buzon.proxima()'), 2);
    sinErrores(m);
  });
});
