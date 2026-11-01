import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const orbitJS = readFileSync(join(root, 'src/views/orbit.js'), 'utf8');
const homeJS = readFileSync(join(root, 'v41/home.js'), 'utf8');

// 2026-11-02 대표 지시: 768px 이하에서 읽는 글자(버튼 문구·목록·본문·안내)는
// 14px 이상, 순수 장식 라벨은 12px 이상까지 허용. SRC064 원본과 1440 화면은
// 바꾸지 않는다 — 두 소스 레이어(orbit extraCSS, v41/home.js 마지막 스타일)의
// 768px 이하 블록만으로 근거를 고정한다.

test('orbit extraCSS는 768px 이하 블록에서 장식 마크를 12px로 올린다', () => {
  assert.match(orbitJS, /@media\(max-width:768px\)\{\.brand\{font-size:12px\}/);
  assert.match(orbitJS, /\.firstMark\{font-size:12px\}/);
  assert.match(orbitJS, /\.card\.memo \.memoKicker\{font-size:12px\}/);
  assert.match(orbitJS, /\.card\.memo \.memoFoot\{font-size:12px\}/);
  assert.match(orbitJS, /\.card \.caption\{font-size:12px\}/);
  assert.match(orbitJS, /\.card\.link \.surface:after\{font-size:12px\}/);
  // 650px 블록의 9px brand 선언이 남아 있어도, 768px 블록이 그 뒤에서 이겨야 한다(순서 계약).
  const lateBrand = orbitJS.lastIndexOf('.brand{font-size:9px');
  const block = orbitJS.indexOf('@media(max-width:768px)');
  assert.ok(block > -1, '768px 이하 블록이 extraCSS에 없다');
  if (lateBrand > -1) assert.ok(lateBrand < block, '650px 블록의 9px brand가 768px 블록보다 나중에 와서 다시 이기면 안 된다');
});

test('v41/home.js의 마지막 스타일 레이어가 768px 이하에서 읽는 글자를 14px로 고정한다', () => {
  // mobileFit이 마지막에 append되므로, 650px 한정이 아니라 768px 이하 전체여야 하고
  // menuBtn·hint·center-note는 이 레이어의 13px·11px·12px 값이 다시 이기면 안 된다.
  assert.match(homeJS, /@media\(max-width:768px\)\{\.topbar\{[^}]*\}\.top-actions\{[^}]*\}\.topbar \.menuBtn\{white-space:nowrap;padding:10px 9px;font-size:14px\}\.actions \.subtleBtn\{font-size:14px\}\.center \.center-note\{font-size:14px\}\.hint\{font-size:14px\}\}/);
  assert.doesNotMatch(homeJS, /\.menuBtn\{[^}]*font-size:13px\}/, 'menuBtn 13px은 읽는 글자 기준을 넘는다');
  assert.doesNotMatch(homeJS, /\.hint\{font-size:11px\}/, 'hint 11px은 읽는 글자 기준을 넘는다');
});

test('orbit extraCSS의 읽는 글자도 768px 이하에서 14px로 올라간다', () => {
  const block = orbitJS.slice(orbitJS.indexOf('@media(max-width:768px)'));
  assert.match(block, /\.menuBtn\{font-size:14px\}/);
  assert.match(block, /\.subtleBtn\{font-size:14px\}/);
  assert.match(block, /\.hint\{font-size:14px\}/);
  assert.match(block, /\.center \.center-note\{font-size:14px\}/);
});
