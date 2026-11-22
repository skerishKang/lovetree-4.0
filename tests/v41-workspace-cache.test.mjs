import test from 'node:test';
import assert from 'node:assert/strict';
import {readCachedWorkspace, writeCachedWorkspace, clearCachedWorkspace, readLoginSubject, rememberLoginSubject, forgetLoginSubject} from '../public/v41/workspace-cache.mjs';
import {createMemberSession} from '../public/v41/member-session.mjs';
import {createTree, EMPTY_STATE} from '../public/v41/domain.mjs';

const CLOCK = '2026-11-11T00:00:00.000Z';
const fields = {subject: '별', title: '처음', note: '기억할 마음', date: '2026-11-11', emotion: '설렘', url: ''};
const stateOf = (...titles) => ({version: 1, trees: titles.map(t => createTree({...fields, title: t}, CLOCK)), prefs: { titleDisplay: 'both', displayName: '', accentColor: '', dateStyle: 'dot', startPlace: 'resume', shareView: 'book', shareDiscover: false, treeChipOrder: [], bookDisplay: 'book', shelfView: 'shelf', homeMoment: { mode: 'last', treeId: '', momentId: '' } }});

function fakeStorage(map = new Map()) {
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
  };
}
const LAST = 'lovetree.v41.workspace-cache:last';
const LOGIN = 'lovetree.v41.login-subject';
const entryKey = s => 'lovetree.v41.workspace-cache:' + s;

// ---- 저장 모듈 단위 ----

test('#400 저장본 write→read 왕복은 계정과 상태를 그대로 돌려준다', () => {
  const storage = fakeStorage();
  const state = stateOf('서버 순간');
  assert.equal(writeCachedWorkspace(storage, 'member-A', state), true);
  const cached = readCachedWorkspace(storage, 'member-A');
  assert.equal(cached.subject, 'member-A');
  assert.deepEqual(cached.state, state);
});

test('#400 1MB가 넘으면 저장하지 않고 옛 저장본도 남기지 않는다', () => {
  const storage = fakeStorage();
  writeCachedWorkspace(storage, 'member-A', stateOf('작은 기록'));
  const huge = {version: 1, trees: [], prefs: {}, big: 'x'.repeat(1024 * 1024)};
  assert.equal(writeCachedWorkspace(storage, 'member-A', huge), false);
  assert.equal(storage.getItem(entryKey('member-A')), null);
  assert.equal(readCachedWorkspace(storage, 'member-A'), null);
  assert.equal(storage.getItem(LAST), 'member-A');
});

test('#400 깨진 저장본(JSON·계정 불일치·검증 실패)은 읽지 않고 지운다', () => {
  const bad = [
    '{broken json',
    JSON.stringify({version: 1, subject: 'member-B', state: stateOf('남의 기록')}),
    JSON.stringify({version: 1, subject: 'member-A', state: {version: 2, trees: []}}),
  ];
  for (const raw of bad) {
    const storage = fakeStorage();
    storage.setItem(LAST, 'member-A');
    storage.setItem(entryKey('member-A'), raw);
    assert.equal(readCachedWorkspace(storage, 'member-A'), null);
    assert.equal(storage.getItem(entryKey('member-A')), null, '깨진 저장본이 남아 있으면 안 된다');
  }
});

test('#400 계정별로 따로 저장하고 마지막 계정을 가리킨다', () => {
  const storage = fakeStorage();
  writeCachedWorkspace(storage, 'member-A', stateOf('A 기록'));
  writeCachedWorkspace(storage, 'member-B', stateOf('B 기록'));
  assert.equal(readCachedWorkspace(storage, 'member-B').subject, 'member-B');
  assert.ok(storage.getItem(entryKey('member-A')), 'A 저장본은 남아 있어야 한다');
  clearCachedWorkspace(storage, 'member-B');
  assert.equal(storage.getItem(entryKey('member-B')), null);
  assert.equal(storage.getItem(LAST), null);
  assert.ok(storage.getItem(entryKey('member-A')), '다른 계정 저장본은 지우지 않는다');
});

test('#400 저장소가 없거나 던져도 흐름은 멈추지 않는다', () => {
  const throwing = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }};
  assert.equal(readCachedWorkspace(null), null);
  assert.equal(readCachedWorkspace(throwing, 'member-A'), null);
  assert.equal(readCachedWorkspace(throwing), null);
  assert.equal(writeCachedWorkspace(null, 'member-A', stateOf('기록')), false);
  assert.equal(writeCachedWorkspace(throwing, 'member-A', stateOf('기록')), false);
  clearCachedWorkspace(null);
  clearCachedWorkspace(throwing, 'member-A');
  assert.equal(readLoginSubject(null), null);
  assert.equal(readLoginSubject(throwing), null);
  assert.equal(rememberLoginSubject(null, 'member-A'), false);
  assert.equal(rememberLoginSubject(throwing, 'member-A'), false);
  forgetLoginSubject(null);
  forgetLoginSubject(throwing);
});

// ---- 세션 통합 ----

function sessionWith({storage, get, onState = () => {}, put, logout, draftStorage}) {
  const api = {
    get: get ?? (async () => ({ok: true, revision: 1, state: stateOf('서버 기록'), subject: 'member-A', writeSubjectBound: true})),
    put: put ?? (async () => ({ok: true, revision: 2})),
    logout: logout ?? (async () => ({ok: true})),
  };
  const session = createMemberSession({api, cacheStorage: storage, onState, delay: () => new Promise(() => {}), makeClientKey: (() => { let i = 0; return () => `key-${++i}`; })(), draftStorage});
  return {session, api};
}
// A-18: 저장본과 로그인 표식을 한 번에 심는다 — 같은 계정이 서버에서 확인된 뒤의 기기 상태.
function seedCache(storage, subject, state) {
  writeCachedWorkspace(storage, subject, state);
  rememberLoginSubject(storage, subject);
}

test('#400 서버 응답 전에 저장본을 그리고, 그 동안 편집은 잠긴다', async () => {
  const storage = fakeStorage();
  const cached = stateOf('저장본 순간');
  seedCache(storage, 'member-A', cached);
  let resolveGet;
  const events = [];
  const {session} = sessionWith({storage, get: () => new Promise(r => { resolveGet = r; }), onState: s => events.push(s)});
  const starting = session.start();
  // start()의 동기 구간이 저장본을 이미 그렸다.
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], cached);
  assert.equal(session.snapshot().phase, 'checking');
  assert.equal(session.snapshot().owned, false);
  assert.equal(session.snapshot().writable, false);
  assert.throws(() => session.apply('new', fields), /불러오고/);
  resolveGet({ok: true, revision: 3, state: stateOf('서버 순간'), subject: 'member-A', writeSubjectBound: true});
  await starting;
  assert.equal(session.state().trees[0].moments[0].title, '서버 순간');
});

test('#400 서버본이 항상 이긴다 — 저장본과 다르면 서버본으로 교체하고 저장본도 갱신', async () => {
  const storage = fakeStorage();
  seedCache(storage, 'member-A', stateOf('옛 저장본'));
  const server = stateOf('새 서버본');
  const {session} = sessionWith({storage, get: async () => ({ok: true, revision: 5, state: server, subject: 'member-A', writeSubjectBound: true})});
  await session.start();
  assert.deepEqual(session.state(), server);
  assert.deepEqual(readCachedWorkspace(storage, 'member-A').state, server);
  assert.equal(session.snapshot().phase, 'synced');
});

test('#400 저장본이 없으면 추가 그리기 없이 기존 흐름 그대로', async () => {
  const storage = fakeStorage();
  const events = [];
  const {session} = sessionWith({storage, onState: s => events.push(s)});
  await session.start();
  assert.equal(events.length, 1);
  assert.equal(session.state().trees[0].moments[0].title, '서버 기록');
  assert.ok(readCachedWorkspace(storage, 'member-A'), '서버 성공 뒤 저장본이 생긴다');
  assert.equal(readLoginSubject(storage), 'member-A', '서버가 확인한 계정이 로그인 표식이 된다');
});

test('#400 재시도는 화면을 옛 저장본으로 되돌리지 않는다', async () => {
  const storage = fakeStorage();
  seedCache(storage, 'member-A', stateOf('옛 저장본'));
  let resolveGet;
  const {session} = sessionWith({storage, get: () => new Promise(r => { resolveGet = r; })});
  const first = session.start();
  resolveGet({ok: true, revision: 1, state: stateOf('서버본'), subject: 'member-A', writeSubjectBound: true});
  await first;
  const retry = session.act('retry');
  // 재시도 중에는 저장본이 아니라 현재 서버본이 그대로 보여야 한다.
  assert.equal(session.state().trees[0].moments[0].title, '서버본');
  resolveGet({ok: true, revision: 2, state: stateOf('서버본'), subject: 'member-A', writeSubjectBound: true});
  await retry;
});

test('#400 로그아웃하면 저장본을 지운다', async () => {
  const storage = fakeStorage();
  const {session} = sessionWith({storage});
  await session.start();
  assert.ok(readCachedWorkspace(storage, 'member-A'));
  assert.equal(readLoginSubject(storage), 'member-A');
  await session.act('logout');
  assert.equal(readCachedWorkspace(storage, 'member-A'), null);
  assert.equal(storage.getItem(LAST), null);
  assert.equal(readLoginSubject(storage), null, '로그아웃하면 로그인 표식도 비운다');
});

test('#400 인증 만료(401)면 저장본을 지우고 빈 화면으로 돌린다', async () => {
  const storage = fakeStorage();
  seedCache(storage, 'member-A', stateOf('옛 저장본'));
  const {session} = sessionWith({storage, get: async () => ({ok: false, status: 401, code: 'unauthenticated'})});
  await session.start();
  assert.equal(session.snapshot().phase, 'login');
  assert.deepEqual(session.state(), EMPTY_STATE());
  assert.equal(readCachedWorkspace(storage, 'member-A'), null);
  assert.equal(readLoginSubject(storage), null);
});

test('#400 pull(서버 기록 열기)도 저장본을 갱신한다', async () => {
  const storage = fakeStorage();
  let call = 0;
  const {session} = sessionWith({
    storage,
    get: async () => (++call === 1
      ? {ok: true, revision: 1, state: stateOf('처음'), subject: 'member-A', writeSubjectBound: true}
      : {ok: true, revision: 9, state: stateOf('충돌 뒤 서버본'), subject: 'member-A', writeSubjectBound: true}),
    put: async () => ({ok: false, status: 409, code: 'revision_conflict', currentRevision: 9}),
  });
  await session.start();
  session.apply('new', fields);
  await session.act('retry');
  assert.equal(session.snapshot().phase, 'conflict');
  await session.act('pull');
  assert.equal(session.state().trees[0].moments[0].title, '충돌 뒤 서버본');
  assert.deepEqual(readCachedWorkspace(storage, 'member-A').state, session.state());
});

test('#400 cacheStorage가 없으면 저장소를 건드리지 않는다(기존 시험 환경 그대로)', async () => {
  const events = [];
  const session = createMemberSession({
    api: {get: async () => ({ok: true, revision: 1, state: stateOf('서버'), subject: 'member-A', writeSubjectBound: true}), put: async () => ({ok: true, revision: 2}), logout: async () => ({ok: true})},
    onState: s => events.push(s), delay: () => new Promise(() => {}),
  });
  await session.start();
  assert.equal(events.length, 1);
  assert.equal(session.state().trees[0].moments[0].title, '서버');
});
// #986: 옛 버전이 남긴 저장본에 어긋난 트리가 섞여 있어도 저장본 통째를 버리지 않고
// 그 트리만 빼서 읽는다(안내는 서버 응답의 quarantined 개수가 알려 준다).
test('#986 저장본에 어긋난 트리가 섞여 있으면 그 트리만 빼고 읽는다', () => {
  const storage = fakeStorage();
  writeCachedWorkspace(storage, 'member-A', stateOf('정상 기록'));
  const entry = JSON.parse(storage.getItem(entryKey('member-A')));
  entry.state.trees.push({ id: 't-broken', title: '어긋난 트리', moments: [] });
  storage.setItem(entryKey('member-A'), JSON.stringify(entry));
  const cached = readCachedWorkspace(storage, 'member-A');
  assert.equal(cached.subject, 'member-A');
  assert.deepEqual(cached.state.trees.map(tree => tree.subject), ['별'], '어긋난 트리만 빠진다');
  assert.ok(storage.getItem(entryKey('member-A')), '저장본을 지우지 않는다');
});

// ---- A-18: 기기 저장본을 먼저 그리기 전에 계정을 확인한다 ----

test('A-18 ① 저장본 읽기는 마지막 계정 표식을 따라가지 않고 정해준 계정만 읽는다', () => {
  const storage = fakeStorage();
  writeCachedWorkspace(storage, 'member-A', stateOf('A 기록'));
  assert.equal(readCachedWorkspace(storage), null, '계정을 모르면 읽지 않는다');
  assert.equal(readCachedWorkspace(storage, 'member-B'), null, 'LAST 표식이 member-A를 가리켜도 다른 계정은 읽지 않는다');
  assert.equal(readCachedWorkspace(storage, 'bad subject!'), null, '형식이 어긋난 계정은 읽지 않는다');
  assert.equal(readCachedWorkspace(storage, 'member-A').subject, 'member-A', '정해준 계정의 저장본만 읽는다');
  assert.ok(storage.getItem(entryKey('member-A')), '읽지 않았어도 저장본은 남아 있다');
});

test('A-18 로그인 표식은 서버가 확인한 계정만 남긴다', () => {
  const storage = fakeStorage();
  assert.equal(readLoginSubject(storage), null);
  assert.equal(rememberLoginSubject(storage, 'member-A'), true);
  assert.equal(storage.getItem(LOGIN), 'member-A');
  assert.equal(rememberLoginSubject(storage, 'bad subject!'), false, '형식이 어긋난 계정은 남기지 않는다');
  assert.equal(rememberLoginSubject(storage, null), false);
  assert.equal(readLoginSubject(storage), 'member-A');
  forgetLoginSubject(storage);
  assert.equal(readLoginSubject(storage), null);
  assert.equal(storage.getItem(LOGIN), null);
});

test('A-18 ① 다른 계정 표식으로 시작하면 저장본을 그리지 않고 서버 응답을 기다린다', async () => {
  const storage = fakeStorage();
  writeCachedWorkspace(storage, 'member-A', stateOf('남의 저장본'));
  rememberLoginSubject(storage, 'member-B');
  let resolveGet;
  const events = [];
  const {session} = sessionWith({storage, get: () => new Promise(r => { resolveGet = r; }), onState: s => events.push(s)});
  const starting = session.start();
  assert.equal(events.length, 0, '서버 응답 전에 아무것도 그리지 않는다');
  assert.equal(session.snapshot().phase, 'checking');
  resolveGet({ok: true, revision: 1, state: stateOf('서버 기록'), subject: 'member-B', writeSubjectBound: true});
  await starting;
  assert.equal(session.state().trees[0].moments[0].title, '서버 기록');
  assert.equal(readLoginSubject(storage), 'member-B', '확인 뒤 표식이 새 계정으로 남는다');
  assert.deepEqual(readCachedWorkspace(storage, 'member-B').state, session.state());
});

test('A-18 ② 같은 계정 표식이면 지금처럼 저장본을 먼저 그린다', async () => {
  const storage = fakeStorage();
  const cached = stateOf('저장본 순간');
  seedCache(storage, 'member-A', cached);
  let resolveGet;
  const events = [];
  const {session} = sessionWith({storage, get: () => new Promise(r => { resolveGet = r; }), onState: s => events.push(s)});
  const starting = session.start();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], cached);
  assert.equal(session.snapshot().phase, 'checking');
  resolveGet({ok: true, revision: 3, state: stateOf('서버 순간'), subject: 'member-A', writeSubjectBound: true});
  await starting;
  assert.equal(session.state().trees[0].moments[0].title, '서버 순간');
});

test('A-18 ③ 표식 없이(로그아웃 상태로) 시작하면 저장본이 있어도 그리지 않는다', async () => {
  const storage = fakeStorage();
  writeCachedWorkspace(storage, 'member-A', stateOf('옛 저장본'));
  const events = [];
  const {session} = sessionWith({storage, onState: s => events.push(s)});
  await session.start();
  assert.equal(events.length, 1, '저장본 없이 서버 응답 한 번만 그린다');
  assert.equal(session.state().trees[0].moments[0].title, '서버 기록');
  assert.equal(readLoginSubject(storage), 'member-A', '서버가 확인한 뒤에 표식이 생긴다');
});

test('A-18 저장하다 만난 401은 표식과 저장본을 그대로 둔다(다시 확인은 #1165의 몫)', async () => {
  const storage = fakeStorage();
  seedCache(storage, 'member-A', stateOf('서버 기록'));
  const {session} = sessionWith({storage, draftStorage: null, put: async () => ({ok: false, status: 401, code: 'unauthenticated'})});
  await session.start();
  session.apply('new', fields);
  await session.act('retry');
  assert.equal(session.snapshot().phase, 'login');
  assert.equal(readLoginSubject(storage), 'member-A', '일시적인 401 뒤에도 표식은 남는다');
  assert.ok(readCachedWorkspace(storage, 'member-A'), '저장본도 남는다');
});

test('A-18 로그인 시작으로 표식을 비운 뒤에는 다른 계정으로 확인되기 전까지 저장본을 그리지 않는다', async () => {
  const storage = fakeStorage();
  seedCache(storage, 'member-A', stateOf('옛 저장본'));
  // shell/auth.mjs startLogin·상태 띄 로그인 단추·act('login')이 로그인 시작 때 하는 일과 같다.
  forgetLoginSubject(storage);
  let resolveGet;
  const events = [];
  const {session} = sessionWith({storage, get: () => new Promise(r => { resolveGet = r; }), onState: s => events.push(s)});
  const starting = session.start();
  assert.equal(events.length, 0, '표식이 비었으니 저장본이 그려지지 않는다');
  assert.equal(session.snapshot().phase, 'checking');
  resolveGet({ok: true, revision: 1, state: stateOf('새 계정 기록'), subject: 'member-B', writeSubjectBound: true});
  await starting;
  assert.equal(session.state().trees[0].moments[0].title, '새 계정 기록');
  assert.equal(readLoginSubject(storage), 'member-B', '새 계정이 확인된 뒤 표식이 다시 생긴다');
});

test('A-18 세션의 로그인 시작(act)도 표식을 비운다', async () => {
  const storage = fakeStorage();
  seedCache(storage, 'member-A', stateOf('기록'));
  const {session} = sessionWith({storage});
  await session.start();
  assert.equal(readLoginSubject(storage), 'member-A');
  await session.act('login');
  assert.equal(readLoginSubject(storage), null, '로그인 화면으로 보내기 전에 표식을 비운다');
});
