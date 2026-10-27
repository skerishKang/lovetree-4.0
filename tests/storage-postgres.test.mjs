import test from 'node:test';
import assert from 'node:assert/strict';
import { addMoment, createTree, linkMoments, validateState } from '../src/domain.js';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { applySchema, createWorkspaceRepo } from '../server/db/postgres.js';

/**
 * 실제 PostgreSQL에서만 도는 검증. LOVETREE_TEST_DATABASE_URL이 없으면 스킵한다 —
 * 메모리 모형 테스트(storage-api.test.mjs)로 PostgreSQL 검증을 대신 주장하지 않는다.
 */
const DATABASE_URL = process.env.LOVETREE_TEST_DATABASE_URL ?? '';

function assertIsolated(url) {
  const parsed = new URL(url);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  const named = decodeURIComponent(parsed.pathname.slice(1)).startsWith('lovetree_test_');
  if (!loopback && !named) throw new Error('테스트 DB는 loopback 호스트이거나 lovetree_test_ 접두 DB만 쓸 수 있어요.');
  return parsed;
}

const skip = DATABASE_URL ? false : '격리된 PostgreSQL 테스트 DB가 없습니다(LOVETREE_TEST_DATABASE_URL 설정 필요). 이 파일의 검증은 미수행입니다.';

const PRODUCT = 'lovetree-test';
const CLOCK = '2026-10-27T00:00:00.000Z';
const base = { subject: '윤슬', note: '오래 기억하고 싶은 마음', emotion: '설렘', date: '2026-10-27', url: '' };

function sampleState() {
  const first = createTree({ ...base, title: '첫 목소리' }, CLOCK);
  const second = addMoment(first, { ...base, title: '함께 부른 노래', relation: '직접 만나고 싶어서' }, first.moments[0].id, CLOCK);
  const third = addMoment(second, { ...base, title: '돌아오는 길', relation: '노래가 남아서' }, second.moments[1].id, CLOCK);
  return { version: 1, trees: [linkMoments(third, second.moments[1].id, third.moments[2].id, CLOCK)] };
}

function buildHandle(repo, subjectId) {
  const service = createWorkspaceService({ repo, productId: PRODUCT });
  const authenticate = async () => ({ productId: PRODUCT, subjectId });
  return createApiHandler({ authenticate, service, productId: PRODUCT });
}

const put = (handle, payload) => handle({
  method: 'PUT', path: '/api/workspace', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
});

async function withRepo(run) {
  assertIsolated(DATABASE_URL);
  const pg = await import('pg');
  const { Pool } = pg.default ?? pg;
  const pool = new Pool({ connectionString: DATABASE_URL, max: 6 });
  try {
    await applySchema(pool);
    await run(createWorkspaceRepo(pool));
  } finally {
    await pool.end();
  }
}

const suffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

test('schema applies twice and the first save lands on revision 1', { skip }, async () => {
  await withRepo(async repo => {
    const pg = await import('pg');
    const { Pool } = pg.default ?? pg;
    const second = new Pool({ connectionString: DATABASE_URL, max: 1 });
    try { await applySchema(second); } finally { await second.end(); }

    const subjectId = `usr_s_${suffix()}`;
    const handle = buildHandle(repo, subjectId);
    assert.deepEqual((await handle({ method: 'GET', path: '/api/workspace' })).body, { revision: 0, savedAt: null, state: { version: 1, trees: [] } });
    const saved = await put(handle, { state: sampleState(), expectedRevision: 0, clientKey: `ck-${suffix()}` });
    assert.equal(saved.body.revision, 1);
    const read = await handle({ method: 'GET', path: '/api/workspace' });
    assert.deepEqual(read.body.state, validateState(sampleState()));
    assert.match(read.body.savedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test('concurrent saves at the same revision leave exactly one winner', { skip }, async () => {
  await withRepo(async repo => {
    const subjectId = `usr_c_${suffix()}`;
    const handle = buildHandle(repo, subjectId);
    const state = sampleState();
    assert.equal((await put(handle, { state, expectedRevision: 0, clientKey: `ck-${suffix()}` })).body.revision, 1);
    const grown = { version: 1, trees: [addMoment(state.trees[0], { ...base, title: '동시에 쓴 순간' }, state.trees[0].moments[0].id, CLOCK)] };
    const results = await Promise.all([
      put(handle, { state: grown, expectedRevision: 1, clientKey: `ck-a-${suffix()}` }),
      put(handle, { state: grown, expectedRevision: 1, clientKey: `ck-b-${suffix()}` })
    ]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    const loser = results.find(r => r.status === 409);
    assert.equal(loser.body.error.code, 'revision_conflict');
    assert.equal(loser.body.error.currentRevision, 2);
    assert.equal((await handle({ method: 'GET', path: '/api/workspace' })).body.revision, 2);
  });
});

test('a replay returns the first result and a different request under the same key is refused', { skip }, async () => {
  await withRepo(async repo => {
    const subjectId = `usr_r_${suffix()}`;
    const handle = buildHandle(repo, subjectId);
    const key = `ck-${suffix()}`;
    const payload = { state: sampleState(), expectedRevision: 0, clientKey: key };
    const first = await put(handle, payload);
    const replay = await put(handle, payload);
    assert.deepEqual(replay.body, first.body);

    const otherTree = createTree({ ...base, title: '다른 첫 순간' }, CLOCK);
    const clash = await put(handle, { state: { version: 1, trees: [otherTree] }, expectedRevision: 0, clientKey: key });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error.code, 'client_key_conflict');
    assert.equal((await handle({ method: 'GET', path: '/api/workspace' })).body.revision, 1);
  });
});

test('a rejected revision leaves no claim behind so the key can be reused', { skip }, async () => {
  await withRepo(async repo => {
    const subjectId = `usr_p_${suffix()}`;
    const handle = buildHandle(repo, subjectId);
    const state = sampleState();
    const key = `ck-${suffix()}`;
    await put(handle, { state, expectedRevision: 0, clientKey: key });
    const grown = { version: 1, trees: [addMoment(state.trees[0], { ...base, title: '한 번 더' }, state.trees[0].moments[0].id, CLOCK)] };
    assert.equal((await put(handle, { state: grown, expectedRevision: 0, clientKey: `${key}-x` })).body.error.code, 'revision_conflict');
    assert.equal((await put(handle, { state: grown, expectedRevision: 1, clientKey: key })).body.error, undefined);
    assert.equal((await handle({ method: 'GET', path: '/api/workspace' })).body.revision, 2);
  });
});

test('separate subjects keep separate documents', { skip }, async () => {
  await withRepo(async repo => {
    const a = `usr_a_${suffix()}`;
    const b = `usr_b_${suffix()}`;
    const handleA = buildHandle(repo, a);
    const handleB = buildHandle(repo, b);
    await put(handleA, { state: sampleState(), expectedRevision: 0, clientKey: `ck-${suffix()}` });
    assert.equal((await handleB({ method: 'GET', path: '/api/workspace' })).body.revision, 0);
    const sharedKey = `ck-shared-${suffix()}`;
    await put(handleB, { state: { version: 1, trees: [createTree({ ...base, title: '같은 키 다른 사용자' }, CLOCK)] }, expectedRevision: 0, clientKey: sharedKey });
    assert.equal((await put(handleA, { state: sampleState(), expectedRevision: 1, clientKey: sharedKey })).status, 409);
  });
});

test('an invalid document never reaches the table', { skip }, async () => {
  await withRepo(async repo => {
    const subjectId = `usr_v_${suffix()}`;
    const handle = buildHandle(repo, subjectId);
    const state = sampleState();
    await put(handle, { state, expectedRevision: 0, clientKey: `ck-${suffix()}` });
    const broken = structuredClone(state);
    broken.trees[0].moments[1].links = ['없는-순간-id'];
    assert.equal((await put(handle, { state: broken, expectedRevision: 1, clientKey: `ck-${suffix()}` })).status, 400);
    const read = await handle({ method: 'GET', path: '/api/workspace' });
    assert.equal(read.body.revision, 1);
    assert.deepEqual(read.body.state, validateState(state));
  });
});
