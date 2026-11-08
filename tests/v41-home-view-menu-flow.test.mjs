// 첫 화면 "보기 ▾" 메뉴 함수 시험 (#231 후속, 2026-11-11).
// 전: v41/home.js 인라인 배선을 정규식으로 보던 시험(v41-home-view-menu 14건 + orbit·dataset 2건).
// 후: public/v41/home-view-menu.mjs의 createViewMenu를 가짜 shadowRoot로 띄우고
//     버튼 클릭·키보드·바깥 클릭·저장값·lt41-theme 메시지를 실제로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEl } from './helpers/fake-dom.mjs';
import { createViewMenu } from '../public/v41/home-view-menu.mjs';

function fakeMenuRoot(extra = {}) {
  return fakeEl({children: [], attrs: {}, ...extra});
}

// 메뉴가 만드는 요소는 children 배열에 쌓이고, querySelector가 그 안에서 찾는다.
function fakeCreatingDoc() {
  const doc = fakeEl({
    activeElement: null,
    created: [],
    createElement(tag) {
      const el = fakeEl({tag});
      el.children = [];
      el.replaceChildren = () => { el.children = []; };
      el.append = (...nodes) => { el.children.push(...nodes); };
      el.querySelectorAll = (sel) => (sel.includes('menuitem')
        ? (el.children || []).filter((child) => /^menuitem/.test(child.getAttribute('role') || ''))
        : []);
      el.focus = () => { el.focused = true; doc.activeElement = el; };
      el.click = () => {
        el.clicks = (el.clicks || 0) + 1;
        doc.activeElement = el;
        el.onclick?.();
      };
      doc.created.push(el);
      return el;
    },
    listeners: {},
    addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); },
    removeAttribute() {}
  });
  return doc;
}

function menuHarness({theme = 'night', paused = false, cardsMode = 'mix', loggedIn = true, motionToggle = true} = {}) {
  const doc = fakeCreatingDoc();
  const topActions = fakeCreatingDoc().createElement('div');
  const shadow = fakeEl({querySelector: (sel) => (sel === '.top-actions' ? topActions : null)});
  const state = {theme, cardsMode, paused, loggedIn, motionToggle};
  const calls = {themes: [], motions: 0, reloads: 0, storage: {}};
  const menu = createViewMenu({
    document: doc,
    shadow,
    storage: calls.storage,
    readTheme: () => state.theme,
    writeTheme: (storage, value) => { state.theme = value; calls.storage['lt41.theme'] = value; return value; },
    applyTheme: () => {},
    clickWithin: (event, wrap) => event?.inside === wrap,
    getCardsMode: () => state.cardsMode,
    isLoggedIn: () => state.loggedIn,
    getMotion: () => ({get paused() { return state.paused; }, toggle() { calls.motions += 1; state.paused = !state.paused; return state.paused; }}),
    sendTheme: (value) => calls.themes.push(value),
    writeCardsMode: (storage, value) => { state.cardsMode = value; calls.cards = value; },
    reload: () => { calls.reloads += 1; }
  });
  const item = (name) => items().find((b) => b.dataset.ltViewItem === name);
  const items = () => menu.menu.children.filter((b) => /^menuitem/.test(b.getAttribute('role') || ''));
  const press = (key, target = menu.menu) => {
    const event = {key, preventDefault() { this.prevented = true; }};
    target.dispatch('keydown', event);
    return event;
  };
  return {doc, shadow, topActions, menu, state, calls, item, items, press};
}

test('보기 버튼은 메뉴를 열고 닫으며 aria 상태를 함께 바꾼다', () => {
  const h = menuHarness();
  assert.equal(h.menu.button.textContent, '보기 ▾');
  assert.equal(h.menu.button.dataset.ltViewMenu, '', '도구 줄에서 이 버튼을 알아볼 표식');
  assert.equal(h.menu.button.getAttribute('aria-haspopup'), 'menu');
  assert.equal(h.menu.button.getAttribute('aria-expanded'), 'false');
  assert.equal(h.menu.button.getAttribute('aria-controls'), 'home-view-menu');
  assert.equal(h.menu.menu.id, 'home-view-menu');
  assert.equal(h.menu.menu.getAttribute('role'), 'menu');
  assert.equal(h.menu.menu.hidden, true);
  assert.equal(h.topActions.children.at(-1), h.menu.element, '도구 줄(.top-actions) 끝에 붙는다');

  h.menu.button.onclick();
  assert.equal(h.menu.menu.hidden, false, '한 번 누르면 열린다');
  assert.equal(h.menu.button.getAttribute('aria-expanded'), 'true');
  assert.ok(h.doc.activeElement, '열면 항목에 초점이 간다');
  h.menu.button.onclick();
  assert.equal(h.menu.menu.hidden, true, '다시 누르면 닫힌다');
  assert.equal(h.menu.button.getAttribute('aria-expanded'), 'false');
});

test('표: 메뉴 항목은 묶음 순서대로 만들어지고 aria-checked·역할·값 표식이 붙는다', () => {
  const h = menuHarness({theme: 'garden', cardsMode: 'popular', loggedIn: true});
  h.menu.openViewMenu();
  const rows = h.items().map((b) => ({
    value: b.dataset.ltViewItem,
    role: b.getAttribute('role'),
    checked: b.getAttribute('aria-checked'),
    label: b.textContent,
    tabIndex: b.tabIndex
  }));
  assert.deepEqual(rows.map((r) => r.label), ['움직임 멈춤', '밤', '정원', '예시', '인기', '내 것만', '섞어서']);
  assert.deepEqual(rows.map((r) => r.value), ['motion:off', 'theme:night', 'theme:garden', 'cards:example', 'cards:popular', 'cards:mine', 'cards:mix']);
  assert.deepEqual(rows.map((r) => r.role), ['menuitemcheckbox', 'menuitemradio', 'menuitemradio', 'menuitemradio', 'menuitemradio', 'menuitemradio', 'menuitemradio']);
  assert.deepEqual(rows.filter((r) => r.checked === 'true').map((r) => r.label), ['정원', '인기'], '지금 고른 테마·카드 출처만 켜진다');
  assert.ok(rows.every((r) => r.tabIndex === -1), '메뉴 항목은 Tab 순서에서 빠지고 화살표로만 이동한다');
  assert.equal(h.menu.menu.children.filter((c) => c.className === 'view-menu-sep').length, 2, '세 묶음 사이 구분선 둘');
  assert.ok(h.menu.menu.children.filter((c) => c.className === 'view-menu-sep').every((sep) => sep.getAttribute('role') === 'separator'));
});

test('로그아웃 메뉴에는 카드 출처가 다섯 항목으로 줄어든다', () => {
  const h = menuHarness({loggedIn: false, cardsMode: 'mine'});
  h.menu.openViewMenu();
  assert.equal(h.items().length, 5, '움직임 1 + 테마 2 + 카드 2');
  assert.deepEqual(h.items().map((b) => b.textContent), ['움직임 멈춤', '밤', '정원', '예시', '인기']);
  const checked = h.items().filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent);
  assert.deepEqual(checked.sort(), ['밤', '예시'].sort(), '로그아웃에서 "내 것만" 저장값은 예시로 떨어진다');
});

test('메뉴를 열면 지금 고른 카드 출처 항목에 초점이 간다', () => {
  const h = menuHarness({cardsMode: 'popular'});
  h.menu.openViewMenu();
  assert.equal(h.doc.activeElement.dataset.ltViewItem, 'cards:popular');
  const out = menuHarness({loggedIn: false});
  out.menu.openViewMenu();
  assert.equal(out.doc.activeElement.dataset.ltViewItem, 'cards:example', '로그아웃은 예시 항목');
});

test('키보드 표: 화살표는 순환하고 Home/End·Enter·Space·Esc가 각자 일을 한다', () => {
  const h = menuHarness();
  // ArrowDown/ArrowUp은 버튼에서 메뉴를 연다.
  assert.equal(h.press('ArrowDown', h.menu.button).prevented, true);
  assert.equal(h.menu.menu.hidden, false);
  assert.equal(h.press('Escape', h.menu.button).prevented, undefined, '버튼의 Esc는 막지 않고 닫기만 한다');
  assert.equal(h.menu.menu.hidden, true);

  h.menu.openViewMenu();
  const items = h.items();
  h.doc.activeElement = items[0];
  h.press('ArrowDown');
  assert.equal(h.doc.activeElement, items[1], 'ArrowDown 다음 항목');
  h.press('ArrowUp');
  assert.equal(h.doc.activeElement, items[0], 'ArrowUp 이전 항목');
  h.press('End');
  assert.equal(h.doc.activeElement, items.at(-1), 'End 마지막 항목');
  h.press('ArrowDown');
  assert.equal(h.doc.activeElement, items[0], '마지막에서 ArrowDown은 처음으로 순환');
  h.press('Home');
  assert.equal(h.doc.activeElement, items[0], 'Home 처음 항목');

  const event = h.press('Enter');
  assert.equal(event.prevented, true, 'Enter는 기본 동작을 막고 실행한다');
  assert.equal(h.calls.motions, 1, '초점이 간 움직임 항목이 실행된다');
  assert.equal(h.menu.menu.hidden, true, '실행하면 메뉴가 닫힌다');
  assert.equal(h.menu.button.focused, true, '닫을 때 보기 버튼으로 초점이 돌아온다');
});

test('메뉴 선택: 움직임 토글·테마 저장+lt41-theme·카드 출처 저장+새로고침', () => {
  const h = menuHarness({theme: 'night'});
  h.menu.openViewMenu();
  h.item('motion:off').click();
  assert.equal(h.calls.motions, 1);
  assert.equal(h.menu.motionPaused(), true, '궤도의 멈춤 상태를 그대로 뒤집는다');

  h.menu.openViewMenu();
  h.item('theme:garden').click();
  assert.equal(h.calls.storage['lt41.theme'], 'garden', '테마는 lt41.theme에 저장');
  assert.deepEqual(h.calls.themes, ['garden'], '셸에도 lt41-theme 메시지로 알린다');
  assert.equal(h.menu.menu.hidden, true);
  assert.equal(h.menu.button.focused, true);

  h.menu.openViewMenu();
  h.item('cards:popular').click();
  assert.equal(h.calls.cards, 'popular', '카드 출처 저장');
  assert.equal(h.calls.reloads, 1, '카드 출처는 저장 뒤 새로고침한다');
});

test('바깥 클릭은 닫고, 메뉴 안 클릭은 닫지 않는다', () => {
  const h = menuHarness();
  h.menu.openViewMenu();
  h.doc.listeners.click[0]({inside: h.menu.element});
  assert.equal(h.menu.menu.hidden, false, '안쪽 클릭은 그대로');
  h.doc.listeners.click[0]({inside: {}});
  assert.equal(h.menu.menu.hidden, true, '바깥 클릭이면 닫는다');
});

test('이미 닫힌 메뉴를 다시 닫아도 초점을 건드리지 않는다', () => {
  const h = menuHarness();
  h.menu.closeViewMenu(true);
  assert.equal(h.menu.button.focused, false, '닫힌 상태에서는 초기화하지 않는다');
  h.menu.openViewMenu();
  h.menu.closeViewMenu();
  assert.equal(h.menu.button.focused, false, 'refocus=false면 초점은 그대로');
});
