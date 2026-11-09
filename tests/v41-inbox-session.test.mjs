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
