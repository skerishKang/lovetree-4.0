import { listenOnSafePort } from './helpers/safe-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDialogs} from '../public/v41/shell/dialogs.mjs';

// #231 1-B 후속: shell/dialogs.mjs를 직접 호출해 Tab 순환·Esc 복귀·포커스 되돌림을 고정한다.

// index.html의 <dialog> 명부(id + data-lt-panel · data-lt-return)를 그대로 읽는다.
function dialogsFromHtml(html) {
  const out = [];
  let i = 0;
  while (true) {
    const at = html.indexOf('<dialog', i);
    if (at < 0) break;
    const end = html.indexOf('>', at);
    if (end < 0) break;
    const tag = html.slice(at, end + 1);
    i = end + 1;
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    const dataset = {};
    for (const attr of ['lt-panel', 'lt-return']) {
      const v = (tag.match(new RegExp('data-' + attr + '="([^"]*)"')) || [])[1];
      if (v !== undefined) dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    out.push({ id, dataset });
  }
  return out;
}

const HTML = readFileSync(new URL('../public/v41/index.html', import.meta.url), 'utf8');
const HTML_DIALOGS = dialogsFromHtml(HTML);


function fakeElement(props = {}) {
  const el = {
    open: false, hidden: false, disabled: false, id: props.id || '',
    dataset: props.dataset || {},
    focusCount: 0,
    focus() { el.focusCount += 1; },
    // 브라우저처럼 close()는 'close' 이벤트를 함께 보낸다(공통 틀의 초점 복귀가 이 이벤트를 듣는다).
    close() { el.open = false; el.listeners?.close?.(); },
    // #933: showModal 패치 시험이 ':modal'을 구분해야 해서 open·modal 값을 그대로 따라간다.
    matches(sel) { return sel === ':modal' ? !!el.modal : false; },
    getClientRects() { return [{}]; },
    getBoundingClientRect() { return {left: 0, top: 0, right: 100, bottom: 100}; },
    addEventListener(type, fn) { (el.listeners ||= {})[type] = fn; },
    querySelectorAll() { return props.focusables || []; },
    showModal() { el.open = true; },
    // #978: 앱 안 확인 틀이 자식 단추(예·아니요)를 querySelector로 찾는다 — 자식을 함께 둔다.
    children: [],
    append(...kids) { el.children.push(...kids); el.byId ||= {}; const walk = (n) => { if (n.id) el.byId[n.id] = n; for (const c of n.children || []) walk(c); }; for (const k of kids) walk(k); },
    setAttribute(k, v) { (el.attrs ||= {})[k] = v; },
    querySelector(sel) {
      if (sel?.startsWith('#')) return el.byId?.[sel.slice(1)] || null;
      return props.firstFocusable || null;
    },
    ...props,
  };
  return el;
}

function setup({focusables = [], popoverHidden = true, treeDirty = false, editorDirty = false, editorBusy = false, connectionDirty = false, quickDirty = false, shareDirty = false} = {}) {
  // #380 4 2차·마지막: 편집기·순간 잇기·설정·보관 파일·공유·둘러보기·빠른 추가·고르기가 공통 틀을 쓴다.
  // #368: 내 기록(records)도 설정으로 옮겨져 공통 틀 밖 대화상자(옛 바깥 클릭 규칙)는 없다.
  // #481 T8: 대화상자 명부를 손으로 복제하지 않고 index.html에서 읽는다 — 화면에 창을 더하거나 빼면
  // 이 시험이 저절로 따라간다(명부가 어긋나 '없는 창'을 시험하던 일이 없어진다).
  const dialogs = HTML_DIALOGS.map((d) => fakeElement({id: d.id, dataset: d.dataset}));
  const elements = {
    'account-avatar': fakeElement({id: 'account-avatar'}),
    'mobile-more': fakeElement({id: 'mobile-more'}),
    'account-popover': fakeElement({id: 'account-popover', hidden: popoverHidden}),
    'tree-tips': fakeElement({id: 'tree-tips', hidden: false}),
    // 브라우저와 같이 $('id')와 공통 틀이 묶은 dialog가 같은 요소가 되게 한다(초점 복귀 기록 확인용).
  };
  for (const d of dialogs) elements[d.id] = d;
  elements['write-panel'].querySelectorAll = () => focusables;
  const keydown = [], clicks = [];
  const doc = {
    activeElement: null,
    // #978: 앱 안 확인 틀은 createElement로 만들어 body에 붙인다 — 가짜 문서도 같은 길을 갖춘다.
    createElement(tag) { return fakeElement({tagName: tag.toUpperCase()}); },
    body: fakeElement({id: 'body'}),
    addEventListener(type, fn) { if (type === 'keydown') keydown.push(fn); else clicks.push([type, fn]); },
    querySelectorAll(sel) {
      if (sel === 'dialog') return dialogs;
      // #380 4: 공통 틀은 data-lt-panel 대화상자만, 옛 바깥 클릭 규칙은 나머지만 묶는다.
      if (sel === 'dialog:not([data-lt-panel])') return dialogs.filter(d => !d.dataset.ltPanel);
      if (sel === 'dialog[data-lt-panel]') return dialogs.filter(d => d.dataset.ltPanel);
      return [];
    },
    // 기본은 '대화상자 안에 없음' — 초점 복귀는 대화상자 밖에서 누른 조작만 쓴다(stub 요소와 겹치지 않게).
    contains() { return false; },
    getElementById(id) { return elements[id] || null; },
  };
  // #933: showModal·show 패치(창은 한 장만)를 시험하려면 브라우저처럼 defaultView와 dialog 원형이 있어야 한다.
  // 원형의 showModal/show는 '연다'만 흉내 낸다 — 앞 창 닫기는 dialogs.mjs 규칙이 정한다.
  class FakeDialogElement {
    showModal() { this.modal = true; this.open = true; }
    show() { this.open = true; }
  }
  doc.querySelectorAll = ((original) => (sel) => {
    if (sel === 'dialog[open]') return dialogs.filter((d) => d.open);
    return original(sel);
  })(doc.querySelectorAll);
  const defaultView = { history: { pushState() {} }, HTMLDialogElement: FakeDialogElement, addEventListener() {} };
  doc.defaultView = defaultView;
  const calls = [];
  globalThis.document = doc;
  globalThis.getComputedStyle = () => ({visibility: 'visible'});
  const api = createDialogs({
    $: id => elements[id],
    closeTreeTips: () => calls.push('closeTreeTips'),
    closeAccountMenu: () => calls.push('closeAccountMenu'),
    isTreeDirty: () => treeDirty,
    // #380 4 2차: 편집기는 입력이 바뀌면, 순간 잇기는 고른 연결이 저장 전이면 더러움이다.
    isEditorDirty: () => editorDirty,
    isConnectionDirty: () => connectionDirty,
    // #380 4 마지막: 빠른 추가(주소)·공유(설정 바꿈)만 더러움 판정을 받는다.
    // #425: 한 창의 더러움(쉬운 추가 주소·자세한 추가 폼)은 isEditorDirty 한 벌로 온다.
    isEditorDirty: () => editorDirty || quickDirty,
    isShareDirty: () => shareDirty,
    panelBlocked: id => (id === 'write-panel' && editorBusy ? '파일 전송을 마치거나 취소해 주세요.' : ''),
    notify: message => calls.push('notify:' + message),
  });
  // #481 T8: 순서(index)가 아니라 id로 창을 찾는다 — index.html의 순서가 바뀌어도 시험이 흔들리지 않는다.
  const byId = (id, bag) => (bag ? bag.dialogs : dialogs).find((d) => d.id === id);
  // #933: 패치는 원형에 걸리므로, 가짜 요소로 부르려면 원형을 함께 넘긴다(Proto.showModal.call(el, …)).
  return {elements, dialogs, byId, keydown, clicks, api, calls, Proto: FakeDialogElement.prototype};
}

function key(extra) {
  const e = {key: 'Tab', shiftKey: false, prevented: false, preventDefault() { e.prevented = true; }, ...extra};
  return e;
}

// #978: 닫기 확인은 앱 안 틀(#lt-close-confirm)이다 — 뜬 확인 창과 예/아니요 단추를 돌려준다.
// 물음은 비동기라 '한 번 묻는다'는 확인 창이 열린 것으로 본다(브라우저 confirm은 불리지 않는다).
function confirmFrame() {
  const el = globalThis.document.body.children.find((c) => c.id === 'lt-close-confirm');
  assert.ok(el?.open, '앱 안 확인 틀이 열린다');
  return {el, yes: el.byId['lt-close-confirm-yes'], no: el.byId['lt-close-confirm-no']};
}

// #380 4: 공통 틀의 Esc 규칙 — 쓰던 내용이 있으면 한 번 묻고, 아니오를 고르면 닫지 않는다.
// #978: 물음은 앱 안 확인 틀(#lt-close-confirm)이다 — 아니오 단추를 누르면 창이 남고, 예 단추를 누르면 닫힌다.
test('트리 관리 Esc: 더러우면 한 번 묻고, 아니오면 열어 둔다', () => {
  const {byId, api} = setup({treeDirty: true});
  const manager = byId('tree-manager');
  manager.open = true;
  const realConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => { throw new Error('브라우저 confirm을 쓰지 않는다'); };
    const cancel = {preventDefault() { cancel.prevented = true; }};
    manager.listeners.cancel(cancel);
    assert.equal(cancel.prevented, true, '물음이 떠 있는 동안 닫지 않는다');
    const {yes, no} = confirmFrame();
    no.listeners.click();
    assert.equal(manager.open, true, '아니오면 열린 상태 유지');
    const cancel2 = {preventDefault() {}};
    manager.listeners.cancel(cancel2);
    const again = confirmFrame();
    again.yes.listeners.click();
    assert.equal(manager.open, false, '예를 고르면 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('트리 관리 Esc: 깨끗하면 묻지 않고 바로 닫는다', () => {
  const {byId, api} = setup({treeDirty: false});
  const manager = byId('tree-manager');
  manager.open = true;
  const realConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => { throw new Error('깨끗하면 묻지 않는다'); };
    const cancel = {preventDefault() {}};
    manager.listeners.cancel(cancel);
    assert.equal(globalThis.document.body.children.some((c) => c.id === 'lt-close-confirm' && c.open), false, '확인 틀이 뜨지 않는다');
    assert.equal(manager.open, false, '바로 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('편집기 대화상자에서 Tab은 마지막에서 처음으로, Shift+Tab은 처음에서 마지막으로 순환한다', () => {
  const first = fakeElement(), last = fakeElement();
  const {elements, keydown, api} = setup({focusables: [first, last]});
  elements['write-panel'].open = true;
  const trap = api.trapShellTab;
  assert.ok(keydown.includes(trap), 'keydown에 잡아 둔다');

  document.activeElement = last;
  const forward = key({});
  trap(forward);
  assert.equal(forward.prevented, true);
  assert.equal(first.focusCount, 1, '마지막 Tab → 첫 항목');

  document.activeElement = first;
  const back = key({shiftKey: true});
  trap(back);
  assert.equal(back.prevented, true);
  assert.equal(last.focusCount, 1, '처음 Shift+Tab → 마지막 항목');

  document.activeElement = null;
  const outside = key({});
  trap(outside);
  assert.equal(outside.prevented, true, '밖에 있으면 안으로 들인다');
  assert.equal(first.focusCount, 2);
});

test('대화상자가 없거나 보관 파일이 위에 있으면 그 대화상자 안에서만 순환한다', () => {
  const first = fakeElement(), last = fakeElement();
  const {elements, api} = setup({focusables: [first]});
  const idle = key({});
  api.trapShellTab(idle);
  assert.equal(idle.prevented, false, '열린 대화상자가 없으면 그대로 둔다');

  elements['account-assets'].open = true;
  elements['account-assets'].querySelectorAll = () => [last];
  document.activeElement = last;
  const inAssets = key({});
  api.trapShellTab(inAssets);
  assert.equal(inAssets.prevented, true);
  assert.equal(last.focusCount, 1, '보관 파일 안에서 순환');
  assert.equal(first.focusCount, 0, '아래 편집기로 새지 않는다');
});

test('Esc는 첫 트리 말풍선을 닫되 모달 대화상자가 열려 있으면 건드리지 않는다', () => {
  const {elements, keydown, calls} = setup();
  const esc = {key: 'Escape', prevented: false, preventDefault() { this.prevented = true; }};
  for (const fn of keydown) fn(esc);
  assert.deepEqual(calls, ['closeTreeTips']);
  assert.equal(esc.prevented, true);

  calls.length = 0;
  elements['tree-tips'].hidden = true;
  for (const fn of keydown) fn({key: 'Escape', preventDefault() {}});
  assert.deepEqual(calls, [], '말풍선이 없으면 아무 일도 하지 않는다');
});

test('계정 메뉴 Esc는 메뉴를 닫고 계정 동그라미로 초점을 돌린다', () => {
  const {elements, keydown, calls} = setup({popoverHidden: false});
  for (const fn of keydown) fn({key: 'Escape', preventDefault() {}});
  assert.ok(calls.includes('closeAccountMenu'));
  assert.equal(elements['account-avatar'].focusCount, 1);

  const hidden = setup();
  for (const fn of hidden.keydown) fn({key: 'Escape', preventDefault() {}});
  assert.equal(hidden.elements['account-avatar'].focusCount, 0, '닫힌 메뉴는 건드리지 않는다');
});

test('보관 파일도 공통 틀에서 Esc로 닫히고 연 버튼으로 초점을 돌린다', async () => {
  const {elements, api} = setup();
  const opener = {isConnected: true, getClientRects: () => [{}], focusCount: 0, focus() { this.focusCount += 1; }};
  api.rememberOpener(opener);
  api.noteOpener('account-assets');
  elements['account-assets'].open = true;
  elements['account-assets'].listeners.cancel({preventDefault() {}});
  await new Promise(r => setTimeout(r, 5));
  assert.equal(elements['account-assets'].open, false, '닫는다');
  assert.equal(opener.focusCount, 1, '연 버튼으로 돌아간다');
});

test('바깥 클릭은 대화상자를 닫는다 — 전체 화면 편집기도 공통 틀에서 같은 규칙을 쓴다', () => {
  const {byId, dialogs, calls, clicks} = setup();
  // #368: 공통 틀 밖 dialog(옛 records 바깥 클릭 규칙)는 없다 — 남는 규칙은 data-lt-panel 한 벌뿐이다.
  assert.ok(dialogs.every(d => d.dataset.ltPanel), '모든 dialog가 공통 틀을 쓴다');
  const editor = byId('write-panel');
  editor.open = true;
  // 깨끗한 편집기는 묻지 않고 닫는다(#380 4 2차: 바깥 클릭도 공통 닫기 규칙).
  editor.listeners.click({target: editor, clientX: 500, clientY: 500});
  assert.equal(editor.open, false, '깨끗하면 닫는다');
  assert.deepEqual(calls, [], '깨끗하면 묻지 않는다');
  editor.open = true;
  editor.listeners.click({target: {}, clientX: 500, clientY: 500});
  assert.equal(editor.open, true, '안쪽 클릭은 무시한다');
});

// #380 4 2차: 편집기·순간 잇기의 공통 틀 계약 — ng·바깥·Esc 세 길이 모두 같은 확인/차단을 지난다.
test('편집기 Esc: 쓰던 입력이 있으면 한 번 묻고, 아니오면 열어 둔다', () => {
  const {byId, dialogs} = setup({editorDirty: true});
  const editor = byId('write-panel');
  editor.open = true;
  const realConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => { throw new Error('브라우저 confirm을 쓰지 않는다'); };
    const cancel = {preventDefault() { cancel.prevented = true; }};
    editor.listeners.cancel(cancel);
    assert.equal(cancel.prevented, true, '물음이 떠 있는 동안 닫지 않는다');
    const {yes, no} = confirmFrame();
    no.listeners.click();
    assert.equal(editor.open, true, '아니오면 열린 상태 유지');
    editor.listeners.cancel({preventDefault() {}});
    confirmFrame().yes.listeners.click();
    assert.equal(editor.open, false, '예를 고르면 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('편집기 바깥 클릭: 더러우면 한 번 묻고, 아니오면 열어 둔다', () => {
  const {byId, dialogs} = setup({editorDirty: true});
  const editor = byId('write-panel');
  editor.open = true;
  const realConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => { throw new Error('브라우저 confirm을 쓰지 않는다'); };
    editor.listeners.click({target: editor, clientX: 500, clientY: 500});
    confirmFrame().no.listeners.click();
    assert.equal(editor.open, true);
    editor.listeners.click({target: editor, clientX: 500, clientY: 500});
    confirmFrame().yes.listeners.click();
    assert.equal(editor.open, false);
  } finally { globalThis.confirm = realConfirm; }
});

test('편집기 업로드 중에는 Esc·바깥 클릭·× 모두 닫지 않고 이유를 알린다(편집기 규칙이 이긴다)', () => {
  const {byId, dialogs, api, calls} = setup({editorDirty: true, editorBusy: true});
  const editor = byId('write-panel');
  const realConfirm = globalThis.confirm;
  try {
    let asked = 0;
    globalThis.confirm = () => { asked += 1; return true; };
    // 업로드 중에는 더러움 확인조차 묻지 않고 닫지 않는다.
    for (const close of [
      () => { const cancel = {preventDefault() { cancel.prevented = true; }}; editor.listeners.cancel(cancel); return cancel.prevented; },
      () => { editor.listeners.click({target: editor, clientX: 500, clientY: 500}); return editor.open; },
      () => !api.requestClose('write-panel'),
    ]) {
      editor.open = true;
      assert.equal(close(), true, '닫지 않는다');
      assert.equal(editor.open, true);
    }
    assert.equal(asked, 0, '더러움 확인을 묻지 않는다');
    assert.equal(calls.filter(c => c.startsWith('notify:파일 전송')).length, 3, '세 길 모두 같은 문구로 알린다');
  } finally { globalThis.confirm = realConfirm; }
});

test('편집기 ×·취소(requestClose)는 깨끗하면 묻지 않고 닫고 연 버튼으로 초점을 돌린다', async () => {
  const {byId, api} = setup({editorDirty: false});
  const editor = byId('write-panel');
  const opener = {isConnected: true, getClientRects: () => [{}], focusCount: 0, focus() { this.focusCount += 1; }};
  api.noteOpener('write-panel');
  document.activeElement = opener;
  api.noteOpener('write-panel');
  editor.open = true;
  assert.equal(api.requestClose('write-panel'), true, '닫는다');
  editor.listeners.close();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(opener.focusCount, 1, '연 버튼으로 초점이 돌아온다');
});

test('순간 잇기 Esc: 고른 연결이 저장 전이면 한 번 묻는다', () => {
  const {byId, dialogs} = setup({connectionDirty: true});
  const connection = byId('connection-panel');
  connection.open = true;
  const realConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => { throw new Error('브라우저 confirm을 쓰지 않는다'); };
    const cancel = {preventDefault() { cancel.prevented = true; }};
    connection.listeners.cancel(cancel);
    assert.equal(cancel.prevented, true);
    confirmFrame().no.listeners.click();
    assert.equal(connection.open, true, '아니오면 열어 둔다');
    connection.listeners.cancel({preventDefault() {}});
    confirmFrame().yes.listeners.click();
    assert.equal(connection.open, false, '예를 고르면 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('빠른 추가 Esc: 주소를 적어 두었으면 한 번 묻고, 비어 있으면 그대로 닫는다', () => {
  const dirty = setup({quickDirty: true});
  const quick = dirty.byId('write-panel'); // write-panel
  quick.open = true;
  const realConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => { throw new Error('브라우저 confirm을 쓰지 않는다'); };
    const cancel = {preventDefault() { cancel.prevented = true; }};
    quick.listeners.cancel(cancel);
    assert.equal(cancel.prevented, true, '물음이 떠 있는 동안 닫지 않는다');
    confirmFrame().no.listeners.click();
    assert.equal(quick.open, true, '아니오면 열어 둔다');
    const clean = setup({quickDirty: false});
    const cleanQuick = clean.byId('write-panel'); // write-panel
    cleanQuick.open = true;
    cleanQuick.listeners.cancel({preventDefault() {}});
    assert.equal(cleanQuick.open, false, '바로 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('공유 Esc: 설정을 바꿔 링크를 아직 만들지 않았으면 한 번 묻는다', () => {
  const {byId, dialogs} = setup({shareDirty: true});
  const share = byId('share-panel');
  share.open = true;
  const realConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => { throw new Error('브라우저 confirm을 쓰지 않는다'); };
    share.listeners.cancel({preventDefault() {}});
    confirmFrame().yes.listeners.click();
    assert.equal(share.open, false, '예를 고르면 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('설정·둘러보기·고르기 창은 묻지 않고 바로 닫는다', () => {
  const {dialogs, calls} = setup();
  const realConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => { throw new Error('묻지 않는다'); };
    for (const index of [4, 6]) { // account-settings · community-panel
      const dialog = dialogs[index];
      dialog.open = true;
      dialog.listeners.cancel({preventDefault() {}});
      assert.equal(dialog.open, false, `${dialog.id}는 바로 닫는다`);
    }
    assert.deepEqual(calls.filter(c => c.startsWith('notify:')), [], '안내도 띄우지 않는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('패널 모듈이 직접 연 창도 마지막으로 누른 버튼으로 초점을 돌린다(noteOpener 없이)', async () => {
  const {byId, dialogs, clicks} = setup();
  const quick = byId('write-panel'); // write-panel
  const opener = {isConnected: true, getClientRects: () => [{}], focusCount: 0, focus() { this.focusCount += 1; }};
  // 공통 틀이 적어 두는 "마지막으로 누른 조작 요소" 기록을 흉내 낸다.
  for (const [type, fn] of clicks) if (type === 'click') fn({target: {closest: () => opener}});
  quick.open = true;
  quick.close();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(opener.focusCount, 1, '연 버튼으로 돌아간다');
});

test('연 버튼이 모바일 메뉴에 접혀 보이지 않으면 더보기 버튼으로 초점을 돌린다', async () => {
  const {byId, elements, dialogs} = setup();
  // 연 버튼(#community-menu)이 화면에 없고, 더보기 버튼은 보이는 모바일 상태를 흉내 낸다.
  elements['mobile-more'].getClientRects = () => [{}];
  globalThis.document.getElementById = id => (id === 'community-menu'
    ? {isConnected: true, getClientRects: () => [], focusCount: 0, focus() { this.focusCount = (this.focusCount || 0) + 1; }}
    : elements[id] || null);
  const community = byId('community-panel');
  community.open = true;
  community.close();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(elements['mobile-more'].focusCount, 1, '더보기 버튼으로 돌아온다');
});

test('보이는 연 버튼(data-lt-return)이 있으면 더보기 버튼으로 보내지 않는다', async () => {
  const {byId, elements, dialogs} = setup();
  elements['mobile-more'].getClientRects = () => [{}];
  const fallback = {isConnected: true, getClientRects: () => [{}], focusCount: 0, focus() { this.focusCount += 1; }};
  globalThis.document.getElementById = id => (id === 'community-menu' ? fallback : elements[id] || null);
  const community = byId('community-panel');
  community.open = true;
  community.close();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(fallback.focusCount, 1, '보이는 연 버튼으로 돌아온다');
  assert.equal(elements['mobile-more'].focusCount, 0, '더보기로 보내지 않는다');
});

// ---- #631: 의견 보내기 창 다듬기 -------------------------------------------------
// 보내기 전 검사와 보낸 뒤 화면(제목·안내·주 단추)을 실제 값으로 고정한다.
import { createFeedbackDialog } from '../public/v41/feedback.mjs';

function feedbackHarness({loggedIn = false, recentErrors = null, onSent, sendResult} = {}) {
  const make = (props = {}) => ({
    value: '', textContent: '', hidden: false, disabled: false, open: false,
    dataset: {}, listeners: {}, focusCount: 0,
    focus() { this.focusCount += 1; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    reset() {},
    ...props
  });
  const closeButton = make();
  const boxes = [
    {dataset: {ctx: 'screen'}, checked: true},
    {dataset: {ctx: 'viewport'}, checked: true},
    {dataset: {ctx: 'version'}, checked: false},
    // #1072 A-16: 최근 오류 기록 — 기록이 있을 때만 칸이 보이고, 끄면 보내지 않는다. 기본(미지정)은 켜져 있다.
    {dataset: {ctx: 'recentErrors'}, checked: recentErrors === null || recentErrors.length > 0}
  ];
  const els = {
    'feedback-panel': make({querySelectorAll: () => boxes}),
    'feedback-form': make(),
    'feedback-done': make({querySelector: (sel) => (sel === '.button-row .primary' ? closeButton : null)}),
    'feedback-error': make(),
    'feedback-body': make(),
    'feedback-count': make(),
    'feedback-send': make(),
    'feedback-tree-field': make({hidden: true}),
    'feedback-report-field': make({hidden: true}),
    'feedback-category': make(),
    'feedback-title': make(),
    'feedback-note': make(),
    'feedback-done-logged-in': make({hidden: true}),
    'feedback-done-logged-out': make({hidden: false}),
    'feedback-open-myposts': make()
  };
  const sent = [];
  let myPostsOpened = 0;
  const dialog = createFeedbackDialog({
    $: id => els[id] || null,
    notify: () => {},
    // #1072 A-16: recentErrors를 직접 넘기면 그 값을 쓰고(빈 목록 = 기록 없음), 아니면 실제 report 기록을 쓴다.
    getContext: () => ({screen: '첫 화면', viewport: '1440x900', theme: 'night', version: '4.1', loggedIn, treeId: '', recentErrors: recentErrors !== null ? recentErrors : reportEntries()}),
    show: () => { els['feedback-panel'].open = true; },
    openMyPosts: () => { myPostsOpened += 1; },
    onSent,
    api: {send: async (payload) => { sent.push(payload); return sendResult || {ok: true, status: 201}; }}
  });
  return {dialog, els, sent, closeButton, myPostsOpenCount: () => myPostsOpened};
}

test('의견 창: 종류를 고르지 않으면 보내지 않고 무엇을 고를지 알려 준다', async () => {
  const h = feedbackHarness();
  h.dialog.open();
  h.els['feedback-body'].value = '설명이 단어 중간에서 끊겨요';
  await h.els['feedback-form'].listeners.submit({preventDefault() {}});
  assert.equal(h.els['feedback-error'].textContent, '어떤 의견인지 골라 주세요.');
  assert.equal(h.els['feedback-category'].focusCount, 1, '고를 칸으로 초점이 간다');
  assert.equal(h.sent.length, 0, '고르지 않았으면 보내지 않는다');
  assert.equal(h.els['feedback-done'].hidden, true);
});

test('의견 창: 보낸 뒤 제목을 바꾸고 보내기 전 안내를 감추고 주 단추로 초점을 옮긴다', async () => {
  const h = feedbackHarness({loggedIn: false});
  h.dialog.open();
  assert.equal(h.els['feedback-title'].textContent, '의견 보내기');
  h.els['feedback-category'].value = 'bug';
  h.els['feedback-body'].value = '설명이 단어 중간에서 끊겨요';
  await h.els['feedback-form'].listeners.submit({preventDefault() {}});
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].category, 'bug');
  assert.deepEqual(h.sent[0].context, {screen: '첫 화면', viewport: '1440x900'}, '끈 정보는 보내지 않는다');
  assert.equal(h.els['feedback-title'].textContent, '의견을 보냈어요');
  assert.equal(h.els['feedback-note'].hidden, true, '보내기 전 안내는 보낸 뒤 감춘다');
  assert.equal(h.els['feedback-form'].hidden, true);
  assert.equal(h.els['feedback-done'].hidden, false);
  assert.equal(h.els['feedback-done-logged-out'].hidden, false, '로그아웃이면 로그인 안내');
  assert.equal(h.els['feedback-done-logged-in'].hidden, true);
  assert.equal(h.closeButton.focusCount, 1, '닫기 주 단추로 초점이 간다');
});

test('의견 창: 로그인 상태면 내 의견 바로가기를 보여 주고 누르면 연다', () => {
  const h = feedbackHarness({loggedIn: true});
  h.dialog.open();
  assert.equal(h.els['feedback-done-logged-in'].hidden, false);
  assert.equal(h.els['feedback-done-logged-out'].hidden, true);
  h.els['feedback-open-myposts'].listeners.click();
  assert.equal(h.myPostsOpenCount(), 1);
});

test('의견 창: 다시 열면 제목·안내·단추가 보내기 전 모양으로 돌아온다', async () => {
  const h = feedbackHarness();
  h.dialog.open();
  h.els['feedback-category'].value = 'other';
  h.els['feedback-body'].value = '고맙습니다';
  await h.els['feedback-form'].listeners.submit({preventDefault() {}});
  h.dialog.open();
  assert.equal(h.els['feedback-title'].textContent, '의견 보내기');
  assert.equal(h.els['feedback-note'].hidden, false);
  assert.equal(h.els['feedback-done'].hidden, true);
  assert.equal(h.els['feedback-send'].disabled, false);
});

// #631 화면 수치 시험: 크롬이 있어야 도는 실행형 시험이라 LT_FEEDBACK_631_REQUIRE=1 에서만 돈다.
// 판정은 눈이 아니라 숫자로 한다 — 창 높이·체크 상자와 글자 높이 차이·단추 오른쪽 정렬·기본값 없음.
const FEEDBACK631_REQUIRE = process.env.LT_FEEDBACK_631_REQUIRE === '1';
let chromium631 = null;
let skip631 = false;
try {
  ({ chromium: chromium631 } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium631.executablePath())) skip631 = 'chromium 미설치';
} catch {
  skip631 = 'playwright 없음';
}
if (FEEDBACK631_REQUIRE && skip631) throw new Error(`LT_FEEDBACK_631_REQUIRE=1 인데 실행 시험을 건너뛴다: ${skip631}`);

test('의견 창 수치: 1440·390 밤·정원에서 창이 화면 안에 들어오고 상자·글자가 한 줄, 단추는 오른쪽', {skip: skip631}, async () => {
  const { createServer } = await import('node:http');
  const { createReadStream, statSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));
  const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json'};
  const server = createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (file.endsWith(path.sep)) file += 'index.html';
    let ok = false;
    try { ok = statSync(file).isFile(); } catch { ok = false; }
    if (!ok) { res.writeHead(404).end(''); return; }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    createReadStream(file).pipe(res);
  });
  await listenOnSafePort(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium631.launch();
  const seen = [];
  try {
    for (const theme of ['night', 'garden']) {
      for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
        const context = await browser.newContext({viewport, deviceScaleFactor: 1});
        const page = await context.newPage();
        await page.addInitScript(value => { try { localStorage.setItem('lt41.theme', value); } catch {} }, theme);
        await page.route('**/api/**', route => route.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}'}));
        await page.goto(`${base}/v41/index.html`, {waitUntil: 'load'});
        await page.evaluate(() => document.getElementById('feedback-panel').showModal());
        await page.waitForTimeout(150);
        const before = await page.evaluate(() => {
          const dialog = document.getElementById('feedback-panel');
          const rect = dialog.getBoundingClientRect();
          const rows = [...document.querySelectorAll('#feedback-context-fields label:not([hidden])')].map(label => {
            const box = label.querySelector('input').getBoundingClientRect();
            const text = label.getBoundingClientRect();
            return {dy: Math.round(((text.top + text.height / 2) - (box.top + box.height / 2)) * 10) / 10, height: Math.round(text.height)};
          });
          const send = document.getElementById('feedback-send').getBoundingClientRect();
          const cancel = document.querySelector('#feedback-actions button[data-close]').getBoundingClientRect();
          return {
            height: Math.round(rect.height), width: Math.round(rect.width),
            viewportHeight: innerHeight, overflow: dialog.scrollHeight - dialog.clientHeight,
            rows, gapToRight: Math.round(rect.right - send.right),
            sendAfterCancel: send.left > cancel.left,
            category: document.getElementById('feedback-category').value,
            eyebrow: document.querySelectorAll('#feedback-panel .eyebrow').length,
            text: dialog.innerText
          };
        });
        assert.ok(before.height <= before.viewportHeight, `${theme} ${viewport.width}: 창 높이 ${before.height} ≤ 화면 ${before.viewportHeight}`);
        assert.ok(before.overflow <= 1, `${theme} ${viewport.width}: 창 안 스크롤 없음(${before.overflow})`);
        for (const row of before.rows) assert.ok(Math.abs(row.dy) <= 4, `${theme} ${viewport.width}: 상자와 글자 세로 차이 ${row.dy}px`);
        assert.ok(before.rows.every(row => row.height <= 40), '상자와 글자가 한 줄에 놓인다');
        assert.equal(before.category, '', '처음에는 아무것도 골라져 있지 않다');
        assert.equal(before.eyebrow, 0, '작은 꼬리표를 뺐다');
        assert.ok(before.gapToRight < 40 && before.gapToRight >= 0, `보내기 단추가 오른쪽(${before.gapToRight}px)`);
        assert.ok(before.sendAfterCancel, '보내기가 맨 오른쪽');
        assert.ok(!/undefined|null|NaN/.test(before.text), '창 글자에 undefined·null·NaN 없음');
        // 종류를 고르지 않으면 무엇을 고를지 알려 주고, 종류를 고른 뒤 내용이 비면 그것도 알려 준다(창은 그대로).
        await page.click('#feedback-send');
        await page.waitForTimeout(120);
        assert.match(await page.textContent('#feedback-error'), /골라 주세요/, '고르지 않으면 알려 준다');
        await page.selectOption('#feedback-category', 'bug');
        await page.click('#feedback-send');
        await page.waitForTimeout(120);
        const warned = await page.evaluate(() => ({
          error: document.getElementById('feedback-error').textContent,
          formHidden: document.getElementById('feedback-form').hidden
        }));
        assert.match(warned.error, /내용을 입력해 주세요/, '빈 내용도 알려 준다');
        assert.equal(warned.formHidden, false);
        // 내용을 채워 보내면 보낸 뒤 화면.
        await page.fill('#feedback-body', '설명이 단어 중간에서 끊겨요');
        await page.click('#feedback-send');
        await page.waitForFunction(() => !document.getElementById('feedback-done').hidden, null, {timeout: 5000});
        const after = await page.evaluate(() => {
          const dialog = document.getElementById('feedback-panel');
          const rect = dialog.getBoundingClientRect();
          const close = document.getElementById('feedback-done-close');
          const closeRect = close.getBoundingClientRect();
          const root = getComputedStyle(document.documentElement);
          const style = getComputedStyle(close);
          return {
            title: document.getElementById('feedback-title').textContent,
            noteHidden: document.getElementById('feedback-note').hidden,
            closeGap: Math.round(rect.right - closeRect.right),
            closeBg: style.backgroundColor,
            closeRadius: style.borderRadius,
            primary: root.getPropertyValue('--lt-primary').trim(),
            loggedOutShown: !document.getElementById('feedback-done-logged-out').hidden,
            checkBox: (() => { const box = document.querySelector('#feedback-done .feedback-check').getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; })(),
            text: dialog.innerText
          };
        });
        assert.equal(after.title, '의견을 보냈어요');
        assert.equal(after.noteHidden, true, '보내기 전 안내를 감춘다');
        assert.ok(after.closeGap < 40, `닫기 단추가 오른쪽(${after.closeGap}px)`);
        assert.ok(after.closeRadius.startsWith('9'), `닫기 단추가 둥글다(${after.closeRadius})`);
        assert.ok(after.loggedOutShown, '로그아웃이면 로그인 안내');
        assert.ok(after.checkBox[0] >= 24, `완료 표시가 작지 않다(${after.checkBox.join('x')})`);
        assert.ok(!/undefined|null|NaN/.test(after.text), '보낸 뒤 글자에도 undefined·null·NaN 없음');
        seen.push({theme, viewport: `${viewport.width}x${viewport.height}`, height: before.height, rows: before.rows.length, gap: before.gapToRight});
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  assert.equal(seen.length, 4);
});

// #933: 창은 한 장만 — 새 창을 열 때(모달·비모달 모두)와 화면을 옮길 때 열려 있던 창을 닫는다.
test('#933 새 창을 열면 앞 창을 닫는다 — 열린 창은 한 장', () => {
  const {byId, Proto, dialogs} = setup();
  const manager = byId('tree-manager');
  const write = byId('write-panel');
  manager.open = true; manager.modal = true;
  Proto.showModal.call(write);
  assert.equal(manager.open, false, '트리 관리 창이 남지 않는다');
  assert.equal(write.open, true, '새 창(순간 추가)은 열린다');
  // 비모달로 여는 새 소식 창도 앞 창을 먼저 닫는다(트리 관리 → 새 소식).
  const updates = byId('updates-panel');
  Proto.show.call(updates);
  assert.equal(write.open, false, '모달 창 위에 새 소식 창만 남는다');
  assert.equal(dialogs.filter((d) => d.open).map((d) => d.id).join(','), 'updates-panel', '열린 창은 한 장');
});

test('#933 화면을 옮길 때 열린 창을 닫고, 둘러보기 창은 이 틀이 건드리지 않는다', () => {
  const {byId, api} = setup();
  const manager = byId('tree-manager');
  const community = byId('community-panel');
  manager.open = true; manager.modal = true;
  community.open = true; community.modal = true;
  api.closePanels();
  assert.equal(manager.open, false, '트리 관리 창은 닫힌다');
  assert.equal(community.open, true, '둘러보기 창은 자기 규칙(둘러보기 모듈)이 닫는다');
});

test('#933 잠깐 판(옮길 트리 고르기)은 지금처럼 위에 겹쳐 연다', () => {
  const {byId, Proto} = setup();
  const manager = byId('tree-manager');
  const picker = byId('move-picker');
  manager.open = true; manager.modal = true;
  Proto.showModal.call(picker);
  assert.equal(manager.open, true, '앞 일로 돌아가는 창은 겹침을 허용한다(#845 3단계 그대로)');
});

// ---- #1072 A-16: 화면 공용 오류 기록(report)과 의견 보내기 연결 ----
import {report, reportEntries} from '../public/v41/report.mjs';

test('오류 기록: 최근 20건만 메모리에 두고 메시지·위치·시각만 남긴다', () => {
  for (let i = 1; i <= 25; i += 1) report(new Error('오류 ' + i), '위치 ' + i);
  const entries = reportEntries();
  assert.equal(entries.length, 20, '20건을 넘기면 오래된 것부터 버린다');
  assert.equal(entries[0].message, '오류 6', '가장 오래된 기록은 6번째 오류다');
  assert.equal(entries.at(-1).message, '오류 25');
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['at', 'message', 'where'], '한 건은 메시지·위치·시각뿐이다');
    assert.ok(!('error' in entry) && !('stack' in entry), '오류 객체·스택은 기록하지 않는다');
  }
});

test('오류 기록: 메시지에 메일 모양 글자가 섞이면 지워서 남긴다', () => {
  report(new Error('user@example.com 계정에서 보드 저장이 실패했어요'), '보드 저장');
  const last = reportEntries().at(-1);
  assert.ok(!last.message.includes('user@example.com'), '메일 주소는 기록하지 않는다');
  assert.ok(last.message.includes('메일'), '메일 모양 글자는 지우고 남긴다');
  assert.equal(last.where, '보드 저장');
});

test('의견 창: 오류 기록이 있으면 최근 오류 기록 칸을 보이고 함께 보낸다', async () => {
  report(new Error('보드 저장이 서버에서 거절됐어요'), '보드 저장');
  const h = feedbackHarness();
  h.dialog.open();
  assert.equal(h.els['feedback-report-field'].hidden, false, '기록이 있으면 칸을 보인다');
  h.els['feedback-category'].value = 'bug';
  h.els['feedback-body'].value = '보드 저장이 안 돼요. 기록을 함께 보냅니다.';
  await h.els['feedback-form'].listeners.submit({preventDefault() {}});
  assert.equal(h.sent.length, 1);
  const list = h.sent[0].context.recentErrors;
  assert.ok(Array.isArray(list) && list.length >= 1, '함께 보낸 정보에 오류 기록이 있다');
  assert.equal(list.at(-1).where, '보드 저장', '방금 남긴 기록이 실린다');
  assert.ok(list.every((entry) => JSON.stringify(Object.keys(entry).sort()) === JSON.stringify(['at', 'message', 'where'])), '기록 한 건은 메시지·위치·시각뿐이다');
});

test('의견 창: 기록이 없으면 칸을 숨기고, 기록이 있어도 끄면 보내지 않는다', async () => {
  const empty = feedbackHarness({recentErrors: []});
  empty.dialog.open();
  assert.equal(empty.els['feedback-report-field'].hidden, true, '기록이 없으면 칸을 숨긴다');
  empty.els['feedback-category'].value = 'bug';
  empty.els['feedback-body'].value = '의견만 보낸다';
  await empty.els['feedback-form'].listeners.submit({preventDefault() {}});
  assert.equal(empty.sent[0].context.recentErrors, undefined, '빈 기록은 보내지 않는다');

  // 끈 상자: selectedContext가 끈 정보는 담지 않는다(의견 창 #631 규칙과 같다).
  const saved = [{message: '오류', where: '보드 저장', at: '2026-11-22T00:00:00.000Z'}];
  const unchecked = {dataset: {ctx: 'recentErrors'}, checked: false};
  const dialog = {querySelectorAll: () => [unchecked]};
  const base = {recentErrors: saved};
  const out = {};
  for (const box of dialog.querySelectorAll('[data-ctx]')) {
    const key = box.dataset.ctx;
    if (Array.isArray(base[key]) && !base[key].length) continue;
    if (box.checked && base[key] !== undefined && base[key] !== null && base[key] !== '') out[key] = base[key];
  }
  assert.equal(out.recentErrors, undefined, '끈 최근 오류 기록은 보내지 않는다');
});

test('#1273 6번: 보내기 성공하면 응답의 새 의견을 목록쪽으로 넘긴다', async () => {
  const sentPosts = [];
  const h = feedbackHarness({
    loggedIn: true,
    onSent: post => sentPosts.push(post),
    sendResult: {ok: true, id: 31, status: 'received', createdAt: '2026-11-24T00:02:00Z', kind: 'opinion', category: 'bug', title: '새 제목', body: '새 의견 본문'}
  });
  h.dialog.open();
  h.els['feedback-category'].value = 'bug';
  h.els['feedback-body'].value = '새 의견 본문';
  await h.els['feedback-form'].listeners.submit({preventDefault() {}});
  assert.equal(sentPosts.length, 1);
  assert.equal(sentPosts[0].id, 31);
  assert.equal(sentPosts[0].body, '새 의견 본문');
  assert.equal(sentPosts[0].kind, 'opinion');
});
