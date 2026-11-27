import test from 'node:test';
import assert from 'node:assert/strict';
import {createTreeMenu} from '../public/v41/shell/tree-menu.mjs';
import {MSG} from '../public/v41/frame-messages.mjs';

function makeHarness() {
  const savedWidth = globalThis.innerWidth;
  globalThis.innerWidth = 390;
  const messages = [];
  const listeners = new Map();
  const frameDoc = {addEventListener() {}};
  const frame = {
    hidden: false, inert: false, contentDocument: frameDoc,
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({left: 100, top: 40, right: 300, bottom: 400}),
    addEventListener() {}
  };
  const frameWin = {
    frameElement: frame, addEventListener() {},
    postMessage(data) { messages.push(data); }
  };
  frame.contentWindow = frameWin;
  const doc = {
    getElementById: id => id === 'view' ? frame : null,
    querySelectorAll: () => [], addEventListener() {}
  };
  const positions = new Map();
  const popover = {
    hidden: true, dataset: {}, innerHTML: '',
    style: {setProperty: (name, value) => positions.set(name, value)},
    classList: {add() {}},
    setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => []
  };
  const win = {
    LT41: {tree: {id: 't1'}},
    addEventListener: (name, listener) => listeners.set(name, listener)
  };
  const menu = createTreeMenu({
    document: doc, window: win, location: {origin: 'https://example.test'},
    treePopover: popover, source: 'server', current: 'track32-bookshelf.html',
    member: {snapshot: () => ({owned: true, writable: true})},
    model: {trees: []}, cleanupAvailable: () => false,
    thumbnailCandidates: () => [], displayTreeTitle: text => text,
    coverModeOf: () => 'image', normalizeCoverDesign: () => ''
  });
  return {
    frame, frameWin, win, popover, positions, messages, listeners, menu,
    restore() {
      if (savedWidth === undefined) delete globalThis.innerWidth;
      else globalThis.innerWidth = savedWidth;
    }
  };
}

test('#1568 트리 고르기: 직접 전달의 종류와 사각형을 검사하고 잘못된 자료를 무시한다', () => {
  const h = makeHarness();
  try {
    const valid = {type: MSG.toolbarTreePicker, via: 'mouse', rect: {left: 5, top: 2, right: 35, bottom: 27}};
    const bad = [
      null, undefined, 12, 'wrong', [], {}, {rect: valid.rect},
      {...valid, type: 'other'},
      {...valid, rect: undefined},
      {...valid, rect: []},
      {...valid, rect: {left: 5, bottom: 27}},
      {...valid, rect: {...valid.rect, left: '5'}},
      {...valid, rect: {...valid.rect, right: Number.POSITIVE_INFINITY}},
      {...valid, rect: {...valid.rect, bottom: Number.NaN}},
      {...valid, rect: {...valid.rect, right: 4}},
      {...valid, rect: {...valid.rect, bottom: 1}}
    ];
    for (const data of bad) {
      assert.doesNotThrow(() => h.win.LT41_OPEN_TREE_PICKER(h.frameWin, data));
      assert.equal(h.popover.hidden, true, '잘못된 요청으로 메뉴가 열리지 않는다');
    }
    const wrongSource = {...h.frameWin, frameElement: h.frame};
    h.win.LT41_OPEN_TREE_PICKER(wrongSource, valid);
    assert.equal(h.popover.hidden, true, '활성 프레임 이외의 출처를 거부한다');
    h.frameWin.frameElement = {};
    h.win.LT41_OPEN_TREE_PICKER(h.frameWin, valid);
    assert.equal(h.popover.hidden, true, '호출 창의 프레임 요소가 다르면 거부한다');
    h.frameWin.frameElement = h.frame;
    h.win.LT41_OPEN_TREE_PICKER(h.frameWin, valid);
    assert.equal(h.popover.hidden, false, '올바른 직접 전달은 메뉴를 연다');
    assert.equal(h.positions.get('--lt-picker-left'), '105px');
    assert.equal(h.positions.get('--lt-picker-top'), '73px');
    for (const data of bad) {
      h.win.LT41_OPEN_TREE_PICKER(h.frameWin, data);
      assert.equal(h.popover.hidden, false, '잘못된 요청으로 열린 메뉴가 닫히지도 않는다');
    }
    h.menu.closeTreeMenu();
    h.listeners.get('message')({origin: 'https://example.test', source: h.frameWin, data: valid});
    assert.equal(h.popover.hidden, false, '메시지 경로도 올바른 자료를 허용한다');
  } finally {
    h.restore();
  }
});
