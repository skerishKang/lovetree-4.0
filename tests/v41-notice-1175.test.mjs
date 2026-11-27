import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocation } from '../public/v41/shell/location.mjs';
import { createMemberRuntime } from '../public/v41/shell/member-runtime.mjs';
// #1175 알림 정리 — 운영 버그 세 가지를 글자와 동작으로 고정한다.
// ① 공유 화면을 본 뒤 서재 단추는 로그인 안내만(share 잔여가 화면 이동을 share 주소로 되돌리지 않게)
// ② 알림이 책의 페이지 넘김 단추를 덮지 않게(책 화면 표식 복원)
// ③ 창이 열려 있어도 알림이 로고·상단 메뉴를 덮지 않게, 로그아웃 진입 알림은 띄우지 않게
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bookHtml = read('public/v41/views/track59-sketchbook.html');
const shellCss = read('public/v41/shell.css');
const memberRuntime = read('public/v41/shell/member-runtime.mjs');
const navigationRuntime = read('public/v41/shell/navigation-runtime.mjs');

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
  assert.match(memberRuntime, /status\.phase\s*===\s*'login'\s*&&\s*!\s*status\.dirty\s*&&\s*document\.body\.dataset\.member\s*===\s*'in'\s*\)\s*\(\s*0\s*,\s*ctx\.notify\s*\)\s*\(\s*'로그인이 풀렸어요\. 다시 로그인해 주세요\.'/);
});

test('#1541 저장 충돌의 덮어쓰기·불러오기는 앱 확인 창의 취소·확인을 따른다', async () => {
  const saved = {document: globalThis.document, window: globalThis.window, LT41Confirm: globalThis.LT41Confirm};
  const element = extra => ({
    hidden: false, textContent: '', children: [], dataset: {}, attrs: {},
    classList: {toggle() {}}, replaceChildren(...nodes) { this.children = nodes; },
    append(...nodes) { this.children.push(...nodes); }, setAttribute(name, value) { this.attrs[name] = String(value); },
    ...extra
  });
  const find = (node, text) => node.textContent === text ? node : (node.children || []).map(child => find(child, text)).find(Boolean);
  try {
    for (const answer of [false, true]) {
      const actions = [], elements = new Map();
      const member = {snapshot: () => ({owned: true, dirty: true}), act: name => actions.push(name)};
      const ctx = {
        member, model: {trees: []}, current: 'src064-orbit.html', source: 'server', previousDirty: false,
        shellIntake: {flush() {}}, backup() {}, renderAccount() {}, flowNavigation() {}, applyAdvanced() {},
        $: id => { if (!elements.has(id)) elements.set(id, element({id})); return elements.get(id); }
      };
      globalThis.document = {body: element({dataset: {}}), createElement: () => element()};
      globalThis.window = {LT41: null};
      const runtime = createMemberRuntime(ctx);
      for (const [phase, action, label] of [['conflict', 'force', '이 화면 것으로 덮어쓰기'], ['offline', 'pull', '서버 기록 불러오기']]) {
        globalThis.LT41Confirm = {ask: async () => answer};
        const before = actions.length;
        runtime.memberStatus({dirty: true, phase, detail: '', actions: [{name: action, label}]});
        const button = find(ctx.$('save-actions'), label);
        assert.ok(button);
        await button.onclick();
        assert.equal(actions.length - before, answer ? 1 : 0);
      }
    }
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.LT41Confirm = saved.LT41Confirm;
  }
});

test('#1175 ① 공유에서 첫 화면으로 나갈 때 감상 알림을 지우고 방문자 기록으로 돌아간다', async () => {
  const events=[];
  const ctx={
    member:null, loadGeneration:0,
    hideToast:()=>events.push('toast'),
    pauseMember:()=>true,
    loadExampleTree:async()=>({id:'fixture-tree'}),
    load:(_data,kind,_selection,_fallback,tree)=>events.push(['load',kind,tree.id]),
    writeLocation:()=>events.push('location'),
    $:id=>id==='account-settings'?{open:false}:{hidden:false}
  };
  createMemberRuntime(ctx);
  ctx.leaveShare('src064-orbit.html');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(events[0],'toast','이전 공유 알림은 가장 먼저 거둔다');
  assert.deepEqual(events[1],['load','example','fixture-tree'],'공유 자료를 다시 쓰지 않는다');
  assert.equal(ctx.current,'src064-orbit.html','로고는 방문자의 첫 화면을 연다');
  assert.equal(ctx.loadGeneration,1,'공유 읽기 작업의 잔여 세대는 폐기한다');
  assert.deepEqual(events[2],'location');
  assert.match(navigationRuntime,/ctx\.leaveShare/,'로고 길은 공유 이탈 처리를 거친다');
});
