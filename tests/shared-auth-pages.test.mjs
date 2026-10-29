import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedPagesAuth } from '../functions/_lib/shared-auth.mjs';

async function setup() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const env = { LOVETREE_AUTH_STATE_KEY: Buffer.alloc(32, 7).toString('base64url'), LOVETREE_AUTH_CLIENT_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey)), LOVETREE_AUTH_CLIENT_KID: 'synthetic' };
  let calls = 0;
  const auth = createSharedPagesAuth({ now: () => 1000, verify: async token => { if (token !== 'access') throw Error('bad'); }, fetcher: async (url, init) => {
    calls++; assert.equal(url, 'https://auth.padiem.net/token');
    assert.equal(new URLSearchParams(init.body).get('client_id'), 'lovetree-4-0');
    return Response.json({ access_token: 'access', refresh_token: 'refresh' });
  } });
  return { env, auth, calls: () => calls };
}

test('login state, server-side code exchange, cookies and refresh', async () => {
  const f = await setup();
  const begin = await f.auth(new Request('https://lovetree-4-0.pages.dev/auth/login?next=/workspace'), f.env);
  assert.equal(begin.status, 302);
  const target = new URL(begin.headers.get('location'));
  assert.equal(target.origin, 'https://auth.padiem.net');
  const callback = new URL('https://lovetree-4-0.pages.dev/auth/callback');
  callback.searchParams.set('state', target.searchParams.get('state')); callback.searchParams.set('code', 'fake');
  const stateCookie = begin.headers.get('set-cookie').split(';')[0];
  const done = await f.auth(new Request(callback, { headers: { cookie: stateCookie } }), f.env);
  assert.equal(done.status, 302); assert.equal(done.headers.get('location'), '/workspace');
  assert.match(done.headers.get('set-cookie'), /__Host-lovetree-access=access/);
  assert.match(done.headers.get('set-cookie'), /lovetree_refresh=refresh/);
  const refresh = await f.auth(new Request('https://lovetree-4-0.pages.dev/auth/refresh', { method: 'POST', headers: { origin: 'https://lovetree-4-0.pages.dev', cookie: 'lovetree_refresh=refresh' } }), f.env);
  assert.equal(refresh.status, 204); assert.equal(f.calls(), 2);
});

test('callback with wrong state and cross-origin refresh are rejected', async () => {
  const f = await setup();
  const begin = await f.auth(new Request('https://lovetree-4-0.pages.dev/auth/login'), f.env);
  const response = await f.auth(new Request('https://lovetree-4-0.pages.dev/auth/callback?state=wrong&code=x', { headers: { cookie: begin.headers.get('set-cookie').split(';')[0] } }), f.env);
  assert.equal(response.status, 401); assert.equal(f.calls(), 0);
  const refresh = await f.auth(new Request('https://lovetree-4-0.pages.dev/auth/refresh', { method: 'POST', headers: { origin: 'https://evil.example', cookie: 'lovetree_refresh=refresh' } }), f.env);
  assert.equal(refresh.status, 403);
});
