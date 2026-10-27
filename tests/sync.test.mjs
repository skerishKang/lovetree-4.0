import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncController } from '../src/sync.js';
import { createTree } from '../src/domain.js';

const CLOCK = '2026-10-28T00:00:00.000Z';
const EMPTY = { version: 1, trees: [] };

// createTree는 id를 무작위로 발급한다. 문서 객체는 한 번만 만들어 비교·검증이 들리지 않게 한다.
const doc = (...titles) => ({ version: 1, trees: titles.map((title) => createTree({ subject: '윤슬', title, note: '기록', emotion: '설렘', date: '2026-10-28', url: '' }, CLOCK)) });

const okGet = (revision, state) => ({ ok: true, status: 200, revision, state, savedAt: CLOCK });
const okPut = (revision) => ({ ok: true, status: 200, revision, savedAt: CLOCK });
const unauthorized = { ok: false, status: 401, code: 'unauthenticated', message: null };
const unconfigured = { ok: false, status: 503, code: 'auth_unavailable', message: '로그인 확인을 하지 못했어요.' };
const networkDown = { ok: false, status: 0, code: 'network', message: null };
const revisionClash = { ok: false, status: 409, code: 'revision_conflict', message: '다른 곳에서 먼저 저장했어요. 최신 기록을 불러온 뒤 다시 시도해 주세요.', currentRevision: 9 };
const keyClash = { ok: false, status: 409, code: 'client_key_conflict', message: '같은 요청 키로 다른 내용을 보내려 해요. 새 키로 다시 시도해 주세요.' };

function fakeApi(script) {
  const seen = [];
  const queues = { get: [...(script.get ?? [])], put: [...(script.put ?? [])], logout: [...(script.logout ?? [])] };
  const answer = (kind) => {
    const step = queues[kind].shift();
    if (step !== undefined) return step;
    throw new Error(`${kind} 호출이 준비되지 않았어요`);
  };
  return {
    seen,
    puts: () => seen.filter((row) => row[0] === 'put').map((row) => row[1]),
    async get() { seen.push(['get']); return answer('get'); },
    async put(body) { seen.push(['put', body]); return answer('put'); },
    async logout() { seen.push(['logout']); return answer('logout'); }
  };
}

function harness({ initial, api, storage = new Map(), on = null }) {
  let state = initial;
  const navigated = [];
  const controller = createSyncController({
    getState: () => state,
    replaceState: (next) => { state = next; },
    api,
    storage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => { storage.set(key, String(value)); return undefined; }
    },
    makeClientKey: () => `ck-${Math.random().toString(36).slice(2, 10)}`,
    delay: () => Promise.resolve(),
    navigate: (url) => navigated.push(url),
    onChange: on ?? (() => {})
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { controller, storage, navigated, settle, current: () => state, edit: (next) => { state = next; } };
}

test('미로그인·서버 미설정 모두 로컬 저장을 그대로 둔다', async () => {
  for (const [refusal, expectedActions] of [[unauthorized, ['login']], [unconfigured, ['retry', 'login']]]) {
    const local = doc('브라우저 첫 순간');
    const api = fakeApi({ get: [refusal] });
    const made = harness({ initial: local, api });
    const state = await made.controller.start();

    assert.equal(state.phase, 'local');
    assert.equal(state.label, '이 기기에만 저장');
    assert.deepEqual(state.actions.map((action) => action.name), expectedActions);
    if (refusal === unconfigured) assert.match(state.detail, /서버 저장이 아직 켜지지/);

    made.edit(doc('브라우저 첫 순간', '이후 순간'));
    made.controller.markLocalSave();
    await made.settle();
    assert.deepEqual(api.puts(), [], '서버 세션이 없으면 PUT를 보내지 않는다');
    assert.equal(made.controller.snapshot().revision, null);
    assert.equal(made.controller.status().phase, 'local');
  }
});

test('서버 문서가 비어 있고 이 기기에 기록이 있으면 올릴지 확인한다', async () => {
  const local = doc('기기에만 있던 첫 순간');
  const api = fakeApi({ get: [okGet(0, EMPTY)], put: [okPut(1)] });
  const made = harness({ initial: local, api });

  const offered = await made.controller.start();
  assert.equal(offered.phase, 'uploadOffered');
  assert.deepEqual(api.puts(), [], '제안만 하고 자동으로 올리지 않는다');

  const synced = await made.controller.act('uploadLocal');
  assert.equal(synced.phase, 'synced');
  const [body] = api.puts();
  assert.equal(body.expectedRevision, 0, '서버가 비어 있음을 확인한 뒤에만 0을 쓴다');
  assert.match(body.clientKey, /^ck-/);
  assert.equal(body.state, local, 'id와 연결을 그대로 보낸다 — 재발급이 없다');
});

test('서버에 문서가 있고 이 기기가 비어 있으면 그 문서를 기준으로 삼되 백업을 남긴다', async () => {
  const serverDoc = doc('서버에 있던 첫 순간');
  const api = fakeApi({ get: [okGet(4, serverDoc)] });
  const storage = new Map();
  const made = harness({ initial: EMPTY, api, storage });

  const state = await made.controller.start();
  assert.equal(state.phase, 'synced');
  assert.deepEqual(made.current(), serverDoc);
  assert.equal(made.controller.snapshot().revision, 4);
  assert.deepEqual(api.puts(), [], '채택만으로 업로드하지 않는다');
  assert.ok(storage.get('lovetree.v4.local-before-server.v1'), '덮어쓰기 전 로컬 사본을 남긴다');
});

test('서버와 이 기기의 기록이 다르면 어느 쪽도 조용히 덮어쓰지 않는다', async () => {
  const serverDoc = doc('서버 기록');
  const localDoc = doc('이 기기 기록');

  const keepLocal = fakeApi({ get: [okGet(7, serverDoc), okGet(7, serverDoc)], put: [okPut(8)] });
  const keptStorage = new Map();
  const kept = harness({ initial: localDoc, api: keepLocal, storage: keptStorage });
  const offered = await kept.controller.start();
  assert.equal(offered.phase, 'adoptOffered');
  assert.deepEqual(keepLocal.puts(), []);
  assert.deepEqual(kept.current(), localDoc, '제안 단계에서는 화면 기록을 바꾸지 않는다');

  const afterKeep = await kept.controller.act('useLocal');
  assert.equal(afterKeep.phase, 'synced');
  assert.equal(keepLocal.puts()[0].expectedRevision, 7, '덮어쓰기 직전 서버 번호를 다시 읽는다');
  assert.equal(keepLocal.puts()[0].state, localDoc);
  assert.deepEqual(JSON.parse(keptStorage.get('lovetree.v4.server-before-overwrite.v1')), serverDoc, '서버 사본을 백업으로 남긴다');

  const takeServer = fakeApi({ get: [okGet(7, serverDoc), okGet(7, serverDoc)] });
  const switched = harness({ initial: localDoc, api: takeServer });
  await switched.controller.start();
  const adopted = await switched.controller.act('useServer');
  assert.equal(adopted.phase, 'synced');
  assert.deepEqual(switched.current(), serverDoc);
  assert.deepEqual(takeServer.puts(), [], '서버 기록을 택하면 올리지 않는다');
});

test('동기화된 로컬 저장은 번호를 대고 올라가고, 충돌에서는 멈추고 사용자에게 묻는다', async () => {
  const base = doc('함께 자란 기록');
  const grown = doc('함께 자란 기록', '새 순간');
  const api = fakeApi({ get: [okGet(2, base)], put: [okPut(3), revisionClash] });
  const seenPhases = [];
  const made = harness({ initial: base, api, on: (state) => seenPhases.push(state.phase) });
  await made.controller.start();

  made.edit(grown);
  made.controller.markLocalSave();
  await made.settle();
  assert.ok(seenPhases.includes('syncing'), '올리는 동안 상태를 보여 준다');
  assert.equal(made.controller.status().phase, 'synced');
  assert.equal(api.puts()[0].expectedRevision, 2);
  assert.equal(made.controller.snapshot().revision, 3);

  const during = doc('함께 자란 기록', '새 순간', '충돌 중 추가');
  made.edit(during);
  made.controller.markLocalSave();
  await made.settle();
  const conflict = made.controller.status();
  assert.equal(conflict.phase, 'conflict');
  assert.match(conflict.detail, /9번까지/);
  assert.deepEqual(conflict.actions.map((action) => action.name), ['pull', 'force', 'retry']);

  made.edit(doc('함께 자란 기록', '새 순간', '충돌 중 추가', '그 뒤 입력'));
  made.controller.markLocalSave();
  await made.settle();
  assert.equal(api.puts().length, 2, '충돌 상태에서 자동으로 다시 날리지 않는다');
  assert.equal(made.controller.status().phase, 'conflict');

  const pulled = fakeApi({ get: [okGet(2, base), okGet(9, base)], put: [revisionClash] });
  const case2 = harness({ initial: base, api: pulled });
  await case2.controller.start();
  case2.edit(grown);
  case2.controller.markLocalSave();
  await case2.settle();
  const resolved = await case2.controller.act('pull');
  assert.equal(resolved.phase, 'synced');
  assert.deepEqual(case2.current(), base);
  assert.equal(case2.controller.snapshot().revision, 9);
});

test('충돌 후 내 기록으로 덮어쓰기는 서버 번호를 다시 읽은 뒤에만 한다', async () => {
  const base = doc('기준');
  const mine = doc('기준', '내 추가');
  const api = fakeApi({
    get: [okGet(2, base), okGet(9, base)],
    put: [okPut(3), revisionClash, okPut(10)]
  });
  const made = harness({ initial: base, api });
  await made.controller.start();
  made.edit(mine);
  made.controller.markLocalSave();
  await made.settle();
  assert.equal(made.controller.status().phase, 'synced');

  const other = doc('기준', '내 추가', '남의 저장 이후 추가');
  made.edit(other);
  made.controller.markLocalSave();
  await made.settle();
  assert.equal(made.controller.status().phase, 'conflict');

  const forced = await made.controller.act('force');
  assert.equal(forced.phase, 'synced');
  const last = api.puts().at(-1);
  assert.equal(last.expectedRevision, 9, '먼저 서버 최신 번호를 다시 읽는다');
  assert.deepEqual(last.state, other);
  assert.deepEqual(JSON.parse(made.storage.get('lovetree.v4.server-before-overwrite.v1')), base, '덮어쓰인 서버 기록을 백업으로 남긴다');
});

test('요청 키 충돌과 네트워크 실패는 로컬을 보존하고 새 시도로 이어간다', async () => {
  const base = doc('기준');
  const added = doc('기준', '추가');
  const clash = fakeApi({ get: [okGet(1, base)], put: [keyClash, okPut(2)] });
  const made = harness({ initial: base, api: clash });
  await made.controller.start();
  made.edit(added);
  made.controller.markLocalSave();
  await made.settle();

  assert.equal(made.controller.status().phase, 'rejected');
  assert.equal(made.current(), added, '로컬 기록을 지우지 않는다');
  const retried = await made.controller.act('retry');
  assert.equal(retried.phase, 'synced');
  const [first, second] = clash.puts();
  assert.notEqual(first.clientKey, second.clientKey, '새 요청 키로 다시 보낸다');
  assert.deepEqual(second.state, added);

  const down = fakeApi({ get: [okGet(1, base)], put: [networkDown, okPut(2)] });
  const offline = harness({ initial: base, api: down });
  await offline.controller.start();
  offline.edit(added);
  offline.controller.markLocalSave();
  await offline.settle();
  assert.equal(offline.controller.status().phase, 'offline');
  assert.match(offline.controller.status().detail, /이 기기에만 저장한 상태로 남/);
  const back = await offline.controller.act('retry');
  assert.equal(back.phase, 'synced');
  assert.deepEqual(offline.current(), added);
});

test('로그아웃: 동기화가 끝났으면 이 기기 사본을 비우고, 남은 변경이 있으면 지우지 않는다', async () => {
  const local = doc('A의 첫 순간');
  const api = fakeApi({ get: [okGet(0, EMPTY), okGet(0, EMPTY)], put: [okPut(1)], logout: [{ ok: true, status: 200 }] });
  const made = harness({ initial: local, api });
  await made.controller.start();
  await made.controller.act('uploadLocal');
  assert.equal(made.controller.status().phase, 'synced');

  const out = await made.controller.act('logout');
  assert.equal(out.phase, 'local');
  assert.match(out.detail, /이 기기 사본은 비웠어요/);
  assert.deepEqual(made.current(), EMPTY, '다음 계정에 이전 기록이 보이지 않는다');
  assert.deepEqual(api.puts().length, 1, '로그아웃이 업로드를 유도하지 않는다');
  assert.deepEqual(made.navigated, ['#start'], '지운 트리를 가리킨 화면을 남기지 않는다');

  const nextAccount = fakeApi({ get: [okGet(0, EMPTY)] });
  const fresh = harness({ initial: EMPTY, api: nextAccount });
  const state = await fresh.controller.start();
  assert.equal(state.phase, 'synced', '새 계정은 빈 문서에서 시작한다');

  const keptApi = fakeApi({ get: [okGet(0, EMPTY)], put: [networkDown], logout: [{ ok: true, status: 200 }] });
  const keptDoc = doc('B의 순간');
  const unsynced = harness({ initial: keptDoc, api: keptApi });
  await unsynced.controller.start();
  await unsynced.controller.act('uploadLocal');
  assert.equal(unsynced.controller.status().phase, 'offline');
  const kept = await unsynced.controller.act('logout');
  assert.match(kept.detail, /지우지 않았어요/);
  assert.deepEqual(unsynced.current(), keptDoc, '동기화 전 기록은 이 기기에 남는다');
  assert.deepEqual(unsynced.navigated, [], '남은 기록이 있으면 화면을 옮기지 않는다');
});

test('로그인은 서버가 정한 주소로만 이동하고 화면 경계 밖 상태를 두지 않는다', async () => {
  const api = fakeApi({ get: [unauthorized] });
  const made = harness({ initial: EMPTY, api });
  await made.controller.start();
  await made.controller.act('login');
  assert.deepEqual(made.navigated, ['/auth/login?next=/']);
  assert.deepEqual(api.puts(), []);
});
