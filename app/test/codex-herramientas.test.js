// 22-nov (un amigo con Codex: «no puedo consultar el repositorio»): Codex recibe las herramientas de guías que solo leen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argumentos, resumenEventos, mcpUsable } from '../src/codex.mjs';
import { mcpCodex, HERRAMIENTAS, HERRAMIENTAS_LECTURA, SERVIDOR, SOLO_LECTURA } from '../src/herramientas/config.mjs';
import { preguntar } from '../src/motor.mjs';

const OPCIONES = new Set(['--sandbox', '--output-last-message', '--config', '--ignore-user-config', '--ignore-rules', '--disable', '--json', '--skip-git-repo-check', '--ephemeral', '--color']);
const base = { modelo: 'rapido', salidaArchivo: 'C:\\s\\o.txt', config: {}, herramientas: ['shell_tool'] };
const mcp = { command: 'C:\\app\\node.exe', args: ['C:\\app\\servidor.mjs', '--datos', 'C:\\mis datos', SOLO_LECTURA], nombres: HERRAMIENTAS_LECTURA };
const valor = (a, prefijo) => a.find((x) => x.startsWith(prefijo));

test('sin mcp los argumentos no llevan servidor ni --json', () => {
  const a = argumentos(OPCIONES, base);
  assert.ok(a.includes('mcp_servers={}'));
  assert.equal(a.some((x) => x.startsWith('mcp_servers.')), false);
  assert.equal(a.includes('--json'), false);
  assert.ok(a.includes('model_reasoning_effort=low'));
});

test('con mcp va solo nuestro servidor, aprobado, con las herramientas que leen', () => {
  const a = argumentos(OPCIONES, { ...base, mcp });
  assert.ok(a.indexOf('mcp_servers={}') < a.indexOf(valor(a, 'mcp_servers.snetforever.command=')));
  assert.equal(valor(a, 'mcp_servers.snetforever.command='), "mcp_servers.snetforever.command='C:\\app\\node.exe'");
  assert.equal(valor(a, 'mcp_servers.snetforever.args='), "mcp_servers.snetforever.args=['C:\\app\\servidor.mjs','--datos','C:\\mis datos','--solo-lectura']");
  assert.ok(a.includes('mcp_servers.snetforever.default_tools_approval_mode=approve'));
  const activas = valor(a, 'mcp_servers.snetforever.enabled_tools=');
  for (const h of HERRAMIENTAS_LECTURA) assert.ok(activas.includes(`'${h}'`));
  assert.equal(activas.includes('guardar_guia'), false);
  assert.ok(a.includes('--json'));
  assert.ok(a.includes('--sandbox') && a.includes('read-only'));
  assert.ok(a.includes('model_reasoning_effort=medium'));
  assert.ok(a.includes('--disable') && a.includes('shell_tool'));
});

test('mcpCodex: el servidor con --solo-lectura y sin guardar_guia', () => {
  const m = mcpCodex('C:\\datos', { node: 'n.exe', servidor: 's.mjs' });
  assert.deepEqual(m.args, ['s.mjs', '--datos', 'C:\\datos', '--solo-lectura']);
  assert.equal(m.command, 'n.exe');
  assert.equal(m.nombres.includes('guardar_guia'), false);
  assert.equal(m.nombres.length, HERRAMIENTAS.length - 1);
});

test('mcpUsable: una comilla simple, o un carácter peligroso con codex.cmd, deja la pregunta sin herramientas', () => {
  assert.equal(mcpUsable({ tipo: 'exe' }, mcp), true);
  assert.equal(mcpUsable({ tipo: 'exe' }, { ...mcp, args: ["C:\\O'Brien\\s.mjs"] }), false);
  assert.equal(mcpUsable({ tipo: 'cmd' }, { ...mcp, args: ['C:\\a&b\\s.mjs'] }), false);
  assert.equal(mcpUsable({ tipo: 'exe' }, { ...mcp, args: ['C:\\a&b\\s.mjs'] }), true);
});

const evento = (item) => JSON.stringify({ type: 'item.completed', item });
test('resumenEventos: cuenta las llamadas a nuestro servidor y detecta cuando no pudo usarlas', () => {
  const bien = [evento({ type: 'mcp_tool_call', server: 'snetforever', tool: 'mision', status: 'completed' }), 'no es json'].join('\n');
  assert.deepEqual(resumenEventos(bien), { usadas: 1, mcpFallo: false });
  const denegada = evento({ type: 'mcp_tool_call', server: 'snetforever', tool: 'mision', status: 'failed' });
  assert.deepEqual(resumenEventos(denegada), { usadas: 0, mcpFallo: true });
  const arranque = evento({ type: 'error', message: 'MCP client for `snetforever` failed to start' });
  assert.deepEqual(resumenEventos(arranque), { usadas: 0, mcpFallo: true });
  const ajena = evento({ type: 'error', message: 'failed to load skill' });
  assert.deepEqual(resumenEventos(ajena), { usadas: 0, mcpFallo: false });
  assert.deepEqual(resumenEventos(`${denegada}\n${bien}`), { usadas: 1, mcpFallo: false });
});

test('motor: a Codex le llega el mcp y a Claude sus herramientas', async () => {
  const visto = {};
  const modulos = {
    codex: { preguntar: async (_c, o) => { visto.codex = o; return { ok: true, texto: 'x', ms: 1 }; } },
    claude: { preguntar: async (_c, o) => { visto.claude = o; return { ok: true, texto: 'x', ms: 1 }; } },
  };
  const comun = { iaModelo: 'haiku', sistema: 's', entrada: 'e', programas: { claude: {}, codex: {} }, modulos };
  await preguntar({ ...comun, config: { motor: 'codex' }, estados: { claude: { estado: 'sin_instalar' }, codex: { estado: 'ok' } }, herramientas: { mcp } });
  assert.deepEqual(visto.codex.mcp, mcp);
  assert.equal(visto.codex.herramientas, undefined);
  const paraClaude = { mcpConfig: 'c.json', nombres: HERRAMIENTAS };
  await preguntar({ ...comun, config: { motor: 'claude' }, estados: { claude: { estado: 'ok' }, codex: { estado: 'sin_instalar' } }, herramientas: paraClaude });
  assert.deepEqual(visto.claude.herramientas, paraClaude);
  assert.equal(visto.claude.mcp, undefined);
});

function listar(extra) {
  const datos = mkdtempSync(join(tmpdir(), 'snf-mcp-'));
  return new Promise((resolver, rechazar) => {
    const p = spawn(process.execPath, [SERVIDOR, '--datos', datos, ...extra], { stdio: ['pipe', 'pipe', 'ignore'] });
    let salida = '';
    const reloj = setTimeout(() => { p.kill(); rechazar(new Error('sin respuesta')); }, 15000);
    p.stdout.on('data', (d) => {
      salida += d;
      const linea = salida.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((o) => o?.id === 2);
      if (linea) { clearTimeout(reloj); p.kill(); resolver(linea.result.tools.map((t) => t.name)); }
    });
    p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } } })}\n`);
    p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  });
}

test('el servidor real con --solo-lectura no anuncia guardar_guia; sin la opción, sí', async () => {
  const lectura = await listar([SOLO_LECTURA]);
  assert.deepEqual([...lectura].sort(), [...HERRAMIENTAS_LECTURA].sort());
  const todas = await listar([]);
  assert.ok(todas.includes('guardar_guia'));
});
