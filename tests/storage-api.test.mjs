import { listenOnSafePort } from './helpers/safe-port.mjs';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import net from 'node:net';
import { createWorkspaceApi, refreshUnauthorized } from '../public/v41/api.mjs';
import { setVisitMode } from '../public/v41/visit-mode.mjs';
import { createMemberSession } from '../public/v41/member-session.mjs';
import { addMoment, createTree, linkMoments, validateState } from '../src/domain.js';
import { ApiError } from '../server/errors.js';
import { createApiHandler, createNodeHandler } from '../server/http.js';
import { createWorkspaceService, readStoredDocument } from '../server/workspace-service.js';
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

test('방문 모드는 저장 요청을 fetch 전에 막고 읽기와 방문 종료 뒤 저장은 유지한다', async (t) => {
  setVisitMode(true);
  t.after(() => setVisitMode(false));
  const calls = [], warnings = [], originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  t.after(() => { console.warn = originalWarn; });
  const api = createWorkspaceApi({fetchImpl:async () => {
    calls.push('fetch');
    return Response.json({revision:0,state:{version:1,trees:[]}});
  }});
  assert.equal((await api.get()).ok, true);
  assert.deepEqual(calls, ['fetch']);
  for (const answer of [await api.put({}), await api.removeMedia('사진', 'subject')]) {
    assert.equal(answer.ok, false);
    assert.equal(answer.status, 403);
    assert.equal(answer.code, 'visit_read_only');
  }
  assert.deepEqual(calls, ['fetch']);
  assert.equal(warnings.length, 2);
  assert.match(String(warnings[0][0]), /저장 요청을 보내지 않았어요/);
  setVisitMode(false);
  globalThis.LT41_VISIT_READ_ONLY = true;
  assert.equal((await api.put({})).code, 'visit_read_only');
  globalThis.LT41_VISIT_READ_ONLY = false;
  assert.equal((await api.put({})).ok, true);
  assert.deepEqual(calls, ['fetch', 'fetch']);
  assert.equal(warnings.length, 3);
});

test('방문 전역 표시는 인증 갱신 POST도 보내지 않는다', async (t) => {
  setVisitMode(false);
  globalThis.LT41_VISIT_READ_ONLY = true;
  t.after(() => { globalThis.LT41_VISIT_READ_ONLY = false; });
  const calls = [];
  const response = new Response(null, {status:401});
  const answer = await refreshUnauthorized({
    fetchImpl:async () => { calls.push('refresh'); return new Response(null, {status:204}); },
    request:async () => new Response(null, {status:200}),
    response
  });
  assert.equal(answer, response);
  assert.deepEqual(calls, []);
});

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

test('트리별 열 화면은 서버에 저장되고 한 트리를 바꿔도 재로그인 뒤 다른 트리의 값이 유지된다', async (t) => {
  const { handle } = buildHandle();
  const views = ['tree', 'board', 'book', 'network'];
  const trees = views.map(openView => createTree({ ...base, title: '첫 순간', openView }, CLOCK));
  const saved = await put(handle, { state: { version: 1, trees }, expectedRevision: 0, clientKey: 'open-view-1' });
  assert.equal(saved.status, 200);
  const viewList = state => state.trees.map(tree => tree.openView);
  assert.deepEqual(viewList((await get(handle)).body.state), views);

  const api = createWorkspaceApi({ fetchImpl: async (path, request) => {
    if (path === '/auth/logout') return Response.json({ ok: true });
    const result = await handle({ ...request, path, query: new URLSearchParams({ features: 'bound-writes' }) });
    return Response.json(result.body, { status: result.status });
  } });
  const login = () => {
    const session = createMemberSession({ api, draftStorage: null, cacheStorage: null, delay: () => new Promise(() => {}) });
    t.after(() => session.dispose());
    return session;
  };
  const first = login();
  await first.start();
  first.apply('editTree', { ...trees[0], openView: 'book' }, { treeId: trees[0].id });
  await first.act('retry');
  assert.equal(first.snapshot().dirty, false);
  await first.act('logout');
  assert.equal(first.snapshot().owned, false);
  assert.equal(first.state().trees.length, 0);

  const next = login();
  await next.start();
  assert.equal(next.snapshot().writable, true);
  assert.deepEqual(viewList(next.state()), ['book', 'board', 'book', 'network']);
  assert.deepEqual(next.state().trees.slice(1), trees.slice(1));
});

test('열 화면이 없던 저장 요청은 배포 뒤에도 재전송할 수 있고 다른 열 화면이면 충돌한다', async () => {
  const { handle, repo } = buildHandle();
  const doc = validateState(sampleState());
  for (const tree of doc.trees) delete tree.openView;
  const clientKey = 'saved-before-open-view';
  const expectedRevision = 0;
  const requestHash = createHash('sha256').update(JSON.stringify(doc) + '\n' + expectedRevision, 'utf8').digest('hex');
  const previous = await repo.commit({ productId: PRODUCT, subjectId: 'usr_a', doc, clientKey, expectedRevision, requestHash });
  assert.equal(previous.status, 'saved');
  assert.equal((await get(handle)).body.state.trees[0].openView, 'tree');

  const replay = await put(handle, { state: doc, expectedRevision, clientKey });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.revision, previous.revision);
  doc.trees[0].openView = 'board';
  const conflict = await put(handle, { state: doc, expectedRevision, clientKey });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'client_key_conflict');
});

test('cached media metadata survives a save and is returned on the next read', async () => {
  const { handle } = buildHandle();
  const tree = sampleState().trees[0];
  const withMedia = addMoment(tree, {
    ...base, title: '다시 본 무대 영상', url: 'https://youtu.be/dQw4w9WgXcQ?t=83',
    mediaMetadata: { title: '무대 영상', channel: '윤슬 채널', source: 'youtu.be' }
  }, tree.moments[0].id, CLOCK);
  assert.equal((await put(handle, { state: { version: 1, trees: [withMedia] }, expectedRevision: 0, clientKey: 'k-1' })).status, 200);
  const read = await get(handle);
  const moment = read.body.state.trees[0].moments.find(m => m.url.startsWith('https://youtu.be/'));
  assert.deepEqual(moment.mediaMetadata, { title: '무대 영상', channel: '윤슬 채널', source: 'youtu.be' });
});

test('media metadata source is always re-derived from the moment link', async () => {
  const { handle } = buildHandle();
  const tree = sampleState().trees[0];
  const withMedia = addMoment(tree, {
    ...base, title: '영상 링크 순간', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    mediaMetadata: { title: '무대 영상', channel: '윤슬 채널', source: 'evil.example' }
  }, tree.moments[0].id, CLOCK);
  await put(handle, { state: { version: 1, trees: [withMedia] }, expectedRevision: 0, clientKey: 'k-1' });
  const read = await get(handle);
  const moment = read.body.state.trees[0].moments.find(m => m.title === '영상 링크 순간');
  assert.deepEqual(moment.mediaMetadata, { title: '무대 영상', channel: '윤슬 채널', source: 'www.youtube.com' });
});

test('a malformed media metadata value is refused as an invalid document', async () => {
  const { handle } = buildHandle();
  const state = sampleState();
  const forged = { ...state, trees: [{ ...state.trees[0], moments: state.trees[0].moments.map((m, i) => i === 1 ? { ...m, url: 'https://youtu.be/dQw4w9WgXcQ', mediaMetadata: '무대 영상' } : m) }] };
  const saved = await put(handle, { state: forged, expectedRevision: 0, clientKey: 'k-1' });
  assert.equal(saved.status, 400);
  assert.equal(saved.body.error.code, 'invalid_document');
  assert.equal((await get(handle)).body.revision, 0);
});

test('records without media metadata keep the previous moment shape', async () => {
  const { handle } = buildHandle();
  await put(handle, { state: sampleState(), expectedRevision: 0, clientKey: 'k-1' });
  const read = await get(handle);
  for (const moment of read.body.state.trees[0].moments)
    assert.equal(Object.prototype.hasOwnProperty.call(moment, 'mediaMetadata'), false);
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
  assert.deepEqual(read.body, { revision: 0, savedAt: null, state: { version: 1, trees: [], prefs: { theme: 'night', titleDisplay: 'both', displayName: '', accentColor: '', dateStyle: 'dot', startPlace: 'resume', shareView: 'book', shareDiscover: false, treeChipOrder: [], bookDisplay: 'book', shelfView: 'carousel', homeMoment: { mode: 'last', treeId: '', momentId: '' } } }, subject: 'usr_b', themeMissing: true });

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
  await listenOnSafePort(server, '127.0.0.1');
  try {
    // 다음 시험이 같은 포트를 다시 열 때 이전 HTTP 연결을 재사용하지 않도록 한다.
    const origin = `http://127.0.0.1:${server.address().port}`;
    const empty = await fetch(`${origin}/api/workspace`, { headers: { connection: 'close' } });
    assert.equal(empty.status, 200);
    assert.equal((await empty.json()).revision, 0);
    const saved = await fetch(`${origin}/api/workspace`, {
      method: 'PUT', headers: { 'content-type': 'application/json', connection: 'close' }, body: JSON.stringify({ state: sampleState(), expectedRevision: 0, clientKey: 'k-1' })
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).revision, 1);
    assert.equal((await (await fetch(`${origin}/api/workspace`, { headers: { connection: 'close' } })).json()).revision, 1);
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
  await listenOnSafePort(server, '127.0.0.1');
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

// #986: 규칙이 바뀐 예전 문서처럼 저장소에 어긋난 트리가 남아 있어도 읽기·저장이 막히지 않는다.
// 어긋난 트리는 시작 순간이 둘(parentId === null 2개)이라 화면에서도 고칠 수 없다.
function deviantTree() {
  const tree = createTree({ ...base, title: '어긋난 옛 트리' }, CLOCK);
  const grown = addMoment(tree, { ...base, title: '둘째 줄기', relation: '직접 만나고 싶어서' }, tree.moments[0].id, CLOCK);
  return { ...grown, moments: grown.moments.map(m => m.id === grown.moments[1].id ? { ...m, parentId: null } : m) };
}

const seedDoc = (repo, subjectId, doc) => repo.commit({ productId: PRODUCT, subjectId, doc, expectedRevision: 0, clientKey: `seed-${subjectId}`, requestHash: 'seed' });

test('a stored deviant tree is quarantined on read and kept in storage through a save', async () => {
  const { handle, repo } = buildHandle();
  const state = sampleState();
  const deviant = deviantTree();
  await seedDoc(repo, 'usr_a', { version: 1, trees: [...state.trees, deviant] });

  const first = await get(handle);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.state.trees.map(tree => tree.title), ['윤슬, 나의 순간들']);
  assert.equal(first.body.quarantined, 1, '빠진 트리는 개수만 알린다');
  assert.equal(JSON.stringify(first.body).includes('둘째 줄기'), false, '격리 원본 내용은 응답에 없다');

  // #986 방식(원본을 본문에 다시 붙이기)과 달리, 깨끗한 본문만 보내도 저장은 400이 아니라 200이다.
  const grown = addMoment(state.trees[0], { ...base, title: '다시 저장한 순간', relation: '직접 만나고 싶어서' }, state.trees[0].moments[0].id, CLOCK);
  assert.equal((await put(handle, { state: { version: 1, trees: [grown] }, expectedRevision: 1, clientKey: 'k-986' })).status, 200);

  // 저장소 문서에는 어긋난 트리 원본이 손대지 않은 채 남아 있다.
  const stored = (await repo.load({ productId: PRODUCT, subjectId: 'usr_a' })).doc;
  assert.deepEqual(stored.trees.find(tree => tree.id === deviant.id), deviant);

  const again = await get(handle);
  assert.equal(again.status, 200);
  assert.equal(again.body.quarantined, 1);
  assert.deepEqual(again.body.state.trees.map(tree => tree.title), ['윤슬, 나의 순간들']);
  assert.equal(again.body.state.trees[0].moments.some(m => m.title === '다시 저장한 순간'), true);
});

test('a new tree with the id of a quarantined tree replaces the kept original', async () => {
  const { handle, repo } = buildHandle({ principal: { productId: PRODUCT, subjectId: 'usr_b' } });
  const deviant = deviantTree();
  await seedDoc(repo, 'usr_b', { version: 1, trees: [deviant] });
  const replacement = { ...createTree({ ...base, title: '새로 만든 트리' }, CLOCK), id: deviant.id };
  const saved = await put(handle, { state: { version: 1, trees: [replacement] }, expectedRevision: 1, clientKey: 'k-986b' });
  assert.equal(saved.status, 200);
  const stored = (await repo.load({ productId: PRODUCT, subjectId: 'usr_b' })).doc;
  assert.deepEqual(stored.trees, [validateState({ version: 1, trees: [replacement] }).trees[0]], '새 트리가 이기고 원본은 비운다');
  assert.equal((await get(handle)).body.quarantined, undefined);
});

// #1073 B-22: % 묶음이 깨진 트리 경로는 서버 오류(500)가 아니라 404로 답한다.
test('a malformed percent-encoded tree path answers 404, not 500', async () => {
  const { handle } = buildHandle();
  const bad = await handle({ method: 'DELETE', path: '/api/workspace/trees/%E0%A4%A', headers: {} });
  assert.equal(bad.status, 404);
  assert.equal(bad.body.error.code, 'not_found');
});

test('a stored tree with broken timestamps and names is repaired on read, not quarantined', async () => {
  const { handle, repo } = buildHandle({ principal: { productId: PRODUCT, subjectId: 'usr_d' } });
  const tree = createTree({ ...base, title: '고쳐 읽는 트리' }, CLOCK);
  await seedDoc(repo, 'usr_d', { version: 1, trees: [{ ...tree, updatedAt: '지난주', subject: '' }] });
  const got = await get(handle);
  assert.equal(got.status, 200);
  assert.equal(got.body.quarantined, undefined, '고쳐 읽은 트리는 빠진 트리가 아니다');
  assert.equal(got.body.state.trees[0].updatedAt, tree.createdAt);
  assert.equal(got.body.state.trees[0].subject, '윤슬, 나의 순간들', '빈 대상 이름은 제목으로 채운다');
});

test('#1434 stored empty trees and broken parent references are repaired on read without rewriting storage', () => {
  const root = createTree({ ...base, title: '정상 트리' }, CLOCK);
  const grown = addMoment(root, { ...base, title: '끊어진 순간', relation: '남은 이유' }, root.moments[0].id, CLOCK);
  const broken = structuredClone(grown);
  broken.id = 't-broken';
  broken.moments[1].parentId = 'missing-parent';
  broken.moments.push({ ...broken.moments[1], id: 'valid-child', parentId: broken.moments[0].id, relation: '남길 이유' });
  const empty = { ...structuredClone(root), id: 't-empty', title: '빈 트리', moments: [] };
  const malformed = { ...structuredClone(root), id: 't-malformed', moments: [structuredClone(root.moments[0]), { ...structuredClone(root.moments[0]), id: 'bad-parent', parentId: 42 }] };
  const doc = { version: 1, prefs: {}, trees: [empty, broken, malformed, root] };
  const original = structuredClone(doc);
  const read = readStoredDocument(doc, CLOCK);
  assert.deepEqual(read.quarantined.map(tree => tree.id), ['t-malformed'], '형식이 잘못된 parentId만 격리한다');
  assert.deepEqual(read.state.trees.map(tree => tree.id), ['t-empty', 't-broken', root.id]);
  assert.deepEqual(read.state.trees[0].moments, []);
  assert.equal(read.state.trees[1].moments[1].parentId, root.moments[0].id);
  assert.equal(read.state.trees[1].moments[1].relation, '');
  assert.equal(read.state.trees[1].moments.find(moment => moment.id === 'valid-child').parentId, root.moments[0].id, '정상 부모 참조는 그대로 읽는다');
  assert.equal(read.state.trees[1].moments.find(moment => moment.id === 'valid-child').relation, '남길 이유');
  assert.equal(read.state.trees[2].moments[0].parentId, null, '정상 부모는 추측해 바꾸지 않는다');
  assert.deepEqual(doc, original, '저장 문서 원본은 읽기 보정으로 바뀌지 않는다');
});

test('onCommit receives the validated state only — quarantined originals stay out', async () => {
  const seen = [];
  const repo = createMemoryWorkspaceRepo();
  const service = createWorkspaceService({ repo, productId: PRODUCT, onCommit: ({ doc }) => seen.push(doc) });
  const deviant = deviantTree();
  await seedDoc(repo, 'usr_e', { version: 1, trees: [deviant] });

  const tree = createTree({ ...base, title: '새 트리' }, CLOCK);
  await service.write({ productId: PRODUCT, subjectId: 'usr_e' }, { state: { version: 1, trees: [tree] }, expectedRevision: 1, clientKey: 'k-986c' });
  assert.deepEqual(seen, [validateState({ version: 1, trees: [tree] })], '저장 뒤 onCommit에는 격리 원본이 없다');

  const stored = (await repo.load({ productId: PRODUCT, subjectId: 'usr_e' })).doc;
  assert.ok(stored.trees.some(t => t.id === deviant.id), '저장소에는 격리 원본이 그대로 남는다');
});

// #1038: readStoredDocument(트리별 검증·격리)를 거쳐도 저장된 세로 판정값은 그대로 읽힌다.
test('stored vertical media values survive the readStoredDocument isolation path', async () => {
  const { handle, repo } = buildHandle();
  const tree = createTree({ ...base, title: '세로 트리' }, CLOCK);
  const grown = addMoment(tree, {
    ...base, title: '쇼츠',
    url: 'https://www.youtube.com/watch?v=abc123DEF45',
    mediaMetadata: { title: '쇼츠', vertical: true, width: 1080, height: 1920 }
  }, tree.moments[0].id, CLOCK);
  await seedDoc(repo, 'usr_a', { version: 1, trees: [grown] });
  const got = await get(handle);
  assert.equal(got.status, 200);
  assert.equal(got.body.quarantined, undefined, '새 선택 필드 때문에 트리가 격리되지 않는다');
  const meta = got.body.state.trees[0].moments.find(m => m.url.includes('youtube')).mediaMetadata;
  assert.deepEqual(meta, { title: '쇼츠', channel: '', source: 'www.youtube.com', vertical: true, width: 1080, height: 1920 });
  // 다시 저장해도 값이 남는다(왕복 유지).
  const again = await put(handle, { state: got.body.state, expectedRevision: 1, clientKey: 'k-1038' });
  assert.equal(again.status, 200);
  const reread = await get(handle);
  assert.equal(reread.body.state.trees[0].moments.find(m => m.url.includes('youtube')).mediaMetadata.vertical, true);
});

test('#1062: 저장소 오류의 500 기록에는 원인만 남고 요청 값은 섞이지 않는다', async () => {
  const requestBody = '815d2018a65b9e6bdf6fa41e38e51b5c9c0b13a4';
  const email = 'member@example.com';
  const cookie = 'session=abcdef1234567890';
  const dbUrl = 'postgres://app:pw@db.internal:5432/lovetree';
  const boom = new Error(`보관 연결 실패 ${email} ${dbUrl} ${cookie}`);
  boom.name = 'StoreFailure';
  boom.code = 'STORE_DOWN';
  const repo = { ...createMemoryWorkspaceRepo(), async load() { throw boom; } };
  const { handle } = buildHandle({ repo });
  const lines = [], original = console.error;
  console.error = (...args) => lines.push(args.map(String).join(' '));
  let response;
  try { response = await get(handle, { headers: { cookie }, body: requestBody }); }
  finally { console.error = original; }
  assert.equal(response.status, 500);
  assert.equal(lines.length, 1, '기록은 한 줄');
  assert.match(lines[0], /StoreFailure/, '오류 이름');
  assert.match(lines[0], /STORE_DOWN/, '오류 코드');
  assert.match(lines[0], /보관 연결 실패/, '메시지는 남는다');
  for (const secret of [requestBody, email, cookie, dbUrl]) {
    assert.equal(lines[0].includes(secret), false, '기록에 요청 본문·식별자·비밀값이 없다');
  }
});

test('#1434 다른 트리를 저장해도 읽기용 부모 보정은 원본에 반영되지 않는다', async () => {
  const repo = createMemoryWorkspaceRepo();
  const service = createWorkspaceService({ repo, productId: PRODUCT });
  const principal = { productId: PRODUCT, subjectId: 'usr_repair' };
  const root = createTree({ ...base, title: '원본' }, CLOCK);
  const broken = addMoment(root, { ...base, title: '연결', relation: '기존 연결 이유' }, root.moments[0].id, CLOCK);
  broken.moments[1].parentId = 'missing-parent';
  const other = createTree({ ...base, title: '다른 트리' }, CLOCK);
  const original = structuredClone(broken);
  await seedDoc(repo, principal.subjectId, { version: 1, trees: [broken, other] });
  const read = await service.read(principal);
  assert.equal(read.state.trees[0].moments[1].parentId, root.moments[0].id);
  read.state.trees[1].title = '수정한 트리';
  await service.write(principal, { state: read.state, expectedRevision: 1, clientKey: 'preserve-original' });
  const stored = await repo.load(principal);
  assert.deepEqual(stored.doc.trees[0], original);
  assert.equal(stored.doc.trees[1].title, '수정한 트리');
});
