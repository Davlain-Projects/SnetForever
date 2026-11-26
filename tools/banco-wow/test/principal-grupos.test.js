// Ventana principal, parte 1, Task 16: página «Grupos», panel izquierdo (buscador y árbol de grupos). Se enchufa en la
// ventana con Principal.registrar («grupos», ui/principal/grupos.lua del addon SnetForever_Comercio). Las pruebas que
// necesitan el comercio se saltan en la pasada de solo núcleo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const PANTALLA = { ancho: 2560, alto: 1080 };
const G = 'SnetForever.PrincipalGrupos';
const maquina = (opciones = {}) => nuevaMaquina({ jugador: JUGADOR, pantalla: PANTALLA, ...opciones });
const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));
const aHex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

// Abre la ventana en la pestaña Grupos y prepara ayudas de Lua: fila(clave) busca la fila visible; textos() las que se ven.
const ABRIR = `
  SnetForever.Principal.abrir("grupos")
  local G = SnetForever.PrincipalGrupos
  local A = SnetForever.Arbol
  local function fila(clave)
    for _, f in ipairs(G.arbol.filas) do
      if f:IsShown() and f.clave == clave then return f end
    end
  end
  local function textos()
    local t = {}
    for _, f in ipairs(G.arbol.filas) do
      if f:IsShown() and f.clave ~= nil then t[#t + 1] = {f.clave, f.texto:GetText()} end
    end
    return t
  end
  -- Pone el ratón sobre la fila y dice cuántos botones enseña.
  local function botones(clave)
    local f = fila(clave)
    f:GetScript("OnEnter")(f)
    local n = 0
    for _, b in ipairs(f.botones) do if b:IsShown() then n = n + 1 end end
    return f, n
  end`;

test('la página Grupos enseña el buscador y el árbol con Grupo Base arriba', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    A.crear("", "Hierbas")
    A.crear("Hierbas", "Raras")
    A.crear("", "Armas")
    G.arbol:refrescar()
    local p = G.panel
    return {
      pestana = SnetForever.Principal.pestana(),
      ancho = p:GetWidth(), padreEsPagina = p:GetParent() == SnetForever.Principal.marcos.paginas.grupos,
      lupa = G.campo.iconoLupa ~= nil, ph = G.campo.marcador:GetText(),
      base = textos()[1],
      segunda = textos()[2], tercera = textos()[3],
      arbolDebajo = G.arbol:GetTop() <= G.campo:GetBottom() + 0.5,
      arbolDentro = G.arbol:GetLeft() >= p:GetLeft() and G.arbol:GetRight() <= p:GetRight() + 0.5,
      alto = G.arbol:GetHeight() > 400,
      exportar = G.botonExportar ~= nil, importar = G.botonImportar ~= nil,
      menuOculto = not G.menuImportar:IsShown(),
    }
  end)()`);
  assert.equal(r.pestana, 'grupos');
  assert.equal(r.ancho, 273);
  assert.equal(r.padreEsPagina, true);
  assert.equal(r.lupa, true);
  assert.equal(r.ph, 'Buscar en grupos');
  assert.deepEqual(r.base, ['', 'Grupo Base']);
  assert.deepEqual(r.segunda, ['Armas', 'Armas']);
  assert.deepEqual(r.tercera, ['Hierbas', 'Hierbas']);
  assert.equal(r.arbolDebajo, true);
  assert.equal(r.arbolDentro, true);
  assert.equal(r.alto, true);
  assert.equal(r.exportar, true);
  assert.equal(r.importar, true);
  assert.equal(r.menuOculto, true);
  sinErrores(m);
});

test('el árbol de Grupos conserva su sangría (margen 8, 12 por nivel): el texto del nivel 1 a 36 px y el del 2 a 48', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Raras")
    G.arbol:refrescar(); G.arbol:elegir("Hierbas\`Raras")
    local function x(c) local _, _, _, px = fila(c).texto:GetPoint(1); return px end
    return {x("Hierbas"), x("Hierbas\`Raras")}
  end)()`);
  assert.deepEqual(r, [36, 48]);
  sinErrores(m);
});

test('exportar y el menú de importar llaman a los ganchos (el de TSM, sin TSM activo, dice cómo activarlo)', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    local llamadas = {}
    local originales = {G.exportar, G.importarTexto, G.importarTSM}
    -- Los ganchos se buscan al pulsar: las Tasks 19 y 24 los sustituyen sin tocar la página.
    G.exportar = function() llamadas[#llamadas + 1] = "exportar" end
    G.importarTexto = function() llamadas[#llamadas + 1] = "texto" end
    G.importarTSM = function() llamadas[#llamadas + 1] = "tsm" end
    G.botonExportar:Click("LeftButton")
    G.botonImportar:Click("LeftButton")
    local abierto = G.menuImportar:IsShown()
    local t1, t2 = G.menuImportar.filaTexto.texto:GetText(), G.menuImportar.filaTSM.texto:GetText()
    G.menuImportar.filaTexto:Click("LeftButton")
    local cerroTexto = not G.menuImportar:IsShown()
    G.botonImportar:Click("LeftButton")
    G.menuImportar.filaTSM:Click("LeftButton")
    G.botonImportar:Click("LeftButton")
    G.botonImportar:Click("LeftButton") -- un segundo clic lo cierra
    local cerroOtra = not G.menuImportar:IsShown()
    G.exportar, G.importarTexto, G.importarTSM = originales[1], originales[2], originales[3]
    return {llamadas = llamadas, abierto = abierto, t1 = t1, t2 = t2, cerroTexto = cerroTexto, cerroOtra = cerroOtra}
  end)()`);
  assert.deepEqual(r.llamadas, ['exportar', 'texto', 'tsm']);
  assert.equal(r.abierto, true);
  assert.equal(r.t1, 'Importar texto');
  assert.equal(r.t2, 'Importar de TSM');
  assert.equal(r.cerroTexto, true);
  assert.equal(r.cerroOtra, true);
  // El gancho de TSM (Task 25), sin TSM activo, dice en una línea del chat cómo activarlo (test/importar-tsm.test.js prueba
  // la ventanita); exportar e importar texto ya abren la suya (Task 19).
  const antes = impresos(m).length;
  m.lua(`${G}.importarTSM()`);
  const dichas = impresos(m).slice(antes);
  assert.equal(dichas.length, 1);
  assert.equal(dichas[0], m.lua('select(2, SnetForever.ImportarTSM.disponible())'));
  sinErrores(m);
});

test('⊕ crea un subgrupo con el nombre escrito; 🗑 pide confirmar y lo borra; Grupo Base no tiene 🗑', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    A.crear("", "Hierbas")
    G.arbol:refrescar()
    local out = {}
    -- Grupo Base: solo ⊕. Un grupo normal: ⊕ y 🗑.
    local _, nBase = botones("")
    local _, nHierbas = botones("Hierbas")
    out.nBase, out.nHierbas = nBase, nHierbas
    -- ⊕ sobre Hierbas: sale el campo en la propia fila nueva.
    local f = fila("Hierbas")
    f.botones[1]:Click("LeftButton")
    out.campoVisible = G.campoNuevo:IsShown()
    local nueva = fila(G.CLAVE_NUEVO)
    out.enFila = nueva ~= nil and G.campoNuevo:GetParent() == G.arbol
    out.antes = A.existe("Hierbas\`Raras")
    G.campoNuevo:SetText("Raras")
    G.campoNuevo:GetScript("OnEnterPressed")(G.campoNuevo)
    out.creado = A.existe("Hierbas\`Raras")
    out.campoCerrado = not G.campoNuevo:IsShown()
    out.elegida = G.arbol:elegida()
    out.filas = textos()
    -- Un nombre repetido o con el separador no crea nada y deja el campo abierto.
    f = fila("Hierbas"); f:GetScript("OnEnter")(f); f.botones[1]:Click("LeftButton")
    G.campoNuevo:SetText("Raras")
    G.campoNuevo:GetScript("OnEnterPressed")(G.campoNuevo)
    out.repetidoSigue = G.campoNuevo:IsShown()
    out.contador = #A.hijos("Hierbas")
    G.campoNuevo:SetText("A\`B")
    G.campoNuevo:GetScript("OnEnterPressed")(G.campoNuevo)
    out.separadorSigue = G.campoNuevo:IsShown()
    out.contador2 = #A.hijos("Hierbas")
    -- Escape lo cierra sin crear.
    G.campoNuevo:SetText("Otra")
    G.campoNuevo:GetScript("OnEscapePressed")(G.campoNuevo)
    G.campoNuevo:GetScript("OnEditFocusLost")(G.campoNuevo)
    out.escape = {cerrado = not G.campoNuevo:IsShown(), hijos = #A.hijos("Hierbas")}
    return out
  end)()`);
  assert.equal(r.nBase, 1, 'Grupo Base solo lleva ⊕');
  assert.equal(r.nHierbas, 2, 'un grupo lleva ⊕ y 🗑');
  assert.equal(r.campoVisible, true);
  assert.equal(r.enFila, true, 'el campo está sobre la fila nueva');
  assert.equal(r.antes, false);
  assert.equal(r.creado, true);
  assert.equal(r.campoCerrado, true);
  assert.equal(r.elegida, 'Hierbas`Raras');
  assert.deepEqual(r.filas.map((x) => x[1]), ['Grupo Base', 'Hierbas', 'Raras']);
  assert.equal(r.repetidoSigue, true);
  assert.equal(r.contador, 1);
  assert.equal(r.separadorSigue, true);
  assert.equal(r.contador2, 1);
  assert.deepEqual(r.escape, { cerrado: true, hijos: 1 });

  // 🗑: pide confirmar; Cancelar no borra; Borrar manda el grupo a la papelera y sus objetos al Grupo Base.
  const b = m.lua(`(function()
    ${ABRIR}
    local out = {}
    A.poner("i:1", "Hierbas")
    local f = fila("Hierbas")
    f:GetScript("OnEnter")(f)
    f.botones[2]:Click("LeftButton")
    local c = G.confirmacion
    out.visible = c:IsShown()
    out.texto = c.texto:GetText()
    out.siguePresente = A.existe("Hierbas")
    c.botonCancelar:Click("LeftButton")
    out.cancelado = {cerrada = not c:IsShown(), existe = A.existe("Hierbas")}
    f = fila("Hierbas"); f:GetScript("OnEnter")(f); f.botones[2]:Click("LeftButton")
    c.botonBorrar:Click("LeftButton")
    out.borrado = {cerrada = not c:IsShown(), existe = A.existe("Hierbas"), sub = A.existe("Hierbas\`Raras"),
      objeto = A.objeto("i:1"), papelera = #A.papelera(), elegida = G.arbol:elegida(), filas = textos()}
    return out
  end)()`);
  assert.equal(b.visible, true);
  assert.match(b.texto, /Hierbas/);
  assert.equal(b.siguePresente, true);
  assert.deepEqual(b.cancelado, { cerrada: true, existe: true });
  assert.equal(b.borrado.cerrada, true);
  assert.equal(b.borrado.existe, false);
  assert.equal(b.borrado.sub, false);
  assert.equal(b.borrado.objeto, '');
  assert.equal(b.borrado.papelera, 1);
  assert.equal(b.borrado.elegida, '');
  assert.deepEqual(b.borrado.filas.map((x) => x[1]), ['Grupo Base']);
  sinErrores(m);
});

test('arrastrar mueve el grupo', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    A.crear("", "Hierbas")
    A.crear("", "Armas")
    A.crear("Armas", "Espadas")
    G.arbol:refrescar()
    local out = {}
    local a = G.arbol
    local s = a:GetEffectiveScale()
    local function arrastrar(origen, destino)
      local f, d = fila(origen), fila(destino)
      f:GetScript("OnDragStart")(f)
      BANCO.cursor = {x = (a:GetLeft() + 40) * s, y = ((d:GetTop() + d:GetBottom()) / 2) * s}
      f:GetScript("OnDragStop")(f)
    end
    a:abrir("Armas", true)
    -- Hierbas sobre Armas: pasa a Armas\`Hierbas.
    arrastrar("Hierbas", "Armas")
    out.movido = {A.existe("Armas\`Hierbas"), A.existe("Hierbas")}
    out.elegida = a:elegida()
    -- Un grupo sobre un descendante se rechaza (y no se rompe nada).
    a:abrir("Armas", true)
    arrastrar("Armas", "Armas\`Espadas")
    out.sobreHijo = {A.existe("Armas"), A.existe("Armas\`Espadas"), A.existe("Espadas")}
    -- Sobre Grupo Base sube a primer nivel.
    arrastrar("Armas\`Espadas", "")
    out.aBase = {A.existe("Espadas"), A.existe("Armas\`Espadas")}
    -- Grupo Base no se mueve.
    arrastrar("", "Armas")
    out.baseQuieto = A.existe("Armas") and A.existe("Espadas")
    return out
  end)()`);
  assert.deepEqual(r.movido, [true, false]);
  assert.equal(r.elegida, 'Armas`Hierbas');
  assert.deepEqual(r.sobreHijo, [true, true, false]);
  assert.deepEqual(r.aBase, [true, false]);
  assert.equal(r.baseQuieto, true);
  // El rechazo (un grupo dentro de su propio hijo) dice una línea en el chat.
  assert.ok(impresos(m).includes(m.lua('SnetForever.L.t("PRINCIPAL_GRUPOS_NO_MOVER")')));
  sinErrores(m);
});

test('buscar filtra el árbol', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Raras"); A.crear("", "Armas"); A.crear("Armas", "Espadas")
    G.arbol:refrescar()
    local out = {}
    local function buscar(t)
      G.campo:SetText(t)
      G.campo:GetScript("OnTextChanged")(G.campo, true)
    end
    buscar("espa")
    out.filtrado = textos()
    buscar("")
    out.completo = textos()
    buscar("HIERBÁS") -- sin fijarse en mayúsculas ni tildes
    out.tildes = textos()
    buscar("zzz")
    out.nada = G.arbol:visibles()
    return out
  end)()`);
  assert.deepEqual(r.filtrado.map((x) => x[1]), ['Grupo Base', 'Armas', 'Espadas']);
  assert.deepEqual(r.completo.map((x) => x[1]), ['Grupo Base', 'Armas', 'Hierbas']);
  assert.deepEqual(r.tildes.map((x) => x[1]), ['Grupo Base', 'Hierbas']);
  assert.equal(r.nada, 0);
  sinErrores(m);
});

test('al esconder la ventana se cierran el menú, el campo nuevo y la confirmación', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    A.crear("", "Hierbas"); G.arbol:refrescar()
    G.botonImportar:Click("LeftButton")
    local f = fila("Hierbas"); f:GetScript("OnEnter")(f); f.botones[1]:Click("LeftButton")
    local campo = G.campoNuevo:IsShown()
    f = fila("Hierbas"); f:GetScript("OnEnter")(f); f.botones[2]:Click("LeftButton")
    local antes = {G.menuImportar:IsShown(), campo, G.confirmacion:IsShown()}
    SnetForever.Principal.cerrar()
    return {antes = antes, despues = {G.menuImportar:IsShown(), G.campoNuevo:IsShown(), G.confirmacion:IsShown()}}
  end)()`);
  assert.deepEqual(r.antes, [true, true, true]);
  assert.deepEqual(r.despues, [false, false, false]);
  sinErrores(m);
});

test('cambiar de idioma repinta la página', necesitaComercio, () => {
  const m = maquina({ jugador: { ...JUGADOR, idioma: 'enUS' } });
  const r = m.lua(`(function()
    ${ABRIR}
    return {G.campo.marcador:GetText(), textos()[1][2], G.menuImportar.filaTexto.texto:GetText(), G.menuImportar.filaTSM.texto:GetText()}
  end)()`);
  assert.deepEqual(r, ['Search groups', 'Base Group', 'Import text', 'Import from TSM']);
  sinErrores(m);
});

// Crea 353 grupos (50 con 6 hijos y 3 sueltos) en la cuenta de la máquina.
function con353(m) {
  m.lua(`(function()
    local A = SnetForever.Arbol
    for i = 1, 50 do
      local r = A.crear("", "Grupo " .. i)
      for j = 1, 6 do A.crear(r, "Hijo " .. j) end
    end
    for i = 1, 3 do A.crear("", "Suelto " .. i) end
  end)()`);
  assert.equal(m.lua('(function() local n = 0 for _ in pairs(SnetForever.Arbol.grupos()) do n = n + 1 end return n end)()'), 353);
}

// Abre la página como en el juego (ventana ya creada en otra pestaña, disposición diferida como el cliente) y mide.
function abrirMidiendo() {
  const m = maquina();
  con353(m);
  m.lua('BANCO.disposicionDiferida = true');
  m.lua('SnetForever.Principal.abrir("dashboard")');
  const inicio = process.hrtime.bigint();
  m.lua('SnetForever.Principal.elegir("grupos")');
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  return { m, ms };
}

test('con 353 grupos la página abre con el alto real: pinta las filas que caben y no más marcos', necesitaComercio, () => {
  const { m } = abrirMidiendo();
  const r = m.lua(`(function()
    local G = SnetForever.PrincipalGrupos
    local vistas = 0
    for _, f in ipairs(G.arbol.filas) do if f:IsShown() then vistas = vistas + 1 end end
    return {marcos = #G.arbol.filas, vistas = vistas, alto = G.arbol:GetHeight(), visibles = G.arbol:visibles(),
      altoPagina = G.pagina:GetHeight()}
  end)()`);
  const caben = Math.ceil(r.alto / 22);
  assert.ok(r.alto > 700 && r.alto < 730, `el árbol coge el alto real de la página (${r.alto})`);
  assert.equal(r.altoPagina, r.alto + 38 + 8, 'el árbol sigue a la página por sus dos anclajes');
  assert.equal(r.marcos, caben, 'se crean las filas que caben, ni una más');
  assert.equal(r.vistas, caben, 'y todas están pintadas');
  assert.equal(r.visibles, 51 + 3, 'cerrados: Grupo Base y sus 53 de primer nivel');
  // Con todo abierto (354 filas en la lista) tampoco crece el número de marcos.
  m.lua(`(function() local G = SnetForever.PrincipalGrupos for i = 1, 50 do G.arbol:abrir("Grupo " .. i, true) end end)()`);
  assert.equal(m.lua('SnetForever.PrincipalGrupos.arbol:visibles()'), 354);
  assert.equal(m.lua('#SnetForever.PrincipalGrupos.arbol.filas'), caben);
  sinErrores(m);
});

test('el trabajo de abrir no crece con los grupos: las mismas reconstrucciones sin grupos que con 353, y solo las filas que caben', necesitaComercio, () => {
  const cuenta = (m) => m.lua(`(function()
    local a = SnetForever.PrincipalGrupos.arbol
    return {reconstrucciones = a.reconstrucciones, filas = #a.filas}
  end)()`);
  const pocos = maquina();
  pocos.lua('BANCO.disposicionDiferida = true');
  pocos.lua('SnetForever.Principal.abrir("dashboard")');
  pocos.lua('SnetForever.Principal.elegir("grupos")');
  const { m } = abrirMidiendo();
  const a = cuenta(pocos);
  const b = cuenta(m);
  assert.equal(b.reconstrucciones, a.reconstrucciones, 'abrir reconstruye la lista las mismas veces con 353 grupos que con ninguno');
  assert.ok(b.reconstrucciones <= 4, `reconstrucciones al abrir: ${b.reconstrucciones}`);
  assert.equal(b.filas, Math.ceil(m.lua('SnetForever.PrincipalGrupos.arbol:GetHeight()') / 22));
  sinErrores(pocos);
  sinErrores(m);
});

// Límite de 1000 ms: sola tarda unos 200 ms, pero con la pasada entera en paralelo (4 a la vez) llega a 600-700 ms.
// El límite sigue cazando lo que importa: abrir sin el árbol virtualizado tardaba varios segundos.
test('con 353 grupos abrir la página tarda poco en el banco (el mejor de 3 tras un intento de calentamiento, menos de 1000 ms)', necesitaComercio, () => {
  abrirMidiendo(); // calentamiento: no cuenta
  const tiempos = [];
  for (let i = 0; i < 3; i++) {
    const { m, ms } = abrirMidiendo();
    assert.ok(m.lua('#SnetForever.PrincipalGrupos.arbol.filas') >= 30, 'el árbol pintó las filas que caben');
    tiempos.push(ms);
  }
  const mejor = Math.min(...tiempos);
  assert.ok(mejor < 1000, `abrir tardó ${tiempos.map((t) => t.toFixed(1)).join(', ')} ms`);
});

test('al estirar la ventana el árbol coge el alto nuevo y pinta las filas que caben', necesitaComercio, () => {
  const { m } = abrirMidiendo();
  const antes = m.lua('#SnetForever.PrincipalGrupos.arbol.filas');
  // El asa estira la ventana; el cliente lanza OnSizeChanged del árbol (el banco no mueve anclajes: se lanza a mano).
  m.lua(`(function()
    local v = SnetForeverPrincipal
    v:SetSize(v:GetWidth(), v:GetHeight() + 220)
    local a = SnetForever.PrincipalGrupos.arbol
    a:GetScript("OnSizeChanged")(a, a:GetWidth(), a:GetHeight())
  end)()`);
  const r = m.lua(`(function()
    local a = SnetForever.PrincipalGrupos.arbol
    return {filas = #a.filas, alto = a:GetHeight()}
  end)()`);
  assert.ok(r.alto > 900, `el alto sigue a la página (${r.alto})`);
  assert.equal(r.filas, Math.ceil(r.alto / 22));
  assert.ok(r.filas > antes);
  sinErrores(m);
});

test('en combate ⊕ no abre el campo con foco (avisa) y si entra el combate con el campo abierto se cancela', necesitaComercio, () => {
  const m = maquina();
  m.lua(`(function()
    SnetForever.Principal.abrir("grupos")
    SnetForever.Arbol.crear("", "Hierbas")
    SnetForever.PrincipalGrupos.arbol:refrescar()
  end)()`);
  // Combate: no hay campo con foco y sale un aviso.
  m.jugador({ enCombate: true });
  const antes = impresos(m).length;
  m.lua('SnetForever.PrincipalGrupos.crearSubgrupo("Hierbas")');
  assert.equal(m.lua('SnetForever.PrincipalGrupos.campoNuevo:IsShown()'), false);
  assert.equal(m.lua('SnetForever.PrincipalGrupos.campoNuevo:HasFocus()'), false);
  assert.deepEqual(impresos(m).slice(antes), [m.lua('SnetForever.L.t("PRINCIPAL_GRUPOS_COMBATE")')]);
  // Fuera de combate sí se abre, con foco.
  m.jugador({ enCombate: false });
  m.lua('SnetForever.PrincipalGrupos.crearSubgrupo("Hierbas")');
  assert.equal(m.lua('SnetForever.PrincipalGrupos.campoNuevo:IsShown()'), true);
  assert.equal(m.lua('SnetForever.PrincipalGrupos.campoNuevo:HasFocus()'), true);
  // Entra el combate con el campo abierto: se cancela y la fila nueva desaparece.
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForever.PrincipalGrupos.campoNuevo:IsShown()'), false);
  assert.equal(m.lua('SnetForever.PrincipalGrupos.campoNuevo:HasFocus()'), false);
  assert.equal(m.lua(`(function()
    local G = SnetForever.PrincipalGrupos
    for _, f in ipairs(G.arbol.filas) do
      if f:IsShown() and f.clave == G.CLAVE_NUEVO then return true end
    end
    return false
  end)()`), false, 'la fila nueva desaparece');
  assert.equal(m.lua('SnetForever.Arbol.existe("Hierbas")'), true);
  sinErrores(m);
});

test('sin el comercio no existe la página (solo núcleo)', () => {
  const m = maquina();
  if (m.lua('type(SnetForever.Principal)') === 'table') return; // con comercio: lo cubren las otras pruebas
  assert.equal(m.lua('SnetForever.PrincipalGrupos'), undefined);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------------
// Task 17: lado derecho (cabecera, Información y Objetos)
// ---------------------------------------------------------------------------------------------------------------------

// Como ABRIR, más ayudas del lado derecho: lineas(tabla) saca {clave, texto} de lo que se ve; elegir(ruta) elige un grupo.
const DERECHA = `${ABRIR}
  local function lineas(t)
    local out = {}
    for _, f in ipairs(t.filas) do
      if f:IsShown() then out[#out + 1] = {f.clave, f.celdas.obj.texto:GetText()} end
    end
    return out
  end
  local function elegir(ruta) G.arbol:refrescar(); G.arbol:elegir(ruta) end
  -- Pulsa la fila de la clave con la tecla que se pida («alt», «shift» o «ctrl»; sin ella, el clic solo): lo que hace el
  -- ratón al soltar el botón. B3s, como TSM: el clic solo suma o quita esa fila; Alt elige el tramo; Mayús enlaza en el chat
  -- y Ctrl va al probador, sin elegir nada.
  local function pulsar(t, clave, tecla)
    BANCO.ctrl, BANCO.shift, BANCO.alt = tecla == "ctrl", tecla == "shift", tecla == "alt"
    local f
    for _, x in ipairs(t.filas) do
      if x:IsShown() and x.clave == clave then f = x end
    end
    f:GetScript("OnMouseUp")(f, "LeftButton")
    BANCO.ctrl, BANCO.shift, BANCO.alt = false, false, false
  end
  local function elegidas(t)
    local out = {}
    for _, x in ipairs(t.filas) do
      if x:IsShown() and x.fondoElegida and x.fondoElegida:IsShown() then out[#out + 1] = x.clave end
    end
    return out
  end
  local function claves(t)
    local out = {}
    for _, l in ipairs(lineas(t)) do if string.sub(l[1], 1, 1) ~= "\\1" then out[#out + 1] = l[1] end end
    return out
  end`;

test('cabecera con el nombre en el color de su nivel; ✎ renombra en sitio', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Raras")
    local Tema = SnetForever.Tema
    local out = {}
    elegir("")
    out.base = {nombre = G.cabecera.nombre:GetText(), lapiz = G.cabecera.botonLapiz:IsShown(), exportar = G.cabecera.botonExportar:IsShown(),
      pestana = G.pestanas.pestanas[1].texto:GetText()}
    elegir("Hierbas\`Raras")
    local c = {G.cabecera.nombre:GetTextColor()}
    local n2 = Tema.color("nivel2")
    out.sub = {nombre = G.cabecera.nombre:GetText(), colorBien = math.abs(c[1] - n2[1]) < 0.01 and math.abs(c[2] - n2[2]) < 0.01 and math.abs(c[3] - n2[3]) < 0.01,
      lapiz = G.cabecera.botonLapiz:IsShown(), exportar = G.cabecera.botonExportar:IsShown(), pestana = G.pestanas.pestanas[1].texto:GetText(),
      carpeta = G.cabecera.icono:IsShown()}
    -- ✎: el nombre pasa a un campo en la propia cabecera.
    G.cabecera.botonLapiz:Click("LeftButton")
    out.campo = {visible = G.cabecera.campoNombre:IsShown(), texto = G.cabecera.campoNombre:GetText(), nombreOculto = not G.cabecera.nombre:IsShown()}
    -- Un nombre repetido o con el separador no se aplica.
    A.crear("Hierbas", "Finas")
    G.cabecera.campoNombre:SetText("Finas")
    G.cabecera.campoNombre:GetScript("OnEnterPressed")(G.cabecera.campoNombre)
    out.repetido = {sigue = G.cabecera.campoNombre:IsShown(), existe = A.existe("Hierbas\`Raras")}
    G.cabecera.campoNombre:SetText("Muy raras")
    G.cabecera.campoNombre:GetScript("OnEnterPressed")(G.cabecera.campoNombre)
    out.renombrado = {campoCerrado = not G.cabecera.campoNombre:IsShown(), vieja = A.existe("Hierbas\`Raras"), nueva = A.existe("Hierbas\`Muy raras"),
      elegida = G.arbol:elegida(), nombre = G.cabecera.nombre:GetText(), nombreVisible = G.cabecera.nombre:IsShown()}
    -- Escape lo deja como estaba.
    G.cabecera.botonLapiz:Click("LeftButton")
    G.cabecera.campoNombre:SetText("Otro")
    G.cabecera.campoNombre:GetScript("OnEscapePressed")(G.cabecera.campoNombre)
    G.cabecera.campoNombre:GetScript("OnEditFocusLost")(G.cabecera.campoNombre)
    out.escape = {cerrado = not G.cabecera.campoNombre:IsShown(), nombre = G.cabecera.nombre:GetText(), otro = A.existe("Hierbas\`Otro")}
    return out
  end)()`);
  assert.deepEqual(r.base, { nombre: 'Grupo Base', lapiz: false, exportar: false, pestana: 'Información' });
  assert.equal(r.sub.nombre, 'Raras');
  assert.equal(r.sub.colorBien, true, 'el nombre lleva el color del nivel 2');
  assert.equal(r.sub.lapiz, true);
  assert.equal(r.sub.exportar, true);
  assert.equal(r.sub.pestana, 'Objetos');
  assert.equal(r.sub.carpeta, true);
  assert.deepEqual(r.campo, { visible: true, texto: 'Raras', nombreOculto: true });
  assert.deepEqual(r.repetido, { sigue: true, existe: true });
  assert.deepEqual(r.renombrado, { campoCerrado: true, vieja: false, nueva: true, elegida: 'Hierbas`Muy raras', nombre: 'Muy raras', nombreVisible: true });
  assert.deepEqual(r.escape, { cerrado: true, nombre: 'Muy raras', otro: false });
  sinErrores(m);
});

test('✎ en combate no abre el campo y avisa; si entra el combate con el campo abierto se cancela', necesitaComercio, () => {
  const m = maquina();
  m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); elegir("Hierbas")
  end)()`);
  m.jugador({ enCombate: true });
  const antes = impresos(m).length;
  m.lua('SnetForever.PrincipalGrupos.cabecera.botonLapiz:Click("LeftButton")');
  assert.equal(m.lua('SnetForever.PrincipalGrupos.cabecera.campoNombre:IsShown()'), false);
  assert.deepEqual(impresos(m).slice(antes), [m.lua('SnetForever.L.t("PRINCIPAL_GRUPOS_COMBATE_RENOMBRAR")')]);
  m.jugador({ enCombate: false });
  m.lua('SnetForever.PrincipalGrupos.cabecera.botonLapiz:Click("LeftButton")');
  assert.equal(m.lua('SnetForever.PrincipalGrupos.cabecera.campoNombre:HasFocus()'), true);
  m.jugador({ enCombate: true });
  m.disparar('PLAYER_REGEN_DISABLED');
  assert.equal(m.lua('SnetForever.PrincipalGrupos.cabecera.campoNombre:IsShown()'), false);
  assert.equal(m.lua('SnetForever.PrincipalGrupos.cabecera.campoNombre:HasFocus()'), false);
  assert.equal(m.lua('SnetForever.PrincipalGrupos.cabecera.nombre:IsShown()'), true);
  sinErrores(m);
});

test('Grupo Base enseña Información con los objetos sin grupo de las bolsas', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2, icono: 134400 });
  m.itemInfo(12, { nombre: 'Polvo', calidad: 1 });
  m.bolsa(0, 1, { id: 10 });
  m.bolsa(0, 2, { id: 11 });
  m.bolsa(1, 1, { id: 12 });
  m.bolsa(0, 3, { id: 10 }); // repetido: sale una vez
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    A.poner("i:12", "Hierbas") -- este ya tiene grupo: no sale
    elegir("")
    local out = {}
    out.visibles = {info = G.paginaInfo:IsShown(), objetos = G.paginaObjetos:IsShown(), ops = G.paginaOperaciones:IsShown()}
    out.texto = G.textoInfo:GetText()
    out.mostrarComo = G.etiquetaModo:GetText()
    out.modo = G.desplegableModo.texto:GetText()
    out.filas = lineas(G.tablaBase)
    out.mover = {G.botonMover.texto:GetText(), G.botonMover.snfApagado}
    -- Elegir con clic y Alt (el tramo; la cabecera de sección no cuenta) y elegir destino.
    pulsar(G.tablaBase, "i:10")
    pulsar(G.tablaBase, "i:11", "alt")
    out.conMarcas = {G.botonMover.texto:GetText(), G.botonMover.snfApagado}
    out.opciones = #G.desplegableGrupo.snfOpciones.opciones
    G.ponerDestino("Hierbas")
    out.listo = {G.botonMover.texto:GetText(), G.botonMover.snfApagado, G.desplegableGrupo.texto:GetText()}
    G.botonMover:Click("LeftButton")
    out.despues = {A.objeto("i:10"), A.objeto("i:11"), claves(G.tablaBase), G.botonMover.snfApagado, G.botonMover.texto:GetText()}
    -- Operaciones: la pestaña enseña sus tarjetas.
    G.pestanas.pestanas[2]:Click("LeftButton")
    out.ops = {info = G.paginaInfo:IsShown(), ops = G.paginaOperaciones:IsShown()}
    return out
  end)()`);
  assert.deepEqual(r.visibles, { info: true, objetos: false, ops: false });
  assert.match(r.texto, /Grupo Base contiene todos los objetos/);
  assert.equal(r.mostrarComo, 'Mostrar los objetos sin grupo como:');
  assert.equal(r.modo, 'Objeto específico');
  assert.deepEqual(r.filas.map((f) => f[0]), ['\u0001bolsas', 'i:10', 'i:11']);
  assert.equal(r.filas[0][1], 'Objetos sin grupo en las bolsas');

  assert.match(r.filas[1][1], /^\|cff1eff00Rama simple\|r$/);
  assert.equal(r.filas[2][1].includes('Objeto 11'), true);
  assert.deepEqual(r.mover, ['Mover 0 objetos', true]);
  assert.deepEqual(r.conMarcas, ['Mover 2 objetos', true], 'sin grupo de destino sigue apagado');
  assert.equal(r.opciones, 1, 'los grupos a elegir (sin Grupo Base)');
  assert.deepEqual(r.listo, ['Mover 2 objetos', false, 'Hierbas']);
  assert.deepEqual(r.despues, ['Hierbas', 'Hierbas', [], true, 'Mover 0 objetos']);
  assert.deepEqual(r.ops, { info: false, ops: true });
  sinErrores(m);
});

// F2b: en Forever (Enum.BagIndex de /dump: la bolsa de componentes es la 5 y el llavero el -1) la lista de las bolsas trae
// también lo de la bolsa de componentes, donde van los paños, las hierbas y el mineral; lo del llavero no.
test('F2b: Grupo Base enseña también lo de la bolsa de componentes, y no lo del llavero', necesitaComercio, () => {
  const m = maquina({ bolsas: 'forever' });
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2 });
  m.itemInfo(12, { nombre: 'Paño de lino', calidad: 1 });
  m.bolsa(0, 1, { id: 10 });
  m.bolsa(5, 1, { id: 12, n: 20 });
  m.huecos(-1, 4);
  m.bolsa(-1, 1, { id: 13 });
  const r = m.lua(`(function()
    ${DERECHA}
    elegir("")
    return lineas(G.tablaBase)
  end)()`);
  assert.deepEqual(r.map((f) => f[0]), ['bolsas', 'i:12', 'i:10']);
  sinErrores(m);
});

test('subgrupo: marcar 2 objetos sin grupo y Añadir 2 objetos los mete; Quitar los devuelve', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2 });
  m.itemInfo(11, { nombre: 'Cristal nexo', calidad: 4 });
  m.bolsa(0, 1, { id: 10 });
  m.bolsa(0, 2, { id: 11 });
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    local out = {}
    out.visibles = {info = G.paginaInfo:IsShown(), objetos = G.paginaObjetos:IsShown()}
    out.cabeceras = {G.tablaSinGrupo.textoTitulo:GetText(), G.tablaEnGrupo.textoTitulo:GetText()}
    out.izquierda = lineas(G.tablaSinGrupo)
    out.derecha = lineas(G.tablaEnGrupo)
    out.apagados = {G.botonAnadir.snfApagado, G.botonQuitar.snfApagado, G.botonAnadir.texto:GetText(), G.botonQuitar.texto:GetText()}
    pulsar(G.tablaSinGrupo, "i:10")
    pulsar(G.tablaSinGrupo, "i:11")
    out.conMarcas = {G.botonAnadir.snfApagado, G.botonAnadir.texto:GetText(), G.botonQuitar.snfApagado}
    G.botonAnadir:Click("LeftButton")
    out.anadidos = {a = A.objeto("i:10"), b = A.objeto("i:11"), izq = claves(G.tablaSinGrupo), der = claves(G.tablaEnGrupo), apagado = G.botonAnadir.snfApagado,
      texto = G.botonAnadir.texto:GetText(), elegidas = G.tablaSinGrupo:marcadas()}
    pulsar(G.tablaEnGrupo, "i:10")
    pulsar(G.tablaEnGrupo, "i:11", "alt")
    out.quitar = {G.botonQuitar.snfApagado, G.botonQuitar.texto:GetText()}
    G.botonQuitar:Click("LeftButton")
    out.quitados = {a = A.objeto("i:10"), b = A.objeto("i:11"), izq = claves(G.tablaSinGrupo), der = claves(G.tablaEnGrupo), apagado = G.botonQuitar.snfApagado,
      texto = G.botonQuitar.texto:GetText(), elegidas = G.tablaEnGrupo:marcadas()}
    return out
  end)()`);
  assert.deepEqual(r.visibles, { info: false, objetos: true });
  assert.deepEqual(r.cabeceras, ['Objetos sin grupo', 'Objetos en el grupo']);
  assert.deepEqual(r.izquierda.map((f) => f[0]), ['\u0001bolsas', 'i:11', 'i:10', '\u0001padre']);
  assert.deepEqual(r.derecha, []);
  assert.deepEqual(r.apagados, [true, true, 'Añadir 0 objetos', 'Quitar 0 objetos']);
  assert.deepEqual(r.conMarcas, [false, 'Añadir 2 objetos', true]);
  assert.deepEqual(r.anadidos, { a: 'Hierbas', b: 'Hierbas', izq: [], der: ['i:10', 'i:11'], apagado: true, texto: 'Añadir 0 objetos', elegidas: [] });
  assert.deepEqual(r.quitar, [false, 'Quitar 2 objetos']);
  assert.deepEqual(r.quitados, { a: '', b: '', izq: ['i:11', 'i:10'], der: [], apagado: true, texto: 'Quitar 0 objetos', elegidas: [] });
  sinErrores(m);
});

test('un objeto añadido a este grupo sale del anterior', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2 });
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Raras")
    A.poner("i:10", "Hierbas")
    elegir("Hierbas\`Raras")
    local out = {}
    out.izquierda = lineas(G.tablaSinGrupo)
    pulsar(G.tablaSinGrupo, "i:10")
    G.botonAnadir:Click("LeftButton")
    out.despues = {a = A.objeto("i:10"), padre = #A.objetos("Hierbas"), hijo = #A.objetos("Hierbas\`Raras"), izq = claves(G.tablaSinGrupo), der = claves(G.tablaEnGrupo)}
    return out
  end)()`);
  assert.deepEqual(r.izquierda.map((f) => f[0]), ['\u0001bolsas', '\u0001padre', 'i:10']);
  assert.equal(r.izquierda[1][1], 'Objetos del grupo padre');
  assert.deepEqual(r.despues, { a: 'Hierbas`Raras', padre: 0, hijo: 1, izq: [], der: ['i:10'] });
  sinErrores(m);
});

test('un objeto desconocido sale como «Objeto N» con interrogación y se pone al llegar su nombre', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2, icono: 134400 });
  m.bolsa(0, 1, { id: 99 });
  m.bolsa(0, 2, { id: 10 });
  const pide = (id) => m.llamadas('GetItemInfo').filter((a) => a[0] === id).length;
  const lee = () => m.lua(`(function()
    local G = SnetForever.PrincipalGrupos
    local out = {}
    for _, f in ipairs(G.tablaBase.filas) do
      if f:IsShown() and f.clave then out[f.clave] = {f.celdas.obj.texto:GetText(), f.celdas.obj.icono:IsShown() and f.celdas.obj.icono:GetTexture() or false} end
    end
    return out
  end)()`);
  m.lua('SnetForever.Principal.abrir("grupos")');
  const r = lee();
  assert.equal(r['i:99'][0], 'Objeto 99');
  assert.equal(r['i:99'][1], 'Interface\\Icons\\INV_Misc_QuestionMark');
  assert.equal(r['i:10'][1], 134400);
  // Repintar varias veces no vuelve a preguntar por el desconocido.
  m.lua('SnetForever.PrincipalGrupos.arbol:elegir("")');
  m.lua('SnetForever.PrincipalGrupos.tablaBase:refrescar()');
  assert.equal(pide(99), 1, 'se pide una sola vez');
  // Llega el nombre: se repinta (con un freno corto) sin pedir otra vez.
  m.itemInfo(99, { nombre: 'Raíz rara', calidad: 3, icono: 135000 });
  m.disparar('GET_ITEM_INFO_RECEIVED', 99, true);
  m.avanzar(1);
  const d = lee();
  assert.equal(d['i:99'][0], '|cff0070ddRaíz rara|r');
  assert.equal(d['i:99'][1], 135000);
  // Con la ventana cerrada el evento no hace nada (ni queda oyente).
  m.lua('SnetForever.Principal.cerrar()');
  m.disparar('GET_ITEM_INFO_RECEIVED', 99, true);
  m.avanzar(1);
  sinErrores(m);
});

// Un grupo con n objetos: abre la lista y cuenta el trabajo hecho.
function abrirGrupoCon(n) {
  const m = maquina();
  m.lua(`(function()
    local A = SnetForever.Arbol
    A.crear("", "Grande")
    for i = 1, ${n} do A.poner("i:" .. (1000 + i), "Grande") end
  end)()`);
  m.lua('BANCO.disposicionDiferida = true');
  m.lua('SnetForever.Principal.abrir("dashboard")');
  m.lua('SnetForever.Principal.elegir("grupos")');
  const inicio = process.hrtime.bigint();
  m.lua('SnetForever.PrincipalGrupos.arbol:elegir("Grande")');
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  return { m, ms };
}

test('un grupo con 8.322 objetos abre su lista con las filas que caben y el trabajo no crece con los objetos', necesitaComercio, () => {
  const medidas = (m) => m.lua(`(function()
    local t = SnetForever.PrincipalGrupos.tablaEnGrupo
    local vistas = 0
    for _, f in ipairs(t.filas) do if f:IsShown() then vistas = vistas + 1 end end
    return {marcos = #t.filas, vistas = vistas, alto = t.cuerpo:GetHeight(), cuantas = t:cuantas(), orden = t.ordenaciones}
  end)()`);
  const pocos = abrirGrupoCon(10).m;
  const { m } = abrirGrupoCon(8322);
  const a = medidas(pocos);
  const b = medidas(m);
  assert.equal(b.cuantas, 8322);
  assert.equal(b.marcos, Math.ceil(b.alto / 22), 'se crean las filas que caben, ni una más (B3r: filas de 22)');
  assert.equal(b.vistas, b.marcos);
  assert.equal(b.orden, 0, 'no se ordena la lista entera');
  assert.equal(a.cuantas, 10);
  // Preguntar al juego por los objetos: solo los que se ven (y no 8.322).
  const pedidos = new Set(m.llamadas('GetItemInfo').map((x) => x[0]));
  assert.ok(pedidos.size <= b.marcos, `se preguntó por ${pedidos.size} objetos con ${b.marcos} filas`);
  sinErrores(pocos);
  sinErrores(m);
});

test('un grupo con 8.322 objetos abre su lista rápido en el banco (el mejor de 3 tras un calentamiento, menos de 500 ms)', necesitaComercio, () => {
  abrirGrupoCon(8322); // calentamiento: no cuenta
  const tiempos = [];
  for (let i = 0; i < 3; i++) tiempos.push(abrirGrupoCon(8322).ms);
  const mejor = Math.min(...tiempos);
  assert.ok(mejor < 500, `abrir tardó ${tiempos.map((t) => t.toFixed(1)).join(', ')} ms`);
});

test('cambiar de idioma repinta el lado derecho', necesitaComercio, () => {
  const m = maquina({ jugador: { ...JUGADOR, idioma: 'enUS' } });
  const r = m.lua(`(function()
    ${DERECHA}
    local out = {G.pestanas.pestanas[1].texto:GetText(), G.pestanas.pestanas[2].texto:GetText(), G.etiquetaModo:GetText(), G.botonMover.texto:GetText(), G.campoObjetosBase.marcador:GetText()}
    elegir("")
    A.crear("", "Hierbas"); elegir("Hierbas")
    out[#out + 1] = G.pestanas.pestanas[1].texto:GetText()
    out[#out + 1] = G.botonAnadir.texto:GetText()
    return out
  end)()`);
  assert.deepEqual(r, ['Information', 'Operations', 'Show ungrouped items as:', 'Move 0 items', 'Search items', 'Items', 'Add 0 items']);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------------
// Task 17, ronda de arreglos 1
// ---------------------------------------------------------------------------------------------------------------------

test('un cambio de bolsas que llega mientras espera el repintado de filas no se pierde', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2 });
  m.bolsa(0, 1, { id: 10 });
  m.lua('SnetForever.Principal.abrir("grupos")');
  const claves = () => m.lua(`(function()
    local G = SnetForever.PrincipalGrupos
    local out = {}
    for _, f in ipairs(G.tablaBase.filas) do if f:IsShown() and f.clave then out[#out + 1] = f.clave end end
    return out
  end)()`);
  assert.deepEqual(claves(), ['\u0001bolsas', 'i:10']);
  // Llega el nombre de un objeto (el repintado de filas queda esperando) y enseguida un objeto nuevo en las bolsas.
  m.itemInfo(10, { nombre: 'Rama doble', calidad: 3 });
  m.disparar('GET_ITEM_INFO_RECEIVED', 10, true);
  m.bolsa(0, 2, { id: 20 });
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(1);
  assert.deepEqual(claves(), ['\u0001bolsas', 'i:10', 'i:20'], 'el objeto nuevo sale en la lista');
  sinErrores(m);
});

test('los tres buscadores sueltan el teclado en combate, al hacer clic y al empezar el combate', necesitaComercio, () => {
  const m = maquina();
  m.lua('SnetForever.Principal.abrir("grupos")');
  m.lua('SnetForever.Arbol.crear("", "Hierbas"); SnetForever.PrincipalGrupos.arbol:refrescar()');
  const campos = ['campo', 'campoObjetosBase', 'campoObjetosGrupo'];
  const tiene = (c) => m.lua(`SnetForever.PrincipalGrupos.${c}:HasFocus()`);
  // En combate, pulsar en el buscador no se queda con el teclado.
  m.jugador({ enCombate: true });
  for (const c of campos) {
    m.lua(`(function() local c = SnetForever.PrincipalGrupos.${c}; c:SetFocus(); c:GetScript("OnEditFocusGained")(c) end)()`);
    assert.equal(tiene(c), false, `${c} en combate`);
  }
  // Fuera de combate sí lo coge; al empezar el combate lo suelta.
  m.jugador({ enCombate: false });
  for (const c of campos) {
    m.lua(`(function() local c = SnetForever.PrincipalGrupos.${c}; c:SetFocus(); c:GetScript("OnEditFocusGained")(c) end)()`);
    assert.equal(tiene(c), true, `${c} fuera de combate`);
    m.jugador({ enCombate: true });
    m.disparar('PLAYER_REGEN_DISABLED');
    assert.equal(tiene(c), false, `${c} al empezar el combate`);
    m.jugador({ enCombate: false });
  }
  sinErrores(m);
});

test('Quitar devuelve los objetos al grupo padre; en primer nivel, al Grupo Base', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2 });
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Raras")
    A.poner("i:10", "Hierbas")
    elegir("Hierbas\`Raras")
    pulsar(G.tablaSinGrupo, "i:10")
    G.botonAnadir:Click("LeftButton")
    local out = {dentro = A.objeto("i:10")}
    pulsar(G.tablaEnGrupo, "i:10")
    G.botonQuitar:Click("LeftButton")
    out.vuelta = A.objeto("i:10")
    out.izq = claves(G.tablaSinGrupo)
    -- Primer nivel: vuelve a Base.
    elegir("Hierbas")
    pulsar(G.tablaEnGrupo, "i:10")
    G.botonQuitar:Click("LeftButton")
    out.base = A.objeto("i:10")
    return out
  end)()`);
  assert.deepEqual(r, { dentro: 'Hierbas`Raras', vuelta: 'Hierbas', izq: ['i:10'], base: '' });
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Task 18: Grupos › Operaciones (una tarjeta por tipo, orden y herencia)
// ---------------------------------------------------------------------------------------------------

const OPS = `${DERECHA}
  local O = SnetForever.Operaciones
  local TIPOS = {"subasta", "artesania", "correo", "compras", "sniper", "vendedor", "almacen"}
  local function deDe(ruta) local _, d = O.deGrupo(ruta, "subasta"); if d == nil then return false end; return d end
  local function verOps(ruta)
    elegir(ruta)
    G.pestanas.pestanas[2]:Click("LeftButton")
  end
  local function nombres(tipo)
    local out = {}
    for _, f in ipairs(G.tarjetas[tipo].filas) do
      if f:IsShown() then out[#out + 1] = f.nombre.texto:GetText() end
    end
    return out
  end
  -- Arrastra la asa de la fila i de la tarjeta hasta la fila j (suelta con el cursor en medio de esa fila).
  local function arrastrar(tipo, i, j)
    local t = G.tarjetas[tipo]
    local origen, destino = t.filas[i], t.filas[j]
    local s = origen:GetEffectiveScale()
    origen.asa:GetScript("OnDragStart")(origen.asa)
    BANCO.cursor = {x = (destino:GetLeft() + 20) * s, y = ((destino:GetTop() + destino:GetBottom()) / 2) * s}
    origen.asa:GetScript("OnDragStop")(origen.asa)
  end`;

test('7 tarjetas en el orden de TSM con su descripción', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    O.crear("subasta", "Alta"); O.ponerDeGrupo("", "subasta", {"Alta"})
    verOps("")
    local out = {tipos = {}, visible = G.paginaOperaciones:IsShown()}
    local y = nil
    out.ordenVertical = true
    for _, tipo in ipairs(TIPOS) do
      local t = G.tarjetas[tipo]
      out.tipos[#out.tipos + 1] = {t.titulo:GetText(), t.descripcion:GetText(), O.TIPOS[tipo].descripcion, t:IsShown()}
      local arriba = t:GetTop()
      if y and arriba >= y then out.ordenVertical = false end
      y = t:GetBottom()
    end
    local s = G.tarjetas.subasta
    out.filaUno = {s.filas[1].numero:GetText(), s.filas[1].nombre.texto:GetText(), s.filas[1].asa ~= nil,
      s.filas[1].botonAbrir ~= nil, s.filas[1].botonQuitar ~= nil, s.enlace.texto:GetText()}
    out.sinHeredar = {s.heredadas:IsShown(), s.casilla:IsShown()}
    return out
  end)()`);
  assert.equal(r.visible, true);
  assert.deepEqual(r.tipos.map((t) => t[0]), [
    'Operaciones de Subasta', 'Operaciones de Artesanía', 'Operaciones de Correo', 'Operaciones de Compras',
    'Operaciones de Sniper', 'Operaciones de Vendedor', 'Operaciones de Almacén',
  ]);
  for (const t of r.tipos) {
    assert.equal(t[1], t[2]);
    assert.equal(t[3], true);
  }
  assert.equal(r.ordenVertical, true);
  assert.deepEqual(r.filaUno, ['1', 'Alta', true, true, true, 'Agregar más operaciones']);
  assert.deepEqual(r.sinHeredar, [false, false]); // Grupo Base no hereda ni tiene «Usar las suyas»
  sinErrores(m);
});

test('añadir y quitar operaciones; arrastrar cambia el orden', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    for _, n in ipairs({"Alta", "Baja", "Media"}) do O.crear("subasta", n) end
    verOps("")
    local out = {}
    local t = G.tarjetas.subasta
    out.vacia = nombres("subasta")
    -- «Agregar más operaciones» ofrece las que faltan (y al elegir una se añade al final).
    local d = t.desplegable
    t.enlace:Click("LeftButton")
    out.ofrece = {}
    for _, o in ipairs(d.snfOpciones.opciones) do out.ofrece[#out.ofrece + 1] = o[1] end
    d.snfOpciones.set("Baja")
    d.snfOpciones.set("Alta")
    out.tras = nombres("subasta")
    out.guardado = O.deGrupo("", "subasta")
    out.ofreceAhora = {}
    t.enlace:Click("LeftButton")
    for _, o in ipairs(d.snfOpciones.opciones) do out.ofreceAhora[#out.ofreceAhora + 1] = o[1] end
    -- Arrastrar la primera sobre la segunda cambia el orden y se guarda.
    arrastrar("subasta", 1, 2)
    out.arrastrada = nombres("subasta")
    out.guardadoOrden = O.deGrupo("", "subasta")
    -- Soltar sobre sí misma no cambia nada.
    arrastrar("subasta", 1, 1)
    out.igual = nombres("subasta")
    -- Quitar la primera (✕).
    t.filas[1].botonQuitar:Click("LeftButton")
    out.quitada = nombres("subasta")
    out.filasVisibles = 0
    for _, f in ipairs(t.filas) do if f:IsShown() then out.filasVisibles = out.filasVisibles + 1 end end
    return out
  end)()`);
  assert.deepEqual(r.vacia, []);
  assert.deepEqual(r.ofrece, ['Alta', 'Baja', 'Media']);
  assert.deepEqual(r.tras, ['Baja', 'Alta']);
  assert.deepEqual(r.guardado, ['Baja', 'Alta']);
  assert.deepEqual(r.ofreceAhora, ['Media']);
  assert.deepEqual(r.arrastrada, ['Alta', 'Baja']);
  assert.deepEqual(r.guardadoOrden, ['Alta', 'Baja']);
  assert.deepEqual(r.igual, ['Alta', 'Baja']);
  assert.deepEqual(r.quitada, ['Baja']);
  assert.equal(r.filasVisibles, 1);
  sinErrores(m);
});

test('tipos de una sola: el enlace sigue en el color del acento con una puesta y pulsarlo avisa en el chat', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    O.crear("sniper", "Rara"); O.crear("sniper", "Barata")
    verOps("")
    local t = G.tarjetas.sniper
    local out = {antes = t.enlace.snfApagado, tope = O.TIPOS.sniper.una}
    local colorEnlace = function(e) return {e.texto:GetTextColor()} end
    t.desplegable.snfOpciones.set("Rara")
    out.con = {t.enlace.snfApagado, nombres("sniper"), colorEnlace(t.enlace)}
    t.desplegable.snfOpciones.set("Barata") -- aunque se fuerce, no pasa de una
    out.fuerza = nombres("sniper")
    t.enlace:Click("LeftButton")
    out.opcionesAlPulsar = #t.desplegable.snfOpciones.opciones
    t.filas[1].botonQuitar:Click("LeftButton")
    out.sin = {t.enlace.snfApagado, nombres("sniper")}
    -- Un tipo de varias nunca se apaga mientras queden operaciones por añadir.
    O.crear("correo", "A"); O.crear("correo", "B")
    verOps("")
    G.tarjetas.correo.desplegable.snfOpciones.set("A")
    out.varias = G.tarjetas.correo.enlace.snfApagado
    G.tarjetas.correo.desplegable.snfOpciones.set("B")
    out.todas = G.tarjetas.correo.enlace.snfApagado -- ya no queda ninguna por añadir
    G.tarjetas.correo.enlace:Click("LeftButton")
    return out
  end)()`);
  assert.equal(r.tope, true);
  assert.equal(r.antes, false);
  assert.deepEqual(r.con.slice(0, 2), [false, ['Rara']], 'ya no se apaga');
  assert.equal(aHex(r.con[2]), 'd5a77d', 'color del enlace activo');

  assert.deepEqual(r.fuerza, ['Rara']);
  assert.equal(r.opcionesAlPulsar, 0);
  assert.deepEqual(r.sin, [false, []]);
  assert.equal(r.varias, false);
  assert.equal(r.todas, false, 'tampoco se apaga cuando ya están todas');
  const avisos = impresos(m).filter((t) => /operaci/i.test(t));
  assert.deepEqual(avisos, [
    'Este tipo solo admite una operación.',
    'No hay más operaciones de este tipo para agregar. Se crean en la pestaña Operaciones.',
  ], 'avisa al pulsar sin nada que añadir (sniper con una puesta y correo con todas), y solo entonces');
  sinErrores(m);
});

test('un subgrupo sin override enseña las del padre y «Heredadas de»; activar override deja editar', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    A.crear("", "Armas"); A.crear("Armas", "Espadas")
    for _, n in ipairs({"Alta", "Baja"}) do O.crear("subasta", n) end
    O.ponerDeGrupo("", "subasta", {"Alta", "Baja"})
    verOps("Armas\`Espadas")
    local t = G.tarjetas.subasta
    local out = {}
    out.hereda = {nombres("subasta"), t.heredadas:IsShown(), t.heredadas:GetText(), t.casilla:IsShown(), t.casilla.marcada}
    -- Heredadas: se pueden abrir con ↗ pero no se editan (sin asa, sin ✕ y sin «Agregar»).
    out.soloLectura = {t.filas[1].asa:IsShown(), t.filas[1].botonQuitar:IsShown(), t.filas[1].botonAbrir:IsShown(), t.enlace:IsShown()}
    out.sinOverride = deDe("Armas\`Espadas")
    -- Si un padre intermedio tiene override, de ahí vienen.
    O.ponerDeGrupo("Armas", "subasta", {"Baja"})
    verOps("Armas\`Espadas")
    out.deArmas = {nombres("subasta"), t.heredadas:GetText()}
    -- Marcar «Usar las suyas» copia la lista heredada como punto de partida y deja editar.
    t.casilla:Click("LeftButton")
    out.propia = {nombres("subasta"), t.heredadas:IsShown(), t.casilla.marcada, deDe("Armas\`Espadas")}
    out.editable = {t.filas[1].asa:IsShown(), t.filas[1].botonQuitar:IsShown(), t.enlace:IsShown()}
    t.desplegable.snfOpciones.set("Alta")
    out.editada = {nombres("subasta"), (O.deGrupo("Armas\`Espadas", "subasta"))}
    out.padreIntacto = O.deGrupo("Armas", "subasta")
    -- Desmarcar vuelve a heredar (el override se quita).
    t.casilla:Click("LeftButton")
    out.vuelve = {nombres("subasta"), t.heredadas:IsShown(), t.casilla.marcada, deDe("Armas\`Espadas")}
    return out
  end)()`);
  assert.deepEqual(r.hereda, [['Alta', 'Baja'], true, 'Heredadas de Grupo Base', true, false]);
  assert.deepEqual(r.soloLectura, [false, false, true, false]);
  assert.equal(r.sinOverride, '');
  assert.deepEqual(r.deArmas, [['Baja'], 'Heredadas de Armas']);
  assert.deepEqual(r.propia, [['Baja'], false, true, false]);
  assert.deepEqual(r.editable, [true, true, true]);
  assert.deepEqual(r.editada, [['Baja', 'Alta'], ['Baja', 'Alta']]);
  assert.deepEqual(r.padreIntacto, ['Baja']);
  assert.deepEqual(r.vuelve, [['Baja'], true, false, 'Armas']);
  sinErrores(m);
});

test('Task 20c: cada tarjeta se pliega y se despliega con su triángulo; las de debajo suben y el alto de la página baja', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    O.crear("subasta", "Alta"); O.ponerDeGrupo("", "subasta", {"Alta"})
    verOps("")
    local S, A2 = G.tarjetas.subasta, G.tarjetas.artesania
    local function estado()
      return {S:GetHeight(), A2:GetTop(), G.zonaOperaciones.contenido:GetHeight(), S.descripcion:IsShown(), S.filas[1]:IsShown(),
        S.enlace:IsShown(), S.triangulo:GetTexCoord()}
    end
    local sonda = UIParent:CreateTexture()
    local function icono(n) SnetForever.Tema.icono(sonda, n); return {sonda:GetTexCoord()} end
    local out = {abierta = estado(), esAbierto = icono("abierto"), esCerrado = icono("cerrado")}
    S.cabecera:Click("LeftButton") -- pulsar el título (o el triángulo) la pliega
    out.plegada = estado()
    out.otraPlegada = {A2.descripcion:IsShown(), A2.filas[1] == nil or A2.filas[1]:IsShown()}
    -- Es por tipo y dura la sesión: otro grupo la sigue enseñando plegada.
    A.crear("", "Armas")
    verOps("Armas")
    out.otroGrupo = {S:GetHeight(), S.descripcion:IsShown()}
    verOps("")
    S.cabecera:Click("LeftButton")
    out.desplegada = estado()
    return out
  end)()`);
  const [alto, arribaSiguiente, altoPagina, desc, fila, enlace, ...coords] = r.abierta;
  assert.equal(desc, true);
  assert.equal(fila, true);
  assert.equal(enlace, true);
  const [alto2, arriba2, altoPagina2, desc2, fila2, enlace2, ...coords2] = r.plegada;
  assert.equal(alto2, 10 + 16 + 10, 'plegada: solo la línea del título más los rellenos');
  assert.ok(alto2 < alto);
  assert.ok(arriba2 > arribaSiguiente, 'la tarjeta de debajo sube');
  assert.ok(Math.abs((arriba2 - arribaSiguiente) - (alto - alto2)) < 0.01, 'sube justo lo que se pliega');
  assert.ok(Math.abs((altoPagina - altoPagina2) - (alto - alto2)) < 0.01, 'el alto de la página baja lo mismo');
  assert.deepEqual([desc2, fila2, enlace2], [false, false, false]);
  assert.deepEqual(coords, r.esAbierto, 'desplegada lleva justo el icono «abierto» (▼)');
  assert.deepEqual(coords2, r.esCerrado, 'plegada lleva justo el icono «cerrado» (▶)');
  assert.deepEqual(r.otraPlegada[0], true, 'las demás tarjetas siguen desplegadas');
  assert.deepEqual(r.otroGrupo, [alto2, false], 'lo plegado es por tipo, no por grupo');
  assert.deepEqual(r.desplegada, r.abierta, 'pulsar otra vez la despliega tal cual estaba');
  sinErrores(m);
});

test('Task 20c ronda 2: sin nada que añadir, el aviso depende del tipo (una sola operación o no quedan creadas)', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    -- Sniper admite una sola: con una puesta y otra creada, el motivo es el tope.
    O.crear("sniper", "Rara"); O.crear("sniper", "Barata")
    verOps("")
    G.tarjetas.sniper.desplegable.snfOpciones.set("Rara")
    G.tarjetas.sniper.enlace:Click("LeftButton")
    -- Correo admite varias: con todas puestas, no quedan creadas por añadir.
    O.crear("correo", "A")
    G.tarjetas.correo.desplegable.snfOpciones.set("A")
    G.tarjetas.correo.enlace:Click("LeftButton")
    return true
  end)()`);
  assert.equal(r, true);
  const avisos = impresos(m).filter((t) => /operaci/i.test(t));
  assert.deepEqual(avisos, [
    'Este tipo solo admite una operación.',
    'No hay más operaciones de este tipo para agregar. Se crean en la pestaña Operaciones.',
  ]);
  sinErrores(m);
});

test('Task 20c ronda 2: los textos de cuenta van en singular con 1 (es y en)', necesitaComercio, () => {
  for (const [idioma, esperado] of [
    ['esES', { mover: ['Mover 0 objetos', 'Mover 1 objeto', 'Mover 3 objetos'], anadir: ['Añadir 0 objetos', 'Añadir 1 objeto', 'Añadir 3 objetos'], quitar: ['Quitar 0 objetos', 'Quitar 1 objeto', 'Quitar 3 objetos'] }],
    ['enUS', { mover: ['Move 0 items', 'Move 1 item', 'Move 3 items'], anadir: ['Add 0 items', 'Add 1 item', 'Add 3 items'], quitar: ['Remove 0 items', 'Remove 1 item', 'Remove 3 items'] }],
  ]) {
    const m = maquina({ jugador: { ...JUGADOR, idioma } });
    for (const i of [10, 11, 12]) { m.itemInfo(i, { nombre: 'Rama ' + i, calidad: 2 }); m.bolsa(0, i - 9, { id: i }); }
    const r = m.lua(`(function()
      ${DERECHA}
      A.crear("", "Hierbas")
      local out = {mover = {}, anadir = {}, quitar = {}}
      elegir("")
      local function marcarN(t, n)
        t:marcarTodo(false)
        local k = 0
        for _, f in ipairs(t.filas) do
          if k < n and f:IsShown() and f.clave and string.sub(f.clave, 1, 1) ~= "\\1" then
            pulsar(t, f.clave); k = k + 1
          end
        end
      end
      for _, n in ipairs({0, 1, 3}) do
        marcarN(G.tablaBase, n)
        out.mover[#out.mover + 1] = G.botonMover.texto:GetText()
      end
      elegir("Hierbas")
      for _, n in ipairs({0, 1, 3}) do
        marcarN(G.tablaSinGrupo, n)
        out.anadir[#out.anadir + 1] = G.botonAnadir.texto:GetText()
      end
      for _, n in ipairs({0, 1, 3}) do
        marcarN(G.tablaEnGrupo, 0)
        out.quitar[#out.quitar + 1] = SnetForever.L.t(n == 1 and "PRINCIPAL_GRUPOS_QUITAR_UNO" or "PRINCIPAL_GRUPOS_QUITAR", n)
      end
      return out
    end)()`);
    assert.deepEqual(r, esperado, idioma);
    sinErrores(m);
  }
});

test('Task 20c ronda 2: la barra «Seleccionar grupo» no cambia de ancho con la cifra del botón y queda a 7 px de la lista', necesitaComercio, () => {
  const m = maquina();
  for (let i = 1; i <= 10; i++) { m.itemInfo(100 + i, { nombre: 'Rama ' + i, calidad: 2 }); m.bolsa(0, i, { id: 100 + i }); }
  const r = m.lua(`(function()
    ${DERECHA}
    elegir("")
    local d, b, T = G.desplegableGrupo, G.botonMover, G.tablaBase
    local out = {}
    local function marcar(n)
      T:marcarTodo(false)
      local k = 0
      for _, f in ipairs(T.filas) do
        if k < n and f:IsShown() and f.clave and string.sub(f.clave, 1, 1) ~= "\\1" then pulsar(T, f.clave); k = k + 1 end
      end
      return {d:GetWidth(), d:GetLeft(), d:GetRight(), b:GetWidth()}
    end
    out.nueve = marcar(9)
    out.diez = marcar(10)
    out.textoDiez = b.texto:GetText()
    out.hueco = T:GetBottom() - d:GetTop()
    return out
  end)()`);
  assert.equal(r.textoDiez, 'Mover 10 objetos');
  assert.deepEqual(r.nueve, r.diez, 'la barra y el botón miden lo mismo con 9 y con 10');
  // Task 31: el botón ya no mide 114 fijos sino lo que pide el texto más largo («Mover 9999 objetos»); lo prueba
  // «Mover N objetos» cabe en una línea, más abajo.
  assert.ok(r.nueve[3] > 0);
  assert.ok(Math.abs(r.hueco - 7) < 0.01, `hueco de 7 px entre la lista y la fila de abajo (es ${r.hueco})`);
  sinErrores(m);
});

test('Task 20c ronda 2: la fila de Grupo Base no lleva triángulo y sus hijos se ven siempre', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    A.crear("", "Hierbas")
    G.arbol:refrescar()
    local base = fila("")
    local out = {triangulo = base.triangulo:IsShown(), antes = #textos()}
    base:Click("LeftButton")
    out.despues = #textos()
    out.elegida = G.arbol:elegida()
    return out
  end)()`);
  assert.equal(r.triangulo, false);
  assert.equal(r.despues, r.antes);
  assert.equal(r.elegida, '');
  sinErrores(m);
});

test('Task 20c: el fondo del panel del árbol es el de TSM (22,28,28)', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${ABRIR}
    return {G.fondoPanel:GetVertexColor()}
  end)()`);
  assert.equal(aHex(r), '232122');
  sinErrores(m);
});

test('Task 20c: el número de la fila es blanco (236,244,243), en negrita y de 14 px', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    O.crear("subasta", "Alta"); O.ponerDeGrupo("", "subasta", {"Alta"})
    verOps("")
    local n = G.tarjetas.subasta.filas[1].numero
    local ruta, tam = n:GetFont()
    local out = {color = {n:GetTextColor()}, ruta = ruta, tam = tam}
    return out
  end)()`);
  assert.equal(aHex(r.color), 'f5e8d4');
  assert.match(r.ruta, /AlegreyaSC-Bold/);
  assert.equal(r.tam, 14);
  sinErrores(m);
});

// Task 32: el icono pasa de «abrir» (↗) a «ventana» (⧉), como gr-02.
test('Task 20c: la fila de la operación lleva el icono «ventana» (ni abrir ni copiar) y la X; ⧉ sigue yendo a la operación', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    O.crear("subasta", "Alta"); O.ponerDeGrupo("", "subasta", {"Alta"})
    verOps("")
    local f = G.tarjetas.subasta.filas[1]
    local function coord(tex) return {tex:GetTexCoord()} end
    local probe = UIParent:CreateTexture()
    local function de(nombre) SnetForever.Tema.icono(probe, nombre); return coord(probe) end
    local out = {
      abrir = coord(f.botonAbrir.icono), esVentana = de("ventana"), esAbrir = de("abrir"), esCopiar = de("copiar"),
      quitar = coord(f.botonQuitar.icono), esCerrar = de("cerrar"), sinCopiar = f.botonCopiar == nil,
    }
    -- Task 22: la página de Operaciones (se crea al cambiar de pestaña) recoge la petición y deja la operación elegida.
    f.botonAbrir:Click("LeftButton")
    out.pedidas = {{SnetForever.PrincipalOperaciones.elegida()}}
    return out
  end)()`);
  assert.deepEqual(r.abrir, r.esVentana);
  assert.notDeepEqual(r.abrir, r.esAbrir);
  assert.notDeepEqual(r.abrir, r.esCopiar);
  assert.deepEqual(r.quitar, r.esCerrar);
  assert.equal(r.sinCopiar, true);
  assert.deepEqual(r.pedidas, [['subasta', 'Alta']]);
  sinErrores(m);
});

test('Task 20c: Información, fila de abajo: «Seleccionar grupo» con «+», el nombre del elegido y «Mover N objetos»', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2 });
  m.itemInfo(11, { nombre: 'Rama doble', calidad: 2 });
  m.itemInfo(12, { nombre: 'Rama triple', calidad: 2 });
  m.bolsa(0, 1, { id: 10 });
  m.bolsa(0, 2, { id: 11 });
  m.bolsa(0, 3, { id: 12 });
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("")
    local d, b = G.desplegableGrupo, G.botonMover
    local probe = UIParent:CreateTexture()
    local function de(n) SnetForever.Tema.icono(probe, n); return {probe:GetTexCoord()} end
    local out = {
      texto = d.texto:GetText(), icono = {d.flecha:GetTexCoord()}, mas = de("mas"), desplegar = de("desplegar"),
      alto = {d:GetHeight(), b:GetHeight()},
      fondo = {d.snfTema.fondoPleno[1]:GetVertexColor()},
      boton = b.texto:GetText(),
      baseDelBoton = b:GetBottom(), baseDeLaBarra = d:GetBottom(), derechaDeLaBarra = d:GetRight(), izquierdaDelBoton = b:GetLeft(),
    }
    pulsar(G.tablaBase, "i:10"); pulsar(G.tablaBase, "i:11"); pulsar(G.tablaBase, "i:12")
    out.tres = b.texto:GetText()
    G.ponerDestino("Hierbas")
    out.elegido = d.texto:GetText()
    d:Click("LeftButton")
    out.abre = SnetForeverDesplegableLista and SnetForeverDesplegableLista:IsShown()
    return out
  end)()`);
  assert.equal(r.texto, 'Seleccionar grupo');
  assert.deepEqual(r.icono, r.mas, 'el icono es «+»');
  assert.notDeepEqual(r.icono, r.desplegar);
  assert.deepEqual(r.alto, [22, 22], 'barra y botón de 22 px, como en gr-01');
  assert.equal(aHex(r.fondo), '423532', 'selector de hierro');
  assert.equal(r.boton, 'Mover 0 objetos');
  assert.equal(r.baseDelBoton, r.baseDeLaBarra, 'en la misma línea');
  assert.ok(Math.abs(r.izquierdaDelBoton - r.derechaDeLaBarra - 8) < 0.01, 'a 8 px del botón');
  assert.equal(r.tres, 'Mover 3 objetos');
  assert.equal(r.elegido, 'Hierbas');
  assert.equal(r.abre, true, 'pulsar la barra sigue abriendo la lista de grupos');
  sinErrores(m);
});

test('↗ abre la operación en la pestaña Operaciones', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${OPS}
    O.crear("subasta", "Alta"); O.ponerDeGrupo("", "subasta", {"Alta"})
    verOps("")
    local out = {}
    local pedidas = {}
    local P = SnetForever.PrincipalOperaciones
    -- Con la página de Operaciones de verdad (se crea al cambiar de pestaña): la recoge, queda elegida y la petición se borra.
    G.tarjetas.subasta.filas[1].botonAbrir:Click("LeftButton")
    out.pestana = SnetForever.Principal.pestana()
    out.elegida = {P.elegida()}
    out.pedida = G.operacionPedida
    out.arbolElegido = P.arbol:elegida()
    -- Task 22: si al cambiar de pestaña nadie recogió la petición, Grupos llama a abrir() de la página (se busca al pulsar) y
    -- la petición no se queda guardada.
    SnetForever.Principal.abrir("grupos")
    local elegir = SnetForever.Principal.elegir
    SnetForever.Principal.elegir = function() end
    SnetForever.PrincipalOperaciones = {abrir = function(tipo, nombre) pedidas[#pedidas + 1] = {tipo, nombre} end}
    G.tarjetas.subasta.filas[1].botonAbrir:Click("LeftButton")
    out.pedidas = pedidas
    out.pendiente = G.operacionPedida
    SnetForever.PrincipalOperaciones = P
    SnetForever.Principal.elegir = elegir
    return out
  end)()`);
  assert.equal(r.pestana, 'operaciones');
  assert.deepEqual(r.elegida, ['subasta', 'Alta'], 'la operación queda elegida en la página Operaciones');
  assert.equal(r.arbolElegido, 'o:subasta:Alta');
  assert.equal(r.pedida, undefined, 'la petición se borra una vez usada');
  assert.deepEqual(r.pedidas, [['subasta', 'Alta']]);
  assert.equal(r.pendiente, undefined, 'sin recoger, abrir() la atiende y no queda guardada');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Task 20b: Grupos › Objetos como TSM (título con copiar, sin casillas, elegir pulsando, árbol plegable, letra pequeña)
// ---------------------------------------------------------------------------------------------------

function bolsaCon(m, ids) {
  m.huecos(0, Math.max(16, ids.length));
  ids.forEach((id, i) => {
    m.itemInfo(id, { nombre: `Objeto ${id}`, calidad: 1 });
    m.bolsa(0, i + 1, { id });
  });
}

test('cada lista tiene su título con el texto claro y el icono de copiar; Grupo Base no lleva título', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    local out = {}
    elegir("")
    out.base = {cabecera = G.tablaBase.cabecera:IsShown(), titulo = G.tablaBase.textoTitulo == nil, copiar = G.tablaBase.botonCopiar == nil,
      botonFuera = G.botonCopiarBase:IsShown(), bordes = G.tablaBase.bordes ~= nil}
    elegir("Hierbas")
    local function titulo(t)
      local c = {t.textoTitulo:GetTextColor()}
      local texto = SnetForever.Tema.color("texto")
      return {t.textoTitulo:GetText(), t.botonCopiar:IsShown(), math.abs(c[1] - texto[1]) < 0.01, t.bordes ~= nil, t.cabeceras.obj:IsShown()}
    end
    out.izq, out.der = titulo(G.tablaSinGrupo), titulo(G.tablaEnGrupo)
    return out
  end)()`);
  assert.deepEqual(r.base, { cabecera: false, titulo: true, copiar: true, botonFuera: true, bordes: true });
  assert.deepEqual(r.izq, ['Objetos sin grupo', true, true, true, false]);
  assert.deepEqual(r.der, ['Objetos en el grupo', true, true, true, false]);
  sinErrores(m);
});

test('copiar abre la ventana de texto con las claves que se ven, separadas por comas, sin secciones y con el filtro', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [2589, 2592, 7000]);
  m.itemInfo(2589, { nombre: 'Paño de lino', calidad: 1 });
  m.itemInfo(2592, { nombre: 'Paño de lana', calidad: 1 });
  m.itemInfo(7000, { nombre: 'Hierba', calidad: 1 });
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    local out = {}
    G.tablaSinGrupo.botonCopiar:Click("LeftButton")
    out.todo = {G.texto:IsShown(), G.texto.caja:GetText()}
    G.cerrarTodo()
    G.campoObjetosGrupo:SetText("paño")
    G.campoObjetosGrupo:GetScript("OnTextChanged")(G.campoObjetosGrupo, true)
    G.tablaSinGrupo.botonCopiar:Click("LeftButton")
    out.filtro = {G.texto:IsShown(), G.texto.caja:GetText()}
    G.cerrarTodo()
    -- Derecha vacía: no hace nada.
    G.tablaEnGrupo.botonCopiar:Click("LeftButton")
    out.vacia = G.texto:IsShown()
    -- Con objetos en el grupo.
    A.poner("i:7000", "Hierbas")
    G.campoObjetosGrupo:SetText("")
    G.campoObjetosGrupo:GetScript("OnTextChanged")(G.campoObjetosGrupo, true)
    G.tablaEnGrupo.botonCopiar:Click("LeftButton")
    out.derecha = {G.texto:IsShown(), G.texto.caja:GetText()}
    return out
  end)()`);
  assert.deepEqual(r.todo, [true, 'i:7000,i:2592,i:2589']);
  assert.deepEqual(r.filtro, [true, 'i:2592,i:2589']);
  assert.equal(r.vacia, false);
  assert.deepEqual(r.derecha, [true, 'i:7000']);
  sinErrores(m);
});

test('el copiar de Grupo Base hace lo mismo y no copia lo plegado', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [10, 11]);
  const r = m.lua(`(function()
    ${DERECHA}
    elegir("")
    local out = {}
    G.botonCopiarBase:Click("LeftButton")
    out.base = {G.texto:IsShown(), G.texto.caja:GetText()}
    G.cerrarTodo()
    pulsar(G.tablaBase, "\\1bolsas")
    G.botonCopiarBase:Click("LeftButton")
    out.plegada = G.texto:IsShown()
    return out
  end)()`);
  assert.deepEqual(r.base, [true, 'i:10,i:11']);
  assert.equal(r.plegada, false);
  sinErrores(m);
});

test('no hay casillas en las tres listas ni columna ✓', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [10, 11]);
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    local out = {}
    local function sin(t)
      local n = 0
      for _, f in ipairs(t.filas) do if f.casilla then n = n + 1 end end
      return {n, t.botonMarcar == nil}
    end
    elegir("")
    out.base = sin(G.tablaBase)
    elegir("Hierbas")
    out.izq, out.der = sin(G.tablaSinGrupo), sin(G.tablaEnGrupo)
    return out
  end)()`);
  assert.deepEqual(r, { base: [0, true], izq: [0, true], der: [0, true] });
  sinErrores(m);
});

test('B3s, como TSM: el clic suma o quita esa fila; Alt+clic elige el tramo; las secciones no se eligen', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [1, 2, 3, 4, 5]);
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    local T, out = G.tablaSinGrupo, {}
    local function estado() return {elegidas(T), G.botonAnadir.texto:GetText()} end
    pulsar(T, "i:2");          out.uno = estado()
    pulsar(T, "i:4");          out.suma = estado()
    pulsar(T, "i:1");          out.sumaOtra = estado()
    pulsar(T, "i:4");          out.quita = estado()
    pulsar(T, "i:2");          out.quitaOtra = estado()
    pulsar(T, "i:5", "alt");   out.tramo = estado()
    pulsar(T, "i:1", "alt");   out.tramoAtras = estado()
    pulsar(T, "\\1padre");     out.seccion = estado()
    return out
  end)()`);
  assert.deepEqual(r.uno, [['i:2'], 'Añadir 1 objeto']);
  assert.deepEqual(r.suma, [['i:2', 'i:4'], 'Añadir 2 objetos'], 'el clic suma sin quitar las demás');
  assert.deepEqual(r.sumaOtra, [['i:1', 'i:2', 'i:4'], 'Añadir 3 objetos']);
  assert.deepEqual(r.quita, [['i:1', 'i:2'], 'Añadir 2 objetos'], 'el clic en una elegida la quita');
  assert.deepEqual(r.quitaOtra, [['i:1'], 'Añadir 1 objeto']);
  assert.deepEqual(r.tramo, [['i:2', 'i:3', 'i:4', 'i:5'], 'Añadir 4 objetos'], 'Alt: el tramo desde la última pulsada');
  assert.deepEqual(r.tramoAtras, [['i:1', 'i:2'], 'Añadir 2 objetos'], 'Alt: también hacia atrás');
  assert.deepEqual(r.seccion[0], ['i:1', 'i:2'], 'pulsar una sección no cambia lo elegido');
  sinErrores(m);
});

test('lo elegido sobrevive a desplazar la lista y se va si la fila deja de estar', necesitaComercio, () => {
  const m = maquina();
  const ids = [];
  for (let i = 1; i <= 120; i++) ids.push(i);
  bolsaCon(m, ids);
  const r = m.lua(`(function()
    ${DERECHA}
    elegir("")
    local T, out = G.tablaBase, {}
    local item = claves(T)[1]
    pulsar(T, item)
    T:irA(60)
    out.lejos = {T:marcadas()[item], G.botonMover.texto:GetText()}
    T:irA(1)
    out.vuelve = #elegidas(T)
    A.crear("", "Hierbas"); A.poner(item, "Hierbas")
    G.arbol:refrescar(); G.arbol:elegir("")
    out.fuera = {T:marcadas()[item] == true, G.botonMover.texto:GetText()}
    return out
  end)()`);
  assert.deepEqual(r.lejos, [true, 'Mover 1 objeto']);
  assert.equal(r.vuelve, 1);
  assert.deepEqual(r.fuera, [false, 'Mover 0 objetos']);
  sinErrores(m);
});

test('Mover cuenta lo elegido y queda a cero', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [10, 11, 12]);
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("")
    G.ponerDestino("Hierbas")
    pulsar(G.tablaBase, "i:10")
    pulsar(G.tablaBase, "i:12")
    local out = {antes = G.botonMover.texto:GetText()}
    G.botonMover:Click("LeftButton")
    out.despues = {G.botonMover.texto:GetText(), next(G.tablaBase:marcadas()) == nil, A.objeto("i:10"), A.objeto("i:11") or "sin grupo", A.objeto("i:12")}
    return out
  end)()`);
  assert.equal(r.antes, 'Mover 2 objetos');
  assert.deepEqual(r.despues, ['Mover 0 objetos', true, 'Hierbas', 'sin grupo', 'Hierbas']);
  sinErrores(m);
});

test('las dos secciones salen siempre, aunque estén vacías, y pulsarlas las pliega y las despliega con su triángulo', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("Hierbas") -- primer nivel: su padre es Grupo Base; bolsas vacías
    local T, out = G.tablaSinGrupo, {}
    local function cabeza(clave)
      for _, f in ipairs(T.filas) do
        if f:IsShown() and f.clave == clave then
          local c = {f.celdas.obj.texto:GetTextColor()}
          local a = SnetForever.Tema.color("acento")
          return {f.celdas.obj.texto:GetText(), f.celdas.obj.triangulo:IsShown(), f.fila.plegada,
            math.abs(c[1] - a[1]) < 0.01 and math.abs(c[2] - a[2]) < 0.01 and math.abs(c[3] - a[3]) < 0.01,
            (f.celdas.obj.triangulo:GetTexCoord())}
        end
      end
    end
    local function lista() local o = {}; for _, l in ipairs(T.filas) do if l:IsShown() then o[#o + 1] = l.clave end end; return o end
    out.vacias = lista()
    out.bolsas, out.padre = cabeza("\\1bolsas"), cabeza("\\1padre")
    pulsar(T, "\\1bolsas")
    out.plegada = cabeza("\\1bolsas")
    out.listaPlegada = lista()
    pulsar(T, "\\1bolsas")
    out.desplegada = cabeza("\\1bolsas")
    return out
  end)()`);
  assert.deepEqual(r.vacias, ['\u0001bolsas', '\u0001padre']);
  assert.deepEqual(r.bolsas.slice(0, 4), ['Objetos sin grupo en las bolsas', true, false, true]);
  assert.deepEqual(r.padre.slice(0, 4), ['Objetos del grupo padre', true, false, true]);
  assert.equal(r.plegada[2], true);
  assert.notEqual(r.plegada[4], r.bolsas[4], 'el triángulo cambia (▼ a ▶)');
  assert.deepEqual(r.listaPlegada, ['\u0001bolsas', '\u0001padre']);
  assert.equal(r.desplegada[2], false);
  assert.equal(r.desplegada[4], r.bolsas[4]);
  sinErrores(m);
});

test('plegar una sección quita sus objetos, es por sección y no por grupo', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [10, 11]);
  m.itemInfo(20, { nombre: 'Del padre', calidad: 1 });
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Raras"); A.crear("", "Otro")
    A.poner("i:20", "Hierbas")
    elegir("Hierbas\`Raras")
    local T, out = G.tablaSinGrupo, {}
    out.todo = claves(T)
    pulsar(T, "\\1bolsas")
    out.sinBolsas = claves(T)
    elegir("Otro")
    out.otro = claves(T)
    pulsar(T, "\\1padre")
    elegir("Hierbas\`Raras")
    out.vuelta = claves(T)
    pulsar(T, "\\1bolsas"); pulsar(T, "\\1padre")
    out.final = claves(T)
    return out
  end)()`);
  assert.deepEqual(r.todo, ['i:10', 'i:11', 'i:20']);
  assert.deepEqual(r.sinBolsas, ['i:20']);
  assert.deepEqual(r.otro, [], 'lo plegado es por sección, no por grupo');
  assert.deepEqual(r.vuelta, []);
  assert.deepEqual(r.final, ['i:10', 'i:11', 'i:20']);
  sinErrores(m);
});

test('los objetos van con sangría bajo su sección; Grupo Base tiene su sola sección plegable', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [10]);
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    local function izq(t, clave)
      for _, f in ipairs(t.filas) do
        if f:IsShown() and f.clave == clave then
          local _, _, _, x = f.celdas.obj.icono:GetPoint(1)
          return x
        end
      end
    end
    local out = {}
    elegir("")
    out.baseSeccion = G.tablaBase:fila(1).seccion
    out.baseSangria = izq(G.tablaBase, "i:10")
    pulsar(G.tablaBase, "\\1bolsas")
    out.basePlegada = G.tablaBase:cuantas()
    pulsar(G.tablaBase, "\\1bolsas")
    elegir("Hierbas")
    out.sub = izq(G.tablaSinGrupo, "i:10")
    A.poner("i:10", "Hierbas")
    elegir("Hierbas")
    out.derecha = izq(G.tablaEnGrupo, "i:10")
    return out
  end)()`);
  assert.equal(r.baseSeccion, true);
  assert.equal(r.baseSangria, 20);
  assert.equal(r.basePlegada, 1);
  assert.equal(r.sub, 20);
  assert.equal(r.derecha, 6, 'la lista de la derecha no tiene secciones: sin sangría');
  sinErrores(m);
});

// B3r: 0,83 de la letra «tabla» del tema (12): 10; antes 9 y 11.
test('la letra de las filas de las tres listas es la nueva (10) y la de otra tabla no cambia (12)', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [10]);
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); A.poner("i:10", "Hierbas")
    local function tam(t)
      for _, f in ipairs(t.filas) do
        if f:IsShown() then local _, s = f.celdas.obj.texto:GetFont(); return s end
      end
    end
    local out = {}
    elegir("")
    out.base = tam(G.tablaBase)
    elegir("Hierbas")
    out.izq, out.der = tam(G.tablaSinGrupo), tam(G.tablaEnGrupo)
    local otra = SnetForever.Piezas.tabla(UIParent, {columnas = {{clave = "a", titulo = "A", flex = true, valor = function(f) return f.clave end}}})
    otra:SetSize(200, 100)
    otra:poner({{clave = "x"}})
    local _, s = otra.filas[1].celdas.a.texto:GetFont()
    out.otra = s
    return out
  end)()`);
  assert.deepEqual(r, { base: 10, izq: 10, der: 10, otra: 12 });
  sinErrores(m);
});

test('la carpeta de la cabecera toma el color del nivel del grupo y cambia con él', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Raras")
    local Tema = SnetForever.Tema
    local function igual(tex, token)
      local c, t = {tex:GetVertexColor()}, Tema.color(token)
      return math.abs(c[1] - t[1]) < 0.01 and math.abs(c[2] - t[2]) < 0.01 and math.abs(c[3] - t[3]) < 0.01
    end
    local out = {}
    elegir("")
    out.base = igual(G.cabecera.icono, "base")
    elegir("Hierbas")
    out.n1 = igual(G.cabecera.icono, "nivel1")
    elegir("Hierbas\`Raras")
    out.n2 = igual(G.cabecera.icono, "nivel2")
    elegir("")
    out.otraVez = igual(G.cabecera.icono, "base")
    return out
  end)()`);
  assert.deepEqual(r, { base: true, n1: true, n2: true, otraVez: true });
  sinErrores(m);
});

test('al cambiar de grupo se vacía lo elegido en las tres listas, los botones vuelven a 0 y Alt no sale de una fila vieja', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [10, 11, 12]);
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); A.crear("", "Otro")
    A.poner("i:20", "Hierbas")
    G.ponerDestino("Otro")
    local out = {}
    elegir("")
    pulsar(G.tablaBase, "i:10")
    out.baseAntes = G.botonMover.texto:GetText()
    elegir("Hierbas")
    pulsar(G.tablaSinGrupo, "i:10")
    pulsar(G.tablaEnGrupo, "i:20")
    out.antes = {G.botonAnadir.texto:GetText(), G.botonQuitar.texto:GetText()}
    elegir("Otro")
    out.despues = {G.botonAnadir.texto:GetText(), G.botonQuitar.texto:GetText(), G.botonMover.texto:GetText(),
      next(G.tablaSinGrupo:marcadas()) == nil, next(G.tablaEnGrupo:marcadas()) == nil, next(G.tablaBase:marcadas()) == nil}
    out.apagados = {G.botonAnadir.snfApagado, G.botonQuitar.snfApagado}
    G.botonAnadir:Click("LeftButton")
    out.nadaAnadido = A.objeto("i:10") == nil
    -- Alt (el tramo) sin pulsar antes: solo esa fila.
    pulsar(G.tablaSinGrupo, "i:12", "alt")
    out.mayus = elegidas(G.tablaSinGrupo)
    return out
  end)()`);
  assert.equal(r.baseAntes, 'Mover 1 objeto');
  assert.deepEqual(r.antes, ['Añadir 1 objeto', 'Quitar 1 objeto']);
  assert.deepEqual(r.despues, ['Añadir 0 objetos', 'Quitar 0 objetos', 'Mover 0 objetos', true, true, true]);
  assert.deepEqual(r.apagados, [true, true]);
  assert.equal(r.nadaAnadido, true);
  assert.deepEqual(r.mayus, ['i:12'], 'Alt sin pulsar antes: solo esa fila');
  sinErrores(m);
});

// Task 20e: «Objetos padre» tiene que verse sin desplazar la lista. En un subgrupo la sección de las bolsas empieza plegada
// si, desplegada, dejaría la cabecera de «Objetos padre» fuera de la vista: sus filas más las dos cabeceras no caben.
// Lo que el jugador pliegue o despliegue a mano manda sobre esa regla.
function bolsaLlena(m, n) {
  bolsaCon(m, Array.from({ length: n }, (_, i) => 100 + i));
}
const SECCIONES = `
  local function cabeza(T, clave)
    for _, f in ipairs(T.filas) do
      if f:IsShown() and f.clave == clave then return f end
    end
  end
  local function vistas(T)
    local o = {}
    for _, l in ipairs(T.filas) do if l:IsShown() then o[#o + 1] = l.clave end end
    return o
  end`;

test('subgrupo con más objetos sin grupo de los que caben: bolsas plegada y «Objetos padre» se ve sin desplazar', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 120);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    A.crear("", "Hierbas"); A.crear("Hierbas", "Raras")
    elegir("Hierbas\`Raras")
    local T = G.tablaSinGrupo
    local b, p = cabeza(T, "\\1bolsas"), cabeza(T, "\\1padre")
    return {capacidad = T:capacidad(), bolsas = b and b.fila.plegada, padre = p ~= nil, vistas = vistas(T), cuantas = T:cuantas(),
      triangulo = b and b.celdas.obj.triangulo:IsShown()}
  end)()`);
  assert.ok(r.capacidad > 5 && r.capacidad < 120, 'la lista mide ' + r.capacidad + ' filas');
  assert.equal(r.bolsas, true, 'la sección de las bolsas empieza plegada');
  assert.equal(r.padre, true, '«Objetos padre» se ve sin desplazar');
  assert.deepEqual(r.vistas, ['\u0001bolsas', '\u0001padre']);
  assert.equal(r.cuantas, 2);
  assert.equal(r.triangulo, true);
  sinErrores(m);
});

test('el tope es justo: con filas + 2 cabeceras igual a lo que cabe sale desplegada y con una más, plegada', necesitaComercio, () => {
  const m = maquina();
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    return G.tablaSinGrupo:capacidad()
  end)()`);
  const cap = r;
  const estado = (n) => {
    const m2 = maquina();
    bolsaLlena(m2, n);
    return m2.lua(`(function()
      ${DERECHA}
      ${SECCIONES}
      A.crear("", "Hierbas")
      elegir("Hierbas")
      return {plegada = cabeza(G.tablaSinGrupo, "\\1bolsas").fila.plegada, padre = cabeza(G.tablaSinGrupo, "\\1padre") ~= nil}
    end)()`);
  };
  assert.deepEqual(estado(cap - 2), { plegada: false, padre: true }, 'caben justo');
  assert.deepEqual(estado(cap - 1), { plegada: true, padre: true }, 'una más y «Objetos padre» quedaría fuera');
  sinErrores(m);
});

test('con pocos objetos sin grupo la sección de las bolsas sale desplegada', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 3);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    return {plegada = cabeza(G.tablaSinGrupo, "\\1bolsas").fila.plegada, vistas = #vistas(G.tablaSinGrupo)}
  end)()`);
  assert.equal(r.plegada, false);
  assert.equal(r.vistas, 5, 'las dos cabeceras y los tres objetos');
  sinErrores(m);
});

test('Grupo Base no cambia: con muchos objetos su sección sigue desplegada', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 120);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    elegir("")
    return {plegada = cabeza(G.tablaBase, "\\1bolsas").fila.plegada, cuantas = G.tablaBase:cuantas()}
  end)()`);
  assert.equal(r.plegada, false);
  assert.equal(r.cuantas, 121);
  sinErrores(m);
});

test('si el jugador la despliega a mano y cambia de grupo, sigue desplegada aunque no quepa', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 120);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    A.crear("", "Hierbas"); A.crear("", "Otro")
    elegir("Hierbas")
    local T, out = G.tablaSinGrupo, {}
    out.alAbrir = cabeza(T, "\\1bolsas").fila.plegada
    pulsar(T, "\\1bolsas") -- la despliega a mano
    out.desplegada = cabeza(T, "\\1bolsas").fila.plegada
    out.cuantasDesplegada = T:cuantas()
    elegir("Otro")
    elegir("Hierbas")
    out.alVolver = cabeza(T, "\\1bolsas").fila.plegada
    out.cuantasAlVolver = T:cuantas()
    return out
  end)()`);
  assert.equal(r.alAbrir, true);
  assert.equal(r.desplegada, false);
  assert.equal(r.cuantasDesplegada, 122);
  assert.equal(r.alVolver, false, 'su elección manda sobre la regla');
  assert.equal(r.cuantasAlVolver, 122);
  sinErrores(m);
});

test('si la pliega a mano, sigue plegada aunque quepa', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 3);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    A.crear("", "Hierbas"); A.crear("", "Otro")
    elegir("Hierbas")
    local T, out = G.tablaSinGrupo, {}
    out.alAbrir = cabeza(T, "\\1bolsas").fila.plegada
    pulsar(T, "\\1bolsas") -- la pliega a mano
    out.plegada = cabeza(T, "\\1bolsas").fila.plegada
    elegir("Otro")
    elegir("Hierbas")
    out.alVolver = cabeza(T, "\\1bolsas").fila.plegada
    out.cuantas = T:cuantas()
    return out
  end)()`);
  assert.equal(r.alAbrir, false);
  assert.equal(r.plegada, true);
  assert.equal(r.alVolver, true);
  assert.equal(r.cuantas, 2);
  sinErrores(m);
});

// Ronda 1: el plegado automático se decide una vez por apertura del grupo (al cambiar de grupo, o en el primer tamaño válido de
// la lista) y se guarda hasta cambiar de grupo.
test('con la sección desplegada y 5 elegidos, un cambio de bolsas que haría que no cupiera no la pliega ni borra lo elegido', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 10);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    local T, out = G.tablaSinGrupo, {}
    out.capacidad = T:capacidad()
    out.alAbrir = cabeza(T, "\\1bolsas").fila.plegada
    for i = 0, 4 do pulsar(T, "i:" .. (100 + i), true) end
    out.antes = #elegidas(T)
    return out
  end)()`);
  assert.ok(r.capacidad >= 12, 'caben las 10 filas y las dos cabeceras');
  assert.equal(r.alAbrir, false);
  assert.equal(r.antes, 5);
  bolsaLlena(m, 120);
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(1);
  const r2 = m.lua(`(function()
    ${SECCIONES}
    local T = SnetForever.PrincipalGrupos.tablaSinGrupo
    local n = 0
    for _ in pairs(T:marcadas()) do n = n + 1 end
    return {plegada = cabeza(T, "\\1bolsas").fila.plegada, marcadas = n, cuantas = T:cuantas()}
  end)()`);
  assert.equal(r2.plegada, false, 'la decisión de la apertura se guarda');
  assert.equal(r2.marcadas, 5, 'lo elegido sigue elegido');
  assert.equal(r2.cuantas, 122);
  sinErrores(m);
});

test('escribir y borrar en el buscador no pliega ni despliega la sección de las bolsas', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 120);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    local T, out = G.tablaSinGrupo, {}
    local function escribir(texto)
      G.campoObjetosGrupo:SetText(texto)
      G.campoObjetosGrupo:GetScript("OnTextChanged")(G.campoObjetosGrupo, true)
      return cabeza(T, "\\1bolsas").fila.plegada
    end
    out.alAbrir = cabeza(T, "\\1bolsas").fila.plegada
    out.escrito = escribir("Objeto 100")
    out.borrado = escribir("")
    return out
  end)()`);
  assert.deepEqual(r, { alAbrir: true, escrito: true, borrado: true });
  sinErrores(m);
});

test('la decisión se vuelve a tomar al cambiar de grupo, con las bolsas de ese momento', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 3);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    A.crear("", "Hierbas"); A.crear("", "Otro")
    elegir("Hierbas")
    return cabeza(G.tablaSinGrupo, "\\1bolsas").fila.plegada
  end)()`);
  assert.equal(r, false);
  bolsaLlena(m, 120);
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(1);
  const r2 = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    elegir("Otro")
    return cabeza(G.tablaSinGrupo, "\\1bolsas").fila.plegada
  end)()`);
  assert.equal(r2, true);
  sinErrores(m);
});

test('si la lista no tenía alto al abrir, la regla se aplica en el primer tamaño válido y por el freno de repintado', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 120);
  m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    local T = G.tablaSinGrupo
    G.capacidadReal = T.capacidad
    T.capacidad = function() return nil end -- sin alto todavía
    elegir("Hierbas")
  end)()`);
  const r = m.lua(`(function()
    ${SECCIONES}
    local T = SnetForever.PrincipalGrupos.tablaSinGrupo
    return cabeza(T, "\\1bolsas").fila.plegada
  end)()`);
  assert.equal(r, false, 'sin alto no se decide: sale desplegada');
  m.lua(`(function()
    local G = SnetForever.PrincipalGrupos
    local T = G.tablaSinGrupo
    T.capacidad = G.capacidadReal
    T:GetScript("OnSizeChanged")(T)
  end)()`);
  const luego = m.lua(`(function()
    ${SECCIONES}
    local T = SnetForever.PrincipalGrupos.tablaSinGrupo
    return cabeza(T, "\\1bolsas").fila.plegada
  end)()`);
  assert.equal(luego, false, 'el repintado espera al freno, no es inmediato');
  m.avanzar(1);
  const despues = m.lua(`(function()
    ${SECCIONES}
    local T = SnetForever.PrincipalGrupos.tablaSinGrupo
    return cabeza(T, "\\1bolsas").fila.plegada
  end)()`);
  assert.equal(despues, true);
  sinErrores(m);
});

test('con la sección de las bolsas plegada a mano no se recorren las bolsas ni se pregunta al juego por sus objetos', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 3);
  m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    pulsar(G.tablaSinGrupo, "\\1bolsas") -- plegada a mano (con 3 caben: salía desplegada)
  end)()`);
  const antes = m.llamadas('C_Container.GetContainerItemInfo').length;
  assert.ok(antes > 0, 'al desplegada se recorrieron las bolsas');
  m.lua(`(function()
    local G = SnetForever.PrincipalGrupos
    G.campoObjetosGrupo:SetText("Rama")
    G.campoObjetosGrupo:GetScript("OnTextChanged")(G.campoObjetosGrupo, true)
  end)()`);
  m.huecos(0, 40);
  m.bolsa(0, 31, { id: 999 });
  m.disparar('BAG_UPDATE_DELAYED');
  m.avanzar(1);
  assert.equal(m.llamadas('C_Container.GetContainerItemInfo').length, antes, 'plegada a mano no se recorren las bolsas');
  sinErrores(m);
});

test('al cerrar la ventana y volver a abrirla en el mismo grupo, la regla se decide otra vez con las bolsas de ahora', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 3);
  const r = m.lua(`(function()
    ${DERECHA}
    ${SECCIONES}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    return cabeza(G.tablaSinGrupo, "\\1bolsas").fila.plegada
  end)()`);
  assert.equal(r, false, 'con 3 objetos sale desplegada');
  m.lua('SnetForever.Principal.cerrar()');
  bolsaLlena(m, 120);
  const r2 = m.lua(`(function()
    ${SECCIONES}
    SnetForever.Principal.abrir("grupos")
    local T = SnetForever.PrincipalGrupos.tablaSinGrupo
    return {plegada = cabeza(T, "\\1bolsas").fila.plegada, padre = cabeza(T, "\\1padre") ~= nil, cuantas = T:cuantas()}
  end)()`);
  assert.deepEqual(r2, { plegada: true, padre: true, cuantas: 2 });
  sinErrores(m);
});

test('al volver a abrir la ventana, lo que el jugador eligió a mano sigue mandando', necesitaComercio, () => {
  const m = maquina();
  bolsaLlena(m, 3);
  m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    pulsar(G.tablaSinGrupo, "\\1bolsas") -- la pliega a mano
  end)()`);
  m.lua('SnetForever.Principal.cerrar()');
  bolsaLlena(m, 120);
  const r = m.lua(`(function()
    ${SECCIONES}
    SnetForever.Principal.abrir("grupos")
    local T = SnetForever.PrincipalGrupos.tablaSinGrupo
    return {cabeza(T, "\\1bolsas").fila.plegada, T:cuantas()}
  end)()`);
  assert.deepEqual(r, [true, 2]);
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// T1a: el tooltip del objeto en las listas, el nombre con su sufijo, los ligados y los nombres que empiezan por «/»
// ---------------------------------------------------------------------------------------------------

// Lo que se pide al tooltip (SetHyperlink y SetItemByID) y dónde se ancla.
const ESPIA_TT = `_G.ENLACES = {}; _G.PORID = {}
  local h, i = GameTooltip.SetHyperlink, GameTooltip.SetItemByID
  GameTooltip.SetHyperlink = function(self, e) table.insert(ENLACES, e); return h(self, e) end
  GameTooltip.SetItemByID = function(self, id) table.insert(PORID, id); return i(self, id) end
  local function filaDe(t, clave)
    for _, x in ipairs(t.filas) do
      if x:IsShown() and x.clave == clave then return x end
    end
  end
  -- Entra en la fila, mira el tooltip y sale: {visible, dueño es la fila, punto, punto de la fila, 1.ª línea, visible al salir}.
  local function pasar(t, clave)
    local f = filaDe(t, clave)
    f:GetScript("OnEnter")(f)
    local p, r, rp = GameTooltip:GetPoint(1)
    local out = {GameTooltip:IsShown(), GameTooltip:GetOwner() == f, p, rp, (BANCO.lineasTooltip())[1] or false}
    f:GetScript("OnLeave")(f)
    BANCO.avanzar(0.3) -- se esconde pasada la espera (ronda 1: así no sale y se va al cruzar de una fila a otra)
    out[6] = GameTooltip:IsShown()
    return out
  end`;
const BOLSAS_TT = (m) => {
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2 });
  m.itemInfo(11, { nombre: 'Cristal nexo', calidad: 4 });
  m.bolsa(0, 1, { id: 10 });
  m.bolsa(0, 2, { id: 11 });
};

for (const [sitio, preparar, lista, clave] of [
  ['Grupo Base (objetos sin grupo en las bolsas)', 'elegir("")', 'G.tablaBase', 'i:10'],
  ['«Objetos sin grupo» de un subgrupo', 'elegir("Hierbas")', 'G.tablaSinGrupo', 'i:10'],
  ['«Objetos en el grupo»', 'A.poner("i:11", "Hierbas"); elegir("Hierbas")', 'G.tablaEnGrupo', 'i:11'],
  ['«Objetos del grupo padre»', 'A.poner("i:11", "Hierbas"); A.crear("Hierbas", "Raras"); elegir("Hierbas`Raras")', 'G.tablaSinGrupo', 'i:11'],
]) {
  test(`con el ratón sobre un objeto de ${sitio} sale su tooltip anclado a la fila y al salir se esconde`, necesitaComercio, () => {
    const m = maquina();
    BOLSAS_TT(m);
    const r = m.lua(`(function()
      ${DERECHA}
      ${ESPIA_TT}
      A.crear("", "Hierbas")
      ${preparar}
      return {pasar(${lista}, "${clave}"), PORID, #ENLACES}
    end)()`);
    const bolsa = clave === 'i:10';
    assert.deepEqual(r[0], [true, true, 'LEFT', 'RIGHT', bolsa ? 'Rama simple' : 'Cristal nexo', false], 'sale a la derecha de la fila y se esconde al salir');
    // Lo de las bolsas lleva el enlace de su hueco (SetHyperlink); lo de un grupo, solo su id (SetItemByID).
    assert.deepEqual([r[1], r[2]], bolsa ? [[], 1] : [[11], 0]);
    sinErrores(m);
  });
}

test('las filas que no son objetos no sacan tooltip de objeto (las secciones de las listas de Grupos)', necesitaComercio, () => {
  const m = maquina();
  BOLSAS_TT(m);
  const r = m.lua(`(function()
    ${DERECHA}
    ${ESPIA_TT}
    A.crear("", "Hierbas")
    elegir("Hierbas")
    local out = {objeto = pasar(G.tablaSinGrupo, "i:10")[1]}
    out.bolsas = pasar(G.tablaSinGrupo, "\\1bolsas")[1]
    out.padre = pasar(G.tablaSinGrupo, "\\1padre")[1]
    out.pedidos = #ENLACES + #PORID
    return out
  end)()`);
  assert.deepEqual(r, { objeto: true, bolsas: false, padre: false, pedidos: 1 });
  sinErrores(m);
});

test('el nombre con sufijo sale del enlace, en los dos formatos de enlace (las bolsas de Grupos)', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(15248, { nombre: 'Hacha Natocolina', calidad: 1 });
  m.itemInfo(15249, { nombre: 'Mazo Secacorteza', calidad: 1 });
  const hacha = '|cff1eff00|Hitem:15248::::::::20:::::::|h[Hacha Natocolina de espíritu]|h|r';
  const mazo = '|cnIQ3:|Hitem:15249::::::::20:::::::|h[Mazo Secacorteza del oso]|h|r';
  m.bolsa(0, 1, { id: 15248, enlace: hacha });
  m.bolsa(0, 2, { id: 15249, enlace: mazo });
  const r = m.lua(`(function()
    ${DERECHA}
    ${ESPIA_TT}
    elegir("")
    local out = {filas = lineas(G.tablaBase)}
    out.tt = pasar(G.tablaBase, "i:15248")
    out.enlaces = ENLACES
    out.porId = #PORID
    -- El buscador encuentra el nombre con su sufijo.
    G.campoObjetosBase:SetText("espiritu")
    G.campoObjetosBase:GetScript("OnTextChanged")(G.campoObjetosBase, true)
    out.buscado = claves(G.tablaBase)
    return out
  end)()`);
  assert.deepEqual(r.filas.slice(1), [['i:15248', '|cff1eff00Hacha Natocolina de espíritu|r'], ['i:15249', '|cff0070ddMazo Secacorteza del oso|r']],
    'el nombre y el color salen del enlace: |cff… y |cnIQ3: (azul)');
  assert.equal(r.tt[0], true);
  assert.deepEqual(r.enlaces, [hacha], 'el tooltip con el enlace de la bolsa: SetHyperlink');
  assert.equal(r.porId, 0);
  assert.deepEqual(r.buscado, ['i:15248']);
  assert.ok(!JSON.stringify(m.guardado()).includes('espíritu'), 'el enlace no se guarda');
  sinErrores(m);
});

// TSM (App/MainUI/Groups/BaseGroup.lua e Items.lua) llena «Objetos sin grupo en las bolsas» con los huecos de las bolsas que
// no están ligados (isBound = false): un objeto ligado no se puede subastar y no sale.
test('los objetos ligados no salen en Objetos sin grupo en las bolsas', necesitaComercio, () => {
  const m = maquina();
  m.itemInfo(6948, { nombre: 'Piedra de hogar', calidad: 1 });
  m.itemInfo(15248, { nombre: 'Hacha Natocolina', calidad: 2 });
  m.itemInfo(10, { nombre: 'Rama simple', calidad: 2 });
  m.bolsa(0, 1, { id: 6948, ligado: true });
  m.bolsa(0, 2, { id: 15248, ligado: true }); // una ligada y otra sin ligar del mismo objeto: sale (la que se puede vender)
  m.bolsa(0, 3, { id: 15248, enlace: '|cff1eff00|Hitem:15248::::::::20:::::::|h[Hacha Natocolina de espíritu]|h|r' });
  m.bolsa(0, 4, { id: 10 });
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    elegir("")
    local out = {base = lineas(G.tablaBase)}
    elegir("Hierbas")
    out.sub = claves(G.tablaSinGrupo)
    return out
  end)()`);
  assert.deepEqual(r.base.map((f) => f[0]), ['\u0001bolsas', 'i:15248', 'i:10']);
  assert.equal(r.base[1][1], '|cff1eff00Hacha Natocolina de espíritu|r', 'con el enlace de la que no está ligada');
  assert.deepEqual(r.sub, ['i:15248', 'i:10']);
  sinErrores(m);
});

test('un nombre de grupo que empieza por / no se crea, ni se renombra, ni se importa, y el campo lo dice', necesitaComercio, () => {
  const m = maquina();
  const comando = '/run local f=SnetForever.Principal';
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    -- Uno que ya existía con ese nombre (de antes de esta versión): no se borra.
    SnetForeverCuenta.comercio.v2.grupos["/viejo"] = true
    A.olvidarIndice()
    G.arbol:refrescar()
    local out = {}
    out.mensaje = SnetForever.L.t("PRINCIPAL_GRUPOS_NOMBRE_COMANDO")
    -- Crear con el campo de la fila nueva (también con espacios delante).
    local f = fila("Hierbas"); f:GetScript("OnEnter")(f); f.botones[1]:Click("LeftButton")
    for i, t in ipairs({${JSON.stringify(comando)}, "   /dance"}) do
      G.campoNuevo:SetText(t)
      G.campoNuevo:GetScript("OnEnterPressed")(G.campoNuevo)
      out["crear" .. i] = {sigue = G.campoNuevo:IsShown(), error = G.campoNuevo.snfError or false, hijos = #A.hijos("Hierbas")}
    end
    G.campoNuevo:GetScript("OnEscapePressed")(G.campoNuevo)
    G.campoNuevo:GetScript("OnEditFocusLost")(G.campoNuevo)
    -- Ni por debajo (Arbol.crear y Arbol.renombrar).
    out.arbolCrear = A.crear("", "/x") == nil and A.crear("", "  /x") == nil
    -- Renombrar con ✎.
    elegir("Hierbas")
    G.cabecera.botonLapiz:Click("LeftButton")
    G.cabecera.campoNombre:SetText("/who")
    G.cabecera.campoNombre:GetScript("OnEnterPressed")(G.cabecera.campoNombre)
    out.renombrar = {sigue = G.cabecera.campoNombre:IsShown(), error = G.cabecera.campoNombre.snfError or false, existe = A.existe("Hierbas")}
    G.cabecera.campoNombre:GetScript("OnEscapePressed")(G.cabecera.campoNombre)
    G.cabecera.campoNombre:GetScript("OnEditFocusLost")(G.cabecera.campoNombre)
    out.arbolRenombrar = A.renombrar("Hierbas", " /who") == nil
    -- Importar texto: el que lleva el viejo se rechaza entero y la ventana lo dice.
    local texto = SnetForever.TextoGrupos.exportar("/viejo")
    out.exportado = type(texto) == "string"
    G.importarTexto()
    G.texto.caja:SetText(texto)
    G.texto.caja:GetScript("OnTextChanged")(G.texto.caja, true)
    out.importar = {aviso = G.texto.aviso:GetText(), apagado = G.texto.botonImportar.snfApagado}
    out.viejo = A.existe("/viejo")
    return out
  end)()`);
  const msg = 'Eso parece un comando del chat, no un nombre de grupo';
  assert.equal(r.mensaje, msg);
  assert.deepEqual(r.crear1, { sigue: true, error: msg, hijos: 0 });
  assert.deepEqual(r.crear2, { sigue: true, error: msg, hijos: 0 }, 'con espacios delante, igual');
  assert.equal(r.arbolCrear, true);
  assert.deepEqual(r.renombrar, { sigue: true, error: msg, existe: true });
  assert.equal(r.arbolRenombrar, true);
  assert.equal(r.exportado, true);
  assert.deepEqual(r.importar, { aviso: msg, apagado: true });
  assert.equal(r.viejo, true, 'el que ya existía no se borra');
  sinErrores(m);
});

// T1a, ronda 1 (sin parpadeos): el tooltip al cruzar de una fila a otra y al temblar en un borde, fotograma a fotograma (como la
// prueba del asa de la ventana). a y b son dos filas de objeto seguidas; l, la última fila de objeto que se ve. Devuelve la
// visibilidad del tooltip en cada fotograma, desde antes del primer cruce, cuántas veces se llamó a Hide al cruzar y, por
// fotograma, si el fondo del ratón de cada fila se ve encendido (LUZ: cómo se mira en esta tabla).
const TEMBLOR = (a, b, l, luz) => `(function()
  local vis, hides = {GameTooltip:IsShown()}, 0
  local luces, objetos = {}, {}
  local esconder = GameTooltip.Hide
  GameTooltip.Hide = function(self) hides = hides + 1; return esconder(self) end
  -- El fondo del ratón de una fila (el resalte): ¿se ve encendido?
  local encendida = ${luz}
  local a, b, l = ${a}, ${b}, ${l}
  local function foto()
    BANCO.avanzar(0.05)
    vis[#vis + 1] = GameTooltip:IsShown()
    luces[#luces + 1] = {encendida(a), encendida(b), encendida(l)}
    objetos[#objetos + 1] = GameTooltip:IsShown() and (BANCO.lineasTooltip())[1] or false
  end
  local function en(f) f:GetScript("OnEnter")(f) end
  local function fuera(f) f:GetScript("OnLeave")(f) end
  en(a); foto()
  -- Cruzar por el borde de dos filas, ida y vuelta en fotogramas seguidos (el OnLeave llega antes que el OnEnter).
  for _ = 1, 10 do fuera(a); en(b); foto(); fuera(b); en(a); foto() end
  local cruce = {hides = hides, vis = {unpack(vis)}, luces = {unpack(luces)}, objetos = {unpack(objetos)}}
  -- Temblar en el borde de la última fila: fuera y dentro en fotogramas seguidos.
  fuera(a); en(l); BANCO.avanzar(0.5); foto()
  local desde = #vis
  for _ = 1, 10 do fuera(l); foto(); en(l); foto() end
  local borde, luzBorde = {}, {}
  for i = desde, #vis do borde[#borde + 1] = vis[i]; luzBorde[#luzBorde + 1] = luces[i - 1][3] end
  -- Y al irse de verdad, se esconde y se apaga.
  fuera(l)
  for _ = 1, 10 do foto() end
  GameTooltip.Hide = esconder
  local ultima = luces[#luces]
  return {cruce = cruce, borde = borde, luzBorde = luzBorde, final = GameTooltip:IsShown(), todo = vis,
    apagadas = not (ultima[1] or ultima[2] or ultima[3])}
end)()`;
// ¿Pasa de «a la vista» (o encendida) a «escondido» y otra vez a «a la vista»?
const parpadea = (vis) => {
  let visto = false;
  let escondidoTras = false;
  for (const v of vis) {
    if (v && escondidoTras) return true;
    if (v) visto = true;
    else if (visto) escondidoTras = true;
  }
  return false;
};
const comprobarTemblor = (r) => {
  assert.equal(r.cruce.hides, 0, 'al cruzar de una fila a otra no hay ningún Hide');
  assert.deepEqual(r.cruce.vis, [false, ...r.cruce.vis.slice(1).map(() => true)], `al cruzar, siempre a la vista: ${r.cruce.vis}`);
  assert.deepEqual(r.borde, r.borde.map(() => true), `temblando en el borde de la última fila no se esconde: ${r.borde}`);
  assert.equal(parpadea(r.todo.slice(0, -10)), false, 'nunca sale, se esconde y vuelve a salir');
  assert.equal(r.final, false, 'al irse de verdad, se esconde');
  // El fondo del ratón: al cruzar siempre hay una fila encendida y ninguna se enciende, se apaga y se vuelve a encender.
  const luces = r.cruce.luces;
  assert.ok(luces.every((x) => x[0] || x[1]), `al cruzar, siempre una fila encendida: ${JSON.stringify(luces)}`);
  assert.equal(parpadea(luces.map((x) => x[0])), false, `la primera fila no se enciende y se apaga en fotogramas seguidos: ${luces.map((x) => (x[0] ? 1 : 0)).join('')}`);
  assert.equal(parpadea(luces.map((x) => x[1])), false, `la segunda tampoco: ${luces.map((x) => (x[1] ? 1 : 0)).join('')}`);
  assert.deepEqual(r.luzBorde, r.luzBorde.map(() => true), `temblando en el borde de la última fila su fondo no se apaga: ${r.luzBorde}`);
  assert.equal(r.apagadas, true, 'al irse de verdad, ninguna queda encendida');
  // El tooltip va con la luz: temblando entre dos filas de objeto no cambia de objeto (ni de contenido ni de tamaño).
  const objetos = r.cruce.objetos;
  assert.ok(objetos[0], 'al entrar, el tooltip de la primera fila');
  assert.deepEqual(objetos, objetos.map(() => objetos[0]), `temblando entre dos filas, siempre el mismo objeto: ${objetos.join(' | ')}`);
};
const LUZ = 'function(f) return f.resalte:IsShown() end';

test('sin parpadeos: en las listas de Grupos el tooltip no se esconde al cruzar de una fila a otra ni al temblar en el borde de la última', necesitaComercio, () => {
  const m = maquina();
  BOLSAS_TT(m);
  m.itemInfo(12, { nombre: 'Polvo', calidad: 1 });
  m.bolsa(0, 3, { id: 12 });
  m.lua(`(function()
    ${DERECHA}
    elegir("")
  end)()`);
  comprobarTemblor(m.lua(TEMBLOR(`(function() for _, x in ipairs(SnetForever.PrincipalGrupos.tablaBase.filas) do if x:IsShown() and x.clave == "i:10" then return x end end end)()`, `(function() for _, x in ipairs(SnetForever.PrincipalGrupos.tablaBase.filas) do if x:IsShown() and x.clave == "i:11" then return x end end end)()`, `(function() for _, x in ipairs(SnetForever.PrincipalGrupos.tablaBase.filas) do if x:IsShown() and x.clave == "i:12" then return x end end end)()`, LUZ)));
  sinErrores(m);
});

// Ronda 1, Importante 2: con el ratón parado, la rueda deja debajo una sección (no es un objeto): el tooltip del objeto de
// antes se va (no se queda anclado a la sección).
test('con el ratón parado, si la rueda deja debajo una fila que no es un objeto, el tooltip del objeto de antes se va', necesitaComercio, () => {
  const m = maquina();
  // 60 objetos en las bolsas (16 en la mochila y 11 en cada una de las otras cuatro): más de los que caben.
  for (let i = 0; i < 60; i++) {
    m.itemInfo(100 + i, { nombre: `Cosa ${i}`, calidad: 1 });
    const bolsa = i < 16 ? 0 : 1 + Math.floor((i - 16) / 11);
    m.bolsa(bolsa, i < 16 ? i + 1 : ((i - 16) % 11) + 1, { id: 100 + i });
  }
  const r = m.lua(`(function()
    ${DERECHA}
    elegir("")
    local t = G.tablaBase
    t:GetScript("OnMouseWheel")(t, -1)
    local f = t.filas[1]
    local out = {antes = f.clave}
    f:GetScript("OnEnter")(f)
    out.objeto = GameTooltip:IsShown() and GameTooltip:GetOwner() == f
    t:GetScript("OnMouseWheel")(t, 1)
    out.debajo = f.clave
    BANCO.avanzar(0.5)
    out.despues = GameTooltip:IsShown()
    return out
  end)()`);
  assert.equal(r.antes, 'i:100');
  assert.equal(r.objeto, true);
  assert.equal(r.debajo, '\u0001bolsas', 'debajo queda la sección');
  assert.equal(r.despues, false, 'el tooltip del objeto de antes se va');
  sinErrores(m);
});

// T1a, ronda 2, menor 1: dos tablas a la vista («sin grupo» y «en el grupo»), un solo tooltip. Pasar de X (tabla 1) a Y
// (tabla 2) y volver a X dentro de la espera: X sigue encendida y vuelve a tener su tooltip; el de Y no lo quita al apagarse.
test('con dos listas a la vista, volver a la fila encendida de una le devuelve su tooltip', necesitaComercio, () => {
  const m = maquina();
  BOLSAS_TT(m);
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas")
    A.poner("i:11", "Hierbas")
    elegir("Hierbas")
    local function filaDe(t, clave)
      for _, x in ipairs(t.filas) do if x:IsShown() and x.clave == clave then return x end end
    end
    local x, y = filaDe(G.tablaSinGrupo, "i:10"), filaDe(G.tablaEnGrupo, "i:11")
    x:GetScript("OnEnter")(x)
    x:GetScript("OnLeave")(x)
    y:GetScript("OnEnter")(y)
    local enY = GameTooltip:GetOwner() == y
    y:GetScript("OnLeave")(y)
    x:GetScript("OnEnter")(x)
    BANCO.avanzar(0.5)
    return {enY = enY, visible = GameTooltip:IsShown(), deX = GameTooltip:GetOwner() == x, luzX = x.resalte:IsShown(),
      luzY = y.resalte:IsShown(), objeto = (BANCO.lineasTooltip())[1]}
  end)()`);
  assert.equal(r.enY, true, 'la otra lista se enciende al momento y se queda el tooltip');
  assert.deepEqual(r, { enY: true, visible: true, deX: true, luzX: true, luzY: false, objeto: 'Rama simple' });
  sinErrores(m);
});

// Ronda 2, menor 3: se cierra la ventana dentro de la espera de la luz: no queda ningún tooltip.
test('si se cierra la ventana mientras la luz espera para pasar a otra fila, no queda tooltip', necesitaComercio, () => {
  const m = maquina();
  BOLSAS_TT(m);
  const r = m.lua(`(function()
    ${DERECHA}
    elegir("")
    local function filaDe(clave)
      for _, x in ipairs(G.tablaBase.filas) do if x:IsShown() and x.clave == clave then return x end end
    end
    local a, b = filaDe("i:10"), filaDe("i:11")
    a:GetScript("OnEnter")(a)
    a:GetScript("OnLeave")(a)
    b:GetScript("OnEnter")(b)
    SnetForever.Principal.cerrar()
    BANCO.avanzar(0.5)
    return {visible = GameTooltip:IsShown(), luzB = b.resalte:IsShown()}
  end)()`);
  assert.deepEqual(r, { visible: false, luzB: false });
  sinErrores(m);
});

// Ronda 2, menor 6: el cruce de verdad, de una fila a otra quieta, fotograma a fotograma: ningún Hide, siempre a la vista y
// siempre una fila encendida; al final, la nueva con su objeto.
test('sin parpadeos: cruzar de una fila a otra y quedarse quieto: ningún Hide, siempre a la vista y siempre una luz', necesitaComercio, () => {
  const m = maquina();
  BOLSAS_TT(m);
  const r = m.lua(`(function()
    ${DERECHA}
    elegir("")
    local function filaDe(clave)
      for _, x in ipairs(G.tablaBase.filas) do if x:IsShown() and x.clave == clave then return x end end
    end
    local a, b = filaDe("i:10"), filaDe("i:11")
    a:GetScript("OnEnter")(a)
    BANCO.avanzar(0.05)
    local hides, fotos = 0, {}
    local esconder = GameTooltip.Hide
    GameTooltip.Hide = function(self) hides = hides + 1; return esconder(self) end
    a:GetScript("OnLeave")(a)
    b:GetScript("OnEnter")(b)
    for _ = 1, 10 do
      BANCO.avanzar(0.05)
      fotos[#fotos + 1] = {GameTooltip:IsShown(), a.resalte:IsShown() or b.resalte:IsShown()}
    end
    GameTooltip.Hide = esconder
    return {hides = hides, fotos = fotos, final = {a.resalte:IsShown(), b.resalte:IsShown(), (BANCO.lineasTooltip())[1]}}
  end)()`);
  assert.equal(r.hides, 0, 'ningún Hide');
  assert.deepEqual(r.fotos, r.fotos.map(() => [true, true]), 'siempre a la vista y siempre una fila encendida');
  assert.deepEqual(r.final, [false, true, 'Cristal nexo'], 'al final, la nueva con su objeto');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// B3s: Mayús + clic y Ctrl + clic en las listas de objetos, como en las demás tablas (UIComercio.clicModificado). Como TSM:
// con tecla, el objeto va al chat (Mayús; sin chat abierto, lo abre con el enlace) o al probador (Ctrl) y lo elegido no
// cambia; para elegir varios, el clic solo suma o quita y Alt + clic elige el tramo.
// ---------------------------------------------------------------------------------------------------

// Las cuatro listas: Grupo Base › Información (bolsas sin grupo) y, en un subgrupo, «Objetos sin grupo» (sus dos secciones:
// bolsas y grupo padre) y «En el grupo». Cada una: {nombre, grupo, tabla, claves}.
const CUATRO = `${DERECHA}
  A.crear("", "Hierbas"); A.crear("Hierbas", "Raras")
  A.poner("i:20", "Hierbas"); A.poner("i:21", "Hierbas"); A.poner("i:22", "Hierbas")
  A.poner("i:30", "Hierbas\`Raras"); A.poner("i:31", "Hierbas\`Raras"); A.poner("i:32", "Hierbas\`Raras")
  local LISTAS = {
    {"base", "", function() return G.tablaBase end, {"i:11", "i:12", "i:13"}},
    {"bolsas", "Hierbas\`Raras", function() return G.tablaSinGrupo end, {"i:11", "i:12", "i:13"}},
    {"padre", "Hierbas\`Raras", function() return G.tablaSinGrupo end, {"i:20", "i:21", "i:22"}},
    {"en", "Hierbas\`Raras", function() return G.tablaEnGrupo end, {"i:30", "i:31", "i:32"}},
  }
  local function filaDe(t, clave)
    for _, x in ipairs(t.filas) do
      if x:IsShown() and x.clave == clave then return x.fila end
    end
  end`;

function maquinaCuatro() {
  const m = maquina();
  bolsaCon(m, [11, 12, 13]);
  for (const id of [20, 21, 22, 30, 31, 32]) m.itemInfo(id, { nombre: `Objeto ${id}`, calidad: 1 });
  return m;
}
const LISTAS = [['base', ['i:11', 'i:12', 'i:13']], ['bolsas', ['i:11', 'i:12', 'i:13']], ['padre', ['i:20', 'i:21', 'i:22']], ['en', ['i:30', 'i:31', 'i:32']]];

test('Mayús + clic funciona igual en la lista vieja, el sniper, las 4 listas de Grupos y el cuadro de cantidad: las 4 listas de Grupos', necesitaComercio, () => {
  const m = maquinaCuatro();
  const r = m.lua(`(function()
    ${CUATRO}
    local out = {}
    for _, l in ipairs(LISTAS) do
      local nombre, ruta, tabla, k = l[1], l[2], l[3], l[4]
      elegir(ruta)
      local T = tabla()
      BANCO.chat.abierta, BANCO.chat.texto, BANCO.probador = false, "", nil
      T:marcarTodo(false) -- las dos secciones de «sin grupo» son la misma tabla: se empieza sin nada elegido
      pulsar(T, k[1]); pulsar(T, k[2]) -- dos elegidas (el clic suma)
      local antes = elegidas(T)
      local f = filaDe(T, k[3])
      local id = tonumber(string.match(k[3], "^i:(%d+)$"))
      local esperado = f.enlace or (select(2, C_Item.GetItemInfo(id)))
      pulsar(T, k[3], "shift") -- sin chat abierto: lo abre con el enlace
      local trasAbrir = {BANCO.chat.abierta, BANCO.chat.texto}
      pulsar(T, k[1], "shift") -- con el chat ya abierto: se añade
      local otro = filaDe(T, k[1])
      local esperado1 = otro.enlace or (select(2, C_Item.GetItemInfo(tonumber(string.match(k[1], "^i:(%d+)$")))))
      local trasMayus = elegidas(T)
      pulsar(T, k[3], "ctrl")
      out[nombre] = {antes = antes, trasMayus = trasMayus, despues = elegidas(T), abierto = trasAbrir, esperado = esperado,
        chat = BANCO.chat.texto, esperadoChat = esperado .. esperado1, probador = BANCO.probador, bolsa = f.enlace ~= nil}
    end
    out.enviados = #(BANCO.llamadas.SendChatMessage or {})
    return out
  end)()`);
  for (const [nombre, k] of LISTAS) {
    const l = r[nombre];
    assert.deepEqual(l.antes, [k[0], k[1]], `${nombre}: el clic suma (dos elegidas)`);
    assert.ok(typeof l.esperado === 'string' && l.esperado.includes('|Hitem:'), `${nombre}: la fila tiene enlace`);
    assert.deepEqual(l.abierto, [true, l.esperado], `${nombre}: sin chat, Mayús + clic lo abre con el enlace`);
    assert.equal(l.chat, l.esperadoChat, `${nombre}: con el chat abierto, el enlace se añade a la caja`);
    assert.deepEqual(l.trasMayus, [k[0], k[1]], `${nombre}: Mayús + clic no cambia lo elegido`);
    assert.equal(l.probador, l.esperado, `${nombre}: Ctrl + clic, al probador`);
    assert.deepEqual(l.despues, [k[0], k[1]], `${nombre}: Ctrl + clic no cambia lo elegido`);
  }
  assert.equal(r.base.bolsa, true, 'de las bolsas: el enlace de su hueco (trae su sufijo)');
  assert.equal(r.padre.bolsa, false, 'del grupo padre: el del juego por su id');
  assert.equal(r.enviados, 0, 'nada se envía');
  sinErrores(m);
});

test('Grupos: una fila sin enlace todavía, con tecla, no hace nada y no se elige', necesitaComercio, () => {
  const m = maquina();
  bolsaCon(m, [11]);
  const r = m.lua(`(function()
    ${DERECHA}
    A.crear("", "Hierbas"); A.poner("i:999", "Hierbas")
    elegir("Hierbas")
    local T = G.tablaEnGrupo
    pulsar(T, "i:999", "shift")
    local trasMayus = elegidas(T)
    pulsar(T, "i:999", "ctrl")
    return {mayus = trasMayus, ctrl = elegidas(T), chat = BANCO.chat.abierta, probador = BANCO.probador == nil}
  end)()`);
  assert.deepEqual(r, { mayus: [], ctrl: [], chat: false, probador: true });
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------------------------
// Task 31: los botones no se parten (puntos 1, 8 y 10 de la Fase H)
// ---------------------------------------------------------------------------------------------------------------------

// Anchos de letra de verdad (los de test/subasta-ventana.test.js: Montserrat medida con PIL más un 3 %, lo que el juego
// dibuja de más). Sin ellos el banco cuenta medio tamaño por letra y un texto que en el juego no cabe parecería que sí.
const FACTOR_LETRA = { 'AlegreyaSC-Bold': 0.5213, 'BarlowSemiCondensed-Medium': 0.4382, 'BarlowSemiCondensed-SemiBold': 0.444 };
const letraReal = (m) => m.lua(`BANCO.letraReal = {${Object.entries(FACTOR_LETRA).map(([k, v]) => `["${k}"] = ${v * 1.03}`).join(', ')}}`);
const IDIOMAS = [['es', 'esES'], ['en', 'enUS']];
const TAMANOS = [[1000, 600], [1424, 805]];
// Una máquina con la letra de verdad y la ventana abierta en la pestaña pedida, del tamaño pedido.
function maquinaReal(cliente, ancho, alto, pestana = 'grupos') {
  const m = maquina({ jugador: { ...JUGADOR, idioma: cliente } });
  letraReal(m);
  m.lua(`SnetForever.Principal.abrir("${pestana}"); SnetForever.Principal.marco():SetSize(${ancho}, ${alto})`);
  return m;
}

// Mide el botón «Mover» con 0, 1 y 9999 objetos: lo que ocupa el texto, el ancho, si parte el texto y dónde quedan él y el
// desplegable «Seleccionar grupo» dentro de la página.
const MEDIR_MOVER = `
  local L, Tema = SnetForever.L, SnetForever.Tema
  local b, d, p = G.botonMover, G.desplegableGrupo, G.paginaInfo
  local out = {}
  for _, n in ipairs({0, 1, 9999}) do
    b:ponerTexto(L.t(n == 1 and "PRINCIPAL_GRUPOS_MOVER_UNO" or "PRINCIPAL_GRUPOS_MOVER", n))
    out[#out + 1] = {texto = b.texto:GetText(), medido = Tema.anchoTexto(b.texto), ancho = b:GetRight() - b:GetLeft(),
      ajuste = b.texto:GetWordWrap(), bIzq = b:GetLeft(), bDer = b:GetRight(), dIzq = d:GetLeft(), dDer = d:GetRight(),
      pIzq = p:GetLeft(), pDer = p:GetRight()}
  end
  return out`;
const comprobarMover = (r, donde) => {
  for (const x of r) {
    assert.ok(x.medido <= x.ancho - 16, `${donde}: «${x.texto}» mide ${x.medido.toFixed(1)} y caben ${x.ancho - 16}`);
    assert.equal(x.ajuste, false, `${donde}: «${x.texto}» no se parte`);
    assert.ok(x.dDer <= x.bIzq, `${donde}: el desplegable (${x.dDer}) queda a la izquierda del botón (${x.bIzq})`);
    assert.ok(x.dIzq >= x.pIzq - 0.01 && x.bDer <= x.pDer + 0.01, `${donde}: los dos caben dentro de la página`);
    assert.ok(x.dDer - x.dIzq > 0, `${donde}: al desplegable le queda sitio`);
  }
  assert.equal(new Set(r.map((x) => x.ancho)).size, 1, `${donde}: el botón no cambia de ancho al contar`);
};

test('«Mover N objetos» cabe en una línea con 0, 1 y 9999, el botón no cambia de ancho al contar y no pisa a «Seleccionar grupo»', necesitaComercio, () => {
  const anchos = {};
  for (const [idioma, cliente] of IDIOMAS) {
    for (const [ancho, alto] of TAMANOS) {
      const m = maquinaReal(cliente, ancho, alto);
      const r = m.lua(`(function()
        ${DERECHA}
        elegir("")
        ${MEDIR_MOVER}
      end)()`);
      comprobarMover(r, `${idioma} a ${ancho}×${alto}`);
      anchos[idioma] = r[0].ancho;
      sinErrores(m);
    }
  }
  // Al cambiar de idioma con la página creada el ancho se vuelve a medir: el mismo que si se hubiera abierto en ese idioma.
  const m = maquinaReal('esES', 1000, 600);
  const r = m.lua(`(function()
    ${DERECHA}
    elegir("")
    SnetForever.Ajustes.set("idioma", "en")
    ${MEDIR_MOVER}
  end)()`);
  comprobarMover(r, 'de es a en');
  assert.equal(r[2].texto, 'Move 9999 items');
  assert.notEqual(anchos.es, anchos.en, 'es y en miden distinto');
  assert.equal(r[0].ancho, anchos.en, 'tras cambiar a inglés, el ancho del inglés');
  sinErrores(m);
});

test('ningún botón de texto de Grupos, Operaciones y Ajustes se parte ni se corta en es y en', necesitaComercio, () => {
  for (const [idioma, cliente] of IDIOMAS) {
    for (const [ancho, alto] of TAMANOS) {
      const m = maquinaReal(cliente, ancho, alto);
      const r = m.lua(`(function()
        local L, Tema, P = SnetForever.L, SnetForever.Tema, SnetForever.Principal
        local G, A = SnetForever.PrincipalGrupos, SnetForever.Arbol
        local malos, vistos = {}, 0
        -- Con el texto que se pida (o el que ya lleva): cabe con su margen y no se parte.
        local function mira(nombre, b, texto)
          if texto then b:ponerTexto(texto) end
          vistos = vistos + 1
          -- El ancho de verdad (el del rectángulo): Añadir, Quitar, Borrar N y Agregar van anclados a los dos lados.
          local medido, libre = Tema.anchoTexto(b.texto), (b:GetRight() - b:GetLeft()) - b.espacioFijo
          if medido > libre then malos[#malos + 1] = nombre .. " «" .. b.texto:GetText() .. "»: " .. math.ceil(medido) .. "/" .. libre end
          if b.texto:GetWordWrap() then malos[#malos + 1] = nombre .. ": se parte" end
        end
        local function cuenta(clave, n) return L.t(n == 1 and (clave .. "_UNO") or clave, n) end
        -- Grupos: Mover (Grupo Base), Añadir y Quitar (un subgrupo) y la confirmación de borrar un grupo.
        A.crear("", "Hierbas")
        G.arbol:refrescar(); G.arbol:elegir("")
        for _, n in ipairs({0, 1, 9999}) do mira("Mover", G.botonMover, cuenta("PRINCIPAL_GRUPOS_MOVER", n)) end
        G.arbol:refrescar(); G.arbol:elegir("Hierbas")
        for _, n in ipairs({0, 1, 9999}) do
          mira("Añadir", G.botonAnadir, cuenta("PRINCIPAL_GRUPOS_ANADIR", n))
          mira("Quitar", G.botonQuitar, cuenta("PRINCIPAL_GRUPOS_QUITAR", n))
        end
        mira("Grupos Borrar", G.confirmacion.botonBorrar)
        mira("Grupos Cancelar", G.confirmacion.botonCancelar)
        -- Operaciones: Borrar N operaciones y su confirmación.
        P.abrir("operaciones")
        local O = SnetForever.PrincipalOperaciones
        for _, n in ipairs({0, 1, 9999}) do mira("Borrar N", O.botonBorrar, cuenta("PRINCIPAL_OPS_BORRAR_N", n)) end
        mira("Operaciones Borrar", O.confirmacion.botonBorrar)
        mira("Operaciones Cancelar", O.confirmacion.botonCancelar)
        -- Ajustes: Agregar una fuente propia.
        P.abrir("ajustes")
        local Aj = SnetForever.PrincipalAjustes
        Aj.elegir("fuentes")
        mira("Agregar", Aj.fuentes.agregar)
        -- El cuadro fijo de preguntar (Restablecer del editor y Quitar de Ajustes): Aceptar y Cancelar.
        local c = SnetForever.EditorOperacion.cuadroConfirmar("SnetForeverPruebaConfirmar")
        for _, clave in ipairs({"PRINCIPAL_EDITOR_RESTABLECER", "PRINCIPAL_AJ_QUITAR"}) do
          c:preguntar("?", L.t(clave), nil)
          mira("Aceptar", c.botonAceptar)
          mira("Cancelar", c.botonCancelar)
        end
        c:cerrar()
        return {malos = malos, vistos = vistos}
      end)()`);
      assert.deepEqual(r.malos, [], `${idioma} a ${ancho}×${alto}`);
      assert.equal(r.vistos, 21, 'se miran todos los botones');
      sinErrores(m);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Task 32: la fila de operación de Grupos con ⧉ y ✖ dentro de la barra (punto 2 de la Fase H, gr-02)
// ---------------------------------------------------------------------------------------------------------------------

// Mide la fila 1 de la tarjeta de subasta: la tarjeta, el asa, la barra (f.nombre), el texto y los dos botones.
const MEDIR_FILA_OP = `
  local f, t = G.tarjetas.subasta.filas[1], G.tarjetas.subasta
  local function caja(x) return {izq = x:GetLeft(), der = x:GetRight(), arriba = x:GetTop(), abajo = x:GetBottom()} end
  local probe = UIParent:CreateTexture()
  local function de(n) SnetForever.Tema.icono(probe, n); return {probe:GetTexCoord()} end
  return {
    tarjeta = caja(t), asa = caja(f.asa), barra = caja(f.nombre), texto = caja(f.nombre.texto), abrir = caja(f.botonAbrir),
    quitar = caja(f.botonQuitar), ladoAbrir = {f.botonAbrir:GetSize()}, ladoQuitar = {f.botonQuitar:GetSize()},
    padres = {f.botonAbrir:GetParent() == f.nombre, f.botonQuitar:GetParent() == f.nombre},
    vistos = {asa = f.asa:IsShown(), abrir = f.botonAbrir:IsShown(), quitar = f.botonQuitar:IsShown()},
    icono = {f.botonAbrir.icono:GetTexCoord()}, ventana = de("ventana"),
    medido = SnetForever.Tema.anchoTexto(f.nombre.texto), parte = f.nombre.texto:GetWordWrap(),
  }`;
// Abre la tarjeta de subasta del grupo pedido con la ventana del tamaño pedido y la mide. La zona con desplazamiento da su
// ancho al contenido en OnSizeChanged: con BANCO.tamanoPorAnclajes el banco lo lanza como el cliente, al cambiar el tamaño
// que dan los anclajes (la primera vez que ve la zona solo apunta su tamaño; por eso se estira 1 px y se deja como estaba).
function medirFilaOp(ancho, alto, preparar, ruta) {
  const m = maquinaReal('esES', ancho, alto);
  m.lua('BANCO.tamanoPorAnclajes = true');
  m.lua(`(function()
    ${OPS}
    ${preparar}
    verOps("${ruta}")
  end)()`);
  m.avanzar(0.05);
  for (const a of [ancho + 1, ancho]) {
    m.lua(`SnetForever.Principal.marco():SetSize(${a}, ${alto})`);
    m.avanzar(0.05);
  }
  const r = m.lua(`(function()
    local G = SnetForever.PrincipalGrupos
    ${MEDIR_FILA_OP}
  end)()`);
  return { m, r };
}
const cerca = (a, b, donde) => assert.ok(Math.abs(a - b) < 0.01, `${donde}: ${a} y ${b}`);
const dentro = (x, caja, donde) => {
  assert.ok(x.izq >= caja.izq - 0.01 && x.der <= caja.der + 0.01, `${donde}: de ${x.izq} a ${x.der}, la barra de ${caja.izq} a ${caja.der}`);
  assert.ok(x.arriba <= caja.arriba + 0.01 && x.abajo >= caja.abajo - 0.01, `${donde}: de ${x.arriba} a ${x.abajo}, la barra de ${caja.arriba} a ${caja.abajo}`);
  cerca((x.arriba + x.abajo) / 2, (caja.arriba + caja.abajo) / 2, `${donde}: centrado en alto`);
};

test('la fila de una operación: ⧉ (icono ventana) y ✖ van dentro de la barra, la barra llega al borde de la tarjeta y el nombre no pisa los botones', necesitaComercio, () => {
  for (const [ancho, alto] of TAMANOS) {
    for (const nombre of ['Alta', 'W'.repeat(60)]) { // 60 letras: lo más largo que deja poner Operaciones
      const { m, r } = medirFilaOp(ancho, alto, `O.crear("subasta", "${nombre}"); O.ponerDeGrupo("", "subasta", {"${nombre}"})`, '');
      const donde = `${ancho}×${alto}, nombre de ${nombre.length}`;
      assert.ok(r.tarjeta.der - r.tarjeta.izq > 400, `${donde}: la tarjeta tiene su ancho (${r.tarjeta.der - r.tarjeta.izq})`);
      // La barra: desde el asa (6 px) hasta 4 px del borde derecho de la tarjeta.
      cerca(r.barra.der, r.tarjeta.der - 4, `${donde}: la barra llega a 4 px del borde de la tarjeta`);
      cerca(r.barra.izq, r.asa.der + 6, `${donde}: la barra empieza 6 px después del asa`);
      // ✖ y ⧉ son de la barra, miden 14 px y van dentro, a la derecha: ✖ a 6 px del borde, ⧉ a 8 px de la ✖.
      assert.deepEqual(r.padres, [true, true], `${donde}: hijos de la barra`);
      assert.deepEqual([r.ladoAbrir, r.ladoQuitar], [[14, 14], [14, 14]], `${donde}: 14 px`);
      dentro(r.quitar, r.barra, `${donde}: ✖`);
      dentro(r.abrir, r.barra, `${donde}: ⧉`);
      cerca(r.barra.der - r.quitar.der, 6, `${donde}: ✖ a 6 px del borde de la barra`);
      cerca(r.quitar.izq - r.abrir.der, 8, `${donde}: ⧉ a 8 px de la ✖`);
      assert.deepEqual(r.icono, r.ventana, `${donde}: ⧉ es el icono ventana`);
      // El nombre termina 8 px antes del ⧉, en una línea, y no lo pisa aunque sea larguísimo.
      cerca(r.texto.der, r.abrir.izq - 8, `${donde}: el texto acaba 8 px antes del ⧉`);
      assert.ok(r.texto.izq + Math.min(r.medido, r.texto.der - r.texto.izq) <= r.abrir.izq - 8 + 0.01, `${donde}: el nombre no pisa el ⧉`);
      assert.equal(r.parte, false, `${donde}: el nombre no se parte`);
      assert.deepEqual(r.vistos, { asa: true, abrir: true, quitar: true });
      sinErrores(m);
    }
  }
});

test('una fila heredada lleva ⧉ dentro de la barra y ni asa ni ✖', necesitaComercio, () => {
  for (const [ancho, alto] of TAMANOS) {
    const { m, r } = medirFilaOp(ancho, alto, `A.crear("", "Armas"); O.crear("subasta", "Alta"); O.ponerDeGrupo("", "subasta", {"Alta"})`, 'Armas');
    const donde = `${ancho}×${alto}`;
    assert.deepEqual(r.vistos, { asa: false, abrir: true, quitar: false }, `${donde}: solo lectura`);
    cerca(r.barra.der, r.tarjeta.der - 4, `${donde}: la barra llega a 4 px del borde de la tarjeta`);
    dentro(r.abrir, r.barra, `${donde}: ⧉`);
    assert.deepEqual(r.icono, r.ventana, `${donde}: ⧉ es el icono ventana`);
    assert.ok(r.texto.der <= r.abrir.izq - 8 + 0.01, `${donde}: el nombre no pisa el ⧉`);
    sinErrores(m);
  }
});
