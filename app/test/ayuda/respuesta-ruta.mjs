// Respuesta del modo `ruta` de los falsos de Claude y de Codex (tarea 21, prueba de punta a punta): se arma a partir de
// la entrada que les da la app, como lo haría una IA obediente, pero sin pensar nada.
//   - «todas las misiones de esta zona» -> un texto y el bloque {"rutaZona":{"zona":<datos.lugar.mapa>}};
//   - cualquier otra pregunta -> un texto y el bloque {"ruta":{"titulo":…,"puntos":["P2","P1"]}}; si la pregunta es
//     «¿qué vendo?», además "marcas":{"vender":[2589]};
//   - «dibújame…» -> un texto y el bloque {"dibujos":[flecha de recoger al objetivo, círculo en el objetivo]} con sus P#.
// Nunca escribe coordenadas ni ids que no estén en los datos del turno (P2 y P1 los quita la app si no existen).

// El último bloque `<datos_juego id="X">…</datos_juego id="X">` de la entrada, como objeto (null si no hay).
function datosDe(entrada) {
  const patron = /<datos_juego id="([0-9a-f]+)">\n([\s\S]*?)\n<\/datos_juego id="\1">/g;
  let ultimo = null;
  for (const m of entrada.matchAll(patron)) ultimo = m[2];
  if (ultimo === null) return null;
  try {
    return JSON.parse(ultimo);
  } catch {
    return null;
  }
}

// La pregunta nueva: lo que va detrás de la última marca «Pregunta del jugador:».
function preguntaDe(entrada) {
  const marca = 'Pregunta del jugador:\n';
  const i = entrada.lastIndexOf(marca);
  return i < 0 ? '' : entrada.slice(i + marca.length).trim();
}

export function respuestaRuta(entrada) {
  const pregunta = preguntaDe(entrada);
  const datos = datosDe(entrada);
  if (/todas las misiones de esta zona/i.test(pregunta)) {
    const zona = datos?.lugar?.mapa ?? datos?.lugar?.zona ?? '';
    return `Te preparo la ruta de esta zona.\n\n\`\`\`snet\n${JSON.stringify({ rutaZona: { zona } })}\n\`\`\``;
  }
  // Dibujos de la IA: «dibújame…» -> una flecha del sitio de recoger al del objetivo y un círculo en el objetivo, con los
  // P# de la primera misión que tenga los dos (nunca coordenadas).
  if (/dib[uú]j/i.test(pregunta)) {
    const filas = datos?.puntos ?? [];
    const objetivo = filas.find((p) => p.papel === 'objetivo');
    const recoger = filas.find((p) => p.papel === 'recoger' && p.q === objetivo?.q);
    const dibujos = objetivo && recoger
      ? [{ tipo: 'flecha', puntos: [recoger.id, objetivo.id], tinta: 2, texto: 'Por aquí' }, { tipo: 'circulo', puntos: [objetivo.id], tinta: 5 }]
      : [];
    return `Te lo dibujo en el mapa.\n\n\`\`\`snet\n${JSON.stringify({ dibujos })}\n\`\`\``;
  }
  const bloque = { ruta: { titulo: 'Ruta de prueba', puntos: ['P2', 'P1'] } };
  if (/qu[eé] vendo/i.test(pregunta)) bloque.marcas = { vender: [2589] };
  return `Primero ve al segundo punto y luego al primero.\n\n\`\`\`snet\n${JSON.stringify(bloque)}\n\`\`\``;
}
