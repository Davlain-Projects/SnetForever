// Ayuda de las pruebas: pinta celdas de la franja como lo haría la pantalla del juego, con ruido y gamma, y las guarda en BMP.
import { writeFileSync } from 'node:fs';

// Generador pseudoaleatorio repetible (mulberry32).
export function aleatorio(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pinta `celdas` (valores 0..7: R = bit 2, G = bit 1, B = bit 0) en una imagen RGBA de ancho × alto.
 * - paso: lado de la celda en px (puede no ser entero: entonces los píxeles del borde entre dos celdas mezclan sus
 *   colores por área, como un escalado no entero); x0, y0: esquina de la franja; celdasFila: celdas por fila (200 en el juego).
 * - gamma: curva de la pantalla aplicada a la mezcla de cada píxel (nivel de salida = mezcla ** gamma, en 0..1). Los
 *   primarios puros (mezcla 0 o 1) no cambian con ninguna gamma; solo se tocan los píxeles mezclados de los bordes.
 * - ruido: desvío máximo en niveles; cada canal de cada píxel se desvía al azar entre -ruido y +ruido (y se recorta a 0..255),
 *   después de la gamma. Con ruido 100, un 255 puede quedar en 155 y un 0 en 100: ya no es «verde puro», pero sigue a
 *   un lado u otro del umbral 128 con el que lee el descodificador.
 * - fondo: 'negro' o 'ruido' (todo el lienzo con bytes aleatorios antes de pintar la franja; los píxeles del borde de la
 *   franja se mezclan también con él).
 */
export function pintarCeldas(celdas, { paso = 2, x0 = 0, y0 = 0, ancho = 816, alto = 208, ruido = 0, gamma = 1, semilla = 1, fondo = 'negro', celdasFila = 200 } = {}) {
  const azar = aleatorio(semilla);
  const bg = new Uint8Array(ancho * alto * 3);
  if (fondo === 'ruido') for (let i = 0; i < bg.length; i++) bg[i] = Math.floor(azar() * 256);
  const datos = new Uint8Array(ancho * alto * 4);
  const filas = Math.ceil(celdas.length / celdasFila);
  const limitar = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  // Celdas que cubre el intervalo [a, b) de un eje, con su peso (largo cubierto / largo del píxel).
  const cubrir = (a, b, n) => {
    const lista = [];
    const u0 = a / paso;
    const u1 = b / paso;
    for (let k = Math.floor(u0); k < Math.ceil(u1); k++) {
      const w = (Math.min(u1, k + 1) - Math.max(u0, k)) / (u1 - u0);
      lista.push([k >= 0 && k < n ? k : -1, w]);
    }
    return lista;
  };
  for (let y = 0; y < alto; y++) {
    const ys = cubrir(y - y0, y + 1 - y0, filas);
    for (let x = 0; x < ancho; x++) {
      const xs = cubrir(x - x0, x + 1 - x0, celdasFila);
      const o = (y * ancho + x) * 4;
      const b = (y * ancho + x) * 3;
      const mezcla = [0, 0, 0];
      for (const [r, wy] of ys) {
        for (const [k, wx] of xs) {
          const idx = r * celdasFila + k;
          const dentro = r >= 0 && k >= 0 && idx < celdas.length;
          for (let c = 0; c < 3; c++) {
            const nivel = dentro ? (celdas[idx] >> (2 - c)) & 1 : bg[b + c] / 255;
            mezcla[c] += nivel * wx * wy;
          }
        }
      }
      for (let c = 0; c < 3; c++) {
        const salida = 255 * Math.pow(Math.min(1, Math.max(0, mezcla[c])), gamma);
        datos[o + c] = limitar(salida + (ruido ? (azar() * 2 - 1) * ruido : 0));
      }
      datos[o + 3] = 255;
    }
  }
  return { ancho, alto, canales: 4, datos };
}

// Imagen toda de un color (para las pruebas de «no es una franja»).
export function imagenPlana(valor, ancho = 816, alto = 208) {
  const datos = new Uint8Array(ancho * alto * 4).fill(valor);
  for (let p = 3; p < datos.length; p += 4) datos[p] = 255;
  return { ancho, alto, canales: 4, datos };
}

// Escribe la imagen (RGBA) como BMP de 32 bits, de arriba abajo (altura negativa), con píxeles BGRA.
export function escribirBmp(imagen, ruta) {
  const { ancho, alto, canales, datos } = imagen;
  const cabecera = Buffer.alloc(54);
  const tamano = ancho * alto * 4;
  cabecera.write('BM', 0, 'latin1');
  cabecera.writeUInt32LE(54 + tamano, 2);
  cabecera.writeUInt32LE(54, 10);
  cabecera.writeUInt32LE(40, 14);
  cabecera.writeInt32LE(ancho, 18);
  cabecera.writeInt32LE(-alto, 22);
  cabecera.writeUInt16LE(1, 26);
  cabecera.writeUInt16LE(32, 28);
  cabecera.writeUInt32LE(tamano, 34);
  const cuerpo = Buffer.alloc(tamano);
  for (let p = 0; p < ancho * alto; p++) {
    const o = p * canales;
    cuerpo[p * 4] = datos[o + (imagen.bgr ? 0 : 2)];
    cuerpo[p * 4 + 1] = datos[o + 1];
    cuerpo[p * 4 + 2] = datos[o + (imagen.bgr ? 2 : 0)];
    cuerpo[p * 4 + 3] = canales === 4 ? datos[o + 3] : 255;
  }
  writeFileSync(ruta, Buffer.concat([cabecera, cuerpo]));
}
