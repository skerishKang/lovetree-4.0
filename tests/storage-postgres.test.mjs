import test from 'node:test';
import assert from 'node:assert/strict';
import { addMoment, createTree, linkMoments, validateState } from '../src/domain.js';
import { createApiHandler } from '../server/http.js';
import { createWorkspaceService } from '../server/workspace-service.js';
import { applySchema, createWorkspaceRepo } from '../server/db/postgres.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';

/**
 * 실제 PostgreSQL에서만 도는 검증. LOVETREE_TEST_DATABASE_URL이 없으면 스킵한다 —
 * 메모리 모형 테스트(storage-api.test.mjs)로 PostgreSQL 검증을 대신 주장하지 않는다.
 * CI의 postgres job은 skip을 실패로 다루므로 여기 테스트가 건너뛴 채 통과하지 못한다.
 */
const DATABASE_URL = process.env.LOVETREE_TEST_DATABASE_URL ?? '';
const skip = DATABASE_URL ? false : '격리된 PostgreSQL 테스트 DB가 없습니다(LOVETREE_TEST_DATABASE_URL 설정 필요). 이 파일의 검증은 미수행입니다.';

const PRODUCT = 'lovetree-test';
const CLOCK = '2026-10-27T00:00:00.000Z';
const base = { subject: '윤슬', note: '오래 기억하고 싶은 마음', emotion: '설렘', date: '2026-10-27', url: '' };

function sampleState(title = '첫 목소리') {
  const first = createTree({ ...base, title }, CLOCK);
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
const read = handle => handle({ method: 'GET', path: '/api/workspace', headers: {} });

const suffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function withRepo(run) {
  assertIsolatedTestDatabase(DATABASE_URL);
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

test('schema is repeatable and the first save lands on revision 1', { skip }, async () => {
  await withRepo(async repo => {
    const pg = await import('pg');
    const { Pool } = pg.default ?? pg;
    const second = new Pool({ connectionString: DATABASE_URL, max: 1 });
    try { await applySchema(second); } finally { await second.end(); }

    const subject = `usr_s_${suffix()}`;
    const handle = buildHandle(repo, subject);
    const state = sampleState();
    assert.deepEqual(await read(handle), { status: 200, body: { revision: 0, savedAt: null, state: { version: 1, trees: [] }, subject } });
    assert.equal((await put(handle, { state, expectedRevision: 0, clientKey: `ck-${suffix()}` })).body.revision, 1);
    const loaded = await read(handle);
    assert.deepEqual(loaded.body.state, validateState(state));
    assert.match(loaded.body.savedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test('concurrent saves at the same revision leave exactly one winner', { skip }, async () => {
  await withRepo(async repo => {
    const handle = buildHandle(repo, `usr_c_${suffix()}`);
    const state = sampleState();
    await put(handle, { state, expectedRevision: 0, clientKey: `ck-${suffix()}` });
    const grown = { version: 1, trees: [addMoment(state.trees[0], { ...base, title: '동시에 쓴 순간' }, state.trees[0].moments[0].id, CLOCK)] };
    const results = await Promise.all([
      put(handle, { state: grown, expectedRevision: 1, clientKey: `ck-a-${suffix()}` }),
      put(handle, { state: grown, expectedRevision: 1, clientKey: `ck-b-${suffix()}` })
    ]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    const loser = results.find(r => r.status === 409);
    assert.equal(loser.body.error.code, 'revision_conflict');
    assert.equal(loser.body.error.currentRevision, 2);
    assert.equal((await read(handle)).body.revision, 2);
  });
});

test('a replay returns the first result and a different request under the same key is refused', { skip }, async () => {
  await withRepo(async repo => {
    const handle = buildHandle(repo, `usr_r_${suffix()}`);
    const key = `ck-${suffix()}`;
    const state = sampleState();
    const payload = { state, expectedRevision: 0, clientKey: key };
    const first = await put(handle, payload);
    const replay = await put(handle, payload);
    assert.deepEqual(replay.body, first.body);

    const clash = await put(handle, { state: sampleState('다른 첫 순간'), expectedRevision: 0, clientKey: key });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error.code, 'client_key_conflict');
    assert.equal((await read(handle)).body.revision, 1);
  });
});

test('a rejected revision leaves no claim behind so the refused key can succeed', { skip }, async () => {
  await withRepo(async repo => {
    const handle = buildHandle(repo, `usr_p_${suffix()}`);
    const state = sampleState();
    const grown = { version: 1, trees: [addMoment(state.trees[0], { ...base, title: '한 번 더' }, state.trees[0].moments[0].id, CLOCK)] };
    await put(handle, { state, expectedRevision: 0, clientKey: `ck-${suffix()}` });

    const refusedKey = `ck-refused-${suffix()}`;
    const rejected = await put(handle, { state: grown, expectedRevision: 0, clientKey: refusedKey });
    assert.equal(rejected.body.error.code, 'revision_conflict');

    const retry = await put(handle, { state: grown, expectedRevision: 1, clientKey: refusedKey });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.revision, 2);
    assert.equal((await read(handle)).body.revision, 2);
  });
});

test('separate subjects keep separate documents and never share a request key', { skip }, async () => {
  await withRepo(async repo => {
    const handleA = buildHandle(repo, `usr_a_${suffix()}`);
    const handleB = buildHandle(repo, `usr_b_${suffix()}`);
    const stateA = sampleState('첫 목소리');
    const stateB = sampleState('같은 키 다른 사용자');
    const sharedKey = `ck-shared-${suffix()}`;

    await put(handleA, { state: stateA, expectedRevision: 0, clientKey: `ck-a-${suffix()}` });
    assert.equal((await read(handleB)).body.revision, 0);

    // 다른 사용자의 같은 clientKey는 충돌이 아니라 독립적인 요청이다.
    const savedB = await put(handleB, { state: stateB, expectedRevision: 0, clientKey: sharedKey });
    assert.equal(savedB.status, 200);
    const grownA = { version: 1, trees: [addMoment(stateA.trees[0], { ...base, title: 'A만 보는 순간' }, stateA.trees[0].moments[0].id, CLOCK)] };
    const savedA = await put(handleA, { state: grownA, expectedRevision: 1, clientKey: sharedKey });
    assert.equal(savedA.status, 200);
    assert.equal(savedA.body.revision, 2);

    const loadedA = await read(handleA);
    const loadedB = await read(handleB);
    assert.equal(loadedA.body.revision, 2);
    assert.equal(loadedB.body.revision, 1);
    assert.deepEqual(loadedA.body.state, validateState(grownA));
    assert.deepEqual(loadedB.body.state, validateState(stateB));
    assert.equal(loadedA.body.state.trees[0].moments.some(m => m.title === 'A만 보는 순간'), true);
    assert.equal(loadedB.body.state.trees[0].moments.some(m => m.title === 'A만 보는 순간'), false);
  });
});

test('an invalid document never reaches the table', { skip }, async () => {
  await withRepo(async repo => {
    const handle = buildHandle(repo, `usr_v_${suffix()}`);
    const state = sampleState();
    await put(handle, { state, expectedRevision: 0, clientKey: `ck-${suffix()}` });
    const broken = structuredClone(state);
    broken.trees[0].moments[1].links = ['없는-순간-id'];
    assert.equal((await put(handle, { state: broken, expectedRevision: 1, clientKey: `ck-${suffix()}` })).status, 400);
    const loaded = await read(handle);
    assert.equal(loaded.body.revision, 1);
    assert.deepEqual(loaded.body.state, validateState(state));
  });
});
