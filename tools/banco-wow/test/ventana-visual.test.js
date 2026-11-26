// Tarea D3, A6 (plano 6-diseno-ventana.md): comprobación visual de la ventana con el banco. Recorre SnetForeverVentana
// (y sus menús) en varios estados y comprueba que:
//   * ningún FontString visible se sale de su tarjeta (ni a lo ancho ni a lo alto);
//   * las tarjetas no se solapan (cabecera, lista, pie, tarjetas del bloque activo con su pestaña, tarjetas de la
//     lista entre sí y dentro de la lista);
//   * todas las texturas (y los iconos |T…|t de los textos) están en la lista blanca de b.4 y de la ventana.
// El banco no tiene motor de disposición: la posición de cada región se calcula aquí a partir de sus anclas (SetPoint)
// y de su tamaño, con la escala 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGuideDetails as nuevaMaquina, sinErrores, guiaDePrueba } from './ayuda.js';
import { aLua } from '../src/lua-js.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DATOS_LATERALES = [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'laterales-mini.lua')];
const DATOS_AVISOS = [join(FIXTURES, 'rutas-mini.lua'), join(FIXTURES, 'misiones-mini.lua'), join(FIXTURES, 'avisos-mini.lua')];
const CLAVE = 'Prueba\\01-60 Guía de prueba';
const OSO = 'Cadenas de clase (H)\\druida-oso';
const M = 'SnetForever.Ventana.marcos';

// Lista blanca: las texturas de la tabla b.4 y las de la ventana (todas de Blizzard y vistas en addons de Forever).
const LISTA_BLANCA = new Set([
  'Interface\\AddOns\\SnetForever\\recursos\\forge-plate',
  'Interface\\AddOns\\SnetForever\\recursos\\forge-controls',
  // Fondos, bordes y resaltes dibujados por nosotros.
  'Interface\\Buttons\\WHITE8X8',
  'Interface\\Buttons\\ButtonHilight-Square',
  // Ventana: engranaje, casillas, emblema, barra de desplazamiento y menús.
  'Interface\\Buttons\\UI-OptionsButton',
  'Interface\\CharacterFrame\\TempPortraitAlphaMask',
  'Interface\\Buttons\\UI-CheckBox-Check',
  'Interface\\TargetingFrame\\UI-Classes-Circles',
  'Interface\\Buttons\\UI-ScrollBar-ScrollUpButton-Up',
  'Interface\\Buttons\\UI-ScrollBar-ScrollDownButton-Up',
  'Interface\\Buttons\\Arrow-Down-Up',
  'Interface\\ChatFrame\\ChatFrameExpandArrow',
  // b.4: iconos por tipo de elemento.
  'Interface\\GossipFrame\\AvailableQuestIcon',
  'Interface\\GossipFrame\\ActiveQuestIcon',
  'Interface\\GossipFrame\\BattleMasterGossipIcon',
  'Interface\\GossipFrame\\VendorGossipIcon',
  'Interface\\GossipFrame\\HealerGossipIcon',
  'Interface\\GossipFrame\\TrainerGossipIcon',
  'Interface\\WorldMap\\ChatBubble_64Grey',
  'Interface\\Icons\\INV_Misc_Map_01',
  'Interface\\Icons\\INV_Misc_Book_09',
  'Interface\\Icons\\INV_Misc_QuestionMark',
  'Interface\\Minimap\\Tracking\\Innkeeper',
  'Interface\\Minimap\\Tracking\\FlightMaster',
  'Interface\\Minimap\\Tracking\\StableMaster',
  'Interface\\RaidFrame\\ReadyCheck-Ready',
  'Interface\\RaidFrame\\ReadyCheck-NotReady',
  'Interface\\RaidFrame\\ReadyCheck-Waiting',
].map((r) => r.toLowerCase()));

// Ruta normalizada para compararla: minúsculas, barras invertidas y sin «.blp».
const normal = (r) => r.toLowerCase().replace(/\//g, '\\').replace(/\.blp$/, '');

// Recoge en Lua las medidas de la ventana: tarjetas (con su rectángulo l, r, b, t), los textos visibles de cada una y
// todas las texturas de la ventana y de sus menús.
const MEDIR = `(function()
  local W, H = UIParent:GetWidth(), UIParent:GetHeight()
  local cache = {}
  local function rect(o)
    if o == UIParent then return {0, W, 0, H} end
    if cache[o] then return cache[o] end
    local w, h = o:GetWidth() or 0, o:GetHeight() or 0
    if o:IsObjectType("FontString") then
      if h == 0 then h = o:GetStringHeight() end
      if w == 0 then w = o:GetUnboundedStringWidth() end
    end
    local L, R, B, T, CX, CY
    for i = 1, o:GetNumPoints() do
      local p, rel, rp, x, y = o:GetPoint(i)
      local q = rect(rel or o:GetParent())
      local px = string.find(rp, "LEFT") and q[1] or (string.find(rp, "RIGHT") and q[2] or (q[1] + q[2]) / 2)
      local py = string.find(rp, "TOP") and q[4] or (string.find(rp, "BOTTOM") and q[3] or (q[3] + q[4]) / 2)
      px, py = px + x, py + y
      if string.find(p, "LEFT") then L = px elseif string.find(p, "RIGHT") then R = px else CX = px end
      if string.find(p, "TOP") then T = py elseif string.find(p, "BOTTOM") then B = py else CY = py end
    end
    if L and not R then R = L + w elseif R and not L then L = R - w elseif not L then L = (CX or 0) - w / 2; R = (CX or 0) + w / 2 end
    if T and not B then B = T - h elseif B and not T then T = B + h elseif not T then B = (CY or 0) - h / 2; T = (CY or 0) + h / 2 end
    cache[o] = {L, R, B, T}
    return cache[o]
  end

  local m = ${M}
  -- Tarjetas de primer nivel (no se solapan entre sí) y tarjetas de la lista (no se solapan y van dentro de ella).
  local nivel, lista, todas, nombres = {}, {}, {}, {}
  local function tarjeta(t, nombre, grupo)
    if t and t:IsVisible() then
      grupo[#grupo + 1] = t
      todas[t] = nombre
      nombres[#nombres + 1] = nombre
    end
  end
  tarjeta(m.cabecera, "cabecera", nivel)
  tarjeta(m.lista, "lista", nivel)
  tarjeta(m.pie, "pie", nivel)
  tarjeta(m.aviso, "aviso", nivel)
  tarjeta(m.estado, "estado", nivel)
  for k, paso in ipairs(m.pasos) do
    tarjeta(paso.marco, "paso " .. k, nivel)
    if paso.pestana:IsVisible() then todas[paso.pestana] = "pestaña " .. k end
  end
  for k, t in ipairs(m.tarjetasLista) do tarjeta(t, "lista " .. k, lista) end

  -- Rectángulo de una tarjeta del bloque contando su pestaña.
  local function conPestana(t)
    local r = rect(t)
    if t.pestana and t.pestana:IsVisible() then
      local p = rect(t.pestana)
      return {math.min(r[1], p[1]), math.max(r[2], p[2]), math.min(r[3], p[3]), math.max(r[4], p[4])}
    end
    return r
  end
  local salida = {nivel = {}, lista = {}, textos = {}, texturas = {}, iconos = {}, pantalla = {0, W, 0, H},
    iconosObjeto = {}}
  for _, icono in pairs(BANCO.iconosItem) do salida.iconosObjeto[#salida.iconosObjeto + 1] = tostring(icono) end
  for _, t in ipairs(nivel) do salida.nivel[#salida.nivel + 1] = {nombre = todas[t], r = conPestana(t)} end
  for _, t in ipairs(lista) do salida.lista[#salida.lista + 1] = {nombre = todas[t], r = rect(t)} end
  salida.rectLista = m.lista:IsVisible() and rect(m.lista) or nil

  -- Textos visibles de cada tarjeta (sin entrar en las tarjetas hijas, que se miran por su cuenta).
  local function textosDe(dueno, o)
    for _, r in ipairs({o:GetRegions()}) do
      if r:IsObjectType("FontString") and r:IsVisible() and (r:GetText() or "") ~= "" then
        local q = rect(r)
        salida.textos[#salida.textos + 1] = {tarjeta = todas[dueno], texto = r:GetText(), r = q, t = rect(dueno)}
      end
    end
    for _, h in ipairs({o:GetChildren()}) do
      if h:IsVisible() then
        if todas[h] then textosDe(h, h) else textosDe(dueno, h) end
      end
    end
  end
  for t in pairs(todas) do
    local padre = t:GetParent()
    if not todas[padre] then textosDe(t, t) end
  end

  -- Texturas de la ventana y de sus menús, y los iconos de los textos.
  local function texturas(o)
    for _, r in ipairs({o:GetRegions()}) do
      if r:IsObjectType("Texture") then
        local ruta = r:GetTexture()
        if ruta then salida.texturas[#salida.texturas + 1] = ruta end
      elseif r:IsObjectType("FontString") and r:GetText() then
        for ruta in string.gmatch(r:GetText(), "|T([^:|]+)") do salida.iconos[#salida.iconos + 1] = ruta end
      end
    end
    for _, h in ipairs({o:GetChildren()}) do texturas(h) end
  end
  texturas(SnetForeverVentana)
  texturas(SnetForeverMenuGuias)
  texturas(SnetForeverMenuContexto)
  return salida
end)()`;

const EPS = 0.5;
const solapan = (a, b) => a[0] < b[1] - EPS && b[0] < a[1] - EPS && a[2] < b[3] - EPS && b[2] < a[3] - EPS;
const dentro = (a, b) => a[0] >= b[0] - EPS && a[1] <= b[1] + EPS && a[2] >= b[2] - EPS && a[3] <= b[3] + EPS;

function comprobar(m, etiqueta) {
  const d = m.lua(MEDIR);
  assert.ok(d.nivel.length >= 2, `${etiqueta}: pocas tarjetas (${d.nivel.length})`);
  // Las tarjetas no se solapan.
  for (const grupo of [d.nivel, d.lista]) {
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        assert.ok(!solapan(grupo[i].r, grupo[j].r),
          `${etiqueta}: «${grupo[i].nombre}» ${grupo[i].r} se solapa con «${grupo[j].nombre}» ${grupo[j].r}`);
      }
    }
  }
  // Las tarjetas de la lista van dentro de la lista.
  for (const t of d.lista) assert.ok(dentro(t.r, d.rectLista), `${etiqueta}: «${t.nombre}» ${t.r} se sale de la lista ${d.rectLista}`);
  // Ronda 1: ninguna tarjeta (con su pestaña) se sale de la pantalla.
  for (const t of d.nivel) assert.ok(dentro(t.r, d.pantalla), `${etiqueta}: «${t.nombre}» ${t.r} se sale de la pantalla`);
  // Ningún texto visible se sale de su tarjeta.
  assert.ok(d.textos.length > 3, `${etiqueta}: pocos textos (${d.textos.length})`);
  for (const t of d.textos) {
    assert.ok(t.tarjeta, `${etiqueta}: el texto «${t.texto}» no está en ninguna tarjeta`);
    assert.ok(dentro(t.r, t.t), `${etiqueta}: «${t.texto}» ${t.r} se sale de «${t.tarjeta}» ${t.t}`);
  }
  // Ronda 1: dos textos de la misma tarjeta no se solapan (p. ej. la versión y «Saltados: N» en el pie).
  for (let i = 0; i < d.textos.length; i++) {
    for (let j = i + 1; j < d.textos.length; j++) {
      const a = d.textos[i];
      const b = d.textos[j];
      if (a.tarjeta === b.tarjeta) {
        assert.ok(!solapan(a.r, b.r), `${etiqueta}: en «${a.tarjeta}», «${a.texto}» ${a.r} se solapa con «${b.texto}» ${b.r}`);
      }
    }
  }
  // Texturas en la lista blanca; los iconos de objeto (números de archivo de C_Item.GetItemIconByID) también valen.
  assert.ok(d.texturas.length > 10, `${etiqueta}: pocas texturas`);
  const objetos = new Set(d.iconosObjeto);
  for (const ruta of [...d.texturas, ...d.iconos]) {
    const permitida = LISTA_BLANCA.has(normal(String(ruta))) || objetos.has(String(ruta));
    assert.ok(permitida, `${etiqueta}: textura fuera de la lista blanca: ${ruta}`);
  }
  return d;
}

test('A6: Inicio con el ancho por defecto, el mínimo (220) y el máximo (500), y con el menú y el menú del paso abiertos', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto()); SnetForever.Ventana.crear()');
  comprobar(m, 'Inicio 260');
  for (const ancho of [220, 500]) {
    m.lua(`SnetForever.Ajustes.set("ventana.ancho", ${ancho})`);
    comprobar(m, `Inicio ${ancho}`);
  }
  m.lua('SnetForeverVentana:GetScript("OnMouseUp")(SnetForeverVentana, "RightButton")');
  m.lua(`${M}.pasos[1].marco:Click("RightButton")`);
  m.lua('SnetForever.Ajustes.set("ventana.siguientes", 8)');
  comprobar(m, 'Inicio con menús y 8 siguientes');
  sinErrores(m);
});

test('A6: pegajoso, paso con requisitos, espera, líneas largas y casillas; el bloque encima y debajo del pie', () => {
  const largo = 'Mata a los Rufianes Tótem Siniestro y a los Mercenarios Tótem Siniestro que rondan el campamento del norte';
  const m = nuevaMaquina({ jugador: { nivel: 2 } });
  m.estadoMision(788, { enDiario: true, objetivos: [{ texto: '2/8 Rufián Tótem Siniestro', hecho: 2, pedido: 8, terminado: false }] });
  m.ponerGuia(guiaDePrueba([
    { elementos: [{ t: 'manual', texto: { en: 'x', es: 'Pegajoso que sigue activo' } }], etiquetas: { sticky: true } },
    { elementos: [{ t: 'nota', texto: { en: 'x', es: largo } }, { t: 'complete', q: 788, objetivo: 1 }, { t: 'accept', q: 789 }],
      requisitos: [{ t: 'grupo', n: 3 }] },
    { elementos: [{ t: 'manual', texto: { en: 'x', es: 'Espera' } }], etiquetas: { level: 5 } },
    ...Array.from({ length: 8 }, (_, i) => ({ elementos: [{ t: 'nota', texto: { en: 'x', es: `${largo} (${i})` } }, { t: 'turnin', q: 788 }] })),
  ]));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)}); SnetForever.Ventana.crear()`);
  comprobar(m, 'activo con requisitos');
  m.lua('SnetForever.Motor.marcarHecho(2, 3)');
  comprobar(m, 'con una casilla hecha');
  m.lua('SnetForever.Ajustes.set("ventana.pasoArriba", false)');
  comprobar(m, 'bloque debajo del pie');
  m.lua('SnetForever.Ajustes.set("ventana.pasoArriba", true); SnetForever.Motor.irA(3)');
  comprobar(m, 'paso que espera');
  m.lua('SnetForever.Ajustes.set("ventana.ancho", 220)');
  comprobar(m, 'estrecha');
  sinErrores(m);
});

test('A6: aviso de clase, guía lateral sin verificar con «Volver a…», fin de la guía y sin guía', () => {
  const a = nuevaMaquina({ datos: DATOS_AVISOS, jugador: { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 9 } });
  a.lua('SnetForever.Ventana.crear()');
  a.jugador({ nivel: 10 });
  a.disparar('PLAYER_LEVEL_UP', 10);
  assert.equal(a.lua(`${M}.aviso:IsVisible()`), true);
  comprobar(a, 'aviso de clase');
  const l = nuevaMaquina({ datos: DATOS_LATERALES, jugador: { clase: 'DRUID', raza: 'Tauren', faccion: 'Horde', nivel: 10 } });
  l.lua('SnetForever.Guias.cargar("Prueba (H)\\\\01-02 Inicio"); SnetForever.Ventana.crear()');
  l.lua(`SnetForever.Guias.abrirLateral(${aLua(OSO)}); SnetForever.Motor.irA(2); SnetForever.Ventana.pintar()`);
  assert.equal(l.lua(`${M}.estado.volver:IsVisible()`), true);
  comprobar(l, 'lateral con «Volver a…»');
  l.lua('SnetForever.Motor.saltar(2); SnetForever.Motor.saltar(3)');
  assert.equal(l.lua('SnetForever.Motor.estado().fin'), true);
  comprobar(l, 'fin de la guía con «Volver a…»');
  const v = nuevaMaquina({ jugador: { raza: 'Vulpera' } });
  v.lua('SnetForever.Ventana.crear()');
  comprobar(v, 'sin guía');
  sinErrores(a);
  sinErrores(l);
  sinErrores(v);
});

test('A6 (ronda 1): un icono de objeto con número de archivo, el pie estrecho con «Saltados: N» y el bloque en una pantalla baja', () => {
  const m = nuevaMaquina();
  m.lua('BANCO.iconosItem[159] = 134400');
  m.ponerGuia(guiaDePrueba([
    { elementos: [{ t: 'use', is: [159], texto: { en: 'x', es: 'Usa el agua de manantial' } }] },
    { elementos: [{ t: 'use', is: [159], texto: { en: 'x', es: 'Usa otra vez el agua' } }] },
  ]));
  m.lua(`SnetForever.Guias.cargar(${aLua(CLAVE)}); SnetForever.Ventana.crear()`);
  const d = comprobar(m, 'icono de objeto');
  assert.ok(d.texturas.includes(134400), 'el icono del objeto se pinta como textura');
  assert.ok(d.iconos.includes('134400'), 'y en la lista, dentro del texto');
  // Pie a 220 con «Saltados: N» (es y en).
  m.lua('SnetForever.Motor.saltar(1); SnetForever.Ajustes.set("ventana.ancho", 220)');
  comprobar(m, 'pie estrecho');
  m.lua('SnetForever.Ajustes.set("idioma", "en")');
  comprobar(m, 'pie estrecho en inglés');
  // Pantalla baja y 20 pegajosos: el bloque no cabe ni arriba ni abajo y se recorta sin salirse de la pantalla.
  const p = nuevaMaquina();
  const pasos = [];
  for (let i = 1; i <= 20; i++) pasos.push({ elementos: [{ t: 'manual', texto: { en: 'x', es: `Pegajoso ${i}` } }], etiquetas: { sticky: true } });
  pasos.push({ elementos: [{ t: 'manual', texto: { en: 'x', es: 'El actual' } }] });
  p.ponerGuia(guiaDePrueba(pasos));
  p.lua(`UIParent:SetHeight(500); SnetForever.Guias.cargar(${aLua(CLAVE)}); SnetForever.Ventana.crear()`);
  // Con la ventana en medio de una pantalla de 500 (y la lista llena), arriba y abajo quedan menos del 40 % (200).
  p.lua('SnetForever.Ajustes.set("ventana.siguientes", 8)');
  for (const pos of ['{punto = "LEFT", relPunto = "LEFT", x = 20, y = 0}', '{punto = "LEFT", relPunto = "LEFT", x = 20, y = 30}', '{punto = "LEFT", relPunto = "LEFT", x = 20, y = -30}']) {
    p.lua(`SnetForever.Ajustes.set("ventana.pos", ${pos || 'nil'})`);
    const r = comprobar(p, `pantalla baja ${pos || 'en su sitio'}`);
    assert.ok(r.nivel.some((t) => t.nombre.startsWith('paso')), 'el paso actual sigue');
  }
  sinErrores(m);
  sinErrores(p);
});

test('A6: la comprobación detecta los fallos (texto que se sale, tarjetas que se solapan, textura sin comprobar)', () => {
  const m = nuevaMaquina();
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto()); SnetForever.Ventana.crear()');
  // Un texto más ancho que su tarjeta.
  m.lua(`${M}.pasos[1].lineas[1]:SetWidth(400)`);
  assert.throws(() => comprobar(m, 'texto'), /se sale de «paso 1»/);
  m.lua('SnetForever.Ventana.pintar()');
  // Una tarjeta encima de la cabecera.
  m.lua(`${M}.pasos[1].marco:ClearAllPoints(); ${M}.pasos[1].marco:SetPoint("TOPLEFT", ${M}.cabecera, "TOPLEFT", 0, 0)`);
  assert.throws(() => comprobar(m, 'solape'), /se solapa/);
  m.lua('SnetForever.Ventana.pintar()');
  // Dos textos de una tarjeta encima uno del otro.
  m.lua('SnetForever.Motor.saltar(1)');
  m.lua(`${M}.pie.saltados:ClearAllPoints(); ${M}.pie.saltados:SetPoint("CENTER", ${M}.pie, "CENTER", 0, 0)`);
  assert.throws(() => comprobar(m, 'pie'), /en «pie», .* se solapa/);
  m.lua('SnetForever.Ventana.crear()');
  m.lua(`${M}.pie.saltados:ClearAllPoints(); ${M}.pie.saltados:SetPoint("RIGHT", ${M}.pie, "RIGHT", -4, 0)`);
  // Una textura que no está en la lista.
  m.lua(`${M}.pie:CreateTexture(nil, "ARTWORK"):SetTexture("Interface\\\\AddOns\\\\RXPGuides\\\\Textures\\\\rxp-borders")`);
  assert.throws(() => comprobar(m, 'textura'), /fuera de la lista blanca/);
});

// Lote F: la ruta de la IA se ve como una guía (su guía lateral «ia», con paradas de nombre largo), arriba del bloque y
// debajo del pie, ancha y estrecha. (Sustituye a la de la tarjeta «Ruta de la IA» del lote E1, que ya no existe.)
test('A6, lote F: la ruta de la IA como guía no se solapa ni se sale, arriba y debajo del pie', () => {
  const m = nuevaMaquina({ jugador: { mapa: 1411, x: 50, y: 25 } });
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto()); SnetForever.Ventana.crear()');
  const puntos = Array.from({ length: 7 }, (_, i) => ({ mapa: 1411, x: 52 + i, y: 30, tipo: 'lugar', seguir: true,
    etiqueta: `Parada con un nombre bastante largo para que ocupe dos renglones en la tarjeta ${i + 1}` }));
  m.lua(`SnetForever.Ruta.proponer(${aLua({ titulo: 'Ruta de prueba con título largo', puntos })}); SnetForever.Ruta.aceptar()`);
  assert.equal(m.lua(`${M}.titulo:GetText()`), 'IA: Ruta de prueba con título largo');
  assert.equal(m.lua(`${M}.rutaIA == nil`), true, 'sin tarjeta aparte');
  comprobar(m, 'ruta IA arriba');
  m.lua('SnetForever.Ajustes.set("ventana.ancho", 220)');
  comprobar(m, 'ruta IA estrecha');
  m.lua('SnetForever.Ajustes.set("ventana.pasoArriba", false)');
  comprobar(m, 'ruta IA debajo del pie');
  sinErrores(m);
});
