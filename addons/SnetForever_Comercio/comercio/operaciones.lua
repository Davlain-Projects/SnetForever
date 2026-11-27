-- SnetForever: operaciones del comercio, los 7 tipos (subasta, artesanía, correo, compras, sniper, vendedor y almacén).
-- Una operación es un conjunto de ajustes con nombre que se asigna a grupos (la idea y los campos son los de las
-- operaciones de TSM, con nombres y valores nuestros). Aquí no hay ventana: es la lógica que usarán las páginas de
-- Operaciones y de Grupos.
--
-- Guardado (SnetForeverCuenta.comercio.v2, la plantilla está en el núcleo; lo roto va a `_roto` y lo borrado a
-- `_papelera`, nada se pierde):
--   operaciones[tipo][nombre] = {valores = {campo = valor}, vinculos = {campo = otraOperacion},
--                                ignorarReinos = {casa = true}, ignorarPersonajes = {personaje = true}}
--                                En `valores` solo está lo que el jugador cambió: lo que falta vale el valor por defecto.
--   gruposOps[ruta][tipo] = {nombres}   el «override» de un grupo: si existe, el grupo usa SOLO esas operaciones; si no, hereda
--                                las del padre, y así hasta Grupo Base (ruta «»). La lista del Grupo Base siempre es propia.
--                                Arbol las lleva consigo al renombrar, mover, borrar y recuperar un grupo (como las reglas).
--   propios = {personajes = {["<nombre> - <reino>"] = true}, casas = {["<reino>|<faccion>"] = true}}   los personajes propios
--                                de la cuenta, tal como el addon los va conociendo (Operaciones.propios()), por nombre y reino
--                                (Task 25; lo que la 0.7.0 apuntó solo por nombre se pasa cuando ese personaje juega). Nunca
--                                nombres de otros jugadores. F6b: el reino es SNF.Comercio.reino() (en Forever GetRealmName()
--                                puede dar ""). Al entrar al mundo y en propios(), una vez por sesión y reino, lo guardado con
--                                el reino vacío («Nombre - », «|Horde») o con el mismo reino escrito de otra forma pasa al
--                                reino bueno, en propios y en las listas «Ignorar…» de las operaciones (también las de la
--                                papelera; nunca a un reino provisional, ronda 1). Son conjuntos (clave = true): pasar una
--                                clave no pierde nada.
--   _papelera                    además de lo que borra Arbol, guarda {operacion = true, tipo, nombre, datos}.
--
-- Operaciones.TIPOS[tipo] = {nombre, descripcion, una, campos = {{clave, tipo, defecto, nombre, descripcion, depende?, ...}}}
--     tipo del campo: formula (texto, vale lo que entienda comercio/formulas.lua), numero, sino, lista (un valor de
--     `opciones`), varios (varios valores de `opciones`) o texto. `depende` = clave del interruptor (sino) que lo apaga.
--     Otros datos opcionales de cada campo: opciones = {{clave, nombre}}, min, max (numero), unidad (numero, Task 35: lo que
--     el editor enseña detrás del número y acepta al escribirlo, «%» en la puja; lo guardado sigue siendo el número), vacio =
--     true (la fórmula puede quedar vacía), pestana y seccion (dónde lo dibuja la página).
-- Operaciones.ORDEN = {tipos en el orden de las capturas}.   Operaciones.COMUNES = ignorarReinos e ignorarPersonajes.
-- Operaciones.campo(tipo, clave) -> definición | nil
-- Operaciones.lista(tipo) -> {nombres ordenados}
-- Operaciones.existe(tipo, nombre) -> boolean
-- Operaciones.crear(tipo, nombre) -> nombre | nil            nil si el tipo o el nombre no valen o ya existe.
-- Operaciones.renombrar(tipo, nombre, nuevo) -> nuevo | nil   los grupos y los vínculos que la usaban siguen apuntando a ella.
-- Operaciones.duplicar(tipo, nombre[, nuevo]) -> nombre | nil sin `nuevo`, «<nombre> 2», «<nombre> 3»...
-- Operaciones.borrar(tipo, nombre) -> boolean                 a la papelera; los grupos que la nombraban la ignoran y la
--                                                             marcan (siguen guardados por si vuelve).
-- Operaciones.papelera() -> {{tipo, nombre}}   Operaciones.recuperar(tipo, nombre) -> boolean
-- Operaciones.restablecer(tipo, nombre) -> boolean            valores por defecto y sin vínculos (los «ignorar» se quedan: es
--                                                             lo que dice el tooltip de «⟳ Restablecer» del editor).
-- Operaciones.valor(tipo, nombre, campo) -> valor | nil       el valor por defecto si no se tocó; si el campo está vinculado, el
--                                                             de la otra operación. nil si no existe la operación o el campo.
-- Operaciones.poner(tipo, nombre, campo, valor) -> boolean    false si está vinculado, si el valor no sirve o no existe.
-- Operaciones.activo(tipo, nombre, campo) -> boolean          false si el interruptor del que depende está en No.
-- Operaciones.vincular(tipo, nombre, campo, otra|nil) -> boolean, motivo?   nil quita el vínculo. Las cadenas se siguen. Un
--                                                             vínculo que haría un ciclo (A toma el valor de B y B, siguiendo
--                                                             la cadena, de A) no se guarda: false, "ciclo". Un ciclo que ya
--                                                             venga en los datos guardados se corta al leer.
-- Operaciones.vinculo(tipo, nombre, campo) -> otra | nil
-- Operaciones.propios() -> {personajes = {...}, casas = {...}}   anota al personaje que juega ahora y da los propios.
-- valor / poner con los campos «ignorarReinos» (casas «<reino>|<faccion>») e «ignorarPersonajes»: solo valen los propios.
-- Operaciones.ignorada(tipo, nombre, personaje, casa) -> boolean   personaje «<nombre> - <reino>», casa «<reino>|<faccion>».
-- Operaciones.ignoradaAqui, Operaciones.aplicable y Operaciones.cobre: ver junto a su código (fase 3 de la paridad).
-- Operaciones.deGrupo(ruta, tipo) -> {nombres}, heredadaDe | nil, faltan  heredadaDe: la ruta del ascendiente de quien las hereda
--                                                             («» = Grupo Base); nil si el grupo tiene override. `faltan` lista
--                                                             las operaciones nombradas que ya no existen.
-- Operaciones.gruposDe(tipo, nombre) -> {rutas}               los grupos que tienen la operación en su lista propia (los que la
--                                                             heredan no cuentan): Grupo Base («») primero y luego en el orden
--                                                             del árbol. Los grupos que ya no están en el árbol no salen.
-- Operaciones.ponerDeGrupo(ruta, tipo, {nombres}) -> boolean  activa el override. En los tipos de una sola, como mucho un nombre.
-- Operaciones.quitarOverride(ruta, tipo) -> boolean           el grupo vuelve a heredar (no vale para Grupo Base).
-- Operaciones.huerfanos() -> {rutas}                          grupos con operaciones guardadas que ya no existen en el árbol.
-- Operaciones.usos(tipo, nombre) -> grupos, objetos, conBase  cuenta como TSM: grupos que la usan (con la herencia, Grupo Base
--                                                             incluido) y los objetos de esos grupos. conBase = true es el
--                                                             asterisco de TSM («358*»): la operación está en el Grupo Base,
--                                                             que abarca todo lo que no tiene grupo y no se cuenta en `objetos`.
-- Operaciones.usosDeTipo(tipo) -> {[nombre] = {grupos, objetos, conBase}}   lo mismo para todas las operaciones del tipo, de una pasada.
local SNF = SnetForever -- la tabla del núcleo (nucleo/espacio.lua); este addon no tiene la suya
local Operaciones = {}
SNF.Operaciones = Operaciones

local ROTO = "_roto"
local SEP = "`"
local MAX_NOMBRE = 60

---------------------------------------------------------------------------------------------------
-- Los 7 tipos. Los valores por defecto son los de las capturas de TSM (INVENTARIO 2.5, op-01 a op-15); los campos de
-- Publicación que las capturas no llegan a enseñar se han sacado de cómo trata TSM la operación de subasta. Los textos
-- de fórmula pasan por Formulas.traducir (dbmarket -> snfmercado, dbregionmarketavg -> snfregional(), dbhistorical ->
-- snfhistorico).
---------------------------------------------------------------------------------------------------

local function campo(clave, tipo, defecto, nombre, descripcion, extra)
  local c = {clave = clave, tipo = tipo, defecto = defecto, nombre = nombre, descripcion = descripcion}
  if extra then
    for k, v in pairs(extra) do
      c[k] = v
    end
  end
  return c
end

local function opcion(clave, nombre)
  return {clave = clave, nombre = nombre}
end

local DURACION_IGNORAR = {
  opcion("0", "Ninguno"), opcion("1", "Corta (menos de 30 minutos)"), opcion("2", "Media (menos de 2 horas)"),
  opcion("3", "Larga (menos de 12 horas)"),
}
-- La duración de lo que se publica. La clave es el nombre antiguo y no se cambia para no tocar lo guardado (ni lo importado
-- de TSM): «12» es el 1 de la API de la subasta (2 horas en Forever), «24» el 2 (8 horas) y «48» el 3 (24 horas). Por
-- defecto «24», 8 horas, como el duration = 2 de TSM. Los textos del editor son PRINCIPAL_EDITOR_O_DURACION_12/24/48.
local DURACIONES = {opcion("12", "2 horas"), opcion("24", "8 horas"), opcion("48", "24 horas")}
local BAJO_MINIMO = {
  opcion("noPublicar", "No publicar"), opcion("minimo", "Publicar al precio mínimo"), opcion("maximo", "Publicar al precio máximo"),
  opcion("normal", "Publicar al precio normal"), opcion("ignorar", "Ignorar subastas por debajo del mínimo"),
}
local SOBRE_MAXIMO = {
  opcion("noPublicar", "No publicar"), opcion("minimo", "Publicar al precio mínimo"), opcion("maximo", "Publicar al precio máximo"),
  opcion("normal", "Publicar al precio normal"),
}
local FUENTES_CORREO = {opcion("banco", "Banco"), opcion("hermandad", "Hermandad")}
local FUENTES_COMPRAS = {
  opcion("alters", "Alters"), opcion("subastas", "Subastas"), opcion("banco", "Banco"), opcion("hermandad", "Hermandad"),
}
local FUENTES_VENDEDOR = {
  opcion("alters", "Alters"), opcion("subastas", "Subastas"), opcion("banco", "Banco"), opcion("hermandad", "Hermandad"),
  opcion("subastasAlters", "Subastas de los alters"), opcion("correo", "Correo"),
}

-- El precio de venta que TSM propone para Sniper (lo que se busca por debajo de cuánto), con nuestras fuentes: TSM usa
-- DBRegionMarketAvg, que es snfregional() (el precio regional de la app).
local SNIPER_PRECIO = "max(vendorsell, ifgt(snfregional(), 250000g, 0.8, ifgt(snfregional(), 100000g, 0.7, "
  .. "ifgt(snfregional(), 50000g, 0.6, ifgt(snfregional(), 25000g, 0.5, ifgt(snfregional(), 10000g, 0.4, "
  .. "ifgt(snfregional(), 5000g, 0.3, ifgt(snfregional(), 2000g, 0.2, ifgt(snfregional(), 1000g, 0.1, 0.05)))))))) * snfregional())"

local TIPOS = {
  subasta = {
    nombre = "Subasta",
    descripcion = "Las operaciones de subasta controlan el publicar y el cancelar en la casa de subastas.",
    una = false,
    campos = {
      -- Pestaña «Detalles» (op-01).
      campo("ignorarDuracion", "lista", "0", "Ignorar subastas por duración", "No se tienen en cuenta las subastas de otros con esa duración o menos.",
        {opciones = DURACION_IGNORAR, pestana = "detalles", seccion = "Opciones generales"}),
      -- Pestaña «Publicación» (op-02; los que no salen en la captura).
      campo("duracion", "lista", "24", "Duración de la subasta", "Cuánto tiempo están a la venta las subastas que publicas; si no se venden en ese tiempo, vuelven por correo.",
        {opciones = DURACIONES, pestana = "publicacion", seccion = "Opciones de publicación"}),
      campo("tope", "formula", "40000", "Máximo a publicar", "Cuántas unidades como mucho tendrás publicadas de cada objeto.",
        {pestana = "publicacion", seccion = "Opciones de publicación"}),
      campo("reservaEnBolsas", "formula", "0", "Cantidad que se queda en las bolsas", "Unidades que no se publican y se guardan en las bolsas.",
        {pestana = "publicacion", seccion = "Opciones de publicación"}),
      campo("caducadasMaximas", "formula", "0", "No publicar tras tantas caducadas", "Deja de publicar un objeto que ya ha caducado ese número de veces (0 = sin límite).",
        {pestana = "publicacion", seccion = "Opciones de publicación"}),
      campo("pujaPorcentaje", "numero", 100, "Puja como porcentaje de la compra directa", "Al publicar, la puja se calcula como este porcentaje del precio de compra directa.",
        {min = 0, max = 100, unidad = "%", pestana = "publicacion", seccion = "Precio de publicación"}),
      campo("rebaja", "formula", "0c", "Rebaja", "Cuánto por debajo de la subasta más barata de otro se publica.",
        {pestana = "publicacion", seccion = "Precio de publicación"}),
      campo("precioMinimo", "formula", "max(1.5 * vendorsell, 0.25 * first(snfmercado, snfregional(), snfhistorico))", "Precio mínimo",
        "Por debajo de este precio no se publica (o se hace lo que diga «Si queda por debajo del mínimo»).",
        {pestana = "publicacion", seccion = "Precio de publicación"}),
      campo("bajoMinimo", "lista", "noPublicar", "Si queda por debajo del mínimo", "Qué hacer cuando la subasta más barata está por debajo del precio mínimo.",
        {opciones = BAJO_MINIMO, pestana = "publicacion", seccion = "Precio de publicación"}),
      campo("precioMaximo", "formula", "50000g", "Precio máximo", "Por encima de este precio no se publica (o se hace lo que diga «Si queda por encima del máximo»).",
        {pestana = "publicacion", seccion = "Precio de publicación"}),
      campo("sobreMaximo", "lista", "maximo", "Si queda por encima del máximo", "Qué hacer cuando la subasta más barata está por encima del precio máximo.",
        {opciones = SOBRE_MAXIMO, pestana = "publicacion", seccion = "Precio de publicación"}),
      campo("precioNormal", "formula", "max(2 * snfmercado, 12 * vendorsell)", "Precio normal", "El precio al que se publica cuando no hay otras subastas.",
        {pestana = "publicacion", seccion = "Precio de publicación"}),
      -- Pestaña «Cancelación» (op-03).
      campo("cancelarRebajadas", "sino", true, "Cancelar las subastas rebajadas", "Cancela lo tuyo que otro ha publicado más barato.",
        {pestana = "cancelacion", seccion = "Opciones de cancelación"}),
      campo("cancelarParaSubir", "sino", true, "Cancelar para publicar más caro", "Cancela lo tuyo cuando se puede volver a publicar a mejor precio.",
        {pestana = "cancelacion", seccion = "Opciones de cancelación"}),
      campo("umbralReponer", "formula", "1g", "Diferencia mínima para volver a publicar", "Cuánto más caro tiene que salir para cancelar y volver a publicar.",
        {pestana = "cancelacion", seccion = "Opciones de cancelación"}),
    },
  },
  artesania = {
    nombre = "Artesanía",
    descripcion = "Las operaciones de artesanía controlan cuánto se fabrica de cada objeto.",
    una = true,
    campos = {
      campo("reponerMinimo", "formula", "10", "Cantidad mínima a reponer", "Cuántas unidades tienes que tener como poco para no fabricar más.",
        {seccion = "Opciones de reposición"}),
      campo("reponerMaximo", "formula", "20", "Cantidad máxima a reponer", "Al fabricar para reponer, se llega como mucho a esta cantidad de unidades de cada objeto.", {seccion = "Opciones de reposición"}),
      campo("beneficioMinimoActivo", "sino", true, "Pedir un beneficio mínimo", "Solo se fabrica si se gana al menos el beneficio mínimo.",
        {seccion = "Opciones de reposición"}),
      campo("beneficioMinimo", "formula", "100g", "Beneficio mínimo", "Lo que tiene que ganarse por cada objeto fabricado, después de pagar los materiales.",
        {depende = "beneficioMinimoActivo", seccion = "Opciones de reposición"}),
      campo("cambiarValor", "sino", false, "Cambiar el valor de lo fabricado", "Usa tu fórmula en vez de la general para valorar lo que se fabrica.",
        {seccion = "Valor de lo fabricado"}),
      campo("valorFabricado", "formula", "", "Valor de lo fabricado", "Cómo se valora lo que se fabrica al calcular el beneficio.",
        {depende = "cambiarValor", vacio = true, seccion = "Valor de lo fabricado"}),
    },
  },
  correo = {
    nombre = "Correo",
    descripcion = "Las operaciones de correo controlan qué se envía a otros personajes por correo.",
    una = false,
    campos = {
      campo("destinatario", "texto", "", "Personaje de destino", "El personaje tuyo que recibe por correo los objetos de los grupos que usan esta operación.", {seccion = "Opciones generales"}),
      campo("conservar", "formula", "0", "Cantidad que te quedas", "Cuántas unidades de cada objeto te quedas en las bolsas; solo se envía lo que pase de esta cantidad.", {seccion = "Opciones generales"}),
      campo("limitarCantidad", "sino", false, "Poner una cantidad máxima", "Envía como mucho la cantidad máxima cada vez.", {seccion = "Opciones generales"}),
      campo("cantidadMaxima", "formula", "10", "Cantidad máxima", "Cuántas unidades de cada objeto se envían como mucho cada vez.",
        {depende = "limitarCantidad", seccion = "Opciones generales"}),
      campo("reponerDestino", "sino", false, "Reponer hasta la cantidad máxima", "La cantidad máxima es lo que debe tener el destinatario, no lo que se envía.",
        {depende = "limitarCantidad", seccion = "Opciones generales"}),
      campo("fuentesReponer", "varios", {}, "Fuentes para reponer", "De dónde se cuentan las unidades que ya tiene el destinatario.",
        {depende = "reponerDestino", opciones = FUENTES_CORREO, seccion = "Opciones generales"}),
    },
  },
  compras = {
    nombre = "Compras",
    descripcion = "Las operaciones de compras controlan qué se enseña al escanear para comprar.",
    una = true,
    campos = {
      campo("precioMaximo", "formula", "snfmercado", "Precio máximo", "Lo más que pagarías por cada objeto: al buscar, las subastas hasta este precio salen como buenas para comprar.", {seccion = "Opciones generales"}),
      campo("mostrarSobreMaximo", "sino", true, "Enseñar también lo que pasa del máximo", "Las subastas por encima del precio máximo salen en la lista.",
        {seccion = "Opciones generales"}),
      campo("reponerCantidad", "formula", "0", "Cantidad máxima a reponer", "Hasta cuántas unidades de cada objeto quieres tener; al llegar, deja de salir para comprar (0 = sin límite).", {seccion = "Opciones generales"}),
      campo("fuentesReponer", "varios", {}, "Fuentes para reponer", "De dónde se cuentan las unidades que ya tienes.",
        {opciones = FUENTES_COMPRAS, seccion = "Opciones generales"}),
    },
  },
  sniper = {
    nombre = "Sniper",
    descripcion = "Las operaciones de sniper controlan qué se busca al vigilar la casa de subastas.",
    una = true,
    campos = {
      campo("precioMaximo", "formula", SNIPER_PRECIO, "Precio máximo", "Lo más caro que se enseña de cada objeto al vigilar.", {seccion = "Opciones generales"}),
    },
  },
  vendedor = {
    nombre = "Vendedor",
    descripcion = "Las operaciones de vendedor controlan qué se vende y qué se compra a un vendedor.",
    una = false,
    campos = {
      campo("comprarActivo", "sino", true, "Activar la compra", "Con el vendedor abierto y cuando tú lo pides, se le compra lo que falta de los objetos de estos grupos hasta llegar a la cantidad a reponer.", {seccion = "Compra"}),
      campo("reponerCantidad", "formula", "0", "Cantidad a reponer", "Hasta cuántas unidades de cada objeto se compran al vendedor, contando las que ya tienes.", {seccion = "Compra"}),
      campo("fuentesReponer", "varios", {}, "Fuentes para reponer", "De dónde se cuentan las unidades que ya tienes.",
        {opciones = FUENTES_VENDEDOR, seccion = "Compra"}),
      campo("venderActivo", "sino", true, "Activar la venta", "Con el vendedor abierto y cuando tú lo pides, se le vende lo que sobra de los objetos de estos grupos.", {seccion = "Venta"}),
      campo("conservar", "formula", "0", "Cantidad que te quedas", "Cuántas unidades de cada objeto te quedas; solo se vende al vendedor lo que pase de esta cantidad.", {seccion = "Venta"}),
      campo("caducadasMinimas", "formula", "20", "Mínimo de caducadas", "Se vende solo lo que ya ha caducado en la subasta ese número de veces.",
        {seccion = "Venta"}),
      campo("valorMercado", "formula", "snfmercado", "Valor de mercado", "El valor de mercado que se compara con el del vendedor.", {seccion = "Venta"}),
      campo("valorMercadoMaximo", "formula", "0c", "Valor de mercado máximo", "Si el valor de mercado del objeto es esta cantidad o más, no se vende al vendedor: vale más en la subasta. Con 0c no se mira.", {seccion = "Venta"}),
      campo("valorDestruccion", "formula", "snfmercado", "Valor de destrucción", "El valor de lo que saldría de destruir el objeto.", {seccion = "Venta"}),
      campo("valorDestruccionMaximo", "formula", "0c", "Valor de destrucción máximo", "Si lo que saldría de destruir el objeto vale esta cantidad o más, no se vende al vendedor. Con 0c no se mira.", {seccion = "Venta"}),
      campo("venderLigados", "sino", false, "Vender objetos ligados", "También vende lo que está ligado a tu personaje.", {seccion = "Venta"}),
    },
  },
  almacen = {
    nombre = "Almacén",
    descripcion = "Las operaciones de almacén controlan qué entra y qué sale del banco.",
    una = false,
    campos = {
      campo("mover", "formula", "0", "Cantidad a mover", "Cuántas unidades de cada objeto se mueven cada vez entre las bolsas y el banco, al guardarlas o al sacarlas (0 = todas las que se puedan).", {seccion = "Mover entre el banco y las bolsas"}),
      campo("moverPila", "formula", "0", "Múltiplo del tamaño de pila", "Al sacar del banco, solo se mueve en múltiplos de ese tamaño de pila (0 = sin múltiplo).", {seccion = "Mover entre el banco y las bolsas"}),
      campo("conservarEnBolsas", "formula", "0", "Cantidad que se queda en las bolsas", "Al guardar en el banco, cuántas unidades de cada objeto se quedan en las bolsas sin guardar.", {seccion = "Mover entre el banco y las bolsas"}),
      campo("conservarEnBanco", "formula", "0", "Cantidad que se queda en el banco", "Al sacar del banco, cuántas unidades de cada objeto se quedan en el banco sin sacar.", {seccion = "Mover entre el banco y las bolsas"}),
      campo("reponerCantidad", "formula", "0", "Cantidad a reponer", "Hasta cuántas unidades de cada objeto se reponen en las bolsas desde el banco, contando las que ya llevas (0 = no se repone).", {seccion = "Reponer desde el banco"}),
      campo("reponerPila", "formula", "0", "Múltiplo del tamaño de pila", "Al reponer, solo se mueve en múltiplos de ese tamaño de pila (0 = sin múltiplo).", {seccion = "Reponer desde el banco"}),
      campo("reponerConservarEnBanco", "formula", "0", "Cantidad que se queda en el banco", "Al reponer, cuántas unidades de cada objeto se quedan en el banco sin sacar.",
        {seccion = "Reponer desde el banco"}),
    },
  },
}

local ORDEN = {"subasta", "artesania", "correo", "compras", "sniper", "vendedor", "almacen"}

-- Lo de «Opciones de manejo» (común a todos los tipos): ignorar la operación en ciertas casas o personajes.
local COMUNES = {
  campo("ignorarReinos", "varios", {}, "Ignorar en estas casas", "No se usa la operación en estas casas de subastas (reino y facción).", {comun = true}),
  campo("ignorarPersonajes", "varios", {}, "Ignorar en estos personajes", "No se usa la operación con estos personajes (solo los tuyos).", {comun = true}),
}

Operaciones.TIPOS = TIPOS
Operaciones.ORDEN = ORDEN
Operaciones.COMUNES = COMUNES

-- Índice de los campos por clave.
local INDICE = {}
for tipo, def in pairs(TIPOS) do
  INDICE[tipo] = {}
  for _, c in ipairs(def.campos) do
    INDICE[tipo][c.clave] = c
  end
  for _, c in ipairs(COMUNES) do
    INDICE[tipo][c.clave] = c
  end
end

function Operaciones.campo(tipo, clave)
  local idx = type(tipo) == "string" and INDICE[tipo]
  return idx and type(clave) == "string" and idx[clave] or nil
end

---------------------------------------------------------------------------------------------------
-- Datos.
---------------------------------------------------------------------------------------------------

-- Una tabla en padre[clave]; lo que hubiera ahí en su lugar (datos estropeados) se guarda en _roto. Sin `crear`, no la crea.
local function subtabla(padre, clave, crear)
  local v = padre[clave]
  if type(v) == "table" then
    return v
  end
  if v == nil then
    if not crear then
      return nil
    end
    padre[clave] = {}
  else
    padre[clave] = {[ROTO] = v}
  end
  return padre[clave]
end

local function copiar(v)
  if type(v) ~= "table" then
    return v
  end
  local c = {}
  for k, x in pairs(v) do
    c[k] = copiar(x)
  end
  return c
end

-- comercio.v2 listo para usar, o nil si aún no hay cuenta.
local function datos()
  if SNF.Arbol then
    pcall(SNF.Arbol.preparar) -- also prepares the saved variables
  elseif SNF.Guardado then
    pcall(SNF.Guardado.preparar)
  end
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  if type(c) ~= "table" then
    return nil
  end
  local v2 = subtabla(c, "v2", true)
  subtabla(v2, "operaciones", true)
  return v2
end

local function nombreValido(nombre)
  if type(nombre) ~= "string" then
    return nil
  end
  nombre = string.gsub(nombre, "^%s+", "")
  nombre = string.gsub(nombre, "%s+$", "")
  if nombre == "" or nombre == ROTO or string.len(nombre) > MAX_NOMBRE then
    return nil
  end
  return nombre
end

-- Las operaciones de un tipo (tabla nombre -> datos). Sin `crear`, nil si no hay ninguna.
local function operacionesDe(v2, tipo, crear)
  if type(tipo) ~= "string" or not TIPOS[tipo] then
    return nil
  end
  return subtabla(v2.operaciones, tipo, crear)
end

-- Los datos de una operación, o nil si no existe (o no se puede leer).
local function operacion(v2, tipo, nombre)
  if type(nombre) ~= "string" or nombre == ROTO then
    return nil
  end
  local ops = operacionesDe(v2, tipo, false)
  local op = ops and ops[nombre]
  if type(op) == "table" then
    return op, ops
  end
  return nil
end

local function ordenar(lista)
  table.sort(lista, function(a, b)
    local x, y = string.lower(a), string.lower(b)
    if x ~= y then
      return x < y
    end
    return a < b
  end)
  return lista
end

---------------------------------------------------------------------------------------------------
-- Edición.
---------------------------------------------------------------------------------------------------

function Operaciones.lista(tipo)
  local salida = {}
  local v2 = datos()
  local ops = v2 and operacionesDe(v2, tipo, false)
  if ops then
    for nombre, op in pairs(ops) do
      if type(nombre) == "string" and nombre ~= ROTO and type(op) == "table" then
        salida[#salida + 1] = nombre
      end
    end
    ordenar(salida)
  end
  return salida
end

function Operaciones.existe(tipo, nombre)
  local v2 = datos()
  return v2 ~= nil and operacion(v2, tipo, nombre) ~= nil
end

function Operaciones.crear(tipo, nombre)
  local v2 = datos()
  nombre = nombreValido(nombre)
  if not v2 or not nombre or not TIPOS[tipo] then
    return nil
  end
  local ops = operacionesDe(v2, tipo, true)
  if ops[nombre] ~= nil then
    return nil
  end
  ops[nombre] = {}
  return nombre
end

-- Cambia el nombre en la lista de un tipo de una tabla de grupo ({tipo = {nombres}}), sin repetirlo.
local function renombrarEnLista(g, tipo, viejo, nuevo)
  local lista = type(g) == "table" and g[tipo]
  if type(lista) ~= "table" then
    return
  end
  local vista, salida = {}, {}
  for _, n in ipairs(lista) do
    if n == viejo then
      n = nuevo
    end
    if not vista[n] then
      vista[n] = true
      salida[#salida + 1] = n
    end
  end
  g[tipo] = salida
end

-- Cambia el nombre en los overrides vivos, en los de los grupos que están en la papelera de Arbol y en los vínculos de las
-- operaciones borradas (si no, al recuperarlos apuntarían a un nombre que ya no existe).
local function renombrarEnGrupos(v2, tipo, viejo, nuevo)
  if type(v2.gruposOps) == "table" then
    for _, g in pairs(v2.gruposOps) do
      renombrarEnLista(g, tipo, viejo, nuevo)
    end
  end
  if type(v2._papelera) == "table" then
    for _, e in ipairs(v2._papelera) do
      if type(e) == "table" then
        if type(e.ops) == "table" then
          for _, g in pairs(e.ops) do
            renombrarEnLista(g, tipo, viejo, nuevo)
          end
        end
        local vinculos = e.operacion == true and e.tipo == tipo and type(e.datos) == "table" and e.datos.vinculos
        if type(vinculos) == "table" then
          for c, destino in pairs(vinculos) do
            if destino == viejo then
              vinculos[c] = nuevo
            end
          end
        end
      end
    end
  end
end

function Operaciones.renombrar(tipo, nombre, nuevo)
  local v2 = datos()
  nuevo = nombreValido(nuevo)
  if not v2 or not nuevo then
    return nil
  end
  local op, ops = operacion(v2, tipo, nombre)
  if not op then
    return nil
  end
  if nuevo == nombre then
    return nombre
  end
  if ops[nuevo] ~= nil then
    return nil
  end
  ops[nuevo] = op
  ops[nombre] = nil
  for _, otra in pairs(ops) do
    local vinculos = type(otra) == "table" and type(otra.vinculos) == "table" and otra.vinculos
    if vinculos then
      for c, destino in pairs(vinculos) do
        if destino == nombre then
          vinculos[c] = nuevo
        end
      end
    end
  end
  renombrarEnGrupos(v2, tipo, nombre, nuevo)
  return nuevo
end

function Operaciones.duplicar(tipo, nombre, nuevo)
  local v2 = datos()
  if not v2 then
    return nil
  end
  local op, ops = operacion(v2, tipo, nombre)
  if not op then
    return nil
  end
  if nuevo ~= nil then
    nuevo = nombreValido(nuevo)
    if not nuevo or ops[nuevo] ~= nil then
      return nil
    end
  else
    local n = 1
    repeat
      n = n + 1
      nuevo = nombre .. " " .. n
    until ops[nuevo] == nil
    if string.len(nuevo) > MAX_NOMBRE then
      return nil
    end
  end
  ops[nuevo] = copiar(op)
  return nuevo
end

function Operaciones.borrar(tipo, nombre)
  local v2 = datos()
  if not v2 then
    return false
  end
  local op, ops = operacion(v2, tipo, nombre)
  if not op then
    return false
  end
  subtabla(v2, "_papelera", true)
  table.insert(v2._papelera, {operacion = true, tipo = tipo, nombre = nombre, datos = op})
  ops[nombre] = nil
  return true
end

local function entradaOperacion(e)
  return type(e) == "table" and e.operacion == true and TIPOS[e.tipo] ~= nil and nombreValido(e.nombre) == e.nombre
    and type(e.datos) == "table"
end

function Operaciones.papelera()
  local salida = {}
  local v2 = datos()
  if v2 and type(v2._papelera) == "table" then
    for _, e in ipairs(v2._papelera) do
      if entradaOperacion(e) then
        salida[#salida + 1] = {tipo = e.tipo, nombre = e.nombre}
      end
    end
  end
  return salida
end

-- Recupera la última operación borrada con ese nombre (si el nombre sigue libre).
function Operaciones.recuperar(tipo, nombre)
  local v2 = datos()
  if not v2 or type(v2._papelera) ~= "table" or not TIPOS[tipo] then
    return false
  end
  for i = #v2._papelera, 1, -1 do
    local e = v2._papelera[i]
    if entradaOperacion(e) and e.tipo == tipo and e.nombre == nombre then
      local ops = operacionesDe(v2, tipo, true)
      if ops[nombre] ~= nil then
        return false
      end
      ops[nombre] = e.datos
      table.remove(v2._papelera, i)
      return true
    end
  end
  return false
end

function Operaciones.restablecer(tipo, nombre)
  local v2 = datos()
  local op = v2 and operacion(v2, tipo, nombre)
  if not op then
    return false
  end
  op.valores = nil
  op.vinculos = nil
  return true
end

---------------------------------------------------------------------------------------------------
-- Propios (personajes y casas de la cuenta).
---------------------------------------------------------------------------------------------------

local function claveCasa(reino, faccion)
  return tostring(reino) .. "|" .. tostring(faccion)
end

-- Task 25: los personajes van por nombre y reino («Alba - Mirador»): en dos reinos puede haber dos personajes con el mismo
-- nombre. Lo que la 0.7.0 apuntó solo por nombre («Alba») pasa a «Alba - Mirador» la primera vez que ese personaje juega,
-- en la lista de propios y en las listas «Ignorar en estos personajes» de las operaciones (también las de la papelera).
local function migrarPersonaje(v2, personajes, nombre, clave)
  if personajes[nombre] ~= true then
    return
  end
  personajes[nombre] = nil
  local function cambiar(op)
    local lista = type(op) == "table" and op.ignorarPersonajes
    if type(lista) == "table" and lista[nombre] == true then
      lista[nombre] = nil
      lista[clave] = true
    end
  end
  for tipo in pairs(TIPOS) do
    local ops = v2.operaciones[tipo]
    if type(ops) == "table" then
      for _, op in pairs(ops) do
        cambiar(op)
      end
    end
  end
  if type(v2._papelera) == "table" then
    for _, e in ipairs(v2._papelera) do
      if type(e) == "table" and e.operacion == true then
        cambiar(e.datos)
      end
    end
  end
end

-- F6b: la clave buena de una clave con el reino vacío o escrito de otra forma («Nombre - » -> «Nombre - <reino>»,
-- «|Horde» -> «<reino>|Horde»), o nil si ya está bien (o no es una clave así).
local function conReinoBueno(clave, reino, esCasa)
  if type(clave) ~= "string" or clave == ROTO then
    return nil
  end
  local nombre, r
  if esCasa then
    r, nombre = string.match(clave, "^(.*)|([^|]*)$")
  else
    nombre, r = string.match(clave, "^(.-) %- (.*)$")
  end
  if not nombre or nombre == "" or r == reino or not (r == "" or SNF.Comercio.mismoReino(r, reino)) then
    return nil
  end
  return esCasa and (reino .. "|" .. nombre) or (nombre .. " - " .. reino)
end

local function pasarConjunto(t, reino, esCasa)
  if type(t) ~= "table" then
    return
  end
  local mover = {}
  for clave, v in pairs(t) do
    local buena = v == true and conReinoBueno(clave, reino, esCasa)
    if buena then
      mover[#mover + 1] = {clave, buena}
    end
  end
  for _, m in ipairs(mover) do
    t[m[1]] = nil
    t[m[2]] = true
  end
end

local reinoPasado = nil -- el reino al que ya se pasó lo guardado en esta sesión
local function pasarReino(v2, reino)
  if reinoPasado == reino or type(v2) ~= "table" then
    return
  end
  reinoPasado = reino
  local propios = type(v2.propios) == "table" and v2.propios
  if propios then
    pasarConjunto(propios.personajes, reino, false)
    pasarConjunto(propios.casas, reino, true)
  end
  local function cambiar(op)
    if type(op) == "table" then
      pasarConjunto(op.ignorarPersonajes, reino, false)
      pasarConjunto(op.ignorarReinos, reino, true)
    end
  end
  if type(v2.operaciones) == "table" then
    for tipo in pairs(TIPOS) do
      local ops = v2.operaciones[tipo]
      if type(ops) == "table" then
        for _, op in pairs(ops) do
          cambiar(op)
        end
      end
    end
  end
  if type(v2._papelera) == "table" then
    for _, e in ipairs(v2._papelera) do
      if type(e) == "table" and e.operacion == true then
        cambiar(e.datos)
      end
    end
  end
end

SNF.Eventos.escuchar("PLAYER_ENTERING_WORLD", function()
  local cuenta = rawget(_G, "SnetForeverCuenta")
  local c = type(cuenta) == "table" and cuenta.comercio
  local reino, provisional = SNF.Comercio.reino()
  if type(c) == "table" and reino and not provisional then
    pasarReino(c.v2, reino)
  end
end)

-- Anota al personaje que juega ahora (y su casa) y da lo que la cuenta tiene anotado.
function Operaciones.propios()
  local salida = {personajes = {}, casas = {}}
  local v2 = datos()
  if not v2 then
    return salida
  end
  local propios = subtabla(v2, "propios", true)
  local personajes, casas = subtabla(propios, "personajes", true), subtabla(propios, "casas", true)
  local reinoPj, provisional = SNF.Comercio.reino() -- F6b: nunca "" (en Forever GetRealmName() puede darlo)
  if reinoPj and not provisional then
    pasarReino(v2, reinoPj) -- ronda 1: nunca a un reino provisional (solo el normalizado)
  end
  local ok, nombre = pcall(function()
    if SNF.Personaje then
      return SNF.Personaje.clave() -- F3: sin la clave entera, nada (nunca el primer nombre solo)
    end
    return UnitName("player")
  end)
  -- Sin el reino no se sabe qué personaje es: no se apunta.
  if ok and type(nombre) == "string" and nombre ~= "" and nombre ~= ROTO and type(reinoPj) == "string" and reinoPj ~= "" then
    local clave = nombre .. " - " .. reinoPj
    migrarPersonaje(v2, personajes, nombre, clave)
    personajes[clave] = true
  end
  local okC, reino, faccion = pcall(function()
    return reinoPj, (UnitFactionGroup("player"))
  end)
  if okC and type(reino) == "string" and reino ~= "" and type(faccion) == "string" and faccion ~= "" then
    casas[claveCasa(reino, faccion)] = true
  end
  for k, v in pairs(personajes) do
    if v == true and k ~= ROTO then
      salida.personajes[#salida.personajes + 1] = k
    end
  end
  for k, v in pairs(casas) do
    if v == true and k ~= ROTO then
      salida.casas[#salida.casas + 1] = k
    end
  end
  ordenar(salida.personajes)
  ordenar(salida.casas)
  return salida
end

local function conjunto(lista)
  local c = {}
  for _, v in ipairs(lista) do
    c[v] = true
  end
  return c
end

local COMUN_GUARDADO = {ignorarReinos = "casas", ignorarPersonajes = "personajes"}

local function valorComun(op, clave)
  local salida = {}
  local guardado = type(op[clave]) == "table" and op[clave] or {}
  for k, v in pairs(guardado) do
    if v == true and k ~= ROTO then
      salida[#salida + 1] = k
    end
  end
  return ordenar(salida)
end

---------------------------------------------------------------------------------------------------
-- Valores y vínculos.
---------------------------------------------------------------------------------------------------

-- La operación de la que sale el valor de un campo: ella misma o, siguiendo los vínculos, la última de la cadena. Un ciclo se
-- corta donde se vuelve a una ya vista.
local function origen(ops, nombre, clave)
  local visto = {}
  local actual = nombre
  while true do
    visto[actual] = true
    local op = ops[actual]
    local vinculos = type(op) == "table" and type(op.vinculos) == "table" and op.vinculos
    local siguiente = vinculos and vinculos[clave]
    if type(siguiente) ~= "string" or siguiente == ROTO or visto[siguiente] or type(ops[siguiente]) ~= "table" then
      return actual
    end
    actual = siguiente
  end
end

function Operaciones.vinculo(tipo, nombre, clave)
  local v2 = datos()
  if not v2 or not Operaciones.campo(tipo, clave) or INDICE[tipo][clave].comun then
    return nil
  end
  local op, ops = operacion(v2, tipo, nombre)
  if not op then
    return nil
  end
  local fuente = origen(ops, nombre, clave)
  if fuente == nombre then
    return nil
  end
  -- el primer salto
  local vinculos = type(op.vinculos) == "table" and op.vinculos or {}
  return type(vinculos[clave]) == "string" and type(ops[vinculos[clave]]) == "table" and vinculos[clave] or nil
end

function Operaciones.valor(tipo, nombre, clave)
  local def = Operaciones.campo(tipo, clave)
  local v2 = datos()
  if not def or not v2 then
    return nil
  end
  local op, ops = operacion(v2, tipo, nombre)
  if not op then
    return nil
  end
  if def.comun then
    return valorComun(op, clave)
  end
  local fuente = ops[origen(ops, nombre, clave)]
  local valores = type(fuente) == "table" and type(fuente.valores) == "table" and fuente.valores
  local v = nil
  if valores then
    v = valores[clave]
  end
  if v == nil then
    return copiar(def.defecto)
  end
  return copiar(v)
end

function Operaciones.activo(tipo, nombre, clave)
  local def = Operaciones.campo(tipo, clave)
  if not def or not Operaciones.existe(tipo, nombre) then
    return false
  end
  if def.depende then
    return Operaciones.valor(tipo, nombre, def.depende) == true
  end
  return true
end

local function formulaValida(texto)
  local F = SNF.Formulas
  if not F or not F.compilar then
    return true
  end
  local ok, f = pcall(F.compilar, texto)
  return ok and f ~= nil and f ~= false
end

-- El valor listo para guardar, o nil si no vale (false es un valor).
local function validar(def, valor)
  local t = def.tipo
  if t == "formula" then
    if type(valor) ~= "string" or string.len(valor) > 2000 then
      return nil
    end
    local texto = string.gsub(string.gsub(valor, "^%s+", ""), "%s+$", "")
    if texto == "" then
      return def.vacio and "" or nil
    end
    return formulaValida(texto) and texto or nil
  elseif t == "numero" then
    if type(valor) ~= "number" or valor ~= valor or (def.min and valor < def.min) or (def.max and valor > def.max) then
      return nil
    end
    return valor
  elseif t == "sino" then
    if type(valor) ~= "boolean" then
      return nil
    end
    return valor
  elseif t == "lista" then
    if type(valor) == "number" then
      valor = tostring(valor)
    end
    for _, o in ipairs(def.opciones or {}) do
      if o.clave == valor then
        return valor
      end
    end
    return nil
  elseif t == "varios" then
    if type(valor) ~= "table" then
      return nil
    end
    local validas = {}
    for _, o in ipairs(def.opciones or {}) do
      validas[o.clave] = true
    end
    local vistas, salida = {}, {}
    for _, v in ipairs(valor) do
      if type(v) ~= "string" or not validas[v] then
        return nil
      end
      if not vistas[v] then
        vistas[v] = true
        salida[#salida + 1] = v
      end
    end
    return ordenar(salida)
  elseif t == "texto" then
    if type(valor) ~= "string" then
      return nil
    end
    local texto = string.gsub(string.gsub(valor, "^%s+", ""), "%s+$", "")
    if string.len(texto) > MAX_NOMBRE or texto == ROTO then
      return nil
    end
    return texto
  end
  return nil
end

function Operaciones.poner(tipo, nombre, clave, valor)
  local def = Operaciones.campo(tipo, clave)
  local v2 = datos()
  if not def or not v2 then
    return false
  end
  local op, ops = operacion(v2, tipo, nombre)
  if not op then
    return false
  end
  if def.comun then
    -- Solo los propios de la cuenta: nunca se guardan nombres de otros jugadores.
    if type(valor) ~= "table" then
      return false
    end
    local propios = Operaciones.propios()
    local permitidos = conjunto(propios[COMUN_GUARDADO[clave]])
    local nuevo = {}
    for _, v in ipairs(valor) do
      if type(v) ~= "string" or not permitidos[v] then
        return false
      end
      nuevo[v] = true
    end
    op[clave] = nuevo
    return true
  end
  if origen(ops, nombre, clave) ~= nombre then
    return false -- vinculado: se edita en la otra operación
  end
  local bueno = validar(def, valor)
  if bueno == nil then
    return false
  end
  subtabla(op, "valores", true)[clave] = bueno
  return true
end

function Operaciones.vincular(tipo, nombre, clave, otra)
  local def = Operaciones.campo(tipo, clave)
  local v2 = datos()
  if not def or def.comun or not v2 then
    return false
  end
  local op, ops = operacion(v2, tipo, nombre)
  if not op then
    return false
  end
  if otra == nil then
    if type(op.vinculos) == "table" then
      op.vinculos[clave] = nil
    end
    return true
  end
  if otra == nombre or not operacion(v2, tipo, otra) then
    return false
  end
  -- Siguiendo la cadena desde la otra (sus vínculos de ese campo), ¿se vuelve a esta? Entonces sería un ciclo.
  local visto, actual = {}, otra
  while type(actual) == "string" and not visto[actual] do
    if actual == nombre then
      return false, "ciclo"
    end
    visto[actual] = true
    local o = ops[actual]
    local vinculos = type(o) == "table" and type(o.vinculos) == "table" and o.vinculos
    actual = vinculos and vinculos[clave] or nil
  end
  subtabla(op, "vinculos", true)[clave] = otra
  return true
end

function Operaciones.ignorada(tipo, nombre, personaje, casa)
  local v2 = datos()
  local op = v2 and operacion(v2, tipo, nombre)
  if not op then
    return false
  end
  local pjs = type(op.ignorarPersonajes) == "table" and op.ignorarPersonajes or {}
  local casas = type(op.ignorarReinos) == "table" and op.ignorarReinos or {}
  return (personaje ~= nil and pjs[personaje] == true) or (casa ~= nil and casas[casa] == true)
end

-- Fase 3 de la paridad con TSM: lo que comparten Compras por grupo, Vendedor y el Sniper por operaciones.
-- Operaciones.ignoradaAqui(tipo, nombre) -> boolean   ignorada para el personaje que juega o para su casa de ahora. El
--   personaje se mira en la forma que guardan el editor y la importación de TSM («<nombre> - <reino>») y en la corta
--   («<nombre>-<reino>») que ya miraban Compras por grupo y Vendedor. Sin reino seguro (provisional) solo vale la casa.
function Operaciones.ignoradaAqui(tipo, nombre)
  local reino = SNF.Precios.identidad().reino
  local faccion = SNF.Precios.faccionActual()
  local pj = SNF.Personaje.clave()
  local casa = reino and faccion and (reino .. "|" .. faccion) or nil
  if Operaciones.ignorada(tipo, nombre, reino and pj and (pj .. " - " .. reino) or nil, casa) then
    return true
  end
  return reino ~= nil and pj ~= nil and Operaciones.ignorada(tipo, nombre, pj .. "-" .. reino, nil)
end

-- Operaciones.aplicable(ruta, tipo) -> nombre | nil, motivo   la primera operación de `tipo` del grupo (con la herencia de
--   Operaciones.deGrupo) si no está ignorada aquí. motivo: «sin_operacion» o «ignorada». Como en TSM, una operación
--   ignorada no deja paso a otra.
function Operaciones.aplicable(ruta, tipo)
  local nombre = Operaciones.deGrupo(ruta, tipo)[1]
  if not nombre then
    return nil, "sin_operacion"
  end
  if Operaciones.ignoradaAqui(tipo, nombre) then
    return nil, "ignorada"
  end
  return nombre
end

-- Operaciones.cobre(tipo, nombre, campo, item) -> cobre entero | nil   la fórmula del campo para el objeto (con sus
--   vínculos). nil si la fórmula no vale, no da valor o da algo que no es una cantidad (secreto, negativo o infinito).
function Operaciones.cobre(tipo, nombre, campo, item)
  local formula = Operaciones.valor(tipo, nombre, campo)
  local valor = type(formula) == "string" and SNF.Formulas.valor(formula, item) or nil
  if not SNF.API.esSecreto(valor) and type(valor) == "number" and valor >= 0 and valor < math.huge then
    return SNF.Formulas.cobre(valor)
  end
  return nil
end

-- Un precio de referencia en cobre entero, o nil si no hay (o es 0: un precio de mercado de 0 no es un tope).
local function referencia(fn, item)
  if type(fn) ~= "function" then
    return nil
  end
  local ok, v = pcall(fn, item)
  if ok and type(v) == "table" then
    v = v.normal
  end
  if not ok or SNF.API.esSecreto(v) or type(v) ~= "number" or v <= 0 or v >= math.huge then
    return nil
  end
  local c = SNF.Formulas.cobre(v)
  return c and c > 0 and c or nil
end

-- Operaciones.topeCompra(tipo, nombre, item) -> cobre entero | nil, recorte   el «Precio máximo» de una operación de
--   compra (Sniper o Compras) con el tope prudente: nunca más que el menor entre el precio de mercado de tu casa
--   (snfmercado, Precios.de(item).normal) y el regional (snfregional(), Precios.regional). Con uno solo, ese; sin
--   ninguno, la fórmula sola. Nunca baja del precio de vendedor (vendorsell): comprar por debajo de él es ganancia
--   segura, así que con la fórmula por encima el tope se queda en ese precio. `recorte` es "mercado", "regional" o
--   "vendedor" según el precio que bajó el tope (en un empate entre casa y región, "mercado"); nil si manda la fórmula.
--   Sin valor de la fórmula no hay tope (nil), como Operaciones.cobre. Con el ajuste comercioPrudente apagado es
--   Operaciones.cobre tal cual.
function Operaciones.topeCompra(tipo, nombre, item)
  local tope = Operaciones.cobre(tipo, nombre, "precioMaximo", item)
  if not tope or SNF.Ajustes.get("comercioPrudente") == false then
    return tope, nil
  end
  local precios = rawget(SNF, "Precios")
  if type(precios) ~= "table" then
    return tope, nil
  end
  local mercado = referencia(precios.de, item)
  local regional = referencia(precios.regional, item)
  local menor, recorte = mercado, "mercado"
  if regional and (not menor or regional < menor) then
    menor, recorte = regional, "regional"
  end
  if not menor or menor >= tope then
    return tope, nil
  end
  local vendedor = referencia(function(id) return (SNF.Formulas.valor("vendorsell", id)) end, item)
  if vendedor and vendedor > menor then
    if vendedor >= tope then
      return tope, nil
    end
    return vendedor, "vendedor"
  end
  return menor, recorte
end

---------------------------------------------------------------------------------------------------
-- Operaciones de cada grupo.
---------------------------------------------------------------------------------------------------

local function padreDe(ruta)
  local pos, desde = nil, 0
  while true do
    local a = string.find(ruta, SEP, desde + 1, true)
    if not a then
      break
    end
    pos, desde = a, a
  end
  return pos and string.sub(ruta, 1, pos - 1) or ""
end

-- La lista guardada de un grupo para un tipo (o nil si no tiene override).
local function listaPropia(v2, ruta, tipo)
  local grupos = v2.gruposOps
  local g = type(grupos) == "table" and grupos[ruta]
  local lista = type(g) == "table" and g[tipo]
  if type(lista) == "table" then
    return lista
  end
  return nil
end

-- Las operaciones (con las que ya no existen) que usa un grupo y de quién las hereda. Un grupo sin padre en el árbol sube
-- igual por su ruta hasta el Grupo Base.
local function efectiva(v2, ruta, tipo)
  local actual = ruta
  while true do
    local lista = listaPropia(v2, actual, tipo)
    if actual == "" then
      return lista or {}, (ruta ~= "") and "" or nil
    end
    if lista then
      return lista, actual ~= ruta and actual or nil
    end
    actual = padreDe(actual)
  end
end

local function groupOperations(v2, ruta, tipo)
  local nombres, faltan = {}, {}
  if not v2 or type(ruta) ~= "string" or not TIPOS[tipo] then
    return nombres, nil, faltan
  end
  local lista, de = efectiva(v2, ruta, tipo)
  local vistos = {}
  for _, n in ipairs(lista) do
    if type(n) == "string" and not vistos[n] then
      vistos[n] = true
      if operacion(v2, tipo, n) then
        if not (TIPOS[tipo].una and #nombres >= 1) then
          nombres[#nombres + 1] = n
        end
      else
        faltan[#faltan + 1] = n
      end
    end
  end
  return nombres, de, faltan
end

function Operaciones.deGrupo(ruta, tipo)
  return groupOperations(datos(), ruta, tipo)
end

-- One snapshot for the seven operation types displayed together.
local function noAssignments() return nil end

function Operaciones.groupReader()
  local v2 = datos()
  if not v2 or type(v2.gruposOps) ~= "table" or next(v2.gruposOps) == nil then
    return noAssignments
  end
  return function(route, kind) return groupOperations(v2, route, kind) end
end

function Operaciones.gruposDe(tipo, nombre)
  local salida = {}
  local v2 = datos()
  if not v2 or not operacion(v2, tipo, nombre) then
    return salida
  end
  local function la(ruta)
    for _, n in ipairs(listaPropia(v2, ruta, tipo) or {}) do
      if n == nombre then
        return true
      end
    end
    return false
  end
  if la("") then
    salida[1] = ""
  end
  if SNF.Arbol and type(v2.gruposOps) == "table" then
    for _, ruta in ipairs(SNF.Arbol.ordenadas()) do
      if v2.gruposOps[ruta] ~= nil and la(ruta) then
        salida[#salida + 1] = ruta
      end
    end
  end
  return salida
end

function Operaciones.ponerDeGrupo(ruta, tipo, nombres)
  local v2 = datos()
  if not v2 or type(ruta) ~= "string" or not TIPOS[tipo] or type(nombres) ~= "table" then
    return false
  end
  if not SNF.Arbol or not SNF.Arbol.existe(ruta) then
    return false
  end
  local vistos, lista = {}, {}
  for _, n in ipairs(nombres) do
    if type(n) ~= "string" or not operacion(v2, tipo, n) then
      return false
    end
    if not vistos[n] then
      vistos[n] = true
      lista[#lista + 1] = n
    end
  end
  if TIPOS[tipo].una and #lista > 1 then
    return false
  end
  local g = subtabla(subtabla(v2, "gruposOps", true), ruta, true)
  g[tipo] = lista
  return true
end

function Operaciones.quitarOverride(ruta, tipo)
  local v2 = datos()
  if not v2 or type(ruta) ~= "string" or ruta == "" or not TIPOS[tipo] or not listaPropia(v2, ruta, tipo) then
    return false
  end
  local g = v2.gruposOps[ruta]
  g[tipo] = nil
  if next(g) == nil then
    v2.gruposOps[ruta] = nil
  end
  return true
end

function Operaciones.huerfanos()
  local salida = {}
  local v2 = datos()
  local grupos = v2 and v2.gruposOps
  if type(grupos) == "table" and SNF.Arbol then
    for ruta, g in pairs(grupos) do
      if type(ruta) == "string" and ruta ~= "" and ruta ~= ROTO and type(g) == "table" and not SNF.Arbol.existe(ruta) then
        salida[#salida + 1] = ruta
      end
    end
  end
  return ordenar(salida)
end

-- Como TSM: los grupos son los que usan la operación (con la herencia, y el Grupo Base cuenta como uno); los objetos son los
-- de esos grupos, y el Grupo Base no suma objetos (abarca todo lo que no tiene grupo): lo marca `conBase`, el asterisco.
-- Cuenta los usos de TODAS las operaciones de un tipo de una sola pasada (una lectura del árbol y una mirada a cada grupo):
-- {[nombre] = {grupos, objetos, conBase}}. Es lo que usa la página Operaciones para su tabla (contar operación a operación
-- repetiría la pasada por todos los grupos una vez por operación).
local function contarUsos(v2, tipo)
  local salida = {}
  local ops = operacionesDe(v2, tipo, false)
  if not ops then
    return salida
  end
  for nombre, op in pairs(ops) do
    if type(nombre) == "string" and nombre ~= ROTO and type(op) == "table" then
      salida[nombre] = {grupos = 0, objetos = 0, conBase = false}
    end
  end
  if not SNF.Arbol then
    return salida
  end
  -- Los objetos de cada grupo, de una sola pasada por los objetos (contar grupo a grupo recorre todos los objetos cada vez).
  -- Task 26: solo las cuentas (Arbol.cuantosPorGrupo), sin el índice ni la lista de objetos de cada grupo que hace
  -- Arbol.listar: con 353 grupos y 11.630 objetos eso eran unas 2.500 tablas y la mitad del tiempo.
  local cuantos = SNF.Arbol.cuantosPorGrupo()
  -- ¿Está n antes de la posición i en la lista? (las listas de un grupo son cortas: así no hace falta una tabla por grupo)
  local function repetido(lista, i, n)
    for k = 1, i - 1 do
      if lista[k] == n then
        return true
      end
    end
    return false
  end
  local function contar(ruta, objetos)
    local lista = efectiva(v2, ruta, tipo)
    for i, n in ipairs(lista) do
      local u = type(n) == "string" and salida[n]
      if u and not repetido(lista, i, n) then
        u.grupos = u.grupos + 1
        if ruta == "" then
          u.conBase = true
        else
          u.objetos = u.objetos + objetos
        end
      end
    end
  end
  contar("", 0)
  for ruta, n in pairs(cuantos) do
    contar(ruta, n)
  end
  return salida
end

function Operaciones.usosDeTipo(tipo)
  local v2 = datos()
  if not v2 or not TIPOS[tipo] then
    return {}
  end
  return contarUsos(v2, tipo)
end

function Operaciones.usos(tipo, nombre)
  local v2 = datos()
  if not v2 or not operacion(v2, tipo, nombre) or not SNF.Arbol then
    return 0, 0, false
  end
  local u = contarUsos(v2, tipo)[nombre]
  if not u then
    return 0, 0, false
  end
  return u.grupos, u.objetos, u.conBase
end
