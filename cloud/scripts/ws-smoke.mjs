/**
 * Lightweight WS smoke: connect → auth → ping/pong → (optional) self-test prank.
 *
 * Usage:
 *   BASE=https://screenraid.app.lama-worlds.com \
 *   USER=alice PASS=secret \
 *   node scripts/ws-smoke.mjs
 */
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = (process.env.BASE || 'https://screenraid.app.lama-worlds.com').replace(/\/$/, '');
const USER = process.env.USER || process.env.SMOKE_USER;
const PASS = process.env.PASS || process.env.SMOKE_PASS;

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

async function login() {
  if (!USER || !PASS) fail('Set USER and PASS (or SMOKE_USER / SMOKE_PASS)');
  const res = await fetch(`${BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`login ${res.status}: ${JSON.stringify(body)}`);
  if (!body.access_token) fail('login missing access_token');
  ok('login');
  return body.access_token;
}

function wsUrl() {
  if (BASE.startsWith('https://')) return BASE.replace(/^https/, 'wss') + '/v1/ws';
  return BASE.replace(/^http/, 'ws') + '/v1/ws';
}

async function wsRoundtrip(token) {
  const url = wsUrl();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let connected = false;
    let ponged = false;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout waiting for WS handshake / pong'));
    }, 15_000);

    ws.addEventListener('open', () => {
      ok(`ws open ${url}`);
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', payload: { token }, timestamp: new Date().toISOString() }));
        return;
      }
      if (msg.type === 'connected') {
        connected = true;
        ok(`ws connected user=${msg.payload?.user_id}`);
        ws.send(JSON.stringify({ type: 'ping', payload: {}, timestamp: new Date().toISOString() }));
        return;
      }
      if (msg.type === 'pong') {
        ponged = true;
        ok('pong');
        clearTimeout(timer);
        ws.close();
        resolve({ connected, ponged });
        return;
      }
      if (msg.type === 'auth_failed') {
        clearTimeout(timer);
        reject(new Error(`auth_failed: ${JSON.stringify(msg.payload)}`));
      }
    });

    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('ws error'));
    });
  });
}

async function selfTestPrank(token) {
  const res = await fetch(`${BASE}/v1/pranks/self-test`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target_id: null,
      media_id: null,
      overlay_type: 'text',
      text_content: 'WS smoke self-test',
      duration_ms: 1500,
      config: {
        animation: 'fade',
        position: { monitor_index: 0, x: 0.5, y: 0.5, preset: 'exact' },
        scale: 1,
        opacity: 0.9,
        volume: 0.5,
        sfx: 'none',
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`self-test ${res.status}: ${JSON.stringify(body)}`);
  ok(`self-test prank id=${body.id}`);
}

async function main() {
  const health = await fetch(`${BASE}/v1/health`);
  if (!health.ok) fail(`health ${health.status}`);
  ok('health');

  const token = await login();
  await wsRoundtrip(token);
  await selfTestPrank(token);
  await sleep(200);
  ok('smoke complete');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
