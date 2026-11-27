import test from 'node:test';
import assert from 'node:assert/strict';
import {MEMBER_LOGIN_URL,shouldLoadMemberRecords} from '../public/v41/member-entry.mjs';
import { createSharedPagesAuth } from '../functions/_lib/shared-auth.mjs';
import { createAuthPagesHandler } from '../functions/auth/[[path]].js';

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

// 운영 비밀 값 앞에 BOM이 붙어 콜백이 매번 "is not valid JSON"으로 실패하던 결함.
test('비밀 키 앞뒤의 BOM·공백이 있어도 토큰 교환 요청까지 간다', async () => {
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const env={LOVETREE_AUTH_CLIENT_PRIVATE_JWK:'\uFEFF '+JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey))+'\u200B\n',LOVETREE_AUTH_CLIENT_KID:'\u00A0test '};
 let sent=null;
 const auth=createSharedPagesAuth({fetcher:async(url,init)=>{sent=init;return Response.json({error:'invalid_grant'},{status:400});}});
 const result=await auth(new Request('https://lovetree.padiem.net/auth/refresh',{method:'POST',headers:{origin:'https://lovetree.padiem.net',cookie:'lovetree_refresh=x'}}),env);
 assert.equal(result.status,401);
 assert.ok(sent,'토큰 교환 요청이 나가야 한다');
 const body=String(sent.body);
 const jwt=new URLSearchParams(body).get('client_assertion');
 assert.equal(JSON.parse(Buffer.from(jwt.split('.')[0],'base64url').toString()).kid,'test');
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

// #952: 계정 메뉴 글자 검사 3개(로그아웃이 마지막 항목·role=menu·onclick 배선)를 걷어냈다.
// 메뉴 열기·닫기·바깥 누름은 v41-shell-header가 fake DOM으로 동작을 확인한다.

async function pagesEnv(overrides = {}) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    LOVETREE_AUTH_STATE_KEY: Buffer.alloc(32, 7).toString('base64url'),
    LOVETREE_AUTH_CLIENT_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey)),
    LOVETREE_AUTH_CLIENT_KID: 'synthetic',
    LOVETREE_API_ORIGIN: 'https://storage.example',
    // #1189: email_assertion 검증용 가짜 비밀(실제 값이 아님).
    PADIEM_AUTH_EMAIL_ASSERTION_KEY_LOVETREE: 'test-assertion-secret',
    ...overrides
  };
}

// #1189: 토큰 교환 응답에 실을 email_assertion을 만든다.
async function makeAssertion({ email, sub = 'sub_a', aud = 'lovetree', iat = 1000, exp = 1600, secret = 'test-assertion-secret' }) {
  const enc = new TextEncoder();
  const b64 = x => btoa(String.fromCharCode(...new Uint8Array(x))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const payload = b64(enc.encode(JSON.stringify({ sub, email: email.toLowerCase(), email_verified: true, aud, iat, exp })));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('v1.' + payload))));
  return 'v1.' + payload + '.' + sig;
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

test('콜백은 검증된 이메일 서명을 내부 저장소로 최선 노력으로 넘긴다', async () => {
  const calls = [];
  const auth = createSharedPagesAuth({
    now: () => 1000,
    verify: async () => ({ accountId: 'sub_a', subject: 'sub_a' }),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      if (url === 'https://auth.padiem.net/token') {
        return Response.json({ access_token: 'access', refresh_token: 'refresh', email_assertion: await makeAssertion({ email: 'Owner@Example.test' }) });
      }
      return Response.json({ ok: true });
    }
  });
  const proof = 'p'.repeat(48);
  const done = await callbackRound(auth, await pagesEnv({ LOVETREE_PROXY_SECRET: proof }));
  assert.equal(done.status, 302);
  const push = calls.find((call) => call.url === 'https://storage.example/internal/account/email');
  assert.ok(push, '내부 저장소 호출이 있어야 한다');
  assert.equal(push.init.method, 'POST');
  assert.equal(push.init.headers['x-lovetree-proxy-proof'], proof);
  assert.equal(push.init.headers.authorization, 'Bearer access');
  assert.deepEqual(JSON.parse(push.init.body), { email: 'owner@example.test', canonical_subject_id: 'sub_a' });
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

test('이메일 서명의 이메일이 빈 값이면 저장소를 부르지 않고 로그인은 성공한다', async () => {
  for (const empty of ['', '   ']) {
    const urls = [];
    const auth = createSharedPagesAuth({
      now: () => 1000,
      verify: async () => ({ accountId: 'sub_a' }),
      fetcher: async (url) => {
        urls.push(url);
        return Response.json({ access_token: 'access', refresh_token: 'refresh', email_assertion: await makeAssertion({ email: empty }) });
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
        return Response.json({ access_token: 'access', refresh_token: 'refresh', email_assertion: await makeAssertion({ email: 'a@b.test' }) });
      }
      throw new Error('storage down');
    }
  });
  const done = await callbackRound(auth, await pagesEnv());
  assert.equal(done.status, 302);
  assert.match(done.headers.get('set-cookie'), /__Host-lovetree-access=access/);
  assert.equal(outcomes.filter((url) => url !== 'https://auth.padiem.net/token').length, 1);
});

test('#1175 콜백 거절은 옛 경로·새 경로 모두 날 글자 대신 안내 표지로 돌아간다', async () => {
  const f = await setup();
  const begin = await f.auth(new Request('https://lovetree-4-0.pages.dev/auth/login'), f.env);
  const cookie = begin.headers.get('set-cookie').split(';')[0];
  const shared = createAuthPagesHandler({ shared: f.auth, legacy: async () => new Response('legacy', { status: 401 }) });
  const rejected = await shared({
    request: new Request('https://lovetree-4-0.pages.dev/auth/callback?state=wrong&code=x', { headers: { cookie } }),
    env: { ...f.env, LOVETREE_SHARED_AUTH_ENABLED: 'true' }
  });
  assert.equal(rejected.status, 302, '새 경로의 401도 이동으로 바꾼다');
  assert.equal(rejected.headers.get('location'), '/v41/?loginNotice=1');
  assert.equal(await rejected.text(), '', 'JSON을 브라우저에 보내지 않는다');

  const legacy = createAuthPagesHandler({
    legacy: async () => Response.json({ error: { code: 'login_handoff_rejected' } }, { status: 401 }),
    shared: async () => { throw new Error('legacy 경로에서는 shared를 부르지 않는다'); }
  });
  const old = await legacy({ request: new Request('https://lovetree-4-0.pages.dev/auth/callback?state=wrong&code=x'), env: {} });
  assert.equal(old.status, 302, '옛 프록시 경로의 401도 이동으로 바꾼다');
  assert.equal(old.headers.get('location'), '/v41/?loginNotice=1');

  const success = createAuthPagesHandler({
    shared: async () => new Response(null, { status: 302, headers: { location: '/v41/' } }),
    legacy: async () => new Response(null, { status: 302, headers: { location: '/v41/' } })
  });
  const ok = await success({
    request: new Request('https://lovetree-4-0.pages.dev/auth/callback?state=ok&code=x', { headers: { cookie } }),
    env: { ...f.env, LOVETREE_SHARED_AUTH_ENABLED: 'true' }
  });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), '/v41/', '성공 콜백은 그대로');
});

// #1189: email_assertion 검증 6종.
test('email_assertion: 서명 일치·aud·만료·sub·필드 검증을 통과해야 이메일을 저장한다', async () => {
  const env = await pagesEnv();
  const now = 1000;
  const good = await makeAssertion({ email: 'Owner@Example.test', sub: 'sub_a', iat: 1000, exp: 1600 });
  const tampered = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
  const cases = [
    ['일치', good, 'sub_a', env, 'owner@example.test', true],
    ['변조 서명', tampered, 'sub_a', env, null, false],
    ['만료', await makeAssertion({ email: 'owner@example.test', sub: 'sub_a', iat: 100, exp: 700 }), 'sub_a', env, null, false],
    ['aud 불일치', await makeAssertion({ email: 'owner@example.test', sub: 'sub_a', aud: 'other' }), 'sub_a', env, null, false],
    ['sub 불일치', await makeAssertion({ email: 'owner@example.test', sub: 'sub_b' }), 'sub_a', env, null, false],
    ['비밀 없음', good, 'sub_a', { ...env, PADIEM_AUTH_EMAIL_ASSERTION_KEY_LOVETREE: '' }, null, false]
  ];
  for (const [name, assertion, sub, envForCase, expectEmail, shouldStore] of cases) {
    const calls = [];
    const auth = createSharedPagesAuth({
      now: () => now,
      verify: async () => ({ accountId: sub }),
      fetcher: async (url, init) => {
        if (url === 'https://auth.padiem.net/token') {
          return Response.json({ access_token: 'access', refresh_token: 'refresh', email_assertion: assertion });
        }
        calls.push({ url, init });
        return Response.json({ ok: true });
      }
    });
    const done = await callbackRound(auth, envForCase);
    assert.equal(done.status, 302, `${name}: 로그인은 성공`);
    const push = calls.find((c) => c.url === 'https://storage.example/internal/account/email');
    if (shouldStore) {
      assert.ok(push, `${name}: 저장소 호출`);
      assert.equal(JSON.parse(push.init.body).email, expectEmail, `${name}: 검증된 이메일 저장`);
    } else {
      assert.equal(push, undefined, `${name}: 저장소 호출 없음`);
    }
  }
});

test('#1548 후속 POST /auth/callback은 빈·잘못된 입력에서 302로 거절하고 쿠키를 만들지 않는다', async () => {
  let upstreamCalls = 0;
  const auth = createSharedPagesAuth({
    fetcher: async () => { upstreamCalls++; throw Error('외부 인증을 부르면 안 된다'); },
    verify: async () => ({ accountId: '검사용' })
  });
  const handler = createAuthPagesHandler({ shared: auth });
  const cases = [
    ['빈 본문', new Request('https://lovetree-4-0.pages.dev/auth/callback', { method: 'POST' })],
    ['빈 코드와 상태', new Request('https://lovetree-4-0.pages.dev/auth/callback?code=&state=', { method: 'POST' })],
    ['잘못된 상태 쿠키', new Request('https://lovetree-4-0.pages.dev/auth/callback?code=x&state=y', { method: 'POST', headers: { cookie: 'lovetree_auth_state=bad' } })]
  ];
  for (const [name, request] of cases) {
    const response = await handler({ request, env: {} });
    assert.equal(response.status, 302, name + '에서 서버 오류가 나면 안 된다');
    assert.equal(response.headers.get('location'), '/v41/?loginNotice=1', name);
    assert.equal(response.headers.get('set-cookie'), null, name + '에서 쿠키가 생기면 안 된다');
    assert.equal(response.headers.get('cache-control'), 'no-store', name);
    assert.equal(await response.text(), '', name + '에 응답 본문이 없어야 한다');
  }
  assert.equal(upstreamCalls, 0, '외부 인증 서비스를 부르지 않는다');
});
