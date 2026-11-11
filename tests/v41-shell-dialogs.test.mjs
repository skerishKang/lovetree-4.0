import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialogs} from '../public/v41/shell/dialogs.mjs';

// #231 1-B 후속: shell/dialogs.mjs를 직접 호출해 Tab 순환·Esc 복귀·포커스 되돌림을 고정한다.

function fakeElement(props = {}) {
  const el = {
    open: false, hidden: false, disabled: false, id: props.id || '',
    dataset: props.dataset || {},
    focusCount: 0,
    focus() { el.focusCount += 1; },
    close() { el.open = false; },
    matches() { return false; },
    getClientRects() { return [{}]; },
    getBoundingClientRect() { return {left: 0, top: 0, right: 100, bottom: 100}; },
    addEventListener(type, fn) { (el.listeners ||= {})[type] = fn; },
    querySelectorAll() { return props.focusables || []; },
    ...props,
  };
  return el;
}

function setup({focusables = [], popoverHidden = true, treeDirty = false, editorDirty = false, editorBusy = false, connectionDirty = false} = {}) {
  const elements = {
    'account-assets': fakeElement({id: 'account-assets'}),
    'editor': fakeElement({id: 'editor'}),
    'account-avatar': fakeElement({id: 'account-avatar'}),
    'account-popover': fakeElement({id: 'account-popover', hidden: popoverHidden}),
    'tree-tips': fakeElement({id: 'tree-tips', hidden: false}),
  };
  // #380 4 2차: 편집기·순간 잇기도 전체 화면 공통 틀을 쓴다.
  const dialogs = [
    fakeElement({id: 'records'}),
    fakeElement({id: 'editor', dataset: {ltPanel: 'full', ltReturn: 'write-menu'}}),
    fakeElement({id: 'tree-manager', dataset: {ltPanel: 'center'}}),
    fakeElement({id: 'connection-panel', dataset: {ltPanel: 'full'}})
  ];
  // 브라우저와 같이 $('editor')와 공통 틀이 묶은 dialog가 같은 요소가 되게 한다(초점 복귀 기록 확인용).
  elements['editor'] = dialogs[1];
  elements['editor'].querySelectorAll = () => focusables;
  const keydown = [], clicks = [];
  const doc = {
    activeElement: null,
    addEventListener(type, fn) { if (type === 'keydown') keydown.push(fn); else clicks.push([type, fn]); },
    querySelectorAll(sel) {
      if (sel === 'dialog') return dialogs;
      // #380 4: 공통 틀은 data-lt-panel 대화상자만, 옛 바깥 클릭 규칙은 나머지만 묶는다.
      if (sel === 'dialog:not([data-lt-panel])') return dialogs.filter(d => !d.dataset.ltPanel);
      if (sel === 'dialog[data-lt-panel]') return dialogs.filter(d => d.dataset.ltPanel);
      return [];
    },
    contains() { return true; },
    getElementById(id) { return elements[id] || null; },
  };
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
    panelBlocked: id => (id === 'editor' && editorBusy ? '파일 전송을 마치거나 취소해 주세요.' : ''),
    notify: message => calls.push('notify:' + message),
  });
  return {elements, dialogs, keydown, api, calls};
}

function key(extra) {
  const e = {key: 'Tab', shiftKey: false, prevented: false, preventDefault() { e.prevented = true; }, ...extra};
  return e;
}

// #380 4: 공통 틀의 Esc 규칙 — 쓰던 내용이 있으면 한 번 묻고, 아니오를 고르면 닫지 않는다.
test('트리 관리 Esc: 더러우면 한 번 묻고, 아니오면 열어 둔다', () => {
  const {dialogs, api} = setup({treeDirty: true});
  const manager = dialogs[2];
  manager.open = true;
  const realConfirm = globalThis.confirm;
  try {
    let asked = 0;
    globalThis.confirm = () => { asked += 1; return false; };
    const cancel = {preventDefault() { cancel.prevented = true; }};
    manager.listeners.cancel(cancel);
    assert.equal(asked, 1, '한 번만 묻는다');
    assert.equal(cancel.prevented, true, '아니오면 닫지 않는다');
    assert.equal(manager.open, true, '열린 상태 유지');
    globalThis.confirm = () => true;
    const cancel2 = {preventDefault() {}};
    manager.listeners.cancel(cancel2);
    assert.equal(manager.open, false, '예를 고르면 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('트리 관리 Esc: 깨끗하면 묻지 않고 바로 닫는다', () => {
  const {dialogs, api} = setup({treeDirty: false});
  const manager = dialogs[2];
  manager.open = true;
  const realConfirm = globalThis.confirm;
  try {
    let asked = 0;
    globalThis.confirm = () => { asked += 1; return false; };
    const cancel = {preventDefault() {}};
    manager.listeners.cancel(cancel);
    assert.equal(asked, 0, '묻지 않는다');
    assert.equal(manager.open, false, '바로 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('편집기 대화상자에서 Tab은 마지막에서 처음으로, Shift+Tab은 처음에서 마지막으로 순환한다', () => {
  const first = fakeElement(), last = fakeElement();
  const {elements, keydown, api} = setup({focusables: [first, last]});
  elements['editor'].open = true;
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

test('보관 파일 취소(Esc)는 연 버튼으로, 연 버튼이 없으면 계정 동그라미로 초점을 돌린다', async () => {
  const {elements, api} = setup();
  const opener = {isConnected: true, getClientRects: () => [{}], focusCount: 0, focus() { this.focusCount += 1; }};
  api.rememberOpener(opener);
  elements['account-assets'].open = true;
  elements['account-assets'].listeners.cancel({preventDefault() {}});
  await new Promise(r => setTimeout(r, 5));
  assert.equal(elements['account-assets'].open, false, '닫는다');
  assert.equal(opener.focusCount, 1, '연 버튼으로 돌아간다');
});

test('바깥 클릭은 대화상자를 닫는다 — 전체 화면 편집기도 공통 틀에서 같은 규칙을 쓴다', () => {
  const {dialogs, calls} = setup();
  const records = dialogs[0], editor = dialogs[1];
  records.open = editor.open = true;
  records.listeners.click({target: records, clientX: 500, clientY: 500});
  assert.equal(records.open, false, '배경 클릭은 닫는다');
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
  const {dialogs} = setup({editorDirty: true});
  const editor = dialogs[1];
  editor.open = true;
  const realConfirm = globalThis.confirm;
  try {
    let asked = 0;
    globalThis.confirm = () => { asked += 1; return false; };
    const cancel = {preventDefault() { cancel.prevented = true; }};
    editor.listeners.cancel(cancel);
    assert.equal(asked, 1, '한 번만 묻는다');
    assert.equal(cancel.prevented, true, '아니오면 닫지 않는다');
    assert.equal(editor.open, true, '열린 상태 유지');
    globalThis.confirm = () => true;
    editor.listeners.cancel({preventDefault() {}});
    assert.equal(editor.open, false, '예를 고르면 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});

test('편집기 바깥 클릭: 더러우면 한 번 묻고, 아니오면 열어 둔다', () => {
  const {dialogs} = setup({editorDirty: true});
  const editor = dialogs[1];
  editor.open = true;
  const realConfirm = globalThis.confirm;
  try {
    let asked = 0;
    globalThis.confirm = () => { asked += 1; return false; };
    editor.listeners.click({target: editor, clientX: 500, clientY: 500});
    assert.equal(asked, 1);
    assert.equal(editor.open, true);
    globalThis.confirm = () => { asked += 1; return true; };
    editor.listeners.click({target: editor, clientX: 500, clientY: 500});
    assert.equal(asked, 2);
    assert.equal(editor.open, false);
  } finally { globalThis.confirm = realConfirm; }
});

test('편집기 업로드 중에는 Esc·바깥 클릭·× 모두 닫지 않고 이유를 알린다(편집기 규칙이 이긴다)', () => {
  const {dialogs, api, calls} = setup({editorDirty: true, editorBusy: true});
  const editor = dialogs[1];
  const realConfirm = globalThis.confirm;
  try {
    let asked = 0;
    globalThis.confirm = () => { asked += 1; return true; };
    // 업로드 중에는 더러움 확인조차 묻지 않고 닫지 않는다.
    for (const close of [
      () => { const cancel = {preventDefault() { cancel.prevented = true; }}; editor.listeners.cancel(cancel); return cancel.prevented; },
      () => { editor.listeners.click({target: editor, clientX: 500, clientY: 500}); return editor.open; },
      () => !api.requestClose('editor'),
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
  const {dialogs, api} = setup({editorDirty: false});
  const editor = dialogs[1];
  const opener = {isConnected: true, getClientRects: () => [{}], focusCount: 0, focus() { this.focusCount += 1; }};
  api.noteOpener('editor');
  document.activeElement = opener;
  api.noteOpener('editor');
  editor.open = true;
  assert.equal(api.requestClose('editor'), true, '닫는다');
  editor.listeners.close();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(opener.focusCount, 1, '연 버튼으로 초점이 돌아온다');
});

test('순간 잇기 Esc: 고른 연결이 저장 전이면 한 번 묻는다', () => {
  const {dialogs} = setup({connectionDirty: true});
  const connection = dialogs[3];
  connection.open = true;
  const realConfirm = globalThis.confirm;
  try {
    let asked = 0;
    globalThis.confirm = () => { asked += 1; return false; };
    const cancel = {preventDefault() { cancel.prevented = true; }};
    connection.listeners.cancel(cancel);
    assert.equal(asked, 1, '한 번만 묻는다');
    assert.equal(cancel.prevented, true);
    globalThis.confirm = () => true;
    connection.listeners.cancel({preventDefault() {}});
    assert.equal(connection.open, false, '예를 고르면 닫는다');
  } finally { globalThis.confirm = realConfirm; }
});
