import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../public/v41/views/board/' + file, import.meta.url), 'utf8');
const wiringSource = read('board-wiring.js');
const filtersSource = read('board-filters.js');
const extrasSource = read('board-extras.js');
const html = readFileSync(new URL('../public/v41/views/track58-pinboard.html', import.meta.url), 'utf8');

function makeNode(id = '') {
  const handlers = new Map(), classes = new Set(), attributes = new Map();
  const node = {
    id, handlers, dataset: {}, value: '', textContent: '',
    childNodes: [], children: [],
    classList: {
      contains: name => classes.has(name),
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : !!force;
        if (on) classes.add(name); else classes.delete(name);
        return on;
      }
    },
    addEventListener(type, callback) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(callback);
    },
    fire(type, target = node, key) {
      for (const callback of handlers.get(type) || []) callback({ target, key, preventDefault() {} });
    },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    closest(selector) { return selector === '.keywordBtn' && classes.has('keywordBtn') ? node : null; },
    appendChild(child) { node.children.push(child); node.childNodes.push(child); return child; },
    querySelectorAll(selector) {
      if (selector === '.keywordBtn') return node.children.filter(child => child.classList.contains('keywordBtn') || child.className?.split(/\s+/).includes('keywordBtn'));
      return [];
    }
  };
  return node;
}

function countHandlers(nodes) {
  return nodes.reduce((sum, node) => sum + [...node.handlers.values()].reduce((n, list) => n + list.length, 0), 0);
}
test('#1538 배선: 한 번 누르면 한 번만 처리하고 같은 요소에 두 번 등록하지 않는다', () => {
  const ids = ['dConn','closeChooser','nextChooser','nextChoices','nextMoment','prevMoment',
    'mediaFilter','keywordFilter','themeGrid','defaultPin','defaultCard','leftCollapse',
    'mobileTools','leftPanel','detail','toolCinema','toolFit'];
  const nodes = new Map(ids.map(id => [id, makeNode(id)]));
  const $ = selector => nodes.get(selector.slice(1));
  const document = makeNode('document');
  const theme1 = makeNode('theme1'), theme2 = makeNode('theme2');
  theme1.dataset.theme = 'pearl'; theme1.textContent = '진주';
  theme2.dataset.theme = 'garden'; theme2.textContent = '정원';
  document.body = { dataset: {} };
  document.querySelectorAll = selector => selector === '.themeBtn' ? [theme1, theme2] : [];
  const calls = [];
  const c = { id: 'c1', a: 'a', b: 'b' };
  const context = {
    window: {}, document, $, innerWidth: 390, connections: [c],
    defaultPinStyle: 'pearl', defaultCardStyle: 'photo',
    moveViaConnection: x => calls.push('move:' + x.id),
    pulseConnection(x, after) { calls.push('pulse:' + x.id); after?.(); },
    focusBoardMoment: id => calls.push('focus:' + id),
    chooseNext: direction => calls.push('choose:' + direction),
    closeChooser: () => calls.push('close'),
    applyFilters: () => calls.push('filters'),
    paintThemeBadge: () => calls.push('badge'),
    toast: text => calls.push('toast:' + text),
    pushBoardPanel: name => calls.push('panel:' + name),
    startCinemaV11: start => calls.push('cinema:' + start),
    fitAll: fromUser => calls.push('fit:' + fromUser)
  };
  vm.runInNewContext(wiringSource, context);
  const wiring = context.window.LT58Board.wiring;
  const all = [...nodes.values(), document];
  assert.equal(countHandlers(all), 16, '등록형 핸들러 16개');
  wiring.bindBoardEvents();
  wiring.bindBoardEvents();
  vm.runInNewContext(wiringSource, context);
  context.window.LT58Board.wiring.bindBoardEvents();
  assert.equal(countHandlers(all), 16, '같은 문서에서 재등록·스크립트 재실행에도 핸들러가 늘지 않는다');
  const send = (id, type, target, expected) => {
    const start = calls.length;
    $( '#' + id).fire(type, target);
    assert.deepEqual(calls.slice(start), expected, id + ' 단일 조작이 단 한 번 처리된다');
  };
  const child = (selector, data = {}) => {
    const target = { dataset: data, textContent: data.text || '' };
    target.closest = query => query === selector ? target : null;
    return target;
  };
  send('dConn', 'click', child('.connCard', { cid: 'c1', dir: 'next' }), ['move:c1']);
  send('dConn', 'click', child('.connCard', { cid: 'c1', dir: 'prev' }), ['pulse:c1','focus:a']);
  send('closeChooser', 'click', undefined, ['close']);
  $('#nextChooser').classList.add('open');
  let start = calls.length;
  document.fire('keydown', undefined, 'Escape');
  assert.deepEqual(calls.slice(start), ['close'], 'Esc는 한 번만 닫는다');
  send('nextChoices', 'click', child('.routeChoice', { cid: 'c1', dir: 'next' }), ['move:c1']);
  send('nextChoices', 'click', child('.routeChoice', { cid: 'c1', dir: 'prev' }), ['pulse:c1','focus:a']);
  send('nextMoment', 'click', undefined, ['choose:next']);
  send('prevMoment', 'click', undefined, ['choose:prev']);
  send('mediaFilter', 'change', undefined, ['filters']);
  send('keywordFilter', 'change', undefined, ['filters']);
  send('themeGrid', 'click', child('.themeBtn', { theme: 'garden', text: '정원' }), ['badge','toast:정원 테마로 바꿨어요.']);
  assert.equal(document.body.dataset.theme, 'garden');
  $('#defaultPin').value = 'heart';
  $('#defaultCard').value = 'memo';
  send('defaultPin', 'change', undefined, []);
  send('defaultCard', 'change', undefined, []);
  assert.equal(context.defaultPinStyle, 'heart');
  assert.equal(context.defaultCardStyle, 'memo');
  send('leftCollapse', 'click', undefined, ['panel:tools']);
  assert.equal($('#leftPanel').classList.contains('mobileOpen'), true);
  assert.equal($('#mobileTools').getAttribute('aria-expanded'), 'true');
  send('leftCollapse', 'click', undefined, []);
  assert.equal($('#leftPanel').classList.contains('mobileOpen'), false);
  assert.equal($('#mobileTools').getAttribute('aria-expanded'), 'false');
  send('mobileTools', 'click', undefined, ['panel:tools']);
  assert.equal($('#mobileTools').getAttribute('aria-expanded'), 'true');
  send('toolCinema', 'click', undefined, ['cinema:0']);
  send('toolFit', 'click', undefined, ['fit:true']);
});

test('#1538 거르기: 꼬리표 선택·추가는 재배선해도 한 번만 반영한다', () => {
  const box = makeNode('editKeywordPicker');
  const add = makeNode('editAddKeyword');
  const input = makeNode('editCustomKeyword');
  const chip = makeNode('old-chip');
  chip.dataset.key = '기존';
  chip.classList.add('keywordBtn');
  box.appendChild(chip);
  const nodes = new Map([[box.id,box],[add.id,add],[input.id,input]]);
  const scope = {
    window: {}, $: selector => nodes.get(selector.slice(1)),
    document: { createElement: tag => { assert.equal(tag, 'button'); return makeNode('new-chip'); } },
    LT_KEYWORDS: ['기존'],
    LT58Model: { collectPath: () => ({ ids: [], cons: [] }) }
  };
  vm.runInNewContext(filtersSource, scope);
  assert.equal(typeof scope.window.LT58Board.filters.applyFilters, 'function');
  let old = 0, current = 0;
  scope.window.bindKeywordPicker('edit', () => old++);
  scope.window.bindKeywordPicker('edit', () => current++);
  scope.window.bindKeywordPicker('edit', () => current++);
  vm.runInNewContext(filtersSource, scope);
  scope.window.bindKeywordPicker('edit', () => current++);
  assert.equal(countHandlers([box,add]), 2, '재등록·스크립트 재실행에도 꼬리표·추가 리스너 두 개만 등록');
  box.fire('click', chip);
  assert.equal(chip.classList.contains('on'), true);
  assert.equal(current, 1);
  assert.equal(old, 0, '낡은 갱신 함수는 실행되지 않는다');
  input.value = '새로운';
  add.fire('click');
  assert.equal(current, 2);
  assert.equal(box.querySelectorAll('.keywordBtn').length, 2);
  assert.equal(input.value, '');
  assert.equal(box.querySelectorAll('.keywordBtn')[1].dataset.key, '새로운');
});

test('#1538 함수 12개·문서 배치·QA 캡처 경계를 보존한다', () => {
  const moved = ['pulseConnection','moveViaConnection','chooseNext','closeChooser','highlightPath',
    'highlightPathFromConnection','applyPathHighlight','updateKeywordFilter','applyFilters',
    'tagChipText','keywordPickerHTML','bindKeywordPicker'];
  assert.equal(moved.length, 12);
  for (const name of moved) {
    assert.match(filtersSource, new RegExp('function\\s+' + name + '\\s*\\('), name + ' 이동');
    assert.doesNotMatch(extrasSource, new RegExp('function\\s+' + name + '\\s*\\('), name + ' 중복 정의 금지');
  }
  assert.match(filtersSource, /scheduleBoardMoreHint\(\)/, '기존 안내 갱신 유지');
  assert.match(extrasSource, /window\.LT58Board\.filters\.collectPathFrom/, '시네마 경로는 새 필터 경계를 사용');
  assert.match(filtersSource, /Object\.assign\(filters,\s*\{\s*collectPathFrom/, '경로 계산 정본을 새 모듈에서 공개');
  const at = name => html.indexOf('src="/v41/views/board/' + name + '"');
  assert.ok(at('board.js') >= 0 && at('board.js') < at('board-filters.js'));
  assert.ok(at('board-filters.js') < at('board-extras.js'));
  assert.ok(at('board-extras.js') < at('board-detail.js'));
  assert.ok(at('board-detail.js') < at('board-wiring.js'));
  assert.match(extrasSource, /window\.__LT58\s*=\s*\{[\s\S]*?refs:\s*\{\s*moments,\s*connections\s*\}/);
  assert.match(extrasSource, /window\.__LT58V11\s*=/);
  assert.match(read('board-detail.js'), /window\.__LT58V12\s*=/);
});
