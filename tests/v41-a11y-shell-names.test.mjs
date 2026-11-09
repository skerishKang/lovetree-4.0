import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('public/v41/index.html');
const theme = read('public/v41/shell/theme.mjs');

// 2026-11-09 로컬3 접근성 점검: axe serious(`label-content-name-mismatch`·`aria-allowed-attr`) 수정을 고정한다.
test('브랜드 이름은 화면에 보이는 글자(LoveTree4.1)를 그대로 포함한다', () => {
  assert.match(html, /<a class="brand" href="#home" aria-label="LoveTree4\.1 첫 화면"><span class="brand-word">LoveTree<small>4\.1<\/small><\/span><\/a>/);
});

test('트리 고르기 단추는 aria-label로 화면 글자를 덮지 않는다(보이는 "트리: …"가 이름)', () => {
  assert.match(html, /<button class="source" id="record-menu" type="button" aria-haspopup="dialog"><span id="source-label">/);
  assert.doesNotMatch(html, /id="record-menu"[^>]*aria-label=/);
});

test('계정 메뉴의 테마 항목은 menuitemcheckbox와 aria-checked를 쓴다', () => {
  assert.match(html, /role="menuitemcheckbox" id="account-theme" data-lt-theme-toggle aria-checked="false"/);
  assert.doesNotMatch(html, /id="account-theme"[^>]*aria-pressed=/);
  assert.match(theme, /setAttribute\('aria-checked', String\(themePressed\(theme\)\)\)/);
  assert.doesNotMatch(theme, /setAttribute\('aria-pressed'/);
});
