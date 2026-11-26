// Estimación de la memoria PROPIA del addon en el banco (tarea 22, punto 4). fengari no tiene collectgarbage("count")
// («lua_gc not implemented»), así que se recorre en Lua todo lo que el addon tiene vivo y se suman los tamaños que
// tendrían esos objetos en el Lua 5.1 de 64 bits del cliente:
//   tabla  56 B + 16 B por hueco de la parte de array + 40 B por nodo de la parte hash (las dos en potencias de 2);
//   texto  24 B + longitud + 1;
//   cierre 40 B + 8 B por upvalue + 40 B por upvalue (UpVal; los compartidos se cuentan una vez por cierre).
// No cuenta el código (los prototipos), que es fijo, ni la basura aún sin recoger: es lo que queda VIVO.
//
// Raíces: SnetForever, SnetForeverCuenta, SnetForeverPJ y los upvalues de toda función del addon (las de los archivos
// «@SnetForever/...»), que es donde viven los locales de cada archivo. Se recorren claves, valores y upvalues; no se
// entra en las metatablas (las de los marcos son del banco), ni en las funciones del banco o de los datos, ni en lo que
// pertenece a SNF_RUTAS o SNF_MISIONES (es memoria de los addons de datos: el addon solo la referencia). Un texto que
// ya existe en los datos tampoco cuenta (en Lua los textos iguales son el mismo objeto).
//
// estimarMemoria(m) -> {bytes, tablas, textos, cierres, porRaiz: {[raíz]: bytes}}
import { createRequire } from 'node:module';

export const ESTIMADOR = `(function()
  local datos, textosDatos = {}, {}
  local pila = {SNF_RUTAS, SNF_MISIONES}
  while #pila > 0 do
    local t = pila[#pila]; pila[#pila] = nil
    if not datos[t] then
      datos[t] = true
      for k, v in pairs(t) do
        if type(k) == "table" then pila[#pila + 1] = k elseif type(k) == "string" then textosDatos[k] = true end
        if type(v) == "table" then pila[#pila + 1] = v elseif type(v) == "string" then textosDatos[v] = true end
      end
    end
  end
  local function potencia(n) local p = 1 while p < n do p = p * 2 end return p end
  local function delAddon(f)
    local info = BANCO.depuracion.getinfo(f, "S")
    local s = info and info.source or ""
    return string.sub(s, 1, 13) == "@SnetForever/"
  end
  local visto = {}
  local total = {bytes = 0, tablas = 0, textos = 0, cierres = 0, porRaiz = {}}
  local function sumar(raiz, b) total.bytes = total.bytes + b; total.porRaiz[raiz] = (total.porRaiz[raiz] or 0) + b end
  local cola, cabeza, fin = {}, 1, 0 -- fin a mano: con huecos al principio, #cola no es fiable
  local function poner(v, raiz)
    local tipo = type(v)
    if tipo == "string" then
      if not visto[v] and not textosDatos[v] then
        visto[v] = true; total.textos = total.textos + 1; sumar(raiz, 25 + #v)
      end
    elseif tipo == "table" then
      if not visto[v] and not datos[v] and v ~= BANCO and v ~= _G then visto[v] = true; fin = fin + 1; cola[fin] = {v, raiz} end
    elseif tipo == "function" then
      if not visto[v] and delAddon(v) then visto[v] = true; fin = fin + 1; cola[fin] = {v, raiz} end
    end
  end
  -- Tablas débiles (__mode "k" o "v", las cachés): su contenido solo sigue vivo si lo débil está vivo por otro camino.
  -- Se dejan para el final y se repasan hasta que no entra nada nuevo, como haría el recolector.
  local debiles = {}
  local function modoDe(t)
    local mt = getmetatable(t)
    local modo = type(mt) == "table" and rawget(mt, "__mode")
    return type(modo) == "string" and modo or nil
  end
  local function vivo(x)
    local tipo = type(x)
    if tipo ~= "table" and tipo ~= "function" then return true end
    return visto[x] or datos[x] or false
  end
  poner(SnetForever, "SnetForever"); poner(SnetForeverCuenta, "SnetForeverCuenta"); poner(SnetForeverPJ, "SnetForeverPJ")
  local function recorrer()
  while cabeza <= fin do
    local v, raiz = cola[cabeza][1], cola[cabeza][2]
    cola[cabeza] = nil; cabeza = cabeza + 1
    if type(v) == "table" then
      local n, h = #v, 0
      for k in pairs(v) do
        if not (type(k) == "number" and k >= 1 and k <= n and k == math.floor(k)) then h = h + 1 end
      end
      total.tablas = total.tablas + 1
      sumar(raiz, 56 + (n > 0 and 16 * potencia(n) or 0) + (h > 0 and 40 * potencia(h) or 0))
      local modo = modoDe(v)
      if modo then
        debiles[#debiles + 1] = {v, raiz, string.find(modo, "k") ~= nil, string.find(modo, "v") ~= nil}
      else
        for k, x in pairs(v) do
          local sub = raiz
          if raiz == "SnetForever" and type(k) == "string" then sub = "SnetForever." .. k end
          poner(k, sub); poner(x, sub)
        end
      end
    else
      local i = 1
      while true do
        local nombre, x = BANCO.depuracion.getupvalue(v, i)
        if nombre == nil then break end
        local sub = raiz
        if string.find(raiz, "^SnetForever%.[^.]+$") then sub = raiz .. ":" .. nombre end
        poner(x, sub)
        i = i + 1
      end
      total.cierres = total.cierres + 1
      sumar(raiz, 40 + 48 * (i - 1))
    end
  end
  end
  recorrer()
  local antes
  repeat
    antes = fin
    for _, d in ipairs(debiles) do
      for k, x in pairs(d[1]) do
        if (not d[3] or vivo(k)) and (not d[4] or vivo(x)) then poner(k, d[2]); poner(x, d[2]) end
      end
    end
    recorrer()
  until fin == antes
  return total
end)()`;

export function estimarMemoria(m) {
  return m.lua(ESTIMADOR);
}

// Basura: cuántas tablas crea el código del addon mientras corre `fn`. En el juego la memoria que da
// GetAddOnMemoryUsage incluye la basura que el recolector aún no ha recogido, y con ~250 MB de datos estáticos el
// recolector incremental tarda mucho en dar la vuelta: lo que el addon crea en cada fotograma se acumula. Se cuenta
// sondeando ltable.luaH_new de fengari (lvm.js la llama como `ltable.luaH_new`, así que basta con cambiarla en el
// módulo) y atribuyendo cada tabla a la función de Lua que corre (o a la que llamó a la API, si corre una de JS),
// como hace el cliente con la memoria de cada addon. Los textos no se pueden contar así (fengari importa luaS_bless
// por desestructuración).
//
// contarTablas(fn) -> {total, porLinea: {[«@SnetForever/archivo.lua:línea»]: n}}   solo las del addon SnetForever.
const requerir = createRequire(import.meta.url);
const ltable = requerir('fengari/src/ltable.js');
const decodificador = new TextDecoder();

function fuenteDe(ci) {
  const f = ci && ci.func && ci.func.value;
  if (!f || !f.p || !f.p.source) return null;
  const fuente = f.p.source;
  const texto = decodificador.decode(fuente.getstr ? fuente.getstr() : fuente);
  return `${texto}:${f.p.lineinfo[ci.l_savedpc - 1] ?? '?'}`;
}

export function contarTablas(fn) {
  const porLinea = {};
  let total = 0;
  const original = ltable.luaH_new;
  ltable.luaH_new = function (L) {
    const donde = fuenteDe(L.ci) || fuenteDe(L.ci && L.ci.previous);
    if (donde && donde.startsWith('@SnetForever/')) {
      total += 1;
      porLinea[donde] = (porLinea[donde] || 0) + 1;
    }
    return original(L);
  };
  try {
    fn();
  } finally {
    ltable.luaH_new = original;
  }
  return { total, porLinea };
}
