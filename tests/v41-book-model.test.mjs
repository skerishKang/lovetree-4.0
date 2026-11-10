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
const BOOK_CSS = fs.readFileSync(new URL('../public/v41/views/book/book.css', import.meta.url), 'utf8');

const moments = [
  { id: 'm1', type: 'photo', title: 'A', date: '2026.01.01', emotion: '끌림', next: 'm2', branch: 'm3', whyNext: 'w', first: true },
  { id: 'm2', type: 'memo', title: 'B', date: 'd2', emotion: 'e' },
  { id: 'm3', type: 'link', title: 'C', date: 'd3', emotion: 'e3' },
  { id: 'm4', type: 'photo', title: 'D', date: 'd4', emotion: 'e4' }
];

test('0. 계산 한 벌은 화면이 부르는 함수만 노출하고, 모델을 화면보다 먼저 부른다', () => {
  assert.deepEqual(Object.keys(M).sort(), ['buildSpreads', 'connectionSummary', 'emotionTone', 'folioLabel', 'journeyDays', 'journeyTimeline', 'nextMomentOf', 'shelfReturn', 'turnAngle']);
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
  assert.ok(EXTRA.includes('LT59Model.journeyTimeline'), '여기까지 온 길 계산도 한 벌을 부른다');
});

test('8. 이미 한 벌인 규칙은 그대로 둔다(book-usability.mjs)', () => {
  const USABILITY = fs.readFileSync(new URL('../public/v41/book-usability.mjs', import.meta.url), 'utf8');
  for (const name of ['export function tapIntent', 'export function pageOverflows', 'export function displayTitle', 'export function connectionLine', 'export function detailPlacement']) {
    assert.ok(USABILITY.includes(name), name);
  }
  // 화면은 그 규칙을 다시 만들지 않고 넘겨받아 쓴다.
  assert.ok(EXTRA.includes('window.LTTapIntent=tapIntent'));
});

// ── #345 '여기까지 온 길' 계산 표 ─────────────────────────────────────────────
test('9. 여기까지 온 길: 지금 보는 순간까지의 칸·단계·일수', () => {
  const chain = [
    { id: 'a', title: '첫 무대', date: '2026.10.02', emotion: '설렘', next: 'b', whyNext: '이 무대 보고 직캠까지 찾아봄' },
    { id: 'b', title: '팬미팅 영상', date: '2026.10.21', emotion: '응원', next: 'c', whyNext: '이어서 본 직캠' },
    { id: 'c', title: '기억해 두고 싶은 순간', date: '2026.11.09', emotion: '설렘' }
  ];
  const part = M.journeyTimeline(chain, [], 'b', (t) => t);
  assert.equal(part.steps, 2, '지금 보는 순간까지만');
  assert.equal(part.days, 19, '10.02 → 10.21');
  assert.deepEqual(part.items.map((i) => i.id), ['a', 'b']);
  assert.equal(part.items[0].first, true);
  assert.equal(part.items[1].current, true);
  assert.equal(part.items[0].reason, '이 무대 보고 직캠까지 찾아봄', '바로 다음 칸을 가리키는 whyNext');
  assert.equal(part.items[1].reason, '');
  const all = M.journeyTimeline(chain, [], 'c', (t) => t);
  assert.equal(all.steps, 3);
  assert.equal(all.days, 38, '10.02 → 11.09');
  assert.deepEqual(M.journeyTimeline([], [], 'x'), { items: [], steps: 0, days: null });
});

test('10. 여기까지 온 길: 연결 이유는 실제 연결 우선, 없으면 생략', () => {
  const list = [
    { id: 'a', title: 'A', date: '2026-01-01', next: 'b', whyNext: '예시 이유' },
    { id: 'b', title: 'B', date: '2026-01-02', next: 'c' },
    { id: 'c', title: 'C', date: '2026-01-03' }
  ];
  const edges = [{ kind: 'parent', from: 'a', to: 'b', reason: '실제 이유' }, { kind: 'parent', from: 'a', to: 'c', reason: '건너뛴 이유' }];
  const journey = M.journeyTimeline(list, edges, 'c', (t) => t);
  assert.equal(journey.items[0].reason, '실제 이유', '실제 연결의 이유가 whyNext보다 우선');
  assert.equal(journey.items[1].reason, '', '두 칸 사이에 연결이 없으면 생략');
  const mismatch = M.journeyTimeline(
    [{ id: 'a', title: 'A', date: '2026-01-01', next: 'z', whyNext: '엉뚱한 이유' }, { id: 'b', title: 'B', date: '2026-01-02' }],
    [], 'b', (t) => t);
  assert.equal(mismatch.items[0].reason, '', 'whyNext가 다음 칸을 가리키지 않으면 쓰지 않는다');
});

test('11. 여기까지 온 길: 썸네일·감정 색·제목 대체', () => {
  const list = [
    { id: 'y', title: '영상', date: '2026-01-01', externalUrl: 'https://www.youtube.com/shorts/9NXOCr-T8LU', emotion: '설렘' },
    { id: 'p', title: '사진', date: '2026-01-02', image: 'data:image/png;base64,xx', emotion: '위로' },
    { id: 'm', title: '', date: '2026-01-03', mediaMetadata: { title: '영상 제목' }, memo: '', emotion: '그리움' }
  ];
  const journey = M.journeyTimeline(list, [], 'm', (t) => t);
  assert.match(journey.items[0].thumb, /i\.ytimg\.com\/vi\/9NXOCr-T8LU\/hqdefault\.jpg/);
  assert.equal(journey.items[1].thumb, 'data:image/png;base64,xx');
  assert.equal(journey.items[2].thumb, '');
  assert.equal(journey.items[2].title, '영상 제목', '표시 제목이 비면 영상 제목');
  const privatePhoto = M.journeyTimeline([{ id: 'pp', title: 'P', date: '2026-01-01', externalUrl: '/api/media/abc.png' }], [], 'pp', () => '');
  assert.equal(privatePhoto.items[0].thumb, '/api/media/abc.png');
  assert.equal(privatePhoto.days, 0);
});

test('12. 감정 색·날짜 차: 아는 감정은 고정, 모르는 감정은 같은 글자=같은 색', () => {
  assert.equal(M.emotionTone('설렘'), 1);
  assert.equal(M.emotionTone('그리움'), 2);
  assert.equal(M.emotionTone('위로'), 3);
  assert.equal(M.emotionTone('벅참'), 4);
  assert.equal(M.emotionTone('고마움'), 5);
  assert.equal(M.emotionTone('즐거움'), 6);
  assert.equal(M.emotionTone(''), 0);
  const custom = M.emotionTone('응원');
  assert.ok(custom >= 1 && custom <= 6);
  assert.equal(M.emotionTone('응원'), custom);
  assert.equal(M.journeyDays('2026.10.02', '2026.11.09'), 38);
  assert.equal(M.journeyDays('2026-10-02', '2026-11-09'), 38);
  assert.equal(M.journeyDays('2026-10-02', ''), null);
  assert.equal(M.journeyDays('2026-02-30', '2026-03-01'), null, '없는 날짜는 세지 않는다');
  assert.equal(M.journeyDays('2026.11.09', '2026.10.02'), 0, '거꾸로면 0일');
});

test('16. 책장 돌아가기 판정: 셸 안에서 보고, 공유 감상이 아니면 책장', () => {
  assert.equal(M.shelfReturn({ source: 'example', embedded: true }), 'shelf');
  assert.equal(M.shelfReturn({ source: 'server', embedded: true }), 'shelf');
  assert.equal(M.shelfReturn({ source: 'share', embedded: true }), 'none');
  assert.equal(M.shelfReturn({ source: 'example', embedded: false }), 'none');
  assert.equal(M.shelfReturn(), 'shelf', '입력 없으면 기본은 책장');
  // 세기 증명: 공유를 열어도 되거나, 셸 밖에서도 책장으로 보내면 시험이 잡는다.
  assert.notEqual(M.shelfReturn({ source: 'share' }), M.shelfReturn({ source: 'server' }));
  assert.notEqual(M.shelfReturn({ embedded: false }), M.shelfReturn({ embedded: true }));
});

test('17. 책장 돌아가기 배선: 윗줄 왼쪽 버튼·기존 셸 이동·공유 숨김, 빈 타이포 잔여 없음', () => {
  assert.ok(HTML.includes('id="shelfBackBtn"'), '버튼이 있다');
  assert.ok(HTML.includes('class="ui-btn shelf-back"'), '같은 ui-btn 모양을 쓴다');
  assert.match(BOOK, /LT59Model\.shelfReturn\(\{source:parent\.LT41\?\.source,embedded:parent!==window\}\)/, '판정 한 벌을 쓴다');
  assert.ok(BOOK.includes("postMessage({type:'lt41-navigate',view:'track32-bookshelf.html'}"), '기존 셸 이동 채널을 재사용한다');
  assert.match(BOOK, /shelfBack\.hidden=true/, '돌아갈 수 없으면 숨긴다');
  assert.match(BOOK_CSS, /\.shelf-back\{[^}]*min-height:44px/, '44px 이상');
  assert.match(BOOK_CSS, /html\[data-lt-theme=garden\] \.shelf-back\{[^}]*var\(--lt-/, '정원 토큰을 쓴다');
  assert.ok(!HTML.includes('typoNote') && !HTML.includes('typo-note'), '빈 타이포 알약이 없다');
  assert.ok(!/typo-b|typo-note/.test(BOOK), '타이포 장치가 없다');
  assert.ok(!/typo-b|typo-note/.test(BOOK_CSS), '타이포 CSS가 없다');
  const SRC_CSS = fs.readFileSync(new URL('../src/views/book-source.css', import.meta.url), 'utf8');
  assert.ok(!/typo-b|typo-note/.test(SRC_CSS), 'src 쪽도 없다');
});
