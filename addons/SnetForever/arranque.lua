-- SnetForever: arranque. Se carga el último del .toc y conecta los módulos en el orden del cliente:
--   * ADDON_LOADED(nombre de este addon): Guardado.preparar() (las SavedVariables ya han llegado) y se mira el ajuste
--     «comercioActivo» de la 0.6.4. ADDON_LOADED(SnetForever_Comercio): el comercio cargó (ver «El addon de comercio»).
--   * PLAYER_LOGIN: Datos.comprobar(); si falla, el aviso DATOS_ROTOS en el chat y no se crea nada más (/snet solo
--     repite el aviso, ui/panel.lua). Si no, la ventana, el marco de objetivos cercanos (ui/objetivos.lua), la flecha,
--     los pines del mapa del mundo (y los dibujos de la IA) y del minimapa, el panel y el botón del minimapa. Si
--     WorldMapFrame aún no existe, PinesMundo.crear() se reintenta al entrar al mundo y cuando cargue Blizzard_WorldMap
--     (ADDON_LOADED).
--   * el primer PLAYER_ENTERING_WORLD: se relee al personaje (Personaje.leer()), se carga SnetForeverPJ.guia si existe
--     en los datos (Motor.cargar reanuda su progreso) y si no Guias.porDefecto() de ese personaje, y eso arranca el
--     temporizador del motor. Los avisos de clase los revisa motor/avisos.lua en cada entrada al mundo.
--     Los siguientes PLAYER_ENTERING_WORLD no recargan la guía: solo reanudan los temporizadores.
--   * PLAYER_LEAVING_WORLD: para los temporizadores del motor y de la navegación (Motor.parar, Navegacion.parar).
--
-- /snet prueba (Arranque.ponerPrueba): pone en la capa "jugador" dos puntos con seguir = true para comprobar en el
-- juego, sin moverse, la flecha, el mapa y el minimapa. Con j = Coord.jugador() y r = GetPlayerFacing() (0 = norte,
-- creciendo hacia el oeste; wx crece al oeste y wy al norte, mapa/coordenadas.lua):
--   A, 40 yd por delante: wx = j.wx + 40·sin(r), wy = j.wy + 40·cos(r)   «Prueba A (delante)»
--   B, 40 yd a la izquierda: lo mismo con r + π/2                       «Prueba B (izquierda)»
-- Sin posición o sin rumbo (dentro de una instancia) solo avisa. /snet prueba fin (Arranque.quitarPrueba) vacía la
-- capa "jugador". Trigonometría con math.* (radianes), nunca con las sin/cos globales de WoW (grados).
local NOMBRE_ADDON, SNF = ...
local Arranque = {}
SNF.Arranque = Arranque

local L = SNF.L
local Capa = SNF.Capa
local Coord = SNF.Coord

local DISTANCIA_PRUEBA = 40 -- yardas

local datosBien = false -- PLAYER_LOGIN encontró los datos bien: se creó todo
local enMundo = false -- ya hubo un PLAYER_ENTERING_WORLD (la guía está cargada)
local pinesMundo = false -- PinesMundo.crear() ya enganchó el mapa del mundo

local function crearPinesMundo()
  if datosBien and not pinesMundo then
    pinesMundo = SNF.PinesMundo.crear() == true
    if pinesMundo then
      SNF.Dibujos.crear() -- los dibujos de la IA enganchan el mismo mapa (mapa/dibujos.lua)
    end
  end
end

---------------------------------------------------------------------------------------------------
-- El addon de comercio (0.7.0)
---------------------------------------------------------------------------------------------------
-- El comercio es el addon SnetForever_Comercio («## Dependencies: SnetForever»): el cliente lo carga después de este
-- addon y de su ADDON_LOADED, y usa nuestras SavedVariables (los datos siguen aquí aunque esté desactivado).
-- SNF.comercioCargado() dice si cargó: se apunta con su ADDON_LOADED. Todo lo que el núcleo llama del comercio comprueba
-- antes que existe (ui/chat.lua, ia/contexto.lua, ia/diario.lua, ia/subasta.lua y /snet comercio en ui/panel.lua).
--
-- Paso desde la 0.6.4, donde el comercio se apagaba con la casilla «comercioActivo» del panel. En el ADDON_LOADED del
-- núcleo (antes de cargar el comercio) se mira si este personaje lo tenía apagado; en PLAYER_LOGIN, con todos los addons
-- ya cargados:
--   * apagado y el comercio cargado: en esta sesión no despierta (SNF.comercioDormido(), que mira comercio/comercio.lua);
--     se pide al juego que lo desactive para este personaje (DisableAddOn, de C_AddOns o la global; con pcall: no está
--     protegida y vale desde el siguiente /reload) y, si hay GetAddOnEnableState, se comprueba que ya figura
--     desactivado. Entonces se avisa una vez (COMERCIO_DESACTIVADO_064) y se borra el ajuste. Si no hay DisableAddOn, si
--     falla o si el addon no queda desactivado, se avisa en cada sesión (COMERCIO_DESACTIVAR_A_MANO, con las dos
--     salidas: desactivarlo en la lista o escribir /snet comercio activar) y el ajuste se queda: el comercio sigue
--     dormido hasta que el jugador elija;
--   * apagado y el comercio instalado pero desactivado en la lista: ya está como quería; el ajuste se borra sin avisar;
--   * apagado y el comercio sin instalar («MISSING» en GetAddOnInfo, o DoesAddOnExist da false) o sin forma de
--     saberlo: el ajuste se guarda tal cual y no se avisa. La migración se hará cuando el comercio llegue instalado
--     (si no, entraría activado y se perdería lo que eligió el jugador);
--   * encendido o sin ajuste: se borra lo que haya, sin más.
-- /snet comercio activar (SNF.activarComercio): el jugador quiere usar el comercio. Sin la carpeta instalada no se toca
-- nada (el ajuste espera a la migración). Si la migración lo desactivó en esta sesión, primero se vuelve a activar
-- (EnableAddOn) y se comprueba; si no se puede, no despierta. Si no, se borra el ajuste viejo y despierta desde ya.
-- 0.7.0, tarjeta «Comercio» del panel: instalado pero desactivado en la lista desde antes, también hace EnableAddOn para este
-- personaje y devuelve «recargar» (carga en el próximo /reload). SNF.estadoComercio, SNF.comercioPendiente y
-- SNF.ponerComercio (la casilla «Usar el comercio») leen y cambian ese mismo estado del cliente.
-- F3: el personaje que reciben DisableAddOn, EnableAddOn y GetAddOnEnableState sale de una sola función,
-- personajeParaAddons(). Hoy da el primer valor de UnitName (en Forever, el nombre sin el apellido); qué espera el
-- cliente de Forever (el primer nombre, «Nombre Apellido» o el GUID) está por mirar en el juego.
local ADDON_COMERCIO = "SnetForever_Comercio"
local comercioCargado = false
local comercioDormido = false
local desactivadoEnSesion = false -- la migración lo desactivó (con éxito) en esta sesión
local pendienteSesion = nil -- "seApaga" o "seEnciende": lo que se cambió en esta sesión (casilla o botón del panel) y espera al /reload

function SNF.comercioCargado()
  return comercioCargado
end

function SNF.comercioDormido()
  return comercioDormido
end

local function ajustesDe(nombre)
  local t = rawget(_G, nombre)
  return type(t) == "table" and type(t.ajustes) == "table" and t.ajustes or nil
end

local function borrarAjusteViejo()
  for _, nombre in ipairs({"SnetForeverPJ", "SnetForeverCuenta"}) do
    local ajustes = ajustesDe(nombre)
    if ajustes then
      ajustes.comercioActivo = nil
    end
  end
end

-- La función del cliente C_AddOns.<nombre> (y true) o, en un cliente viejo, la global (y false); nil si no hay ninguna.
local function delCliente(nombre)
  local espacio = rawget(_G, "C_AddOns")
  local f = type(espacio) == "table" and rawget(espacio, nombre) or nil
  if type(f) == "function" then
    return f, true
  end
  f = rawget(_G, nombre)
  if type(f) == "function" then
    return f, false
  end
  return nil
end

-- true solo si se sabe que la carpeta del comercio está instalada (cargado, DoesAddOnExist o GetAddOnInfo sin
-- «MISSING»). Si falta, si la pregunta falla o si no hay cómo preguntar, false: el ajuste viejo se guarda.
local function comercioInstalado()
  if comercioCargado then
    return true
  end
  local existe = delCliente("DoesAddOnExist")
  if existe then
    local ok, si = pcall(existe, ADDON_COMERCIO)
    if ok and type(si) == "boolean" then
      return si
    end
  end
  local info = delCliente("GetAddOnInfo")
  if info then
    local ok, nombre, _, _, _, motivo = pcall(info, ADDON_COMERCIO)
    return ok and nombre ~= nil and motivo ~= "MISSING"
  end
  return false
end

-- El personaje que se pasa a DisableAddOn, EnableAddOn y GetAddOnEnableState (F3: el único sitio; cuando se sepa qué
-- espera el cliente de Forever, el cambio es aquí). Hoy, solo el primer valor (UnitName da también el apellido o el reino).
local function personajeParaAddons()
  return (UnitName("player"))
end

-- ¿Figura ya desactivado para este personaje? true o false; nil si no hay cómo saberlo. Enum.AddOnEnableState: 0 =
-- desactivado. C_AddOns.GetAddOnEnableState es (addon, personaje); la global vieja, (personaje, addon).
local function quedoDesactivado(personaje)
  local f, nueva = delCliente("GetAddOnEnableState")
  if not f then
    return nil
  end
  local ok, estado
  if nueva then
    ok, estado = pcall(f, ADDON_COMERCIO, personaje)
  else
    ok, estado = pcall(f, personaje, ADDON_COMERCIO)
  end
  if not ok or type(estado) ~= "number" then
    return nil
  end
  return estado == 0
end

-- true si el juego desactivó el addon de comercio para este personaje (o lo aceptó y no hay cómo comprobarlo).
local function desactivarComercio()
  local f = delCliente("DisableAddOn")
  if not f then
    return false
  end
  local personaje = personajeParaAddons()
  if not pcall(f, ADDON_COMERCIO, personaje) then
    return false
  end
  return quedoDesactivado(personaje) ~= false
end

-- true si el juego volvió a activar el addon de comercio para este personaje (o lo aceptó y no hay cómo comprobarlo).
local function reactivarComercio()
  local f = delCliente("EnableAddOn")
  if not f then
    return false
  end
  local personaje = personajeParaAddons()
  if not pcall(f, ADDON_COMERCIO, personaje) then
    return false
  end
  return quedoDesactivado(personaje) ~= true
end

-- Devuelve lo que pasó: "activado" (despierta ya), "recargar" (instalado, pero desactivado en la lista desde antes de esta
-- sesión: se ha vuelto a activar para este personaje y carga en el próximo /reload), "noReactivado" (no se pudo volver a
-- activar: no despierta) o "noInstalado" (sin la carpeta: no se borra nada).
function SNF.activarComercio()
  if not comercioInstalado() then
    return "noInstalado"
  end
  -- Hay que volver a activarlo si no está cargado o si hay un apagado pendiente (la migración, la casilla del panel o
  -- la lista de addons del juego).
  if desactivadoEnSesion or not comercioCargado or SNF.comercioPendiente() == "seApaga" then
    if not reactivarComercio() then
      return "noReactivado"
    end
    desactivadoEnSesion = false
  end
  borrarAjusteViejo()
  comercioDormido = false
  if comercioCargado then
    pendienteSesion = nil
    return "activado"
  end
  pendienteSesion = "seEnciende"
  return "recargar"
end

-- Lo que ve la tarjeta «Comercio» del panel: "cargado", "apagado" (instalado y no cargado) o "noInstalado" (también si no
-- hay forma de saberlo).
function SNF.estadoComercio()
  if comercioCargado then
    return "cargado"
  end
  if comercioInstalado() then
    return "apagado"
  end
  return "noInstalado"
end

-- Lo cambiado en esta sesión que espera al /reload: "seApaga" (cargado y desactivado en la lista), "seEnciende" (apagado
-- y activado en la lista) o nil.
function SNF.comercioPendiente()
  -- Lo que dice el cliente (GetAddOnEnableState), si se puede saber; si no, lo que se cambió en esta sesión.
  local figuraApagado = quedoDesactivado(personajeParaAddons())
  if comercioCargado then
    if figuraApagado == true or (figuraApagado == nil and (desactivadoEnSesion or pendienteSesion == "seApaga")) then
      return "seApaga"
    end
  elseif comercioInstalado() then
    if figuraApagado == false or (figuraApagado == nil and pendienteSesion == "seEnciende") then
      return "seEnciende"
    end
  end
  return nil
end

-- La casilla «Usar el comercio» del panel. false apaga el comercio para este personaje (vale tras el /reload); true lo
-- deja como estaba. Devuelve true si el juego lo aceptó. Solo tiene sentido con el comercio cargado.
function SNF.ponerComercio(encendido)
  if not comercioCargado then
    return false
  end
  if not encendido then
    if not desactivarComercio() then
      return false
    end
    pendienteSesion = "seApaga"
    return true
  end
  return SNF.activarComercio() == "activado"
end

local function pasarAjusteViejo()
  if not comercioDormido then
    borrarAjusteViejo()
    return
  end
  if not comercioCargado then
    if comercioInstalado() then
      borrarAjusteViejo()
    end
    return
  end
  if desactivarComercio() then
    desactivadoEnSesion = true
    print(L.t("COMERCIO_DESACTIVADO_064"))
    borrarAjusteViejo()
  else
    print(L.t("COMERCIO_DESACTIVAR_A_MANO"))
  end
end

---------------------------------------------------------------------------------------------------
-- Eventos de inicio
---------------------------------------------------------------------------------------------------

SNF.escuchar("ADDON_LOADED", function(nombre)
  if nombre == NOMBRE_ADDON then
    SNF.Guardado.preparar()
    local ajustes = ajustesDe("SnetForeverPJ")
    comercioDormido = ajustes ~= nil and ajustes.comercioActivo == false
  else
    if nombre == ADDON_COMERCIO then
      comercioCargado = true
    end
    -- Blizzard_WorldMap puede cargarse después de PLAYER_LOGIN.
    crearPinesMundo()
  end
end)

SNF.escuchar("PLAYER_LOGIN", function()
  pasarAjusteViejo()
  local bien, motivo = SNF.Datos.comprobar()
  if not bien then
    print(L.t("DATOS_ROTOS", motivo))
    return
  end
  datosBien = true
  SNF.Ventana.crear()
  SNF.Objetivos.crear()
  SNF.Flecha.crear()
  crearPinesMundo()
  SNF.PinesMinimapa.crear()
  SNF.Panel.crear()
  SNF.BotonMinimapa.crear()
  -- «Mis guías»: el progreso de una guía que cambió de nombre (nombre_antes) pasa al nuevo antes de cargar la guía;
  -- luego, cuántas se cargaron y lo que no se pudo usar (solo si está el addon SnetForever_MisGuias).
  SNF.MisGuias.migrarProgreso()
  SNF.MisGuias.anunciar()
  SNF.ImportarRXP.anunciar()
end)

-- La guía del personaje: la guardada si sigue en los datos (con su progreso); si era una lateral abierta desde una
-- principal (volverA), se conserva la vuelta; si ya no existe, la principal de volverA y, si tampoco, la de por defecto.
local function cargarGuia(pj)
  local Datos, Guias = SNF.Datos, SNF.Guias
  local guardada = SnetForeverPJ.guia
  local volverA = SnetForeverPJ.volverA
  local haceVuelta = type(volverA) == "string" and Datos.guia(volverA) ~= nil
  if type(guardada) == "string" and Datos.guia(guardada) then
    local conservar = haceVuelta and guardada == SnetForeverPJ.lateral
    if Guias.cargar(guardada, nil, conservar) then
      return
    end
  end
  if haceVuelta and Guias.cargar(volverA) then
    return
  end
  local porDefecto = SNF.Guias.porDefecto(pj)
  if porDefecto then
    SNF.Guias.cargar(porDefecto)
  end
end

SNF.escuchar("PLAYER_ENTERING_WORLD", function()
  if not datosBien then
    return
  end
  SNF.Motor.reanudar()
  SNF.Navegacion.reanudar()
  crearPinesMundo()
  if enMundo then
    return
  end
  enMundo = true
  -- 16-nov: mientras se carga la guía guardada, Arranque.cargandoGuia: quien escuche SNF_GUIA_CARGADA sabe que no la
  -- eligió el jugador (la ventana no vuelve a abrir el «Cómo llegar» que cerró).
  Arranque.cargandoGuia = true
  local ok, fallo = pcall(cargarGuia, SNF.Personaje.leer())
  Arranque.cargandoGuia = false
  if not ok then
    error(fallo, 0)
  end
end)

SNF.escuchar("PLAYER_LEAVING_WORLD", function()
  SNF.Motor.parar()
  SNF.Navegacion.parar()
end)

---------------------------------------------------------------------------------------------------
-- /snet prueba
---------------------------------------------------------------------------------------------------

local function puntoPrueba(j, mapa, angulo, etiqueta, orden)
  return {
    mapa = mapa,
    inst = j.inst,
    wx = j.wx + DISTANCIA_PRUEBA * math.sin(angulo),
    wy = j.wy + DISTANCIA_PRUEBA * math.cos(angulo),
    etiqueta = etiqueta,
    orden = orden,
    seguir = true,
  }
end

function Arranque.ponerPrueba()
  local j = Coord.jugador()
  local rumbo = GetPlayerFacing()
  if not j or rumbo == nil then
    print(L.t("PRUEBA_SIN_POSICION"))
    return false
  end
  local mapa = C_Map.GetBestMapForUnit("player")
  Capa.poner("jugador", {
    puntoPrueba(j, mapa, rumbo, L.t("PRUEBA_A"), 1),
    puntoPrueba(j, mapa, rumbo + math.pi / 2, L.t("PRUEBA_B"), 2),
  })
  print(L.t("PRUEBA_PUESTA"))
  return true
end

function Arranque.quitarPrueba()
  Capa.quitar("jugador")
  print(L.t("PRUEBA_QUITADA"))
end
