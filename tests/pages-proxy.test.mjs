import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiProxy, handleProxy, normalizeOrigin, PROXY_ORIGIN_ENV } from '../proxy/pages-api-proxy.js';

const COM2 = 'https://com2.internal.example';

function recorded(response) {
  const seen = [];
  return {
    seen,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return response ?? new Response(JSON.stringify({ revision: 0, savedAt: null, state: { version: 1, trees: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
  };
}

const request = (path, init = {}) => new Request(`https://lovetree.example${path}`, init);

async function jsonOf(response) {
  return JSON.parse(await response.text());
}

test('대상 origin은 배포 설정이 고정하고 모양을 어기면 닫는다', () => {
  assert.equal(normalizeOrigin('https://com2.example'), 'https://com2.example');
  assert.equal(normalizeOrigin('https://com2.example:8443/'), 'https://com2.example:8443');
  assert.equal(normalizeOrigin('http://127.0.0.1:8791'), 'http://127.0.0.1:8791');
  for (const bad of ['', 'com2.example', 'http://com2.example', 'https://user:pw@com2.example', 'https://com2.example?x=1', 'https://com2.example/api', 'https://#frag']) {
    assert.throws(() => normalizeOrigin(bad), /proxy_origin_/);
  }
});

test('설정이 없거나 틀린 배포는 HTML이 아니라 JSON 503으로 닫는다', async () => {
  for (const value of ['', 'http://not-loopback.example']) {
    const proxy = createApiProxy({ env: { [PROXY_ORIGIN_ENV]: value }, fetchImpl: () => { throw new Error('호출되면 안 된다'); } });
    const answer = await proxy(request('/api/workspace'));
    assert.equal(answer.status, 503);
    assert.match(answer.headers.get('content-type'), /application\/json/);
    assert.equal((await jsonOf(answer)).error.code, 'proxy_not_configured');
  }
});

test('닫힌 목록 밖의 경로와 메서드는 프록시가 직접 거둔다', async () => {
  const gate = recorded();
  const proxy = createApiProxy({ env: { [PROXY_ORIGIN_ENV]: COM2 }, fetchImpl: gate.fetchImpl });
  for (const [path, method, status, code] of [
    ['/api/other', 'GET', 404, 'not_found'],
    ['/api/workspace/admin', 'GET', 404, 'not_found'],
    ['/auth/login', 'POST', 405, 'method_not_allowed'],
    ['/auth/logout', 'GET', 405, 'method_not_allowed'],
    ['/assets/index.js', 'GET', 404, 'not_found']
  ]) {
    const answer = await proxy(request(path, { method }));
    assert.equal(answer.status, status, `${method} ${path}`);
    assert.equal((await jsonOf(answer)).error.code, code);
  }
  assert.deepEqual(gate.seen, [], '거부한 요청은 COM2로 가지 않는다');
});

test('메서드·query·본문·쿠키가 그대로 지나가고 서버 간 비밀은 싣지 않는다', async () => {
  const gate = recorded();
  const proxy = createApiProxy({ env: { [PROXY_ORIGIN_ENV]: COM2 }, fetchImpl: gate.fetchImpl });
  const body = JSON.stringify({ state: { version: 1, trees: [] }, expectedRevision: 0, clientKey: 'ck-1' });
  const answer = await proxy(request('/api/workspace', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', accept: 'application/json', cookie: 'lovetree_session=abc', connection: 'keep-alive', host: 'lovetree.example' },
    body
  }));
  assert.equal(answer.status, 200);
  const [sent] = gate.seen;
  assert.equal(sent.url, `${COM2}/api/workspace`);
  assert.equal(sent.init.method, 'PUT');
  assert.equal(await new Response(sent.init.body).text(), body, '본문은 갈리지 않는다');
  assert.equal(sent.init.headers.get('content-type'), 'application/json');
  assert.equal(sent.init.headers.get('cookie'), 'lovetree_session=abc');
  assert.equal(sent.init.headers.get('host'), null, '앞원진 Host를 넘기지 않는다');
  assert.equal(sent.init.headers.get('connection'), null);
  for (const name of ['authorization', 'x-lovetree-caller-secret', 'x-forwarded-host', 'x-forwarded-proto']) {
    assert.equal(sent.init.headers.get(name), null, `${name}은 이 경로를 지나지 않는다`);
  }

  const query = await proxy(request('/auth/callback?code=lovt_abc&state=xyz123'));
  assert.equal(query.status, 200);
  assert.equal(gate.seen.at(-1).url, `${COM2}/auth/callback?code=lovt_abc&state=xyz123`, 'query는 순서와 값 그대로');
});

test('상태 코드·Location·Set-Cookie를 재작성 없이 보존하고 302를 따라가지 않는다', async () => {
  const upstream = new Response(null, {
    status: 302,
    statusText: 'Found',
    headers: [
      ['location', 'https://login.padiem.example/start?state=abc'],
      ['set-cookie', 'lovetree_oauth_state=v; HttpOnly; SameSite=Lax; Path=/; Max-Age=600'],
      ['set-cookie', 'lovetree_session=t; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600'],
      ['cache-control', 'private']
    ]
  });
  const gate = recorded(upstream);
  const proxy = createApiProxy({ env: { [PROXY_ORIGIN_ENV]: COM2 }, fetchImpl: gate.fetchImpl });
  const answer = await proxy(request('/auth/login?next=/'));

  assert.equal(answer.status, 302);
  assert.equal(answer.headers.get('location'), 'https://login.padiem.example/start?state=abc');
  assert.deepEqual(answer.headers.getSetCookie(), [
    'lovetree_oauth_state=v; HttpOnly; SameSite=Lax; Path=/; Max-Age=600',
    'lovetree_session=t; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600'
  ], '쿠키 두 개가 한 줄로 섞이지 않는다');
  assert.equal(answer.headers.get('cache-control'), 'no-store', '세션 경로는 캐시에 남기지 않는다');
  assert.equal(gate.seen.length, 1, '리다이렉트를 따라가지 않는다');
});

test('409와 401도 왜곡되지 않고 그대로 지나간다', async () => {
  const clash = new Response(JSON.stringify({ error: { code: 'revision_conflict', message: '다른 곳에서 먼저 저장했어요.', currentRevision: 9 } }), {
    status: 409,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
  const proxy = createApiProxy({ env: { [PROXY_ORIGIN_ENV]: COM2 }, fetchImpl: async () => clash });
  const answer = await proxy(request('/api/workspace', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(answer.status, 409);
  assert.equal((await jsonOf(answer)).error.currentRevision, 9);
});

test('COM2가 죽으면 HTML 성공이 아니라 JSON 502다', async () => {
  const proxy = createApiProxy({ env: { [PROXY_ORIGIN_ENV]: COM2 }, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  const answer = await proxy(request('/api/workspace'));
  assert.equal(answer.status, 502);
  assert.match(answer.headers.get('content-type'), /application\/json/);
  assert.equal((await jsonOf(answer)).error.code, 'upstream_unavailable');
});

test('진입점은 배포 설정을 읽고 설정이 없으면 닫힌다', async () => {
  const missing = await handleProxy({ request: request('/api/workspace'), env: {} });
  assert.equal(missing.status, 503, '설정 없는 배포는 닫혀 있다');
  const broken = await handleProxy({ request: request('/api/workspace'), env: { [PROXY_ORIGIN_ENV]: 'not a url' } });
  assert.equal(broken.status, 503);
  assert.equal((await jsonOf(broken)).error.code, 'proxy_not_configured');
});
