import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// 운영센터 의견 #42·#43·#44(#896·#897·#898) — 작은 수리 세 가지를 글자로 고정한다.
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const shelfCss = read('public/v41/views/shelf/shelf.css');
const bookCss = read('public/v41/views/book/book.css');
const panels = read('public/v41/shell/panels.mjs');
const shell = read('public/v41/shell.mjs');
const home = read('v41/home.js');
const orbit = read('src/views/orbit.js');

test('#897 책 갈림길 탭: 책 안쪽 오른쪽 가장자리에 붙인다(밖으로 삐져나오지 않는다)', () => {
  const rule = bookCss.match(/\.branch-tab\{[^}]*\}/)?.[0] || '';
  assert.match(rule, /right:0/, '탭은 책 판 오른쪽 가장자리 안에 붙는다');
  assert.doesNotMatch(rule, /right:-\d+px/, '책 밖으로 삐져나오던 옛 자리는 뺐다');
  assert.match(rule, /border-radius:10px 0 0 10px/, '안쪽 가장자리에 붙은 탭 모양(왼쪽만 둥글게)');
  assert.match(rule, /bottom:44px/, '본문과 겹치지 않게 페이지 아래 줄 자리(오른쪽 쪽수 위)');
  assert.doesNotMatch(rule, /border-left:0/, '왼쪽 테두리를 다시 둔다');
  // 390(휴대폰)은 페이지 아래 줄 — 지금처럼 유지한다.
  const phone = bookCss.match(/html\[data-book-shape=phone\] \.branch-tab\{[^}]*\}/)?.[0] || '';
  assert.match(phone, /bottom:44px/, '휴대폰에서는 아래 줄 자리 그대로');
});

test('#898 ① 자세한 추가 창은 맨 위부터 연다(다듬기로 넘어와도 스크롤이 중간에 남지 않는다)', () => {
  const openEditor = panels.slice(panels.indexOf('function openEditor'), panels.indexOf('function treeCoverMode'));
  assert.match(openEditor, /panel\('write-panel'\);[\s\S]*?\$\('write-panel'\)\.scrollTop = 0;/,
    '편집기를 열 때 창 스크롤을 0으로 되돌린다');
});

test('#942 알림이 가운데 단추까지 덮지 않게 가운데 묶음에 표식을 건다', () => {
  assert.match(orbit, /<div class="center" data-lt-keep-clear>/, '가운데 단추·숫자판 묶음 전체가 알림 피하기 기준');
});
