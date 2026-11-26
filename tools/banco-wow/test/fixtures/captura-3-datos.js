// Los datos de prueba de la captura 3 (Grupos): los usa el test y, una vez, quien regenere captura-3-grupos.txt.
const A = 'SnetForever.Arbol';
const O = 'SnetForever.Operaciones';

export function luaTabla(v) {
  if (Array.isArray(v)) return '{' + v.map(luaTabla).join(',') + '}';
  return JSON.stringify(v);
}

// Los grupos (con sus objetos), en el orden en que se crean (el padre va antes).
export const GRUPOS = [
  ['', 'Materiales', []],
  ['Materiales', 'Hierbas', ['i:2447', 'i:765', 'i:2449', 'i:785', 'i:2453', 'i:2450']],
  ['Materiales`Hierbas', 'Raras', ['i:3356', 'i:3357', 'i:3358']],
  ['Materiales', 'Cuero', ['i:2318', 'i:2319', 'i:2934']],
  ['Materiales', 'Telas', ['i:2589', 'i:2592']],
  ['', 'Consumibles', []],
  ['Consumibles', 'Pociones', ['i:118', 'i:858']],
  ['Consumibles', 'Comida', ['i:117', 'i:4540']],
  ['', 'Bolsas', []],
];
export const TIPOS = ['subasta', 'artesania', 'compras', 'sniper'];

export const preparar = () => `(function()
  local A, O = ${A}, ${O}
  local grupos = ${luaTabla(GRUPOS)}
  for _, g in ipairs(grupos) do
    local ruta = A.crear(g[1], g[2])
    for _, clave in ipairs(g[3]) do A.poner(clave, ruta) end
  end
  for _, tipo in ipairs(${luaTabla(TIPOS)}) do
    O.crear(tipo, "#Default")
    O.ponerDeGrupo("Materiales", tipo, {"#Default"})
  end
end)()`;

