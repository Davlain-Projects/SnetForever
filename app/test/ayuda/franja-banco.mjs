// Ayuda de las pruebas de la franja en pantalla: pinta en una imagen del tamaño de la pantalla física lo que el banco
// tiene dibujado (BANCO.texturasDe) y la franja EN SU POSICIÓN real, sobre un fondo de ruido, como lo vería la app.
import { aleatorio } from './pintar.mjs';

/**
 * Imagen RGBA de la pantalla física del banco con la franja pintada en su sitio.
 * Cada textura mostrada se pinta en los px `round(desplazamiento · escala · alto físico / 768)` respecto a la esquina
 * superior izquierda del marco de la franja; esa esquina no se redondea aquí: se devuelve tal cual en `origen`
 * ({x, y} en px desde la esquina superior izquierda de la pantalla; solo se ajustan los errores de coma flotante menores de 1e-3: la escala es un float de 32 bits) para que las pruebas
 * comprueben que es entera.
 * → {ancho, alto, canales: 4, datos, origen, escala, texturas: nº de texturas mostradas}
 */
export function franjaComoImagen(m, { marco = 'SnetForeverFranja', semilla = 1, fondo = 'ruido' } = {}) {
  const info = m.lua(`BANCO.texturasDe(${JSON.stringify(marco)})`);
  const { ancho, alto } = info.pantalla;
  const datos = new Uint8Array(ancho * alto * 4);
  const azar = aleatorio(semilla);
  for (let p = 0; p < ancho * alto; p++) {
    for (let c = 0; c < 3; c++) datos[p * 4 + c] = fondo === 'ruido' ? Math.floor(azar() * 256) : 0;
    datos[p * 4 + 3] = 255;
  }
  const k = (info.escala * alto) / 768; // px físicos por unidad del marco
  // El origen sale del cálculo en coma flotante del banco (escala float32, 768 / alto): un 7,999999999999972 es un 8.
  const ajusta = (v) => (Math.abs(v - Math.round(v)) < 1e-3 ? Math.round(v) : v);
  const origen = info.origen && { x: ajusta(info.origen.x), y: ajusta(info.origen.y) };
  let texturas = 0;
  if (origen) {
    const ox = Math.round(origen.x);
    const oy = Math.round(origen.y);
    for (const t of info.lista) {
      if (!t.mostrada || !t.color) continue;
      texturas++;
      const x0 = ox + Math.round(t.x * k);
      const y0 = oy + Math.round(-t.y * k);
      const w = Math.max(1, Math.round(t.ancho * k));
      const h = Math.max(1, Math.round(t.alto * k));
      const nivel = (v) => Math.round(v * 255);
      for (let y = y0; y < y0 + h; y++) {
        if (y < 0 || y >= alto) continue;
        for (let x = x0; x < x0 + w; x++) {
          if (x < 0 || x >= ancho) continue;
          const o = (y * ancho + x) * 4;
          datos[o] = nivel(t.color.r);
          datos[o + 1] = nivel(t.color.g);
          datos[o + 2] = nivel(t.color.b);
        }
      }
    }
  }
  return { ancho, alto, canales: 4, datos, origen, escala: info.escala, texturas };
}
