// Textos de la app, en español y en inglés. Los de error (P6) van al juego en el idioma del mensaje.
export const ERRORES = {
  es: {
    sin_instalar: 'Claude Code no está instalado en este PC. Instálalo desde claude.com/claude-code, inicia sesión con tu cuenta de Claude (Pro o Max: el plan gratis no incluye Claude Code) y vuelve a abrir SnetForever. Si no tienes Claude de pago, también sirve Codex con una cuenta de ChatGPT, incluso la gratis.',
    sin_sesion: 'Claude Code no tiene la sesión iniciada. Abre Terminal, escribe claude y pulsa Intro; luego escribe /login y sigue los pasos con tu cuenta de Claude. Después pulsa «Comprobar Claude Code / Codex» en el icono de SnetForever.',
    pago_por_uso: 'Tu Claude Code usa una cuenta de pago por uso (Console). SnetForever solo funciona con una suscripción Pro o Max: cierra esa sesión con /logout e inicia otra con tu suscripción.',
    limite: 'Has llegado al límite de uso de tu suscripción de Claude. Prueba más tarde.',
    tiempo: 'La IA ha tardado demasiado. Vuelve a preguntar.',
    fallo: 'La IA no ha podido contestar (%s).',
    ocupado: 'La app está contestando otras preguntas. Espera un momento.',
    desconocido: 'No se pudo comprobar la cuenta de Claude Code (%s). Pulsa «Comprobar Claude Code / Codex» en el icono de SnetForever.',
    sin_motor: 'No hay ningún motor de IA listo (ni Claude Code ni ChatGPT/Codex). Abre el icono de SnetForever para ver el estado de cada uno.',
    grande: 'La respuesta era demasiado grande para llegar al juego. Vuelve a preguntar, mejor algo más corto.',
  },
  en: {
    sin_instalar: 'Claude Code is not installed on this PC. Install it from claude.com/claude-code, sign in with your Claude account (Pro or Max: the free plan does not include Claude Code) and reopen SnetForever. Without a paid Claude plan, Codex with a ChatGPT account works too, even a free one.',
    sin_sesion: 'Claude Code is not signed in. Open Terminal, type claude and press Enter; then type /login and follow the steps with your Claude account. Afterwards click "Check Claude Code / Codex" on the SnetForever icon.',
    pago_por_uso: 'Your Claude Code uses a pay-as-you-go account (Console). SnetForever only works with a Pro or Max subscription: sign out with /logout and sign in again with your subscription.',
    limite: 'You have reached the usage limit of your Claude subscription. Try again later.',
    tiempo: 'The AI took too long. Ask again.',
    fallo: 'The AI could not answer (%s).',
    ocupado: 'The app is answering other questions. Wait a moment.',
    desconocido: 'Could not check the Claude Code account (%s). Click "Check Claude Code / Codex" on the SnetForever icon.',
    sin_motor: 'No AI engine is ready (neither Claude Code nor ChatGPT/Codex). Open the SnetForever icon to see the status of each.',
    grande: 'The reply was too large to reach the game. Ask again, with something shorter.',
  },
};

// Variantes del motor Codex (cuenta de ChatGPT, tarea 15b): mencionan «ChatGPT/Codex» en lugar de Claude. Lo que no está
// aquí (tiempo, fallo, ocupado) es igual para los dos motores.
export const ERRORES_CODEX = {
  es: {
    sin_instalar: 'ChatGPT/Codex no está instalado en este PC. Instala Codex CLI (npm install -g @openai/codex), inicia sesión con tu cuenta de ChatGPT (codex login) y vuelve a abrir SnetForever.',
    sin_sesion: 'ChatGPT/Codex no tiene la sesión iniciada. Abre Terminal, escribe codex login y pulsa Intro; sigue los pasos con tu cuenta de ChatGPT. Después pulsa «Comprobar ChatGPT/Codex» en el icono de SnetForever.',
    pago_por_uso: 'Tu ChatGPT/Codex usa una clave de API de OpenAI (pago por uso). SnetForever solo funciona con la suscripción de ChatGPT: cierra esa sesión con codex logout e inicia otra con codex login y tu cuenta de ChatGPT.',
    limite: 'Has llegado al límite de uso de tu suscripción de ChatGPT/Codex (con la cuenta gratis llega antes). Prueba más tarde.',
    desconocido: 'No se pudo comprobar la cuenta de ChatGPT/Codex (%s). Pulsa «Comprobar ChatGPT/Codex» en el icono de SnetForever.',
  },
  en: {
    sin_instalar: 'ChatGPT/Codex is not installed on this PC. Install Codex CLI (npm install -g @openai/codex), sign in with your ChatGPT account (codex login) and reopen SnetForever.',
    sin_sesion: 'ChatGPT/Codex is not signed in. Open Terminal, type codex login and press Enter; follow the steps with your ChatGPT account. Afterwards click "Check ChatGPT/Codex" on the SnetForever icon.',
    pago_por_uso: 'Your ChatGPT/Codex uses an OpenAI API key (pay-as-you-go). SnetForever only works with a ChatGPT subscription: sign out with codex logout and sign in again with codex login and your ChatGPT account.',
    limite: 'You have reached the usage limit of your ChatGPT/Codex subscription (a free account reaches it sooner). Try again later.',
    desconocido: 'Could not check the ChatGPT/Codex account (%s). Click "Check ChatGPT/Codex" on the SnetForever icon.',
  },
};

// S5: con TATI como cerebro (canal de archivos con la app de escritorio TATI). Lo que no está aquí (fallo, ocupado) es
// el texto general.
export const ERRORES_TATI = {
  es: {
    tati_cerrada: 'TATI no responde: ábrela o cambia el cerebro a «IA de SnetForever» en el icono de SnetForever.',
    tati_ocupada: 'TATI está contestando otra cosa en su chat de World of Warcraft. Prueba en un momento.',
    tiempo: 'TATI ha tardado demasiado. Vuelve a preguntar.',
    tati_sin_suscripcion: 'TATI no tiene conectada ninguna suscripción (Claude Code o Codex). Conéctala en TATI o cambia el '
      + 'cerebro a «IA de SnetForever» en el icono de SnetForever.',
    detenido: 'Parado',
  },
  en: {
    tati_cerrada: 'TATI is not answering: open it or switch the brain to "SnetForever AI" on the SnetForever icon.',
    tati_ocupada: 'TATI is answering something else in its World of Warcraft chat. Try again in a moment.',
    tiempo: 'TATI took too long. Ask again.',
    tati_sin_suscripcion: 'TATI has no subscription connected (Claude Code or Codex). Connect one in TATI or switch the '
      + 'brain to "SnetForever AI" on the SnetForever icon.',
    detenido: 'Stopped',
  },
};

/**
 * Texto de un error de la app (`tipo` de P6) en el idioma pedido (por defecto español). `motor` es 'claude' (por
 * defecto), 'codex' o 'tati'; con 'codex' se usan las variantes «ChatGPT/Codex» donde las hay y con 'tati' las de TATI.
 */
export function textoError(tipo, detalle = '', idioma = 'es', motor = 'claude') {
  const tabla = ERRORES[idioma] || ERRORES.es;
  const propias = { codex: ERRORES_CODEX, tati: ERRORES_TATI }[motor];
  const propia = propias ? propias[idioma] || propias.es : {};
  const texto = propia[tipo] || tabla[tipo] || ERRORES.es[tipo] || tabla.fallo;
  return texto.replace('%s', () => String(detalle || '?'));
}

// Detalles de los errores (el «%s» de P6) y motivos de `desconocido` (Ruling F4-33): claude.mjs, codex.mjs y el núcleo los
// dan en español; aquí se reconocen por código y se dan en el idioma del mensaje. Lo que no se reconoce (un texto libre de
// la IA o de su stderr) pasa al genérico: así ni sale texto en otro idioma ni llega al juego lo que dijo el programa.
export const DETALLES = {
  es: {
    claude_no_esta: 'Claude Code no está en este PC',
    codex_no_esta: 'Codex no está en este PC',
    tiempo: 'tiempo agotado',
    ruta_claude: 'la ruta de Claude Code o de los datos tiene caracteres no admitidos (& ! % ^ …); instala Claude Code con el instalador oficial (.exe) o mueve la carpeta de datos',
    ruta_codex: 'la ruta de Codex o de los datos tiene caracteres no admitidos (& ! % ^ …); instala Codex o mueve la carpeta de datos a una ruta sin esos caracteres',
    trabajo: 'la carpeta de trabajo no es de SnetForever',
    datos: 'carpeta de datos no válida',
    modelo: 'modelo no válido',
    nombre_modelo: 'nombre de modelo no válido en config.codex',
    archivos: 'no se pudieron preparar los archivos',
    grande: 'respuesta demasiado grande',
    ilegible: 'respuesta ilegible',
    vacia: 'respuesta vacía',
    codigo: (n) => `código ${n}`,
    arrancar: (c) => `no se pudo arrancar (${c})`,
    antiguo: 'Codex demasiado antiguo',
    herramientas: 'no se pudo comprobar qué herramientas tiene Codex',
    linea: 'línea de órdenes demasiado larga',
    cuenta: 'no se pudo comprobar la cuenta',
    ningun_motor: 'ningún motor listo',
    interno: 'error interno de la app',
    mensaje_ilegible: 'el mensaje no se pudo leer',
    tati_sin_respuesta: 'el turno no dio respuesta',
    tati_detenido: 'se detuvo el turno en TATI',
    tati_a_medias: 'TATI se cerró con el turno a medias',
    generico: 'motivo desconocido',
  },
  en: {
    claude_no_esta: 'Claude Code is not on this PC',
    codex_no_esta: 'Codex is not on this PC',
    tiempo: 'time ran out',
    ruta_claude: 'the path of Claude Code or of the data folder has characters that are not allowed (& ! % ^ …); install Claude Code with the official installer (.exe) or move the data folder',
    ruta_codex: 'the path of Codex or of the data folder has characters that are not allowed (& ! % ^ …); install Codex or move the data folder to a path without those characters',
    trabajo: 'the work folder does not belong to SnetForever',
    datos: 'invalid data folder',
    modelo: 'invalid model',
    nombre_modelo: 'invalid model name in config.codex',
    archivos: 'the files could not be prepared',
    grande: 'reply too large',
    ilegible: 'unreadable reply',
    vacia: 'empty reply',
    codigo: (n) => `exit code ${n}`,
    arrancar: (c) => `could not start (${c})`,
    antiguo: 'Codex is too old',
    herramientas: 'could not check which tools Codex has',
    linea: 'command line too long',
    cuenta: 'the account could not be checked',
    ningun_motor: 'no engine ready',
    interno: 'internal app error',
    mensaje_ilegible: 'the message could not be read',
    tati_sin_respuesta: 'the turn gave no answer',
    tati_detenido: 'the turn was stopped in TATI',
    tati_a_medias: 'TATI closed with the turn half done',
    generico: 'unknown reason',
  },
};

// Texto en español (tal como lo dan claude.mjs, codex.mjs y motor.mjs) -> [código, valor?].
const RECONOCER: Array<[RegExp, string]> = [
  [/^claude no está en este PC$/, 'claude_no_esta'],
  [/^codex no está en este PC$/, 'codex_no_esta'],
  [/^tiempo agotado$/, 'tiempo'],
  [/^la ruta de Claude Code o de los datos tiene caracteres no admitidos/, 'ruta_claude'],
  [/^la ruta de Codex o de los datos tiene caracteres no admitidos/, 'ruta_codex'],
  [/^la carpeta de trabajo no es de SnetForever$/, 'trabajo'],
  [/^carpeta de datos no válida$/, 'datos'],
  [/^modelo no válido$/, 'modelo'],
  [/^nombre de modelo no válido en config\.codex$/, 'nombre_modelo'],
  [/^no se pudieron preparar los archivos$/, 'archivos'],
  [/^respuesta demasiado grande$/, 'grande'],
  [/^respuesta ilegible$/, 'ilegible'],
  [/^respuesta vacía$/, 'vacia'],
  [/^código (-?\d{1,10})$/, 'codigo'],
  [/^no se pudo arrancar \(([A-Za-z0-9_]{1,24})\)$/, 'arrancar'],
  [/^Codex demasiado antiguo$/, 'antiguo'],
  [/^no se pudo comprobar qué herramientas tiene Codex$/, 'herramientas'],
  [/^línea de órdenes demasiado larga$/, 'linea'],
  [/^no se pudo comprobar la cuenta$/, 'cuenta'],
  [/^ningún motor listo$/, 'ningun_motor'],
  [/^error interno de la app$/, 'interno'],
  [/^el mensaje no se pudo leer$/, 'mensaje_ilegible'],
  // Revisión final (I4): los textos fijos de TATI (DETALLES_TATI de tati/cerebro.mjs), tal como los manda.
  [/^El turno no dio respuesta\.$/, 'tati_sin_respuesta'],
  [/^Se detuvo el turno en TATI\.$/, 'tati_detenido'],
  [/^TATI se cerró con el turno a medias\.$/, 'tati_a_medias'],
];

/**
 * El detalle de un error (o el motivo de `desconocido`) en el idioma pedido. Acepta el texto en español que dan los
 * módulos o directamente su código (`ilegible`, `interno`…). Lo que no se reconoce da el genérico («motivo desconocido» /
 * «unknown reason»).
 */
export function textoDetalle(detalle, idioma = 'es') {
  const tabla = DETALLES[idioma] || DETALLES.es;
  const d = typeof detalle === 'string' ? detalle.trim() : '';
  let codigo = 'generico';
  let valor;
  if (Object.hasOwn(DETALLES.es, d) && typeof DETALLES.es[d] === 'string') {
    codigo = d;
  } else {
    for (const [patron, c] of RECONOCER) {
      const m = patron.exec(d);
      if (m) {
        codigo = c;
        valor = m[1];
        break;
      }
    }
  }
  const t = tabla[codigo];
  return typeof t === 'function' ? t(valor) : t;
}

// Motor en uso (tarea 15c): el texto de la bandeja y del buzón, en el idioma pedido.
const MOTORES = {
  es: { claude: 'Motor: Claude', codex: 'Motor: ChatGPT (Codex)' },
  en: { claude: 'Engine: Claude', codex: 'Engine: ChatGPT (Codex)' },
};

/** «Motor: Claude» o «Motor: ChatGPT (Codex)» (en inglés, «Engine: …»); con TATI (S5), «TATI» en los dos idiomas. */
export function textoMotor(motor, idioma = 'es') {
  if (motor === 'tati') return 'TATI';
  const tabla = MOTORES[idioma] || MOTORES.es;
  return tabla[motor === 'codex' ? 'codex' : 'claude'];
}

const ESTADOS = {
  es: { ok: 'listo', sin_instalar: 'no instalado', sin_sesion: 'sin sesión', pago_por_uso: 'pago por uso', desconocido: 'no se pudo comprobar' },
  en: { ok: 'ready', sin_instalar: 'not installed', sin_sesion: 'not signed in', pago_por_uso: 'pay-as-you-go', desconocido: 'could not be checked' },
};

// Rutas de zona (tarea 16b): el resumen para el jugador y los dos avisos, en su idioma.
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
export const TEXTOS_RUTA_ZONA = {
  // 15-nov (en el juego, al final de una respuesta: «No hay misiones de esa zona para tu nivel», que parecía cortado):
  // frases enteras, con la zona si tiene nombre.
  es: {
    sin_zona: 'Esa zona no está en la base de SnetForever.',
    sin_misiones: ({ zona }: { zona?: any; } = {}) => `No te he marcado la ruta${zona ? ` de ${zona}` : ''}: no hay misiones de esa zona para tu nivel.`,
    sin_encontrar: ({ zona }: { zona?: any; } = {}) => `No te he marcado la ruta${zona ? ` de ${zona}` : ''}: no he encontrado esas misiones.`,
    resumen: ({ misiones, pasos, elites, grupo }) => `${plural(misiones, 'misión', 'misiones')} y ${plural(pasos, 'paso', 'pasos')}; `
      + `${elites} de élite; ${plural(grupo, 'pide', 'piden')} grupo`,
    tope: (n) => `(se han dejado fuera ${n} por el tope de 60)`,
    tamano: (n) => `(se han dejado fuera ${n} más para que la ruta quepa)`,
    sinSitio: (n) => `(${plural(n, 'misión que empieza', 'misiones que empiezan')} con un objeto sin sitio conocido)`,
    desdeNivel: (n) => `A partir del nivel ${n}`,
  },
  en: {
    sin_zona: "That zone isn't in the SnetForever database.",
    sin_misiones: ({ zona }: { zona?: any; } = {}) => `I haven't marked the route${zona ? ` for ${zona}` : ''}: there are no quests in that zone for your level.`,
    sin_encontrar: ({ zona }: { zona?: any; } = {}) => `I haven't marked the route${zona ? ` for ${zona}` : ''}: I couldn't find those quests.`,
    resumen: ({ misiones, pasos, elites, grupo }) => `${plural(misiones, 'quest', 'quests')} and ${plural(pasos, 'step', 'steps')}; `
      + `${elites} elite; ${plural(grupo, 'needs', 'need')} a group`,
    tope: (n) => `(${n} were left out because of the 60-quest limit)`,
    tamano: (n) => `(${n} more were left out so the route fits)`,
    sinSitio: (n) => `(${plural(n, 'quest that starts', 'quests that start')} from an item with no known location)`,
    desdeNivel: (n) => `From level ${n}`,
  },
};

/**
 * Texto de una ruta de zona: `tipo` es 'sin_zona', 'sin_misiones' o 'sin_encontrar' (con `valores` = {zona?}) o
 * 'resumen' (con `valores` = {misiones, pasos, elites, grupo, tope?, tamano?,
 * sinSitio?}: lo recortado por el tope de 60 y por el tamaño, y las que empiezan con un objeto sin sitio conocido, se
 * añaden entre paréntesis).
 */
export function textoRutaZona(tipo, valores: { zona?: string; misiones?: number; pasos?: number; elites?: number; grupo?: number; tope?: number; tamano?: number; sinSitio?: number; } = {}, idioma = 'es') {
  const t = TEXTOS_RUTA_ZONA[idioma] || TEXTOS_RUTA_ZONA.es;
  if (tipo !== 'resumen') {
    const v = t[tipo] ?? t.sin_zona;
    return typeof v === 'function' ? v(valores) : v;
  }
  const partes = [t.resumen(valores)];
  if (valores.tope > 0) partes.push(t.tope(valores.tope));
  if (valores.tamano > 0) partes.push(t.tamano(valores.tamano));
  if (valores.sinSitio > 0) partes.push(t.sinSitio(valores.sinSitio));
  return partes.join(' ');
}

// Tarea 20: la guía que crea la IA (bloque guiaNueva). El resumen, lo que se ha quitado, cada tramo que trae «sigue» y el
// aviso de una ruta sin ningún paso válido. Frases enteras, en el idioma del jugador.
//   resumen   {titulo, pasos, misiones, tramo, tramos, web?, pasosTramo?}: pasos y misiones de la ruta entera; con más de
//             una guía (T3: solo si no cabe en una), que no cabe, cuántas partes, cuál llega (con sus pasos) y que «sigue»
//             trae la siguiente;
//             con `web` > 0 (revisión final), cuántos puntos son de internet
//   deInternet(sitio)  la marca de la nota de un paso cuyo punto sale de una página (rutaIA.mjs)
//   quitados  {misiones, puntos, pasos, tramos, textos}: '' si no se ha quitado ni cortado nada
//   tramo     {i, n, titulo}
//   sin_pasos (sin valores)
//   tramo con `desde` (la guía de la biblioteca que sigue, guiaBiblioteca.mjs): el último tramo dice que «sigue» la continúa
//   biblioteca {hasta, total, siguiente?, deOtraClase?, sinMision?, partes?}: (ronda 1, M6: «esta guía» con una parte) la guía de la biblioteca tal cual (abrir_guia /
//             abrirGuia): hasta qué paso llega, desde cuál sigue, los pasos de otra clase o raza y los que van sin su misión
//   guia_desconocida (sin valores): abrirGuia con una guía que no está en la biblioteca
//   ruta_en_pines (sin valores, ronda 1: M8): la red S2 ha pasado la `ruta` de la IA a pines
//   pedido_malo (sin valores): un abrirGuia que no vale (pedidoValido de guiaBiblioteca.mjs)
// Une las partes como «a, b y c».
const unirPartes = (partes, y) => (partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} ${y} ${partes.at(-1)}`);
const cuenta = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
export const TEXTOS_GUIA_NUEVA = {
  es: {
    resumen: ({ titulo, pasos, misiones, tramo, tramos, web, pasosTramo }) => `Te he preparado la ruta «${titulo}»: ${plural(cuenta(pasos), 'paso', 'pasos')} y `
      + `${plural(cuenta(misiones), 'misión', 'misiones')}.`
      + `${cuenta(web) > 0 ? ` ${cuenta(web) === 1 ? '1 punto es de internet' : `${cuenta(web)} puntos son de internet`} (lo dice su paso).` : ''}`
      + `${tramos > 1 ? ` No cabe en una sola guía: va en ${tramos} partes y te mando la ${tramo}`
        + `${cuenta(pasosTramo) > 0 ? ` (${plural(cuenta(pasosTramo), 'paso', 'pasos')})` : ''}. Cuando la acabes, escribe «sigue» y te mando la siguiente.` : ''}`,
    deInternet: (sitio) => `(de internet: ${sitio})`,
    quitados: {
      misiones: (n) => `${plural(n, 'misión', 'misiones')} que no ${n === 1 ? 'está' : 'están'} en la base ni en tus guías`,
      puntos: (n) => `${plural(n, 'punto', 'puntos')} que no se ${n === 1 ? 'pudo' : 'pudieron'} comprobar`,
      pasos: (n) => `${plural(n, 'paso', 'pasos')} que ${n === 1 ? 'se quedó vacío o pasaba' : 'se quedaron vacíos o pasaban'} del tope`,
      tramos: (n) => `${plural(n, 'tramo', 'tramos')} que ${n === 1 ? 'se quedó vacío o pasaba' : 'se quedaron vacíos o pasaban'} del tope de 8`,
      cabeza: (uno) => (uno ? 'Se ha quitado' : 'Se han quitado'),
      y: 'y',
      textos: (n) => (n === 1 ? 'Se ha acortado 1 texto de paso a 200 caracteres.' : `Se han acortado ${n} textos de paso a 200 caracteres.`),
    },
    tramo: ({ i, n, titulo, desde }) => `Parte ${i} de ${n}: «${titulo}».${i < n ? ' Cuando la acabes, escribe «sigue» y te mando la siguiente.'
      : Number.isInteger(desde) ? ` Escribe «sigue» para seguir con la guía desde el paso ${desde}.` : ' Es la última.'}`,
    sin_pasos: 'No te he preparado la ruta: no ha quedado ningún paso que se pudiera comprobar.',
    biblioteca: ({ hasta, total, siguiente, deOtraClase, sinMision, partes }) => `Es tu guía de la biblioteca tal cual, hasta el paso ${hasta} de ${total}.`
      + `${Number.isInteger(siguiente) ? ` Cuando acabes ${cuenta(partes) > 1 ? 'estas partes' : 'esta guía'}, escribe «sigue» y te la abro desde el paso ${siguiente}.` : ''}`
      + `${cuenta(deOtraClase) > 0 ? ` Sin ${plural(cuenta(deOtraClase), 'paso', 'pasos')} de otra clase o raza.` : ''}`
      + `${cuenta(sinMision) > 0 ? ` ${cuenta(sinMision) === 1 ? '1 paso va' : `${cuenta(sinMision)} pasos van`} con su sitio pero sin una misión que no está ni en la base ni en tus guías.` : ''}`,
    guia_desconocida: 'No te he abierto la guía: no está en tu biblioteca.',
    ruta_en_pines: 'Te lo marco en el mapa sin cambiar tu guía: sigue con su paso.',
    pedido_malo: 'El pedido de la guía no vale: no te la he abierto.',
    previas: {
      anadidas: (n) => `Añadí delante ${plural(n, 'misión previa', 'misiones previas')} que ${n === 1 ? 'faltaba' : 'faltaban'}.`,
      quite: 'Quité',
      una: (mision, previa, motivo) => `«${mision}» porque necesita «${previa}», que ${motivo}`,
      motivo: {
        base: 'no está en la base',
        personaje: 'no es para tu facción, raza o clase',
        continente: 'es de otro continente',
        cadena: 'necesita otra que no se puede hacer',
        tope: 'tiene una cadena de previas demasiado larga',
      },
      y: 'y',
      mas: (n) => `${n} más`,
    },
  },
  en: {
    resumen: ({ titulo, pasos, misiones, tramo, tramos, web, pasosTramo }) => `I've prepared the route "${titulo}": ${plural(cuenta(pasos), 'step', 'steps')} and `
      + `${plural(cuenta(misiones), 'quest', 'quests')}.`
      + `${cuenta(web) > 0 ? ` ${cuenta(web) === 1 ? '1 point is' : `${cuenta(web)} points are`} from the web (its step says so).` : ''}`
      + `${tramos > 1 ? ` It doesn't fit in one guide: it comes in ${tramos} parts and this is part ${tramo}`
        + `${cuenta(pasosTramo) > 0 ? ` (${plural(cuenta(pasosTramo), 'step', 'steps')})` : ''}. When you finish it, type "next" for the next one.` : ''}`,
    deInternet: (sitio) => `(from the web: ${sitio})`,
    quitados: {
      misiones: (n) => `${plural(n, 'quest', 'quests')} that ${n === 1 ? "isn't" : "aren't"} in the database or in your guides`,
      puntos: (n) => `${plural(n, 'point', 'points')} that could not be checked`,
      pasos: (n) => `${plural(n, 'step', 'steps')} that ${n === 1 ? 'was' : 'were'} empty or over the limit`,
      tramos: (n) => `${plural(n, 'part', 'parts')} that ${n === 1 ? 'was' : 'were'} empty or over the limit of 8`,
      cabeza: () => 'Removed',
      y: 'and',
      textos: (n) => (n === 1 ? 'Shortened 1 step text to 200 characters.' : `Shortened ${n} step texts to 200 characters.`),
    },
    tramo: ({ i, n, titulo, desde }) => `Part ${i} of ${n}: "${titulo}".${i < n ? ' When you finish it, type "next" for the next one.'
      : Number.isInteger(desde) ? ` Type "next" to go on with the guide from step ${desde}.` : ' This is the last one.'}`,
    sin_pasos: "I haven't prepared the route: no step that could be checked was left.",
    biblioteca: ({ hasta, total, siguiente, deOtraClase, sinMision, partes }) => `It's your library guide as it is, up to step ${hasta} of ${total}.`
      + `${Number.isInteger(siguiente) ? ` When you finish ${cuenta(partes) > 1 ? 'these parts' : 'this guide'}, type "next" and I'll open it from step ${siguiente}.` : ''}`
      + `${cuenta(deOtraClase) > 0 ? ` Without ${plural(cuenta(deOtraClase), 'step', 'steps')} for another class or race.` : ''}`
      + `${cuenta(sinMision) > 0 ? ` ${cuenta(sinMision) === 1 ? '1 step goes' : `${cuenta(sinMision)} steps go`} with its place but without a quest that is neither in the database nor in your guides.` : ''}`,
    guia_desconocida: "I haven't opened the guide: it isn't in your library.",
    ruta_en_pines: "I've marked it on the map without changing your guide: carry on with its step.",
    pedido_malo: "The guide request is not valid: I haven't opened it.",
    previas: {
      anadidas: (n) => `Added ${plural(n, 'missing prerequisite quest', 'missing prerequisite quests')} in front.`,
      quite: 'Removed',
      una: (mision, previa, motivo) => `"${mision}" because it needs "${previa}", which ${motivo}`,
      motivo: {
        base: "isn't in the database",
        personaje: "isn't for your faction, race or class",
        continente: 'is on another continent',
        cadena: 'needs another one that cannot be done',
        tope: 'has too long a chain of prerequisites',
      },
      y: 'and',
      mas: (n) => `${n} more`,
    },
  },
};

// 16-nov: la línea de las previas de la ruta de la IA (rutaIA.mjs, completarPrevias): las que se añadieron delante y las
// misiones que se quitaron porque su previa no se puede hacer, en UNA línea. `sinPrevia` = [{mision, previa, motivo}] con
// los nombres ya puestos; se nombran como mucho 3 y el resto se cuenta. '' si no hay nada que decir.
const MAX_SIN_PREVIA = 3;
function lineaPrevias(t, { previas, sinPrevia }: { previas?: any[]; sinPrevia?: boolean }) {
  const p = t.previas;
  const frases = [];
  if (cuenta(previas) > 0) frases.push(p.anadidas(cuenta(previas)));
  const lista = Array.isArray(sinPrevia) ? sinPrevia.filter((s) => s && typeof s === 'object') : [];
  if (lista.length > 0) {
    const partes = lista.slice(0, MAX_SIN_PREVIA).map((s) => p.una(s.mision, s.previa, p.motivo[s.motivo] ?? p.motivo.cadena));
    if (lista.length > MAX_SIN_PREVIA) partes.push(p.mas(lista.length - MAX_SIN_PREVIA));
    const unidas = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')}, ${p.y} ${partes.at(-1)}`;
    frases.push(`${p.quite} ${unidas}.`);
  }
  return frases.join(' ');
}

/** Texto de la guía que crea la IA: `tipo` es 'resumen', 'quitados', 'tramo', 'previas' (16-nov), 'biblioteca',
 *  'guia_desconocida' o 'sin_pasos' (ver TEXTOS_GUIA_NUEVA). */
export function textoGuiaNueva(tipo, valores = {}, idioma = 'es') {
  const t = TEXTOS_GUIA_NUEVA[idioma] || TEXTOS_GUIA_NUEVA.es;
  const v: Record<string, any> = valores && typeof valores === 'object' ? valores : {};
  if (tipo === 'resumen') return t.resumen(v);
  if (tipo === 'tramo') return t.tramo(v);
  if (tipo === 'previas') return lineaPrevias(t, v);
  if (tipo === 'biblioteca') return t.biblioteca(v);
  if (tipo === 'guia_desconocida') return t.guia_desconocida;
  if (tipo === 'ruta_en_pines') return t.ruta_en_pines;
  if (tipo === 'pedido_malo') return t.pedido_malo;
  if (tipo !== 'quitados') return t.sin_pasos;
  const q = t.quitados;
  const lista = ['misiones', 'puntos', 'pasos', 'tramos'].filter((k) => cuenta(v[k]) > 0);
  const frases = [];
  if (lista.length > 0) {
    const uno = lista.length === 1 && cuenta(v[lista[0]]) === 1;
    frases.push(`${q.cabeza(uno)} ${unirPartes(lista.map((k) => q[k](cuenta(v[k]))), q.y)}.`);
  }
  if (cuenta(v.textos) > 0) frases.push(q.textos(cuenta(v.textos)));
  return frases.join(' ');
}

// Tarea 14: el aviso que se añade al final de una respuesta cuando la IA no ha podido usar la biblioteca de guías.
//   codex          con Codex (no tiene nuestras herramientas) y el mensaje habla de guías
//   no_arrancaron  el servidor de herramientas no arrancó (o no se pudo preparar turno.json / mcp.json)
//   sin_opciones   esta versión de Claude Code no tiene --strict-mcp-config y --mcp-config
export const TEXTOS_HERRAMIENTAS = {
  es: {
    codex: '(Esta vez Codex no pudo usar tu biblioteca de guías.)',
    no_arrancaron: '(Las herramientas de guías no arrancaron: esta respuesta va sin tu biblioteca.)',
    sin_opciones: '(Tu versión de Claude Code no deja usar las herramientas de guías.)',
  },
  en: {
    codex: "(This time Codex couldn't use your guide library.)",
    no_arrancaron: "(The guide tools didn't start: this answer comes without your library.)",
    sin_opciones: "(Your Claude Code version doesn't allow the guide tools.)",
  },
};

/** El aviso de las herramientas de guías en el idioma pedido ('' si el tipo no es uno de los tres). */
export function textoHerramientas(tipo, idioma = 'es') {
  const t = TEXTOS_HERRAMIENTAS[idioma] || TEXTOS_HERRAMIENTAS.es;
  return Object.hasOwn(t, tipo) ? t[tipo] : '';
}

/** «No hay ningún motor listo: Claude Code (<estado>), ChatGPT/Codex (<estado>).» con los dos estados. */
export function textoSinMotor(estados, idioma = 'es') {
  const t = ESTADOS[idioma] || ESTADOS.es;
  const de = (e) => t[e && e.estado] || t.desconocido;
  const cabeza = idioma === 'en' ? 'No engine is ready' : 'No hay ningún motor listo';
  return `${cabeza}: Claude Code (${de(estados && estados.claude)}), ChatGPT/Codex (${de(estados && estados.codex)}).`;
}

// ---------- bandeja y arranque (tarea 20) ----------
// Todo lo que la app enseña en la bandeja, en el idioma de Windows. Lo que va al juego (P6) está arriba, en el idioma del mensaje.
export const TEXTOS_APP = {
  es: {
    titulo: 'SnetForever',
    yaAbierto: 'SnetForever ya está abierto',
    comprobando: 'Motor: comprobando…',
    // Las entradas del menú de la bandeja (las lee bandeja.ps1).
    menu: {
      estado: 'Estado',
      comprobar: 'Comprobar Claude Code / Codex',
      motor: 'Motor',
      automatico: 'Automático',
      claude: 'Claude Code',
      codex: 'ChatGPT (Codex)',
      registro: 'Abrir el registro',
      carpeta: 'Abrir la carpeta de datos',
      // Biblioteca de guías: la carpeta, el enlace del portapapeles y volver a bajar los enlaces.
      guias: 'Abrir la carpeta de guías',
      enlace: 'Añadir enlace (del portapapeles)',
      enlaces: 'Actualizar los enlaces',
      // Comercio (Task 8): con una marca si el acceso directo de la carpeta Inicio de Windows existe.
      inicio: 'Arrancar con Windows',
      salir: 'Salir',
      // Fase 5 (F5 y F5-3): %n = los avisos que quedan por mandar; %v = la versión de la app.
      actualizar: 'Buscar actualizaciones',
      actualizacion: 'Actualización: …',
      avisos: 'Enviar avisos de fallo (%n)',
      avisosArchivo: 'Guardar en un archivo',
      avisosCopiar: 'Copiar al portapapeles',
      avisosIssue: 'Abrir una incidencia en GitHub…',
      version: 'Versión %v',
      // S8, el puente con TATI (solo se ven con puenteTati.activo): el submenú «Cerebro» y el complemento. Los mismos
      // nombres que los errores de TATI (ERRORES_TATI).
      cerebro: 'Cerebro',
      cerebroSnetforever: 'IA de SnetForever',
      cerebroTati: 'TATI',
      complementoTati: 'Preparar el complemento para TATI',
    },
    // S8: la línea del motor con el cerebro TATI (la app nunca abre TATI: solo dice si contesta).
    cerebroTati: { ok: 'Cerebro: TATI (conectada)', desconocido: 'Cerebro: TATI (no responde)' },
    cerebroNoGuardado: 'No se pudo guardar el cerebro elegido',
    complementoListo: 'Complemento para TATI preparado: añade esta carpeta a TATI como complemento (otra vez si ya lo tenía).',
    complementoFallo: 'No se pudo preparar el complemento para TATI: mira el registro.',
    juego: { no: 'Juego: no encontrado', minimizado: 'Juego: minimizado', segundoPlano: 'Juego: en segundo plano', listo: 'Juego: listo' },
    // Fase 5, tarea 13: la entrada «Actualización: …» del menú, según el estado.
    actualizacion: {
      al_dia: 'Actualización: al día',
      buscando: 'Actualización: buscando…',
      lista: 'Actualización: lista: se instalará al cerrar el juego',
      instalador: 'Actualización: hace falta el instalador nuevo',
      error: 'Actualización: no se pudo comprobar',
      sin_clave: 'Actualización: desactivadas (sin clave)',
      nunca: 'Actualización: sin comprobar todavía',
      roto: 'Actualización: a medias; se terminará al cerrar el juego',
      reinstalar: 'Actualización: reinstala SnetForever con el instalador',
      fallida: (v) => `Actualización: la ${v} no arrancó; sigue la versión anterior`,
      todavia: 'Actualización: todavía no se puede comprobar',
      listaInstalador: (lista) => `Actualización: lista; para ${lista} hace falta el instalador nuevo`,
    },
    // Los componentes, para la lista de los globos («addon 0.5.1, datos de misiones 2026.11.12.1»).
    componentes: { addon: 'addon', rutas: 'datos de rutas', misiones: 'datos de misiones', comercio: 'addon de comercio', app: 'app' },
    globoListo: (lista) => `Hay una versión nueva de SnetForever (${lista}). Se instalará cuando cierres el juego.`,
    globoAplicado: (lista) => `SnetForever se ha actualizado (${lista}). Ya puedes abrir el juego.`,
    globoReinstalar: 'Una actualización de SnetForever se ha quedado a medias: reinstala SnetForever con el instalador.',
    globoFallida: (v) => `La versión ${v} de SnetForever no arrancó: se ha vuelto a la anterior.`,
    primerArranque: (lista) => `Se ha terminado de instalar SnetForever (${lista}). Ya puedes abrir el juego.`,
    avisosCopiados: 'Avisos de fallo copiados al portapapeles: pégalos donde quieras mandarlos.',
    avisosFallo: 'No se pudieron preparar los avisos de fallo: mira el registro.',
    reiniciarFallo: 'No se pudo reiniciar SnetForever: la versión nueva se usará la próxima vez que lo abras.',
    capturaError: (e) => `Captura: ${e}`,
    preguntaNinguna: 'Última pregunta: ninguna todavía',
    preguntaReciente: 'Última pregunta: hace menos de 1 min',
    preguntaMinutos: (n) => `Última pregunta: hace ${n} min`,
    esperandoAddons: 'AddOns: esperando a encontrar el juego (ábrelo, o pon su carpeta AddOns en «addons» de config.json, en la carpeta de datos)',
    addonsInvalidos: 'AddOns: carpeta no válida (¿está instalado SnetForever?)',
    carpetasCreadas: 'Se han creado las carpetas de respuesta: reinicia el juego para usarlas',
    carpetasPuestasAlDia: 'Se han puesto al día las carpetas de respuesta: reinicia el juego para usarlas',
    configNoGuardada: 'No se pudo guardar el motor elegido',
    arranqueFallo: (codigo) => `SnetForever no ha podido arrancar (${codigo}): mira el registro`,
    baseIncompleta: 'Datos de misiones incompletos: reinstala SnetForever_Misiones (la IA tendrá menos datos)',
    inicioFallo: 'No se pudo cambiar «Arrancar con Windows»: mira el registro.',
    // Biblioteca de guías: los globos de «Añadir enlace» y «Actualizar los enlaces».
    enlaceAnadido: (sitio) => `Enlace añadido: ${sitio}`,
    enlaceSinDireccion: 'En el portapapeles no hay una dirección de internet: copia la de la guía y vuelve a pulsar «Añadir enlace».',
    enlaceFallo: {
      url: 'No se pudo añadir el enlace: la dirección no vale (tiene que ser de internet y empezar por https://).',
      red_local: 'No se pudo añadir el enlace: esa dirección es de tu propia red y no se baja.',
      tamano: 'No se pudo añadir el enlace: la página es demasiado grande.',
      estado: 'No se pudo añadir el enlace: la página no respondió bien (no existe o el sitio falló).',
      tiempo: 'No se pudo añadir el enlace: la página tardó demasiado en responder.',
      conexion: 'No se pudo añadir el enlace: no hay conexión con la página (mira tu internet).',
      vacio: 'No se pudo añadir el enlace: la página no tiene texto que guardar.',
    },
    enlacesActualizados: (bajados, fallidos) => (fallidos > 0
      ? `Enlaces actualizados: ${bajados}; sin poder bajar: ${fallidos}.`
      : `Enlaces actualizados: ${bajados}.`),
    enlacesNinguno: 'No hay enlaces que actualizar: usa «Añadir enlace» o deja un acceso directo .url en la carpeta de guías.',
    enlacesFallo: 'No se pudieron actualizar los enlaces: mira el registro.',
    enlacesRechazados: (n) => (n === 1
      ? 'Un enlace de la lista no se baja: es de tu propia red o la dirección no vale (tiene que ser de internet y empezar por https://).'
      : `${n} enlaces de la lista no se bajan: son de tu propia red o la dirección no vale (tiene que ser de internet y empezar por https://).`),
  },
  en: {
    titulo: 'SnetForever',
    yaAbierto: 'SnetForever is already running',
    comprobando: 'Engine: checking…',
    menu: {
      estado: 'Status',
      comprobar: 'Check Claude Code / Codex',
      motor: 'Engine',
      automatico: 'Automatic',
      claude: 'Claude Code',
      codex: 'ChatGPT (Codex)',
      registro: 'Open the log',
      carpeta: 'Open the data folder',
      guias: 'Open the guides folder',
      enlace: 'Add link (from the clipboard)',
      enlaces: 'Update the links',
      inicio: 'Start with Windows',
      salir: 'Quit',
      actualizar: 'Check for updates',
      actualizacion: 'Update: …',
      avisos: 'Send bug reports (%n)',
      avisosArchivo: 'Save to a file',
      avisosCopiar: 'Copy to the clipboard',
      avisosIssue: 'Open a GitHub issue…',
      version: 'Version %v',
      cerebro: 'Brain',
      cerebroSnetforever: 'SnetForever AI',
      cerebroTati: 'TATI',
      complementoTati: 'Prepare the plugin for TATI',
    },
    cerebroTati: { ok: 'Brain: TATI (connected)', desconocido: 'Brain: TATI (not responding)' },
    cerebroNoGuardado: 'The chosen brain could not be saved',
    complementoListo: 'Plugin for TATI ready: add this folder to TATI as a plugin (again if it already had it).',
    complementoFallo: 'The plugin for TATI could not be prepared: see the log.',
    juego: { no: 'Game: not found', minimizado: 'Game: minimized', segundoPlano: 'Game: in the background', listo: 'Game: ready' },
    actualizacion: {
      al_dia: 'Update: up to date',
      buscando: 'Update: checking…',
      lista: 'Update: ready; it will be installed when you close the game',
      instalador: 'Update: the new installer is needed',
      error: 'Update: could not check',
      sin_clave: 'Update: turned off (no key)',
      nunca: 'Update: not checked yet',
      roto: 'Update: half done; it will be finished when you close the game',
      reinstalar: 'Update: reinstall SnetForever with the installer',
      fallida: (v) => `Update: ${v} did not start; the previous version is still in use`,
      todavia: 'Update: cannot check yet',
      listaInstalador: (lista) => `Update: ready; ${lista} needs the new installer`,
    },
    componentes: { addon: 'addon', rutas: 'route data', misiones: 'quest data', comercio: 'trading addon', app: 'app' },
    globoListo: (lista) => `There is a new version of SnetForever (${lista}). It will be installed when you close the game.`,
    globoAplicado: (lista) => `SnetForever has been updated (${lista}). You can open the game now.`,
    globoReinstalar: 'A SnetForever update was left half done: reinstall SnetForever with the installer.',
    globoFallida: (v) => `Version ${v} of SnetForever did not start: the previous one is back.`,
    primerArranque: (lista) => `SnetForever has finished installing (${lista}). You can open the game now.`,
    avisosCopiados: 'Bug reports copied to the clipboard: paste them wherever you want to send them.',
    avisosFallo: 'The bug reports could not be prepared: see the log.',
    reiniciarFallo: 'SnetForever could not restart: the new version will be used the next time you open it.',
    capturaError: (e) => `Capture: ${e}`,
    preguntaNinguna: 'Last question: none yet',
    preguntaReciente: 'Last question: less than 1 min ago',
    preguntaMinutos: (n) => `Last question: ${n} min ago`,
    esperandoAddons: 'AddOns: waiting to find the game (open it, or put its AddOns folder in "addons" of config.json, in the data folder)',
    addonsInvalidos: 'AddOns: invalid folder (is SnetForever installed?)',
    carpetasCreadas: 'The reply folders have been created: restart the game to use them',
    carpetasPuestasAlDia: 'The reply folders have been updated: restart the game to use them',
    configNoGuardada: 'The chosen engine could not be saved',
    arranqueFallo: (codigo) => `SnetForever could not start (${codigo}): see the log`,
    baseIncompleta: 'Quest data incomplete: reinstall SnetForever_Misiones (the AI will have less data)',
    inicioFallo: 'Could not change "Start with Windows": see the log.',
    enlaceAnadido: (sitio) => `Link added: ${sitio}`,
    enlaceSinDireccion: 'There is no internet address on the clipboard: copy the address of the guide and press "Add link" again.',
    enlaceFallo: {
      url: 'The link could not be added: the address is not valid (it must be an internet address starting with https://).',
      red_local: 'The link could not be added: that address is on your own network and is not downloaded.',
      tamano: 'The link could not be added: the page is too big.',
      estado: 'The link could not be added: the page did not answer properly (it does not exist or the site failed).',
      tiempo: 'The link could not be added: the page took too long to answer.',
      conexion: 'The link could not be added: could not connect to the page (check your internet).',
      vacio: 'The link could not be added: the page has no text to save.',
    },
    enlacesActualizados: (bajados, fallidos) => (fallidos > 0
      ? `Links updated: ${bajados}; could not download: ${fallidos}.`
      : `Links updated: ${bajados}.`),
    enlacesNinguno: 'There are no links to update: use "Add link" or leave a .url shortcut in the guides folder.',
    enlacesFallo: 'The links could not be updated: see the log.',
    enlacesRechazados: (n) => (n === 1
      ? 'One link in the list is not downloaded: it is on your own network or the address is not valid (it must be an internet address starting with https://).'
      : `${n} links in the list are not downloaded: they are on your own network or the address is not valid (it must be an internet address starting with https://).`),
  },
};

const NOMBRE_MOTOR = { claude: 'Claude Code', codex: 'ChatGPT (Codex)' };

/**
 * La línea del motor de la bandeja: «Motor: Claude Code listo (2.1.311)», «Motor: ChatGPT (Codex) listo», o «Ningún motor
 * listo: Claude Code (sin sesión), ChatGPT/Codex (no instalado)». `eleccion` es lo que da `elegirMotor`; `estados`, los
 * resultados de comprobar() (con la versión de Claude Code si se conoce). Un motor forzado que no está listo dice su estado.
 */
export function textoBandejaMotor(eleccion, estados, idioma = 'es') {
  const t = ESTADOS[idioma] || ESTADOS.es;
  const en = idioma === 'en';
  if (eleccion && !eleccion.error) {
    const version = eleccion.motor === 'claude' && estados?.claude?.version ? ` (${estados.claude.version})` : '';
    return `${en ? 'Engine' : 'Motor'}: ${NOMBRE_MOTOR[eleccion.motor]} ${t.ok}${version}`;
  }
  if (eleccion && eleccion.motor) {
    const s = estados?.[eleccion.motor]?.estado;
    return `${en ? 'Engine' : 'Motor'}: ${NOMBRE_MOTOR[eleccion.motor]}: ${t[s] || t.desconocido}`;
  }
  const de = (e) => t[e?.estado] || t.desconocido;
  return `${en ? 'No engine ready' : 'Ningún motor listo'}: Claude Code (${de(estados?.claude)}), ChatGPT/Codex (${de(estados?.codex)})`;
}

/**
 * La línea del motor en forma corta, para el tooltip (63 caracteres): «Motor: Claude Code listo»,
 * «Claude: no instalado · Codex: sin sesión» cuando no hay ninguno listo. Lo demás, como `textoBandejaMotor`.
 */
export function textoMotorCorto(eleccion, estados, idioma = 'es') {
  const t = ESTADOS[idioma] || ESTADOS.es;
  if (eleccion && eleccion.error && !eleccion.motor) {
    const de = (e) => t[e?.estado] || t.desconocido;
    return `Claude: ${de(estados?.claude)} · Codex: ${de(estados?.codex)}`;
  }
  const larga = textoBandejaMotor(eleccion, estados, idioma);
  return larga.replace(/ \(\d[^)]*\)$/, '');
}

// Avisos de fallo (fase 5, tarea 11): el título y las etiquetas del texto que el jugador guarda en un archivo, copia o
// manda como issue de GitHub (avisos.mjs). %g = guía, %n = número del paso, %c = cuántos avisos.
export const TEXTOS_AVISOS = {
  es: {
    tituloUno: 'Aviso: %g paso %n',
    tituloVarios: 'Avisos de fallo (%c)',
    aviso: 'Aviso',
    fecha: 'Fecha',
    addon: 'Addon',
    datos: 'datos',
    personaje: 'Personaje',
    nivel: 'Nivel',
    guia: 'Guía',
    paso: 'paso',
    n: 'n.º',
    pos: 'Posición',
    mapa: 'mapa',
    sinPos: 'sin posición (instancia)',
    texto: 'Texto',
  },
  en: {
    tituloUno: 'Report: %g step %n',
    tituloVarios: 'Bug reports (%c)',
    aviso: 'Report',
    fecha: 'Date',
    addon: 'Addon',
    datos: 'data',
    personaje: 'Character',
    nivel: 'Level',
    guia: 'Guide',
    paso: 'step',
    n: 'no.',
    pos: 'Position',
    mapa: 'map',
    sinPos: 'no position (instance)',
    texto: 'Text',
  },
};

// ---------- instalador (fase 5, tarea 12) ----------

// F7: la guía de la IA que enseña el instalador (y `cli comprobar-ia`) si ni Claude Code ni Codex están listos. Nunca se
// piden contraseñas ni claves, y no se lanza nada: solo se explica.
export const GUIA_IA = {
  es: [
    'Para usar el chat con la IA hace falta Claude Code (con una suscripción Pro o Max de Claude; el plan gratis de Claude no incluye Claude Code) o Codex (con tu cuenta de ChatGPT; también sirve la gratis, aunque llega antes al límite de uso). SnetForever nunca te pedirá contraseñas ni claves.',
    'Claude Code: instálalo desde claude.com/claude-code. Después abre una terminal, escribe claude, pulsa Intro y luego escribe /login; sigue los pasos en el navegador con tu cuenta de Claude.',
    'Codex: instálalo con npm install -g @openai/codex; después escribe codex login en una terminal y entra con tu cuenta de ChatGPT.',
    'Cuando termines, pulsa «Volver a comprobar». Puedes seguir sin esto: la guía de leveo funciona igual y el chat se activará cuando inicies sesión.',
  ],
  en: [
    'To use the AI chat you need Claude Code (with a Claude Pro or Max subscription; the free Claude plan does not include Claude Code) or Codex (with your ChatGPT account; a free one works too, although it reaches the usage limit sooner). SnetForever will never ask you for passwords or keys.',
    'Claude Code: install it from claude.com/claude-code. Then open a terminal, type claude, press Enter and then type /login; follow the steps in the browser with your Claude account.',
    'Codex: install it with npm install -g @openai/codex; then type codex login in a terminal and sign in with your ChatGPT account.',
    'When you are done, press "Check again". You can go on without this: the levelling guide works the same and the chat will turn on when you sign in.',
  ],
};

// F6: los `mensaje` de la CLI del instalador (src/instalador/cli.mjs). Inno enseña la línea 1 del .txt tal cual, así que
// cada uno es una sola línea. `codigos`, uno por código de error; lo demás, el mensaje de cada orden cuando sale bien.
export const TEXTOS_CLI = {
  es: {
    codigos: {
      juego_abierto: 'Cierra el juego para terminar: World of Warcraft está abierto y no se ha tocado nada.',
      carpeta: 'Esa carpeta no es la del juego: elige la carpeta _forever_ de World of Warcraft (la que tiene Wow.exe).',
      sin_permiso: 'Windows no deja escribir en la carpeta del juego: comprueba sus permisos y vuelve a intentarlo.',
      paquete: 'Los archivos del instalador están incompletos o no son los originales: vuelve a descargar el instalador.',
      ocupado: 'Un archivo del juego está en uso: cierra el juego y vuelve a intentarlo.',
      fallo: 'Algo ha fallado: %s',
    },
    ordenDesconocida: 'Orden desconocida: %s',
    detectar: 'Juego encontrado en %s',
    detectarNada: 'No se ha encontrado el juego: elige su carpeta _forever_.',
    juegoCerrado: 'El juego está cerrado.',
    instalado: 'SnetForever está instalado.',
    iaLista: 'Listo: usarás %s.',
    cerrada: 'SnetForever está cerrado.',
    noCerrada: 'SnetForever no se ha cerrado a tiempo: ciérralo desde la bandeja («Salir») y vuelve a intentarlo.',
    desinstalado: 'No se ha borrado nada: lo quitado está en la cuarentena, en %s',
    desinstaladoDos: 'No se ha borrado nada: lo quitado está en la cuarentena, en %s y en %s',
    parcial: 'Lo que ya se había movido está en la cuarentena, en %s',
    desempaquetado: 'Paquete extraído en %s',
    preparado: 'Carpetas de respuesta preparadas.',
  },
  en: {
    codigos: {
      juego_abierto: 'Close the game to finish: World of Warcraft is running and nothing has been touched.',
      carpeta: 'That folder is not the game folder: choose the _forever_ folder of World of Warcraft (the one with Wow.exe).',
      sin_permiso: 'Windows does not allow writing in the game folder: check its permissions and try again.',
      paquete: 'The installer files are incomplete or not the original ones: download the installer again.',
      ocupado: 'A game file is in use: close the game and try again.',
      fallo: 'Something went wrong: %s',
    },
    ordenDesconocida: 'Unknown command: %s',
    detectar: 'Game found in %s',
    detectarNada: 'The game was not found: choose its _forever_ folder.',
    juegoCerrado: 'The game is closed.',
    instalado: 'SnetForever is installed.',
    iaLista: 'Ready: you will use %s.',
    cerrada: 'SnetForever is closed.',
    noCerrada: 'SnetForever did not close in time: quit it from the tray ("Quit") and try again.',
    desinstalado: 'Nothing has been deleted: what was removed is in the quarantine, in %s',
    desinstaladoDos: 'Nothing has been deleted: what was removed is in the quarantine, in %s and in %s',
    parcial: 'What had already been moved is in the quarantine, in %s',
    desempaquetado: 'Package extracted in %s',
    preparado: 'Reply folders ready.',
  },
};
