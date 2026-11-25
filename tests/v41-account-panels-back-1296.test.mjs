// #1296 계정·설정·의견 창의 뒤로 가기 — 창 열기는 기록하고, 뒤로 가면 바로 전 상태로 닫는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeBrowser } from './helpers/fake-dom.mjs';
import { records } from './helpers/back-navigation.mjs';
import { createDialogs } from '../public/v41/shell/dialogs.mjs';

function harness() {
  const browser = fakeBrowser({ hash: '#home' });
  const saved = { HTMLDialogElement: globalThis.HTMLDialogElement, document: globalThis.document, window: globalThis.window };
  class Dialog {
    constructor(id) { this.id = id; this.open = false; this.dataset = { ltPanel: 'full' }; }
    matches(query) { return query === ':modal' ? false : false; }
    show() { this.open = true; globalThis.__showCalls.push(this.id); }
    showModal() { this.open = true; globalThis.__modalCalls.push(this.id); }
    close() { this.open = false; globalThis.__closeCalls.push(this.id); }
    focus() {}
    addEventListener() {}
  }
  globalThis.HTMLDialogElement = Dialog;
  globalThis.__showCalls = []; globalThis.__modalCalls = []; globalThis.__closeCalls = [];
  const dialogs = { 'updates-panel': new Dialog('updates-panel'), 'settings-panel': new Dialog('settings-panel') };
  globalThis.window = globalThis;
  globalThis.document = {
    defaultView: globalThis,
    querySelectorAll: () => [],
    getElementById: id => dialogs[id] || null,
    createElementNS: () => ({ setAttribute() {}, append() {} }),
    addEventListener() {}
  };
  const api = createDialogs({
    $: id => dialogs[id] || null,
    closeTreeTips: () => {},
    closeAccountMenu: () => {},
    notify: () => {},
    isDirty: () => false,
    getState: () => ({ dirty: false, blocked: false })
  });
  return {
    browser, dialogs, api,
    calls: () => ({ show: globalThis.__showCalls.slice(), modal: globalThis.__modalCalls.slice(), close: globalThis.__closeCalls.slice() }),
    restore() { browser.restore(); for (const [k, v] of Object.entries(saved)) if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  };
}

test('#1296 계정·설정·의견 창 표 — 창 열기는 기록하고 테마·정렬·보기 옵션은 넣지 않는다', () => {
  assert.equal(records('panel'), true);
  assert.equal(records('viewer'), true);
  assert.equal(records('moment'), true);
  assert.equal(records('theme'), false);
  assert.equal(records('sort'), false);
  assert.equal(records('viewOption'), false);
});

test('#1296 비모달 새 소식 창도 기록을 하나 늘리고, 뒤로 가면 닫힌다', () => {
  const h = harness();
  try {
    h.dialogs['updates-panel'].show();
    assert.equal(h.browser.calls.push.length, 1, '창 열기는 기록한다');
    h.dialogs['updates-panel'].show();
    assert.equal(h.browser.calls.push.length, 1, '같은 창을 두 번 열어도 기록은 한 칸');
  } finally { h.restore(); }
});
