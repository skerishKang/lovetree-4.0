import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocation } from '../public/v41/shell/location.mjs';
// #1175 알림 정리 — 운영 버그 세 가지를 글자와 동작으로 고정한다.
// ① 공유 화면을 본 뒤 서재 단추는 로그인 안내만(share 잔여가 화면 이동을 share 주소로 되돌리지 않게)
// ② 알림이 책의 페이지 넘김 단추를 덮지 않게(책 화면 표식 복원)
// ③ 창이 열려 있어도 알림이 로고·상단 메뉴를 덮지 않게, 로그아웃 진입 알림은 띄우지 않게
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bookHtml = read('public/v41/views/track59-sketchbook.html');
const shellCss = read('public/v41/shell.css');
const shell = read('public/v41/shell.mjs');

function setup({ hash = '#home', handled = '', source = 'example', owned = false, shareId = null, current = 'src064-orbit.html' } = {}) {
  const calls = [];
  const historyCalls = [];
  const storage = {data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); }};
  globalThis.location = {hash};
  globalThis.history = {
    state: null,
    pushState(state, title, url) { historyCalls.push(['push', url]); globalThis.location.hash = url; },
    replaceState(state, title, url) { historyCalls.push(['replace', url]); globalThis.location.hash = url; },
  };
  globalThis.localStorage = storage;
  globalThis.addEventListener = () => {};
  globalThis.window = {LT41: owned ? {tree: {id: 't1'}, momentId: 'm1'} : null};
  const api = createLocation({
    $: () => null,
    getCurrent: () => current,
    setCurrent: file => { calls.push(['current', file]); },
    getMember: () => (owned ? {snapshot: () => ({owned: true, subject: 'me'})} : null),
    getSource: () => source,
    getModel: () => ({trees: []}),
    getActiveShareId: () => shareId,
    getHandled: () => handled,
    setHandled: () => {},
    show: (file, write) => calls.push(['show', file, write]),
    choose: () => calls.push(['choose']),
    notify: text => calls.push(['notify', text]),
    startMember: () => calls.push(['startMember']),
    showPublicRoute: route => calls.push(['public', route.shareId]),
    leaveShare: view => calls.push(['leaveShare', view]),
    journey: {saved: () => false},
    gotoJourneyStep: () => calls.push(['goto']),
    openFirstJourney: () => calls.push(['openJourney']),
    finishJourney: () => calls.push(['finish']),
    leaveJourney: () => calls.push(['leave']),
  });
  return {api, calls, historyCalls};
}

test('#1175 ① 공유 화면 밖의 첫 화면 주소는 share 주소로 덮지 않는다', () => {
  // 공유 잔여(source·공유 아이디)가 남은 채 첫 화면을 쓰면 #share/<id>/home 같은 없는 경로가 만들어져
  // '감상' 안내가 되풀이됐다. 오염된 share 주소도 첫 화면 주소(#home)로 바로 고쳐 쓴다.
  const {api, historyCalls} = setup({hash: '#share/sh_1/home', source: 'share', shareId: 'sh_1', current: 'src064-orbit.html'});
  api.writeLocation();
  assert.deepEqual(historyCalls, [['push', '#home']]);
});

test('#1175 ① 공유에서 보는 화면(책·보드·지도) 주소는 예전처럼 share 주소를 쓴다', () => {
  const {api, historyCalls} = setup({source: 'share', shareId: 'sh_1', current: 'track58-pinboard.html'});
  api.writeLocation('replace');
  assert.deepEqual(historyCalls, [['replace', '#share/sh_1/board']]);
});

test('#1175 ① 뒤로 가기·주소로 공유 밖 화면에 돌아오면 share 잔여를 치운다', () => {
  // share 상태가 남으면 탭 줄이 숨어 서재 단추에 닿지 못하고, 화면을 옮길 때마다 '감상' 안내가 되풀이된다.
  const {api, calls} = setup({hash: '#home', source: 'share', shareId: 'sh_1', current: 'track59-sketchbook.html'});
  api.applyBrowserLocation();
  assert.deepEqual(calls, [['leaveShare', 'src064-orbit.html']], 'share 잔여를 치우고 첫 화면 파일로 돌려 보낸다');
  assert.equal(calls.some(c => c[0] === 'public'), false, '공유 경로로 다시 들어가지 않는다');
});

test('#1175 ① 내 기록 주소(owner)로 돌아올 때는 기존 로그인 이어 주기를 그대로 탄다', () => {
  const {api, calls} = setup({hash: '#my/book', source: 'share', shareId: 'sh_1', current: 'track59-sketchbook.html'});
  api.applyBrowserLocation();
  assert.equal(calls.some(c => c[0] === 'leaveShare'), false, 'owner 주소는 share 잔여 치움을 타지 않는다');
  assert.deepEqual(calls[0], ['current', 'track59-sketchbook.html']);
});

test('#1175 ② 책 화면의 아래쪽 묶음에는 알림 피하기 표식이 있다(페이지 알약·연결 이유·갈림길 탭)', () => {
  // #778에서 표식이 의도치 않게 빠져 1440에서 알림이 페이지 넘김 단추를 덮었다.
  assert.match(bookHtml, /<div class="nav-pill" data-lt-keep-clear>/, '페이지 넘김 알약');
  assert.match(bookHtml, /<div class="why-margin" id="whyMargin" data-lt-keep-clear>/, '연결 이유 안내');
  assert.match(bookHtml, /<button class="branch-tab" id="branchTab" hidden data-lt-keep-clear>/, '갈림길 탭');
});

test('#1175 ③ 창이 열려 있어도 알림은 머리글 아래에 둔다 — 로고·상단 메뉴를 덮지 않는다', () => {
  // 예전에는 창이 열리면 알림이 화면 맨 위(8px)로 옮겨져 왼쪽 위 로고를 덮었다.
  assert.match(shellCss, /body:has\(dialog\[open\]\) #toast\{top:calc\(68px \+ env\(safe-area-inset-top\)\)/, '머리글 바로 아래 띠');
  assert.doesNotMatch(shellCss, /body:has\(dialog\[open\]\) #toast\{top:calc\(8px/, '로고를 덮던 옛 자리는 뺐다');
  assert.match(shellCss, /@media\(max-width:780px\)\{body:has\(dialog\[open\]\) #toast\{top:calc\(62px \+ env\(safe-area-inset-top\)\)\}\}/, '낮은 머리글 폭에서도 머리글 아래');
});

test('#1175 ③ 로그아웃 상태 시작의 저장 연결 확인(401)은 진입 알림을 띄우지 않는다', () => {
  // 로그인한 상태에서 세션이 만료된 뒤에만('in' 표시가 있을 때) 알림을 띄운다.
  assert.match(shell, /status\.phase==='login'&&!status\.dirty&&document\.body\.dataset\.member==='in'\)notify\('로그인이 필요해요\.'/);
});

test('#1175 ① share 잔여를 치우는 길은 남은 감상 안내도 함께 거둔다', () => {
  assert.match(shell, /function leaveShare\(view\)\{hideToast\(\);void sample\(\{\},view\);\}/, '토스트를 거두고 예시 기록을 다시 싣는다');
  assert.match(shell, /if\(file==='src064-orbit\.html'&&source==='share'\)\{leaveShare\(file\);return true;\}/, '로고 길에서 share 잔여를 치운다');
});
