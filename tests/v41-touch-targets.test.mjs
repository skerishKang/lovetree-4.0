import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// 2026-11-08 접근성: 44px 미만 터치 타깃을 ::after 히트박스로 넓힌다(보이는 모양은 그대로).
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const TARGETS = {
  'public/v41/views/track59-sketchbook.html': {
    '#prevBtn': [34, 30], '#nextBtn': [34, 30], '#detailClose': [34, 34], '#viewerClose': [34, 34],
    '#openViewerBtn': [85, 37], '#detailIndexBtn': [113, 37], '#linkCancel': [47, 32],
    '#linkSave': [123, 32], '#branchClose': [54, 37],
  },
  'public/v41/views/track58-pinboard.html': {
    '#minusBtn': [35, 38], '#plusBtn': [41, 38], '#resetBtn': [99, 38], '#openMoment': [63, 34],
    '#nextMoment': [85, 34], '#cinemaFromMoment': [125, 34], '#startPathHere': [116, 34],
    '#pathModeBtn': [184, 34], '#toolCinema': [184, 34], '#toolFit': [184, 34], '#detailClose': [23, 23],
  },
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

test('기억책 감정 선택은 최소 높이 44px를 직접 보장한다', () => {
  const css = styleBlock(read('public/v41/views/track59-sketchbook.html'));
  const rule = rules(css).find(item => item.sel.includes('#linkEmotion'));
  assert.ok(rule && /min-height:44px/.test(rule.body), '#linkEmotion은 min-height:44px');
});

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
