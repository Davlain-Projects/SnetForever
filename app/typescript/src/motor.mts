// Elige entre Claude Code y Codex y les pasa la pregunta (tarea 15c, Ruling F4-11). Sin claves, sin red propia y sin
// borrar nada: solo decide y delega en claude.mjs o codex.mjs.
//
// REGLA DE SEGURIDAD: jamás se elige un motor cuyo estado de `comprobar()` no sea exactamente 'ok'. pago_por_uso,
// desconocido, sin_sesion y sin_instalar (y cualquier otro valor) nunca preguntan.
//
// `config.motor`: 'auto' (por defecto, también si falta o no es válido: lo no válido se avisa una vez en el registro),
//   'claude' o 'codex'.
//   auto   -> Claude si está ok; si no, Codex si está ok; si ninguno, {error: 'sin_motor', estados}.
//   forzado -> solo si ese motor está ok; si no, {error: <su estado>, motor}. Nunca se pasa al otro sin decirlo.
// `estados` = {claude: claude.comprobar(), codex: codex.comprobar()}.
//
// MODELOS: el addon manda `haiku`, `sonnet` u `opus`, que significan «rápido», «más listo» y «el más capaz». Con Claude se
// quedan igual; con Codex pasan a 'rapido' y 'listo', y `opus` también a 'listo' porque Codex no tiene un tercer nivel: es
// el mejor que tiene (codex.mjs resuelve el nombre real y el esfuerzo desde config.codex). Cualquier otro valor cae en el
// seguro y barato (haiku / rapido).
//
// HERRAMIENTAS (tarea 14): `preguntar({…, herramientas})` se lo pasa a Claude ({mcpConfig, nombres}, ver claude.mjs) y
// nunca a Codex, que no tiene nuestro servidor de guías.
//
// FORMA DE RESULTADO de `preguntar`: la de claude.mjs/codex.mjs con el campo `motor` añadido:
//   { ok: true, texto, ms, motor } | { ok: false, tipo, detalle, motor }   (motor es null si no hay ninguno elegido)
import { preguntar as preguntarClaude, resolverClaude } from './claude.mjs';
import { preguntar as preguntarCodex, resolverCodex } from './codex.mjs';
import { textoMotor, textoSinMotor, textoError } from './textos.mjs';
import { log } from './registro.mjs';

export const MOTORES = ['claude', 'codex'];
const ESTADOS = ['ok', 'sin_instalar', 'sin_sesion', 'pago_por_uso', 'desconocido'];

/** Estado de un motor tal como lo dio comprobar(): un texto conocido, o 'desconocido' si falta o no se entiende. */
function estadoDe(estados, motor) {
  // Solo propiedades propias: un estado heredado por prototipo no cuenta.
  const e = estados && typeof estados === 'object' && Object.hasOwn(estados, motor) ? estados[motor] : undefined;
  const s = e && typeof e === 'object' && Object.hasOwn(e, 'estado') ? e.estado : undefined;
  return ESTADOS.includes(s) ? s : 'desconocido';
}

function motivoDe(estados, motor) {
  const e = estados && typeof estados === 'object' ? estados[motor] : undefined;
  return e && typeof e === 'object' && typeof e.motivo === 'string' ? e.motivo : '';
}

// Valores no válidos de config.motor ya avisados en el registro (cada uno una sola vez por ejecución).
const motoresAvisados = new Set();
const MAX_AVISADOS = 20;

function motorConfigurado(config) {
  const m = config && typeof config === 'object' ? config.motor : undefined;
  if (m === 'claude' || m === 'codex' || m === 'auto') return m;
  if (m !== undefined && m !== null) avisarMotorRaro(m);
  return 'auto';
}

// Un config.motor que no es auto|claude|codex (p. ej. «Claude») cae a auto: se dice una vez en el registro para que se
// sepa por qué no se respeta. Solo el valor recortado (es lo que el usuario escribió en config.json, nada del juego).
function avisarMotorRaro(m) {
  const valor = typeof m === 'string' ? JSON.stringify(m.length > 20 ? `${m.slice(0, 20)}…` : m) : typeof m;
  if (motoresAvisados.has(valor) || motoresAvisados.size >= MAX_AVISADOS) return;
  motoresAvisados.add(valor);
  log('aviso', `config.motor no válido (${valor}): se usa «auto» (los válidos son auto, claude y codex)`);
}

/**
 * haiku/sonnet/opus (rápido/más listo/el más capaz) -> el nombre de modelo que entiende cada motor. Con Codex, sonnet y
 * opus van al 'listo' (no tiene más). Lo raro -> el seguro y barato.
 */
export function traducirModelo(motor, iaModelo) {
  const elegido = iaModelo === 'sonnet' || iaModelo === 'opus' ? iaModelo : 'haiku';
  if (motor === 'codex') return elegido === 'haiku' ? 'rapido' : 'listo';
  return elegido;
}

/**
 * {motor, modelo, esfuerzo} | {error: 'sin_motor', estados} | {error: <estado>, motor}. `esfuerzo` es siempre null: con
 * Codex lo decide codex.mjs desde config.codex; con Claude no existe. `iaModelo` es opcional (por defecto el rápido).
 */
export function elegirMotor(config, estados, iaModelo?: any) {
  const quiere = motorConfigurado(config);
  if (quiere !== 'auto') {
    const s = estadoDe(estados, quiere);
    if (s !== 'ok') return { error: s, motor: quiere };
    return { motor: quiere, modelo: traducirModelo(quiere, iaModelo), esfuerzo: null };
  }
  for (const m of MOTORES) {
    if (estadoDe(estados, m) === 'ok') return { motor: m, modelo: traducirModelo(m, iaModelo), esfuerzo: null };
  }
  return { error: 'sin_motor', estados };
}

/**
 * Pone un espacio delante de toda línea que empiece por «ERROR:». Codex repite la entrada por stderr y clasifica sus
 * errores por esas líneas: así no toma como suyo lo que escribió el jugador (tarea 15b). Solo se usa con Codex.
 */
export function neutralizarError(texto) {
  return String(texto ?? '').replace(/^ERROR:/gm, ' ERROR:');
}

/**
 * Elige el motor, traduce el modelo y pregunta. `herramientas` (opcional): {mcpConfig, nombres} para Claude, {mcp} para Codex. `programas` ({claude,
 * codex}, lo que dan resolverClaude/resolverCodex) y `modulos` ({claude, codex} con su `preguntar`) existen para las
 * pruebas; por defecto se resuelven y se usan los reales.
 * Sin motor devuelve {ok: false, tipo: <estado o 'sin_motor'>, detalle, motor} sin lanzar nada.
 */
export async function preguntar({ config, estados, iaModelo, sistema, entrada, tiempoMax, programas, modulos, herramientas }: {
  config?: any;
  estados?: any;
  iaModelo?: any;
  sistema?: any;
  entrada?: any;
  tiempoMax?: any;
  programas?: any;
  modulos?: any;
  herramientas?: any;
} = {}) {
  const e = elegirMotor(config, estados, iaModelo);
  if (e.error) {
    const detalle = e.motor ? motivoDe(estados, e.motor) || e.error : 'ningún motor listo';
    return { ok: false, tipo: e.error, detalle: String(detalle), motor: e.motor || null };
  }
  const { motor, modelo } = e;
  const m = modulos || { claude: { preguntar: preguntarClaude }, codex: { preguntar: preguntarCodex } };
  const c = programas ? programas[motor] : motor === 'codex' ? resolverCodex() : resolverClaude();
  const opciones: {
    modelo: typeof modelo;
    sistema: typeof sistema;
    entrada: typeof entrada;
    tiempoMax: typeof tiempoMax;
    config?: any;
    herramientas?: any;
    mcp?: any;
  } = { modelo, sistema, entrada, tiempoMax };
  if (motor === 'codex') {
    opciones.sistema = neutralizarError(sistema);
    opciones.entrada = neutralizarError(entrada);
    opciones.config = config;
    if (herramientas?.mcp) opciones.mcp = herramientas.mcp; // 22-nov: las de guías que solo leen
  } else if (herramientas) {
    opciones.herramientas = herramientas;
  }
  const r = await m[motor].preguntar(c, opciones);
  return { ...r, motor };
}

/**
 * Para la bandeja y el buzón: {motor: 'claude' | 'codex' | null, estado, texto}. `motor` es el que se usaría; `estado` es
 * 'ok', el estado del motor forzado, o 'sin_motor'. `texto` va en el idioma pedido.
 */
export function estadoMotor(config, estados, idioma = 'es') {
  const e = elegirMotor(config, estados);
  if (!e.error) return { motor: e.motor, estado: 'ok', texto: textoMotor(e.motor, idioma) };
  if (e.motor) {
    const motivo = motivoDe(estados, e.motor);
    return { motor: null, estado: e.error, texto: textoError(e.error, motivo, idioma, e.motor) };
  }
  return { motor: null, estado: 'sin_motor', texto: textoSinMotor(estados, idioma) };
}
