import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// #319: 정원 테마 색 대비 3곳. 새 hex 없이 기존 토큰만 쓴다 —
// #context-kind는 --lt-rose-ink, 책장 흐린 글자는 --lt-muted. 밤은 규칙을 적용하지 않아 그대로다.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const identity = read('public/v41/identity.css');
const shellCss = read('public/v41/shell.css');
const shelfCss = read('public/v41/views/shelf/shelf.css');

function gardenToken(name) {
  const start = identity.indexOf('html[data-lt-theme=garden]{');
  const block = identity.slice(start, identity.indexOf('}', start));
  const match = block.match(new RegExp(name + ':(#[0-9a-fA-F]{6})'));
  return match ? match[1].toLowerCase() : '';
}

function luminance(hex) {
  const channel = value => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('정원 색 대비 3곳이 기존 토큰으로 4.5:1을 넘는다 (#319)', () => {
  const roseInk = gardenToken('--lt-rose-ink');
  const muted = gardenToken('--lt-muted');
  assert.equal(roseInk, '#98505e', '정원 --lt-rose-ink 값이 그대로여야 한다');
  assert.equal(muted, '#6f605a', '정원 --lt-muted 값이 그대로여야 한다');
  // 배경은 2026-11-09 axe 실측값(맥락 표시=--lt-stage-2, 소개 문단·결과 수=카드·책장 실측 배경).
  const rows = [
    ['#context-kind', roseInk, '#fbf8f1', 5.43],
    ['.hero-copy p', muted, '#fefaf5', 5.78],
    ['#resultCount/.count', muted, '#f7f0e8', 5.31]
  ];
  for (const [label, fg, bg, expected] of rows) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, `${label} ${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
    assert.ok(Math.abs(ratio - expected) < 0.02, `${label} 기대 ${expected}:1, 실측 ${ratio.toFixed(2)}:1`);
  }
  // 고치기 전 값이 기준 미달이었음을 함께 고정한다(수정 근거).
  assert.ok(contrast('#c86e79', '#fbf8f1') < 4.5);
  assert.ok(contrast('#8d7d77', '#fefaf5') < 4.5);
  assert.ok(contrast('#8d7d77', '#f7f0e8') < 4.5);
});

test('셸 맥락 표시는 정원에서만 --lt-rose-ink를 쓴다 — 밤은 --rose 그대로', () => {
  assert.match(shellCss, /#context-kind\{font-size:10px;color:var\(--rose\);white-space:nowrap\}/, '밤 기본 규칙은 그대로다');
  assert.match(shellCss, /html\[data-lt-theme=garden\] #context-kind\{color:var\(--lt-rose-ink\)\}/, '정원만 진한 장미로 바꾼다');
  const rule = shellCss.match(/html\[data-lt-theme=garden\] #context-kind\{[^}]*\}/)[0];
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(rule), false, '새 hex 색을 쓰지 않는다');
});

// 이슈 644: 대비 3가지 중 두 가지를 토큰 수치로 고정한다.
// (b) 보드 머리줄 트리 이름 — 정원의 밝은 머리줄 위 잉크색. 밤은 어두운 머리줄 위 연분홍(#e8deee)으로 이미 충분하다.
// (c) '서버에 저장됐어요' 토스트 — 밤·정원 모두 어두운 판(rgba(7,7,12,.94)) 위 글자. 정원에서 --lt-pearl은 어두운 잉크라 미달이므로 --lt-paper를 쓴다.
function blend(fgHex, alpha, bgHex) {
  const hex = n => Number.parseInt(n, 16);
  const f = [1, 3, 5].map(i => hex(fgHex.slice(i, i + 2)));
  const b = [1, 3, 5].map(i => hex(bgHex.slice(i, i + 2)));
  return '#' + f.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]).toString(16).padStart(2, '0')).join('');
}

test('이슈 644: 정원 보드 트리 이름(--lt-ink)은 머리줄 배경에서 4.5:1을 넘는다', () => {
  const ink = gardenToken('--lt-ink');
  const stage = gardenToken('--lt-stage');
  const edge = gardenToken('--lt-garden-edge');
  assert.equal(ink, '#403536');
  // 머리줄 배경: rgba(255,253,248,.58)이 정원 무대 가장자리(#eee3d5=garden-edge) 위까지 덮는다 — 가장 어두운 조합이 최악의 case다.
  const worst = blend('fffdf8', 0.58, edge);
  const ratio = contrast(ink, worst);
  assert.ok(ratio >= 4.5, `정원 트리 이름 ${ink} on ${worst} = ${ratio.toFixed(2)}:1`);
  // 고치기 전 값(밤의 연분홍 #e8deee)은 같은 바탕에서 미달이었다 — 수정 근거.
  assert.ok(contrast('#e8deee', worst) < 4.5, `이전 값 #e8deee on ${worst} = ${contrast('#e8deee', worst).toFixed(2)}:1 (미달)`);
  assert.ok(contrast(ink, stage) >= 4.5);
});

test('이슈 644: 토스트 글자는 밤·정원 모두 어두운 판 위에서 4.5:1을 넘는다', () => {
  // 토스트 판 rgba(7,7,12,.94)는 밤 무대(#040407)·정원 무대(#f7f0e8) 위에서 각각 섞인다.
  const nightBg = blend('07070c', 0.94, '#040407');
  const gardenBg = blend('07070c', 0.94, gardenToken('--lt-stage'));
  const night = contrast('#f5f1e9', nightBg);
  const garden = contrast(gardenToken('--lt-paper'), gardenBg);
  assert.ok(night >= 4.5, `밤 토스트 = ${night.toFixed(2)}:1 (on ${nightBg})`);
  assert.ok(garden >= 4.5, `정원 토스트 = ${garden.toFixed(2)}:1 (on ${gardenBg})`);
  // 고치기 전 값(정원 --lt-pearl #403536)은 미달이었다 — 수정 근거.
  assert.ok(contrast('#403536', gardenBg) < 4.5, `이전 값 = ${contrast('#403536', gardenBg).toFixed(2)}:1 (미달)`);
});

test('책장 --muted는 정원에서만 --lt-muted로 바뀐다 — :root 값은 그대로(밤 변화 0)', () => {
  assert.match(shelfCss, /:root \{[^}]*--muted: #8d7d77;/, ':root 기본값은 그대로다');
  assert.match(shelfCss, /html\[data-lt-theme=garden\] \{ --muted: var\(--lt-muted\); \}/, '정원만 토큰으로 덮는다');
  const rule = shelfCss.match(/html\[data-lt-theme=garden\] \{ --muted: var\(--lt-muted\); \}/)[0];
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(rule), false, '새 hex 색을 쓰지 않는다');
});
