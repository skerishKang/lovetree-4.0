import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyViewAccessibility, FOCUSABLE} from '../public/v41/view-a11y.mjs';

// #325: 사진·미디어 순간 카드의 중첩 버튼과 정원 '불러오기' 버튼 대비.
// 동작은 applyViewAccessibility를 가짜 문서로 직접 불러 확인하고, CSS 값만 글자로 본다.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const identity = read('public/v41/identity.css');

function fakePiece({id, hasFocusable}) {
  const attrs = new Map();
  const classes = new Set();
  const listeners = {};
  return {
    dataset: {moment: id},
    tabIndex: undefined,
    classList: {add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name), toggle() {}},
    classes,
    attrs,
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    removeAttribute(name) { attrs.delete(name); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    listeners,
    prepend(child) { this.prepended = child; },
    querySelector(selector) {
      if (selector === FOCUSABLE) return hasFocusable ? {tag: 'BUTTON'} : null;
      if (selector === '.lt-a11y-open') return this.prepended || null;
      return null;
    },
    click() { this.clicks = (this.clicks || 0) + 1; }
  };
}

function fakeLens() {
  const attrs = new Map();
  return {
    attrs,
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; }
  };
}

function harness() {
  const mediaPiece = fakePiece({id: 'photo-moment', hasFocusable: true});
  const plainPiece = fakePiece({id: 'note-moment', hasFocusable: false});
  const lens = fakeLens();
  const mobileLens = fakeLens();
  const opened = [];
  let created = null;

  const doc = {
    documentElement: {dataset: {}},
    body: {append() {}},
    head: {append() {}},
    activeElement: null,
    createElement(tag) {
      if (tag === 'style') { created = {tag, id: '', textContent: ''}; return created; }
      const element = {
        tagName: String(tag).toUpperCase(), type: '', className: '', textContent: '', listeners: {},
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
      };
      return element;
    },
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === '#book [data-moment],#mobilePage [data-moment]') return [mediaPiece, plainPiece];
      if (selector === '#lens,#mobileInspect') return [lens, mobileLens];
      return [];
    },
    getElementById: () => null,
    addEventListener() {}
  };
  const win = {showDetail: (id) => opened.push(id), getComputedStyle: () => ({getPropertyValue: () => ''})};
  const saved = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  try {
    applyViewAccessibility(doc, win);
  } finally {
    globalThis.MutationObserver = saved;
  }
  return {mediaPiece, plainPiece, lens, mobileLens, opened, style: created};
}

test('사진·미디어 순간 카드는 role=button이 아니고, 키보드로 열 실제 버튼을 안에 둔다 (#325)', () => {
  const {mediaPiece, opened} = harness();
  assert.equal(mediaPiece.getAttribute('role'), null, '중첩 상호작용이 되지 않게 래퍼는 버튼이 아니다');
  assert.equal(mediaPiece.tabIndex, undefined, '래퍼에 탭 정지를 만들지 않는다');
  assert.equal(mediaPiece.classes.has('lt-a11y-focusable'), false);
  assert.ok(mediaPiece.prepended, '카드 맨 앞에 열기 버튼이 있어야 한다');
  assert.equal(mediaPiece.prepended.className, 'lt-a11y-open');
  assert.equal(mediaPiece.prepended.textContent, '순간 열기');
  const click = mediaPiece.prepended.listeners.click?.[0];
  assert.equal(typeof click, 'function');
  click();
  assert.deepEqual(opened, ['photo-moment'], '열기 버튼은 상세를 연다(#202 의도 유지)');
});

test('일반 순간 카드는 지금처럼 role=button·탭 정지·Enter/Space 열기를 유지한다', () => {
  const {plainPiece, opened} = harness();
  assert.equal(plainPiece.getAttribute('role'), 'button');
  assert.equal(plainPiece.tabIndex, 0);
  assert.equal(plainPiece.classes.has('lt-a11y-focusable'), true);
  const keydown = plainPiece.listeners.keydown?.[0];
  assert.equal(typeof keydown, 'function');
  keydown({key: 'a', preventDefault() {}});
  assert.deepEqual(opened, []);
  keydown({key: 'Enter', preventDefault() {}});
  keydown({key: ' ', preventDefault() {}});
  assert.deepEqual(opened, ['note-moment', 'note-moment']);
});

test('돋보기 복제본은 포커스·낭독 대상에서 빠진다(inert)', () => {
  const {lens, mobileLens} = harness();
  assert.equal(lens.getAttribute('inert'), '');
  assert.equal(mobileLens.getAttribute('inert'), '');
});

test('열기 버튼은 숨김 상태로 있다가 키보드 포커스에서만 보인다', () => {
  const {style} = harness();
  assert.match(style.textContent, /\.lt-a11y-open\{position:absolute!important;width:1px!important/);
  assert.match(style.textContent, /\.lt-a11y-open:focus-visible\{position:static!important/);
  assert.match(style.textContent, /\.lt-a11y-open:focus-visible[^}]*outline|\.lt-a11y-focusable:focus-visible,\.lt-a11y-open:focus-visible/);
});

function channel(value) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('정원의 불러오기 버튼은 기존 토큰으로 4.5:1을 넘고, 밤 규칙은 그대로다 (#325)', () => {
  assert.match(identity, /\.lt-media-body button\{[^}]*color:var\(--lt-pearl\)/, '밤 기본 규칙은 그대로다');
  assert.match(identity, /html\[data-lt-theme=garden\] \.lt-media-body button\{color:var\(--lt-paper\)\}/, '정원만 종이색 글자로 덮는다');
  const rule = identity.match(/html\[data-lt-theme=garden\] \.lt-media-body button\{[^}]*\}/)[0];
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(rule), false, '새 hex 색을 쓰지 않는다');
  const gardenPaper = '#fffdf8'; // identity.css 정원 --lt-paper
  const buttonGround = '#1a1620'; // identity.css .lt-media-body button 배경
  assert.ok(contrast(gardenPaper, buttonGround) >= 4.5, `${gardenPaper} on ${buttonGround} = ${contrast(gardenPaper, buttonGround).toFixed(2)}:1`);
  assert.ok(contrast('#403536', buttonGround) < 4.5, '고치기 전 정원 잉크 값은 기준 미달이었다');
});
