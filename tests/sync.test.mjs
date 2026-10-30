import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncController, createWorkspaceApi } from '../src/sync.js';
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

test('비로그인은 서버 저장을 하지 않고 로그인 안내를 표시한다', async () => {
  const api = fakeApi({get:[unauthorized]});
  const made = harness({initial:EMPTY, api});
  const state = await made.controller.start();
  assert.equal(state.phase, 'login');
  assert.match(state.label, /로그인/);
  made.controller.markLocalSave(); await made.settle();
  assert.deepEqual(api.seen.map(row => row[0]), ['get']);
});

test('서버 기록만 읽고 브라우저 저장소는 접근하지 않는다', async () => {
  const server = doc('서버 순간');
  const api = fakeApi({get:[okGet(2,server)]});
  let current = EMPTY;
  const storage = {getItem(){throw new Error('read forbidden')},setItem(){throw new Error('write forbidden')}};
  const controller = createSyncController({getState:()=>current, replaceState:value=>{current=value},api,storage});
  const result = await controller.start();
  assert.equal(result.phase, 'synced'); assert.deepEqual(current,server);
});

test('인증된 편집은 서버에 번호와 함께 저장하고 성공 뒤에만 동기화로 표시한다', async () => {
  let complete; const pending = new Promise(resolve=>{complete=resolve});
  const api = fakeApi({get:[okGet(2,EMPTY)],put:[pending]});
  const made = harness({initial:EMPTY,api}); await made.controller.start();
  made.edit(doc('수정')); made.controller.markLocalSave(); await made.settle();
  assert.equal(made.controller.status().phase,'syncing');
  assert.equal(api.puts()[0].expectedRevision,2);
  complete(okPut(3)); await made.settle();
  assert.equal(made.controller.status().phase,'synced');
});

test('서버 저장 실패는 미저장으로 표시하고 같은 요청 키로 재시도한다', async () => {
  const api = fakeApi({get:[okGet(0,EMPTY)],put:[networkDown,okPut(1)]});
  const made = harness({initial:EMPTY,api}); await made.controller.start();
  made.edit(doc('수정')); made.controller.markLocalSave(); await made.settle();
  assert.equal(made.controller.status().phase,'offline');
  assert.match(made.controller.status().detail,/저장되지 않았어요/);
  await made.controller.act('retry');
  assert.equal(api.puts()[0].clientKey,api.puts()[1].clientKey);
  assert.equal(made.controller.status().phase,'synced');
});

test('충돌은 멈추고 사용자의 선택 전에는 덮어쓰지 않는다', async () => {
  const api = fakeApi({get:[okGet(2,EMPTY)],put:[revisionClash]});
  const made = harness({initial:EMPTY,api}); await made.controller.start();
  made.edit(doc('수정')); made.controller.markLocalSave(); await made.settle();
  assert.equal(made.controller.status().phase,'conflict'); assert.equal(api.puts().length,1);
});

test('미저장 변경이 있으면 로그아웃하지 않는다', async () => {
  const api = fakeApi({get:[okGet(0,EMPTY)],put:[networkDown]});
  const made = harness({initial:EMPTY,api}); await made.controller.start();
  made.edit(doc('수정')); made.controller.markLocalSave(); await made.settle();
  await made.controller.act('logout');
  assert.equal(api.seen.filter(row=>row[0]==='logout').length,0);
  assert.match(made.controller.status().detail,/저장되지 않은 변경/);
});

test('세션이 만료되면 저장 실패를 알리고 로그인 안내로 전환한다', async () => {
  const api = fakeApi({get:[okGet(0,EMPTY)],put:[unauthorized]});
  const made = harness({initial:EMPTY,api}); await made.controller.start();
  made.edit(doc('수정')); made.controller.markLocalSave(); await made.settle();
  assert.equal(made.controller.status().phase,'login');
  assert.match(made.controller.status().detail,/저장하지 못했어요/);
  assert.equal(made.controller.snapshot().owned,false);
});

test('저장 중 새 편집은 이전 완료 뒤 새 번호로 다시 보낸다', async () => {
  let complete; const pending = new Promise(resolve=>{complete=resolve});
  const api = fakeApi({get:[okGet(1,EMPTY)],put:[pending,okPut(3)]});
  const made = harness({initial:EMPTY,api}); await made.controller.start();
  const first = doc('처음'), second = doc('다음');
  made.edit(first); made.controller.markLocalSave(); await made.settle();
  made.edit(second); made.controller.markLocalSave(); await made.settle();
  assert.equal(api.puts().length,1);
  complete(okPut(2)); await made.settle();
  assert.equal(api.puts().length,2);
  assert.equal(api.puts()[1].expectedRevision,2);
  assert.deepEqual(api.puts()[1].state,second);
  assert.equal(made.controller.status().phase,'synced');
});

test('충돌 이후 서버가 다시 변경되면 강제 저장도 멈춘다', async () => {
  const api = fakeApi({get:[okGet(2,EMPTY),okGet(10,EMPTY)],put:[revisionClash]});
  const made = harness({initial:EMPTY,api}); await made.controller.start();
  made.edit(doc('수정')); made.controller.markLocalSave(); await made.settle();
  await made.controller.act('force');
  assert.equal(api.puts().length,1);
  assert.equal(made.controller.status().phase,'conflict');
});

test('로그인으로 이동한 뒤 늦게 온 서버 응답은 화면을 채우지 않는다', async () => {
  let complete; const pending = new Promise(resolve=>{complete=resolve});
  const api = fakeApi({get:[pending]});
  const made = harness({initial:EMPTY,api}); const running = made.controller.start();
  await made.controller.act('login');
  complete(okGet(3,doc('다른 계정'))); await running;
  assert.deepEqual(made.current(),EMPTY);
  assert.equal(made.controller.snapshot().owned,false);
});

test('로그아웃 성공 시 서버 기록은 요청하지 않고 화면만 비운다', async () => {
  const api = fakeApi({get:[okGet(1,doc('기록'))],logout:[{ok:true}]});
  const made = harness({initial:EMPTY,api}); await made.controller.start();
  await made.controller.act('logout');
  assert.deepEqual(made.current(),EMPTY);
  assert.equal(made.controller.status().phase,'login');
  assert.deepEqual(api.seen.map(row=>row[0]),['get','logout']);
});

test('저장 API가 아닌 응답은 성공으로 읽지 않고 미설정으로 처리한다', async () => {
  const html = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<!doctype html><title>LoveTree</title>' });
  const broken = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => '{"unexpected":true}' });
  for (const [name, reply] of [['SPA 폴백', html], ['문서 아닌 JSON', broken]]) {
    const api = createWorkspaceApi({ fetchImpl: reply });
    const read = await api.get();
    assert.equal(read.ok, false, `${name}: 200이어도 문서가 아니면 성공이 아니다`);
    assert.equal(read.code, 'storage_unavailable');
    const written = await api.put({ state: doc('기준'), expectedRevision: 0, clientKey: 'ck-1' });
    assert.equal(written.ok, false, `${name}: 저장도 같은 기준으로 다룬다`);
    assert.equal(written.code, 'storage_unavailable');

    const made = harness({ initial: doc('이 기기 기록'), api });
    const state = await made.controller.start();
    assert.equal(state.phase, 'offline');
    assert.match(state.detail, /서버를 확인하지 못했어요/);
  }
});

test('로그아웃 응답은 문서 형식 요구를 적용받지 않는다', async () => {
  const api = createWorkspaceApi({ fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => '{"loggedOut":true}' }) });
  const out = await api.logout();
  assert.equal(out.ok, true);
  assert.equal(out.code, null);
});

test('모양은 맞지만 검증에 실패한 문서도 서버 기록으로 읽지 않는다', async () => {
  const invalidDoc = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ revision: 1, savedAt: CLOCK, state: { version: 9, trees: 'nope' }, subject: 'sub_probe' }) });
  const api = createWorkspaceApi({ fetchImpl: invalidDoc });
  const read = await api.get();
  assert.equal(read.ok, false, '번호와 state가 있어도 검증을 통과하지 못하면 성공이 아니다');
  assert.equal(read.code, 'storage_unavailable');

  const local = doc('이 기기에 남는 순간');
  const made = harness({ initial: local, api });
  const state = await made.controller.start();
  assert.equal(state.phase, 'offline');
  assert.match(state.detail, /서버를 확인하지 못했어요/);
  assert.deepEqual(made.current(), EMPTY, 'invalid document is never used');
  assert.equal(made.controller.snapshot().revision, null, '서버 번호를 가진 것으로 보지 않는다');
});

