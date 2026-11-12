import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {connectionLabel, filterLabel, isSmallTarget, nodeStep, focusWrap, focusReturnTarget} from '../public/v41/view-a11y.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('connection control name includes its visible count', () => {
  assert.equal(connectionLabel(4), '이어진 선 4개');
  assert.equal(connectionLabel('7'), '이어진 선 7개');
  assert.equal(connectionLabel(undefined), '이어진 선 0개');
});

test('board filter labels name both native selects', () => {
  assert.equal(filterLabel('media'), '미디어 필터');
  assert.equal(filterLabel('keyword'), '키워드 필터');
  assert.equal(filterLabel('other'), '');
});

test('network keyboard navigation wraps and supports Home/End', () => {
  assert.equal(nodeStep(-1, 4, 'ArrowRight'), 0);
  assert.equal(nodeStep(3, 4, 'ArrowRight'), 0);
  assert.equal(nodeStep(0, 4, 'ArrowLeft'), 3);
  assert.equal(nodeStep(2, 4, 'Home'), 0);
  assert.equal(nodeStep(2, 4, 'End'), 3);
  assert.equal(nodeStep(-1, 0, 'ArrowDown'), -1);
});

test('dialog tab wrap stays inside the last opened dialog', () => {
  assert.equal(focusWrap(0, 3, true), 2);
  assert.equal(focusWrap(2, 3, false), 0);
  assert.equal(focusWrap(-1, 3, false), 0);
  assert.equal(focusWrap(-1, 3, true), 2);
  assert.equal(focusWrap(0, 0, false), -1);
});

test('390 touch-target predicate catches undersized controls', () => {
  assert.equal(isSmallTarget(43, 44), true);
  assert.equal(isSmallTarget(44, 44), false);
  assert.equal(isSmallTarget(100, 43), true);
});

test('adapter covers every target screen without editing original views', () => {
  const adapter = read('public/v41/view-a11y.mjs');
  const shell = read('public/v41/shell.mjs');
  const community = read('public/v41/community-panel.mjs');
  assert.match(adapter, /button\[data-book-id\]/);
  assert.match(adapter, /prevEdge,#nextEdge/);
  assert.match(adapter, /#mediaFilter/);
  assert.match(adapter, /#cardLayer article\.card/);
  assert.match(adapter, /#stage\[aria-label\]/);
  assert.match(adapter, /ArrowRight/);
  assert.match(adapter, /focusWrap|focusables\(el\)/);
  assert.match(shell, /applyViewAccessibility/);
  assert.match(shell, /connectionLabel/);
  assert.match(community, /showModal/);
});

// 2026-11-09 로컬3: 첫 화면 카드는 aria-label로 화면 글자(날짜·제목·감정)를 덮지 않는다.
test('첫 화면 카드 이름은 화면에 보이는 글자를 그대로 쓴다', () => {
  const orbit = read('src/views/orbit.js');
  assert.doesNotMatch(orbit, /b\.setAttribute\('aria-label'/);
  assert.match(orbit, /<div class="memoKicker">\$\{esc\(dateOf\(c\)\)\}<\/div><div class="memoText">\$\{esc\(mainOf\(c\)\)\}<\/div>/);
});

// A~D(상세 패널 Esc·대화상자 Tab 순환·계정 메뉴 Esc·보관 목록 Esc)는 2026-11-09에
// 소스 글자에서 함수 직접 호출로 옮겼다.
//  · A → tests/v41-view-a11y-flow.test.mjs (applyViewAccessibility에 keydown을 실제로 보낸다)
//  · B·C·D → tests/v41-shell-dialogs.test.mjs (trapShellTab·closeAccountMenu·focusReturnTarget 호출)
