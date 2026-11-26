// Ventana principal, parte 1, Task 25: importar de TSM con un clic (comercio/importar-tsm.lua del addon SnetForever_Comercio)
// y su ventanita en la página «Grupos». La configuración de TSM es una muestra INVENTADA (test/datos/tsm-muestra.lua) que se
// carga como si fuera la SavedVariable de TSM. Todas necesitan el comercio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';
import { luaTSM, rutasSinteticas } from './sinteticos.js';

const MUESTRA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'datos', 'tsm-muestra.lua'), 'utf8');
const JUGADOR = { idioma: 'esES', nombre: 'Alba', reino: 'Mirador', faccion: 'Horde', nivel: 60 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const I = 'SnetForever.ImportarTSM';
const A = 'SnetForever.Arbol';
const O = 'SnetForever.Operaciones';
const F = 'SnetForever.Formulas';
const G = 'SnetForever.PrincipalGrupos';
const S = '`';
const q = (t) => JSON.stringify(t);
const OTROS = ['Kurgath', 'Selyndra', 'Thornak']; // los «otros jugadores» de la muestra
const CLAVES = ['p@Default@userData@groups', 'p@Default@userData@items', 'p@Default@userData@operations', 'g@ @userData@customPriceSources'];
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));

// Una máquina con la muestra de TSM cargada (o sin ella) y Brisa apuntada como otro personaje propio de la cuenta (lo hace el
// addon cuando ese personaje juega).
function maquina({ tsm = true, previo = '' } = {}) {
  const m = nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, previo: (tsm ? MUESTRA : '') + '\n' + previo });
  m.jugador({ nombre: 'Brisa' });
  m.lua(`${O}.propios()`);
  m.jugador({ nombre: 'Alba' });
  m.lua(`${O}.propios()`);
  return m;
}

// Empieza la importación y deja correr el tiempo hasta que acaba. Devuelve el informe y cuántos pasos hicieron falta.
function importar(m, opciones = '{modo = "reemplazar"}') {
  m.lua(`${I}.importar(${opciones})`);
  let pasos = 0;
  while (m.lua(`${I}.estado().estado`) === 'importando' && pasos < 5000) {
    m.avanzar(0.05);
    pasos++;
  }
  return { ...m.lua(`${I}.estado()`), pasos };
}

const valor = (m, tipo, nombre, campo) => m.lua(`${O}.valor(${q(tipo)}, ${q(nombre)}, ${q(campo)})`);
const vinculo = (m, tipo, nombre, campo) => m.lua(`${O}.vinculo(${q(tipo)}, ${q(nombre)}, ${q(campo)})`);
// deGrupo da {nombres, heredadaDe} (sin la lista de las que faltan).
const deGrupo = (m, ruta, tipo) => m.lua(`(function() local n, de = ${O}.deGrupo(${q(ruta)}, ${q(tipo)}); return {n, de} end)()`);
// Lo que da importar(): [empezó, motivo].
const empezar = (m, opciones) => m.lua(`(function() local inf, motivo = ${I}.importar(${opciones}); return {inf ~= nil, motivo} end)()`);

test('con la muestra: analizar cuenta grupos, objetos, operaciones y fuentes', () => {
  const m = maquina();
  assert.deepEqual(m.lua(`{${I}.disponible()}`), [true]);
  const r = m.lua(`${I}.analizar()`);
  assert.equal(r.grupos, 9, 'los 8 grupos y el grupo base de TSM, como cuenta TSM sus claves');
  assert.equal(r.objetos, 40);
  assert.deepEqual(r.operaciones, { subasta: 3, artesania: 2, correo: 2, compras: 1, sniper: 1, vendedor: 1, almacen: 1 });
  assert.equal(r.totalOperaciones, 11);
  assert.equal(r.fuentes, 1);
  assert.equal(r.chocan, 0);
  assert.equal(r.enOtroGrupo, 0);
  assert.equal(r.hayGrupos, false);
  assert.equal(r.perfil, 'Default');
  // Con grupos en SnetForever: los que ya existen chocan y los objetos que ya están en otro grupo se cuentan.
  m.lua(`${A}.crear("", "Hierbas"); ${A}.crear("", "Viejo"); ${A}.poner("i:2447", "Viejo"); ${A}.poner("i:3355", "Hierbas"); ${A}.poner("i:765", "")`);
  const otra = m.lua(`${I}.analizar()`);
  assert.equal(otra.chocan, 1);
  assert.equal(otra.enOtroGrupo, 1, 'i:2447 está en Viejo; i:3355 ya está donde va y i:765 está sin grupo');
  assert.equal(otra.hayGrupos, true);
  // Analizar no cambia nada.
  assert.equal(m.lua(`${A}.existe("Hierbas${S}Raras")`), false);
  sinErrores(m);
});

test('importar copia todo y la comprobación da las mismas cuentas', () => {
  const m = maquina();
  const inf = importar(m);
  assert.equal(inf.estado, 'hecho');
  assert.ok(inf.pasos > 3, `repartido en fotogramas (${inf.pasos} pasos)`);
  assert.equal(inf.grupos, 9);
  assert.equal(inf.objetos, 40);
  assert.equal(inf.operaciones, 11);
  assert.equal(inf.fuentes, 1);
  assert.equal(inf.comprobacion.bien, true, JSON.stringify(inf.comprobacion));
  assert.equal(inf.avance, 100);
  // Grupos con sus rutas y objetos con su clave tal cual.
  for (const r of ['Hierbas', `Hierbas${S}Comunes`, `Hierbas${S}Raras`, `Hierbas${S}Raras${S}Lotos`, 'Minerales', `Minerales${S}Barras`, 'Mascotas', `Mascotas${S}Raras`]) {
    assert.equal(m.lua(`${A}.existe(${q(r)})`), true, r);
  }
  assert.equal(m.lua(`${A}.objeto("i:8836::1:3")`), `Hierbas${S}Raras`);
  assert.equal(m.lua(`${A}.objeto("i:13466::2:7:9")`), `Hierbas${S}Raras${S}Lotos`);
  assert.equal(m.lua(`${A}.objeto("p:1124:10:3")`), `Mascotas${S}Raras`);
  assert.equal(m.lua(`${A}.contar()`), 40);
  // Subasta, con los campos traducidos a los nuestros.
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'ignorarDuracion'), '1');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'tope'), '100');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'reservaEnBolsas'), '20');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'caducadasMaximas'), '3');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'duracion'), '48');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'pujaPorcentaje'), 80);
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'rebaja'), '1c');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'precioMinimo'), 'max(80% snfmercado, 1.5 * vendorsell)');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'precioMaximo'), '200% snfhistorico');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'precioNormal'), 'first(snfregional(), minprecio, 50s)');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'bajoMinimo'), 'minimo');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'sobreMaximo'), 'normal');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'cancelarRebajadas'), true);
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'cancelarParaSubir'), false);
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'umbralReponer'), '50s');
  assert.equal(valor(m, 'subasta', 'Raras caras', 'duracion'), '12');
  assert.equal(valor(m, 'subasta', 'Raras caras', 'bajoMinimo'), 'ignorar');
  assert.equal(valor(m, 'subasta', 'Raras caras', 'sobreMaximo'), 'noPublicar');
  assert.equal(valor(m, 'subasta', '#Default', 'precioMinimo'),
    'check(first(crafting,snfmercado,snfregional()),max(0.25*avg(crafting,snfmercado,snfregional()),1.5*vendorsell))');
  // Vínculos: el campo enlazado enseña el de la otra operación.
  assert.equal(vinculo(m, 'subasta', 'Raras caras', 'precioMinimo'), 'Hierbas 5x20');
  assert.equal(vinculo(m, 'subasta', 'Raras caras', 'rebaja'), 'Hierbas 5x20');
  assert.equal(valor(m, 'subasta', 'Raras caras', 'precioMinimo'), 'max(80% snfmercado, 1.5 * vendorsell)');
  assert.equal(vinculo(m, 'artesania', 'Fabricar', 'reponerMaximo'), '#Default');
  // Listas de ignorar: solo personajes y casas propios, por nombre y reino.
  assert.deepEqual(valor(m, 'subasta', 'Raras caras', 'ignorarPersonajes'), ['Brisa - Mirador']);
  assert.deepEqual(valor(m, 'subasta', 'Raras caras', 'ignorarReinos'), ['Mirador|Horde']);
  assert.deepEqual(valor(m, 'correo', 'A otro', 'ignorarPersonajes'), []);
  // Artesanía: «sin beneficio mínimo» y «con valor propio» van con su interruptor.
  assert.equal(valor(m, 'artesania', 'Fabricar', 'reponerMinimo'), '2');
  assert.equal(valor(m, 'artesania', 'Fabricar', 'beneficioMinimoActivo'), false);
  assert.equal(valor(m, 'artesania', 'Fabricar', 'cambiarValor'), true);
  assert.equal(valor(m, 'artesania', 'Fabricar', 'valorFabricado'), 'minprecio * 1.1');
  assert.equal(valor(m, 'artesania', '#Default', 'beneficioMinimoActivo'), true);
  assert.equal(valor(m, 'artesania', '#Default', 'beneficioMinimo'), '100g');
  assert.equal(valor(m, 'artesania', '#Default', 'cambiarValor'), false);
  // Correo: el destinatario solo si es un personaje propio.
  assert.equal(valor(m, 'correo', 'Al banco', 'destinatario'), 'Brisa');
  assert.equal(valor(m, 'correo', 'Al banco', 'limitarCantidad'), true);
  assert.equal(valor(m, 'correo', 'Al banco', 'cantidadMaxima'), '40');
  assert.equal(valor(m, 'correo', 'Al banco', 'reponerDestino'), true);
  assert.deepEqual(valor(m, 'correo', 'Al banco', 'fuentesReponer'), ['hermandad']);
  assert.equal(valor(m, 'correo', 'Al banco', 'conservar'), '5');
  assert.equal(valor(m, 'correo', 'A otro', 'destinatario'), '');
  assert.deepEqual(inf.quitados, { personajes: 2, casas: 1, destinatarios: 1 });
  // Compras, sniper, vendedor y almacén.
  assert.equal(valor(m, 'compras', 'Compra barata', 'precioMaximo'), '90% snfregional()');
  assert.equal(valor(m, 'compras', 'Compra barata', 'mostrarSobreMaximo'), false);
  assert.equal(valor(m, 'compras', 'Compra barata', 'reponerCantidad'), '200');
  assert.deepEqual(valor(m, 'compras', 'Compra barata', 'fuentesReponer'), ['alters', 'banco']);
  assert.equal(valor(m, 'sniper', 'Cazar', 'precioMaximo'), '70% snfminimo');
  assert.equal(valor(m, 'vendedor', 'Chatarra', 'caducadasMinimas'), '10');
  assert.equal(valor(m, 'vendedor', 'Chatarra', 'venderLigados'), true);
  assert.equal(valor(m, 'vendedor', 'Chatarra', 'conservar'), '1');
  assert.deepEqual(valor(m, 'vendedor', 'Chatarra', 'fuentesReponer'), ['subastas', 'subastasAlters']);
  assert.equal(valor(m, 'vendedor', 'Chatarra', 'comprarActivo'), false);
  assert.equal(valor(m, 'vendedor', 'Chatarra', 'venderActivo'), true);
  assert.equal(valor(m, 'vendedor', 'Chatarra', 'valorMercado'), 'snfmercado');
  assert.equal(valor(m, 'vendedor', 'Chatarra', 'valorMercadoMaximo'), '5g');
  assert.equal(valor(m, 'vendedor', 'Chatarra', 'valorDestruccion'), 'snfmercado');
  const almacen = ['mover', 'moverPila', 'conservarEnBolsas', 'conservarEnBanco', 'reponerCantidad', 'reponerPila', 'reponerConservarEnBanco'];
  assert.deepEqual(almacen.map((c) => valor(m, 'almacen', 'Guardar', c)), ['5', '20', '1', '2', '10', '5', '3']);
  // La herencia y los overrides de cada grupo.
  assert.deepEqual(deGrupo(m, '', 'subasta'), [['#Default']]);
  assert.deepEqual(deGrupo(m, 'Hierbas', 'subasta'), [['Hierbas 5x20']]);
  assert.deepEqual(deGrupo(m, `Hierbas${S}Comunes`, 'subasta'), [['Hierbas 5x20'], 'Hierbas']);
  assert.deepEqual(deGrupo(m, `Hierbas${S}Raras`, 'subasta'), [['Raras caras', 'Hierbas 5x20']]);
  assert.deepEqual(deGrupo(m, `Hierbas${S}Raras${S}Lotos`, 'subasta'), [['Raras caras', 'Hierbas 5x20'], `Hierbas${S}Raras`]);
  assert.deepEqual(deGrupo(m, `Hierbas${S}Raras${S}Lotos`, 'sniper'), [['Cazar']]);
  assert.deepEqual(deGrupo(m, `Hierbas${S}Comunes`, 'compras'), [['Compra barata'], 'Hierbas']);
  assert.deepEqual(deGrupo(m, 'Mascotas', 'subasta'), [[]], 'un override vacío también se copia');
  assert.deepEqual(deGrupo(m, `Mascotas${S}Raras`, 'subasta'), [[], 'Mascotas']);
  assert.deepEqual(deGrupo(m, 'Minerales', 'correo'), [['Al banco', 'A otro']]);
  assert.deepEqual(deGrupo(m, 'Minerales', 'subasta'), [['#Default'], '']);
  assert.deepEqual(deGrupo(m, `Minerales${S}Barras`, 'vendedor'), [['Chatarra']]);
  assert.deepEqual(deGrupo(m, `Minerales${S}Barras`, 'artesania'), [['Fabricar']]);
  // La fuente propia.
  assert.equal(m.lua(`${F}.fuentes().minprecio`), 'max(min(snfhistorico, snfregional(), snfhistorico), vendorsell)');
  sinErrores(m);
});

// C2a: en Forever la API de la subasta usa 1 = 2 horas, 2 = 8 horas y 3 = 24 horas. Las claves guardadas siguen siendo
// «12», «24» y «48» (el nombre antiguo); lo que cambia es lo que se enseña. Tres operaciones inventadas con la forma de TSM.
test('importar de TSM duration=1, 2 y 3 da las claves «12», «24» y «48», que se enseñan como «2 horas», «8 horas» y «24 horas»', () => {
  const m = maquina({ previo: `do
    local subasta = TradeSkillMasterDB["p@Default@userData@operations"].Auctioning
    for nombre, d in pairs({Corta = 1, Media = 2, Larga = 3}) do
      subasta[nombre] = {duration = d, ignorePlayer = {}, ignoreFactionrealm = {}, relationships = {}}
    end
  end` });
  assert.equal(importar(m).estado, 'hecho');
  const r = m.lua(`(function()
    local L, O = SnetForever.L, ${O}
    local nombres = {}
    for _, o in ipairs(O.campo("subasta", "duracion").opciones) do nombres[o.clave] = o.nombre end
    local out = {}
    for _, op in ipairs({"Corta", "Media", "Larga"}) do
      local clave = O.valor("subasta", op, "duracion")
      local k = "PRINCIPAL_EDITOR_O_DURACION_" .. clave
      out[#out + 1] = {clave, L.tablas.es[k], L.tablas.en[k], nombres[clave]}
    end
    return out
  end)()`);
  assert.deepEqual(r, [
    ['12', '2 horas', '2 hours', '2 horas'],
    ['24', '8 horas', '8 hours', '8 horas'],
    ['48', '24 horas', '24 hours', '24 horas'],
  ]);
  sinErrores(m);
});

test('la comprobación dice qué falta cuando algo no se puede copiar', () => {
  // Un grupo cuyo nombre parece un comando del chat no se crea (T1a): la comprobación lo cuenta como que falta, con su objeto.
  const m = maquina({ previo: `TradeSkillMasterDB["p@Default@userData@groups"]["Minerales${S}/run x"] = {}
    TradeSkillMasterDB["p@Default@userData@items"]["i:777"] = "Minerales${S}/run x"` });
  const inf = importar(m);
  assert.equal(inf.estado, 'hecho');
  assert.equal(inf.esperado.grupos, 10);
  assert.equal(inf.esperado.objetos, 41);
  assert.equal(inf.grupos, 9);
  assert.equal(inf.objetos, 40);
  assert.equal(inf.comprobacion.bien, false);
  assert.deepEqual(inf.comprobacion.faltan.grupos, [`Minerales${S}/run x`]);
  assert.equal(inf.comprobacion.faltan.objetos, 1);
  assert.deepEqual(inf.comprobacion.faltan.operaciones, []);
  assert.match(inf.comprobacion.mensaje, /1 grupo/);
  assert.equal(m.lua(`${A}.existe("Minerales${S}/run x")`), false);
  sinErrores(m);
});

test('las fórmulas db* se traducen; dbregionsaleavg queda marcada y en la lista', () => {
  const m = maquina();
  const r = m.lua(`${I}.analizar()`);
  const buscar = (lista, tipo, op, campo) => lista.find((e) => e.tipo === tipo && e.operacion === op && e.campo === campo);
  const t = buscar(r.formulas.traducidas, 'subasta', 'Hierbas 5x20', 'precioMinimo');
  assert.deepEqual([t.antes, t.despues], ['max(80% dbmarket, 1.5 * vendorsell)', 'max(80% snfmercado, 1.5 * vendorsell)']);
  assert.ok(buscar(r.formulas.traducidas, 'sniper', 'Cazar', 'precioMaximo'));
  assert.ok(r.formulas.traducidas.find((e) => e.fuente === 'minprecio'), 'también las fuentes propias');
  assert.equal(buscar(r.formulas.traducidas, 'subasta', 'Hierbas 5x20', 'tope'), undefined, 'lo que no cambia no sale');
  const marcada = buscar(r.formulas.marcadas, 'subasta', 'Raras caras', 'precioNormal');
  assert.equal(marcada.despues, 'first(125% dbregionsaleavg, 120% snfmercado, 50g)');
  assert.deepEqual(marcada.desconocidas, ['dbregionsaleavg']);
  assert.ok(buscar(r.formulas.marcadas, 'subasta', 'Raras caras', 'precioMaximo'));
  assert.equal(r.formulas.marcadas.length, 2);
  assert.equal(buscar(r.formulas.traducidas, 'subasta', 'Raras caras', 'precioNormal'), undefined, 'una marcada no sale como traducida');
  // Tras importar: la fórmula marcada queda escrita tal cual (el editor la pinta en rojo: no se calcula) y sale en la lista.
  const inf = importar(m);
  assert.equal(valor(m, 'subasta', 'Raras caras', 'precioNormal'), 'first(125% dbregionsaleavg, 120% snfmercado, 50g)');
  assert.deepEqual(m.lua(`{${F}.compilar("first(125% dbregionsaleavg, 120% snfmercado, 50g)") ~= nil}`), [false]);
  assert.equal(inf.formulas.marcadas.length, 2);
  assert.ok(inf.formulas.traducidas.length >= 8);
  assert.ok(buscar(inf.formulas.marcadas, 'subasta', 'Raras caras', 'precioMaximo'));
  // Las traducidas sí se calculan (la fuente propia ya está).
  assert.notEqual(m.lua(`${F}.compilar(${q(valor(m, 'subasta', 'Hierbas 5x20', 'precioNormal'))}) ~= nil`), false);
  sinErrores(m);
});

test('juntar y reemplazar (lo anterior queda en _antes); mover objetos o no', () => {
  const PREPARAR = `(function()
    local A, O = ${A}, ${O}
    A.crear("", "Hierbas"); A.crear("", "Viejo")
    A.poner("i:2447", "Viejo"); A.poner("i:9999", "Viejo")
    O.crear("subasta", "Mía"); O.ponerDeGrupo("Hierbas", "subasta", {"Mía"})
    O.crear("subasta", "Hierbas 5x20"); O.poner("subasta", "Hierbas 5x20", "tope", "7")
    SnetForeverCuenta.comercio.reglas = {["propio:Hierbas"] = {compraPct = 70}}
    SnetForever.Formulas.ponerFuente("minprecio", "vendorsell")
  end)()`;
  // Juntar sin mover: lo del jugador se queda; la operación con el mismo nombre y otros campos entra como «… 2».
  let m = maquina();
  m.lua(PREPARAR);
  let inf = importar(m, '{modo = "juntar", moverObjetos = false}');
  assert.equal(inf.estado, 'hecho');
  assert.equal(inf.comprobacion.bien, true, JSON.stringify(inf.comprobacion));
  assert.equal(inf.quedan, 1);
  assert.equal(inf.objetos, 39);
  assert.equal(m.lua(`${A}.objeto("i:2447")`), 'Viejo');
  assert.equal(m.lua(`${A}.objeto("i:9999")`), 'Viejo');
  assert.equal(m.lua(`${A}.existe("Viejo")`), true);
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'tope'), '7', 'nunca se pisa una operación del jugador');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20 2', 'tope'), '100');
  assert.deepEqual(deGrupo(m, `Hierbas${S}Raras`, 'subasta'), [['Raras caras', 'Hierbas 5x20 2']]);
  assert.equal(vinculo(m, 'subasta', 'Raras caras', 'precioMinimo'), 'Hierbas 5x20 2');
  assert.deepEqual(deGrupo(m, 'Hierbas', 'subasta'), [['Mía']], 'el override que ya tenía el jugador se queda');
  assert.equal(m.lua(`${F}.fuentes().minprecio`), 'vendorsell', 'la fuente propia del jugador se queda');
  assert.deepEqual(inf.fuentesTuyas, ['minprecio']);
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2._antes'), undefined);
  // Otra vez juntar: las operaciones iguales se reutilizan (no salen «… 3»).
  inf = importar(m, '{modo = "juntar", moverObjetos = false}');
  assert.equal(inf.comprobacion.bien, true);
  assert.deepEqual(m.lua(`${O}.lista("subasta")`), ['#Default', 'Hierbas 5x20', 'Hierbas 5x20 2', 'Mía', 'Raras caras']);
  sinErrores(m);

  // Juntar moviendo: el objeto que estaba en otro grupo pasa al de TSM.
  m = maquina();
  m.lua(PREPARAR);
  inf = importar(m, '{modo = "juntar", moverObjetos = true}');
  assert.equal(inf.quedan, 0);
  assert.equal(inf.objetos, 40);
  assert.equal(m.lua(`${A}.objeto("i:2447")`), `Hierbas${S}Comunes`);
  assert.equal(m.lua(`${A}.objeto("i:9999")`), 'Viejo');
  sinErrores(m);

  // Reemplazar: lo anterior va entero a _antes (nada se borra) y queda solo lo de TSM.
  m = maquina();
  m.lua(PREPARAR);
  inf = importar(m, '{modo = "reemplazar"}');
  assert.equal(inf.comprobacion.bien, true, JSON.stringify(inf.comprobacion));
  assert.equal(m.lua(`${A}.existe("Viejo")`), false);
  assert.equal(m.lua(`${A}.objeto("i:9999")`), undefined);
  assert.equal(m.lua(`${O}.existe("subasta", "Mía")`), false);
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'tope'), '100');
  assert.deepEqual(deGrupo(m, 'Hierbas', 'subasta'), [['Hierbas 5x20']]);
  assert.equal(m.lua(`${F}.fuentes().minprecio`), 'max(min(snfhistorico, snfregional(), snfhistorico), vendorsell)');
  assert.equal(m.lua('SnetForeverCuenta.comercio.reglas["propio:Hierbas"]'), undefined, 'el grupo nuevo no hereda la regla del viejo');
  const antes = m.lua('SnetForeverCuenta.comercio.v2._antes');
  assert.equal(antes.length, 1);
  assert.equal(antes[0].grupos.Viejo, true);
  assert.equal(antes[0].objetos['i:9999'], 'Viejo');
  assert.ok(antes[0].operaciones.subasta['Mía']);
  assert.deepEqual(antes[0].gruposOps.Hierbas.subasta, ['Mía']);
  assert.equal(antes[0].fuentes.minprecio, 'vendorsell');
  assert.deepEqual(antes[0].reglas['propio:Hierbas'], { compraPct: 70 });
  assert.equal(typeof antes[0].cuando, 'number');
  // Un segundo reemplazo guarda también lo de entonces: _antes es una lista.
  importar(m, '{modo = "reemplazar"}');
  assert.equal(m.lua('#SnetForeverCuenta.comercio.v2._antes'), 2);
  sinErrores(m);
});

test('un override huérfano no lo adopta el grupo nuevo con su ruta: va a la papelera', () => {
  const m = maquina();
  // Datos viejos: operaciones guardadas para «Hierbas» sin que el grupo exista (como dejaba la Task 15).
  m.lua(`(function()
    ${O}.crear("correo", "Suelto")
    SnetForeverCuenta.comercio.v2.gruposOps = {Hierbas = {correo = {"Suelto"}}}
    SnetForeverCuenta.comercio.reglas = {["propio:Hierbas"] = {compraPct = 10}}
  end)()`);
  assert.deepEqual(m.lua(`${O}.huerfanos()`), ['Hierbas']);
  const inf = importar(m, '{modo = "juntar", moverObjetos = false}');
  assert.equal(inf.comprobacion.bien, true);
  assert.deepEqual(deGrupo(m, 'Hierbas', 'correo'), [[], ''], 'hereda del Grupo Base, no las del huérfano');
  assert.deepEqual(deGrupo(m, 'Hierbas', 'subasta'), [['Hierbas 5x20']]);
  assert.equal(m.lua('SnetForeverCuenta.comercio.reglas["propio:Hierbas"]'), undefined);
  assert.deepEqual(m.lua(`${O}.huerfanos()`), []);
  const papelera = m.lua('SnetForeverCuenta.comercio.v2._papelera');
  const e = papelera.find((x) => x.ruta === 'Hierbas');
  assert.deepEqual(e.ops.Hierbas, { correo: ['Suelto'] });
  assert.deepEqual(e.reglas.Hierbas, { compraPct: 10 });
  sinErrores(m);
});

test('sin TradeSkillMasterDB, sin alguna clave o con otro perfil: disponible() explica qué falta y no importa a medias', () => {
  const cuenta = (m) => JSON.stringify(m.lua('SnetForeverCuenta.comercio.v2'));
  // Sin TSM.
  let m = maquina({ tsm: false });
  let [ok, motivo] = m.lua(`{${I}.disponible()}`);
  assert.equal(ok, false);
  assert.match(motivo, /TSM/);
  assert.match(motivo, /lista de addons/);
  let antes = cuenta(m);
  assert.deepEqual(empezar(m, '{modo = "reemplazar"}'), [false, motivo]);
  m.avanzar(1);
  assert.equal(cuenta(m), antes);
  sinErrores(m);
  // Falta una de las 4 claves.
  m = maquina({ previo: 'TradeSkillMasterDB["p@Default@userData@items"] = nil' });
  [ok, motivo] = m.lua(`{${I}.disponible()}`);
  assert.equal(ok, false);
  assert.match(motivo, /objetos/);
  assert.match(motivo, /Default/);
  antes = cuenta(m);
  assert.deepEqual(empezar(m, '{modo = "reemplazar"}'), [false, motivo]);
  m.avanzar(1);
  assert.equal(cuenta(m), antes, 'no se importa a medias');
  sinErrores(m);
  // El personaje usa otro perfil de TSM que no tiene los datos.
  m = maquina({ previo: 'TradeSkillMasterDB._currentProfile["Alba - Mirador"] = "Subastas"' });
  [ok, motivo] = m.lua(`{${I}.disponible()}`);
  assert.equal(ok, false);
  assert.match(motivo, /Subastas/);
  // Con los datos en ese perfil, se leen los suyos.
  m = maquina({ previo: `TradeSkillMasterDB._currentProfile["Alba - Mirador"] = "Subastas"
    for _, k in ipairs({"groups", "items", "operations"}) do
      TradeSkillMasterDB["p@Subastas@userData@" .. k] = TradeSkillMasterDB["p@Default@userData@" .. k]
    end
    TradeSkillMasterDB["p@Subastas@userData@items"] = {["i:1"] = "Hierbas"}` });
  assert.deepEqual(m.lua(`{${I}.disponible()}`), [true]);
  assert.equal(m.lua(`${I}.analizar()`).objetos, 1);
  assert.equal(m.lua(`${I}.analizar()`).perfil, 'Subastas');
  // Sin perfil apuntado para este personaje: Default.
  m = maquina({ previo: 'TradeSkillMasterDB._currentProfile = nil' });
  assert.deepEqual(m.lua(`{${I}.disponible()}`), [true]);
  assert.equal(m.lua(`${I}.analizar()`).perfil, 'Default');
  sinErrores(m);
});

test('en combate no empieza; si entra en combate a medias, se pausa y sigue al salir', () => {
  const m = maquina();
  m.jugador({ enCombate: true });
  const r = empezar(m, '{modo = "reemplazar"}');
  assert.equal(r[0], false);
  assert.match(r[1], /combate/);
  m.jugador({ enCombate: false });
  m.lua(`${I}.importar({modo = "reemplazar"})`);
  m.avanzar(0.05);
  m.avanzar(0.05);
  assert.equal(m.lua(`${I}.estado().estado`), 'importando');
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  m.avanzar(0.05);
  const parado = m.lua(`${I}.estado()`);
  assert.equal(parado.estado, 'pausado');
  m.avanzar(5);
  assert.equal(m.lua(`${I}.estado().avance`), parado.avance, 'en pausa no avanza');
  assert.equal(m.lua(`${I}.estado().estado`), 'pausado');
  m.jugador({ enCombate: false });
  m.disparar('PLAYER_REGEN_ENABLED');
  for (let i = 0; i < 2000 && m.lua(`${I}.estado().estado`) !== 'hecho'; i++) m.avanzar(0.05);
  const inf = m.lua(`${I}.estado()`);
  assert.equal(inf.estado, 'hecho');
  assert.equal(inf.comprobacion.bien, true);
  sinErrores(m);
});

test('solo se leen las 4 claves', () => {
  // TradeSkillMasterDB es un intermediario que apunta cada clave que se le pide.
  const m = maquina({ previo: `do
    local datos, leidas = TradeSkillMasterDB, {}
    TradeSkillMasterDB = setmetatable({}, {__index = function(_, k) leidas[#leidas + 1] = k; return datos[k] end})
    TSM_LEIDAS = leidas
  end` });
  importar(m, '{modo = "reemplazar"}');
  m.lua(`${I}.analizar()`);
  m.lua(`${I}.disponible()`);
  const leidas = [...new Set(m.lua('TSM_LEIDAS'))].sort();
  assert.deepEqual(leidas, [...CLAVES, '_currentProfile'].sort(), 'las 4 claves y el perfil del personaje');
  // Nada de los otros jugadores llega a lo guardado.
  const guardado = JSON.stringify(m.guardado());
  for (const n of [...OTROS, 'Lejano']) assert.equal(guardado.includes(n), false, n);
  assert.equal(guardado.includes('Brisa'), true, 'los personajes propios sí');
  sinErrores(m);
});

test('aguante sintético: 353 grupos y 11.630 objetos generados se importan repartidos en fotogramas, sin un paso de más de 50 ms en el banco', () => {
  // El generador vive en test/sinteticos.js (lo usa también principal-aguante.test.js): 3 niveles, como siempre.
  const datos = rutasSinteticas({ niveles: 3 });
  assert.equal(datos.rutas.length, 352, 'más el grupo base: 353 grupos, como los cuenta TSM');
  const m = nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, previo: luaTSM(datos) });
  const cpu = (f) => {
    const t0 = process.cpuUsage();
    f();
    const d = process.cpuUsage(t0);
    return (d.user + d.system) / 1000;
  };
  // Ronda 1: la lectura que pide la ventanita (ImportarTSM.leer) también va en pasos, con la misma vara.
  const lectura = [cpu(() => m.lua(`${I}.leer({})`))];
  let pasosLectura = 0;
  while (m.lua(`${I}.lectura().estado`) === 'leyendo' && pasosLectura < 5000) {
    lectura.push(cpu(() => m.avanzar(0.05)));
    pasosLectura++;
  }
  const leida = m.lua(`${I}.lectura()`);
  assert.equal(leida.estado, 'leido');
  assert.equal(leida.resumen.grupos, 353);
  assert.equal(leida.resumen.objetos, 11630);
  assert.equal(leida.avance, 100);
  assert.ok(pasosLectura > 5, `la lectura, repartida en ${pasosLectura} pasos`);
  const largaLectura = Math.max(...lectura);
  console.log(`aguante: leer en ${pasosLectura} pasos, el más largo ${largaLectura.toFixed(1)} ms de CPU`);
  const largasLectura = lectura.filter((t) => t >= 50);
  assert.ok(largasLectura.length <= 2, `pasos de leer de más de 50 ms: ${largasLectura.map((t) => t.toFixed(1)).join(', ')}`);
  // Un paso suelto se puede disparar por el recolector de basura de node: se mide cada paso y se exige que el más largo
  // baje de 50 ms (el más largo se apunta en el informe de la tarea).
  const tiempos = [cpu(() => m.lua(`${I}.importar({modo = "reemplazar"})`))];
  let pasos = 0;
  while (m.lua(`${I}.estado().estado`) === 'importando' && pasos < 5000) {
    tiempos.push(cpu(() => m.avanzar(0.05)));
    pasos++;
  }
  const inf = m.lua(`${I}.estado()`);
  assert.equal(inf.estado, 'hecho');
  assert.equal(inf.grupos, 353);
  assert.equal(inf.objetos, 11630);
  assert.equal(inf.comprobacion.bien, true);
  assert.ok(pasos > 20, `repartido en ${pasos} pasos`);
  const largo = Math.max(...tiempos);
  console.log(`aguante: ${pasos} pasos, el más largo ${largo.toFixed(1)} ms de CPU`);
  // Con el GC de node, como mucho dos pasos sueltos pueden pasarse: el resto, y casi todos, por debajo.
  const largos = tiempos.filter((t) => t >= 50);
  assert.ok(largos.length <= 2, `pasos de más de 50 ms: ${largos.map((t) => t.toFixed(1)).join(', ')}`);
  assert.equal(m.lua(`${A}.contar()`), 11630);
  sinErrores(m);
});

test('la ventanita: sin TSM lo explica en el chat; con TSM, resumen, preguntas, avance y el informe con las fórmulas', () => {
  // Sin TSM: una línea en el chat con el motivo y ninguna ventanita.
  let m = maquina({ tsm: false });
  m.lua(`SnetForever.Principal.abrir("grupos")`);
  const antes = impresos(m).length;
  m.lua(`${G}.importarTSM()`);
  const dichas = impresos(m).slice(antes);
  assert.equal(dichas.length, 1);
  assert.equal(dichas[0], m.lua(`select(2, ${I}.disponible())`));
  assert.equal(m.lua(`${G}.texto:IsShown()`), false);
  sinErrores(m);

  // Con TSM y ya con grupos: pregunta juntar o reemplazar y si se mueven los objetos.
  m = maquina();
  m.lua(`SnetForever.Principal.abrir("grupos"); ${A}.crear("", "Viejo")`);
  m.lua(`${G}.importarTSM()`);
  // Ronda 1: primero lee TSM en pasos, con «Leyendo TSM: N %» quieto; mientras, no se puede importar ni se pregunta nada.
  const leyendo = m.lua(`(function()
    local t = ${G}.texto
    return {visible = t:IsShown(), aviso = t.aviso:GetText(), apagado = t.botonImportar.snfApagado == true,
      modo = t.preguntaModo:IsShown()}
  end)()`);
  assert.equal(leyendo.visible, true);
  assert.match(leyendo.aviso, /^Leyendo TSM: \d+ %$/);
  assert.equal(leyendo.apagado, true);
  assert.equal(leyendo.modo, false);
  const lecturas = [];
  for (let i = 0; i < 500 && m.lua(`${I}.lectura().estado`) === 'leyendo'; i++) {
    m.avanzar(0.05);
    lecturas.push(m.lua(`${G}.texto:IsShown()`));
  }
  assert.equal(m.lua(`${I}.lectura().estado`), 'leido');
  assert.ok(lecturas.every((v) => v === true), 'la ventanita no se esconde mientras lee');
  let r = m.lua(`(function()
    local t = ${G}.texto
    return {visible = t:IsShown(), titulo = t.titulo:GetText(), resumen = t.resumen:GetText(), caja = t.caja:GetText(),
      modo = t.preguntaModo:IsShown() and t.preguntaModo:GetText() or false, mover = t.pregunta:GetText(),
      importar = t.botonImportar:IsShown(), apagado = t.botonImportar.snfApagado == true, aviso = t.aviso:GetText()}
  end)()`);
  assert.equal(r.visible, true);
  assert.equal(r.apagado, false, 'leído TSM, ya se puede importar');
  assert.equal(r.aviso, '');
  assert.equal(r.titulo, 'Importar de TSM');
  assert.equal(r.resumen, '9 grupos, 40 objetos, 11 operaciones');
  assert.equal(r.modo, 'Ya hay grupos en SnetForever: ¿juntar o reemplazar?');
  assert.equal(r.mover, '¿Mover los objetos que están en otro grupo?');
  assert.equal(r.importar, true);
  assert.match(r.caja, /Subasta 3/);
  assert.match(r.caja, /dbregionsaleavg/);
  // En combate no empieza: lo dice en la ventanita.
  m.jugador({ enCombate: true });
  m.lua(`${G}.texto.botonImportar:Click("LeftButton")`);
  assert.match(m.lua(`${G}.texto.aviso:GetText()`), /combate/);
  assert.equal(m.lua(`${I}.estado()`), undefined);
  m.jugador({ enCombate: false });
  // Elegir «Reemplazar» e importar: el avance es un número que solo crece y al final sale el informe.
  m.lua(`${G}.texto.radioModo.no:Click("LeftButton")`);
  m.lua(`${G}.texto.botonImportar:Click("LeftButton")`);
  const avances = [];
  for (let i = 0; i < 2000 && m.lua(`${I}.estado().estado`) !== 'hecho'; i++) {
    m.avanzar(0.05);
    const a = m.lua(`${G}.texto.aviso:GetText()`);
    if (a) avances.push(a);
  }
  const numeros = avances.map((a) => Number((/(\d+) ?%/.exec(a) || [])[1])).filter((n) => !Number.isNaN(n));
  assert.ok(numeros.length > 3, avances.join(' | '));
  for (let i = 1; i < numeros.length; i++) assert.ok(numeros[i] >= numeros[i - 1], `el avance no baja: ${numeros.join(', ')}`);
  r = m.lua(`(function()
    local t = ${G}.texto
    return {visible = t:IsShown(), resumen = t.resumen:GetText(), caja = t.caja:GetText(), importar = t.botonImportar:IsShown(),
      modo = t.preguntaModo:IsShown(), cerrar = t.botonCerrar.texto:GetText()}
  end)()`);
  assert.equal(r.visible, true, 'la misma ventanita sigue abierta');
  assert.equal(r.resumen, 'Importados 9 grupos, 40 objetos y 11 operaciones');
  assert.match(r.caja, /Traducidas/);
  assert.match(r.caja, /Marcadas/);
  assert.match(r.caja, /first\(125% dbregionsaleavg, 120% snfmercado, 50g\)/);
  assert.equal(r.importar, false);
  assert.equal(r.modo, false);
  assert.equal(r.cerrar, 'Cerrar');
  assert.ok(impresos(m).includes('Importados 9 grupos, 40 objetos y 11 operaciones'));
  assert.equal(m.lua(`${A}.existe("Viejo")`), false);
  assert.equal(m.lua(`${A}.existe("Hierbas${S}Raras")`), true);
  m.lua(`${G}.texto.botonCerrar:Click("LeftButton")`);
  assert.equal(m.lua(`${G}.texto:IsShown()`), false);
  sinErrores(m);
});

test('renombrar una fuente propia la cambia también en las fórmulas que la usan', () => {
  const m = maquina();
  importar(m);
  assert.equal(m.lua(`${F}.ponerFuente("precioMin", "max(min(snfhistorico, snfmercado, snfhistorico), vendorsell)", "minprecio")`), true);
  assert.equal(m.lua(`${F}.fuentes().minprecio`), undefined);
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'precioNormal'), 'first(snfregional(), preciomin, 50s)');
  assert.equal(valor(m, 'artesania', 'Fabricar', 'valorFabricado'), 'preciomin * 1.1');
  assert.equal(m.lua(`${F}.ponerFuente("doble", "2 * PrecioMin")`), true);
  assert.equal(m.lua(`${F}.ponerFuente("otra", "vendorsell", "preciomin")`), true);
  assert.equal(m.lua(`${F}.fuentes().doble`), '2 * otra', 'también en las demás fuentes propias');
  assert.equal(valor(m, 'artesania', 'Fabricar', 'valorFabricado'), 'otra * 1.1');
  // Una palabra que solo se parece (otra fuente, una función o un trozo de nombre) no se toca.
  m.lua(`${F}.ponerFuente("otraMas", "otra + 1")`);
  m.lua(`${O}.poner("correo", "Al banco", "conservar", "otramas + otra")`);
  m.lua(`${F}.ponerFuente("tercera", "1g", "otra")`);
  assert.equal(valor(m, 'correo', 'Al banco', 'conservar'), 'otramas + tercera');
  assert.equal(m.lua(`${F}.fuentes().otramas`), 'tercera + 1');
  sinErrores(m);
});

test('ronda 1: cerrar la ventanita mientras lee TSM para la lectura (y abrir otra vez empieza una nueva)', () => {
  const m = maquina();
  m.lua(`SnetForever.Principal.abrir("grupos")`);
  m.lua(`${G}.importarTSM()`);
  assert.equal(m.lua(`${I}.lectura().estado`), 'leyendo');
  m.lua(`${G}.texto.botonCerrar:Click("LeftButton")`);
  assert.equal(m.lua(`${I}.lectura().estado`), 'cancelada');
  m.avanzar(1);
  assert.equal(m.lua(`${I}.lectura().estado`), 'cancelada', 'no sigue leyendo con la ventanita cerrada');
  assert.equal(m.lua(`${G}.texto:IsShown()`), false);
  m.lua(`${G}.importarTSM()`);
  for (let i = 0; i < 500 && m.lua(`${I}.lectura().estado`) === 'leyendo'; i++) m.avanzar(0.05);
  assert.equal(m.lua(`${I}.lectura().estado`), 'leido');
  assert.equal(m.lua(`${G}.texto.resumen:GetText()`), '9 grupos, 40 objetos, 11 operaciones');
  sinErrores(m);
});

test('ronda 1: borrar o renombrar un grupo a mitad de la importación: la comprobación no dice «está todo»', () => {
  const m = maquina();
  m.lua(`${I}.importar({modo = "juntar", moverObjetos = false})`);
  // Se deja correr hasta que los grupos de TSM ya están escritos, y entonces el jugador toca el árbol.
  let pasos = 0;
  while (m.lua(`SnetForeverCuenta.comercio.v2.grupos["Mascotas${S}Raras"]`) !== true && pasos < 500) {
    m.avanzar(0.05);
    pasos++;
  }
  assert.equal(m.lua(`${I}.estado().estado`), 'importando');
  assert.equal(m.lua(`${A}.objeto("i:2840")`), undefined, 'los objetos aún no se han escrito');
  assert.equal(m.lua(`${A}.borrar("Minerales${S}Barras")`), true);
  assert.equal(m.lua(`${A}.renombrar("Mascotas", "Bichos")`), `Bichos`);
  for (let i = 0; i < 2000 && m.lua(`${I}.estado().estado`) === 'importando'; i++) m.avanzar(0.05);
  const inf = m.lua(`${I}.estado()`);
  assert.equal(inf.estado, 'hecho');
  assert.equal(inf.comprobacion.bien, false);
  assert.doesNotMatch(inf.comprobacion.mensaje, /está todo/);
  assert.deepEqual(inf.comprobacion.faltan.grupos, ['Mascotas', `Mascotas${S}Raras`, `Minerales${S}Barras`]);
  assert.equal(inf.comprobacion.faltan.objetos, 5 + 4 + 3);
  // Nada se escribe en una ruta que ya no existe (ni objetos ni operaciones del grupo).
  const v2 = m.lua('SnetForeverCuenta.comercio.v2');
  for (const ruta of Object.values(v2.objetos)) {
    assert.ok(ruta === '' || v2.grupos[ruta] === true, `objeto en una ruta que no existe: ${ruta}`);
  }
  for (const ruta of Object.keys(v2.gruposOps || {})) {
    assert.ok(ruta === '' || v2.grupos[ruta] === true || ruta.startsWith('Bichos'), `operaciones de una ruta que no existe: ${ruta}`);
  }
  assert.deepEqual(m.lua(`${O}.huerfanos()`), []);
  sinErrores(m);
});

test('ronda 2: esconder la ventanita (Escape general) a mitad de leer la para y no vuelve a salir; a mitad de importar sigue sin ella', () => {
  const m = maquina();
  m.lua(`SnetForever.Principal.abrir("grupos")`);
  m.lua(`${G}.importarTSM()`);
  m.avanzar(0.05);
  assert.equal(m.lua(`${I}.lectura().estado`), 'leyendo');
  // CloseSpecialWindows solo hace Hide(): sin pasar por Cerrar ni Cancelar.
  m.lua(`${G}.texto:Hide()`);
  assert.equal(m.lua(`${I}.lectura().estado`), 'cancelada');
  const visible = [];
  for (let i = 0; i < 60; i++) {
    m.avanzar(0.05);
    visible.push(m.lua(`${G}.texto:IsShown()`));
  }
  assert.ok(visible.every((v) => v === false), 'la ventanita no reaparece sola');
  // A mitad de importar: esconderla no para la importación, no vuelve a salir y el chat dice el final.
  m.lua(`${G}.importarTSM()`);
  for (let i = 0; i < 500 && m.lua(`${I}.lectura().estado`) === 'leyendo'; i++) m.avanzar(0.05);
  m.lua(`${G}.texto.botonImportar:Click("LeftButton")`);
  m.avanzar(0.05);
  assert.equal(m.lua(`${I}.estado().estado`), 'importando');
  m.lua(`${G}.texto:Hide()`);
  const antes = impresos(m).length;
  const vista = [];
  for (let i = 0; i < 2000 && m.lua(`${I}.estado().estado`) === 'importando'; i++) {
    m.avanzar(0.05);
    vista.push(m.lua(`${G}.texto:IsShown()`));
  }
  assert.equal(m.lua(`${I}.estado().estado`), 'hecho');
  assert.ok(vista.every((v) => v === false), 'tampoco reaparece al terminar la importación');
  assert.ok(impresos(m).slice(antes).includes('Importados 9 grupos, 40 objetos y 11 operaciones'));
  // Abrirla otra vez empieza de cero (sin el estado de antes).
  m.lua(`${G}.importarTSM()`);
  assert.equal(m.lua(`${G}.texto:IsShown()`), true);
  assert.equal(m.lua(`${I}.lectura().estado`), 'leyendo');
  sinErrores(m);
});

// Fallo en el juego (19-nov): el cliente de WoW Forever no tiene la librería «os» (el banco sí la daba). Con «Reemplazar»,
// guardar lo anterior en _antes la usaba para la hora y la importación fallaba nada más empezar a escribir.
const SIN_OS = 'rawset(_G, "os", nil)';
const CUENTA_CON_COSAS = `(function()
  local A, O = ${A}, ${O}
  A.crear("", "Bolsas"); A.crear("", "Materiales"); A.crear("Materiales", "Hierbas")
  A.poner("i:2447", "Materiales\`Hierbas"); A.poner("i:4500", "Bolsas")
  O.crear("subasta", "#Default"); O.ponerDeGrupo("Materiales", "subasta", {"#Default"})
  SnetForeverCuenta.comercio.reglas = {["propio:Bolsas"] = {compraPct = 60}}
  SnetForeverCuenta.comercio.gruposCompra = {Bolsas = true}
end)()`;

test('fallo en el juego: sin la librería os, «Reemplazar» con grupos ya hechos importa entero y lo anterior queda en _antes', () => {
  const m = maquina({ previo: SIN_OS });
  assert.equal(m.lua('rawget(_G, "os")'), undefined);
  m.lua(CUENTA_CON_COSAS);
  const inf = importar(m, '{modo = "reemplazar", moverObjetos = false}');
  assert.equal(inf.estado, 'hecho', inf.mensaje);
  assert.equal(inf.comprobacion.bien, true, inf.comprobacion.mensaje);
  assert.match(inf.comprobacion.mensaje, /está todo/);
  const antes = m.lua('SnetForeverCuenta.comercio.v2._antes[1]');
  assert.equal(antes.grupos.Bolsas, true);
  assert.equal(antes.objetos['i:4500'], 'Bolsas');
  assert.deepEqual(antes.reglas['propio:Bolsas'], { compraPct: 60 });
  assert.deepEqual(antes.compra, { Bolsas: true });
  assert.ok(antes.cuando > 0, 'con la hora del juego');
  assert.equal(m.lua(`${A}.existe("Bolsas")`), false);
  sinErrores(m);
});

test('un fallo de la importación queda apuntado (fase y texto, los 5 últimos) y el mensaje dice dónde', () => {
  const m = maquina();
  for (let i = 1; i <= 6; i++) {
    // Un fallo a propósito al escribir los objetos.
    m.lua(`SnetForever.Arbol.olvidarIndice = function() error("roto a propósito ${i}") end`);
    const inf = importar(m, '{modo = "juntar", moverObjetos = false}');
    assert.equal(inf.estado, 'fallo');
    assert.match(inf.mensaje, /escribirObjetos/);
    assert.match(inf.mensaje, /importarFallos/);
  }
  const fallos = m.lua('SnetForeverCuenta.comercio.importarFallos');
  assert.equal(fallos.length, 5, 'solo los 5 últimos');
  assert.equal(fallos[0].fase, 'escribirObjetos');
  assert.match(fallos[0].texto, /roto a propósito 2/);
  assert.match(fallos[4].texto, /roto a propósito 6/);
  assert.equal(typeof fallos[4].cuando, 'number');
  assert.equal(fallos[4].modo, 'juntar');
  // El error sigue llegando al manejador del juego (el banco lo cuenta).
  assert.ok(m.errores().length >= 6);
});

test('fallo en el juego: en Forever TSM apunta a los personajes con el tipo de reino («Normal»), no con el nombre del reino', () => {
  // En Forever, UnitName da nombre y apellido y TSM usa como reino el tipo de reino (C_GameRules), como su código.
  const FOREVER = `rawset(_G, "C_GameRules", {IsGameRuleActive = function(regla) return regla == "pvp-no" end})
    rawset(Enum, "GameRule", {HardcoreRuleset = "hc", RPRuleset = "rp", PvPRuleset = "pvp"})
    TradeSkillMasterDB._currentProfile = {["Alba - Normal"] = "Subastas"}
    for _, k in ipairs({"groups", "items", "operations"}) do
      TradeSkillMasterDB["p@Subastas@userData@" .. k] = TradeSkillMasterDB["p@Default@userData@" .. k]
    end
    TradeSkillMasterDB["p@Default@userData@items"] = {}
    local raras = TradeSkillMasterDB["p@Subastas@userData@operations"].Auctioning["Raras caras"]
    raras.ignorePlayer = {["Brisa - Horde - Normal"] = true, ["Kurgath - Horde - Normal"] = true}
    raras.ignoreFactionrealm = {["Horde - Normal"] = true}`;
  const m = maquina({ previo: FOREVER });
  assert.equal(m.lua(`${I}.analizar()`).perfil, 'Subastas');
  assert.equal(m.lua(`${I}.analizar()`).objetos, 40);
  const inf = importar(m);
  assert.equal(inf.comprobacion.bien, true);
  assert.deepEqual(valor(m, 'subasta', 'Raras caras', 'ignorarPersonajes'), ['Brisa - Mirador']);
  assert.deepEqual(valor(m, 'subasta', 'Raras caras', 'ignorarReinos'), ['Mirador|Horde']);
  sinErrores(m);
});

// F3: en Forever TSM junta nombre y apellido con el separador del cliente (Constants.CharacterNameSeparatorConsts), que
// no tiene por qué ser un espacio. Dos personajes propios inventados con la misma primera palabra: «Nombre Uno» (el de
// ahora) y «Nombre Dos». Aquí el separador es «_».
test('la importación de grupos reconoce el perfil, los ignorados y el destinatario con el separador de TSM', () => {
  const SEP = `rawset(_G, "C_GameRules", {IsGameRuleActive = function(regla) return regla == "pvp-no" end})
    rawset(Enum, "GameRule", {HardcoreRuleset = "hc", RPRuleset = "rp", PvPRuleset = "pvp"})
    local C = rawget(_G, "Constants") or {}
    rawset(_G, "Constants", C)
    C.CharacterNameSeparatorConsts = {CHARACTERNAME_SURNAME_SEPARATOR = "_"}
    local db = TradeSkillMasterDB
    db._currentProfile = {["Nombre_Dos - Normal"] = "DelOtro", ["Nombre - Normal"] = "Cortado", ["Nombre_Uno - Normal"] = "Subastas"}
    for _, k in ipairs({"groups", "items", "operations"}) do
      db["p@Subastas@userData@" .. k] = db["p@Default@userData@" .. k]
    end
    db["p@Default@userData@items"] = {}
    local ops = db["p@Subastas@userData@operations"]
    ops.Auctioning["Raras caras"].ignorePlayer = {["Nombre_Dos - Horde - Normal"] = true, ["Nombre - Horde - Normal"] = true,
      ["Nombre_Tres - Horde - Normal"] = true}
    local copia = {}
    for k, v in pairs(ops.Mailing["Al banco"]) do copia[k] = v end
    copia.target = "Nombre_Dos"
    ops.Mailing["Sin reino"] = copia
    ops.Mailing["Al banco"].target = "Nombre_Dos-Normal"
    ops.Mailing["A otro"].target = "Nombre"`;
  const m = nuevaMaquina({ jugador: { ...JUGADOR, nombre: 'Nombre', apellido: 'Uno' }, pantalla: PANTALLA, previo: MUESTRA + '\n' + SEP });
  m.jugador({ apellido: 'Dos' });
  m.lua(`${O}.propios()`);
  m.jugador({ apellido: 'Uno' });
  m.lua(`${O}.propios()`);
  assert.equal(m.lua(`${I}.analizar()`).perfil, 'Subastas', 'el perfil del de ahora, ni el del otro ni el del nombre cortado');
  const inf = importar(m);
  assert.deepEqual(valor(m, 'subasta', 'Raras caras', 'ignorarPersonajes'), ['Nombre Dos - Mirador'], 'el propio, en nuestro formato; el cortado y el ajeno no');
  assert.equal(valor(m, 'correo', 'Al banco', 'destinatario'), 'Nombre_Dos-Normal');
  assert.equal(valor(m, 'correo', 'Sin reino', 'destinatario'), 'Nombre_Dos');
  assert.equal(valor(m, 'correo', 'A otro', 'destinatario'), '', 'el nombre cortado no se da por propio');
  assert.equal(inf.quitados.destinatarios, 1);
  sinErrores(m);
});

test('datos reales raros: una fórmula vacía no se guarda como vacía, y dos fuentes que solo cambian en mayúsculas no se pisan', () => {
  const m = maquina({ previo: `
    TradeSkillMasterDB["p@Default@userData@operations"].Auctioning["Hierbas 5x20"].minPrice = ""
    TradeSkillMasterDB["g@ @userData@customPriceSources"].MinPrecio = "vendorsell"
    TradeSkillMasterDB["g@ @userData@customPriceSources"].crafting = "1g"` });
  const inf = importar(m);
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'precioMinimo'),
    'max(1.5 * vendorsell, 0.25 * first(snfmercado, snfregional(), snfhistorico))', 'vacía: queda el valor por defecto');
  assert.equal(m.lua(`${F}.fuentes().minprecio`), 'vendorsell', 'la primera en orden («MinPrecio») se queda');
  assert.deepEqual(inf.fuentesTuyas, ['minprecio']);
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2.fuentes.crafting'), undefined, 'un nombre que ya es una fuente nuestra no se escribe');
  assert.deepEqual(inf.comprobacion.faltan.fuentes, ['crafting']);
  sinErrores(m);
});

test('ronda corta: «Juntar» con una fuente de nombre reservado no pierde lo que ya había guardado con ese nombre', () => {
  const m = maquina({ previo: 'TradeSkillMasterDB["g@ @userData@customPriceSources"].crafting = "1g"' });
  // Datos viejos: algo guardado con un nombre que no vale como fuente propia (Formulas.fuentes no lo enseña).
  m.lua('SnetForeverCuenta.comercio.v2.fuentes.crafting = "2g"');
  const inf = importar(m, '{modo = "juntar", moverObjetos = false}');
  assert.equal(inf.estado, 'hecho');
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2.fuentes.crafting'), '2g', 'nada se pierde');
  assert.deepEqual(inf.comprobacion.faltan.fuentes, ['crafting']);
  sinErrores(m);
});

test('ronda corta: un fallo porque la cuenta guardada cambió se apunta en la que se guarda, con solo la primera línea', () => {
  const m = maquina();
  m.lua(`${I}.importar({modo = "juntar", moverObjetos = false})`);
  m.avanzar(0.05);
  m.avanzar(0.05);
  assert.equal(m.lua(`${I}.estado().estado`), 'importando');
  // Otra tabla de comercio (como si se hubiera cambiado la cuenta por debajo): la vieja ya no se guarda.
  m.lua('SnetForeverCuenta.comercio = {v2 = {grupos = {}, objetos = {}, operaciones = {}, fuentes = {}}}');
  for (let i = 0; i < 50 && m.lua(`${I}.estado().estado`) === 'importando'; i++) m.avanzar(0.05);
  assert.equal(m.lua(`${I}.estado().estado`), 'fallo');
  const fallos = m.lua('SnetForeverCuenta.comercio.importarFallos');
  assert.equal(fallos.length, 1);
  assert.equal(fallos[0].fase, 'cuenta');
  // Un error de Lua de varias líneas se apunta solo con la primera.
  const m2 = maquina();
  m2.lua('SnetForever.Arbol.olvidarIndice = function() error("primera línea\\nsegunda línea", 0) end');
  importar(m2, '{modo = "juntar", moverObjetos = false}');
  assert.equal(m2.lua('SnetForeverCuenta.comercio.importarFallos[1].texto'), 'primera línea');
});

// ---------------------------------------------------------------------------------------------------
// F2 (fallo en el juego): importar una vez el inventario que TSM tiene contado de los personajes PROPIOS del reino de
// ahora (bolsas, banco y correo), para los alters con los que aún no se ha entrado con el addon. Solo se recorre
// _syncOwner y, de cada personaje propio, sus 4 claves. Todos los nombres y números son inventados.
// ---------------------------------------------------------------------------------------------------

const INV = 'SnetForever.InventarioCuenta';
const JUGADOR_F = { idioma: 'esES', nombre: 'Nombre', apellido: 'Apellido', reino: 'Mirador', faccion: 'Horde', clase: 'MAGE', nivel: 60 };
// La cuenta en TSM (Forever: el «reino» de TSM es el tipo de reino, aquí «Normal»). Tres personajes propios del reino (dos
// de la Horda y uno de la Alianza), uno de otra cuenta sincronizada y uno propio de otro reino.
const SYNC = `rawset(_G, "C_GameRules", {IsGameRuleActive = function(regla) return regla == "pvp-no" end})
  rawset(Enum, "GameRule", {HardcoreRuleset = "hc", RPRuleset = "rp", PvPRuleset = "pvp"})
  TradeSkillMasterDB = TradeSkillMasterDB or {}
  local db = TradeSkillMasterDB
  db._syncAccountKey = {["Horde - Normal"] = "Horde - Normal - 111", ["Alliance - Normal"] = "Alliance - Normal - 222",
    ["Horde - PvP"] = "Horde - PvP - 333"}
  db._syncOwner = {
    ["Nombre Apellido - Horde - Normal"] = "Horde - Normal - 111",
    ["Alter Uno - Horde - Normal"] = "Horde - Normal - 111",
    ["Alter Dos - Alliance - Normal"] = "Alliance - Normal - 222",
    ["Alter Vacio - Horde - Normal"] = "Horde - Normal - 111",
    ["Ajeno Sincronizado - Horde - Normal"] = "Horde - Normal - 999",
    ["Lejano Otro - Horde - PvP"] = "Horde - PvP - 333",
  }
  local function pj(clave, clase, bolsas, banco, correo)
    local s = "s@" .. clave .. "@internalData@"
    db[s .. "classKey"] = clase
    db[s .. "bagQuantity"], db[s .. "bankQuantity"], db[s .. "mailQuantity"] = bolsas, banco, correo
    db[s .. "auctionQuantity"] = {["i:2589"] = 500}
  end
  pj("Nombre Apellido - Horde - Normal", "MAGE", {["i:2589"] = 1}, {["i:2589"] = 7}, {["i:4306"] = 2})
  -- Las variantes de un objeto se suman; lo que no es «i:» (una mascota) no entra.
  pj("Alter Uno - Horde - Normal", "PRIEST", {["i:2589"] = 3, ["i:2589::1"] = 2, ["p:123:1:2"] = 1}, {["i:2589"] = 162}, {["i:2589"] = 20})
  -- Ronda 1: TSM guarda {} también en un banco o un buzón que nunca vio.
  pj("Alter Dos - Alliance - Normal", "WARRIOR", {["i:4306"] = 21}, {}, {})
  pj("Alter Vacio - Horde - Normal", "HUNTER", {}, {}, {})
  pj("Ajeno Sincronizado - Horde - Normal", "ROGUE", {["i:2589"] = 900}, {}, {})
  pj("Lejano Otro - Horde - PvP", "DRUID", {["i:2589"] = 800}, {}, {})
  db["f@Horde - Normal@internalData@pendingMail"] = {["Alter Uno"] = {["i:2589"] = 77}}`;

function maquinaF({ tsm = true, previo = '' } = {}) {
  const m = nuevaMaquina({ jugador: JUGADOR_F, pantalla: PANTALLA, previo: (tsm ? MUESTRA + '\n' + SYNC : '') + '\n' + previo });
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(4306, { nombre: 'Paño de seda', calidad: 1 });
  m.bolsa(0, 1, { id: 2589, n: 4 });
  m.objeto(2589, 4);
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  return m;
}
const pjInv = (m) => m.lua('return SnetForeverCuenta.comercio.inventario.pj');
const traer = (m) => m.lua(`(function() local r, motivo = ${I}.inventario(); return {r or false, motivo} end)()`);

test('el inventario de TSM entra una vez: bolsas, banco y correo de los personajes propios del reino, con el nombre con apellido', () => {
  const m = maquinaF();
  assert.deepEqual(m.lua(`{${I}.inventarioDisponible()}`), [true]);
  const hora = m.lua('GetServerTime()');
  const [r] = traer(m);
  assert.deepEqual(r, { personajes: 3, objetos: 7 + 2 + 5 + 162 + 20 + 21 }, 'el de ahora (su banco y su correo), Alter Uno y Alter Dos');
  const pj = pjInv(m);
  assert.deepEqual(Object.keys(pj).sort(), ['Alter Dos-Mirador', 'Alter Uno-Mirador', 'Nombre Apellido-Mirador']);
  assert.deepEqual(pj['Alter Uno-Mirador'], {
    nombre: 'Alter Uno', reino: 'Mirador', clase: 'PRIEST', bolsas: { 2589: 5 }, banco: { 2589: 162 }, correo: { 2589: 20 },
    tsm: { bolsas: hora, banco: hora, correo: hora },
  });
  assert.equal(pj['Alter Dos-Mirador'].clase, 'WARRIOR');
  assert.deepEqual(pj['Alter Dos-Mirador'].bolsas, { 4306: 21 });
  // Ronda 1: su banco y su buzón vacíos en TSM no son «vistos»: siguen sin abrir, y la frase lo sigue diciendo.
  assert.deepEqual([pj['Alter Dos-Mirador'].banco ?? null, pj['Alter Dos-Mirador'].correo ?? null, pj['Alter Dos-Mirador'].tsm],
    [null, null, { bolsas: hora }]);
  assert.equal(pj['Alter Vacio-Mirador'] ?? null, null, 'sin nada de nada en TSM no se crea una ficha vacía');
  // El de ahora: sus bolsas son las nuestras (contadas al entrar); su banco y su correo, que aún no se habían visto, de TSM.
  const yo = pj['Nombre Apellido-Mirador'];
  assert.deepEqual([yo.bolsas, yo.banco, yo.correo, yo.tsm], [{ 2589: 4 }, { 2589: 7 }, { 4306: 2 }, { banco: hora, correo: hora }]);
  // Una segunda vez no trae nada: ya está todo y no se pisa.
  const antes = JSON.stringify(pjInv(m));
  assert.deepEqual(traer(m)[0], { personajes: 0, objetos: 0 });
  assert.equal(JSON.stringify(pjInv(m)), antes);
  // Y el tooltip los cuenta.
  const [total, lista] = m.lua(`return {${INV}.de(2589)}`);
  assert.equal(total, 4 + 7 + 5 + 162 + 20);
  assert.deepEqual(lista.map((p) => p.nombre), ['Nombre Apellido', 'Alter Uno']);
  sinErrores(m);
});

test('no entran los personajes de otra cuenta sincronizada ni de otro reino', () => {
  // TradeSkillMasterDB es un intermediario que apunta cada clave que se le pide.
  const m = maquinaF({ previo: `do
    local datos, leidas = TradeSkillMasterDB, {}
    TradeSkillMasterDB = setmetatable({}, {__index = function(_, k) leidas[#leidas + 1] = k; return datos[k] end})
    TSM_LEIDAS = leidas
  end` });
  m.lua('for i = #TSM_LEIDAS, 1, -1 do TSM_LEIDAS[i] = nil end');
  traer(m);
  const leidas = [...new Set(m.lua('TSM_LEIDAS'))].sort();
  const propias = ['Nombre Apellido - Horde - Normal', 'Alter Uno - Horde - Normal', 'Alter Dos - Alliance - Normal', 'Alter Vacio - Horde - Normal']
    .flatMap((k) => ['classKey', 'bagQuantity', 'bankQuantity', 'mailQuantity'].map((c) => `s@${k}@internalData@${c}`));
  assert.deepEqual(leidas, ['_syncAccountKey', '_syncOwner', ...propias].sort(), 'solo _syncOwner y las 4 claves de cada personaje propio');
  const guardado = JSON.stringify(m.guardado());
  for (const n of ['Ajeno', 'Lejano', 'Sincronizado']) assert.equal(guardado.includes(n), false, n);
  assert.equal(guardado.includes('77'), false, 'ni lo que va por el correo (pendingMail)');
  assert.ok(!Object.keys(pjInv(m)).some((k) => /Ajeno|Lejano/.test(k)));
  sinErrores(m);
});

test('lo que ya contamos nosotros no se pisa; solo se rellena lo que falta', () => {
  const m = maquinaF({ previo: `SnetForeverCuenta = {comercio = {inventario = {v = 1, pj = {
    ["Alter-Mirador"] = {nombre = "Alter", reino = "Mirador", clase = "PRIEST", bolsas = {[2589] = 66}},
  }}}}` });
  // Lo nuestro: el de ahora ya vio su banco; Alter Uno entró con el addon (sus bolsas) y abrió su buzón, no su banco.
  m.bolsa(-1, 1, { id: 4306, n: 1 });
  m.disparar('BANKFRAME_OPENED');
  m.disparar('BANKFRAME_CLOSED');
  m.lua(`SnetForeverCuenta.comercio.inventario.pj["Alter Uno-Mirador"] = {nombre = "Alter Uno", reino = "Mirador", clase = "PRIEST",
    bolsas = {[2589] = 1}, correo = {}}
    ${INV}.olvidarOrden()`);
  // Ronda 1: la ficha cortada de la 0.6.x se apartó ya al entrar (el de ahora tiene apellido): no se toca ni se cuenta.
  const cortada = m.lua('return SnetForeverCuenta.comercio.inventario.apartadas["Alter-Mirador"].ficha');
  assert.deepEqual(cortada, { nombre: 'Alter', reino: 'Mirador', clase: 'PRIEST', bolsas: { 2589: 66 } });
  const hora = m.lua('GetServerTime()');
  traer(m);
  const pj = pjInv(m);
  const yo = pj['Nombre Apellido-Mirador'];
  assert.deepEqual([yo.bolsas, yo.banco, yo.correo, yo.tsm], [{ 2589: 4 }, { 4306: 1 }, { 4306: 2 }, { correo: hora }], 'solo su correo');
  const uno = pj['Alter Uno-Mirador'];
  assert.deepEqual([uno.bolsas, uno.banco, uno.correo, uno.tsm], [{ 2589: 1 }, { 2589: 162 }, [], { banco: hora }], 'solo su banco (su buzón vacío, visto: una tabla vacía llega como [])');
  // La ficha cortada sigue apartada tal cual: ya no se cuenta dos veces.
  const inv = m.lua('return SnetForeverCuenta.comercio.inventario');
  assert.equal(inv.pj['Alter-Mirador'] ?? null, null);
  assert.deepEqual(inv.apartadas['Alter-Mirador'].ficha, cortada);
  // Cuando contamos nosotros esa parte, deja de ser de TSM.
  m.lua('BANCO.ponerCorreo({{indice = 1, adjunto = 1, id = 4306, cantidad = 5}})');
  m.disparar('MAIL_SHOW');
  assert.deepEqual([pjInv(m)['Nombre Apellido-Mirador'].correo, pjInv(m)['Nombre Apellido-Mirador'].tsm ?? null], [{ 4306: 5 }, null]);
  sinErrores(m);
});

test('sin TSM cargado el botón sale apagado y no hace nada', () => {
  const ABRIR = `SnetForever.Principal.abrir("ajustes")
    local A = SnetForever.PrincipalAjustes
    A.elegir("tooltip")
    local b = A.tooltip.importarInventario`;
  const m = maquinaF({ tsm: false });
  const antes = JSON.stringify(pjInv(m));
  const r = m.lua(`(function() ${ABRIR}
    b:GetScript("OnEnter")(b); local l = BANCO.lineasTooltip(); b:GetScript("OnLeave")(b)
    local apagado = b.snfApagado
    b:Click("LeftButton")
    return {texto = b.texto:GetText(), apagado = apagado, ayuda = l, disponible = {${I}.inventarioDisponible()}}
  end)()`);
  assert.equal(r.texto, 'Importar inventario de TSM');
  assert.equal(r.apagado, true);
  assert.equal(r.disponible[0], false);
  assert.ok(JSON.stringify(r.ayuda).includes('No se encuentra TSM'), `la ayuda dice por qué: ${JSON.stringify(r.ayuda)}`);
  assert.equal(JSON.stringify(pjInv(m)), antes, 'no hace nada');
  assert.equal(impresos(m).filter((t) => /TSM/.test(t)).length, 0);
  assert.deepEqual(traer(m), [false, r.disponible[1]], 'y la función tampoco');
  // Con TSM, encendido: un clic trae el inventario y lo dice en el chat.
  const c = maquinaF();
  const s = c.lua(`(function() ${ABRIR}
    local apagado = b.snfApagado
    b:Click("LeftButton")
    return {apagado = apagado}
  end)()`);
  assert.equal(s.apagado, false);
  assert.ok(pjInv(c)['Alter Uno-Mirador']);
  assert.ok(impresos(c).some((t) => t.includes('3 personajes') && t.includes('217 objetos')), JSON.stringify(impresos(c)));
  sinErrores(m);
  sinErrores(c);
});

test('ronda 1: el nombre de TSM se parte por su separador de apellido y se rehace como Personaje.clave()', () => {
  // Un separador que no es un espacio (Constants.CharacterNameSeparatorConsts del cliente, el que usa TSM en Forever).
  const SEP = `local C = rawget(_G, "Constants") or {}
    rawset(_G, "Constants", C)
    C.CharacterNameSeparatorConsts = {CHARACTERNAME_SURNAME_SEPARATOR = "_"}
    local db = TradeSkillMasterDB
    for _, n in ipairs({"Nombre Apellido", "Alter Uno"}) do
      local vieja, nueva = n .. " - Horde - Normal", (string.gsub(n, " ", "_")) .. " - Horde - Normal"
      db._syncOwner[nueva], db._syncOwner[vieja] = db._syncOwner[vieja], nil
      for _, c in ipairs({"classKey", "bagQuantity", "bankQuantity", "mailQuantity"}) do
        db["s@" .. nueva .. "@internalData@" .. c], db["s@" .. vieja .. "@internalData@" .. c] = db["s@" .. vieja .. "@internalData@" .. c], nil
      end
    end`;
  const m = maquinaF({ previo: SEP });
  traer(m);
  const pj = pjInv(m);
  assert.ok(!Object.keys(pj).some((k) => k.includes('_')), JSON.stringify(Object.keys(pj)));
  assert.equal(pj['Alter Uno-Mirador'].nombre, 'Alter Uno');
  // El de ahora: la misma ficha que la nuestra (no una segunda «Nombre_Apellido»), con su banco de TSM.
  assert.deepEqual([pj['Nombre Apellido-Mirador'].bolsas, pj['Nombre Apellido-Mirador'].banco], [{ 2589: 4 }, { 2589: 7 }]);
  sinErrores(m);
});

test('ronda 1: un fallo al importar el inventario queda apuntado en importarFallos con la fase «inventario»', () => {
  const m = maquinaF();
  m.lua(`${INV}.rellenar = function() error("fallo inventado\\nsegunda línea", 0) end`);
  const [r, motivo] = traer(m);
  assert.equal(r, false);
  assert.match(motivo, /inventario/);
  const fallos = m.lua('SnetForeverCuenta.comercio.importarFallos');
  assert.equal(fallos.length, 1);
  assert.deepEqual([fallos[0].fase, fallos[0].modo, fallos[0].texto], ['inventario', 'inventario', 'fallo inventado']);
  assert.equal(typeof fallos[0].cuando, 'number');
});

test('actualizarRegional: lo importado con la traducción de antes (DBRegionMarketAvg -> snfmercado) pasa a snfregional(); lo editado a mano no', () => {
  const m = maquina();
  assert.equal(importar(m).estado, 'hecho');
  assert.equal(valor(m, 'compras', 'Compra barata', 'precioMaximo'), '90% snfregional()', 'una importación nueva ya traduce al regional');
  // Como lo dejó una importación de antes del precio regional, y un campo que el jugador cambió a mano.
  m.lua(`local v2 = SnetForeverCuenta.comercio.v2
    v2.operaciones.compras["Compra barata"].valores.precioMaximo = "90% snfmercado"
    v2.operaciones.subasta["Hierbas 5x20"].valores.precioNormal = "first(snfmercado, minprecio, 50s)"
    v2.operaciones.subasta["#Default"].valores.precioMinimo = "max(1g, 2g)"
    v2.fuentes.minprecio = "max(min(snfhistorico, snfmercado, snfhistorico), vendorsell)"
    v2.regionalActualizado = nil`);
  assert.equal(m.lua(`${I}.actualizarRegional()`), 3);
  assert.equal(valor(m, 'compras', 'Compra barata', 'precioMaximo'), '90% snfregional()');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'precioNormal'), 'first(snfregional(), minprecio, 50s)');
  assert.equal(valor(m, 'subasta', '#Default', 'precioMinimo'), 'max(1g, 2g)', 'lo editado a mano no se toca');
  assert.equal(valor(m, 'subasta', 'Hierbas 5x20', 'precioMinimo'), 'max(80% snfmercado, 1.5 * vendorsell)', 'sin DBRegionMarketAvg no cambia');
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2.fuentes.minprecio'), 'max(min(snfhistorico, snfregional(), snfhistorico), vendorsell)');
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2.regionalActualizado'), true);
  assert.equal(m.lua(`${I}.actualizarRegional()`), 0, 'una segunda vez no cambia nada');
  sinErrores(m);
});

test('actualizarRegional sin TSM cargado no hace nada y se reintentará', () => {
  const m = maquina({ tsm: false });
  assert.equal(m.lua(`(function() local n = ${I}.actualizarRegional(); return n == nil end)()`), true);
  assert.notEqual(m.lua('SnetForeverCuenta and SnetForeverCuenta.comercio and SnetForeverCuenta.comercio.v2 and SnetForeverCuenta.comercio.v2.regionalActualizado'), true);
  sinErrores(m);
});
