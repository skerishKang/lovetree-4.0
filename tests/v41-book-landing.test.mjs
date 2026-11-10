// #379 후속: 펼침면 오른쪽 페이지의 순간을 열면, 책 선택(선택 위치/주소)이 왼쪽 페이지 순간으로 돌아가는 결함.
// 원인: book-extra의 재그림(제목 보기 변경·모듈 로딩)이 renderSpread(current,false)로 focusId를 빼고
// land=true를 남겨 book.js가 SPREADS[current].left.id를 다시 선택하게 했다(오른쪽 순간 m2→m1, m4→m3, m6→m5).
// 수정: 재그림은 현재 선택 순간(LTDEMO.get())을 focusId로 유지해 선택이 왼쪽 페이지로 밀리지 않게 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const BOOK = read('public/v41/views/book/book.js');
const EXTRA = read('public/v41/views/book/book-extra.js');

test('원인: renderSpread는 land·focusId가 참이면 선택을 재설정하고, focusId 없으면 왼쪽 페이지를 선택한다', () => {
  assert.match(BOOK, /if\(land\|\|focusId\)LTDEMO\.select\(focusId\|\|SPREADS\[/);
  assert.match(BOOK, /\.left\.id\)/, 'focusId 없으면 펼침면 left.id로 재선택(결함의 핵심)');
  assert.match(BOOK, /function renderSpread\(idx,focusId=null,land=true\)/, 'land 기본 true');
});

test('수정: book-extra의 재그림(제목 보기 변경·모듈 로딩)은 현재 선택 순간을 focusId로 유지한다', () => {
  // 289줄(이미 LTDEMO.get(),false를 쓰는 정상 줄)과 구분: 모듈 로딩 재그림은 try{...}catch{} 한 줄
  assert.match(EXTRA, /^try\{renderSpread\(current,LTDEMO\.get\(\),false\)\}catch\{\}/m, '모듈 로딩 재그림이 LTDEMO.get()을 focusId로 유지한다');
  // 제목 보기 변경 핸들러: type 가드와 같은 줄에 LTDEMO.get()을 focusId로, land=false
  assert.match(EXTRA, /type!=='lt41-title-display'\)return;[\s\S]*?renderSpread\(current,LTDEMO\.get\(\),false\)/, '제목 보기 변경 재그림도 LTDEMO.get()을 focusId로 유지한다');
  // 결함의 재현: 두 지점 모두 renderSpread(current,false)가 되어서는 안 된다
  const clobber = (EXTRA.match(/renderSpread\(current,false\)/g) || []).length;
  assert.equal(clobber, 0, '선택을 왼쪽 페이지로 덮는 renderSpread(current,false)가 남아 있으면 안 된다');
});

// 가짜 기억책: 6 순간 → 3 펼침면 [m1,m2] [m3,m4] [m5,m6]. book.js renderSpread의 선택 재설정 규칙만 흉내 낸다.
function fakeBook() {
  const moments = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map(id => ({ id }));
  const SPREADS = [
    { left: { id: 'm1' }, right: { id: 'm2' } },
    { left: { id: 'm3' }, right: { id: 'm4' } },
    { left: { id: 'm5' }, right: { id: 'm6' } }
  ];
  const state = { momentId: '' };
  const selected = [];
  const LTDEMO = {
    moments,
    prefs: { titleDisplay: 'both' },
    get: () => state.momentId,
    select: id => { if (moments.some(m => m.id === id)) { state.momentId = id; selected.push(id); } }
  };
  function renderSpread(idx, focusId = null, land = true) {
    if (land || focusId) LTDEMO.select(focusId || SPREADS[Math.max(0, Math.min(SPREADS.length - 1, idx))].left.id);
  }
  const detail = { classList: { contains: () => false } };
  return {
    state, selected, LTDEMO, renderSpread,
    $b: () => detail,
    selectedMomentId: null,
    showDetail: () => {}
  };
}

// book-extra.js의 실제 재그림 한 줄을 시험에서 그대로 실행해, 수정을 빼면 실패하게 만든다(연결 강도).
function runModuleRerender(b) {
  const line = EXTRA.split('\n').find(l => /^try\{renderSpread\(current,/.test(l.trim()));
  assert.ok(line, '모듈 로딩 재그림 줄이 있다');
  const run = new Function('renderSpread', 'LTDEMO', 'current', line);
  run(b.renderSpread, b.LTDEMO, 0);
}
function runTitleDisplayChange(b, value) {
  const line = EXTRA.split('\n').find(l => l.includes("type!=='lt41-title-display'"));
  assert.ok(line, '제목 보기 변경 핸들러 줄이 있다');
  const listeners = [];
  const run = new Function('addEventListener', 'LTDEMO', 'renderSpread', 'current', '$b', 'selectedMomentId', 'showDetail', line);
  run((t, fn) => listeners.push(fn), b.LTDEMO, b.renderSpread, 0, b.$b, b.selectedMomentId, b.showDetail);
  assert.equal(listeners.length, 1, 'message 리스너 한 개를 등록한다');
  listeners[0]({ data: { type: 'lt41-title-display', value } });
}

test('기능: 오른쪽 페이지 순간(m2)으로 열면 모듈 로딩 재그림 뒤에도 선택이 m2로 유지된다', () => {
  const b = fakeBook();
  b.LTDEMO.select('m2'); // 사용자가 펼침면 0 오른쪽 페이지 순간을 열음(book.js 초기 렌더)
  runModuleRerender(b);
  assert.equal(b.state.momentId, 'm2', '재그림이 오른쪽 페이지 선택을 왼쪽(m1)으로 밀지 않는다');
  assert.equal(b.LTDEMO.prefs.titleDisplay, 'both', '재그림은 제목 보기만 다시 그릴 뿐');
});

test('기능: 오른쪽 페이지 순간(m4)으로 열고, 제목 보기를 바꾸면 뒤에도 선택이 m4로 유지된다', () => {
  const b = fakeBook();
  b.LTDEMO.select('m4'); // 펼침면 1 오른쪽 페이지
  runTitleDisplayChange(b, 'video');
  assert.equal(b.state.momentId, 'm4', '제목 보기 변경 재그림이 선택을 왼쪽(m3)으로 밀지 않는다');
  assert.equal(b.LTDEMO.prefs.titleDisplay, 'video', '제목 보기 값은 바뀐다');
});

test('기능: 왼쪽 페이지 순간(m1)으로 열면 그대로 유지된다(회귀 감시)', () => {
  const b = fakeBook();
  b.LTDEMO.select('m1');
  runModuleRerender(b);
  runTitleDisplayChange(b, 'mine');
  assert.equal(b.state.momentId, 'm1', '왼쪽 페이지 순간은 원래대로 유지된다');
});

test('강도: 결함의 재현 — focusId 없이 land=true 재그림이면 오른쪽 선택이 왼쪽으로 밀린다', () => {
  const b = fakeBook();
  b.LTDEMO.select('m2');
  b.renderSpread(0, null, true); // 수정 전 코드(renderSpread(current,false))와 같은 경로
  assert.equal(b.state.momentId, 'm1', 'focusId 없는 재그림이 m2를 m1로 덮어썼다(이것이 결함)');
});
