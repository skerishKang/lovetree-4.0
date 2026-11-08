// 첫 여정 페이지 함수 시험 (#231 후속, 2026-11-09).
// 전: public/v41/views/first-journey.html 인라인 스크립트를 정규식으로 보던 시험(8건).
// 후: public/v41/views/journey/journey-page.mjs의 createJourneyPage를 가짜 문서로 띄우고
//     셸 메시지·단계 탭·주소 복원·닫기를 실제로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEl } from './helpers/fake-dom.mjs';
import { createJourneyPage } from '../public/v41/views/journey/journey-page.mjs';

const draftStorage = (initial = {}) => {
  const data = {...initial};
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; }
  };
};

function field(name, value = '') {
  const el = fakeEl({name, value, disabled: false});
  el.addEventListener = (type, fn) => { (el.listeners[type] ||= []).push(fn); };
  return el;
}

function pageHarness({hash = '', search = '', embedded = false, stored = null, parentElement = 'frame'} = {}) {
  const storage = draftStorage(stored ? {'lovetree.v41.first-journey': JSON.stringify(stored)} : {});
  const elements = {};
  const created = [];
  const make = (id, extra = {}) => {
    const el = fakeEl({id, children: [], attrs: {}, ...extra});
    el.replaceChildren = () => { el.children = []; };
    el.append = (...nodes) => { el.children.push(...nodes); };
    el.querySelectorAll = (sel) => (sel.includes('[data-pane]') ? (el.children || []).filter((c) => c.dataset?.pane) : []);
    el.focus = () => { doc.activeElement = el; };
    el.closest = () => null;
    elements[id] = el;
    return el;
  };

  const formFields = {
    subject: field('subject'), url: field('url'), note: field('note'), date: field('date'),
    reason: field('reason'), nextUrl: field('nextUrl'), nextReason: field('nextReason')
  };
  const form = make('form', {elements: formFields});
  const steps = make('steps');
  for (let i = 0; i <= 4; i += 1) {
    const li = fakeEl({dataset: {step: String(i)}, classList: fakeEl().classList});
    li.closest = (sel) => (sel === 'li[data-step]' ? li : null);
    steps.children.push(li);
  }
  const panes = [0, 1, 2, 3, 4].map((n) => make(`pane-${n}`, {dataset: {pane: String(n)}}));
  for (const id of ['error', 'eyebrow', 'headline', 'lead', 'finish-note', 'primary', 'skip', 'back',
    'grow-stage', 'grow-kicker', 'grow-count', 'grow-note', 'emotions', 'url-preview', 'next-preview',
    'close', 'restore', 'restore-question', 'restore-yes', 'restore-no', 'subject', 'url', 'reason', 'next-url']) make(id);
  elements.form = form;

  const doc = fakeEl({
    body: fakeEl({dataset: {}}),
    activeElement: null,
    visibilityState: 'visible',
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
      const name = /^\[name="(.+)"\]$/.exec(sel);
      if (name) return formFields[name[1]] || null;
      return null;
    },
    querySelectorAll: (sel) => (sel === '[data-pane]' ? panes : []),
    createElement: (tag) => {
      const el = fakeEl({tag, children: [], dataset: {}, attrs: {}, classList: fakeEl().classList});
      el.append = (...nodes) => { el.children.push(...nodes); };
      el.replaceChildren = () => { el.children = []; };
      el.querySelectorAll = () => [];
      el.focus = () => { doc.activeElement = el; };
      created.push(el);
      return el;
    },
    listeners: {},
    addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); }
  });

  const win = fakeEl({
    parent: embedded ? {postMessage: (msg) => calls.posted.push(msg)} : null,
    scrollTo: () => { calls.scrolled += 1; },
    localStorage: storage,
    listeners: {},
    addEventListener(type, fn) { (win.listeners[type] ||= []).push(fn); },
    LTMedia: undefined
  });
  const calls = {
    posted: [], assigned: [], pushed: [], replaced: [], scrolled: 0,
    journal: []
  };
  const location = {
    origin: 'https://lovetree-4-0.pages.dev',
    search, hash,
    assign: (url) => calls.assigned.push(url)
  };
  const history = {
    state: {lt41Journey: 0},
    pushState: (state, _title, url) => { calls.pushed.push({state, url}); },
    replaceState: (state, _title, url) => { calls.replaced.push({state, url}); }
  };

  const page = createJourneyPage({window: win, document: doc, location, history});
  return {page, doc, win, location, history, storage, calls, elements, formFields, steps, created,
    click: (el) => el.onclick?.(), submit: () => { (form.listeners.submit || []).forEach((fn) => fn({preventDefault() {}})); },
    send: (data) => (win.listeners.message || []).forEach((fn) => fn({origin: location.origin, source: win.parent, data})),
    stepClick: (index) => (steps.listeners.click || []).forEach((fn) => fn({target: steps.children[index]}))};
}

test('셸 안에서는 단계를 알리고 주소를 직접 쓰지 않는다', () => {
  const h = pageHarness({embedded: true, hash: '#journey/00'});
  assert.deepEqual(h.calls.posted.at(-1), {type: 'lt41-journey-step', step: 0}, '처음에 00단계를 알린다');
  h.page.state.step = 2;
  h.page.reportStep();
  assert.deepEqual(h.calls.posted.at(-1), {type: 'lt41-journey-step', step: 2});
  assert.equal(h.calls.pushed.length + h.calls.replaced.length, 0, '셸이 주소를 맡으므로 화면은 기록하지 않는다');
});

test('셸의 단계 복귀 메시지는 입력을 먼저 읽고 그 단계로 간다', () => {
  const h = pageHarness({embedded: true, hash: '#journey/00'});
  h.formFields.subject.value = '적어 둔 이름';
  h.send({type: 'lt41-journey-goto', step: 3});
  assert.equal(h.page.state.step, 3);
  assert.equal(h.page.state.draft.subject, '적어 둔 이름', '되돌아가기 전에 form을 읽어 둔다');
  assert.equal(h.page.state.phase, 'form', '복귀하면 폼 단계다');
});

test('다른 출처·다른 창의 메시지는 무시한다', () => {
  const h = pageHarness({embedded: true, hash: '#journey/00'});
  const before = h.page.state.step;
  (h.win.listeners.message || []).forEach((fn) => fn({origin: 'https://evil.example', source: h.win.parent, data: {type: 'lt41-journey-goto', step: 4}}));
  assert.equal(h.page.state.step, before);
  (h.win.listeners.message || []).forEach((fn) => fn({origin: h.location.origin, source: {}, data: {type: 'lt41-journey-goto', step: 4}}));
  assert.equal(h.page.state.step, before, '다른 창에서 온 메시지도 무시한다');
});

test('셸 안 새로고침(?step=NN)은 보관값이 있으면 그 단계로, 이미 만든 트리 아래로는 내려가지 않는다', () => {
  const stored = {subject: '그날의 무대', url: 'https://example.com/a', step: 1};
  const h = pageHarness({embedded: true, search: '?step=2', stored});
  assert.equal(h.page.state.step, 2, '주소의 단계를 읽는다');

  const made = pageHarness({embedded: true, search: '?step=1', stored: {...stored, savedTreeId: 'tree-1', savedMomentId: 'moment-1'}});
  assert.equal(made.page.state.step, 3, '이미 만든 트리는 성장 단계 아래로 내려가지 않는다');

  const none = pageHarness({embedded: true, search: '?step=3'});
  assert.equal(none.page.state.step, 0, '보관값이 없으면 00부터 시작한다');
});

test('지나온 단계 탭은 그 단계로 돌아가고, 앞 단계·폼 밖에서는 무시한다', () => {
  const h = pageHarness({hash: '#journey/03'});
  h.page.state.step = 3;
  h.page.state.phase = 'form';
  h.stepClick(1);
  assert.equal(h.page.state.step, 1, '이미 지나온 단계로만 돌아간다');
  h.page.state.step = 2;
  h.stepClick(4);
  assert.equal(h.page.state.step, 2, '앞 단계 탭은 무시한다');
  h.page.state.phase = 'bloom';
  h.stepClick(1);
  assert.equal(h.page.state.step, 2, '폼 단계가 아니면 무시한다');
});

test('단독 미리보기: 주소의 단계로 열고, 임시 보관값이 없으면 #journey/NN이어도 00부터', () => {
  const withStored = pageHarness({hash: '#journey/02', stored: {subject: '그날의 무대', url: 'https://example.com/a', step: 2}});
  assert.equal(withStored.page.state.step, 2, '보관값이 있으면 주소 단계로 연다');

  const empty = pageHarness({hash: '#journey/02'});
  assert.equal(empty.page.state.step, 0, '보관값이 없으면 00부터 시작한다');
});

test('단독 미리보기: ?step=NN으로 단계 화면을 연다', () => {
  const h = pageHarness({search: '?step=3'});
  assert.equal(h.page.state.step, 3);
  assert.equal(h.page.state.phase, 'form');
});

test('단독 미리보기: 주소 기록은 #journey/NN 규칙을 따르고 단계마다 깊이를 더한다', () => {
  const h = pageHarness({hash: ''});
  assert.deepEqual(h.calls.replaced.at(-1), {state: {lt41Journey: 0}, url: '#journey/00'}, '처음에는 00을 replace로');
  h.page.state.step = 1;
  h.page.syncHistory('push');
  assert.equal(h.calls.pushed.at(-1).url, '#journey/01');
  assert.equal(h.calls.pushed.at(-1).state.lt41Journey, 1);
  h.page.syncHistory('replace');
  assert.equal(h.calls.replaced.at(-1).url, '#journey/01', 'replace는 깊이를 더하지 않는다');
});

test('닫기: 셸 안이면 메시지, 단독 미리보기면 첫 화면으로 보낸다', () => {
  const embedded = pageHarness({embedded: true, hash: '#journey/00'});
  embedded.click(embedded.elements.close);
  assert.deepEqual(embedded.calls.posted.at(-1), {type: 'lt41-journey-close'});

  const alone = pageHarness({hash: '#journey/00'});
  alone.click(alone.elements.close);
  assert.deepEqual(alone.calls.assigned, ['/v41/'], '단독 미리보기 닫기는 첫 화면');
});
