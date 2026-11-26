// Source: app/typescript/src/comercio/casas.mts. Run npm run build:app to regenerate.
// Casas de subastas de Forever: cuáles hay, cuáles sigue el jugador y cómo descubrir cada una comparando lo que se ve en
// el juego con las fotos de Blizzard. Lógica pura: nada de red ni de disco.
//
// F7: se sigue cada casa que el jugador usa: la de cada facción en la que tiene personajes y la neutral. Ya no hay casa
// supuesta (antes se suponía la 114 de la Horda, la 111 de la Alianza y la 117 neutral en un reino «Normal»): ninguna casa
// se da por buena sin descubrirla con el escaneo del juego (`descubrir`, comparando sus muestras con las 5 candidatas de
// `CASAS[faccion]`). Una suposición nunca se usa como un dato.

// Las candidatas de cada bando (Aguasnegras es la neutral). Solo sirven para saber entre cuáles buscar al descubrir.
export const CASAS = {
  Alliance: [110, 111, 112, 119, 123],
  Horde: [113, 114, 115, 120, 124],
  Neutral: [116, 117, 118, 121, 125],
};

type Faction = keyof typeof CASAS;
type Identity = { reino?: string; faccion?: string } | null | undefined;
type KnownHouses = Readonly<Record<string, number | string | null | undefined>>;
type PriceSnapshot = Readonly<Record<string, Readonly<Record<string, number>>>>;
type HouseSnapshots = Map<number | string, PriceSnapshot> | Readonly<Record<string, PriceSnapshot>>;
type MatchCounts = { aciertos: number; total: number };
type HouseMatch = MatchCounts & { casa: number };

const BANDOS: Faction[] = ['Horde', 'Alliance', 'Neutral'];

// Casa de un bando en un reino: la descubierta (`conocidas`, clave "<reino>|<faccion>"; el valor puede llegar como texto
// desde SavedVariables), o null si aún no se sabe.
export function casaDe(identidad: Identity, conocidas?: KnownHouses | null): number | null {
  const { reino, faccion } = identidad ?? {};
  const crudo = conocidas?.[`${reino}|${faccion}`];
  const sabida = crudo == null || crudo === '' ? NaN : Number(crudo);
  return Number.isFinite(sabida) ? sabida : null;
}

// Las casas conocidas del reino: la del bando del personaje, la del otro bando y la neutral (sin repetir ni nulos). Sirve
// para comparar precios (la IA, otrasCasas); qué casas se bajan lo dice `casasSeguidas`.
export function casasDelReino(identidad: Identity, conocidas?: KnownHouses | null): number[] {
  const propio = identidad?.faccion;
  const orden = propio === 'Alliance' ? ['Alliance', 'Horde', 'Neutral']
    : propio === 'Neutral' ? ['Neutral', 'Horde', 'Alliance']
      : ['Horde', 'Alliance', 'Neutral'];
  const casas: number[] = [];
  for (const faccion of orden) {
    const c = casaDe({ ...identidad, faccion }, conocidas);
    if (c != null && !casas.includes(c)) casas.push(c);
  }
  return casas;
}

/**
 * F7: las casas que se siguen en un reino, solo las ya descubiertas: la del personaje en uso, la de cada otra facción con
 * personajes (`jugadas`, p. ej. ['Horde', 'Alliance']) y la neutral. La de una facción sin personajes no se baja nunca,
 * aunque se conozca.
 */
export function casasSeguidas(identidad: Identity, conocidas?: KnownHouses | null, jugadas: readonly string[] = []): number[] {
  const propio = identidad?.faccion;
  const facciones = (BANDOS as readonly (string | undefined)[]).includes(propio) ? [propio as Faction] : [];
  for (const f of ['Horde', 'Alliance'] as const) if (!facciones.includes(f) && jugadas.includes(f)) facciones.push(f);
  if (!facciones.includes('Neutral')) facciones.push('Neutral');
  const casas: number[] = [];
  for (const faccion of facciones) {
    const c = casaDe({ ...identidad, faccion }, conocidas);
    if (c != null && !casas.includes(c)) casas.push(c);
  }
  return casas;
}

/** F7: el bando de una casa en un reino según lo descubierto («Horde», «Alliance» o «Neutral»), o null. */
export function bandoDe(reino: string, casa: number, conocidas?: KnownHouses | null): Faction | null {
  for (const faccion of BANDOS) if (casaDe({ reino, faccion }, conocidas) === casa) return faccion;
  return null;
}

// Cuántos pares precio->cantidad iguales hay entre lo visto en el juego y una foto, y cuántos se pudieron comparar.
function comparar(escaneo: PriceSnapshot | null | undefined, foto: PriceSnapshot): MatchCounts {
  let aciertos = 0;
  let total = 0;
  for (const [item, precios] of Object.entries(escaneo ?? {})) {
    const deFoto = foto?.[item];
    if (!deFoto) continue;
    for (const [precio, cantidad] of Object.entries(precios)) {
      if (!(precio in deFoto)) continue;
      total += 1;
      if (deFoto[precio] === cantidad) aciertos += 1;
    }
  }
  return { aciertos, total };
}

// Descubre la casa del personaje: gana la foto con más pares iguales. Si la mejor no le saca al menos 3 a la
// segunda (o no acierta nada), no se fía y devuelve null.
export function descubrir(escaneo: PriceSnapshot | null | undefined, fotos?: HouseSnapshots | null): (HouseMatch & { segunda: number }) | null {
  const filas: HouseMatch[] = [];
  for (const [casa, foto] of fotos instanceof Map ? fotos : Object.entries(fotos ?? {})) {
    filas.push({ casa: Number(casa), ...comparar(escaneo, foto) });
  }
  filas.sort((a, b) => b.aciertos - a.aciertos);
  const [mejor, segunda] = filas;
  if (!mejor || mejor.aciertos === 0) return null;
  if (mejor.aciertos - (segunda?.aciertos ?? 0) < 3) return null;
  return { ...mejor, segunda: segunda?.aciertos ?? 0 };
}
