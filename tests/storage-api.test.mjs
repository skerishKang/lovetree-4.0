import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import { addMoment, createTree, linkMoments, validateState } from '../src/domain.js';
import { ApiError } from '../server/errors.js';
import { createApiHandler, createNodeHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';

const unhandled = [];
const captureUnhandled = error => unhandled.push(error);
process.on('unhandledRejection', captureUnhandled);
after(() => process.off('unhandledRejection', captureUnhandled));

const PRODUCT = 'lovetree-test';
const CLOCK = '2026-10-27T00:00:00.000Z';
const base = { subject: '윤슬', note: '오래 기억하고 싶은 마음', emotion: '설렘', date: '2026-10-27', url: '' };

function sampleState() {
  const first = createTree({ ...base, title: '첫 목소리' }, CLOCK);
  const rootId = first.moments[0].id;
  const second = addMoment(first, { ...base, title: '함께 부른 노래', relation: '직접 만나고 싶어서' }, rootId, CLOCK);
  const third = addMoment(second, { ...base, title: '돌아오는 길', relation: '노래가 남아서' }, second.moments[1].id, CLOCK);
  return { version: 1, trees: [linkMoments(third, second.moments[1].id, third.moments[2].id, CLOCK)] };
}

function buildHandle({ repo = createMemoryWorkspaceRepo(), principal = { productId: PRODUCT, subjectId: 'usr_a' }, mode = 'ok', maxBodyBytes } = {}) {
  const service = createWorkspaceService({ repo, productId: PRODUCT });
  const authenticate = async () => {
    if (mode === 'none') return null;
    if (mode === 'unconfigured') throw new ApiError(503, 'auth_unavailable', '로그인 연결이 아직 준비되지 않았어요.');
    if (mode === 'boom') throw new Error('연결 내부 오류');
    // 테스트 전용 주입. 실제 서버에서는 인증 어댑터가 요청에서 검증된 principal을 만든다.
    return principal;
  };
  return { handle: createApiHandler({ authenticate, service, productId: PRODUCT, maxBodyBytes }), repo, service };
}

const put = (handle, payload, extra = {}) => handle({
  method: 'PUT', path: '/api/workspace', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), ...extra
});
const get = (handle, extra = {}) => handle({ method: 'GET', path: '/api/workspace', headers: {}, ...extra });

test('save then read preserves ids, parents, links and order', async () => {
  const { handle } = buildHandle();
  const state = sampleState();
  const saved = await put(handle, { state, expectedRevision: 0, clientKey: 'k-1' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 1);
  const read = await get(handle);
  assert.deepEqual(read.body.state, validateState(state));
  const moments = read.body.state.trees[0].moments;
  assert.deepEqual(moments.map(m => m.id), state.trees[0].moments.map(m => m.id));
  assert.deepEqual(moments.map(m => m.parentId), state.trees[0].moments.map(m => m.parentId));
  assert.deepEqual(moments.map(m => m.links), state.trees[0].moments.map(m => m.links));
});

test('first save starts at revision 0 and each accepted save advances one', async () => {
  const { handle } = buildHandle();
  const state = sampleState();
  assert.equal((await put(handle, { state, expectedRevision: 0, clientKey: 'k-1' })).body.revision, 1);
  const next = { version: 1, trees: [addMoment(state.trees[0], { ...base, title: '다음이 생각남' }, state.trees[0].moments[0].id, CLOCK)] };
  assert.equal((await put(handle, { state: next, expectedRevision: 1, clientKey: 'k-2' })).body.revision, 2);
  assert.equal((await get(handle)).body.revision, 2);
});

test('users cannot reach each other workspace', async () => {
  const repo = createMemoryWorkspaceRepo();
  const alice = buildHandle({ repo, principal: { productId: PRODUCT, subjectId: 'usr_a' } }).handle;
  const bob = buildHandle({ repo, principal: { productId: PRODUCT, subjectId: 'usr_b' } }).handle;
  await put(alice, { state: sampleState(), expectedRevision: 0, clientKey: 'k-1' });
  const read = await get(bob);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, { revision: 0, savedAt: null, state: { version: 1, trees: [] } });
});

test('productId and uid inside the body are never identity', async () => {
  const repo = createMemoryWorkspaceRepo();
  const alice = buildHandle({ repo, principal: { productId: PRODUCT, subjectId: 'usr_a' } }).handle;
  const forged = { ...sampleState(), trees: sampleState().trees };
  const result = await put(alice, { state: forged, expectedRevision: 0, clientKey: 'k-1', uid: 'usr_b', productId: 'other' });
  assert.equal(result.status, 200);
  const asBob = buildHandle({ repo, principal: { productId: PRODUCT, subjectId: 'usr_b' } }).handle;
  assert.equal((await get(asBob)).body.revision, 0);
});

test('a session from another product is refused', async () => {
  const { handle } = buildHandle({ principal: { productId: 'b62', subjectId: 'usr_a' } });
  const result = await get(handle);
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, 'product_mismatch');
});

test('missing login and unconfigured login are both refused without a bypass', async () => {
  assert.equal((await get(buildHandle({ mode: 'none' }).handle)).body.error.code, 'unauthenticated');
  const unconfigured = await get(buildHandle({ mode: 'unconfigured' }).handle);
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfigured.body.error.code, 'auth_unavailable');
});

test('an adapter crash surfaces no internal detail', async () => {
  const result = await get(buildHandle({ mode: 'boom' }).handle);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: { code: 'auth_unavailable', message: '로그인 연결에 문제를 만났어요.' } });
});

test('same key and same request replays the first result', async () => {
  const { handle } = buildHandle();
  const payload = { state: sampleState(), expectedRevision: 0, clientKey: 'k-1' };
  const first = await put(handle, payload);
  const replay = await put(handle, payload);
  assert.deepEqual(replay.body, first.body);
  assert.equal((await get(handle)).body.revision, 1);
});

test('same key with a different request is refused', async () => {
  const { handle } = buildHandle();
  await put(handle, { state: sampleState(), expectedRevision: 0, clientKey: 'k-1' });
  const other = { version: 1, trees: [createTree({ ...base, title: '다른 첫 순간' }, CLOCK)] };
  const result = await put(handle, { state: other, expectedRevision: 0, clientKey: 'k-1' });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'client_key_conflict');
});

test('the loser of a revision race is told the current revision', async () => {
  const { handle } = buildHandle();
  const state = sampleState();
  await put(handle, { state, expectedRevision: 0, clientKey: 'k-1' });
  const grown = { version: 1, trees: [addMoment(state.trees[0], { ...base, title: '뒤늦게 생각남' }, state.trees[0].moments[0].id, CLOCK)] };
  const clash = await Promise.all([
    put(handle, { state: grown, expectedRevision: 1, clientKey: 'k-2' }),
    put(handle, { state: grown, expectedRevision: 1, clientKey: 'k-3' })
  ]);
  const codes = clash.map(r => r.body.error?.code).filter(Boolean);
  assert.deepEqual(clash.filter(r => r.status === 200).length, 1);
  assert.deepEqual(codes, ['revision_conflict']);
  assert.deepEqual(clash.find(r => r.status === 409).body.error, {
    code: 'revision_conflict',
    message: '다른 곳에서 먼저 저장했어요. 최신 기록을 불러온 뒤 다시 시도해 주세요.',
    currentRevision: 2
  });
});

test('a rejected document leaves the stored document untouched', async () => {
  const { handle } = buildHandle();
  const state = sampleState();
  await put(handle, { state, expectedRevision: 0, clientKey: 'k-1' });
  const before = await get(handle);

  const broken = structuredClone(state);
  broken.trees[0].moments[1].links = ['없는-순간-id'];
  const orphan = await put(handle, { state: broken, expectedRevision: 1, clientKey: 'k-2' });
  assert.equal(orphan.status, 400);
  assert.equal(orphan.body.error.code, 'invalid_document');

  const twoRoots = structuredClone(state);
  twoRoots.trees[0].moments[1].parentId = null;
  assert.equal((await put(handle, { state: twoRoots, expectedRevision: 1, clientKey: 'k-3' })).body.error.code, 'invalid_document');

  const cycle = structuredClone(state);
  cycle.trees[0].moments[0].parentId = cycle.trees[0].moments[2].id;
  assert.equal((await put(handle, { state: cycle, expectedRevision: 1, clientKey: 'k-4' })).body.error.code, 'invalid_document');

  assert.equal((await put(handle, { state: { version: 2, trees: [] }, expectedRevision: 1, clientKey: 'k-5' })).body.error.code, 'invalid_document');
  assert.equal((await put(handle, { state, expectedRevision: 1, clientKey: 'no key!' })).body.error.code, 'invalid_client_key');
  assert.equal((await put(handle, { state, expectedRevision: -1, clientKey: 'k-6' })).body.error.code, 'invalid_revision');
  assert.deepEqual(await get(handle), before);
});

test('oversized and malformed requests are refused', async () => {
  const { handle } = buildHandle({ maxBodyBytes: 256 });
  const big = await put(handle, { state: sampleState(), expectedRevision: 0, clientKey: 'k-1' });
  assert.equal(big.status, 413);
  assert.equal(big.body.error.code, 'payload_too_large');

  const plain = buildHandle();
  assert.equal((await plain.handle({ method: 'PUT', path: '/api/workspace', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415);
  assert.equal((await plain.handle({ method: 'PUT', path: '/api/workspace', headers: { 'content-type': 'application/json' }, body: '{oops' })).body.error.code, 'invalid_json');
  assert.equal((await get(plain.handle, { path: '/api/unknown' })).body.error.code, 'not_found');
  assert.equal((await plain.handle({ method: 'DELETE', path: '/api/workspace', headers: {} })).body.error.code, 'method_not_allowed');
});

test('GET and PUT work over a real socket', async () => {
  const { handle } = buildHandle();
  const server = createServer(createNodeHandler(handle));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const empty = await fetch(`${origin}/api/workspace`);
    assert.equal(empty.status, 200);
    assert.equal((await empty.json()).revision, 0);
    const saved = await fetch(`${origin}/api/workspace`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: sampleState(), expectedRevision: 0, clientKey: 'k-1' })
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).revision, 1);
    assert.equal((await (await fetch(`${origin}/api/workspace`)).json()).revision, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('형식이 잘못된 문서의 내부 오류 문장은 응답에 싣지 않는다', async () => {
  const { handle } = buildHandle();
  const brokenUrl = structuredClone(sampleState());
  brokenUrl.trees[0].moments[0].url = {};
  const result = await put(handle, { state: brokenUrl, expectedRevision: 0, clientKey: 'k-1' });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'invalid_document');
  assert.equal(result.body.error.message, '기록 형식을 확인해 주세요.');
  assert.doesNotMatch(JSON.stringify(result.body), /is not a function|undefined is not|Cannot read/);

  const deep = { version: 1, trees: [{ id: 't', subject: '윤슬', title: '긴 제목'.repeat(1), createdAt: CLOCK, updatedAt: CLOCK, moments: [{ id: 'a', title: 'a'.repeat(10_000), note: 'n', emotion: '설렘', date: '2026-10-27', url: '', parentId: null, links: [], createdAt: CLOCK }] }] };
  assert.equal((await put(handle, { state: deep, expectedRevision: 0, clientKey: 'k-2' })).body.error.message, '순간 제목을(를) 1~80자로 적어 주세요.');
});

test('격리 테스트 DB 가드는 loopback과 테스트 DB 이름을 모두 요구한다', () => {
  assert.equal(assertIsolatedTestDatabase('postgres://postgres:ci@127.0.0.1:5432/lovetree_test_ci').hostname, '127.0.0.1');
  assert.throws(() => assertIsolatedTestDatabase('postgres://postgres:ci@127.0.0.1:5432/prod_chat'), /lovetree_test_ 접두사/);
  assert.throws(() => assertIsolatedTestDatabase('postgres://pooler.neon.example:5432/lovetree_test_ci'), /loopback/);
  assert.throws(() => assertIsolatedTestDatabase('mysql://127.0.0.1:3306/lovetree_test_ci'), /postgres/);
  assert.throws(() => assertIsolatedTestDatabase(''), /다른 연결 문자열로 대체하지/);
  assert.throws(() => assertIsolatedTestDatabase(undefined), /다른 연결 문자열로 대체하지/);
});

test('큰 본문은 413으로 응답하고 끊긴 요청은 서버를 쓰러뜨리지 않는다', async () => {
  const { handle } = buildHandle({ maxBodyBytes: 64 });
  const server = createServer(createNodeHandler(handle, { maxBodyBytes: 64 }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const padded = { ...sampleState(), note: '길게'.repeat(200) };
    const big = await fetch(`http://127.0.0.1:${port}/api/workspace`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(padded)
    });
    assert.equal(big.status, 413);
    assert.equal((await big.json()).error.code, 'payload_too_large');

    await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.on('error', reject);
      socket.write(`PUT /api/workspace HTTP/1.1\r\nhost: 127.0.0.1\r\ncontent-type: application/json\r\ncontent-length: 4000\r\n\r\n{"state":`);
      setTimeout(() => { socket.destroy(); resolve(); }, 60);
    });

    const after = await fetch(`http://127.0.0.1:${port}/api/workspace`);
    assert.equal(after.status, 200);
    assert.equal((await after.json()).revision, 0);
    assert.deepEqual(unhandled, []);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
