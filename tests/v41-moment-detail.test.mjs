// #394 1·3번: 순간 상세 창 — 열기 전 목록 순서 그대로 앞·뒤 이동, 자동 기본 문구 숨김.
// 궤도 화면은 DOM 시험이 어려우므로(vite 그림자 루트) 소스 계약으로 고정하고,
// 제목 규칙 계산은 v41/moment-list.js의 순수 시험(v41-moment-list)이 함께 보증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ORBIT = read('src/views/orbit.js');

test('상세 창에 앞·뒤 화살표가 있고 순서는 열기 전 목록 순서(listRows)를 그대로 쓴다', () => {
  assert.match(ORBIT, /data-do="prev"/);
  assert.match(ORBIT, /data-do="next"/);
  assert.match(ORBIT, /aria-label="이전 순간"/);
  assert.match(ORBIT, /aria-label="다음 순간"/);
  assert.match(ORBIT, /const order=listRows\(\),at=order\.findIndex\(x=>x\.key===c\.key\),hasNav=at>=0&&order\.length>1/);
  assert.match(ORBIT, /function stepDetail\(dir\)\{const order=listRows\(\);const at=order\.findIndex\(x=>x\.key===detailMoment\?\.key\);const next=order\[at\+dir\];if\(!next\)return;renderDetail\(next\)/);
});

test('끝에서는 화살표가 흐려지고 "처음/마지막 순간"을 알린다', () => {
  assert.match(ORBIT, /const atStart=hasNav&&at===0,atEnd=hasNav&&at===order\.length-1/);
  assert.match(ORBIT, /\$\{atStart\?' disabled':''\}/);
  assert.match(ORBIT, /\$\{atEnd\?' disabled':''\}/);
  assert.match(ORBIT, /처음 순간/);
  assert.match(ORBIT, /마지막 순간/);
  assert.match(ORBIT, /detail-nav:disabled/);
});

test('키보드 화살표와 모바일 옆으로 밀기도 앞·뒤로 옮긴다', () => {
  assert.match(ORBIT, /e\.key==='ArrowLeft'/);
  assert.match(ORBIT, /e\.key==='ArrowRight'/);
  assert.match(ORBIT, /touchstart'.*?passive:true/s);
  assert.match(ORBIT, /Math\.abs\(dx\)>48&&Math\.abs\(dx\)>Math\.abs\(dy\)\*1\.5/);
  assert.match(ORBIT, /stepDetail\(dx<0\?1:-1\)/);
});

test('상세 창 제목은 자동 기본 문구를 표시하지 않는다(정리 화면과 같은 규칙)', () => {
  // 큰 제목은 momentHeadTitle 한 벌로 정한다 — mainOf(자동 문구 대체)를 상세 창에 쓰지 않는다.
  assert.match(ORBIT, /const head=momentHeadTitle\(c,titleMode\);/);
  assert.match(ORBIT, /\$\{head\.main\?`<h2>\$\{esc\(head\.main\)\}<\/h2>`:''\}/);
  // 마음 한마디가 큰 글씨가 되면 아래 메모 단락과 같은 글자를 두 번 보여 주지 않는다.
  assert.match(ORBIT, /\$\{head\.memoAsMain\?'':`<p>\$\{esc\(c\.note\)\}<\/p>`\}/);
  // 상세 창 안에서는 자동 문구 대체가 없어야 한다(head가 빈 제목이면 비워 둔다).
  const detail = ORBIT.slice(ORBIT.indexOf('function renderDetail'), ORBIT.indexOf('function index()'));
  assert.doesNotMatch(detail, /<h2>\$\{esc\(mainOf/);
});

test('상세 창의 작은 영상 제목 줄도 한 벌(head.sub)에서 온다', () => {
  const detail = ORBIT.slice(ORBIT.indexOf('function renderDetail'), ORBIT.indexOf('function index()'));
  assert.match(detail, /head\.sub\?`<span class="videoTitle">/);
  assert.doesNotMatch(detail, /\$\{subMarkup\(c\)\}/);
});
