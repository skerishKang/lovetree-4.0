import test from 'node:test';
import assert from 'node:assert/strict';
import { createProxy, upstreamOrigin, DEFAULT_RESPONSE_LIMIT_BYTES } from '../functions/_lib/proxy.js';
import { DEFAULT_MAX_BODY_BYTES } from '../server/http.js';

const UPSTREAM = 'https://api.lovetree.example';
const onRequest = (proxy, url, init) => proxy({ request: new Request(url, init), env: { LOVETREE_API_ORIGIN: UPSTREAM } });

function recorder(reply) {
  const calls = [];
  const fetcher = async (url, init) => {
    const body = init?.body ? await new Response(init.body).text() : null;
    calls.push({ url, method: init?.method, body, headers: Object.fromEntries(init?.headers ?? []) , redirect: init?.redirect });
    return typeof reply === 'function' ? reply() : reply;
  };
  fetcher.calls = calls;
  return fetcher;
}

test('허용한 경로만 업스트림으로 넘기고 나머지는 404 JSON 이다', async () => {
  const allowed = [['/api/workspace', 'GET'], ['/api/admin/session', 'GET'], ['/api/admin/roles', 'GET'], ['/auth/login', 'GET'], ['/auth/callback', 'GET'], ['/auth/logout', 'POST']];
  for (const [path, method] of allowed) {
    const fetcher = recorder(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const response = await onRequest(createProxy({ fetcher }), `https://lovetree.example${path}`, { method });
    assert.equal(response.status, 200, path);
    assert.equal(fetcher.calls.length, 1, `${path}: 업스트림 1회`);
    assert.equal(fetcher.calls[0].url, `${UPSTREAM}${path}`);
  }
  for (const path of ['/api/other', '/api', '/auth/other', '/auth', '/auth/login/extra', '/api/admin/unknown', '/api/admin']) {
    const fetcher = recorder(new Response('{}'));
    const response = await onRequest(createProxy({ fetcher }), `https://lovetree.example${path}`);
    assert.equal(response.status, 404, `${path}: 404`);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal((await response.json()).error.code, 'not_proxied');
    assert.equal(fetcher.calls.length, 0, `${path}: 업스트림 호출 없음`);
  }
});

test('경로가 허용해도 메서드가 밖이면 내려보내지 않고 405 JSON 이다', async () => {
  for (const [path, method] of [['/auth/logout', 'GET'], ['/auth/login', 'POST'], ['/api/workspace', 'DELETE'], ['/api/workspace', 'POST'], ['/api/admin/roles', 'POST'], ['/api/admin/session', 'PUT']]) {
    const fetcher = recorder(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const response = await onRequest(createProxy({ fetcher }), `https://lovetree.example${path}`, { method });
    assert.equal(response.status, 405, `${method} ${path}`);
    assert.equal((await response.json()).error.code, 'method_not_allowed');
    assert.equal(fetcher.calls.length, 0, 'COM2까지 내려보내지 않는다');
  }
});

test('method·query·body 를 그대로 넘긴다', async () => {
  const fetcher = recorder(new Response('{"revision":1}', { headers: { 'content-type': 'application/json' } }));
  const payload = JSON.stringify({ state: { version: 1, trees: [] }, expectedRevision: 0, clientKey: 'ck-1' });
  const response = await onRequest(createProxy({ fetcher }), 'https://lovetree.example/api/workspace?trace=1&x=%20y', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: payload
  });
  assert.equal(response.status, 200);
  const call = fetcher.calls[0];
  assert.equal(call.method, 'PUT');
  assert.equal(call.url, `${UPSTREAM}/api/workspace?trace=1&x=%20y`);
  assert.equal(call.body, payload);
  assert.equal(call.headers['content-type'], 'application/json');
  assert.equal(call.redirect, 'manual', '리다이렉트를 따라가지 않는다');
});

test('status·Location·Set-Cookie 를 그대로 돌려준다', async () => {
  const fetcher = recorder(new Response(null, {
    status: 302,
    headers: [
      ['location', '/'],
      ['content-type', 'text/plain; charset=utf-8'],
      ['set-cookie', 'lovetree_session=abc; Path=/; Max-Age=3600; SameSite=Lax; HttpOnly'],
      ['set-cookie', 'lovetree_oauth_state=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly']
    ]
  }));
  const response = await onRequest(createProxy({ fetcher }), 'https://lovetree.example/auth/callback?code=lovt_1&state=s1');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /^lovetree_session=abc;/);
  assert.match(cookies[1], /^lovetree_oauth_state=;/);
});

test('사용자 요청으로 업스트림 목적지를 바꿀 수 없다', async () => {
  const fetcher = recorder(new Response('{}', { headers: { 'content-type': 'application/json' } }));
  const response = await onRequest(createProxy({ fetcher }), 'https://lovetree.example/api/workspace?upstream=https://evil.example&origin=https://evil.example', {
    headers: { 'x-upstream': 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-for': '1.2.3.4' }
  });
  assert.equal(response.status, 200);
  assert.equal(fetcher.calls[0].url, `${UPSTREAM}/api/workspace?upstream=https://evil.example&origin=https://evil.example`,
    '쿼리는 그대로 넘어가지만 목적지는 env 하나에서만 온다');
  for (const name of ['x-upstream', 'x-forwarded-host', 'x-forwarded-for']) {
    assert.equal(fetcher.calls[0].headers[name], undefined, `${name} 은 전달하지 않는다`);
  }
});

test('업스트림 설정이 없거나 형태가 틀리면 503 이고 호출하지 않는다', async () => {
  const bad = [undefined, '', 'api.lovetree.example', 'ftp://api.lovetree.example', 'https://api.lovetree.example/base', 'http://api.lovetree.example', 'https://user:pw@api.lovetree.example'];
  for (const value of bad) {
    const fetcher = recorder(new Response('{}'));
    const response = await createProxy({ fetcher })({ request: new Request('https://lovetree.example/api/workspace'), env: { LOVETREE_API_ORIGIN: value } });
    assert.equal(response.status, 503, String(value));
    assert.equal((await response.json()).error.code, 'storage_unavailable');
    assert.equal(fetcher.calls.length, 0, `${String(value)}: 호출 없음`);
  }
  assert.equal(upstreamOrigin({ LOVETREE_API_ORIGIN: 'http://127.0.0.1:8791' }), 'http://127.0.0.1:8791', 'loopback 은 격리 검증용으로 허용');
});

test('업스트림이 HTML 이면 HTML 성공으로 바꾸지 않고 502 로 끊는다', async () => {
  const fetcher = recorder(new Response('<!doctype html><title>LoveTree</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const response = await onRequest(createProxy({ fetcher }), 'https://lovetree.example/api/workspace');
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  const body = await response.json();
  assert.equal(body.error.code, 'upstream_invalid_response');
  assert.equal(JSON.stringify(body).includes('<'), false, 'HTML 본문을 싣지 않는다');
});

test('/api/workspace 인데 JSON 이 아니면 502 이다(상태 코드가 200이어도)', async () => {
  const fetcher = recorder(new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } }));
  const response = await onRequest(createProxy({ fetcher }), 'https://lovetree.example/api/workspace');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'upstream_invalid_response');
});

test('업스트림 오류 상태는 그대로 전달한다', async () => {
  const fetcher = recorder(new Response(JSON.stringify({ error: { code: 'revision_conflict', message: 'x', currentRevision: 5 } }), { status: 409, headers: { 'content-type': 'application/json; charset=utf-8' } }));
  const response = await onRequest(createProxy({ fetcher }), 'https://lovetree.example/api/workspace');
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'revision_conflict');
});

test('연결 실패는 502, 응답 없음은 504 로 끊는다', async () => {
  const down = createProxy({ fetcher: async () => { throw new TypeError('connect failed'); } });
  const unreachable = await onRequest(down, 'https://lovetree.example/api/workspace');
  assert.equal(unreachable.status, 502);
  assert.equal((await unreachable.json()).error.code, 'upstream_unreachable');

  const hanging = createProxy({ timeoutMs: 10, fetcher: (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }) });
  const timeout = await onRequest(hanging, 'https://lovetree.example/api/workspace');
  assert.equal(timeout.status, 504);
  assert.equal((await timeout.json()).error.code, 'upstream_timeout');
});

test('본문 없는 204 는 /api 에서는 계약 위반(502), /auth 에서는 그대로 통과한다', async () => {
  const api = await onRequest(createProxy({ fetcher: recorder(new Response(null, { status: 204 })) }), 'https://lovetree.example/api/workspace');
  assert.equal(api.status, 502, '/api/workspace 는 JSON 계약이므로 204 를 성공으로 보지 않는다');
  assert.equal((await api.json()).error.code, 'upstream_invalid_response');

  const auth = await onRequest(createProxy({ fetcher: recorder(new Response(null, { status: 204 })) }), 'https://lovetree.example/auth/logout', { method: 'POST' });
  assert.equal(auth.status, 204);
  assert.equal(await auth.text(), '');
});

test('헤더만 오고 본문이 멈추면 기한에 끊고 업스트림 읽기를 취소한다', async () => {
  let cancelled = false;
  const stalled = () => new Response(new ReadableStream({
    start() { /* 아무것도 보내지 않는다 */ },
    cancel() { cancelled = true; }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const proxy = createProxy({ fetcher: async () => stalled(), timeoutMs: 30 });
  const started = Date.now();
  const response = await onRequest(proxy, 'https://lovetree.example/api/workspace');
  const elapsed = Date.now() - started;
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'upstream_timeout');
  assert.equal(cancelled, true, '기한 초과 시 업스트림 읽기를 실제로 취소한다');
  assert.ok(elapsed < 2000, `기한 안에 끝난다(${elapsed}ms)`);
});

test('본문이 늦게 와도 기한 안에 끝나면 그대로 통과한다', async () => {
  const slow = () => new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode('{"revision":'));
      await new Promise(r => setTimeout(r, 20));
      controller.enqueue(new TextEncoder().encode('2}'));
      controller.close();
    }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const response = await onRequest(createProxy({ fetcher: async () => slow(), timeoutMs: 500 }), 'https://lovetree.example/api/workspace');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { revision: 2 });
});

test('응답 상한은 서버 문서 상한보다 크고, 정상 큰 기록을 막지 않는다', async () => {
  assert.ok(DEFAULT_RESPONSE_LIMIT_BYTES > DEFAULT_MAX_BODY_BYTES,
    `프록시 상한(${DEFAULT_RESPONSE_LIMIT_BYTES})은 서버 상한(${DEFAULT_MAX_BODY_BYTES})보다 커야 한다`);

  const big = '{"revision":1,"payload":"' + 'x'.repeat(1024 * 1024) + '"}';
  const response = await onRequest(createProxy({ fetcher: async () => new Response(big, { headers: { 'content-type': 'application/json' } }) }), 'https://lovetree.example/api/workspace');
  assert.equal(response.status, 200);
  assert.equal((await response.text()).length, big.length, '1MiB 본문이 잘리지 않는다');
});

test('상한을 넘는 본문은 502 로 끊고 읽기를 취소한다', async () => {
  let cancelled = false;
  const huge = () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"a":"'));
      controller.enqueue(new Uint8Array(2048).fill(120));
      // 닫지 않는다 — 상한 초과로 우리가 먼저 끊어야 한다.
    },
    cancel() { cancelled = true; }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const proxy = createProxy({ fetcher: async () => huge(), timeoutMs: 5000, maxResponseBytes: 1024 });
  const response = await onRequest(proxy, 'https://lovetree.example/api/workspace');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'upstream_response_too_large');
  assert.equal(cancelled, true);
});

test('실제 fetch로 PUT 본문을 넘기면 업스트림이 끝까지 받는다', async () => {
  const { createServer } = await import('node:http');
  let received = null;
  const upstream = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received = { method: req.method, path: req.url, body: Buffer.concat(chunks).toString('utf8') };
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ revision: 1, savedAt: '2026-10-28T00:00:00.000Z' }));
    });
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  try {
    const payload = JSON.stringify({ state: { version: 1, trees: [] }, expectedRevision: 0, clientKey: 'ck-1' });
    const response = await createProxy()({
      request: new Request('https://lovetree.example/api/workspace', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: payload }),
      env: { LOVETREE_API_ORIGIN: `http://127.0.0.1:${upstream.address().port}` }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 1);
    assert.equal(received.method, 'PUT');
    assert.equal(received.path, '/api/workspace');
    assert.equal(received.body, payload, '본문이 갈리지 않고 닿는다');
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('명시적 공유 경로만 메서드별로 프록시하고 하위 확장은 막는다',async()=>{
 const cases=[['/api/shares','GET'],['/api/shares','POST'],['/api/shares/preview','POST'],['/api/shares/token_123','DELETE'],['/api/public/shares/token_123','GET']];
 for(const [path,method] of cases){const fetcher=recorder(new Response('{}',{headers:{'content-type':'application/json'}}));const response=await onRequest(createProxy({fetcher}),`https://lovetree.example${path}`,{method});assert.equal(response.status,200,`${method} ${path}`);assert.equal(fetcher.calls[0].url,`${UPSTREAM}${path}`);}
 for(const path of ['/api/shares/token/extra','/api/public/shares/token/extra','/api/public/shares/token.json']){const fetcher=recorder(new Response('{}'));const response=await onRequest(createProxy({fetcher}),`https://lovetree.example${path}`);assert.equal(response.status,404,path);assert.equal(fetcher.calls.length,0);}
});
