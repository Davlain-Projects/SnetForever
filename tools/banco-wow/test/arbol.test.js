// Comercio, ventana principal, tarea 11: el árbol de grupos y objetos (rutas como TSM, un objeto en un solo grupo),
// su guardado en SnetForeverCuenta.comercio.v2 y la migración de los grupos planos de la 0.6.2.
import assert from 'node:assert/strict';
import { test as testNucleo } from 'node:test';
import { createRequire } from 'node:module';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const A = 'SnetForever.Arbol';
const G = 'SnetForever.Grupos';
const S = '`'; // el separador de los niveles de una ruta, igual que en TSM
const q = (t) => JSON.stringify(t);

test('crear, renombrar (con hijos y objetos) y borrar (el grupo y sus subgrupos van a la papelera; sus objetos vuelven al grupo Base, como en TSM)', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua(`${A}.crear("", "Hierbas")`), 'Hierbas');
  assert.equal(m.lua(`${A}.crear("Hierbas", "Raras")`), `Hierbas${S}Raras`);
  assert.equal(m.lua(`${A}.poner("i:1", "Hierbas")`), true);
  assert.equal(m.lua(`${A}.poner("i:2", ${q(`Hierbas${S}Raras`)})`), true);
  // Rechazos: padre que no existe, nombre vacío, con el separador, repetido entre hermanos.
  assert.equal(m.lua(`${A}.crear("NoExiste", "x")`), undefined);
  assert.equal(m.lua(`${A}.crear("", "")`), undefined);
  assert.equal(m.lua(`${A}.crear("", "   ")`), undefined);
  assert.equal(m.lua(`${A}.crear("", ${q(`a${S}b`)})`), undefined, 'TSM no admite el separador en un nombre');
  assert.equal(m.lua(`${A}.crear("", "Hierbas")`), undefined, 'hermano con el mismo nombre');
  assert.equal(m.lua(`${A}.crear("Hierbas", "Hierbas")`), `Hierbas${S}Hierbas`, 'el mismo nombre en otro nivel sí vale');
  m.lua(`${A}.borrar(${q(`Hierbas${S}Hierbas`)})`);
  m.lua('SnetForeverCuenta.comercio.v2._papelera = nil');

  assert.deepEqual(m.lua(`${A}.grupos()`), {
    Hierbas: { nombre: 'Hierbas', nivel: 1, padre: '' },
    [`Hierbas${S}Raras`]: { nombre: 'Raras', nivel: 2, padre: 'Hierbas' },
  });
  // Renombrar mueve los hijos y los objetos.
  assert.equal(m.lua(`${A}.renombrar("Hierbas", "Plantas")`), 'Plantas');
  assert.deepEqual(m.lua(`${A}.hijos("")`), ['Plantas']);
  assert.deepEqual(m.lua(`${A}.hijos("Plantas")`), [`Plantas${S}Raras`]);
  assert.equal(m.lua(`${A}.objeto("i:1")`), 'Plantas');
  assert.equal(m.lua(`${A}.objeto("i:2")`), `Plantas${S}Raras`);
  assert.deepEqual(m.lua(`${A}.objetos("Plantas")`), ['i:1']);
  assert.equal(m.lua(`${A}.renombrar("Plantas", "")`), undefined);
  assert.equal(m.lua(`${A}.renombrar("Plantas", ${q(`x${S}y`)})`), undefined);
  assert.equal(m.lua(`${A}.renombrar("NoExiste", "x")`), undefined);
  assert.equal(m.lua(`${A}.renombrar("Plantas", "Plantas")`), 'Plantas', 'el mismo nombre no choca consigo mismo');

  // Borrar: como en TSM, el grupo y sus subgrupos se van y sus objetos quedan sin grupo (en el Base); nada se pierde.
  assert.equal(m.lua(`${A}.borrar("Plantas")`), true);
  assert.equal(m.lua(`next(${A}.grupos()) == nil`), true);
  assert.equal(m.lua(`${A}.objeto("i:1")`), '');
  assert.equal(m.lua(`${A}.objeto("i:2")`), '');
  assert.deepEqual(m.lua(`${A}.objetos("")`), ['i:1', 'i:2']);
  assert.equal(m.lua(`${A}.contar("")`), 2);
  assert.equal(m.lua(`${A}.contar()`), 2, 'siguen contando');
  assert.equal(m.lua(`#SnetForeverCuenta.comercio.v2._papelera`), 1);
  assert.deepEqual(m.lua(`${A}.papelera()`), [{ ruta: 'Plantas', nombre: 'Plantas' }]);
  assert.equal(m.lua(`${A}.borrar("Plantas")`), false);
  // Recuperar lo devuelve todo.
  assert.equal(m.lua(`${A}.recuperar("Plantas")`), true);
  assert.equal(m.lua(`${A}.objeto("i:2")`), `Plantas${S}Raras`);
  assert.equal(m.lua(`${A}.objeto("i:1")`), 'Plantas');
  assert.deepEqual(m.lua(`${A}.hijos("Plantas")`), [`Plantas${S}Raras`]);
  assert.equal(m.lua(`#SnetForeverCuenta.comercio.v2._papelera`), 0);
  assert.equal(m.lua(`${A}.recuperar("Plantas")`), false);
  sinErrores(m);
});

test('mover un grupo dentro de otro cambia su ruta y la de sus hijos', () => {
  const m = nuevaMaquina();
  m.lua(`${A}.crear("", "A")`);
  m.lua(`${A}.crear("A", "B")`);
  m.lua(`${A}.crear(${q(`A${S}B`)}, "C")`);
  m.lua(`${A}.crear("", "D")`);
  m.lua(`${A}.poner("i:7", ${q(`A${S}B${S}C`)})`);
  m.lua(`${A}.poner("i:8", ${q(`A${S}B`)})`);
  assert.equal(m.lua(`${A}.mover(${q(`A${S}B`)}, "D")`), `D${S}B`);
  assert.deepEqual(m.lua(`${A}.hijos("D")`), [`D${S}B`]);
  assert.deepEqual(m.lua(`${A}.hijos(${q(`D${S}B`)})`), [`D${S}B${S}C`]);
  assert.deepEqual(m.lua(`${A}.hijos("A")`), []);
  assert.equal(m.lua(`${A}.objeto("i:7")`), `D${S}B${S}C`);
  assert.equal(m.lua(`${A}.objeto("i:8")`), `D${S}B`);
  assert.deepEqual(m.lua(`${A}.objetos(${q(`D${S}B${S}C`)})`), ['i:7']);
  assert.deepEqual(m.lua(`${A}.objetos(${q(`A${S}B`)})`), []);
  assert.equal(m.lua(`${A}.grupos()[${q(`D${S}B${S}C`)}].nivel`), 3);
  assert.equal(m.lua(`${A}.grupos()[${q(`D${S}B${S}C`)}].padre`), `D${S}B`);
  // No se puede mover dentro de sí mismo ni de un descendiente, ni a un padre que no existe, ni chocar con un hermano.
  assert.equal(m.lua(`${A}.mover("D", ${q(`D${S}B`)})`), undefined);
  assert.equal(m.lua(`${A}.mover("D", "D")`), undefined);
  assert.equal(m.lua(`${A}.mover("D", "NoExiste")`), undefined);
  assert.equal(m.lua(`${A}.mover("NoExiste", "A")`), undefined);
  m.lua(`${A}.crear("A", "B")`);
  assert.equal(m.lua(`${A}.mover(${q(`D${S}B`)}, "A")`), undefined, 'ya hay un B dentro de A');
  // Al grupo Base («»), a primer nivel.
  assert.equal(m.lua(`${A}.mover(${q(`D${S}B`)}, "")`), 'B');
  assert.equal(m.lua(`${A}.objeto("i:7")`), `B${S}C`);
  assert.deepEqual(m.lua(`${A}.hijos("")`), ['A', 'B', 'D']);
  sinErrores(m);
});

test('un objeto está en un solo grupo: ponerlo en otro lo saca del anterior', () => {
  const m = nuevaMaquina();
  m.lua(`${A}.crear("", "A")`);
  m.lua(`${A}.crear("", "B")`);
  assert.equal(m.lua(`${A}.objeto("i:5")`), undefined, 'sin apuntar no está en ningún sitio');
  m.lua(`${A}.poner("i:5", "A")`);
  m.lua(`${A}.poner("i:6", "A")`);
  assert.deepEqual(m.lua(`${A}.objetos("A")`), ['i:5', 'i:6']);
  m.lua(`${A}.poner("i:5", "B")`);
  assert.deepEqual(m.lua(`${A}.objetos("A")`), ['i:6']);
  assert.deepEqual(m.lua(`${A}.objetos("B")`), ['i:5']);
  assert.equal(m.lua(`${A}.objeto("i:5")`), 'B');
  // Guardado: un texto por objeto, sin tablas.
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2.objetos["i:5"]`), 'B');
  // nil lo devuelve al grupo Base («»).
  m.lua(`${A}.poner("i:5", nil)`);
  assert.equal(m.lua(`${A}.objeto("i:5")`), '');
  assert.deepEqual(m.lua(`${A}.objetos("")`), ['i:5']);
  assert.deepEqual(m.lua(`${A}.objetos("B")`), []);
  // A un grupo que no existe no se pone, y el objeto no se mueve.
  assert.equal(m.lua(`${A}.poner("i:6", "NoExiste")`), false);
  assert.equal(m.lua(`${A}.objeto("i:6")`), 'A');
  assert.equal(m.lua(`${A}.poner(nil, "A")`), false);
  assert.equal(m.lua(`${A}.poner("", "A")`), false);
  // Quitarlo del todo.
  assert.equal(m.lua(`${A}.quitar("i:6")`), true);
  assert.equal(m.lua(`${A}.quitar("i:6")`), false);
  assert.equal(m.lua(`${A}.objeto("i:6")`), undefined);
  sinErrores(m);
});

test('nombres con acento grave, barras, tildes, |c…|r y 200 letras no rompen las rutas', () => {
  const m = nuevaMaquina();
  // Con acento grave en el nombre no se crea, pero una ruta importada de TSM («A`B») sí se entiende tal cual.
  m.lua(`SnetForeverCuenta.comercio.v2.grupos[${q(`Importado${S}Hijo${S}Nieto`)}] = true`);
  assert.deepEqual(m.lua(`${A}.hijos("")`), ['Importado']);
  assert.deepEqual(m.lua(`${A}.hijos("Importado")`), [`Importado${S}Hijo`], 'los padres que faltan se dan por existentes');
  assert.equal(m.lua(`${A}.grupos()[${q(`Importado${S}Hijo${S}Nieto`)}].nivel`), 3);
  m.lua(`${A}.poner("i:1", ${q(`Importado${S}Hijo${S}Nieto`)})`);
  assert.equal(m.lua(`${A}.renombrar("Importado", "Traído")`), 'Traído');
  assert.equal(m.lua(`${A}.objeto("i:1")`), `Traído${S}Hijo${S}Nieto`);
  assert.equal(m.lua(`${A}.mover(${q(`Traído${S}Hijo`)}, "")`), 'Hijo');
  assert.equal(m.lua(`${A}.objeto("i:1")`), `Hijo${S}Nieto`);

  // Rutas mal formadas importadas («A${S}${S}B», «C${S}»): se dejan como están y no cuentan como grupos ni como padres.
  m.lua(`SnetForeverCuenta.comercio.v2.grupos[${q(`A${S}${S}B`)}] = true; SnetForeverCuenta.comercio.v2.grupos[${q(`C${S}`)}] = true`);
  assert.equal(m.lua(`${A}.existe("A")`), false);
  assert.equal(m.lua(`${A}.existe("C")`), false);
  assert.equal(m.lua(`${A}.borrar("A")`), false);
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2._papelera`), undefined, 'no se tira una entrada vacía a la papelera');
  assert.equal(m.lua(`${A}.crear("", "A")`), 'A');
  assert.equal(m.lua(`${A}.crear("", "C")`), 'C');
  assert.equal(m.lua(`${A}.crear("", "_roto")`), undefined, '«_roto» es el cajón de lo estropeado');
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2.grupos[${q(`A${S}${S}B`)}]`), true, 'lo importado no se toca');

  const raros = ['a|cff00ff00verde|r', 'barra/inclinada\\invertida', 'ñandú · tilde é', 'a%b(c)[d]-e+f*g?h.i^j$', 'x'.repeat(200)];
  for (const nombre of raros) {
    assert.equal(m.lua(`${A}.crear("", ${q(nombre)})`), nombre, nombre.slice(0, 20));
    assert.equal(m.lua(`${A}.crear(${q(nombre)}, ${q(nombre)})`), `${nombre}${S}${nombre}`);
    m.lua(`${A}.poner(${q('i:' + nombre.length)}, ${q(`${nombre}${S}${nombre}`)})`);
  }
  assert.equal(m.lua(`#${A}.hijos("")`), raros.length + 4); // los cinco, «Traído», «Hijo», «A» y «C»
  // Renombrar y mover el padre con patrones raros no confunde a los demás.
  const nuevo = 'z|r%1';
  assert.equal(m.lua(`${A}.renombrar(${q(raros[3])}, ${q(nuevo)})`), nuevo);
  assert.equal(m.lua(`${A}.objeto(${q('i:' + raros[3].length)})`), `${nuevo}${S}${raros[3]}`);
  assert.equal(m.lua(`${A}.mover(${q(raros[1])}, ${q(raros[4])})`), `${raros[4]}${S}${raros[1]}`);
  assert.equal(m.lua(`${A}.objeto(${q('i:' + raros[1].length)})`), `${raros[4]}${S}${raros[1]}${S}${raros[1]}`);
  assert.equal(m.lua(`#${A}.objetos(${q(raros[0] + S + raros[0])})`), 1);
  assert.equal(m.lua(`${A}.crear("", ${q('é'.repeat(200))})`), 'é'.repeat(200), 'los nombres no se recortan');
  sinErrores(m);
});

test('claves i:1234::x, p:… y desconocidas se guardan y se cuentan; idDe las entiende', () => {
  let m = nuevaMaquina();
  m.lua(`${A}.crear("", "Mixto")`);
  const claves = ['i:1234', 'i:1234::i4:9', 'p:1234:100:3', 'raro:cosa', 'i:77::x'];
  for (const c of claves) assert.equal(m.lua(`${A}.poner(${q(c)}, "Mixto")`), true, c);
  for (const c of claves) assert.equal(m.lua(`${A}.objeto(${q(c)})`), 'Mixto', c);
  assert.deepEqual(m.lua(`${A}.objetos("Mixto")`), [...claves].sort());
  assert.equal(m.lua(`${A}.contar("Mixto")`), 5);
  assert.equal(m.lua(`${A}.contar()`), 5);
  assert.equal(m.lua(`${A}.contar("")`), 0);
  assert.equal(m.lua(`${A}.idDe("i:1234")`), 1234);
  assert.equal(m.lua(`${A}.idDe("i:1234::i4:9")`), 1234);
  assert.equal(m.lua(`${A}.idDe("i:77::x")`), 77);
  assert.equal(m.lua(`${A}.idDe("p:1234:100:3")`), undefined);
  assert.equal(m.lua(`${A}.idDe("raro:cosa")`), undefined);
  assert.equal(m.lua(`${A}.idDe("i:abc")`), undefined);
  assert.equal(m.lua(`${A}.idDe("i:0")`), undefined);
  assert.equal(m.lua(`${A}.idDe("")`), undefined);
  assert.equal(m.lua(`${A}.idDe(nil)`), undefined);
  assert.equal(m.lua(`${A}.idDe(55)`), 55, 'un número suelto es un objeto');
  // Tal cual se guardan (sin tocarlas) y sobreviven a recargar.
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2.objetos["i:1234::i4:9"]`), 'Mixto');
  m = m.recargar();
  assert.equal(m.lua(`${A}.contar("Mixto")`), 5);
  sinErrores(m);
});

const VIEJOS = {
  esquema: 1,
  comercio: {
    grupos: [
      { clave: 'propio:1', nombre: 'Telas', objetos: [2589, 2592] },
      { clave: 'propio:2', nombre: 'Hierbas', objetos: [2589, 2447] },
      { clave: 'propio:3', nombre: 'Telas', objetos: [] },
      { clave: 'propio:5', nombre: `Con${S}raro`, objetos: [4306] },
    ],
    papelera: [{ clave: 'propio:4', nombre: 'Viejo', objetos: [111] }],
    reglas: { 'propio:1': { compraPct: 70 }, 'propio:4': { compraPct: 60 } },
  },
};

test('migración de grupos de la 0.6.2: pasan a primer nivel y la lista vieja queda en _v1grupos', () => {
  let m = nuevaMaquina({ guardado: { SnetForeverCuenta: VIEJOS } });
  assert.deepEqual(m.lua(`${A}.hijos("")`), ["Con'raro", 'Hierbas', 'Telas', 'Telas 2']);
  for (const g of m.lua(`${A}.hijos("")`)) assert.equal(m.lua(`${A}.grupos()[${q(g)}].nivel`), 1);
  // Un objeto que estaba en dos grupos se queda en el primero de la lista vieja.
  assert.equal(m.lua(`${A}.objeto("i:2589")`), 'Telas');
  assert.equal(m.lua(`${A}.objeto("i:2592")`), 'Telas');
  assert.equal(m.lua(`${A}.objeto("i:2447")`), 'Hierbas');
  assert.equal(m.lua(`${A}.objeto("i:4306")`), "Con'raro");
  assert.equal(m.lua(`${A}.contar()`), 4);
  // La lista vieja entera se queda aparte; la papelera vieja pasa a la nueva y también se guarda tal cual.
  assert.equal(m.lua(`#SnetForeverCuenta.comercio._v1grupos`), 4);
  assert.equal(m.lua(`SnetForeverCuenta.comercio._v1grupos[2].objetos[1]`), 2589);
  assert.equal(m.lua(`#SnetForeverCuenta.comercio.grupos`), 0);
  assert.equal(m.lua(`#SnetForeverCuenta.comercio._v1papelera`), 1);
  assert.equal(m.lua(`#SnetForeverCuenta.comercio.v2._papelera`), 1);
  assert.deepEqual(m.lua(`${A}.papelera()`), [{ ruta: 'Viejo', nombre: 'Viejo' }]);
  // Las reglas que colgaban de la clave vieja siguen valiendo para el grupo migrado.
  assert.equal(m.lua(`SnetForever.Reglas.de("propio:Telas").compraPct`), 70);
  assert.equal(m.lua(`${A}.recuperar("Viejo")`), true);
  assert.equal(m.lua(`SnetForever.Reglas.de("propio:Viejo").compraPct`), 60, 'su regla vuelve con él');
  assert.equal(m.lua(`${A}.objeto("i:111")`), 'Viejo');
  // Una sola vez: tras recargar no cambia nada ni se vuelve a migrar.
  m.lua(`${A}.crear("", "Nuevo")`);
  m = m.recargar();
  assert.equal(m.lua(`#SnetForeverCuenta.comercio._v1grupos`), 4);
  assert.deepEqual(m.lua(`${A}.hijos("")`), ["Con'raro", 'Hierbas', 'Nuevo', 'Telas', 'Telas 2', 'Viejo']);
  assert.equal(m.lua(`${A}.contar()`), 5);
  sinErrores(m);
});

test('migración: sin nada que migrar no se escribe nada y la cuenta queda como la plantilla', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua(`#${G}.lista()`), 0);
  assert.equal(m.lua(`SnetForeverCuenta.comercio._v1grupos`), undefined);
  assert.equal(m.lua(`SnetForeverCuenta.comercio._v1papelera`), undefined);
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2._papelera`), undefined);
  sinErrores(m);
});

testNucleo('migración: con solo el núcleo no se migra ni se rompe nada', () => {
  const m = nuevaMaquina({ sinComercio: true, guardado: { SnetForeverCuenta: VIEJOS } });
  assert.equal(m.lua(`#SnetForeverCuenta.comercio.grupos`), 4);
  assert.equal(m.lua(`SnetForeverCuenta.comercio._v1grupos`), undefined);
  assert.equal(m.lua(`next(SnetForeverCuenta.comercio.v2.grupos) == nil`), true);
  assert.equal(m.lua(`type(SnetForever.Arbol)`), 'nil');
  sinErrores(m);
});

test('Grupos.lista() sigue dando los grupos (para la ventana de la subasta y la IA)', () => {
  const m = nuevaMaquina();
  m.lua(`SNF_PRECIOS = {v = 1, seq = 1, generado = 1, casas = {}, completo = true, grupos = {
    {clave = "rapido", nombre = {es = "Se vende rápido", en = "Sells fast"}, tipo = "calculado", objetos = {2589}}}}`);
  const clave = m.lua(`${G}.crear("  Mis telas ")`);
  assert.equal(clave, 'propio:Mis telas');
  assert.equal(m.lua(`${G}.anadir(${q(clave)}, 2592)`), true);
  assert.equal(m.lua(`${G}.anadir(${q(clave)}, 2589)`), true);
  assert.equal(m.lua(`${G}.anadir(${q(clave)}, 2589)`), true, 'repetido no falla');
  assert.equal(m.lua(`${G}.anadir(${q(clave)}, 0)`), false);
  assert.equal(m.lua(`${G}.anadir("rapido", 5)`), false);
  assert.equal(m.lua(`${A}.objeto("i:2589")`), 'Mis telas', 'el número del objeto se guarda como i:<id>');
  // Un subgrupo hecho con el árbol sale en la lista, con su nombre completo.
  m.lua(`${A}.crear("Mis telas", "Finas")`);
  m.lua(`${A}.poner("i:2996::x", ${q(`Mis telas${S}Finas`)})`);
  const lista = m.lua(`${G}.lista()`);
  assert.deepEqual(lista.map((g) => [g.clave, g.nombre, g.tipo]), [
    ['propio:Mis telas', 'Mis telas', 'propio'],
    [`propio:Mis telas${S}Finas`, 'Mis telas › Finas', 'propio'],
    ['rapido', 'Se vende rápido', 'calculado'],
  ]);
  assert.deepEqual(lista[0].objetos, [2589, 2592]);
  assert.deepEqual(lista[1].objetos, [2996], 'solo el número del objeto, aunque la clave traiga más');
  assert.equal(m.lua(`${G}.renombrar(${q(clave)}, "Telas")`), true);
  assert.equal(m.lua(`${G}.lista()[2].clave`), `propio:Telas${S}Finas`);
  assert.equal(m.lua(`${G}.quitar("propio:Telas", 2592)`), true);
  assert.equal(m.lua(`${G}.quitar("propio:Telas", 2592)`), false);
  sinErrores(m);
});

// ---- Aguante: 11.630 objetos y 353 grupos (datos inventados) ----

const N_OBJETOS = 11630;
const N_GRUPOS = 353;

// 353 grupos en tres niveles: 30 de primer nivel, 3 hijos de cada uno (90) y 233 nietos repartidos entre ellos.
function datosSinteticos() {
  const grupos = {};
  const primeros = [];
  for (let i = 1; i <= 30; i++) {
    primeros.push(`Grupo ${i}`);
    grupos[`Grupo ${i}`] = true;
  }
  const segundos = [];
  for (const p of primeros) {
    for (let j = 1; j <= 3; j++) {
      segundos.push(`${p}${S}Sub ${j}`);
      grupos[`${p}${S}Sub ${j}`] = true;
    }
  }
  for (let k = 0; k < 233; k++) grupos[`${segundos[k % segundos.length]}${S}Fino ${k}`] = true;
  const rutas = Object.keys(grupos);
  assert.equal(rutas.length, N_GRUPOS);
  const objetos = {};
  for (let n = 1; n <= N_OBJETOS; n++) objetos[`i:${10000 + n}${n % 7 === 0 ? '::x' : ''}`] = rutas[n % rutas.length];
  return { grupos, objetos, rutas };
}

const cuentaCon = (v2) => ({ esquema: 1, comercio: { v2: { grupos: v2.grupos, objetos: v2.objetos } } });

// Cuántas tablas crea Lua mientras corre fn (llamadas a luaH_new de fengari).
function contarTablas(fn) {
  const ltable = createRequire(import.meta.url)('fengari/src/ltable.js');
  const original = ltable.luaH_new;
  let n = 0;
  ltable.luaH_new = (L) => {
    n++;
    return original(L);
  };
  try {
    fn();
  } finally {
    ltable.luaH_new = original;
  }
  return n;
}

// Cuántas tablas crea el banco de Lua al montar la máquina y entrar: se cuentan las llamadas a luaH_new de fengari (cada
// NEWTABLE y cada lua_createtable pasan por ahí). Se compara la entrada con los datos enormes contra la misma entrada
// con una cuenta casi vacía: la resta es lo que cuestan los datos, sin las tablas del banco ni las del propio addon.
function tablasAlEntrar(guardado) {
  return contarTablas(() => {
    const m = nuevaMaquina({ guardado: { SnetForeverCuenta: guardado } });
    sinErrores(m);
    m.cerrar();
  });
}

test('aguante: con 11.630 objetos y 353 grupos, entrar crea menos de 50 tablas y Arbol.objetos de un grupo tarda menos de 50 ms en el banco', () => {
  const datos = datosSinteticos();
  const chico = tablasAlEntrar(cuentaCon({ grupos: { Uno: true }, objetos: { 'i:1': 'Uno' } }));
  const grande = tablasAlEntrar(cuentaCon(datos));
  assert.ok(grande - chico < 50, `los datos crearon ${grande - chico} tablas al entrar (${grande} contra ${chico})`);
  assert.ok(grande - chico >= 0);

  const ruta = datos.rutas[5];
  // Sin índice, Arbol.objetos recorre los objetos una vez y no crea más tabla que el resultado ni hace el índice. La PRIMERA
  // llamada de una máquina nueva es la que cuenta: tiene que bajar de 50 ms (de CPU del proceso, no de reloj: con el resto
  // de pruebas corriendo a la vez el reloj se dispara sin culpa del código) y no crear tablas de más (el índice serían unas
  // 350). Se cuentan las tablas contra una consulta de un solo objeto, que crea las mismas menos la del resultado. Una
  // medida suelta se dispara de vez en cuando por el recolector de basura de node (1 de cada 20 en pruebas a solas), así que
  // se dan hasta tres máquinas nuevas y basta que una primera llamada baje de 50 ms: con el índice en la primera llamada
  // (unos 100 ms) las tres fallarían. Las tablas se exigen siempre.
  let m, claves, primera;
  const intentos = [];
  for (let intento = 0; intento < 3 && !(primera < 50); intento++) {
    m = nuevaMaquina({ guardado: { SnetForeverCuenta: cuentaCon(datos) } });
    const sinResultado = contarTablas(() => m.lua(`${A}.objeto("i:10001")`));
    const t0 = process.cpuUsage();
    const tablas = contarTablas(() => {
      claves = m.lua(`${A}.objetos(${q(ruta)})`);
    });
    const d = process.cpuUsage(t0);
    primera = (d.user + d.system) / 1000;
    intentos.push(primera.toFixed(1));
    assert.ok(tablas - sinResultado <= 1, `la primera consulta creó ${tablas - sinResultado} tablas más que mirar un objeto (¿hizo el índice?)`);
  }
  assert.ok(primera < 50, `la primera consulta (sin índice) tardó ${intentos.join(', ')} ms de CPU`);
  const esperadas = Object.entries(datos.objetos).filter(([, r]) => r === ruta).map(([k]) => k).sort();
  assert.deepEqual(claves, esperadas);
  assert.equal(m.lua(`${A}.contar()`), N_OBJETOS);
  assert.equal(m.lua(`#${A}.hijos("")`), 30);
  assert.equal(m.lua(`(function() local n = 0 for _ in pairs(${A}.grupos()) do n = n + 1 end return n end)()`), N_GRUPOS);
  // Editar hace el índice y lo mantiene al día; Arbol.listar lo usa para dar todos los grupos de una vez.
  assert.equal(m.lua(`#${A}.listar()`), N_GRUPOS);
  m.lua(`${A}.poner(${q(esperadas[0])}, ${q(datos.rutas[6])})`);
  assert.equal(m.lua(`#${A}.objetos(${q(ruta)})`), esperadas.length - 1);
  sinErrores(m);
});

test('las reglas siguen a su grupo: borrar las guarda en la papelera, recuperar las devuelve, renombrar y mover las llevan', () => {
  const m = nuevaMaquina();
  const R = 'SnetForever.Reglas';
  const clave = m.lua(`${G}.crear("Hierbas")`);
  m.lua(`${G}.anadir(${q(clave)}, 2447)`);
  assert.equal(m.lua(`${R}.poner(${q(clave)}, {compraPct = 70})`), true);
  assert.equal(m.lua(`${G}.borrar(${q(clave)})`), true);
  // La regla ya no está suelta: un grupo nuevo con el mismo nombre no la hereda.
  assert.equal(m.lua(`SnetForeverCuenta.comercio.reglas[${q(clave)}]`), undefined);
  assert.equal(m.lua(`${G}.crear("Hierbas")`), clave);
  assert.equal(m.lua(`${R}.de(${q(clave)}).compraPct`), 85, 'la de la plantilla');
  // Recuperar el viejo, con la ruta ocupada: vuelve con nombre libre y con su regla.
  const [ok, nueva] = m.lua(`{${G}.recuperar(${q(clave)})}`);
  assert.equal(ok, true);
  assert.equal(nueva, 'propio:Hierbas 2');
  assert.equal(m.lua(`${R}.de("propio:Hierbas 2").compraPct`), 70);
  assert.equal(m.lua(`${R}.de(${q(clave)}).compraPct`), 85, 'el nuevo sigue sin regla');
  assert.equal(m.lua(`${A}.objeto("i:2447")`), 'Hierbas 2');
  // Con la ruta libre vuelve a la misma, con su regla.
  m.lua(`${G}.borrar("propio:Hierbas 2")`);
  assert.equal(m.lua(`SnetForeverCuenta.comercio.reglas["propio:Hierbas 2"]`), undefined);
  assert.deepEqual(m.lua(`{${G}.recuperar("propio:Hierbas 2")}`), [true, 'propio:Hierbas 2']);
  assert.equal(m.lua(`${R}.de("propio:Hierbas 2").compraPct`), 70);
  // Directamente con Arbol (la ventana de la tarea 12): renombrar y mover llevan las reglas del grupo y de sus hijos.
  m.lua(`${A}.crear("Hierbas 2", "Raras")`);
  m.lua(`${R}.poner(${q(`propio:Hierbas 2${S}Raras`)}, {compraPct = 60})`);
  assert.equal(m.lua(`${A}.renombrar("Hierbas 2", "Plantas")`), 'Plantas');
  assert.equal(m.lua(`${R}.de("propio:Plantas").compraPct`), 70);
  assert.equal(m.lua(`${R}.de(${q(`propio:Plantas${S}Raras`)}).compraPct`), 60);
  assert.equal(m.lua(`SnetForeverCuenta.comercio.reglas["propio:Hierbas 2"]`), undefined);
  m.lua(`${A}.crear("", "Otro")`);
  assert.equal(m.lua(`${A}.mover("Plantas", "Otro")`), `Otro${S}Plantas`);
  assert.equal(m.lua(`${R}.de(${q(`propio:Otro${S}Plantas`)}).compraPct`), 70);
  assert.equal(m.lua(`${R}.de(${q(`propio:Otro${S}Plantas${S}Raras`)}).compraPct`), 60);
  assert.equal(m.lua(`SnetForeverCuenta.comercio.reglas["propio:Plantas"]`), undefined);
  sinErrores(m);
});

test('datos estropeados: claves que no son texto, papelera rota y tablas sustituidas no rompen nada y no se tiran', () => {
  const guardado = { SnetForeverCuenta: { esquema: 1, comercio: { v2: { grupos: 5, objetos: { 'i:1': 'X', _roto: 'X' } } } } };
  const m = nuevaMaquina({ guardado });
  // grupos no era una tabla: lo que había queda en _roto y no sale como un grupo llamado «_roto».
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2.grupos._roto'), 5);
  assert.deepEqual(m.lua(`${A}.hijos("")`), []);
  m.lua(`${A}.crear("", "X")`);
  m.lua('SnetForeverCuenta.comercio.v2.objetos[7] = "X"');
  m.lua(`${A}.olvidarIndice()`);
  assert.deepEqual(m.lua(`${A}.objetos("X")`), ['i:1'], 'la clave numérica y «_roto» no cuentan ni rompen el orden');
  assert.equal(m.lua(`${A}.contar()`), 1);
  assert.equal(m.lua(`#${A}.listar()`), 1);
  assert.deepEqual(m.lua(`${A}.listar()[1].claves`), ['i:1']);
  // Una entrada de la papelera sin su lista de grupos se salta.
  m.lua('SnetForeverCuenta.comercio.v2._papelera = {{ruta = "Mala", grupos = 3}, 4, {ruta = "Buena", grupos = {"Buena"}, objetos = {}}}');
  assert.deepEqual(m.lua(`${A}.papelera()`), [{ ruta: 'Buena', nombre: 'Buena' }]);
  assert.equal(m.lua(`${A}.recuperar("Mala")`), false);
  assert.equal(m.lua(`${A}.recuperar("Buena")`), true);
  assert.equal(m.lua(`${A}.existe("Buena")`), true);
  // Una v2 que no es tabla se guarda en _roto y no se pierde.
  m.lua('SnetForeverCuenta.comercio.v2 = "raro"');
  assert.equal(m.lua(`${A}.contar()`), 0);
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2._roto'), 'raro');
  sinErrores(m);
});

test('migración: las reglas viejas se mueven (no se copian) y quedan en _v1reglas; un grupo nuevo «1» no hereda la de «Telas»', () => {
  const m = nuevaMaquina({ guardado: { SnetForeverCuenta: VIEJOS } });
  assert.equal(m.lua('SnetForever.Reglas.de("propio:Telas").compraPct'), 70);
  assert.equal(m.lua('SnetForeverCuenta.comercio.reglas["propio:1"]'), undefined);
  assert.equal(m.lua('SnetForeverCuenta.comercio.reglas["propio:4"]'), undefined, 'la de la papelera va dentro de su entrada');
  assert.equal(m.lua('SnetForeverCuenta.comercio.v2._papelera[1].reglas.Viejo.compraPct'), 60);
  assert.equal(m.lua('SnetForeverCuenta.comercio._v1reglas["propio:1"].compraPct'), 70);
  assert.equal(m.lua('SnetForeverCuenta.comercio._v1reglas["propio:4"].compraPct'), 60);
  assert.equal(m.lua(`${G}.crear("1")`), 'propio:1');
  assert.equal(m.lua('SnetForever.Reglas.de("propio:1").compraPct'), 85, 'no hereda la regla de «Telas»');
  assert.equal(m.lua(`${A}.recuperar("Viejo")`), true);
  assert.equal(m.lua('SnetForever.Reglas.de("propio:Viejo").compraPct'), 60);
  sinErrores(m);
});

test('migración: una lista de objetos rota se salta, el resto migra una sola vez y no se duplica al volver a leer', () => {
  const malos = JSON.parse(JSON.stringify(VIEJOS));
  malos.comercio.grupos.push({ clave: 'propio:9', nombre: 'Roto', objetos: 'no es una lista' });
  const m = nuevaMaquina({ guardado: { SnetForeverCuenta: malos } });
  assert.deepEqual(m.lua(`${A}.hijos("")`), ["Con'raro", 'Hierbas', 'Roto', 'Telas', 'Telas 2']);
  assert.equal(m.lua(`#${A}.hijos("")`), 5, 'una segunda lectura no duplica nada');
  assert.equal(m.lua('#SnetForeverCuenta.comercio._v1grupos'), 5);
  sinErrores(m);
});

// Task 26: las cuentas que usa Operaciones.usosDeTipo, sin hacer el índice ni una tabla por grupo.
test('cuantosPorGrupo cuenta los objetos de cada grupo, sin índice y con él, sin el Base, lo roto ni las rutas que no son grupos', () => {
  const objetos = { 'i:1': `A${S}B`, 'i:2': `A${S}B`, 'i:3': 'C', 'i:4': '', 'i:5': 'Fantasma', 'i:6': 'A', _roto: 'C', 'i:7': `A${S}${S}X` };
  const m = nuevaMaquina({
    guardado: { SnetForeverCuenta: { esquema: 1, comercio: { v2: { grupos: { [`A${S}B`]: true, C: true, D: true, [`A${S}${S}X`]: true }, objetos } } } },
  });
  // A no está guardado pero es el padre de A`B: cuenta como grupo (con su objeto); D está vacío.
  const esperado = { A: 1, [`A${S}B`]: 2, C: 1, D: 0 };
  assert.deepEqual(m.lua(`${A}.cuantosPorGrupo()`), esperado);
  // Con el índice hecho (Arbol.listar lo hace) da lo mismo, y sigue a las ediciones.
  m.lua(`${A}.listar()`);
  assert.deepEqual(m.lua(`${A}.cuantosPorGrupo()`), esperado);
  m.lua(`${A}.poner("i:3", "A")`);
  assert.deepEqual(m.lua(`${A}.cuantosPorGrupo()`), { A: 2, [`A${S}B`]: 2, C: 0, D: 0 });
  m.lua(`${A}.olvidarIndice()`);
  assert.deepEqual(m.lua(`${A}.cuantosPorGrupo()`), { A: 2, [`A${S}B`]: 2, C: 0, D: 0 });
  sinErrores(m);
});
