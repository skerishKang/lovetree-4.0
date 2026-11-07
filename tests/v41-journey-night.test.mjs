import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('public/v41/views/first-journey.html');
const css = read('public/v41/identity.css');

// 2026-11-08 밤(A) 첫 여정: 첫 화면과 같은 무채색. 정원 블록(#194)은 아래 그대로 둔다.
const styleStart = html.indexOf('<style>');
const gardenStart = html.indexOf('/* 정원 테마(2단계)');
const night = html.slice(styleStart, gardenStart);
const garden = html.slice(gardenStart, html.indexOf('</style>'));

function block(source, selector) {
  const start = source.indexOf(`${selector}{`);
  assert.ok(start >= 0, `${selector} 규칙이 있어야 한다`);
  return source.slice(start, source.indexOf('}', start) + 1);
}

function token(name) {
  const match = css.match(new RegExp(`${name}:(#[0-9a-fA-F]{6})`));
  assert.ok(match, `--${name} 토큰이 있어야 한다`);
  return match[1].toLowerCase();
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
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('밤 첫 여정에는 장미 토큰이 없고 강조 줄·작은 머리글은 보조 글자색이다', () => {
  assert.equal(night.includes('--lt-rose'), false, '밤 규칙에 --lt-rose가 없다');
  assert.match(block(night, 'h1 em'), /color:var\(--lt-muted\)/);
  assert.match(block(night, '.eyebrow'), /color:var\(--lt-muted\)/);
  assert.match(block(night, '.moment-card .kicker'), /color:var\(--lt-muted\)/);
  assert.match(block(night, '.error'), /color:var\(--lt-pearl\)/);
});

test('주 버튼은 첫 화면 1차 버튼과 같은 토큰·알약·44px 모양이다', () => {
  const primary = block(night, 'html:not([data-lt-theme=garden]) .primary');
  assert.match(primary, /min-height:44px/);
  assert.match(primary, /padding:10px 12px/);
  assert.match(primary, /border:1px solid var\(--lt-primary\)/);
  assert.match(primary, /border-radius:var\(--lt-r-pill\)/);
  assert.match(primary, /background:var\(--lt-primary\)/);
  assert.match(primary, /color:var\(--lt-primary-ink\)/);
  assert.match(primary, /font-size:14px/);
  assert.match(primary, /font-weight:400/);
  assert.match(primary, /letter-spacing:\.02em/);
  assert.match(block(night, 'html:not([data-lt-theme=garden]) .primary:hover'), /background:var\(--lt-pearl\)/);
  const base = block(night, '.primary');
  assert.match(base, /background:var\(--lt-primary\)/);
  assert.match(base, /color:var\(--lt-primary-ink\)/);
  assert.match(base, /min-height:48px;padding:12px 22px/);
  assert.match(base, /font-size:15px;font-weight:650/, '정원이 물려받는 기본 모양은 그대로다');
});

test('보조 버튼은 첫 화면 보조 버튼처럼 어두운 유리·옅은 테두리 알약이다', () => {
  const ghost = block(night, 'html:not([data-lt-theme=garden]) .ghost');
  assert.match(ghost, /min-height:44px/);
  assert.match(ghost, /padding:10px 12px/);
  assert.match(ghost, /border-radius:var\(--lt-r-pill\)/);
  assert.match(ghost, /border:1px solid color-mix\(in srgb,var\(--lt-pearl\) 16%,transparent\)/);
  assert.match(ghost, /background:color-mix\(in srgb,var\(--lt-stage-2\) 30%,transparent\)/);
  assert.match(ghost, /color:var\(--lt-pearl\)/);
  assert.match(ghost, /font-size:14px/);
  assert.match(block(night, 'html:not([data-lt-theme=garden]) .ghost:hover'), /var\(--lt-pearl\) 44%/);
});

test('정원 블록은 #194의 장미 강조·정원 1차 버튼을 그대로 유지한다', () => {
  assert.match(garden, /html\[data-lt-theme=garden\] h1 em,html\[data-lt-theme=garden\] \.eyebrow,html\[data-lt-theme=garden\] \.moment-card \.kicker\{color:var\(--lt-rose-ink\)\}/);
  assert.match(garden, /html\[data-lt-theme=garden\] \.primary\{background:var\(--lt-primary\);color:var\(--lt-primary-ink\)\}/);
  assert.match(garden, /html\[data-lt-theme=garden\] \.primary:hover\{background:var\(--lt-gold-deep\)/);
  assert.equal(garden.includes('html:not([data-lt-theme=garden])'), false, '정원 블록에 밤 선택자가 섞이지 않는다');
});

test('밤 첫 여정 글자 대비는 4.5:1 이상이다', () => {
  const pairs = [
    ['--lt-pearl', '--lt-stage'],
    ['--lt-pearl', '--lt-stage-2'],
    ['--lt-muted', '--lt-stage'],
    ['--lt-muted', '--lt-stage-2'],
    ['--lt-gold', '--lt-stage'],
    ['--lt-primary-ink', '--lt-primary'],
    ['--lt-primary-ink', '--lt-pearl'],
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrast(token(fg), token(bg));
    assert.ok(ratio >= 4.5, `${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
  }
});
