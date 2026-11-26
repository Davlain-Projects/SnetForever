// Cadenas, guías de mazmorra y de profesión comprobadas a mano (§6.4 y R7 del plan de la fase 3). Toda
// guía de tipo cadena, mazmorra o profesión sale con sinVerificar = true salvo que su clave, o el id de su
// cadena, esté aquí. Cada entrada es un registro de quién, cuándo y cómo se comprobó:
//   'druida-oso': { fecha: 'AAAA-MM-DD', quien: 'el jugador', como: 'juego' | 'dos fuentes', nota?: '…' }
// Empezó vacío: solo se añade algo cuando alguien lo ha comprobado de verdad.
//
// La marca es de la cadena entera (las guías de las dos facciones): el formato no distingue facción ni personaje.
export const VERIFICADAS = {
  // Lote «Cadenas de mejoras», ronda 1: verificada por el jugador en el juego el 9-nov-2026; personaje y facción sin apuntar.
  'mejora-saco-dormir': { fecha: '2026-11-09', quien: 'el jugador', como: 'juego', nota: 'personaje y facción sin apuntar' },
};
