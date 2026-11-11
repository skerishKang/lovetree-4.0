// #394 2·4번: 첫 화면 순간 목록 — 모든 트리의 순간을 최근 순으로, 트리별로 걸러 보기, 들어가는 길.
// 계산은 v41/moment-list.js 한 벌이 맡고, 셸·첫 화면 연결은 소스 계약으로 고정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { momentListTrees, momentListEntries, filterMomentEntries, momentHeadTitle, verticalMoment } from '../v41/moment-list.js';

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

test('세로 영상 판정: /shorts/ 주소와 영상 정보의 가로세로(#393과 같은 규칙)', () => {
  assert.equal(verticalMoment('https://www.youtube.com/shorts/abc123XYZ_-'), true);
  assert.equal(verticalMoment('https://www.youtube.com/watch?v=abc123XYZ_-'), false);
  assert.equal(verticalMoment('https://www.youtube.com/watch?v=abc123XYZ_-', { width: 1080, height: 1920 }), true);
  assert.equal(verticalMoment('https://www.youtube.com/watch?v=abc123XYZ_-', { width: 1920, height: 1080 }), false);
  assert.equal(verticalMoment(''), false);
  assert.equal(verticalMoment('not a url'), false);
});

test('셸 트리 드롭다운: 맨 아래 "내 순간 전체 보기"가 있고, 내 기록(서버)에서만 그린다', () => {
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /data-tree-action="moments"/);
  assert.match(shell, /내 순간 전체 보기/);
  assert.match(shell, /const momentsEntry=source==='server'&&window\.LT41\?/);
  // 누르면 첫 화면을 다시 불러 순간 목록을 열게 하고, 시작 트리를 플래그로 남긴다.
  assert.match(shell, /LT41_MOMENTS_OPEN=\{treeId:window\.LT41\?\.tree\?\.id\|\|''\}/);
  assert.match(shell, /show\('src064-orbit\.html'\)/);
});

test('셸은 첫 화면의 완료 알림(lt41-moments-opened)을 받아 요청 플래그를 치운다', () => {
  const messages = read('public/v41/shell/messages.mjs');
  assert.match(messages, /lt41-moments-opened/);
  assert.match(messages, /delete window\.LT41_MOMENTS_OPEN/);
});

test('첫 화면(v41/home.js)은 모든 트리의 순간 목록을 만들어 궤도에 넣고, 요청 트리로 시작한다', () => {
  const home = read('v41/home.js');
  assert.match(home, /momentListEntries\(\{trees:context\.trees,youtube\}\)/);
  assert.match(home, /momentListTrees\(context\.trees\)/);
  assert.match(home, /initialTreeId:momentsRequest\?\.treeId\|\|'all'/);
  assert.match(home, /initialOpen:!!momentsRequest/);
  assert.match(home, /type:'lt41-moments-opened'/);
});

test('첫 화면 궤도: 순간 목록은 트리 고르기 칸과 빈 목록 안내를 그린다', () => {
  const orbit = read('src/views/orbit.js');
  assert.match(orbit, /data-tree-filter/);
  assert.match(orbit, /index-empty/);
  assert.match(orbit, /이 트리에 아직 순간이 없어요\./);
  assert.match(orbit, /아직 순간이 없어요\./);
  // 목록 행의 제목은 자동 문구 규칙(momentHeadTitle)을 쓴다.
  assert.match(orbit, /momentHeadTitle\(c,titleMode\)/);
  // 목록에서 고른 순간은 목록 풀에서 찾는다(다른 트리의 순간도 연다).
  assert.match(orbit, /focus\(findMoment\(b\.dataset\.next\)\)/);
});
