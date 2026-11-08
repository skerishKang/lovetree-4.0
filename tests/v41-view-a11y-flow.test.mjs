// 화면 접근성 어댑터의 Esc 동작 시험 (#231 후속, 2026-11-09).
// 전: view-a11y.mjs 소스를 정규식으로 보던 시험(v41-a11y-views A번).
// 후: applyViewAccessibility를 가짜 문서로 띄우고 keydown을 실제로 보내 닫기 버튼 클릭을 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyViewAccessibility } from '../public/v41/view-a11y.mjs';

function fakeNode({ id = '', open = true, closeButton = null, role = 'dialog' } = {}) {
  const attrs = {};
  return {
    id,
    open,
    hidden: false,
    inert: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: (name) => open && name === 'open' },
    getClientRects: () => [{ width: 10, height: 10 }],
    isConnected: true,
    closeButton,
    children: closeButton ? [closeButton] : [],
    querySelector: (sel) => (sel === '.close' ? closeButton : null),
    querySelectorAll: () => (closeButton ? [closeButton] : []),
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    getAttribute(name) { return attrs[name] ?? null; },
    hasAttribute(name) { return name in attrs; },
    focus() {},
    click() { this.clicks = (this.clicks || 0) + 1; }
  };
}

function harness({ detailsOpen = true, topDialog = null } = {}) {
  const closeButton = fakeNode({ id: 'detailClose' });
  const detail = fakeNode({ id: 'detail', open: detailsOpen, closeButton });
  const topNode = fakeNode({ id: topDialog || 'viewer', closeButton: fakeNode({ id: 'viewerClose' }) });
  const keydown = [];
  const listeners = {};
  const doc = {
    documentElement: { dataset: {} },
    body: fakeNode({ id: 'body' }),
    head: { append() {}, appendChild() {} },
    activeElement: null,
    createElement: () => ({ set textContent(v) { this._t = v; }, get textContent() { return this._t; }, style: {}, dataset: {} }),
    querySelector(sel) {
      if (sel === '#detail') return detailsOpen ? detail : null;
      if (topDialog && sel === '#' + topDialog) return topNode;
      return null;
    },
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); if (type === 'keydown') keydown.push(fn); }
  };
  const win = { addEventListener() {}, getComputedStyle: () => ({ getPropertyValue: () => '' }), matchMedia: () => ({ matches: false }) };

  const saved = { MutationObserver: globalThis.MutationObserver, setTimeout: globalThis.setTimeout };
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  applyViewAccessibility(doc, win);

  const restore = () => {
    globalThis.MutationObserver = saved.MutationObserver;
  };
  const pressEscape = () => {
    const event = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of keydown) fn(event);
    return event;
  };
  const press = (event) => { for (const fn of keydown) fn(event); return event; };
  return { detail, closeButton, topNode, pressEscape, press, restore, keydownCount: () => keydown.length };
}

test('상세 패널에서 Esc를 누르면 화면의 닫기 버튼을 누른다(같은 닫기 경로)', () => {
  const h = harness();
  try {
    assert.ok(h.keydownCount() >= 1, 'keydown 감시를 건다');
    const event = h.pressEscape();
    assert.equal(h.closeButton.clicks, 1, '닫기 버튼이 눌린다');
    assert.equal(event.defaultPrevented, true, '브라우저 기본 동작은 막는다');
  } finally { h.restore(); }
});

test('위에 다른 대화상자가 열려 있으면 상세 패널을 닫지 않는다', () => {
  const h = harness({ topDialog: 'viewer' });
  try {
    const event = h.pressEscape();
    assert.equal(h.closeButton.clicks, undefined, '상세 패널 닫기 버튼을 누르지 않는다');
    assert.equal(h.topNode.closeButton.clicks, undefined, '위 대화상자도 이 감시가 닫지 않는다(그 대화상자 몫)');
    assert.equal(event.defaultPrevented, false);
  } finally { h.restore(); }
});

test('상세 패널이 없으면 Esc는 아무것도 하지 않는다(다른 대화상자를 건드리지 않는다)', () => {
  const h = harness({ detailsOpen: false });
  try {
    const event = h.pressEscape();
    assert.equal(h.closeButton.clicks, undefined, '닫기 버튼을 누르지 않는다');
    assert.equal(event.defaultPrevented, false);
  } finally { h.restore(); }
});

test('이미 처리된 Esc(defaultPrevented)와 다른 키는 건드리지 않는다', () => {
  const h = harness();
  try {
    h.press({ key: 'Escape', defaultPrevented: true, preventDefault() {} });
    assert.equal(h.closeButton.clicks, undefined, '앞에서 처리한 Esc는 다시 닫지 않는다');
    h.press({ key: 'Enter', defaultPrevented: false, preventDefault() {} });
    assert.equal(h.closeButton.clicks, undefined, 'Esc가 아니면 닫지 않는다');
  } finally { h.restore(); }
});
