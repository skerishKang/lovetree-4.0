// #394 2·4번: 첫 화면 순간 목록 — 모든 트리의 순간을 최근 순으로, 트리별로 걸러 보기, 들어가는 길.
// 계산은 v41/moment-list.js 한 벌이 맡고, 셸·첫 화면 연결은 소스 계약으로 고정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { momentListTrees, momentListEntries, filterMomentEntries, momentHeadTitle, orderedTrees } from '../v41/moment-list.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const tree = (id, moments, extra = {}) => ({ id, title: extra.title ?? `${id} 트리`, moments, ...extra });
const moment = (id, extra = {}) => ({ id, title: extra.title ?? `순간 ${id}`, note: '', emotion: '설렘', date: '2026. 11. 11.', createdAt: extra.createdAt ?? '2026-11-11T00:00:00Z', ...extra });

test('트리 고르기 칸: 모아둔 순간이 먼저고 이름은 정리 화면과 같은 한 벌(pickerLabel)을 쓴다', () => {
  const trees = [
    tree('t1', [moment('m1')], { title: '첫사랑, 나의 순간들' }),
    tree('inbox', [moment('m2')], { inbox: true, title: '모아둔 순간' })
  ];
  const list = momentListTrees(trees);
  assert.deepEqual(list.map(t => t.id), ['inbox', 't1']);
  assert.equal(list[0].label, '모아둔 순간');
  assert.equal(list[1].label, '첫사랑');
  assert.equal(list[0].inbox, true);
  // 트리마다 고정 색(2026-11-16 대표 지적) — shelfOrder 자리가 색을 정하고 다시 불러도 같다.
  assert.equal(list[0].color, 'var(--lt-tree-1)', '모아둔 순간(첫 자리)의 고정 색');
  assert.equal(list[1].color, 'var(--lt-tree-2)', '두 번째 자리의 고정 색');
  assert.equal(momentListTrees(trees)[1].color, list[1].color, '같은 트리는 다시 불러도 같은 색이다');
});

test('트리 고르기 칸: id가 없는 트리는 뺀다', () => {
  assert.deepEqual(momentListTrees([tree('t1', []), { id: '', moments: [] }, null]), [momentListTrees([tree('t1', [])])[0]]);
});

test('순간 목록: 모든 트리의 순간을 최근 순으로 모은다', () => {
  const entries = momentListEntries({
    trees: [
      tree('t1', [moment('a1', { createdAt: '2026-11-01T00:00:00Z' }), moment('a2', { createdAt: '2026-11-03T00:00:00Z' })]),
      tree('t2', [moment('b1', { createdAt: '2026-11-02T00:00:00Z' })])
    ]
  });
  assert.deepEqual(entries.map(e => e.key), ['t1/a2', 't2/b1', 't1/a1']);
  assert.equal(entries[0].treeId, 't1');
  assert.equal(entries[1].treeLabel, 't2 트리');
});

test('순간 목록: 마음 한마디는 제목으로 대체하지 않는다(자동 문구가 목록에 스며들지 않는다)', () => {
  const entries = momentListEntries({
    trees: [tree('t1', [moment('a1', { title: 'youtube.com에서 간직한 순간', note: '' })])]
  });
  assert.equal(entries[0].note, '');
  assert.equal(entries[0].title, 'youtube.com에서 간직한 순간', '저장 값은 그대로 둔다(표시 단계에서만 거른다)');
});

test('트리별로 걸기: 전체(all)와 트리 하나, 모르는 id는 빈 목록', () => {
  const entries = momentListEntries({
    trees: [tree('t1', [moment('a1')]), tree('t2', [moment('b1')])]
  });
  assert.equal(filterMomentEntries(entries, 'all').length, 2);
  assert.deepEqual(filterMomentEntries(entries, 't2').map(e => e.id), ['b1']);
  assert.deepEqual(filterMomentEntries(entries, 'ghost'), []);
  assert.equal(filterMomentEntries(null, 'all').length, 0);
});

test('상세 창·목록 제목 규칙(#394 3번): 자동 기본 문구는 표시하지 않고 마음 한마디를 큰 글씨로 쓴다', () => {
  const auto = 'youtube.com에서 간직한 순간';
  // 직접 쓴 제목이 있으면 그것.
  assert.equal(momentHeadTitle({ title: '우리의 첸 날', note: '' }).main, '우리의 첸 날');
  // 자동 문구 + 마음 한마디 → 마음 한마디가 큰 글씨(자동 문구는 걸러짐).
  const withMemo = momentHeadTitle({ title: auto, note: '이 장면이 좋았다' });
  assert.equal(withMemo.main, '이 장면이 좋았다');
  assert.equal(withMemo.memoAsMain, true);
  // 자동 문구 + 마음 한마디 없음 → 빈 값(표시하지 않음).
  assert.equal(momentHeadTitle({ title: auto, note: '' }).main, '');
  // 영상 제목(#344)이 있으면 큰 제목이 된다(정리 화면과 같은 규칙).
  assert.equal(momentHeadTitle({ title: auto, note: '', mediaMetadata: { title: '영상 제목' } }).main, '영상 제목');
  // 자동 문구가 아닌 값은 걸러지지 않는다.
  assert.equal(momentHeadTitle({ title: '직접 쓴 제목', note: '메모' }).memoAsMain, false);
});

test('세로 영상 판정은 #393 한 버(LTMedia.verticalVideo)을 쓴다 — 이 레인에서 새로 만들지 않는다', () => {
  assert.doesNotMatch(read('v41/moment-list.js'), /verticalMoment/);
  assert.match(read('public/v41/media-preview.js'), /function verticalVideo/);
});

test('orderedTrees: 저장한 순서를 앞에 두고 없는 트리는 기존 순서 뒤에 붙인다', () => {
  const trees = [{ id: 'a', label: '가' }, { id: 'b', label: '나' }, { id: 'c', label: '다' }];
  assert.deepEqual(orderedTrees(trees, ['c', 'a']).map(t => t.id), ['c', 'a', 'b']);
  assert.deepEqual(orderedTrees(trees, []).map(t => t.id), ['a', 'b', 'c'], '저장한 순서가 없으면 기존 순서다');
  assert.deepEqual(orderedTrees(trees, ['x', 'b']).map(t => t.id), ['b', 'a', 'c'], '모르는 id는 건너뛴다');
  assert.deepEqual(orderedTrees(trees, ['b', 'b', 'b']).map(t => t.id), ['b', 'a', 'c'], '같은 id가 여러 번 저장돼도 한 번만 쓴다');
  assert.deepEqual(orderedTrees(null, ['a']), [], '목록이 없으면 빈 값을 돌려준다');
});
