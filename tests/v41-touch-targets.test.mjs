import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// 2026-11-08 접근성: 44px 미만 터치 타깃을 ::after 히트박스로 넓힌다(보이는 모양은 그대로).
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const TARGETS = {
  // #886 책 단계: track59-sketchbook.html의 터치 타깃 CSS가 book-extra.css로 이동해 이 소스 파싱 단정은 깨졌다.
  // 실제 렌더링 히트박스 검사는 tests/v41-book-single-537.test.mjs의 '책 조작 버튼 히트박스는 44x44 이상이다(렌더링 ::after 터치 영역)'가 맡는다.
  // #886 항목3: track58-pinboard.html의 터치 타깃 CSS가 board-extra.css로 이동해 이 소스 파싱 단정은 깨졌다.
  // 하드코딩 크기가 실제와도 어긋나(#detailYtLink 실제 24px를 34px로 가정) 거짓 통과를 내던 참이라 지운다.
  // 실제 렌더링 히트박스 검사는 tests/v41-board-pinboard-582.test.mjs의 '조작 버튼 히트박스는 44x44 이상이다(렌더링 ::after 터치 영역)'가 맡는다.
  'public/v41/views/track56-network.html': {
    '#focusFirst': [194, 35], '#zoomIn': [94, 35], '#zoomOut': [94, 35], '#resetFocus': [194, 35],
    '#openMoment': [140, 43], '#detailClose': [32, 32],
  },
};

const styleBlock = html => {
  const match = html.match(/<style id="lt-touch-targets">([\s\S]*?)<\/style>/);
  assert.ok(match, 'lt-touch-targets 스타일 블록이 있어야 한다');
  return match[1];
};
const rules = css => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({sel: m[1], body: m[2]}));
const insetOf = body => {
  const match = body.match(/inset:([^;}]+)/);
  if (!match) return null;
  const [t, r = t, b = t, l = r] = match[1].trim().split(/\s+/).map(value => parseFloat(value));
  return {t, r, b, l};
};

for (const [file, targets] of Object.entries(TARGETS)) {
  test(`${file.split('/').pop()} 조작 버튼 히트박스는 44x44 이상이다`, () => {
    const css = styleBlock(read(file));
    const list = rules(css);
    for (const [selector, [width, height]] of Object.entries(targets)) {
      const rule = list.find(item => item.sel.includes(selector) && item.body.includes('inset'));
      assert.ok(rule, `${selector}에 inset 히트박스 규칙이 있어야 한다`);
      const inset = insetOf(rule.body);
      assert.ok(inset, `${selector}의 inset 값을 읽을 수 있어야 한다`);
      const hitWidth = width - inset.l - inset.r;
      const hitHeight = height - inset.t - inset.b;
      assert.ok(hitWidth >= 44 && hitHeight >= 44, `${selector} 히트박스 ${hitWidth}x${hitHeight}가 44 미만이다`);
    }
  });
}

test('첫 화면 건너뛰기는 44px 이상이다', () => {
  const css = read('public/v41/shell.css');
  const rule = css.split('}').find(block => block.includes('.skip{'));
  assert.ok(rule, '.skip 규칙이 있어야 한다');
  assert.match(rule, /min-height:44px/);
  assert.match(rule, /display:inline-flex/);
});

test('첫 화면 카드 출처 안내는 live region이다', () => {
  const home = read('v41/home.js');
  assert.match(home, /center-note'\)\?\.setAttribute\('aria-live','polite'\)/);
  assert.match(home, /center-note'\)\?\.setAttribute\('role','status'\)/);
});
