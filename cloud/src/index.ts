import { corsHeaders, empty, errorResponse, isOriginAllowed, json, securityHeaders, type Env } from './lib/http';
import { handleAuth } from './routes/auth';
import { handleRooms } from './routes/rooms';
import { handleFriends } from './routes/friends';
import { handleConsent } from './routes/consent';
import { handleMedia } from './routes/media';
import { handlePranks } from './routes/pranks';
import { handleMonitors } from './routes/monitors';
import { handleScheduled } from './routes/scheduled';
import { handleAdmin } from './routes/admin';
import { handleGifs } from './routes/gifs';
import { handleSecurityExtras } from './routes/securityExtras';
import { hubStub } from './lib/db';
import { fireDueScheduled } from './lib/prankDelivery';

export { WsHub } from './do/WsHub';

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';

  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin');
    if (origin && !isOriginAllowed(origin, env)) {
      return new Response(null, { status: 403 });
    }
    return empty(204, request, env);
  }

  if (path === '/health' || path === '/v1/health') {
    return json({ status: 'ok', backend: 'cloudflare' }, 200, request);
  }
  if (path === '/health/ready' || path === '/v1/health/ready') {
    try {
      await env.DB.prepare('SELECT 1').first();
      return json({ status: 'ready', backend: 'cloudflare' }, 200, request);
    } catch {
      return json({ status: 'not_ready' }, 503, request);
    }
  }

  if (path === '/v1/ws') {
    const stub = await hubStub(env);
    return stub.fetch(request);
  }

  const invitePreview = path.match(/^\/v1\/invites\/([^/]+)\/preview$/);
  if (invitePreview && request.method === 'GET') {
    const token = decodeURIComponent(invitePreview[1]!);
    const inv = await env.DB.prepare(
      `SELECT i.*, r.name AS room_name, u.username AS created_by_username,
              u.display_name AS created_by_display_name
       FROM room_invites i
       JOIN rooms r ON r.id = i.room_id
       JOIN users u ON u.id = i.created_by
       WHERE i.token = ?`,
    )
      .bind(token)
      .first();
    if (!inv) return json({ error: 'Not found' }, 404, request);
    return json(inv, 200, request);
  }

  const handlers = [
    handleAuth,
    handleSecurityExtras,
    handleScheduled,
    handlePranks,
    handleRooms,
    handleFriends,
    handleConsent,
    handleMedia,
    handleMonitors,
    handleGifs,
    handleAdmin,
  ];

  for (const handler of handlers) {
    const res = await handler(request, env, path);
    if (res) return res;
  }

  // SPA fallback via assets binding when configured
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return json({ error: 'Not found', path }, 404, request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const res = await route(request, env);
      // WebSocket upgrades (101 + webSocket) must be returned untouched —
      // reconstructing Response drops the socket and rejects status 101.
      if (res.webSocket) {
        return res;
      }
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(securityHeaders())) {
        if (!headers.has(k)) headers.set(k, v);
      }
      for (const [k, v] of Object.entries(corsHeaders(request, env))) {
        if (!headers.has(k)) headers.set(k, v);
      }
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      return errorResponse(err, request, env);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      fireDueScheduled(env).then((n) => {
        console.log(JSON.stringify({ msg: 'scheduled_fire', count: n }));
      }),
    );
  },
};
