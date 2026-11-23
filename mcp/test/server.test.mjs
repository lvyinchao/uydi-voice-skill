import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const entry = fileURLToPath(new URL('../server.mjs', import.meta.url));
const audioUrl = '/api/v1/audio/tts/test-user/utterance-1.wav';

test('stdio tools use the authenticated API and write validated WAVs', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'uydi-mcp-test-'));
  t.after(() => rm(scratch, { force: true, recursive: true }));
  const wav = Buffer.from('524946462600000057415645666d74201000000001000100c05d000080bb00000200100064617461020000000000', 'hex');
  const calls = [];
  const api = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = Buffer.concat(chunks).toString();
    calls.push({ path: req.url, token: req.headers.authorization, key: req.headers['idempotency-key'], body });
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.authorization !== 'Bearer fixture-token') return json({ error: 'Invalid token' }, 401);
    const url = new URL(req.url, 'http://127.0.0.1');
    switch (url.pathname) {
      case '/api/v1/credits': return json({ balance: 100, plan: 'free', pricing: { ttsUnitChars: 10 }, ledger: ['private detail'] });
      case '/api/v1/system-voices': return json({ voices: [{ id: 'voice-en' }], nextCursor: 1 });
      case '/api/v1/voices': return json({ error: 'Missing scope' }, 403);
      case '/api/v1/synthesize': return json({ status: 'pending' }, 202);
      case '/api/v1/operations/synthesize/retry-key': return json({ status: 'completed', response: { synthesis: { audioUrl } } });
      case '/api/v1/syntheses': return json({ syntheses: [{ audioUrl }, { audioUrl }] });
      case audioUrl: res.writeHead(200, { 'Content-Type': 'audio/wav' }); return res.end(wav);
      case '/api/v1/audio/tts/test-user/broken.wav': return res.end(wav.subarray(0, 45));
      case '/api/v1/audio/tts/test-user/moved.wav': res.writeHead(302, { Location: '/must-not-follow' }); return res.end();
      default: return json({ error: 'Unexpected path' }, 404);
    }
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => api.close(resolve)));
  const origin = 'http://127.0.0.1:' + api.address().port;
  const config = join(scratch, 'config');
  const output = join(scratch, 'output');
  await mkdir(config);
  const credentials = join(config, 'credentials.json');
  await writeFile(credentials, JSON.stringify({ baseUrl: origin, accessToken: 'fixture-token' }));
  async function connect(overrides = {}) {
    const client = new Client({ name: 'uydi-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry],
      env: { UYDI_BASE_URL: origin, UYDI_CONFIG_DIR: config, UYDI_OUTPUT_DIR: output, ...overrides } }));
    t.after(() => client.close());
    return client;
  }
  const client = await connect();
  const definitions = (await client.listTools()).tools;
  assert.equal(definitions.length, 7);
  assert.equal(definitions.find(tool => tool.name === 'uydi_synthesize').annotations.readOnlyHint, false);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name: 'uydi_' + name, arguments: args });
    assert.ok(!result.isError, result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  assert.deepEqual(await call('credits'), { balance: 100, plan: 'free', pricing: { ttsUnitChars: 10 } });
  await call('find_voices', { search: 'warm & calm', language: 'en', limit: 1, cursor: 2 });
  const query = new URL(calls.at(-1).path, origin).searchParams;
  assert.equal(query.get('search'), 'warm & calm');
  assert.equal(query.get('cursor'), '2');
  const denied = await client.callTool({ name: 'uydi_my_voices', arguments: {} });
  assert.ok(denied.isError);
  assert.match(denied.content[0].text, /permission/);
  const args = { text: 'Hello', voiceId: 'voice-en', voiceType: 'system', language: 'en', idempotencyKey: 'retry-key' };
  assert.equal((await call('synthesize', args)).status, 'pending');
  assert.equal(calls.at(-1).key, 'retry-key');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { text: 'Hello', voiceId: 'voice-en', voiceType: 'system', language: 'en' });
  assert.equal((await call('synthesis_status', { idempotencyKey: 'retry-key' })).response.synthesis.audioUrl, audioUrl);
  assert.equal((await call('history', { limit: 1 })).syntheses.length, 1);
  const saved = await call('download_wav', { audioUrl });
  assert.equal(saved.bytes, wav.length);
  assert.deepEqual(await readFile(saved.file), wav);
  for (const path of ['broken.wav', 'moved.wav']) {
    const result = await client.callTool({ name: 'uydi_download_wav', arguments: { audioUrl: audioUrl.replace('utterance-1.wav', path) } });
    assert.ok(result.isError);
  }
  assert.equal((await readdir(output)).length, 1);
  const before = calls.length;
  for (const path of ['https://example.org/tts.wav', '../outside.wav', '/api/v1/audio/tts/../foo.wav']) {
    const result = await client.callTool({ name: 'uydi_download_wav', arguments: { audioUrl: path } });
    assert.ok(result.isError);
  }
  assert.equal(calls.length, before);
  assert.ok(calls.every(call => call.token === 'Bearer fixture-token' && call.path !== '/must-not-follow'));
  const invalid = await connect({ UYDI_API_TOKEN: 'wrong-fixture-token' });
  const expired = await invalid.callTool({ name: 'uydi_credits', arguments: {} });
  assert.ok(expired.isError);
  assert.doesNotMatch(expired.content[0].text, /wrong-fixture-token/);
  await writeFile(credentials, JSON.stringify({ baseUrl: 'https://uydi.com', accessToken: 'other-token' }));
  const previous = calls.length;
  assert.ok((await client.callTool({ name: 'uydi_credits', arguments: {} })).isError);
  assert.equal(calls.length, previous);
});
