// Datos sintéticos del tamaño real del jugador para las pruebas de aguante (importar-tsm.test.js, Task 25, y
// principal-aguante.test.js, Task 26): 353 grupos (352 rutas y Grupo Base, como los cuenta TSM) y 11.630 objetos.
// Todo inventado y anónimo: ni un nombre ni un número de los datos de verdad.
//
// rutasSinteticas({niveles}) -> {rutas, objetos}
//   rutas: 30 grupos «Nivel a» de primer nivel, cada uno con sus «Sub b» (hasta 10) y, bajo el primer «Sub», una cadena de
//   «Hoja» hasta el nivel `niveles` (3 por defecto: es el generador de la Task 25, igual que estaba). Se corta en 352.
//   objetos: {«i:<20000 + i>» = ruta}, repartidos por turno entre las rutas.
// luaTSM(datos) -> código de Lua que pone TradeSkillMasterDB con esos grupos y objetos (las 4 claves que lee el
//   importador): Grupo Base y los «Sub» con override de la operación de subasta «Op»; los de primer nivel con «Op» sin
//   override; los más hondos, sin nada.

export const SEP = '`';
export const N_RUTAS = 352;
export const N_GRUPOS = N_RUTAS + 1; // con Grupo Base
export const N_OBJETOS = 11630;

export const nivelDe = (ruta) => ruta.split(SEP).length;

export function rutasSinteticas({ niveles = 3 } = {}) {
  const rutas = [];
  for (let a = 1; a <= 30 && rutas.length < N_RUTAS; a++) {
    const r1 = `Nivel ${a}`;
    rutas.push(r1);
    for (let b = 1; b <= 10 && rutas.length < N_RUTAS; b++) {
      let r = `${r1}${SEP}Sub ${b}`;
      rutas.push(r);
      for (let n = 3; b === 1 && n <= niveles && rutas.length < N_RUTAS; n++) {
        r = `${r}${SEP}Hoja`;
        rutas.push(r);
      }
    }
  }
  const objetos = {};
  for (let i = 1; i <= N_OBJETOS; i++) objetos[`i:${20000 + i}`] = rutas[i % rutas.length];
  return { rutas, objetos };
}

// Un texto de Lua entre comillas (los nombres sintéticos son ASCII: JSON y Lua escapan igual).
const q = (t) => JSON.stringify(t);

export function luaTSM({ rutas, objetos }) {
  const grupos = ['[""] = {Auctioning = {"Op", override = true}}'];
  for (const r of rutas) {
    const n = nivelDe(r);
    grupos.push(`[${q(r)}] = ${n === 1 ? '{Auctioning = {"Op"}}' : n === 2 ? '{Auctioning = {"Op", override = true}}' : '{}'}`);
  }
  const items = Object.entries(objetos).map(([clave, ruta]) => `[${q(clave)}] = ${q(ruta)}`);
  return `TradeSkillMasterDB = {
    ["p@Default@userData@groups"] = {${grupos.join(',\n')}},
    ["p@Default@userData@items"] = {${items.join(',\n')}},
    ["p@Default@userData@operations"] = {Auctioning = {Op = {minPrice = "80% dbmarket", normalPrice = "dbregionmarketavg"}}},
    ["g@ @userData@customPriceSources"] = {},
  }`;
}
