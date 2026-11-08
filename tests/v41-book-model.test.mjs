// 기억책 계산 한 벌 시험(#231). 화면이 부르는 같은 파일을 그대로 실행해 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = globalThis;
await import('../public/v41/views/book/book-model.js');
const M = globalThis.LT59Model;
const BOOK = fs.readFileSync(new URL('../public/v41/views/book/book.js', import.meta.url), 'utf8');
const EXTRA = fs.readFileSync(new URL('../public/v41/views/book/book-extra.js', import.meta.url), 'utf8');
const HTML = fs.readFileSync(new URL('../public/v41/views/track59-sketchbook.html', import.meta.url), 'utf8');

const moments = [
  { id: 'm1', type: 'photo', title: 'A', date: '2026.01.01', emotion: '끌림', next: 'm2', branch: 'm3', whyNext: 'w', first: true },
  { id: 'm2', type: 'memo', title: 'B', date: 'd2', emotion: 'e' },
  { id: 'm3', type: 'link', title: 'C', date: 'd3', emotion: 'e3' },
  { id: 'm4', type: 'photo', title: 'D', date: 'd4', emotion: 'e4' }
];

test('0. 계산 한 벌은 화면이 부르는 함수만 노출하고, 모델을 화면보다 먼저 부른다', () => {
  assert.deepEqual(Object.keys(M).sort(), ['buildSpreads', 'connectionSummary', 'folioLabel', 'nextMomentOf', 'turnAngle']);
  assert.ok(HTML.indexOf('book-model.js') < HTML.indexOf('book.js'), '모델을 화면보다 먼저 부른다');
});

test('1. 펼침면: 순간 둘씩 묶고, 모자라면 동반 페이지(합성)를 만든다', () => {
  const spreads = M.buildSpreads(moments);
  assert.equal(spreads.length, 2);
  assert.equal(spreads[0].eyebrow, '01 · 2026.01.01');
  assert.equal(spreads[0].left.id, 'm1');
  assert.equal(spreads[0].right.id, 'm2');
  assert.equal(spreads[1].left.id, 'm3');
  const odd = M.buildSpreads(moments.slice(0, 3));
  assert.equal(odd.length, 2);
  assert.equal(odd[1].right.kind, 'companion');
  assert.equal(odd[1].right.synthetic, true);
  assert.equal(odd[1].right.id, 'm3-end');
  assert.equal(odd[1].right.title, '다음 순간을 기다리며');
});

test('2. 펼침면 갈래: 갈래·다음이 모두 실제 순간일 때만 붙는다', () => {
  const withBranch = M.buildSpreads(moments)[0];
  assert.equal(withBranch.branch.source, 'm1');
  assert.equal(withBranch.branch.moment, 'm3');
  assert.equal(withBranch.branch.main, 'm2');
  assert.equal(withBranch.branch.to, 1);
  // 갈래 대상이 없는 기록에는 붙지 않는다.
  const plain = M.buildSpreads([{ id: 'x1', title: 'X', date: 'd' }, { id: 'x2', title: 'Y', date: 'd' }]);
  assert.equal(plain[0].branch, null);
  // 빈 기록은 펼침면 0장.
  assert.deepEqual(M.buildSpreads([]), []);
});

test('3. 쪽번호: 펼침 번호 × 2 + 왼쪽 1 / 오른쪽 2, 두 자리', () => {
  assert.equal(M.folioLabel(0, 'left'), '01');
  assert.equal(M.folioLabel(0, 'right'), '02');
  assert.equal(M.folioLabel(19, 'left'), '39');
  assert.equal(M.folioLabel(19, 'right'), '40');
});

// 4. 넘김 각도 표.
//  진행 p | next      | prev      | 종이 휨(bend)
//  0      | 0°        | 0°        | 0
//  0.5    | -90°      | +90°      | 2.2°
//  1      | -180°     | +180°     | 0
test('4. 넘김 각도·휨: 방향에 따라 부호가 뒤집히고 휨은 중간에서 최대', () => {
  // -0과 0은 같은 각도다(원문 계산과 동일).
  assert.ok(Math.abs(M.turnAngle(0, 'next').deg) === 0);
  assert.equal(M.turnAngle(0, 'next').bend, 0);
  assert.equal(M.turnAngle(0.5, 'next').deg, -90);
  assert.equal(M.turnAngle(0.5, 'prev').deg, 90);
  assert.ok(Math.abs(M.turnAngle(0.5, 'next').bend - 2.2) < 1e-12);
  assert.equal(M.turnAngle(1, 'next').deg, -180);
  assert.equal(M.turnAngle(1, 'prev').deg, 180);
  assert.ok(Math.abs(M.turnAngle(1, 'next').bend) < 1e-12);
});

test('5. 연결 요약: 다음 순간 제목들 + 이유, 없으면 안내 문구', () => {
  assert.equal(M.connectionSummary('m1', moments, [{ kind: 'parent', from: 'm1', to: 'm2' }]), 'A → B · w');
  assert.equal(M.connectionSummary('m2', moments, []), 'B · 연결된 다음 순간이 없습니다.');
  assert.equal(M.connectionSummary('zzz', moments, []), '선택한 순간의 연결 정보가 없습니다.');
  assert.equal(M.connectionSummary('m1', moments, [{ kind: 'related', from: 'm1', to: 'm3' }]), 'A · 연결된 다음 순간이 없습니다.');
});

test('6. 다음 순간: 부모 연결로 이어진 다음 순간과 이유, 없으면 null', () => {
  const edges = [{ kind: 'parent', from: 'm1', to: 'm2', reason: 'r1' }];
  assert.deepEqual(M.nextMomentOf('m1', moments, edges, (t) => t), { id: 'm2', title: 'B', reason: 'r1' });
  assert.equal(M.nextMomentOf('m2', moments, edges, (t) => t), null);
  assert.equal(M.nextMomentOf('zzz', moments, edges, (t) => t), null);
  // 표시 이름 함수를 넘기면 그 결과를 쓴다(사용자 제목 규칙은 book-usability.mjs 그대로).
  assert.equal(M.nextMomentOf('m1', moments, edges, () => '표시 제목').title, '표시 제목');
  // 표시 이름이 비면 메모로 대체한다.
  const noTitle = [{ id: 'm1', next: 'm2' }, { id: 'm2', memo: '메모만 있는 순간' }];
  assert.equal(M.nextMomentOf('m1', noTitle, [], () => '').title, '메모만 있는 순간');
});

test('7. 화면은 같은 계산을 다시 구현하지 않고 한 벌을 부른다', () => {
  assert.doesNotMatch(BOOK, /const SPREADS=Array\.from/);
  assert.doesNotMatch(BOOK, /String\(m\.spread\*2\+\(side==='left'\?1:2\)\)/);
  assert.doesNotMatch(BOOK, /const deg=dir==='next'\?-180\*p:180\*p/);
  // 연결 요약 문구는 화면에 남아 있지 않다(갈래 목록 계산은 다른 계산이라 그대로 둔다).
  assert.doesNotMatch(BOOK, /선택한 순간의 연결 정보가 없습니다/);
  assert.doesNotMatch(BOOK, /targets\.join\(' \/ '\)/);
  assert.doesNotMatch(EXTRA, /const edge=LTDEMO\.edges\.find\(e=>e\.kind==='parent'&&e\.from===id&&e\.to===next\.id\)/);
  for (const call of ['LT59Model.buildSpreads', 'LT59Model.folioLabel', 'LT59Model.turnAngle', 'LT59Model.connectionSummary']) {
    assert.ok(BOOK.includes(call), call);
  }
  assert.ok(EXTRA.includes('LT59Model.nextMomentOf'));
});

test('8. 이미 한 벌인 규칙은 그대로 둔다(book-usability.mjs)', () => {
  const USABILITY = fs.readFileSync(new URL('../public/v41/book-usability.mjs', import.meta.url), 'utf8');
  for (const name of ['export function tapIntent', 'export function pageOverflows', 'export function displayTitle', 'export function connectionLine', 'export function detailPlacement']) {
    assert.ok(USABILITY.includes(name), name);
  }
  // 화면은 그 규칙을 다시 만들지 않고 넘겨받아 쓴다.
  assert.ok(EXTRA.includes('window.LTTapIntent=tapIntent'));
});
