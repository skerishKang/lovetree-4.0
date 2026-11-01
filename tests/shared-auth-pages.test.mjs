import test from 'node:test';
import assert from 'node:assert/strict';
import {MEMBER_LOGIN_URL,shouldLoadMemberRecords} from '../public/v41/member-entry.mjs';
import { createSharedPagesAuth } from '../functions/_lib/shared-auth.mjs';

async function setup() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const env = { LOVETREE_AUTH_STATE_KEY: Buffer.alloc(32, 7).toString('base64url'), LOVETREE_AUTH_CLIENT_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey)), LOVETREE_AUTH_CLIENT_KID: 'synthetic' };
  let calls = 0;
  const auth = createSharedPagesAuth({ now: () => 1000, verify: async token => { if (token !== 'access') throw Error('bad'); }, fetcher: async (url, init) => {
    calls++; assert.equal(url, 'https://auth.padiem.net/token');
    assert.equal(init.redirect, 'manual');
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

test('preview callback must be configured for the same origin', async () => {
  const f = await setup();
  const preview = 'https://preview.example.pages.dev';
  assert.equal((await f.auth(new Request(`${preview}/auth/login`), f.env)).status, 503);
  const env = { ...f.env, LOVETREE_AUTH_CALLBACK_URI: `${preview}/auth/callback` };
  const begin = await f.auth(new Request(`${preview}/auth/login`), env);
  assert.equal(begin.status, 302);
  assert.equal(new URL(begin.headers.get('location')).searchParams.get('redirect_uri'), env.LOVETREE_AUTH_CALLBACK_URI);
  const crossOrigin = { ...env, LOVETREE_AUTH_CALLBACK_URI: 'https://evil.example/auth/callback' };
  assert.equal((await f.auth(new Request(`${preview}/auth/login`), crossOrigin)).status, 503);
});

// Regression: the old /v41/?account=1 return target was rejected and silently became /.
test('4.1 login callback returns to 4.1 and cookie marker triggers member loading',async()=>{
 const f=await setup();
 const begin=await f.auth(new Request('https://lovetree-4-0.pages.dev'+MEMBER_LOGIN_URL),f.env);
 const target=new URL(begin.headers.get('location'));
 const callback=new URL('https://lovetree-4-0.pages.dev/auth/callback');
 callback.searchParams.set('state',target.searchParams.get('state'));callback.searchParams.set('code','fake');
 const response=await f.auth(new Request(callback,{headers:{cookie:begin.headers.get('set-cookie').split(';')[0]}}),f.env);
 assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/v41/');
 assert.match(response.headers.get('set-cookie'),/__Host-lovetree-shared=1/);
 assert.equal(shouldLoadMemberRecords('','__Host-lovetree-shared=1'),true);
});

test('official aliases get their own callback and sealed state cannot cross hosts',async()=>{
 const f=await setup();
 for(const origin of ['https://lovetree-4-0.pages.dev','https://lovetree.padiem.net']){
  const start=await f.auth(new Request(origin+'/auth/login?next=/v41/'),f.env);
  assert.equal(start.status,302);const target=new URL(start.headers.get('location'));
  assert.equal(target.searchParams.get('redirect_uri'),origin+'/auth/callback');
  const cookie=start.headers.get('set-cookie').split(';')[0],query='?state='+target.searchParams.get('state')+'&code=fake';
  const other=origin.includes('pages.dev')?'https://lovetree.padiem.net':'https://lovetree-4-0.pages.dev';
  const before=f.calls();const cross=await f.auth(new Request(other+'/auth/callback'+query,{headers:{cookie}}),f.env);
  assert.equal(cross.status,401);assert.equal(f.calls(),before);
  const done=await f.auth(new Request(origin+'/auth/callback'+query,{headers:{cookie}}),f.env);
  assert.equal(done.status,302);assert.equal(done.headers.get('location'),'/v41/');
  assert.doesNotMatch(done.headers.get('set-cookie'),/Domain=/i);
 }
 assert.equal((await f.auth(new Request('https://lovetree.padiem.net.evil.test/auth/login'),f.env)).status,503);
});
