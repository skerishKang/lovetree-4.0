// #428: 숨은 다음 화면 iframe(#view-next)은 초점을 받지 않게 둔다 — 소스 계약.
// 배경: 숨은 프레임이 불러오는 동안 접근성 도구·autofocus가 그 안으로 초점을 옮기면
// 크로미움이 .app(overflow:hidden)을 몰래 굴려 머리가 밀려났다(#420 참고).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const screens = read('public/v41/shell/screens.mjs');
const treeTitle = read('public/v41/views/tree-title.mjs');
const a11y = read('public/v41/view-a11y.mjs');

test('숨은 프레임은 inert·aria-hidden·tabindex=-1로 두고, 보여 줄 때(revealFrame)만 푼다', () => {
  // 한 벌 가드 함수: inert(가능하면) + aria-hidden + tabindex를 함께 건다/푼다.
  assert.match(screens, /function setFrameFocusGuard\(frame, on\) \{/);
  assert.match(screens, /try \{ frame\.inert = on; \} catch \{ \/\* 오래된 브라우저: 속성만으로 둔다 \*\/ \}/);
  assert.match(screens, /frame\.setAttribute\('inert', ''\);/);
  assert.match(screens, /frame\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(screens, /frame\.setAttribute\('tabindex', '-1'\);/);
  // 모듈이 열릴 때 숨은 장(#view-next)부터 막는다.
  assert.match(screens, /setFrameFocusGuard\(\$\('view-next'\), true\)/);
  // 뒤에서 불러오는 동안 막고, revealFrame에서 새 장은 풀고 가려지는 장은 막는다.
  assert.match(screens, /\/\/ #428: 뒤에서 불러오는 동안 이 장은 초점을 받지 않는다\.\n    setFrameFocusGuard\(next, true\);/);
  assert.match(screens, /\/\/ #428: 보여 주는 순간에만 초점 이동을 허용한다 — 새 장은 풀고, 가려지는 장은 막는다\.\n    setFrameFocusGuard\(next, false\);/);
  assert.match(screens, /setFrameFocusGuard\(active, true\);/);
});

test('about:blank 빈 화면 판정(#219·#415)은 그대로고, 그 자리가 곧바로 보일 때는 가드를 푼다', () => {
  // #415: 아무 화면도 없으면(첫 진입) blank 판정으로 한 장에 바로 그린다 — 규칙 유지.
  assert.match(screens, /let blank = true;\n    try \{ blank = active\.contentWindow\.location\.href === 'about:blank'; \} catch \{ blank = false; \}/);
  assert.match(screens, /\/\/ #428: 이 자리는 곧바로 보이는 장이므로 초점 가드를 푼다\(이전 hideFrames에서 막혔을 수 있다\)\.\n      setFrameFocusGuard\(active, false\);/);
  // 숨길 때도 막아 둔다(about:blank로 비운 뒤에도 초점을 받지 않는다).
  assert.match(screens, /f\.hidden = true;\n      setFrameFocusGuard\(f, true\);/);
});

test('#420의 임시 가드(.app 굴림 0 복귀)는 걷어졌다', () => {
  assert.doesNotMatch(treeTitle, /app\.addEventListener\('scroll'/);
  assert.doesNotMatch(treeTitle, /app\.scrollTo\(0, 0\)/);
  assert.match(treeTitle, /#420의 '\.app 굴림 0 복귀' 임시 가드는 #428에서 숨은 프레임을 inert로 막으면서 걷어냈다/);
});

test('상세 Esc 위임은 열린 트리 제목 메뉴에 양보한다(등록 순서 의존 제거)', () => {
  // 메뉴가 열려 있으면 상세 닫기를 건드리지 않는다 — 메뉴의 캡처 Esc가 맨 위 겹이다.
  assert.match(a11y, /const menu = doc\.getElementById\('treeMenuPanel'\);\n    if \(menu && !menu\.hidden\) return;/);
  // 메뉴 쪽 캡처 Esc는 그대로다(닫기 전에 단추로 초점을 옮긴다).
  assert.match(treeTitle, /if \(e\.key === 'Escape' && !menu\.hidden\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); trigger\.focus\(\); close\(\); return; \}/);
});
