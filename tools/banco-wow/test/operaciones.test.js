// Comercio, ventana principal, tarea 15: las operaciones de los 7 tipos (campos de TSM con valores por defecto, herencia por
// grupos, vínculos, ignorar solo con personajes propios y cuenta de usos).
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const O = 'SnetForever.Operaciones';
const A = 'SnetForever.Arbol';
const F = 'SnetForever.Formulas';
const S = '`';
const q = (t) => JSON.stringify(t);
const lista = (...n) => `{${n.map(q).join(', ')}}`;

// Los valores por defecto de las capturas de TSM (INVENTARIO 2.5) con el tipo de cada campo.
const ESPERADO = {
  subasta: {
    ignorarDuracion: ['lista', '0'], duracion: ['lista', '24'], tope: ['formula', '40000'], reservaEnBolsas: ['formula', '0'],
    caducadasMaximas: ['formula', '0'], pujaPorcentaje: ['numero', 100],
    rebaja: ['formula', '0c'],
    precioMinimo: ['formula', 'max(1.5 * vendorsell, 0.25 * first(snfmercado, snfregional(), snfhistorico))'],
    bajoMinimo: ['lista', 'noPublicar'], precioMaximo: ['formula', '50000g'], sobreMaximo: ['lista', 'maximo'],
    precioNormal: ['formula', 'max(2 * snfmercado, 12 * vendorsell)'],
    cancelarRebajadas: ['sino', true], cancelarParaSubir: ['sino', true], umbralReponer: ['formula', '1g'],
  },
  artesania: {
    reponerMinimo: ['formula', '10'], reponerMaximo: ['formula', '20'], beneficioMinimoActivo: ['sino', true],
    beneficioMinimo: ['formula', '100g'], cambiarValor: ['sino', false], valorFabricado: ['formula', ''],
  },
  correo: {
    destinatario: ['texto', ''], conservar: ['formula', '0'], limitarCantidad: ['sino', false], cantidadMaxima: ['formula', '10'],
    reponerDestino: ['sino', false], fuentesReponer: ['varios', []],
  },
  compras: {
    precioMaximo: ['formula', 'snfmercado'], mostrarSobreMaximo: ['sino', true], reponerCantidad: ['formula', '0'],
    fuentesReponer: ['varios', []],
  },
  sniper: { precioMaximo: ['formula', null] }, // la fórmula larga se comprueba aparte
  vendedor: {
    comprarActivo: ['sino', true], reponerCantidad: ['formula', '0'], fuentesReponer: ['varios', []], venderActivo: ['sino', true],
    conservar: ['formula', '0'], caducadasMinimas: ['formula', '20'], valorMercado: ['formula', 'snfmercado'],
    valorMercadoMaximo: ['formula', '0c'], valorDestruccion: ['formula', 'snfmercado'], valorDestruccionMaximo: ['formula', '0c'],
    venderLigados: ['sino', false],
  },
  almacen: {
    mover: ['formula', '0'], moverPila: ['formula', '0'], conservarEnBolsas: ['formula', '0'], conservarEnBanco: ['formula', '0'],
    reponerCantidad: ['formula', '0'], reponerPila: ['formula', '0'], reponerConservarEnBanco: ['formula', '0'],
  },
};
const UNA = ['artesania', 'compras', 'sniper'];

test('los 7 tipos con sus campos y valores por defecto de las capturas', () => {
  const m = nuevaMaquina();
  assert.deepEqual(m.lua(`${O}.ORDEN`), ['subasta', 'artesania', 'correo', 'compras', 'sniper', 'vendedor', 'almacen']);
  for (const [tipo, campos] of Object.entries(ESPERADO)) {
    const def = m.lua(`(function() local t = ${O}.TIPOS[${q(tipo)}]; return {nombre = t.nombre, descripcion = t.descripcion, una = t.una, n = #t.campos} end)()`);
    assert.ok(def.nombre && def.descripcion, `${tipo}: nombre y descripción`);
    assert.equal(def.una, UNA.includes(tipo), `${tipo}: una`);
    assert.equal(def.n, Object.keys(campos).length, `${tipo}: los campos`);
    assert.equal(m.lua(`${O}.crear(${q(tipo)}, "Op")`), 'Op');
    for (const [clave, [t, defecto]] of Object.entries(campos)) {
      const c = m.lua(`(function() local c = ${O}.campo(${q(tipo)}, ${q(clave)}); return {tipo = c.tipo, nombre = c.nombre, descripcion = c.descripcion} end)()`);
      assert.equal(c.tipo, t, `${tipo}.${clave}: tipo`);
      assert.ok(c.nombre && c.descripcion, `${tipo}.${clave}: nombre y descripción`);
      if (defecto === null) continue;
      const v = m.lua(`${O}.valor(${q(tipo)}, "Op", ${q(clave)})`);
      if (Array.isArray(defecto)) assert.deepEqual(v ?? [], defecto, `${tipo}.${clave}`);
      else assert.equal(v, defecto, `${tipo}.${clave}`);
    }
  }
  // Los tipos de campo son solo los seis.
  assert.deepEqual(m.lua(`(function() local t = {}; for _, tipo in ipairs(${O}.ORDEN) do for _, c in ipairs(${O}.TIPOS[tipo].campos) do t[c.tipo] = true end end; local r = {}; for k in pairs(t) do r[#r + 1] = k end; table.sort(r); return r end)()`),
    ['formula', 'lista', 'numero', 'sino', 'texto', 'varios']);
  // Los campos que se apagan dependen de un interruptor que existe y es de sí/no (op-13, op-15).
  assert.equal(m.lua(`${O}.campo("correo", "cantidadMaxima").depende`), 'limitarCantidad');
  assert.equal(m.lua(`${O}.campo("correo", "fuentesReponer").depende`), 'reponerDestino');
  assert.equal(m.lua(`${O}.campo("artesania", "beneficioMinimo").depende`), 'beneficioMinimoActivo');
  assert.equal(m.lua(`(function() for _, tipo in ipairs(${O}.ORDEN) do for _, c in ipairs(${O}.TIPOS[tipo].campos) do if c.depende then local d = ${O}.campo(tipo, c.depende); if not d or d.tipo ~= "sino" then return false end end end end return true end)()`), true);
  // Sniper: la fórmula larga de TSM con nuestras fuentes.
  const sniper = m.lua(`${O}.valor("sniper", "Op", "precioMaximo")`);
  assert.match(sniper, /^max\(vendorsell, ifgt\(snfregional\(\), 250000g, 0\.8,/);
  assert.match(sniper, /0\.05\){8} \* snfregional\(\)\)$/);
  assert.doesNotMatch(sniper, /dbregion/i);
  // Los que se tradujeron de TSM son lo que da Formulas.traducir con el texto de la captura.
  const traducidos = [
    ['max(1.5 * vendorsell, 0.25 * first(dbmarket, dbregionmarketavg, dbhistorical))', 'subasta', 'precioMinimo'],
    ['dbmarket', 'compras', 'precioMaximo'], ['dbmarket', 'vendedor', 'valorMercado'], ['dbmarket', 'vendedor', 'valorDestruccion'],
    [sniper.replace(/snfregional\(\)/g, 'DBRegionMarketAvg'), 'sniper', 'precioMaximo'],
  ];
  for (const [tsm, tipo, clave] of traducidos) {
    assert.equal(m.lua(`(function() return ${F}.traducir(${q(tsm)}) end)()`), m.lua(`${O}.valor(${q(tipo)}, "Op", ${q(clave)})`), `${tipo}.${clave}`);
  }
  // Y todo texto de fórmula por defecto se entiende (menos el vacío de «valor de lo fabricado»).
  assert.equal(m.lua(`(function() for _, tipo in ipairs(${O}.ORDEN) do for _, c in ipairs(${O}.TIPOS[tipo].campos) do
    if c.tipo == "formula" and c.defecto ~= "" and not ${F}.compilar(c.defecto) then return tipo .. "." .. c.clave end end end return "ok" end)()`), 'ok');
  sinErrores(m);
});

// Task 34, ronda 1: la IA lee la `descripcion` de cada campo y el jugador ve la explicación del editor
// (PRINCIPAL_EDITOR_C_<TIPO>_<CAMPO>_A): las dos tienen que decir exactamente lo mismo en español.
test('la descripcion de cada campo de Operaciones.TIPOS es su explicación _A en español', () => {
  const m = nuevaMaquina();
  const r = m.lua(`(function()
    local es, distintos, n = SnetForever.L.tablas.es, {}, 0
    for _, tipo in ipairs(${O}.ORDEN) do
      for _, c in ipairs(${O}.TIPOS[tipo].campos) do
        n = n + 1
        local clave = "PRINCIPAL_EDITOR_C_" .. string.upper(tipo) .. "_" .. string.upper(c.clave) .. "_A"
        if c.descripcion ~= es[clave] then
          distintos[#distintos + 1] = clave .. ": «" .. tostring(c.descripcion) .. "» / «" .. tostring(es[clave]) .. "»"
        end
      end
    end
    return {distintos = distintos, n = n}
  end)()`);
  assert.deepEqual(r.distintos, []);
  assert.ok(r.n > 40, `${r.n} campos`);
  sinErrores(m);
});

test('sin campos de pila (solo existen en Vanilla/BC Classic) y con claves de opciones propias, no las internas de TSM', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua(`${O}.campo("subasta", "tamanoPila")`), undefined);
  assert.equal(m.lua(`${O}.campo("subasta", "pilaParcial")`), undefined);
  assert.deepEqual(m.lua(`(function() local r = {}; for _, o in ipairs(${O}.campo("subasta", "bajoMinimo").opciones) do r[#r + 1] = o.clave end; return r end)()`),
    ['noPublicar', 'minimo', 'maximo', 'normal', 'ignorar']);
  assert.deepEqual(m.lua(`(function() local r = {}; for _, o in ipairs(${O}.campo("subasta", "sobreMaximo").opciones) do r[#r + 1] = o.clave end; return r end)()`),
    ['noPublicar', 'minimo', 'maximo', 'normal']);
  // Ninguna clave de opciones ni valor por defecto de lista es un nombre interno de TSM.
  const internos = ['none', 'minPrice', 'maxPrice', 'normalPrice', 'ignore', 'alts', 'auctions', 'bank', 'guild', 'ah', 'alts_ah', 'mail'];
  const usadas = m.lua(`(function() local r = {}; for _, t in ipairs(${O}.ORDEN) do for _, c in ipairs(${O}.TIPOS[t].campos) do
    if c.tipo == "lista" and type(c.defecto) == "string" then r[#r + 1] = c.defecto end
    for _, o in ipairs(c.opciones or {}) do r[#r + 1] = o.clave end end end return r end)()`);
  for (const u of usadas) assert.equal(internos.includes(u), false, u);
  sinErrores(m);
});

test('poner valida cada tipo de campo y restablecer vuelve a los valores por defecto', () => {
  const m = nuevaMaquina();
  m.lua(`${O}.crear("subasta", "Pub")`);
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "tope", "300")`), true);
  assert.equal(m.lua(`${O}.valor("subasta", "Pub", "tope")`), '300');
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "tope", "1g +")`), false, 'una fórmula que no se entiende no se guarda');
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "tope", 5)`), false);
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "pujaPorcentaje", 80)`), true);
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "pujaPorcentaje", 101)`), false);
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "cancelarRebajadas", false)`), true);
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "cancelarRebajadas", "si")`), false);
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "duracion", "48")`), true);
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "duracion", "7")`), false);
  assert.equal(m.lua(`${O}.poner("compras", "Pub", "precioMaximo", "1g")`), false, 'esa operación no existe en compras');
  assert.equal(m.lua(`${O}.poner("subasta", "Pub", "noExiste", "1")`), false);
  assert.equal(m.lua(`${O}.valor("subasta", "Pub", "noExiste")`), undefined);
  assert.equal(m.lua(`${O}.poner("artesania", "x", "valorFabricado", "")`), false);
  m.lua(`${O}.crear("compras", "C")`);
  assert.equal(m.lua(`${O}.poner("compras", "C", "fuentesReponer", ${lista('banco', 'hermandad')})`), true);
  assert.deepEqual(m.lua(`${O}.valor("compras", "C", "fuentesReponer")`), ['banco', 'hermandad']);
  assert.equal(m.lua(`${O}.poner("compras", "C", "fuentesReponer", ${lista('banco', 'otra')})`), false);
  // Lo que se lee es una copia: tocarlo no cambia lo guardado.
  m.lua(`${O}.valor("compras", "C", "fuentesReponer")[1] = "zzz"`);
  assert.deepEqual(m.lua(`${O}.valor("compras", "C", "fuentesReponer")`), ['banco', 'hermandad']);
  // Interruptores: el campo dependiente se apaga.
  m.lua(`${O}.crear("correo", "Env")`);
  assert.equal(m.lua(`${O}.activo("correo", "Env", "cantidadMaxima")`), false);
  assert.equal(m.lua(`${O}.activo("correo", "Env", "conservar")`), true);
  m.lua(`${O}.poner("correo", "Env", "limitarCantidad", true)`);
  assert.equal(m.lua(`${O}.activo("correo", "Env", "cantidadMaxima")`), true);
  // Restablecer.
  assert.equal(m.lua(`${O}.restablecer("subasta", "Pub")`), true);
  assert.equal(m.lua(`${O}.valor("subasta", "Pub", "tope")`), '40000');
  assert.equal(m.lua(`${O}.valor("subasta", "Pub", "duracion")`), '24');
  assert.equal(m.lua(`${O}.restablecer("subasta", "NoExiste")`), false);
  sinErrores(m);
});

test('crear, renombrar (los grupos que la usan siguen apuntando a ella), duplicar, borrar y restablecer', () => {
  const m = nuevaMaquina();
  assert.equal(m.lua(`${O}.crear("subasta", "  Alta  ")`), 'Alta');
  assert.equal(m.lua(`${O}.crear("subasta", "Alta")`), undefined, 'repetida');
  assert.equal(m.lua(`${O}.crear("subasta", "")`), undefined);
  assert.equal(m.lua(`${O}.crear("subasta", "_roto")`), undefined);
  assert.equal(m.lua(`${O}.crear("subasta", 5)`), undefined);
  assert.equal(m.lua(`${O}.crear("nada", "x")`), undefined, 'tipo que no existe');
  assert.equal(m.lua(`${O}.crear("compras", "Alta")`), 'Alta', 'el mismo nombre en otro tipo vale');
  m.lua(`${O}.crear("subasta", "Baja")`);
  assert.deepEqual(m.lua(`${O}.lista("subasta")`), ['Alta', 'Baja']);
  assert.deepEqual(m.lua(`${O}.lista("nada")`), []);

  // Un grupo y un vínculo apuntan a «Alta»; renombrar los arrastra.
  m.lua(`${A}.crear("", "G")`);
  m.lua(`${O}.poner("subasta", "Alta", "tope", "7")`);
  assert.equal(m.lua(`${O}.ponerDeGrupo("G", "subasta", ${lista('Alta', 'Baja')})`), true);
  m.lua(`${O}.ponerDeGrupo("", "subasta", ${lista('Alta')})`);
  m.lua(`${O}.vincular("subasta", "Baja", "tope", "Alta")`);
  assert.equal(m.lua(`${O}.renombrar("subasta", "Alta", "Premium")`), 'Premium');
  assert.deepEqual(m.lua(`${O}.lista("subasta")`), ['Baja', 'Premium']);
  assert.deepEqual(m.lua(`(function() return (${O}.deGrupo("G", "subasta")) end)()`), ['Premium', 'Baja']);
  assert.deepEqual(m.lua(`(function() return (${O}.deGrupo("", "subasta")) end)()`), ['Premium']);
  assert.equal(m.lua(`${O}.vinculo("subasta", "Baja", "tope")`), 'Premium');
  assert.equal(m.lua(`${O}.valor("subasta", "Baja", "tope")`), '7');
  assert.equal(m.lua(`${O}.valor("subasta", "Premium", "tope")`), '7', 'conserva sus valores');
  assert.equal(m.lua(`${O}.renombrar("subasta", "Premium", "Baja")`), undefined, 'ya existe');
  assert.equal(m.lua(`${O}.renombrar("subasta", "NoExiste", "x")`), undefined);
  assert.equal(m.lua(`${O}.renombrar("subasta", "Premium", "")`), undefined);
  assert.equal(m.lua(`${O}.renombrar("subasta", "Premium", "Premium")`), 'Premium');

  // Duplicar copia valores y vínculos.
  assert.equal(m.lua(`${O}.duplicar("subasta", "Baja")`), 'Baja 2');
  assert.equal(m.lua(`${O}.duplicar("subasta", "Baja")`), 'Baja 3');
  assert.equal(m.lua(`${O}.duplicar("subasta", "Premium", "Copia")`), 'Copia');
  assert.equal(m.lua(`${O}.duplicar("subasta", "Premium", "Copia")`), undefined);
  assert.equal(m.lua(`${O}.duplicar("subasta", "NoExiste")`), undefined);
  assert.equal(m.lua(`${O}.valor("subasta", "Copia", "tope")`), '7');
  assert.equal(m.lua(`${O}.vinculo("subasta", "Baja 2", "tope")`), 'Premium');
  m.lua(`${O}.poner("subasta", "Copia", "tope", "9")`);
  assert.equal(m.lua(`${O}.valor("subasta", "Premium", "tope")`), '7', 'la copia no comparte tabla con la original');

  // Borrar va a la papelera y se puede recuperar; los grupos la ignoran y la marcan mientras tanto.
  assert.equal(m.lua(`${O}.borrar("subasta", "Premium")`), true);
  assert.equal(m.lua(`${O}.borrar("subasta", "Premium")`), false);
  assert.equal(m.lua(`${O}.existe("subasta", "Premium")`), false);
  assert.deepEqual(m.lua(`${O}.papelera()`), [{ tipo: 'subasta', nombre: 'Premium' }]);
  assert.deepEqual(m.lua(`(function() local n, de, faltan = ${O}.deGrupo("G", "subasta"); return {n = n, faltan = faltan} end)()`), { n: ['Baja'], faltan: ['Premium'] });
  assert.equal(m.lua(`${O}.recuperar("subasta", "Premium")`), true);
  assert.equal(m.lua(`${O}.valor("subasta", "Premium", "tope")`), '7');
  assert.deepEqual(m.lua(`${O}.deGrupo("G", "subasta")`), ['Premium', 'Baja']);
  assert.equal(m.lua(`${O}.recuperar("subasta", "Premium")`), false);
  assert.deepEqual(m.lua(`${O}.papelera()`), []);

  // Restablecer quita valores y vínculos.
  assert.equal(m.lua(`${O}.restablecer("subasta", "Baja")`), true);
  assert.equal(m.lua(`${O}.vinculo("subasta", "Baja", "tope")`), undefined);
  assert.equal(m.lua(`${O}.valor("subasta", "Baja", "tope")`), '40000');
  sinErrores(m);
});

test('herencia: un subgrupo usa las del padre hasta tener override; deGrupo dice de quién hereda', () => {
  const m = nuevaMaquina();
  for (const n of ['Base1', 'X', 'Y']) m.lua(`${O}.crear("subasta", ${q(n)})`);
  m.lua(`${A}.crear("", "A")`);
  m.lua(`${A}.crear("A", "B")`);
  m.lua(`${A}.crear(${q(`A${S}B`)}, "C")`);
  const de = (ruta) => m.lua(`(function() local n, de, faltan = ${O}.deGrupo(${q(ruta)}, "subasta"); return {n = n, de = de or false, faltan = faltan} end)()`);
  assert.equal(m.lua(`${O}.ponerDeGrupo("", "subasta", ${lista('Base1')})`), true);
  assert.deepEqual(de(''), { n: ['Base1'], de: false, faltan: [] });
  assert.deepEqual(de('A'), { n: ['Base1'], de: '', faltan: [] }, 'sin override hereda del Grupo Base');
  assert.deepEqual(de(`A${S}B${S}C`), { n: ['Base1'], de: '', faltan: [] });
  // Override en A: B y C lo heredan de A.
  assert.equal(m.lua(`${O}.ponerDeGrupo("A", "subasta", ${lista('X', 'Y')})`), true);
  assert.deepEqual(de('A'), { n: ['X', 'Y'], de: false, faltan: [] });
  assert.deepEqual(de(`A${S}B`), { n: ['X', 'Y'], de: 'A', faltan: [] });
  assert.deepEqual(de(`A${S}B${S}C`), { n: ['X', 'Y'], de: 'A', faltan: [] });
  // Override vacío: el grupo no usa ninguna (no es lo mismo que heredar).
  assert.equal(m.lua(`${O}.ponerDeGrupo(${q(`A${S}B`)}, "subasta", {})`), true);
  assert.deepEqual(de(`A${S}B`), { n: [], de: false, faltan: [] });
  assert.deepEqual(de(`A${S}B${S}C`), { n: [], de: `A${S}B`, faltan: [] });
  // Quitar el override vuelve a heredar.
  assert.equal(m.lua(`${O}.quitarOverride(${q(`A${S}B`)}, "subasta")`), true);
  assert.deepEqual(de(`A${S}B${S}C`), { n: ['X', 'Y'], de: 'A', faltan: [] });
  assert.equal(m.lua(`${O}.quitarOverride(${q(`A${S}B`)}, "subasta")`), false, 'ya no tiene');
  assert.equal(m.lua(`${O}.quitarOverride("", "subasta")`), false, 'el Grupo Base no tiene override');
  // Rechazos: grupo que no existe, operación que no existe, tipo que no existe.
  assert.equal(m.lua(`${O}.ponerDeGrupo("NoExiste", "subasta", ${lista('X')})`), false);
  assert.equal(m.lua(`${O}.ponerDeGrupo("A", "subasta", ${lista('Fantasma')})`), false);
  assert.equal(m.lua(`${O}.ponerDeGrupo("A", "nada", {})`), false);
  assert.deepEqual(de('A'), { n: ['X', 'Y'], de: false, faltan: [] }, 'un rechazo no toca lo guardado');
  assert.equal(m.lua(`${O}.ponerDeGrupo("A", "subasta", ${lista('X', 'X')})`), true);
  assert.deepEqual(de('A').n, ['X'], 'sin repetidas');
  // Cada tipo va por separado.
  m.lua(`${O}.crear("correo", "Env")`);
  assert.deepEqual(m.lua(`${O}.deGrupo("A", "correo")`), []);
  sinErrores(m);
});

test('las operaciones de un grupo siguen al grupo al renombrarlo, moverlo, borrarlo y recuperarlo', () => {
  const m = nuevaMaquina();
  for (const n of ['X', 'Y']) m.lua(`${O}.crear("subasta", ${q(n)})`);
  m.lua(`${A}.crear("", "A")`);
  m.lua(`${A}.crear("A", "B")`);
  m.lua(`${A}.crear("", "D")`);
  m.lua(`${O}.ponerDeGrupo("A", "subasta", ${lista('X')})`);
  m.lua(`${O}.ponerDeGrupo(${q(`A${S}B`)}, "subasta", ${lista('Y')})`);
  const de = (ruta) => m.lua(`(function() local n, de = ${O}.deGrupo(${q(ruta)}, "subasta"); return {n = n, de = de or false} end)()`);
  assert.equal(m.lua(`${A}.renombrar("A", "Z")`), 'Z');
  assert.deepEqual(de('Z'), { n: ['X'], de: false });
  assert.deepEqual(de(`Z${S}B`), { n: ['Y'], de: false });
  assert.deepEqual(de('A'), { n: [], de: '' }, 'la ruta vieja ya no tiene nada propio');
  assert.deepEqual(m.lua(`${O}.huerfanos()`), []);
  assert.equal(m.lua(`${A}.mover("Z", "D")`), `D${S}Z`);
  assert.deepEqual(de(`D${S}Z`), { n: ['X'], de: false });
  assert.deepEqual(de(`D${S}Z${S}B`), { n: ['Y'], de: false });
  assert.deepEqual(m.lua(`${O}.huerfanos()`), []);
  // Borrar el grupo se lleva sus operaciones a la papelera (nada se pierde) y recuperar las devuelve.
  assert.equal(m.lua(`${A}.borrar(${q(`D${S}Z`)})`), true);
  assert.deepEqual(m.lua(`${O}.huerfanos()`), []);
  assert.equal(m.lua(`next(SnetForeverCuenta.comercio.v2.gruposOps) == nil`), true);
  assert.equal(m.lua(`#SnetForeverCuenta.comercio.v2._papelera`), 1);
  assert.equal(m.lua(`${A}.recuperar(${q(`D${S}Z`)})`), true);
  assert.deepEqual(de(`D${S}Z`), { n: ['X'], de: false });
  assert.deepEqual(de(`D${S}Z${S}B`), { n: ['Y'], de: false });
  // Recuperar con la ruta ocupada: vuelve con otro nombre y las operaciones con él.
  assert.equal(m.lua(`${A}.borrar(${q(`D${S}Z`)})`), true);
  m.lua(`${A}.crear("D", "Z")`);
  const r = m.lua(`(function() local ok, ruta = ${A}.recuperar(${q(`D${S}Z`)}); return {ok = ok, ruta = ruta} end)()`);
  assert.equal(r.ok, true);
  assert.equal(r.ruta, `D${S}Z 2`);
  assert.deepEqual(de(`D${S}Z 2`), { n: ['X'], de: false });
  assert.deepEqual(de(`D${S}Z`), { n: [], de: '' });
  sinErrores(m);
});

test('artesanía, compras y sniper admiten una sola', () => {
  const m = nuevaMaquina();
  m.lua(`${A}.crear("", "G")`);
  for (const t of UNA) for (const n of ['a', 'b']) m.lua(`${O}.crear(${q(t)}, ${q(n)})`);
  for (const t of ['subasta', 'correo', 'vendedor', 'almacen']) for (const n of ['a', 'b']) m.lua(`${O}.crear(${q(t)}, ${q(n)})`);
  for (const t of UNA) {
    assert.equal(m.lua(`${O}.ponerDeGrupo("G", ${q(t)}, ${lista('a', 'b')})`), false, t);
    assert.equal(m.lua(`${O}.ponerDeGrupo("G", ${q(t)}, ${lista('a')})`), true, t);
    assert.equal(m.lua(`${O}.ponerDeGrupo("G", ${q(t)}, ${lista('b')})`), true, 'cambiar la única');
    assert.deepEqual(m.lua(`${O}.deGrupo("G", ${q(t)})`), ['b'], t);
    assert.equal(m.lua(`${O}.ponerDeGrupo("", ${q(t)}, ${lista('a', 'b')})`), false, `${t} en el Grupo Base`);
  }
  for (const t of ['subasta', 'correo', 'vendedor', 'almacen']) {
    assert.equal(m.lua(`${O}.ponerDeGrupo("G", ${q(t)}, ${lista('a', 'b')})`), true, t);
    assert.deepEqual(m.lua(`${O}.deGrupo("G", ${q(t)})`), ['a', 'b'], t);
  }
  // Si los datos ya traían varias en un tipo de una sola, solo se usa la primera.
  m.lua(`SnetForeverCuenta.comercio.v2.gruposOps.G.sniper = {"a", "b"}`);
  assert.deepEqual(m.lua(`${O}.deGrupo("G", "sniper")`), ['a']);
  sinErrores(m);
});

test('vínculo: el campo enseña el de la otra y no se edita; ciclo cortado', () => {
  const m = nuevaMaquina();
  for (const n of ['A', 'B', 'C']) m.lua(`${O}.crear("subasta", ${q(n)})`);
  m.lua(`${O}.poner("subasta", "B", "precioMaximo", "80g")`);
  m.lua(`${O}.poner("subasta", "A", "precioMaximo", "10g")`);
  assert.equal(m.lua(`${O}.vincular("subasta", "A", "precioMaximo", "B")`), true);
  assert.equal(m.lua(`${O}.valor("subasta", "A", "precioMaximo")`), '80g');
  assert.equal(m.lua(`${O}.vinculo("subasta", "A", "precioMaximo")`), 'B');
  assert.equal(m.lua(`${O}.poner("subasta", "A", "precioMaximo", "5g")`), false, 'vinculado: no se edita');
  assert.equal(m.lua(`${O}.valor("subasta", "A", "precioMaximo")`), '80g');
  assert.equal(m.lua(`${O}.valor("subasta", "A", "tope")`), '40000', 'los demás campos siguen siendo suyos');
  assert.equal(m.lua(`${O}.poner("subasta", "A", "tope", "3")`), true);
  // Cambiar el de la otra se nota.
  m.lua(`${O}.poner("subasta", "B", "precioMaximo", "90g")`);
  assert.equal(m.lua(`${O}.valor("subasta", "A", "precioMaximo")`), '90g');
  // Cadena A -> B -> C.
  m.lua(`${O}.poner("subasta", "C", "precioMaximo", "1g")`);
  assert.equal(m.lua(`${O}.vincular("subasta", "B", "precioMaximo", "C")`), true);
  assert.equal(m.lua(`${O}.valor("subasta", "A", "precioMaximo")`), '1g', 'se sigue la cadena');
  assert.equal(m.lua(`${O}.valor("subasta", "B", "precioMaximo")`), '1g');
  // Ciclo C -> A: desde la Task 22 no se deja crear (false y el motivo «ciclo»); C sigue con su valor.
  assert.deepEqual(m.lua(`{${O}.vincular("subasta", "C", "precioMaximo", "A")}`), [false, 'ciclo']);
  assert.equal(m.lua(`${O}.vinculo("subasta", "C", "precioMaximo")`), undefined);
  assert.equal(m.lua(`${O}.poner("subasta", "C", "precioMaximo", "2g")`), true);
  assert.equal(m.lua(`${O}.valor("subasta", "A", "precioMaximo")`), '2g');
  // Un ciclo que ya venga en los datos guardados (de antes) se corta sin colgarse ni fallar.
  m.lua(`SnetForeverCuenta.comercio.v2.operaciones.subasta.C.vinculos = {precioMaximo = "A"}`);
  for (const n of ['A', 'B', 'C']) assert.equal(typeof m.lua(`${O}.valor("subasta", ${q(n)}, "precioMaximo")`), 'string', n);
  assert.equal(m.lua(`${O}.poner("subasta", "C", "precioMaximo", "3g")`), false);
  m.lua(`SnetForeverCuenta.comercio.v2.operaciones.subasta.C.vinculos = nil`);
  // Quitar el vínculo devuelve el valor propio.
  assert.equal(m.lua(`${O}.vincular("subasta", "A", "precioMaximo", nil)`), true);
  assert.equal(m.lua(`${O}.valor("subasta", "A", "precioMaximo")`), '10g');
  assert.equal(m.lua(`${O}.poner("subasta", "A", "precioMaximo", "6g")`), true);
  // Rechazos: a sí misma, a una que no existe, a una de otro tipo, campo que no existe.
  assert.equal(m.lua(`${O}.vincular("subasta", "A", "tope", "A")`), false);
  assert.equal(m.lua(`${O}.vincular("subasta", "A", "tope", "Fantasma")`), false);
  m.lua(`${O}.crear("correo", "Env")`);
  assert.equal(m.lua(`${O}.vincular("subasta", "A", "tope", "Env")`), false);
  assert.equal(m.lua(`${O}.vincular("subasta", "A", "noExiste", "B")`), false);
  // Si la otra se borra, el campo vuelve a su valor sin romperse.
  m.lua(`${O}.vincular("subasta", "A", "tope", "B")`);
  m.lua(`${O}.borrar("subasta", "B")`);
  assert.equal(m.lua(`${O}.valor("subasta", "A", "tope")`), '3');
  assert.equal(m.lua(`${O}.vinculo("subasta", "A", "tope")`), undefined);
  sinErrores(m);
});

test('usos cuenta grupos y objetos con herencia (como TSM; el asterisco es el Grupo Base)', () => {
  const m = nuevaMaquina();
  for (const n of ['Base1', 'X', 'Y', 'Sola']) m.lua(`${O}.crear("subasta", ${q(n)})`);
  m.lua(`${A}.crear("", "A")`);
  m.lua(`${A}.crear("A", "B")`);
  m.lua(`${A}.crear("A", "C")`);
  m.lua(`${A}.crear("", "D")`);
  const pon = (clave, ruta) => m.lua(`${A}.poner(${q(clave)}, ${q(ruta)})`);
  pon('i:1', 'A'); pon('i:2', 'A'); pon('i:3', `A${S}B`); pon('i:4', `A${S}C`);
  pon('i:5', 'D'); pon('i:6', 'D'); pon('i:7', 'D'); pon('i:8', '');
  m.lua(`${O}.ponerDeGrupo("", "subasta", ${lista('Base1')})`);
  m.lua(`${O}.ponerDeGrupo("A", "subasta", ${lista('X')})`);
  m.lua(`${O}.ponerDeGrupo(${q(`A${S}C`)}, "subasta", ${lista('Y', 'X')})`);
  const usos = (n) => m.lua(`(function() local g, o, b = ${O}.usos("subasta", ${q(n)}); return {g = g, o = o, b = b} end)()`);
  // Base1: Grupo Base y D (hereda); A y A`C tienen override; A`B hereda de A.
  assert.deepEqual(usos('Base1'), { g: 2, o: 3, b: true });
  // X: A, A`B (hereda de A) y A`C. Items: 2 + 1 + 1.
  assert.deepEqual(usos('X'), { g: 3, o: 4, b: false });
  // Y: solo A`C.
  assert.deepEqual(usos('Y'), { g: 1, o: 1, b: false });
  assert.deepEqual(usos('Sola'), { g: 0, o: 0, b: false });
  assert.deepEqual(usos('NoExiste'), { g: 0, o: 0, b: false });
  // Los objetos del Grupo Base no suman nunca (TSM suma 0,9 y enseña el asterisco).
  assert.equal(m.lua(`${A}.contar("")`), 1);
  // Un override vacío en D la saca de Base1.
  m.lua(`${O}.ponerDeGrupo("D", "subasta", {})`);
  assert.deepEqual(usos('Base1'), { g: 1, o: 0, b: true });
  sinErrores(m);
});

test('usosDeTipo da los usos de todas las operaciones del tipo de una sola pasada, igual que usos', () => {
  const m = nuevaMaquina();
  for (const n of ['Base1', 'X', 'Y', 'Sola']) m.lua(`${O}.crear("subasta", ${q(n)})`);
  m.lua(`${A}.crear("", "A")`);
  m.lua(`${A}.crear("A", "B")`);
  m.lua(`${A}.crear("A", "C")`);
  m.lua(`${A}.crear("", "D")`);
  const pon = (clave, ruta) => m.lua(`${A}.poner(${q(clave)}, ${q(ruta)})`);
  pon('i:1', 'A'); pon('i:2', 'A'); pon('i:3', `A${S}B`); pon('i:4', `A${S}C`);
  pon('i:5', 'D'); pon('i:6', 'D'); pon('i:7', 'D'); pon('i:8', '');
  m.lua(`${O}.ponerDeGrupo("", "subasta", ${lista('Base1')})`);
  m.lua(`${O}.ponerDeGrupo("A", "subasta", ${lista('X')})`);
  m.lua(`${O}.ponerDeGrupo(${q(`A${S}C`)}, "subasta", ${lista('Y', 'X', 'X')})`);
  // Task 26: la lectura única es Arbol.cuantosPorGrupo (solo las cuentas), ya no Arbol.listar (el índice y las listas).
  m.lua(`CONTAR, LISTAR, CUANTOS = 0, 0, 0
    local c, l, n = ${A}.contar, ${A}.listar, ${A}.cuantosPorGrupo
    ${A}.contar = function(...) CONTAR = CONTAR + 1; return c(...) end
    ${A}.listar = function(...) LISTAR = LISTAR + 1; return l(...) end
    ${A}.cuantosPorGrupo = function(...) CUANTOS = CUANTOS + 1; return n(...) end`);
  const todos = m.lua(`${O}.usosDeTipo("subasta")`);
  assert.deepEqual(todos, {
    Base1: { grupos: 2, objetos: 3, conBase: true }, X: { grupos: 3, objetos: 4, conBase: false },
    Y: { grupos: 1, objetos: 1, conBase: false }, Sola: { grupos: 0, objetos: 0, conBase: false },
  });
  assert.equal(m.lua('CONTAR'), 0, 'no se cuenta grupo a grupo');
  assert.equal(m.lua('CUANTOS'), 1, 'una sola lectura del árbol para todas las operaciones');
  assert.equal(m.lua('LISTAR'), 0, 'sin hacer las listas de objetos de cada grupo');
  for (const n of Object.keys(todos)) {
    assert.deepEqual(m.lua(`(function() local g, o, b = ${O}.usos("subasta", ${q(n)}); return {grupos = g, objetos = o, conBase = b} end)()`), todos[n], n);
  }
  assert.equal(Object.keys(m.lua(`${O}.usosDeTipo("zzz")`)).length, 0, 'un tipo que no existe no tiene usos');
  assert.equal(Object.keys(m.lua(`${O}.usosDeTipo("correo")`)).length, 0, 'un tipo sin operaciones tampoco');
  sinErrores(m);
});

test('usos cuenta de una vez: una pasada por llamada, no una por grupo', () => {
  const m = nuevaMaquina();
  m.lua(`${O}.crear("subasta", "X")`);
  for (let i = 0; i < 12; i++) { m.lua(`${A}.crear("", "G${i}")`); m.lua(`${A}.poner("i:${i + 1}", "G${i}")`); }
  m.lua(`${O}.ponerDeGrupo("", "subasta", ${lista('X')})`);
  // Task 26: la lectura única es Arbol.cuantosPorGrupo (solo las cuentas), ya no Arbol.listar (el índice y las listas).
  m.lua(`CONTAR, LISTAR, CUANTOS = 0, 0, 0
    local c, l, n = ${A}.contar, ${A}.listar, ${A}.cuantosPorGrupo
    ${A}.contar = function(...) CONTAR = CONTAR + 1; return c(...) end
    ${A}.listar = function(...) LISTAR = LISTAR + 1; return l(...) end
    ${A}.cuantosPorGrupo = function(...) CUANTOS = CUANTOS + 1; return n(...) end`);
  assert.deepEqual(m.lua(`(function() local g, o, b = ${O}.usos("subasta", "X"); return {g, o, b} end)()`), [13, 12, true]);
  assert.equal(m.lua('CONTAR'), 0, 'no se cuenta grupo a grupo');
  assert.ok(m.lua('LISTAR') + m.lua('CUANTOS') <= 1, 'como mucho una lectura del árbol por llamada');
  sinErrores(m);
});

test('renombrar una operación también cambia lo guardado en la papelera (grupos y operaciones borradas)', () => {
  const m = nuevaMaquina();
  for (const n of ['X', 'Y', 'Z']) m.lua(`${O}.crear("subasta", ${q(n)})`);
  m.lua(`${A}.crear("", "G")`);
  m.lua(`${O}.ponerDeGrupo("G", "subasta", ${lista('X', 'Y')})`);
  assert.equal(m.lua(`${A}.borrar("G")`), true);
  // Una operación borrada que estaba vinculada a X.
  m.lua(`${O}.vincular("subasta", "Z", "tope", "X")`);
  assert.equal(m.lua(`${O}.borrar("subasta", "Z")`), true);
  assert.equal(m.lua(`${O}.renombrar("subasta", "X", "Nueva")`), 'Nueva');
  assert.equal(m.lua(`${A}.recuperar("G")`), true);
  assert.deepEqual(m.lua(`(function() local n, de, faltan = ${O}.deGrupo("G", "subasta"); return {n = n, faltan = faltan} end)()`), { n: ['Nueva', 'Y'], faltan: [] });
  assert.equal(m.lua(`${O}.recuperar("subasta", "Z")`), true);
  assert.equal(m.lua(`${O}.vinculo("subasta", "Z", "tope")`), 'Nueva');
  sinErrores(m);
});

test('operación inexistente en un grupo y grupo huérfano: no rompe y se marca', () => {
  const m = nuevaMaquina();
  m.lua(`${O}.crear("subasta", "X")`);
  m.lua(`${A}.crear("", "G")`);
  m.lua(`${O}.ponerDeGrupo("", "subasta", ${lista('X')})`);
  // Operación nombrada que no existe.
  m.lua(`SnetForeverCuenta.comercio.v2.gruposOps.G = {subasta = {"Fantasma", "X"}}`);
  assert.deepEqual(m.lua(`(function() local n, de, faltan = ${O}.deGrupo("G", "subasta"); return {n = n, faltan = faltan} end)()`), { n: ['X'], faltan: ['Fantasma'] });
  assert.deepEqual(m.lua(`(function() local g, o = ${O}.usos("subasta", "X"); return {g, o} end)()`), [2, 0]);
  // Grupo sin padre en el árbol: cuelga de Grupo Base.
  assert.deepEqual(m.lua(`(function() local n, de = ${O}.deGrupo(${q(`Sin${S}Padre${S}Hijo`)}, "subasta"); return {n = n, de = de} end)()`), { n: ['X'], de: '' });
  // Operaciones guardadas de un grupo que ya no existe: se marcan como huérfanas y no cuentan.
  m.lua(`SnetForeverCuenta.comercio.v2.gruposOps.Perdido = {subasta = {"X"}}`);
  assert.deepEqual(m.lua(`${O}.huerfanos()`), ['Perdido']);
  assert.deepEqual(m.lua(`(function() local g = ${O}.usos("subasta", "X"); return {g} end)()`), [2]);
  // Datos estropeados: nada se pierde y nada rompe.
  m.lua(`SnetForeverCuenta.comercio.v2.gruposOps.G = {subasta = 5, correo = "x"}`);
  assert.deepEqual(m.lua(`${O}.deGrupo("G", "subasta")`), ['X'], 'sin override legible, hereda');
  m.lua(`SnetForeverCuenta.comercio.v2.operaciones.correo = "estropeado"`);
  assert.deepEqual(m.lua(`${O}.lista("correo")`), []);
  assert.equal(m.lua(`${O}.crear("correo", "Nueva")`), 'Nueva');
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2.operaciones.correo._roto`), 'estropeado');
  m.lua(`SnetForeverCuenta.comercio.v2.operaciones.subasta.Rota = 7`);
  assert.deepEqual(m.lua(`${O}.lista("subasta")`), ['X'], 'una operación ilegible no sale en la lista');
  assert.equal(m.lua(`${O}.valor("subasta", "Rota", "tope")`), undefined);
  assert.equal(m.lua(`${O}.crear("subasta", "Rota")`), undefined, 'no pisa lo que haya');
  m.lua(`SnetForeverCuenta.comercio.v2.operaciones.subasta.X.valores = "roto"`);
  assert.equal(m.lua(`${O}.valor("subasta", "X", "tope")`), '40000');
  assert.equal(m.lua(`${O}.poner("subasta", "X", "tope", "2")`), true);
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2.operaciones.subasta.X.valores._roto`), 'roto');
  m.lua(`SnetForeverCuenta.comercio.v2.gruposOps = 5`);
  assert.deepEqual(m.lua(`${O}.deGrupo("G", "subasta")`), []);
  assert.equal(m.lua(`SnetForeverCuenta.comercio.v2.gruposOps`) !== undefined, true);
  // Entradas raras en llamadas.
  assert.deepEqual(m.lua(`${O}.deGrupo(nil, "subasta")`), []);
  assert.equal(m.lua(`${O}.valor(nil, nil, nil)`), undefined);
  assert.equal(m.lua(`${O}.poner(nil, nil, nil, nil)`), false);
  assert.equal(m.lua(`${O}.usos(nil, nil)`), 0);
  sinErrores(m);
});

test('ignorar reinos y personajes: solo los propios de la cuenta, por nombre y reino', () => {
  const m = nuevaMaquina({ jugador: { nombre: 'Alba', reino: 'Mirador', faccion: 'Alliance' } });
  m.lua(`${O}.crear("subasta", "X")`);
  const propios = m.lua(`${O}.propios()`);
  assert.deepEqual(propios.personajes, ['Alba - Mirador']);
  assert.deepEqual(propios.casas, ['Mirador|Alliance']);
  assert.deepEqual(m.lua(`${O}.valor("subasta", "X", "ignorarReinos")`), []);
  assert.equal(m.lua(`${O}.poner("subasta", "X", "ignorarReinos", ${lista('Mirador|Alliance')})`), true);
  assert.deepEqual(m.lua(`${O}.valor("subasta", "X", "ignorarReinos")`), ['Mirador|Alliance']);
  assert.equal(m.lua(`${O}.poner("subasta", "X", "ignorarReinos", ${lista('Otro|Horde')})`), false, 'una casa que no es de la cuenta');
  assert.equal(m.lua(`${O}.poner("subasta", "X", "ignorarPersonajes", ${lista('Alba - Mirador')})`), true);
  assert.equal(m.lua(`${O}.poner("subasta", "X", "ignorarPersonajes", ${lista('Alba')})`), false, 'sin el reino no es un personaje propio');
  assert.equal(m.lua(`${O}.poner("subasta", "X", "ignorarPersonajes", ${lista('Alba - Mirador', 'Pepito - Mirador')})`), false, 'nunca nombres de otros jugadores');
  assert.deepEqual(m.lua(`${O}.valor("subasta", "X", "ignorarPersonajes")`), ['Alba - Mirador'], 'un rechazo no toca lo guardado');
  assert.equal(m.lua(`${O}.ignorada("subasta", "X", "Alba - Mirador", nil)`), true);
  assert.equal(m.lua(`${O}.ignorada("subasta", "X", "Pepito - Otro", "Otro|Horde")`), false);
  assert.equal(m.lua(`${O}.ignorada("subasta", "X", nil, "Mirador|Alliance")`), true);
  assert.equal(m.lua(`${O}.vincular("subasta", "X", "ignorarReinos", "X")`), false, 'lo de ignorar no se vincula');
  // Un segundo personaje de la cuenta se va sumando cuando juega.
  m.jugador({ nombre: 'Brisa' });
  assert.deepEqual(m.lua(`${O}.propios()`).personajes, ['Alba - Mirador', 'Brisa - Mirador']);
  assert.equal(m.lua(`${O}.poner("subasta", "X", "ignorarPersonajes", ${lista('Alba - Mirador', 'Brisa - Mirador')})`), true);
  // Restablecer no toca lo de ignorar; duplicar sí lo copia.
  m.lua(`${O}.restablecer("subasta", "X")`);
  assert.deepEqual(m.lua(`${O}.valor("subasta", "X", "ignorarPersonajes")`), ['Alba - Mirador', 'Brisa - Mirador']);
  sinErrores(m);
});

test('ignorar personajes: lo apuntado solo por nombre (antes de la Task 25) pasa a nombre y reino cuando ese personaje juega', () => {
  const m = nuevaMaquina({ jugador: { nombre: 'Alba', reino: 'Mirador', faccion: 'Alliance' } });
  m.lua(`${O}.crear("subasta", "X")`);
  m.lua(`${O}.crear("correo", "Y")`);
  m.lua(`(function()
    local v2 = SnetForeverCuenta.comercio.v2
    v2.propios = {personajes = {Alba = true, Brisa = true}, casas = {}}
    v2.operaciones.subasta.X.ignorarPersonajes = {Alba = true, Brisa = true}
    v2.operaciones.correo.Y.ignorarPersonajes = {Alba = true}
    ${O}.borrar("correo", "Y")
  end)()`);
  assert.deepEqual(m.lua(`${O}.propios()`).personajes, ['Alba - Mirador', 'Brisa'], 'Brisa sigue por nombre hasta que juegue');
  assert.deepEqual(m.lua(`${O}.valor("subasta", "X", "ignorarPersonajes")`), ['Alba - Mirador', 'Brisa']);
  assert.equal(m.lua(`${O}.ignorada("subasta", "X", "Alba - Mirador", nil)`), true);
  assert.equal(m.lua(`${O}.recuperar("correo", "Y")`), true);
  assert.deepEqual(m.lua(`${O}.valor("correo", "Y", "ignorarPersonajes")`), ['Alba - Mirador'], 'también en las operaciones de la papelera');
  m.jugador({ nombre: 'Brisa' });
  assert.deepEqual(m.lua(`${O}.propios()`).personajes, ['Alba - Mirador', 'Brisa - Mirador']);
  assert.deepEqual(m.lua(`${O}.valor("subasta", "X", "ignorarPersonajes")`), ['Alba - Mirador', 'Brisa - Mirador']);
  sinErrores(m);
});

test('vincular: un ciclo de dos (A con B y B con A) tampoco se deja, ni en otro campo', () => {
  const m = nuevaMaquina();
  for (const n of ['A', 'B']) m.lua(`${O}.crear("compras", ${q(n)})`);
  assert.equal(m.lua(`${O}.vincular("compras", "A", "precioMaximo", "B")`), true);
  assert.deepEqual(m.lua(`{${O}.vincular("compras", "B", "precioMaximo", "A")}`), [false, 'ciclo']);
  assert.equal(m.lua(`${O}.vinculo("compras", "B", "precioMaximo")`), undefined);
  assert.equal(m.lua(`${O}.vincular("compras", "B", "reponerCantidad", "A")`), true, 'otro campo es otra cadena');
  sinErrores(m);
});

test('gruposDe: los grupos que tienen la operación en su lista propia, Grupo Base primero y en el orden del árbol', () => {
  const m = nuevaMaquina();
  for (const n of ['X', 'Y']) m.lua(`${O}.crear("subasta", ${q(n)})`);
  m.lua(`${A}.crear("", "B"); ${A}.crear("", "A"); ${A}.crear("A", "Hijo")`);
  m.lua(`${O}.ponerDeGrupo("A${S}Hijo", "subasta", ${lista('X')})`);
  m.lua(`${O}.ponerDeGrupo("B", "subasta", ${lista('Y', 'X')})`);
  m.lua(`${O}.ponerDeGrupo("", "subasta", ${lista('X')})`);
  m.lua(`${O}.ponerDeGrupo("A", "subasta", ${lista('Y')})`);
  assert.deepEqual(m.lua(`${O}.gruposDe("subasta", "X")`), ['', `A${S}Hijo`, 'B']);
  assert.deepEqual(m.lua(`${O}.gruposDe("subasta", "Y")`), ['A', 'B']);
  // Un grupo que hereda no cuenta; un grupo borrado del árbol, tampoco.
  m.lua(`${A}.borrar("B")`);
  assert.deepEqual(m.lua(`${O}.gruposDe("subasta", "Y")`), ['A']);
  assert.deepEqual(m.lua(`${O}.gruposDe("subasta", "Nada")`), []);
  assert.deepEqual(m.lua(`${O}.gruposDe("zzz", "X")`), []);
  sinErrores(m);
});
