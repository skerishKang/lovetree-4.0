import { listenOnSafePort } from './helpers/safe-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProxy, upstreamOrigin, DEFAULT_RESPONSE_LIMIT_BYTES } from '../functions/_lib/proxy.js';
import { DEFAULT_MAX_BODY_BYTES } from '../server/http.js';
import { createHmac } from 'node:crypto';
import { verifyProxyProof } from '../server/proxy-proof.js';
import { parse } from 'acorn';

const UPSTREAM = 'https://api.lovetree.example';

test('#1211: 서명된 원문만 전달하고 수신 증명은 프록시가 만든다', async () => {
  const secret = 'fixture-ingest', proof = 'p'.repeat(48), path = '/api/ops-feedback/ingest';
  const raw = '{\n  "body": "한글", "kind": "reply"\n}';
  const timestamp = String(Date.now());
  const sign = (time, site, body) => 'sha256=' + createHmac('sha256', secret).update(`${time}\n${site}\n`).update(body).digest('hex');
  const cases = [
    ['정상', raw, timestamp, 'lovetree', sign(timestamp,'lovetree',raw), 200],
    ['본문 변경', raw+' ', timestamp, 'lovetree', sign(timestamp,'lovetree',raw), 401],
    ['오래된 시각', raw, String(+timestamp-301000), 'lovetree', sign(String(+timestamp-301000),'lovetree',raw), 401],
    // 미래 쪽은 앞 사례를 처리하는 동안 시계가 흐르면 차이가 줄어든다 — 기준(300초)보다 1분 넉넉히 앞선 시각을 쓴다.
    ['미래 시각', raw, String(+timestamp+360000), 'lovetree', sign(String(+timestamp+360000),'lovetree',raw), 401],
    ['다른 사이트', raw, timestamp, 'other', sign(timestamp,'other',raw), 401],
    ['서명 모양 오류', raw, timestamp, 'lovetree', 'sha256=bad', 401],
    ['8KB 경계', raw.padEnd(8192-4,' '), timestamp, 'lovetree', sign(timestamp,'lovetree',raw.padEnd(8192-4,' ')), 200],
    ['8KB 초과', '가'.repeat(2731), timestamp, 'lovetree', sign(timestamp,'lovetree','가'.repeat(2731)), 400],
  ];
  for (const [label, body, time, site, signature, status] of cases) {
    const fetcher = recorder(new Response('{"ok":true}', {headers:{'content-type':'application/json'}}));
    const response = await onRequest(createProxy({fetcher}), 'https://lovetree.example'+path, {method:'POST',body,headers:{'content-type':'application/json','x-pd-site':site,'x-pd-timestamp':time,'x-pd-signature':signature,'x-lovetree-ops-ingest-proof':'forged'}}, {LOVETREE_OPS_INGEST_SECRET:secret,LOVETREE_PROXY_SECRET:proof});
    assert.equal(response.status,status,label);
    assert.equal(fetcher.calls.length,status===200?1:0,label);
    if(status===200){
      const call=fetcher.calls[0];
      assert.equal(call.body,body);
      assert.equal(call.headers['x-pd-signature'],undefined);
      assert.equal(verifyProxyProof({path,headers:call.headers,body:call.body},{secret:proof}).ok,true);
      assert.equal(verifyProxyProof({path,headers:call.headers,body:call.body+' '},{secret:proof}).ok,false);
    }
  }
  const fetcher=recorder(new Response('{}'));
  const init={method:'POST',body:raw,headers:{'x-pd-site':'lovetree','x-pd-timestamp':timestamp,'x-pd-signature':sign(timestamp,'lovetree',raw)}};
  assert.equal((await onRequest(createProxy({fetcher}),'https://lovetree.example'+path,init,{LOVETREE_PROXY_SECRET:proof})).status,503);
  assert.equal((await onRequest(createProxy({fetcher}),'https://lovetree.example'+path,init,{LOVETREE_OPS_INGEST_SECRET:secret})).status,503);
  assert.equal(fetcher.calls.length,0);
  const other=recorder(new Response('{}',{headers:{'content-type':'application/json'}}));
  await onRequest(createProxy({fetcher:other}),'https://lovetree.example/api/feedback',{method:'POST',body:'{}',headers:{'x-lovetree-ops-ingest-proof':'forged'}},{LOVETREE_PROXY_SECRET:proof});
  assert.equal(other.calls[0].headers['x-lovetree-ops-ingest-proof'],undefined);
});

test('무대 조회와 투표만 전달하고 담기 해제의 빈 204를 보존한다', async () => {
  const share='s'.repeat(24), base='https://lovetree.example';
  const detail='/api/community/stages/stage-1', vote=detail+'/vote';
  const resolve='/api/community/shares/'+share+'/moments/m0/stage';
  for (const [path,method] of [[resolve,'GET'],[detail+'?cursor='+share,'GET'],['/api/community/stages/popular','GET'],[vote,'PUT'],[vote,'DELETE']]) {
    const reply=method==='DELETE'?new Response(null,{status:204}):new Response('{}',{headers:{'content-type':'application/json','cache-control':'no-store'}});
    const fetcher=recorder(reply);
    const result=await onRequest(createProxy({fetcher}),base+path,{method});
    assert.equal(fetcher.calls[0].url,UPSTREAM+path);
    assert.equal(fetcher.calls[0].method,method);
    assert.equal(result.status,method==='DELETE'?204:200);
    assert.match(result.headers.get('cache-control'),/no-store/);
    if(method==='DELETE')assert.equal(await result.text(),'');
  }
  for (const [path,method,status] of [[resolve,'PUT',405],[detail,'POST',405],[vote,'GET',405],[detail+'/votes','PUT',404]]) {
    const fetcher=recorder(new Response());
    assert.equal((await onRequest(createProxy({fetcher}),base+path,{method})).status,status);
    assert.equal(fetcher.calls.length,0);
  }
});
test('순간 하나의 ♡·댓글 경로는 서버로 넘기고 메서드 밖은 막는다(11-22 운영에서 막혀 있던 길)', async () => {
  const share='s'.repeat(24), base='https://lovetree.example', moment='/api/community/shares/'+share+'/moments/m0';
  const ok=[[moment,'GET'],[moment+'/reaction','PUT'],[moment+'/reaction','DELETE'],[moment+'/comments','GET'],[moment+'/comments','POST'],[moment+'/comments/c1/report','POST']];
  for (const [path,method] of ok) {
    const fetcher=recorder(new Response('{}',{headers:{'content-type':'application/json'}}));
    const result=await onRequest(createProxy({fetcher}),base+path,{method,...(method==='PUT'||method==='POST'?{body:'{}',headers:{'content-type':'application/json'}}:{})});
    assert.equal(fetcher.calls.length,1,path+' '+method);
    assert.equal(fetcher.calls[0].url,UPSTREAM+path);
    assert.equal(result.status,200);
  }
  for (const [path,method,status] of [[moment,'POST',405],[moment+'/reaction','GET',405],[moment+'/comments','DELETE',405],[moment+'/comments/c1/report','GET',405],[moment+'/hearts','GET',404]]) {
    const fetcher=recorder(new Response());
    assert.equal((await onRequest(createProxy({fetcher}),base+path,{method})).status,status,path+' '+method);
    assert.equal(fetcher.calls.length,0);
  }
});

test('#1356 내 순간 경로는 GET만 넘기고 나머지 메서드는 막는다(CTO 허락으로 프록시 한 줄 추가)', async () => {
  const base = 'https://lovetree.example', path = '/api/community/me/moments';
  const fetcher = recorder(new Response('{}', { headers: { 'content-type': 'application/json' } }));
  const result = await onRequest(createProxy({ fetcher }), base + path, { method: 'GET' });
  assert.equal(fetcher.calls.length, 1);
  assert.equal(fetcher.calls[0].url, UPSTREAM + path);
  assert.equal(fetcher.calls[0].method, 'GET');
  assert.equal(result.status, 200);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const blocked = recorder(new Response());
    assert.equal((await onRequest(createProxy({ blocked }), base + path, { method })).status, 405, path + ' ' + method);
    assert.equal(blocked.calls.length, 0);
  }
});
const onRequest = (proxy, url, init, extraEnv = {}) => proxy({ request: new Request(url, init), env: { LOVETREE_API_ORIGIN: UPSTREAM, ...extraEnv } });

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

test('#611 4번: 내 의견 덧붙이기 경로는 서버로 넘기고, 딴 글 번호·메서드는 막는다', async () => {
  const fetcher = recorder(new Response('{"followup":{"id":9}}', { headers: { 'content-type': 'application/json' } }));
  const proxy = createProxy({ fetcher });
  const ok = await onRequest(proxy, 'https://lovetree.example/api/board/mine/42/followup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(ok.status, 200, '덧붙이기 POST는 넘긴다');
  assert.equal(fetcher.calls.at(-1).url, `${UPSTREAM}/api/board/mine/42/followup`);
  // 허용 경로는 메서드가 밖이면 405, 번호 모양·경로 밖은 404다.
  for (const [path, method, expected] of [['/api/board/mine/42/followup', 'GET', 405], ['/api/board/mine/abc/followup', 'POST', 404], ['/api/board/mine/42/append', 'POST', 404]]) {
    const before = fetcher.calls.length;
    const init = method === 'GET' ? {method} : {method, headers: {'content-type': 'application/json'}, body: '{}'};
    const response = await onRequest(proxy, `https://lovetree.example${path}`, init);
    assert.equal(response.status, expected, `${method} ${path}: ${expected}`);
    assert.equal(fetcher.calls.length, before, '업스트림 호출 없음');
  }
});

test('허용한 경로만 업스트림으로 넘기고 나머지는 404 JSON 이다', async () => {
  const allowed = [['/api/account', 'GET'], ['/api/account/delete', 'POST'], ['/api/workspace', 'GET'], ['/api/admin/session', 'GET'], ['/api/admin/roles', 'GET'], ['/api/admin/feedback', 'GET'], ['/api/admin/journals', 'GET'], ['/api/admin/stats', 'GET'], ['/api/admin/customers', 'GET'], ['/api/admin/customers/views', 'GET'], ['/api/youtube/oembed', 'GET'], ['/auth/login', 'GET'], ['/auth/callback', 'GET'], ['/auth/logout', 'POST']];
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
  for (const [path, method] of [['/api/account', 'POST'], ['/api/account/delete', 'GET'], ['/api/account/delete', 'DELETE'], ['/auth/logout', 'GET'], ['/auth/login', 'POST'], ['/api/workspace', 'DELETE'], ['/api/workspace', 'POST'], ['/api/admin/roles', 'POST'], ['/api/admin/session', 'PUT'], ['/api/admin/stats', 'POST'], ['/api/youtube/oembed', 'POST']]) {
    const fetcher = recorder(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const response = await onRequest(createProxy({ fetcher }), `https://lovetree.example${path}`, { method });
    assert.equal(response.status, 405, `${method} ${path}`);
    assert.equal((await response.json()).error.code, 'method_not_allowed');
    assert.equal(fetcher.calls.length, 0, 'COM2까지 내려보내지 않는다');
  }
});

test('계정 탈퇴 POST는 원본 Origin과 JSON 본문을 업스트림으로 전달한다', async () => {
  const fetcher = recorder(new Response('{"deleted":true}', { headers: { 'content-type': 'application/json' } }));
  const origin = 'https://lovetree.padiem.net';
  const payload = JSON.stringify({ confirm: '탈퇴합니다' });
  const response = await onRequest(createProxy({ fetcher }), 'https://lovetree.example/api/account/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: payload
  });
  assert.equal(response.status, 200);
  assert.equal(fetcher.calls.length, 1);
  assert.equal(fetcher.calls[0].headers.origin, origin);
  assert.equal(fetcher.calls[0].body, payload);
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
      ['set-cookie', '__Host-lovetree-access=abc; Path=/; Max-Age=3600; SameSite=Lax; Secure; HttpOnly'],
      ['set-cookie', 'lovetree_auth_state=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly']
    ]
  }));
  const response = await onRequest(createProxy({ fetcher }), 'https://lovetree.example/auth/callback?code=lovt_1&state=s1');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /^__Host-lovetree-access=abc;/);
  assert.match(cookies[1], /^lovetree_auth_state=;/);
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
  await listenOnSafePort(upstream, '127.0.0.1');
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
 const cases=[['/api/shares','GET'],['/api/shares','POST'],['/api/shares/preview','POST'],['/api/shares/token_123','DELETE'],['/api/shares/token_123/discovery','PUT'],['/api/public/shares/token_123','GET']];
 for(const [path,method] of cases){const fetcher=recorder(new Response('{}',{headers:{'content-type':'application/json'}}));const response=await onRequest(createProxy({fetcher}),`https://lovetree.example${path}`,{method});assert.equal(response.status,200,`${method} ${path}`);assert.equal(fetcher.calls[0].url,`${UPSTREAM}${path}`);}
 for(const path of ['/api/shares/token/extra','/api/public/shares/token/extra','/api/public/shares/token.json']){const fetcher=recorder(new Response('{}'));const response=await onRequest(createProxy({fetcher}),`https://lovetree.example${path}`);assert.equal(response.status,404,path);assert.equal(fetcher.calls.length,0);}
});

test('#678 후속: 덧붙임 고치기·지우기 경로는 PATCH·DELETE만 서버로 넘긴다', async () => {
  // PATCH·DELETE 두 번을 모두 넘기므로 응답은 호출마다 새로 만든다(객체 하나를 두 번 소비하지 않게).
  const fetcher = recorder(() => new Response('{"deleted":true}', { headers: { 'content-type': 'application/json' } }));
  const proxy = createProxy({ fetcher });
  const patched = await onRequest(proxy, 'https://lovetree.example/api/board/mine/42/followup/9', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"body":"고친 덧붙임"}' });
  assert.equal(patched.status, 200, '덧붙임 고치기 PATCH는 넘긴다');
  assert.equal(fetcher.calls.at(-1).url, `${UPSTREAM}/api/board/mine/42/followup/9`);
  assert.equal(fetcher.calls.at(-1).method, 'PATCH');
  const deleted = await onRequest(proxy, 'https://lovetree.example/api/board/mine/42/followup/9', { method: 'DELETE' });
  assert.equal(deleted.status, 200, '덧붙임 지우기 DELETE는 넘긴다');
  // 허용 경로도 메서드가 밖이면 405, 번호 모양·경로 밖은 404다.
  for (const [path, method, expected] of [['/api/board/mine/42/followup/9', 'POST', 405], ['/api/board/mine/42/followup/9', 'GET', 405], ['/api/board/mine/42/followup/abc', 'PATCH', 404], ['/api/board/mine/42/followup/9/x', 'DELETE', 404]]) {
    const before = fetcher.calls.length;
    const init = method === 'GET' || method === 'DELETE' ? {method} : {method, headers: {'content-type': 'application/json'}, body: '{}'};
    const response = await onRequest(proxy, `https://lovetree.example${path}`, init);
    assert.equal(response.status, expected, `${method} ${path}: ${expected}`);
    assert.equal(fetcher.calls.length, before, '업스트림 호출 없음');
  }
});

test('운영센터 고객 자세히 판·사진 경로는 읽기만 넘기고, 모양 밖 고객 경로는 404다', async () => {
  const subject = 'sub_b200000000000000';
  const file = '01234567-89ab-4cde-8f01-234567890abc.png';
  const detailFetcher = recorder(new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }));
  const detail = await onRequest(createProxy({ fetcher: detailFetcher }), `https://lovetree.example/api/admin/customers/${subject}`, { method: 'GET' });
  assert.equal(detail.status, 200, '고객 자세히 판 GET은 넘긴다');
  assert.equal(detailFetcher.calls.at(-1).url, `${UPSTREAM}/api/admin/customers/${subject}`);

  // 사진은 이미지 응답이라 미디어 이진 통로로 넘어가야 한다(JSON만 통과시키면 502로 막힌다).
  const mediaFetcher = recorder(() => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }));
  const media = await onRequest(createProxy({ fetcher: mediaFetcher }), `https://lovetree.example/api/admin/customers/${subject}/media/${file}`, { method: 'GET' });
  assert.equal(media.status, 200, '고객 사진 GET은 넘긴다');
  assert.equal(media.headers.get('content-type'), 'image/png');

  for (const [path, method, expected] of [
    [`/api/admin/customers/${subject}`, 'POST', 405],
    [`/api/admin/customers/${subject}`, 'DELETE', 405],
    [`/api/admin/customers/${subject}/media/${file}`, 'DELETE', 405],
    ['/api/admin/customers/sub_abc/media/not-a-file.png', 'GET', 404],
    ['/api/admin/customers/sub_abc/notes', 'GET', 404]
  ]) {
    const fetcher = recorder(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const init = method === 'GET' || method === 'DELETE' ? { method } : { method, headers: { 'content-type': 'application/json' }, body: '{}' };
    const response = await onRequest(createProxy({ fetcher }), `https://lovetree.example${path}`, init);
    assert.equal(response.status, expected, `${method} ${path}: ${expected}`);
    assert.equal(fetcher.calls.length, 0, `${method} ${path}: 업스트림 호출 없음`);
  }
});

/* 사이트·관리자 화면이 실제로 부르는 /api 주소를 프록시가 모두 넘기는지 검사한다.
   서버와 사이트에만 있고 프록시 허용 목록에 빠진 경로(#671, #739 이후)를 다시 잡기 위한 것이다.
   소스의 문자열 조각('/api/trees/' + id + '/discover', `${...}` 등)을 모아 가짜 id로 경로를 맞춘다. */
const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(file, out);
    else if (/\.(?:mjs|js)$/.test(entry.name)) out.push(file);
  }
  return out;
}

const AUDITED_FUNCTION_FETCHES = [
  { file: 'functions/_lib/proxy.js', fn: 'createProxy', callee: 'fetch', kind: 'forwarder' },
  { file: 'functions/_lib/proxy.js', fn: 'onRequest', callee: 'fetcher', kind: 'production' },
  { file: 'functions/_lib/search-meta.mjs', fn: 'fetchJson', callee: 'fetcher', kind: 'production' },
  { file: 'functions/_lib/search-meta.mjs', fn: 'collectSitemapShares', callee: 'fetch', kind: 'forwarder' },
  { file: 'functions/_lib/search-meta.mjs', fn: 'createSitemap', callee: 'fetch', kind: 'forwarder' },
  { file: 'functions/_lib/tree-preview.mjs', fn: 'readShare', callee: 'fetcher', kind: 'production' },
  { file: 'functions/_lib/tree-preview.mjs', fn: 'createTreePreview', callee: 'fetch', kind: 'forwarder' },
  { file: 'functions/_lib/shared-auth.mjs', fn: 'recordAccountEmail', callee: 'fetcher', kind: 'production' },
  { file: 'functions/_lib/shared-auth.mjs', fn: 'exchange', callee: 'fetcher', kind: 'identity' },
  { file: 'functions/_lib/shared-auth.mjs', fn: 'shared', callee: 'fetcher', kind: 'identity' },
  { file: 'functions/_lib/padiem-access-verify.mjs', fn: 'keys', callee: 'fetcher', kind: 'identity' },
  { file: 'functions/index.js', fn: 'onRequest', callee: 'env.ASSETS.fetch', kind: 'asset' },
  { file: 'functions/v41/index.js', fn: 'onRequest', callee: 'env.ASSETS.fetch', kind: 'asset' }
];

function walkAst(node, fn, visit) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') fn = node.id?.name || fn;
  visit(node, fn);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) walkAst(child, fn, visit);
    } else if (value?.type) walkAst(value, fn, visit);
  }
}

function memberName(node) {
  if (node?.type !== 'MemberExpression') return '';
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
  return node.computed && node.property?.type === 'Literal' ? String(node.property.value) : '';
}

function isFetchReference(node, aliases) {
  return (node?.type === 'Identifier' && aliases.has(node.name)) || memberName(node) === 'fetch';
}

function fetchAliases(ast) {
  const aliases = new Set(['fetch', 'fetcher']);
  let changed = true;
  while (changed) {
    changed = false;
    walkAst(ast, null, node => {
      if (!((node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') ||
            (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier' && node.operator === '='))) return;
      if (isFetchReference(node.init || node.right, aliases) && !aliases.has(node.id?.name || node.left?.name)) {
        aliases.add(node.id?.name || node.left?.name);
        changed = true;
      }
    });
  }
  return aliases;
}

function parseFunctionFile(file, source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  const aliases = fetchAliases(ast);
  const counts = new Map();
  const calls = [];
  walkAst(ast, null, (node, fn) => {
    if (node.type !== 'CallExpression' || !isFetchReference(node.callee, aliases)) return;
    const callee = source.slice(node.callee.start, node.callee.end);
    const base = `${file}:${fn || '<module>'}:${callee}`;
    const index = counts.get(base) || 0;
    counts.set(base, index + 1);
    calls.push({ file, fn: fn || '<module>', callee, index, key: `${base}:${index}`, node });
  });
  return { file, source, ast, calls };
}

function functionSourceFiles(dir, out = [], unsupported = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) functionSourceFiles(file, out, unsupported);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) out.push(file);
    else if (/\.(?:jsx|ts|tsx)$/.test(entry.name)) unsupported.push(path.relative(REPO, file).split(path.sep).join('/'));
  }
  return { files: out, unsupported };
}

function namedFunction(parsed, name) {
  let found = null;
  walkAst(parsed.ast, null, node => {
    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && node.id?.name === name) found = node;
  });
  assert.ok(found, `${parsed.file}에 ${name} 함수가 있다`);
  return found;
}

function namedCall(parsed, fn, name) {
  const calls = [];
  walkAst(fn, null, node => {
    if (node.type !== 'CallExpression') return;
    const callee = parsed.source.slice(node.callee.start, node.callee.end);
    if (callee === name) calls.push(node);
  });
  assert.equal(calls.length, 1, `${parsed.file}의 ${name} 호출은 하나다`);
  return calls[0];
}

function objectValue(object, name) {
  assert.equal(object?.type, 'ObjectExpression');
  const property = object.properties.find(item => item.type === 'Property' && item.key?.name === name);
  assert.ok(property, `객체에 ${name} 속성이 있다`);
  return property.value;
}

function isProofCall(node) {
  return node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'proxyProofHeaders' &&
    node.arguments[0]?.type === 'Identifier' && node.arguments[0].name === 'env';
}

function assertDirectProof(parsed) {
  const call = namedCall(parsed, namedFunction(parsed, 'recordAccountEmail'), 'fetcher');
  const headers = objectValue(call.arguments[1], 'headers');
  assert.ok(headers.properties.some(property => property.type === 'SpreadElement' && isProofCall(property.argument)), '내부 저장소 호출이 proxyProofHeaders(env)를 붙인다');
}

function assertProxyProof(parsed) {
  const fn = namedFunction(parsed, 'createProxy');
  const call = namedCall(parsed, fn, 'fetcher');
  const headers = objectValue(call.arguments[1], 'headers');
  assert.equal(headers.type, 'Identifier');
  let setsProof = false;
  let readsSecret = false;
  walkAst(fn, null, node => {
    if (node.type === 'MemberExpression' && node.object?.type === 'Identifier' && node.object.name === 'env' && memberName(node) === 'LOVETREE_PROXY_SECRET') readsSecret = true;
    if (node.type !== 'CallExpression' || memberName(node.callee) !== 'set') return;
    if (node.callee.object?.type === 'Identifier' && node.callee.object.name === headers.name &&
        node.arguments[0]?.value === 'x-lovetree-proxy-proof' && node.arguments[1]?.type === 'Identifier' && node.arguments[1].name === 'proof') setsProof = true;
  });
  assert.ok(readsSecret && setsProof, '공용 프록시가 환경의 머리말을 실제 전달 헤더에 설정한다');
}

function assertSitemapProof(parsed) {
  const sink = namedCall(parsed, namedFunction(parsed, 'fetchJson'), 'fetcher');
  const sinkHeaders = objectValue(sink.arguments[1], 'headers');
  assert.ok(sinkHeaders.properties.some(property => property.type === 'SpreadElement' && property.argument?.name === 'extraHeaders'), 'fetchJson가 추가 머리말을 전달한다');
  const collect = namedCall(parsed, namedFunction(parsed, 'collectSitemapShares'), 'fetchJson');
  assert.equal(collect.arguments[3]?.name, 'headers', '수집 경로가 머리말을 fetchJson에 넘긴다');
  const route = namedCall(parsed, namedFunction(parsed, 'createSitemap'), 'collectSitemapShares');
  assert.ok(isProofCall(objectValue(route.arguments[0], 'headers')), '사이트맵이 proxyProofHeaders(env)를 공급한다');
}

function assertPreviewProof(parsed) {
  const sink = namedCall(parsed, namedFunction(parsed, 'readShare'), 'fetcher');
  const sinkHeaders = objectValue(sink.arguments[1], 'headers');
  assert.ok(sinkHeaders.properties.some(property => property.type === 'SpreadElement' && property.argument?.name === 'extraHeaders'), 'readShare가 추가 머리말을 전달한다');
  const route = namedCall(parsed, namedFunction(parsed, 'createTreePreview'), 'readShare');
  assert.ok(isProofCall(route.arguments[4]), '공유 미리보기가 proxyProofHeaders(env)를 공급한다');
}
function apiPathsInLine(line) {
  const literals = [...line.matchAll(/'([^']*)'|`([^`]*)`|"([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const starts = literals.filter((s) => s.startsWith('/api/'));
  const suffixes = literals.filter((s) => /^\/[A-Za-z0-9_-]+$/.test(s));
  return starts.map((raw) => {
    let p = raw.replace(/\$\{[^}]*\}/g, 'fake');
    if (p.endsWith('/')) {
      // '/api/.../'만 있는 줄은 startsWith 같은 prefix 검사다 — 같은 줄에 '/suffix'가 없으면 호출이 아니다.
      if (!suffixes.length) return null;
      p = p.slice(0, -1) + '/fake' + suffixes[0];
    }
    return p.replace(/[?].*$/, '');
  }).filter(Boolean);
}
function collectSiteApiPaths() {
  const files = [...sourceFiles(path.join(REPO, 'public', 'v41')), ...sourceFiles(path.join(REPO, 'src'))];
  const found = new Set();
  for (const file of files) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.includes('/api/')) continue;
      for (const p of apiPathsInLine(line)) if (p.startsWith('/api/')) found.add(p);
    }
  }
  // 문자열이 '/api/x/' + id 로만 끝나는 항목 경로는 위에서 걸러진다 — 가짜 id로 따로 넣는다.
  for (const p of [
    '/api/media/00000000-0000-4000-8000-000000000000.png',
    '/api/shares/fake', '/api/public/shares/fake', '/api/community/comments/fake',
    '/api/admin/feedback/42', '/api/admin/persona/fake', '/api/admin/customers/sub_fake',
    '/api/community/admin/reports/fake', '/api/board/mine/42/followup'
  ]) found.add(p);
  return found;
}
// 일부러 프록시하지 않는 경로가 생기면 여기에 이유와 함께 적는다.
const INTENTIONALLY_NOT_PROXIED = [
  // #792 ⑤: community-api.mjs의 momentStage는 '/api/community/shares/' + id + '/moments/' + id + '/stage' 조각으로
  // 만들어져 수집기가 '/shares/fake/stage'로 읽는다 — 실제 서버 경로가 아니다(무대는 순간 아래에 있다).
  // 실제 경로 '/api/community/shares/<24자>/moments/<id>/stage'는 프록시가 넘긴다(공유 번호가 20자 이상이어야 해서
  // 수집기의 가짜 id로는 프록시 정규식에 걸리지 않는다). tests/v41-community.test.mjs가 실제 모양으로 확인한다.
  { path: '/api/community/shares/fake/stage' }
];
const FAKE_IDS = ['fake', '42', 'sub_fake', '00000000-0000-4000-8000-000000000000.png'];
const METHODS = ['GET', 'PUT', 'POST', 'PATCH', 'DELETE'];

test('사이트가 부르는 /api 경로는 프록시가 모두 넘긴다', async () => {
  const paths = [...collectSiteApiPaths()].sort();
  assert.ok(paths.length > 15, `사이트 API 경로를 충분히 모았는지 확인(${paths.length}건)`);
  const missing = [];
  for (const raw of paths) {
    let forwarded = false;
    for (const id of FAKE_IDS) {
      const candidate = raw.replaceAll('fake', id);
      if (INTENTIONALLY_NOT_PROXIED.some((x) => x.path === candidate)) { forwarded = true; break; }
      for (const method of METHODS) {
        const fetcher = recorder(new Response('{}', { headers: { 'content-type': 'application/json' } }));
        const init = method === 'GET' || method === 'DELETE' ? { method } : { method, headers: { 'content-type': 'application/json' }, body: '{}' };
        const response = await onRequest(createProxy({ fetcher }), `https://lovetree.example${candidate}`, init);
        if (response.status === 200) { forwarded = true; break; }
      }
      if (forwarded) break;
    }
    if (!forwarded) missing.push(raw);
  }
  assert.deepEqual(missing, [], `프록시 허용 목록에 빠진 사이트 경로: ${missing.join(', ')}`);
});

test('서버 요청 출처 확인: 프록시가 공유 머리말을 업스트림에 붙인다', async () => {
  const fetcher = recorder(new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }));
  const proxy = createProxy({ fetcher });
  await onRequest(proxy, 'https://lovetree.example/api/workspace', { method: 'GET' }, { LOVETREE_API_ORIGIN: UPSTREAM, LOVETREE_PROXY_SECRET: 's'.repeat(48) });
  assert.equal(fetcher.calls.at(-1).headers['x-lovetree-proxy-proof'], 's'.repeat(48));
});

test('functions의 운영 API fetch는 모두 출처 확인 머리말을 전달한다', () => {
  const found = functionSourceFiles(path.join(REPO, 'functions'));
  assert.deepEqual(found.unsupported, [], '지원하지 않는 Functions 실행 파일은 있으면 안 된다');
  const parsed = found.files.map(file => parseFunctionFile(path.relative(REPO, file).split(path.sep).join('/'), readFileSync(file, 'utf8')));
  const expected = AUDITED_FUNCTION_FETCHES.map(item => `${item.file}:${item.fn}:${item.callee}:0`).sort();
  const actual = parsed.flatMap(item => item.calls.map(call => call.key)).sort();
  const missing = expected.filter(key => !actual.includes(key));
  const unknown = actual.filter(key => !expected.includes(key));
  assert.deepEqual({ missing, unknown }, { missing: [], unknown: [] }, '새 fetch·별칭·멤버 호출은 검토 목록에 없으면 실패한다');
  assert.equal(AUDITED_FUNCTION_FETCHES.filter(item => item.kind === 'production').length, 4, '운영 API 전달 경로 네 곳을 모두 검사한다');

  const byFile = new Map(parsed.map(item => [item.file, item]));
  assertProxyProof(byFile.get('functions/_lib/proxy.js'));
  assertSitemapProof(byFile.get('functions/_lib/search-meta.mjs'));
  assertPreviewProof(byFile.get('functions/_lib/tree-preview.mjs'));
  assertDirectProof(byFile.get('functions/_lib/shared-auth.mjs'));
});

test('#1175 연결이 안 될 때만 한 번 더 부르고, 서버에 닿은 뒤 실패는 재전송하지 않는다', async () => {
  const sleeps = [];
  let attempts = 0;
  const flaky = createProxy({
    retryDelayMs: 1500,
    sleep: ms => { sleeps.push(ms); return Promise.resolve(); },
    fetcher: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('connect refused');
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }
  });
  const ok = await onRequest(flaky, 'https://lovetree.example/auth/callback?code=x');
  assert.equal(ok.status, 200, '연결 거부 1회 뒤 성공하면 정상 응답');
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [1500], '1~2초 쉬고 한 번 더');

  let calls = 0;
  const reachedSleeps = [];
  const reached = createProxy({
    sleep: ms => { reachedSleeps.push(ms); return Promise.resolve(); },
    fetcher: async () => { calls += 1; return Response.json({ error: { code: 'x' } }, { status: 500 }); }
  });
  const failed = await onRequest(reached, 'https://lovetree.example/auth/callback?code=x');
  assert.equal(failed.status, 500, '서버가 받은 뒤의 실패는 그대로 전달');
  assert.equal(calls, 1, '서버에 닿았으면 다시 보내지 않는다');
  assert.deepEqual(reachedSleeps, [], '재전송하지 않으므로 대기도 없다');

  let posts = 0;
  const withBody = createProxy({
    sleep: () => Promise.resolve(),
    fetcher: async () => { posts += 1; throw new TypeError('refused'); }
  });
  const post = await onRequest(withBody, 'https://lovetree.example/api/workspace', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 502);
  assert.equal(posts, 1, '본문이 있는 요청은 연결 실패여도 다시 보내지 않는다');
});
