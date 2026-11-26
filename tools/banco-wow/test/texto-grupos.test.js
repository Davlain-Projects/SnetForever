// Ventana principal, parte 1, Task 19: exportar e importar grupos como texto propio (comercio/texto-grupos.lua del addon
// SnetForever_Comercio) y la ventanita de la página «Grupos». Todas necesitan el comercio.
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const T = 'SnetForever.TextoGrupos';
const A = 'SnetForever.Arbol';
const O = 'SnetForever.Operaciones';
const G = 'SnetForever.PrincipalGrupos';
const q = (t) => JSON.stringify(t);
const maquina = () => nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA });
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));

// Una cuenta con dos grupos, objetos y operaciones de varios tipos (una con vínculo y otra con un nombre de personaje).
const PREPARAR = `
  local A, O = ${A}, ${O}
  A.crear("", "Hierbas"); A.crear("Hierbas", "Raras"); A.crear("", "Armas")
  A.poner("i:2447", "Hierbas"); A.poner("i:765", "Hierbas\`Raras"); A.poner("i:1000", "Armas")
  O.crear("subasta", "Pub"); O.poner("subasta", "Pub", "tope", "300"); O.poner("subasta", "Pub", "pujaPorcentaje", 80)
  O.crear("subasta", "Pub2"); O.vincular("subasta", "Pub2", "tope", "Pub"); O.poner("subasta", "Pub2", "duracion", "48")
  O.crear("subasta", "Suelta"); O.poner("subasta", "Suelta", "tope", "7")
  O.crear("compras", "C"); O.poner("compras", "C", "fuentesReponer", {"banco", "hermandad"})
  O.crear("correo", "Env"); O.poner("correo", "Env", "destinatario", "Pedro"); O.poner("correo", "Env", "cantidadMaxima", "25")
  O.ponerDeGrupo("Hierbas", "subasta", {"Pub"}); O.ponerDeGrupo("Hierbas\`Raras", "subasta", {"Pub2"})
  O.ponerDeGrupo("Hierbas", "correo", {"Env"}); O.ponerDeGrupo("Hierbas\`Raras", "compras", {"C"})`;

// Lo mismo que el serializador del addon, en JS, para fabricar textos de prueba (buenos y malos).
const ser = (v) => {
  if (typeof v === 'boolean') return v ? 'T' : 'F';
  if (typeof v === 'number') return `n${v};`;
  if (typeof v === 'string') return `s${Buffer.byteLength(v)}:${v}`;
  if (Array.isArray(v)) return `t${v.length}:` + v.map((x, i) => ser(i + 1) + ser(x)).join('');
  const k = Object.keys(v);
  return `t${k.length}:` + k.map((x) => ser(x) + ser(v[x])).join('');
};
const texto = (obj) => 'SNF1:' + Buffer.from(typeof obj === 'string' ? obj : ser(obj), 'utf8').toString('base64');
const valido = () => ({
  v: 1,
  g: [{ r: 'Raros', o: ['i:1'], a: { subasta: ['P'] } }, { r: 'Raros`Hijo', o: ['i:2'] }],
  p: [{ t: 'subasta', n: 'P', v: { tope: '5' } }],
});

const leer = (m, t) => m.lua(`(function() local d, e, c = ${T}.leer(${q(t)}); return {ok = d ~= nil, error = e, codigo = c} end)()`);
const cuenta = (m) => JSON.stringify(m.lua('SnetForeverCuenta'));

test('TSM text imports item IDs and named subgroups without loading TSM', () => {
  const m = maquina();
  try {
    const input = 'group:Materials,i:2447,group:Materials/Cloth,i:2589,p:unknown';
    const result = m.lua(`(function()
      local data = assert(${T}.leer(${q(input)}))
      local summary = ${T}.resumen(data)
      assert(${T}.importar(data))
      return {summary.grupos, summary.objetos, summary.noReconocidos,
        ${A}.objeto("i:2447"), ${A}.objeto("i:2589")}
    end)()`);
    assert.deepEqual(result, [2, 2, 1, 'Materials', 'Materials`Cloth']);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('a plain-text list preserves distinct item variants and battle pet keys', () => {
  const m = maquina();
  try {
    const input = 'group:Gear,i:8836::1:3,i:8836::2:7:9,i:8838::r42,i:08836,i:8836,' +
      'group:Pets,p:1124,p:1124:10:3,i:0,i:8836::2::7,p:1124:foo,i:99999999999';
    const result = m.lua(`(function()
      local data = assert(${T}.leer(${q(input)}))
      local summary = ${T}.resumen(data)
      assert(${T}.importar(data))
      return {summary.objetos, summary.noReconocidos, ${A}.objeto("i:8836::1:3"),
        ${A}.objeto("i:8836::2:7:9"), ${A}.objeto("i:8836"), ${A}.objeto("p:1124"),
        ${A}.objeto("p:1124:10:3"), ${A}.objeto("i:8838::r42")}
    end)()`);
    assert.deepEqual(result, [6, 4, 'Gear', 'Gear', 'Gear', 'Pets', 'Pets', 'Gear']);
    sinErrores(m);
  } finally {
    m.cerrar();
  }
});

test('exportar e importar en otra cuenta da los mismos grupos, objetos y operaciones', () => {
  const a = maquina();
  a.lua(`(function() ${PREPARAR} end)()`);
  const t = a.lua(`${T}.exportar("Hierbas")`);
  assert.match(t, /^SNF1:[A-Za-z0-9+/]+=*$/);
  assert.equal(a.lua(`${T}.exportar("Hierbas")`), t, 'el mismo grupo da siempre el mismo texto');
  // Nunca el nombre del personaje: ni en claro ni en el texto descodificado.
  const binario = Buffer.from(t.slice(5), 'base64').toString('latin1');
  assert.equal(binario.includes('Pedro'), false);
  assert.equal(t.includes('Pedro'), false);
  assert.equal(binario.includes('Suelta'), false, 'una operación sin asignar no viaja');
  assert.equal(binario.includes('Armas'), false);

  const b = maquina();
  const r = b.lua(`(function()
    local d, e = ${T}.leer(${q(t)})
    local res = ${T}.importar(d, {destino = ""})
    local A, O = ${A}, ${O}
    return {
      leido = d ~= nil, e = e, res = res,
      raiz = A.hijos(""), hijos = A.hijos("Hierbas"),
      o1 = A.objetos("Hierbas"), o2 = A.objetos("Hierbas\`Raras"), armas = A.existe("Armas"),
      subastas = O.lista("subasta"), compras = O.lista("compras"), correos = O.lista("correo"),
      tope = O.valor("subasta", "Pub", "tope"), puja = O.valor("subasta", "Pub", "pujaPorcentaje"),
      vinculo = O.vinculo("subasta", "Pub2", "tope"), topeVinc = O.valor("subasta", "Pub2", "tope"),
      duracion = O.valor("subasta", "Pub2", "duracion"),
      fuentes = O.valor("compras", "C", "fuentesReponer"),
      destinatario = O.valor("correo", "Env", "destinatario"), max = O.valor("correo", "Env", "cantidadMaxima"),
      g1 = (O.deGrupo("Hierbas", "subasta")), g2 = (O.deGrupo("Hierbas\`Raras", "subasta")),
      g3 = (O.deGrupo("Hierbas", "correo")), g4 = (O.deGrupo("Hierbas\`Raras", "compras")),
    }
  end)()`);
  assert.equal(r.leido, true);
  assert.deepEqual(r.res, { grupos: 2, objetos: 2, operaciones: 4, nuevas: 4, reutilizadas: 0, renombradas: 0, quedan: 0, rutas: ['Hierbas'] });
  assert.deepEqual(r.raiz, ['Hierbas']);
  assert.deepEqual(r.hijos, ['Hierbas`Raras']);
  assert.deepEqual(r.o1, ['i:2447']);
  assert.deepEqual(r.o2, ['i:765']);
  assert.equal(r.armas, false);
  assert.deepEqual(r.subastas, ['Pub', 'Pub2']);
  assert.deepEqual(r.compras, ['C']);
  assert.deepEqual(r.correos, ['Env']);
  assert.equal(r.tope, '300');
  assert.equal(r.puja, 80);
  assert.equal(r.vinculo, 'Pub');
  assert.equal(r.topeVinc, '300');
  assert.equal(r.duracion, '48');
  assert.deepEqual(r.fuentes, ['banco', 'hermandad']);
  assert.equal(r.destinatario, '', 'el personaje de destino no viaja');
  assert.equal(r.max, '25');
  assert.deepEqual(r.g1, ['Pub']);
  assert.deepEqual(r.g2, ['Pub2']);
  assert.deepEqual(r.g3, ['Env']);
  assert.deepEqual(r.g4, ['C']);
  sinErrores(a);
  sinErrores(b);
});

test('el Grupo Base exporta todos los grupos; sin grupos no hay nada que exportar; un grupo que no existe da error', () => {
  const m = maquina();
  const vacio = m.lua(`(function() local t, e, c = ${T}.exportar(""); return {t = t, e = e, c = c} end)()`);
  assert.equal(vacio.t, undefined);
  assert.equal(vacio.c, 'nada');
  assert.equal(vacio.e, 'No hay grupos que exportar.');
  m.lua(`(function() ${PREPARAR} end)()`);
  const todo = m.lua(`${T}.exportar("")`);
  const r = m.lua(`(function() local d = ${T}.leer(${q(todo)}); return ${T}.resumen(d) end)()`);
  assert.deepEqual(r, { grupos: 3, objetos: 3, operaciones: 4, enOtroGrupo: 3 });
  const noExiste = m.lua(`(function() local t, e, c = ${T}.exportar("Nada"); return {t = t, e = e, c = c} end)()`);
  assert.equal(noExiste.c, 'noExiste');
  assert.equal(noExiste.e, 'Ese grupo ya no existe.');
  sinErrores(m);
});

test('el resumen cuenta bien y la pregunta de mover decide', () => {
  const a = maquina();
  a.lua(`(function() ${PREPARAR} end)()`);
  const t = a.lua(`${T}.exportar("Hierbas")`);

  for (const [mover, esperado] of [[false, 'Otro'], [true, 'Hierbas']]) {
    const b = maquina();
    const r = b.lua(`(function()
      local A = ${A}
      A.crear("", "Otro"); A.poner("i:2447", "Otro"); A.poner("i:765", nil) -- uno en otro grupo y uno en el Grupo Base
      local d = ${T}.leer(${q(t)})
      local resumen = ${T}.resumen(d)
      local res = ${T}.importar(d, {destino = "", moverObjetos = ${mover}})
      return {resumen = resumen, res = res, donde = A.objeto("i:2447"), otro = A.objeto("i:765")}
    end)()`);
    assert.deepEqual(r.resumen, { grupos: 2, objetos: 2, operaciones: 4, enOtroGrupo: 1 });
    assert.equal(r.donde, esperado, `moverObjetos = ${mover}`);
    assert.equal(r.otro, 'Hierbas`Raras', 'el objeto del Grupo Base entra siempre');
    assert.equal(r.res.objetos, mover ? 2 : 1);
    assert.equal(r.res.quedan, mover ? 0 : 1);
    sinErrores(b);
  }
  sinErrores(a);
});

test('texto roto, de otra versión o de TSM: mensaje claro y nada cambia', () => {
  const a = maquina();
  a.lua(`(function() ${PREPARAR} end)()`);
  const bueno = a.lua(`${T}.exportar("Hierbas")`);
  const m = maquina();
  m.lua(`(function() ${A}.crear("", "Mio") ${O}.crear("subasta", "Mia") end)()`);
  const antes = cuenta(m);

  const casos = [
    ['', 'vacio', 'No hay ningún texto que importar.'],
    ['   \n ', 'vacio', 'No hay ningún texto que importar.'],
    ['hola que tal', 'roto', 'El texto está roto o incompleto. Cópialo de nuevo entero.'],
    [bueno.slice(0, bueno.length - 7), 'roto', 'El texto está roto o incompleto. Cópialo de nuevo entero.'],
    [bueno.slice(0, 40), 'roto', 'El texto está roto o incompleto. Cópialo de nuevo entero.'],
    ['SNF1:!!!!', 'roto', 'El texto está roto o incompleto. Cópialo de nuevo entero.'],
    ['SNF1:', 'roto', 'El texto está roto o incompleto. Cópialo de nuevo entero.'],
    ['SNF1:====', 'roto', 'El texto está roto o incompleto. Cópialo de nuevo entero.'],
    ['SNF', 'roto', 'El texto está roto o incompleto. Cópialo de nuevo entero.'],
    ['SNF2:' + bueno.slice(5), 'otraVersion', 'Ese texto es de otra versión de SnetForever y no se puede leer.'],
    ['SNF12:AAAA', 'otraVersion', 'Ese texto es de otra versión de SnetForever y no se puede leer.'],
    [texto({ v: 2, g: [] }), 'otraVersion', 'Ese texto es de otra versión de SnetForever y no se puede leer.'],
    ['^1^T^opaque', 'tsm', 'No se pudo leer este texto de TSM. Pega la exportación de grupos de TSM completa o una lista de IDs de objetos.'],
    ['return {"Hierbas"}', 'tsm', 'No se pudo leer este texto de TSM. Pega la exportación de grupos de TSM completa o una lista de IDs de objetos.'],
    ['SNF1:' + 'A'.repeat(500000), 'grande', 'El texto es demasiado grande.'],
  ];
  for (const [t, codigo, mensaje] of casos) {
    const r = leer(m, t);
    assert.equal(r.ok, false, t.slice(0, 30));
    assert.equal(r.codigo, codigo, t.slice(0, 30));
    assert.equal(r.error, mensaje, t.slice(0, 30));
  }
  // Un texto bueno con espacios y saltos de línea (como sale de pegar en un chat) se lee.
  assert.equal(leer(m, '  ' + bueno.slice(0, 30) + '\n' + bueno.slice(30) + ' \n').ok, true);
  // importar con datos que no son de leer, o con un destino que no existe, tampoco toca nada.
  const r = m.lua(`(function()
    local d = ${T}.leer(${q(bueno)})
    local a, ea, ca = ${T}.importar({v = 1, g = {{r = "A\`B"}}}, {})
    local b, eb, cb = ${T}.importar("hola", {})
    local c, ec, cc = ${T}.importar(d, {destino = "No existe"})
    return {a = a == nil, ca = ca, b = b == nil, cb = cb, c = c == nil, cc = cc, ec = ec}
  end)()`);
  assert.deepEqual([r.a, r.ca, r.b, r.cb, r.c, r.cc], [true, 'roto', true, 'roto', true, 'destino']);
  assert.equal(r.ec, 'El grupo de destino ya no existe.');
  assert.equal(cuenta(m), antes, 'nada ha cambiado');
  sinErrores(m);
});

test('un texto con datos malos o hostiles se rechaza entero y no cambia nada', () => {
  const m = maquina();
  m.lua(`(function() ${A}.crear("", "Mio") ${O}.crear("subasta", "Mia") end)()`);
  const antes = cuenta(m);
  const con = (cambio) => {
    const d = valido();
    cambio(d);
    return texto(d);
  };
  const malos = {
    'campo de otro tipo': con((d) => { d.p[0].v.tope = 5; }),
    'campo desconocido': con((d) => { d.p[0].v.noExiste = '1'; }),
    'fórmula que no se entiende': con((d) => { d.p[0].v.tope = '1g +'; }),
    'número fuera de rango': con((d) => { d.p[0].v.pujaPorcentaje = 500; }),
    'opción de lista que no existe': con((d) => { d.p[0].v.duracion = '7'; }),
    'campo de texto (no viaja)': con((d) => { d.p = [{ t: 'correo', n: 'E', v: { destinatario: 'Pedro' } }]; d.g[0].a = { correo: ['E'] }; }),
    'ignorar personajes (no viaja)': con((d) => { d.p[0].v.ignorarPersonajes = ['Pedro']; }),
    'tipo de operación inventado': con((d) => { d.p[0].t = 'hechizo'; }),
    'operación repetida': con((d) => { d.p.push({ t: 'subasta', n: 'P' }); }),
    'vínculo a una operación que no viene': con((d) => { d.p[0].l = { precioMinimo: 'Otra' }; }),
    'vínculo a sí misma': con((d) => { d.p[0].l = { precioMinimo: 'P' }; }),
    'ciclo de vínculos': con((d) => { d.p = [{ t: 'subasta', n: 'P', l: { rebaja: 'Q' } }, { t: 'subasta', n: 'Q', l: { rebaja: 'P' } }]; }),
    'valor y vínculo a la vez': con((d) => { d.p.push({ t: 'subasta', n: 'Q' }); d.p[0].l = { tope: 'Q' }; }),
    'asignación a una operación que no viene': con((d) => { d.g[0].a = { subasta: ['Z'] }; }),
    'asignación de un tipo que no existe': con((d) => { d.g[0].a = { raro: ['P'] }; }),
    'dos operaciones en un tipo de una sola': con((d) => { d.p.push({ t: 'sniper', n: 'S1' }, { t: 'sniper', n: 'S2' }); d.g[0].a = { sniper: ['S1', 'S2'] }; }),
    'padre que falta': con((d) => { d.g = [{ r: 'A`B' }]; }),
    'padre detrás del hijo': con((d) => { d.g.reverse(); }),
    'grupo repetido': con((d) => { d.g.push({ r: 'Raros' }); }),
    'ruta con nivel vacío': con((d) => { d.g[1].r = 'Raros``Hijo'; }),
    'ruta que acaba en separador': con((d) => { d.g[1].r = 'Raros`'; }),
    'grupo llamado _roto': con((d) => { d.g[0].r = '_roto'; }),
    'nombre con salto de línea': con((d) => { d.g[0].r = 'Ra\nros'; }),
    'nombre larguísimo': con((d) => { d.g[0].r = 'x'.repeat(150); }),
    'demasiados niveles': con((d) => { d.g = Array.from({ length: 20 }, (_, i) => ({ r: Array.from({ length: i + 1 }, () => 'n').join('`') })); }),
    'objeto repetido en dos grupos': con((d) => { d.g[1].o = ['i:1']; }),
    'objeto que no es un texto': con((d) => { d.g[0].o = [5]; }),
    'objeto vacío': con((d) => { d.g[0].o = ['']; }),
    'lista de objetos que no es lista': con((d) => { d.g[0].o = { a: 'i:1' }; }),
    'lista con huecos': con((d) => { d.g[0].o = { 1: 'i:1', 3: 'i:2' }; }),
    'clave que sobra en el grupo': con((d) => { d.g[0].codigo = 'os.exit()'; }),
    'clave que sobra arriba': con((d) => { d.extra = true; }),
    'grupos que no es lista': con((d) => { d.g = 'hola'; }),
    'el dato de arriba no es una tabla': 'SNF1:' + Buffer.from('s2:hi').toString('base64'),
    'anidado sin fin': 'SNF1:' + Buffer.from('t1:s1:a'.repeat(60) + 'T').toString('base64'),
    'tabla con una cantidad enorme': 'SNF1:' + Buffer.from('t999999999:').toString('base64'),
    'texto con un largo enorme': 'SNF1:' + Buffer.from('t1:s1:as99999999:xx').toString('base64'),
    'texto más largo que el resto': 'SNF1:' + Buffer.from('t1:s1:as50:xx').toString('base64'),
    'número que no es número': 'SNF1:' + Buffer.from('t1:s1:an0x10;').toString('base64'),
    'número que es NaN': 'SNF1:' + Buffer.from('t1:s1:annan;').toString('base64'),
    'número infinito': 'SNF1:' + Buffer.from('t1:s1:an1e999;').toString('base64'),
    'clave repetida': 'SNF1:' + Buffer.from('t2:s1:aTs1:aF').toString('base64'),
    'clave que es un booleano': 'SNF1:' + Buffer.from('t1:TT').toString('base64'),
    'sobra algo detrás': texto(valido()) + Buffer.from('xx').toString('base64').replace(/=+$/, '') + 'AAAA',
    'marca desconocida': 'SNF1:' + Buffer.from('t1:s1:aZ').toString('base64'),
    'código de Lua dentro': texto('t1:s1:as21:return os.exit(1) end'),
  };
  for (const [nombre, t] of Object.entries(malos)) {
    const r = leer(m, t);
    assert.equal(r.ok, false, nombre);
    assert.equal(r.codigo, 'roto', nombre);
  }
  assert.equal(leer(m, texto(valido())).ok, true, 'el texto de partida sí vale');
  assert.equal(cuenta(m), antes);
  // Demasiados grupos u objetos.
  assert.equal(leer(m, texto({ v: 1, g: Array.from({ length: 1001 }, (_, i) => ({ r: `g${i}` })) })).ok, false);
  assert.equal(leer(m, texto({ v: 1, g: [{ r: 'A', o: Array.from({ length: 20001 }, (_, i) => `i:${i}`) }] })).ok, false);
  assert.equal(cuenta(m), antes);
  sinErrores(m);
});

test('nombres raros (acento grave, |c…|r) sobreviven', () => {
  const a = maquina();
  const nombres = ['A|cff00ff00B|r', 'Ñandú (1) [x] %s %d', '|Hitem:1|h[Esp]|h', 'a.b-c+d*e?^$', 'Ópera señora ¿qué?'];
  const r0 = a.lua(`(function()
    local A, O = ${A}, ${O}
    A.crear("", "Raiz")
    for i, n in ipairs({${nombres.map(q).join(', ')}}) do
      assert(A.crear("Raiz", n))
      A.poner("i:" .. i .. "::|cffff0000x|r%s", "Raiz\`" .. n)
      assert(O.crear("subasta", n .. " op"))
      O.poner("subasta", n .. " op", "tope", "10g")
      O.ponerDeGrupo("Raiz\`" .. n, "subasta", {n .. " op"})
    end
    return ${T}.exportar("Raiz")
  end)()`);
  const b = maquina();
  const r = b.lua(`(function()
    local A, O = ${A}, ${O}
    local d, e = ${T}.leer(${q(r0)})
    local res = ${T}.importar(d, {})
    local hijos = {}
    for _, h in ipairs(A.hijos("Raiz")) do hijos[#hijos + 1] = h end
    local objetos, ops = {}, {}
    for _, h in ipairs(hijos) do
      for _, c in ipairs(A.objetos(h)) do objetos[#objetos + 1] = c end
      ops[#ops + 1] = (O.deGrupo(h, "subasta"))[1]
    end
    return {e = e, res = res, hijos = hijos, objetos = objetos, ops = ops, lista = O.lista("subasta")}
  end)()`);
  assert.equal(r.e, undefined);
  assert.deepEqual([...r.hijos].sort(), nombres.map((n) => 'Raiz`' + n).sort());
  assert.equal(r.objetos.length, 5);
  assert.ok(r.objetos.includes('i:1::|cffff0000x|r%s'));
  assert.deepEqual([...r.ops].sort(), nombres.map((n) => n + ' op').sort());
  assert.equal(r.lista.length, 5);
  sinErrores(a);
  sinErrores(b);
});

test('al importar, los nombres que ya existen se quedan como están y lo importado entra con nombre libre', () => {
  const a = maquina();
  a.lua(`(function() ${PREPARAR} end)()`);
  const t = a.lua(`${T}.exportar("Hierbas")`);

  // Los grupos: «Hierbas» ya existe -> «Hierbas 2», y la segunda vez «Hierbas 3»; con sus subgrupos.
  const b = maquina();
  const r = b.lua(`(function()
    local A, O = ${A}, ${O}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Mia")
    O.crear("subasta", "Pub"); O.poner("subasta", "Pub", "tope", "999") -- distinta: no se pisa
    O.crear("compras", "C"); O.poner("compras", "C", "fuentesReponer", {"banco", "hermandad"}) -- igual: se reutiliza
    local d = ${T}.leer(${q(t)})
    local r1 = ${T}.importar(d, {})
    local r2 = ${T}.importar(d, {})
    return {
      r1 = r1, r2 = r2, raiz = A.hijos(""), hijosDos = A.hijos("Hierbas 2"), hijosTres = A.hijos("Hierbas 3"),
      subastas = O.lista("subasta"), compras = O.lista("compras"), correos = O.lista("correo"),
      pubTope = O.valor("subasta", "Pub", "tope"), pub2Tope = O.valor("subasta", "Pub 2", "tope"),
      pub3Tope = O.valor("subasta", "Pub 3", "tope"),
      asignada = (O.deGrupo("Hierbas 2", "subasta"))[1], asignada3 = (O.deGrupo("Hierbas 3", "subasta"))[1],
      hija = (O.deGrupo("Hierbas 2\`Raras", "subasta"))[1], vinculo = O.vinculo("subasta", "Pub2", "tope"),
      propia = (O.deGrupo("Hierbas", "subasta")),
    }
  end)()`);
  assert.deepEqual(r.raiz, ['Hierbas', 'Hierbas 2', 'Hierbas 3']);
  assert.deepEqual(r.hijosDos, ['Hierbas 2`Raras']);
  assert.deepEqual(r.hijosTres, ['Hierbas 3`Raras']);
  assert.equal(r.pubTope, '999', 'la operación del jugador no se toca');
  assert.equal(r.pub2Tope, '300', 'la distinta entra con otro nombre');
  assert.equal(r.asignada, 'Pub 2', 'y los grupos apuntan a ese');
  assert.equal(r.hija, 'Pub2');
  assert.equal(r.vinculo, 'Pub 2', 'los vínculos siguen a la que se ha renombrado');
  assert.deepEqual(r.compras, ['C'], 'la igual se reutiliza');
  assert.deepEqual(r.correos, ['Env']);
  assert.deepEqual(r.r1, { grupos: 2, objetos: 2, operaciones: 4, nuevas: 3, reutilizadas: 1, renombradas: 1, quedan: 0, rutas: ['Hierbas 2'] });
  // La segunda vez, las que ya entraron en la primera son iguales: se reutilizan (y Pub, que sigue distinta, no).
  assert.equal(r.r2.reutilizadas, 4, 'la segunda vez todo lo importado ya está y se reutiliza (Pub con su «Pub 2»)');
  assert.equal(r.r2.nuevas, 0);
  assert.equal(r.r2.renombradas, 0);
  assert.deepEqual(r.r2.rutas, ['Hierbas 3']);
  assert.equal(r.r2.quedan, 2, 'los objetos ya están en el primer grupo importado y se quedan');
  assert.deepEqual(r.subastas, ['Pub', 'Pub 2', 'Pub2']);
  assert.equal(r.asignada3, 'Pub 2');
  sinErrores(a);
  sinErrores(b);
});

test('importar en un destino cuelga los grupos de ahí; el nombre de una operación largo se recorta bien', () => {
  const a = maquina();
  const largo = 'Ñ'.repeat(30); // 60 bytes: no cabe «<nombre> 2»
  a.lua(`(function()
    ${A}.crear("", "G"); ${A}.poner("i:5", "G")
    ${O}.crear("subasta", ${q(largo)}); ${O}.poner("subasta", ${q(largo)}, "tope", "1")
    ${O}.ponerDeGrupo("G", "subasta", {${q(largo)}})
  end)()`);
  const t = a.lua(`${T}.exportar("G")`);
  const b = maquina();
  const r = b.lua(`(function()
    local A, O = ${A}, ${O}
    A.crear("", "Dentro")
    O.crear("subasta", ${q(largo)}) -- distinta
    local d = ${T}.leer(${q(t)})
    local res = ${T}.importar(d, {destino = "Dentro"})
    return {res = res, hijos = A.hijos("Dentro"), lista = O.lista("subasta"), obj = A.objetos("Dentro\`G"),
      asignada = (O.deGrupo("Dentro\`G", "subasta"))[1]}
  end)()`);
  assert.deepEqual(r.hijos, ['Dentro`G']);
  assert.deepEqual(r.res.rutas, ['Dentro`G']);
  assert.deepEqual(r.obj, ['i:5']);
  assert.equal(r.lista.length, 2);
  assert.ok(Buffer.byteLength(r.asignada) <= 60);
  assert.ok(r.asignada.endsWith(' 2'));
  assert.equal(r.asignada.includes('�'), false, 'sin cortar un carácter por la mitad');
  assert.equal(Buffer.from(r.asignada, 'utf8').toString('utf8'), r.asignada);
  sinErrores(b);
});

test('la ventanita de exportar enseña el texto elegido y el resumen; Cerrar y Escape la cierran', () => {
  const m = maquina();
  m.lua(`(function() ${PREPARAR}
    SnetForever.Principal.abrir("grupos")
  end)()`);
  const r = m.lua(`(function()
    local G = ${G}
    local elegido = false
    G.texto.caja.HighlightText = function() elegido = true end
    G.exportar("Hierbas")
    local t = G.texto
    local especial = false
    for _, n in ipairs(UISpecialFrames) do if n == "SnetForeverGruposTexto" then especial = true end end
    local res = {
      visible = t:IsShown(), texto = t.caja:GetText(), titulo = t.titulo:GetText(), resumen = t.resumen:GetText(),
      foco = t.caja:HasFocus(), elegido = elegido, especial = especial, multi = t.caja:IsMultiLine(),
      pregunta = t.pregunta:IsShown(), importar = t.botonImportar:IsShown(), cerrar = t.botonCerrar.texto:GetText(),
    }
    -- Tocar el texto lo devuelve a como era.
    t.caja:SetText("otra cosa")
    res.intacto = t.caja:GetText() == res.texto
    -- Escape en la caja cierra solo esta ventana.
    t.caja:GetScript("OnEscapePressed")(t.caja)
    res.cerrada = not t:IsShown()
    res.pestana = SnetForever.Principal.pestana()
    local aunEspecial = false
    for _, n in ipairs(UISpecialFrames) do if n == "SnetForeverGruposTexto" then aunEspecial = true end end
    res.aunEspecial = aunEspecial
    -- El botón de la cabecera exporta el grupo elegido; el de arriba, todos.
    G.arbol:elegir("Hierbas")
    G.cabecera.botonExportar:Click("LeftButton")
    res.cabecera = t.titulo:GetText()
    t.botonCerrar:Click("LeftButton")
    G.botonExportar:Click("LeftButton")
    res.arriba = t.titulo:GetText()
    res.arribaResumen = t.resumen:GetText()
    G.cerrarTodo()
    res.alCerrarTodo = t:IsShown()
    return res
  end)()`);
  assert.equal(r.visible, true);
  assert.match(r.texto, /^SNF1:/);
  assert.equal(r.titulo, 'Exportar «Hierbas»');
  assert.equal(r.resumen, '2 grupos, 2 objetos, 4 operaciones');
  assert.equal(r.foco, true);
  assert.equal(r.elegido, true);
  assert.equal(r.especial, true);
  assert.equal(r.multi, true);
  assert.equal(r.pregunta, false);
  assert.equal(r.importar, false);
  assert.equal(r.cerrar, 'Cerrar');
  assert.equal(r.intacto, true);
  assert.equal(r.cerrada, true);
  assert.equal(r.pestana, 'grupos', 'la ventana principal sigue abierta');
  assert.equal(r.aunEspecial, false);
  assert.equal(r.cabecera, 'Exportar «Hierbas»');
  assert.equal(r.arriba, 'Exportar «Grupo Base»');
  assert.equal(r.arribaResumen, '3 grupos, 3 objetos, 4 operaciones');
  assert.equal(r.alCerrarTodo, false);
  sinErrores(m);
});

test('la ventanita de importar enseña el resumen, la pregunta (No por defecto) y, al importar, repinta el árbol', () => {
  const a = maquina();
  a.lua(`(function() ${PREPARAR} end)()`);
  const t = a.lua(`${T}.exportar("Hierbas")`);
  const m = maquina();
  const r = m.lua(`(function()
    SnetForever.Principal.abrir("grupos")
    local G, A = ${G}, ${A}
    A.crear("", "Otro"); A.poner("i:2447", "Otro")
    G.arbol:refrescar()
    G.importarTexto()
    local w = G.texto
    local res = {
      visible = w:IsShown(), titulo = w.titulo:GetText(), vacio = w.caja:GetText(), foco = w.caja:HasFocus(),
      pregunta = w.pregunta:GetText(), preguntaVista = w.pregunta:IsShown(), radio = w.radio:IsShown(),
      cancelar = w.botonCerrar.texto:GetText(), apagado = w.botonImportar.snfApagado,
      noMarcado = w.radio.valor,
    }
    -- Texto malo: aviso en rojo y el botón apagado; no importa nada.
    w.caja:SetText("hola")
    res.aviso = w.aviso:GetText(); res.apagadoMalo = w.botonImportar.snfApagado
    w.botonImportar:Click("LeftButton")
    res.aunVisible = w:IsShown(); res.gruposMalo = #A.hijos("")
    -- Texto bueno: el resumen y el botón vivo.
    w.caja:SetText(${q(t)})
    res.resumen = w.resumen:GetText(); res.aviso2 = w.aviso:GetText(); res.apagadoBueno = w.botonImportar.snfApagado
    -- Con «No» el objeto que ya estaba en otro grupo se queda.
    w.radio.no:Click("LeftButton")
    res.valorNo = w.radio.valor
    w.botonImportar:Click("LeftButton")
    res.cerrada = not w:IsShown()
    res.raiz = A.hijos("")
    res.objeto = A.objeto("i:2447")
    local visibles = {}
    for _, f in ipairs(G.arbol.filas) do if f:IsShown() and f.clave ~= nil then visibles[#visibles + 1] = f.clave end end
    res.visibles = visibles
    res.elegida = G.arbol:elegida()
    return res
  end)()`);
  assert.equal(r.visible, true);
  assert.equal(r.titulo, 'Importar grupos');
  assert.equal(r.vacio, '');
  assert.equal(r.foco, true);
  assert.equal(r.pregunta, '¿Mover los objetos que ya están en otro grupo?');
  assert.equal(r.preguntaVista, true);
  assert.equal(r.radio, true);
  assert.equal(r.cancelar, 'Cancelar');
  assert.equal(r.apagado, true);
  assert.equal(r.noMarcado, false);
  assert.equal(r.aviso, 'El texto está roto o incompleto. Cópialo de nuevo entero.');
  assert.equal(r.apagadoMalo, true);
  assert.equal(r.aunVisible, true);
  assert.equal(r.gruposMalo, 1);
  assert.equal(r.resumen, '2 grupos, 2 objetos, 4 operaciones');
  assert.equal(r.aviso2, '');
  assert.equal(r.apagadoBueno, false);
  assert.equal(r.valorNo, false);
  assert.equal(r.cerrada, true);
  assert.deepEqual(r.raiz, ['Hierbas', 'Otro']);
  assert.equal(r.objeto, 'Otro');
  assert.ok(r.visibles.includes('Hierbas'));
  assert.ok(r.visibles.includes('Hierbas`Raras'));
  assert.equal(r.elegida, 'Hierbas');
  const dichas = impresos(m);
  assert.ok(dichas.includes('Importado: 2 grupos, 1 objetos, 4 operaciones.'), dichas.join(' | '));

  // Con «Sí» sí se mueve.
  const m2 = maquina();
  const r2 = m2.lua(`(function()
    SnetForever.Principal.abrir("grupos")
    local G, A = ${G}, ${A}
    A.crear("", "Otro"); A.poner("i:2447", "Otro")
    G.importarTexto()
    local w = G.texto
    w.caja:SetText(${q(t)})
    w.radio.si:Click("LeftButton")
    local valor = w.radio.valor
    w.botonImportar:Click("LeftButton")
    return {valor = valor, objeto = A.objeto("i:2447")}
  end)()`);
  assert.equal(r2.valor, true);
  assert.equal(r2.objeto, 'Hierbas');
  sinErrores(m);
  sinErrores(m2);
  sinErrores(a);
});

test('en combate la ventanita no coge el teclado, y si el combate empieza con el foco puesto lo suelta', () => {
  const m = maquina();
  m.lua(`(function() ${PREPARAR}
    SnetForever.Principal.abrir("grupos")
  end)()`);
  m.jugador({ enCombate: true });
  const r = m.lua(`(function()
    local G = ${G}
    G.exportar("Hierbas")
    local w = G.texto
    local enCombate = {visible = w:IsShown(), foco = w.caja:HasFocus()}
    w.caja:SetFocus() -- el jugador hace clic en la caja
    enCombate.focoClic = w.caja:HasFocus()
    return enCombate
  end)()`);
  assert.equal(r.visible, true);
  assert.equal(r.foco, false);
  assert.equal(r.focoClic, false, 'en combate la caja suelta el foco al cogerlo');
  assert.ok(impresos(m).includes('En combate no se puede escribir en la ventana; haz clic en el cuadro si quieres pegar el texto.'));
  m.jugador({ enCombate: false });
  assert.equal(m.lua(`(function() ${G}.texto.caja:SetFocus(); return ${G}.texto.caja:HasFocus() end)()`), true);
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua(`${G}.texto.caja:HasFocus()`), false);
  sinErrores(m);
});

test('el texto del idioma inglés y la ventanita sin el módulo no dan error', () => {
  const m = nuevaMaquina({ jugador: { ...JUGADOR, idioma: 'enUS' }, pantalla: PANTALLA });
  m.lua(`(function() ${PREPARAR}
    SnetForever.Principal.abrir("grupos")
  end)()`);
  const r = m.lua(`(function()
    local G = ${G}
    G.importarTexto()
    local w = G.texto
    w.caja:SetText("hola")
    local res = {titulo = w.titulo:GetText(), aviso = w.aviso:GetText(), pregunta = w.pregunta:GetText()}
    G.exportar("Hierbas")
    res.exportar = w.titulo:GetText()
    res.resumen = w.resumen:GetText()
    return res
  end)()`);
  assert.equal(r.titulo, 'Import groups');
  assert.equal(r.aviso, 'The text is broken or incomplete. Copy it again in full.');
  assert.equal(r.pregunta, 'Move the items that are already in another group?');
  assert.equal(r.exportar, 'Export "Hierbas"');
  assert.equal(r.resumen, '2 groups, 2 items, 4 operations');
  // Sin el módulo (alguien lo quitó), los ganchos no hacen nada ni fallan.
  m.lua(`(function() SnetForever.TextoGrupos = nil; ${G}.texto:Hide(); ${G}.exportar("Hierbas"); ${G}.importarTexto() end)()`);
  assert.equal(m.lua(`${G}.texto:IsShown()`), false);
  sinErrores(m);
});

test('si algo falla a mitad de aplicar, se deshace todo lo hecho', () => {
  const a = maquina();
  a.lua(`(function() ${PREPARAR} end)()`);
  const t = a.lua(`${T}.exportar("Hierbas")`);
  const m = maquina();
  const r = m.lua(`(function()
    local A, O = ${A}, ${O}
    A.crear("", "Otro"); A.poner("i:2447", "Otro")
    O.crear("subasta", "Mia")
    local d = ${T}.leer(${q(t)})
    local poner = A.poner
    A.poner = function(clave, ruta) if clave == "i:765" then return false end return poner(clave, ruta) end -- falla el segundo objeto
    local res, e, c = ${T}.importar(d, {moverObjetos = true})
    A.poner = poner
    return {res = res == nil, e = e, c = c, raiz = A.hijos(""), donde = A.objeto("i:2447"), sin = A.objeto("i:765"),
      subastas = O.lista("subasta"), compras = O.lista("compras"), correos = O.lista("correo")}
  end)()`);
  assert.equal(r.res, true);
  assert.equal(r.c, 'fallo');
  assert.equal(r.e, 'No se ha podido importar; no se ha cambiado nada.');
  assert.deepEqual(r.raiz, ['Otro']);
  assert.equal(r.donde, 'Otro', 'el objeto que ya se había movido vuelve a su grupo');
  assert.equal(r.sin, undefined);
  assert.deepEqual(r.subastas, ['Mia']);
  assert.deepEqual(r.compras, []);
  assert.deepEqual(r.correos, []);
  sinErrores(m);
  sinErrores(a);
});

test('un texto pegado con un tramo enorme de espacios no congela el juego', () => {
  const m = maquina();
  const t0 = Date.now();
  for (const [t, codigo] of [
    ['SNF1:x' + ' '.repeat(200000) + 'x', 'roto'],
    ['SNF1:x' + ' '.repeat(399000) + 'x', 'roto'],
    ['  ' + ' '.repeat(450000) + 'x', 'grande'],
    ['x' + ' '.repeat(450000) + 'x', 'grande'],
    ['\n'.repeat(300000) + 'SNF1:x', 'roto'],
  ]) {
    const r = leer(m, t);
    assert.equal(r.ok, false);
    assert.equal(r.codigo, codigo);
  }
  assert.ok(Date.now() - t0 < 10000, `tardó ${Date.now() - t0} ms (el límite es 10000)`);
  // Un texto bueno con espacios por los lados sigue valiendo.
  const a = maquina();
  a.lua(`(function() ${PREPARAR} end)()`);
  const bueno = a.lua(`${T}.exportar("Hierbas")`);
  assert.equal(leer(m, ' \n\t ' + bueno + ' \n ').ok, true);
  sinErrores(m);
});
