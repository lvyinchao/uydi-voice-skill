#!/usr/bin/env node
/**
 * Uydi Voice CLI — 零依赖（Node 18+，仅内置模块 + 全局 fetch/FormData/Blob）。
 * 通过 OAuth（授权码 + PKCE，降级设备码流）登录 Uydi，之后用 Bearer token 调用全部 API。
 *
 * 用法：node uydi.mjs <command> [options]，详见 SKILL.md 或 `node uydi.mjs help`。
 */
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const BASE_URL = (process.env.UYDI_BASE_URL || 'https://uydi.com').replace(/\/+$/, '');
const CLIENT_ID = 'uydi-skill';
const CRED_DIR = join(homedir(), '.uydi');
const CRED_FILE = join(CRED_DIR, 'credentials.json');
const CALLBACK_TIMEOUT_MS = 120_000;

// ---------- 凭证存取 ----------

function loadToken() {
  try {
    const data = JSON.parse(readFileSync(CRED_FILE, 'utf8'));
    if (data.baseUrl === BASE_URL && data.accessToken) return data.accessToken;
  } catch {}
  return null;
}

function saveToken(accessToken) {
  mkdirSync(CRED_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(
    CRED_FILE,
    JSON.stringify({ baseUrl: BASE_URL, accessToken, savedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 }
  );
}

// ---------- HTTP 封装 ----------

async function api(path, { method = 'GET', json, form, raw = false, auth = true, idempotencyKey } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth) {
    const token = loadToken();
    if (!token) fail('Not logged in. Run: node uydi.mjs login');
    headers.Authorization = `Bearer ${token}`;
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    body = form; // FormData 由 fetch 自动设置 Content-Type
  }
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  if (res.status === 401) fail('Session expired or token revoked. Run: node uydi.mjs login');
  if (raw) {
    if (!res.ok) fail(`Request failed (HTTP ${res.status})`);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// ---------- 参数解析 ----------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && !(next.startsWith('-') && next.length === 2)) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (a === '-o') {
      args.output = argv[++i];
    } else {
      args._.push(a);
    }
  }
  return args;
}

// ---------- OAuth 登录 ----------

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { shell: process.platform === 'win32', stdio: 'ignore', detached: true }).unref();
  } catch {}
}

/** 授权码 + PKCE：本地起 loopback server 接收回调 */
async function loginPkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));

  const { server, port } = await new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => res({ server: srv, port: srv.address().port }));
  });
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('Opening your browser to authorize. If it does not open automatically, visit:\n');
  console.log(`  ${authUrl.toString()}\n`);
  openBrowser(authUrl.toString());

  const code = await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      server.close();
      rejectPromise(new Error('timeout'));
    }, CALLBACK_TIMEOUT_MS);
    server.on('request', (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const gotCode = url.searchParams.get('code');
      const gotState = url.searchParams.get('state');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (err || !gotCode || gotState !== state) {
        res.end('<h3>Authorization failed. You can close this tab.</h3>');
        clearTimeout(timer);
        server.close();
        rejectPromise(new Error(err || 'invalid callback'));
      } else {
        res.end('<h3>Authorized! You can close this tab and return to the terminal.</h3>');
        clearTimeout(timer);
        server.close();
        resolvePromise(gotCode);
      }
    });
  });

  const token = await api('/api/oauth/token', {
    method: 'POST',
    auth: false,
    json: {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    },
  });
  return token.access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 设备授权流（RFC 8628）：终端出码，浏览器批准，本地轮询 */
async function loginDevice() {
  const dc = await api('/api/oauth/device/code', {
    method: 'POST',
    auth: false,
    json: { client_id: CLIENT_ID },
  });
  console.log('Open the URL below in a browser and enter the device code to authorize:\n');
  console.log(`  URL:  ${dc.verification_uri}`);
  console.log(`  Code: ${dc.user_code}\n`);
  console.log(`(or open ${dc.verification_uri_complete} directly)\nWaiting for authorization…`);
  openBrowser(dc.verification_uri_complete);

  let interval = (dc.interval || 5) * 1000;
  const deadline = Date.now() + dc.expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const res = await fetch(`${BASE_URL}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: CLIENT_ID,
        device_code: dc.device_code,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data.access_token;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (data.error === 'access_denied') fail('Authorization denied by the user');
    if (data.error === 'expired_token') break;
    fail(data.error || 'Device code polling failed');
  }
  fail('Device code expired. Run login again');
}

async function cmdLogin(args) {
  let accessToken = null;
  if (!args.device) {
    try {
      accessToken = await loginPkce();
    } catch (err) {
      console.log(`\nBrowser authorization not completed (${err.message}); falling back to device code flow…\n`);
    }
  }
  if (!accessToken) accessToken = await loginDevice();
  saveToken(accessToken);
  const { user } = await api('/api/auth/me');
  console.log(`\n✅ Logged in as ${user.email} (token saved to ${CRED_FILE})`);
}

async function cmdLogout() {
  const token = loadToken();
  if (token) {
    await fetch(`${BASE_URL}/api/oauth/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  if (existsSync(CRED_FILE)) rmSync(CRED_FILE);
  console.log('Logged out: token revoked and local credentials removed');
}

// ---------- 业务命令 ----------

async function cmdWhoami() {
  const { user } = await api('/api/auth/me');
  console.log(JSON.stringify(user, null, 2));
}

async function cmdCredits() {
  const c = await api('/api/credits');
  console.log(`Plan: ${c.plan}    Balance: ${c.balance} credits`);
  console.log(
    `Pricing: design=${c.pricing.design}, clone=${c.pricing.clone}, tts=1 credit / ${c.pricing.ttsUnitChars} chars`
  );
}

const fmtTime = (ts) => new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19);

async function cmdVoices() {
  const { voices } = await api('/api/voices');
  if (!voices.length) {
    console.log('(no voices yet — create one with design or clone)');
    return;
  }
  for (const v of voices) {
    console.log(`${v.id}  [${v.kind}/${v.provider}]  ${v.name}  (${v.status}, ${fmtTime(v.createdAt)})`);
  }
}

async function cmdDeleteVoice(args) {
  const id = args._[0];
  if (!id) fail('Usage: delete-voice <voiceId>');
  await api(`/api/voices/${id}`, { method: 'DELETE' });
  console.log(`Deleted voice ${id}`);
}

/** 用 Bearer 下载站内音频（如 /api/audio/xxx）到本地文件 */
async function downloadAudio(urlPath, outPath) {
  const res = await api(urlPath, { raw: true });
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  console.log(`Audio saved: ${resolve(outPath)}`);
}

async function cmdDesign(args) {
  if (!args.name || !args.prompt || !args['preview-text']) {
    fail('Usage: design --name <name> --prompt <voice description> --preview-text <text> [--provider qwen|cosyvoice] [-o preview.wav]');
  }
  console.log('Designing voice (takes ~10-30s, consumes credits)…');
  const { voice } = await api('/api/voices/design', {
    method: 'POST',
    json: {
      provider: args.provider || 'qwen',
      name: args.name,
      voicePrompt: args.prompt,
      previewText: args['preview-text'],
    },
  });
  console.log(`✅ Voice created: ${voice.id} (${voice.name})`);
  if (args.output && voice.previewUrl) await downloadAudio(voice.previewUrl, args.output);
}

async function cmdClone(args) {
  if (!args.name || !args.file) {
    fail('Usage: clone --name <name> --file <wav/mp3/m4a file> [--provider qwen|cosyvoice]');
  }
  if (!existsSync(args.file)) fail(`File not found: ${args.file}`);
  console.log('Uploading sample and cloning voice (takes ~10-60s, consumes credits)…');
  const form = new FormData();
  form.set('provider', args.provider || 'qwen');
  form.set('name', args.name);
  form.set('file', new Blob([readFileSync(args.file)]), basename(args.file));
  const { voice } = await api('/api/voices/clone', {
    method: 'POST',
    form,
    idempotencyKey: randomUUID(),
  });
  console.log(`✅ Voice cloned: ${voice.id} (${voice.name})`);
}

async function cmdTts(args) {
  if (!args.voice || !args.text) {
    fail('Usage: tts --voice <voiceId> --text "text to speak" -o out.wav');
  }
  const out = args.output || 'out.wav';
  console.log('Synthesizing speech (1 credit / 10 chars)…');
  const { synthesis } = await api('/api/synthesize', {
    method: 'POST',
    json: { voiceId: args.voice, text: args.text },
    idempotencyKey: randomUUID(),
  });
  console.log(`✅ Synthesis complete: ${synthesis.id} (${synthesis.chars} chars)`);
  await downloadAudio(synthesis.audioUrl, out);
}

async function cmdHistory(args) {
  const limit = Number(args.limit || 20);
  const { syntheses } = await api('/api/syntheses');
  if (!syntheses.length) {
    console.log('(no synthesis history yet)');
    return;
  }
  for (const s of syntheses.slice(0, limit)) {
    const text = s.text.length > 40 ? `${s.text.slice(0, 40)}…` : s.text;
    console.log(`${s.id}  [${s.voiceName}]  ${fmtTime(s.createdAt)}  "${text}"`);
  }
}

// ---------- 入口 ----------

const HELP = `Uydi Voice CLI — AI voice design / cloning / synthesis (${BASE_URL})

Usage: node uydi.mjs <command> [options]

  login [--device]        OAuth login (browser flow by default; --device forces device code flow)
  logout                  Revoke token and delete local credentials
  whoami                  Current account
  credits                 Credit balance and pricing
  voices                  List my voices
  delete-voice <id>       Delete a voice
  design --name <n> --prompt <desc> --preview-text <t> [--provider qwen|cosyvoice] [-o preview.wav]
  clone --name <n> --file <audio file> [--provider qwen|cosyvoice]
  tts --voice <voiceId> --text "text" -o out.wav
  history [--limit n]     Synthesis history

Env: UYDI_BASE_URL overrides the service URL (default https://uydi.com)`;

const COMMANDS = {
  login: cmdLogin,
  logout: cmdLogout,
  whoami: cmdWhoami,
  credits: cmdCredits,
  voices: cmdVoices,
  'delete-voice': cmdDeleteVoice,
  design: cmdDesign,
  clone: cmdClone,
  tts: cmdTts,
  history: cmdHistory,
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help') {
  console.log(HELP);
  process.exit(0);
}
const handler = COMMANDS[cmd];
if (!handler) {
  console.error(`Unknown command: ${cmd}\n`);
  console.log(HELP);
  process.exit(1);
}
handler(parseArgs(rest)).catch((err) => fail(err.message));
