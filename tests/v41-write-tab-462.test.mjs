// #462 순간 추가 창: 기본 탭은 설정에서만 바뀐다 · 탭을 오가도 입력 유지 · ＋는 늘 새 순간 · 키보드 · 끌어다 놓기 안내.
// 셸(shell.mjs)이 엮는 순서 그대로 실제 모듈 셋(write-panel·panels·quick-add)을 가짜 DOM에 띄워 흐름으로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
// 이름공간으로 가져온다 — 예전 코드(viewportBox 없음)로 되돌려도 시험마다 따로 빨강이 되게.
import * as writePanelModule from '../public/v41/shell/write-panel.mjs';
import {createPanels} from '../public/v41/shell/panels.mjs';
import {createQuickAdd} from '../public/v41/shell/quick-add.mjs';
import {fakeEl, fakeRadioGroup} from './helpers/fake-dom.mjs';

const TREE = {id: 'tree-1', title: '리센느', moments: [
  {id: 'm1', title: '첫 순간', note: '', emotion: '설렘', date: '2026-11-01', url: '', relation: '', parentId: null},
  {id: 'm2', title: '두 번째', note: '기억', emotion: '위로', date: '2026-11-02', url: '', relation: 'next', parentId: 'm1'}
]};
const URL_OK = 'https://www.youtube.com/watch?v=abc12345678';
const {createWritePanel, readWriteTab, writeWriteTab, WRITE_TAB_KEY} = writePanelModule;
const viewportBox = (...args) => {
  assert.equal(typeof writePanelModule.viewportBox, 'function', 'viewportBox가 있다');
  return writePanelModule.viewportBox(...args);
};

class FakeFormData {
  constructor(form) { this.form = form; }
  * [Symbol.iterator]() { for (const [name, control] of Object.entries(this.form.elements || {})) yield [name, String(control?.value ?? '')]; }
}

function fakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  const writes = [];
  return {writes, getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { writes.push([key, String(value)]); store.set(key, String(value)); }};
}

function fakeViewport(height = 844) {
  const listeners = {};
  return {height, offsetTop: 0, listeners, addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }, fire(type) { for (const fn of listeners[type] || []) fn(); }};
}

// 셸과 같은 배선: createWritePanel → createPanels(writePanel) → setTabHook → createQuickAdd(resetEditorBaseline).
function shell({storage = fakeStorage(), finePointer = true, viewport = null} = {}) {
  const calls = {apply: [], notify: [], login: []};
  const els = {};
  const $ = id => (els[id] ||= fakeEl({value: '', children: [], style: fakeStyle(), replaceChildren() { this.children = []; }, append(...kids) { this.children.push(...kids); }}));
  function fakeStyle() { const vars = {}; return {vars, setProperty(name, value) { vars[name] = value; }}; }
  const dialog = $('write-panel');
  dialog.open = false;
  dialog.close = () => { dialog.open = false; };
  const form = fakeEl({elements: {}});
  for (const name of ['title', 'note', 'url', 'emotion', 'date', 'relation']) form.elements[name] = fakeEl({value: ''});
  form.reset = () => { for (const control of Object.values(form.elements)) control.value = ''; };
  els['moment-form'] = form;
  // 마크업 기본값(index.html): 수정 전용 묶음은 숨긴 채 시작한다.
  $('moment-management').hidden = true;
  $('parent-management').hidden = true;
  const coverParts = {'[data-media-file]': fakeEl(), '[data-upload-status]': fakeEl(), '[data-stop]': fakeEl()};
  const coverSlot = fakeEl({innerHTML: ''});
  coverSlot.querySelector = sel => coverParts[sel] || null;
  els['tree-form'] = fakeEl({elements: {title: fakeEl({value: ''}), subject: fakeEl({value: ''}), coverMode: fakeRadioGroup(['basic', 'moment', 'design', 'photo']), coverDesign: fakeRadioGroup(['', 'texture-1'])}});
  els['tree-form'].querySelector = sel => (sel === '[data-media-slot]' ? coverSlot : null);

  const saved = {window: globalThis.window, LT41: globalThis.LT41, LTMedia: globalThis.LTMedia, FormData: globalThis.FormData, confirm: globalThis.confirm, document: globalThis.document, queueMicrotask: globalThis.queueMicrotask};
  globalThis.window = globalThis;
  globalThis.LT41 = {tree: TREE, momentId: 'm1'};
  globalThis.LTMedia = {
    describe: url => {
      const value = String(url ?? '');
      const yt = value.match(/youtube\.com\/watch\?v=([\w-]+)/);
      if (yt) return {kind: 'youtube', videoId: yt[1], label: 'YouTube 영상', openUrl: value, loadUrl: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`};
      try { const u = new URL(value); return {kind: 'link', label: u.hostname, openUrl: u.href}; } catch { return {kind: value ? 'invalid' : 'none', openUrl: ''}; }
    },
    markup: () => ''
  };
  globalThis.FormData = FakeFormData;
  globalThis.confirm = () => true;
  globalThis.queueMicrotask = fn => fn();
  globalThis.document = {querySelectorAll: () => [], addEventListener() {}, createElement: tag => fakeEl({tagName: tag, value: '', children: [], append(...kids) { this.children.push(...kids); }})};

  const member = {snapshot: () => ({owned: true, writable: true, subject: 's1'}), apply: (mode, payload, sel) => { calls.apply.push({mode, payload, sel}); return {treeId: 'tree-1', momentId: 'm9'}; }, state: () => null};
  const write = createWritePanel({$, storage, visualViewport: viewport});
  const panels = createPanels({$, getMember: () => member, getCurrent: () => 'track59-sketchbook.html', getSource: () => 'server', getUploads: () => ({busy: false, reset() {}}), notify: text => calls.notify.push(text), panel: id => $(id).showModal(), openSettingsData() {}, requestClose: id => { $(id).close(); return true; }, show() {}, selection: () => ({treeId: 'tree-1', momentId: globalThis.LT41.momentId}), openFirstJourney() {}, openLoginStart: intent => calls.login.push(intent), writePanel: write});
  write.setTabHook(tab => panels.onWriteTab(tab));
  const quick = createQuickAdd({$, document: globalThis.document, getMember: () => member, getSource: () => 'server', getCurrent: () => 'track59-sketchbook.html', notify: text => calls.notify.push(text), panel: id => $(id).showModal(), openSettingsData() {}, choose() {}, openEditor: (mode, parentId) => panels.openEditor(mode, parentId), resumeMember() {}, resetEditorBaseline: () => panels.startQuickSession(), openLoginStart: intent => calls.login.push(intent), writePanel: write, requestClose: id => { $(id).close(); return true; }, isFinePointer: () => finePointer, fetchImpl: async () => ({ok: false})});
  const restore = () => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } };
  const shown = () => (els['write-easy'].hidden ? 'detailed' : 'easy');
  const submitDetailed = () => els['moment-form'].onsubmit({preventDefault() {}, target: form});
  return {els, $, calls, storage, write, panels, quick, form, dialog, shown, submitDetailed, restore};
}

test('#462 탭만 눌렀다 닫으면 다음에 열 때 기본 탭 그대로다(눌러 본 탭을 기억하지 않는다)', () => {
  for (const setting of [null, 'detailed']) {
    const expected = setting || 'easy';
    const other = expected === 'easy' ? 'detailed' : 'easy';
    const h = shell({storage: fakeStorage(setting ? {[WRITE_TAB_KEY]: setting} : {})});
    try {
      h.quick.openWrite();
      assert.equal(h.shown(), expected, `설정 ${setting}: 처음 열면 설정값 탭`);
      h.els[`write-tab-${other}`].onclick();
      assert.equal(h.shown(), other, '누른 탭은 이번 열림에 바로 보인다');
      // 탭 줄 키보드(→·Home·End)로 옮겨 봐도 마찬가지다.
      h.els['write-tabs'].listeners.keydown.forEach(fn => fn({key: 'End', preventDefault() {}}));
      h.els['write-tabs'].listeners.keydown.forEach(fn => fn({key: 'ArrowLeft', preventDefault() {}}));
      h.els[`write-tab-${other}`].onclick();
      h.dialog.close();
      assert.deepEqual(h.storage.writes, [], '탭을 눌러도 lt41.writeTab을 쓰지 않는다');
      h.quick.openWrite();
      assert.equal(h.shown(), expected, '다시 열면 설정값 탭 그대로');
    } finally { h.restore(); }
  }
});

test('#462 저장까지 해도 기본 탭은 그대로다(자세한 추가 저장·쉬운 추가 담기 모두)', () => {
  const h = shell();
  try {
    h.quick.openWrite();
    h.els['write-tab-detailed'].onclick();
    h.form.elements.note.value = '오늘 무대 마음';
    h.submitDetailed();
    assert.equal(h.calls.apply.at(-1).mode, 'add', '자세한 추가로 저장했다');
    assert.equal(h.dialog.open, false, '저장하면 창이 닫힌다');
    h.quick.openWrite();
    assert.equal(h.shown(), 'easy', '자세한 추가로 저장한 뒤에도 기본 탭(쉬운 추가) 그대로');

    h.els['quick-url'].value = URL_OK;
    h.quick.submitQuick({preventDefault() {}});
    assert.equal(h.calls.apply.at(-1).mode, 'quickAdd', '쉬운 추가로 담았다');
    h.dialog.close();
    h.quick.openWrite();
    assert.equal(h.shown(), 'easy');
    assert.deepEqual(h.storage.writes, [], '저장해도 lt41.writeTab을 쓰지 않는다');
    assert.equal(readWriteTab(h.storage), 'easy');
  } finally { h.restore(); }

  const set = shell({storage: fakeStorage({[WRITE_TAB_KEY]: 'detailed'})});
  try {
    set.quick.openWrite();
    set.els['write-tab-easy'].onclick();
    set.els['quick-url'].value = URL_OK;
    set.quick.submitQuick({preventDefault() {}});
    set.dialog.close();
    set.quick.openWrite();
    assert.equal(set.shown(), 'detailed', '설정이 자세한 추가면 쉬운 추가로 담은 뒤에도 자세한 추가로 연다');
    assert.deepEqual(set.storage.writes, []);
  } finally { set.restore(); }
});

test('#462 설정 "먼저 보일 탭"에서 바꾸면 다음에 열 때 그 탭이다', () => {
  const h = shell();
  try {
    h.quick.openWrite();
    assert.equal(h.shown(), 'easy');
    h.dialog.close();
    // 설정 행(shell.mjs의 data-write-tab 단추)이 부르는 것과 같은 함수다.
    writeWriteTab(h.storage, 'detailed');
    h.quick.openWrite();
    assert.equal(h.shown(), 'detailed', '설정을 바꾸면 그 탭으로 연다');
    h.dialog.close();
    writeWriteTab(h.storage, 'easy');
    h.quick.openWrite();
    assert.equal(h.shown(), 'easy', '되돌리면 다시 쉬운 추가');
  } finally { h.restore(); }

  // 기본 탭을 쓰는 곳은 설정 행 하나뿐이다(눌러 보기·저장 경로가 다시 쓰지 않게 고정).
  const shellSource = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  assert.match(shellSource, /for\(const b of document\.querySelectorAll\('\[data-write-tab\]'\)\)b\.onclick=\(\)=>\{\s*const tab=writeWriteTab\(localStorage,b\.dataset\.writeTab\);/, '설정 행이 writeWriteTab을 부른다');
  const writers = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(url);
      else if (/\.(m?js|html)$/.test(entry.name)) {
        const text = readFileSync(url, 'utf8');
        const count = (text.match(/writeWriteTab\(/g) || []).length - (text.match(/export function writeWriteTab\(/g) || []).length;
        if (count) writers.push([url.pathname.split('/public/v41/')[1], count]);
        if (/setItem\(\s*['"]lt41\.writeTab/.test(text)) writers.push([url.pathname.split('/public/v41/')[1], 'setItem']);
      }
    }
  };
  walk(new URL('../public/v41/', import.meta.url));
  assert.deepEqual(writers, [['shell.mjs', 1]], '기본 탭을 저장하는 곳은 설정 행 한 곳');
});

test('#462 탭을 오가도 적어 둔 입력은 그대로이고, 쓴 뒤 닫으면 한 번 묻는 판정도 그대로다', () => {
  const h = shell();
  try {
    h.quick.openWrite();
    h.els['quick-url'].value = URL_OK;
    h.els['write-tab-detailed'].onclick();
    assert.equal(h.panels.detailedDirty(), false, '자세한 추가를 보기만 하면 더러움 아님(#453 B)');
    h.form.elements.note.value = '쓰다 만 마음';
    h.els['write-tab-easy'].onclick();
    assert.equal(h.els['quick-url'].value, URL_OK, '쉬운 추가 주소 유지');
    h.els['write-tab-detailed'].onclick();
    assert.equal(h.form.elements.note.value, '쓰다 만 마음', '자세한 추가 마음 유지');
    assert.equal(h.panels.detailedDirty(), true, '쓴 뒤에는 닫을 때 묻는다');
  } finally { h.restore(); }
});

test('#462 ＋ 순간 추가는 늘 새 순간이다 — 직전에 연 "이 순간 수정" 상태로 저장하지 않는다', () => {
  const h = shell();
  try {
    globalThis.LT41.momentId = 'm2';
    h.panels.openEditor('edit');
    assert.equal(h.els['write-panel-title'].textContent, '순간 수정');
    assert.equal(h.els['moment-management'].hidden, false, '수정에는 수정 전용 묶음이 있다');
    h.dialog.close();

    h.quick.openWrite();
    assert.equal(h.els['write-panel-title'].textContent, '순간 추가', '제목은 순간 추가');
    assert.equal(h.els['moment-management'].hidden, true, '수정 전용 묶음(이전 순간 변경·삭제)은 숨는다');
    h.els['write-tab-detailed'].onclick();
    assert.equal(h.form.elements.note.value, '', '수정하던 순간의 마음이 남지 않는다');
    assert.equal(h.form.elements.title.value, '', '수정하던 순간의 제목이 남지 않는다');
    assert.equal(h.panels.detailedDirty(), false, '열기만 하면 더러움 아님');
    h.form.elements.note.value = '새 마음';
    h.submitDetailed();
    assert.equal(h.calls.apply.at(-1).mode, 'add', '수정이 아니라 새 순간으로 저장한다');
  } finally { h.restore(); }
});

test('#462 키보드: 보이는 화면 높이·위치를 창에 넘긴다(모바일 CSS가 쓴다)', () => {
  assert.equal(viewportBox(null), null);
  assert.equal(viewportBox({height: 0}), null);
  assert.deepEqual(viewportBox({height: 507.6, offsetTop: -3}), {top: 0, height: 508});
  assert.deepEqual(viewportBox({height: 480, offsetTop: 41.2}), {top: 41, height: 480});
  const viewport = fakeViewport(844);
  const h = shell({viewport});
  try {
    const vars = h.dialog.style.vars;
    assert.equal(vars['--lt-vv-h'], '844px', '처음에는 화면 전체');
    viewport.height = 508;
    viewport.fire('resize');
    assert.equal(vars['--lt-vv-h'], '508px', '키보드가 올라오면 보이는 높이로 줄어든다');
    viewport.offsetTop = 30;
    viewport.fire('scroll');
    assert.equal(vars['--lt-vv-top'], '30px', '보이는 화면이 밀리면 창도 따라간다');
  } finally { h.restore(); }
  const css = readFileSync(new URL('../public/v41/shell.css', import.meta.url), 'utf8');
  const mobile = css.slice(css.indexOf('@media(max-width:780px){\n /* 이슈 462'));
  assert.match(mobile, /#write-panel\{inset:var\(--lt-vv-top,0px\) 0 auto 0;[^}]*height:var\(--lt-vv-h,100dvh\)/, '창 높이는 보이는 화면을 따른다');
  assert.match(mobile, /\.quick-submit\{position:sticky;bottom:/, '담기 단추는 창 아래에 붙는다');
  assert.match(mobile, /#moment-form>\.button-row\{position:sticky;bottom:0;/, '저장하기·취소는 창 아래에 붙는다');
  assert.match(mobile, /\.write-tabs \[role=tab\]\{min-height:44px\}/, '탭 누름 영역 44px');
  assert.match(mobile, /\.quick-preview\[data-state=empty\]\{display:none\}/, '주소를 넣기 전에는 빈 미리보기 칸을 숨긴다');
});

test('#462 끌어다 놓기를 못 하는 기기에서는 끌어다 놓기 안내를 보이지도 읽지도 않는다', () => {
  const touch = shell({finePointer: false});
  try {
    assert.equal(touch.els['quick-hint'].hidden, true, '휴대폰·터치에서는 숨긴다');
    assert.equal(touch.els['quick-url'].getAttribute('aria-describedby'), null, '설명 연결도 뗀다');
  } finally { touch.restore(); }
  const mouse = shell({finePointer: true});
  try {
    assert.equal(mouse.$('quick-hint').hidden, false, '마우스 컴퓨터는 그대로 보인다');
  } finally { mouse.restore(); }
});

test('#462 문구: 입력 칸 안내·용량 한 줄·중복 안내 하나·수정 전용 묶음 기본 숨김', () => {
  const html = readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');
  const upload = readFileSync(new URL('../public/v41/private-upload.mjs', import.meta.url), 'utf8');
  const panelsSource = readFileSync(new URL('../public/v41/shell/panels.mjs', import.meta.url), 'utf8');
  assert.match(html, /placeholder="YouTube 같은 링크 주소"/);
  assert.match(upload, />사진 4MB, 영상 8MB까지 · 사진은 나만 볼 수 있어요</);
  const writePanel = html.slice(html.indexOf('<dialog id="write-panel"'), html.indexOf('</dialog>', html.indexOf('<dialog id="write-panel"')));
  const momentSlot = upload.slice(upload.indexOf(':`<span class="file-pick">'));
  assert.equal((writePanel + momentSlot).split('사진은 나만 볼 수 있어요').length - 1, 1, '순간 추가 창에서 "사진은 나만 볼 수 있어요"는 한 번만');
  assert.doesNotMatch(html, /quick-entry-lead/, '맨 위 안내 상자는 아래 안내 줄과 같은 말이라 뺐다');
  assert.match(html, /id="quick-entry-hint"[^>]*>제목·마음·링크나 첨부 중 하나만 남겨도 저장할 수 있어요\./, '안내는 아래 한 줄로');
  assert.match(html, /<section id="moment-management" hidden>/, '처음 연 자세한 추가에 수정 전용 묶음이 보이지 않는다');
  assert.doesNotMatch(panelsSource, /사진·영상은 직접 HTTPS 링크를 사용할 수 있어요/, '빈 주소의 긴 안내는 없앴다');
});
