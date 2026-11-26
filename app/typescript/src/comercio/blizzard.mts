// Cliente de la API de Blizzard para Forever: token por client_credentials, fotos de las casas de subastas (objetos y
// mercancías), fichas de objeto y misiones. Solo habla con el exterior a través de `enviar` (actualizar/red.mjs), que
// ya limita los sitios a HOSTS_BLIZZARD; aquí los nombres se sacan de esa lista, nunca se escriben.
//
// - El id y el secreto solo se usan para pedir el token y nunca salen en resultados, errores ni registros.
// - El token se guarda hasta `expires_in - 60 s`. Un 401 lo borra y se reintenta una vez; otro 401 (o credenciales que
//   el token rechaza) deja el cliente en «sin_credenciales» y no vuelve a tocar la red hasta pasada 1 hora.
// - Credenciales ausentes (null): «sin_credenciales» sin red y sin esperar, por si el jugador las pone enseguida.
// - Datos estáticos (objeto, misiones): null solo con un 404; el resto de fallos lanza Error con `code` 'SIN_CREDENCIALES' o 'TEMPORAL'.
// - Iconos de objeto: no se piden (haría una llamada más por objeto al endpoint de medios); la ficha sale sin `icono`.
import { HOSTS_BLIZZARD } from '../actualizar/origen.mjs';

const ESPERA_SIN_CREDENCIALES_MS = 60 * 60 * 1000;
const MARGEN_TOKEN_MS = 60 * 1000;
// Una casa son ~7-8 MB de objetos y ~5 MB de mercancías; se deja mucho margen.
const MAX_FOTO = 64 * 1024 * 1024;
const MAX_FICHA = 4 * 1024 * 1024;
const TIEMPO_FOTO_MS = 60_000;
const TIEMPO_FICHA_MS = 30_000;
const RULESET = 2; // Normal; todos los rulesets dan las mismas casas, lo que manda es el número de casa

const aTexto = (v) => (v == null ? '' : String(v));

function leerJson(res) {
  try {
    return JSON.parse(res.cuerpo.toString('utf8'));
  } catch {
    return undefined;
  }
}

function cabecera(res, nombre) {
  const v = res?.cabeceras?.[nombre];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * @param {{region: string, locale?: string, credenciales: () => Promise<{id: string, secreto: string}|null>,
 *   enviar: Function, reloj?: () => number}} p
 */
export function crearClienteBlizzard({ region, locale = 'es_MX', credenciales, enviar, reloj = Date.now }) {
  const sitioApi = HOSTS_BLIZZARD.find((h) => h.startsWith(`${region}.api.`));
  const sitioToken = HOSTS_BLIZZARD.find((h) => h.startsWith('oauth.'));
  if (!sitioApi || !sitioToken) throw new TypeError(`región no admitida: ${aTexto(region)}`);

  const dinamico = `dynamic-forever-${region}`;
  const estatico = `static-forever-${region}`;

  let token = null; // {valor, hasta}
  let pendiente = null; // petición de token en curso (se comparte entre llamadas simultáneas)
  let bloqueadoHasta = 0;

  const bloquear = () => {
    token = null;
    bloqueadoHasta = reloj() + ESPERA_SIN_CREDENCIALES_MS;
  };

  // Devuelve {valor} con el token, {sc: true} si no hay credenciales válidas o {error: true}.
  async function pedirToken() {
    if (token && reloj() < token.hasta) return { valor: token.valor };
    if (!pendiente) {
      pendiente = (async () => {
        let cred;
        try {
          cred = await credenciales();
        } catch {
          return { error: true };
        }
        if (!cred || !cred.id || !cred.secreto) return { sc: true };
        let res;
        try {
          res = await enviar(`https://${sitioToken}/token`, {
            metodo: 'POST',
            cabeceras: {
              Authorization: `Basic ${Buffer.from(`${cred.id}:${cred.secreto}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            cuerpo: 'grant_type=client_credentials',
            maxBytes: MAX_FICHA,
            tiempoMax: TIEMPO_FICHA_MS,
          });
        } catch {
          return { error: true };
        }
        if (res.estado === 400 || res.estado === 401 || res.estado === 403) { bloquear(); return { sc: true }; }
        const j = res.estado === 200 ? leerJson(res) : undefined;
        if (!j || typeof j.access_token !== 'string' || !j.access_token) return { error: true };
        if (!Number.isFinite(j.expires_in) || j.expires_in <= 0) return { error: true };
        const vida = j.expires_in * 1000;
        token = { valor: j.access_token, hasta: reloj() + vida - MARGEN_TOKEN_MS };
        return { valor: token.valor };
      })().finally(() => { pendiente = null; });
    }
    return pendiente;
  }

  // Una petición GET a la API con Bearer. Devuelve {sc: true}, {error: true} o {res}.
  async function pedir(ruta, espacio, { cabeceras = {}, maxBytes, tiempoMax }, intento = 0) {
    if (reloj() < bloqueadoHasta) return { sc: true };
    const t = await pedirToken();
    if (t.sc || t.error) return t;
    const url = `https://${sitioApi}${ruta}?namespace=${espacio}&locale=${locale}`;
    let res;
    try {
      res = await enviar(url, { cabeceras: { ...cabeceras, Authorization: `Bearer ${t.valor}` }, maxBytes, tiempoMax });
    } catch {
      return { error: true };
    }
    if (res.estado === 401) {
      token = null;
      if (intento === 0) return pedir(ruta, espacio, { cabeceras, maxBytes, tiempoMax }, 1);
      bloquear();
      return { sc: true };
    }
    return { res };
  }

  async function foto(ruta, desde, normalizar) {
    const cabeceras = desde ? { 'If-Modified-Since': aTexto(desde) } : {};
    const r = await pedir(ruta, dinamico, { cabeceras, maxBytes: MAX_FOTO, tiempoMax: TIEMPO_FOTO_MS });
    if (r.sc) return { estado: 'sin_credenciales' };
    if (r.error) return { estado: 'error' };
    if (r.res.estado === 304) return { estado: 'igual' };
    if (r.res.estado !== 200) return { estado: 'error' };
    const j = leerJson(r.res);
    // Una casa vacía (la 115 de Forever, 14-nov) responde 200 con su ficha (`_links`) y sin `auctions`: es una foto
    // sin subastas, no un error.
    const vacia = j && typeof j === 'object' && !('auctions' in j) && j._links && typeof j._links === 'object';
    if (!j || (!Array.isArray(j.auctions) && !vacia)) return { estado: 'error' };
    const subastas = [];
    for (const a of vacia ? [] : j.auctions) {
      const s = normalizar(a);
      if (s) subastas.push(s);
    }
    const hora = cabecera(r.res, 'last-modified');
    return hora ? { estado: 'nueva', hora, subastas } : { estado: 'nueva', subastas };
  }

  // Objetos: `buyout` es el total del lote; sin buyout (solo puja) no hay precio y se salta.
  const deObjetos = (a) => {
    const cantidad = Number(a?.quantity);
    const buyout = Number(a?.buyout);
    if (!(buyout > 0) || !(cantidad > 0) || a?.item?.id == null) return null;
    return { id: a.id, item: a.item.id, cantidad, precio: buyout / cantidad, tiempo: a.time_left };
  };
  const deMercancias = (a) => {
    const cantidad = Number(a?.quantity);
    const precio = Number(a?.unit_price);
    if (!(precio > 0) || !(cantidad > 0) || a?.item?.id == null) return null;
    return { id: a.id, item: a.item.id, cantidad, precio, tiempo: a.time_left };
  };

  // Error con código y sin secretos: SIN_CREDENCIALES (no hay o no valen) o TEMPORAL (red, 429, 5xx, JSON roto).
  const fallo = (codigo, texto) => Object.assign(new Error(texto), { code: codigo });

  // Datos estáticos: el JSON, o null SOLO si Blizzard dice 404. Cualquier otro fallo lanza, para que quien guarda los
  // «no existe» (objetos.mjs) no apunte como inexistente algo que solo falló un momento.
  async function estaticoJson(ruta) {
    const r = await pedir(ruta, estatico, { maxBytes: MAX_FICHA, tiempoMax: TIEMPO_FICHA_MS });
    if (r.sc) throw fallo('SIN_CREDENCIALES', 'sin credenciales de Blizzard válidas');
    if (r.error) throw fallo('TEMPORAL', 'no se pudo hablar con Blizzard');
    if (r.res.estado === 404) return null;
    if (r.res.estado !== 200) throw fallo('TEMPORAL', `Blizzard respondió ${r.res.estado}`);
    const j = leerJson(r.res);
    if (j === undefined || j === null) throw fallo('TEMPORAL', 'respuesta de Blizzard que no es JSON');
    return j;
  }

  return {
    subastas: (casa, { desde }: { desde?: any; } = {}) => foto(`/data/wow/ruleset/${RULESET}/auctions/${encodeURIComponent(casa)}`, desde, deObjetos),
    mercancias: (casa, { desde }: { desde?: any; } = {}) => foto(`/data/wow/ruleset/${RULESET}/auctions/${encodeURIComponent(casa)}/commodities`, desde, deMercancias),

    async objeto(id) {
      const j = await estaticoJson(`/data/wow/item/${encodeURIComponent(id)}`);
      if (!j || j.id == null) return null;
      return {
        id: j.id,
        nombre: aTexto(j.name),
        // el tipo (COMMON, UNCOMMON…) no cambia con el idioma; el nombre sí
        calidad: aTexto(j.quality?.type ?? j.quality?.name),
        clase: aTexto(j.item_class?.name),
        subclase: aTexto(j.item_subclass?.name),
        precioVendedor: Number(j.sell_price) || 0,
      };
    },

    indiceZonasMision: () => estaticoJson('/data/wow/quest/area/index'),
    misionesDeZona: (zona) => estaticoJson(`/data/wow/quest/area/${encodeURIComponent(zona)}`),
    mision: (id) => estaticoJson(`/data/wow/quest/${encodeURIComponent(id)}`),
  };
}
