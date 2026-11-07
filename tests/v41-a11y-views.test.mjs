import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {connectionLabel, filterLabel, isSmallTarget, nodeStep, focusWrap, focusReturnTarget} from '../public/v41/view-a11y.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('connection control name includes its visible count', () => {
  assert.equal(connectionLabel(4), '연결 보기 4');
  assert.equal(connectionLabel('7'), '연결 보기 7');
  assert.equal(connectionLabel(undefined), '연결 보기 0');
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

test('A: 상세 패널 Esc는 같은 닫기 버튼 경로로 닫는다', () => {
  const adapter = read('public/v41/view-a11y.mjs');
  assert.match(adapter, /event\.key !== 'Escape'/);
  assert.match(adapter, /current\.el\.id !== 'detail'/);
  assert.match(adapter, /querySelector\('\.close'\)/);
  assert.match(adapter, /close\.click\(\)/);
});

test('B: 편집기·보관 목록 Tab은 대화상자 안에서 순환한다', () => {
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /trapShellTab/);
  assert.match(shell, /assets\?\.open\?assets:editor\?\.open\?editor:null/);
  assert.match(shell, /SHELL_FOCUSABLE/);
  assert.match(shell, /shiftKey/);
  assert.equal(focusWrap(0, 3, true), 2);
  assert.equal(focusWrap(2, 3, false), 0);
});

test('C: 계정 메뉴 Esc는 계정 동그라미로 돌아간다', () => {
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /if\(e\.key!=='Escape'\)return;/);
  assert.match(shell, /closeAccountMenu\(\);\$\('account-avatar'\)\.focus\(\)/);
});

test('D: 보관 목록 Esc는 연 버튼(없으면 계정 동그라미)으로 돌아간다', () => {
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /assetsOpener=opener/);
  assert.match(shell, /addEventListener\('cancel'/);
  assert.match(shell, /focusReturnTarget\(assetsOpener,\$\('account-avatar'\)\)/);
  const opener = {isConnected: true, getClientRects: () => [{}]};
  const fallback = {};
  assert.equal(focusReturnTarget(opener, fallback), opener);
  assert.equal(focusReturnTarget({isConnected: false, getClientRects: () => [{}]}, fallback), fallback);
  assert.equal(focusReturnTarget({isConnected: true, getClientRects: () => []}, fallback), fallback);
});
