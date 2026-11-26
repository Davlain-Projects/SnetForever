// Protocolo MCP mínimo (JSON-RPC 2.0, un mensaje por línea) para el servidor de herramientas de solo lectura.
// Módulo puro: recibe una línea y devuelve la línea de respuesta (o null si no hay que responder). Sin disco ni procesos.

export const VERSIONES_MCP = ['2025-06-18', '2025-03-26', '2024-11-05'];

const respuesta = (id, result) => JSON.stringify({ jsonrpc: '2.0', id, result });
const fallo = (id, code, message) => JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });

/** Si el JSON de la salida pasa de `max` caracteres, lo cambia por {recortado: true, texto: <el principio>} con el
 *  texto acortado hasta que el conjunto cabe: así lo que recibe la IA sigue siendo JSON válido. */
function acotar(texto, max) {
  if (texto.length <= max) return texto;
  let corte = Math.max(0, max);
  for (;;) {
    const salida = JSON.stringify({ recortado: true, texto: texto.slice(0, corte) });
    if (salida.length <= max || corte === 0) return salida;
    corte = Math.min(corte - 1, Math.floor(corte * 0.9));
  }
}

const resultadoTexto = (texto, isError) => ({ content: [{ type: 'text', text: texto }], isError });

// `instrucciones` (opcional): un texto no vacío va en la respuesta a `initialize` como `instructions` (el campo del protocolo
// MCP para decirle al cliente cómo usar el servidor); sin él, la respuesta no lleva ese campo.
export function crearServidorMcp({ nombre, version, herramientas, instrucciones, maxLlamadas = 80, maxTexto = 60_000 }: { nombre: string; version: string; herramientas: Array<{ nombre: string; descripcion: string; esquema: object; ejecutar: (args: any) => unknown }>; instrucciones?: string; maxLlamadas?: number; maxTexto?: number }) {
  const porNombre = new Map(herramientas.map((h) => [h.nombre, h]));
  let llamadas = 0;

  async function llamar(params) {
    if (++llamadas > maxLlamadas) { // cuentan todas las llamadas, también las de herramientas que no existen
      return resultadoTexto(JSON.stringify({ error: `Se alcanzó el límite de ${maxLlamadas} llamadas; responde con lo que ya tienes.` }), true);
    }
    const h = porNombre.get(params?.name);
    if (!h) return resultadoTexto(JSON.stringify({ error: 'Herramienta desconocida.' }), true);
    try {
      const salida = await h.ejecutar(params.arguments ?? {});
      return resultadoTexto(acotar(JSON.stringify(salida ?? null), maxTexto), false);
    } catch (e) {
      // Revisión final: a la IA solo el código del error (ENOENT…) o un texto fijo, nunca su mensaje (puede llevar rutas o
      // nombres de archivo).
      const codigo = typeof e?.code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(e.code) ? e.code : null;
      return resultadoTexto(JSON.stringify({ error: codigo ? `La herramienta falló (${codigo}).` : 'La herramienta falló.' }), true);
    }
  }

  async function manejar(linea) {
    let msg;
    try { msg = JSON.parse(linea); } catch { return fallo(null, -32700, 'JSON no válido.'); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.method !== 'string') {
      return fallo(msg && typeof msg === 'object' && 'id' in msg ? msg.id : null, -32600, 'Petición no válida.');
    }
    if (!('id' in msg) || msg.id === undefined) return null; // notificación: nunca se responde
    const { id, method, params } = msg;
    switch (method) {
      case 'initialize': {
        const pedida = params?.protocolVersion;
        return respuesta(id, {
          protocolVersion: VERSIONES_MCP.includes(pedida) ? pedida : VERSIONES_MCP[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: nombre, version },
          ...(typeof instrucciones === 'string' && instrucciones !== '' ? { instructions: instrucciones } : {}),
        });
      }
      case 'ping': return respuesta(id, {});
      case 'tools/list':
        return respuesta(id, { tools: herramientas.map((h) => ({ name: h.nombre, description: h.descripcion, inputSchema: h.esquema })) });
      case 'tools/call': return respuesta(id, await llamar(params));
      default: return fallo(id, -32601, `Método desconocido: ${method}`);
    }
  }

  return { manejar };
}
