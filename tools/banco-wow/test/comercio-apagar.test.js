// El comercio (la parte de la subasta) se apaga sin apagar la guía. En la 0.6.4 era la casilla «comercioActivo» del panel
// /snet; desde la 0.7.0 el comercio es el addon SnetForever_Comercio y se activa o desactiva en la lista de addons del
// juego. Desactivado, abrir la subasta no crea ni enseña nada nuestro, no escanea y el resto del addon (la guía) sigue
// igual. El paso del ajuste viejo a la lista de addons se prueba en comercio-aparte.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaMaquina, sinErrores, necesitaComercio } from './ayuda.js';

const C = 'SnetForever.Panel.controles';
const M = 'SnetForever.Panel.marcos';
const SUBASTA = 'rawset(_G, "AuctionHouseFrame", CreateFrame("Frame", "AuctionHouseFrame", UIParent)); AuctionHouseFrame:SetSize(800, 500); AuctionHouseFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -100); AuctionHouseFrame.Tabs = {}';

function maquina(opciones = {}) {
  const m = nuevaMaquina({ jugador: { idioma: 'esES', reino: 'Normal', faccion: 'Horde' }, ...opciones });
  m.lua('SnetForever.Guias.cargar(SnetForever.Guias.porDefecto())');
  m.lua('SnetForever.Ventana.crear()');
  m.lua(SUBASTA);
  return m;
}
const activo = (m) => m.lua('SnetForever.Comercio.activo()');

test('por defecto el comercio está cargado: abrir la subasta lo activa', necesitaComercio, () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.comercioCargado()'), true);
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(activo(m), true);
  sinErrores(m);
});

test('con el comercio desactivado en la lista de addons, abrir la subasta no activa nada ni crea la ventana de comercio, y la guía sigue', () => {
  const m = maquina({ ranurasDesactivadas: ['SnetForever_Comercio'] });
  assert.equal(m.lua('SnetForever.comercioCargado()'), false);
  m.disparar('AUCTION_HOUSE_SHOW');
  assert.equal(m.lua('SnetForever.Comercio'), undefined, 'no hay comercio que despertar');
  assert.equal(m.lua('SnetForever.UIComercio'), undefined, 'no se crea la ventana de comercio');
  assert.equal(m.lua('SnetForever.GuideViews.frames.notice:IsVisible()'), true, 'la ventana de la guía sigue');
  m.disparar('AUCTION_HOUSE_CLOSED');
  sinErrores(m);
});

test('comercioActivo ya no es un ajuste: ni valor por defecto ni Ajustes.set', () => {
  const m = maquina();
  assert.equal(m.lua('SnetForever.Ajustes.DEFECTO["comercioActivo"]'), undefined);
  assert.equal(m.lua('SnetForever.Ajustes.get("comercioActivo")'), undefined);
  assert.throws(() => m.lua('SnetForever.Ajustes.set("comercioActivo", false)'), /clave desconocida/);
  sinErrores(m);
});

// 10b: la nota PANEL_COMERCIO_ADDON de «Chat con la IA» se fue; el comercio tiene su propia tarjeta en el panel
// (panel-comercio.test.js). Aquí solo queda que la casilla vieja no existe y que el texto de la nota ya no está.
test('el panel /snet ya no tiene la casilla vieja ni la nota en «Chat con la IA»: el comercio tiene su tarjeta', () => {
  const m = maquina();
  assert.equal(m.lua(`${C}["comercioActivo"]`), undefined);
  assert.equal(m.lua('SnetForever.L.t("PANEL_COMERCIO_ACTIVO")'), 'PANEL_COMERCIO_ACTIVO', 'el texto de la casilla se ha ido');
  assert.equal(m.lua('SnetForever.L.t("PANEL_COMERCIO_ADDON")'), 'PANEL_COMERCIO_ADDON', 'y el de la nota también');
  m.lua('SlashCmdList.SNET("")');
  m.lua(`${M}.tarjetas.ia:Click()`);
  assert.equal(m.lua(`${M}.ia.comercio`), undefined);
  assert.equal(m.lua(`${M}.secciones.comercio ~= nil`), true, 'el comercio es otro apartado');
  sinErrores(m);
});
