import test from 'node:test';
import assert from 'node:assert/strict';
// #256-3 표지 고르기 — 서버 경계 시험: 배포되는 서버 코드(server/workspace-service.js + src/domain.js)를
// 직접 불러 저장(PUT)→읽기(GET) 왕복을 본다. 클라이언트 사본 시험만으로는 서버가 필드를 지우는 사고(#182 전례)를 못 잡는다.
import { createWorkspaceService } from '../server/workspace-service.js';
import { createMemoryWorkspaceRepo } from '../server/testing/memory-workspace-repo.js';
import { createTree, addMoment, validateState, normalizeCoverDesign, COVER_DESIGN_IDS } from '../src/domain.js';

const PRODUCT = 'lovetree-4-0';
const SUBJECT = 'sub_cover000001';
const CLOCK = '2026-11-09T10:00:00.000Z';
const base = { subject: '윤슬', note: '남기고 싶은 마음', emotion: '설렘', date: '2026-11-09', url: '' };

function build() {
  const repo = createMemoryWorkspaceRepo();
  const service = createWorkspaceService({ repo, productId: PRODUCT });
  const principal = { productId: PRODUCT, subjectId: SUBJECT };
  return { service, principal };
}

function sampleState(cover = {}) {
  const tree = createTree({ ...base, title: '윤슬의 책' }, CLOCK);
  const grown = addMoment(tree, { ...base, title: '이어진 순간', relation: '기억나서' }, tree.moments[0].id, CLOCK);
  return { version: 1, trees: [{ ...grown, coverMomentId: '', coverDesign: '', ...cover }] };
}

test('서버 저장 경계: coverDesign을 PUT→GET 왕복에 유지한다', async () => {
  const { service, principal } = build();
  const write = await service.write(principal, { state: sampleState({ coverDesign: 'texture-3' }), expectedRevision: 0, clientKey: 'cover-create-1' });
  assert.equal(write.revision, 1);
  const read = await service.read(principal);
  assert.equal(read.state.trees[0].coverDesign, 'texture-3', '저장한 디자인 표지가 읽기에서 유지된다');
  assert.deepEqual(Object.keys(read.state.trees[0]).sort(), ['coverDesign', 'coverMomentId', 'createdAt', 'id', 'inbox', 'moments', 'subject', 'title', 'updatedAt'], '트리 필드는 이것만');
});

test('서버 저장 경계: 목록 밖 값은 저장 거부가 아니라 \'\'로 정리된다', async () => {
  const { service, principal } = build();
  await service.write(principal, { state: sampleState({ coverDesign: 'texture-3' }), expectedRevision: 0, clientKey: 'cover-create-2' });
  const stored = await service.read(principal);
  const state = validateState(stored.state);
  const put = await service.write(principal, { state: { version: 1, trees: [{ ...state.trees[0], coverDesign: 'texture-9' }] }, expectedRevision: stored.revision, clientKey: 'cover-invalid-1' });
  assert.equal(put.revision, 2, '저장 거부가 아니다(200 계약)');
  const read = await service.read(principal);
  assert.equal(read.state.trees[0].coverDesign, '');
});

test('서버 저장 경계: coverDesign을 빼고 저장하면 \'\'가 된다(옛 클라이언트 호환)', async () => {
  const { service, principal } = build();
  await service.write(principal, { state: sampleState({ coverDesign: 'texture-1' }), expectedRevision: 0, clientKey: 'cover-create-3' });
  const stored = await service.read(principal);
  const state = validateState(stored.state);
  const { coverDesign, ...withoutDesign } = state.trees[0];
  await service.write(principal, { state: { version: 1, trees: [withoutDesign] }, expectedRevision: stored.revision, clientKey: 'cover-drop-1' });
  const read = await service.read(principal);
  assert.equal(read.state.trees[0].coverDesign, '', '필드가 없으면 기본 표지(\'\')로');
});

test('두 벌 허용 목록(서버·클라이언트)과 normalize가 서버 파일 기준에서도 일관이다', () => {
  assert.equal(COVER_DESIGN_IDS.length, 6);
  for (const id of COVER_DESIGN_IDS) assert.equal(normalizeCoverDesign(id), id);
  assert.equal(normalizeCoverDesign('texture-7'), '');
});
