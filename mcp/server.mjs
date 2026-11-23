#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const base = new URL(process.env.UYDI_BASE_URL || 'https://uydi.com');
const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(base.hostname);
if ((base.protocol !== 'https:' && !(loopback && base.protocol === 'http:')) ||
    base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('UYDI_BASE_URL must be an HTTPS origin or a local development server.');
}
const credentialsFile = join(process.env.UYDI_CONFIG_DIR || join(homedir(), '.uydi'), 'credentials.json');
const outputDirectory = resolve(process.env.UYDI_OUTPUT_DIR || join(homedir(), 'Downloads', 'Uydi'));
const language = z.enum(['zh', 'en', 'ja', 'ko', 'fr', 'de', 'ru', 'pt', 'th', 'id', 'vi', 'es', 'it', 'ms', 'fil', 'ar']);
const key = z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/).describe('A stable key saved for this request. Reuse it on retries with exactly the same arguments.');
const recording = z.string().regex(/^\/api\/v1\/audio\/tts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.wav$/).describe('Copy the relative WAV audioUrl returned by Uydi synthesis or speech history.');
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

async function accessToken() {
  if (process.env.UYDI_API_TOKEN?.trim()) return process.env.UYDI_API_TOKEN.trim();
  try {
    const grant = JSON.parse(await readFile(credentialsFile, 'utf8'));
    if (grant.baseUrl === base.origin && typeof grant.accessToken === 'string' && grant.accessToken) return grant.accessToken;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Could not read the Uydi Skill sign-in. Sign in again or configure UYDI_API_TOKEN locally.');
  }
  throw new Error('Sign in with the Uydi Skill or set UYDI_API_TOKEN in the local MCP host.');
}

async function request(path, signal, { body, idempotencyKey, audio = false } = {}) {
  const headers = { Authorization: 'Bearer ' + await accessToken(), Accept: audio ? 'audio/wav' : 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(new URL(path, base), {
    method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body), redirect: 'error', signal,
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Uydi sign-in expired or the token is invalid. Sign in again or replace the local token.');
    if (response.status === 403) throw new Error('The Uydi account or token lacks permission. Check the required scope for this tool.');
    const detail = await response.json().catch(() => ({}));
    throw new Error('Uydi returned HTTP ' + response.status + (typeof detail.error === 'string' ? ': ' + detail.error : '.'));
  }
  return audio ? response : response.json();
}

async function saveWav(path, signal) {
  const response = await request(path, signal, { audio: true });
  if (!response.body) throw new Error('The recording has no audio data.');
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const filename = join(outputDirectory, randomUUID() + '.wav');
  const temporary = filename + '.part';
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal });
    const file = await open(temporary, 'r');
    let size;
    try {
      size = (await file.stat()).size;
      const header = Buffer.alloc(12);
      await file.read(header, 0, header.length, 0);
      if (size < 44 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE' ||
          header.readUInt32LE(4) + 8 > size) throw new Error('Uydi returned an incomplete or invalid WAV file.');
    } finally {
      await file.close();
    }
    await rename(temporary, filename);
    return { file: filename, bytes: size };
  } finally {
    await rm(temporary, { force: true });
  }
}

serveStdio(() => {
  const server = new McpServer({ name: 'uydi-voice', version: '1.4.0' }, { capabilities: { tools: {} } });
  function tool(name, description, inputSchema, run, annotations = readOnly) {
    server.registerTool(name, { description, inputSchema, annotations }, async (args, ctx) => {
      const timeout = AbortSignal.timeout(240_000);
      const signal = AbortSignal.any ? AbortSignal.any([ctx.mcpReq.signal, timeout]) : timeout;
      try {
        const result = await run(args, signal);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message || 'Uydi request failed.' }] };
      }
    });
  }

  tool('uydi_credits', 'Read the Uydi credit balance and speech pricing. Free. Requires account:read.', z.object({}), async (_, signal) => {
    const { balance, plan, pricing } = await request('/api/v1/credits', signal);
    return { balance, plan, pricing };
  });
  tool('uydi_find_voices', 'Search the system voice catalog. Use nextCursor for the next page. Requires voices:read.',
    z.object({ language: z.union([language, z.literal('all')]).default('all'), search: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(100).default(20), cursor: z.number().int().nonnegative().optional() }),
    (args, signal) => request('/api/v1/system-voices?' + new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)])), signal));
  tool('uydi_my_voices', 'List voices in the signed-in user’s library. Requires voices:read.', z.object({}),
    (_, signal) => request('/api/v1/voices', signal));
  tool('uydi_history', 'Read recent speech recordings and their audioUrl. Requires synthesis:read.',
    z.object({ limit: z.number().int().min(1).max(100).default(20) }), async ({ limit }, signal) => {
      const { syntheses } = await request('/api/v1/syntheses', signal);
      return { syntheses: syntheses.slice(0, limit) };
    });
  tool('uydi_synthesize', 'Generate speech using Uydi credits. Requires synthesis:write. Select a compatible language for the voice. Save the key before calling. After a timeout or pending result, call uydi_synthesis_status with that key.',
    z.object({ voiceId: z.string().min(1).max(160), voiceType: z.enum(['system', 'user']), language,
      text: z.string().trim().min(1).max(2000), idempotencyKey: key }),
    ({ idempotencyKey, ...body }, signal) => request('/api/v1/synthesize', signal, { body, idempotencyKey }),
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true });
  tool('uydi_synthesis_status', 'Recover the result of a previous speech request. Free. Requires synthesis:write.',
    z.object({ idempotencyKey: key }), ({ idempotencyKey }, signal) => request('/api/v1/operations/synthesize/' + encodeURIComponent(idempotencyKey), signal));
  tool('uydi_download_wav', 'Save a Uydi speech recording as a new WAV in the local Downloads/Uydi folder. Requires synthesis:read.',
    z.object({ audioUrl: recording }), ({ audioUrl }, signal) => saveWav(audioUrl, signal),
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
  return server;
});
