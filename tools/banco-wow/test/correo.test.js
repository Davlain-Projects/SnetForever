// Correo (plan de paridad con TSM, fase 4): la vista previa de solo lectura de lo que las operaciones de Correo enviarían
// desde las bolsas, con las cuentas de MailingOperation.SendTargetIterator de TSM 4.15.9. Todo lo de aquí es inventado:
// personajes, objetos y cantidades.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nuevaMaquina, sinErrores, testConComercio as test } from './ayuda.js';

const C = 'SnetForever.Correo';
const JUGADOR = { nombre: 'Prueba', reino: 'Normal', faccion: 'Horde' };
const MENA = 500;
const BARRA = 501;
const ANILLO = 502;
const ALT = 'Gemela'; // otro personaje propio inventado
const ALT2 = 'Tercera';

// Lo que el addon no debe llamar nunca aquí: enviar, adjuntar, coger, devolver o borrar correo, dinero o pilas.
const PROHIBIDAS = ['SendMail', 'ClickSendMailItemButton', 'SetSendMailMoney', 'SetSendMailCOD', 'SetSendMailShowing',
  'TakeInboxItem', 'TakeInboxMoney', 'AutoLootMailItem', 'DeleteInboxItem', 'ReturnInboxItem', 'CheckInbox',
  'PickupContainerItem', 'SplitContainerItem', 'UseContainerItem', 'ClearCursor'];

function maquina() {
  const m = nuevaMaquina({ jugador: JUGADOR, bolsas: 'forever' });
  m.itemInfo(MENA, { nombre: 'Mena', precio: 10, apilado: 20 });
  m.itemInfo(BARRA, { nombre: 'Barra', precio: 10, apilado: 20 });
  m.itemInfo(ANILLO, { nombre: 'Anillo', precio: 10, apilado: 1 });
  m.disparar('PLAYER_ENTERING_WORLD', true, false);
  const espias = PROHIBIDAS.map((n) => `rawset(_G, "${n}", function(...) ESPIA[#ESPIA + 1] = "${n}" end)
    if rawget(C_Container, "${n}") then rawset(C_Container, "${n}", function(...) ESPIA[#ESPIA + 1] = "C_Container.${n}" end) end`).join('\n');
  m.lua(`SnetForever.Guardado.preparar()
    ESPIA = {}
    ${espias}
    SnetForever.MisSubastas.publicadas = function() return 0 end
    local v2 = SnetForeverCuenta.comercio.v2
    v2.propios = v2.propios or {}
    v2.propios.personajes = {["Prueba - Normal"] = true, ["${ALT} - Normal"] = true, ["${ALT2} - Normal"] = true}`);
  return m;
}

// Minería con dos operaciones de Correo; Minería`Barras las hereda.
function grupos(m) {
  m.lua(`local S, O = SnetForever, SnetForever.Operaciones
    assert(S.Arbol.crear("", "Minería"))
    assert(S.Arbol.crear("Minería", "Barras"))
    assert(S.Arbol.poner("i:${MENA}", "Minería"))
    assert(S.Arbol.poner("i:${BARRA}", "Minería\`Barras"))
    assert(S.Arbol.poner("i:${ANILLO}", "Minería"))
    assert(O.crear("correo", "A Gemela"))
    assert(O.poner("correo", "A Gemela", "destinatario", "${ALT}"))
    assert(O.poner("correo", "A Gemela", "conservar", "5"))
    assert(O.poner("correo", "A Gemela", "limitarCantidad", true))
    assert(O.poner("correo", "A Gemela", "cantidadMaxima", "10"))
    assert(O.crear("correo", "A Tercera"))
    assert(O.poner("correo", "A Tercera", "destinatario", "${ALT2}"))
    assert(O.poner("correo", "A Tercera", "conservar", "2"))
    assert(O.ponerDeGrupo("Minería", "correo", {"A Gemela", "A Tercera"}))`);
}

// Las fichas de inventario: el de ahora y los otros dos personajes, con el buzón y el banco vistos o no.
function inventario(m, alt = {}, alt2 = {}) {
  const t = (o) => (o === null ? 'nil' : `{${Object.entries(o).map(([k, v]) => `[${k}] = ${v}`).join(', ')}}`);
  const ficha = (nombre, f) => `["${nombre}-Normal"] = {nombre = "${nombre}", reino = "Normal", bolsas = ${t(f.bolsas || {})},
    banco = ${t(f.banco === undefined ? {} : f.banco)}, correo = ${t(f.correo === undefined ? {} : f.correo)}}`;
  m.lua(`SnetForeverCuenta.comercio.inventario = {v = 2, pj = {
      ["Prueba-Normal"] = {nombre = "Prueba", reino = "Normal", bolsas = {}, banco = {}, correo = {}},
      ${ficha(ALT, alt)}, ${ficha(ALT2, alt2)}}}
    SnetForever.InventarioCuenta.olvidarOrden()`);
}

const vista = (m, rutas) => m.lua(`return ${C}.vistaPrevia(${rutas || ''})`);
const fila = (v, item) => v.filas.find((f) => f.item === item);
const linea = (v, item, op) => v.lineas.find((l) => l.item === item && l.operacion === op);
const nadaEnElJuego = (m) => {
  assert.deepEqual(m.lua('return ESPIA') || [], [], 'no se llama a ninguna función de correo ni de contenedores que actúe');
  for (const api of ['C_Container.PickupContainerItem', 'C_Container.SplitContainerItem', 'C_Container.UseContainerItem']) {
    assert.equal(m.llamadas(api).length, 0, api);
  }
};

test('reparte lo libre entre las operaciones en orden, con la reserva mayor y sin contarla dos veces', () => {
  const m = maquina();
  try {
    grupos(m);
    inventario(m);
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: false });
    m.bolsa(0, 2, { id: MENA, n: 4, ligado: false });
    m.bolsa(0, 3, { id: BARRA, n: 3, ligado: false });
    const v = vista(m);
    assert.equal(v.estado, 'lista');
    const f = fila(v, MENA);
    assert.deepEqual(f.operaciones, ['A Gemela', 'A Tercera']);
    assert.equal(f.enviables, 24);
    const a = linea(v, MENA, 'A Gemela');
    assert.deepEqual([a.destino, a.destinatario, a.conservar, a.maxima, a.disponible, a.enviar, a.estado],
      ['propio', ALT, 5, 10, 19, 10, 'enviar'], '24 - 5 libres, como mucho 10');
    const b = linea(v, MENA, 'A Tercera');
    assert.equal(b.reservaTotal, 5, 'la reserva es la mayor (5), no 5 + 2');
    assert.equal(b.disponible, 9, '24 - 10 enviadas - 5 de reserva');
    assert.equal(b.enviar, 9, 'sin máxima, todo lo libre');
    assert.deepEqual([f.enviar, f.reserva, f.quedan], [19, 5, 5]);
    // La barra hereda las operaciones de Minería y no llega a la reserva.
    const barra = linea(v, BARRA, 'A Gemela');
    assert.equal(barra.estado, 'nada');
    assert.equal(barra.motivo, 'sin_disponible');
    assert.equal(fila(v, ANILLO), undefined, 'como TSM, solo lo que está en las bolsas');
    assert.deepEqual(v.destinatarios.map((d) => [d.nombre, d.objetos, d.unidades]), [[ALT, 1, 10], [ALT2, 1, 9]]);
    assert.equal(v.totales.unidades, 19);
    assert.equal(v.requisitos.ejecutable, false);
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('reponer al destinatario descuenta lo que ya tiene; lo no visto convierte la cantidad en un tope', () => {
  const m = maquina();
  try {
    grupos(m);
    m.lua(`local O = SnetForever.Operaciones
      assert(O.poner("correo", "A Gemela", "reponerDestino", true))
      assert(O.poner("correo", "A Gemela", "fuentesReponer", {"banco"}))`);
    inventario(m, { bolsas: { [MENA]: 3 }, banco: { [MENA]: 2 }, correo: { [MENA]: 1 } });
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: false });
    let v = vista(m);
    let a = linea(v, MENA, 'A Gemela');
    assert.equal(a.enDestino, 6, 'bolsas + correo + banco del destinatario');
    assert.deepEqual(a.sinContar, ['subastasAlters'], 'sus subastas no las ve el addon');
    assert.equal(a.enviar, 4, 'min(15, 10 - 6)');
    assert.equal(a.tope, true);
    assert.equal(linea(v, MENA, 'A Tercera').aprox, true, 'la siguiente depende del tope de la anterior');
    assert.equal(linea(v, MENA, 'A Tercera').dependeDe, 'A Gemela');
    // Buzón sin abrir: no se toma por vacío.
    inventario(m, { bolsas: { [MENA]: 3 }, banco: { [MENA]: 2 }, correo: null });
    a = linea(vista(m), MENA, 'A Gemela');
    assert.deepEqual(a.sinContar, ['correo', 'subastasAlters']);
    assert.equal(a.enviar, 5);
    m.lua(`SnetForeverCuenta.comercio.inventario.pj["${ALT}-Normal"].bolsas = nil`);
    a = linea(vista(m), MENA, 'A Gemela');
    assert.deepEqual(a.sinContar, ['bolsas', 'correo', 'subastasAlters']);
    assert.equal(a.enDestino, 2, 'el banco ya visto cuenta aunque falten las bolsas');
    assert.equal(a.enviar, 8);
    // Ya tiene la máxima.
    inventario(m, { bolsas: { [MENA]: 12 } });
    v = vista(m);
    a = linea(v, MENA, 'A Gemela');
    assert.equal(a.estado, 'nada');
    assert.equal(a.motivo, 'repuesto');
    assert.equal(linea(v, MENA, 'A Tercera').enviar, 15, 'lo que no se envía a una queda para la siguiente: 20 - 5');
    // Un personaje sin ficha: cuenta 0 y lo dice.
    m.lua(`SnetForeverCuenta.comercio.inventario.pj["${ALT}-Normal"] = nil
      SnetForever.InventarioCuenta.olvidarOrden()`);
    a = linea(vista(m), MENA, 'A Gemela');
    assert.deepEqual(a.sinContar, ['personaje', 'subastasAlters']);
    assert.equal(a.enviar, 10);
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('una operación ignorada o sin destinatario deja paso a la siguiente; una fórmula sin valor la salta', () => {
  const m = maquina();
  try {
    grupos(m);
    inventario(m);
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: false });
    m.lua('SnetForeverCuenta.comercio.v2.operaciones.correo["A Gemela"].ignorarPersonajes = {["Prueba - Normal"] = true}');
    let v = vista(m);
    assert.equal(linea(v, MENA, 'A Gemela').motivo, 'ignorada');
    assert.equal(linea(v, MENA, 'A Tercera').enviar, 18, 'la ignorada no reserva nada: 20 - 2');
    m.lua(`SnetForeverCuenta.comercio.v2.operaciones.correo["A Gemela"].ignorarPersonajes = {}
      assert(SnetForever.Operaciones.poner("correo", "A Gemela", "destinatario", ""))`);
    v = vista(m);
    assert.equal(linea(v, MENA, 'A Gemela').motivo, 'sin_destinatario');
    assert.equal(linea(v, MENA, 'A Tercera').enviar, 18);
    m.lua(`assert(SnetForever.Operaciones.poner("correo", "A Gemela", "destinatario", "${ALT}"))
      assert(SnetForever.Operaciones.poner("correo", "A Gemela", "cantidadMaxima", "snfmercado"))`);
    v = vista(m);
    let a = linea(v, MENA, 'A Gemela');
    assert.equal(a.estado, 'apartada');
    assert.equal(a.motivo, 'formula', 'una fórmula sin valor no cuenta como cero');
    assert.equal(a.detalle, 'A Gemela · cantidadMaxima');
    assert.equal(linea(v, MENA, 'A Tercera').reservaTotal, 2, 'la saltada tampoco reserva');
    m.lua(`assert(SnetForever.Operaciones.poner("correo", "A Gemela", "cantidadMaxima", "0"))`);
    a = linea(vista(m), MENA, 'A Gemela');
    assert.equal(a.motivo, 'formula', 'la máxima va de 1 a 50.000, como en TSM');
    m.lua(`assert(SnetForever.Operaciones.poner("correo", "A Gemela", "cantidadMaxima", "10"))
      assert(SnetForever.Operaciones.poner("correo", "A Gemela", "conservar", "60000"))`);
    a = linea(vista(m), MENA, 'A Gemela');
    assert.equal(a.detalle, 'A Gemela · conservar');
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('una reposición que depende de otra cantidad incierta se muestra aproximada', () => {
  const m = maquina();
  try {
    grupos(m);
    inventario(m);
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: false });
    m.lua(`local O = SnetForever.Operaciones
      assert(O.poner("correo", "A Gemela", "reponerDestino", true))
      assert(O.poner("correo", "A Tercera", "limitarCantidad", true))
      assert(O.poner("correo", "A Tercera", "cantidadMaxima", "15"))
      assert(O.poner("correo", "A Tercera", "reponerDestino", true))
      SnetForever.UICorreo.abrir()`);
    const columnas = m.lua(`local U = SnetForever.UICorreo
      local function texto(pestana, clave, fila)
        for _, columna in ipairs(U.columnas(pestana)) do
          if columna.clave == clave then return columna.valor(fila) end
        end
      end
      local envio, destinatario
      for _, l in ipairs(U.vista.lineas) do
        if l.destinatario == "${ALT2}" then envio = l end
      end
      for _, d in ipairs(U.vista.destinatarios) do
        if d.nombre == "${ALT2}" then destinatario = d end
      end
      return {envio = texto("enviar", "enviar", envio),
        destino = texto("destinatarios", "unidades", destinatario), motivo = U.motivo(envio)}`);
    assert.equal(columnas.envio, '≈5');
    assert.equal(columnas.destino, '≈5');
    assert.match(columnas.motivo, /depende de A Gemela/);
    assert.match(m.lua('return SnetForever.UICorreo.marco.estado:GetText()'), /≈15 unidades/);
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('el destinatario tú reserva sin enviar; uno que no es tuyo no se enseña ni se recomienda, pero se descuenta', () => {
  const m = maquina();
  try {
    grupos(m);
    inventario(m);
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: false });
    // La primera operación apunta al personaje de ahora con una máxima: TSM la guarda para ti.
    m.lua(`assert(SnetForever.Operaciones.poner("correo", "A Gemela", "destinatario", "Prueba"))
      assert(SnetForever.Operaciones.poner("correo", "A Gemela", "conservar", "0"))`);
    let v = vista(m);
    let a = linea(v, MENA, 'A Gemela');
    assert.deepEqual([a.destino, a.estado, a.reserva], ['yo', 'reserva', 10]);
    assert.equal(linea(v, MENA, 'A Tercera').reservaTotal, 10, 'la reserva para ti y la otra no se suman: la mayor');
    assert.equal(linea(v, MENA, 'A Tercera').enviar, 10);
    // Un nombre que no está entre tus personajes.
    m.lua('assert(SnetForever.Operaciones.poner("correo", "A Gemela", "destinatario", "Desconocida"))');
    v = vista(m);
    a = linea(v, MENA, 'A Gemela');
    assert.deepEqual([a.destino, a.destinatario, a.estado, a.motivo, a.enviar], ['ajeno', undefined, 'apartada', 'no_propio', 10]);
    assert.equal(JSON.stringify(v).includes('Desconocida'), false, 'el nombre de otro jugador no sale en la vista');
    assert.equal(linea(v, MENA, 'A Tercera').enviar, 8, 'TSM le enviaría 10: se descuentan para las de después (20 - 10 - 2)');
    assert.deepEqual(v.destinatarios.map((d) => d.nombre), [ALT2]);
    // Otro reino.
    m.lua(`assert(SnetForever.Operaciones.poner("correo", "A Gemela", "destinatario", "${ALT}-Lejano"))`);
    a = linea(vista(m), MENA, 'A Gemela');
    assert.deepEqual([a.destino, a.motivo], ['otro_reino', 'otro_reino']);
    // Con el nombre y nuestro reino sí vale, sin mirar mayúsculas.
    m.lua(`assert(SnetForever.Operaciones.poner("correo", "A Gemela", "destinatario", "${ALT.toLowerCase()}-Normal"))`);
    a = linea(vista(m), MENA, 'A Gemela');
    assert.deepEqual([a.destino, a.destinatario, a.estado], ['propio', ALT, 'enviar']);
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('lo ligado no se envía; un ligado desconocido o una variante no se dan por buenos', () => {
  const m = maquina();
  try {
    grupos(m);
    inventario(m);
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: true });
    let f = fila(vista(m), MENA);
    assert.deepEqual([f.estado, f.motivo, f.ligados, f.enviables], ['nada', 'ligado', 20, 0]);
    m.bolsa(0, 2, { id: MENA, n: 8, ligado: false });
    f = fila(vista(m), MENA);
    assert.equal(f.enviables, 8);
    assert.equal(f.reparto[0].enviar, 3, '8 - 5 de reserva');
    m.bolsa(0, 3, { id: MENA, n: 4 });
    m.lua('local orig = C_Container.GetContainerItemInfo; C_Container.GetContainerItemInfo = function(b, h) local i = orig(b, h); if i and h == 3 then i.isBound = nil end return i end');
    f = fila(vista(m), MENA);
    assert.deepEqual([f.estado, f.motivo, f.detalle], ['incierta', 'ligado_desconocido', '4']);
    m.bolsa(0, 3, undefined);
    // Una variante en el árbol: el objeto base no cuenta los huecos con sufijo, y la variante se aparta.
    m.lua(`assert(SnetForever.Arbol.poner("i:${MENA}:0:0:0:0:0:7", "Minería"))`);
    m.bolsa(0, 4, { id: MENA, n: 6, ligado: false, enlace: `|cffffffff|Hitem:${MENA}::::::7::::::|h[Mena]|h|r` });
    const v = vista(m);
    f = v.filas.find((x) => x.clave === `Minería|i:${MENA}`);
    assert.equal(f.enviables, 8, 'los 6 de la variante no son del objeto base');
    assert.equal(f.variantesApartadas, true);
    assert.equal(v.filas.find((x) => x.clave === `Minería|i:${MENA}:0:0:0:0:0:7`).motivo, 'variante');
    m.lua('local orig = C_Container.GetContainerItemInfo; C_Container.GetContainerItemInfo = function(b, h) local i = orig(b, h); if i and h == 4 then i.hyperlink = nil end return i end');
    f = vista(m).filas.find((x) => x.clave === `Minería|i:${MENA}`);
    assert.deepEqual([f.estado, f.motivo, f.detalle], ['incierta', 'variante_desconocida', '6']);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('la ventana se abre con /snet c correo, enseña las dos pestañas, se pausa en combate y no actúa', () => {
  const m = maquina();
  try {
    grupos(m);
    inventario(m);
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: false });
    assert.equal(m.lua(`local v = ${C}.vistaPrevia(); return (${C}.vigente(v))`), true);
    m.lua(`VISTA = ${C}.vistaPrevia()`);
    m.bolsa(0, 1, { id: MENA, n: 12, ligado: false });
    assert.equal(m.lua(`local ok, motivo = ${C}.vigente(VISTA); return motivo`), 'cambio');
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: false });
    m.lua('SlashCmdList.SNET("c correo")');
    assert.equal(m.lua('return SnetForever.UICorreo.estaAbierta()'), true);
    const textoMotivo = m.lua(`for _, l in ipairs(SnetForever.UICorreo.vista.lineas) do
      if l.operacion == "A Gemela" then return SnetForever.UICorreo.motivo(l) end end`);
    assert.match(textoMotivo, /enviar/i);
    assert.equal(m.lua(`for _, l in ipairs(SnetForever.UICorreo.vista.lineas) do
      if l.operacion == "A Gemela" then return SnetForever.UICorreo.destinatario(l) end end`), ALT);
    assert.match(m.lua('return SnetForever.UICorreo.marco.estado:GetText()'), /destinatarios/);
    m.lua('SnetForever.UICorreo.marco.pestanas.pestanas[2]:Click("LeftButton")');
    assert.equal(m.lua('return SnetForever.UICorreo.marco.tablas.destinatarios:IsShown()'), true);
    m.lua('BANCO.jugador.enCombate = true');
    m.lua('SnetForever.UICorreo.refrescar(true)');
    assert.match(m.lua('return SnetForever.UICorreo.marco.estado:GetText()'), /combate/i);
    m.lua('BANCO.jugador.enCombate = false');
    // Abrir y cerrar el buzón refresca la vista sin tocar nada del buzón.
    m.disparar('MAIL_SHOW');
    m.avanzar(0.5);
    m.disparar('MAIL_CLOSED');
    m.lua('SlashCmdList.SNET("trade mailing")');
    assert.equal(m.lua('return SnetForever.UICorreo.estaAbierta()'), false, 'la orden en inglés la cierra');
    nadaEnElJuego(m);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('el código de Correo no nombra ninguna función de correo o de contenedores que actúe', () => {
  const raiz = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'addons', 'SnetForever_Comercio');
  for (const archivo of ['comercio/correo.lua', 'ui/correo.lua']) {
    const codigo = readFileSync(join(raiz, archivo), 'utf8').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    for (const api of [...PROHIBIDAS, 'SendMailNameEditBox', 'SendMailSubjectEditBox', 'SendMailMoney', 'OpenMail']) {
      assert.equal(new RegExp(`\\b${api}\\b`).test(codigo), false, `${archivo} nombra ${api}`);
    }
  }
});

test('la interfaz diferencia las bolsas vacías de un hueco o bolsas sin datos', () => {
  const m = maquina();
  try {
    grupos(m);
    m.huecos(0, 6);
    m.lua('SnetForever.UICorreo.abrir()');
    const texto = () => m.lua('return SnetForever.UICorreo.marco.estado:GetText()');
    assert.match(texto(), /Ningún objeto/);
    m.bolsa(0, 1, {id: MENA, n: 20, ligado: false});
    m.lua('C_Container.GetContainerItemInfo = function() return nil end; SnetForever.UICorreo.refrescar()');
    assert.match(texto(), /1 huecos de las bolsas sin leer/);
    m.lua('C_Container.GetContainerNumSlots = function() return nil end; SnetForever.UICorreo.refrescar()');
    assert.match(texto(), /no deja leer las bolsas/);
    sinErrores(m);
  } finally { m.cerrar(); }
});

test('dos operaciones al mismo destinatario suman en su pestaña, y la vista se recalcula igual sin cambios', () => {
  const m = maquina();
  try {
    grupos(m);
    inventario(m);
    m.lua(`assert(SnetForever.Operaciones.poner("correo", "A Tercera", "destinatario", "${ALT}"))`);
    m.bolsa(0, 1, { id: MENA, n: 20, ligado: false });
    m.bolsa(0, 2, { id: BARRA, n: 12, ligado: false });
    const v = vista(m);
    assert.deepEqual(v.destinatarios.map((d) => [d.nombre, d.objetos, d.unidades]), [[ALT, 2, 22]],
      'mena 10 + 5 y barra 7 + 0, con la reserva mayor (5) en cada objeto');
    assert.equal(v.totales.destinatarios, 1);
    assert.equal(m.lua(`return (${C}.vigente(${C}.vistaPrevia()))`), true);
    sinErrores(m);
  } finally { m.cerrar(); }
});
