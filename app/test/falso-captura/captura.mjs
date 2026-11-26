// Ayudante de captura FALSO para las pruebas de lanzarCaptura: escribe líneas como captura.ps1, sin mirar la pantalla.
// Modo (FALSO_CAPTURA_MODO):
// - muere: listo, estado, una imagen buena, una mala y basura; «fallo de prueba» por stderr; luego sale con 3;
// - vive: lo mismo, más un estado (minimizado) DESPUÉS de las imágenes, y se queda vivo hasta que lo maten;
// - trozos: una imagen partida en varios trozos de escritura y dos líneas en un mismo trozo; luego sale con 0.
const modo = process.env.FALSO_CAPTURA_MODO || 'muere';

const escribir = (o) => process.stdout.write(`${typeof o === 'string' ? o : JSON.stringify(o)}\n`);
// Imagen de 2 × 1 en BGRA: un píxel azul y uno rojo.
const b64 = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]).toString('base64');
const imagen = { t: 'imagen', ancho: 2, alto: 1, x0: 1346, y0: 535, b64 };
const estadoSi = { t: 'estado', juego: 'si', exe: 'E:\\wow\\World of Warcraft\\_forever_\\Wow.exe', minimizado: false, primerPlano: true, ancho: 2560, alto: 1080 };

if (modo === 'trozos') {
  const linea = `${JSON.stringify({ t: 'listo', version: 1 })}\n${JSON.stringify(imagen)}\n`;
  const corte = linea.length - 10;
  process.stdout.write(linea.slice(0, corte));
  setTimeout(() => {
    process.stdout.write(linea.slice(corte));
    process.stdout.write(`${JSON.stringify({ t: 'estado', juego: 'no' })}\n${JSON.stringify({ t: 'estado', juego: 'si', exe: 'E:\\wow\\_forever_\\Wow.exe', minimizado: true, primerPlano: false, ancho: 2560, alto: 1080 })}\n`, () => process.exit(0));
  }, 50);
} else {
  escribir({ t: 'listo', version: 1 });
  escribir(estadoSi);
  escribir(imagen);
  escribir({ t: 'imagen', ancho: 3, alto: 3, x0: 0, y0: 0, b64 }); // largo que no cuadra: se ignora
  escribir('esto no es JSON');
  escribir({ t: 'otra_cosa' });
  if (modo === 'vive') {
    escribir({ ...estadoSi, minimizado: true, primerPlano: false });
    setInterval(() => {}, 1000);
  } else {
    process.stderr.write('aviso previo\nfallo de prueba\n', () => process.stdout.write('', () => process.exit(3)));
  }
}
