// #327(① 데이터 규칙): member.apply('quickAdd'|'moveMoment'|'treeFromMoments')가 기존 저장
// 경로(PUT /api/workspace)로 저장되는지, 그리고 서버 경계(PUT→GET)에서 inbox 필드가 유지되는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberSession } from '../public/v41/member-session.mjs';
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createTree, addMoment, validateState } from '../src/domain.js';

const URL = 'https://example.com/watch/abc';
const CLOCK = '2026-11-09T10:00:00.000Z';
const base = { subject: '윤슬', note: '남기고 싶은 마음', emotion: '설렘', date: '2026-11-09', url: '' };

function fakeSession(initial) {
  const writes = [];
  const session = createMemberSession({
    api: {
      get: async () => ({ ok: true, status: 200, revision: 1, subject: 'trial-subject', writeSubjectBound: true, state: initial }),
      put: async body => { writes.push(body); return { ok: true, status: 200, revision: writes.length + 1 }; },
      logout: async () => ({ ok: true, status: 200 })
    },
    delay: () => Promise.resolve(),
    draftStorage: null
  });
  return { session, writes };
}

test('member.apply quickAdd → moveMoment → treeFromMoments가 저장 경로로 저장된다', async () => {
  const initial = { version: 1, trees: [createTree({ ...base, title: '윤슬의 책' }, CLOCK)] };
  const { session, writes } = fakeSession(initial);
  await session.start();

  const added = session.apply('quickAdd', { url: URL });
  await new Promise(resolve => setImmediate(resolve));
  const inbox = session.state().trees.find(t => t.inbox === true);
  assert.ok(inbox, 'inbox 트리가 생긴다');
  assert.deepEqual(added, { treeId: inbox.id, momentId: inbox.moments[0].id });
  assert.equal(writes.at(-1)?.state?.trees.some(t => t.inbox === true), true, 'quickAdd는 PUT으로 저장된다');

  const moved = session.apply('moveMoment', { toTreeId: initial.trees[0].id, parentId: null }, { treeId: inbox.id, momentId: inbox.moments[0].id });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(moved.treeId, initial.trees[0].id, '옮긴 뒤 대상 트리를 가리킨다');
  assert.equal(session.state().trees.some(t => t.id === inbox.id), false, '빈 inbox 트리는 삭제된다');
  assert.equal(writes.at(-1)?.state?.trees.find(t => t.id === initial.trees[0].id)?.moments.some(m => m.id === inbox.moments[0].id), true, 'moveMoment는 PUT으로 저장된다');

  const regrown = session.apply('quickAdd', { url: 'https://example.com/two' });
  const inbox2 = session.state().trees.find(t => t.id === regrown.treeId);
  const grown = session.apply('quickAdd', { url: 'https://example.com/three' });
  const made = session.apply('treeFromMoments', { momentIds: [regrown.momentId, grown.momentId], subject: '겨울 소리' }, { treeId: regrown.treeId });
  await new Promise(resolve => setImmediate(resolve));
  const madeTree = session.state().trees.find(t => t.id === made.treeId);
  assert.equal(madeTree.subject, '겨울 소리', '새 트리 이름');
  assert.equal(madeTree.inbox, false, '새 트리는 inbox=false');
  assert.equal(madeTree.moments.length, 2, '고른 순간 두 개가 새 트리로');
  assert.equal(writes.at(-1)?.state?.trees.some(t => t.id === made.treeId), true, 'treeFromMoments는 PUT으로 저장된다');
  assert.doesNotThrow(() => validateState(session.state()), '세션 상태는 항상 검증을 통과한다');
  session.dispose();
});

test('member.apply는 지원하지 않는 작업 문구를 그대로 유지한다', async () => {
  const { session } = fakeSession({ version: 1, trees: [createTree({ ...base, title: '윤슬의 책' }, CLOCK)] });
  await session.start();
  const treeId = session.state().trees[0].id;
  assert.throws(() => session.apply('없는작업', {}, { treeId, momentId: session.state().trees[0].moments[0].id }), /지원하지 않는 작업이에요./);
  session.dispose();
});

// ── 서버 경계: 배포되는 서버 코드(server/workspace-service.js + src/domain.js)를 직접 불러
// 저장(PUT)→읽기(GET) 왕복을 본다(#182 전례 — 클라이언트 사본 시험만으로는 못 잡는다).
const PRODUCT = 'lovetree-4-0';
const SUBJECT = 'sub_inbox00000001';

function build() {
  const repo = createMemoryWorkspaceRepo();
  const service = createWorkspaceService({ repo, productId: PRODUCT });
  const principal = { productId: PRODUCT, subjectId: SUBJECT };
  return { service, principal };
}

test('서버 저장 경계: inbox 필드를 PUT→GET 왕복에 유지한다', async () => {
  const { service, principal } = build();
  const state = validateState({ version: 1, trees: [{ ...createTree({ ...base, title: '윤슬의 책' }, CLOCK), inbox: true }] });
  const write = await service.write(principal, { state, expectedRevision: 0, clientKey: 'inbox-create-1' });
  assert.equal(write.revision, 1);
  const read = await service.read(principal);
  assert.equal(read.state.trees[0].inbox, true, '저장한 inbox가 읽기에서 유지된다');
});

test('서버 저장 경계: inbox 트리 2개는 첫 번째만 true로 정리되고, 빼고 저장하면 false가 된다', async () => {
  const { service, principal } = build();
  const treeOf = title => ({ ...createTree({ ...base, title }, CLOCK), inbox: true });
  const write = await service.write(principal, { state: validateState({ version: 1, trees: [treeOf('첫째'), treeOf('둘째')] }), expectedRevision: 0, clientKey: 'inbox-two-1' });
  assert.equal(write.revision, 1, '저장 거부가 아니다(200 계약)');
  const first = await service.read(principal);
  assert.equal(first.state.trees[0].inbox, true, '첫 번째만 true');
  assert.equal(first.state.trees[1].inbox, false, '두 번째는 false로 정리');
  const state = validateState(first.state);
  const { inbox, ...withoutInbox } = state.trees[0];
  await service.write(principal, { state: { version: 1, trees: [withoutInbox, state.trees[1]] }, expectedRevision: first.revision, clientKey: 'inbox-drop-1' });
  const read = await service.read(principal);
  assert.equal(read.state.trees[0].inbox, false, '필드가 없으면 false(옛 클라이언트 호환)');
  assert.equal(read.state.trees[1].inbox, false);
});

// ── #1439: 순간 정리의 옮기기·복사하기·되돌리기도 같은 저장 경로(PUT)로 간다 ──
test('#1439 member.apply organizeMoments(복사) → undoOrganize가 저장 경로로 저장되고 원래대로 돌아온다', async () => {
  const one = createTree({ ...base, title: '윤슬의 책', url: 'https://youtu.be/dQw4w9WgXcQ' }, CLOCK);
  const two = createTree({ ...base, subject: '빌리', title: '빌리 하루나' }, CLOCK);
  const three = createTree({ ...base, subject: '바다', title: '바다' }, CLOCK);
  const { session, writes } = fakeSession({ version: 1, trees: [one, two, three] });
  await session.start();
  const before = session.state();
  const done = session.apply('organizeMoments', { mode: 'copy', momentIds: [one.moments[0].id], toTreeIds: [two.id, three.id] }, { treeId: one.id }, { tree: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done.treeId, one.id, '원래 트리에 머문다');
  assert.deepEqual(done.summary, { moments: 1, trees: 2, placed: 2, skipped: 0 });
  const putCopies = writes.at(-1).state.trees.flatMap(t => t.moments).filter(m => m.copiedFrom === one.moments[0].id);
  assert.equal(putCopies.length, 2, '사본 두 개와 원본 표시가 PUT 본문에 있다');
  session.apply('undoOrganize', { record: done.record }, { treeId: one.id }, { tree: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(session.state(), before, '되돌리면 처음 모습');
  assert.equal(writes.at(-1).state.trees.flatMap(t => t.moments).some(m => m.copiedFrom), false, '되돌린 것도 PUT으로 저장된다');
  session.dispose();
});

test('#1439 서버 저장 경계: copiedFrom을 PUT→GET 왕복에 유지하고, 공개 사본에는 싣지 않는다', async () => {
  const { service, principal } = build();
  const source = createTree({ ...base, title: '윤슬의 책' }, CLOCK);
  const target = createTree({ ...base, subject: '빌리', title: '빌리 하루나' }, CLOCK);
  const copy = { ...source.moments[0], id: 'copy-0001', parentId: target.moments[0].id, copiedFrom: source.moments[0].id };
  const state = validateState({ version: 1, trees: [source, { ...target, moments: [...target.moments, copy] }] });
  await service.write(principal, { state, expectedRevision: 0, clientKey: 'copy-1439-1' });
  const read = await service.read(principal);
  assert.equal(read.state.trees[1].moments.find(m => m.id === 'copy-0001').copiedFrom, source.moments[0].id, '원본 표시가 서버 왕복에 남는다');
  const { projectSharedTree } = await import('../server/share-service.js');
  const shared = projectSharedTree(read.state, target.id).tree;
  assert.equal(shared.moments.some(m => 'copiedFrom' in m), false, '공개 사본에는 원본 표시를 싣지 않는다');
});
