// Lector de los metadatos `## Clave: valor` de un .toc (solo lectura).
import { readFileSync } from 'node:fs';

// Devuelve un Map clave -> valor. Corta en el primer ':' y recorta espacios.
// Los valores troceados `~N~` se reensamblan con <clave>-1 ... -N; si falta una parte, error.
// Las claves de las partes se conservan en el mapa.
export function leerToc(ruta) {
  const texto = readFileSync(ruta, 'utf8');
  const crudo = new Map();
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.startsWith('## ')) continue;
    const dosPuntos = linea.indexOf(':', 3);
    if (dosPuntos < 0) continue;
    crudo.set(linea.slice(3, dosPuntos).trim(), linea.slice(dosPuntos + 1).trim());
  }
  const mapa = new Map();
  for (const [clave, valor] of crudo) {
    const m = /^~(\d+)~$/.exec(valor);
    if (!m) { mapa.set(clave, valor); continue; }
    const partes = [];
    for (let i = 1; i <= Number(m[1]); i++) {
      const parte = crudo.get(`${clave}-${i}`);
      if (parte === undefined) throw new Error(`falta la parte ${i} de ${clave} en ${ruta}`);
      partes.push(parte);
    }
    mapa.set(clave, partes.join(''));
  }
  return mapa;
}
