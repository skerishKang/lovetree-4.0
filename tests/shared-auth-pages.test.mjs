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


// 공용 로그인으로 테마를 넘긴다. night|garden만 붙고, 그 외 값·없음은 붙이지 않는다(공용 기본 night).
test('/auth/login은 lt_theme night|garden만 공용 로그인으로 넘긴다', async () => {
  const f = await setup();
  const begin = async query => new URL((await f.auth(new Request(`https://lovetree-4-0.pages.dev/auth/login${query}`), f.env)).headers.get('location'));

  assert.equal((await begin('?lt_theme=garden')).searchParams.get('lt_theme'), 'garden');
  assert.equal((await begin('?lt_theme=night')).searchParams.get('lt_theme'), 'night');

  // 그 외 값과 없음은 붙이지 않는다.
  for (const query of ['?lt_theme=evil', '?lt_theme=GARDEN', '?lt_theme=', '?lt_theme=night%20', '?lt_theme=night&lt_theme=garden', '']) {
    const target = await begin(query);
    assert.equal(target.searchParams.has('lt_theme'), false, query || '(없음)');
  }

  // 테마를 넘겨도 나머지 파라미터와 state 봉인·next 검사는 그대로다.
  const start = await f.auth(new Request('https://lovetree-4-0.pages.dev/auth/login?lt_theme=garden&next=/v41/'), f.env);
  const target = new URL(start.headers.get('location'));
  assert.equal(target.origin, 'https://auth.padiem.net');
  assert.equal(target.pathname, '/login');
  assert.equal(target.searchParams.get('client_id'), 'lovetree-4-0');
  assert.equal(target.searchParams.get('redirect_uri'), 'https://lovetree-4-0.pages.dev/auth/callback');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(target.searchParams.get('code_challenge'));
  assert.ok(target.searchParams.get('state'));
  assert.equal(target.searchParams.get('lt_theme'), 'garden');
  assert.equal(target.searchParams.getAll('lt_theme').length, 1);

  const callback = new URL('https://lovetree-4-0.pages.dev/auth/callback');
  callback.searchParams.set('state', target.searchParams.get('state'));
  callback.searchParams.set('code', 'fake');
  const done = await f.auth(new Request(callback, { headers: { cookie: start.headers.get('set-cookie').split(';')[0] } }), f.env);
  assert.equal(done.status, 302);
  assert.equal(done.headers.get('location'), '/v41/');
});

test('invalid refresh grant is 401 while auth outage remains 503', async () => {
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const env={LOVETREE_AUTH_CLIENT_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey)),LOVETREE_AUTH_CLIENT_KID:'test'};
 const req=()=>new Request('https://lovetree.padiem.net/auth/refresh',{method:'POST',headers:{origin:'https://lovetree.padiem.net',cookie:'lovetree_refresh=invalid'}});
 for(const [status,body,expected] of [[400,{error:'invalid_grant'},401],[401,{error:'invalid_client'},503],[503,{error:'unavailable'},503]]){
  const auth=createSharedPagesAuth({fetcher:async()=>Response.json(body,{status})});const result=await auth(req(),env);assert.equal(result.status,expected);
  if(expected===401)assert.match(result.headers.get('set-cookie'),/lovetree_refresh=; Path=\/auth; Max-Age=0/);
  else assert.equal(result.headers.get('set-cookie'),null);
 }
});

// #213: 로그인 뒤 사이트 루트(/)로 떨어지던 결함. next=/v41/?intent=new-tree|shelf 를 그대로 살린다.
test('validNext는 첫 화면 경로와 의도(intent) 하나만 허용하고 나머지는 /v41/로 떨어뜨린다', async () => {
  const { validNext } = await import('../functions/_lib/shared-auth.mjs');
  const allowed = new Map([
    ['/v41/', '/v41/'],
    ['/v41', '/v41'],
    ['/v41/?intent=new-tree', '/v41/?intent=new-tree'],
    ['/v41/?intent=shelf', '/v41/?intent=shelf'],
    ['/', '/'],
    ['/workspace', '/workspace'],
    ['/v41/views/first-journey', '/v41/views/first-journey']
  ]);
  for (const [input, expected] of allowed) assert.equal(validNext(input), expected, input);

  const rejected = ['/v41/?intent=evil', '/v41/?x=1', '/v41/?intent=new-tree&intent=shelf', '/v41/?intent=', '/v41/#home',
    '//evil.com', '/\\evil', 'https://evil.com', 'http://lovetree-4-0.pages.dev/v41/', '/v41/%2f%2fevil.com', '/v41/../etc', '', null, undefined,
    'v41/', ' /v41/', '/v41/?intent=NEW-TREE', '/v41/?' + 'a'.repeat(200)];
  for (const input of rejected) assert.equal(validNext(input), '/v41/', String(input));
});

test('로그인 시작 주소의 next가 /v41/?intent=… 로 봉인되어 콜백이 그 자리로 돌아간다', async () => {
  const f = await setup();
  for (const [query, expected] of [
    ['/auth/login?next=' + encodeURIComponent('/v41/?intent=new-tree'), '/v41/?intent=new-tree'],
    ['/auth/login?next=' + encodeURIComponent('/v41/?intent=shelf'), '/v41/?intent=shelf'],
    ['/auth/login?next=' + encodeURIComponent('/v41/?intent=evil'), '/v41/'],
    ['/auth/login?next=' + encodeURIComponent('/v41/?x=1'), '/v41/'],
    ['/auth/login?next=' + encodeURIComponent('//evil.com'), '/v41/'],
    ['/auth/login?next=' + encodeURIComponent('/\\evil'), '/v41/'],
    ['/auth/login?next=' + encodeURIComponent('https://evil.com'), '/v41/'],
    ['/auth/login', '/v41/']
  ]) {
    const start = await f.auth(new Request('https://lovetree-4-0.pages.dev' + query), f.env);
    assert.equal(start.status, 302, query);
    const target = new URL(start.headers.get('location'));
    const callback = new URL('https://lovetree-4-0.pages.dev/auth/callback');
    callback.searchParams.set('state', target.searchParams.get('state'));
    callback.searchParams.set('code', 'fake');
    const done = await f.auth(new Request(callback, { headers: { cookie: start.headers.get('set-cookie').split(';')[0] } }), f.env);
    assert.equal(done.status, 302, query);
    assert.equal(done.headers.get('location'), expected, query);
  }
});

test('계정 동그라미 메뉴 맨 아래에 로그아웃이 있고 기존 로그아웃 동작을 부른다', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');
  const popoverHtml = (() => {
    const start = html.indexOf('<div id="account-popover"');
    const logout = html.indexOf('id="account-logout"', start);
    const end = html.indexOf('</button>', logout);
    return html.slice(start, end + '</button>'.length);
  })();
  const roles = [...popoverHtml.matchAll(/id="([^"]+)"[^>]*>([^<]*)</g)].map(m => m[1]);
  assert.equal(roles.at(-1), 'account-logout', '로그아웃은 메뉴 마지막 항목');
  assert.match(popoverHtml, /id="account-logout">로그아웃</);
  assert.match(html.match(/<div id="account-popover"[^>]*>/)[0], /role="menu"/);
  const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  assert.match(shell, /\$\('account-logout'\)\.onclick=async\(\)=>\{closeAccountMenu\(\);\$\('logout'\)\.click\(\);\}/, '기존 #logout 경로를 부른다');
});

async function pagesEnv(overrides = {}) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    LOVETREE_AUTH_STATE_KEY: Buffer.alloc(32, 7).toString('base64url'),
    LOVETREE_AUTH_CLIENT_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey)),
    LOVETREE_AUTH_CLIENT_KID: 'synthetic',
    LOVETREE_API_ORIGIN: 'https://storage.example',
    ...overrides
  };
}

// 로그인 시작 → 콜백까지 한꺼번에 돌려준다.
async function callbackRound(auth, env) {
  const begin = await auth(new Request('https://lovetree-4-0.pages.dev/auth/login'), env);
  const target = new URL(begin.headers.get('location'));
  const callback = new URL('https://lovetree-4-0.pages.dev/auth/callback');
  callback.searchParams.set('state', target.searchParams.get('state'));
  callback.searchParams.set('code', 'fake');
  return auth(new Request(callback, { headers: { cookie: begin.headers.get('set-cookie').split(';')[0] } }), env);
}

test('콜백은 프로필 이메일을 검증된 계정의 내부 저장소로 최선 노력으로 넘긴다', async () => {
  const calls = [];
  const auth = createSharedPagesAuth({
    now: () => 1000,
    verify: async () => ({ accountId: 'sub_a', subject: 'sub_a' }),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      if (url === 'https://auth.padiem.net/token') {
        return Response.json({ access_token: 'access', refresh_token: 'refresh', profile: { email: 'Owner@Example.test' } });
      }
      return Response.json({ ok: true });
    }
  });
  const done = await callbackRound(auth, await pagesEnv());
  assert.equal(done.status, 302);
  const push = calls.find((call) => call.url === 'https://storage.example/internal/account/email');
  assert.ok(push, '내부 저장소 호출이 있어야 한다');
  assert.equal(push.init.method, 'POST');
  assert.equal(push.init.headers.authorization, 'Bearer access');
  assert.deepEqual(JSON.parse(push.init.body), { email: 'Owner@Example.test', canonical_subject_id: 'sub_a' });
});

test('프로필이 없으면 저장소를 더 부르지 않는다', async () => {
  const urls = [];
  const auth = createSharedPagesAuth({
    now: () => 1000,
    verify: async () => ({ accountId: 'sub_a' }),
    fetcher: async (url) => {
      urls.push(url);
      return Response.json({ access_token: 'access', refresh_token: 'refresh' });
    }
  });
  const done = await callbackRound(auth, await pagesEnv());
  assert.equal(done.status, 302);
  assert.deepEqual(urls, ['https://auth.padiem.net/token']);
});

test('프로필의 이메일이 빈 값이면 저장소를 부르지 않고 로그인은 성공한다', async () => {
  for (const empty of ['', '   ']) {
    const urls = [];
    const auth = createSharedPagesAuth({
      now: () => 1000,
      verify: async () => ({ accountId: 'sub_a' }),
      fetcher: async (url) => {
        urls.push(url);
        return Response.json({ access_token: 'access', refresh_token: 'refresh', profile: { email: empty } });
      }
    });
    const done = await callbackRound(auth, await pagesEnv());
    assert.equal(done.status, 302, `빈 이메일(${JSON.stringify(empty)})에서도 로그인은 성공해야 한다`);
    assert.match(done.headers.get('set-cookie'), /__Host-lovetree-access=access/);
    assert.deepEqual(urls, ['https://auth.padiem.net/token'], `빈 이메일(${JSON.stringify(empty)})에서는 내부 저장소를 부르지 않는다`);
  }
});

test('저장소 호출이 실패해도 로그인은 성공한다', async () => {
  const outcomes = [];
  const auth = createSharedPagesAuth({
    now: () => 1000,
    verify: async () => ({ accountId: 'sub_a' }),
    fetcher: async (url) => {
      outcomes.push(url);
      if (url === 'https://auth.padiem.net/token') {
        return Response.json({ access_token: 'access', refresh_token: 'refresh', profile: { email: 'a@b.test' } });
      }
      throw new Error('storage down');
    }
  });
  const done = await callbackRound(auth, await pagesEnv());
  assert.equal(done.status, 302);
  assert.match(done.headers.get('set-cookie'), /__Host-lovetree-access=access/);
  assert.equal(outcomes.filter((url) => url !== 'https://auth.padiem.net/token').length, 1);
});
