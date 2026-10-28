import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ApiError } from '../server/errors.js';
import { createAuthorityRelayClient } from '../server/authority-relay-transport.js';

const SECRET = 'caller-secret-value';
const SID = 'sess_0123456789abcdef0123456789abcdef';

function serve(handler) {
  return new Promise(resolve => {
    const server = createServer((req, res) => handler(req, res));
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      url: `http://127.0.0.1:${server.address().port}/resolve-session`,
      close: () => new Promise(done => server.close(done))
    }));
  });
}

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

test('the transport posts exactly the relay contract and maps the verified identity', async () => {
  const seen = {};
  const ended = await serve((req, res) => {
    seen.method = req.method;
    seen.path = req.url;
    seen.auth = req.headers.authorization;
    seen.type = req.headers['content-type'];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      seen.body = JSON.parse(body);
      json(res, 200, { ok: true, identity: { session_id: SID, product_id: 'lovetree-4-0', subject_id: 'sub_9f2c1a', expires_at: '2999-01-01T00:00:00.000Z' } });
    });
  });
  try {
    const client = createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET });
    assert.deepEqual(await client.resolveIdentity({ sessionId: SID }), {
      sessionId: SID, productId: 'lovetree-4-0', subjectId: 'sub_9f2c1a', expiresAt: '2999-01-01T00:00:00.000Z'
    });
    assert.equal(seen.method, 'POST');
    assert.equal(seen.path, '/resolve-session');
    assert.equal(seen.type, 'application/json');
    assert.equal(seen.auth, `Bearer ${SECRET}`);
    assert.deepEqual(seen.body, { session_id: SID });
  } finally { await ended.close(); }
});

for (const [name, respond, expected] of [
  ['a session the relay refused', (res) => json(res, 401, { ok: false, error: { code: 'unauthenticated', message: 'no' } }), 401],
  ['a caller secret the relay rejected', (res) => json(res, 401, { ok: false, error: { code: 'unauthorized', message: 'Invalid or missing caller bearer token.' } }), 503],
  ['a rejected request shape', (res) => json(res, 400, { ok: false, error: { code: 'invalid_request', message: 'no' } }), 503],
  ['an oversized relay answer', (res) => json(res, 502, { ok: false, error: { code: 'authority_response_too_large', message: 'no' } }), 503],
  ['an unavailable authority', (res) => json(res, 503, { ok: false, error: { code: 'authority_unavailable', message: 'no' } }), 503],
  ['an empty envelope missing ok', (res) => json(res, 200, { identity: {} }), 503],
  ['a non-contract identity shape', (res) => json(res, 200, { ok: true, identity: { product_id: 'lovetree-4-0' } }), 503],
  ['a body that is not JSON', (res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('nope'); }, 503],
  ['a dropped connection', (res) => { res.destroy(); }, 503]
]) {
  test(`the transport closes the door on ${name}`, async () => {
    const ended = await serve((_req, res) => respond(res));
    try {
      const client = createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET, timeoutMs: 500 });
      await assert.rejects(() => client.resolveIdentity({ sessionId: SID }), error => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, expected);
        assert.equal(error.code, expected === 401 ? 'unauthenticated' : 'auth_unavailable');
        assert.doesNotMatch(`${error.message}`, new RegExp(SECRET));
        return true;
      });
    } finally { await ended.close(); }
  });
}

test('the timeout really cancels the request instead of leaving it running', async () => {
  let answered = false;
  let closed = false;
  const ended = await serve((_req, res) => {
    res.on('close', () => { closed = true; });
    setTimeout(() => { if (!closed) { answered = true; json(res, 200, { ok: true, identity: {} }); } }, 200);
  });
  try {
    const client = createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET, timeoutMs: 30 });
    await assert.rejects(() => client.resolveIdentity({ sessionId: SID }), error => error.status === 503);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(closed, true, 'abort가 소켓을 닫지 않았다');
    assert.equal(answered, false, '취소된 요청에 응답이 실렸다');
  } finally { await ended.close(); }
});

test('unreachable relay and missing configuration refuse without leaking the secret', async () => {
  assert.throws(() => createAuthorityRelayClient({ url: '', callerSecret: SECRET }), /LOVETREE_AUTHORITY_RELAY_URL/);
  assert.throws(() => createAuthorityRelayClient({ url: 'https://relay.example', callerSecret: '' }), /LOVETREE_CALLER_SECRET/);
  assert.throws(() => createAuthorityRelayClient({ url: 'ftp://relay', callerSecret: SECRET }), /https/);
  assert.throws(() => createAuthorityRelayClient({ url: 'http://relay.example/resolve-session', callerSecret: SECRET }), /loopback/);
  assert.equal(createAuthorityRelayClient({ url: 'https://relay.example/resolve-session', callerSecret: SECRET }) !== undefined, true);
  assert.throws(() => createAuthorityRelayClient({ url: `http://127.0.0.1:9/resolve-session`, callerSecret: '' }), /LOVETREE_CALLER_SECRET/);
  const client = createAuthorityRelayClient({ url: 'http://127.0.0.1:1/resolve-session', callerSecret: SECRET, timeoutMs: 300 });
  await assert.rejects(() => client.resolveIdentity({ sessionId: SID }), error => {
    assert.equal(error.status, 503);
    assert.doesNotMatch(`${error.code} ${error.message}`, new RegExp(SECRET));
    return true;
  });
});

test('the session id is bounded before any request leaves', async () => {
  let reached = false;
  const ended = await serve((_req, res) => { reached = true; json(res, 200, { ok: true, identity: {} }); });
  try {
    const client = createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET });
    for (const bad of ['', null, 'sess_!bad', `s${'x'.repeat(200)}`]) {
      await assert.rejects(() => client.resolveIdentity({ sessionId: bad }), error => error.status === 401);
    }
    assert.equal(reached, false);
  } finally { await ended.close(); }
});

test('a relay that sends headers then stalls the body is cancelled and closes as 503', async () => {
  let closed = false;
  let completed = false;
  const ended = await serve((_req, res) => {
    res.on('close', () => { closed = true; });
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '400' });
    res.write('{"ok":true,"identity":{');
    setTimeout(() => { if (!closed) { completed = true; res.end('}}'); } }, 250);
  });
  try {
    const client = createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET, timeoutMs: 40 });
    await assert.rejects(() => client.resolveIdentity({ sessionId: SID }), error => error.status === 503);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(closed, true, '본문 정지까지 취소되지 않았다');
    assert.equal(completed, false, '취소된 응답이 끝까지 실렸다');
  } finally { await ended.close(); }
});

test('an oversized relay body is refused at the client cap', async () => {
  const padded = 'y'.repeat(4000);
  const ended = await serve((_req, res) => json(res, 200, { ok: true, identity: { session_id: SID, product_id: 'lovetree-4-0', subject_id: padded, expires_at: '2999-01-01T00:00:00.000Z' } }));
  const notes = [];
  try {
    const client = createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET, maxResponseBytes: 512, onUnavailable: code => notes.push(code) });
    await assert.rejects(() => client.resolveIdentity({ sessionId: SID }), error => {
      assert.equal(error.status, 503);
      assert.doesNotMatch(`${error.code} ${error.message}`, new RegExp(padded.slice(0, 20)));
      return true;
    });
    assert.deepEqual(notes, [{ code: 'relay_response_too_large' }]);
    assert.throws(() => createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET, maxResponseBytes: 0 }), /응답 크기 상한/);
  } finally { await ended.close(); }
});

test('a slow body is cut by the same deadline that covered the headers', async () => {
  const ended = await serve((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"ok":true,"identity":{"session_id":"');
    setTimeout(() => { res.end(`${SID}", "product_id":"lovetree-4-0","subject_id":"sub_1","expires_at":"2999-01-01T00:00:00.000Z"}}`); }, 200);
  });
  try {
    const client = createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET, timeoutMs: 60 });
    await assert.rejects(() => client.resolveIdentity({ sessionId: SID }), error => error.status === 503);
    const fast = createAuthorityRelayClient({ url: ended.url, callerSecret: SECRET, timeoutMs: 1_000 });
    assert.deepEqual(await fast.resolveIdentity({ sessionId: SID }), { sessionId: SID, productId: 'lovetree-4-0', subjectId: 'sub_1', expiresAt: '2999-01-01T00:00:00.000Z' });
  } finally { await ended.close(); }
});
