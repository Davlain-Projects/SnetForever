// Ayudas comunes de las pruebas del banco: máquina por defecto, comprobación de errores y guías de prueba.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearMaquina } from '../src/maquina.js';

// Pasada de solo núcleo (0.7.0): con SNF_SIN_COMERCIO=1 (npm run test:nucleo) el banco no carga SnetForever_Comercio
// (como si su carpeta no estuviera instalada). Las pruebas que necesitan el comercio se saltan de forma explícita, con
// este motivo, y salen como «skipped» en el resumen: ni fallos ni «pass» falsos.
export const SIN_COMERCIO = process.env.SNF_SIN_COMERCIO === '1';
export const MOTIVO_COMERCIO = 'necesita SnetForever_Comercio';

// Opciones de node:test para una prueba suelta que necesita el comercio: test(nombre, necesitaComercio, fn).
export const necesitaComercio = { skip: SIN_COMERCIO ? MOTIVO_COMERCIO : false };

// `test` para los archivos en los que TODAS las pruebas necesitan el comercio (import { testConComercio as test }).
export function testConComercio(nombre, opciones, fn) {
  if (typeof opciones === 'function') {
    fn = opciones;
    opciones = {};
  }
  return test(nombre, { ...opciones, skip: SIN_COMERCIO ? MOTIVO_COMERCIO : opciones.skip }, fn);
}

// Máquina con el addon y los datos mini (los valores por defecto de crearMaquina).
export function nuevaMaquina(opciones = {}) {
  return crearMaquina(opciones);
}

// The detailed step list is opened explicitly from the field guide.
export function withGuideDetails(options = {}) {
  const saved = options.guardado || {};
  const character = saved.SnetForeverPJ || {};
  return nuevaMaquina({
    ...options,
    guardado: { ...saved, SnetForeverPJ: {
      ...character, ajustes: { ...character.ajustes, 'guide.details': true },
    } },
  });
}

// Ningún error ha llegado a geterrorhandler(). Si los hay, el fallo enseña las trazas.
export function sinErrores(m) {
  const errores = m.errores();
  if (errores.length > 0) {
    const trazas = m.lua('BANCO.trazas') || [];
    assert.fail(`Errores de Lua en el banco:\n${trazas.join('\n\n')}`);
  }
}

// Globales que el addon puede crear (restricciones globales del plan).
const GLOBALES_PERMITIDAS = new Set(['SnetForever', 'SnetForeverCuenta', 'SnetForeverPJ', 'SLASH_SNET1', 'SLASH_SNET2', 'SNF_BUZON', 'SNF_PRECIOS']);

export function globalPermitida(nombre) {
  return GLOBALES_PERMITIDAS.has(nombre) || nombre.startsWith('SnetForever')
    || nombre === 'BINDING_HEADER_SNETFOREVER_GUIAS' || /^BINDING_NAME_CLICK SnetForever(Objetivo|ObjetoActivo)\d+:LeftButton$/.test(nombre)
    || nombre === 'BINDING_NAME_CLICK SnetForeverObjetivosTodos:LeftButton';
}

// Una guía con el formato de la fase 1 a partir de pasos parciales ({elementos, filtro?, etiquetas?, requisitos?, ...}).
// Rellena id, n, etiquetas, requisitos y las líneas; `campos` cambia los de la guía.
export function guiaDePrueba(pasos, campos = {}) {
  let linea = 1;
  const completos = pasos.map((paso, i) => {
    const lineaPaso = linea++;
    const elementos = (paso.elementos || []).map((e) => ({ linea: linea++, ...e }));
    return {
      id: `p${i + 1}`,
      n: i + 1,
      etiquetas: {},
      requisitos: [],
      linea: lineaPaso,
      ...paso,
      elementos,
    };
  });
  return {
    clave: 'Prueba\\01-60 Guía de prueba',
    grupo: 'Prueba',
    nombre: '01-60 Guía de prueba',
    titulo: { en: '1-60 Test guide', es: '1-60 Guía de prueba' },
    niveles: [1, 60],
    siguientes: [],
    tipo: 'normal',
    fuente: { archivo: 'test/ayuda.js', linea: 1 },
    mazmorras: {},
    ...campos,
    pasos: completos,
  };
}
