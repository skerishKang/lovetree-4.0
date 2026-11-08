import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialogs} from '../public/v41/shell/dialogs.mjs';

// #231 1-B 후속: shell/dialogs.mjs를 직접 호출해 Tab 순환·Esc 복귀·포커스 되돌림을 고정한다.

function fakeElement(props = {}) {
  const el = {
    open: false, hidden: false, disabled: false, id: props.id || '',
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

function setup({focusables = [], popoverHidden = true} = {}) {
  const elements = {
    'account-assets': fakeElement({id: 'account-assets'}),
    'editor': fakeElement({id: 'editor'}),
    'account-avatar': fakeElement({id: 'account-avatar'}),
    'account-popover': fakeElement({id: 'account-popover', hidden: popoverHidden}),
    'tree-tips': fakeElement({id: 'tree-tips', hidden: false}),
  };
  elements['editor'].querySelectorAll = () => focusables;
  const dialogs = [fakeElement({id: 'records'}), fakeElement({id: 'editor'}), fakeElement({id: 'tree-manager'})];
  const keydown = [], clicks = [];
  const doc = {
    activeElement: null,
    addEventListener(type, fn) { if (type === 'keydown') keydown.push(fn); else clicks.push([type, fn]); },
    querySelectorAll(sel) { return sel === 'dialog' ? dialogs : []; },
    contains() { return true; },
  };
  const calls = [];
  globalThis.document = doc;
  globalThis.getComputedStyle = () => ({visibility: 'visible'});
  const api = createDialogs({
    $: id => elements[id],
    closeTreeTips: () => calls.push('closeTreeTips'),
    closeAccountMenu: () => calls.push('closeAccountMenu'),
  });
  return {elements, dialogs, keydown, api, calls};
}

function key(extra) {
  const e = {key: 'Tab', shiftKey: false, prevented: false, preventDefault() { e.prevented = true; }, ...extra};
  return e;
}

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

test('바깥 클릭은 대화상자를 닫지만 편집기·책 정보는 실수로 닫지 않는다', () => {
  const {dialogs} = setup();
  const records = dialogs[0], editor = dialogs[1];
  records.open = editor.open = true;
  records.listeners.click({target: records, clientX: 500, clientY: 500});
  assert.equal(records.open, false, '배경 클릭은 닫는다');
  editor.listeners.click({target: editor, clientX: 500, clientY: 500});
  assert.equal(editor.open, true, '편집기는 배경 클릭으로 닫히지 않는다');
  editor.listeners.click({target: {}, clientX: 500, clientY: 500});
  assert.equal(editor.open, true, '안쪽 클릭은 무시한다');
});
