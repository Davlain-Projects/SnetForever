// Generador de las texturas propias de la ventana principal: el atlas de iconos y la esquina redondeada.
//
// Todo se dibuja con código propio, sin dependencias y sin copiar nada de otros addons: cada icono es una función
// «punto -> ¿está dentro?» hecha con rectángulos, círculos, segmentos y polígonos, y cada píxel mira 4 x 4 puntos
// para suavizar los bordes. Los iconos son blancos sobre transparente: el addon los tiñe con SetVertexColor.
//
// Escribe TGA de 32 bits sin comprimir (como recursos\icono.tga: origen arriba a la izquierda, 8 bits de alfa).
//
// Uso:  node tools/texturas/generar.mjs        (reescribe addons/SnetForever_Comercio/recursos/iconos.tga y esquina.tga)
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RECURSOS = join(AQUI, '..', '..', 'addons', 'SnetForever_Comercio', 'recursos');

/** Tamaño de cada celda del atlas, en píxeles. */
export const CELDA = 16;
/** The 256 × 64 atlas has room for 64 icons and uses power-of-two dimensions. */
export const COLUMNAS = 16;
export const FILAS = 4;

// ---------------------------------------------------------------------------------------------------------------------
// Formas. Cada una es (x, y) => boolean, en el espacio de la celda (0..16, con y hacia abajo).
// ---------------------------------------------------------------------------------------------------------------------

const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const circulo = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) <= r;
const anillo = (cx, cy, r0, r1) => (x, y) => {
  const d = Math.hypot(x - cx, y - cy);
  return d >= r0 && d <= r1;
};
// Distancia de un punto a un segmento.
function distSegmento(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
// Segmento con grosor y puntas redondas.
const linea = (ax, ay, bx, by, grosor) => (x, y) => distSegmento(x, y, ax, ay, bx, by) <= grosor / 2;
// Contorno de una cápsula (un eslabón de cadena).
const eslabon = (ax, ay, bx, by, r0, r1) => (x, y) => {
  const d = distSegmento(x, y, ax, ay, bx, by);
  return d >= r0 && d <= r1;
};
// Polígono (regla par-impar).
function poligono(...puntos) {
  return (x, y) => {
    let dentro = false;
    for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
      const [xi, yi] = puntos[i];
      const [xj, yj] = puntos[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  };
}
const union = (...formas) => (x, y) => formas.some((f) => f(x, y));
const menos = (forma, ...quitar) => (x, y) => forma(x, y) && !quitar.some((f) => f(x, y));
const contorno = (x0, y0, x1, y1, grosor) => menos(rect(x0, y0, x1, y1), rect(x0 + grosor, y0 + grosor, x1 - grosor, y1 - grosor));

// Diente de engranaje: de radio 4 a 7, con medio ancho de 1.3, en 8 direcciones.
function engranaje() {
  const cuerpo = anillo(8, 8, 2.3, 5.3);
  const dientes = (x, y) => {
    const r = Math.hypot(x - 8, y - 8);
    if (r < 4 || r > 7) return false;
    const paso = Math.PI / 4;
    const a = Math.atan2(y - 8, x - 8);
    const resto = Math.abs(((a % paso) + paso + paso / 2) % paso - paso / 2);
    return resto * r <= 1.3;
  };
  return union(cuerpo, menos(dientes, circulo(8, 8, 2.3)));
}

// Flecha circular de «restablecer»: un anillo abierto arriba a la derecha con la punta en el extremo de arriba.
function restablecer() {
  const arco = (x, y) => {
    const d = Math.hypot(x - 8, y - 9);
    if (d < 3.3 || d > 5) return false;
    const grados = (Math.atan2(y - 9, x - 8) * 180) / Math.PI; // -180..180, y hacia abajo = sentido de las agujas
    return !(grados > -90 && grados < -20);
  };
  return union(arco, poligono([7.2, 0.6], [7.2, 6.4], [11.8, 3.5]));
}

// B3r: «leyendo» (↻ propio): dos medios aros con su punta, en el sentido de las agujas, para la fila que espera su lectura en
// la vista de resultados. Quieto: el addon no lo gira ni lo hace latir.
function leyendo() {
  const cx = 8;
  const cy = 8;
  const r0 = 3.4;
  const r1 = 5.0;
  const tramos = [[-165, -40], [15, 140]]; // grados (y hacia abajo: crece en el sentido de las agujas)
  const arcos = (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d < r0 || d > r1) return false;
    const g = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    return tramos.some(([a, b]) => g >= a && g <= b);
  };
  // La punta al final de cada tramo, mirando hacia donde sigue el giro.
  const puntas = tramos.map(([, b]) => {
    const a = (b * Math.PI) / 180;
    const rm = (r0 + r1) / 2;
    const [px, py] = [cx + rm * Math.cos(a), cy + rm * Math.sin(a)];
    const [tx, ty] = [-Math.sin(a), Math.cos(a)]; // tangente en el sentido de las agujas
    const [nx, ny] = [Math.cos(a), Math.sin(a)]; // hacia fuera
    return poligono([px + tx * 2.6, py + ty * 2.6], [px + nx * 2.4 - tx * 0.4, py + ny * 2.4 - ty * 0.4],
      [px - nx * 2.4 - tx * 0.4, py - ny * 2.4 - ty * 0.4]);
  });
  return union(arcos, ...puntas);
}

/** Los iconos, en el orden del atlas (columna = posición % 16, fila = posición / 16). */
export const ICONOS = [
  ['copiar', menos(contorno(2, 2, 11, 11, 1.5), rect(4.5, 4.5, 15, 15)), contorno(5, 5, 14, 14, 1.5)],
  ['vinculo', eslabon(4.4, 11.6, 7, 9, 1.5, 3.5), eslabon(9, 7, 11.6, 4.4, 1.5, 3.5), linea(6.4, 9.6, 9.6, 6.4, 2.2)],
  ['mas', rect(7, 3, 9, 13), rect(3, 7, 13, 9)],
  ['papelera', rect(6, 1.8, 10, 3.5), rect(2.5, 3.5, 13.5, 5),
    menos(poligono([3.8, 6], [12.2, 6], [11.4, 14.5], [4.6, 14.5]), rect(6.4, 7.5, 7.6, 12.6), rect(8.4, 7.5, 9.6, 12.6))],
  ['lapiz', linea(6.6, 9.4, 12.4, 3.6, 3), poligono([2.2, 13.8], [3.4, 10.2], [5.8, 12.6])],
  ['importar', rect(7.2, 1.5, 8.8, 8.5), poligono([3.8, 7.2], [12.2, 7.2], [8, 11.6]),
    rect(2.5, 12.5, 13.5, 14), rect(2.5, 10.2, 4, 14), rect(12, 10.2, 13.5, 14)],
  ['exportar', rect(7.2, 6.5, 8.8, 12), poligono([3.8, 7.6], [12.2, 7.6], [8, 2.6]),
    rect(2.5, 12.5, 13.5, 14), rect(2.5, 10.2, 4, 14), rect(12, 10.2, 13.5, 14)],
  ['menu', rect(2, 3, 14, 4.6), rect(2, 7.2, 14, 8.8), rect(2, 11.4, 14, 13)],
  ['tilde', linea(3.4, 8.6, 6.6, 11.8, 2.1), linea(6.6, 11.8, 12.8, 4.6, 2.1)],
  ['restablecer', restablecer()],
  ['operacion', engranaje()],
  ['lupa', anillo(6.5, 6.5, 3.1, 4.9), linea(10, 10, 13.6, 13.6, 2.3)],
  ['carpeta', menos(union(rect(1.5, 3, 7, 6), rect(1.5, 5, 14.5, 13.5)), rect(3, 6.5, 13, 12), rect(3, 4.5, 5.8, 6.6))],
  ['abierto', poligono([3.2, 5.2], [12.8, 5.2], [8, 11.6])],
  ['cerrado', poligono([5.2, 3.2], [5.2, 12.8], [11.6, 8])],
  ['cerrar', linea(3.6, 3.6, 12.4, 12.4, 2), linea(12.4, 3.6, 3.6, 12.4, 2)],
  ['asa', ...[4, 8, 12].flatMap((y) => [circulo(5.5, y, 1.25), circulo(10.5, y, 1.25)])],
  ['desplegar', linea(3.6, 6, 8, 10.4, 2), linea(8, 10.4, 12.4, 6, 2)],
  ['alerta', menos(poligono([8, 1.4], [15, 14.2], [1, 14.2]), rect(7.2, 5.6, 8.8, 10), circulo(8, 12, 1))],
  // Para el radio: el disco y su contorno (1,5 px a escala 16: queda en 1 px a 11 px). Con radio 7 la fila y la columna
  // del borde de la celda quedan vacías (un radio de 7,5 aún rozaría esos píxeles): el filtro bilineal no sangra a la
  // celda vecina.
  ['circulo', circulo(8, 8, 7)],
  ['aro', anillo(8, 8, 5.5, 7)],
  // «Abrir»: una flecha en diagonal hacia arriba a la derecha (propia, con su punta de triángulo).
  ['abrir', linea(4.2, 11.8, 11.2, 4.8, 1.9), poligono([6.2, 2.8], [13.2, 2.8], [13.2, 9.8])],
  // B6r: los tres puntos en vertical del menú de columnas de la tabla (apagado hasta que haya menú).
  ['puntos', circulo(8, 3.4, 1.5), circulo(8, 8, 1.5), circulo(8, 12.6, 1.5)],
  // B6r: el reloj del título de la columna del tiempo: un aro y dos agujas (las 12 y las 3).
  ['reloj', anillo(8, 8, 5.2, 6.8), linea(8, 8, 8, 4.4, 1.5), linea(8, 8, 10.8, 8, 1.5)],
  // B6r: pausa (dos barras) y seguir (un triángulo hacia la derecha) del botón cuadrado del escaneo.
  ['pausa', rect(4.2, 3.2, 6.8, 12.8), rect(9.2, 3.2, 11.8, 12.8)],
  ['seguir', poligono([4.6, 2.8], [4.6, 13.2], [12.6, 8])],
  // B3r: la fila que espera su lectura (en vez del triángulo).
  ['leyendo', leyendo()],
  // T1b: las flechas del % del tooltip (la letra del juego puede no traer los triángulos): sube y baja.
  ['sube', poligono([3.2, 11.6], [12.8, 11.6], [8, 5.2])],
  ['baja', poligono([3.2, 5.2], [12.8, 5.2], [8, 11.6])],
  // Task 22: ⊕ para crear en el árbol de operaciones y en «Crear nueva»: un disco con la cruz vaciada (se ve el fondo).
  ['masCirculo', menos(circulo(8, 8, 7), rect(7.1, 3.8, 8.9, 12.2), rect(3.8, 7.1, 12.2, 8.9))],
  // Task 32: ⧉ de la fila de operación de Grupos: un cuadrado abierto por la esquina de arriba a la derecha (lado izquierdo,
  // lado de abajo, medio lado de arriba y medio lado derecho) y una flecha que sale por ese hueco en diagonal.
  ['ventana', rect(2, 4, 4, 14), rect(2, 12, 12, 14), rect(2, 4, 7, 6), rect(10, 9, 12, 14),
    linea(6.2, 9.8, 11.4, 4.6, 1.8), poligono([9, 2], [14, 2], [14, 7])],
  // Task 32: ⇄ de la cabecera del editor de operación: dos flechas horizontales, la de arriba hacia la derecha y la de abajo
  // hacia la izquierda (dando media vuelta a la celda, una queda sobre la otra).
  ['intercambio', linea(2.5, 5, 10.5, 5, 2), poligono([9.5, 1.5], [14.5, 5], [9.5, 8.5]),
    linea(13.5, 11, 5.5, 11, 2), poligono([6.5, 14.5], [1.5, 11], [6.5, 7.5])],
  ['expandirTodo', linea(3.4, 3.6, 8, 7.4, 2), linea(8, 7.4, 12.6, 3.6, 2),
    linea(3.4, 9, 8, 12.8, 2), linea(8, 12.8, 12.6, 9, 2)],
].map(([nombre, ...formas]) => ({ nombre, forma: union(...formas) }));

// ---------------------------------------------------------------------------------------------------------------------
// Dibujo y TGA
// ---------------------------------------------------------------------------------------------------------------------

const MUESTRAS = 4; // 4 x 4 puntos por píxel

/** Cobertura (0..1) de la forma en el píxel (px, py). */
function cobertura(forma, px, py) {
  let dentro = 0;
  for (let i = 0; i < MUESTRAS; i++) {
    for (let j = 0; j < MUESTRAS; j++) {
      const x = (px + (i + 0.5) / MUESTRAS);
      const y = (py + (j + 0.5) / MUESTRAS);
      if (forma(x, y)) dentro++;
    }
  }
  return dentro / (MUESTRAS * MUESTRAS);
}

/** TGA de 32 bits sin comprimir, origen arriba a la izquierda. `rgba` va de arriba abajo, en filas RGBA. */
export function tga(ancho, alto, rgba) {
  const salida = Buffer.alloc(18 + ancho * alto * 4);
  salida[2] = 2; // color verdadero sin comprimir
  salida.writeUInt16LE(ancho, 12);
  salida.writeUInt16LE(alto, 14);
  salida[16] = 32;
  salida[17] = 0x28; // 8 bits de alfa, origen arriba a la izquierda
  for (let i = 0; i < ancho * alto; i++) {
    salida[18 + i * 4] = rgba[i * 4 + 2]; // B
    salida[19 + i * 4] = rgba[i * 4 + 1]; // G
    salida[20 + i * 4] = rgba[i * 4]; // R
    salida[21 + i * 4] = rgba[i * 4 + 3]; // A
  }
  return salida;
}

/** El atlas de iconos: 256 x 32, blanco con alfa. */
export function atlasIconos() {
  const ancho = COLUMNAS * CELDA;
  const alto = FILAS * CELDA;
  const rgba = Buffer.alloc(ancho * alto * 4);
  ICONOS.forEach(({ forma }, n) => {
    const x0 = (n % COLUMNAS) * CELDA;
    const y0 = Math.floor(n / COLUMNAS) * CELDA;
    for (let py = 0; py < CELDA; py++) {
      for (let px = 0; px < CELDA; px++) {
        const a = Math.round(cobertura(forma, px, py) * 255);
        const i = ((y0 + py) * ancho + x0 + px) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
        rgba[i + 3] = a;
      }
    }
  });
  return tga(ancho, alto, rgba);
}

/** La esquina: un cuarto de círculo de 16 x 16 con el vértice abajo a la derecha, blanco con alfa. */
export function esquina() {
  const n = 16;
  const rgba = Buffer.alloc(n * n * 4);
  const dentro = (x, y) => Math.hypot(x - n, y - n) <= n;
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const i = (py * n + px) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
      rgba[i + 3] = Math.round(cobertura(dentro, px, py) * 255);
    }
  }
  return tga(n, n, rgba);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(RECURSOS, 'iconos.tga'), atlasIconos());
  writeFileSync(join(RECURSOS, 'esquina.tga'), esquina());
  console.log(`iconos.tga (${COLUMNAS * CELDA} x ${FILAS * CELDA}, ${ICONOS.length} iconos) y esquina.tga escritos en ${RECURSOS}`);
}
