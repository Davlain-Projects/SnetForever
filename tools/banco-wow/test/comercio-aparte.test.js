// Ventana principal, parte 1, Task 7: el comercio es un addon aparte, SnetForever_Comercio, que el jugador activa o
// desactiva en la lista de addons del juego. Depende del núcleo (SnetForever), usa sus SavedVariables y el núcleo
// funciona entero sin él: la guía, el panel, el chat de la IA, el contexto, el diario y el botón del minimapa.
//
// El banco carga por defecto los dos addons, como el cliente: los archivos del núcleo, sus SavedVariables,
// ADDON_LOADED("SnetForever"), los archivos del comercio, ADDON_LOADED("SnetForever_Comercio") y PLAYER_LOGIN. Con
// sinComercio: true (o con SnetForever_Comercio en ranurasDesactivadas, o tras C_AddOns.DisableAddOn y /reload) carga
// solo el núcleo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerToc } from '../src/maquina.js';
import { aLua } from '../src/lua-js.js';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NUCLEO = join(RAIZ, 'addons', 'SnetForever');
const COMERCIO = join(RAIZ, 'addons', 'SnetForever_Comercio');

// Los archivos del addon de comercio, en el orden de su .toc (el mismo que tenían en el del núcleo).
const ARCHIVOS = [
  'comercio/comercio.lua', 'comercio/precios.lua', 'comercio/estado.lua', 'comercio/merchant-prices.lua', 'comercio/precio-vendedor.lua', 'comercio/disenchant-samples.lua', 'comercio/recipe-costs.lua', 'comercio/formulas.lua', 'comercio/arbol.lua', 'comercio/grupos.lua', 'comercio/operaciones.lua', 'comercio/texto-grupos.lua', 'comercio/importar-tsm-diagnostico.lua', 'comercio/importar-tsm.lua', 'comercio/reglas.lua', 'comercio/propuesta.lua',
  'comercio/escaneo.lua', 'comercio/inventario.lua', 'comercio/almacen.lua', 'comercio/almacen-mover.lua', 'comercio/vendedor.lua', 'comercio/artesania.lua', 'comercio/correo.lua', 'comercio/compra.lua', 'comercio/sniper.lua', 'comercio/busqueda.lua', 'comercio/vender.lua', 'comercio/mis-subastas.lua',
  'comercio/auction-orders.lua', 'comercio/group-shopping.lua', 'comercio/ledger.lua',
  'ui/tema.lua', 'ui/piezas/botones.lua', 'ui/piezas/campos.lua', 'ui/piezas/contenedores.lua', 'ui/piezas/arbol.lua',
  'ui/piezas/tabla.lua', 'ui/piezas/muestrario.lua', 'ui/comercio_tabla.lua', 'ui/comercio_cantidad.lua', 'ui/subasta/ventana.lua', 'ui/subasta/navegar.lua', 'ui/subasta/resultados.lua', 'ui/subasta/sniper.lua', 'ui/subasta/auction-orders.lua', 'ui/comercio.lua', 'ui/tooltip.lua', // Task 20d
  'ui/principal.lua', 'ui/principal/dashboard.lua', 'ui/principal/contabilidad.lua', 'ui/principal/grupos.lua', // Task 12
  'ui/principal/editor-operacion.lua', 'ui/principal/editor-formula.lua', 'ui/principal/operaciones.lua', // Task 21 y Task 22 (el editor va antes: la página lo usa al crearse)
  'ui/principal/ajustes.lua', // Task 23 (el editor de fórmulas ⧉ va detrás del de operaciones, porque cambia su gancho)
  'ui/almacen.lua', // Fase 4 de la paridad con TSM: la vista previa de Almacén
  'ui/vendedor.lua', // Fase 4 de la paridad con TSM: la vista previa de Vendedor
  'ui/artesania.lua', // Fase 4 de la paridad con TSM: la vista previa de Artesanía
  'ui/correo.lua', // Fase 4 de la paridad con TSM: la vista previa de Correo
];
// Las tablas que crea el addon de comercio en SnetForever.
const MODULOS_COMERCIO = ['Comercio', 'Precios', 'EstadoComercio', 'MerchantPrices', 'Arbol', 'Grupos', 'Operaciones', 'TextoGrupos', 'ImportarTSM', 'Reglas', 'Propuesta', 'Escaneo', 'Compra', 'Sniper', 'Busqueda', 'Vender', 'MisSubastas', 'AuctionOrders', 'GroupShopping', 'Contabilidad', 'Tema',
  'Piezas', 'Muestrario', 'TablaComercio', 'CantidadComercio', 'UIComercio', 'TooltipComercio', 'Principal', 'PrincipalDashboard', 'PrincipalContabilidad', 'PrincipalGrupos', 'PrincipalOperaciones',
  'SubastaVentana', // bloque B, Task B2
  'SubastaNavegar', // bloque B, Task B3
  'EditorOperacion', // Task 22
  'EditorFormula', 'PrincipalAjustes']; // Task 23

const JUGADOR = { idioma: 'esES', reino: 'Normal', faccion: 'Horde', nivel: 12 };
const SOLO = { sinComercio: true, jugador: JUGADOR };
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}';
const HIERBAS = { grupo: { nombre: 'Hierbas rápidas', objetos: [2447, 765] }, regla: { compraPct: 70, ritmoMin: 0.5 } };

const impresos = (m) => m.llamadas('print').map((a) => String(a[0]));
const slash = (m, texto = '') => m.lua(`SlashCmdList.SNET(${aLua(texto)})`);
const texto = (m, clave) => m.lua(`SnetForever.L.t(${aLua(clave)})`);
const llamadasA = (m, prefijo) => Object.keys(m.lua('BANCO.llamadas') || {}).filter((api) => api.startsWith(prefijo));

// ---------------------------------------------------------------------------------------------------
// Los dos .toc y las carpetas
// ---------------------------------------------------------------------------------------------------

test('existe SnetForever_Comercio.toc con Dependencies: SnetForever, versión 0.7.0 y sin SavedVariables', () => {
  const ruta = join(COMERCIO, 'SnetForever_Comercio.toc');
  assert.ok(existsSync(ruta), 'falta addons/SnetForever_Comercio/SnetForever_Comercio.toc');
  const { metadatos, archivos } = leerToc(ruta);
  assert.equal(metadatos.Interface, '16001');
  assert.equal(metadatos.Title, 'SnetForever Comercio');
  assert.equal(metadatos.Version, '0.7.0');
  assert.equal(metadatos.Version, leerToc(join(NUCLEO, 'SnetForever.toc')).metadatos.Version, 'la misma versión que el núcleo');
  assert.equal(metadatos.Dependencies, 'SnetForever');
  assert.equal(metadatos.IconTexture, 'Interface\\AddOns\\SnetForever\\recursos\\icono', 'el icono del núcleo');
  assert.match(metadatos.Notes, /subasta/i, 'Notes en español');
  assert.match(metadatos['Notes-enUS'], /auction/i, 'Notes en inglés');
  for (const clave of Object.keys(metadatos)) assert.doesNotMatch(clave, /^SavedVariables/, 'usa las SavedVariables del núcleo');
  assert.deepEqual(archivos, ARCHIVOS);
});

test('ningún archivo de comercio, tema ni piezas queda en el .toc del núcleo', () => {
  const { archivos } = leerToc(join(NUCLEO, 'SnetForever.toc'));
  assert.deepEqual(archivos.filter((a) => /^comercio\/|^ui\/comercio|^ui\/tema\.lua$|^ui\/piezas\//.test(a)), []);
  for (const a of ARCHIVOS) {
    assert.equal(existsSync(join(NUCLEO, a)), false, `${a} sigue en el núcleo`);
    assert.equal(existsSync(join(COMERCIO, a)), true, `${a} no está en SnetForever_Comercio`);
  }
  assert.equal(existsSync(join(NUCLEO, 'comercio')), false, 'la carpeta comercio/ se ha ido del núcleo');
  assert.equal(existsSync(join(NUCLEO, 'ui', 'piezas')), false, 'la carpeta ui/piezas/ se ha ido del núcleo');
  // Los recursos del tema se mueven; el icono del addon se queda en el núcleo.
  for (const r of ['iconos.tga', 'esquina.tga', 'letras']) {
    assert.equal(existsSync(join(NUCLEO, 'recursos', r)), false, `recursos/${r} sigue en el núcleo`);
    assert.equal(existsSync(join(COMERCIO, 'recursos', r)), true, `recursos/${r} no está en SnetForever_Comercio`);
  }
  assert.equal(existsSync(join(NUCLEO, 'recursos', 'icono.tga')), true, 'el icono se queda en el núcleo');
});

test('commerce loads its own icons and the shared Forge fonts from the core addon', necesitaComercio, () => {
  const m = nuevaMaquina();
  assert.equal(m.lua('SnetForever.Tema.ATLAS'), 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\iconos');
  assert.equal(m.lua('SnetForever.Tema.ESQUINA'), 'Interface\\AddOns\\SnetForever_Comercio\\recursos\\esquina');
  for (const tipo of ['logo', 'titulo', 'pestana', 'etiqueta', 'texto', 'boton', 'tabla', 'tablaNegrita', 'mayusculas']) {
    const ruta = m.lua(`(function()
      local fs = SnetForever.Tema.letra(CreateFrame("Frame", nil, UIParent):CreateFontString(nil, "OVERLAY"), ${aLua(tipo)})
      return (fs:GetFont())
    end)()`);
    assert.match(ruta, /^Interface\\AddOns\\SnetForever\\recursos\\fonts\\[A-Za-z-]+\.ttf$/, `${tipo}: ${ruta}`);
    const archivo = ruta.replace(/^Interface\\AddOns\\SnetForever\\/, '').split('\\');
    assert.ok(existsSync(join(NUCLEO, ...archivo)), `${tipo}: no existe ${ruta}`);
  }
  assert.ok(existsSync(join(COMERCIO, 'recursos', 'iconos.tga')));
  assert.ok(existsSync(join(COMERCIO, 'recursos', 'esquina.tga')));
  assert.ok(readdirSync(join(NUCLEO, 'recursos', 'fonts')).some((a) => /OFL\.txt$/.test(a)), 'las licencias de las letras van con ellas');
  sinErrores(m);
});

// ---------------------------------------------------------------------------------------------------
// Con los dos addons (como siempre)
// ---------------------------------------------------------------------------------------------------

// Apunta, en cada ADDON_LOADED y en PLAYER_LOGIN, si el comercio ya estaba cargado.
const ORDEN = `rawset(_G, "ORDEN", {})
  local f = CreateFrame("Frame")
  f:RegisterEvent("ADDON_LOADED")
  f:RegisterEvent("PLAYER_LOGIN")
  f:SetScript("OnEvent", function(_, evento, nombre)
    local snf = rawget(_G, "SnetForever")
    local comercio = type(snf) == "table" and rawget(snf, "Comercio") ~= nil
    table.insert(ORDEN, evento .. " " .. tostring(nombre) .. " " .. tostring(comercio))
  end)`;
const ORDEN_WOW = ['ADDON_LOADED SnetForever false', 'ADDON_LOADED SnetForever_Comercio true', 'PLAYER_LOGIN nil true'];

test('con los dos addons: todo como antes; ADDON_LOADED del núcleo, después los archivos del comercio, su ADDON_LOADED y PLAYER_LOGIN (también tras /reload)', necesitaComercio, () => {
  const m = nuevaMaquina({ jugador: JUGADOR, previo: ORDEN });
  assert.deepEqual(m.lua('ORDEN'), ORDEN_WOW);
  assert.equal(m.lua('SnetForever.comercioCargado()'), true);
  assert.equal(m.lua('C_AddOns.IsAddOnLoaded("SnetForever_Comercio")'), true);
  for (const nombre of MODULOS_COMERCIO) assert.equal(m.lua(`type(SnetForever.${nombre})`), 'table', nombre);
  const cargados = m.lua('BANCO.cargados');
  assert.deepEqual(cargados.filter((a) => a.startsWith('SnetForever_Comercio/')), ARCHIVOS.map((a) => `SnetForever_Comercio/${a}`));
  assert.ok(cargados.indexOf('SnetForever/arranque.lua') < cargados.indexOf('SnetForever_Comercio/comercio/comercio.lua'));
  // La subasta despierta el comercio como siempre.
  m.lua(SUBASTA);
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true);
  m.disparar('AUCTION_HOUSE_CLOSED');
  sinErrores(m);
  const n = m.recargar();
  assert.deepEqual(n.lua('ORDEN'), ORDEN_WOW);
  assert.equal(n.lua('SnetForever.comercioCargado()'), true);
  sinErrores(n);
});

// ---------------------------------------------------------------------------------------------------
// Con solo el núcleo
// ---------------------------------------------------------------------------------------------------

test('con solo el núcleo: la guía, el panel, el chat de la IA (sin [Aplicar]), el diario y el minimapa funcionan sin errores', () => {
  const m = nuevaMaquina(SOLO);
  assert.equal(m.lua('SnetForever.comercioCargado()'), false);
  assert.equal(m.lua('C_AddOns.IsAddOnLoaded("SnetForever_Comercio")'), false);
  for (const nombre of MODULOS_COMERCIO) assert.equal(m.lua(`type(SnetForever.${nombre})`), 'nil', nombre);
  assert.deepEqual(m.lua('BANCO.cargados').filter((a) => !a.startsWith('SnetForever/')), []);

  // La guía arranca.
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto())');
  m.lua('SnetForever.Ventana.crear()');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true);
  assert.equal(m.lua('SnetForever.Motor.estado().sinGuia'), false, 'el motor tiene la guía');

  // El panel se abre y recorre sus apartados (con «Chat con la IA» y la línea del addon de comercio).
  slash(m);
  assert.equal(m.marco('SnetForeverPanel').visible, true);
  for (const nombre of m.lua('SnetForever.Panel.marcos.orden')) {
    m.lua(`SnetForever.Panel.marcos.tarjetas.${nombre}:Click()`);
    assert.equal(m.lua(`SnetForever.Panel.marcos.secciones.${nombre}:IsVisible()`), true, nombre);
  }
  slash(m);
  assert.equal(m.marco('SnetForeverPanel').visible, false);

  // El chat de la IA: una respuesta con propuesta de comercio se enseña, sin la tarjeta [Aplicar].
  slash(m, 'chat');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_RESPUESTA", ${aLua({ t: 'respuesta', texto: 'Te propongo un grupo.', comercio: HIERBAS })})`);
  assert.equal(m.lua('SnetForever.Chat.marcos.comercio:IsVisible()'), false, 'sin comercio no hay [Aplicar]');
  assert.deepEqual(m.lua('SnetForeverPJ.ia.chat').filter((e) => e.q === 'ia').at(-1), { q: 'ia', t: 'Te propongo un grupo.' });
  m.lua('SnetForever.Eventos.emitir("SNF_COMERCIO_PROPUESTA")'); // aunque llegue el aviso, nada se rompe

  // El contexto de la IA se construye, sin la parte del comercio (también con la subasta abierta).
  m.lua(SUBASTA);
  m.disparar('AUCTION_HOUSE_SHOW');
  const ctx = m.lua('SnetForever.Contexto.construir()');
  assert.equal(typeof ctx, 'object');
  assert.equal(ctx.comercio, undefined);
  assert.ok(ctx.pj, 'el contexto lleva el personaje');
  m.disparar('AUCTION_HOUSE_CLOSED');

  // El diario: el precio sale con el mismo formato que con el comercio («1g 40s 00c»).
  m.lua('BANCO.nombresJuego.item[6414] = "Sello"');
  m.lua('SnetForeverPJ.diario.e = {{i = 6414, c = 1, t = 7, nv = 1, o = "subasta", p = 14000}}');
  slash(m, 'diario');
  assert.equal(impresos(m).at(-1), 'SnetForever: Sello — comprado en la subasta por 1g 40s 00c');

  // El botón del minimapa: clic izquierdo abre el panel; clic derecho alterna la ventana de la guía.
  m.lua('SnetForeverBotonMinimapa:Click("LeftButton")');
  assert.equal(m.marco('SnetForeverPanel').visible, true);
  m.lua('SnetForeverBotonMinimapa:Click("RightButton")');
  assert.equal(m.marco('SnetForeverVentana').visible, false);
  sinErrores(m);
});

test('con solo el núcleo: ia/subasta.lua no rompe: sin escaneo ni precios no hay precio, y apunta cuándo se abrió la subasta', () => {
  const m = nuevaMaquina({ ...SOLO, previo: SUBASTA });
  assert.equal(m.lua('SnetForever.Subasta.disponible()'), false);
  assert.equal(m.lua('SnetForever.Subasta.precio(2447)'), undefined);
  assert.equal(m.lua('SnetForever.Subasta.anotar({{id = 2447}})'), 0);
  m.disparar('AUCTION_HOUSE_SHOW');
  m.disparar('AUCTION_HOUSE_CLOSED');
  assert.equal(typeof m.lua('SnetForever.Subasta.vista()'), 'number');
  assert.equal(m.lua('SnetForever.Contexto.construir().subasta'), undefined, 'la IA no cree que hay precios');
  sinErrores(m);
});

test('con solo el núcleo: el diario da el mismo texto que con los dos addons', necesitaComercio, () => {
  const salida = (m) => {
    m.lua('BANCO.nombresJuego.item[5107] = "Camisa"');
    m.lua('SnetForeverPJ.diario.e = {{i = 5107, c = 1, t = 6, nv = 1, o = "vendedor", npc = 3143, p = 125}, {i = 5107, c = 1, t = 7, nv = 1, o = "subasta", p = 10203}}');
    slash(m, 'diario');
    return impresos(m).slice(-2);
  };
  const solo = nuevaMaquina(SOLO);
  const dos = nuevaMaquina({ jugador: JUGADOR });
  assert.deepEqual(salida(solo), salida(dos));
  sinErrores(solo);
  sinErrores(dos);
});

test('con solo el núcleo: /snet comercio avisa de que está desactivado y abrir la subasta no hace nada nuestro', () => {
  const m = nuevaMaquina({ ...SOLO, previo: SUBASTA });
  slash(m, 'comercio');
  assert.equal(impresos(m).at(-1), 'El comercio está desactivado: actívalo en la lista de addons (SnetForever Comercio)');
  assert.equal(texto(m, 'COMERCIO_NO_CARGADO'), 'El comercio está desactivado: actívalo en la lista de addons (SnetForever Comercio)');
  slash(m, 'trade');
  assert.equal(impresos(m).at(-1), texto(m, 'COMERCIO_NO_CARGADO'), 'también en inglés: /snet trade');
  const en = nuevaMaquina({ sinComercio: true, jugador: { idioma: 'enUS' } });
  slash(en, 'trade');
  assert.equal(impresos(en).at(-1), 'Trading is disabled: enable it in the AddOns list (SnetForever Comercio)');

  const marcos = m.lua('#BANCO.marcos');
  m.disparar('AUCTION_HOUSE_SHOW');
  m.avanzar(5);
  m.disparar('AUCTION_HOUSE_CLOSED');
  m.avanzar(1);
  assert.equal(m.lua('#BANCO.marcos'), marcos, 'no se crea ningún marco');
  assert.deepEqual(llamadasA(m, 'C_AuctionHouse'), [], 'no se pregunta nada a la subasta');
  assert.deepEqual(m.llamadas('C_AddOns.LoadAddOn'), [], 'no se cargan las ranuras de precios');
  assert.equal(m.lua('AuctionHouseFrame:IsShown()'), true, 'la subasta de Blizzard queda como está');
  sinErrores(m);
  sinErrores(en);
});

test('con los dos addons: /snet comercio no da el aviso de desactivado', necesitaComercio, () => {
  const m = nuevaMaquina({ jugador: JUGADOR });
  slash(m, 'comercio');
  assert.ok(!impresos(m).includes(texto(m, 'COMERCIO_NO_CARGADO')));
  sinErrores(m);
});

// El banco distingue, como el cliente, un addon que no está instalado (sinComercio: la carpeta no existe, «MISSING»)
// de uno instalado y desactivado en la lista (ranurasDesactivadas, «DISABLED»).
const infoComercio = (m) => m.lua('{C_AddOns.GetAddOnInfo("SnetForever_Comercio")}');
const estadoComercio = (m) => m.lua('C_AddOns.GetAddOnEnableState("SnetForever_Comercio", (UnitName("player")))');

test('banco: con ranurasDesactivadas el comercio está instalado y desactivado (DISABLED); EnableAddOn y /reload lo cargan', necesitaComercio, () => {
  const m = nuevaMaquina({ jugador: JUGADOR, ranurasDesactivadas: ['SnetForever_Comercio'] });
  assert.equal(m.lua('SnetForever.comercioCargado()'), false);
  assert.equal(m.lua('type(SnetForever.Comercio)'), 'nil');
  assert.equal(m.lua('C_AddOns.DoesAddOnExist("SnetForever_Comercio")'), true);
  assert.equal(m.lua('select(1, C_AddOns.GetAddOnInfo("SnetForever_Comercio"))'), 'SnetForever_Comercio');
  assert.equal(m.lua('select(2, C_AddOns.GetAddOnInfo("SnetForever_Comercio"))'), 'SnetForever Comercio', 'el título del .toc');
  assert.equal(m.lua('select(4, C_AddOns.GetAddOnInfo("SnetForever_Comercio"))'), false, 'no se puede cargar');
  assert.equal(m.lua('select(5, C_AddOns.GetAddOnInfo("SnetForever_Comercio"))'), 'DISABLED');
  assert.equal(estadoComercio(m), 0);
  m.lua('C_AddOns.EnableAddOn("SnetForever_Comercio")');
  assert.equal(estadoComercio(m), 2, 'el estado cambia en el acto; la carga, tras /reload');
  const n = m.recargar();
  assert.equal(n.lua('SnetForever.comercioCargado()'), true);
  assert.equal(n.lua('select(5, C_AddOns.GetAddOnInfo("SnetForever_Comercio"))'), undefined, 'cargado: sin motivo');
  sinErrores(n);
});

test('banco: sinComercio es una carpeta que no está (MISSING): EnableAddOn no lo carga tras /reload', () => {
  const m = nuevaMaquina({ jugador: JUGADOR, sinComercio: true });
  assert.equal(m.lua('C_AddOns.DoesAddOnExist("SnetForever_Comercio")'), false);
  assert.equal(m.lua('select(5, C_AddOns.GetAddOnInfo("SnetForever_Comercio"))'), 'MISSING');
  assert.equal(estadoComercio(m), 0);
  m.lua('C_AddOns.EnableAddOn("SnetForever_Comercio")');
  const n = m.recargar();
  assert.equal(n.lua('SnetForever.comercioCargado()'), false);
  assert.equal(n.lua('select(5, C_AddOns.GetAddOnInfo("SnetForever_Comercio"))'), 'MISSING');
  // El núcleo sí está, cargado.
  assert.equal(n.lua('C_AddOns.DoesAddOnExist("SnetForever")'), true);
  assert.equal(n.lua('select(5, C_AddOns.GetAddOnInfo("SnetForever"))'), undefined);
  sinErrores(n);
});

// ---------------------------------------------------------------------------------------------------
// Los datos y el paso de la 0.6.4
// ---------------------------------------------------------------------------------------------------

test('los datos de comercio siguen en SnetForeverCuenta aunque el comercio esté desactivado', necesitaComercio, () => {
  const m = nuevaMaquina({ jugador: JUGADOR });
  const clave = m.lua('SnetForever.Grupos.crear("Hierbas")');
  m.lua(`SnetForever.Grupos.anadir(${aLua(clave)}, 2447)`);
  const antes = m.lua('SnetForeverCuenta.comercio');
  // El jugador lo desactiva en la lista de addons: vale desde el /reload.
  m.lua('C_AddOns.DisableAddOn("SnetForever_Comercio")');
  const sin = m.recargar();
  assert.equal(sin.lua('SnetForever.comercioCargado()'), false);
  assert.deepEqual(sin.lua('SnetForeverCuenta.comercio'), antes, 'los grupos siguen guardados');
  const otra = sin.recargar();
  assert.deepEqual(otra.lua('SnetForeverCuenta.comercio'), antes, 'y tras otro /reload sin comercio');
  // Lo vuelve a activar: todo está donde estaba.
  otra.lua('C_AddOns.EnableAddOn("SnetForever_Comercio")');
  const con = otra.recargar();
  assert.equal(con.lua('SnetForever.comercioCargado()'), true);
  const g = con.lua('SnetForever.Grupos.lista()').find((x) => x.clave === clave);
  assert.deepEqual(g.objetos, [2447]);
  sinErrores(con);
});

const APAGADO_064 = { jugador: JUGADOR, previo: SUBASTA, guardado: { SnetForeverPJ: { esquema: 1, ajustes: { comercioActivo: false } } } };

test('si en la 0.6.4 el comercio estaba apagado, la 0.7.0 lo desactiva una vez, avisa y borra el ajuste', necesitaComercio, () => {
  const m = nuevaMaquina(APAGADO_064);
  const pj = m.lua('UnitName("player")');
  assert.deepEqual(m.llamadas('C_AddOns.DisableAddOn'), [['SnetForever_Comercio', pj]], 'para este personaje');
  const aviso = texto(m, 'COMERCIO_DESACTIVADO_064');
  assert.equal(impresos(m).filter((t) => t === aviso).length, 1, 'avisa una vez');
  assert.match(aviso, /SnetForever Comercio/);
  assert.match(aviso, /lista de addons/);
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), undefined, 'el ajuste se borra');
  assert.notEqual(m.lua('SnetForever.Ajustes.get("comercioActivo")'), false, 'y no vuelve a salir como apagado');
  // En esta sesión el comercio no despierta.
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  assert.equal(m.lua('SnetForever.UIComercio.marco()'), undefined);
  m.disparar('AUCTION_HOUSE_CLOSED');
  // Ni la IA puede proponer grupos en esta sesión: sin [Aplicar].
  slash(m, 'chat');
  m.lua(`SnetForever.Eventos.emitir("SNF_IA_RESPUESTA", ${aLua({ t: 'respuesta', texto: 'Hola', comercio: HIERBAS })})`);
  assert.equal(m.lua('SnetForever.Chat.marcos.comercio:IsVisible()'), false, 'dormido, sin [Aplicar]');
  sinErrores(m);

  // Desde el /reload el juego ya no lo carga, y no se repite nada.
  const n = m.recargar();
  assert.equal(n.lua('SnetForever.comercioCargado()'), false);
  assert.deepEqual(n.llamadas('C_AddOns.DisableAddOn'), []);
  assert.ok(!impresos(n).includes(aviso));
  sinErrores(n);

  // Si el jugador lo vuelve a activar en la lista, carga y despierta.
  n.lua('C_AddOns.EnableAddOn("SnetForever_Comercio")');
  const o = n.recargar();
  assert.equal(o.lua('SnetForever.comercioCargado()'), true);
  assert.deepEqual(o.llamadas('C_AddOns.DisableAddOn'), []);
  o.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(o.lua('SnetForever.Comercio.activo()'), true);
  sinErrores(o);
});

test('0.6.4 apagado: sin C_AddOns.DisableAddOn usa el DisableAddOn global', necesitaComercio, () => {
  const previo = `${SUBASTA}; rawset(_G, "DisableAddOn", function(...) BANCO.anotar("DisableAddOn", ...); BANCO.addonsCambiados[(...)] = false end)`;
  const m = nuevaMaquina({ ...APAGADO_064, previo, sinApi: ['C_AddOns.DisableAddOn'] });
  assert.deepEqual(m.llamadas('DisableAddOn'), [['SnetForever_Comercio', m.lua('UnitName("player")')]]);
  assert.equal(impresos(m).filter((t) => t === texto(m, 'COMERCIO_DESACTIVADO_064')).length, 1);
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), undefined);
  sinErrores(m);
});

test('0.6.4 apagado: sin ninguna de las dos (o si falla), solo avisa y el comercio no despierta', necesitaComercio, () => {
  for (const previo of [SUBASTA, `${SUBASTA}; rawset(C_AddOns, "DisableAddOn", function() error("prohibido") end)`]) {
    const sinApi = previo === SUBASTA ? ['C_AddOns.DisableAddOn'] : [];
    const m = nuevaMaquina({ ...APAGADO_064, previo, sinApi });
    const aviso = texto(m, 'COMERCIO_DESACTIVAR_A_MANO');
    assert.equal(impresos(m).filter((t) => t === aviso).length, 1, previo);
    assert.match(aviso, /SnetForever Comercio/);
    m.disparar('AUCTION_HOUSE_SHOW');
    assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
    m.disparar('AUCTION_HOUSE_CLOSED');
    // El ajuste se queda: hasta que el jugador lo desactive en la lista, el comercio sigue dormido y lo recuerda.
    assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), false);
    sinErrores(m);
  }
});

test('0.6.4 apagado: si DisableAddOn no deja el addon desactivado, el ajuste se queda y avisa «no se pudo»', necesitaComercio, () => {
  const m = nuevaMaquina({ ...APAGADO_064, previo: `${SUBASTA}; rawset(C_AddOns, "DisableAddOn", function() end)` });
  assert.equal(estadoComercio(m), 2, 'el cliente imitado no lo desactiva');
  assert.equal(impresos(m).filter((t) => t === texto(m, 'COMERCIO_DESACTIVAR_A_MANO')).length, 1);
  assert.ok(!impresos(m).includes(texto(m, 'COMERCIO_DESACTIVADO_064')));
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), false);
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false);
  sinErrores(m);
});

test('0.6.4 apagado: el aviso «no se pudo» da las dos salidas y /snet comercio activar lo despierta y borra el ajuste', necesitaComercio, () => {
  const m = nuevaMaquina({ ...APAGADO_064, sinApi: ['C_AddOns.DisableAddOn'] });
  const aviso = texto(m, 'COMERCIO_DESACTIVAR_A_MANO');
  assert.match(aviso, /SnetForever Comercio/);
  assert.match(aviso, /lista de addons/);
  assert.match(aviso, /\/snet comercio activar/);
  const en = nuevaMaquina({ jugador: { idioma: 'enUS' }, sinComercio: true });
  assert.match(texto(en, 'COMERCIO_DESACTIVAR_A_MANO'), /AddOns list/);
  assert.match(texto(en, 'COMERCIO_DESACTIVAR_A_MANO'), /\/snet comercio activar/);
  assert.equal(impresos(m).filter((t) => t === aviso).length, 1, 'una vez por sesión');
  slash(m, 'comercio activar');
  assert.equal(impresos(m).at(-1), texto(m, 'COMERCIO_ACTIVADO'));
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), undefined, 'el ajuste viejo se borra');
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true, 'despierta ya en esta sesión');
  m.disparar('AUCTION_HOUSE_CLOSED');
  sinErrores(m);
  const n = m.recargar();
  assert.ok(!impresos(n).includes(aviso), 'tras /reload ya no avisa');
  n.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(n.lua('SnetForever.Comercio.activo()'), true);
  // En inglés también vale «/snet trade activar».
  const t = nuevaMaquina({ ...APAGADO_064, jugador: { ...JUGADOR, idioma: 'enUS' }, sinApi: ['C_AddOns.DisableAddOn'] });
  slash(t, 'trade activar');
  assert.equal(t.lua('SnetForeverPJ.ajustes.comercioActivo'), undefined);
  sinErrores(n);
  sinErrores(t);
  sinErrores(en);
});

test('0.6.4 apagado y desactivado por la migración: /snet comercio activar lo vuelve a activar, despierta y tras /reload sigue cargado', necesitaComercio, () => {
  const m = nuevaMaquina(APAGADO_064);
  const pj = m.lua('(UnitName("player"))');
  assert.equal(estadoComercio(m), 0, 'la migración lo desactivó');
  slash(m, 'comercio activar');
  assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), [['SnetForever_Comercio', pj]], 'para este personaje');
  assert.equal(estadoComercio(m), 2);
  assert.equal(impresos(m).at(-1), texto(m, 'COMERCIO_ACTIVADO'));
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), true, 'despierta en esta sesión');
  m.disparar('AUCTION_HOUSE_CLOSED');
  sinErrores(m);
  const n = m.recargar();
  assert.equal(n.lua('SnetForever.comercioCargado()'), true, 'tras /reload sigue cargado');
  assert.deepEqual(n.llamadas('C_AddOns.DisableAddOn'), [], 'y no se vuelve a desactivar');
  n.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(n.lua('SnetForever.Comercio.activo()'), true);
  sinErrores(n);
});

test('0.6.4 apagado y desactivado por la migración: si EnableAddOn no lo activa, /snet comercio activar avisa y no despierta', necesitaComercio, () => {
  const m = nuevaMaquina({ ...APAGADO_064, previo: `${SUBASTA}; rawset(C_AddOns, "EnableAddOn", function() end)` });
  slash(m, 'comercio activar');
  const aviso = texto(m, 'COMERCIO_NO_REACTIVADO');
  assert.equal(impresos(m).at(-1), aviso);
  assert.ok(!impresos(m).includes(texto(m, 'COMERCIO_ACTIVADO')));
  assert.match(aviso, /lista de addons/);
  assert.match(aviso, /\/reload/);
  assert.equal(estadoComercio(m), 0);
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.Comercio.activo()'), false, 'no despierta');
  m.disparar('AUCTION_HOUSE_CLOSED');
  sinErrores(m);
  const n = m.recargar();
  assert.equal(n.lua('SnetForever.comercioCargado()'), false, 'sigue desactivado');
  sinErrores(n);
});

test('0.6.4 apagado y el comercio sin instalar: /snet comercio activar no borra nada y avisa de que no está instalado', () => {
  const m = nuevaMaquina({ ...APAGADO_064, sinComercio: true });
  slash(m, 'comercio activar');
  const aviso = texto(m, 'COMERCIO_NO_INSTALADO');
  assert.equal(impresos(m).at(-1), aviso);
  assert.match(aviso, /SnetForever Comercio/);
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), false, 'el ajuste sigue guardado para la migración');
  assert.deepEqual(m.llamadas('C_AddOns.EnableAddOn'), []);
  const en = nuevaMaquina({ sinComercio: true, jugador: { idioma: 'enUS' } });
  assert.match(texto(en, 'COMERCIO_NO_INSTALADO'), /SnetForever Comercio/);
  assert.match(texto(en, 'COMERCIO_NO_REACTIVADO'), /AddOns list/);
  sinErrores(m);
  sinErrores(en);
});

test('0.6.4 apagado y el comercio instalado pero desactivado en la lista: el ajuste se borra sin avisar ni pedir nada', necesitaComercio, () => {
  const m = nuevaMaquina({ ...APAGADO_064, ranurasDesactivadas: ['SnetForever_Comercio'] });
  assert.deepEqual(m.llamadas('C_AddOns.DisableAddOn'), []);
  assert.ok(!impresos(m).includes(texto(m, 'COMERCIO_DESACTIVADO_064')));
  assert.ok(!impresos(m).includes(texto(m, 'COMERCIO_DESACTIVAR_A_MANO')));
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), undefined);
  sinErrores(m);
});

test('0.6.4 apagado y el comercio sin instalar (MISSING): el ajuste se guarda sin avisar; al instalarlo, se desactiva, avisa y se borra', necesitaComercio, () => {
  const sin = nuevaMaquina({ ...APAGADO_064, sinComercio: true });
  assert.deepEqual(sin.llamadas('C_AddOns.DisableAddOn'), []);
  assert.ok(!impresos(sin).some((t) => t.includes('SnetForever Comercio')), 'no avisa de nada');
  assert.equal(sin.lua('SnetForeverPJ.ajustes.comercioActivo'), false, 'el ajuste se guarda para cuando llegue');
  sinErrores(sin);
  const despues = sin.recargar();
  assert.equal(despues.lua('SnetForeverPJ.ajustes.comercioActivo'), false, 'también tras /reload');
  // «Se instala» el comercio: la misma partida guardada, ahora con la carpeta.
  const con = nuevaMaquina({ jugador: JUGADOR, previo: SUBASTA, guardado: despues.guardado() });
  assert.deepEqual(con.llamadas('C_AddOns.DisableAddOn'), [['SnetForever_Comercio', con.lua('(UnitName("player"))')]]);
  assert.equal(impresos(con).filter((t) => t === texto(con, 'COMERCIO_DESACTIVADO_064')).length, 1);
  assert.equal(con.lua('SnetForeverPJ.ajustes.comercioActivo'), undefined);
  con.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(con.lua('SnetForever.Comercio.activo()'), false);
  sinErrores(con);
});

test('0.6.4 apagado y sin forma de preguntar si el comercio está instalado: el ajuste se guarda', necesitaComercio, () => {
  const m = nuevaMaquina({ ...APAGADO_064, ranurasDesactivadas: ['SnetForever_Comercio'],
    sinApi: ['C_AddOns.GetAddOnInfo', 'C_AddOns.DoesAddOnExist'] });
  assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), false);
  assert.deepEqual(m.llamadas('C_AddOns.DisableAddOn'), []);
  sinErrores(m);
});

test('sin el ajuste de la 0.6.4 (o encendido) no se pide nada al juego ni se avisa', necesitaComercio, () => {
  for (const ajustes of [{}, { comercioActivo: true }]) {
    const m = nuevaMaquina({ jugador: JUGADOR, guardado: { SnetForeverPJ: { esquema: 1, ajustes } } });
    assert.deepEqual(m.llamadas('C_AddOns.DisableAddOn'), []);
    assert.ok(!impresos(m).includes(texto(m, 'COMERCIO_DESACTIVADO_064')));
    assert.equal(m.lua('SnetForeverPJ.ajustes.comercioActivo'), undefined);
    m.lua(SUBASTA);
    m.disparar('AUCTION_HOUSE_SHOW');
    assert.equal(m.lua('SnetForever.Comercio.activo()'), true);
    sinErrores(m);
  }
});

test('con solo el núcleo: /snet muestrario avisa de que el comercio está desactivado y no rompe (es y en)', () => {
  const m = nuevaMaquina(SOLO);
  slash(m, 'muestrario');
  assert.equal(impresos(m).at(-1), texto(m, 'COMERCIO_NO_CARGADO'));
  assert.ok(!m.lua('rawget(_G, "SnetForeverMuestrario")'));
  const en = nuevaMaquina({ sinComercio: true, jugador: { idioma: 'enUS' } });
  slash(en, 'muestrario');
  assert.equal(impresos(en).at(-1), 'Trading is disabled: enable it in the AddOns list (SnetForever Comercio)');
  sinErrores(m);
  sinErrores(en);
});
