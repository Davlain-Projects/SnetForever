// Lote A, ronda 1 (Minor 3 de la revisión del lote A): el conversor decide qué elementos detienen un paso
// (tools/conversor/src/rxp/bloqueo.js, `puedeBloquear`) con una copia a mano de los evaluadores del addon. Esta
// prueba cruza las dos cosas con los datos reales: cada forma de elemento que el conversor da por bloqueante nunca da
// «info» en el addon (ni sin la API que mide su condición), y la que no da por bloqueante nunca da «pendiente».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nuevaMaquina, sinErrores } from './ayuda.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BLOQUEO_JS = join(RAIZ, 'tools', 'conversor', 'src', 'rxp', 'bloqueo.js');
const TOC_RUTAS = join(RAIZ, 'addons', 'SnetForever_Rutas', 'SnetForever_Rutas.toc');
const TOC_MISIONES = join(RAIZ, 'addons', 'SnetForever_Misiones', 'SnetForever_Misiones.toc');
const opciones = { skip: existsSync(TOC_RUTAS) ? false : 'no está addons/SnetForever_Rutas (la fase 1 no se ha generado)' };

// Una muestra de cada forma de elemento de los datos (t, efecto, con o sin texto, modo, info, sinCasilla) con los
// resultados que da el addon al evaluarlos todos en el estado inicial del banco.
const FORMAS = `(function()
  local E = SnetForever.Elementos
  local formas, orden = {}, {}
  local function forma(el)
    return table.concat({el.t, tostring(el.efecto), el.texto and "texto" or "-", tostring(el.modo),
      el.info and "info" or "-", el.sinCasilla and "sinCasilla" or "-"}, "|")
  end
  for _, tabla in ipairs({SNF_RUTAS.guias, SNF_MISIONES.guias or {}}) do
    for _, guia in pairs(tabla) do
      for _, paso in ipairs(guia.pasos) do
        for _, el in ipairs(paso.elementos) do
          local k = forma(el)
          local f = formas[k]
          if not f then
            f = {muestra = el, resultados = {}}
            formas[k] = f
            orden[#orden + 1] = k
          end
          f.resultados[(E.evaluar(el, {}))] = true
        end
      end
    end
  end
  local salida = {}
  for _, k in ipairs(orden) do
    local r = {}
    for nombre in pairs(formas[k].resultados) do r[#r + 1] = nombre end
    table.sort(r)
    salida[#salida + 1] = {forma = k, muestra = formas[k].muestra, resultados = r}
  end
  return salida
end)()`;

// Las API que, si faltan, hacen que un evaluador no pueda medir: la charla, las auras y las profesiones. (El nombre de un
// área que el cliente aún no da ya sale en el estado inicial del banco: C_Map.GetAreaInfo da nil.)
const SIN_API = ['C_GossipInfo', 'C_UnitAuras', 'GetSkillLineInfo', 'C_SkillInfo'];

function desajustes(m, puedeBloquear) {
  const fallos = [];
  for (const { forma, muestra, resultados } of m.lua(FORMAS)) {
    const bloquea = puedeBloquear(muestra);
    if (bloquea && resultados.includes('info')) fallos.push(`${forma}: el conversor la da por bloqueante y el addon da «info»`);
    if (!bloquea && resultados.includes('pendiente')) fallos.push(`${forma}: el conversor no la da por bloqueante y el addon da «pendiente»`);
  }
  return fallos;
}

test('lote A, ronda 1: puedeBloquear del conversor y los evaluadores del addon coinciden en los datos reales', opciones, async () => {
  const { puedeBloquear } = await import(pathToFileURL(BLOQUEO_JS).href);
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES] });
  assert.deepEqual(desajustes(m, puedeBloquear), []);
  sinErrores(m);
});

test('lote A, ronda 1: también sin las API que miden la charla, las auras y las profesiones', opciones, async () => {
  const { puedeBloquear } = await import(pathToFileURL(BLOQUEO_JS).href);
  const m = nuevaMaquina({ datos: [TOC_RUTAS, TOC_MISIONES], sinApi: SIN_API });
  assert.deepEqual(desajustes(m, puedeBloquear), []);
  sinErrores(m);
});

test('lote A, ronda 1: los tipos informativos del addon no bloquean para el conversor', async () => {
  const { puedeBloquear } = await import(pathToFileURL(BLOQUEO_JS).href);
  const m = nuevaMaquina();
  const informativos = m.lua(`(function()
    local t = {}
    for nombre in pairs(SnetForever.Elementos.INFORMATIVOS) do
      if not SnetForever.Elementos.def(nombre) then t[#t + 1] = nombre end
    end
    table.sort(t)
    return t
  end)()`);
  assert.ok(informativos.length > 10, informativos.join(', '));
  assert.deepEqual(informativos.filter((t) => puedeBloquear({ t, texto: { en: 'x' } })), []);
  sinErrores(m);
});
